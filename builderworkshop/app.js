import * as THREE from "three";
import { state, initState } from "./state.js";
import { initScene } from "./scene.js";
import { initControls, setupSelection, selectMesh } from "./controls.js";
import { setupLoaderUI } from "./loaders.js";
import { setupOperations } from "./operations.js";
import { setupExporter } from "./exporter.js";
import { setupAgent } from "./agent.js";
import { initPainter } from "./painter.js";
import { initSelection } from "./selection.js";
import { initUIPanels } from "./uiPanels.js";
import { generateThumbnail } from "./gallery.js";
import { updateSelectionInfo, zoomToFit } from "./modelInfo.js";

// Import new fully-implemented modules
import { initSelectionHistory } from "./selectionHistory.js";
import { initSelectGroups } from "./selectGroups.js";
import { initLassoSelect } from "./lassoSelect.js";

// New concern modules — previously unreferenced; now wired to live UI:
import { applySculptTool, applySmoothTool } from "./sculpting.js";
import { hollowOut, patchHole } from "./modifiers.js";
import { uploadBoneData, downloadBoneData, startGenerativeTask, rigSlots } from "./rigging.js";
import { addTriangle, removeTriangle, drawCustomLine } from "./wireframeEditor.js";

// Shared module state (used by sculpt/modifiers/rigging/editor)
window.sculptState  = { active: false, ray: new THREE.Raycaster(), point: new THREE.Vector3(), normal: new THREE.Vector3() };
window.rigSlots     = rigSlots;

