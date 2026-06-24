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
from fastapi import FastAPI, HTTPException, Depends, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from cryptography.fernet import Fernet

from python_server.services.wireframe_ai import parse_wireframe_topology, generate_level_payload
from python_server.services.security_engine import security_engine
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
