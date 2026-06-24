# Going Balls — Build Report & Platform Vision

> **Generated:** June 23, 2026
> **Version:** 1.2.0+
> **Platform:** Browser (ES Modules, zero-build-step, CDN-loaded dependencies)

---

## Part 1: Overall Platform Vision

### What Going Balls Is

Going Balls — Web Edition is a **3D physics-based rolling platformer** that lives entirely in the browser. The player controls a ball that rolls through procedurally generated (or community-created) obstacle courses, collecting coins, avoiding hazards, and unlocking cosmetic skins — all rendered with Three.js and driven by cannon-es physics.

It is designed as a **mobile-first, installable PWA** that works offline after first load, with optional real-time multiplayer features (leaderboard, community track sharing, a world grid) powered by WebsimSocket.

### Core Design Pillars

1. **Physics-First Gameplay** — The ball feels heavy, dense, and real. cannon-es handles gravity, friction, restitution, and collision with every surface, ramp, pendulum, spinner, and hazard. The player *steers* the ball rather than directly controlling it, creating a momentum-based flow state.

2. **Procedural + Community Content** — Levels are generated procedurally from 40+ segment types across 9 difficulty tiers using a seeded mulberry32 PRNG (deterministic via `?seed=` URL param). Players can also **build their own tracks** using an in-game track builder with 25+ part types, then share them with the community.

3. **Deep Progression** — 70+ ball skins with abilities (speed, jump, coins), a leveling system (max 5 per skin), 12 sky environments with gameplay-modifying conditions, powerups (magnet, turbo, shield, coin doubler), and a builder XP/leveling system.

4. **Resilient & Graceful** — Every asset load has a fallback. Every network call has retry logic. Every UI component has error boundaries. The game degrades gracefully from a fully connected WebsimSocket multiplayer experience down to a completely offline single-player experience.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         main.js                              │
│              Thin DI bootstrap (Game class)                  │
│         Wires 12+ modules via dependency injection          │
├─────────┬──────────┬──────────┬──────────┬──────────────────┤
│ engine/ │  src/    │  src/    │  src/    │  src/            │
│ scene.js│ physics.js│ levelgen │ ui.js    │ rendering.js     │
│         │          │  .js     │          │                  │
│ Three.js│ cannon-es│ Procedural│ DOM UI  │ rAF loop         │
│ Scene   │ World    │ Level Gen │ Shop    │ Camera follow    │
│ Camera  │ Ball     │ 40+ types│ Leaderbr│ Particle updates │
│ Renderer│ Forces   │ 9 tiers  │ Ball Idx│ Speed lines      │
│ Materials│Obstacles│ Builder  │ Settings│ Motion blur      │
│ Sky/PMREM│Weather │ playback │ Modals  │                  │
├─────────┴──────────┼──────────┴──────────┴──────────────────┤
│ src/audio.js       │ src/persistence.js  │ src/networking.js│
│ Music + SFX pool   │ localStorage save   │ WebsimSocket     │
│ AudioContext visual │ mulberry32 RNG      │ Loading manager  │
│ Portal whoosh SFX  │ Weather AI          │ Error handlers   │
├────────────────────┴─────────────────────┴──────────────────┤
│ src/builder/              │ src/world/                       │
│ Track Builder (25+ parts) │ World Grid (shared universe)     │
│ 3D Workshop (sculpt/      │ Marketplace (buy/sell sites)     │
│   paint/lasso/export)     │ AR/VR + Minimap                  │
│ Community sharing/likes   │ Real-time multiplayer presence   │
└───────────────────────────┴──────────────────────────────────┘
```

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Zero build step** | ES modules loaded via import map from esm.sh CDN. No bundler, no transpiler. Instant hot-reload during development. |
| **Dependency injection via `game` object** | Every module function takes `game` as first arg. Shared state lives on `game`. No globals (except intentional cross-module loading signals). |
| **CDN dependencies** | Three.js r184, cannon-es, nipplejs loaded from esm.sh. No node_modules in production. `npm ci` only for dev tools (eslint, vitest, lighthouse). |
| **Service worker with SHA cache busting** | CI stamps git SHA into `sw.js` on deploy. Stale-while-revalidate for assets. Network-first for navigation. |
| **Fallback-everything** | Textures → 1×1 grey DataTexture. GLTFs → simple geometric fallbacks. Sky → solid color. Network → offline mode. |

### The Six Experiences

1. **Core Game** — Roll through procedurally generated obstacle courses. Collect coins. Don't fall off. Reach the finish gate. The game gets harder every level (wider difficulty tiers, faster hazards, narrower platforms).

2. **Track Builder** — A full in-game level editor. Place 25+ part types (platforms, ramps, hazards, collectibles, structural elements). Undo/clear. Test-play instantly. Save locally. Share to community.

3. **3D Workshop** — An integrated 3D model editor (translate/rotate/scale, vertex paint, lasso select, clipping planes, export). For creating custom ball skins or modifying existing GLTF models.

4. **Community Hub** — Browse, play, like, rate, and sort community-shared tracks. Trending section (24h plays), star ratings with histogram, play history charts, part breakdown analytics.

5. **World Grid** — A shared persistent universe where players claim grid sites, build tracks on them, visit neighbors' tracks, and trade sites on an open marketplace.

6. **Survival Mode** — Endless mode with escalating difficulty.

---

## Part 2: Build Prompts

Below are the complete, copy-pasteable prompts to build every system in the project from scratch. Each prompt is self-contained and can be given to an AI coding assistant.

---

### Prompt 1: Project Scaffolding & Build Setup

```
Create a zero-build-step browser game project called "going-balls" with:

