"""
=====================================================================
@domain:    ai_training
@concern:   Wireframe-AI Training Data Subpackage
@created:   2026-06-26
@version:   1.0.0
@security:  Server-Side (read-only data + ML priors)
=====================================================================

Public surface:
    from python_server.training_data import (
        load_training_samples,
        get_sample_by_id,
        list_sample_ids,
        compute_topology_priors,
    )

`sample_sketches.json` ships a small curated set of canonical 2D
wireframe shapes (square / triangle / pyramid / T-junction / etc.).
In production, Git LFS / an external bucket would hold the real
HAWP-resized 100k image corpus; the JSON format here mirrors that
contract so swapping to a remote loader is one-line-per-call.
"""

from .loader import (
    load_training_samples,
    get_sample_by_id,
    list_sample_ids,
    compute_topology_priors,
    TRAINING_DATA_PATH,
)

__all__ = [
    "load_training_samples",
    "get_sample_by_id",
    "list_sample_ids",
    "compute_topology_priors",
    "TRAINING_DATA_PATH",
]
