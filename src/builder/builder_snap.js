/*
 Builder Snap System.
 Handles grid snapping, connection-point matching, and part placement validation.
 Used by builder_scene.js to determine valid placement positions.
*/

import * as THREE from 'three';
import { getPartDef } from './catalog.js';

/** Snap distance threshold — two connection points within this distance will snap together. */
const SNAP_THRESHOLD = 2.5;

/** Grid size for free placement (no connection-point match). */
const GRID_SIZE = 1.0;

/**
 * Given a world position, snap it to the closest grid point.
 */
export function snapToGrid(position) {
    return new THREE.Vector3(
        Math.round(position.x / GRID_SIZE) * GRID_SIZE,
        position.y, // Y is free (height adjustment)
        Math.round(position.z / GRID_SIZE) * GRID_SIZE
    );
}

/**
 * Find the closest connection point among all placed parts to a given world position.
 * Returns { part, connPt, worldPos, distance } or null.
 */
export function findClosestConnPt(worldPos, placedParts) {
    let best = null;
    let bestDist = SNAP_THRESHOLD;

    for (const placed of placedParts) {
        const def = getPartDef(placed.partKey);
        if (!def || !def.connPts) continue;

        for (const cp of def.connPts) {
            // Transform local connection-point to world space
            const worldCP = new THREE.Vector3(cp.x, cp.y, cp.z)
                .applyEuler(new THREE.Euler(0, placed.rotation || 0, 0))
                .add(new THREE.Vector3(placed.x, placed.y, placed.z));

            const dist = worldPos.distanceTo(worldCP);
            if (dist < bestDist) {
                bestDist = dist;
                best = { part: placed, connPt: cp, worldPos: worldCP, distance: dist };
            }
        }
    }
    return best;
}

/**
 * Compute the placement position for a new part given a mouse-ray intersection point
 * and the list of already-placed parts.
 *
 * Returns { position: THREE.Vector3, snapped: boolean, snapTarget: object|null }
 */
export function computePlacement(rayHitPos, placedParts, partDef) {
    // First try connection-point snapping
    const snap = findClosestConnPt(rayHitPos, placedParts);
    if (snap && partDef && partDef.connPts && partDef.connPts.length > 0) {
        // Find the "front" connection point of the part being placed
        const frontCP = partDef.connPts.find(cp => cp.dir === 'front')
            || partDef.connPts[0];

        // Position the new part so that its front connection point aligns
        // with the snapped world connection point
        const pos = snap.worldPos.clone();
        // Offset by the inverse of the new part's front connection point
        pos.x -= frontCP.x;
        pos.y -= frontCP.y;
        pos.z -= frontCP.z;

        // Align rotation so the part faces the snap direction
        // The new part's front (-Z) should face the snap target
        const snapDir = snap.connPt.dir;
        const rotation = getSnapRotation(snapDir, frontCP.dir);

        return {
            position: snapToGrid(pos),
            rotation,
            snapped: true,
            snapTarget: snap
        };
    }

    // Fall back to grid snapping
    return {
        position: snapToGrid(rayHitPos),
        rotation: 0,
        snapped: false,
        snapTarget: null
    };
}

/**
 * Determine the Y rotation (in radians) so that the new part's `newPartDir`
 * faces the `snapTargetDir`.
 */
