/*
 Open World UI.

 Renders a 4-tab overlay panel exposing the full project plan:

   Tab 1 — TRACK BUILDER  : every placable part (PART_CATALOG grouped by category)
   Tab 2 — LEVEL SEGMENTS : every difficulty tier + every segment type
                            used by the procedural generator (difficultyTiers
                            in src/levelgen.js), plus the catalog mapping.
   Tab 3 — SHOP PLANS     : every shop pricing tier (Basic / Pro / Ultimate)
                            defined in src/scripts/shop_logic.lua.
   Tab 4 — DEV PLAN       : the master development plan
                            (DEVELOPMENT_PHASES from src/world/world_zoning.js)
                            plus the player's current selections (sky, ball,
                            difficulty tier, player state).

 Exposed entry point: `renderOpenWorld(game)` — opens the overlay.
 Exposed exit:        `closeOpenWorld()`    — closes the overlay and removes
                                               its DOM.

 Keeping this module DOM-only (no Vite importmap dance) so it can be wired
 into the in-game menu the same way world_ui.js does for the World Map.
*/

// ============================================================================
// Catalog data (imported from the project's source of truth; no mirror copies)
// ============================================================================
// PART_CATEGORIES + PART_CATALOG come from src/builder/catalog.js. That file
// is the canonical source for every placable part — the Open World UI just
// renders this data, so we import it directly to guarantee zero drift when
// a new part is added (no parallel array to update).
import { PART_CATEGORIES, PART_CATALOG } from '../builder/catalog.js';

// ============================================================================
// Level segment catalog (canonical source: src/levelgen.js DIFFICULTY_TIERS)
// ============================================================================
// Imported from levelgen.js so this UI stays in lockstep with the procedural
// generator. The renderer converts the canonical `color` hex-int to a CSS
// string via '#' + tier.color.toString(16).padStart(6, '0') and picks the
// contrast label color from a brightness test — no manual mirror to drift.
import { DIFFICULTY_TIERS } from '../levelgen.js';
const SEGMENT_DESCRIPTIONS = {
    straight:        'Flat wooden platforms in a line.',
    ramp:            'Angled ramp up to the next platform.',
    tunnel:          'Platform with parallel walls forming a tunnel.',
    speed_strip:     'Yellow platform marking a speed-zone (cosmetic).',
    jump_gap:        'Small gap the player must single-jump over.',
    zigzag:          'Two side-stepping platforms.',
    bumpy:           'Six consecutive low-height platform bumps.',
    climb:           'Three ascending platforms with vertical gaps.',
    gap:             'Gap with coins placed over it.',
    archipelago:     'Five small stepping-stone platforms along a row.',
    spinner:         'Platform with a horizontal rotating bar overhead.',
    double_jump_gap: 'Larger gap requiring a double jump.',
    loop_d_loop:     'Full 360° loop built from ramp + arc platforms.',
    pendulum:        'Platform with a swinging wrecking ball above.',
    stairs:          'Step pattern, grouped ramps of constant height.',
    halfpipe:        'Wide flat platform with angled side walls.',
    hammer_gauntlet: 'Platform with three slamming hammers overhead.',
    moving_rects:    'Platform with several sliding hazard blocks.',
    side_crusher:    'Platform with hazard blocks sliding in from each side.',
    narrow:          'Narrow platform with precision steering.',
    triple_jump_gap: 'Largest gap, requires a triple jump with three air coin pickups.',
    checkerboard:    'Offset checkerboard tiles, hardest footwork.',
    spiral_tube:     'Spiraling tube with walls ascending as it twists.'
};
const SEGMENT_TO_PART = {
    straight:        ['platform'],
    ramp:            ['ramp'],
    tunnel:          ['tunnel_walls'],
    speed_strip:     ['speed_strip'],
    jump_gap:        ['platform'],
    zigzag:          ['platform'],
    bumpy:           ['platform'],
    climb:           ['platform'],
    gap:             ['platform'],
    archipelago:     ['platform'],
    spinner:         ['spinner'],
    double_jump_gap: ['platform'],
    pendulum:        ['pendulum'],
    stairs:          ['stairs'],
    halfpipe:        ['half_pipe'],
    hammer_gauntlet: ['hammer'],
    moving_rects:    ['mover'],
    checkerboard:    ['checkerboard'],
    side_crusher:    ['mover'],
    narrow:          ['platform'],
    triple_jump_gap: ['platform'],
    loop_d_loop:     ['loop_de_loop'],
    spiral_tube:     ['spiral_tube']
};

