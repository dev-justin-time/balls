/*
 UI module.
 Exports: setupUI(game, room), renderGrids(game), renderBallIndex(game, room),
 getLeaderboard(game, room), saveLeaderboard(game, entries), addLeaderboardEntry(game, entry),
 renderLeaderboard(game, room), handlePurchase(game, type, key, price),
 levelUpSkin(game, key, cost), applySkinAbilities(game, key),
 updateWalletUI(game), checkGameState(game, dt), gameOver(game, win),
 showTimeBonus(game, bonus), reset(game).

 Handles: all DOM UI (modals, menus, help, skins, skies, powerups, leaderboard),
 remote subscriptions (leaderboard, player_clones, ball_stats),
 game state checking (coin collection, glass breaking, checkpoint/respawn, win/fall),
 wallet, purchase, equip, skin leveling.
*/
import { renderBallIndexUI } from './ball_index_ui.js';
import { saveGame } from './persistence.js';
import { playSound } from './audio.js';
import { applySkyConfig, getBallMaterial } from './engine/scene.js';
import { createLevel } from './levelgen.js';

export function setupUI(game, room) {
    // --- Top menu gear button ---
    const gearBtn = document.getElementById('gear-btn');
    const topMenu = document.getElementById('top-menu');
    if (gearBtn && topMenu) {
        gearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            topMenu.classList.toggle('visible');
        });
    }

    // --- Help button ---
    const helpBtn = document.getElementById('help-btn');
    const overlay = document.getElementById('overlay');
    if (helpBtn && overlay) {
        helpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            overlay.style.display = 'flex';
            overlay.innerHTML = `
                <div class="modal" style="max-width:400px;padding:20px;background:linear-gradient(145deg,#1a1a2e,#16213e);border-radius:16px;color:#fff;text-align:center;">
                    <h2>How to Play</h2>
                    <p style="font-size:13px;line-height:1.6;margin:10px 0;">
                        <b>Desktop:</b> WASD / Arrows to steer · Space to jump · Drag mouse to look around<br/>
                        <b>Mobile:</b> On-screen joystick to move · Jump button to hop<br/>
                        <b>Goal:</b> Roll to the green finish line! Collect coins and avoid hazards.<br/>
                        <b>Shop:</b> Buy new ball skins, skies, and powerups with coins!
                    </p>
                    <button class="menu-btn" id="overlay-close-btn" style="margin-top:12px;">OK</button>
                </div>`;
            const closeBtn = document.getElementById('overlay-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    overlay.style.display = 'none';
                    overlay.innerHTML = '';
                });
            }
        });
    }

    // --- Skins button / grid ---
    const shopBtn = document.getElementById('shop-btn');
    if (shopBtn && overlay) {
        shopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderGrids(game);
            overlay.style.display = 'flex';
        });
    }

    // Close overlay on background click
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.style.display = 'none';
                overlay.innerHTML = '';
            }
        });
    }

    // --- Leaderboard button ---
    const lbBtn = document.getElementById('leaderboard-btn');
    if (lbBtn && overlay) {
        lbBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderLeaderboard(game, room);
            overlay.style.display = 'flex';
        });
    }

    // --- Settings button ---
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn && overlay) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            overlay.style.display = 'flex';
            overlay.innerHTML = `
                <div class="modal" style="max-width:360px;padding:20px;background:linear-gradient(145deg,#1a1a2e,#16213e);border-radius:16px;color:#fff;text-align:center;">
                    <h2>Settings</h2>
                    <div style="margin:12px 0;text-align:left;font-size:13px;">
                        <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            Joystick Deadzone
                            <input type="range" id="joystick-deadzone" min="0" max="30" value="${Math.round((game.joystickDeadzone || 0.10) * 100)}" style="width:140px;">
                            <span id="dz-val">${Math.round((game.joystickDeadzone || 0.10) * 100)}%</span>
                        </label>
                        <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            Joystick Power
                            <input type="range" id="joystick-power" min="50" max="200" value="${Math.round((game.joystickPower || 1.0) * 100)}" style="width:140px;">
                            <span id="jp-val">${Math.round((game.joystickPower || 1.0) * 100)}%</span>
                        </label>
                    </div>
                    <button class="menu-btn" id="settings-close-btn">Close</button>
                </div>`;

            const dzSlider = document.getElementById('joystick-deadzone');
            const jpSlider = document.getElementById('joystick-power');
            const dzVal = document.getElementById('dz-val');
            const jpVal = document.getElementById('jp-val');
            if (dzSlider) dzSlider.addEventListener('input', () => {
                game.joystickDeadzone = parseInt(dzSlider.value) / 100;
                dzVal.innerText = `${Math.round(game.joystickDeadzone * 100)}%`;
            });
            if (jpSlider) jpSlider.addEventListener('input', () => {
                game.joystickPower = parseInt(jpSlider.value) / 100;
                jpVal.innerText = `${Math.round(game.joystickPower * 100)}%`;
            });
            const closeBtn = document.getElementById('settings-close-btn');
            if (closeBtn) closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; overlay.innerHTML = ''; });
        });
    }

    // --- Remote subscriptions (best-effort) ---
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            room.collection('leaderboard').subscribe((list) => {
                try {
                    const parsed = Array.isArray(list) ? list : [];
                    game._remoteLeaderboard = parsed;
                } catch (e) {}
            });
        } catch (e) {}

        try {
            room.collection('player_clones').subscribe((list) => {
                try {
                    const parsed = Array.isArray(list) ? list : [];
                    game._remotePlayerClones = parsed;
                } catch (e) {}
            });
        } catch (e) {}

        try {
            room.collection('ball_stats').subscribe((list) => {
                try {
                    const parsed = Array.isArray(list) ? list : [];
                    game._remoteBallStats = parsed;
                } catch (e) {}
            });
        } catch (e) {}
    }
}