(async function main() {
    // ==========================================
    // 1. INITIALIZE CORE STATE & SCENE
    // ==========================================
    initState();
    const canvas = document.getElementById("c");
    const { renderer, scene, camera } = initScene(canvas);
    scene.add(state.modelRoot);

    // ==========================================
    // 2. INITIALIZE CONTROLS & PAINTER
    // ==========================================
    const { orbit, transform } = initControls(camera, renderer.domElement);
    scene.add(transform);
    const painter = initPainter({ renderer, camera, scene, dom: renderer.domElement });

    // ==========================================
    // 3. INITIALIZE ADVANCED MODULES
    // ==========================================
    const selectionHistory = initSelectionHistory();
    const selectGroups = initSelectGroups(state.modelRoot);
    const lassoSelect = initLassoSelect();

    // Expose to window for console debugging / external UI
    window.selectionHistory = selectionHistory;
    window.selectGroups = selectGroups;
    window.lassoSelect = lassoSelect;

    // Helper to find an object in the scene by its UUID
    function findByUUID(root, uuid) {
        let found = null;
        root.traverse(c => { if (c.uuid === uuid) found = c; });
        return found;
    }

    // ==========================================
    // 4. WIRE UP CORE FEATURES
    // ==========================================
    setupLoaderUI();
    setupOperations(transform, painter);
    setupExporter();
    setupAgent();
    
    // Wrap selection to automatically push to history and update model info panel
    setupSelection(renderer, camera, (mesh) => {
        selectMesh(mesh, transform, painter);
        selectionHistory.push(mesh ? [mesh.uuid] : []);
        updateSelectionInfo(mesh, state.modelInfo);
    });

    initSelection(scene);
    initUIPanels();

    // ==========================================
    // 5. UNDO / REDO KEYBOARD SHORTCUTS
    // ==========================================
    window.addEventListener('keydown', (e) => {
        // Zoom to fit: F key (no modifiers)
        if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            // Don't capture if user is typing in an input
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
            e.preventDefault();
            const target = state.selected || state.modelRoot;
            zoomToFit(camera, orbit, target);
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                const prevUUIDs = selectionHistory.undo();
                if (prevUUIDs && prevUUIDs.length > 0) {
                    const obj = findByUUID(state.modelRoot, prevUUIDs[0]);
                    if (obj) selectMesh(obj, transform, painter);
                } else {
                    selectMesh(null, transform, painter);
                }
            } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
                e.preventDefault();
                const nextUUIDs = selectionHistory.redo();
                if (nextUUIDs && nextUUIDs.length > 0) {
                    const obj = findByUUID(state.modelRoot, nextUUIDs[0]);
                    if (obj) selectMesh(obj, transform, painter);
                }
            }
        }
    });

    // ==========================================
    // 6. LASSO TOOL INTEGRATION
    // ==========================================
    // Add Lasso option to the mode dropdown dynamically
    const modeEl = document.getElementById('mode');
    const lassoOption = document.createElement('option');
    lassoOption.value = 'lasso';
    lassoOption.textContent = 'Lasso Select';
    modeEl.appendChild(lassoOption);

    // Create an SVG overlay to draw the lasso path visually
    const lassoOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    lassoOverlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;";
    document.body.appendChild(lassoOverlay);

    canvas.addEventListener('pointerdown', (e) => {
        if (modeEl.value === 'lasso') {
            lassoSelect.start(e.clientX, e.clientY);
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        if (modeEl.value === 'lasso' && lassoSelect.isDrawing()) {
            lassoSelect.addPoint(e.clientX, e.clientY);
            const points = lassoSelect.getPoints();
            if (points.length > 1) {
                let d = `M ${points[0].x} ${points[0].y}`;
                for(let i = 1; i < points.length; i++) {
                    d += ` L ${points[i].x} ${points[i].y}`;
                }
                d += ' Z';
                lassoOverlay.innerHTML = `<path d="${d}" stroke="#ff7a50" stroke-width="2" fill="rgba(255, 122, 80, 0.2)" />`;
            }
        }
    });

    canvas.addEventListener('pointerup', (e) => {
        if (modeEl.value === 'lasso' && lassoSelect.isDrawing()) {
            const poly = lassoSelect.end();
            const selectedObjects = lassoSelect.computeSelection(poly, camera, state.modelRoot);
            
            if (selectedObjects.length > 0) {
                // Select the first matched object (can be expanded to multi-select later)
                selectMesh(selectedObjects[0], transform, painter);
                selectionHistory.push([selectedObjects[0].uuid]);
            } else {
                selectMesh(null, transform, painter);
                selectionHistory.push([]);
            }
            lassoOverlay.innerHTML = ''; // Clear the visual path
        }
    });

    // ==========================================
    // 7. MODE SWITCHING & SLICE CONTROLS
    // ==========================================
    modeEl.addEventListener('change', () => {
        const mode = modeEl.value;
        transform.detach();
        
        document.getElementById('slice-controls').classList.toggle('hidden', mode !== 'slice');
        document.getElementById('paint-controls').classList.toggle('hidden', mode !== 'paint');
        
        if (state.selected && ['translate', 'rotate', 'scale'].includes(mode)) {
            transform.attach(state.selected);
            transform.setMode(mode);
        }
        
        state.clippingEnabled = (mode === 'slice');
        renderer.clippingPlanes = state.clippingEnabled ? [state.clippingPlane] : [];
        
        if (painter) painter.setEnabled(mode === 'paint');
    });

    document.getElementById('slice-toggle').addEventListener('click', () => {
        state.clippingEnabled = !state.clippingEnabled;
        renderer.clippingPlanes = state.clippingEnabled ? [state.clippingPlane] : [];
    });

    ['slice-x', 'slice-y', 'slice-z'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            const x = parseFloat(document.getElementById(id).value);
            const y = parseFloat(document.getElementById('slice-y').value);
            const z = parseFloat(document.getElementById('slice-z').value);
            state.clippingPlane.normal.set(x, y, z).normalize();
        });
    });

    const sliceDistance = document.getElementById('slice-distance');
    if (sliceDistance) {
        sliceDistance.addEventListener('input', (e) => {
            state.clippingPlane.constant = parseFloat(e.target.value);
        });
    }

    // ==========================================
    // 8. MISC UI HOOKS
    // ==========================================
    document.getElementById('show-gizmo').addEventListener('change', (e) => {
        transform.visible = !!e.target.checked;
    });

    document.getElementById('brush-color').addEventListener('input', (e) => painter.setColor(e.target.value));
    document.getElementById('brush-size').addEventListener('input', (e) => painter.setSize(parseInt(e.target.value)));
    document.getElementById('clear-paint').addEventListener('click', () => painter.clear());

    // --- Zoom to Fit button ---
    const zoomFitBtn = document.getElementById('btn-zoom-fit');
    if (zoomFitBtn) {
        zoomFitBtn.addEventListener('click', () => {
            // Zoom to selected mesh if one is active, otherwise whole model
            const target = state.selected || state.modelRoot;
            zoomToFit(camera, orbit, target);
        });
    }

    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const helpClose = document.getElementById('help-close');
    if (helpBtn) helpBtn.addEventListener('click', () => helpModal && helpModal.classList.toggle('hidden'));
    if (helpClose) helpClose.addEventListener('click', () => helpModal && helpModal.classList.add('hidden'));

    const snapCheckbox = document.getElementById('snap-toggle');
    window.addEventListener('pointerup', () => {
        const sel = state.selected;
        if (!sel || !snapCheckbox.checked) return;
        const step = 0.1;
        sel.position.x = Math.round(sel.position.x / step) * step;
        sel.position.y = Math.round(sel.position.y / step) * step;
        sel.position.z = Math.round(sel.position.z / step) * step;
        sel.rotation.x = Math.round(sel.rotation.x * 100) / 100;
        sel.rotation.y = Math.round(sel.rotation.y * 100) / 100;
        sel.rotation.z = Math.round(sel.rotation.z * 100) / 100;
        sel.scale.x = Math.round(sel.scale.x * 100) / 100;
        sel.scale.y = Math.round(sel.scale.y * 100) / 100;
        sel.scale.z = Math.round(sel.scale.z * 100) / 100;
    });

    // Resize handled by scene.js initScene — duplicate removed.

    // ==========================================
    // 9. ANIMATION LOOP
    // ==========================================
    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const dt = clock.getDelta();
        if (painter && painter.update) painter.update(dt);
        if (orbit && orbit.update) orbit.update();
        renderer.render(scene, camera);
    }
    animate();

    // ==========================================
    // 10. GLOBAL HELPERS
    // ==========================================
    window.generateGalleryThumbnails = function() {
        state.modelRoot.children.forEach(child => {
            if (child.isMesh || child.isGroup) {
                const thumbData = generateThumbnail(child, renderer, scene);
                console.log(`Thumbnail for ${child.name || child.uuid}:`, thumbData.substring(0, 50) + '...');
            }
        });
    };

    // ==========================================
    // 11. SCULPT MODE (sculpting.js)
    // Drag-to-sculpt the currently selected mesh. Tool type, radius, strength
    // are read from the new sculpt-controls panel. Uses raycaster for hit
    // point + face normal.
    // ==========================================
    const sculptTool     = document.getElementById('sculpt-tool');
    const sculptRadius   = document.getElementById('sculpt-radius');
    const sculptStrength = document.getElementById('sculpt-strength');
    const sculptRadiusVal   = document.getElementById('sculpt-radius-val');
    const sculptStrengthVal = document.getElementById('sculpt-strength-val');
    const sculptSmoothBtn   = document.getElementById('sculpt-smooth-btn');
    const sculptState       = window.sculptState;

    // Inline the sculpt-controls toggle into the existing mode-change handler
    if (modeEl) {
        modeEl.addEventListener('change', () => {
            const ctrls = ['sculpt-controls'];
            ctrls.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.toggle('hidden', modeEl.value !== id.replace('-controls', ''));
            });
        });
    }
    if (sculptRadius)   sculptRadius.addEventListener('input',   () => sculptRadiusVal.textContent   = sculptRadius.value);
    if (sculptStrength) sculptStrength.addEventListener('input', () => sculptStrengthVal.textContent = sculptStrength.value);

    canvas.addEventListener('pointerdown', (e) => {
        if (modeEl.value !== 'sculpt' || !state.selected) return;
        sculptState.active = false;
        const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        sculptState.ray.setFromCamera(ndc, camera);
        const hits = sculptState.ray.intersectObject(state.selected, true);
        if (hits.length === 0) return;
        sculptState.active = true;
        sculptState.point.copy(hits[0].point);
        if (hits[0].face) {
            sculptState.normal.copy(hits[0].face.normal);
            sculptState.normal.transformDirection(hits[0].object.matrixWorld).normalize();
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!sculptState.active || modeEl.value !== 'sculpt' || !state.selected) return;
        const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        sculptState.ray.setFromCamera(ndc, camera);
        const hits = sculptState.ray.intersectObject(state.selected, true);
        if (hits.length === 0) return;
        sculptState.point.copy(hits[0].point);
        if (hits[0].face) {
            sculptState.normal.copy(hits[0].face.normal);
            sculptState.normal.transformDirection(hits[0].object.matrixWorld).normalize();
        }
        applySculptTool(
            state.selected,
            sculptState.point,
            sculptState.normal,
            parseFloat(sculptRadius.value),
            parseFloat(sculptStrength.value),
            sculptTool.value
        );
    });

    canvas.addEventListener('pointerup', () => { sculptState.active = false; });

    if (sculptSmoothBtn) sculptSmoothBtn.addEventListener('click', () => {
        if (state.selected) applySmoothTool(state.selected, 3, 0.5);
    });

    // ==========================================
    // 12. MODIFIERS (modifiers.js)
    // ==========================================
    const modHollowBtn = document.getElementById('mod-hollow-btn');
    if (modHollowBtn) modHollowBtn.addEventListener('click', () => {
        if (!state.selected) return;
        const ok = confirm('Hollow Out: create inner shell & merge with selected mesh. Continue?');
        if (!ok) return;
        hollowOut(state.selected, 0.1);
    });

    // Expose patch helpers on window so the late uiPanels (which reads selection.indices)
    // can still be triggered from a future UI without re-wiring.
    window.modifyHollowOut = (mesh, thickness = 0.1) => mesh && hollowOut(mesh, thickness);
    window.modifyPatchHole = (mesh, indices) => mesh && patchHole(mesh, indices || []);

    // ==========================================
    // 13. RIGGING (rigging.js)
    // Click each rig slot → file JSON → uploadBoneData → visual shell.
    // Auto-Rig button → startGenerativeTask.
    // ==========================================
    ['left1', 'right1', 'left2', 'right2'].forEach(slotId => {
        const slotEl = document.getElementById('rig-slot-' + slotId);
        if (!slotEl) return;
        slotEl.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = (e) => {
                const f = e.target.files && e.target.files[0];
                if (f) {
                    uploadBoneData(slotId, f);
                }
            };
            input.click();
        });
        // Right-click to download the slot's stored skeleton
        slotEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (rigSlots[slotId]) downloadBoneData(slotId);
            else alert(`Slot ${slotId} is empty — upload a bone JSON first.`);
        });
    });

    const rigGenerate = document.getElementById('rig-generate');
    if (rigGenerate) rigGenerate.addEventListener('click', startGenerativeTask);

    // ==========================================
    // 14. WIREFRAME EDITOR (wireframeEditor.js)
    // Key shortcuts:  T  → append tri using last 3 vertices
    //                 Shift+T → remove first face
    //                 Shift+L → draw a custom line from origin to (1,1,1)
    // (kept out of the main UI grid to avoid clashing with rotate 'r')
    // ==========================================
    window.addEventListener('keydown', (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        // Avoid clobbering undo/redo; require Alt modifier as the modifier prefix.
        if (!e.altKey || e.shiftKey) return;
        if (!state.selected || !state.selected.geometry) return;
        const key = e.key.toLowerCase();
        if (key === 't') {
            e.preventDefault();
            const pos = state.selected.geometry.attributes.position;
            if (!pos || pos.count < 3) return;
            addTriangle(state.selected, pos.count - 3, pos.count - 2, pos.count - 1);
        } else if (key === 'r') {
            e.preventDefault();
            if (state.selected.geometry.index && state.selected.geometry.index.count >= 3) {
                removeTriangle(state.selected, 0);
            } else if (state.selected.geometry.attributes.position.count >= 3) {
                // Non-indexed: rebuild a smaller geometry to drop the first triangle.
                state.selected.geometry.setDrawRange(3, Infinity);
            }
        } else if (key === 'l') {
            e.preventDefault();
            drawCustomLine(scene, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
        }
    });

})();

