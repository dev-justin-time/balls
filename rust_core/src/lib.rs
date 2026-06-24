/**
 * =====================================================================
 * @domain:    compute
 * @concern:   Rust WASM Library — Physics + Vectorizer + Image Processing + Topology
 * @created:   2026-06-24T16:00:00Z
 * @track:     8b9c0d1e-2f3a-4b5c-6d7e-8f9a0b1c2d3e
 * @version:   1.0.0
 * @security:  WASM-Obfuscated (Thick Compute)
 * =====================================================================
 *
 * Quad-Core Rust WASM Library
 *
 * This crate compiles to WebAssembly and exports four major compute domains:
 *   1. Physics simulation & anti-cheat validation (physics_solver)
 *   2. Raster image vectorization via vtracer (vectorizer)
 *   3. Parallel image processing via imageproc + rayon (image_processing)
 *   4. Wireframe topology cleanup (topology)
 *
 * All functions are exposed via #[wasm_bindgen] and callable from JavaScript.
 *
 * Anti-Reverse Engineering:
 *   - Opaque pointer structures in physics solver
 *   - Mode-based indirection in vectorizer
 *   - All modules compiled with LTO + strip + opt-level z
 */

pub mod physics_solver;
pub mod vectorizer;
pub mod image_processing;
pub mod topology;

use wasm_bindgen::prelude::*;
use std::panic;

// ---------------------------------------------------------------------------
// Re-exports from physics_solver
// ---------------------------------------------------------------------------
pub use physics_solver::{
    inject_physics_constants,
    is_initialized,
    solve_physics_frame,
    get_validation_token,
    reset_collision_state,
    _debug_render_collision_mesh,
    _ai_path_prediction,
};

// ---------------------------------------------------------------------------
// Re-exports from vectorizer
// ---------------------------------------------------------------------------
pub use vectorizer::{
    convert_to_svg,
    convert_grayscale_to_svg,
    batch_convert_to_svg,
    get_vectorizer_info,
};

// ---------------------------------------------------------------------------
// Re-exports from image_processing
// ---------------------------------------------------------------------------
pub use image_processing::{
    detect_edges,
    gaussian_blur,
    apply_threshold,
    adjust_contrast,
    median_filter,
    full_pipeline,
    get_image_processing_info,
};

// ---------------------------------------------------------------------------
// Re-exports from topology
// ---------------------------------------------------------------------------
pub use topology::{
    cleanup_topology,
    quick_clean,
    get_topology_info,
};

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/// Initialize the WASM module. Sets up console error panic hook for better
/// debugging and prepares the parallel thread pool (rayon).
#[wasm_bindgen(start)]
pub fn init_wasm_module() {
    panic::set_hook(Box::new(console_error_panic_hook::hook));
}

// ---------------------------------------------------------------------------
// Module Info
// ---------------------------------------------------------------------------

/// Get comprehensive module version info for debugging.
#[wasm_bindgen]
pub fn get_module_info() -> String {
    format!(
        "Quad-Core Rust WASM v{} | domains: physics · vectorizer(vtracer) · imageproc · topology",
        env!("CARGO_PKG_VERSION"),
    )
}
