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
import { renderCatalogPanel } from './catalog_ui.js';
import { saveGame } from './persistence.js';
import { playSound } from './audio.js';
import { applySkyConfig, getBallMaterial, applyBallSkin } from '../engine/scene.js';
import { createLevel, createInfiniteLevel } from './levelgen.js';
import { initVoiceToText, createMicButton, showTranscriptionToast, startListening, stopListening } from './voice_to_text.js';
import { signScore } from './puter_integration.js';

// --- Remote data sanitization ---
const REMOTE_MAX_STRING = 128;
const REMOTE_MAX_NUMBER = 1e9;

/**
 * Generate or retrieve a player display name.
 */
function getPlayerName(game) {
    if (!game.saveData.playerName) {
        const prefixes = ['Pro', 'Mega', 'Ultra', 'Super', 'Neon', 'Cyber', 'Turbo', 'Hyper', 'Nitro', 'XLR8'];
        const suffixes = ['Ball', 'Roller', 'Bouncer', 'Dasher', 'Racer', 'Glider', 'Cruiser', 'Jumper', 'Z', 'Flyer'];
        game.saveData.playerName =
            prefixes[Math.floor(Math.random() * prefixes.length)] +
            suffixes[Math.floor(Math.random() * suffixes.length)] +
            Math.floor(Math.random() * 99);
        saveGame(game);
    }
    return game.saveData.playerName;
}

function sanitizeRemoteEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const safe = {};
    for (const key of Object.keys(entry)) {
        if (typeof key !== 'string' || key.length > 64) continue;
        const val = entry[key];
        if (typeof val === 'string') {
            safe[key] = val.slice(0, REMOTE_MAX_STRING);
        } else if (typeof val === 'number') {
            safe[key] = Number.isFinite(val) ? Math.max(-REMOTE_MAX_NUMBER, Math.min(REMOTE_MAX_NUMBER, val)) : 0;
        } else if (typeof val === 'boolean') {
            safe[key] = val;
        }
        // Skip objects, arrays, functions, null, undefined
    }
    // Drop entries that produced no valid fields (all keys invalid)
    if (Object.keys(safe).length === 0) return null;
    return safe;
}

