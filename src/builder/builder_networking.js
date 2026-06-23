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
                        try { await coll.delete(item.id);                    } catch (_ignore) {}
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
    if (!game._builderSync || !game._builderSync.coll) return;
    if (!cursorPos) return;
    try {
        const coll = game._builderSync.coll;
        // Upsert cursor position for this player
        const cursorData = {
            playerId: game._builderPlayerId || 'unknown',
            x: cursorPos.x || 0,
            y: cursorPos.y || 0,
            z: cursorPos.z || 0,
            updatedAt: Date.now()
        };
        coll.create(cursorData);
    } catch (_e) {
        // Non-fatal: cursor sync is best-effort
    }
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
            partCount: parts.length,
            likes: 0
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
 * Load a list of community-shared tracks and let the user pick one via a modal.
 * @param {'builder'|'play'} mode - 'builder' loads into builder, 'play' starts track immediately
 */
export async function loadCommunityTracks(game, mode = 'builder') {
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
        renderCommunityModal(game, list, mode);
    } catch (e) {
        console.warn('Failed to load community tracks', e);
        alert('Failed to load community tracks. Check your connection.');
    }
}

// --- Like / Upvote system ---

const LIKED_STORAGE_KEY = 'goingBalls_liked_tracks';

/** Get the set of track IDs the current player has liked (localStorage). */
function getLikedTrackIds() {
    try {
        const raw = localStorage.getItem(LIKED_STORAGE_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) { return new Set(); }
}

/** Persist liked track IDs to localStorage. */
function saveLikedTrackIds(ids) {
    try {
        localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify([...ids]));
    } catch (e) {}
}

/**
 * Like a community track. Updates localStorage instantly and syncs to remote.
 */
export async function likeTrack(game, trackId) {
    const liked = getLikedTrackIds();
    if (liked.has(trackId)) return; // already liked
    liked.add(trackId);
    saveLikedTrackIds(liked);
    // Sync to remote
    const room = game._builderRoom || null;
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('track_likes');
            await coll.create({
                trackId,
                playerId: game._builderPlayerId || 'anonymous',
                likedAt: Date.now()
            });
        } catch (e) {
            console.warn('Failed to sync like to remote', e);
        }
    }
}

/**
 * Unlike a community track. Updates localStorage instantly and removes from remote.
 */
export async function unlikeTrack(game, trackId) {
    const liked = getLikedTrackIds();
    if (!liked.has(trackId)) return;
    liked.delete(trackId);
    saveLikedTrackIds(liked);
    // Sync to remote
    const room = game._builderRoom || null;
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('track_likes');
            const list = coll.getList() || [];
            const match = list.find(item =>
                item.trackId === trackId &&
                item.playerId === (game._builderPlayerId || 'anonymous')
            );
            if (match && match.id) {
                await coll.delete(match.id);
            }
        } catch (e) {
            console.warn('Failed to sync unlike to remote', e);
        }
    }
}

/**
 * Build a map of trackId → likeCount from the remote track_likes collection.
 */
function getTrackLikes(game) {
    const counts = {};
    const room = game._builderRoom || null;
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('track_likes');
            const list = coll.getList() || [];
            for (const item of list) {
                if (item.trackId) {
                    counts[item.trackId] = (counts[item.trackId] || 0) + 1;
                }
            }
        } catch (e) {}
    }
    return counts;
}

// --- Star Rating system ---

const RATED_STORAGE_KEY = 'goingBalls_rated_tracks';

/** Get the map of trackId → rating (1-5) the current player has given (localStorage). */
function getRatedTrackIds() {
    try {
        const raw = localStorage.getItem(RATED_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}

/** Persist rated track map to localStorage. */
function saveRatedTrackIds(rated) {
    try {
        localStorage.setItem(RATED_STORAGE_KEY, JSON.stringify(rated));
    } catch (e) {}
}

/**
 * Rate a community track (1-5 stars). Updates localStorage instantly and syncs to remote.
 */
export async function rateTrack(game, trackId, rating) {
    const r = Math.max(1, Math.min(5, Math.round(rating)));
    const rated = getRatedTrackIds();
    rated[trackId] = r;
    saveRatedTrackIds(rated);
    // Sync to remote
    const room = game._builderRoom || null;
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('track_ratings');
            // Remove existing rating for this player on this track
            const list = coll.getList() || [];
            const existing = list.find(item =>
                item.trackId === trackId &&
                item.playerId === (game._builderPlayerId || 'anonymous')
            );
            if (existing && existing.id) {
                try { await coll.delete(existing.id); } catch (_e) {}
            }
            await coll.create({
                trackId,
                playerId: game._builderPlayerId || 'anonymous',
                rating: r,
                ratedAt: Date.now()
            });
        } catch (e) {
            console.warn('Failed to sync rating to remote', e);
        }
    }
}

