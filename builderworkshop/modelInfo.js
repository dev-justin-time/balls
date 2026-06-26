/**
 * =====================================================================
 * @domain:    workshop
 * @concern:   Model Info Panel — polygon count, material count, dimensions
 * @created:   2026-06-26T00:00:00.000Z
 * @track:     a1b2c3d4-e5f6-7890-abcd-ef1234567890
 * @version:   1.0.0
 * @security:  Client-Side (purely visual — no sensitive data)
 * =====================================================================
 *
 * Model Info Panel.
 * After loading a 3D model in the workshop, this module computes and
 * displays polygon counts (vertices/triangles), material counts, mesh counts,
 * and bounding-box dimensions (width, height, depth, volume).
 *
 * Also supports selective info updates when the user clicks on individual
 * meshes — showing per-mesh stats instead of whole-model stats.
 */

import * as THREE from 'three';
import { state } from './state.js';

/**
 * Compute detailed model statistics for a Three.js Object3D (scene root).
 *
 * @param {THREE.Object3D} root - The root object to analyze
 * @returns {{
 *   vertices: number,
 *   triangles: number,
 *   materials: number,
 *   meshes: number,
 *   width: number,
 *   height: number,
 *   depth: number,
 *   volume: number,
 *   maxDim: number
 * }}
 */
export function computeModelInfo(root) {
    let totalVertices = 0;
    let totalTriangles = 0;
    const materialSet = new Set();
    let meshCount = 0;

    root.traverse((child) => {
        if (!child.isMesh) return;

        meshCount++;
        const geo = child.geometry;

        // Count vertices
        if (geo) {
            const posAttr = geo.getAttribute('position');
            if (posAttr) {
                totalVertices += posAttr.count;
            }

            // Count triangles (faces × 3 for indexed, otherwise position count / 3)
            if (geo.index) {
                totalTriangles += geo.index.count / 3;
            } else if (posAttr) {
                totalTriangles += posAttr.count / 3;
            }
        }

        // Collect unique materials
        if (child.material) {
            if (Array.isArray(child.material)) {
                for (const mat of child.material) {
                    materialSet.add(mat.uuid || mat.name || 'unknown');
                }
            } else {
                materialSet.add(child.material.uuid || child.material.name || 'unknown');
            }
        }
    });

    // Compute bounding box dimensions (in world space, after auto-scale)
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());

    return {
        vertices: totalVertices,
        triangles: Math.round(totalTriangles),
        materials: materialSet.size,
        meshes: meshCount,
        width: size.x,
        height: size.y,
        depth: size.z,
        volume: size.x * size.y * size.z,
        maxDim: Math.max(size.x, size.y, size.z)
    };
}

/**
 * Compute per-mesh info for a single selected mesh.
 *
 * @param {THREE.Mesh} mesh
 * @returns {object|null}
 */
export function computeMeshInfo(mesh) {
    if (!mesh || !mesh.isMesh || !mesh.geometry) return null;

    const geo = mesh.geometry;
    const posAttr = geo.getAttribute('position');
    let tris = 0;
    let verts = posAttr ? posAttr.count : 0;

    if (geo.index) {
        tris = geo.index.count / 3;
    } else if (posAttr) {
        tris = posAttr.count / 3;
    }

    let matCount = 0;
    if (mesh.material) {
        matCount = Array.isArray(mesh.material) ? mesh.material.length : 1;
    }

    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());

    return {
        vertices: verts,
        triangles: Math.round(tris),
        materials: matCount,
        meshes: 1,
        width: size.x,
        height: size.y,
        depth: size.z,
        volume: size.x * size.y * size.z,
        maxDim: Math.max(size.x, size.y, size.z)
    };
}

/**
 * Show or hide the model info panel.
 *
 * @param {boolean} visible
 */