export function updateWalletUI(game) {
    try {
        const el = document.getElementById('coin-count');
        if (el) el.innerText = `${game.saveData.totalCoins} 🪙`;
    } catch (e) {}
}

// --- Game State ---
export function checkGameState(game, dt) {
    try {
        // Coin collection
        const coinMult = game._abilityCoins || 1.0;
        for (let i = game.coins.length - 1; i >= 0; i--) {
            const coin = game.coins[i];
            if (!coin || coin.userData.collected) continue;
            const dist = game.ballMesh.position.distanceTo(coin.position);
            if (dist < 1.2) {
                const value = Math.round((coin.userData.value || 2) * coinMult);
                game.score += value;
                game.saveData.totalCoins += value;
                coin.userData.collected = true;
                game.scene.remove(coin);
                game.coins.splice(i, 1);
                updateWalletUI(game);
            }
        }

        // Glass platform breaking
        if (game.glassPlatforms) {
            for (const gp of game.glassPlatforms) {
                if (gp.broken) continue;
                const bx = game.ballBody.position.x;
                const bz = game.ballBody.position.z;
                const by = game.ballBody.position.y;
                if (Math.abs(bx - gp.x) < (gp.width / 2 + 0.5) &&
                    Math.abs(bz - gp.z) < (gp.length / 2 + 0.5) &&
                    by < gp.y + 1.2) {
                    gp.broken = true;
                    gp.breakTimer = 0.6;
                    if (gp.body) game.world.removeBody(gp.body);
                    if (gp.mesh) {
                        gp.mesh.material = gp.mesh.material.clone();
                        gp.mesh.material.transparent = true;
                    }
                }
            }
            // Fade out broken glass
            for (let i = game.glassPlatforms.length - 1; i >= 0; i--) {
                const gp = game.glassPlatforms[i];
                if (gp.broken && gp.breakTimer > 0) {
                    gp.breakTimer -= dt;
                    if (gp.mesh && gp.mesh.material) gp.mesh.material.opacity = gp.breakTimer / 0.6;
                    if (gp.breakTimer <= 0) {
                        if (gp.mesh) game.scene.remove(gp.mesh);
                        game.glassPlatforms.splice(i, 1);
                    }
                }
            }
        }

        // Checkpoint respawn
        const ballY = game.ballBody.position.y;
        if (ballY < -15) {
            game.ballBody.position.copy(game.lastCheckpointPos);
            game.ballBody.velocity.set(0, 0, 0);
            game.ballBody.angularVelocity.set(0, 0, 0);
        }

        // Checkpoint progress
        for (const cp of game.checkpoints) {
            const bx = game.ballBody.position.x;
            const bz = game.ballBody.position.z;
            if (Math.abs(bx - cp.x) < (cp.width / 2 + 1) && Math.abs(bz - cp.z) < 3) {
                game.lastCheckpointPos.set(cp.x, cp.y + 1, cp.z);
            }
        }

        // Distance tracking
        game._distanceTraveled = game._distanceTraveled || 0;
        const prog = Math.abs(game.ballBody.position.z) / Math.max(1, game.levelLength);
        document.getElementById('level-progress') && (document.getElementById('level-progress').style.width = `${Math.min(100, prog * 100)}%`);

        // Win condition
        if (!game.isGameOver && game.finishZ !== undefined) {
            const fz = game.finishZ;
            const fx = game.finishX || 0;
            const bx = game.ballBody.position.x;
            const bz = game.ballBody.position.z;
            if (Math.abs(bx - fx) < 6 && Math.abs(bz - fz) < 8) {
                gameOver(game, true);
            }
        }
    } catch (e) {
        console.warn('checkGameState error', e);
    }
}

