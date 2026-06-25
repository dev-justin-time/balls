/**
 * Builder Tool Panels — uses PanelWindowManager for floating, draggable tool panels.
 *
 * Each tool category (Selection, Sculpt, Modifiers, Rigging, Shaders) opens as a
 * draggable, resizable floating window (via PanelWindowManager ported from
 * Web Cloud OS). Replaces the old static div approach from the now-deprecated
 * ws_uiPanels.js.
 *
 * Usage:
 *   import { initBuilderPanels } from './panels/ws_panels.js';
 *   const pwm = initBuilderPanels(container);
 *   // pwm.hideAll() / pwm.showAll() to toggle visibility
 */

import { PanelWindowManager } from './panelWindowManager.js';
import { selection, setMode, toggleSticky, selectAll, selectNone } from '../ws_selection.js';
import { applySmoothTool } from '../ws_sculpting.js';
import { hollowOut, patchHole } from '../ws_modifiers.js';
import { uploadBoneData, downloadBoneData, startGenerativeTask } from '../ws_rigging.js';
import { state } from '../ws_state.js';

/**
 * Initialize the builder tool panels using the floating PanelWindowManager.
 *
 * @param {HTMLElement} container - The container element for floating panels
 * @returns {PanelWindowManager} The panel window manager instance
 */
