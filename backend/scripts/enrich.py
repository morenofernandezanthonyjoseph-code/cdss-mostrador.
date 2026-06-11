#!/usr/bin/env python3
"""
enrich.py - COBERTURA MASIVA del catalogo (Capa 1) preservando la curaduria.

Que hace:
  1. Pide a RxClass (NLM, gratis) TODAS las clases ATC nivel 4.
  2. Por cada clase, trae sus farmacos con su codigo ATC -> miles de farmacos.
  3. Aplica las etiquetas curadas de tag_map (metabolicas/PD) por INN.
  4. FUSIONA tu curaduria manual (curated_drugs.json): para los farmacos que
     curaste conserva tus tags, componentes, sinonimos y nombre en espanol.
  5. Escribe app/data/drugs.json (archivo de ejecucion, grande).

NO se pierde tu curaduria: vive en curated_drugs.json y no se sobrescribe.
Uso: python scripts/enrich.py  (requiere red; pensado para CI o local).
"""
import json, sys, time, urllib.parse, urllib.request
from pathlib import Path

RXCLASS_MEMBERS = "https://rxnav.nlm.nih.gov/REST/rxclass/classMembers.json"
RXCLASS_ALL = "https://rxnav.nlm.nih.gov/REST/rxclass/allClasses.json"
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "app" / "data"
TAG_MAP = SCRIPT_DIR / "tag_map.json"
CURATED = DATA_DIR / "curated_drugs.json"
OUT = DATA_DIR / "drugs.json"
USER_AGENT = "CDSS-Mostrador/1.0 (enrichment)"


def http_get_json(url, params):
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{qs}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def all_atc4_classes():
    try:
        data = http_get_json(RXCLASS_ALL, {"classTypes": "ATC1-4"})
    except Exception as e:
        print(f"  ! No se pudo listar clases ATC: {e}", file=sys.stderr)
        return []
    out = []
    for c in (data.get("rxclassMinConceptList", {}).get("rxclassMinConcept", []) or []):
        cid = c.get("classId", "")
        if len(cid) == 5:
            out.append(cid)
    return sorted(set(out))


def class_members(atc_class_id):
    try:
        data = http_get_json(RXCLASS_MEMBERS, {"classId": atc_class_id, "relaSource": "ATC", "ttys": "IN"})
    except Exception as e:
        print(f"  ! Error en clase {atc_class_id}: {e}", file=sys.stderr)
        return []
    members = (((data.get("drugMemberGroup") or {}).get("drugMember")) or [])
    out = []
    for m in members:
        mc = m.get("minConcept") or {}
        name = (mc.get("name") or "").strip()
        if name:
            out.append({"inn": name.lower(), "rxcui": mc.get("rxcui")})
    return out


def build():
    tag_map = json.loads(TAG_MAP.read_text(encoding="utf-8"))
    es_names = tag_map.get("es_names", {})
    curated_tags = tag_map.get("curated_tags", {})
    catalog = {}

    def ensure(inn, rxcui=None, atc=None):
        k = inn.lower()
        if k not in catalog:
            catalog[k] = {"inn": k, "rxcui": rxcui, "atc": atc, "tags": set()}
        else:
            if rxcui and not catalog[k]["rxcui"]:
                catalog[k]["rxcui"] = rxcui
            if atc and not catalog[k]["atc"]:
                catalog[k]["atc"] = atc
        return catalog[k]

    classes = all_atc4_classes()
    print(f"Clases ATC nivel 4 encontradas: {len(classes)}")
    for i, cid in enumerate(classes, 1):
        for mem in class_members(cid):
            ensure(mem["inn"], rxcui=mem["rxcui"], atc=cid)
        if i % 50 == 0:
            print(f"  ... {i}/{len(classes)} clases")
        time.sleep(0.12)

    for tag, class_ids in tag_map.get("atc_tags", {}).items():
        for cid in class_ids:
            for mem in class_members(cid):
                ensure(mem["inn"])["tags"].add(tag)
            time.sleep(0.12)

    for tag, inns in curated_tags.items():
        for inn in inns:
            ensure(inn)["tags"].add(tag)

    drugs = {}
    for inn, d in catalog.items():
        name_es = es_names.get(inn) or inn.capitalize()
        drugs[inn] = {"name": name_es, "inn": inn, "atc": d["atc"] or "",
                      "tags": sorted(d["tags"]),
                      "syn": sorted(set([inn] + ([name_es.lower()] if name_es.lower() != inn else [])))}

    if CURATED.exists():
        curated = json.loads(CURATED.read_text(encoding="utf-8"))
        for c in curated.get("drugs", []):
            inn = c["inn"].lower()
            base = drugs.get(inn, {"inn": inn})
            merged = dict(base)
            merged["name"] = c.get("name", base.get("name", inn.capitalize()))
            merged["atc"] = c.get("atc") or base.get("atc", "")
            merged["tags"] = sorted(set(base.get("tags", [])) | set(c.get("tags", [])))
            merged["syn"] = sorted(set(base.get("syn", [])) | set(c.get("syn", [])))
            if c.get("components"):
                merged["components"] = c["components"]
            drugs[inn] = merged

    return sorted(drugs.values(), key=lambda x: x["name"])


def main():
    print("Construyendo catalogo MASIVO desde RxClass (NLM) + curaduria...")
    drugs = build()
    payload = {"version": time.strftime("%Y.%m.%d") + "-full",
               "source": "RxClass/NLM (todas las clases ATC) + curaduria (curated_drugs.json).",
               "note": "Generado por enrich.py. La curaduria vive en curated_drugs.json.",
               "drugs": drugs}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    con_tags = sum(1 for d in drugs if d["tags"])
    print(f"\nOK: {len(drugs)} farmacos ({con_tags} con etiquetas para interacciones).")


if __name__ == "__main__":
    main()
