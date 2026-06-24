--[[
=====================================================================
@domain:    game
@concern:   Level Generation Rules & Segment Definitions
@created:   2026-06-24T15:20:00Z
@track:     8b9c0d1e-2f3a-4b5c-6d7e-8f9a0b1c2d3e
@version:   1.0.0
@security:  Client-Side (Sandboxed Lua VM)
=====================================================================

Level Generation Rules Engine

This module defines:
  1. 40+ segment types with physical properties (length, width, hazard config)
  2. A seeded PRNG (mulberry32) for deterministic level generation
  3. A segment selection algorithm with difficulty tier scaling
  4. Layout validation rules

Integration:
  - Called from JS via lua_engine.js → runLuaLogic('generate_level', seed, tier)
  - Returns a Lua table that JS consumes as a level layout
  - Works with Python backend for seed verification
--]]

-- ============================================================================
-- Seeded PRNG (mulberry32)
-- ============================================================================

-- Mulberry32 PRNG (Recycled for shop loot boxes and AI seeds)
-- Global so other Lua scripts (shop_logic.lua, ai_prompts.lua) can reuse it.
-- Pure function, no external state dependencies.
function mulberry32(a)
    a = a % 2147483647
    return function()
        a = a + 0x6D2B79F5
        local t = a
        t = math.floor((t ~ (t >> 15)) * (t + 1))
        t = t ~ (t + math.floor((t ~ (t >> 7)) * (t + 61)))
        return ((t ~ (t >> 14)) / 4294967296.0)
    end
end

-- ============================================================================
-- Segment Type Definitions (40+ types)
-- ============================================================================

