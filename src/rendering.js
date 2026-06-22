/*
 Rendering module.
 Exports: onWindowResize(game), animate(game)

 Handles: window resize, main game loop (animation frame, physics step,
 camera orbit, rain/snow particle updates, sky rotation, scene render).
*/
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { updateGroovyCanvas } from '../engine/scene.js';
import { saveGame } from './persistence.js';

export function onWindowResize(game) {
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
    game.renderer.setSize(window.innerWidth, window.innerHeight);
}

export function animate(game) {
    requestAnimationFrame(() => animate(game));

    let dt = 0;
    if (game._lastFrameTime) {
        dt = Math.min(0.1, (performance.now() - game._lastFrameTime) / 1000);
    }
    game._lastFrameTime = performance.now();

    // Round delta-time for smoother feel across varying monitors
    try { dt = Math.round(dt * 100) / 100; } catch (e) {}

    // Update groovy canvas if active
    if (game.saveData && game.saveData.selectedBall === 'groovy') {
        updateGroovyCanvas(game, dt);
    }

    // Sky rotation
    if (game.skyMesh && game.skyRotationSpeed) {
        try {
            game.skyMesh.rotation.y += game.skyRotationSpeed * dt;
        } catch (e) {}
    }

    // Game loop if not game over
    if (!game.isGameOver) {
        if (game.updatePhysics) game.updatePhysics(dt);
        if (game.checkGameState) game.checkGameState(dt);
        // Particle/weather updates
        if (game.raining) updateRain(game, dt);
        if (game.snowing) updateSnow(game, dt);
    }

    // Camera follow
    updateCamera(game, dt);

    // Render
    try { game.renderer.render(game.scene, game.camera); } catch (e) {}

    // Auto-save periodically
    if (!game._lastSave || Date.now() - game._lastSave > 5000) {
        saveGame(game);
        game._lastSave = Date.now();
    }
}

function updateCamera(game, dt) {
    try {
        if (!game.ballMesh) return;
        game._vec3Cam.copy(game.ballMesh.position);
        game._vec3Dir.set(
            Math.sin(game.cameraYaw) * Math.cos(game.cameraPitch),
            Math.sin(game.cameraPitch),
            Math.cos(game.cameraYaw) * Math.cos(game.cameraPitch)
        ).normalize();
        game._vec3Desired.copy(game._vec3Cam)
            .addScaledVector(game._vec3Dir, game.cameraDistance);

        // Lerp camera for smooth follow
        const lerp = 6.0 * (dt || 0.016);
        game.camera.position.lerp(game._vec3Desired, lerp);
        game.camera.lookAt(game._vec3Cam);
    } catch (e) {}
}

function updateRain(game, dt) {
    try {
        if (!game.rainPoints) return;
        const positions = game.rainPoints.geometry.attributes.position.array;
        const count = positions.length / 3;
        const speed = 28;
        const areaX = 60, areaY = 50, areaZ = 40;
        const cx = game.ballMesh ? game.ballMesh.position.x : 0;
        const cz = game.ballMesh ? game.ballMesh.position.z : 0;
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix + 1] -= speed * dt;
            if (positions[ix + 1] < 0) {
                positions[ix] = cx + (Math.random() - 0.5) * areaX;
                positions[ix + 1] = 15 + Math.random() * areaY;
                positions[ix + 2] = cz + (Math.random() - 0.5) * areaZ;
            }
        }
        game.rainPoints.geometry.attributes.position.needsUpdate = true;
    } catch (e) {}
}

function updateSnow(game, dt) {
    try {
        if (!game.snowPoints) return;
        const positions = game.snowPoints.geometry.attributes.position.array;
        const count = positions.length / 3;
        const speed = 8;
        const areaX = 80, areaY = 45, areaZ = 60;
        const cx = game.ballMesh ? game.ballMesh.position.x : 0;
        const cz = game.ballMesh ? game.ballMesh.position.z : 0;
        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            positions[ix + 1] -= speed * dt;
            positions[ix] += Math.sin(positions[ix + 1] * 0.3 + i) * 0.5 * dt;
            if (positions[ix + 1] < 0) {
                positions[ix] = cx + (Math.random() - 0.5) * areaX;
                positions[ix + 1] = 15 + Math.random() * areaY;
                positions[ix + 2] = cz + (Math.random() - 0.5) * areaZ;
            }
        }
        game.snowPoints.geometry.attributes.position.needsUpdate = true;
    } catch (e) {}
}
