// Jump-arc simulation comparing GRAVITY=-45 vs GRAVITY=-48, with horizontal
// motion at MAX_VELOCITY=22 so the comparison reflects actual gameplay feel.
//
// Ball body mirrors src/physics.js: mass=100, BALL_RADIUS=0.5,
// linearDamping=0.15, angularDamping=0.95.   // feel-pass 2026-06-26 round 3 (was 0.5)
// JUMP_FORCE=28, dt=1/60.
//
// Airtime is measured as "first re-cross of starting altitude" so it's
// independent of ground friction, damping, or where the ball eventually rests.
//
// Exports:
//   simulateJump(gravity, jumpForce, opts?) -> { peakRelativeHeight, timeToPeak,
//                                               airTime, apexDownTrackX, ... }
//
// Imported by tests/physics_regression.test.js for the GRAVITY=-45 snapshot
// regression. The CLI block at the bottom only runs when this file is the
// entry point (`node @jump-sim.mjs`), not when imported by tests.
import * as CANNON from 'cannon-es';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

export function simulateJump(gravity, jumpForce, opts = {}) {
    const mass = opts.mass ?? 100;
    const ballRadius = opts.ballRadius ?? 0.5;
    const linearDamping = opts.linearDamping ?? 0.15;  // feel-pass 2026-06-26 round 3 (was 0.5)
    const angularDamping = opts.angularDamping ?? 0.95;
    const horizontalVelocity = opts.horizontalVelocity ?? 0;

    const world = new CANNON.World();
    world.gravity.set(0, gravity, 0);

    const groundShape = new CANNON.Plane();
    const ground = new CANNON.Body({ mass: 0, shape: groundShape });
    ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    ground.position.y = 0; // plane passes through y=0 with normal +Y
    world.addBody(ground);

    const ballShape = new CANNON.Sphere(ballRadius);
    const body = new CANNON.Body({
        mass, shape: ballShape,
        linearDamping, angularDamping
    });
    // Start with ball resting on ground (= y = ballRadius)
    body.position.set(0, ballRadius, 0);
    world.addBody(body);

    body.velocity.set(horizontalVelocity, jumpForce, 0);

    const dt = 1 / 60;
    const MAX_STEPS = 600; // 10 seconds upper bound
    const startY = body.position.y;

    let peakY = startY;
    let peakT = 0;
    let airTime = null;
    let apexDistanceX = 0;
    const samples = [];

    let prevY = startY;

    for (let step = 0; step < MAX_STEPS; step++) {
        world.step(dt);
        const t = (step + 1) * dt;

        if (body.position.y > peakY) {
            peakY = body.position.y;
            peakT = t;
            apexDistanceX = body.position.x;
        }

        // Airtime = first frame ball dips back to start altitude after ascending.
        // We require vy<=0 and y<=startY+0.01; ignore first few frames near t=0.
        if (
            airTime == null &&
            t > 0.05 &&
            body.position.y <= startY + 0.01 &&
            body.velocity.y <= 0 &&
            prevY > startY
        ) {
            airTime = t;
        }
        prevY = body.position.y;

        // Sample every 0.1s of simulation time using integer step counters
        // (60Hz × 6 steps = 0.1s) — robust to float drift.
        if (step > 0 && step % 6 === 0) {
            samples.push({
                t: +t.toFixed(2),
                x: +body.position.x.toFixed(2),
                y: +body.position.y.toFixed(2)
            });
        }

        // Stop when the ball has clearly settled on the ground after the jump.
        if (
            airTime != null &&
            Math.abs(body.velocity.y) < 0.05 &&
            Math.abs(body.position.y - ballRadius) < 0.05 &&
            t - airTime > 0.4
        ) {
            break;
        }
    }

    if (airTime == null) {
        console.warn(`[WARN] GRAVITY=${gravity}: airTime never computed (still rising after MAX_STEPS).`);
    }

    // Reference heights relative to ball center at rest (startY = ballRadius).
    const peakHeightOverall = peakY - startY;
    return {
        gravity,
        horizontalVelocity,
        peakRelativeHeight: +peakHeightOverall.toFixed(2),
        timeToPeak: +peakT.toFixed(3),
        airTime: airTime != null ? +airTime.toFixed(3) : null,
        apexDownTrackX: +apexDistanceX.toFixed(2),
        samples
    };
}

