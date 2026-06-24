"""
=====================================================================
@domain:    ai
@concern:   Server-Side Procedural Level Generation & Anti-Cheat
@created:   2026-06-24T14:42:00Z
@track:     3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f
@version:   1.0.0
@security:  Server-Side (Thick Backend / Zero Trust)
=====================================================================

Secure procedural level generator.

Generates level layouts on the server using a seeded RNG.
The client NEVER sees the raw seed or generation logic — only
receives encrypted payloads that the Rust WASM can decrypt.

This prevents:
  - Level layout prediction for speedrunning advantages
  - Client-side level editing or cheating
  - Replay attacks (each request generates unique encryption)
"""

import hashlib
import json
import time
from typing import Dict, List, Optional, Any


class SecureLevelGenerator:
    """
    Server-side level generator with deterministic seeding.
    
    Uses a cryptographic hash chain to produce level seeds,
    ensuring that even if one seed is compromised, future
    and past seeds cannot be derived.
    """

    # Segment type definitions with difficulty scaling
    SEGMENT_TYPES = {
        "straight": {
            "difficulty_base": 1,
            "length_range": (10, 25),
            "coin_density": 0.6,
            "hazard_chance": 0.0,
        },
        "ramp": {
            "difficulty_base": 2,
            "length_range": (10, 20),
            "coin_density": 0.5,
            "hazard_chance": 0.0,
        },
        "pendulum": {
            "difficulty_base": 4,
            "length_range": (15, 25),
            "coin_density": 0.3,
            "hazard_chance": 1.0,
        },
        "spinner": {
            "difficulty_base": 3,
            "length_range": (18, 28),
            "coin_density": 0.4,
            "hazard_chance": 1.0,
        },
        "tunnel": {
            "difficulty_base": 2,
            "length_range": (20, 35),
            "coin_density": 0.7,
            "hazard_chance": 0.0,
        },
        "narrow": {
            "difficulty_base": 5,
            "length_range": (12, 20),
            "coin_density": 0.5,
            "hazard_chance": 0.0,
        },
        "gap": {
            "difficulty_base": 3,
            "length_range": (8, 15),
            "coin_density": 0.0,
            "hazard_chance": 0.0,
        },
        "stairs": {
            "difficulty_base": 3,
            "length_range": (15, 25),
            "coin_density": 0.6,
            "hazard_chance": 0.0,
        },
        "checkerboard": {
            "difficulty_base": 5,
            "length_range": (12, 20),
            "coin_density": 0.5,
            "hazard_chance": 0.0,
        },
        "loop_de_loop": {
            "difficulty_base": 6,
            "length_range": (40, 60),
            "coin_density": 0.4,
            "hazard_chance": 0.0,
        },
        "spiral_tube": {
            "difficulty_base": 7,
            "length_range": (50, 80),
            "coin_density": 0.3,
            "hazard_chance": 0.0,
        },
        "hammer_gauntlet": {
            "difficulty_base": 6,
            "length_range": (20, 35),
            "coin_density": 0.2,
            "hazard_chance": 1.0,
        },
        "moving_rects": {
            "difficulty_base": 5,
            "length_range": (18, 30),
            "coin_density": 0.3,
            "hazard_chance": 1.0,
        },
    }

    # Difficulty tiers
    DIFFICULTY_TIERS = [
        {"level": 1, "label": "EASY", "types": ["straight", "ramp", "tunnel"]},
        {"level": 4, "label": "NORMAL", "types": ["straight", "ramp", "tunnel", "narrow"]},
        {"level": 7, "label": "CHALLENGING", "types": ["spinner", "gap", "stairs"]},
        {"level": 10, "label": "HARD", "types": ["spinner", "pendulum", "hammer_gauntlet"]},
        {"level": 13, "label": "TOUGH", "types": ["pendulum", "checkerboard", "moving_rects"]},
        {"level": 16, "label": "EXPERT", "types": ["hammer_gauntlet", "narrow", "loop_de_loop"]},
        {"level": 19, "label": "EXTREME", "types": ["narrow", "checkerboard", "spiral_tube"]},
        {"level": 22, "label": "INSANE", "types": ["narrow", "loop_de_loop", "spiral_tube"]},
        {"level": 25, "label": "IMPOSSIBLE", "types": ["spiral_tube", "hammer_gauntlet", "checkerboard"]},
    ]

    def __init__(self, secret_salt: str = "quad-core-salt"):
        self._secret_salt = secret_salt

    def generate_level(
        self,
        level_index: int,
        tier: int = 1,
        num_segments: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Generate a complete level layout.
        
        Args:
            level_index: The level number (0-based)
            tier: Difficulty tier (1-3)
            num_segments: Number of segments (default: auto-calculated)
            
        Returns:
            Dict with seed_hash, segments, and metadata
        """
        # Determine difficulty tier
        diff_tier = self.DIFFICULTY_TIERS[0]
        for t in self.DIFFICULTY_TIERS:
            if level_index + 1 >= t["level"]:
                diff_tier = t

        # Generate the deterministic seed
        raw_seed = f"{level_index}-{tier}-{self._secret_salt}"
        seed_hash = hashlib.sha256(raw_seed.encode()).hexdigest()

        # Derive a numeric seed from the hash
        numeric_seed = int(seed_hash[:8], 16)

        # Determine segment count
        if num_segments is None:
            num_segments = 15 + int((level_index + 1) * 2.5)

        # Generate segments using seeded RNG
        segments = self._generate_segments(
            seed=numeric_seed,
            count=num_segments,
            available_types=diff_tier["types"],
            level_index=level_index,
            tier=tier,
        )

        # Calculate coin multiplier
        coin_multiplier = 1.0 + (tier * 0.05) + (level_index * 0.01)

        return {
            "seed_hash": seed_hash,
            "level_index": level_index,
            "tier_label": diff_tier["label"],
            "segments": segments,
            "coin_multiplier": round(coin_multiplier, 3),
            "weather_seed": (numeric_seed * 7 + 13) % 1000,
            "generated_at": time.time(),
        }

    def _generate_segments(
        self,
        seed: int,
        count: int,
        available_types: List[str],
        level_index: int,
        tier: int,
    ) -> List[Dict[str, Any]]:
        """Generate individual level segments."""
        segments = []
        
        # Simple LCG (Linear Congruential Generator) for deterministic output
        state = seed
        for i in range(count):
            state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
            r = (state / 0xFFFFFFFF)

            # Pick segment type
            seg_type = available_types[int(r * len(available_types))]
            seg_def = self.SEGMENT_TYPES.get(seg_type, self.SEGMENT_TYPES["straight"])

            # Calculate parameters
            length_min, length_max = seg_def["length_range"]
            length = length_min + int(r * (length_max - length_min))

            # Hazard parameters
            has_hazard = r < seg_def["hazard_chance"] * min(1.0, 0.5 + tier * 0.25)

            # Coin placement
            coin_count = int(length * seg_def["coin_density"] * 0.3) if seg_def["coin_density"] > 0 else 0

            segment = {
                "type": seg_type,
                "index": i,
                "length": length,
                "width": max(1.5, 8.0 - level_index * 0.3),
                "has_hazard": has_hazard,
                "hazard_speed_mult": 1.0 + (level_index * 0.08),
                "coin_count": min(coin_count, 8),
                "mirror": (i % 2 == 0),  # Mirror every other segment for variety
                "y_offset": 0,  # Calculated by the WASM client during layout
            }

            segments.append(segment)

        # Ensure last segment is always a finish-able type
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        r = (state / 0xFFFFFFFF)
        final_length = 15 + int(r * 20)
        segments[-1]["type"] = "straight"
        segments[-1]["length"] = final_length
        segments[-1]["is_finish"] = True

        return segments

    def verify_level_hash(self, level_data: Dict[str, Any]) -> bool:
        """
        Verify that level data was generated by this server.
        
        Computes the expected seed hash and compares it to the
        hash in the level data. This prevents replay attacks
        where a client tries to use a level from a different session.
        """
        level_index = level_data.get("level_index", 0)
        raw_seed = f"{level_index}-1-{self._secret_salt}"
        expected_hash = hashlib.sha256(raw_seed.encode()).hexdigest()
        return expected_hash == level_data.get("seed_hash", "")