export function showModelInfo(visible) {
    const panel = document.getElementById('model-info-panel');
    if (panel) {
        if (visible) {
            panel.classList.remove('hidden');
            // Trigger entrance animation again
            panel.classList.remove('animate-in');
            void panel.offsetWidth; // Force reflow
            panel.classList.add('animate-in');
        } else {
            panel.classList.add('hidden');
        }
    }
}

/**
 * Update the model info panel with computed stats.
 *
 * @param {object} info - Result from computeModelInfo() or computeMeshInfo()
 */
export function updateModelInfoPanel(info) {
    if (!info) return;

    const formatDim = (v) => v >= 100 ? v.toFixed(0) : v.toFixed(2);

    const setEl = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setEl('info-polys',   typeof info.triangles === 'number' ? info.triangles.toLocaleString() : '—');
    setEl('info-verts',   typeof info.vertices === 'number' ? info.vertices.toLocaleString() : '—');
    setEl('info-mats',    typeof info.materials === 'number' ? String(info.materials) : '—');
    setEl('info-meshes',  typeof info.meshes === 'number' ? String(info.meshes) : '—');
    setEl('info-width',   typeof info.width === 'number'   ? formatDim(info.width) + ' u'  : '—');
    setEl('info-height',  typeof info.height === 'number'  ? formatDim(info.height) + ' u' : '—');
    setEl('info-depth',   typeof info.depth === 'number'   ? formatDim(info.depth) + ' u'  : '—');
    setEl('info-volume',  typeof info.volume === 'number'  ? formatDim(info.volume) + ' u³' : '—');
}

/**
 * Update the panel to show info for a selected mesh (or whole model if null).
 *
 * @param {THREE.Mesh|null} mesh - Selected mesh, or null for whole model
 * @param {object} modelInfo - Full model info from state.modelInfo (fallback)
 */
export function updateSelectionInfo(mesh, modelInfo) {
    if (mesh) {
        const info = computeMeshInfo(mesh);
        if (info) {
            updateModelInfoPanel(info);
            return;
        }
    }
    // Fall back to whole-model info
    if (modelInfo) {
        updateModelInfoPanel(modelInfo);
    }
}

/**
 * Zoom the camera to frame the loaded model (or selected mesh) in view.
 * Uses Box3 to compute bounding volume, then adjusts orbit controls target
 * and camera distance with a smooth animated transition.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {object} orbit - OrbitControls instance (must have .target and .update())
 * @param {THREE.Object3D} [targetRoot] - Object to frame (defaults to state.modelRoot)
 * @param {number} [paddingFactor=1.3] - Extra padding around the model (1.0 = tight)
 */
export function zoomToFit(camera, orbit, targetRoot, paddingFactor = 1.3) {
    const root = targetRoot || state.modelRoot;
    if (!root || !camera || !orbit) return;

    // Compute bounding box
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Compute distance needed to fit the box in the camera frustum
    // Per-axis: vertical (FOV) and horizontal (FOV × aspect)
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const vertDist  = (size.y / 2) / Math.tan(fovRad / 2);
    const horizDist = (size.x / 2) / Math.tan(fovRad / 2 * camera.aspect);
    const distance  = Math.max(vertDist, horizDist) * paddingFactor;

    // Animate orbit target to the box center
    const startTarget = orbit.target.clone();
    const endTarget = center.clone();

    // Compute camera position: offset from center along the current view direction
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    const endPosition = center.clone().addScaledVector(viewDir.clone().negate(), distance);

    const startPosition = camera.position.clone();
    const duration = 600; // ms
    const startTime = performance.now();

    function animateZoom(now) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        // Ease-out cubic
        const ease = 1 - Math.pow(1 - t, 3);

        orbit.target.lerpVectors(startTarget, endTarget, ease);
        camera.position.lerpVectors(startPosition, endPosition, ease);

        if (t < 1) {
            requestAnimationFrame(animateZoom);
        }
    }

    requestAnimationFrame(animateZoom);
}