/**
 * Build a map of trackId → { avg, count } from the remote track_ratings collection.
 */unction getTrackRatings(game) {
    const data = {};
    const room = game._builderRoom || null;
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('track_ratings');
            const list = coll.getList() || [];
            for (const item of list) {
                if (item.trackId && typeof item.rating === 'number') {
                    if (!data[item.trackId]) data[item.trackId] = { total: 0, count: 0 };
                    data[item.trackId].total += item.rating;
                    data[item.trackId].count += 1;
                }
            }
        } catch (e) {}
    }
    // Convert to avg + count
    const result = {};
    for (const [id, d] of Object.entries(data)) {
        result[id] = { avg: d.count > 0 ? d.total / d.count : 0, count: d.count };
    }
    return result;
}

// --- Play Count system ---

const PLAYED_STORAGE_KEY = 'goingBalls_played_tracks';

/** Get the set of track IDs the current player has played (localStorage). */
function getPlayedTrackIds() {
    try {
        const raw = localStorage.getItem(PLAYED_STORAGE_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) { return new Set(); }
}

/** Persist played track IDs to localStorage. */
function savePlayedTrackIds(ids) {
    try {
        localStorage.setItem(PLAYED_STORAGE_KEY, JSON.stringify([...ids]));
    } catch (e) {}
}

/**
 * Record that a track was played. Updates localStorage and syncs a play count to remote.
 */
export async function recordTrackPlay(game, trackId) {
    const played = getPlayedTrackIds();
    played.add(trackId);
    savePlayedTrackIds(played);
    // Sync to remote
    const room = game._builderRoom || null;
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('track_plays');
            await coll.create({
                trackId,
                playerId: game._builderPlayerId || 'anonymous',
                playedAt: Date.now()
            });
        } catch (e) {
            console.warn('Failed to sync play count to remote', e);
        }
    }
}

/**
 * Build a map of trackId → playCount from the remote track_plays collection.
 */
function getTrackPlayCounts(game) {
    const counts = {};
    const room = game._builderRoom || null;
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('track_plays');
            const list = coll.getList() || [];
            for (const item of list) {
                if (item.trackId) {
                    counts[item.trackId] = (counts[item.trackId] || 0) + 1;
                }
            }
        } catch (e) {}
    }
    return counts;
}

/**
 * Build a map of trackId → 24h playCount from the remote track_plays collection.
 */
function getTrackPlaysLast24h(game) {
    const counts = {};
    const cutoff = Date.now() - 86400000; // 24 hours ago
    const room = game._builderRoom || null;
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('track_plays');
            const list = coll.getList() || [];
            for (const item of list) {
                if (item.trackId && item.playedAt && item.playedAt > cutoff) {
                    counts[item.trackId] = (counts[item.trackId] || 0) + 1;
                }
            }
        } catch (e) {}
    }
    return counts;
}

/**
 * Render a scrollable modal for community track browsing.
 * Shows/hides the existing builder sidebar without destroying its DOM,
 * so event handlers survive the modal open/close cycle.
 */
