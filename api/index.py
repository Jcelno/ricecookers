"""Vercel entrypoint: serves RADIUM's FastAPI backend as one Python function.

vercel.json rewrites every /api/* request here; the app's own routes keep their /api prefix.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app import app  # noqa: E402,F401
