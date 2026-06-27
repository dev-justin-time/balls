#!/usr/bin/env node
/**
 * =====================================================================
 * @domain:    build
 * @concern:   Vendor ESM deps under /vendor/ for offline / CDN-free deploy
 * @created:   2026-06-26
 * @track:     vendor-deps-cjs
 * @version:   1.0.0
 * @security:  Client-Side (no secrets)
 * =====================================================================
 *
 * Reads /node_modules/<pkg>/... and writes a copy tree under /vendor/
 * that mirrors the installed npm layout. Three.js is handled
 * selectively — only the addon files transitively reachable from the
 * project's imports of `three/addons/<X>` are copied. The other three
 * leaf packages (cannon-es, wasmoon, nipplejs) are copied whole since
 * they are small enough that fussy selective copying would buy little
 * while risking sub-import resolution breakpoints. /vendor/ must be
 * committed (NOT .gitignored) so static deploys work fully offline
 * without requiring `npm install` at runtime.
 *
 * Usage:
 *   node scripts/vendor-deps.cjs          # write (overwrites stale)
 *   node scripts/vendor-deps.cjs --check  # CI drift detection (exit 1)
 *   npm run vendor:deps                   # alias for write mode
 *   npm run check:vendor                  # alias for check mode
 *
 * Auto-runs as predev hook (before /scripts/sync-importmaps.cjs).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const NM = path.join(ROOT, 'node_modules');
const IMPORTMAP_PATH = path.join(ROOT, 'importmap.json');
const CHECK_MODE = process.argv.includes('--check');

const SOURCE_DIRS = ['src', 'engine', 'builderworkshop'];

// Walk all of these under / (skipping heavy / system dirs).
const SKIP_TOP_PARTS = new Set([
    'node_modules', 'vendor', 'dist', 'rust_core', 'python_server',
    'backups', '.git', '.vite', '.vite-temp', 'puter', 'docs'
]);

// Leaf packages: copy whichever subdirectory the package's ESM entry lives in.
// We mirror node_modules layout so internal relative imports keep working.
const LEAF_PKG_DIRS = [
    { pkg: 'cannon-es', subdir: 'dist' },
    { pkg: 'wasmoon',   subdir: 'dist' },
    { pkg: 'nipplejs',  subdir: 'src'  }   // module field points to src/index.js (ESM)
];

// Single-file leaves — just one entry file each (Three's addon subtree
// is handled separately by the BFS walker below).
const SINGLE_FILE_LEAVES = [
    { pkg: 'three', src: 'build/three.module.js', dest: 'build/three.module.js' }
];

// --- helpers ----------------------------------------------------------------

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function walkProjectTree(dir, onFile) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || SKIP_TOP_PARTS.has(entry.name)) continue;
            walkProjectTree(abs, onFile);
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
            onFile(abs);
        }
    }
}

/**
 * Recursively mirror src/ → dest/ if dest differs from src.
 * Returns 'missing' | 'drift' | 'ok' for the dir as a whole.
 */
function mirrorDir(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return 'missing';
    if (!fs.existsSync(destDir)) ensureDir(destDir);
    let status = 'ok';
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            const sub = mirrorDir(srcPath, destPath);
            if (sub === 'missing' || sub === 'drift') status = sub;
        } else if (entry.isFile()) {
            const srcBuf = fs.readFileSync(srcPath);
            let destBuf = null;
            if (fs.existsSync(destPath)) destBuf = fs.readFileSync(destPath);
            if (!destBuf || !destBuf.equals(srcBuf)) {
                if (CHECK_MODE) return 'drift';
                fs.writeFileSync(destPath, srcBuf);
                status = 'drift';
            }
        }
    }
    // Orphan cleanup: vendor entries with no source counterpart would
    // accumulate forever across npm upgrades (committed /vendor/ never
    // shrinks). In check mode we report them as drift without deleting.
    if (fs.existsSync(destDir)) {
        const srcNames = new Set(fs.readdirSync(srcDir).map(n => n));
        for (const entry of fs.readdirSync(destDir, { withFileTypes: true })) {
            if (srcNames.has(entry.name)) continue;
            const orphan = path.join(destDir, entry.name);
            if (CHECK_MODE) {
                console.error(`✗ orphan in vendor/: ${orphan}`);
                return 'drift';
            }
            if (entry.isDirectory()) fs.rmSync(orphan, { recursive: true, force: true });
            else fs.unlinkSync(orphan);
            status = 'drift';
        }
    }
    return status;
}


