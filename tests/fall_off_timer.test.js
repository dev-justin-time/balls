// Vitest regression spec for the round-6 3-second fall-off restart timer.
//
// User directive (2026-06-27 round 6): "when ball falls off track for 3 sec
// restart. ... if ball falls off track all coins fall away". Implementation
// lives in src/ui.js:checkGameState (FALL_TIME_THRESHOLD = 3.0, FALL_Y_THRESHOLD
// = -15, FALL_VEL_THRESHOLD = -10, plus the post-teleport coin sweep that drops
// ALL flagged coins from scene + game.coins). This file drives that function
// end-to-end with a mock game object — no Three.js, no cannon-es, no DOM
// writes — and pins three invariants:
//
//   (A) Pre-threshold (t = 2.99 s): the teleport has NOT fired. ballBody
//       position is still at the falling coordinates, _fallTimer < 3.0.
//       Coins ARE flagged `dropping` mid-flight (sanity-check that the
//       "fall away" animation is running before the sweep).
//   (B) Post-threshold (t = 3.05 s): the teleport HAS fired. ballBody position
//       is copied from game.lastCheckpointPos, both linear AND angular
//       velocity are exactly zero, _fallTimer reset to 0.
//   (C) Coin sweep (t = 3.05 s): every coin that was uncollected at the
//       start of the fall (and therefore flagged `userData.dropping`) was
//       passed to game.scene.remove, AND was filtered out of game.coins.
//       The single pre-collected coin in the mock is NOT touched (sanity:
//       only `dropping` coins get swept, not all coins).
//
// Cadence: dt = 0.01 s × 305 ticks = 3.05 s for (B)+(C), dt = 0.01 s × 299
// ticks = 2.99 s for (A). 0.01 s is small enough to land precisely on the
// 3.00 s threshold on the 300th tick and resolve 2.99 s on the 299th tick
// without creeping over.
//
// NOTE: this file is sensitive to the iterative shape of the falling branch
// in checkGameState — keep it in sync with any rename of `_fallTimer`,
// `userData.dropping`, `game.lastCheckpointPos`, `game.scene.remove`, or
// `game.coins` (filter predicate).

import { describe, it, expect } from 'vitest';
import { checkGameState } from '../src/ui.js';

// ---------- Mock factories ----------

function makeLastCheckpointPos(x, y, z) {
    return { x, y, z, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
}

function makeBallBody(startY, velY) {
    return {
        position: {
            x: 0,
            y: startY,
            z: 0,
            _copies: 0,
            _copySrc: null,
            set(x, y, z) { this.x = x; this.y = y; this.z = z; },
            copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; this._copies++; this._copySrc = v; }
        },
        velocity: {
            x: 0,
            y: velY,
            z: 0,
            _sets: 0,
            set(x, y, z) { this.x = x; this.y = y; this.z = z; this._sets++; }
        },
        angularVelocity: {
            x: 0,
            y: 0,
            z: 0,
            _sets: 0,
            set(x, y, z) { this.x = x; this.y = y; this.z = z; this._sets++; }
        }
    };
}

function makeBallMesh(x, y, z) {
    return {
        position: {
            x, y, z,
            distanceTo(other) {
                return Math.sqrt(
                    (this.x - other.x) ** 2 +
                    (this.y - other.y) ** 2 +
                    (this.z - other.z) ** 2
                );
            }
        }
    };
}

// Coins placed at (x=±100, y≈2-4, z=-100..-200) — well outside the 1.2 unit
// pickup radius from the ball so the coin-collection branch never fires and
// does NOT splice our test coins out before the fall-off sweep gets to them.
function makeCoin(x, y, z) {
    return {
        userData: {},
        position: { x, y, z }
    };
}

function makeScene() {
    return {
        _removed: [],
        remove(coin) { this._removed.push(coin); }
    };
}

/**
 * Build a mock game matching the field surface checkGameState reads + writes.
 * `startY` and `velY` place the ball in the "falling" state from frame 1.
 * `checkpoint = { x, y, z }` is the teleport destination.
 */
function makeMockGame({ startY = -20, velY = -15, checkpoint = { x: 10, y: 5, z: -30 } } = {}) {
    const ballBody = makeBallBody(startY, velY);
    const ballMesh = makeBallMesh(0 /* unused — coins far away */, startY, 0);
    const lastCheckpointPos = makeLastCheckpointPos(checkpoint.x, checkpoint.y, checkpoint.z);

    // 3 uncollected (will be flagged dropping during fall + removed during
    // sweep at t >= 3.0) + 1 pre-collected (sanity: must survive the sweep).
    const coins = [
        makeCoin( 100, 2, -100),
        makeCoin(-100, 3, -200),
        makeCoin( 200, 1,  -50),
        { ...makeCoin(300, 4, -150), userData: { collected: true } }
    ];

    const scene = makeScene();

    return {
        ballBody,
        ballMesh,
        lastCheckpointPos,
        coins,
        scene,
        isGrounded: false,
        checkpoints: [],                 // none — so checkpoint-progress never fires
        glassPlatforms: undefined,        // skip glass branch
        skyConfigs: {},                  // skip sky-condition coin bonus
        saveData: { totalCoins: 0, selectedSky: undefined, playerName: 'Tester' },
        _fallTimer: 0,
        _distanceTraveled: 0,
        levelLength: 100,                // forcing-function for distance HUD
        isGameOver: false,
        startTime: undefined,            // skip time-remaining HUD
        finishZ: undefined,              // skip win condition
        finishX: undefined,
        currentTier: undefined,          // skip difficulty label
        _abilityCoins: 1.0
    };
}

