/*
 Catalog UI module.
 Exports: renderCatalogPanel().

 Renders a scrollable modal in the game overlay showing all track parts
 organized by category, with icons, descriptions, default parameters,
 connection points, builder function references, color swatches, and
 difficulty tier usage badges.
*/
import { PART_CATEGORIES, PART_CATALOG } from './builder/catalog.js';
import { DIFFICULTY_TIERS } from './levelgen.js';
import { initVoiceToText, createMicButton } from './voice_to_text.js';

/**
 * Render the track parts catalog panel in the overlay.
 */
export function renderCatalogPanel(game) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    overlay.innerHTML = '';

    // --- Modal container ---
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        max-width:560px; max-height:85vh; overflow-y:auto; padding:0;
        background:linear-gradient(180deg,rgba(20,20,35,0.98),rgba(15,15,25,0.98));
        border:2px solid rgba(136,68,255,0.4); border-radius:16px;
        display:flex; flex-direction:column;
    `;

    // --- Header ---
    const header = document.createElement('div');
    header.style.cssText = `
        padding:14px 18px; border-bottom:1px solid rgba(255,255,255,0.08);
        display:flex; justify-content:space-between; align-items:center; gap:8px;
        flex-shrink:0;
    `;
    const totalParts = Object.keys(PART_CATALOG).length;
    header.innerHTML = `
        <span style="color:#fff;font-weight:700;font-size:15px;font-family:'5x5dots',monospace;">📦 TRACK PARTS CATALOG</span>
        <span style="color:#888;font-size:10px;font-family:'Segoe UI',sans-serif;">${totalParts} parts</span>
    `;
    modal.appendChild(header);

    // --- Search input + Voice search button ---
    let searchQuery = '';
    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'padding:8px 12px 4px; flex-shrink:0;';

    const searchRow = document.createElement('div');
    searchRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Search parts by name, key, or description...';
    searchInput.style.cssText = `
        flex:1; box-sizing:border-box; padding:7px 10px; border-radius:8px;
        background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);
        color:#ddd; font-size:12px; font-family:'Segoe UI',sans-serif;
        outline:none; transition:border-color 0.2s;
    `;
    searchInput.addEventListener('focus', () => { searchInput.style.borderColor = 'rgba(136,68,255,0.5)'; });
    searchInput.addEventListener('blur', () => { searchInput.style.borderColor = 'rgba(255,255,255,0.1)'; });
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderPartsList();
    });
    searchRow.appendChild(searchInput);

    // Voice search button (reuses the shared createMicButton component)
    const vtt = game._voiceToText || initVoiceToText(game);
    game._voiceToText = vtt;
    const voiceBtn = createMicButton(vtt, {
        tooltip: vtt.isNative ? 'Search by voice' : 'Search by voice (server)',
        onResult: (text) => {
            searchInput.value = text;
            searchInput.dispatchEvent(new Event('input'));
        }
    });
    voiceBtn.style.width = '32px';
    voiceBtn.style.height = '32px';
    searchRow.appendChild(voiceBtn);

    searchWrap.appendChild(searchRow);
    modal.appendChild(searchWrap);

    // --- Scrollable parts list (defined before tabs so setActiveTab can reference it) ---
    const listEl = document.createElement('div');
    listEl.style.cssText = 'flex:1; overflow-y:auto; padding:8px 12px;';
    modal.appendChild(listEl);

    let activeFilter = 'all';
    const allTabBtns = [];

    const setActiveTab = (filter) => {
        activeFilter = filter;
        allTabBtns.forEach(([id, btn]) => {
            btn.classList.toggle('active', id === filter);
        });
        renderPartsList();
    };

    // --- Category tabs ---
    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
        display:flex; gap:4px; padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.06);
        overflow-x:auto; flex-shrink:0; scrollbar-width:none;
    `;
    tabBar.style.msOverflowStyle = 'none';

    // "All" tab
    const allTab = document.createElement('button');
    allTab.className = 'catalog-tab active';
    allTab.textContent = `All (${totalParts})`;
    allTab.addEventListener('click', (e) => { e.stopPropagation(); setActiveTab('all'); });
    tabBar.appendChild(allTab);
    allTabBtns.push(['all', allTab]);

    // Category tabs
    for (const cat of PART_CATEGORIES) {
        const count = Object.values(PART_CATALOG).filter(p => p.category === cat.id).length;
        const tab = document.createElement('button');
        tab.className = 'catalog-tab';
        tab.textContent = `${cat.icon} ${cat.label} (${count})`;
        tab.addEventListener('click', (e) => { e.stopPropagation(); setActiveTab(cat.id); });
        tabBar.appendChild(tab);
        allTabBtns.push([cat.id, tab]);
    }
    modal.appendChild(tabBar);

    const renderPartsList = () => {
        listEl.innerHTML = '';

        const categories = activeFilter === 'all'
            ? PART_CATEGORIES
            : PART_CATEGORIES.filter(c => c.id === activeFilter);

        let totalShown = 0;
        for (const cat of categories) {
            const parts = Object.values(PART_CATALOG).filter(p => {
                if (p.category !== cat.id) return false;
                if (!searchQuery) return true;
                return (
                    p.name.toLowerCase().includes(searchQuery) ||
                    p.key.toLowerCase().includes(searchQuery) ||
                    p.description.toLowerCase().includes(searchQuery)
                );
            });
            if (parts.length === 0) continue;
            totalShown += parts.length;

            // Category header
            const catHeader = document.createElement('div');
            catHeader.style.cssText = `
                display:flex; align-items:center; gap:8px;
                padding:10px 4px 6px; margin-top:4px;
                border-bottom:1px solid rgba(255,255,255,0.06);
            `;
            catHeader.innerHTML = `
                <span style="font-size:16px;">${cat.icon}</span>
                <span style="color:#ccc;font-weight:700;font-size:12px;font-family:'5x5dots',monospace;text-transform:uppercase;letter-spacing:1px;">${cat.label}</span>
                <span style="color:#666;font-size:10px;margin-left:auto;">${parts.length}</span>
            `;
            listEl.appendChild(catHeader);

            // Part cards
            for (const part of parts) {
                listEl.appendChild(createPartCard(part, game));
            }
        }

        // Empty state
        if (totalShown === 0 && searchQuery) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center;padding:30px 12px;color:#666;font-size:12px;font-family:"Segoe UI",sans-serif;';
            empty.innerHTML = `🔍 No parts match "<span style="color:#9944ff;">${searchQuery}</span>"`;
            listEl.appendChild(empty);
        }

        // Update footer summary
        if (searchQuery) {
            summary.textContent = `${totalShown}/${totalParts} matched`;
        } else {
            summary.textContent = catCounts;
        }
    };

    // --- Footer ---
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding:10px 18px; border-top:1px solid rgba(255,255,255,0.08);
        display:flex; justify-content:space-between; align-items:center; flex-shrink:0;
    `;
    const summary = document.createElement('span');
    summary.style.cssText = 'color:#666;font-size:10px;font-family:\'Segoe UI\',sans-serif;';
    const catCounts = PART_CATEGORIES.map(c => {
        const n = Object.values(PART_CATALOG).filter(p => p.category === c.id).length;
        return `${c.icon}×${n}`;
    }).join('  ');
    summary.textContent = catCounts;
    footer.appendChild(summary);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'menu-btn';
    closeBtn.style.cssText = 'font-size:10px;padding:6px 14px;';
    closeBtn.textContent = '✕ CLOSE';
    closeBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
    });
    footer.appendChild(closeBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);

    // Initial render
    renderPartsList();
}

/**
 * Visual preview swatch data for each part key.
 * Returns { bg, border } to render a distinctive color swatch.
 */
const SWATCH_MAP = {
    platform:       { bg: 'linear-gradient(135deg,#8B6914,#A0782C)', border: '#8B6914' },
    ramp:           { bg: 'linear-gradient(160deg,#8B6914 40%,#6B4F10 60%)', border: '#6B4F10' },
    glass_platform: { bg: 'linear-gradient(135deg,rgba(100,200,255,0.5),rgba(60,140,200,0.3))', border: 'rgba(100,200,255,0.5)' },
    speed_strip:    { bg: 'linear-gradient(135deg,#FFD700,#FFA500)', border: '#FFD700' },
    finish_line:    { bg: 'linear-gradient(135deg,#00CC44,#00FF00)', border: '#00FF00' },
    spring_pad:     { bg: 'linear-gradient(135deg,#FF8C00,#FF6200)', border: '#FF8C00' },
    curve:          { bg: 'linear-gradient(135deg,#8B6914,#6B4F10)', border: '#8B6914' },
    stairs:         { bg: 'linear-gradient(180deg,#8B6914 20%,#A0782C 20%,#A0782C 40%,#8B6914 40%,#8B6914 60%,#A0782C 60%,#A0782C 80%,#8B6914 80%)', border: '#6B4F10' },
    half_pipe:      { bg: 'linear-gradient(180deg,transparent 10%,#8B6914 30%,#A0782C 70%,transparent 90%)', border: '#6B4F10' },
    checkerboard:   { bg: 'repeating-conic-gradient(#fff 0% 25%,#333 0% 50%)', border: '#555' },
    glass_stairs:   { bg: 'linear-gradient(180deg,rgba(100,200,255,0.5) 20%,rgba(60,140,200,0.3) 40%,rgba(100,200,255,0.5) 60%,rgba(60,140,200,0.3) 80%)', border: 'rgba(100,200,255,0.5)' },
    glass_curve:    { bg: 'linear-gradient(135deg,rgba(100,200,255,0.5),rgba(150,80,255,0.3))', border: 'rgba(100,200,255,0.5)' },
    wall:           { bg: 'linear-gradient(135deg,#777,#999)', border: '#888' },
    tunnel_walls:   { bg: 'linear-gradient(90deg,#555 15%,#333 15%,#333 85%,#555 85%)', border: '#666' },
    loop_de_loop:   { bg: 'radial-gradient(circle at 50% 50%,transparent 30%,#8B6914 32%,#A0782C 48%,transparent 50%)', border: '#8B6914' },
    spiral_tube:    { bg: 'conic-gradient(from 0deg,#8B6914,#A0782C,#6B4F10,#8B6914)', border: '#6B4F10' },
    glass_loop:     { bg: 'radial-gradient(circle at 50% 50%,transparent 30%,rgba(100,200,255,0.5) 32%,rgba(60,140,200,0.3) 48%,transparent 50%)', border: 'rgba(100,200,255,0.5)' },
    pendulum:       { bg: 'radial-gradient(circle at 50% 70%,#FF4444 18%,#CC2222 20%,transparent 21%)', border: '#CC2222' },
    spinner:        { bg: 'conic-gradient(from 0deg,#CC2222,#FF6666,#CC2222,#FF6666,#CC2222)', border: '#CC2222' },
    hammer:         { bg: 'linear-gradient(180deg,#999 20%,#666 20%,#666 50%,#8B6914 50%)', border: '#888' },
    mover:          { bg: 'linear-gradient(135deg,#CC4444,#FF6666)', border: '#CC4444' },
    blade:          { bg: 'linear-gradient(135deg,#DDD,#888,#DDD)', border: '#AAA' },
    coin_line:      { bg: 'linear-gradient(135deg,#FFD700,#DAA520,#FFD700,#DAA520)', border: '#FFD700' },
    checkpoint:     { bg: 'linear-gradient(180deg,#4488FF 50%,#FFF 50%)', border: '#4488FF' },
    finish_model:   { bg: 'linear-gradient(135deg,#00AA44,#00FF66)', border: '#00CC44' },
    portal_ring:    { bg: 'radial-gradient(circle at 50% 50%,transparent 28%,#9944FF 30%,rgba(153,68,255,0.5) 48%,transparent 50%)', border: '#9944FF' }
};

/**
 * Create a small preview swatch element for a part.
 */
function createPartSwatch(part) {
    const sw = SWATCH_MAP[part.key] || { bg: 'rgba(255,255,255,0.08)', border: '#555' };
    const el = document.createElement('div');
    el.style.cssText = `
        width:48px; height:32px; flex-shrink:0; border-radius:6px;
        background:${sw.bg}; border:1px solid ${sw.border}44;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08);
    `;
    el.title = part.name;
    return el;
}

/**
 * Per-tier UI overrides for the canonical DIFFICULTY_TIERS imported from
 * levelgen.js. levelgen.js carries gameplay colors (fog tint + body
 * backgroundColor) which sometimes look identical-to-background on the
 * overlay (e.g. IMPOSSIBLE `0x000000` = same as backdrop), so the badge UI
 * calibrates a small set per-level overrides here. Anything not in this map
 * falls back to {@link deriveTierDisplay} (color CSS = fill + border black
 * border + brightness-picked text). Edit the canonical data in
 * levelgen.js; only override *appearance* here.
 */
const TIER_DISPLAY_OVERRIDES = {
    // level -> { color?, border?, text? } (all CSS strings)
    10: { color: '#cccc00' },                          // HARD: darker yellow reads as gold not neon
    19: { text: '#ff8888' },                           // EXTREME: warm-contrast text on dark red
    22: { border: '#9944ff', text: '#cc88ff' },        // INSANE: purple-cyan glow instead of just fill
    25: { color: '#1a1a1a', border: '#555', text: '#ff6666' } // IMPOSSIBLE: dark gray (vs 0x000000 black hole) + accent border/text
};

/**
 * Convert a CANNON-style RGB int (e.g. 0x7cfc00) to a CSS `#rrggbb` string.
 */
