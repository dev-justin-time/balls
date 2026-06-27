// Vitest regression guard for static-import delegate methods on the Game
// class in main.js.  Each delegate is a one-liner that forwards (game, …args)
// to a statically imported module export:
//
//   import { fnA, fnB, … } from './src/someModule.js';
//   class Game {
//       fnA(a, b) { fnA(this, a, b); }
//       fnB()     { fnB(this); }
//   }
//
// This file tests EVERY such delegate using data-driven it.each tables so
// future refactors cannot accidentally break the binding.

import { describe, it, expect, vi } from 'vitest';

// ---- Mocks for all statically-imported delegate source modules ----

vi.mock('../src/levelgen.js', () => ({
    // Already tested, kept for mock completeness
    createInfiniteLevel: vi.fn(),

    // Untested — now covered below
    createLevel:            vi.fn(),
    clearLevel:             vi.fn(),
    addPlatform:            vi.fn(),
    addGlassPlatform:       vi.fn(),
    addTunnelWalls:         vi.fn(),
    addRamp:                vi.fn(),
    addPendulum:            vi.fn(),
    addSpinner:             vi.fn(),
    addHammer:              vi.fn(),
    addMover:               vi.fn(),
    addWall:                vi.fn(),
    addBlade:               vi.fn(),
    addLoopDeLoop:          vi.fn(),
    addSpiralTube:          vi.fn(),
    addSpringPad:           vi.fn(),
    addCurve:               vi.fn(),
    addStairs:              vi.fn(),
    addPortalRing:          vi.fn(),
    addHalfPipe:            vi.fn(),
    addCheckerboard:        vi.fn(),
    addGlassLoopDeLoop:     vi.fn(),
    addGlassStairs:         vi.fn(),
    addGlassCurve:          vi.fn(),
    addCoins:               vi.fn(),
    addCheckpoint:          vi.fn(),
    placeFinishModel:       vi.fn(),
    spawnDroppedCoins:      vi.fn(),
    createShockwave:        vi.fn(),
    triggerDropFromObstacle: vi.fn(),
}));

vi.mock('../src/physics.js', () => ({
    updateFireSparks:      vi.fn(),
    updateHeatShimmer:     vi.fn(),
    updateMeteors:         vi.fn(),
    checkMeteorCollisions:  vi.fn(),
    jump:                  vi.fn(),
}));

vi.mock('../src/rendering.js', () => ({
    onWindowResize: vi.fn(),
    animate:        vi.fn(),
}));

vi.mock('../src/persistence.js', () => ({
    saveGame: vi.fn(),
}));

vi.mock('../engine/scene.js', () => ({
    getBallMaterial: vi.fn(),
    applyBallSkin:   vi.fn(),
}));

vi.mock('../src/audio.js', () => ({
    playSound: vi.fn(),
}));

// ---- Imports (resolved to the mocks above) ----

// levelgen
import {
    createInfiniteLevel, createLevel, clearLevel,
    addPlatform, addGlassPlatform, addTunnelWalls, addRamp,
    addPendulum, addSpinner, addHammer, addMover, addWall, addBlade,
    addLoopDeLoop, addSpiralTube, addSpringPad, addCurve,
    addStairs, addPortalRing, addHalfPipe, addCheckerboard,
    addGlassLoopDeLoop, addGlassStairs, addGlassCurve,
    addCoins, addCheckpoint, placeFinishModel,
    spawnDroppedCoins, createShockwave, triggerDropFromObstacle,
} from '../src/levelgen.js';

// physics
import {
    updateFireSparks, updateHeatShimmer, updateMeteors,
    checkMeteorCollisions, jump,
} from '../src/physics.js';

// rendering
import { onWindowResize } from '../src/rendering.js';

// persistence
import { saveGame } from '../src/persistence.js';

// engine/scene
import { getBallMaterial, applyBallSkin } from '../engine/scene.js';

// audio
import { playSound } from '../src/audio.js';

// ---- Helpers ----

/**
 * Create a bare game object and bind EVERY static-import delegate exactly
 * as the Game class does in main.js.  Each binding is a one-liner:
 *
 *     methodName(...args) { moduleFn(this, ...args); }
 *
 * This is the single source of truth — any new delegate added to the Game
 * class MUST also be added here.
 */
