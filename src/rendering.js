/*
 Rendering module.
 Exports: onWindowResize(game), animate(game)

 Handles: window resize, main game loop (animation frame, physics step,
 camera orbit, rain/snow/fire particle updates, infinite chunk spawning,
 difficulty camera/UI shake, shockwave camera shake, music visualizer,
 sky rotation, scene render).
*/
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { updateGroovyCanvas } from '../engine/scene.js';
import { saveGame } from './persistence.js';
import { spawnInfiniteChunk } from './levelgen.js';
import { updateNeighborPreview, animateNeighborPreview } from './world/world_minimap.js';
import { updateSpeedLines } from './speed_lines.js';
import { updateMotionBlur, finishMotionBlur, resizeMotionBlur } from './motion_blur.js';
import { updateBloom, finishBloom, resizeBloom } from './bloom.js';

export function onWindowResize(game) {
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
    game.renderer.setSize(window.innerWidth, window.innerHeight);
    try { resizeMotionBlur(game); } catch (e) {}
    try { resizeBloom(game); } catch (e) {}
}

// Log engine versions once on first render for debugging
let _versionsLogged = false;
function logEngineVersions() {
    if (_versionsLogged) return;
    _versionsLogged = true;
    console.info(`[GoingBalls] THREE.js r${THREE.REVISION} · cannon-es ${CANNON.World ? '✓' : '✗'}`);
}

function updateDebugOverlay(game) {
    if (!game._debugOverlayVisible) return;
    const el = document.getElementById('debug-overlay');
    if (!el) return;

    const vel = game.ballBody ? game.ballBody.velocity : null;
    if (!vel) {
        el.textContent = 'waiting for ballBody...';
        return;
    }

    const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const ji = game.joystickInput || { x: 0, y: 0 };
    const groundedDot = `<span style="color:#${game.isGrounded ? '44ff44' : 'ff4444'}">●</span>`;

    el.innerHTML =
        `${groundedDot} G:${game.isGrounded ? 'Y' : 'N'}  ` +
        `Vx:${vel.x.toFixed(1)} Vy:${vel.y.toFixed(1)} Vz:${vel.z.toFixed(1)}  ` +
        `H:${hSpeed.toFixed(1)}  ` +
        `J:${ji.x.toFixed(2)},${ji.y.toFixed(2)}`;
}