function mirrorFile(srcPath, destPath) {
    if (!fs.existsSync(srcPath)) return 'missing';
    const srcBuf = fs.readFileSync(srcPath);
    if (!fs.existsSync(destPath)) {
        if (CHECK_MODE) return 'drift';
        ensureDir(path.dirname(destPath));
        fs.writeFileSync(destPath, srcBuf);
        return 'drift';
    }
    const destBuf = fs.readFileSync(destPath);
    if (!destBuf.equals(srcBuf)) {
        if (CHECK_MODE) return 'drift';
        fs.writeFileSync(destPath, srcBuf);
        return 'drift';
    }
    return 'ok';
}

// --- three/addons BFS -------------------------------------------------------

const reAddonFrom = /from\s+['"](?:three\/addons\/)([^'"]+)['"]/g;
const reAddonImport = /import\s*\(\s*['"](?:three\/addons\/)([^'"]+)['"]\s*\)/g;

function collectAddonSeeds() {
    const seeds = new Set();
    function scan(file) {
        const c = fs.readFileSync(file, 'utf8');
        let m;
        reAddonFrom.lastIndex = 0;
        while ((m = reAddonFrom.exec(c))) seeds.add(stripJs(m[1]));
        reAddonImport.lastIndex = 0;
        while ((m = reAddonImport.exec(c))) seeds.add(stripJs(m[1]));
    }
    for (const d of SOURCE_DIRS) {
        walkProjectTree(path.join(ROOT, d), scan);
    }
    return [...seeds];
}

function stripJs(p) { return p.endsWith('.js') ? p.slice(0, -3) : p; }

const reFrom = /from\s+['"]([^'"]+)['"]/g;
const reDynImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function walkAddonDeps(seeds) {
    const jsmRoot = path.join(NM, 'three', 'examples', 'jsm');
    if (!fs.existsSync(jsmRoot)) return [];
    const visited = new Set(seeds);
    const queue = [...seeds];
    function consider(ref, fromStem) {
        let resolved;
        if (ref.startsWith('./') || ref.startsWith('../')) {
            // Resolve relative to fromStem's directory. We walk segments
            // manually because path.posix.join would interpret a leading
            // '../' as "above CWD", which would escape the addon subtree.
            const curDirSegs = path.posix.dirname(fromStem) === '.'
                ? []
                : path.posix.dirname(fromStem).split('/');
            const resultParts = curDirSegs.slice();
            for (const part of ref.split('/')) {
                if (part === '' || part === '.') continue;
                if (part === '..') {
                    if (resultParts.length) resultParts.pop();
                    continue;
                }
                resultParts.push(part);
            }
            resolved = stripJs(resultParts.join('/'));
        } else if (ref.startsWith('three/addons/')) {
            resolved = stripJs(ref.slice('three/addons/'.length));
        } else {
            return;
        }
        if (resolved && !visited.has(resolved)) {
            visited.add(resolved);
            queue.push(resolved);
        }
    }
    while (queue.length) {
        const cur = queue.shift();
        const fp = path.join(jsmRoot, cur + '.js');
        if (!fs.existsSync(fp)) continue;
        const c = fs.readFileSync(fp, 'utf8');
        let m;
        reFrom.lastIndex = 0;
        while ((m = reFrom.exec(c))) consider(m[1], cur);
        reDynImport.lastIndex = 0;
        while ((m = reDynImport.exec(c))) consider(m[1], cur);
    }
    return [...visited];
}

