/**
 * =====================================================================
 * @domain:    builder_ui
 * @concern:   Lumen Shaders — Builder Panel UI
 * @created:   2026-06-25T00:10:00Z
 * @version:   1.0.0
 * =====================================================================
 *
 * Builder UI panel for Lumen Shaders. Provides:
 *   - Mode selector grid (9 shader modes)
 *   - Parameter sliders (palette, scale, warp, light, etc.)
 *   - Apply shader to selected mesh
 *   - Remove shader (restore original material)
 *   - Open standalone LumenShaders studio in overlay
 *
 * Relies on ws_shaderMaterials.js for the Three.js ShaderMaterial wrappers
 * and on the game's renderer for the preview.
 */

import * as THREE from 'three';
import { SHADER_MODES, createLumenMaterial, cloneLumenMaterial } from './ws_shaderMaterials.js';
import { state } from './ws_state.js';

/* ───────────────────────────────────────────────────────────────────────
 * State
 * ─────────────────────────────────────────────────────────────────────── */

let _panelEl = null;
let _shaderParamsEl = null;
let _selectedMode = 'chrome';
let _presetSearchQuery = '';
let _activeMaterial = null;       // currently applied mat on the selected mesh
let _originalMaterials = null;    // saved original materials per mesh UUID
let _animationId = null;
let _isOpen = false;

/* ───────────────────────────────────────────────────────────────────────
 * Main panel creation
 * ─────────────────────────────────────────────────────────────────────── */