export function animate(game) {
    requestAnimationFrame(() => animate(game));
    logEngineVersions();

    // Builder mode — render builder scene exclusively
    if (game._builderActive) {
        try { game.renderer.render(game._builderScene, game._builderCamera); } catch (e) {}
        return;
    }

    // World map mode — don't render game scene behind the overlay
    if (game._worldActive) {
        return;
    }

    let dt = 0;
    if (game._lastFrameTime) {
        dt = Math.min(0.1, (performance.now() - game._lastFrameTime) / 1000);
    }
    game._lastFrameTime = performance.now();

    // Round delta-time for smoother feel across varying monitors
    try { dt = Math.round(dt * 100) / 100; } catch (e) {}

    // Update 3D neighbor site previews (throttled rebuild + animation)
    try {
        updateNeighborPreview(game, dt);
        animateNeighborPreview(game, dt);
    } catch (_e) {}

    // Update groovy canvas if active
    if (game.saveData && game.saveData.selectedBall === 'groovy') {
        updateGroovyCanvas(game, dt);
    }

    // Sky rotation
    if (game.skyMesh && game.skyRotationSpeed) {
        try {
            game.skyMesh.rotation.y += game.skyRotationSpeed * dt;
        } catch (e) {}
    }

    // Game loop if not game over
    if (!game.isGameOver) {
        if (game.updatePhysics) game.updatePhysics(dt);
        if (game.checkGameState) game.checkGameState(dt);
        // Particle/weather updates
        if (game.raining) updateRain(game, dt);
        if (game.snowing) updateSnow(game, dt);
        if (game.hasFireSparks && game.updateFireSparks) game.updateFireSparks(dt);
        if (game.hasHeatShimmer && game.updateHeatShimmer) game.updateHeatShimmer(dt);
        if (game.hasMeteors) {
            if (game.updateMeteors) game.updateMeteors(dt);
            if (game.checkMeteorCollisions) game.checkMeteorCollisions();
        }
        // Coin idle animation — subtle bob + rotation
        updateCoinAnimation(game, dt);

        // Infinite runner: spawn chunks ahead of player
        if (game._isInfinite && typeof game._spawnZ !== 'undefined') {
            try {
                const targetAhead = game._spawnAhead || 180;
                let safety = 0;
                while (Math.abs(game._spawnZ) < Math.abs(game.ballBody.position.z) + targetAhead && safety++ < 200) {
                    spawnInfiniteChunk(game);
                }
                game.levelLength = Math.max(game.levelLength || 0, Math.abs(game._spawnZ || 0));
            } catch (e) {}
        }
    }

    // Difficulty-based camera shake (infinite runner)
    if (game._isInfinite && game._difficultyScale > 40) {
        try {
            const camShake = Math.min(0.6, (game._difficultyScale - 40) * 0.007 + Math.random() * 0.02);
            game.camera.position.x += (Math.random() - 0.5) * camShake;
            game.camera.position.y += Math.sin(Date.now() * 0.02) * camShake * 0.6;
            game.camera.rotation.z = Math.sin(Date.now() * 0.003) * camShake * 0.12;
        } catch (e) {}
    }

    // Shockwave camera shake
    if (game._shockwaveEnd && Date.now() < game._shockwaveEnd) {
        try {
            const t = (Date.now() - (game._shockwaveEnd - 400)) / 400;
            if (t < 1) {
                const amp = (1 - t) * (0.18 + (game._shockwaveIntensity || 3) * 0.04);
                game.camera.position.x += (Math.random() - 0.5) * amp;
                game.camera.position.y += (Math.random() - 0.5) * amp;
            }
        } catch (e) {}
    }

    // Difficulty visual timer: red fog pulse
    if (game._difficultyVisualTimer && (Date.now() - game._difficultyVisualTimer) < 2400) {
        try {
            const now = performance.now();
            const pulse = 0.3 + Math.abs(Math.sin(now * 0.005)) * 0.7;
            if (game.scene && game.scene.fog && game._prevFogColor) {
                const r = Math.min(1, 0.6 * pulse);
                const g = Math.max(0, game._prevFogColor.g * (1 - pulse));
                const b = Math.max(0, game._prevFogColor.b * (1 - pulse));
                game.scene.fog.color.setRGB(r, g, b);
            }
        } catch (e) {}
    }

    // UI shaking for high difficulty (infinite runner only)
    const uiRoot = document.getElementById('ui');
    if (game._isInfinite && game._difficultyScale > 36) {
        try {
            if (uiRoot) {
                const now = performance.now();
                const intensity = Math.min(6, (game._difficultyScale - 36) * 0.12);
                uiRoot.style.transform = `translate(${Math.sin(now * 0.015) * intensity}px, ${Math.cos(now * 0.013) * intensity}px)`;
            }
        } catch (e) {}
    } else {
        try { if (uiRoot) uiRoot.style.transform = ''; } catch (e) {}
    }

    // Music visualizer: draw frequency bars on border canvas
    if (game._analyser && game._visCtx && game._visCanvas) {
        try {
            game._analyser.getByteFrequencyData(game._freqData);
            const ctx = game._visCtx;
            const w = game._visCanvas.width;
            const h = game._visCanvas.height;
            ctx.clearRect(0, 0, w, h);
            const len = game._freqData.length;
            const bands = 64;
            const step = Math.floor(len / bands);
            const bandW = w / bands;
            for (let i = 0; i < bands; i++) {
                const val = game._freqData[i * step] / 255;
                const bh = Math.max(2, Math.floor(val * 48));
                const x = i * bandW;
                const grad = ctx.createLinearGradient(x, 0, x + bandW, 0);
                grad.addColorStop(0, `rgba(${120 + val * 135},${40 + val * 160},${40 + val * 120},0.95)`);
                grad.addColorStop(1, `rgba(${200 + val * 55},${80 + val * 140},${30 + val * 90},0.95)`);
                ctx.fillStyle = grad;
                ctx.fillRect(x, 0, bandW - 1, bh);
                ctx.fillRect(x, h - bh, bandW - 1, bh);
            }
            const lowEnergy = game._freqData.slice(0, Math.floor(len * 0.12)).reduce((s, v) => s + v, 0) / (len * 0.12) / 255;
            const hiEnergy = game._freqData.slice(-Math.floor(len * 0.12)).reduce((s, v) => s + v, 0) / (len * 0.12) / 255;
            ctx.fillStyle = `rgba(255, ${80 + Math.floor(lowEnergy * 120)}, ${60 + Math.floor(hiEnergy * 120)}, 0.12)`;
            ctx.fillRect(0, 0, 6, h);
            ctx.fillRect(w - 6, 0, 6, h);
        } catch (e) {}
    }

    // Camera follow
    updateCamera(game, dt);

    // Debug overlay (grounded, velocity, joystick — toggled with F8)
    updateDebugOverlay(game);

    // Speed lines (cosmetic — intensity tied to ball velocity)
    updateSpeedLines(game, dt);

    // Motion blur post-process (redirects render to off-screen RT when active)
    updateMotionBlur(game);

    // Bloom post-process (redirects render to bloom RT when motion blur is off)
    updateBloom(game);

    // Render
    try { game.renderer.render(game.scene, game.camera); } catch (e) {}

    // Composite motion blur to screen (when active)
    // Each finish function is self-cleaning — it resets render target to null.
    finishMotionBlur(game);

    // Composite bloom to screen (when active & motion blur was off)
    finishBloom(game);

    // Auto-save periodically
    if (!game._lastSave || Date.now() - game._lastSave > 5000) {
        saveGame(game);
        game._lastSave = Date.now();
    }
}

