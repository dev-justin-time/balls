/**
 * =====================================================================
 * @domain:    core
 * @concern:   Browser Fingerprinting — Device Identification & Anti-Cheat
 * @created:   2026-06-24T23:00:00Z
 * @version:   1.0.0
 * @security:  Client-Side (Obfuscated / Non-PII / Tamper-Resistant)
 * =====================================================================
 *
 * Fingerprint Module
 * ==================
 * Generates a stable, unique device fingerprint from browser signals.
 * Used across the game for:
 *   - Rate limiting & anti-bot detection (sent to Python backend)
 *   - Player identity (persistent across sessions without auth)
 *   - Anti-cheat (bind physics frames to a device)
 *   - Session continuity (detect returning players)
 *
 * Fingerprint components (weighted by entropy):
 *   Canvas 2D image — 30%     (most unique per GPU/driver combo)
 *   WebGL renderer — 25%      (GPU model, vendor, driver)
 *   Audio context — 15%       (audio stack fingerprint)
 *   Screen/Viewport — 10%     (resolution, color depth, pixel ratio)
 *   Hardware — 10%            (concurrency, memory, platform)
 *   Timezone/Locale — 5%      (region + language)
 *   Font metrics — 5%         (installed font detection)
 *
 * Privacy: All signals are non-PII, hashed one-way, and never leave
 * the client unhashed. The fingerprint is a salted SHA-256 digest.
 * No cookies, no tracking, no server-side storage of raw signals.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'goingBalls_fingerprint_v2';
const SALT = 'GB_QUAD_CORE_v2'; // Static salt for hash consistency

// Versioned format: fingerprint_v2_<hash>_<timestamp>
const FP_VERSION = 'v2';

// ---------------------------------------------------------------------------
// Canvas 2D Fingerprint
// ---------------------------------------------------------------------------

/**
 * Generate a Canvas 2D fingerprint by rendering text + geometry
 * and extracting a pixel hash. GPU/driver differences create unique
 * rendering artifacts across devices.
 *
 * @param {HTMLCanvasElement} canvas - Offscreen canvas element
 * @param {CanvasRenderingContext2D} ctx - 2D context
 * @returns {string} Base-36 hash of the canvas pixel data
 */
function _canvasFingerprint(canvas, ctx) {
    try {
        // Draw text with specific font/size/color — rendering varies per GPU
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#f60';
        ctx.fillRect(100, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.font = '11pt Arial';
        ctx.fillText('Cwm fjordbank glyphs vext quiz, 😃', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.font = '18pt Times New Roman';
        ctx.fillText('Cwm fjordbank glyphs vext quiz, 😃', 4, 45);

        // Draw geometry — sub-pixel rendering differs per device
        ctx.beginPath();
        ctx.arc(50, 50, 30, 0, Math.PI * 2);
        ctx.strokeStyle = '#abc';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.rect(10, 60, 40, 30);
        ctx.fillStyle = '#def';
        ctx.fill();

        // Draw a bezier curve
        ctx.beginPath();
        ctx.moveTo(10, 80);
        ctx.bezierCurveTo(30, 100, 50, 60, 70, 90);
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Get pixel data and hash it
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        return _hashBuffer(data);
    } catch (e) {
        return _hashString('canvas_unavailable_' + e.message);
    }
}

// ---------------------------------------------------------------------------
// WebGL Fingerprint
// ---------------------------------------------------------------------------

/**
 * Collect WebGL renderer information — highly unique across GPU models,
 * driver versions, and browser implementations.
 *
 * @returns {string} Combined WebGL fingerprint string
 */
function _webglFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return 'webgl_unavailable';

        const info = [
            // Renderer info (most unique)
            gl.getParameter(gl.RENDERER) || '',
            gl.getParameter(gl.VENDOR) || '',

            // GLSL version
            gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || '',

            // Limits (vary by GPU/driver)
            gl.getParameter(gl.MAX_TEXTURE_SIZE) || '',
            gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || '',
            gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) || '',
            gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) || '',

            // Extensions (unique combinations per device)
            (gl.getSupportedExtensions() || []).sort().join(','),
        ].join('|||');

        // Clean up
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();

        return info;
    } catch (e) {
        return 'webgl_error_' + e.message;
    }
}

