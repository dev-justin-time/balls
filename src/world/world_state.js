/*
 World Grid State.
 Manages the infinite tiled world of "sites" — each site is a build area
 where a user constructs a marble stunt race track. Sites tile seamlessly,
 with neighboring borders overlapping so tracks can connect across sites.

 Coordinate system:
   Sites are addressed by (col, row) integers.
   Each site occupies SITE_SIZE × SITE_SIZE world units in the XZ plane.
   The origin site is (0, 0).
   Site world-space center = (col * SITE_SIZE, 0, row * SITE_SIZE).
*/

// --- Constants ---
export const SITE_SIZE = 120;       // world units per site side
export const BORDER_OVERLAP = 10;   // shared border zone where tracks connect
export const MAX_SITE_PARTS = 500;  // hard cap per site
export const SITE_HEIGHT = 80;      // vertical space above the ground plane

// --- Terrain presets ---
export const TERRAIN_PRESETS = {
    sky_high:   { name: 'Sky Platform',   color: 0x87ceeb, fogColor: 0x87ceeb, groundY: 0, description: 'Floating high above the clouds.' },
    sky_low:    { name: 'Low Clouds',     color: 0xddeeff, fogColor: 0xddeeff, groundY: -20, description: 'Nestled among drifting clouds.' },
    canyon:     { name: 'Red Canyon',     color: 0xcc4422, fogColor: 0x331100, groundY: -40, description: 'Deep red rock canyon walls.' },
    ocean:      { name: 'Ocean Surface',  color: 0x1155aa, fogColor: 0x113366, groundY: -30, description: 'Tracks above shimmering water.' },
    space:      { name: 'Deep Space',     color: 0x000011, fogColor: 0x000005, groundY: 10, description: 'Zero-gravity void with distant stars.' },
    volcanic:   { name: 'Volcanic Peaks', color: 0x220000, fogColor: 0x440000, groundY: -15, description: 'Active volcanoes and lava flows.' },
    forest:     { name: 'Canopy Run',     color: 0x1a4a1a, fogColor: 0x0a2a0a, groundY: -25, description: 'Winding through giant trees.' },
    crystal:    { name: 'Crystal Caves',  color: 0x4422aa, fogColor: 0x220055, groundY: -10, description: 'Glowing crystal formations.' },
    storm:      { name: 'Storm Realm',    color: 0x1a1a3a, fogColor: 0x0a0a1a, groundY: 5, description: 'Perpetual lightning and thunder.' },
    neon:       { name: 'Neon City',      color: 0x110022, fogColor: 0x0a0015, groundY: 0, description: 'Cyberpunk cityscape with glowing tracks.' }
};

// --- Sky type reuse (from game skyConfigs) ---
export const WORLD_SKY_TYPES = ['day', 'sunset', 'night', 'void', 'storm', 'inferno', 'frost', 'voidstorm'];

/**
 * Create a new site record for a given grid coordinate.
 */
export function createSite(col, row, ownerId) {
    return {
        id: `${col}_${row}`,
        col,
        row,
        ownerId: ownerId || null,
        ownerName: null,
        terrain: 'sky_high',
        skyType: 'day',
        parts: [],
        partCount: 0,
        createdAt: Date.now(),
        lastEdited: null,
        connectedBorders: [],  // 'front'|'back'|'left'|'right' — which borders have tracks extending to the edge
        isPublic: true,        // visible on the world map
        listed: false,         // listed on marketplace
        listPrice: 0
    };
}

/**
 * Convert grid coordinates to world-space center position.
 */
export function siteToWorld(col, row) {
    return {
        x: col * SITE_SIZE,
        y: 0,
        z: row * SITE_SIZE
    };
}

/**
 * Convert world-space position to the grid site coordinates that contain it.
 */
export function worldToSite(wx, wz) {
    return {
        col: Math.floor(wx / SITE_SIZE + 0.5),
        row: Math.floor(wz / SITE_SIZE + 0.5)
    };
}

/**
 * Get the 4 neighboring site coordinates (up/down/left/right on the grid).
 */
export function getNeighborCoords(col, row) {
    return [
        { col: col,     row: row - 1, dir: 'front' },
        { col: col,     row: row + 1, dir: 'back'  },
        { col: col - 1, row: row,     dir: 'left'  },
        { col: col + 1, row: row,     dir: 'right' }
    ];
}

/**
 * Get the world-space bounding box for a site.
 * Returns { minX, maxX, minZ, maxZ } — useful for viewport culling.
 */
export function siteBounds(col, row) {
    const cx = col * SITE_SIZE;
    const cz = row * SITE_SIZE;
    const half = SITE_SIZE / 2;
    return {
        minX: cx - half,
        maxX: cx + half,
        minZ: cz - half,
        maxZ: cz + half,
        centerX: cx,
        centerZ: cz
    };
}

/**
 * Check if two site coordinates are adjacent (share a border).
 */
