"""Endpoints del motor curado: evaluacion de interacciones, alertas alimentarias,
recomendacion por guia, y exposicion de las reglas versionadas."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from .. import engine

router = APIRouter(prefix="/api", tags=["engine"])


class CartDrug(BaseModel):
    name: str
    inn: str | None = None
    atc: str | None = None
    tags: list[str] = Field(default_factory=list)


class EvalRequest(BaseModel):
    cart: list[CartDrug]


@router.post("/interactions")
def interactions(req: EvalRequest):
    cart = [d.model_dump() for d in req.cart]
    result = engine.evaluate(cart)
    result["food_alerts"] = engine.food_alerts(cart)
    return result


@router.get("/rules")
def rules():
    """Reglas curadas con metadatos de version. Esto es la IP del producto."""
    return engine.rules_payload()


@router.get("/recommend")
def recommend(q: str):
    rec = engine.recommend(q)
    if not rec:
        return {"query": q, "match": None}
    return {"query": q, "match": rec}


@router.post("/reload")
def reload_data():
    """Recarga los JSON curados sin reiniciar el proceso (para el flujo de curaduria)."""
    try:
        engine.reload()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo recargar: {e}")
    return {"reloaded": True, "drugs_version": engine.drugs_version(), "rules_version": engine.rules_payload().get("version")}
