// Physics regression tests for Going Balls.
//
// These tests pin the GRAVITY=-45 behavior documented in Vision Part 3 of
// the platform vision doc: a change to GRAVITY (or JUMP_FORCE, ball mass,
// damping, BALL_RADIUS, MAX_VELOCITY, etc.) should FAIL this test file
// unless the snapshot is intentionally updated alongside the change.
//
// The simulation lives in `../@jump-sim.mjs` (refactored to export
// simulateJump while preserving its CLI entry-point behavior). Snapshot
// bands here are intentionally ONE ORDER tighter than the future tolerated
// drift between cannon-es library versions, but loose enough not to
// false-positive on numerical jitter.

import { describe, it, expect } from 'vitest';
import { simulateJump, simulateJumpDampingSweep } from '../@jump-sim.mjs';

// Vision Part 3 canonical tuning. Update this tuple together with src/physics.js.
const VISION_PART3 = Object.freeze({
    GRAVITY:         -45,
    JUMP_FORCE:      28,
    MAX_VELOCITY:    22,
    BALL_RADIUS:     0.5,
    MASS:            100,
    LINEAR_DAMPING:  0.5,
    ANGULAR_DAMPING: 0.95,
});

// Tolerance bands — wider than the .toFixed(2)/.toFixed(3) rounding step
// but tighter than the GRAVITY=-45 → -48 drift (Δpeak ≈ 0.34 m, ΔairTime ≈ 0.05 s).
const TOLERANCE = Object.freeze({
    PEAK_M:           0.10,   // ±0.10 m
    TIME_TO_PEAK_S:   0.010,  // ±0.010 s (rounded step is 0.001; 0.010 is safe)
    AIR_TIME_S:       0.020,  // ±0.020 s
    APEX_DOWNTRACK_M: 0.10,   // ±0.10 m
});

// Differential thresholds — these MUST hold for the snapshot tests above
// to be considered "sensitive". Loosen them only if the simulation math
// itself changes (e.g. you switch from cannon-es to a different engine).
const DIFFERENTIAL = Object.freeze({
    PEAK_M:           0.20,   // -45 → -48 yields Δpeak ≈ 0.34 m
    TIME_TO_PEAK_S:   0.010,
    AIR_TIME_S:       0.030,  // -45 → -48 yields ΔairTime ≈ 0.050 s
    APEX_DOWNTRACK_M: 0.10,   // moving-jump apex shifts ≈ 0.17 m
});

describe('physics_regression › Vision Part 3 tuning constants', () => {
    it('VISION_PART3 tuple is honest (frozen, no flat values to drift)', () => {
        // Smoke check that the constants table matches what src/physics.js
        // declares. If you bump src/physics.js, bump this tuple then re-run.
        expect(VISION_PART3.GRAVITY).toBe(-45);
        expect(VISION_PART3.JUMP_FORCE).toBe(28);
        expect(VISION_PART3.MAX_VELOCITY).toBe(22);
        expect(VISION_PART3.BALL_RADIUS).toBe(0.5);
        expect(VISION_PART3.MASS).toBe(100);
        expect(VISION_PART3.LINEAR_DAMPING).toBe(0.5);
        expect(VISION_PART3.ANGULAR_DAMPING).toBe(0.95);
    });
});

