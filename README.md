# MarsPath · KAIROS 2033 · Jezero

**Mapa 3D del cráter Jezero y simulación de una misión tripulada a Marte**, construido solo con datos oficiales de NASA, JPL, USGS, PDS e IAU.

Proyecto para el reto 11 **"Interplanetary survival guide: Martian map"** del NASA Space Apps Challenge 2026 (Sangolquí, Ecuador).

- 🌐 **Demo en vivo:** https://kairos-2033.vercel.app

> **Aviso.** KAIROS 2033 es una herramienta educativa y de demostración construida solo con datos oficiales de NASA/USGS/IAU, validados y con fuente verificable. Sirve como referencia y guía de estudio para preparar una misión a Marte; **no reemplaza la planificación operativa de la NASA**. Lo único hipotético es que viaje una tripulación humana.

*English summary below.*

---

## ¿Qué hace?

| | |
|---|---|
| **Mapa 3D real** | Relieve JPL CTX DEM 20 m del cráter completo con foto CTX, sol real (Mars24), nombres oficiales IAU y las 708 paradas reales de Perseverance (diferencia mediana con el mapa: 1.9 m). |
| **Capas de misiones** | Rutas de Perseverance e Ingenuity, unidades geológicas (USGS SIM 3464), relieve MOLA desde NASA Mars Trek e inspector de metadatos con la fuente de cada capa. |
| **Riesgos y pendientes** | Mapa de pendientes (0–15° / 15–20° / 20–25° / > 25°) y ruta a pie calculada sobre el DTM HiRISE de 1 m: 10.7 km, pendiente máxima 15°, dentro de los límites NASA (EVA-EXP-0042 Rev. B). |
| **Radiación** | Dosis día a día con las tasas medidas por Curiosity (RAD, cráter Gale): 1 003 mSv en 880 días, 1.67 veces el límite de carrera de NASA-STD-3001. |
| **Simulador KAIROS 2033** | 880 días: ida (185 soles), 500 soles en Jezero con 6 astronautas en turnos y el robot Galilei, y vuelta (171 soles). Trayectoria real del NASA Ames Trajectory Browser (Traj_ID 22313). |
| **Validación** | 17 de 17 pruebas automáticas: SHA-256 de cada archivo, fuentes oficiales, exactitud del relieve, límites de la ruta y coherencia de los números. |
| **Bilingüe** | Español e inglés (`?lang=es` / `?lang=en`). |

### La misión

**Ruta del lago:** aterrizaje Octavia E. Butler → depósito Three Forks → frente del delta → delta superior → margen (carbonatos) → Neretva Vallis / Cheyava Falls.
**Objetivo principal:** recuperar los 10 tubos de muestras del depósito Three Forks.

| Hito | Fecha |
|---|---|
| Lanzamiento | 2033-05-03 |
| Aterrizaje en Jezero | 2033-11-09 |
| Despegue de Marte (sol 501) | 2035-04-07 |
| Regreso a la Tierra | 2035-09-30 |

## Etiquetas de confianza

Cada dato que no está 100 % verificado aparece con su etiqueta: **verificado** · **corregido** · **calculado (derivado)** · **de otro lugar** (p. ej., radiación medida en Gale) · **pendiente** (no hay dato oficial) · **no incluido** · **supuesto** · **diseño propio** · **hipotético**.

## Estructura del repositorio

```
src/                Visor 3D, capas, simulador, vista de cerca, idiomas
  modelos/          Base Kairos D-02, astronauta KAIROS 01 y robot Galilei (armados con código)
scripts/            Descarga y procesamiento de datos oficiales (fases 0–6)
public/data/        Datos procesados listos para la web
datos/LEEME_DATOS.md  Procedencia y validación de cada dato
index.html          Punto de entrada de la app web (Vite + Three.js)
```

## Cómo correrlo

```bash
npm install
npm run dev
```

Los datos ya procesados están en `public/data/`, así que la app funciona sin descargar nada más.

### Regenerar los datos desde las fuentes oficiales (opcional)

Necesita [uv](https://docs.astral.sh/uv/) y Python 3. Los datos crudos ocupan ~1.3 GB.

```bash
bash scripts/fase0_descargar.sh --geo
uv run --with rasterio --with geopandas --with pyogrio --with pillow python -I scripts/fase0_procesar.py
python3 -I scripts/mision_calcular.py
uv run --with rasterio --with geopandas --with pyogrio --with pillow --with scikit-image python -I scripts/fase3_pendientes.py
uv run --with rasterio --with pillow --with scikit-image python -I scripts/fase3_hirise.py
python3 -I scripts/fase4_radiacion.py
python3 -I scripts/fase5_simulacion.py
python3 -I scripts/fase6_validar.py   # debe dar 17 de 17 pruebas
```

## Fuentes principales

- **NASA JPL · Mars 2020 (MMGIS):** paradas y ruta de Perseverance, muestras y depósito Three Forks, vuelos de Ingenuity, relieve y ortomosaico CTX de Jezero.
- **MRO HiRISE:** modelo de terreno de 1 m para la ruta a pie.
- **NASA Mars Trek:** relieve global MOLA (Mars Global Surveyor) y teselas HiRISE.
- **USGS Astrogeology:** mapa geológico SIM 3464 (Sun & Stack 2020) y nomenclatura planetaria IAU.
- **NASA Ames Trajectory Browser:** trayectoria Tierra–Marte–Tierra 2033.
- **NASA GISS Mars24:** posición del Sol y estaciones marcianas.
- **Curiosity RAD (NASA/JPL):** tasas de radiación en crucero y en la superficie de Gale.
- **NASA-STD-3001 Vol. 1 Rev. B · EVA-EXP-0042 Rev. B · NASA DRA 5.0:** límites de radiación, pendientes y tamaño de la tripulación.

La lista completa, con URL y suma SHA-256 de cada archivo, está en `public/data/fuentes.json` y `datos/LEEME_DATOS.md`.

---

## English summary

**MarsPath · KAIROS 2033** is a 3D map of Jezero crater and a simulation of a crewed Mars mission, built only with official NASA, JPL, USGS, PDS and IAU data. Made for NASA Space Apps Challenge 2026, challenge 11 *"Interplanetary survival guide: Martian map"*.

- **Live demo:** https://kairos-2033.vercel.app
- **Real terrain:** JPL CTX 20 m DEM + CTX imagery, real sun position (Mars24), IAU names and Perseverance's 708 stops (1.9 m median error).
- **Risks:** slope map and a 10.7 km walking route on the 1 m HiRISE DTM (max slope 15°, within NASA limits).
- **Radiation:** 1,003 mSv over 880 days using Curiosity RAD rates measured at Gale crater — 1.67× the NASA career limit.
- **Simulator:** 880-day mission (NASA Ames trajectory 22313) with a crew of 6, rotating shifts and the hypothetical robot Galilei.
- **Validation:** 17/17 automated checks. Every non-verified value carries a confidence label.

The only hypothetical element is a human crew traveling to Mars. This is an educational and demonstration tool; it does not replace NASA operational planning.

Run it: `npm install && npm run dev`.

## Licencia / License

[MIT](LICENSE)
