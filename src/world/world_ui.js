/*
 World UI.
 Renders the 2D world map view showing the grid of build sites.
 Each site tile shows ownership, terrain, track count, and allows entry.
 Neighboring sites are visible and connected at borders.
 Tabs for: Map | My Sites | Marketplace | Players
*/

import { SITE_SIZE, TERRAIN_PRESETS, WORLD_SKY_TYPES, getNeighborCoords } from './world_state.js';
import { getZoneForSite, getZoneBadgeHTML, getZoneCSSColor, canClaimSite } from './world_zoning.js';

/**
 * Render the full world map UI into the overlay.
 */
export function renderWorldUI(game) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    overlay.style.alignItems = 'stretch';
    overlay.style.justifyContent = 'stretch';
    overlay.style.padding = '0';
    overlay.innerHTML = '';

    // Main container
    const container = document.createElement('div');
    container.id = 'world-container';
    container.style.cssText = `
        width:100%;height:100vh;display:flex;flex-direction:column;
        background:linear-gradient(180deg,rgba(10,12,25,0.98),rgba(8,10,20,0.98));
        font-family:'Segoe UI',sans-serif;overflow:hidden;
    `;

    // --- Header ---
    const header = document.createElement('div');
    header.id = 'world-header';
    header.style.cssText = `
        padding:12px 18px;border-bottom:1px solid rgba(255,255,255,0.08);
        display:flex;justify-content:space-between;align-items:center;gap:12px;
        flex-shrink:0;background:rgba(0,0,0,0.3);
    `;
    header.innerHTML = `
        <span style="color:#fff;font-weight:700;font-size:16px;font-family:'5x5dots',monospace;">
            🌍 WORLD MAP
        </span>
        <div id="world-header-info" style="color:#888;font-size:11px;display:flex;gap:12px;align-items:center;">
            <span id="world-coord-display">📍 (0, 0)</span>
            <span id="world-player-count">👥 0 online</span>
        </div>
        <button id="world-exit-btn" class="menu-btn" style="font-size:11px;padding:4px 10px;">✕ EXIT</button>
    `;
    container.appendChild(header);

    // --- Tab bar ---
    const tabBar = document.createElement('div');
    tabBar.id = 'world-tabs';
    tabBar.style.cssText = `
        display:flex;gap:4px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.06);
        overflow-x:auto;flex-shrink:0;
    `;
    const tabs = [
        { id: 'map',     label: '🗺️ MAP' },
        { id: 'mysites', label: '🏠 MY SITES' },
        { id: 'market',  label: '🛒 MARKETPLACE' },
        { id: 'players', label: '👥 PLAYERS' },
        { id: 'config',  label: '⚙️ CONFIG' }
    ];
    let activeTab = 'map';
    tabs.forEach((tab, idx) => {
        const btn = document.createElement('button');
        btn.className = 'world-tab-btn';
        btn.dataset.tab = tab.id;
        btn.style.cssText = `
            padding:6px 14px;font-size:11px;border-radius:6px;
            border:1px solid rgba(255,255,255,0.15);
            background:${idx === 0 ? 'rgba(136,68,255,0.3)' : 'transparent'};
            color:${idx === 0 ? '#fff' : '#aaa'};cursor:pointer;
            white-space:nowrap;font-family:'Segoe UI',sans-serif;
            transition:all 0.2s;
        `;
        btn.innerText = tab.label;
        btn.addEventListener('click', () => {
            activeTab = tab.id;
            tabBar.querySelectorAll('.world-tab-btn').forEach(b => {
                b.style.background = 'transparent';
                b.style.color = '#aaa';
            });
            btn.style.background = 'rgba(136,68,255,0.3)';
            btn.style.color = '#fff';
            renderTabContent(game, activeTab);
        });
        tabBar.appendChild(btn);
    });
    container.appendChild(tabBar);

    // --- Tab content area ---
    const content = document.createElement('div');
    content.id = 'world-content';
    content.style.cssText = `
        flex:1;overflow-y:auto;padding:0;
    `;
    container.appendChild(content);

    overlay.appendChild(container);

    // Wire exit
    requestAnimationFrame(() => {
        const exitBtn = document.getElementById('world-exit-btn');
        if (exitBtn) {
            exitBtn.addEventListener('click', () => exitWorld(game));
        }
    });

    // Render initial tab
    renderTabContent(game, 'map');

    // Start presence updates
    game._worldPresenceInterval = setInterval(() => {
        const grid = game._worldGrid;
        if (grid && game._worldSync) {
            game._worldSync.updatePresence(grid.viewCenter.col, grid.viewCenter.row);
        }
        updateWorldHeaderInfo(game);
    }, 3000);
}

