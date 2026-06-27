/*
 Physics module.
 Exports: initPhysics(game), updatePhysics(game, dt), jump(game),
 createRain(game), clearRain(game), createWind(game), clearWind(game),
 createFireSparks(game), clearFireSparks(game), updateFireSparks(game, dt),
 createMeteors(game), clearMeteors(game), updateMeteors(game, dt),
 checkMeteorCollisions(game).

 Handles: cannon-es world, ball body, contact materials, input processing
 (keyboard, joystick, mouse), force application, wind, grounded check,
 physics-to-renderer sync, fire sparks (Inferno sky), meteor hazards (Void Storm sky).
*/
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getBallMaterial } from '../engine/scene.js';
import { getParticleCount } from './persistence.js';
import { playPortalSound } from './audio.js';

// Physics constants (module-scoped for game feel tuning)
//
// feel-pass 2026-06-26 round 1: player reported the ball rolls too slowly.
//   BALL_SPEED ↑ / MAX_VELOCITY ↑ — top-end feels faster.
// feel-pass 2026-06-26 round 2: STEER_SPEED ↑ / STEER_DAMPING ↑ — re-ratio the
//   angular/linear so steering input keeps up with the new top-end (40 m/s).
// feel-pass 2026-06-26 round 3: linearDamping ↓ 0.5 → 0.15 — ball coasts between
//   steers instead of stopping in <1s. Tests/physics_regression.test.js + @jump-sim.mjs
//   retuned in lockstep (Scenario C baseline 0.5→0.15, sweep re-centered).
// feel-pass 2026-06-26 round 4: player reported "way too slow still". +150% boost
//   on top of round 1 = BALL_SPEED 10000 × 2.5 = 25000. MAX_VELOCITY stays at
//   round-1 value 40 (still the top-end cap; fire-escape against runaway).
// GRAVITY=-45 is the SINGLE remaining physics invariant pinned by @jump-sim.mjs.
// feel-pass 2026-06-27 round 5: USER DIRECTIVE — ball "won't even go uphill".
//   +1000% (10x) on top of round 4: BALL_SPEED 25000 → 250000. To make the
//   power USABLE (otherwise it just slams into the MAX_VELOCITY cap):
//   - MAX_VELOCITY 40 → 80 (2x top-end so boost is felt)
//   - angularDamping 0.95 → 0.18 (was eating the ball's rolling spin in <1s,
//     which made it slide instead of climb)
//   - linearDamping 0.15 → 0.05 (less foreground drag)
//   - friction 1.0 → 0.3 (rolling friction is well below 1.0; old value was
//     sapping all uphill momentum — ball would grind to a halt mid-ramp)
//   - restitution 0.1 → 0.25 (small bump-boost off uneven surfaces)
//   - STEER_SPEED/JUMP_FORCE unchanged (pinned by regression tests).
const BALL_RADIUS = 0.5;
const GRAVITY = -45; // per vision Part 3 (Keep-Balls Tightening reconciled) — PINNED invariant
const BALL_SPEED = 250000; // 25000 → 250000 = +1000% (×10) — feel-pass 2026-06-27 round 5 (user directive)
const STEER_SPEED = 32; // was 22 — feel-pass 2026-06-26 round 2 (tracks MAX_VELOCITY band)
const STEER_DAMPING = 0.96; // was 0.92 — feel-pass 2026-06-26 round 2 (less angular decay)
export const MAX_VELOCITY = 80; // 40 → 80 — feel-pass 2026-06-27 round 5 (top-end cap 2x so 10x BALL_SPEED is usable)
const JUMP_FORCE = 28; // per vision Part 3 — PINNED by physics_regression.test.js Scenario B

