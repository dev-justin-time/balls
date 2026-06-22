/*
 Track Builder Part Catalog.
 Defines every placable part type, organized by category,
 with default parameters and connection-point (snap) metadata.
 Used by builder_snap.js and builder_ui.js for placement & preview.
*/

/**
 * Each part entry:
 *   key          — unique string id
 *   name         — human-readable label
 *   category     — 'surface' | 'structural' | 'hazard' | 'collectible' | 'marker'
 *   icon         — emoji or short text for grid card
 *   defaults     — { width, length, height, … } factory params
 *   connPts      — connection points in local space { x, y, z, dir }
 *                  dir: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
 *   builderFn    — name of the add* function to call (string, resolved at placement)
 *   description  — tooltip text
 */

export const PART_CATEGORIES = [
    { id: 'surface',     label: 'Surfaces',      icon: '🟫' },
    { id: 'structural',  label: 'Structural',     icon: '🧱' },
    { id: 'hazard',      label: 'Hazards',        icon: '⚠️'  },
    { id: 'collectible', label: 'Collectibles',   icon: '🪙' },
    { id: 'marker',      label: 'Markers',        icon: '🏁' }
];

export const PART_CATALOG = {

    // ============= SURFACES =============

    platform: {
        key: 'platform',
        name: 'Platform',
        category: 'surface',
        icon: '⬜',
        defaults: { width: 8, length: 15, color: null },
        connPts: [
            { x: 0, y: 0, z: -7.5, dir: 'front' },
            { x: 0, y: 0, z: 7.5,  dir: 'back'  },
            { x: -4, y: 0, z: 0,   dir: 'left'  },
            { x: 4,  y: 0, z: 0,   dir: 'right' }
        ],
        builderFn: 'addPlatform',
        description: 'Flat wooden platform. Basic building block.'
    },

    ramp: {
        key: 'ramp',
        name: 'Ramp',
        category: 'surface',
        icon: '📐',
        defaults: { width: 8, length: 15, height: 5 },
        connPts: [
            { x: 0, y: 0,     z: 0,      dir: 'front' },
            { x: 0, y: 5,     z: -15,    dir: 'back'  }
        ],
        builderFn: 'addRamp',
        description: 'Angled ramp connecting different heights.'
    },

    glass_platform: {
        key: 'glass_platform',
        name: 'Glass Platform',
        category: 'surface',
        icon: '🫧',
        defaults: { width: 6, length: 14 },
        connPts: [
            { x: 0, y: 0, z: -7, dir: 'front' },
            { x: 0, y: 0, z: 7,  dir: 'back'  }
        ],
        builderFn: 'addGlassPlatform',
        description: 'Breakable glass platform. Shatters when the ball rolls over it.'
    },

    speed_strip: {
        key: 'speed_strip',
        name: 'Speed Strip',
        category: 'surface',
        icon: '⚡',
        defaults: { width: 7, length: 20, color: 0xffff00 },
        connPts: [
            { x: 0, y: 0, z: -10, dir: 'front' },
            { x: 0, y: 0, z: 10,  dir: 'back'  }
        ],
        builderFn: 'addPlatform',
        description: 'Yellow platform. Visually marks speed zones (no physics boost in builder preview).'
    },

    finish_line: {
        key: 'finish_line',
        name: 'Finish Line',
        category: 'surface',
        icon: '🏁',
        defaults: { width: 8, length: 30, color: 0x00ff00 },
        connPts: [
            { x: 0, y: 0, z: -15, dir: 'front' },
            { x: 0, y: 0, z: 15,  dir: 'back'  }
        ],
        builderFn: 'addPlatform',
        description: 'Green finish platform. Marks the end of a level.'
    },

    // ============= STRUCTURAL =============

    wall: {
        key: 'wall',
        name: 'Wall',
        category: 'structural',
        icon: '🧱',
        defaults: { width: 1, length: 20, rotZ: 0 },
        connPts: [
            { x: 0, y: 0, z: -10, dir: 'front' },
            { x: 0, y: 0, z: 10,  dir: 'back'  }
        ],
        builderFn: 'addWall',
        description: 'Angled wall barrier. Blocks the ball or guides it.'
    },

    tunnel_walls: {
        key: 'tunnel_walls',
        name: 'Tunnel Walls',
        category: 'structural',
        icon: '🚇',
        defaults: { width: 8, length: 30 },
        connPts: [
            { x: 0, y: 0, z: -15, dir: 'front' },
            { x: 0, y: 0, z: 15,  dir: 'back'  }
        ],
        builderFn: 'addTunnelWalls',
        description: 'Parallel wall pair forming a tunnel corridor.'
    },

    // ============= HAZARDS =============

    pendulum: {
        key: 'pendulum',
        name: 'Pendulum',
        category: 'hazard',
        icon: '💣',
        defaults: { speedMult: 1.0 },
        connPts: [
            { x: 0, y: 0, z: 0, dir: 'front' }
        ],
        builderFn: 'addPendulum',
        description: 'Swinging wrecking ball hazard. Knocks coins from the player.'
    },

    spinner: {
        key: 'spinner',
        name: 'Spinner',
        category: 'hazard',
        icon: '🌀',
        defaults: { speedMult: 1.0 },
        connPts: [
            { x: 0, y: 0, z: 0, dir: 'front' }
        ],
        builderFn: 'addSpinner',
        description: 'Rotating bar hazard. Spins around its center.'
    },

    hammer: {
        key: 'hammer',
        name: 'Hammer',
        category: 'hazard',
        icon: '🔨',
        defaults: { speedMult: 1.0 },
        connPts: [
            { x: 0, y: 0, z: 0, dir: 'front' }
        ],
        builderFn: 'addHammer',
        description: 'Slamming hammer hazard. Pounds down on the track.'
    },

    mover: {
        key: 'mover',
        name: 'Moving Block',
        category: 'hazard',
        icon: '📦',
        defaults: { width: 3, height: 1, depth: 2, sideways: false, speedMult: 1.0 },
        connPts: [
            { x: 0, y: 0, z: 0, dir: 'front' }
        ],
        builderFn: 'addMover',
        description: 'Sliding block that moves back and forth.'
    },

    blade: {
        key: 'blade',
        name: 'Blade',
        category: 'hazard',
        icon: '🔪',
        defaults: { thickness: 0.12, length: 2.0, swing: 1.0, vertical: false },
        connPts: [
            { x: 0, y: 0, z: 0, dir: 'front' }
        ],
        builderFn: 'addBlade',
        description: 'Oscillating blade hazard. Slices through the track area.'
    },

    // ============= COLLECTIBLES =============

    coin_line: {
        key: 'coin_line',
        name: 'Coin Line',
        category: 'collectible',
        icon: '🪙',
        defaults: { count: 5, length: 20 },
        connPts: [
            { x: 0, y: 0, z: -10, dir: 'front' },
            { x: 0, y: 0, z: 10,  dir: 'back'  }
        ],
        builderFn: 'addCoins',
        description: 'A line of coins. Collect them for points!'
    },

    checkpoint: {
        key: 'checkpoint',
        name: 'Checkpoint',
        category: 'collectible',
        icon: '💾',
        defaults: { width: 8 },
        connPts: [
            { x: 0, y: 0, z: 0, dir: 'front' }
        ],
        builderFn: 'addCheckpoint',
        description: 'Checkpoint flag. Player respawns here after falling.'
    },

    // ============= DECORATIVE (hidden from main grid but available) =============

    finish_model: {
        key: 'finish_model',
        name: 'Finish Gate',
        category: 'marker',
        icon: '🎯',
        defaults: {},
        connPts: [],
        builderFn: 'placeFinishModel',
        description: '3D finish gate model. Marks the level end with a visual arch.'
    }
};

/**
 * Lookup a part definition by key.
 */
export function getPartDef(key) {
    return PART_CATALOG[key] || null;
}

/**
 * Return all parts in a given category.
 */
export function getPartsByCategory(categoryId) {
    return Object.values(PART_CATALOG).filter(p => p.category === categoryId);
}

/**
 * Return all part keys.
 */
export function getAllPartKeys() {
    return Object.keys(PART_CATALOG);
}