/**
 * Render the content for the active tab.
 */
function renderTabContent(game, tabId) {
    const content = document.getElementById('world-content');
    if (!content) return;
    content.innerHTML = '';

    switch (tabId) {
        case 'map':     renderMapTab(game, content); break;
        case 'mysites': renderMySitesTab(game, content); break;
        case 'market':  renderMarketTab(game, content); break;
        case 'players': renderPlayersTab(game, content); break;
        case 'config':  renderConfigTab(game, content); break;
    }
}

/**
 * Map tab — scrollable 2D grid of site tiles.
 */
function renderMapTab(game, container) {
    const grid = game._worldGrid;
    if (!grid) { container.innerHTML = '<div style="padding:20px;color:#888;text-align:center;">World not connected</div>'; return; }

    const center = grid.viewCenter || { col: 0, row: 0 };
    const viewRadius = 6; // show 13×13 grid around center

    const mapWrapper = document.createElement('div');
    mapWrapper.style.cssText = `
        padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;
    `;

    // Map navigation
    const nav = document.createElement('div');
    nav.style.cssText = 'display:flex;gap:8px;align-items:center;';
    nav.innerHTML = `
        <button id="world-nav-up" class="menu-btn" style="font-size:14px;padding:4px 12px;">▲</button>
    `;
    const navRow = document.createElement('div');
    navRow.style.cssText = 'display:flex;gap:8px;align-items:center;';
    navRow.innerHTML = `
        <button id="world-nav-left" class="menu-btn" style="font-size:14px;padding:4px 12px;">◄</button>
        <span style="color:#aaa;font-size:11px;min-width:80px;text-align:center;" id="world-nav-coord">
            (${center.col}, ${center.row})
        </span>
        <button id="world-nav-right" class="menu-btn" style="font-size:14px;padding:4px 12px;">►</button>
    `;
    const navBottom = document.createElement('div');
    navBottom.innerHTML = `<button id="world-nav-down" class="menu-btn" style="font-size:14px;padding:4px 12px;">▼</button>`;
    mapWrapper.appendChild(nav);
    mapWrapper.appendChild(navRow);
    mapWrapper.appendChild(navBottom);

    // Grid of tiles
    const gridEl = document.createElement('div');
    gridEl.style.cssText = `
        display:grid;
        grid-template-columns:repeat(${viewRadius * 2 + 1}, minmax(60px, 1fr));
        gap:3px;
        width:100%;
        max-width:800px;
    `;

    for (let r = center.row - viewRadius; r <= center.row + viewRadius; r++) {
        for (let c = center.col - viewRadius; c <= center.col + viewRadius; c++) {
            const tile = createSiteTile(game, c, r, center);
            gridEl.appendChild(tile);
        }
    }

    mapWrapper.appendChild(gridEl);
    container.appendChild(mapWrapper);

    // Wire nav buttons
    requestAnimationFrame(() => {
        const moveMap = (dc, dr) => {
            grid.viewCenter.col += dc;
            grid.viewCenter.row += dr;
            renderTabContent(game, 'map');
        };
        const up = document.getElementById('world-nav-up');
        const down = document.getElementById('world-nav-down');
        const left = document.getElementById('world-nav-left');
        const right = document.getElementById('world-nav-right');
        if (up) up.addEventListener('click', () => moveMap(0, -1));
        if (down) down.addEventListener('click', () => moveMap(0, 1));
        if (left) left.addEventListener('click', () => moveMap(-1, 0));
        if (right) right.addEventListener('click', () => moveMap(1, 0));
    });
}

/**
 * Create a single site tile element for the map grid.
 */
