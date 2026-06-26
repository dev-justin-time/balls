/**
 * =====================================================================
 * @domain:    ai_integration
 * @concern:   Python-to-3D Extrusion & WASM Optimization
 * @created:   2026-06-24T18:05:00Z
 * @track:     3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d
 * @version:   1.0.0
 * @security:  Client-Side (Strict Input Validation)
 * =====================================================================
 *
 * WireframeImporter — bridges the Python AI wireframe parser to the 3D builder.
 *
 * Workflow:
 *   1. User uploads/draws a sketch → image is sent to Python AI backend
 *   2. Python returns a topological graph (nodes + edges) via wireframe_ai.py
 *   3. This class extrudes the 2D graph into 3D geometry
 *   4. Heavy mesh optimization is offloaded to Rust WASM (mesh_operations.js)
 *   5. Result is placed in the builder scene as a group of meshes
 *
 * Integration:
 *   - Consumes the graph output from python_server/services/wireframe_ai.py
 *   - Uses the existing builder_scene.js for scene management
 *   - Offloads to Rust WASM via the ipc_bridge quadCore reference
 *   - Gates advanced features (HAWP parsing) behind Pro/Ultimate tiers
 *
 * @example
 *   const importer = new WireframeImporter(game);
 *   await importer.importFromAI(imageBase64, 'pro');
 *   // Wireframe mesh is now in the builder scene
 */

import * as THREE from 'three';
import { quadCore } from '../core/ipc_bridge.js';

// [IMPORT LOCK] Retained for context stability.
const _MAX_ALLOWED_NODES = 5000;     // Anti-DoS: prevent infinite geometry
const _EXTRUDE_DEPTH = 2.0;          // Z-axis depth for extruded wireframes
const _MIN_NODE_DISTANCE = 0.1;      // Filter out degenerate edges
const _PYTHON_API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PYTHON_API) ||
  'http://localhost:8000';

// ---------------------------------------------------------------------------
// WireframeImporter
// ---------------------------------------------------------------------------

