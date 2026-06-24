# =====================================================================
# @domain:    deployment
# @concern:   Production Backend Image — Python FastAPI + WASM artifacts
# @version:   1.0.0
# @security:  Non-Root / Stripped WASM / Pinned Base Images
# =====================================================================
#
# Architecture:
#   Stage 1 (wasm-builder) — Compile Rust → WASM with LTO + strip
#   Stage 2 (production)   — Python runtime + copied WASM artifacts
#
# Frontend static files (dist/) are served by Nginx in docker-compose.
# This image only runs the Python FastAPI backend.
#

# --- STAGE 1: WASM Builder (Rust) ---
FROM rust:1.75-slim@sha256:84a188932ebe47063f2052f724f5130b7cf4fb3c0c9f7e30a0c3a5d5f4b5f3a9 AS wasm-builder

WORKDIR /build

# Install system dependencies for wasm-pack
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install wasm-pack
RUN cargo install wasm-pack --version 0.13.0

# Copy only Cargo files first for layer caching
COPY rust_core/Cargo.toml rust_core/Cargo.lock* ./

# Create a minimal src/lib.rs to allow dependency caching
RUN mkdir -p src && echo "fn main() {}" > src/lib.rs

# Build dependencies (cached layer)
RUN wasm-pack build --target web --release || true

# Now copy the actual source
COPY rust_core/ ./

# Full production WASM build with LTO + symbol stripping for anti-RE
RUN wasm-pack build --target web --release --out-dir pkg

# Verify WASM was produced
RUN test -f pkg/quad_core_physics_bg.wasm

# --- STAGE 2: WASM Strip (hardening) ---
FROM wasm-builder AS wasm-strip

# wasm-strip from wabt to remove remaining debug sections
RUN apt-get update && \
    apt-get install -y --no-install-recommends wabt && \
    wasm-strip pkg/quad_core_physics_bg.wasm && \
    rm -rf /var/lib/apt/lists/*

# --- STAGE 3: Production Runtime (Python) ---
FROM python:3.11-slim@sha256:7222f57e25d535167ce0da037ee5a21ccda7ebab7a3f08f8f97252a73d53aadf AS production

# Security: create non-root user
RUN groupadd -r appuser && \
    useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Copy WASM artifacts from builder
COPY --from=wasm-strip /build/pkg/ ./rust_core/pkg/

# Copy Python requirements and install dependencies
COPY python_server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    rm -rf /root/.cache

# Copy Python source code
COPY python_server/ ./python_server/

# Create static directory (served by Nginx, but keep for fallback)
RUN mkdir -p static/wasm && \
    cp -r rust_core/pkg/*.wasm static/wasm/ && \
    cp -r rust_core/pkg/*.js static/wasm/ 2>/dev/null || true

# Set ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose API port
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Start FastAPI with Uvicorn
CMD ["uvicorn", "python_server.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--log-level", "info", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
