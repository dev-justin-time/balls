/*
 Builder 3D Scene.
 Creates and manages a dedicated Three.js scene for the track builder —
 separate from the game's main scene. Handles the grid overlay, preview ghost,
 placed part tracking, raycasting for placement, and undo.
*/

import * as THREE from 'three';
import { computePlacement, createPreviewGhost } from './builder_snap.js';
import { getPartDef } from './catalog.js';
import { addBuilderXP } from './builder_xp.js';

/**
 * Initialize the builder scene within the game's existing renderer.
 * The builder shares the renderer/canvas but uses its own scene + camera.
 */
export function initBuilderScene(game) {
    // Builder scene (separate from game.scene)
    game._builderScene = new THREE.Scene();
    game._builderScene.background = new THREE.Color(0x1a1a2e);

    // Orthographic top-down camera for grid-based building
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 40;
    game._builderCamera = new THREE.OrthographicCamera(
        -viewSize * aspect, viewSize * aspect,
        viewSize, -viewSize,
        0.1, 500
    );
    game._builderCamera.position.set(0, 30, 0);
    game._builderCamera.lookAt(0, 0, -20);
    game._builderCamera.zoom = 1.2;
    game._builderCamera.updateProjectionMatrix();

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    game._builderScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(10, 25, 10);
    game._builderScene.add(dirLight);

    // Grid overlay
    game._builderGrid = createGridOverlay(80);
    game._builderScene.add(game._builderGrid);

    // Player spawn marker
    game._builderSpawnMarker = createSpawnMarker();
    game._builderScene.add(game._builderSpawnMarker);

    // Preview ghost
    game._builderPreview = new THREE.Group();
    game._builderPreview.visible = false;
    game._builderScene.add(game._builderPreview);

    // Placed parts list
    game._builderPlacedParts = [];

    // Currently selected part key
    game._builderSelectedKey = 'platform';

    // Camera controls state
    game._builderPanX = 0;
    game._builderPanZ = -20;
    game._builderZoom = 1.2;
    game._builderIsPanning = false;
    game._builderPanStart = { x: 0, y: 0 };

    // Mouse ray for placement
    game._builderRaycaster = new THREE.Raycaster();
    game._builderMouse = new THREE.Vector2();
    game._builderGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Undo stack
    game._builderUndoStack = [];
}

/**
 * Create a grid overlay on the XZ plane.
 */
/**
 * Green arrow marker at (0,0,0) showing where the player starts.
 */
function createSpawnMarker() {
    const group = new THREE.Group();
    // Green pillar
    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 8);
    const pillarMat = new THREE.MeshPhongMaterial({ color: 0x00ff44, emissive: 0x003311, transparent: true, opacity: 0.9 });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(0, 1.5, 0);
    group.add(pillar);
    // Arrow cone pointing in -Z direction
    const coneGeo = new THREE.ConeGeometry(0.5, 1.5, 8);
    const coneMat = new THREE.MeshPhongMaterial({ color: 0x00ff44, emissive: 0x003311, transparent: true, opacity: 0.9 });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(0, 3.5, -0.8);
    cone.rotation.x = -Math.PI / 2;
    group.add(cone);
    // Ring on ground
    const ringGeo = new THREE.TorusGeometry(1.2, 0.15, 8, 16);
    const ringMat = new THREE.MeshPhongMaterial({ color: 0x00ff44, emissive: 0x002211, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0.05, 0);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    return group;
}

