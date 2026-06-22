/*
  New wired Ball Index UI module.
  Exports renderBallIndexUI(containerId, game, room) which renders the full index using game.ballConfigs,
  merges best-effort remote ball_stats when available via the passed `room`, and wires equip/buy/level actions back to the Game instance.
*/
export function renderBallIndexUI(containerId, game, room) {
    try {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        // Helper: sanitize a remote ball_stats record to expected shape with caps
        function sanitizeStatRecord(r) {
            const safe = {};
            try {
                const nameRaw = (r && (r.ball_key || r.ballKey || r.name)) || '';
                safe.key = String(nameRaw).toString().trim().toLowerCase().slice(0, 64);

                safe.played = Number.isFinite(Number(r.played)) ? Math.max(0, Math.min(1e7, Math.floor(Number(r.played)))) : 0;
                safe.wins = Number.isFinite(Number(r.wins)) ? Math.max(0, Math.min(1e7, Math.floor(Number(r.wins)))) : 0;

                safe.avgTime = Number.isFinite(Number(r.avg_time)) ? Math.max(0, Math.min(1e5, Number(r.avg_time))) : null;
                safe.bestTime = Number.isFinite(Number(r.best_time)) ? Math.max(0, Math.min(1e5, Number(r.best_time))) : null;
            } catch (e) {
                return null;
            }
            return safe;
        }

        // Fetch remote stats best-effort (but cap list length to avoid huge arrays)
        let remoteStats = [];
        try {
            const fetched = (game._remoteBallStats && Array.isArray(game._remoteBallStats)) ? game._remoteBallStats.slice() : [];
            if ((!fetched || fetched.length === 0) && room && room.collection) {
                const maybe = room.collection('ball_stats').getList() || [];
                if (Array.isArray(maybe)) fetched.push(...maybe);
            }
            const cap = 500;
            remoteStats = Array.isArray(fetched) ? fetched.slice(0, cap) : [];
        } catch (e) {
            remoteStats = [];
        }

        // Build stats map keyed by ball_key or name (sanitizing each record)
        const statsMap = {};
        for (let i = 0; i < remoteStats.length; i++) {
            try {
                const r = remoteStats[i];
                const s = sanitizeStatRecord(r);
                if (!s || !s.key) continue;
                const existing = statsMap[s.key] || { played: 0, wins: 0, avgTimeSum: 0, avgCount: 0, bestTime: null };
                existing.played = Math.min(1e9, existing.played + s.played);
                existing.wins = Math.min(1e9, existing.wins + s.wins);
                if (s.avgTime !== null) { existing.avgTimeSum = (existing.avgTimeSum || 0) + s.avgTime; existing.avgCount = (existing.avgCount || 0) + 1; }
                if (s.bestTime !== null) existing.bestTime = existing.bestTime === null ? s.bestTime : Math.min(existing.bestTime, s.bestTime);
                statsMap[s.key] = existing;
            } catch (e) {
                // ignore malformed entries
            }
        }

        // Use the same visual structure and classes as Skins panel for consistency.
        // Header
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '8px';
        header.innerHTML = `<div style="font-weight:700; color:#ffdd66;">Ball Index</div><div style="font-size:12px;color:#ddd;">Total: ${Object.keys(game.ballConfigs).length}</div>`;
        container.appendChild(header);

        // Grid using existing .grid styling expectations (two-column on modal)
        const grid = document.createElement('div');
        grid.className = 'grid';
        grid.style.marginTop = '6px';
        container.appendChild(grid);

        // Render balls sorted by descending price so the Ball Index highlights premium skins first
        const keys = Object.keys(game.ballConfigs).sort((a, b) => {
            const pa = Number(game.ballConfigs[a] && game.ballConfigs[a].price ? game.ballConfigs[a].price : 0);
            const pb = Number(game.ballConfigs[b] && game.ballConfigs[b].price ? game.ballConfigs[b].price : 0);
            return pb - pa;
        });
        keys.forEach(key => {
            try {
                const conf = game.ballConfigs[key];
                const isUnlocked = Array.isArray(game.saveData.unlockedBalls) && game.saveData.unlockedBalls.includes(key);
                const isSelected = game.saveData.selectedBall === key;
                const level = (game.saveData.skinLevels && game.saveData.skinLevels[key]) ? Math.max(1, Math.min(5, game.saveData.skinLevels[key])) : 1;
                const statKey = (key || '').toString().toLowerCase();
                const stats = statsMap[statKey] || null;

                const card = document.createElement('div');
                card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;

                let previewStyle = '';
                if (conf && conf.tex) previewStyle = `background-image: url(${conf.tex});`;
                else previewStyle = `background-color: #666;`;

                // compute ability stats for display
                let abilityStatsHtml = '';
                try {
                    const abil = (conf && conf.ability) ? conf.ability : null;
                    if (abil) {
                        const base = Number.isFinite(Number(abil.base)) ? Number(abil.base) : 1.0;
                        const per = Number.isFinite(Number(abil.perLevel)) ? Number(abil.perLevel) : 0.0;
                        const eff = base + per * Math.max(0, (level - 1));
                        abilityStatsHtml = `
                            <div style="margin-top:6px; text-align:center;">
                                <div style="font-size:12px; color:#ffd76b; font-weight:700;">Ability: ${abil.key.toUpperCase()}</div>
                                <div style="font-size:12px; color:#e0f7ff; margin-top:4px;">Level: ${level} • Effect: x${eff.toFixed(2)}</div>
                                <div style="font-size:11px; color:#cfefff; margin-top:4px;">(Base ${base.toFixed(2)} + ${per.toFixed(2)} per level)</div>
                            </div>
                        `;
                    } else {
                        abilityStatsHtml = `<div style="margin-top:6px; text-align:center; color:#cfefff; font-size:12px;">No ability</div>`;
                    }
                } catch (e) {
                    abilityStatsHtml = `<div style="margin-top:6px; text-align:center; color:#cfefff; font-size:12px;">Stats unavailable</div>`;
                }

                card.innerHTML = `
                    <div class="item-card-inner">
                        <div class="item-card-front">
                            <div class="item-preview ball-preview" style="${previewStyle}"></div>
                            <div style="font-size: 14px; margin-top: 6px; font-weight:700;">${conf && conf.name ? conf.name : key}</div>
                            <div style="font-size:12px; color:#aaf; margin-bottom:6px;">${conf && conf.ability && conf.ability.key ? conf.ability.key.toUpperCase() + ' L' + level : ''}</div>
                            <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : (Number(conf && conf.price ? conf.price : 0) + ' 🪙')}</div>
                            <div style="display:flex; gap:6px; margin-top:8px; width:100%; justify-content:center;">
                                ${isUnlocked ? `<button class="menu-btn" data-action="equip" data-key="${key}" style="pointer-events:auto;" aria-label="${isSelected ? 'Equipped' : 'Equip'} ${conf && conf.name ? conf.name : key}">${isSelected ? 'EQUIPPED' : 'EQUIP'}</button>` : `<button class="menu-btn" data-action="buy" data-key="${key}" style="pointer-events:auto;" aria-label="Buy ${conf && conf.name ? conf.name : key} for ${Number(conf && conf.price ? conf.price : 0)} coins">BUY ${Number(conf && conf.price ? conf.price : 0)} 🪙</button>`}
                                <button class="menu-btn" data-action="level" data-key="${key}" style="pointer-events:auto;" aria-label="Level up ${conf && conf.name ? conf.name : key}">Level ${level}</button>
                            </div>
                        </div>
                        <div class="item-card-back">
                            <div style="font-weight:700; margin-bottom:6px;">${conf && conf.name ? conf.name : key}</div>
                            <div style="font-size:12px; color:#cfefff; margin-bottom:6px; text-align:center;">${conf && conf.description ? conf.description : ''}</div>
                            <div style="display:flex; gap:8px; width:100%; justify-content:center; align-items:center; margin-bottom:6px;">
                                <div style="font-size:12px;">Level: ${level}</div>
                                <div style="font-size:12px;">Price: ${Number(conf && conf.price ? conf.price : 0)} 🪙</div>
                            </div>
                            ${abilityStatsHtml}
                            <div style="font-size:12px; color:#e0f7ff; margin-top:8px;">${stats ? `Played: ${stats.played} • Wins: ${stats.wins}` : 'No stats available'}</div>
                        </div>
                    </div>
                `;

                grid.appendChild(card);

                // wire up buttons safely
                const buyBtn = card.querySelector('button[data-action="buy"]');
                const equipBtn = card.querySelector('button[data-action="equip"]');
                const lvlBtn = card.querySelector('button[data-action="level"]');

                if (buyBtn) buyBtn.addEventListener('click', (e) => { e.stopPropagation(); game.handlePurchase('ball', key, Number(conf && conf.price ? conf.price : 0)); });
                if (equipBtn) equipBtn.addEventListener('click', (e) => { e.stopPropagation(); game.handlePurchase('ball', key, 0); });
                if (lvlBtn) lvlBtn.addEventListener('click', (e) => { e.stopPropagation(); const levelUpCost = Math.floor((conf && conf.price ? conf.price : 50) * (1 + (level * 0.6))); game.levelUpSkin(key, levelUpCost); });

            } catch (err) {
                console.warn('ball_index_ui render failed for', key, err);
            }
        });

        // Footer
        const footer = document.createElement('div');
        footer.style.marginTop = '8px';
        footer.style.fontSize = '12px';
        footer.style.color = '#ccc';
        footer.innerText = 'Data merges local configuration with best-effort remote stats when available (remote data sanitized).';
        container.appendChild(footer);
    } catch (e) {
        console.warn('renderBallIndexUI failed', e);
    }
}