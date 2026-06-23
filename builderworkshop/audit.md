# Project Audit — 3D Studio

Date: 2026-06-23
Author: Automated Code Audit

## Scope
This audit covers the repository files currently present in the project: loaders.js, selectionHistory.js, rigging.js, controls.js, painter.js, selection.js, selectGroups.js, lassoSelect.js, sculpting.js, modifiers.js, wireframeEditor.js, gallery.js, uiPanels.js, operations.js, scene.js, styles.css, exporter.js, app.js, state.js, agent.js and auxiliary assets referenced.

## High-level summary
- The app is a modular browser-based Three.js 3D studio with loaders, selection, sculpting, painting, modifiers, rigging UI, and a WebsimSocket-backed agent.
- Modules are mostly decoupled and organized; UI wiring is centralized in app.js.
- Several files contain small bugs, inconsistencies, and opportunities for robustness, performance, and security improvements.
- Priorities: fix runtime errors, ensure resource cleanup, tighten input handling, and improve asynchronous flows.

---

## Findings — Errors & Bugs (critical → low)

1. exporter.js
- Problem: file begins with stray token "exporter" on first line, causing a syntax error.
- Fix: remove the stray token; ensure GLTFExporter import uses import map path pattern used elsewhere (three/examples path may require proper resolution in importmap). Also ensure exported GLB uses binary flag when requested.

2. agent.js
- Problem A: Syntax corruption / misplaced braces in for-loop: inner logic malformed causing runtime error.
- Problem B: Uses WebsimSocket global without safe fallback during runAgent; creation uses `new WebsimSocket()` which may throw if undefined.
- Fix: Repair loop structure, correctly collect textures and materials, and guard room initialization. Ensure room is exported but don't throw during import.

3. uiPanels.js
- Problem: createPanel returns inline-styled panel; acceptable. Minor: hooking to DOM elements that may not exist — safe-guard with existence checks.

4. loaders.js
- Problem: manager.setURLModifier usage: storing original modifier with manager.getURLModifier may return undefined on this manager implementation; code handles but be mindful. Also revokeObjectURL called too early — processLoaded may rely on blob urls still active in async loaders; current code revokes after try finally which is fine, but for async parse flows with URL fetches via manager modifier, URLs must remain until parse completes — current code revokes afterwards, OK but keep caution.

5. painter.js
- Problem: When materials are an array, new MeshStandardMaterial created with color: m.color may be a Color object; ensure color handled consistently. Also canvas texture flipY flags inconsistent across code (some set flipY=false). Ensure consistent flipY depending on UV setup. Potential memory: created Canvas textures not revoked; ok since used on mesh, but duplication needs cloning logic (operations handles that).

6. selection.js
- Problem: updateVisuals builds highlightVerts using selection.indices iteration order; Set order is insertion order but fine. No handling for non-indexed geometries where attribute indexing mapping may differ; acceptable but note for complex meshes.

7. sculpting.js
- Problem: applySmoothTool: in neighbor averaging, calculation uses avg.multiplyScalar(1 / n.size) inside loop which will keep scaling avg for each neighbor rather than divide after accumulation — logic bug: should accumulate then divide by neighbor count. Also tempPos copying may re-use modified data incorrectly across iterations. Also neighbor construction uses index.getX with sequential indices reading but index.count is number of indices (should be step by 3 over index.count).

8. operations.js
- Problem: mergeGeometries call signature depends on BufferGeometryUtils version; code already attempts mergeGeometries || mergeBufferGeometries which is good. Potential memory: not disposing intermediate geometries in some branches.

9. exporter and GLTF export usage: exporter.parse may return ArrayBuffer when binary true; current code sets binary false — consider offering binary export option.

10. scene.js and resize handlers
- Problem: duplicate resize handlers exist in app.js; duplication harmless but consolidate to avoid repeated updates.

11. styles.css
- Problem: duplicated :root and other blocks (file contains repeated sections and a missing closing brace or broken pre block in help-content). There is evidence of truncated CSS (missing closing } after pre). This can break CSS parsing.

12. app.js
- Problem A: scene.add(state.modelRoot) called twice (scene.js already adds state.modelRoot when initScene returns). Minor duplication but harmless.
- Problem B: help modal DOM elements (help-modal, help-close) are referenced but not present in index.html; code checks for existence — safe.
- Problem C: multiple resize listeners (scene.js and app.js and window in initScene) — duplicate.

