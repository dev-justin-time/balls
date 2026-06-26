# Package marker for `python_server`.
# Without this file, `from python_server.services.X import ...` fails with
# `ModuleNotFoundError: No module named 'python_server'`. Created when the
# embedded services (`wireframe_ai.py`, `security_engine.py`,
# `ghost_verifier.py`) are present but their `python_server.services.*`
# import paths don't resolve.