// ============================================================================
// Shop pricing tiers (mirrors src/scripts/shop_logic.lua PRICING_TIERS)
// ============================================================================
const PRICING_TIERS = [
    {
        id: 1,
        name: 'Basic',
        color: '#aaa',
        price: 500,
        priceUSD: '$5.00',
        valueMult: 1.0,
        perks: ['Basic ball skin', 'Ad-free play', 'Cloud saves'],
        i18nKey: 'tier.basic.name',
        bargain: 'Anchor price — Pro / Ultimate look bigger in comparison.',
        strategicEffect: 'Endowed Progress: starts you with 2/10 stamps already collected.'
    },
    {
        id: 2,
        name: 'Pro',
        color: '#44ff44',
        price: 1800,
        priceUSD: '$18.00',
        valueMult: 2.8,
        perks: ['All Basic perks', '3 premium skins', 'Double coin weekends', 'Exclusive Pro badge', 'Priority support'],
        i18nKey: 'tier.pro.name',
        bargain: 'Decoy tier — only $2 less than Ultimate so the comparison feels like a bargain.',
        strategicEffect: 'Sunk-cost: returning buyers get a 5% discount. Modifies loot-box rare rates by 1.5×.'
    },
    {
        id: 3,
        name: 'Ultimate',
        color: '#ffcc00',
        price: 2000,
        priceUSD: '$20.00',
        valueMult: 5.0,
        perks: ['All Pro perks', 'ALL ball skins (70+)', 'ALL sky themes', 'Unlimited track builder', 'Early access features', 'VIP badge + chat color', 'Monthly coin bonus (500)'],
        i18nKey: 'tier.ultimate.name',
        bargain: 'Target tier. Only $2 more than Pro (in coins: matters) but +5× value multiplier.',
        strategicEffect: 'Loot boxes: rare 2×, epic 3×, legendary 5×. Awards 3 stamps (battle-pass progress).'
    }
];

// ============================================================================
// Master development plan (imported from src/world/world_zoning.js)
// ============================================================================
// DEVELOPMENT_PHASES is the canonical zone-unlock schedule. Importing from
// the source-of-truth file keeps the Open World UI in lockstep with whatever
// zones / phase gating the world networking layer actually checks at runtime.
import { DEVELOPMENT_PHASES } from '../world/world_zoning.js';

