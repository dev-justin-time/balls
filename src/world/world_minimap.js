/*
 World 3D Minimap — Neighbor Site Previews.
 Renders semi-transparent ghost meshes of neighboring sites' track parts
 directly in the game scene, so players can see adjacent builds while playing.
 Only renders parts from the 4 neighboring sites (not the current site).

 Parts are positioned at world-space offsets: each site is offset by
 SITE_SIZE (120 units) in X or Z from its neighbors.
*/

import * as THREE from 'three';
import { SITE_SIZE, getNeighborCoords, TERRAIN_PRESETS } from './world_state.js';

// Ghost material for neighbor parts — semi-transparent with a subtle glow
const GHOST_COLOR = 0x9944ff;
const GHOST_OPACITY = 0.18;
const GHOST_BORDER_OPACITY = 0.35;

// Border particle effect — floating sparkles at shared edges
const BORDER_PARTICLE_MIN_COUNT = 6;  // min particles (weak connection)
const BORDER_PARTICLE_MAX_COUNT = 32; // max particles (strong connection)
const BORDER_THRESHOLD = SITE_SIZE * 0.35; // parts within this distance of edge are 'near border'
const BORDER_PARTICLE_SPEED = 1.5;    // upward drift speed
// Color ramp: cool cyan (weak) → warm gold (strong) based on connection strength
const BORDER_COLOR_WEAK = new THREE.Color(0x66ccff);   // cyan — few parts near border
const BORDER_COLOR_STRONG = new THREE.Color(0xffcc33); // gold — many parts near border
const BORDER_STRENGTH_PARTS = 10; // number of near-parts at which connection is 'fully strong'

/**
 * Initialize the 3D minimap system.
 * Creates a THREE.Group in the game scene to hold all neighbor ghost meshes.
 */
export function initNeighborPreview(game) {
    if (game._neighborPreviewGroup) return; // already initialized

    const group = new THREE.Group();
    group.name = 'neighborPreview';
    game.scene.add(group);
    game._neighborPreviewGroup = group;
    game._neighborPreviewVisible = true;
    game._neighborPreviewDirty = true;
    game._neighborPreviewSites = {}; // key → { group, siteKey }
    game._neighborPreviewUpdateTimer = 0;
}

/**
 * Update neighbor preview meshes. Called from the render loop.
 * Throttled to avoid rebuilding every frame.
 */
export function updateNeighborPreview(game, dt) {
    if (!game._neighborPreviewGroup || !game._neighborPreviewVisible) return;
    if (!game._worldGrid) return;

    // Throttle rebuilds to every 2 seconds
    game._neighborPreviewUpdateTimer = (game._neighborPreviewUpdateTimer || 0) + dt;
    if (game._neighborPreviewUpdateTimer < 2.0 && !game._neighborPreviewDirty) return;
    game._neighborPreviewUpdateTimer = 0;
    game._neighborPreviewDirty = false;

    const grid = game._worldGrid;
    const currentSite = grid.viewCenter || { col: 0, row: 0 };
    const neighbors = getNeighborCoords(currentSite.col, currentSite.row);

    // Track which sites are currently rendered
    const activeKeys = new Set();

    for (const n of neighbors) {
        const site = grid.getSite(n.col, n.row);
        if (!site || !site.parts || site.parts.length === 0) continue;

        const key = `${n.col}_${n.row}`;
        activeKeys.add(key);

        // Check if we already have meshes for this site — cancel fade-out if it came back
        const existing = game._neighborPreviewSites[key];
        if (existing) {
            if (existing.fadeOutStart) existing.fadeOutStart = null;
            continue;
        }

        // Build ghost meshes for this neighbor site
        const siteGroup = buildNeighborSiteMeshes(site, n, currentSite, game);
        game._neighborPreviewGroup.add(siteGroup);
        game._neighborPreviewSites[key] = { group: siteGroup, siteKey: key };
    }

    // Mark meshes for fade-out when sites leave range (don't remove instantly)
    for (const existingKey of Object.keys(game._neighborPreviewSites)) {
        const entry = game._neighborPreviewSites[existingKey];
        if (!activeKeys.has(existingKey) && !entry.fadeOutStart) {
            entry.fadeOutStart = Date.now();
        }
    }

    // Fully remove meshes whose fade-out has completed
    for (const existingKey of Object.keys(game._neighborPreviewSites)) {
        const entry = game._neighborPreviewSites[existingKey];
        if (entry.fadeOutStart && (Date.now() - entry.fadeOutStart) > 600) {
            removeNeighborSiteMeshes(entry);
            delete game._neighborPreviewSites[existingKey];
        }
    }
}

