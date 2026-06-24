--[[
=====================================================================
@domain:    ai
@concern:   Dynamic Stable Diffusion Prompt Builder
@created:   2026-06-24T16:30:00Z
@track:     9f8e7d6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f
@version:   1.0.0
@security:  Client-Side (Logic Only / Prompt Generation)
=====================================================================

Dynamic AI Prompt Builder

Generates detailed system prompts for the Python Stable Diffusion backend.
Structured output enables ControlNet integration with configurable parameters.

Called from JS via:
  lua_engine.js → runLuaLogic('generate_technical_prompt', 'cabinet', 'blueprint')

Returns a table with:
  {
    positive_prompt: string,
    negative_prompt: string,
    controlnet_params: { strength, guidance_scale, steps }
  }

Styles reference real industry-standard SD prompting techniques.
--]]

-- ============================================================================
-- Style Definitions
-- ============================================================================

local STYLES = {
    -- === TECHNICAL / CAD ===
    blueprint = {
        name = "Technical Blueprint",
        artifact = "blueprint drawing",
        prefix = "extremely detailed technical blueprint, CAD line art, white lines on blue background, precise orthographic projection, engineering drawing, architectural plan, dimension lines, labeled parts, scale markings, ",
        suffix = "high contrast, vector-style, clean lines, 8k resolution, technical illustration",
        negative = "photograph, shading, gradient, shadow, realistic, 3d render, color, noise, blur, distortion, watermark, text overlay",
        controlnet = { strength = 0.95, guidance = 9.0, steps = 35 }
    },
    wireframe = {
        name = "Wireframe",
        artifact = "wireframe render",
        prefix = "clean wireframe render, white wireframe on black background, low poly, edge-only visualization, mesh topology, vertex points visible, ",
        suffix = "transparent background, sharp edges, minimal, technical, precise geometry",
        negative = "texture, color, shading, lighting, reflection, gradient, noise, blur, watermark, title, text",
        controlnet = { strength = 0.9, guidance = 7.5, steps = 30 }
    },
    schematic = {
        name = "Schematic Diagram",
        artifact = "schematic diagram",
        prefix = "detailed schematic diagram, black and white line art, circuit-like connections, functional block diagram, labeled nodes, flow arrows, ",
        suffix = "clean layout, organized, logical, technical, high resolution, vector graphics",
        negative = "raster, pixelated, blur, photograph, gradient, 3d render, artistic style, painting, noise, distortion",
        controlnet = { strength = 0.85, guidance = 8.0, steps = 30 }
    },

    -- === ARTISTIC ===
    sketch = {
        name = "Pencil Sketch",
        artifact = "pencil sketch",
        prefix = "hand-drawn pencil sketch, graphite on paper, rough edges, artistic shading, crosshatch texture, conceptual drawing, ",
        suffix = "natural paper texture, grayscale, organic lines, draft quality, artistic",
        negative = "photorealistic, photography, 3d render, digital art, smooth lines, vector, color, ink, marker, paint",
        controlnet = { strength = 0.7, guidance = 6.0, steps = 25 }
    },
    ink = {
        name = "Ink Drawing",
        artifact = "ink illustration",
        prefix = "black ink drawing, pen and ink on white paper, bold strokes, stippling, hatching, detailed linework, high contrast, ",
        suffix = "vintage illustration style, crisp lines, high resolution, editorial illustration",
        negative = "color, photography, 3d render, digital shading, blur, gradient, pencil, watercolor, paint, noise",
        controlnet = { strength = 0.8, guidance = 7.0, steps = 28 }
    },
    watercolor = {
        name = "Watercolor Painting",
        artifact = "watercolor painting",
        prefix = "watercolor painting, soft washes, wet-on-wet technique, paper texture showing through, gentle color bleed, transparent layers, ",
        suffix = "artistic, expressive, light colors, painterly, decorative, fine art",
        negative = "sharp lines, photorealistic, 3d render, dark shadows, heavy contrast, digital art, vector, harsh edges, text",
        controlnet = { strength = 0.5, guidance = 5.0, steps = 22 }
    },
    oil_painting = {
        name = "Oil Painting",
        artifact = "oil painting",
        prefix = "oil painting on canvas, impasto texture, visible brushstrokes, rich colors, dramatic chiaroscuro, classical composition, ",
        suffix = "gallery quality, fine art, textured, museum lighting, masterpiece, professional",
        negative = "photography, digital art, flat colors, cartoon, anime, vector, low resolution, noise, pixelation",
        controlnet = { strength = 0.6, guidance = 6.5, steps = 30 }
    },

    -- === DIGITAL / MODERN ===
    pixel_art = {
        name = "Pixel Art",
        artifact = "pixel art",
        prefix = "pixel art, 8-bit style, retro game graphics, limited color palette, blocky pixels, chunky resolution, ",
        suffix = "crisp pixel edges, nostalgic, game asset, sprite style, indexed colors",
        negative = "smooth gradients, anti-aliasing, 3d render, photography, blur, realistic, high resolution, oil paint, watercolor",
        controlnet = { strength = 0.75, guidance = 6.0, steps = 20 }
    },
    low_poly = {
        name = "Low Poly 3D",
        artifact = "low poly render",
        prefix = "low poly 3D model, faceted geometry, flat shading, polygon edges visible, minimal detail, video game asset style, ",
        suffix = "clean topology, triangulated mesh, vibrant colors, stylized, game-ready",
        negative = "smooth shading, high polygon, photorealistic, texture map, subdiv, smooth curves, realistic, blur",
        controlnet = { strength = 0.7, guidance = 7.0, steps = 25 }
    },
    vector_art = {
        name = "Vector Art",
        artifact = "vector illustration",
        prefix = "vector art, flat design, clean shapes, solid colors, no gradients, scalable graphics, modern illustration, ",
        suffix = "minimalist, professional, corporate style, crisp edges, vibrant, icon-like",
        negative = "gradient, texture, photograph, 3d, shadow, blur, noise, raster, paint, brushstroke, paper texture",
        controlnet = { strength = 0.8, guidance = 7.5, steps = 28 }
    },
    isometric = {
        name = "Isometric Render",
        artifact = "isometric render",
        prefix = "isometric view, 3/4 perspective, dimetric projection, clean geometric shapes, technical isometric illustration, ",
        suffix = "grid alignment, precise angles, organized composition, colorful, game asset style",
        negative = "perspective distortion, photograph, realistic shading, blur, noise, messy, organic shapes",
        controlnet = { strength = 0.85, guidance = 8.0, steps = 30 }
    },

    -- === REALISTIC ===
    photograph = {
        name = "Photograph",
        artifact = "photograph",
        prefix = "photorealistic, high resolution photograph, sharp focus, natural lighting, realistic textures, depth of field, ",
        suffix = "professional photography, 8k, detailed, realistic, cinematic, award-winning",
        negative = "drawing, painting, illustration, cartoon, 3d render, low resolution, blurry, sketch, anime, vector, art style",
        controlnet = { strength = 0.6, guidance = 5.5, steps = 40 }
    },
    product_shot = {
        name = "Product Shot",
        artifact = "product photography",
        prefix = "professional product photography, studio lighting, white background, clean presentation, commercial photography, ",
        suffix = "high resolution, detailed texture, realistic material, 360 view, catalog quality, sharp focus",
        negative = "sketch, drawing, painting, illustration, cartoon, cluttered background, shadow, noise, blur, watermark",
        controlnet = { strength = 0.65, guidance = 6.0, steps = 35 }
    },
    cinematic = {
        name = "Cinematic",
        artifact = "cinematic shot",
        prefix = "cinematic shot, film grain, dramatic lighting, anamorphic lens, cinematic composition, depth of field, epic, ",
        suffix = "movie poster quality, emotional, atmospheric, professional, 8k, golden hour lighting",
        negative = "amateur, low resolution, pixelated, distorting lens, flat lighting, documentary style, cheap, ugly",
        controlnet = { strength = 0.55, guidance = 6.5, steps = 35 }
    },

    -- === SPECIALIZED ===
    cross_section = {
        name = "Cross Section",
        artifact = "cross section diagram",
        prefix = "cross section view, cutaway diagram, internal structure visible, layered view, transparent outer shell, ",
        suffix = "labeled layers, educational diagram, technical, clean lines, clear organization, scientific illustration",
        negative = "external view only, photograph, artistic, chaotic, unlabeled, blur, noise, 3d render without cutaway",
        controlnet = { strength = 0.9, guidance = 8.5, steps = 35 }
    },
    exploded_view = {
        name = "Exploded View",
        artifact = "exploded view diagram",
        prefix = "exploded view, assembly diagram, parts separated along axis, bill of materials style, technical assembly guide, ",
        suffix = "clear spatial relationship, organized layout, technical illustration, labeled parts, dashed alignment lines",
        negative = "assembled view, photograph, artistic, chaotic, unlabeled, perspective distortion, blur",
        controlnet = { strength = 0.85, guidance = 8.0, steps = 35 }
    },
    texture = {
        name = "Texture Map",
        artifact = "texture map",
        prefix = "seamless texture, tileable pattern, PBR material, diffuse map, realistic surface detail, high resolution texture, ",
        suffix = "seamless repeat, square tile, uniform lighting, flat projection, material scan",
        negative = "narrative, perspective, 3d, lighting variation, depth of field, artistic style, people, text, watermark",
        controlnet = { strength = 0.5, guidance = 5.0, steps = 25 }
    }
}

