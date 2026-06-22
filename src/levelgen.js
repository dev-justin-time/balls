/*
 Level Generation module.
 Exports: createLevel(game, seed), clearLevel(game),
 addPlatform(game, ...), addRamp(game, ...), addCoins(game, ...),
 addPendulum(game, ...), addSpinner(game, ...), addHammer(game, ...),
 addMover(game, ...), addWall(game, ...), addTunnelWalls(game, ...),
 addGlassPlatform(game, ...), addCheckpoint(game, ...),
 placeFinishModel(game), spawnDroppedCoins(game, worldPos, totalValue),
 triggerDropFromObstacle(game, obstacle, options).

 Contains the full procedural level generator with ~40+ segment types,
 difficulty tiers, weather integration, checkpoint system, and coin spawning.
*/
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mulberry32, getParticleCount, saveGame } from './persistence.js';
import { applySkyConfig } from '../engine/scene.js';
import { createRain, clearRain, createWind, clearWind, createFireSparks, clearFireSparks, createHeatShimmer, clearHeatShimmer, createMeteors, clearMeteors } from './physics.js';

/** Module-level RNG used by all helper functions. Overridden by createLevel() with a seeded RNG, restored afterward. */
let _rand = Math.random.bind(Math);

export function clearLevel(game) {
    game.levelObjects.forEach(obj => {
        if (obj.body) game.world.removeBody(obj.body);
        if (obj.mesh) game.scene.remove(obj.mesh);
    });
    game.coins.forEach(coin => game.scene.remove(coin));
    game.pendulums.forEach(p => {
        if (p.body) game.world.removeBody(p.body);
        game.scene.remove(p.mesh);
        if (p.line) game.scene.remove(p.line);
    });
    game.spinners.forEach(s => {
        if (s.body) game.world.removeBody(s.body);
        game.scene.remove(s.mesh);
    });
    game.movers.forEach(m => {
        if (m.body) game.world.removeBody(m.body);
        game.scene.remove(m.mesh);
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
    for (let t of difficultyTiers) {
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
            const underMat = game.sharedMaterials.neon.clone ? game.sharedMaterials.neon : game.sharedMaterials.neon;
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

export function addCoins(game, x, y, startZ, length, count) {
    for (let i = 0; i < count; i++) {
        const z = startZ - (i / Math.max(1, count - 1)) * length;
        const tier = weightedCoinTier();
        const geo = new THREE.CylinderGeometry(tier.size, tier.size, 0.1, 12);
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
        const levelMult = 1 + (game.currentLevel - 1) * 0.1;
        const drop = Math.min(game.saveData.totalCoins, Math.floor(baseLoss * levelMult));
        if (drop <= 0) return;
        game.saveData.totalCoins -= drop;
        spawnDroppedCoins(game, obstacle.body ? obstacle.body.position : game.ballBody.position, drop);
    } catch (e) { /* non-fatal */ }
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
