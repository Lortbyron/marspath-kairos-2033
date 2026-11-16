"""Fase 3 · Riesgos y pendientes de la Misión KAIROS 2033.

Todo sale del relieve oficial JPL CTX DEM 20 m (datos/crudos/jpl_ctx_dem_20m.tif):
  1. Pendiente de cada celda de 20 m (derivado: arctan del gradiente del relieve).
  2. Clases de pendiente según límites publicados por la NASA (ver LIMITES, con fuente y página).
  3. Ruta más segura entre las paradas de KAIROS: el camino más corto que NUNCA pisa más de 10°;
     si no existe, se permite 15°; nunca más de 20° (límite NASA para caminar con traje y para el rover presurizado).
  4. Validación: pendientes del relieve bajo el recorrido real de Perseverance.

Uso: uv run --with rasterio --with geopandas --with pyogrio --with pillow --with scikit-image python -I scripts/fase3_pendientes.py
"""
import json, math, hashlib, datetime as dt
from pathlib import Path
import numpy as np, rasterio, geopandas as gpd
from rasterio.warp import reproject, Resampling
from rasterio.transform import Affine
from shapely.geometry import LineString
from shapely.ops import transform as shp_transform
from skimage.graph import MCP_Geometric
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
RAW, OUT = RAIZ / "datos/crudos", RAIZ / "public/data"
(OUT / "riesgos").mkdir(parents=True, exist_ok=True)
R_MARS, LAT_TS = 3396190.0, 18.4663
K = math.cos(math.radians(LAT_TS))
log = lambda *a: print("·", *a)

# ───────── Límites de pendiente publicados por la NASA (verificados en el documento original) ─────────
LIMITES = [
    {"id": "caminar_traje", "grados": 20, "quien": "Astronauta caminando con traje",
     "cita": "Walking up/down/across a slope of up to 20° [Note: Apollo 15 traversed on slopes of ~17°]",
     "documento": "NASA EVA-EXP-0042 Rev. B, Exploration EVA System Concept of Operations (19-oct-2020), p. 38",
     "url": "https://www.nasa.gov/wp-content/uploads/2017/02/eva-exp-0042_xeva_system_con_ops_rev_b_final_dtd_10192020_ref_doc.pdf"},
    {"id": "rover_presurizado", "grados": 20, "quien": "Rover presurizado (cabina con aire)",
     "cita": "able to handle local slopes of up to 20° and rock sizes of up to 30 cm",
     "documento": "NASA EVA-EXP-0042 Rev. B, sección del rover presurizado (cita ISECG 2018), p. 65",
     "url": "https://www.nasa.gov/wp-content/uploads/2017/02/eva-exp-0042_xeva_system_con_ops_rev_b_final_dtd_10192020_ref_doc.pdf"},
    {"id": "rover_abierto_apollo", "grados": 25, "quien": "Rover abierto tipo Apollo (LRV), cargado al máximo",
     "cita": "Climbing a 25-deg slope fully loaded",
     "documento": "NASA TM X-64623, Mobility Systems Activity for Lunar Rovers at MSFC (9-sep-1971): especificación del LRV",
     "url": "https://ntrs.nasa.gov/citations/19720004516",
     "nota": "En Apollo 15 la pendiente más fuerte que encontró el LRV fue de 10–15° (mismo documento)."},
    {"id": "perseverance", "grados": 30, "quien": "Perseverance (robot, sin personas)",
     "cita": "Perseverance is designed to withstand a 45-degree tilt in any direction without tipping over. For added protection, rover drivers avoid terrains that would tilt the rover more than 30 degrees.",
     "documento": "NASA Science · Mars 2020 rover components",
     "url": "https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/"},
]
APOLLO = {"cita": "Las tripulaciones de Apollo 15–17 trabajaron en laderas de 15–20°; subir a pie una ladera de ≈15° con suelo suelto "
                  "fue 'como subir una duna de arena' (Scott, Apollo 15). El plan incluía 1 min de descanso por cada 5 min de subida.",
          "documento": "Eppler et al., LPSC 2025, resumen 2023: Lunar highland terrain walking EVA operations",
          "url": "https://www.hou.usra.edu/meetings/lpsc2025/pdf/2023.pdf"}
AVISO_LUNA = ("Los límites de traje y rover vienen de documentos del programa Artemis (Luna, gravedad 0.17 g). "
              "La NASA aún no publica un límite de pendiente para caminar en Marte (0.38 g): se usan como referencia y queda como dato pendiente.")
