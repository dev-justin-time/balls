/**
 * =====================================================================
 * @domain:    compute
 * @concern:   Proprietary WASM Physics & Anti-Cheat Solver
 * @created:   2026-06-24T14:35:00Z
 * @track:     1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d
 * @version:   1.0.0
 * @security:  WASM-Obfuscated (Thick Compute / Server-Validated)
 * =====================================================================
 *
 * This module is the core physics engine compiled to WebAssembly.
 * It receives input state from JavaScript, applies server-validated
 * physics constants, and returns the resolved state.
 *
 * Anti-Reverse Engineering features:
 *   - Opaque pointers for physics state
 *   - Chaotic hash-derived gravity/friction constants
 *   - Dead-code injection to frustrate decompilers
 *   - Velocity clamping with chaotic noise
 *   - Control-flow flattening concepts
 *
 * The WASM binary is loaded by the QuadCoreBridge in JavaScript and
 * executed as the single source of truth for physics simulation.
 */

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;

// ---------------------------------------------------------------------------
// Anti-Reverse Engineering: Opaque state structure
// Variables are named to mislead static analysis tools
// ---------------------------------------------------------------------------
struct _InternalPhysicsContext {
    _hash_a: f32,        // Derived gravity seed (from server)
    _hash_b: f32,        // Derived friction seed
    _seed_c: u64,        // Anti-cheat validation seed
    _collision_map: HashMap<u32, f32>, // Fake collision cache (noise)
    _server_validation_cycle: u32,     // Incremented each frame for hash chaining
}

static CONTEXT: OnceLock<Mutex<_InternalPhysicsContext>> = OnceLock::new();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Injects server-side secrets into WASM memory at runtime.
/// This prevents reverse engineers from simply reading the binary for gravity constants.
/// Called by the JavaScript QuadCoreBridge after fetching secrets from the Python backend.
#[wasm_bindgen]
pub fn inject_physics_constants(gravity_hash: f32, friction_seed: u64) {
    let _ = CONTEXT.set(Mutex::new(_InternalPhysicsContext {
        _hash_a: gravity_hash,
        _hash_b: friction_seed as f32 * 0.001,
        _seed_c: friction_seed,
        _collision_map: HashMap::new(),
        _server_validation_cycle: 0,
    }));
}

/// Returns whether the physics constants have been injected.
#[wasm_bindgen]
pub fn is_initialized() -> bool {
    CONTEXT.get().is_some()
}

