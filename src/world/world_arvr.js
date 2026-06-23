/*
 World AR/VR Foundation.
 Provides hooks for augmented reality (mobile camera overlay) and
 virtual reality (WebXR headset) modes to view and interact with
 the world map and build sites in immersive ways.

 Modes:
   - AR Mode: Uses device camera + ARCore/ARKit via WebXR to place
     a miniature world map on a real-world surface, then lets users
     walk around it and tap sites to enter them.
   - VR Mode: Full immersive world map floating in 3D space.
   - Mobile Point Mode: On non-AR devices, shows a compass + GPS-style
     indicator pointing toward nearby claimed sites.

 All AR/VR features degrade gracefully — if WebXR is not available,
 the app falls back to the standard 2D map view.
*/

import * as THREE from 'three';
import { SITE_SIZE, siteToWorld } from './world_state.js';

/**
 * Check if WebXR immersive-ar is supported on this device.
 */
export function checkARSupport() {
    if (!navigator.xr) return false;
    // Synchronous check is limited; async is preferred
    return navigator.xr.isSessionSupported
        ? 'maybe' // need async check for real answer
        : false;
}

/**
 * Async check for AR/VR session support.
 * @returns {Promise<{ar: boolean, vr: boolean}>}
 */
export async function checkXRSupport() {
    const result = { ar: false, vr: false };
    if (!navigator.xr) return result;

    try {
        result.ar = await navigator.xr.isSessionSupported('immersive-ar');
    } catch (e) { result.ar = false; }

    try {
        result.vr = await navigator.xr.isSessionSupported('immersive-vr');
    } catch (e) { result.vr = false; }

    return result;
}

/**
 * Mobile Point Mode — compass + direction indicators
 * for non-AR devices to navigate between sites.
 */
export function createMobilePointers(game) {
    const container = document.createElement('div');
    container.id = 'world-mobile-pointers';
    container.style.cssText = `
        position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
        display:flex;gap:12px;z-index:10001;pointer-events:none;
        font-family:'Segoe UI',sans-serif;
    `;

    // Compass ring
    const compass = document.createElement('div');
    compass.id = 'world-compass';
    compass.style.cssText = `
        width:60px;height:60px;border-radius:50%;
        border:2px solid rgba(136,68,255,0.5);
        background:rgba(0,0,0,0.6);
        display:flex;align-items:center;justify-content:center;
        color:#9944ff;font-size:10px;font-weight:700;
        backdrop-filter:blur(4px);
    `;
    compass.innerText = 'N';
    container.appendChild(compass);

    // Direction arrows for neighboring sites
    const dirs = [
        { id: 'pointer-front', label: '▲', angle: 0 },
        { id: 'pointer-back',  label: '▼', angle: 180 },
        { id: 'pointer-left',  label: '◄', angle: -90 },
        { id: 'pointer-right', label: '►', angle: 90 }
    ];

    for (const d of dirs) {
        const arrow = document.createElement('div');
        arrow.id = d.id;
        arrow.style.cssText = `
            width:28px;height:28px;border-radius:50%;
            background:rgba(136,68,255,0.15);border:1px solid rgba(136,68,255,0.3);
            display:flex;align-items:center;justify-content:center;
            color:#9944ff;font-size:12px;
            transition:opacity 0.3s;opacity:0.3;
        `;
        arrow.innerText = d.label;
        container.appendChild(arrow);
    }

    return container;
}

/**
 * Update mobile pointer visibility based on neighboring site presence.
 */
export function updateMobilePointers(game) {
    const grid = game._worldGrid;
    if (!grid) return;

    const center = grid.viewCenter;
    const neighbors = [
        { id: 'pointer-front', col: center.col,     row: center.row - 1 },
        { id: 'pointer-back',  col: center.col,     row: center.row + 1 },
        { id: 'pointer-left',  col: center.col - 1, row: center.row     },
        { id: 'pointer-right', col: center.col + 1, row: center.row     }
    ];

    for (const n of neighbors) {
        const el = document.getElementById(n.id);
        if (!el) continue;
        const site = grid.getSite(n.col, n.row);
        el.style.opacity = site ? '1' : '0.2';
        if (site) {
            el.title = `Site (${n.col},${n.row}) — ${site.partCount || 0} parts`;
        }
    }
}

/**
 * AR Scene Manager.
 * Handles placing a miniature world map in AR space using WebXR.
 */
export class ARWorldManager {
    constructor(game) {
        this.game = game;
        this.session = null;
        this.xrScene = null;
        this.miniatureGroup = null;
        this.isActive = false;
        this.referenceSpace = null;
    }