export function initPhysics(game) {
    game.world = new CANNON.World();
    game.world.gravity.set(0, GRAVITY, 0);
    game.world.allowSleep = true;

    const ballMaterial = new CANNON.Material('ball');
    const groundMaterial = new CANNON.Material('ground');
    const contactMaterial = new CANNON.ContactMaterial(ballMaterial, groundMaterial, {
        friction: 0.3,       // 1.0 → 0.3 — feel-pass 2026-06-27 round 5 (rolling, not grinding — ball can climb ramps)
        restitution: 0.25    // 0.1 → 0.25 — feel-pass 2026-06-27 round 5 (light bump-boost off uneven surfaces)
    });
    game.world.addContactMaterial(contactMaterial);

    const sphereShape = new CANNON.Sphere(BALL_RADIUS);
    game.ballBody = new CANNON.Body({
        mass: 100,
        shape: sphereShape,
        material: ballMaterial,
        angularDamping: 0.18,  // 0.95 → 0.18 — feel-pass 2026-06-27 round 5 (let the ball ROLL up ramps; old value killed spin in <1s)
        linearDamping: 0.05    // 0.15 → 0.05 — feel-pass 2026-06-27 round 5 (less drag so the new 10x power can be felt)
    });
    game.ballBody.position.set(0, 1, 0);
    game.world.addBody(game.ballBody);

    const sphereGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
    game.ballMesh = new THREE.Mesh(sphereGeo, getBallMaterial(game));
    game.ballMesh.castShadow = true;
    game.scene.add(game.ballMesh);

    // Game state init
    game.coins = [];
    game.score = 0;
    game.levelLength = 0;
    game.currentLevel = 1;
    game.levelObjects = [];
    game.pendulums = [];
    game.spinners = [];
    game.movers = [];
    game.isGameOver = false;
    game.isWin = false;
    game.isGrounded = false;
    game.jumpCount = 0;
    game.checkpoints = [];
    game.lastCheckpointPos = new CANNON.Vec3(0, 5, 0);

    // Pre-allocated pooled vectors (eliminates per-frame GC allocations)
    game._vecA = new CANNON.Vec3();
    game._vecB = new CANNON.Vec3();
    game._rayResult = new CANNON.RaycastResult();
    game._vecForce = new CANNON.Vec3();
    game._vec3A = new THREE.Vector3();
    // Camera follow (used by rendering.js)
    game._vec3Cam = new THREE.Vector3();
    game._vec3Dir = new THREE.Vector3();
    game._vec3Desired = new THREE.Vector3();
}