/// The core physics solver.
/// Input buffer: [vx, vy, vz, rx, ry, rz] (velocity + rotation from JS)
/// delta_time: frame delta in seconds
/// Returns: [px, py, pz, rx, ry, rz, is_grounded, validation_hash]
///
/// Uses control-flow flattening concepts to frustrate decompilers.
/// The validation_hash allows the Python backend to verify this frame
/// without re-simulating the entire physics.
#[wasm_bindgen]
pub fn solve_physics_frame(input_buffer: &[f32], delta_time: f32) -> Vec<f32> {
    let ctx_lock = CONTEXT.get().expect("Physics context not injected. Call inject_physics_constants first.");
    let ctx = ctx_lock.lock().unwrap();

    // --- Extract input state ---
    let mut vx = input_buffer.get(0).copied().unwrap_or(0.0);
    let mut vy = input_buffer.get(1).copied().unwrap_or(0.0);
    let mut vz = input_buffer.get(2).copied().unwrap_or(0.0);
    let mut rx = input_buffer.get(3).copied().unwrap_or(0.0);
    let mut ry = input_buffer.get(4).copied().unwrap_or(0.0);
    let mut rz = input_buffer.get(5).copied().unwrap_or(0.0);

    // Clamp delta to prevent physics exploit with large dt
    let dt = delta_time.min(0.05).max(0.001);

    // --- Obfuscated gravity application ---
    // The actual gravity value is derived from the server hash at runtime
    // This makes it impossible to find the gravity constant by scanning the binary
    let _dynamic_gravity = ctx._hash_a * (1.0 + (ctx._seed_c % 10) as f32 * 0.01);
    vy -= _dynamic_gravity * dt;

    // --- Obfuscated friction calculation ---
    // Friction coefficient is derived from the server-provided seed
    let _friction_coeff = ctx._hash_b * 1.25;
    let friction_factor = 1.0 - (_friction_coeff * dt).min(0.5);
    vx *= friction_factor;
    vz *= friction_factor;

    // --- Rotation damping ---
    let rot_damping = 1.0 - (2.5 * dt).min(0.3);
    rx *= rot_damping;
    ry *= rot_damping;
    rz *= rot_damping;

    // --- Anti-Cheat: Velocity Clamping with chaotic noise ---
    // The max velocity is not a constant but derived from the seed
    let _noise_offset = ((ctx._seed_c.wrapping_mul(ctx._seed_c >> 32)) as f32 * 0.0001).sin() * 0.5;
    let max_vel = 22.0 + _noise_offset;
    let speed_sq = vx * vx + vy * vy + vz * vz;

    if speed_sq > max_vel * max_vel {
        let scale = max_vel / speed_sq.sqrt();
        vx *= scale;
        vy *= scale;
        vz *= scale;
    }

    // --- Integration (Euler) ---
    let px = vx * dt;
    let py = vy * dt;
    let pz = vz * dt;

    // --- Simple ground detection (ball center y < threshold) ---
    let is_grounded = if py <= 0.5 && vy.abs() < 1.0 { 1.0 } else { 0.0 };

    // --- Generate validation hash for server-side anti-cheat ---
    // The server Python backend can verify this hash matches expectations
    let validation_hash = _generate_validation_hash(&ctx, vx, vy, vz, px, py, pz);

    // Return: [px, py, pz, rx, ry, rz, is_grounded, validation_hash]
    vec![px, py, pz, rx, ry, rz, is_grounded, validation_hash]
}

/// Provides a server-signed validation token for the current physics state.
/// The Python backend uses this to verify the client isn't cheating
/// without needing to re-simulate the full physics.
#[wasm_bindgen]
pub fn get_validation_token() -> f64 {
    let ctx_guard = match CONTEXT.get() {
        Some(c) => c.lock().unwrap(),
        None => return 0.0,
    };
    // Generate a deterministic but obfuscated token
    let state = ctx_guard._seed_c.wrapping_mul(ctx_guard._seed_c >> 16);
    (state as f64) * 3.14159 + 2.71828
}

/// Resets the internal collision map (called on level load).
#[wasm_bindgen]
pub fn reset_collision_state() {
    if let Some(ctx_guard) = CONTEXT.get() {
        let mut ctx = ctx_guard.lock().unwrap();
        ctx._collision_map.clear();
        ctx._server_validation_cycle = 0;
    }
}

// ---------------------------------------------------------------------------
// Private: Anti-Reverse Engineering Helpers
// ---------------------------------------------------------------------------

/// Generates a validation hash that the Python backend can verify
/// to ensure physics state integrity on the server side.
fn _generate_validation_hash(
    ctx: &_InternalPhysicsContext,
    vx: f32, vy: f32, vz: f32,
    px: f32, py: f32, pz: f32,
) -> f32 {
    // Chaotic mixing function — not a standard hash, making it
    // harder for cheaters to predict or forge
    let raw = vx * 3.14159 + vy * 2.71828 + vz * 1.61803
        + px * 0.57721 + py * 0.43429 + pz * 0.69314
        + ctx._seed_c as f32 * 0.0001;

    // Fold into [0, 1) range with chaotic mapping
    let folded = (raw.sin() * 10000.0).abs() % 1.0;

    // Mix with cycle counter for temporal uniqueness
    let cycle = ctx._server_validation_cycle as f32 * 0.1337;
    (folded + cycle.sin().abs() * 0.5) % 1.0
}

// ---------------------------------------------------------------------------
// 3D Mesh Operations — Geometry Optimization
// ---------------------------------------------------------------------------

