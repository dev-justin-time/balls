import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import nipplejs from 'nipplejs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BALL_DB } from './ball_db.js';
import { renderBallIndexUI } from './ball_index_ui.js';
import { NotificationManager } from './notification_manager.js';

// Simple loading manager UI using Three's DefaultLoadingManager so textures and GLB model progress are shown.
if (typeof document !== 'undefined') {
    const loadingBar = () => document.getElementById('loading-bar');
    const loadingText = () => document.getElementById('loading-text');
    const progressEl = () => document.getElementById('loading-progress');

    const manager = THREE.DefaultLoadingManager;
    manager.onStart = function (url, itemsLoaded, itemsTotal) {
        try {
            if (loadingText()) loadingText().innerText = `Started loading ${itemsTotal} asset(s)...`;
            if (loadingBar()) loadingBar().style.width = '0%';
        } catch (e) {}
    };
    manager.onProgress = function (url, itemsLoaded, itemsTotal) {
        try {
            const pct = Math.round((itemsLoaded / itemsTotal) * 100);
            if (loadingBar()) loadingBar().style.width = pct + '%';
            if (loadingText()) loadingText().innerText = `Loading ${itemsLoaded}/${itemsTotal}: ${url.split('/').pop()}`;
        } catch (e) {}
    };
    manager.onLoad = function () {
        try {
            if (loadingBar()) loadingBar().style.width = '100%';
            if (loadingText()) loadingText().innerText = `Finalizing...`;
            // small delay so user sees full bar
            setTimeout(() => {
                const overlay = document.getElementById('loading-overlay');
                if (overlay) overlay.style.transition = 'opacity 400ms ease', overlay.style.opacity = '0';
                setTimeout(() => { try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {} }, 450);
            }, 350);
        } catch (e) {}
    };
    manager.onError = function (url) {
        try {
            // Provide a concise user-facing message but avoid noisy console spamming for repeated network failures.
            const name = (url && url.split) ? url.split('/').pop() : String(url);
            if (loadingText()) loadingText().innerText = `Failed to load: ${name} — using fallback assets`;

            // Create a one-time unobtrusive toast so users know we fell back, but rate-limit it.
            if (!window.__goingBallsShownFallbackToast) {
                window.__goingBallsShownFallbackToast = true;
                try {
                    let t = document.getElementById('asset-fallback-toast');
                    if (!t) {
                        t = document.createElement('div');
                        t.id = 'asset-fallback-toast';
                        t.style.position = 'fixed';
                        t.style.right = '12px';
                        t.style.bottom = '12px';
                        t.style.padding = '10px 14px';
                        t.style.background = 'linear-gradient(90deg, rgba(0,0,0,0.85), rgba(30,30,30,0.85))';
                        t.style.color = '#fff';
                        t.style.borderRadius = '10px';
                        t.style.fontSize = '12px';
                        t.style.zIndex = '9999';
                        t.style.pointerEvents = 'auto';
                        t.style.boxShadow = '0 6px 18px rgba(0,0,0,0.5)';
                        t.innerText = 'Some network assets failed to load — using safe fallbacks.';
                        const dismiss = document.createElement('button');
                        dismiss.innerText = 'Dismiss';
                        dismiss.style.marginLeft = '10px';
                        dismiss.style.background = '#222';
                        dismiss.style.color = '#fff';
                        dismiss.style.border = 'none';
                        dismiss.style.padding = '6px 8px';
                        dismiss.style.borderRadius = '6px';
                        dismiss.style.cursor = 'pointer';
                        dismiss.addEventListener('click', () => { try { t.remove(); } catch(e){} });
                        t.appendChild(dismiss);
                        document.body.appendChild(t);
                    }
                } catch (e) {}
            }

            // Flag fallback mode so other systems adjust gracefully (already used elsewhere)
            window.__goingBallsAssetFallback = true;
        } catch (e) {
            // Keep this silent to avoid cascading errors during load failures.
        }
    };
}

// Initialize WebsimSocket for persistent player stats / leaderboard
// top-level await is allowed because this file is loaded as a module
const room = new WebsimSocket();
try {
    await room.initialize();
    // mark room ready for guarded access
    room.isReady = true;

    // helper to safely test remote availability
    window.__goingBallsRoomReady = () => (room && room.isReady && typeof room.collection === 'function');

    // Seed a persistent collection "ball_stats" with sample completed-ball records if empty.
    // This is best-effort and will not block the app on networking errors.
    (async () => {
        try {
            if (!window.__goingBallsRoomReady()) return;
            const coll = room.collection('ball_stats');
            const existing = coll.getList() || [];
            if (!existing || existing.length === 0) {
                const seeded = [
                    { ball_key: 'rainbow', played: 120, wins: 48, avg_time: 34.2, best_time: 18.6 },
                    { ball_key: 'wood', played: 42, wins: 10, avg_time: 47.1, best_time: 29.3 },
                    { ball_key: 'metal', played: 88, wins: 32, avg_time: 30.8, best_time: 16.9 },
                    { ball_key: 'lava', played: 15, wins: 3, avg_time: 52.4, best_time: 41.2 },
                    { ball_key: 'groovy', played: 5, wins: 1, avg_time: 28.7, best_time: 28.7 }
                ];
                for (const r of seeded) {
                    try {
                        await coll.create(r);
                    } catch (err) {
                        // ignore per-record errors (permissions/network)
                        console.warn('Failed to create ball_stats record (continuing):', err && err.message ? err.message : err);
                    }
                }
                console.info('Seeded ball_stats collection with sample records.');
            } else {
                console.info('ball_stats collection already populated, skipping seed.');
            }
        } catch (err) {
            console.warn('ball_stats seeding failed (continuing):', err && err.message ? err.message : err);
        }
    })();
} catch (e) {
    // Fail gracefully if the network/room init errors (avoid unhandled rejections)
    console.warn('WebsimSocket.initialize() failed — continuing in offline/fallback mode.', e && (e.message || e));
    window.__goingBallsRoomInitFailed = true;
    room.isReady = false;
    window.__goingBallsRoomReady = () => false;
}

// instantiate global notifier (pooled, rate-limited toast manager)
const notifier = new NotificationManager({
    maxConcurrent: 3,
    minIntervalMs: 300, // minimum ms between toasts
    containerId: 'goingballs-notification-container'
});

/*
 Global handlers to prevent unhandled promise rejections and runtime errors (including network/resource errors)
 from spamming the console or causing unexpected crashes. These handlers log useful diagnostics, attempt to
 suppress default browser error behavior, and provide a lightweight hint for network-related failures so
 the app can continue using fallbacks already implemented elsewhere in the code.
*/
window.addEventListener('unhandledrejection', (event) => {
    // Robust, rate-limited handling for promise rejections with stronger network/offline detection.
    try {
        const reason = event && event.reason;
        let msg = '';
        try {
            if (reason && typeof reason === 'string') msg = reason;
            else if (reason && typeof reason.message === 'string') msg = reason.message;
            else if (reason && typeof reason.toString === 'function') msg = String(reason.toString());
        } catch (e) { msg = ''; }
        const lower = (msg || '').toLowerCase();

        // Enhanced network/offline detection:
        const isNetworkError = (
            // explicit phrases commonly seen from fetch/XHR failure
            lower.includes('network') ||
            lower.includes('failed to fetch') ||
            lower.includes('networkerror') ||
            lower.includes('typeerror: networkerror') ||
            lower.includes('typeerror: failed to fetch') ||
            // some engines surface TypeError with only 'network error' wording
            lower.includes('network error') ||
            lower.includes('loading')
        );

        // If browser is offline (explicit) treat as network failure immediately
        const offline = (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine);

        if (isNetworkError || offline) {
            window.__goingBallsNetworkErrorCount = (window.__goingBallsNetworkErrorCount || 0) + 1;

            // Only show a single persistent user-facing notice once per session to avoid spamming.
            if (!window.__goingBallsNetworkErrorLogged) {
                window.__goingBallsNetworkErrorLogged = true;
                try { window.__goingBallsAssetFallback = true; } catch (e) {}

                // Prefer centralized notifier when available
                try {
                    if (typeof notifier !== 'undefined' && notifier && typeof notifier.notify === 'function') {
                        notifier.notify(offline ? 'You appear offline — using cached/fallback assets.' : 'Network assets failed — using fallbacks.', { persistent: true, type: 'warn' });
                    } else {
                        // simple DOM fallback toast
                        let t = document.getElementById('asset-fallback-toast');
                        if (!t) {
                            t = document.createElement('div');
                            t.id = 'asset-fallback-toast';
                            t.style.position = 'fixed';
                            t.style.right = '12px';
                            t.style.bottom = '12px';
                            t.style.padding = '10px 14px';
                            t.style.background = 'linear-gradient(90deg, rgba(0,0,0,0.85), rgba(30,30,30,0.85))';
                            t.style.color = '#fff';
                            t.style.borderRadius = '10px';
                            t.style.fontSize = '12px';
                            t.style.zIndex = '9999';
                            t.style.pointerEvents = 'auto';
                            t.style.boxShadow = '0 6px 18px rgba(0,0,0,0.5)';
                            t.innerText = offline ? 'Offline — using cached/fallback assets.' : 'Network assets failed — using fallbacks.';
                            const dismiss = document.createElement('button');
                            dismiss.innerText = 'Dismiss';
                            dismiss.style.marginLeft = '10px';
                            dismiss.style.background = '#222';
                            dismiss.style.color = '#fff';
                            dismiss.style.border = 'none';
                            dismiss.style.padding = '6px 8px';
                            dismiss.style.borderRadius = '6px';
                            dismiss.style.cursor = 'pointer';
                            dismiss.addEventListener('click', () => { try { t.remove(); } catch(e){} });
                            t.appendChild(dismiss);
                            document.body.appendChild(t);
                        }
                    }
                } catch (e) {
                    // swallow notification errors
                }
            }

            // Quiet logging: show concise info initially, then progressively suppress further repeats
            try {
                const c = window.__goingBallsNetworkErrorCount || 0;
                if (c <= 4) console.info('Network/resource unhandled rejection detected:', msg || reason);
                else if (c <= 12) console.debug('Additional network unhandled rejection (suppressed):', msg || reason);
                // otherwise remain silent to avoid flooding devtools
            } catch (e) {}
        } else {
            // Non-network rejections: log concisely to console.warn but avoid throwing stack traces here
            try { console.warn('Unhandled rejection:', msg || reason); } catch (e) {}
        }
    } catch (err) {
        try { console.warn('Unhandled rejection (inspect failed).'); } catch (e) {}
    }

    // Prevent default browser handler where possible (keep this to avoid redundant devtools noise)
    try { event.preventDefault && event.preventDefault(); } catch (e) {}
});

// Global window 'error' handler to catch synchronous resource/load errors (image/audio/script) and report them cleanly.
window.addEventListener('error', (evt) => {
    try {
        // evt.message may be undefined for resource loading errors, but evt.filename/lineno/col/stack are helpful.
        console.warn('Window error caught:', {
            message: evt.message || 'resource load error',
            filename: evt.filename,
            lineno: evt.lineno,
            colno: evt.colno,
            error: evt.error && evt.error.message ? evt.error.message : undefined
        });
    } catch (e) {
        console.warn('Window error caught (unable to read details).');
    }
    try { evt.preventDefault(); } catch (e) {}
});

// --- Configuration ---
const BALL_RADIUS = 0.5;
const GRAVITY = -45; // Even stronger gravity for "heavy" feel
const BALL_SPEED = 5000; // Scaled up for higher mass
const STEER_SPEED = 22;
const MAX_VELOCITY = 18; // Stable but faster limit
const JUMP_FORCE = 25; // Higher force needed to lift 100kg

class Game {
    constructor() {
        this.loadData();
        this.initAudio();
        this.initScene();
        this.initPhysics();
        this.initControls();
        this.createLevel();
        this.animate();
        this.setupUI();
        this.updateWalletUI();
    }

