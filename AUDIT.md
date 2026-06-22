# Going Balls — Code Audit & Improvement Plan

Updated: 2026-06-22 (all audit items complete)

Purpose
-------
Concise audit of the codebase with prioritized issues and actionable improvement plans.
Updated to reflect completed work, remaining items, and new issues discovered during refactoring and audit.

Status key: ✅ Done  🔶 Partial  ⬜ Not started

Executive summary
-----------------
Major progress: the monolithic main.js has been split into 12 modules, assets optimized (~40% size reduction), ball configs consolidated to a single source of truth, and a .codebuffrules safety file established. All audit P0/P1 bugs fixed (operator precedence, nebula skin type, coin geometry reuse, glass disposal, double level-scaling). Naming conventions standardized (camelCase for internal keys, snake_case adapter support for remote data). ESLint + CI pipeline + Lighthouse CI + service worker cache busting + ball skin unit tests all complete. Geometry disposal leak fixed in clearLevel.
All audit items complete — no remaining work.

---

## Priority 1 — Correctness & Safety

### 1. ✅ Missing deterministic seeding for procedural levels
- Status: DONE. mulberry32 in persistence.js, URL param ?seed=12345 support, passed into createLevel.

### 2. ✅ Global variable leakage and mixed responsibilities
- Status: DONE. `room` passed explicitly to all modules. Error-state flags module-scoped in networking.js. Loading-signal flags intentionally remain as window globals for cross-module coordination.

### 3. ✅ Unbounded memory/DOM updates on repeated toasts/popups
- Status: DONE. src/notification_manager.js with pooling, rate-limiting, maxConcurrent=3, minIntervalMs.

### 4. ✅ Operator precedence bug in updatePhysics
- Status: DONE. Fixed `&&`/`||` binding to use parentheses.

### 5. ✅ Nebula skin type mismatch
- Status: DONE. Changed type: 'texture' → type: 'gltf'.

---

## Priority 2 — Performance & Resource Management

### 1. ✅ Textures and PMREM leaks
- Status: DONE. _lastEnvMap.dispose() tracked when replacing env maps. textureCache with Map. disposeMesh() helper handles sky transitions. clearTextureCache() intentionally NOT called during level reset (shared materials reference cached textures). Geometry disposal added to clearLevel (levelObjects, coins, pendulums, spinners, movers, glass platforms). Trail instances removed from scene on level reset.

### 2. ✅ Particle counts on mobile
- Status: DONE. getParticleCount() scales by hardwareConcurrency, device type, screen area.

### 3. ✅ Frequent per-frame allocations
- Status: DONE. Pooled Vec3 instances on game object. Coin geometry per-tier reuse via getCachedCoinGeo() cache (5 sizes). Obstacle collision uses stack-allocated primitives (no GC pressure).

---

## Priority 3 — Maintainability & Modularity

### 1. ✅ Monolithic main.js
- Status: DONE. Split into 12 modules.

### 2. ✅ Ball config duplication
- Status: DONE. Single source of truth in ball_db.js.

### 3. ✅ Inconsistent naming and key casing
- Status: DONE. Seed data uses camelCase (ballKey, avgTime, bestTime). ball_index_ui.js sanitization handles both camelCase and snake_case via fallback (`r.avgTime || r.avg_time`) for backward compatibility with existing remote data. sanitizeRemoteEntry() in ui.js is format-agnostic.

---

## Priority 4 — UX, Accessibility & Security

### 1. ✅ Audio handling & autoplay policies
### 2. ✅ Pointer lock and gesture handling
### 3. ✅ Accessibility (26+ aria-labels, focus-trap, auto-focus)

---

## Priority 5 — Multiplayer & Persistence

### 1. ✅ Race conditions with room initialization (retry/backoff)
### 2. ✅ Privacy / trust of mirrored remote data (sanitizeRemoteEntry)

---

## Issues Discovered During Refactoring & Audit — All Resolved

| # | Issue | Status |
|---|-------|--------|
| N1 | eye_ball GLTF skin rendering | ✅ DONE |
| N2 | .glb finish model rename | ✅ DONE |
| N3 | window.__goingBalls* globals | ✅ DONE |
| N4 | Automated tests (141 passing) | ✅ DONE |
| N5 | Assets optimized (~40% reduction) | ✅ DONE |
| N6 | Asset paths standardized | ✅ DONE |
| N7 | .codebuffrules safety file | ✅ DONE |
| N8 | Custom pixel font (5x5dots) | ✅ DONE |
| N9 | Nebula skin type mismatch | ✅ DONE |
| N10 | Operator precedence fix | ✅ DONE |
| N11 | Coin geometry reuse per tier | ✅ DONE |
| N12 | Glass platform disposal | ✅ DONE |
| N13 | Double level-scaling in triggerDropFromObstacle | ✅ DONE |
| N14 | Naming conventions standardized | ✅ DONE |

---

## Actionable Roadmap (Updated)

- ✅ Week 0–6: All major features, refactors, and bug fixes complete
- ✅ Audit pass: P0/P1 bugs fixed, naming standardized, coin geometry reused, glass disposal added
- ✅ PMREM cache hot-swap verification (disposal paths verified, geometry leak fixed in clearLevel)
- ✅ ESLint setup (eslint.config.js with flat config, lint/lint:fix scripts, 4 errors fixed)
- ✅ CI pipeline (.github/workflows/ci.yml: ESLint + vitest + Lighthouse CI + GitHub Pages deploy)
- ✅ Service worker with SHA-stamped cache busting (sw.js)
- ✅ Ball skin system unit tests (26 tests in tests/ball_skin.test.js)

---

## Concrete PRs — All Complete

1. ✅ Fix eye_ball GLTF skin rendering
2. ✅ Rename .glb → finish_gate.glb
3. ✅ Pool Vec3 instances + coin geometry reuse
4. ✅ Add unit tests (141 passing)
5. ✅ Create package.json + vitest config
6. ✅ Clean up window.__goingBalls* globals
7. ✅ Add ARIA labels + focus trapping
8. ✅ Fix operator precedence bug
9. ✅ Fix nebula skin type mismatch
10. ✅ Standardize naming conventions (camelCase)
11. ✅ Reuse coin geometry per tier size
12. ✅ Update DEEP_WIKI.md for modular architecture
