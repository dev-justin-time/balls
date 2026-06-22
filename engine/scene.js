/*
 Scene module.
 Exports: initScene(game) - sets up Three.js scene, camera, renderer,
 lights, shared materials, textures, sky, sky rotation, PMREM,
 trail model pool, finish model loading.
*/
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function initScene(game) {
    game.scene = new THREE.Scene();
    game.textureLoader = new THREE.TextureLoader();
    game.textureCache = new Map();

    // Sky rotation settings
    game.skyRotationSpeed = 0.03;
    game.skyMesh = null;

    const sky = game.skyConfigs[game.saveData.selectedSky] || game.skyConfigs.day;
    applySkyConfig(game, sky);

    game.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // WebGL renderer
    game.renderer = new THREE.WebGLRenderer({ antialias: true });
    try { game.renderer.setPixelRatio(Math.min(1, window.devicePixelRatio || 1)); } catch (e) {}
    game.renderer.debug && (game.renderer.debug.checkShaderErrors = false);
    game.renderer.setSize(window.innerWidth, window.innerHeight);
    try { game.renderer.outputEncoding = THREE.sRGBEncoding; } catch (e) {}
    try {
        game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        game.renderer.toneMappingExposure = 1.0;
    } catch (e) {}
    game.renderer.shadowMap.enabled = true;
    game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // PMREM generator
    try {
        game.pmremGenerator = new THREE.PMREMGenerator(game.renderer);
        game.pmremGenerator.compileEquirectangularShader();
    } catch (e) {
        game.pmremGenerator = null;
        console.warn('PMREM generator unavailable', e);
    }
    console.info('Using WebGL renderer (ACES tone-mapped, PMREM ready)');

    document.body.appendChild(game.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    game.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(15, 30, 20);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    game.scene.add(sunLight);

    // GLTF Loader
    game.gltfLoader = new GLTFLoader();
    game.finishModel = null;

    // Trail model pool
    game._trailModelPool = {};
    preloadTrailModels(game);

    // Load finish GLB
    game.gltfLoader.load('assets/model/finish_gate.glb',
        (gltf) => {
            game.finishModel = gltf.scene;
            if (game.placeFinishModel) game.placeFinishModel();
        },
        undefined,
        (err) => {
            console.warn('Failed to load .glb model, using fallback finish gate:', err);
            game.finishModel = createFallbackFinishModel();
        }
    );

    // Textures
    game.ballTexture = loadTexture(game, 'assets/image/dsfk.webp');
    game.woodTexture = loadTexture(game, 'assets/image/wood_texture.webp');
    game.woodTexture.wrapS = THREE.RepeatWrapping;
    game.woodTexture.wrapT = THREE.RepeatWrapping;
    game.woodTexture.repeat.set(1, 4);

    // Shared materials
    game.sharedMaterials = {
        wood: new THREE.MeshPhongMaterial({ map: game.woodTexture }),
        finish: new THREE.MeshPhongMaterial({ color: 0x00ff00 }),
        coin: new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 80 }),
        pendulum: new THREE.MeshPhongMaterial({ color: 0xaa0000 }),
        spinner: new THREE.MeshPhongMaterial({ color: 0x0000ff }),
        rope: new THREE.LineBasicMaterial({ color: 0x333333 }),
        wall: new THREE.MeshPhongMaterial({ color: 0x666666, transparent: true, opacity: 0.5 }),
        speed: new THREE.MeshPhongMaterial({ color: 0xffff00, emissive: 0x444400 }),
        hazard: new THREE.MeshPhongMaterial({ color: 0xff4500 }),
        neon: new THREE.MeshPhongMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.4, shininess: 120 }),
        glass: new THREE.MeshPhongMaterial({ color: 0xddeeff, transparent: true, opacity: 0.28, shininess: 90, specular: 0xffffff })
    };
}

