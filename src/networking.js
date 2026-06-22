/*
 Networking module.
 Exports: initNetworking(notifier) -> { room }
 Handles: WebsimSocket initialization, ball_stats seeding,
 global error handlers, loading manager setup.
 Note: top-level await requires the caller to handle async init.
*/
import * as THREE from 'three';

// Module-scoped state (was window.__goingBalls* globals)
let __shownFallbackToast = false;
let __assetFallback = false;
let __networkErrorCount = 0;
let __networkErrorLogged = false;
let __roomReadyFn = () => false;

// Retry constants for room initialization
const ROOM_INIT_MAX_RETRIES = 3;
const ROOM_INIT_BASE_DELAY = 1000; // ms

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const loadingManager = {
    active: false
};

export function setupLoadingManager() {
    if (loadingManager.active) return;
    loadingManager.active = true;

    const loadingBar = () => document.getElementById('loading-bar');
    const loadingText = () => document.getElementById('loading-text');

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
            setTimeout(() => {
                const overlay = document.getElementById('loading-overlay');
                if (overlay) overlay.style.transition = 'opacity 400ms ease', overlay.style.opacity = '0';
                setTimeout(() => { try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {} }, 450);
            }, 350);
        } catch (e) {}
    };
    manager.onError = function (url) {
        try {
            const name = (url && url.split) ? url.split('/').pop() : String(url);
            if (loadingText()) loadingText().innerText = `Failed to load: ${name} — using fallback assets`;

            if (!__shownFallbackToast) {
                __shownFallbackToast = true;
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
                        dismiss.setAttribute('aria-label', 'Dismiss fallback notice');
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
            __assetFallback = true;
        } catch (e) { /* silent */ }
    };
}

export function setupGlobalErrorHandlers(notifier) {
    window.addEventListener('unhandledrejection', (event) => {
        try {
            const reason = event && event.reason;
            let msg = '';
            try {
                if (reason && typeof reason === 'string') msg = reason;
                else if (reason && typeof reason.message === 'string') msg = reason.message;
                else if (reason && typeof reason.toString === 'function') msg = String(reason.toString());
            } catch (e) { msg = ''; }
            const lower = (msg || '').toLowerCase();

            const isNetworkError = (
                lower.includes('network') ||
                lower.includes('failed to fetch') ||
                lower.includes('networkerror') ||
                lower.includes('typeerror: networkerror') ||
                lower.includes('typeerror: failed to fetch') ||
                lower.includes('network error') ||
                lower.includes('loading')
            );

            const offline = (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine);

            if (isNetworkError || offline) {
                __networkErrorCount++;

                if (!__networkErrorLogged) {
                    __networkErrorLogged = true;
                    try { __assetFallback = true; } catch (e) {}

                    try {
                        if (typeof notifier !== 'undefined' && notifier && typeof notifier.notify === 'function') {
                            notifier.notify(offline ? 'You appear offline — using cached/fallback assets.' : 'Network assets failed — using fallbacks.', { persistent: true, type: 'warn' });
                        }
                    } catch (e) { /* swallow */ }
                }

                try {
                    const c = __networkErrorCount;
                    if (c <= 4) console.info('Network/resource unhandled rejection detected:', msg || reason);
                    else if (c <= 12) console.debug('Additional network unhandled rejection (suppressed):', msg || reason);
                } catch (e) {}
            } else {
                try { console.warn('Unhandled rejection:', msg || reason); } catch (e) {}
            }
        } catch (err) {
            try { console.warn('Unhandled rejection (inspect failed).'); } catch (e) {}
        }
        try { event.preventDefault && event.preventDefault(); } catch (e) {}
    });

    window.addEventListener('error', (evt) => {
        try {
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
}

export async function initNetworking() {
    const room = new WebsimSocket();

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt <= ROOM_INIT_MAX_RETRIES; attempt++) {
        try {
            await room.initialize();
            room.isReady = true;

            __roomReadyFn = () => (room && room.isReady && typeof room.collection === 'function');

            if (attempt > 0) {
                console.info(`WebsimSocket.initialize() succeeded on retry attempt ${attempt}.`);
            }

            // Seed ball_stats collection
            (async () => {
                try {
                    if (!__roomReadyFn()) return;
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

            return room;
        } catch (e) {
            if (attempt < ROOM_INIT_MAX_RETRIES) {
                const delay = ROOM_INIT_BASE_DELAY * (2 ** attempt);
                console.info(`WebsimSocket.initialize() attempt ${attempt + 1}/${ROOM_INIT_MAX_RETRIES + 1} failed, retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    // All retries exhausted — fall back to offline mode
    console.warn(`WebsimSocket.initialize() failed after ${ROOM_INIT_MAX_RETRIES + 1} attempts — continuing in offline/fallback mode.`);
    __roomReadyFn = () => false;
    return room;
}
}