export function gameOver(game, win) {
    game.isGameOver = true;
    game.isWin = win;
    const overlay = document.getElementById('overlay');
    if (!overlay) return;

    if (win) {
        game.currentLevel++;
        const timeTaken = game.startTime ? ((Date.now() - game.startTime) / 1000) : 0;
        const bonus = Math.max(0, Math.floor(100 - timeTaken * 2));
        game.saveData.totalCoins += bonus;
        showTimeBonus(game, bonus);
        updateWalletUI(game);

        // Leaderboard submission
        addLeaderboardEntry(game, {
            level: game.currentLevel - 1,
            time: timeTaken.toFixed(1),
            coins: game.saveData.totalCoins,
            ball: game.saveData.selectedBall || 'rainbow',
            score: game.score
        });

        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div class="modal" style="max-width:360px;padding:20px;background:linear-gradient(145deg,#1a2a1e,#162b13);border-radius:16px;color:#fff;text-align:center;">
                <h2>🏆 Level Complete!</h2>
                <p style="font-size:14px;margin:8px 0;">Level ${game.currentLevel - 1} cleared in ${timeTaken.toFixed(1)}s</p>
                <p style="font-size:14px;">Time Bonus: +${bonus} 🪙</p>
                <button class="menu-btn" id="next-level-btn" style="margin-top:12px;">Next Level →</button>
            </div>`;
        const nextBtn = document.getElementById('next-level-btn');
        if (nextBtn) nextBtn.addEventListener('click', () => {
            overlay.style.display = 'none';
            overlay.innerHTML = '';
            reset(game);
        });
    } else {
        // Fall/death — just show retry
        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div class="modal" style="max-width:360px;padding:20px;background:linear-gradient(145deg,#2e1a1a,#3e1621);border-radius:16px;color:#fff;text-align:center;">
                <h2>💀 You Fell!</h2>
                <p style="font-size:14px;margin:8px 0;">Try again!</p>
                <button class="menu-btn" id="retry-btn" style="margin-top:12px;">Retry</button>
            </div>`;
        const retryBtn = document.getElementById('retry-btn');
        if (retryBtn) retryBtn.addEventListener('click', () => {
            overlay.style.display = 'none';
            overlay.innerHTML = '';
            game.ballBody.position.copy(game.lastCheckpointPos);
            game.ballBody.velocity.set(0, 0, 0);
            game.isGameOver = false;
        });
    }
}

