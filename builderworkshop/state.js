import * as THREE from "three";

export const state = {
    modelRoot: null,
    selected: null,
    modelInfo: null,
    clippingPlane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    clippingEnabled: false
};

export function initState() {
    state.modelRoot = new THREE.Group();
    state.selected = null;
    state.clippingEnabled = false;
    state.clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
}