export function updatePhysics(game, dt) {
    try {
        game.world.step(1 / 60, dt, 3);

        // Check grounded
        game.isGrounded = false;
        game._vecA.set(0, -BALL_RADIUS - 0.1, 0);
        game._vecB.set(0, -BALL_RADIUS - 0.6, 0);
        game.ballBody.position.vadd(game._vecA, game._vecA);
        game.ballBody.position.vadd(game._vecB, game._vecB);
        game.world.raycastClosest(game._vecA, game._vecB, {}, game._rayResult);
        if (game._rayResult.hasHit) {
            game.isGrounded = true;
        }
        if (game.isGrounded) game.jumpCount = 0;

        // Spring pad bounce detection
        try {
            game.levelObjects.forEach(obj => {
                if (!obj.springPad || obj._springCooldown) return;
                const dx = Math.abs(game.ballBody.position.x - (obj.x || 0));
                const dz = Math.abs(game.ballBody.position.z - (obj.z || 0));
                const dy = game.ballBody.position.y - (obj.y || 0);
                const padW = ((obj.width || 4) / 2) + BALL_RADIUS;
                const padL = ((obj.length || 4) / 2) + BALL_RADIUS;
                if (dx < padW && dz < padL && dy > BALL_RADIUS && dy < BALL_RADIUS + 1.2) {
                    const bp = obj.bouncePower || 18;
                    const levelMult = 1 + (game.currentLevel - 1) * 0.08;
                    game.ballBody.velocity.y = bp * levelMult;
                    game.isGrounded = false;
                    game.jumpCount = 0;
                    obj._springCooldown = true;
                    setTimeout(() => { obj._springCooldown = false; }, 400);
                    // Spawn spring trail afterimage effect
                    try {
                        spawnSpringTrail(game, obj.x || 0, (obj.y || 0) + 0.5, obj.z || 0);
                    } catch (_e) {}
                }
            });
        } catch (e) {}

        // Portal teleport detection
        try {
            // Collect all portal entries from levelObjects
            const portals = [];
            for (const obj of game.levelObjects) {
                if (obj.portal) portals.push(obj);
            }
            // Filter out cooled-down portals for detection
            const active = portals.filter(p => !p._portalCooldown);
            if (active.length >= 2) {
                for (const portal of active) {
                    const ringY = (portal.y || 0) + (portal.radius || 2);
                    const dx = game.ballBody.position.x - (portal.x || 0);
                    const dy = game.ballBody.position.y - ringY;
                    const dz = game.ballBody.position.z - (portal.z || 0);
                    const hDist = Math.sqrt(dx * dx + dz * dz);
                    const r = portal.radius || 2;
                    if (hDist < r && Math.abs(dy) < BALL_RADIUS + 0.3) {
                        // Ball is passing through this portal — find nearest other active portal
                        const others = active.filter(p => p !== portal);
                        let nearest = others[0];
                        let nearestDist = Infinity;
                        for (const other of others) {
                            const odx = (portal.x || 0) - (other.x || 0);
                            const odz = (portal.z || 0) - (other.z || 0);
                            const od = Math.sqrt(odx * odx + odz * odz);
                            if (od < nearestDist) { nearestDist = od; nearest = other; }
                        }
                        if (nearest) {
                            // Visual feedback — purple flash overlay
                            try {
                                let flash = document.getElementById('portal-flash');
                                if (!flash) {
                                    flash = document.createElement('div');
                                    flash.id = 'portal-flash';
                                    flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20001;opacity:0;background:radial-gradient(circle at 50% 50%,rgba(136,68,255,0.3),rgba(0,0,0,0));transition:opacity 120ms ease;';
                                    document.body.appendChild(flash);
                                }
                                flash.style.opacity = '1';
                                setTimeout(() => { flash.style.opacity = '0'; }, 160);
                            } catch (e) {}
                            // Portal SFX
                            try { playPortalSound(game); } catch (e) {}
                            // Portal particle burst at source and destination
                            try {
                                const srcY = ringY;
                                spawnPortalParticles(game, portal.x || 0, srcY, portal.z || 0);
                                const dstY = (nearest.y || 0) + (nearest.radius || 2);
                                spawnPortalParticles(game, nearest.x || 0, dstY, nearest.z || 0);
                            } catch (e) {}
                            // Teleport ball to destination portal
                            const destY = (nearest.y || 0) + (nearest.radius || 2) + 0.5;
                            game.ballBody.position.set(nearest.x || 0, destY, nearest.z || 0);
                            game.ballMesh.position.copy(game.ballBody.position);
                            // Cooldown destination portal so we don't teleport back immediately
                            nearest._portalCooldown = true;
                            portal._portalCooldown = true;
                            setTimeout(() => { nearest._portalCooldown = false; portal._portalCooldown = false; }, 1200);
                            break; // only one teleport per frame
                        }
                    }
                }
            }
        } catch (e) {}

        // Input processing
        let inputX = 0;
        let inputY = 0;

        // Keyboard
        if (game.keys['KeyW'] || game.keys['ArrowUp']) inputY -= 1;
        if (game.keys['KeyS'] || game.keys['ArrowDown']) inputY += 1;
        if (game.keys['KeyA'] || game.keys['ArrowLeft']) inputX -= 1;
        if (game.keys['KeyD'] || game.keys['ArrowRight']) inputX += 1;

        // Joystick
        if (game.joystickInput) {
            inputX += game.joystickInput.x || 0;
            inputY += (game.joystickInput.y || 0);
        }

        // Mouse drag
        if (game.mouseInput) {
            inputX += game.mouseInput.x || 0;
            inputY += game.mouseInput.y || 0;
        }

        // Clamp input
        inputX = Math.max(-1, Math.min(1, inputX));
        inputY = Math.max(-1, Math.min(1, inputY));

        // Apply forces
        const forceX = inputX * BALL_SPEED * dt;
        const forceZ = inputY * BALL_SPEED * dt;

        if (game.isGrounded) {
            game._vecForce.set(forceX, 0, forceZ);
            game.ballBody.applyForce(game._vecForce, game.ballBody.position);
        } else {
            // Reduced air control
            game._vecForce.set(forceX * 0.3, 0, forceZ * 0.3);
            game.ballBody.applyForce(game._vecForce, game.ballBody.position);
        }

        // Wind force
        if (game.windy && game.wind) {
            const windForce = game.wind.dirX * game.wind.strength * 80 * dt;
            game._vecForce.set(windForce, 0, 0);
            game.ballBody.applyForce(game._vecForce, game.ballBody.position);
        }

        // Apply abilities-based speed/resistance adjustments
        let speedMult = game._abilitySpeed || 1.0;

        // Apply sky condition speed modifier (#8)
        const skyConf = game.skyConfigs && game.skyConfigs[game.saveData.selectedSky];
        if (skyConf && skyConf.conditions) {
            if (skyConf.conditions.speedBoost) speedMult *= skyConf.conditions.speedBoost;
            if (skyConf.conditions.speedDebuff) speedMult *= skyConf.conditions.speedDebuff;
        }
        if (game.isGrounded && (inputX !== 0 || inputY !== 0)) {
            const vel = game.ballBody.velocity;
            const currentSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
            if (currentSpeed < MAX_VELOCITY * speedMult) {
                const boostForce = 800 * speedMult * dt;
                const dirX = vel.x / (currentSpeed + 0.01);
                const dirZ = vel.z / (currentSpeed + 0.01);
                game._vecForce.set(dirX * boostForce, 0, dirZ * boostForce);
                game.ballBody.applyForce(game._vecForce, game.ballBody.position);
            }
        }

        // Velocity clamping
        const vel = game.ballBody.velocity;
        const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        const maxVel = MAX_VELOCITY * speedMult;
        if (hSpeed > maxVel) {
            const scale = maxVel / hSpeed;
            game.ballBody.velocity.x *= scale;
            game.ballBody.velocity.z *= scale;
        }

        // Angular velocity damping — use STEER_SPEED to blend angular momentum
        // toward the movement direction for smoother, more responsive turning
        if (game.isGrounded && hSpeed > 1) {
            const moveAngle = Math.atan2(vel.x, vel.z);
            // Extract Y rotation from quaternion properly
            const q = game.ballBody.quaternion;
            const curAngle = Math.atan2(
                2 * (q.w * q.y + q.x * q.z),
                1 - 2 * (q.y * q.y + q.z * q.z)
            );
            const angleDiff = moveAngle - curAngle;
            // Normalize to [-PI, PI]
            const normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
            const steerForce = Math.max(-STEER_SPEED, Math.min(STEER_SPEED, normalizedDiff * STEER_SPEED)) * dt;
            game.ballBody.angularVelocity.y += steerForce;
            game.ballBody.angularVelocity.y *= STEER_DAMPING;
        }

        // Sync physics -> render
        game.ballMesh.position.copy(game.ballBody.position);
        game.ballMesh.quaternion.copy(game.ballBody.quaternion);

        // Pendulum rotation
        game.pendulums.forEach(p => {
            try {
                p.body.angularVelocity.set(0, 0, 2.5 * p.speedMult);
                // Update rope line
                if (p.line && p.line.geometry) {
                    game._vec3A.set(p.body.position.x, p.body.position.y, p.body.position.z);
                    const points = [p.pivot, game._vec3A];
                    p.line.geometry.setFromPoints(points);
                }
                // Sync mesh
                p.mesh.position.copy(p.body.position);
                p.mesh.quaternion.copy(p.body.quaternion);
                // Update trail
                if (p.trail) {
                    p.trail.position.copy(p.body.position);
                }
            } catch (e) {}
        });

        // Spinner rotation
        game.spinners.forEach(s => {
            try {
                s.body.angularVelocity.set(0, 3.5 * s.speedMult, 0);
                s.mesh.position.copy(s.body.position);
                s.mesh.quaternion.copy(s.body.quaternion);
                if (s.trail) {
                    s.trail.position.copy(s.body.position);
                    s.trail.quaternion.copy(s.body.quaternion);
                }
            } catch (e) {}
        });

        // Mover sliding (includes blade motion)
        game.movers.forEach(m => {
            try {
                if (m.type === 'blade') {
                    // Blade hazard: oscillate near base position
                    const bm = m.bladeMesh;
                    if (!bm) return;
                    const t = Date.now() * 0.003 * (m.speedMult || 1) + (m.offset || 0);
                    const ud = bm.userData || {};
                    if (ud.vertical) {
                        bm.position.y = (m.basePos ? m.basePos.y : 0) + Math.sin(t * 2.5) * (ud.swing || 1) * 2;
                        bm.position.x = (m.basePos ? m.basePos.x : 0) + Math.cos(t * 1.8) * 1.5;
                    } else {
                        bm.position.x = (m.basePos ? m.basePos.x : 0) + Math.sin(t * 3) * (ud.swing || 1) * 3;
                        bm.position.y = (m.basePos ? m.basePos.y : 0) + Math.cos(t * 2.2) * 0.8;
                    }
                    bm.rotation.z = Math.sin(t * 2) * 1.2;
                    // Blade proximity coin drop
                    if (game.ballMesh && game.ballMesh.position) {
                        const dx = Math.abs(game.ballMesh.position.x - bm.position.x);
                        const dy = Math.abs(game.ballMesh.position.y - bm.position.y);
                        const dz = Math.abs(game.ballMesh.position.z - bm.position.z);
                        if (dx < 2.0 && dy < 2.5 && dz < 2.0 && !m._lastContact) {
                            m._lastContact = true;
                            const levelMult = 1 + (game.currentLevel - 1) * 0.1;
                            if (game.triggerDropFromObstacle) {
                                game.triggerDropFromObstacle(m, { baseLoss: 6 * levelMult });
                            }
                        } else if (dx >= 2.5 || dy >= 3 || dz >= 2.5) {
                            m._lastContact = false;
                        }
                    }
                } else {
                    const sin = Math.sin(Date.now() * 0.002 * m.speedMult);
                    if (m.sideways) {
                        m.body.position.x = m.baseX + sin * m.range;
                    } else {
                        m.body.position.z = m.baseZ + sin * m.range;
                    }
                    m.mesh.position.copy(m.body.position);
                    if (m.trail) {
                        m.trail.position.copy(m.body.position);
                        m.trail.quaternion.copy(m.body.quaternion);
                    }
                }
            } catch (e) {}
        });

        // Coin-drop on obstacle contact (#5)
        // Pendulum collision → drop coins
        for (const p of game.pendulums) {
            try {
                const dx = game.ballBody.position.x - p.body.position.x;
                const dy = game.ballBody.position.y - p.body.position.y;
                const dz = game.ballBody.position.z - p.body.position.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const contactDist = 2.2; // ball radius + pendulum ball radius
                if (dist < contactDist && !p._lastContact) {
                    p._lastContact = true;
                    const levelMult = 1 + (game.currentLevel - 1) * 0.08;
                    const baseLoss = 3;
                    game.triggerDropFromObstacle(p, { baseLoss: baseLoss * levelMult });
                } else if (dist >= contactDist) {
                    p._lastContact = false;
                }
            } catch (e) {}
        }

        // Spinner contact → drop coins
        for (const s of game.spinners) {
            try {
                const dx = game.ballBody.position.x - s.body.position.x;
                const dy = game.ballBody.position.y - s.body.position.y;
                const dz = game.ballBody.position.z - s.body.position.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const contactDist = 4.5; // spinner bar half-length
                if (dist < contactDist && !s._lastContact) {
                    s._lastContact = true;
                    const levelMult = 1 + (game.currentLevel - 1) * 0.10;
                    const baseLoss = 4;
                    game.triggerDropFromObstacle(s, { baseLoss: baseLoss * levelMult });
                } else if (dist >= contactDist) {
                    s._lastContact = false;
                }
            } catch (e) {}
        }

        // Mover contact → drop coins
        for (const m of game.movers) {
            try {
                const dx = game.ballBody.position.x - m.body.position.x;
                const dy = game.ballBody.position.y - m.body.position.y;
                const dz = game.ballBody.position.z - m.body.position.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const contactDist = 2.8;
                if (dist < contactDist && !m._lastContact) {
                    m._lastContact = true;
                    const levelMult = 1 + (game.currentLevel - 1) * 0.12;
                    const baseLoss = 5;
                    game.triggerDropFromObstacle(m, { baseLoss: baseLoss * levelMult });
                } else if (dist >= contactDist) {
                    m._lastContact = false;
                }
            } catch (e) {}
        }

        // Rolling SFX volume based on speed
        if (game.rollSound) {
            const targetVolume = hSpeed > 1 && game.isGrounded ? Math.min(0.35, hSpeed / 12) : 0;
            game.rollSound.volume += (targetVolume - game.rollSound.volume) * 4 * dt;
        }

        // Portal particle animation
        updatePortalParticles(game, dt);

        // Spring pad trail animation
        updateSpringTrail(game, dt);
    } catch (e) {
        console.warn('updatePhysics error', e);
    }
}

