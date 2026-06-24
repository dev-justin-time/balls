/**
 * =====================================================================
 * @domain:    security
 * @concern:   Client-Side Telemetry & Behavioral Biometrics
 * @created:   2026-06-24T22:00:00Z
 * @track:     c9d0e1f2-a3b4-5c6d-7e8f-9a0b1c2d3e4f
 * @version:   1.0.0
 * @security:  Client-Side (Asynchronous Non-Blocking)
 * =====================================================================
 *
 * FingerprintCollector
 * =====================
 * Collects hardware telemetry (Canvas, WebGL, Audio) and continuous
 * behavioral biometrics (mouse velocity, touch dynamics, keystroke timing).
 *
 * Data flow:
 *   1. Hardware profile gathered once per session
 *   2. Behavioral data sampled at 10% rate (non-blocking)
 *   3. Payload hashed via Rust WASM (fingerprint_hasher.rs)
 *   4. Sent to Python backend for AI anomaly detection
 *
 * Integration with existing modules:
 *   - scene_manager.js feeds rendering delta timing
 *   - Input system (mobile_controller.js) feeds touch dynamics
 *   - ipc_bridge.js routes hashed payload to WASM + Python
 *   - fingerprint.js provides the static baseline fingerprint
 */

import { quadCore } from '../core/ipc_bridge.js';
import { getAPIFingerprint } from '../fingerprint.js';

// [IMPORT LOCK] Retained for context stability.
const _behavioral_sample_rate = 0.1; // Sample 10% of inputs to save CPU
const _behavioral_buffer = [];

// ---------------------------------------------------------------------------
// FingerprintCollector
// ---------------------------------------------------------------------------

export class FingerprintCollector {
    constructor() {
        this.hardwareProfile = null;
        this.isInitialized = false;
        this.sessionId = null;
        this._behavioralBuffer = [];
        this._lastFlush = 0;
        this._flushInterval = 30000; // 30s between flushes
        this._initBehavioralTracking();
    }

    /**
     * Gather static hardware and browser telemetry.
     * Runs once per session. Caches result.
     * @returns {Promise<object>} Hardware profile
     */
    async collectHardwareProfile() {
        if (this.hardwareProfile) return this.hardwareProfile;

        // --- Canvas 2D fingerprint ---
        let canvasHash = 'canvas_unavailable';
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = "14px 'Arial'";
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('GoingBalls_FP', 2, 15);
            try {
                canvasHash = canvas.toDataURL();
            } catch (e) {
                canvasHash = 'canvas_security_error';
            }
        } catch (e) {
            canvasHash = 'canvas_error';
        }

        // --- WebGL renderer info ---
        let renderer = 'webgl_unavailable';
        try {
            const gl = document.createElement('canvas').getContext('webgl');
            const debugInfo = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
            renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
            const ext = gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
        } catch (e) {
            renderer = 'webgl_error';
        }

        // --- Audio fingerprint ---
        const audioFp = this._getAudioFingerprint();

        this.hardwareProfile = {
            screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
            languages: (navigator.languages || [navigator.language]).join(','),
            hardwareConcurrency: navigator.hardwareConcurrency || 0,
            deviceMemory: navigator.deviceMemory || 4,
            platform: navigator.platform || 'unknown',
            touchPoints: navigator.maxTouchPoints || 0,
            canvas_hash: canvasHash,
            webgl_renderer: renderer,
            audio_context: audioFp,
            userAgentHash: this._hashString(navigator.userAgent || ''),
        };