/**
 * Build ghost meshes for a neighbor site's parts.
 * Parts are positioned at their site offset in world space.
 */
function buildNeighborSiteMeshes(site, neighborInfo, currentCenter, game) {
    const group = new THREE.Group();
    group.name = `neighbor_${site.col}_${site.row}`;

    // Offset: neighbor site's world-space position relative to the player's current site
    const dx = (neighborInfo.col - currentCenter.col) * SITE_SIZE;
    const dz = (neighborInfo.row - currentCenter.row) * SITE_SIZE;
    group.position.set(dx, 0, dz);

    // Terrain indicator — a subtle border plane
    const terrain = TERRAIN_PRESETS[site.terrain] || TERRAIN_PRESETS.sky_high;
    const borderGeo = new THREE.PlaneGeometry(SITE_SIZE * 0.95, SITE_SIZE * 0.95);
    const borderMat = new THREE.MeshBasicMaterial({
        color: terrain.color,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.y = -0.3;
    group.add(border);

    // Site label — a small marker at center
    const markerGeo = new THREE.SphereGeometry(1.2, 8, 6);
    const markerMat = new THREE.MeshPhongMaterial({
        color: site.ownerId ? 0x44ff88 : 0x888888,
        emissive: site.ownerId ? 0x003311 : 0x111111,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.y = 2;
    group.add(marker);

    // Part ghosts — simplified representations
    for (const part of site.parts) {
        const ghost = buildPartGhost(part);
        if (ghost) {
            ghost.position.set(part.x, part.y, part.z);
            if (part.rotation) ghost.rotation.y = part.rotation;
            group.add(ghost);
        }
    }

    // Collect ghost materials for efficient per-frame animation (avoids traversals)
    // Only part ghost materials fade in — border plane and marker stay at their original opacities
    const ghostMaterials = [];
    group.traverse((child) => {
        if (child.material && child.material.opacity !== undefined && child.geometry && child.geometry.type !== 'PlaneGeometry') {
            if (!ghostMaterials.includes(child.material)) {
                ghostMaterials.push(child.material);
            }
        }
    });

    // Start ghost materials at opacity 0 for fade-in
    for (const mat of ghostMaterials) {
        mat.opacity = 0;
    }

    // Border particles — detect parts near shared edge and spawn sparkle particles
    const borderParticles = buildBorderParticles(site, neighborInfo, currentCenter);
    if (borderParticles) group.add(borderParticles);

    // Guide lines — dashed lines connecting parts across the border
    const borderGuides = buildBorderGuides(site, neighborInfo, currentCenter, game);
    if (borderGuides) group.add(borderGuides);

    // Collect border-plane and marker opacities for fade-out (non-ghost materials)
    const bgMaterials = [];
    group.traverse((child) => {
        if (child.material && child.material.opacity !== undefined && !ghostMaterials.includes(child.material)) {
            bgMaterials.push({ material: child.material, origOpacity: child.material.opacity });
        }
    });

    // Pulse animation data — includes fade-in state
    group.userData = {
        siteKey: `${site.col}_${site.row}`,
        born: Date.now(),
        pulsePhase: Math.random() * Math.PI * 2,
        ownerColor: site.ownerId ? 0x44ff88 : 0x888888,
        ghostMaterials,
        bgMaterials,
        fadeInDuration: 0.8, // seconds to reach full opacity
        borderParticles: borderParticles || null,
        borderGuides: borderGuides || null
    };

    return group;
}

/**
 * Build dashed guide lines connecting parts near the shared border edge
 * between the current site and a neighbor site.
 * Shows where tracks could potentially connect across sites.
 * Returns a THREE.Group of lines, or null if no guides are possible.
 */
function buildBorderGuides(site, neighborInfo, currentCenter, game) {
    const grid = game._worldGrid;
    const currentSiteData = grid.getSite(currentCenter.col, currentCenter.row);
    if (!currentSiteData || !currentSiteData.parts || currentSiteData.parts.length === 0) return null;

    const dc = neighborInfo.col - currentCenter.col;
    const dr = neighborInfo.row - currentCenter.row;
    const halfSize = SITE_SIZE / 2;
    const isXAxis = Math.abs(dc) > Math.abs(dr);

    // Border edge position in the neighbor group's local space
    const sign = isXAxis ? (dc > 0 ? -1 : 1) : (dr > 0 ? -1 : 1);
    const edgePos = sign * halfSize;

    const perpKey = isXAxis ? 'z' : 'x';
    const GUIDE_THRESHOLD = SITE_SIZE * 0.25; // tighter threshold than particles
    const GUIDE_MATCH_RADIUS = 15; // max perpendicular distance to consider a "match"

    // Filter current site parts near border
    const currentNear = [];
    for (const part of currentSiteData.parts) {
        const coord = isXAxis ? part.x : part.z;
        if (Math.abs(coord - currentEdgePos) < GUIDE_THRESHOLD) {
            currentNear.push(part);
        }
    }
    if (currentNear.length === 0) return null;

    // Filter neighbor parts near border
    const neighborNear = [];
    for (const part of site.parts) {
        const coord = isXAxis ? part.x : part.z;
        if (Math.abs(coord - edgePos) < GUIDE_THRESHOLD) {
            neighborNear.push(part);
        }
    }
    if (neighborNear.length === 0) return null;

    // Build guide lines: for each current-site part near border, find closest neighbor part
    // along the perpendicular axis, and draw a dashed line across the border
    const guideGroup = new THREE.Group();
    guideGroup.name = 'borderGuides';

    const guideMat = new THREE.LineDashedMaterial({
        color: 0x44ddff,
        transparent: true,
        opacity: 0.25,
        dashSize: 3,
        gapSize: 2,
        depthWrite: false
    });

    for (const cp of currentNear) {
        const cpPerp = cp[perpKey] || 0;
        // Find closest neighbor part along perpendicular axis
        let bestMatch = null;
        let bestDist = Infinity;
        for (const np of neighborNear) {
            const npPerp = np[perpKey] || 0;
            const dist = Math.abs(cpPerp - npPerp);
            if (dist < bestDist && dist < GUIDE_MATCH_RADIUS) {
                bestDist = dist;
                bestMatch = np;
            }
        }

        if (bestMatch) {
            // Draw line from current part to neighbor part (in neighbor group local space)
            // Current part position relative to neighbor group: currentPos - groupOffset
            const currentLocal = {};
            if (isXAxis) {
                currentLocal.x = (cp.x || 0) - dc * SITE_SIZE; // convert from current-site-local to neighbor-local
                currentLocal.z = cpPerp;
            } else {
                currentLocal.x = cpPerp;
                currentLocal.z = (cp.z || 0) - dr * SITE_SIZE;
            }
            currentLocal.y = (cp.y || 1) + 0.5; // slightly above track level

            const neighborLocal = {};
            if (isXAxis) {
                neighborLocal.x = edgePos;
                neighborLocal.z = bestMatch[perpKey] || 0;
            } else {
                neighborLocal.x = bestMatch[perpKey] || 0;
                neighborLocal.z = edgePos;
            }
            neighborLocal.y = (bestMatch.y || 1) + 0.5;

            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(currentLocal.x, currentLocal.y, currentLocal.z),
                new THREE.Vector3(neighborLocal.x, neighborLocal.y, neighborLocal.z)
            ]);
            const line = new THREE.Line(lineGeo, guideMat.clone());
            line.computeLineDistances(); // required for dashed lines
            guideGroup.add(line);

            // Small arrow head at the midpoint pointing toward the neighbor
            const midX = (currentLocal.x + neighborLocal.x) / 2;
            const midZ = (currentLocal.z + neighborLocal.z) / 2;
            const midY = Math.max(currentLocal.y, neighborLocal.y) + 0.3;
            const arrowGeo = new THREE.ConeGeometry(0.6, 1.5, 4);
            const arrowMat = new THREE.MeshBasicMaterial({
                color: 0x44ddff,
                transparent: true,
                opacity: 0.3,
                depthWrite: false
            });
            const arrow = new THREE.Mesh(arrowGeo, arrowMat);
            arrow.position.set(midX, midY, midZ);
            // Rotate arrow to point toward neighbor
            if (isXAxis) {
                arrow.rotation.z = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
            } else {
                arrow.rotation.x = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
            }
            guideGroup.add(arrow);
        }
    }

    if (guideGroup.children.length === 0) return null;

    // Collect guide materials for fade animation
    const guideMaterials = [];
    guideGroup.traverse((child) => {
        if (child.material && child.material.opacity !== undefined) {
            guideMaterials.push(child.material);
        }
    });
    guideGroup.userData = { guideMaterials };
    return guideGroup;
}

/**
 * Build a simplified ghost mesh for a single part.
 * Uses basic shapes instead of full geometry for performance.
 */
function buildPartGhost(part) {
    const ghostMat = new THREE.MeshBasicMaterial({
        color: GHOST_COLOR,
        transparent: true,
        opacity: GHOST_OPACITY,
        depthWrite: false,
        wireframe: false
    });
    const edgeMat = new THREE.LineBasicMaterial({
        color: GHOST_COLOR,
        transparent: true,
        opacity: GHOST_BORDER_OPACITY,
        depthWrite: false
    });

    let geo = null;
    const p = part.params || {};
    const s = 0.35; // scale factor — make ghost parts smaller/subtler

    switch (part.partKey) {
        case 'platform':
        case 'speed_strip':
        case 'finish_line':
            geo = new THREE.BoxGeometry((p.width || 8) * s, 0.8, (p.length || 15) * s);
            break;
        case 'ramp':
            geo = new THREE.BoxGeometry((p.width || 8) * s, 0.8, (p.length || 15) * s);
            break;
        case 'glass_platform':
            geo = new THREE.BoxGeometry((p.width || 6) * s, 0.6, (p.length || 14) * s);
            break;
        case 'wall':
            geo = new THREE.BoxGeometry((p.width || 1) * s, 3, (p.length || 20) * s);
            break;
        case 'tunnel_walls':
            geo = new THREE.BoxGeometry(6 * s, 1.5, (p.length || 30) * s);
            break;
        case 'pendulum':
            geo = new THREE.SphereGeometry(1 * s, 6, 4);
            break;
        case 'spinner':
            geo = new THREE.BoxGeometry(6 * s, 0.2, 0.2);
            break;
        case 'hammer':
            geo = new THREE.BoxGeometry(4 * s, 1, 1);
            break;
        case 'mover':
            geo = new THREE.BoxGeometry((p.width || 3) * s, (p.height || 1) * s, (p.depth || 2) * s);
            break;
        case 'blade':
            geo = new THREE.BoxGeometry(0.1, (p.length || 2) * s, 0.06);
            break;
        case 'coin_line':
            geo = new THREE.SphereGeometry(0.15 * s, 4, 3);
            break;
        case 'checkpoint':
            geo = new THREE.CylinderGeometry(0.1, 0.1, 2 * s, 4);
            break;
        case 'finish_model':
            geo = new THREE.BoxGeometry(7 * s, 5 * s, 0.8);
            break;
        case 'loop_de_loop':
        case 'glass_loop':
            geo = new THREE.TorusGeometry((p.radius || 6) * s * 0.3, 0.3, 6, 12);
            break;
        case 'spiral_tube':
            geo = new THREE.TorusGeometry((p.radius || 6) * s * 0.25, 0.25, 6, 10);
            break;
        case 'spring_pad':
            geo = new THREE.BoxGeometry((p.width || 4) * s, 0.5, (p.length || 4) * s);
            break;
        case 'curve':
        case 'glass_curve':
            geo = new THREE.BoxGeometry(4 * s, 0.6, 4 * s);
            break;
        case 'stairs':
        case 'glass_stairs':
            geo = new THREE.BoxGeometry((p.width || 6) * s, 2 * s, 3 * s);
            break;
        case 'portal_ring':
            geo = new THREE.TorusGeometry((p.radius || 2) * s * 0.5, 0.12, 6, 12);
            break;
        case 'half_pipe':
            geo = new THREE.BoxGeometry((p.width || 10) * s, 2 * s, (p.length || 20) * s);
            break;
        case 'checkerboard':
            geo = new THREE.BoxGeometry(3 * s, 0.6, 3 * s);
            break;
        default:
            geo = new THREE.BoxGeometry(1, 0.6, 1);
    }

    if (!geo) return null;

    const mesh = new THREE.Mesh(geo, ghostMat);
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, edgeMat);

    const container = new THREE.Group();
    container.add(mesh);
    container.add(line);

    return container;
}

/**
 * Build floating sparkle particles along the shared border edge
 * where the neighbor site has track parts near the boundary.
 * Returns a THREE.Points object, or null if no parts are near the border.
 */
function buildBorderParticles(site, neighborInfo, currentCenter) {
    // Determine which axis the neighbor is on
    const dc = neighborInfo.col - currentCenter.col;
    const dr = neighborInfo.row - currentCenter.row;

    // Border edge is at ±SITE_SIZE/2 in the neighbor group's local space
    const halfSize = SITE_SIZE / 2;
    const isXAxis = Math.abs(dc) > Math.abs(dr);
    const sign = isXAxis ? (dc > 0 ? -1 : 1) : (dr > 0 ? -1 : 1);
    const edgePos = sign * halfSize; // local-space position of the shared border

    // Filter parts near the border edge
    const nearParts = [];
    for (const part of site.parts) {
        const coord = isXAxis ? part.x : part.z;
        const dist = Math.abs(coord - edgePos);
        if (dist < BORDER_THRESHOLD) {
            nearParts.push(part);
        }
    }
    if (nearParts.length === 0) return null;

    // Connection strength: 0 = weak (few parts), 1 = strong (many parts)
    const strength = Math.min(1, nearParts.length / BORDER_STRENGTH_PARTS);

    // Scale particle count by connection strength
    const count = Math.round(BORDER_PARTICLE_MIN_COUNT + strength * (BORDER_PARTICLE_MAX_COUNT - BORDER_PARTICLE_MIN_COUNT));

    // Interpolate color from cyan (weak) to gold (strong)
    const particleColor = BORDER_COLOR_WEAK.clone().lerp(BORDER_COLOR_STRONG, strength);

    // Particle size scales with strength (subtle visual reinforcement)
    const particleSize = 0.2 + strength * 0.15; // 0.2 (weak) to 0.35 (strong)

    // Compute the span of parts along the border (for particle spread)
    const perpKey = isXAxis ? 'z' : 'x';
    let minPerp = Infinity, maxPerp = -Infinity;
    for (const part of nearParts) {
        const v = part[perpKey] || 0;
        if (v < minPerp) minPerp = v;
        if (v > maxPerp) maxPerp = v;
    }
    // Ensure minimum spread
    if (maxPerp - minPerp < 4) {
        const mid = (maxPerp + minPerp) / 2;
        minPerp = mid - 2;
        maxPerp = mid + 2;
    }

    // Create particle positions along the border line
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
        const t = i / count;
        const spread = minPerp + t * (maxPerp - minPerp);
        if (isXAxis) {
            positions[i * 3]     = edgePos;
            positions[i * 3 + 1] = Math.random() * 6;
            positions[i * 3 + 2] = spread + (Math.random() - 0.5) * 3;
        } else {
            positions[i * 3]     = spread + (Math.random() - 0.5) * 3;
            positions[i * 3 + 1] = Math.random() * 6;
            positions[i * 3 + 2] = edgePos;
        }
        velocities.push({
            phase: Math.random() * Math.PI * 2,
            speed: 0.7 + Math.random() * 0.6
        });
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        color: particleColor,
        size: particleSize,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });
    const points = new THREE.Points(geom, mat);
    points.frustumCulled = false;
    points.userData = { velocities, born: Date.now(), strength };
    return points;
}

