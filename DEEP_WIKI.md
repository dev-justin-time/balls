# Going Balls — Deep Developer Wiki

Version: 1.0  
Generated: 2026-06-21

Purpose
-------
This document is the single-source deep wiki for the Going Balls — Web Edition project. It explains architecture, subsystems, configuration knobs, tuning notes, build/deploy guidance, debugging tips, extension points, asset handling, and multiplayer/room integration. Use it to onboard developers, guide modders, and maintain the game.

Table of Contents
-----------------
- Project overview
- File structure & key assets
- Runtime architecture
  - Rendering & scene management
  - Physics
  - Input & controls
  - Audio
  - UI & persistent data
  - Procedural level generation
  - Weather AI
  - Multiplayer & persistent leaderboard
- Configuration and tuning parameters
- Asset handling and fallbacks
- Adding new skins / skies
- Extending levels and obstacles
- Performance optimization checklist
- Debugging & common errors
- Build, test, and deployment
- FAQ & troubleshooting
- API reference (short)
- Contact & contribution notes

Project overview
----------------
Going Balls — Web Edition is a lightweight, mobile-first 3D rolling-platformer that combines Cannon-es physics with Three.js rendering. The codebase favors robustness: graceful asset fallback, aggressive error handling, and client-side persistence (localStorage) with optional multiplayer persistence via WebsimSocket room collections.

File structure & key assets
--------------------------
- index.html — App shell, import map, UI skeleton and modal markup.
- main.js — Full client: initialization, scene/physics, input, UI, audio, level generator.
- DEEP_WIKI.md — (this file) developer wiki.
- /scene_NEBULA.gltf, /scene_NEBULA.bin — optional finish model.
- /sky_*.png — equirectangular panoramas used as skyboxes.
- ball_* .png, wood_texture.png — skin & texture assets.
- /Elevator Music.mp3, /rolling_loop.mp3, /jump.mp3, /coin_collect.mp3, /finish_line.mp3, /fall_off.mp3 — SFX and music.

Runtime architecture
--------------------

Rendering & scene management
- Renderer: Three.WebGLRenderer with ACESFilmicToneMapping and sRGB texture encoding to improve visual fidelity.
- Sky: Equirectangular panoramas are converted into PMREM env maps when available. A large inverted sphere (skyMesh) rotates slowly to provide parallax and motion.
- Materials: Uses a small set of shared materials (wood, finish, hazard, neon, glass). PBR-like behavior is emulated using MeshStandard/PMREM where possible.
- Scene lifecycle: applySkyConfig handles smooth crossfades and env map generation and ensures previous resources are disposed.

Physics
- Engine: cannon-es.
- World: gravity set to GRAVITY (strong negative Y), allowSleep enabled, contact materials configured for ball-ground interactions.
- Ball: represented by a CANNON.Sphere and heavy mass to create a "dense" feel; angularDamping/linearDamping tuned for responsive rolling.
- Level elements: static bodies (platforms, ramps, walls) are represented with CANNON.Box and added/removed during level lifecycle.