// ============================================================================
// Renderer
// ============================================================================
export function renderOpenWorld(game) {
    const overlay = document.getElementById('overlay');
    if (!overlay) {
        console.warn('[openworld] #overlay element missing — cannot open UI');
        return;
    }

    // If already open, just refocus
    if (document.getElementById('openworld-container')) {
        return;
    }

    overlay.style.display = 'flex';
    overlay.style.alignItems = 'stretch';
    overlay.style.justifyContent = 'stretch';
    overlay.style.padding = '0';
    overlay.innerHTML = '';

    const container = document.createElement('div');
    container.id = 'openworld-container';
    container.style.cssText = `
        width:100%;height:100vh;display:flex;flex-direction:column;
        background:linear-gradient(180deg,rgba(10,12,30,0.98),rgba(8,10,20,0.98));
        font-family:'Segoe UI',sans-serif;color:#fff;overflow:hidden;
    `;

    // --- Header ---
    const header = document.createElement('div');
    header.style.cssText = `
        padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08);
        display:flex;justify-content:space-between;align-items:center;
        background:rgba(0,0,0,0.3);flex-shrink:0;
    `;
    header.innerHTML = `
        <span style="font-weight:700;font-size:16px;font-family:'5x5dots',monospace;letter-spacing:1px;">
            🌐 OPEN WORLD — Project Plan
        </span>
        <button id="openworld-close-btn" class="menu-btn" aria-label="Close Open World panel"
            style="font-size:11px;padding:4px 12px;">✕ CLOSE</button>
    `;
    container.appendChild(header);

    // --- Tabs ---
    const tabs = document.createElement('div');
    tabs.id = 'openworld-tabs';
    const tabDefs = [
        { id: 'builder',   label: '🔧 TRACK BUILDER' },
        { id: 'segments',  label: '📊 LEVEL SEGMENTS' },
        { id: 'shop',      label: '🛒 SHOP PLANS' },
        { id: 'devplan',   label: '🗺️ DEV PLAN' }
    ];
    let activeTab = 'builder';
    tabs.style.cssText = `
        display:flex;gap:4px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.06);
        overflow-x:auto;flex-shrink:0;
    `;
    tabDefs.forEach((t, idx) => {
        const btn = document.createElement('button');
        btn.className = 'openworld-tab-btn';
        btn.dataset.tab = t.id;
        btn.style.cssText = `
            padding:6px 14px;font-size:11px;border-radius:6px;
            border:1px solid rgba(255,255,255,0.15);
            background:${idx === 0 ? 'rgba(136,68,255,0.3)' : 'transparent'};
            color:${idx === 0 ? '#fff' : '#aaa'};cursor:pointer;white-space:nowrap;
            transition:all 0.2s;font-family:'Segoe UI',sans-serif;
        `;
        btn.innerText = t.label;
        btn.addEventListener('click', () => {
            activeTab = t.id;
            tabs.querySelectorAll('.openworld-tab-btn').forEach(b => {
                b.style.background = 'transparent';
                b.style.color = '#aaa';
            });
            btn.style.background = 'rgba(136,68,255,0.3)';
            btn.style.color = '#fff';
            renderTab(game, t.id);
        });
        tabs.appendChild(btn);
    });
    container.appendChild(tabs);

    // --- Tab content area ---
    const content = document.createElement('div');
    content.id = 'openworld-content';
    content.style.cssText = 'flex:1;overflow-y:auto;padding:16px;';
    container.appendChild(content);

    overlay.appendChild(container);

    // Close handler
    function close() {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
    }
    const closeBtn = document.getElementById('openworld-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Background-click closes (unless builder is active is NOT this case)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            close();
        }
    });

    // Render initial tab
    renderTab(game, activeTab);
}

function renderTab(game, tabId) {
    const content = document.getElementById('openworld-content');
    if (!content) return;
    content.innerHTML = '';
    switch (tabId) {
        case 'builder':  renderBuilderTab(content);   break;
        case 'segments': renderSegmentsTab(content);  break;
        case 'shop':     renderShopTab(content);      break;
        case 'devplan':  renderDevPlanTab(content, game); break;
    }
}