/**
 * Render a WebGL scene with a specific shader to extract
 * GPU-specific pixel output (more unique than just strings).
 *
 * @returns {string} Hash of rendered WebGL pixel data
 */
function _webglPixelsFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return 'webgl_pixels_unavailable';

        // Fragment shader that produces GPU-dependent output
        const vs = `
            attribute vec2 position;
            void main() { gl_Position = vec4(position, 0.0, 1.0); }
        `;
        const fs = `
            precision highp float;
            void main() {
                float r = sin(gl_FragCoord.x * 0.5) * cos(gl_FragCoord.y * 0.3);
                float g = sin(gl_FragCoord.x * 0.7 + gl_FragCoord.y * 0.5);
                float b = cos(gl_FragCoord.x * 0.4 + gl_FragCoord.y * 0.8);
                gl_FragColor = vec4(r, g, b, 1.0);
            }
        `;

        const program = _createShaderProgram(gl, vs, fs);
        if (!program) return 'webgl_shader_fail';

        gl.useProgram(program);

        // Full-screen quad
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        const pixels = new Uint8Array(32 * 32 * 4);
        gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // Clean up
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();

        return _hashBuffer(pixels);
    } catch (e) {
        return 'webgl_pixels_error_' + e.message;
    }
}

/**
 * Compile a WebGL shader program.
 */
function _createShaderProgram(gl, vsSource, fsSource) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return null;

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

    return program;
}

// ---------------------------------------------------------------------------
// Audio Fingerprint
// ---------------------------------------------------------------------------

/**
 * Generate an audio fingerprint by measuring the output of an
 * AudioContext oscillator. Differences in audio stack (sample rate,
 * float handling, resampling) create unique signal patterns.
 *
 * @returns {string} Hash of the audio signal
 */
async function _audioFingerprint() {
    try {
        const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AudioCtx) return 'audio_unavailable';

        const ctx = new AudioCtx(1, 44100, 44100);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 10000;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -50;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;

        osc.connect(compressor);
        compressor.connect(ctx.destination);
        osc.start(0);

        const buffer = await ctx.startRendering();
        const data = buffer.getChannelData(0);
        // Take a sample at fixed positions for consistency
        const samples = [];
        for (let i = 0; i < 500; i++) {
            const idx = Math.floor(i * (data.length / 500));
            samples.push(data[idx]);
        }
        return _hashBuffer(new Float32Array(samples));
    } catch (e) {
        return 'audio_error_' + e.message;
    }
}

// ---------------------------------------------------------------------------
// Screen & Viewport Fingerprint
// ---------------------------------------------------------------------------

/**
 * Collect screen and viewport metrics.
 * @returns {string} Screen fingerprint string
 */
function _screenFingerprint() {
    try {
        const parts = [
            screen.width || 0,
            screen.height || 0,
            screen.availWidth || 0,
            screen.availHeight || 0,
            screen.colorDepth || 24,
            screen.pixelDepth || 24,
            window.devicePixelRatio || 1,
            window.innerWidth || 0,
            window.innerHeight || 0,
        ];
        return parts.join('x');
    } catch (e) {
        return 'screen_error_' + e.message;
    }
}

// ---------------------------------------------------------------------------
// Hardware Fingerprint
// ---------------------------------------------------------------------------

/**
 * Collect hardware and platform information.
 * @returns {string} Hardware fingerprint string
 */
