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
import { initSpeedLines } from './src/speed_lines.js';
import { initMotionBlur } from './src/motion_blur.js';
import { createLevel, createInfiniteLevel, clearLevel, addPlatform, addGlassPlatform, addTunnelWalls, addRamp, addPendulum, addSpinner, addHammer, addMover, addWall, addCoins, addCheckpoint, addBlade, placeFinishModel, triggerDropFromObstacle, spawnDroppedCoins, spawnInfiniteChunk, createShockwave, addLoopDeLoop, addSpiralTube, addSpringPad, addCurve, addStairs, addPortalRing, addHalfPipe, addCheckerboard, addGlassLoopDeLoop, addGlassStairs, addGlassCurve, playCommunityTrack } from './src/levelgen.js';
import { setupUI, renderGrids, renderBallIndex, getLeaderboard, saveLeaderboard, addLeaderboardEntry, renderLeaderboard, handlePurchase, levelUpSkin, applySkinAbilities, updateWalletUI, checkGameState, gameOver, showTimeBonus, reset, showTestPlayHUD, removeTestPlayHUD } from './src/ui.js';
import { initBuilderScene, onBuilderMouseMove, onBuilderClick, onBuilderWheel, onBuilderPanStart, onBuilderPanEnd, placePart, undoLastPlacement, clearBuilderScene, disposeBuilderScene, renderBuilder, loadPartsIntoBuilder } from './src/builder/builder_scene.js';
import { renderBuilderUI, exitBuilder, updateBuilderCount, updateBuilderUIState } from './src/builder/builder_ui.js';
import { initBuilderMultiplayer, disposeBuilderMultiplayer, shareTrack, loadCommunityTracks, renderCommunityModal, recordTrackPlay } from './src/builder/builder_networking.js';
import { getPartDef } from './src/builder/catalog.js';
import { addBuilderXP, calculateTrackBonusXP } from './src/builder/builder_xp.js';
import { initWorkshop } from './src/builder/ws_app.js';
import { initWorldNetworking, disposeWorldNetworking } from './src/world/world_networking.js';
import { renderWorldUI, exitWorld } from './src/world/world_ui.js';
import { purchaseSite, listSiteForSale, delistSite } from './src/world/marketplace.js';
import { initARVR, disposeARVR, updateMobilePointers } from './src/world/world_arvr.js';
import { initNeighborPreview, updateNeighborPreview, animateNeighborPreview, markNeighborPreviewDirty, disposeNeighborPreview, toggleNeighborPreview } from './src/world/world_minimap.js';

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

        // Store room reference for community track access outside builder
        this._builderRoom = room;
        // Assign a player ID early so likes/upvotes work from the main menu
        // (initBuilderMultiplayer may overwrite it later when entering the builder)
        this._builderPlayerId = 'player_' + Math.random().toString(36).slice(2, 8);

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

        // --- Speed lines (cosmetic VFX) ---
        initSpeedLines(this);

        // --- Motion blur post-processing ---
        initMotionBlur(this);

        // --- Controls ---
        this.initControls();

        // --- Level ---
        createLevel(this);

        // --- UI ---
        setupUI(this, room);
        updateWalletUI(this);

        // Apply initial skin abilities
        applySkinAbilities(this, this.saveData.selectedBall || 'rainbow');

        // --- World system (initialized on first enter) ---
        this._worldActive = false;
        this._worldGrid = null;
        this._worldSync = null;
        this._worldPlayers = [];
        this._worldListings = [];

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

        // Auto-save builder parts to the current world site before cleanup destroys them
        if (this._worldCurrentSite && this._worldSync && this._builderPlacedParts && this._builderPlacedParts.length > 0) {
            const site = this._worldCurrentSite;
            const parts = this._builderPlacedParts.map(p => ({
                partKey: p.partKey, x: p.x, y: p.y, z: p.z,
                rotation: p.rotation || 0, params: p.params || {}
            }));
            this._worldSaveSiteParts(site.col, site.row, parts);
            // Also update the local grid cache so neighbor previews reflect changes
            const gridSite = this._worldGrid ? this._worldGrid.getSite(site.col, site.row) : null;
            if (gridSite) {
                gridSite.parts = parts;
                gridSite.partCount = parts.length;
                gridSite.lastEdited = Date.now();
            }
            markNeighborPreviewDirty(this);
        }

        // Remove builder input handlers
        if (this._builderMouseMove) document.removeEventListener('mousemove', this._builderMouseMove);
        if (this._builderMouseDown) document.removeEventListener('mousedown', this._builderMouseDown);
        if (this._builderMouseUp) document.removeEventListener('mouseup', this._builderMouseUp);
        if (this._builderWheel) document.removeEventListener('wheel', this._builderWheel);
        if (this._builderContext) document.removeEventListener('contextmenu', this._builderContext);
        if (this._builderKeyDown) document.removeEventListener('keydown', this._builderKeyDown);
        if (this._builderKeyUp) document.removeEventListener('keyup', this._builderKeyUp);

        // Cleanup multiplayer sync
        disposeBuilderMultiplayer(this);

        // Dispose builder scene resources
        disposeBuilderScene(this);
    }

    _builderUndo() { undoLastPlacement(this); }
    _builderClear() { clearBuilderScene(this); }
    _builderPlay() {
        // Serialize parts BEFORE exitBuilder destroys them
        const parts = (this._builderPlacedParts || []).map(p => ({
            partKey: p.partKey,
            x: p.x, y: p.y, z: p.z,
            rotation: p.rotation || 0,
            params: p.params || {},
            _category: getPartDef(p.partKey)?.category
        }));
        if (parts.length === 0) { alert('Place some parts first!'); return; }

        // Save parts for return-to-builder flow
        this._testPlayParts = parts;
        this._isTestPlayFromBuilder = true;

        // Award XP for test-play with track bonus
        addBuilderXP(this, 15, 'Test play');
        const bonusXP = calculateTrackBonusXP(parts);
        for (const b of bonusXP.breakdown) {
            addBuilderXP(this, b.xp, b.label, { skipNotify: true });
        }

        // Exit builder (destroys builder scene), then load the track
        exitBuilder(this);
        playCommunityTrack(this, parts);

        // Show floating 'Back to Builder' button
        showTestPlayHUD(this);
    }
    _returnToBuilder() {
        const parts = this._testPlayParts;
        removeTestPlayHUD(this);
        this._testPlayParts = null;
        if (!parts || parts.length === 0) {
            this.enterBuilder();
            return;
        }
        this.enterBuilder();
        loadPartsIntoBuilder(this, parts);
        updateBuilderUIState(this);
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
        this.saveData.totalTracksCreated = (this.saveData.totalTracksCreated || 0) + 1;
        addBuilderXP(this, 10, 'Track saved');
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
        // Award share XP with track bonus
        const parts = (this._builderPlacedParts || []).map(p => ({
            partKey: p.partKey, x: p.x, y: p.y, z: p.z,
            rotation: p.rotation || 0, params: p.params || {},
            _category: getPartDef(p.partKey)?.category
        }));
        const bonusXP = calculateTrackBonusXP(this, parts);
        addBuilderXP(this, 25, 'Track shared');
        for (const b of bonusXP.breakdown) {
            addBuilderXP(this, b.xp, b.label, { skipNotify: true });
        }
        shareTrack(this, name);
    }
    _builderRenderPreview() { renderBuilder(this); }
    _builderLoadCommunity() {
        loadCommunityTracks(this, 'builder');
    }
    _builderLoadCommunityParts(parts) {
        loadPartsIntoBuilder(this, parts);
        updateBuilderUIState(this);
    }
    _playCommunityTrack(parts, trackId) {
        playCommunityTrack(this, parts);
        if (trackId) recordTrackPlay(this, trackId);
    }
    _showCommunityMenu() {
        loadCommunityTracks(this, 'play');
    }
    _openCommunityInBuilder() {
        renderCommunityModal(this, [], 'builder');
    }
    _builderPlaceRemote(remote) {
        const partDef = getPartDef(remote.partKey);
        if (!partDef) return;
        placePart(this, remote.partKey, remote.x, remote.y, remote.z, remote.rotation || 0);
        updateBuilderCount(this);
    }

    // ---- 3D Workshop mode ----

    _enterWorkshop() {
        if (!this._workshop) {
            this._workshop = initWorkshop(this);
        }
        this._builderActive = false;
        this._workshopActive = true;
        this.isGameOver = true; // pause physics

        // Hide the builder sidebar
        const sidebar = document.getElementById('builder-sidebar');
        if (sidebar) sidebar.style.display = 'none';

        // Show the overlay for workshop UI panels
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.innerHTML = '';
        }

        this._workshop.enter();
    }

    _exitWorkshop() {
        if (!this._workshop) return;
        this._workshop.exit();
        this._workshopActive = false;
        this.isGameOver = false;
    }

    // ---- Builder delegation methods (called from builder_scene.js) ----

    // ---- World mode ----

    enterWorld() {
        if (!this._worldGrid) {
            this._worldGrid = initWorldNetworking(this, room);
            initARVR(this);
        }
        // Initialize 3D neighbor preview if not already done
        if (!this._neighborPreviewGroup) {
            initNeighborPreview(this);
        }
        this._worldActive = true;
        this.isGameOver = true; // pause physics
        renderWorldUI(this);
    }

    _onExitWorld() {
        this._worldActive = false;
        this.isGameOver = false;
        this._lastFrameTime = 0;
        exitWorld(this);
        // Mark neighbor preview dirty so it rebuilds with fresh data
        markNeighborPreviewDirty(this);
    }

    _worldBuySite(col, row) {
        return purchaseSite(this, col, row);
    }

    _worldSellSite(col, row, price) {
        return listSiteForSale(this, col, row, price);
    }

    _worldDelistSite(col, row) {
        return delistSite(this, col, row);
    }

    _worldSaveSiteParts(col, row, parts) {
        if (this._worldSync) {
            return this._worldSync.saveSiteParts(col, row, parts);
        }
    }

    _worldUpdatePresence(col, row) {
        if (this._worldSync) {
            this._worldSync.updatePresence(col, row);
        }
        if (this._mobilePointers) {
            updateMobilePointers(this);
        }
        // Mark neighbor preview dirty when player moves to a new site
        markNeighborPreviewDirty(this);
    }

    _toggleNeighborPreview() {
        return toggleNeighborPreview(this);
    }

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