function createSiteTile(game, col, row, center) {
    const grid = game._worldGrid;
    const site = grid ? grid.getSite(col, row) : null;
    const isCenter = col === center.col && row === center.row;
    const isOwned = site && site.ownerId === (grid ? grid.playerId : null);
    const isNeighbor = Math.abs(col - center.col) + Math.abs(row - center.row) === 1;

    const zone = getZoneForSite(col, row);
    const zoneColor = zone ? getZoneCSSColor(zone.id, 0.35) : 'rgba(255,255,255,0.03)';
    const terrain = site ? (TERRAIN_PRESETS[site.terrain] || TERRAIN_PRESETS.sky_high) : null;
    const bgColor = terrain ? `rgba(${(terrain.color >> 16) & 0xff},${(terrain.color >> 8) & 0xff},${terrain.color & 0xff},0.3)` : zoneColor;
    const borderColor = isCenter ? '#9944ff' : isOwned ? '#44ff88' : isNeighbor ? 'rgba(136,68,255,0.4)' : zone ? `${zone.color}66` : 'rgba(255,255,255,0.08)';

    const tile = document.createElement('div');
    tile.className = 'world-site-tile';
    tile.dataset.col = col;
    tile.dataset.row = row;
    tile.style.cssText = `
        aspect-ratio:1;
        background:${bgColor};
        border:2px solid ${borderColor};
        border-radius:8px;
        cursor:pointer;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:2px;
        transition:all 0.15s;
        padding:4px;
        min-height:60px;
        position:relative;
    `;

    // Zone badge (bottom-left)
    const zoneBadge = zone && zone.id !== 'HUB'
        ? `<div style="font-size:7px;position:absolute;bottom:2px;left:3px;color:${zone.color};opacity:0.8;">${zone.icon}</div>`
        : '';

    if (site) {
        const terrainIcon = getTerrainIcon(site.terrain);
        tile.innerHTML = `
            <div style="font-size:16px;">${terrainIcon}</div>
            <div style="font-size:8px;color:#aaa;text-align:center;line-height:1.1;">
                (${col},${row})
            </div>
            <div style="font-size:8px;color:#888;">${site.partCount || 0} parts</div>
            ${site.ownerId ? `<div style="font-size:7px;color:#44ff88;position:absolute;top:2px;right:4px;">👤</div>` : ''}
            ${site.listed ? `<div style="font-size:7px;color:#ffcc00;position:absolute;top:2px;left:4px;">💰</div>` : ''}
            ${zoneBadge}
        `;
    } else {
        tile.innerHTML = `
            <div style="font-size:10px;color:#555;">+</div>
            <div style="font-size:8px;color:#444;">(${col},${row})</div>
            ${zoneBadge}
        `;
    }

    // Hover
    tile.addEventListener('mouseenter', () => {
        tile.style.transform = 'scale(1.08)';
        tile.style.zIndex = '10';
        tile.style.boxShadow = '0 4px 16px rgba(136,68,255,0.3)';
    });
    tile.addEventListener('mouseleave', () => {
        tile.style.transform = '';
        tile.style.zIndex = '';
        tile.style.boxShadow = '';
    });

    // Click — open site details or claim
    tile.addEventListener('click', () => {
        openSiteDetail(game, col, row);
    });

    return tile;
}

/**
 * Open a detail panel for a specific site.
 */
