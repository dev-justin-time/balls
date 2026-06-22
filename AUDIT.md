# Going Balls — Code Audit & Improvement Plan

Updated: 2026-06-21 (after refactor + optimization pass)

Purpose
-------
Concise audit of the codebase with prioritized issues and actionable improvement plans.
Updated to reflect completed work, remaining items, and new issues discovered during refactoring.

Status key: ✅ Done  🔶 Partial  ⬜ Not started

Executive summary
-----------------
Major progress: the monolithic main.js has been split into 10 modules, assets optimized (~40% size reduction), ball configs consolidated to a single source of truth, and a .codebuffrules safety file established.
Remaining work: per-frame GC reduction, naming conventions, accessibility, pointer lock UX, and the eye_ball GLTF skin rendering bug.

---

## Priority 1 — Correctness & Safety

### 1. ✅ Missing deterministic seeding for procedural levels
- Status: DONE. mulberry32 in persistence.js, URL param ?seed=12345 support, passed into createLevel.
- Fix applied: src/persistence.js exports mulberry32, initPersistence reads URL seed, createLevel accepts seed.

### 2. 🔶 Global variable leakage and mixed responsibilities
- Status: PARTIAL. `room` now passed explicitly to modules (saveLeaderboard, addLeaderboardEntry, checkGameState, gameOver, setupUI, renderBallIndex, renderLeaderboard). `window._room` still used as fallback in addLeaderboardEntry.
- Remaining: eliminate window._room fallback. Remove window.__goingBalls* flags by moving to module-scoped state.

### 3. ✅ Unbounded memory/DOM updates on repeated toasts/popups
- Status: DONE. src/notification_manager.js with pooling, rate-limiting, maxConcurrent=3, minIntervalMs.

---

## Priority 2 — Performance & Resource Management

### 1. 🔶 Textures and PMREM leaks
- Status: PARTIAL. _lastEnvMap.dispose() tracked when replacing env maps. textureCache with Map.
- Remaining: verify disposal in all code paths (sky switching, level reset). Add explicit cache clearing for hot-swap.

### 2. ✅ Particle counts on mobile
- Status: DONE. getParticleCount() in persistence.js uses hardwareConcurrency, userAgent mobile detection, screen area scaling.

### 3. ⬜ Frequent per-frame allocations
- Problem: Temporary CANNON.Vec3 and arrays allocated in updatePhysics() every frame create GC churn.
- Fix: Hoist reusable Vec3/Vector3 instances to game object scope in physics.js and rendering.js.
- Benefit: Reduced GC pauses, smoother 60fps.

---

## Priority 3 — Maintainability & Modularity

### 1. ✅ Monolithic main.js
- Status: DONE. Split into 10 modules:
  - `main.js` (root) — thin DI bootstrap shell (~250 lines)
  - `engine/scene.js` — Three.js scene, camera, materials, sky, textures
  - `src/physics.js` — cannon-es world, ball body, forces, particles
  - `src/levelgen.js` — procedural level generation + obstacle builders
  - `src/ui.js` — DOM UI, modals, shop, leaderboard, game state
  - `src/audio.js` — audio init, music toggle, SFX pool
  - `src/persistence.js` — localStorage, configs, RNG, weather AI
  - `src/networking.js` — WebsimSocket, loading manager, error handlers
  - `src/rendering.js` — animation loop, camera follow, particle updates
  - `src/ball_db.js` — ball skin data (single source of truth)
  - `src/ball_index_ui.js` — ball index UI
  - `src/notification_manager.js` — toast pooling/rate-limiting

### 2. ✅ Ball config duplication
- Status: DONE. ballConfigs now loaded directly from BALL_DB in ball_db.js via spread clone `{ ...BALL_DB }`. mergeBallDB() function removed. Single source of truth established.
- 71 ball skins in ball_db.js, descriptions included.

### 3. ⬜ Inconsistent naming and key casing
- Problem: Keys like "ball_key" in networking.js vs. camelCase keys in configs. No standard convention.
- Fix: Standardize on camelCase for JS object keys; keep snake_case for remote data only with adapter mapping.
- Benefit: Fewer mapping bugs, clearer code.

---

## Priority 4 — UX, Accessibility & Security

### 1. ✅ Audio handling & autoplay policies
- Status: DONE. registerSfx/playSound with clone-based Audio pool. AudioContext resume on first interaction. Music toggle with localStorage persistence. Audio files compressed 31% (1.07MB→736K).

### 2. ✅ Pointer lock and gesture handling
- Status: DONE. UI button (🖱️↔🔒), Escape to release, hint overlay, pitch clamp [0.15, 1.2].
- Problem: Pointer lock toggled with 'T' key, mouse interactions spread across many listeners. Desktop UX could be improved.
- Fix: Consolidate pointer lock behind explicit UI button, add hint overlay, clamp camera pitch.

