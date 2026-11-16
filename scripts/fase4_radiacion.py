"""Fase 4 · Radiación de la Misión KAIROS 2033, con meta-revisión de cada número.

Cada valor lleva: la cita textual, la página oficial donde se leyó y su estado
("verificado" = la cita se leyó en la página; "corregido" = el valor anterior no coincidía con la fuente).
La dosis se calcula día por día con las fechas de la trayectoria 22313 (NASA Trajectory Browser).
Uso: python3 -I scripts/fase4_radiacion.py   (después de mision_calcular.py)
"""
import json, datetime as dt
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
OUT = RAIZ / "public/data"
SOL = 88775.244 / 86400

FUENTES = {
    "crucero": {"valor": 1.8, "unidad": "mSv/día", "que": "Dosis equivalente de rayos cósmicos dentro de la nave, viaje Tierra→Marte (MSL, 2011–2012)",
                "cita": "The RAD data showed the Curiosity rover was exposed to an average of 1.8 milliSieverts of GCR per day on its journey to Mars.",
                "pagina": "NASA/JPL · Data From NASA Rover's Voyage to Mars Aids Planning (30-may-2013)",
                "url": "https://www.jpl.nasa.gov/news/data-from-nasa-rovers-voyage-to-mars-aids-planning/",
                "articulo": "Zeitlin et al. 2013, Science 340:1080 · doi:10.1126/science.1235989",
                "estado": "corregido", "antes": 1.84,
                "nota": "Antes usábamos 1.84. Ese número no aparece en el resumen público del artículo; la NASA publica 1.8."},
    "superficie": {"valor": 0.67, "unidad": "mSv/día", "que": "Dosis equivalente en la superficie del cráter Gale (ago-2012 a jun-2013)",
                   "cita": "bombarded the surface at Gale Crater with an average of 0.67 millisieverts per day from August 2012 to June 2013",
                   "pagina": "NASA · release 13-366, NASA Rover Results Include First Age Measurement on Mars and Help for Human Exploration (9-dic-2013)",
                   "url": "https://www.nasa.gov/news-release/nasa-rover-results-include-first-age-measurement-on-mars-and-help-for-human-exploration/",
                   "articulo": "Hassler et al. 2014, Science 343:1244797 · doi:10.1126/science.1244797",
                   "estado": "corregido", "antes": 0.64,
                   "nota": "Antes usábamos 0.64. La NASA y SwRI publican 0.67 para ese periodo."},
    "limite": {"valor": 600, "unidad": "mSv", "que": "Límite de dosis de toda la carrera de un astronauta de la NASA",
               "cita": "An individual astronaut's total career effective radiation dose due to space flight radiation exposure shall be less than 600 mSv.",
               "pagina": "NASA OCHMO · Radiation Protection Technical Brief (NASA-STD-3001 Vol. 1 Rev. B, requisito V1 4030)",
               "url": "https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf",
               "estado": "verificado"},
    "referencia_1sv": {"valor": 1000, "unidad": "mSv", "que": "Comprobación independiente: misión de referencia de la NASA (180 + 500 + 180 días)",
                       "cita": "such a mission would result in a radiation exposure of about 1 sievert, with roughly equal contributions from the three stages of the expedition.",
                       "pagina": "NASA/JPL Photojournal · PIA17601, Radiation Exposure Comparisons with Mars Trip Calculation",
                       "url": "https://photojournal.jpl.nasa.gov/catalog/PIA17601", "estado": "verificado"},
    "riesgo": {"valor": 5, "unidad": "%", "que": "Qué significa 1 000 mSv para la salud",
               "cita": "Exposure to a dose of 1,000 millisieverts is associated with a 5 percent increase in risk for developing fatal cancer.",
               "pagina": "NASA · release 13-366 (9-dic-2013)",
               "url": "https://www.nasa.gov/news-release/nasa-rover-results-include-first-age-measurement-on-mars-and-help-for-human-exploration/",
               "estado": "verificado"},
}
PENDIENTES = [   # tipo: otro_lugar = dato real pero de otro sitio · pendiente = no hay dato oficial · no_incluido = no se suma
    {"tipo": "otro_lugar", "texto": "La dosis de superficie se midió en el cráter Gale (Curiosity), no en Jezero: Perseverance no lleva un detector como RAD."},
    {"tipo": "otro_lugar", "texto": "La dosis del viaje se midió dentro de la nave MSL (2011–2012), que no llevaba personas ni el blindaje de una nave tripulada."},
    {"tipo": "pendiente", "texto": "Jezero está unos 2 km más alto que el sitio de Curiosity en Gale: tiene menos aire encima y la dosis podría ser algo mayor. No hay un número oficial para Jezero."},
    {"tipo": "pendiente", "texto": "Cuánto reduce la dosis un hábitat o un rover presurizado en Jezero. No hay fuente NASA para este caso."},
    {"tipo": "no_incluido", "texto": "Tormentas solares: en los 10 meses medidos no hubo grandes tormentas solares sobre Marte. Una tormenta fuerte sumaría dosis que aquí no se cuenta."},
    {"tipo": "otro_lugar", "texto": "Las medidas son de 2011–2013, cerca del máximo solar. La dosis cambia con el ciclo del Sol, y 2033–2035 cae en otro momento del ciclo."},
]

