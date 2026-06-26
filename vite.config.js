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
import { resolve } from 'path';
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
      output: {
        manualChunks: {
          three: ['three'],
          wasmoon: ['wasmoon'],
          cannon: ['cannon-es'],
        },
      },
    },
  },

  // Copy static directories to dist during production build.
  // These use non-module scripts that Vite's Rollup pipeline can't bundle.
  plugins: [
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

  // Optimize dependencies for ESM compatibility
  optimizeDeps: {
    include: ['three', 'cannon-es', 'wasmoon', 'nipplejs'],
  },
});
