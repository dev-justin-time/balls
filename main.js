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

// Module imports
import { initPersistence, saveGame, getParticleCount } from './src/persistence.js';
import { initAudio, registerSfx, playSound } from './src/audio.js';
import { initNetworking, setupLoadingManager, setupGlobalErrorHandlers } from './src/networking.js';
import { initScene, getBallMaterial, clearTextureCache } from './engine/scene.js';
import { onWindowResize, animate } from './src/rendering.js';
import { initPhysics, updatePhysics, jump, createRain, clearRain, createWind, clearWind } from './src/physics.js';
import { createLevel, clearLevel, addPlatform, addGlassPlatform, addTunnelWalls, addRamp, addPendulum, addSpinner, addHammer, addMover, addWall, addCoins, addCheckpoint, placeFinishModel, triggerDropFromObstacle, spawnDroppedCoins } from './src/levelgen.js';
import { setupUI, renderGrids, renderBallIndex, getLeaderboard, saveLeaderboard, addLeaderboardEntry, renderLeaderboard, handlePurchase, levelUpSkin, applySkinAbilities, updateWalletUI, checkGameState, gameOver, showTimeBonus, reset } from './src/ui.js';

// --- Loading Manager (must run before asset loading) ---
setupLoadingManager();

// --- Networking init (top-level await for room) ---
const room = await initNetworking();

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
    }

    // ---- Controls (kept in main.js as they're closely tied to DOM events) ----
    initControls() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') jump(this);
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
                this.cameraPitch = Math.max(0.1, Math.min(1.4, this.cameraPitch + my * 0.002));
            } else if (document.pointerLockElement === document.body) {
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
            if (e.code === 'KeyT') document.exitPointerLock();
        });
    }

    // ---- Module method delegation (thin wrappers) ----

    onWindowResize() { onWindowResize(this); }

    updatePhysics(dt) { updatePhysics(this, dt); }
    jump() { jump(this); }
    createRain() { createRain(this); }
    clearRain() { clearRain(this); }
    createWind() { createWind(this); }
    clearWind() { clearWind(this); }

    createLevel(seed) { createLevel(this, seed); }
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
    addCoins(x, y, sz, l, c) { addCoins(this, x, y, sz, l, c); }
    addCheckpoint(x, y, z, w) { addCheckpoint(this, x, y, z, w); }
    placeFinishModel() { placeFinishModel(this); }
    triggerDropFromObstacle(o, opts) { triggerDropFromObstacle(this, o, opts); }
    spawnDroppedCoins(p, v) { spawnDroppedCoins(this, p, v); }

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
}

// ============================================================================
// Bootstrap
// ============================================================================
const game = new Game();

window.addEventListener('resize', () => onWindowResize(game));
