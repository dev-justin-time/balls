/**
 * Loader pipeline tests.
 *
 * Covers:
 *   - MeshOperations.optimizeGeometry (WASM path + JS fallback + degenerate input)
 *   - WireframeImporter.importFromGraphData (valid graph + rejection paths +
 *     degenerate-edge filtering + scene-add behavior + importedMeshes bookkeeping)
 *
 * THREE.js and BufferGeometryUtils are mocked because jsdom lacks WebGL.
 * quadCore is mocked (default null) so the JS fallback paths in both
 * classes are exercised by every test unless overridden explicitly.
 *
 * The mocks are intentionally exhaustive enough to drive the production
 * code paths end-to-end (geometry construction, mesh-group placement,
 * dispose, etc.) — not just spot-check that a function was called.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────────────
// HOISTED MOCK STATE
// ──────────────────────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file BEFORE any
// module-level code runs. Top-level vars referenced from inside those
// factories would be uninitialized at hoist-time, throwing
// "Cannot access 'X' before initialization" ReferenceError.
//
// Canonical Vitest fix: vi.hoisted() declares values at hoist-time so
// factories can close over them safely. We bundle the three.js mock
// factory, the merge-call recorder, and the quadCore mock object into
// one hoisted block.

const { threeMock, _lastMergeCall, _mockQuadCore } = vi.hoisted(() => {
  function BufferGeometry() {
    this.attributes = {};
    this.index = null;
    this.boundingBox = null;
    this.array = null;
    this.count = 0;
    this.setAttribute = vi.fn((name, attr) => {
      this.attributes[name] = attr;
      if (name === 'position') {
        this.array = attr.array;
        this.count = attr.count;
      }
    });
    this.setIndex = vi.fn((idx) => {
      // REAL `THREE.BufferGeometry.setIndex` accepts both a BufferAttribute-like
      // object AND a raw array (auto-wrapped internally). Our mock must mirror
      // that: production code does `geometry.index.array` after calling
      // `setIndex(plainArray)` (e.g. WireframeImporter._extrudeGraphToGeometry),
      // so a raw array MUST be wrapped into a BufferAttribute-shaped object
      // with .array / .count / .itemSize fields populated.
      if (idx == null) {
        this.index = null;
      } else if (Array.isArray(idx) || idx instanceof Uint32Array) {
        const arr = (idx instanceof Uint32Array) ? idx : Uint32Array.from(idx);
        this.index = { array: arr, count: arr.length, itemSize: 1 };
      } else if (typeof idx === 'object' && 'array' in idx && typeof idx.count === 'number') {
        // Already a BufferAttribute-like — keep as-is (production constructions
        // such as `new THREE.BufferAttribute(uint32, 1)` return this shape).
        this.index = idx;
      } else {
        this.index = idx;
      }
    });
    this.computeVertexNormals = vi.fn(() => {
      if (!this.attributes.normal) {
        const pos = this.attributes.position;
        const n = pos ? pos.count : 0;
        this.attributes.normal = new Float32BufferAttribute(new Float32Array(n * 3), 3);
      }
    });
    this.computeBoundingBox = vi.fn(() => {
      this.boundingBox = { isEmpty: () => false, min: new Float32Array(3), max: new Float32Array(3) };
    });
    this.clone = vi.fn(function () {
      const c = new BufferGeometry();
      for (const k of Object.keys(this.attributes)) c.attributes[k] = this.attributes[k];
      c.index = this.index;
      c.computeVertexNormals();
      return c;
    });
    this.dispose = vi.fn();
  }

  function BufferAttribute(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array ? Math.floor(array.length / itemSize) : 0;
  }
  function Float32BufferAttribute(array, itemSize) { return new BufferAttribute(array, itemSize); }
  function Uint32BufferAttribute(array, itemSize) { return new BufferAttribute(array, itemSize); }

  function Group() {
    this.children = [];
    this.name = '';
    this.userData = {};
    this.add = vi.fn((child) => { this.children.push(child); });
    this.remove = vi.fn((child) => {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
    });
    this.traverse = vi.fn((fn) => { this.children.forEach(fn); });
  }
  function Mesh(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.userData = {};
    this.castShadow = false;
    this.receiveShadow = false;
    this.isMesh = true;
    this.isLineSegments = false;
  }
  function LineSegments(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.isLineSegments = true;
    this.userData = {};
  }
  function EdgesGeometry(geometry) {
    this.geometry = geometry;
    this.array = new Float32Array(0);
    this.count = 0;
    this.setAttribute = () => {};
    // Real EdgesGeometry inherits dispose() from BufferGeometry. WireframeImporter.
    // _disposeGroup traverses the import group and calls dispose() on each
    // child.geometry — so the LineSegments / EdgesGeometry child needs it too.
    this.dispose = vi.fn();
  }

  function MeshPhongMaterial(opts = {}) {
    this.opts = opts;
    this.color = opts.color ?? 0xffffff;
    this.emissive = opts.emissive ?? 0x000000;
    this.transparent = !!opts.transparent;
    this.opacity = opts.opacity ?? 1;
    this.shininess = opts.shininess ?? 30;
    this.side = opts.side ?? null;
    this.dispose = vi.fn();
  }
  function LineBasicMaterial(opts = {}) {
    this.opts = opts;
    this.color = opts.color ?? 0xffffff;
    this.transparent = !!opts.transparent;
    this.opacity = opts.opacity ?? 1;
    this.dispose = vi.fn();
  }

  const three = {
    BufferGeometry,
    BufferAttribute,
    Float32BufferAttribute,
    Uint32BufferAttribute,
    Group,
    Mesh,
    LineSegments,
    EdgesGeometry,
    MeshPhongMaterial,
    LineBasicMaterial,
    DoubleSide: 2,
    Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} clone(){return new this.constructor(this.x,this.y,this.z);} normalize(){return this;} },
    Box3: class { setFromObject(){return this;} getCenter(){return {x:0,y:0,z:0};} getSize(){return {x:0,y:0,z:0};} },
  };
  // .current lets tests read the latest value; factories WRITE through the closure.
  return { threeMock: three, _lastMergeCall: { current: null }, _mockQuadCore: { current: null } };
});

vi.mock('three', () => {
  // mirror the ball_skin.test.js pattern (default-export + named-export both)
  return { default: threeMock, ...threeMock };
});

// ──────────────────────────────────────────────────────────────────────
// MOCK: BufferGeometryUtils
// ──────────────────────────────────────────────────────────────────────
// mergeVertices returns a sentinel geometry so tests can detect whether
// the JS fallback path ran and with what threshold. Real merge arithmetic
// is not exercised here — the upstream pipeline is what we're testing.

vi.mock('three/addons/utils/BufferGeometryUtils.js', () => ({
  mergeVertices: vi.fn((geometry, threshold) => {
    _lastMergeCall.current = { geometry, threshold };
    // Sentinel: floor(input_verts / 2) vertices. Just enough that downstream
    // code can call setIndex / computeVertexNormals without throwing.
    const n = Math.max(1, Math.floor(geometry.attributes.position.count / 2));
    const sentinel = new threeMock.BufferGeometry();
    sentinel.setAttribute(
      'position',
      new threeMock.Float32BufferAttribute(new Float32Array(n * 3), 3)
    );
    sentinel.setIndex(new threeMock.BufferAttribute(new Uint32Array(n), 1));
    sentinel.computeVertexNormals();
    return sentinel;
  }),
  mergeGeometries: vi.fn((geoms) => {
    if (!geoms || geoms.length === 0) return null;
    const merged = new threeMock.BufferGeometry();
    const total = geoms.reduce((s, g) => s + g.attributes.position.count, 0);
    merged.setAttribute(
      'position',
      new threeMock.Float32BufferAttribute(new Float32Array(total * 3), 3)
    );
    merged.computeVertexNormals();
    return merged;
  }),
}));

// ──────────────────────────────────────────────────────────────────────
// MOCK: ipc_bridge quadCore (default null = forces JS fallback in both classes)
// ──────────────────────────────────────────────────────────────────────

vi.mock('../src/core/ipc_bridge.js', () => ({
  get quadCore() { return _mockQuadCore.current; },
}));

// ──────────────────────────────────────────────────────────────────────
// Imports under test
// ──────────────────────────────────────────────────────────────────────

import { MeshOperations } from '../src/builder/mesh_operations.js';
import { WireframeImporter } from '../src/builder/wireframe_importer.js';

// ──────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────

function makeGeometry(positions, indices = null) {
  const g = new threeMock.BufferGeometry();
  g.setAttribute(
    'position',
    new threeMock.Float32BufferAttribute(new Float32Array(positions), 3)
  );
  if (indices) {
    g.setIndex(new threeMock.BufferAttribute(new Uint32Array(indices), 1));
  }
  return g;
}

function makeGame(overrides = {}) {
  return {
    _builderScene: { add: vi.fn(), remove: vi.fn() },
    _builderPlacedParts: [],
    quadCore: _mockQuadCore.current,
    ...overrides,
  };
}

beforeEach(() => {
  _lastMergeCall.current = null;
  _mockQuadCore.current = null;
});

// ──────────────────────────────────────────────────────────────────────
// MeshOperations.optimizeGeometry
// ──────────────────────────────────────────────────────────────────────

describe('MeshOperations.optimizeGeometry', () => {
  it('returns the input geometry and warns when geometry is null', async () => {
    const ops = new MeshOperations(makeGame());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await ops.optimizeGeometry(null);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[MeshOps] Invalid geometry')
    );
    warnSpy.mockRestore();
  });

  it('returns the input geometry and warns when geometry lacks position attribute', async () => {
    const ops = new MeshOperations(makeGame());
    const bare = new threeMock.BufferGeometry();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await ops.optimizeGeometry(bare);
    expect(result).toBe(bare);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[MeshOps] Invalid geometry')
    );
    warnSpy.mockRestore();
  });

  it('runs the JS fallback path when quadCore has no wasmModule', async () => {
    const ops = new MeshOperations(makeGame());
    const geom = makeGeometry([0,0,0, 1,1,1, 2,2,2, 3,3,3]);  // 4 verts
    const result = await ops.optimizeGeometry(geom);
    expect(_lastMergeCall.current).not.toBeNull();
    expect(_lastMergeCall.current.geometry).toBe(geom);
    expect(_lastMergeCall.current.threshold).toBeCloseTo(0.01, 5);  // _WELD_THRESHOLD
    // Sentinel returned by mock mergeVertices has count = floor(4/2) = 2
    expect(result.attributes.position.count).toBe(2);
  });

  it('propagates the weldThreshold argument to mergeVertices', async () => {
    const ops = new MeshOperations(makeGame());
    const geom = makeGeometry([0,0,0, 1,1,1, 2,2,2]);
    await ops.optimizeGeometry(geom, 0.25);
    expect(_lastMergeCall.current.threshold).toBeCloseTo(0.25, 5);
  });

  it('uses the WASM path when quadCore exposes an optimize_geometry function', async () => {
    const wasmGeometry = makeGeometry([9,9,9, 9,9,9]);  // 2 verts
    _mockQuadCore.current = {
      wasmModule: {
        optimize_geometry: vi.fn(() => ({
          positions: wasmGeometry.attributes.position.array,
          indices: new Uint32Array([0, 1, 0]),
        })),
      },
    };
    const ops = new MeshOperations(makeGame());
    const geom = makeGeometry([0,0,0, 1,1,1, 2,2,2, 3,3,3]);  // 4 verts
    const result = await ops.optimizeGeometry(geom);
    expect(_mockQuadCore.current.wasmModule.optimize_geometry).toHaveBeenCalledTimes(1);
    expect(result.attributes.position.count).toBe(2);
    expect(ops.getStats().wasmAvailable).toBe(true);
  });

  it('falls back to JS path when WASM call throws', async () => {
    _mockQuadCore.current = {
      wasmModule: {
        optimize_geometry: vi.fn(() => { throw new Error('boom'); }),
      },
    };
    const ops = new MeshOperations(makeGame());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const geom = makeGeometry([0,0,0, 1,1,1, 2,2,2, 3,3,3]);
    const result = await ops.optimizeGeometry(geom);
    expect(_lastMergeCall.current).not.toBeNull();  // JS path executed
    // production code calls `console.warn('[MeshOps] WASM optimize failed,
    // falling back to JS:', wasmError)` — two args, not one. Use .mock.calls
    // to scan across all args for the substring instead of toHaveBeenCalledWith.
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls[0];
    expect(
      warnArgs.some(
        (a) => typeof a === 'string' && a.includes('[MeshOps] WASM optimize failed')
      )
    ).toBe(true);
    expect(result.attributes.position.count).toBe(2);
    warnSpy.mockRestore();
  });

  it('increments _operationCount once per call (across WASM and JS paths)', async () => {
    const ops = new MeshOperations(makeGame());
    const geom = makeGeometry([0,0,0, 1,1,1]);
    const before = ops.getStats().operationCount;
    await ops.optimizeGeometry(geom);
    await ops.optimizeGeometry(geom);
    await ops.optimizeGeometry(geom);
    expect(ops.getStats().operationCount - before).toBe(3);
  });

  it('reports wasmAvailable=false initially when JS path is used', async () => {
    const ops = new MeshOperations(makeGame());
    const geom = makeGeometry([0,0,0, 1,1,1, 2,2,2]);
    await ops.optimizeGeometry(geom);
    expect(ops.getStats().wasmAvailable).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// WireframeImporter.importFromGraphData
// ──────────────────────────────────────────────────────────────────────

describe('WireframeImporter.importFromGraphData', () => {
  it('extrudes a simple 4-node / 4-edge square into a wireframe group', async () => {
    const game = makeGame();
    const importer = new WireframeImporter(game);
    const graphData = {
      nodes: [[10, 10], [110, 10], [110, 110], [10, 110]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
      node_count: 4,
      edge_count: 4,
      engine_used: 'cached',
    };
    const result = await importer.importFromGraphData(graphData);
    expect(result.success).toBe(true);
    expect(result.nodeCount).toBe(4);
    expect(result.edgeCount).toBe(4);
    expect(result.engineUsed).toBe('cached');
    expect(result.meshCount).toBeGreaterThanOrEqual(1);  // body mesh + line overlay
    // Should have been added to the builder scene
    expect(game._builderScene.add).toHaveBeenCalled();
  });

  it('records the import so undoLastImport can detach it', async () => {
    const game = makeGame();
    const importer = new WireframeImporter(game);
    const graphData = {
      nodes: [[10, 10], [110, 10], [10, 110]],
      edges: [[0, 1], [1, 2]],
      node_count: 3,
      edge_count: 2,
      engine_used: 'cached',
    };
    await importer.importFromGraphData(graphData);
    expect(importer.importedMeshes).toHaveLength(1);
    expect(importer.importedMeshes[0]).toMatchObject({
      nodeCount: 3,
      edgeCount: 2,
      engineUsed: 'cached',
    });
    expect(typeof importer.importedMeshes[0].timestamp).toBe('number');

    // Round-trip the undo path
    importer.undoLastImport();
    expect(game._builderScene.remove).toHaveBeenCalled();
    expect(importer.importedMeshes).toHaveLength(0);
  });

  it('rejects empty-nodes graph with success:false and an error message', async () => {
    const game = makeGame();
    const importer = new WireframeImporter(game);
    const result = await importer.importFromGraphData({ nodes: [], edges: [], engine_used: 'cached' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no nodes/i);
    expect(importer.importedMeshes).toHaveLength(0);  // not recorded
    expect(game._builderScene.add).not.toHaveBeenCalled();
  });

  it('rejects graphs whose node_count exceeds the anti-DoS cap', async () => {
    const game = makeGame();
    const importer = new WireframeImporter(game);
    const graphData = {
      nodes: [[0, 0]],
      edges: [],
      // _MAX_ALLOWED_NODES = 5000 (from wireframe_importer.js). Test the rejection
      // contract by setting node_count just above the cap.
      node_count: 5001,
      edge_count: 0,
      engine_used: 'cached',
    };
    const result = await importer.importFromGraphData(graphData);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too complex/i);
    expect(importer.importedMeshes).toHaveLength(0);
  });

  it('silently drops degenerate zero-length edges', async () => {
    const game = makeGame();
    const importer = new WireframeImporter(game);
    // node 3 duplicates node 0 — edge (0→3) will be ~zero length and dropped.
    const graphData = {
      nodes: [[10, 10], [110, 10], [10, 110], [10, 10]],
      edges: [[0, 1], [1, 2], [0, 3]],
      node_count: 4,
      edge_count: 3,
      engine_used: 'cached',
    };
    const result = await importer.importFromGraphData(graphData);
    expect(result.success).toBe(true);
    expect(result.edgeCount).toBe(3);  // authored count reported
    // meshCount reflects the geometry output: 2 triangles (one quad) per
    // surviving edge + EdgesGeometry overlay = body mesh + line overlay.
    // 2 surviving edges → 1 body mesh + 1 line overlay = 2 children visible,
    // counted as 2 distinct meshes.
    expect(result.meshCount).toBe(2);
  });

  it('defaults engineUsed to "cached" when graphData omits it', async () => {
    const game = makeGame();
    const importer = new WireframeImporter(game);
    const graphData = {
      nodes: [[10, 10], [110, 10], [10, 110]],
      edges: [[0, 1], [1, 2]],
      node_count: 3,
      edge_count: 2,
    };
    const result = await importer.importFromGraphData(graphData);
    expect(result.success).toBe(true);
    expect(result.engineUsed).toBe('cached');
  });

  it('counts nodes/edges gracefully when graphData omits node_count/edge_count', async () => {
    const game = makeGame();
    const importer = new WireframeImporter(game);
    const graphData = {
      nodes: [[0, 0], [10, 0], [10, 10], [0, 10]],
      edges: [[0, 1], [1, 2], [2, 3]],
      engine_used: 'cached',
    };
    const result = await importer.importFromGraphData(graphData);
    expect(result.success).toBe(true);
    expect(result.nodeCount).toBe(4);  // derived from nodes.length
    expect(result.edgeCount).toBe(3);  // derived from edges.length
  });

  it('accumulates entries in importedMeshes across multiple calls', async () => {
    const game = makeGame();
    const importer = new WireframeImporter(game);
    const graphData = {
      nodes: [[10, 10], [110, 10], [10, 110]],
      edges: [[0, 1], [1, 2]],
      node_count: 3,
      edge_count: 2,
      engine_used: 'cached',
    };
    for (let i = 0; i < 4; i++) await importer.importFromGraphData(graphData);
    expect(importer.importedMeshes).toHaveLength(4);
    const addCalls = game._builderScene.add.mock.calls.filter(
      ([arg]) => arg && arg.name === 'ai_wireframe_import'
    );
    expect(addCalls).toHaveLength(4);
  });

  it('does not throw when game has no _builderScene (no scene-add needed)', async () => {
    const game = makeGame({ _builderScene: undefined });
    const importer = new WireframeImporter(game);
    const graphData = {
      nodes: [[10, 10], [110, 10], [10, 110]],
      edges: [[0, 1], [1, 2]],
      node_count: 3,
      edge_count: 2,
      engine_used: 'cached',
    };
    let err = null;
    let result = null;
    try {
      result = await importer.importFromGraphData(graphData);
    } catch (e) {
      err = e;
    }
    expect(err).toBeNull();
    expect(result.success).toBe(true);
  });

  it('clearImportedMeshes disposes every recorded group and clears the list', async () => {
    const game = makeGame();
    const importer = new WireframeImporter(game);
    const graphData = {
      nodes: [[10, 10], [110, 10], [10, 110]],
      edges: [[0, 1], [1, 2]],
      node_count: 3,
      edge_count: 2,
      engine_used: 'cached',
    };
    await importer.importFromGraphData(graphData);
    await importer.importFromGraphData(graphData);
    expect(importer.importedMeshes).toHaveLength(2);
    importer.clearImportedMeshes();
    expect(importer.importedMeshes).toHaveLength(0);
    expect(game._builderScene.remove).toHaveBeenCalledTimes(2);
  });
});