function createGridOverlay(size) {
    const group = new THREE.Group();
    const half = size / 2;
    const step = 1;
    const color = 0x334466;

    const points = [];
    for (let i = -half; i <= half; i += step) {
        points.push(new THREE.Vector3(i, 0.01, -half));
        points.push(new THREE.Vector3(i, 0.01, half));
        points.push(new THREE.Vector3(-half, 0.01, i));
        points.push(new THREE.Vector3(half, 0.01, i));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25, depthTest: false });
    const grid = new THREE.LineSegments(geo, mat);
    group.add(grid);

    // Major grid lines every 5 units
    const majorPoints = [];
    for (let i = -half; i <= half; i += 5) {
        majorPoints.push(new THREE.Vector3(i, 0.02, -half));
        majorPoints.push(new THREE.Vector3(i, 0.02, half));
        majorPoints.push(new THREE.Vector3(-half, 0.02, i));
        majorPoints.push(new THREE.Vector3(half, 0.02, i));
    }
    const majorGeo = new THREE.BufferGeometry().setFromPoints(majorPoints);
    const majorMat = new THREE.LineBasicMaterial({ color: 0x556688, transparent: true, opacity: 0.45, depthTest: false });
    group.add(new THREE.LineSegments(majorGeo, majorMat));

    return group;
}

/**
 * Handle mouse move while in builder mode.
 * Updates the preview ghost position.
 */
export function onBuilderMouseMove(game, clientX, clientY) {
    if (!game._builderScene || !game._builderSelectedKey) return;

    const partDef = getPartDef(game._builderSelectedKey);
    if (!partDef) return;

    // Convert screen coords to NDC
    game._builderMouse.x = (clientX / window.innerWidth) * 2 - 1;
    game._builderMouse.y = -(clientY / window.innerHeight) * 2 + 1;

    // Panning
    if (game._builderIsPanning) {
        const dx = clientX - game._builderPanStart.x;
        const dy = clientY - game._builderPanStart.y;
        const zoomFactor = 1 / game._builderZoom;
        game._builderPanX = game._builderPanBase.x - dx * 0.08 * zoomFactor;
        game._builderPanZ = game._builderPanBase.y + dy * 0.08 * zoomFactor;
        updateBuilderCamera(game);
        return;
    }

    // Raycast against ground plane
    game._builderRaycaster.setFromCamera(game._builderMouse, game._builderCamera);
    const hitPoint = new THREE.Vector3();
    const hit = game._builderRaycaster.ray.intersectPlane(game._builderGroundPlane, hitPoint);

    if (hit) {
        const snapResult = computePlacement(hitPoint, game._builderPlacedParts, partDef);
        updatePreviewGhost(game, snapResult.position, snapResult.rotation);
        game._builderPendingPos = snapResult;

        // Hover highlight: find nearest placed part
        updateHoverHighlight(game, clientX, clientY, hitPoint);
    }
}

/**
 * Highlight the nearest placed part under the cursor with a wireframe outline.
 */
function updateHoverHighlight(game, clientX, clientY, hitPoint) {
    if (!game._builderPlacedParts || game._builderPlacedParts.length === 0) {
        removeHighlight(game);
        return;
    }

    // Find closest placed part mesh to the ground-plane hit point
    let closestPlaced = null;
    let closestDist = Infinity;

    for (const placed of game._builderPlacedParts) {
        if (!placed.meshes) continue;
        for (const mesh of placed.meshes) {
            const cp = new THREE.Vector3();
            mesh.getWorldPosition(cp);
            const d = hitPoint.distanceToSquared(cp);
            if (d < closestDist) {
                closestDist = d;
                closestPlaced = placed;
            }
        }
    }

    const threshold = 100; // distance² threshold for hover
    if (!closestPlaced || closestDist > threshold) {
        removeHighlight(game);
        return;
    }

    if (game._builderHovered === closestPlaced) return; // already highlighted

    removeHighlight(game);

    // Create wireframe highlight around all meshes of the hovered part
    game._builderHighlightGroup = new THREE.Group();
    for (const mesh of closestPlaced.meshes) {
        if (!mesh.geometry) continue;
        const edgeGeo = new THREE.EdgesGeometry(mesh.geometry);
        const edgeMat = new THREE.LineBasicMaterial({
            color: 0xffcc00,
            transparent: true,
            opacity: 0.9,
            depthTest: false
        });
        const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLine.position.copy(mesh.position);
        edgeLine.rotation.copy(mesh.rotation);
        edgeLine.scale.copy(mesh.scale).multiplyScalar(1.05);
        game._builderHighlightGroup.add(edgeLine);
    }
    game._builderScene.add(game._builderHighlightGroup);
    game._builderHovered = closestPlaced;
}