export function loadTexture(game, url) {
    if (game.textureCache.has(url)) return game.textureCache.get(url);

    try {
        const tex = game.textureLoader.load(
            url,
            undefined,
            undefined,
            (err) => {
                console.error(`Error loading texture: ${url}`, err);
                const fallbackData = new Uint8Array([200, 200, 200, 255]);
                const fallback = new THREE.DataTexture(fallbackData, 1, 1, THREE.RGBAFormat);
                fallback.needsUpdate = true;
                game.textureCache.set(url, fallback);
            }
        );
        game.textureCache.set(url, tex);
        return tex;
    } catch (e) {
        console.error(`loadTexture failed for ${url}:`, e);
        const fallbackData = new Uint8Array([200, 200, 200, 255]);
        const fallback = new THREE.DataTexture(fallbackData, 1, 1, THREE.RGBAFormat);
        fallback.needsUpdate = true;
        game.textureCache.set(url, fallback);
        return fallback;
    }
}

function disposeMesh(mesh) {
    if (!mesh) return;
    try {
        if (mesh.traverse) {
            mesh.traverse((c) => {
                if (c.isMesh) {
                    if (c.material) {
                        if (Array.isArray(c.material)) {
                            c.material.forEach(m => { if (m.map) try { m.map.dispose(); } catch(e){} try { m.dispose(); } catch(e){} });
                        } else {
                            if (c.material.map) try { c.material.map.dispose(); } catch(e) {}
                            try { c.material.dispose(); } catch(e) {}
                        }
                    }
                    if (c.geometry) try { c.geometry.dispose(); } catch(e){}
                }
            });
        } else {
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => { if (m.map) try { m.map.dispose(); } catch(e){} try { m.dispose(); } catch(e){} });
                } else {
                    if (mesh.material.map) try { mesh.material.map.dispose(); } catch(e) {}
                    try { mesh.material.dispose(); } catch(e) {}
                }
            }
            if (mesh.geometry) try { mesh.geometry.dispose(); } catch(e){}
        }
        if (mesh.parent) mesh.parent.remove(mesh);
    } catch (e) {}
}

