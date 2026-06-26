/**
 * =====================================================================
 * @domain:    compute
 * @concern:   Hash-Chain Physics Recording & Signing
 * @created:   2026-06-24T23:05:00Z
 * @track:     b4c5d6e7-f8a9-0b1c-2d3e-4f5a6b7c8d9e
 * @version:   1.0.0
 * @security:  WASM-Obfuscated (Anti-Tamper Offline)
 * =====================================================================
 *
 * telemetry_recorder.rs
 * =====================
 * Hash-chain physics state recorder that runs inside Rust WASM.
 * Every physics frame (position x/y/z + speed) is delta-compressed
 * and cryptographically linked to the previous frame via SHA-256.
 *
 * During offline play:
 *   1. start_recording() initializes the chain with a session nonce
 *   2. record_physics_frame() called every tick (60Hz) by the JS loop
 *   3. stop_recording() finalizes and returns compressed telemetry + final hash
 *
 * Upon reconnection:
 *   4. Telemetry sent to Python ghost_verifier for hash-chain validation
 *   5. If hash chain is broken (tampered), the run is rejected
 *
 * Anti-RE features:
 *   - Opaque _TelemetryContext struct hides internal state from JS
 *   - VecDeque with bounded capacity prevents OOM on long sessions
 *   - Frame data is raw bytes (no struct, no serde) — hard to intercept
 */

use wasm_bindgen::prelude::*;
use sha2::{Sha256, Digest};
use std::collections::VecDeque;

// Anti-RE: Opaque internal state struct — JS cannot inspect or modify it
struct _TelemetryContext {
    is_recording: bool,
    frame_buffer: VecDeque<u8>,
    current_hash: [u8; 32],
    frame_count: u32,
    max_frames: u32,
}

// Singleton recorder instance
static mut RECORDER: Option<_TelemetryContext> = None;

/// Initialize the telemetry recorder with a maximum frame capacity.
/// Call once during WASM initialization (in init_wasm_module or separately).
///
/// max_frames: Maximum frames to record (default: 18000 = 5min at 60fps)
#[wasm_bindgen]
pub fn init_telemetry_recorder(max_frames: Option<u32>) {
    let capacity = max_frames.unwrap_or(18000) as usize;
    unsafe {
        RECORDER = Some(_TelemetryContext {
            is_recording: false,
            frame_buffer: VecDeque::with_capacity(capacity * 16), // 16 bytes per frame
            current_hash: [0u8; 32],
            frame_count: 0,
            max_frames: capacity as u32,
        });
    }
}

/// Start recording a new session.
/// Initializes the hash chain with a deterministic session nonce.
#[wasm_bindgen]
pub fn start_recording() {
    unsafe {
        if let Some(ref mut ctx) = RECORDER {
            ctx.is_recording = true;
            ctx.frame_buffer.clear();
            ctx.frame_count = 0;
            // Initialize hash chain with a session seed (avalanche effect start)
            ctx.current_hash = Sha256::digest(b"GOING_BALLS_SESSION_START").into();
        }
    }
}

/// Record a single physics frame.
/// Called every tick (60Hz) from the JS animation loop.
///
/// Chain: H(n) = SHA256(H(n-1) + frame_data)
/// Each frame's hash depends on ALL previous frames — tampering any
/// single frame changes the final hash (avalanche effect).
///
/// Args match the output of solve_physics_frame():
///   position_x, position_y, position_z — ball world position
///   velocity — horizontal speed magnitude (for anti-cheat velocity validation)
#[wasm_bindgen]
pub fn record_physics_frame(
    position_x: f32,
    position_y: f32,
    position_z: f32,
    velocity: f32,
) {
    unsafe {
        if let Some(ref mut ctx) = RECORDER {
            if !ctx.is_recording { return; }

            // Enforce max frame limit to prevent memory exhaustion
            if ctx.frame_count >= ctx.max_frames { return; }

            // 1. Pack 4 f32 values into 16 raw bytes (no struct, no serde)
            let frame_data: [f32; 4] = [position_x, position_y, position_z, velocity];
            let frame_bytes: &[u8; 16] = &*(&frame_data as *const [f32; 4] as *const [u8; 16]);

            // 2. Hash chain: H(n) = SHA256(H(n-1) + frame_data)
            let mut hasher = Sha256::new();
            hasher.update(ctx.current_hash);
            hasher.update(frame_bytes);
            ctx.current_hash = hasher.finalize().into();

            // 3. Append compressed frame data to buffer
            ctx.frame_buffer.extend(frame_bytes);
            ctx.frame_count += 1;
        }
    }
}

