import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { state } from "./ws_state.js";

export function initControls(camera, domElement) {
  const orbit = new OrbitControls(camera, domElement);
  orbit.target.set(0, 1, 0);
  orbit.update();

  const transform = new TransformControls(camera, domElement);
  transform.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });

  // Snapping logic on pointer up
  window.addEventListener('pointerup', () => {
    if (!state.selected) return;
    const snapCheckbox = document.getElementById('snap-toggle');
    if (snapCheckbox && snapCheckbox.checked) {
      const step = 0.1;
      state.selected.position.x = Math.round(state.selected.position.x / step) * step;
      state.selected.position.y = Math.round(state.selected.position.y / step) * step;
      state.selected.position.z = Math.round(state.selected.position.z / step) * step;

      ['x', 'y', 'z'].forEach(axis => {
        state.selected.rotation[axis] = Math.round(state.selected.rotation[axis] * 100) / 100;
        state.selected.scale[axis] = Math.round(state.selected.scale[axis] * 100) / 100;
      });
    }
  });

  return { orbit, transform };
}

export function setupSelection(renderer, camera, onSelect) {
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  renderer.domElement.addEventListener('pointerdown', (e) => {
    const modeEl = document.getElementById('mode');
    if (modeEl && modeEl.value === 'paint') return;

    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    ray.setFromCamera(pointer, camera);

    const hits = ray.intersectObject(state.modelRoot, true);
    onSelect(hits.length ? hits[0].object : null);
  });
}

export function selectMesh(mesh, transform, painter) {
  if (state.selected === mesh) return;

  // Deselect old
  if (state.selected) {
    traverseMeshes(state.selected, m => {
      if (m.material && m.material.emissive) {
        m.material.emissive.setHex(m.userData.origEmissive || 0x000000);
      }
    });
  }

  state.selected = mesh;

  // Select new
  if (state.selected) {
    traverseMeshes(state.selected, m => {
      if (m.material && m.material.emissive) {
        m.userData.origEmissive = m.userData.origEmissive || m.material.emissive.getHex();
        m.material.emissive.setHex(0x222222);
      }
    });

    const modeEl = document.getElementById('mode');
    const mode = modeEl ? modeEl.value : 'translate';
    if (['translate', 'rotate', 'scale'].includes(mode)) {
      transform.attach(state.selected);
      transform.setMode(mode);
    }
  } else {
    transform.detach();
  }

  if (painter) painter.attachMesh(state.selected);
}

export function traverseMeshes(obj, fn) {
  obj.traverse((c) => { if (c.isMesh) fn(c); });
}