function updateCamera(game, dt) {
    try {
        if (!game.ballMesh) return;
        game._vec3Cam.copy(game.ballMesh.position);
        game._vec3Dir.set(
            Math.sin(game.cameraYaw) * Math.cos(game.cameraPitch),
            Math.sin(game.cameraPitch),
            Math.cos(game.cameraYaw) * Math.cos(game.cameraPitch)
        ).normalize();
        game._vec3Desired.copy(game._vec3Cam)
            .addScaledVector(game._vec3Dir, game.cameraDistance);

        // Lerp camera for smooth follow
        const lerp = 6.0 * (dt || 0.016);
        game.camera.position.lerp(game._vec3Desired, lerp);
        game.camera.lookAt(game._vec3Cam);
    } catch (e) {}
}

function updateRain(game, dt) {
    try {
        if (!game.rainPoints) return;
        const positions = game.rainPoints.geometry.attributes.position.array;
        const count = positions.length / 3;
        const speed = 28;
        const areaX = 60, areaY = 50, areaZ = 40;
        const cx = game.ballMesh ? game.ballMesh.position.x : 0;
        const cz = game.ballMesh ? game.ballMesh.position.z : 0;
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix + 1] -= speed * dt;
            if (positions[ix + 1] < 0) {
                positions[ix] = cx + (Math.random() - 0.5) * areaX;
                positions[ix + 1] = 15 + Math.random() * areaY;
                positions[ix + 2] = cz + (Math.random() - 0.5) * areaZ;
            }
        }
        game.rainPoints.geometry.attributes.position.needsUpdate = true;
    } catch (e) {}
}

function updateSnow(game, dt) {
    try {
        if (!game.snowPoints) return;
        const positions = game.snowPoints.geometry.attributes.position.array;
        const count = positions.length / 3;
        const speed = 8;
        const areaX = 80, areaY = 45, areaZ = 60;
        const cx = game.ballMesh ? game.ballMesh.position.x : 0;
        const cz = game.ballMesh ? game.ballMesh.position.z : 0;
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix + 1] -= speed * dt;
            positions[ix] += Math.sin(positions[ix + 1] * 0.3 + i) * 0.5 * dt;
            if (positions[ix + 1] < 0) {
                positions[ix] = cx + (Math.random() - 0.5) * areaX;
                positions[ix + 1] = 15 + Math.random() * areaY;
                positions[ix + 2] = cz + (Math.random() - 0.5) * areaZ;
            }
        }
        game.snowPoints.geometry.attributes.position.needsUpdate = true;
    } catch (e) {}
}

// Coin idle animation — subtle bob + spin for visual life
// Only applies to placed coins (not dropped/falling ones).
// Uses dt-based time accumulation to avoid per-frame performance.now() calls.
let _coinAnimTime = 0;

function updateCoinAnimation(game, dt) {
    try {
        if (!game.coins || !game.coins.length) return;
        _coinAnimTime += dt;
        for (let i = 0; i < game.coins.length; i++) {
            const coin = game.coins[i];
            if (!coin || coin.userData?.collected) continue;
            // Dropped coins are falling — skip idle bob (they have their own physics)
            const isDropped = coin.userData?.dropped;
            if (!isDropped) {
                const bob = Math.sin(_coinAnimTime * 2.5 + i * 0.7) * 0.12;
                if (coin.userData._baseY === undefined) {
                    coin.userData._baseY = coin.position.y - bob;
                }
                coin.position.y = coin.userData._baseY + bob;
            }
            // Gentle spin (applies to all coins, including dropped)
            coin.rotation.z += dt * 1.8;
        }
    } catch (e) { /* non-critical cosmetic */ }
}
