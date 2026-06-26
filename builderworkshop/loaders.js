import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { state } from "./state.js";
import { traverseMeshes } from "./controls.js";
import { showModelInfo, updateModelInfoPanel, computeModelInfo } from "./modelInfo.js";

const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager);
const objLoader = new OBJLoader(manager);
const fbxLoader = new FBXLoader(manager);

const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
gltfLoader.setDRACOLoader(draco);

export function setupLoaderUI() {
  const progressWrap = document.getElementById('loader-progress');
  const progressBar = document.getElementById('loader-progress-bar');
  
  manager.onStart = () => { progressWrap.style.display = 'block'; progressBar.style.width = '0%'; };
  manager.onProgress = (url, loaded, total) => { progressBar.style.width = Math.round((loaded / total) * 100) + '%'; };
  manager.onLoad = () => { progressBar.style.width = '100%'; setTimeout(() => progressWrap.style.display = 'none', 300); };
  manager.onError = (url) => { console.warn('Loading error:', url); progressWrap.style.display = 'none'; };

  document.getElementById('btn-load').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', handleFileSelect);
}

async function handleFileSelect(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const urlMap = {};
  files.forEach(f => urlMap[f.name] = URL.createObjectURL(f));

  const mainFile = findMainFile(files);
  const name = mainFile.name.toLowerCase();

  try {
    state.modelRoot.clear();
    
    if (name.endsWith('.obj')) {
      objLoader.load(urlMap[mainFile.name], processLoaded, undefined, handleError);
    } else if (name.endsWith('.fbx')) {
      fbxLoader.load(urlMap[mainFile.name], processLoaded, undefined, handleError);
    } else if (name.endsWith('.glb')) {
      const buffer = await mainFile.arrayBuffer();
      gltfLoader.parse(buffer, '', processLoaded, handleError);
    } else if (name.endsWith('.gltf')) {
      const text = await mainFile.text();
      const origModifier = manager.getURLModifier ? manager.getURLModifier() : null;
      manager.setURLModifier((url) => {
        const fname = url.split('/').pop();
        return urlMap[fname] || urlMap[url] || url;
      });
      gltfLoader.parse(text, '', (g) => {
        processLoaded(g);
        if (origModifier) manager.setURLModifier(origModifier);
      }, (err) => {
        handleError(err);
        if (origModifier) manager.setURLModifier(origModifier);
      });
    } else {
      gltfLoader.load(urlMap[mainFile.name], processLoaded, undefined, handleError);
    }
  } catch (err) {
    console.error(err);
    alert('Load error: ' + err.message);
  } finally {
    files.forEach(f => URL.revokeObjectURL(urlMap[f.name]));
  }

  function processLoaded(obj) {
    const sceneObj = obj.scene || obj;
    state.modelRoot.add(sceneObj);

    // Auto-center and auto-scale the model to fit the view
    const box = new THREE.Box3().setFromObject(sceneObj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Center model at origin
    sceneObj.position.set(-center.x, -center.y, -center.z);

    // Auto-scale: target max dimension of ~5 units for comfortable viewing
    if (maxDim > 0.01 && maxDim < 1000) {
      const targetSize = 5;
      const scale = targetSize / maxDim;
      sceneObj.scale.setScalar(scale);
    }

    traverseMeshes(sceneObj, (m) => {
      if (!m.material) m.material = new THREE.MeshStandardMaterial({ color: 0x999999, side: THREE.DoubleSide });
      m.castShadow = true;
      m.receiveShadow = true;
    });

    // Compute and display model info
    const info = computeModelInfo(sceneObj);
    state.modelInfo = info;
    updateModelInfoPanel(info);
    showModelInfo(true);

    console.info(`[Loader] Model loaded: ${(maxDim > 0.01 ? maxDim.toFixed(1) : '?')} units max dim, ${info.triangles.toLocaleString()} tris, ${info.materials} materials`);
  }

  function handleError(err) {
    console.error(err);
    alert('Model load error');
  }
}

function findMainFile(files) {
  const order = ['.gltf', '.glb', '.fbx', '.obj'];
  for (const ext of order) {
    const found = files.find(f => f.name.toLowerCase().endsWith(ext));
    if (found) return found;
  }
  return files[0];
}