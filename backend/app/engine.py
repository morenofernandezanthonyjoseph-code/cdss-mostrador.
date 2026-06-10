"""Carga de datos curados (diccionario, reglas, indicaciones) y motor de evaluacion
de interacciones por pares de etiquetas. Los datos viven en JSON externos y se
recargan con reload() para permitir curaduria sin reiniciar."""
import json
from . import config

RANK = {"red": 3, "amber": 2, "green": 1}

_drugs: dict = {}
_rules: dict = {}
_indications: dict = {}


def _load_json(name: str) -> dict:
    with open(config.DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def reload() -> None:
    global _drugs, _rules, _indications
    _drugs = _load_json("drugs.json")
    _rules = _load_json("rules.json")
    _indications = _load_json("indications.json")


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
    """cart: lista de farmacos {name, inn, atc, tags}. Devuelve alertas + veredicto."""
    alerts = []
    n = len(cart)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = cart[i], cart[j]
            for rule in _rules["rules"]:
                if _rule_matches(rule, a, b) or _rule_matches(rule, b, a):
                    alerts.append({
                        "pair": [a["name"], b["name"]],
                        "id": rule["id"],
                        "severity": rule["severity"],
                        "mechanism": rule["mechanism"],
                        "conduct": rule["conduct"],
                        "cite": rule["cite"],
                        "source": "curaduria_propia",
                    })
                    break  # una regla (la primera que aplique) por par
    alerts.sort(key=lambda x: RANK[x["severity"]], reverse=True)
    verdict = "green"
    for al in alerts:
        if RANK[al["severity"]] > RANK[verdict]:
            verdict = al["severity"]
    return {"verdict": verdict, "alerts": alerts, "rules_version": _rules.get("version", "?")}


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


# Carga inicial
reload()
