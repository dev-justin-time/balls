/**
 * =====================================================================
 * @domain:    builder
 * @concern:   3D Perspective Builder — free-rotating camera, orbit controls,
 *             ground-aware part placement, full 3D grid overlay
 * @created:   2026-06-26T00:00:00.000Z
 * @track:     b8d2e3f7-9c4a-4e11-a5d2-7f1e6c3b8a99
 * @version:   1.0.0
 * @security:  Client-Side (runtime placement; server validates via world_networking)
 * =====================================================================
 *
 * 3D Perspective Builder.
 * Alternative to the orthographic top-down builder (builder_scene.js).
 * Uses a free-rotating PerspectiveCamera with orbit-style controls so you
 * can view your track from any angle while building.
 *
 * Controls:
 *   Left-click-drag: Rotate orbit around focal point
 *   Right-click-drag: Pan the focal point
 *   Scroll wheel: Zoom in/out
 *   Left-click: Place selected part on the ground plane
 *   Shift+Left-click: Delete nearest placed part
 *   R key: Reset camera to default view
 *   F key: Focus camera on selected/center area
 */

import * as THREE from 'three';
import { computePlacement, createPreviewGhost } from './builder_snap.js';
import { getPartDef } from './catalog.js';
import { placePart } from './builder_scene.js';
import { addBuilderXP } from './builder_xp.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default camera distance from focal point */
const DEFAULT_RADIUS = 35;
/** Minimum zoom distance */
const MIN_RADIUS = 5;
/** Maximum zoom distance */
const MAX_RADIUS = 120;
/** Orbit rotation speed factor */
const ORBIT_SPEED = 0.005;
/** Pan speed factor */
const PAN_SPEED = 0.06;
/** Zoom speed factor */
const ZOOM_SPEED = 0.08;

// ---------------------------------------------------------------------------
// Public: Initialize 3D Builder
// ---------------------------------------------------------------------------

/**
 * Initialize the 3D perspective builder scene.
 * Uses game._builderScene (shared with 2D builder) but replaces the camera
 * with a PerspectiveCamera and adds orbit controls state.
 *
 * @param {object} game - The game state object
 * @param {object} [opts]
 * @param {number} [opts.fov=60] - Camera field of view
 * @param {number} [opts.near=0.5] - Camera near plane
 * @param {number} [opts.far=800] - Camera far plane
 */
export function init3DBuilder(game, opts = {}) {
    // Reuse builder scene from the 2D builder (must be already initialized)
    if (!game._builderScene) {
        console.warn('[3DBuilder] _builderScene not initialized — call initBuilderScene first');
        return;
    }

    // Replace orthographic camera with perspective
    const aspect = window.innerWidth / window.innerHeight;
    game._builderCamera = new THREE.PerspectiveCamera(
        opts.fov || 60,
        aspect,
        opts.near || 0.5,
        opts.far || 800
    );

    // Orbit state — stored on game for persistence across mode switches
    game._builder3D = {
        // Camera focal point (what the orbit rotates around)
        focalPoint: new THREE.Vector3(0, 0, -30),
        // Spherical coordinates around focal point
        radius: DEFAULT_RADIUS,
        theta: Math.PI / 4,     // Azimuthal angle (horizontal rotation)
        phi: Math.PI / 3,       // Polar angle (vertical angle from top)
        // Input state
        isOrbiting: false,
        isPanning: false,
        orbitStart: { x: 0, y: 0 },
        panStart: { x: 0, y: 0 },
        focalBase: new THREE.Vector3(),
        // Smooth damping
        targetRadius: DEFAULT_RADIUS,
        targetTheta: Math.PI / 4,
        targetPhi: Math.PI / 3,
        targetFocal: new THREE.Vector3(0, 0, -30),
        // Helpers
        _dirty: true
    };

    // Initialize camera position
    _applyOrbitToCamera(game);

    // Resize handler for window changes while in 3D mode
    if (!game._builder3DResizeHandler) {
        game._builder3DResizeHandler = () => {
            if (!game._builderCamera || !game._builderIs3D) return;
            game._builderCamera.aspect = window.innerWidth / window.innerHeight;
            game._builderCamera.updateProjectionMatrix();
        };
        window.addEventListener('resize', game._builder3DResizeHandler);
    }

    // Ensure 3D grid exists (larger than 2D grid)
    if (!game._builderGrid3D) {
        game._builderGrid3D = _create3DGrid(160);
        game._builderScene.add(game._builderGrid3D);
    }

    // Ground plane for raycasting (at y=0)
    game._builderGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Height planes for stacking (incremental y levels)
    game._builderHeightPlanes = [game._builderGroundPlane];

    // Raycaster
    game._builderRaycaster = new THREE.Raycaster();
    game._builderRaycaster.far = 300;
    game._builderMouse = new THREE.Vector2();

    // Ensure undo stack exists
    if (!game._builderUndoStack) game._builderUndoStack = [];
}

