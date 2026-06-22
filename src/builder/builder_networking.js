/*
 Builder Multiplayer Sync.
 Handles real-time synchronization of placed track parts between
 multiple builders via WebsimSocket collections.
 Player cursors are also synced so you can see where others are building.
*/

/**
 * Initialize multiplayer sync for the builder.
 * Sets up a 'builder_track' collection and subscribes to remote changes.
 */
export function initBuilderMultiplayer(game, room) {
    if (!room || !room.isReady || typeof room.collection !== 'function') {
        game._builderSync = null;
        return;
    }
    game._builderRoom = room;

    try {
        const coll = room.collection('builder_track');

        // Subscribe to remote changes
        coll.subscribe((list) => {
            try {
                const remote = Array.isArray(list) ? list : [];
                applyRemoteParts(game, remote);
            } catch (e) {
                console.warn('Builder remote sync error', e);
            }
        });

        game._builderSync = {
            coll,
            // Add a placed part to remote (skips when we're applying remote state to prevent echo)
            add: async (placedData) => {
                if (game._builderRemoteApplying) return;
                try {
                    const doc = {
                        partKey: placedData.partKey,
                        x: placedData.x,
                        y: placedData.y,
                        z: placedData.z,
                        rotation: placedData.rotation || 0,
                        params: placedData.params || {},
                        playerId: game._builderPlayerId || 'unknown',
                        placedAt: Date.now()
                    };
                    await coll.create(doc);
                } catch (e) {
                    console.warn('Failed to sync part placement', e);
                }
            },
            // Remove a placed part from remote
            remove: async (placedData) => {
                try {
                    const list = coll.getList() || [];
                    const match = list.find(item =>
                        item.partKey === placedData.partKey &&
                        Math.abs(item.x - placedData.x) < 0.1 &&
                        Math.abs(item.z - placedData.z) < 0.1
                    );
                    if (match && match.id) {
                        await coll.delete(match.id);
                    }
                } catch (e) {
                    console.warn('Failed to sync part removal', e);
                }
            },
            // Clear all parts from remote
            clearAll: async () => {
                try {
                    const list = coll.getList() || [];
                    for (const item of list) {
                        try { await coll.delete(item.id); } catch (ignore) {}
                    }
                } catch (e) {
                    console.warn('Failed to clear remote parts', e);
                }
            }
        };

        // Set a random player ID for cursor tracking
        game._builderPlayerId = 'player_' + Math.random().toString(36).slice(2, 8);

        console.info('Builder multiplayer sync initialized');
    } catch (e) {
        console.warn('Builder multiplayer init failed', e);
        game._builderSync = null;
    }
}

/**
 * Apply remote parts to the local builder scene.
 * Only adds parts that don't already exist locally.
 * Guarded by _builderRemoteApplying to prevent echo loops.
 */
function applyRemoteParts(game, remoteList) {
    if (!game._builderPlacedParts || game._builderRemoteApplying) return;
    game._builderRemoteApplying = true;

    try {
        const localKeys = new Set(
            game._builderPlacedParts.map(p =>
                `${p.partKey}_${p.x.toFixed(1)}_${p.z.toFixed(1)}`
            )
        );

        for (const remote of remoteList) {
            const key = `${remote.partKey}_${(remote.x || 0).toFixed(1)}_${(remote.z || 0).toFixed(1)}`;
            if (localKeys.has(key)) continue;

            if (typeof game._builderPlaceRemote === 'function') {
                game._builderPlaceRemote(remote);
            }
        }
    } finally {
        game._builderRemoteApplying = false;
    }
}

/**
 * Periodically sync player cursor position.
 */
export function syncBuilderCursor(game, cursorPos) {
    // Cursor sync is deferred to a later phase.
}

/**
 * Share the current track to the community via WebsimSocket.
 */
export async function shareTrack(game, name) {
    if (!game._builderPlacedParts || game._builderPlacedParts.length === 0) {
        alert('Nothing to share! Place some parts first.');
        return;
    }
    const room = game._builderRoom || null;
    if (!room || !room.isReady || typeof room.collection !== 'function') {
        alert('Community sharing is only available when connected to WebsimSocket.');
        return;
    }
    try {
        const coll = room.collection('shared_tracks');
        const parts = (game._builderPlacedParts || []).map(p => ({
            partKey: p.partKey,
            x: p.x, y: p.y, z: p.z,
            rotation: p.rotation || 0,
            params: p.params || {}
        }));
        const doc = {
            name: name || 'Unnamed Track',
            parts: parts,
            author: game._builderPlayerId || 'anonymous',
            sharedAt: Date.now(),
            partCount: parts.length
        };
        await coll.create(doc);
        alert(`Track "${name}" shared to community! (${parts.length} parts)`);
        console.info('Track shared to community:', name, parts.length, 'parts');
    } catch (e) {
        console.warn('Failed to share track', e);
        alert('Failed to share track. Check your connection and try again.');
    }
}

/**
 * Load a list of community-shared tracks and let the user pick one.
 */
export async function loadCommunityTracks(game) {
    const room = game._builderRoom || null;
    if (!room || !room.isReady || typeof room.collection !== 'function') {
        alert('Community tracks are only available when connected to WebsimSocket.');
        return;
    }
    try {
        const coll = room.collection('shared_tracks');
        const list = coll.getList() || [];
        if (list.length === 0) {
            alert('No community tracks shared yet. Be the first to share one!');
            return;
        }
        // Build a friendly picker list
        const lines = list.map((t, i) =>
            `${i + 1}. "${t.name || 'Unnamed'}" by ${t.author || 'anon'} — ${t.partCount || '?'} parts`
        );
        let choice;
        if (list.length === 1) {
            if (!confirm(`Load "${list[0].name}" by ${list[0].author || 'anon'}? (${list[0].partCount || '?'} parts)`)) return;
            choice = list[0];
        } else {
            const input = prompt('Community tracks — enter number to load:\n\n' + lines.join('\n'));
            if (input === null) return;
            const idx = parseInt(input, 10) - 1;
            if (isNaN(idx) || idx < 0 || idx >= list.length) {
                alert('Invalid selection.');
                return;
            }
            choice = list[idx];
        }
        if (choice && choice.parts && Array.isArray(choice.parts)) {
            if (typeof game._builderLoadCommunityParts === 'function') {
                game._builderLoadCommunityParts(choice.parts);
            }
            alert(`Loaded "${choice.name || 'Unnamed'}" — ${choice.parts.length} parts`);
        }
    } catch (e) {
        console.warn('Failed to load community tracks', e);
        alert('Failed to load community tracks. Check your connection.');
    }
}

/**
 * Dispose multiplayer sync.
 */
export function disposeBuilderMultiplayer(game) {
    game._builderSync = null;
}
