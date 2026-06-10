# Agregar las fuentes potentes (CredibleMeds, DDInter, DrugBank)

Estas tres fuentes hacen la herramienta mucho más completa. El sistema ya está
preparado: tú descargas cada dataset bajo tu propia licencia y dejas el archivo
en `backend/app/data/external/`. Si no está, el sistema funciona igual con la
curaduría propia; estas fuentes solo SUMAN.

> Regla de oro: el proyecto NUNCA incluye estos datos. Son tuyos, bajo los
> términos de cada fuente. El `.gitignore` ya evita que se suban por error.

Mira el formato exacto en los archivos `*.sample.*` de esa carpeta.

---

## 1) CredibleMeds — riesgo de QT / Torsades (autoritativo)

**Qué aporta:** marca cada fármaco con su riesgo real de prolongar el QT
(conocido / posible / condicional). Aparece como bandera de paciente.

**Pasos:**
1. Entra a **crediblemeds.org** y crea una cuenta gratuita.
2. Acepta su licencia de uso (EULA). Confirma que tu uso es **no comercial**
   (uso clínico/profesional, sin venderlo).
3. Abre sus listas de fármacos que prolongan el QT (QTdrugs Lists), organizadas
   por categoría de riesgo.
4. Crea el archivo `backend/app/data/external/credible_meds.json` con este
   formato (ver `credible_meds.sample.json`):
   ```json
   {
     "version": "2026-06",
     "drugs": [
       {"name": "azithromycin", "risk": "known"},
       {"name": "citalopram", "risk": "known"},
       {"name": "ondansetron", "risk": "possible"}
     ]
   }
   ```
   - `name`: nombre del principio activo en inglés (INN).
   - `risk`: `known`, `possible` o `conditional` según la categoría de la lista.
5. Guarda el archivo. Listo.

> CredibleMeds no entrega un archivo descargable limpio: vas transcribiendo su
> lista a este JSON. Empieza por los fármacos que más dispensas.

---

## 2) DDInter 2.0 — interacciones par a par con severidad

**Qué aporta:** ~300.000 pares de interacción con severidad, mecanismo y manejo.
Aparecen como alertas con la etiqueta "DDInter".

**Pasos:**
1. Entra a **ddinter2.scbdd.com** (DDInter 2.0).
2. Revisa sus condiciones: uso **no comercial**, citando el artículo
   (Tian et al., *Nucleic Acids Research*).
3. Descarga el dataset de interacciones (sección Download).
4. Conviértelo a un CSV con estas columnas exactas y guárdalo como
   `backend/app/data/external/ddinter.csv` (ver `ddinter.sample.csv`):
   ```
   drug_a,drug_b,severity,mechanism,management
   warfarin,amiodarone,Major,...,...
   ```
   - `severity`: `Major`, `Moderate`, `Minor` o `Unknown`.
     El sistema mapea Major→ROJO y el resto→AMARILLO.
   - Si la descarga trae otras columnas, renómbralas a estas. (Puedo darte un
     script de conversión si me dices cómo vienen sus archivos.)
5. Guarda. Listo.

---

## 3) DrugBank — vocabulario y sinónimos

**Qué aporta:** más nombres y sinónimos para que la búsqueda fonética reconozca
muchas más formas de escribir un fármaco.

**Dos opciones:**

- **Open Data (CC0, recomendado para empezar):** es libre, sin trámite. En
  go.drugbank.com, sección de descargas / Open Data, baja el "vocabulary" (CSV).
  Trae `Common name` y `Synonyms`. Guárdalo tal cual como
  `backend/app/data/external/drugbank_vocab.csv`.
- **Set académico completo (CC-BY-NC):** crea una cuenta en
  go.drugbank.com/public_users/sign_up y solicita la licencia académica (es un
  proceso de varios pasos, con aprobación humana). Recuerda: DrugBank se define
  como recurso de **investigación, no de decisión médica**, y exige citarlo. Para
  esta herramienta, el Open Data ya cubre lo de los nombres.

---

## Aplicar los cambios

Después de dejar uno o más archivos en `external/`:
- Llama a **`POST /api/reload`** (o reinicia el backend). El sistema detecta los
  archivos y los empieza a usar.
- Verifica en **`GET /api/sources`** que aparezcan como `loaded: true`.
- Los créditos de cada fuente cargada salen automáticamente en
  **`GET /api/attributions`** y en el pie de la app. **No los quites**: DDInter y
  DrugBank exigen atribución.

## Sobre "todos los fármacos posibles"

La cobertura amplia de **principios activos** viene de `scripts/enrich.py`
(RxClass/NLM): corre eso para pasar de decenas a cientos/miles. Estas tres
fuentes añaden **profundidad clínica** (QT, interacciones par a par, sinónimos)
sobre ese catálogo. Juntas: catálogo amplio + interacciones profundas.

## Recordatorio honesto

Ninguna base, ni siquiera estas tres juntas, es completa ni infalible. Esta
herramienta es apoyo a la decisión: la ficha técnica oficial y el criterio del
profesional mandan siempre.