export function applySkyConfig(game, sky) {
    try {
        const targetFogHex = sky && sky.color ? sky.color : 0x87ceeb;
        const previousSky = game.skyMesh;

        // glTF sky handling
        if (sky && sky.tex && (sky.tex.toLowerCase().endsWith('.gltf') || sky.tex.toLowerCase().endsWith('.glb'))) {
            try { if (previousSky) disposeMesh(previousSky); } catch (e) {}

            try {
                game.gltfLoader.load(sky.tex,
                    (gltf) => {
                        try {
                            const root = gltf.scene.clone(true);
                            const scale = 40;
                            root.scale.set(scale, scale, scale);
                            root.traverse((c) => {
                                if (c.isMesh) {
                                    try { c.material = c.material.clone ? c.material.clone() : c.material; } catch(e){}
                                    try { c.material.side = THREE.BackSide; } catch(e){}
                                    try { c.frustumCulled = false; } catch(e){}
                                }
                            });
                            root.position.set(0, 0, 0);
                            root.frustumCulled = false;
                            root.renderOrder = 0;

                            if (game.pmremGenerator) {
                                try {
                                    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
                                    const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
                                    game.scene.add(root);
                                    cubeCamera.update(game.renderer, game.scene);
                                    const envMap = game.pmremGenerator.fromCubemap(cubeRenderTarget.texture).texture;
                                    try { game.scene.environment = envMap; game.scene.background = envMap; } catch (e) {}
                                    // Update tracked envMap for reflective materials (p2opp)
                                    if (game._lastEnvMap && game._lastEnvMap !== envMap) {
                                        try { game._lastEnvMap.dispose && game._lastEnvMap.dispose(); } catch(e){}
                                    }
                                    game._lastEnvMap = envMap;
                                    try { cubeRenderTarget.dispose(); } catch(e){}
                                    try { game.scene.remove(root); } catch(e){}
                                } catch (e) {
                                    console.warn('Cube env bake failed for glTF sky', e);
                                }
                            }

                            if (!game._skyHemisphere) {
                                try {
                                    game._skyHemisphere = new THREE.HemisphereLight(0xffffff, 0x333344, 0.2);
                                    game.scene.add(game._skyHemisphere);
                                } catch (e) {}
                            }

                            try { if (previousSky && previousSky !== root) disposeMesh(previousSky); } catch(e){}

                            game.scene.add(root);
                            game.skyMesh = root;

                            // Fade in
                            try {
                                root.traverse((c) => {
                                    if (c.isMesh && c.material) {
                                        c.material.transparent = true;
                                        c.material.opacity = 0.0;
                                    }
                                });
                                const start = Date.now();
                                const dur = 800;
                                const fade = () => {
                                    const t = Math.min(1, (Date.now() - start) / dur);
                                    try {
                                        root.traverse((c) => {
                                            if (c.isMesh && c.material) c.material.opacity = t;
                                        });
                                    } catch (e) {}
                                    if (t < 1) requestAnimationFrame(fade);
                                };
                                requestAnimationFrame(fade);
                            } catch (e) {}

                            try {
                                if (!game.scene.fog) game.scene.fog = new THREE.Fog(targetFogHex, 20, 150);
                                game.scene.fog.color.setHex(targetFogHex);
                            } catch (e) {}
                        } catch (e) {
                            console.warn('Error applying glTF sky:', e);
                        }
                    },
                    undefined,
                    (err) => {
                        console.warn('Failed to load glTF sky asset:', sky.tex, err);
                        try { game.scene.background = new THREE.Color(targetFogHex); } catch(e){}
                    }
                );
            } catch (e) {
                console.warn('gltfLoader.load call failed for sky glTF', e);
            }
            return;
        }

        // Equirectangular texture sky
        if (sky && sky.tex) {
            const tex = loadTexture(game, sky.tex);
            try {
                tex.mapping = THREE.EquirectangularReflectionMapping;
                tex.encoding = THREE.sRGBEncoding;
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                tex.minFilter = tex.minFilter || THREE.LinearMipMapLinearFilter;
                tex.magFilter = tex.magFilter || THREE.LinearFilter;
                tex.needsUpdate = true;
            } catch (e) {}

            let envMap = null;
            try {
                if (game.pmremGenerator) {
                    const pmrem = game.pmremGenerator.fromEquirectangular(tex);
                    envMap = pmrem && pmrem.texture ? pmrem.texture : null;
                    if (envMap) {
                        if (game._lastEnvMap && game._lastEnvMap !== envMap) {
                            try { game._lastEnvMap.dispose && game._lastEnvMap.dispose(); } catch(e){}
                        }
                        game._lastEnvMap = envMap;
                    }
                }
            } catch (e) {
                console.warn('PMREM generation failed for equirectangular, continuing without envMap', e);
                envMap = null;
            }

            try {
                if (envMap) {
                    game.scene.background = envMap;
                    game.scene.environment = envMap;
                } else {
                    try { game.scene.background = tex; } catch (e) { game.scene.background = new THREE.Color(targetFogHex); }
                }
            } catch (e) {
                console.warn('Failed to set scene background/envMap', e);
                game.scene.background = new THREE.Color(targetFogHex);
            }

            const radius = 380;
            const skyGeo = new THREE.SphereGeometry(radius, 48, 32);
            skyGeo.scale(-1, 1, 1);

            const skyMat = new THREE.MeshStandardMaterial({
                map: tex,
                side: THREE.BackSide,
                depthWrite: false,
                roughness: 1.0,
                metalness: 0.0,
                envMap: envMap || null,
                envMapIntensity: 0.8,
                toneMapped: true
            });

            const newSky = new THREE.Mesh(skyGeo, skyMat);
            newSky.frustumCulled = false;
            newSky.renderOrder = 0;

            if (!game._skyHemisphere) {
                try {
                    game._skyHemisphere = new THREE.HemisphereLight(0xffffff, 0x444466, 0.25);
                    game.scene.add(game._skyHemisphere);
                } catch (e) {}
            }

            game.scene.add(newSky);
            game.skyMesh = newSky;

            if (previousSky && previousSky !== newSky) {
                previousSky.renderOrder = 1;
                const start = Date.now();
                const dur = 700;
                const fade = () => {
                    const t = Math.min(1, (Date.now() - start) / dur);
                    try {
                        newSky.material.opacity = t;
                        if (previousSky.material) previousSky.material.opacity = Math.max(0, 1 - t);
                    } catch (e) {}
                    if (t < 1) requestAnimationFrame(fade);
                    else {
                        try { disposeMesh(previousSky); } catch (e) {}
                    }
                };
                try { newSky.material.transparent = true; } catch(e){}
                try { if (previousSky.material) previousSky.material.transparent = true; } catch(e){}
                requestAnimationFrame(fade);
            } else {
                try { newSky.material.transparent = true; newSky.material.opacity = 0.0; } catch(e){}
                const start = Date.now();
                const dur = 450;
                const fadeIn = () => {
                    const t = Math.min(1, (Date.now() - start) / dur);
                    try { newSky.material.opacity = t; } catch (e) {}
                    if (t < 1) requestAnimationFrame(fadeIn);
                };
                requestAnimationFrame(fadeIn);
            }

            try {
                if (!game.scene.fog) game.scene.fog = new THREE.Fog(targetFogHex, 20, 150);
                game.scene.fog.color.setHex(targetFogHex);
            } catch (e) { game.scene.fog = new THREE.Fog(targetFogHex, 20, 150); }

            try { tex.encoding = THREE.sRGBEncoding; } catch (e) {}
        } else {
            try { disposeMesh(previousSky); game.skyMesh = null; } catch (e) {}
            // Dispose old envMap when switching to color-only sky (no reflections)
            if (game._lastEnvMap) {
                try { game._lastEnvMap.dispose && game._lastEnvMap.dispose(); } catch(e){}
                game._lastEnvMap = null;
            }
            try {
                game.scene.background = new THREE.Color(sky && sky.color ? sky.color : 0x87ceeb);
                if (!game.scene.fog) game.scene.fog = new THREE.Fog(targetFogHex, 20, 150);
                game.scene.fog.color.setHex(targetFogHex);
            } catch (e) {
                game.scene.background = new THREE.Color(0x87ceeb);
            }
        }
    } catch (e) {
        console.warn('applySkyConfig error', e);
        try { game.scene.background = new THREE.Color(sky && sky.color ? sky.color : 0x87ceeb); } catch (e) {}
    }
}

