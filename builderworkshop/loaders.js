import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { state } from "./state.js";
import { traverseMeshes } from "./controls.js";

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
    sceneObj.position.set(0, 0, 0);
    traverseMeshes(sceneObj, (m) => {
      if (!m.material) m.material = new THREE.MeshStandardMaterial({ color: 0x999999, side: THREE.DoubleSide });
      m.castShadow = true;
      m.receiveShadow = true;
    });
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