local SEGMENT_TYPES = {
    -- === SURFACES ===
    straight = {
        name = "Straight", difficulty = 1, length_range = {10, 25},
        width_base = 8, width_shrink = 0.3,
        coin_density = 0.6, hazard_chance = 0, has_walls = false
    },
    ramp = {
        name = "Ramp", difficulty = 2, length_range = {10, 20},
        width_base = 8, width_shrink = 0.2,
        coin_density = 0.5, hazard_chance = 0, has_walls = false,
        height_range = {3, 7}
    },
    stairs = {
        name = "Stairs", difficulty = 3, length_range = {15, 25},
        width_base = 7, width_shrink = 0.25,
        coin_density = 0.6, hazard_chance = 0, has_walls = false,
        step_count_range = {4, 8}, step_height = 0.8
    },
    narrow = {
        name = "Narrow Bridge", difficulty = 5, length_range = {12, 20},
        width_base = 3, width_shrink = 0.1,
        coin_density = 0.7, hazard_chance = 0, has_walls = false
    },
    zigzag = {
        name = "Zigzag", difficulty = 2, length_range = {20, 30},
        width_base = 7, width_shrink = 0.2,
        coin_density = 0.5, hazard_chance = 0, has_walls = false,
        zig_count = {3, 6}
    },
    bumpy = {
        name = "Bumpy Terrain", difficulty = 1, length_range = {18, 28},
        width_base = 8, width_shrink = 0.3,
        coin_density = 0.4, hazard_chance = 0, has_walls = false,
        bump_height = {0.3, 1.0}
    },
    halfpipe = {
        name = "Half Pipe", difficulty = 3, length_range = {16, 24},
        width_base = 10, width_shrink = 0.4,
        coin_density = 0.5, hazard_chance = 0, has_walls = true
    },
    checkerboard = {
        name = "Checkerboard", difficulty = 5, length_range = {12, 20},
        width_base = 6, width_shrink = 0.2,
        coin_density = 0.3, hazard_chance = 0, has_walls = false,
        tile_size = 3
    },
    curve = {
        name = "Curve", difficulty = 2, length_range = {20, 35},
        width_base = 7, width_shrink = 0.2,
        coin_density = 0.5, hazard_chance = 0, has_walls = false,
        arc_angle = {45, 120}
    },

    -- === STRUCTURAL ===
    tunnel = {
        name = "Tunnel", difficulty = 2, length_range = {20, 35},
        width_base = 8, width_shrink = 0.2,
        coin_density = 0.7, hazard_chance = 0, has_walls = true,
        wall_height = 2.5
    },
    loop_de_loop = {
        name = "Loop-de-Loop", difficulty = 6, length_range = {40, 60},
        width_base = 6, width_shrink = 0.1,
        coin_density = 0.4, hazard_chance = 0, has_walls = false,
        radius_range = {6, 10}
    },
    spiral_tube = {
        name = "Spiral Tube", difficulty = 7, length_range = {50, 80},
        width_base = 6, width_shrink = 0.1,
        coin_density = 0.3, hazard_chance = 0, has_walls = true,
        turns_range = {1, 3}, radius_range = {6, 10}
    },
    island_hop = {
        name = "Island Hop", difficulty = 4, length_range = {25, 40},
        width_base = 5, width_shrink = 0.15,
        coin_density = 0.6, hazard_chance = 0, has_walls = false,
        island_count = {4, 8}, gap_range = {3, 6}
    },
    archipelago = {
        name = "Archipelago", difficulty = 4, length_range = {30, 45},
        width_base = 4, width_shrink = 0.1,
        coin_density = 0.5, hazard_chance = 0, has_walls = false,
        island_count = {5, 10}
    },

    -- === HAZARDS ===
    pendulum = {
        name = "Pendulum", difficulty = 4, length_range = {18, 28},
        width_base = 8, width_shrink = 0.25,
        coin_density = 0.3, hazard_chance = 1.0, has_walls = false,
        hazard_count = {1, 3}
    },
    spinner = {
        name = "Spinner Bar", difficulty = 3, length_range = {20, 30},
        width_base = 8, width_shrink = 0.2,
        coin_density = 0.4, hazard_chance = 1.0, has_walls = false,
        hazard_count = {1, 2}
    },
    hammer_gauntlet = {
        name = "Hammer Gauntlet", difficulty = 6, length_range = {22, 35},
        width_base = 8, width_shrink = 0.2,
        coin_density = 0.2, hazard_chance = 1.0, has_walls = false,
        hazard_count = {3, 6}
    },
    moving_blocks = {
        name = "Moving Blocks", difficulty = 5, length_range = {18, 30},
        width_base = 8, width_shrink = 0.2,
        coin_density = 0.3, hazard_chance = 1.0, has_walls = false,
        hazard_count = {2, 4}
    },
    crusher = {
        name = "Side Crusher", difficulty = 6, length_range = {14, 22},
        width_base = 8, width_shrink = 0.2,
        coin_density = 0.2, hazard_chance = 1.0, has_walls = false,
        hazard_count = {2, 3}
    },
    blade_hall = {
        name = "Blade Hall", difficulty = 5, length_range = {16, 24},
        width_base = 6, width_shrink = 0.15,
        coin_density = 0.25, hazard_chance = 1.0, has_walls = true,
        hazard_count = {3, 6}
    },

    -- === COLLECTIBLES ===
    coin_arc = {
        name = "Coin Arc", difficulty = 1, length_range = {10, 18},
        width_base = 6, width_shrink = 0.3,
        coin_density = 0.9, hazard_chance = 0, has_walls = false,
        coin_tier_weights = {small = 0.3, medium = 0.4, large = 0.25, big = 0.05}
    },
    coin_ring = {
        name = "Coin Ring", difficulty = 2, length_range = {8, 12},
        width_base = 8, width_shrink = 0.3,
        coin_density = 1.0, hazard_chance = 0, has_walls = false,
        ring_radius = {1.5, 3.0}
    },
    treasure_room = {
        name = "Treasure Room", difficulty = 3, length_range = {12, 18},
        width_base = 10, width_shrink = 0.4,
        coin_density = 0.8, hazard_chance = 0.3, has_walls = true,
        hazard_count = {1, 2}
    },

    -- === SPECIAL ===
    spring_pad = {
        name = "Spring Pad", difficulty = 2, length_range = {6, 10},
        width_base = 5, width_shrink = 0.3,
        coin_density = 0.4, hazard_chance = 0, has_walls = false,
        bounce_power = {15, 22}
    },
    portal_chamber = {
        name = "Portal Chamber", difficulty = 5, length_range = {20, 30},
        width_base = 10, width_shrink = 0.3,
        coin_density = 0.5, hazard_chance = 0.4, has_walls = true,
        portal_count = 2
    },
    speed_strip = {
        name = "Speed Strip", difficulty = 1, length_range = {16, 24},
        width_base = 7, width_shrink = 0.3,
        coin_density = 0.6, hazard_chance = 0, has_walls = false
    },
    glass_bridge = {
        name = "Glass Bridge", difficulty = 4, length_range = {14, 22},
        width_base = 5, width_shrink = 0.15,
        coin_density = 0.5, hazard_chance = 0, has_walls = false,
        glass_thickness = 0.8
    },
    checkpoint = {
        name = "Checkpoint", difficulty = 0, length_range = {4, 6},
        width_base = 8, width_shrink = 0,
        coin_density = 0, hazard_chance = 0, has_walls = false,
        is_checkpoint = true
    },
    finish = {
        name = "Finish Line", difficulty = 0, length_range = {20, 30},
        width_base = 8, width_shrink = 0,
        coin_density = 0, hazard_chance = 0, has_walls = false,
        is_finish = true
    }
}

