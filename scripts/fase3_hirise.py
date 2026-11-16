"""Fase 3b · Ruta de KAIROS a escala de astronauta con el relieve HiRISE de 1 m (USGS · Mars 2020 TRN).

El relieve CTX de 20 m no ve escalones ni rocas de pocos metros. Aquí:
  1. Se recorta (lectura remota por ventana, sin bajar los 1.8 GB) la zona de la ruta del DTM HiRISE 1 m oficial.
  2. Pendiente con diferencias centrales (base de 2 m) y en celdas de 2 m (promedio 2×2 del relieve).
  3. Se revisa la ruta calculada con CTX y se calcula una ruta nueva con la misma regla (10° → 15° → 20°, nunca más).
Uso: uv run --with rasterio --with pillow --with scikit-image python -I scripts/fase3_hirise.py
"""
import json, math, hashlib, datetime as dt
from pathlib import Path
import numpy as np, rasterio
from rasterio.windows import from_bounds
from skimage.graph import MCP_Geometric

RAIZ = Path(__file__).resolve().parent.parent
RAW, OUT = RAIZ / "datos/crudos", RAIZ / "public/data"
URL = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif"
R_MARS = 3396190.0
log = lambda *a: print("·", *a, flush=True)
xm = lambda lon: R_MARS * math.radians(lon)          # este DTM usa equirectangular con paralelo 0
ym = lambda lat: R_MARS * math.radians(lat)

plan = json.loads((OUT / "mision/plan_mision.json").read_text()); paradas = plan["ruta"]
lons, lats = [p["lon"] for p in paradas], [p["lat"] for p in paradas]
M = 0.006                                             # ≈ 350 m de margen
recorte = RAW / "hirise_dtm_1m_ruta_kairos.tif"
if not recorte.exists():
    with rasterio.open("/vsicurl/" + URL) as src:
        w = from_bounds(xm(min(lons) - M), ym(min(lats) - M), xm(max(lons) + M), ym(max(lats) + M), src.transform).round_offsets().round_lengths()
        log(f"leyendo ventana {w.width}×{w.height} del DTM HiRISE remoto…")
        z = src.read(1, window=w); tr = src.window_transform(w); prof = src.profile
    prof.update(width=z.shape[1], height=z.shape[0], transform=tr, compress="deflate", tiled=True, blockxsize=256, blockysize=256, predictor=3)
    with rasterio.open(recorte, "w", **prof) as d: d.write(z, 1)
    sha = hashlib.sha256(recorte.read_bytes()).hexdigest()
    with open(RAW / "descargas.tsv", "a") as f:
        f.write(f"{recorte.name}\t{URL} (recorte por ventana: lon {min(lons)-M:.3f}–{max(lons)+M:.3f}, lat {min(lats)-M:.3f}–{max(lats)+M:.3f})\t{recorte.stat().st_size}\t{sha}\t{dt.datetime.now(dt.timezone.utc):%Y-%m-%dT%H:%M:%SZ}\n")
src = rasterio.open(recorte); z = src.read(1).astype(np.float32)
z[~(np.isfinite(z) & (z > -1e4))] = np.nan
log(f"HiRISE: {z.shape[1]}×{z.shape[0]} celdas de 1 m, {np.isnan(z).mean()*100:.2f} % sin dato")

# Celdas de 2 m (promedio 2×2) para la búsqueda de ruta; pendiente con diferencias centrales
h, w = (z.shape[0] // 2) * 2, (z.shape[1] // 2) * 2
z2 = z[:h, :w].reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3))
RES = 2.0
gy, gx = np.gradient(z2, RES, RES)
pend = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
T0 = src.transform
pix = lambda lon, lat: (int((T0.f - ym(lat)) / RES), int((xm(lon) - T0.c) / RES))
lonlat = lambda r, c: [round(math.degrees((T0.c + (c + .5) * RES) / R_MARS), 6), round(math.degrees((T0.f - (r + .5) * RES) / R_MARS), 6)]

def camino(a, b, umbral):
    costo = np.where(np.isfinite(pend) & (pend <= umbral), 1.0, np.inf)
    if not (np.isfinite(costo[a]) and np.isfinite(costo[b])): return None
    mcp = MCP_Geometric(costo, fully_connected=True); acum, _ = mcp.find_costs([a], [b])
    return mcp.traceback(b) if np.isfinite(acum[b]) else None

