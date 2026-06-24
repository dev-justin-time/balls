"""
=====================================================================
@domain:    backend_security
@concern:   IP Enrichment & Behavioral Anomaly Detection
@created:   2026-06-24T22:10:00Z
@track:     e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b
@version:   1.0.0
@security:  Server-Side (AI Analysis / Vector Storage)
=====================================================================

Security Engine
===============
Receives telemetry payloads from the client-side FingerprintCollector,
enriches them with IP geolocation data, runs AI-based behavioral anomaly
detection, and stores results in PostgreSQL with pgvector embeddings.

Data pipeline:
  1. Receive fp_hash + raw_behavior + hardware_profile from client
  2. Extract real client IP from X-Real-IP / X-Forwarded-For headers
  3. HASH the IP for privacy compliance (GDPR/CCPA — no raw IP stored)
  4. Enrich with GeoIP data (country, city, ASN)
  5. Run behavioral AI (scikit-learn IsolationForest) on mouse dynamics
  6. Generate 128-dim behavioral embedding vector
  7. Store in device_fingerprints table with HNSW index for vector search
  8. If anomaly_score > 0.7, trigger security event

In production, replace MockGeoIP with maxminddb-geo2 and replace the
mock AI with a trained IsolationForest model from scikit-learn.
"""

import hashlib
import json
import time
import math
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field

# [IMPORT LOCK] Retained for context stability.
# In production, uncomment these:
# import geoip2.database
# from sklearn.ensemble import IsolationForest
# import numpy as np


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class BehaviorSample:
    """A single behavioral data point from the client."""
    t: int              # Timestamp (ms)
    type: str           # 'mouse', 'click', 'release', 'scroll', 'key'
    v1: float           # Primary value (movementX, clientX, deltaX, keyCode)
    v2: float           # Secondary value (movementY, clientY, deltaY)


@dataclass
class TelemetryPayload:
    """Complete telemetry payload from the client FingerprintCollector."""
    fp_hash: str
    raw_behavior: List[Dict[str, Any]]
    session_id: str
    hardware_profile: Optional[Dict[str, Any]] = None


@dataclass
class EnrichedTelemetry:
    """Telemetry data enriched with server-side analysis results."""
    fp_hash: str
    ip_hash: str
    country: str
    city: str
    anomaly_score: float
    behavioral_embedding: List[float]  # 128-dim vector
    hardware_consistency: float        # 0.0-1.0, how well hardware matches known profile
    risk_factors: List[str]            # e.g., ['high_anomaly', 'vpn_detected', 'hw_mismatch']
    session_id: str


# ---------------------------------------------------------------------------
# GeoIP Service (Mock for development)
# ---------------------------------------------------------------------------

class GeoIPService:
    """IP geolocation enrichment service.

    In production, replace MockGeoIP with maxminddb-geo2 reader:
        reader = geoip2.database.Reader('/path/to/GeoLite2-City.mmdb')
        response = reader.city(ip)
        country = response.country.iso_code
        city = response.city.name
    """

    def __init__(self):
        self._reader = None
        self._initialized = False

    def initialize(self, db_path: Optional[str] = None):
        """Initialize the GeoIP database reader."""
        if db_path:
            # In production: self._reader = geoip2.database.Reader(db_path)
            pass
        self._initialized = True

    def lookup(self, ip: str) -> Tuple[str, str]:
        """Look up country and city for an IP address.

        Returns (country_code, city_name) — defaults to UNKNOWN on failure.
        """
        if not self._initialized:
            return "UNKNOWN", "UNKNOWN"

        try:
            if self._reader:
                # response = self._reader.city(ip)
                # return response.country.iso_code, response.city.name
                pass
            # Mock response for development
            return "US", "New York"
        except Exception:
            return "UNKNOWN", "UNKNOWN"


# ---------------------------------------------------------------------------
# Behavioral AI Engine
# ---------------------------------------------------------------------------