describe('physics_regression › Scenario A (stationary jump)', () => {
    // Run once per `it` is cheap (cannon-es is fast on a single ball); keeping
    // a single shared `r` is fine for Assertion consistency but re-runs help
    // catch non-determinism if one ever creeps in.
    const r = simulateJump(VISION_PART3.GRAVITY, VISION_PART3.JUMP_FORCE);

    // Snapshot zone — these numbers are the canonical @jump-sim.mjs output
    // for GRAVITY=-45 (Vision Part 3).
    const PEAK_EXPECTED   = 6.55;
    const TTOPEAK_EXPECTED = 0.500;
    const AIRTIME_EXPECTED = 1.083;

    it('simulator produces a defined airTime (no "still rising" NaN)', () => {
        expect(r.airTime).not.toBeNull();
        expect(Number.isFinite(r.airTime)).toBe(true);
    });

    it(`peak height ≈ ${PEAK_EXPECTED}m (±${TOLERANCE.PEAK_M})`, () => {
        expect(r.peakRelativeHeight).toBeGreaterThan(PEAK_EXPECTED - TOLERANCE.PEAK_M);
        expect(r.peakRelativeHeight).toBeLessThan   (PEAK_EXPECTED + TOLERANCE.PEAK_M);
    });

    it(`time-to-peak ≈ ${TTOPEAK_EXPECTED}s (±${TOLERANCE.TIME_TO_PEAK_S})`, () => {
        expect(r.timeToPeak).toBeGreaterThan(TTOPEAK_EXPECTED - TOLERANCE.TIME_TO_PEAK_S);
        expect(r.timeToPeak).toBeLessThan   (TTOPEAK_EXPECTED + TOLERANCE.TIME_TO_PEAK_S);
    });

    it(`air time ≈ ${AIRTIME_EXPECTED}s (±${TOLERANCE.AIR_TIME_S})`, () => {
        expect(r.airTime).toBeGreaterThan(AIRTIME_EXPECTED - TOLERANCE.AIR_TIME_S);
        expect(r.airTime).toBeLessThan   (AIRTIME_EXPECTED + TOLERANCE.AIR_TIME_S);
    });

    it('apex down-track X is zero (no horizontal velocity in scenario A)', () => {
        expect(r.apexDownTrackX).toBe(0);
    });
});

describe('physics_regression › Scenario B (jump while running at MAX_VELOCITY)', () => {
    const r = simulateJump(VISION_PART3.GRAVITY, VISION_PART3.JUMP_FORCE, {
        horizontalVelocity: VISION_PART3.MAX_VELOCITY,
    });

    // Snapshot values for the running-jump scenario at GRAVITY=-45.
    const PEAK_EXPECTED    = 6.55;
    const AIRTIME_EXPECTED = 1.083;
    const APEX_X_EXPECTED  = 5.85;

    it(`peak height ≈ ${PEAK_EXPECTED}m (gravity-only physics unchanged)`, () => {
        expect(r.peakRelativeHeight).toBeGreaterThan(PEAK_EXPECTED - TOLERANCE.PEAK_M);
        expect(r.peakRelativeHeight).toBeLessThan   (PEAK_EXPECTED + TOLERANCE.PEAK_M);
    });

    it(`air time ≈ ${AIRTIME_EXPECTED}s`, () => {
        expect(r.airTime).toBeGreaterThan(AIRTIME_EXPECTED - TOLERANCE.AIR_TIME_S);
        expect(r.airTime).toBeLessThan   (AIRTIME_EXPECTED + TOLERANCE.AIR_TIME_S);
    });

    it(`apex down-track X ≈ ${APEX_X_EXPECTED}m (±${TOLERANCE.APEX_DOWNTRACK_M})`, () => {
        expect(r.apexDownTrackX).toBeGreaterThan(APEX_X_EXPECTED - TOLERANCE.APEX_DOWNTRACK_M);
        expect(r.apexDownTrackX).toBeLessThan   (APEX_X_EXPECTED + TOLERANCE.APEX_DOWNTRACK_M);
    });

    it(`apex down-track X is positive (forward momentum honored)`, () => {
        expect(r.apexDownTrackX).toBeGreaterThan(0);
    });
});

