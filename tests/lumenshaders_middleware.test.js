// @vitest-environment node
// Pure HTTP testing with node:http — jsdom not needed and the TextEncoder
// invariant in some Node + jsdom combinations breaks esbuild bootstrap when
// jsdom is in scope. Forcing `node` here keeps the rest of the suite on
// jsdom (see vitest.config.js `environment: 'jsdom'`).
/**
 * Regression tests for the `serve-lumenshaders-dev` vite plugin in
 * `vite.config.js`. The middleware mounts `/lumenshaders/*` →
 * `src/lumenshaders/*` for dev mode (the prod build copies the same tree
 * via the `copy-lumenshaders` plugin). The path-traversal defense inside
 * the middleware is what makes it safe to expose — the tests below pin
 * three invariant behaviours so future edits to vite.config.js cannot
 * silently introduce a directory-escape or sibling-prefix bypass.
 *
 * Strategy: spin up a real ViteDevServer via `createServer({ configFile,
 * root })` which loads the project's vite.config.js (and therefore the
 * `serve-lumenshaders-dev` plugin), call `listen()` to bind a port, then
 * issue raw HTTP requests via `node:http` so we preserve the unmodified
 * `/../` and `/lumenshaders-evil/` paths that the WHATWG fetch() URL
 * parser would otherwise normalize away.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'vite';
import { request as httpRequest } from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// `vite`-import sanity: bail with a clear failure if the dep is missing,
// rather than crashing inside createServer with an opaque error.
let createServerFn = null;
try { createServerFn = (await import('vite')).createServer; }
catch (e) { /* surface below in describe-level guard */ }

let server = null;
let portInfo = null; // { hostname, port }

/**
 * Issue a raw GET against the bound vite dev server. We use node:http
 * directly (NOT fetch) so that paths like `/lumenshaders/../../package.json`
 * reach the server un-normalized — fetch would resolve `..` segments
 * client-side and the test would no longer exercise the middleware.
 */
function rawGet(rawPath) {
    return new Promise((resolve, reject) => {
        const req = httpRequest({
            hostname: portInfo.hostname,
            port: portInfo.port,
            method: 'GET',
            path: rawPath,
            headers: { Connection: 'close' },
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode || 0,
                headers: res.headers || {},
                body: Buffer.concat(chunks).toString('utf8'),
            }));
        });
        req.on('error', reject);
        req.end();
    });
}

const haveVite = typeof createServerFn === 'function';

(haveVite ? describe : describe.skip)('serve-lumenshaders-dev — path-traversal defense', () => {
    beforeAll(async () => {
        server = await createServerFn({
            configFile: path.resolve(PROJECT_ROOT, 'vite.config.js'),
            root: PROJECT_ROOT,
            logLevel: 'error',
            server: { strictPort: false, host: '127.0.0.1' },
        });
        await server.listen();

        const local = server.resolvedUrls?.local?.[0];
        if (!local) throw new Error('vite did not expose a URL after listen()');
        const u = new URL(local);
        portInfo = { hostname: u.hostname, port: u.port };
    }, 60000);

    afterAll(async () => {
        if (server) {
            try { await server.close(); } catch (_) { /* ignore */ }
            server = null;
        }
    });

    it('a) GET /lumenshaders/js/palettes.js returns 200 with application/javascript MIME', async () => {
        const res = await rawGet('/lumenshaders/js/palettes.js');
        expect(res.status).toBe(200);
        const ct = String(res.headers['content-type'] || '');
        expect(ct).toMatch(/application\/javascript/i);
        // Body must be the lumen script — not the vite default page, not an
        // empty stream, not a different file accidentally served. The
        // palette IIFE exports a known symbol `LumenPalettes` and defines
        // `PALETTE_DEFAULTS`; matching that signature proves we streamed
        // the right file rather than merely a non-empty response.
        expect(res.body.length).toBeGreaterThan(50);
        expect(res.body).toMatch(/var PALETTES|PALETTE_DEFAULTS|hslToHex|hexToRgb01/i);
    });

    it('b) GET /lumenshaders/../../package.json falls through to next() (no project file leaked)', async () => {
        const res = await rawGet('/lumenshaders/../../package.json');

        // Vite's default for unmatched URLs in dev mode is either a 404 page
        // ("Cannot GET …") or the project index.html — either is fine as long
        // as the response body does NOT match package.json's distinctive
        // structural fields. We deliberately avoid coupling the assertion
        // to the project name string ("balls"/"quad-core-…"); instead we
        // match the structural shape of any package.json: an opening
        // `{`, the canonical keys `name`/`version`/`type` all present in
        // JSON form within the first ~512 bytes.
        const head = res.body.slice(0, 512);
        const looksLikePackageJson = /^\s*\{/.test(head)
            && /^\s*"name"\s*:/m.test(head)
            && /^\s*"version"\s*:/m.test(head)
            && (head.includes('"type": "module"') || head.includes('"type": "commonjs"'));
        expect(looksLikePackageJson).toBe(false);
    });        it('c) GET /lumenshaders-evil/foo does NOT serve a lumen script (vite SPA fallback)', async () => {
            const res = await rawGet('/lumenshaders-evil/foo');

            // Pins the contract: the lumen middleware MUST NOT serve a lumen
            // file at this URL. Two defense layers in vite.config.js either
            // individually or together block the streaming:
            //   (L1) sibling-prefix boundary check (filePath.startsWith(LUMEN_BASE + path.sep))
            //   (L2) fs.existsSync(filePath) reject for paths inside LUMEN_BASE but not real files
            // The test below pins the resulting property — vite's default
            // served something that is NOT a lumen script — regardless of
            // which layer caught the request.

            // (C1) Body MUST NOT look like a lumen script — neither the
            // MIME, the canonical IIFE export, the palette data literal, nor
            // its helper functions are present. (`window.LumenPalettes`
            // substring catch is the canonical post-IIFE assignment shape
            // across the lumen module set; `hslToHex` is unique to
            // palettes.js — either guard alone is sufficient.)
            expect(res.body).not.toMatch(/application\/javascript/i);
            expect(res.body).not.toMatch(/var PALETTES|PALETTE_DEFAULTS/i);
            expect(res.body).not.toContain('window.LumenPalettes');
            expect(res.body).not.toContain('hslToHex');

            // (C2) Vite's actual fallback for an unmounted URL in this
            // project's multi-page config is SPA-mode → 200 + index.html
            // re-served. Pin exactly that outcome (body shape by structural
            // regex, not literal string); a future refactor that changes
            // vite config drift the SPA default will trip this assertion
            // loudly so the test is updated deliberately together with
            // the rationale change.
            expect(res.status).toBe(200);
            const looksLikeIndex = /<html[\s>]|<!DOCTYPE html/i.test(res.body);
            expect(looksLikeIndex).toBe(true);
        });
});
