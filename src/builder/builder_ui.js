/*
 Builder UI.
 Renders the categorized slot grid of parts, selection state,
 placement controls, and action buttons (undo, clear, play, export).
 Injected into the overlay when builder mode is active.
*/

import { PART_CATEGORIES, getPartsByCategory } from './catalog.js';

/**
 * Render the full builder UI into the overlay.
 */
export function renderBuilderUI(game) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    overlay.style.alignItems = 'flex-start';
    overlay.style.justifyContent = 'flex-end';
    overlay.style.padding = '0';
    overlay.innerHTML = '';

    // Sidebar container
    const sidebar = document.createElement('div');
    sidebar.id = 'builder-sidebar';
    sidebar.style.cssText = `
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: 340px;
        background: linear-gradient(180deg, rgba(20,20,35,0.97), rgba(15,15,25,0.97));
        border-left: 2px solid rgba(255,255,255,0.1);
        display: flex;
        flex-direction: column;
        z-index: 10000;
        overflow-y: auto;
        pointer-events: auto;
        box-shadow: -4px 0 24px rgba(0,0,0,0.5);
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    header.innerHTML = `
        <span style="color:#fff;font-weight:700;font-size:16px;font-family:'5x5dots',monospace;">🔧 TRACK BUILDER</span>
        <button id="builder-exit-btn" class="menu-btn" aria-label="Exit builder" style="font-size:11px;padding:4px 10px;">✕ EXIT</button>
    `;
    sidebar.appendChild(header);

    // Part count
    const countBar = document.createElement('div');
    countBar.id = 'builder-count';
    countBar.style.cssText = `
        padding: 8px 16px;
        color: #aaa;
        font-size: 11px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        font-family: 'Segoe UI', sans-serif;
    `;
    countBar.innerText = `Parts placed: ${game._builderPlacedParts ? game._builderPlacedParts.length : 0}`;
    sidebar.appendChild(countBar);

    // Category tabs
    const tabs = document.createElement('div');
    tabs.id = 'builder-tabs';
    tabs.style.cssText = `
        display: flex;
        gap: 4px;
        padding: 8px 12px;
        overflow-x: auto;
        border-bottom: 1px solid rgba(255,255,255,0.05);
    `;

    PART_CATEGORIES.forEach((cat, idx) => {
        const tab = document.createElement('button');
        tab.className = 'builder-tab';
        tab.dataset.category = cat.id;
        tab.style.cssText = `
            padding: 6px 10px;
            font-size: 10px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.15);
            background: ${idx === 0 ? 'rgba(255,255,255,0.12)' : 'transparent'};
            color: ${idx === 0 ? '#fff' : '#aaa'};
            cursor: pointer;
            white-space: nowrap;
            font-family: 'Segoe UI', sans-serif;
            transition: background 0.2s;
        `;
        tab.innerText = `${cat.icon} ${cat.label}`;
        tabs.appendChild(tab);
    });
    sidebar.appendChild(tabs);

    // Part grid
    const grid = document.createElement('div');
    grid.id = 'builder-part-grid';
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        padding: 12px;
        flex: 1;
        overflow-y: auto;
    `;
    sidebar.appendChild(grid);

    // Action bar
    const actions = document.createElement('div');
    actions.id = 'builder-actions';
    actions.style.cssText = `
        padding: 12px;
        border-top: 1px solid rgba(255,255,255,0.08);
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    `;
    actions.innerHTML = `
        <button id="builder-undo-btn" class="menu-btn" aria-label="Undo" style="font-size:10px;padding:6px 10px;">↩ UNDO</button>
        <button id="builder-clear-btn" class="menu-btn" aria-label="Clear all" style="font-size:10px;padding:6px 10px;">🗑 CLEAR</button>
        <button id="builder-play-btn" class="menu-btn" aria-label="Play this track" style="font-size:10px;padding:6px 10px;background:rgba(0,180,0,0.4);border-color:#44ff44;">▶ PLAY</button>
        <button id="builder-save-btn" class="menu-btn" aria-label="Save track" style="font-size:10px;padding:6px 10px;">💾 SAVE</button>
        <button id="builder-load-btn" class="menu-btn" aria-label="Load track" style="font-size:10px;padding:6px 10px;">📂 LOAD</button>
        <button id="builder-share-btn" class="menu-btn" aria-label="Share to community" style="font-size:10px;padding:6px 10px;background:rgba(100,40,180,0.4);border-color:#9944ff;">🌐 SHARE</button>
        <button id="builder-community-btn" class="menu-btn" aria-label="Load from community" style="font-size:10px;padding:6px 10px;">🌍 COMMUNITY</button>
        <button id="builder-export-btn" class="menu-btn" aria-label="Export track" style="font-size:10px;padding:6px 10px;">📋 EXPORT</button>
    `;
    sidebar.appendChild(actions);

    // Status bar container (static outer, dynamic inner)
    const statusWrap = document.createElement('div');
    statusWrap.style.cssText = `
        padding: 8px 12px;
        border-top: 1px solid rgba(255,255,255,0.05);
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        font-family: 'Segoe UI', sans-serif;
    `;

    // Static rotate button — persists across status refreshes
    const rotateBtn = document.createElement('button');
    rotateBtn.id = 'builder-rotate-btn';
    rotateBtn.setAttribute('aria-label', 'Rotate part 90°');
    rotateBtn.style.cssText = `
        background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#fff;
        border-radius:6px;cursor:pointer;font-size:10px;padding:3px 7px;
        font-family:'Segoe UI',sans-serif;transition:background 0.15s;flex-shrink:0;
    `;
    rotateBtn.innerText = '🔄';
    rotateBtn.addEventListener('mouseenter', () => { rotateBtn.style.background = 'rgba(255,255,255,0.18)'; });
    rotateBtn.addEventListener('mouseleave', () => { rotateBtn.style.background = 'rgba(255,255,255,0.08)'; });
    statusWrap.appendChild(rotateBtn);

    // Dynamic status text
    const status = document.createElement('div');
    status.id = 'builder-status';
    status.style.cssText = `
        font-size: 10px;
        color: #888;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        font-family: 'Segoe UI', sans-serif;
        flex: 1;
    `;
    updateBuilderStatus(game, status);
    statusWrap.appendChild(status);

    sidebar.appendChild(statusWrap);

    overlay.appendChild(sidebar);

    // Render first category
    renderPartGrid(game, 'surface');

    // Wire events after DOM is populated
    requestAnimationFrame(() => wireBuilderUIEvents(game));
}

