const fs = require('fs');
const path = 'C:/Users/dividicus/Downloads/web_cloud_os_by_ou812/apps/sot_visualization.html';
let code = fs.readFileSync(path, 'utf8');
let changes = 0;

// ────────────────────────────────────────────────────────────
// 1. Add panel-toggle CSS styles
// ────────────────────────────────────────────────────────────
const cssToggleBtn = `.panel-toggle-btn {
    position:absolute; top:6px; right:8px; cursor:pointer;
    background:rgba(0,255,255,0.15); border:1px solid rgba(0,255,255,0.3);
    color:#0ff; font-size:14px; line-height:1; padding:2px 6px; border-radius:4px;
    z-index:10; transition:all 0.2s; font-family:'Courier New',monospace;
    pointer-events:auto !important;
}
.panel-toggle-btn:hover { background:rgba(0,255,255,0.35); border-color:#0ff; }
.panel-hidden { display:none !important; }
#info.panel-minimized, #controls.panel-minimized {
    width:auto !important; max-width:none !important; padding:5px 8px !important;
    overflow:hidden; cursor:pointer;
}
#info.panel-minimized > *:not(.panel-toggle-btn) { display:none; }
#controls.panel-minimized > *:not(.panel-toggle-btn) { display:none; }
#info .panel-toggle-btn { top:6px; right:8px; }
#controls .panel-toggle-btn { top:50%; right:8px; transform:translateY(-50%); }`;

// Insert after #info CSS rule's closing brace
const cssInsertPoint = '    pointer-events:none;\n}';

if (code.includes(cssInsertPoint)) {
    // Check if already added
    if (!code.includes('panel-toggle-btn')) {
        code = code.replace(cssInsertPoint, cssInsertPoint + '\n\n' + cssToggleBtn);
        changes++;
        console.log('✓ CSS toggle styles added');
    } else {
        console.log('~ CSS already exists');
    }
} else {
    console.log('✗ CSS insertion point not found');
}

// ────────────────────────────────────────────────────────────
// 2. Add toggle button to #info panel
// ────────────────────────────────────────────────────────────
const infoOpen = `<div id="info">\n    <h3 style="margin-top:0; color:#0ff;">Structural Obstruction Theory</h3>`;
const infoWithToggle = `<div id="info">\n    <span class="panel-toggle-btn" data-panel="info" title="Toggle info panel">\u2013</span>\n    <h3 style="margin-top:0; color:#0ff;">Structural Obstruction Theory</h3>`;

if (code.includes(infoOpen)) {
    if (!code.includes('data-panel="info"')) {
        code = code.replace(infoOpen, infoWithToggle);
        changes++;
        console.log('✓ Info panel toggle button added');
    } else {
        console.log('~ Info toggle already exists');
    }
} else {
    console.log('✗ Info panel open pattern not found');
}

// ────────────────────────────────────────────────────────────
// 3. Add toggle button to #controls panel
// ────────────────────────────────────────────────────────────
const controlsHTML = `<div id="controls">Mouse: Rotate | Scroll: Zoom | Click: Select Problem | L: Legend</div>`;
const controlsWithToggle = `<div id="controls">\n    <span class="panel-toggle-btn" data-panel="controls" title="Toggle controls panel">\u2013</span>\n    Mouse: Rotate | Scroll: Zoom | Click: Select Problem | L: Legend\n</div>`;

if (code.includes(controlsHTML)) {
    if (!code.includes('data-panel="controls"')) {
        code = code.replace(controlsHTML, controlsWithToggle);
        changes++;
        console.log('✓ Controls panel toggle button added');
    } else {
        console.log('~ Controls toggle already exists');
    }
} else {
    console.log('✗ Controls panel pattern not found');
}

// ────────────────────────────────────────────────────────────
// 4. Add panel toggle JS (before the animate() call)
// ────────────────────────────────────────────────────────────
const animateLine = `requestAnimationFrame(animate);`;

const panelToggleJS = `
// ── Panel Toggle System ──
const PANEL_STATES_KEY = 'sot_panel_states';
(function initPanelToggles() {
    // Restore saved states
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(PANEL_STATES_KEY)) || {}; } catch(e) {}
    
    document.querySelectorAll('.panel-toggle-btn').forEach(function(btn) {
        const panelId = btn.dataset.panel;
        const panel = document.getElementById(panelId);
        if (!panel) return;
        
        // Restore saved minimized state
        const wasMinimized = saved[panelId] === true;
        if (wasMinimized) {
            panel.classList.add('panel-minimized');
            btn.textContent = '+' + btn.textContent.replace('-','').replace('+','');
        }
        
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            panel.classList.toggle('panel-minimized');
            const isMin = panel.classList.contains('panel-minimized');
            // Toggle between - and + symbols
            btn.textContent = isMin ? '+' : '\\u2013';
            // Save state
            saved[panelId] = isMin;
            try { localStorage.setItem(PANEL_STATES_KEY, JSON.stringify(saved)); } catch(ex) {}
        });
    });
    
    // Keyboard shortcuts: 1=toggle info, 2=toggle controls
    document.addEventListener('keydown', function(e) {
        if (e.key === '1') {
            const infoBtn = document.querySelector('[data-panel="info"]');
            if (infoBtn) infoBtn.click();
        } else if (e.key === '2') {
            const ctrlBtn = document.querySelector('[data-panel="controls"]');
            if (ctrlBtn) ctrlBtn.click();
        }
    });
})();
`;

if (code.includes(animateLine)) {
    const animateIdx = code.indexOf(animateLine);
    // Insert before the animate line but after any nearby code
    const beforeAnimate = code.substring(0, animateIdx);
    const afterAnimate = code.substring(animateIdx);
    code = beforeAnimate + panelToggleJS + '\n' + afterAnimate;
    changes++;
    console.log('✓ Panel toggle JS added');
} else {
    console.log('✗ animate line not found');
}

// ────────────────────────────────────────────────────────────
// 5. Save and report
// ────────────────────────────────────────────────────────────
fs.writeFileSync(path, code, 'utf8');
console.log('✓ Saved (' + changes + ' changes)');
