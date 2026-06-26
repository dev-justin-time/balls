/**
 * =====================================================================
 * @domain:    world
 * @concern:   Zoning system — zone types, rules, grid, and development plan
 * @created:   2026-06-26T00:00:00.000Z
 * @track:     4f7a2c91-8d3e-4b12-a6f5-9e8c3d1b7a42
 * @version:   1.0.0
 * @security:  Client-Side (zone rules enforced server-side via world_networking)
 * =====================================================================
 *
 * World Zoning System.
 * Divides the infinite world grid into named zones — each with distinct rules
 * for claiming, building, trading, and visibility. Zones are contiguous
 * rectangular regions on the grid, assigned at world-generation time.
 *
 * ## MASTER DEVELOPMENT PLAN
 *
 * The world is organized into concentric rings radiating from the Origin
 * Spawn Hub (0,0). Each ring represents a development phase:
 *
 *   PHASE 1 — ORIGIN SPAWN (radius 3, zone: HUB)
 *     Public hub with pre-built showcase tracks, tutorial portals, and
 *     the central marketplace. No private claims allowed. Admin-curated.
 *
 *   PHASE 2 — STARTER RING (radius 4-8, zone: RESIDENTIAL_ALPHA)
 *     First ring of claimable sites for new players. Low claim cost (10 coins).
 *     Max 3 sites per player. Build height limited to 40 units.
 *
 *   PHASE 3 — SUBURBAN RING (radius 9-15, zone: RESIDENTIAL_BETA)
 *     Mid-tier residential. Claim cost 50 coins. Max 5 sites per player.
 *     Full build height (80 units). Marketplace listing enabled.
 *
 *   PHASE 4 — COMMERCIAL CORRIDOR (radius 16-20, zone: COMMERCIAL)
 *     High-traffic zones flanking major transit paths. Claim cost 200 coins.
 *     Sites auto-listed on marketplace after 7 days of inactivity.
 *     Premium terrain presets unlocked.
 *
 *   PHASE 5 — INDUSTRIAL SECTOR (radius 21-28, zone: INDUSTRIAL)
 *     Workshop integration zone. Users can deploy 3D model workshops.
 *     Shared asset libraries. Higher part count limit (1000 parts/site).
 *
 *   PHASE 6 — RECREATIONAL PARK (radius 29-35, zone: RECREATIONAL)
 *     Public racing arenas. No claiming — sites are community-built.
 *     Voting system for track of the week. Leaderboards.
 *
 *   PHASE 7 — FRONTIER (radius 36+, zone: DEVELOPMENT)
 *     Unzoned expansion territory. First-come first-served claiming.
 *     Experimental terrain types. Future content drops.
 *
 *   ADMIN ZONE — Scattered admin-protected areas for featured content,
 *     seasonal events, and moderation tools. Not player-claimable.
 */

import { SITE_SIZE } from './world_state.js';

// ---------------------------------------------------------------------------
// Zone Type Definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ZoneDefinition
 * @property {string} id - Unique zone identifier
 * @property {string} name - Human-readable zone name
 * @property {string} icon - Emoji icon
 * @property {string} color - Hex color for map rendering
 * @property {number} borderColor - Hex border color
 * @property {number} claimCost - Coins required to claim a site (0 = free, -1 = unclaimable)
 * @property {number} maxSitesPerPlayer - Max sites a player can own in this zone (-1 = unlimited)
 * @property {number} maxPartsPerSite - Part count limit per site
 * @property {number} buildHeightLimit - Vertical build limit in world units
 * @property {boolean} canSell - Whether sites can be listed on marketplace
 * @property {boolean} canBuild - Whether building/editing is allowed
 * @property {boolean} canClaim - Whether new claims are accepted
 * @property {boolean} isPublic - Whether the zone appears on the public map
 * @property {string[]} allowedTerrains - Terrain presets available in this zone
 * @property {string[]} allowedSkyTypes - Sky types available in this zone
 * @property {number} inactivityListDays - Days of inactivity before auto-listing (-1 = never)
 * @property {string} description - Short description for tooltips
 */