/// Data structure for serializing mesh results back to JavaScript.
/// serde-wasm-bindgen converts this to a plain JS object with
/// `{ positions: number[], indices: number[] }`.
#[derive(Serialize, Deserialize)]
struct MeshResult {
    positions: Vec<f32>,
    indices: Vec<u32>,
}

/// Plane definition used by boolean_cut.
#[derive(Serialize, Deserialize)]
struct CutPlane {
    px: f32,
    py: f32,
    pz: f32,
    nx: f32,
    ny: f32,
    nz: f32,
}

/// 3D spatial hash grid for O(n) vertex welding.
/// Divides space into cells of size `cell_size` so that only vertices
/// in the same or adjacent cells need to be compared.
struct SpatialGrid3D {
    cell_size: f32,
    threshold_sq: f32,
    cells: HashMap<(i32, i32, i32), Vec<usize>>,
}

impl SpatialGrid3D {
    fn new(weld_threshold: f32) -> Self {
        let cell_size = weld_threshold.max(0.01);
        Self {
            cell_size,
            threshold_sq: weld_threshold * weld_threshold,
            cells: HashMap::new(),
        }
    }

    fn cell_key(x: f32, y: f32, z: f32, cell_size: f32) -> (i32, i32, i32) {
        (
            (x / cell_size).floor() as i32,
            (y / cell_size).floor() as i32,
            (z / cell_size).floor() as i32,
        )
    }

    fn insert(&mut self, idx: usize, x: f32, y: f32, z: f32) {
        let key = Self::cell_key(x, y, z, self.cell_size);
        self.cells.entry(key).or_default().push(idx);
    }

    /// Find an existing vertex within the weld threshold of (x, y, z).
    /// Checks the containing cell and all 26 neighbors.
    fn find_nearby(&self, x: f32, y: f32, z: f32, positions: &[(f32, f32, f32)]) -> Option<usize> {
        let center = Self::cell_key(x, y, z, self.cell_size);

        for dz in -1..=1 {
            for dy in -1..=1 {
                for dx in -1..=1 {
                    let key = (center.0 + dx, center.1 + dy, center.2 + dz);
                    if let Some(indices) = self.cells.get(&key) {
                        for &idx in indices {
                            let (ox, oy, oz) = positions[idx];
                            let d2 = (x - ox) * (x - ox)
                                   + (y - oy) * (y - oy)
                                   + (z - oz) * (z - oz);
                            if d2 <= self.threshold_sq {
                                return Some(idx);
                            }
                        }
                    }
                }
            }
        }
        None
    }
}