/**
 * Render the part grid for a selected category.
 */
function renderPartGrid(game, categoryId) {
    const grid = document.getElementById('builder-part-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const parts = getPartsByCategory(categoryId);

    parts.forEach(part => {
        const card = document.createElement('div');
        const isSelected = game._builderSelectedKey === part.key;

        card.className = 'builder-part-card';
        card.dataset.partKey = part.key;
        card.style.cssText = `
            background: ${isSelected ? 'rgba(255,204,0,0.18)' : 'rgba(255,255,255,0.06)'};
            border: 2px solid ${isSelected ? '#ffcc00' : 'rgba(255,255,255,0.12)'};
            border-radius: 10px;
            padding: 10px;
            cursor: pointer;
            text-align: center;
            transition: all 0.2s;
            font-family: 'Segoe UI', sans-serif;
        `;

        card.innerHTML = `
            <div style="font-size:28px;margin-bottom:4px;">${part.icon}</div>
            <div style="font-size:11px;color:#ddd;font-weight:600;">${part.name}</div>
            <div style="font-size:9px;color:#888;margin-top:2px;">${part.description || ''}</div>
        `;

        grid.appendChild(card);
    });
}

/**
 * Wire all builder UI event listeners.
 */
function wireBuilderUIEvents(game) {
    // Exit button
    const exitBtn = document.getElementById('builder-exit-btn');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            exitBuilder(game);
        });
    }

    // Category tabs
    document.querySelectorAll('.builder-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Update tab styles
            document.querySelectorAll('.builder-tab').forEach(t => {
                t.style.background = 'transparent';
                t.style.color = '#aaa';
            });
            tab.style.background = 'rgba(255,255,255,0.12)';
            tab.style.color = '#fff';
            game._builderSelectedCategory = tab.dataset.category;
            renderPartGrid(game, tab.dataset.category);
            updateBuilderStatus(game);
        });
    });

    // Part cards
    document.querySelectorAll('.builder-part-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.dataset.partKey;
            game._builderSelectedKey = key;

            // Update card highlights
            document.querySelectorAll('.builder-part-card').forEach(c => {
                c.style.background = 'rgba(255,255,255,0.06)';
                c.style.borderColor = 'rgba(255,255,255,0.12)';
            });
            card.style.background = 'rgba(255,204,0,0.18)';
            card.style.borderColor = '#ffcc00';
            updateBuilderStatus(game);
        });
    });

    // Undo
    const undoBtn = document.getElementById('builder-undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (typeof game._builderUndo === 'function') game._builderUndo();
            updateBuilderCount(game);
        });
    }

    // Clear
    const clearBtn = document.getElementById('builder-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear all placed parts?')) {
                if (typeof game._builderClear === 'function') game._builderClear();
                updateBuilderCount(game);
            }
        });
    }

    // Play
    const playBtn = document.getElementById('builder-play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (typeof game._builderPlay === 'function') game._builderPlay();
        });
    }

    // Save
    const saveBtn = document.getElementById('builder-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (typeof game._builderSave === 'function') game._builderSave();
        });
    }

    // Load
    const loadBtn = document.getElementById('builder-load-btn');
    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            const saved = localStorage.getItem('goingBalls_builder_tracks');
            if (!saved) { alert('No saved tracks found.'); return; }
            const tracks = JSON.parse(saved);
            const names = Object.keys(tracks);
            if (names.length === 0) { alert('No saved tracks found.'); return; }
            if (names.length === 1) {
                if (typeof game._builderLoad === 'function') game._builderLoad(names[0]);
                return;
            }
            const choice = prompt('Enter track name to load:\nSaved: ' + names.join(', '));
            if (choice && tracks[choice]) {
                if (typeof game._builderLoad === 'function') game._builderLoad(choice);
            }
        });
    }

    // Export
    const exportBtn = document.getElementById('builder-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (typeof game._builderExport === 'function') game._builderExport();
        });
    }

    // Share to community
    const shareBtn = document.getElementById('builder-share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (typeof game._builderShare === 'function') game._builderShare();
        });
    }

    // Load from community
    const communityBtn = document.getElementById('builder-community-btn');
    if (communityBtn) {
        communityBtn.addEventListener('click', () => {
            if (typeof game._builderLoadCommunity === 'function') game._builderLoadCommunity();
        });
    }

    // Rotate part
    const rotateBtn = document.getElementById('builder-rotate-btn');
    if (rotateBtn) {
        rotateBtn.addEventListener('click', () => {
            if (game._builderPendingPos) {
                game._builderPendingPos.rotation =
                    ((game._builderPendingPos.rotation || 0) + Math.PI / 2) % (Math.PI * 2);
                updateBuilderStatus(game);
            }
        });
    }
}