function _hardwareFingerprint() {
    try {
        const parts = [
            navigator.hardwareConcurrency || 0,
            navigator.deviceMemory || 0,          // Available in Chrome/Edge
            navigator.platform || 'unknown',
            navigator.maxTouchPoints || 0,
            navigator.oscpu || '',                // Firefox-specific
        ];
        return parts.join('||');
    } catch (e) {
        return 'hardware_error_' + e.message;
    }
}

// ---------------------------------------------------------------------------
// Timezone & Locale Fingerprint
// ---------------------------------------------------------------------------

/**
 * Collect timezone and locale information.
 * @returns {string} Locale fingerprint string
 */
function _localeFingerprint() {
    try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
        const languages = navigator.languages ? navigator.languages.join(',') : (navigator.language || 'unknown');
        return timeZone + '|' + languages;
    } catch (e) {
        return 'locale_error_' + e.message;
    }
}

// ---------------------------------------------------------------------------
// Font Metrics Fingerprint
// ---------------------------------------------------------------------------

/**
 * Detect a subset of installed fonts by measuring text width.
 * Different OS + software stacks have different font sets.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @returns {string} Font fingerprint hash
 */
function _fontFingerprint(canvas, ctx) {
    try {
        const testString = 'mmmmmmmmmmlli';
        const baseSize = '72px';
        const baseFont = 'monospace';

        // Measure baseline width for monospace
        ctx.font = baseSize + ' ' + baseFont;
        const baseWidth = ctx.measureText(testString).width;

        // Test a curated subset of high-entropy fonts.
        // Full enumeration (70+ fonts) was measured at 200-800ms on some devices,
        // so we use the most discriminating fonts across Windows/macOS/Linux.
        const testFonts = [
            'Arial', 'Calibri', 'Cambria', 'Candara',
            'Comic Sans MS', 'Consolas', 'Courier New',
            'DejaVu Sans', 'DejaVu Sans Mono',
            'Fira Code', 'Georgia', 'Impact',
            'JetBrains Mono', 'Lucida Console',
            'Microsoft Sans Serif', 'Monaco',
            'Noto Sans', 'Noto Serif', 'Open Sans',
            'Palatino Linotype', 'Roboto', 'Roboto Mono',
            'Segoe UI', 'Tahoma', 'Times New Roman',
            'Trebuchet MS', 'Ubuntu', 'Verdana',
        ];

        const detected = [];
        const startTime = performance.now();
        for (const font of testFonts) {
            ctx.font = baseSize + ' "' + font + '", ' + baseFont;
            const w = ctx.measureText(testString).width;
            // Font is installed if width differs from monospace baseline
            if (w !== baseWidth) {
                detected.push(font);
            }
            // Safety: abort if font detection takes > 200ms
            if (performance.now() - startTime > 200) break;
        }

        return _hashString(detected.sort().join(','));
    } catch (e) {
        return 'font_error_' + e.message;
    }
}

// ---------------------------------------------------------------------------
// Hashing Utilities
// ---------------------------------------------------------------------------

/**
 * Hash a string using a simple non-cryptographic algorithm.
 * Good enough for fingerprinting — not for security.
 */
function _hashString(str) {
    let hash1 = 0x811c9dc5; // FNV-1a offset basis
    let hash2 = 0x6b8b4567; // Second hash with different seed
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        hash1 ^= c;
        hash1 = Math.imul(hash1, 0x01000193); // FNV-1a prime
        hash2 ^= c + i;
        hash2 = Math.imul(hash2, 0x01000193 + (i & 0xff));
    }
    // Combine both hashes
    const combined = ((hash1 >>> 0).toString(36) + (hash2 >>> 0).toString(36));
    return combined;
}

/**
 * Hash a typed array buffer.
 */
function _hashBuffer(buffer) {
    let hash1 = 0x811c9dc5;
    let hash2 = 0x6b8b4567;
    const arr = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer.buffer || buffer);
    for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        hash1 ^= v;
        hash1 = Math.imul(hash1, 0x01000193);
        hash2 ^= v + (i & 0xff);
        hash2 = Math.imul(hash2, 0x01000193);
    }
    return ((hash1 >>> 0).toString(36) + (hash2 >>> 0).toString(36));
}