/**
 * Remove meshes for a neighbor site and dispose resources.
 */
function removeNeighborSiteMeshes(entry) {
    if (!entry || !entry.group) return;
    entry.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });
    if (entry.group.parent) {
        entry.group.parent.remove(entry.group);
    }
}

/**
 * Animate neighbor previews — subtle pulse effect.
 */
export function animateNeighborPreview(game, dt) {
    if (!game._neighborPreviewGroup || !game._neighborPreviewVisible) return;

    const now = Date.now();
    for (const key of Object.keys(game._neighborPreviewSites)) {
        const entry = game._neighborPreviewSites[key];
        if (!entry || !entry.group) continue;

        const ud = entry.group.userData;
        if (ud && ud.pulsePhase !== undefined) {
            // Fade-in: lerp from 0 to target over fadeInDuration seconds
            const age = (now - ud.born) / 1000;
            const fadeIn = Math.min(1, age / (ud.fadeInDuration || 0.8));
            let ease = fadeIn * fadeIn * (3 - 2 * fadeIn); // smoothstep

            // Fade-out: exponential ease-in over 0.6s — holds opacity then dissolves rapidly
            let fadeOut = 1;
            if (entry.fadeOutStart) {
                const t = Math.min(1, (now - entry.fadeOutStart) / 600);
                fadeOut = (1 - t) * (1 - t) * (1 - t) * (1 - t); // quartic ease-in
            }

            // Subtle opacity pulse — use cached material refs for performance
            const basePulse = 0.12 + Math.sin(now * 0.001 + ud.pulsePhase) * 0.06;
            if (ud.ghostMaterials) {
                for (const mat of ud.ghostMaterials) {
                    mat.opacity = basePulse * ease * fadeOut;
                }
            }
            // Fade border plane, marker, and other non-ghost materials
            if (ud.bgMaterials && fadeOut < 1) {
                for (const bg of ud.bgMaterials) {
                    bg.material.opacity = bg.origOpacity * fadeOut;
                }
            }        // Animate guide lines — pulse with ghost materials
        if (ud.borderGuides && ud.borderGuides.userData.guideMaterials) {
            const guidePulse = 0.18 + Math.sin(now * 0.0015 + ud.pulsePhase + 1.0) * 0.07;
            for (const mat of ud.borderGuides.userData.guideMaterials) {
                mat.opacity = guidePulse * ease * fadeOut;
            }
        }

        // Skip particle animation for fully faded-out sites
        if (fadeOut <= 0) continue;
    }

        // Animate border particles — upward drift with fade-in
        if (ud.borderParticles && ud.borderParticles.geometry) {
            const pts = ud.borderParticles;
            const pUd = pts.userData;
            const positions = pts.geometry.attributes.position.array;
            const vels = pUd.velocities;
            const ptAge = (now - pUd.born) / 1000;
            const ptFade = Math.min(1, ptAge / 1.2); // fade-in over 1.2s

            for (let i = 0; i < vels.length; i++) {
                const idx = i * 3 + 1; // Y component
                positions[idx] += vels[i].speed * BORDER_PARTICLE_SPEED * dt;
                // Loop back when particle drifts too high
                if (positions[idx] > 8) {
                    positions[idx] = 0;
                }
            }
            pts.geometry.attributes.position.needsUpdate = true;
            // Pulse opacity with fade-in and fade-out — stronger connections pulse brighter
            const strength = pUd.strength || 0;
            const baseAmp = 0.15 + strength * 0.15; // 0.15 (weak) to 0.30 (strong)
            const fadeOutFactor = entry.fadeOutStart ? Math.max(0, 1 - Math.min(1, (now - entry.fadeOutStart) / 600)) : 1;
            pts.material.opacity = (baseAmp + Math.sin(now * 0.002 + ud.pulsePhase) * (0.08 + strength * 0.07)) * ptFade * fadeOutFactor;

            // Proximity-based sparkle sound — play when ball is near this border edge
            if (!game._sparkleSoundCooldown || now - game._sparkleSoundCooldown > 300) {
                const ballPos = game.ballBody && game.ballBody.position;
                if (ballPos) {
                    // Border is halfway between origin (0,0) and group position
                    const groupPos = entry.group.position;
                    const borderX = groupPos.x / 2;
                    const borderZ = groupPos.z / 2;
                    const borderDist = Math.sqrt(
                        (ballPos.x - borderX) ** 2 +
                        (ballPos.z - borderZ) ** 2
                    );
                    const SPARKLE_RANGE = SITE_SIZE * 0.4; // play within ~48 units of border
                    if (borderDist < SPARKLE_RANGE && ptFade > 0.3) {
                        const vol = (1 - borderDist / SPARKLE_RANGE) * strength * ptFade;
                        if (vol > 0.01) {
                            playBorderSparkle(game, vol);
                            game._sparkleSoundCooldown = now;
                        }
                    }
                }
            }
        }
    }
}

