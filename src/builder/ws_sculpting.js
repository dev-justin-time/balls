// ws_sculpting.js
import * as THREE from "three";
import { selection } from "./ws_selection.js";

/**
 * Applies a sculpting brush effect to a mesh's vertices.
 * @param {THREE.Mesh} mesh - The target mesh.
 * @param {THREE.Vector3} point - The world-space position of the brush center.
 * @param {THREE.Vector3} normal - The world-space normal at the brush center (used for grab/inflate).
 * @param {number} radius - The radius of the brush influence.
 * @param {number} strength - The strength/intensity of the brush (0 to 1).
 * @param {string} toolType - 'grab', 'inflate', 'pinch', 'flatten', or 'smooth'.
 */
export function applySculptTool(mesh, point, normal, radius, strength, toolType) {
    if (!mesh || !mesh.geometry) return;

    const pos = mesh.geometry.attributes.position;
    if (!pos) return;

    // Reusable vectors to avoid garbage collection inside the loop
    const vertex = new THREE.Vector3();
    const localNormal = normal.clone();

    // Convert world point and normal to local space for accurate distance/direction
    const localPoint = mesh.worldToLocal(point.clone());

    // Transform normal to local space (ignore translation)
    const invMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    localNormal.transformDirection(invMatrix);
    localNormal.normalize();

    // Pre-calculate radius squared for faster distance checks
    const radiusSq = radius * radius;

    for (let i = 0; i < pos.count; i++) {
        // Optional: Only affect selected vertices if a selection exists
        if (selection.indices.size > 0 && !selection.indices.has(i)) continue;

        vertex.fromBufferAttribute(pos, i);

        // Use squared distance to avoid expensive Math.sqrt()
        const distSq = vertex.distanceToSquared(localPoint);

        if (distSq < radiusSq) {
            const dist = Math.sqrt(distSq);

            // Smooth quadratic falloff
            const falloff = 1 - (dist / radius);
            const influence = falloff * falloff * strength;

            switch (toolType) {
                case 'grab':
                case 'inflate':
                    // Move vertex along the local normal
                    vertex.addScaledVector(localNormal, influence);
                    break;

                case 'deflate':
                    // Move vertex opposite to the local normal
                    vertex.addScaledVector(localNormal, -influence);
                    break;

                case 'pinch':
                    // Pull vertices toward the brush center
                    vertex.lerp(localPoint, influence * 0.1);
                    break;

                case 'flatten': {
                    // Project vertex onto a plane defined by localPoint and localNormal
                    const dot = vertex.clone().sub(localPoint).dot(localNormal);
                    vertex.addScaledVector(localNormal, -dot * influence);
                    break;
                }

                default:
                    break;
            }

            // Write back the modified position
            pos.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
    }

    // Flag the geometry for GPU update and recalculate lighting normals
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
}

/**
 * Laplacian Smoothing: Averages each vertex with its neighbors.
 * @param {THREE.Mesh} mesh - The target mesh.
 * @param {number} iterations - Number of smoothing passes.
 * @param {number} factor - Blending factor (0 to 1).
 */
export function applySmoothTool(mesh, iterations = 1, factor = 0.5) {
    if (!mesh || !mesh.geometry) return;

    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;

    // Build adjacency map (which vertices are connected)
    const neighbors = new Map();
    const getNeighbors = (i) => {
        if (!neighbors.has(i)) neighbors.set(i, new Set());
        return neighbors.get(i);
    };

    if (index) {
        for (let i = 0; i < index.count; i += 3) {
            const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
            getNeighbors(a).add(b); getNeighbors(a).add(c);
            getNeighbors(b).add(a); getNeighbors(b).add(c);
            getNeighbors(c).add(a); getNeighbors(c).add(b);
        }
    } else {
        // For non-indexed geometry, assume every 3 vertices form a triangle
        for (let i = 0; i < pos.count; i += 3) {
            getNeighbors(i).add(i + 1); getNeighbors(i).add(i + 2);
            getNeighbors(i + 1).add(i); getNeighbors(i + 1).add(i + 2);
            getNeighbors(i + 2).add(i); getNeighbors(i + 2).add(i + 1);
        }
    }

    const tempPos = new Float32Array(pos.array.length);
    const avg = new THREE.Vector3();
    const current = new THREE.Vector3();

    for (let iter = 0; iter < iterations; iter++) {
        // Copy current positions to temp buffer
        for (let i = 0; i < pos.count; i++) {
            tempPos[i * 3]     = pos.getX(i);
            tempPos[i * 3 + 1] = pos.getY(i);
            tempPos[i * 3 + 2] = pos.getZ(i);
        }

        for (let i = 0; i < pos.count; i++) {
            // Only smooth selected vertices if a selection exists
            if (selection.indices.size > 0 && !selection.indices.has(i)) continue;

            const n = neighbors.get(i);
            if (!n || n.size === 0) continue;

            // Accumulate neighbor positions
            avg.set(0, 0, 0);
            for (const ni of n) {
                avg.x += tempPos[ni * 3];
                avg.y += tempPos[ni * 3 + 1];
                avg.z += tempPos[ni * 3 + 2];
            }
            avg.divideScalar(n.size);

            // Lerp current position toward average
            current.set(tempPos[i * 3], tempPos[i * 3 + 1], tempPos[i * 3 + 2]);
            current.lerp(avg, factor);

            pos.setXYZ(i, current.x, current.y, current.z);
        }
    }

    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
}
