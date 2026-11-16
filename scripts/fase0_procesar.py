"""Fase 0 · Procesado de datos oficiales NASA/USGS del cráter Jezero para la web.

Lee datos/crudos/ (de fase0_descargar.sh) y escribe public/data/:
  relieve/   alturas reales en metros (Uint16 cuantizado) + metadatos de georreferencia
  textura/   ortomosaico CTX remuestreado y alineado píxel a píxel con el relieve
  capas/     GeoJSON en lon/lat (Mars 2000, esfera IAU) de rover, helicóptero, muestras, nombres, geología
  fuentes.json      ficha de cada capa: misión, instrumento, resolución, URL, SHA-256, avisos
  validacion.json   elevación medida por el rover vs. elevación del mapa

Ejecutar desde Cartografia/:
  uv run --with rasterio --with geopandas --with pillow python -I scripts/fase0_procesar.py
Ningún valor se inventa: todo sale de los archivos descargados; lo derivado se marca como "derivado".
"""
import csv, json, math, sys, zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform as xy_transform
from rasterio.crs import CRS
from rasterio.transform import Affine
from PIL import Image
import geopandas as gpd

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "datos/crudos", ROOT / "public/data"
for d in ("relieve", "textura", "capas"): (OUT / d).mkdir(parents=True, exist_ok=True)

R_MARS = 3396190.0  # radio IAU Mars 2000 (m)
GEO = CRS.from_wkt('GEOGCS["Mars 2000 Sphere IAU",DATUM["D_Mars_2000_Sphere",SPHEROID["Mars_2000_Sphere_IAU",3396190,0]],'
                   'PRIMEM["Reference_Meridian",0],UNIT["Degree",0.0174532925199433]]')
LADOS = (1024, 2048)            # lado largo de los relieves para web (móvil / escritorio)
TEXTURAS = (2048, 4096)         # lado largo de las texturas
descargas = {r["archivo"]: r for r in csv.DictReader(open(RAW / "descargas.tsv"), delimiter="\t")}
ahora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
log = lambda *a: print("·", *a, flush=True)


def ficha_descarga(nombre):
    d = descargas[nombre]
    return {"url": d["url"], "bytes": int(d["bytes"]), "sha256": d["sha256"], "descargado_utc": d["descargado_utc"]}


# ───────────────────────── 1. Relieve (JPL CTX DEM 20 m, cráter completo) ─────────────────────────
dem_src = rasterio.open(RAW / "jpl_ctx_dem_20m.tif")
CRS_J = dem_src.crs                                   # Jezero_Crater_Projection (equirectangular, paralelo 18.4663°)
LAT_TS = float(CRS_J.to_dict().get("lat_ts", 18.4663)) if CRS_J.to_dict() else 18.4663
full = dem_src.read(1, masked=True).astype("float64")
nod = full.mask if full.mask is not np.False_ else np.zeros(full.shape, bool)
hmin, hmax = float(full.min()), float(full.max())
log(f"DEM {dem_src.width}×{dem_src.height} @20 m · altura {hmin:.1f} … {hmax:.1f} m · sin dato {nod.mean()*100:.3f}%")

relieves = []
for lado in LADOS:
    s = lado / max(dem_src.width, dem_src.height)
    w, h = round(dem_src.width * s), round(dem_src.height * s)
    arr = dem_src.read(1, out_shape=(h, w), resampling=Resampling.average, masked=True).astype("float64")
    tr = dem_src.transform * Affine.scale(dem_src.width / w, dem_src.height / h)
    q = np.zeros((h, w), np.uint16)                   # 0 = sin dato; 1..65535 = altura
    valid = ~np.ma.getmaskarray(arr)
    q[valid] = np.round((arr[valid] - hmin) / (hmax - hmin) * 65534 + 1).astype(np.uint16)
    nombre = f"jezero_relieve_{w}x{h}.u16"
    (OUT / "relieve" / nombre).write_bytes(q.astype("<u2").tobytes())
    relieves.append({"archivo": f"relieve/{nombre}", "ancho": w, "alto": h, "m_por_pixel_x": tr.a, "m_por_pixel_y": -tr.e,
                     "transform_afin": list(tr)[:6]})
    log(f"relieve {w}×{h} ({tr.a:.1f} m/px) → {nombre}")

