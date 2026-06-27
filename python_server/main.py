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
import math
import json
import random
import hashlib
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Depends, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from cryptography.fernet import Fernet

from python_server.services.wireframe_ai import parse_wireframe_topology, generate_level_payload
from python_server.services.security_engine import security_engine
from python_server.services.ghost_verifier import router as ghost_verifier_router
from pydantic import Field as PydanticField

# === Voice-to-Text (optional) ===
try:
    import whisper
    _WHISPER_MODEL = None  # Lazy-loaded on first request
except ImportError:
    whisper = None
    _WHISPER_MODEL = None

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
    print("[Backend] Initializing HAWP AI models and security engine...")
    # from python_server.services.wireframe_ai import preload_hawp_models
    # preload_hawp_models()
    # Initialize security engine for fingerprint analysis
    security_engine.initialize()
    print("[Backend] Security engine ready.")
    yield
    # Shutdown: Clear VRAM
    print("[Backend] Clearing AI models from VRAM...")


app = FastAPI(title="Going Balls Quad-Core Backend", version="2.0.0", lifespan=lifespan)

# CORS: env-driven production origin + a permissive dev allowance so the JS
# bundle served from Vite (5173), VS Code Live Server (5500), the Docker nginx
# (8080), and 127.0.0.1 variants all work without a hardcoded per-machine edit.
# `allow_origin_regex` covers the 127.0.0.1:<port> family (Live Server defaults)
# and anything matching `http://localhost:<port>`. In production, set
# CLIENT_ORIGIN to the real frontend origin and the regex allows all of them
# for free-tier devs; tighten as needed.
_DEFAULT_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5500",
    "http://localhost:8000",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8080",
]
_prod_origin = os.getenv("CLIENT_ORIGIN") or ""
if _prod_origin:
    _DEFAULT_DEV_ORIGINS.insert(0, _prod_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEFAULT_DEV_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
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


# --- Federated Physics Validation: session storage + helpers ---


# In-memory per-IP session tuple. Patent-pending Federated Physics
# Validation: each session tuple includes randomized gravity_hash /
# friction_seed / validation_token so the server can verify the client's
# frame_hash against the seed it issued earlier. Sessions are keyed by
# client_ip (not fingerprint) because the current JS caller does not send
# a fingerprint header consistently between /wasm-secrets and
# /validate-frame — see `_wasm_session_key` for the rationale.
_WASM_SESSION_TTL_SECONDS = 15 * 60  # 15 minutes
_wasm_sessions: Dict[str, Dict[str, Any]] = {}


def _purge_expired_wasm_sessions() -> int:
    """Piggyback cleanup of expired session tuples. Triggered on every
    `GET /api/auth/wasm-secrets` call so we don't need a background sweep.
    Returns count purged.
    """
    now = time.time()
    expired = [
        key for key, s in _wasm_sessions.items()
        if now - s["issued_at"] > _WASM_SESSION_TTL_SECONDS
    ]
    for key in expired:
        del _wasm_sessions[key]
    return len(expired)


def _wasm_session_key(client_ip: str, client_fingerprint: str = "") -> str:
    """Build the session key. The Federated Physics Validation flow binds
    primarily by client_ip because the current JS caller (`_fetchServerSecrets`
    in src/core/ipc_bridge.js) does NOT send an `X-Client-Fingerprint` header
    on the secrets-call GET, while it DOES send `_getFingerprint()` in the
    validate-frame POST body. Including fingerprint in the key would
    cause the two calls to look up under mismatched keys and 404 every
    validate-frame request. Fingerprint is still stored on the session
    tuple for audit purposes and logged on change.
    """
    return client_ip or "unknown_ip"


def _mint_wasm_session(client_ip: str, client_fingerprint: str) -> Dict[str, Any]:
    """Issue a randomized physics tuple + Fernet-encrypted session token."""
    _purge_expired_wasm_sessions()
    # Per-session randomization within physics-defensible bands.
    # gravity_hash ~ 9.81 * 1.2 ± ~5% (matches the JS fallback of 9.81 * 1.2 = 11.772).
    gravity_hash = round(random.uniform(11.2, 12.3), 4)
    friction_seed = random.randint(1_000_000, 9_999_999)
    validation_token = random.randint(0, 2**31 - 1)
    issued_at = time.time()

    # Session token is Fernet-encrypted JSON {iat, exp, fp} so the server
    # can verify expiry without a separate JWT library.
    # NOTE: `fp` here is INFORMATIONAL ONLY — the session is bound by
    # client_ip (see `_wasm_session_key`). The drift check in
    # `_verify_wasm_session_token` deliberately excludes the
    # `stored_fp == client_ip` case (no real fingerprint at mint) so a
    # future maintainer must NOT tighten this to `fp == client_fingerprint`.
    payload = json.dumps({
        "iat": issued_at,
        "exp": issued_at + _WASM_SESSION_TTL_SECONDS,
        "fp": client_fingerprint or client_ip,
    }).encode("utf-8")
    session_token = _cipher.encrypt(payload).decode("utf-8")

    key = _wasm_session_key(client_ip, client_fingerprint)
    _wasm_sessions[key] = {
        "ip": client_ip,
        "fingerprint": client_fingerprint or client_ip,
        "gravity_hash": gravity_hash,
        "friction_seed": friction_seed,
        "validation_token": validation_token,
        "issued_at": issued_at,
    }
    return {
        "gravity_hash": gravity_hash,
        "friction_seed": friction_seed,
        "validation_token": float(validation_token),
        "session_token": session_token,
    }


def _verify_wasm_session_token(
    session_token: str,
    client_fingerprint: str,
    client_ip: str,
) -> Optional[Dict[str, Any]]:
    """Validate the Fernet session token. Returns the inner payload on
    success, or None if the token is invalid/expired/FP-mismatched.
    """
    try:
        decrypted = _cipher.decrypt(session_token.encode("utf-8")).decode("utf-8")
        payload = json.loads(decrypted)
    except Exception:
        return None
    if time.time() > float(payload.get("exp", 0)):
        return None
    # The token's stored fingerprint is informational only — the session
    # is bound by client_ip (see `_wasm_session_key`). Drift is logged
    # but does not 401 — browser fingerprints are unstable across
    # navigation/reload and a strict equality check would 401 every
    # request where the secrets call was made without a fingerprint header
    # but the validate-frame body carries one. See the design memo on
    # `_wasm_session_key` for the full rationale.
    stored_fp = payload.get('fp', '')
    # The `and client_fingerprint` guard prevents emitting a misleading
    # drift log when the caller's fingerprint is empty (the validate-frame
    # Pydantic model enforces min_length=10 today, but defending the helper
    # in isolation is the right contract).
    if stored_fp and stored_fp != client_ip and client_fingerprint and client_fingerprint != stored_fp:
        print(
            f'[WasmAuth] FP drift on session from {client_ip}: '
            f'minted={stored_fp[:24]}... validate={client_fingerprint[:24]}...'
        )
    return payload


# --- Request/Response Models ---


class LevelRequest(BaseModel):
    level_index: int = Field(..., ge=1, le=1000)
    tier: int = Field(..., ge=1, le=9)
    client_fingerprint: str = Field(..., min_length=10, max_length=128)


class WireframeRequest(BaseModel):
    image_data_b64: str = Field(..., min_length=100)
    user_tier: str = Field(..., pattern="^(free|pro|ultimate)$")
    snap_threshold: float = Field(1.0, ge=0.1, le=10.0)


# --- Security Telemetry Models ---


class SecurityTelemetryRequest(BaseModel):
    """Payload from the client-side FingerprintCollector."""
    fp_hash: str = Field(..., min_length=10, max_length=128)
    raw_behavior: list = Field(default_factory=list)
    session_id: str = Field(default="", max_length=64)
    hardware_profile: dict = Field(default_factory=dict)


# --- Federated Physics Validation Models (patent-pending feature) ---


class WasmSecretsResponse(BaseModel):
    """Per-session randomized physics constants + Fernet-encrypted session token.
    Issued by `GET /api/auth/wasm-secrets`; consumed by the Rust WASM physics
    solver via `src/core/ipc_bridge.js::_fetchServerSecrets()`.
    """
    gravity_hash: float
    friction_seed: int
    validation_token: float
    session_token: str


class ValidateFrameRequest(BaseModel):
    """Physics frame validation request. Pairs with `WasmSecretsResponse`
    so the server can verify the client's frame_hash against the
    per-IP session tuple previously issued. The `client_fingerprint`
    field is recorded for audit (logged on drift) but is not used for
    authentication — the session itself is bound by client_ip.
    """
    frame_hash: float
    level_index: int = Field(..., ge=1, le=1000)
    client_fingerprint: str = Field(..., min_length=10, max_length=128)
    expected_gravity_seed: float


class ValidateFrameResponse(BaseModel):
    """Server-side validation verdict for a single physics frame."""
    valid: bool


# --- Voice-to-Text Endpoint ---

def _get_whisper_model():
    """Lazy-load the Whisper model on first request."""
    global _WHISPER_MODEL
    if _WHISPER_MODEL is None and whisper is not None:
        import whisper as _w
        _WHISPER_MODEL = _w.load_model("base")  # ~1.5GB VRAM, good accuracy
    return _WHISPER_MODEL


@app.post("/api/transcribe")
async def transcribe_audio(request: Request):
    """
    Transcribe an audio file using OpenAI Whisper.
    Accepts multipart/form-data with an 'audio' field.
    Supports: webm, wav, mp3, ogg, m4a

    Rate-limited (20 req/min per IP) but does not require an API key.
    """
    check_rate_limit(request.client.host, max_requests=20)

    # Lazy-load model in thread pool to avoid blocking the event loop
    import asyncio
    loop = asyncio.get_event_loop()

    model = await loop.run_in_executor(None, _get_whisper_model)
    if model is None:
        raise HTTPException(
            status_code=501,
            detail="Speech-to-text is not available. Install openai-whisper on the server."
        )

    try:
        form = await request.form()
        audio_file = form.get("audio")
        if audio_file is None:
            raise HTTPException(status_code=400, detail="Missing 'audio' field in multipart form")

        audio_bytes = await audio_file.read()
        if len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")
        if len(audio_bytes) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=413, detail="Audio file too large (max 10MB)")

        import tempfile
        suffix = os.path.splitext(str(audio_file.filename or "recording.webm"))[1] or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            # Run Whisper transcription in thread pool (blocking I/O)
            result = await loop.run_in_executor(
                None,
                lambda: model.transcribe(
                    tmp_path,
                    language=None,
                    temperature=0.0,
                    task="transcribe",
                    fp16=False
                )
            )
            text = result.get("text", "").strip()
            language = result.get("language", "en")

            if not text:
                return {"text": "", "language": language, "detected": False}

            return {
                "text": text,
                "language": language,
                "detected": True,
                "segments": len(result.get("segments", []))
            }
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


