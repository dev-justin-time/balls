# Going Balls — Deep Developer Wiki

Version: 1.1  
Generated: 2026-06-21

Purpose
-------
This document is the single-source deep wiki for the Going Balls — Web Edition project. It explains architecture, subsystems, configuration knobs, tuning notes, build/deploy guidance, debugging tips, extension points, asset handling, and multiplayer/room integration. Use this to onboard developers, guide modders, and maintain the game.

Table of Contents
-----------------
- Project overview
- Module architecture
- File structure & key assets
- Runtime architecture
  - Rendering & scene management
  - Physics
  - Input & controls
  - Audio
  - UI & persistent data
  - Procedural level generation
  - Weather AI
  - Sky conditions system
  - Multiplayer & persistent leaderboard
- Configuration and tuning parameters
- Asset handling and fallbacks
- Ball skin system
- Adding new skins / skies
- Extending levels and obstacles
- Hazards & coin-drop system
- Performance optimization checklist
- Testing
- Debugging & common errors
- Build, test, and deployment
- FAQ & troubleshooting
- API reference (short)
- Changelog

Project overview
----------------
Going Balls — Web Edition is a lightweight, mobile-first 3D rolling-platformer that combines Cannon-es physics with Three.js rendering. The codebase favors robustness: graceful asset fallback, aggressive error handling, and client-side persistence (localStorage) with optional multiplayer persistence via WebsimSocket room collections.

Module architecture
-------------------
The codebase is split into 10 focused modules plus the root bootstrap file. All modules use ES module `import`/`export` and follow a dependency-injection pattern where the `game` object is passed as the first parameter.

```
main.js                    — Thin DI bootstrap: creates Game class, wires modules
├── engine/scene.js        — Three.js scene, camera, renderer, materials, sky, textures, ball skin application
├── src/physics.js         — cannon-es world, ball body, forces, obstacle collision, particle weather effects
├── src/levelgen.js        — Procedural level generation, segment builders, coin spawning
├── src/ui.js              — DOM UI, modals, shop, skins/skies/powerups grids, leaderboard, game state
├── src/audio.js           — Audio init, music toggle, SFX pool (clone-based)
├── src/persistence.js     — localStorage save/load, configs, mulberry32 RNG, weather AI
├── src/networking.js      — WebsimSocket init, loading manager, global error handlers
├── src/rendering.js       — Animation loop, camera follow, rain/snow/fire particle updates
├── src/ball_db.js         — Ball skin data (single source of truth, 65+ skins)
├── src/ball_index_ui.js   — Ball Index UI rendering (remote stats merge, equip/buy/level)
└── src/notification_manager.js — Toast notification pool with rate limiting
```

**Import conventions:**
- Root `main.js` imports modules with `./src/<module>.js` or `./engine/<module>.js`
- Modules inside `src/` that need `engine/scene.js` use `../engine/scene.js`
- Modules inside `src/` reference each other with `./<module>.js`
- ES module `import`/`export` exclusively — no CommonJS

**DI pattern:**
- The `Game` class in `main.js` creates the shared `game` object
- Each module's init function receives `game` as first parameter
- Shared state (scene, world, ballBody, saveData, etc.) lives on `game`
- Module functions operate on `game` rather than using globals

File structure & key assets
---------------------------
```
index.html               — App shell, import map (three/cannon-es/nipplejs via esm.sh), CSS, UI skeleton
main.js                  — Bootstrap: Game class, controls, DI wiring (~350 lines)
engine/scene.js          — Three.js scene setup, materials, sky rendering, PMREM, ball skin swap
src/physics.js           — cannon-es world, ball physics, weather particles, obstacle collision
src/levelgen.js          — Procedural level generator (~40 segment types), coin/checkpoint/finish
src/ui.js                — All DOM UI: shop modals, grids, leaderboard, settings, game state checks
src/audio.js             — Audio init, music/SFX management, clone-based audio pool
src/persistence.js       — localStorage save/load, mulberry32 RNG, sky/powerup/weather configs
src/networking.js        — WebsimSocket, loading overlay, global error handlers
src/rendering.js         — requestAnimationFrame loop, camera follow, particle updates
src/ball_db.js           — BALL_DB: 65+ ball skin definitions (single source of truth)
src/ball_index_ui.js     — Ball Index UI: renders cards with remote stats, buy/equip/level actions
src/notification_manager.js — DOM toast pooling with rate limiting and max concurrent
tests/                   — Vitest tests: persistence, levelgen, asset loading
assets/image/            — Textures (.webp, .gif)
assets/model/            — 3D models (.glb, .gltf)
assets/sfx/              — Audio (.mp3)
assets/font/             — Fonts (.ttf)
```