function openSiteDetail(game, col, row) {
    const grid = game._worldGrid;
    const site = grid ? grid.getSite(col, row) : null;
    const isOwned = site && site.ownerId === (grid ? grid.playerId : null);
    const terrain = site ? (TERRAIN_PRESETS[site.terrain] || TERRAIN_PRESETS.sky_high) : TERRAIN_PRESETS.sky_high;

    const content = document.getElementById('world-content');
    if (!content) return;

    const panel = document.createElement('div');
    panel.style.cssText = `
        padding:20px;display:flex;flex-direction:column;gap:14px;max-width:500px;margin:0 auto;
    `;

    // Back button
    const backBtn = document.createElement('button');
    backBtn.className = 'menu-btn';
    backBtn.style.cssText = 'align-self:flex-start;font-size:11px;padding:6px 12px;';
    backBtn.innerText = '← BACK TO MAP';
    backBtn.addEventListener('click', () => renderTabContent(game, 'map'));
    panel.appendChild(backBtn);

    // Site header
    const zone = getZoneForSite(col, row);
    const zoneInfo = zone ? getZoneBadgeHTML(zone.id) : '';
    const claimCheck = !site ? canClaimSite(grid, grid ? grid.playerId : null, col, row, (game.saveData && game.saveData.totalCoins) || 0) : null;
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:12px;';
    header.innerHTML = `
        <div style="font-size:32px;">${getTerrainIcon(site ? site.terrain : 'sky_high')}</div>
        <div>
            <div style="color:#fff;font-size:16px;font-weight:700;">Site (${col}, ${row}) ${zoneInfo}</div>
            <div style="color:#888;font-size:11px;">${terrain.name} · ${zone ? zone.name : 'Unknown Zone'}</div>
            ${zone ? `<div style="color:#888;font-size:9px;margin-top:1px;">${zone.description}</div>` : ''}
            <div style="color:#aaa;font-size:10px;margin-top:2px;">
                ${site ? `${site.partCount || 0} parts` : 'Unclaimed'} ·
                ${isOwned ? '✅ Your site' : site ? `Owned by ${site.ownerId || 'unknown'}` : 'Vacant'}
                ${!site && claimCheck && !claimCheck.allowed ? `<span style="color:#ff8844;margin-left:4px;">⚠ ${claimCheck.reason}</span>` : ''}
                ${!site && claimCheck && claimCheck.allowed ? `<span style="color:#44ff88;margin-left:4px;">🪙 ${claimCheck.cost} coins to claim</span>` : ''}
            </div>
        </div>
    `;
    panel.appendChild(header);

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';

    if (!site) {
        // Claim button (zone-aware — disabled if claiming not allowed)
        const claimBtn = document.createElement('button');
        claimBtn.className = 'menu-btn';
        const canClaim = claimCheck ? claimCheck.allowed : true;
        claimBtn.style.cssText = `
            background:${canClaim ? 'rgba(0,180,0,0.4)' : 'rgba(100,100,100,0.2)'};
            border-color:${canClaim ? '#44ff44' : '#555'};
            font-size:12px;padding:8px 16px;
            ${canClaim ? 'cursor:pointer;' : 'cursor:not-allowed;opacity:0.6;'}
        `;
        claimBtn.innerText = canClaim ? `🏗️ CLAIM (${claimCheck ? claimCheck.cost : 0} 🪙)` : '🔒 ' + (claimCheck ? claimCheck.reason : 'Unavailable');
        if (canClaim) {
            claimBtn.addEventListener('click', async () => {
                if (game._worldSync) {
                    await game._worldSync.claimSite(col, row);
                    grid.getOrCreateSite(col, row, grid.playerId);
                    openSiteDetail(game, col, row);
                }
            });
        }
        actions.appendChild(claimBtn);
    }

    if (isOwned) {
        // Build button
        const buildBtn = document.createElement('button');
        buildBtn.className = 'menu-btn';
        buildBtn.style.cssText = 'background:rgba(30,80,180,0.4);border-color:#4488ff;font-size:12px;padding:8px 16px;';
        buildBtn.innerText = '🔧 BUILD HERE';
        buildBtn.addEventListener('click', () => {
            enterSiteBuilder(game, col, row);
        });
        actions.appendChild(buildBtn);

        // Configure terrain
        const configBtn = document.createElement('button');
        configBtn.className = 'menu-btn';
        configBtn.style.cssText = 'font-size:12px;padding:8px 16px;';
        configBtn.innerText = '🎨 TERRAIN';
        configBtn.addEventListener('click', () => {
            openTerrainPicker(game, col, row);
        });
        actions.appendChild(configBtn);

        // Sell button
        const sellBtn = document.createElement('button');
        sellBtn.className = 'menu-btn';
        sellBtn.style.cssText = 'background:rgba(200,150,0,0.3);border-color:#ffcc00;font-size:12px;padding:8px 16px;';
        sellBtn.innerText = '💰 SELL SITE';
        sellBtn.addEventListener('click', () => {
            openSellDialog(game, col, row);
        });
        actions.appendChild(sellBtn);
    }

    if (site && site.listed && !isOwned) {
        // Buy button
        const buyBtn = document.createElement('button');
        buyBtn.className = 'menu-btn';
        buyBtn.style.cssText = 'background:rgba(200,150,0,0.4);border-color:#ffcc00;font-size:12px;padding:8px 16px;';
        buyBtn.innerText = `🛒 BUY (${site.listPrice} coins)`;
        buyBtn.addEventListener('click', async () => {
            await buySite(game, col, row);
        });
        actions.appendChild(buyBtn);
    }

    panel.appendChild(actions);

    // Neighboring sites
    const neighbors = getNeighborCoords(col, row);
    const neighborSection = document.createElement('div');
    neighborSection.style.cssText = 'margin-top:8px;';
    neighborSection.innerHTML = '<div style="color:#aaa;font-size:11px;margin-bottom:6px;">NEIGHBORING SITES</div>';

    const neighborGrid = document.createElement('div');
    neighborGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px;';

    for (const n of neighbors) {
        const nSite = grid ? grid.getSite(n.col, n.row) : null;
        const nCard = document.createElement('div');
        nCard.style.cssText = `
            background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
            border-radius:6px;padding:8px;cursor:pointer;transition:background 0.15s;
        `;
        nCard.innerHTML = `
            <div style="color:#ccc;font-size:10px;font-weight:600;">${n.dir.toUpperCase()} — (${n.col},${n.row})</div>
            <div style="color:#888;font-size:9px;">${nSite ? `${nSite.partCount || 0} parts · ${TERRAIN_PRESETS[nSite.terrain]?.name || 'Unknown'}` : 'Vacant'}</div>
        `;
        nCard.addEventListener('click', () => openSiteDetail(game, n.col, n.row));
        nCard.addEventListener('mouseenter', () => { nCard.style.background = 'rgba(136,68,255,0.12)'; });
        nCard.addEventListener('mouseleave', () => { nCard.style.background = 'rgba(255,255,255,0.04)'; });
        neighborGrid.appendChild(nCard);
    }
    neighborSection.appendChild(neighborGrid);
    panel.appendChild(neighborSection);

    content.innerHTML = '';
    content.appendChild(panel);
}