/** @type {Object<string, ZoneDefinition>} */
export const ZONE_TYPES = {
    HUB: {
        id: 'HUB',
        name: 'Origin Hub',
        icon: '🏛️',
        color: '#ffd700',
        borderColor: 0xffd700,
        claimCost: -1,          // Unclaimable
        maxSitesPerPlayer: 0,
        maxPartsPerSite: 0,
        buildHeightLimit: 0,
        canSell: false,
        canBuild: false,
        canClaim: false,
        isPublic: true,
        allowedTerrains: ['sky_high'],
        allowedSkyTypes: ['day'],
        inactivityListDays: -1,
        description: 'Public hub with pre-built showcase tracks. Admin-curated.'
    },
    RESIDENTIAL_ALPHA: {
        id: 'RESIDENTIAL_ALPHA',
        name: 'Starter Ring',
        icon: '🏡',
        color: '#44ff88',
        borderColor: 0x44ff88,
        claimCost: 10,
        maxSitesPerPlayer: 3,
        maxPartsPerSite: 300,
        buildHeightLimit: 40,
        canSell: true,
        canBuild: true,
        canClaim: true,
        isPublic: true,
        allowedTerrains: ['sky_high', 'sky_low', 'forest'],
        allowedSkyTypes: ['day', 'sunset', 'night'],
        inactivityListDays: 30,
        description: 'First ring of claimable sites for new builders. Low claim cost.'
    },
    RESIDENTIAL_BETA: {
        id: 'RESIDENTIAL_BETA',
        name: 'Suburban Ring',
        icon: '🏘️',
        color: '#44aaff',
        borderColor: 0x44aaff,
        claimCost: 50,
        maxSitesPerPlayer: 5,
        maxPartsPerSite: 500,
        buildHeightLimit: 80,
        canSell: true,
        canBuild: true,
        canClaim: true,
        isPublic: true,
        allowedTerrains: ['sky_high', 'sky_low', 'forest', 'canyon', 'ocean'],
        allowedSkyTypes: ['day', 'sunset', 'night', 'storm'],
        inactivityListDays: 21,
        description: 'Mid-tier residential. Full build height. Marketplace enabled.'
    },
    COMMERCIAL: {
        id: 'COMMERCIAL',
        name: 'Commercial Corridor',
        icon: '🏪',
        color: '#ffcc00',
        borderColor: 0xffcc00,
        claimCost: 200,
        maxSitesPerPlayer: 3,
        maxPartsPerSite: 500,
        buildHeightLimit: 80,
        canSell: true,
        canBuild: true,
        canClaim: true,
        isPublic: true,
        allowedTerrains: ['sky_high', 'sky_low', 'canyon', 'ocean', 'neon', 'crystal'],
        allowedSkyTypes: ['day', 'sunset', 'night', 'storm', 'void', 'neon'],
        inactivityListDays: 7,
        description: 'High-traffic zone. Premium terrain. Auto-listed after 7 days inactive.'
    },
    INDUSTRIAL: {
        id: 'INDUSTRIAL',
        name: 'Industrial Sector',
        icon: '🏭',
        color: '#ff8844',
        borderColor: 0xff8844,
        claimCost: 100,
        maxSitesPerPlayer: 2,
        maxPartsPerSite: 1000,
        buildHeightLimit: 80,
        canSell: true,
        canBuild: true,
        canClaim: true,
        isPublic: true,
        allowedTerrains: ['sky_high', 'volcanic', 'crystal', 'storm'],
        allowedSkyTypes: ['day', 'sunset', 'night', 'void', 'inferno'],
        inactivityListDays: 14,
        description: 'Workshop zone. Higher part limits. Shared asset libraries.'
    },
    RECREATIONAL: {
        id: 'RECREATIONAL',
        name: 'Recreational Park',
        icon: '🎮',
        color: '#ff44aa',
        borderColor: 0xff44aa,
        claimCost: -1,          // Community-built, not individually claimed
        maxSitesPerPlayer: 0,
        maxPartsPerSite: 800,
        buildHeightLimit: 80,
        canSell: false,
        canBuild: true,         // Community can contribute
        canClaim: false,
        isPublic: true,
        allowedTerrains: ['sky_high', 'sky_low', 'ocean', 'forest', 'neon'],
        allowedSkyTypes: ['day', 'sunset', 'night', 'storm', 'voidstorm'],
        inactivityListDays: -1,
        description: 'Public racing arenas. Community-built. Leaderboards.'
    },
    DEVELOPMENT: {
        id: 'DEVELOPMENT',
        name: 'Frontier',
        icon: '🚧',
        color: '#aa88ff',
        borderColor: 0xaa88ff,
        claimCost: 0,           // Free — first come, first served
        maxSitesPerPlayer: 1,
        maxPartsPerSite: 200,
        buildHeightLimit: 40,
        canSell: false,
        canBuild: true,
        canClaim: true,
        isPublic: true,
        allowedTerrains: ['sky_high', 'sky_low'],
        allowedSkyTypes: ['day'],
        inactivityListDays: -1,
        description: 'Expansion frontier. Experimental terrain. Future content.'
    },
    ADMIN: {
        id: 'ADMIN',
        name: 'Admin Reserve',
        icon: '🛡️',
        color: '#ff4444',
        borderColor: 0xff4444,
        claimCost: -1,
        maxSitesPerPlayer: 0,
        maxPartsPerSite: 0,
        buildHeightLimit: 0,
        canSell: false,
        canBuild: false,
        canClaim: false,
        isPublic: false,
        allowedTerrains: [],
        allowedSkyTypes: [],
        inactivityListDays: -1,
        description: 'Admin-protected area. Seasonal events and moderation.'
    }
};

