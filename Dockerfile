# =====================================================================
# @domain:    deployment
# @concern:   Multi-Target Dockerfile — Frontend (nginx) + Backend (Python CPU/GPU)
# @version:   1.0.0
# @security:  Non-Root / Stripped WASM / Pinned Base Images
# =====================================================================
#
# Architecture:
#   Stage 1 (frontend-builder) — Build JS static files via Vite
#   Stage 2 (wasm-builder)     — Compile Rust → WASM with LTO + strip
#   Stage 3 (wasm-strip)       — Hardening: strip WASM debug symbols
#   Stage 4 (frontend)         — Nginx image with static files + nginx.conf
#   Stage 5 (production)       — Python FastAPI backend (CPU / python:3.11-slim)
#   Stage 6 (production-gpu)   — Python FastAPI backend (GPU / nvidia/cuda)
#
# Build targets:
#   docker build --target frontend       -t frontend-image .   (Nginx + static)
#   docker build --target production     -t backend-image  .   (Python CPU)
#   docker build --target production-gpu -t backend-gpu    .   (Python GPU)
#

# --- STAGE 1: Frontend Builder (Node.js) ---
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS frontend-builder

WORKDIR /build

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . ./
RUN npm run build

# Verify output exists
RUN test -d dist && test -f dist/index.html

# --- STAGE 2: WASM Builder (Rust) ---
FROM rust:1.75-slim@sha256:70c2a016184099262fd7cee46f3d35fec3568c45c62f87e37f7f665f766b1f74 AS wasm-builder

WORKDIR /build

# Install system dependencies for wasm-pack
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install wasm-pack
# Pin 0.12.1 (not 0.13.0): 0.13.0 pulls home-0.5.12 which requires Cargo's
# edition2024 feature. edition2024 is stabilized in Rust 1.82+; our pinned
# rust:1.75-slim base ships Cargo 1.75 which can't parse it. 0.12.1 was
# released before the edition2024 propagation in wasm-pack's dep tree.
RUN cargo install wasm-pack --version 0.12.1

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

# --- STAGE 3: WASM Strip (hardening) ---
FROM wasm-builder AS wasm-strip

# wasm-strip from wabt to remove remaining debug sections
RUN apt-get update && \
    apt-get install -y --no-install-recommends wabt && \
    wasm-strip pkg/quad_core_physics_bg.wasm && \
    rm -rf /var/lib/apt/lists/*

# --- STAGE 4: Frontend (Nginx + Static Files) ---
FROM nginx:1.25-alpine@sha256:516475cc129da42866742567714ddc681e5eed7b9ee0b9e9c015e464b4221a00 AS frontend

# Install openssl for self-signed cert generation
# NOTE: Stage 4 base is nginx:1.25-alpine (Alpine, not Debian), so the
# package manager is apk, not apt-get. The Stage 3 apt-get calls below
# are correct because Stage 3 inherits the Debian-based rust:1.75-slim base.
RUN apk add --no-cache openssl

# Generate self-signed TLS certs for the nginx -t check and dev fallback
# In production, mount real certs over these at /etc/nginx/certs/
RUN mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/certs/privkey.pem \
        -out /etc/nginx/certs/fullchain.pem \
        -subj "/CN=localhost" 2>/dev/null

# Copy built frontend files
COPY --from=frontend-builder /build/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Verify config syntax (requires cert files to exist)
RUN nginx -t

EXPOSE 80 443

# --- STAGE 5: Production Runtime — CPU (Python 3.11-slim) ---
FROM python:3.11-slim@sha256:cdbd05fb6f457ca275ff51ce00d93d865ca0b6a25f5ffb08262d94f6835771e5 AS production

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

# Copy WASM to a location accessible by Python if needed
RUN mkdir -p static/wasm && \
    cp -r rust_core/pkg/*.wasm static/wasm/ 2>/dev/null || true

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

# --- STAGE 6: Production Runtime — GPU (NVIDIA CUDA 12.1) ---
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04@sha256:402700b179eb764da6d60d99fe106aa16c36874f7d7fb3e122251ff6aea8b2f7 AS production-gpu

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install Python 3.11 and system dependencies for OpenCV/PyTorch
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3.11 \
        python3-pip \
        python3.11-venv \
        libgl1-mesa-glx \
        libglib2.0-0 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create symlink python3 → python for consistency
RUN ln -sf /usr/bin/python3.11 /usr/bin/python && \
    ln -sf /usr/bin/pip3 /usr/bin/pip

# Security: create non-root user
RUN groupadd -r appuser && \
    useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Copy WASM artifacts from builder
COPY --from=wasm-strip /build/pkg/ ./rust_core/pkg/

# Copy Python requirements and install dependencies with GPU support
COPY python_server/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    # Uncomment these for GPU-accelerated AI inference:
    # pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu121 && \
    # pip install --no-cache-dir diffusers transformers accelerate && \
    rm -rf /root/.cache

# Copy Python source code
COPY python_server/ ./python_server/

# Copy WASM to static directory if needed
RUN mkdir -p static/wasm && \
    cp -r rust_core/pkg/*.wasm static/wasm/ 2>/dev/null || true

# Set ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose API port
EXPOSE 8000

# Healthcheck — longer start period for AI model loading
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Start FastAPI with Uvicorn
CMD ["uvicorn", "python_server.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--log-level", "info", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
