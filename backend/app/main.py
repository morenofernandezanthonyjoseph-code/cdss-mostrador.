"""CDSS de Mostrador - API.

Backend que unifica fuentes oficiales y la curaduria propia:
  - openFDA (CC0)  -> ficha oficial por farmaco
  - CIMA (AEMPS)   -> ficha tecnica en espanol (proxy, sin CORS)
  - RxNorm (NLM)   -> normalizacion nombre -> RxCUI
  - Motor de reglas curado -> alertas de interaccion por clase (IP del producto)

NO se usa la API de interacciones de RxNav (descontinuada 02-ene-2024).
NO se incluyen datos de fuentes con licencia no comercial (CredibleMeds, DrugBank
no comercial), incompatibles con el plan de suscripcion.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config, cache, engine
from .routers import drugs, engine_routes, sources

app = FastAPI(
    title="CDSS de Mostrador - API",
    version="1.0.0",
    description="Soporte a la decision farmaceutica. Fuentes oficiales + curaduria propia.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(drugs.router)
app.include_router(engine_routes.router)
app.include_router(sources.router)


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "drugs_version": engine.drugs_version(),
        "rules_version": engine.rules_payload().get("version"),
        "cache": cache.stats(),
    }


@app.get("/", tags=["meta"])
def root():
    return {
        "service": "CDSS de Mostrador",
        "docs": "/docs",
        "sources": {
            "openFDA": "CC0 - uso comercial permitido",
            "CIMA": "AEMPS - revisar condiciones de reutilizacion",
            "RxNorm": "NLM - normalizacion",
            "reglas": "curaduria propia (IP)",
        },
        "no_usa": "API de interacciones de RxNav (descontinuada 2024); fuentes no comerciales",
    }
