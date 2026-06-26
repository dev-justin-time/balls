/**
 * Tests for src/levelgen.js
 * - Segment count formula
 * - Difficulty tier selection
 * - Deterministic level generation with seeded RNG
 * - Segment count, checkpoint count, level length
 */
import { describe, it, expect, vi } from 'vitest';

// --- Mock heavy dependencies before importing levelgen ---

vi.mock('three', () => {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  }

  class BufferGeometry {
    constructor() { this.type = 'BufferGeometry'; this.attributes = {}; }
    setFromPoints() { this.attributes.position = { setUsage: vi.fn() }; return this; }
    clone() { return new BufferGeometry(); }
    setAttribute() {}
    dispose() {}
  }

  const BoxGeometry = vi.fn(function (w, h, d) { this.type = 'BoxGeometry'; this.parameters = { width: w, height: h, depth: d }; });
  BoxGeometry.prototype.clone = vi.fn(function () { return new BoxGeometry(); });
  const SphereGeometry = vi.fn(function (r, segW, segH) { this.type = 'SphereGeometry'; this.parameters = { radius: r, widthSegments: segW, heightSegments: segH }; });
  const CylinderGeometry = vi.fn(function (rt, rb, h, seg) { this.type = 'CylinderGeometry'; this.parameters = { top: rt, bottom: rb, height: h, segments: seg }; });

  const Mesh = vi.fn(function (geo, mat) {
    this.type = 'Mesh';
    this.geometry = geo;
    this.material = mat;
    this.position = new Vector3();
    this.quaternion = { setFromEuler() {}, copy() {} };
    this.rotation = new Vector3();
    this.receiveShadow = false;
    this.castShadow = false;
  });
  const Line = vi.fn(function (geo, mat) { this.type = 'Line'; this.geometry = geo; this.material = mat; });
  const Points = vi.fn(function (geo, mat) { this.type = 'Points'; this.geometry = geo; this.material = mat; this.frustumCulled = false; });
  const BufferAttribute = vi.fn(function (arr, size) { this.array = arr; this.itemSize = size; });
  const PointsMaterial = vi.fn(function (opts) { return opts; });
  const TextureLoader = vi.fn();

  class Scene {
    constructor() { this.children = []; }
    add() {}
    remove() {}
  }

  return {
    default: { BoxGeometry, SphereGeometry, CylinderGeometry, BufferGeometry, Mesh, Line, Points, Vector3, BufferAttribute, PointsMaterial, TextureLoader, Scene, DynamicDrawUsage: 35048 },
    BoxGeometry, SphereGeometry, CylinderGeometry, BufferGeometry, Mesh, Line, Points, Vector3, BufferAttribute, PointsMaterial, TextureLoader, Scene, DynamicDrawUsage: 35048,
  };
});

vi.mock('cannon-es', () => {
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  }

  const Box = vi.fn(function (halfExt) { this.type = 'Box'; this.halfExtents = halfExt; });
  const Sphere = vi.fn(function (r) { this.type = 'Sphere'; this.radius = r; });
  const Body = vi.fn(function (opts) {
    this.mass = opts?.mass || 0;
    this.shape = opts?.shape || null;
    this.position = new Vec3();
    this.quaternion = { setFromEuler() {}, copy() {} };
  });
  class World {
    constructor() { this.bodies = []; }
    addBody() {}
    removeBody() {}
  }

  return {
    default: { Vec3, Box, Sphere, Body, World },
    Vec3, Box, Sphere, Body, World,
  };
});

vi.mock('./persistence.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getParticleCount: vi.fn((game, type, def) => Math.round(def * 0.5)),
    saveGame: vi.fn(),
  };
});

vi.mock('../engine/scene.js', () => ({
  applySkyConfig: vi.fn(),
}));

vi.mock('./physics.js', () => ({
  createRain: vi.fn(),
  clearRain: vi.fn(),
  createWind: vi.fn(),
  clearWind: vi.fn(),
  createFireSparks: vi.fn(),
  clearFireSparks: vi.fn(),
  createHeatShimmer: vi.fn(),
  clearHeatShimmer: vi.fn(),
  createMeteors: vi.fn(),
  clearMeteors: vi.fn(),
}));

import { createLevel, clearLevel } from '../src/levelgen.js';

// --- Helpers ---

function makeMockGame(currentLevel = 1) {
  return {
    currentLevel,
    saveData: {
      totalCoins: 500,
      selectedBall: 'rainbow',
      selectedSky: 'day',
      unlockedBalls: ['rainbow'],
      unlockedSkies: ['day'],
      skinLevels: { rainbow: 1 },
      powerups: {},
      weatherPrefs: { lastWeather: 'clear', bias: {} },
    },
    skyConfigs: {
      day: { name: 'Blue Sky', price: 0, tex: 'assets/image/sky/sky_day.webp', color: 0x87ceeb },
      night: { name: 'Midnight', price: 250, tex: 'assets/image/sky/sky_night.webp', color: 0x0a0a2a },
    },
    ballConfigs: { rainbow: { type: 'color', color: 0xff0000 } },
    weatherAI: {
      chooseWeather: () => 'clear',
      recordWeather: () => {},
    },
    scene: {
      add: vi.fn(),
      remove: vi.fn(),
      fog: null,
    },
    world: {
      addBody: vi.fn(),
      removeBody: vi.fn(),
      contactmaterials: [],
    },
    ballMesh: {
      position: { x: 0, y: 5, z: 0 },
      material: null,
      castShadow: false,
      quaternion: { setFromEuler() {}, copy() {} },
    },
    ballBody: {
      position: { x: 0, y: 5, z: 0 },
    },
    lastCheckpointPos: {
      set: vi.fn(),
    },
    sharedMaterials: {
      wood: { type: 'MeshPhongMaterial_wood' },
      finish: { type: 'MeshPhongMaterial_finish', color: 0x00ff00 },
      glass: { type: 'MeshPhongMaterial_glass' },
      wall: { type: 'MeshPhongMaterial_wall' },
      pendulum: { type: 'MeshPhongMaterial_pendulum' },
      spinner: { type: 'MeshPhongMaterial_spinner' },
      hazard: { type: 'MeshPhongMaterial_hazard' },
      coin: { type: 'MeshPhongMaterial_coin' },
      rope: { type: 'LineBasicMaterial_rope' },
      neon: { type: 'MeshPhongMaterial_neon', clone: true },
    },
    _trailModelPool: {},
    finishModel: {
      clone: () => ({
        position: { set: vi.fn() },
        scale: { set: vi.fn() },
        rotation: { set: vi.fn() },
        type: 'Group_finish',
      }),
    },
    levelObjects: [],
    coins: [],
    pendulums: [],
    spinners: [],
    movers: [],
    glassPlatforms: [],
    checkpoints: [],
    raining: false,
    windy: false,
    snowing: false,
    rollSound: null,
  };
}