CLASES = [  # límite inferior (°), nombre, color RGBA del calco
    (0,  "0–15° · transitable",                          None),
    (15, "15–20° · difícil: cerca del límite NASA",       (255, 214, 64, 150)),
    (20, "20–25° · fuera del límite para caminar y para el rover presurizado", (255, 128, 32, 175)),
    (25, "más de 25° · fuera del límite de cualquier vehículo con personas", (220, 30, 40, 200)),
]

# ───────── 1. Relieve y pendiente ─────────
src = rasterio.open(RAW / "jpl_ctx_dem_20m.tif")
z = src.read(1).astype(np.float64)
valido = np.isfinite(z) & (z > -1e4)
z[~valido] = np.nan
res = src.res[0]
gy, gx = np.gradient(z, res, res)              # m/m en metros proyectados (≈ verdaderos a la latitud de Jezero)
pend = np.degrees(np.arctan(np.hypot(gx, gy)))
pend[~np.isfinite(pend)] = np.nan
log(f"pendiente: {pend.shape[1]}×{pend.shape[0]} celdas de {res:.0f} m, mediana {np.nanmedian(pend):.1f}°, máx {np.nanmax(pend):.1f}°")

def a_pixel(lon, lat):
    x, y = R_MARS * math.radians(lon) * K, R_MARS * math.radians(lat)
    c, r = ~src.transform * (x, y)
    return int(r), int(c)
def a_lonlat(r, c):
    x, y = src.transform * (c + .5, r + .5)
    return [round(math.degrees(x / (R_MARS * K)), 6), round(math.degrees(y / R_MARS), 6)]

# Área por clase: todo el mapa y dentro del cráter (círculo IAU, Ø 47.52 km)
cx, cy = R_MARS * math.radians(77.6873) * K, R_MARS * math.radians(18.4082)
cols, rows = np.meshgrid(np.arange(src.width), np.arange(src.height))
X = src.transform.c + (cols + .5) * res; Y = src.transform.f - (rows + .5) * res
dentro = (np.hypot(X - cx, Y - cy) <= 47521.2 / 2) & valido
del cols, rows, X, Y
def reparto(mask):
    p = pend[mask]; n = p.size; lim = [c[0] for c in CLASES] + [99]
    return [{"clase": CLASES[i][1], "km2": round(((p >= lim[i]) & (p < lim[i + 1])).sum() * res * res / 1e6, 2),
             "porcentaje": round(100 * ((p >= lim[i]) & (p < lim[i + 1])).sum() / n, 2)} for i in range(len(CLASES))]
areas = {"todo_el_mapa": reparto(valido), "dentro_del_crater": reparto(dentro)}

# ───────── 2. Rasters para la web (remuestreo por MÁXIMO: si una celda de 20 m es peligrosa, el píxel se marca) ─────────
def remuestrear_max(w, h):
    dst = np.full((h, w), np.nan, np.float32)
    reproject(pend.astype(np.float32), dst, src_transform=src.transform, src_crs=src.crs, src_nodata=np.nan,
              dst_transform=src.transform * Affine.scale(src.width / w, src.height / h), dst_crs=src.crs,
              dst_nodata=np.nan, resampling=Resampling.max)
    return dst
calco = remuestrear_max(2228, 2534)
rgba = np.zeros(calco.shape + (4,), np.uint8)
for lo, _, col in CLASES:
    if col: rgba[calco >= lo] = col
Image.fromarray(rgba, "RGBA").save(OUT / "riesgos/pendiente_clases_2228x2534.png", optimize=True)
tip = remuestrear_max(1801, 2048)
u8 = np.where(np.isfinite(tip), np.clip(np.round(tip * 4), 0, 254) + 1, 0).astype(np.uint8)   # 0 = sin dato; grados = (v-1)/4
(OUT / "riesgos/pendiente_max_1801x2048.u8").write_bytes(u8.tobytes())
log("calco de clases y rejilla de pendiente máxima escritos")

# ───────── 3. Ruta más segura entre paradas ─────────
plan = json.loads((OUT / "mision/plan_mision.json").read_text())
paradas = plan["ruta"]
px = [a_pixel(p["lon"], p["lat"]) for p in paradas]
m = 250                                                        # 5 km de margen alrededor de las paradas
r0, r1 = max(0, min(p[0] for p in px) - m), min(src.height, max(p[0] for p in px) + m)
c0, c1 = max(0, min(p[1] for p in px) - m), min(src.width, max(p[1] for p in px) + m)
P = pend[r0:r1, c0:c1]; Z = z[r0:r1, c0:c1]

