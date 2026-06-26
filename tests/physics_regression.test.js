// Physics regression tests for Going Balls.
//
// Pins the GRAVITY=-45 behavior documented in Vision Part 3 of the platform
// vision doc. A change to GRAVITY (or JUMP_FORCE, mass, damping, BALL_RADIUS,
// MAX_VELOCITY) should FAIL this file unless the snapshot is intentionally
// updated alongside the physics.js change.
//
// Snapshot bands are intentionally looser than the rounding step (toFixed(2)/(3))
// to allow for numerical jitter but tight enough to catch GRAVITY -45 → -88 drift.

import { describe, it, expect } from 'vitest';
import { simulateJump, simulateJumpDampingSweep } from '../@jump-sim.mjs';

// Tolerance bands — wider than rounding step, tighter than tolerated drift.
const TOLERANCE = Object.freeze({
    PEAK_M:           0.10,   // ±0.10 m
    AIR_TIME_S:       0.020,  // ±0.020 s
    APEX_DOWNTRACK_M: 0.10,   // ±0.10 m
});

// Differential thresholds — these MUST hold for the snapshot tests above
// to be considered sensitive. Loosen only if the simulation math itself changes.
const DIFFERENTIAL = Object.freeze({
    PEAK_M:           0.20,   // -45 → -48 yields Δpeak ≈ 0.34 m
    AIR_TIME_S:       0.030,  // -45 → -48 yields ΔairTime ≈ 0.050 s
});

const r = simulateJump(-45, 28);
const rB = simulateJump(-45, 28, { horizontalVelocity: 22 });

describe('Scenario A — stationary jump (GRAVITY=-45)', () => {
    it(`peak height ≈ 6.55 m (±${TOLERANCE.PEAK_M})`, () => {
        expect(r.peakRelativeHeight).toBeGreaterThan(6.55 - TOLERANCE.PEAK_M);
        expect(r.peakRelativeHeight).toBeLessThan   (6.55 + TOLERANCE.PEAK_M);
    });

    it(`air time ≈ 1.083 s (±${TOLERANCE.AIR_TIME_S})`, () => {
        expect(r.airTime).toBeGreaterThan(1.083 - TOLERANCE.AIR_TIME_S);
        expect(r.airTime).toBeLessThan   (1.083 + TOLERANCE.AIR_TIME_S);
    });
});

describe('Scenario B — jump while running at MAX_VELOCITY=22', () => {
    it('apex down-track X is positive (forward momentum honored)', () => {
        expect(rB.apexDownTrackX).toBeGreaterThan(0);
    });

    it(`apex down-track X ≈ 5.85 m (±${TOLERANCE.APEX_DOWNTRACK_M})`, () => {
        expect(rB.apexDownTrackX).toBeGreaterThan(5.85 - TOLERANCE.APEX_DOWNTRACK_M);
        expect(rB.apexDownTrackX).toBeLessThan   (5.85 + TOLERANCE.APEX_DOWNTRACK_M);
    });
});

describe('Differential sensitivity (proves snapshot bands can fail)', () => {
    // META test: gravity -45 → -48 must produce a delta larger than the
    // tolerance band above, otherwise a future maintainer could widen
    // TOLERANCE enough to silently accept any physics change.
    const g48A  = simulateJump(-48, 28);
    const g48B  = simulateJump(-48, 28, { horizontalVelocity: 22 });

    it(`peak delta > ${DIFFERENTIAL.PEAK_M}m (catches -45 → -48 shift)`, () => {
        expect(Math.abs(r.peakRelativeHeight - g48A.peakRelativeHeight))
            .toBeGreaterThan(DIFFERENTIAL.PEAK_M);
    });

    it(`air-time delta > ${DIFFERENTIAL.AIR_TIME_S}s`, () => {
        expect(r.airTime).not.toBeNull();
        expect(g48A.airTime).not.toBeNull();
        expect(Math.abs(r.airTime - g48A.airTime))
            .toBeGreaterThan(DIFFERENTIAL.AIR_TIME_S);
    });

    it('-45 is taller, longer-airtime, and reaches further than -48', () => {
        expect(r.peakRelativeHeight).toBeGreaterThan(g48A.peakRelativeHeight);
        expect(r.airTime).toBeGreaterThan(g48A.airTime);
        expect(rB.apexDownTrackX).toBeGreaterThan(g48B.apexDownTrackX);
    });
});

describe('Body fidelity — linearDamping=0.5 mid-flight', () => {
    // No-damping apex-X = 22 × 0.5 = 11 m. With c=0.5, cannon-es yields 5.85 m.
    // Fully-damped apex-X → 0. Bounds [4, 8] catch accidental drift in either
    // direction that the tighter snapshot band (5.85 ± 0.10) might miss.
    it('apex sits between 4 m and 8 m down-track (damping in ballpark)', () => {
        expect(rB.apexDownTrackX).toBeGreaterThan(4);
        expect(rB.apexDownTrackX).toBeLessThan(8);
    });
});

describe('Scenario C — damping sensitivity sweep', () => {
    // Property-based assertions — drift-robust across cannon-es minor versions.
    const sweep = simulateJumpDampingSweep('moving', { baselineDamping: 0.5 });

    it('peak, airTime, apexX monotonically decrease as damping increases', () => {
        for (const metric of ['peakRelativeHeight', 'airTime', 'apexDownTrackX']) {
            for (let i = 1; i < sweep.length; i++) {
                expect(sweep[i][metric])
                    .toBeLessThanOrEqual(sweep[i - 1][metric]);
            }
        }
    });

    it('lowest damping produces the tallest peak (energy-bleed sign invariant)', () => {
        const lo = sweep.reduce((m, r) => (r.damping < m.damping ? r : m), sweep[0]);
        const hi = sweep.reduce((m, r) => (r.damping > m.damping ? r : m), sweep[0]);
        expect(lo.peakRelativeHeight).toBeGreaterThan(hi.peakRelativeHeight);
    });
});