L, B, Rt, T = dem_src.bounds
lon0, lat0 = [v[0] for v in xy_transform(CRS_J, GEO, [L], [B])]
lon1, lat1 = [v[0] for v in xy_transform(CRS_J, GEO, [Rt], [T])]
meta_relieve = {
    "descripcion": "Elevación real del cráter Jezero (m, respecto al areoide de Marte). Uint16 little-endian, fila 0 = norte.",
    "decodificar": "altura_m = hmin + (v - 1) / 65534 * (hmax - hmin); v = 0 → sin dato",
    "hmin_m": hmin, "hmax_m": hmax, "precision_m": (hmax - hmin) / 65534,
    "crs_wkt": CRS_J.to_wkt(), "radio_marte_m": R_MARS, "paralelo_estandar_deg": 18.4663,
    "lonlat_a_metros": "x = R·rad(lon)·cos(18.4663°) ; y = R·rad(lat)   (mismo sistema que easting/northing del rover en MMGIS)",
    "limites_m": {"oeste": L, "sur": B, "este": Rt, "norte": T},
    "limites_lonlat": {"oeste": lon0, "sur": lat0, "este": lon1, "norte": lat1},
    "tamano_km": [(Rt - L) / 1000, (T - B) / 1000],
    "versiones": relieves,
}
(OUT / "relieve/jezero_relieve.json").write_text(json.dumps(meta_relieve, indent=2, ensure_ascii=False))

# ───────────────────────── 2. Textura (JPL CTX ortomosaico 5 m) alineada al relieve ─────────────────────────
with rasterio.open(RAW / "jpl_ctx_orto_5m.tif") as o:
    for lado in TEXTURAS:
        s = lado / max(dem_src.width, dem_src.height)
        w, h = round(dem_src.width * s), round(dem_src.height * s)
        dst = np.zeros((h, w), np.uint8)
        reproject(source=rasterio.band(o, 1), destination=dst, src_crs=o.crs, src_transform=o.transform, src_nodata=0,
                  dst_crs=CRS_J, dst_transform=dem_src.transform * Affine.scale(dem_src.width / w, dem_src.height / h),
                  dst_nodata=0, resampling=Resampling.average)
        nombre = f"jezero_ctx_{w}x{h}.jpg"
        Image.fromarray(dst, "L").save(OUT / "textura" / nombre, quality=88, optimize=True, progressive=True)
        log(f"textura {w}×{h} → {nombre}  (vacío {(dst == 0).mean()*100:.2f}%)")
        meta_relieve.setdefault("texturas", []).append({"archivo": f"textura/{nombre}", "ancho": w, "alto": h})
(OUT / "relieve/jezero_relieve.json").write_text(json.dumps(meta_relieve, indent=2, ensure_ascii=False))