// --- main -------------------------------------------------------------------

function main() {
    let anyDrift = false;
    let anyMissing = false;

    // Verify node_modules present so we fail fast with a clear message.
    if (!fs.existsSync(NM)) {
        console.error('node_modules/ missing — run `npm install` first.');
        process.exit(1);
    }

    // 1) Single-file leaves (three's main module entry)
    for (const { pkg, src, dest } of SINGLE_FILE_LEAVES) {
        const pkgJson = path.join(NM, pkg, 'package.json');
        if (!fs.existsSync(pkgJson)) {
            console.error(`✗ ${pkg} not installed — run \`npm install\``);
            process.exit(1);
        }
        const status = mirrorFile(
            path.join(NM, pkg, src),
            path.join(VENDOR, pkg, dest)
        );
        const label = `vendor/${pkg}/${dest}`;
        if (status === 'missing') {
            console.error(`✗ ${pkg} entrypoint not found at ${src}`);
            process.exit(1);
        } else if (status === 'drift') {
            if (CHECK_MODE) { console.error(`✗ ${label}`); anyDrift = true; }
            else console.log(`+ ${label}`);
        } else {
            if (CHECK_MODE) console.log(`✓ ${label}`);
        }
    }

    // 2) Whole-directory leaves (cannon-es, wasmoon, nipplejs)
    for (const { pkg, subdir } of LEAF_PKG_DIRS) {
        const pkgJson = path.join(NM, pkg, 'package.json');
        if (!fs.existsSync(pkgJson)) {
            console.error(`✗ ${pkg} not installed — run \`npm install\``);
            process.exit(1);
        }
        const status = mirrorDir(
            path.join(NM, pkg, subdir),
            path.join(VENDOR, pkg, subdir)
        );
        const label = `vendor/${pkg}/${subdir}/`;
        if (status === 'missing') {
            console.error(`✗ ${pkg}/${subdir}/ not found`);
            process.exit(1);
        } else if (status === 'drift') {
            if (CHECK_MODE) { console.error(`✗ ${label}`); anyDrift = true; }
            else console.log(`+ ${label}`);
        } else {
            if (CHECK_MODE) console.log(`✓ ${label}`);
        }
    }

    // 3) Three addons: BFS from project seeds through the addon import graph.
    const seeds = collectAddonSeeds();
    const deps = walkAddonDeps(seeds);
    for (const stem of deps) {
        const status = mirrorFile(
            path.join(NM, 'three', 'examples', 'jsm', stem + '.js'),
            path.join(VENDOR, 'three', 'examples', 'jsm', stem + '.js')
        );
        const label = `vendor/three/examples/jsm/${stem}.js`;
        if (status === 'missing') {
            // Transitive reference points to a file that doesn't exist in node_modules.
            // The page would 404 at runtime in the static deploy, so fail the vendor
            // run (CI catches the issue rather than a runtime browser console error).
            console.error(`✗ addon source missing (referenced transitively): ${stem}.js`);
            anyMissing = true;
        } else if (status === 'drift') {
            if (CHECK_MODE) { console.error(`✗ ${label}`); anyDrift = true; }
            else console.log(`+ ${label}`);
        } else {
            if (CHECK_MODE) console.log(`✓ ${label}`);
        }
    }

    if (CHECK_MODE) {
        if (anyDrift || anyMissing) {
            console.error('\nVendor check failed. Run `npm run vendor:deps` to refresh / fix.');
            process.exit(1);
        }
        console.log(`\n✓ Vendor in sync (${deps.length} addon files + 4 leaf packages)`);
    } else {
        console.log(`\nDone. ${seeds.length} three/addons paths referenced; ${deps.length} addon files vendored; 4 leaf packages mirrored.`);
    }
    if (anyMissing) {
        console.error('\nOne or more transitive addons are missing in node_modules — the static-deploy would 404 at runtime.');
        process.exit(1);
    }
}

main();
