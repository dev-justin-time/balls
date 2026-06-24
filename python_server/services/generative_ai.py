"""
=====================================================================
@domain:    ai
@concern:   Generative AI — Stable Diffusion + ControlNet Pipeline
@created:   2026-06-24T15:40:00Z
@track:     1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e
@version:   1.0.0
@security:  Server-Side (Thick Backend / GPU-Neural)
=====================================================================

Generative AI Service

Uses Stable Diffusion with ControlNet to generate detailed 2D renders
from wireframes, edge maps, and text prompts. Key capabilities:

  1. ControlNet-guided generation from wireframe inputs — lineart, canny,
     and depth control models for structure-preserving image generation
  2. Image-to-image enhancement — upscaling, denoising, style transfer
  3. CPU fallback with OpenCV-based enhancement when GPU is unavailable
  4. Lazy model loading — models are loaded on first use and cached

This service runs the heavy ML inference. The JS frontend should show
a loading indicator during generation (typically 5-30s on GPU).

Integration:
  - Called by main.py POST /api/generate-asset endpoint
  - Accepts an input image (wireframe/sketch) + text prompt
  - Returns the generated image as bytes
  - Used by the 3D Workshop for AI-assisted asset creation
"""

import io
import os
import time
import logging
from typing import Optional, Dict, Any

# Lazy PIL import (used in _resize_for_model)
try:
    from PIL import Image as _PIL_Image
    _HAS_PIL = True
except ImportError:
    _HAS_PIL = False

logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

# Model cache — loaded once, reused across requests
_MODEL_CACHE: Dict[str, Any] = {}

# Default ControlNet model IDs (Hugging Face)
CONTROLNET_MODELS = {
    "lineart": "lllyasviel/control_v11p_sd15_lineart",
    "canny": "lllyasviel/sd-controlnet-canny",
    "depth": "lllyasviel/control_v11f1p_sd15_depth",
    "scribble": "lllyasviel/control_v11p_sd15_scribble",
    "softedge": "lllyasviel/control_v11p_sd15_softedge",
}

# Stable Diffusion base model
SD_MODEL = "runwayml/stable-diffusion-v1-5"

# Default generation parameters
DEFAULT_STEPS = 25
DEFAULT_GUIDANCE_SCALE = 7.5
DEFAULT_CONTROLNET_SCALE = 0.8
DEFAULT_STRENGTH = 0.75
DEFAULT_NEGATIVE_PROMPT = (
    "low quality, blurry, distorted, deformed, ugly, bad anatomy, "
    "bad proportions, extra limbs, cloned face, disfigured, gross proportions, "
    "malformed limbs, missing arms, missing legs, extra arms, extra legs, "
    "fused fingers, too many fingers, long neck, watermark, text, signature"
)

# ============================================================================
# Core Generation Pipeline
# ============================================================================


