"""Fase 5 · Guion del simulador KAIROS 2033 (día por día, del lanzamiento al regreso a la Tierra).

No inventa datos: junta lo que ya está calculado y verificado.
  · fechas y etapas  → plan_mision.json (NASA Ames Trajectory Browser, Traj 22313)
  · Ls y polvo       → Mars24 (Allison & McEwen 2000), temporada de polvo Ls 180–360
  · ruta y modos     → riesgos/ruta_segura_hirise.geojson (HiRISE 1 m) + regla NASA de 2 km a pie
  · radiación        → riesgos/radiacion.json (RAD de Curiosity, medida en Gale)
Lo que es diseño de Mateo o un supuesto del simulador queda marcado como tal en "supuestos".
Uso: python3 -I scripts/fase5_simulacion.py   (después de fase3_* y fase4_radiacion)
"""
import json, math, datetime as dt
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
OUT = RAIZ / "public/data"
SOL = 88775.244 / 86400
A_PIE_MAX_M, A_PIE_KMH = 2000, 2.0     # NASA EVA-EXP-0042 Rev. B, p. 89: hasta 2 km del vehículo, a ~2 km/h en terreno plano

def ls(fecha):
    """Longitud solar de Marte (grados) — Mars24, Allison & McEwen 2000 (misma función que mision_calcular.py)."""
    t = dt.datetime(fecha.year, fecha.month, fecha.day, 12, tzinfo=dt.timezone.utc)
    d = t.timestamp() / 86400 + 2440587.5 + 69.184 / 86400 - 2451545.0
    M = math.radians(19.3871 + 0.52402073 * d)
    pbs = sum(A * math.cos(math.radians(0.985626 * d / tt + p)) for A, tt, p in
              [(.0071, 2.2353, 49.409), (.0057, 2.7543, 168.173), (.0039, 1.1177, 191.837), (.0037, 15.7866, 21.736),
               (.0021, 2.1354, 15.704), (.0020, 2.4694, 95.528), (.0018, 32.8493, 49.095)])
    v = (10.691 + 3e-7 * d) * math.sin(M) + .623 * math.sin(2 * M) + .05 * math.sin(3 * M) + .005 * math.sin(4 * M) + .0005 * math.sin(5 * M) + pbs
    return (270.3871 + 0.524038496 * d + v) % 360

plan = json.loads((OUT / "mision/plan_mision.json").read_text())
rad = json.loads((OUT / "riesgos/radiacion.json").read_text())
ruta = json.loads((OUT / "riesgos/ruta_segura_hirise.geojson").read_text())["features"]
T = plan["trayectoria"]; P = plan["ruta"]
fd = dt.date.fromisoformat
L, A, D, R = fd(T["lanzamiento"]), fd(T["aterrizaje"]), fd(T["despegue_marte"]), fd(T["regreso_tierra"])
dia_de = lambda f: (f - L).days                       # día de misión (0 = lanzamiento)
dia_sol = lambda s: dia_de(A) + (s - 1) * SOL         # inicio de un sol, en días desde el lanzamiento
N = dia_de(R) + 1

tramos = [{"tramo": f["properties"]["tramo"], "desde": f["properties"]["desde"], "hasta": f["properties"]["hasta"],
           "largo_m": f["properties"]["largo_m"], "pendiente_max": f["properties"]["pendiente_max"],
           "modo": "a pie" if f["properties"]["largo_m"] <= A_PIE_MAX_M else "rover presurizado",
           "coords": f["geometry"]["coordinates"]} for f in ruta]

def traslado(sol, i_desde, i_hasta, motivo, excursion):
    idx = list(range(i_desde, i_hasta)) if i_hasta > i_desde else list(range(i_desde - 1, i_hasta - 1, -1))
    largo = sum(tramos[k]["largo_m"] for k in idx)
    modo = "a pie" if largo <= A_PIE_MAX_M else "rover presurizado"
    return {"sol": sol, "dia": round(dia_sol(sol), 3), "desde": i_desde, "hasta": i_hasta, "tramos": [k + 1 for k in idx],
            "sentido": "ida" if i_hasta > i_desde else "vuelta", "largo_m": largo, "modo": modo, "motivo": motivo, "excursion": excursion,
            "horas_a_pie": round(largo / 1000 / A_PIE_KMH, 1) if modo == "a pie" else None,
            "pendiente_max": max(tramos[k]["pendiente_max"] for k in idx)}