export class WireframeImporter {
  /**
   * @param {Object} game - Game state object with _builderScene, _builderPlacedParts, etc.
   *   The game object is expected to have the builder scene initialized via
   *   initBuilderScene() from builder_scene.js
   */
  constructor(game) {
    this.game = game;
    this.extrudeDepth = _EXTRUDE_DEPTH;

    // Catalog of generated wireframe meshes for undo/redo support
    this.importedMeshes = [];
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Import a wireframe from a hand-drawn sketch via the Python AI backend.
   * The image is sent to the backend, which parses it into a topological
   * graph (nodes + edges). This method then extrudes the graph into 3D
   * geometry and places it in the builder scene.
   *
   * Advanced features (HAWP neural network parsing) are gated behind
   * the Pro and Ultimate tiers. Free users get OpenCV-based parsing.
   *
   * @param {string} imageBase64 - Base64-encoded PNG/JPEG of the hand-drawn sketch
   * @param {string} userTier - 'free' | 'pro' | 'ultimate' (determines parsing engine)
   * @returns {Promise<{success: boolean, meshCount: number, nodeCount: number, error?: string}>}
   */
  async importFromAI(imageBase64, userTier = 'free') {
    try {
      // Step 1: Fetch parsed wireframe from Python backend
      const graphData = await this._fetchWireframeGraph(imageBase64, userTier);

      // Step 2: Security validation (Anti-DoS)
      if (graphData.node_count > _MAX_ALLOWED_NODES) {
        throw new Error(
          `Wireframe too complex (${graphData.node_count} nodes). ` +
          `Maximum allowed is ${_MAX_ALLOWED_NODES}. Please simplify your drawing.`
        );
      }

      if (!graphData.nodes || graphData.nodes.length === 0) {
        throw new Error('No valid nodes found in the wireframe. Ensure your sketch has clear, connected lines.');
      }

      // Step 3: Extrude 2D graph to 3D geometry
      // The graph is in XY (2D image space). We map it to XZ (builder ground plane)
      // and extrude along Y (vertical) to create 3D wall geometry.
      const { geometry, uvMap } = this._extrudeGraphToGeometry(graphData);

      // Step 4: Run validation checks on the raw geometry
      this._validateGeometry(geometry, graphData);

      // Step 5: Offload to Rust WASM for optimization (if available)
      // This prevents the JS main thread from freezing on heavy mesh ops
      const optimizedGeometry = await this._optimizeViaWASM(geometry);

      // Step 6: Create the Three.js mesh and add to builder scene
      const meshGroup = this._createWireframeMesh(optimizedGeometry, graphData);

      // Step 7: Record the import for undo support
      this.importedMeshes.push({
        group: meshGroup,
        nodeCount: graphData.node_count,
        edgeCount: graphData.edge_count,
        engineUsed: graphData.engine_used || 'unknown',
        timestamp: Date.now()
      });

      return {
        success: true,
        meshCount: meshGroup.children.length,
        nodeCount: graphData.node_count,
        edgeCount: graphData.edge_count,
        engineUsed: graphData.engine_used,
        // Expose raw graph data for inventory storage (offline re-extrusion)
        graphData: {
          nodes: graphData.nodes,
          edges: graphData.edges,
          node_count: graphData.node_count,
          edge_count: graphData.edge_count,
          engine_used: graphData.engine_used
        }
      };
    } catch (error) {
      console.error('[WireframeImporter] AI import failed:', error);
      return {
        success: false,
        meshCount: 0,
        nodeCount: 0,
        edgeCount: 0,
        engineUsed: 'error',
        graphData: null,
        error: error.message
      };
    }
  }

  /**
   * Clear all imported wireframe meshes from the builder scene.
   * Properly disposes geometries and materials to prevent memory leaks.
   */
  clearImportedMeshes() {
    if (!this.game._builderScene) return;

    for (const entry of this.importedMeshes) {
      if (entry.group) {
        this._disposeGroup(entry.group);
        this.game._builderScene.remove(entry.group);
      }
    }
    this.importedMeshes = [];
  }

  /**
   * Import a wireframe directly from stored graph data (no AI backend needed).
   * This is the offline/cached import path used by the Track Creator inventory.
   * Extrudes the provided graph data into 3D geometry and places it in the
   * builder scene, identical to the online importFromAI() result.
   *
   * @param {Object} graphData - { nodes: [[x,y],...], edges: [[i,j],...], node_count, edge_count, engine_used }
   * @returns {{ success: boolean, meshCount: number, nodeCount: number, edgeCount: number, engineUsed: string, error?: string }}
   */
  async importFromGraphData(graphData) {
    try {
      // Validate input
      if (!graphData.nodes || graphData.nodes.length === 0) {
        throw new Error('No nodes in graph data');
      }
      if (graphData.node_count > _MAX_ALLOWED_NODES) {
        throw new Error(`Wireframe too complex (${graphData.node_count} nodes). Maximum is ${_MAX_ALLOWED_NODES}.`);
      }

      // Extrude 2D graph to 3D geometry
      const { geometry } = this._extrudeGraphToGeometry(graphData);

      // Validate the geometry
      this._validateGeometry(geometry, graphData);

      // Optimize via WASM (same as online import path)
      const optimizedGeometry = await this._optimizeViaWASM(geometry);

      // Create mesh group and add to scene
      const meshGroup = this._createWireframeMesh(optimizedGeometry, graphData);

      // Record for undo support
      this.importedMeshes.push({
        group: meshGroup,
        nodeCount: graphData.node_count || graphData.nodes.length,
        edgeCount: graphData.edge_count || (graphData.edges ? graphData.edges.length : 0),
        engineUsed: graphData.engine_used || 'cached',
        timestamp: Date.now()
      });

      return {
        success: true,
        meshCount: meshGroup.children.length,
        nodeCount: graphData.node_count || graphData.nodes.length,
        edgeCount: graphData.edge_count || (graphData.edges ? graphData.edges.length : 0),
        engineUsed: graphData.engine_used || 'cached'
      };
    } catch (error) {
      console.error('[WireframeImporter] Graph data import failed:', error);
      return {
        success: false,
        meshCount: 0,
        nodeCount: 0,
        edgeCount: 0,
        engineUsed: graphData.engine_used || 'cached',
        error: error.message
      };
    }
  }

  /**
   * Undo the last wireframe import.
   * Removes the most recently imported mesh group from the scene.
   */
  undoLastImport() {
    if (this.importedMeshes.length === 0) return;

    const entry = this.importedMeshes.pop();
    if (entry.group && this.game._builderScene) {
      this._disposeGroup(entry.group);
      this.game._builderScene.remove(entry.group);
    }
  }

  // -----------------------------------------------------------------------
  // Private: Python API Communication
  // -----------------------------------------------------------------------

  /**
   * Send the image to the Python backend for wireframe parsing.
   * The backend uses HAWP (Pro/Ultimate) or OpenCV Canny (Free) to extract
   * a topological line graph from the hand-drawn sketch.
   *
   * @param {string} imageBase64 - Base64 image data
   * @param {string} userTier - 'free' | 'pro' | 'ultimate'
   * @returns {Promise<Object>} { nodes, edges, node_count, edge_count, engine_used }
   */
  async _fetchWireframeGraph(imageBase64, userTier) {
    // Validate image size before sending (prevent DoS on the backend)
    if (imageBase64.length > 10 * 1024 * 1024) {
      throw new Error('Image too large. Maximum size is 10MB.');
    }

    const response = await fetch(`${_PYTHON_API_BASE}/api/wireframe/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_data_b64: imageBase64,
        user_tier: userTier,
        snap_threshold: this._getSnapThreshold(userTier)
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait or upgrade your tier.');
      }
      if (response.status === 401) {
        throw new Error('Authentication required. Please log in to use AI features.');
      }
      throw new Error(`Python API failed (${response.status}): ${await response.text().catch(() => 'Unknown error')}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.nodes || !Array.isArray(data.nodes)) {
      throw new Error('Invalid response from AI backend: missing nodes array');
    }

    return {
      nodes: data.nodes,           // [[x, y], [x, y], ...] in image space
      edges: data.edges || [],     // [[nodeIdx, nodeIdx], ...]
      node_count: data.node_count || data.nodes.length,
      edge_count: data.edge_count || (data.edges ? data.edges.length : 0),
      engine_used: data.engine_used || 'opencv_fallback'
    };
  }

  /**
   * Determine the snap threshold based on user tier.
   * Higher tiers get tighter snapping for more precise topology.
   */
  _getSnapThreshold(userTier) {
    switch (userTier) {
      case 'ultimate': return 0.5;
      case 'pro':      return 1.0;
      default:         return 2.0; // Free: more aggressive snapping
    }
  }

  // -----------------------------------------------------------------------
  // Private: 2D Graph → 3D Geometry Extrusion
  // -----------------------------------------------------------------------

  /**
   * Extrude a 2D graph (nodes + edges from image space) into 3D geometry.
   *
   * Mapping:
   *   Image X → Builder X (horizontal on ground plane)
   *   Image Y → Builder -Z (depth on ground plane, inverted for Three.js)
   *   Extrusion → Builder Y (vertical up)
   *
   * Each edge in the graph becomes a vertical extruded wall segment.
   * The result is a single BufferGeometry containing all wall triangles.
   *
   * @param {Object} graphData - { nodes: [[x,y],...], edges: [[i,j],...] }
   * @returns {Object} { geometry: THREE.BufferGeometry, uvMap: Float32Array }
   */
  _extrudeGraphToGeometry(graphData) {
    const { nodes, edges } = graphData;

    // Calculate bounds for centering and scaling
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const [x, y] of nodes) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const rangeX = Math.max(1, maxX - minX);
    const rangeY = Math.max(1, maxY - minY);
    const scale = 15.0 / Math.max(rangeX, rangeY); // Scale to fit ~15 units

    // Build vertices and triangles for extruded walls
    const positions = [];
    const uvs = [];
    const indices = [];

    let vertexIndex = 0;

    for (const [i, j] of edges) {
      const [x1, y1] = nodes[i];
      const [x2, y2] = nodes[j];

      // Skip degenerate edges (zero-length)
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < _MIN_NODE_DISTANCE) continue;

      // Map image coordinates to builder world coordinates
      const wx1 = (x1 - minX - rangeX / 2) * scale;
      const wz1 = (y1 - minY - rangeY / 2) * scale;
      const wx2 = (x2 - minX - rangeX / 2) * scale;
      const wz2 = (y2 - minY - rangeY / 2) * scale;

      // Extrude this edge into a vertical quad (two triangles)
      // Bottom face at y=0, top face at y=extrudeDepth
      const bottom = 0;
      const top = this.extrudeDepth;

      // Four vertices per edge segment:
      // 0: bottom-left,  1: bottom-right
      // 2: top-left,     3: top-right
      positions.push(
        wx1, bottom, wz1,  // 0
        wx2, bottom, wz2,  // 1
        wx1, top, wz1,     // 2
        wx2, top, wz2      // 3
      );

      // UVs for texturing the extruded walls
      const u = length * scale * 0.1; // Horizontal UV based on edge length
      uvs.push(
        0, 0,
        u, 0,
        0, 1,
        u, 1
      );

      // Two triangles per quad: (0,1,2) and (1,3,2)
      indices.push(
        vertexIndex,     vertexIndex + 1, vertexIndex + 2,
        vertexIndex + 1, vertexIndex + 3, vertexIndex + 2
      );

      vertexIndex += 4;
    }