async def generate_from_wireframe(
    input_image_bytes: bytes,
    prompt: str = "",
    negative_prompt: str = DEFAULT_NEGATIVE_PROMPT,
    control_type: str = "lineart",
    num_steps: int = DEFAULT_STEPS,
    guidance_scale: float = DEFAULT_GUIDANCE_SCALE,
    controlnet_scale: float = DEFAULT_CONTROLNET_SCALE,
    strength: float = DEFAULT_STRENGTH,
    seed: Optional[int] = None,
) -> bytes:
    """
    Generate a detailed render from a wireframe/sketch input.

    Uses Stable Diffusion + ControlNet to transform the input wireframe
    into a detailed render based on the text prompt.

    Args:
        input_image_bytes: Raw input image bytes (wireframe, sketch, edge map)
        prompt: Text description of the desired output
        negative_prompt: Things to avoid in the output
        control_type: Type of ControlNet model ('lineart', 'canny', 'depth',
                     'scribble', 'softedge')
        num_steps: Number of diffusion steps (higher = more detail, slower)
        guidance_scale: How closely to follow the prompt (1-15)
        controlnet_scale: How strongly to follow the control image (0-1)
        strength: How much to transform the input (0-1, higher = more change)
        seed: Random seed for reproducibility

    Returns:
        Generated image bytes (PNG format)

    Raises:
        ImportError: If torch or diffusers are not installed
        RuntimeError: If generation fails
    """
    import numpy as np
    import cv2
    from PIL import Image

    # Decode input image
    nparr = np.frombuffer(input_image_bytes, np.uint8)
    input_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if input_img is None:
        raise ValueError("Could not decode input image")

    input_rgb = cv2.cvtColor(input_img, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(input_rgb)

    # Try GPU-accelerated generation
    try:
        result = await _run_diffusers_pipeline(
            input_image=pil_image,
            prompt=prompt,
            negative_prompt=negative_prompt,
            control_type=control_type,
            num_steps=num_steps,
            guidance_scale=guidance_scale,
            controlnet_scale=controlnet_scale,
            strength=strength,
            seed=seed,
        )
        return result

    except (ImportError, RuntimeError) as e:
        logger.warning(f"GPU generation failed, using CPU fallback: {e}")
        # Fall back to OpenCV enhancement
        return _run_cpu_fallback(
            input_img=input_img,
            prompt=prompt,
        )


# ============================================================================
# GPU Pipeline (Stable Diffusion + ControlNet)
# ============================================================================


async def _run_diffusers_pipeline(
    input_image: Any,  # PIL Image
    prompt: str,
    negative_prompt: str,
    control_type: str,
    num_steps: int,
    guidance_scale: float,
    controlnet_scale: float,
    strength: float,
    seed: Optional[int],
) -> bytes:
    """
    Run the full Stable Diffusion + ControlNet pipeline.

    Loads models lazily (cached after first load).
    Uses GPU (CUDA) if available, falls back to MPS (Apple Silicon)
    or CPU.

    Args:
        input_image: PIL Image to use as the starting point
        All other args from generate_from_wireframe()

    Returns:
        Generated image bytes (PNG)
    """
    import torch
    from diffusers import (
        StableDiffusionControlNetImg2ImgPipeline,
        ControlNetModel,
        UniPCMultistepScheduler,
    )

    device = _get_device()
    dtype = torch.float16 if device == "cuda" else torch.float32

    # Resolve ControlNet model ID
    controlnet_id = CONTROLNET_MODELS.get(control_type, CONTROLNET_MODELS["lineart"])

    # Load models (cached)
    pipe = _load_pipeline(controlnet_id, device, dtype)

    # Prepare control image
    # For lineart: use the input as-is (it's already a wireframe)
    # For canny: apply Canny edge detection first
    import numpy as np

    if control_type == "canny":
        np_img = np.array(input_image)
        edges = cv2.Canny(np_img, 50, 150)
        edges_rgb = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        control_image = Image.fromarray(edges_rgb)
    else:
        control_image = input_image

    # Resize to 512x512 for model input (maintaining aspect ratio)
    control_image = _resize_for_model(control_image, 512)
    init_image = _resize_for_model(input_image, 512)

    # Generate
    generator = torch.manual_seed(seed) if seed is not None else None

    with torch.inference_mode():
        output = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            image=init_image,
            control_image=control_image,
            num_inference_steps=num_steps,
            guidance_scale=guidance_scale,
            controlnet_conditioning_scale=controlnet_scale,
            strength=strength,
            generator=generator,
        )

    # Convert result to bytes
    result_image = output.images[0]
    img_buffer = io.BytesIO()
    result_image.save(img_buffer, format='PNG', optimize=True)
    return img_buffer.getvalue()


def _load_pipeline(
    controlnet_id: str,
    device: str,
    dtype: Any,
) -> Any:
    """
    Load or retrieve cached pipeline.

    Models are cached to avoid reloading on every request.
    First load typically takes 10-30s; subsequent loads are instant.

    Args:
        controlnet_id: Hugging Face model ID for the ControlNet
        device: 'cuda', 'mps', or 'cpu'
        dtype: torch.float16 or torch.float32

    Returns:
        Loaded pipeline
    """
    cache_key = f"{controlnet_id}_{device}"

    if cache_key in _MODEL_CACHE:
        logger.info(f"Using cached pipeline: {controlnet_id}")
        return _MODEL_CACHE[cache_key]

    logger.info(f"Loading pipeline: {controlnet_id} (this may take a minute...)")
    start = time.time()

    # Load ControlNet
    controlnet = ControlNetModel.from_pretrained(
        controlnet_id,
        torch_dtype=dtype,
    )

    # Load main pipeline
    pipe = StableDiffusionControlNetImg2ImgPipeline.from_pretrained(
        SD_MODEL,
        controlnet=controlnet,
        torch_dtype=dtype,
        safety_checker=None,  # Disable NSFW filter for technical use
        requires_safety_checker=False,
    )

    # Optimize with faster scheduler
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config)

    # Move to device
    pipe = pipe.to(device)

    # Enable optimizations
    if device == "cuda":
        pipe.enable_model_cpu_offload()
        try:
            pipe.enable_xformers_memory_efficient_attention()
        except (ImportError, AttributeError, Exception) as e:
            logger.warning(f"xformers not available, running without memory optimization: {e}")

    # Cache
    _MODEL_CACHE[cache_key] = pipe
    elapsed = time.time() - start
    logger.info(f"Pipeline loaded in {elapsed:.1f}s")

    return pipe


# ============================================================================
# CPU Fallback (OpenCV Enhancement)
# ============================================================================