# ───────────────────────── 3. Capas vectoriales de la misión (NASA/JPL MMGIS) ─────────────────────────
MMGIS = {  # archivo crudo → (salida, título, misión)
    "m20_rover_actual.json": ("rover_posicion_actual", "Posición actual de Perseverance", "Mars 2020 · Perseverance"),
    "m20_rover_paradas.json": ("rover_paradas", "Paradas del rover (sol, elevación, distancia)", "Mars 2020 · Perseverance"),
    "m20_rover_traza.json": ("rover_traza", "Recorrido del rover", "Mars 2020 · Perseverance"),
    "m20_muestras.json": ("muestras_roca", "Sitios de muestras (núcleos de roca, regolito, atmósfera)", "Mars 2020 · Perseverance"),
    "m20_deposito_muestras.json": ("deposito_three_forks", "Depósito de muestras Three Forks", "Mars 2020 · Perseverance"),
    "m20_vistas_superficie.json": ("vistas_superficie", "Panorámicas de superficie", "Mars 2020 · Perseverance"),
    "m20_elipse_aterrizaje.json": ("elipse_aterrizaje", "Elipse de aterrizaje Mars 2020", "Mars 2020"),
    "m20_heli_actual.json": ("heli_posicion_final", "Última posición de Ingenuity (misión terminada ene-2024)", "Mars 2020 · Ingenuity"),
    "m20_heli_aerodromos.json": ("heli_aerodromos", "Aeródromos/puntos de Ingenuity", "Mars 2020 · Ingenuity"),
    "m20_heli_vuelos.json": ("heli_vuelos", "Trayectorias de los 72 vuelos de Ingenuity", "Mars 2020 · Ingenuity"),
    "m20_heli_zona_prueba.json": ("heli_zona_prueba", "Zona de pruebas de vuelo de Ingenuity", "Mars 2020 · Ingenuity"),
}
capas = []
for crudo, (salida, titulo, mision) in MMGIS.items():
    gj = json.loads((RAW / crudo).read_text())
    n = len(gj.get("features", []))
    (OUT / "capas" / f"{salida}.geojson").write_text(json.dumps(gj, separators=(",", ":"), ensure_ascii=False))
    capas.append({"id": salida, "titulo": titulo, "mision": mision, "tipo": "vector", "archivo": f"capas/{salida}.geojson",
                  "elementos": n, "proyeccion": "lon/lat Mars 2000 (este positivo)", "proveedor": "NASA/JPL · MMGIS (mapa oficial de ubicación)",
                  "fuente": ficha_descarga(crudo)})
    log(f"capa {salida}: {n} elementos")

# ───────────────────────── 4. Nomenclatura oficial IAU dentro del área ─────────────────────────
nom = gpd.read_file(f"zip://{RAW / 'iau_nomenclatura_marte.zip'}!MARS_nomenclature_center_pts.shp")
cl = nom["center_lon"].where(nom["center_lon"] <= 180, nom["center_lon"] - 360)
sel = nom[(cl >= lon0) & (cl <= lon1) & (nom["center_lat"] >= lat0) & (nom["center_lat"] <= lat1)].copy()
sel = sel[["name", "type", "diameter", "center_lon", "center_lat", "approval", "approvaldt", "origin", "link", "geometry"]]
sel = gpd.GeoDataFrame(sel.drop(columns="geometry"), geometry=gpd.points_from_xy(sel.center_lon, sel.center_lat), crs=GEO.to_wkt())
sel.to_file(OUT / "capas/nombres_iau.geojson", driver="GeoJSON")
capas.append({"id": "nombres_iau", "titulo": "Nombres oficiales IAU", "mision": "IAU / USGS Gazetteer", "tipo": "vector",
              "archivo": "capas/nombres_iau.geojson", "elementos": len(sel), "proyeccion": "lon/lat Mars 2000",
              "proveedor": "USGS Gazetteer of Planetary Nomenclature", "fuente": ficha_descarga("iau_nomenclatura_marte.zip"),
              "nota": "Solo nombres aprobados por la IAU. Nombres informales de la misión (Séítah, Máaz…) vienen en otras capas o en SIM 3464."})
log(f"nombres IAU en el área: {len(sel)} → {', '.join(sel.name.head(12))}…")

