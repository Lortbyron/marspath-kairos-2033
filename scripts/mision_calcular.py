"""Misión Jezero · trayectorias reales (NASA Ames Trajectory Browser) + estaciones marcianas (Mars24, NASA GISS).

1. Consulta el Trajectory Browser: viajes de ida y vuelta Tierra–Marte–Tierra con lanzamiento entre 2030 y 2040.
2. Calcula la longitud solar Ls (estación) de cada aterrizaje y despegue con el algoritmo Mars24.
3. Escribe public/data/mision/trayectorias_2030s.json y public/data/mision/plan_mision.json.

Ejecutar desde Cartografia/:   python3 -I scripts/mision_calcular.py
Lo único hipotético es que viaje una tripulación; las fases de superficie las decidió Mateo y se marcan como "diseño".
"""
import json, math, re, urllib.request, http.cookiejar
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "datos/crudos", ROOT / "public/data/mision"
OUT.mkdir(parents=True, exist_ok=True); RAW.mkdir(parents=True, exist_ok=True)
SOL = 88775.244 / 86400                       # 1 sol en días terrestres
J2000 = datetime(2000, 1, 1, 12)
TB = ("https://trajbrowser.arc.nasa.gov/traj_browser.php?NEAs=on&NECs=on&chk_maxMag=on&maxMag=25&chk_maxOCC=on&maxOCC=4"
      "&chk_target_list=on&target_list=Mars&mission_class=roundtrip&mission_type=rendezvous&LD1=2030&LD2=2040"
      "&maxDT=1000&DTunit=days&maxDV=10&min=DV&wdw_width=-1&submit=Search")
TRAJ_ELEGIDA = 22313
# Dosis medidas por MSL RAD (Curiosity), con el valor que publica la NASA (meta-revisión Fase 4, ver fase4_radiacion.py):
#   crucero 1.8 mSv/día (JPL 2013, Zeitlin et al. 2013) · superficie de Gale 0.67 mSv/día (NASA 13-366, Hassler et al. 2014)
DOSIS_CRUCERO, DOSIS_SUPERFICIE, LIMITE_NASA = 1.8, 0.67, 600   # mSv/día; límite de carrera NASA-STD-3001 Vol. 1 Rev. B [V1 4030]


def ls(dt):
    """Longitud solar de Marte (grados) — Mars24, Allison & McEwen 2000."""
    d = dt.timestamp() / 86400 + 2440587.5 + 69.184 / 86400 - 2451545.0
    M = math.radians(19.3871 + 0.52402073 * d)
    pbs = sum(A * math.cos(math.radians(0.985626 * d / t + p)) for A, t, p in
              [(.0071, 2.2353, 49.409), (.0057, 2.7543, 168.173), (.0039, 1.1177, 191.837), (.0037, 15.7866, 21.736),
               (.0021, 2.1354, 15.704), (.0020, 2.4694, 95.528), (.0018, 32.8493, 49.095)])
    v = (10.691 + 3e-7 * d) * math.sin(M) + .623 * math.sin(2 * M) + .05 * math.sin(3 * M) + .005 * math.sin(4 * M) + .0005 * math.sin(5 * M) + pbs
    return (270.3871 + 0.524038496 * d + v) % 360

polvo = lambda L: 180 <= L < 360               # temporada de polvo: primavera–verano del hemisferio sur
f = lambda d: d.strftime("%Y-%m-%d")

# ── 1. Trajectory Browser ──
cache = RAW / "nasa_trajbrowser_marte_2030s.html"
if not cache.exists():
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [("User-Agent", "Mozilla/5.0"), ("Referer", "https://trajbrowser.arc.nasa.gov/traj_browser.php")]
    cache.write_bytes(op.open(TB, timeout=180).read())
segs = json.loads(re.search(r"segs\s*=\s*(\{.*?\});", cache.read_text(), re.S).group(1))
por = {}
for i, t in enumerate(segs["Traj_ID"]): por.setdefault(t, []).append((segs["T"][i], segs["SPK_ID"][i], segs["DV"][i]))

