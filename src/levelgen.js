/*
 Level Generation module.
 Exports: createLevel(game, seed), createInfiniteLevel(game, seed), clearLevel(game),
 addPlatform(game, ...), addRamp(game, ...), addCoins(game, ...),
 addPendulum(game, ...), addSpinner(game, ...), addHammer(game, ...),
 addMover(game, ...), addWall(game, ...), addTunnelWalls(game, ...),
 addGlassPlatform(game, ...), addCheckpoint(game, ...), addBlade(game, ...),
 placeFinishModel(game), spawnDroppedCoins(game, worldPos, totalValue),
 createShockwave(game, centerZ, intensity), spawnInfiniteChunk(game),
 triggerDropFromObstacle(game, obstacle, options).

 Contains the full procedural level generator with ~40+ segment types,
 difficulty tiers, weather integration, checkpoint system, and coin spawning.
*/
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mulberry32, getParticleCount, saveGame } from './persistence.js';
import { applySkyConfig, disposeMesh } from '../engine/scene.js';
import { createRain, clearRain, createWind, clearWind, createFireSparks, clearFireSparks, createHeatShimmer, clearHeatShimmer, createMeteors, clearMeteors } from './physics.js';

/** Module-level RNG used by all helper functions. Overridden by createLevel() with a seeded RNG, restored afterward. */
let _rand = Math.random.bind(Math);

export function clearLevel(game) {
    game.levelObjects.forEach(obj => {
        if (obj.body) game.world.removeBody(obj.body);
        if (obj.mesh) {
            game.scene.remove(obj.mesh);
            if (obj.mesh.geometry) obj.mesh.geometry.dispose();
        }
    });
    game.coins.forEach(coin => {
        game.scene.remove(coin);
        if (coin.geometry) coin.geometry.dispose();
    });
    game.pendulums.forEach(p => {
        if (p.body) game.world.removeBody(p.body);
        game.scene.remove(p.mesh);
        if (p.mesh && p.mesh.geometry) p.mesh.geometry.dispose();
        if (p.line) {
            game.scene.remove(p.line);
            if (p.line.geometry) p.line.geometry.dispose();
        }
        if (p.trail) { disposeMesh(p.trail); }
    });
    game.spinners.forEach(s => {
        if (s.body) game.world.removeBody(s.body);
        game.scene.remove(s.mesh);
        if (s.mesh && s.mesh.geometry) s.mesh.geometry.dispose();
        if (s.trail) { disposeMesh(s.trail); }
    });
    game.movers.forEach(m => {
        if (m.type === 'blade') {
            if (m.bladeMesh) {
                game.scene.remove(m.bladeMesh);
                if (m.bladeMesh.geometry) m.bladeMesh.geometry.dispose();
            }
            return;
        }
        if (m.body) game.world.removeBody(m.body);
        game.scene.remove(m.mesh);
        if (m.mesh && m.mesh.geometry) m.mesh.geometry.dispose();
        if (m.trail) { disposeMesh(m.trail); }
    });
    if (game.raining) clearRain(game);
    if (game.windy) clearWind(game);
    if (game.snowing) {
        if (game.snowPoints) { game.scene.remove(game.snowPoints); game.snowPoints.geometry && game.snowPoints.geometry.dispose(); game.snowPoints.material && game.snowPoints.material.dispose(); game.snowPoints = null; }
        game.snowing = false;
    }
    if (game.hasFireSparks) { clearFireSparks(game); game.hasFireSparks = false; }
    if (game.hasHeatShimmer) { clearHeatShimmer(game); game.hasHeatShimmer = false; }
    if (game.hasMeteors) { clearMeteors(game); game.hasMeteors = false; }

    // Dispose glass platforms that are still in the array
    if (game.glassPlatforms) {
        for (const gp of game.glassPlatforms) {
            if (gp.mesh) {
                game.scene.remove(gp.mesh);
                if (gp.mesh.geometry) gp.mesh.geometry.dispose();
            }
        }
    }

    game.checkpoints = [];
    game.levelObjects = [];
    game.coins = [];
    game.pendulums = [];
    game.spinners = [];
    game.movers = [];
    game.glassPlatforms = [];
    game.raining = false;
    game.windy = false;
}

