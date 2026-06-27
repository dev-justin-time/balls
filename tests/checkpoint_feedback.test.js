// Vitest regression spec for the round-7 CP-pulse UX feedback added to
// src/ui.js:checkGameState. Pins four invariants:
//
//   (a) FIRST contact — playSound('checkpoint') called once AND
//       #distance-display gets the .cp-pulse class AND
//       game.lastCheckpointPos.set() runs (existing behavior).
//   (b) One-shot guard — leaving & re-entering the same checkpoint
//       within the same run does NOT re-fire audio or re-add the class.
//   (c) Cross-CP independence — first contact with a DIFFERENT
//       checkpoint fires a fresh audio call (Set-keyed per coord).
//   (d) reset(game) clears the one-shot Set so a fresh run re-pulses
//       at the same physical checkpoint coordinate.
//
// Cadence: each case is a single checkGameState tick at dt=0.016 (60 fps).
//
// NOTE: src/ui.js imports many modules; we vi.mock every static import
// that this test does not exercise. The cp-pulse is purely a side-effect
// on `#distance-display` — we synthesize it manually with jsdom.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks MUST come BEFORE the imports they target — vitest hoists them.
vi.mock('../src/audio.js', () => ({ playSound: vi.fn() }));
vi.mock('../src/persistence.js', () => ({ saveGame: vi.fn() }));
vi.mock('../src/levelgen.js', () => ({
    createLevel: vi.fn(),
    createInfiniteLevel: vi.fn(),
    DIFFICULTY_TIERS: [],
}));
vi.mock('../src/ball_index_ui.js', () => ({ renderBallIndexUI: vi.fn() }));
vi.mock('../src/catalog_ui.js', () => ({ renderCatalogPanel: vi.fn() }));
vi.mock('../src/voice_to_text.js', () => ({
    initVoiceToText: vi.fn(),
    createMicButton: vi.fn(),
    showTranscriptionToast: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
}));
vi.mock('../src/puter_integration.js', () => ({ signScore: vi.fn() }));

import { checkGameState, reset } from '../src/ui.js';
import { playSound } from '../src/audio.js';

/**
 * Build a minimal mock game matching the surface area checkGameState +
 * reset() read + write. ballBody.position.set() actually mutates x/y/z
 * fields so the proximity test sees the ball at the expected coord.
 */
function makeMockGame(opts = {}) {
    const ball = {
        position: {
            x: 0, y: 1, z: 0,
            _copies: 0,
            copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; this._copies++; },
            set(x, y, z) { this.x = x; this.y = y; this.z = z; },
        },
        velocity: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
        angularVelocity: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    };
    const lastCP = {
        x: 0, y: 1, z: 0,
        set(x, y, z) { this.x = x; this.y = y; this.z = z; },
    };
    const ballMesh = {
        position: {
            x: 0, y: 1, z: 0,
            distanceTo() { return 999; },  // far from any coin → pickup skipped
        },
    };
    const scene = { remove: vi.fn() };
    return {
        ballBody: ball,
        ballMesh,
        lastCheckpointPos: lastCP,
        coins: [],
        scene,
        isGrounded: true,
        checkpoints: [],
        glassPlatforms: undefined,        // skip glass branch
        skyConfigs: {},                  // skip sky coin bonus
        saveData: { totalCoins: 0, selectedSky: undefined, playerName: 'Tester' },
        _fallTimer: 0,
        _distanceTraveled: 0,
        levelLength: 100,
        isGameOver: false,
        startTime: undefined,
        finishZ: undefined,
        finishX: undefined,
        currentTier: undefined,
        _abilityCoins: 1.0,
        _reachedCpIndices: undefined,    // lazy-init check at first contact
        ...opts,
    };
}

/**
 * Add a real jsdom #distance-display element so the pulse branch can
 * toggle the classList. Returns the element for direct assertion.
 */
function addDistDisplay(text = 'Progress: 5%') {
    const el = document.createElement('div');
    el.id = 'distance-display';
    el.textContent = text;
    document.body.appendChild(el);
    return el;
}

/** Move the ball's xz into the checkpoint cell. cp.width default 6 → tolerance = cp.width/2 + 1 = 4. */
function placeBallAtCp(ball, cp) {
    ball.position.set(cp.x, 1, cp.z);
}

/** Move the ball far away (outside any 6-wide CP cell). */
function moveBallAway(ball) {
    ball.position.set(50, 1, 50);
}

const DT = 0.016;  // 60 fps tick

