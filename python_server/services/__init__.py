# Subpackage marker for `python_server.services`.
# Without this file, `from python_server.services.X import ...` fails with
# `ModuleNotFoundError: No module named 'python_server.services'` even
# though service files exist on disk.
#
# Services in this directory:
#   - wireframe_ai.py      (OpenCV HAWP fallback + spatial-hash topology)
#   - security_engine.py   (GeoIP + behavioral AI anomaly detection)
#   - ghost_verifier.py    (SHA-256 chain validator for offline runs)
#   - level_gen_ai.py      (deterministic seeded level generator)
#   - generative_ai.py     (Stable Diffusion + ControlNet pipeline)
#   - pdf_parser.py        (multi-page table extraction + dimension parsing)
