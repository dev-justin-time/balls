/*
 Bloom post-processing module.
 Exports: initBloom(game), updateBloom(game), finishBloom(game), resizeBloom(game), disposeBloom(game)

 Lightweight single-pass bloom: renders scene to an off-screen RT, then composites
 back to screen with a bright-pass blur. Designed to coexist with motion blur —
 when motion blur is active, bloom is skipped to save GPU bandwidth.

 Approach:
   Pass 1 – render scene into off-screen render target (shared with motion blur when possible)
   Pass 2 – fullscreen quad samples the RT at multiple offsets, extracts bright areas,
            blurs them, and adds them back to the original color.
*/
import * as THREE from 'three';

// --- Tuning ---
const BLOOM_THRESHOLD = 0.6;     // luminance above this contributes to bloom
const BLOOM_INTENSITY = 0.35;    // overall bloom strength
const BLOOM_RADIUS = 0.008;      // blur sample radius (UV units)
const BLOOM_SAMPLES = 6;         // radial samples per side

// --- Vertex shader (shared fullscreen quad) ---
const VERT = /* glsl */ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

// --- Fragment shader — bright-pass + radial blur + composite ---
const FRAG = /* glsl */ `
    uniform sampler2D tScene;
    uniform float uThreshold;
    uniform float uIntensity;
    uniform float uRadius;
    uniform vec2  uTexelSize;
    varying vec2  vUv;

    // Luminance approximation (ITU-R BT.709)
    float lum(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    void main() {
        vec4 baseColor = texture2D(tScene, vUv);
        float baseLum = lum(baseColor.rgb);

        // Bright-pass: extract only pixels above threshold
        float bright = smoothstep(uThreshold, uThreshold + 0.25, baseLum);

        // Radial blur of bright areas (6-directional with diminishing weights)
        vec3 bloom = vec3(0.0);
        float totalWeight = 0.0;
        const int SAMPLES = ${BLOOM_SAMPLES};

        for (int i = 0; i < SAMPLES; i++) {
            float angle = float(i) * 1.047197551; // 60° increments
            vec2 dir = vec2(cos(angle), sin(angle));
            float weight = 1.0 / (float(i) + 1.0);

            for (int j = 1; j <= 3; j++) {
                float dist = float(j) * uRadius;
                vec2 offset = dir * dist;
                float w = weight / float(j);

                vec3 s1 = texture2D(tScene, vUv + offset * uTexelSize).rgb;
                vec3 s2 = texture2D(tScene, vUv - offset * uTexelSize).rgb;

                float b1 = smoothstep(uThreshold, uThreshold + 0.25, lum(s1));
                float b2 = smoothstep(uThreshold, uThreshold + 0.25, lum(s2));

                bloom += s1 * b1 * w;
                bloom += s2 * b2 * w;
                totalWeight += (b1 + b2) * w;
            }
        }

        bloom /= max(totalWeight, 1e-4);

        // Composite: original + bloom overlay
        vec3 color = baseColor.rgb + bloom * uIntensity * bright;

        // Subtle tone mapping to prevent over-brightening
        color = color / (1.0 + color);

        gl_FragColor = vec4(color, baseColor.a);
    }
`;

/**
 * One-time setup — creates render target, fullscreen quad, and material.
 */
export function initBloom(game) {
    try {
        const w = game.renderer.domElement.width;
        const h = game.renderer.domElement.height;

        // Render target (matches canvas resolution, half-float for HDR)
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
                uThreshold: { value: BLOOM_THRESHOLD },
                uIntensity: { value: BLOOM_INTENSITY },
                uRadius: { value: BLOOM_RADIUS },
                uTexelSize: { value: new THREE.Vector2(1 / w, 1 / h) }
            },
            vertexShader: VERT,
            fragmentShader: FRAG,
            depthTest: false,
            depthWrite: false
        });

        // Fullscreen quad
        const geo = new THREE.PlaneGeometry(2, 2);
        const quad = new THREE.Mesh(geo, material);
        quad.frustumCulled = false;

        // Dedicated scene/camera for post-process pass
        const postScene = new THREE.Scene();
        postScene.add(quad);
        const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        game._bloom = { rt, material, quad, postScene, postCamera, active: false };
    } catch (e) {
        console.warn('initBloom failed', e);
    }
}

/**
 * Call before renderer.render(scene, camera).
 * Redirects rendering to the bloom RT when bloom is active and motion blur is not.
 * Skips when motion blur is active (they share the render target pipeline).
 */
export function updateBloom(game) {
    try {
        const bloom = game._bloom;
        if (!bloom) return;

        // Only activate bloom when motion blur is NOT active
        // (they compete for the off-screen RT and combining them is too expensive for mobile)
        const mb = game._motionBlur;
        const mbActive = mb && mb.material.uniforms.uIntensity.value > 0;

        if (!mbActive) {
            bloom.active = true;
            bloom.material.uniforms.uIntensity.value = game.saveData?.bloomIntensity ?? BLOOM_INTENSITY;
            game.renderer.setRenderTarget(bloom.rt);
        } else {
            bloom.active = false;
        }
    } catch (e) {
        // Fail silently — bloom is cosmetic
    }
}

/**
 * Call after renderer.render(scene, camera).
 * Composites the bloom-enhanced scene to the default framebuffer.
 */
export function finishBloom(game) {
    try {
        const bloom = game._bloom;
        if (!bloom || !bloom.active) return;

        // Restore default framebuffer
        game.renderer.setRenderTarget(null);

        // Render fullscreen quad with bloom shader
        game.renderer.render(bloom.postScene, bloom.postCamera);
    } catch (e) {
        // Fail silently
    }
}

/**
 * Resize the render target to match canvas dimensions.
 */
export function resizeBloom(game) {
    try {
        const bloom = game._bloom;
        if (!bloom) return;
        const w = game.renderer.domElement.width;
        const h = game.renderer.domElement.height;
        bloom.rt.setSize(w, h);
        bloom.material.uniforms.uTexelSize.value.set(1 / w, 1 / h);
    } catch (e) {}
}

/**
 * Cleanup — disposes GPU resources.
 */
export function disposeBloom(game) {
    try {
        const bloom = game._bloom;
        if (!bloom) return;
        game.renderer.setRenderTarget(null);
        bloom.rt.dispose();
        bloom.material.dispose();
        bloom.quad.geometry.dispose();
        game._bloom = null;
    } catch (e) {}
}