1. package.json with these devDependencies only:
   - three@^0.184.0, cannon-es@^0.20.0 (used via CDN, not bundled)
   - eslint@^10.5.0, @eslint/js@^10.0.1, globals@^17.6.0
   - vitest@^3.2.6, jsdom@^29.1.1
   - @lhci/cli@^0.15.1, serve@^14.2.4

2. Scripts:
   - "dev": "node server.js"
   - "start": "node server.js"
   - "test": "vitest run"
   - "test:watch": "vitest"
   - "test:coverage": "vitest run --coverage"
   - "lint": "eslint src/ engine/ main.js"
   - "lint:fix": "eslint src/ engine/ main.js --fix"

3. eslint.config.js using flat config with eslint:recommended + style rules
4. vitest.config.js with jsdom environment and globals: true
5. A simple server.js (express or http-server) serving static files on port 3000
6. .gitignore for node_modules, .vite, backups, *.bak*

No bundler, no transpiler, no TypeScript. ES modules only.
```

### Prompt 2: HTML Shell & Import Map

```
Create index.html for a 3D browser game with:

1. Import map loading Three.js, cannon-es, and nipplejs from esm.sh CDN:
   - "three" → "https://esm.sh/three@0.184.0"
   - "three/addons/" → "https://esm.sh/three@0.184.0/examples/jsm/"
   - "cannon-es" → "https://esm.sh/cannon-es@0.20.0"
   - "nipplejs" → "https://esm.sh/nipplejs@0.10.2"