export function createLevel(game, seed) {
    // Seeded RNG
    try {
        if (typeof seed === 'number' && !Number.isNaN(seed)) {
            game._seed = seed >>> 0;
            game.rng = mulberry32(game._seed);
            game.rnd = () => game.rng();
            console.info('createLevel deterministic seed used:', game._seed);
        }
    } catch (e) {
        console.warn('Seeded RNG setup failed (continuing with default RNG)', e);
    }
    const _fallbackRandom = Math.random.bind(Math);
    const rand = () => (game.rnd ? game.rnd() : _fallbackRandom());
    const _prevRand = _rand;
    _rand = rand;

    try {
    clearLevel(game);
    game.lastCheckpointPos.set(0, 5, 0);

    let currentZ = 0;
    let currentX = 0;
    let currentY = 0;

    game.mirrorLevel = (game.currentLevel % 2 === 0);
    const MX = (x) => game.mirrorLevel ? -x : x;

    addPlatform(game, 0, 0, 0, 8, 15);
    currentZ -= 7.5;

    game.isNightLevel = (game.saveData.selectedSky === 'night') || (game.currentLevel % 6 === 0);
    if (game.isNightLevel) {
        try {
            if (game.scene.fog) game.scene.fog.color.setHex(0x071229);
            document.body.style.backgroundColor = '#071229';
        } catch (e) {}
    }

    // Difficulty tiers
    const difficultyTiers = [
        { level: 1, color: 0x7cfc00, label: "EASY", types: ['straight', 'ramp', 'tunnel', 'speed_strip', 'jump_gap'] },
        { level: 4, color: 0x32cd32, label: "NORMAL", types: ['straight', 'ramp', 'tunnel', 'zigzag', 'bumpy', 'jump_gap', 'climb'] },
        { level: 7, color: 0x1e90ff, label: "CHALLENGING", types: ['zigzag', 'gap', 'archipelago', 'spinner', 'double_jump_gap', 'climb'] },
        { level: 10, color: 0xffff00, label: "HARD", types: ['gap', 'spinner', 'pendulum', 'stairs', 'halfpipe', 'double_jump_gap'] },
        { level: 13, color: 0xffa500, label: "TOUGH", types: ['pendulum', 'hammer_gauntlet', 'moving_rects', 'checkerboard', 'triple_jump_gap'] },
        { level: 16, color: 0xff4500, label: "EXPERT", types: ['hammer_gauntlet', 'side_crusher', 'narrow', 'moving_rects', 'triple_jump_gap'] },
        { level: 19, color: 0x8b0000, label: "EXTREME", types: ['narrow', 'side_crusher', 'checkerboard', 'archipelago', 'triple_jump_gap'] },
        { level: 22, color: 0x4b0082, label: "INSANE", types: ['narrow', 'side_crusher', 'hammer_gauntlet', 'checkerboard', 'triple_jump_gap', 'loop_d_loop'] },
        { level: 25, color: 0x000000, label: "IMPOSSIBLE", types: ['narrow', 'side_crusher', 'hammer_gauntlet', 'checkerboard', 'triple_jump_gap', 'loop_d_loop', 'spiral_tube'] }
    ];

    let tier = difficultyTiers[0];
    for (const t of difficultyTiers) {
        if (game.currentLevel >= t.level) tier = t;
    }
    game.currentTier = tier;

    // --- Sky condition overrides (#8) — run before weather application ---
    const skyCond = game.skyConfigs[game.saveData.selectedSky]?.conditions;
    if (skyCond) {
        // Inferno: fire sparks + heat shimmer
        if (skyCond.fireSparks) {
            createFireSparks(game);
            game.hasFireSparks = true;
        }
        if (skyCond.heatHaze) {
            createHeatShimmer(game);
            game.hasHeatShimmer = true;
        }
        // Void Storm: meteors + forced wind
        if (skyCond.meteorHazards) {
            createMeteors(game);
            game.hasMeteors = true;
        }
        // Frost: always snow + ice (extra friction reduction)
        if (skyCond.snowAlways) {
            game.currentWeather = 'snow';
        }
        // Storm / Void Storm: high wind chance
        if (skyCond.windChance && Math.random() < skyCond.windChance) {
            if (game.currentWeather !== 'snow') {
                game.currentWeather = 'wind';
            } else {
                // Snow + wind combo
                game.windy = true;
                game.wind = { dirX: (rand() > 0.5 ? 1 : -1) * (0.6 + rand() * 1.0), strength: 0.7 + rand() * 0.9 };
                createWind(game);
            }
        }
        if (skyCond.rainChance && Math.random() < skyCond.rainChance) {
            if (game.currentWeather !== 'snow') game.currentWeather = 'rain';
        }
    }

    // Weather AI (used when no sky condition forces weather)
    if (!skyCond || (!skyCond.snowAlways && !skyCond.fireSparks && !skyCond.meteorHazards)) {
        game.currentWeather = game.weatherAI ? game.weatherAI.chooseWeather(game.currentLevel) : 'clear';
    }
    try { game.weatherAI && game.weatherAI.recordWeather(game.currentWeather); } catch(e){}

    if (game.currentWeather === 'rain') {
        game.raining = true;
        createRain(game);
        game.world.contactmaterials.forEach(cm => { try { cm.frictionBackup = cm.friction; cm.friction = Math.max(0.08, (cm.frictionBackup || 0.6) * 0.3); } catch(e){} });
    } else if (game.currentWeather === 'wind') {
        game.windy = true;
        game.wind = { dirX: (rand() > 0.5 ? 1 : -1) * (0.6 + rand() * 1.0), strength: 0.7 + rand() * 0.9 };
        createWind(game);
    } else if (game.currentWeather === 'snow') {
        game.snowing = true;
        try {
            const count = getParticleCount(game, 'snow', 600);
            const positions = new Float32Array(count * 3);
            const area = Math.max(30, Math.min(120, Math.floor((window.innerWidth + window.innerHeight) / 40)));
            for (let i = 0; i < count; i++) {
                const ix = i * 3;
                positions[ix] = (rand() - 0.5) * area + (game.ballMesh.position.x || 0);
                positions[ix + 1] = rand() * 40 + 5;
                positions[ix + 2] = (rand() - 0.5) * area + (game.ballMesh.position.z || 0);
            }
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.9, depthWrite: false });
            game.snowPoints = new THREE.Points(geom, mat);
            game.snowPoints.frustumCulled = false;
            game.scene.add(game.snowPoints);
        } catch (e) { console.warn('snow create failed', e); }
        game.world.contactmaterials.forEach(cm => { try { cm.frictionBackup = cm.friction; cm.friction = Math.max(0.12, (cm.frictionBackup || 0.6) * 0.45); } catch(e){} });
    }

    // Weather-based segment bias
    game.segmentBias = {};
    if (game.currentWeather === 'wind' || game.currentWeather === 'snow' || game.currentWeather === 'mixed') {
        game.segmentBias['downhill'] = 3.0;
    } else if (game.currentWeather === 'rain') {
        game.segmentBias['narrow'] = 1.8;
        game.segmentBias['bumpy'] = 1.4;
    } else {
        game.segmentBias['straight'] = 1.2;
    }

    // Apply tier visuals
    const selectedSky = game.skyConfigs[game.saveData.selectedSky] || game.skyConfigs.day;
    applySkyConfig(game, selectedSky);
    if (game.scene.fog) {
        game.scene.fog.color.setHex(tier.color);
    }
    document.body.style.backgroundColor = `#${tier.color.toString(16).padStart(6, '0')}`;

    // Heat haze (Inferno sky) — applied after tier visuals so tier color doesn't override it
    if (skyCond && skyCond.heatHaze && game.scene.fog) {
        game.scene.fog.color.setHex(0x3a0a00);
    }

    // Rain/wind based on level number (only when no condition sky active)
    if (!skyCond && game.currentLevel % 5 === 0) {
        game.raining = true;
        createRain(game);
        game.world.contactmaterials.forEach(cm => { try { cm.frictionBackup = cm.friction; cm.friction = Math.max(0.1, (cm.frictionBackup || 0.6) * 0.35); } catch(e){} });
        if (game.rollSound) game.rollSound.volume *= 0.9;
    }
    if (!skyCond && game.currentLevel % 7 === 0) {
        game.windy = true;
        game.wind = { dirX: (rand() > 0.5 ? 1 : -1) * (0.4 + rand() * 0.9), strength: 0.5 + rand() * 1.0 };
        createWind(game);
    }

    // Frost ice patches: extra friction reduction after snow is already applied
    if (skyCond && skyCond.icePatches && game.currentWeather === 'snow') {
        game.world.contactmaterials.forEach(cm => { try { cm.friction = Math.max(0.04, cm.friction * 0.55); } catch(e){} });
    }

    // Level scaling
    const numSegments = 15 + Math.floor(game.currentLevel * 2.5);
    const checkpointInterval = Math.floor(numSegments / 3);
    const baseWidth = Math.max(0.7, 7 - (game.currentLevel * 0.3));
    const hazardSpeedMult = 1 + (game.currentLevel * 0.15);

    for (let i = 0; i < numSegments; i++) {
        if (i > 0 && i % checkpointInterval === 0) {
            addCheckpoint(game, MX(currentX), currentY, currentZ, baseWidth);
            currentZ -= 4;
        }

        const type = tier.types[Math.floor(rand() * tier.types.length)];

        switch(type) {
            case 'straight': {
                const len = 15 + rand() * 20;
                addPlatform(game, MX(currentX), currentY, currentZ - len/2, baseWidth, len);
                addCoins(game, MX(currentX), currentY + 1, currentZ, len, 3);
                currentZ -= len;
                break;
            }
            case 'ramp': {
                const rampL = 15 + rand() * 10;
                let rampH = 4 + rand() * 4;
                if (rand() < 0.20) { rampH = rampL; }
                const maxAngle = Math.PI / 4;
                const angle = Math.atan2(rampH, rampL);
                if (angle > maxAngle) { rampH = Math.tan(maxAngle) * rampL; }
                addRamp(game, MX(currentX), currentY, currentZ, baseWidth + 1, rampL, rampH);
                currentZ -= rampL;
                currentY += rampH;
                break;
            }
            case 'narrow': {
                const len = 20;
                addPlatform(game, MX(currentX), currentY, currentZ - len/2, baseWidth * 0.4, len);
                addCoins(game, MX(currentX), currentY + 1.2, currentZ, len, 4);
                currentZ -= len;
                break;
            }
            case 'pendulum': {
                addPlatform(game, MX(currentX), currentY, currentZ - 10, baseWidth + 3, 20);
                addPendulum(game, MX(currentX), currentY, currentZ - 10, hazardSpeedMult);
                currentZ -= 20;
                break;
            }
            case 'zigzag': {
                const zzLen = 12;
                const offset = 4;
                const dir = rand() > 0.5 ? 1 : -1;
                addPlatform(game, MX(currentX), currentY, currentZ - zzLen/2, baseWidth, zzLen);
                currentZ -= zzLen;
                currentX += offset * dir;
                addPlatform(game, MX(currentX), currentY, currentZ - zzLen/2, baseWidth, zzLen);
                currentZ -= zzLen;
                break;
            }
            case 'gap': {
                const gapSize = 5 + rand() * 3;
                addPlatform(game, MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                currentZ -= (10 + gapSize);
                addPlatform(game, MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                currentZ -= 10;
                break;
            }
            case 'bumpy': {
                for(let b=0; b<6; b++) {
                    const bH = rand() * 0.7;
                    addPlatform(game, MX(currentX), currentY + bH, currentZ - 3, baseWidth + 1.5, 6);
                    currentZ -= 6;
                }
                break;
            }
            case 'spinner': {
                addPlatform(game, MX(currentX), currentY, currentZ - 12, baseWidth + 4, 24);
                addSpinner(game, MX(currentX), currentY + 0.5, currentZ - 12, hazardSpeedMult);
                currentZ -= 24;
                break;
            }
            case 'stairs': {
                const stepCount = 5;
                const stepLen = 4;
                const stepH = 0.8;
                for(let s=0; s<stepCount; s++) {
                    addPlatform(game, MX(currentX), currentY, currentZ - stepLen/2, baseWidth + 2, stepLen);
                    currentZ -= stepLen;
                    currentY += stepH;
                }
                break;
            }
            case 'tunnel': {
                const tLen = 30;
                addPlatform(game, MX(currentX), currentY, currentZ - tLen/2, baseWidth + 2, tLen);
                addTunnelWalls(game, MX(currentX), currentY, currentZ - tLen/2, baseWidth + 2, tLen);
                currentZ -= tLen;
                break;
            }
            case 'archipelago': {
                const count = 5;
                const dist = 8;
                for(let a=0; a<count; a++) {
                    const offX = (rand() - 0.5) * 6;
                    addPlatform(game, MX(currentX + offX), currentY, currentZ - dist/2, 3, 3);
                    addCoins(game, MX(currentX + offX), currentY + 1, currentZ - dist/2, 1, 1);
                    currentZ -= dist;
                }
                break;
            }
            case 'checkerboard': {
                const rows = 4;
                const cSize = 3;
                for(let r=0; r<rows; r++) {
                    const offX = (r % 2 === 0) ? -2 : 2;
                    addPlatform(game, MX(currentX + offX), currentY, currentZ - cSize/2, cSize, cSize);
                    currentZ -= cSize + 2;
                }
                break;
            }
            case 'hammer_gauntlet': {
                addPlatform(game, MX(currentX), currentY, currentZ - 15, baseWidth + 4, 30);
                for(let h=0; h<3; h++) {
                    addHammer(game, MX(currentX), currentY, currentZ - 8 - h*8, hazardSpeedMult);
                }
                currentZ -= 30;
                break;
            }
            case 'moving_rects': {
                const len = 25;
                addPlatform(game, MX(currentX), currentY, currentZ - len/2, baseWidth + 2, len);
                for(let m=0; m<4; m++) {
                    addMover(game, MX(currentX), currentY + 0.5, currentZ - 5 - m*5, 3, 1, 2, false, hazardSpeedMult);
                }
                currentZ -= len;
                break;
            }
            case 'speed_strip': {
                const len = 20;
                addPlatform(game, MX(currentX), currentY, currentZ - len/2, baseWidth + 1, len, 0xffff00);
                currentZ -= len;
                break;
            }
            case 'halfpipe': {
                const len = 20;
                addPlatform(game, MX(currentX), currentY, currentZ - len/2, baseWidth + 6, len);
                addRamp(game, MX(currentX - (baseWidth/2 + 3)), currentY + 1.5, currentZ, 1, len, 0);
                addWall(game, MX(currentX - baseWidth/2 - 2), currentY + 1, currentZ - len/2, 1, len, Math.PI/4);
                addWall(game, MX(currentX + baseWidth/2 + 2), currentY + 1, currentZ - len/2, 1, len, -Math.PI/4);
                currentZ -= len;
                break;
            }
            case 'side_crusher': {
                const len = 15;
                addPlatform(game, MX(currentX), currentY, currentZ - len/2, baseWidth + 2, len);
                addMover(game, MX(currentX - 3), currentY + 1, currentZ - len/2, 4, 2, len, true, hazardSpeedMult);
                addMover(game, MX(currentX + 3), currentY + 1, currentZ - len/2, 4, 2, len, true, hazardSpeedMult);
                currentZ -= len;
                break;
            }
            case 'jump_gap': {
                const gap = 8;
                addPlatform(game, MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                addCoins(game, MX(currentX), currentY + 2, currentZ - 5 - gap/2, 1, 1);
                currentZ -= (10 + gap);
                addPlatform(game, MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                currentZ -= 10;
                break;
            }
            case 'double_jump_gap': {
                const gap = 16;
                addPlatform(game, MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                addCoins(game, MX(currentX), currentY + 2.5, currentZ - 5 - gap/3, 1, 1);
                addCoins(game, MX(currentX), currentY + 4, currentZ - 5 - (2*gap/3), 1, 1);
                currentZ -= (10 + gap);
                addPlatform(game, MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                currentZ -= 10;
                break;
            }
            case 'triple_jump_gap': {
                const gap = 24;
                addPlatform(game, MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                addCoins(game, MX(currentX), currentY + 2, currentZ - 5 - gap/4, 1, 1);
                addCoins(game, MX(currentX), currentY + 5, currentZ - 5 - (2*gap/4), 1, 1);
                addCoins(game, MX(currentX), currentY + 3, currentZ - 5 - (3*gap/4), 1, 1);
                currentZ -= (10 + gap);
                addPlatform(game, MX(currentX), currentY, currentZ - 5, baseWidth + 2, 10);
                currentZ -= 10;
                break;
            }
            case 'climb': {
                const stepL = 10;
                const stepH = 4.5;
                const stepGap = 6;
                for(let c=0; c<3; c++) {
                    addPlatform(game, MX(currentX), currentY, currentZ - stepL/2, baseWidth + 3, stepL);
                    addCoins(game, MX(currentX), currentY + 2, currentZ - stepL - stepGap/2, 1, 1);
                    currentZ -= (stepL + stepGap);
                    currentY += stepH;
                }
                break;
            }
            case 'glass': {
                const len = 14;
                const w = Math.max(1.5, baseWidth * 0.8);
                addGlassPlatform(game, MX(currentX), currentY + 0.2, currentZ - len/2, w, len);
                addCoins(game, MX(currentX), currentY + 1.6, currentZ - len/2, len, 2);
                currentZ -= len;
                break;
            }
            case 'curve': {
                const segments = 6 + Math.floor(rand() * 4);
                const curveWidth = baseWidth;
                const curveRadius = 6 + rand() * 12;
                const dir = rand() > 0.5 ? 1 : -1;
                const segLen = 6;
                for (let s = 0; s < segments; s++) {
                    const angle = (s / segments) * (Math.PI / 2) * (0.6 + rand() * 0.6) * dir;
                    const offX = Math.sin(angle) * curveRadius;
                    const zStep = segLen;
                    addPlatform(game, MX(currentX + offX), currentY, currentZ - zStep/2, curveWidth, zStep);
                    if (s % 2 === 0) addCoins(game, MX(currentX + offX * 0.5), currentY + 1, currentZ - s * zStep, zStep, 2);
                    currentZ -= zStep;
                }
                break;
            }
            case 'loop_d_loop': {
                const loopRadius = 6 + rand() * 8;
                const loopSegments = 12 + Math.floor(rand() * 6);
                addRamp(game, MX(currentX), currentY, currentZ, baseWidth + 1, 8, Math.min(6, loopRadius * 0.6));
                currentZ -= 8;
                for (let i = 0; i < loopSegments; i++) {
                    const a = (i / loopSegments) * Math.PI * 2;
                    const px = Math.cos(a) * loopRadius;
                    const pz = Math.sin(a) * loopRadius;
                    addPlatform(game, MX(currentX + px), currentY + Math.sin(a) * 2, currentZ - pz, baseWidth * 0.9, 4);
                    if (i % 3 === 0) addCoins(game, MX(currentX + px), currentY + Math.sin(a) * 2 + 1, currentZ - pz, 2, 1);
                }
                addRamp(game, MX(currentX), currentY, currentZ - loopRadius * 1.2, baseWidth + 1, 12, Math.min(5, loopRadius * 0.4));
                currentZ -= loopRadius * 1.8;
                break;
            }
            case 'spiral_tube': {
                const turns = 1 + Math.floor(rand() * 2);
                const spiralRadius = 8 + rand() * 8;
                const segments = 14 + Math.floor(rand() * 6);
                for (let i = 0; i < segments; i++) {
                    const t = (i / segments) * (Math.PI * 2 * turns);
                    const r = spiralRadius * (1 - i / segments * 0.6);
                    const px = Math.cos(t) * r;
                    const pz = Math.sin(t) * r;
                    const yOff = (i / segments) * 4;
                    addPlatform(game, MX(currentX + px), currentY + yOff, currentZ - pz, baseWidth * 0.9, 5);
                    addWall(game, MX(currentX + px - baseWidth/2 - 0.6), currentY + yOff + 0.6, currentZ - pz, 0.4, 5, 0);
                    addWall(game, MX(currentX + px + baseWidth/2 + 0.6), currentY + yOff + 0.6, currentZ - pz, 0.4, 5, 0);
                    currentZ -= 5;
                }
                break;
            }
            default: {
                addPlatform(game, MX(currentX), currentY, currentZ - 10, baseWidth, 20);
                currentZ -= 20;
            }
        }
    }

    // Finish line
    const finishLen = 30;
    addPlatform(game, MX(currentX), currentY, currentZ - finishLen/2, 8, finishLen, 0x00ff00);
    game.finishX = MX(currentX);
    game.finishY = currentY;
    game.finishZ = currentZ - finishLen + 10;
    placeFinishModel(game);
    currentZ -= finishLen;

    game.levelLength = Math.abs(currentZ);
    game.startTime = Date.now();
    game.timeBonusShown = false;
    // Persist level progress so player can resume after refresh
    try { saveGame(game); } catch (_e) {}
    } finally {
        _rand = _prevRand;
    }
}

// --- Level element builders ---

export function addPlatform(game, x, y, z, width, length, color = null) {
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.5, length / 2));
    const body = new CANNON.Body({ mass: 0, shape: shape });
    body.position.set(x, y - 0.5, z);
    game.world.addBody(body);

    const geo = new THREE.BoxGeometry(width, 1, length);
    const mat = color ? game.sharedMaterials.finish : game.sharedMaterials.wood;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(body.position);
    mesh.receiveShadow = true;
    game.scene.add(mesh);
    game.levelObjects.push({ mesh, body });

    // Neon edge markings for night levels
    try {
        if (game.isNightLevel) {
            const stripHeight = 0.06;
            const stripDepth = length + 0.02;
            const stripWidth = 0.12;
            const stripGeoL = new THREE.BoxGeometry(stripWidth, stripHeight, stripDepth);
            const stripL = new THREE.Mesh(stripGeoL, game.sharedMaterials.neon);
            stripL.position.set(x - (width / 2) + stripWidth / 2 + 0.02, y + 0.55, z);
            stripL.receiveShadow = false;
            stripL.castShadow = false;
            game.scene.add(stripL);
            game.levelObjects.push({ mesh: stripL, body: null });

            const stripGeoR = stripGeoL.clone();
            const stripR = new THREE.Mesh(stripGeoR, game.sharedMaterials.neon);
            stripR.position.set(x + (width / 2) - stripWidth / 2 - 0.02, y + 0.55, z);
            stripR.receiveShadow = false;
            stripR.castShadow = false;
            game.scene.add(stripR);
            game.levelObjects.push({ mesh: stripR, body: null });

            const underGeo = new THREE.BoxGeometry(width + 0.06, 0.02, 0.06);
            const underMat = game.sharedMaterials.neon.clone();
            const under = new THREE.Mesh(underGeo, underMat);
            under.position.set(x, y + 0.01, z - (length / 2) + 0.02);
            under.receiveShadow = false;
            under.castShadow = false;
            under.material.transparent = true;
            under.material.opacity = 0.65;
            game.scene.add(under);
            game.levelObjects.push({ mesh: under, body: null });
        }
    } catch (e) { /* non-fatal */ }
}

export function addGlassPlatform(game, x, y, z, width, length) {
    try {
        const shape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.4, length / 2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y - 0.4, z);
        game.world.addBody(body);

        const geo = new THREE.BoxGeometry(width, 0.8, length);
        const mat = game.sharedMaterials.glass;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(body.position);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        game.scene.add(mesh);

        game.levelObjects.push({ mesh, body });
        game.glassPlatforms = game.glassPlatforms || [];
        game.glassPlatforms.push({ mesh, body, x, y, z, width, length, broken: false, breakTimer: 0 });
    } catch (e) {
        console.warn('addGlassPlatform failed', e);
    }
}

export function addTunnelWalls(game, x, y, z, width, length) {
    const wallH = 2;
    const wallW = 0.2;

    const shapeL = new CANNON.Box(new CANNON.Vec3(wallW/2, wallH/2, length/2));
    const bodyL = new CANNON.Body({ mass: 0, shape: shapeL });
    bodyL.position.set(x - width/2 - wallW/2, y + wallH/2, z);
    game.world.addBody(bodyL);

    const geo = new THREE.BoxGeometry(wallW, wallH, length);
    const meshL = new THREE.Mesh(geo, game.sharedMaterials.wall);
    meshL.position.copy(bodyL.position);
    game.scene.add(meshL);

    const bodyR = new CANNON.Body({ mass: 0, shape: shapeL });
    bodyR.position.set(x + width/2 + wallW/2, y + wallH/2, z);
    game.world.addBody(bodyR);
    const meshR = new THREE.Mesh(geo, game.sharedMaterials.wall);
    meshR.position.copy(bodyR.position);
    game.scene.add(meshR);

    game.levelObjects.push({ mesh: meshL, body: bodyL }, { mesh: meshR, body: bodyR });
}

export function addRamp(game, x, y, z, width, length, height) {
    const angle = Math.atan2(height, length);
    const rampLen = Math.sqrt(length*length + height*height);
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.5, rampLen / 2));
    const body = new CANNON.Body({ mass: 0, shape: shape });
    const posZ = z - length/2;
    const posY = y + height/2 - 0.5;
    body.position.set(x, posY, posZ);
    body.quaternion.setFromEuler(angle, 0, 0);
    game.world.addBody(body);

    const geo = new THREE.BoxGeometry(width, 1, rampLen);
    const mesh = new THREE.Mesh(geo, game.sharedMaterials.wood);
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    mesh.receiveShadow = true;
    game.scene.add(mesh);
    game.levelObjects.push({ mesh, body });
}