export function showTimeBonus(game, bonus) {
    try {
        const el = document.createElement('div');
        el.innerText = `+${bonus} 🪙 TIME BONUS`;
        el.style.position = 'fixed';
        el.style.top = '30%';
        el.style.left = '50%';
        el.style.transform = 'translate(-50%,0)';
        el.style.fontSize = '28px';
        el.style.fontWeight = 'bold';
        el.style.color = '#ffdd00';
        el.style.textShadow = '0 0 20px rgba(255,200,0,0.8)';
        el.style.zIndex = '99999';
        el.style.pointerEvents = 'none';
        el.style.animation = 'none';
        document.body.appendChild(el);
        // Simple fly-up animation
        let y = 30;
        const animate = () => {
            y -= 0.8;
            el.style.top = y + '%';
            el.style.opacity = Math.max(0, y / 30);
            if (y > -5) requestAnimationFrame(animate);
            else el.remove();
        };
        requestAnimationFrame(animate);
    } catch (e) {}
}

export function reset(game) {
    game.isGameOver = false;
    game.isWin = false;
    game.score = 0;
    game.ballBody.position.set(0, 2, 0);
    game.ballBody.velocity.set(0, 0, 0);
    game.ballBody.angularVelocity.set(0, 0, 0);
    game.lastCheckpointPos.set(0, 5, 0);
    createLevel(game);
    updateWalletUI(game);
}

// --- Grids ---

export function renderGrids(game) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;

    overlay.innerHTML = `
        <div class="modal" style="max-width:600px;max-height:85vh;overflow-y:auto;padding:20px;background:linear-gradient(145deg,#1a1a2e,#16213e);border-radius:16px;color:#fff;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h2 style="margin:0;">Shop</h2>
                <span style="font-size:14px;">🪙 ${game.saveData.totalCoins}</span>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
                <button class="menu-btn tab-btn active" data-tab="skins">Skins</button>
                <button class="menu-btn tab-btn" data-tab="skies">Skies</button>
                <button class="menu-btn tab-btn" data-tab="powerups">Powerups</button>
                <button class="menu-btn" id="shop-close-btn" style="margin-left:auto;">✕</button>
            </div>
            <div id="skins-grid" class="tab-content"></div>
            <div id="skies-grid" class="tab-content" style="display:none;"></div>
            <div id="powerups-grid" class="tab-content" style="display:none;"></div>
        </div>`;

    const closeBtn = document.getElementById('shop-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; overlay.innerHTML = ''; });

    // Tab switching
    overlay.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            overlay.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.getElementById('skins-grid').style.display = tab === 'skins' ? '' : 'none';
            document.getElementById('skies-grid').style.display = tab === 'skies' ? '' : 'none';
            document.getElementById('powerups-grid').style.display = tab === 'powerups' ? '' : 'none';
        });
    });

    renderSkinsGrid(game);
    renderSkiesGrid(game);
    renderPowerupsGrid(game);
}

