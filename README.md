# CDSS de Mostrador

Sistema de soporte a la decisión clínica para farmacéuticos en el mostrador.
Búsqueda fonética anti-balbuceo, carrito de prescripción, motor de interacciones
por colores, fichas oficiales y recomendación por guía.

## Principio rector: cero alucinaciones

Cada dato clínico tiene una fuente trazable:

| Capa | Fuente | Licencia | De dónde sale |
|------|--------|----------|---------------|
| Ficha del fármaco | **openFDA** (`drug/label`) | **CC0 — uso comercial permitido** | interacciones, indicaciones, advertencias, boxed warning, contraindicaciones |
| Ficha en español | **CIMA / AEMPS** | revisar reutilización antes de monetizar | nombre, laboratorio, enlaces a ficha técnica |
| Normalización | **RxNorm** (getApproximateMatch, NLM) | libre | nombre → RxCUI |
| Alertas por color | **Curaduría propia** (reglas por clase ATC) | IP del proyecto | mecanismo + conducta + cita |
| Líneas de tratamiento | **Curaduría propia** atada a guía citada | IP del proyecto | sin "% de eficacia" inventado |

**No se usa** la API de interacciones de RxNav (descontinuada 02-ene-2024) ni
fuentes con licencia no comercial (CredibleMeds/QTdrugs, DrugBank no comercial),
porque son incompatibles con un producto de suscripción.

## Estructura

```
cdss/
  backend/                 FastAPI
    app/
      main.py              app + CORS + routers + /health
      config.py            variables de entorno
      cache.py             cache TTL en memoria (cambiable por Redis)
      phonetic.py          fonética ES + Levenshtein
      engine.py            carga de datos + motor de reglas
      data/                DATOS CURABLES (editar aquí)
        drugs.json         diccionario canónico
        rules.json         reglas de interacción + alimentarias
        indications.json   líneas de tratamiento por guía
      routers/
        drugs.py           /api/drugs/search, /api/drugs
        engine_routes.py   /api/interactions, /api/recommend, /api/rules, /api/reload
        sources.py         /api/label, /api/cima, /api/rxnorm
    tests/test_offline.py  tests sin red
    requirements.txt
    run.sh
  frontend/                React + Vite + Tailwind
    src/api.js             cliente del backend
    src/App.jsx            la interfaz de mostrador
```

## Arranque rápido

### Backend
```bash
cd backend
./run.sh            # crea venv, instala deps y levanta en :8000
# o manual:
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
- API: http://localhost:8000
- Documentación interactiva: http://localhost:8000/docs
- Salud: http://localhost:8000/health

### Frontend
```bash
cd frontend
cp .env.example .env       # ajustar VITE_API_BASE si hace falta
npm install
npm run dev                # http://localhost:5173
```

### Tests
```bash
cd backend && pytest        # cubren fonética, reglas y recomendación (sin red)
```

## Endpoints

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/api/drugs/search?q=` | búsqueda fonética |
| GET | `/api/drugs` | catálogo completo |
| POST | `/api/interactions` | evalúa el carrito → veredicto + alertas + alimentarias |
| GET | `/api/recommend?q=` | líneas de tratamiento por indicación |
| GET | `/api/rules` | reglas curadas + versión (la IP) |
| POST | `/api/reload` | recarga los JSON sin reiniciar (flujo de curaduría) |
| GET | `/api/label/{inn}` | ficha oficial openFDA |
| GET | `/api/cima/{nombre}` | ficha CIMA/AEMPS |
| GET | `/api/rxnorm/{nombre}` | RxCUI |

## Flujo de curaduría (Anthony + Jaibely)

Las reglas viven en `backend/app/data/*.json`. Para añadir una interacción no se
toca código: se agrega un objeto a `rules.json` con `id`, `severity` (red|amber),
`a_tags`, `b_tags`, `mechanism`, `conduct` y `cite`. Una regla dispara si un
fármaco tiene alguna `a_tag` y el otro alguna `b_tag` (en cualquier orden). Las
etiquetas (`tags`) se asignan a cada fármaco en `drugs.json`.

Tras editar, `POST /api/reload` aplica los cambios sin reiniciar. Subí `version`
en cada cambio para trazabilidad.

## Modelo de suscripción

El dato crudo (openFDA) es gratis y comercialmente libre. El valor que se cobra es
la **curaduría**: las reglas con conducta en mostrador, el encuadre regulatorio
venezolano y la UX. Eso es IP del proyecto y vive en `data/*.json` versionado.

## Producción (pendientes)

- Cambiar el cache en memoria por Redis si hay varios workers.
- Traducir/parafrasear al español el texto de openFDA (servicio de traducción en backend).
- Completar la integración CIMA en la ficha del frontend.
- Revisar condiciones de reutilización de CIMA antes de monetizar.
- Si se quiere cobertura de QT/Torsades, licenciar CredibleMeds (línea de Fase 3).

## Aviso

Herramienta de apoyo. No sustituye el criterio del profesional ni la ficha técnica
oficial. Producto creado con datos públicos de la U.S. FDA; openFDA no avala este producto.