class BehavioralAI:
    """AI-driven behavioral anomaly detection engine.

    Analyzes mouse velocity, click intervals, and keystroke dynamics
    to distinguish human players from bots.

    Architecture:
        Feature extraction -> IsolationForest anomaly scoring ->
        Vector embedding generation -> Risk factor classification

    In production, replace the heuristic scorer with a trained
    IsolationForest model from scikit-learn:
        model = IsolationForest(contamination=0.05, random_state=42)
        model.fit(feature_matrix)
        anomaly_score = model.decision_function(sample_features)
    """

    def __init__(self):
        self._model = None
        self._trained = False

    def train(self, behavior_samples: List[BehaviorSample]):
        """Train the anomaly detection model on behavior data.

        In production, this loads a pre-trained model from disk:
            import joblib
            self._model = joblib.load('/opt/models/behavioral_isolation_forest.pkl')
        """
        self._trained = True

    def analyze(self, behavior_data: List[Dict]) -> Tuple[float, List[float], List[str]]:
        """Analyze behavioral data and return anomaly score + embedding.

        Args:
            behavior_data: List of raw behavior samples from the client

        Returns:
            Tuple of (anomaly_score, 128-dim embedding, list of risk factors)
        """
        samples = [BehaviorSample(**b) for b in behavior_data if isinstance(b, dict)]

        # Extract features
        features = self._extract_features(samples)

        # Score anomaly (0.0 = human, 1.0 = bot)
        anomaly_score = self._score_anomaly(features, samples)

        # Generate 128-dim behavioral embedding
        embedding = self._generate_embedding(features, samples)

        # Classify risk factors
        risk_factors = self._classify_risks(anomaly_score, features, samples)

        return anomaly_score, embedding, risk_factors

    def _extract_features(self, samples: List[BehaviorSample]) -> Dict[str, float]:
        """Extract meaningful features from raw behavior samples.

        Features:
            - mouse_velocity_mean: Average mouse movement speed
            - mouse_velocity_variance: Variance in mouse speed (bots are too uniform)
            - mouse_velocity_std: Standard deviation of velocity
            - click_interval_mean: Average time between clicks
            - click_interval_std: Standard deviation of click intervals
            - interaction_count: Total number of behavioral events
            - scroll_velocity_mean: Average scroll speed
            - key_interval_mean: Average time between keystrokes
            - human_likelihood_score: Composite heuristic score
        """
        if not samples:
            return {
                'mouse_velocity_mean': 0,
                'mouse_velocity_variance': 0,
                'mouse_velocity_std': 0,
                'click_interval_mean': 0,
                'click_interval_std': 0,
                'interaction_count': 0,
                'scroll_velocity_mean': 0,
                'key_interval_mean': 0,
                'human_likelihood_score': 0.5,
            }

        mouse_velocities = []
        click_intervals = []
        scroll_velocities = []
        key_intervals = []
        last_click_time = None
        last_key_time = None

        for sample in samples:
            if sample.type == 'mouse':
                velocity = math.sqrt(sample.v1 ** 2 + sample.v2 ** 2)
                mouse_velocities.append(velocity)

            elif sample.type == 'click':
                if last_click_time is not None:
                    interval = sample.t - last_click_time
                    if 0 < interval < 5000:  # Sanity: max 5s between clicks
                        click_intervals.append(interval)
                last_click_time = sample.t

            elif sample.type == 'scroll':
                scroll_velocities.append(abs(sample.v1) + abs(sample.v2))

            elif sample.type == 'key':
                if last_key_time is not None:
                    interval = sample.t - last_key_time
                    if 0 < interval < 2000:  # Sanity: max 2s between keys
                        key_intervals.append(interval)
                last_key_time = sample.t

        # Calculate features
        features = {
            'mouse_velocity_mean': self._safe_mean(mouse_velocities),
            'mouse_velocity_variance': self._safe_variance(mouse_velocities),
            'mouse_velocity_std': math.sqrt(self._safe_variance(mouse_velocities)),
            'click_interval_mean': self._safe_mean(click_intervals),
            'click_interval_std': math.sqrt(self._safe_variance(click_intervals)),
            'interaction_count': len(samples),
            'scroll_velocity_mean': self._safe_mean(scroll_velocities),
            'key_interval_mean': self._safe_mean(key_intervals),
        }

        # Composite human-likelihood score based on heuristic rules
        features['human_likelihood_score'] = self._compute_human_score(features, samples)

        return features

    def _compute_human_score(self, features: Dict[str, float],
                              samples: List[BehaviorSample]) -> float:
        """Compute a human-likelihood score from extracted features.

        Heuristic rules based on observed human vs bot behavior:
            - Humans have variable mouse velocity (variance > 1.0 and < 500.0)
            - Humans have varied click intervals (not perfectly uniform)
            - Humans move in curves, bots in straight lines
            - Humans make occasional scrolls, bots rarely scroll
        """
        score = 0.5  # Start neutral

        # 1. Mouse velocity variance (humans: 1.0 < var < 500.0, bots: too uniform or random)
        mv_var = features.get('mouse_velocity_variance', 0)
        if 1.0 < mv_var < 500.0:
            score += 0.15
        elif mv_var < 0.5 or mv_var > 1000.0:
            score -= 0.2

        # 2. Interaction diversity (humans use multiple interaction types)
        unique_types = len(set(s.type for s in samples))
        if unique_types >= 3:
            score += 0.1
        elif unique_types <= 1:
            score -= 0.15

        # 3. Click timing variability (humans have varied intervals)
        ci_std = features.get('click_interval_std', 0)
        if 10 < ci_std < 2000:
            score += 0.1

        # 4. Total interaction count (bots often flood or are very sparse)
        count = features.get('interaction_count', 0)
        if 5 <= count <= 200:
            score += 0.05
        elif count > 500:
            score -= 0.1  # Suspiciously chatty

        return max(0.0, min(1.0, score))

    def _score_anomaly(self, features: Dict[str, float],
                       samples: List[BehaviorSample]) -> float:
        """Score the anomaly level of the behavior sample.

        0.0 = almost certainly human
        1.0 = almost certainly bot

        Uses the human_likelihood_score inverted with some additional
        heuristics for specific bot patterns.
        """
        if len(samples) < 3:
            return 0.0  # Not enough data to judge

        # Base anomaly = invert of human score
        human_score = features.get('human_likelihood_score', 0.5)
        anomaly = 1.0 - human_score

        # Amplify anomaly for specific bot indicators
        mv_var = features.get('mouse_velocity_variance', 0)

        # Bots often have PERFECTLY uniform movement (var near 0)
        if mv_var < 0.5 and features.get('mouse_velocity_mean', 0) > 0:
            anomaly += 0.2

        # Or completely random noise (extremely high variance)
        if mv_var > 2000.0:
            anomaly += 0.15

        return max(0.0, min(1.0, anomaly))

    def _generate_embedding(self, features: Dict[str, float],
                            samples: List[BehaviorSample]) -> List[float]:
        """Generate a 128-dimensional behavioral embedding vector.

        The embedding encodes the behavioral pattern into a fixed-size
        vector that can be compared via cosine similarity to find
        similar behavior patterns (e.g., bot clusters operating together).

        In production, this would use a trained encoder model.
        For now, we generate from feature heuristics.
        """
        # Start with a deterministic seed based on features
        seed = int(hashlib.sha256(
            json.dumps(features, sort_keys=True).encode()
        ).hexdigest(), 16)

        rng_state = seed
        embedding = []

        for _ in range(128):
            # Simple deterministic pseudo-random number generator
            rng_state = (rng_state * 1103515245 + 12345) & 0x7fffffff
            val = (rng_state / 0x7fffffff) * 2.0 - 1.0  # Range: [-1, 1]

            # Bias the embedding with feature values for meaningful variation
            feature_idx = _ % len(features)
            feature_val = list(features.values())[feature_idx]
            val += (feature_val - 0.5) * 0.1

            embedding.append(round(val, 6))

        return embedding

    def _classify_risks(self, anomaly_score: float, features: Dict[str, float],
                        samples: List[BehaviorSample]) -> List[str]:
        """Classify risk factors based on the analysis results."""
        risks = []

        if anomaly_score > 0.7:
            risks.append('high_anomaly')

        if features.get('mouse_velocity_variance', 0) < 0.5 and \
           features.get('interaction_count', 0) > 10:
            risks.append('suspiciously_uniform_movement')

        if features.get('interaction_count', 0) > 300:
            risks.append('excessive_interaction_rate')

        if features.get('human_likelihood_score', 0.5) < 0.3:
            risks.append('low_human_score')

        return risks

    @staticmethod
    def _safe_mean(values: List[float]) -> float:
        """Compute mean, returning 0 for empty lists."""
        if not values:
            return 0.0
        return sum(values) / len(values)

    @staticmethod
    def _safe_variance(values: List[float]) -> float:
        """Compute variance, returning 0 for lists with < 2 elements."""
        if len(values) < 2:
            return 0.0
        mean = sum(values) / len(values)
        return sum((v - mean) ** 2 for v in values) / (len(values) - 1)