export function initLumenShadersPanel() {
  const container = document.getElementById('ui-panels-container') || document.body;

  // Create panel
  _panelEl = document.createElement('div');
  _panelEl.className = 'tool-panel lumen-shaders-panel';
  _panelEl.style.cssText = `
    background:#1a1a2e; color:#ddd; padding:12px; margin:5px; border-radius:10px;
    display:inline-block; vertical-align:top; min-width:260px; max-width:320px;
    border:1px solid rgba(100,100,255,0.15);
  `;

  _panelEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <h3 style="margin:0;font-size:14px;color:#a88bff;">✨ Lumen Shaders</h3>
      <div style="display:flex;gap:4px;">
        <button id="ls-open-studio" class="ls-btn-sm" title="Open standalone Lumen studio">🎨 Studio</button>
        <button id="ls-close" class="ls-btn-sm" title="Close shader panel">✕</button>
      </div>
    </div>
    <div style="margin-bottom:8px;font-size:11px;color:#888;">
      Apply generative shaders to your mesh. Modes cycle in a perfect loop.
    </div>

    <!-- Mode selector grid -->
    <div id="ls-modes" style="
      display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px; margin-bottom:10px;
    "></div>

    <!-- Preview (tiny canvas) -->
    <div id="ls-preview-container" style="
      width:100%; height:80px; border-radius:6px; overflow:hidden;
      background:#0a0a1a; margin-bottom:8px; position:relative;
    ">
      <canvas id="ls-preview" style="width:100%;height:100%;display:block;"></canvas>
      <div id="ls-preview-label" style="
        position:absolute; bottom:4px; right:6px; font-size:9px;
        color:rgba(255,255,255,0.5); font-family:monospace;
      ">chrome</div>
    </div>

    <!-- Parameters (collapsible) -->
    <details id="ls-params" style="margin-bottom:8px;">
      <summary style="cursor:pointer;font-size:12px;color:#777;user-select:none;">
        ⚙ Parameters
      </summary>
      <div id="ls-params-body" style="padding-top:6px;"></div>
    </details>

    <!-- Presets -->
    <details id="ls-presets" style="margin-bottom:8px;">
      <summary style="cursor:pointer;font-size:12px;color:#777;user-select:none;">
        💾 Presets
      </summary>
      <div style="padding-top:6px;">
        <div style="display:flex;gap:4px;margin-bottom:6px;">
          <input type="text" id="ls-preset-name" value="My Preset"
            style="flex:1;padding:4px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);
            background:rgba(255,255,255,0.06);color:#ddd;font-size:10px;outline:none;
          ">
          <button id="ls-preset-save" style="
            padding:4px 8px;border-radius:4px;border:1px solid rgba(100,200,100,0.3);
            background:rgba(100,200,100,0.1);color:#8c8;cursor:pointer;font-size:10px;white-space:nowrap;
          ">💾 Save</button>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:4px;">
          <input type="text" id="ls-preset-filter" placeholder="🔍 Filter presets by name or mode..."
            style="flex:1;padding:3px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.08);
            background:rgba(255,255,255,0.04);color:#aaa;font-size:9px;outline:none;
          ">
          <span id="ls-preset-count" style="
            padding:3px 5px;font-size:9px;color:#666;white-space:nowrap;
            display:flex;align-items:center;
          "></span>
        </div>
        <div id="ls-preset-list" style="
          max-height:90px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;
        "></div>
        <div style="display:flex;gap:4px;margin-top:4px;">
          <button id="ls-preset-export" style="
            flex:1;padding:3px 4px;border-radius:4px;border:1px solid rgba(100,200,255,0.2);
            background:rgba(100,200,255,0.08);color:#8cf;cursor:pointer;font-size:8px;
          ">📤 Export .json</button>
          <button id="ls-preset-import" style="
            flex:1;padding:3px 4px;border-radius:4px;border:1px solid rgba(255,200,100,0.2);
            background:rgba(255,200,100,0.08);color:#fc8;cursor:pointer;font-size:8px;
          ">📥 Import .json</button>
        </div>
        <input type="file" id="ls-preset-import-input" accept=".json,.lumen-presets.json"
          style="display:none;">
      </div>
    </details>

    <!-- Actions -->
    <div style="display:flex;gap:6px;">
      <button id="ls-apply" class="ls-btn" style="flex:1;">Apply to Selected</button>
      <button id="ls-remove" class="ls-btn" style="flex:1;color:#ff6677;">Remove Shader</button>
    </div>
  `;

  container.appendChild(_panelEl);

  // Build mode grid with thumbnails
  const modesGrid = _panelEl.querySelector('#ls-modes');
  const thumbnails = {}; // modeId -> data URL

  // Generate thumbnails asynchronously
  _generateThumbnails().then((thumbs) => {
    Object.assign(thumbnails, thumbs);
    // Apply thumbnails to buttons once ready
    modesGrid.querySelectorAll('button').forEach((btn) => {
      const url = thumbnails[btn.dataset.mode];
      if (url) {
        btn.style.backgroundImage = `url(${url})`;
        btn.style.backgroundSize = 'cover';
        btn.style.backgroundPosition = 'center';
        // Text overlay with subtle shadow for readability
        btn.style.textShadow = '0 1px 3px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.6)';
        btn.style.color = '#fff';
        btn.style.fontWeight = '600';
      }
    });
  });

  SHADER_MODES.forEach((m) => {
    const btn = document.createElement('button');
    btn.dataset.mode = m.id;
    btn.innerHTML = `${m.icon} ${m.name}`;
    btn.style.cssText = `
      display:flex;flex-direction:column;align-items:center;justify-content:flex-end;
      padding:4px 4px 5px; border-radius:5px; border:1px solid rgba(255,255,255,0.08);
      background:rgba(255,255,255,0.04); color:#ccc; cursor:pointer;
      font-size:9px; line-height:1.2; transition:all 0.15s; min-height:56px;
      position:relative; overflow:hidden;
    `;
    if (m.id === _selectedMode) {
      btn.style.borderColor = '#a88bff';
      btn.style.background = 'rgba(168,139,255,0.15)';
    }
    btn.addEventListener('click', () => selectMode(m.id));
    modesGrid.appendChild(btn);
  });

  // Wire actions
  _panelEl.querySelector('#ls-apply').addEventListener('click', applyToSelected);
  _panelEl.querySelector('#ls-remove').addEventListener('click', removeShader);
  _panelEl.querySelector('#ls-close').addEventListener('click', closePanel);
  _panelEl.querySelector('#ls-open-studio').addEventListener('click', openStandaloneStudio);
  _panelEl.querySelector('#ls-preset-save').addEventListener('click', savePreset);

  // Wire preset filter (real-time filtering by name or mode)
  const filterInput = _panelEl.querySelector('#ls-preset-filter');
  if (filterInput) {
    filterInput.addEventListener('input', () => {
      _presetSearchQuery = filterInput.value.trim().toLowerCase();
      _renderPresetList();
    });
  }

  // Wire preset export (download JSON)
  _panelEl.querySelector('#ls-preset-export').addEventListener('click', exportPresets);

  // Wire preset import (hidden file input)
  const importBtn = _panelEl.querySelector('#ls-preset-import');
  const importInput = _panelEl.querySelector('#ls-preset-import-input');
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      importPresets(e.target.files[0]);
      importInput.value = ''; // allow re-importing the same file
    }
  });

  // Render saved presets
  _renderPresetList();

  // Build parameter sliders
  _shaderParamsEl = _panelEl.querySelector('#ls-params-body');
  buildParameterControls();

  // Start preview animation
  startPreviewAnimation();

  return _panelEl;
}

/* ───────────────────────────────────────────────────────────────────────
 * Mode selection
 * ─────────────────────────────────────────────────────────────────────── */

function selectMode(modeId) {
  _selectedMode = modeId;

  // Update grid buttons (preserve thumbnail background-image underneath)
  const btns = _panelEl.querySelectorAll('#ls-modes button');
  btns.forEach((btn) => {
    const isActive = btn.dataset.mode === modeId;
    btn.style.borderColor = isActive ? '#a88bff' : 'rgba(255,255,255,0.08)';
    btn.style.backgroundColor = isActive ? 'rgba(168,139,255,0.15)' : 'transparent';
  });

  // Update label
  const label = _panelEl.querySelector('#ls-preview-label');
  label.textContent = modeId;

  // Reset phase & material (dispose old to prevent GPU memory leak)
  if (previewMaterial) previewMaterial.dispose();
  previewMaterial = null;
}

/* ───────────────────────────────────────────────────────────────────────
 * Parameter controls
 * ─────────────────────────────────────────────────────────────────────── */

function buildParameterControls() {
  const params = [
    { key: 'u_scale',  label: 'Scale',   min: 0.2, max: 4, step: 0.05, default: 1.0 },
    { key: 'u_complex',label: 'Complex',  min: 1,   max: 8, step: 0.5, default: 4 },
    { key: 'u_warp',   label: 'Warp',    min: 0,   max: 2, step: 0.05, default: 0.5 },
    { key: 'u_flow',   label: 'Flow',    min: 0,   max: 1.5,step:0.05, default: 0.5 },
    { key: 'u_light',  label: 'Light',   min: 0,   max: 3, step: 0.05, default: 1.0 },
    { key: 'u_gloss',  label: 'Gloss',   min: 1,   max: 200,step:1,  default: 40 },
    { key: 'u_glow',   label: 'Glow',    min: 0,   max: 1.5,step:0.05,default: 0.2 },
    { key: 'u_travel', label: 'Travel',  min: 0,   max: 0.8,step:0.01,default: 0.15 },
    { key: 'u_stretch',label: 'Stretch', min: -1,  max: 1, step: 0.05, default: 0 },
    { key: 'u_soft',   label: 'Softness',min: 0,   max: 1, step: 0.05, default: 0.12 },
  ];

  const html = [];
  params.forEach((p) => {
    const val = p.default;
    html.push(`
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
        <label style="width:65px;font-size:10px;color:#999;flex-shrink:0;">${p.label}</label>
        <input type="range" id="ls-p-${p.key}" data-key="${p.key}"
          min="${p.min}" max="${p.max}" step="${p.step}" value="${val}"
          style="flex:1;height:3px;">
        <span id="ls-pv-${p.key}" style="width:36px;font-size:9px;color:#777;text-align:right;font-family:monospace;">${val}</span>
      </div>
    `);
  });

  // Color palette section
  html.push(`
    <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06);">
      <div style="font-size:10px;color:#999;margin-bottom:4px;">🎨 Palette Colors</div>
      <div style="display:flex;gap:6px;">
        ${['c1','c2','c3','c4'].map((c, i) => `
          <div style="flex:1;text-align:center;">
            <div style="font-size:8px;color:#666;">C${i+1}</div>
            <input type="color" id="ls-p-u_${c}" data-key="u_${c}"
              value="#${['ff4444','44aaff','ffaa44','aa44ff'][i]}"
              style="width:100%;height:22px;padding:0;border:none;border-radius:3px;cursor:pointer;">
          </div>
        `).join('')}
        <div style="flex:1;text-align:center;">
          <div style="font-size:8px;color:#666;">BG</div>
          <input type="color" id="ls-p-u_bg" data-key="u_bg"
            value="#111111"
            style="width:100%;height:22px;padding:0;border:none;border-radius:3px;cursor:pointer;">
        </div>
      </div>
    </div>
    <div style="margin-top:4px;display:flex;gap:6px;align-items:center;">
      <button id="ls-randomize" style="
        flex:1; padding:4px; font-size:10px; border-radius:5px;
        border:1px solid rgba(168,139,255,0.3); background:rgba(168,139,255,0.1);
        color:#a88bff; cursor:pointer;
      ">🎲 Randomize</button>
      <button id="ls-reset-params" style="
        flex:1; padding:4px; font-size:10px; border-radius:5px;
        border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04);
        color:#888; cursor:pointer;
      ">↺ Reset</button>
    </div>
  `);

  _shaderParamsEl.innerHTML = html.join('');

  // Wire sliders
  _shaderParamsEl.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.key;
      const val = parseFloat(input.value);
      const display = _shaderParamsEl.querySelector(`#ls-pv-${key}`);
      if (display) display.textContent = val;
      updateUniform(key, val);
    });
  });

  // Wire color pickers
  _shaderParamsEl.querySelectorAll('input[type="color"]').forEach((input) => {
    input.addEventListener('input', () => {
      updateUniformColor(input.dataset.key, input.value);
    });
  });

  // Wire randomize & reset
  _shaderParamsEl.querySelector('#ls-randomize').addEventListener('click', randomizeParams);
  _shaderParamsEl.querySelector('#ls-reset-params').addEventListener('click', resetParams);
}