-- ============================================================================
-- Material Definitions
-- ============================================================================

local MATERIALS = {
    wood = { prompt = "wood texture, natural grain, timber, organic fibers", weight = 1.2 },
    metal = { prompt = "metallic surface, brushed metal, polished steel, aluminum", weight = 1.3 },
    glass = { prompt = "glass, transparent, reflective surface, clear, crystal", weight = 1.1 },
    plastic = { prompt = "plastic, polymer, matte finish, synthetic material", weight = 1.0 },
    stone = { prompt = "stone texture, granite, marble, natural rock surface", weight = 1.2 },
    concrete = { prompt = "concrete, raw cement, urban material, rough surface", weight = 1.1 },
    fabric = { prompt = "fabric texture, woven textile, cloth, soft material", weight = 1.0 },
    leather = { prompt = "leather texture, genuine leather, grain surface, luxury material", weight = 1.3 },
    rubber = { prompt = "rubber, silicone, elastic material, matte black surface", weight = 1.0 },
    ceramic = { prompt = "ceramic, glazed surface, porcelain, vitreous material", weight = 1.1 },
    paper = { prompt = "paper texture, cardstock, matte surface, fibrous", weight = 1.0 },
    carbon = { prompt = "carbon fiber, woven composite, high-tech material", weight = 1.4 },
    chrome = { prompt = "chrome, mirror finish, highly reflective, polished metal", weight = 1.3 },
    brass = { prompt = "brass, gold metal, tarnished, patina, vintage metal", weight = 1.2 },
    copper = { prompt = "copper, red-brown metal, oxidized, verdigris patina", weight = 1.2 },
    titanium = { prompt = "titanium, aerospace metal, brushed finish, lightweight", weight = 1.3 }
}