tray = []
for tid, p in por.items():
    p.sort(); marte = [x for x in p if x[1] == 499]
    if any(x[1] == 299 for x in p): continue     # sin sobrevuelo de Venus
    D = lambda T: J2000 + timedelta(seconds=T)
    lan, ate, des, reg = D(p[0][0]), D(marte[0][0]), D(marte[-1][0]), D(p[-1][0])
    est = (des - ate).days
    if est < 400: continue                       # solo misiones de estadía larga (clase conjunción, como la NASA)
    tray.append({"traj_id": tid, "lanzamiento": f(lan), "aterrizaje": f(ate), "despegue_marte": f(des), "regreso_tierra": f(reg),
                 "ida_dias": (ate - lan).days, "estadia_dias": est, "estadia_soles": round(est / SOL), "vuelta_dias": (reg - des).days,
                 "total_dias": (reg - lan).days, "delta_v_km_s": round(sum(x[2] for x in p) / 1000, 2),
                 "Ls_aterrizaje": round(ls(ate), 1), "Ls_despegue": round(ls(des), 1),
                 "aterriza_en_polvo": polvo(ls(ate)), "despega_en_polvo": polvo(ls(des)),
                 "dias_en_temporada_polvo": sum(polvo(ls(ate + timedelta(days=k))) for k in range(est))})
tray.sort(key=lambda r: (r["lanzamiento"], r["traj_id"]))
(OUT / "trayectorias_2030s.json").write_text(json.dumps({
    "fuente": "NASA Ames Research Center · Trajectory Browser", "consulta": TB, "consultado": f(datetime.now()),
    "filtro": "ida y vuelta, lanzamiento 2030–2040, ≤1000 días, ΔV ≤10 km/s, sin Venus, estadía ≥400 días",
    "estaciones": "Ls calculada con Mars24 (NASA GISS). Temporada de polvo = Ls 180°–360°.", "trayectorias": tray}, indent=1, ensure_ascii=False))

# ── 2. Plan de misión con la trayectoria elegida ──
t = next(r for r in tray if r["traj_id"] == TRAJ_ELEGIDA)
ate = datetime.fromisoformat(t["aterrizaje"]); des = datetime.fromisoformat(t["despegue_marte"])
sol_de = lambda d: int((d - ate).days / SOL) + 1
fecha_sol = lambda n: ate + timedelta(days=(n - 1) * SOL)
prev, fin_polvo, ini_polvo = ls(ate), None, None
for k in range(1, 700):
    d = ate + timedelta(days=k); L = ls(d)
    if fin_polvo is None and L < prev: fin_polvo = d
    if fin_polvo and ini_polvo is None and L >= 180: ini_polvo = d
    prev = L
sol_despegue = sol_de(des)
FASES = [("aterrizaje", "Aterrizaje en Octavia E. Butler", 1, 7),
         ("habitat", "Instalación del hábitat", 8, 60),
         ("three_forks", "Misión principal: recuperar los tubos de Three Forks", 61, 150),
         ("delta", "Estudios del delta (frente y parte alta)", 151, 270),
         ("carbonatos", "Carbonatos de la antigua orilla (margen)", 271, 350),
         ("cheyava", "Neretva Vallis y la roca Cheyava Falls", 351, 420),
         ("regreso", "Preparación del regreso", 421, sol_despegue - 1)]
fases = [{"id": i, "nombre": n, "sol_inicio": a, "sol_fin": b, "soles": b - a + 1, "fecha_inicio": f(fecha_sol(a)), "fecha_fin": f(fecha_sol(b)),
          "Ls_inicio": round(ls(fecha_sol(a)), 1), "Ls_fin": round(ls(fecha_sol(b)), 1), "en_temporada_polvo": polvo(ls(fecha_sol(a)))}
         for i, n, a, b in FASES]
dosis = {"ida": round(t["ida_dias"] * DOSIS_CRUCERO), "superficie": round(t["estadia_dias"] * DOSIS_SUPERFICIE), "vuelta": round(t["vuelta_dias"] * DOSIS_CRUCERO)}
dosis["total"] = sum(dosis.values())
# ── 3. Paradas de la ruta del lago: coordenadas tomadas de las capas oficiales (MMGIS) ──
CAPAS = ROOT / "public/data/capas"
paradas_rover = sorted(json.loads((CAPAS / "rover_paradas.geojson").read_text())["features"],
                       key=lambda x: (x["properties"]["sol"], x["properties"]["site"], x["properties"]["drive"]))