### 3. ✅ Accessibility
- Status: DONE. 26 aria-labels added across index.html, ui.js, ball_index_ui.js, networking.js. Focus-trap in main.js. Auto-focus on modal open, restore on close.
- Problem: Many interactive elements lack ARIA labels. Modals not focus-trapped. Keyboard-only navigation incomplete.
- Note: gear-btn has aria-label, settings-btn has aria-label. help-btn, shop-btn, leaderboard-btn need labels.
- Fix: Add aria-label to all buttons, add focus-trap to modal container, ensure Tab order.

---

## Priority 5 — Multiplayer & Persistence

### 1. ✅ Race conditions with room initialization
- Status: DONE. Retry/backoff wrapper (3 retries, exponential backoff 1s→2s→4s), graceful fallback to dead room on failure.

### 2. ✅ Privacy / trust of mirrored remote data
- Status: DONE. sanitizeRemoteEntry() applied to leaderboard, player_clones, and ball_stats subscriptions. Strings ≤128 chars, numbers clamped to [-1e9, 1e9], empty entries dropped.

---

## NEW: Issues Discovered During Refactoring

### N1. ✅ eye_ball skin (type:'gltf') doesn't render
- Status: DONE. applyBallSkin() function in engine/scene.js handles gltf type with async GLB loading, caching, and mesh swap. Physics sync preserved.
- Problem: ball_db.js has eye_ball with type:'gltf' and tex pointing to eye_low_poly_free_cute_eyeballs.glb. getBallMaterial() in engine/scene.js only handles 'texture', 'color', 'emissive' types. Falls through to default white ball.
- Fix: Add 'gltf' type handler in getBallMaterial that loads the GLB model as the ball mesh.

### N2. ✅ `.glb` finish model has confusing dot-prefixed name
- Status: DONE. Renamed to finish_gate.glb, reference updated in engine/scene.js.
- Problem: The finish-line model is literally named `.glb` (hidden file on Unix). Hard to identify.
- Fix: Rename to `finish_gate.glb` and update reference in engine/scene.js.

### N3. ✅ Leftover window.__goingBalls* global flags
- Status: DONE. Moved to module-scoped `let` variables in networking.js.
- Problem: networking.js uses ~10 `window.__goingBalls*` flags for error state tracking. These pollute the global namespace.
- Fix: Move to module-scoped variables or a single `window.__goingBalls` namespace object.

### N4. ✅ No automated tests
- Status: DONE. 29 tests across 2 files (15 persistence + 14 levelgen). Vitest with jsdom, package.json with test scripts. Deterministic seed testing, localStorage mocking, full THREE/CANNON mocks for levelgen integration tests.

### N5. ✅ Assets optimized
- Status: DONE. PNG/JPG→WebP (28 files, ~60% avg savings). GIF→WebP (4 files, 98.6% savings). Audio compressed (6 files, 31% savings). Total: ~17MB→~10.2MB (40% reduction).

### N6. ✅ Asset paths fixed
- Status: DONE. All 175+ asset paths updated to assets/image/, assets/model/, assets/sfx/ prefixes. SFX filenames corrected (coin→coin_collect, finish→finish_line, fall→fall_off).

### N7. ✅ .codebuffrules safety file created
- Status: DONE. Rules for AI assistant: ask before delete, backup before destructive changes, asset conventions, module architecture map, import rules.

### N8. ✅ Press Start 2P font added
- Status: DONE. Retro pixel font via Google Fonts CDN, applied to game UI elements. Cascade protection keeps descriptions in system font.

---

## Actionable Roadmap (Updated)

- ✅ Week 0 (immediate): Seeded RNG, NotificationManager, PMREM tracking
- ✅ Week 1: Module DI wiring, ball config consolidation, room dependency threading
- ✅ Week 2: Monolithic split into 10 modules, asset optimization, SFX fixes
- ⬜ Week 3: GC allocation reduction, pointer lock UX, accessibility
- ⬜ Week 4: eye_ball GLTF rendering, .glb rename, global flag cleanup
- ⬜ Week 5+: Linting setup, CI, naming standardization
- ✅ Week 6: Coin-dropping obstacles (all levels + level scaling), 14 new ball skins, 4 new sky types, 5 new trail types, harder level segments

---

## Concrete PRs (prioritized)

1. ⬜ Fix eye_ball GLTF skin rendering in getBallMaterial
2. ⬜ Rename .glb → finish_gate.glb
3. ⬜ Reduce per-frame Vec3 allocations in updatePhysics
4. ⬜ Add unit tests for level generator with deterministic seeds
5. ⬜ Create package.json, add ESLint config, add npm test script
6. ⬜ Clean up window.__goingBalls* globals
7. ⬜ Add ARIA labels + focus trapping for modals
8. ⬜ Standardize naming conventions (camelCase for JS keys)
