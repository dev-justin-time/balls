"""
=====================================================================
@domain:    ai_training
@concern:   Training-Data Loader for Offline-Trained Wireframe AI
@created:   2026-06-26
@version:   1.0.0
@security:  Server-Side (read-only JSON, validated once at startup)
=====================================================================

Searches first for `sample_sketches.json` shipped with the package.
Falls back to a tiny inline schema-valid 1-sample corpus if the file
is missing (so dev sandboxes without `python_server/training_data/`
on the deployment still get a non-empty dataset for `_run_trained_*`
paths to consume).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

# Resolve relative to this file so the loader works regardless of cwd
_THIS_DIR = Path(__file__).resolve().parent
TRAINING_DATA_PATH = _THIS_DIR / "sample_sketches.json"

# Minimal sanity-checked fallback used when sample_sketches.json is missing.
# Kept tiny on purpose — its job is to satisfy `_run_trained_topology()` prod
# calls in dev sandboxes, not to be a substitute for the real corpus.
_INLINE_FALLBACK = {
    "schema_version": 1,
    "samples": [
        {
            "id": "triangle_fallback",
            "name": "Triangle (fallback)",
            "description": "Single triangle shipped when sample_sketches.json is absent.",
            "image_size": [120, 120],
            "nodes": [[60, 12], [100, 95], [20, 95]],
            "edges": [[0, 1], [1, 2], [2, 0]],
        }
    ],
    "priors": {
        "expected_node_count_min": 3,
        "expected_node_count_max": 6,
        "typical_edge_length_px": 80.0,
        "snap_threshold_recommendation": 1.5,
        "min_line_segment_px": 6.0,
    },
}


def _validate_sample(sample: Dict[str, Any]) -> Optional[str]:
    """
    Return None if OK, else a human-readable error string.

    NOTE: Schema v1 samples MAY carry per-sample `expected_nodes` /
    `expected_edges` (int) documentation fields. This validator treats
    them as opaque metadata — it does NOT require them and does NOT
    enforce that `expected_nodes == len(nodes)`. Consumers are expected
    to read these fields directly from the sample dict (see
    `load_training_samples`) but treat them as doc-strings, not
    authoritative constraints. The cleaner (`parse_wireframe_topology`
    -> `_cleanup_topology`) produces the FINAL topology; the
    documented `expected_*` counts represent the AUTHORED topology
    that the cleaner is *aiming* to reproduce.
    """
    if not isinstance(sample, dict):
        return f"sample is not a dict (got {type(sample).__name__})"
    if "id" not in sample or not isinstance(sample["id"], str):
        return "sample missing string 'id'"
    nodes = sample.get("nodes")
    edges = sample.get("edges")
    if not isinstance(nodes, list) or not nodes:
        return f"sample {sample.get('id')!r} has no 'nodes' list"
    if not all(isinstance(p, list) and len(p) == 2 for p in nodes):
        return f"sample {sample.get('id')!r} nodes must be [[x,y], ...]"
    if not isinstance(edges, list):
        return f"sample {sample.get('id')!r} has no 'edges' list"
    n = len(nodes)
    for e in edges:
        if not (isinstance(e, list) and len(e) == 2):
            return f"sample {sample.get('id')!r} edge not [a,b]"
        if not all(isinstance(i, int) and 0 <= i < n for i in e):
            return f"sample {sample.get('id')!r} edge references out-of-range vertex"
    return None


def load_training_samples(path: Optional[os.PathLike] = None) -> List[Dict[str, Any]]:
    """
    Return the list of validated training samples.

    Reads from `path` if supplied, else `TRAINING_DATA_PATH`. Falls back
    to the inlined 1-sample corpus when neither is available so callers
    can rely on a non-empty result.
    """
    chosen = Path(path) if path is not None else TRAINING_DATA_PATH
    try:
        with open(chosen, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        data = _INLINE_FALLBACK

    samples = data.get("samples", [])
    valid: List[Dict[str, Any]] = []
    for s in samples:
        if _validate_sample(s) is None:
            valid.append(s)
    return valid


def get_sample_by_id(sample_id: str, path: Optional[os.PathLike] = None) -> Optional[Dict[str, Any]]:
    """Return one sample by id, or None if not present."""
    for s in load_training_samples(path):
        if s.get("id") == sample_id:
            return s
    return None


def list_sample_ids(path: Optional[os.PathLike] = None) -> Dict[str, str]:
    """Return `{id: human_readable_name}` for every sample in the corpus."""
    return {s["id"]: s.get("name", s["id"]) for s in load_training_samples(path)}


def compute_topology_priors(path: Optional[os.PathLike] = None) -> Dict[str, Any]:
    """
    Compute (or fall back to) the priors used by `_run_trained_topology`.

    When the corpus on disk carries an explicit `priors` block, prefer that —
    it's how a maintainer can tune snap defaults without rewriting data.
    Otherwise we infer from the loaded samples (median edge length, average
    node degree, etc.) so the function is never called without a usable dict.
    """
    # Try the file first so the explicit block wins.
    try:
        with open(Path(path) if path is not None else TRAINING_DATA_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict) and isinstance(data.get("priors"), dict):
            return dict(data["priors"])
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        pass

    samples = load_training_samples(path)
    if not samples:
        # Last-ditch fallback to the inlined priors.
        return dict(_INLINE_FALLBACK["priors"])

    edge_lengths: List[float] = []
    node_degrees: List[int] = []
    for s in samples:
        nodes = s.get("nodes", [])
        edges = s.get("edges", [])
        deg = [0] * len(nodes)
        for a, b in edges:
            (xa, ya), (xb, yb) = nodes[a], nodes[b]
            edge_lengths.append(((xb - xa) ** 2 + (yb - ya) ** 2) ** 0.5)
            deg[a] += 1
            deg[b] += 1
        node_degrees.extend(deg)

    edge_lengths.sort()
    median_len = edge_lengths[len(edge_lengths) // 2] if edge_lengths else 80.0

    return {
        "expected_node_count_min": min(len(s["nodes"]) for s in samples),
        "expected_node_count_max": max(len(s["nodes"]) for s in samples),
        "typical_edge_length_px": float(median_len),
        "snap_threshold_recommendation": max(1.5, median_len * 0.02),
        "min_line_segment_px": 6.0,
        "average_node_degree": (
            float(sum(node_degrees)) / len(node_degrees) if node_degrees else 2.0
        ),
    }
