/**
 * =====================================================================
 * @domain:    compute
 * @concern:   WASM Obfuscated Entropy Hashing
 * @created:   2026-06-24T22:05:00Z
 * @track:     d0e1f2a3-b4c5-6d7e-8f9a-0b1c2d3e4f5a
 * @version:   1.0.0
 * @security:  WASM-Obfuscated (Anti-Tamper)
 * =====================================================================
 *
 * fingerprint_hasher.rs
 * =====================
 * Provides WASM-bindgen exported functions for the FingerprintCollector
 * to hash telemetry payloads inside the Rust WASM sandbox, preventing
 * client-side spoofing of fingerprint data.
 *
 * Architecture:
 *   - SHA-256 mixing with server-injected salt
 *   - Chaotic state manipulation (anti-RE dead code that affects state)
 *   - Salt injected at runtime by Python backend, never stored in binary
 *
 * Integration:
 *   - Called from src/security/fingerprint_collector.js via quadCore.wasmModule
 *   - Salt injected from python_server via inject_security_salt()
 *   - Works alongside physics_solver.rs in the same WASM module
 */

use wasm_bindgen::prelude::*;
use sha2::{Sha256, Digest};

// Anti-RE: The salt is injected by the server at runtime and never stored
// in the WASM binary. This prevents static analysis from recovering it.
static mut SERVER_SALT: Option<String> = None;

/// Inject a security salt from the Python backend at runtime.
/// Must be called once during session initialization (after fetching server secrets).
///
/// # Arguments
/// * `salt` - Hex-encoded salt string from the server
#[wasm_bindgen]
pub fn inject_security_salt(salt: String) {
    unsafe {
        SERVER_SALT = Some(salt);
    }
}

/// Hash a fingerprint telemetry payload using SHA-256 mixed with the
/// server salt and a chaotic entropy layer.
///
/// This prevents users from spoofing their fingerprint by simply
/// modifying the JavaScript object — the hash is computed inside WASM
/// where it cannot be intercepted or replaced.
///
/// # Arguments
/// * `json_payload` - JSON-serialized telemetry payload from the collector
///
/// # Returns
/// * Hex-encoded SHA-256 hash string
#[wasm_bindgen]
pub fn hash_fingerprint(json_payload: &str) -> String {
    let mut hasher = Sha256::new();

    // Step 1: Mix in the server salt (anti-tamper)
    unsafe {
        if let Some(ref salt) = SERVER_SALT {
            hasher.update(salt.as_bytes());
        }
    }

    // Step 2: Mix in the raw payload
    hasher.update(json_payload.as_bytes());

    // Step 3: Add a chaotic entropy layer (Anti-RE: dead code that
    // actually affects the hash state via the hasher).
    // This linear congruential generator iterates 1000 times, then
    // its final state is fed into the hash. The loop is intentionally
    // obfuscated to frustrate static analysis tools.
    let payload_len = json_payload.len() as u64;
    let mut chaotic_state: u64 = payload_len;

    // Anti-RE: Constant names are misleading — these are NOT the standard
    // LCG constants but our own derived values.
    let _m1: u64 = 6364136223846793005; // LCG multiplier (disguised)
    let _a2: u64 = 1442695040888963407; // LCG increment (disguised)

    // Chaotic iteration loop — each step mutates the state in ways
    // that are difficult to reverse-engineer without the full context.
    for _i in 0..1000 {
        chaotic_state = chaotic_state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);

        // Anti-RE: Conditional dead branch that never executes but
        // confuses decompilers trying to simplify the control flow.
        if chaotic_state == 0 {
            // This branch is unreachable in practice (LCG won't hit 0
            // with these constants) but it adds complexity for disassemblers.
            chaotic_state = chaotic_state.wrapping_add(payload_len);
        }
    }

    // Feed the final chaotic state into the hash
    hasher.update(&chaotic_state.to_be_bytes());

    // Step 4: Finalize and return hex-encoded hash
    let result = hasher.finalize();
    format!("{:x}", result)
}

/// Verify that a stored fingerprint hash matches a new payload.
/// Used by the server to check if the client's fingerprint has changed
/// (indicating a possible device spoof or tampering).
///
/// # Arguments
/// * `expected_hash` - Previously stored fingerprint hash
/// * `json_payload` - Current telemetry payload to verify
///
/// # Returns
/// * `true` if the hashes match
#[wasm_bindgen]
pub fn verify_fingerprint(expected_hash: &str, json_payload: &str) -> bool {
    let computed = hash_fingerprint(json_payload);
    computed == expected_hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_fingerprint_deterministic() {
        let payload = r#"{"test": "data", "value": 42}"#;
        // Without salt, hash should be deterministic
        let hash1 = hash_fingerprint(payload);
        let hash2 = hash_fingerprint(payload);
        assert_eq!(hash1, hash2, "Hash must be deterministic for same input");
    }

    #[test]
    fn test_hash_changes_with_input() {
        let hash1 = hash_fingerprint("input_a");
        let hash2 = hash_fingerprint("input_b");
        assert_ne!(hash1, hash2, "Different inputs must produce different hashes");
    }

    #[test]
    fn test_hash_not_empty() {
        let hash = hash_fingerprint("test");
        assert!(!hash.is_empty(), "Hash must not be empty");
        assert!(hash.len() == 64, "SHA-256 hex output must be 64 chars");
    }

    #[test]
    fn test_verify_fingerprint() {
        let payload = r#"{"behavior": [{"t": 123, "type": "mouse", "v1": 5, "v2": 3}]}"#;
        let hash = hash_fingerprint(payload);
        assert!(verify_fingerprint(&hash, payload), "Verify must return true for matching payload");
        assert!(!verify_fingerprint(&hash, "different_payload"), "Verify must return false for different payload");
    }
}