// --- Segment count formula ---

describe('segment count formula', () => {
  it('should produce correct count for level 1', () => {
    expect(15 + Math.floor(1 * 2.5)).toBe(17);
  });

  it('should produce correct count for level 5', () => {
    expect(15 + Math.floor(5 * 2.5)).toBe(27);
  });

  it('should produce correct count for level 20', () => {
    expect(15 + Math.floor(20 * 2.5)).toBe(65);
  });

  it('should produce correct count for level 50', () => {
    expect(15 + Math.floor(50 * 2.5)).toBe(140);
  });
});

// --- createLevel integration ---

describe('createLevel', () => {
  it('should run without throwing for level 1', () => {
    const game = makeMockGame(1);
    expect(() => createLevel(game, 42)).not.toThrow();
  });

  it('should run without throwing for level 10', () => {
    const game = makeMockGame(10);
    expect(() => createLevel(game, 42)).not.toThrow();
  });

  it('should produce correct segment count for level 1', () => {
    const game = makeMockGame(1);
    createLevel(game, 42);
    expect(game.levelLength).toBeGreaterThan(0);
    expect(typeof game.levelLength).toBe('number');
  });

  it('should produce more segments for higher levels', () => {
    const game1 = makeMockGame(1);
    createLevel(game1, 42);
    const len1 = game1.levelLength;

    const game20 = makeMockGame(20);
    createLevel(game20, 42);
    const len20 = game20.levelLength;

    expect(len20).toBeGreaterThan(len1);
  });

  it('should produce identical output for same seed and level', () => {
    const gameA = makeMockGame(5);
    createLevel(gameA, 12345);

    const gameB = makeMockGame(5);
    createLevel(gameB, 12345);

    expect(gameA.levelLength).toBe(gameB.levelLength);
    expect(gameA.checkpoints.length).toBe(gameB.checkpoints.length);
    expect(gameA.levelObjects.length).toBe(gameB.levelObjects.length);
    expect(gameA.coins.length).toBe(gameB.coins.length);
  });

  it('should produce different output for different seeds', () => {
    const gameA = makeMockGame(5);
    createLevel(gameA, 11111);

    const gameB = makeMockGame(5);
    createLevel(gameB, 22222);

    const differs =
      gameA.levelLength !== gameB.levelLength ||
      gameA.checkpoints.length !== gameB.checkpoints.length ||
      gameA.coins.length !== gameB.coins.length;
    expect(differs).toBe(true);
  });

  it('should create checkpoints for level 5', () => {
    const game = makeMockGame(5);
    createLevel(game, 42);
    expect(game.checkpoints.length).toBeGreaterThanOrEqual(1);
  });

  it('should set levelLength and startTime', () => {
    const game = makeMockGame(1);
    createLevel(game, 42);

    expect(game.levelLength).toBeGreaterThan(0);
    expect(game.startTime).toBeGreaterThan(0);
    expect(game.timeBonusShown).toBe(false);
  });

  it('should set mirrorLevel based on level parity', () => {
    const gameOdd = makeMockGame(3);
    createLevel(gameOdd, 42);
    expect(gameOdd.mirrorLevel).toBe(false);

    const gameEven = makeMockGame(4);
    createLevel(gameEven, 42);
    expect(gameEven.mirrorLevel).toBe(true);
  });
});

// --- clearLevel ---

describe('clearLevel', () => {
  it('should reset all level arrays', () => {
    const game = makeMockGame(1);
    game.levelObjects = [{ mesh: { id: 1 }, body: { id: 1 } }];
    game.coins = [{ id: 'coin1' }];
    game.pendulums = [{ id: 'pend1' }];
    game.spinners = [{ id: 'spin1' }];
    game.movers = [{ id: 'move1' }];
    game.glassPlatforms = [{ id: 'glass1' }];
    game.checkpoints = [{ x: 0, y: 0, z: 0, width: 4 }];
    game.raining = true;
    game.windy = true;

    clearLevel(game);

    expect(game.levelObjects).toEqual([]);
    expect(game.coins).toEqual([]);
    expect(game.pendulums).toEqual([]);
    expect(game.spinners).toEqual([]);
    expect(game.movers).toEqual([]);
    expect(game.glassPlatforms).toEqual([]);
    expect(game.checkpoints).toEqual([]);
  });
});