function removeHighlight(game) {
    if (game._builderHighlightGroup) {
        game._builderScene.remove(game._builderHighlightGroup);
        game._builderHighlightGroup.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
        game._builderHighlightGroup = null;
        game._builderHovered = null;
    }
}

/**
 * Handle click in builder mode — place the selected part or delete a hovered part.
 */
export function onBuilderClick(game, clientX, clientY) {
    if (!game._builderPendingPos) return;

    // Shift+click = delete nearest placed part
    if (game._builderShiftDown) {
        deleteHoveredPart(game, clientX, clientY);
        return;
    }

    const pos = game._builderPendingPos.position;
    const rot = game._builderPendingPos.rotation || 0;

    placePart(game, game._builderSelectedKey, pos.x, pos.y, pos.z, rot);
}

/**
 * Delete the nearest placed part under the cursor.
 */
function deleteHoveredPart(game, clientX, clientY) {
    if (!game._builderPlacedParts || game._builderPlacedParts.length === 0) return;

    // Find the closest placed part mesh to the cursor ray hit
    const mouse = new THREE.Vector2(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, game._builderCamera);

    const meshes = [];
    for (const placed of game._builderPlacedParts) {
        if (placed.meshes) {
            for (const mesh of placed.meshes) {
                meshes.push(mesh);
            }
        }
    }

    const hits = raycaster.intersectObjects(meshes);
    if (hits.length === 0) return;

    const hitMesh = hits[0].object;

    // Find which placed part owns this mesh
    for (let i = game._builderPlacedParts.length - 1; i >= 0; i--) {
        const placed = game._builderPlacedParts[i];
        if (placed.meshes && placed.meshes.includes(hitMesh)) {
            // Save state for undo
            game._builderUndoStack.push([...game._builderPlacedParts.map(p => ({ ...p }))]);

            // Remove meshes
            for (const mesh of placed.meshes) {
                game._builderScene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
            }
            game._builderPlacedParts.splice(i, 1);

            if (game._builderSyncRemove) {
                game._builderSyncRemove(placed);
            }
            break;
        }
    }

    // Clear hover highlight
    if (game._builderHovered) {
        removeHighlight(game);
    }
}

/**
 * Place a part in the builder scene.
 */
export function placePart(game, partKey, x, y, z, rotation) {
    const partDef = getPartDef(partKey);
    if (!partDef) return;

    const d = partDef.defaults;
    const placedParts = game._builderPlacedParts;

    // Push to undo stack before placing
    game._builderUndoStack.push([...placedParts.map(p => ({ ...p }))]);

    // Call the appropriate builder function to create mesh(es)
    const createdMeshes = buildPartMesh(game, partDef, x, y, z, rotation, d);

    placedParts.push({
        partKey,
        x, y, z,
        rotation,
        params: { ...d },
        meshes: createdMeshes,
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    });

    // Sync to multiplayer if active
    if (game._builderSyncAdd) {
        game._builderSyncAdd(placedParts[placedParts.length - 1]);
    }

    // Award XP for part placement (skip notification for bulk loads)
    if (!game._builderBulkLoad) {
        game.saveData.totalPartsPlaced = (game.saveData.totalPartsPlaced || 0) + 1;
        addBuilderXP(game, 2, `Placed ${partDef.name}`);
    }
}

/**
 * Undo the last placement.
 */
export function undoLastPlacement(game) {
    if (game._builderUndoStack.length === 0) return;

    // Restore from undo stack
    const previousState = game._builderUndoStack.pop();

    // Remove meshes for parts not in the previous state
    const currentParts = game._builderPlacedParts;
    const prevKeys = new Set(previousState.map(p => p.id));

    for (const placed of [...currentParts]) {
        if (!prevKeys.has(placed.id)) {
            if (placed.meshes) {
                for (const mesh of placed.meshes) {
                    game._builderScene.remove(mesh);
                    if (mesh.geometry) mesh.geometry.dispose();
                    if (mesh.material) mesh.material.dispose();
                }
            }
            if (game._builderSyncRemove) {
                game._builderSyncRemove(placed);
            }
        }
    }

    game._builderPlacedParts = previousState;
}