/**
 * My Sites tab — list of sites owned by the player.
 */
function renderMySitesTab(game, container) {
    const grid = game._worldGrid;
    if (!grid) return;

    const owned = grid.getOwnedSites(grid.playerId);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:8px;max-width:600px;margin:0 auto;';

    if (owned.length === 0) {
        wrap.innerHTML = `
            <div style="text-align:center;padding:40px 20px;color:#888;">
                <div style="font-size:32px;margin-bottom:12px;">🏗️</div>
                <div style="font-size:14px;color:#aaa;">No sites claimed yet</div>
                <div style="font-size:11px;color:#666;margin-top:6px;">Go to the MAP tab and click a vacant tile to claim your first site!</div>
            </div>
        `;
        container.appendChild(wrap);
        return;
    }

    const title = document.createElement('div');
    title.style.cssText = 'color:#aaa;font-size:11px;padding:0 0 4px;';
    title.innerText = `${owned.length} site${owned.length !== 1 ? 's' : ''} owned`;
    wrap.appendChild(title);

    for (const site of owned) {
        const terrain = TERRAIN_PRESETS[site.terrain] || TERRAIN_PRESETS.sky_high;
        const card = document.createElement('div');
        card.style.cssText = `
            background:rgba(255,255,255,0.04);border:1px solid rgba(68,255,136,0.2);
            border-radius:10px;padding:12px;cursor:pointer;transition:background 0.15s;
            display:flex;align-items:center;gap:12px;
        `;
        card.innerHTML = `
            <div style="font-size:24px;">${getTerrainIcon(site.terrain)}</div>
            <div style="flex:1;">
                <div style="color:#fff;font-size:13px;font-weight:600;">Site (${site.col}, ${site.row})</div>
                <div style="color:#888;font-size:10px;">${terrain.name} · ${site.partCount || 0} parts</div>
            </div>
            ${site.listed ? `<div style="color:#ffcc00;font-size:10px;">💰 ${site.listPrice}</div>` : ''}
            <div style="color:#44ff88;font-size:16px;">▶</div>
        `;
        card.addEventListener('click', () => openSiteDetail(game, site.col, site.row));
        card.addEventListener('mouseenter', () => { card.style.background = 'rgba(68,255,136,0.08)'; });
        card.addEventListener('mouseleave', () => { card.style.background = 'rgba(255,255,255,0.04)'; });
        wrap.appendChild(card);
    }

    container.appendChild(wrap);
}