// ---------------------------------------------------------------------------
// Public: Camera Updates (called from main.js event handlers)
// ---------------------------------------------------------------------------

/**
 * Handle mouse down — start orbit or pan.
 * Left button = orbit, Right button = pan.
 */
export function on3DBuilderMouseDown(game, clientX, clientY, button) {
    if (!game._builder3D) return;

    game._builder3D._didDrag = false; // Reset drag flag on each mousedown

    if (button === 0) { // Left button — orbit
        game._builder3D.isOrbiting = true;
        game._builder3D.orbitStart = { x: clientX, y: clientY };
        game._builder3D.targetTheta = game._builder3D.theta;
        game._builder3D.targetPhi = game._builder3D.phi;
    } else if (button === 2) { // Right button — pan
        game._builder3D.isPanning = true;
        game._builder3D.panStart = { x: clientX, y: clientY };
        game._builder3D.focalBase.copy(game._builder3D.targetFocal);
    }
}

/**
 * Handle mouse move — update orbit/pan or placement preview.
 */
export function on3DBuilderMouseMove(game, clientX, clientY) {
    if (!game._builder3D) return;

    const b3d = game._builder3D;

    // Orbit
    if (b3d.isOrbiting) {
        const dx = clientX - b3d.orbitStart.x;
        const dy = clientY - b3d.orbitStart.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) b3d._didDrag = true;
        b3d.targetTheta -= dx * ORBIT_SPEED;
        b3d.targetPhi -= dy * ORBIT_SPEED;
        // Clamp phi to prevent flipping
        b3d.targetPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, b3d.targetPhi));
        b3d.orbitStart = { x: clientX, y: clientY };
        b3d._dirty = true;
        return;
    }

    // Pan
    if (b3d.isPanning) {
        const dx = clientX - b3d.panStart.x;
        const dy = clientY - b3d.panStart.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) b3d._didDrag = true;
        const zoomFactor = b3d.radius / DEFAULT_RADIUS;

        // Compute camera-relative right and forward directions
        const camera = game._builderCamera;
        const right = new THREE.Vector3();
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        // Project forward onto XZ plane
        forward.y = 0;
        forward.normalize();

        b3d.targetFocal.copy(b3d.focalBase)
            .addScaledVector(right, -dx * PAN_SPEED * zoomFactor)
            .addScaledVector(forward, dy * PAN_SPEED * zoomFactor);
        b3d._dirty = true;
        return;
    }

    // Placement preview (only when not orbiting/panning)
    _updatePlacementPreview(game, clientX, clientY);
}

/**
 * Handle mouse up — end orbit or pan.
 */
export function on3DBuilderMouseUp(game) {
    if (!game._builder3D) return;
    game._builder3D.isOrbiting = false;
    game._builder3D.isPanning = false;
}

/**
 * Handle mouse wheel — zoom.
 */
export function on3DBuilderWheel(game, deltaY) {
    if (!game._builder3D) return;
    const b3d = game._builder3D;
    b3d.targetRadius += deltaY * ZOOM_SPEED;
    b3d.targetRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, b3d.targetRadius));
    b3d._dirty = true;
}

/**
 * Handle key presses — camera shortcuts.
 */