# ---------------------------------------------------------------------------
# Security Engine (Facade)
# ---------------------------------------------------------------------------

class SecurityEngine:
    """Main security engine that orchestrates the entire pipeline.

    Usage:
        engine = SecurityEngine()
        result = await engine.process_telemetry(
            fp_hash='abc123...',
            behavior=[...],
            client_ip='1.2.3.4',
            hardware_profile={...}
        )
    """

    def __init__(self):
        self.geo = GeoIPService()
        self.ai = BehavioralAI()
        self._initialized = False

    def initialize(self, geoip_db_path: Optional[str] = None):
        """Initialize the security engine with optional GeoIP database."""
        self.geo.initialize(geoip_db_path)
        self._initialized = True

    async def process_telemetry(
        self,
        fp_hash: str,
        behavior: List[Dict],
        client_ip: str,
        session_id: str,
        hardware_profile: Optional[Dict] = None,
    ) -> EnrichedTelemetry:
        """Process a telemetry payload through the full pipeline.

        Args:
            fp_hash: SHA-256 hash of the hardware telemetry
            behavior: Raw behavioral samples from the client
            client_ip: Real client IP address (from X-Real-IP header)
            session_id: Client session identifier
            hardware_profile: Hardware telemetry snapshot (optional)

        Returns:
            EnrichedTelemetry with analysis results
        """
        if not self._initialized:
            self.initialize()

        # 1. Hash IP for privacy compliance (GDPR/CCPA)
        ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()

        # 2. Enrich with GeoIP data
        country, city = self.geo.lookup(client_ip)

        # 3. Run AI behavioral analysis
        anomaly_score, embedding, risk_factors = self.ai.analyze(behavior)

        # 4. Hardware consistency check (if we have a profile)
        hardware_consistency = 1.0
        if hardware_profile:
            # In production, compare against stored profile for this fp_hash
            hardware_consistency = 0.85  # Mock: 85% consistent

        # 5. Check for VPN/proxy (mock — in production, use IP quality API)
        # vpn_detected = check_vpn(client_ip)
        # if vpn_detected:
        #     risk_factors.append('vpn_detected')

        return EnrichedTelemetry(
            fp_hash=fp_hash,
            ip_hash=ip_hash,
            country=country,
            city=city,
            anomaly_score=anomaly_score,
            behavioral_embedding=embedding,
            hardware_consistency=hardware_consistency,
            risk_factors=risk_factors,
            session_id=session_id,
        )

    def format_embedding_for_db(self, embedding: List[float]) -> str:
        """Format a 128-dim embedding vector for PostgreSQL pgvector INSERT.

        pgvector expects format: '[0.1, 0.2, 0.3, ...]'
        """
        return '[' + ','.join(str(v) for v in embedding) + ']'


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

security_engine = SecurityEngine()
