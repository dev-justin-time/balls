/*
 Persistence + Data module.
 Exports: initPersistence(game), saveGame(game), getParticleCount(game, type, defaultCount)

 Handles: localStorage save/load, RNG seeding, ball/sky/powerup configs,
 weather AI, BALL_DB merging, particle count estimation.
*/
import { BALL_DB } from './ball_db.js';

// Mulberry32 seeded RNG
export function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function initPersistence(game) {
    // --- RNG Setup ---
    game.rng = null;
    game.rnd = () => (game.rng ? game.rng() : Math.random());

    // Read optional seed from URL param ?seed=12345
    try {
        if (typeof window !== 'undefined' && window.location && window.location.search) {
            const params = new URLSearchParams(window.location.search);
            const s = params.get('seed');
            if (s !== null) {
                const parsed = parseInt(s, 10);
                if (!Number.isNaN(parsed)) {
                    game._seed = parsed;
                    game.rng = mulberry32(parsed >>> 0);
                    console.info('Deterministic seed enabled:', parsed);
                }
            }
        }
    } catch (e) { /* ignore URL parsing failures */ }

    // --- Default save data ---
    const defaultData = {
        totalCoins: 0,
        unlockedBalls: ['rainbow'],
        unlockedSkies: ['day'],
        selectedBall: 'rainbow',
        selectedSky: 'day',
        skinLevels: { rainbow: 1 },
        powerups: {},
        weatherPrefs: {
            lastWeather: 'clear',
            bias: {}
        }
    };
    try {
        const raw = localStorage.getItem('goingBallsData_v1');
        game.saveData = raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.warn('Failed to parse saved data, using defaults', e);
        game.saveData = null;
    }
    if (!game.saveData || typeof game.saveData !== 'object') game.saveData = defaultData;

    // --- Ball configs (single source of truth: ball_db.js) ---
    game.ballConfigs = (BALL_DB && typeof BALL_DB === 'object') ? { ...BALL_DB } : {};

    // --- Powerup configs ---
    game.powerupConfigs = {
        magnet: { name: 'Magnet', price: 180, rarity: 'common', maxLevel: 5, description: 'Attract nearby coins within short range; higher levels increase radius and pull strength.' },
        turbo:  { name: 'Turbo',  price: 300, rarity: 'uncommon', maxLevel: 5, description: 'Short burst of speed when activated; levels increase duration and multiplier.' },
        shield: { name: 'Shield', price: 420, rarity: 'rare', maxLevel: 5, description: 'Absorb one fall/hazard hit; level increases durability/time.' },
        x2coins:{ name: 'Coin Doubler', price: 500, rarity: 'epic', maxLevel: 3, description: 'Temporarily doubles coin pickup value; higher levels lengthen duration.' }
    };

    // --- Sky configs ---
    game.skyConfigs = {
        day:    { name: 'Blue Sky',    price: 0,   tex: 'assets/image/sky_day.webp',    color: 0x87ceeb },
        sunset: { name: 'Sunset',      price: 100, tex: 'assets/image/sky_sunset.webp', color: 0xff7f50 },
        night:  { name: 'Midnight',    price: 250, tex: 'assets/image/sky_night.webp',  color: 0x0a0a2a },
        void:   { name: 'Cosmic',      price: 500, tex: 'assets/image/sky_void.webp',   color: 0x000000 },
        clouds: { name: 'Cloudscape',  price: 80,  tex: 'assets/image/1eprhbtmvoo51.webp', color: 0xddeeff },
        mosaic: { name: 'Rainbow Mosaic', price: 300, tex: 'assets/image/dsfk.webp', color: 0x223344 },
        aurora: { name: 'Aurora Glow', price: 800, tex: 'assets/image/sky_void.webp', color: 0x055e7f },
        retro:  { name: 'Retro Sunset', price: 200, tex: 'assets/image/sky_sunset.webp', color: 0xffb07a },
        // --- New sky types with conditions & bonuses (#8) ---
        storm:  { name: 'Storm Front', price: 600, tex: 'assets/image/sky_night.webp', color: 0x1a1a3a, conditions: { coinBonus: 1.3, rainChance: 0.9, windChance: 0.5 } },
        inferno:{ name: 'Inferno',      price: 1200, tex: 'assets/image/sky_sunset.webp', color: 0x2a0a00, conditions: { coinBonus: 1.5, speedBoost: 1.15, heatHaze: true, fireSparks: true } },
        frost:  { name: 'Frostbite',   price: 700, tex: 'assets/image/sky_void.webp', color: 0xddeeff, conditions: { coinBonus: 1.4, snowAlways: true, icePatches: true } },
        voidstorm:{ name: 'Void Storm', price: 2500, tex: 'assets/image/sky_void.webp', color: 0x000020, conditions: { coinBonus: 2.0, speedDebuff: 0.85, windChance: 1.0, meteorHazards: true } }
    };

    // --- Weather AI ---
    game.weatherTypes = ['clear', 'rain', 'wind', 'snow', 'mixed'];
    game.weatherAI = {
        chooseWeather: (level) => {
            const bias = game.saveData.weatherPrefs && game.saveData.weatherPrefs.bias ? game.saveData.weatherPrefs.bias : {};
            const base = game.weatherTypes.map(w => {
                let score = 1;
                if (w === 'rain' && level % 5 === 0) score += 2;
                if (w === 'wind' && level % 7 === 0) score += 2;
                if (w === 'snow' && level > 8 && level % 6 === 0) score += 1.5;
                if (w === 'mixed' && level > 12) score += 1;
                score += (bias[w] || 0) * 0.2;
                return score;
            });
            const total = base.reduce((s, v) => s + v, 0);
            let r = Math.random() * total;
            for (let i = 0; i < base.length; i++) {
                if (r < base[i]) return game.weatherTypes[i];
                r -= base[i];
            }
            return 'clear';
        },
        recordWeather: (w) => {
            game.saveData.weatherPrefs = game.saveData.weatherPrefs || { bias: {}, lastWeather: 'clear' };
            game.saveData.weatherPrefs.lastWeather = w;
            game.saveData.weatherPrefs.bias[w] = (game.saveData.weatherPrefs.bias[w] || 0) + 1;
            const keys = Object.keys(game.saveData.weatherPrefs.bias);
            if (keys.length > 10) {
                keys.forEach(k => game.saveData.weatherPrefs.bias[k] = Math.max(0, game.saveData.weatherPrefs.bias[k] - 1));
            }
            saveGame(game);
        }
    };
}