export function jump(game) {
    if (game.isGameOver) return;
    if (!game.isGrounded && game.jumpCount >= 1) return; // Allow 1 air jump
    const jumpMult = game._abilityJump || 1.0;
    game.ballBody.velocity.y = JUMP_FORCE * jumpMult;
    game.jumpCount++;
    game.isGrounded = false;
}

// Rain particle system
export function createRain(game) {
    try {
        const count = getParticleCount(game, 'rain', 1200);
        const positions = new Float32Array(count * 3);
        const area = Math.max(30, Math.min(80, Math.floor((window.innerWidth + window.innerHeight) / 30)));
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix] = (Math.random() - 0.5) * area + (game.ballMesh ? game.ballMesh.position.x : 0);
            positions[ix + 1] = Math.random() * 40;
            positions[ix + 2] = (Math.random() - 0.5) * area + (game.ballMesh ? game.ballMesh.position.z : 0);
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.08, transparent: true, opacity: 0.65, depthWrite: false });
        game.rainPoints = new THREE.Points(geom, mat);
        game.rainPoints.frustumCulled = false;
        game.scene.add(game.rainPoints);
    } catch (e) {
        console.warn('createRain failed', e);
    }
}

export function clearRain(game) {
    try {
        if (game.rainPoints) {
            game.scene.remove(game.rainPoints);
            if (game.rainPoints.geometry) game.rainPoints.geometry.dispose();
            if (game.rainPoints.material) game.rainPoints.material.dispose();
            game.rainPoints = null;
        }
    } catch (e) {}
}