export function addPendulum(game, x, y, z, speedMult = 1) {
    const pivotHeight = y + 8;
    const ballSize = 1.6;
    const shape = new CANNON.Sphere(ballSize);
    const body = new CANNON.Body({ mass: 10, shape: shape });
    body.position.set(x, pivotHeight - 5, z);
    game.world.addBody(body);

    const geo = new THREE.SphereGeometry(ballSize, 20, 20);
    const mesh = new THREE.Mesh(geo, game.sharedMaterials.pendulum);
    game.scene.add(mesh);

    const linePoints = [new THREE.Vector3(x, pivotHeight, z), new THREE.Vector3(x, pivotHeight - 5, z)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    lineGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const line = new THREE.Line(lineGeo, game.sharedMaterials.rope);
    game.scene.add(line);

    const pend = { body, mesh, line, pivot: new THREE.Vector3(x, pivotHeight, z), startTime: _rand() * Math.PI * 2, speedMult };

    // Trail attachment
    try {
        const trailKeys = ['skeleton', 'zombie', 'eye', 'soldier2', 'venus', 'dragon', 'bowling_strike', 'easter', 'life', 'love'];
        for (const k of trailKeys) {
            const tmpl = game._trailModelPool && game._trailModelPool[k];
            if (!tmpl) continue;
            let trailInstance = null;
            if (tmpl.clone) {
                trailInstance = tmpl.clone(true);
                trailInstance.scale && trailInstance.scale.setScalar(0.45);
                trailInstance.traverse && trailInstance.traverse(c => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
            } else if (tmpl.isSprite) {
                trailInstance = tmpl.clone();
                trailInstance.scale.set(0.7, 0.7, 1);
            } else if (tmpl.isObject3D) {
                trailInstance = tmpl.clone(true);
                trailInstance.scale && trailInstance.scale.setScalar(0.45);
            }
            if (trailInstance) {
                trailInstance.position.set(body.position.x, body.position.y, body.position.z);
                trailInstance.frustumCulled = false;
                game.scene.add(trailInstance);
                pend.trail = trailInstance;
                break;
            }
        }
    } catch (e) { /* non-fatal */ }

    game.pendulums.push(pend);
}

export function addSpinner(game, x, y, z, speedMult = 1) {
    const barWidth = 8;
    const barThick = 0.3;
    const shape = new CANNON.Box(new CANNON.Vec3(barWidth/2, barThick/2, barThick/2));
    const body = new CANNON.Body({ mass: 0, shape: shape });
    body.position.set(x, y, z);
    game.world.addBody(body);

    const geo = new THREE.BoxGeometry(barWidth, barThick, barThick);
    const mesh = new THREE.Mesh(geo, game.sharedMaterials.spinner);
    game.scene.add(mesh);

    const s = { body, mesh, speedMult };

    // Trail attachment
    try {
        const trailKeys = ['skeleton', 'zombie', 'eye', 'soldier2', 'venus', 'dragon', 'bowling_strike', 'easter', 'life', 'love'];
        for (const k of trailKeys) {
            const tmpl = game._trailModelPool && game._trailModelPool[k];
            if (!tmpl) continue;
            let trailInstance = null;
            if (tmpl.clone) {
                trailInstance = tmpl.clone(true);
                trailInstance.scale && trailInstance.scale.setScalar(0.35);
                trailInstance.traverse && trailInstance.traverse(c => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
            } else if (tmpl.isSprite) {
                trailInstance = tmpl.clone();
                trailInstance.scale.set(0.5, 0.5, 1);
            }
            if (trailInstance) {
                trailInstance.position.set(body.position.x + barWidth/2 + 0.5, body.position.y, body.position.z);
                trailInstance.frustumCulled = false;
                game.scene.add(trailInstance);
                s.trail = trailInstance;
                break;
            }
        }
    } catch (e) {}

    game.spinners.push(s);
}

export function addHammer(game, x, y, z, speedMult = 1) {
    const hammerThick = 1.2;
    const hammerLen = 5;
    const shape = new CANNON.Box(new CANNON.Vec3(hammerLen/2, hammerThick/2, hammerThick/2));
    const body = new CANNON.Body({ mass: 0, shape: shape });
    body.position.set(x, y + 3, z);
    body.quaternion.setFromEuler(Math.PI/2, 0, 0);
    game.world.addBody(body);

    const geo = new THREE.BoxGeometry(hammerLen, hammerThick, hammerThick);
    const mesh = new THREE.Mesh(geo, game.sharedMaterials.hazard);
    game.scene.add(mesh);

    const h = { body, mesh, speedMult, pivotY: y + 3 };
    game.spinners.push(h); // reuse spinner system for rotation
}

export function addMover(game, x, y, z, w, h, d, sideways, speedMult = 1) {
    const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
    const body = new CANNON.Body({ mass: 0, shape: shape });
    body.position.set(x, y, z);
    game.world.addBody(body);

    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, game.sharedMaterials.hazard);
    game.scene.add(mesh);

    const range = 6;
    const m = { body, mesh, baseX: x, baseZ: z, sideways, range, speedMult };

    // Trail
    try {
        const trailKeys = ['skeleton', 'zombie', 'eye', 'soldier2', 'venus', 'dragon', 'bowling_strike', 'easter', 'life', 'love'];
        for (const k of trailKeys) {
            const tmpl = game._trailModelPool && game._trailModelPool[k];
            if (!tmpl) continue;
            let trailInstance = null;
            if (tmpl.clone) {
                trailInstance = tmpl.clone(true);
                trailInstance.scale && trailInstance.scale.setScalar(0.4);
            } else if (tmpl.isSprite) {
                trailInstance = tmpl.clone();
                trailInstance.scale.set(0.6, 0.6, 1);
            }
            if (trailInstance) {
                trailInstance.position.set(body.position.x, body.position.y + h/2 + 0.3, body.position.z);
                trailInstance.frustumCulled = false;
                game.scene.add(trailInstance);
                m.trail = trailInstance;
                break;
            }
        }
    } catch (e) {}

    game.movers.push(m);
}

export function addWall(game, x, y, z, w, l, rotZ) {
    const shape = new CANNON.Box(new CANNON.Vec3(w/2, 2, l/2));
    const body = new CANNON.Body({ mass: 0, shape: shape });
    body.position.set(x, y, z);
    if (rotZ) body.quaternion.setFromEuler(0, 0, rotZ);
    game.world.addBody(body);

    const geo = new THREE.BoxGeometry(w, 4, l);
    const mesh = new THREE.Mesh(geo, game.sharedMaterials.wall);
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    game.scene.add(mesh);
    game.levelObjects.push({ mesh, body });
}

const _coinGeoCache = {};
function getCachedCoinGeo(size) {
    const key = size.toFixed(3);
    if (!_coinGeoCache[key]) {
        _coinGeoCache[key] = new THREE.CylinderGeometry(size, size, 0.1, 12);
    }
    return _coinGeoCache[key];
}

export function addCoins(game, x, y, startZ, length, count) {
    for (let i = 0; i < count; i++) {
        const z = startZ - (i / Math.max(1, count - 1)) * length;
        const tier = weightedCoinTier();
        const geo = getCachedCoinGeo(tier.size);
        const coin = new THREE.Mesh(geo, game.sharedMaterials.coin);
        coin.position.set(x + (_rand() - 0.5) * 2, y + _rand() * 1.5, z);
        coin.rotation.x = Math.PI / 2;
        coin.userData = { value: tier.value, tier: tier.name, collected: false };
        game.scene.add(coin);
        game.coins.push(coin);
    }
}

function weightedCoinTier() {
    const r = _rand();
    if (r < 0.45) return { name: 'small', value: 2, size: 0.15 };
    if (r < 0.75) return { name: 'medium', value: 5, size: 0.22 };
    if (r < 0.92) return { name: 'large', value: 12, size: 0.3 };
    if (r < 0.98) return { name: 'big', value: 25, size: 0.4 };
    return { name: 'huge', value: 50, size: 0.55 };
}

export function addCheckpoint(game, x, y, z, width) {
    game.checkpoints.push({ x, y, z, width });
}

export function placeFinishModel(game) {
    if (!game.finishModel || game.finishZ === undefined) return;
    const model = game.finishModel.clone();
    model.position.set(game.finishX || 0, (game.finishY || 0), game.finishZ);
    model.scale.set(0.1, 0.1, 0.1);
    model.rotation.set(Math.PI / 2, 0, -Math.PI / 4);
    game.scene.add(model);
    game.levelObjects.push({ mesh: model });
}

export function triggerDropFromObstacle(game, obstacle, options = {}) {
    try {
        const baseLoss = options.baseLoss || 5;
        // levelMult is already applied by callers (physics.js obstacle collision checks)
        const drop = Math.min(game.saveData.totalCoins, Math.floor(baseLoss));
        if (drop <= 0) return;
        game.saveData.totalCoins -= drop;
        spawnDroppedCoins(game, obstacle.body ? obstacle.body.position : game.ballBody.position, drop);
    } catch (e) { /* non-fatal */ }
}

// --- Blade hazard ---
export function addBlade(game, x, y, z, thickness = 0.12, length = 2.0, swing = 1.0, vertical = false) {
    try {
        const bladeGeo = new THREE.BoxGeometry(thickness, length, 0.08);
        const bladeMat = new THREE.MeshPhongMaterial({ color: 0x222222, emissive: 0x661111, shininess: 60 });
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.set(x, y + length / 2, z);
        blade.frustumCulled = false;
        blade.userData = { oscill: Math.random() * Math.PI * 2, swing, vertical: !!vertical };
        game.scene.add(blade);
        game.levelObjects.push({ mesh: blade, blade: true });
        game.movers.push({ bladeMesh: blade, type: 'blade', basePos: new THREE.Vector3(x, y, z), offset: Math.random() * Math.PI, speedMult: 0.9 + Math.random() * 1.4 });
    } catch (e) {
        console.warn('addBlade failed', e);
    }
}

// --- Shockwave event ---
export function createShockwave(game, centerZ, intensity = 3) {
    try {
        const id = 'shockwave-overlay';
        let overlay = document.getElementById(id);
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = id;
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex = '20000';
            overlay.style.opacity = '0';
            overlay.style.background = 'radial-gradient(circle at 50% 40%, rgba(255,60,60,0.22), rgba(0,0,0,0))';
            document.body.appendChild(overlay);
        }
        overlay.style.transition = 'opacity 180ms ease';
        overlay.style.opacity = '1';
        setTimeout(() => { overlay.style.opacity = '0'; }, 220 + Math.floor(Math.random() * 120));

        // Debris particles
        const count = Math.min(18, 6 + Math.floor(intensity * 4));
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.style.cssText = `
                position:fixed;width:${4 + Math.floor(Math.random() * 8)}px;height:${4 + Math.floor(Math.random() * 8)}px;
                background:rgba(120,20,20,0.95);border-radius:2px;z-index:20001;pointer-events:none;opacity:1;
                left:${50 + (Math.random() - 0.5) * 40}%;top:${40 + (Math.random() - 0.5) * 40}%;
                transform:translate(-50%,-50%) scale(${0.6 + Math.random() * 1.6}) rotate(${Math.random() * 360}deg);
            `;
            document.body.appendChild(p);
            setTimeout(() => {
                p.style.transition = 'transform 900ms ease, opacity 700ms ease';
                p.style.transform += ` translate(${(Math.random() - 0.5) * 300}px, ${(Math.random() - 0.5) * 300}px)`;
                p.style.opacity = '0';
            }, 20 + Math.random() * 80);
            setTimeout(() => { try { p.remove(); } catch (e) {} }, 1200 + Math.random() * 800);
        }

        // Camera impulse
        game._shockwaveEnd = Math.max(game._shockwaveEnd || 0, Date.now()) + 380 + intensity * 40;
        game._shockwaveIntensity = Math.max(game._shockwaveIntensity || 0, intensity);
    } catch (e) {
        console.warn('createShockwave failed', e);
    }
}

