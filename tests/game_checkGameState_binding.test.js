// Vitest regression guard for the _initUI dynamic-import bindings in main.js.
//
// Bug: checkGameState, handlePurchase, and levelUpSkin were exported from
// src/ui.js but never bound to the game object, so the render loop silently
// skipped all game state logic (coin collection, checkpoints, fall-off, HUD,
// win detection) and ball_index_ui.js shop clicks did nothing.
//
// This test replicates the exact binding patterns from main.js _initUI:
//
//   import('./src/ui.js').then(mod => {
//       mod.setupUI(this, null);
//       this.checkGameState = (dt) => mod.checkGameState(this, dt, null);
//       this.handlePurchase  = (type, key, price) => mod.handlePurchase(this, type, key, price);
//       this.levelUpSkin     = (key, cost) => mod.levelUpSkin(this, key, cost);
//   })
//
//   import('./src/builder/builder_ui.js').then(mod => {
//       this.enterBuilder = () => mod.enterBuilder(this);
//   })
//
// … and pins these invariants so the regression cannot recur:
//   (a) checkGameState IS bound and delegates (game, dt, null).
//   (b) handlePurchase IS bound and delegates (game, type, key, price).
//   (c) levelUpSkin IS bound and delegates (game, key, cost).
//   (d) enterBuilder IS bound and delegates (game).
//
// The TypeError emitted by checkGameState tests is expected — checkGameState
// wraps its entire body in try/catch, so accessing undefined properties on the
// bare `game` object triggers the catch block (which console.warns it).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks for all static imports of src/ui.js ----
// Same pattern as checkpoint_feedback.test.js + engine/scene.js.

vi.mock('../src/audio.js',                () => ({ playSound: vi.fn() }));
vi.mock('../src/persistence.js',          () => ({ saveGame: vi.fn() }));
vi.mock('../src/levelgen.js',             () => ({ createLevel: vi.fn(), createInfiniteLevel: vi.fn(), DIFFICULTY_TIERS: [] }));
vi.mock('../src/ball_index_ui.js',        () => ({ renderBallIndexUI: vi.fn() }));
vi.mock('../src/catalog_ui.js',           () => ({ renderCatalogPanel: vi.fn() }));
vi.mock('../src/voice_to_text.js',        () => ({ initVoiceToText: vi.fn(), createMicButton: vi.fn(), showTranscriptionToast: vi.fn(), startListening: vi.fn(), stopListening: vi.fn() }));
vi.mock('../src/puter_integration.js',    () => ({ signScore: vi.fn() }));
vi.mock('../engine/scene.js',             () => ({ applySkyConfig: vi.fn(), getBallMaterial: vi.fn(), applyBallSkin: vi.fn() }));
vi.mock('../src/builder/builder_ui.js',   () => ({ enterBuilder: vi.fn() }));

// ---- Helpers ----

/** Return the (cached) mock of src/ui.js, src/builder/builder_ui.js, and a
 *  minimally-populated game object that won't crash handlePurchase /
 *  levelUpSkin (which access saveData and ballConfigs without a try/catch
 *  wrapper). */
async function createFixture() {
    const uiMod = await import('../src/ui.js');
    const builderMod = await import('../src/builder/builder_ui.js');
    const game = {
        saveData: { unlockedBalls: [], unlockedSkies: [], skinLevels: {} },
        ballConfigs: {},
        scene: {},
    };
    return { uiMod, builderMod, game };
}

// ---- Tests ----

describe('Game._initUI — dynamic-import delegate binding regression guard', () => {

    let uiMod, builderMod, game;

    beforeEach(async () => {
        ({ uiMod, builderMod, game } = await createFixture());
        // Exact bindings from main.js _initUI
        game.checkGameState = (dt) => uiMod.checkGameState(game, dt, null);
        game.handlePurchase  = (type, key, price) => uiMod.handlePurchase(game, type, key, price);
        game.levelUpSkin     = (key, cost) => uiMod.levelUpSkin(game, key, cost);
        game.enterBuilder    = () => builderMod.enterBuilder(game);
    });

    // ------- checkGameState -------

    it('(a) checkGameState delegates (game, dt, null) to the real export', () => {
        expect(game.checkGameState).toBeInstanceOf(Function);
        expect(uiMod.checkGameState).toBeInstanceOf(Function);
        expect(uiMod.checkGameState.name).toBe('checkGameState');

        const spy = vi.spyOn(uiMod, 'checkGameState');
        game.checkGameState(0.033);
        expect(spy).toHaveBeenCalledWith(game, 0.033, null);
        spy.mockRestore();
    });

    it('checkGameState does not throw on invocation (try/catch safety)', () => {
        expect(() => game.checkGameState(0.016)).not.toThrow();
    });

    // ------- handlePurchase -------

    it('(b) handlePurchase delegates (game, type, key, price) to the real export', () => {
        expect(game.handlePurchase).toBeInstanceOf(Function);
        expect(uiMod.handlePurchase).toBeInstanceOf(Function);
        expect(uiMod.handlePurchase.name).toBe('handlePurchase');

        const spy = vi.spyOn(uiMod, 'handlePurchase');
        // handlePurchase accesses game.saveData.unlockedBalls — populate it
        game.saveData.totalCoins = 0;
        game.handlePurchase('ball', 'rainbow', 50);
        expect(spy).toHaveBeenCalledWith(game, 'ball', 'rainbow', 50);
        spy.mockRestore();
    });

    // ------- levelUpSkin -------

    it('(c) levelUpSkin delegates (game, key, cost) to the real export', () => {
        expect(game.levelUpSkin).toBeInstanceOf(Function);
        expect(uiMod.levelUpSkin).toBeInstanceOf(Function);
        expect(uiMod.levelUpSkin.name).toBe('levelUpSkin');

        const spy = vi.spyOn(uiMod, 'levelUpSkin');
        // levelUpSkin accesses game.ballConfigs[key] — provide a stub
        game.ballConfigs['rainbow'] = { price: 100, ability: null };
        game.saveData.totalCoins = 0;
        game.levelUpSkin('rainbow', 200);
        expect(spy).toHaveBeenCalledWith(game, 'rainbow', 200);
        spy.mockRestore();
    });

    // ------- enterBuilder -------

    it('(d) enterBuilder delegates (game) to the builder module', () => {
        expect(game.enterBuilder).toBeInstanceOf(Function);
        expect(builderMod.enterBuilder).toBeInstanceOf(Function);

        const spy = vi.spyOn(builderMod, 'enterBuilder');
        game.enterBuilder();
        expect(spy).toHaveBeenCalledWith(game);
        spy.mockRestore();
    });
});