// Wind particle system
export function createWind(game) {
    try {
        const count = getParticleCount(game, 'wind', 200);
        const positions = new Float32Array(count * 3);
        const area = Math.max(20, Math.min(60, Math.floor((window.innerWidth + window.innerHeight) / 25)));
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix] = (Math.random() - 0.5) * area * 1.5 + (game.ballMesh ? game.ballMesh.position.x : 0);
            positions[ix + 1] = Math.random() * 25 + 2;
            positions[ix + 2] = (Math.random() - 0.5) * area + (game.ballMesh ? game.ballMesh.position.z : 0);
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color: 0xdddddd, size: 0.12, transparent: true, opacity: 0.45, depthWrite: false });
        game.windPoints = new THREE.Points(geom, mat);
        game.windPoints.frustumCulled = false;
        game.scene.add(game.windPoints);
    } catch (e) {
        console.warn('createWind failed', e);
    }
}

export function clearWind(game) {
    try {
        if (game.windPoints) {
            game.scene.remove(game.windPoints);
            if (game.windPoints.geometry) game.windPoints.geometry.dispose();
            if (game.windPoints.material) game.windPoints.material.dispose();
            game.windPoints = null;
        }
    } catch (e) {}
}

// --- Fire sparks particle system (Inferno sky condition) ---