plan = json.loads((OUT / "mision/plan_mision.json").read_text())
T = plan["trayectoria"]
d = lambda s: dt.date.fromisoformat(s)
L, A, D, R = d(T["lanzamiento"]), d(T["aterrizaje"]), d(T["despegue_marte"]), d(T["regreso_tierra"])
cru, sup, lim = FUENTES["crucero"]["valor"], FUENTES["superficie"]["valor"], FUENTES["limite"]["valor"]

# serie[k] = dosis acumulada al empezar el día k (k = 0 lanzamiento … último = llegada a la Tierra): 880 días → 881 valores
serie, acum, dia, cruce = [0.0], 0.0, L, None
while dia < R:
    etapa = "ida" if dia < A else "superficie" if dia < D else "vuelta"
    acum += cru if etapa != "superficie" else sup
    n = (dia - L).days + 1
    if cruce is None and acum >= lim: cruce = {"dia_mision": n, "fecha": dia.isoformat(), "etapa": etapa,
                                               "sol": int((dia - A).days / SOL) + 1 if etapa == "superficie" else None}
    serie.append(round(acum, 1)); dia += dt.timedelta(days=1)

def dosis_en(fecha): return serie[(fecha - L).days]
fases = []
for f in plan["fases_superficie"]:
    fi, ff = d(f["fecha_inicio"]), d(f["fecha_fin"])
    fases.append({"id": f["id"], "nombre": f["nombre"], "soles": f"{f['sol_inicio']}–{f['sol_fin']}",
                  "dosis_fase": round(dosis_en(ff + dt.timedelta(days=1)) - dosis_en(fi), 1), "acumulada_al_final": dosis_en(ff + dt.timedelta(days=1))})
cruce_fase = next((f["nombre"] for f in plan["fases_superficie"] if cruce and cruce["sol"] and f["sol_inicio"] <= cruce["sol"] <= f["sol_fin"]), None)

etapas = plan["radiacion"]
salida = {
    "generado_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "mision": plan["nombre_completo"], "trayectoria": T["traj_id"],
    "etapas": {"ida": {"dias": T["ida_dias"], "mSv": etapas["ida"]}, "superficie": {"dias": T["estadia_dias"], "mSv": etapas["superficie"]},
               "vuelta": {"dias": T["vuelta_dias"], "mSv": etapas["vuelta"]}},
    "total_mSv": etapas["total"], "limite_mSv": lim, "veces_limite": etapas["veces_limite"],
    "cruza_limite": cruce | {"fase": cruce_fase} if cruce else None,
    "comparacion_nasa": {"referencia_dias": [180, 500, 180], "referencia_mSv": 1000, "kairos_dias": [T["ida_dias"], T["estadia_dias"], T["vuelta_dias"]],
                         "kairos_mSv": etapas["total"], "diferencia_pct": round(100 * (etapas["total"] - 1000) / 1000, 1)},
    "fases_superficie": fases,
    "serie_diaria_mSv": serie, "serie_inicio": L.isoformat(), "fechas_clave": {"aterrizaje": A.isoformat(), "despegue": D.isoformat(), "regreso": R.isoformat()},
    "metodo": "derivado: dosis diaria medida por RAD × días de cada etapa de la trayectoria 22313. Blindaje: el de la nave MSL; sin blindaje extra.",
    "meta_revision": FUENTES, "pendientes": PENDIENTES,
    "aviso": "Radiación medida por Curiosity en el cráter Gale y durante su viaje: Perseverance (Jezero) no mide radiación ionizante.",
}
(OUT / "riesgos/radiacion.json").write_text(json.dumps(salida, indent=1, ensure_ascii=False))
print(f"· total {etapas['total']} mSv · cruza 600 mSv el día {cruce['dia_mision']} ({cruce['fecha']}, sol {cruce['sol']}, {cruce_fase})")
print(f"· comparación NASA (180+500+180 d ≈ 1 Sv): KAIROS {etapas['total']} mSv ({salida['comparacion_nasa']['diferencia_pct']:+} %)")
for f in fases: print(f"  {f['nombre']}: +{f['dosis_fase']} → {f['acumulada_al_final']} mSv")
