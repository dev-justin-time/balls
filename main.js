/*
 main.js — Bootstrap and DI wiring.
 Imports all modules and wires them via a thin Game class.
 Orchestration only — all real logic lives in modules:
   engine/scene.js, physics.js, ui.js, levelgen.js,
   audio.js, persistence.js, networking.js, rendering.js.
*/
import * as THREE from 'three';
import nipplejs from 'nipplejs';
import { NotificationManager } from './src/notification_manager.js';

import { room, setupGlobalErrorHandlers } from './networking.js';

import { initPersistence, saveGame, getParticleCount } from './src/persistence.js';
import { initAudio, registerSfx, playSound } from './src/audio.js';
import { initScene, getBallMaterial, clearTextureCache } from './engine/scene.js';
import { onWindowResize, animate } from './src/rendering.js';
import { initPhysics, updatePhysics, jump, createRain, clearRain, createWind, clearWind, createFireSparks, clearFireSparks, updateFireSparks, createHeatShimmer, clearHeatShimmer, updateHeatShimmer, createMeteors, clearMeteors, updateMeteors, checkMeteorCollisions } from './src/physics.js';
import { createLevel, createInfiniteLevel, clearLevel, addPlatform, addGlassPlatform, addTunnelWalls, addRamp, addPendulum, addSpinner, addHammer, addMover, addWall, addCoins, addCheckpoint, addBlade, placeFinishModel, triggerDropFromObstacle, spawnDroppedCoins, spawnInfiniteChunk, createShockwave, addLoopDeLoop, addSpiralTube, addSpringPad, addCurve, addStairs, addPortalRing, addHalfPipe, addCheckerboard, addGlassLoopDeLoop, addGlassStairs, addGlassCurve } from './src/levelgen.js';
import { setupUI, renderGrids, renderBallIndex, getLeaderboard, saveLeaderboard, addLeaderboardEntry, renderLeaderboard, handlePurchase, levelUpSkin, applySkinAbilities, updateWalletUI, checkGameState, gameOver, showTimeBonus, reset } from './src/ui.js';
import { initBuilderScene, onBuilderMouseMove, onBuilderClick, onBuilderWheel, onBuilderPanStart, onBuilderPanEnd, placePart, undoLastPlacement, clearBuilderScene, disposeBuilderScene, renderBuilder, loadPartsIntoBuilder } from './src/builder/builder_scene.js';
import { renderBuilderUI, exitBuilder, updateBuilderCount, updateBuilderUIState } from './src/builder/builder_ui.js';
import { initBuilderMultiplayer, disposeBuilderMultiplayer, shareTrack, loadCommunityTracks } from './src/builder/builder_networking.js';
import { getPartDef } from './src/builder/catalog.js';

// --- Notification manager ---
const notifier = new NotificationManager({
    maxConcurrent: 3,
    minIntervalMs: 300,
    containerId: 'goingballs-notification-container'
});

// --- Global error handlers ---
setupGlobalErrorHandlers(notifier);


// ============================================================================
// Game class — thin DI shell
// ============================================================================
class Game {
    constructor() {
        // --- Persistence / Data ---
        initPersistence(this);

        // --- Audio ---
        initAudio(this);
        registerSfx('coin', 'assets/sfx/coin_collect.mp3');
        registerSfx('jump', 'assets/sfx/jump.mp3');
        registerSfx('finish', 'assets/sfx/finish_line.mp3');
        registerSfx('fall', 'assets/sfx/fall_off.mp3');

        // --- Scene / Rendering ---
        initScene(this);

        // --- Physics ---
        initPhysics(this);

        // --- Controls ---
        this.initControls();

        // --- Level ---
        createLevel(this);

        // --- UI ---
        setupUI(this, room);
        updateWalletUI(this);

        // Apply initial skin abilities
        applySkinAbilities(this, this.saveData.selectedBall || 'rainbow');

        // --- Game loop ---
        animate(this);

        // Signal that the scene/level are initialized — dismiss loading overlay
        // when combined with asset-loading readiness (tracked in networking.js).
        if (typeof window.__signalSceneReady === 'function') {
            window.__signalSceneReady();
        }
    }

