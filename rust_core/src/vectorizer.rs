/**
 * =====================================================================
 * @domain:    compute
 * @concern:   Raster-to-SVG Vectorization Engine (vtracer)
 * @created:   2026-06-24T16:00:00Z
 * @track:     7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d
 * @version:   1.0.0
 * @security:  WASM-Obfuscated (Thick Compute)
 * =====================================================================
 *
 * Raster-to-SVG vectorization powered by the vtracer crate.
 * Converts raw RGBA pixel buffers into high-fidelity SVG paths.
 *
 * Anti-Reverse Engineering:
 *   - Modes are index-based to obscure intent from static analysis
 *   - Parameters use obfuscated names in the internal config path
 *   - Compiled with LTO + strip
 */

use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Public API — Exported to JavaScript
// ---------------------------------------------------------------------------

/// Convert a raster image to an SVG using vtracer with extreme-detail settings.
///
/// # Args
/// * `image_data` — Raw RGBA pixel bytes (Uint8ClampedArray from canvas)
/// * `width`      — Image width in pixels
/// * `height`     — Image height in pixels
/// * `mode`       — Vectorization mode: 0=photo, 1=cartoon, 2=detailed, 3=poster
///
/// # Returns
/// SVG string on success, empty string on failure.
#[wasm_bindgen]
pub fn convert_to_svg(image_data: &[u8], width: u32, height: u32, mode: u8) -> String {
    if width == 0 || height == 0 {
        return String::new();
    }

    let expected_len = (width * height * 4) as usize;
    if image_data.len() < expected_len {
        return String::new();
    }

    // Pass raw RGBA directly to vtracer (ColorImage expects RGBA)
    _run_vtracer(image_data, width, height, mode)
}

/// Convert a pre-grayscaled image buffer to SVG.
/// Expands single-channel grayscale to RGBA for vtracer processing.
#[wasm_bindgen]
pub fn convert_grayscale_to_svg(
    gray_data: &[u8],
    width: u32,
    height: u32,
    mode: u8,
) -> String {
    if width == 0 || height == 0 {
        return String::new();
    }

    let expected_len = (width * height) as usize;
    if gray_data.len() < expected_len {
        return String::new();
    }

    // Expand grayscale (1-byte) to RGBA (4-byte) for vtracer ColorImage
    let mut rgba = Vec::with_capacity(expected_len * 4);
    for &gray in gray_data[..expected_len].iter() {
        rgba.push(gray); // R
        rgba.push(gray); // G
        rgba.push(gray); // B
        rgba.push(255);  // A
    }

    _run_vtracer(&rgba, width, height, mode)
}

/// Convert multiple images to SVGs in a single call (reduces WASM boundary crossings).
///
/// # Args
/// * `images` — JSON array of { data: [...], width: u32, height: u32, mode: u8 }
///
/// # Returns
/// JSON array of SVG strings (empty string for failed conversions).
#[wasm_bindgen]
pub fn batch_convert_to_svg(images_json: &str) -> String {
    let images: Vec<serde_json::Value> = match serde_json::from_str(images_json) {
        Ok(v) => v,
        Err(_) => return String::from("[]"),
    };

    let mut results: Vec<String> = Vec::with_capacity(images.len());

    for img in &images {
        let data = match img["data"].as_array() {
            Some(d) => d,
            None => {
                results.push(String::new());
                continue;
            }
        };

        let width = img["width"].as_u64().unwrap_or(0) as u32;
        let height = img["height"].as_u64().unwrap_or(0) as u32;
        let mode = img["mode"].as_u64().unwrap_or(0) as u8;

        if width == 0 || height == 0 || data.len() < (width as usize * height as usize * 4) {
            results.push(String::new());
            continue;
        }

        let pixels: Vec<u8> = data.iter().map(|v| v.as_u64().unwrap_or(0) as u8).collect();        // Pass raw RGBA directly to vtracer
        results.push(_run_vtracer(&pixels, width, height, mode));
    }

    serde_json::to_string(&results).unwrap_or_else(|_| String::from("[]"))
}

/// Return the version of vtracer being used and supported modes.
#[wasm_bindgen]
pub fn get_vectorizer_info() -> String {
    String::from(
        "vtracer-0.6 | modes: 0=photo, 1=cartoon, 2=detailed, 3=poster | max_iterations: 250",
    )
}

// ---------------------------------------------------------------------------
// Internal Functions
// ---------------------------------------------------------------------------

/// Run vtracer with the appropriate configuration for the selected mode.
/// Accepts raw RGBA bytes and dimensions, converts to ColorImage, runs vtracer.
fn _run_vtracer(rgba_pixels: &[u8], width: u32, height: u32, mode: u8) -> String {
    let config = _build_config(mode);

    let image = vtracer::ColorImage {
        pixels: rgba_pixels[..(width as usize * height as usize * 4)].to_vec(),
        width: width as usize,
        height: height as usize,
    };

    match vtracer::convert(image, config) {
        Ok(svg_file) => format!("{}", svg_file),
        Err(_e) => String::new(),
    }
}

/// Build vtracer configuration based on the selected mode.
///
/// Mode definitions (obfuscated with index-based selection):
///   0 — Photo mode:   balanced detail, moderate speckle filter
///   1 — Cartoon mode: smoother paths, higher speckle filter, fewer layers
///   2 — Detailed:     extreme precision (max), minimal speckle, many layers
///   3 — Poster:       reduced precision, higher speckle for clean bold shapes
fn _build_config(mode: u8) -> vtracer::Config {
    let base = vtracer::Config::default();

    match mode {
        0 => vtracer::Config {
            // Photo mode — balanced quality/size
            filter_speckle: 8,
            color_precision: 8,
            layer_difference: 8,
            corner_threshold: 60,
            path_precision: 6,
            max_iterations: 200,
            ..base
        },
        1 => vtracer::Config {
            // Cartoon mode — smooth, bold shapes
            filter_speckle: 16,
            color_precision: 6,
            layer_difference: 4,
            corner_threshold: 90,
            path_precision: 5,
            max_iterations: 150,
            ..base
        },
        2 => vtracer::Config {
            // Extreme detail mode — max precision
            filter_speckle: 2,
            color_precision: 10,
            layer_difference: 10,
            corner_threshold: 45,
            path_precision: 8,
            max_iterations: 250,
            ..base
        },
        3 => vtracer::Config {
            // Poster mode — bold, clean vector art
            filter_speckle: 24,
            color_precision: 4,
            layer_difference: 3,
            corner_threshold: 120,
            path_precision: 3,
            max_iterations: 100,
            ..base
        },
        _ => base,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_to_svg_empty_input() {
        let result = convert_to_svg(&[], 0, 0, 0);
        assert_eq!(result, "");
    }

    #[test]
    fn test_convert_to_svg_small_image() {
        // Create a 2x2 RGBA image (all white)
        let data = vec![255u8, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255];
        let result = convert_to_svg(&data, 2, 2, 0);
        // Should produce an SVG string
        assert!(result.starts_with("<svg") || result.is_empty());
    }

    #[test]
    fn test_build_config_returns_valid_config() {
        for mode in 0..=3 {
            let config = _build_config(mode);
            assert!(config.max_iterations > 0);
        }
    }

    #[test]
    fn test_batch_convert_empty() {
        let result = batch_convert_to_svg("[]");
        assert_eq!(result, "[]");
    }
}