export function renderCommunityModal(game, list, mode = 'builder') {
    const overlay = document.getElementById('overlay');
    if (!overlay) { alert('UI error — overlay not found.'); return; }

    const isBuilder = mode === 'builder';

    // Filter out broken tracks (no parts)
    const validTracks = list.filter(t => t.parts && Array.isArray(t.parts) && t.parts.length > 0);
    if (validTracks.length === 0) {
        alert('No valid community tracks found. Be the first to share one!');
        return;
    }

    // Hide the builder sidebar if present (preserving DOM + event handlers)
    const sidebar = document.getElementById('builder-sidebar');
    if (sidebar) sidebar.style.display = 'none';

    // Ensure overlay is visible and centered
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '20px';

    const modal = document.createElement('div');
    modal.id = 'community-track-modal';
    modal.style.cssText = `
        background:linear-gradient(180deg,rgba(20,20,35,0.98),rgba(15,15,25,0.98));
        border:2px solid rgba(136,68,255,0.4);border-radius:16px;
        padding:0;width:90%;max-width:480px;max-height:70vh;
        display:flex;flex-direction:column;
        box-shadow:0 8px 32px rgba(0,0,0,0.6);
        pointer-events:auto;
    `;

    const closeModal = () => {
        // Remove modal
        if (modal.parentNode) modal.parentNode.removeChild(modal);
        // Restore builder sidebar if it was hidden
        if (sidebar) sidebar.style.display = '';
        // Restore overlay: builder-friendly if in builder, hidden otherwise
        if (isBuilder) {
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'flex-start';
            overlay.style.justifyContent = 'flex-end';
            overlay.style.padding = '0';
        } else {
            overlay.style.display = 'none';
            overlay.style.alignItems = '';
            overlay.style.justifyContent = '';
            overlay.style.padding = '';
        }
        // Clean up listeners
        document.removeEventListener('keydown', escHandler);
        overlay.removeEventListener('click', bgHandler);
    };

    // Close on Escape
    const escHandler = (e) => {
        if (e.code === 'Escape') closeModal();
    };
    document.addEventListener('keydown', escHandler);

    // --- Like counts + liked set + ratings + play counts ---
    const likeCounts = getTrackLikes(game);
    const likedSet = getLikedTrackIds();
    const trackRatings = getTrackRatings(game);
    const playerRatings = getRatedTrackIds();
    const playCounts = getTrackPlayCounts(game);
    const plays24h = getTrackPlaysLast24h(game);
    let sortBy = 'latest'; // 'latest' | 'likes' | 'rating' | 'plays' | 'trending'

    // Store track list for detail view back navigation
    game._lastCommunityTrackList = list;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08);
        display:flex;justify-content:space-between;align-items:center;gap:8px;
    `;
    header.innerHTML = `
        <span style="color:#fff;font-weight:700;font-size:15px;font-family:'5x5dots',monospace;">🌍 COMMUNITY TRACKS</span>
        <span style="color:#888;font-size:10px;font-family:'Segoe UI',sans-serif;white-space:nowrap;">${validTracks.length} shared</span>
    `;
    // Sort dropdown
    const sortSelect = document.createElement('select');
    sortSelect.style.cssText = `
        background:rgba(255,255,255,0.06);color:#ccc;border:1px solid rgba(255,255,255,0.12);
        border-radius:6px;padding:3px 6px;font-size:10px;font-family:'Segoe UI',sans-serif;
        cursor:pointer;outline:none;
    `;
    sortSelect.innerHTML = `
        <option value="latest">Latest</option>
        <option value="trending">🔥 Trending 24h</option>
        <option value="likes">Most ❤️</option>
        <option value="rating">⭐ Top Rated</option>
        <option value="plays">▶ Most Played</option>
    `;
    sortSelect.addEventListener('change', () => {
        sortBy = sortSelect.value;
        renderTrackList();
    });
    header.appendChild(sortSelect);
    modal.appendChild(header);

    // --- Trending (24h) Section ---
    const trendingTracks = validTracks
        .filter(t => (plays24h[t.id] || 0) > 0)
        .sort((a, b) => (plays24h[b.id] || 0) - (plays24h[a.id] || 0))
        .slice(0, 5);

    if (trendingTracks.length > 0) {
        const trendingSection = document.createElement('div');
        trendingSection.style.cssText = 'padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.06);';
        trendingSection.innerHTML = `<div style="color:#ff8800;font-size:10px;font-weight:700;margin-bottom:6px;font-family:'Segoe UI',sans-serif;">\uD83D\uDD25 TRENDING (24H)</div>`;

        trendingTracks.forEach((t, idx) => {
            const p24 = plays24h[t.id] || 0;
            const rc = trackRatings[t.id];
            const avgStar = rc && rc.count > 0 ? '\u2605'.repeat(Math.round(rc.avg)) + ' ' + rc.avg.toFixed(1) : '';
            const trendingRow = document.createElement('div');
            trendingRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;border-radius:6px;transition:background 0.15s;font-family:Segoe UI,sans-serif;';
            trendingRow.innerHTML = `
                <span style="color:#ff8800;font-weight:700;font-size:11px;width:16px;text-align:right;">${idx + 1}</span>
                <div style="flex:1;min-width:0;">
                    <div style="color:#fff;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name || 'Unnamed'}</div>
                    <div style="color:#888;font-size:9px;">${t.author || 'anon'} \u00b7 ${avgStar}</div>
                </div>
                <span style="color:#ff8800;font-size:10px;font-weight:600;white-space:nowrap;">▶${p24}</span>
            `;
            trendingRow.addEventListener('mouseenter', () => { trendingRow.style.background = 'rgba(255,136,0,0.08)'; });
            trendingRow.addEventListener('mouseleave', () => { trendingRow.style.background = 'transparent'; });
            trendingRow.addEventListener('click', (e) => {
                e.stopPropagation();
                renderTrackDetail(game, t, { likeCounts, likedSet, trackRatings, playerRatings, playCounts, isBuilder, closeModal, renderTrackList });
            });
            trendingSection.appendChild(trendingRow);
        });
        modal.appendChild(trendingSection);
    }

    // Scrollable list
    const listEl = document.createElement('div');
    listEl.style.cssText = `
        flex:1;overflow-y:auto;padding:8px;
    `;
    modal.appendChild(listEl);

    const formatDate = (ts) => {
        if (!ts) return 'unknown';
        const now = Date.now();
        const diff = now - ts;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        return new Date(ts).toLocaleDateString();
    };

    const renderTrackList = () => {
        listEl.innerHTML = '';
        // Sort tracks
        const sorted = [...validTracks];
        if (sortBy === 'trending') {
            sorted.sort((a, b) => (plays24h[b.id] || 0) - (plays24h[a.id] || 0) || (playCounts[b.id] || 0) - (playCounts[a.id] || 0) || (b.sharedAt || 0) - (a.sharedAt || 0));
        } else if (sortBy === 'likes') {
            sorted.sort((a, b) => (likeCounts[b.id] || 0) - (likeCounts[a.id] || 0) || (b.sharedAt || 0) - (a.sharedAt || 0));
        } else if (sortBy === 'rating') {
            sorted.sort((a, b) => (trackRatings[b.id]?.avg || 0) - (trackRatings[a.id]?.avg || 0) || (trackRatings[b.id]?.count || 0) - (trackRatings[a.id]?.count || 0) || (b.sharedAt || 0) - (a.sharedAt || 0));
        } else if (sortBy === 'plays') {
            sorted.sort((a, b) => (playCounts[b.id] || 0) - (playCounts[a.id] || 0) || (b.sharedAt || 0) - (a.sharedAt || 0));
        } else {
            sorted.sort((a, b) => (b.sharedAt || 0) - (a.sharedAt || 0));
        }

        sorted.forEach((t) => {
            const lc = likeCounts[t.id] || 0;
            const isLiked = likedSet.has(t.id);

            const row = document.createElement('div');
            row.style.cssText = `
                display:flex;align-items:center;gap:10px;padding:10px 12px;
                border-radius:10px;cursor:pointer;
                border:1px solid rgba(255,255,255,0.05);
                margin-bottom:4px;transition:background 0.15s;
                font-family:'Segoe UI',sans-serif;
            `;
            row.addEventListener('mouseenter', () => { row.style.background = 'rgba(136,68,255,0.12)'; });
            row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
            row.addEventListener('click', (e) => {
                // Clicking the info section (track name) opens detail view
                if (e.target.closest && (e.target.closest('.track-info-name') || e.target.closest('.track-info'))) {
                    renderTrackDetail(game, t, { likeCounts, likedSet, trackRatings, playerRatings, playCounts, isBuilder, closeModal, renderTrackList });
                    return;
                }
                // Play arrow or rest of row — play/load the track
                if (!isBuilder && typeof game._playCommunityTrack === 'function') {
                    game._playCommunityTrack(t.parts, t.id);
                } else if (typeof game._builderLoadCommunityParts === 'function') {
                    game._builderLoadCommunityParts(t.parts);
                }
                closeModal();
            });

            // Like button
            const likeBtn = document.createElement('button');
            likeBtn.style.cssText = `
                flex-shrink:0;display:flex;align-items:center;gap:3px;
                background:transparent;border:1px solid rgba(255,80,80,0.25);
                border-radius:6px;padding:3px 7px;cursor:pointer;
                color:${isLiked ? '#ff5555' : '#888'};font-size:11px;
                transition:color 0.15s,border-color 0.15s;
                font-family:'Segoe UI',sans-serif;
            `;
            likeBtn.innerHTML = `${isLiked ? '❤️' : '🤍'} <span style="font-size:10px;">${lc || ''}</span>`;
            likeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isLiked) {
                    unlikeTrack(game, t.id);
                    likedSet.delete(t.id);
                    likeCounts[t.id] = Math.max(0, (likeCounts[t.id] || 1) - 1);
                } else {
                    likeTrack(game, t.id);
                    likedSet.add(t.id);
                    likeCounts[t.id] = (likeCounts[t.id] || 0) + 1;
                }
                renderTrackList();
            });
            likeBtn.addEventListener('mouseenter', () => {
                if (!isLiked) { likeBtn.style.color = '#ff8888'; likeBtn.style.borderColor = 'rgba(255,80,80,0.5)'; }
            });
            likeBtn.addEventListener('mouseleave', () => {
                if (!isLiked) { likeBtn.style.color = '#888'; likeBtn.style.borderColor = 'rgba(255,80,80,0.25)'; }
            });
            row.appendChild(likeBtn);

            // Star rating widget
            const ratingWrap = document.createElement('div');
            ratingWrap.style.cssText = 'flex-shrink:0;display:flex;align-items:center;gap:1px;';
            for (let s = 1; s <= 5; s++) {
                const star = document.createElement('span');
                star.textContent = s <= playerRating ? '★' : '☆';
                star.style.cssText = `
                    font-size:12px;cursor:pointer;transition:color 0.1s;
                    color:${s <= playerRating ? '#ffcc00' : '#555'};
                    user-select:none;
                `;
                star.addEventListener('mouseenter', () => { star.style.color = '#ffcc00'; });
                star.addEventListener('mouseleave', () => { star.style.color = s <= playerRating ? '#ffcc00' : '#555'; });
                star.addEventListener('click', (e) => {
                    e.stopPropagation();
                    rateTrack(game, t.id, s);
                    playerRatings[t.id] = s;
                    renderTrackList();
                });
                ratingWrap.appendChild(star);
            }
            row.appendChild(ratingWrap);

            // Track info (clickable to open detail view)
            const info = document.createElement('div');
            info.className = 'track-info';
            info.style.cssText = 'flex:1;min-width:0;cursor:pointer;';
            const rc = trackRatings[t.id];
            const pc = playCounts[t.id] || 0;
            const avgStars = rc && rc.count > 0 ? rc.avg.toFixed(1) : '\u2014';
            const starCount = rc && rc.count > 0 ? Math.round(rc.avg) : 0;
            const playerRating = playerRatings[t.id] || 0;
            const starDisplay = '\u2605'.repeat(starCount) + '\u2606'.repeat(5 - starCount);
            info.innerHTML = `
                <div class="track-info-name" style="color:#fff;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;">${t.name || 'Unnamed Track'}</div>
                <div style="color:#888;font-size:10px;margin-top:2px;">
                    by ${t.author || 'anon'} · ${t.partCount || '?'} parts · ${formatDate(t.sharedAt)}
                </div>
                <div style="display:flex;gap:8px;margin-top:3px;align-items:center;">
                    <span style="color:#ffcc00;font-size:10px;letter-spacing:1px;">${starDisplay}</span>
                    <span style="color:#888;font-size:9px;">${avgStars} (${rc?.count || 0})</span>
                    <span style="color:#666;font-size:9px;">▶ ${pc}</span>
                </div>
            `;
            row.appendChild(info);

            // Play arrow
            const arrow = document.createElement('div');
            arrow.style.cssText = 'color:#9944ff;font-size:18px;flex-shrink:0;';
            arrow.innerText = '▶';
            row.appendChild(arrow);

            listEl.appendChild(row);
        });
    };

    renderTrackList();

    // Footer with track count summary
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding:10px 18px;border-top:1px solid rgba(255,255,255,0.08);
        display:flex;justify-content:space-between;align-items:center;
    `;
    const summary = document.createElement('span');
    summary.style.cssText = 'color:#666;font-size:10px;font-family:\'Segoe UI\',sans-serif;';
    const totalParts = validTracks.reduce((s, t) => s + (t.partCount || 0), 0);
    summary.innerText = `${validTracks.length} tracks · ${totalParts} total parts`;
    footer.appendChild(summary);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'menu-btn';
    closeBtn.style.cssText = 'font-size:10px;padding:6px 14px;';
    closeBtn.innerText = '✕ CLOSE';
    closeBtn.addEventListener('click', closeModal);
    footer.appendChild(closeBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);

    // Close on overlay background click (cleaned up in closeModal)
    const bgHandler = (e) => {
        if (e.target === overlay) {
            e.stopPropagation();
            closeModal();
        }
    };
    overlay.addEventListener('click', bgHandler);
}