describe('round-7 CP-pulse feedback (src/ui.js checkGameState + reset)', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';          // drop any prior distEl + cp-pulse <style>
        // Note: do NOT remove the existing #cp-pulse-css style element; tests
        // out-of-order may rely on its presence. The classList.add('cp-pulse')
        // is what matters for the contract.
    });

    it('(a) first contact: playSound("checkpoint") once + .cp-pulse class added + lastCheckpointPos written', () => {
        const game = makeMockGame();
        game.checkpoints = [{ x: 10, y: 0, z: -30, width: 6 }];
        const distEl = addDistDisplay();
        placeBallAtCp(game.ballBody, game.checkpoints[0]);

        checkGameState(game, DT);

        // Audio: single call with the canonical key
        expect(playSound).toHaveBeenCalledTimes(1);
        expect(playSound).toHaveBeenCalledWith('checkpoint');

        // HUD pulse: distEl has class + the lazy <style id="cp-pulse-css"> was injected
        expect(distEl.classList.contains('cp-pulse')).toBe(true);
        expect(document.getElementById('cp-pulse-css')).not.toBeNull();

        // Existing round-6 behavior: lastCheckpointPos is set to (cp.x, cp.y+1, cp.z)
        expect(game.lastCheckpointPos.x).toBe(10);
        expect(game.lastCheckpointPos.y).toBe(1);
        expect(game.lastCheckpointPos.z).toBe(-30);

        // One-shot Set carries the reached coord key
        expect(game._reachedCpIndices).toBeInstanceOf(Set);
        expect(game._reachedCpIndices.size).toBe(1);
    });

    it('(b) one-shot: leaving and re-entering the same CP does NOT re-fire audio or classList', () => {
        const game = makeMockGame();
        game.checkpoints = [{ x: 10, y: 0, z: -30, width: 6 }];
        const distEl = addDistDisplay();

        // Frame 1 — fires
        placeBallAtCp(game.ballBody, game.checkpoints[0]);
        checkGameState(game, DT);
        expect(playSound).toHaveBeenCalledTimes(1);
        expect(distEl.classList.contains('cp-pulse')).toBe(true);

        // Frame 2 — ball leaves the CP cell
        moveBallAway(game.ballBody);
        checkGameState(game, DT);
        expect(playSound).toHaveBeenCalledTimes(1);  // unchanged

        // Frame 3 — ball re-enters
        placeBallAtCp(game.ballBody, game.checkpoints[0]);
        checkGameState(game, DT);
        expect(playSound).toHaveBeenCalledTimes(1);  // still 1; one-shot held
    });

    it('(c) cross-CP independence: a different CP fires a fresh audio call', () => {
        const game = makeMockGame();
        game.checkpoints = [
            { x: 10, y: 0, z: -30, width: 6 },   // CP-A
            { x:  0, y: 0, z: -60, width: 6 },   // CP-B
        ];
        const distEl = addDistDisplay();

        // Reach CP-A
        placeBallAtCp(game.ballBody, game.checkpoints[0]);
        checkGameState(game, DT);
        expect(playSound).toHaveBeenCalledTimes(1);

        // Travel to CP-B and reach it — fires a NEW audio call
        placeBallAtCp(game.ballBody, game.checkpoints[1]);
        checkGameState(game, DT);
        expect(playSound).toHaveBeenCalledTimes(2);
        expect(playSound).toHaveBeenLastCalledWith('checkpoint');

        // Set contains both reached CPs
        expect(game._reachedCpIndices.size).toBe(2);
    });

    it('(d) reset(game) clears the one-shot tracker so a fresh run re-pulses the same coord', () => {
        const game = makeMockGame({ _isInfinite: false });
        game.checkpoints = [{ x: 10, y: 0, z: -30, width: 6 }];
        const distEl = addDistDisplay();

        // Run 1: reach CP, pulse fires
        placeBallAtCp(game.ballBody, game.checkpoints[0]);
        checkGameState(game, DT);
        expect(playSound).toHaveBeenCalledTimes(1);
        expect(game._reachedCpIndices.size).toBe(1);

        // reset(game) — vi.fn() createLevel doesn't repopulate checkpoints,
        // so we manually restore them to model "generate new level"
        reset(game);
        expect(game._reachedCpIndices).toBeInstanceOf(Set);
        expect(game._reachedCpIndices.size).toBe(0);

        // Run 2: same physical coord, same checkpoint — should fire fresh
        game.checkpoints = [{ x: 10, y: 0, z: -30, width: 6 }];
        placeBallAtCp(game.ballBody, game.checkpoints[0]);
        checkGameState(game, DT);
        expect(playSound).toHaveBeenCalledTimes(2);
        expect(game._reachedCpIndices.size).toBe(1);
    });
});