/* ───────────────────────────────────────────────────────────────────────
 * Uniform helpers
 * ─────────────────────────────────────────────────────────────────────── */

function updateUniform(key, value) {
  if (previewMaterial && previewMaterial.uniforms[key]) {
    previewMaterial.uniforms[key].value = value;
  }
  if (_activeMaterial && _activeMaterial.uniforms[key]) {
    _activeMaterial.uniforms[key].value = value;
  }
}

function updateUniformColor(key, hex) {
  const c = new THREE.Color(hex);
  if (previewMaterial && previewMaterial.uniforms[key]) {
    previewMaterial.uniforms[key].value.copy(c);
  }
  if (_activeMaterial && _activeMaterial.uniforms[key]) {
    _activeMaterial.uniforms[key].value.copy(c);
  }
}

function randomizeParams() {
  const sliders = _shaderParamsEl.querySelectorAll('input[type="range"]');
  sliders.forEach((input) => {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const step = parseFloat(input.step) || 1;
    const steps = Math.round((max - min) / step);
    const val = min + Math.round(Math.random() * steps) * step;
    input.value = val;
    const display = _shaderParamsEl.querySelector(`#ls-pv-${input.dataset.key}`);
    if (display) display.textContent = val;
    updateUniform(input.dataset.key, parseFloat(val));
  });

  // Randomize palette colors
  const colorInputs = _shaderParamsEl.querySelectorAll('input[type="color"]');
  colorInputs.forEach((input) => {
    const randHex = '#' + Array.from({length:3},()=>
      Math.floor(Math.random()*160+48).toString(16).padStart(2,'0')
    ).join('');
    input.value = randHex;
    updateUniformColor(input.dataset.key, randHex);
  });

  // Randomize seed
  const seed = Math.floor(Math.random() * 9999);
  updateUniform('u_seed', seed);

  // Randomize mode
  const modes = SHADER_MODES;
  const mode = modes[Math.floor(Math.random() * modes.length)];
  selectMode(mode.id);
}