function renderSkinsGrid(game) {
    const container = document.getElementById('skins-grid');
    if (!container) return;
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'grid';
    container.appendChild(grid);

    const keys = Object.keys(game.ballConfigs).sort((a, b) => {
        const pa = Number(game.ballConfigs[a] && game.ballConfigs[a].price ? game.ballConfigs[a].price : 0);
        const pb = Number(game.ballConfigs[b] && game.ballConfigs[b].price ? game.ballConfigs[b].price : 0);
        return pb - pa;
    });

    keys.forEach(key => {
        const conf = game.ballConfigs[key];
        const isUnlocked = Array.isArray(game.saveData.unlockedBalls) && game.saveData.unlockedBalls.includes(key);
        const isSelected = game.saveData.selectedBall === key;
        const level = (game.saveData.skinLevels && game.saveData.skinLevels[key]) ? Math.max(1, Math.min(5, game.saveData.skinLevels[key])) : 1;

        const card = document.createElement('div');
        card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
        let previewStyle = conf && conf.tex ? `background-image: url(${conf.tex});` : 'background-color: #666;';
        const price = Number(conf && conf.price ? conf.price : 0);

        card.innerHTML = `
            <div class="item-card-inner">
                <div class="item-card-front">
                    <div class="item-preview ball-preview" style="${previewStyle}"></div>
                    <div style="font-size:14px;margin-top:6px;font-weight:700;">${conf && conf.name ? conf.name : key}</div>
                    <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : (price + ' 🪙')}</div>
                    <div style="display:flex;gap:4px;margin-top:8px;">
                        ${isUnlocked ? `<button class="menu-btn equip-btn" data-key="${key}">${isSelected ? 'EQUIPPED' : 'EQUIP'}</button>` : `<button class="menu-btn buy-btn" data-key="${key}">BUY ${price}</button>`}
                        <button class="menu-btn level-btn" data-key="${key}">Lv${level}</button>
                    </div>
                </div>
            </div>`;
        grid.appendChild(card);

        const buyBtn = card.querySelector('.buy-btn');
        const equipBtn = card.querySelector('.equip-btn');
        const lvlBtn = card.querySelector('.level-btn');
        if (buyBtn) buyBtn.addEventListener('click', (e) => { e.stopPropagation(); handlePurchase(game, 'ball', key, price); renderGrids(game); });
        if (equipBtn) equipBtn.addEventListener('click', (e) => { e.stopPropagation(); handlePurchase(game, 'ball', key, 0); renderGrids(game); });
        if (lvlBtn) lvlBtn.addEventListener('click', (e) => { e.stopPropagation(); const cost = Math.floor(price * (1 + (level * 0.6))); levelUpSkin(game, key, cost); renderGrids(game); });
    });
}

function renderSkiesGrid(game) {
    const container = document.getElementById('skies-grid');
    if (!container) return;
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'grid';
    container.appendChild(grid);

    Object.keys(game.skyConfigs).forEach(key => {
        const conf = game.skyConfigs[key];
        const isUnlocked = Array.isArray(game.saveData.unlockedSkies) && game.saveData.unlockedSkies.includes(key);
        const isSelected = game.saveData.selectedSky === key;
        const price = Number(conf && conf.price ? conf.price : 0);

        const card = document.createElement('div');
        card.className = `item-card ${isSelected ? 'selected' : ''}`;
        card.style.background = `#${conf.color.toString(16).padStart(6, '0')}`;
        card.innerHTML = `
            <div style="padding:12px;text-align:center;">
                <div style="font-weight:700;">${conf.name}</div>
                <div style="font-size:12px;margin:6px 0;">${isUnlocked ? (isSelected ? 'SELECTED' : 'OWNED') : (price + ' 🪙')}</div>
                <button class="menu-btn sky-btn" data-key="${key}">${isUnlocked ? (isSelected ? 'SELECTED' : 'SELECT') : ('BUY ' + price)}</button>
            </div>`;
        grid.appendChild(card);

        const btn = card.querySelector('.sky-btn');
        if (btn) btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handlePurchase(game, 'sky', key, price);
            renderGrids(game);
        });
    });
}

