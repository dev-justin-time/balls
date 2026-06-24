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
      output: {
        manualChunks: {
          three: ['three'],
          wasmoon: ['wasmoon'],
          cannon: ['cannon-es'],
        },
      },
    },
  },

  // Copy LumenShaders static files to dist during production build.
  // LumenShaders uses non-module <script> tags that Vite's Rollup
  // pipeline can't bundle; instead it's copied as a self-contained
  // static directory preserving the original directory structure.
  plugins: [{
    name: 'copy-lumenshaders',
    writeBundle() {
      const src = resolve(__dirname, 'src/lumenshaders');
      const dest = resolve(__dirname, 'dist/lumenshaders');
      if (fs.existsSync(src)) {
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
        fs.cpSync(src, dest, { recursive: true, dereference: true });
      }
    },
  }],

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
