/*
 * server.js — Lightweight static file server with health check endpoint.
 *
 * Usage:
 *   node server.js              (default port 3000)
 *   PORT=8080 node server.js    (custom port)
 *
 * Endpoints:
 *   GET /health     → JSON { status: "ok", uptime, timestamp, version }
 *   GET /*          → Static files from project root
 */

import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const START_TIME = Date.now();

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
};

// Read version from package.json (cached at startup)
let APP_VERSION = 'unknown';
try {
    const pkg = JSON.parse(await readFile(join(__dirname, 'package.json'), 'utf-8'));
    APP_VERSION = pkg.version || 'unknown';
} catch (e) { /* ignore */ }

async function serveHealth(req, res) {
    const health = {
        status: 'ok',
        uptime: Math.round((Date.now() - START_TIME) / 1000),
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
        node: process.version,
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(health));
}

async function serveStatic(req, res) {
    // Parse URL, strip query string
    const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;

    // Default to index.html for root
    let filePath = join(__dirname, pathname === '/' ? 'index.html' : pathname);

    // Path traversal guard: resolve and ensure the path stays within project root
    const resolved = resolve(filePath);
    if (!resolved.startsWith(resolve(__dirname))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    filePath = resolved;

    try {
        const fileStat = await stat(filePath);

        // If it's a directory, serve index.html inside it
        if (fileStat.isDirectory()) {
            filePath = join(filePath, 'index.html');
        }

        const data = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
        });
        res.end(data);
    } catch (e) {
        // SPA fallback: if file not found, serve index.html
        if (e.code === 'ENOENT') {
            try {
                const indexData = await readFile(join(__dirname, 'index.html'));
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(indexData);
            } catch (e2) {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
        } else {
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    }
}

const server = createServer(async (req, res) => {
    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
        return serveHealth(req, res);
    }

    // Static file serving
    return serveStatic(req, res);
});

// Graceful shutdown
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });

server.listen(PORT, () => {
    console.log(`\n  🎮 Going Balls dev server`);
    console.log(`  ➜ Local:  http://localhost:${PORT}/`);
    console.log(`  ➜ Health: http://localhost:${PORT}/health\n`);
});