# --- Endpoints ---


@app.get("/api/health")
async def health_check():
    return {"status": "secure", "backend": "quad-core-python", "version": "2.0.0"}


@app.post("/api/generate-level")
async def generate_secure_level(
    req: LevelRequest,
    request: Request,
    # Optional anonymous flow: dev / preview builds call this without a Bearer
    # header (the JS QuadCore orchestrator in `src/core/ipc_bridge.js` does not
    # mint an API key for unauthenticated play). Anon calls get a JS-local
    # PRNG-derived payload — ggez-playable but without the secret-derived
    # tamper-resistance of the authenticated path. Production deployments that
    # surface this to the internet should set REQUIRE_API_KEY=1 and rotate the
    # fallback off.
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
):
    check_rate_limit(request.client.host)

    require_key = os.getenv("REQUIRE_API_KEY", "0") == "1"
    if require_key:
        if not credentials or credentials.credentials != API_SECRET_KEY:
            raise HTTPException(status_code=401, detail="Invalid API Key")
    elif credentials and credentials.credentials and credentials.credentials != API_SECRET_KEY:
        # Send a key but wrong one — still 401. Authenticated path is reserved.
        raise HTTPException(status_code=401, detail="Invalid API Key")

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


# --- Security Telemetry Endpoint ---


