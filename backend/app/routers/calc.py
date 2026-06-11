"""Endpoints de calculo. La aritmetica es exacta; los datos mg/kg vienen de las
tablas curadas (responsabilidad del usuario). Cada respuesta lleva su fuente."""
from fastapi import APIRouter, Query
from .. import engine

router = APIRouter(prefix="/api/calc", tags=["calc"])


@router.get("/pediatric")
def pediatric(inn: str, weight: float = Query(..., gt=0, le=150), age_months: float | None = None):
    res = engine.pediatric_dose(inn, weight, age_months)
    if not res:
        return {"available": False, "msg": "Sin dosis curada para ese farmaco. Agregala a pediatric_doses.json desde tu fuente oficial."}
    return {"available": True, "result": res, "disclaimer": "VERIFICAR contra fuente oficial. Calculo orientativo, no sustituye el criterio profesional."}


@router.get("/pediatric/available")
def pediatric_available():
    return {"drugs": engine.pediatric_available()}


@router.get("/crcl")
def crcl(age: float = Query(..., gt=0, le=120), weight: float = Query(..., gt=0, le=300),
         scr: float = Query(..., gt=0, description="Creatinina serica en mg/dL"),
         sex: str = Query("m", pattern="^(m|f)$")):
    res = engine.crcl_cockcroft_gault(age, weight, scr, female=(sex == "f"))
    if not res:
        return {"ok": False}
    return {"ok": True, "result": res}


@router.get("/organ/{inn}")
def organ(inn: str):
    return engine.organ_notes(inn)
