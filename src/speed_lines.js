/*
 Speed-lines module.
 Exports: initSpeedLines(game), updateSpeedLines(game, dt), disposeSpeedLines(game)

 Renders radial streak lines around the camera when the ball moves fast.
 Intensity fades in proportionally to horizontal speed / MAX_VELOCITY (22).
 Lines start appearing around 40 % of max speed and reach full opacity at 100 %.
*/
import * as THREE from 'three';
import { MAX_VELOCITY } from './physics.js';

// How many radial line segments to allocate (each = 1 line)
const LINE_COUNT = 64;
// Radius of the cylinder the lines live on (world units)
const CYLINDER_RADIUS = 6;
// Length of each streak (world units along forward direction)
const STREAK_LENGTH = 18;
// Speed as fraction of MAX_VELOCITY where lines begin to appear
const FADE_IN_MIN = 0.35;

// Pre-allocated pooled vectors (avoid per-frame GC allocations)
const _camDir = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

/**
 * One-time setup — allocates geometry and adds the Points object to the scene.
 * Call once during initPhysics / initScene.
 */
export function initSpeedLines(game) {
    try {
        const positions = new Float32Array(LINE_COUNT * 6); // 2 verts × 3 components per line
        const offsets = new Float32Array(LINE_COUNT);        // random Z offset for staggered entry

        // Pre-populate with random radial positions
        for (let i = 0; i < LINE_COUNT; i++) {
            const angle = (i / LINE_COUNT) * Math.PI * 2;
            const r = CYLINDER_RADIUS * (0.6 + Math.random() * 0.5);
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            // Start all at z=0 (will be positioned each frame)
            positions[i * 6 + 0] = x;
            positions[i * 6 + 1] = y;
            positions[i * 6 + 2] = -STREAK_LENGTH;
            positions[i * 6 + 3] = x;
            positions[i * 6 + 4] = y;
            positions[i * 6 + 5] = 0;
            offsets[i] = Math.random();
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const lines = new THREE.LineSegments(geometry, material);
        lines.frustumCulled = false;
        lines.renderOrder = 999; // render after most scene geometry

        game.scene.add(lines);

        game._speedLines = {
            lines,
            geometry,
            material,
            offsets,
            currentOpacity: 0
        };
    } catch (e) {
        console.warn('initSpeedLines failed', e);
    }
}

/**
 * Per-frame update — repositions streaks around the camera, adjusts opacity.
 * Call from the animate loop after updateCamera().
 */
export function updateSpeedLines(game, dt) {
    try {
        const sl = game._speedLines;
        if (!sl || !sl.lines) return;

        // Compute horizontal speed ratio
        const vel = game.ballBody.velocity;
        const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        const speedRatio = Math.min(1, hSpeed / MAX_VELOCITY);

        // Target opacity: zero below FADE_IN_MIN, ramp to max 0.45 at full speed
        const targetOpacity = speedRatio > FADE_IN_MIN
            ? ((speedRatio - FADE_IN_MIN) / (1 - FADE_IN_MIN)) * 0.45
            : 0;

        // Smooth transition
        sl.currentOpacity += (targetOpacity - sl.currentOpacity) * Math.min(1, 4 * dt);
        sl.material.opacity = sl.currentOpacity;

        // If nearly invisible, skip position updates for perf
        if (sl.currentOpacity < 0.005) {
            sl.lines.visible = false;
            return;
        }
        sl.lines.visible = true;

        // Position lines relative to camera so they streak past it
        const camPos = game.camera.position;
        game.camera.getWorldDirection(_camDir);

        // Compute a "right" and "up" perpendicular to camera direction
        _right.crossVectors(_camDir, _worldUp).normalize();
        _up.crossVectors(_right, _camDir).normalize();

        const positions = sl.geometry.attributes.position.array;
        const offsets = sl.offsets;

        for (let i = 0; i < LINE_COUNT; i++) {
            const angle = (i / LINE_COUNT) * Math.PI * 2;
            const r = CYLINDER_RADIUS * (0.6 + offsets[i] * 0.5);

            // Radial direction (perpendicular to camera forward)
            const rx = Math.cos(angle) * r;
            const ry = Math.sin(angle) * r;

            // Position at camera + radial offset + forward stretch
            // Stagger the z-offset per line so they don't all appear at once
            const zOff = offsets[i] * STREAK_LENGTH;

            // Far end (streak tail)
            const ix = i * 6;
            positions[ix + 0] = camPos.x + _right.x * rx + _up.x * ry + _camDir.x * (zOff + STREAK_LENGTH);
            positions[ix + 1] = camPos.y + _right.y * rx + _up.y * ry + _camDir.y * (zOff + STREAK_LENGTH);
            positions[ix + 2] = camPos.z + _right.z * rx + _up.z * ry + _camDir.z * (zOff + STREAK_LENGTH);

            // Near end
            positions[ix + 3] = camPos.x + _right.x * rx + _up.x * ry + _camDir.x * zOff;
            positions[ix + 4] = camPos.y + _right.y * rx + _up.y * ry + _camDir.y * zOff;
            positions[ix + 5] = camPos.z + _right.z * rx + _up.z * ry + _camDir.z * zOff;
        }

        sl.geometry.attributes.position.needsUpdate = true;

        // Subtle color shift at very high speed (warm tint)
        if (speedRatio > 0.8) {
            const t = (speedRatio - 0.8) / 0.2;
            const r = 255;
            const g = Math.floor(255 - t * 60);
            const b = Math.floor(255 - t * 120);
            sl.material.color.setRGB(r / 255, g / 255, b / 255);
        } else {
            sl.material.color.setRGB(1, 1, 1);
        }
    } catch (e) {
        // Silently ignore — speed lines are purely cosmetic
    }
}

/**
 * Cleanup — removes speed lines from scene and disposes GPU resources.
 */
export function disposeSpeedLines(game) {
    try {
        const sl = game._speedLines;
        if (!sl) return;
        if (sl.lines) {
            game.scene.remove(sl.lines);
        }
        if (sl.geometry) sl.geometry.dispose();
        if (sl.material) sl.material.dispose();
        game._speedLines = null;
    } catch (e) {}
}