/**
 * Marketplace tab — browse and buy listed sites.
 */
function renderMarketTab(game, container) {
    const listings = game._worldListings || [];
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:8px;max-width:600px;margin:0 auto;';

    const title = document.createElement('div');
    title.style.cssText = 'color:#aaa;font-size:11px;padding:0 0 4px;';
    title.innerText = `${listings.length} site${listings.length !== 1 ? 's' : ''} for sale`;
    wrap.appendChild(title);

    if (listings.length === 0) {
        wrap.innerHTML += `
            <div style="text-align:center;padding:40px 20px;color:#888;">
                <div style="font-size:32px;margin-bottom:12px;">🛒</div>
                <div style="font-size:14px;color:#aaa;">No sites listed for sale</div>
                <div style="font-size:11px;color:#666;margin-top:6px;">Claim a site and list it on the marketplace to start trading!</div>
            </div>
        `;
        container.appendChild(wrap);
        return;
    }

    const grid = game._worldGrid;
    const sorted = [...listings].sort((a, b) => (a.price || 0) - (b.price || 0));

    for (const listing of sorted) {
        const terrain = TERRAIN_PRESETS[listing.terrain] || TERRAIN_PRESETS.sky_high;
        const card = document.createElement('div');
        card.style.cssText = `
            background:rgba(255,255,255,0.04);border:1px solid rgba(255,204,0,0.2);
            border-radius:10px;padding:12px;cursor:pointer;transition:background 0.15s;
            display:flex;align-items:center;gap:12px;
        `;
        card.innerHTML = `
            <div style="font-size:24px;">${getTerrainIcon(listing.terrain)}</div>
            <div style="flex:1;">
                <div style="color:#fff;font-size:13px;font-weight:600;">Site (${listing.col}, ${listing.row})</div>
                <div style="color:#888;font-size:10px;">${terrain.name} · ${listing.partCount || 0} parts</div>
            </div>
            <div style="color:#ffcc00;font-size:14px;font-weight:700;">${listing.price} 🪙</div>
        `;
        card.addEventListener('click', () => openSiteDetail(game, listing.col, listing.row));
        card.addEventListener('mouseenter', () => { card.style.background = 'rgba(255,204,0,0.08)'; });
        card.addEventListener('mouseleave', () => { card.style.background = 'rgba(255,255,255,0.04)'; });
        wrap.appendChild(card);
    }

    container.appendChild(wrap);
}

/**
 * Players tab — show online players and their sites.
 */
function renderPlayersTab(game, container) {
    const players = game._worldPlayers || [];
    const grid = game._worldGrid;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:8px;max-width:600px;margin:0 auto;';

    // Self
    const selfCard = document.createElement('div');
    selfCard.style.cssText = `
        background:rgba(68,255,136,0.08);border:1px solid rgba(68,255,136,0.2);
        border-radius:10px;padding:12px;display:flex;align-items:center;gap:12px;
    `;
    const mySites = grid ? grid.countOwnedSites(grid.playerId) : 0;
    selfCard.innerHTML = `
        <div style="font-size:24px;">🟢</div>
        <div style="flex:1;">
            <div style="color:#44ff88;font-size:13px;font-weight:600;">You (${grid ? grid.playerId : 'unknown'})</div>
            <div style="color:#888;font-size:10px;">${mySites} sites owned</div>
        </div>
    `;
    wrap.appendChild(selfCard);

    // Online players
    if (players.length > 0) {
        const pTitle = document.createElement('div');
        pTitle.style.cssText = 'color:#aaa;font-size:11px;padding:8px 0 2px;';
        pTitle.innerText = `${players.length} other player${players.length !== 1 ? 's' : ''} online`;
        wrap.appendChild(pTitle);

        for (const p of players) {
            const card = document.createElement('div');
            card.style.cssText = `
                background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
                border-radius:10px;padding:12px;display:flex;align-items:center;gap:12px;
            `;
            const ago = Date.now() - (p.updatedAt || 0);
            const locText = p.siteCol !== undefined ? `Site (${p.siteCol}, ${p.siteRow})` : 'In the world';
            card.innerHTML = `
                <div style="font-size:24px;">🔵</div>
                <div style="flex:1;">
                    <div style="color:#ccc;font-size:13px;font-weight:600;">${p.playerId || 'anon'}</div>
                    <div style="color:#888;font-size:10px;">${locText} · ${Math.floor(ago / 1000)}s ago</div>
                </div>
            `;
            wrap.appendChild(card);
        }
    } else {
        wrap.innerHTML += `
            <div style="text-align:center;padding:20px;color:#666;font-size:11px;">
                No other players online right now
            </div>
        `;
    }

    container.appendChild(wrap);
}