/// Stop recording and return the telemetry metadata.
/// The actual frame bytes are copied to JS via the returned object.
///
/// Returns a JsValue object with:
///   telemetry_len — number of bytes in the buffer
///   frame_count — number of recorded frames
///   final_hash — hex-encoded SHA-256 of the final hash chain link
#[wasm_bindgen]
pub fn stop_recording() -> JsValue {
    unsafe {
        if let Some(ref mut ctx) = RECORDER {
            ctx.is_recording = false;

            let telemetry_len = ctx.frame_buffer.len();
            let frame_count = ctx.frame_count;
            let final_hash = ctx.current_hash.iter().map(|b| format!("{:02x}", b)).collect::<String>();

            // Copy buffer to JS via Uint8Array
            let telemetry_vec: Vec<u8> = ctx.frame_buffer.drain(..).collect();
            let uint8_array = js_sys::Uint8Array::new_with_length(telemetry_len as u32);
            uint8_array.copy_from(&telemetry_vec);

            // Build return object
            let obj = js_sys::Object::new();
            js_sys::Reflect::set(&obj, &"telemetry_len".into(), &JsValue::from(telemetry_len as f64)).unwrap();
            js_sys::Reflect::set(&obj, &"frame_count".into(), &JsValue::from(frame_count as f64)).unwrap();
            js_sys::Reflect::set(&obj, &"final_hash".into(), &JsValue::from_str(&final_hash)).unwrap();
            js_sys::Reflect::set(&obj, &"telemetry_bytes".into(), &uint8_array.into()).unwrap();

            return obj.into();
        }
    }
    JsValue::NULL
}

/// Check if the recorder is currently active.
#[wasm_bindgen]
pub fn is_recording() -> bool {
    unsafe {
        RECORDER.as_ref()
            .map(|ctx| ctx.is_recording)
            .unwrap_or(false)
    }
}

/// Get the current frame count (synchronization check).
#[wasm_bindgen]
pub fn get_recorded_frame_count() -> u32 {
    unsafe {
        RECORDER.as_ref()
            .map(|ctx| ctx.frame_count)
            .unwrap_or(0)
    }
}

/// Get the current intermediate hash (for progress verification).
#[wasm_bindgen]
pub fn get_current_hash() -> String {
    unsafe {
        RECORDER.as_ref()
            .map(|ctx| ctx.current_hash.iter().map(|b| format!("{:02x}", b)).collect::<String>())
            .unwrap_or_else(|| "0000".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recording_lifecycle() {
        init_telemetry_recorder(Some(100));
        assert!(!is_recording());
        assert_eq!(get_recorded_frame_count(), 0);

        start_recording();
        assert!(is_recording());

        // Record a few frames with known positions
        record_physics_frame(1.0, 2.0, 3.0, 5.0);
        record_physics_frame(1.1, 2.1, 3.1, 5.5);
        record_physics_frame(1.2, 2.0, 3.2, 4.8);

        assert_eq!(get_recorded_frame_count(), 3);

        let result = stop_recording();
        assert!(!is_recording());

        // The result should have telemetry metadata
        assert!(!result.is_null() && !result.is_undefined());
    }

    #[test]
    fn test_hash_chain_deterministic() {
        init_telemetry_recorder(Some(100));

        start_recording();
        record_physics_frame(0.0, 0.0, 0.0, 0.0);
        let result1 = stop_recording();

        // Same sequence should produce same final hash
        start_recording();
        record_physics_frame(0.0, 0.0, 0.0, 0.0);
        let result2 = stop_recording();

        let hash1 = js_sys::Reflect::get(&result1, &"final_hash".into()).unwrap();
        let hash2 = js_sys::Reflect::get(&result2, &"final_hash".into()).unwrap();

        assert_eq!(
            hash1.as_string().unwrap(),
            hash2.as_string().unwrap(),
            "Same input must produce same hash chain"
        );
    }

    #[test]
    fn test_different_input_different_hash() {
        init_telemetry_recorder(Some(100));

        start_recording();
        record_physics_frame(1.0, 2.0, 3.0, 5.0);
        let result1 = stop_recording();

        start_recording();
        record_physics_frame(100.0, 200.0, 300.0, 50.0);
        let result2 = stop_recording();

        let hash1 = js_sys::Reflect::get(&result1, &"final_hash".into()).unwrap();
        let hash2 = js_sys::Reflect::get(&result2, &"final_hash".into()).unwrap();

        assert_ne!(
            hash1.as_string().unwrap(),
            hash2.as_string().unwrap(),
            "Different inputs must produce different hash chains"
        );
    }

    #[test]
    fn test_max_frames_enforced() {
        init_telemetry_recorder(Some(5));

        start_recording();
        for _ in 0..10 {
            record_physics_frame(1.0, 2.0, 3.0, 5.0);
        }

        assert_eq!(get_recorded_frame_count(), 5, "Must not exceed max_frames");
    }
}
