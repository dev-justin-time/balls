// ws_wireframeEditor.js
import * as THREE from "three";
import { selection } from "./ws_selection.js";

export function addTriangle(mesh, v1, v2, v3) {
    if (!mesh || !mesh.geometry) return;
    // Log context from the selection system for debugging
    if (selection) {
        const count = selection.indices ? selection.indices.size : 0;
        if (count === 0) console.info('addTriangle: adding face to unselected mesh', mesh.name);
    }
    const geo = mesh.geometry;

    // Ensure geometry has an index buffer
    if (!geo.index) {
        // Convert non-indexed to indexed
        const indices = [];
        for (let i = 0; i < geo.attributes.position.count; i++) indices.push(i);
        geo.setIndex(indices);
    }

    const indexArray = Array.from(geo.index.array);
    indexArray.push(v1, v2, v3);
    geo.setIndex(indexArray);
    geo.computeVertexNormals();
}

export function removeTriangle(mesh, faceIndex) {
    if (!mesh || !mesh.geometry || !mesh.geometry.index) return;
    const indexArray = Array.from(mesh.geometry.index.array);

    // Remove 3 indices starting at faceIndex * 3
    indexArray.splice(faceIndex * 3, 3);
    mesh.geometry.setIndex(indexArray);
    mesh.geometry.computeVertexNormals();
}

// Draw a custom line (cylinder) between two points
export function drawCustomLine(scene, v1World, v2World, thickness = 0.05, color = 0xffffff) {
    const dir = new THREE.Vector3().subVectors(v2World, v1World);
    const length = dir.length();

    const geo = new THREE.CylinderGeometry(thickness, thickness, length, 8);
    geo.translate(0, length / 2, 0);
    geo.rotateX(Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({ color });
    const line = new THREE.Mesh(geo, mat);

    line.position.copy(v1World);
    line.lookAt(v2World);

    scene.add(line);
    return line;
}
