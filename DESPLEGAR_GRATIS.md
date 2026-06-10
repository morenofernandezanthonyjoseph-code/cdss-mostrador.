# Cómo dejarlo funcionando GRATIS y disponible siempre

Objetivo: subirlo una vez a internet, obtener una dirección web, y abrirla desde
el celular o la PC del mostrador cuando quieras. Sin terminales, sin pagar nada.

Son tres etapas: (A) subir el código a GitHub, (B) desplegar en Render,
(C) poner el "despertador" para que no se duerma. Hacelo en orden.

---

## ETAPA A — Subir el código a GitHub (una sola vez)

GitHub es donde vive el código para que Render lo pueda leer.

1. Entrá a **github.com** y creá una cuenta gratis (si ya tenés, iniciá sesión).
2. Arriba a la derecha, botón **"+"** → **"New repository"**.
3. Ponele un nombre, por ejemplo `cdss-mostrador`. Dejalo en **Public**.
   No marques nada más. Clic en **"Create repository"**.
4. En la página que aparece, buscá el enlace que dice
   **"uploading an existing file"** y hacé clic.
5. Abrí la carpeta `cdss` en tu computadora, seleccioná TODO lo de adentro
   (las carpetas `backend`, `frontend` y los archivos sueltos como `render.yaml`,
   `README.md`, `.gitignore`) y arrastralo a la ventana de GitHub.
   Esperá a que suban (son archivos chiquitos, es rápido).
6. Abajo, botón verde **"Commit changes"**.

Listo. Tu código ya está en internet, en tu repositorio.

---

## ETAPA B — Desplegar en Render (una sola vez)

1. Entrá a **render.com**. Clic en **"Get Started"** y elegí
   **"Sign up with GitHub"** (así quedan conectados). El plan gratis
   **no pide tarjeta de crédito**.
2. Ya dentro de Render: botón **"New +"** (arriba a la derecha) → **"Blueprint"**.
3. Render te muestra tus repositorios de GitHub. Elegí `cdss-mostrador`.
4. Render lee el archivo `render.yaml` solo y te muestra que va a crear DOS
   servicios: `cdss-backend` y `cdss-frontend`. Clic en **"Apply"** / **"Create"**.
5. Esperá unos minutos mientras los construye. Cuando terminen, cada uno tendrá
   su propia dirección, algo así:
   - backend: `https://cdss-backend.onrender.com`
   - frontend: `https://cdss-frontend.onrender.com`
   **Copiá la dirección del BACKEND**, la vas a necesitar en el paso siguiente.

### Conectar las dos piezas (el único paso que hay que hacer a mano)

El frontend necesita saber dónde está el backend.

6. En Render, entrá al servicio **`cdss-frontend`**.
7. Menú lateral → **"Environment"**.
8. Vas a ver una variable llamada **`VITE_API_BASE`** (está vacía).
   Pegale la dirección del backend que copiaste (la que termina en
   `.onrender.com`). Guardá.
9. Render reconstruye el frontend solo. Esperá a que diga "Live".

Abrí la dirección del **frontend** en el navegador. Arriba a la derecha tiene que
decir **"backend ok"**. Si dice eso, ¡ya funciona en internet!

---

## ETAPA C — El "despertador" (para que no se duerma)

El backend gratis se duerme tras 15 minutos sin uso y tarda ~40 segundos en
despertar. Para que esté siempre listo, un servicio gratuito le pega cada poco
tiempo y lo mantiene despierto.

1. Entrá a **cron-job.org** y creá una cuenta gratis.
2. **"Create cronjob"**.
3. En **"URL"** pegá la dirección de tu backend seguida de `/health`. Ejemplo:
   `https://cdss-backend.onrender.com/health`
4. En el horario / schedule, elegí **cada 10 minutos**.
5. Guardá.

Eso es todo. El despertador mantiene el motor encendido las 24 horas, dentro del
cupo gratis de Render. Ya no hay espera en el mostrador.

> Alternativa: **UptimeRobot** (uptimerobot.com) hace lo mismo, también gratis;
> creás un "monitor" tipo HTTP a la misma URL `/health` cada 5 minutos.

---

## Tenerlo como app en el celular

Abrí la dirección del frontend en el navegador del teléfono → menú → **"Agregar
a pantalla de inicio"**. Queda un ícono como cualquier app y se abre a pantalla
completa.

---

## Cuando cambies algo del código

No hay que repetir nada de esto. Subís el cambio a GitHub (o lo editás
directo en github.com) y Render **redespliega solo**. Si editaste las reglas
clínicas (`backend/app/data/*.json`), eso también viaja en el mismo flujo.

---

## Límites del plan gratis (para que no te agarren desprevenido)

- El backend gratis tiene 750 horas de cómputo al mes: alcanza justo para tenerlo
  despierto todo el mes con UN solo servicio. No levantes copias extra.
- Si en algún momento querés cero riesgo de cold start y cero despertador, el plan
  Starter de Render ($7/mes) lo deja siempre encendido. Pero para empezar, gratis
  alcanza.
- El frontend estático es gratis sin límite de tiempo y no se duerme.