# ── Decisiones de Mateo (14-nov-2026) ──
# · La base (hábitat + cohete de regreso) está en el sitio de aterrizaje.
# · Siempre se quedan 2 astronautas en la base estudiando; 4 salen de excursión con el robot Galilei y vuelven con las muestras.
# · Se turnan: la pareja que se queda cambia en cada excursión.
EQUIPOS = [{"id": "A", "astronautas": [1, 2]}, {"id": "B", "astronautas": [3, 4]}, {"id": "C", "astronautas": [5, 6]}]
ROBOT = {"nombre": "Galilei", "tipo": "hipotetico",
         "porque": "Por Galileo Galilei, el primero en observar Marte con un telescopio, en 1610 (NASA Science).",
         "fuente_nombre": "https://science.nasa.gov/mars/triumph-of-mariner-4/",
         "hace": "Acompaña al equipo de campo: carga equipo y muestras, ayuda a investigar y a recolectar rocas.",
         "aviso": "Robot hipotético diseñado por Mateo. No tiene velocidad, carga ni autonomía con fuente NASA: no se muestran números."}
F = {f["id"]: f for f in plan["fases_superficie"]}
mitad_delta = (F["delta"]["sol_inicio"] + F["delta"]["sol_fin"] + 1) // 2
EXC = [("three_forks", 1, F["three_forks"]["sol_inicio"], F["three_forks"]["sol_fin"], "Recuperar los 10 tubos del depósito Three Forks"),
       ("delta", 2, F["delta"]["sol_inicio"], mitad_delta - 1, "Estudiar las rocas del frente del delta"),
       ("delta", 3, mitad_delta, F["delta"]["sol_fin"], "Estudiar los sedimentos del delta superior"),
       ("carbonatos", 4, F["carbonatos"]["sol_inicio"], F["carbonatos"]["sol_fin"], "Estudiar los carbonatos de la antigua orilla"),
       ("cheyava", 5, F["cheyava"]["sol_inicio"], F["cheyava"]["sol_fin"], "Estudiar Neretva Vallis y la roca Cheyava Falls")]
excursiones, traslados = [], []
for k, (fase, parada, s0, s1, que) in enumerate(EXC):
    base = EQUIPOS[k % 3]; campo = [e for e in EQUIPOS if e is not base]
    ida = traslado(s0, 0, parada, f"{que}", k); vuelta = traslado(s1, parada, 0, f"Volver a la base con las muestras de {P[parada]['nombre']}", k)
    traslados += [ida, vuelta]
    excursiones.append({"n": k + 1, "fase": fase, "nombre_fase": F[fase]["nombre"], "parada": parada, "lugar": P[parada]["nombre"], "que_hay": P[parada]["descripcion"],
                        "objetivo": que, "sol_salida": s0, "sol_regreso": s1, "equipo_base": base["id"], "equipo_campo": [e["id"] for e in campo],
                        "astronautas_base": base["astronautas"], "astronautas_campo": [a for e in campo for a in e["astronautas"]]})
# Fases con toda la tripulación en la base
en_base = [{"fase": f, "nombre_fase": F[f]["nombre"], "sol_inicio": F[f]["sol_inicio"], "sol_fin": F[f]["sol_fin"] if f != "regreso" else plan["polvo"]["sol_despegue"] - 1}
           for f in ("aterrizaje", "habitat", "regreso")]
ls_diario = [round(ls(L + dt.timedelta(days=k)), 1) for k in range(N)]
cr = rad["cruza_limite"]
eventos = [
    {"dia": 0, "titulo": "Lanzamiento desde la Tierra", "detalle": f"Empieza el viaje de {T['ida_dias']} días a Marte.", "tipo": "real", "fuente": "NASA Ames Trajectory Browser · Traj 22313"},
    {"dia": dia_de(A), "titulo": "Aterrizaje en Octavia E. Butler", "detalle": f"Sol 1 · Ls {plan['fases_superficie'][0]['Ls_inicio']}° · en plena temporada de polvo.", "tipo": "real", "fuente": "Trajectory Browser + Mars24"},
    {"dia": round(dia_sol(plan["polvo"]["sol_fin_temporada"]), 3), "titulo": "Termina la temporada de polvo", "detalle": f"Sol {plan['polvo']['sol_fin_temporada']} · Ls 360° → 0°.", "tipo": "derivado", "fuente": "Mars24 (Allison & McEwen 2000)"},
]
for e in excursiones:
    eventos.append({"dia": round(dia_sol(e["sol_salida"]), 3) - .001, "titulo": f"Turno {e['n']}: se queda en la base el equipo {e['equipo_base']}",
                    "detalle": f"Astronautas {e['astronautas_base'][0]} y {e['astronautas_base'][1]} estudian en la base; equipos {' y '.join(e['equipo_campo'])} salen con Galilei.",
                    "tipo": "diseno", "fuente": "Decisión de Mateo"})