// ---------------------------------------------------------------------------
// Zone Grid — maps (col, row) coordinates to zone types
// ---------------------------------------------------------------------------

/**
 * Compute the zone type for a given grid coordinate.
 * Uses a concentric-ring model radiating from origin (0,0).
 *
 * @param {number} col - Grid column
 * @param {number} row - Grid row
 * @returns {string} Zone type ID
 */
export function computeZone(col, row) {
    // Calculate Chebyshev distance from origin (square rings)
    const dist = Math.max(Math.abs(col), Math.abs(row));

    if (dist <= 3)   return 'HUB';
    if (dist <= 8)   return 'RESIDENTIAL_ALPHA';
    if (dist <= 15)  return 'RESIDENTIAL_BETA';
    if (dist <= 20)  return 'COMMERCIAL';
    if (dist <= 28)  return 'INDUSTRIAL';
    if (dist <= 35)  return 'RECREATIONAL';

    // Frontier — everything beyond ring 35
    return 'DEVELOPMENT';
}

/**
 * Check if a coordinate falls within a named corridor or special region.
 * Admin zones and seasonal event areas override the concentric ring model.
 *
 * @param {number} col
 * @param {number} row
 * @returns {string|null} Override zone ID, or null if no override
 */
export function getZoneOverride(col, row) {
    // Admin spawn point protection — origin and immediate neighbors
    if (col === 0 && row === 0) return 'HUB';

    // Seasonal event areas (example — expanded dynamically)
    // Halloween Corridor: every October, rows -10 to -8 become special
    // Christmas Village: every December, cols 5-8, rows 5-8
    // These overrides would be injected by the server during events

    // Diagonal admin corridors for main transit paths
    // NE-SW corridor: maintenance access
    if (col === row && Math.abs(col) <= 30 && Math.abs(col) >= 22 && Math.abs(col) <= 25) {
        return null; // Reserved for future transit corridor
    }

    return null; // No override
}

