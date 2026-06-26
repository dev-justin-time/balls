/*
 Motion-blur post-processing module.
 Exports: initMotionBlur(game), updateMotionBlur(game), disposeMotionBlur(game)

 Two-pass approach (no EffectComposer dependency):
   Pass 1 – render scene into an off-screen render target
   Pass 2 – composite to screen via a fullscreen quad with a directional
            blur shader whose direction & intensity are driven by the
            ball's horizontal velocity.

 Blur activates above MOTION_BLUR_THRESHOLD (60 % of MAX_VELOCITY) and
 ramps to full intensity at 100 %.
*/
import * as THREE from 'three';
import { MAX_VELOCITY } from './physics.js';

// --- Tuning ---
const MOTION_BLUR_THRESHOLD = 0.6;   // fraction of MAX_VELOCITY
const MAX_BLUR_SAMPLES = 8;          // texture samples per direction
const BLUR_MAX_STRENGTH = 0.025;     // max UV displacement per sample

// --- Pooled vectors (avoid per-frame GC allocations) ---
const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();

// --- Vertex shader (shared fullscreen quad) ---
const VERT = /* glsl */ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

// --- Fragment shader ---
const FRAG = /* glsl */ `
    uniform sampler2D tScene;
    uniform vec2  uVelocity;      // screen-space velocity (pixels)
    uniform float uIntensity;     // 0 = off, 1 = full
    uniform vec2  uTexelSize;     // 1 / resolution
    varying vec2  vUv;

    void main() {
        vec2 dir = uVelocity * uIntensity;

        vec4 color = texture2D(tScene, vUv);
        float totalWeight = 1.0;

        // Sample along the velocity direction (both sides for centre-weighted blur)
        for (int i = 1; i <= ${MAX_BLUR_SAMPLES}; i++) {
            float t = float(i) / float(${MAX_BLUR_SAMPLES});
            float weight = 1.0 - t * 0.5;            // centre-heavy

            vec2 offset = dir * t * uTexelSize;
            color += texture2D(tScene, vUv + offset) * weight;
            color += texture2D(tScene, vUv - offset) * weight;
            totalWeight += weight * 2.0;
        }

        gl_FragColor = color / totalWeight;
    }
`;

/**
 * One-time setup – creates the render target, fullscreen quad mesh, and material.
 */
export function initMotionBlur(game) {
    try {
        const w = game.renderer.domElement.width;
        const h = game.renderer.domElement.height;

        // Render target (matches canvas resolution)
        const rt = new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });

        // Shader material
        const material = new THREE.ShaderMaterial({
            uniforms: {
                tScene: { value: rt.texture },
                uVelocity: { value: new THREE.Vector2(0, 0) },
                uIntensity: { value: 0 },
                uTexelSize: { value: new THREE.Vector2(1 / w, 1 / h) }
            },
            vertexShader: VERT,
            fragmentShader: FRAG,
            depthTest: false,
            depthWrite: false
        });

        // Fullscreen quad (clip-space geometry: -1..1)
        const geo = new THREE.PlaneGeometry(2, 2);
        const quad = new THREE.Mesh(geo, material);
        quad.frustumCulled = false;

        // Dedicated scene/camera for the post-process pass
        const postScene = new THREE.Scene();
        postScene.add(quad);
        const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        game._motionBlur = { rt, material, quad, postScene, postCamera };
    } catch (e) {
        console.warn('initMotionBlur failed', e);
    }
}

/**
 * Call before renderer.render(scene, camera).
 * Renders the scene into the off-screen render target instead of the default
 * framebuffer. The caller must then call finishMotionBlur() to composite.
 */
export function updateMotionBlur(game) {
    try {
        const mb = game._motionBlur;
        if (!mb) return;

        // Compute speed ratio
        const vel = game.ballBody ? game.ballBody.velocity : null;
        let speedRatio = 0;
        if (vel) {
            const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
            speedRatio = Math.min(1, hSpeed / MAX_VELOCITY);
        }

        // Intensity: zero below threshold, ramp to 1
        const intensity = speedRatio > MOTION_BLUR_THRESHOLD
            ? (speedRatio - MOTION_BLUR_THRESHOLD) / (1 - MOTION_BLUR_THRESHOLD)
            : 0;

        // Project 3D velocity onto screen to get UV-space direction
        if (vel && intensity > 0 && game.ballMesh) {
            const pos = game.ballMesh.position;
            const dir = new THREE.Vector3(vel.x, 0, vel.z).normalize();

            // Project two points along the velocity direction into screen space
            _pA.copy(pos);
            _pB.copy(pos).addScaledVector(dir, 2);
            _pA.project(game.camera);
            _pB.project(game.camera);

            // Screen-space direction (NDC → UV scale)
            const dx = (_pB.x - _pA.x) * 0.5;
            const dy = (_pB.y - _pA.y) * 0.5;

            // UV-space velocity scaled by blur strength and intensity
            mb.material.uniforms.uVelocity.value.set(
                dx * BLUR_MAX_STRENGTH * intensity * 50,
                dy * BLUR_MAX_STRENGTH * intensity * 50
            );
        } else {
            mb.material.uniforms.uVelocity.value.set(0, 0);
        }

        // Only redirect to off-screen RT when blur is actually active.
        // If we redirect but skip the composite pass (intensity == 0),
        // the scene is rendered to the RT but never drawn to the screen,
        // leaving a blank canvas.
        if (intensity > 0) {
            mb.material.uniforms.uIntensity.value = 1;
            game.renderer.setRenderTarget(mb.rt);
        } else {
            mb.material.uniforms.uIntensity.value = 0;
        }
    } catch (e) {
        // Fail silently — motion blur is cosmetic
    }
}

/**
 * Call after renderer.render(scene, camera) + setRenderTarget(null).
 * Composites the blurred scene to the default framebuffer (screen).
 */
export function finishMotionBlur(game) {
    try {
        const mb = game._motionBlur;
        if (!mb) return;

        // Only composite when blur was active (render target was set)
        if (mb.material.uniforms.uIntensity.value === 0) return;

        // Restore default framebuffer and composite blur to screen
        game.renderer.setRenderTarget(null);
        game.renderer.render(mb.postScene, mb.postCamera);
    } catch (e) {
        // Fail silently; always reset RT
        try { game.renderer.setRenderTarget(null); } catch (e) {}
    }
}

/**
 * Resize the render target to match canvas dimensions.
 * Call from onWindowResize.
 */
export function resizeMotionBlur(game) {
    try {
        const mb = game._motionBlur;
        if (!mb) return;
        const w = game.renderer.domElement.width;
        const h = game.renderer.domElement.height;
        mb.rt.setSize(w, h);
        mb.material.uniforms.uTexelSize.value.set(1 / w, 1 / h);
    } catch (e) {}
}

/**
 * Cleanup – disposes GPU resources.
 */
export function disposeMotionBlur(game) {
    try {
        const mb = game._motionBlur;
        if (!mb) return;
        game.renderer.setRenderTarget(null);
        mb.rt.dispose();
        mb.material.dispose();
        mb.quad.geometry.dispose();
        game._motionBlur = null;
    } catch (e) {}
}