function resetParams() {
  _panelEl.querySelector('#ls-modes').querySelectorAll('button').forEach((btn) => {
    if (btn.dataset.mode === 'chrome') {
      btn.style.borderColor = '#a88bff';
      btn.style.backgroundColor = 'rgba(168,139,255,0.15)';
    } else {
      btn.style.borderColor = 'rgba(255,255,255,0.08)';
      btn.style.backgroundColor = 'transparent';
    }
  });
  _selectedMode = 'chrome';
  previewMaterial = null;

  const sliders = _shaderParamsEl.querySelectorAll('input[type="range"]');
  const defaults = { u_scale:1, u_complex:4, u_warp:0.5, u_flow:0.5,
    u_light:1, u_gloss:40, u_glow:0.2, u_travel:0.15, u_stretch:0, u_soft:0.12 };
  sliders.forEach((input) => {
    const key = input.dataset.key;
    const val = defaults[key] !== undefined ? defaults[key] : parseFloat(input.defaultValue);
    input.value = val;
    const display = _shaderParamsEl.querySelector(`#ls-pv-${key}`);
    if (display) display.textContent = val;
    updateUniform(key, val);
  });

  const colorInputs = _shaderParamsEl.querySelectorAll('input[type="color"]');
  const colorDefaults = { u_c1:'#ff4444', u_c2:'#44aaff', u_c3:'#ffaa44', u_c4:'#aa44ff', u_bg:'#111111' };
  colorInputs.forEach((input) => {
    const key = input.dataset.key;
    input.value = colorDefaults[key] || '#888888';
    updateUniformColor(key, input.value);
  });

  const label = _panelEl.querySelector('#ls-preview-label');
  label.textContent = 'chrome';
}

/* ───────────────────────────────────────────────────────────────────────
 * Preview rendering (tiny canvas)
 * ─────────────────────────────────────────────────────────────────────── */

let previewMaterial = null;
let previewGL = null;
let previewProgram = null;
let previewPhase = 0;