export function createFireSparks(game) {
    try {
        const count = getParticleCount(game, 'fire', 300);
        const positions = new Float32Array(count * 3);
        const area = Math.max(25, Math.min(70, Math.floor((window.innerWidth + window.innerHeight) / 30)));
        const cx = game.ballMesh ? game.ballMesh.position.x : 0;
        const cz = game.ballMesh ? game.ballMesh.position.z : 0;
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix] = cx + (Math.random() - 0.5) * area;
            positions[ix + 1] = Math.random() * 20;
            positions[ix + 2] = cz + (Math.random() - 0.5) * area;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xff5500, size: 0.16, transparent: true, opacity: 0.7,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
        game.firePoints = new THREE.Points(geom, mat);
        game.firePoints.frustumCulled = false;
        game.scene.add(game.firePoints);
    } catch (e) {
        console.warn('createFireSparks failed', e);
    }
}

export function clearFireSparks(game) {
    try {
        if (game.firePoints) {
            game.scene.remove(game.firePoints);
            if (game.firePoints.geometry) game.firePoints.geometry.dispose();
            if (game.firePoints.material) game.firePoints.material.dispose();
            game.firePoints = null;
        }
    } catch (e) {}
}

export function updateFireSparks(game, dt) {
    try {
        if (!game.firePoints) return;
        const positions = game.firePoints.geometry.attributes.position.array;
        const count = positions.length / 3;
        const speed = 7;
        const areaX = 50, areaZ = 40;
        const spawnCeiling = 22;
        const spawnFloor = 3;
        const cx = game.ballMesh ? game.ballMesh.position.x : 0;
        const cz = game.ballMesh ? game.ballMesh.position.z : 0;
        const now = Date.now() * 0.001;
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            // Rise upward with gentle drift
            positions[ix + 1] += speed * dt;
            positions[ix] += Math.sin(now * 2.5 + i * 0.7) * 0.8 * dt;
            positions[ix + 2] += Math.cos(now * 1.8 + i * 0.9) * 0.5 * dt;
            // Respawn at bottom when rising above ceiling
            if (positions[ix + 1] > spawnCeiling) {
                positions[ix] = cx + (Math.random() - 0.5) * areaX;
                positions[ix + 1] = Math.random() * spawnFloor;
                positions[ix + 2] = cz + (Math.random() - 0.5) * areaZ;
            }
        }
        game.firePoints.geometry.attributes.position.needsUpdate = true;
    } catch (e) {}
}

// --- Heat shimmer particle system (Inferno sky: heat haze visual) ---
// Two-layer approach: a shimmer layer near the ground + rising distortion columns

export function createHeatShimmer(game) {
    try {
        const count = getParticleCount(game, 'heat', 250);
        const positions = new Float32Array(count * 3);
        const area = Math.max(28, Math.min(80, Math.floor((window.innerWidth + window.innerHeight) / 28)));
        const cx = game.ballMesh ? game.ballMesh.position.x : 0;
        const cz = game.ballMesh ? game.ballMesh.position.z : 0;
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix] = cx + (Math.random() - 0.5) * area;
            // Start near ground level and scattered up to mid-height
            positions[ix + 1] = Math.random() * 14;
            positions[ix + 2] = cz + (Math.random() - 0.5) * area;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xffddaa, size: 0.10,
            transparent: true, opacity: 0.35,
            depthWrite: false, blending: THREE.NormalBlending
        });
        game.heatShimmer = new THREE.Points(geom, mat);
        game.heatShimmer.frustumCulled = false;
        game.scene.add(game.heatShimmer);
        // Per-particle phase offset for wave animation
        game._heatPhases = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            game._heatPhases[i] = Math.random() * Math.PI * 2;
        }
        game._heatSpeeds = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            game._heatSpeeds[i] = 1.2 + Math.random() * 2.8;
        }
    } catch (e) {
        console.warn('createHeatShimmer failed', e);
    }
}

export function clearHeatShimmer(game) {
    try {
        if (game.heatShimmer) {
            game.scene.remove(game.heatShimmer);
            if (game.heatShimmer.geometry) game.heatShimmer.geometry.dispose();
            if (game.heatShimmer.material) game.heatShimmer.material.dispose();
            game.heatShimmer = null;
        }
        game._heatPhases = null;
        game._heatSpeeds = null;
    } catch (e) {}
}