        this.isInitialized = true;
        return this.hardwareProfile;
    }

    /**
     * Generate a lightweight audio context fingerprint.
     * Uses oscillator + analyser to extract frequency-domain characteristics
     * that vary across audio stacks.
     * @returns {string} First 10 frequency bins as comma-separated values
     */
    _getAudioFingerprint() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return 'no_audio';
            const ctx = new AC();
            const osc = ctx.createOscillator();
            const analyser = ctx.createAnalyser();
            const gain = ctx.createGain();
            const scriptProcessor = ctx.createScriptProcessor(4096, 1, 1);

            gain.gain.value = 0; // Mute — no audible output
            osc.connect(analyser);
            analyser.connect(scriptProcessor);
            scriptProcessor.connect(ctx.destination);
            osc.start(0);

            const freqData = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(freqData);

            osc.stop();
            ctx.close().catch(() => {});

            return Array.from(freqData.slice(0, 10)).join(',');
        } catch (e) {
            return 'audio_error';
        }
    }

    /**
     * Initialize behavioral tracking event listeners.
     * Samples mouse movement, pointer clicks, and touch/pointer events.
     * All callbacks are throttled via _recordBehavior to 10% sample rate.
     */
    _initBehavioralTracking() {
        // Mouse movement — captures velocity vectors
        window.addEventListener('mousemove', (e) => {
            this._recordBehavior('mouse', e.movementX, e.movementY);
        }, { passive: true });

        // Pointer down (clicks / touches)
        window.addEventListener('pointerdown', (e) => {
            this._recordBehavior('click', e.clientX, e.clientY);
        }, { passive: true });

        // Pointer up (release timing)
        window.addEventListener('pointerup', (e) => {
            this._recordBehavior('release', e.clientX, e.clientY);
        }, { passive: true });

        // Scroll events
        window.addEventListener('wheel', (e) => {
            this._recordBehavior('scroll', e.deltaX, e.deltaY);
        }, { passive: true });

        // Key events — timing between keystrokes is unique per person
        window.addEventListener('keydown', (e) => {
            this._recordBehavior('key', e.keyCode || 0, 0);
        }, { passive: true });
    }

    /**
     * Record a single behavioral sample at the configured sampling rate.
     * @param {string} type - Event type ('mouse', 'click', 'release', 'scroll', 'key')
     * @param {number} val1 - Primary value (movementX, clientX, deltaX, keyCode)
     * @param {number} val2 - Secondary value (movementY, clientY, deltaY)
     */
    _recordBehavior(type, val1, val2) {
        // Sample at configured rate to save CPU
        if (Math.random() > _behavioral_sample_rate) return;

        this._behavioralBuffer.push({
            t: Date.now(),
            type,
            v1: typeof val1 === 'number' ? Math.round(val1) : 0,
            v2: typeof val2 === 'number' ? Math.round(val2) : 0,
        });

        // Flush if buffer exceeds threshold OR if enough time has passed
        if (this._behavioralBuffer.length >= 50) {
            this.flushBehavioralData();
        }
    }

    /**
     * Flush buffered behavioral data to the security backend.
     * Hashes the full payload via Rust WASM for tamper resistance,
     * then sends to the Python telemetry endpoint.
     * @returns {Promise<boolean>} Whether flush succeeded
     */
    async flushBehavioralData() {
        if (this._behavioralBuffer.length === 0) return false;

        // Throttle: don't flush more often than _flushInterval
        const now = Date.now();
        if (now - this._lastFlush < this._flushInterval) return false;
        this._lastFlush = now;

        try {
            const profile = await this.collectHardwareProfile();
            const payload = {
                profile,
                behavior: this._behavioralBuffer,
                session_id: this._getSessionId(),
                api_fingerprint: getAPIFingerprint(),
                ts: now,
            };

            // Offload hashing to Rust WASM for security (anti-tamper)
            let hashedPayload = '';
            try {
                if (quadCore.wasmModule && typeof quadCore.wasmModule.hash_fingerprint === 'function') {
                    hashedPayload = quadCore.wasmModule.hash_fingerprint(JSON.stringify(payload));
                } else {
                    // Fallback JS hash when WASM not available
                    hashedPayload = this._hashString(JSON.stringify(payload));
                }
            } catch (e) {
                hashedPayload = this._hashString(JSON.stringify(payload));
            }

            // Send to Python backend asynchronously (fire-and-forget)
            const response = await fetch(
                `${quadCore.pythonApiBase || 'http://localhost:8000'}/api/security/telemetry`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fp_hash: hashedPayload,
                        raw_behavior: this._behavioralBuffer,
                        session_id: this.sessionId,
                        hardware_profile: profile,
                    }),
                }
            ).catch(() => null);

            // Clear the buffer on success
            if (response && response.ok) {
                this._behavioralBuffer.length = 0;
                return true;
            }

            // On failure, keep the buffer for next flush
            return false;
        } catch (e) {
            console.debug('[Security] Telemetry flush failed (non-critical):', e);
            return false;
        }
    }

    /**
     * Get or create a stable session ID stored in sessionStorage.
     * @returns {string} Session UUID
     */
    _getSessionId() {
        if (this.sessionId) return this.sessionId;
        try {
            let sid = sessionStorage.getItem('fp_session_id');
            if (!sid) {
                sid = crypto.randomUUID
                    ? crypto.randomUUID()
                    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                        const r = Math.random() * 16 | 0;
                        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                    });
                sessionStorage.setItem('fp_session_id', sid);
            }
            this.sessionId = sid;
        } catch (e) {
            this.sessionId = 'fallback_' + Date.now().toString(36);
        }
        return this.sessionId;
    }

    /**
     * Simple non-cryptographic string hash for fallback hashing.
     * @param {string} str
     * @returns {string} Hex hash
     */
    _hashString(str) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16);
    }

    /**
     * Force an immediate flush regardless of throttle.
     * Call during level transitions or game state changes.
     * @returns {Promise<boolean>}
     */
    async forceFlush() {
        this._lastFlush = 0;
        return this.flushBehavioralData();
    }

    /**
     * Start the periodic flush timer.
     * Call after game initialization.
     */
    startPeriodicFlush() {
        this._flushTimer = setInterval(() => {
            this.flushBehavioralData();
        }, this._flushInterval);
    }

    /**
     * Stop the periodic flush timer.
     * Call on game shutdown.
     */
    stopPeriodicFlush() {
        if (this._flushTimer) {
            clearInterval(this._flushTimer);
            this._flushTimer = null;
        }
    }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Pre-instantiated singleton for global use. */
export const fpCollector = new FingerprintCollector();

export default FingerprintCollector;
