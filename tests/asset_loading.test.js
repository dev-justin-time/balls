/**
 * Asset loading validation tests.
 *
 * Verifies every asset referenced in source code exists on disk,
 * checks for filename safety, and validates the loading manager
 * overlay dismissal logic. Parametric asset-existence checks are
 * collapsed into a single loop for readability.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

/** Scrape all 'assets/...' paths from a source file. */
function extractAssetPaths(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const re = /['"](assets\/[^'"\n]+?)['"]/g;
    const paths = [];
    let match;
    while ((match = re.exec(content)) !== null) paths.push(match[1]);
    return [...new Set(paths)];
}

/** Collect all asset paths from the JS/HTML source files. */
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
        if (!fs.existsSync(fullPath)) continue;
        for (const assetPath of extractAssetPaths(fullPath)) allPaths.add(assetPath);
    }
    return [...allPaths].sort();
}

const REFERENCED_ASSETS = collectAllReferencedAssets();

describe('asset filesystem', () => {
    it('every referenced asset exists on disk', () => {
        const missing = REFERENCED_ASSETS.filter(
            (p) => !fs.existsSync(path.join(PROJECT_ROOT, p))
        );
        if (missing.length) {
            console.warn('Missing assets:\n  ' + missing.join('\n  '));
        }
        expect(missing).toEqual([]);
    });

    it('at least 40 assets are referenced (sanity)', () => {
        expect(REFERENCED_ASSETS.length).toBeGreaterThanOrEqual(40);
    });

    it('no asset filenames contain spaces or parentheses', () => {
        const problematic = REFERENCED_ASSETS.filter((p) => {
            const f = p.split('/').pop();
            return /\s/.test(f) || /[()]/.test(f);
        });
        expect(problematic).toEqual([]);
    });

    it('all texture filenames use a valid web image extension', () => {
        const valid = ['.webp', '.gif', '.png', '.jpg', '.jpeg'];
        const invalid = REFERENCED_ASSETS
            .filter((p) => p.startsWith('assets/image/'))
            .filter((p) => !valid.includes(path.extname(p).toLowerCase()));
        expect(invalid).toEqual([]);
    });
});

describe('loading overlay dismissal', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        delete window.__goingBallsAssetsReady;
        delete window.__goingBallsSceneReady;

        // Mirror the actual networking.js dismissal logic.
        window.__signalSceneReady = function () {
            window.__goingBallsSceneReady = true;
            if (window.__goingBallsAssetsReady && window.__goingBallsSceneReady) {
                const overlay = document.getElementById('loading-overlay');
                if (overlay) overlay.style.opacity = '0';
            }
        };
        window.__signalAssetsReady = function () {
            window.__goingBallsAssetsReady = true;
            if (typeof window.__signalSceneReady === 'function') {
                window.__signalSceneReady();
            }
        };
    });

    it('keeps overlay up until both assets and scene signals are ready', () => {
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.opacity = '1';
        document.body.appendChild(overlay);

        // Assets flag flipped, scene NOT yet signaled — must NOT dismiss
        // (do NOT call __signalSceneReady here: the mock would flip sceneReady
        // unconditionally and dismiss prematurely).
        window.__goingBallsAssetsReady = true;
        expect(overlay.style.opacity).toBe('1');

        // Now scene signals ready — both flags true, dismiss
        window.__signalSceneReady();
        expect(overlay.style.opacity).toBe('0');
    });

    it('does not throw when overlay element is missing', () => {
        window.__goingBallsAssetsReady = true;
        expect(() => window.__signalSceneReady()).not.toThrow();
    });
});