export function setupUI(game, room) {
    // --- Top menu gear button ---
    const gearBtn = document.getElementById('gear-btn');
    const topMenu = document.getElementById('top-menu');
    if (gearBtn && topMenu) {
        gearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = topMenu.style.display === 'flex';
            topMenu.style.display = isVisible ? 'none' : 'flex';
        });
    }

    // --- Help button ---
    const helpBtn = document.getElementById('help-btn');
    const overlay = document.getElementById('overlay');

    // Focus management: trap focus in open modals, restore on close
    let _preModalFocus = null;
    if (overlay) {
        const observer = new MutationObserver(() => {
            if (overlay.style.display === 'flex' && overlay.innerHTML) {
                if (!_preModalFocus) _preModalFocus = document.activeElement;
                // Auto-focus first focusable element after render
                requestAnimationFrame(() => {
                    const first = overlay.querySelector('button:not([disabled]), [href], input:not([disabled])');
                    if (first && !overlay.contains(document.activeElement)) first.focus();
                });
            } else if (overlay.style.display !== 'flex' && _preModalFocus) {
                try { _preModalFocus.focus(); } catch(e) {}
                _preModalFocus = null;
            }
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
    }

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
                    <button class="menu-btn" id="overlay-close-btn" aria-label="Close help" style="margin-top:12px;">OK</button>
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

    // Close overlay on background click (unless builder is active)
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (game._builderActive) return; // Don't kill builder via background click
                overlay.style.display = 'none';
                overlay.innerHTML = '';
            }
        });
    }

    // --- Builder button ---
    const builderBtn = document.getElementById('builder-btn');
    if (builderBtn) {
        builderBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof game.enterBuilder === 'function') {
                game.enterBuilder();
            }
        });
    }

    // --- Community button ---
    const communityBtn = document.getElementById('community-btn');
    if (communityBtn) {
        communityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof game._showCommunityMenu === 'function') {
                game._showCommunityMenu();
            }
        });
    }

    // --- Catalog button ---
    const catalogBtn = document.getElementById('catalog-btn');
    if (catalogBtn && overlay) {
        catalogBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderCatalogPanel(game);
        });
    }

    // --- Voice-to-Text: Add mic button to bottom bar ---
    const bottomBar = document.getElementById('bottom-bar');
    if (bottomBar) {
        const vtt = game._voiceToText || initVoiceToText(game);
        game._voiceToText = vtt;

        const vttContainer = document.createElement('div');
        vttContainer.style.cssText = 'display:flex;align-items:center;gap:6px;';

        const micBtn = createMicButton(vtt, {
            tooltip: vtt.isNative ? 'Voice input' : 'Voice input (server)',
            onResult: (text) => {
                showTranscriptionToast(text);
                // Also fire a callback for other UI components to hook into
                if (typeof game._onVoiceResult === 'function') {
                    game._onVoiceResult(text);
                }
            }
        });
        vttContainer.appendChild(micBtn);
        bottomBar.appendChild(vttContainer);
    }

    // --- World Map button ---
    const worldBtn = document.getElementById('world-btn');
    if (worldBtn) {
        worldBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof game.enterWorld === 'function') {
                game.enterWorld();
            }
        });
    }

    // --- Neighbor Preview toggle button ---
    const neighborBtn = document.getElementById('neighbor-preview-btn');
    if (neighborBtn) {
        neighborBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const visible = game._toggleNeighborPreview();
            neighborBtn.style.background = visible
                ? 'rgba(136,68,255,0.4)'
                : 'rgba(100,100,100,0.3)';
            neighborBtn.style.borderColor = visible ? '#9944ff' : '#666';
            neighborBtn.textContent = visible ? '👁️' : '👁️‍🗨️';
        });
    }

    // --- Survival Mode button ---
    const survivalBtn = document.getElementById('survival-btn');
    if (survivalBtn) {
        const updateSurvivalLabel = () => {
            survivalBtn.textContent = game._isInfinite ? 'SURVIVAL ✓' : 'SURVIVAL';
            survivalBtn.style.background = game._isInfinite
                ? 'rgba(30,180,30,0.6)'
                : 'rgba(180,30,30,0.6)';
            survivalBtn.style.borderColor = game._isInfinite ? '#44ff44' : '#ff4444';
        };
        survivalBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!game._isInfinite) {
                game.createInfiniteLevel();
                updateSurvivalLabel();
            }
        });
        // Expose updater so reset() can refresh the label
        game._updateSurvivalLabel = updateSurvivalLabel;
    }

    // --- Open World button (track-builder catalog + level-segments + shop tiers + dev plan) ---
    // Dynamic-injected so this works whether or not index.html pre-declares it.
    let openworldBtn = document.getElementById('openworld-btn');
    if (!openworldBtn) {
        openworldBtn = document.createElement('button');
        openworldBtn.id = 'openworld-btn';
        openworldBtn.className = 'menu-btn';
        openworldBtn.setAttribute('aria-label', 'Open World — project plan, builder catalog, shop tiers, dev plan');
        openworldBtn.innerText = '🌐 OPEN WORLD';
        const topMenu = document.getElementById('top-menu');
        if (topMenu) {
            openworldBtn.style.cssText = 'font-size:10px;padding:6px 10px;background:rgba(80,40,200,0.4);border-color:#8844ff;';
            topMenu.appendChild(openworldBtn);
        } else {
            openworldBtn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:15000;font-size:10px;padding:6px 10px;background:rgba(80,40,200,0.6);border:1px solid #8844ff;color:#fff;border-radius:8px;cursor:pointer;';
            document.body.appendChild(openworldBtn);
        }
    }
    if (openworldBtn && !openworldBtn._openworldWired) {
        openworldBtn._openworldWired = true; // guard so re-running setupUI doesn't double-bind
        openworldBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./openworld/openworld_ui.js').then((mod) => {
                try { mod.renderOpenWorld(game); }
                catch (err) { console.warn('[openworld] renderOpenWorld failed:', err); }
            }).catch((err) => { console.warn('[openworld] module load failed:', err); });
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
                        <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            Invert Joystick Y
                            <label style="position:relative;display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                                <input type="checkbox" id="joystick-invert" ${game.joystickInverted ? 'checked' : ''} style="width:18px;height:18px;accent-color:#9944ff;cursor:pointer;">
                                <span style="font-size:11px;color:#aaa;">${game.joystickInverted ? 'ON (inverted)' : 'OFF (normal)'}</span>
                            </label>
                        </label>
                    </div>
                    <button class="menu-btn" id="settings-close-btn" aria-label="Close settings">Close</button>
                </div>`;

            const dzSlider = document.getElementById('joystick-deadzone');
            const jpSlider = document.getElementById('joystick-power');
            const invertCheck = document.getElementById('joystick-invert');
            const dzVal = document.getElementById('dz-val');
            const jpVal = document.getElementById('jp-val');
            const invertLabel = invertCheck ? invertCheck.nextElementSibling : null;
            if (dzSlider) dzSlider.addEventListener('input', () => {
                game.joystickDeadzone = parseInt(dzSlider.value) / 100;
                dzVal.innerText = `${Math.round(game.joystickDeadzone * 100)}%`;
            });
            if (jpSlider) jpSlider.addEventListener('input', () => {
                game.joystickPower = parseInt(jpSlider.value) / 100;
                jpVal.innerText = `${Math.round(game.joystickPower * 100)}%`;
            });
            if (invertCheck) invertCheck.addEventListener('change', () => {
                game.joystickInverted = invertCheck.checked;
                if (invertLabel) invertLabel.innerText = game.joystickInverted ? 'ON (inverted)' : 'OFF (normal)';
            });
            const closeBtn = document.getElementById('settings-close-btn');
            if (closeBtn) closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; overlay.innerHTML = ''; });
        });
    }

    // Populate initial coin balance (element now exists in HTML)
    updateWalletUI(game);

    // --- Remote subscriptions (best-effort, sanitized) ---
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            room.collection('leaderboard').subscribe((list) => {
                try {
                    const parsed = Array.isArray(list) ? list.map(sanitizeRemoteEntry).filter(Boolean) : [];
                    game._remoteLeaderboard = parsed;
                } catch (e) {}
            });
        } catch (e) {}

        try {
            room.collection('player_clones').subscribe((list) => {
                try {
                    const parsed = Array.isArray(list) ? list.map(sanitizeRemoteEntry).filter(Boolean) : [];
                    game._remotePlayerClones = parsed;
                } catch (e) {}
            });
        } catch (e) {}

        try {
            room.collection('ball_stats').subscribe((list) => {
                try {
                    const parsed = Array.isArray(list) ? list.map(sanitizeRemoteEntry).filter(Boolean) : [];
                    game._remoteBallStats = parsed;
                } catch (e) {}
            });
        } catch (e) {}
    }
}

export function updateWalletUI(game) {
    try {
        const el = document.getElementById('total-coins');
        if (el) el.innerText = `${game.saveData.totalCoins} 🪙`;
    } catch (e) {}
}

// --- Game State ---
export function checkGameState(game, dt, room) {
    try {
        // Coin collection
        let coinMult = game._abilityCoins || 1.0;

        // Apply sky condition coin bonus (#8)
        const skyConf = game.skyConfigs && game.skyConfigs[game.saveData.selectedSky];
        if (skyConf && skyConf.conditions && skyConf.conditions.coinBonus) {
            coinMult *= skyConf.conditions.coinBonus;
        }
        for (let i = game.coins.length - 1; i >= 0; i--) {
            const coin = game.coins[i];
            if (!coin || coin.userData.collected || coin.userData.dropping) continue;
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

        // Checkpoint respawn + fall-off coin-drop animation.
        //
        // feel-pass 2026-06-27 round 6 (user directive): instead of instantly
        // teleporting when ballY < -15, run a 3-second "falling" timer that
        // only triggers the teleport if the ball remains below the threshold
        // AND is actively falling (vy < -10) AND not grounded, for THREE full
        // seconds. While the timer accumulates, every uncollected coin is
        // flagged `coin.userData.dropping = true` and animated straight down
        // (with small lateral jitter) so it visually "falls away" with the
        // ball — the user's "all coins fall away" directive. The timer resets
        // to 0 if the ball re-grounds OR climbs above the threshold, so a
        // brief dip below the floor (animation glitch, jump edge case) does
        // NOT trigger restart. On the 3-second mark: teleport to the last
        // checkpoint, zero velocity, then sweep scene+array of all dropping
        // coins (the player has lost them).
        const ballY = game.ballBody.position.y;
        const ballVelY = game.ballBody.velocity.y;
        const FALL_Y_THRESHOLD = -15;
        const FALL_VEL_THRESHOLD = -10;
        const FALL_TIME_THRESHOLD = 3.0;
        const isFalling = ballY < FALL_Y_THRESHOLD
            && ballVelY < FALL_VEL_THRESHOLD
            && !game.isGrounded;

        if (isFalling) {
            game._fallTimer = (game._fallTimer || 0) + dt;
            // Mark every uncollected coin as dropping, then animate down for
            // the rest of this frame. We do not splice mid-loop.
            for (const coin of game.coins) {
                if (!coin || coin.userData.collected || coin.userData.dropping) continue;
                coin.userData.dropping = true;
            }
            for (const coin of game.coins) {
                if (coin && coin.userData.dropping) {
                    coin.position.y -= 25 * dt;
                    coin.position.x += (Math.random() - 0.5) * 0.6 * dt;
                }
            }
        } else if (game._fallTimer) {
            game._fallTimer = 0;
        }

        if (game._fallTimer >= FALL_TIME_THRESHOLD) {
            game.ballBody.position.copy(game.lastCheckpointPos);
            game.ballBody.velocity.set(0, 0, 0);
            game.ballBody.angularVelocity.set(0, 0, 0);
            game._fallTimer = 0;
            // Cleanup: remove dropping coins from scene + array — the player
            // has lost them by falling off track.
            if (game.coins && game.coins.length > 0) {
                for (const coin of game.coins) {
                    if (coin && coin.userData && coin.userData.dropping) {
                        try { game.scene.remove(coin); } catch (_e) {}
                    }
                }
                game.coins = game.coins.filter((c) => !(c && c.userData && c.userData.dropping));
            }
        }

        // Checkpoint progress — unchanged from round-5. Note: with the round-6
        // addCheckpoint change in src/levelgen.js, every checkpoint now has an
        // invisible kinematic wall; the ball halts at the wall on contact.
        // Once stopped at the wall, the proximity loop below still fires (ball
        // IS at the checkpoint coords), so lastCheckpointPos is updated and
        // the next fall-off jump teleports the player back here.
        for (const cp of game.checkpoints) {
            const bx = game.ballBody.position.x;
            const bz = game.ballBody.position.z;
            if (Math.abs(bx - cp.x) < (cp.width / 2 + 1) && Math.abs(bz - cp.z) < 3) {
                game.lastCheckpointPos.set(cp.x, cp.y + 1, cp.z);
            }
        }

        // Distance tracking & HUD updates
        game._distanceTraveled = game._distanceTraveled || 0;
        const prog = Math.abs(game.ballBody.position.z) / Math.max(1, game.levelLength);

        // --- Time remaining estimate ---
        const timeEl = document.getElementById('time-display');
        const distEl = document.getElementById('distance-display');
        const diffEl = document.getElementById('difficulty-label');

        // Distance
        if (distEl) {
            const pct = Math.min(99, Math.floor(prog * 100));
            distEl.innerText = `Progress: ${pct}%`;
        }

        // Time remaining (estimated from current progress & elapsed)
        if (timeEl && game.startTime && game.levelLength && !game.isGameOver) {
            const elapsed = (Date.now() - game.startTime) / 1000;
            const safeProg = Math.max(0.005, Math.min(0.995, prog));
            // Suppress noisy early estimates until meaningful progress
            if (prog < 0.03) {
                timeEl.innerText = '⏱ --:--';
                timeEl.style.color = '#ffdd66';
            } else {
                const remaining = Math.max(0, Math.round(elapsed / safeProg - elapsed));
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                timeEl.innerText = `⏱ ${mins}:${secs.toString().padStart(2, '0')}`;
                // Flash red when time is running low (< 15s and not yet finished)
                timeEl.style.color = remaining < 15 && prog < 0.85 ? '#ff5555' : '#ffdd66';
            }
        }

        // Difficulty label
        if (diffEl && game.currentTier) {
            const t = game.currentTier;
            const bg = '#' + t.color.toString(16).padStart(6, '0');
            // Use white text on dark backgrounds, black on light
            const brightness = ((t.color >> 16) & 0xff) * 0.299 + ((t.color >> 8) & 0xff) * 0.587 + (t.color & 0xff) * 0.114;
            const fg = brightness > 140 ? '#000' : '#fff';
            diffEl.innerText = t.label;
            diffEl.style.background = bg;
            diffEl.style.color = fg;
        }

        // Win condition
        if (!game.isGameOver && game.finishZ !== undefined) {
            const fz = game.finishZ;
            const fx = game.finishX || 0;
            const bx = game.ballBody.position.x;
            const bz = game.ballBody.position.z;
            if (Math.abs(bx - fx) < 6 && Math.abs(bz - fz) < 8) {
                gameOver(game, true, room);
            }
        }
    } catch (e) {
        console.warn('checkGameState error', e);
    }
}

/** Show a small floating 'Back to Builder' HUD button during test play. */
export function showTestPlayHUD(game) {
    if (!game._isTestPlayFromBuilder) return;
    // Remove any existing button without clearing the flag
    const prev = document.getElementById('test-play-back-btn');
    if (prev) prev.remove();
    const btn = document.createElement('button');
    btn.id = 'test-play-back-btn';
    btn.textContent = '🔧 BACK';
    btn.style.cssText = `position:fixed;top:12px;left:12px;z-index:15000;
        padding:6px 12px;font-size:11px;font-family:'Segoe UI',sans-serif;
        background:rgba(220,120,0,0.65);border:1px solid #ff8800;color:#fff;
        border-radius:8px;cursor:pointer;pointer-events:auto;
        box-shadow:0 2px 8px rgba(0,0,0,0.4);transition:opacity 0.2s;
        font-weight:600;`;
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.85'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof game._returnToBuilder === 'function') game._returnToBuilder();
    });
    document.body.appendChild(btn);
}

/** Remove the test-play HUD button. */
export function removeTestPlayHUD(game) {
    const existing = document.getElementById('test-play-back-btn');
    if (existing) existing.remove();
    if (game) game._isTestPlayFromBuilder = false;
}

export function gameOver(game, win, room) {
    game.isGameOver = true;
    game.isWin = win;
    // Read flag BEFORE removing HUD (removeTestPlayHUD clears it)
    const isTestPlay = !!game._isTestPlayFromBuilder;
    removeTestPlayHUD(game);
    const overlay = document.getElementById('overlay');
    if (!overlay) return;

    if (win) {
        game.currentLevel++;
        const timeTaken = game.startTime ? ((Date.now() - game.startTime) / 1000) : 0;
        const bonus = Math.max(0, Math.floor(100 - timeTaken * 2));
        game.saveData.totalCoins += bonus;
        showTimeBonus(game, bonus);
        updateWalletUI(game);

        // Leaderboard submission — include player name
        addLeaderboardEntry(game, {
            playerName: getPlayerName(game),
            level: game.currentLevel - 1,
            time: timeTaken.toFixed(1),
            coins: game.saveData.totalCoins,
            ball: game.saveData.selectedBall || 'rainbow',
            ballName: (game.ballConfigs[game.saveData.selectedBall] || {}).name || game.saveData.selectedBall,
            score: game.score
        }, room);

        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div class="modal" style="max-width:360px;padding:20px;background:linear-gradient(145deg,#1a2a1e,#162b13);border-radius:16px;color:#fff;text-align:center;">
                <h2>🏆 Level Complete!</h2>
                <p style="font-size:14px;margin:8px 0;">Level ${game.currentLevel - 1} cleared in ${timeTaken.toFixed(1)}s</p>
                <p style="font-size:14px;">Time Bonus: +${bonus} 🪙</p>
                ${isTestPlay
                    ? `<button class="menu-btn" id="back-to-builder-btn" aria-label="Back to builder" style="margin-top:12px;background:rgba(220,120,0,0.5);border-color:#ff8800;">🔧 BACK TO BUILDER</button>`
                    : `<button class="menu-btn" id="next-level-btn" aria-label="Next level" style="margin-top:12px;">Next Level →</button>`
                }
            </div>`;
        if (isTestPlay) {
            const backBtn = document.getElementById('back-to-builder-btn');
            if (backBtn) backBtn.addEventListener('click', () => {
                overlay.style.display = 'none';
                overlay.innerHTML = '';
                if (typeof game._returnToBuilder === 'function') game._returnToBuilder();
            });
        } else {
            const nextBtn = document.getElementById('next-level-btn');
            if (nextBtn) nextBtn.addEventListener('click', () => {
                overlay.style.display = 'none';
                overlay.innerHTML = '';
                reset(game);
            });
        }
    } else {
        // Fall/death — show retry (and back-to-builder if test-playing)
        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div class="modal" style="max-width:360px;padding:20px;background:linear-gradient(145deg,#2e1a1a,#3e1621);border-radius:16px;color:#fff;text-align:center;">
                <h2>💀 You Fell!</h2>
                <p style="font-size:14px;margin:8px 0;">Try again!</p>
                <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap;">
                    <button class="menu-btn" id="retry-btn" aria-label="Retry level">Retry</button>
                    ${isTestPlay
                        ? `<button class="menu-btn" id="back-to-builder-btn" aria-label="Back to builder" style="background:rgba(220,120,0,0.5);border-color:#ff8800;">🔧 BACK TO BUILDER</button>`
                        : ''
                    }
                </div>
            </div>`;
        const retryBtn = document.getElementById('retry-btn');
        if (retryBtn) retryBtn.addEventListener('click', () => {
            overlay.style.display = 'none';
            overlay.innerHTML = '';
            game.ballBody.position.copy(game.lastCheckpointPos);
            game.ballBody.velocity.set(0, 0, 0);
            game.isGameOver = false;
        });
        if (isTestPlay) {
            const backBtn = document.getElementById('back-to-builder-btn');
            if (backBtn) backBtn.addEventListener('click', () => {
                overlay.style.display = 'none';
                overlay.innerHTML = '';
                if (typeof game._returnToBuilder === 'function') game._returnToBuilder();
            });
        }
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
    if (game._isInfinite) {
        createInfiniteLevel(game);
        if (game._updateSurvivalLabel) game._updateSurvivalLabel();
    } else {
        createLevel(game);
    }
    updateWalletUI(game);
}

// --- Grids ---

export function renderGrids(game) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;

    // Shop search state
    game._shopSearchQuery = '';

    overlay.innerHTML = `
        <div class="modal" style="max-width:640px;max-height:88vh;overflow-y:auto;padding:0;background:linear-gradient(180deg,rgba(20,20,40,0.98),rgba(15,15,30,0.98));border:2px solid rgba(136,68,255,0.2);border-radius:16px;color:#fff;">
            <div style="padding:14px 18px 10px;border-bottom:1px solid rgba(255,255,255,0.08);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <h2 style="margin:0;font-family:'5x5dots',monospace;font-size:16px;letter-spacing:1px;">🛒 SHOP</h2>
                    <span style="font-size:14px;background:rgba(255,215,0,0.1);padding:4px 10px;border-radius:6px;border:1px solid rgba(255,215,0,0.2);">🪙 ${game.saveData.totalCoins}</span>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <input type="text" id="shop-search-input" placeholder="🔍 Search skins, skies, powerups..." style="
                        flex:1;padding:6px 10px;border-radius:8px;
                        background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                        color:#ddd;font-size:11px;font-family:'Segoe UI',sans-serif;
                        outline:none;transition:border-color 0.2s;
                    ">
                </div>
            </div>
            <div style="display:flex;gap:4px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.06);overflow-x:auto;flex-shrink:0;">
                <button class="menu-btn tab-btn active" data-tab="skins" aria-label="Show skins" style="font-size:10px;padding:5px 12px;">⚽ Skins</button>
                <button class="menu-btn tab-btn" data-tab="skies" aria-label="Show skies" style="font-size:10px;padding:5px 12px;">🌤️ Skies</button>
                <button class="menu-btn tab-btn" data-tab="powerups" aria-label="Show powerups" style="font-size:10px;padding:5px 12px;">⚡ Powerups</button>
                <button class="menu-btn" id="shop-close-btn" aria-label="Close shop" style="margin-left:auto;font-size:10px;padding:5px 10px;">✕ Close</button>
            </div>
            <div id="skins-grid" class="tab-content" style="padding:8px 14px;"></div>
            <div id="skies-grid" class="tab-content" style="display:none;padding:8px 14px;"></div>
            <div id="powerups-grid" class="tab-content" style="display:none;padding:8px 14px;"></div>
        </div>`;

    const closeBtn = document.getElementById('shop-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; overlay.innerHTML = ''; });

    // Search input — restore previous search value if any
    const searchInput = document.getElementById('shop-search-input');
    if (searchInput) {
        if (game._shopSearchQuery) searchInput.value = game._shopSearchQuery;
        searchInput.addEventListener('input', (e) => {
            game._shopSearchQuery = e.target.value.trim().toLowerCase();
            // Refresh active tab content
            const activeTab = overlay.querySelector('.tab-btn.active');
            if (activeTab) {
                const tab = activeTab.dataset.tab;
                if (tab === 'skins') renderSkinsGrid(game);
                else if (tab === 'skies') renderSkiesGrid(game);
                else if (tab === 'powerups') renderPowerupsGrid(game);
            }
        });
    }

    // Restore active tab or default to 'skins'
    const restoreTab = game._shopActiveTab || 'skins';

    // Tab switching
    overlay.querySelectorAll('.tab-btn').forEach(btn => {
        const tabName = btn.dataset.tab;
        // Restore active state
        if (tabName === restoreTab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            game._shopActiveTab = tabName;
            overlay.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('skins-grid').style.display = tabName === 'skins' ? '' : 'none';
            document.getElementById('skies-grid').style.display = tabName === 'skies' ? '' : 'none';
            document.getElementById('powerups-grid').style.display = tabName === 'powerups' ? '' : 'none';
            if (tabName === 'skins') renderSkinsGrid(game);
            else if (tabName === 'skies') renderSkiesGrid(game);
            else if (tabName === 'powerups') renderPowerupsGrid(game);
        });
        // Show correct content for initial render
        if (tabName === restoreTab) {
            // Will be rendered below
        }
    });

    // Show the correct tab content pane
    document.getElementById('skins-grid').style.display = restoreTab === 'skins' ? '' : 'none';
    document.getElementById('skies-grid').style.display = restoreTab === 'skies' ? '' : 'none';
    document.getElementById('powerups-grid').style.display = restoreTab === 'powerups' ? '' : 'none';

    // Render the active tab (and keep others in memory)
    if (restoreTab === 'skins') renderSkinsGrid(game);
    else if (restoreTab === 'skies') renderSkiesGrid(game);
    else if (restoreTab === 'powerups') renderPowerupsGrid(game);
    // Also cache the other grids so tab-switching doesn't lose scroll state
    // (they'll re-render on first switch, which is fine)
}

function renderSkinsGrid(game) {
    const container = document.getElementById('skins-grid');
    if (!container) return;
    container.innerHTML = '';

    const searchQuery = (game._shopSearchQuery || '').toLowerCase();

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;';
    container.appendChild(grid);

    let keys = Object.keys(game.ballConfigs).sort((a, b) => {
        const pa = Number(game.ballConfigs[a] && game.ballConfigs[a].price ? game.ballConfigs[a].price : 0);
        const pb = Number(game.ballConfigs[b] && game.ballConfigs[b].price ? game.ballConfigs[b].price : 0);
        return pb - pa;
    });

    // Filter by search query
    if (searchQuery) {
        keys = keys.filter(key => {
            const conf = game.ballConfigs[key];
            return (conf.name || '').toLowerCase().includes(searchQuery) ||
                   key.toLowerCase().includes(searchQuery) ||
                   (conf.description || '').toLowerCase().includes(searchQuery) ||
                   (conf.ability && conf.ability.key || '').includes(searchQuery);
        });
    }

    if (keys.length === 0 && searchQuery) {
        container.innerHTML = `<div style="text-align:center;padding:30px;color:#888;font-size:12px;">🔍 No skins match "<span style="color:#9944ff;">${searchQuery}</span>"</div>`;
        return;
    }

    keys.forEach(key => {
        const conf = game.ballConfigs[key];
        const isUnlocked = Array.isArray(game.saveData.unlockedBalls) && game.saveData.unlockedBalls.includes(key);
        const isSelected = game.saveData.selectedBall === key;
        const level = (game.saveData.skinLevels && game.saveData.skinLevels[key]) ? Math.max(1, Math.min(5, game.saveData.skinLevels[key])) : 1;
        const price = Number(conf && conf.price ? conf.price : 0);
        const maxLevel = 5;

        // Compute ability stats
        let abilityHtml = '';
        let abilityKey = '';
        let abilityEffect = '';
        if (conf && conf.ability) {
            const abil = conf.ability;
            const base = Number.isFinite(Number(abil.base)) ? Number(abil.base) : 1.0;
            const per = Number.isFinite(Number(abil.perLevel)) ? Number(abil.perLevel) : 0.0;
            const eff = base + per * Math.max(0, level - 1);
            abilityKey = abil.key.toUpperCase();
            abilityEffect = `x${eff.toFixed(2)}`;
            abilityHtml = `<div style="font-size:9px;color:#ffdd66;margin-top:2px;">${abilityKey} ${abilityEffect}</div>`;
        }

        // Level-up cost
        const levelUpCost = Math.floor(price * (1 + (level * 0.6)));
        const isMaxLevel = level >= maxLevel;

        // Equipped badge
        const equippedBadge = isSelected ? `<div style="position:absolute;top:4px;right:4px;background:#44ff88;color:#000;font-size:7px;font-weight:700;padding:1px 5px;border-radius:4px;letter-spacing:0.5px;">✓ EQUIPPED</div>` : '';

        const card = document.createElement('div');
        card.style.cssText = `
            position:relative;background:${isSelected ? 'rgba(68,255,136,0.08)' : 'rgba(255,255,255,0.03)'};
            border:2px solid ${isSelected ? 'rgba(68,255,136,0.4)' : isUnlocked ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'};
            border-radius:10px;padding:10px;text-align:center;
            transition:all 0.2s;
        `;
        card.onmouseenter = () => { card.style.background = 'rgba(136,68,255,0.08)'; card.style.borderColor = 'rgba(136,68,255,0.3)'; };
        card.onmouseleave = () => { card.style.background = isSelected ? 'rgba(68,255,136,0.08)' : 'rgba(255,255,255,0.03)'; card.style.borderColor = isSelected ? 'rgba(68,255,136,0.4)' : 'rgba(255,255,255,0.08)'; };

        const previewStyle = conf && conf.tex ? `background-image: url(${conf.tex});background-size:cover;background-position:center;` : 'background-color: #666;';

        card.innerHTML = `
            ${equippedBadge}
            <div style="width:64px;height:64px;border-radius:50%;margin:0 auto 6px;${previewStyle}border:2px solid rgba(255,255,255,0.1);"></div>
            <div style="font-size:13px;font-weight:700;color:#fff;">${conf && conf.name ? conf.name : key}</div>
            <div style="font-size:10px;color:#888;margin:2px 0 4px;line-height:1.3;min-height:26px;">${conf && conf.description ? conf.description.slice(0, 60) + (conf.description.length > 60 ? '...' : '') : ''}</div>
            ${abilityHtml}
            <div style="font-size:11px;margin:4px 0;font-weight:600;">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : `${price} 🪙`}</div>
            <div style="display:flex;gap:4px;margin-top:4px;justify-content:center;flex-wrap:wrap;">
                ${isUnlocked
                    ? `<button class="shop-btn" data-action="equip" data-key="${key}" style="${isSelected ? 'opacity:0.5;cursor:default;' : ''}">${isSelected ? '✓ EQUIP' : 'EQUIP'}</button>`
                    : `<button class="shop-btn" data-action="buy" data-key="${key}">BUY ${price} 🪙</button>`
                }
                <button class="shop-btn" data-action="level" data-key="${key}" ${isMaxLevel ? 'style="opacity:0.4;cursor:default;"' : ''}>
                    ${isMaxLevel ? 'MAX' : `Lv.${level + 1} ${levelUpCost}🪙`}
                </button>
            </div>
        `;

        grid.appendChild(card);

        // Wire events
        const buyBtn = card.querySelector('[data-action="buy"]');
        const equipBtn = card.querySelector('[data-action="equip"]');
        const lvlBtn = card.querySelector('[data-action="level"]');

        if (buyBtn) buyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handlePurchase(game, 'ball', key, price);
            renderGrids(game);
        });
        if (equipBtn && !isSelected) equipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handlePurchase(game, 'ball', key, 0);
            renderGrids(game);
        });
        if (lvlBtn && !isMaxLevel) lvlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            levelUpSkin(game, key, levelUpCost);
            renderGrids(game);
        });
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
                <button class="menu-btn sky-btn" data-key="${key}" aria-label="${isUnlocked ? (isSelected ? 'Selected sky' : 'Select') + ' ' + conf.name : 'Buy ' + conf.name + ' for ' + price + ' coins'}">${isUnlocked ? (isSelected ? 'SELECTED' : 'SELECT') : ('BUY ' + price)}</button>
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

    const searchQuery = (game._shopSearchQuery || '').toLowerCase();

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;';
    container.appendChild(grid);

    let keys = Object.keys(game.powerupConfigs);

    // Filter by search
    if (searchQuery) {
        keys = keys.filter(key => {
            const conf = game.powerupConfigs[key];
            return (conf.name || '').toLowerCase().includes(searchQuery) ||
                   (conf.description || '').toLowerCase().includes(searchQuery) ||
                   (conf.rarity || '').includes(searchQuery);
        });
    }

    if (keys.length === 0 && searchQuery) {
        container.innerHTML = `<div style="text-align:center;padding:30px;color:#888;font-size:12px;">🔍 No powerups match "<span style="color:#9944ff;">${searchQuery}</span>"</div>`;
        return;
    }

    keys.forEach(key => {
        const conf = game.powerupConfigs[key];
        const owned = game.saveData.powerups && game.saveData.powerups[key];
        const level = owned && owned.level ? owned.level : 1;
        const equipped = owned && owned.equipped;
        const price = Number(conf && conf.price ? conf.price : 0);

        const rarityColors = { common: '#aaa', uncommon: '#44ff44', rare: '#4488ff', epic: '#9944ff' };
        const rarityColor = rarityColors[conf.rarity] || '#aaa';

        const card = document.createElement('div');
        card.style.cssText = `
            background:${equipped ? 'rgba(68,255,136,0.08)' : 'rgba(255,255,255,0.03)'};
            border:2px solid ${equipped ? 'rgba(68,255,136,0.4)' : 'rgba(255,255,255,0.08)'};
            border-left:3px solid ${rarityColor};
            border-radius:10px;padding:12px;text-align:center;
            transition:all 0.2s;
        `;
        card.onmouseenter = () => { card.style.background = 'rgba(136,68,255,0.08)'; card.style.borderColor = 'rgba(136,68,255,0.3)'; };
        card.onmouseleave = () => { card.style.background = equipped ? 'rgba(68,255,136,0.08)' : 'rgba(255,255,255,0.03)'; card.style.borderColor = equipped ? 'rgba(68,255,136,0.4)' : 'rgba(255,255,255,0.08)'; };

        card.innerHTML = `
            <div style="font-size:14px;font-weight:700;">${conf.name}</div>
            <div style="font-size:10px;color:${rarityColor};font-weight:600;margin:2px 0 4px;">${conf.rarity.toUpperCase()}</div>
            <div style="font-size:10px;color:#aaa;margin:2px 0;line-height:1.3;min-height:26px;">${conf.description || ''}</div>
            <div style="font-size:11px;color:#ddd;margin:6px 0;">Level ${level}/${conf.maxLevel}</div>
            <div style="display:flex;gap:4px;margin-top:6px;justify-content:center;flex-wrap:wrap;">
                ${owned
                    ? `<button class="shop-btn" data-action="pu-upgrade" data-key="${key}" ${level >= conf.maxLevel ? 'style="opacity:0.4;cursor:default;"' : ''}>${level >= conf.maxLevel ? 'MAX LEVEL' : `UPGRADE ${Math.floor(price * level)}🪙`}</button>`
                    : `<button class="shop-btn" data-action="pu-buy" data-key="${key}">BUY ${price} 🪙</button>`
                }
                ${owned ? `<button class="shop-btn" data-action="pu-toggle" data-key="${key}" style="background:${equipped ? 'rgba(68,255,136,0.2)' : 'rgba(255,255,255,0.06)'};">${equipped ? '✓ ON' : 'OFF'}</button>` : ''}
            </div>
        `;

        grid.appendChild(card);

        // Wire events
        const buyBtn = card.querySelector('[data-action="pu-buy"]');
        const upgradeBtn = card.querySelector('[data-action="pu-upgrade"]');
        const toggleBtn = card.querySelector('[data-action="pu-toggle"]');

        if (buyBtn) buyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cost = price;
            if (game.saveData.totalCoins >= cost) {
                game.saveData.totalCoins -= cost;
                game.saveData.powerups = game.saveData.powerups || {};
                // FIXED: New purchases start at level 1, not level + 1 = 2
                game.saveData.powerups[key] = { level: 1, owned: true, equipped: false };
                saveGame(game);
                updateWalletUI(game);
            }
            renderGrids(game);
        });

        if (upgradeBtn && level < conf.maxLevel) upgradeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cost = Math.floor(price * level);
            if (game.saveData.totalCoins >= cost) {
                game.saveData.totalCoins -= cost;
                game.saveData.powerups = game.saveData.powerups || {};
                game.saveData.powerups[key] = {
                    level: Math.min(conf.maxLevel, level + 1),
                    owned: true,
                    equipped: equipped
                };
                saveGame(game);
                updateWalletUI(game);
            }
            renderGrids(game);
        });

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
    let entries;
    try {
        const raw = localStorage.getItem('goingBalls_leaderboard');
        entries = raw ? JSON.parse(raw) : [];
    } catch (_e) { entries = []; }

    // Merge remote
    if (room && room.isReady && game._remoteLeaderboard && Array.isArray(game._remoteLeaderboard)) {
        const dedup = {};
        entries.forEach(e => { dedup[e.id || e.time + '_' + e.level] = e; });
        game._remoteLeaderboard.forEach(e => { dedup[e.id || e.time + '_' + e.level] = e; });
        entries = Object.values(dedup);  
    }

    // Sort by: highest score first, then fastest time, then highest level
    return entries.sort((a, b) => {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        const timeDiff = parseFloat(a.time || 999) - parseFloat(b.time || 999);
        if (timeDiff !== 0) return timeDiff;
        return (b.level || 0) - (a.level || 0);
    }).slice(0, 50);
}