/**
 * Render a detailed track view inside the community modal.
 * Shows full rating breakdown (histogram), play history, author info, and action buttons.
 */
function renderTrackDetail(game, track, ctx) {
    const { likeCounts, likedSet, trackRatings, playerRatings, playCounts, isBuilder, closeModal, renderTrackList } = ctx;
    const overlay = document.getElementById('overlay');
    if (!overlay) return;

    // Find the modal and replace its content with the detail view
    const existingModal = document.getElementById('community-track-modal');
    if (!existingModal) return;

    const t = track;
    const rc = trackRatings[t.id];
    const lc = likeCounts[t.id] || 0;
    const pc = playCounts[t.id] || 0;
    const isLiked = likedSet.has(t.id);
    const myRating = playerRatings[t.id] || 0;
    const avgStars = rc && rc.count > 0 ? rc.avg.toFixed(1) : '\u2014';
    const starCount = rc && rc.count > 0 ? Math.round(rc.avg) : 0;

    // Build rating histogram from remote ratings
    const histogram = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
    const room = game._builderRoom || null;
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('track_ratings');
            const list = coll.getList() || [];
            for (const item of list) {
                if (item.trackId === t.id && typeof item.rating === 'number') {
                    const bucket = Math.max(1, Math.min(5, Math.round(item.rating))) - 1;
                    histogram[bucket]++;
                }
            }
        } catch (e) {}
    }
    const maxBar = Math.max(1, ...histogram);

    // Build play history from remote plays (grouped by hour buckets)
    const playTimestamps = [];
    if (room && room.isReady && typeof room.collection === 'function') {
        try {
            const coll = room.collection('track_plays');
            const list = coll.getList() || [];
            for (const item of list) {
                if (item.trackId === t.id && item.playedAt) {
                    playTimestamps.push(item.playedAt);
                }
            }
        } catch (e) {}
    }
    // Group into 24h buckets for the last 7 days
    const now = Date.now();
    const DAY = 86400000;
    const buckets = [];
    for (let d = 6; d >= 0; d--) {
        const dayStart = now - (d + 1) * DAY;
        const dayEnd = now - d * DAY;
        const count = playTimestamps.filter(ts => ts > dayStart && ts <= dayEnd).length;
        const label = new Date(dayEnd).toLocaleDateString(undefined, { weekday: 'short' });
        buckets.push({ label, count });
    }
    const maxPlays = Math.max(1, ...buckets.map(b => b.count));

    // Part type breakdown
    const partTypes = {};
    if (t.parts && Array.isArray(t.parts)) {
        for (const p of t.parts) {
            partTypes[p.partKey] = (partTypes[p.partKey] || 0) + 1;
        }
    }
    const partTypeEntries = Object.entries(partTypes).sort((a, b) => b[1] - a[1]);

    const formatDate = (ts) => {
        if (!ts) return 'unknown';
        return new Date(ts).toLocaleDateString() + ' ' + new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    };

    // Clear existing modal content and build detail view
    existingModal.innerHTML = '';
    existingModal.style.cssText = `
        background:linear-gradient(180deg,rgba(20,20,35,0.98),rgba(15,15,25,0.98));
        border:2px solid rgba(136,68,255,0.4);border-radius:16px;
        padding:0;width:90%;max-width:520px;max-height:80vh;
        display:flex;flex-direction:column;
        box-shadow:0 8px 32px rgba(0,0,0,0.6);
        pointer-events:auto;
    `;

    // Back button + title header
    const detailHeader = document.createElement('div');
    detailHeader.style.cssText = 'padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px;';
    detailHeader.innerHTML = `
        <button class="menu-btn detail-back-btn" style="font-size:10px;padding:4px 8px;">\u2190 Back</button>
        <span style="color:#fff;font-weight:700;font-size:14px;font-family:'5x5dots',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name || 'Unnamed Track'}</span>
    `;
    existingModal.appendChild(detailHeader);

    // Scrollable detail body
    const body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;padding:16px 18px;';

    // --- Author & Meta ---
    const metaSection = document.createElement('div');
    metaSection.style.cssText = 'margin-bottom:16px;';
    metaSection.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
                <div style="color:#aaa;font-size:11px;">Created by</div>
                <div style="color:#fff;font-size:13px;font-weight:600;">${t.author || 'anonymous'}</div>
            </div>
            <div style="text-align:right;">
                <div style="color:#aaa;font-size:11px;">Shared</div>
                <div style="color:#fff;font-size:12px;">${formatDate(t.sharedAt)}</div>
            </div>
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;color:#888;font-size:11px;">
            <span>${t.partCount || 0} parts</span>
            <span>${lc} likes</span>
            <span>${pc} plays</span>
        </div>
    `;
    body.appendChild(metaSection);

    // --- Star Rating Section ---
    const ratingSection = document.createElement('div');
    ratingSection.style.cssText = 'margin-bottom:16px;background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;';
    ratingSection.innerHTML = `
        <div style="color:#aaa;font-size:11px;margin-bottom:8px;font-weight:600;">RATINGS</div>
    `;
    // Average display
    const avgRow = document.createElement('div');
    avgRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:10px;';
    avgRow.innerHTML = `
        <span style="color:#ffcc00;font-size:28px;font-weight:700;font-family:'5x5dots',monospace;">${avgStars}</span>
        <div>
            <span style="color:#ffcc00;font-size:14px;letter-spacing:2px;">${'\u2605'.repeat(starCount)}${'\u2606'.repeat(5 - starCount)}</span>
            <div style="color:#888;font-size:10px;margin-top:2px;">${rc?.count || 0} ratings</div>
        </div>
    `;
    ratingSection.appendChild(avgRow);
    // Histogram bars
    for (let i = 4; i >= 0; i--) {
        const barRow = document.createElement('div');
        barRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;';
        const pct = maxBar > 0 ? (histogram[i] / maxBar) * 100 : 0;
        barRow.innerHTML = `
            <span style="color:#888;font-size:10px;width:14px;text-align:right;">${i + 1}\u2605</span>
            <div style="flex:1;height:10px;background:rgba(255,255,255,0.06);border-radius:5px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#ffcc00,#ff8800);border-radius:5px;transition:width 0.3s;"></div>
            </div>
            <span style="color:#666;font-size:9px;width:20px;">${histogram[i]}</span>
        `;
        ratingSection.appendChild(barRow);
    }
    // Your rating
    const myRatingRow = document.createElement('div');
    myRatingRow.style.cssText = 'margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px;';
    myRatingRow.innerHTML = `<span style="color:#aaa;font-size:10px;">Your rating:</span>`;
    for (let s = 1; s <= 5; s++) {
        const star = document.createElement('span');
        star.textContent = s <= myRating ? '\u2605' : '\u2606';
        star.style.cssText = `font-size:16px;cursor:pointer;color:${s <= myRating ? '#ffcc00' : '#555'};transition:color 0.1s;user-select:none;`;
        star.addEventListener('mouseenter', () => { star.style.color = '#ffcc00'; });
        star.addEventListener('mouseleave', () => { star.style.color = s <= myRating ? '#ffcc00' : '#555'; });
        star.addEventListener('click', () => {
            rateTrack(game, t.id, s);
            playerRatings[t.id] = s;
            renderTrackDetail(game, track, ctx);
        });
        myRatingRow.appendChild(star);
    }
    ratingSection.appendChild(myRatingRow);
    body.appendChild(ratingSection);

    // --- Play History (last 7 days) ---
    const playSection = document.createElement('div');
    playSection.style.cssText = 'margin-bottom:16px;background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;';
    playSection.innerHTML = `
        <div style="color:#aaa;font-size:11px;margin-bottom:8px;font-weight:600;">PLAY HISTORY (7 DAYS)</div>
    `;
    const chartContainer = document.createElement('div');
    chartContainer.style.cssText = 'display:flex;align-items:flex-end;gap:4px;height:60px;';
    for (const bucket of buckets) {
        const col = document.createElement('div');
        col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;';
        const barH = maxPlays > 0 ? (bucket.count / maxPlays) * 40 : 0;
        col.innerHTML = `
            <span style="color:#888;font-size:8px;">${bucket.count || ''}</span>
            <div style="width:100%;height:${Math.max(2, barH)}px;background:linear-gradient(0deg,rgba(136,68,255,0.6),rgba(136,68,255,0.3));border-radius:3px 3px 0 0;min-height:2px;transition:height 0.3s;"></div>
            <span style="color:#666;font-size:8px;">${bucket.label}</span>
        `;
        chartContainer.appendChild(col);
    }
    playSection.appendChild(chartContainer);
    body.appendChild(playSection);

    // --- Part Type Breakdown ---
    if (partTypeEntries.length > 0) {
        const partsSection = document.createElement('div');
        partsSection.style.cssText = 'margin-bottom:16px;background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;';
        partsSection.innerHTML = `
            <div style="color:#aaa;font-size:11px;margin-bottom:8px;font-weight:600;">PART BREAKDOWN</div>
        `;
        const maxPartCount = Math.max(1, partTypeEntries[0][1]);
        for (const [key, count] of partTypeEntries.slice(0, 8)) {
            const pct = (count / maxPartCount) * 100;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;';
            row.innerHTML = `
                <span style="color:#ccc;font-size:10px;width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${key}</span>
                <div style="flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#4488ff,#44aaff);border-radius:4px;"></div>
                </div>
                <span style="color:#888;font-size:9px;width:20px;text-align:right;">${count}</span>
            `;
            partsSection.appendChild(row);
        }
        body.appendChild(partsSection);
    }

    // --- Action Buttons ---
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;';
    // Like button
    const likeBtn = document.createElement('button');
    likeBtn.className = 'menu-btn';
    likeBtn.style.cssText = `font-size:11px;padding:6px 12px;background:${isLiked ? 'rgba(255,80,80,0.3)' : 'transparent'};border-color:${isLiked ? '#ff5555' : 'rgba(255,255,255,0.15)'};`;
    likeBtn.innerHTML = `${isLiked ? '\u2764\ufe0f' : '\u2b1c'} Like (${lc})`;
    likeBtn.addEventListener('click', () => {
        if (isLiked) { unlikeTrack(game, t.id); likedSet.delete(t.id); likeCounts[t.id] = Math.max(0, (likeCounts[t.id] || 1) - 1); }
        else { likeTrack(game, t.id); likedSet.add(t.id); likeCounts[t.id] = (likeCounts[t.id] || 0) + 1; }
        renderTrackDetail(game, track, ctx);
    });
    actions.appendChild(likeBtn);
    // Play button
    const playBtn = document.createElement('button');
    playBtn.className = 'menu-btn';
    playBtn.style.cssText = 'font-size:11px;padding:6px 12px;background:rgba(0,180,0,0.3);border-color:#44ff44;';
    playBtn.textContent = '\u25b6 Play';
    playBtn.addEventListener('click', () => {
        if (!isBuilder && typeof game._playCommunityTrack === 'function') {
            game._playCommunityTrack(t.parts, t.id);
        } else if (typeof game._builderLoadCommunityParts === 'function') {
            game._builderLoadCommunityParts(t.parts);
        }
        closeModal();
    });
    actions.appendChild(playBtn);
    // Load into builder button (if in builder mode)
    if (isBuilder) {
        const loadBtn = document.createElement('button');
        loadBtn.className = 'menu-btn';
        loadBtn.style.cssText = 'font-size:11px;padding:6px 12px;background:rgba(100,40,180,0.3);border-color:#9944ff;';
        loadBtn.textContent = '\U0001f4c2 Load';
        loadBtn.addEventListener('click', () => {
            if (typeof game._builderLoadCommunityParts === 'function') game._builderLoadCommunityParts(t.parts);
            closeModal();
        });
        actions.appendChild(loadBtn);
    }
    body.appendChild(actions);

    existingModal.appendChild(body);

    // Wire back button
    const backBtn = existingModal.querySelector('.detail-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            existingModal.innerHTML = '';
            // Rebuild the list modal
            const listContainer = document.createElement('div');
            listContainer.id = 'community-track-modal';
            existingModal.parentNode && existingModal.parentNode.replaceChild(listContainer, existingModal);
            renderCommunityModal(game, game._lastCommunityTrackList || [], isBuilder ? 'builder' : 'play');
        });
    }
}

/**
 * Dispose multiplayer sync.
 */
export function disposeBuilderMultiplayer(game) {
    game._builderSync = null;
}
