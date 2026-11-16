# MarsPath · Datos oficiales (Fase 0)

Todo lo que usa el mapa viene de NASA, JPL, USGS o la IAU. Ningún valor es inventado.

## Cómo regenerar
```bash
bash scripts/fase0_descargar.sh --geo        # ~840 MB a datos/crudos/ (registro en descargas.tsv con SHA-256)
uv run --with rasterio --with geopandas --with pyogrio --with pillow python -I scripts/fase0_procesar.py
```

## Qué hay en `public/data/` (≈21 MB, listo para la web)
| Carpeta / archivo | Contenido | Fuente |
|---|---|---|
| `relieve/` | Elevación real en metros, 1024 y 2048 px (≈99 y ≈50 m/px) | JPL Mars 2020 Science Investigation Map · CTX DEM 20 m |
| `textura/` | Foto orbital alineada píxel a píxel con el relieve | JPL · CTX ortomosaico 5 m |
| `capas/rover_*` | Posición actual, 708 paradas y recorrido de Perseverance | NASA/JPL MMGIS |
| `capas/muestras_roca` | 22 sitios de muestras (nombre, sol, tipo de roca) | NASA/JPL MMGIS |
| `capas/heli_*` | 72 vuelos y 73 puntos de Ingenuity (terminó en ene-2024) | NASA/JPL MMGIS |
| `capas/elipse_aterrizaje`, `deposito_three_forks`, `vistas_superficie` | Zona de aterrizaje, depósito de muestras, panorámicas | NASA/JPL MMGIS |
| `capas/nombres_iau` | 12 nombres oficiales (Jezero, Belva, Neretva Vallis…) | USGS Gazetteer / IAU |
| `capas/geologia_*` | 1304 unidades geológicas, contactos y rasgos | USGS SIM 3464 (Sun & Stack 2020) |
| `capas/clima_meda_feed.json` | Clima diario resumido. **Último dato: abril de 2024** | NASA · MEDA |
| `fuentes.json` | Ficha de cada capa: misión, instrumento, resolución, URL, SHA-256 | — |
| `validacion.json` | Comparación entre las elevaciones de la misión y el mapa | derivado |

## Sistema de referencia
- Marte, esfera IAU Mars 2000 (R = 3 396 190 m), longitud este positiva, alturas sobre el areoide.
- Relieve en la proyección **Jezero_Crater_Projection** (equirectangular, paralelo 18.4663°). Es la misma que usa NASA para el `easting`/`northing` del rover.
  `x = R·rad(lon)·cos(18.4663°)`, `y = R·rad(lat)`
- Área: lon 77.00–78.58 E, lat 17.58–19.29 N (≈89 × 101 km). Cráter completo según la IAU: centro 18.4082 N, 77.6873 E, Ø 47.5 km.

## Validación (evidencia de "coordenadas y resolución correctas")
| Puntos de la misión | n | Diferencia mediana | 95 % por debajo de |
|---|---|---|---|
| Paradas del rover | 708 | 1.9 m | 6.0 m |
| Puntos de Ingenuity | 73 | 1.8 m | 3.9 m |
| Sitios de muestras | 22 | 1.8 m | 9.6 m |

## Avisos
- **Radiación:** Perseverance no mide radiación ionizante. Para la Fase 4 se usará RAD (Curiosity, cráter Gale), etiquetado como tal.
- **Clima:** el feed resumido se detuvo en abril de 2024 y no trae viento. Los datos completos de MEDA están en PDS (Fase 4).
- **Relieve TRN de USGS** (`datos/crudos/ctx_dtm_20m.tif`): solo cubre la mitad oeste del cráter; se guarda como referencia cruzada.
- Herramienta educativa y de demostración. No está autorizada para la seguridad de misiones reales.