export function on3DBuilderKeyDown(game, key) {
    if (!game._builder3D) return;
    const b3d = game._builder3D;

    switch (key.toLowerCase()) {
        case 'r':
            // Reset camera
            b3d.targetRadius = DEFAULT_RADIUS;
            b3d.targetTheta = Math.PI / 4;
            b3d.targetPhi = Math.PI / 3;
            b3d.targetFocal.set(0, 0, -30);
            b3d._dirty = true;
            break;
        case 'f':
            // Focus on center of placed parts
            _focusOnParts(game);
            break;
        case 't':
            // Top-down view
            b3d.targetPhi = 0.05;
            b3d.targetTheta = b3d.theta;
            b3d._dirty = true;
            break;
        case 'g':
            // Ground-level view
            b3d.targetPhi = Math.PI / 2 - 0.1;
            b3d._dirty = true;
            break;
    }
}

/**
 * Handle click — place part or delete part.
 */
export function on3DBuilderClick(game, clientX, clientY, shiftKey) {
    if (!game._builder3D || !game._builderScene) return;
    if (game._builder3D._didDrag) return; // Suppress click after drag (orbit/pan)

    // Check if we were orbiting (ignore clicks after drag)
    // [AI NOTE: Retained for context stability — drag detection handled upstream]

    if (shiftKey) {
        _deletePartAtCursor(game, clientX, clientY);
        return;
    }

    if (!game._builderPendingPos) return;

    const pos = game._builderPendingPos.position;
    const rot = game._builderPendingPos.rotation || 0;

    placePart(game, game._builderSelectedKey, pos.x, pos.y, pos.z, rot);
}

// ---------------------------------------------------------------------------
// Public: Render Update (called each frame from animation loop)
// ---------------------------------------------------------------------------

/**
 * Update the 3D builder each frame — smooth camera interpolation.
 */
export function update3DBuilder(game) {
    if (!game._builder3D) return;
    const b3d = game._builder3D;

    // Smooth interpolation (lerp toward targets)
    const lerpFactor = 0.15;
    b3d.radius += (b3d.targetRadius - b3d.radius) * lerpFactor;
    b3d.theta += (b3d.targetTheta - b3d.theta) * lerpFactor;
    b3d.phi += (b3d.targetPhi - b3d.phi) * lerpFactor;
    b3d.focalPoint.lerp(b3d.targetFocal, lerpFactor);

    _applyOrbitToCamera(game);
    b3d._dirty = false;
}

/**
 * Render the builder scene.
 */
export function render3DBuilder(game) {
    if (!game._builderScene || !game._builderCamera) return;
    game.renderer.render(game._builderScene, game._builderCamera);
}

// ---------------------------------------------------------------------------
// Public: Mode Switching
// ---------------------------------------------------------------------------

/**
 * Activate 3D mode (call when toggling from 2D to 3D).
 * Also wires mouse/keyboard event listeners for orbit + placement.
 */
export function activate3DMode(game) {
    if (!game._builder3D) {
        init3DBuilder(game);
    }

    // Hide 2D grid, show 3D grid
    if (game._builderGrid) game._builderGrid.visible = false;
    if (game._builderGrid3D) game._builderGrid3D.visible = true;

    game._builderIs3D = true;

    // Wire 3D builder event listeners (auto-removed in activate2DMode)
    _wire3DEvents(game);
}

/**
 * Activate 2D mode (call when toggling from 3D to 2D).
 * Removes 3D event listeners.
 */
export function activate2DMode(game) {
    // Hide 3D grid, show 2D grid
    if (game._builderGrid3D) game._builderGrid3D.visible = false;
    if (game._builderGrid) game._builderGrid.visible = true;

    game._builderIs3D = false;

    // Remove 3D event listeners
    _unwire3DEvents(game);
}

// ---------------------------------------------------------------------------
// Private: Camera Math
// ---------------------------------------------------------------------------

/**
 * Apply spherical coordinates to the camera.
 */
function _applyOrbitToCamera(game) {
    const b3d = game._builder3D;
    const camera = game._builderCamera;

    // Spherical → Cartesian conversion
    const r = b3d.radius;
    const theta = b3d.theta;
    const phi = b3d.phi;

    const x = b3d.focalPoint.x + r * Math.sin(phi) * Math.cos(theta);
    const y = b3d.focalPoint.y + r * Math.cos(phi);
    const z = b3d.focalPoint.z + r * Math.sin(phi) * Math.sin(theta);

    camera.position.set(x, y, z);
    camera.lookAt(b3d.focalPoint);
}