    // ---- Controls (kept in main.js as they're closely tied to DOM events) ----
    initControls() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') jump(this);
        });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

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
                const dz = (this.joystickDeadzone !== undefined) ? this.joystickDeadzone : 0.10;
                const power = (this.joystickPower !== undefined) ? this.joystickPower : 1.0;
                if (!data || !data.vector || data.force < dz) {
                    this.joystickInput.x = 0;
                    this.joystickInput.y = 0;
                } else {
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
        jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); jump(this); });
        jumpBtn.addEventListener('mousedown', (e) => jump(this));

        this.cameraYaw = 0;
        this.cameraPitch = 0.4;
        this.cameraDistance = 8;

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
                const mx = Math.abs(e.movementX) > 150 ? 0 : e.movementX;
                const my = Math.abs(e.movementY) > 150 ? 0 : e.movementY;
                this.cameraYaw -= mx * 0.002;
                this.cameraPitch = Math.max(0.15, Math.min(1.2, this.cameraPitch + my * 0.002));
            } else if (document.pointerLockElement === document.body) {
                const mx = Math.abs(e.movementX) > 150 ? 0 : e.movementX;
                const my = Math.abs(e.movementY) > 150 ? 0 : e.movementY;
                this.cameraYaw -= mx * 0.0025;
                this.cameraPitch = Math.max(0.15, Math.min(1.2, this.cameraPitch + my * 0.0025));
                this.mouseInput.x = THREE.MathUtils.clamp(mx * 0.1, -1, 1);
                this.mouseInput.y = THREE.MathUtils.clamp(-my * 0.1, -1, 1);
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.mouseInput.x = 0;
            this.mouseInput.y = 0;
        });

        const handleInteraction = (e) => {
            const topMenu = document.getElementById('top-menu');
            const isMenuClick = e.target.closest('#top-menu');
            const isModalClick = e.target.closest('.modal');
            if (isMenuClick || isModalClick) return;
            try {
                if (topMenu && topMenu.classList.contains('visible')) {
                    topMenu.classList.remove('visible');
                }
            } catch (err) {}
        };

        window.addEventListener('mousedown', handleInteraction);
        window.addEventListener('touchstart', (e) => {
            if (e.target.closest('#top-menu') || e.target.closest('.modal')) return;
            if (!e.target.closest('#joystick-container') && !e.target.closest('#jump-btn')) {
                handleInteraction(e);
            }
        }, { passive: true });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && document.pointerLockElement === document.body) {
                document.exitPointerLock();
            }

            // Focus-trap for open modals inside #overlay
            if (e.code === 'Tab') {
                const overlay = document.getElementById('overlay');
                if (!overlay || overlay.style.display !== 'flex') return;
                const focusable = overlay.querySelectorAll(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first || !overlay.contains(document.activeElement)) {
                        e.preventDefault();
                        last.focus();
                    }
                } else {
                    if (document.activeElement === last || !overlay.contains(document.activeElement)) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }
        });

        // --- Pointer lock button ---
        const plBtn = document.getElementById('pointerlock-btn');
        const hint = document.getElementById('pointerlock-hint');
        const hintDismiss = document.getElementById('pointerlock-hint-dismiss');

        const updatePlIcon = () => {
            if (!plBtn) return;
            plBtn.textContent = document.pointerLockElement === document.body ? '🔒' : '🖱️';
        };

        if (plBtn) {
            plBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (document.pointerLockElement === document.body) {
                    document.exitPointerLock();
                } else {
                    document.body.requestPointerLock();
                }
            });
        }

        document.addEventListener('pointerlockchange', () => {
            updatePlIcon();
            // Dismiss hint once user engages with pointer lock
            if (hint && document.pointerLockElement === document.body) {
                hint.classList.remove('visible');
                try { localStorage.setItem('goingBalls_plHintDismissed', '1'); } catch(e) {}
            }
        });

        // Show hint after loading completes (overlay removed)
        if (hint && !localStorage.getItem('goingBalls_plHintDismissed')) {
            let pollAttempts = 0;
            const showHint = () => {
                pollAttempts++;
                if (pollAttempts > 50) return; // bail-out after ~30s
                if (!document.getElementById('loading-overlay') || document.getElementById('loading-overlay').style.opacity === '0') {
                    hint.classList.add('visible');
                } else {
                    setTimeout(showHint, 600);
                }
            };
            setTimeout(showHint, 2500);
        }

        if (hintDismiss && hint) {
            hintDismiss.addEventListener('click', (e) => {
                e.stopPropagation();
                hint.classList.remove('visible');
                try { localStorage.setItem('goingBalls_plHintDismissed', '1'); } catch(e) {}
            });
        }
    }

    // ---- Module method delegation (thin wrappers) ----

    onWindowResize() { onWindowResize(this); }

    updatePhysics(dt) { updatePhysics(this, dt); }
    jump() { jump(this); }
    createRain() { createRain(this); }
    clearRain() { clearRain(this); }
    createWind() { createWind(this); }
    clearWind() { clearWind(this); }
    createFireSparks() { createFireSparks(this); }
    clearFireSparks() { clearFireSparks(this); }
    updateFireSparks(dt) { updateFireSparks(this, dt); }
    createHeatShimmer() { createHeatShimmer(this); }
    clearHeatShimmer() { clearHeatShimmer(this); }
    updateHeatShimmer(dt) { updateHeatShimmer(this, dt); }
    createMeteors() { createMeteors(this); }
    clearMeteors() { clearMeteors(this); }
    updateMeteors(dt) { updateMeteors(this, dt); }
    checkMeteorCollisions() { checkMeteorCollisions(this); }

    createLevel(seed) { createLevel(this, seed); }
    clearLevel() { clearLevel(this); }
    createInfiniteLevel(seed) { createInfiniteLevel(this, seed); }
    spawnInfiniteChunk() { spawnInfiniteChunk(this); }
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

    setupUI() { setupUI(this, room); }
    updateWalletUI() { updateWalletUI(this); }
    checkGameState(dt) { checkGameState(this, dt, room); }
    gameOver(win) { gameOver(this, win, room); }
    showTimeBonus(bonus) { showTimeBonus(this, bonus); }
    reset() { reset(this); }
    renderGrids() { renderGrids(this); }
    renderBallIndex() { renderBallIndex(this, room); }
    getLeaderboard() { return getLeaderboard(this, room); }
    saveLeaderboard(entries) { saveLeaderboard(this, entries, room); }
    addLeaderboardEntry(entry) { addLeaderboardEntry(this, entry, room); }
    renderLeaderboard() { renderLeaderboard(this, room); }
    handlePurchase(type, key, price) { handlePurchase(this, type, key, price); }
    levelUpSkin(key, cost) { levelUpSkin(this, key, cost); }
    applySkinAbilities(key) { applySkinAbilities(this, key); }

    save() { saveGame(this); }
    getParticleCount(type, def) { return getParticleCount(this, type, def); }
    loadData() {} // no-op (handled by initPersistence)

    getBallMaterial() { return getBallMaterial(this); }
    playSound(name) { playSound(name); }
    clearTextureCache() { clearTextureCache(this); }

    // ---- Builder mode ----

    enterBuilder() {
        // Initialize builder if first time
        if (!this._builderScene) {
            initBuilderScene(this);
            initBuilderMultiplayer(this, room);
        }
        // Store game-mode state so we can restore
        this._wasInfinite = this._isInfinite || false;
        // Switch to builder mode
        this._builderActive = true;
        this.isGameOver = true; // pause physics
        renderBuilderUI(this);

        // Wire builder input handlers
        this._builderMouseMove = (e) => {
            if (e.target.closest('#builder-sidebar') || e.target.closest('#overlay')) return;
            this.builderMouseMove(e.clientX, e.clientY);
        };
        this._builderMouseDown = (e) => {
            if (e.target.closest('#builder-sidebar') || e.target.closest('#overlay')) return;
            if (e.button === 2) {
                // Right click — pan
                this.builderPanStart(e.clientX, e.clientY);
            } else if (e.button === 0) {
                // Left click — place or delete (shift)
                this.builderClick(e.clientX, e.clientY);
                updateBuilderUIState(this);
            }
        };
        this._builderMouseUp = (e) => {
            if (this._builderIsPanning) this.builderPanEnd();
        };
        this._builderWheel = (e) => {
            if (e.target.closest('#builder-sidebar') || e.target.closest('#overlay')) return;
            this.builderWheel(e.deltaY);
        };
        this._builderContext = (e) => {
            if (!e.target.closest('#builder-sidebar')) e.preventDefault();
        };
        this._builderKeyDown = (e) => {
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                this._builderShiftDown = true;
                return;
            }
            if (e.code === 'KeyR' && this._builderSelectedKey) {
                // Rotate selected part by 90 degrees
                if (this._builderPendingPos) {
                    this._builderPendingPos.rotation =
                        ((this._builderPendingPos.rotation || 0) + Math.PI / 2) % (Math.PI * 2);
                }
            } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
                this._builderUndo();
                updateBuilderCount(this);
            } else if (e.code === 'Escape') {
                exitBuilder(this);
            }
        };
        this._builderKeyUp = (e) => {
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                this._builderShiftDown = false;
            }
        };

        document.addEventListener('mousemove', this._builderMouseMove);
        document.addEventListener('mousedown', this._builderMouseDown);
        document.addEventListener('mouseup', this._builderMouseUp);
        document.addEventListener('wheel', this._builderWheel, { passive: true });
        document.addEventListener('contextmenu', this._builderContext);
        document.addEventListener('keydown', this._builderKeyDown);
        document.addEventListener('keyup', this._builderKeyUp);
    }

    _onExitBuilder() {
        this._builderActive = false;
        this.isGameOver = false;
        this._isInfinite = this._wasInfinite || false;
        this._lastFrameTime = 0; // reset dt accumulator

        // Remove builder input handlers
        if (this._builderMouseMove) document.removeEventListener('mousemove', this._builderMouseMove);
        if (this._builderMouseDown) document.removeEventListener('mousedown', this._builderMouseDown);
        if (this._builderMouseUp) document.removeEventListener('mouseup', this._builderMouseUp);
        if (this._builderWheel) document.removeEventListener('wheel', this._builderWheel);
        if (this._builderContext) document.removeEventListener('contextmenu', this._builderContext);
        if (this._builderKeyDown) document.removeEventListener('keydown', this._builderKeyDown);
        if (this._builderKeyUp) document.removeEventListener('keyup', this._builderKeyUp);
    }

    _builderUndo() { undoLastPlacement(this); }
    _builderClear() { clearBuilderScene(this); }
    _builderPlay() {
        // Export placed parts as a level definition and play it
        const def = this._builderExport();
        if (!def) return;
        exitBuilder(this);
        // Build the level from exported definition
        this.clearLevel();
        this.lastCheckpointPos.set(0, 5, 0);
        this._isInfinite = false;
        this.finishZ = undefined;
        this.score = 0;
        this.levelLength = 500;
        this.startTime = Date.now();
        // Place each part using the real levelgen functions with destructured params
        for (const placed of this._builderPlacedParts || []) {
            const partDef = getPartDef(placed.partKey);
            if (!partDef || !partDef.builderFn) continue;
            const p = placed.params || {};
            switch (placed.partKey) {
                case 'platform':
                case 'speed_strip':
                case 'finish_line':
                    this.addPlatform(placed.x, placed.y, placed.z, p.width || 8, p.length || 15, p.color || null);
                    break;
                case 'ramp':
                    this.addRamp(placed.x, placed.y, placed.z, p.width || 8, p.length || 15, p.height || 5);
                    break;
                case 'glass_platform':
                    this.addGlassPlatform(placed.x, placed.y, placed.z, p.width || 6, p.length || 14);
                    break;
                case 'wall':
                    this.addWall(placed.x, placed.y, placed.z, p.width || 1, p.length || 20, p.rotZ || 0);
                    break;
                case 'tunnel_walls':
                    this.addTunnelWalls(placed.x, placed.y, placed.z, p.width || 8, p.length || 30);
                    break;
                case 'pendulum':
                    this.addPendulum(placed.x, placed.y, placed.z, p.speedMult || 1.0);
                    break;
                case 'spinner':
                    this.addSpinner(placed.x, placed.y, placed.z, p.speedMult || 1.0);
                    break;
                case 'hammer':
                    this.addHammer(placed.x, placed.y, placed.z, p.speedMult || 1.0);
                    break;
                case 'mover':
                    this.addMover(placed.x, placed.y, placed.z, p.width || 3, p.height || 1, p.depth || 2, p.sideways || false, p.speedMult || 1.0);
                    break;
                case 'blade':
                    this.addBlade(placed.x, placed.y, placed.z, p.thickness || 0.12, p.length || 2.0, p.swing || 1.0, p.vertical || false);
                    break;
                case 'coin_line':
                    this.addCoins(placed.x, placed.y + 1, placed.z, p.length || 20, p.count || 5);
                    break;
                case 'checkpoint':
                    this.addCheckpoint(placed.x, placed.y, placed.z, p.width || 8);
                    break;
                case 'finish_model':
                    this.finishZ = placed.z;
                    this.finishX = placed.x;
                    this.finishY = placed.y;
                    break;
                case 'loop_de_loop':
                    this.addLoopDeLoop(placed.x, placed.y, placed.z, p.width || 6, p.radius || 8, p.segments || 12);
                    break;
                case 'spiral_tube':
                    this.addSpiralTube(placed.x, placed.y, placed.z, p.width || 6, p.radius || 8, p.turns || 2, p.segments || 16);
                    break;
                case 'spring_pad':
                    this.addSpringPad(placed.x, placed.y, placed.z, p.width || 4, p.length || 4, p.bouncePower ?? 15);
                    break;
                case 'curve':
                    this.addCurve(placed.x, placed.y, placed.z, p.width || 6, p.arcLength || 8, p.segments || 8, p.direction ?? 1);
                    break;
                case 'stairs':
                    this.addStairs(placed.x, placed.y, placed.z, p.width || 6, p.stepCount || 5, p.stepLength || 4, p.stepHeight || 0.8);
                    break;
                case 'portal_ring':
                    this.addPortalRing(placed.x, placed.y, placed.z, p.radius || 2);
                    break;
                case 'half_pipe':
                    this.addHalfPipe(placed.x, placed.y, placed.z, p.width || 10, p.length || 20);
                    break;
                case 'checkerboard':
                    this.addCheckerboard(placed.x, placed.y, placed.z, p.tileSize || 3, p.rows || 4);
                    break;
                case 'glass_loop':
                    this.addGlassLoopDeLoop(placed.x, placed.y, placed.z, p.width || 6, p.radius || 8, p.segments || 12);
                    break;
                case 'glass_stairs':
                    this.addGlassStairs(placed.x, placed.y, placed.z, p.width || 6, p.stepCount || 5, p.stepLength || 4, p.stepHeight || 0.8);
                    break;
                case 'glass_curve':
                    this.addGlassCurve(placed.x, placed.y, placed.z, p.width || 6, p.arcLength || 8, p.segments || 8, p.direction ?? 1);
                    break;
            }
        }
        this.startTime = Date.now();
    }
    _builderExport() {
        const parts = (this._builderPlacedParts || []).map(p => ({
            partKey: p.partKey,
            x: p.x, y: p.y, z: p.z,
            rotation: p.rotation || 0,
            params: p.params || {}
        }));
        if (parts.length === 0) return null;
        const json = JSON.stringify(parts, null, 2);
        try {
            navigator.clipboard.writeText(json).catch(() => {});
        } catch (e) {}
        console.info('Exported track:', parts.length, 'parts');
        alert(`Track exported! ${parts.length} parts copied to clipboard.`);
        return { parts };
    }
    _builderSave() {
        const parts = (this._builderPlacedParts || []).map(p => ({
            partKey: p.partKey,
            x: p.x, y: p.y, z: p.z,
            rotation: p.rotation || 0,
            params: p.params || {}
        }));
        if (parts.length === 0) { alert('Nothing to save! Place some parts first.'); return; }
        const name = prompt('Track name:', 'my_track_' + Date.now().toString(36).slice(-4));
        if (!name) return;
        const tracks = JSON.parse(localStorage.getItem('goingBalls_builder_tracks') || '{}');
        tracks[name] = { parts, savedAt: Date.now() };
        localStorage.setItem('goingBalls_builder_tracks', JSON.stringify(tracks));
        alert(`Track "${name}" saved! (${parts.length} parts)`);
    }
    _builderLoad(name) {
        const tracks = JSON.parse(localStorage.getItem('goingBalls_builder_tracks') || '{}');
        const saved = tracks[name];
        if (!saved || !saved.parts) { alert(`Track "${name}" not found.`); return; }
        loadPartsIntoBuilder(this, saved.parts);
        updateBuilderUIState(this);
    }
    _builderShare() {
        const name = prompt('Track name for sharing:', 'my_track_' + Date.now().toString(36).slice(-4));
        if (!name) return;
        shareTrack(this, name);
    }
    _builderLoadCommunity() {
        loadCommunityTracks(this);
    }
    _builderLoadCommunityParts(parts) {
        loadPartsIntoBuilder(this, parts);
        updateBuilderUIState(this);
    }
    _builderPlaceRemote(remote) {
        const partDef = getPartDef(remote.partKey);
        if (!partDef) return;
        placePart(this, remote.partKey, remote.x, remote.y, remote.z, remote.rotation || 0);
        updateBuilderCount(this);
    }

    // ---- Builder delegation methods (called from builder_scene.js) ----

    builderMouseMove(cx, cy) { onBuilderMouseMove(this, cx, cy); }
    builderClick(cx, cy) { onBuilderClick(this, cx, cy); }
    builderWheel(dy) { onBuilderWheel(this, dy); }
    builderPanStart(cx, cy) { onBuilderPanStart(this, cx, cy); }
    builderPanEnd() { onBuilderPanEnd(this); }
}

// ============================================================================
// Bootstrap
// ============================================================================
const game = new Game();

window.addEventListener('resize', () => onWindowResize(game));