muestras = {x["properties"]["sample_name"]: x["properties"] for x in json.loads((CAPAS / "muestras_roca.geojson").read_text())["features"]}
dep = json.loads((CAPAS / "deposito_three_forks.geojson").read_text())["features"][0]["geometry"]["coordinates"][0][:-1]
m = lambda n: (muestras[n]["lon"], muestras[n]["lat"])
RUTA = [
    ("aterrizaje", "Octavia E. Butler", "Sitio de aterrizaje de Perseverance (18-feb-2021)",
     (paradas_rover[0]["properties"]["lon"], paradas_rover[0]["properties"]["lat"]), "rover_paradas: primera posición (sol 13)"),
    ("three_forks", "Depósito Three Forks", "10 tubos de muestras dejados por Perseverance",
     (sum(p[0] for p in dep) / len(dep), sum(p[1] for p in dep) / len(dep)), "deposito_three_forks: centro del polígono"),
    ("delta_frente", "Frente del delta", "Rocas sedimentarias formadas en el lago", m("Hazeltop + Bearwallow"), "muestras_roca: Hazeltop + Bearwallow"),
    ("delta_superior", "Delta superior", "Sedimentos del abanico del río", m("Otis Peak"), "muestras_roca: Otis Peak"),
    ("carbonatos", "Antigua orilla · carbonatos", "Carbonato cementado con sílice", m("Comet Geyser"), "muestras_roca: Comet Geyser"),
    ("cheyava", "Neretva · Cheyava Falls", "Posible biofirma (muestra Sapphire Canyon)", m("Sapphire_Canyon"), "muestras_roca: Sapphire_Canyon"),
]
ruta = [{"id": i, "nombre": n, "descripcion": d, "lon": round(c[0], 6), "lat": round(c[1], 6), "fuente": fu} for i, n, d, c, fu in RUTA]

plan = {
    "nombre": "KAIROS 2033", "nombre_completo": "Misión KAIROS 2033 · Jezero",
    "significado_nombre": "Kairós: en la mitología griega, el dios del momento exacto y la ventana irrepetible (frente a Cronos, el tiempo común). "
                          "La misión atrapa la ventana de 2033 y despega en Ls 170° con 19 soles de margen antes de la temporada de polvo.",
    "director": "Mateo", "tripulacion": 6, "ruta": ruta,
    "tripulacion_fuente": "NASA Mars Design Reference Architecture 5.0 (NASA-SP-2009-566)",
    "hipotetico": "Solo es hipotético que viaje una tripulación. Lugares, fechas orbitales, estaciones, alturas y radiación son datos reales.",
    "objetivo_principal": "Recuperar los 10 tubos de muestras que Perseverance dejó en el depósito Three Forks (dic-2022 / ene-2023).",
    "trayectoria": {**t, "fuente": "NASA Ames Trajectory Browser", "consulta": TB},
    "duracion": {"ida_soles": round(t["ida_dias"] / SOL), "superficie_soles": sol_despegue - 1, "vuelta_soles": round(t["vuelta_dias"] / SOL),
                 "total_dias": t["total_dias"], "total_soles": round(t["total_dias"] / SOL)},
    "polvo": {"fin_temporada": f(fin_polvo), "sol_fin_temporada": sol_de(fin_polvo), "inicio_siguiente": f(ini_polvo),
              "sol_inicio_siguiente": sol_de(ini_polvo), "sol_despegue": sol_despegue, "margen_soles": sol_de(ini_polvo) - sol_despegue,
              "criterio": "Despegar de Marte antes de que empiece la temporada de polvo (Ls 180°)."},
    "fases_superficie": fases, "fases_nota": "Reparto de soles diseñado por Mateo (hipotético); fechas y estaciones calculadas.",
    "radiacion": {**dosis, "unidad": "mSv", "limite_carrera_nasa": LIMITE_NASA, "veces_limite": round(dosis["total"] / LIMITE_NASA, 2),
                  "fuente": "MSL RAD (Curiosity, cráter Gale): crucero 1.8 mSv/día (NASA/JPL 2013; Zeitlin 2013), superficie 0.67 mSv/día (NASA 13-366; Hassler 2014). Blindaje: el de la nave MSL; sin blindaje extra."},
}
(OUT / "plan_mision.json").write_text(json.dumps(plan, indent=1, ensure_ascii=False))
print(f"✓ {len(tray)} trayectorias · elegida {TRAJ_ELEGIDA}: {t['lanzamiento']} → {t['aterrizaje']} → {t['despegue_marte']} → {t['regreso_tierra']}")
print(f"  polvo termina sol {plan['polvo']['sol_fin_temporada']}, despegue sol {sol_despegue}, siguiente temporada sol {plan['polvo']['sol_inicio_siguiente']} · dosis {dosis['total']} mSv")