// ---------------------------------------------------------------------------
// Private: Placement Preview
// ---------------------------------------------------------------------------

/**
 * Raycast from cursor to the ground plane and update placement preview.
 */
function _updatePlacementPreview(game, clientX, clientY) {
    const partDef = getPartDef(game._builderSelectedKey);
    if (!partDef) return;

    // Convert screen coords to NDC
    game._builderMouse.x = (clientX / window.innerWidth) * 2 - 1;
    game._builderMouse.y = -(clientY / window.innerHeight) * 2 + 1;

    game._builderRaycaster.setFromCamera(game._builderMouse, game._builderCamera);

    // Raycast against ground plane
    const hitPoint = new THREE.Vector3();
    const hit = game._builderRaycaster.ray.intersectPlane(game._builderGroundPlane, hitPoint);

    if (hit) {
        const snapResult = computePlacement(hitPoint, game._builderPlacedParts, partDef);
        _update3DPreviewGhost(game, snapResult.position, snapResult.rotation);
        game._builderPendingPos = snapResult;
    } else {
        // Disable preview when not on ground
        if (game._builderPreview) game._builderPreview.visible = false;
        game._builderPendingPos = null;
    }
}

/**
 * Update the 3D preview ghost (reuses the same preview from 2D builder).
 */
function _update3DPreviewGhost(game, position, rotationY) {
    if (!game._builderPreview) return;
    const partDef = getPartDef(game._builderSelectedKey);
    if (!partDef) {
        game._builderPreview.visible = false;
        return;
    }

    // Rebuild ghost
    while (game._builderPreview.children.length > 0) {
        const child = game._builderPreview.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        game._builderPreview.remove(child);
    }

    const ghost = createPreviewGhost(partDef, position, rotationY);
    if (ghost) {
        game._builderPreview.add(ghost);
        game._builderPreview.position.set(0, 0, 0);
        game._builderPreview.visible = true;
    } else {
        game._builderPreview.visible = false;
    }
}

// ---------------------------------------------------------------------------
// Private: Hover Highlight
// ---------------------------------------------------------------------------

/**
 * Highlight the nearest placed part in the 3D scene when cursor hovers near it.
 */
function _update3DHoverHighlight(game) {
    if (!game._builderPlacedParts || game._builderPlacedParts.length === 0) {
        _remove3DHighlight(game);
        return;
    }

    // Find closest placed part mesh to the cursor ray hit
    if (!game._builderPendingPos) {
        _remove3DHighlight(game);
        return;
    }

    const hitPoint = game._builderPendingPos.position;
    let closestPlaced = null;
    let closestDist = Infinity;

    for (const placed of game._builderPlacedParts) {
        if (!placed.meshes) continue;
        for (const mesh of placed.meshes) {
            const cp = new THREE.Vector3();
            mesh.getWorldPosition(cp);
            const d = hitPoint.distanceToSquared(cp);
            if (d < closestDist) {
                closestDist = d;
                closestPlaced = placed;
            }
        }
    }

    const threshold = 100;
    if (!closestPlaced || closestDist > threshold) {
        _remove3DHighlight(game);
        return;
    }

    if (game._builderHovered === closestPlaced) return;

    _remove3DHighlight(game);

    // Create wireframe highlight
    game._builderHighlightGroup = new THREE.Group();
    for (const mesh of closestPlaced.meshes) {
        if (!mesh.geometry) continue;
        const edgeGeo = new THREE.EdgesGeometry(mesh.geometry);
        const edgeMat = new THREE.LineBasicMaterial({
            color: 0xffcc00,
            transparent: true,
            opacity: 0.9,
            depthTest: false
        });
        const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLine.position.copy(mesh.position);
        edgeLine.rotation.copy(mesh.rotation);
        edgeLine.scale.copy(mesh.scale).multiplyScalar(1.05);
        game._builderHighlightGroup.add(edgeLine);
    }
    game._builderScene.add(game._builderHighlightGroup);
    game._builderHovered = closestPlaced;
}

function _remove3DHighlight(game) {
    if (game._builderHighlightGroup) {
        game._builderScene.remove(game._builderHighlightGroup);
        game._builderHighlightGroup.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
        game._builderHighlightGroup = null;
        game._builderHovered = null;
    }
}