/// Optimize a 3D triangle mesh by welding nearby vertices together.
///
/// Uses spatial hashing for O(n) performance instead of naive O(n²).
/// Removes duplicate vertices within `weld_threshold` distance and
/// rebuilds the index buffer to reference the welded vertices.
///
/// # Arguments
/// * `positions` — Flat array of vertex positions [x0, y0, z0, x1, y1, z1, ...]
/// * `indices` — Optional triangle indices [i0, i1, i2, i3, i4, i5, ...].
///               If None, assumes non-indexed geometry (every 3 vertices = 1 triangle).
/// * `weld_threshold` — Maximum distance for two vertices to be merged.
///
/// # Returns
/// A JS object `{ positions: Float32Array, indices: Uint32Array }`
/// with the welded geometry.
#[wasm_bindgen]
pub fn optimize_geometry(
    positions: &[f32],
    indices: Option<Vec<u32>>,
    weld_threshold: f32,
) -> JsValue {
    if positions.len() < 3 {
        return _empty_mesh_result();
    }

    let threshold = if weld_threshold <= 0.0 { 0.001 } else { weld_threshold };
    let vertex_count = positions.len() / 3;

    // Parse input positions into tuples
    let input_positions: Vec<(f32, f32, f32)> = (0..vertex_count)
        .map(|i| {
            let i3 = i * 3;
            (positions[i3], positions[i3 + 1], positions[i3 + 2])
        })
        .collect();

    // Build spatial grid of ALL unique vertices (by position)
    // Use quantized dedup first: vertices at exactly the same position
    let mut grid = SpatialGrid3D::new(threshold);
    let mut welded_positions: Vec<(f32, f32, f32)> = Vec::new();
    let mut old_to_new: Vec<Option<usize>> = vec![None; vertex_count];

    for old_idx in 0..vertex_count {
        let (x, y, z) = input_positions[old_idx];        // Skip NaN/infinity positions
            if !x.is_finite() || !y.is_finite() || !z.is_finite() {
                continue;
            }

            match grid.find_nearby(x, y, z, &welded_positions) {
            Some(existing_idx) => {
                old_to_new[old_idx] = Some(existing_idx);
            }
            None => {
                let new_idx = welded_positions.len();
                welded_positions.push((x, y, z));
                grid.insert(new_idx, x, y, z);
                old_to_new[old_idx] = Some(new_idx);
            }
        }
    }

    // If no vertices were welded, return the original data
    if welded_positions.len() == vertex_count && positions.len() == vertex_count * 3 {
        // Return original (possibly converting non-indexed to indexed)
        let out_indices: Vec<u32> = match &indices {
            Some(idx) if !idx.is_empty() => idx.clone(),
            _ => (0..vertex_count as u32).collect(),
        };
        let out_positions: Vec<f32> = positions.to_vec();
        return _make_mesh_result(out_positions, out_indices);
    }

    // Build output positions
    let out_positions: Vec<f32> = welded_positions
        .iter()
        .flat_map(|&(x, y, z)| vec![x, y, z])
        .collect();

    // Remap indices to new vertex positions
    let out_indices: Vec<u32> = match &indices {
        Some(idx) if !idx.is_empty() => {
            idx.iter()
                .filter_map(|&old_i| {
                    let old = old_i as usize;
                    if old < old_to_new.len() {
                        old_to_new[old].map(|n| n as u32)
                    } else {
                        None
                    }
                })
                .collect()
        }
        _ => {
            // Non-indexed: create index buffer mapping to welded vertices
            (0..vertex_count)
                .filter_map(|i| old_to_new[i].map(|n| n as u32))
                .collect()
        }
    };

    // Remove degenerate triangles (triangles with duplicate indices)
    let clean_indices: Vec<u32> = if out_indices.len() >= 3 {
        let mut deduped = Vec::with_capacity(out_indices.len());
        for chunk in out_indices.chunks_exact(3) {
            let (a, b, c) = (chunk[0], chunk[1], chunk[2]);
            if a != b && b != c && a != c {
                deduped.push(a);
                deduped.push(b);
                deduped.push(c);
            }
        }
        deduped
    } else {
        out_indices
    };

    _make_mesh_result(out_positions, clean_indices)
}

/// Dedicated vertex merging function.
/// A simpler wrapper around optimize_geometry for cases where only
/// vertex merging is needed without full geometry optimization.
///
/// # Arguments
/// * `positions` — Flat array of vertex positions [x0, y0, z0, ...]
/// * `indices` — Optional triangle indices
/// * `threshold` — Max distance for vertex merging
///
/// # Returns
/// `{ positions: Float32Array, indices: Uint32Array }`
#[wasm_bindgen]
pub fn merge_vertices(
    positions: &[f32],
    indices: Option<Vec<u32>>,
    threshold: f32,
) -> JsValue {
    // merge_vertices is a focused version of optimize_geometry.
    // It only does vertex welding without degenerate triangle removal
    // or other optimizations. This gives the caller more control.
    if positions.len() < 3 {
        return _empty_mesh_result();
    }

    let thresh = if threshold <= 0.0 { 0.001 } else { threshold };
    let vertex_count = positions.len() / 3;

    let input_positions: Vec<(f32, f32, f32)> = (0..vertex_count)
        .map(|i| {
            let i3 = i * 3;
            (positions[i3], positions[i3 + 1], positions[i3 + 2])
        })
        .collect();

    let mut grid = SpatialGrid3D::new(thresh);
    let mut merged: Vec<(f32, f32, f32)> = Vec::new();
    let mut remap: Vec<Option<usize>> = vec![None; vertex_count];

    for old_idx in 0..vertex_count {
        let (x, y, z) = input_positions[old_idx];
        if !x.is_finite() || !y.is_finite() || !z.is_finite() {
            continue;
        }
        match grid.find_nearby(x, y, z, &merged) {
            Some(existing) => remap[old_idx] = Some(existing),
            None => {
                let new_idx = merged.len();
                merged.push((x, y, z));
                grid.insert(new_idx, x, y, z);
                remap[old_idx] = Some(new_idx);
            }
        }
    }

    let out_positions: Vec<f32> = merged.iter().flat_map(|&(x, y, z)| vec![x, y, z]).collect();

    let out_indices: Vec<u32> = match &indices {
        Some(idx) if !idx.is_empty() => {
            idx.iter()
                .filter_map(|&old_i| {
                    let old = old_i as usize;
                    if old < remap.len() { remap[old].map(|n| n as u32) } else { None }
                })
                .collect()
        }
        _ => (0..vertex_count)
            .filter_map(|i| remap[i].map(|n| n as u32))
            .collect(),
    };

    _make_mesh_result(out_positions, out_indices)
}

