/**
 * =====================================================================
 * @domain:    core
 * @concern:   Quad-Core Bootstrap & DI Wiring
 * @created:   2026-06-24T14:50:00Z
 * @track:     4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a
 * @version:   2.0.0
 * @security:  Client-Side (Thin Client / Zero Trust)
 * =====================================================================
 *
 * Going Balls — Quad-Core Edition
 *
 * Bootstrap file that wires together all four language runtimes:
 *
 *   JavaScript (this file):  Orchestration, rendering, UI, recycled modules
 *   Rust (WASM):             Obfuscated physics solver in rust_core/
 *   Python (Backend):        Secure level generation at python_server/
 *   Lua (wasmoon):           Game economy & shop logic in src/scripts/
 *
 * Recycling strategy:
 *   Engine modules from v1.x are imported directly:
 *     - engine/scene.js          Three.js scene management
 *     - src/physics.js           cannon-es wrapper physics (fallback)
 *     - src/rendering.js         rAF loop, camera, VFX
 *     - src/audio.js             Sound system
 *     - src/persistence.js       localStorage save/load
 *     - src/ball_db.js           Skin definitions
 *     - src/ui.js                DOM UI system
 *     - src/levelgen.js          Procedural level generation
 *     - src/notification_manager.js  Toast system
 *
 *   New modules for the multi-language architecture:
 *     - src/core/ipc_bridge.js   Quad-Core IPC bridge
 *     - src/scripts/shop_logic.lua  Lua economy engine
 *
 *   New external services:
 *     - python_server/           Python FastAPI backend
 *     - rust_core/               Rust WASM physics solver
 */

import * as THREE from 'three';
import nipplejs from 'nipplejs';

// ============================================================================
// Recycled JS Modules from v1.x
// ============================================================================

import { NotificationManager } from './src/notification_manager.js';
import { initPersistence, saveGame } from './src/persistence.js';
import { initAudio, registerSfx, playSound } from './src/audio.js';
import { initScene, getBallMaterial, applyBallSkin } from './engine/scene.js';
import { initPhysics, updatePhysics, jump,
         updateFireSparks, updateHeatShimmer,
         updateMeteors, checkMeteorCollisions } from './src/physics.js';
import { onWindowResize, animate } from './src/rendering.js';
import { initSpeedLines } from './src/speed_lines.js';
import { initMotionBlur } from './src/motion_blur.js';
import { initBloom } from './src/bloom.js';
import { createLevel, createInfiniteLevel, clearLevel,
         addPlatform, addRamp, addCoins,
         addPendulum, addSpinner, addHammer, addMover, addWall,
         addTunnelWalls, addGlassPlatform, addCheckpoint, addBlade,
         placeFinishModel, spawnDroppedCoins, createShockwave,
         addLoopDeLoop, addSpiralTube, addSpringPad, addCurve,
         addStairs, addPortalRing, addHalfPipe, addCheckerboard,
         addGlassLoopDeLoop, addGlassStairs, addGlassCurve,
         triggerDropFromObstacle } from './src/levelgen.js';
import { BALL_DB } from './src/ball_db.js';

// ============================================================================
// New Multi-Language Modules
// ============================================================================

import quadCore from './src/core/ipc_bridge.js';
const { initialize: initializeQuadCore, resolvePhysicsFrame, requestSecureLevelSeed,
         calculateShopPurchase, resetPhysicsState } = quadCore;

// ============================================================================
// Notification Manager
// ============================================================================

const notifier = new NotificationManager({
    maxConcurrent: 3,
    minIntervalMs: 300,
    containerId: 'goingballs-notification-container'
});

// ============================================================================
// Loading Manager Setup
// ============================================================================

function updateLoadingBar(pct, text) {
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');
    if (bar) bar.style.width = Math.min(100, pct) + '%';
    if (txt) txt.innerText = text || '';
}

function markCoreReady(core, chipId, dotId) {
    const chip = document.getElementById(chipId);
    if (chip) {
        chip.classList.add('active');
        chip.classList.remove('warn');
    }
    const dot = document.getElementById(dotId);
    if (dot) dot.classList.add('active');
}

function markCoreWarn(core, chipId) {
    const chip = document.getElementById(chipId);
    if (chip) chip.classList.add('warn');
}

function dismissLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    overlay.style.transition = 'opacity 600ms ease';
    overlay.style.opacity = '0';
    setTimeout(() => {
        try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {}
    }, 650);
}

// ============================================================================
// Game Class — Quad-Core Edition
// ============================================================================

