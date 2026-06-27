/**
 * =====================================================================
 * @domain:    core
 * @concern:   Vite Dev Server Configuration
 * @created:   2026-06-24T15:10:00Z
 * @track:     6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c
 * @version:   1.0.0
 * @security:  Client-Side (Dev Tooling / No Secrets)
 * =====================================================================
 *
 * Vite configuration for the Quad-Core architecture.
 *
 * Key features:
 *   - SharedArrayBuffer headers required for WASM threading (Rayon in Rust)
 *   - CORS headers for Python FastAPI backend on port 8000
 *   - Import maps for Three.js, cannon-es, wasmoon CDN modules
 *   - Static asset serving for .glb, .webp, .lua, .ttf files
 *   - HMR (Hot Module Replacement) for fast development
 */

import { defineConfig } from 'vite';
import path, { resolve } from 'path';
import fs from 'fs';

export default defineConfig({
  root: '.',
  publicDir: 'assets',

  server: {
    port: 5173,
    strictPort: false,
    open: true,

    headers: {
      // Required for SharedArrayBuffer (used by Rayon WASM threads and wasmoon)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },

    proxy: {
      // Proxy Python API requests to the FastAPI backend
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    target: 'esnext',
    rollupOptions: {
      // Multi-page config: each HTML page is its own Rollup entry.
      // This makes dev mode serve each page at its real path
      // (e.g. /apps/web-extractor.html, /docs/api.html, ...) without
      // ad-hoc static-file fallthroughs, and produces a separate chunk
      // per page in the production build under dist/.
      input: {
        main: resolve(__dirname, 'index.html'),
        build: resolve(__dirname, 'build.html'),
        offline: resolve(__dirname, 'offline.html'),
        puter_workers_demo: resolve(__dirname, 'puter_workers_demo.html'),
        web_extractor: resolve(__dirname, 'apps/web-extractor.html'),
        builder_workshop: resolve(__dirname, 'builderworkshop/index.html'),
        docs: resolve(__dirname, 'docs/index.html'),
        docs_api: resolve(__dirname, 'docs/api.html'),
        docs_architecture: resolve(__dirname, 'docs/architecture.html'),
        docs_monetization: resolve(__dirname, 'docs/monetization.html'),
        docs_security: resolve(__dirname, 'docs/security.html'),
        docs_zoning_plan: resolve(__dirname, 'docs/zoning_plan.html'),
        // Note: lumenshaders / temp_lumenshaders are NOT entries because
        // their HTML uses non-module <script src="js/..."> tags. The
        // `copy-lumenshaders` plugin below ships them verbatim as part
        // of the production build.
      },
      onwarn(warning, warn) {
        // wasmoon imports Node.js 'module' for Node.js detection —
        // harmless in browser, Vite externalizes it automatically.
        if (warning.message && warning.message.includes('wasmoon')) return;
        warn(warning);
      },
      // Force Rollup to leave `wasmoon` un-bundled in production. The npm
      // package ships a Node-targeted WASM build as the default entry, so
      // bundling it regresses to the same "not compiled for this environment"
      // runtime error we hit in dev. The HTML importmap
      // (`wasmoon` -> `/vendor/wasmoon/dist/index.js` offline, or
      // `https://esm.sh/wasmoon@1.16.0` when online) handles browser-side
      // resolution at runtime, so treating it as external is correct for both
      // Vite 5's optimizeDeps dev path AND the Rollup production path.
      external: ['wasmoon'],
      output: {
        manualChunks: {
          three: ['three'],
          cannon: ['cannon-es'],
        },
      },
    },
  },

  // Copy static directories to dist during production build.
  // These use non-module scripts that Vite's Rollup pipeline can't bundle.
  plugins: [
  {
    // ---------------------------------------------------------------------
    // serve-lumenshaders-dev: mirror /lumenshaders/* → src/lumenshaders/* in dev
    // ---------------------------------------------------------------------
    // builderworkshop/index.html references the Lumen IIFE scripts at
    // /lumenshaders/js/* (same path as the prod build output) and the styles
    // at /lumenshaders/styles.css. The existing copy-lumenshaders plugin
    // ships src/lumenshaders → dist/lumenshaders on `vite build`, so prod
    // already serves the files at the expected URL. In dev, vite's default
    // server.fs.allow is the project root — it would 404 on /lumenshaders/*
    // because vite only auto-serves files inside `publicDir` (set to 'assets').
    // This middleware mounts /lumenshaders → src/lumenshaders so the SAME html
    // works in both environments with no file moves and no duplication.
    name: 'serve-lumenshaders-dev',
    configureServer(server) {
      // Absolute base directory for the lumen assets — used both as the
      // resolve() root and as the upper bound for the path-traversal check
      // (reqPath that resolves OUTSIDE this directory is rejected).
      const LUMEN_BASE = resolve(__dirname, 'src/lumenshaders');
      server.middlewares.use('/lumenshaders', (req, res, next) => {
        try {
          // After mount, req.url is the suffix, e.g. '/js/palettes.js' or
          // '/styles.css' or '/assets/favicon.png'.
          const reqPath = req.url.split('?')[0].replace(/^\/+/, '');
          if (!reqPath) return next();
          // Resolve to an absolute path so we can verify the suffix doesn't
          // escape the lumen directory via `..` segments. A request like
          // /lumenshaders/../../package.json would otherwise escape and
          // stream arbitrary project files (dev-only, but bad hygiene).
          const filePath = resolve(LUMEN_BASE, reqPath);
          // Boundary check: filePath must live UNDER LUMEN_BASE. We add the
          // separator to defend against sibling-prefix false positives
          // (e.g. /lumenshaders-evil/foo passing when LUMEN_BASE ends with
          // the same prefix).
          if (filePath !== LUMEN_BASE && !filePath.startsWith(LUMEN_BASE + path.sep)) {
            return next();
          }
          if (!fs.existsSync(filePath)) return next();
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) return next();

          // Inline MIME map — keeps the plugin dependency-free.
          const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
          const mime = ({
            js:   'application/javascript; charset=utf-8',
            css:  'text/css; charset=utf-8',
            html: 'text/html; charset=utf-8',
            json: 'application/json; charset=utf-8',
            png:  'image/png',
            jpg:  'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
            svg:  'image/svg+xml',
            ico:  'image/x-icon'
          })[ext] || 'application/octet-stream';

          res.setHeader('Content-Type', mime);
          // HMR-friendly: always revalidate. Caching headers would set Cache-
          // Control here, but the no-cache policy keeps dev iteration snappy.
          res.setHeader('Cache-Control', 'no-cache');
          fs.createReadStream(filePath).pipe(res);
        } catch (err) {
          // Surface the error to vite's dev overlay instead of silently 404'ing.
          next(err);
        }
      });
    }
  },
  {
    name: 'copy-lumenshaders',
    writeBundle() {
      const src = resolve(__dirname, 'src/lumenshaders');
      const dest = resolve(__dirname, 'dist/lumenshaders');
      if (fs.existsSync(src)) {
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
        fs.cpSync(src, dest, { recursive: true, dereference: true });
      }
    },
  },
  {
    name: 'copy-wasm',
    writeBundle() {
      const src = resolve(__dirname, 'rust_core/pkg');
      const dest = resolve(__dirname, 'dist/rust_wasm');
      if (fs.existsSync(src)) {
        const files = ['quad_core_physics_bg.wasm', 'quad_core_physics.js', 'quad_core_physics.d.ts'];
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
        fs.mkdirSync(dest, { recursive: true });
        for (const file of files) {
          const filePath = resolve(src, file);
          if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, resolve(dest, file));
          }
        }
      }
    },
  }],
  // Process any .wasm files as assets

  // Handle .lua files as raw text
  assetsInclude: ['**/*.lua', '**/*.wasm'],

  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@scripts': resolve(__dirname, 'src/scripts'),
      '@engine': resolve(__dirname, 'engine'),
      '@rust': resolve(__dirname, 'rust_core/pkg'),
    },
  },

  // Optimize dependencies for ESM compatibility.
  // wasmoon is intentionally EXCLUDED: it ships a Node.js-targeted build that
  // throws "not compiled for this environment" when Vite pre-bundles it for the
  // dev server. The project's importmap (index.html / builderworkshop/index.html)
  // resolves wasmoon directly from esm.sh, so Vite must not re-bundle it.
  optimizeDeps: {
    include: ['three', 'cannon-es', 'nipplejs'],
    exclude: ['wasmoon'],
  },
});