function hexIntToCss(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
}

/**
 * Derive the UI display fields for a canonical tier (color / border / text
 * CSS strings). Honors TIER_DISPLAY_OVERRIDES; falls back to the canonical
 * color with border-color = same-as-fill and brightness-picked text.
 */
function deriveTierDisplay(tier) {
    const override = TIER_DISPLAY_OVERRIDES[tier.level] || {};
    // The canonical .color may also be overridden (e.g. IMPOSSIBLE 0x000000
    // would render invisibly on a dark backdrop) so go through the override
    // first; if absent, convert the canonical hex int → CSS string.
    const baseHex = override.color
        ? parseInt(override.color.replace('#', ''), 16)
        : tier.color;
    const color = override.color || hexIntToCss(tier.color);
    const border = override.border || color;
    // Brightness from the EFFECTIVE color (override or canonical) so overrides
    // pick a sensible text contrast too.
    const r = (baseHex >> 16) & 0xff, g = (baseHex >> 8) & 0xff, b = baseHex & 0xff;
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    const defaultText = brightness > 140 ? '#000' : '#fff';
    const text = override.text || defaultText;
    return { color, border, text };
}

/**
 * Memoized view of the canonical DIFFICULTY_TIERS with derived display
 * fields baked in. UI consumers can read this like the previous local
 * constant: `tier.color`, `tier.border`, `tier.text`, `tier.types`.
 * (Kept a local view so we don't mutate the canonical export.)
 */
