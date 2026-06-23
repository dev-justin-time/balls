/*
 Marketplace.
 User-to-user trading system for sites, parts, and in-game items.
 Manages: listing creation, purchase flow, transaction history,
 inventory tracking, and item serialization.
*/

import { SITE_SIZE, TERRAIN_PRESETS } from './world_state.js';

// --- Transaction history (localStorage) ---
const TX_HISTORY_KEY = 'goingBalls_market_tx';

function getTransactionHistory() {
    try {
        const raw = localStorage.getItem(TX_HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

function addTransaction(tx) {
    const history = getTransactionHistory();
    history.unshift(tx);
    // Keep last 100 transactions
    if (history.length > 100) history.length = 100;
    try {
        localStorage.setItem(TX_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {}
}

/**
 * List a site on the marketplace.
 * @returns {Promise<boolean>} success
 */
export async function listSiteForSale(game, col, row, price) {
    const grid = game._worldGrid;
    if (!grid) return false;
    const site = grid.getSite(col, row);
    if (!site) return false;
    if (site.ownerId !== grid.playerId) return false;
    if (price < 1) return false;

    site.listed = true;
    site.listPrice = price;

    if (game._worldSync) {
        await game._worldSync.listSite(col, row, price);
    }

    addTransaction({
        type: 'list',
        siteKey: `${col}_${row}`,
        col, row,
        sellerId: grid.playerId,
        price,
        timestamp: Date.now()
    });

    return true;
}

/**
 * Delist a site from the marketplace.
 */
export async function delistSite(game, col, row) {
    const grid = game._worldGrid;
    if (!grid) return false;
    const site = grid.getSite(col, row);
    if (!site) return false;
    if (site.ownerId !== grid.playerId) return false;

    site.listed = false;
    site.listPrice = 0;

    if (game._worldSync) {
        await game._worldSync.updateSite(col, row, { listed: false, listPrice: 0 });
        // Remove from marketplace collection
        const marketColl = game._worldSync.marketColl;
        if (marketColl) {
            const list = marketColl.getList() || [];
            const listing = list.find(l => l.col === col && l.row === row);
            if (listing && listing.id) {
                try { await marketColl.delete(listing.id); } catch (_e) {}
            }
        }
    }

    addTransaction({
        type: 'delist',
        siteKey: `${col}_${row}`,
        col, row,
        sellerId: grid.playerId,
        timestamp: Date.now()
    });

    return true;
}

/**
 * Purchase a listed site from another player.
 * Handles coin transfer and ownership change.
 */
export async function purchaseSite(game, col, row) {
    const grid = game._worldGrid;
    if (!grid) return { success: false, reason: 'World not connected' };

    const site = grid.getSite(col, row);
    if (!site) return { success: false, reason: 'Site not found' };
    if (!site.listed) return { success: false, reason: 'Site not for sale' };
    if (site.listPrice < 1) return { success: false, reason: 'Invalid price' };
    if (site.ownerId === grid.playerId) return { success: false, reason: 'Already yours' };

    const coins = (game.saveData && game.saveData.totalCoins) || 0;
    if (coins < site.listPrice) return { success: false, reason: `Need ${site.listPrice} coins, have ${coins}` };

    // Execute purchase through networking
    if (game._worldSync) {
        const result = await game._worldSync.buySite(col, row, coins);
        if (!result.success) return result;

        // Deduct coins
        game.saveData.totalCoins -= result.price;
        if (typeof game.save === 'function') game.save();

        addTransaction({
            type: 'purchase',
            siteKey: `${col}_${row}`,
            col, row,
            buyerId: grid.playerId,
            sellerId: result.sellerId,
            price: result.price,
            timestamp: Date.now()
        });

        return { success: true, price: result.price };
    }

    return { success: false, reason: 'Network unavailable' };
}

/**
 * Get all marketplace listings, optionally filtered.
 */
export function getMarketListings(game, filters = {}) {
    const listings = game._worldListings || [];
    let result = [...listings];

    if (filters.maxPrice !== undefined) {
        result = result.filter(l => l.price <= filters.maxPrice);
    }
    if (filters.terrain) {
        result = result.filter(l => l.terrain === filters.terrain);
    }
    if (filters.excludeSelf) {
        const grid = game._worldGrid;
        const myId = grid ? grid.playerId : null;
        result = result.filter(l => l.sellerId !== myId);
    }

    // Sort by price ascending
    result.sort((a, b) => (a.price || 0) - (b.price || 0));

    return result;
}

/**
 * Get transaction history for display.
 */
export function getTransactionHistoryUI() {
    return getTransactionHistory();
}

/**
 * Export a site's parts as a shareable item listing.
 * Allows selling track blueprints (the actual part layout) separately from the site.
 */
export function createBlueprintListing(game, col, row, name, price) {
    const grid = game._worldGrid;
    if (!grid) return null;
    const site = grid.getSite(col, row);
    if (!site) return null;
    if (!site.parts || site.parts.length === 0) return null;

    const blueprint = {
        type: 'blueprint',
        name: name || `Blueprint (${col},${row})`,
        author: grid.playerId,
        terrain: site.terrain,
        skyType: site.skyType,
        parts: [...site.parts],
        partCount: site.parts.length,
        price: price || 0,
        listedAt: Date.now()
    };

    // Store locally for now; sync to marketplace collection
    const blueprints = JSON.parse(localStorage.getItem('goingBalls_blueprints') || '[]');
    blueprints.push(blueprint);
    try {
        localStorage.setItem('goingBalls_blueprints', JSON.stringify(blueprints));
    } catch (e) {}

    // Also publish to remote if connected
    if (game._worldSync && game._worldSync.marketColl) {
        try {
            game._worldSync.marketColl.create({
                type: 'blueprint',
                name: blueprint.name,
                author: blueprint.author,
                terrain: blueprint.terrain,
                skyType: blueprint.skyType,
                parts: blueprint.parts,
                partCount: blueprint.partCount,
                price: blueprint.price,
                listedAt: blueprint.listedAt
            });
        } catch (e) {
            console.warn('Failed to publish blueprint', e);
        }
    }

    return blueprint;
}

/**
 * Get available blueprint listings.
 */
export function getBlueprintListings(game) {
    // Combine local and remote blueprints
    let local = [];
    try {
        local = JSON.parse(localStorage.getItem('goingBalls_blueprints') || '[]');
    } catch (e) {}

    // Remote blueprints from marketplace collection
    let remote = [];
    if (game._worldListings) {
        remote = game._worldListings.filter(l => l.type === 'blueprint');
    }

    // Merge and deduplicate by name+author
    const seen = new Set();
    const merged = [];
    for (const bp of [...remote, ...local]) {
        const key = `${bp.name}_${bp.author}`;
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(bp);
        }
    }

    return merged;
}