function renderPowerupsGrid(game) {
    const container = document.getElementById('powerups-grid');
    if (!container) return;
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'grid';
    container.appendChild(grid);

    Object.keys(game.powerupConfigs).forEach(key => {
        const conf = game.powerupConfigs[key];
        const owned = game.saveData.powerups && game.saveData.powerups[key];
        const level = owned && owned.level ? owned.level : 1;
        const equipped = owned && owned.equipped;
        const price = Number(conf && conf.price ? conf.price : 0);

        const card = document.createElement('div');
        card.className = `item-card ${equipped ? 'selected' : ''}`;
        card.innerHTML = `
            <div style="padding:12px;text-align:center;">
                <div style="font-weight:700;">${conf.name}</div>
                <div style="font-size:11px;color:#aaa;margin:4px 0;">${conf.description || ''}</div>
                <div style="font-size:12px;">Rarity: ${conf.rarity} · Level: ${level}/${conf.maxLevel}</div>
                <div style="display:flex;gap:4px;margin-top:8px;justify-content:center;">
                    <button class="menu-btn pu-buy-btn" data-key="${key}">${owned ? 'UPGRADE ' + Math.floor(price * level) : 'BUY ' + price}</button>
                    ${owned ? `<button class="menu-btn pu-toggle-btn" data-key="${key}">${equipped ? 'ON' : 'OFF'}</button>` : ''}
                </div>
            </div>`;
        grid.appendChild(card);

        const buyBtn = card.querySelector('.pu-buy-btn');
        if (buyBtn) buyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cost = owned ? Math.floor(price * level) : price;
            if (game.saveData.totalCoins >= cost) {
                game.saveData.totalCoins -= cost;
                game.saveData.powerups = game.saveData.powerups || {};
                game.saveData.powerups[key] = { level: Math.min(conf.maxLevel, level + 1), owned: true, equipped: (game.saveData.powerups[key] && game.saveData.powerups[key].equipped) || false };
                saveGame(game);
                updateWalletUI(game);
            }
            renderGrids(game);
        });
        const toggleBtn = card.querySelector('.pu-toggle-btn');
        if (toggleBtn) toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (game.saveData.powerups && game.saveData.powerups[key]) {
                game.saveData.powerups[key].equipped = !game.saveData.powerups[key].equipped;
                saveGame(game);
            }
            renderGrids(game);
        });
    });
}

export function renderBallIndex(game, room) {
    const container = document.getElementById('ball-index-container');
    if (container) renderBallIndexUI(container.id || 'ball-index-container', game, room);
}

// --- Leaderboard ---

export function getLeaderboard(game, room) {
    let entries = [];
    try {
        const raw = localStorage.getItem('goingBalls_leaderboard');
        entries = raw ? JSON.parse(raw) : [];
    } catch (e) { entries = []; }

    // Merge remote
    if (room && room.isReady && game._remoteLeaderboard && Array.isArray(game._remoteLeaderboard)) {
        const dedup = {};
        entries.forEach(e => { dedup[e.id || e.time + '_' + e.level] = e; });
        game._remoteLeaderboard.forEach(e => { dedup[e.id || e.time + '_' + e.level] = e; });
        entries = Object.values(dedup);
    }

    return entries.sort((a, b) => (b.level || 0) - (a.level || 0) || parseFloat(a.time || 99) - parseFloat(b.time || 99)).slice(0, 50);
}

export function saveLeaderboard(game, entries) {
    localStorage.setItem('goingBalls_leaderboard', JSON.stringify(entries.slice(0, 50)));
    // Mirror to remote
    if (window.__goingBallsRoomReady && window.__goingBallsRoomReady()) {
        try {
            const coll = room.collection('leaderboard');
            entries.slice(0, 5).forEach(async (e) => {
                try { await coll.create(e); } catch (err) {}
            });
        } catch (err) {}
    }
}

export function addLeaderboardEntry(game, entry) {
    entry.id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    entry.date = new Date().toISOString();
    const entries = getLeaderboard(game, window._room);
    entries.push(entry);
    saveLeaderboard(game, entries);
}

export function renderLeaderboard(game, room) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    const entries = getLeaderboard(game, room);

    let rowsHtml = '';
    entries.slice(0, 10).forEach((e, i) => {
        rowsHtml += `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-size:13px;">
                <span>#${i + 1} ${e.ball || '?'}</span>
                <span>Lv${e.level || 0}</span>
                <span>${e.time || '--'}s</span>
                <span>${e.coins || 0} 🪙</span>
            </div>`;
    });

    overlay.innerHTML = `
        <div class="modal" style="max-width:420px;max-height:80vh;overflow-y:auto;padding:20px;background:linear-gradient(145deg,#1a1a2e,#16213e);border-radius:16px;color:#fff;">
            <h2 style="text-align:center;">Leaderboard</h2>
            <div style="margin:12px 0;">${rowsHtml || '<p style="text-align:center;color:#aaa;">No entries yet!</p>'}</div>
            <button class="menu-btn" id="lb-close-btn" style="display:block;margin:12px auto 0;">Close</button>
        </div>`;
    const closeBtn = document.getElementById('lb-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; overlay.innerHTML = ''; });
}

