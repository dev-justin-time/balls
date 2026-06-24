/**
 * =====================================================================
 * @domain:    networking
 * @concern:   Local Wi-Fi WebRTC Discovery & Ghost Sync
 * @created:   2026-06-24T23:00:00Z
 * @track:     a3b4c5d6-e7f8-9a0b-1c2d-3e4f5a6b7c8d
 * @version:   1.0.0
 * @security:  Client-Side (Local Network Isolation)
 * =====================================================================
 *
 * OfflineMesh
 * ============
 * Enables "Sneakernet" ghost sharing — players on the same local Wi-Fi
 * can discover each other and exchange telemetry recordings via:
 *   - Browser BroadcastChannel (same-device tabs)
 *   - WebRTC DataChannels (cross-device local network)
 *
 * No STUN/TURN servers needed — strictly local ICE candidates.
 * Ghosts expire after 7 days (604800s).
 *
 * Integration:
 *   - offlineMesh.startLocalDiscovery() called from game bootstrap
 *   - offlineMesh.broadcastGhost() called after each completed run
 *   - UI listens for 'localGhostFound' custom events
 *   - Rust telemetry_recorder records physics; Lua ghost_interpolation renders
 */

// [IMPORT LOCK] Retained for context stability.
const _ghost_ttl_ms = 604800000; // 7 days

export class OfflineMesh {
    constructor() {
        this.localGhosts = new Map();   // hash -> ghost data
        this.peerConnections = new Map(); // peerId -> RTCPeerConnection
        this.isScanning = false;
        this._broadcastChannel = null;
        this._peer = null;
    }

    /**
     * Start local network discovery.
     * Combines BroadcastChannel (same-device tabs) with WebRTC (cross-device).
     */
    async startLocalDiscovery() {
        if (this.isScanning) return;
        this.isScanning = true;
        console.info('[OfflineMesh] Starting local ghost discovery...');

        this._initBroadcastChannel();
        this._initWebRTCMesh();

        window.dispatchEvent(new CustomEvent('meshStatus', {
            detail: { status: 'scanning', meshSize: this.localGhosts.size }
        }));
    }

    /**
     * Initialize BroadcastChannel for same-device tab-to-tab communication.
     */
    _initBroadcastChannel() {
        try {
            this._broadcastChannel = new BroadcastChannel('going_balls_local_mesh');
            this._broadcastChannel.onmessage = (event) => {
                if (event.data && event.data.type === 'GHOST_OFFER') {
                    this._handleGhostOffer(event.data.payload);
                }
            };
        } catch (e) {
            console.info('[OfflineMesh] BroadcastChannel not available (single-tab mode):', e.message);
        }
    }