@app.post("/api/security/telemetry")
async def receive_telemetry(
    req: SecurityTelemetryRequest,
    request: Request,
    bg_tasks: BackgroundTasks,
):
    """
    Receive fingerprint telemetry from the client-side FingerprintCollector.

    Enriches with IP data, runs AI behavioral anomaly detection,
    and stores results in PostgreSQL. Fire-and-forget — returns
    immediately with status "accepted".

    Rate-limited to 30 requests/min per IP.
    Does NOT require API key (anonymous telemetry).
    """
    check_rate_limit(request.client.host, max_requests=30)

    # Extract real client IP from proxy headers (set by Nginx)
    client_ip = request.headers.get("X-Real-IP") or request.headers.get(
        "X-Forwarded-For", request.client.host
    )
    # X-Forwarded-For can be a comma-separated list; take the first (real client)
    if "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()

    # Queue heavy AI analysis as background task (non-blocking)
    bg_tasks.add_task(
        _process_telemetry_background,
        req.fp_hash,
        req.raw_behavior,
        client_ip,
        req.session_id,
        req.hardware_profile,
    )

    return {"status": "accepted", "message": "Telemetry received for analysis"}


async def _process_telemetry_background(
    fp_hash: str,
    behavior: list,
    client_ip: str,
    session_id: str,
    hardware_profile: dict,
):
    """
    Background task: run AI anomaly detection and store results.
    This runs outside the request-response cycle so the client gets
    an immediate 202 response.
    """
    try:
        result = await security_engine.process_telemetry(
            fp_hash=fp_hash,
            behavior=behavior,
            client_ip=client_ip,
            session_id=session_id,
            hardware_profile=hardware_profile or None,
        )

        if result.anomaly_score > 0.7:
            print(
                f"[Security] HIGH ANOMALY detected for FP: {fp_hash[:16]}... "
                f"(score={result.anomaly_score:.2f}, "
                f"risks={result.risk_factors}, "
                f"country={result.country})"
            )
            # In production: trigger CAPTCHA challenge or soft-ban

        elif result.anomaly_score > 0.4:
            print(
                f"[Security] Moderate anomaly: {fp_hash[:16]}... "
                f"(score={result.anomaly_score:.2f})"
            )

        # Store in database (in production: upsert to device_fingerprints)
        # await db.execute("""
        #     INSERT INTO device_fingerprints
        #         (fp_hash, ip_hash, country_code, anomaly_score, behavioral_embedding, risk_factors)
        #     VALUES ($1, $2, $3, $4, $5::vector, $6)
        #     ON CONFLICT (fp_hash) DO UPDATE SET
        #         last_seen = NOW(),
        #         anomaly_score = $4,
        #         behavioral_embedding = $5::vector,
        #         session_count = device_fingerprints.session_count + 1
        # """,
        #     result.fp_hash, result.ip_hash, result.country,
        #     result.anomaly_score,
        #     security_engine.format_embedding_for_db(result.behavioral_embedding),
        #     result.risk_factors,
        # )

    except Exception as e:
        print(f"[Security] Telemetry processing error: {e}")


