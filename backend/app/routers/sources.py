"""Proxy a fuentes oficiales con cache y manejo de errores explicito.
El backend existe para esto: consumir CIMA (sin CORS limpio), cachear, y unificar
la procedencia. openFDA es CC0 (uso comercial permitido). RxNorm es de NLM."""
import httpx
from fastapi import APIRouter, HTTPException
from .. import config, cache

router = APIRouter(prefix="/api", tags=["sources"])


async def _get_json(url: str, params: dict, cache_key: str) -> dict:
    cached = cache.get(cache_key)
    if cached is not None:
        return {"_cached": True, **cached}
    try:
        async with httpx.AsyncClient(timeout=config.HTTP_TIMEOUT) as client:
            r = await client.get(url, params=params)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="La fuente oficial no respondio a tiempo.")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Error de red hacia la fuente oficial: {e}")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Sin resultados en la fuente oficial.")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"La fuente respondio {r.status_code}.")
    data = r.json()
    cache.set(cache_key, data, config.CACHE_TTL)
    return {"_cached": False, **data}


def _join(field) -> str | None:
    if isinstance(field, list):
        return "\n\n".join(field)
    return field or None


@router.get("/label/{inn}")
async def openfda_label(inn: str):
    """Ficha oficial FDA por principio activo (INN en ingles). Fuente: openFDA, CC0."""
    params = {"search": f'openfda.generic_name:"{inn}"', "limit": 1}
    if config.OPENFDA_KEY:
        params["api_key"] = config.OPENFDA_KEY
    raw = await _get_json(config.OPENFDA_LABEL, params, f"openfda:{inn.lower()}")
    results = raw.get("results") or []
    if not results:
        raise HTTPException(status_code=404, detail="Sin ficha en openFDA para este principio activo.")
    res = results[0]
    openfda = res.get("openfda", {})
    return {
        "source": "openFDA",
        "license": "CC0 (dominio publico, uso comercial permitido)",
        "cached": raw.get("_cached", False),
        "inn": inn,
        "data": {
            "interactions": _join(res.get("drug_interactions")),
            "indications": _join(res.get("indications_and_usage")),
            "dosage": _join(res.get("dosage_and_administration")),
            "specific_populations": _join(res.get("use_in_specific_populations")),
            "pediatric": _join(res.get("pediatric_use")),
            "geriatric": _join(res.get("geriatric_use")),
            "boxed": _join(res.get("boxed_warning")),
            "warnings": _join(res.get("warnings_and_cautions")) or _join(res.get("warnings")),
            "contraindications": _join(res.get("contraindications")),
            "pharm_class": ", ".join(openfda.get("pharm_class_epc", []) or openfda.get("pharm_class_moa", [])) or None,
            "rxcui": (openfda.get("rxcui") or [None])[0],
            "brand": (openfda.get("brand_name") or [None])[0],
        },
    }


@router.get("/cima/{name}")
async def cima_med(name: str):
    """Ficha tecnica espanola por nombre. Fuente: CIMA (AEMPS).
    Requiere proxy de backend porque CIMA no envia cabeceras CORS limpias.
    NOTA: revisar las condiciones de reutilizacion de CIMA antes de uso comercial."""
    raw = await _get_json(config.CIMA_MEDS, {"nombre": name}, f"cima:{name.lower()}")
    meds = raw.get("resultados") or []
    if not meds:
        raise HTTPException(status_code=404, detail="Sin coincidencias en CIMA.")
    out = []
    for m in meds[:5]:
        out.append({
            "nregistro": m.get("nregistro"),
            "nombre": m.get("nombre"),
            "labtitular": m.get("labtitular"),
            "comercializado": m.get("comerc"),
            "receta": m.get("receta"),
            # enlaces a la ficha tecnica / prospecto cuando existen
            "docs": [{"tipo": d.get("tipo"), "url": d.get("urlHtml") or d.get("url")} for d in (m.get("docs") or [])],
        })
    return {"source": "CIMA (AEMPS)", "cached": raw.get("_cached", False), "query": name, "resultados": out}


@router.get("/rxnorm/{name}")
async def rxnorm_approx(name: str):
    """Normalizacion nombre -> RxCUI. Fuente: RxNorm getApproximateMatch (NLM, activa)."""
    raw = await _get_json(config.RXNORM_APPROX, {"term": name, "maxEntries": 1}, f"rxnorm:{name.lower()}")
    cand = (((raw.get("approximateGroup") or {}).get("candidate")) or [{}])[0]
    return {"source": "RxNorm (NLM)", "cached": raw.get("_cached", False), "query": name, "rxcui": cand.get("rxcui")}