/**
 * Update the status bar with current selection info.
 */
export function updateBuilderStatus(game, statusEl) {
    const el = statusEl || document.getElementById('builder-status');
    if (!el) return;
    const partDef = getPartsByCategory(game._builderSelectedCategory || 'surface')
        .find(p => p.key === game._builderSelectedKey);
    const name = partDef ? partDef.name : 'None';
    const rot = game._builderPendingPos ? Math.round((game._builderPendingPos.rotation || 0) * 180 / Math.PI) % 360 : 0;
    el.innerHTML = `
        <span>🖱️ Left: place</span>
        <span>⇧ Left: delete</span>
        <span>🖱️ Right: pan</span>
        <span>🔍 Wheel: zoom</span>
        <span style="color:#ffcc00;">Sel: ${name} @ ${rot}°</span>
    `;
}

/**
 * Update the builder part count display only.
 */
export function updateBuilderCount(game) {
    const el = document.getElementById('builder-count');
    if (el) {
        el.innerText = `Parts placed: ${game._builderPlacedParts ? game._builderPlacedParts.length : 0}`;
    }
}

/**
 * Update the builder part count and status bar.
 */
export function updateBuilderUIState(game) {
    updateBuilderCount(game);
    updateBuilderStatus(game);
}

/**
 * Exit builder mode and return to the game.
 */
export function exitBuilder(game) {
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        overlay.style.alignItems = '';
        overlay.style.justifyContent = '';
        overlay.style.padding = '';
    }

    // Switch back to game scene
    game._builderActive = false;

    if (typeof game._onExitBuilder === 'function') {
        game._onExitBuilder();
    }
}
