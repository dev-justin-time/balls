import * as THREE from "three";
import { state } from "./ws_state.js";

/**
 * Initialize the workshop scene.
 * Accepts an existing renderer and canvas from the game, or creates new ones.
 * @param {HTMLCanvasElement} canvas
 * @param {THREE.WebGLRenderer} [existingRenderer] - reuse game renderer
 */
export function initWorkshopScene(canvas, existingRenderer) {
    const renderer = existingRenderer || new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    if (!existingRenderer) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(innerWidth, innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.localClippingEnabled = true;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 1000);
    camera.position.set(3, 2, 4);

    // Lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 7.5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 50;
    dir.shadow.camera.left = -10;
    dir.shadow.camera.right = 10;
    dir.shadow.camera.top = 10;
    dir.shadow.camera.bottom = -10;
    scene.add(dir);

    // Grid & Model Root
    scene.add(new THREE.GridHelper(20, 20, 0x222222, 0x222222));
    scene.add(state.modelRoot);

    return { renderer, scene, camera };
}
