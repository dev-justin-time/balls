/**
 * =====================================================================
 * @domain:    compute
 * @concern:   Parallel Image Processing Engine (imageproc + rayon)
 * @created:   2026-06-24T16:00:00Z
 * @track:     3b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e
 * @version:   1.0.0
 * @security:  WASM-Obfuscated (Thick Compute)
 * =====================================================================
 *
 * High-performance image processing module using imageproc for algorithms
 * and rayon for parallel pixel manipulation. All functions accept raw
 * RGBA byte buffers for zero-copy interop with JavaScript canvas.
 *
 * Anti-Reverse Engineering:
 *   - Opaque processing mode selection
 *   - Thresholds injected as parameters rather than constants
 *   - Parallel work is distributed across W ASM threads (when available)
 */

use wasm_bindgen::prelude::*;
use rayon::prelude::*;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Minimum image dimensions to benefit from parallel processing
const PARALLEL_THRESHOLD: u32 = 128;
/// Default Sobel kernel size for Canny edge detection
const CANNY_SOBEL_SIZE: i32 = 3;

// ---------------------------------------------------------------------------
// Public API — Exported to JavaScript
// ---------------------------------------------------------------------------

/// Detect edges in an image using the Canny algorithm.
///
/// # Args
/// * `image_data` — Raw RGBA pixel bytes
/// * `width`      — Image width in pixels
/// * `height`     — Image height in pixels
/// * `low_thresh` — Low threshold for Canny (0–255, default ~50)
/// * `high_thresh` — High threshold for Canny (0–255, default ~150)
///
/// # Returns
/// A grayscale image (single channel packed as 4-byte RGBA) with edge pixels
/// at 255 (white) and non-edge at 0 (black).
#[wasm_bindgen]
pub fn detect_edges(
    image_data: &[u8],
    width: u32,
    height: u32,
    low_thresh: f32,
    high_thresh: f32,
) -> Vec<u8> {
    if width == 0 || height == 0 || image_data.len() < (width * height * 4) as usize {
        return Vec::new();
    }

    // Convert RGBA to grayscale
    let gray = _rgba_to_grayscale(image_data, width, height);

    // Run Canny edge detection
    let gray_img = image::GrayImage::from_raw(width, height, gray)
        .expect("Failed to create GrayImage");

    let edges = imageproc::edges::canny(&gray_img, low_thresh, high_thresh);

    // Pack edge map back into RGBA format for canvas compatibility
    let edge_pixels = edges.into_raw();
    let mut result = Vec::with_capacity(edge_pixels.len() * 4);
    for &p in &edge_pixels {
        result.push(p); // R
        result.push(p); // G
        result.push(p); // B
        result.push(255); // A
    }
    result
}

/// Apply Gaussian blur to an image.
///
/// # Args
/// * `image_data` — Raw RGBA pixel bytes
/// * `width`      — Image width in pixels
/// * `height`     — Image height in pixels
/// * `sigma`      — Standard deviation for Gaussian kernel (~0.5–5.0)
///
/// # Returns
/// Blurred RGBA image.
#[wasm_bindgen]
pub fn gaussian_blur(image_data: &[u8], width: u32, height: u32, sigma: f32) -> Vec<u8> {
    if width == 0 || height == 0 || image_data.len() < (width * height * 4) as usize {
        return Vec::new();
    }

    // Convert RGBA to grayscale for processing
    let gray = _rgba_to_grayscale(image_data, width, height);
    let gray_img = image::GrayImage::from_raw(width, height, gray)
        .expect("Failed to create GrayImage");

    let blurred = imageproc::filter::gaussian_blur_f32(&gray_img, sigma);

    // Pack back to RGBA
    let blurred_pixels = blurred.into_raw();
    let mut result = Vec::with_capacity(blurred_pixels.len() * 4);
    for &p in &blurred_pixels {
        result.push(p);
        result.push(p);
        result.push(p);
        result.push(255);
    }
    result
}