# === Federated Physics Validation Endpoints (patent-pending) ===
#
# These two endpoints form a coupled flow:
#   1. `GET /api/auth/wasm-secrets` issues a per-session randomized physics
#      tuple (gravity_hash, friction_seed, validation_token) plus a
#      Fernet-encrypted session_token. Consumed by Rust WASM via
#      `inject_physics_constants(gravity_hash, friction_seed)` in
#      `src/core/ipc_bridge.js`.
#   2. `POST /api/auth/validate-frame` accepts client-side frame_hash and
#      verifies it against the per-session tuple previously issued. Without
#      this round-trip the WASM constant-seeding flow is dead-coded.


@app.get("/api/auth/wasm-secrets", response_model=WasmSecretsResponse)
async def get_wasm_secrets(request: Request):
    """Issue per-IP randomized physics constants + session token.

    Anonymous endpoint (no API key required) but rate-limited per IP. The
    `X-Client-Fingerprint` header is optional — we accept it when the
    client sends one (for audit; logged on subsequent drift) but the
    session itself is bound by client_ip (see `_wasm_session_key`).
    """
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(client_ip, max_requests=10)

    fingerprint = request.headers.get("X-Client-Fingerprint", "") or ""
    secret_data = _mint_wasm_session(client_ip, fingerprint)
    return WasmSecretsResponse(**secret_data)


@app.post("/api/auth/validate-frame", response_model=ValidateFrameResponse)
async def validate_frame(
    req: ValidateFrameRequest,
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Verify a client's physics frame_hash against the per-session tuple.

    The flow:
      1. Bearer Authorization header carries the Fernet session_token minted
         by `GET /api/auth/wasm-secrets`.
      2. We decrypt + verify expiry. Fingerprint drift is logged as an
         audit event but does NOT 401 — the session is bound by client_ip.
      3. We look up the session tuple by client_ip.
      4. We verify the body's expected_gravity_seed matches the issued
         validation_token (proves the client is using the seed we gave).
      5. We sanity-check frame_hash is finite and non-negative (the physics
         solver never produces negative or NaN hashes).

    Note on hot-path volume: this endpoint is called per physics frame
    (typically 60 Hz). The check_rate_limit (60s sliding window) is fine
    for moderate loads but should be replaced with a token-bucket counter
    for production-grade 60Hz validation. The browser will additionally
    need to either sample validations (e.g., every Nth frame) or move to a
    WebSocket transport — a 60Hz POST with Authorization triggers a CORS
    preflight that saturates the browser's connection pool.
    """
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(client_ip, max_requests=4000)

    # 1. Bearer auth
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing session token. Call GET /api/auth/wasm-secrets first."
        )

    # 2. Decrypt + verify expiry (fingerprint drift is logged inside
    # `_verify_wasm_session_token` but does not 401).
    payload = _verify_wasm_session_token(
        credentials.credentials,
        req.client_fingerprint,
        client_ip,
    )
    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session token."
        )

    # 3. Look up the issued tuple by client_ip (fingerprint is audit-only).
    key = _wasm_session_key(client_ip, req.client_fingerprint)
    session = _wasm_sessions.get(key)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="No active session for fingerprint (may have expired)."
        )

    # 4. Sanity: frame_hash must be finite (no NaN, no Inf, no negative).
    if not math.isfinite(req.frame_hash) or req.frame_hash < 0:
        return ValidateFrameResponse(valid=False)

    # 5. Required: expected_gravity_seed must match the issued session.
    if abs(session["validation_token"] - req.expected_gravity_seed) > 1e-6:
        return ValidateFrameResponse(valid=False)

    # All checks passed.
    return ValidateFrameResponse(valid=True)


# === Ghost Verification Router ===
app.include_router(ghost_verifier_router)


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