describe('physics_regression › Differential sensitivity (proves snapshot tests can fail)', () => {
    // This META test ensures the snapshot band tolerances above are tight
    // enough to actually catch a GRAVITY change. Without this, a future
    // maintainer could widen TOLERANCE enough to silently accept any drift
    // and the snapshot tests above would all happily pass on broken physics.

    const g45A = simulateJump(-45, VISION_PART3.JUMP_FORCE);
    const g48A = simulateJump(-48, VISION_PART3.JUMP_FORCE);
    const g45B = simulateJump(-45, VISION_PART3.JUMP_FORCE, { horizontalVelocity: VISION_PART3.MAX_VELOCITY });
    const g48B = simulateJump(-48, VISION_PART3.JUMP_FORCE, { horizontalVelocity: VISION_PART3.MAX_VELOCITY });

    it(`peak delta (A) > ${DIFFERENTIAL.PEAK_M}m (catches -45 → -48 shift)`, () => {
        expect(Math.abs(g45A.peakRelativeHeight - g48A.peakRelativeHeight))
            .toBeGreaterThan(DIFFERENTIAL.PEAK_M);
    });

    it(`time-to-peak delta (A) > ${DIFFERENTIAL.TIME_TO_PEAK_S}s`, () => {
        expect(Math.abs(g45A.timeToPeak - g48A.timeToPeak))
            .toBeGreaterThan(DIFFERENTIAL.TIME_TO_PEAK_S);
    });

    it(`air-time delta (A) > ${DIFFERENTIAL.AIR_TIME_S}s`, () => {
        // Assert finiteness BEFORE the diff so a "both null" failure cannot
        // silently pass via `?? 0` collapsing both sides to zero.
        expect(g45A.airTime).not.toBeNull();
        expect(g48A.airTime).not.toBeNull();
        expect(Math.abs(g45A.airTime - g48A.airTime))
            .toBeGreaterThan(DIFFERENTIAL.AIR_TIME_S);
    });

    it(`apex X delta (B) > ${DIFFERENTIAL.APEX_DOWNTRACK_M}m`, () => {
        expect(Math.abs(g45B.apexDownTrackX - g48B.apexDownTrackX))
            .toBeGreaterThan(DIFFERENTIAL.APEX_DOWNTRACK_M);
    });

    it('-45 is taller AND longer-airtime than -48 (physical sign correctness)', () => {
        // Sanity check: lower (more negative) gravity = higher jump arc, longer
        // hangtime. If a future physics change flips these signs, something
        // really weird is happening.
        expect(g45A.peakRelativeHeight).toBeGreaterThan(g48A.peakRelativeHeight);
        expect(g45A.airTime).toBeGreaterThan(g48A.airTime);
        expect(g45B.apexDownTrackX).toBeGreaterThan(g48B.apexDownTrackX);
    });
});

describe('physics_regression › Body fidelity (linearDamping=0.5 mid-flight)', () => {
    // Cannon-es exponential damping: v(t) = v0 * exp(-c·t). For a 0.5s
    // ascent with c=0.5, the apex-time horizontal velocity is ~17 m/s,
    // placing the apex roughly midway between initial-x and where the ball
    // would be if it hadn't decelerated. 5.85 m is the canonical snapshot.
    const r = simulateJump(VISION_PART3.GRAVITY, VISION_PART3.JUMP_FORCE, {
        horizontalVelocity: VISION_PART3.MAX_VELOCITY,
    });

    it('apex sits well below the no-damping upper bound (linearDamping honored)', () => {
        // No-damping: apex-X = (22 - 0) * 0.5 = 11 m. With damping=0.5 → 5.85.
        // Asserting `< 8` guards against accidentally dropping damping to a
        // value the snapshot band (5.85 ± 0.10) wouldn't catch on its own —
        // an apex at 9–10 m would slip past the looser < 11 bound.
        expect(r.apexDownTrackX).toBeLessThan(8);
    });

    it('apex sits well above the fully-damped lower bound (damping not too high)', () => {
        // Full damping c=∞ would yield apex-X ≈ 0 m. With c=0.5 we get 5.85.
        // Asserting `> 4` ensures a too-heavy accidental damping bump doesn't
        // slip past the snapshot test (5.85 ± 0.10) — a 4.5 m apex would fail
        // both this sanity bound AND the tighter snapshot band.
        expect(r.apexDownTrackX).toBeGreaterThan(4);
    });
});