// --- Infinite runner: spawn one procedural chunk ---
export function spawnInfiniteChunk(game) {
    const rand = () => (game.rnd ? game.rnd() : Math.random());
    const ds = game._difficultyScale || 0;

    // Scale hazard chance with difficulty
    const hazardChance = Math.min(0.92, 0.06 + ds * 0.004 + rand() * 0.08);
    const ampHazard = Math.min(0.98, hazardChance + ds * 0.006 + 0.06);

    // Occasional environmental events when difficulty is high
    if (ds > 60 && rand() < 0.08) {
        if (rand() < 0.5) {
            game.windy = true;
            game.wind = { dirX: (rand() - 0.5) * 2.5, strength: 1.2 + rand() * 1.6 };
            createWind(game);
            setTimeout(() => { clearWind(game); game.windy = false; }, 3000 + Math.floor(rand() * 2500));
        } else {
            game.raining = true;
            createRain(game);
            setTimeout(() => { clearRain(game); game.raining = false; }, 3000 + Math.floor(rand() * 3000));
        }
    }

    const pick = rand();
    const sz = game._spawnZ;

    if (pick < 0.10) {
        const len = 8 + Math.floor(rand() * 14);
        addPlatform(game, (rand() - 0.5) * 1.6, 0, sz - len / 2, Math.max(0.8, 2.6 - ds * 0.035), len);
        if (rand() < 0.9) addCoins(game, 0, 1.0 + rand() * 0.6, sz, len, 2 + (rand() < 0.35 ? 1 : 0));
        if (rand() < ampHazard) addMover(game, 0, 1, sz - len / 2, 3.2, 1.6, len, true, 1.2 + ds * 0.08);
        if (rand() < Math.min(0.85, 0.25 + ds * 0.022)) {
            const blades = 1 + Math.floor(rand() * 2);
            for (let b = 0; b < blades; b++) {
                addBlade(game, (rand() - 0.5) * 1.8, 1.2, sz - (len * (0.2 + rand() * 0.6)), 0.12 + rand() * 0.3, 2.2 + rand() * 1.8, 0.6 + rand() * 1.4);
            }
        }
        game._spawnZ -= len;
    } else if (pick < 0.30) {
        const rampL = 6 + Math.floor(rand() * 16);
        const rampH = 2 + Math.floor(rand() * 6);
        addRamp(game, (rand() - 0.5) * 1.8, 0, sz, 6, rampL, rampH);
        game._spawnZ -= rampL;
        if (rand() < Math.max(0.4, ampHazard)) addPendulum(game, (rand() - 0.5) * 2.2, 2 + rampH, sz + 4, 1.2 + ds * 0.045);
        if (rand() < Math.min(0.35, 0.12 + ds * 0.01)) createShockwave(game, sz + 2, 3 + Math.floor(rand() * 3));
    } else if (pick < 0.60) {
        const len = 14 + Math.floor(rand() * 18);
        const offX = (rand() - 0.5) * 3.2;
        addPlatform(game, offX, 0, sz - len / 2, 6.2, len);
        if (rand() < 0.8) addSpinner(game, offX, 0.6, sz - len / 2, 1.5 + ds * 0.05);
        if (rand() < 0.92) addCoins(game, offX, 1.2, sz, len, 3 + (rand() < 0.45 ? 1 : 0));
        if (rand() < ampHazard * 0.95) addMover(game, offX, 0.8, sz - len / 2, 2.4, 1.2, len * 0.7, false, 1 + ds * 0.05);
        if (rand() < 0.35 + Math.min(0.4, ds * 0.02)) addBlade(game, offX + (rand() - 0.5) * 1.6, 1.0 + rand() * 0.6, sz - len / 3, 0.16 + rand() * 0.22, 2.6 + rand() * 2.4, 0.9 + rand() * 1.8, true);
        game._spawnZ -= len;
    } else {
        if (rand() < 0.48) {
            const len = 10 + Math.floor(rand() * 10);
            const w = Math.max(0.7, 4 - ds * 0.06);
            addGlassPlatform(game, (rand() - 0.5) * 2.6, 0.2, sz - len / 2, w, len);
            if (rand() < 0.85) addCoins(game, (rand() - 0.5) * 2, 1.6, sz, len, 2 + (rand() < 0.25 ? 1 : 0));
            if (rand() < ampHazard * 0.65) addHammer(game, (rand() - 0.5) * 2.2, 0.6, sz - len / 2, 1.2 + ds * 0.03);
            if (rand() < ampHazard * 0.45) addBlade(game, (rand() - 0.5) * 2.1, 0.9, sz - len * 0.3, 0.12, 2.0, 0.5);
            game._spawnZ -= len;
        } else {
            const len = 20;
            const dir = rand() < 0.5 ? -1 : 1;
            const segs = 4;
            for (let s = 0; s < segs; s++) {
                addPlatform(game, dir * (s + 1) * 0.8, 0, sz - (len / segs) / 2, Math.max(1.6, 5 - ds * 0.05), len / segs);
                if (rand() < 0.7) addCoins(game, dir * (s + 1) * 0.8, 1.2, sz, len / segs, 1 + (rand() < 0.25 ? 1 : 0));
                if (rand() < ampHazard * 0.45) addMover(game, dir * (s + 1) * 0.8, 0.6, sz, 1.6, 1.0, len / segs, true, 1 + ds * 0.03);
                if (rand() < ampHazard * 0.25) addBlade(game, dir * (s + 1) * 0.8, 1.0, sz - (s * (len / segs)), 0.12, 1.6 + rand() * 1.2, 0.6);
                game._spawnZ -= len / segs;
            }
        }
    }

    // Occasional coin clusters
    if (rand() < Math.max(0.25, Math.min(0.8, 0.35 - ds * 0.0005 + rand() * 0.25))) {
        addCoins(game, (rand() - 0.5) * 2, 1.4, sz + 8, 6 + Math.floor(rand() * 6), 3);
    }

    // Increase difficulty
    game._difficultyScale += 1.2 + rand() * 2.2;

    // Visual difficulty cue: red fog tint
    if (!game._difficultyVisualTimer && ds > 45 && rand() < 0.18) {
        game._difficultyVisualTimer = Date.now();
        try { game._prevFogColor = game.scene.fog && game.scene.fog.color ? game.scene.fog.color.clone() : null; } catch (e) {}
        try {
            if (game.scene.fog) game.scene.fog.color.setHex(0x7f1a1a);
            else game.scene.fog = new THREE.Fog(0x7f1a1a, 20, 150);
            setTimeout(() => {
                try { if (game._prevFogColor && game.scene.fog) game.scene.fog.color.copy(game._prevFogColor); } catch (e) {}
                game._difficultyVisualTimer = 0;
            }, 2200);
        } catch (e) {}
    }
}