export function updateHeatShimmer(game, dt) {
    try {
        if (!game.heatShimmer) return;
        const positions = game.heatShimmer.geometry.attributes.position.array;
        const count = positions.length / 3;
        const phases = game._heatPhases || [];
        const speeds = game._heatSpeeds || [];
        const shimmerCeiling = 16;
        const heatAreaX = 50, heatAreaZ = 40;
        const cx = game.ballMesh ? game.ballMesh.position.x : 0;
        const cz = game.ballMesh ? game.ballMesh.position.z : 0;
        const now = Date.now() * 0.001;

        // Pulse opacity for shimmer effect
        game.heatShimmer.material.opacity = 0.28 + Math.sin(now * 3.5) * 0.10;

        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            const phase = phases[i] || 0;
            const speed = speeds[i] || 2;
            // Slow upward drift with sinusoidal horizontal wobble
            positions[ix + 1] += speed * dt;
            positions[ix] += Math.sin(now * 4.0 + phase) * 1.0 * dt;
            positions[ix + 2] += Math.cos(now * 3.2 + phase + 1) * 0.8 * dt;
            // Respawn at ground when above ceiling — use areaLowY as the height threshold
            if (positions[ix + 1] > shimmerCeiling) {
                positions[ix] = cx + (Math.random() - 0.5) * heatAreaX;
                positions[ix + 1] = Math.random() * 2;
                positions[ix + 2] = cz + (Math.random() - 0.5) * heatAreaZ;
            }
        }
        game.heatShimmer.geometry.attributes.position.needsUpdate = true;
    } catch (e) {}
}

// --- Meteor hazard system (Void Storm sky condition) ---

function spawnMeteor(game) {
    try {
        const radius = 0.25 + Math.random() * 0.45;
        const shape = new CANNON.Sphere(radius);
        const body = new CANNON.Body({ mass: 5, shape: shape });
        const cx = game.ballMesh ? game.ballMesh.position.x : 0;
        const cz = game.ballMesh ? game.ballMesh.position.z : 0;
        const area = 28;
        body.position.set(
            cx + (Math.random() - 0.5) * area,
            22 + Math.random() * 18,
            cz + (Math.random() - 0.5) * area
        );
        body.velocity.set(
            (Math.random() - 0.5) * 4,
            -6 - Math.random() * 14,
            (Math.random() - 0.5) * 4
        );
        game.world.addBody(body);

        const geo = new THREE.SphereGeometry(radius, 8, 8);
        const mat = new THREE.MeshPhongMaterial({
            color: 0x8844ff, emissive: 0x330066, emissiveIntensity: 0.9
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(body.position);
        mesh.castShadow = true;
        game.scene.add(mesh);

        return { body, mesh, radius };
    } catch (e) {
        console.warn('spawnMeteor failed', e);
        return null;
    }
}

export function createMeteors(game) {
    game.meteors = game.meteors || [];
    const count = getParticleCount(game, 'meteor', 6);
    game._maxMeteors = getParticleCount(game, 'meteor', 12);
    for (let i = 0; i < count; i++) {
        const m = spawnMeteor(game);
        if (m) game.meteors.push(m);
    }
    game._meteorSpawnTimer = 0;
}

export function clearMeteors(game) {
    if (!game.meteors) return;
    for (const m of game.meteors) {
        if (m.body) game.world.removeBody(m.body);
        if (m.mesh) { game.scene.remove(m.mesh); if (m.mesh.geometry) m.mesh.geometry.dispose(); if (m.mesh.material) m.mesh.material.dispose(); }
    }
    game.meteors = [];
    game._meteorSpawnTimer = 0;
}

export function updateMeteors(game, dt) {
    if (!game.meteors) return;

    // Spawn new meteors periodically
    game._meteorSpawnTimer = (game._meteorSpawnTimer || 0) + dt;
    const interval = 0.7 + Math.random() * 0.9;
    const maxMeteors = game._maxMeteors || 12;
    if (game._meteorSpawnTimer > interval && game.meteors.length < maxMeteors) {
        game._meteorSpawnTimer = 0;
        const m = spawnMeteor(game);
        if (m) game.meteors.push(m);
    }

    // Update existing meteors — sync mesh, remove if below level
    for (let i = game.meteors.length - 1; i >= 0; i--) {
        const m = game.meteors[i];
        try {
            m.mesh.position.copy(m.body.position);
            m.mesh.quaternion.copy(m.body.quaternion);
        } catch (e) {}
        if (m.body.position.y < -22) {
            game.world.removeBody(m.body);
            game.scene.remove(m.mesh);
            if (m.mesh.geometry) m.mesh.geometry.dispose();
            if (m.mesh.material) m.mesh.material.dispose();
            game.meteors.splice(i, 1);
        }
    }
}

// --- Portal particle burst (visual effect on teleport) ---

function spawnPortalParticles(game, x, y, z) {
    try {
        const count = 24;
        const positions = new Float32Array(count * 3);
        const velocities = [];
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix] = x;
            positions[ix + 1] = y;
            positions[ix + 2] = z;
            velocities.push({
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8 + 2,
                vz: (Math.random() - 0.5) * 8
            });
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0x9944ff,
            size: 0.18,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const points = new THREE.Points(geom, mat);
        points.frustumCulled = false;
        game.scene.add(points);

        game._portalParticles = game._portalParticles || [];
        game._portalParticles.push({
            points,
            velocities,
            born: Date.now(),
            lifetime: 550
        });
    } catch (e) {}
}

function updatePortalParticles(game, dt) {
    try {
        if (!game._portalParticles) return;
        const now = Date.now();
        for (let i = game._portalParticles.length - 1; i >= 0; i--) {
            const pp = game._portalParticles[i];
            const age = now - pp.born;
            if (age > pp.lifetime) {
                game.scene.remove(pp.points);
                pp.points.geometry.dispose();
                pp.points.material.dispose();
                game._portalParticles.splice(i, 1);
                continue;
            }
            const pos = pp.points.geometry.attributes.position.array;
            const vel = pp.velocities;
            const fade = 1 - age / pp.lifetime;
            pp.points.material.opacity = fade * 0.85;
            pp.points.material.size = 0.18 * (0.5 + fade * 0.5);
            for (let j = 0; j < vel.length; j++) {
                const ix = j * 3;
                pos[ix] += vel[j].vx * dt;
                pos[ix + 1] += vel[j].vy * dt;
                pos[ix + 2] += vel[j].vz * dt;
                vel[j].vy += 1.5 * dt; // floaty upward drift
            }
            pp.points.geometry.attributes.position.needsUpdate = true;
        }
    } catch (e) {}
}

// --- Spring pad trail / afterimage effect ---

function spawnSpringTrail(game, x, y, z) {
    try {
        const count = 16;
        const positions = new Float32Array(count * 3);
        const velocities = [];
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix] = x + (Math.random() - 0.5) * 0.6;
            positions[ix + 1] = y;
            positions[ix + 2] = z + (Math.random() - 0.5) * 0.6;
            velocities.push({
                vx: (Math.random() - 0.5) * 3,
                vy: 6 + Math.random() * 6,
                vz: (Math.random() - 0.5) * 3
            });
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xff8800,
            size: 0.22,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const points = new THREE.Points(geom, mat);
        points.frustumCulled = false;
        game.scene.add(points);

        game._springTrail = game._springTrail || [];
        game._springTrail.push({
            points,
            velocities,
            born: Date.now(),
            lifetime: 450
        });
    } catch (e) {}
}

