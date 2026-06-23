/*
 Builder XP & Level Progression module.
 Exports: initBuilderXP(game), addBuilderXP(game, amount, reason),
          getBuilderXPForLevel(level), getBuilderLevelForXP(xp),
          renderBuilderXPBar(game), showXPNotification(game, amount, reason).

 XP Sources:
   - Part placement: 2 XP per part placed
   - Part variety bonus: +5 XP per unique part category used in a track (capped at 5 categories)
   - Track saved: 10 XP
   - Track shared to community: 25 XP
   - Track test-played: 15 XP
   - Track complexity bonus: +1 XP per 10 parts placed (bonus at milestones)
*/

import { saveGame } from '../persistence.js';

// --- Level Thresholds ---
// XP required to reach each level (cumulative)
const LEVEL_THRESHOLDS = [];
(function buildThresholds() {
    let total = 0;
    for (let lvl = 1; lvl <= 100; lvl++) {
        // Quadratic curve: early levels fast, later levels slower
        // Level 1: 0 XP, Level 2: 20, Level 3: 50, Level 4: 90, ...
        const xpForLevel = Math.floor(15 + lvl * 5 + lvl * lvl * 1.2);
        total += xpForLevel;
        LEVEL_THRESHOLDS.push(total);
    }
})();

/**
 * Get total XP required to reach a given level (1-based).
 * Level 1 requires 0 XP.
 */
export function getBuilderXPForLevel(level) {
    if (level <= 1) return 0;
    const idx = Math.min(level - 2, LEVEL_THRESHOLDS.length - 1);
    return LEVEL_THRESHOLDS[Math.max(0, idx)];
}

/**
 * Get the builder level for a given XP total.
 */
export function getBuilderLevelForXP(xp) {
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (xp < LEVEL_THRESHOLDS[i]) return i + 1;
    }
    return LEVEL_THRESHOLDS.length + 1;
}

/**
 * Initialize builder XP data in saveData if not present.
 */
export function initBuilderXP(game) {
    if (!game.saveData) return;
    if (typeof game.saveData.builderXP !== 'number') game.saveData.builderXP = 0;
    if (typeof game.saveData.builderLevel !== 'number') game.saveData.builderLevel = 1;
    if (typeof game.saveData.totalTracksCreated !== 'number') game.saveData.totalTracksCreated = 0;
    if (typeof game.saveData.totalPartsPlaced !== 'number') game.saveData.totalPartsPlaced = 0;
    if (typeof game.saveData.uniquePartTypesUsed !== 'number') game.saveData.uniquePartTypesUsed = 0;
}

/**
 * Award builder XP. Handles level-up detection and notifications.
 * @param {object} game
 * @param {number} amount - XP to award
 * @param {string} reason - Human-readable reason for the notification
 * @param {object} [options] - Optional: { skipNotify: true } to suppress popup
 */
export function addBuilderXP(game, amount, reason, options = {}) {
    if (!game.saveData || amount <= 0) return;

    const prevLevel = game.saveData.builderLevel || 1;
    game.saveData.builderXP = (game.saveData.builderXP || 0) + amount;
    const newLevel = getBuilderLevelForXP(game.saveData.builderXP);
    game.saveData.builderLevel = newLevel;

    // Level-up notification
    if (newLevel > prevLevel && !options.skipNotify) {
        showLevelUpNotification(game, newLevel);
    }

    // XP gain notification
    if (!options.skipNotify && amount > 0) {
        showXPNotification(game, amount, reason);
    }

    // Throttle persistence — save at most once per second to avoid excessive localStorage writes during rapid placement
    const now = Date.now();
    if (!game._builderXPLastSave || (now - game._builderXPLastSave) > 1000) {
        try { saveGame(game); } catch (e) {}
        game._builderXPLastSave = now;
    }

    // Update builder UI XP bar if visible
    renderBuilderXPBar(game);
}

/**
 * Calculate XP bonus for a set of placed parts (called on share/save/test-play).
 */
export function calculateTrackBonusXP(parts) {
    if (!parts || parts.length === 0) return { total: 0, breakdown: [] };

    const breakdown = [];
    let total = 0;

    // Complexity bonus: +1 XP per 10 parts
    const complexityBonus = Math.floor(parts.length / 10);
    if (complexityBonus > 0) {
        breakdown.push({ label: `Complexity (${parts.length} parts)`, xp: complexityBonus });
        total += complexityBonus;
    }

    // Variety bonus: count unique categories
    const categoriesUsed = new Set();
    for (const p of parts) {
        if (p._category) {
            categoriesUsed.add(p._category);
        }
    }
    const varietyBonus = Math.min(5, categoriesUsed.size) * 5; // max 25 XP
    if (varietyBonus > 0) {
        breakdown.push({ label: `Variety (${categoriesUsed.size} types)`, xp: varietyBonus });
        total += varietyBonus;
    }

    return { total, breakdown };
}