// --- Infinite runner mode: replaces finite level with procedural chunk spawning ---
export function createInfiniteLevel(game, seed) {
    try {
        if (typeof seed === 'number' && !Number.isNaN(seed)) {
            game._seed = seed >>> 0;
            game.rng = mulberry32(game._seed);
            game.rnd = () => game.rng();
        }
    } catch (e) {}

    clearLevel(game);
    game.lastCheckpointPos.set(0, 5, 0);
    game._spawnZ = -10;
    game._spawnAhead = 200;
    game._difficultyScale = 0;
    game._survivalStart = Date.now();
    game._isInfinite = true;

    // Initial corridor
    const rand = () => (game.rnd ? game.rnd() : Math.random());
    addPlatform(game, 0, 0, 0, 10, 18);
    for (let i = 0; i < 6; i++) {
        const len = 14 + Math.floor(rand() * 10);
        addPlatform(game, 0, 0, game._spawnZ - len / 2, 7 - Math.min(5, Math.floor(game._difficultyScale)), len);
        addCoins(game, 0, 1.2, game._spawnZ, len, 3);
        game._spawnZ -= len;
    }

    game.finishZ = -999999;
    game.score = 0;
    game.saveData.totalCoins = game.saveData.totalCoins || 0;
    game.levelLength = 500;
    game.startTime = Date.now();

    // Pre-fill chunks ahead
    while (Math.abs(game._spawnZ) < game._spawnAhead) {
        spawnInfiniteChunk(game);
    }
}