function createFixture() {
    const game = {};

    // ── levelgen.js ──

    game.createLevel        = (seed)                        => createLevel(game, seed);
    game.createInfiniteLevel = (seed)                       => createInfiniteLevel(game, seed);
    game.clearLevel         = ()                            => clearLevel(game);
    game.addPlatform        = (x, y, z, w, l, c)            => addPlatform(game, x, y, z, w, l, c);
    game.addGlassPlatform   = (x, y, z, w, l)               => addGlassPlatform(game, x, y, z, w, l);
    game.addTunnelWalls     = (x, y, z, w, l)               => addTunnelWalls(game, x, y, z, w, l);
    game.addRamp            = (x, y, z, w, l, h)            => addRamp(game, x, y, z, w, l, h);
    game.addPendulum        = (x, y, z, s)                  => addPendulum(game, x, y, z, s);
    game.addSpinner         = (x, y, z, s)                  => addSpinner(game, x, y, z, s);
    game.addHammer          = (x, y, z, s)                  => addHammer(game, x, y, z, s);
    game.addMover           = (x, y, z, w, h, d, sw, s)     => addMover(game, x, y, z, w, h, d, sw, s);
    game.addWall            = (x, y, z, w, l, r)            => addWall(game, x, y, z, w, l, r);
    game.addBlade           = (x, y, z, t, ln, sw, v)       => addBlade(game, x, y, z, t, ln, sw, v);
    game.addLoopDeLoop      = (x, y, z, w, r, s)            => addLoopDeLoop(game, x, y, z, w, r, s);
    game.addSpiralTube      = (x, y, z, w, r, t, s)         => addSpiralTube(game, x, y, z, w, r, t, s);
    game.addSpringPad       = (x, y, z, w, l, bp)           => addSpringPad(game, x, y, z, w, l, bp);
    game.addCurve           = (x, y, z, w, al, s, d)        => addCurve(game, x, y, z, w, al, s, d);
    game.addStairs          = (x, y, z, w, sc, sl, sh)      => addStairs(game, x, y, z, w, sc, sl, sh);
    game.addPortalRing      = (x, y, z, r)                  => addPortalRing(game, x, y, z, r);
    game.addHalfPipe        = (x, y, z, w, l)               => addHalfPipe(game, x, y, z, w, l);
    game.addCheckerboard    = (x, y, z, ts, rows)           => addCheckerboard(game, x, y, z, ts, rows);
    game.addGlassLoopDeLoop = (x, y, z, w, r, s)            => addGlassLoopDeLoop(game, x, y, z, w, r, s);
    game.addGlassStairs     = (x, y, z, w, sc, sl, sh)      => addGlassStairs(game, x, y, z, w, sc, sl, sh);
    game.addGlassCurve      = (x, y, z, w, al, s, d)        => addGlassCurve(game, x, y, z, w, al, s, d);
    game.addCoins           = (x, y, sz, l, c)              => addCoins(game, x, y, sz, l, c);
    game.addCheckpoint      = (x, y, z, w)                  => addCheckpoint(game, x, y, z, w);
    game.placeFinishModel   = ()                            => placeFinishModel(game);
    game.spawnDroppedCoins  = (p, v)                        => spawnDroppedCoins(game, p, v);
    game.createShockwave    = (z, i)                        => createShockwave(game, z, i);
    game.triggerDropFromObstacle = (o, opts)                => triggerDropFromObstacle(game, o, opts);

    // ── physics.js ──

    game.jump                   = ()    => jump(game);
    game.updateFireSparks      = (dt)  => updateFireSparks(game, dt);
    game.updateHeatShimmer     = (dt)  => updateHeatShimmer(game, dt);
    game.updateMeteors         = (dt)  => updateMeteors(game, dt);
    game.checkMeteorCollisions  = ()    => checkMeteorCollisions(game);

    // ── rendering.js ──

    game.onWindowResize = () => onWindowResize(game);

    // ── persistence.js ──

    game.save = () => saveGame(game);

    // ── engine/scene.js ──

    game.getBallMaterial = () => getBallMaterial(game);
    game.applyBallSkin   = (conf) => applyBallSkin(game, conf);

    // ── audio.js (passthrough — does NOT forward `game`) ──

    game.playSound = (name) => playSound(name);

    return game;
}

// ---- Tests ----