/**
 * Get a rank title for a builder level.
 */
export function getBuilderTitle(level) {
    if (level >= 50) return '🏗️ Master Builder';
    if (level >= 40) return '🏗️ Architect';
    if (level >= 30) return '🏗️ Designer';
    if (level >= 20) return '🔨 Craftsman';
    if (level >= 15) return '🔨 Artisan';
    if (level >= 10) return '🧱 Mason';
    if (level >= 7)  return '🧱 Apprentice';
    if (level >= 4)  return '🪵 Beginner';
    return '🪵 Novice';
}

/**
 * Render the XP bar into the builder header (if the builder UI is active).
 */
export function renderBuilderXPBar(game) {
    const el = document.getElementById('builder-xp-bar');
    if (!el || !game.saveData) return;

    const xp = game.saveData.builderXP || 0;
    const level = game.saveData.builderLevel || 1;
    const title = getBuilderTitle(level);

    // XP progress within current level
    const xpForCurrentLevel = getBuilderXPForLevel(level);
    const xpForNextLevel = getBuilderXPForLevel(level + 1);
    const xpInLevel = xp - xpForCurrentLevel;
    const xpNeeded = xpForNextLevel - xpForCurrentLevel;
    const pct = xpNeeded > 0 ? Math.min(100, Math.floor((xpInLevel / xpNeeded) * 100)) : 100;

    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;width:100%;">
            <span style="color:#ffcc00;font-weight:700;font-size:12px;white-space:nowrap;font-family:'5x5dots',monospace;">Lv${level}</span>
            <div style="flex:1;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#ffcc00,#ff8800);border-radius:4px;transition:width 0.4s ease;"></div>
            </div>
            <span style="color:#888;font-size:9px;white-space:nowrap;font-family:'Segoe UI',sans-serif;">${xpInLevel}/${xpNeeded}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-top:2px;">
            <span style="color:#aaa;font-size:9px;font-family:'Segoe UI',sans-serif;">${title}</span>
            <span style="color:#666;font-size:9px;font-family:'Segoe UI',sans-serif;">${xp} XP</span>
        </div>
    `;
}

/**
 * Show a floating XP notification popup.
 */
function showXPNotification(game, amount, reason) {
    try {
        const el = document.createElement('div');
        el.className = 'builder-xp-notif';
        el.innerHTML = `<span style="color:#ffcc00;font-weight:700;">+${amount} XP</span> <span style="color:#aaa;font-size:10px;">${reason || ''}</span>`;
        el.style.cssText = `
            position:fixed;top:${60 + Math.random() * 20}px;right:${20 + Math.random() * 40}px;z-index:16000;
            padding:6px 14px;font-size:12px;font-family:'Segoe UI',sans-serif;
            background:rgba(20,20,35,0.92);border:1px solid rgba(255,204,0,0.3);border-radius:8px;
            color:#fff;pointer-events:none;opacity:1;transition:opacity 0.5s ease,transform 0.5s ease;
            box-shadow:0 2px 12px rgba(0,0,0,0.5);display:flex;align-items:center;gap:6px;
        `;
        document.body.appendChild(el);
        // Animate out
        requestAnimationFrame(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-20px)';
        });
        setTimeout(() => { if (el.parentNode) el.remove(); }, 1200);
    } catch (e) {}
}

/**
 * Show a level-up notification (larger, more prominent).
 */
function showLevelUpNotification(game, newLevel) {
    try {
        const title = getBuilderTitle(newLevel);
        const el = document.createElement('div');
        el.className = 'builder-levelup-notif';
        el.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:24px;margin-bottom:4px;">🎉</div>
                <div style="font-size:14px;font-weight:700;color:#ffcc00;font-family:'5x5dots',monospace;">LEVEL ${newLevel}!</div>
                <div style="font-size:11px;color:#ddd;margin-top:2px;">${title}</div>
            </div>
        `;
        el.style.cssText = `
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:17000;
            padding:20px 32px;font-size:14px;font-family:'Segoe UI',sans-serif;
            background:linear-gradient(145deg,rgba(25,20,40,0.97),rgba(20,15,30,0.97));
            border:2px solid rgba(255,204,0,0.5);border-radius:16px;
            color:#fff;pointer-events:none;opacity:1;
            transition:opacity 0.8s ease 1.5s,transform 0.8s ease 1.5s;
            box-shadow:0 4px 32px rgba(255,200,0,0.2),0 0 60px rgba(255,200,0,0.1);
        `;
        document.body.appendChild(el);
        requestAnimationFrame(() => {
            el.style.opacity = '0';
            el.style.transform = 'translate(-50%,-60%)';
        });
        setTimeout(() => { if (el.parentNode) el.remove(); }, 3000);
    } catch (e) {}
}
