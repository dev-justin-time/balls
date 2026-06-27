// @vitest-environment node
// Pure JSDOM + filesystem probes; safer to force `node` env here than the
// `jsdom` vitest default because the test does many sequential window.eval
// calls + filesystem reads, which can fight jsdom's polyfilled globals.
//
// =============================================================================
// Why this test exists
// =============================================================================
// The standalone /builderworkshop/index.html route (server at
// /builderworkshop/index.html when no vite dev server is running — e.g. via
// `node server.js` or any static host) had its Lumen IIFE scripts pointing at
// `/builderworkshop/lumen/js/*` URLs that 404'd. The fix was to repoint them
// at `/lumenshaders/js/*` + add a vite dev middleware plus a prod-build copy
// plugin. This test pins the surface invariants of that fix:
//
//   (a) Engine, Exporter, Modals, UI, PALETTES globals are exposed on `window`
//       when the IIFE scripts are evaluated in dependency order
//   (b) `<canvas id="view">` is present in the HTML + is a resolvable canvas
//       element (per the user's "Lumen shader preview canvas" requirement)
//   (c) Run Resource Agent / Sculpt mode / Shader dropdown affordances are
//       present and switch visibility on the right panels
//
// =============================================================================
// What this test does NOT verify
// =============================================================================
// Browser-only behaviour that the user's request also calls out:
//   - actual pixel rendering on #view (needs WebGL2 + a real browser; jsdom
//     has no canvas backend)
//   - click handler execution (needs real DOM events)
//   - WebGL itself compiling shaders
//
// So (b) and (c) are validated at the DOM AFFORDANCE level (element present,
// attributes correct, option list right, master/dropdown wiring reads
// correct). That catches the regression class we just fixed — script src paths
// that 404 — without requiring browser-automation infra.
//
// If you want true browser-test coverage of (b)/(c), install playwright
// (`npm i -D playwright`) and add a sibling test under a `describe.skip`-or-
// `if (process.env.CI)` guard that fires it up. (Chrome is not installed
// on this Windows machine at the time this test was added — confirmed via
// `command -v chrome` and the standard install paths returning empty.)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const HTML_PATH = path.resolve(ROOT, 'builderworkshop/index.html');

// Read the HTML once and extract the resource references the user cares about.
// We deliberately re-derive these on every run (rather than caching at module
// load) so the test surfaces drift in the HTML — e.g. if a future edit drops
// a script the failure points to exactly which <script src=> is missing.
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

