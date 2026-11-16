"""Fase 6 · Validación final de MarsPath / KAIROS 2033.

Revisa de forma automática que todo el proyecto siga las reglas: archivos originales sin cambios (SHA-256),
cada capa con fuente, números iguales en todas partes, ruta dentro de los límites NASA y supuestos marcados.
Escribe public/data/validacion_final.json (lo muestra el mapa) y termina con error si algo falla.
Uso: python3 -I scripts/fase6_validar.py
"""
import json, csv, hashlib, sys, datetime as dt
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RAW, OUT = RAIZ / "datos/crudos", RAIZ / "public/data"
J = lambda p: json.loads((OUT / p).read_text())
pruebas = []
def prueba(grupo, nombre, ok, detalle):
    pruebas.append({"grupo": grupo, "prueba": nombre, "ok": bool(ok), "detalle": detalle})
    print(("  ✓ " if ok else "  ✗ ") + f"[{grupo}] {nombre}: {detalle}")

# 1 · Huellas SHA-256: cada archivo descargado sigue idéntico al original registrado
filas = list(csv.DictReader(open(RAW / "descargas.tsv"), delimiter="\t"))
mal, n = [], 0
for f in filas:
    p = RAW / f["archivo"]
    if not p.exists(): mal.append(f"{f['archivo']} (no está)"); continue
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""): h.update(b)
    n += 1
    if h.hexdigest() != f["sha256"]: mal.append(f["archivo"])
prueba("Originalidad", "Huella SHA-256 de cada archivo descargado", not mal, f"{n} de {len(filas)} archivos idénticos al registro" + (f"; fallan: {', '.join(mal)}" if mal else ""))

# 2 · Fuentes: cada capa y raster de la web tiene enlace oficial y huella
fu = J("fuentes.json")
fichas = fu["rasters"] + fu["capas"]
sin = [c["id"] for c in fichas if not ((c.get("fuente") or {}).get("url") or c.get("url"))]
sin_sha = [c["id"] for c in fichas if c.get("fuente") and not c["fuente"].get("sha256")]
prueba("Fuentes", "Cada capa tiene enlace oficial", not sin, f"{len(fichas)} fichas" + (f"; sin enlace: {sin}" if sin else ""))
prueba("Fuentes", "Cada capa descargada tiene huella SHA-256", not sin_sha, f"{len(fichas) - len(sin_sha)} con huella" + (f"; sin huella: {sin_sha}" if sin_sha else ""))
dominios = ("nasa.gov", "usgs.gov", "asc-pds-services", "planetarynames", "pds", "jpl", "trek.nasa.gov", "doi.org")
raros = [c["id"] for c in fichas if not any(d in json.dumps(c.get("fuente") or c.get("url") or "") for d in dominios)]
prueba("Fuentes", "Las fuentes son oficiales (NASA, JPL, USGS, PDS, IAU)", not raros, "todas de dominios oficiales" if not raros else f"revisar: {raros}")

# 3 · Relieve y coordenadas
val = J("validacion.json")["resultados"][0]
prueba("Exactitud", "El relieve coincide con las paradas reales del rover", val["dif_mediana_abs_m"] < 5,
       f"{val['puntos']} paradas · {val['dif_mediana_abs_m']} m de diferencia mediana")
rz = J("riesgos/pendientes.json")
v = rz["validacion_perseverance"]
prueba("Exactitud", "Las pendientes son coherentes con lo que manejó Perseverance", v["max"] <= 45,
       f"máx. {v['max']}° bajo el recorrido real (el rover soporta 45° y evita más de 30°)")

# 4 · Ruta segura dentro de los límites NASA
H = rz["hirise"]
prueba("Seguridad", "Ninguna parte de la ruta pasa de 20° (límite NASA a pie y en rover presurizado)", H["total"]["pendiente_max"] <= 20,
       f"pendiente máxima {H['total']['pendiente_max']}° en {H['total']['largo_m'] / 1000:.1f} km (relieve HiRISE 1 m)")
