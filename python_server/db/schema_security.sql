/**
 * =====================================================================
 * @domain:    database
 * @concern:   Fingerprint Storage & Vector Embeddings
 * @created:   2026-06-24T22:15:00Z
 * @track:     f2a3b4c5-d6e7-8f9a-0b1c-2d3e4f5a6b7c
 * @version:   1.0.0
 * @security:  Server-Side (Encrypted at Rest / Row-Level Security)
 * =====================================================================
 *
 * Schema: Security & Fingerprinting
 * ==================================
 * Stores device fingerprints, behavioral embeddings, and security events
 * for the Hybrid WASM-AI Behavioral Biometric Engine.
 *
 * Key design decisions:
 *   - pgvector extension for 128-dim HNSW-indexed embeddings
 *   - Row-Level Security (RLS) on all tables
 *   - IP addresses stored ONLY as SHA-256 hashes (GDPR/CCPA compliant)
 *   - Immutable security_events log (append-only via RLS)
 *   - ON CONFLICT upsert for device_fingerprints (update last_seen + anomaly)
 *
 * Dependencies:
 *   - PostgreSQL 16+ with pgvector extension
 *   - Install: CREATE EXTENSION vector;
 *   - Install: CREATE EXTENSION "uuid-ossp";
 *
 * HNSW Index:
 *   Enables fast cosine similarity search for bot cluster detection.
 *   Query example:
 *     SELECT fp_hash, anomaly_score
 *     FROM device_fingerprints
 *     ORDER BY behavioral_embedding <=> '[0.1, 0.2, ...]'::vector
 *     LIMIT 10;
 */

-- =========================================================================
-- Extensions
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- Device Fingerprints Table
-- =========================================================================

CREATE TABLE IF NOT EXISTS device_fingerprints (
    -- Primary key
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Fingerprint hash (SHA-256 of hardware telemetry + server salt)
    fp_hash         VARCHAR(64) UNIQUE NOT NULL,

    -- Privacy-compliant IP storage (SHA-256 hash only — NEVER raw IP)
    ip_hash         VARCHAR(64) NOT NULL,

    -- Geolocation (country-level granularity for analytics)
    country_code    VARCHAR(3),
    city_name       VARCHAR(100),

    -- User agent hash for browser version tracking
    user_agent_hash VARCHAR(64),

    -- AI Analysis Results
    anomaly_score            FLOAT CHECK (anomaly_score BETWEEN 0.0 AND 1.0),
    hardware_consistency     FLOAT CHECK (hardware_consistency BETWEEN 0.0 AND 1.0),

    -- 128-dimensional behavioral embedding vector for similarity search
   -- Used to identify coordinated bot clusters via cosine similarity
    behavioral_embedding     vector(128),

    -- Risk classification
    risk_factors             TEXT[],  -- e.g., {'high_anomaly', 'vpn_detected', 'hw_mismatch'}
    is_flagged               BOOLEAN DEFAULT FALSE,
    flag_reason              TEXT,

    -- Session tracking
    session_count            INTEGER DEFAULT 1,
    last_session_id          VARCHAR(64),

    -- Timestamps
    first_seen               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen                TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Metadata
    metadata_json            JSONB DEFAULT '{}'::JSONB
);

-- =========================================================================
-- Security Events Log (Immutable — Append-Only)
-- =========================================================================

CREATE TABLE IF NOT EXISTS security_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Reference to device (nullable for anonymous events)
    fp_hash         VARCHAR(64) REFERENCES device_fingerprints(fp_hash) ON DELETE CASCADE,

    -- User reference (nullable for pre-auth events)
    user_id         UUID,

    -- Event classification
    event_type      VARCHAR(50) NOT NULL CHECK (
        event_type IN (
            'login', 'purchase', 'track_share',
            'anomaly_detected', 'bot_detected',
            'hw_mismatch', 'vpn_detected',
            'session_created', 'level_generated'
        )
    ),

    -- Risk scoring
    risk_score      FLOAT CHECK (risk_score BETWEEN 0.0 AND 1.0),

    -- Full event context
    metadata_json   JSONB DEFAULT '{}'::JSONB,

    -- Immutable timestamp
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Prevent updates to security events (immutable log)
    CONSTRAINT security_events_immutable CHECK (created_at = CURRENT_TIMESTAMP)
);

