// selection.js
import * as THREE from "three";
import { state } from "./state.js";

export const selection = {
    mode: 'vertex', // 'vertex', 'edge', 'face'
    indices: new Set(),
    sticky: false,
    marqueeStart: null,
    endToEndPoints: [],
    helpers: new THREE.Group()
};

export function initSelection(scene) {
    scene.add(selection.helpers);
}

export function setMode(mode) { 
    selection.mode = mode; 
    clearVisuals(); 
}

export function toggleSticky() { 
    selection.sticky = !selection.sticky; 
    if (!selection.sticky) clearVisuals();
}

export function selectAll() {
    if (!state.selected || !state.selected.geometry) return;
    const attr = getAttributeForMode(state.selected);
    if(!attr) return;
    selection.indices.clear();
    for(let i = 0; i < attr.count; i++) selection.indices.add(i);
    updateVisuals(state.selected);
}

export function selectNone() {
    if (selection.sticky) return; // Sticky prevents clearing
    selection.indices.clear();
    selection.endToEndPoints = [];
    clearVisuals();
}

// Rectangle (Marquee) Selection Logic
export function updateMarquee(mesh, camera, startX, startY, endX, endY, canvasWidth, canvasHeight) {
    if (!mesh || !mesh.geometry) return;
    const pos = mesh.geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const screenPos = new THREE.Vector3();
    
    // Normalize screen coords to -1..1
    const minX = Math.min(startX, endX), maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY), maxY = Math.max(startY, endY);

    selection.indices.clear();
    for (let i = 0; i < pos.count; i++) {
        vertex.fromBufferAttribute(pos, i);
        mesh.localToWorld(vertex);
        screenPos.copy(vertex).project(camera);
        
        // Convert to screen pixels
        const x = (screenPos.x * 0.5 + 0.5) * canvasWidth;
        const y = (-screenPos.y * 0.5 + 0.5) * canvasHeight;
        
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            selection.indices.add(i);
        }
    }
    updateVisuals(mesh);
}

// End-to-End Point Selection (Selects 2 vertices and highlights the path)
export function addEndToEndPoint(vertexIndex) {
    selection.endToEndPoints.push(vertexIndex);
    if (selection.endToEndPoints.length > 2) selection.endToEndPoints.shift(); // Keep only last 2
    selection.indices.add(vertexIndex);
}

function getAttributeForMode(mesh) {
    if (selection.mode === 'vertex') return mesh.geometry.attributes.position;
    return mesh.geometry.index || mesh.geometry.attributes.position;
}

function updateVisuals(mesh) {
    clearVisuals();
    if (selection.indices.size === 0) return;
    
    // Create visual highlights (e.g., yellow points for vertices)
    const pos = mesh.geometry.attributes.position;
    const highlightGeo = new THREE.BufferGeometry();
    const highlightVerts = new Float32Array(selection.indices.size * 3);
    
    let idx = 0;
    for (const i of selection.indices) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        mesh.localToWorld(v);
        highlightVerts[idx++] = v.x;
        highlightVerts[idx++] = v.y;
        highlightVerts[idx++] = v.z;
    }
    
    highlightGeo.setAttribute('position', new THREE.BufferAttribute(highlightVerts, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffff00, size: 0.1, sizeAttenuation: false });
    const points = new THREE.Points(highlightGeo, mat);
    selection.helpers.add(points);
}

function clearVisuals() {
    while(selection.helpers.children.length > 0) {
        const child = selection.helpers.children[0];
        selection.helpers.remove(child);
        if(child.geometry) child.geometry.dispose();
        if(child.material) child.material.dispose();
    }
}