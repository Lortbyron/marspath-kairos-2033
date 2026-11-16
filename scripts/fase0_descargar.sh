#!/usr/bin/env bash
# Fase 0 · Descarga de datos oficiales NASA / USGS para el cráter Jezero.
# Guarda cada archivo en datos/crudos/ y registra URL, tamaño, SHA-256 y fecha en datos/crudos/descargas.tsv
# Uso:  bash scripts/fase0_descargar.sh          (salta lo que ya existe)
#       bash scripts/fase0_descargar.sh --geo    (incluye el mapa geológico SIM 3464, 349 MB)
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=datos/crudos; mkdir -p "$RAW"
LOG="$RAW/descargas.tsv"; [ -f "$LOG" ] || printf 'archivo\turl\tbytes\tsha256\tdescargado_utc\n' > "$LOG"

S3=https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn
MM=https://mars.nasa.gov/mmgis-maps/M20/Layers/json

FILES=(
  # BASE PRINCIPAL · Mapas de investigación científica de JPL: cráter completo (77.00–78.58 E, 17.58–19.29 N)
  # Proyección "Jezero_Crater_Projection" = la misma de los campos easting/northing del rover en MMGIS
  "jpl_ctx_dem_20m.tif|$S3/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif"
  "jpl_ctx_dem_20m.xml|$S3/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.xml"
  "jpl_ctx_orto_5m.tif|$S3/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif"
  "jpl_ctx_orto_5m.xml|$S3/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.xml"
  # Relieve y foto orbital de navegación (MRO CTX, USGS · Mars 2020 TRN) — solo mitad oeste del cráter, referencia cruzada
  "ctx_dtm_20m.tif|$S3/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif"
  "ctx_dtm_20m.xml|$S3/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.xml"
  "ctx_orto_6m.tif|$S3/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif"
  "ctx_orto_6m.xml|$S3/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.xml"
  # Capas vectoriales del mapa oficial de Perseverance (MMGIS, NASA/JPL)
  "m20_rover_actual.json|$MM/M20_waypoints_current.json"
  "m20_rover_paradas.json|$MM/M20_waypoints.json"
  "m20_rover_traza.json|$MM/M20_traverse.json"
  "m20_muestras.json|$MM/M20_SAMPLE_v3.json"
  "m20_deposito_muestras.json|$MM/M20_TF_Sample_Depot.json"
  "m20_vistas_superficie.json|$MM/M20_surfaceexperience.json"
  "m20_elipse_aterrizaje.json|$MM/JEZ_TRNEllipse_190507_line.json"
  "m20_heli_actual.json|$MM/m20_heli_waypoints_current.json"
  "m20_heli_aerodromos.json|$MM/m20_heli_waypoints.json"
  "m20_heli_vuelos.json|$MM/m20_heli_flight_path.json"
  "m20_heli_zona_prueba.json|$MM/M20_Heli_flightzone_dots.json"
  "m20_mmgis_config.json|https://mars.nasa.gov/maps/location/api/configure/get?mission=M20"
  # Clima (feed resumido de MEDA; los datos completos están en PDS → Fase 4)
  "m20_clima_feed.json|https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json"
  # Nomenclatura oficial IAU (USGS Gazetteer of Planetary Nomenclature)
  "iau_nomenclatura_marte.zip|https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip"
)
[ "${1:-}" = "--geo" ] && FILES+=("usgs_sim3464_geologia.zip|https://pubs.usgs.gov/sim/3464/sim3464_database.zip")

sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
for e in "${FILES[@]}"; do
  f="${e%%|*}"; u="${e#*|}"; out="$RAW/$f"
  if [ -s "$out" ]; then echo "· ya existe  $f"; continue; fi
  echo "↓ $f"
  curl -fL --retry 3 --retry-delay 2 -m 1800 -sS -o "$out.part" "$u"
  mv "$out.part" "$out"
  printf '%s\t%s\t%s\t%s\t%s\n' "$f" "$u" "$(stat -f%z "$out")" "$(sha "$out")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
done
echo "✓ Descargas listas en $RAW"