def _run_cpu_fallback(
    input_img: Any,
    prompt: str,
) -> bytes:
    """
    CPU-based fallback when GPU/ML libraries are unavailable.

    Applies a cascade of OpenCV enhancements to produce a visually
    improved output from the input wireframe/sketch.

    Enhancement pipeline:
      1. Denoise (Non-local Means)
      2. Contrast enhancement (CLAHE)
      3. Sharpening (unsharp mask)
      4. Edge enhancement
      5. Optional stylization based on prompt keywords

    Args:
        input_img: OpenCV BGR image array
        prompt: Text prompt (used to select style)

    Returns:
        Enhanced image bytes (PNG)
    """
    import cv2
    import numpy as np

    img = input_img.copy()

    # Step 1: Denoise
    denoised = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)

    # Step 2: Convert to LAB for better contrast enhancement
    lab = cv2.cvtColor(denoised, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced_lab = cv2.merge([l, a, b])
    enhanced = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

    # Step 3: Unsharp masking for sharpening
    blurred = cv2.GaussianBlur(enhanced, (0, 0), 3)
    sharpened = cv2.addWeighted(enhanced, 1.5, blurred, -0.5, 0)

    # Step 4: Edge enhancement
    edges = cv2.Canny(cv2.cvtColor(sharpened, cv2.COLOR_BGR2GRAY), 30, 100)
    edges_colored = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR) * 0.3
    result = cv2.addWeighted(sharpened, 0.85, edges_colored.astype(np.uint8), 0.15, 0)

    # Step 5: Apply prompt-based style adjustments
    prompt_lower = prompt.lower()
    if "blueprint" in prompt_lower or "technical" in prompt_lower:
        # Blue tint for technical drawings
        result = cv2.addWeighted(
            result, 0.7,
            np.full_like(result, (200, 180, 140)), 0.3, 0
        )
    elif "warm" in prompt_lower or "sunset" in prompt_lower:
        # Warm tint
        result = cv2.addWeighted(
            result, 0.8,
            np.full_like(result, (60, 100, 140)), 0.2, 0
        )
    elif "cold" in prompt_lower or "night" in prompt_lower:
        # Cool tint
        result = cv2.addWeighted(
            result, 0.8,
            np.full_like(result, (140, 100, 60)), 0.2, 0
        )

    # Encode to PNG
    _, buffer = cv2.imencode('.png', result)
    return buffer.tobytes()


# ============================================================================
# Helpers
# ============================================================================


def _get_device() -> str:
    """
    Determine the best available device for ML inference.

    Priority: CUDA > MPS (Apple Silicon) > CPU
    """
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"


def _resize_for_model(image: Any, target_size: int = 512) -> Any:
    """
    Resize an image for model input while maintaining aspect ratio.

    Pads to square if necessary, as the model expects square input.

    Args:
        image: PIL Image
        target_size: Target dimension (default: 512)

    Returns:
        Resized PIL Image
    """
    import numpy as np

    # Convert PIL to numpy
    img_np = np.array(image)
    h, w = img_np.shape[:2]

    # Calculate scale to fit target_size on longest side
    scale = target_size / max(h, w)
    new_h, new_w = int(h * scale), int(w * scale)

    # Resize
    try:
        import cv2
        resized = cv2.resize(img_np, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    except ImportError:
        resized = image.resize((new_w, new_h))

    # Pad to square
    if len(resized.shape) == 3:
        h, w, c = resized.shape
    else:
        h, w = resized.shape
        c = 1

    pad_h = target_size - h
    pad_w = target_size - w
    top = pad_h // 2
    bottom = pad_h - top
    left = pad_w // 2
    right = pad_w - left

    try:
        import cv2
        import numpy as np
        padded = cv2.copyMakeBorder(
            resized, top, bottom, left, right,
            cv2.BORDER_CONSTANT, value=(255, 255, 255)
        )
        if _HAS_PIL:
            return _PIL_Image.fromarray(padded)
        return padded
    except ImportError:
        if _HAS_PIL:
            return _PIL_Image.fromarray(resized) if not isinstance(resized, _PIL_Image.Image) else resized
        return resized


# ============================================================================
# Model Management
# ============================================================================


def clear_model_cache() -> None:
    """
    Clear the model cache to free GPU memory.
    Call between large generation tasks if memory is constrained.
    """
    global _MODEL_CACHE
    for key, pipe in _MODEL_CACHE.items():
        try:
            if hasattr(pipe, 'to') and callable(pipe.to):
                pipe.to('cpu')
        except Exception:
            pass
    _MODEL_CACHE.clear()
    logger.info("Model cache cleared")

    # Also clear CUDA cache
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.info("CUDA cache cleared")
    except ImportError:
        pass


def get_model_status() -> Dict[str, Any]:
    """
    Get the current status of loaded models.

    Returns:
        Dict with device, cached_models, and memory info
    """
    status = {
        "device": _get_device(),
        "cached_models": list(_MODEL_CACHE.keys()),
        "cache_size": len(_MODEL_CACHE),
    }

    try:
        import torch
        if torch.cuda.is_available():
            status["cuda_allocated_gb"] = round(
                torch.cuda.memory_allocated() / 1e9, 2
            )
            status["cuda_cached_gb"] = round(
                torch.cuda.memory_reserved() / 1e9, 2
            )
    except ImportError:
        pass

    return status