Input & controls
- Desktop: WASD / Arrow keys influence physics input; Space triggers jump; mouse drag rotates camera/steers.
- Mobile: nipplejs virtual joystick (zone: #joystick-container) handles analog steering and power, with sliders to control power and deadzone.
- Pointer lock support: requested for desktop to allow mouse-look when UI is hidden; camera yaw/pitch clamped to prevent over-rotation.

Audio
- Background music: Elevator Music loop, volume toggles persisted in localStorage.
- Rolling SFX: rolling_loop.mp3, dynamically adjusts volume and playbackRate according to ground speed.
- One-shot SFX: jump.mp3, coin_collect.mp3, finish_line.mp3, fall_off.mp3. playSound(name) creates a temporary Audio and plays it.
- Resuming: audio play is resumed after first user interaction to comply with browser autoplay policies.

UI & persistent data
- Persisted state: saved in localStorage under goingBallsData_v1. This contains unlocked skins, wallets, selected sky/ball, and a simple weather bias map.
- Leaderboard: localStorage goingBallsLeaderboard_v1; mirrored (best-effort) to room.collection('leaderboard') when available.
- Settings: joystick power/deadzone persisted in sessionStorage; music toggle persisted in localStorage.

Procedural level generation
- Generator: createLevel builds a linear set of segments (configurable count) using segment "sub-generators" (straight, ramp, narrow, pendulum, spinner, glass, etc.).
- Difficulty tiers: multi-tier chart that maps level number to allowed segment types and visual tint (fog color).
- Mirroring: even-numbered levels are mirrored horizontally (MX helper).
- Checkpoints: inserted at intervals; captured as small physical platforms and logic markers to reposition the player on reset.
- Level length: stored in this.levelLength; progress calculated based on ballBody.position.z vs. this.levelLength.
- Finish model: attempts to load a GLB; falls back to a simple in-scene arch/faux-gate if the model fails to load.

Weather AI
- Weather types: ['clear', 'rain', 'wind', 'snow', 'mixed'].
- Simple weighted choice: weatherAI.chooseWeather(level) uses level patterns plus a persistent bias map to probabilistically pick weather.
- Effects:
  - rain: particle system (this.rainPoints), friction reduction on contact materials
  - wind: lightweight particle streaks and lateral forces applied each physics step
  - snow: slower falling points, additional friction tweaks and occasional stickiness
- Records chosen weather back into saveData.weatherPrefs.bias to "learn" simple preferences.

Multiplayer & persistent leaderboard
- Room: uses WebsimSocket to initialize a room and mirror leaderboard data.
- Collections: uses room.collection('leaderboard').create / getList / subscribe where available; code is defensive against room initialization failures.
- Permission model: local writes are always allowed; remote writes are best-effort (network & permissions may fail silently).
- Presence: the project uses WebsimSocket only for persisted leaderboard and does not sync live player positions to room presence.

Configuration and tuning parameters
-----------------------------------
Key constants in main.js (tune these to change player feel):
- BALL_RADIUS = 0.5
- GRAVITY = -45
- BALL_SPEED = 5000
- STEER_SPEED = 22
- MAX_VELOCITY = 18
- JUMP_FORCE = 25

Adjustables persisted in UI:
- joystickPower (sessionStorage: goingBalls_joystickPower)
- joystickDeadzone (sessionStorage: goingBalls_joystickDeadzone)
- musicEnabled (localStorage: goingBalls_musicEnabled)

Asset handling and fallbacks
----------------------------
- Textures are loaded via TextureLoader and cached; on error, a 1x1 DataTexture fallback is installed.
- GLB model load is wrapped with try/catch and fallback to createFallbackFinishModel() exists.
- Global window handlers: unhandledrejection and error events provide fallback to ensure the app continues running and to present a user-facing toast when network assets fail.

Adding new skins / skies
------------------------
To add a new ball skin:
1. Add the texture file to the project root (e.g., myball.png).
2. Add an entry in main.js this.ballConfigs with:
   key: { name: 'My Ball', price: 150, tex: 'myball.png', type: 'texture' }
3. Optionally include unlockedBalls default in saveData to make it immediately available for testing.

To add a sky:
1. Add an equirectangular PNG (recommended) named sky_new.png.
2. Add to this.skyConfigs:
   key: { name: 'My Sky', price: 200, tex: 'sky_new.png', color: 0x112233 }
3. The applySkyConfig routine will attempt PMREM generation and will create the rotating sky sphere.

Extending levels and obstacles
------------------------------
- Add new segment types by extending the segmentTypes array in createLevel and implementing a generator case within the main switch.
- Use addPlatform, addRamp, addPendulum, addSpinner, addMover, addGlassPlatform utility methods for consistent mesh/body creation and cleanup.
- To create physics-driven dynamic hazards (e.g., swinging logs), create dynamic CANNON.Body entries and update their transforms each physics step; append to this.movers or custom arrays and ensure they are cleared in clearLevel().

Performance optimization checklist
---------------------------------
- Reduce canvas size / set renderer.setPixelRatio(1) on low-power devices.
- Limit particle counts for rain/wind on mobile (scale based on device detection).
- Reuse geometries and materials where possible — remove frequent object creation in hot loops (e.g., reuse coin geometry).
- Use frustumCulled = false sparingly; prefer grouping dynamic particles into a single BufferGeometry for efficient updates.
- Limit shadow map size or disable shadows on weaker devices.
- Throttle UI DOM updates (e.g., progress display) and avoid heavy operations in the animation frame.

Debugging & common errors
-------------------------
- "network error" or texture/GLB load failures: check console toast, and confirm assets exist; the app will fallback to safe textures/models.
- Unhandled Promise Rejections: main.js registers an unhandledrejection handler that logs and suppresses noisy failures; inspect console for concise diagnostics.
- WebGPURenderer errors: this project uses WebGLRenderer to avoid unexported WebGPU modules; don't import experimental WebGPU unless explicitly adding feature detection.
- Pointer lock not engaging on mobile: requestPointerLock is disabled on many mobile browsers and will not throw — rely on touchscreen joystick instead.

Build, test, and deployment
---------------------------
- The app ships as static files. Host index.html, main.js and assets on any static file host.
- For local development, use a static server (e.g., `npx http-server .`) to avoid CORS issues with file:// loads.
- When adding large assets (GLBs, panoramas), ensure efficient compression (webp or optimized png) and keep sizes reasonable for mobile.
- Automated test idea: instrument deterministic seeds for level generation to assert consistent segment counts and ensure physics world steps do not produce NaNs.

FAQ & troubleshooting
---------------------
Q: Why is my sky or env map washed out?  
A: Ensure renderer.outputEncoding = THREE.sRGBEncoding and set texture.encoding = THREE.sRGBEncoding for equirectangular inputs.

Q: Ball clips through platforms on reset?  
A: Reset pushes the ball 1 unit up; if colliders are too thin or ramps angled steeply, increase spawn offset or adjust contactMaterial restitution/friction.

Q: How to add new remote leaderboard entries manually?  
A: Entries are mirrored using room.collection('leaderboard').create({ name, level, timeSec, score, timestamp }) — only available if WebsimSocket initialized successfully.

API reference (short)
---------------------
- room.collection('leaderboard').getList(), .create(obj), .subscribe(callback)
- window.websim.upload(file) -> URL (for posting images in comments)
- window.websim.postComment({ content, images, parent_comment_id, credits })
- websim.imageGen(...) — image generation (10s response expected)

Contact & contribution notes
----------------------------
- Keep changes minimal for mobile performance.
- Avoid adding heavy third-party dependencies unless tree-shakable and tiny.
- If submitting PRs, include performance impact notes and mobile profiling results.

Changelog
---------
- 1.0 — Initial deep wiki (2026-06-21): architecture, developer guidance, and extension points.

Appendix: Quick dev tips
------------------------
- To reproduce a specific level deterministically, set currentLevel and call createLevel() after setting Math.random seed (use a seeded RNG lib).
- To test weather transitions, temporarily call weatherAI.recordWeather('rain') from console and recreate level.
- To debug physics state, log this.world.bodies and inspect positions; avoid logging per-frame in production.

End of DEEP_WIKI.md