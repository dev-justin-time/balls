# Changelog

All notable changes to Going Balls — Web Edition are documented here.

---

## v1.2.0 — 2026-06-22

### Infrastructure & CI/CD

- **GitHub Actions CI pipeline** (`.github/workflows/ci.yml`)
  - `lint-and-test` job: ESLint + Vitest (141 tests)
  - `lighthouse` job: Lighthouse CI audit (performance ≥0.5, accessibility ≥0.7, best-practices ≥0.7)
  - `deploy` job: GitHub Pages deploy (gates on lint-and-test + lighthouse)
  - Deploy stages only production files (`index.html`, `main.js`, `sw.js`, `src/`, `engine/`, `assets/`) into `_deploy/`

- **ESLint setup** (`eslint.config.js`)
  - Flat config with `eslint:recommended` + style rules
  - `lint` and `lint:fix` scripts added to `package.json`
  - 4 initial errors fixed

- **Lighthouse CI** (`lighthouserc.json`)
  - Desktop preset, performance/accessibility/best-practices assertions at warn level
  - Uses `npx serve` as local preview server for audit

- **`@lhci/cli@0.15.1`** added as devDependency

### Service Worker & PWA

- **Service worker** (`sw.js`)
  - SHA-stamped cache version (CI stamps git SHA via `sed` on deploy)
  - Stale-while-revalidate asset strategy (serve cached instantly, fetch in background)
  - Network-first for navigation requests
  - Old cache purging on activate

- **PWA manifest** (`manifest.json`)
  - `display: fullscreen`, `orientation: any`
  - Background/theme colors, categories, webp icon
  - `<link rel="manifest">` added to `index.html`

### SEO & Meta Tags

- **Open Graph tags**: og:type, og:title, og:description, og:image (absolute URL), og:image:alt
- **Twitter Card tags**: summary_large_image with matching title, description, image
- **Meta description** and **theme-color** (`#87ceeb`)
- **Favicon** and **apple-touch-icon** using `ball.webp`

### Testing

- **Ball skin unit tests** (`tests/ball_skin.test.js`) — 26 tests
  - `getBallMaterial`: 7 tests (texture, color, emissive, missing skin, ability keys)
  - `applyBallSkin`: 8 tests (texture swap, gltf loading, color, emissive, default restoration)
  - `levelUpSkin`: 7 tests (XP thresholds, max level, persistence)
  - 4 additional edge-case tests
- **Total test count**: 141 tests (86 asset + 14 levelgen + 15 persistence + 26 ball skin)

### Performance & Memory Fixes

- **Geometry disposal in `clearLevel()`** (`src/levelgen.js`)
  - Added `mesh.geometry.dispose()` for `levelObjects`, coins, pendulums (including line geometry), spinners, movers, glass platforms
  - Fixes GPU memory leak where per-level geometries accumulated across level resets

- **Trail instance disposal** (`src/levelgen.js`)
  - Trail clones on pendulums, spinners, and movers now disposed via `disposeMesh()` on level reset
  - Prevents scene graph accumulation and GPU memory leaks from GLB trail clones

- **`disposeMesh()` exported** (`engine/scene.js`)
  - Was private function, now exported for use in `levelgen.js`
  - Traverses mesh tree, disposes all child geometries/materials (including textures), removes from parent

- **Neon material clone fix** (`src/levelgen.js`)
  - Fixed `under.material.transparent = true` mutating shared neon material
  - Now properly clones via `game.sharedMaterials.neon.clone()` before modifying

### Ball Skins

- **Single source of truth** (`src/ball_db.js`)
  - 65+ skins consolidated into `BALL_DB` object
  - Removed duplicate definitions from `main.js`
  - Texture references updated to use actual available assets

### Dev Script Fix

- **`serve` compatibility** (`package.json`)
  - Changed `serve -o` to `serve --open` (serve v14+ dropped `-o` flag)

---

## v1.1.0 — 2026-06-21

### Architecture

