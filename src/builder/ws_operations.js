import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { state } from "./ws_state.js";
import { traverseMeshes, selectMesh } from "./ws_controls.js";

export function setupOperations(transform, painter) {
  document.getElementById('btn-delete').addEventListener('click', () => {
    if (!state.selected) return;
    if (state.selected.parent) state.selected.parent.remove(state.selected);
    selectMesh(null, transform, painter);
  });

  document.getElementById('btn-merge').addEventListener('click', () => {
    if (!state.selected) return;
    const geoms = [], mats = [];
    traverseMeshes(state.selected, (m) => {
      if (!m.geometry) return;
      const geom = m.geometry.clone();
      m.updateMatrixWorld();
      geom.applyMatrix4(m.matrixWorld);
      geoms.push(geom);
      mats.push(m.material);
      if (m.parent) m.parent.remove(m);
    });
    if (!geoms.length) return;

    // Modern Three.js uses mergeGeometries, fallback for older versions
    const mergeFn = BufferGeometryUtils.mergeGeometries || BufferGeometryUtils.mergeBufferGeometries;
    const merged = mergeFn(geoms, true);
    const mat = Array.isArray(mats[0]) ? mats[0][0] : (mats[0] || new THREE.MeshStandardMaterial({ color: 0x999999 }));
    const mesh = new THREE.Mesh(merged, mat.clone ? mat.clone() : mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    state.modelRoot.add(mesh);
    selectMesh(mesh, transform, painter);
  });

  document.getElementById('btn-sticker').addEventListener('click', () => {
    if (!state.selected) return;
    const txt = prompt('Sticker text', '\u2605');
    if (txt === null) return;
    const color = prompt('Sticker color (hex)', '#ffcc00') || '#ffcc00';
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(size * 0.5)}px sans-serif`;
    ctx.fillText(txt, size / 2, size / 2);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);

    const box = new THREE.Box3().setFromObject(state.selected);
    const center = new THREE.Vector3();
    box.getCenter(center);
    sprite.position.copy(center);
    const s = box.getSize(new THREE.Vector3()).length() * 0.25 || 0.5;
    sprite.scale.set(s, s, s);
    state.modelRoot.add(sprite);
  });

  document.getElementById('btn-apply-texture').addEventListener('click', () => {
    if (!state.selected) return;
    const input = document.getElementById('texture-input');
    input.value = '';
    input.click();
  });

  document.getElementById('texture-input').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f || !state.selected) return;
    const url = URL.createObjectURL(f);
    new THREE.TextureLoader().load(url, (tex) => {
      tex.flipY = false;
      traverseMeshes(state.selected, (m) => {
        if (m.material) {
          const mat = m.material.clone ? m.material.clone() : new THREE.MeshStandardMaterial();
          mat.map = tex;
          mat.needsUpdate = true;
          m.material = mat;
        }
      });
      URL.revokeObjectURL(url);
    });
  });

  document.getElementById('btn-duplicate').addEventListener('click', () => {
    if (!state.selected) return;
    const copy = state.selected.clone(true);
    traverseMeshes(copy, (m) => {
      if (m.material) m.material = m.material.clone();
      if (m.userData.paint && m.userData.paint.canvas) {
        const { canvas, size } = m.userData.paint;
        const newCanvas = document.createElement('canvas');
        newCanvas.width = newCanvas.height = size;
        newCanvas.getContext('2d').drawImage(canvas, 0, 0);
        const tex = new THREE.CanvasTexture(newCanvas);
        tex.flipY = false;
        m.material.map = tex;
        m.userData.paint = { canvas: newCanvas, ctx: newCanvas.getContext('2d'), tex, size };
      }
    });
    copy.position.x += 0.1;
    state.modelRoot.add(copy);
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!state.selected) return;
    state.selected.position.set(0, 0, 0);
    state.selected.rotation.set(0, 0, 0);
    state.selected.scale.set(1, 1, 1);
  });

  document.getElementById('btn-mirror').addEventListener('click', () => {
    if (!state.selected) return;
    const copy = state.selected.clone(true);
    copy.scale.x *= -1;
    traverseMeshes(copy, (m) => {
      if (m.geometry) {
        m.geometry = m.geometry.clone();
        m.geometry.computeVertexNormals();
        m.material = m.material ? m.material.clone() : new THREE.MeshStandardMaterial({ color: 0x999999 });
        m.material.side = THREE.DoubleSide;
      }
    });
    copy.position.x += 0.2;
    state.modelRoot.add(copy);
  });

  let wire = false;
  document.getElementById('btn-wireframe').addEventListener('click', () => {
    wire = !wire;
    if (!state.selected) return;
    traverseMeshes(state.selected, (m) => { if (m.material) m.material.wireframe = wire; });
  });

  document.getElementById('mat-color').addEventListener('input', (e) => {
    if (!state.selected) return;
    const col = new THREE.Color(e.target.value);
    traverseMeshes(state.selected, (m) => { if (m.material) m.material.color = col; });
  });
}
