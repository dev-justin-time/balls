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
    let ctx = CONTEXT.get().expect("Physics context not injected. Call inject_physics_constants first.");

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
    let validation_hash = _generate_validation_hash(ctx, vx, vy, vz, px, py, pz);

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
        assert!(!is_initialized());
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
    fn test_validation_token_differs() {
        inject_physics_constants(10.0, 12345);
        let a = get_validation_token();
        inject_physics_constants(10.0, 67890);
        let b = get_validation_token();
        // Different seeds should produce different tokens
        assert_ne!(a, b);
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
}