// --- Builder composite parts (not used by procedural generator, placed individually) ---

export function addLoopDeLoop(game, x, y, z, width = 6, radius = 8, segments = 12) {
    try {
        const segs = Math.max(8, Math.min(24, segments));
        const r = Math.max(4, Math.min(14, radius));
        const w = Math.max(2, Math.min(10, width));
        // Entrance ramp
        addRamp(game, x, y, z, w + 1, 6, Math.min(5, r * 0.5));
        let zOff = z - 6;
        for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const px = Math.cos(a) * r;
            addPlatform(game, x + px, y + Math.sin(a) * 2, zOff, w * 0.9, 4);
            zOff -= 4;
        }
        // Exit ramp
        addRamp(game, x, y, zOff, w + 1, 8, Math.min(4, r * 0.35));
    } catch (e) {
        console.warn('addLoopDeLoop failed', e);
    }
}

export function addSpiralTube(game, x, y, z, width = 6, radius = 8, turns = 2, segments = 16) {
    try {
        const segs = Math.max(8, Math.min(24, segments));
        const r = Math.max(4, Math.min(12, radius));
        const t = Math.max(1, Math.min(3, turns));
        const w = Math.max(2, Math.min(10, width));
        let zOff = z;
        for (let i = 0; i < segs; i++) {
            const angle = (i / segs) * (Math.PI * 2 * t);
            const rr = r * (1 - (i / segs) * 0.5);
            const px = Math.cos(angle) * rr;
            const yOff = (i / segs) * 5;
            addPlatform(game, x + px, y + yOff, zOff, w * 0.85, 5);
            addWall(game, x + px - w / 2 - 0.5, y + yOff + 0.5, zOff, 0.3, 5, 0);
            addWall(game, x + px + w / 2 + 0.5, y + yOff + 0.5, zOff, 0.3, 5, 0);
            zOff -= 5;
        }
    } catch (e) {
        console.warn('addSpiralTube failed', e);
    }
}