# ───────────────────────── 5. Mapa geológico USGS SIM 3464 ─────────────────────────
GDB = f"zip://{RAW / 'usgs_sim3464_geologia.zip'}!sim3464_JezeroNili_FINAL/Geodatabase/Nili.gdb"
GEO_CAPAS = {  # capa gdb → (salida, título, campos, tolerancia de simplificación en m)
    "GeoUnits_v1": ("geologia_unidades", "Unidades geológicas", ["unit", "name", "symbol", "Color_ID"], 15),
    "GeoContacts": ("geologia_contactos", "Contactos geológicos", ["TYPE"], 15),
    "LinearFeatures": ("geologia_rasgos_lineales", "Rasgos lineales (escarpes, crestas, canales)", ["TYPE"], 15),
    "SurfaceFeatures": ("geologia_rasgos_superficie", "Rasgos de superficie (dunas, etc.)", ["TYPE"], 15),
    "LocationFeatures": ("geologia_puntos", "Rasgos puntuales", ["TYPE"], 0),
    "MapBoundary": ("geologia_limite_mapa", "Límite del mapa geológico", ["QUAD_NAME"], 0),
}
for capa, (salida, titulo, campos, tol) in GEO_CAPAS.items():
    g = gpd.read_file(GDB, layer=capa)
    g = g[[c for c in campos if c in g.columns] + ["geometry"]]
    if tol: g["geometry"] = g.geometry.simplify(tol, preserve_topology=True)
    g = g.to_crs(GEO.to_wkt())
    g.to_file(OUT / f"capas/{salida}.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)
    tipos = sorted(map(str, g[campos[0]].dropna().unique()))[:40] if campos[0] in g else []
    capas.append({"id": salida, "titulo": titulo, "mision": "USGS SIM 3464 (Sun & Stack 2020)", "tipo": "vector",
                  "archivo": f"capas/{salida}.geojson", "elementos": len(g), "proyeccion": "lon/lat Mars 2000 (reproyectado desde MTM 77.5E)",
                  "proveedor": "USGS · Geologic map of Jezero crater and the Nili Planum region, Mars (SIM 3464, 1:75 000)",
                  "doi": "https://doi.org/10.3133/sim3464", "simplificado_m": tol, "valores": tipos,
                  "fuente": ficha_descarga("usgs_sim3464_geologia.zip")})
    log(f"geología {salida}: {len(g)} elementos")

# ───────────────────────── 6. Clima (instantánea del feed MEDA) ─────────────────────────
clima = json.loads((RAW / "m20_clima_feed.json").read_text())
soles = clima.get("sols", [])
(OUT / "capas/clima_meda_feed.json").write_text(json.dumps(clima, indent=1, ensure_ascii=False))
ultimo = soles[-1]["terrestrial_date"] if soles else None
capas.append({"id": "clima_meda_feed", "titulo": "Clima diario en Jezero (feed resumido MEDA)", "mision": "Mars 2020 · MEDA",
              "tipo": "tabla", "archivo": "capas/clima_meda_feed.json", "elementos": len(soles), "fuente": ficha_descarga("m20_clima_feed.json"),
              "aviso": f"Feed detenido: último dato {ultimo}. No incluye viento ni radiación. Datos completos (viento, humedad, polvo, UV) en PDS Atmospheres → Fase 4."})

# ───────────────────────── 7. Validación: elevación del rover vs. mapa ─────────────────────────
def muestrear(lons, lats):
    xs, ys = xy_transform(GEO, CRS_J, lons, lats)
    inv = ~dem_src.transform
    out = []
    for x, y in zip(xs, ys):
        c, r = inv * (x, y); c -= .5; r -= .5
        c0, r0 = int(math.floor(c)), int(math.floor(r))
        if not (0 <= c0 < dem_src.width - 1 and 0 <= r0 < dem_src.height - 1): out.append(None); continue
        fx, fy = c - c0, r - r0; v = full[r0:r0 + 2, c0:c0 + 2]
        out.append(float(v[0, 0] * (1 - fx) * (1 - fy) + v[0, 1] * fx * (1 - fy) + v[1, 0] * (1 - fx) * fy + v[1, 1] * fx * fy))
    return out

def comparar(nombre, feats, campo_elev):
    pts = [(f["properties"]["lon"] if "lon" in f["properties"] else f["properties"]["Lon"],
            f["properties"]["lat"] if "lat" in f["properties"] else f["properties"]["Lat"],
            f["properties"].get(campo_elev)) for f in feats]
    pts = [p for p in pts if p[2] not in (None, -9999.0) and isinstance(p[2], (int, float))]
    mapa = muestrear([p[0] for p in pts], [p[1] for p in pts])
    d = np.array([m - p[2] for m, p in zip(mapa, pts) if m is not None])
    if not len(d): return None
    return {"capa": nombre, "puntos": int(len(d)), "dif_media_m": round(float(d.mean()), 2), "dif_mediana_abs_m": round(float(np.median(abs(d))), 2),
            "dif_p95_abs_m": round(float(np.percentile(abs(d), 95)), 2), "dif_max_abs_m": round(float(abs(d).max()), 2)}

val = [comparar("rover_paradas (elev_geoid)", json.loads((RAW / "m20_rover_paradas.json").read_text())["features"], "elev_geoid"),
       comparar("heli_aerodromos (Elev_Geoid)", json.loads((RAW / "m20_heli_aerodromos.json").read_text())["features"], "Elev_Geoid")]
smp = [f for f in json.loads((RAW / "m20_muestras.json").read_text())["features"]]
for f in smp:
    try: f["properties"]["elev"] = float(f["properties"]["elev"])
    except (TypeError, ValueError): f["properties"]["elev"] = None
val.append(comparar("muestras_roca (elev)", smp, "elev"))
validacion = {"generado_utc": ahora, "mapa": "JPL CTX DEM 20 m (M20_JezeroCrater_CTXDEM_20m)", "metodo":
              "Interpolación bilineal del DEM a resolución completa en la lon/lat de cada punto; diferencia = mapa − elevación reportada por la misión.",
              "interpretacion": "Diferencias de pocos metros confirman que coordenadas, proyección y alturas están bien alineadas. "
                                 "El DEM de 20 m suaviza rocas y bordes, por eso no es cero.", "resultados": [v for v in val if v]}
(OUT / "validacion.json").write_text(json.dumps(validacion, indent=2, ensure_ascii=False))
for v in validacion["resultados"]: log("validación", v)

# ───────────────────────── 8. Manifiesto de fuentes ─────────────────────────
rasters = [
    {"id": "relieve_jpl_ctx", "titulo": "Relieve del cráter Jezero", "tipo": "raster", "mision": "MRO · CTX (estéreo)",
     "proveedor": "NASA/JPL · Mars 2020 Science Investigation Maps (vía USGS Astrogeology)", "resolucion_original_m": 20,
     "proyeccion": "Jezero_Crater_Projection (equirectangular, paralelo 18.4663°, esfera IAU 3 396 190 m)",
     "archivo": "relieve/jezero_relieve.json", "derivado": "remuestreo por promedio a 1024 y 2048 px; cuantizado a Uint16",
     "fuente": ficha_descarga("jpl_ctx_dem_20m.tif")},
    {"id": "textura_jpl_ctx", "titulo": "Ortomosaico CTX (foto orbital)", "tipo": "raster", "mision": "MRO · CTX",
     "proveedor": "NASA/JPL · Mars 2020 Science Investigation Maps (vía USGS Astrogeology)", "resolucion_original_m": 5,
     "proyeccion": "reproyectado a la malla del relieve", "archivo": "textura/", "derivado": "remuestreo por promedio, JPEG calidad 88",
     "fuente": ficha_descarga("jpl_ctx_orto_5m.tif")},
    {"id": "relieve_trn_ctx", "titulo": "Relieve CTX de navegación (TRN) — referencia", "tipo": "raster", "mision": "MRO · CTX",
     "proveedor": "USGS Astrogeology · Mars 2020 Terrain Relative Navigation", "resolucion_original_m": 20,
     "nota": "Solo cubre la mitad oeste del cráter (77.16–77.70 E). Se guarda como referencia cruzada; no se publica.",
     "fuente": ficha_descarga("ctx_dtm_20m.tif")},
]
servicios = [
    {"id": "trek_mola", "titulo": "Relieve global MOLA sombreado (contexto)", "mision": "MGS · MOLA", "resolucion_m": 463, "tipo": "teselas WMTS",
     "url": "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
     "proveedor": "NASA Mars Trek", "cors": "verificado: Access-Control-Allow-Origin *", "nivel_max": 7, "m_por_pixel_nivel_max": 326},
    {"id": "trek_hirise_jezero", "titulo": "HiRISE Jezero 25 cm", "mision": "MRO · HiRISE", "resolucion_m": 0.25, "tipo": "teselas WMTS",
     "capacidades": "https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/WMTSCapabilities.xml",
     "proveedor": "NASA Mars Trek", "cors": "verificado: Access-Control-Allow-Origin *"},
    {"id": "jpl_color_basemap", "titulo": "Mapa base a color HiRISE+CTX 25 cm (mapa oficial del rover)", "mision": "MRO · HiRISE/CTX", "resolucion_m": 0.25,
     "tipo": "teselas TMS (EPSG:3857)", "url": "https://mars.nasa.gov/mmgis-maps/M20/Layers/M20_HiRISE_RGB_CTX_mosaic_25cm_v7_Merge_LERC_clip/{z}/{x}/{y}.png",
     "proveedor": "NASA/JPL MMGIS", "cors": "no permitido desde el navegador (sin Access-Control-Allow-Origin)"},
    {"id": "jpl_nombres", "titulo": "Etiquetas de lugares (oficiales e informales de la misión)", "mision": "Mars 2020", "tipo": "teselas TMS",
     "url": "https://mars.nasa.gov/mmgis-maps/M20/Layers/M20_Placenames_175k_800dpi/{z}/{x}/{y}.png", "proveedor": "NASA/JPL MMGIS", "cors": "no permitido desde el navegador (sin Access-Control-Allow-Origin)"},
]
pendientes = [
    {"tema": "Clima completo (viento, humedad, polvo, UV)", "fuente": "PDS Atmospheres · Mars 2020 MEDA",
     "url": "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html", "fase": 4},
    {"tema": "Radiación ionizante en superficie", "fuente": "PDS PPI · MSL RAD (Curiosity)", "url": "https://pds-ppi.igpp.ucla.edu/", "fase": 4,
     "aviso": "Perseverance no mide radiación ionizante. RAD mide en el cráter Gale: debe etiquetarse 'medido en Gale por Curiosity'."},
    {"tema": "Hora solar marciana", "fuente": "NASA GISS Mars24", "url": "https://www.giss.nasa.gov/tools/mars24/help/algorithm.html", "fase": 4},
    {"tema": "Pendientes y zonas de riesgo", "fuente": "derivado del relieve JPL CTX 20 m", "fase": 3},
]
fuentes = {
    "proyecto": "MarsPath · NASA Space Apps reto 11 · cráter Jezero", "generado_utc": ahora,
    "aviso": "Herramienta educativa y de demostración basada en datos públicos de NASA/USGS. No es una herramienta autorizada para la seguridad de misiones reales.",
    "crater": {"nombre": "Jezero", "centro_lon": 77.6873, "centro_lat": 18.4082, "diametro_km": 47.5212,
               "fuente": "IAU / USGS Gazetteer of Planetary Nomenclature", "url": "https://planetarynames.wr.usgs.gov/Feature/14300"},
    "sistema_referencia": {"cuerpo": "Marte", "datum": "Mars 2000 esfera IAU", "radio_m": R_MARS, "longitudes": "este positivo, -180..180",
                           "alturas": "metros respecto al areoide (geoide marciano)"},
    "rasters": rasters, "capas": capas, "servicios_teselas": servicios, "pendientes": pendientes,
    "validacion": "validacion.json",
}
(OUT / "fuentes.json").write_text(json.dumps(fuentes, indent=2, ensure_ascii=False))
log(f"✓ fuentes.json con {len(rasters)} rásters, {len(capas)} capas, {len(servicios)} servicios")
