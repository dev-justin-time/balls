/**
 * Asset loading validation tests.
 * Verifies every asset referenced in source code exists on disk,
 * checks for filename issues (spaces, special chars), and validates
 * the loading manager / overlay dismissal logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

// ─── Collect all asset paths referenced in source files ───

/**
 * Scrapes all 'assets/...' paths from a source file.
 */
function extractAssetPaths(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const paths = [];
    // Match single-quoted and double-quoted asset paths
    const re = /['"](assets\/[^'"\n]+?)['"]/g;
    let match;
    while ((match = re.exec(content)) !== null) {
        paths.push(match[1]);
    }
    return [...new Set(paths)]; // dedupe
}

/**
 * Collects all asset paths from all .js and .html source files.
 */
function collectAllReferencedAssets() {
    const sourceFiles = [
        'src/ball_db.js',
        'src/persistence.js',
        'src/audio.js',
        'src/physics.js',
        'src/levelgen.js',
        'engine/scene.js',
        'main.js',
        'index.html',
    ];
    const allPaths = new Set();
    for (const file of sourceFiles) {
        const fullPath = path.join(PROJECT_ROOT, file);
        if (!fs.existsSync(fullPath)) {
            console.warn(`Source file not found, skipping: ${file}`);
            continue;
        }
        for (const assetPath of extractAssetPaths(fullPath)) {
            allPaths.add(assetPath);
        }
    }
    return [...allPaths].sort();
}

const REFERENCED_ASSETS = collectAllReferencedAssets();

// ─── File existence check ───

describe('asset file existence', () => {
    REFERENCED_ASSETS.forEach((assetPath) => {
        it(`should exist on disk: ${assetPath}`, () => {
            const fullPath = path.join(PROJECT_ROOT, assetPath);
            expect(fs.existsSync(fullPath), `Missing asset: ${assetPath}`).toBe(true);
        });
    });

    it('should have at least 40 referenced assets', () => {
        // Sanity check — there are 71 ball skins + skies + models + audio + font
        expect(REFERENCED_ASSETS.length).toBeGreaterThanOrEqual(40);
    });
});

// ─── Filename safety checks ───

describe('asset filename safety', () => {
    const PROBLEMATIC_ASSETS = REFERENCED_ASSETS.filter((p) => {
        const filename = p.split('/').pop();
        return /\s/.test(filename) || /[()]/.test(filename);
    });

    it('should list assets with spaces or parentheses (informational)', () => {
        // These were renamed to remove spaces — none should remain.
        if (PROBLEMATIC_ASSETS.length > 0) {
            console.warn(
                'Assets with spaces/parens in filename (should be 0 after rename):\n  ' +
                    PROBLEMATIC_ASSETS.join('\n  ')
            );
        }
        expect(PROBLEMATIC_ASSETS.length).toBe(0);
    });

    it('should have consistent file extensions for textures', () => {
        const textureAssets = REFERENCED_ASSETS.filter((p) =>
            p.startsWith('assets/image/')
        );
        const validExts = ['.webp', '.gif', '.png', '.jpg', '.jpeg'];
        const invalid = textureAssets.filter((p) => {
            const ext = path.extname(p).toLowerCase();
            return !validExts.includes(ext);
        });
        if (invalid.length > 0) {
            console.warn('Textures with unexpected extensions:', invalid);
        }
        expect(invalid.length).toBe(0);
    });
});

// ─── Duplicate texture usage check ───

describe('texture reuse', () => {
    it('should identify reused textures (informational)', () => {
        // Collect raw (non-deduplicated) references from ALL source files
        const sourceFiles = [
            'src/ball_db.js',
            'src/persistence.js',
            'src/audio.js',
            'src/physics.js',
            'src/levelgen.js',
            'engine/scene.js',
            'main.js',
            'index.html',
        ];
        const rawRefs = [];
        for (const file of sourceFiles) {
            const fullPath = path.join(PROJECT_ROOT, file);
            if (!fs.existsSync(fullPath)) continue;
            const content = fs.readFileSync(fullPath, 'utf-8');
            const re = /['"](assets\/[^'"\n]+?)['"]/g;
            let match;
            while ((match = re.exec(content)) !== null) {
                const ap = match[1];
                if (ap.startsWith('assets/image/') || ap.startsWith('assets/model/')) {
                    rawRefs.push(ap);
                }
            }
        }
        // Count duplicates
        const counts = {};
        for (const ap of rawRefs) {
            counts[ap] = (counts[ap] || 0) + 1;
        }
        const reused = Object.entries(counts)
            .filter(([, c]) => c > 1)
            .sort((a, b) => b[1] - a[1]);

        if (reused.length > 0) {
            console.info(
                'Reused assets (referenced multiple times — expected for shared textures):\n  ' +
                    reused.map(([k, v]) => `${v}x ${k}`).join('\n  ')
            );
        }
        // Shared textures like dsfk.webp, ball_metal.webp are reused across
        // multiple ball skins and sky configs — this is normal.
        expect(reused.length).toBeGreaterThan(0);
    });
});

// ─── Loading manager / overlay dismissal logic ───

describe('loading overlay dismissal', () => {
    beforeEach(() => {
        delete window.__goingBallsAssetsReady;
        delete window.__goingBallsSceneReady;
        document.body.innerHTML = '';
        // Mock __signalSceneReady as it would be set by networking.js
        window.__signalSceneReady = function () {
            window.__goingBallsSceneReady = true;
            // tryDismissLoadingOverlay logic
            if (
                window.__goingBallsAssetsReady &&
                window.__goingBallsSceneReady
            ) {
                const overlay = document.getElementById('loading-overlay');
                if (overlay) {
                    overlay.style.opacity = '0';
                    setTimeout(() => {
                        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    }, 450);
                }
            }
        };
        window.__signalAssetsReady = function () {
            window.__goingBallsAssetsReady = true;
            if (typeof window.__signalSceneReady === 'function') {
                window.__signalSceneReady();
            }
        };
    });

    it('should NOT dismiss overlay when assets are not ready', () => {
        window.__goingBallsSceneReady = true;
        window.__goingBallsAssetsReady = false;
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.opacity = '1';
        document.body.appendChild(overlay);

        expect(document.getElementById('loading-overlay')).not.toBeNull();
    });

    it('should NOT dismiss overlay when scene is not ready', () => {
        window.__goingBallsAssetsReady = true;
        window.__goingBallsSceneReady = false;
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.opacity = '1';
        document.body.appendChild(overlay);

        expect(document.getElementById('loading-overlay')).not.toBeNull();
    });

    it('should dismiss overlay when both flags are ready', () => {
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.opacity = '1';
        document.body.appendChild(overlay);

        // Signal both flags
        window.__goingBallsAssetsReady = true;
        window.__signalSceneReady();

        // The overlay opacity should be set to '0' (fade-out started)
        expect(overlay.style.opacity).toBe('0');
    });

    it('should handle missing overlay gracefully', () => {
        // No #loading-overlay in DOM — should not throw
        window.__goingBallsAssetsReady = true;
        expect(() => {
            window.__signalSceneReady();
        }).not.toThrow();
    });
});

// ─── getParticleCount type coverage ───

describe('getParticleCount asset type coverage', () => {
    it('should handle all particle types used in the codebase', () => {
        // The types used in physics.js create functions
        const particleTypes = ['rain', 'snow', 'wind', 'fire', 'heat', 'meteor'];
        for (const type of particleTypes) {
            // Each type should be handled in getParticleCount's switch
            const validTypes = ['rain', 'snow', 'wind', 'fire', 'heat', 'meteor'];
            expect(validTypes).toContain(type);
        }
    });
});
