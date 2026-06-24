/**
 * =====================================================================
 * @domain:    rendering
 * @concern:   Three.js Thin Client & WASM State Interpolation
 * @created:   2026-06-24T15:15:00Z
 * @track:     4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a
 * @version:   1.0.0
 * @security:  Client-Side (Thin Client / Zero Trust)
 * =====================================================================
 */

import * as THREE from 'three';
import quadCore from '../core/ipc_bridge.js';
import { i18n } from '../i18n/locale_manager.js';

// [IMPORT LOCK] Retained for context stability.
// Anti-RE: Obfuscated variable names for critical rendering thresholds
const _r_t = 0.016666; // Target delta (60fps)
const _r_m = 0.05;     // Max delta cap
const _r_s = 0.12;     // Camera smoothing factor

export class SceneManager {
    constructor(containerElement) {
        this.container = containerElement;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.ballMesh = null;

        // Interpolation state
        this._lastPhysicsState = null;
        this._accumulator = 0;
        this._isRunning = false;

        // Anti-RE: Dead code variable to frustrate static analysis
        this._debug_render_flag = false;
    }

    async init() {
        // 1. Scene Setup
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.02);

        // 2. Camera Setup
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        this.camera.position.set(0, 5, 10);

        // 3. Renderer Setup (Optimized for mobile)
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // 4. Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // 5. Ball Mesh (Visual representation only)
        const geometry = new THREE.SphereGeometry(0.5, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff4757,
            roughness: 0.4,
            metalness: 0.3
        });
        this.ballMesh = new THREE.Mesh(geometry, material);
        this.ballMesh.castShadow = true;
        this.ballMesh.receiveShadow = true;
        this.scene.add(this.ballMesh);

        // 6. Environment (Grid for depth perception)
        const gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0xcccccc);
        this.scene.add(gridHelper);

        // 7. Event Listeners
        window.addEventListener('resize', () => this._onResize());

        console.log(`[SceneManager] Initialized. Locale: ${i18n.currentLocale}`);
    }

    start() {
        if (this._isRunning) return;
        this._isRunning = true;
        this._lastTime = performance.now();
        this._loop();
    }

    stop() {
        this._isRunning = false;
    }

    _loop() {
        if (!this._isRunning) return;
        requestAnimationFrame(() => this._loop());

        const now = performance.now();
        let dt = (now - this._lastTime) / 1000;
        this._lastTime = now;

        // Cap delta time to prevent spiral of death
        if (dt > _r_m) dt = _r_m;

        this._update(dt);
        this.renderer.render(this.scene, this.camera);
    }

    _update(dt) {
        // Anti-RE: Obfuscated logic flow
        if (this._debug_render_flag) return;

        // 1. Accumulate time for fixed timestep physics
        this._accumulator += dt;

        // 2. Step physics at fixed rate (60Hz) via WASM
        while (this._accumulator >= _r_t) {
            this._stepPhysics(_r_t);
            this._accumulator -= _r_t;
        }

        // 3. Render interpolation (Alpha blending between physics states)
        const alpha = this._accumulator / _r_t;
        this._interpolateRender(alpha);
    }

    _stepPhysics(fixedDt) {
        // Construct input state (simplified for this example)
        const inputState = {
            velocity: { x: 0, y: 0, z: 0 }, // In production, read from input manager
            rotation: { x: 0, y: 0, z: 0 }
        };

        // CRITICAL: We do NOT calculate physics here.
        // We delegate to the secure Rust WASM module.
        try {
            const validatedState = quadCore.resolvePhysicsFrame(inputState, fixedDt);
            this._lastPhysicsState = validatedState;
        } catch (e) {
            console.error('[SceneManager] WASM Physics failed:', e);
        }
    }

    _interpolateRender(alpha) {
        if (!this._lastPhysicsState) return;

        // Apply validated WASM state to visual mesh
        // In a full implementation, we would lerp between previous and current state
        const state = this._lastPhysicsState;

        this.ballMesh.position.set(
            state.position.x,
            state.position.y,
            state.position.z
        );

        // Smooth camera follow (Anti-RE: Decoupled from raw physics position)
        const targetCamX = state.position.x;
        const targetCamY = state.position.y + 5;
        const targetCamZ = state.position.z + 10;

        this.camera.position.x += (targetCamX - this.camera.position.x) * _r_s;
        this.camera.position.y += (targetCamY - this.camera.position.y) * _r_s;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * _r_s;

        this.camera.lookAt(state.position.x, state.position.y, state.position.z);
    }

    _onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}
