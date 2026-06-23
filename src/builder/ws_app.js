import * as THREE from "three";
import { state, initState } from "./ws_state.js";
import { initWorkshopScene } from "./ws_scene.js";
import { initControls, setupSelection, selectMesh, traverseMeshes } from "./ws_controls.js";
import { setupLoaderUI } from "./ws_loaders.js";
import { setupOperations } from "./ws_operations.js";
import { setupExporter } from "./ws_exporter.js";
import { setupAgent } from "./ws_agent.js";
import { initPainter } from "./ws_painter.js";
import { initSelection } from "./ws_selection.js";
import { initUIPanels } from "./ws_uiPanels.js";
import { generateThumbnail } from "./ws_gallery.js";
import { initSelectionHistory } from "./ws_selectionHistory.js";
import { initSelectGroups } from "./ws_selectGroups.js";
import { initLassoSelect } from "./ws_lassoSelect.js";

/**
 * Initialize the 3D Workshop using the game's existing renderer.
 * Returns an object with enter/exit/update functions for the game to call.
 *
 * @param {object} game - The game state object
 * @param {THREE.WebGLRenderer} game.renderer - The game's renderer
 * @param {HTMLCanvasElement} game.canvas - The game's canvas
 */
export function initWorkshop(game) {
    // Initialize core state
    initState();
    const { renderer, scene, camera } = initWorkshopScene(game.canvas, game.renderer);
    scene.add(state.modelRoot);

    // Initialize controls & painter
    const { orbit, transform } = initControls(camera, renderer.domElement);
    scene.add(transform);
    const painter = initPainter({ renderer, camera, scene, dom: renderer.domElement });

    // Initialize advanced modules
    const selectionHistory = initSelectionHistory();
    const selectGroups = initSelectGroups(state.modelRoot);
    const lassoSelect = initLassoSelect();

    // Helper to find an object in the scene by its UUID
    function findByUUID(root, uuid) {
        let found = null;
        root.traverse(c => { if (c.uuid === uuid) found = c; });
        return found;
    }

    // Wire up core features
    setupLoaderUI();
    setupOperations(transform, painter);
    setupExporter();
    setupAgent();

    // Wrap selection to automatically push to history and reset mesh highlights via traverseMeshes
    setupSelection(renderer, camera, (mesh) => {
        selectMesh(mesh, transform, painter);
        selectionHistory.push(mesh ? [mesh.uuid] : []);
    });
    // Expose traverseMeshes on workshopRefs for external mesh iteration
    game._traverseMeshes = traverseMeshes;

    initSelection(scene);
    initUIPanels();

    // Lasso tool integration
    const modeEl = document.getElementById('mode');
    const lassoOption = document.createElement('option');
    lassoOption.value = 'lasso';
    lassoOption.textContent = 'Lasso Select';
    if (modeEl) modeEl.appendChild(lassoOption);

    // SVG overlay for lasso path
    const lassoOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    lassoOverlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;";
    document.body.appendChild(lassoOverlay);

    renderer.domElement.addEventListener('pointerdown', (e) => {
        if (modeEl && modeEl.value === 'lasso') {
            lassoSelect.start(e.clientX, e.clientY);
        }
    });

    renderer.domElement.addEventListener('pointermove', (e) => {
        if (modeEl && modeEl.value === 'lasso' && lassoSelect.isDrawing()) {
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

    renderer.domElement.addEventListener('pointerup', (_e) => {
        if (modeEl && modeEl.value === 'lasso' && lassoSelect.isDrawing()) {
            const poly = lassoSelect.end();
            const selectedObjects = lassoSelect.computeSelection(poly, camera, state.modelRoot);

            if (selectedObjects.length > 0) {
                selectMesh(selectedObjects[0], transform, painter);
                selectionHistory.push([selectedObjects[0].uuid]);
            } else {
                selectMesh(null, transform, painter);
                selectionHistory.push([]);
            }
            lassoOverlay.innerHTML = '';
        }
    });

    // Mode switching & slice controls
    if (modeEl) {
        modeEl.addEventListener('change', () => {
            const mode = modeEl.value;
            transform.detach();

            const sliceControls = document.getElementById('slice-controls');
            const paintControls = document.getElementById('paint-controls');
            if (sliceControls) sliceControls.classList.toggle('hidden', mode !== 'slice');
            if (paintControls) paintControls.classList.toggle('hidden', mode !== 'paint');

            if (state.selected && ['translate', 'rotate', 'scale'].includes(mode)) {
                transform.attach(state.selected);
                transform.setMode(mode);
            }

            state.clippingEnabled = (mode === 'slice');
            renderer.clippingPlanes = state.clippingEnabled ? [state.clippingPlane] : [];

            if (painter) painter.setEnabled(mode === 'paint');
        });
    }

    const sliceToggle = document.getElementById('slice-toggle');
    if (sliceToggle) {
        sliceToggle.addEventListener('click', () => {
            state.clippingEnabled = !state.clippingEnabled;
            renderer.clippingPlanes = state.clippingEnabled ? [state.clippingPlane] : [];
        });
    }

    ['slice-x', 'slice-y', 'slice-z'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                const x = parseFloat(document.getElementById('slice-x').value);
                const y = parseFloat(document.getElementById('slice-y').value);
                const z = parseFloat(document.getElementById('slice-z').value);
                state.clippingPlane.normal.set(x, y, z).normalize();
            });
        }
    });

    const sliceDistance = document.getElementById('slice-distance');
    if (sliceDistance) {
        sliceDistance.addEventListener('input', (e) => {
            state.clippingPlane.constant = parseFloat(e.target.value);
        });
    }

    // Misc UI hooks
    const showGizmo = document.getElementById('show-gizmo');
    if (showGizmo) {
        showGizmo.addEventListener('change', (e) => {
            transform.visible = !!e.target.checked;
        });
    }

    const brushColor = document.getElementById('brush-color');
    if (brushColor) brushColor.addEventListener('input', (e) => { painter.setColor(e.target.value); });

    const brushSize = document.getElementById('brush-size');
    if (brushSize) brushSize.addEventListener('input', (e) => { painter.setSize(parseInt(e.target.value)); });

    const clearPaint = document.getElementById('clear-paint');
    if (clearPaint) clearPaint.addEventListener('click', () => painter.clear());

    // Undo/redo keyboard shortcuts
    const keyHandler = (e) => {
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
    };
    window.addEventListener('keydown', keyHandler);

    // Store references for cleanup and expose to game for thumbnail generation
    const workshopRefs = {
        scene,
        camera,
        orbit,
        transform,
        painter,
        selectionHistory,
        selectGroups,
        lassoSelect,
        lassoOverlay,
        keyHandler,
        modeEl,
        generateThumbnail
    };
    // Attach to game so external code can generate thumbnails from the workshop
    game._workshopRefs = workshopRefs;

    return {
        /**
         * Enter workshop mode — make scene visible and start rendering.
         */
        enter() {
            // Hide game scene, show workshop scene
            if (game.scene) game.scene.visible = false;
            scene.visible = true;

            // Show workshop UI panels
            const panelsContainer = document.getElementById('ui-panels-container');
            if (panelsContainer) panelsContainer.style.display = '';

            // Attach controls
            orbit.enabled = true;

            console.info(`Workshop v${THREE.REVISION}: entered`);
        },

        /**
         * Exit workshop mode — hide scene, restore game.
         */
        exit() {
            scene.visible = false;
            if (game.scene) game.scene.visible = true;

            // Hide workshop UI panels
            const panelsContainer = document.getElementById('ui-panels-container');
            if (panelsContainer) panelsContainer.style.display = 'none';

            // Detach transform controls
            transform.detach();
            orbit.enabled = false;

            console.info(`Workshop v${THREE.REVISION}: exited`);
        },

        /**
         * Called from the game's render loop to update workshop state.
         * @param {number} dt - delta time in seconds
         */
        update(dt) {
            if (!scene.visible) return;
            if (painter && painter.update) painter.update(dt);
            if (orbit && orbit.update) orbit.update();
            renderer.render(scene, camera);
        },

        /**
         * Cleanup all workshop resources.
         */
        dispose() {
            window.removeEventListener('keydown', keyHandler);
            if (lassoOverlay.parentNode) lassoOverlay.parentNode.removeChild(lassoOverlay);

            // Dispose all scene objects (meshes, groups, lights, etc.)
            scene.traverse((c) => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) {
                    const mats = Array.isArray(c.material) ? c.material : [c.material];
                    mats.forEach(m => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                }
            });

            // Restore game scene visibility
            if (game.scene) game.scene.visible = true;

            console.info('Workshop: disposed');
        },

        /** Expose internal state for debugging */
        getState() { return state; },
        getScene() { return scene; },
        getCamera() { return camera; }
    };
}