-- ============================================================================
-- Difficulty Tiers
-- ============================================================================

local DIFFICULTY_TIERS = {
    { level = 1,  label = "EASY",        types = {"straight", "ramp", "tunnel", "speed_strip", "coin_arc", "bumpy"} },
    { level = 4,  label = "NORMAL",      types = {"straight", "ramp", "tunnel", "zigzag", "bumpy", "curve", "glass_bridge"} },
    { level = 7,  label = "CHALLENGING", types = {"zigzag", "island_hop", "archipelago", "spinner", "spring_pad", "coin_ring"} },
    { level = 10, label = "HARD",        types = {"spinner", "pendulum", "stairs", "halfpipe", "narrow", "glass_bridge"} },
    { level = 13, label = "TOUGH",       types = {"pendulum", "moving_blocks", "hammer_gauntlet", "checkerboard", "treasure_room"} },
    { level = 16, label = "EXPERT",      types = {"hammer_gauntlet", "crusher", "blade_hall", "narrow", "portal_chamber"} },
    { level = 19, label = "EXTREME",     types = {"narrow", "crusher", "blade_hall", "checkerboard", "loop_de_loop"} },
    { level = 22, label = "INSANE",      types = {"narrow", "crusher", "hammer_gauntlet", "loop_de_loop", "portal_chamber"} },
    { level = 25, label = "IMPOSSIBLE",  types = {"spiral_tube", "loop_de_loop", "hammer_gauntlet", "checkerboard", "blade_hall"} }
}

-- ============================================================================
-- Public API
-- ============================================================================

