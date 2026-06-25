/**
 * =====================================================================
 * @domain:    core
 * @concern:   Puter.js Integration — Game Server Backend Services
 * @created:   2026-06-24T22:00:00Z
 * @version:   1.0.0
 * @license:   Apache-2.0
 * =====================================================================
 *
 * Puter Integration Module
 * ========================
 * Provides a unified wrapper around the Puter.js SDK (@heyputer/puter.js)
 * for use as the Going Balls game server backend.
 *
 * Puter is an open-source cloud desktop / platform that provides:
 *   - Auth (puter.auth) — user sign-in/sign-out, identity
 *   - KV Store (puter.kv) — persistent key-value data for game state
 *   - File System (puter.fs) — read/write user content and assets
 *   - Hosting (puter.hosting) — publish and serve apps
 *   - Workers (puter.workers) — serverless HTTP workers for API endpoints
 *   - Networking (puter.net) — real-time sockets for multiplayer
 *   - AI (puter.ai) — optional AI services
 *
 * Architecture:
 *   When Puter is available (either self-hosted or via puter.com),
 *   this module replaces the WebSimSocket backend as the primary
 *   game server provider. Falls back gracefully when Puter is absent.
 *
 * Usage:
 *   import { initPuter, puterReady } from './puter_integration.js';
 *   const puter = await initPuter();
 *   const user = await puter.auth.getUser();
 *   await puter.kv.set('highscore:12345', 999999);
 *   const worker = await puter.workers.create('lb-proxy', 'worker.js');
 *   console.log('Worker URL:', worker.url);
 *
 * Self-hosting:
 *   See /puter/README.md for Docker Compose setup instructions.
 *
 * @see https://github.com/HeyPuter/puter
 * @see https://docs.puter.com
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

// Dynamic import of Puter.js — only resolves when Puter is available
let _puterModule = null;
let _puterInstance = null;
let _isInitialized = false;
let _initPromise = null;

// App identifier for Puter services
const PUTER_APP_NAME = 'going-balls-quad-core';

// Shared secret for score verification (must match deployScoreVerificationWorker secret)
let _scoreSecret = 'going-balls-default-secret';

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Check if Puter is available in the current environment.
 * Puter.js sets `window.puter` when running within the Puter ecosystem
 * (puter.com or self-hosted instance). When running standalone, we attempt
 * to initialize the SDK directly.
 *
 * @returns {boolean} Whether Puter is potentially available
 */
/**
 * Initialize the Puter.js SDK and establish a connection to the
 * Puter backend (self-hosted or puter.com).
 *
 * In a Puter-hosted app (puter.com), the SDK is auto-initialized
 * and `window.puter` is available immediately.
 *
 * For self-hosted instances, pass the API origin in options.
 *
 * @param {object} [options] - Initialization options
 * @param {string} [options.apiOrigin] - Self-hosted Puter API URL (e.g. 'https://api.your-puter.com')
 * @param {string} [options.appID] - Puter app ID (optional, auto-detected in ecosystem)
 * @returns {Promise<object|null>} Puter instance or null if unavailable
 */
export async function initPuter(options = {}) {
    if (_isInitialized && _puterInstance) return _puterInstance;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        try {
            // If puter is already on window (Puter ecosystem), use it directly
            if (typeof window !== 'undefined' && window.puter) {
                _puterInstance = window.puter;
                _isInitialized = true;
                console.info('[Puter] Using existing Puter instance from ecosystem');
                return _puterInstance;
            }

            // Dynamically import the Puter.js SDK
            try {
                const mod = await import('@heyputer/puter.js');
                _puterModule = mod.default || mod;

                // If options.apiOrigin is provided, configure for self-hosted
                if (options.apiOrigin) {
                    _puterModule.APIOrigin = options.apiOrigin;
                }
                if (options.appID) {
                    _puterModule.appID = options.appID;
                } else {
                    _puterModule.appID = PUTER_APP_NAME;
                }

                _puterInstance = _puterModule;
                _isInitialized = true;
                console.info('[Puter] SDK initialized successfully');
                console.info(`[Puter] API Origin: ${_puterModule.APIOrigin || 'https://api.puter.com'}`);
                console.info(`[Puter] App ID: ${_puterModule.appID}`);
                return _puterInstance;
            } catch (importError) {
                console.warn('[Puter] SDK not available:', importError.message);
                return null;
            }
        } catch (error) {
            console.warn('[Puter] Initialization failed:', error);
            return null;
        }
    })();

    return _initPromise;
}