Runtime architecture
--------------------

### Rendering & scene management
- **Renderer:** Three.WebGLRenderer with ACESFilmicToneMapping, sRGB texture encoding, PCFSoftShadowMap
- **Sky:** Equirectangular panoramas → PMREM env maps (when available). Large inverted sphere (skyMesh) rotates slowly for parallax. glTF sky scenes supported with cube-camera env baking.
- **Materials:** Shared material pool (wood, finish, coin, pendulum, spinner, rope, wall, speed, hazard, neon, glass). PBR-like behavior via MeshPhongMaterial + PMREM environment.
- **Scene lifecycle:** `applySkyConfig()` handles smooth crossfades, env map generation, and resource disposal for previous sky.
- **Ball skin system:** `getBallMaterial()` handles texture/color/emissive types. `applyBallSkin()` additionally handles gltf type with async GLB loading, caching, and mesh swap. Original sphere mesh preserved as `_defaultBallMesh` for restoration.

### Physics
- **Engine:** cannon-es
- **World:** gravity = -45, allowSleep enabled, ball-ground contact material (friction 1.0, restitution 0.1)
- **Ball:** CANNON.Sphere radius 0.5, mass 100, angularDamping 0.95, linearDamping 0.5 — creates a heavy, dense feel
- **Level elements:** Static CANNON.Box bodies for platforms, ramps, walls; dynamic bodies for pendulums, spinners, movers
- **Pooled vectors:** `_vecA`, `_vecB`, `_rayResult`, `_vecForce`, `_vec3A`, `_vec3Cam`, `_vec3Dir`, `_vec3Desired` — pre-allocated on game object to avoid per-frame GC allocations
- **Obstacle collision:** Distance-based checks for pendulums (contactDist 2.2), spinners (4.5), movers (2.8), and meteors (0.6 + radius) — triggers coin drop on contact

