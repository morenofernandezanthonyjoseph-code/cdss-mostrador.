"""Carga de FUENTES EXTERNAS opcionales (el usuario las descarga bajo su propia
licencia y las deja en app/data/external/). Si un archivo no esta, el sistema
sigue funcionando con la curaduria propia. Cada dato lleva su procedencia.

Formatos normalizados esperados (ver app/data/external/README):
  - credible_meds.json : {version, drugs:[{name, risk}]}  risk in known|possible|conditional
  - ddinter.csv        : columnas drug_a,drug_b,severity,mechanism,management
  - drugbank_vocab.csv : formato Open Data CC0 de DrugBank (Common name, Synonyms)

NADA de estos archivos se distribuye con el proyecto: son responsabilidad del
usuario, bajo los terminos de cada fuente (CredibleMeds EULA, DDInter no comercial,
DrugBank CC-BY-NC / Open Data CC0).
"""
import csv
import json
from pathlib import Path
from . import config
from .phonetic import normalize

EXT_DIR = config.DATA_DIR / "external"

# Severidad DDInter -> escala interna del sistema
_DDINTER_SEV = {"major": "red", "moderate": "amber", "minor": "amber", "unknown": "amber"}

_qt: dict[str, str] = {}            # inn_normalizado -> categoria de riesgo QT
_pairwise: dict[tuple, dict] = {}   # (inn_a, inn_b) normalizados ordenados -> interaccion
_synonyms: dict[str, list] = {}     # inn_normalizado -> [sinonimos]
_loaded = {"credible_meds": False, "ddinter": False, "drugbank": False}


def _exists(name: str) -> Path | None:
    p = EXT_DIR / name
    return p if p.exists() else None


def load_credible_meds() -> None:
    global _qt
    _qt = {}
    p = _exists("credible_meds.json")
    if not p:
        _loaded["credible_meds"] = False
        return
    data = json.loads(p.read_text(encoding="utf-8"))
    for d in data.get("drugs", []):
        name = normalize(d.get("name", ""))
        risk = (d.get("risk") or "").lower()
        if name and risk:
            _qt[name] = risk
    _loaded["credible_meds"] = True


def load_ddinter() -> None:
    global _pairwise
    _pairwise = {}
    p = _exists("ddinter.csv")
    if not p:
        _loaded["ddinter"] = False
        return
    with p.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            a = normalize(row.get("drug_a", ""))
            b = normalize(row.get("drug_b", ""))
            if not a or not b:
                continue
            sev = _DDINTER_SEV.get((row.get("severity") or "").strip().lower(), "amber")
            key = tuple(sorted([a, b]))
            _pairwise[key] = {
                "severity": sev,
                "mechanism": (row.get("mechanism") or "").strip(),
                "management": (row.get("management") or "").strip(),
            }
    _loaded["ddinter"] = True


def load_drugbank_vocab() -> None:
    global _synonyms
    _synonyms = {}
    p = _exists("drugbank_vocab.csv")
    if not p:
        _loaded["drugbank"] = False
        return
    with p.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Formato Open Data de DrugBank: "Common name" + "Synonyms" (separados por |)
            common = normalize(row.get("Common name") or row.get("common_name") or "")
            syn_raw = row.get("Synonyms") or row.get("synonyms") or ""
            syns = [s.strip() for s in syn_raw.replace("|", ";").split(";") if s.strip()]
            if common:
                _synonyms.setdefault(common, [])
                for s in syns:
                    if s.lower() not in _synonyms[common]:
                        _synonyms[common].append(s.lower())
    _loaded["drugbank"] = True


def reload() -> None:
    load_credible_meds()
    load_ddinter()
    load_drugbank_vocab()


# --- Consultas usadas por el motor ---

def qt_risk(inn: str) -> str | None:
    return _qt.get(normalize(inn))


def pairwise(inn_a: str, inn_b: str) -> dict | None:
    return _pairwise.get(tuple(sorted([normalize(inn_a), normalize(inn_b)])))


def synonyms(inn: str) -> list:
    return _synonyms.get(normalize(inn), [])


def status() -> dict:
    return {
        "credible_meds": {"loaded": _loaded["credible_meds"], "drugs": len(_qt)},
        "ddinter": {"loaded": _loaded["ddinter"], "pairs": len(_pairwise)},
        "drugbank": {"loaded": _loaded["drugbank"], "drugs_with_synonyms": len(_synonyms)},
    }


reload()
