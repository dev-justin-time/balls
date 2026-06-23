// ws_modifiers.js
import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { state } from "./ws_state.js";

// Hollow Out: Creates an inner shell and merges it (Visual hollow)
export function hollowOut(mesh, thickness = 0.1) {
    if (!mesh || !mesh.geometry) return;
    // TODO: wire into undo system
    state.lastOperation = 'hollowOut';

    // 1. Clone and scale down
    const innerGeo = mesh.geometry.clone();
    innerGeo.scale(1 - thickness, 1 - thickness, 1 - thickness);

    // 2. Invert normals (flip faces inward)
    if (innerGeo.index) {
        const idx = innerGeo.index.array;
        for (let i = 0; i < idx.length; i += 3) {
            const temp = idx[i];
            idx[i] = idx[i+2];
            idx[i+2] = temp;
        }
        innerGeo.index.needsUpdate = true;
    }
    innerGeo.computeVertexNormals();

    // 3. Merge outer and inner
    const mergeFn = BufferGeometryUtils.mergeGeometries || BufferGeometryUtils.mergeBufferGeometries;
    const merged = mergeFn([mesh.geometry, innerGeo]);

    mesh.geometry.dispose();
    mesh.geometry = merged;
    mesh.geometry.computeVertexNormals();
}

// Patch Hole: Fills a boundary loop with a triangle fan
export function patchHole(mesh, boundaryEdgeIndices) {
    if (!mesh || !mesh.geometry || boundaryEdgeIndices.length < 3) return;
    // TODO: wire into undo system
    state.lastOperation = 'patchHole';

    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index ? Array.from(mesh.geometry.index.array) : [];

    // Calculate centroid of the boundary
    const centroid = new THREE.Vector3();
    for (const i of boundaryEdgeIndices) {
        centroid.add(new THREE.Vector3().fromBufferAttribute(pos, i));
    }
    centroid.divideScalar(boundaryEdgeIndices.length);

    // Add centroid as a new vertex
    const newVertIdx = pos.count;
    const newPosArray = new Float32Array(pos.array.length + 3);
    newPosArray.set(pos.array);
    newPosArray.set([centroid.x, centroid.y, centroid.z], pos.array.length);

    const newPosAttr = new THREE.BufferAttribute(newPosArray, 3);

    // Create triangle fan from centroid to boundary edges
    for (let i = 0; i < boundaryEdgeIndices.length; i++) {
        const next = (i + 1) % boundaryEdgeIndices.length;
        index.push(boundaryEdgeIndices[i], boundaryEdgeIndices[next], newVertIdx);
    }

    // Rebuild geometry
    const newGeo = new THREE.BufferGeometry();
    newGeo.setAttribute('position', newPosAttr);
    newGeo.setIndex(index);
    newGeo.computeVertexNormals();

    mesh.geometry.dispose();
    mesh.geometry = newGeo;
}