/**
 * Check if Puter is ready and initialized.
 * @returns {boolean}
 */
export function isPuterReady() {
    return _isInitialized && _puterInstance !== null;
}

/**
 * Wait for Puter to be ready (resolves after initPuter completes).
 * @returns {Promise<boolean>} Whether Puter is available
 */
export async function puterReady() {
    if (_isInitialized) return _puterInstance !== null;
    const instance = await initPuter();
    return instance !== null;
}

// ---------------------------------------------------------------------------
// Game Server API — Wraps Puter.js for Going Balls use cases
// ---------------------------------------------------------------------------

/**
 * Puter Game Server — high-level API for game-specific operations.
 * Wraps the raw Puter.js SDK with game-friendly methods.
 */
class PuterGameServer {
    constructor(puter) {
        this._puter = puter;
    }

    // ── Auth ──────────────────────────────────────────────────────────

    /**
     * Sign in the current user. Opens a Puter sign-in popup.
     * @returns {Promise<object>} User data
     */
    async signIn() {
        if (!this._puter?.auth) throw new Error('Puter auth unavailable');
        return this._puter.auth.signIn();
    }

    /**
     * Sign out the current user.
     */
    signOut() {
        if (!this._puter?.auth) return;
        this._puter.auth.signOut();
    }

    /**
     * Get the currently authenticated user.
     * @returns {Promise<object|null>} User object or null
     */
    async getUser() {
        if (!this._puter?.auth) return null;
        try {
            return await this._puter.auth.getUser();
        } catch {
            return null;
        }
    }

    /**
     * Check if a user is signed in.
     * @returns {boolean}
     */
    isSignedIn() {
        return this._puter?.auth?.isSignedIn() || false;
    }

    /**
     * Get the current auth token.
     * @returns {string|null}
     */
    getAuthToken() {
        return this._puter?.authToken || null;
    }

    // ── KV Store (Game State Persistence) ─────────────────────────────

    /**
     * Save a game value to Puter's KV store.
     * @param {string} key - Storage key
     * @param {any} value - Value to store (serialized to JSON)
     * @param {number} [expireAt] - Optional UNIX timestamp expiration
     * @returns {Promise<boolean>}
     */
    async kvSet(key, value, expireAt) {
        if (!this._puter?.kv) return false;
        if (value === undefined) return false;
        try {
            // Always serialize to JSON for consistent round-trip deserialization
            const serialized = JSON.stringify(value);
            await this._puter.kv.set(key, serialized, expireAt);
            return true;
        } catch (error) {
            console.warn('[Puter] KV set failed:', key, error);
            return false;
        }
    }

    /**
     * Get a game value from Puter's KV store.
     * @param {string} key - Storage key
     * @returns {Promise<any>} The stored value, or null
     */
    async kvGet(key) {
        if (!this._puter?.kv) return null;
        try {
            const raw = await this._puter.kv.get(key);
            if (raw === undefined || raw === null) return null;
            // Attempt to parse JSON (all values are JSON-serialized by kvSet)
            try { return JSON.parse(raw); } catch { return raw; }
        } catch (error) {
            console.warn('[Puter] KV get failed:', key, error);
            return null;
        }
    }

    /**
     * Delete a key from Puter's KV store.
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async kvDelete(key) {
        if (!this._puter?.kv) return false;
        try {
            await this._puter.kv.del(key);
            return true;
        } catch (error) {
            console.warn('[Puter] KV delete failed:', key, error);
            return false;
        }
    }

    /**
     * List all keys (optionally with values) from Puter's KV store.
     * @param {boolean} [withValues=false] - Include values in results
     * @param {string} [pattern] - Optional key pattern to filter
     * @returns {Promise<Array<string|object>>}
     */
    async kvList(withValues = false, pattern) {
        if (!this._puter?.kv) return [];
        try {
            const opts = {};
            if (pattern) opts.pattern = pattern;
            if (withValues) opts.returnValues = true;
            return await this._puter.kv.list(opts);
        } catch (error) {
            console.warn('[Puter] KV list failed:', error);
            return [];
        }
    }