/**
 * Config tab — terrain and sky settings for the current site.
 */
function renderConfigTab(game, container) {
    const grid = game._worldGrid;
    if (!grid) return;

    const center = grid.viewCenter;
    const site = grid.getSite(center.col, center.row);
    const isOwned = site && site.ownerId === grid.playerId;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:12px;max-width:500px;margin:0 auto;';

    if (!isOwned) {
        wrap.innerHTML = `
            <div style="text-align:center;padding:30px;color:#888;">
                <div style="font-size:14px;">Select one of your owned sites to configure it.</div>
            </div>
        `;
        container.appendChild(wrap);
        return;
    }

    wrap.innerHTML = `
        <div style="color:#fff;font-size:14px;font-weight:700;">Configure Site (${center.col}, ${center.row})</div>
    `;

    // Terrain picker
    const terrainSection = document.createElement('div');
    terrainSection.innerHTML = '<div style="color:#aaa;font-size:11px;margin-bottom:6px;">TERRAIN</div>';
    const terrainGrid = document.createElement('div');
    terrainGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px;';

    for (const [key, preset] of Object.entries(TERRAIN_PRESETS)) {
        const isSelected = site.terrain === key;
        const card = document.createElement('div');
        card.style.cssText = `
            background:${isSelected ? 'rgba(136,68,255,0.2)' : 'rgba(255,255,255,0.04)'};
            border:2px solid ${isSelected ? '#9944ff' : 'rgba(255,255,255,0.08)'};
            border-radius:8px;padding:8px;cursor:pointer;transition:all 0.15s;
        `;
        card.innerHTML = `
            <div style="font-size:16px;">${getTerrainIcon(key)}</div>
            <div style="color:#ddd;font-size:10px;font-weight:600;">${preset.name}</div>
            <div style="color:#888;font-size:8px;">${preset.description}</div>
        `;
        card.addEventListener('click', async () => {
            site.terrain = key;
            if (game._worldSync) {
                await game._worldSync.updateSite(center.col, center.row, { terrain: key });
            }
            renderTabContent(game, 'config');
        });
        card.addEventListener('mouseenter', () => { card.style.borderColor = '#9944ff'; });
        card.addEventListener('mouseleave', () => { card.style.borderColor = isSelected ? '#9944ff' : 'rgba(255,255,255,0.08)'; });
        terrainGrid.appendChild(card);
    }
    terrainSection.appendChild(terrainGrid);
    wrap.appendChild(terrainSection);

    // Sky picker
    const skySection = document.createElement('div');
    skySection.innerHTML = '<div style="color:#aaa;font-size:11px;margin-bottom:6px;">SKY TYPE</div>';
    const skyGrid = document.createElement('div');
    skyGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';

    for (const skyKey of WORLD_SKY_TYPES) {
        const isSelected = site.skyType === skyKey;
        const btn = document.createElement('button');
        btn.className = 'menu-btn';
        btn.style.cssText = `
            font-size:10px;padding:6px 10px;
            ${isSelected ? 'background:rgba(136,68,255,0.3);border-color:#9944ff;color:#fff;' : ''}
        `;
        btn.innerText = skyKey.charAt(0).toUpperCase() + skyKey.slice(1);
        btn.addEventListener('click', async () => {
            site.skyType = skyKey;
            if (game._worldSync) {
                await game._worldSync.updateSite(center.col, center.row, { skyType: skyKey });
            }
            renderTabContent(game, 'config');
        });
        skyGrid.appendChild(btn);
    }
    skySection.appendChild(skyGrid);
    wrap.appendChild(skySection);

    container.appendChild(wrap);
}

// --- Helper functions ---