/**
 * Get the full zone definition for a grid coordinate.
 *
 * @param {number} col
 * @param {number} row
 * @returns {ZoneDefinition}
 */
export function getZoneForSite(col, row) {
    const override = getZoneOverride(col, row);
    const zoneId = override || computeZone(col, row);
    return ZONE_TYPES[zoneId] || ZONE_TYPES.DEVELOPMENT;
}

/**
 * Get all sites within a given zone type in a rectangular region.
 *
 * @param {number} minCol
 * @param {number} maxCol
 * @param {number} minRow
 * @param {number} maxRow
 * @returns {object[]} Array of { col, row, zone }
 */
export function getSitesInZone(zoneId, minCol, maxCol, minRow, maxRow) {
    const results = [];
    for (let c = minCol; c <= maxCol; c++) {
        for (let r = minRow; r <= maxRow; r++) {
            const zone = computeZone(c, r);
            const override = getZoneOverride(c, r);
            const effectiveZone = override || zone;
            if (effectiveZone === zoneId) {
                results.push({ col: c, row: r, zone: effectiveZone });
            }
        }
    }
    return results;
}

/**
 * Get zone statistics for a region.
 *
 * @param {import('./world_state.js').WorldGrid} grid
 * @param {number} minCol
 * @param {number} maxCol
 * @param {number} minRow
 * @param {number} maxRow
 * @returns {Object<string, {total: number, claimed: number, listed: number}>}
 */
export function getZoneStats(grid, minCol, maxCol, minRow, maxRow) {
    /** @type {Object<string, {total: number, claimed: number, listed: number}>} */
    const stats = {};
    for (const zoneId of Object.keys(ZONE_TYPES)) {
        stats[zoneId] = { total: 0, claimed: 0, listed: 0 };
    }

    for (let c = minCol; c <= maxCol; c++) {
        for (let r = minRow; r <= maxRow; r++) {
            const zone = computeZone(c, r);
            const override = getZoneOverride(c, r);
            const effectiveZone = override || zone;

            if (stats[effectiveZone]) {
                stats[effectiveZone].total++;
            }

            const site = grid ? grid.getSite(c, r) : null;
            if (site && stats[effectiveZone]) {
                if (site.ownerId) stats[effectiveZone].claimed++;
                if (site.listed) stats[effectiveZone].listed++;
            }
        }
    }
    return stats;
}

// ---------------------------------------------------------------------------
// Claim Validation
// ---------------------------------------------------------------------------

/**
 * Check if a player can claim a site at the given coordinates.
 * Returns { allowed: boolean, reason: string, cost: number }.
 *
 * @param {import('./world_state.js').WorldGrid} grid
 * @param {string} playerId
 * @param {number} col
 * @param {number} row
 * @param {number} playerCoins - Player's current coin balance
 * @param {number} [activePlayerCount=0] - Current online player count for phase gating
 * @returns {{ allowed: boolean, reason: string, cost: number }}
 */
export function canClaimSite(grid, playerId, col, row, playerCoins, activePlayerCount = 0) {
    const zone = getZoneForSite(col, row);

    // Check development phase gating
    if (!isZoneActive(zone.id, activePlayerCount)) {
        const phase = getCurrentPhase(activePlayerCount);
        return { allowed: false, reason: `${zone.name} is not yet unlocked (Phase ${phase.phase}).`, cost: 0 };
    }

    // Check if zone allows claiming
    if (!zone.canClaim) {
        return { allowed: false, reason: `${zone.name} sites cannot be claimed.`, cost: 0 };
    }

    // Check if site is already claimed
    const existing = grid.getSite(col, row);
    if (existing && existing.ownerId) {
        return { allowed: false, reason: 'This site is already owned.', cost: 0 };
    }

    // Check if player has reached their max for this zone
    if (zone.maxSitesPerPlayer > 0) {
        const owned = grid.countOwnedSites(playerId);
        const ownedInZone = countPlayerSitesInZone(grid, playerId, zone.id);
        if (ownedInZone >= zone.maxSitesPerPlayer) {
            return {
                allowed: false,
                reason: `You've reached the max of ${zone.maxSitesPerPlayer} sites in ${zone.name}.`,
                cost: 0
            };
        }
    }

    // Check coin balance
    if (zone.claimCost > 0 && playerCoins < zone.claimCost) {
        return {
            allowed: false,
            reason: `Claiming costs ${zone.claimCost} coins. You have ${playerCoins}.`,
            cost: zone.claimCost
        };
    }

    return {
        allowed: true,
        reason: '',
        cost: Math.max(0, zone.claimCost)
    };
}

