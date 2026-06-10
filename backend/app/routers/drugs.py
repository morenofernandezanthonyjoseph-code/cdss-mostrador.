"""Endpoints del diccionario de farmacos: busqueda fonetica y catalogo."""
from fastapi import APIRouter, Query
from .. import engine

router = APIRouter(prefix="/api/drugs", tags=["drugs"])


@router.get("/search")
def search(q: str = Query(..., min_length=1, description="Texto, tolera errores foneticos")):
    from ..phonetic import search as phon_search
    results = phon_search(q, engine.drugs())
    return {"query": q, "results": results}


@router.get("")
def catalog():
    return {"version": engine.drugs_version(), "drugs": engine.drugs()}