### Input & controls
- **Desktop:** WASD / Arrow keys → physics input; Space → jump; mouse drag → camera orbit + steer
- **Mobile:** nipplejs virtual joystick (#joystick-container) with configurable deadzone/power; Jump button
- **Pointer lock:** UI button (🖱️↔🔒), Escape to release, hint overlay with localStorage dismiss persistence
- **Camera:** Yaw/pitch orbit around ball with lerp smoothing; pitch clamped [0.15, 1.2]

### Audio
- **Background music:** elevator_music.mp3 loop, volume 0.18 (0.06 when menu/overlay open), localStorage toggle
- **Rolling SFX:** rolling_loop.mp3, volume dynamically scaled by ground speed (0–0.35)
- **One-shot SFX:** coin_collect, jump, finish_line, fall_off — clone-based pool, no cross-talk
- **Autoplay:** AudioContext resume + play() triggered on first keydown/mousedown/touchstart

### UI & persistent data
- **Persisted state:** localStorage key `goingBallsData_v1` — wallet, unlockedBalls, unlockedSkies, selectedBall, selectedSky, skinLevels, powerups, weatherPrefs
- **Leaderboard:** localStorage `goingBalls_leaderboard`; mirrored best-effort to room.collection('leaderboard')
- **Shop:** Tabbed modal (Skins, Skies, Powerups) with card grid, buy/equip/level actions
- **Ball Index:** Separate UI rendering remote ball_stats with sanitized merge
- **Settings:** Joystick deadzone/power sliders, music toggle

### Procedural level generation
- **Generator:** `createLevel(game, seed)` builds a linear sequence of segments using seeded mulberry32 RNG
- **Difficulty tiers:** 9 tiers (EASY → IMPOSSIBLE) mapping level number to allowed segment types and fog color
- **Segment types:** 40+ types including straight, ramp, narrow, pendulum, zigzag, gap, bumpy, spinner, stairs, tunnel, archipelago, checkerboard, hammer_gauntlet, moving_rects, speed_strip, halfpipe, side_crusher, jump_gap, double/triple_jump_gap, climb, glass, curve, loop_d_loop, spiral_tube
- **Mirroring:** Even-numbered levels mirrored horizontally (MX helper)
- **Checkpoints:** Inserted at intervals; ball respawns at last checkpoint on fall (y < -15)
- **Level scaling:** numSegments = 15 + floor(level × 2.5); baseWidth shrinks; hazard speed increases

### Weather AI
- **Types:** clear, rain, wind, snow, mixed
- **Selection:** `weatherAI.chooseWeather(level)` uses weighted scoring (level patterns + persistent bias map)
- **Effects:**
  - Rain: particle system, contact material friction reduction (~70%)
  - Wind: lateral force applied each physics step, particle streaks
  - Snow: slow falling particles, extra friction reduction (~55%), ice patches on Frostbite sky
- **Learning:** Records chosen weather into `saveData.weatherPrefs.bias` to influence future choices

### Sky conditions system
12 sky types including 4 condition-based skies that modify gameplay:

| Sky | Coin Bonus | Special Conditions |
|-----|-----------|-------------------|
| Storm Front | 1.3× | Rain (90%), Wind (50%) |
| Inferno | 1.5× | Fire sparks, heat shimmer, speed boost 1.15× |
| Frostbite | 1.4× | Permanent snow, ice patches |
| Void Storm | 2.0× | Meteors, forced wind, speed debuff 0.85× |

Condition skies apply coin multipliers (via checkGameState), speed modifiers (via updatePhysics), and spawn weather-specific particle/physics effects.

### Multiplayer & persistent leaderboard
- **Room:** WebsimSocket initialization with retry/backoff (3 retries, exponential 1s→2s→4s)
- **Collections:** leaderboard, player_clones, ball_stats — subscribed when room is ready
- **Sanitization:** `sanitizeRemoteEntry()` applied to all incoming data — strings ≤128 chars, numbers clamped to [-1e9, 1e9], empty entries dropped
- **Permission model:** Local writes always allowed; remote writes best-effort
- **Ball stats seeding:** 5 sample records created on first successful connection

Configuration and tuning parameters
-----------------------------------
Key constants in src/physics.js (tune these to change player feel):
```
BALL_RADIUS = 0.5
GRAVITY = -45
BALL_SPEED = 5000
STEER_SPEED = 22
MAX_VELOCITY = 18
JUMP_FORCE = 25
```

Adjustables persisted in UI:
- `joystickDeadzone` — default 0.10, range 0–0.30
- `joystickPower` — default 1.0, range 0.5–2.0
- `musicEnabled` — localStorage `goingBalls_musicEnabled`

Asset handling and fallbacks
----------------------------
- **Textures:** Loaded via TextureLoader, cached in `game.textureCache` (Map). On error: 1×1 DataTexture fallback (grey).
- **GLTF models:** Loaded via GLTFLoader. Finish model falls back to `createFallbackFinishModel()` (green arch). Ball GLTF skins show white ball during async load.
- **Sky textures:** PMREM generation attempted; falls back to Color background on failure.
- **Global error handlers:** `unhandledrejection` and `error` events caught in networking.js — suppresses noisy network failures, shows user-facing toast on first failure.
- **Loading overlay:** Dismissed when both assets loaded AND scene initialized (or after 6s safety timeout).

Ball skin system
----------------
- **Single source of truth:** `BALL_DB` object in `src/ball_db.js` — 65+ skins with name, price, tex, type, ability, description
- **Types:** `texture` (image mapped to sphere), `gltf` (3D model replaces ball mesh), `color` (solid color), `emissive` (emissive material)
- **Abilities:** Each skin has one ability (speed/jump/coins) with base value and per-level scaling (max level 5)
- **Price-based speed bias:** Higher-priced skins get a small passive speed bonus (up to +12% at 12000 coins)
- **Special skins:** `groovy` uses animated canvas texture; `p2opp` uses env-map reflections; `eye_ball` uses GLTF model

Adding new skins / skies
------------------------
To add a new ball skin:
1. Add the texture file to `assets/image/` (preferred: .webp)
2. Add entry in `src/ball_db.js` BALL_DB:
```js
my_skin: {
  name: 'My Skin',
  price: 150,
  tex: 'assets/image/my_skin.webp',
  type: 'texture',           // or 'gltf' for model files
  ability: { key: 'speed', base: 1.0, perLevel: 0.05 },
  description: 'Description text.'
}
```
3. The Ball Index UI and Shop grids pick it up automatically

To add a new sky:
1. Add equirectangular image to `assets/image/` (preferred: .webp)
2. Add entry in `src/persistence.js` skyConfigs:
```js
my_sky: {
  name: 'My Sky',
  price: 200,
  tex: 'assets/image/sky_my.webp',
  color: 0x112233,
  conditions: { coinBonus: 1.2, speedBoost: 1.1 }  // optional
}
```
3. `applySkyConfig` handles PMREM generation and sky sphere creation

Extending levels and obstacles
------------------------------
- Add new segment types in the `difficultyTiers` type arrays and implement a `case` in the `createLevel` switch statement
- Use existing builder functions: `addPlatform`, `addRamp`, `addPendulum`, `addSpinner`, `addHammer`, `addMover`, `addWall`, `addGlassPlatform`, `addTunnelWalls`, `addCoins`, `addCheckpoint`
- For physics-driven dynamic hazards: create `CANNON.Body` entries, update transforms in `updatePhysics`, append to appropriate array (`game.pendulums`, `game.spinners`, `game.movers`), clear in `clearLevel()`
- Trail attachments: Hazard builders look up `game._trailModelPool` keys and attach sprite/model clones

Hazards & coin-drop system
--------------------------
- Pendulums, spinners, movers, and meteors drop coins on contact with the player ball
- Coin loss scales with level: `baseLoss * (1 + (currentLevel - 1) * multiplier)`
- Dropped coins spawn as collectible pickups (user can reclaim them)
- 10 trail sprite/model types attach to hazards for visual flair: skeleton, zombie, eye, soldier2, venus, dragon, bowling_strike, easter, life, love

Testing
-------
- **Framework:** Vitest with jsdom environment
- **Test files:** `tests/persistence.test.js`, `tests/levelgen.test.js`, `tests/asset_loading.test.js` — 115 tests total
- **Run:** `npm test` or `npx vitest run`
- **Coverage:** `npm run test:coverage`
- **What's tested:** Deterministic RNG seeding, localStorage save/load/corruption recovery, level generation with fixed seeds, asset path validation, Three.js/CANNON mock integrity

Performance optimization checklist
----------------------------------
- Reduce canvas size / `renderer.setPixelRatio(1)` on low-power devices (auto-detected)
- Limit particle counts for rain/wind/snow/fire on mobile via `getParticleCount()` — scales by hardwareConcurrency, screen area, device type
- Pool Vec3 instances on game object to avoid per-frame GC allocations
- Reuse geometries where possible (coin geometry per-tier reuse is a known TODO)
- Use `frustumCulled = false` sparingly; particle systems grouped into single BufferGeometry
- Shadow map: 2048×2048 PCFSoft — consider reducing on weaker devices
- Auto-save throttled to every 5 seconds
- Audio SFX uses clone-based pool to avoid AudioContext bottleneck

Debugging & common errors
-------------------------
- **"network error" or texture/GLB load failures:** Check console toast; app falls back to safe textures/models automatically
- **Unhandled Promise Rejections:** networking.js registers a global handler that logs and suppresses noisy network failures
- **Pointer lock not engaging on mobile:** `requestPointerLock` is disabled on many mobile browsers — rely on touchscreen joystick
- **Ball clips through platforms on reset:** Increase spawn offset or adjust contactMaterial restitution/friction
- **Level seems too easy/hard:** Check `difficultyTiers` in levelgen.js; verify `currentLevel` is incrementing correctly
- **Weather not applying:** Check `skyConfigs[selectedSky].conditions` and verify `weatherAI.chooseWeather()` return

Build, test, and deployment
---------------------------
- **Static deployment:** Host index.html, main.js, src/, engine/, and assets/ on any static file server
- **Local dev:** `npm run dev` (uses `serve -o`) or `npx http-server .` to avoid CORS issues
- **Asset compression:** All images should be .webp; GLB models should be optimized; audio compressed with ffmpeg
- **No build step required:** ES modules loaded directly via import map (three, cannon-es, nipplejs from esm.sh CDN)

FAQ & troubleshooting
---------------------
**Q: Why is my sky or env map washed out?**  
A: Ensure `renderer.outputEncoding = THREE.sRGBEncoding` and set `texture.encoding = THREE.sRGBEncoding` for equirectangular inputs. Both are set in engine/scene.js.

**Q: Ball clips through platforms on reset?**  
A: Reset pushes the ball to `lastCheckpointPos` (1 unit above checkpoint). If colliders are too thin or ramps steep, increase spawn offset or adjust `contactMaterial` restitution/friction.

**Q: How to add new remote leaderboard entries manually?**  
A: Entries are mirrored using `room.collection('leaderboard').create({ level, time, coins, ball, score })` — only available if WebsimSocket initialized successfully.

**Q: How does deterministic level generation work?**  
A: `createLevel(game, seed)` uses mulberry32 PRNG seeded from the `seed` parameter or URL `?seed=` param. All `rand()` calls within the generator use this seeded RNG. Module-level `_rand` is swapped during generation and restored afterward.

**Q: How do condition skies affect gameplay?**  
A: Condition skies (storm, inferno, frostbite, voidstorm) set `game.skyConfigs[selectedSky].conditions` which are read by `checkGameState` (coin multipliers), `updatePhysics` (speed modifiers), and `createLevel` (weather particle spawning).

API reference (short)
---------------------
- `room.collection('leaderboard').getList()`, `.create(obj)`, `.subscribe(callback)`
- `room.collection('ball_stats').getList()`, `.create(obj)`, `.subscribe(callback)`
- `window.websim.upload(file)` → URL (for posting images in comments)
- `window.websim.postComment({ content, images, parent_comment_id, credits })`
- `websim.imageGen(...)` — image generation (10s response expected)

Changelog
---------
- **1.1** (2026-06-21): Updated for modular architecture (10 modules), added sky conditions, hazards/coin-drop system, testing section, ball skin system docs, condition skies table.
- **1.0** (2026-06-21): Initial deep wiki — architecture, developer guidance, and extension points.

Appendix: Quick dev tips
------------------------
- **Deterministic levels:** Set `game.currentLevel` and call `createLevel(game, seed)` with a fixed seed. All rand() calls within use the seeded PRNG.
- **Weather testing:** Call `weatherAI.recordWeather('rain')` from console, then `createLevel(game)` to apply.
- **Physics debugging:** Log `game.world.bodies` and inspect positions; avoid per-frame logging in production.
- **Ball skin testing:** Add skin key to `game.saveData.unlockedBalls` array and set `game.saveData.selectedBall = key`, then call `applyBallSkin(game, game.ballConfigs[key])`.
- **Performance profiling:** Use Chrome DevTools Performance tab; look for long frames (>16ms), excessive GC, or texture upload spikes.