/**
 * Build the 3D mesh(es) for a part and add to the builder scene.
 * Returns array of created meshes.
 */
function buildPartMesh(game, partDef, x, y, z, rotation, d) {
    const meshes = [];
    const scene = game._builderScene;

    switch (partDef.key) {
        case 'platform':
        case 'speed_strip':
        case 'finish_line': {
            const color = partDef.key === 'speed_strip' ? 0xffff00 :
                          partDef.key === 'finish_line' ? 0x00aa00 : 0x8B7355;
            const geo = new THREE.BoxGeometry(d.width || 8, 1, d.length || 15);
            const mat = new THREE.MeshPhongMaterial({ color, shininess: 20 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y - 0.5, z);
            mesh.rotation.y = rotation;
            mesh.userData = { partKey: partDef.key, isBuilderPart: true };
            scene.add(mesh);
            meshes.push(mesh);
            break;
        }
        case 'ramp': {
            const h = d.height || 5;
            const l = d.length || 15;
            const w = d.width || 8;
            const angle = Math.atan2(h, l);
            const rampLen = Math.sqrt(l * l + h * h);
            const geo = new THREE.BoxGeometry(w, 1, rampLen);
            const mat = new THREE.MeshPhongMaterial({ color: 0x8B7355, shininess: 20 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y + h / 2 - 0.5, z - l / 2);
            mesh.rotation.set(angle, rotation, 0);
            mesh.userData = { partKey: 'ramp', isBuilderPart: true };
            scene.add(mesh);
            meshes.push(mesh);
            break;
        }
        case 'glass_platform': {
            const geo = new THREE.BoxGeometry(d.width || 6, 0.8, d.length || 14);
            const mat = new THREE.MeshPhongMaterial({
                color: 0xddeeff,
                transparent: true,
                opacity: 0.35,
                shininess: 90
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y - 0.4, z);
            mesh.rotation.y = rotation;
            mesh.userData = { partKey: 'glass_platform', isBuilderPart: true };
            scene.add(mesh);
            meshes.push(mesh);
            break;
        }
        case 'wall': {
            const geo = new THREE.BoxGeometry(d.width || 1, 4, d.length || 20);
            const mat = new THREE.MeshPhongMaterial({
                color: 0x666666,
                transparent: true,
                opacity: 0.55
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y + 2, z);
            mesh.rotation.set(0, rotation, d.rotZ || 0);
            mesh.userData = { partKey: 'wall', isBuilderPart: true };
            scene.add(mesh);
            meshes.push(mesh);
            break;
        }
        case 'tunnel_walls': {
            const w = d.width || 8;
            const l = d.length || 30;
            const wallGeo = new THREE.BoxGeometry(0.2, 2, l);
            const wallMat = new THREE.MeshPhongMaterial({
                color: 0x666666,
                transparent: true,
                opacity: 0.55
            });
            const left = new THREE.Mesh(wallGeo, wallMat);
            left.position.set(x - w / 2 - 0.1, y + 1, z);
            left.rotation.y = rotation;
            left.userData = { partKey: 'tunnel_walls', isBuilderPart: true };
            const right = new THREE.Mesh(wallGeo, wallMat);
            right.position.set(x + w / 2 + 0.1, y + 1, z);
            right.rotation.y = rotation;
            right.userData = { partKey: 'tunnel_walls', isBuilderPart: true };
            scene.add(left, right);
            meshes.push(left, right);
            break;
        }
        case 'pendulum': {
            const ballGeo = new THREE.SphereGeometry(1.6, 20, 20);
            const ballMat = new THREE.MeshPhongMaterial({ color: 0xaa0000 });
            const ball = new THREE.Mesh(ballGeo, ballMat);
            ball.position.set(x, y + 3, z);
            ball.userData = { partKey: 'pendulum', isBuilderPart: true };
            scene.add(ball);
            meshes.push(ball);

            // Pivot post
            const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 8, 8);
            const postMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(x, y + 4, z);
            post.userData = { partKey: 'pendulum_post', isBuilderPart: true };
            scene.add(post);
            meshes.push(post);
            break;
        }
        case 'spinner': {
            const geo = new THREE.BoxGeometry(8, 0.3, 0.3);
            const mat = new THREE.MeshPhongMaterial({ color: 0x0000ff });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y + 0.5, z);
            mesh.rotation.y = rotation;
            mesh.userData = { partKey: 'spinner', isBuilderPart: true };
            scene.add(mesh);
            meshes.push(mesh);
            break;
        }
        case 'hammer': {
            const geo = new THREE.BoxGeometry(5, 1.2, 1.2);
            const mat = new THREE.MeshPhongMaterial({ color: 0xff4500 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y + 3, z);
            mesh.rotation.set(Math.PI / 2, rotation, 0);
            mesh.userData = { partKey: 'hammer', isBuilderPart: true };
            scene.add(mesh);
            meshes.push(mesh);
            break;
        }
        case 'mover': {
            const geo = new THREE.BoxGeometry(d.width || 3, d.height || 1, d.depth || 2);
            const mat = new THREE.MeshPhongMaterial({ color: 0xff4500 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y + (d.height || 1) / 2, z);
            mesh.rotation.y = rotation;
            mesh.userData = { partKey: 'mover', isBuilderPart: true };
            scene.add(mesh);
            meshes.push(mesh);
            break;
        }
        case 'blade': {
            const geo = new THREE.BoxGeometry(d.thickness || 0.12, d.length || 2, 0.08);
            const mat = new THREE.MeshPhongMaterial({
                color: 0x222222,
                emissive: 0x661111,
                shininess: 60
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y + (d.length || 2) / 2, z);
            mesh.rotation.y = rotation;
            mesh.userData = { partKey: 'blade', isBuilderPart: true };
            scene.add(mesh);
            meshes.push(mesh);
            break;
        }
        case 'coin_line': {
            const count = d.count || 5;
            const len = d.length || 20;
            const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12);
            const coinMat = new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 80 });
            for (let i = 0; i < count; i++) {
                const cz = z - (i / Math.max(1, count - 1)) * len;
                const coin = new THREE.Mesh(coinGeo, coinMat);
                coin.position.set(x + (Math.random() - 0.5) * 2, y + 1 + Math.random() * 1.5, cz);
                coin.rotation.x = Math.PI / 2;
                coin.rotation.z = rotation;
                coin.userData = { partKey: 'coin_line', isBuilderPart: true };
                scene.add(coin);
                meshes.push(coin);
            }
            break;
        }
        case 'checkpoint': {
            const postGeo = new THREE.BoxGeometry(0.2, 3, 0.2);
            const postMat = new THREE.MeshPhongMaterial({ color: 0x00ff88, emissive: 0x003322 });
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(x, y + 1.5, z);
            post.userData = { partKey: 'checkpoint', isBuilderPart: true };
            scene.add(post);
            meshes.push(post);

            // Flag
            const flagGeo = new THREE.PlaneGeometry(1.5, 0.8);
            const flagMat = new THREE.MeshPhongMaterial({
                color: 0xff4444,
                side: THREE.DoubleSide,
                emissive: 0x220000
            });
            const flag = new THREE.Mesh(flagGeo, flagMat);
            flag.position.set(x + 0.8, y + 3, z);
            flag.userData = { partKey: 'checkpoint', isBuilderPart: true };
            scene.add(flag);
            meshes.push(flag);
            break;
        }
        case 'finish_model': {
            const archGeo = new THREE.BoxGeometry(10, 1, 1);
            const postGeo = new THREE.BoxGeometry(1, 8, 1);
            const mat = new THREE.MeshPhongMaterial({ color: 0x00ff00, emissive: 0x003300 });
            const arch = new THREE.Mesh(archGeo, mat);
            arch.position.set(x, y + 8, z);
            arch.userData = { partKey: 'finish_model', isBuilderPart: true };
            const postL = new THREE.Mesh(postGeo, mat);
            postL.position.set(x - 4.5, y + 4, z);
            postL.userData = { partKey: 'finish_model', isBuilderPart: true };
            const postR = new THREE.Mesh(postGeo, mat);
            postR.position.set(x + 4.5, y + 4, z);
            postR.userData = { partKey: 'finish_model', isBuilderPart: true };
            scene.add(arch, postL, postR);
            meshes.push(arch, postL, postR);
            break;
        }
        default: {
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const mat = new THREE.MeshPhongMaterial({ color: 0xff00ff });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            mesh.userData = { partKey: partDef.key, isBuilderPart: true };
            scene.add(mesh);
            meshes.push(mesh);
        }
    }

    return meshes;
}

/**
 * Update the preview ghost position and visibility.
 */
function updatePreviewGhost(game, position, rotationY) {
    if (!game._builderPreview) return;
    const partDef = getPartDef(game._builderSelectedKey);
    if (!partDef) {
        game._builderPreview.visible = false;
        return;
    }

    // Rebuild ghost (cheap — just a few primitives)
    while (game._builderPreview.children.length > 0) {
        const child = game._builderPreview.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        game._builderPreview.remove(child);
    }

    const ghost = createPreviewGhost(partDef, position, rotationY);
    if (ghost) {
        game._builderPreview.add(ghost);
        game._builderPreview.position.set(0, 0, 0);
        game._builderPreview.visible = true;
    } else {
        game._builderPreview.visible = false;
    }
}

/**
 * Update the builder camera based on pan/zoom state.
 */
function updateBuilderCamera(game) {
    if (!game._builderCamera) return;
    game._builderCamera.position.set(
        game._builderPanX,
        30,
        game._builderPanZ
    );
    game._builderCamera.lookAt(game._builderPanX, 0, game._builderPanZ - 20);
    game._builderCamera.zoom = game._builderZoom;
    game._builderCamera.updateProjectionMatrix();
}

/**
 * Handle mouse wheel for zoom.
 */
export function onBuilderWheel(game, deltaY) {
    game._builderZoom = Math.max(0.3, Math.min(4, game._builderZoom - deltaY * 0.001));
    updateBuilderCamera(game);
}

/**
 * Start panning.
 */
export function onBuilderPanStart(game, clientX, clientY) {
    game._builderIsPanning = true;
    game._builderPanStart = { x: clientX, y: clientY };
    game._builderPanBase = { x: game._builderPanX, y: game._builderPanZ };
}

/**
 * End panning.
 */
export function onBuilderPanEnd(game) {
    game._builderIsPanning = false;
}

/**
 * Render the builder scene (called from the main render loop when active).
 */
export function renderBuilder(game) {
    if (!game._builderScene || !game._builderCamera) return;
    game.renderer.render(game._builderScene, game._builderCamera);
}

/**
 * Clear all placed parts from the builder scene.
 */
export function clearBuilderScene(game) {
    if (!game._builderPlacedParts) return;
    for (const placed of game._builderPlacedParts) {
        if (placed.meshes) {
            for (const mesh of placed.meshes) {
                game._builderScene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
            }
        }
    }
    game._builderPlacedParts = [];
    game._builderUndoStack = [];
    removeHighlight(game);
}

/**
 * Load parts from a saved definition into the builder.
 */
export function loadPartsIntoBuilder(game, parts) {
    clearBuilderScene(game);
    // Mark bulk load to suppress per-part XP notifications
    game._builderBulkLoad = true;
    try {
        for (const p of parts) {
            const partDef = getPartDef(p.partKey);
            if (!partDef) continue;
            const d = { ...partDef.defaults, ...(p.params || {}) };
            const meshes = buildPartMesh(game, partDef, p.x, p.y, p.z, p.rotation || 0, d);
            game._builderPlacedParts.push({
                partKey: p.partKey,
                x: p.x, y: p.y, z: p.z,
                rotation: p.rotation || 0,
                params: d,
                meshes,
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 7)
            });
        }
    } finally {
        game._builderBulkLoad = false;
    }
}

/**
 * Dispose the entire builder scene.
 */
export function disposeBuilderScene(game) {
    _unwire2DEvents(game);
    clearBuilderScene(game);
    if (game._builderPreview) {
        game._builderScene.remove(game._builderPreview);
        game._builderPreview = null;
    }
    if (game._builderGrid) {
        game._builderScene.remove(game._builderGrid);
        // Dispose grid children
        game._builderGrid.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
        game._builderGrid = null;
    }
    game._builderScene = null;
    game._builderCamera = null;
}

// ---------------------------------------------------------------------------
// Event Wiring: self-managed 2D builder event listeners
// (mirrors the 3D builder's _wire3DEvents / _unwire3DEvents pattern)
// ---------------------------------------------------------------------------

let _2DListenersWired = false;

/**
 * Wire 2D builder mouse/keyboard events to the window.
 * Only fires when _builderActive is true AND _builderIs3D is false.
 */
export function _wire2DEvents(game) {
    if (_2DListenersWired) return;

    game._builder2D_onMouseDown = (e) => {
        if (!game._builderActive || game._builderIs3D) return;
        if (e.target.closest && (e.target.closest('#builder-sidebar') || e.target.closest('#top-menu') || e.target.closest('.modal'))) return;
        // Right-click = start panning
        if (e.button === 2) {
            e.preventDefault();
            onBuilderPanStart(game, e.clientX, e.clientY);
        }
        // Track shift key for delete-on-click
        game._builderShiftDown = e.shiftKey;
    };

    game._builder2D_onMouseMove = (e) => {
        if (!game._builderActive || game._builderIs3D) return;
        onBuilderMouseMove(game, e.clientX, e.clientY);
    };

    game._builder2D_onMouseUp = (e) => {
        if (!game._builderActive || game._builderIs3D) return;
        if (game._builderIsPanning) {
            onBuilderPanEnd(game);
        }
    };

    game._builder2D_onClick = (e) => {
        if (!game._builderActive || game._builderIs3D) return;
        if (e.target.closest && (e.target.closest('#builder-sidebar') || e.target.closest('#top-menu') || e.target.closest('.modal'))) return;
        game._builderShiftDown = e.shiftKey;
        onBuilderClick(game, e.clientX, e.clientY);
    };

    game._builder2D_onWheel = (e) => {
        if (!game._builderActive || game._builderIs3D) return;
        e.preventDefault();
        onBuilderWheel(game, e.deltaY);
    };

    game._builder2D_onContextMenu = (e) => {
        if (!game._builderActive || game._builderIs3D) return;
        e.preventDefault(); // Block right-click menu in builder
    };

    window.addEventListener('mousedown', game._builder2D_onMouseDown);
    window.addEventListener('mousemove', game._builder2D_onMouseMove);
    window.addEventListener('mouseup', game._builder2D_onMouseUp);
    window.addEventListener('click', game._builder2D_onClick);
    window.addEventListener('wheel', game._builder2D_onWheel, { passive: false });
    window.addEventListener('contextmenu', game._builder2D_onContextMenu);

    _2DListenersWired = true;
}

/**
 * Remove 2D builder event listeners from the window.
 */
export function _unwire2DEvents(game) {
    if (!_2DListenersWired) return;

    if (game._builder2D_onMouseDown) window.removeEventListener('mousedown', game._builder2D_onMouseDown);
    if (game._builder2D_onMouseMove) window.removeEventListener('mousemove', game._builder2D_onMouseMove);
    if (game._builder2D_onMouseUp) window.removeEventListener('mouseup', game._builder2D_onMouseUp);
    if (game._builder2D_onClick) window.removeEventListener('click', game._builder2D_onClick);
    if (game._builder2D_onWheel) window.removeEventListener('wheel', game._builder2D_onWheel);
    if (game._builder2D_onContextMenu) window.removeEventListener('contextmenu', game._builder2D_onContextMenu);

    game._builder2D_onMouseDown = null;
    game._builder2D_onMouseMove = null;
    game._builder2D_onMouseUp = null;
    game._builder2D_onClick = null;
    game._builder2D_onWheel = null;
    game._builder2D_onContextMenu = null;

    _2DListenersWired = false;
}