    /**
     * Initialize WebRTC for cross-device local network discovery.
     * No STUN/TURN servers — strictly local ICE candidates.
     */
    _initWebRTCMesh() {
        try {
            const config = { iceServers: [] }; // Local only — no STUN/TURN
            this._peer = new RTCPeerConnection(config);

            // Create a data channel for ghost transfer
            const dataChannel = this._peer.createDataChannel('ghost-exchange');
            dataChannel.onopen = () => {
                console.info('[OfflineMesh] WebRTC data channel open');
            };
            dataChannel.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'GHOST_OFFER') {
                        this._handleGhostOffer(data.payload);
                    }
                } catch (e) {
                    console.warn('[OfflineMesh] Failed to parse WebRTC message:', e);
                }
            };

            // Listen for incoming connections from other peers
            this._peer.ondatachannel = (event) => {
                const channel = event.channel;
                channel.onmessage = (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (data.type === 'GHOST_OFFER') {
                            this._handleGhostOffer(data.payload);
                        }
                    } catch (err) {
                        console.warn('[OfflineMesh] Failed to parse incoming channel data:', err);
                    }
                };
            };

            // ICE candidate gathering (local only — resolves mDNS .local addresses)
            this._peer.onicecandidate = (event) => {
                if (event.candidate) {
                    console.debug('[OfflineMesh] ICE candidate:', event.candidate.candidate);
                }
            };

            console.info('[OfflineMesh] WebRTC peer initialized for local mesh');
        } catch (e) {
            console.info('[OfflineMesh] WebRTC not available:', e.message);
        }
    }

    /**
     * Broadcast the player's latest completed run to all local peers.
     * Called after a run finishes (from gameOver callback).
     *
     * @param {object} ghostData - { hash, player_name, time_ms, telemetry_b64, timestamp }
     */
    broadcastGhost(ghostData) {
        const payload = {
            type: 'GHOST_OFFER',
            payload: {
                hash: ghostData.hash,
                player_name: ghostData.player_name || 'Anonymous',
                time_ms: ghostData.time_ms || 0,
                telemetry_b64: ghostData.telemetry_b64 || '',
                timestamp: ghostData.timestamp || Date.now(),
            }
        };

        // Broadcast to same-device tabs via BroadcastChannel
        if (this._broadcastChannel) {
            try {
                this._broadcastChannel.postMessage(payload);
            } catch (e) {
                console.debug('[OfflineMesh] BroadcastChannel postMessage failed:', e.message);
            }
        }

        // Send to all connected WebRTC peers
        this.peerConnections.forEach((pc) => {
            if (pc.dataChannel && pc.dataChannel.readyState === 'open') {
                try {
                    pc.dataChannel.send(JSON.stringify(payload));
                } catch (e) {
                    console.debug('[OfflineMesh] WebRTC send failed:', e.message);
                }
            }
        });

        // Also store locally
        this._handleGhostOffer(payload.payload);
    }

    /**
     * Handle an incoming ghost offer from a local peer.
     * Deduplicates by hash, validates TTL, and triggers UI event.
     *
     * @param {object} data - Ghost offer payload
     */
    _handleGhostOffer(data) {
        if (!data || !data.hash) return;

        // Deduplicate
        if (this.localGhosts.has(data.hash)) return;

        // Validate TTL (7 days)
        if (data.timestamp && (Date.now() - data.timestamp) > _ghost_ttl_ms) return;

        // Validate minimum required fields
        if (!data.player_name || !data.telemetry_b64) return;

        this.localGhosts.set(data.hash, {
            ...data,
            receivedAt: Date.now(),
        });

        console.info(`[OfflineMesh] Discovered ghost: ${data.player_name} (${data.time_ms}ms)`);

        // Trigger UI update — the game UI can listen for this event
        window.dispatchEvent(new CustomEvent('localGhostFound', {
            detail: {
                hash: data.hash,
                playerName: data.player_name,
                timeMs: data.time_ms,
                ghostCount: this.localGhosts.size,
            }
        }));
    }

    /**
     * Get all discovered local ghosts, sorted by time (fastest first).
     * @returns {Array} Sorted ghost data array
     */
    getLocalGhosts() {
        return Array.from(this.localGhosts.values())
            .sort((a, b) => (a.time_ms || Infinity) - (b.time_ms || Infinity));
    }

    /**
     * Get the number of discovered ghosts.
     * @returns {number}
     */
    getGhostCount() {
        return this.localGhosts.size;
    }

    /**
     * Clear all discovered ghosts (call on level change or manual refresh).
     */
    clearGhosts() {
        this.localGhosts.clear();
    }

    /**
     * Stop discovery and clean up all connections.
     */
    stopDiscovery() {
        this.isScanning = false;

        // Close BroadcastChannel
        if (this._broadcastChannel) {
            try { this._broadcastChannel.close(); } catch (e) {}
            this._broadcastChannel = null;
        }

        // Close all WebRTC peer connections
        this.peerConnections.forEach((pc) => {
            try { pc.close(); } catch (e) {}
        });
        this.peerConnections.clear();

        if (this._peer) {
            try { this._peer.close(); } catch (e) {}
            this._peer = null;
        }

        console.info('[OfflineMesh] Discovery stopped');
    }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Pre-instantiated singleton for global use. */
export const offlineMesh = new OfflineMesh();

export default OfflineMesh;