// ---------------------------------------------------------------------------
// Scenario C helper: damping sensitivity sweep.
// Used by the CLI report AND by tests/physics_regression.test.js as an
// "extended sanity table" — a future maintainer changing linearDamping can see
// at a glance how a candidate value compares to the current baseline.
//
// Args:
//   scenario   - 'moving' (default, MAX_VELOCITY=22) or 'stationary' (vx=0)
//   opts.dampings         - array of linearDamping values to sweep
//   opts.baselineDamping  - which row of `dampings` deltas are computed against
//   opts.gravity / gravity / jumpForce - same as simulateJump
//
// Returns a flat array of rows. Each row exposes:
//   damping, isBaseline, peakRelativeHeight, timeToPeak, airTime,
//   apexDownTrackX, plus absolute and percentage deltas vs the baseline row.
// ---------------------------------------------------------------------------
export function simulateJumpDampingSweep(scenario = 'moving', opts = {}) {
    // feel-pass 2026-06-26 round 3: sweep re-centered on the new baseline 0.15.
    const dampings = opts.dampings ?? [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35];
    const baselineDamping = opts.baselineDamping ?? 0.15;
    const gravity = opts.gravity ?? -45;
    const jumpForce = opts.jumpForce ?? 28;
    const maxVelocity = scenario === 'moving' ? 22 : 0;

    if (!dampings.includes(baselineDamping)) {
        throw new Error(
            `simulateJumpDampingSweep: baselineDamping=${baselineDamping} not in ` +
            `dampings array [${dampings.join(', ')}]`
        );
    }

    // Run the per-damping sims.
    const results = dampings.map((d) => simulateJump(gravity, jumpForce, {
        linearDamping: d,
        horizontalVelocity: maxVelocity,
    }));

    const base = results[dampings.indexOf(baselineDamping)];

    return dampings.map((d, i) => {
        const r = results[i];
        const pctDelta = (k) => base[k]
            ? +(((r[k] - base[k]) / base[k]) * 100).toFixed(2)
            : null;
        return {
            damping: d,
            isBaseline: d === baselineDamping,
            // Raw measured values (already rounded by simulateJump).
            peakRelativeHeight: r.peakRelativeHeight,
            timeToPeak: r.timeToPeak,
            airTime: r.airTime,
            apexDownTrackX: r.apexDownTrackX,
            // Absolute deltas vs baseline.
            peakDeltaM: +(r.peakRelativeHeight - base.peakRelativeHeight).toFixed(2),
            airTimeDeltaS: +(r.airTime - base.airTime).toFixed(3),
            apexXDeltaM: +(r.apexDownTrackX - base.apexDownTrackX).toFixed(2),
            // Percentage deltas vs baseline.
            peakDeltaPct: pctDelta('peakRelativeHeight'),
            airTimeDeltaPct: pctDelta('airTime'),
            apexXDeltaPct: pctDelta('apexDownTrackX'),
        };
    });
}

// CLI block: only run when this file is invoked directly (e.g. `node @jump-sim.mjs`).
// When imported by tests, vitest rewrites import.meta.url under its module graph and
// the canonical pathToFileURL(resolve(argv[1])) no longer matches — so the CLI block
// correctly stays silent in test imports.
const isCliEntry = (() => {
    const arg = process.argv[1];
    if (!arg) return false;
    try {
        return pathToFileURL(resolvePath(arg)).href === import.meta.url;
    } catch {
        return false;
    }
})();

if (!isCliEntry) {
    // Module-imported: do not run CLI output, just export.
} else {
    runCliReport();
}