// ============================================================================
// Tab 1 — Track Builder (every PART_CATALOG part grouped by category)
// ============================================================================
function renderBuilderTab(container) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:18px;max-width:980px;margin:0 auto;';

    const intro = document.createElement('div');
    intro.style.cssText = 'color:#aaa;font-size:12px;line-height:1.5;';
    intro.innerHTML = `
        Every placable part in the <code style="color:#ffdd66;">src/builder/catalog.js</code>
        <code style="color:#ffdd66;">PART_CATALOG</code>, grouped by category. Each entry shows the
        part key (used to call the builder function), default parameters, and a short description.
        Total: <b style="color:#fff;">${Object.keys(PART_CATALOG).length} parts</b> across
        <b style="color:#fff;">${PART_CATEGORIES.length} categories</b>.
    `;
    wrap.appendChild(intro);

    PART_CATEGORIES.forEach(cat => {
        const parts = Object.values(PART_CATALOG).filter(p => p.category === cat.id);
        if (parts.length === 0) return;

        const section = document.createElement('div');
        section.style.cssText = `
            background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);
            border-radius:10px;padding:14px;
        `;

        const catHeader = document.createElement('div');
        catHeader.style.cssText = `
            display:flex;align-items:center;gap:8px;margin-bottom:10px;
            border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:6px;
        `;
        catHeader.innerHTML = `
            <span style="font-size:20px;">${cat.icon}</span>
            <span style="font-size:14px;font-weight:700;color:#fff;">${cat.label}</span>
            <span style="font-size:10px;color:#888;">${parts.length} parts</span>
        `;
        section.appendChild(catHeader);

        const grid = document.createElement('div');
        grid.style.cssText = `
            display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));
            gap:8px;
        `;
        parts.forEach(part => {
            const card = document.createElement('div');
            card.style.cssText = `
                background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);
                border-radius:8px;padding:10px;transition:border-color 0.2s;
            `;
            card.addEventListener('mouseenter', () => { card.style.borderColor = 'rgba(136,68,255,0.3)'; });
            card.addEventListener('mouseleave', () => { card.style.borderColor = 'rgba(255,255,255,0.06)'; });

            const defaultsList = Object.entries(part.defaults || {})
                .map(([k, v]) => `<span style="color:#aaa;">${k}=</span><span style="color:#ffdd66;">${typeof v === 'number' ? v : `"${v}"`}</span>`)
                .join(' · ');
            card.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-size:18px;">${part.icon}</span>
                    <span style="font-size:12px;font-weight:600;color:#fff;">${part.name}</span>
                    <code style="margin-left:auto;font-size:9px;color:#8844ff;background:rgba(136,68,255,0.08);padding:1px 5px;border-radius:3px;">${part.key}</code>
                </div>
                <div style="font-size:10px;color:#aaa;margin-bottom:4px;line-height:1.4;">${part.description}</div>
                ${defaultsList ? `<div style="font-size:9px;font-family:monospace;color:#888;">${defaultsList}</div>` : ''}
            `;
            grid.appendChild(card);
        });

        section.appendChild(grid);
        wrap.appendChild(section);
    });

    container.appendChild(wrap);
}

// ============================================================================
// Tab 2 — Level Segments (every difficultyTiers segment type)
// ============================================================================
function renderSegmentsTab(container) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;max-width:980px;margin:0 auto;';

    const intro = document.createElement('div');
    intro.style.cssText = 'color:#aaa;font-size:12px;line-height:1.5;';
    intro.innerHTML = `
        Every difficulty tier defined in <code style="color:#ffdd66;">src/levelgen.js</code>
        <code style="color:#ffdd66;">difficultyTiers</code>, with each segment type it can spawn
        + the catalog part used to place it. As player level increases, progressively harder tiers
        unlock — each tier's types are sampled uniformly via
        <code style="color:#ffdd66;">tier.types[Math.floor(rand() * tier.types.length)]</code>.
    `;
    wrap.appendChild(intro);

    DIFFICULTY_TIERS.forEach(tier => {
        const section = document.createElement('div');
        section.style.cssText = `
            background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
            border-radius:10px;padding:14px;
        `;

        const bg = '#' + tier.color.toString(16).padStart(6, '0');
        const brightness = ((tier.color >> 16) & 0xff) * 0.299 + ((tier.color >> 8) & 0xff) * 0.587 + (tier.color & 0xff) * 0.114;
        const fg = brightness > 140 ? '#000' : '#fff';

        const head = document.createElement('div');
        head.style.cssText = `
            display:flex;align-items:center;gap:10px;margin-bottom:10px;
            padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06);
        `;
        head.innerHTML = `
            <span style="background:${bg};color:${fg};padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:1px;">
                LVL ${tier.level}+
            </span>
            <span style="color:#fff;font-size:13px;font-weight:700;">${tier.label}</span>
            <span style="color:#888;font-size:10px;margin-left:auto;">${tier.types.length} segment types</span>
        `;
        section.appendChild(head);

        // Segment types grid
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;';
        tier.types.forEach(segType => {
            const card = document.createElement('div');
            card.style.cssText = `
                background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);
                border-radius:6px;padding:8px;
            `;
            const mappedParts = (SEGMENT_TO_PART[segType] || []).map(k =>
                `<code style="color:#ffdd66;background:rgba(255,204,0,0.08);padding:1px 4px;border-radius:3px;">${k}</code>`
            ).join(' ');
            card.innerHTML = `
                <div style="font-size:11px;font-weight:600;color:#fff;margin-bottom:2px;">${segType}</div>
                <div style="font-size:9px;color:#aaa;line-height:1.3;margin-bottom:4px;">${SEGMENT_DESCRIPTIONS[segType] || '—'}</div>
                <div style="font-size:9px;color:#888;">parts: ${mappedParts || '<i>none</i>'}</div>
            `;
            grid.appendChild(card);
        });
        section.appendChild(grid);
        wrap.appendChild(section);
    });

    container.appendChild(wrap);
}

// ============================================================================
// Tab 3 — Shop Plans (every PRICING_TIERS tier)
// ============================================================================
function renderShopTab(container) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;max-width:980px;margin:0 auto;';

    const intro = document.createElement('div');
    intro.style.cssText = 'color:#aaa;font-size:12px;line-height:1.5;';
    intro.innerHTML = `
        Pricing tiers defined in
        <code style="color:#ffdd66;">src/scripts/shop_logic.lua</code>
        <code style="color:#ffdd66;">PRICING_TIERS</code>. Game theory: <b style="color:#fff;">Decoy Pricing</b>
        (Pro is the decoy — only ~10% cheaper than Ultimate, making Ultimate feel like a bargain),
        <b style="color:#fff;">Endowed Progress</b> (Basic purchasers start with 2/10 stamps already
        collected, leveraging completion bias), and <b style="color:#fff;">Sunk-Cost Discounting</b>
        (>10h playtime = 10% off, >5h = 5% off, returning buyer = 5% off).
    `;
    wrap.appendChild(intro);

    PRICING_TIERS.forEach(tier => {
        const section = document.createElement('div');
        section.style.cssText = `
            background:rgba(255,255,255,0.03);border:2px solid ${tier.color}33;
            border-radius:12px;padding:18px;position:relative;
        `;

        const valuePerCoin = (tier.valueMult / tier.price * 100).toFixed(3);

        section.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                <span style="background:${tier.color};color:${tier.color === '#aaa' ? '#000' : '#000'};padding:4px 12px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;">
                    TIER ${tier.id}
                </span>
                <span style="color:#fff;font-size:18px;font-weight:700;">${tier.name}</span>
                <span style="color:#888;font-size:11px;font-family:monospace;">i18n: <code style="color:#ffdd66;">${tier.i18nKey}</code></span>
            </div>
            <div style="display:flex;gap:20px;margin-bottom:10px;flex-wrap:wrap;">
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <span style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">PRICE (USD)</span>
                    <span style="color:#fff;font-size:18px;font-weight:700;">${tier.priceUSD}</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <span style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">PRICE (COINS)</span>
                    <span style="color:#ffd700;font-size:18px;font-weight:700;">${tier.price} 🪙</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <span style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">VALUE MULTIPLIER</span>
                    <span style="color:${tier.color};font-size:18px;font-weight:700;">×${tier.valueMult.toFixed(1)}</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <span style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">VALUE/100 COINS</span>
                    <span style="color:#ffdd66;font-size:18px;font-weight:700;">${valuePerCoin}</span>
                </div>
            </div>
            <div style="margin-bottom:10px;">
                <div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">PERKS</div>
                <ul style="margin:0;padding-left:20px;color:#ddd;font-size:12px;line-height:1.6;">
                    ${tier.perks.map(p => `<li>${p}</li>`).join('')}
                </ul>
            </div>
            <div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 10px;margin-top:8px;">
                <div style="color:#ffa500;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;font-weight:700;">STRATEGIC ROLE</div>
                <div style="color:#ccc;font-size:11px;line-height:1.5;">${tier.strategicEffect}</div>
                <div style="color:#888;font-size:10px;margin-top:3px;font-style:italic;">${tier.bargain}</div>
            </div>
        `;

        wrap.appendChild(section);
    });

    container.appendChild(wrap);
}