function startPreviewAnimation() {
  const canvas = _panelEl.querySelector('#ls-preview');
  if (!canvas) return;

  // Use an offscreen approach: render via Three.js into the canvas
  // We create a mini scene with a plane and our shader material
  const width = canvas.clientWidth || 260;
  const height = canvas.clientHeight || 80;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  const geo = new THREE.PlaneGeometry(2, 2);

  function renderPreview() {
    if (!_panelEl || !_panelEl.isConnected) {
      // Panel was removed; stop
      return;
    }

    // Create material on first call or mode change
    if (!previewMaterial) {
      if (previewMaterial) previewMaterial.dispose();
      previewMaterial = createLumenMaterial(_selectedMode, {
        u_res: { value: new THREE.Vector2(width, height) },
        u_seed: { value: Math.floor(Math.random() * 9999) },
      });

      // Sync current slider values to preview material
      const sliders = _shaderParamsEl ? _shaderParamsEl.querySelectorAll('input[type="range"]') : [];
      sliders.forEach((input) => {
        const key = input.dataset.key;
        if (previewMaterial.uniforms[key]) {
          previewMaterial.uniforms[key].value = parseFloat(input.value);
        }
      });
      const colorInputs = _shaderParamsEl ? _shaderParamsEl.querySelectorAll('input[type="color"]') : [];
      colorInputs.forEach((input) => {
        if (previewMaterial.uniforms[input.dataset.key]) {
          previewMaterial.uniforms[input.dataset.key].value.set(input.value);
        }
      });

      const mesh = new THREE.Mesh(geo, previewMaterial);
      scene.add(mesh);
    }

    // Advance phase
    previewPhase = (previewPhase + 0.004) % 1.0;
    if (previewMaterial.uniforms) {
      previewMaterial.uniforms.u_phase.value = previewPhase;
    }

    renderer.render(scene, camera);
    _animationId = requestAnimationFrame(renderPreview);
  }

  renderPreview();

  // Store cleanup
  _panelEl._previewRenderer = renderer;
  _panelEl._previewScene = scene;
  _panelEl._cleanupPreview = () => {
    if (_animationId) cancelAnimationFrame(_animationId);
    renderer.dispose();
    geo.dispose();
  };
}

/* ───────────────────────────────────────────────────────────────────────
 * Apply / remove shader on selected mesh
 * ─────────────────────────────────────────────────────────────────────── */

function applyToSelected() {
  if (!state.selected) {
    showToast('Select a mesh first');
    return;
  }

  const mesh = state.selected;
  const meshId = mesh.uuid;

  // Save original materials (first time only)
  if (!_originalMaterials) _originalMaterials = {};
  if (!_originalMaterials[meshId]) {
    _originalMaterials[meshId] = [];
    mesh.traverse((c) => {
      if (c.isMesh && c.material) {
        _originalMaterials[meshId].push({
          uuid: c.uuid,
          material: c.material,
        });
      }
    });
  }

  // Clone the preview material (has all current slider/color values synced)
  // If no preview yet, create a fresh material
  let newMat;
  if (previewMaterial) {
    newMat = cloneLumenMaterial(previewMaterial);
  } else {
    const params = gatherCurrentParams();
    const modeIndex = SHADER_MODES.find(m => m.id === _selectedMode)?.mode ?? 0;
    newMat = createLumenMaterial(modeIndex, {
      ...params,
      u_seed: { value: params.u_seed || Math.floor(Math.random() * 9999) },
    });
  }

  // Apply to all child meshes
  mesh.traverse((c) => {
    if (c.isMesh) {
      c.material = newMat;
      c.material.needsUpdate = true;
    }
  });

  _activeMaterial = newMat;
  showToast(`Applied "${_selectedMode}" shader`);
}

function removeShader() {
  if (!state.selected || !_originalMaterials) return;

  const meshId = state.selected.uuid;
  const saved = _originalMaterials[meshId];
  if (!saved) {
    showToast('No saved original material for this mesh');
    return;
  }

  // Restore original materials by traversing saved list
  saved.forEach((entry) => {
    const obj = state.selected.getObjectById(entry.uuid);
    if (obj && obj.isMesh) {
      obj.material = entry.material;
      obj.material.needsUpdate = true;
    }
  });

  delete _originalMaterials[meshId];
  _activeMaterial = null;
  showToast('Original material restored');
}

/* ───────────────────────────────────────────────────────────────────────
 * Open standalone LumenShaders studio
 * ─────────────────────────────────────────────────────────────────────── */

function openStandaloneStudio() {
  // Open in a new browser window/tab
  const w = Math.min(1200, window.innerWidth - 100);
  const h = Math.min(800, window.innerHeight - 100);
  const left = Math.max(0, (window.innerWidth - w) / 2);
  const top = Math.max(0, (window.innerHeight - h) / 2);

  // Dev: Vite serves from project root → /src/lumenshaders/index.html
  // Prod: Files copied to dist/lumenshaders/ → /lumenshaders/index.html
  const studioUrl = import.meta.env.DEV
    ? '/src/lumenshaders/index.html'
    : '/lumenshaders/index.html';

  window.open(
    studioUrl,
    'lumen-studio',
    `width=${w},height=${h},left=${left},top=${top},popup=1`
  );
}

/* ───────────────────────────────────────────────────────────────────────
 * Preset save / load / delete
 * ─────────────────────────────────────────────────────────────────────── */

const PRESETS_KEY = 'lumen_shader_presets';

/** Serialize current panel state into a preset object. */
function _capturePresetState() {
  const sliders = {};
  const colors = {};
  if (_shaderParamsEl) {
    _shaderParamsEl.querySelectorAll('input[type="range"]').forEach((input) => {
      sliders[input.dataset.key] = parseFloat(input.value);
    });
    _shaderParamsEl.querySelectorAll('input[type="color"]').forEach((input) => {
      colors[input.dataset.key] = input.value;
    });
  }
  return {
    mode: _selectedMode,
    sliders,
    colors,
  };
}

