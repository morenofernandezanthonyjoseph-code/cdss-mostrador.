#!/usr/bin/env python3
"""
enrich.py - COBERTURA MASIVA del catalogo (vademecum completo via RxClass/NLM),
ROBUSTO: timeout por peticion, reintentos, progreso visible y tolerante a fallos.

- Recorre TODAS las clases ATC nivel 4 -> miles de farmacos.
- Si una peticion tarda o falla, reintenta; si igual falla, sigue con la siguiente.
- Imprime progreso desde el primer segundo (con flush) para que SIEMPRE se vea
  si avanza.
- Preserva tu curaduria (curated_drugs.json): nunca la sobrescribe.

Uso: python scripts/enrich.py
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

TIMEOUT = 20          # segundos maximos por peticion
RETRIES = 3           # reintentos por peticion antes de rendirse con esa
PAUSE = 0.08          # pausa entre peticiones (cortesia con la NLM)


def log(msg):
    """Imprime con flush inmediato para que el progreso se vea en vivo en CI."""
    print(msg, flush=True)


def http_get_json(url, params):
    qs = urllib.parse.urlencode(params)
    full = f"{url}?{qs}"
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt < RETRIES:
                time.sleep(1.5 * attempt)  # espera creciente
    raise last


def all_atc4_classes():
    log("Pidiendo la lista de clases ATC a la NLM...")
    data = http_get_json(RXCLASS_ALL, {"classTypes": "ATC1-4"})
    out = []
    for c in (data.get("rxclassMinConceptList", {}).get("rxclassMinConcept", []) or []):
        cid = c.get("classId", "")
        if len(cid) == 5:
            out.append(cid)
    return sorted(set(out))


def class_members(atc_class_id):
    data = http_get_json(RXCLASS_MEMBERS, {"classId": atc_class_id, "relaSource": "ATC", "ttys": "IN"})
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
    fallidas = 0

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

    try:
        classes = all_atc4_classes()
    except Exception as e:  # noqa: BLE001
        log(f"ERROR: no se pudo obtener la lista de clases ATC ({e}).")
        log("La NLM puede estar caida. Aborta SIN tocar tu catalogo actual.")
        sys.exit(1)

    total = len(classes)
    log(f"Clases ATC a recorrer: {total}. Empezando...")
    for i, cid in enumerate(classes, 1):
        try:
            for mem in class_members(cid):
                ensure(mem["inn"], rxcui=mem["rxcui"], atc=cid)
        except Exception as e:  # noqa: BLE001
            fallidas += 1
            log(f"  ! clase {cid} fallo, se omite ({e})")
        if i % 25 == 0 or i == total:
            log(f"  progreso: {i}/{total} clases · {len(catalog)} farmacos acumulados")
        time.sleep(PAUSE)

    log(f"Recorrido terminado. {len(catalog)} farmacos, {fallidas} clases omitidas.")

    # Etiquetas por clase del tag_map (para interacciones)
    log("Aplicando etiquetas de interaccion (tag_map)...")
    for tag, class_ids in tag_map.get("atc_tags", {}).items():
        for cid in class_ids:
            try:
                for mem in class_members(cid):
                    ensure(mem["inn"])["tags"].add(tag)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(PAUSE)
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
        log("Fusionando tu curaduria (curated_drugs.json)...")
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
    t0 = time.time()
    log("=== enrich: catalogo masivo (robusto) ===")
    drugs = build()
    payload = {"version": time.strftime("%Y.%m.%d") + "-full",
               "source": "RxClass/NLM (todas las clases ATC) + curaduria (curated_drugs.json).",
               "note": "Generado por enrich.py. La curaduria vive en curated_drugs.json.",
               "drugs": drugs}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    con_tags = sum(1 for d in drugs if d["tags"])
    log(f"\nOK: {len(drugs)} farmacos escritos ({con_tags} con etiquetas) en {time.time()-t0:.0f}s.")


if __name__ == "__main__":
    main()
