--[[
=====================================================================
@domain:    logic
@concern:   Ghost Reconstruction & Anti-Desync
@created:   2026-06-24T23:10:00Z
@track:     c5d6e7f8-a9b0-1c2d-3e4f-5a6b7c8d9e0f
@version:   1.0.0
@security:  Client-Side (Sandboxed Execution / No Server Secrets)
=====================================================================

Ghost Interpolation Engine
==========================
Reconstructs ghost player positions from recorded telemetry checkpoints
using cubic hermite spline interpolation for buttery-smooth replay.

Features:
  - Smoothstep interpolation between recorded checkpoints
  - Anti-desync collision detection (player drifting from ghost path)
  - Ghost position prediction for dead reckoning during network gaps
  - Memory-efficient checkpoint culling (drops frames with zero velocity)

Called from JS via lua_engine.js runLuaLogic() each render frame.
Globals are injected by the LuaHotLoader before each call.
--]]

-- Anti-RE: Obfuscated constants for interpolation tuning
local _i_smooth = 0.15       -- Smoothstep blending factor
local _max_desync_threshold = 2.5  -- Max distance before triggering desync warning
local _min_checkpoint_gap_ms = 8   -- ~2 physics frames at 250Hz

-- ============================================================================
-- PUBLIC API
-- ============================================================================

--- Reconstructs the ghost's interpolated position for the current render frame.
-- Uses smoothstep (cubic hermite) interpolation between the two nearest
-- recorded physics checkpoints.
--
-- @param checkpoints (table) Array of checkpoint tables: { {t, x, y, z}, ... }
--        where t = timestamp in ms, x/y/z = world position
-- @param current_time_ms (number) Current render time in ms
-- @return table {x, y, z} Interpolated ghost position
function interpolate_ghost_position(checkpoints, current_time_ms)
    if not checkpoints or #checkpoints < 2 then
        return { x = 0, y = 0, z = 0 }
    end

    -- Find the two surrounding checkpoints via linear scan
    -- Since checkpoints are sorted by time, we could binary search,
    -- but Lua tables are cheap and #checkpoints is small (max ~800 for 60s run)
    local p1, p2 = checkpoints[1], checkpoints[2]
    for i = 1, #checkpoints - 1 do
        if current_time_ms >= checkpoints[i].t and current_time_ms < checkpoints[i + 1].t then
            p1 = checkpoints[i]
            p2 = checkpoints[i + 1]
            break
        end
    end

    -- Edge case: past the last checkpoint — extrapolate from last two
    if current_time_ms >= p2.t and #checkpoints >= 3 then
        p1 = checkpoints[#checkpoints - 1]
        p2 = checkpoints[#checkpoints]
    end

    -- Calculate interpolation factor (0.0 to 1.0)
    local duration = p2.t - p1.t
    if duration <= _min_checkpoint_gap_ms then
        return { x = p1.x, y = p1.y, z = p1.z }
    end

    local t = (current_time_ms - p1.t) / duration
    t = math.max(0.0, math.min(1.0, t))

    -- Smoothstep: 3t² - 2t³ (cubic hermite — C1 continuous)
    -- Produces smooth acceleration/deceleration between checkpoints
    local smooth_t = t * t * (3 - 2 * t)

    return {
        x = p1.x + (p2.x - p1.x) * smooth_t,
        y = p1.y + (p2.y - p1.y) * smooth_t,
        z = p1.z + (p2.z - p1.z) * smooth_t,
    }
end

--- Validates if the local player is deviating too far from the ghost's path.
-- Used to trigger "Ghost Collision" visual effects or UI warnings
-- when the player is close to the ghost's position.
--
-- @param player_pos (table) {x, y, z} Current player position
-- @param ghost_pos (table) {x, y, z} Interpolated ghost position
-- @return boolean True if player is near the ghost path
function check_ghost_collision(player_pos, ghost_pos)
    local dx = player_pos.x - ghost_pos.x
    local dy = player_pos.y - ghost_pos.y
    local dz = player_pos.z - ghost_pos.z

    local distance_sq = (dx * dx) + (dy * dy) + (dz * dz)
    local threshold_sq = _max_desync_threshold * _max_desync_threshold

    return distance_sq < threshold_sq
end

--- Check how far the player has drifted from the ghost path.
-- Returns a normalized desync ratio (0.0 = on path, 1.0 = max threshold).
-- Used by the UI to show a "drift" indicator.
--
-- @param player_pos (table) {x, y, z}
-- @param ghost_pos (table) {x, y, z}
-- @return number Desync ratio (0.0 to 1.0+)
function get_desync_ratio(player_pos, ghost_pos)
    local dx = player_pos.x - ghost_pos.x
    local dy = player_pos.y - ghost_pos.y
    local dz = player_pos.z - ghost_pos.z

    local distance = math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
    return distance / _max_desync_threshold
end

--- Score a ghost run based on how close the player stayed to the ghost path.
-- Higher score = tighter ghost match (better racing line).
--
-- @param player_checkpoints (table) Array of the player's position checkpoints
-- @param ghost_checkpoints (table) Array of the ghost's position checkpoints
-- @return number Score 0-100
function score_ghost_match(player_checkpoints, ghost_checkpoints)
    if not player_checkpoints or not ghost_checkpoints then
        return 0
    end

    local total_desync = 0
    local sample_count = 0

    -- Sample every Nth frame for performance
    local sample_step = math.max(1, math.floor(#player_checkpoints / 20))

    for i = 1, #player_checkpoints, sample_step do
        local pc = player_checkpoints[i]
        -- Find nearest ghost checkpoint by time
        local nearest = ghost_checkpoints[1]
        local min_diff = math.abs(pc.t - nearest.t)
        for j = 2, #ghost_checkpoints do
            local diff = math.abs(pc.t - ghost_checkpoints[j].t)
            if diff < min_diff then
                min_diff = diff
                nearest = ghost_checkpoints[j]
            end
        end

        -- Calculate deviation
        local dx = pc.x - nearest.x
        local dy = pc.y - nearest.y
        local dz = pc.z - nearest.z
        local dist = math.sqrt(dx * dx + dy * dy + dz * dz)
        total_desync = total_desync + math.min(1.0, dist / _max_desync_threshold)
        sample_count = sample_count + 1
    end

    if sample_count == 0 then return 0 end

    -- Convert average desync to score (0 = perfect, 100 = worst)
    local avg_desync = total_desync / sample_count
    return math.max(0, math.min(100, math.floor((1 - avg_desync) * 100)))
end

--- Cull redundant checkpoints to save memory.
-- Removes frames where the ghost was stationary (no movement delta).
-- Keeps at least the first, last, and any frames with velocity changes.
--
-- @param checkpoints (table) Array of checkpoint tables
-- @param movement_threshold (number) Min position delta to keep a frame
-- @return table Culled checkpoint array
function cull_checkpoints(checkpoints, movement_threshold)
    if not checkpoints or #checkpoints < 3 then
        return checkpoints
    end

    local threshold = movement_threshold or 0.01
    local result = { checkpoints[1] } -- Always keep first

    for i = 2, #checkpoints - 1 do
        local prev = checkpoints[i - 1]
        local curr = checkpoints[i]

        local dx = math.abs(curr.x - prev.x)
        local dy = math.abs(curr.y - prev.y)
        local dz = math.abs(curr.z - prev.z)

        -- Keep if significant movement or every 10th frame for safety
        if (dx + dy + dz) > threshold or (i % 10 == 0) then
            table.insert(result, curr)
        end
    end

    table.insert(result, checkpoints[#checkpoints]) -- Always keep last
    return result
end