// Clear all cached textures (GPU resources). Intended for full scene rebuilds
// (level reset, hot-swap restart) — not mid-game use, as active materials
// may still reference these textures and would render black.
export function clearTextureCache(game) {
    if (!game || !game.textureCache) return;
    try {
        for (const tex of game.textureCache.values()) {
            try { tex.dispose && tex.dispose(); } catch(e) {}
        }
        game.textureCache.clear();
    } catch (e) {}
}

export function createFallbackFinishModel() {
    const group = new THREE.Group();
    const archGeo = new THREE.BoxGeometry(10, 1, 1);
    const postGeo = new THREE.BoxGeometry(1, 8, 1);
    const mat = new THREE.MeshPhongMaterial({ color: 0x00ff00 });

    const arch = new THREE.Mesh(archGeo, mat);
    arch.position.y = 8;
    const postL = new THREE.Mesh(postGeo, mat);
    postL.position.set(-4.5, 4, 0);
    const postR = new THREE.Mesh(postGeo, mat);
    postR.position.set(4.5, 4, 0);

    group.add(arch, postL, postR);
    return group;
}

function preloadTrailModels(game) {
    const trailLoads = [
        { key: 'skeleton', url: 'assets/image/skeleton.webp' },
        { key: 'zombie', url: 'assets/model/_halloween_Um_zumbi__0523105301_.glb' },
        { key: 'eye', url: 'assets/model/eye_low_poly_free_cute_eyeballs.glb' },
        { key: 'soldier2', url: 'assets/image/soldier3.webp' },
        { key: 'venus', url: 'assets/image/venus_fly_trap.webp' },
        // --- New trail types (#8) ---
        { key: 'dragon', url: 'assets/image/dragon-ball.webp' },
        { key: 'bowling_strike', url: 'assets/image/bowling-strike.gif' },
        { key: 'easter', url: 'assets/image/easter.gif' },
        { key: 'life', url: 'assets/image/life.gif' },
        { key: 'love', url: 'assets/image/love.gif' }
    ];

    const createSpriteFromImage = (src, size = 0.8) => {
        try {
            const map = new THREE.TextureLoader().load(src);
            map.encoding = THREE.sRGBEncoding;
            const mat = new THREE.SpriteMaterial({ map: map, transparent: true, depthWrite: false });
            const spr = new THREE.Sprite(mat);
            spr.scale.set(size, size, 1);
            return spr;
        } catch (e) {
            return null;
        }
    };

    (async () => {
        for (const t of trailLoads) {
            try {
                if (t.url.toLowerCase().endsWith('.glb') || t.url.toLowerCase().endsWith('.gltf')) {
                    game.gltfLoader.load(t.url,
                        (g) => {
                            try {
                                const scene = g.scene || g.scenes && g.scenes[0];
                                if (!scene) return;
                                scene.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
                                game._trailModelPool[t.key] = scene;
                            } catch (err) { /* ignore */ }
                        },
                        undefined,
                        (err) => { console.warn('Trail GLTF load failed for', t.url, err); }
                    );
                } else {
                    const spr = createSpriteFromImage(t.url, 1.0);
                    if (spr) game._trailModelPool[t.key] = spr;
                }
            } catch (e) {
                console.warn('Failed to preload trail asset', t.url, e);
            }
        }
    })();
}