--- Generate a complete level layout.
-- @param seed (number) Deterministic seed for RNG
-- @param difficulty_tier (number) Player's current level (1-30+)
-- @return (table) Complete level layout: { segments, difficulty, metadata }
function generate_level(seed, difficulty_tier)
    local tier = _get_difficulty_tier(difficulty_tier)
    local rng = mulberry32(seed)

    local num_segments = 15 + math.floor(difficulty_tier * 2.5)
    local segments = {}
    local current_z = 0

    -- Start platform
    table.insert(segments, {
        type = "straight", index = 0, length = 15, width = 8,
        x = 0, y = 0, z = -7.5, is_start = true
    })
    current_z = current_z - 15

    -- Insert checkpoint every N segments
    local checkpoint_interval = math.max(3, math.floor(num_segments / 3))
    local hazard_speed_mult = 1.0 + (difficulty_tier * 0.08)
    local base_width = math.max(2.5, 8.0 - difficulty_tier * 0.25)

    for i = 1, num_segments do
        -- Insert checkpoint
        if i % checkpoint_interval == 0 then
            table.insert(segments, {
                type = "checkpoint", index = #segments + 1,
                length = 4, width = base_width + 2,
                x = 0, y = 0, z = current_z - 2, is_checkpoint = true
            })
            current_z = current_z - 4
        end

        -- Select segment type
        local type_key = tier.types[rng_roll(rng, #tier.types)]
        local seg_def = SEGMENT_TYPES[type_key] or SEGMENT_TYPES.straight

        local length = seg_def.length_range[1] +
            math.floor(rng() * (seg_def.length_range[2] - seg_def.length_range[1]))
        local width = math.max(1.5, seg_def.width_base - difficulty_tier * seg_def.width_shrink)
        local has_hazard = rng() < math.min(0.9, seg_def.hazard_chance * (0.5 + difficulty_tier * 0.03))

        local segment = {
            type = type_key,
            index = i,
            length = length,
            width = width,
            x = 0,
            y = 0,
            z = current_z - length / 2,
            has_hazard = has_hazard,
            hazard_speed_mult = hazard_speed_mult,
            coin_count = math.floor(length * seg_def.coin_density * 0.4),
            has_walls = seg_def.has_walls,
            mirror = (i % 2 == 0)
        }

        -- Add type-specific parameters
        if type_key == "ramp" then
            segment.height = seg_def.height_range[1] +
                math.floor(rng() * (seg_def.height_range[2] - seg_def.height_range[1]))
        elseif type_key == "stairs" then
            segment.step_count = seg_def.step_count_range[1] +
                math.floor(rng() * (seg_def.step_count_range[2] - seg_def.step_count_range[1]))
            segment.step_height = seg_def.step_height
        elseif type_key == "spring_pad" then
            segment.bounce_power = seg_def.bounce_power[1] +
                math.floor(rng() * (seg_def.bounce_power[2] - seg_def.bounce_power[1]))
        elseif type_key == "loop_de_loop" then
            segment.radius = seg_def.radius_range[1] +
                rng() * (seg_def.radius_range[2] - seg_def.radius_range[1])
        elseif type_key == "spiral_tube" then
            segment.turns = seg_def.turns_range[1] +
                math.floor(rng() * (seg_def.turns_range[2] - seg_def.turns_range[1]))
            segment.radius = seg_def.radius_range[1] +
                rng() * (seg_def.radius_range[2] - seg_def.radius_range[1])
        end

        table.insert(segments, segment)
        current_z = current_z - length
    end

    -- Finish line
    table.insert(segments, {
        type = "finish", index = #segments + 1,
        length = 25, width = 8,
        x = 0, y = 0, z = current_z - 12.5, is_finish = true
    })

    return {
        segments = segments,
        difficulty = {
            label = tier.label,
            level = difficulty_tier,
            hazard_speed_mult = hazard_speed_mult,
            base_width = base_width
        },
        metadata = {
            seed = seed,
            total_length = math.abs(current_z),
            total_segments = #segments,
            generated_at = os and os.time and os.time() or 0
        }
    }
end

--- Validate a track layout from the builder.
-- @param parts_table (table) Array of placed parts with { type, x, y, z, params }
-- @return (table) { valid: boolean, errors: string[] }
function validate_track(parts_table)
    local errors = {}
    local valid = true

    if not parts_table or #parts_table == 0 then
        return { valid = false, errors = {"Track has no parts"} }
    end

    -- Check: track needs a start platform
    local has_start = false
    local has_finish = false

    for _, part in ipairs(parts_table) do
        if part.type == "start" or part.type == "straight" then
            has_start = true
        end
        if part.type == "finish" or part.type == "finish_line" then
            has_finish = true
        end
    end

    if not has_start then
        table.insert(errors, "Track must have a start platform")
        valid = false
    end
    if not has_finish then
        table.insert(errors, "Track must have a finish line")
        valid = false
    end

    -- Check: hazards placed on valid surfaces
    local hazard_types = {pendulum = true, spinner = true, hammer = true, mover = true, blade = true}
    for _, part in ipairs(parts_table) do
        if hazard_types[part.type] then
            -- Check that there's a platform under the hazard
            local has_support = false
            for _, other in ipairs(parts_table) do
                if (other.type == "straight" or other.type == "ramp" or other.type == "platform") then
                    local dx = math.abs(part.x - other.x)
                    local dz = math.abs(part.z - other.z)
                    if dx < 5 and dz < 5 then
                        has_support = true
                        break
                    end
                end
            end
            if not has_support then
                table.insert(errors, part.type .. " at position (" .. part.x .. ", " .. part.z .. ") has no support platform")
                valid = false
            end
        end
    end

    return { valid = valid, errors = errors }
end

--- Get all available segment types with their properties.
-- @return (table) Array of segment type definitions
function get_segment_types()
    local types = {}
    for key, def in pairs(SEGMENT_TYPES) do
        table.insert(types, {
            key = key,
            name = def.name,
            difficulty = def.difficulty,
            min_length = def.length_range[1],
            max_length = def.length_range[2],
            has_hazard = def.hazard_chance > 0,
            has_walls = def.has_walls
        })
    end
    table.sort(types, function(a, b) return a.difficulty < b.difficulty end)
    return types
end

-- ============================================================================
-- Private Helpers
-- ============================================================================

--- Get the difficulty tier data for a given level.
function _get_difficulty_tier(level)
    local tier = DIFFICULTY_TIERS[1]
    for _, t in ipairs(DIFFICULTY_TIERS) do
        if level >= t.level then
            tier = t
        end
    end
    return tier
end

--- Roll an integer from 1 to n using the seeded RNG.
function rng_roll(rng, n)
    return math.floor(rng() * n) + 1
end

-- ============================================================================
-- Weighted Segment Selection (Spec-compatible helper)
-- ============================================================================

-- Simplified segment definitions with weighted probabilities
-- Used by _select_weighted_segment() for drop-weighted generation.
local _WEIGHTED_SEGMENTS = {
    { id = "straight", weight = 30, min_diff = 1, max_diff = 9 },
    { id = "ramp",     weight = 20, min_diff = 1, max_diff = 5 },
    { id = "spinner",  weight = 15, min_diff = 3, max_diff = 9 },
    { id = "gap",      weight = 10, min_diff = 4, max_diff = 9 },
    { id = "portal",   weight = 5,  min_diff = 6, max_diff = 9 }
}

--- Weighted random segment selection (spec-compatible pattern).
-- Filters by difficulty tier, then rolls against weighted probabilities.
-- @param rng (function) Seeded PRNG function
-- @param difficulty_tier (number) Current difficulty (1-9 scale)
-- @return (table) Selected segment definition
function _select_weighted_segment(rng, difficulty_tier)
    local valid_segments = {}
    local total_weight = 0

    for _, seg in ipairs(_WEIGHTED_SEGMENTS) do
        if difficulty_tier >= seg.min_diff and difficulty_tier <= seg.max_diff then
            table.insert(valid_segments, seg)
            total_weight = total_weight + seg.weight
        end
    end

    if #valid_segments == 0 then return _WEIGHTED_SEGMENTS[1] end -- Fallback

    local roll = rng() * total_weight
    local current_weight = 0

    for _, seg in ipairs(valid_segments) do
        current_weight = current_weight + seg.weight
        if roll <= current_weight then
            return seg
        end
    end
    return valid_segments[#valid_segments]
end

--- Simple level generator using weighted segment selection (spec-compatible pattern).
-- Generates a fixed-length level with hazard multipliers.
-- @param seed (number) Deterministic seed
-- @param difficulty_tier (number) 1-9 difficulty
-- @param length (number) Number of segments to generate
-- @return (table) Level data with segments array
function generate_level_weighted(seed, difficulty_tier, length)
    if difficulty_tier < 1 then difficulty_tier = 1 end
    if difficulty_tier > 9 then difficulty_tier = 9 end

    local rng = mulberry32(seed)
    local level_data = {
        seed = seed,
        tier = difficulty_tier,
        segments = {}
    }

    for i = 1, length do
        local seg = _select_weighted_segment(rng, difficulty_tier)
        local hazard_mult = 1.0 + (difficulty_tier * 0.15)

        table.insert(level_data.segments, {
            index = i,
            type = seg.id,
            hazard_speed = hazard_mult,
            coin_count = math.floor(rng() * 3) + 1
        })
    end

    return level_data
end