export function saveGame(game) {
    localStorage.setItem('goingBallsData_v1', JSON.stringify(game.saveData));
}

export function getParticleCount(game, type, defaultCount) {
    try {
        const hc = navigator.hardwareConcurrency || 2;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
        const area = (window && window.innerWidth && window.innerHeight) ? (window.innerWidth * window.innerHeight) : 1280 * 720;
        let quality = 1.0;
        if (isMobile) quality *= 0.45;
        if (hc <= 2) quality *= 0.6;
        else if (hc <= 4) quality *= 0.8;
        const areaFactor = Math.min(1.5, Math.max(0.6, area / (1280 * 720)));
        quality *= areaFactor;
        quality = Math.max(0.15, Math.min(1.0, quality));
        let typeBias = 1.0;
        if (type === 'rain') typeBias = 1.0;
        else if (type === 'snow') typeBias = 0.6;
        else if (type === 'wind') typeBias = 0.35;
        else if (type === 'fire') typeBias = 0.55;
        else if (type === 'heat') typeBias = 0.6;
        else if (type === 'meteor') typeBias = 0.45;
        const scaled = Math.round(defaultCount * quality * typeBias);
        const minByType = { rain: 120, snow: 80, wind: 20, fire: 40, heat: 50, meteor: 3 };
        const min = minByType[type] || 30;
        return Math.max(min, Math.min(defaultCount, scaled));
    } catch (e) {
        return defaultCount;
    }
}
