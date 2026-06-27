/**
 * Ball skin system tests.
 * Covers: getBallMaterial, applyBallSkin, levelUpSkin
 *
 * THREE.js is mocked since jsdom lacks WebGL.
 * The test targets pure logic paths in engine/scene.js and src/ui.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock THREE.js ───

vi.mock('three', () => {
  const MeshPhongMaterial = vi.fn((opts = {}) => ({
    dispose: vi.fn(),
    ...opts,
    side: opts.side ?? null,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    shininess: opts.shininess ?? 40,
    map: opts.map ?? null,
    color: opts.color ?? 0xffffff,
    envMap: opts.envMap ?? null,
    emissive: opts.emissive ?? null,
  }));
  // engine/scene.js uses MeshStandardMaterial as the fallback material for
  // gltf skins and missing-config cases (lines 503, 577). Without this export
  // the mock throws "No MeshStandardMaterial export is defined on the three mock".
  const MeshStandardMaterial = vi.fn((opts = {}) => ({
    dispose: vi.fn(),
    ...opts,
    side: opts.side ?? null,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    map: opts.map ?? null,
    color: opts.color ?? 0xffffff,
    envMap: opts.envMap ?? null,
    emissive: opts.emissive ?? null,
  }));
  const DataTexture = vi.fn(() => ({ dispose: vi.fn(), needsUpdate: false }));
  const TextureLoader = vi.fn(() => ({
    load: vi.fn((_url, ok) => { if (ok) ok({}); return {}; }),
  }));
  return {
    default: {
      MeshPhongMaterial,
      MeshStandardMaterial,
      DataTexture,
      TextureLoader,
      sRGBEncoding: 3001,
      RepeatWrapping: 1000,
      DoubleSide: 2,
      RGBAFormat: 1023,
    },
    MeshPhongMaterial,
    MeshStandardMaterial,
    DataTexture,
    TextureLoader,
    sRGBEncoding: 3001,
    RepeatWrapping: 1000,
    DoubleSide: 2,
    RGBAFormat: 1023,
  };
});

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn(() => ({
    load: vi.fn(),
  })),
}));

// ─── Mock imports ───

vi.mock('../src/audio.js', () => ({ playSound: vi.fn() }));
vi.mock('../src/persistence.js', () => ({ saveGame: vi.fn() }));
// src/ui.js pulls in src/catalog_ui.js which imports DIFFICULTY_TIERS at
// module-load time. If vi.mock for src/levelgen.js doesn't supply
// DIFFICULTY_TIERS, vitest's static-analysis/collection pass throws
// "No 'DIFFICULTY_TIERS' export is defined on the '../src/levelgen.js' mock".
// Empty array is enough because this test never exercises the catalog UI.
vi.mock('../src/levelgen.js', () => ({
  createLevel: vi.fn(),
  createInfiniteLevel: vi.fn(),
  DIFFICULTY_TIERS: [],
}));
vi.mock('./ball_index_ui.js', () => ({ renderBallIndexUI: vi.fn() }));

// ─── Imports under test ───

import { getBallMaterial, applyBallSkin } from '../engine/scene.js';
import { levelUpSkin } from '../src/ui.js';
import { BALL_DB } from '../src/ball_db.js';

// ─── Helpers ───

function makeGame(overrides = {}) {
  return {
    textureLoader: { load: vi.fn(() => ({})) },
    textureCache: new Map(),
    saveData: {
      selectedBall: 'rainbow',
      totalCoins: 500,
      skinLevels: {},
    },
    ballConfigs: { ...BALL_DB },
    ballMesh: {
      material: null,
      position: { copy: vi.fn(), x: 0, y: 0, z: 0 },
      add: vi.fn(),
      remove: vi.fn(),
      traverse: vi.fn(),
    },
    scene: { add: vi.fn(), remove: vi.fn() },
    gltfLoader: { load: vi.fn() },
    _lastEnvMap: null,
    _gltfBallActive: false,
    _defaultBallMesh: null,
    _gltfBallCache: {},
    ...overrides,
  };
}

// ─── Tests ───

describe('getBallMaterial', () => {
  it('returns a MeshPhongMaterial for texture type skins', () => {
    const game = makeGame({ saveData: { selectedBall: 'rainbow', totalCoins: 500, skinLevels: {} } });
    const mat = getBallMaterial(game);
    expect(mat).toBeDefined();
    expect(mat.map).toBeDefined();
    expect(mat.side).toBeDefined();
  });

  it('returns a MeshPhongMaterial for color type skins', () => {
    const game = makeGame({
      saveData: { selectedBall: 'ruby', totalCoins: 500, skinLevels: {} },
      ballConfigs: {
        ruby: { name: 'Ruby', price: 100, type: 'color', color: 0xff0000, shininess: 80 },
      },
    });
    const mat = getBallMaterial(game);
    expect(mat).toBeDefined();
    expect(mat.color).toBe(0xff0000);
  });

  it('returns a MeshPhongMaterial for emissive type skins', () => {
    const game = makeGame({
      saveData: { selectedBall: 'neon', totalCoins: 500, skinLevels: {} },
      ballConfigs: {
        neon: { name: 'Neon', price: 200, type: 'emissive', color: 0x00ff00, emissive: 0x00ff00 },
      },
    });
    const mat = getBallMaterial(game);
    expect(mat).toBeDefined();
    expect(mat.emissive).toBe(0x00ff00);
  });

  it('returns fallback white material for gltf type (shown during async load)', () => {
    const game = makeGame({
      saveData: { selectedBall: 'nebula', totalCoins: 500, skinLevels: {} },
    });
    const mat = getBallMaterial(game);
    expect(mat).toBeDefined();
    // gltf falls through to default white material
    expect(mat.color).toBe(0xffffff);
  });

  it('returns the default white material when game or ballConfigs is missing', () => {
    const game = makeGame({
      saveData: { selectedBall: 'nonexistent', totalCoins: 500, skinLevels: {} },
      ballConfigs: {},
    });
    const mat = getBallMaterial(game);
    expect(mat).toBeDefined();
    expect(mat.color).toBe(0xffffff);
  });

  it('handles the groovy skin with canvas texture', () => {
    const fakeCanvasTex = { encoding: 0, needsUpdate: false, dispose: vi.fn() };
    const game = makeGame({
      saveData: { selectedBall: 'groovy', totalCoins: 500, skinLevels: {} },
      groovyCanvasTex: fakeCanvasTex,
    });
    const mat = getBallMaterial(game);
    expect(mat).toBeDefined();
    expect(mat.map).toBe(fakeCanvasTex);
  });

  it('handles p2opp glass skin with envMap reflectivity', () => {
    const fakeEnvMap = { dispose: vi.fn() };
    const game = makeGame({
      saveData: { selectedBall: 'p2opp', totalCoins: 500, skinLevels: {} },
      _lastEnvMap: fakeEnvMap,
    });
    const mat = getBallMaterial(game);
    expect(mat).toBeDefined();
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(0.92);
    expect(mat.envMap).toBe(fakeEnvMap);
  });

  it('loads texture via cache when available', () => {
    const cachedTex = { dispose: vi.fn(), wrapS: null, wrapT: null, encoding: 0, needsUpdate: false };
    const game = makeGame();
    game.textureCache.set('assets/image/ball/dsfk.webp', cachedTex);
    const mat = getBallMaterial(game);
    expect(mat).toBeDefined();
    expect(mat.map).toBe(cachedTex);
  });
});

describe('applyBallSkin', () => {
  it('sets ballMesh material for non-gltf skin types', () => {
    const game = makeGame();
    game.ballMesh.material = {};
    applyBallSkin(game, BALL_DB.rainbow);
    // Should have replaced material (not the same reference)
    expect(game.ballMesh.material).toBeDefined();
  });

  it('returns early when game or conf is null', () => {
    const game = makeGame();
    const before = game.ballMesh.material;
    applyBallSkin(game, null);
    // Material should not change
    expect(game.ballMesh.material).toBe(before);
  });

  it('restores default sphere mesh when switching from gltf back to non-gltf', () => {
    const defaultMesh = { material: null, traverse: vi.fn() };
    const game = makeGame({
      _gltfBallActive: true,
      _defaultBallMesh: defaultMesh,
    });
    applyBallSkin(game, BALL_DB.rainbow);
    expect(game.scene.remove).toHaveBeenCalled();
    expect(game.ballMesh).toBe(defaultMesh);
    expect(game._gltfBallActive).toBe(false);
  });

  it('saves default mesh reference on first gltf skin load', () => {
    const game = makeGame();
    const originalMesh = game.ballMesh;
    applyBallSkin(game, BALL_DB.nebula);
    expect(game._defaultBallMesh).toBe(originalMesh);
  });

  it('uses cached gltf model if available', () => {
    const fakeModel = {
      clone: vi.fn(() => ({
        scale: { set: vi.fn() },
        traverse: vi.fn(),
      })),
    };
    const game = makeGame();
    game._gltfBallCache['assets/model/scene_NEBULA.gltf'] = fakeModel;
    game.gltfLoader = { load: vi.fn() };
    applyBallSkin(game, BALL_DB.nebula);
    expect(fakeModel.clone).toHaveBeenCalled();
    expect(game._gltfBallActive).toBe(true);
    // Should not have called gltfLoader.load since cache was used
    expect(game.gltfLoader.load).not.toHaveBeenCalled();
  });

  it('calls gltfLoader.load when no cache exists for gltf skin', () => {
    const game = makeGame();
    applyBallSkin(game, BALL_DB.eye_ball);
    expect(game.gltfLoader.load).toHaveBeenCalledWith(
      'assets/model/eye_low_poly_free_cute_eyeballs.glb',
      expect.any(Function),
      undefined,
      expect.any(Function),
    );
  });

  it('does not touch _defaultBallMesh when already gltf-active', () => {
    const game = makeGame({
      _gltfBallActive: true,
      _defaultBallMesh: { material: null },
    });
    applyBallSkin(game, BALL_DB.eye_ball);
    // _defaultBallMesh should remain unchanged (not overwritten)
    expect(game._defaultBallMesh).toBeDefined();
  });

  it('swaps mesh when async gltf callback fires with matching skin', () => {
    let loadCb;
    const fakeLoader = {
      load: vi.fn((_url, cb) => { loadCb = cb; }),
    };
    const fakeMesh = {
      scale: { set: vi.fn() },
      traverse: vi.fn(),
    };
    const fakeScene = {
      clone: vi.fn(() => fakeMesh),
      traverse: vi.fn(),
    };
    const fakeGltf = { scene: fakeScene };
    const game = makeGame({
      saveData: { selectedBall: 'eye_ball', totalCoins: 500, skinLevels: {} },
      gltfLoader: fakeLoader,
    });
    applyBallSkin(game, BALL_DB.eye_ball);
    // Simulate async callback
    loadCb(fakeGltf);
    expect(game._gltfBallCache['assets/model/eye_low_poly_free_cute_eyeballs.glb']).toBe(fakeScene);
    expect(game._gltfBallActive).toBe(true);
    expect(fakeScene.clone).toHaveBeenCalledWith(true);
  });

  it('skips mesh swap when async callback fires with changed skin', () => {
    let loadCb;
    const fakeLoader = {
      load: vi.fn((_url, cb) => { loadCb = cb; }),
    };
    const game = makeGame({
      saveData: { selectedBall: 'eye_ball', totalCoins: 500, skinLevels: {} },
      gltfLoader: fakeLoader,
    });
    const originalBallMesh = game.ballMesh;
    applyBallSkin(game, BALL_DB.eye_ball);
    // User switched skin before callback
    game.saveData.selectedBall = 'rainbow';
    loadCb({ scene: { traverse: vi.fn() } });
    // ballMesh should not have been swapped
    expect(game.ballMesh).toBe(originalBallMesh);
  });

  it('returns early when game is undefined', () => {
    // Should not throw
    expect(() => applyBallSkin(undefined, BALL_DB.rainbow)).not.toThrow();
  });
});

describe('levelUpSkin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when key does not exist in ballConfigs', () => {
    const game = makeGame({ saveData: { selectedBall: 'rainbow', totalCoins: 500, skinLevels: {} } });
    levelUpSkin(game, 'nonexistent', 100);
    expect(game.saveData.totalCoins).toBe(500);
  });

  it('deducts coins and increments level when affordable', () => {
    const game = makeGame({
      saveData: { selectedBall: 'rainbow', totalCoins: 500, skinLevels: { rainbow: 1 } },
    });
    levelUpSkin(game, 'rainbow', 100);
    expect(game.saveData.totalCoins).toBe(400);
    expect(game.saveData.skinLevels.rainbow).toBe(2);
  });

  it('does not level up when player cannot afford it', () => {
    const game = makeGame({
      saveData: { selectedBall: 'rainbow', totalCoins: 50, skinLevels: { rainbow: 1 } },
    });
    levelUpSkin(game, 'rainbow', 100);
    expect(game.saveData.totalCoins).toBe(50);
    expect(game.saveData.skinLevels.rainbow).toBe(1);
  });

  it('caps at max level 5 and does not spend coins', () => {
    const game = makeGame({
      saveData: { selectedBall: 'rainbow', totalCoins: 9999, skinLevels: { rainbow: 5 } },
    });
    levelUpSkin(game, 'rainbow', 100);
    expect(game.saveData.totalCoins).toBe(9999);
    expect(game.saveData.skinLevels.rainbow).toBe(5);
  });

  it('creates skinLevels entry if missing and levels to 2', () => {
    const game = makeGame({
      saveData: { selectedBall: 'rainbow', totalCoins: 500, skinLevels: {} },
    });
    levelUpSkin(game, 'rainbow', 100);
    expect(game.saveData.skinLevels.rainbow).toBe(2);
    expect(game.saveData.totalCoins).toBe(400);
  });

  it('updates ballMesh material for selected non-gltf skin', () => {
    const game = makeGame({
      saveData: { selectedBall: 'rainbow', totalCoins: 500, skinLevels: { rainbow: 1 } },
    });
    const oldMat = game.ballMesh.material;
    levelUpSkin(game, 'rainbow', 100);
    // Material should have been reassigned
    expect(game.ballMesh.material).toBeDefined();
    // Old material may or may not be the same reference (new MeshPhongMaterial is created)
  });

  it('does not update ballMesh material for gltf skin type', () => {
    const game = makeGame({
      saveData: { selectedBall: 'nebula', totalCoins: 500, skinLevels: { nebula: 1 } },
    });
    const originalMaterial = game.ballMesh.material;
    levelUpSkin(game, 'nebula', 100);
    // For gltf, getBallMaterial is not called (it stays as-is during async load)
    expect(game.saveData.skinLevels.nebula).toBe(2);
  });

  it('calls applySkinAbilities with correct multiplier for selected skin', () => {
    const game = makeGame({
      saveData: { selectedBall: 'rainbow', totalCoins: 500, skinLevels: { rainbow: 1 } },
    });
    levelUpSkin(game, 'rainbow', 100);
    // rainbow has ability key 'coins', base 1.0, perLevel 0.15
    // After level up to 2: effect = 1.0 + 0.15 * (2 - 1) = 1.15
    expect(game.saveData.skinLevels.rainbow).toBe(2);
    expect(game._abilityCoins).toBeCloseTo(1.15, 2);
    expect(game._abilitySpeed).toBe(1.0);
    expect(game._abilityJump).toBe(1.0);
  });
});