// Ball material
export function getBallMaterial(game) {
    const conf = game.ballConfigs[game.saveData.selectedBall] || game.ballConfigs.rainbow;
    if (!conf) return new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    try {
        if (game.saveData.selectedBall === 'groovy') {
            if (!game.groovyCanvasTex) {
                createGroovyCanvas(game);
            }
            try { game.groovyCanvasTex.encoding = THREE.sRGBEncoding; } catch (e) {}
            game.groovyCanvasTex.needsUpdate = true;
            return new THREE.MeshPhongMaterial({
                map: game.groovyCanvasTex,
                side: THREE.DoubleSide,
                shininess: 40,
                transparent: true
            });
        }

        if (conf.type === 'texture') {
            const tex = loadTexture(game, conf.tex);
            try {
                tex.wrapS = tex.wrapS || THREE.RepeatWrapping;
                tex.wrapT = tex.wrapT || THREE.RepeatWrapping;
                tex.repeat.set(1, 1);
                tex.encoding = THREE.sRGBEncoding;
                tex.needsUpdate = true;
            } catch (e) {}

            // Glass-like treatment for p2opp skin (was GIF, now WebP)
            if (game.saveData.selectedBall === 'p2opp') {
                return new THREE.MeshPhongMaterial({
                    map: tex,
                    side: THREE.DoubleSide,
                    shininess: 80,
                    transparent: true,
                    opacity: 0.92,
                    envMap: game._lastEnvMap || null,
                    reflectivity: 0.3
                });
            }

            return new THREE.MeshPhongMaterial({
                map: tex,
                side: THREE.DoubleSide,
                shininess: 40
            });
        } else if (conf.type === 'color') {
            return new THREE.MeshPhongMaterial({ color: conf.color, shininess: conf.shininess, side: THREE.DoubleSide });
        } else if (conf.type === 'emissive') {
            return new THREE.MeshPhongMaterial({ color: conf.color, emissive: conf.emissive, side: THREE.DoubleSide });
        }
    } catch (e) {
        console.warn('getBallMaterial fallback', e);
    }
    // Default fallback (also used temporarily for gltf while loading)
    return new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide });
}

// Ball skin application — handles both material swap (texture/color/emissive)
// and full mesh replacement (gltf type). For gltf: loads the GLB model,
// caches it, and swaps game.ballMesh with a clone. Stores the original
// sphere mesh as game._defaultBallMesh for restoration when switching back.
export function applyBallSkin(game, conf) {
    if (!game || !conf) return;

    // For non-gltf types: restore default sphere mesh if currently using gltf
    if (conf.type !== 'gltf') {
        if (game._gltfBallActive && game._defaultBallMesh) {
            game.scene.remove(game.ballMesh);
            disposeMesh(game.ballMesh);
            game.ballMesh = game._defaultBallMesh;
            game.scene.add(game.ballMesh);
            game._gltfBallActive = false;
            game._defaultBallMesh = null;
        }
        game.ballMesh.material = getBallMaterial(game);
        return;
    }

    // gltf type: save default mesh reference before first swap
    if (!game._defaultBallMesh && !game._gltfBallActive) {
        game._defaultBallMesh = game.ballMesh;
    }

    const doSwap = (model) => {
        // Always remove current mesh from scene first
        game.scene.remove(game.ballMesh);
        // Only dispose if replacing a previous GLTF clone (not the default sphere)
        if (game._gltfBallActive) {
            disposeMesh(game.ballMesh);
        }
        const clone = model.clone(true);
        // Scale to match ball radius (0.5)
        clone.scale.set(0.5, 0.5, 0.5);
        clone.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        game.ballMesh = clone;
        game.scene.add(game.ballMesh);
        game._gltfBallActive = true;
    };

    // Use cached model if available
    game._gltfBallCache = game._gltfBallCache || {};
    if (game._gltfBallCache[conf.tex]) {
        doSwap(game._gltfBallCache[conf.tex]);
        return;
    }

    // Load async — show default white ball during load
    game.ballMesh.material = getBallMaterial(game);
    game.gltfLoader.load(conf.tex,
        (gltf) => {
            const model = gltf.scene;
            game._gltfBallCache[conf.tex] = model;
            // Only swap if this skin is still selected (user may have switched)
            if (game.saveData.selectedBall && game.ballConfigs[game.saveData.selectedBall] === conf) {
                doSwap(model);
            }
        },
        undefined,
        (err) => {
            console.warn('Failed to load gltf ball skin:', conf.tex, err);
        }
    );
}

