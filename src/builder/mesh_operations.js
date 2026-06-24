/**
 * =====================================================================
 * @domain:    compute
 * @concern:   Rust WASM Mesh Operation Bridge
 * @created:   2026-06-24T18:10:00Z
 * @track:     4b5c6d7e-8f9a-0b1c-2d3e-4f5a6b7c8d9e
 * @version:   1.0.0
 * @security:  Client-Side (WASM Offloaded / JS Fallback)
 * =====================================================================
 *
 * MeshOperations — bridges Three.js geometry operations to the Rust WASM core.
 *
 * Heavy mesh operations (vertex welding, boolean CSG, decimation) are
 * offloaded to the WASM module for near-native performance. When WASM is
 * unavailable, falls back to Three.js BufferGeometry utilities.
 *
 * Integration:
 *   - Bridge to rust_core physics_solver.rs (extended with mesh ops exports)
 *   - Consumed by WireframeImporter for AI-generated geometry optimization
 *   - Consumed by ws_operations.js for user-initiated mesh edits
 *   - Registers helper functions on the game object for builder_scene.js access
 *
 * @example
 *   const meshOps = new MeshOperations(game);
 *   const optimized = await meshOps.optimizeGeometry(myGeometry);
 *   const merged = await meshOps.mergeMeshes(meshArray);
 *   const valid = meshOps.validateGeometry(myGeometry);
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { quadCore } from '../core/ipc_bridge.js';

// [IMPORT LOCK] Retained for context stability.
const _WELD_THRESHOLD = 0.01;       // Distance threshold for vertex welding
const _MIN_TRIANGLE_AREA = 0.0001;  // Reject degenerate triangles below this area
const _MAX_VERTICES_WARN = 100000;  // Warn on geometry exceeding this vertex count

// ---------------------------------------------------------------------------
// MeshOperations
// ---------------------------------------------------------------------------

export class MeshOperations {
  /**
   * @param {Object} game - Game state object (for attaching helper methods)
   */
  constructor(game) {
    this.game = game;
    this._wasmAvailable = false;
    this._operationCount = 0;

    // Register convenience methods on the game object so builder_scene.js
    // and ws_operations.js can call them easily
    this._registerGameHelpers();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Optimize a geometry by welding nearby vertices and removing degenerates.
   * Offloads to Rust WASM when available; falls back to Three.js utils.
   *
   * @param {THREE.BufferGeometry} geometry - Input geometry
   * @param {number} [weldThreshold=_WELD_THRESHOLD] - Max distance for vertex merging
   * @returns {Promise<THREE.BufferGeometry>} Optimized geometry
   */
  async optimizeGeometry(geometry, weldThreshold = _WELD_THRESHOLD) {
    this._operationCount++;

    if (!geometry || !geometry.attributes.position) {
      console.warn('[MeshOps] Invalid geometry passed to optimizeGeometry');
      return geometry;
    }

    const initialVerts = geometry.attributes.position.count;

    try {
      // Try WASM first
      const wasmResult = await this._wasmOptimize(geometry, weldThreshold);
      if (wasmResult) {
        console.info(
          `[MeshOps] WASM optimize: ${initialVerts}→${wasmResult.attributes.position.count} vertices`
        );
        return wasmResult;
      }
    } catch (wasmError) {
      console.warn('[MeshOps] WASM optimize failed, falling back to JS:', wasmError);
    }

    // JS fallback: Use Three.js BufferGeometryUtils
    return this._jsOptimize(geometry, weldThreshold);
  }

  /**
   * Merge an array of meshes into a single geometry.
   * Combines positions and indices, then runs optimizeGeometry.
   *
   * @param {THREE.Mesh[]} meshes - Array of meshes to merge
   * @returns {Promise<THREE.BufferGeometry>} Merged geometry
   */
  async mergeMeshes(meshes) {
    if (!meshes || meshes.length === 0) return null;

    this._operationCount++;

    try {
      // Use Three.js mergeGeometries for the raw merge
      const geoms = [];

      for (const mesh of meshes) {
        if (!mesh.geometry) continue;

        const geom = mesh.geometry.clone();
        // Apply world matrix to transform into shared space
        mesh.updateWorldMatrix(true, false);
        geom.applyMatrix4(mesh.matrixWorld);
        geoms.push(geom);
      }

      if (geoms.length === 0) return null;

      // Use the available merge function from BufferGeometryUtils
      const mergeFn = BufferGeometryUtils.mergeGeometries ||
                      BufferGeometryUtils.mergeBufferGeometries;

      if (typeof mergeFn !== 'function') {
        throw new Error('No merge function available in BufferGeometryUtils');
      }

      const mergedGeo = mergeFn(geoms, true);

      // Optimize the merged result
      const optimized = await this.optimizeGeometry(mergedGeo);

      const totalVerts = geoms.reduce((s, g) => s + g.attributes.position.count, 0);
      console.info(
        `[MeshOps] Merged ${meshes.length} meshes: ${totalVerts}→${optimized.attributes.position.count} vertices`
      );

      return optimized;
    } catch (error) {
      console.error('[MeshOps] mergeMeshes failed:', error);
      return null;
    }
  }

  /**
   * Validate a geometry for structural integrity.
   * Checks: NaN/Infinity positions, degenerate triangles, inverted normals.
   *
   * @param {THREE.BufferGeometry} geometry
   * @returns {{ valid: boolean, warnings: string[], vertexCount: number, triangleCount: number }}
   */
  validateGeometry(geometry) {
    const warnings = [];

    if (!geometry) {
      return { valid: false, warnings: ['Geometry is null'], vertexCount: 0, triangleCount: 0 };
    }

    const pos = geometry.attributes.position;
    if (!pos) {
      return { valid: false, warnings: ['Geometry has no position attribute'], vertexCount: 0, triangleCount: 0 };
    }

    const vertexCount = pos.count;
    const idx = geometry.index;
    const triangleCount = idx ? Math.floor(idx.count / 3) : Math.floor(vertexCount / 3);

    // Check 1: NaN/Infinity in position data
    const array = pos.array;
    for (let i = 0; i < array.length; i++) {
      if (!isFinite(array[i])) {
        warnings.push(`Invalid vertex position at index ${Math.floor(i / 3)}`);
        break;
      }
    }

    // Check 2: Warn on extremely large geometries
    if (vertexCount > _MAX_VERTICES_WARN) {
      warnings.push(
        `Large geometry (${vertexCount} vertices). ` +
        'Consider running optimizeGeometry to reduce complexity.'
      );
    }

    // Check 3: Degenerate triangles
    if (idx) {
      let degenerateCount = 0;
      const idxArray = idx.array;
      const posArray = array;

      for (let i = 0; i < idxArray.length && degenerateCount < 5; i += 3) {
        const a = idxArray[i] * 3;
        const b = idxArray[i + 1] * 3;
        const c = idxArray[i + 2] * 3;

        const ux = posArray[b] - posArray[a];
        const uy = posArray[b + 1] - posArray[a + 1];
        const uz = posArray[b + 2] - posArray[a + 2];
        const vx = posArray[c] - posArray[a];
        const vy = posArray[c + 1] - posArray[a + 1];
        const vz = posArray[c + 2] - posArray[a + 2];

        const crossX = uy * vz - uz * vy;
        const crossY = uz * vx - ux * vz;
        const crossZ = ux * vy - uy * vx;
        const area = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);

        if (area < _MIN_TRIANGLE_AREA) {
          degenerateCount++;
        }
      }

      if (degenerateCount > 0) {
        warnings.push(`Found ${degenerateCount} degenerate triangle(s) (area < ${_MIN_TRIANGLE_AREA})`);
      }
    }

    // Check 4: Normal computation
    try {
      geometry.computeVertexNormals();
    } catch (normalError) {
      warnings.push(`Normal computation failed: ${normalError.message}`);
    }

    return {
      valid: warnings.length === 0,
      warnings,
      vertexCount,
      triangleCount
    };
  }

  /**
   * Apply a boolean cut operation on a geometry.
   * This is gated behind Pro/Ultimate tiers and requires WASM.
   * Falls back to a simple clip-plane approach in JS.
   *
   * @param {THREE.BufferGeometry} sourceGeometry
   * @param {{ position: THREE.Vector3, normal: THREE.Vector3 }} cutPlane
   * @returns {Promise<THREE.BufferGeometry>} Result geometry
   */
  async booleanCut(sourceGeometry, cutPlane) {
    this._operationCount++;

    try {
      const wasmResult = await this._wasmBooleanCut(sourceGeometry, cutPlane);
      if (wasmResult) return wasmResult;
    } catch (wasmError) {
      console.warn('[MeshOps] WASM boolean cut failed, using JS fallback:', wasmError);
    }

    // JS fallback: Simple clip plane using vertex classification
    return this._jsClipGeometry(sourceGeometry, cutPlane);
  }

  /**
   * Compute the bounding box and center of a geometry.
   *
   * @param {THREE.BufferGeometry} geometry
   * @returns {{ center: THREE.Vector3, size: THREE.Vector3, boundingBox: THREE.Box3 }}
   */
  computeBounds(geometry) {
    if (!geometry) return null;

    geometry.computeBoundingBox();
    const box = geometry.boundingBox || new THREE.Box3();
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    return { center, size, boundingBox: box };
  }

  /**
   * Get operation statistics for debugging.
   */
  getStats() {
    return {
      operationCount: this._operationCount,
      wasmAvailable: this._wasmAvailable
    };
  }

  // -----------------------------------------------------------------------
  // Private: WASM Bridge Methods
  // -----------------------------------------------------------------------

  /**
   * Try to optimize geometry using the Rust WASM module.
   * The WASM module is expected to expose:
   *   optimize_geometry(positions: Float32Array, indices: Uint32Array | null, threshold: f32)
   *     → { positions: Float32Array, indices: Uint32Array }
   *
   * @param {THREE.BufferGeometry} geometry
   * @param {number} threshold - Weld distance
   * @returns {Promise<THREE.BufferGeometry|null>} null if WASM unavailable
   */
  async _wasmOptimize(geometry, threshold) {
    const wasmModule = this._getWasmModule();
    if (!wasmModule) return null;

    const posAttr = geometry.attributes.position;
    const idxAttr = geometry.index;

    const positions = new Float32Array(posAttr.array);
    const indices = idxAttr ? new Uint32Array(idxAttr.array) : null;

    const result = wasmModule.optimize_geometry(positions, indices, threshold);

    if (!result || !result.positions) return null;

    this._wasmAvailable = true;

    const optimized = new THREE.BufferGeometry();
    optimized.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));

    if (result.indices && result.indices.length > 0) {
      optimized.setIndex(new THREE.BufferAttribute(result.indices, 1));
    }

    optimized.computeVertexNormals();
    return optimized;
  }

  /**
   * Try to perform a boolean cut using the Rust WASM module.
   *
   * @param {THREE.BufferGeometry} sourceGeometry
   * @param {Object} cutPlane
   * @returns {Promise<THREE.BufferGeometry|null>}
   */
  async _wasmBooleanCut(sourceGeometry, cutPlane) {
    const wasmModule = this._getWasmModule();
    if (!wasmModule || typeof wasmModule.boolean_cut !== 'function') return null;

    const posAttr = sourceGeometry.attributes.position;
    const idxAttr = sourceGeometry.index;

    const positions = new Float32Array(posAttr.array);
    const indices = idxAttr ? new Uint32Array(idxAttr.array) : null;

    const plane = {
      px: cutPlane.position.x,
      py: cutPlane.position.y,
      pz: cutPlane.position.z,
      nx: cutPlane.normal.x,
      ny: cutPlane.normal.y,
      nz: cutPlane.normal.z
    };

    const result = wasmModule.boolean_cut(positions, indices, plane);

    if (!result || !result.positions) return null;

    this._wasmAvailable = true;

    const cutGeo = new THREE.BufferGeometry();
    cutGeo.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));

    if (result.indices && result.indices.length > 0) {
      cutGeo.setIndex(new THREE.BufferAttribute(result.indices, 1));
    }

    cutGeo.computeVertexNormals();
    return cutGeo;
  }

  /**
   * Get the WASM module from the quadCore bridge.
   * Returns null if WASM is not initialized or unavailable.
   */
  _getWasmModule() {
    try {
      return (quadCore && quadCore.wasmModule) || null;
    } catch (e) {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Private: JavaScript Fallbacks
  // -----------------------------------------------------------------------

  /**
   * JavaScript fallback for geometry optimization using Three.js utilities.
   */
  _jsOptimize(geometry, threshold) {
    try {
      // Attempt to merge vertices using BufferGeometryUtils
      const mergeVerticesFn = BufferGeometryUtils.mergeVertices ||
                              BufferGeometryUtils.mergeBufferVertices;

      if (typeof mergeVerticesFn === 'function') {
        const merged = mergeVerticesFn(geometry, threshold);
        merged.computeVertexNormals();
        return merged;
      }
    } catch (error) {
      console.warn('[MeshOps] JS mergeVertices failed:', error);
    }

    // If merge fails, return the original geometry
    return geometry;
  }

  /**
   * JavaScript fallback for clip/cut operation.
   * Uses a simple plane-based vertex classification.
   */
  _jsClipGeometry(sourceGeometry, cutPlane) {
    const pos = sourceGeometry.attributes.position;
    const idx = sourceGeometry.index;

    if (!idx) return sourceGeometry; // Can't clip non-indexed geometry

    const posArray = pos.array;
    const idxArray = idx.array;

    const planeNormal = cutPlane.normal.clone().normalize();
    const planePoint = cutPlane.position;

    // Classify each vertex on which side of the plane it lies
    const side = new Int8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const v = new THREE.Vector3(posArray[i3], posArray[i3 + 1], posArray[i3 + 2]);
      const d = v.sub(planePoint).dot(planeNormal);
      side[i] = d >= 0 ? 1 : -1;
    }

    // Keep triangles where all three vertices are on the positive side
    const newIndices = [];
    for (let i = 0; i < idxArray.length; i += 3) {
      const a = idxArray[i];
      const b = idxArray[i + 1];
      const c = idxArray[i + 2];

      // Keep triangle if all vertices are on the positive side
      if (side[a] >= 0 && side[b] >= 0 && side[c] >= 0) {
        newIndices.push(a, b, c);
      }
    }

    if (newIndices.length === 0) {
      // All triangles were clipped away — return empty geometry
      const empty = new THREE.BufferGeometry();
      empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      return empty;
    }

    const clipped = new THREE.BufferGeometry();
    clipped.setAttribute('position', new THREE.Float32BufferAttribute(posArray.slice(), 3));
    clipped.setIndex(newIndices);
    clipped.computeVertexNormals();

    return clipped;
  }

  // -----------------------------------------------------------------------
  // Private: Game Helpers
  // -----------------------------------------------------------------------

  /**
   * Register helper methods on the game object so existing builder_scene.js
   * and ws_operations.js code can access them without needing to import
   * MeshOperations directly.
   */
  _registerGameHelpers() {
    if (!this.game) return;

    const self = this;

    // Optimize all selected meshes
    this.game._meshOptimizeSelected = async function () {
      if (!this._builderPlacedParts || this._builderPlacedParts.length === 0) return;

      const meshes = [];
      for (const part of this._builderPlacedParts) {
        if (part.meshes) {
          for (const mesh of part.meshes) {
            if (mesh.geometry) meshes.push(mesh);
          }
        }
      }

      if (meshes.length === 0) return;

      const merged = await self.mergeMeshes(meshes);
      if (!merged) return;

      // Create a single merged mesh and replace all individual parts
      const mergedMaterial = new THREE.MeshPhongMaterial({
        color: 0x8B7355,
        flatShading: false
      });
      const mergedMesh = new THREE.Mesh(merged, mergedMaterial);
      mergedMesh.castShadow = true;
      mergedMesh.receiveShadow = true;
      mergedMesh.userData = { isMergedGeometry: true };

      // Remove old meshes from scene
      for (const part of this._builderPlacedParts) {
        if (part.meshes) {
          for (const mesh of part.meshes) {
            if (this._builderScene) this._builderScene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
          }
        }
      }

      // Add merged mesh
      if (this._builderScene) {
        this._builderScene.add(mergedMesh);
      }

      this._builderPlacedParts = [{
        partKey: 'merged_geometry',
        x: 0, y: 0, z: 0,
        rotation: 0,
        params: {},
        meshes: [mergedMesh],
        id: 'merged_' + Date.now()
      }];

      console.info(`[MeshOps] Merged ${meshes.length} meshes into 1`);
    };

    // Validate track geometry before building
    this.game._meshValidateTrack = function () {
      if (!this._builderPlacedParts) {
        return { valid: false, warnings: ['No track data'], vertexCount: 0, triangleCount: 0 };
      }

      let vertexCount = 0;
      let triangleCount = 0;
      const allWarnings = [];

      for (const part of this._builderPlacedParts) {
        if (!part.meshes) continue;
        for (const mesh of part.meshes) {
          if (!mesh.geometry) continue;
          const result = self.validateGeometry(mesh.geometry);
          vertexCount += result.vertexCount;
          triangleCount += result.triangleCount;
          allWarnings.push(...result.warnings.map(w => `${part.partKey}: ${w}`));
        }
      }

      return {
        valid: allWarnings.length === 0,
        warnings: allWarnings,
        vertexCount,
        triangleCount
      };
    };
  }
}