/**
 * Count how many sites a player owns within a specific zone.
 *
 * @param {import('./world_state.js').WorldGrid} grid
 * @param {string} playerId
 * @param {string} zoneId
 * @returns {number}
 */
function countPlayerSitesInZone(grid, playerId, zoneId) {
    let count = 0;
    for (const site of grid.sites.values()) {
        if (site.ownerId !== playerId) continue;
        const siteZone = computeZone(site.col, site.row);
        const override = getZoneOverride(site.col, site.row);
        if ((override || siteZone) === zoneId) count++;
    }
    return count;
}

/**
 * Check build permissions for a site.
 *
 * @param {import('./world_state.js').WorldGrid} grid
 * @param {string} playerId
 * @param {number} col
 * @param {number} row
 * @returns {{ allowed: boolean, reason: string, zone: ZoneDefinition }}
 */
export function canBuildAtSite(grid, playerId, col, row) {
    const zone = getZoneForSite(col, row);
    const site = grid.getSite(col, row);

    // Admin can always build
    // [AI NOTE: Retained for context stability — admin check placeholder]
    // if (playerId === 'admin') return { allowed: true, reason: '', zone };

    if (!zone.canBuild) {
        return { allowed: false, reason: `Building is not allowed in ${zone.name}.`, zone };
    }

    // Recreational zones: community can build on unclaimed sites
    if (zone.id === 'RECREATIONAL') {
        if (!site || !site.ownerId) {
            return { allowed: true, reason: '', zone };
        }
    }

    // Must own the site
    if (!site || site.ownerId !== playerId) {
        return { allowed: false, reason: 'You must own this site to build.', zone };
    }

    return { allowed: true, reason: '', zone };
}

/**
 * Check if a site can be listed on the marketplace.
 *
 * @param {import('./world_state.js').WorldGrid} grid
 * @param {string} playerId
 * @param {number} col
 * @param {number} row
 * @returns {{ allowed: boolean, reason: string }}
 */
export function canSellSite(grid, playerId, col, row) {
    const zone = getZoneForSite(col, row);
    const site = grid.getSite(col, row);

    if (!zone.canSell) {
        return { allowed: false, reason: `Selling is not allowed in ${zone.name}.` };
    }

    if (!site || site.ownerId !== playerId) {
        return { allowed: false, reason: 'You must own this site to sell it.' };
    }

    return { allowed: true, reason: '' };
}

// ---------------------------------------------------------------------------
// Master Development Plan Data
// ---------------------------------------------------------------------------

/**
 * Phase definitions for the master development plan.
 * Each phase specifies which zones activate and when.
 *
 * @typedef {object} DevelopmentPhase
 * @property {number} phase - Phase number
 * @property {string} name - Phase name
 * @property {string[]} activeZones - Zone IDs active in this phase
 * @property {number} minPlayerCount - Minimum players needed to unlock
 * @property {string} description
 */