// Groovy canvas
export function createGroovyCanvas(game) {
    try {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        game.groovyCanvas = canvas;
        game.groovyCtx = ctx;
        game.groovyImg = new Image();
        game.groovyImg.crossOrigin = 'anonymous';
        game.groovyImg.src = 'assets/image/dancing-groovy.webp';
        game.groovyImg.onerror = () => { game.groovyImg = null; };
        game.groovyCanvasTex = new THREE.CanvasTexture(canvas);
        game.groovyCanvasTex.minFilter = THREE.LinearMipMapLinearFilter;
        game.groovyCanvasTex.magFilter = THREE.LinearFilter;
        game.groovyCanvasTex.wrapS = THREE.RepeatWrapping;
        game.groovyCanvasTex.wrapT = THREE.RepeatWrapping;
        game.groovyPhase = 0;
    } catch (e) {
        console.warn('createGroovyCanvas failed', e);
        game.groovyCanvasTex = null;
    }
}

export function updateGroovyCanvas(game, dt) {
    try {
        if (!game.groovyCanvas || !game.groovyCtx || !game.groovyCanvasTex) return;
        const ctx = game.groovyCtx;
        const w = game.groovyCanvas.width;
        const h = game.groovyCanvas.height;
        game.groovyPhase = (game.groovyPhase || 0) + (dt || 0.016) * 1.6;
        ctx.clearRect(0, 0, w, h);
        if (game.groovyImg && game.groovyImg.complete) {
            const img = game.groovyImg;
            const arImg = img.width / img.height;
            const arCan = w / h;
            let drawW = w, drawH = h;
            if (arImg > arCan) {
                drawH = h;
                drawW = h * arImg;
            } else {
                drawW = w;
                drawH = w / arImg;
            }
            ctx.save();
            ctx.translate(w / 2, h / 2);
            const rot = Math.sin(game.groovyPhase * 0.35) * 0.06;
            ctx.rotate(rot);
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.restore();
        } else {
            const g = ctx.createLinearGradient(0, 0, w, h);
            const a = Math.sin(game.groovyPhase) * 0.5 + 0.5;
            g.addColorStop(0, `rgba(255,${Math.floor(120 + 120 * a)},120,1)`);
            g.addColorStop(1, `rgba(${Math.floor(120 + 120 * (1-a))},120,255,1)`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        }

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const hue = (game.groovyPhase * 40) % 360;
        ctx.fillStyle = `hsla(${hue}, 85%, 55%, 0.12)`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        const rad = ctx.createRadialGradient(w/2, h/2, w*0.1, w/2, h/2, w*0.8);
        rad.addColorStop(0, 'rgba(255,255,255,0.0)');
        rad.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = rad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = `hsla(${(hue + 120) % 360},80%,60%,0.3)`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            const y = (h * ((i + 1) / 5)) + Math.sin(game.groovyPhase * (0.6 + i * 0.1) + i) * 12;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(w * 0.25, y + 8, w * 0.75, y - 8, w, y);
            ctx.stroke();
        }
        ctx.restore();

        game.groovyCanvasTex.needsUpdate = true;
    } catch (e) { /* silently ignore canvas update errors */ }
}