/** Apply a preset object to the panel controls and preview. */
function _applyPreset(preset) {
  // Set mode
  selectMode(preset.mode);

  // Set sliders
  if (preset.sliders && _shaderParamsEl) {
    Object.entries(preset.sliders).forEach(([key, val]) => {
      const input = _shaderParamsEl.querySelector(`#ls-p-${key}`);
      if (input) {
        input.value = val;
        const display = _shaderParamsEl.querySelector(`#ls-pv-${key}`);
        if (display) display.textContent = val;
        updateUniform(key, val);
      }
    });
  }

  // Set colors
  if (preset.colors && _shaderParamsEl) {
    Object.entries(preset.colors).forEach(([key, hex]) => {
      const input = _shaderParamsEl.querySelector(`#ls-p-${key}`);
      if (input) {
        input.value = hex;
        updateUniformColor(key, hex);
      }
    });
  }

  showToast(`Loaded preset`);
}

/** Save the current panel state as a named preset to localStorage. */
function savePreset() {
  const nameInput = _panelEl.querySelector('#ls-preset-name');
  const name = (nameInput ? nameInput.value.trim() : 'My Preset') || 'Unnamed';

  const presets = _loadAllPresets();

  // Check if name already exists — append counter if so
  let finalName = name;
  let counter = 2;
  while (presets.some(p => p.name === finalName)) {
    finalName = `${name} (${counter})`;
    counter++;
  }

  const preset = {
    ..._capturePresetState(),
    name: finalName,
    timestamp: Date.now(),
  };

  presets.push(preset);
  _saveAllPresets(presets);
  _renderPresetList();

  // Update the name input to the saved name
  if (nameInput) nameInput.value = finalName;

  showToast(`Preset saved: "${finalName}"`);
}

/** Load and apply a preset by index, then re-render the list. */
function loadPreset(index) {
  const presets = _loadAllPresets();
  if (index < 0 || index >= presets.length) return;
  const preset = presets[index];

  _applyPreset(preset);

  // Update name input
  const nameInput = _panelEl.querySelector('#ls-preset-name');
  if (nameInput) nameInput.value = preset.name;
}

/** Delete a preset by index. */
function deletePreset(index) {
  const presets = _loadAllPresets();
  if (index < 0 || index >= presets.length) return;
  const name = presets[index].name;
  presets.splice(index, 1);
  _saveAllPresets(presets);
  _renderPresetList();
  showToast(`Deleted preset: "${name}"`);
}

/** Load all presets parsed from localStorage. */
function _loadAllPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[LumenShaders] Failed to load presets:', e);
    return [];
  }
}

/** Persist the full presets array to localStorage. */
function _saveAllPresets(presets) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch (e) {
    console.warn('[LumenShaders] Failed to save presets:', e);
    showToast('Failed to save preset (storage full?)');
  }
}

