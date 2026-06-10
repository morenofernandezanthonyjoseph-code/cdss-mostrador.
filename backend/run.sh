#!/usr/bin/env bash
# Levanta el backend en http://localhost:8000  (docs interactivos en /docs)
set -e
python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install -q -r requirements.txt
uvicorn app.main:app --reload --port 8000
