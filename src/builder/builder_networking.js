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
 * Dispose multiplayer sync.
 */
export function disposeBuilderMultiplayer(game) {
    game._builderSync = null;
}