function updateSpringTrail(game, dt) {
    try {
        if (!game._springTrail) return;
        const now = Date.now();
        for (let i = game._springTrail.length - 1; i >= 0; i--) {
            const st = game._springTrail[i];
            const age = now - st.born;
            if (age > st.lifetime) {
                game.scene.remove(st.points);
                st.points.geometry.dispose();
                st.points.material.dispose();
                game._springTrail.splice(i, 1);
                continue;
            }
            const pos = st.points.geometry.attributes.position.array;
            const vel = st.velocities;
            const fade = 1 - age / st.lifetime;
            st.points.material.opacity = fade * 0.85;
            st.points.material.size = 0.22 * (0.4 + fade * 0.6);
            for (let j = 0; j < vel.length; j++) {
                const ix = j * 3;
                pos[ix] += vel[j].vx * dt;
                pos[ix + 1] += vel[j].vy * dt;
                pos[ix + 2] += vel[j].vz * dt;
                vel[j].vy -= 6 * dt; // gravity slows the particles
            }
            st.points.geometry.attributes.position.needsUpdate = true;
        }
    } catch (e) {}
}

export function checkMeteorCollisions(game) {
    if (!game.meteors || !game.ballBody) return;
    for (let i = game.meteors.length - 1; i >= 0; i--) {
        const m = game.meteors[i];
        if (m._hitPlayer) continue;
        try {
            const dx = game.ballBody.position.x - m.body.position.x;
            const dy = game.ballBody.position.y - m.body.position.y;
            const dz = game.ballBody.position.z - m.body.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const contactDist = 0.6 + (m.radius || 0.4);
            if (dist < contactDist) {
                m._hitPlayer = true;
                const levelMult = 1 + (game.currentLevel - 1) * 0.15;
                const baseLoss = 8;
                if (game.triggerDropFromObstacle) {
                    game.triggerDropFromObstacle(m, { baseLoss: baseLoss * levelMult });
                }
                // Knockback
                game.ballBody.velocity.x += (Math.random() - 0.5) * 12;
                game.ballBody.velocity.y += 6;
                game.ballBody.velocity.z += (Math.random() - 0.5) * 12;
                // Remove meteor after hit
                game.world.removeBody(m.body);
                game.scene.remove(m.mesh);
                if (m.mesh.geometry) m.mesh.geometry.dispose();
                if (m.mesh.material) m.mesh.material.dispose();
                game.meteors.splice(i, 1);
            }
        } catch (e) {}
    }
}