sim = J("mision/simulacion.json")
pie = [t for t in sim["traslados"] if t["modo"] == "a pie" and t["largo_m"] > 2000]
prueba("Seguridad", "Nadie camina más de 2 km lejos del vehículo", not pie, "regla NASA EVA-EXP-0042 respetada en todos los traslados")
plan = J("mision/plan_mision.json")
prueba("Seguridad", "El despegue ocurre antes de la temporada de polvo", plan["polvo"]["sol_despegue"] < plan["polvo"]["sol_inicio_siguiente"],
       f"despegue sol {plan['polvo']['sol_despegue']}, polvo desde el sol {plan['polvo']['sol_inicio_siguiente']} ({plan['polvo']['margen_soles']} soles de margen)")

# 5 · Coherencia: el mismo número en todas partes
rad = J("riesgos/radiacion.json")
etapas = plan["radiacion"]
prueba("Coherencia", "Dosis total igual en plan, ficha y simulador",
       etapas["total"] == rad["total_mSv"] and abs(sim["dosis_diaria_mSv"][-1] - rad["total_mSv"]) <= 2,
       f"plan {etapas['total']} · ficha {rad['total_mSv']} · simulador {round(sim['dosis_diaria_mSv'][-1])} mSv")
prueba("Coherencia", "La dosis coincide con el cálculo independiente de la NASA (≈1 000 mSv)", abs(rad["comparacion_nasa"]["diferencia_pct"]) < 10,
       f"{rad['comparacion_nasa']['diferencia_pct']} % de diferencia con NASA PIA17601")
prueba("Coherencia", "Fechas iguales en plan y simulador", sim["inicio"] == plan["trayectoria"]["lanzamiento"] and sim["dias"] == plan["trayectoria"]["total_dias"] + 1,
       f"{sim['inicio']} → {plan['trayectoria']['regreso_tierra']} · {plan['trayectoria']['total_dias']} días")
corr = [k for k, f in rad["meta_revision"].items() if f["estado"] not in ("verificado", "corregido")]
prueba("Meta-revisión", "Cada número de radiación tiene cita textual y página oficial", not corr and all(f.get("cita") and f.get("url") for f in rad["meta_revision"].values()),
       f"{len(rad['meta_revision'])} números revisados · {sum(f['estado'] == 'corregido' for f in rad['meta_revision'].values())} corregidos")
lim = rz["limites_nasa"]
prueba("Meta-revisión", "Cada límite de pendiente tiene cita y documento NASA", all(l.get("cita") and l.get("url") for l in lim), f"{len(lim)} límites con fuente")

# 6 · Honestidad: lo hipotético y lo pendiente está marcado
tipos = {s["tipo"] for s in sim["supuestos"]}
prueba("Honestidad", "Los supuestos del simulador están etiquetados", tipos <= {"hipotetico", "diseno", "supuesto", "pendiente", "otro_lugar", "verificado"} and len(sim["supuestos"]) > 0,
       f"{len(sim['supuestos'])} supuestos con etiqueta")
prueba("Honestidad", "Los datos de otro lugar o pendientes están declarados", any(p["tipo"] == "otro_lugar" for p in rad["pendientes"]) and bool(rz.get("aviso_luna_marte")),
       "radiación de Gale y límites de la Luna marcados como tales")
html = (RAIZ / "index.html").read_text()
prueba("Honestidad", "El aviso educativo está visible", "Herramienta educativa y de demostración" in html and "No reemplaza la planificación operativa" in html, "en la portada del mapa")

ok = sum(p["ok"] for p in pruebas)
(OUT / "validacion_final.json").write_text(json.dumps({"generado_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "aprobadas": ok, "total": len(pruebas), "pruebas": pruebas}, indent=1, ensure_ascii=False))
print(f"\n{ok} de {len(pruebas)} pruebas aprobadas")
sys.exit(0 if ok == len(pruebas) else 1)
