"""Tests que NO requieren red. Cubren la logica propia: fonetica, reglas, recomendacion.
Los proxies a fuentes externas se prueban aparte (requieren conectividad)."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_phonetic_search_balbuceo():
    # "asitromisina" debe resolver a Azitromicina con alta coincidencia
    r = client.get("/api/drugs/search", params={"q": "asitromisina"})
    assert r.status_code == 200
    results = r.json()["results"]
    assert results, "deberia haber resultados"
    top = results[0]
    assert top["name"] == "Azitromicina"
    assert top["score"] >= 80


def test_phonetic_search_typo():
    r = client.get("/api/drugs/search", params={"q": "warfarina"})
    assert r.json()["results"][0]["name"] == "Warfarina"


def test_interaction_red_statin_cyp3a4():
    cart = {"cart": [
        {"name": "Simvastatina", "inn": "simvastatin", "atc": "C10AA01", "tags": ["statin", "cyp3a4_substrate"]},
        {"name": "Claritromicina", "inn": "clarithromycin", "atc": "J01FA09", "tags": ["macrolide", "cyp3a4_inhibitor"]},
    ]}
    r = client.post("/api/interactions", json=cart)
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] == "red"
    assert any(a["id"] == "statin-cyp3a4" for a in body["alerts"])


def test_interaction_exclusion_rosuvastatin():
    # Rosuvastatina NO se metaboliza por CYP3A4 -> no debe disparar la regla roja
    cart = {"cart": [
        {"name": "Rosuvastatina", "inn": "rosuvastatin", "atc": "C10AA07", "tags": ["statin"]},
        {"name": "Claritromicina", "inn": "clarithromycin", "atc": "J01FA09", "tags": ["macrolide", "cyp3a4_inhibitor"]},
    ]}
    r = client.post("/api/interactions", json=cart)
    assert not any(a["id"] == "statin-cyp3a4" for a in r.json()["alerts"])


def test_food_alert_warfarin():
    cart = {"cart": [{"name": "Warfarina", "inn": "warfarin", "atc": "B01AA03", "tags": ["anticoagulant", "vit_k"]}]}
    r = client.post("/api/interactions", json=cart)
    assert any("vitamina K" in f["text"] for f in r.json()["food_alerts"])


def test_recommend_hta():
    r = client.get("/api/recommend", params={"q": "hipertension"})
    assert r.json()["match"]["title"] == "Hipertension arterial"


def test_recommend_no_invent():
    r = client.get("/api/recommend", params={"q": "xyzqw"})
    assert r.json()["match"] is None


def test_rules_versioned():
    r = client.get("/api/rules")
    body = r.json()
    assert "version" in body
    assert len(body["rules"]) >= 9


# --- Cobertura ampliada (Fase 2) ---

def _d(name, inn, tags):
    return {"name": name, "inn": inn, "atc": "", "tags": tags}


def test_opioid_benzo_red():
    cart = {"cart": [_d("Tramadol", "tramadol", ["opioid"]), _d("Diazepam", "diazepam", ["benzodiazepine"])]}
    r = client.post("/api/interactions", json=cart).json()
    assert r["verdict"] == "red"
    assert any(a["id"] == "opioid-benzo" for a in r["alerts"])


def test_dual_raas_red():
    cart = {"cart": [_d("Enalapril", "enalapril", ["acei"]), _d("Losartan", "losartan", ["arb"])]}
    r = client.post("/api/interactions", json=cart).json()
    assert any(a["id"] == "dual-raas" for a in r["alerts"])


def test_multiple_alerts_per_pair():
    cart = {"cart": [
        _d("Warfarina", "warfarin", ["anticoagulant"]),
        _d("Claritromicina", "clarithromycin", ["macrolide", "cyp3a4_inhibitor"]),
    ]}
    r = client.post("/api/interactions", json=cart).json()
    assert any(a["id"] == "anticoag-cyp3a4" for a in r["alerts"])


def test_pregnancy_flag():
    cart = {"cart": [_d("Warfarina", "warfarin", ["anticoagulant"])]}
    r = client.post("/api/interactions", json=cart).json()
    assert any(f["drug"] == "Warfarina" for f in r["drug_flags"])


def test_duplicate_nsaid():
    cart = {"cart": [_d("Ibuprofeno", "ibuprofen", ["nsaid"]), _d("Diclofenaco", "diclofenac", ["nsaid"])]}
    r = client.post("/api/interactions", json=cart).json()
    assert any(a["id"] == "nsaid-dup" for a in r["alerts"])


def test_pediatric_calc():
    r = client.get("/api/calc/pediatric", params={"inn": "acetaminophen", "weight": 12}).json()
    assert r["available"] and r["result"]["per_dose"]["mg_por_toma"] == 180.0


def test_pediatric_cap():
    r = client.get("/api/calc/pediatric", params={"inn": "acetaminophen", "weight": 80}).json()
    assert r["result"]["per_dose"]["mg_por_toma"] == 1000.0 and r["result"]["per_dose"]["topeado"]


def test_crcl():
    r = client.get("/api/calc/crcl", params={"age": 70, "weight": 70, "scr": 1.0, "sex": "m"}).json()
    assert r["ok"] and abs(r["result"]["crcl_ml_min"] - 68.1) < 0.3


def test_ingredient_duplicate_paracetamol():
    cart = {"cart": [
        {"name": "Antigripal", "inn": "antigripal-pcm", "atc": "", "tags": [], "components": ["acetaminophen", "phenylephrine"]},
        {"name": "Paracetamol", "inn": "acetaminophen", "atc": "", "tags": ["analgesic"]},
    ]}
    r = client.post("/api/interactions", json=cart).json()
    assert any(a["id"] == "dup-principio-activo" and a["severity"] == "red" for a in r["alerts"])


def test_reconciliation_anticholinergic():
    cart = {"cart": [
        {"name": "Difenhidramina", "inn": "diphenhydramine", "atc": "", "tags": []},
        {"name": "Amitriptilina", "inn": "amitriptyline", "atc": "", "tags": []},
    ]}
    r = client.post("/api/interactions", json=cart).json()
    assert r["reconciliation"]["anticholinergic"]["total"] >= 6