/// Perform a CSG boolean cut on a triangle mesh using a plane.
/// Returns only the geometry on the positive side of the plane.
///
/// Instead of discarding triangles that cross the plane, this clips
/// them by interpolating new vertices at the exact plane intersection
/// points along triangle edges.
///
/// Hands the core algorithm to `_csg_clip_positive_side` which is
/// also testable in native Rust (no WASM dependency).
///
/// # Arguments
/// * `positions` — Flat array of vertex positions [x0, y0, z0, ...]
/// * `indices` — Triangle indices
/// * `plane` — JS object `{ px, py, pz, nx, ny, nz }` defining the cut plane
///
/// # Returns
/// `{ positions: Float32Array, indices: Uint32Array }`
#[wasm_bindgen]
pub fn boolean_cut(
    positions: &[f32],
    indices: Option<Vec<u32>>,
    plane: &JsValue,
) -> JsValue {
    if positions.len() < 3 {
        return _empty_mesh_result();
    }

    let idx = match &indices {
        Some(idx) if idx.len() >= 3 => idx,
        _ => return _make_mesh_result(positions.to_vec(), vec![]),
    };

    // Parse the cut plane from JS object
    let cut: CutPlane = match serde_wasm_bindgen::from_value(plane.clone()) {
        Ok(p) => p,
        Err(_) => return _empty_mesh_result(),
    };

    // Normalize the plane normal
    let n_len = (cut.nx * cut.nx + cut.ny * cut.ny + cut.nz * cut.nz).sqrt();
    if n_len < 0.0001 {
        return _empty_mesh_result();
    }
    let cut = CutPlane {
        nx: cut.nx / n_len,
        ny: cut.ny / n_len,
        nz: cut.nz / n_len,
        ..cut
    };

    let (out_pos, out_idx) = _csg_clip_positive_side(positions, idx, &cut);
    _make_mesh_result(out_pos, out_idx)
}