    loadData() {
        // small seeded RNG (mulberry32) utility and URL seed support
        function mulberry32(a) {
            return function() {
                let t = a += 0x6D2B79F5;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }
        // expose a safe rnd() helper on the instance that prefers seeded RNG when available
        this.rng = null;
        this.rnd = () => (this.rng ? this.rng() : Math.random());

        // read optional seed from URL param ?seed=12345 for deterministic levels/testing
        try {
            if (typeof window !== 'undefined' && window.location && window.location.search) {
                const params = new URLSearchParams(window.location.search);
                const s = params.get('seed');
                if (s !== null) {
                    const parsed = parseInt(s, 10);
                    if (!Number.isNaN(parsed)) {
                        this._seed = parsed;
                        this.rng = mulberry32(parsed >>> 0);
                        console.info('Deterministic seed enabled:', parsed);
                    }
                }
            }
        } catch (e) {
            // ignore URL parsing failures
        }

        // add persistent skinLevels to track ability tiers per skin
        const defaultData = {
            totalCoins: 0,
            unlockedBalls: ['rainbow'],
            unlockedSkies: ['day'],
            selectedBall: 'rainbow',
            selectedSky: 'day',
            // per-skin ability levels (1..5) and XP not used here but reserved
            skinLevels: { rainbow: 1 },
            // Powerups: track owned level (1..5) and equipped flag per powerup key
            powerups: {
                // sample starter powerup: magnet level 1 owned but not equipped
                // magnet: { level: 1, owned: true, equipped: false }
            },
            // Weather preferences and last-seen weather are persisted so the AI can learn simple patterns
            weatherPrefs: {
                lastWeather: 'clear', // clear, rain, snow, wind, mixed
                bias: {} // simple counter map to bias next weather selection
            }
        };
        this.saveData = JSON.parse(localStorage.getItem('goingBallsData_v1')) || defaultData;

        // Ball configs now include an "ability" object describing the linked powerup and base strength
        // abilities: { key: 'speed'|'jump'|'coins', base: number, perLevel: number } where higher level increases effect
        this.ballConfigs = {
            rainbow: { name: 'Rainbow', price: 0, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture', ability: { key: 'coins', base: 1.0, perLevel: 0.15 } },
            wood: { name: 'Wood', price: 50, tex: 'wood_texture.png', type: 'texture', ability: { key: 'jump', base: 1.0, perLevel: 0.07 } },
            metal: { name: 'Chrome', price: 150, tex: 'ball_metal.png', type: 'texture', ability: { key: 'speed', base: 1.0, perLevel: 0.06 } },
            lava: { name: 'Lava', price: 300, tex: 'ball_lava.png', type: 'texture', ability: { key: 'coins', base: 1.05, perLevel: 0.12 } },
            basketball: { name: 'Basketball', price: 80, tex: 'Basketball.png', type: 'texture', ability: { key: 'jump', base: 1.02, perLevel: 0.05 } },
            bowling: { name: 'Bowling', price: 120, tex: 'bolos.png', type: 'texture', ability: { key: 'speed', base: 1.0, perLevel: 0.05 } },

            // High-price premium skins with abilities
            diamond: { name: 'Diamond', price: 1000, tex: 'ball_metal.png', type: 'texture', ability: { key: 'coins', base: 1.2, perLevel: 0.12 } },
            obsidian: { name: 'Obsidian', price: 1500, tex: 'ball_lava.png', type: 'texture', ability: { key: 'jump', base: 1.15, perLevel: 0.08 } },
            galaxy: { name: 'Galaxy', price: 2000, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture', ability: { key: 'speed', base: 1.12, perLevel: 0.08 } },
            golden: { name: 'Golden', price: 5000, tex: 'ball_metal.png', type: 'texture', ability: { key: 'coins', base: 1.35, perLevel: 0.14 } },

            // 25 new skins (abbreviated for brevity - each includes an ability)
            nebula: { name: 'Nebula', price: 220, tex: 'scene_NEBULA.gltf', type: 'texture', ability: { key: 'coins', base: 1.05, perLevel: 0.08 } },
            ember: { name: 'Ember', price: 180, tex: 'ball_lava.png', type: 'texture', ability: { key: 'jump', base: 1.03, perLevel: 0.06 } },
            polished: { name: 'Polished', price: 200, tex: 'ball_metal.png', type: 'texture', ability: { key: 'speed', base: 1.04, perLevel: 0.05 } },
            oak: { name: 'Oak', price: 60, tex: 'wood_texture.png', type: 'texture', ability: { key: 'jump', base: 1.01, perLevel: 0.04 } },
            sunset: { name: 'Sunset', price: 140, tex: 'sky_sunset.png', type: 'texture', ability: { key: 'coins', base: 1.02, perLevel: 0.05 } },
            midnight: { name: 'Midnight', price: 260, tex: 'sky_night.png', type: 'texture', ability: { key: 'speed', base: 1.06, perLevel: 0.06 } },
            aurora: { name: 'Aurora', price: 420, tex: 'sky_void.png', type: 'texture', ability: { key: 'coins', base: 1.08, perLevel: 0.07 } },
            mosaic: { name: 'Mosaic', price: 350, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture', ability: { key: 'speed', base: 1.05, perLevel: 0.06 } },
            marble: { name: 'Marble', price: 190, tex: 'ball_metal.png', type: 'texture', ability: { key: 'jump', base: 1.04, perLevel: 0.05 } },
            citrus: { name: 'Citrus', price: 75, tex: 'Basketball.png', type: 'texture', ability: { key: 'coins', base: 1.01, perLevel: 0.03 } },
            cobalt: { name: 'Cobalt', price: 130, tex: 'bolos.png', type: 'texture', ability: { key: 'speed', base: 1.03, perLevel: 0.04 } },
            graphite: { name: 'Graphite', price: 300, tex: 'ball_metal.png', type: 'texture', ability: { key: 'coins', base: 1.06, perLevel: 0.06 } },
            ember_core: { name: 'Ember Core', price: 450, tex: 'ball_lava.png', type: 'texture', ability: { key: 'jump', base: 1.06, perLevel: 0.07 } },
            prism: { name: 'Prism', price: 380, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture', ability: { key: 'coins', base: 1.07, perLevel: 0.06 } },
            driftwood: { name: 'Driftwood', price: 95, tex: 'wood_texture.png', type: 'texture', ability: { key: 'jump', base: 1.02, perLevel: 0.04 } },
            chrome_stripe: { name: 'Chrome Stripe', price: 240, tex: 'ball_metal.png', type: 'texture', ability: { key: 'speed', base: 1.05, perLevel: 0.06 } },
            lava_flow: { name: 'Lava Flow', price: 320, tex: 'ball_lava.png', type: 'texture', ability: { key: 'coins', base: 1.09, perLevel: 0.07 } },
            retro_orb: { name: 'Retro Orb', price: 160, tex: 'sky_sunset.png', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.03 } },
            starlight: { name: 'Starlight', price: 600, tex: 'sky_night.png', type: 'texture', ability: { key: 'coins', base: 1.12, perLevel: 0.08 } },
            cloudburst: { name: 'Cloudburst', price: 110, tex: '1eprhbtmvoo51.png', type: 'texture', ability: { key: 'jump', base: 1.03, perLevel: 0.05 } },
            sunmetal: { name: 'Sunmetal', price: 520, tex: 'ball_metal.png', type: 'texture', ability: { key: 'speed', base: 1.08, perLevel: 0.07 } },
            magma_core: { name: 'Magma Core', price: 700, tex: 'ball_lava.png', type: 'texture', ability: { key: 'coins', base: 1.15, perLevel: 0.09 } },
            coral: { name: 'Coral', price: 85, tex: 'Basketball.png', type: 'texture', ability: { key: 'jump', base: 1.01, perLevel: 0.03 } },
            sapphire: { name: 'Sapphire', price: 420, tex: 'bolos.png', type: 'texture', ability: { key: 'coins', base: 1.1, perLevel: 0.07 } },
            voidglass: { name: 'Voidglass', price: 980, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture', ability: { key: 'speed', base: 1.12, perLevel: 0.08 } },

            // New high-priced glass-style animated skin using provided GIF
            p2opp: { name: 'P2OPP (Glass)', price: 7500, tex: 'p2opp.gif', type: 'texture', ability: { key: 'coins', base: 1.25, perLevel: 0.1 } },

            // Added clear ball skin using provided dancing-groovy image
            // Make Groovy the premium best-performing skin (highest price + strongest ability multipliers)
            groovy: { name: 'Groovy', price: 12000, tex: 'dancing-groovy.webp', type: 'texture', ability: { key: 'speed', base: 1.40, perLevel: 0.18 } },

            // Additional skins added from project assets (marble, stone, alien textures)
            rock_k: { name: 'Rock K', price: 120, tex: 'rock_k.jpg', type: 'texture', ability: { key: 'jump', base: 1.03, perLevel: 0.04 } },
            marble_orochiaro: { name: 'Orochiaro Marble', price: 200, tex: 'marble_orochiaro_white_t.jpg', type: 'texture', ability: { key: 'coins', base: 1.04, perLevel: 0.05 } },
            marble_grey: { name: 'Marble Grey', price: 180, tex: 'Marble-grey_t.jpg', type: 'texture', ability: { key: 'speed', base: 1.03, perLevel: 0.04 } },
            marble_luar: { name: 'Marble Luar', price: 175, tex: 'Marble-luar_t.jpg', type: 'texture', ability: { key: 'jump', base: 1.02, perLevel: 0.03 } },
            marble9: { name: 'Ocean Marble', price: 210, tex: 'marble9.jpg', type: 'texture', ability: { key: 'coins', base: 1.05, perLevel: 0.05 } },
            purpleveins: { name: 'Purple Veins', price: 160, tex: 'purpleveins.jpg', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.03 } },
            marble8: { name: 'Beige Marble', price: 165, tex: 'marble8.jpg', type: 'texture', ability: { key: 'coins', base: 1.03, perLevel: 0.04 } },

            alien_11: { name: 'Alien Warm', price: 220, tex: 'alien_11.jpg', type: 'texture', ability: { key: 'coins', base: 1.04, perLevel: 0.05 } },
            alien_14_variant: { name: 'Alien Wavy Variant', price: 230, tex: 'alien_14 (1).jpg', type: 'texture', ability: { key: 'speed', base: 1.03, perLevel: 0.04 } },
            alien_6: { name: 'Alien Emboss', price: 200, tex: 'alien_6.jpg', type: 'texture', ability: { key: 'jump', base: 1.04, perLevel: 0.05 } },
            alien28c: { name: 'Frosty Ice', price: 210, tex: 'alien28c.jpg', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.04 } },
            alien_13: { name: 'Alien Rust', price: 205, tex: 'alien_13.jpg', type: 'texture', ability: { key: 'coins', base: 1.03, perLevel: 0.04 } },
            alien_8: { name: 'Circular Rings', price: 190, tex: 'alien_8.jpg', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.03 } },
            alien41: { name: 'Green Abstract', price: 195, tex: 'alien41.jpg', type: 'texture', ability: { key: 'jump', base: 1.02, perLevel: 0.03 } },
            colored_stone1: { name: 'Blue Stone', price: 170, tex: 'colored_stone1.jpg', type: 'texture', ability: { key: 'coins', base: 1.02, perLevel: 0.03 } },
            alien_7: { name: 'Neon Ripples', price: 240, tex: 'alien_7.jpg', type: 'texture', ability: { key: 'speed', base: 1.04, perLevel: 0.05 } },
            alien_3: { name: 'Alien Face', price: 260, tex: 'alien_3.jpg', type: 'texture', ability: { key: 'coins', base: 1.05, perLevel: 0.05 } },
            alien_14: { name: 'Alien Wavy Ridged', price: 225, tex: 'alien_14.jpg', type: 'texture', ability: { key: 'jump', base: 1.03, perLevel: 0.04 } }
        };

        // Merge external BALL_DB (from /ball_db.js) into ballConfigs so the Ball Index shows all available metadata.
        try {
            if (typeof BALL_DB !== 'undefined') {
                // Support either an array export or an object map export from ball_db.js
                const entries = Array.isArray(BALL_DB)
                    ? BALL_DB
                    : Object.entries(BALL_DB).map(([key, val]) => ({ key, ...val }));

                for (const b of entries) {
                    try {
                        const k = (b.key || '').toString();
                        if (!k) continue;
                        if (this.ballConfigs[k]) {
                            // augment existing entry with any missing fields without overwriting custom properties
                            const existing = this.ballConfigs[k];
                            existing.price = (existing.price !== undefined) ? existing.price : (b.price !== undefined ? b.price : 0);
                            existing.tex = existing.tex || b.tex || existing.tex;
                            existing.type = existing.type || b.type || 'texture';
                            existing.description = existing.description || b.description || '';
                            existing.ability = existing.ability || b.ability || null;
                        } else {
                            this.ballConfigs[k] = {
                                name: b.name || k,
                                price: (b.price !== undefined) ? b.price : 0,
                                tex: b.tex || '',
                                type: b.type || 'texture',
                                ability: b.ability || null,
                                description: b.description || ''
                            };
                        }
                    } catch (err) {
                        console.warn('Failed to merge BALL_DB entry', b && b.key, err);
                    }
                }
            }
        } catch (e) {
            console.warn('BALL_DB merge failed', e);
        }

        // New powerup configs: rarity, base price, maxLevel and basic description
        this.powerupConfigs = {
            magnet: { name: 'Magnet', price: 180, rarity: 'common', maxLevel: 5, description: 'Attract nearby coins within short range; higher levels increase radius and pull strength.' },
            turbo:  { name: 'Turbo',  price: 300, rarity: 'uncommon', maxLevel: 5, description: 'Short burst of speed when activated; levels increase duration and multiplier.' },
            shield: { name: 'Shield', price: 420, rarity: 'rare', maxLevel: 5, description: 'Absorb one fall/hazard hit; level increases durability/time.' },
            x2coins:{ name: 'Coin Doubler', price: 500, rarity: 'epic', maxLevel: 3, description: 'Temporarily doubles coin pickup value; higher levels lengthen duration.' }
        };

        this.skyConfigs = {
            day:    { name: 'Blue Sky',    price: 0,   tex: 'sky_day.png',    color: 0x87ceeb },
            sunset: { name: 'Sunset',      price: 100, tex: 'sky_sunset.png', color: 0xff7f50 },
            night:  { name: 'Midnight',    price: 250, tex: 'sky_night.png',  color: 0x0a0a2a },
            void:   { name: 'Cosmic',      price: 500, tex: 'sky_void.png',   color: 0x000000 },

            // New skybox skins
            clouds: { name: 'Cloudscape',  price: 80,  tex: '1eprhbtmvoo51.png', color: 0xddeeff },
            mosaic: { name: 'Rainbow Mosaic', price: 300, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', color: 0x223344 },
            // premium / rare skies
            aurora: { name: 'Aurora Glow', price: 800, tex: 'sky_void.png', color: 0x055e7f },
            retro:  { name: 'Retro Sunset', price: 200, tex: 'sky_sunset.png', color: 0xffb07a }
        };

        // Weather AI config: simple lightweight decision system for level weather and downhill generation
        this.weatherTypes = ['clear', 'rain', 'wind', 'snow', 'mixed'];
        this.weatherAI = {
            // Choose weather based on level, player coins, and saved bias
            chooseWeather: (level) => {
                const bias = this.saveData.weatherPrefs && this.saveData.weatherPrefs.bias ? this.saveData.weatherPrefs.bias : {};
                // base weights by level: higher levels slightly favor harsher weather
                const base = this.weatherTypes.map(w => {
                    let score = 1;
                    if (w === 'rain' && level % 5 === 0) score += 2;
                    if (w === 'wind' && level % 7 === 0) score += 2;
                    if (w === 'snow' && level > 8 && level % 6 === 0) score += 1.5;
                    if (w === 'mixed' && level > 12) score += 1;
                    // apply saved bias
                    score += (bias[w] || 0) * 0.2;
                    return score;
                });
                // Normalize and pick by weighted random
                const total = base.reduce((s, v) => s + v, 0);
                let r = Math.random() * total;
                for (let i = 0; i < base.length; i++) {
                    if (r < base[i]) return this.weatherTypes[i];
                    r -= base[i];
                }
                return 'clear';
            },
            // After a weather is used, record it to bias future picks
            recordWeather: (w) => {
                this.saveData.weatherPrefs = this.saveData.weatherPrefs || { bias: {}, lastWeather: 'clear' };
                this.saveData.weatherPrefs.lastWeather = w;
                this.saveData.weatherPrefs.bias[w] = (this.saveData.weatherPrefs.bias[w] || 0) + 1;
                // keep bias map small
                const keys = Object.keys(this.saveData.weatherPrefs.bias);
                if (keys.length > 10) {
                    // decay all biases slightly
                    keys.forEach(k => this.saveData.weatherPrefs.bias[k] = Math.max(0, this.saveData.weatherPrefs.bias[k] - 1));
                }
                this.save();
            }
        };
    }

    // Determine particle counts based on device capability and quality presets.
    // Usage: this.getParticleCount('rain', 1200) => scaled count
    getParticleCount(type, defaultCount) {
        try {
            // Very simple heuristics: hardwareConcurrency, UA mobile check, and approximate pixel area.
            const hc = navigator.hardwareConcurrency || 2;
            const isMobile = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
            const area = (window && window.innerWidth && window.innerHeight) ? (window.innerWidth * window.innerHeight) : 1280 * 720;
            // Base quality index (0..1) where 1 is best
            let quality = 1.0;
            // Lower quality for mobile and low core counts
            if (isMobile) quality *= 0.45;
            if (hc <= 2) quality *= 0.6;
            else if (hc <= 4) quality *= 0.8;
            // adjust by viewport size (big screens can handle more)
            const areaFactor = Math.min(1.5, Math.max(0.6, area / (1280 * 720)));
            quality *= areaFactor;
            // Clamp
            quality = Math.max(0.15, Math.min(1.0, quality));
            // Type-specific bias: rain heavier than wind
            let typeBias = 1.0;
            if (type === 'rain') typeBias = 1.0;
            else if (type === 'snow') typeBias = 0.6;
            else if (type === 'wind') typeBias = 0.35;
            const scaled = Math.round(defaultCount * quality * typeBias);
            // Ensure a sensible minimum so effects remain visible
            const minByType = { rain: 120, snow: 80, wind: 20 };
            const min = minByType[type] || 30;
            return Math.max(min, Math.min(defaultCount, scaled));
        } catch (e) {
            return defaultCount;
        }
    }

    save() {
        localStorage.setItem('goingBallsData_v1', JSON.stringify(this.saveData));
    }

    initAudio() {
        // Rolling SFX (kept as before)
        this.rollSound = new Audio('rolling_loop.mp3');
        this.rollSound.loop = true;
        this.rollSound.volume = 0;
        this.rollSoundStarted = false;

        // Background music (Elevator Music)
        this.backgroundMusic = new Audio('Elevator Music.mp3');
        this.backgroundMusic.loop = true;
        this.backgroundMusic.volume = 0.18; // modest background volume
        this.backgroundMusicStarted = false;
        // musicEnabled flag persisted so the toggle survives reloads
        this.musicEnabled = (localStorage.getItem('goingBalls_musicEnabled') !== 'false');

        // Resume audio context on first interaction and start background music & rolling SFX appropriately
        const resumeAudio = () => {
            if (!this.rollSoundStarted) {
                this.rollSound.play().catch(() => {});
                this.rollSoundStarted = true;
            }
            if (!this.backgroundMusicStarted && this.musicEnabled) {
                this.backgroundMusic.play().catch(() => {});
                this.backgroundMusicStarted = true;
            }
            window.removeEventListener('keydown', resumeAudio);
            window.removeEventListener('mousedown', resumeAudio);
            window.removeEventListener('touchstart', resumeAudio);
        };
        window.addEventListener('keydown', resumeAudio);
        window.addEventListener('mousedown', resumeAudio);
        window.addEventListener('touchstart', resumeAudio);

        // Pause music when overlay/menu is open to avoid clashing with UI events
        const overlay = document.getElementById('overlay');
        const topMenu = document.getElementById('top-menu');
        const updateMusicOnUI = () => {
            const menuVisible = topMenu.classList.contains('visible');
            const overlayVisible = overlay.style.display === 'flex';
            if (!this.musicEnabled) {
                // ensure muted state
                this.backgroundMusic.pause();
                return;
            }
            if (menuVisible || overlayVisible) {
                // lower volume but keep playing
                this.backgroundMusic.volume = 0.06;
                if (this.backgroundMusic.paused && this.backgroundMusicStarted) this.backgroundMusic.play().catch(()=>{});
            } else {
                this.backgroundMusic.volume = 0.18;
                if (this.backgroundMusic.paused && this.backgroundMusicStarted) this.backgroundMusic.play().catch(()=>{});
            }
        };

        // Hook into menu show/hide behavior
        const observer = new MutationObserver(updateMusicOnUI);
        observer.observe(topMenu, { attributes: true, attributeFilter: ['class'] });
        // Also monitor overlay display changes by polling (simple and light)
        setInterval(updateMusicOnUI, 500);

        // Music toggle button behavior
        const musicBtn = document.getElementById('music-toggle');
        const updateMusicButtonUI = () => {
            if (!musicBtn) return;
            musicBtn.innerText = this.musicEnabled ? 'MUSIC: ON' : 'MUSIC: OFF';
            musicBtn.style.borderColor = this.musicEnabled ? '#00ff88' : 'white';
            musicBtn.style.background = this.musicEnabled ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)';
        };
        // Initialize button label
        updateMusicButtonUI();

        if (musicBtn) {
            musicBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.musicEnabled = !this.musicEnabled;
                localStorage.setItem('goingBalls_musicEnabled', this.musicEnabled ? 'true' : 'false');
                if (this.musicEnabled) {
                    // start or resume
                    this.backgroundMusic.play().catch(()=>{});
                    this.backgroundMusicStarted = true;
                } else {
                    // pause music immediately
                    try { this.backgroundMusic.pause(); } catch (e) {}
                }
                updateMusicButtonUI();
            });
        }
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.textureLoader = new THREE.TextureLoader();
        this.textureCache = new Map();
        
        // Sky rotation settings and mesh holder for a rotating skybox
        this.skyRotationSpeed = 0.03; // radians per second (medium-slow)
        this.skyMesh = null;

        const sky = this.skyConfigs[this.saveData.selectedSky] || this.skyConfigs.day;
        this.applySkyConfig(sky);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        // Use WebGLRenderer (avoid importing experimental WebGPU renderer which may not be available)
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        // Lower pixel ratio on high-DPI devices to speed up initial GL context allocation and texture uploads.
        // This reduces GPU work during startup while keeping visuals acceptable on most devices.
        try { this.renderer.setPixelRatio(Math.min(1, window.devicePixelRatio || 1)); } catch (e) {}
        this.renderer.debug && (this.renderer.debug.checkShaderErrors = false);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Ensure correct color encoding/output for loaded textures (fixes washed-out or dark skies)
        try { this.renderer.outputEncoding = THREE.sRGBEncoding; } catch (e) {}
        // Use ACES Filmic tone mapping and moderate exposure for a more "Unreal-like" cinematic look
        try {
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.0;
        } catch (e) {}
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // PMREM generator for high-quality environment maps from equirectangular skies
        try {
            this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
            this.pmremGenerator.compileEquirectangularShader();
        } catch (e) {
            this.pmremGenerator = null;
            console.warn('PMREM generator unavailable', e);
        }
        console.info('Using WebGL renderer (ACES tone-mapped, PMREM ready)');

        document.body.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(15, 30, 20);
        sunLight.castShadow = true;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        this.scene.add(sunLight);

        this.gltfLoader = new GLTFLoader();
        this.finishModel = null;

        // Preload decorative/trail models (skeleton, zombie, eye) to attach as small trailing visuals on obstacles.
        // These are best-effort loads and will be cloned when attaching trails.
        this._trailModelPool = {};
        const trailLoads = [
            { key: 'skeleton', url: 'skeleton.gif' }, // gif fallback as simple sprite if glb not available
            { key: 'zombie', url: '_halloween_Um_zumbi__0523105301_.glb' },
            { key: 'eye', url: 'eye_low_poly_free_cute_eyeballs.glb' },
            { key: 'soldier2', url: 'Soldier (2).gif' },
            { key: 'venus', url: 'Venus Fly Trap.gif' }
        ];

        // Helper to create a simple sprite mesh for image assets (gif/png) when GLTF isn't appropriate
        const createSpriteFromImage = (src, size = 0.8) => {
            try {
                const map = new THREE.TextureLoader().load(src);
                map.encoding = THREE.sRGBEncoding;
                const mat = new THREE.SpriteMaterial({ map: map, transparent: true, depthWrite: false });
                const spr = new THREE.Sprite(mat);
                spr.scale.set(size, size, 1);
                return spr;
            } catch (e) {
                return null;
            }
        };

        // iterate requested trail assets and try to load GLTF first, fallback to sprite for image files
        (async () => {
            for (const t of trailLoads) {
                try {
                    if (t.url.toLowerCase().endsWith('.glb') || t.url.toLowerCase().endsWith('.gltf')) {
                        this.gltfLoader.load(t.url,
                            (g) => {
                                try {
                                    const scene = g.scene || g.scenes && g.scenes[0];
                                    if (!scene) return;
                                    // store a lightweight cloned root for future instancing
                                    scene.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
                                    this._trailModelPool[t.key] = scene;
                                } catch (err) { /* ignore per-model errors */ }
                            },
                            undefined,
                            (err) => { console.warn('Trail GLTF load failed for', t.url, err); }
                        );
                    } else {
                        // load as sprite/fallback image
                        const spr = createSpriteFromImage(t.url, 1.0);
                        if (spr) this._trailModelPool[t.key] = spr;
                    }
                } catch (e) {
                    console.warn('Failed to preload trail asset', t.url, e);
                }
            }
        })();

        // Load GLB with error handling to avoid "Network Error" crashes
        this.gltfLoader.load('.glb', 
            (gltf) => {
                this.finishModel = gltf.scene;
                this.placeFinishModel();
            },
            undefined,
            (err) => {
                console.warn('Failed to load .glb model, using fallback finish gate:', err);
                this.finishModel = this.createFallbackFinishModel();
            }
        );

        this.ballTexture = this.loadTexture('Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png');
        this.woodTexture = this.loadTexture('wood_texture.png');
        this.woodTexture.wrapS = THREE.RepeatWrapping;
        this.woodTexture.wrapT = THREE.RepeatWrapping;
        this.woodTexture.repeat.set(1, 4);

        this.sharedMaterials = {
            wood: new THREE.MeshPhongMaterial({ map: this.woodTexture }),
            finish: new THREE.MeshPhongMaterial({ color: 0x00ff00 }),
            coin: new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 80 }),
            pendulum: new THREE.MeshPhongMaterial({ color: 0xaa0000 }),
            spinner: new THREE.MeshPhongMaterial({ color: 0x0000ff }),
            rope: new THREE.LineBasicMaterial({ color: 0x333333 }),
            wall: new THREE.MeshPhongMaterial({ color: 0x666666, transparent: true, opacity: 0.5 }),
            speed: new THREE.MeshPhongMaterial({ color: 0xffff00, emissive: 0x444400 }),
            hazard: new THREE.MeshPhongMaterial({ color: 0xff4500 }),
            // Neon material for night level edge markings (emissive glow)
            neon: new THREE.MeshPhongMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.4, shininess: 120 }),
            // Glass material for fragile platforms (transparent, reflective-ish)
            glass: new THREE.MeshPhongMaterial({ color: 0xddeeff, transparent: true, opacity: 0.28, shininess: 90, specular: 0xffffff })
        };

        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('unhandledrejection', (event) => {
            console.warn('Caught unhandled rejection:', event.reason);
            event.preventDefault(); // Prevent crash from network-related rejections
        });
    }

    loadTexture(url) {
        // Return cached texture if available
        if (this.textureCache.has(url)) return this.textureCache.get(url);

        try {
            // Attempt to load the texture. Provide an onError callback that installs a fallback.
            const tex = this.textureLoader.load(
                url,
                undefined,
                undefined,
                (err) => {
                    console.error(`Error loading texture: ${url}`, err);
                    // Create a lightweight 1x1 fallback DataTexture (muted gray) to avoid null textures
                    const fallbackData = new Uint8Array([200, 200, 200, 255]); // RGBA
                    const fallback = new THREE.DataTexture(fallbackData, 1, 1, THREE.RGBAFormat);
                    fallback.needsUpdate = true;
                    this.textureCache.set(url, fallback);
                }
            );

            // If load() returned immediately (likely), cache and return it.
            this.textureCache.set(url, tex);
            return tex;
        } catch (e) {
            // Synchronous failure (rare) - ensure we still return a valid fallback texture
            console.error(`loadTexture failed for ${url}:`, e);
            const fallbackData = new Uint8Array([200, 200, 200, 255]);
            const fallback = new THREE.DataTexture(fallbackData, 1, 1, THREE.RGBAFormat);
            fallback.needsUpdate = true;
            this.textureCache.set(url, fallback);
            return fallback;
        }
    }

    applySkyConfig(sky) {
        // Enhanced sky handling: support equirectangular textures AND optional glTF scene skies (PBR model as sky dome).
        try {
            const disposeMesh = (mesh) => {
                if (!mesh) return;
                try {
                    if (mesh.traverse) {
                        mesh.traverse((c) => {
                            if (c.isMesh) {
                                if (c.material) {
                                    if (Array.isArray(c.material)) {
                                        c.material.forEach(m => { if (m.map) try { m.map.dispose(); } catch(e){}; try { m.dispose(); } catch(e){}; });
                                    } else {
                                        if (c.material.map) try { c.material.map.dispose(); } catch(e) {}
                                        try { c.material.dispose(); } catch(e) {}
                                    }
                                }
                                if (c.geometry) try { c.geometry.dispose(); } catch(e){}
                            }
                        });
                    } else {
                        if (mesh.material) {
                            if (Array.isArray(mesh.material)) {
                                mesh.material.forEach(m => { if (m.map) try { m.map.dispose(); } catch(e){}; try { m.dispose(); } catch(e){}; });
                            } else {
                                if (mesh.material.map) try { mesh.material.map.dispose(); } catch(e) {}
                                try { mesh.material.dispose(); } catch(e) {}
                            }
                        }
                        if (mesh.geometry) try { mesh.geometry.dispose(); } catch(e){}
                    }
                    if (mesh.parent) mesh.parent.remove(mesh);
                } catch (e) {}
            };

            const targetFogHex = sky && sky.color ? sky.color : 0x87ceeb;
            const previousSky = this.skyMesh;

            // If the sky asset is a glTF/glb file, load it as a large PBR scene and use its environment where possible.
            if (sky && sky.tex && (sky.tex.toLowerCase().endsWith('.gltf') || sky.tex.toLowerCase().endsWith('.glb'))) {
                // Remove previous sky if any
                try { if (previousSky) disposeMesh(previousSky); } catch (e) {}

                // Load the glTF as a sky scene using GLTFLoader (already available as this.gltfLoader)
                try {
                    this.gltfLoader.load(sky.tex,
                        (gltf) => {
                            try {
                                // Create a grouped sky object: scale up and invert its geometry where appropriate
                                const root = gltf.scene.clone(true);
                                // Apply a large uniform scale so the model surrounds the world
                                const scale = 40;
                                root.scale.set(scale, scale, scale);
                                root.traverse((c) => {
                                    if (c.isMesh) {
                                        // Ensure double-sided rendering for internal viewing
                                        try { c.material = c.material.clone ? c.material.clone() : c.material; } catch(e){}
                                        try { c.material.side = THREE.BackSide; } catch(e){}
                                        try { c.frustumCulled = false; } catch(e){}
                                    }
                                });

                                // Position the sky at world origin and prevent being culled
                                root.position.set(0, 0, 0);
                                root.frustumCulled = false;
                                root.renderOrder = 0;

                                // If the glTF contains an equirectangular-like HDR or a cubemap texture,
                                // try to generate a PMREM from a provided environment if available.
                                // For simplicity, create a small cube-camera-based env map from the loaded model.
                                if (this.pmremGenerator) {
                                    try {
                                        // Bake a cubemap by rendering the model to a WebGLCubeRenderTarget via CubeCamera
                                        // Use a lower-resolution cube render target to speed up bake time and reduce memory at load.
                                        // 64 is far cheaper than 256 while still producing acceptable environment hints.
                                        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
                                        const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
                                        // Temporarily add root to scene, update cube camera, then remove
                                        this.scene.add(root);
                                        cubeCamera.update(this.renderer, this.scene);
                                        // Use PMREMGenerator to convert to a filtered envMap
                                        const envMap = this.pmremGenerator.fromCubemap(cubeRenderTarget.texture).texture;
                                        // Set scene environment/background where appropriate
                                        try { this.scene.environment = envMap; this.scene.background = envMap; } catch (e) {}
                                        // remove the temporary cube camera and render target objects
                                        try { cubeRenderTarget.dispose(); } catch(e){}
                                        try { this.scene.remove(root); } catch(e){}
                                        // Re-add root as sky mesh below after environment set
                                    } catch (e) {
                                        // if baking fails, just continue; root will still be added as visual sky
                                        console.warn('Cube env bake failed for glTF sky', e);
                                    }
                                }

                                // Add a subtle hemisphere helper light for the sky if not already present
                                if (!this._skyHemisphere) {
                                    try {
                                        this._skyHemisphere = new THREE.HemisphereLight(0xffffff, 0x333344, 0.2);
                                        this.scene.add(this._skyHemisphere);
                                    } catch (e) {}
                                }

                                // If there was a previous sky, remove it gracefully
                                try { if (previousSky && previousSky !== root) disposeMesh(previousSky); } catch(e){}

                                this.scene.add(root);
                                this.skyMesh = root;
                                // Smoothly fade in if material supports opacity
                                try {
                                    root.traverse((c) => {
                                        if (c.isMesh && c.material) {
                                            c.material.transparent = true;
                                            c.material.opacity = 0.0;
                                        }
                                    });
                                    const start = Date.now();
                                    const dur = 800;
                                    const fade = () => {
                                        const t = Math.min(1, (Date.now() - start) / dur);
                                        try {
                                            root.traverse((c) => {
                                                if (c.isMesh && c.material) c.material.opacity = t;
                                            });
                                        } catch (e) {}
                                        if (t < 1) requestAnimationFrame(fade);
                                    };
                                    requestAnimationFrame(fade);
                                } catch (e) {}

                                // Ensure fog color aligns with sky config
                                try {
                                    if (!this.scene.fog) this.scene.fog = new THREE.Fog(targetFogHex, 20, 150);
                                    this.scene.fog.color.setHex(targetFogHex);
                                } catch (e) {}
                            } catch (e) {
                                console.warn('Error applying glTF sky:', e);
                            }
                        },
                        undefined,
                        (err) => {
                            console.warn('Failed to load glTF sky asset:', sky.tex, err);
                            // fallback to simple color background
                            try { this.scene.background = new THREE.Color(targetFogHex); } catch(e){}
                        }
                    );
                } catch (e) {
                    console.warn('gltfLoader.load call failed for sky glTF', e);
                }

                return;
            }

            // Otherwise treat sky.tex as an equirectangular texture (existing code path)
            if (sky && sky.tex) {
                const tex = this.loadTexture(sky.tex);
                try {
                    tex.mapping = THREE.EquirectangularReflectionMapping;
                    tex.encoding = THREE.sRGBEncoding;
                    tex.wrapS = THREE.ClampToEdgeWrapping;
                    tex.wrapT = THREE.ClampToEdgeWrapping;
                    tex.minFilter = tex.minFilter || THREE.LinearMipMapLinearFilter;
                    tex.magFilter = tex.magFilter || THREE.LinearFilter;
                    tex.needsUpdate = true;
                } catch (e) {}

                let envMap = null;
                try {
                    if (this.pmremGenerator) {
                        const pmrem = this.pmremGenerator.fromEquirectangular(tex);
                        envMap = pmrem && pmrem.texture ? pmrem.texture : null;
                        if (envMap) {
                            if (this._lastEnvMap && this._lastEnvMap !== envMap) {
                                try { this._lastEnvMap.dispose && this._lastEnvMap.dispose(); } catch(e){}
                            }
                            this._lastEnvMap = envMap;
                        }
                    }
                } catch (e) {
                    console.warn('PMREM generation failed for equirectangular, continuing without envMap', e);
                    envMap = null;
                }

                try {
                    if (envMap) {
                        this.scene.background = envMap;
                        this.scene.environment = envMap;
                    } else {
                        try { this.scene.background = tex; } catch (e) { this.scene.background = new THREE.Color(targetFogHex); }
                    }
                } catch (e) {
                    console.warn('Failed to set scene background/envMap', e);
                    this.scene.background = new THREE.Color(targetFogHex);
                }

                const radius = 380;
                const skyGeo = new THREE.SphereGeometry(radius, 48, 32);
                skyGeo.scale(-1, 1, 1);

                const skyMat = new THREE.MeshStandardMaterial({
                    map: tex,
                    side: THREE.BackSide,
                    depthWrite: false,
                    roughness: 1.0,
                    metalness: 0.0,
                    envMap: envMap || null,
                    envMapIntensity: 0.8,
                    toneMapped: true
                });

                const newSky = new THREE.Mesh(skyGeo, skyMat);
                newSky.frustumCulled = false;
                newSky.renderOrder = 0;

                if (!this._skyHemisphere) {
                    try {
                        this._skyHemisphere = new THREE.HemisphereLight(0xffffff, 0x444466, 0.25);
                        this.scene.add(this._skyHemisphere);
                    } catch (e) {}
                }

                this.scene.add(newSky);
                this.skyMesh = newSky;

                if (previousSky && previousSky !== newSky) {
                    previousSky.renderOrder = 1;
                    const start = Date.now();
                    const dur = 700;
                    const fade = () => {
                        const t = Math.min(1, (Date.now() - start) / dur);
                        try {
                            newSky.material.opacity = t;
                            if (previousSky.material) previousSky.material.opacity = Math.max(0, 1 - t);
                        } catch (e) {}
                        if (t < 1) requestAnimationFrame(fade);
                        else {
                            try { disposeMesh(previousSky); } catch (e) {}
                        }
                    };
                    try { newSky.material.transparent = true; } catch(e){}
                    try { if (previousSky.material) previousSky.material.transparent = true; } catch(e){}
                    requestAnimationFrame(fade);
                } else {
                    try { newSky.material.transparent = true; newSky.material.opacity = 0.0; } catch(e){}
                    const start = Date.now();
                    const dur = 450;
                    const fadeIn = () => {
                        const t = Math.min(1, (Date.now() - start) / dur);
                        try { newSky.material.opacity = t; } catch (e) {}
                        if (t < 1) requestAnimationFrame(fadeIn);
                    };
                    requestAnimationFrame(fadeIn);
                }

                try {
                    if (!this.scene.fog) this.scene.fog = new THREE.Fog(targetFogHex, 20, 150);
                    this.scene.fog.color.setHex(targetFogHex);
                } catch (e) { this.scene.fog = new THREE.Fog(targetFogHex, 20, 150); }

                try { tex.encoding = THREE.sRGBEncoding; } catch (e) {}
            } else {
                try { disposeMesh(previousSky); this.skyMesh = null; } catch (e) {}
                try {
                    this.scene.background = new THREE.Color(sky && sky.color ? sky.color : 0x87ceeb);
                    if (!this.scene.fog) this.scene.fog = new THREE.Fog(targetFogHex, 20, 150);
                    this.scene.fog.color.setHex(targetFogHex);
                } catch (e) {
                    this.scene.background = new THREE.Color(0x87ceeb);
                }
            }
        } catch (e) {
            console.warn('applySkyConfig error', e);
            try { this.scene.background = new THREE.Color(sky && sky.color ? sky.color : 0x87ceeb); } catch (e) {}
        }
    }

    createFallbackFinishModel() {
        const group = new THREE.Group();
        const archGeo = new THREE.BoxGeometry(10, 1, 1);
        const postGeo = new THREE.BoxGeometry(1, 8, 1);
        const mat = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
        
        const arch = new THREE.Mesh(archGeo, mat);
        arch.position.y = 8;
        const postL = new THREE.Mesh(postGeo, mat);
        postL.position.set(-4.5, 4, 0);
        const postR = new THREE.Mesh(postGeo, mat);
        postR.position.set(4.5, 4, 0);
        
        group.add(arch, postL, postR);
        return group;
    }

    initPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, GRAVITY, 0);
        this.world.allowSleep = true;
        
        const ballMaterial = new CANNON.Material('ball');
        const groundMaterial = new CANNON.Material('ground');
        const contactMaterial = new CANNON.ContactMaterial(ballMaterial, groundMaterial, {
            friction: 1.0, // Max friction to prevent unwanted sliding
            restitution: 0.1 // Minimal bounce for heavy feel
        });
        this.world.addContactMaterial(contactMaterial);

        const sphereShape = new CANNON.Sphere(BALL_RADIUS);
        this.ballBody = new CANNON.Body({
            mass: 100, // Extremely heavy to prevent flinging
            shape: sphereShape,
            material: ballMaterial,
            angularDamping: 0.95, // High damping for control
            linearDamping: 0.5     // Reduced slightly for smoother rolling
        });
        this.ballBody.position.set(0, 1, 0); // Lowered spawn to prevent bouncing on start
        this.world.addBody(this.ballBody);

        const sphereGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
        this.ballMesh = new THREE.Mesh(sphereGeo, this.getBallMaterial());
        this.ballMesh.castShadow = true;
        this.scene.add(this.ballMesh);

        this.coins = [];
        this.score = 0;
        this.levelLength = 0;
        this.currentLevel = 1;
        this.levelObjects = []; 
        this.pendulums = [];
        this.spinners = [];
        this.movers = []; 
        this.isGameOver = false;
        this.isWin = false;
        this.isGrounded = false;
        this.jumpCount = 0;
        this.checkpoints = [];
        this.lastCheckpointPos = new CANNON.Vec3(0, 5, 0);
    }

    initControls() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') this.jump();
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        const joystick = nipplejs.create({
            zone: document.getElementById('joystick-container'),
            mode: 'static',
            position: { left: '90px', bottom: '90px' },
            color: 'white',
            size: 140,
            threshold: 0.1
        });

        this.joystickInput = { x: 0, y: 0 };
        this.mouseInput = { x: 0, y: 0 };
        this.dragStart = { x: 0, y: 0 };
        this.isDragging = false;

        joystick.on('move', (evt, data) => {
            try {
                // Apply deadzone and power multiplier from settings
                const dz = (this.joystickDeadzone !== undefined) ? this.joystickDeadzone : 0.10;
                const power = (this.joystickPower !== undefined) ? this.joystickPower : 1.0;
                if (!data || !data.vector || data.force < dz) {
                    this.joystickInput.x = 0;
                    this.joystickInput.y = 0;
                } else {
                    // scale vector by configured power and clamp to [-1,1]
                    this.joystickInput.x = Math.max(-1, Math.min(1, data.vector.x * power));
                    this.joystickInput.y = Math.max(-1, Math.min(1, data.vector.y * power));
                }
            } catch (e) {
                this.joystickInput.x = 0;
                this.joystickInput.y = 0;
            }
        });
        joystick.on('end', () => {
            this.joystickInput.x = 0;
            this.joystickInput.y = 0;
        });

        const jumpBtn = document.getElementById('jump-btn');
        jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.jump(); });
        jumpBtn.addEventListener('mousedown', (e) => this.jump());

        // Pointer Lock and Camera Controls
        this.cameraYaw = 0;
        this.cameraPitch = 0.4;
        this.cameraDistance = 8;

        // Mouse Drag Control Logic
        window.addEventListener('mousedown', (e) => {
            if (e.target.closest('#top-menu') || e.target.closest('.modal') || e.target.closest('#joystick-container') || e.target.closest('#jump-btn')) return;
            this.isDragging = true;
            this.dragStart.x = e.clientX;
            this.dragStart.y = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.dragStart.x;
                const dy = e.clientY - this.dragStart.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDrag = 100;
                const strength = Math.min(dist / maxDrag, 1.0);
                
                if (dist > 5) {
                    this.mouseInput.x = (dx / dist) * strength;
                    this.mouseInput.y = -(dy / dist) * strength;
                }

                // Camera rotation while dragging
                const mx = Math.abs(e.movementX) > 150 ? 0 : e.movementX;
                const my = Math.abs(e.movementY) > 150 ? 0 : e.movementY;
                this.cameraYaw -= mx * 0.002;
                this.cameraPitch = Math.max(0.1, Math.min(1.4, this.cameraPitch + my * 0.002));
            } else if (document.pointerLockElement === document.body) {
                // Support for pointer lock movement
                const mx = Math.abs(e.movementX) > 150 ? 0 : e.movementX;
                const my = Math.abs(e.movementY) > 150 ? 0 : e.movementY;
                this.cameraYaw -= mx * 0.0025;
                this.cameraPitch = Math.max(0.1, Math.min(1.4, this.cameraPitch + my * 0.0025));
                this.mouseInput.x = THREE.MathUtils.clamp(mx * 0.1, -1, 1);
                this.mouseInput.y = THREE.MathUtils.clamp(-my * 0.1, -1, 1);
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.mouseInput.x = 0;
            this.mouseInput.y = 0;
        });

        // Unified interaction listener for UI visibility and pointer lock
        const handleInteraction = (e) => {
            const topMenu = document.getElementById('top-menu');
            const isMenuClick = e.target.closest('#top-menu');
            const isModalClick = e.target.closest('.modal');
            const isControlClick = e.target.closest('#joystick-container') || e.target.closest('#jump-btn');

            if (isMenuClick || isModalClick) return;

            // Close the popup menu when tapping anywhere else (gear will open it)
            try {
                if (topMenu && topMenu.classList.contains('visible')) {
                    topMenu.classList.remove('visible');
                }
            } catch (err) {}
            // Do not request pointer lock here; opening/closing is handled by the gear button
        };

        window.addEventListener('mousedown', handleInteraction);
        window.addEventListener('touchstart', (e) => {
            // If we are clicking UI elements, don't trigger the game-world interaction logic
            if (e.target.closest('#top-menu') || e.target.closest('.modal')) return;

            // Special handling for touch to not conflict with joystick immediately
            if (!e.target.closest('#joystick-container') && !e.target.closest('#jump-btn')) {
                handleInteraction(e);
            }
        }, { passive: true });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyT') {
                document.exitPointerLock();
            }
        });
    }

    clearLevel() {
        this.levelObjects.forEach(obj => {
            if (obj.body) this.world.removeBody(obj.body);
            if (obj.mesh) this.scene.remove(obj.mesh);
        });
        this.coins.forEach(coin => this.scene.remove(coin));
        this.pendulums.forEach(p => {
            if (p.body) this.world.removeBody(p.body);
            this.scene.remove(p.mesh);
            if (p.line) this.scene.remove(p.line);
        });
        this.spinners.forEach(s => {
            if (s.body) this.world.removeBody(s.body);
            this.scene.remove(s.mesh);
        });
        this.movers.forEach(m => {
            if (m.body) this.world.removeBody(m.body);
            this.scene.remove(m.mesh);
        });
        // Clear rain if present
        if (this.raining) this.clearRain();
        // Clear wind if present
        if (this.windy) this.clearWind();

        this.checkpoints = [];
        this.levelObjects = [];
        this.coins = [];
        this.pendulums = [];
        this.spinners = [];
        this.movers = [];
        this.glassPlatforms = []; // track fragile glass platforms for breaking logic
        this.raining = false;
        this.windy = false;
    }

    placeFinishModel() {
        if (!this.finishModel || this.finishZ === undefined) return;
        const model = this.finishModel.clone();
        model.position.set(this.finishX || 0, (this.finishY || 0), this.finishZ);
        model.scale.set(0.1, 0.1, 0.1);
        // Apply a "downwards right" tilted rotation
        model.rotation.set(Math.PI / 2, 0, -Math.PI / 4);
        this.scene.add(model);
        this.levelObjects.push({ mesh: model });
    }

    // --- Procedural Level Generators ---
    getBallMaterial() {
        const conf = this.ballConfigs[this.saveData.selectedBall] || this.ballConfigs.rainbow;
        // Ensure materials render both sides so texture seams or single-sided culling don't leave visible gaps,
        // and configure common texture wrapping/encoding so skins cover the whole sphere consistently.
        try {
            // Special animated "Groovy" skin uses a dynamic canvas texture that we update each frame.
            if (this.saveData.selectedBall === 'groovy') {
                // create canvas texture on demand
                if (!this.groovyCanvasTex) {
                    this.createGroovyCanvas();
                }
                // ensure encoding/filters are correct
                try { this.groovyCanvasTex.encoding = THREE.sRGBEncoding; } catch (e) {}
                this.groovyCanvasTex.needsUpdate = true;
                return new THREE.MeshPhongMaterial({
                    map: this.groovyCanvasTex,
                    side: THREE.DoubleSide,
                    shininess: 40,
                    transparent: true
                });
            }

            if (conf.type === 'texture') {
                const tex = this.loadTexture(conf.tex);
                try {
                    // Make texture repeat-safe and correct encoding
                    tex.wrapS = tex.wrapS || THREE.RepeatWrapping;
                    tex.wrapT = tex.wrapT || THREE.RepeatWrapping;
                    tex.repeat.set(1, 1);
                    tex.encoding = THREE.sRGBEncoding;
                    tex.needsUpdate = true;
                } catch (e) {}

                // Special handling: GIF-based skins get a slight glass-like transparency for a "clear ball" effect.
                try {
                    if (conf.tex && typeof conf.tex === 'string' && conf.tex.toLowerCase().endsWith('.gif')) {
                        return new THREE.MeshPhongMaterial({
                            map: tex,
                            side: THREE.DoubleSide,
                            shininess: 80,
                            transparent: true,
                            opacity: 0.92,
                            envMap: this._lastEnvMap || null,
                            reflectivity: 0.3
                        });
                    }
                } catch (e) {
                    // fall through to default material
                }

                return new THREE.MeshPhongMaterial({
                    map: tex,
                    side: THREE.DoubleSide, // render front + back to avoid single-sided artifacts
                    shininess: 40
                });
            } else if (conf.type === 'color') {
                return new THREE.MeshPhongMaterial({ color: conf.color, shininess: conf.shininess, side: THREE.DoubleSide });
            } else if (conf.type === 'emissive') {
                return new THREE.MeshPhongMaterial({ color: conf.color, emissive: conf.emissive, side: THREE.DoubleSide });
            }
        } catch (e) {
            console.warn('getBallMaterial fallback', e);
        }
        return new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    }

    // Create an offscreen canvas and texture for the Groovy animated skin.
    createGroovyCanvas() {
        try {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            this.groovyCanvas = canvas;
            this.groovyCtx = ctx;
            // load base image (dancing-groovy.webp) and store for drawing
            this.groovyImg = new Image();
            this.groovyImg.crossOrigin = 'anonymous';
            this.groovyImg.src = 'dancing-groovy.webp';
            // fallback: if image fails to load, use a simple generated pattern
            this.groovyImg.onerror = () => { this.groovyImg = null; };
            this.groovyCanvasTex = new THREE.CanvasTexture(canvas);
            this.groovyCanvasTex.minFilter = THREE.LinearMipMapLinearFilter;
            this.groovyCanvasTex.magFilter = THREE.LinearFilter;
            this.groovyCanvasTex.wrapS = THREE.RepeatWrapping;
            this.groovyCanvasTex.wrapT = THREE.RepeatWrapping;
            this.groovyPhase = 0;
        } catch (e) {
            console.warn('createGroovyCanvas failed', e);
            this.groovyCanvasTex = null;
        }
    }

    // Called every frame from animate() to update the canvas content (simple pulsing+hue animation)
    updateGroovyCanvas(dt) {
        try {
            if (!this.groovyCanvas || !this.groovyCtx || !this.groovyCanvasTex) return;
            const ctx = this.groovyCtx;
            const w = this.groovyCanvas.width;
            const h = this.groovyCanvas.height;
            this.groovyPhase = (this.groovyPhase || 0) + (dt || 0.016) * 1.6; // speed factor
            // Clear
            ctx.clearRect(0, 0, w, h);
            // draw base image centered and scaled to cover
            if (this.groovyImg && this.groovyImg.complete) {
                // cover-style draw
                const img = this.groovyImg;
                const arImg = img.width / img.height;
                const arCan = w / h;
                let drawW = w, drawH = h;
                if (arImg > arCan) {
                    drawH = h;
                    drawW = h * arImg;
                } else {
                    drawW = w;
                    drawH = w / arImg;
                }
                ctx.save();
                ctx.translate(w / 2, h / 2);
                // subtle slow rotation for lively effect
                const rot = Math.sin(this.groovyPhase * 0.35) * 0.06;
                ctx.rotate(rot);
                ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
                ctx.restore();
            } else {
                // fallback pattern
                const g = ctx.createLinearGradient(0, 0, w, h);
                const a = Math.sin(this.groovyPhase) * 0.5 + 0.5;
                g.addColorStop(0, `rgba(255,${Math.floor(120 + 120 * a)},120,1)`);
                g.addColorStop(1, `rgba(${Math.floor(120 + 120 * (1-a))},120,255,1)`);
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
            }

            // pulsing colored overlay using additive blend for psychedelic effect
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const hue = (this.groovyPhase * 40) % 360;
            ctx.fillStyle = `hsla(${hue}, 85%, 55%, 0.12)`;
            ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'lighter';
            // subtle radial vignette
            const rad = ctx.createRadialGradient(w/2, h/2, w*0.1, w/2, h/2, w*0.8);
            rad.addColorStop(0, 'rgba(255,255,255,0.0)');
            rad.addColorStop(1, 'rgba(0,0,0,0.15)');
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = rad;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();

            // small animated noise lines for more life
            ctx.save();
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = `hsla(${(hue + 120) % 360},80%,60%,0.3)`;
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
                const y = (h * ((i + 1) / 5)) + Math.sin(this.groovyPhase * (0.6 + i * 0.1) + i) * 12;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.bezierCurveTo(w * 0.25, y + 8, w * 0.75, y - 8, w, y);
                ctx.stroke();
            }
            ctx.restore();

            // mark texture for update
            this.groovyCanvasTex.needsUpdate = true;
        } catch (e) {
            // silently ignore canvas update errors
        }
    }

    // createLevel(seed) - optional seed parameter sets a deterministic RNG for this generation when provided.
    createLevel(seed) {
        // If a numeric seed is supplied, install a seeded RNG for deterministic generation.
        try {
            if (typeof seed === 'number' && !Number.isNaN(seed)) {
                // lazy mulberry32 (redefine minimal version here to avoid reliance on other scopes)
                function mulberry32(a) {
                    return function() {
                        let t = a += 0x6D2B79F5;
                        t = Math.imul(t ^ (t >>> 15), t | 1);
                        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                    };
                }
                this._seed = seed >>> 0;
                this.rng = mulberry32(this._seed);
                this.rnd = () => this.rng();
                console.info('createLevel deterministic seed used:', this._seed);
            }
        } catch (e) {
            // if RNG setup fails, continue with Math.random via this.rnd (already defined in loadData)
            console.warn('Seeded RNG setup failed (continuing with default RNG)', e);
        }

        // local rand helper used by the generator; prefer instance rnd() (seeded when available)
        const rand = () => (this.rnd ? this.rnd() : Math.random());

        this.clearLevel();
        this.lastCheckpointPos.set(0, 5, 0);
        
        let currentZ = 0;
        let currentX = 0;
        let currentY = 0;

        // Mirror flag: even-numbered levels are mirrored horizontally
        this.mirrorLevel = (this.currentLevel % 2 === 0);
        const MX = (x) => this.mirrorLevel ? -x : x;

        // Start platform (centered, unaffected)
        this.addPlatform(0, 0, 0, 8, 15);
        currentZ -= 7.5;

        const currentSky = this.skyConfigs[this.saveData.selectedSky] || this.skyConfigs.day;
        // Night level detection: night sky selected OR every 6th level becomes a neon/night level
        this.isNightLevel = (this.saveData.selectedSky === 'night') || (this.currentLevel % 6 === 0);
        // If night-level enforce a darker fog tint and slightly shift background if using non-night sky
        if (this.isNightLevel) {
            try {
                if (this.scene.fog) this.scene.fog.color.setHex(0x071229);
                document.body.style.backgroundColor = '#071229';
            } catch (e) {}
        }

        // Massive variety of segment types for "infinite" combinations
        const segmentTypes = [
            'straight', 'ramp', 'narrow', 'pendulum', 'zigzag', 'gap', 
            'bumpy', 'spinner', 'thin_bridge', 'stairs', 'tunnel', 
            'archipelago', 'sloped_turn', 'speed_boost', 'checkerboard',
            'hammer_gauntlet', 'moving_rects', 'speed_strip', 'halfpipe',
            'funnel', 'spiral_staircase', 'side_crusher',
            'jump_gap', 'double_jump_gap', 'triple_jump_gap', 'climb',
            // Fragile glass segments
            'glass',
            // Sticky / low-friction / ice / special surface types
            'sticky', 'icy_patch', 'slime_pool',
            // Bounce, trampoline and springy interactions
            'bounce_pad', 'trampoline_arc',
            // Teleporters and short-range warp segments
            'teleport', 'warp_gate',
            // Moving / shifting narrow lanes
            'narrow_moving', 'tilt_platforms',
            // Broken or collapsing tiles and one-shot tiles
            'broken_tiles', 'pressure_plate',
            // New curved and looping track types
            'curve', 'loop_d_loop', 'spiral_tube',
            // Experimental mechanical or rhythm hazards
            'slinky', 'pulse_bridge',
            // Weather-driven segment type
            'downhill'
        ];

        // Difficulty Chart logic
        const difficultyTiers = [
            { level: 1, color: 0x7cfc00, label: "EASY", types: ['straight', 'ramp', 'tunnel', 'speed_strip', 'jump_gap'] },
            { level: 4, color: 0x32cd32, label: "NORMAL", types: ['straight', 'ramp', 'tunnel', 'zigzag', 'bumpy', 'jump_gap', 'climb'] },
            { level: 7, color: 0x1e90ff, label: "CHALLENGING", types: ['zigzag', 'gap', 'archipelago', 'spinner', 'double_jump_gap', 'climb'] },
            { level: 10, color: 0xffff00, label: "HARD", types: ['gap', 'spinner', 'pendulum', 'stairs', 'halfpipe', 'double_jump_gap'] },
            { level: 13, color: 0xffa500, label: "TOUGH", types: ['pendulum', 'hammer_gauntlet', 'moving_rects', 'checkerboard', 'triple_jump_gap'] },
            { level: 16, color: 0xff4500, label: "EXPERT", types: ['hammer_gauntlet', 'side_crusher', 'narrow', 'moving_rects', 'triple_jump_gap'] },
            { level: 19, color: 0x8b0000, label: "EXTREME", types: ['narrow', 'side_crusher', 'checkerboard', 'archipelago', 'triple_jump_gap'] },
            { level: 22, color: 0x4b0082, label: "INSANE", types: ['narrow', 'side_crusher', 'hammer_gauntlet', 'checkerboard', 'triple_jump_gap'] },
            { level: 25, color: 0x000000, label: "IMPOSSIBLE", types: ['narrow', 'side_crusher', 'hammer_gauntlet', 'checkerboard', 'triple_jump_gap'] }
        ];

        let tier = difficultyTiers[0];
        for (let t of difficultyTiers) {
            if (this.currentLevel >= t.level) tier = t;
        }

        // Weather AI: decide current level weather and optionally enable downhill-biased generation
        this.currentWeather = this.weatherAI ? this.weatherAI.chooseWeather(this.currentLevel) : 'clear';
        // Record for simple learning
        try { this.weatherAI && this.weatherAI.recordWeather(this.currentWeather); } catch(e){}

        // Adjust some level-global parameters based on chosen weather
        if (this.currentWeather === 'rain') {
            this.raining = true;
            this.createRain();
            this.world.contactmaterials.forEach && this.world.contactmaterials.forEach(cm => { try { cm.frictionBackup = cm.friction; cm.friction = Math.max(0.08, (cm.frictionBackup || 0.6) * 0.3); } catch(e){} });
        } else if (this.currentWeather === 'wind') {
            this.windy = true;
            this.wind = { dirX: (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 1.0), strength: 0.7 + Math.random() * 0.9 };
            this.createWind();
        } else if (this.currentWeather === 'snow') {
            // snow will subtly slow the ball and occasionally add slippery patches
            this.snowing = true;
            // create a light particle effect reusing rain system but slower
            try {
                const count = this.getParticleCount('snow', 600);
                const positions = new Float32Array(count * 3);
                const area = Math.max(30, Math.min(120, Math.floor((window.innerWidth + window.innerHeight) / 40)));
                for (let i = 0; i < count; i++) {
                    const ix = i * 3;
                    positions[ix] = (Math.random() - 0.5) * area + (this.ballMesh.position.x || 0);
                    positions[ix + 1] = Math.random() * 40 + 5;
                    positions[ix + 2] = (Math.random() - 0.5) * area + (this.ballMesh.position.z || 0);
                }
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.9, depthWrite: false });
                this.snowPoints = new THREE.Points(geom, mat);
                this.snowPoints.frustumCulled = false;
                this.scene.add(this.snowPoints);
            } catch (e) { console.warn('snow create failed', e); }
            // mild friction reduction with occasional sticky patches handled in physics loop
            this.world.contactmaterials.forEach && this.world.contactmaterials.forEach(cm => { try { cm.frictionBackup = cm.friction; cm.friction = Math.max(0.12, (cm.frictionBackup || 0.6) * 0.45); } catch(e){} });
        } else {
            // clear or mixed: clear defaults; mixed might still set small chance of wind+rain later in segments
            if (this.raining) this.clearRain();
            if (this.windy) this.clearWind();
            if (this.snowing) {
                if (this.snowPoints) { this.scene.remove(this.snowPoints); this.snowPoints.geometry && this.snowPoints.geometry.dispose(); this.snowPoints.material && this.snowPoints.material.dispose(); this.snowPoints = null; }
                this.snowing = false;
            }
        }

        // Weather influences segment selection: increase chance for 'downhill' if weather is windy or snowing or if level requests variety
        this.segmentBias = {};
        if (this.currentWeather === 'wind' || this.currentWeather === 'snow' || this.currentWeather === 'mixed') {
            this.segmentBias['downhill'] = 3.0;
        } else if (this.currentWeather === 'rain') {
            // rain favors narrow and bumpy segments to increase challenge
            this.segmentBias['narrow'] = 1.8;
            this.segmentBias['bumpy'] = 1.4;
        } else {
            this.segmentBias['straight'] = 1.2;
        }

        // Apply tier visual (fog matches difficulty tier, background stays as selected sky)
        const selectedSky = this.skyConfigs[this.saveData.selectedSky] || this.skyConfigs.day;
        this.applySkyConfig(selectedSky);
        
        // If the difficulty color is dominant (fog), blend it
        if (this.scene.fog) {
            this.scene.fog.color.setHex(tier.color);
        }
        document.body.style.backgroundColor = `#${tier.color.toString(16).padStart(6, '0')}`;

        // Rain level: every 5th level becomes a rainy (wet) level with visual rain and reduced friction
        if (this.currentLevel % 5 === 0) {
            this.raining = true;
            this.createRain();
            // Reduce ground friction to simulate slippery wet surfaces
            this.world.contactmaterials.forEach && this.world.contactmaterials.forEach(cm => {
                try { cm.frictionBackup = cm.friction; cm.friction = Math.max(0.1, (cm.frictionBackup || 0.6) * 0.35); } catch(e){}
            });
            // Also create a subtle ambient drizzle sound by lowering rolling SFX slightly
            if (this.rollSound) this.rollSound.volume *= 0.9;
        } else {
            this.raining = false;
        }

        // Windy level: every 7th level introduces directional gusts that push the ball and can blow rain/debris
        if (this.currentLevel % 7 === 0) {
            this.windy = true;
            // wind has direction (-1..1 on X) and strength (0..1)
            this.wind = { dirX: (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.9), strength: 0.5 + Math.random() * 1.0 };
            this.createWind();
        } else {
            this.windy = false;
            this.clearWind();
        }

        // Level scaling
        const numSegments = 15 + Math.floor(this.currentLevel * 2.5);
        const checkpointInterval = Math.floor(numSegments / 3);
        const baseWidth = Math.max(0.7, 7 - (this.currentLevel * 0.3));
        const hazardSpeedMult = 1 + (this.currentLevel * 0.15);
        
        for (let i = 0; i < numSegments; i++) {
            // Add checkpoint every few segments
            if (i > 0 && i % checkpointInterval === 0) {
                this.addCheckpoint(MX(currentX), currentY, currentZ, baseWidth);
                currentZ -= 4;
            }

            const type = tier.types[Math.floor(Math.random() * tier.types.length)];
            
            // Each case is a "sub-generator"
            switch(type) {
                case 'straight': {
                    const len = 15 + Math.random() * 20;
                    this.addPlatform(MX(currentX), currentY, currentZ - len/2, baseWidth, len);
                    this.addCoins(MX(currentX), currentY + 1, currentZ, len, 3);
                    currentZ -= len;
                    break;
                }
                case 'ramp': {
                    // Occasionally create a dramatic 45° ramp by making height ~= length
                    const rampL = 15 + Math.random() * 10;
                    let rampH = 4 + Math.random() * 4;
                    // 20% chance to create a true 45° (height == length)
                    if (Math.random() < 0.20) {
                        rampH = rampL;
                    }
                    // Clamp maximum angle to 45 degrees to avoid overly steep ramps
                    const maxAngle = Math.PI / 4; // 45°
                    const angle = Math.atan2(rampH, rampL);
                    if (angle > maxAngle) {
                        // reduce height so angle equals 45°
                        rampH = Math.tan(maxAngle) * rampL;
                    }

                    this.addRamp(MX(currentX), currentY, currentZ, baseWidth + 1, rampL, rampH);
                    currentZ -= rampL;
                    currentY += rampH;
                    break;
                }
                case 'narrow': {
                    const len = 20;
                    this.addPlatform(MX(currentX), currentY, currentZ - len/2, baseWidth * 0.4, len);
                    this.addCoins(MX(currentX), currentY + 1.2, currentZ, len, 4);
                    currentZ -= len;
                    break;
                }
                case 'pendulum': {
                    this.addPlatform(MX(currentX), currentY, currentZ - 10, baseWidth + 3, 20);
                    this.addPendulum(MX(currentX), currentY, currentZ - 10, hazardSpeedMult);
                    currentZ -= 20;
                    break;
                }
                case 'zigzag': {
                    const zzLen = 12;
                    const offset = 4;
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    this.addPlatform(MX(currentX), currentY, currentZ - zzLen/2, baseWidth, zzLen);
                    currentZ -= zzLen;
                    currentX += offset * dir;
                    this.addPlatform(MX(currentX), currentY, currentZ - zzLen/2, baseWidth, zzLen);
                    currentZ -= zzLen;
                    break;
                }
                case 'gap': {
                    const gapSize = 5 + Math.random() * 3;
                    this.addPlatform(MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= (10 + gapSize);
                    this.addPlatform(MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'bumpy': {
                    for(let b=0; b<6; b++) {
                        const bH = Math.random() * 0.7;
                        this.addPlatform(MX(currentX), currentY + bH, currentZ - 3, baseWidth + 1.5, 6);
                        currentZ -= 6;
                    }
                    break;
                }
                case 'spinner': {
                    this.addPlatform(MX(currentX), currentY, currentZ - 12, baseWidth + 4, 24);
                    this.addSpinner(MX(currentX), currentY + 0.5, currentZ - 12, hazardSpeedMult);
                    currentZ -= 24;
                    break;
                }
                case 'stairs': {
                    const stepCount = 5;
                    const stepLen = 4;
                    const stepH = 0.8;
                    for(let s=0; s<stepCount; s++) {
                        this.addPlatform(MX(currentX), currentY, currentZ - stepLen/2, baseWidth + 2, stepLen);
                        currentZ -= stepLen;
                        currentY += stepH;
                    }
                    break;
                }
                case 'tunnel': {
                    const tLen = 30;
                    this.addPlatform(MX(currentX), currentY, currentZ - tLen/2, baseWidth + 2, tLen);
                    this.addTunnelWalls(MX(currentX), currentY, currentZ - tLen/2, baseWidth + 2, tLen);
                    currentZ -= tLen;
                    break;
                }
                case 'archipelago': {
                    const count = 5;
                    const dist = 8;
                    for(let a=0; a<count; a++) {
                        const offX = (Math.random() - 0.5) * 6;
                        this.addPlatform(MX(currentX + offX), currentY, currentZ - dist/2, 3, 3);
                        this.addCoins(MX(currentX + offX), currentY + 1, currentZ - dist/2, 1, 1);
                        currentZ -= dist;
                    }
                    break;
                }
                case 'checkerboard': {
                    const rows = 4;
                    const cSize = 3;
                    for(let r=0; r<rows; r++) {
                        const offX = (r % 2 === 0) ? -2 : 2;
                        // Use currentX + offX (not currentX + currentX + offX) to place tiles relative to current lane
                        this.addPlatform(MX(currentX + offX), currentY, currentZ - cSize/2, cSize, cSize);
                        currentZ -= cSize + 2;
                    }
                    break;
                }
                case 'hammer_gauntlet': {
                    this.addPlatform(MX(currentX), currentY, currentZ - 15, baseWidth + 4, 30);
                    for(let h=0; h<3; h++) {
                        this.addHammer(MX(currentX), currentY, currentZ - 8 - h*8, hazardSpeedMult);
                    }
                    currentZ -= 30;
                    break;
                }
                case 'moving_rects': {
                    const len = 25;
                    this.addPlatform(MX(currentX), currentY, currentZ - len/2, baseWidth + 2, len);
                    for(let m=0; m<4; m++) {
                        this.addMover(MX(currentX), currentY + 0.5, currentZ - 5 - m*5, 3, 1, 2, false, hazardSpeedMult);
                    }
                    currentZ -= len;
                    break;
                }
                case 'speed_strip': {
                    const len = 20;
                    this.addPlatform(MX(currentX), currentY, currentZ - len/2, baseWidth + 1, len, 0xffff00);
                    currentZ -= len;
                    break;
                }
                case 'halfpipe': {
                    const len = 20;
                    this.addPlatform(MX(currentX), currentY, currentZ - len/2, baseWidth + 6, len);
                    // Sidewalls as ramps
                    this.addRamp(MX(currentX - (baseWidth/2 + 3)), currentY + 1.5, currentZ, 1, len, 0); // Flat visual but physics box...
                    // Better to just add static tilted boxes
                    this.addWall(MX(currentX - baseWidth/2 - 2), currentY + 1, currentZ - len/2, 1, len, Math.PI/4);
                    this.addWall(MX(currentX + baseWidth/2 + 2), currentY + 1, currentZ - len/2, 1, len, -Math.PI/4);
                    currentZ -= len;
                    break;
                }
                case 'side_crusher': {
                    const len = 15;
                    this.addPlatform(MX(currentX), currentY, currentZ - len/2, baseWidth + 2, len);
                    this.addMover(MX(currentX - 3), currentY + 1, currentZ - len/2, 4, 2, len, true, hazardSpeedMult);
                    this.addMover(MX(currentX + 3), currentY + 1, currentZ - len/2, 4, 2, len, true, hazardSpeedMult);
                    currentZ -= len;
                    break;
                }
                case 'jump_gap': {
                    const gap = 8; // Reduced gap for lower max speed
                    this.addPlatform(MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                    this.addCoins(MX(currentX), currentY + 2, currentZ - 5 - gap/2, 1, 1);
                    currentZ -= (10 + gap);
                    this.addPlatform(MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'double_jump_gap': {
                    const gap = 16; // Reduced gap for lower max speed
                    this.addPlatform(MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                    this.addCoins(MX(currentX), currentY + 2.5, currentZ - 5 - gap/3, 1, 1);
                    this.addCoins(MX(currentX), currentY + 4, currentZ - 5 - (2*gap/3), 1, 1);
                    currentZ -= (10 + gap);
                    this.addPlatform(MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'triple_jump_gap': {
                    const gap = 24; // Reduced gap for lower max speed
                    this.addPlatform(MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                    this.addCoins(MX(currentX), currentY + 2, currentZ - 5 - gap/4, 1, 1);
                    this.addCoins(MX(currentX), currentY + 5, currentZ - 5 - (2*gap/4), 1, 1);
                    this.addCoins(MX(currentX), currentY + 3, currentZ - 5 - (3*gap/4), 1, 1);
                    currentZ -= (10 + gap);
                    this.addPlatform(MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'climb': {
                    const stepL = 10;
                    const stepH = 4.5;
                    const stepGap = 6;
                    for(let c=0; c<3; c++) {
                        this.addPlatform(MX(currentX), currentY, currentZ - stepL/2, baseWidth + 3, stepL);
                        this.addCoins(MX(currentX), currentY + 2, currentZ - stepL - stepGap/2, 1, 1);
                        currentZ -= (stepL + stepGap);
                        currentY += stepH;
                    }
                    break;
                }
                case 'glass': {
                    // Fragile glass: slightly narrower, breakable
                    const len = 14;
                    const w = Math.max(1.5, baseWidth * 0.8);
                    this.addGlassPlatform(MX(currentX), currentY + 0.2, currentZ - len/2, w, len);
                    // coins above glass to tempt the player
                    this.addCoins(MX(currentX), currentY + 1.6, currentZ - len/2, len, 2);
                    currentZ -= len;
                    break;
                }
                case 'curve': {
                    // gentle curved lane: implemented as a sequence of short angled platforms shifting X over Z
                    const segments = 6 + Math.floor(Math.random() * 4);
                    const curveWidth = baseWidth;
                    const curveRadius = 6 + Math.random() * 12;
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    const segLen = 6;
                    for (let s = 0; s < segments; s++) {
                        const angle = (s / segments) * (Math.PI / 2) * (0.6 + Math.random() * 0.6) * dir;
                        const offX = Math.sin(angle) * curveRadius;
                        const zStep = segLen;
                        this.addPlatform(MX(currentX + offX), currentY, currentZ - zStep/2, curveWidth, zStep);
                        // sprinkle coins along inner arc
                        if (s % 2 === 0) this.addCoins(MX(currentX + offX * 0.5), currentY + 1, currentZ - s * zStep, zStep, 2);
                        currentZ -= zStep;
                        currentX += 0; // keep baseX stable; platforms offset applied above
                    }
                    break;
                }
                case 'loop_d_loop': {
                    // attempt a simple vertical loop using stacked short ramps/platforms to simulate loop feel
                    // visually approximate loop - the physics won't allow a full physical vertical loop but provides a curved challenge
                    const loopRadius = 6 + Math.random() * 6;
                    const loopSegments = 10;
                    // create ascending ramp into loop
                    this.addRamp(MX(currentX), currentY, currentZ, baseWidth + 1, 8, Math.min(6, loopRadius * 0.6));
                    currentZ -= 8;
                    // create a ring of short platforms around Z to visually suggest a loop - offset X around circle
                    for (let i = 0; i < loopSegments; i++) {
                        const a = (i / loopSegments) * Math.PI * 2;
                        const px = Math.cos(a) * loopRadius;
                        const pz = Math.sin(a) * loopRadius;
                        // small platforms angled around the loop center
                        this.addPlatform(MX(currentX + px), currentY + Math.sin(a) * 2, currentZ - pz, baseWidth * 0.9, 4);
                    }
                    // exit ramp
                    this.addRamp(MX(currentX), currentY, currentZ - loopRadius * 1.2, baseWidth + 1, 10, Math.min(4, loopRadius * 0.4));
                    currentZ -= loopRadius * 1.6;
                    break;
                }
                case 'spiral_tube': {
                    // create a shallow spiral tube by adding platforms around an inward spiral and walls for tunnel effect
                    const turns = 1 + Math.floor(Math.random() * 2);
                    const spiralRadius = 8 + Math.random() * 8;
                    const segments = 14 + Math.floor(Math.random() * 6);
                    for (let i = 0; i < segments; i++) {
                        const t = (i / segments) * (Math.PI * 2 * turns);
                        const r = spiralRadius * (1 - i / segments * 0.6);
                        const px = Math.cos(t) * r;
                        const pz = Math.sin(t) * r;
                        const yOff = (i / segments) * 4; // slight ascent/descent
                        this.addPlatform(MX(currentX + px), currentY + yOff, currentZ - pz, baseWidth * 0.9, 5);
                        // add short tunnel wall segments on sides to simulate tube
                        this.addWall(MX(currentX + px - baseWidth/2 - 0.6), currentY + yOff + 0.6, currentZ - pz, 0.4, 5, 0);
                        this.addWall(MX(currentX + px + baseWidth/2 + 0.6), currentY + yOff + 0.6, currentZ - pz, 0.4, 5, 0);
                        currentZ -= 5;
                    }
                    break;
                }
                default: { // fallback straight
                    this.addPlatform(MX(currentX), currentY, currentZ - 10, baseWidth, 20);
                    currentZ -= 20;
                }
            }
        }

        // Finish line
        const finishLen = 30;
        this.addPlatform(MX(currentX), currentY, currentZ - finishLen/2, 8, finishLen, 0x00ff00);
        this.finishX = MX(currentX);
        this.finishY = currentY;
        this.finishZ = currentZ - finishLen + 10;
        this.placeFinishModel();
        currentZ -= finishLen;

        this.levelLength = Math.abs(currentZ);
        // start timer for time-based bonus
        this.startTime = Date.now();
        this.timeBonusShown = false;
    }

    addPlatform(x, y, z, width, length, color = null) {
        const shape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.5, length / 2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y - 0.5, z);
        this.world.addBody(body);

        const geo = new THREE.BoxGeometry(width, 1, length);
        const mat = color ? this.sharedMaterials.finish : this.sharedMaterials.wood;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(body.position);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.levelObjects.push({ mesh, body });

        // If this is a night level, add neon edge markings along the platform sides
        try {
            if (this.isNightLevel) {
                // thin strip dimensions
                const stripHeight = 0.06;
                const stripDepth = length + 0.02;
                const stripWidth = 0.12; // thickness of the neon strip
                // Left edge strip
                const stripGeoL = new THREE.BoxGeometry(stripWidth, stripHeight, stripDepth);
                const stripL = new THREE.Mesh(stripGeoL, this.sharedMaterials.neon);
                stripL.position.set(x - (width / 2) + stripWidth / 2 + 0.02, y + 0.55, z);
                stripL.receiveShadow = false;
                stripL.castShadow = false;
                this.scene.add(stripL);
                this.levelObjects.push({ mesh: stripL, body: null });

                // Right edge strip
                const stripGeoR = stripGeoL.clone();
                const stripR = new THREE.Mesh(stripGeoR, this.sharedMaterials.neon);
                stripR.position.set(x + (width / 2) - stripWidth / 2 - 0.02, y + 0.55, z);
                stripR.receiveShadow = false;
                stripR.castShadow = false;
                this.scene.add(stripR);
                this.levelObjects.push({ mesh: stripR, body: null });

                // Optional subtle underside glow: thin plane under edges (visual only)
                const underGeo = new THREE.BoxGeometry(width + 0.06, 0.02, 0.06);
                const underMat = this.sharedMaterials.neon.clone ? this.sharedMaterials.neon : this.sharedMaterials.neon;
                const under = new THREE.Mesh(underGeo, underMat);
                under.position.set(x, y + 0.01, z - (length / 2) + 0.02);
                under.rotation.x = 0;
                under.receiveShadow = false;
                under.castShadow = false;
                // low opacity for a faint strip (emissive keeps it visible)
                under.material.transparent = true;
                under.material.opacity = 0.65;
                this.scene.add(under);
                this.levelObjects.push({ mesh: under, body: null });
            }
        } catch (e) {
            // fail silently if neon creation hits an issue
            console.warn('Neon edge creation failed', e);
        }
    }

    // Fragile glass platform: visually transparent and breaks when the ball touches it
    addGlassPlatform(x, y, z, width, length) {
        try {
            const shape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.4, length / 2));
            const body = new CANNON.Body({ mass: 0, shape: shape });
            body.position.set(x, y - 0.4, z);
            this.world.addBody(body);

            const geo = new THREE.BoxGeometry(width, 0.8, length);
            const mat = this.sharedMaterials.glass;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(body.position);
            mesh.receiveShadow = true;
            mesh.castShadow = false;
            this.scene.add(mesh);

            // track glass platforms for breaking logic
            this.levelObjects.push({ mesh, body });
            this.glassPlatforms = this.glassPlatforms || [];
            this.glassPlatforms.push({ mesh, body, x, y, z, width, length, broken: false, breakTimer: 0 });
        } catch (e) {
            console.warn('addGlassPlatform failed', e);
        }
    }

    addTunnelWalls(x, y, z, width, length) {
        const wallH = 2;
        const wallW = 0.2;
        
        // Left wall
        const shapeL = new CANNON.Box(new CANNON.Vec3(wallW/2, wallH/2, length/2));
        const bodyL = new CANNON.Body({ mass: 0, shape: shapeL });
        bodyL.position.set(x - width/2 - wallW/2, y + wallH/2, z);
        this.world.addBody(bodyL);

        const geo = new THREE.BoxGeometry(wallW, wallH, length);
        const meshL = new THREE.Mesh(geo, this.sharedMaterials.wall);
        meshL.position.copy(bodyL.position);
        this.scene.add(meshL);

        // Right wall
        const bodyR = new CANNON.Body({ mass: 0, shape: shapeL });
        bodyR.position.set(x + width/2 + wallW/2, y + wallH/2, z);
        this.world.addBody(bodyR);
        const meshR = new THREE.Mesh(geo, this.sharedMaterials.wall);
        meshR.position.copy(bodyR.position);
        this.scene.add(meshR);

        this.levelObjects.push({ mesh: meshL, body: bodyL }, { mesh: meshR, body: bodyR });
    }

    addRamp(x, y, z, width, length, height) {
        const angle = Math.atan2(height, length);
        const rampLen = Math.sqrt(length*length + height*height);
        const shape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.5, rampLen / 2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        const posZ = z - length/2;
        const posY = y + height/2 - 0.5;
        body.position.set(x, posY, posZ);
        body.quaternion.setFromEuler(angle, 0, 0);
        this.world.addBody(body);

        const geo = new THREE.BoxGeometry(width, 1, rampLen);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.wood);
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.levelObjects.push({ mesh, body });
    }

    addPendulum(x, y, z, speedMult = 1) {
        const pivotHeight = y + 8;
        const ballSize = 1.6;
        const shape = new CANNON.Sphere(ballSize);
        const body = new CANNON.Body({ mass: 10, shape: shape });
        body.position.set(x, pivotHeight - 5, z);
        this.world.addBody(body);

        const geo = new THREE.SphereGeometry(ballSize, 20, 20);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.pendulum);
        this.scene.add(mesh);

        const linePoints = [new THREE.Vector3(x, pivotHeight, z), new THREE.Vector3(x, pivotHeight - 5, z)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
        lineGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
        const line = new THREE.Line(lineGeo, this.sharedMaterials.rope);
        this.scene.add(line);

        const pend = { body, mesh, line, pivot: new THREE.Vector3(x, pivotHeight, z), startTime: Math.random() * Math.PI * 2, speedMult };

        // Attach a small decorative trail model if available (clone from pool). Prefer glTF model then sprite fallback.
        try {
            const trailKeys = ['skeleton', 'zombie', 'eye', 'soldier2', 'venus'];
            for (const k of trailKeys) {
                const tmpl = this._trailModelPool && this._trailModelPool[k];
                if (!tmpl) continue;
                let trailInstance = null;
                if (tmpl.clone) {
                    trailInstance = tmpl.clone(true);
                    // small scale for trail visuals
                    trailInstance.scale && trailInstance.scale.setScalar(0.45);
                    trailInstance.traverse && trailInstance.traverse(c => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
                } else if (tmpl.isSprite) {
                    trailInstance = tmpl.clone();
                    trailInstance.scale.set(0.7, 0.7, 1);
                } else if (tmpl.isObject3D) {
                    trailInstance = tmpl.clone(true);
                    trailInstance.scale && trailInstance.scale.setScalar(0.45);
                }
                if (trailInstance) {
                    trailInstance.position.set(body.position.x, body.position.y, body.position.z);
                    trailInstance.frustumCulled = false;
                    this.scene.add(trailInstance);
                    pend.trail = trailInstance;
                    break;
                }
            }
        } catch (e) {
            // Non-fatal if trail attachment fails
        }

        this.pendulums.push(pend);
    }

    addSpinner(x, y, z, speedMult = 1) {
        const w = 10, h = 0.6, d = 1.0;
        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y + 0.5, z);
        this.world.addBody(body);

        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.spinner);
        this.scene.add(mesh);

        const spinner = { body, mesh, speed: (2.5 + Math.random() * 1.5) * speedMult };

        // attach small decorative trail if available
        try {
            const trailKeys = ['soldier2', 'skeleton', 'eye', 'venus', 'zombie'];
            for (const k of trailKeys) {
                const tmpl = this._trailModelPool && this._trailModelPool[k];
                if (!tmpl) continue;
                let trailInstance = null;
                if (tmpl.clone) {
                    trailInstance = tmpl.clone(true);
                    trailInstance.scale && trailInstance.scale.setScalar(0.35);
                    trailInstance.traverse && trailInstance.traverse(c => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
                } else if (tmpl.isSprite) {
                    trailInstance = tmpl.clone();
                    trailInstance.scale.set(0.5, 0.5, 1);
                } else if (tmpl.isObject3D) {
                    trailInstance = tmpl.clone(true);
                    trailInstance.scale && trailInstance.scale.setScalar(0.35);
                }
                if (trailInstance) {
                    trailInstance.position.set(body.position.x, body.position.y + 1.0, body.position.z);
                    trailInstance.frustumCulled = false;
                    this.scene.add(trailInstance);
                    spinner.trail = trailInstance;
                    break;
                }
            }
        } catch (e) {}

        this.spinners.push(spinner);
    }

    addHammer(x, y, z, speedMult = 1) {
        const hSize = 2;
        const shape = new CANNON.Box(new CANNON.Vec3(hSize, hSize, 0.5));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y + 2, z);
        this.world.addBody(body);
        const geo = new THREE.BoxGeometry(hSize*2, hSize*2, 1);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.pendulum);
        this.scene.add(mesh);
        this.movers.push({ body, mesh, type: 'hammer', basePos: new THREE.Vector3(x, y + 2, z), offset: Math.random() * Math.PI, speedMult });
    }

    addMover(x, y, z, w, h, d, sideways = false, speedMult = 1) {
        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y, z);
        this.world.addBody(body);
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.spinner);
        this.scene.add(mesh);
        const mover = { body, mesh, type: sideways ? 'side' : 'slide', basePos: new THREE.Vector3(x, y, z), offset: Math.random() * Math.PI, speedMult };

        // attach a trailing decorative model where available
        try {
            const trailKeys = ['venus', 'skeleton', 'soldier2', 'eye', 'zombie'];
            for (const k of trailKeys) {
                const tmpl = this._trailModelPool && this._trailModelPool[k];
                if (!tmpl) continue;
                let trailInstance = null;
                if (tmpl.clone) {
                    trailInstance = tmpl.clone(true);
                    trailInstance.scale && trailInstance.scale.setScalar(0.28);
                    trailInstance.traverse && trailInstance.traverse(c => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
                } else if (tmpl.isSprite) {
                    trailInstance = tmpl.clone();
                    trailInstance.scale.set(0.4, 0.4, 1);
                } else if (tmpl.isObject3D) {
                    trailInstance = tmpl.clone(true);
                    trailInstance.scale && trailInstance.scale.setScalar(0.28);
                }
                if (trailInstance) {
                    trailInstance.position.set(body.position.x, body.position.y + 0.6, body.position.z);
                    trailInstance.frustumCulled = false;
                    this.scene.add(trailInstance);
                    mover.trail = trailInstance;
                    break;
                }
            }
        } catch (e) {}

        this.movers.push(mover);
    }

    addWall(x, y, z, w, l, rotZ) {
        const h = 2;
        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, l/2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y, z);
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), rotZ);
        this.world.addBody(body);
        const geo = new THREE.BoxGeometry(w, h, l);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.wall);
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
        this.scene.add(mesh);
        this.levelObjects.push({ body, mesh });
    }

    addCoins(x, y, startZ, length, count) {
        // Define 5 coin tiers: tiny..huge with values and rarity weight (bigger = rarer)
        const coinTiers = [
            { size: 0.6, height: 0.06, value: 2,   color: 0xdddd55, weight: 50 }, // common small
            { size: 0.9, height: 0.08, value: 5,   color: 0xffdc6b, weight: 30 }, // common
            { size: 1.25, height: 0.10, value: 12, color: 0xffb84d, weight: 12 }, // uncommon
            { size: 1.6, height: 0.12, value: 25, color: 0xff9a33, weight: 6  }, // rare
            { size: 2.0, height: 0.14, value: 50, color: 0xff7f00, weight: 2  }  // very rare (max value)
        ];

        // Precompute cumulative weights for weighted random selection
        const totalWeight = coinTiers.reduce((s, t) => s + t.weight, 0);
        const cum = [];
        let acc = 0;
        for (let t of coinTiers) { acc += t.weight; cum.push(acc / totalWeight); }

        const step = length / (count + 1);
        for (let i = 1; i <= count; i++) {
            // choose tier by weighted random
            const r = Math.random();
            let idx = 0;
            for (let j = 0; j < cum.length; j++) { if (r <= cum[j]) { idx = j; break; } }
            const tier = coinTiers[idx];

            // create geometry based on tier size
            const coinGeo = new THREE.CylinderGeometry(tier.size, tier.size, tier.height, 20);
            const mat = new THREE.MeshPhongMaterial({ color: tier.color, shininess: 80 });
            const coin = new THREE.Mesh(coinGeo, mat);
            coin.rotation.x = Math.PI / 2;
            // slight bob and scatter for variety
            const px = x + (Math.random() - 0.5) * Math.min(3, tier.size * 1.6);
            const pz = startZ - i * step + (Math.random() - 0.5) * 0.8;
            const py = y + 0.5 + (tier.size - 0.6) * 0.18;
            coin.position.set(px, py, pz);

            // store value and rarity on userData for collection logic and UI
            coin.userData = coin.userData || {};
            coin.userData.value = tier.value;
            coin.userData.tierName = ['tiny','small','medium','large','huge'][idx];
            coin.userData.rarity = ['common','common','uncommon','rare','very_rare'][idx];

            // give a subtle scale pulsate animation flag
            coin.userData.pulsePhase = Math.random() * Math.PI * 2;

            this.scene.add(coin);
            this.coins.push(coin);
        }
    }

    // Triggered when an obstacle impacts the player: spawn collectible coins at the ball and deduct from wallet.
    triggerDropFromObstacle(obstacle, options = {}) {
        try {
            // cooldown per obstacle to avoid repeated immediate drops
            obstacle._lastDropAt = obstacle._lastDropAt || 0;
            const now = Date.now();
            const cooldownMs = options.cooldownMs || 800; // default cooldown
            if (now - obstacle._lastDropAt < cooldownMs) return;
            obstacle._lastDropAt = now;

            // determine drop amount: scaled by obstacle type/severity and by current level so higher levels drop more
            const baseLoss = options.baseLoss || 10;
            let multiplier = 1.0;
            if (obstacle.type === 'hammer') multiplier = 1.6;
            else if (obstacle.type === 'side') multiplier = 1.2;
            else if (obstacle.type === 'pendulum') multiplier = 1.4;
            else if (obstacle.type === 'slide') multiplier = 1.0;
            else if (obstacle.type === 'spinner') multiplier = 1.1;

            // scale by level: small progressive increase per level (keeps losses balanced)
            const levelFactor = 1 + Math.min(3, (this.currentLevel || 1) * 0.06); // up to ~3x on very high levels
            const rawLoss = Math.max(1, Math.round(baseLoss * multiplier * levelFactor));
            const actualLoss = Math.min(rawLoss, Math.max(0, this.saveData.totalCoins));
            if (actualLoss <= 0) return;

            // deduct coins immediately
            this.saveData.totalCoins = Math.max(0, this.saveData.totalCoins - actualLoss);
            this.save();

            // spawn coin meshes around the ball so they can be collected (make small coins for dropped change)
            this.spawnDroppedCoins(this.ballMesh.position.clone(), actualLoss);

            // notify briefly
            try { notifier.notify(`Dropped ${actualLoss} 🪙`, { timeout: 1100, type: 'warn' }); } catch (e) {}

            this.updateWalletUI();
        } catch (e) {
            console.warn('triggerDropFromObstacle failed', e);
        }
    }

    // Spawns a handful of small collectible coins at a world position that represent dropped wallet coins.
    spawnDroppedCoins(worldPos, totalValue) {
        try {
            // represent dropped coins as many small-value coins (2/5 value tiers)
            const pieceValue = 2; // each dropped coin is value 2
            const count = Math.max(1, Math.min(12, Math.ceil(totalValue / pieceValue)));
            const spread = 1.8;
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * spread;
                const px = worldPos.x + Math.cos(angle) * r;
                const pz = worldPos.z + Math.sin(angle) * r;
                const py = worldPos.y + 0.2 + Math.random() * 0.8;

                const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.06, 12);
                const mat = new THREE.MeshPhongMaterial({ color: 0xffdc6b, shininess: 70 });
                const coin = new THREE.Mesh(coinGeo, mat);
                coin.rotation.x = Math.PI / 2;
                coin.position.set(px, py, pz);
                coin.userData = coin.userData || {};
                coin.userData.value = pieceValue;
                coin.userData.tierName = 'dropped';
                coin.userData.pulsePhase = Math.random() * Math.PI * 2;
                // small initial upward impulse visualized by animating position in animate loop via userData
                coin.userData._dropVel = new THREE.Vector3((Math.random()-0.5)*0.4, 1.0 + Math.random()*0.6, (Math.random()-0.5)*0.4);
                // mark as collectible (visible)
                this.scene.add(coin);
                this.coins.push(coin);
            }
        } catch (e) {
            console.warn('spawnDroppedCoins failed', e);
        }
    }

    addCheckpoint(x, y, z, width) {
        const length = 6;
        // Physical platform (Cyan color for checkpoint)
        this.addPlatform(x, y, z - length/2, width + 2, length, 0x00ffff);
        
        // Logic object
        this.checkpoints.push({
            z: z,
            pos: new CANNON.Vec3(x, y + 2, z - length/2),
            reached: false
        });
    }

    // Rain creation and cleanup
    createRain() {
        // Create a simple particle system for rain
        const count = this.getParticleCount('rain', 1200);
        const positions = new Float32Array(count * 3);
        const area = Math.max(30, Math.min(120, Math.floor((window.innerWidth + window.innerHeight) / 40)));
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix] = (Math.random() - 0.5) * area + (this.ballMesh.position.x || 0);
            positions[ix + 1] = Math.random() * 40 + 5;
            positions[ix + 2] = (Math.random() - 0.5) * area + (this.ballMesh.position.z || 0);
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color: 0x9ec6ff, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false });
        this.rainPoints = new THREE.Points(geom, mat);
        this.rainPoints.frustumCulled = false;
        this.scene.add(this.rainPoints);
        this.rainStartTime = Date.now();

        // lightweight rain update loop - attach to animation via flag
    }

    clearRain() {
        try {
            if (this.rainPoints) {
                this.scene.remove(this.rainPoints);
                if (this.rainPoints.geometry) this.rainPoints.geometry.dispose();
                if (this.rainPoints.material) this.rainPoints.material.dispose();
                this.rainPoints = null;
            }
            // restore friction if we backed it up
            this.world.contactmaterials.forEach && this.world.contactmaterials.forEach(cm => {
                try { if (cm.frictionBackup !== undefined) cm.friction = cm.frictionBackup; } catch(e){}
            });
        } catch (e) {
            console.warn('Error clearing rain:', e);
        }
    }

    // Wind helpers: spawn subtle wind particles/visuals and prepare wind state
    createWind() {
        // lightweight wind indicator: a few long streak particles that drift along wind dir
        try {
            const count = this.getParticleCount('wind', 120);
            const positions = new Float32Array(count * 3);
            const area = Math.max(40, Math.min(140, Math.floor((window.innerWidth + window.innerHeight) / 30)));
            for (let i = 0; i < count; i++) {
                const ix = i * 3;
                positions[ix] = (Math.random() - 0.5) * area + (this.ballMesh.position.x || 0);
                positions[ix + 1] = Math.random() * 20 + 5;
                positions[ix + 2] = (Math.random() - 0.5) * area + (this.ballMesh.position.z || 0);
            }
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const mat = new THREE.PointsMaterial({ color: 0xe0f7ff, size: 0.08, transparent: true, opacity: 0.45, depthWrite: false });
            this.windPoints = new THREE.Points(geom, mat);
            this.windPoints.frustumCulled = false;
            this.scene.add(this.windPoints);

            // a subtle directional light gust (visual cue)
            if (!this.windLight) {
                this.windLight = new THREE.DirectionalLight(0xaaddff, 0.05);
                this.scene.add(this.windLight);
            }
        } catch (e) {
            console.warn('createWind error', e);
        }
    }

    clearWind() {
        try {
            if (this.windPoints) {
                this.scene.remove(this.windPoints);
                if (this.windPoints.geometry) this.windPoints.geometry.dispose();
                if (this.windPoints.material) this.windPoints.material.dispose();
                this.windPoints = null;
            }
            if (this.windLight) {
                this.scene.remove(this.windLight);
                this.windLight = null;
            }
            this.wind = null;
        } catch (e) {
            console.warn('Error clearing wind:', e);
        }
    }

    jump() {
        if (this.jumpCount < 3 && !this.isGameOver) {
            const jForce = (this._skinAbility && this._skinAbility.jump) ? (JUMP_FORCE * this._skinAbility.jump) : JUMP_FORCE;
            this.ballBody.velocity.y = jForce;
            this.jumpCount++;
            this.isGrounded = false;
            this.playSound('jump');
        }
    }

    playSound(name) {
        const audio = new Audio(`${name}.mp3`);
        audio.volume = 0.4;
        audio.play().catch(() => {});
    }

    updatePhysics() {
        // lazy-hoist small reusable temps to instance to avoid per-frame allocations
        if (!this._tmpThreeA) {
            this._tmpThreeA = new THREE.Vector3();
            this._tmpThreeB = new THREE.Vector3();
            this._tmpThreeC = new THREE.Vector3();
            this._tmpCannon = new CANNON.Vec3();
            this._tmpTorque = new CANNON.Vec3();
        }

        this.world.step(1/60);
        this.inputX = 0;
        this.inputZ = 0;

        // Grounded check via contact points (reuse tmp cannon vec)
        this.isGrounded = false;
        for (let i = 0; i < this.world.contacts.length; i++) {
            const contact = this.world.contacts[i];
            if (contact.bi === this.ballBody || contact.bj === this.ballBody) {
                const normal = this._tmpCannon;
                if (contact.bi === this.ballBody) contact.ni.negate(normal);
                else normal.copy(contact.ni);
                if (normal.y > 0.4) { // Lowered threshold to keep grounded state on steeper ramps
                    this.isGrounded = true;
                    break;
                }
            }
        }

        if (this.isGrounded) this.jumpCount = 0;

        // sync visuals
        this.ballMesh.position.copy(this.ballBody.position);
        this.ballMesh.quaternion.copy(this.ballBody.quaternion);

        // gather input
        if (this.keys['ArrowUp'] || this.keys['KeyW']) this.inputZ = -1;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) this.inputZ = 1;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) this.inputX = -1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) this.inputX = 1;

        this.inputX += this.joystickInput.x + this.mouseInput.x;
        this.inputZ -= (this.joystickInput.y + this.mouseInput.y);

        if (document.pointerLockElement === document.body && !this.isDragging) {
            this.mouseInput.x = 0;
            this.mouseInput.y = 0;
        }

        // movement direction: reuse THREE vectors for forward/right/combined
        const airMult = this.isGrounded ? 1.0 : 0.25;
        const vF = this._tmpThreeA.set(0, 0, this.inputZ).applyAxisAngle(new THREE.Vector3(0,1,0), this.cameraYaw);
        const vR = this._tmpThreeB.set(this.inputX, 0, 0).applyAxisAngle(new THREE.Vector3(0,1,0), this.cameraYaw);

        // Snap alignment check (no allocations)
        const normalizedYaw = ((this.cameraYaw % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
        const isAligned = normalizedYaw < 0.3 || normalizedYaw > (Math.PI * 2 - 0.3) ||
                          (normalizedYaw > Math.PI - 0.3 && normalizedYaw < Math.PI + 0.3);

        if (isAligned && Math.abs(this.inputX) < 0.1) {
            vF.x = 0;
            vR.x = 0;
            vR.z = 0;
        }

        // combinedMove in _tmpThreeC
        const combined = this._tmpThreeC.copy(vF).add(vR);

        // compute force using a reusable cannon vec
        const effSpeed = (this._skinAbility && this._skinAbility.speed) ? (BALL_SPEED * this._skinAbility.speed) : BALL_SPEED;
        const force = this._tmpCannon;
        force.x = combined.x * effSpeed * airMult;
        force.y = 0;
        force.z = combined.z * effSpeed * airMult;

        // wind: reuse _tmpTorque for small torque vector
        if (this.windy && this.wind) {
            const windStrength = (this.wind.strength || 0.8);
            const gust = this.wind.dirX * windStrength * 40;
            force.x += gust;
            this._tmpTorque.x = 0;
            this._tmpTorque.y = 0.02 * this.wind.dirX * windStrength;
            this._tmpTorque.z = 0;
            try { this.ballBody.torque.vadd(this._tmpTorque, this.ballBody.torque); } catch(e) {}
        }

        // apply force (note: applyForce will copy values internally)
        this.ballBody.applyForce(force, this.ballBody.position);

        const velocity = this.ballBody.velocity;

        // lateral stabilization
        if (this.isGrounded) {
            if (Math.abs(this.inputX) < 0.05) {
                this.ballBody.velocity.x *= 0.75;
                if (Math.abs(this.ballBody.velocity.x) < 0.05) this.ballBody.velocity.x = 0;
            } else {
                this.ballBody.velocity.x *= 0.95;
            }
        }

        const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

        // rolling sound
        if (this.rollSound) {
            if (this.isGrounded && !this.isGameOver && speed > 0.5) {
                const targetVol = Math.min(0.6, speed / MAX_VELOCITY);
                this.rollSound.volume += (targetVol - this.rollSound.volume) * 0.1;
                this.rollSound.playbackRate = 0.5 + (speed / MAX_VELOCITY) * 1.0;
            } else {
                this.rollSound.volume *= 0.9;
            }
        }

        if (speed > MAX_VELOCITY) {
            const ratio = MAX_VELOCITY / speed;
            this.ballBody.velocity.x *= ratio;
            this.ballBody.velocity.z *= ratio;
        }

        const time = Date.now() * 0.002;
        this.pendulums.forEach(p => {
            const t = time * p.speedMult;
            const angle = Math.sin(t + p.startTime) * 1.3;
            const px = p.pivot.x + Math.sin(angle) * 6;
            const py = p.pivot.y - Math.cos(angle) * 6;
            p.body.position.set(px, py, p.pivot.z);
            p.mesh.position.copy(p.body.position);
            const pos = p.line.geometry.attributes.position.array;
            pos[3] = p.body.position.x; pos[4] = p.body.position.y; pos[5] = p.body.position.z;
            p.line.geometry.attributes.position.needsUpdate = true;
        });

        this.spinners.forEach(s => {
            const rot = time * s.speed;
            s.body.quaternion.setFromEuler(0, rot, 0);
            s.mesh.position.copy(s.body.position);
            s.mesh.quaternion.copy(s.body.quaternion);
        });

        this.movers.forEach(m => {
            const t = (time + m.offset) * m.speedMult;
            if (m.type === 'hammer') {
                const offX = Math.sin(t * 3) * 5;
                m.body.position.set(m.basePos.x + offX, m.basePos.y, m.basePos.z);
            } else if (m.type === 'slide') {
                const offX = Math.sin(t * 2) * 3;
                m.body.position.set(m.basePos.x + offX, m.basePos.y, m.basePos.z);
            } else if (m.type === 'side') {
                const offX = Math.sin(t * 2.5) * 2;
                const dir = m.basePos.x > 0 ? 1 : -1;
                m.body.position.set(m.basePos.x + offX * dir, m.basePos.y, m.basePos.z);
            }
            m.mesh.position.copy(m.body.position);

            // If mover is dangerously close to the ball, trigger a drop (best-effort collision -> proximity)
            try {
                const dx = Math.abs(this.ballMesh.position.x - m.body.position.x);
                const dz = Math.abs(this.ballMesh.position.z - m.body.position.z);
                const hitRadius = 1.4 + (m.type === 'hammer' ? 2.2 : 1.0);
                if (dx <= hitRadius && dz <= hitRadius) {
                    // call drop logic; obstacle includes a lightweight type for severity
                    m.type = m.type || (m.basePos && m.basePos.x ? 'slide' : 'slide');
                    this.triggerDropFromObstacle(m, { baseLoss: 8 });
                }
            } catch (e) {}
        });
    }

    updateWalletUI() {
        document.getElementById('total-coins').innerText = `Wallet: ${this.saveData.totalCoins}`;
    }

    checkGameState() {
        // Iterate coins and handle collection; coins now carry userData.value for variable payouts
        for (let i = 0; i < this.coins.length; i++) {
            const coin = this.coins[i];
            if (!coin) continue;
            // simple idle animation: spin + subtle pulse
            try {
                if (coin.visible) {
                    coin.rotation.z += 0.06;
                    const p = (coin.userData && coin.userData.pulsePhase) ? coin.userData.pulsePhase : 0;
                    const s = 1 + Math.sin((Date.now() / 600) + p) * 0.03;
                    coin.scale.set(s, s, s);
                }
            } catch (e) {}

            if (coin.visible && this.ballMesh.position.distanceTo(coin.position) < (1.2 + (coin.userData && coin.userData.value ? Math.min(1.0, coin.userData.value / 20) : 0))) {
                // mark collected and hide
                coin.visible = false;

                // Determine base coin value (from tier) and apply skin multipliers
                const baseValue = (coin.userData && coin.userData.value) ? coin.userData.value : 10;
                const coinMult = (this._skinAbility && this._skinAbility.coins) ? this._skinAbility.coins : 1.0;
                const amount = Math.round(baseValue * coinMult);

                this.score += amount;
                this.saveData.totalCoins += amount;
                this.save();
                this.updateWalletUI();
                this.playSound('coin_collect');

                // Small floating text feedback (brief)
                try {
                    const txt = document.createElement('div');
                    txt.innerText = `+${amount}`;
                    txt.style.position = 'absolute';
                    const canvasPos = this.toScreenPosition(coin.position || new THREE.Vector3(), this.camera, this.renderer);
                    txt.style.left = `${canvasPos.x}px`;
                    txt.style.top = `${canvasPos.y}px`;
                    txt.style.color = '#fff';
                    txt.style.background = 'rgba(0,0,0,0.6)';
                    txt.style.padding = '6px 8px';
                    txt.style.borderRadius = '8px';
                    txt.style.zIndex = 1500;
                    txt.style.fontWeight = '700';
                    document.body.appendChild(txt);
                    setTimeout(() => { txt.style.opacity = '0'; setTimeout(()=>txt.remove(), 350); }, 700);
                } catch (e) {}
                
                document.getElementById('coin-display').innerText = `Session: ${this.score}`;
            }
        }

        if (this.ballBody.position.y < -10 && !this.isGameOver) this.gameOver(false);
        if (this.ballBody.position.z < this.finishZ && !this.isGameOver) this.gameOver(true);

        // Check for checkpoints
        this.checkpoints.forEach(cp => {
            if (!cp.reached && this.ballBody.position.z < cp.z) {
                cp.reached = true;
                this.lastCheckpointPos.copy(cp.pos);
                // Subtle feedback for checkpoint reached
                this.playSound('coin_collect');
            }
        });

        // Glass platform breaking logic: if ball touches a glass platform, schedule/break it
        try {
            if (this.glassPlatforms && this.glassPlatforms.length) {
                this.glassPlatforms.forEach(g => {
                    if (g.broken) return;
                    const dx = Math.abs(this.ballMesh.position.x - g.x);
                    const dz = Math.abs(this.ballMesh.position.z - g.z);
                    const withinX = dx <= (g.width / 2) + 0.6;
                    const withinZ = dz <= (g.length / 2) + 0.6;
                    const above = (this.ballMesh.position.y <= (g.y + 1.0)); // ball is near/onto glass
                    if (withinX && withinZ && above) {
                        // start breaking: give a small delay if rolling (so player sees crack)
                        g.breakTimer = g.breakTimer || 0;
                        g.breakTimer += 1;
                        if (g.breakTimer > 12) { // ~200ms at 60fps
                            // remove physics body and visually fade out
                            try {
                                if (g.body) this.world.removeBody(g.body);
                                g.broken = true;
                                // visual fade and shatter cue
                                const m = g.mesh;
                                if (m && m.material) {
                                    // animate opacity then remove
                                    const start = Date.now();
                                    const dur = 400;
                                    const tick = () => {
                                        const t = (Date.now() - start) / dur;
                                        if (t >= 1) {
                                            try { if (m.parent) m.parent.remove(m); } catch(e){}
                                            return;
                                        }
                                        try { m.material.opacity = Math.max(0, (1 - t) * 0.28); } catch(e){}
                                        requestAnimationFrame(tick);
                                    };
                                    tick();
                                }
                                // remove reference later in cleanup
                                this.playSound('fall_off');
                            } catch (e) {
                                console.warn('Error breaking glass platform', e);
                            }
                        }
                    } else {
                        // reset timer if ball moved off
                        g.breakTimer = 0;
                    }
                });
                // prune broken entries occasionally
                this.glassPlatforms = this.glassPlatforms.filter(g => !g.broken || (g.broken && g.mesh && g.mesh.parent));
            }
        } catch (e) {}

        const progress = Math.min(100, Math.max(0, Math.floor((Math.abs(this.ballBody.position.z) / this.levelLength) * 100)));
        document.getElementById('distance-display').innerText = `Distance: ${progress}%`;

        // helper to project world -> screen for coin popups (best-effort)
        // attach to game instance so small UI feedback above uses it
        if (!this.toScreenPosition) {
            this.toScreenPosition = (pos, cam, renderer) => {
                try {
                    const vector = pos.clone().project(cam);
                    const x = (vector.x + 1) / 2 * renderer.domElement.clientWidth;
                    const y = (-vector.y + 1) / 2 * renderer.domElement.clientHeight;
                    return { x, y };
                } catch (e) {
                    return { x: renderer.domElement.clientWidth/2, y: renderer.domElement.clientHeight/2 };
                }
            };
        }
    }

    gameOver(win) {
        this.isGameOver = true;
        this.isWin = win;
        const overlay = document.getElementById('overlay');
        const title = document.getElementById('overlay-title');
        const btn = document.getElementById('next-btn');

        // Show UI overlay
        overlay.style.display = 'flex';

        if (win) {
            title.innerText = "LEVEL " + this.currentLevel + " COMPLETE!";
            btn.innerText = "NEXT LEVEL";
            this.playSound('finish_line');

            // Compute time bonus (faster = bigger bonus). Simple decay: start at 100 and -2 per second
            if (!this.timeBonusShown && this.startTime) {
                const timeTaken = (Date.now() - this.startTime) / 1000;
                let bonus = Math.max(0, Math.round(100 - Math.floor(timeTaken) * 2));
                // small scaling by level difficulty
                bonus = Math.round(bonus * (1 + Math.min(0.5, this.currentLevel * 0.02)));
                if (bonus > 0) {
                    this.saveData.totalCoins += bonus;
                    this.save();
                    this.updateWalletUI();
                    this.showTimeBonus(bonus);
                }
                // Record leaderboard entry (local)
                try {
                    this.addLeaderboardEntry({
                        name: 'You',
                        level: this.currentLevel,
                        timeSec: timeTaken,
                        score: this.score,
                        timestamp: Date.now()
                    });
                } catch (e) { console.warn('Leaderboard add failed', e); }
                this.timeBonusShown = true;
            }
        } else {
            title.innerText = "CRASHED!";
            btn.innerText = "TRY AGAIN";
            this.playSound('fall_off');
        }
    }

    // Visual comic-book style time bonus pop-up
    showTimeBonus(bonus) {
        // create or reuse element
        let el = document.getElementById('time-bonus-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'time-bonus-toast';
            el.style.position = 'absolute';
            el.style.left = '50%';
            el.style.top = '20%';
            el.style.transform = 'translateX(-50%) scale(0.2)';
            el.style.padding = '18px 28px';
            el.style.zIndex = '1200';
            el.style.pointerEvents = 'none';
            el.style.border = '6px solid #fff';
            el.style.borderRadius = '12px';
            el.style.background = 'linear-gradient(135deg,#ffef6b,#ff9a6b)';
            el.style.fontFamily = "Impact, 'Arial Black', sans-serif";
            el.style.color = '#2b2b2b';
            el.style.textAlign = 'center';
            el.style.fontSize = '32px';
            el.style.letterSpacing = '2px';
            el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5), 0 0 0 6px rgba(255,255,255,0.06) inset';
            el.style.transition = 'transform 600ms cubic-bezier(.18,.9,.32,1), opacity 400ms';
            document.body.appendChild(el);
        }

        el.innerHTML = `+${bonus} TIME BONUS!`;
        el.style.opacity = '1';
        // comic pop: scale and wobble
        requestAnimationFrame(() => {
            el.style.transform = 'translateX(-50%) scale(1)';
        });

        // quick animated comic burst (simple CSS shake using setInterval)
        const start = Date.now();
        const dur = 900;
        const wobble = setInterval(() => {
            const t = (Date.now() - start) / dur;
            if (t >= 1) {
                clearInterval(wobble);
                el.style.transform = 'translateX(-50%) scale(0.8)';
                setTimeout(() => {
                    el.style.opacity = '0';
                    setTimeout(() => {
                        if (el && el.parentNode) el.parentNode.removeChild(el);
                    }, 500);
                }, 700);
                return;
            }
            const shake = Math.sin(t * Math.PI * 8) * (1 - t) * 6;
            el.style.transform = `translateX(calc(-50% + ${shake}px)) scale(${1 + (1 - t) * 0.1})`;
        }, 33);
    }

    reset() {
        if (this.isWin) {
            this.currentLevel++;
            this.createLevel();
        }
        
        // Reset to last checkpoint or start
        this.ballBody.position.copy(this.lastCheckpointPos);
        // Ensure ball is slightly above ground to prevent clipping on reset
        this.ballBody.position.y += 1;
        this.ballBody.velocity.set(0, 0, 0);
        this.ballBody.angularVelocity.set(0, 0, 0);
        this.isGameOver = false;
        this.isWin = false;
        this.score = 0;
        document.getElementById('coin-display').innerText = `Coins: 0`;
        document.getElementById('overlay').style.display = 'none';
        this.coins.forEach(c => c.visible = true);
    }

    setupUI() {
        document.getElementById('next-btn').addEventListener('click', () => this.reset());

        const setupModal = (btnId, modalId) => {
            const btn = document.getElementById(btnId);
            const modal = document.getElementById(modalId);
            const close = modal.querySelector('.close-modal');
            btn.addEventListener('click', () => {
                this.renderGrids();
                modal.style.display = 'flex';
                // Ensure pointer lock is released when menu opens
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
                // Render leaderboard when opened
                if (modalId === 'leaderboard-modal') this.renderLeaderboard();
            });
            close.addEventListener('click', (e) => {
                e.stopPropagation();
                modal.style.display = 'none';
            });
        };

        setupModal('help-btn-open', 'help-modal');
        setupModal('balls-btn-open', 'balls-modal');
        setupModal('skins-btn-open', 'skins-modal');
        setupModal('skies-btn-open', 'skies-modal');
        setupModal('leaderboard-btn-open', 'leaderboard-modal');
        setupModal('settings-btn-open', 'settings-modal');



        // Clear leaderboard button
        const clearBtn = document.getElementById('clear-leaderboard');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                localStorage.removeItem('goingBallsLeaderboard_v1');
                this.renderLeaderboard();
            });
        }

        // Settings toggles wiring
        const musicToggle = document.getElementById('settings-music-toggle');
        if (musicToggle) {
            musicToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.musicEnabled = !this.musicEnabled;
                localStorage.setItem('goingBalls_musicEnabled', this.musicEnabled ? 'true' : 'false');
                if (this.musicEnabled) this.backgroundMusic.play().catch(()=>{});
                else try { this.backgroundMusic.pause(); } catch(e){}
                // keep top music button in sync
                const musicBtn = document.getElementById('music-toggle');
                if (musicBtn) musicBtn.innerText = this.musicEnabled ? 'MUSIC: ON' : 'MUSIC: OFF';
            });
        }

        const sfxToggle = document.getElementById('settings-sfx-toggle');
        if (sfxToggle) {
            sfxToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                // simple per-session sfx mute using a flag
                this.sfxEnabled = !this.sfxEnabled;
                sfxToggle.innerText = this.sfxEnabled ? 'On' : 'Off';
            });
            // default true
            this.sfxEnabled = true;
            sfxToggle.innerText = 'On';
        }

        const plToggle = document.getElementById('settings-pointerlock-toggle');
        if (plToggle) {
            plToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                // toggle hint only flag (no direct pointer lock action here)
                this.pointerLockHint = !this.pointerLockHint;
                plToggle.innerText = this.pointerLockHint ? 'On' : 'Off';
            });
            this.pointerLockHint = true;
            plToggle.innerText = 'On';
        }

        // Joystick power and deadzone controls (persisted per-session)
        this.joystickPower = parseFloat(sessionStorage.getItem('goingBalls_joystickPower') || '1.0');
        this.joystickDeadzone = parseFloat(sessionStorage.getItem('goingBalls_joystickDeadzone') || '0.10');

        // Ensure mobile joystick is visible on touch devices
        try {
            const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
            const joystickContainer = document.getElementById('joystick-container');
            const jumpBtn = document.getElementById('jump-btn');
            if (isTouch && joystickContainer) {
                joystickContainer.style.display = 'block';
                joystickContainer.style.pointerEvents = 'auto';
                joystickContainer.style.opacity = '1';
            }
            if (isTouch && jumpBtn) {
                jumpBtn.style.display = 'flex';
            }
        } catch (e) {}

        // Initialize slider UI
        const jp = document.getElementById('joystick-power');
        const jpVal = document.getElementById('joystick-power-val');
        const jd = document.getElementById('joystick-deadzone');
        const jdVal = document.getElementById('joystick-deadzone-val');

        if (jp && jpVal) {
            jp.value = this.joystickPower.toString();
            jpVal.innerText = `${parseFloat(jp.value).toFixed(2)}x`;
            jp.addEventListener('input', (e) => {
                e.stopPropagation();
                const v = parseFloat(e.target.value);
                this.joystickPower = v;
                jpVal.innerText = `${v.toFixed(2)}x`;
                sessionStorage.setItem('goingBalls_joystickPower', String(v));
            });
        }

        if (jd && jdVal) {
            jd.value = this.joystickDeadzone.toString();
            jdVal.innerText = parseFloat(jd.value).toFixed(2);
            jd.addEventListener('input', (e) => {
                e.stopPropagation();
                const v = parseFloat(e.target.value);
                this.joystickDeadzone = v;
                jdVal.innerText = v.toFixed(2);
                sessionStorage.setItem('goingBalls_joystickDeadzone', String(v));
            });
        }

        // Subscribe to remote leaderboard collection so updates from other players are reflected in real-time.
        try {
            if (window.__goingBallsRoomReady && window.__goingBallsRoomReady()) {
                // subscribe returns an unsubscribe function; keep reference if needed later
                try {
                    this._remoteLeaderboardUnsub = room.collection('leaderboard').subscribe((records) => {
                        // records is the latest list from the remote collection; re-render combined leaderboard
                        try { this.renderLeaderboard(); } catch (e) { console.warn('Error rendering leaderboard after remote update', e); }
                    });
                } catch (e) {
                    console.warn('leaderboard subscription failed', e);
                }

                // Subscribe to ball_stats collection so the Ball Index shows up-to-date aggregated stats
                try {
                    this._remoteBallStatsUnsub = room.collection('ball_stats').subscribe((records) => {
                        try {
                            // store latest remote ball stats for quick lookup and re-render Ball Index if open
                            this._remoteBallStats = (records || []).slice();
                            // update UI if modal visible
                            const ballsModal = document.getElementById('balls-modal');
                            if (ballsModal && ballsModal.style.display === 'flex') this.renderBallIndex();
                        } catch (e) {
                            console.warn('Error updating ball stats UI from remote subscription', e);
                        }
                    });
                } catch (e) {
                    console.warn('ball_stats remote subscription failed', e);
                }

                // Subscribe to a platform-wide clones collection so we can aggregate cloned player stats into leaderboards.
                // Each clone record is expected to include: owner_username, clone_id, stats (level, timeSec, score), and/or replicated_stats.
                try {
                    this._remotePlayerClonesUnsub = room.collection('player_clones').subscribe((cloneRecords) => {
                        try {
                            this._remotePlayerClones = (cloneRecords || []).slice();
                            // Re-render leaderboard and ball index when clone list updates
                            const lbModal = document.getElementById('leaderboard-modal');
                            if (lbModal && lbModal.style.display === 'flex') this.renderLeaderboard();
                            const ballsModal = document.getElementById('balls-modal');
                            if (ballsModal && ballsModal.style.display === 'flex') this.renderBallIndex();
                        } catch (err) {
                            console.warn('Error processing player_clones subscription', err);
                        }
                    });
                } catch (err) {
                    console.warn('player_clones remote subscription failed', err);
                }
            } else {
                // Room not ready - will remain offline; any remote updates will be skipped
                console.info('Remote collections not available; operating in offline mode for persistence features.');
            }
        } catch (e) {
            console.warn('Leaderboard remote subscription failed', e);
        }

        // Mini-gear quick-access wiring: open settings modal when mini gear clicked
        try {
            const miniGear = document.getElementById('mini-gear');
            if (miniGear) {
                miniGear.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const topMenu = document.getElementById('top-menu');
                    if (topMenu) {
                        // position popup near gear (bottom-right)
                        topMenu.style.right = '70px';
                        topMenu.style.top = 'auto';
                        topMenu.style.bottom = '12px';
                        topMenu.classList.toggle('visible');
                        // ensure pointer lock is released when popup opens
                        if (topMenu.classList.contains('visible') && document.pointerLockElement) {
                            try { document.exitPointerLock(); } catch (e) {}
                        }
                    }
                });
                // small hover effect for feedback (pointer-friendly)
                miniGear.addEventListener('pointerenter', () => miniGear.style.background = 'rgba(0,0,0,0.6)');
                miniGear.addEventListener('pointerleave', () => miniGear.style.background = 'rgba(0,0,0,0.45)');
            }
        } catch (e) {
            // non-critical; continue silently
        }
    }

    renderGrids() {
        const skinsGrid = document.getElementById('skins-grid');
        skinsGrid.innerHTML = '';
        // Render skins sorted by descending price so premium skins appear first
        const skinKeys = Object.keys(this.ballConfigs).sort((a, b) => {
            const pa = Number(this.ballConfigs[a] && this.ballConfigs[a].price ? this.ballConfigs[a].price : 0);
            const pb = Number(this.ballConfigs[b] && this.ballConfigs[b].price ? this.ballConfigs[b].price : 0);
            return pb - pa;
        });
        skinKeys.forEach(key => {
            const conf = this.ballConfigs[key];
            const isUnlocked = this.saveData.unlockedBalls.includes(key);
            const isSelected = this.saveData.selectedBall === key;
            const level = this.saveData.skinLevels && this.saveData.skinLevels[key] ? this.saveData.skinLevels[key] : 1;
            const ability = conf.ability ? conf.ability.key : null;
            const abilityLabel = ability ? `${ability.toUpperCase()} L${level}` : '';

            const card = document.createElement('div');
            card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
            // build flip inner structure: front (preview) and back (details)
            let previewStyle = '';
            if (conf.tex) {
                previewStyle = `background-image: url(${conf.tex});`;
            } else {
                const colorHex = `#${(conf.color || 0x666666).toString(16).padStart(6, '0')}`;
                previewStyle = `background-color: ${colorHex};`;
            }
            const levelUpCost = Math.floor((conf.price || 50) * (1 + (level * 0.6)));
            card.innerHTML = `
                <div class="item-card-inner">
                    <div class="item-card-front">
                        <div class="item-preview ball-preview" style="${previewStyle}"></div>
                        <div style="font-size: 14px; margin-top: 6px; font-weight:700;">${conf.name}</div>
                        <div style="font-size:12px; color:#aaf; margin-bottom:6px;">${abilityLabel}</div>
                        <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : (conf.price + ' 🪙')}</div>
                        <div style="margin-top:8px; display:flex; gap:6px; width:100%; justify-content:center;">
                            ${isUnlocked ? `<button class="menu-btn" data-action="equip" data-key="${key}" style="pointer-events:auto;">${isSelected ? 'EQUIPPED' : 'EQUIP'}</button>` : `<button class="menu-btn" data-action="buy" data-key="${key}" style="pointer-events:auto;">BUY ${conf.price} 🪙</button>`}
                            <button class="menu-btn" data-action="level" data-key="${key}" style="pointer-events:auto;">Level ${level}</button>
                        </div>
                    </div>
                    <div class="item-card-back">
                        <div style="font-weight:700; margin-bottom:6px;">${conf.name}</div>
                        <div style="font-size:12px; color:#cfefff; margin-bottom:6px; text-align:center;">${conf.description || ''}</div>
                        <div style="display:flex; gap:8px; width:100%; justify-content:center; align-items:center; margin-bottom:6px;">
                            <div style="font-size:12px;">Level: ${level}</div>
                            <div style="font-size:12px;">Price: ${conf.price} 🪙</div>
                        </div>
                        <div style="font-size:12px; color:#ffd76b; font-weight:700;">Ability: ${conf.ability ? conf.ability.key.toUpperCase() : 'N/A'}</div>
                        <div style="margin-top:8px; font-size:12px; color:#ddd;">Tap to flip or use buttons</div>
                    </div>
                </div>
            `;
            skinsGrid.appendChild(card);

            // wire up buttons
            const buyBtn = card.querySelector('button[data-action="buy"]');
            const equipBtn = card.querySelector('button[data-action="equip"]');
            const lvlBtn = card.querySelector('button[data-action="level"]');
            if (buyBtn) buyBtn.addEventListener('click', (e) => { e.stopPropagation(); this.handlePurchase('ball', key, conf.price); });
            if (equipBtn) equipBtn.addEventListener('click', (e) => { e.stopPropagation(); this.handlePurchase('ball', key, 0); });
            if (lvlBtn) lvlBtn.addEventListener('click', (e) => { e.stopPropagation(); this.levelUpSkin(key, levelUpCost); });
        });

        // Render powerups section inside the Skins modal area (below skins grid)
        try {
            const skinsGridParent = document.getElementById('skins-grid').parentNode;
            const powerupSection = document.createElement('div');
            powerupSection.style.marginTop = '12px';
            powerupSection.innerHTML = `<div style="font-weight:700; color:#ffdd66; margin-bottom:6px;">Powerups</div>`;
            const powerupGrid = document.createElement('div');
            powerupGrid.className = 'grid';
            powerupGrid.style.gridTemplateColumns = '1fr 1fr';
            powerupSection.appendChild(powerupGrid);

            Object.keys(this.powerupConfigs).forEach(key => {
                try {
                    const conf = this.powerupConfigs[key];
                    const userPU = (this.saveData.powerups && this.saveData.powerups[key]) ? this.saveData.powerups[key] : { level: 0, owned: false, equipped: false };
                    const level = userPU.level || 0;
                    const owned = !!userPU.owned;
                    const equipped = !!userPU.equipped;

                    const card = document.createElement('div');
                    card.className = `item-card ${equipped ? 'selected' : ''} ${!owned ? 'locked' : ''}`;
                    const previewStyle = `background-color: ${conf.rarity === 'rare' ? '#a8e6ff' : conf.rarity === 'epic' ? '#ffd6a8' : conf.rarity === 'common' ? '#dfe' : '#eee'};`;

                    card.innerHTML = `
                        <div class="item-card-inner">
                            <div class="item-card-front">
                                <div class="item-preview" style="width:64px;height:64px; ${previewStyle}"></div>
                                <div style="font-size: 14px; margin-top: 6px; font-weight:700;">${conf.name}</div>
                                <div style="font-size:12px; color:#aaf; margin-bottom:6px;">${conf.rarity.toUpperCase()}</div>
                                <div class="price">${owned ? (equipped ? 'EQUIPPED' : 'OWNED') : (conf.price + ' 🪙')}</div>
                                <div style="margin-top:8px; display:flex; gap:6px; width:100%; justify-content:center;">
                                    ${owned ? `<button class="menu-btn" data-action="toggle" data-key="${key}" style="pointer-events:auto;">${equipped ? 'UNEQUIP' : 'EQUIP'}</button>` : `<button class="menu-btn" data-action="buy" data-key="${key}" style="pointer-events:auto;">BUY ${conf.price} 🪙</button>`}
                                    <button class="menu-btn" data-action="upgrade" data-key="${key}" style="pointer-events:auto;">Lv ${level}/${conf.maxLevel}</button>
                                </div>
                            </div>
                            <div class="item-card-back">
                                <div style="font-weight:700; margin-bottom:6px;">${conf.name}</div>
                                <div style="font-size:12px; color:#cfefff; margin-bottom:6px; text-align:center;">${conf.description}</div>
                                <div style="font-size:12px; color:#ddd;">Level: ${level} / ${conf.maxLevel}</div>
                                <div style="font-size:12px; color:#ffd76b; font-weight:700; margin-top:6px;">Rarity: ${conf.rarity.toUpperCase()}</div>
                            </div>
                        </div>
                    `;
                    powerupGrid.appendChild(card);

                    // wiring actions (best-effort inline handlers)
                    const buyBtn = card.querySelector('button[data-action="buy"]');
                    const toggleBtn = card.querySelector('button[data-action="toggle"]');
                    const upBtn = card.querySelector('button[data-action="upgrade"]');

                    if (buyBtn) buyBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (this.saveData.totalCoins >= conf.price) {
                            this.saveData.totalCoins -= conf.price;
                            this.saveData.powerups = this.saveData.powerups || {};
                            this.saveData.powerups[key] = { level: 1, owned: true, equipped: true };
                            this.save();
                            this.updateWalletUI();
                            this.renderGrids();
                        } else {
                            notifier.notify('Not enough coins', { timeout: 1200, type: 'warn' });
                        }
                    });

                    if (toggleBtn) toggleBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.saveData.powerups = this.saveData.powerups || {};
                        const pu = this.saveData.powerups[key] = this.saveData.powerups[key] || { level: 1, owned: true, equipped: false };
                        pu.equipped = !pu.equipped;
                        // enforce single equip for single-use powerups: unequip others
                        if (pu.equipped) {
                            Object.keys(this.saveData.powerups).forEach(k => { if (k !== key) { this.saveData.powerups[k].equipped = false; } });
                        }
                        this.save();
                        this.renderGrids();
                    });

                    if (upBtn) upBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.saveData.powerups = this.saveData.powerups || {};
                        const pu = this.saveData.powerups[key] || { level: 0, owned: false, equipped: false };
                        const next = Math.min(conf.maxLevel, (pu.level || 0) + 1);
                        const cost = Math.floor(conf.price * (1 + next * 0.6));
                        if (!pu.owned) {
                            notifier.notify('You must buy the powerup first', { timeout: 1200, type: 'warn' });
                            return;
                        }
                        if (pu.level >= conf.maxLevel) {
                            notifier.notify('Max level', { timeout: 900 });
                            return;
                        }
                        if (this.saveData.totalCoins < cost) {
                            notifier.notify('Not enough coins', { timeout: 1200, type: 'warn' });
                            return;
                        }
                        this.saveData.totalCoins -= cost;
                        pu.level = next;
                        this.saveData.powerups[key] = pu;
                        this.save();
                        this.updateWalletUI();
                        this.renderGrids();
                    });

                } catch (err) {
                    console.warn('powerup card failed', key, err);
                }
            });

            skinsGridParent.appendChild(powerupSection);
        } catch (e) {
            console.warn('Rendering powerups failed', e);
        }

        const skiesGrid = document.getElementById('skies-grid');
        skiesGrid.innerHTML = '';
        Object.keys(this.skyConfigs).forEach(key => {
            const conf = this.skyConfigs[key];
            const isUnlocked = this.saveData.unlockedSkies.includes(key);
            const isSelected = this.saveData.selectedSky === key;

            const card = document.createElement('div');
            card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
            
            let previewStyle = '';
            if (conf.tex) {
                previewStyle = `background-image: url(${conf.tex});`;
            } else {
                const colorHex = `#${conf.color.toString(16).padStart(6, '0')}`;
                previewStyle = `background-color: ${colorHex};`;
            }

            const skyCard = document.createElement('div');
            skyCard.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
            const skyPreview = `background-image: url(${conf.tex});`;
            skyCard.innerHTML = `
                <div class="item-card-inner">
                    <div class="item-card-front">
                        <div class="item-preview sky-preview" style="${skyPreview}"></div>
                        <div style="font-size: 14px; margin-top: 6px; font-weight:700;">${conf.name}</div>
                        <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : conf.price + ' 🪙'}</div>
                    </div>
                    <div class="item-card-back">
                        <div style="font-weight:700; margin-bottom:6px;">${conf.name}</div>
                        <div style="font-size:12px; color:#cfefff; margin-bottom:8px; text-align:center;">Sky: ${conf.name}</div>
                        <div style="font-size:12px; color:#ddd;">Price: ${conf.price} 🪙</div>
                    </div>
                </div>
            `;
            skyCard.onclick = () => this.handlePurchase('sky', key, conf.price);
            skiesGrid.appendChild(skyCard);
        });
    }

    // Ball Index: delegate to wired module for full index rendering
    renderBallIndex() {
        try {
            // Pass the room instance explicitly to avoid implicit globals in the UI module
            renderBallIndexUI('balls-list', this, room);
        } catch (e) {
            console.warn('renderBallIndex delegating to UI module failed', e);
        }
    }

    // Leaderboard helpers: stored locally and mirrored to a persistent room collection
    getLeaderboard() {
        try {
            // Try to read local cache first
            const raw = localStorage.getItem('goingBallsLeaderboard_v1');
            let local = [];
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) local = arr;
            }

            // Try to fetch remote records (room.collection.getList() returns current list)
            try {
                if (window.__goingBallsRoomReady && window.__goingBallsRoomReady()) {
                    try {
                        const remote = room.collection('leaderboard').getList() || [];
                        // remote records are newest-to-oldest; map to same shape if necessary
                        const mapped = remote.map(r => ({
                            name: r.username || (r.name || 'Player'),
                            level: r.level,
                            timeSec: r.timeSec,
                            score: r.score,
                            timestamp: r.created_at ? Date.parse(r.created_at) : (r.timestamp || Date.now())
                        }));
                        // merge remote + local, prefer remote entries when timestamps collide
                        const merged = [...mapped, ...local];
                        // de-duplicate by timestamp+name
                        const seen = new Set();
                        const dedup = [];
                        for (const e of merged) {
                            const k = `${e.name}:${e.timestamp}:${e.level}:${(e.timeSec||0).toFixed(2)}`;
                            if (!seen.has(k)) { seen.add(k); dedup.push(e); }
                        }
                        // sort by level desc, time asc, score desc
                        dedup.sort((a, b) => {
                            if ((b.level||0) !== (a.level||0)) return (b.level||0) - (a.level||0);
                            if ((a.timeSec||0) !== (b.timeSec||0)) return (a.timeSec||0) - (b.timeSec||0);
                            return (b.score||0) - (a.score||0);
                        });
                        return dedup.slice(0, 50);
                    } catch (e) {
                        console.warn('Failed to read remote leaderboard, falling back to local', e);
                    }
                }
            } catch (e) {
                console.warn('Failed to read remote leaderboard, falling back to local', e);
            }

            return local;
        } catch (e) {
            console.warn('Failed to parse leaderboard', e);
            return [];
        }
    }

    saveLeaderboard(entries) {
        try {
            const trimmed = entries.slice(0, 50);
            localStorage.setItem('goingBallsLeaderboard_v1', JSON.stringify(trimmed));
            // Mirror top entries to the remote collection asynchronously (best-effort)
            try {
                if (window.__goingBallsRoomReady && window.__goingBallsRoomReady()) {
                    try {
                        const coll = room.collection('leaderboard');
                        // create records for entries that don't exist locally in remote list
                        const remote = coll.getList() || [];
                        const remoteKeys = new Set(remote.map(r => `${r.name || r.username}:${r.timestamp}:${r.level}:${(r.timeSec||0).toFixed(2)}`));
                        trimmed.forEach(e => {
                            const key = `${e.name}:${e.timestamp}:${e.level}:${(e.timeSec||0).toFixed(2)}`;
                            if (!remoteKeys.has(key)) {
                                // create record (do not await; best-effort)
                                try { coll.create({ name: e.name, level: e.level, timeSec: e.timeSec, score: e.score, timestamp: e.timestamp }); } catch(err){}
                            }
                        });
                    } catch (e) {
                        console.warn('Failed to mirror leaderboard to remote:', e);
                    }
                }
            } catch (e) {
                console.warn('Failed to mirror leaderboard to remote:', e);
            }
        } catch (e) {
            console.warn('Failed to save leaderboard', e);
        }
    }

    addLeaderboardEntry(entry) {
        // normalize entry
        const normalized = {
            name: entry.name || 'Player',
            level: entry.level || 0,
            timeSec: entry.timeSec || 0,
            score: entry.score || 0,
            timestamp: entry.timestamp || Date.now()
        };

        // update local list
        const list = this.getLeaderboard();
        list.push(normalized);
        // sort by level desc then time ascending then score desc
        list.sort((a, b) => {
            if ((b.level||0) !== (a.level||0)) return (b.level||0) - (a.level||0);
            if ((a.timeSec||0) !== (b.timeSec||0)) return (a.timeSec||0) - (b.timeSec||0);
            return (b.score||0) - (a.score||0);
        });

        this.saveLeaderboard(list);
        this.renderLeaderboard();

        // Best-effort: push to remote collection for persistence
        try {
            if (window.__goingBallsRoomReady && window.__goingBallsRoomReady()) {
                try {
                    room.collection('leaderboard').create({
                        name: normalized.name,
                        level: normalized.level,
                        timeSec: normalized.timeSec,
                        score: normalized.score,
                        // Include a timestamp to aid deduplication and ordering
                        timestamp: normalized.timestamp
                    }).catch(e => {
                        // ignore failures (network or permission)
                        console.warn('Failed to create remote leaderboard record', e);
                    });
                } catch (e) {
                    console.warn('Remote leaderboard create failed', e);
                }
            }
        } catch (e) {
            console.warn('Remote leaderboard create failed', e);
        }
    }

    renderLeaderboard() {
        const container = document.getElementById('leaderboard-list');
        if (!container) return;

        // start from local + remote merged list
        let list = this.getLeaderboard() || [];

        // Merge in platform-wide clone records as synthetic leaderboard entries (SANITIZE remote data)
        // Clone record format (best-effort): { owner_username, clone_id, stats: { level, timeSec, score }, replicated_stats: { played, wins, avg_time, best_time, coins }, skin }
        try {
            const rawClones = this._remotePlayerClones || (window.__goingBallsRoomReady && window.__goingBallsRoomReady() ? (room.collection('player_clones').getList() || []) : []);
            if (Array.isArray(rawClones) && rawClones.length > 0) {
                // cap processing to avoid huge inputs
                const clones = rawClones.slice(0, 500);
                clones.forEach((c) => {
                    try {
                        // sanitize helper
                        const sanitizeString = (v, maxLen = 64) => {
                            if (v === undefined || v === null) return '';
                            try {
                                const s = String(v);
                                // Remove non-printable control characters
                                return s.replace(/[\x00-\x1F\x7F]/g, '').slice(0, maxLen);
                            } catch (e) { return ''; }
                        };
                        const sanitizeNumber = (v, min = 0, max = 1e9) => {
                            const n = Number(v);
                            if (!Number.isFinite(n)) return 0;
                            if (n < min) return min;
                            if (n > max) return max;
                            return n;
                        };

                        const owner = sanitizeString(c.owner_username || c.username || c.owner || 'Player', 32);
                        const cloneId = sanitizeString(c.clone_id || c.id || '', 12) || '----';
                        const displayName = `${owner} (clone:${cloneId})`.slice(0, 64);

                        const s = (c && (c.stats || c.replicated_stats)) ? (c.stats || c.replicated_stats) : {};
                        const level = sanitizeNumber(s.level || s.best_level || s.avg_level || 0, 0, 200);
                        const timeSec = sanitizeNumber((s.timeSec !== undefined) ? s.timeSec : (s.avg_time || 0), 0, 360000);
                        const score = sanitizeNumber(s.score || s.best_score || 0, 0, 1e9);

                        // Additional optional aggregated stats (best-effort)
                        const played = sanitizeNumber(s.played || s.timesPlayed || c.played || 0, 0, 1e9);
                        const wins = sanitizeNumber(s.wins || s.victories || c.wins || 0, 0, 1e9);
                        const avg_time = sanitizeNumber(s.avg_time || s.average_time || 0, 0, 1e7);
                        const best_time = sanitizeNumber(s.best_time || s.best || 0, 0, 1e7);
                        const coins = sanitizeNumber(s.coins || s.totalCoins || 0, 0, 1e9);
                        const skin = sanitizeString(s.skin || c.skin || '', 32);

                        const timestamp = (() => {
                            const t = c.created_at ? Date.parse(c.created_at) : (c.timestamp || Date.now());
                            const parsed = Number.isFinite(Number(t)) ? Number(t) : Date.now();
                            // clamp to reasonable historic range (not earlier than 2000)
                            return Math.max(parsed, 946684800000);
                        })();

                        const entry = {
                            name: displayName,
                            level: Math.floor(level),
                            timeSec: timeSec,
                            score: Math.floor(score),
                            timestamp: timestamp,
                            // extra fields
                            played: played,
                            wins: wins,
                            avg_time: avg_time,
                            best_time: best_time,
                            coins: coins,
                            skin: skin
                        };
                        list.push(entry);
                    } catch (e) {
                        // skip problematic clone record
                    }
                });
            }
        } catch (e) {
            console.warn('Failed to merge player clones into leaderboard', e);
        }

        container.innerHTML = '';
        if (list.length === 0) {
            const empty = document.createElement('div');
            empty.style.color = '#ddd';
            empty.style.textAlign = 'center';
            empty.innerText = 'No entries yet — finish a level to record a time!';
            container.appendChild(empty);
            return;
        }

        // Normalize and sort: level desc, time asc, score desc
        try {
            list = list.map(it => ({
                name: it.name || 'Player',
                level: it.level || 0,
                timeSec: (typeof it.timeSec === 'number') ? it.timeSec : parseFloat(it.timeSec) || 0,
                score: it.score || 0,
                timestamp: it.timestamp || Date.now(),
                // extra normalized fields with safe defaults
                played: Number.isFinite(Number(it.played)) ? Number(it.played) : 0,
                wins: Number.isFinite(Number(it.wins)) ? Number(it.wins) : 0,
                avg_time: Number.isFinite(Number(it.avg_time)) ? Number(it.avg_time) : 0,
                best_time: Number.isFinite(Number(it.best_time)) ? Number(it.best_time) : 0,
                coins: Number.isFinite(Number(it.coins)) ? Number(it.coins) : 0,
                skin: it.skin || ''
            }));
            list.sort((a, b) => {
                if (b.level !== a.level) return b.level - a.level;
                if (a.timeSec !== b.timeSec) return a.timeSec - b.timeSec;
                return b.score - a.score;
            });
        } catch (e) {
            console.warn('Leaderboard normalization failed', e);
        }

        // show top 10 after merging clones
        list.slice(0, 10).forEach((e, idx) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '8px';
            row.style.background = 'rgba(255,255,255,0.04)';
            row.style.border = '1px solid rgba(255,255,255,0.06)';
            row.style.borderRadius = '8px';

            // Left column: rank / level / name / skin
            const left = document.createElement('div');
            left.style.display = 'flex';
            left.style.flexDirection = 'column';
            left.style.gap = '4px';
            left.style.minWidth = '240px';
            left.innerHTML = `
                <div style="display:flex; gap:8px; align-items:center;">
                    <div style="width:30px; text-align:center; font-weight:bold; color:#ffcc00;">${idx+1}</div>
                    <div style="min-width:90px;">Lvl ${e.level}</div>
                    <div style="min-width:140px; color:#fff; font-weight:700;">${e.name || 'You'}</div>
                </div>
            `;
            if (e.skin) {
                const sk = document.createElement('div');
                sk.style.fontSize = '11px';
                sk.style.color = '#cfefff';
                sk.innerText = `Skin: ${e.skin}`;
                left.appendChild(sk);
            }

            // Middle column: performance metrics (time / score)
            const middle = document.createElement('div');
            middle.style.display = 'flex';
            middle.style.flexDirection = 'column';
            middle.style.alignItems = 'flex-end';
            middle.style.gap = '4px';
            middle.innerHTML = `
                <div style="color:#9df7ff; font-weight:700;">${(e.timeSec||0).toFixed(1)}s</div>
                <div style="color:#ffd76b; font-weight:700;">${e.score || 0} pts</div>
            `;

            // Right column: additional aggregated stats (played/wins/avg/best/coins)
            const right = document.createElement('div');
            right.style.display = 'flex';
            right.style.flexDirection = 'column';
            right.style.alignItems = 'flex-end';
            right.style.gap = '4px';
            right.style.minWidth = '180px';
            right.innerHTML = `
                <div style="font-size:12px; color:#ddd;">Played: ${e.played} • Wins: ${e.wins}</div>
                <div style="font-size:12px; color:#ddd;">Avg: ${e.avg_time ? e.avg_time.toFixed(1) + 's' : '—'} • Best: ${e.best_time ? e.best_time.toFixed(1) + 's' : '—'}</div>
                <div style="font-size:12px; color:#ffd76b;">Coins: ${e.coins}</div>
            `;

            row.appendChild(left);
            row.appendChild(middle);
            row.appendChild(right);

            container.appendChild(row);
        });
    }

    handlePurchase(type, key, price) {
        if (type === 'ball') {
            // If already unlocked and price is 0 -> equip
            if (this.saveData.unlockedBalls.includes(key) && price === 0) {
                this.saveData.selectedBall = key;
                this.ballMesh.material = this.getBallMaterial();
                // apply skin ability on equip
                this.applySkinAbilities(key);
            } else if (this.saveData.unlockedBalls.includes(key)) {
                // already owned and non-zero price means ignore
                this.saveData.selectedBall = key;
                this.ballMesh.material = this.getBallMaterial();
                this.applySkinAbilities(key);
            } else if (this.saveData.totalCoins >= price) {
                // buy + equip
                this.saveData.totalCoins -= price;
                this.saveData.unlockedBalls.push(key);
                this.saveData.selectedBall = key;
                // ensure skinLevels entry exists
                this.saveData.skinLevels = this.saveData.skinLevels || {};
                if (!this.saveData.skinLevels[key]) this.saveData.skinLevels[key] = 1;
                this.ballMesh.material = this.getBallMaterial();
                this.applySkinAbilities(key);
            } else {
                // insufficient funds - simple visual feedback (toast)
                try {
                    const t = document.createElement('div');
                    t.innerText = 'Not enough coins';
                    t.style.position = 'fixed';
                    t.style.left = '50%';
                    t.style.top = '12%';
                    t.style.transform = 'translateX(-50%)';
                    t.style.background = 'rgba(0,0,0,0.6)';
                    t.style.color = '#fff';
                    t.style.padding = '8px 12px';
                    t.style.borderRadius = '8px';
                    t.style.zIndex = 9999;
                    document.body.appendChild(t);
                    setTimeout(()=>t.remove(), 1400);
                } catch (e) {}
            }
        } else {
            const updateSky = (skyKey) => {
                this.saveData.selectedSky = skyKey;
                this.applySkyConfig(this.skyConfigs[skyKey]);
            };

            if (this.saveData.unlockedSkies.includes(key)) {
                updateSky(key);
            } else if (this.saveData.totalCoins >= price) {
                this.saveData.totalCoins -= price;
                this.saveData.unlockedSkies.push(key);
                updateSky(key);
            }
        }
        this.save();
        this.updateWalletUI();
        this.renderGrids();
    }

    // Level up a skin ability using coins; cost scales with current level and base price
    levelUpSkin(key, cost) {
        try {
            this.saveData.skinLevels = this.saveData.skinLevels || {};
            const current = this.saveData.skinLevels[key] || 1;
            if (current >= 5) {
                // already max
                try { notifier.notify('Max level', { timeout: 1000, type: 'info' }); } catch (e) {}
                return;
            }
            if (this.saveData.totalCoins < cost) {
                try { notifier.notify('Not enough coins', { timeout: 1400, type: 'warn' }); } catch (e) {}
                return;
            }
            // deduct and increase level
            this.saveData.totalCoins -= cost;
            this.saveData.skinLevels[key] = current + 1;
            this.save();
            this.updateWalletUI();
            this.renderGrids();

            // If equipped, immediately apply new ability effect
            if (this.saveData.selectedBall === key) this.applySkinAbilities(key);

            // feedback
            try { this.playSound('coin_collect'); } catch (e) {}
        } catch (e) {
            console.warn('levelUpSkin failed', e);
        }
    }

    // Apply skin ability effects to the game (affects BALL_SPEED, JUMP_FORCE multipliers and coin gain)
    // Now also biases speed by skin price: lower-cost skins roll slower, higher-cost skins roll faster.
    applySkinAbilities(key) {
        try {
            const conf = this.ballConfigs[key];
            if (!conf || !conf.ability) {
                // reset to defaults
                this._skinAbility = { speed: 1.0, jump: 1.0, coins: 1.0 };
                this.effectiveBallSpeed = BALL_SPEED;
                this.effectiveJumpForce = JUMP_FORCE;
                return;
            }

            // Level-based ability multiplier
            const level = (this.saveData.skinLevels && this.saveData.skinLevels[key]) ? this.saveData.skinLevels[key] : 1;
            const abil = conf.ability;
            const mult = (abil.base || 1.0) + (abil.perLevel || 0) * (level - 1);

            // Price-based speed bias:
            // Compute normalized price in [0,1] relative to configured skins' price range,
            // then map to a speed bias so cheap skins are slower (minBias) and expensive skins are faster (maxBias).
            // This keeps ability scaling intact while adding a clear cost -> performance relationship.
            let minPrice = Infinity, maxPrice = 0;
            try {
                Object.values(this.ballConfigs).forEach(c => {
                    const p = typeof c.price === 'number' ? c.price : 0;
                    if (p < minPrice) minPrice = p;
                    if (p > maxPrice) maxPrice = p;
                });
                if (!isFinite(minPrice)) minPrice = 0;
            } catch (e) {
                minPrice = 0;
                maxPrice = 1000;
            }

            const price = (typeof conf.price === 'number') ? conf.price : 0;
            const range = Math.max(1, maxPrice - minPrice);
            const normalized = (price - minPrice) / range; // 0..1

            // Bias mapping: choose gentle bias so gameplay stays balanced.
            const minBias = 0.82; // slowest relative multiplier for the cheapest skin
            const maxBias = 1.18; // fastest relative multiplier for the priciest skin
            const priceBias = minBias + (maxBias - minBias) * normalized;

            // store runtime ability object and merge multipliers sensibly
            this._skinAbility = this._skinAbility || { speed: 1.0, jump: 1.0, coins: 1.0 };

            if (abil.key === 'speed') {
                // Apply level-based mult and price bias multiplicatively for speed
                this._skinAbility.speed = mult * priceBias;
                this._skinAbility.jump = 1.0;
                this._skinAbility.coins = 1.0;
            } else if (abil.key === 'jump') {
                // Jump-focused skins get jump mult; speed still affected by priceBias (but not as strongly)
                this._skinAbility.jump = mult;
                this._skinAbility.speed = 1.0 * (0.92 + (priceBias - 1) * 0.5); // subtle influence
                this._skinAbility.coins = 1.0;
            } else if (abil.key === 'coins') {
                // Coins-focused skins get coin mult; speed influenced by priceBias slightly
                this._skinAbility.coins = mult;
                this._skinAbility.speed = 1.0 * (0.94 + (priceBias - 1) * 0.6); // moderate influence
                this._skinAbility.jump = 1.0;
            } else {
                // fallback: apply price bias to speed
                this._skinAbility.speed = 1.0 * priceBias;
                this._skinAbility.jump = 1.0;
                this._skinAbility.coins = 1.0;
            }

            // reflect changes in runtime constants where safe
            try {
                this.effectiveBallSpeed = BALL_SPEED * (this._skinAbility.speed || 1.0);
                this.effectiveJumpForce = JUMP_FORCE * (this._skinAbility.jump || 1.0);
            } catch (e) {}
        } catch (e) {
            console.warn('applySkinAbilities error', e);
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // delta time
        const now = Date.now();
        const dt = ((now - (this._lastFrameTime || now)) / 1000);
        this._lastFrameTime = now;

        // lazy init small THREE temps used per-frame for camera math
        if (!this._camTmpA) {
            this._camTmpA = new THREE.Vector3();
            this._camTmpB = new THREE.Vector3();
        }

        // Rotate sky mesh
        if (this.skyMesh) {
            try { this.skyMesh.rotation.y += (this.skyRotationSpeed || 0.03) * dt; } catch (e) {}
        }

        // Groovy canvas update
        try { if (this.groovyCanvasTex) this.updateGroovyCanvas(dt); } catch (e) {}

        if (!this.isGameOver) {
            this.updatePhysics();
            this.checkGameState();
        }

        // Update rain particles with minimal allocations (reuse local numeric loop)
        if (this.raining && this.rainPoints && this.rainPoints.geometry) {
            const pos = this.rainPoints.geometry.attributes.position.array;
            for (let i = 0; i < pos.length; i += 3) {
                pos[i + 1] -= 0.8 + Math.random() * 0.6;
                if (pos[i + 1] < -5) {
                    pos[i] = (Math.random() - 0.5) * 60 + (this.ballMesh.position.x || 0);
                    pos[i + 1] = Math.random() * 40 + 25;
                    pos[i + 2] = (Math.random() - 0.5) * 60 + (this.ballMesh.position.z || 0);
                }
            }
            this.rainPoints.geometry.attributes.position.needsUpdate = true;
            if (this.scene.fog) {
                const t = ((Date.now() - (this.rainStartTime || Date.now())) / 1000);
                this.scene.fog.density = 0.0005 * (1 + (this.currentLevel * 0.01));
            }
        }

        // orbiting camera: reuse cam tmp vectors to avoid per-frame Vector3 allocs
        const offsetX = Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch) * this.cameraDistance;
        const offsetY = Math.sin(this.cameraPitch) * this.cameraDistance;
        const offsetZ = Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch) * this.cameraDistance;

        const targetCamPos = this._camTmpA.set(
            this.ballMesh.position.x + offsetX,
            this.ballMesh.position.y + offsetY,
            this.ballMesh.position.z + offsetZ
        );

        this.camera.position.lerp(targetCamPos, 0.2);
        this.camera.lookAt(this.ballMesh.position.x, this.ballMesh.position.y, this.ballMesh.position.z);

        // Auto-align camera yaw
        if (Math.abs(this.inputZ || 0) > 0.5 && Math.abs(this.inputX || 0) < 0.1 && !this.keys['KeyA'] && !this.keys['KeyD']) {
            const shortestAngle = ((this.cameraYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
            this.cameraYaw -= shortestAngle * 0.02;
        }

        this.renderer.render(this.scene, this.camera);
    }
}

new Game();