-- ============================================================================
-- Lighting Setups
-- ============================================================================

local LIGHTING = {
    studio = { prompt = "studio lighting, softbox, even illumination, clean background", weight = 1.0 },
    dramatic = { prompt = "dramatic lighting, chiaroscuro, strong contrast, rim light, shadows", weight = 1.2 },
    natural = { prompt = "natural lighting, daylight, soft shadows, ambient occlusion", weight = 1.0 },
    golden_hour = { prompt = "golden hour lighting, warm sunlight, long shadows, warm tones", weight = 1.3 },
    neon = { prompt = "neon lighting, vibrant colored lights, glowing edges, cyberpunk aesthetic", weight = 1.4 },
    backlit = { prompt = "backlit, rim light, silhouette edges, glow effect", weight = 1.2 },
    moody = { prompt = "moody lighting, low key, high contrast, atmospheric, dark background", weight = 1.3 },
    three_point = { prompt = "three point lighting, professional setup, key light, fill light, rim light", weight = 1.0 }
}

-- ============================================================================
-- Concept Enhancement Library
-- ============================================================================

local CONCEPT_MODIFIERS = {
    -- For mechanical / engineering concepts
    cabinet = "cabinet, furniture, storage unit, wooden construction, joinery, dovetails, engineered wood panels",
    gear = "mechanical gear, cogs, teeth, metallic, industrial, precision engineering, rotational mechanism",
    bracket = "L-bracket, structural support, metal brace, reinforced, mounting hardware, flanged",
    pipe = "pipe, tube, cylindrical conduit, plumbing, schedule 40, threaded fitting, PVC or metal",
    spring = "spring coil, helical spring, tension spring, metal wire, coiled, elastic mechanism",
    bearing = "ball bearing, race, rotating assembly, precision steel balls, mechanical joint",
    chassis = "chassis, frame, structural skeleton, support framework, welded assembly, mounting points",
    panel = "control panel, flat surface, interface, mounted components, switch plate, instrument cluster",
    connector = "electrical connector, plug, jack, terminal block, pin header, mating interface",
    housing = "enclosure, protective casing, outer shell, sealed container, equipment housing",
    lever = "lever, mechanical arm, pivot, handle, control rod, actuation mechanism",
    pulley = "pulley wheel, groove, cable system, mechanical advantage, rotating sheave",

    -- For organic / natural concepts
    terrain = "terrain, landscape, ground surface, topography, elevation, natural formation",
    rock = "rock, boulder, stone formation, geological, weathered surface, natural fracture",
    plant = "plant, botanical, foliage, leaf structure, stem, organic growth, vegetation",
    bone = "bone, skeletal structure, calcified tissue, joint, marrow cavity, anatomical",
    shell = "shell, exoskeleton, protective carapace, spiral structure, calcium carbonate",

    -- For architectural concepts
    building = "building, structure, architecture, facade, elevation, architectural design, constructed",
    bridge = "bridge, span, crossing, structural engineering, beam, arch, suspension cable",
    column = "column, pillar, vertical support, load-bearing, classical order, structural element",
    arch = "arch, curved opening, arched window, structural arch, keystone, voussoirs",
    staircase = "staircase, steps, stairway, ascending, tread and riser, balustrade, handrail",
    foundation = "foundation, footing, base, ground support, concrete pad, load distribution",

    -- For abstract / generic
    generic_mechanical = "mechanical part, machined component, engineered piece, industrial design",
    generic_electronic = "electronic component, circuit board, PCB, solder joints, electronic assembly",
    generic_structural = "structural element, load bearing part, support member, framework component",
}