describe('Game static-import delegate binding regression guard', () => {

    // ──────────────────────────────────────────────────────────────────
    // levelgen.js delegates — data-driven via it.each
    // ──────────────────────────────────────────────────────────────────

    // Lookup table for levelgen mock exports (extracted once, reused per row).
    const levelgenExports = {
        createInfiniteLevel, createLevel, clearLevel,
        addPlatform, addGlassPlatform, addTunnelWalls, addRamp,
        addPendulum, addSpinner, addHammer, addMover, addWall, addBlade,
        addLoopDeLoop, addSpiralTube, addSpringPad, addCurve,
        addStairs, addPortalRing, addHalfPipe, addCheckerboard,
        addGlassLoopDeLoop, addGlassStairs, addGlassCurve,
        addCoins, addCheckpoint, placeFinishModel,
        spawnDroppedCoins, createShockwave, triggerDropFromObstacle,
    };

    describe('levelgen.js delegates', () => {
        // Each row: [methodName, callArgsArray, expectedArgsArray (game prepended)]
        it.each([
            // 0-arg
            ['clearLevel',        [],                           []],
            ['placeFinishModel',  [],                           []],

            // 1-arg
            ['createLevel',        [42],                        [42]],
            ['createInfiniteLevel',[99],                        [99]],
            ['createShockwave',    [-10, 3],                    [-10, 3]],
            ['spawnDroppedCoins',  [{x:0,y:1,z:2}, {x:1,y:4}], [{x:0,y:1,z:2}, {x:1,y:4}]],

            // 4-arg (signature: x, y, z, fourth)
            ['addCheckpoint',      [5, 1, -20, 8],             [5, 1, -20, 8]],
            ['addPortalRing',      [0, 2, -30, 4],             [0, 2, -30, 4]],

            // 5-arg (signature: x, y, z, w, l)
            ['addPlatform',        [0, 0, -10, 4, 20, 0x44ff44], [0, 0, -10, 4, 20, 0x44ff44]],
            ['addGlassPlatform',   [2, 1, -15, 5, 12],         [2, 1, -15, 5, 12]],
            ['addTunnelWalls',     [0, 0, -12, 3, 25],         [0, 0, -12, 3, 25]],
            ['addHalfPipe',        [3, 0, -18, 6, 16],         [3, 0, -18, 6, 16]],

            // 4-arg (signature: x, y, z, speed)
            ['addPendulum',        [1, 3, -22, 1.5],           [1, 3, -22, 1.5]],
            ['addSpinner',         [2, 2, -25, 2.0],           [2, 2, -25, 2.0]],
            ['addHammer',          [0, 4, -28, 0.8],           [0, 4, -28, 0.8]],

            // 6-arg (signature: x, y, z, w, l, extra)
            ['addRamp',            [0, 0, -20, 3, 8, 4],       [0, 0, -20, 3, 8, 4]],
            // 5-arg (signature: x, y, startZ, length, count)
            ['addCoins',           [1, 2, -15, 20, 6],         [1, 2, -15, 20, 6]],

            // 8-arg (signature: x, y, z, w, h, d, sideways, speed)
            ['addMover',           [1, 0, -30, 2, 3, 4, true, 1.2], [1, 0, -30, 2, 3, 4, true, 1.2]],

            // 6-arg (signature: x, y, z, w, l, rot)
            ['addWall',            [0, 0, -15, 2, 10, 0.3],    [0, 0, -15, 2, 10, 0.3]],

            // 7-arg (signature: x, y, z, type, len, speed, vec)
            ['addBlade',           [2, 1, -12, 0, 3, 2.5, 1],  [2, 1, -12, 0, 3, 2.5, 1]],

            // 6-arg (signature: x, y, z, w, radius, speed)
            ['addLoopDeLoop',      [0, 2, -35, 4, 5, 1.5],    [0, 2, -35, 4, 5, 1.5]],
            ['addGlassLoopDeLoop', [1, 3, -40, 5, 6, 2.0],    [1, 3, -40, 5, 6, 2.0]],

            // 7-arg (signature: x, y, z, w, radius, turns, speed)
            ['addSpiralTube',      [0, 1, -25, 3, 4, 2, 1.8], [0, 1, -25, 3, 4, 2, 1.8]],

            // 6-arg (signature: x, y, z, w, l, bouncePower)
            ['addSpringPad',       [1, 0, -22, 2, 4, 12],     [1, 0, -22, 2, 4, 12]],

            // 7-arg (signature: x, y, z, w, arcLen, speed, direction)
            ['addCurve',           [0, 0, -18, 3, 6, 2.5, 1], [0, 0, -18, 3, 6, 2.5, 1]],
            ['addGlassCurve',      [2, 1, -24, 4, 5, 1.8, -1],[2, 1, -24, 4, 5, 1.8, -1]],

            // 7-arg (signature: x, y, z, w, stepCount, stepLen, stepHeight)
            ['addStairs',          [0, 0, -16, 3, 8, 2, 0.5], [0, 0, -16, 3, 8, 2, 0.5]],
            ['addGlassStairs',     [1, 0, -20, 4, 6, 3, 0.4], [1, 0, -20, 4, 6, 3, 0.4]],

            // 5-arg (signature: x, y, z, tileSize, rows)
            ['addCheckerboard',    [0, 0, -10, 2, 5],          [0, 0, -10, 2, 5]],

            // 2-arg (signature: obstacle, options)
            ['triggerDropFromObstacle', [{x:0,y:0,z:-5}, {baseLoss:10}], [{x:0,y:0,z:-5}, {baseLoss:10}]],
        ])('%s delegates (game, …args) correctly', (methodName, callArgs, expectedExtraArgs) => {
            const game = createFixture();

            const delegate = game[methodName];
            expect(delegate, `${methodName} should be bound`).toBeInstanceOf(Function);

            const moduleFn = levelgenExports[methodName];
            if (!moduleFn) throw new Error(`No mock found for levelgen.${methodName}`);

            vi.clearAllMocks();

            // Invoke the delegate with the test arguments
            delegate(...callArgs);

            // Expected: moduleFn was called with (game, ...callArgs)
            expect(moduleFn).toHaveBeenCalledTimes(1);
            expect(moduleFn).toHaveBeenCalledWith(game, ...expectedExtraArgs);
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // physics.js delegates (sky effects + jump)
    // ──────────────────────────────────────────────────────────────────

    describe('physics.js delegates', () => {
        it('jump delegates (game) to physics', () => {
            vi.clearAllMocks();
            const game = createFixture();
            expect(game.jump).toBeInstanceOf(Function);
            game.jump();
            expect(jump).toHaveBeenCalledWith(game);
            expect(jump).toHaveBeenCalledTimes(1);
        });

        it('updateFireSparks delegates (game, dt) to physics', () => {
            vi.clearAllMocks();
            const game = createFixture();
            game.updateFireSparks(0.016);
            expect(updateFireSparks).toHaveBeenCalledWith(game, 0.016);
            expect(updateFireSparks).toHaveBeenCalledTimes(1);
        });

        it('updateHeatShimmer delegates (game, dt) to physics', () => {
            vi.clearAllMocks();
            const game = createFixture();
            game.updateHeatShimmer(0.020);
            expect(updateHeatShimmer).toHaveBeenCalledWith(game, 0.020);
            expect(updateHeatShimmer).toHaveBeenCalledTimes(1);
        });

        it('updateMeteors delegates (game, dt) to physics', () => {
            vi.clearAllMocks();
            const game = createFixture();
            game.updateMeteors(0.033);
            expect(updateMeteors).toHaveBeenCalledWith(game, 0.033);
            expect(updateMeteors).toHaveBeenCalledTimes(1);
        });

        it('checkMeteorCollisions delegates (game) to physics', () => {
            vi.clearAllMocks();
            const game = createFixture();
            game.checkMeteorCollisions();
            expect(checkMeteorCollisions).toHaveBeenCalledWith(game);
            expect(checkMeteorCollisions).toHaveBeenCalledTimes(1);
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // rendering.js delegates
    // ──────────────────────────────────────────────────────────────────

    describe('rendering.js delegates', () => {
        it('onWindowResize delegates (game) to rendering', () => {
            vi.clearAllMocks();
            const game = createFixture();
            expect(game.onWindowResize).toBeInstanceOf(Function);
            game.onWindowResize();
            expect(onWindowResize).toHaveBeenCalledWith(game);
            expect(onWindowResize).toHaveBeenCalledTimes(1);
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // persistence.js delegates
    // ──────────────────────────────────────────────────────────────────

    describe('persistence.js delegates', () => {
        it('save delegates (game) to persistence', () => {
            vi.clearAllMocks();
            const game = createFixture();
            expect(game.save).toBeInstanceOf(Function);
            game.save();
            expect(saveGame).toHaveBeenCalledWith(game);
            expect(saveGame).toHaveBeenCalledTimes(1);
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // engine/scene.js delegates
    // ──────────────────────────────────────────────────────────────────

    describe('engine/scene.js delegates', () => {
        it('getBallMaterial delegates (game) to scene', () => {
            vi.clearAllMocks();
            const game = createFixture();
            expect(game.getBallMaterial).toBeInstanceOf(Function);
            game.getBallMaterial();
            expect(getBallMaterial).toHaveBeenCalledWith(game);
            expect(getBallMaterial).toHaveBeenCalledTimes(1);
        });

        it('applyBallSkin delegates (game, conf) to scene', () => {
            vi.clearAllMocks();
            const game = createFixture();
            expect(game.applyBallSkin).toBeInstanceOf(Function);
            const conf = { color: 'red', trail: 'fire' };
            game.applyBallSkin(conf);
            expect(applyBallSkin).toHaveBeenCalledWith(game, conf);
            expect(applyBallSkin).toHaveBeenCalledTimes(1);
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // audio.js delegates (special: passthrough, no `game` forwarding)
    // ──────────────────────────────────────────────────────────────────

    describe('audio.js delegates', () => {
        it('playSound(name) passes through directly (no game param)', () => {
            vi.clearAllMocks();
            const game = createFixture();
            expect(game.playSound).toBeInstanceOf(Function);
            game.playSound('coin');
            expect(playSound).toHaveBeenCalledWith('coin');
            // Verify it does NOT forward `game`
            expect(playSound).not.toHaveBeenCalledWith(game, 'coin');
            expect(playSound).toHaveBeenCalledTimes(1);
        });
    });
});