def perfil(cel):
    rr, cc = np.array([c[0] for c in cel]), np.array([c[1] for c in cel]); paso = np.hypot(np.diff(rr), np.diff(cc)) * RES
    pp, zz = pend[rr, cc][1:], z2[rr, cc]; L = float(paso.sum()); dz = np.diff(zz)
    pct = lambda lo, hi: round(100 * float(paso[(pp >= lo) & (pp < hi)].sum()) / L, 1)
    return {"largo_m": round(L), "sube_m": round(float(dz[dz > 0].sum())), "baja_m": round(float(-dz[dz < 0].sum())),
            "pendiente_max": round(float(np.nanmax(pp)), 1), "pendiente_media": round(float(np.nanmean(pp)), 1),
            "pct_0_10": pct(0, 10), "pct_10_15": pct(10, 15), "pct_15_20": pct(15, 20), "pct_mas_20": pct(20, 99)}

# Revisión de la ruta CTX (20 m) con el relieve de 2 m
ctx = json.loads((OUT / "riesgos/ruta_segura.geojson").read_text())
def densificar(coords):
    cel = []
    for (l0, a0), (l1, a1) in zip(coords, coords[1:]):
        p0, p1 = pix(l0, a0), pix(l1, a1); n = max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]), 1)
        cel += [(round(p0[0] + (p1[0] - p0[0]) * t), round(p0[1] + (p1[1] - p0[1]) * t)) for t in np.arange(n) / n]
    return cel + [pix(*coords[-1])]
revision_ctx = [perfil(densificar(f["geometry"]["coordinates"])) for f in ctx["features"]]

tramos, feats = [], []
for i in range(len(paradas) - 1):
    a, b = pix(paradas[i]["lon"], paradas[i]["lat"]), pix(paradas[i + 1]["lon"], paradas[i + 1]["lat"])
    for umbral in (10, 15, 20):
        cel = camino(a, b, umbral)
        if cel: break
    t = {"tramo": i + 1, "desde": paradas[i]["nombre"], "hasta": paradas[i + 1]["nombre"], "umbral_usado": umbral if cel else None}
    if cel:
        t |= perfil(cel); t["a_pie_2km"] = t["largo_m"] <= 2000
        coords = [lonlat(*c) for c in cel[::5]] + [lonlat(*cel[-1])]
        coords[0], coords[-1] = [paradas[i]["lon"], paradas[i]["lat"]], [paradas[i + 1]["lon"], paradas[i + 1]["lat"]]
        feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": coords}, "properties": dict(t)})
    t["ruta_ctx_vista_en_hirise"] = revision_ctx[i]
    tramos.append(t)
    log(f"tramo {i+1}: HiRISE {t.get('largo_m')} m, máx {t.get('pendiente_max')}° (regla {t['umbral_usado']}°) · ruta CTX vista a 2 m: máx {revision_ctx[i]['pendiente_max']}°, {revision_ctx[i]['pct_mas_20']} % > 20°")

(OUT / "riesgos/ruta_segura_hirise.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False))
rz = json.loads((OUT / "riesgos/pendientes.json").read_text())
rz["hirise"] = {
    "fuente": {"url": URL, "archivo_recorte": recorte.name, "sha256_recorte": hashlib.sha256(recorte.read_bytes()).hexdigest(),
               "resolucion_m": 1, "celda_ruta_m": RES, "proveedor": "USGS Astrogeology · Mars 2020 Terrain Relative Navigation (HiRISE, MRO)"},
    "metodo": "Pendiente con diferencias centrales en celdas de 2 m (promedio 2×2 del DTM de 1 m). Misma regla de ruta: 10° → 15° → 20°.",
    "tramos": tramos,
    "total": {"largo_m": sum(t.get("largo_m", 0) for t in tramos), "sube_m": sum(t.get("sube_m", 0) for t in tramos),
              "baja_m": sum(t.get("baja_m", 0) for t in tramos), "pendiente_max": max(t.get("pendiente_max", 0) for t in tramos)},
}
(OUT / "riesgos/pendientes.json").write_text(json.dumps(rz, indent=1, ensure_ascii=False))
log("total HiRISE:", rz["hirise"]["total"])

# Ficha en fuentes.json: la ruta principal ahora es la de HiRISE
fu_path = OUT / "fuentes.json"; fu = json.loads(fu_path.read_text())
fu["capas"] = [c for c in fu["capas"] if c["id"] != "ruta_segura_hirise"] + [{
    "id": "ruta_segura_hirise", "titulo": "Ruta más segura (HiRISE 1 m)", "mision": "KAIROS 2033 · Fase 3 (derivado)", "tipo": "vector derivado",
    "archivo": "riesgos/ruta_segura_hirise.geojson", "elementos": len(feats), "resolucion_original_m": 1,
    "proveedor": "Calculado aquí desde el DTM HiRISE 1 m (USGS · Mars 2020 TRN)", "proyeccion": "lon/lat Mars 2000 (este positivo)",
    "fuente": {"url": URL, "sha256": rz["hirise"]["fuente"]["sha256_recorte"], "nota": "SHA-256 del recorte guardado en datos/crudos"}}]
fu_path.write_text(json.dumps(fu, indent=2, ensure_ascii=False))
log("fuentes.json actualizado")