/**
 * Play a subtle procedural sparkle chime via Web Audio API.
 * @param {object} game - Game instance (needs _audioCtx)
 * @param {number} volume - 0..1
 */
function playBorderSparkle(game, volume) {
    try {
        const ctx = game._audioCtx;
        if (!ctx || volume < 0.01) return;
        const now = ctx.currentTime;

        // Short sine burst with randomized pitch for sparkle character
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1800 + Math.random() * 1200, now);
        osc.frequency.exponentialRampToValueAtTime(800 + Math.random() * 400, now + 0.15);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume * 0.08, now + 0.01); // very quiet
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
    } catch (e) { /* non-fatal */ }
}

/**
 * Toggle neighbor preview visibility.
 */
export function toggleNeighborPreview(game) {
    if (!game._neighborPreviewGroup) return;
    game._neighborPreviewVisible = !game._neighborPreviewVisible;
    game._neighborPreviewGroup.visible = game._neighborPreviewVisible;
    return game._neighborPreviewVisible;
}

/**
 * Mark neighbor preview as needing rebuild (call when world data changes).
 */
export function markNeighborPreviewDirty(game) {
    game._neighborPreviewDirty = true;
}

/**
 * Dispose all neighbor preview resources.
 */
export function disposeNeighborPreview(game) {
    if (!game._neighborPreviewGroup) return;

    for (const key of Object.keys(game._neighborPreviewSites)) {
        removeNeighborSiteMeshes(game._neighborPreviewSites[key]);
    }
    game._neighborPreviewSites = {};

    game.scene.remove(game._neighborPreviewGroup);
    game._neighborPreviewGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });
    game._neighborPreviewGroup = null;
    game._neighborPreviewVisible = false;
}
