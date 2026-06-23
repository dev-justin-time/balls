/*
 World Networking.
 Handles real-time multiplayer sync for the world grid via WebsimSocket collections.
 Manages: site claims/ownership, track parts per site, player positions,
 neighbor presence, and marketplace listings.
*/

import { WorldGrid, createWorldGrid, SITE_SIZE } from './world_state.js';

/**
 * Initialize world multiplayer networking.
 * Sets up collections and subscribes to remote changes.
 * @returns {object} WorldGrid instance
 */
export function initWorldNetworking(game, room) {
    if (!room || !room.isReady || typeof room.collection !== 'function') {
        console.info('World networking unavailable — offline mode.');
        game._worldGrid = createWorldGrid(game._builderPlayerId);
        game._worldSync = null;
        return game._worldGrid;
    }

    const grid = createWorldGrid(game._builderPlayerId);
    game._worldGrid = grid;
    game._builderRoom = room;

    try {
        // --- Site ownership collection ---
        const sitesColl = room.collection('world_sites');
        sitesColl.subscribe((list) => {
            try {
                const remote = Array.isArray(list) ? list : [];
                for (const siteData of remote) {
                    grid.applyRemoteSite(siteData);
                }
            } catch (e) {
                console.warn('World sites sync error', e);
            }
        });

        // --- Track parts per site collection ---
        const partsColl = room.collection('world_parts');
        partsColl.subscribe((list) => {
            try {
                const remote = Array.isArray(list) ? list : [];
                applyRemoteWorldParts(game, remote);
            } catch (e) {
                console.warn('World parts sync error', e);
            }
        });

        // --- Player presence collection ---
        const presenceColl = room.collection('world_presence');
        let lastPresenceSync = 0;
        presenceColl.subscribe((list) => {
            try {
                const remote = Array.isArray(list) ? list : [];
                game._worldPlayers = remote.filter(p =>
                    p.playerId !== grid.playerId &&
                    Date.now() - (p.updatedAt || 0) < 30000 // stale after 30s
                );
            } catch (e) {
                console.warn('World presence sync error', e);
            }
        });

        // --- Marketplace listings collection ---
        const marketColl = room.collection('world_listings');
        marketColl.subscribe((list) => {
            try {
                game._worldListings = Array.isArray(list) ? list : [];
            } catch (e) {
                console.warn('World listings sync error', e);
            }
        });

        game._worldSync = {
            sitesColl,
            partsColl,
            presenceColl,
            marketColl,

            /** Claim a site for the current player. */
            claimSite: async (col, row) => {
                const site = grid.getOrCreateSite(col, row, grid.playerId);
                site.ownerId = grid.playerId;
                site.ownerName = grid.playerId;
                site.createdAt = Date.now();
                grid.claimedCount++;
                try {
                    await sitesColl.create({
                        col, row,
                        ownerId: grid.playerId,
                        ownerName: grid.playerId,
                        terrain: site.terrain,
                        skyType: site.skyType,
                        isPublic: true,
                        listed: false,
                        listPrice: 0,
                        createdAt: Date.now()
                    });
                } catch (e) {
                    console.warn('Failed to claim site', e);
                }
            },

            /** Update a site's config (terrain, sky, etc.). */
            updateSite: async (col, row, updates) => {
                const site = grid.getSite(col, row);
                if (!site) return;
                Object.assign(site, updates);
                try {
                    // Find and update the remote record
                    const list = sitesColl.getList() || [];
                    const match = list.find(s => s.col === col && s.row === row);
                    if (match && match.id) {
                        await sitesColl.update(match.id, updates);
                    }
                } catch (e) {
                    console.warn('Failed to update site', e);
                }
            },

            /** Save track parts for a site. */
            saveSiteParts: async (col, row, parts) => {
                const site = grid.getSite(col, row);
                if (site) {
                    site.parts = parts;
                    site.partCount = parts.length;
                    site.lastEdited = Date.now();
                }
                try {
                    const list = partsColl.getList() || [];
                    const siteKey = `${col}_${row}`;
                    // Remove old parts for this site
                    const oldParts = list.filter(p => p.siteKey === siteKey);
                    for (const old of oldParts) {
                        if (old.id) {
                            try { await partsColl.delete(old.id); } catch (_e) {}
                        }
                    }
                    // Create new parts
                    const safeParts = parts.slice(0, 500).map(p => ({
                        siteKey,
                        partKey: p.partKey,
                        x: p.x, y: p.y, z: p.z,
                        rotation: p.rotation || 0,
                        params: p.params || {},
                        playerId: grid.playerId
                    }));
                    // Batch in chunks to avoid flooding
                    for (let i = 0; i < safeParts.length; i += 50) {
                        const batch = safeParts.slice(i, i + 50);
                        for (const part of batch) {
                            try { await partsColl.create(part); } catch (_e) {}
                        }
                    }
                } catch (e) {
                    console.warn('Failed to save site parts', e);
                }
            },

            /** Update player presence (position in the world). */
            updatePresence: async (col, row) => {
                const now = Date.now();
                if (now - lastPresenceSync < 2000) return; // throttle to 2s
                lastPresenceSync = now;
                grid.currentSiteKey = `${col}_${row}`;
                grid.viewCenter = { col, row };
                try {
                    await presenceColl.create({
                        playerId: grid.playerId,
                        siteCol: col,
                        siteRow: row,
                        updatedAt: now
                    });
                } catch (_e) {}
            },

            /** List a site on the marketplace. */
            listSite: async (col, row, price) => {
                const site = grid.getSite(col, row);
                if (!site || site.ownerId !== grid.playerId) return;
                site.listed = true;
                site.listPrice = price;
                try {
                    const list = sitesColl.getList() || [];
                    const match = list.find(s => s.col === col && s.row === row);
                    if (match && match.id) {
                        await sitesColl.update(match.id, { listed: true, listPrice: price });
                    }
                    await marketColl.create({
                        siteKey: `${col}_${row}`,
                        col, row,
                        sellerId: grid.playerId,
                        price,
                        terrain: site.terrain,
                        skyType: site.skyType,
                        partCount: site.partCount || 0,
                        listedAt: Date.now()
                    });
                } catch (e) {
                    console.warn('Failed to list site', e);
                }
            },

            /** Buy a listed site. */
            buySite: async (col, row, buyerCoins) => {
                const site = grid.getSite(col, row);
                if (!site || !site.listed || site.listPrice <= 0) return { success: false, reason: 'Not for sale' };
                if (buyerCoins < site.listPrice) return { success: false, reason: 'Not enough coins' };
                if (site.ownerId === grid.playerId) return { success: false, reason: 'Already yours' };

                // Transfer ownership
                const sellerId = site.ownerId;
                site.ownerId = grid.playerId;
                site.listed = false;
                site.listPrice = 0;

                try {
                    const sitesList = sitesColl.getList() || [];
                    const match = sitesList.find(s => s.col === col && s.row === row);
                    if (match && match.id) {
                        await sitesColl.update(match.id, {
                            ownerId: grid.playerId,
                            listed: false,
                            listPrice: 0
                        });
                    }
                    // Remove marketplace listing
                    const marketList = marketColl.getList() || [];
                    const listing = marketList.find(l => l.col === col && l.row === row);
                    if (listing && listing.id) {
                        await marketColl.delete(listing.id);
                    }
                    return { success: true, price: site.listPrice, sellerId };
                } catch (e) {
                    console.warn('Failed to buy site', e);
                    return { success: false, reason: 'Network error' };
                }
            }
        };

        console.info('World networking initialized — playerId:', grid.playerId);
    } catch (e) {
        console.warn('World networking init failed', e);
        game._worldSync = null;
    }

    return grid;
}

/**
 * Apply remote world parts to the local grid.
 */
function applyRemoteWorldParts(game, remoteList) {
    const grid = game._worldGrid;
    if (!grid) return;

    // Group parts by siteKey
    const grouped = {};
    for (const part of remoteList) {
        if (!part.siteKey) continue;
        if (!grouped[part.siteKey]) grouped[part.siteKey] = [];
        grouped[part.siteKey].push(part);
    }

    // Apply to each site
    for (const [siteKey, parts] of Object.entries(grouped)) {
        const [colStr, rowStr] = siteKey.split('_');
        const col = parseInt(colStr, 10);
        const row = parseInt(rowStr, 10);
        if (Number.isNaN(col) || Number.isNaN(row)) continue;

        const site = grid.getSite(col, row);
        if (site) {
            site.parts = parts.map(p => ({
                partKey: p.partKey,
                x: p.x, y: p.y, z: p.z,
                rotation: p.rotation || 0,
                params: p.params || {}
            }));
            site.partCount = parts.length;
        }
    }
}

/**
 * Dispose world networking.
 */
export function disposeWorldNetworking(game) {
    game._worldSync = null;
    game._worldPlayers = [];
    game._worldListings = [];
}