const TIER_DISPLAY = DIFFICULTY_TIERS.map(t => ({
    level: t.level,
    label: t.label,
    types: t.types,
    ...deriveTierDisplay(t)
}));

/**
 * Maps procedural segment types (used in difficulty tiers) to catalog part keys.
 */
const SEGMENT_TO_PART = {
    straight:         ['platform'],
    ramp:             ['ramp'],
    tunnel:           ['tunnel_walls'],
    speed_strip:      ['speed_strip'],
    jump_gap:         ['platform'],
    zigzag:           ['platform'],
    bumpy:            ['platform'],
    climb:            ['platform'],
    gap:              ['platform'],
    archipelago:      ['platform'],
    spinner:          ['spinner'],
    double_jump_gap:  ['platform'],
    pendulum:         ['pendulum'],
    stairs:           ['stairs'],
    halfpipe:         ['half_pipe'],
    hammer_gauntlet:  ['hammer'],
    moving_rects:     ['mover'],
    checkerboard:     ['checkerboard'],
    side_crusher:     ['mover'],
    narrow:           ['platform'],
    triple_jump_gap:  ['platform'],
    loop_d_loop:      ['loop_de_loop'],
    spiral_tube:      ['spiral_tube']
};

/**
 * Get the difficulty tiers a catalog part appears in.
 * Returns an array of tier badge data: { label, level, bg, border, text }.
 */
