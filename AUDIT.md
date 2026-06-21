<<<<<<< SEARCH
# Going Balls — Code Audit & Improvement Plan

Generated: 2026-06-21

Purpose
-------
Concise audit of the current codebase (index.html, main.js, ball_db.js) with prioritized issues and actionable improvement plans so you can incrementally harden, optimize, and extend the project.

Executive summary
-----------------
The project is feature-rich and robustly defensive about asset/room failures, with a polished gameplay loop and many UX touches. Key opportunities are maintainability, performance, modularity, security, and testability. Below are prioritized findings and concrete remediation tasks you can take on immediately.

Priority 1 — Correctness & Safety
--------------------------------
1. Missing deterministic seeding for procedural levels
   - Problem: Level generation uses Math.random() throughout making it non-deterministic for debugging, testing, and reproducible shared levels.
   - Fix: Introduce a small seeded RNG (e.g., mulberry32 or xorshift) and allow passing a seed into createLevel. Add dev/URL param to fix seed.
   - Benefit: Reproducible levels, easier debugging, deterministic tests.

2. Global variable leakage and mixed responsibilities
   - Problem: main.js references global `room`, `window.gameInstance` flags, and uses many top-level module-scope consts; `room` is conditionally used but sometimes referenced from other modules (ball_index_ui.js).
   - Fix: Pass `room` explicitly into modules that need it (renderBallIndexUI) and avoid implicit globals; encapsulate Game dependencies into a small API object.
   - Benefit: Fewer implicit dependencies, easier unit testing and reuse.

3. Unbounded memory/DOM updates on repeated toasts/popups
   - Problem: Temporary DOM toasts are created and may overlap; no global queue or max concurrent notifications.
   - Fix: Create a small notification manager with pooling and rate-limiting.
   - Benefit: Prevent DOM bloat and UX spam.

Priority 2 — Performance & Resource Management
---------------------------------------------
1. Textures and PMREM leaks
   - Problem: PMREM results and some generated textures may not be disposed when switching skies; this can leak VRAM over long sessions.
   - Fix: Track generated env maps and call dispose() when replacing. Ensure textureLoader caching can be cleared for hot-swap.
   - Benefit: Lower memory usage, improved long-play stability.

2. Particle counts on mobile
   - Problem: Rain/snow/wind use fixed counts (1200, 600) which is heavy for low-end devices.
   - Fix: Detect device performance (userAgent, hardwareConcurrency, mobile heuristics) and scale particle counts; provide quality presets.
   - Benefit: Stable framerate on mobile.

3. Frequent per-frame allocations
   - Problem: Temporary vectors and arrays allocated inside hot loops (e.g., updatePhysics) create GC churn.
   - Fix: Reuse Vector3/Cannon Vec3 instances and temporary arrays; hoist reusable objects to instance scope.
   - Benefit: Reduced GC pauses and smoother 60fps.

Priority 3 — Maintainability & Modularity
----------------------------------------
1. Monolithic main.js
   - Problem: main.js exceeds a single-responsibility scope—rendering, physics, UI, audio, level gen, persistence and networking are co-mingled.
   - Fix: Split into modules: engine/scene.js, physics.js, ui.js, levelgen.js, audio.js, persistence.js, and wire them via a lightweight DI pattern.
   - Benefit: Easier navigation, isolated testing, smaller patches.

2. Ball config duplication
   - Problem: ballConfigs is defined in main.js and merged with BALL_DB; duplication invites drift.
   - Fix: Consolidate canonical config into ball_db.js and import it as the single source of truth; main.js should only extend when necessary.
   - Benefit: Single point for skin metadata, easier content editing.

3. Inconsistent naming and key casing
   - Problem: Keys like "ball_key" vs "ballKey" vs conf keys lead to defensive mapping logic across modules.
   - Fix: Standardize on snake_case or camelCase across collections and mapping functions; add small adapter utilities.
   - Benefit: Fewer mapping bugs and clearer code.

Priority 4 — UX, Accessibility & Security
----------------------------------------
1. Audio handling & autoplay policies
   - Problem: Multiple Audio instances created per SFX play; mobile autoplay policies can mute audio or create many Audio objects.
   - Fix: Use a simple AudioPool for SFX and an AudioContext/resume gating strategy; reuse audio elements.
   - Benefit: Lower memory, consistent behavior across browsers.

2. Pointer lock and gesture handling
   - Problem: Pointer lock toggles and mouse interactions are tied to many global listeners; mobile fallback is fine but desktop gesture UX can be improved.
   - Fix: Consolidate pointer lock requests behind explicit user action and improve hints; clamp camera pitch strictly to avoid over-rotation.
   - Benefit: Clearer user experience and fewer accidental lock toggles.

3. Accessibility
   - Problem: Many interactive elements use icons only and lack ARIA labels, and modals aren't focus-trapped.
   - Fix: Add ARIA attributes, focus management for modals, and ensure keyboard-only navigation works.
   - Benefit: More inclusive UX.

Priority 5 — Multiplayer & Persistence
-------------------------------------
1. Race conditions with room initialization
   - Problem: Code uses room.collection calls even when initialize may have failed; subscriptions sometimes assume immediate availability.
   - Fix: Gate remote collection access behind a room.isReady flag; factor remote sync to a persistence module that handles retries and backoff.
   - Benefit: Predictable network behavior and cleaner error handling.

2. Privacy / trust of mirrored remote data
   - Problem: Remote collections are merged into UI (ball_stats/player_clones) without sanitization.
   - Fix: Validate and sanitize remote data shapes and lengths; cap numeric fields and sanitize strings.
   - Benefit: Safer UI, prevents broken/malicious remote records from breaking rendering.

Actionable roadmap (high-level milestones)
------------------------------------------
- Week 0 (immediate): Add seeded RNG utility and integrate optional URL seed param; add small NotificationManager; track and dispose PMREM/env maps.
- Week 1: Refactor room/global dependencies: pass `room` into renderBallIndexUI and other modules; consolidate ball configs into ball_db.js.
- Week 2: Split main.js into modules (scene, physics, input, ui, audio, levelgen) and wire a small bootstrap.
- Week 3: Implement AudioPool for SFX, AudioContext resume; particle quality presets for mobile; reduce per-frame allocations.
- Week 4+: Add unit tests for levelgen (deterministic with seed), integrate linting, and add CI checks for build/test.

Concrete short-term code changes (suggested PRs)
-----------------------------------------------
1. Add seeded RNG util and accept seed param in createLevel.
2. Pass `room` into renderBallIndexUI to remove implicit dependency and avoid globals.
3. Create NotificationManager class and replace ephemeral inline toast creation.
4. Track PMREM/env maps created by PMREMGenerator and dispose when changing skies.
5. Add device-quality scaling for particle counts (rain/snow/wind).
6. Consolidate ball metadata into ball_db.js and import only there to make this the single source of truth.

Appendix — Quick code snippets & helpers
----------------------------------------
1) Mulberry32 seeded RNG