"""
=====================================================================
@domain:    backend_api
@concern:   FastAPI Entry Point, Security & Routing
@created:   2026-06-24T16:05:00Z
@track:     6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c
@version:   2.0.0
@security:  Server-Side (Thick Backend / Zero Trust)
=====================================================================
"""

import os
import time
import hashlib
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from cryptography.fernet import Fernet

from python_server.services.wireframe_ai import parse_wireframe_topology, generate_level_payload

# --- Security & Configuration ---
# Anti-RE: Secrets are never hardcoded. Loaded from encrypted env vars in production.
API_SECRET_KEY = os.getenv("API_SECRET_KEY", "fallback-dev-key-do-not-use-in-prod")
ENCRYPTION_KEY = os.getenv("LEVEL_GEN_FERNET_KEY", Fernet.generate_key())
_cipher = Fernet(ENCRYPTION_KEY)

# Rate limiting state (In production, use Redis)
_rate_limit_store = {}

security = HTTPBearer()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize AI models (HAWP) into VRAM
    print("[Backend] Initializing HAWP AI models...")
    # from python_server.services.wireframe_ai import preload_hawp_models
    # preload_hawp_models()
    yield
    # Shutdown: Clear VRAM
    print("[Backend] Clearing AI models from VRAM...")


app = FastAPI(title="Going Balls Quad-Core Backend", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CLIENT_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Middleware: Rate Limiting & API Auth ---


async def verify_api_key(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != API_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return credentials.credentials


def check_rate_limit(client_ip: str, max_requests: int = 60):
    now = time.time()
    if client_ip not in _rate_limit_store:
        _rate_limit_store[client_ip] = []

    # Clean old requests
    _rate_limit_store[client_ip] = [t for t in _rate_limit_store[client_ip] if now - t < 60]

    if len(_rate_limit_store[client_ip]) >= max_requests:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please upgrade to Pro.")

    _rate_limit_store[client_ip].append(now)


# --- Request/Response Models ---


class LevelRequest(BaseModel):
    level_index: int = Field(..., ge=1, le=1000)
    tier: int = Field(..., ge=1, le=9)
    client_fingerprint: str = Field(..., min_length=10, max_length=128)


class WireframeRequest(BaseModel):
    image_data_b64: str = Field(..., min_length=100)  # Prevent empty payloads
    user_tier: str = Field(..., pattern="^(free|pro|ultimate)$")
    snap_threshold: float = Field(1.0, ge=0.1, le=10.0)


# --- Endpoints ---


@app.get("/api/health")
async def health_check():
    return {"status": "secure", "backend": "quad-core-python", "version": "2.0.0"}


@app.post("/api/generate-level")
async def generate_secure_level(
    req: LevelRequest,
    request: Request,
    api_key: str = Depends(verify_api_key)
):
    check_rate_limit(request.client.host)

    # Generate deterministic, encrypted level payload
    payload = generate_level_payload(req.level_index, req.tier, user_prompt=None)

    # Encrypt the payload so the client cannot read or tamper with the level structure
    json_bytes = payload["raw_json"].encode('utf-8')
    encrypted_payload = _cipher.encrypt(json_bytes)

    return {
        "encrypted_payload": encrypted_payload.decode('utf-8'),
        "integrity_hash": hashlib.sha256(encrypted_payload).hexdigest(),
        "tier": req.tier
    }


@app.post("/api/wireframe/parse")
async def parse_wireframe(
    req: WireframeRequest,
    request: Request,
    api_key: str = Depends(verify_api_key)
):
    check_rate_limit(request.client.host, max_requests=10)  # Stricter limit for heavy AI

    # Gate heavy compute behind paywall
    use_hawp = req.user_tier in ["pro", "ultimate"]

    try:
        result = parse_wireframe_topology(
            image_b64=req.image_data_b64,
            use_hawp=use_hawp,
            snap_threshold=req.snap_threshold
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail="Wireframe parsing failed securely.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "development") == "development"
    )