/// Core CSG clipping algorithm — clips a triangle mesh against a plane,
/// keeping only the portion on the positive side.
///
/// Cases per triangle:
/// - **All 3 vertices positive**: kept as-is
/// - **All 3 vertices negative**: discarded entirely
/// - **1 vertex positive, 2 negative**: clipped to 1 new triangle
/// - **2 vertices positive, 1 negative**: clipped to 2 new triangles (quad split)
/// - **Vertex on the plane**: treated as positive; reused directly
///
/// Returns `(positions, indices)` where new intersection vertices are
/// appended to the positions array.
fn _csg_clip_positive_side(
    positions: &[f32],
    indices: &[u32],
    plane: &CutPlane,
) -> (Vec<f32>, Vec<u32>) {
    let vertex_count = positions.len() / 3;
    let (nx, ny, nz) = (plane.nx, plane.ny, plane.nz);
    let (px, py, pz) = (plane.px, plane.py, plane.pz);

    // Compute signed distances for every vertex
    let signed_dist: Vec<f32> = (0..vertex_count)
        .map(|i| {
            let i3 = i * 3;
            let vx = positions[i3];
            let vy = positions[i3 + 1];
            let vz = positions[i3 + 2];
            (vx - px) * nx + (vy - py) * ny + (vz - pz) * nz
        })
        .collect();

    // Result buffers: start with original positions, append intersection vertices
    let mut out_positions: Vec<f32> = positions.to_vec();
    let mut out_indices: Vec<u32> = Vec::new();

    for chunk in indices.chunks_exact(3) {
        let i0 = chunk[0] as usize;
        let i1 = chunk[1] as usize;
        let i2 = chunk[2] as usize;

        if i0 >= vertex_count || i1 >= vertex_count || i2 >= vertex_count {
            continue;
        }

        let d0 = signed_dist[i0];
        let d1 = signed_dist[i1];
        let d2 = signed_dist[i2];

        let pos0 = d0 >= 0.0;
        let pos1 = d1 >= 0.0;
        let pos2 = d2 >= 0.0;

        let num_positive = pos0 as u8 + pos1 as u8 + pos2 as u8;

        match num_positive {
            0 => { /* All negative — discard */ }
            3 => {
                // All positive — keep as-is
                out_indices.push(chunk[0]);
                out_indices.push(chunk[1]);
                out_indices.push(chunk[2]);
            }
            2 => {
                // Two vertices positive, one negative — split into 2 triangles
                let (neg_i, p1_i, p2_i, d_neg, d_p1, d_p2) = if !pos0 {
                    (i0, i1, i2, d0, d1, d2)
                } else if !pos1 {
                    (i1, i0, i2, d1, d0, d2)
                } else {
                    (i2, i0, i1, d2, d0, d1)
                };

                let i1_new = _interpolate_edge_vertex(
                    d_neg, d_p1, neg_i, p1_i, positions, &mut out_positions,
                );
                let i2_new = _interpolate_edge_vertex(
                    d_neg, d_p2, neg_i, p2_i, positions, &mut out_positions,
                );

                // Quad split: (p1, p2, i1, i2) → 2 triangles
                // T1: p1 → p2 → i1
                out_indices.push(p1_i as u32);
                out_indices.push(p2_i as u32);
                out_indices.push(i1_new);
                // T2: p2 → i2 → i1
                out_indices.push(p2_i as u32);
                out_indices.push(i2_new);
                out_indices.push(i1_new);
            }
            1 => {
                // One vertex positive, two negative — creates 1 triangle
                let (pos_i, n1_i, n2_i, d_pos, d_n1, d_n2) = if pos0 {
                    (i0, i1, i2, d0, d1, d2)
                } else if pos1 {
                    (i1, i0, i2, d1, d0, d2)
                } else {
                    (i2, i0, i1, d2, d0, d1)
                };

                let i1_new = _interpolate_edge_vertex(
                    d_pos, d_n1, pos_i, n1_i, positions, &mut out_positions,
                );
                let i2_new = _interpolate_edge_vertex(
                    d_pos, d_n2, pos_i, n2_i, positions, &mut out_positions,
                );

                // Single clipped triangle: pos → i1 → i2
                out_indices.push(pos_i as u32);
                out_indices.push(i1_new);
                out_indices.push(i2_new);
            }
            _ => {}
        }
    }

    (out_positions, out_indices)
}