/**
 * Run checkGameState `count` times at `dt` seconds each.
 */
function tick(game, dt) {
    checkGameState(game, dt);
}

// ---------- Tests ----------

const DT = 0.01;                        // 0.01 s step — exactly 300 ticks to cross 3.0 s threshold
const FALLING_TOTAL_SEC = 3.05;         // (B)+(C): 305 ticks, overshoot +0.05 s
const FALLING_PRE_THRESHOLD_SEC = 2.99; // (A): 299 ticks, exactly 2.99 s

describe('round-6 fall-off restart timer (src/ui.js checkGameState)', () => {

    describe('A. just BEFORE the 3.0 s threshold (t = 2.99 s)', () => {
        it('has NOT teleported and the timer is still accumulating', () => {
            const game = makeMockGame();
            // 2.99 / 0.01 = 299 ticks exactly — well under threshold.
            for (let i = 0; i < 299; i++) tick(game, DT);

            // (A1) _fallTimer is strictly below the threshold.
            expect(game._fallTimer).toBeLessThan(3.0);

            // (A2) ballBody position has NOT been copied from lastCheckpointPos.
            expect(game.ballBody.position._copies).toBe(0);
            expect(game.ballBody.position.x).toBe(0);
            expect(game.ballBody.position.y).toBe(-20);
            expect(game.ballBody.position.z).toBe(0);

            // (A3) ballBody velocity / angularVelocity still have NOT been
            // zeroed by the teleport branch.
            expect(game.ballBody.velocity._sets).toBe(0);
            expect(game.ballBody.angularVelocity._sets).toBe(0);

            // (A4) Sanity: all 3 originally-uncollected coins ARE already
            // flagged `userData.dropping` (the "fall away" animation runs
            // every frame regardless of whether the threshold is reached
            // yet — this is what the user sees in-game).
            const dropping = game.coins.filter((c) => c.userData.dropping === true);
            expect(dropping.length).toBe(3);
        });
    });

    describe('B. AT AND PAST the 3.0 s threshold (t = 3.05 s)', () => {
        it('teleports ballBody to lastCheckpointPos and zeroes ALL velocities', () => {
            const game = makeMockGame();
            // 3.05 / 0.01 = 305 ticks — crosses threshold on tick 300.
            for (let i = 0; i < 305; i++) tick(game, DT);

            // (B1) ballBody position matches lastCheckpointPos exactly.
            expect(game.ballBody.position.x).toBe(game.lastCheckpointPos.x);
            expect(game.ballBody.position.y).toBe(game.lastCheckpointPos.y);
            expect(game.ballBody.position.z).toBe(game.lastCheckpointPos.z);

            // (B2) position.copy was called exactly once (on the threshold tick).
            expect(game.ballBody.position._copies).toBe(1);
            expect(game.ballBody.position._copySrc).toBe(game.lastCheckpointPos);

            // (B3) linear velocity zeroed exactly once.
            expect(game.ballBody.velocity.x).toBe(0);
            expect(game.ballBody.velocity.y).toBe(0);
            expect(game.ballBody.velocity.z).toBe(0);
            expect(game.ballBody.velocity._sets).toBe(1);

            // (B4) angular velocity zeroed exactly once.
            expect(game.ballBody.angularVelocity.x).toBe(0);
            expect(game.ballBody.angularVelocity.y).toBe(0);
            expect(game.ballBody.angularVelocity.z).toBe(0);
            expect(game.ballBody.angularVelocity._sets).toBe(1);

            // (B5) _fallTimer reset to 0 — keeps it from re-firing next frame.
            expect(game._fallTimer).toBe(0);

            // (B6) After teleport, isFalling is false on subsequent ticks
            // (ball y is now +5, not below -15) so velocities stay at 0 and
            // no further `velocity.set` calls happen during the +0.05 s
            // overshoot.
            expect(game.ballBody.velocity._sets).toBe(1);
            expect(game.ballBody.angularVelocity._sets).toBe(1);
        });
    });

    describe('C. coin sweep on teleport (t = 3.05 s, "all coins fall away")', () => {
        it('removes only dropping-flagged coins from scene + game.coins', () => {
            const game = makeMockGame();
            // Capture the 3 uncollected coins by reference BEFORE the loop
            // starts — these are what scene.remove MUST receive and nothing
            // else. Reference equality (toEqual) means we pin 'the same
            // object' not 'an object shaped like this coin'.
            const uncollectedRefs = game.coins.slice(0, 3);
            const preCollectedRef  = game.coins[3];

            for (let i = 0; i < 305; i++) tick(game, DT);

            // (C1) game.coins now contains only the pre-collected sanity coin
            // (NOT touched by the sweep because userData.dropping is falsy).
            expect(game.coins.length).toBe(1);
            expect(game.coins[0]).toBe(preCollectedRef);
            expect(game.coins[0].userData.collected).toBe(true);
            expect(!!game.coins[0].userData.dropping).toBe(false);

            // (C2) scene.remove was called exactly 3 times — once per
            // originally-uncollected coin (the ones that were flagged
            // `dropping` during the fall).
            expect(game.scene._removed.length).toBe(3);

            // (C3) scene.remove received exactly the 3 originally-uncollected
            // coins in array order — reference equality; the pre-collected
            // coin is NOT in the removed list.
            expect(game.scene._removed).toEqual(uncollectedRefs);
            expect(game.scene._removed).not.toContain(preCollectedRef);
        });
    });
});
