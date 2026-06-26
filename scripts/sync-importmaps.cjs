#!/usr/bin/env node
/**
 * =====================================================================
 * @domain:    build
 * @concern:   Single-source-of-truth sync for project import maps
 * @created:   2026-06-26
 * @track:     sync-importmaps-cjs
 * @version:   1.0.0
 * @security:  Client-Side (no secrets)
 * =====================================================================
 *
 * Reads /importmap.json and rewrites the <script type="importmap">
 * block between <!-- IMPORTMAP:START --> / <!-- IMPORTMAP:END -->
 * markers in /index.html and /builderworkshop/index.html. Idempotent:
 * re-runs with no template change leave the HTMLs untouched.
 *
 * Usage:
 *   node scripts/sync-importmaps.cjs          # write if drifted
 *   node scripts/sync-importmaps.cjs --check  # exit 1 on drift (CI)
 *   npm run sync:importmaps                   # alias for write mode
 *   npm run check:importmaps                  # alias for check mode
 *
 * Auto-runs as predev / prestart / prebuild in package.json.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'importmap.json');
const TARGETS = [
    'index.html',
    'builderworkshop/index.html'
];
const MARKER_START = '<!-- IMPORTMAP:START -->';
const MARKER_END = '<!-- IMPORTMAP:END -->';

function renderImportmapBlock(rawJson) {
    let data;
    try {
        data = JSON.parse(rawJson);
    } catch (e) {
        throw new Error(`Invalid JSON in ${TEMPLATE_PATH}: ${e.message}`);
    }
    delete data._doc;
    const json = JSON.stringify(data, null, 4);
    const body = json.split('\n').map(line => '    ' + line).join('\n');
    return `    <script type="importmap">\n${body}\n    </script>`;
}

/**
 * RegExp-escape a literal so we can build a /g scanner from the marker
 * constants. Keeps the uniqueness check in lockstep with MARKER_START /
 * MARKER_END if their text is ever changed.
 */
function escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const args = new Set(process.argv.slice(2));
const CHECK_MODE = args.has('--check');
const MARKER_START_RE = new RegExp(escapeForRegex(MARKER_START), 'g');
const MARKER_END_RE   = new RegExp(escapeForRegex(MARKER_END), 'g');

function syncTarget(relPath) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) {
        console.error(`✗ Target not found: ${relPath}`);
        process.exit(1);
    }
    const src = fs.readFileSync(absPath, 'utf8');

    // Reject duplicate marker regions up-front: indexOf picks the first
    // occurrence and would silently leave any additional markers stale.
    // The /g scanners are built once from the MARKER_START / MARKER_END
    // constants so changing the marker text keeps the check in lockstep.
    const startCount = (src.match(MARKER_START_RE) || []).length;
    const endCount   = (src.match(MARKER_END_RE)   || []).length;
    if (startCount !== 1 || endCount !== 1) {
        console.error(`✗ ${relPath} must contain exactly one ${MARKER_START} and one ${MARKER_END} (found ${startCount} start, ${endCount} end)`);
        process.exit(1);
    }

    const startIdx = src.indexOf(MARKER_START);
    if (startIdx === -1) {
        console.error(`✗ ${MARKER_START} not found in ${relPath}`);
        process.exit(1);
    }
    const endIdx = src.indexOf(MARKER_END, startIdx + MARKER_START.length);
    if (endIdx === -1) {
        console.error(`✗ ${MARKER_END} not found after start marker in ${relPath}`);
        process.exit(1);
    }
    if (endIdx <= startIdx) {
        console.error(`✗ ${MARKER_END} appears before ${MARKER_START} in ${relPath}`);
        process.exit(1);
    }
    const rawJson = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const newRegion = `${MARKER_START}\n${renderImportmapBlock(rawJson)}\n${MARKER_END}`;

    if (CHECK_MODE) {
        const currentRegion = src.slice(startIdx, endIdx + MARKER_END.length);
        if (currentRegion !== newRegion) {
            console.error(`✗ ${relPath} drift — run \`npm run sync:importmaps\``);
            process.exitCode = 1;
        } else {
            console.log(`✓ ${relPath} in sync`);
        }
        return;
    }

    // Skip write if already in sync (keeps mtime stable on no-op runs).
    const currentRegion = src.slice(startIdx, endIdx + MARKER_END.length);
    if (currentRegion === newRegion) {
        console.log(`✓ ${relPath} already in sync`);
        return;
    }
    const updated = src.slice(0, startIdx) + newRegion + src.slice(endIdx + MARKER_END.length);
    fs.writeFileSync(absPath, updated);
    console.log(`✓ Synced ${relPath}`);
}

// Verify template exists up front for fail-fast behavior.
if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`✗ Template not found: ${TEMPLATE_PATH}`);
    process.exit(1);
}

for (const target of TARGETS) syncTarget(target);

if (CHECK_MODE && process.exitCode === 1) {
    console.error('\nSync check failed. Run `npm run sync:importmaps` to update.');
}