- **Modular refactor**: Monolithic `main.js` split into 12 focused modules
  - `engine/scene.js` — Three.js scene, camera, renderer, materials, sky, textures
  - `src/physics.js` — cannon-es world, ball body, forces, obstacle collision
  - `src/levelgen.js` — Procedural level generation, segment builders, coin spawning
  - `src/ui.js` — DOM UI, modals, shop, skins/skies/powerups grids, leaderboard
  - `src/audio.js` — Audio init, music toggle, SFX pool
  - `src/persistence.js` — localStorage save/load, configs, mulberry32 RNG
  - `src/networking.js` — WebsimSocket init, loading manager, error handlers
  - `src/rendering.js` — Animation loop, camera follow, particle updates
  - `src/ball_db.js` — Ball skin data (single source of truth)
  - `src/ball_index_ui.js` — Ball Index UI rendering
  - `src/notification_manager.js` — Toast notification pool
  - `sw.js` — Service worker

- **Dependency injection pattern**: `game` object passed as first parameter to all module functions

### Bug Fixes

- **Operator precedence bug** in `updatePhysics` — fixed `&&`/`||` binding with parentheses
- **Nebula skin type mismatch** — changed `type: 'texture'` to `type: 'gltf'`
- **Double level-scaling** in `triggerDropFromObstacle` — removed redundant scaling
- **Glass platform disposal** — added proper cleanup on level reset
- **Coin geometry reuse** — per-tier caching via `getCachedCoinGeo()` (5 sizes)

### Features

- **Sky conditions system** — 12 sky types including 4 condition-based skies:
  - Storm Front (1.3× coins, rain/wind)
  - Inferno (1.5× coins, fire sparks, speed boost)
  - Frostbite (1.4× coins, snow, ice patches)
  - Void Storm (2.0× coins, meteors, forced wind)

- **Weather AI** — `weatherAI.chooseWeather(level)` with weighted scoring and persistent bias learning

- **Hazards & coin-drop system** — Pendulums, spinners, movers, meteors drop coins on contact
  - 10 trail sprite/model types for visual flair
  - Dropped coins spawn as collectible pickups

- **Procedural level generation** — 40+ segment types, 9 difficulty tiers, seeded mulberry32 RNG

- **Deterministic seeding** — `?seed=12345` URL parameter support

### Performance

- **Particle count scaling** — `getParticleCount()` scales by hardwareConcurrency, device type, screen area
- **Vec3 pooling** — Pre-allocated instances on game object to avoid per-frame GC allocations
- **Shared material pool** — Wood, finish, coin, pendulum, spinner, rope, wall, speed, hazard, neon, glass

### Testing

- **Vitest setup** — jsdom environment, mock Three.js/CANNON
- **Test files**:
  - `tests/persistence.test.js` — RNG seeding, localStorage save/load, corruption recovery
  - `tests/levelgen.test.js` — Level generation with fixed seeds, segment validation
  - `tests/asset_loading.test.js` — Asset path validation, Three.js/CANNON mock integrity

### UX & Accessibility

- **Audio handling** — Autoplay policy compliance, AudioContext resume on first interaction
- **Pointer lock** — UI button with Escape release, hint overlay with localStorage dismiss
- **Accessibility** — 26+ aria-labels, focus-trap on modals, auto-focus management

### Multiplayer

- **WebsimSocket integration** — Room collections for leaderboard, player_clones, ball_stats
- **Retry/backoff** — 3 retries with exponential backoff (1s→2s→4s)
- **Data sanitization** — `sanitizeRemoteEntry()` for strings (≤128 chars), numbers (±1e9)

---

## v1.0.0 — 2026-06-21

### Initial Release

- **Core gameplay**: 3D rolling-platformer with Cannon-es physics + Three.js rendering
- **65+ ball skins** with abilities (speed/jump/coins) and level-up system
- **12 sky types** with PMREM environment maps
- **Procedural level generation** with 40+ segment types
- **Weather system** with AI-driven selection
- **Multiplayer leaderboard** via WebsimSocket
- **Mobile-first** with nipplejs virtual joystick
- **Custom pixel font** (5x5dots.ttf)
- **Audio system** with background music and SFX pool
- **Persistent data** via localStorage with corruption recovery
- **Asset optimization** — ~40% size reduction via WebP textures and optimized GLB models