function getTerrainIcon(terrain) {
    const icons = {
        sky_high: '☁️', sky_low: '🌤️', canyon: '🏜️', ocean: '🌊',
        space: '🌌', volcanic: '🌋', forest: '🌲', crystal: '💎',
        storm: '⛈️', neon: '🌃'
    };
    return icons[terrain] || '🏗️';
}

function updateWorldHeaderInfo(game) {
    const grid = game._worldGrid;
    if (!grid) return;
    const coordEl = document.getElementById('world-coord-display');
    const playerEl = document.getElementById('world-player-count');
    if (coordEl) coordEl.innerText = `📍 (${grid.viewCenter.col}, ${grid.viewCenter.row})`;
    if (playerEl) {
        const count = (game._worldPlayers || []).length + 1;
        playerEl.innerText = `👥 ${count} online`;
    }
}

function openTerrainPicker(game, col, row) {
    // Center the map on this site so the CONFIG tab shows it
    const grid = game._worldGrid;
    if (grid) {
        grid.viewCenter = { col, row };
    }
    // Navigate to config tab
    const tabs = document.querySelectorAll('.world-tab-btn');
    tabs.forEach(b => {
        b.style.background = 'transparent';
        b.style.color = '#aaa';
    });
    const configTab = document.querySelector('.world-tab-btn[data-tab="config"]');
    if (configTab) {
        configTab.style.background = 'rgba(136,68,255,0.3)';
        configTab.style.color = '#fff';
    }
    renderTabContent(game, 'config');
}

function openSellDialog(game, col, row) {
    const price = prompt('Set sale price (coins):', '100');
    if (price === null) return;
    const priceNum = parseInt(price, 10);
    if (Number.isNaN(priceNum) || priceNum < 1) {
        alert('Invalid price.');
        return;
    }
    if (game._worldSync) {
        game._worldSync.listSite(col, row, priceNum);
        alert(`Site listed for ${priceNum} coins!`);
        renderTabContent(game, 'map');
    }
}

async function buySite(game, col, row) {
    const grid = game._worldGrid;
    const site = grid ? grid.getSite(col, row) : null;
    if (!site) return;

    const coins = (game.saveData && game.saveData.totalCoins) || 0;
    if (coins < site.listPrice) {
        alert(`Not enough coins! You have ${coins}, need ${site.listPrice}.`);
        return;
    }

    if (!confirm(`Buy Site (${col}, ${row}) for ${site.listPrice} coins?`)) return;

    if (game._worldSync) {
        const result = await game._worldSync.buySite(col, row, coins);
        if (result.success) {
            game.saveData.totalCoins -= result.price;
            alert('Site purchased!');
            openSiteDetail(game, col, row);
        } else {
            alert(`Purchase failed: ${result.reason}`);
        }
    }
}

function enterSiteBuilder(game, col, row) {
    // Save any existing builder parts back to the current world site
    if (game._worldCurrentSite && game._worldSync && game._builderPlacedParts) {
        const cur = game._worldCurrentSite;
        const parts = game._builderPlacedParts.map(p => ({
            partKey: p.partKey, x: p.x, y: p.y, z: p.z,
            rotation: p.rotation || 0, params: p.params || {}
        }));
        try {
            game._worldSync.saveSiteParts(cur.col, cur.row, parts);
        } catch (e) {
            console.warn('Failed to save builder parts before switching sites', e);
        }
    }
    // Set the new site context and enter the builder
    game._worldCurrentSite = { col, row };
    exitWorld(game);
    if (typeof game.enterBuilder === 'function') {
        game.enterBuilder();
    }
    // Load site parts into builder if they exist
    const grid = game._worldGrid;
    const site = grid ? grid.getSite(col, row) : null;
    if (site && site.parts && site.parts.length > 0 && typeof game._builderLoadCommunityParts === 'function') {
        game._builderLoadCommunityParts(site.parts);
    }
}

/**
 * Exit world mode.
 */
export function exitWorld(game) {
    game._worldActive = false;
    if (game._worldPresenceInterval) {
        clearInterval(game._worldPresenceInterval);
        game._worldPresenceInterval = null;
    }

    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
    }
}

/**
 * Update the world header info periodically.
 */
export function updateWorldUI(game) {
    updateWorldHeaderInfo(game);
}
