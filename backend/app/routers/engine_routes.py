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
    result = engine.evaluate(cart)  # incluye verdict, alerts, drug_flags
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
    """Recarga los JSON curados y las fuentes externas sin reiniciar el proceso."""
    try:
        engine.reload()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo recargar: {e}")
    return {"reloaded": True, "drugs_version": engine.drugs_version(), "rules_version": engine.rules_payload().get("version")}


@router.get("/sources")
def sources_status():
    """Estado de las fuentes externas opcionales (cargadas o no)."""
    from .. import external
    return external.status()


@router.get("/attributions")
def attributions():
    """Creditos obligatorios por licencia. Mostrar cuando la fuente este cargada."""
    from .. import external
    st = external.status()
    creds = [
        {"source": "openFDA", "text": "Datos de etiquetas de la U.S. FDA (dominio publico, CC0). openFDA no avala este producto.", "always": True},
        {"source": "RxNorm / RxClass", "text": "U.S. National Library of Medicine (NLM).", "always": True},
    ]
    if st["credible_meds"]["loaded"]:
        creds.append({"source": "CredibleMeds", "text": "Listas de riesgo de QT/Torsades de CredibleMeds (AZCERT). Uso no comercial bajo su licencia.", "always": False})
    if st["ddinter"]["loaded"]:
        creds.append({"source": "DDInter 2.0", "text": "Interacciones de DDInter 2.0 (uso no comercial). Citar: Tian et al., Nucleic Acids Research.", "always": False})
    if st["drugbank"]["loaded"]:
        creds.append({"source": "DrugBank", "text": "Vocabulario de DrugBank. Datos academicos CC-BY-NC; Open Data CC0.", "always": False})
    return {"attributions": creds}
