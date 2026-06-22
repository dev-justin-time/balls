/*
 Physics module.
 Exports: initPhysics(game), updatePhysics(game, dt), jump(game),
 createRain(game), clearRain(game), createWind(game), clearWind(game).

 Handles: cannon-es world, ball body, contact materials, input processing
 (keyboard, joystick, mouse), force application, wind, grounded check,
 physics-to-renderer sync.
*/
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getBallMaterial } from '../engine/scene.js';
import { getParticleCount } from './persistence.js';

// Physics constants (module-scoped for game feel tuning)
const BALL_RADIUS = 0.5;
const GRAVITY = -45;
const BALL_SPEED = 5000;
const STEER_SPEED = 22;
const MAX_VELOCITY = 18;
const JUMP_FORCE = 25;

export function initPhysics(game) {
    game.world = new CANNON.World();
    game.world.gravity.set(0, GRAVITY, 0);
    game.world.allowSleep = true;

    const ballMaterial = new CANNON.Material('ball');
    const groundMaterial = new CANNON.Material('ground');
    const contactMaterial = new CANNON.ContactMaterial(ballMaterial, groundMaterial, {
        friction: 1.0,
        restitution: 0.1
    });
    game.world.addContactMaterial(contactMaterial);

    const sphereShape = new CANNON.Sphere(BALL_RADIUS);
    game.ballBody = new CANNON.Body({
        mass: 100,
        shape: sphereShape,
        material: ballMaterial,
        angularDamping: 0.95,
        linearDamping: 0.5
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
        game.world.raycastClosest(game._vecA, game._vecB, {}, game._rayResult);
        if (game._rayResult.hasHit) {
            game.isGrounded = true;
        }
        if (game.isGrounded) game.jumpCount = 0;

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
        const speedMult = game._abilitySpeed || 1.0;
        if (game.isGrounded && inputX !== 0 || inputY !== 0) {
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

        // Mover sliding
        game.movers.forEach(m => {
            try {
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
            } catch (e) {}
        });

        // Rolling SFX volume based on speed
        if (game.rollSound) {
            const targetVolume = hSpeed > 1 && game.isGrounded ? Math.min(0.35, hSpeed / 12) : 0;
            game.rollSound.volume += (targetVolume - game.rollSound.volume) * 4 * dt;
        }
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
