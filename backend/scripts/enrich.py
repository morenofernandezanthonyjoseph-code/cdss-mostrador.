#!/usr/bin/env python3
"""
enrich.py - Construye el catalogo de farmacos AUTOMATICAMENTE y GRATIS.

Que hace:
  1. Lee tag_map.json (clases ATC + listas curadas + nombres ES).
  2. Por cada clase ATC, pregunta a RxClass (NLM, gratis, sin clave) que farmacos
     la integran -> los agrega al catalogo con su etiqueta de clase.
  3. Aplica las etiquetas curadas (CYP3A4, serotoninergico, etc.) por INN.
  4. Pone el nombre en espanol cuando existe override; si no, usa el INN.
  5. Escribe app/data/drugs.json (el mismo archivo que ya consume el backend).

No cambia ni una linea del resto del sistema: solo agranda el diccionario, y
como las reglas de interaccion son por clase, la cobertura crece sola.

Uso:
    python scripts/enrich.py
Requiere red (consulta rxnav.nlm.nih.gov). Pensado para correr local o en CI.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RXCLASS = "https://rxnav.nlm.nih.gov/REST/rxclass/classMembers.json"
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "app" / "data"
TAG_MAP = SCRIPT_DIR / "tag_map.json"
OUT = DATA_DIR / "drugs.json"

USER_AGENT = "CDSS-Mostrador/1.0 (enrichment)"


def http_get_json(url: str, params: dict) -> dict:
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{qs}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def class_members(atc_class_id: str) -> list[dict]:
    """Devuelve los ingredientes (TTY=IN) de una clase ATC via RxClass."""
    try:
        data = http_get_json(RXCLASS, {
            "classId": atc_class_id,
            "relaSource": "ATC",
            "ttys": "IN",
        })
    except Exception as e:  # noqa: BLE001
        print(f"  ! Error en clase {atc_class_id}: {e}", file=sys.stderr)
        return []
    members = (((data.get("drugMemberGroup") or {}).get("drugMember")) or [])
    out = []
    for m in members:
        mc = m.get("minConcept") or {}
        name = (mc.get("name") or "").strip()
        rxcui = mc.get("rxcui")
        if name:
            out.append({"inn": name.lower(), "rxcui": rxcui})
    return out


def build(tag_map: dict) -> list[dict]:
    # catalogo indexado por inn
    catalog: dict[str, dict] = {}

    def ensure(inn: str, rxcui=None, atc=None) -> dict:
        key = inn.lower()
        if key not in catalog:
            catalog[key] = {"inn": key, "rxcui": rxcui, "atc": atc, "tags": set(), "syn": []}
        else:
            if rxcui and not catalog[key]["rxcui"]:
                catalog[key]["rxcui"] = rxcui
            if atc and not catalog[key]["atc"]:
                catalog[key]["atc"] = atc
        return catalog[key]

    # 1. Auto-poblar y etiquetar desde clases ATC
    atc_tags = tag_map["atc_tags"]
    total_classes = sum(len(v) for v in atc_tags.values())
    done = 0
    for tag, class_ids in atc_tags.items():
        for cid in class_ids:
            done += 1
            members = class_members(cid)
            print(f"[{done}/{total_classes}] {tag} <- ATC {cid}: {len(members)} ingredientes")
            for mem in members:
                entry = ensure(mem["inn"], rxcui=mem["rxcui"], atc=cid)
                entry["tags"].add(tag)
            time.sleep(0.15)  # cortesia con la API

    # 2. Etiquetas curadas (lo que el ATC no codifica)
    for tag, inns in tag_map.get("curated_tags", {}).items():
        for inn in inns:
            ensure(inn).get("tags").add(tag)

    # 3. Nombre ES + sinonimos de busqueda
    es_names = tag_map.get("es_names", {})
    drugs = []
    for inn, d in catalog.items():
        name_es = es_names.get(inn) or inn.capitalize()
        syn = sorted(set([inn] + ([name_es.lower()] if name_es.lower() != inn else [])))
        drugs.append({
            "name": name_es,
            "inn": inn,
            "atc": d["atc"] or "",
            "tags": sorted(d["tags"]),
            "syn": syn,
        })
    drugs.sort(key=lambda x: x["name"])
    return drugs


def main():
    tag_map = json.loads(TAG_MAP.read_text(encoding="utf-8"))
    print(f"Construyendo catalogo desde RxClass (NLM)...")
    drugs = build(tag_map)
    payload = {
        "version": time.strftime("%Y.%m.%d"),
        "source": "RxClass/NLM (clases ATC) + curaduria propia (tags metabolicos)",
        "note": "Generado por scripts/enrich.py. No editar a mano: editar tag_map.json y regenerar.",
        "drugs": drugs,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nOK: {len(drugs)} farmacos escritos en {OUT}")
    # resumen de cobertura de etiquetas
    from collections import Counter
    c = Counter(t for d in drugs for t in d["tags"])
    print("Cobertura por etiqueta:", dict(sorted(c.items())))


if __name__ == "__main__":
    main()