13. exporter.js & importer paths: ensure importmap in index.html includes examples paths if dynamic imports used; current importmap declares "three" and "three/" so example modules should resolve.

14. general: Lack of error boundary for loaders (some loader callbacks use alerts) and missing try/catch on many async flows.

---

## Security & UX concerns
- File input accepts many file types; opening arbitrary files is expected but consider more robust validation and size limit UI feedback.
- Alerts are used widely (modal blocking); prefer non-blocking toast UI for better experience.
- Missing abort/cancel options for long-running tasks (e.g., large model loads, agent run).
- Generated object URLs are revoked but ensure revocation timing after resource use in all code paths.

---

## Performance & Memory
- Textures created from canvases and loaded Images are not necessarily released; provide explicit disposal functions when removing objects from modelRoot.
- generateThumbnail uses readRenderTargetPixels which allocates pixels buffer per call — acceptable but consider reusing buffer.
- Many geometries cloned and not disposed (operations, modifiers) — recommend consistent disposal policy when replacing geometry/material.

---

## Maintainability & Consistency
- Mixed style patterns: some modules export functions, others directly attach event listeners inside module initialization. Suggest adopting a consistent "setup()" pattern that accepts DOM/context.
- Naming: some modules export globals to window (selectionHistory, selectGroups, lassoSelect). Acceptable for debug but prefer return values from setup() and keep minimal globals.
- Comments: Most files are well-commented; continue adding short notes for unusual behaviors (clipping plane semantics, flipY texture conventions).

---

## Recommended fixes (actionable)
1. exporter.js: remove stray token and export a tidy setupExporter; add binary export option.
2. agent.js: repair syntax errors, guard WebsimSocket creation, and ensure texture detection logic is correct.
3. styles.css: remove duplicated blocks and fix the malformed help-content pre closing brace and duplicated :root.
4. sculpting.js: fix averaging and neighbor accumulation bug, ensure use of original positions per iteration.
5. scene/app duplication: remove the duplicate scene.add(state.modelRoot) in app.js or initScene.
6. Add centralized dispose utility to free geometries, materials, and textures when removing meshes.
7. Replace window.alerts with non-blocking console or UI toasts (future work).
8. Add try/catch to async loader flows and ensure objectURL lifetime matches loader use.
9. Add unit test or runtime check to ensure example modules (GLTFExporter) resolve under importmap.

---

## Suggested short-term priority plan
- P0 (fix now): exporter.js syntax error, agent.js syntax error, styles.css parse error, sculpting averaging bug.
- P1 (within sprint): add disposal utilities, dedupe resize handlers, guard loaders, and improve loader progress UX.
- P2 (later): replace alerts with toasts, introduce abort controllers for loads, and refactor global state exposure.

---

## Todo checklist (developer actions)
- [ ] Remove stray "exporter" token in exporter.js (HIGH)
- [ ] Repair agent.js block and test resource agent run (HIGH)
- [ ] Fix CSS duplication and missing brace in styles.css (HIGH)
- [ ] Correct applySmoothTool neighbor averaging in sculpting.js (HIGH)
- [ ] Add disposal helper module and call it from delete/merge/patch actions (MED)
- [ ] Consolidate resize handlers to a single listener (MED)
- [ ] Offer GLB binary export option and ensure exporter import maps (MED)
- [ ] Audit texture flipY usage and unify conventions (MED)
- [ ] Add non-blocking UI feedback components for long ops (LOW)
- [ ] Add tests / sample models for loader compatibility (LOW)

---

## Appendix — quick code pointers

- exporter.js: top-line should be removed. Example import:
  import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
  exporter.parse(scene, (gltf)=>{ ... }, { binary: true });

- agent.js: safe room init:
  const room = (typeof WebsimSocket !== 'undefined') ? new WebsimSocket() : null;
  if (!room) { alert('WebsimSocket not available'); return; }

- sculpting.js fix (conceptual):
  - accumulate neighbor positions into a vector, divide by neighbor count once, then lerp current -> avg.

---

If you'd like, I can proceed to apply the P0 fixes now (exporter.js, agent.js, styles.css, sculpting.js) and create a disposable helper module and update operations.js to use it.