function getPartTierBadges(partKey) {
    const tiers = [];
    for (const tier of TIER_DISPLAY) {
        for (const segType of tier.types) {
            const mappedParts = SEGMENT_TO_PART[segType];
            if (mappedParts && mappedParts.includes(partKey)) {
                tiers.push({
                    label: tier.label,
                    level: tier.level,
                    bg: tier.color + '22',
                    border: tier.border + '66',
                    text: tier.text
                });
                break;
            }
        }
    }
    return tiers;
}

/**
 * Create a single part card element for the catalog.
 */
function createPartCard(part, game) {
    const card = document.createElement('div');
    card.style.cssText = `
        background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06);
        border-radius:10px; padding:12px; margin-bottom:6px;
        transition:background 0.15s, border-color 0.15s;
        cursor:default;
    `;
    card.addEventListener('mouseenter', () => {
        card.style.background = 'rgba(136,68,255,0.08)';
        card.style.borderColor = 'rgba(136,68,255,0.2)';
    });
    card.addEventListener('mouseleave', () => {
        card.style.background = 'rgba(255,255,255,0.03)';
        card.style.borderColor = 'rgba(255,255,255,0.06)';
    });

    // Top row: swatch + icon + name + key
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    const swatch = createPartSwatch(part);
    topRow.appendChild(swatch);
    const iconAndName = document.createElement('div');
    iconAndName.style.cssText = 'flex:1;min-width:0;';
    iconAndName.innerHTML = `
        <div style="color:#fff;font-weight:700;font-size:13px;">${part.icon} ${part.name}</div>
        <div style="color:#666;font-size:9px;font-family:monospace;">${part.key}</div>
    `;
    topRow.appendChild(iconAndName);
    card.appendChild(topRow);

    // Description
    const desc = document.createElement('div');
    desc.style.cssText = 'color:#aaa;font-size:11px;line-height:1.4;margin-bottom:8px;';
    desc.textContent = part.description;
    card.appendChild(desc);

    // Usage tier badges
    const tierBadges = getPartTierBadges(part.key);
    const tierRow = document.createElement('div');
    tierRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;align-items:center;';
    if (tierBadges.length > 0) {
        const tierLabel = document.createElement('span');
        tierLabel.style.cssText = 'color:#555;font-size:8px;font-family:monospace;margin-right:2px;';
        tierLabel.textContent = 'TIER';
        tierRow.appendChild(tierLabel);
        for (const t of tierBadges) {
            const badge = document.createElement('span');
            badge.style.cssText = `
                background:${t.bg}; border:1px solid ${t.border};
                border-radius:3px; padding:1px 6px; font-size:8px; color:${t.text};
                font-family:'Segoe UI',sans-serif; white-space:nowrap; font-weight:600;
                letter-spacing:0.3px;
            `;
            badge.textContent = t.label;
            badge.title = `${t.label} — Level ${t.level}+`;
            tierRow.appendChild(badge);
        }
    } else {
        const builderBadge = document.createElement('span');
        builderBadge.style.cssText = `
            background:rgba(100,180,255,0.12); border:1px solid rgba(100,180,255,0.3);
            border-radius:3px; padding:1px 6px; font-size:8px; color:#64b4ff;
            font-family:'Segoe UI',sans-serif; white-space:nowrap; font-weight:600;
            letter-spacing:0.3px;
        `;
        builderBadge.textContent = '🔧 BUILDER ONLY';
        builderBadge.title = 'Not used in procedural levels — builder and community tracks only';
        tierRow.appendChild(builderBadge);
    }
    card.appendChild(tierRow);

    // Defaults row
    if (part.defaults && Object.keys(part.defaults).length > 0) {
        const defaultsRow = document.createElement('div');
        defaultsRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;';
        for (const [key, val] of Object.entries(part.defaults)) {
            if (val === null || val === undefined) continue;
            const chip = document.createElement('span');
            chip.style.cssText = `
                background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08);
                border-radius:4px; padding:2px 6px; font-size:9px; color:#888;
                font-family:'Segoe UI',sans-serif; white-space:nowrap;
            `;
            chip.textContent = `${key}: ${val}`;
            defaultsRow.appendChild(chip);
        }
        card.appendChild(defaultsRow);
    }

    // Connection points
    if (part.connPts && part.connPts.length > 0) {
        const connRow = document.createElement('div');
        connRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
        const connLabel = document.createElement('span');
        connLabel.style.cssText = 'color:#555;font-size:9px;';
        connLabel.textContent = `🔗 ${part.connPts.length} snap point${part.connPts.length > 1 ? 's' : ''}`;
        connRow.appendChild(connLabel);

        const dirs = [...new Set(part.connPts.map(p => p.dir))];
        for (const dir of dirs) {
            const dirChip = document.createElement('span');
            dirChip.style.cssText = `
                background:rgba(136,68,255,0.12); border:1px solid rgba(136,68,255,0.2);
                border-radius:3px; padding:1px 5px; font-size:8px; color:#9944ff;
                font-family:monospace;
            `;
            dirChip.textContent = dir;
            connRow.appendChild(dirChip);
        }
        card.appendChild(connRow);
    }

    // Builder function + Place button
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:6px;gap:8px;';
    if (part.builderFn) {
        const fnLabel = document.createElement('span');
        fnLabel.style.cssText = 'color:#444;font-size:8px;font-family:monospace;';
        fnLabel.textContent = `fn: ${part.builderFn}()`;
        bottomRow.appendChild(fnLabel);
    } else {
        bottomRow.appendChild(document.createElement('span')); // spacer
    }
    // Place in builder button
    if (game) {
        const placeBtn = document.createElement('button');
        placeBtn.style.cssText = `
            background:rgba(136,68,255,0.15); border:1px solid rgba(136,68,255,0.3);
            border-radius:5px; padding:4px 10px; font-size:9px; color:#9944ff;
            font-family:'Segoe UI',sans-serif; cursor:pointer; white-space:nowrap;
            font-weight:600; transition:background 0.15s, border-color 0.15s;
        `;
        placeBtn.textContent = '▶ PLACE';
        placeBtn.title = `Open builder with ${part.name} selected`;
        placeBtn.addEventListener('mouseenter', () => {
            placeBtn.style.background = 'rgba(136,68,255,0.3)';
            placeBtn.style.borderColor = 'rgba(136,68,255,0.6)';
        });
        placeBtn.addEventListener('mouseleave', () => {
            placeBtn.style.background = 'rgba(136,68,255,0.15)';
            placeBtn.style.borderColor = 'rgba(136,68,255,0.3)';
        });
        placeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close catalog panel
            const overlay = document.getElementById('overlay');
            if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
            // Pre-select the part and enter builder
            game._builderSelectedKey = part.key;
            if (!game._builderActive) {
                game.enterBuilder();
            } else {
                // Already in builder — highlight the selected card in the sidebar
                const sidebarCard = document.querySelector(`.builder-part-card[data-part-key="${part.key}"]`);
                if (sidebarCard) sidebarCard.click();
            }
        });
        bottomRow.appendChild(placeBtn);
    }
    card.appendChild(bottomRow);

    return card;
}