/** @type {DevelopmentPhase[]} */
export const DEVELOPMENT_PHASES = [
    {
        phase: 1,
        name: 'Origin Launch',
        activeZones: ['HUB', 'RESIDENTIAL_ALPHA'],
        minPlayerCount: 0,
        description: 'Central hub and first residential ring open. Tutorial tracks and basic claiming active.'
    },
    {
        phase: 2,
        name: 'Suburban Expansion',
        activeZones: ['HUB', 'RESIDENTIAL_ALPHA', 'RESIDENTIAL_BETA'],
        minPlayerCount: 50,
        description: 'Suburban ring unlocks. Marketplace trading enabled. More terrain types available.'
    },
    {
        phase: 3,
        name: 'Commercial Boom',
        activeZones: ['HUB', 'RESIDENTIAL_ALPHA', 'RESIDENTIAL_BETA', 'COMMERCIAL'],
        minPlayerCount: 200,
        description: 'Commercial corridor opens. Premium terrain. Auto-listing for inactive sites.'
    },
    {
        phase: 4,
        name: 'Industrial Revolution',
        activeZones: ['HUB', 'RESIDENTIAL_ALPHA', 'RESIDENTIAL_BETA', 'COMMERCIAL', 'INDUSTRIAL'],
        minPlayerCount: 500,
        description: 'Workshop integration. Higher part limits. Shared asset libraries.'
    },
    {
        phase: 5,
        name: 'Recreational Boom',
        activeZones: ['HUB', 'RESIDENTIAL_ALPHA', 'RESIDENTIAL_BETA', 'COMMERCIAL', 'INDUSTRIAL', 'RECREATIONAL'],
        minPlayerCount: 1000,
        description: 'Public racing arenas. Community voting. Leaderboards.'
    },
    {
        phase: 6,
        name: 'Frontier Opening',
        activeZones: ['HUB', 'RESIDENTIAL_ALPHA', 'RESIDENTIAL_BETA', 'COMMERCIAL', 'INDUSTRIAL', 'RECREATIONAL', 'DEVELOPMENT'],
        minPlayerCount: 2500,
        description: 'Expansion frontier opens. Experimental terrain. Future content drops.'
    }
];

/**
 * Get the current development phase based on active player count.
 *
 * @param {number} activePlayerCount
 * @returns {DevelopmentPhase}
 */
export function getCurrentPhase(activePlayerCount) {
    let current = DEVELOPMENT_PHASES[0];
    for (const phase of DEVELOPMENT_PHASES) {
        if (activePlayerCount >= phase.minPlayerCount) {
            current = phase;
        }
    }
    return current;
}

/**
 * Check if a zone is currently active (unlocked) based on player count.
 *
 * @param {string} zoneId
 * @param {number} activePlayerCount
 * @returns {boolean}
 */
export function isZoneActive(zoneId, activePlayerCount) {
    const phase = getCurrentPhase(activePlayerCount);
    return phase.activeZones.includes(zoneId);
}

// ---------------------------------------------------------------------------
// Zone Color Helpers for UI
// ---------------------------------------------------------------------------

/**
 * Get an RGBA CSS color for a zone (used in map tile overlays).
 *
 * @param {string} zoneId
 * @param {number} alpha
 * @returns {string} CSS rgba() string
 */
export function getZoneCSSColor(zoneId, alpha = 0.3) {
    const zone = ZONE_TYPES[zoneId];
    if (!zone) return `rgba(100, 100, 100, ${alpha})`;

    const hex = zone.color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get zone badge HTML for site detail panels.
 *
 * @param {string} zoneId
 * @returns {string} HTML string
 */
export function getZoneBadgeHTML(zoneId) {
    const zone = ZONE_TYPES[zoneId];
    if (!zone) return '';
    return `<span style="
        display:inline-block;padding:2px 8px;border-radius:10px;
        background:${zone.color}22;border:1px solid ${zone.color}44;
        color:${zone.color};font-size:9px;font-weight:700;
    ">${zone.icon} ${zone.name}</span>`;
}