for t in traslados:
    eventos.append({"dia": t["dia"] + (.5 if t["sentido"] == "vuelta" else 0), "titulo": f"{'Salida' if t['sentido'] == 'ida' else 'Regreso'} en {t['modo']}: {P[t['desde']]['nombre']} → {P[t['hasta']]['nombre']}",
                    "detalle": f"Sol {t['sol']} · {t['largo_m'] / 1000:.1f} km por la ruta segura (máx. {t['pendiente_max']}°)"
                               + (f" · ≈{t['horas_a_pie']} h a 2 km/h" if t["horas_a_pie"] else "") + f". {t['motivo']}.",
                    "tipo": "derivado", "fuente": "Ruta HiRISE 1 m + NASA EVA-EXP-0042 (2 km a pie)"})
eventos += [
    {"dia": cr["dia_mision"] - 1, "titulo": "Se pasa el límite de radiación de la NASA", "detalle": f"Sol {cr['sol']} · 600 mSv acumulados (estimado con datos de Gale).", "tipo": "derivado", "fuente": "RAD de Curiosity + NASA-STD-3001"},
    {"dia": dia_de(D), "titulo": "Despegue de Marte", "detalle": f"Sol {plan['polvo']['sol_despegue']} · {plan['polvo']['margen_soles']} soles antes de la siguiente temporada de polvo.", "tipo": "real", "fuente": "Trajectory Browser + Mars24"},
    {"dia": dia_de(R), "titulo": "Regreso a la Tierra", "detalle": f"Fin de la misión: {T['total_dias']} días y {rad['total_mSv']} mSv.", "tipo": "real", "fuente": "NASA Ames Trajectory Browser"},
]
eventos.sort(key=lambda e: e["dia"])

supuestos = [
    {"texto": "Que viajen seis personas (lo único hipotético de KAIROS).", "tipo": "hipotetico"},
    {"texto": "El reparto de los 500 soles en fases es el diseño de Mateo.", "tipo": "diseno"},
    {"texto": "La base (hábitat y cohete de regreso) está en el sitio de aterrizaje, una zona segura y plana.", "tipo": "diseno"},
    {"texto": "Siempre se quedan 2 astronautas en la base estudiando; los otros 4 salen en el rover presurizado con el robot Galilei y vuelven con las muestras. La pareja que se queda cambia en cada excursión.", "tipo": "diseno"},
    {"texto": "El robot Galilei es hipotético: no tiene velocidad, carga ni autonomía con fuente NASA.", "tipo": "hipotetico"},
    {"texto": "En el destino, el equipo camina (EVA) a menos de 2 km del rover, como planea la NASA.", "tipo": "verificado"},
    {"texto": "En la fase del delta, la mitad de los soles se pasa en el frente y la otra mitad en la parte alta.", "tipo": "supuesto"},
    {"texto": "El equipo de campo se queda en el rover presurizado durante toda la excursión y vuelve a la base al final.", "tipo": "supuesto"},
    {"texto": "Cada traslado se hace en un solo sol. La velocidad del rover en Marte no tiene fuente NASA: queda pendiente.", "tipo": "pendiente"},
    {"texto": "La dosis de superficie es la medida en Gale; Jezero no tiene medición propia.", "tipo": "otro_lugar"},
    {"texto": "La Vista de cerca es una ilustración con los modelos 3D de Mateo (base Kairos D-02, astronautas KAIROS 01, robot Galilei): no está a escala del mapa y su suelo liso no es el terreno real.", "tipo": "diseno"},
    {"texto": "El rover presurizado no tiene modelo 3D: en la Vista de cerca se dibuja solo su contorno.", "tipo": "pendiente"},
]
salida = {"generado_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "mision": plan["nombre_completo"],
          "inicio": L.isoformat(), "dias": N, "sol_en_dias": SOL, "dia_aterrizaje": dia_de(A), "dia_despegue": dia_de(D), "dia_regreso": dia_de(R),
          "sol_despegue": plan["polvo"]["sol_despegue"], "tripulacion": plan["tripulacion"], "objetivo": plan["objetivo_principal"],
          "paradas": [{"nombre": p["nombre"], "descripcion": p["descripcion"], "lon": p["lon"], "lat": p["lat"]} for p in P],
          "tramos": tramos, "traslados": traslados, "excursiones": excursiones, "en_base": en_base, "equipos": EQUIPOS, "robot": ROBOT, "eventos": eventos, "supuestos": supuestos,
          "ls_diario": ls_diario, "dosis_diaria_mSv": rad["serie_diaria_mSv"][:N], "limite_mSv": rad["limite_mSv"],
          "regla_a_pie": {"max_m": A_PIE_MAX_M, "kmh": A_PIE_KMH, "fuente": "NASA EVA-EXP-0042 Rev. B (2020), p. 89"}}
(OUT / "mision/simulacion.json").write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
print(f"· {N} días · {len(traslados)} traslados · {len(eventos)} eventos")
for e in excursiones: print(f"  turno {e['n']}: sol {e['sol_salida']}–{e['sol_regreso']} · {e['lugar']} · base {e['equipo_base']} · campo {e['equipo_campo']}")
