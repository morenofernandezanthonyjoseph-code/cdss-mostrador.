# Cómo enriquecer el catálogo (automático y gratis)

El catálogo de fármacos no se carga a mano. Se **genera** desde fuentes oficiales
gratuitas, y crece solo. Esta es la pieza que resuelve el "solo cubre el 5%".

## La idea en una frase

Tú mantenés un archivo chico (`backend/scripts/tag_map.json`) que dice qué clases
te interesan. Un script consulta a **RxClass (NLM, gratis)** y trae todos los
fármacos de esas clases, ya etiquetados. Como tus reglas de interacción son por
clase, **la cobertura de interacciones crece sola** con cada fármaco nuevo.

## Dos tipos de etiqueta

1. **`atc_tags`** — se auto-pueblan. Cada entrada es una clase ATC; el script
   pregunta a RxClass quiénes la integran. Agregar una clase nueva = una línea.
   Ejemplo: para cubrir betabloqueantes, agregás `"betablocker": ["C07AB"]`.

2. **`curated_tags`** — lo que el ATC no codifica (inhibidor de CYP3A4,
   serotoninérgico, quelación…). Son listas cortas de principios activos (en
   inglés/INN). Es curaduría tuya: poca cantidad, mucho valor clínico.

3. **`es_names`** — nombre en español que sobrescribe el INN. Si un fármaco no
   tiene override, aparece con su INN (inglés) hasta que lo traduzcas.

## Correrlo a mano (una vez, para probar)

```bash
cd backend
python scripts/enrich.py
```

Tarda según cuántas clases tengas (es gentil con la API). Al terminar reescribe
`app/data/drugs.json` y te imprime un resumen de cuántos fármacos quedaron y la
cobertura por etiqueta. El backend ya consume ese archivo: no se toca nada más.

## Automatizarlo GRATIS (que se actualice solo)

Ya está incluido el robot en `.github/workflows/enrich.yml`. Con tu código en
GitHub:

- Corre **solo el día 1 de cada mes** y, si la FDA/NLM cambió algo, sube el
  catálogo actualizado. Render redespliega solo. No hacés nada.
- También podés lanzarlo a mano: en GitHub, pestaña **Actions** →
  "Enriquecer catalogo de farmacos" → **Run workflow**.

GitHub Actions es gratis para esto. No hay servidores que mantener.

## Crecer la cobertura (tu trabajo, mínimo)

Para cubrir más terreno, agregás clases a `tag_map.json`. Algunas útiles:

| Quiero cubrir | Agregar a atc_tags |
|---------------|--------------------|
| Betabloqueantes | `"betablocker": ["C07AB", "C07AA"]` |
| Antidiabéticos (sulfonilureas) | `"sulfonylurea": ["A10BB"]` |
| Benzodiacepinas | `"benzodiazepine": ["N05BA", "N05CD"]` |
| Antihistamínicos | `"antihistamine": ["R06AE", "R06AX"]` |
| Corticoides orales | `"corticosteroid": ["H02AB"]` |
| ISRN / IMAO | `"snri": ["N06AX"]`, `"maoi": ["N06AF", "N06AG"]` |

Cada clase nueva que agregás se cruza automáticamente con tus reglas existentes.
Si además querés una regla nueva entre dos clases, la agregás en
`app/data/rules.json` (también sin tocar código).

## Capas de enriquecimiento futuras (opcionales)

- **Ficha en español (CIMA/AEMPS):** CIMA publica su nomenclátor descargable. Se
  puede cruzar por principio activo para traer el nombre comercial español y el
  enlace a la ficha técnica. *Revisar las condiciones de reutilización de CIMA
  antes de uso comercial.*
- **Texto de interacciones masivo (openFDA bulk):** la FDA publica el dataset
  completo de etiquetas en ~13 archivos JSON (CC0). Se puede pre-indexar para
  tener el texto oficial de interacciones de cada fármaco sin llamar a la API en
  cada consulta.
- **Traducción automática offline:** herramientas como Argos Translate (libre,
  sin conexión) pueden pre-traducir las secciones de la etiqueta al español en el
  mismo robot. La calidad clínica es regular: revisar antes de mostrar como
  definitivo.

Ninguna de estas es necesaria para arrancar. El catálogo + reglas por clase ya te
saca del 5%.