class Game {
    constructor() {
        this._bootstrapStart = performance.now();

        // --- Phase 1: Initialize Persistence & Data ---
        updateLoadingBar(5, 'Loading persistence...');
        initPersistence(this);
        markCoreReady('js', 'chip-js', 'dot-js');

        // --- Phase 2: Initialize Audio ---
        updateLoadingBar(15, 'Initializing audio...');
        initAudio(this);
        registerSfx('coin', 'assets/sfx/coin_collect.mp3');
        registerSfx('jump', 'assets/sfx/jump.mp3');
        registerSfx('finish', 'assets/sfx/finish_line.mp3');
        registerSfx('fall', 'assets/sfx/fall_off.mp3');

        // --- Phase 3: Initialize Scene (Three.js) ---
        updateLoadingBar(25, 'Building scene...');
        initScene(this);

    // --- Phase 4: Initialize Physics (JS cannon-es fallback + WASM bridge) ---
    updateLoadingBar(35, 'Initializing physics...');
    initPhysics(this);

    // --- Physics mode: 'cannon-es' (legacy) or 'wasm' (Quad-Core) ---
    this._physicsMode = 'cannon-es'; // Switched to 'wasm' after Quad-Core init

        // --- Phase 5: Initialize Cosmetic VFX ---
        updateLoadingBar(45, 'Loading visual effects...');
        initSpeedLines(this);
        initMotionBlur(this);
        initBloom(this);

        // --- Phase 6: Initialize Multi-Language Cores (async) ---
        updateLoadingBar(55, 'Booting Quad-Core IPC...');
        this._initMultiLanguageCores();

        // --- Phase 7: Initialize Controls ---
        updateLoadingBar(70, 'Initializing controls...');
        this.initControls();

        // --- Phase 8: Create First Level ---
        updateLoadingBar(80, 'Generating level...');
        createLevel(this);

        // --- Phase 9: Initialize UI ---
        updateLoadingBar(90, 'Building UI...');
        this._initUI();

        // --- Phase 10: Start Render Loop ---
        updateLoadingBar(95, 'Starting render loop...');
        animate(this);

        // Done
        updateLoadingBar(100, 'Ready!');
        this._coreReadyTimeout = setTimeout(() => dismissLoadingOverlay(), 800);
    }

    // ---- Phase 6: Multi-Language Core Initialization ----

    async _initMultiLanguageCores() {
        try {
            updateLoadingBar(60, 'Connecting to Rust WASM & Python backend...');
            await initializeQuadCore();

            updateLoadingBar(65, 'Starting Lua economy engine...');

            // Mark cores as ready
            markCoreReady('wasm', 'chip-wasm', 'dot-wasm');
            markCoreReady('py', 'chip-py', 'dot-py');
            markCoreReady('lua', 'chip-lua', 'dot-lua');

        // Switch physics to WASM mode when available
        this._physicsMode = 'wasm';
        console.info('[QuadCore] Physics mode switched to WASM');

        // Test each subsystem
        this._testCores();
        } catch (error) {
            console.warn('[QuadCore] Some sub-systems failed to initialize:', error);
            markCoreWarn('wasm', 'chip-wasm');
            markCoreWarn('py', 'chip-py');
            markCoreWarn('lua', 'chip-lua');
            // Continue with JS fallbacks
        }
    }

    async _testCores() {
        // Test WASM physics
        try {
            const testState = {
                velocity: { x: 5, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 }
            };
            const result = resolvePhysicsFrame(testState, 1/60);
            console.info('[QuadCore] WASM physics test:', result);
        } catch (e) {
            console.warn('[QuadCore] WASM physics test failed:', e);
        }

        // Test Python backend connection
        try {
            const seed = await requestSecureLevelSeed(1, 1);
            console.info('[QuadCore] Python backend reachable:', seed ? 'yes' : 'no');
        } catch (e) {
            console.warn('[QuadCore] Python backend not reachable:', e);
        }

        // Test Lua economy
        try {
            const purchase = await calculateShopPurchase('test', 3);
            console.info('[QuadCore] Lua economy test:', purchase);
        } catch (e) {
            console.warn('[QuadCore] Lua economy test failed:', e);
        }
    }

    // ---- Controls (recycled from v1.x) ----

