"""Configuracion central. Lee variables de entorno con valores por defecto sensatos."""
import os
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

# Origenes permitidos para CORS (frontend). Separar por comas en la env var.
CORS_ORIGINS = os.getenv(
    "CDSS_CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
).split(",")

# TTL de cache en segundos para respuestas de APIs externas.
CACHE_TTL = int(os.getenv("CDSS_CACHE_TTL", "86400"))  # 24 h

# Timeout para llamadas salientes (openFDA, CIMA, RxNorm).
HTTP_TIMEOUT = float(os.getenv("CDSS_HTTP_TIMEOUT", "6.0"))

# Endpoints oficiales.
OPENFDA_LABEL = "https://api.fda.gov/drug/label.json"
CIMA_MEDS = "https://cima.aemps.es/cima/rest/medicamentos"
RXNORM_APPROX = "https://rxnav.nlm.nih.gov/REST/approximateTerm.json"

# Clave openFDA opcional (sube el rate limit). Sin clave funciona igual.
OPENFDA_KEY = os.getenv("CDSS_OPENFDA_KEY", "").strip()
