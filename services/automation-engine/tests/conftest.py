"""Runs before any test module is imported. Keeps tests on a throwaway database and off live email."""

import os
import tempfile

_workdir = tempfile.mkdtemp(prefix="engine-tests-")
os.environ["TESTING"] = "1"  # no live SMTP, no live inbox
os.environ["ENGINE_DB_PATH"] = os.path.join(_workdir, "engine.db")
os.environ["ENGINE_DATA_DIR"] = os.path.join(_workdir, "data")
os.environ.pop("ENGINE_API_KEY", None)