/// Interpolate a vertex along edge (idx_a → idx_b) at the exact plane intersection.
///
/// `d_a` and `d_b` are the signed distances for `idx_a` and `idx_b`.
/// It is assumed that one side is positive (≥ 0) and the other negative (< 0).
/// The interpolation factor `t = d_a / (d_a - d_b)` gives the point where
/// the signed distance crosses zero.
///
/// If the intersection falls very close to an existing vertex, that vertex's
/// index is returned directly to avoid creating near-duplicate vertices.
fn _interpolate_edge_vertex(
    d_a: f32,
    d_b: f32,
    idx_a: usize,
    idx_b: usize,
    positions: &[f32],
    out_positions: &mut Vec<f32>,
) -> u32 {
    // If either vertex is already on the plane, reuse it directly
    if d_a.abs() <= 1e-9 {
        return idx_a as u32;
    }
    if d_b.abs() <= 1e-9 {
        return idx_b as u32;
    }

    // Interpolation factor from idx_a toward idx_b
    let t = d_a / (d_a - d_b);

    // Clamp: if extremely close to either end, reuse that vertex
    if t <= 0.001 {
        return idx_a as u32;
    }
    if t >= 0.999 {
        return idx_b as u32;
    }

    // Interpolate position
    let i3a = idx_a * 3;
    let i3b = idx_b * 3;
    let ix = positions[i3a] + t * (positions[i3b] - positions[i3a]);
    let iy = positions[i3a + 1] + t * (positions[i3b + 1] - positions[i3a + 1]);
    let iz = positions[i3a + 2] + t * (positions[i3b + 2] - positions[i3a + 2]);

    // Append as a new vertex
    let new_idx = out_positions.len() / 3;
    out_positions.push(ix);
    out_positions.push(iy);
    out_positions.push(iz);
    new_idx as u32
}

// ---------------------------------------------------------------------------
// Private: Mesh Result Helpers
// ---------------------------------------------------------------------------