/** Rebuild the preset list DOM from localStorage, filtered by _presetSearchQuery. */
function _renderPresetList() {
  const listEl = _panelEl.querySelector('#ls-preset-list');
  const countEl = _panelEl.querySelector('#ls-preset-count');
  if (!listEl) return;

  const allPresets = _loadAllPresets();

  if (allPresets.length === 0) {
    listEl.innerHTML = `<div style="font-size:10px;color:#555;text-align:center;padding:6px 0;">
      No saved presets yet
    </div>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  // Apply search filter — match preset name or corresponding mode name/icon
  const q = _presetSearchQuery.toLowerCase().trim();
  const filtered = q
    ? allPresets.filter((preset) => {
        const modeEntry = SHADER_MODES.find(m => m.id === preset.mode);
        const modeName = modeEntry ? modeEntry.name.toLowerCase() : '';
        const modeId = preset.mode.toLowerCase();
        const presetName = preset.name.toLowerCase();
        return presetName.includes(q) || modeName.includes(q) || modeId.includes(q);
      })
    : allPresets;

  // Show newest first
  const sorted = [...filtered].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (sorted.length === 0) {
    listEl.innerHTML = `<div style="font-size:10px;color:#555;text-align:center;padding:6px 0;">
      No presets match "${_presetSearchQuery}"
    </div>`;
    if (countEl) countEl.textContent = `0/${allPresets.length}`;
    return;
  }

  listEl.innerHTML = sorted.map((preset) => {
    // Find the actual index in the ORIGINAL allPresets array for load/delete
    const realIdx = allPresets.indexOf(preset);
    const modeEntry = SHADER_MODES.find(m => m.id === preset.mode);
    const icon = modeEntry ? modeEntry.icon : '🎨';
    return `<div style="
      display:flex;align-items:center;gap:4px;padding:3px 4px;
      border-radius:4px;background:rgba(255,255,255,0.03);
    ">
      <span style="font-size:11px;">${icon}</span>
      <span style="flex:1;font-size:10px;color:#bbb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
        title="${preset.name} (${modeEntry ? modeEntry.name : preset.mode})">${preset.name}</span>
      <button data-preset-idx="${realIdx}" class="ls-preset-load" style="
        padding:2px 5px;border-radius:3px;border:none;background:rgba(100,200,255,0.15);
        color:#8cf;cursor:pointer;font-size:9px;">Load</button>
      <button data-preset-idx="${realIdx}" class="ls-preset-del" style="
        padding:2px 5px;border-radius:3px;border:none;background:rgba(255,80,80,0.15);
        color:#f88;cursor:pointer;font-size:9px;">✕</button>
    </div>`;
  }).join('');

  // Update count display
  if (countEl) {
    countEl.textContent = q
      ? `${filtered.length}/${allPresets.length}`
      : `${allPresets.length} saved`;
  }

  // Wire load buttons
  listEl.querySelectorAll('.ls-preset-load').forEach((btn) => {
    btn.addEventListener('click', () => loadPreset(parseInt(btn.dataset.presetIdx)));
  });

  // Wire delete buttons
  listEl.querySelectorAll('.ls-preset-del').forEach((btn) => {
    btn.addEventListener('click', () => deletePreset(parseInt(btn.dataset.presetIdx)));
  });
}

/* ───────────────────────────────────────────────────────────────────────
 * Preset import / export as JSON files
 * ─────────────────────────────────────────────────────────────────────── */

/** Download all presets as a .lumen-presets.json file for sharing. */
function exportPresets() {
  try {
    const presets = _loadAllPresets();
    if (presets.length === 0) {
      showToast('No presets to export');
      return;
    }

    const data = JSON.stringify({ version: 1, exportedAt: Date.now(), presets }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `lumen-presets-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${presets.length} preset${presets.length !== 1 ? 's' : ''}`);
  } catch (e) {
    console.warn('[LumenShaders] Export failed:', e);
    showToast('Export failed');
  }
}

/** Import presets from a JSON file, merging into existing localStorage. */
function importPresets(file) {
  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (_) {
          showToast('Invalid JSON file');
          return;
        }

        // Support both wrapped { version, presets } and raw arrays
        const incoming = Array.isArray(parsed) ? parsed : parsed.presets;
        if (!Array.isArray(incoming) || incoming.length === 0) {
          showToast('No presets found in file');
          return;
        }

        // Validate preset structure — each must at least have a mode field
        const valid = incoming.filter((p) => p && typeof p.mode === 'string');
        if (valid.length === 0) {
          showToast('No valid presets in file');
          return;
        }

        const existing = _loadAllPresets();

        // Ask user whether to merge or replace
        if (existing.length > 0) {
          const action = confirm(
            `Import ${valid.length} preset${valid.length !== 1 ? 's' : ''}?\n` +
            `• OK = Merge with existing (${existing.length} saved)\n` +
            `• Cancel = Replace all`
          );
          if (action) {
            // Merge: append, deduplicate by name (keep latest)
            const nameSet = new Set(existing.map(p => p.name));
            valid.forEach((p) => {
              if (!p.timestamp) p.timestamp = Date.now();
              if (nameSet.has(p.name)) {
                // Replace existing by name
                const idx = existing.findIndex(e => e.name === p.name);
                if (idx >= 0) existing[idx] = p;
              } else {
                existing.push(p);
                nameSet.add(p.name);
              }
            });
            _saveAllPresets(existing);
            showToast(`Merged ${valid.length} preset${valid.length !== 1 ? 's' : ''}`);
          } else {
            // Replace: overwrite all
            _saveAllPresets(valid);
            showToast(`Imported ${valid.length} preset${valid.length !== 1 ? 's' : ''} (replaced)`);
          }
        } else {
          _saveAllPresets(valid);
          showToast(`Imported ${valid.length} preset${valid.length !== 1 ? 's' : ''}`);
        }

        _renderPresetList();
      } catch (err) {
        console.warn('[LumenShaders] Import parse error:', err);
        showToast('Failed to parse presets file');
      }
    };
    reader.onerror = () => showToast('Failed to read file');
    reader.readAsText(file);
  } catch (e) {
    console.warn('[LumenShaders] Import failed:', e);
    showToast('Import failed');
  }
}

/* ───────────────────────────────────────────────────────────────────────
 * Thumbnail generation for mode grid
 * ─────────────────────────────────────────────────────────────────────── */

/**
 * Render a tiny preview of each shader mode to a data URL.
 * Uses a single shared WebGL renderer to avoid hitting context limits.
 * Returns a promise that resolves to { modeId: dataURL, ... }.
 */
function _generateThumbnails() {
  return new Promise((resolve) => {
    // Use requestAnimationFrame to yield to the browser before creating
    // a WebGL context, so the main preview canvas can initialize first.
    requestAnimationFrame(() => {
      try {
        const TW = 80;
        const TH = 50;
        const canvas = document.createElement('canvas');
        canvas.width = TW;
        canvas.height = TH;

        const renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: false,
          antialias: false,
        });
        renderer.setSize(TW, TH, false);
        renderer.setPixelRatio(1);

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 1;
        const geo = new THREE.PlaneGeometry(2, 2);

        const result = {};
        const phase = 0.25; // fixed phase for consistent thumbnails

        SHADER_MODES.forEach((m) => {
          try {
            const mat = createLumenMaterial(m.id, {
              u_res: { value: new THREE.Vector2(TW, TH) },
              u_seed: { value: m.mode * 137 + 42 }, // deterministic seed per mode
              u_phase: { value: phase },
            });
            const mesh = new THREE.Mesh(geo, mat);
            scene.add(mesh);
            renderer.render(scene, camera);
            result[m.id] = canvas.toDataURL('image/png');
            scene.remove(mesh);
            mat.dispose();
          } catch (e) {
            console.warn('[LumenShaders] Thumbnail failed for', m.id, e);
          }
        });

        renderer.dispose();
        geo.dispose();
        resolve(result);
      } catch (e) {
        console.warn('[LumenShaders] Thumbnail generation failed:', e);
        resolve({});
      }
    });
  });
}

/* ───────────────────────────────────────────────────────────────────────
 * Helpers
 * ─────────────────────────────────────────────────────────────────────── */

function gatherCurrentParams() {
  const params = {};
  if (_shaderParamsEl) {
    _shaderParamsEl.querySelectorAll('input[type="range"]').forEach((input) => {
      params[input.dataset.key] = { value: parseFloat(input.value) };
    });
    _shaderParamsEl.querySelectorAll('input[type="color"]').forEach((input) => {
      params[input.dataset.key] = { value: new THREE.Color(input.value) };
    });
  }
  params.u_mode = { value: SHADER_MODES.find(m => m.id === _selectedMode)?.mode ?? 0 };
  return params;
}

function showToast(msg) {
  let toast = document.getElementById('ls-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ls-toast';
    toast.style.cssText = `
      position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
      background:rgba(0,0,0,0.85); color:#eee; padding:8px 16px;
      border-radius:8px; font-size:12px; font-family:monospace;
      z-index:9999; pointer-events:none; transition:opacity 0.3s;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

export function closePanel() {
  if (_panelEl) {
    if (_panelEl._cleanupPreview) _panelEl._cleanupPreview();
    _panelEl.style.display = 'none';
  }
  _isOpen = false;
}

export function openPanel() {
  if (_panelEl) {
    _panelEl.style.display = '';
    if (!_panelEl._previewRenderer) {
      startPreviewAnimation();
    }
  }
  _isOpen = true;
}

export function isShadersPanelOpen() {
  return _isOpen && _panelEl && _panelEl.style.display !== 'none';
}

/* ───────────────────────────────────────────────────────────────────────
 * Animation loop integration
 * ─────────────────────────────────────────────────────────────────────── */

let _globalPhase = 0;

/**
 * Advance the Lumen shader phase for all applied shader materials.
 * Called every frame from the builder's update(dt) loop.
 *
 * Updates both:
 *   - The active material tracked by the shader panel
 *   - Any ShaderMaterial in the scene with a u_phase uniform
 *
 * @param {number} dt - Delta time in seconds
 */
export function updateActiveLumenPhase(dt) {
  // Advance phase at a rate that makes a full loop in ~4 seconds (matching Lumen default)
  _globalPhase = (_globalPhase + dt * 0.25) % 1.0;

  // Update the panel-tracked active material (fast path)
  if (_activeMaterial && _activeMaterial.uniforms) {
    _activeMaterial.uniforms.u_phase.value = _globalPhase;
  }

  // Update the preview material in the panel
  if (previewMaterial && previewMaterial.uniforms) {
    previewMaterial.uniforms.u_phase.value = _globalPhase;
  }

  // Scan the entire modelRoot for any other Lumen shader materials
  // This catches materials applied by the user via applyToSelected()
  // even if the panel was closed and _activeMaterial was dereferenced.
  if (state && state.modelRoot) {
    state.modelRoot.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mat = child.material;
      // Handle both single materials and material arrays
      const materials = Array.isArray(mat) ? mat : [mat];
      for (let i = 0; i < materials.length; i++) {
        const m = materials[i];
        // Skip non-lumen materials — check for u_phase uniform
        if (m.isShaderMaterial && m.uniforms && m.uniforms.u_phase) {
          m.uniforms.u_phase.value = _globalPhase;
        }
      }
    });
  }
}

/**
 * Reset the phase counter (e.g., when entering workshop).
 */
export function resetLumenPhase() {
  _globalPhase = 0;
}