export function addSpringPad(game, x, y, z, width = 4, length = 4, bouncePower = 15) {
    try {
        const w = Math.max(2, Math.min(8, width));
        const l = Math.max(2, Math.min(8, length));
        addPlatform(game, x, y, z, w, l, 0xff8800);
        // Visual spring coil indicator
        const coilGeo = new THREE.TorusGeometry(w * 0.35, 0.15, 8, 12);
        const coilMat = new THREE.MeshPhongMaterial({ color: 0xff6600, emissive: 0x331100, shininess: 80 });
        const coil = new THREE.Mesh(coilGeo, coilMat);
        coil.position.set(x, y + 0.65, z);
        coil.rotation.x = Math.PI / 2;
        coil.userData = { isSpringPad: true, bouncePower };
        game.scene.add(coil);
        game.levelObjects.push({ mesh: coil, body: null, springPad: true, bouncePower, x, y, z, width: w, length: l });
    } catch (e) {
        console.warn('addSpringPad failed', e);
    }
}export function addCurve(game, x, y, z, width = 6, arcLength = 8, segments = 8, direction = 1) {
    try {
        const segs = Math.max(4, Math.min(16, segments));
        const arc = Math.max(2, Math.min(20, arcLength));
        const dir = direction >= 0 ? 1 : -1;
        const w = Math.max(2, Math.min(10, width));
        const stepLen = 5;
        let zOff = z;
        for (let i = 0; i < segs; i++) {
            const angle = (i / segs) * (Math.PI / 2) * dir;
            const offX = Math.sin(angle) * arc;
            const curX = x + offX;
            addPlatform(game, curX, y, zOff, w, stepLen);
            zOff -= stepLen;
        }
    } catch (e) {
        console.warn('addCurve failed', e);
    }
}

export function addStairs(game, x, y, z, width = 6, stepCount = 5, stepLength = 4, stepHeight = 0.8) {
    try {
        const count = Math.max(2, Math.min(12, stepCount));
        const sLen = Math.max(2, Math.min(8, stepLength));
        const sH = Math.max(0.3, Math.min(2, stepHeight));
        const w = Math.max(2, Math.min(10, width));
        let zOff = z;
        let curY = y;
        for (let i = 0; i < count; i++) {
            addPlatform(game, x, curY, zOff - sLen / 2, w + 1, sLen);
            zOff -= sLen;
            curY += sH;
        }
    } catch (e) {
        console.warn('addStairs failed', e);
    }
}

