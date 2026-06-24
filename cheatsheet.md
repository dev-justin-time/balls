# Going Balls — Cheat Sheet

> **v1.2.0+ | Browser PWA | Zero-build-step ES Modules | Three.js + cannon-es**

---

## Quick Start

```bash
npm ci && npm run dev        # Local dev on :3000
npm test                     # 141 vitest tests
npm run lint                 # ESLint (src/ engine/ main.js)
npm run lint:fix             # Auto-fix
# Push to main → CI: lint → test → Lighthouse → GitHub Pages
```

## Physics Constants (`src/physics.js`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_VELOCITY` | **22** | Horizontal speed cap (exported) |
| `JUMP_FORCE` | **28** | Vertical impulse on jump |
| `GRAVITY` | -45 | Downward acceleration |
| `BALL_RADIUS` | 0.5 | Ball size |
| `STEER_SPEED` | 22 | Lateral input force |
| Ball mass | 100 | Heavy, dense feel |
| Angular damping | 0.95 | Slow spin decay |
| Linear damping | 0.5 | Moderate drag |
| Ground friction | 1.0 | High grip |
| Spring pad `bouncePower` | **18** | Launch height |

## Module Map (50+ files)

```
main.js                    → DI bootstrap, Game class, controls
├── engine/scene.js        → Three.js scene, camera, renderer, materials, sky, ball skin
├── src/physics.js         → cannon-es world, forces, collisions, weather particles
├── src/levelgen.js        → 40+ segment types, 9 difficulty tiers, seeded RNG
├── src/ui.js              → Shop, leaderboard, ball index, settings, game state
├── src/audio.js           → Music, SFX pool, AudioContext visualizer
├── src/persistence.js     → localStorage, mulberry32 RNG, sky/powerup configs, weather AI
├── src/networking.js      → WebsimSocket, loading manager, error handlers
├── src/rendering.js       → rAF loop, camera follow, particle updates
├── src/ball_db.js         → 65+ skin definitions (single source of truth)
├── src/ball_index_ui.js   → Ball index UI with remote stats
├── src/notification_manager.js → Toast notification pool
├── src/speed_lines.js     → 64 LineSegments, velocity-linked opacity
├── src/motion_blur.js     → Two-pass directional blur (shader-based)
├── src/builder/
│   ├── catalog.js         → 25+ part definitions (5 categories)
│   ├── builder_scene.js   → 3D builder scene with grid
│   ├── builder_ui.js      → Sidebar UI, XP bar, actions
│   ├── builder_networking.js → Multiplayer sync, community modal, likes/ratings
│   ├── builder_xp.js      → XP & leveling (9 rank titles)
│   ├── ws_*.js (20 files) → 3D Workshop (sculpt/paint/lasso/export)
├── src/world/
│   ├── world_state.js     → WorldGrid, sites, terrain presets
│   ├── world_networking.js → Real-time world sync
│   ├── world_ui.js        → Grid view, site cards
│   ├── marketplace.js     → Buy/sell sites, blueprints
│   ├── world_minimap.js   → Neighbor 3D preview
│   └── world_arvr.js      → AR/VR pointers
└── tests/                 → persistence, levelgen, asset_loading, ball_skin
```

## Architecture in 10 Words

**`game` object DI → 12 modules → Three.js + cannon-es → WebsimSocket optional**

## Key Design Decisions

- **Zero build step** — ES modules via import map (esm.sh CDN). No bundler.
- **DI via `game`** — Every module function takes `game` as first param. No globals.
- **Fallback-everything** — Textures→grey, GLTFs→geometry, sky→color, network→offline.
- **SHA cache busting** — CI stamps git SHA into `sw.js` on deploy.
- **Seeded RNG** — `?seed=12345` URL param for deterministic levels.

## Core Gameplay Loop

```
Steer ball → Collect coins → Avoid hazards → Reach finish → Next level
  ↑                                                        ↓
  └── Checkpoint respawn ← Fall off edge (y < -15) ← Harder obstacles
```

## Six Experiences

1. **Core Game** — Procedural levels, 9 difficulty tiers, coin collection
2. **Track Builder** — 25+ part types, save/share/community, XP progression
3. **3D Workshop** — Model editor (sculpt/paint/lasso/rig/export)
4. **Community Hub** — Browse/rate/like/trending tracks
5. **World Grid** — Shared persistent universe, site marketplace
6. **Survival Mode** — Endless escalating difficulty

## Assets

```
assets/font/5x5dots.ttf     assets/model/*.glb,*.gltf
assets/image/ball/*.webp     assets/image/sky/*.webp
assets/sfx/*.mp3             (6 audio files)
```

## CI/CD Pipeline

```
push to main → lint-and-test (ESLint + 141 vitest)
            → Lighthouse CI (perf≥0.5, a11y≥0.7)
            → GitHub Pages deploy (SHA-stamped SW)
```

## Weather & Sky Conditions

| Sky | Coin Bonus | Conditions |
|-----|-----------|------------|
| Storm Front | 1.3× | Rain 90%, Wind 50% |
| Inferno | 1.5× | Fire sparks, heat haze, speed +15% |
| Frostbite | 1.4× | Permanent snow, ice patches |
| Void Storm | 2.0× | Meteors, forced wind, speed -15% |

## Skin Abilities (max level 5)

- **Speed** — Increases `speedMult` in physics
- **Jump** — Increases `jumpMult` in jump function
- **Coins** — Multiplies coin pickup value
- Price-based bias: higher cost → up to +12% passive speed

---

*Full details: `build.md` | Diagrams: `architecture.md`*
