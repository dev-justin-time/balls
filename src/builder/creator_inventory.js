/**
 * =====================================================================
 * @domain:    builder
 * @concern:   Track Creator — Wireframe Inventory Storage
 * @created:   2026-06-26T12:00:00Z
 * =====================================================================
 *
 * CreatorInventory — localStorage-backed inventory for wireframe imports.
 *
 * Each inventory item stores:
 *   - The original sketch image (base64) for thumbnail display
 *   - The graph data (nodes + edges) from the AI backend
 *   - Metadata (name, dates, stats, tags)
 *
 * Re-extrusion happens on load since Three.js meshes aren't serializable.
 * This avoids requiring the Python AI backend on every inventory reload.
 */

const STORAGE_KEY = 'goingBalls_creator_inventory';
const MAX_ITEMS = 50;  // Keep reasonable for localStorage ~5-10MB limit

/**
 * @typedef {Object} InventoryItem
 * @property {string} id           - Unique UUID
 * @property {string} name         - User-assigned name
 * @property {string} imageBase64  - Base64 PNG/JPEG of original sketch
 * @property {string} imageThumb   - Small base64 thumbnail (≤ 512px)
 * @property {Object} graphData    - { nodes: [[x,y],...], edges: [[i,j],...], node_count, edge_count, engine_used }
 * @property {number} nodeCount
 * @property {number} edgeCount
 * @property {string} engineUsed   - 'hamp_pro' | 'opencv' | 'opencv_fallback'
 * @property {number} createdAt    - Unix ms timestamp
 * @property {number} updatedAt    - Unix ms timestamp
 * @property {string[]} tags       - User tags
 * @property {boolean} favorite    - Starred/favorited
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read all inventory items from localStorage.
 * @returns {InventoryItem[]}
 */
export function getInventory() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.warn('[CreatorInventory] Failed to read inventory:', e);
        return [];
    }
}

/**
 * Save (upsert) an inventory item. If an item with the same id exists, it's replaced.
 * @param {InventoryItem} item
 */
export function saveItem(item) {
    const inventory = getInventory();

    // Enforce max items (remove oldest if needed)
    while (inventory.length >= MAX_ITEMS) {
        inventory.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        inventory.shift();
    }

    const existingIdx = inventory.findIndex(i => i.id === item.id);
    if (existingIdx !== -1) {
        inventory[existingIdx] = { ...inventory[existingIdx], ...item, updatedAt: Date.now() };
    } else {
        inventory.push({ ...item, createdAt: item.createdAt || Date.now(), updatedAt: Date.now() });
    }

    _persist(inventory);
}

/**
 * Delete an inventory item by id.
 * @param {string} id
 * @returns {boolean} true if deleted, false if not found
 */
export function deleteItem(id) {
    const inventory = getInventory();
    const idx = inventory.findIndex(i => i.id === id);
    if (idx === -1) return false;
    inventory.splice(idx, 1);
    _persist(inventory);
    return true;
}

/**
 * Rename an inventory item.
 * @param {string} id
 * @param {string} newName
 * @returns {boolean}
 */
export function renameItem(id, newName) {
    const inventory = getInventory();
    const item = inventory.find(i => i.id === id);
    if (!item) return false;
    item.name = newName.trim() || 'Untitled Wireframe';
    item.updatedAt = Date.now();
    _persist(inventory);
    return true;
}

/**
 * Toggle favorite status on an item.
 * @param {string} id
 * @returns {boolean} New favorite state, or null if not found
 */
export function toggleFavorite(id) {
    const inventory = getInventory();
    const item = inventory.find(i => i.id === id);
    if (!item) return null;
    item.favorite = !item.favorite;
    item.updatedAt = Date.now();
    _persist(inventory);
    return item.favorite;
}

/**
 * Add a tag to an item.
 * @param {string} id
 * @param {string} tag
 */
export function addTag(id, tag) {
    const inventory = getInventory();
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    if (!item.tags) item.tags = [];
    if (!item.tags.includes(tag)) {
        item.tags.push(tag);
        item.updatedAt = Date.now();
        _persist(inventory);
    }
}

/**
 * Remove a tag from an item.
 * @param {string} id
 * @param {string} tag
 */
export function removeTag(id, tag) {
    const inventory = getInventory();
    const item = inventory.find(i => i.id === id);
    if (!item || !item.tags) return;
    item.tags = item.tags.filter(t => t !== tag);
    item.updatedAt = Date.now();
    _persist(inventory);
}

/**
 * Get a single inventory item by id.
 * @param {string} id
 * @returns {InventoryItem|undefined}
 */
export function getItem(id) {
    return getInventory().find(i => i.id === id);
}

/**
 * Get inventory statistics.
 * @returns {{ total: number, favorites: number, byEngine: Object, oldestDate: number|null }}
 */
export function getInventoryStats() {
    const inventory = getInventory();
    const byEngine = {};
    let favorites = 0;
    let oldestDate = null;

    for (const item of inventory) {
        byEngine[item.engineUsed || 'unknown'] = (byEngine[item.engineUsed || 'unknown'] || 0) + 1;
        if (item.favorite) favorites++;
        if (oldestDate === null || (item.createdAt && item.createdAt < oldestDate)) {
            oldestDate = item.createdAt;
        }
    }

    return {
        total: inventory.length,
        favorites,
        byEngine,
        oldestDate
    };
}

/**
 * Clear the entire inventory. Returns count of items removed.
 * @returns {number}
 */
export function clearInventory() {
    const inventory = getInventory();
    const count = inventory.length;
    localStorage.removeItem(STORAGE_KEY);
    return count;
}

/**
 * Generate a unique UUID v4 string.
 * @returns {string}
 */
export function generateId() {
    return 'wf_' + Date.now().toString(36) + '_' +
        Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------

function _persist(inventory) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22 || e.message.includes('quota')) {
            console.warn('[CreatorInventory] localStorage quota exceeded. Trimming oldest items...');
            // Remove oldest 10 items and retry
            inventory.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            const trimmed = inventory.slice(10);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
                console.warn('[CreatorInventory] Trimmed inventory from', inventory.length, 'to', trimmed.length, 'items');
            } catch (e2) {
                console.error('[CreatorInventory] Still cannot persist after trim:', e2);
            }
        } else {
            console.warn('[CreatorInventory] Failed to persist inventory:', e);
        }
    }
}