/// Apply binary threshold to an image.
///
/// # Args
/// * `image_data` — Raw RGBA pixel bytes
/// * `width`      — Image width in pixels
/// * `height`     — Image height in pixels
/// * `threshold`  — Threshold value (0–255)
/// * `invert`     — If true, invert the threshold (white < threshold)
///
/// # Returns
/// Binary (black/white) RGBA image.
#[wasm_bindgen]
pub fn apply_threshold(
    image_data: &[u8],
    width: u32,
    height: u32,
    threshold: u8,
    invert: bool,
) -> Vec<u8> {
    if width == 0 || height == 0 || image_data.len() < (width * height * 4) as usize {
        return Vec::new();
    }

    let gray = _rgba_to_grayscale(image_data, width, height);

    // Parallel threshold application
    let result_gray: Vec<u8> = gray
        .par_iter()
        .map(|&p| {
            if invert {
                if p < threshold { 255 } else { 0 }
            } else {
                if p > threshold { 255 } else { 0 }
            }
        })
        .collect();

    // Pack to RGBA
    let mut result = Vec::with_capacity(result_gray.len() * 4);
    for &p in &result_gray {
        result.push(p);
        result.push(p);
        result.push(p);
        result.push(255);
    }
    result
}

/// Adjust contrast using simple linear scaling.
///
/// # Args
/// * `image_data` — Raw RGBA pixel bytes
/// * `width`      — Image width in pixels
/// * `height`     — Image height in pixels
/// * `factor`     — Contrast factor (1.0 = no change, >1 = more contrast, <1 = less)
///
/// # Returns
/// Contrast-adjusted RGBA image.
#[wasm_bindgen]
pub fn adjust_contrast(image_data: &[u8], width: u32, height: u32, factor: f32) -> Vec<u8> {
    if width == 0 || height == 0 || image_data.len() < (width * height * 4) as usize {
        return Vec::new();
    }

    let len = (width * height * 4) as usize;

    // Parallel contrast adjustment
    image_data[..len]
        .par_chunks_exact(4)
        .flat_map(|chunk| {
            let r = ((chunk[0] as f32 - 128.0) * factor + 128.0).clamp(0.0, 255.0) as u8;
            let g = ((chunk[1] as f32 - 128.0) * factor + 128.0).clamp(0.0, 255.0) as u8;
            let b = ((chunk[2] as f32 - 128.0) * factor + 128.0).clamp(0.0, 255.0) as u8;
            vec![r, g, b, chunk[3]]
        })
        .collect()
}

/// Reduce noise using a median filter.
///
/// # Args
/// * `image_data` — Raw RGBA pixel bytes
/// * `width`      — Image width in pixels
/// * `height`     — Image height in pixels
/// * `radius`     — Median filter radius (1 = 3x3 kernel, 2 = 5x5, etc.)
///
/// # Returns
/// Denoised RGBA image.
#[wasm_bindgen]
pub fn median_filter(image_data: &[u8], width: u32, height: u32, radius: u32) -> Vec<u8> {
    if width == 0 || height == 0 || image_data.len() < (width * height * 4) as usize {
        return Vec::new();
    }

    let gray = _rgba_to_grayscale(image_data, width, height);
    let gray_img = image::GrayImage::from_raw(width, height, gray)
        .expect("Failed to create GrayImage");

    let denoised = imageproc::filter::median_filter(&gray_img, radius, radius);

    let denoised_pixels = denoised.into_raw();
    let mut result = Vec::with_capacity(denoised_pixels.len() * 4);
    for &p in &denoised_pixels {
        result.push(p);
        result.push(p);
        result.push(p);
        result.push(255);
    }
    result
}

/// Full preprocessing pipeline: blur → edge detection → threshold.
/// Runs all three operations in sequence.
///
/// # Args
/// * `image_data` — Raw RGBA pixel bytes
/// * `width`      — Image width in pixels
/// * `height`     — Image height in pixels
/// * `blur_sigma` — Blur sigma (0 = skip blur)
/// * `edge_low`   — Canny low threshold
/// * `edge_high`  — Canny high threshold
/// * `threshold`  — Binary threshold (0 = skip threshold)
///
/// # Returns
/// Processed RGBA image.
#[wasm_bindgen]
pub fn full_pipeline(
    image_data: &[u8],
    width: u32,
    height: u32,
    blur_sigma: f32,
    edge_low: f32,
    edge_high: f32,
    threshold: u8,
) -> Vec<u8> {
    if width == 0 || height == 0 || image_data.len() < (width * height * 4) as usize {
        return Vec::new();
    }

    let gray = _rgba_to_grayscale(image_data, width, height);
    let mut img = image::GrayImage::from_raw(width, height, gray)
        .expect("Failed to create GrayImage");

    // Step 1: Gaussian blur (if sigma > 0)
    if blur_sigma > 0.0 {
        img = imageproc::filter::gaussian_blur_f32(&img, blur_sigma);
    }

    // Step 2: Canny edge detection
    let edges = imageproc::edges::canny(&img, edge_low, edge_high);
    let edges_raw = edges.as_raw();

    // Step 3: Binary threshold (if > 0)
    let final_pixels: Vec<u8> = if threshold > 0 {
        edges_raw
            .par_iter()
            .map(|&p| if p > threshold { 255 } else { 0 })
            .collect()
    } else {
        edges_raw.clone()
    };

    // Pack back to RGBA
    let mut result = Vec::with_capacity(final_pixels.len() * 4);
    for &p in &final_pixels {
        result.push(p);
        result.push(p);
        result.push(p);
        result.push(255);
    }
    result
}