export function areNeighbors(col1, row1, col2, row2) {
    const dc = Math.abs(col1 - col2);
    const dr = Math.abs(row1 - row2);
    return (dc + dr === 1); // Manhattan distance of 1
}

/**
 * Calculate the border overlap zone for two adjacent sites.
 * Returns the world-space rectangle where tracks from both sites can coexist.
 */
export function borderOverlapZone(col1, row1, col2, row2) {
    if (!areNeighbors(col1, row1, col2, row2)) return null;

    const b1 = siteBounds(col1, row1);
    const b2 = siteBounds(col2, row2);

    // Overlap is the intersection of the two bounding boxes
    // For adjacent sites, the overlap is along one axis only
    const overlapMinX = Math.max(b1.minX, b2.minX);
    const overlapMaxX = Math.min(b1.maxX, b2.maxX);
    const overlapMinZ = Math.max(b1.minZ, b2.minZ);
    const overlapMaxZ = Math.min(b1.maxZ, b2.maxZ);

    // Extend overlap by BORDER_OVERLAP into each site
    let minX = overlapMinX;
    let maxX = overlapMaxX;
    let minZ = overlapMinZ;
    let maxZ = overlapMaxZ;

    if (overlapMinX === overlapMaxX) {
        // Vertical border (left/right neighbors)
        minX = overlapMinX - BORDER_OVERLAP;
        maxX = overlapMaxX + BORDER_OVERLAP;
    } else {
        // Horizontal border (front/back neighbors)
        minZ = overlapMinZ - BORDER_OVERLAP;
        maxZ = overlapMaxZ + BORDER_OVERLAP;
    }

    return { minX, maxX, minZ, maxZ };
}

/**
 * State container for the world grid.
 * Stores a map of "col_row" → site records.
 */
export class WorldGrid {
    constructor() {
        /** @type {Map<string, object>} */
        this.sites = new Map();
        /** @type {string|null} current player site coordinate key */
        this.currentSiteKey = null;
        /** @type {string} player's persistent ID */
        this.playerId = null;
        /** @type {number} claimed site count */
        this.claimedCount = 0;
        /** @type {object} last known center of the player's camera */
        this.viewCenter = { col: 0, row: 0 };
    }

    /**
     * Get a site record by grid coordinates. Returns null if not loaded.
     */
    getSite(col, row) {
        return this.sites.get(`${col}_${row}`) || null;
    }

    /**
     * Get or create a site record.
     */
    getOrCreateSite(col, row, ownerId) {
        const key = `${col}_${row}`;
        if (!this.sites.has(key)) {
            this.sites.set(key, createSite(col, row, ownerId));
        }
        return this.sites.get(key);
    }

    /**
     * Upsert a site from remote data.
     */
    applyRemoteSite(siteData) {
        if (!siteData || siteData.col === undefined || siteData.row === undefined) return;
        const key = `${siteData.col}_${siteData.row}`;
        const existing = this.sites.get(key);
        if (existing) {
            // Merge — keep local fields if remote doesn't have them
            Object.assign(existing, siteData);
        } else {
            this.sites.set(key, { ...createSite(siteData.col, siteData.row, siteData.ownerId), ...siteData });
        }
    }

    /**
     * Get all sites visible from a given site (the site itself + its 4 neighbors).
     */
    getVisibleSites(col, row) {
        const visible = [];
        const center = this.getSite(col, row);
        if (center) visible.push(center);

        for (const n of getNeighborCoords(col, row)) {
            const neighbor = this.getSite(n.col, n.row);
            if (neighbor) visible.push(neighbor);
        }
        return visible;
    }

    /**
     * Get sites within a rectangular region (for map rendering).
     */
    getSitesInRegion(minCol, maxCol, minRow, maxRow) {
        const result = [];
        for (let c = minCol; c <= maxCol; c++) {
            for (let r = minRow; r <= maxRow; r++) {
                const site = this.getSite(c, r);
                if (site) result.push(site);
            }
        }
        return result;
    }

    /**
     * Count sites owned by a given player.
     */
    countOwnedSites(ownerId) {
        let count = 0;
        for (const site of this.sites.values()) {
            if (site.ownerId === ownerId) count++;
        }
        return count;
    }

    /**
     * Get all sites owned by a player.
     */
    getOwnedSites(ownerId) {
        const result = [];
        for (const site of this.sites.values()) {
            if (site.ownerId === ownerId) result.push(site);
        }
        return result;
    }

    /**
     * Serialize the current grid to a plain object array for network sync.
     */
    serialize() {
        return Array.from(this.sites.values());
    }

    /**
     * Replace all local sites from a remote array.
     */
    replaceAll(remoteList) {
        this.sites.clear();
        if (!Array.isArray(remoteList)) return;
        for (const site of remoteList) {
            this.applyRemoteSite(site);
        }
    }
}

/**
 * Create a fresh WorldGrid instance with default state.
 */
export function createWorldGrid(playerId) {
    const grid = new WorldGrid();
    grid.playerId = playerId || 'player_' + Math.random().toString(36).slice(2, 8);
    return grid;
}