export function saveLeaderboard(game, entries, room) {
    localStorage.setItem('goingBalls_leaderboard', JSON.stringify(entries.slice(0, 50)));
    // Mirror to remote
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('leaderboard');
            entries.slice(0, 5).forEach(async (e) => {
                try { await coll.create(e); } catch (err) {}
            });
        } catch (err) {}
    }
}

export function addLeaderboardEntry(game, entry, room) {
    entry.id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    entry.date = new Date().toISOString();
    // Sign the score with the shared secret so the worker can verify authenticity
    if (entry.score !== undefined && (entry.playerName || entry.playerId)) {
        entry.proof = signScore(entry.score, entry.playerName || entry.playerId || 'Player');
    }
    const entries = getLeaderboard(game, room);
    entries.push(entry);
    saveLeaderboard(game, entries, room);
}

export function renderLeaderboard(game, room) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    const entries = getLeaderboard(game, room);

    // Add column header row
    let rowsHtml = `
        <div style="display:flex;gap:8px;padding:8px 0;border-bottom:2px solid rgba(255,255,255,0.15);font-size:10px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
            <span style="width:32px;text-align:center;">#</span>
            <span style="flex:1;">Player</span>
            <span style="width:44px;text-align:center;">Level</span>
            <span style="width:54px;text-align:right;">Time</span>
            <span style="width:60px;text-align:right;">Coins</span>
        </div>`;

    if (entries.length === 0) {
        rowsHtml = '<p style="text-align:center;color:#888;padding:30px 0;font-size:13px;">🏆 No entries yet!<br><span style="font-size:11px;color:#666;">Complete a level to submit your score.</span></p>';
    } else {
        entries.slice(0, 20).forEach((e, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
            const name = e.playerName || 'Player';
            const ballEmoji = e.ball || '⚪';
            rowsHtml += `
                <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;transition:background 0.15s;"
                     onmouseenter="this.style.background='rgba(255,255,255,0.04)'"
                     onmouseleave="this.style.background='transparent'">
                    <span style="width:32px;text-align:center;font-size:13px;font-weight:${i < 3 ? '700' : '400'};">${medal}</span>
                    <span style="flex:1;display:flex;align-items:center;gap:4px;">
                        <span style="font-size:14px;">${ballEmoji}</span>
                        <span style="color:#eee;font-weight:600;">${name}</span>
                    </span>
                    <span style="width:44px;text-align:center;color:#88ff88;">${e.level || 0}</span>
                    <span style="width:54px;text-align:right;color:#ffdd66;">${e.time || '--'}s</span>
                    <span style="width:60px;text-align:right;color:#ffd700;">${e.coins || 0} 🪙</span>
                </div>`;
        });
    }

    overlay.innerHTML = `
        <div class="modal" style="max-width:480px;max-height:85vh;overflow-y:auto;padding:0;background:linear-gradient(180deg,rgba(20,20,40,0.98),rgba(15,15,30,0.98));border:2px solid rgba(255,215,0,0.15);border-radius:16px;color:#fff;">
            <div style="padding:16px 20px 12px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:center;">
                <div style="font-size:18px;font-weight:700;font-family:'5x5dots',monospace;letter-spacing:2px;">🏆 LEADERBOARD</div>
                <div style="font-size:10px;color:#888;margin-top:4px;">Top 20 — ${entries.length} total entries</div>
            </div>
            <div style="padding:4px 20px 12px;">${rowsHtml}</div>
            <div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
                <button class="menu-btn" id="lb-close-btn" aria-label="Close leaderboard" style="font-size:11px;padding:6px 18px;">Close</button>
            </div>
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
            const equipConf = game.ballConfigs[key];
            applyBallSkin(game, equipConf);
            applySkinAbilities(game, key);
            saveGame(game);
            updateWalletUI(game);
        } else if (game.saveData.totalCoins >= price) {
            game.saveData.totalCoins -= price;
            game.saveData.unlockedBalls.push(key);
            game.saveData.selectedBall = key;
            game.saveData.skinLevels = game.saveData.skinLevels || {};
            game.saveData.skinLevels[key] = 1;
            const buyConf = game.ballConfigs[key];
            applyBallSkin(game, buyConf);
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
            const lvlConf = game.ballConfigs[key];
            if (lvlConf && lvlConf.type !== 'gltf') {
                game.ballMesh.material = getBallMaterial(game);
            }
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