    /**
     * Increment a numeric value in Puter's KV store.
     * @param {string} key
     * @param {number} [amount=1]
     * @returns {Promise<number|null>}
     */
    async kvIncrement(key, amount = 1) {
        if (!this._puter?.kv) return null;
        try {
            return await this._puter.kv.incr(key, amount);
        } catch (error) {
            console.warn('[Puter] KV increment failed:', key, error);
            return null;
        }
    }

    /**
     * Decrement a numeric value in Puter's KV store.
     * @param {string} key
     * @param {number} [amount=1]
     * @returns {Promise<number|null>}
     */
    async kvDecrement(key, amount = 1) {
        if (!this._puter?.kv) return null;
        try {
            return await this._puter.kv.decr(key, amount);
        } catch (error) {
            console.warn('[Puter] KV decrement failed:', key, error);
            return null;
        }
    }

    // ── Game-Specific KV Presets ──────────────────────────────────────

    /**
     * Save the player's game progress (coins, level, skins).
     * @param {string} playerId - Unique player identifier
     * @param {object} progress - Game progress data
     */
    async savePlayerProgress(playerId, progress) {
        return this.kvSet(`game:player:${playerId}`, progress);
    }

    /**
     * Load a player's game progress.
     * @param {string} playerId
     * @returns {Promise<object|null>}
     */
    async loadPlayerProgress(playerId) {
        return this.kvGet(`game:player:${playerId}`);
    }

    /**
     * Save a leaderboard entry.
     * @param {string} leaderboardId - e.g. 'global', 'level_5'
     * @param {object} entry - { playerId, playerName, score, time, level }
     */
    async saveLeaderboardEntry(leaderboardId, entry) {
        return this.kvSet(`game:leaderboard:${leaderboardId}:${entry.playerId}`, entry);
    }

