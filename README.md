# Going Balls - Web Edition

[![Version](https://img.shields.io/badge/version-1.2.0-blue?link=CHANGELOG.md)](./CHANGELOG.md)

A 3D physics-based rolling platformer inspired by "Going Balls".

## 🌐 Play Online

- **[websim.com/@ou812/going-balls-web-edition](https://websim.com/@ou812/going-balls-web-edition)**
- **[Balls-Going.on.websim.com](https://Balls-Going.on.websim.com)**

## Features
- Physics-driven ball movement using `cannon-es`.
- Dynamic camera following the player.
- Procedural level generator with many segment types (ramps, tunnels, pendulums, spinners, fragile glass, sticky/icy patches, moving hazards, curved sections, and more).
- Coin collection with five coin tiers (tiny → huge) and variable values/rarities.
- Ball skins system with 71+ unique skins driven by a merged Ball DB and a dedicated Ball Index UI for browsing, buying, equipping and leveling skins.
- Local and best-effort remote leaderboard seeding and mirroring via WebsimSocket.
- Mobile-friendly controls (virtual joystick via `nipplejs`) and desktop WASD/arrow + mouse drag controls.

## Controls
- Desktop: WASD / Arrow Keys to steer; Space to jump; Mouse drag to rotate camera/steer.
- Mobile: On-screen joystick to steer and Jump button to hop.

## Economy & Progression
- Wallet persists to localStorage; skins cost coins and can be leveled (max level 5) to improve abilities (speed, jump, coin multipliers).
- Coins come in five sizes with scaled values (2, 5, 12, 25, 50) and weighted rarity — larger coins are rarer.
- Skins include price-based speed bias so higher-cost skins give modest performance benefits in addition to ability multipliers.

## Hazards & Obstacles
- Pendulums, spinners, and moving hazards now drop coins on contact — the higher the level, the more coins lost.
- 10 trail types (skeleton, zombie, eye, soldier, venus, dragon, bowling strike, easter, life, love) attach to hazards for visual flair.

## Skies & Weather
- 12 sky types including 4 new condition-based skies: Storm Front (rain+wind), Inferno (heat haze), Frostbite (permanent snow), Void Storm (meteor hazards).
- Condition skies modify gameplay with coin multipliers, speed boosts/debuffs, and unique weather effects.

## Multiplayer / Persistence
- WebsimSocket is used for optional persistence: ball_stats and leaderboard collections are seeded and subscribed to when available so Ball Index and Leaderboard show aggregated data when online.
- Leaderboard entries are stored locally and mirrored to the room collection on a best-effort basis.

## Technical Details
- Rendering: Three.js (WebGLRenderer) with sRGB encoding and PMREM support for sky/environment maps.
- Physics: cannon-es, tuned for a heavy, dense ball feel (configurable constants in main.js).
- Audio: rolling, jump, coin, finish and fall sounds; background music with user toggle.
- Robust asset fallbacks: textures and GLTFs fall back gracefully to simple placeholders when loading fails.

## Adding new skins / skies
- Add texture files to the project and add entries to ballConfigs (or update ball_db.js) — the Ball Index UI and merging logic will pick them up automatically.
- Skies support equirectangular panoramas and glTF sky scenes; PMREM environment baking is attempted when available.

## Development & Debugging
- Use a static server (e.g., `npx http-server .`) to avoid CORS issues during local testing.
- Key tuning constants (BALL_SPEED, GRAVITY, MAX_VELOCITY, JUMP_FORCE) are in main.js for quick playfeel adjustments.