function getSnapRotation(snapTargetDir, newPartDir) {
    // The snap target's connection point faces AWAY from the existing part.
    // We want the new part to extend AWAY from the connection point =
    // the new part's front (-Z) should face the OPPOSITE of the snap target's direction.
    //
    // newPartDir indicates which face of the new part connects to the snap point.
    // We combine both directions to determine the final Y rotation.
    const baseRotation = {
        'front': Math.PI,
        'back': 0,
        'left': -Math.PI / 2,
        'right': Math.PI / 2
    }[snapTargetDir] || 0;

    // Offset by the new part's connection face direction
    const partOffset = {
        'front': 0,
        'back': Math.PI,
        'left': Math.PI / 2,
        'right': -Math.PI / 2
    }[newPartDir] || 0;

    return normalizeAngle(baseRotation + partOffset);
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

/**
 * Create a visual preview ghost mesh for the currently selected part type.
 * Returns a semi-transparent mesh showing where the part will be placed.
 */
export function createPreviewGhost(partDef, position, rotationY) {
    if (!partDef) return null;

    const group = new THREE.Group();
    const d = partDef.defaults;

    switch (partDef.key) {
        case 'platform':
        case 'speed_strip':
        case 'finish_line': {
            const geo = new THREE.BoxGeometry(d.width || 8, 1, d.length || 15);
            const mat = new THREE.MeshPhongMaterial({
                color: partDef.key === 'speed_strip' ? 0xffff00 :
                       partDef.key === 'finish_line' ? 0x00ff00 : 0x88aacc,
                transparent: true,
                opacity: 0.4,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, -0.5, 0);
            group.add(mesh);
            break;
        }
        case 'ramp': {
            const h = d.height || 5;
            const l = d.length || 15;
            const angle = Math.atan2(h, l);
            const rampLen = Math.sqrt(l * l + h * h);
            const geo = new THREE.BoxGeometry(d.width || 8, 1, rampLen);
            const mat = new THREE.MeshPhongMaterial({
                color: 0x88ccaa,
                transparent: true,
                opacity: 0.4,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, h / 2 - 0.5, -l / 2);
            mesh.rotation.set(angle, 0, 0);
            group.add(mesh);
            break;
        }
        case 'glass_platform': {
            const geo = new THREE.BoxGeometry(d.width || 6, 0.8, d.length || 14);
            const mat = new THREE.MeshPhongMaterial({
                color: 0xddeeff,
                transparent: true,
                opacity: 0.2,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, -0.4, 0);
            group.add(mesh);
            break;
        }
        case 'wall': {
            const geo = new THREE.BoxGeometry(d.width || 1, 4, d.length || 20);
            const mat = new THREE.MeshPhongMaterial({
                color: 0x666666,
                transparent: true,
                opacity: 0.3,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            group.add(mesh);
            break;
        }
        case 'tunnel_walls': {
            const w = d.width || 8;
            const l = d.length || 30;
            const wallGeo = new THREE.BoxGeometry(0.2, 2, l);
            const mat = new THREE.MeshPhongMaterial({
                color: 0x666666,
                transparent: true,
                opacity: 0.3,
                depthWrite: false
            });
            const left = new THREE.Mesh(wallGeo, mat);
            left.position.set(-w / 2 - 0.1, 1, 0);
            const right = new THREE.Mesh(wallGeo, mat);
            right.position.set(w / 2 + 0.1, 1, 0);
            group.add(left, right);
            break;
        }
        case 'pendulum': {
            const geo = new THREE.SphereGeometry(1.6, 16, 16);
            const mat = new THREE.MeshPhongMaterial({
                color: 0xaa0000,
                transparent: true,
                opacity: 0.4,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, 3, 0);
            group.add(mesh);
            // Pivot indicator
            const pivotGeo = new THREE.SphereGeometry(0.2, 8, 8);
            const pivot = new THREE.Mesh(pivotGeo, mat);
            pivot.position.set(0, 8, 0);
            group.add(pivot);
            break;
        }
        case 'spinner': {
            const geo = new THREE.BoxGeometry(8, 0.3, 0.3);
            const mat = new THREE.MeshPhongMaterial({
                color: 0x0000ff,
                transparent: true,
                opacity: 0.4,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            group.add(mesh);
            break;
        }
        case 'hammer': {
            const geo = new THREE.BoxGeometry(5, 1.2, 1.2);
            const mat = new THREE.MeshPhongMaterial({
                color: 0xff4500,
                transparent: true,
                opacity: 0.4,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, 3, 0);
            mesh.rotation.set(Math.PI / 2, 0, 0);
            group.add(mesh);
            break;
        }
        case 'mover': {
            const geo = new THREE.BoxGeometry(d.width || 3, d.height || 1, d.depth || 2);
            const mat = new THREE.MeshPhongMaterial({
                color: 0xff4500,
                transparent: true,
                opacity: 0.4,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            group.add(mesh);
            break;
        }
        case 'blade': {
            const geo = new THREE.BoxGeometry(d.thickness || 0.12, d.length || 2, 0.08);
            const mat = new THREE.MeshPhongMaterial({
                color: 0x661111,
                emissive: 0x661111,
                transparent: true,
                opacity: 0.5,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, (d.length || 2) / 2, 0);
            group.add(mesh);
            break;
        }
        case 'coin_line': {
            // Single coin preview
            const geo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12);
            const mat = new THREE.MeshPhongMaterial({
                color: 0xffd700,
                transparent: true,
                opacity: 0.5,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = Math.PI / 2;
            mesh.position.set(0, 1, 0);
            group.add(mesh);
            break;
        }
        case 'checkpoint': {
            const geo = new THREE.BoxGeometry(0.2, 3, 0.2);
            const mat = new THREE.MeshPhongMaterial({
                color: 0x00ff88,
                transparent: true,
                opacity: 0.5,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, 1.5, 0);
            group.add(mesh);
            break;
        }
        case 'finish_model': {
            const geo = new THREE.BoxGeometry(8, 5, 1);
            const mat = new THREE.MeshPhongMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.3,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            group.add(mesh);
            break;
        }
        default: {
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const mat = new THREE.MeshPhongMaterial({
                color: 0xff00ff,
                transparent: true,
                opacity: 0.4,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            group.add(mesh);
        }
    }

    group.position.copy(position);
    group.rotation.y = rotationY;
    return group;
}