-- =========================================================================
-- Indexes
-- =========================================================================

-- Primary lookups
CREATE INDEX IF NOT EXISTS idx_fp_hash    ON device_fingerprints (fp_hash);
CREATE INDEX IF NOT EXISTS idx_ip_hash    ON device_fingerprints (ip_hash);
CREATE INDEX IF NOT EXISTS idx_flagged    ON device_fingerprints (is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_anomaly    ON device_fingerprints (anomaly_score DESC) WHERE anomaly_score > 0.5;
CREATE INDEX IF NOT EXISTS idx_last_seen  ON device_fingerprints (last_seen DESC);

-- Security event lookups
CREATE INDEX IF NOT EXISTS idx_events_fp       ON security_events (fp_hash);
CREATE INDEX IF NOT EXISTS idx_events_type     ON security_events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_created  ON security_events (created_at DESC);

-- HNSW Index for fast AI vector similarity search (finding bot clusters)
-- Uses cosine distance for behavioral embedding comparison
-- Higher ef_construction = better recall at cost of slower index build
CREATE INDEX IF NOT EXISTS idx_fp_embedding_hnsw
    ON device_fingerprints
    USING hnsw (behavioral_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- =========================================================================
-- Row-Level Security (RLS)
-- =========================================================================

-- Only internal admin services can read full fingerprint data
ALTER TABLE device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events     ENABLE ROW LEVEL SECURITY;

-- Admin service: full access to fingerprints
CREATE POLICY admin_select_fp ON device_fingerprints
    FOR SELECT
    USING (current_role = 'admin_service' OR current_role = 'superuser');

CREATE POLICY admin_insert_fp ON device_fingerprints
    FOR INSERT
    WITH CHECK (true);  -- Allow INSERT from API, restrict SELECT

CREATE POLICY admin_update_fp ON device_fingerprints
    FOR UPDATE
    USING (current_role = 'admin_service' OR current_role = 'superuser');

-- Security events: append-only (INSERT only, no UPDATE/DELETE)
CREATE POLICY api_insert_events ON security_events
    FOR INSERT
    WITH CHECK (true);  -- API can write events

CREATE POLICY admin_select_events ON security_events
    FOR SELECT
    USING (current_role = 'admin_service' OR current_role = 'superuser');

-- =========================================================================
-- Useful Queries
-- =========================================================================

/*
-- Find similar devices (potential bot cluster):
SELECT fp_hash, anomaly_score, 1 - (behavioral_embedding <=> '[0.1,...]'::vector) AS similarity
FROM device_fingerprints
WHERE is_flagged = FALSE
ORDER BY behavioral_embedding <=> '[0.1,...]'::vector
LIMIT 20;

-- Get high-risk devices seen in the last hour:
SELECT fp_hash, anomaly_score, risk_factors, last_seen
FROM device_fingerprints
WHERE anomaly_score > 0.7
  AND last_seen > NOW() - INTERVAL '1 hour'
ORDER BY anomaly_score DESC;

-- Track a returning device:
INSERT INTO device_fingerprints (fp_hash, ip_hash, country_code, anomaly_score, behavioral_embedding)
VALUES ($1, $2, $3, $4, $5::vector)
ON CONFLICT (fp_hash) DO UPDATE SET
    last_seen = NOW(),
    anomaly_score = $4,
    behavioral_embedding = $5::vector,
    session_count = device_fingerprints.session_count + 1;

-- Log a security event:
INSERT INTO security_events (fp_hash, event_type, risk_score, metadata_json)
VALUES ($1, 'anomaly_detected', 0.85, '{"reason": "high_anomaly", "risk_factors": ["bot_like_movement"]}');
*/
