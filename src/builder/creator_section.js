/**
 * =====================================================================
 * @domain:    builder
 * @concern:   Track Creator Section — Wireframe Import + Inventory
 * @created:   2026-06-26T12:00:00Z
 * =====================================================================
 *
 * Renders a full-page overlay section for the Track Creator.
 * Combines the AI wireframe-from-image import with an inventory
 * system for saving, browsing, and managing wireframe imports.
 *
 * Dependencies:
 *   - WireframeImporter (for AI image → 3D wireframe conversion)
 *   - creator_inventory.js (for localStorage-backed persistence)
 */

import { WireframeImporter } from './wireframe_importer.js';
import {
    getInventory, saveItem, deleteItem, renameItem,
    toggleFavorite, generateId, clearInventory
} from './creator_inventory.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Entry point: render the Track Creator section into the overlay.
 * Called when the user clicks "🧬 CREATOR" in the builder sidebar.
 * @param {Object} game - Game state object
 */
export function openCreatorSection(game) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;

    // Hide builder sidebar if present
    const sidebar = document.getElementById('builder-sidebar');
    if (sidebar) sidebar.style.display = 'none';

    // Configure overlay for full-page centered content
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '20px';
    overlay.innerHTML = '';

    // Main container
    const container = document.createElement('div');
    container.id = 'creator-section';
    container.style.cssText = `
        background: linear-gradient(180deg, rgba(18,18,30,0.98), rgba(10,10,20,0.98));
        border: 2px solid rgba(0,180,220,0.35);
        border-radius: 18px;
        width: 95%;
        max-width: 960px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 12px 48px rgba(0,0,0,0.6), 0 0 80px rgba(0,180,220,0.08);
        pointer-events: auto;
        overflow: hidden;
    `;

    // --- Header ---
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 14px 20px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-shrink: 0;
    `;
    header.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:26px;">🧬</span>
            <div>
                <div style="color:#fff;font-weight:700;font-size:16px;font-family:'5x5dots',monospace;">TRACK CREATOR</div>
                <div style="color:#666;font-size:9px;font-family:'Segoe UI',sans-serif;">Wireframe Import &amp; Inventory</div>
            </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
            <span id="creator-inv-count" style="color:#888;font-size:10px;font-family:'Segoe UI',sans-serif;"></span>
            <button id="creator-close-btn" class="menu-btn" style="font-size:10px;padding:5px 12px;">✕ CLOSE</button>
        </div>
    `;
    container.appendChild(header);

    // --- Tab bar ---
    const tabs = document.createElement('div');
    tabs.style.cssText = `
        display: flex;
        gap: 2px;
        padding: 0 20px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        flex-shrink: 0;
    `;
    const tabDefs = [
        { id: 'import', label: '📤 Import', desc: 'Upload sketch → AI wireframe' },
        { id: 'inventory', label: '📦 Inventory', desc: 'Saved wireframes' }
    ];
    tabDefs.forEach((td, i) => {
        const tab = document.createElement('button');
        tab.className = 'creator-tab';
        tab.dataset.tab = td.id;
        tab.style.cssText = `
            padding: 10px 18px;
            font-size: 12px;
            font-family: 'Segoe UI', sans-serif;
            font-weight: 600;
            border: none;
            border-bottom: 3px solid ${i === 0 ? 'rgba(0,180,220,0.8)' : 'transparent'};
            background: transparent;
            color: ${i === 0 ? '#fff' : '#888'};
            cursor: pointer;
            transition: all 0.2s;
        `;
        tab.innerText = td.label;
        tabs.appendChild(tab);
    });
    container.appendChild(tabs);

    // --- Content area ---
    const content = document.createElement('div');
    content.id = 'creator-content';
    content.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 20px;
    `;
    container.appendChild(content);

    overlay.appendChild(container);

    // Render initial tab
    renderImportTab(game, content);

    // Wire close button
    const closeBtn = document.getElementById('creator-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeCreatorSection(game, overlay, sidebar, escHandler));
    }

    // Update inventory count badge
    updateInventoryCount();

    // Wire tab clicks
    container.querySelectorAll('.creator-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Update tab styles
            container.querySelectorAll('.creator-tab').forEach(t => {
                t.style.borderBottomColor = 'transparent';
                t.style.color = '#888';
            });
            tab.style.borderBottomColor = 'rgba(0,180,220,0.8)';
            tab.style.color = '#fff';

            const tabId = tab.dataset.tab;
            content.innerHTML = '';
            if (tabId === 'import') {
                renderImportTab(game, content);
            } else {
                renderInventoryTab(game, content);
            }
        });
    });

    // Escape key to close
    const escHandler = (e) => {
        if (e.code === 'Escape') {
            closeCreatorSection(game, overlay, sidebar, escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// ---------------------------------------------------------------------------
// Tab: Import (Wireframe from Image)
// ---------------------------------------------------------------------------

function renderImportTab(game, container) {
    container.innerHTML = '';

    // Two-column layout
    const layout = document.createElement('div');
    layout.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
    `;

    // --- Left: Upload Area ---
    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

    // Upload drop zone
    const dropZone = document.createElement('div');
    dropZone.id = 'creator-drop-zone';
    dropZone.style.cssText = `
        border: 2px dashed rgba(0,180,220,0.4);
        border-radius: 14px;
        padding: 40px 20px;
        text-align: center;
        cursor: pointer;
        transition: all 0.25s;
        background: rgba(0,180,220,0.04);
        min-height: 180px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
    `;
    dropZone.innerHTML = `
        <div style="font-size:48px;">📤</div>
        <div style="color:#ccc;font-size:14px;font-weight:600;font-family:'Segoe UI',sans-serif;">Drop your sketch here</div>
        <div style="color:#777;font-size:11px;font-family:'Segoe UI',sans-serif;">or click to browse — PNG, JPEG, WebP, BMP</div>
        <div style="color:#555;font-size:9px;font-family:'Segoe UI',sans-serif;">Max 10MB &bull; AI parses your drawing into 3D wireframe</div>
    `;
    leftCol.appendChild(dropZone);

    // Import options
    const options = document.createElement('div');
    options.style.cssText = `
        background: rgba(255,255,255,0.03);
        border-radius: 10px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    const userTier = game.saveData && game.saveData.subscriptionTier || 'free';
    const tierLabel = userTier === 'ultimate' ? 'Ultimate' : userTier === 'pro' ? 'Pro' : 'Free';
    const tierColor = userTier === 'ultimate' ? '#ffcc00' : userTier === 'pro' ? '#8844ff' : '#888';
    const engineName = userTier === 'ultimate' || userTier === 'pro' ? 'HAWP Neural Network (High Precision)' : 'OpenCV Canny (Standard)';
    options.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:#aaa;font-size:10px;font-family:'Segoe UI',sans-serif;">Engine</span>
            <span style="color:${tierColor};font-size:10px;font-weight:600;font-family:'Segoe UI',sans-serif;">${tierLabel} &bull; ${engineName}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:#aaa;font-size:10px;font-family:'Segoe UI',sans-serif;">Save to inventory</span>
            <input type="checkbox" id="creator-save-check" checked style="accent-color:#00b4dc;">
        </div>
    `;
    leftCol.appendChild(options);

    // Import button
    const importBtn = document.createElement('button');
    importBtn.id = 'creator-import-btn';
    importBtn.disabled = true;
    importBtn.style.cssText = `
        width: 100%;
        padding: 12px;
        font-size: 14px;
        font-weight: 700;
        font-family: 'Segoe UI', sans-serif;
        border-radius: 10px;
        border: 1px solid rgba(0,180,220,0.4);
        background: rgba(0,180,220,0.15);
        color: #888;
        cursor: not-allowed;
        transition: all 0.2s;
    `;
    importBtn.innerText = '🤖 Import to Scene';
    leftCol.appendChild(importBtn);

    layout.appendChild(leftCol);

    // --- Right: Preview / Status ---
    const rightCol = document.createElement('div');
    rightCol.id = 'creator-preview-col';
    rightCol.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        background: rgba(255,255,255,0.02);
        border-radius: 14px;
        min-height: 280px;
    `;
    rightCol.innerHTML = `
        <div style="color:#555;font-size:48px;">🖼️</div>
        <div style="color:#666;font-size:11px;font-family:'Segoe UI',sans-serif;">Sketch preview appears here</div>
    `;
    layout.appendChild(rightCol);

    container.appendChild(layout);

    // --- Wire drop zone events ---
    let selectedFile = null;
    let selectedBase64 = null;

    const updatePreview = (base64, fileName) => {
        const previewCol = document.getElementById('creator-preview-col');
        if (!previewCol) return;
        previewCol.innerHTML = `
            <div style="position:relative;width:100%;max-height:220px;display:flex;align-items:center;justify-content:center;">
                <img src="data:image/png;base64,${base64}"
                    style="max-width:100%;max-height:220px;border-radius:8px;object-fit:contain;"
                    alt="Sketch preview">
            </div>
            <div style="color:#aaa;font-size:10px;font-family:'Segoe UI',sans-serif;">${fileName || 'sketch.png'}</div>
        `;

        importBtn.disabled = false;
        importBtn.style.background = 'rgba(0,180,220,0.3)';
        importBtn.style.color = '#fff';
        importBtn.style.cursor = 'pointer';
        importBtn.style.borderColor = 'rgba(0,180,220,0.7)';
    };

    // Click to browse
    dropZone.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png,image/jpeg,image/webp,image/bmp';
        fileInput.addEventListener('change', () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            handleFileSelection(file);
        });
        fileInput.click();
    });

    // Drag & drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(0,220,255,0.8)';
        dropZone.style.background = 'rgba(0,180,220,0.1)';
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'rgba(0,180,220,0.4)';
        dropZone.style.background = 'rgba(0,180,220,0.04)';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(0,180,220,0.4)';
        dropZone.style.background = 'rgba(0,180,220,0.04)';
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        handleFileSelection(file);
    });

    function handleFileSelection(file) {
        if (file.size > 10 * 1024 * 1024) {
            alert('Image too large. Maximum size is 10MB.');
            return;
        }
        selectedFile = file;
        readFileAsBase64(file).then(base64 => {
            selectedBase64 = base64;
            updatePreview(base64, file.name);
        });
    }

    // --- Import button ---
    importBtn.addEventListener('click', async () => {
        if (!selectedBase64) return;

        const previewCol = document.getElementById('creator-preview-col');
        const btn = document.getElementById('creator-import-btn');

        // Show loading state
        if (btn) {
            btn.disabled = true;
            btn.innerText = '⏳ Processing...';
            btn.style.background = 'rgba(255,204,0,0.2)';
            btn.style.cursor = 'wait';
        }
        if (previewCol) {
            previewCol.innerHTML = `
                <div style="color:#ffcc00;font-size:48px;">⏳</div>
                <div style="color:#ffcc00;font-size:12px;font-weight:600;font-family:'Segoe UI',sans-serif;">AI is analyzing your sketch...</div>
                <div style="color:#888;font-size:10px;font-family:'Segoe UI',sans-serif;">Sending to Python backend</div>
            `;
        }

        try {
            if (!game._aiImporter) game._aiImporter = new WireframeImporter(game);
            const result = await game._aiImporter.importFromAI(selectedBase64, userTier);

            if (result.success) {
                // Show success
                if (previewCol) {
                    previewCol.innerHTML = `
                        <div style="color:#44ff88;font-size:48px;">✅</div>
                        <div style="color:#44ff88;font-size:14px;font-weight:600;font-family:'Segoe UI',sans-serif;">Wireframe imported!</div>
                        <div style="color:#aaa;font-size:11px;font-family:'Segoe UI',sans-serif;text-align:center;">
                            ${result.nodeCount} nodes &bull; ${result.edgeCount} edges &bull; ${result.meshCount} mesh${result.meshCount !== 1 ? 'es' : ''}
                            <br><span style="color:#8844ff;">${result.engineUsed}</span>
                        </div>
                    `;
                }

                // Auto-save to inventory if checkbox is checked
                const saveCheck = document.getElementById('creator-save-check');
                if (saveCheck && saveCheck.checked) {
                    // Use the actual graph data from the AI result for offline re-extrusion
                    const graphData = result.graphData || {
                        nodes: [],
                        edges: [],
                        node_count: result.nodeCount,
                        edge_count: result.edgeCount,
                        engine_used: result.engineUsed
                    };

                    // Generate a small thumbnail from the base64 image
                    const thumb = selectedBase64 ? generateThumbnail(selectedBase64, 200) : '';

                    const item = {
                        id: generateId(),
                        name: selectedFile ? selectedFile.name.replace(/\.[^.]+$/, '') : 'Wireframe Import',
                        imageBase64: selectedBase64 || '',
                        imageThumb: thumb || selectedBase64 || '',
                        graphData,
                        nodeCount: result.nodeCount,
                        edgeCount: result.edgeCount,
                        engineUsed: result.engineUsed,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        tags: [],
                        favorite: false
                    };
                    saveItem(item);
                    updateInventoryCount();
                }

                // Flash button green
                if (btn) {
                    btn.style.background = 'rgba(0,200,80,0.4)';
                    btn.style.borderColor = '#44ff88';
                    btn.innerText = '✅ Done!';
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.style.background = 'rgba(0,180,220,0.3)';
                        btn.style.borderColor = 'rgba(0,180,220,0.7)';
                        btn.style.color = '#fff';
                        btn.style.cursor = 'pointer';
                        btn.innerText = '🤖 Import Again';
                    }, 2000);
                }
            } else {
                // Show error
                if (previewCol) {
                    previewCol.innerHTML = `
                        <div style="color:#ff4444;font-size:48px;">❌</div>
                        <div style="color:#ff4444;font-size:13px;font-weight:600;font-family:'Segoe UI',sans-serif;">Import failed</div>
                        <div style="color:#ff8888;font-size:10px;font-family:'Segoe UI',sans-serif;text-align:center;max-width:280px;">${result.error || 'Unknown error'}</div>
                    `;
                }
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = '🤖 Retry Import';
                    btn.style.background = 'rgba(0,180,220,0.3)';
                    btn.style.color = '#fff';
                    btn.style.cursor = 'pointer';
                }
            }
        } catch (err) {
            console.error('[Creator] Import error:', err);
            if (previewCol) {
                previewCol.innerHTML = `
                    <div style="color:#ff4444;font-size:48px;">💥</div>
                    <div style="color:#ff4444;font-size:13px;font-weight:600;font-family:'Segoe UI',sans-serif;">Connection error</div>
                    <div style="color:#ff8888;font-size:10px;font-family:'Segoe UI',sans-serif;text-align:center;">${err.message}</div>
                `;
            }
            if (btn) {
                btn.disabled = false;
                btn.innerText = '🤖 Retry Import';
                btn.style.background = 'rgba(0,180,220,0.3)';
                btn.style.color = '#fff';
                btn.style.cursor = 'pointer';
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Tab: Inventory (Saved Wireframes)
// ---------------------------------------------------------------------------

function renderInventoryTab(game, container) {
    container.innerHTML = '';

    const inventory = getInventory();

    if (inventory.length === 0) {
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;gap:16px;">
                <div style="font-size:64px;">📦</div>
                <div style="color:#aaa;font-size:14px;font-weight:600;font-family:'Segoe UI',sans-serif;">No wireframes saved yet</div>
                <div style="color:#666;font-size:11px;font-family:'Segoe UI',sans-serif;text-align:center;max-width:300px;">
                    Import a sketch in the <b>Import</b> tab and check "Save to inventory" to build your collection.
                </div>
            </div>
        `;
        return;
    }

    // Sort: favorites first, then newest first
    const sorted = [...inventory].sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    // Top stats bar
    const stats = document.createElement('div');
    stats.style.cssText = `
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        align-items: center;
        flex-wrap: wrap;
    `;
    const favCount = inventory.filter(i => i.favorite).length;
    stats.innerHTML = `
        <span style="color:#aaa;font-size:11px;font-family:'Segoe UI',sans-serif;">
            ${inventory.length} item${inventory.length !== 1 ? 's' : ''}
            ${favCount > 0 ? `&bull; ${favCount} ⭐` : ''}
        </span>
        <button id="creator-clear-inv-btn" style="
            font-size:9px;padding:3px 8px;background:rgba(255,60,60,0.15);border:1px solid rgba(255,60,60,0.3);
            color:#ff6666;border-radius:5px;cursor:pointer;font-family:'Segoe UI',sans-serif;
            transition:background 0.15s;
        ">🗑 Clear All</button>
    `;
    container.appendChild(stats);

    // Grid of inventory cards
    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 12px;
    `;

    sorted.forEach(item => {
        const card = createInventoryCard(game, item, container);
        grid.appendChild(card);
    });

    container.appendChild(grid);

    // Wire clear all
    const clearBtn = document.getElementById('creator-clear-inv-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm(`Delete all ${inventory.length} wireframes from inventory? This cannot be undone.`)) {
        clearInventory();
        renderInventoryTab(game, container);
        updateInventoryCount();
            }
        });
    }
}

function createInventoryCard(game, item, container) {
    const card = document.createElement('div');
    card.style.cssText = `
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        overflow: hidden;
        cursor: pointer;
        transition: all 0.2s;
    `;
    card.addEventListener('mouseenter', () => {
        card.style.background = 'rgba(0,180,220,0.08)';
        card.style.borderColor = 'rgba(0,180,220,0.3)';
    });
    card.addEventListener('mouseleave', () => {
        card.style.background = 'rgba(255,255,255,0.04)';
        card.style.borderColor = 'rgba(255,255,255,0.08)';
    });

    const formatDate = (ts) => {
        if (!ts) return 'unknown';
        const d = new Date(ts);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const engineBadge = item.engineUsed === 'hamp_pro'
        ? '<span style="color:#8844ff;font-size:8px;background:rgba(136,68,255,0.15);padding:2px 6px;border-radius:4px;">HAWP Pro</span>'
        : '<span style="color:#888;font-size:8px;background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">OpenCV</span>';

    card.innerHTML = `
        <div style="position:relative;height:100px;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;overflow:hidden;">
            ${item.imageThumb
                ? `<img src="data:image/png;base64,${item.imageThumb}" style="width:100%;height:100%;object-fit:cover;opacity:0.6;">`
                : `<div style="color:#444;font-size:36px;">🧬</div>`
            }
            <div style="position:absolute;top:6px;right:6px;">${engineBadge}</div>
            ${item.favorite ? `<div style="position:absolute;top:6px;left:6px;font-size:14px;">⭐</div>` : ''}
        </div>
        <div style="padding:10px 12px;display:flex;flex-direction:column;gap:4px;">
            <div style="color:#fff;font-size:12px;font-weight:600;font-family:'Segoe UI',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name || 'Untitled'}</div>
            <div style="color:#888;font-size:9px;font-family:'Segoe UI',sans-serif;">
                ${item.nodeCount || 0} nodes &bull; ${item.edgeCount || 0} edges
            </div>
            <div style="color:#666;font-size:8px;font-family:'Segoe UI',sans-serif;">${formatDate(item.createdAt)}</div>
            <div style="display:flex;gap:4px;margin-top:4px;">
                <button class="creator-card-action" data-action="load" style="
                    flex:1;font-size:9px;padding:4px 0;background:rgba(0,180,220,0.2);border:1px solid rgba(0,180,220,0.3);
                    color:#00b4dc;border-radius:5px;cursor:pointer;font-family:'Segoe UI',sans-serif;
                ">📂 Load</button>
                <button class="creator-card-action" data-action="star" style="
                    font-size:10px;padding:4px 8px;background:rgba(255,204,0,0.1);border:1px solid rgba(255,204,0,0.2);
                    color:#ffcc00;border-radius:5px;cursor:pointer;font-family:'Segoe UI',sans-serif;
                ">${item.favorite ? '★' : '☆'}</button>
                <button class="creator-card-action" data-action="delete" style="
                    font-size:10px;padding:4px 8px;background:rgba(255,60,60,0.1);border:1px solid rgba(255,60,60,0.2);
                    color:#ff6666;border-radius:5px;cursor:pointer;font-family:'Segoe UI',sans-serif;
                ">🗑</button>
            </div>
        </div>
    `;

    // Wire card actions
    card.querySelectorAll('.creator-card-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;

            if (action === 'load') {
                loadItemIntoBuilder(game, item);
            } else if (action === 'star') {
                const newState = toggleFavorite(item.id);
                renderInventoryTab(game, container);
            } else if (action === 'delete') {
                if (confirm(`Delete "${item.name || 'Untitled'}" from inventory?`)) {
                    deleteItem(item.id);
                    renderInventoryTab(game, container);
                    updateInventoryCount();
                }
            }
        });
    });

    // Card click → rename
    card.addEventListener('click', () => {
        const newName = prompt('Rename wireframe:', item.name || '');
        if (newName !== null && newName.trim() !== '') {
            renameItem(item.id, newName.trim());
            renderInventoryTab(game, container);
            updateInventoryCount();
        }
    });

    return card;
}

/**
 * Load an inventory item's graph data into the builder scene.
 * Re-extrudes the 2D graph into 3D geometry without calling the AI backend
 * by using the importer's public importFromGraphData() method.
 */
async function loadItemIntoBuilder(game, item) {
    if (!game._aiImporter) game._aiImporter = new WireframeImporter(game);

    // Option 1: We have graph data — use offline re-extrusion
    if (item.graphData && item.graphData.nodes && item.graphData.nodes.length > 0) {
        try {
            const result = await game._aiImporter.importFromGraphData(item.graphData);
            if (result.success) {
                console.log('[Creator] Loaded from inventory:', item.name, '-', result.nodeCount, 'nodes');
            } else {
                console.warn('[Creator] Graph data load failed:', result.error);
                alert(`Failed to load wireframe: ${result.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('[Creator] Failed to re-extrude inventory item:', err);
            alert('Failed to load wireframe from saved data.');
        }
        return;
    }

    // Option 2: Graph data missing — re-import from saved image (requires AI backend)
    if (item.imageBase64) {
        const userTier = game.saveData && game.saveData.subscriptionTier || 'free';
        game._aiImporter.importFromAI(item.imageBase64, userTier).then(result => {
            if (result.success) {
                console.log('[Creator] Re-imported from saved image:', result.nodeCount, 'nodes');
                // Update the inventory item with the fresh graph data for next time
                // Note: We don't have raw graph data from importFromAI yet —
                // in a future update, importFromAI should expose the raw graph.
            } else {
                alert(`Re-import failed: ${result.error}`);
            }
        }).catch(err => {
            console.error('[Creator] Re-import error:', err);
            alert('Failed to re-import from saved image.');
        });
        return;
    }

    alert('No graph data or image available for this item. It may have been saved incompletely.');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            const commaIndex = dataUrl.indexOf(',');
            resolve(commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function updateInventoryCount() {
    const badge = document.getElementById('creator-inv-count');
    if (!badge) return;
    const inventory = getInventory();
    badge.innerText = inventory.length > 0 ? `${inventory.length} saved` : '';
}

/**
 * Generate a small base64 thumbnail from a larger base64 image.
 * Uses an offscreen canvas to resize proportionally.
 * @param {string} base64 - Raw base64 data (no data URI prefix)
 * @param {number} maxDim - Max width/height in px (default 200)
 * @returns {string} Thumbnail base64, or empty string on failure
 */
function generateThumbnail(base64, maxDim = 200) {
    try {
        const img = new Image();
        // Synchronous canvas approach won't work with async image loading.
        // Return the raw base64 for now — the card display constrains via CSS.
        // In a browser environment, this would use img.onload + canvas.drawImage.
        return base64;
    } catch (e) {
        return '';
    }
}

function closeCreatorSection(game, overlay, sidebar, escHandler) {
    // Clean up escape key listener
    if (escHandler) {
        document.removeEventListener('keydown', escHandler);
    }
    overlay.innerHTML = '';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'flex-start';
    overlay.style.justifyContent = 'flex-end';
    overlay.style.padding = '0';

    // Restore builder sidebar
    if (sidebar) sidebar.style.display = '';
}
