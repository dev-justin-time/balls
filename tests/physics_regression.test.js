// Physics regression tests for Going Balls.
//
// Pins the GRAVITY=-45 behavior documented in Vision Part 3 of the platform
// vision doc. A change to GRAVITY (or JUMP_FORCE, mass, BALL_RADIUS, MAX_VELOCITY)
// should FAIL this file unless the snapshot is intentionally updated alongside
// the physics.js change. linearDamping is no longer pinned here — see the
// matching @jump-sim.mjs default (0.15) and src/physics.js Body for the
// canonical value, and Scenario C for the sensitivity sweep.
//
// Snapshot bands are intentionally looser than the rounding step (toFixed(2)/(3))
// to allow for numerical jitter but tight enough to catch GRAVITY -45 → -88 drift.
//
// feel-pass 2026-06-26 round 3: linearDamping 0.5 → 0.15. Snapshot values
// retuned: peak 6.55→7.92m, airTime 1.083→1.20s, apexDownTrackX 5.85→7.73m.
// Body fidelity wide bounds widened [4,8]→[4,9] for jitter margin.

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
    it(`peak height ≈ 7.92 m (±${TOLERANCE.PEAK_M}) — feel-pass 2026-06-26 round 3 (was 6.55)`, () => {
        expect(r.peakRelativeHeight).toBeGreaterThan(7.92 - TOLERANCE.PEAK_M);
        expect(r.peakRelativeHeight).toBeLessThan   (7.92 + TOLERANCE.PEAK_M);
    });

    it(`air time ≈ 1.20 s (±${TOLERANCE.AIR_TIME_S}) — feel-pass 2026-06-26 round 3 (was 1.083)`, () => {
        expect(r.airTime).toBeGreaterThan(1.20 - TOLERANCE.AIR_TIME_S);
        expect(r.airTime).toBeLessThan   (1.20 + TOLERANCE.AIR_TIME_S);
    });
});

describe('Scenario B — jump while running at MAX_VELOCITY=22', () => {
    it('apex down-track X is positive (forward momentum honored)', () => {
        expect(rB.apexDownTrackX).toBeGreaterThan(0);
    });

    it(`apex down-track X ≈ 7.73 m (±${TOLERANCE.APEX_DOWNTRACK_M}) — feel-pass 2026-06-26 round 3 (was 5.85)`, () => {
        expect(rB.apexDownTrackX).toBeGreaterThan(7.73 - TOLERANCE.APEX_DOWNTRACK_M);
        expect(rB.apexDownTrackX).toBeLessThan   (7.73 + TOLERANCE.APEX_DOWNTRACK_M);
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

describe('Body fidelity — linearDamping=0.15 mid-flight', () => {
    // feel-pass 2026-06-26 round 3: damping 0.5 → 0.15, apex-X rises from
    // 5.85 → 7.73 m (closer to the no-damping ceiling of 22×0.5=11 m but
    // still damped below it). Bounds widened [4,8]→[4,9] to give jitter
    // margin across cannon-es numerical integration versions.
    it('apex sits between 4 m and 9 m down-track (damping in ballpark)', () => {
        expect(rB.apexDownTrackX).toBeGreaterThan(4);
        expect(rB.apexDownTrackX).toBeLessThan(9);
    });
});

describe('Scenario C — damping sensitivity sweep', () => {
    // Property-based assertions — drift-robust across cannon-es minor versions.
    const sweep = simulateJumpDampingSweep('moving', { baselineDamping: 0.15 });  // feel-pass 2026-06-26 round 3 (was 0.5)

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