    /**
     * Attempt to start an AR session.
     */
    async startAR() {
        if (!navigator.xr) {
            console.info('WebXR not available — AR mode disabled.');
            return false;
        }

        try {
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            if (!supported) {
                console.info('Immersive AR not supported on this device.');
                return false;
            }

            this.session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['hit-test', 'dom-overlay'],
                domOverlay: { root: document.getElementById('overlay') || document.body }
            });

            this.isActive = true;
            this.setupARScene();
            this.session.addEventListener('end', () => this.stopAR());

            console.info('AR session started.');
            return true;
        } catch (e) {
            console.warn('Failed to start AR session:', e);
            return false;
        }
    }

    /**
     * Set up the miniature world map for AR display.
     */
    setupARScene() {
        const grid = this.game._worldGrid;
        if (!grid) return;

        this.miniatureGroup = new THREE.Group();
        this.miniatureGroup.scale.setScalar(0.01); // 1:100 scale miniature

        const center = grid.viewCenter;
        const viewRadius = 4;

        // Create miniature site tiles
        for (let r = center.row - viewRadius; r <= center.row + viewRadius; r++) {
            for (let c = center.col - viewRadius; c <= center.col + viewRadius; c++) {
                const site = grid.getSite(c, r);
                const tileGeo = new THREE.BoxGeometry(SITE_SIZE * 0.9, 2, SITE_SIZE * 0.9);
                const tileMat = new THREE.MeshPhongMaterial({
                    color: site ? 0x9944ff : 0x333344,
                    transparent: true,
                    opacity: site ? 0.8 : 0.3
                });
                const tile = new THREE.Mesh(tileGeo, tileMat);
                tile.position.set(
                    (c - center.col) * SITE_SIZE,
                    0,
                    (r - center.row) * SITE_SIZE
                );
                this.miniatureGroup.add(tile);

                // Add marker for owned sites
                if (site && site.ownerId === grid.playerId) {
                    const markerGeo = new THREE.ConeGeometry(3, 6, 6);
                    const markerMat = new THREE.MeshPhongMaterial({ color: 0x44ff88, emissive: 0x003311 });
                    const marker = new THREE.Mesh(markerGeo, markerMat);
                    marker.position.set(
                        (c - center.col) * SITE_SIZE,
                        8,
                        (r - center.row) * SITE_SIZE
                    );
                    this.miniatureGroup.add(marker);
                }
            }
        }
    }

    /**
     * Stop the AR session.
     */
    stopAR() {
        if (this.session) {
            this.session.end().catch(() => {});
            this.session = null;
        }
        this.isActive = false;
        this.miniatureGroup = null;
        console.info('AR session stopped.');
    }
}

/**
 * VR World Viewer.
 * Full immersive 3D world map experience.
 */
export class VRWorldManager {
    constructor(game) {
        this.game = game;
        this.session = null;
        this.isActive = false;
    }

    /**
     * Attempt to start a VR session.
     */
    async startVR() {
        if (!navigator.xr) return false;

        try {
            const supported = await navigator.xr.isSessionSupported('immersive-vr');
            if (!supported) {
                console.info('Immersive VR not supported.');
                return false;
            }

            this.session = await navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor', 'bounded-floor']
            });

            this.isActive = true;
            this.session.addEventListener('end', () => this.stopVR());
            console.info('VR session started.');
            return true;
        } catch (e) {
            console.warn('Failed to start VR session:', e);
            return false;
        }
    }

    /**
     * Stop the VR session.
     */
    stopVR() {
        if (this.session) {
            this.session.end().catch(() => {});
            this.session = null;
        }
        this.isActive = false;
    }
}

/**
 * Initialize AR/VR support checks and return available modes.
 */
export async function initARVR(game) {
    const support = await checkXRSupport();

    game._arvrSupport = support;
    game._arManager = support.ar ? new ARWorldManager(game) : null;
    game._vrManager = support.vr ? new VRWorldManager(game) : null;

    // Create mobile pointers for non-AR devices
    if (!support.ar) {
        const pointers = createMobilePointers(game);
        document.body.appendChild(pointers);
        game._mobilePointers = pointers;
    }

    return support;
}

/**
 * Dispose AR/VR resources.
 */
export function disposeARVR(game) {
    if (game._arManager) game._arManager.stopAR();
    if (game._vrManager) game._vrManager.stopVR();
    if (game._mobilePointers && game._mobilePointers.parentNode) {
        game._mobilePointers.parentNode.removeChild(game._mobilePointers);
    }
}