// --- Purchase & Equip ---

export function handlePurchase(game, type, key, price) {
    if (type === 'ball') {
        if (game.saveData.unlockedBalls.includes(key)) {
            // Equip
            game.saveData.selectedBall = key;
            game.ballMesh.material = getBallMaterial(game);
            applySkinAbilities(game, key);
            saveGame(game);
            updateWalletUI(game);
        } else if (game.saveData.totalCoins >= price) {
            game.saveData.totalCoins -= price;
            game.saveData.unlockedBalls.push(key);
            game.saveData.selectedBall = key;
            game.saveData.skinLevels = game.saveData.skinLevels || {};
            game.saveData.skinLevels[key] = 1;
            game.ballMesh.material = getBallMaterial(game);
            applySkinAbilities(game, key);
            saveGame(game);
            updateWalletUI(game);
            playSound('coin');
        }
    } else if (type === 'sky') {
        if (game.saveData.unlockedSkies.includes(key)) {
            game.saveData.selectedSky = key;
            applySkyConfig(game, game.skyConfigs[key] || game.skyConfigs.day);
            saveGame(game);
        } else if (game.saveData.totalCoins >= price) {
            game.saveData.totalCoins -= price;
            game.saveData.unlockedSkies.push(key);
            game.saveData.selectedSky = key;
            applySkyConfig(game, game.skyConfigs[key] || game.skyConfigs.day);
            saveGame(game);
            updateWalletUI(game);
        }
    }
}

export function levelUpSkin(game, key, cost) {
    const conf = game.ballConfigs[key];
    if (!conf) return;
    const maxLevel = 5;
    game.saveData.skinLevels = game.saveData.skinLevels || {};
    const currentLevel = game.saveData.skinLevels[key] || 1;
    if (currentLevel >= maxLevel) return;
    if (game.saveData.totalCoins >= cost) {
        game.saveData.totalCoins -= cost;
        game.saveData.skinLevels[key] = currentLevel + 1;
        if (game.saveData.selectedBall === key) {
            applySkinAbilities(game, key);
            game.ballMesh.material = getBallMaterial(game);
        }
        saveGame(game);
        updateWalletUI(game);
    }
}

export function applySkinAbilities(game, key) {
    const conf = game.ballConfigs[key];
    if (!conf || !conf.ability) return;
    const abil = conf.ability;
    const level = (game.saveData.skinLevels && game.saveData.skinLevels[key]) ? game.saveData.skinLevels[key] : 1;
    const base = Number.isFinite(Number(abil.base)) ? Number(abil.base) : 1.0;
    const perLevel = Number.isFinite(Number(abil.perLevel)) ? Number(abil.perLevel) : 0.0;
    const effect = base + perLevel * Math.max(0, level - 1);

    // Price-based speed bias
    const price = Number(conf.price || 0);
    const maxPrice = 12000;
    const priceBias = 1.0 + (price / maxPrice) * 0.12;

    switch (abil.key) {
        case 'speed':
            game._abilitySpeed = effect * priceBias;
            game._abilityJump = 1.0;
            game._abilityCoins = 1.0;
            break;
        case 'jump':
            game._abilitySpeed = 1.0 * priceBias;
            game._abilityJump = effect;
            game._abilityCoins = 1.0;
            break;
        case 'coins':
            game._abilitySpeed = 1.0 * priceBias;
            game._abilityJump = 1.0;
            game._abilityCoins = effect;
            break;
        default:
            game._abilitySpeed = 1.0 * priceBias;
            game._abilityJump = 1.0;
            game._abilityCoins = 1.0;
    }
}