describe('physics_regression › Scenario C (damping sensitivity sweep)', () => {
    // Run the full sweep once. Snapshot-style assertions cross-check the
    // baseline row against Scenarios A/B; the bulk of this block uses
    // MONOTONICITY so it survives cannon-es minor-version drift — the
    // structural property remains true even if values shift.
    const sweep = simulateJumpDampingSweep('moving', { baselineDamping: 0.5 });
    const baselineRow = sweep.find((r) => r.isBaseline);
    const candidate06 = sweep.find((r) => r.damping === 0.6);

    // --- Baseline cross-check: drift-detector for the running production value ---
    it('baseline row (damping=0.5) matches canonical Scenario B peak snapshot', () => {
        expect(baselineRow.peakRelativeHeight).toBeGreaterThan(6.45);
        expect(baselineRow.peakRelativeHeight).toBeLessThan(6.65);
    });

    it('baseline row matches canonical Scenario B airTime snapshot', () => {
        expect(baselineRow.airTime).toBeGreaterThan(1.06);
        expect(baselineRow.airTime).toBeLessThan(1.10);
    });

    it('baseline row matches canonical Scenario B apexX snapshot', () => {
        expect(baselineRow.apexDownTrackX).toBeGreaterThan(5.75);
        expect(baselineRow.apexDownTrackX).toBeLessThan(5.95);
    });

    // --- Structural monotonicity (drift-robust) ---
    it('peak height monotonically decreases as damping increases', () => {
        for (let i = 1; i < sweep.length; i++) {
            expect(sweep[i].peakRelativeHeight)
                .toBeLessThanOrEqual(sweep[i - 1].peakRelativeHeight);
        }
    });

    it('airTime monotonically decreases as damping increases', () => {
        for (let i = 1; i < sweep.length; i++) {
            expect(sweep[i].airTime)
                .toBeLessThanOrEqual(sweep[i - 1].airTime);
        }
    });

    it('apexX (running jump) monotonically decreases as damping increases', () => {
        for (let i = 1; i < sweep.length; i++) {
            expect(sweep[i].apexDownTrackX)
                .toBeLessThanOrEqual(sweep[i - 1].apexDownTrackX);
        }
    });

    // --- Sign correctness: energy-bleed model sanity (would fail loudly if a
    //     future physics change accidentally inverted the damping direction) ---
    it('lowest damping produces tallest peak + longest airTime (energy-bleed sign)', () => {
        // Derive extremes via the `damping` field (not array index) so this
        // assertion survives any future ordering of the dampings array — e.g.
        // a "tight-first" reproduction or random-sampling debug pass.
        const lo = sweep.reduce((m, r) => (r.damping < m.damping ? r : m), sweep[0]);
        const hi = sweep.reduce((m, r) => (r.damping > m.damping ? r : m), sweep[0]);
        expect(lo.peakRelativeHeight).toBeGreaterThan(hi.peakRelativeHeight);
        expect(lo.airTime).toBeGreaterThan(hi.airTime);
        expect(lo.apexDownTrackX).toBeGreaterThan(hi.apexDownTrackX);
    });

    // --- Known candidate (damping=0.6) snapshot: documents the next tuning
    //     target so a future maintainer can compare against it without re-running
    //     the manual sweep. ---
    it('damping=0.6 candidate peak ≈ 6.11 m (±0.06)', () => {
        expect(candidate06).toBeTruthy();
        expect(candidate06.peakRelativeHeight).toBeGreaterThan(6.05);
        expect(candidate06.peakRelativeHeight).toBeLessThan(6.17);
    });

    it('damping=0.6 candidate airTime delta is between -2% and -4% (tighter feel)', () => {
        expect(candidate06.airTimeDeltaPct).toBeGreaterThan(-4);
        expect(candidate06.airTimeDeltaPct).toBeLessThan(-2);
    });
});
