import * as THREE from "three";

export function initPainter({ renderer, camera, scene, dom }){
  let enabled = false;
  let attachedMesh = null;
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const brush = { color: '#ff0000', size: 32 };

  function createPaintTexture(mesh){
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(0,0,size,size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.flipY = false;
    mesh.userData.paint = { canvas, ctx, tex, size };
    if (Array.isArray(mesh.material)){
      mesh.material = mesh.material.map(m=> new THREE.MeshStandardMaterial({ map: tex, color: m.color || 0xffffff }));
    } else {
      mesh.material.map = tex;
      mesh.material.needsUpdate = true;
    }
  }

  function attachMesh(mesh){
    attachedMesh = null;
    if (!mesh) return;
    // Validate mesh is in the scene before attaching painter
    if (scene && !scene.getObjectById(mesh.id)) {
        console.warn('Painter: mesh not found in scene', mesh.name);
    }
    let target = mesh;
    if (!target.geometry && mesh.parent) target = mesh.parent;
    target.traverse((c)=>{ if (c.isMesh && !c.userData.paint) createPaintTexture(c); });
    attachedMesh = target;
  }

  function setEnabled(v){ enabled = !!v; if (!enabled) isPainting = false; }
  function setColor(hex){ brush.color = hex; }
  function setSize(s){ brush.size = s; }
  function clear(){
    if (!attachedMesh) return;
    attachedMesh.traverse((m)=>{
      if (m.userData.paint){
        const { ctx, size } = m.userData.paint;
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(0,0,size,size);
        m.userData.paint.tex.needsUpdate = true;
      }
    });
  }

  let isPainting = false;
  dom.style.touchAction = 'none';
  dom.addEventListener('pointerdown', (e)=>{
    if (!enabled || !attachedMesh) return;
    isPainting = true;
    paintAt(e.clientX, e.clientY);
  });
  dom.addEventListener('pointermove', (e)=>{
    if (!enabled || !attachedMesh) return;
    if (isPainting) paintAt(e.clientX, e.clientY);
  });
  dom.addEventListener('pointerup', ()=> { isPainting = false; });
  dom.addEventListener('pointerleave', ()=> { isPainting = false; });

  function paintAt(clientX, clientY){
    pointer.x = (clientX / dom.clientWidth) * 2 - 1;
    pointer.y = -(clientY / dom.clientHeight) * 2 + 1;
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObject(attachedMesh, true);
    if (!hits.length) return;
    const hit = hits[0];
    const mesh = hit.object;
    if (!mesh.userData.paint) createPaintTexture(mesh);
    const ud = mesh.userData.paint;
    if (!hit.uv) return;
    const uv = hit.uv;
    const x = Math.floor(uv.x * ud.size);
    const y = Math.floor((1 - uv.y) * ud.size);
    const ctx = ud.ctx;
    ctx.fillStyle = brush.color;
    ctx.beginPath();
    ctx.arc(x, y, brush.size, 0, Math.PI * 2);
    ctx.fill();
    ud.tex.needsUpdate = true;
  }

  return { attachMesh, setEnabled, setColor, setSize, clear, update: ()=>{} };
}