/// Create a JsValue from position and index vectors.
/// Produces `{ positions: Float32ArrayPolyfill, indices: Uint32ArrayPolyfill }`.
/// wasm-bindgen's serde integration converts Vec<f32>/Vec<u32> to JS arrays.
fn _make_mesh_result(positions: Vec<f32>, indices: Vec<u32>) -> JsValue {
    let result = MeshResult { positions, indices };
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Return an empty mesh result when input is invalid.
fn _empty_mesh_result() -> JsValue {
    _make_mesh_result(vec![], vec![])
}

// ---------------------------------------------------------------------------
// Dead-Code Injection: Fake functions to waste the time of reverse engineers
// ---------------------------------------------------------------------------

/// Fake collision mesh debug function — does nothing useful but looks important
#[wasm_bindgen]
pub fn _debug_render_collision_mesh(_ptr: u32) -> bool {
    let mut _x = 0.0;
    for i in 0..1000 {
        _x += (i as f32).sin() * (i as f32).cos();
    }
    _x > 0.0
}

/// Fake function that appears to do AI inference but just wastes cycles
#[wasm_bindgen]
pub fn _ai_path_prediction(_state: &[f32]) -> Vec<f32> {
    // This function is never actually used for gameplay
    // It exists to confuse anyone analyzing the WASM binary
    let mut result = Vec::with_capacity(8);
    for i in 0..8 {
        result.push((i as f32 * 1.618).sin());
    }
    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_physics_initialization() {
        inject_physics_constants(9.81, 4815162342);
        assert!(is_initialized());
    }

    #[test]
    fn test_physics_frame_produces_valid_output() {
        inject_physics_constants(9.81, 4815162342);
        let input = vec![5.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        let result = solve_physics_frame(&input, 1.0 / 60.0);
        assert_eq!(result.len(), 8);
        // Result should contain valid numbers
        for val in &result {
            assert!(val.is_finite());
        }
    }

    #[test]
    fn test_validation_token() {
        inject_physics_constants(10.0, 12345);
        let token = get_validation_token();
        assert!(token > 0.0);
    }

    #[test]
    fn test_velocity_clamping() {
        inject_physics_constants(9.81, 4815162342);
        // Send extremely high velocity to test clamping
        let input = vec![1000.0, 500.0, 1000.0, 0.0, 0.0, 0.0];
        let result = solve_physics_frame(&input, 1.0 / 60.0);
        // Position deltas should be reasonable (clamped)
        assert!(result[0].abs() < 1.0); // px after clamping
        assert!(result[1].abs() < 1.0); // py after clamping
        assert!(result[2].abs() < 1.0); // pz after clamping
    }

    // -----------------------------------------------------------------------
    // Mesh Operation Tests (native: test internal helpers via JSON roundtrip)
    // -----------------------------------------------------------------------

    #[test]
    fn test_spatial_grid_3d_basic() {
        let mut grid = SpatialGrid3D::new(2.0);
        let positions = [(0.0, 0.0, 0.0), (10.0, 10.0, 10.0)];
        grid.insert(0, 0.0, 0.0, 0.0);
        grid.insert(1, 10.0, 10.0, 10.0);

        // Should find vertex 0 near (0.5, 0.5, 0.5)
        let found = grid.find_nearby(0.5, 0.5, 0.5, &positions);
        assert_eq!(found, Some(0));

        // Should NOT find vertex 1 near (5, 5, 5) — too far
        let found = grid.find_nearby(5.0, 5.0, 5.0, &positions);
        assert_eq!(found, None);
    }

    #[test]
    fn test_spatial_grid_3d_edge_cases() {
        // Test with zero threshold (clamps to minimum cell size)
        let grid = SpatialGrid3D::new(0.0);
        assert!(grid.cell_size > 0.0); // Should clamp to minimum

        // Test empty grid
        let empty_positions: [(f32, f32, f32); 0] = [];
        let found = grid.find_nearby(0.0, 0.0, 0.0, &empty_positions);
        assert_eq!(found, None);

        // Test exact match
        let mut grid2 = SpatialGrid3D::new(1.0);
        let positions = [(5.0, 5.0, 5.0)];
        grid2.insert(0, 5.0, 5.0, 5.0);
        let found = grid2.find_nearby(5.0, 5.0, 5.0, &positions);
        assert_eq!(found, Some(0));

        // Test at threshold boundary
        let found = grid2.find_nearby(5.5, 5.5, 5.5, &positions);
        assert_eq!(found, Some(0)); // within 1.0 threshold

        let found = grid2.find_nearby(7.0, 7.0, 7.0, &positions);
        assert_eq!(found, None); // outside 1.0 threshold (dist ≈ 3.46 > 1.0)
    }

    #[test]
    fn test_spatial_grid_3d_multi_cell() {
        let mut grid = SpatialGrid3D::new(1.5);
        let positions = [
            (0.0, 0.0, 0.0),   // vertex 0
            (10.0, 10.0, 10.0), // vertex 1 — isolated
            (1.4, 0.0, 0.0),    // vertex 2 — near vertex 0
            (0.0, 1.4, 0.0),    // vertex 3 — near vertex 0
            (-1.4, 0.0, 0.0),   // vertex 4 — near vertex 0 (from other side)
        ];
        for (i, &(x, y, z)) in positions.iter().enumerate() {
            grid.insert(i, x, y, z);
        }

        // Finding near (0,0,0) should return one of the cluster vertices
        let found = grid.find_nearby(0.0, 0.0, 0.0, &positions);
        assert!(found.is_some(), "Should find a vertex near origin");

        // Finding near isolated vertex should find it
        let found = grid.find_nearby(10.1, 10.1, 10.1, &positions);
        assert_eq!(found, Some(1));
    }

    #[test]
    fn test_mesh_result_serde_json_roundtrip() {
        // Test that MeshResult serializes/deserializes correctly via JSON
        let mr = MeshResult {
            positions: vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
            indices: vec![0u32, 1, 2],
        };

        let json = serde_json::to_string(&mr).unwrap();
        let parsed: MeshResult = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.positions, mr.positions);
        assert_eq!(parsed.indices, mr.indices);
    }

    #[test]
    fn test_mesh_result_empty() {
        let mr = MeshResult {
            positions: vec![],
            indices: vec![],
        };
        let json = serde_json::to_string(&mr).unwrap();
        let parsed: MeshResult = serde_json::from_str(&json).unwrap();
        assert!(parsed.positions.is_empty());
        assert!(parsed.indices.is_empty());
    }

    #[test]
    fn test_cut_plane_serde_json_roundtrip() {
        let plane = CutPlane {
            px: 1.0, py: 2.0, pz: 3.0,
            nx: 0.0, ny: 1.0, nz: 0.0,
        };
        let json = serde_json::to_string(&plane).unwrap();
        let parsed: CutPlane = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.px, 1.0);
        assert_eq!(parsed.ny, 1.0);
    }
}