    /**
     * Get all entries for a leaderboard.
     * @param {string} leaderboardId
     * @returns {Promise<Array>}
     */
    async getLeaderboard(leaderboardId) {
        const entries = await this.kvList(true, `game:leaderboard:${leaderboardId}:`);
        return (entries || []).map(e => {
            try {
                if (typeof e === 'object' && e.value) {
                    return JSON.parse(e.value);
                }
            } catch { /* skip malformed entries */ }
            return null;
        }).filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    /**
     * Save a community track (builder mode).
     * @param {string} trackId
     * @param {object} trackData - { name, parts, author, sharedAt }
     */
    async saveCommunityTrack(trackId, trackData) {
        return this.kvSet(`game:track:${trackId}`, trackData);
    }

    /**
     * Load a community track.
     * @param {string} trackId
     * @returns {Promise<object|null>}
     */
    async loadCommunityTrack(trackId) {
        return this.kvGet(`game:track:${trackId}`);
    }

    /**
     * List all community tracks.
     * @returns {Promise<Array>}
     */
    async listCommunityTracks() {
        return this.kvList(true, 'game:track:');
    }

    // ── File System (User Content, Asset Storage) ─────────────────────

    /**
     * Write a file to Puter's cloud file system.
     * @param {string} path - File path (e.g. '/going-balls/tracks/my-track.json')
     * @param {string|Blob} data - File content
     * @returns {Promise<boolean>}
     */
    async writeFile(path, data) {
        if (!this._puter?.fs) return false;
        try {
            await this._puter.fs.write(path, data);
            return true;
        } catch (error) {
            console.warn('[Puter] File write failed:', path, error);
            return false;
        }
    }

    /**
     * Read a file from Puter's cloud file system.
     * @param {string} path
     * @returns {Promise<string|Blob|null>}
     */
    async readFile(path) {
        if (!this._puter?.fs) return null;
        try {
            return await this._puter.fs.read(path);
        } catch (error) {
            console.warn('[Puter] File read failed:', path, error);
            return null;
        }
    }

    /**
     * List files in a directory.
     * @param {string} path
     * @returns {Promise<Array|null>}
     */
    async listFiles(path) {
        if (!this._puter?.fs) return null;
        try {
            return await this._puter.fs.readdir(path);
        } catch (error) {
            console.warn('[Puter] File list failed:', path, error);
            return null;
        }
    }

    /**
     * Delete a file.
     * @param {string} path
     * @returns {Promise<boolean>}
     */
    async deleteFile(path) {
        if (!this._puter?.fs) return false;
        try {
            await this._puter.fs.delete(path);
            return true;
        } catch (error) {
            console.warn('[Puter] File delete failed:', path, error);
            return false;
        }
    }

    /**
     * Create a directory.
     * @param {string} path
     * @returns {Promise<boolean>}
     */
    async mkdir(path) {
        if (!this._puter?.fs) return false;
        try {
            await this._puter.fs.mkdir(path);
            return true;
        } catch (error) {
            console.warn('[Puter] Mkdir failed:', path, error);
            return false;
        }
    }

    // ── Real-Time Networking (Multiplayer) ────────────────────────────

    /**
     * Create a peer-to-peer connection for multiplayer.
     * Uses Puter's Peer module for WebRTC-based connections.
     *
     * @param {string} roomId - Room/channel identifier
     * @param {object} handlers - Event handlers
     * @param {function} handlers.onMessage - Called with messages from peers
     * @param {function} handlers.onPeerJoin - Called when a peer joins
     * @param {function} handlers.onPeerLeave - Called when a peer leaves
     * @returns {Promise<object|null>} Connection handle
     */
    async createMultiplayerRoom(roomId, handlers = {}) {
        if (!this._puter?.peer) {
            console.warn('[Puter] Peer networking unavailable');
            return null;
        }
        try {
            // Puter's Peer module allows peer-to-peer connections
            const server = this._puter.peer.serve({
                path: `/going-balls/multiplayer/${roomId}`,
                onConnection: (conn) => {
                    console.info('[Puter] Peer connected to room:', roomId);
                    if (handlers.onPeerJoin) handlers.onPeerJoin(conn);

                    conn.on('data', (data) => {
                        if (handlers.onMessage) handlers.onMessage(data, conn);
                    });

                    conn.on('close', () => {
                        console.info('[Puter] Peer disconnected from room:', roomId);
                        if (handlers.onPeerLeave) handlers.onPeerLeave(conn);
                    });
                }
            });
            return server;
        } catch (error) {
            console.warn('[Puter] Create multiplayer room failed:', error);
            return null;
        }
    }

    /**
     * Join a multiplayer room.
     * @param {string} roomId
     * @param {object} handlers
     * @returns {Promise<object|null>}
     */
    async joinMultiplayerRoom(roomId, handlers = {}) {
        if (!this._puter?.peer) return null;
        try {
            const conn = this._puter.peer.connect({
                path: `/going-balls/multiplayer/${roomId}`
            });

            conn.on('open', () => {
                console.info('[Puter] Joined multiplayer room:', roomId);
                if (handlers.onOpen) handlers.onOpen();
            });

            conn.on('data', (data) => {
                if (handlers.onMessage) handlers.onMessage(data);
            });

            conn.on('close', () => {
                console.info('[Puter] Left multiplayer room:', roomId);
                if (handlers.onClose) handlers.onClose();
            });

            return conn;
        } catch (error) {
            console.warn('[Puter] Join multiplayer room failed:', error);
            return null;
        }
    }

    // ── App Hosting ───────────────────────────────────────────────────

    /**
     * Publish a new version of the game to Puter hosting.
     * @param {object} opts - { version, description }
     * @returns {Promise<object|null>}
     */
    async publishGame(opts = {}) {
        if (!this._puter?.hosting) return null;
        try {
            const result = await this._puter.hosting.publish({
                version: opts.version || '1.0.0',
                description: opts.description || 'Going Balls game update'
            });
            console.info('[Puter] Game published:', result);
            return result;
        } catch (error) {
            console.warn('[Puter] Publish failed:', error);
            return null;
        }
    }

    // ── Workers (Serverless HTTP API Endpoints) ───────────────────────

    /**
     * Deploy a serverless worker from a JavaScript source string.
     *
     * Workers use a `router` object with Express-style route handlers:
     * @example
     * const code = `
     * router.get('/api/hello', async (event) => {
     *   return { message: 'Hello from worker!' };
     * });
     * `;
     * const w = await server.createWorker('my-api', code);
     * console.log('Worker URL:', w.url);
     *
     * @param {string} name - Unique worker name (alphanumeric + hyphens)
     * @param {string} code - JavaScript source code using `router.*()` handlers
     * @param {object} [options]
     * @param {boolean} [options.sandbox=true] - Run in isolated sandbox
     * @param {string} [options.appName] - Associate with an existing Puter app
     * @returns {Promise<object|null>} { name, url, status } or null on failure
     */
    async createWorker(name, code, options = {}) {
        if (!this._puter?.workers || !this._puter?.fs) {
            console.warn('[Puter] Workers API unavailable (requires fs + workers)');
            return null;
        }
        try {
            // 1. Write the worker code to a file in Puter's filesystem
            const fileName = `workers/${name}.js`;
            await this._puter.fs.write(fileName, code);

            // 2. Deploy the worker from the file path
            const result = await this._puter.workers.create(name, fileName, {
                sandbox: options.sandbox !== false,
                ...(options.appName ? { appName: options.appName } : {})
            });

            console.info('[Puter] Worker deployed:', name, result.url || '(pending propagation)');
            return {
                name,
                url: result.url || null,
                status: 'deploying',
                filePath: fileName,
                raw: result
            };
        } catch (error) {
            console.warn('[Puter] Worker creation failed:', error);
            return null;
        }
    }

    /**
     * Update an existing worker's code by overwriting its source file.
     * The worker redeploys automatically when the file changes.
     *
     * @param {string} name - Worker name
     * @param {string} code - New JavaScript source
     * @returns {Promise<boolean>}
     */
    async updateWorker(name, code) {
        if (!this._puter?.fs) return false;
        try {
            // Get the worker to find its file path
            const worker = await this.getWorker(name);
            if (!worker) {
                console.warn('[Puter] Cannot update worker — not found:', name);
                return false;
            }
            const filePath = worker.filePath || `workers/${name}.js`;
            await this._puter.fs.write(filePath, code);
            console.info('[Puter] Worker updated — redeploying:', name);
            return true;
        } catch (error) {
            console.warn('[Puter] Worker update failed:', name, error);
            return false;
        }
    }

    /**
     * List all deployed workers.
     * @returns {Promise<Array<object>>} Array of { name, url, status, createdAt }
     */
    async listWorkers() {
        if (!this._puter?.workers) return [];
        try {
            const list = await this._puter.workers.list();
            return (Array.isArray(list) ? list : []).map(w => ({
                name: w.name,
                url: w.url || null,
                status: w.status || 'unknown',
                createdAt: w.created_at || w.createdAt || null,
                filePath: w.file_path || null,
                raw: w
            }));
        } catch (error) {
            console.warn('[Puter] List workers failed:', error);
            return [];
        }
    }

    /**
     * Get metadata for a specific worker.
     * @param {string} name - Worker name
     * @returns {Promise<object|null>} Worker metadata or null
     */
    async getWorker(name) {
        if (!this._puter?.workers) return null;
        try {
            const worker = await this._puter.workers.get(name);
            if (!worker) return null;
            return {
                name: worker.name,
                url: worker.url || null,
                status: worker.status || 'unknown',
                createdAt: worker.created_at || worker.createdAt || null,
                filePath: worker.file_path || null,
                raw: worker
            };
        } catch (error) {
            console.warn('[Puter] Get worker failed:', name, error);
            return null;
        }
    }

    /**
     * Delete (undeploy) a worker.
     * @param {string} name - Worker name to delete
     * @returns {Promise<boolean>}
     */
    async deleteWorker(name) {
        if (!this._puter?.workers) return false;
        try {
            await this._puter.workers.delete(name);
            console.info('[Puter] Worker deleted:', name);
            return true;
        } catch (error) {
            console.warn('[Puter] Worker deletion failed:', name, error);
            return false;
        }
    }

    /**
     * Fetch recent logs for a worker.
     * Logs include invocations, errors, and console output from the worker sandbox.
     *
     * @param {string} name - Worker name
     * @param {object} [options]
     * @param {number} [options.limit=50] - Max log entries to fetch
     * @returns {Promise<Array<object>>} Array of log entries
     */
    async getWorkerLogs(name, options = {}) {
        if (!this._puter?.workers) return [];
        try {
            const limit = options.limit || 50;
            // Some Puter instances provide logs via the worker metadata;
            // otherwise attempt to fetch from a well-known logs endpoint
            const logs = await this._puter.workers.logs(name, { limit });
            return (Array.isArray(logs) ? logs : []).map(entry => ({
                timestamp: entry.timestamp || entry.ts || null,
                level: entry.level || 'info',
                message: entry.message || '',
                raw: entry
            }));
        } catch (error) {
            console.warn('[Puter] Fetch worker logs failed:', name, error);
            return [];
        }
    }

    /**
     * Deploy a ready-made Leaderboard Proxy worker.
     *
     * This serverless worker replaces the Python backend for leaderboard
     * operations. It exposes:
     *   GET  /api/leaderboard/:id     — fetch top N entries
     *   POST /api/leaderboard/:id     — submit a new score
     *   GET  /api/health              — health check
     *
     * The worker uses `puter.kv` as its backing store, with entries
     * stored under keys like `lb:global:player_abc`.
     *
     * @param {string} [name='going-balls-leaderboard'] - Worker name
     * @param {object} [options]
     * @param {number} [options.maxEntries=100] - Max entries per leaderboard
     * @returns {Promise<object|null>} { name, url } or null on failure
     */
    async deployLeaderboardProxy(name = 'going-balls-leaderboard', options = {}) {
        const maxEntries = options.maxEntries || 100;

        const workerCode = `
// ═══════════════════════════════════════════════════════════════════════════
// Going Balls — Leaderboard Proxy Worker
// Deployed by Puter Game Server
// ═══════════════════════════════════════════════════════════════════════════

const LEADERBOARD_PREFIX = 'lb:';
const MAX_ENTRIES = ${maxEntries};

// ── Helper: parse a JSON value from puter.kv ─────────────────────────────
async function kvGetParsed(key) {
    try {
        const raw = await puter.kv.get(key);
        if (raw === undefined || raw === null) return null;
        try { return JSON.parse(raw); } catch { return raw; }
    } catch { return null; }
}

// ── GET /api/leaderboard/:id ──────────────────────────────────────────────
// Returns top N entries for a leaderboard, sorted by score descending.
router.get('/api/leaderboard/:id', async (event) => {
    const lbId = event.params && event.params.id;
    if (!lbId) return { error: 'Missing leaderboard ID', status: 400 };

    // Parse optional query params: ?limit=10&offset=0
    const url = new URL(event.request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10) || 10, MAX_ENTRIES);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;

    try {
        // List all entries for this leaderboard
        const entries = await puter.kv.list({
            pattern: \`\${LEADERBOARD_PREFIX}\${lbId}:\`,
            returnValues: true
        });

        if (!Array.isArray(entries)) {
            return { entries: [], total: 0, limit, offset };
        }

        // Parse and sort by score descending
        const parsed = entries
            .map(e => {
                try {
                    if (typeof e === 'object' && e.value) {
                        const val = JSON.parse(e.value);
                        return {
                            playerName: val.playerName || 'Unknown',
                            score: val.score || 0,
                            level: val.level || 0,
                            time: val.time || null,
                            ball: val.ball || null,
                            submittedAt: val.submittedAt || e.timestamp || null
                        };
                    }
                } catch { /* skip malformed */ }
                return null;
            })
            .filter(Boolean)
            .sort((a, b) => (b.score || 0) - (a.score || 0));

        const total = parsed.length;
        const page = parsed.slice(offset, offset + limit);

        return {
            entries: page,
            total,
            limit,
            offset,
            leaderboardId: lbId
        };
    } catch (error) {
        return { error: 'Failed to fetch leaderboard', details: error.message, status: 500 };
    }
});

// ── POST /api/leaderboard/:id ─────────────────────────────────────────────
// Submit a score. Body: { playerId, playerName, score, level, time, ball }
router.post('/api/leaderboard/:id', async (event) => {
    const lbId = event.params && event.params.id;
    if (!lbId) return { error: 'Missing leaderboard ID', status: 400 };

    let body;
    try {
        body = await event.request.json();
    } catch {
        return { error: 'Invalid JSON body', status: 400 };
    }

    const playerId = body.playerId || body.player_id;
    if (!playerId) return { error: 'Missing playerId', status: 400 };

    const entry = {
        playerId,
        playerName: body.playerName || 'Unknown',
        score: Math.max(0, parseInt(body.score, 10) || 0),
        level: Math.max(0, parseInt(body.level, 10) || 0),
        time: body.time ? String(body.time) : null,
        ball: body.ball || null,
        submittedAt: new Date().toISOString()
    };

    try {
        // Store under lb:<leaderboardId>:<playerId>
        const key = \`\${LEADERBOARD_PREFIX}\${lbId}:\${playerId}\`;
        await puter.kv.set(key, JSON.stringify(entry));

        return {
            success: true,
            entry,
            leaderboardId: lbId
        };
    } catch (error) {
        return { error: 'Failed to save entry', details: error.message, status: 500 };
    }
});

// ── GET /api/health ────────────────────────────────────────────────────────
router.get('/api/health', async () => {
    return {
        status: 'ok',
        service: 'going-balls-leaderboard',
        timestamp: new Date().toISOString(),
        maxEntries: MAX_ENTRIES
    };
});

// ── Root — API index ─────────────────────────────────────────────────────
router.get('/', async () => {
    return {
        service: 'Going Balls Leaderboard Proxy',
        endpoints: {
            'GET  /api/leaderboard/:id': 'Fetch top entries (query: limit, offset)',
            'POST /api/leaderboard/:id': 'Submit a score (body: playerId, playerName, score, level, time, ball)',
            'GET  /api/health': 'Health check'
        },
        version: '1.0.0'
    };
});
`;

        return this.createWorker(name, workerCode, { sandbox: true });
    }

    /**
     * Deploy a ready-made Score Verification worker.
     *
     * This serverless worker verifies score proofs to prevent leaderboard
     * tampering. It uses a shared secret to validate that scores were
     * generated by the legitimate game client.
     *
     * Verification:
     *   Client computes: btoa(score + ":" + secret + ":" + playerId)
     *   Worker rejects if computed proof !== submitted proof
     *
     * Endpoints:
     *   POST /api/scores/verify   — verify a score submission
     *   GET  /api/health          — health check
     *
     * @param {string} [name='going-balls-score-verification'] - Worker name
     * @param {object} [options]
     * @param {string} [options.secret] - Shared secret for proof verification
     * @returns {Promise<object|null>} { name, url } or null on failure
     */
    async deployScoreVerificationWorker(name = 'going-balls-score-verification', options = {}) {
        const secret = options.secret || 'going-balls-default-secret';

        const workerCode = `
// ═══════════════════════════════════════════════════════════════════════════
// Going Balls — Score Verification Worker
// Deployed by Puter Game Server
// ═══════════════════════════════════════════════════════════════════════════

const SCORE_SECRET = ${JSON.stringify(secret)};

// ── POST /api/scores/verify ───────────────────────────────────────────────
// Verifies a score proof. Body: { playerId, score, proof }
// Proof = btoa(score + ":" + secret + ":" + playerId)
router.post('/api/scores/verify', async (event) => {
    let body;
    try {
        body = await event.request.json();
    } catch {
        return { valid: false, error: 'Invalid JSON body', status: 400 };
    }

    const { playerId, score, proof } = body;

    // Validate required fields
    if (!playerId || score === undefined || score === null || !proof) {
        return {
            valid: false,
            error: 'Missing required fields: playerId, score, proof',
            status: 400
        };
    }

    // Constrain types to prevent injection
    const safePlayerId = String(playerId).slice(0, 64);
    const safeScore = Math.max(0, Math.min(999999999, parseInt(score, 10) || 0));

    try {
        // Recompute expected proof
        const expected = btoa(safeScore + ':' + SCORE_SECRET + ':' + safePlayerId);

        if (proof !== expected) {
            return {
                valid: false,
                reason: 'proof_mismatch',
                status: 403,
                message: 'Score proof does not match — possible tampering detected'
            };
        }

        return {
            valid: true,
            playerId: safePlayerId,
            score: safeScore
        };
    } catch (error) {
        return {
            valid: false,
            error: 'Verification failed',
            details: error.message,
            status: 500
        };
    }
});

// ── GET /api/health ────────────────────────────────────────────────────────
router.get('/api/health', async () => {
    return {
        status: 'ok',
        service: 'going-balls-score-verification',
        timestamp: new Date().toISOString()
    };
});

// ── Root — API index ─────────────────────────────────────────────────────
router.get('/', async () => {
    return {
        service: 'Going Balls Score Verification',
        description: 'Verifies score proofs to prevent leaderboard tampering',
        endpoints: {
            'POST /api/scores/verify': 'Verify a score proof (body: playerId, score, proof)',
            'GET  /api/health': 'Health check'
        },
        version: '1.0.0'
    };
});
`;

        return this.createWorker(name, workerCode, { sandbox: true });
    }

    // ── Status ────────────────────────────────────────────────────────

    /**
     * Check if the Puter game server is fully operational.
     * @returns {Promise<object>} Status object
     */
    async healthCheck() {
        try {
            const user = await this.getUser();
            const kvTest = await this.kvSet('healthcheck', { ts: Date.now() });
            return {
                available: true,
                authenticated: !!user,
                kvOperational: kvTest,
                user: user ? { id: user.id, username: user.username } : null,
                timestamp: Date.now()
            };
        } catch {
            return {
                available: false,
                authenticated: false,
                kvOperational: false,
                user: null,
                timestamp: Date.now()
            };
        }
    }
}

// ---------------------------------------------------------------------------
// Score Verification (module-level — no Puter dependency)
// ---------------------------------------------------------------------------

/**
 * Sign a score with the shared secret for proof of authenticity.
 *
 * The client computes: btoa(score + ":" + secret + ":" + playerId)
 * which the worker's deployScoreVerificationWorker() recomputes to verify.
 *
 * Use setScoreSecret() to configure a custom secret before calling this.
 * Must match the secret passed to deployScoreVerificationWorker() for verification to pass.
 *
 * @param {number} score - The player's score
 * @param {string} playerId - Unique player identifier (name or ID)
 * @returns {string|null} Base64-encoded proof string, or null on failure
 *
 * @example
 * import { setScoreSecret, signScore } from './puter_integration.js';
 * setScoreSecret('my-shared-secret');
 * const proof = signScore(9999, 'player_abc');
 * // proof === btoa('9999:my-shared-secret:player_abc')
 */
export function signScore(score, playerId) {
    try {
        const safeScore = Math.max(0, Math.min(999999999, parseInt(score, 10) || 0));
        const safePlayerId = String(playerId || 'anonymous').slice(0, 64);
        return btoa(String(safeScore) + ':' + _scoreSecret + ':' + safePlayerId);
    } catch {
        return null;
    }
}

/**
 * Configure the shared secret used by signScore().
 * Must match the secret passed to deployScoreVerificationWorker() for proofs to verify.
 *
 * @param {string} secret - Shared secret string
 *
 * @example
 * setScoreSecret('my-secret-key');
 * // Now deploy the worker with the same secret:
 * const worker = await server.deployScoreVerificationWorker('score-api', { secret: 'my-secret-key' });
 */
export function setScoreSecret(secret) {
    if (typeof secret === 'string' && secret.length > 0) {
        _scoreSecret = secret;
    }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _gameServerInstance = null;

/**
 * Get or create the Puter Game Server singleton.
 * Initializes Puter if not already initialized.
 *
 * @param {object} [options] - Passed to initPuter()
 * @returns {Promise<PuterGameServer|null>}
 */
export async function getGameServer(options = {}) {
    if (_gameServerInstance) return _gameServerInstance;

    const puter = await initPuter(options);
    if (!puter) return null;

    _gameServerInstance = new PuterGameServer(puter);
    return _gameServerInstance;
}

/**
 * Reset the singleton (for testing / re-initialization).
 */
export function resetGameServer() {
    _gameServerInstance = null;
    _puterInstance = null;
    _isInitialized = false;
    _initPromise = null;
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default {
    initPuter,
    isPuterReady,
    puterReady,
    getGameServer,
    resetGameServer,
};