// ---------------------------------------------------------------------------
// Private: Delete Part
// ---------------------------------------------------------------------------

function _deletePartAtCursor(game, clientX, clientY) {
    if (!game._builderPlacedParts || game._builderPlacedParts.length === 0) return;

    const mouse = new THREE.Vector2(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, game._builderCamera);

    const meshes = [];
    for (const placed of game._builderPlacedParts) {
        if (placed.meshes) {
            for (const mesh of placed.meshes) meshes.push(mesh);
        }
    }

    const hits = raycaster.intersectObjects(meshes);
    if (hits.length === 0) return;

    const hitMesh = hits[0].object;

    for (let i = game._builderPlacedParts.length - 1; i >= 0; i--) {
        const placed = game._builderPlacedParts[i];
        if (placed.meshes && placed.meshes.includes(hitMesh)) {
            game._builderUndoStack.push([...game._builderPlacedParts.map(p => ({ ...p }))]);

            for (const mesh of placed.meshes) {
                game._builderScene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
            }
            game._builderPlacedParts.splice(i, 1);

            if (game._builderSyncRemove) game._builderSyncRemove(placed);
            break;
        }
    }

    _remove3DHighlight(game);
}

// ---------------------------------------------------------------------------
// Private: Focus Camera
// ---------------------------------------------------------------------------

function _focusOnParts(game) {
    const b3d = game._builder3D;
    if (!b3d) return;

    const parts = game._builderPlacedParts;
    if (!parts || parts.length === 0) {
        // Focus on origin
        b3d.targetFocal.set(0, 0, -30);
        b3d._dirty = true;
        return;
    }

    // Compute bounding box center
    const center = new THREE.Vector3();
    let count = 0;
    for (const placed of parts) {
        if (placed.meshes) {
            for (const mesh of placed.meshes) {
                const cp = new THREE.Vector3();
                mesh.getWorldPosition(cp);
                center.add(cp);
                count++;
            }
        }
    }

    if (count > 0) {
        center.divideScalar(count);
        b3d.targetFocal.copy(center);
        b3d.targetRadius = DEFAULT_RADIUS;
        b3d._dirty = true;
    }
}

// ---------------------------------------------------------------------------
// Private: 3D Grid
// ---------------------------------------------------------------------------

function _create3DGrid(size) {
    const group = new THREE.Group();
    const half = size / 2;
    const step = 2;
    const color = 0x334466;

    // Fine grid lines on XZ plane
    const points = [];
    for (let i = -half; i <= half; i += step) {
        points.push(new THREE.Vector3(i, 0.01, -half));
        points.push(new THREE.Vector3(i, 0.01, half));
        points.push(new THREE.Vector3(-half, 0.01, i));
        points.push(new THREE.Vector3(half, 0.01, i));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.15,
        depthTest: true
    });
    group.add(new THREE.LineSegments(geo, mat));

    // Major grid lines every 10 units
    const majorPoints = [];
    for (let i = -half; i <= half; i += 10) {
        majorPoints.push(new THREE.Vector3(i, 0.02, -half));
        majorPoints.push(new THREE.Vector3(i, 0.02, half));
        majorPoints.push(new THREE.Vector3(-half, 0.02, i));
        majorPoints.push(new THREE.Vector3(half, 0.02, i));
    }
    const majorGeo = new THREE.BufferGeometry().setFromPoints(majorPoints);
    const majorMat = new THREE.LineBasicMaterial({
        color: 0x556688,
        transparent: true,
        opacity: 0.35,
        depthTest: true
    });
    group.add(new THREE.LineSegments(majorGeo, majorMat));

    // Origin cross
    const originPoints = [
        new THREE.Vector3(0, 0.05, -2), new THREE.Vector3(0, 0.05, 2),
        new THREE.Vector3(-2, 0.05, 0), new THREE.Vector3(2, 0.05, 0)
    ];
    const originGeo = new THREE.BufferGeometry().setFromPoints(originPoints);
    const originMat = new THREE.LineBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.6,
        depthTest: true
    });
    group.add(new THREE.LineSegments(originGeo, originMat));

    return group;
}