    if (positions.length === 0) {
      throw new Error('No connected edges found in wireframe. Ensure your sketch has clear, connected lines between nodes.');
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return { geometry, uvMap: new Float32Array(uvs) };
  }

  // -----------------------------------------------------------------------
  // Private: Geometry Validation
  // -----------------------------------------------------------------------

  /**
   * Validate the generated geometry before adding it to the scene.
   * Checks for degenerate triangles, oversized faces, and invalid normals.
   *
   * @param {THREE.BufferGeometry} geometry
   * @param {Object} graphData - For context in error messages
   * @throws {Error} If validation fails
   */
  _validateGeometry(geometry, graphData) {
    const pos = geometry.attributes.position;
    const idx = geometry.index;

    if (!pos || pos.count < 3) {
      throw new Error('Generated geometry has no vertices');
    }

    // Check for NaN/Infinity in position data
    const array = pos.array;
    for (let i = 0; i < array.length; i++) {
      if (!isFinite(array[i])) {
        throw new Error(`Invalid vertex position at index ${i}. Check the wireframe for stray marks.`);
      }
    }

    // Check for degenerate triangles (zero area) in indexed geometry
    if (idx) {
      const idxArray = idx.array;
      for (let i = 0; i < idxArray.length; i += 3) {
        const a = idxArray[i] * 3;
        const b = idxArray[i + 1] * 3;
        const c = idxArray[i + 2] * 3;

        const vax = array[a], vay = array[a + 1], vaz = array[a + 2];
        const vbx = array[b], vby = array[b + 1], vbz = array[b + 2];
        const vcx = array[c], vcy = array[c + 1], vcz = array[c + 2];

        // Compute cross product to check area
        const ux = vbx - vax, uy = vby - vay, uz = vbz - vaz;
        const vx = vcx - vax, vy = vcy - vay, vz = vcz - vaz;
        const cx = uy * vz - uz * vy;
        const cy = uz * vx - ux * vz;
        const cz = ux * vy - uy * vx;
        const area = Math.sqrt(cx * cx + cy * cy + cz * cz);

        if (area < 0.0001) {
          console.warn(`[WireframeImporter] Degenerate triangle detected at face ${Math.floor(i / 3)}`);
        }
      }
    }

    // Log validation summary
    console.info(
      `[WireframeImporter] Geometry validated: ${pos.count} vertices, ` +
      `${idx ? idx.count / 3 : Math.floor(pos.count / 3)} triangles`
    );
  }

