/**
 * Tests for src/persistence.js
 * - mulberry32 determinism
 * - localStorage save/load roundtrip
 * - initPersistence defaults and URL seed parsing
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mulberry32, initPersistence, saveGame, getParticleCount } from '../src/persistence.js';

// --- mulberry32 ---

describe('mulberry32', () => {
  it('should produce a deterministic sequence for a given seed', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);

    const seq1 = Array.from({ length: 20 }, () => rng1());
    const seq2 = Array.from({ length: 20 }, () => rng2());

    expect(seq1).toEqual(seq2);
  });

  it('should produce different sequences for different seeds', () => {
    const rng1 = mulberry32(1);
    const rng2 = mulberry32(2);

    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());

    expect(seq1).not.toEqual(seq2);
  });

  it('should produce values in [0, 1)', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('should produce at least 1000 unique values out of 10000 (no repeats)', () => {
    // Ensures it's not just cycling through a tiny set.
    const rng = mulberry32(99);
    const seen = new Set();
    for (let i = 0; i < 10000; i++) {
      seen.add(rng());
    }
    expect(seen.size).toBeGreaterThan(990);
  });
});

// --- initPersistence / saveGame ---

describe('persistence lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize with default data when localStorage is empty', () => {
    const game = {};
    initPersistence(game);

    expect(game.saveData).toBeDefined();
    expect(game.saveData.totalCoins).toBe(0);
    expect(game.saveData.selectedBall).toBe('rainbow');
    expect(game.saveData.selectedSky).toBe('day');
    expect(game.saveData.unlockedBalls).toContain('rainbow');
    expect(game.saveData.unlockedSkies).toContain('day');
    expect(game.saveData.skinLevels).toEqual({ rainbow: 1 });
    expect(game.saveData.powerups).toEqual({});
  });

  it('should load persisted data from localStorage', () => {
    const custom = {
      totalCoins: 500,
      unlockedBalls: ['rainbow', 'zombie'],
      selectedBall: 'zombie',
      selectedSky: 'night',
      skinLevels: { rainbow: 3, zombie: 1 },
      powerups: { magnet: 2 },
      weatherPrefs: { lastWeather: 'rain', bias: { rain: 3 } },
    };
    localStorage.setItem('goingBallsData_v1', JSON.stringify(custom));

    const game = {};
    initPersistence(game);

    expect(game.saveData.totalCoins).toBe(500);
    expect(game.saveData.selectedBall).toBe('zombie');
    expect(game.saveData.selectedSky).toBe('night');
    expect(game.saveData.unlockedBalls).toEqual(['rainbow', 'zombie']);
    expect(game.saveData.skinLevels.zombie).toBe(1);
    expect(game.saveData.skinLevels.rainbow).toBe(3);
    expect(game.saveData.powerups.magnet).toBe(2);
  });

  it('saveGame should persist data and initPersistence should read it back', () => {
    const game = {};
    initPersistence(game);

    game.saveData.totalCoins = 999;
    game.saveData.unlockedBalls.push('alien');
    saveGame(game);

    const game2 = {};
    initPersistence(game2);

    expect(game2.saveData.totalCoins).toBe(999);
    expect(game2.saveData.unlockedBalls).toContain('alien');
  });

  it('should handle corrupted localStorage gracefully', () => {
    localStorage.setItem('goingBallsData_v1', 'not-json{{{');

    const game = {};
    initPersistence(game);

    // Should fall back to defaults
    expect(game.saveData.totalCoins).toBe(0);
    expect(game.saveData.selectedBall).toBe('rainbow');
  });

  it('should set up ballConfigs from BALL_DB', () => {
    const game = {};
    initPersistence(game);

    expect(game.ballConfigs).toBeDefined();
    expect(typeof game.ballConfigs).toBe('object');
    // Should contain rainbow (the default)
    expect(game.ballConfigs.rainbow).toBeDefined();
  });

  it('should set up skyConfigs with expected keys', () => {
    const game = {};
    initPersistence(game);

    expect(game.skyConfigs).toBeDefined();
    expect(game.skyConfigs.day).toBeDefined();
    expect(game.skyConfigs.night).toBeDefined();
    expect(game.skyConfigs.sunset).toBeDefined();
    expect(game.skyConfigs.void).toBeDefined();
  });

  it('should set up powerupConfigs with expected keys', () => {
    const game = {};
    initPersistence(game);

    expect(game.powerupConfigs).toBeDefined();
    expect(game.powerupConfigs.magnet).toBeDefined();
    expect(game.powerupConfigs.turbo).toBeDefined();
    expect(game.powerupConfigs.shield).toBeDefined();
    expect(game.powerupConfigs.x2coins).toBeDefined();
  });

  it('should set up weatherAI with chooseWeather and recordWeather', () => {
    const game = {};
    initPersistence(game);

    expect(game.weatherAI).toBeDefined();
    expect(typeof game.weatherAI.chooseWeather).toBe('function');
    expect(typeof game.weatherAI.recordWeather).toBe('function');
  });

  it('should parse URL seed parameter', () => {
    // Simulate a ?seed=42 URL
    vi.stubGlobal('window', {
      location: { search: '?seed=42' },
    });
    const game = {};
    initPersistence(game);

    expect(game._seed).toBe(42);
    expect(game.rng).toBeDefined();
    expect(typeof game.rng).toBe('function');
    expect(typeof game.rnd).toBe('function');
  });
});

// --- getParticleCount ---

describe('getParticleCount', () => {
  it('should return a number within expected bounds', () => {
    const result = getParticleCount({}, 'rain', 600);
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(30);
    expect(result).toBeLessThanOrEqual(600);
  });

  it('should scale down for mobile user agents', () => {
    vi.stubGlobal('navigator', {
      hardwareConcurrency: 8,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    });
    const result = getParticleCount({}, 'rain', 600);
    expect(result).toBeLessThan(600);
  });
});