def camino(a, b, umbral):
    costo = np.where(np.isfinite(P) & (P <= umbral), 1.0, np.inf)
    a, b = (a[0] - r0, a[1] - c0), (b[0] - r0, b[1] - c0)
    if not (np.isfinite(costo[a]) and np.isfinite(costo[b])): return None
    mcp = MCP_Geometric(costo, fully_connected=True)
    acum, _ = mcp.find_costs([a], [b])
    if not np.isfinite(acum[b]): return None
    return [(r + r0, c + c0) for r, c in mcp.traceback(b)]

def perfil(celdas):
    rr, cc = np.array([c[0] for c in celdas]), np.array([c[1] for c in celdas])
    paso = np.hypot(np.diff(rr), np.diff(cc)) * res
    zz, pp = z[rr, cc], pend[rr, cc]
    dz = np.diff(zz)
    largo = float(paso.sum())
    clase = lambda lo, hi: round(100 * float(paso[(pp[1:] >= lo) & (pp[1:] < hi)].sum()) / largo, 1) if largo else 0
    return {"largo_m": round(largo), "sube_m": round(float(dz[dz > 0].sum())), "baja_m": round(float(-dz[dz < 0].sum())),
            "pendiente_max": round(float(np.nanmax(pp)), 1), "pendiente_media": round(float(np.nanmean(pp)), 1),
            "pct_0_10": clase(0, 10), "pct_10_15": clase(10, 15), "pct_15_20": clase(15, 20), "pct_mas_20": clase(20, 99),
            "alt_inicio_m": round(float(zz[0])), "alt_fin_m": round(float(zz[-1]))}

def recta(a, b):
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
    return [(int(round(a[0] + (b[0] - a[0]) * t)), int(round(a[1] + (b[1] - a[1]) * t))) for t in np.linspace(0, 1, n)]

geo_ruta, tramos = [], []
for i in range(len(paradas) - 1):
    a, b = px[i], px[i + 1]
    for umbral in (10, 15, 20):
        cel = camino(a, b, umbral)
        if cel: break
    t = {"desde": paradas[i]["nombre"], "hasta": paradas[i + 1]["nombre"], "umbral_usado": umbral if cel else None}
    if cel:
        t |= perfil(cel)
        t["a_pie_2km"] = t["largo_m"] <= 2000
        t["horas_a_2kmh"] = round(t["largo_m"] / 2000, 2)
        coords = [a_lonlat(r, c) for r, c in cel[::3]] + [a_lonlat(*cel[-1])]
        coords[0], coords[-1] = [paradas[i]["lon"], paradas[i]["lat"]], [paradas[i + 1]["lon"], paradas[i + 1]["lat"]]
        geo_ruta.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": coords},
                         "properties": {k: v for k, v in t.items()} | {"tramo": i + 1}})
    lr = perfil(recta(a, b))
    t["linea_recta"] = {"largo_m": lr["largo_m"], "pendiente_max": lr["pendiente_max"], "pct_mas_20": lr["pct_mas_20"], "pct_15_20": lr["pct_15_20"]}
    tramos.append(t)
    log(f"tramo {i+1}: {t['desde']} → {t['hasta']}: {t.get('largo_m')} m, máx {t.get('pendiente_max')}° (umbral {t['umbral_usado']}°) · recta máx {lr['pendiente_max']}°")

# Arena (unidad Aeb del mapa USGS SIM 3464): riesgo de quedar atascado (como Spirit en 2009) → solo informativo
geo = gpd.read_file(OUT / "capas/geologia_unidades.geojson")
aeb = geo[geo["symbol"].str.strip() == "Aeb"] if "symbol" in geo else geo.iloc[0:0]
a_metros = lambda g: shp_transform(lambda lon, lat, z=None: (R_MARS * np.radians(lon) * K, R_MARS * np.radians(lat)), g)  # mismo sistema del relieve
arena = a_metros(aeb.geometry.union_all()) if len(aeb) else None
for f in geo_ruta:
    linea = a_metros(LineString(f["geometry"]["coordinates"]))
    sobre = float(linea.intersection(arena).length) if arena is not None else 0.0
    f["properties"]["arena_m"] = round(sobre)
    tramos[f["properties"]["tramo"] - 1]["arena_m"] = round(sobre)

(OUT / "riesgos/ruta_segura.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": geo_ruta}, ensure_ascii=False))

# ───────── 4. Validación con el recorrido real de Perseverance ─────────
traza = json.loads((OUT / "capas/rover_traza.geojson").read_text())
vals = []
for f in traza["features"]:
    g = f["geometry"]; ls = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
    for l in ls:
        for lon, lat, *_ in l:
            r, c = a_pixel(lon, lat)
            if 0 <= r < src.height and 0 <= c < src.width and np.isfinite(pend[r, c]): vals.append(pend[r, c])