// ---------------------------------------------------------------------------
// Public: Dispose
// ---------------------------------------------------------------------------

/**
 * Clean up the 3D builder.
 */
export function dispose3DBuilder(game) {
    _unwire3DEvents(game);
    if (game._builder3DResizeHandler) {
        window.removeEventListener('resize', game._builder3DResizeHandler);
        game._builder3DResizeHandler = null;
    }
    if (game._builderGrid3D) {
        game._builderScene.remove(game._builderGrid3D);
        game._builderGrid3D.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
        game._builderGrid3D = null;
    }
    game._builder3D = null;
}

// ---------------------------------------------------------------------------
// Private: Event Wiring (auto-wired when 3D mode activates)
// ---------------------------------------------------------------------------

let _3DListenersWired = false;

function _wire3DEvents(game) {
    if (_3DListenersWired) return;

    game._builder3D_onMouseDown = (e) => {
        if (!game._builderActive || !game._builderIs3D) return;
        if (e.target.closest && (e.target.closest('#builder-sidebar') || e.target.closest('#top-menu') || e.target.closest('.modal'))) return;
        e.preventDefault();
        on3DBuilderMouseDown(game, e.clientX, e.clientY, e.button);
    };

    game._builder3D_onMouseMove = (e) => {
        if (!game._builderActive || !game._builderIs3D) return;
        on3DBuilderMouseMove(game, e.clientX, e.clientY);
    };

    game._builder3D_onMouseUp = (e) => {
        if (!game._builderActive || !game._builderIs3D) return;
        on3DBuilderMouseUp(game);
    };

    game._builder3D_onClick = (e) => {
        if (!game._builderActive || !game._builderIs3D) return;
        if (e.target.closest && (e.target.closest('#builder-sidebar') || e.target.closest('#top-menu') || e.target.closest('.modal'))) return;
        on3DBuilderClick(game, e.clientX, e.clientY, e.shiftKey);
    };

    game._builder3D_onWheel = (e) => {
        if (!game._builderActive || !game._builderIs3D) return;
        e.preventDefault();
        on3DBuilderWheel(game, e.deltaY);
    };

    game._builder3D_onKeyDown = (e) => {
        if (!game._builderActive || !game._builderIs3D) return;
        on3DBuilderKeyDown(game, e.key);
    };

    game._builder3D_onContextMenu = (e) => {
        if (!game._builderActive || !game._builderIs3D) return;
        e.preventDefault(); // Block right-click menu in 3D builder
    };

    window.addEventListener('mousedown', game._builder3D_onMouseDown);
    window.addEventListener('mousemove', game._builder3D_onMouseMove);
    window.addEventListener('mouseup', game._builder3D_onMouseUp);
    window.addEventListener('click', game._builder3D_onClick);
    window.addEventListener('wheel', game._builder3D_onWheel, { passive: false });
    window.addEventListener('keydown', game._builder3D_onKeyDown);
    window.addEventListener('contextmenu', game._builder3D_onContextMenu);

    _3DListenersWired = true;
}

function _unwire3DEvents(game) {
    if (!_3DListenersWired) return;

    if (game._builder3D_onMouseDown) window.removeEventListener('mousedown', game._builder3D_onMouseDown);
    if (game._builder3D_onMouseMove) window.removeEventListener('mousemove', game._builder3D_onMouseMove);
    if (game._builder3D_onMouseUp) window.removeEventListener('mouseup', game._builder3D_onMouseUp);
    if (game._builder3D_onClick) window.removeEventListener('click', game._builder3D_onClick);
    if (game._builder3D_onWheel) window.removeEventListener('wheel', game._builder3D_onWheel);
    if (game._builder3D_onKeyDown) window.removeEventListener('keydown', game._builder3D_onKeyDown);
    if (game._builder3D_onContextMenu) window.removeEventListener('contextmenu', game._builder3D_onContextMenu);

    game._builder3D_onMouseDown = null;
    game._builder3D_onMouseMove = null;
    game._builder3D_onMouseUp = null;
    game._builder3D_onClick = null;
    game._builder3D_onWheel = null;
    game._builder3D_onKeyDown = null;
    game._builder3D_onContextMenu = null;

    _3DListenersWired = false;
}
