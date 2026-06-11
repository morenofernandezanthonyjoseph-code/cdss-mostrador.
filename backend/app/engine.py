"""Carga de datos curados (diccionario, reglas, indicaciones) y motor de evaluacion
de interacciones por pares de etiquetas. Los datos viven en JSON externos y se
recargan con reload() para permitir curaduria sin reiniciar."""
import json
from . import config
from . import external

RANK = {"red": 3, "amber": 2, "green": 1}

_drugs: dict = {}
_rules: dict = {}
_indications: dict = {}
_pediatric: dict = {}
_organ: dict = {}
_anticholinergic: dict = {}


def _load_json(name: str) -> dict:
    with open(config.DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def reload() -> None:
    global _drugs, _rules, _indications, _pediatric, _organ, _anticholinergic
    _drugs = _load_json("drugs.json")
    _rules = _load_json("rules.json")
    _indications = _load_json("indications.json")
    _pediatric = _load_json("pediatric_doses.json")
    _organ = _load_json("organ_notes.json")
    _anticholinergic = _load_json("anticholinergic.json")
    # Recargar fuentes externas opcionales y fusionar sinonimos de DrugBank
    external.reload()
    for d in _drugs["drugs"]:
        extra = external.synonyms(d.get("inn", ""))
        if extra:
            base = set(d.get("syn", []))
            d["syn"] = sorted(base | set(extra))


def drugs() -> list[dict]:
    return _drugs["drugs"]


def drugs_version() -> str:
    return _drugs.get("version", "?")


def rules_payload() -> dict:
    return _rules


def indications() -> list[dict]:
    return _indications["indications"]


def find_drug(atc: str) -> dict | None:
    return next((d for d in drugs() if d["atc"] == atc), None)


def _tags(drug: dict) -> set[str]:
    return set(drug.get("tags", []))


def _rule_matches(rule: dict, a: dict, b: dict) -> bool:
    """True si a tiene alguna a_tag y b alguna b_tag (orden ya fijado por el caller)."""
    if not (_tags(a) & set(rule["a_tags"])):
        return False
    if not (_tags(b) & set(rule["b_tags"])):
        return False
    # Exclusiones: p. ej. estatinas no metabolizadas por CYP3A4.
    excl = rule.get("exclude_if_statin")
    if excl and a.get("inn") in excl:
        return False
    return True


def evaluate(cart: list[dict]) -> dict:
    """cart: lista de farmacos {name, inn, atc, tags}. Devuelve alertas + veredicto.
    Recolecta TODAS las reglas que aplican a cada par (no solo la primera) y
    deduplica por (par, regla)."""
    alerts = []
    seen = set()
    n = len(cart)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = cart[i], cart[j]
            # 1) Reglas por clase (curaduria propia)
            for rule in _rules["rules"]:
                if _rule_matches(rule, a, b) or _rule_matches(rule, b, a):
                    pair_key = tuple(sorted([a["name"], b["name"]]))
                    dedup = (pair_key, rule["id"])
                    if dedup in seen:
                        continue
                    seen.add(dedup)
                    alerts.append({
                        "pair": [a["name"], b["name"]],
                        "id": rule["id"],
                        "severity": rule["severity"],
                        "mechanism": rule["mechanism"],
                        "conduct": rule["conduct"],
                        "cite": rule["cite"],
                        "source": "curaduria_propia",
                    })
            # 2) Interacciones par-a-par de DDInter (si esta cargado)
            ext = external.pairwise(a.get("inn", ""), b.get("inn", ""))
            if ext:
                pair_key = tuple(sorted([a["name"], b["name"]]))
                dedup = (pair_key, "ddinter")
                if dedup not in seen:
                    seen.add(dedup)
                    alerts.append({
                        "pair": [a["name"], b["name"]],
                        "id": "ddinter",
                        "severity": ext["severity"],
                        "mechanism": ext.get("mechanism") or "Interaccion documentada en DDInter.",
                        "conduct": ext.get("management") or "Consultar manejo en la fuente.",
                        "cite": "DDInter 2.0 (uso no comercial; citar la fuente).",
                        "source": "DDInter",
                    })
    # 3) Duplicidad por PRINCIPIO ACTIVO (incluye combinados): el paracetamol
    #    escondido en un antigripal + paracetamol suelto = sobredosis silenciosa.
    for dup in ingredient_duplicates(cart):
        names = dup["drugs"]
        alerts.append({
            "pair": names[:2] if len(names) >= 2 else names,
            "id": "dup-principio-activo",
            "severity": dup["severity"],
            "mechanism": f"El principio activo '{dup['ingredient']}' esta presente en {len(names)} productos del carrito ({', '.join(names)}). Riesgo de sobredosis por suma de la misma sustancia.",
            "conduct": "No administrar juntos sin ajustar: sumar las dosis del mismo principio activo. Revisar componentes de los combinados.",
            "cite": "Duplicidad por principio activo (componentes declarados).",
            "source": "duplicidad_activo",
        })

    alerts.sort(key=lambda x: RANK[x["severity"]], reverse=True)
    verdict = "green"
    for al in alerts:
        if RANK[al["severity"]] > RANK[verdict]:
            verdict = al["severity"]
    return {
        "verdict": verdict,
        "alerts": alerts,
        "drug_flags": patient_flags(cart),
        "reconciliation": reconcile(cart, alerts),
        "rules_version": _rules.get("version", "?"),
    }


# ====================== RECONCILIACION (bolsa del paciente) =================

_DOSE_CRITICAL = {
    "acetaminophen", "ibuprofen", "naproxen", "diclofenac", "ketorolac",
    "aspirin", "codeine", "tramadol", "morphine", "pseudoephedrine", "phenylephrine",
}


def _ingredients(drug: dict) -> list[str]:
    comp = drug.get("components")
    if comp:
        return [c.lower() for c in comp]
    inn = (drug.get("inn") or "").lower()
    return [inn] if inn else []


def ingredient_duplicates(cart: list[dict]) -> list[dict]:
    """Detecta principios activos presentes en >=2 productos distintos del carrito."""
    occ: dict[str, list[str]] = {}
    for d in cart:
        for ing in set(_ingredients(d)):
            occ.setdefault(ing, [])
            if d["name"] not in occ[ing]:
                occ[ing].append(d["name"])
    out = []
    for ing, names in occ.items():
        if len(names) >= 2:
            sev = "red" if ing in _DOSE_CRITICAL else "amber"
            out.append({"ingredient": ing, "drugs": names, "severity": sev})
    out.sort(key=lambda x: RANK[x["severity"]], reverse=True)
    return out


def anticholinergic_burden(cart: list[dict]) -> dict:
    scores = _anticholinergic.get("scores", {})
    breakdown = []
    total = 0
    for d in cart:
        # sumar por componentes si es combinado
        for ing in set(_ingredients(d)):
            sc = scores.get(ing)
            if sc:
                total += sc
                breakdown.append({"drug": d["name"], "ingredient": ing, "score": sc})
    if total == 0:
        level = "sin carga"
    elif total <= 2:
        level = "carga moderada (vigilar)"
    else:
        level = "carga alta (riesgo aumentado)"
    return {
        "total": total,
        "level": level,
        "breakdown": breakdown,
        "scale": _anticholinergic.get("scale", "ACB"),
        "note": "Carga total >=3 se asocia a mayor riesgo de confusion, caidas y retencion urinaria, sobre todo en mayores.",
    }


def reconcile(cart: list[dict], alerts: list[dict]) -> dict:
    n = len(cart)
    reds = sum(1 for a in alerts if a["severity"] == "red")
    ambers = sum(1 for a in alerts if a["severity"] == "amber")
    return {
        "n_drugs": n,
        "polypharmacy": n >= 5,
        "anticholinergic": anticholinergic_burden(cart),
        "ingredient_duplications": ingredient_duplicates(cart),
        "alert_counts": {"red": reds, "amber": ambers},
    }


def patient_flags(cart: list[dict]) -> list[dict]:
    """Banderas informativas por farmaco: riesgo en embarazo (curado) y riesgo de
    QT/Torsades (CredibleMeds, si esta cargado). Datos bien establecidos."""
    out = []
    cfg = _rules.get("patient_flags", {}).get("pregnancy")
    if cfg:
        flag_tags = set(cfg.get("tags", []))
        flag_inns = set(cfg.get("inns", []))
        for d in cart:
            inn = (d.get("inn") or "").lower()
            if (_tags(d) & flag_tags) or (inn in flag_inns):
                out.append({"drug": d["name"], "flag": "embarazo", "text": cfg["text"]})
    # Riesgo QT autoritativo (CredibleMeds)
    cat_es = {"known": "riesgo conocido", "possible": "riesgo posible", "conditional": "riesgo condicional"}
    for d in cart:
        risk = external.qt_risk(d.get("inn", ""))
        if risk:
            out.append({
                "drug": d["name"],
                "flag": "qt",
                "text": f"QT/Torsades — {cat_es.get(risk, risk)} (CredibleMeds). Vigilar con otros farmacos que prolongan el QT, hipokalemia o cardiopatia.",
            })
    return out


def food_alerts(cart: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for d in cart:
        for fr in _rules.get("food_rules", []):
            if fr["tag"] in _tags(d) and fr["text"] not in seen:
                seen.add(fr["text"])
                out.append({"drug": d["name"], "text": fr["text"]})
    return out


def recommend(query: str) -> dict | None:
    from .phonetic import normalize
    q = normalize(query)
    if len(q) < 3:
        return None
    for ind in indications():
        for k in ind["keys"]:
            nk = normalize(k)
            if nk in q or q in nk:
                return ind
    return None


# ============================ CALCULADORAS =============================
# La matematica es exacta. Los DATOS (mg/kg) son responsabilidad del usuario:
# vienen de las tablas curadas, no de un modelo. Cada resultado incluye su fuente.

def _ped_entry(inn: str) -> dict | None:
    inn = (inn or "").lower()
    return next((d for d in _pediatric.get("drugs", []) if d.get("inn") == inn), None)


def pediatric_dose(inn: str, weight_kg: float, age_months: float | None = None) -> dict | None:
    """Calcula la dosis pediatrica a partir de la tabla curada. Solo aritmetica."""
    e = _ped_entry(inn)
    if not e or not weight_kg or weight_kg <= 0:
        return None
    out = {
        "drug": e.get("name", inn), "inn": e.get("inn"), "weight_kg": weight_kg,
        "route": e.get("route"), "source": e.get("source"), "note": e.get("note"),
        "warnings": [], "per_dose": None, "per_day": None,
    }
    min_age = e.get("min_age_months")
    if min_age and age_months is not None and age_months < min_age:
        out["warnings"].append(f"No recomendado en menores de {min_age} meses.")
    if "per_dose" in e:
        pd = e["per_dose"]
        dose = weight_kg * pd["mg_per_kg"]
        capped = min(dose, pd["max_single_mg"]) if pd.get("max_single_mg") else dose
        out["per_dose"] = {
            "mg_por_toma": round(capped, 1),
            "calculo": f"{weight_kg} kg x {pd['mg_per_kg']} mg/kg = {round(dose,1)} mg",
            "frecuencia_horas": pd.get("freq_hours"),
            "topeado": capped < dose,
            "max_por_toma_mg": pd.get("max_single_mg"),
        }
    if "per_day" in e:
        pday = e["per_day"]
        daily = weight_kg * pday["mg_per_kg_day"]
        capped_daily = min(daily, pday["max_daily_mg"]) if pday.get("max_daily_mg") else daily
        divs = pday.get("divisions", 1)
        out["per_day"] = {
            "mg_por_dia": round(capped_daily, 1),
            "calculo": f"{weight_kg} kg x {pday['mg_per_kg_day']} mg/kg/dia = {round(daily,1)} mg/dia",
            "tomas_por_dia": divs,
            "mg_por_toma": round(capped_daily / divs, 1) if divs else None,
            "topeado": capped_daily < daily,
        }
    if e.get("max_daily_mg"):
        out["max_diario_mg"] = e["max_daily_mg"]
    return out


def pediatric_available() -> list[dict]:
    return [{"inn": d["inn"], "name": d.get("name", d["inn"])} for d in _pediatric.get("drugs", [])]


def crcl_cockcroft_gault(age_years: float, weight_kg: float, scr_mg_dl: float, female: bool) -> dict | None:
    """Aclaramiento de creatinina (Cockcroft-Gault). Formula pura, sin datos curados."""
    if not (age_years and weight_kg and scr_mg_dl) or scr_mg_dl <= 0:
        return None
    crcl = ((140 - age_years) * weight_kg) / (72 * scr_mg_dl)
    if female:
        crcl *= 0.85
    crcl = round(crcl, 1)
    if crcl >= 90:
        cat = "Normal / leve (>=90)"
    elif crcl >= 60:
        cat = "Leve (60-89)"
    elif crcl >= 30:
        cat = "Moderada (30-59)"
    elif crcl >= 15:
        cat = "Severa (15-29)"
    else:
        cat = "Falla renal (<15)"
    return {
        "crcl_ml_min": crcl,
        "categoria": cat,
        "formula": "Cockcroft-Gault",
        "aviso": "Estimacion. Usa peso real (en obesidad/edema puede sobreestimar). El ajuste exacto de cada farmaco se consulta en su ficha tecnica.",
    }


def organ_notes(inn: str) -> dict:
    inn = (inn or "").lower()
    renal = next((x for x in _organ.get("renal", []) if x.get("inn") == inn), None)
    hepatic = next((x for x in _organ.get("hepatic", []) if x.get("inn") == inn), None)
    return {"renal": renal, "hepatic": hepatic}


# Carga inicial
reload()