export function addPortalRing(game, x, y, z, radius = 2) {
    try {
        const r = Math.max(1, Math.min(5, radius));
        const ringGeo = new THREE.TorusGeometry(r, 0.15, 12, 24);
        const ringMat = new THREE.MeshPhongMaterial({
            color: 0x8844ff,
            emissive: 0x220066,
            shininess: 100,
            transparent: true,
            opacity: 0.85
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(x, y + r, z);
        ring.userData = { isPortal: true, portalRadius: r };
        game.scene.add(ring);
        game.levelObjects.push({ mesh: ring, body: null, portal: true, x, y, z, radius: r });

        // Inner glow disc
        const discGeo = new THREE.CircleGeometry(r * 0.85, 24);
        const discMat = new THREE.MeshBasicMaterial({
            color: 0x9966ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.35,
            depthWrite: false
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.position.set(x, y + r, z + 0.1);
        disc.rotation.x = Math.PI / 2;
        game.scene.add(disc);
        game.levelObjects.push({ mesh: disc, body: null });
    } catch (e) {
        console.warn('addPortalRing failed', e);
    }
}

export function addHalfPipe(game, x, y, z, width = 10, length = 20) {
    try {
        const w = Math.max(6, Math.min(16, width));
        const l = Math.max(8, Math.min(40, length));
        addPlatform(game, x, y, z, w, l);
        const wallAngle = Math.PI / 4;
        const wallW = 0.3;
        const wallH = 2.5;
        addWall(game, x - w / 2 - 0.3, y + wallH / 2, z, wallW, l, wallAngle);
        addWall(game, x + w / 2 + 0.3, y + wallH / 2, z, wallW, l, -wallAngle);
    } catch (e) {
        console.warn('addHalfPipe failed', e);
    }
}

export function addCheckerboard(game, x, y, z, tileSize = 3, rows = 4) {
    try {
        const size = Math.max(2, Math.min(6, tileSize));
        const count = Math.max(2, Math.min(8, rows));
        let zOff = z;
        for (let r = 0; r < count; r++) {
            const offX = (r % 2 === 0) ? -size : size;
            addPlatform(game, x + offX, y, zOff - size / 2, size, size);
            zOff -= size + 2;
        }
    } catch (e) {
        console.warn('addCheckerboard failed', e);
    }
}

// --- Play a community track directly (main menu usage) ---

export function playCommunityTrack(game, parts) {
    try {
        clearLevel(game);
        game.lastCheckpointPos.set(0, 5, 0);
        game._isInfinite = false;
        game.finishZ = undefined;
        game.score = 0;
        game.currentLevel = 1;
        game.levelLength = 500;
        game.isGameOver = false;
        game.isWin = false;
        game.ballBody.position.set(0, 1, 0);
        game.ballBody.velocity.set(0, 0, 0);
        game.ballMesh.position.copy(game.ballBody.position);

        for (const placed of parts) {
            const p = placed.params || {};
            switch (placed.partKey) {
                case 'platform': case 'speed_strip': case 'finish_line':
                    addPlatform(game, placed.x, placed.y, placed.z, p.width || 8, p.length || 15, p.color || null); break;
                case 'ramp':
                    addRamp(game, placed.x, placed.y, placed.z, p.width || 8, p.length || 15, p.height || 5); break;
                case 'glass_platform':
                    addGlassPlatform(game, placed.x, placed.y, placed.z, p.width || 6, p.length || 14); break;
                case 'wall':
                    addWall(game, placed.x, placed.y, placed.z, p.width || 1, p.length || 20, p.rotZ || 0); break;
                case 'tunnel_walls':
                    addTunnelWalls(game, placed.x, placed.y, placed.z, p.width || 8, p.length || 30); break;
                case 'pendulum':
                    addPendulum(game, placed.x, placed.y, placed.z, p.speedMult || 1.0); break;
                case 'spinner':
                    addSpinner(game, placed.x, placed.y, placed.z, p.speedMult || 1.0); break;
                case 'hammer':
                    addHammer(game, placed.x, placed.y, placed.z, p.speedMult || 1.0); break;
                case 'mover':
                    addMover(game, placed.x, placed.y, placed.z, p.width || 3, p.height || 1, p.depth || 2, p.sideways || false, p.speedMult || 1.0); break;
                case 'blade':
                    addBlade(game, placed.x, placed.y, placed.z, p.thickness || 0.12, p.length || 2.0, p.swing || 1.0, p.vertical || false); break;
                case 'coin_line':
                    addCoins(game, placed.x, placed.y + 1, placed.z, p.length || 20, p.count || 5); break;
                case 'checkpoint':
                    addCheckpoint(game, placed.x, placed.y, placed.z, p.width || 8); break;
                case 'finish_model':
                    game.finishZ = placed.z; game.finishX = placed.x; game.finishY = placed.y; break;
                case 'loop_de_loop':
                    addLoopDeLoop(game, placed.x, placed.y, placed.z, p.width || 6, p.radius || 8, p.segments || 12); break;
                case 'spiral_tube':
                    addSpiralTube(game, placed.x, placed.y, placed.z, p.width || 6, p.radius || 8, p.turns || 2, p.segments || 16); break;
                case 'spring_pad':
                    addSpringPad(game, placed.x, placed.y, placed.z, p.width || 4, p.length || 4, p.bouncePower ?? 15); break;
                case 'curve':
                    addCurve(game, placed.x, placed.y, placed.z, p.width || 6, p.arcLength || 8, p.segments || 8, p.direction ?? 1); break;
                case 'stairs':
                    addStairs(game, placed.x, placed.y, placed.z, p.width || 6, p.stepCount || 5, p.stepLength || 4, p.stepHeight || 0.8); break;
                case 'portal_ring':
                    addPortalRing(game, placed.x, placed.y, placed.z, p.radius || 2); break;
                case 'half_pipe':
                    addHalfPipe(game, placed.x, placed.y, placed.z, p.width || 10, p.length || 20); break;
                case 'checkerboard':
                    addCheckerboard(game, placed.x, placed.y, placed.z, p.tileSize || 3, p.rows || 4); break;
                case 'glass_loop':
                    addGlassLoopDeLoop(game, placed.x, placed.y, placed.z, p.width || 6, p.radius || 8, p.segments || 12); break;
                case 'glass_stairs':
                    addGlassStairs(game, placed.x, placed.y, placed.z, p.width || 6, p.stepCount || 5, p.stepLength || 4, p.stepHeight || 0.8); break;
                case 'glass_curve':
                    addGlassCurve(game, placed.x, placed.y, placed.z, p.width || 6, p.arcLength || 8, p.segments || 8, p.direction ?? 1); break;
            }
        }
        game.startTime = Date.now();
    } catch (e) {
        console.warn('playCommunityTrack failed', e);
    }
}

// --- Glass variants of composite parts ---

export function addGlassLoopDeLoop(game, x, y, z, width = 6, radius = 8, segments = 12) {
    try {
        const segs = Math.max(8, Math.min(24, segments));
        const r = Math.max(4, Math.min(14, radius));
        const w = Math.max(2, Math.min(10, width));
        addRamp(game, x, y, z, w + 1, 6, Math.min(5, r * 0.5));
        let zOff = z - 6;
        for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const px = Math.cos(a) * r;
            addGlassPlatform(game, x + px, y + Math.sin(a) * 2 + 0.2, zOff, w * 0.8, 4);
            zOff -= 4;
        }
        addRamp(game, x, y, zOff, w + 1, 8, Math.min(4, r * 0.35));
    } catch (e) {
        console.warn('addGlassLoopDeLoop failed', e);
    }
}

export function addGlassStairs(game, x, y, z, width = 6, stepCount = 5, stepLength = 4, stepHeight = 0.8) {
    try {
        const count = Math.max(2, Math.min(12, stepCount));
        const sLen = Math.max(2, Math.min(8, stepLength));
        const sH = Math.max(0.3, Math.min(2, stepHeight));
        const w = Math.max(2, Math.min(10, width));
        let zOff = z;
        let curY = y;
        for (let i = 0; i < count; i++) {
            addGlassPlatform(game, x, curY + 0.2, zOff - sLen / 2, w * 0.8, sLen);
            zOff -= sLen;
            curY += sH;
        }
    } catch (e) {
        console.warn('addGlassStairs failed', e);
    }
}

export function addGlassCurve(game, x, y, z, width = 6, arcLength = 8, segments = 8, direction = 1) {
    try {
        const segs = Math.max(4, Math.min(16, segments));
        const arc = Math.max(2, Math.min(20, arcLength));
        const dir = direction >= 0 ? 1 : -1;
        const w = Math.max(2, Math.min(10, width));
        const stepLen = 5;
        let zOff = z;
        for (let i = 0; i < segs; i++) {
            const angle = (i / segs) * (Math.PI / 2) * dir;
            const offX = Math.sin(angle) * arc;
            const curX = x + offX;
            addGlassPlatform(game, curX, y + 0.2, zOff, w * 0.8, stepLen);
            zOff -= stepLen;
        }
    } catch (e) {
        console.warn('addGlassCurve failed', e);
    }
}

export function spawnDroppedCoins(game, worldPos, totalValue) {
    try {
        const coinCount = Math.min(20, Math.max(3, Math.floor(totalValue / 2)));
        const pos = worldPos instanceof CANNON.Vec3
            ? new THREE.Vector3(worldPos.x, worldPos.y + 1, worldPos.z)
            : new THREE.Vector3(worldPos.x, worldPos.y + 1, worldPos.z);
        for (let i = 0; i < coinCount; i++) {
            const geo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8);
            const coin = new THREE.Mesh(geo, game.sharedMaterials.coin);
            coin.position.set(
                pos.x + (_rand() - 0.5) * 3,
                pos.y + _rand() * 2,
                pos.z + (_rand() - 0.5) * 3
            );
            coin.rotation.x = Math.PI / 2;
            coin.userData = { value: Math.max(1, Math.floor(totalValue / coinCount)), tier: 'dropped', collected: false, dropped: true, life: 8 };
            game.scene.add(coin);
            game.coins.push(coin);
        }
    } catch (e) {}
}
