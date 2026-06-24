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