function runCliReport() {
console.log('=== JUMP-ARC SIMULATION ===');
console.log('Ball: mass=100, BALL_RADIUS=0.5, linearDamp=0.15, angularDamp=0.95');  // feel-pass 2026-06-26 round 3 (was 0.5)
console.log('JUMP_FORCE=28, dt=1/60\n');
console.log('SCENARIO A: stationary jump (vertical only)');
const g45a = simulateJump(-45, 28);
const g48a = simulateJump(-48, 28);
console.log('  GRAVITY=-45 :', JSON.stringify({ peak: g45a.peakRelativeHeight, tToPeak: g45a.timeToPeak, airTime: g45a.airTime }));
console.log('  GRAVITY=-48 :', JSON.stringify({ peak: g48a.peakRelativeHeight, tToPeak: g48a.timeToPeak, airTime: g48a.airTime }));

console.log('\nSCENARIO B: jump while running at MAX_VELOCITY=22');
const g45b = simulateJump(-45, 28, { horizontalVelocity: 22 });
const g48b = simulateJump(-48, 28, { horizontalVelocity: 22 });
console.log('  GRAVITY=-45 :', JSON.stringify({ peak: g45b.peakRelativeHeight, tToPeak: g45b.timeToPeak, airTime: g45b.airTime, apexX: g45b.apexDownTrackX }));
console.log('  GRAVITY=-48 :', JSON.stringify({ peak: g48b.peakRelativeHeight, tToPeak: g48b.timeToPeak, airTime: g48b.airTime, apexX: g48b.apexDownTrackX }));

console.log('\n=== COMPARISON (Scenario A — stationary) ===');
const dh = g45a.peakRelativeHeight - g48a.peakRelativeHeight;
const dt = g45a.timeToPeak - g48a.timeToPeak;
const da = (g45a.airTime ?? 0) - (g48a.airTime ?? 0);
console.log(`Peak height delta:  +${dh.toFixed(2)} m  (${(dh / g48a.peakRelativeHeight * 100).toFixed(1)}% taller)`);
console.log(`Time to peak delta: +${dt.toFixed(3)} s  (${(dt / g48a.timeToPeak * 100).toFixed(1)}% longer)`);
console.log(`Air time delta:     +${da.toFixed(3)} s  (${(da / g48a.airTime * 100).toFixed(1)}% longer)`);

console.log('\n=== COMPARISON (Scenario B — moving at MAX_VELOCITY) ===');
const dhb = g45b.peakRelativeHeight - g48b.peakRelativeHeight;
const dtb = g45b.timeToPeak - g48b.timeToPeak;
const dab = (g45b.airTime ?? 0) - (g48b.airTime ?? 0);
const dxb = g45b.apexDownTrackX - g48b.apexDownTrackX;
console.log(`Peak height delta:  +${dhb.toFixed(2)} m  (${(dhb / g48b.peakRelativeHeight * 100).toFixed(1)}% taller)`);
console.log(`Time to peak delta: +${dtb.toFixed(3)} s  (${(dtb / g48b.timeToPeak * 100).toFixed(1)}% longer)`);
console.log(`Air time delta:     +${dab.toFixed(3)} s  (${(dab / g48b.airTime * 100).toFixed(1)}% longer)`);
console.log(`Apex down-track X:  ${dxb.toFixed(2)} m further when GRAVITY=-45  (apex sits later in flight)`);

console.log('\n=== SCENARIO C: damping sensitivity sweep (moving jump at GRAVITY=-45) ===');
const dampingSweep = simulateJumpDampingSweep('moving', { baselineDamping: 0.15 });  // feel-pass 2026-06-26 round 3
console.table(dampingSweep.map((r) => ({
    damping:         r.damping,
    'peak (m)':      r.peakRelativeHeight,
    'peak Δ%':       `${r.peakDeltaPct}%`,
    'airTime (s)':   r.airTime,
    'airTime Δ%':    `${r.airTimeDeltaPct}%`,
    'apexX (m)':     r.apexDownTrackX,
    'apexX Δ%':      `${r.apexXDeltaPct}%`,
    baseline:        r.isBaseline ? '← current' : '',
})));

console.log('\n=== DECISION MATRIX ===');
console.log(`At GRAVITY=-45 (vision Part 3, current):`);
console.log(`  • ~${dh.toFixed(2)} m taller jump arc (+${(dh/g48a.peakRelativeHeight*100).toFixed(1)}%)`);
console.log(`  • ~${Math.round(dt*60)} frames longer hangtime (+${(dt*1000).toFixed(0)} ms)`);
console.log(`  • When running at MAX_VELOCITY=22, the apex sits ${dxb.toFixed(2)} m further down-track.`);
console.log(`Vision intent: explicitly -45. Previous -48 was an ad-hoc tuning bump.`);
}