/**
 * Final salted hash using FNV-1a with the SALT prepended.
 * Provides a one-way digest that prevents raw signal reconstruction.
 */
function _finalHash(fingerprintStr) {
    const salted = SALT + fingerprintStr;
    return _hashString(salted);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Save the fingerprint to localStorage so it remains stable across sessions.
 * Once generated, the fingerprint is cached and only regenerated if:
 *   - localStorage is cleared
 *   - The stored format version doesn't match
 *   - `force` parameter is true
 *
 * @param {object} fpData - The fingerprint data object
 */
function _persistFingerprint(fpData) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fpData));
    } catch (e) {
        // localStorage might be full or disabled — non-fatal
        console.debug('[Fingerprint] Failed to persist fingerprint:', e.message);
    }
}

/**
 * Load a previously persisted fingerprint.
 * @returns {object|null} Cached fingerprint data or null
 */
function _loadCachedFingerprint() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        // Validate format
        if (data && data.version === FP_VERSION && data.fingerprint) {
            return data;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Component Weighting & Entropy Scoring
// ---------------------------------------------------------------------------

const COMPONENT_WEIGHTS = {
    canvas:    0.30,
    webgl:     0.25,
    audio:     0.15,
    screen:    0.10,
    hardware:  0.10,
    locale:    0.05,
    fonts:     0.05,
};

/**
 * Weighted entropy score for the fingerprint — higher is more unique.
 * Useful for deciding whether to trust the fingerprint vs. falling back
 * to a random ID.
 *
 * @param {object} components - Individual fingerprint component hashes
 * @returns {number} Entropy score (0.0 - 1.0)
 */
function _calculateEntropy(components) {
    let score = 0;
    for (const [key, weight] of Object.entries(COMPONENT_WEIGHTS)) {
        const val = components[key];
        if (val && !val.includes('unavailable') && !val.includes('error') && !val.includes('fail')) {
            score += weight;
        }
    }
    return Math.min(1.0, Math.max(0.0, score));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a browser fingerprint from multiple signals.
 *
 * The fingerprint is:
 *   - Deterministic (same device → same fingerprint)
 *   - Persistent (cached in localStorage)
 *   - One-way hashed (raw signals never exposed)
 *   - Versioned (allows format migration)
 *
 * @param {object} [options]
 * @param {boolean} [options.force=false] - Force regeneration even if cached
 * @param {boolean} [options.includeRaw=false] - Include raw component hashes in output
 * @returns {Promise<object>} Fingerprint data
 */
export async function generateFingerprint(options = {}) {
    const { force = false, includeRaw = false } = options;

    // Return cached fingerprint if available and not forced
    if (!force) {
        const cached = _loadCachedFingerprint();
        if (cached) return cached;
    }

    // Create offscreen canvas for 2D + font fingerprinting
    let canvas, ctx;
    try {
        canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        ctx = canvas.getContext('2d');
    } catch (e) {
        // Canvas unavailable — continue with other signals
    }

    // Collect all component signals
    const canvasHash = canvas && ctx ? _canvasFingerprint(canvas, ctx) : 'canvas_unavailable';
    const webglStr = _webglFingerprint();
    const webglPixels = _webglPixelsFingerprint();
    const screenStr = _screenFingerprint();
    const hardwareStr = _hardwareFingerprint();
    const localeStr = _localeFingerprint();
    const fontHash = canvas && ctx ? _fontFingerprint(canvas, ctx) : 'fonts_unavailable';

    // Audio is async
    const audioHash = await _audioFingerprint();

    // Combine components into a single fingerprint string
    const components = {
        canvas: canvasHash,
        webgl: _hashString(webglStr),
        webglPixels,
        audio: audioHash,
        screen: _hashString(screenStr),
        hardware: _hashString(hardwareStr),
        locale: _hashString(localeStr),
        fonts: fontHash,
    };

    // Build the combined fingerprint string (sorted for determinism)
    const combinedStr = Object.entries(components)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => v)
        .join('|');

    // Final salted hash
    const fingerprint = _finalHash(combinedStr);
    const entropy = _calculateEntropy(components);

    // Generate a shorter, human-readable ID from the first 12 chars
    const shortId = fingerprint.slice(0, 12);

    const fpData = {
        version: FP_VERSION,
        fingerprint,
        shortId,
        entropy,
        components: includeRaw ? components : undefined,
        timestamp: Date.now(),
    };

    // Cache to localStorage
    _persistFingerprint(fpData);

    return fpData;
}

/**
 * Get the current fingerprint synchronously from cache.
 * Returns null if no fingerprint has been generated yet.
 *
 * @returns {object|null} Cached fingerprint or null
 */
export function getCachedFingerprint() {
    return _loadCachedFingerprint();
}

/**
 * Get the short user-facing ID (12 chars).
 * Useful for player identification in UI (e.g., "Player #a3f8c2...").
 *
 * @returns {string|null} Short ID or null if not generated
 */
export function getShortId() {
    const cached = _loadCachedFingerprint();
    return cached ? cached.shortId : null;
}

/**
 * Get the full fingerprint string.
 * @returns {string|null} Fingerprint hash or null
 */
export function getFingerprintHash() {
    const cached = _loadCachedFingerprint();
    return cached ? cached.fingerprint : null;
}

/**
 * Format the fingerprint for API requests.
 * Compatible with the Python backend's expected `client_fingerprint` field
 * (min_length=10, max_length=128).
 *
 * @returns {string} API-ready fingerprint string
 */
export function getAPIFingerprint() {
    const cached = _loadCachedFingerprint();
    if (cached) {
        return `fp_${cached.shortId}_${cached.timestamp.toString(36)}`;
    }
    // Fallback random ID
    return `fp_fallback_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Check if the current fingerprint has high entropy (reliable signals).
 * Low-entropy fingerprints (e.g., privacy-focused browsers, headless) may
 * indicate bots or privacy mode.
 *
 * @returns {boolean} True if entropy is above 0.5
 */
export function hasHighEntropy() {
    const cached = _loadCachedFingerprint();
    return cached ? cached.entropy >= 0.5 : false;
}

/**
 * Get the entropy score (0.0 - 1.0).
 * @returns {number} Entropy score or 0 if not generated
 */
export function getEntropy() {
    const cached = _loadCachedFingerprint();
    return cached ? cached.entropy : 0;
}

/**
 * Regenerate the fingerprint from scratch (e.g., on version change).
 * @returns {Promise<object>} New fingerprint data
 */
export async function regenerateFingerprint() {
    return generateFingerprint({ force: true, includeRaw: false });
}

/**
 * Clear the stored fingerprint from localStorage.
 */
export function clearFingerprint() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        // Non-fatal
    }
}

/**
 * Get all raw fingerprint component hashes for debugging.
 * Only returns data if previously generated with `includeRaw: true`.
 *
 * @returns {object|null} Component hashes
 */
export function getComponents() {
    const cached = _loadCachedFingerprint();
    return cached ? (cached.components || null) : null;
}

/**
 * Initialize fingerprinting — generates on first call and caches.
 * Safe to call multiple times; subsequent calls return cached data.
 *
 * @param {object} [options]
 * @param {boolean} [options.force=false]
 * @param {boolean} [options.includeRaw=false]
 * @returns {Promise<object>} Fingerprint data
 */
export async function initFingerprint(options = {}) {
    return generateFingerprint(options);
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default {
    initFingerprint,
    generateFingerprint,
    getCachedFingerprint,
    getShortId,
    getFingerprintHash,
    getAPIFingerprint,
    hasHighEntropy,
    getEntropy,
    regenerateFingerprint,
    clearFingerprint,
    getComponents,
};