// ============================================================================
// Tab 4 — Dev Plan (master development phases + current player state)
// ============================================================================
function renderDevPlanTab(container, game) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;max-width:980px;margin:0 auto;';

    const intro = document.createElement('div');
    intro.style.cssText = 'color:#aaa;font-size:12px;line-height:1.5;';
    intro.innerHTML = `
        Master development plan from
        <code style="color:#ffdd66;">src/world/world_zoning.js</code>
        <code style="color:#ffdd66;">DEVELOPMENT_PHASES</code>. Zones unlock as
        <code style="color:#ffdd66;">activePlayerCount</code> reaches each phase's
        <code style="color:#ffdd66;">minPlayerCount</code>.
    `;
    wrap.appendChild(intro);

    // ---- Player State section ----
    const stateSection = document.createElement('div');
    stateSection.style.cssText = `
        background:rgba(255,255,255,0.04);border:1px solid rgba(136,68,255,0.2);
        border-radius:10px;padding:14px;
    `;
    stateSection.innerHTML = `
        <div style="font-size:13px;font-weight:700;color:#9944ff;margin-bottom:10px;">CURRENT PLAYER STATE</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;font-size:11px;">
            ${renderPlayerStateRow('Selected Ball', (game && game.saveData && game.saveData.selectedBall) || 'rainbow')}
            ${renderPlayerStateRow('Selected Sky',  (game && game.saveData && game.saveData.selectedSky) || 'day')}
            ${renderPlayerStateRow('Difficulty Tier', game && game.currentTier ? game.currentTier.label : 'EASY')}
            ${renderPlayerStateRow('Current Level',  game && game.currentLevel ? 'L' + game.currentLevel : 'L1')}
            ${renderPlayerStateRow('Total Coins',    game && game.saveData && game.saveData.totalCoins != null ? game.saveData.totalCoins + ' 🪙' : '0 🪙')}
            ${renderPlayerStateRow('Builder Level',  game && game.saveData && game.saveData.builderLevel ? 'L' + game.saveData.builderLevel : 'L1')}
            ${renderPlayerStateRow('Tracks Created', game && game.saveData && game.saveData.totalTracksCreated != null ? game.saveData.totalTracksCreated : 0)}
            ${renderPlayerStateRow('Particles (rain)', game && game.raining ? 'active' : 'off')}
        </div>
    `;
    wrap.appendChild(stateSection);

    // ---- Development phases table ----
    const phaseSection = document.createElement('div');
    phaseSection.style.cssText = `
        background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
        border-radius:10px;padding:14px;
    `;

    const phaseHead = document.createElement('div');
    phaseHead.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:10px;';
    phaseHead.innerText = 'MASTER DEVELOPMENT PHASES';
    phaseSection.appendChild(phaseHead);

    DEVELOPMENT_PHASES.forEach(p => {
        const row = document.createElement('div');
        row.style.cssText = `
            display:flex;gap:14px;align-items:flex-start;padding:10px;
            border-bottom:1px solid rgba(255,255,255,0.05);
        `;
        const phaseBg = p.phase === 1 ? '#44ff88' : p.phase === 6 ? '#aa88ff' : '#9944ff';
        row.innerHTML = `
            <div style="background:${phaseBg};color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;font-weight:700;flex-shrink:0;min-width:60px;text-align:center;">
                Phase<br>${p.phase}
            </div>
            <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                    <span style="color:#fff;font-size:13px;font-weight:600;">${p.name}</span>
                    <span style="color:#ffcc00;font-size:10px;">🔓 ≥ ${p.minPlayerCount.toLocaleString()} players</span>
                </div>
                <div style="font-size:11px;color:#aaa;line-height:1.5;margin-bottom:6px;">${p.description}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${p.activeZones.map(z => `
                        <code style="background:rgba(136,68,255,0.12);border:1px solid rgba(136,68,255,0.25);
                            color:#ccaaff;padding:2px 8px;border-radius:4px;font-size:9px;">${z}</code>
                    `).join('')}
                </div>
            </div>
        `;
        phaseSection.appendChild(row);
    });

    wrap.appendChild(phaseSection);

    // ---- Build settings (springs, constants) ----
    const settingsSection = document.createElement('div');
    settingsSection.style.cssText = `
        background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
        border-radius:10px;padding:14px;
    `;
    settingsSection.innerHTML = `
        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px;">ENGINE SETTINGS</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;font-size:11px;">
            ${renderPlayerStateRow('BALL_SPEED', '250000 N/step (×10 vs planned — user request)')}
            ${renderPlayerStateRow('MAX_VELOCITY', '80 m/s top-end')}
            ${renderPlayerStateRow('GRAVITY', '-45 m/s² (PINNED invariant)')}
            ${renderPlayerStateRow('JUMP_FORCE', '28 (PINNED)')}
            ${renderPlayerStateRow('BALL_MASS', '100 kg')}
            ${renderPlayerStateRow('Friction (ball↔ground)', '0.3 (was 1.0)')}
            ${renderPlayerStateRow('Angular damping', '0.18 (was 0.95)')}
            ${renderPlayerStateRow('Linear damping', '0.05 (was 0.15)')}
        </div>
    `;
    wrap.appendChild(settingsSection);

    container.appendChild(wrap);
}

function renderPlayerStateRow(label, value) {
    return `
        <div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:6px 10px;">
            <div style="color:#888;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
            <div style="color:#fff;font-size:12px;font-weight:600;">${value}</div>
        </div>
    `;
}
