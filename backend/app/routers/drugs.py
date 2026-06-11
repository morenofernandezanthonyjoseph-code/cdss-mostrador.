"""Endpoints del diccionario de farmacos: busqueda fonetica y catalogo."""
from fastapi import APIRouter, Query
from .. import engine

router = APIRouter(prefix="/api/drugs", tags=["drugs"])


@router.get("/search")
def search(q: str = Query(..., min_length=1, description="Texto, tolera errores foneticos")):
    results = engine.search_drugs(q)
    return {"query": q, "results": results}


@router.get("")
def catalog():
    return {"version": engine.drugs_version(), "drugs": engine.drugs()}


@router.get("/similar/{inn}")
def similar(inn: str):
    """Capa 2 - Parte A: farmacos de la misma clase terapeutica (ATC nivel 3)."""
    return engine.same_class(inn)