vals = np.array(vals)
validacion = {"puntos": int(vals.size), "mediana": round(float(np.median(vals)), 1), "p95": round(float(np.percentile(vals, 95)), 1),
              "max": round(float(vals.max()), 1), "pct_mas_15": round(100 * float((vals > 15).mean()), 2), "pct_mas_20": round(100 * float((vals > 20).mean()), 2),
              "lectura": "Pendiente del relieve de 20 m bajo cada punto del recorrido real de Perseverance (límite de conducción: 30° de inclinación)."}
log(f"Perseverance: mediana {validacion['mediana']}°, p95 {validacion['p95']}°, máx {validacion['max']}°")

total = {k: sum(t.get(k, 0) or 0 for t in tramos) for k in ("largo_m", "sube_m", "baja_m", "arena_m")}
total["pendiente_max"] = max(t.get("pendiente_max", 0) for t in tramos)
total["recta_largo_m"] = sum(t["linea_recta"]["largo_m"] for t in tramos)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
salida = {
    "generado_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "fuente_relieve": {"archivo": "jpl_ctx_dem_20m.tif", "sha256": sha(RAW / "jpl_ctx_dem_20m.tif"), "resolucion_m": res},
    "metodo": {"pendiente": "derivado: arctan(|gradiente|) del relieve JPL CTX DEM 20 m (diferencias centrales).",
               "ruta": "Camino más corto (8 direcciones) que nunca pisa una celda de 20 m con más de 10°; si no existe, 15°; nunca más de 20°. "
                       "No hay pesos inventados: solo distancia + prohibición por pendiente.",
               "rasters_web": "Remuestreo por máximo: un píxel de la web se marca con la celda de 20 m más empinada que contiene.",
               "limitacion": "Con celdas de 20 m no se ven rocas, escalones ni pendientes de pocos metros; en el terreno real las pendientes "
                             "locales son mayores. Para planear de verdad se usarían modelos HiRISE de 1 m."},
    "limites_nasa": LIMITES, "experiencia_apollo": APOLLO, "aviso_luna_marte": AVISO_LUNA,
    "clases": [{"desde": c[0], "nombre": c[1], "color": None if not c[2] else "#%02x%02x%02x" % c[2][:3]} for c in CLASES],
    "areas": areas, "tramos": tramos, "total": total, "validacion_perseverance": validacion,
    "archivos": {"calco": "riesgos/pendiente_clases_2228x2534.png", "pendiente_max": "riesgos/pendiente_max_1801x2048.u8",
                 "pendiente_max_decodificar": "grados = (v - 1) / 4 ; v = 0 → sin dato ; fila 0 = norte", "ruta": "riesgos/ruta_segura.geojson"},
}
(OUT / "riesgos/pendientes.json").write_text(json.dumps(salida, indent=1, ensure_ascii=False))
log("total ruta:", total)
log("áreas dentro del cráter:", areas["dentro_del_crater"])

# ───────── Fichas en fuentes.json (para el botón "i" del mapa, con huella SHA-256 del relieve usado) ─────────
fu_path = OUT / "fuentes.json"; fu = json.loads(fu_path.read_text())
ficha_dem = {"url": "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif",
             "sha256": salida["fuente_relieve"]["sha256"], "derivado_utc": salida["generado_utc"]}
nuevas = [
    {"id": "pendiente_clases", "titulo": "Pendientes y zonas de riesgo", "mision": "KAIROS 2033 · Fase 3 (derivado)", "tipo": "raster derivado",
     "archivo": salida["archivos"]["calco"], "resolucion_original_m": 20, "proveedor": "Calculado aquí desde el relieve NASA/JPL CTX DEM 20 m",
     "proyeccion": "Jezero_Crater_Projection", "fuente": ficha_dem},
    {"id": "ruta_segura", "titulo": "Ruta más segura de KAIROS", "mision": "KAIROS 2033 · Fase 3 (derivado)", "tipo": "vector derivado",
     "archivo": salida["archivos"]["ruta"], "elementos": len(geo_ruta), "proveedor": "Calculado aquí desde el relieve NASA/JPL CTX DEM 20 m",
     "proyeccion": "lon/lat Mars 2000 (este positivo)", "fuente": ficha_dem},
]
fu["capas"] = [c for c in fu["capas"] if c["id"] not in {n["id"] for n in nuevas}] + nuevas
fu_path.write_text(json.dumps(fu, indent=2, ensure_ascii=False))
log("fuentes.json actualizado")