export function initBuilderPanels(container) {
    const pwm = new PanelWindowManager(container, {
        baseZ: 1000,
        cascadeOffset: 28,
        minWidth: 220,
        minHeight: 120,
    });

    // 1. Selection Panel
    pwm.openPanel('Selection Tools', (win) => {
        win.body.innerHTML = `
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
                <button class="panel-btn" id="sel-vert">Vertex</button>
                <button class="panel-btn" id="sel-edge">Edge</button>
                <button class="panel-btn" id="sel-face">Face</button>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
                <button class="panel-btn" id="sel-all">Select All</button>
                <button class="panel-btn" id="sel-none">Select None</button>
            </div>
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#999;cursor:pointer;">
                <input type="checkbox" id="sel-sticky" style="accent-color:#a88bff;">
                Sticky Select
            </label>
        `;

        win.body.querySelector('#sel-vert').onclick = () => setMode('vertex');
        win.body.querySelector('#sel-edge').onclick = () => setMode('edge');
        win.body.querySelector('#sel-face').onclick = () => setMode('face');
        win.body.querySelector('#sel-all').onclick = selectAll;
        win.body.querySelector('#sel-none').onclick = selectNone;
        win.body.querySelector('#sel-sticky').onchange = toggleSticky;
    });

    // 2. Sculpt Panel
    pwm.openPanel('Sculpt & Smooth', (win) => {
        win.body.innerHTML = `
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
                <button class="panel-btn" id="sculpt-grab">Grab</button>
                <button class="panel-btn" id="sculpt-inflate">Inflate</button>
                <button class="panel-btn" id="sculpt-smooth">Smooth</button>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <label style="font-size:10px;color:#888;white-space:nowrap;">Radius:</label>
                <input type="range" id="sculpt-radius" min="0.1" max="2" step="0.1" value="0.5"
                    style="flex:1;height:3px;">
            </div>
        `;

        const sculptGrab = win.body.querySelector('#sculpt-grab');
        const sculptInflate = win.body.querySelector('#sculpt-inflate');
        const sculptSmooth = win.body.querySelector('#sculpt-smooth');

        if (sculptGrab) sculptGrab.onclick = () => { window.currentSculptTool = 'grab'; };
        if (sculptInflate) sculptInflate.onclick = () => { window.currentSculptTool = 'inflate'; };
        if (sculptSmooth) sculptSmooth.onclick = () => {
            if (state.selected) applySmoothTool(state.selected, 3, 0.5);
        };
    });

    // 3. Modifiers Panel
    pwm.openPanel('Modifiers', (win) => {
        win.body.innerHTML = `
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="panel-btn" id="mod-hollow">Hollow Out</button>
                <button class="panel-btn" id="mod-patch">Patch Hole</button>
            </div>
        `;

        win.body.querySelector('#mod-hollow').onclick = () => {
            if (state.selected) hollowOut(state.selected, 0.1);
        };
        win.body.querySelector('#mod-patch').onclick = () => {
            if (state.selected) patchHole(state.selected, Array.from(selection.indices));
        };
    });

    // 4. Rigging Panel
    pwm.openPanel('Rigging & Bones', (win) => {
        win.body.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">
                <div class="slot" data-slot="left1" style="display:flex;align-items:center;gap:4px;padding:4px;background:rgba(255,255,255,0.03);border-radius:4px;">
                    <span style="font-size:10px;color:#888;flex:1;">L1</span>
                    <button class="panel-btn-sm slot-up">↑</button>
                    <button class="panel-btn-sm slot-down">↓</button>
                </div>
                <div class="slot" data-slot="right1" style="display:flex;align-items:center;gap:4px;padding:4px;background:rgba(255,255,255,0.03);border-radius:4px;">
                    <span style="font-size:10px;color:#888;flex:1;">R1</span>
                    <button class="panel-btn-sm slot-up">↑</button>
                    <button class="panel-btn-sm slot-down">↓</button>
                </div>
                <div class="slot" data-slot="left2" style="display:flex;align-items:center;gap:4px;padding:4px;background:rgba(255,255,255,0.03);border-radius:4px;">
                    <span style="font-size:10px;color:#888;flex:1;">L2</span>
                    <button class="panel-btn-sm slot-up">↑</button>
                    <button class="panel-btn-sm slot-down">↓</button>
                </div>
                <div class="slot" data-slot="right2" style="display:flex;align-items:center;gap:4px;padding:4px;background:rgba(255,255,255,0.03);border-radius:4px;">
                    <span style="font-size:10px;color:#888;flex:1;">R2</span>
                    <button class="panel-btn-sm slot-up">↑</button>
                    <button class="panel-btn-sm slot-down">↓</button>
                </div>
            </div>
            <button class="panel-btn" id="rig-generate" style="width:100%;text-align:center;">
                🤖 Start Generative Task
            </button>
        `;

        win.body.querySelectorAll('.slot').forEach(slotEl => {
            const slotId = slotEl.dataset.slot;
            slotEl.querySelector('.slot-up').onclick = () => {
                const input = document.createElement('input');
                input.type = 'file'; input.accept = '.json';
                input.onchange = (ev) => uploadBoneData(slotId, ev.target.files[0]);
                input.click();
            };
            slotEl.querySelector('.slot-down').onclick = () => { downloadBoneData(slotId); };
        });

        win.body.querySelector('#rig-generate').onclick = startGenerativeTask;
    });

    // 5. Shader Effects Panel (opens the Lumen Shaders panel)
    pwm.openPanel('Shader Effects', (win) => {
        win.body.innerHTML = `
            <div style="font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;">
                Apply generative GPU shaders to your selected mesh. Modes cycle in a perfect loop.
            </div>
            <button id="btn-lumen-shaders" class="panel-btn" style="
                width:100%; padding:10px; text-align:center;
                background:linear-gradient(135deg,#1a1a2e,#2a1a3e);
                border:1px solid rgba(168,139,255,0.3); color:#c8b8ff;
            ">
                ✨ Open Lumen Shaders
                <span style="display:block;font-size:9px;color:#8877aa;margin-top:3px;">
                    Generative GPU shaders for your mesh
                </span>
            </button>
        `;

        win.body.querySelector('#btn-lumen-shaders').onclick = async () => {
            const { isShadersPanelOpen, openPanel } = await import('../ws_lumenshadersPanel.js');
            if (!isShadersPanelOpen()) openPanel();
        };
    });

    return pwm;
}