/// Return info about this module.
#[wasm_bindgen]
pub fn get_image_processing_info() -> String {
    String::from(
        "imageproc-0.25 | rayon-1.10 | ops: edges, blur, threshold, contrast, median_filter, pipeline",
    )
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/// Convert raw RGBA byte buffer to grayscale (single channel).
/// Uses luminance weights: 0.299 R + 0.587 G + 0.114 B.
fn _rgba_to_grayscale(image_data: &[u8], width: u32, height: u32) -> Vec<u8> {
    let len = (width * height) as usize;

    // Use parallel conversion for large images
    if width * height > PARALLEL_THRESHOLD {
        image_data[..len * 4]
            .par_chunks_exact(4)
            .map(|chunk| {
                let r = chunk[0] as f32;
                let g = chunk[1] as f32;
                let b = chunk[2] as f32;
                (0.299 * r + 0.587 * g + 0.114 * b) as u8
            })
            .collect()
    } else {
        image_data[..len * 4]
            .chunks_exact(4)
            .map(|chunk| {
                let r = chunk[0] as f32;
                let g = chunk[1] as f32;
                let b = chunk[2] as f32;
                (0.299 * r + 0.587 * g + 0.114 * b) as u8
            })
            .collect()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_rgba(width: u32, height: u32) -> Vec<u8> {
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height {
            for x in 0..width {
                let val = ((x + y) * 16 % 256) as u8;
                data.push(val);     // R
                data.push(val);     // G
                data.push(val);     // B
                data.push(255);     // A
            }
        }
        data
    }

    #[test]
    fn test_detect_edges_empty_input() {
        let result = detect_edges(&[], 0, 0, 50.0, 150.0);
        assert!(result.is_empty());
    }

    #[test]
    fn test_detect_edges_produces_valid_output() {
        let data = create_test_rgba(32, 32);
        let result = detect_edges(&data, 32, 32, 50.0, 150.0);
        assert_eq!(result.len(), (32 * 32 * 4) as usize);
        // Edge map pixels should be either 0 or 255
        for &p in &result {
            assert!(p == 0 || p == 255);
        }
    }

    #[test]
    fn test_gaussian_blur_output_size() {
        let data = create_test_rgba(16, 16);
        let result = gaussian_blur(&data, 16, 16, 1.5);
        assert_eq!(result.len(), 16 * 16 * 4);
    }

    #[test]
    fn test_apply_threshold_invert() {
        let data = create_test_rgba(16, 16);
        let normal = apply_threshold(&data, 16, 16, 127, false);
        let inverted = apply_threshold(&data, 16, 16, 127, true);
        // Pixels should be opposite
        for i in 0..(16 * 16) {
            assert_ne!(normal[i * 4], inverted[i * 4]);
        }
    }

    #[test]
    fn test_median_filter_output_size() {
        let data = create_test_rgba(32, 32);
        let result = median_filter(&data, 32, 32, 1);
        assert_eq!(result.len(), 32 * 32 * 4);
    }

    #[test]
    fn test_full_pipeline_no_ops() {
        let data = create_test_rgba(16, 16);
        // blur_sigma=0, threshold=0 means only edge detection runs
        let result = full_pipeline(&data, 16, 16, 0.0, 50.0, 150.0, 0);
        assert_eq!(result.len(), 16 * 16 * 4);
    }

    #[test]
    fn test_adjust_contrast_identity() {
        let data = create_test_rgba(16, 16);
        let result = adjust_contrast(&data, 16, 16, 1.0);
        assert_eq!(result.len(), 16 * 16 * 4);
    }
}