-- ============================================================================
-- PUBLIC API
-- ============================================================================

--- Generate a complete system prompt for the Stable Diffusion backend.
-- @param concept (string) The subject/concept to generate (e.g., "cabinet", "gear")
-- @param style (string) Artistic style key (e.g., "blueprint", "sketch", "photograph")
-- @param material (string|nil) Optional material key (e.g., "wood", "metal")
-- @param lighting (string|nil) Optional lighting key (e.g., "studio", "dramatic")
-- @param resolution (string|nil) Optional resolution override ("512", "768", "1024")
-- @return (table) { positive_prompt, negative_prompt, controlnet_params }
function generate_technical_prompt(concept, style, material, lighting, resolution)
    -- Validate inputs
    local style_def = STYLES[style]
    if not style_def then
        style_def = STYLES.blueprint  -- Fallback to blueprint
    end

    -- Resolve concept description
    local concept_desc = CONCEPT_MODIFIERS[concept]
    if not concept_desc then
        concept_desc = concept .. ", detailed view, technical illustration, precise rendering"
    end

    -- Resolve material description
    local material_prompt = ""
    if material then
        local mat_def = MATERIALS[material]
        if mat_def then
            material_prompt = mat_def.prompt .. ", "
        end
    end

    -- Resolve lighting description
    local lighting_prompt = ""
    if lighting then
        local light_def = LIGHTING[lighting]
        if light_def then
            lighting_prompt = light_def.prompt .. ", "
        end
    end

    -- Resolve resolution
    local res_string = "8k resolution"
    if resolution == "512" then
        res_string = "512x512 resolution, detailed"
    elseif resolution == "768" then
        res_string = "768x768 resolution, highly detailed"
    elseif resolution == "1024" then
        res_string = "1024x1024 resolution, extremely detailed, 8k"
    end

    -- Build positive prompt
    local positive = style_def.prefix
        .. concept_desc .. ", "
        .. material_prompt
        .. lighting_prompt
        .. style_def.suffix .. ", "
        .. res_string

    -- Clean up: remove trailing comma/space, ensure proper spacing
    positive = _clean_prompt(positive)

    -- Build negative prompt
    local negative = _build_negative_prompt(style_def, concept)

    -- Generate a deterministic backend seed string for the Python AI backend
    -- This is consumed by wireframe_ai.py to seed its generation
    local backend_seed = "seed_" .. tostring(concept) .. "_" .. style .. "_" .. tostring(#positive)

    -- Return structured result matching the Python Pydantic model schema
    return {
        positive_prompt = positive,
        negative_prompt = negative,
        controlnet_params = {
            strength = style_def.controlnet.strength,
            guidance_scale = style_def.controlnet.guidance,
            num_steps = style_def.controlnet.steps
        },
        style_name = style_def.name,
        artifact = style_def.artifact,
        backend_seed = backend_seed,
        aspect_ratio = "16:9",
        steps = style_def.controlnet.steps,
        cfg_scale = style_def.controlnet.guidance,
        control_strength = style_def.controlnet.strength
    }
end

--- Generate only the negative prompt for a given style and concept.
-- @param style (string) Artistic style key
-- @param concept (string|nil) Optional concept for concept-specific negative terms
-- @return (string) Negative prompt
function generate_negative_prompt(style, concept)
    local style_def = STYLES[style]
    if not style_def then
        style_def = STYLES.blueprint
    end
    return _build_negative_prompt(style_def, concept)
end

--- Get ControlNet parameters for a given style.
-- @param style (string) Artistic style key
-- @return (table) { strength, guidance_scale, num_steps }
function get_controlnet_params(style)
    local style_def = STYLES[style]
    if not style_def then
        style_def = STYLES.blueprint
    end
    return {
        strength = style_def.controlnet.strength,
        guidance_scale = style_def.controlnet.guidance,
        num_steps = style_def.controlnet.steps
    }
end

--- Get all available style keys and their display names.
-- @return (table) Array of { key, name, artifact }
function get_available_styles()
    local styles = {}
    for key, def in pairs(STYLES) do
        table.insert(styles, {
            key = key,
            name = def.name,
            artifact = def.artifact,
            controlnet_strength = def.controlnet.strength
        })
    end
    table.sort(styles, function(a, b) return a.name < b.name end)
    return styles
end

--- Get all available material keys.
-- @return (table) Array of { key, name } — name derived from key
function get_available_materials()
    local mats = {}
    for key, def in pairs(MATERIALS) do
        table.insert(mats, {
            key = key,
            name = key:sub(1,1):upper() .. key:sub(2)
        })
    end
    table.sort(mats, function(a, b) return a.key < b.key end)
    return mats
end

--- Get all available lighting keys.
-- @return (table) Array of { key, name }
function get_available_lighting()
    local lights = {}
    for key, def in pairs(LIGHTING) do
        table.insert(lights, {
            key = key,
            name = def.prompt:match("^[^,]+")
        })
    end
    table.sort(lights, function(a, b) return a.key < b.key end)
    return lights
end

-- ============================================================================
-- PRIVATE HELPERS
-- ============================================================================

--- Build a comprehensive negative prompt from style definition and optional concept.
-- @param style_def (table) Style definition from STYLES table
-- @param concept (string|nil) Optional concept for additional negatives
-- @return (string) Complete negative prompt
function _build_negative_prompt(style_def, concept)
    local parts = {}
    table.insert(parts, style_def.negative)

    -- Add concept-specific negatives
    if concept then
        local concept_negatives = _get_concept_negatives(concept)
        for _, neg in ipairs(concept_negatives) do
            table.insert(parts, neg)
        end
    end

    -- Add universal negatives
    table.insert(parts, "watermark, signature, text, title, label, logo, branding, copyright")
    table.insert(parts, "low quality, worst quality, blurry, pixelated, distorted, deformed")
    table.insert(parts, "ugly, messy, amateur, unfinished, draft, sketchy, rough")

    return table.concat(parts, ", ")
end

--- Get concept-specific negative terms.
-- @param concept (string) The concept key
-- @return (table) Array of negative strings
function _get_concept_negatives(concept)
    local map = {
        cabinet = { "crooked, unbalanced, warped, broken joints" },
        gear = { "broken teeth, missing gear, misaligned" },
        building = { "collapsed, leaning, damaged, unfinished" },
    }
    return map[concept] or {}
end

--- Clean a prompt string: remove trailing commas, double commas, and leading/trailing whitespace.
-- @param prompt (string) Raw prompt
-- @return (string) Cleaned prompt
function _clean_prompt(prompt)
    -- Remove double commas
    prompt = prompt:gsub(\",%s*,\", \",\")
    -- Remove trailing comma and whitespace
    prompt = prompt:gsub(\",%s*$\", \"\")
    -- Remove leading/trailing whitespace
    prompt = prompt:match(\"^%s*(.-)%s*$\") or prompt
    return prompt
end

-- ============================================================================
-- TESTS
-- ============================================================================

if os and os.getenv and os.getenv('LUA_RUN_TESTS') == '1' then
    local function assert_eq(a, b, msg)
        if a ~= b then
            print(string.format(\"FAIL: %s - expected %s, got %s\", msg or \"\", tostring(b), tostring(a)))
        else
            print(string.format(\"PASS: %s\", msg or \"\"))
        end
    end

    local function assert_contains(str, substr, msg)
        if not str:find(substr, 1, true) then
            print(string.format(\"FAIL: %s - '%s' not found in prompt\", msg or \"\", substr))
        else
            print(string.format(\"PASS: %s\", msg or \"\"))
        end
    end

    print(\"--- AI Prompts Tests ---\")

    -- Test: blueprint style for cabinet with wood material
    local result = generate_technical_prompt(\"cabinet\", \"blueprint\", \"wood\", \"studio\", nil)
    assert_eq(result.style_name, \"Technical Blueprint\", \"Style should be blueprint\")
    assert_contains(result.positive_prompt, \"cabinet\", \"Blueprint prompt should mention cabinet\")
    assert_contains(result.positive_prompt, \"wood texture\", \"Should include wood material\")
    assert_contains(result.positive_prompt, \"studio lighting\", \"Should include studio lighting\")
    assert_contains(result.positive_prompt, \"blueprint\", \"Should mention blueprint\")
    assert_contains(result.negative_prompt, \"watermark\", \"Negative should include watermark\")
    assert_eq(result.controlnet_params.strength, 0.95, \"Blueprint controlnet strength\")

    -- Test: sketch style for gear
    local sketch_result = generate_technical_prompt(\"gear\", \"sketch\", nil, nil, \"1024\")
    assert_eq(sketch_result.style_name, \"Pencil Sketch\", \"Style should be sketch\")
    assert_contains(sketch_result.positive_prompt, \"pencil sketch\", \"Sketch prompt should mention pencil\")
    assert_contains(sketch_result.positive_prompt, \"1024x1024\", \"Should include resolution\")

    -- Test: Invalid style falls back to blueprint
    local fallback = generate_technical_prompt(\"test\", \"nonexistent_style\", nil, nil, nil)
    assert_eq(fallback.style_name, \"Technical Blueprint\", \"Invalid style should fallback to blueprint\")

    -- Test: Negative prompt generation
    local neg = generate_negative_prompt(\"photograph\", nil)
    assert_contains(neg, \"photorealistic\", \"Photograph negative should mention photorealistic\")
    assert_contains(neg, \"watermark\", \"Should include universal negatives\")

    -- Test: ControlNet params
    local params = get_controlnet_params(\"cinematic\")
    assert_eq(params.strength, 0.55, \"Cinematic controlnet strength\")

    -- Test: Available styles
    local styles = get_available_styles()
    assert_eq(#styles > 0, true, \"Should return styles\")
    local found = false
    for _, s in ipairs(styles) do
        if s.key == \"blueprint\" then found = true end
    end
    assert_eq(found, true, \"Should include blueprint style\")

    print(\"--- AI Prompts Tests Complete ---\")
end