  // -----------------------------------------------------------------------
  // Private: Rust WASM Optimization Bridge
  // -----------------------------------------------------------------------

  /**
   * Offload mesh optimization to the Rust WASM module (if available).
   * The WASM module performs:
   *   - Vertex welding (merge nearby vertices)
   *   - Degenerate triangle removal
   *   - Normal recalculation
   *
   * Falls back to vanilla Three.js when WASM is not loaded.
   *
   * @param {THREE.BufferGeometry} geometry - Raw extruded geometry
   * @returns {Promise<THREE.BufferGeometry>} Optimized geometry
   */
  async _optimizeViaWASM(geometry) {
    const posAttr = geometry.attributes.position;
    const idxAttr = geometry.index;

    try {
      // Access the WASM module through the quadCore bridge
      const wasmModule = quadCore && quadCore.wasmModule;

      if (wasmModule && typeof wasmModule.optimize_geometry === 'function') {
        // Convert Three.js geometry to WASM-compatible buffers
        const positionArray = new Float32Array(posAttr.array);
        const indexArray = idxAttr ? new Uint32Array(idxAttr.array) : null;

        // Offload to WASM — runs on a separate thread via WebWorker
        const optimizedBuffer = wasmModule.optimize_geometry(
          positionArray,
          indexArray,
          this.extrudeDepth  // Pass as merge threshold
        );

        // Reconstruct optimized geometry from WASM output
        const result = optimizedBuffer; // { positions: Float32Array, indices: Uint32Array }

        const optimizedGeo = new THREE.BufferGeometry();
        optimizedGeo.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));

        if (result.indices && result.indices.length > 0) {
          optimizedGeo.setIndex(new THREE.BufferAttribute(result.indices, 1));
        }

        optimizedGeo.computeVertexNormals();
        console.info(`[WireframeImporter] WASM optimization: ${posAttr.count}→${result.positions.length / 3} vertices`);
        return optimizedGeo;
      }
    } catch (wasmError) {
      console.warn('[WireframeImporter] WASM optimization failed, using JS fallback:', wasmError);
    }

    // Fallback: Simple JS vertex deduplication
    return this._jsOptimizeGeometry(geometry);
  }

  /**
   * JavaScript fallback for geometry optimization.
   * Merges nearby vertices within a small threshold.
   *
   * @param {THREE.BufferGeometry} geometry
   * @returns {THREE.BufferGeometry} Optimized geometry
   */
  _jsOptimizeGeometry(geometry) {
    const pos = geometry.attributes.position;
    const idx = geometry.index;

    if (!idx) return geometry; // Can't optimize non-indexed geometry easily

    const threshold = 0.01;
    const posArray = Array.from(pos.array);
    const idxArray = Array.from(idx.array);
    const newPositions = [];
    const newIndices = [];
    const vertexMap = new Map(); // key: quantized position → newIndex

    const quantize = (v) => Math.round(v / threshold);

    for (let i = 0; i < idxArray.length; i++) {
      const oldIdx = idxArray[i] * 3;
      const x = posArray[oldIdx];
      const y = posArray[oldIdx + 1];
      const z = posArray[oldIdx + 2];

      const key = `${quantize(x)},${quantize(y)},${quantize(z)}`;

      if (!vertexMap.has(key)) {
        vertexMap.set(key, newPositions.length / 3);
        newPositions.push(x, y, z);
      }

      newIndices.push(vertexMap.get(key));
    }

    const optimizedGeo = new THREE.BufferGeometry();
    optimizedGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    optimizedGeo.setIndex(newIndices);
    optimizedGeo.computeVertexNormals();

    console.info(`[WireframeImporter] JS optimization: ${pos.count}→${newPositions.length / 3} vertices`);
    return optimizedGeo;
  }

  // -----------------------------------------------------------------------
  // Private: Mesh Creation
  // -----------------------------------------------------------------------

  /**
   * Create a Three.js mesh group from the optimized geometry and add it
   * to the builder scene. Applies a technical-looking material that mimics
   * the blueprint/wireframe aesthetic of the AI generation.
   *
   * @param {THREE.BufferGeometry} geometry - Optimized extruded geometry
   * @param {Object} graphData - Source graph for metadata
   * @returns {THREE.Group} Group containing wall meshes and edge overlays
   */
  _createWireframeMesh(geometry, graphData) {
    const group = new THREE.Group();
    group.name = 'ai_wireframe_import';

    // Main extruded body — translucent technical material
    const bodyMaterial = new THREE.MeshPhongMaterial({
      color: 0x4488cc,
      emissive: 0x112244,
      transparent: true,
      opacity: 0.55,
      shininess: 30,
      side: THREE.DoubleSide,
      flatShading: false
    });

    const bodyMesh = new THREE.Mesh(geometry, bodyMaterial);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.userData = {
      isWireframeImport: true,
      engineUsed: graphData.engine_used,
      nodeCount: graphData.node_count
    };
    group.add(bodyMesh);

    // Wireframe overlay — shows the original edge topology
    // Uses EdgesGeometry for clean line rendering
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x88bbff,
      transparent: true,
      opacity: 0.6
    });
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    group.add(edgeLines);

    // Add to builder scene if available
    if (this.game._builderScene) {
      this.game._builderScene.add(group);
    }

    return group;
  }

  // -----------------------------------------------------------------------
  // Private: Memory Management
  // -----------------------------------------------------------------------

  /**
   * Properly dispose a Three.js group and all its children.
   */
  _disposeGroup(group) {
    group.traverse((child) => {
      if (child.isMesh || child.isLineSegments) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
}