    initControls() {
        this.keys = {};
        this.joystickInverted = false; // Default: not inverted (push UP = forward)
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') jump(this);
        });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

        // F8 = toggle debug overlay (grounded, velocity, joystick)
        window.addEventListener('keydown', (e) => {
            if (e.code === 'F8') {
                e.preventDefault();
                this._debugOverlayVisible = !this._debugOverlayVisible;
                const el = document.getElementById('debug-overlay');
                if (el) {
                    el.style.display = this._debugOverlayVisible ? 'block' : 'none';
                }
            }
        });

        const joystickContainer = document.getElementById('joystick-container');
        if (joystickContainer) {
            const joystick = nipplejs.create({
                zone: joystickContainer,
                mode: 'static',
                position: { left: '90px', bottom: '90px' },
                color: 'white',
                size: 140,
                threshold: 0.1
            });

            this.joystickInput = { x: 0, y: 0 };
            joystick.on('move', (evt, data) => {
                try {
                    const dz = this.joystickDeadzone || 0.10;
                    const power = (this.joystickPower || 1.0);
                    if (!data || !data.vector || data.force < dz) {
                        this.joystickInput.x = 0;
                        this.joystickInput.y = 0;
                    } else {
                        const invertY = this.joystickInverted ? 1 : -1;
                        this.joystickInput.x = Math.max(-1, Math.min(1, data.vector.x * power));
                        this.joystickInput.y = Math.max(-1, Math.min(1, data.vector.y * power * invertY));
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
        }

        const jumpBtn = document.getElementById('jump-btn');
        if (jumpBtn) {
            jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); jump(this); });
            jumpBtn.addEventListener('mousedown', (e) => jump(this));
        }

        // Camera controls
        this.cameraYaw = 0;
        this.cameraPitch = 0.4;
        this.cameraDistance = 8;
        this.mouseInput = { x: 0, y: 0 };
        this.dragStart = { x: 0, y: 0 };
        this.isDragging = false;

        window.addEventListener('mousedown', (e) => {
            if (e.target.closest('#top-menu') || e.target.closest('.modal') ||
                e.target.closest('#joystick-container') || e.target.closest('#jump-btn')) return;
            this.isDragging = true;
            this.dragStart.x = e.clientX;
            this.dragStart.y = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.dragStart.x;
                const dy = e.clientY - this.dragStart.y;
                this.cameraYaw -= dx * 0.002;
                this.cameraPitch = Math.max(0.15, Math.min(1.2, this.cameraPitch + dy * 0.002));
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.mouseInput.x = 0;
            this.mouseInput.y = 0;
        });
    }

    // ---- UI (full setup with shop, leaderboard, settings) ----

    _initUI() {
        // Setup the full UI system (shop, leaderboard, settings, etc.)
        import('./src/ui.js').then(mod => {
            try {
                mod.setupUI(this, null);

                // Bind game-state checking so the render loop in rendering.js can
                // execute coin collection, checkpoint/respawn, fall-off timer,
                // HUD updates, and win-condition detection every frame.
                this.checkGameState = (dt) => mod.checkGameState(this, dt, null);

                // Bind shop/purchase helpers called from ball_index_ui.js
                this.handlePurchase = (type, key, price) => mod.handlePurchase(this, type, key, price);
                this.levelUpSkin = (key, cost) => mod.levelUpSkin(this, key, cost);
            } catch (e) {
                console.warn('UI setup error (non-critical):', e);
            }
        }).catch(e => console.warn('UI module load error:', e));

        // Wire the builder entry point so the builder button works
        import('./src/builder/builder_ui.js').then(mod => {
            if (typeof mod.enterBuilder === 'function') {
                this.enterBuilder = () => mod.enterBuilder(this);
            }
        }).catch(() => {});
    }

    // ---- Quad-Core Physics Pipeline ----
    // Overrides the default cannon-es update with WASM physics when available
    _updatePhysicsWASM(dt) {
        if (!quadCore.isInitialized || !resolvePhysicsFrame) {
            // Fall back to cannon-es while WASM boots
            updatePhysics(this, dt);
            return;
        }

        // Read current state from cannon-es body (visual/physics sync)
        const bodyVel = this.ballBody.velocity;
        const bodyRot = this.ballBody.angularVelocity;

        // Send to WASM solver for anti-cheat validated resolution
        const wasmResult = resolvePhysicsFrame({
            velocity: { x: bodyVel.x, y: bodyVel.y, z: bodyVel.z },
            rotation: { x: bodyRot.x, y: bodyRot.y, z: bodyRot.z }
        }, dt);

        // Guard against invalid WASM output (e.g., module crash)
        if (!wasmResult || !wasmResult.position || !wasmResult.position.x || !isFinite(wasmResult.position.x)) {
            updatePhysics(this, dt);
            return;
        }

        // Mix WASM-validated velocity back into cannon-es body
        const mixFactor = 0.3;
        const safeDt = Math.max(0.001, dt);
        bodyVel.x += (wasmResult.position.x / safeDt - bodyVel.x) * mixFactor;
        bodyVel.y += (wasmResult.position.y / safeDt - bodyVel.y) * mixFactor;
        bodyVel.z += (wasmResult.position.z / safeDt - bodyVel.z) * mixFactor;

        // Let cannon-es handle the actual step with corrected velocities
        updatePhysics(this, dt);

        // Send validation hash to Python backend periodically (~0.3% of frames)
        // This is the runtime invocation of the Federated Physics Validation method
        if (wasmResult.validationHash > 0 && Math.random() < 0.003) {
            this._lastValidationHash = wasmResult.validationHash;
            // Fire-and-forget frame validation (don't block gameplay on server response)
            quadCore.validateFrame(
                { validationHash: wasmResult.validationHash },
                this.currentLevel || 1
            ).catch(() => {});
        }
    }

    // ---- Delegated Methods (wrappers for recycled modules) ----

    onWindowResize() { onWindowResize(this); }
    updatePhysics(dt) {
        if (this._physicsMode === 'wasm') {
            this._updatePhysicsWASM(dt);
        } else {
            updatePhysics(this, dt);
        }
    }
    jump() { jump(this); }

    createLevel(seed) { createLevel(this, seed); }
    createInfiniteLevel(seed) { createInfiniteLevel(this, seed); }
    clearLevel() { clearLevel(this); }
    addPlatform(x, y, z, w, l, c) { addPlatform(this, x, y, z, w, l, c); }
    addGlassPlatform(x, y, z, w, l) { addGlassPlatform(this, x, y, z, w, l); }
    addTunnelWalls(x, y, z, w, l) { addTunnelWalls(this, x, y, z, w, l); }
    addRamp(x, y, z, w, l, h) { addRamp(this, x, y, z, w, l, h); }
    addPendulum(x, y, z, s) { addPendulum(this, x, y, z, s); }
    addSpinner(x, y, z, s) { addSpinner(this, x, y, z, s); }
    addHammer(x, y, z, s) { addHammer(this, x, y, z, s); }
    addMover(x, y, z, w, h, d, sw, s) { addMover(this, x, y, z, w, h, d, sw, s); }
    addWall(x, y, z, w, l, r) { addWall(this, x, y, z, w, l, r); }
    addBlade(x, y, z, t, ln, sw, v) { addBlade(this, x, y, z, t, ln, sw, v); }
    addLoopDeLoop(x, y, z, w, r, s) { addLoopDeLoop(this, x, y, z, w, r, s); }
    addSpiralTube(x, y, z, w, r, t, s) { addSpiralTube(this, x, y, z, w, r, t, s); }
    addSpringPad(x, y, z, w, l, bp) { addSpringPad(this, x, y, z, w, l, bp); }
    addCurve(x, y, z, w, al, s, d) { addCurve(this, x, y, z, w, al, s, d); }
    addStairs(x, y, z, w, sc, sl, sh) { addStairs(this, x, y, z, w, sc, sl, sh); }
    addPortalRing(x, y, z, r) { addPortalRing(this, x, y, z, r); }
    addHalfPipe(x, y, z, w, l) { addHalfPipe(this, x, y, z, w, l); }
    addCheckerboard(x, y, z, ts, rows) { addCheckerboard(this, x, y, z, ts, rows); }
    addGlassLoopDeLoop(x, y, z, w, r, s) { addGlassLoopDeLoop(this, x, y, z, w, r, s); }
    addGlassStairs(x, y, z, w, sc, sl, sh) { addGlassStairs(this, x, y, z, w, sc, sl, sh); }
    addGlassCurve(x, y, z, w, al, s, d) { addGlassCurve(this, x, y, z, w, al, s, d); }
    addCoins(x, y, sz, l, c) { addCoins(this, x, y, sz, l, c); }
    addCheckpoint(x, y, z, w) { addCheckpoint(this, x, y, z, w); }
    placeFinishModel() { placeFinishModel(this); }
    triggerDropFromObstacle(o, opts) { triggerDropFromObstacle(this, o, opts); }
    spawnDroppedCoins(p, v) { spawnDroppedCoins(this, p, v); }
    createShockwave(z, i) { createShockwave(this, z, i); }
    playSound(name) { playSound(name); }
    save() { saveGame(this); }

    // Sky-condition effect updaters (called from rendering.js render loop)
    updateFireSparks(dt) { updateFireSparks(this, dt); }
    updateHeatShimmer(dt) { updateHeatShimmer(this, dt); }
    updateMeteors(dt) { updateMeteors(this, dt); }
    checkMeteorCollisions() { checkMeteorCollisions(this); }

    getBallMaterial() { return getBallMaterial(this); }
    applyBallSkin(conf) { applyBallSkin(this, conf); }
}

// ============================================================================
// Bootstrap
// ============================================================================

// Handle loading manager setup
import { setupLoadingManager } from './src/networking.js';
setupLoadingManager();

// Create the game instance
const game = new Game();

// Window resize handler
window.addEventListener('resize', () => game.onWindowResize());

// Expose game for debugging
window.__game = game;

console.info(`[QuadCore] Bootstrap complete in ${(performance.now() - game._bootstrapStart).toFixed(0)}ms`);
console.info('[QuadCore] Architecture: JS (orchestrator) + Rust/WASM (physics) + Python (backend) + Lua (economy)');
