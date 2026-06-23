// ws_uiPanels.js
import { selection, setMode, toggleSticky, selectAll, selectNone } from "./ws_selection.js";
import { applySmoothTool } from "./ws_sculpting.js";
import { hollowOut, patchHole } from "./ws_modifiers.js";
import { uploadBoneData, downloadBoneData, startGenerativeTask } from "./ws_rigging.js";
import { state } from "./ws_state.js";

export function initUIPanels() {
    const container = document.getElementById('ui-panels-container') || document.body;

    // 1. Selection Panel
    const selPanel = createPanel("Selection Tools");
    selPanel.innerHTML += `
        <button id="sel-vert">Vertex</button>
        <button id="sel-edge">Edge</button>
        <button id="sel-face">Face</button>
        <hr>
        <button id="sel-all">Select All</button>
        <button id="sel-none">Select None</button>
        <label><input type="checkbox" id="sel-sticky"> Sticky Select</label>
    `;
    container.appendChild(selPanel);

    document.getElementById('sel-vert').onclick = () => setMode('vertex');
    document.getElementById('sel-edge').onclick = () => setMode('edge');
    document.getElementById('sel-face').onclick = () => setMode('face');
    document.getElementById('sel-all').onclick = selectAll;
    document.getElementById('sel-none').onclick = selectNone;
    document.getElementById('sel-sticky').onchange = toggleSticky;

    // 2. Sculpt/Smooth Panel
    const sculptPanel = createPanel("Sculpt & Smooth");
    sculptPanel.innerHTML += `
        <button id="sculpt-grab">Grab</button>
        <button id="sculpt-inflate">Inflate</button>
        <button id="sculpt-smooth">Smooth</button>
        <label>Radius: <input type="range" id="sculpt-radius" min="0.1" max="2" step="0.1" value="0.5"></label>
    `;
    container.appendChild(sculptPanel);

    // Wire sculpting tools to mouse drag events (simplified)
    document.getElementById('sculpt-grab').onclick = () => { window.currentSculptTool = 'grab'; };
    document.getElementById('sculpt-inflate').onclick = () => { window.currentSculptTool = 'inflate'; };
    document.getElementById('sculpt-smooth').onclick = () => {
        if(state.selected) applySmoothTool(state.selected, 3, 0.5);
    };

    // 3. Modifiers Panel
    const modPanel = createPanel("Modifiers");
    modPanel.innerHTML += `
        <button id="mod-hollow">Hollow Out</button>
        <button id="mod-patch">Patch Hole</button>
    `;
    container.appendChild(modPanel);

    document.getElementById('mod-hollow').onclick = () => {
        if(state.selected) hollowOut(state.selected, 0.1);
    };
    document.getElementById('mod-patch').onclick = () => {
        if(state.selected) patchHole(state.selected, Array.from(selection.indices));
    };

    // 4. Rigging Panel (4 Slots)
    const rigPanel = createPanel("Rigging & Bones");
    rigPanel.innerHTML += `
        <div class="rig-grid">
            <div class="slot" data-slot="left1">L1: <button class="up">&#8593;</button> <button class="down">&#8595;</button></div>
            <div class="slot" data-slot="right1">R1: <button class="up">&#8593;</button> <button class="down">&#8595;</button></div>
            <div class="slot" data-slot="left2">L2: <button class="up">&#8593;</button> <button class="down">&#8595;</button></div>
            <div class="slot" data-slot="right2">R2: <button class="up">&#8593;</button> <button class="down">&#8595;</button></div>
        </div>
        <button id="rig-generate">Start Generative Task</button>
    `;
    container.appendChild(rigPanel);

    rigPanel.querySelectorAll('.slot').forEach(slotEl => {
        const slotId = slotEl.dataset.slot;
        slotEl.querySelector('.up').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.json';
            input.onchange = (ev) => uploadBoneData(slotId, ev.target.files[0]);
            input.click();
        };
        slotEl.querySelector('.down').onclick = () => { downloadBoneData(slotId); };
    });

    document.getElementById('rig-generate').onclick = startGenerativeTask;
}

function createPanel(title) {
    const div = document.createElement('div');
    div.className = 'tool-panel';
    div.innerHTML = `<h3>${title}</h3>`;
    div.style.cssText = "background:#222; color:#fff; padding:10px; margin:5px; border-radius:8px; display:inline-block; vertical-align:top;";
    return div;
}