const LUMEN_SCRIPT_SRCS = [...HTML.matchAll(/<script\s+src=["']([^"']*\/lumenshaders\/[^"']+)["'][^>]*>/gi)]
    .map((m) => m[1]);

const LUMEN_CSS_HREFS = [...HTML.matchAll(/<link[^>]+href=["']([^"']*\/lumenshaders\/[^"']+\.css)["'][^>]*>/gi)]
    .map((m) => m[1]);

// Convert `/lumenshaders/X` (the URL the browser sees) → `src/lumenshaders/X`
// (the on-disk location) so we can fs-check that each URL would resolve to
// a real file — this is the static equivalent of the dynamic
// `serve-lumenshaders-dev` middleware probe done by
// tests/lumenshaders_middleware.test.js.
const urlToDisk = (urlPath) => {
    const stripped = urlPath.replace(/^\/+/, '');
    // `<link rel="stylesheet" href="/lumenshaders/styles.css">` lives at
    // src/lumenshaders/styles.css. Script URLs live at src/lumenshaders/js/*.
    return path.resolve(ROOT, 'src', stripped);
};

describe('builderworkshop standalone — static asset reachability', () => {
    it('every <script src="/lumenshaders/*"> resolves to a real file on disk', () => {
        expect(LUMEN_SCRIPT_SRCS.length, 'at least one lumen script must be referenced').toBeGreaterThan(0);
        const missing = LUMEN_SCRIPT_SRCS.filter((src) => !fs.existsSync(urlToDisk(src)));
        if (missing.length) {
            throw new Error(
                `The following <script src> URLs would 404 on the standalone route:\n` +
                missing.map((s) => `  ${s}  →  ${urlToDisk(s)}`).join('\n')
            );
        }
    });

    it('every <link href="/lumenshaders/*.css"> resolves to a real file on disk', () => {
        if (LUMEN_CSS_HREFS.length === 0) {
            // Tolerate zero CSS references for now (the user only required
            // script-src verification); the assertion below just ensures
            // (when there ARE CSS refs) they ALL exist.
            return;
        }
        const missing = LUMEN_CSS_HREFS.filter((href) => !fs.existsSync(urlToDisk(href)));
        if (missing.length) {
            throw new Error(
                `The following <link href> URLs would 404 on the standalone route:\n` +
                missing.map((h) => `  ${h}  →  ${urlToDisk(h)}`).join('\n')
            );
        }
    });
});

describe('builderworkshop standalone — JSDOM execution of Lumen IIFE chain', () => {
    let dom;
    let window;
    let evalErrors = [];

    beforeAll(async () => {
        // runScripts: 'outside-only' lets us manually window.eval each script
        // in dependency order (the HTML order, which preserves deps). We do
        // NOT use 'dangerously' because the HTML has <script type="module">
        // references that jsdom cannot resolve without an external module loader,
        // and the inline mode-switcher script is what we want to selectively
        // evaluate ourselves later (case c).
        //
        // The `url` arg is set to a stable origin so any relative URL handling
        // inside the scripts is deterministic — though none of the lumen IIFEs
        // use location.
        dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://builderworkshop.local/' });
        window = dom.window;

        // Some lumen scripts try to access `document` at module load (e.g. the
        // UI script auto-mounts to a `#view` canvas if present). We expose
        // the standard browser globals onto a per-script `this` via eval,
        // which is what jsdom does for `dangerously`-mode scripts anyway.
        // To keep tests hermetic we wrap each script in an IIFE that scopes
        // window/document to the eval-time window so the IIFE sees a real DOM.
        // Intentionally exclude the `<script type="module" src="/builderworkshop/app.js">`
        // that the standalone HTML also references. JSDOM cannot load ESM
        // imports from URL without a custom module loader (it would need
        // an importmap-aware fetch shim + dynamic import engine). That
        // makes 'does app.js run' out of scope here; the static + dynamic
        // checks below cover the LUMEN IIFE chain directly, which IS the
        // regression that the 404 fix addresses.
        for (const src of LUMEN_SCRIPT_SRCS) {
            const disk = urlToDisk(src);
            if (!fs.existsSync(disk)) continue; // already asserted above
            const code = fs.readFileSync(disk, 'utf8');
            try {
                // window.eval shares the GLOBAL scope with the jsdom window,
                // so `var Engine = ...` at top level adds `window.Engine`.
                // We catch synchronous throws (e.g. missing deps) but
                // tolerate async ones (requestAnimationFrame, etc.) by not
                // awaiting anything.
                window.eval(code);
            } catch (e) {
                evalErrors.push({ src, error: e });
            }
        }
    }, 60000);

    afterAll(() => {
        try { dom?.window?.close?.(); } catch (_) { /* ignore */ }
    });

    it('no script threw synchronously during module-level evaluation', () => {
        if (evalErrors.length) {
            const formatted = evalErrors.map(({ src, error }) =>
                `  ${src}: ${error.message}`
            ).join('\n');
            throw new Error(`Lumen IIFE chain failed to load:\n${formatted}`);
        }
    });

    // ---- (a) Globals ----
    it('a) window.Engine is defined (lumen IIFE engine.js)', () => {
        expect(window.Engine, 'window.Engine must be defined after evaluation').toBeDefined();
        // Engine returned an object literal from its IIFE — assert it's a
        // usable shape so a regression that returns null/undefined is caught.
        expect(typeof window.Engine).toBe('object');
        // Loose CAPABILITY check rather than method-name check: app.js calls
        // various Engine methods (start, renderAt, setSize). Any one of
        // those being a function proves the IIFE returned a usable object,
        // and a refactor that renames `start` → `play` won't break this
        // assertion.
        const has = (window.Engine.start && typeof window.Engine.start === 'function')
            || (window.Engine.play && typeof window.Engine.play === 'function')
            || (window.Engine.renderAt && typeof window.Engine.renderAt === 'function');
        expect(has, 'Engine must expose at least start/play/renderAt').toBe(true);
        expect(Object.keys(window.Engine).length, 'Engine should expose many methods (asserts real IIFE result, not stub)').toBeGreaterThanOrEqual(5);
    });

    it('a) window.Exporter is defined (lumen IIFE exporter.js)', () => {
        expect(window.Exporter, 'window.Exporter').toBeDefined();
        expect(typeof window.Exporter).toBe('object');
    });

    it('a) window.Modals is defined (lumen IIFE modals.js)', () => {
        expect(window.Modals, 'window.Modals').toBeDefined();
    });

    it('a) window.UI is defined (lumen IIFE ui.js)', () => {
        expect(window.UI, 'window.UI').toBeDefined();
    });

    it('a) PALETTES global is defined (lumen IIFE palettes.js exports a var PALETTES)', () => {
        // palettes.js does `var PALETTES = [...]` at top level — top-level
        // var in a script-eval context becomes a property of the global so
        // window.PALETTES should be reachable.
        expect(window.PALETTES, 'window.PALETTES').toBeDefined();
        expect(Array.isArray(window.PALETTES), 'PALETTES should be an array of palette objects').toBe(true);
        // Empty PALETTES would itself be a regression — assert non-empty
        // BEFORE shape-checking the first entry so the failure is loud.
        expect(window.PALETTES.length, 'PALETTES should be non-empty').toBeGreaterThan(0);
        const first = window.PALETTES[0];
        expect(typeof first.name, 'palette[0].name should be a string').toBe('string');
        expect(Array.isArray(first.colors), 'palette[0].colors should be an array').toBe(true);
    });

    // ---- (b) Canvas affordance ----
    it('b) <canvas id="view"> element exists with sane canvas attrs AND lives inside #lumen-controls (initially hidden)', () => {
        const view = window.document.getElementById('view');
        expect(view, '#view canvas element must exist').toBeTruthy();
        // Per the HTML: <canvas id="view" width="512" height="288" …>
        expect(view.tagName, '#view should be a <canvas>').toBe('CANVAS');
        expect(view.getAttribute('width'), '#view width=512 expected').toBe('512');
        expect(view.getAttribute('height'), '#view height=288 expected').toBe('288');
        // Style hooks the lumen css targets
        expect(view.parentElement?.classList.contains('glass-panel'), '#view parent should be a .glass-panel').toBe(true);
        const lumenControls = window.document.getElementById('lumen-controls');
        expect(lumenControls, '#lumen-controls panel must exist (parent of #view)').toBeTruthy();
        // Initial DOM state: panel starts hidden. The inline mode-toggle
        // script removes the `hidden` class when the user picks `shader`
        // from the #mode <select>. Asserting the initial-hidden state pins
        // the toggle wiring contract.
        expect(lumenControls.classList.contains('hidden'), '#lumen-controls must start hidden and surface only when #mode === shader').toBe(true);
    });

    // ---- (c) Operations affordance ----
    it('c) #run-agent button is present (Run Resource Agent)', () => {
        const btn = window.document.getElementById('run-agent');
        expect(btn, '#run-agent button must exist').toBeTruthy();
        expect(btn.tagName, '#run-agent should be a <button>').toBe('BUTTON');
        // The inline text is normalised by the surrounding whitespace; trim
        // before comparison so spacing tweaks don't break the test.
        expect(btn.textContent.trim()).toMatch(/run\s*resource\s*agent/i);
    });

    it('c) #mode <select> includes the Sculpt + Shader (Procedural Texture) options', () => {
        const mode = window.document.getElementById('mode');
        expect(mode, '#mode select must exist').toBeTruthy();
        expect(mode.tagName, '#mode should be a <select>').toBe('SELECT');
        const values = [...mode.querySelectorAll('option')].map((o) => o.value);
        expect(values, '#mode should include sculpt + shader (Procedural Texture)').toEqual(
            expect.arrayContaining(['sculpt', 'shader'])
        );
        // The HTML renders the label "Procedural Texture" for the shader
        // option — assert the visible label survives the HTML parse.
        const shaderOpt = mode.querySelector('option[value="shader"]');
        expect(shaderOpt?.textContent).toMatch(/procedural\s*texture/i);
    });

    it('c) #sculpt-controls panel exists (Sculpt mode affordance) with the brush + radius + strength controls', () => {
        const panel = window.document.getElementById('sculpt-controls');
        expect(panel, '#sculpt-controls panel must exist').toBeTruthy();
        expect(window.document.getElementById('sculpt-tool'), 'sculpt brush <select>').toBeTruthy();
        expect(window.document.getElementById('sculpt-radius'), 'sculpt radius slider').toBeTruthy();
        expect(window.document.getElementById('sculpt-strength'), 'sculpt strength slider').toBeTruthy();
    });

    it('c) #lumen-mode-select dropdown exists (Shader / procedural-texture style picker)', () => {
        const sel = window.document.getElementById('lumen-mode-select');
        expect(sel, '#lumen-mode-select (Shader dropdown) must exist').toBeTruthy();
        expect(sel.tagName, 'should be <select>').toBe('SELECT');
        // The dropdown options are 0..8 (Chrome / Silk / Bloom / Aura / Light Rays /
        // Halftone / Glyphs / Reeded / Mosaic). Compare via Set so a
        // re-ordering of options for UX reasons doesn't break this test.
        const values = [...sel.querySelectorAll('option')].map((o) => o.value);
        expect(values.length, 'should have 9 style options (0..8)').toBe(9);
        expect(new Set(values), 'should contain all 9 styles as a SET').toEqual(
            new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8'])
        );
    });

    it('c) LUMEN export buttons are wired (PNG / WEBM / GIF / ZIP)', () => {
        // After the lumen IIFE chain loads, Exporter.UI is wired to these
        // buttons via app.js. The buttons themselves must at least be present
        // so app.js has surfaces to attach handlers to.
        for (const id of ['lumen-export-png', 'lumen-export-video', 'lumen-export-gif', 'lumen-export-set']) {
            expect(window.document.getElementById(id), `${id} button must exist`).toBeTruthy();
        }
    });
});
