// ws_gallery.js
import * as THREE from "three";
import { state } from "./ws_state.js";

export function generateThumbnail(object, renderer, scene, size = 128) {
    // Validate the object exists in the scene graph
    if (!scene.getObjectById(object.id)) {
        console.warn('generateThumbnail: object not found in scene', object?.name);
    }
    // Check model root ownership (lightweight parent-chain walk)
    let node = object.parent;
    let inModelRoot = false;
    while (node) { if (node === state.modelRoot) { inModelRoot = true; break; } node = node.parent; }
    if (!inModelRoot) {
        console.warn('generateThumbnail: object not in modelRoot', object?.name);
    }
    const rt = new THREE.WebGLRenderTarget(size, size);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);

    // Frame the object
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(sz.x, sz.y, sz.z);

    cam.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
    cam.lookAt(center);

    // Render to target
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);

    // Extract image data
    const pixels = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);

    // Create canvas to flip Y (WebGL reads bottom-up)
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const srcIdx = ((size - 1 - y) * size + x) * 4;
            const dstIdx = (y * size + x) * 4;
            imgData.data[dstIdx] = pixels[srcIdx];
            imgData.data[dstIdx+1] = pixels[srcIdx+1];
            imgData.data[dstIdx+2] = pixels[srcIdx+2];
            imgData.data[dstIdx+3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    rt.dispose();
    return canvas.toDataURL();
}

export function focusCameraOnObject(camera, controls, object) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    controls.target.copy(center);
    camera.position.set(center.x + maxDim * 2, center.y + maxDim, center.z + maxDim * 2);
    controls.update();
}