2. UI skeleton:
   - Loading overlay with progress bar
   - Game canvas container
   - Top menu bar (#top-menu) with buttons: HELP, SHOP, LEADERBOARD, SURVIVAL, BUILDER, COMMUNITY, MUSIC, SETTINGS, POINTER LOCK
   - Mobile joystick container + jump button
   - #overlay div for modals
   - Pointer lock hint overlay
   - Total coins display (#total-coins)
   - Time display (#time-display)
   - Notification container

3. SEO: Open Graph tags, Twitter Card, meta description, theme-color
4. PWA: manifest.json link
5. Favicon using ball.webp
6. Custom font (5x5dots.ttf) for game UI
7. All styles in a linked styles.css (mobile-first responsive)

Use semantic HTML, aria-labels on all buttons, and tabindex for focus management.
```

### Prompt 3: Three.js Scene, Renderer & Materials

```
Create engine/scene.js exporting initScene(game) that sets up:

1. THREE.Scene with fog
2. THREE.PerspectiveCamera (fov 75, near 0.1, far 1000)
3. THREE.WebGLRenderer with:
   - Antialiasing
   - Pixel ratio capped at 1 (for mobile performance)
   - sRGB output encoding
   - ACES Filmic tone mapping
   - PCFSoft shadow map (2048x2048)
   - Size set to window.innerWidth × window.innerHeight

4. Shared material pool on game.sharedMaterials:
   - wood (MeshPhongMaterial, brown)
   - finish (MeshPhongMaterial, green)
   - coin (MeshPhongMaterial, gold, emissive)
   - pendulum (MeshPhongMaterial, dark red)
   - spinner (MeshPhongMaterial, blue)
   - rope (MeshPhongMaterial, dark brown)
   - wall (MeshPhongMaterial, grey)
   - speed (MeshPhongMaterial, yellow)
   - hazard (MeshPhongMaterial, red)
   - neon (MeshPhongMaterial, cyan, emissive)
   - glass (MeshPhongMaterial, white, transparent, opacity 0.3)

5. Sky system:
   - Large inverted sphere mesh for sky background
   - applySkyConfig(game, config) function that loads equirectangular textures
   - PMREM environment map generation when available
   - Smooth crossfade between sky transitions (dispose old env maps)

6. Ball skin system:
   - getBallMaterial(game, config) — returns MeshPhongMaterial for texture/color/emissive skins
   - applyBallSkin(game, config) — handles GLTF skin loading with async GLB swap
   - Original sphere mesh preserved as _defaultBallMesh for restoration

7. disposeMesh(mesh) utility — traverses mesh tree, disposes all geometries, materials, and textures, removes from parent

8. textureCache (Map) for texture reuse

Export: initScene, getBallMaterial, clearTextureCache, disposeMesh
```

### Prompt 4: Cannon-es Physics World

```
Create src/physics.js with cannon-es physics:

1. Constants:
   - BALL_RADIUS = 0.5
   - GRAVITY = -45
   - JUMP_FORCE = 28
   - MAX_VELOCITY = 22 (exported)
   - STEER_SPEED = 22

2. initPhysics(game):
   - CANNON.World with gravity (0, -45, 0), allowSleep true
   - Ball-ground contact material: friction 1.0, restitution 0.1
   - Ball body: CANNON.Sphere(0.5), mass 100, angularDamping 0.95, linearDamping 0.5
   - Ball positioned at (0, 1, 0)
   - Pooled vectors on game object: _vecA, _vecB, _rayResult, _vecForce, _vec3A, _vec3Cam, _vec3Dir, _vec3Desired

3. updatePhysics(game, dt):
   - Read input (keys, mouseInput, joystickInput) and apply steer force to ball
   - Apply speed multiplier from skin abilities and sky conditions
   - Clamp velocity to MAX_VELOCITY * speedMult
   - Step the world by dt
   - Sync ballMesh position/rotation to ballBody
   - Collision detection for obstacles (pendulums, spinners, movers, meteors) with distance-based checks
   - Drop coins on obstacle contact (scales with level)
   - Check for fall-off (y < -15) → game over
   - Check finish line crossing → level complete
   - Check portal ring teleportation with particle burst effect
   - Update rolling sound volume based on ground speed
   - Portal particle animation update

4. Weather particle systems:
   - createRain(game) / clearRain(game)
   - createWind(game) / clearWind(game)
   - createFireSparks(game) / clearFireSparks(game) / updateFireSparks(game, dt)
   - createHeatShimmer(game) / clearHeatShimmer(game) / updateHeatShimmer(game, dt)
   - createMeteors(game) / clearMeteors(game) / updateMeteors(game, dt) / checkMeteorCollisions(game)

5. jump(game): Allow ground jump + 1 air jump, apply JUMP_FORCE * jumpMult

6. Pool all particle geometries and reuse. Scale particle counts by getParticleCount().

Export: initPhysics, updatePhysics, jump, createRain, clearRain, createWind, clearWind, createFireSparks, clearFireSparks, updateFireSparks, createHeatShimmer, clearHeatShimmer, updateHeatShimmer, createMeteors, clearMeteors, updateMeteors, checkMeteorCollisions, MAX_VELOCITY
```

### Prompt 5: Procedural Level Generation

```
Create src/levelgen.js with procedural level generation:

1. mulberry32 seeded PRNG (import from persistence.js or inline)

2. 9 difficulty tiers (EASY → IMPOSSIBLE) mapping level number to:
   - Allowed segment types
   - Base width (shrinks with difficulty)
   - Hazard speed multiplier
   - Fog color

3. createLevel(game, seed):
   - Build linear sequence of segments using seeded RNG
   - numSegments = 15 + floor(level × 2.5)
   - Even-numbered levels mirrored horizontally
   - Insert checkpoints at intervals
   - Place finish gate at the end
   - Spawn coins along the path

4. 40+ segment types including:
   - Straight platform, ramp, narrow path
   - Pendulum, spinner, hammer, mover hazards
   - Zigzag, gap, bumpy terrain
   - Tunnel, archipelago, checkerboard
   - Glass platforms (breakable)
   - Loop-de-loop, spiral tube, half pipe
   - Curve, stairs, spring pad
   - Portal ring (teleport)
   - Speed strip, side crusher
   - Moving rects, jump gaps (single/double/triple)

5. Builder functions for each segment type:
   - addPlatform(game, x, y, z, width, length, color)
   - addRamp(game, x, y, z, width, length, height)
   - addPendulum(game, x, y, z, speedMult)
   - addSpinner(game, x, y, z, speedMult)
   - addHammer(game, x, y, z, speedMult)
   - addMover(game, x, y, z, width, height, depth, sideways, speedMult)
   - addWall(game, x, y, z, width, length, rotZ)
   - addGlassPlatform(game, x, y, z, width, length)
   - addTunnelWalls(game, x, y, z, width, length)
   - addCoins(game, x, y, z, length, count)
   - addCheckpoint(game, x, y, z, width)
   - addLoopDeLoop, addSpiralTube, addSpringPad, addCurve, addStairs
   - addPortalRing, addHalfPipe, addCheckerboard
   - addGlassLoopDeLoop, addGlassStairs, addGlassCurve
   - addBlade, placeFinishModel

6. clearLevel(game): Dispose all geometry (levelObjects, coins, pendulums, spinners, movers, glass, trail instances)

7. playCommunityTrack(game, parts): Deserialize and build a track from saved part data

8. spawnInfiniteChunk(game) for infinite/endless mode

9. createShockwave(game, z, index) for visual effects

Export all builder functions + createLevel, clearLevel, createInfiniteLevel, playCommunityTrack, spawnInfiniteChunk, createShockwave
```

### Prompt 6: Ball Skin Database

```
Create src/ball_db.js with a single BALL_DB object containing 65+ ball skin definitions:

Each skin entry:
{
  name: 'Display Name',
  price: 150,              // coins to purchase
  tex: 'assets/image/x.webp',  // texture path (or .glb for 3D skins)
  type: 'texture' | 'gltf' | 'color' | 'emissive',
  ability: {
    key: 'speed' | 'jump' | 'coins',
    base: 1.05,            // ability value at level 1
    perLevel: 0.03         // additional value per level (max level 5)
  },
  description: 'Flavor text.'
}

Include skins for: rainbow (free starter), wood, metal, lava, groovy (animated canvas), p2opp (env-map reflective), eye_ball (GLTF), alien variants, sports balls, emoji faces, neon skins, glass skins, halloween skins, space skins, etc.

Higher-priced skins should have slightly better ability stats (price-based speed bias up to +12% at 12000 coins).

Export: BALL_DB
```

### Prompt 7: UI System — Shop, Leaderboard, Settings

```
Create src/ui.js with all DOM-based UI:

1. setupUI(game, room):
   - Wire all top-menu buttons to their handlers
   - Shop button → opens modal with tabbed grid (Skins, Skies, Powerups)
   - Leaderboard button → opens full-screen leaderboard modal
   - Help button → shows controls overlay
   - Settings → joystick deadzone/power sliders
   - Music toggle

2. Shop system:
   - renderGrids(game): Render skin/sky/powerup card grids
   - Each card shows: icon/preview, name, price, ability stats, equipped indicator
   - handlePurchase(game, type, key, price): Deduct coins, unlock item, save
   - levelUpSkin(game, key, cost): Increase skin level (max 5), improve ability
   - applySkinAbilities(game, key): Apply selected skin's ability modifiers

3. Ball Index UI (separate from shop):
   - renderBallIndex(game, room): Shows all skins with remote usage stats
   - Merges local and remote ball_stats data
   - Cards show: play count, win rate, avg time, best time

4. Leaderboard:
   - getLeaderboard(game, room): Merge local + remote entries
   - addLeaderboardEntry(game, entry, room): Add entry locally + mirror to room
   - renderLeaderboard(game, room): Full-screen modal with ranked entries
   - saveLeaderboard(game, entries, room): Persist locally + sync

5. Game state management:
   - checkGameState(game, dt, room): Timer, coin multiplier from sky conditions, coin magnet
   - gameOver(game, win, room): Show results, save leaderboard entry
   - showTimeBonus(game, bonus): Display time bonus popup
   - reset(game): Reset ball position to checkpoint, clear weather effects

6. Wallet UI:
   - updateWalletUI(game): Update #total-coins display

7. Modal management with focus trapping and ESC to close

Export: setupUI, renderGrids, renderBallIndex, getLeaderboard, saveLeaderboard, addLeaderboardEntry, renderLeaderboard, handlePurchase, levelUpSkin, applySkinAbilities, updateWalletUI, checkGameState, gameOver, showTimeBonus, reset
```

### Prompt 8: Audio System

```
Create src/audio.js:

1. initAudio(game):
   - Rolling SFX: looping audio, volume scaled by ground speed (0 to 0.35)
   - Background music: looping elevator_music.mp3, volume 0.18 (0.06 when overlay open)
   - Music visualizer: AudioContext analyser → canvas overlay with frequency bars
   - Autoplay compliance: Resume AudioContext + play() on first user interaction
   - Music toggle button wiring with localStorage persistence

2. SFX system:
   - registerSfx(name, url): Pre-load audio element into pool
   - playSound(name): Clone and play (no cross-talk)

3. Portal whoosh SFX:
   - playPortalSound(game): Web Audio API synthesized sound (noise buffer → bandpass filter → gain envelope)
   - No file needed

4. Volume management:
   - Music volume drops to 0.06 when menu/overlay is open
   - MutationObserver on top-menu class changes + interval fallback

Export: initAudio, registerSfx, playSound, playPortalSound
```

### Prompt 9: Persistence & Weather AI

```
Create src/persistence.js:

1. mulberry32(a) — seeded PRNG function

2. initPersistence(game):
   - Read/initialize save data from localStorage key 'goingBallsData_v1'
   - Default save data: totalCoins, unlockedBalls, unlockedSkies, selectedBall, selectedSky, skinLevels, powerups, weatherPrefs, builderXP/Level/stats
   - Parse URL ?seed= parameter for deterministic level generation
   - Initialize game.rng from seed if provided
   - Load ballConfigs from BALL_DB
   - Load powerupConfigs (magnet, turbo, shield, x2coins)
   - Load skyConfigs (12 skies including 4 condition-based)
   - Initialize weatherAI

3. Sky configs with conditions:
   - Storm Front: coinBonus 1.3, rain/wind
   - Inferno: coinBonus 1.5, speed boost 1.15, fire sparks, heat haze
   - Frostbite: coinBonus 1.4, permanent snow, ice patches
   - Void Storm: coinBonus 2.0, speed debuff 0.85, meteors

4. Weather AI:
   - chooseWeather(level): Weighted scoring based on level patterns + persistent bias map
   - recordWeather(w): Update bias map, persist

5. saveGame(game): Throttled localStorage write

6. getParticleCount(game, type, defaultCount): Scale by hardwareConcurrency, device type, screen area

Export: mulberry32, initPersistence, saveGame, getParticleCount
```

### Prompt 10: Animation Loop & Rendering

```
Create src/rendering.js:

1. animate(game):
   - requestAnimationFrame loop
   - Calculate dt (capped at 0.05s)
   - If builder active: render builder scene, return
   - If world active: render world scene, return
   - Otherwise: updatePhysics, updateCamera, updateSpeedLines, updateMotionBlur
   - Update weather particles (rain, wind, fire sparks, heat shimmer, meteors)
   - Infinite level chunk spawning
   - Music visualizer rendering
   - game.renderer.render(scene, camera)
   - finishMotionBlur (composite to screen)

2. onWindowResize(game):
   - Update camera aspect ratio
   - Update renderer size
   - resizeMotionBlur

3. updateCamera(game, dt):
   - Smooth orbit around ball using cameraYaw/cameraPitch/cameraDistance
   - Pitch clamped [0.15, 1.2]
   - Lerp-based smoothing

Export: onWindowResize, animate
```

### Prompt 11: Speed Lines Visual Effect

```
Create src/speed_lines.js:

1. initSpeedLines(game):
   - Create 64 white LineSegments arranged radially around origin
   - Each line is a short segment (length 0.3–1.2) at random angle and distance (3–8 units)
   - Additive blending, renderOrder 999, transparent, depthWrite false
   - Add to game.scene

2. updateSpeedLines(game, dt):
   - Calculate horizontal speed of ballBody
   - Compute speedRatio = hSpeed / MAX_VELOCITY
   - Opacity ramps from 0 to 0.45 as speedRatio goes from 0.35 to 1.0
   - Above 80% speed: warm color tint (shift toward yellow/orange)
   - Position lines relative to camera each frame
   - Scale line length by speed for motion feel

3. Module-pooled vectors: _camDir, _right, _up, _worldUp (no per-frame GC)

Export: initSpeedLines, updateSpeedLines
```

### Prompt 12: Motion Blur Post-Processing

```
Create src/motion_blur.js:

1. initMotionBlur(game):
   - Create WebGLRenderTarget (half-float type with fallback)
   - Create fullscreen quad: PlaneGeometry(2,2) + ShaderMaterial
   - OrthographicCamera for quad rendering
   - Shader: 8 centre-weighted directional samples along velocity direction

2. updateMotionBlur(game):
   - Read ball velocity, project to screen space
   - Compute intensity: activates above 60% of MAX_VELOCITY, ramps to full at 100%
   - Set renderer render target to off-screen RT
   - Set velocity uniform for shader

3. finishMotionBlur(game):
   - If intensity is 0: restore default render target, skip composite
   - Render fullscreen quad with blur shader to screen
   - Restore default render target

4. resizeMotionBlur(game): Recreate RT at new resolution

5. disposeMotionBlur(game): Clean up RT, geometry, material

Vertex shader: gl_Position = vec4(position, 1.0)
Fragment shader: Sample 8 texels along velocity direction, centre-weighted blending

Export: initMotionBlur, updateMotionBlur, finishMotionBlur, resizeMotionBlur, disposeMotionBlur
```

### Prompt 13: Networking & Loading

```
Create src/networking.js:

1. initNetworking():
   - Check for WebsimSocket availability
   - If unavailable: return offline stub room
   - Create WebsimSocket room with retry loop (3 retries, exponential backoff 1s→2s→4s)
   - Seed ball_stats collection with 5 sample records on first connect
   - Return room object

2. setupLoadingManager():
   - Hook into THREE.DefaultLoadingManager
   - onProgress: update loading bar and text
   - onLoad: signal assets ready
   - onError: show fallback toast, set assetFallback flag
   - Safety timeout: dismiss loading after 6s

3. setupGlobalErrorHandlers(notifier):
   - Catch unhandledrejection: detect network errors, suppress noisy failures, show toast on first failure
   - Catch window errors: log details

4. Loading overlay dismissal:
   - Dismiss only when BOTH assets loaded AND scene initialized
   - Animated fade-out transition

Export: initNetworking, setupLoadingManager, setupGlobalErrorHandlers
```

### Prompt 14: Notification Manager

```
Create src/notification_manager.js:

NotificationManager class:
- Pools DOM toast nodes for reuse
- maxConcurrent: 3 simultaneous toasts
- minIntervalMs: 250ms between new toasts
- Queue overflow handling with auto-flush
- notify(message, opts): opts includes timeout, type ('warn'|'error'), persistent
- Animated in/out with CSS transitions
- Auto-dismiss after timeout (default 1800ms)
- Persistent toasts max lifetime 15s

Export: NotificationManager
```

### Prompt 15: Track Builder System

```
Create src/builder/ with 5 modules:

1. catalog.js — Part catalog:
   - PART_CATEGORIES: surface, structural, hazard, collectible, marker
   - PART_CATALOG: 25+ part definitions with:
     key, name, category, icon, defaults, connPts (connection points), builderFn, description
   - Parts: platform, ramp, glass_platform, speed_strip, finish_line, wall, tunnel_walls,
     pendulum, spinner, hammer, mover, blade, coin_line, checkpoint, finish_model,
     loop_de_loop, spiral_tube, spring_pad, curve, stairs, portal_ring, half_pipe,
     checkerboard, glass_loop, glass_stairs, glass_curve

2. builder_scene.js — 3D builder scene:
   - initBuilderScene(game): Separate Three.js scene with grid floor, ambient + directional light
   - onBuilderMouseMove/Click/Wheel/PanStart/PanEnd: Input handling
   - placePart(game, key, x, y, z, rotation): Instantiate part geometry
   - undoLastPlacement(game): Remove last placed part
   - clearBuilderScene(game): Remove all parts
   - disposeBuilderScene(game): Clean up resources
   - renderBuilder(game): Render builder scene
   - loadPartsIntoBuilder(game, parts): Deserialize saved parts

3. builder_ui.js — Builder sidebar UI:
   - renderBuilderUI(game): Categorized part grid, action buttons, XP bar
   - Category tabs with emoji icons
   - Part cards with selection highlighting
   - Actions: Undo, Clear, Play, Save, Load, Share, Community, Export, Workshop
   - Status bar with controls hint
   - exitBuilder(game): Return to game mode

4. builder_networking.js — Multiplayer sync:
   - initBuilderMultiplayer(game, room): Subscribe to builder_track collection
   - Real-time part sync between builders
   - Player cursor tracking
   - shareTrack(game, name): Publish to shared_tracks collection
   - loadCommunityTracks(game, mode): Fetch and render community modal
   - Like/unlike system with localStorage + remote sync
   - Star rating system (1-5) with histogram
   - Play count tracking (24h trending)
   - renderCommunityModal: Full modal with trending section, sort options, detail view
   - disposeBuilderMultiplayer(game)

5. builder_xp.js — Builder progression:
   - XP sources: part placement (2 XP), variety bonus (+5 per category), saved (10 XP),
     shared (25 XP), test-played (15 XP), complexity bonus (+1 per 10 parts)
   - Level thresholds: Quadratic curve (early fast, later slow)
   - Titles: Novice → Beginner → Apprentice → Mason → Artisan → Craftsman → Designer → Architect → Master Builder
   - XP bar rendering with progress indicator
   - Level-up notification with animated popup

Export all functions from each module.
```

### Prompt 16: 3D Workshop (Model Editor)

```
Create src/builder/ws_*.js (20+ modules) for an integrated 3D model editor:

Core modules:
- ws_state.js: Global state (selected object, clipping plane, mode)
- ws_scene.js: Workshop Three.js scene with lights
- ws_controls.js: OrbitControls + TransformControls (translate/rotate/scale)
- ws_app.js: Main entry — initWorkshop(game) returns enter/exit/update/dispose

Feature modules:
- ws_loaders.js: GLTF/GLB/OBJ file import UI
- ws_operations.js: Delete, duplicate, group, ungroup
- ws_exporter.js: Export scene as GLTF/GLB
- ws_painter.js: Vertex color paint brush
- ws_selection.js: Click-to-select with highlight
- ws_selectGroups.js: Group management
- ws_lassoSelect.js: Lasso selection tool (screen-space polygon → mesh intersection)
- ws_selectionHistory.js: Undo/redo for selections (Ctrl+Z/Ctrl+Y)
- ws_rigging.js: Bone/joint setup for animated models
- ws_sculpting.js: Basic vertex displacement sculpting
- ws_wireframeEditor.js: Wireframe overlay editor
- ws_modifiers.js: Mesh modifiers (subdivision, mirror)
- ws_agent.js: AI-assisted model generation hooks
- ws_gallery.js: Thumbnail generation for saved models
- ws_uiPanels.js: Floating UI panels for tool settings

The workshop shares the game's renderer and canvas. Enter/exit toggles scene visibility.
```

### Prompt 17: World Grid System

```
Create src/world/ with 6 modules for a shared persistent universe:

1. world_state.js:
   - WorldGrid class with infinite grid of sites
   - Site data: col, row, ownerId, terrain, skyType, parts, partCount, listed, listPrice
   - Terrain presets: grass, sand, snow, lava, crystal, void
   - SITE_SIZE constant
   - createWorldGrid(playerId): Factory function

2. world_networking.js:
   - initWorldNetworking(game, room): Subscribe to world_sites, world_parts, world_presence, world_listings collections
   - Site claiming, ownership transfer, parts sync
   - Player presence tracking (2s throttle)
   - Marketplace listings sync
   - disposeWorldNetworking(game)

3. world_ui.js:
   - renderWorldUI(game): Grid-based world view with site cards
   - Site info panels (owner, terrain, parts count)
   - Enter builder from world context
   - exitWorld(game): Return to game mode

4. marketplace.js:
   - listSiteForSale(game, col, row, price)
   - delistSite(game, col, row)
   - purchaseSite(game, col, row): Coin transfer + ownership change
   - getMarketListings(game, filters): Filter by price, terrain, exclude self
   - Transaction history (localStorage, last 100)
   - Blueprint listing system (sell track layouts separately)
   - createBlueprintListing, getBlueprintListings

5. world_minimap.js:
   - initNeighborPreview(game): 3D preview of neighboring sites
   - updateNeighborPreview, animateNeighborPreview
   - markNeighborPreviewDirty: Rebuild on player movement
   - disposeNeighborPreview, toggleNeighborPreview

6. world_arvr.js:
   - initARVR(game): AR/VR pointer integration
   - updateMobilePointers(game): Touch pointer visualization
   - disposeARVR(game)
```

### Prompt 18: Service Worker & PWA

```
Create sw.js and manifest.json:

Service Worker (sw.js):
- SHA-stamped cache version (replaced by CI on deploy)
- PRECACHE_ASSETS: List of critical shell files (HTML, JS, CSS)
- install: Pre-cache shell, skipWaiting
- activate: Purge old versioned caches, claim clients
- Fetch handler:
  - Navigation: network-first, fallback to cache, then offline.html
  - Assets: stale-while-revalidate (serve cache instantly, fetch in background)

PWA Manifest (manifest.json):
- name: "Going Balls - Web Edition"
- display: fullscreen
- orientation: any
- background/theme color: #87ceeb
- categories: games, entertainment
- Icons: ball.webp (any size, maskable)
```

### Prompt 19: CI/CD Pipeline

```
Create .github/workflows/ci.yml:

Trigger: push to main or PR to main

Jobs:
1. lint-and-test (ubuntu-latest, Node 20):
   - npm ci
   - npx eslint src/ engine/ main.js
   - npm test (vitest, 141 tests)

2. lighthouse (needs lint-and-test):
   - npx lhci autorun
   - Performance ≥ 0.5, Accessibility ≥ 0.7, Best Practices ≥ 0.7

3. deploy (needs lint-and-test + lighthouse, push to main only):
   - Stage deployable files into _deploy/
   - Stamp sw.js with git SHA via sed
   - Copy: index.html, main.js, src/, engine/, assets/
   - Upload via actions/upload-pages-artifact@v3
   - Deploy via actions/deploy-pages@v4

Lighthouse config (lighthouserc.json):
- Desktop preset
- startServerCommand: "node server.js"
- Assertions at warn level
```

### Prompt 20: Test Suite

```
Create tests/ with 4 test files (141+ tests total):

1. tests/persistence.test.js:
   - mulberry32 deterministic seeding
   - localStorage save/load round-trip
   - Corruption recovery (malformed JSON)
   - Default save data initialization
   - Weather AI scoring

2. tests/levelgen.test.js:
   - Level generation with fixed seeds
   - Segment count matches formula
   - All difficulty tiers produce valid levels
   - Coin placement within bounds
   - Checkpoint insertion

3. tests/asset_loading.test.js:
   - All asset paths resolve to existing files
   - Three.js mock integrity (Scene, Camera, Renderer exist)
   - CANNON mock integrity (World, Sphere, Body exist)
   - Import map references are valid

4. tests/ball_skin.test.js:
   - getBallMaterial: texture, color, emissive, missing skin, ability keys (7 tests)
   - applyBallSkin: texture swap, gltf loading, color, emissive, default restoration (8 tests)
   - levelUpSkin: XP thresholds, max level, persistence (7 tests)
   - Edge cases: null config, missing tex, ability scaling

Config: vitest with jsdom, globals true
```

### Prompt 21: Styles & Responsive Design

```
Create styles.css with mobile-first responsive design:

1. Base reset and body styling (dark background, overflow hidden)

2. #overlay: Absolute positioned, flexbox centered, rgba background, z-index 1000

3. #top-menu: Absolute top-right, flex row, z-index 200, opacity transition
   - .visible class enables pointer-events
   - .menu-btn: Glassmorphism buttons (rgba bg, white border, rounded)

4. #total-coins: Fixed position, gold text

5. #time-display: Fixed position, monospace

6. Mobile controls:
   - #joystick-container: Fixed bottom-left
   - #jump-btn: Fixed bottom-right, circular, semi-transparent

7. Modals: Max-width 480px, scrollable, rounded corners, dark gradient background

8. Builder sidebar: Fixed right, 340px wide, dark gradient, scrollable

9. Pointer lock hint: Animated appearance, dismiss button

10. Responsive breakpoints:
    - Mobile (< 600px): Larger buttons, adjusted spacing
    - Tablet/Desktop: Compact layout

11. Animations: Fade transitions, slide-in, scale on hover

12. Accessibility: Focus indicators, high contrast mode support

13. Music visualizer canvas: Fixed fullscreen, pointer-events none, z-index 1001
```

---

## Part 3: Key Tuning Constants

All gameplay-critical constants are in `src/physics.js` for easy tuning:

```javascript
// Physics feel
BALL_RADIUS = 0.5;        // Ball size
GRAVITY = -45;            // Downward acceleration
JUMP_FORCE = 28;          // Vertical impulse on jump
MAX_VELOCITY = 22;        // Horizontal speed cap (exported)
STEER_SPEED = 22;         // Lateral input force

// Ball mass properties
MASS = 100;               // Heavy, dense feel
ANGULAR_DAMPING = 0.95;   // Slow spin decay
LINEAR_DAMPING = 0.5;     // Moderate drag

// Contact material
FRICTION = 1.0;           // High ground friction
RESTITUTION = 0.1;        // Minimal bounce
```

---

## Part 4: Asset Inventory

```
assets/
├── font/
│   └── 5x5dots.ttf              # Custom pixel font
├── image/
│   ├── ball/                     # Ball skin textures (.webp, .gif)
│   │   ├── rainbow.webp
│   │   ├── lava.webp
│   │   ├── groovy.webp          # Animated canvas texture
│   │   └── ... (65+ skin textures)
│   ├── sky/                      # Sky environment maps
│   │   ├── sky_day.webp
│   │   ├── sky_sunset.webp
│   │   ├── sky_night.webp
│   │   └── sky_void.webp
│   └── raw/                      # Source/unused assets
├── model/
│   ├── finish_gate.glb           # Finish line 3D model
│   ├── eye_low_poly_free_cute_eyeballs.glb  # GLTF ball skin
│   ├── scene_NEBULA.gltf + .bin  # Nebula GLTF ball skin
│   └── _halloween_Um_zumbi__0523105301_.glb  # Zombie trail model
└── sfx/
    ├── elevator_music.mp3        # Background music
    ├── rolling_loop.mp3          # Rolling sound (looped)
    ├── coin_collect.mp3          # Coin pickup
    ├── jump.mp3                  # Jump sound
    ├── finish_line.mp3           # Level complete
    └── fall_off.mp3              # Fall off edge
```

---

## Part 5: File Structure Summary

```
going-balls/
├── .github/workflows/ci.yml     # CI/CD pipeline
├── .codebuffrules                # AI safety rules
├── .gitignore
├── index.html                    # App shell + import map
├── main.js                       # Bootstrap DI (~600 lines)
├── networking.js                 # Root-level networking re-export
├── styles.css                    # All styles
├── sw.js                         # Service worker
├── manifest.json                 # PWA manifest
├── server.js                     # Dev server
├── package.json                  # Dev dependencies only
├── eslint.config.js              # Flat config
├── vitest.config.js              # Test config
├── lighthouserc.json             # Lighthouse CI config
│
├── engine/
│   └── scene.js                  # Three.js scene, materials, sky, ball skin
│
├── src/
│   ├── physics.js                # cannon-es world, forces, collisions, weather
│   ├── levelgen.js               # Procedural level generation (40+ types)
│   ├── ui.js                     # DOM UI: shop, leaderboard, settings
│   ├── audio.js                  # Music, SFX, AudioContext visualizer
│   ├── persistence.js            # localStorage, RNG, configs, weather AI
│   ├── networking.js             # WebsimSocket, loading, error handlers
│   ├── rendering.js              # rAF loop, camera, particle updates
│   ├── ball_db.js                # 65+ skin definitions (single source of truth)
│   ├── ball_index_ui.js          # Ball Index UI with remote stats
│   ├── notification_manager.js   # Toast notification pool
│   ├── speed_lines.js            # Speed lines VFX at high velocity
│   ├── motion_blur.js            # Motion blur post-processing
│   │
│   ├── builder/
│   │   ├── catalog.js            # 25+ part definitions
│   │   ├── builder_scene.js      # 3D builder scene
│   │   ├── builder_ui.js         # Builder sidebar UI
│   │   ├── builder_networking.js # Multiplayer sync + community modal
│   │   ├── builder_xp.js         # Builder progression system
│   │   ├── ws_app.js             # 3D Workshop entry point
│   │   ├── ws_scene.js           # Workshop scene
│   │   ├── ws_controls.js        # Orbit + Transform controls
│   │   ├── ws_state.js           # Workshop state
│   │   ├── ws_loaders.js         # Model import
│   │   ├── ws_operations.js      # Mesh operations
│   │   ├── ws_exporter.js        # GLTF export
│   │   ├── ws_painter.js         # Vertex paint
│   │   ├── ws_selection.js       # Click select
│   │   ├── ws_selectGroups.js    # Group management
│   │   ├── ws_lassoSelect.js     # Lasso selection
│   │   ├── ws_selectionHistory.js # Undo/redo
│   │   ├── ws_rigging.js         # Bone rigging
│   │   ├── ws_sculpting.js       # Vertex sculpting
│   │   ├── ws_wireframeEditor.js # Wireframe editor
│   │   ├── ws_modifiers.js       # Mesh modifiers
│   │   ├── ws_agent.js           # AI assistance
│   │   ├── ws_gallery.js         # Thumbnail generation
│   │   └── ws_uiPanels.js        # Floating UI panels
│   │
│   └── world/
│       ├── world_state.js        # WorldGrid class
│       ├── world_networking.js   # Multiplayer world sync
│       ├── world_ui.js           # World UI
│       ├── marketplace.js        # Buy/sell sites
│       ├── world_minimap.js      # Neighbor preview
│       └── world_arvr.js         # AR/VR integration
│
├── tests/
│   ├── persistence.test.js       # 15 tests
│   ├── levelgen.test.js          # 14 tests
│   ├── asset_loading.test.js     # 86 tests
│   └── ball_skin.test.js         # 26 tests
│
├── assets/                       # (see Part 4)
├── backups/                      # .bak files
└── build.md                      # This file
```

---

## Part 6: Quick Start

```bash
# Clone and install
git clone <repo>
cd going-balls
npm ci

# Development
npm run dev          # Starts server on http://localhost:3000

# Quality
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix lint issues
npm test             # Run 141 tests
npm run test:watch   # Watch mode

# Production
# Push to main → CI runs lint → tests → Lighthouse → GitHub Pages deploy
```

---

*This document was generated from the Going Balls codebase (v1.2.0) and covers all systems, build prompts, architecture decisions, and asset inventory needed to understand or recreate the platform.*
