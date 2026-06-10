# Fuentes externas (las cargas TÚ, bajo tu propia licencia)

Esta carpeta queda VACÍA en el repositorio a propósito. El proyecto NO distribuye
estos datos: cada fuente tiene su propia licencia y debes obtenerlos bajo tu
nombre. Aquí solo hay archivos `*.sample.*` con datos FALSOS para que veas el
formato. Cuando consigas los reales, guárdalos con el nombre sin `.sample`:

| Archivo real | Fuente | Formato |
|--------------|--------|---------|
| `credible_meds.json` | CredibleMeds (registro + EULA) | ver `credible_meds.sample.json` |
| `ddinter.csv` | DDInter 2.0 (no comercial, citar) | columnas: drug_a,drug_b,severity,mechanism,management |
| `drugbank_vocab.csv` | DrugBank Open Data (CC0) | "Common name" + "Synonyms" (separados por \| o ;) |

Si un archivo no está, el sistema funciona igual con la curaduría propia: estas
fuentes solo SUMAN. Tras colocarlos, llama a `POST /api/reload` o reinicia.

## Severidad DDInter -> colores del sistema
- Major  -> ROJO
- Moderate / Minor / Unknown -> AMARILLO

## Atribución obligatoria
DDInter (no comercial) y DrugBank (CC-BY-NC) EXIGEN citar la fuente. El endpoint
`/api/attributions` y el pie de la app muestran los créditos automáticamente
cuando estas fuentes están cargadas. No quites esos créditos.
