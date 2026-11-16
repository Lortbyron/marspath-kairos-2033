// Fase 5 · Simulador KAIROS 2033: la tripulación (6 puntos) recorre la misión día por día,
// del lanzamiento al regreso a la Tierra. Todo sale de public/data/mision/simulacion.json
// (fechas NASA Trajectory Browser, Ls Mars24, ruta HiRISE 1 m, radiación RAD). Los supuestos van marcados.
import * as THREE from 'three';
import gsap from 'gsap';
import { ico, icoEvento } from './iconos.js';
import { crearCerca } from './cerca.js';
import { tx, td, dec, nf } from './i18n.js';

const R_M = 3396190, K = Math.cos(18.4663 * Math.PI / 180), rad = d => d * Math.PI / 180;
const aM = ([lon, lat]) => [R_M * rad(lon) * K, R_M * rad(lat)];

export function crearSimulador({ S, R, scene, camera, controls, terrH, uvAMundo, setLs, setHora, abrirFicha, etiqueta, REDUCED, MOVIL, U, $ }) {
  const SOL = S.sol_en_dias, dA = S.dia_aterrizaje, dD = S.dia_despegue, N = S.dias;
  const fecha = t => new Date(Date.parse(S.inicio) + Math.floor(t) * 864e5).toISOString().slice(0, 10);
  const solDe = t => Math.floor((t - dA) / SOL) + 1;
  const mundo = ([lon, lat]) => uvAMundo(...R.lonLatAUV(lon, lat));

  // Caminos de cada traslado (tramos de la ruta segura, en orden o al revés) con largo acumulado
  const caminos = S.traslados.map(tr => {
    const pts = []; for (const k of tr.tramos) { const c = S.tramos[k - 1].coords; (tr.sentido === 'ida' ? c : [...c].reverse()).forEach(p => pts.push(p)); }
    const acc = [0]; for (let i = 1; i < pts.length; i++) { const [x0, y0] = aM(pts[i - 1]), [x1, y1] = aM(pts[i]); acc.push(acc[i - 1] + Math.hypot(x1 - x0, y1 - y0)); }
    return { tr, pts, acc, total: acc.at(-1) }; });
  const enCamino = (c, f) => { const d = f * c.total; let i = c.acc.findIndex(a => a >= d); if (i <= 0) return c.pts[Math.max(0, i)];
    const u = (d - c.acc[i - 1]) / (c.acc[i] - c.acc[i - 1] || 1); return [c.pts[i - 1][0] + (c.pts[i][0] - c.pts[i - 1][0]) * u, c.pts[i - 1][1] + (c.pts[i][1] - c.pts[i - 1][1]) * u]; };
  const VENTANA = [.3, .7];   // el traslado ocurre de día, dentro de su sol

  // Estado de la misión en el tiempo t: dónde está el equipo de base y el equipo de campo (con Galilei)
  const BASE = [S.paradas[0].lon, S.paradas[0].lat];
  function estado(t) {
    if (t < dA) return { etapa: 'ida', texto: tx(`Viaje de ida a Marte · día ${Math.floor(t) + 1} de ${dA}`, `Outbound trip to Mars · day ${Math.floor(t) + 1} of ${dA}`) };
    if (t >= dD) return { etapa: 'vuelta', fin: t >= N - 1, texto: t >= N - 1 ? tx('De regreso en la Tierra', 'Back on Earth') : tx(`Viaje de vuelta a la Tierra · día ${Math.floor(t - dD) + 1} de ${N - 1 - dD}`, `Return trip to Earth · day ${Math.floor(t - dD) + 1} of ${N - 1 - dD}`) };
    const sol = solDe(t), f = (t - dA) / SOL - (sol - 1);
    const hechos = caminos.filter(c => c.tr.sol < sol || (c.tr.sol === sol && f >= VENTANA[1])).length;
    const ex = S.excursiones.find(e => sol >= e.sol_salida && sol <= e.sol_regreso);
    if (!ex) { const b = S.en_base.find(b => sol >= b.sol_inicio && sol <= b.sol_fin) ?? S.en_base.at(-1); return { etapa: 'marte', sol, f, todos: b, base: BASE, hechos }; }
    const ci = caminos.findIndex(c => c.tr.sol === sol && c.tr.excursion === ex.n - 1);
    const st = { etapa: 'marte', sol, f, ex, base: BASE, hechos };
    if (ci >= 0) { const c = caminos[ci], u = Math.min(1, Math.max(0, (f - VENTANA[0]) / (VENTANA[1] - VENTANA[0])));
      return { ...st, traslado: c, u, campo: enCamino(c, u), parcial: u > 0 && u < 1 ? { c, u } : null }; }
    const p = S.paradas[ex.parada]; return { ...st, campo: [p.lon, p.lat] };
  }

  // ── Tripulación: insignias SVG (etiqueta HTML que sigue al terreno) + rastro del camino recorrido ──
  // Los modelos 3D no se verían a la escala del mapa (1 unidad = 10 km): se muestran en la "Vista de cerca".
  const marcador = (cls, iconos) => { const el = document.createElement('div'); el.className = `crew ${cls}`; el.hidden = true;
    el.innerHTML = `<span class="ficha"><span class="ics">${iconos}</span><span class="tag"></span></span><i class="punto"></i>`;
    $('#labels').append(el); return el; };
  const grupos = {
    todos: marcador('todos', `${ico('base')}${ico('casco')}<b>×6</b>`),
    base: marcador('base', `${ico('base')}${ico('casco')}<b>×2</b>`),
    campo: marcador('campo', `<span class="a-pie">${ico('casco')}<b>×4</b></span><span class="en-rover">${ico('rover')}</span>${ico('robot', 'galilei')}`) };
  const MAXP = caminos.reduce((n, c) => n + c.pts.length, 0) + 8, trailPos = new Float32Array(MAXP * 3);
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: '#fff8e8', depthTest: false, transparent: true, opacity: .95 }));
  trail.renderOrder = 10; trail.visible = false; scene.add(trail);
  function rastro(st) {
    const lista = []; caminos.slice(0, st.hechos ?? 0).forEach(c => lista.push(...c.pts));
    if (st.parcial) { const { c, u } = st.parcial, d = u * c.total; c.pts.forEach((p, i) => { if (c.acc[i] <= d) lista.push(p); }); lista.push(st.campo); }
    let n = 0; for (const p of lista) { const [x, z] = mundo(p); trailPos.set([x, terrH(x, z) + .004, z], n * 3); n++; if (n >= MAXP) break; }
    trailGeo.attributes.position.needsUpdate = true; trailGeo.setDrawRange(0, n); }

  // ── Interfaz ──
  const bar = $('#sim'), hud = $('#hud'), hudC = $('#hud-c'), rango = $('#sim-t');
  rango.max = N - 1;
  const pct = d => (d / (N - 1) * 100).toFixed(2) + '%';
  rango.style.setProperty('--a', pct(dA)); rango.style.setProperty('--d', pct(dD));
  $('#sim-marcas').innerHTML = S.eventos.map(e => `<i class="${e.tipo}" style="left:${pct(e.dia)}" title="${td(e.titulo)}"></i>`).join('')
    + `<span style="left:0">${ico('cohete')}${tx('Lanzamiento', 'Launch')}</span><span style="left:${pct(dA)}">${ico('aterrizaje')}${tx('Aterrizaje', 'Landing')}</span><span style="left:${pct(dD)}">${ico('despegue')}${tx('Despegue', 'Liftoff')}</span><span style="left:100%">${ico('tierra')}${tx('Tierra', 'Earth')}</span>`;
  const sim = { t: 0, vel: 5, play: false, seguir: true, activo: false, ultimoHud: -1, st: null };
  const cerca = crearCerca({ S, U, REDUCED, MOVIL, $ });
  // Iconos de la barra (los textos accesibles siguen en aria-label)
  $('#sim-play').innerHTML = ico('play'); $('#sim-x').innerHTML = `${ico('salir')}<span>${tx('Salir', 'Exit')}</span>`;
  $('#sim-seguir').insertAdjacentHTML('afterend', ico('seguir'));
  document.querySelector('#sim .vel').insertAdjacentHTML('afterbegin', `<span class="vel-ico" title="${tx('Velocidad', 'Speed')}">${ico('rapido')}</span>`);

  function pintarHud(st) {
    const t = sim.t, d = Math.min(N - 1, Math.floor(t)), ls = S.ls_diario[d], dosis = S.dosis_diaria_mSv[d], polvo = ls >= 180;
    const prox = S.eventos.find(e => e.dia > t), pasados = S.eventos.filter(e => e.dia <= t).slice(-3).reverse();
    let lugar = '', actividad = '', equipos = '';
    const ast = a => `${tx('astronautas', 'astronauts')} ${a.slice(0, -1).join(', ')} ${tx('y', 'and')} ${a.at(-1)}`;
    if (st.etapa === 'marte') {
      if (st.todos) { lugar = `Base · ${td(S.paradas[0].nombre)}`; actividad = `<b>${td(st.todos.nombre_fase)}</b> · ${tx('los 6 astronautas están en la base.', 'all 6 astronauts are at the base.')}`; }
      else { const ex = st.ex;
        equipos = `<div class="equipos"><p><span class="eq base">${ico('base')}</span><span><b>${tx('Base · equipo', 'Base · team')} ${ex.equipo_base}</b> (${ast(ex.astronautas_base)}): ${tx('estudian en el hábitat las muestras que traen los demás.', 'they study in the habitat the samples the others bring back.')} ${etiqueta('diseno')}</span></p>
          <p><span class="eq campo">${ico(st.traslado ? 'rover' : 'casco')}</span><span><b>${tx('Campo · equipos', 'Field · teams')} ${ex.equipo_campo.join(tx(' y ', ' and '))} + Galilei</b> (${ast(ex.astronautas_campo)}). ${etiqueta('diseno')}</span></p></div>`;
        if (st.traslado) { const tr = st.traslado.tr, p = S.paradas;
          lugar = `${td(p[tr.desde].nombre)} → ${td(p[tr.hasta].nombre)}`;
          actividad = tx(`<b>Turno ${ex.n} · ${tr.sentido === 'ida' ? 'salida' : 'regreso'} en ${tr.modo}</b> · ${dec((tr.largo_m / 1000).toFixed(1))} km por la ruta segura (máx. ${dec(tr.pendiente_max)}°). ${tr.motivo}.`,
            `<b>Shift ${ex.n} · ${tr.sentido === 'ida' ? 'departure' : 'return'} by ${td(tr.modo)}</b> · ${(tr.largo_m / 1000).toFixed(1)} km along the safe route (max. ${tr.pendiente_max}°). ${td(tr.motivo)}.`); }
        else { lugar = td(ex.lugar); actividad = tx(`<b>Turno ${ex.n} · ${ex.objetivo}</b>. ${ex.que_hay}. El equipo sale a caminar a menos de 2 km del rover, como planea la NASA; Galilei carga el equipo y las rocas.`,
            `<b>Shift ${ex.n} · ${td(ex.objetivo)}</b>. ${td(ex.que_hay)}. The team walks out within 2 km of the rover, as NASA plans; Galilei carries the gear and the rocks.`); } }
    } else actividad = st.etapa === 'ida' ? tx('La nave viaja de la Tierra a Marte. La tripulación recibe la radiación más alta de la misión.', 'The ship travels from Earth to Mars. The crew receives the highest radiation of the mission.') : st.fin ? tx('<b>Misión cumplida.</b> Las muestras de Jezero llegan a la Tierra.', '<b>Mission accomplished.</b> The Jezero samples arrive on Earth.') : tx('La nave regresa con las muestras de Jezero.', 'The ship returns with the Jezero samples.');
    const icoEtapa = st.etapa === 'marte' ? 'marte' : st.fin ? 'tierra' : 'cohete';
    hudC.innerHTML = `<p class="k">${ico(icoEtapa)}${tx('Simulador KAIROS 2033', 'KAIROS 2033 simulator')}</p>
      <h2>${st.etapa === 'marte' ? `Sol ${st.sol} <small>${tx('de', 'of')} ${S.sol_despegue - 1} ${tx('en Marte', 'on Mars')}</small>` : st.etapa === 'ida' ? tx('Rumbo a Marte', 'Bound for Mars') : tx('Rumbo a la Tierra', 'Bound for Earth')}</h2>
      <p class="fecha">${tx('Día', 'Day')} ${d + 1} ${tx('de', 'of')} ${N} · ${fecha(t)}</p>
      <dl><dt>${ico(icoEtapa)}${tx('Etapa', 'Stage')}</dt><dd>${st.etapa === 'marte' ? tx('En Marte, cráter Jezero', 'On Mars, Jezero crater') : st.texto}</dd>
        ${lugar ? `<dt>${ico('lugar')}${tx('Lugar', 'Place')}</dt><dd>${lugar}</dd>` : ''}
        <dt>${ico(polvo ? 'polvo' : 'sol')}${tx('Estación', 'Season')}</dt><dd>Ls ${ls.toFixed(0)}° · ${polvo ? `<span class="est no_incluido">${tx('temporada de polvo', 'dust season')}</span>` : `<span class="est verificado">${tx('fuera de la temporada de polvo', 'outside the dust season')}</span>`}</dd></dl>
      <p class="act">${actividad}</p>${equipos}
      <div class="dosis"><p class="dt">${ico('radiacion')}${tx('Radiación acumulada', 'Accumulated radiation')}</p><div class="db"><i style="width:${Math.min(100, dosis / 1100 * 100)}%"></i><b style="left:${S.limite_mSv / 1100 * 100}%"></b></div>
        <p><b>${nf(Math.round(dosis))} mSv</b> ${tx('de radiación', 'of radiation')} ${dosis >= S.limite_mSv ? `· <span class="est no_incluido">${tx('sobre el límite NASA', 'over the NASA limit')}</span>` : `· ${tx('límite NASA', 'NASA limit')} ${S.limite_mSv}`} ${etiqueta('otro_lugar')}</p></div>
      ${prox ? `<p class="prox">${ico('reloj')}<span>${tx('Próximo', 'Next')}: <b>${td(prox.titulo)}</b> · ${tx('en', 'in')} ${((n) => `${n} ${n === 1 ? tx('día', 'day') : tx('días', 'days')}`)(Math.max(1, Math.ceil(prox.dia - t)))}</span></p>` : ''}
      <p class="dt">${ico('bitacora')}${tx('Bitácora', 'Log')}</p>
      <ul class="bit">${pasados.map(e => `<li><span class="evi">${ico(icoEvento(e.titulo))}</span><span><b>${td(e.titulo)}</b> ${etiqueta(e.tipo)}<br><small>${td(e.detalle)}</small></span></li>`).join('')}</ul>
      <button type="button" class="link" id="sim-sup">${ico('info')}${tx('Supuestos y fuentes del simulador', 'Simulator assumptions and sources')}</button>`;
    $('#sim-sup').onclick = () => abrirFicha('simulacion');
    $('#sim-dia').textContent = st.etapa === 'marte' ? `Sol ${st.sol}` : `${tx('Día', 'Day')} ${d + 1}`;
  }

  function aplicar() {
    const st = estado(sim.t), d = Math.min(N - 1, Math.floor(sim.t)); sim.st = st;
    rango.value = sim.t; rango.style.setProperty('--p', pct(sim.t));
    setLs(S.ls_diario[d]);
    if (st.etapa === 'marte' && sim.vel <= 1 || st.traslado) setHora(Math.min(1, Math.max(0, (st.f - .2) / .6)));
    const enMarte = st.etapa === 'marte'; trail.visible = enMarte && (st.hechos > 0 || !!st.parcial);
    const poner = (el, pos, texto) => { el.hidden = !pos; if (!pos) return; const [x, z] = mundo(pos); el.dataset.x = x; el.dataset.z = z; el.querySelector('.tag').textContent = texto; };
    poner(grupos.todos, enMarte && st.todos ? st.base : null, tx('Tripulación · 6 en la base', 'Crew · 6 at the base'));
    poner(grupos.base, enMarte && !st.todos ? st.base : null, st.ex ? `${tx('Base · equipo', 'Base · team')} ${st.ex.equipo_base}` : '');
    poner(grupos.campo, enMarte && !st.todos ? st.campo : null, st.ex ? (st.traslado ? tx('Campo + Galilei · en rover', 'Field + Galilei · in the rover') : `${tx('Campo · equipos', 'Field · teams')} ${st.ex.equipo_campo.join(tx(' y ', ' and '))} + Galilei`) : '');
    grupos.campo.classList.toggle('mueve', !!st.traslado && st.u > 0 && st.u < 1);
    grupos.campo.classList.toggle('rover', !!st.traslado);
    if (enMarte && sim.seguir) { const [x, z] = mundo(st.campo ?? st.base), y = terrH(x, z); controls.target.lerp(new THREE.Vector3(x, y, z), .08); }
    rastro(st);
    const clave = `${d}|${st.traslado ? Math.round(st.u * 20) : ''}|${st.ex?.n ?? ''}`;
    if (clave !== sim.ultimoHud) { sim.ultimoHud = clave; pintarHud(st); }
  }

  // Avance: más lento en los traslados, el aterrizaje y el despegue para poder verlos
  function avanzar(dt) {
    if (!sim.activo || !sim.play) return;
    const st = estado(sim.t); let v = sim.vel;
    if (st.traslado) v = Math.min(v, .22);
    else if (Math.abs(sim.t - dA) < 1.5 || Math.abs(sim.t - dD) < 1.5) v = Math.min(v, .8);
    sim.t = Math.min(N - 1, sim.t + v * dt);
    if (sim.t >= N - 1) pausar();
  }
  function frame(dt, proyectar) {
    if (!sim.activo) return; avanzar(dt); aplicar(); cerca.actualizar(sim.st, sim.t, dt); cerca.render();
    for (const el of Object.values(grupos)) { if (el.hidden) continue; const x = +el.dataset.x, z = +el.dataset.z, [sx, sy, vis] = proyectar(x, terrH(x, z) + .02, z);
      el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`; el.style.visibility = vis ? 'visible' : 'hidden'; }
  }
  const pausar = () => { sim.play = false; $('#sim-play').innerHTML = ico('play'); $('#sim-play').setAttribute('aria-label', tx('Reproducir', 'Play')); };
  $('#sim-play').onclick = () => { if (sim.t >= N - 1) sim.t = 0; sim.play = !sim.play; $('#sim-play').innerHTML = ico(sim.play ? 'pausa' : 'play'); $('#sim-play').setAttribute('aria-label', sim.play ? tx('Pausar', 'Pause') : tx('Reproducir', 'Play')); };
  rango.addEventListener('input', () => { sim.t = +rango.value; pausar(); });
  document.querySelectorAll('#sim .vel button').forEach(b => b.onclick = () => { sim.vel = +b.dataset.v; document.querySelectorAll('#sim .vel button').forEach(o => o.setAttribute('aria-pressed', o === b)); });
  $('#sim-seguir').addEventListener('change', e => { sim.seguir = e.target.checked; });

  function entrar() {
    sim.activo = true; document.body.classList.add('simulando'); bar.hidden = hud.hidden = false; sim.ultimoHud = -1; cerca.mostrar(true);
    const ll = p => [p.lon, p.lat], [x0, z0] = mundo(ll(S.paradas[0])), [x1, z1] = mundo(ll(S.paradas[5])), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const destino = { x: cx + .55, y: 1.25, z: cz + 1.15 };
    if (REDUCED) { camera.position.set(destino.x, destino.y, destino.z); controls.target.set(cx, terrH(cx, cz), cz); }
    else { gsap.to(camera.position, { ...destino, duration: 2.4, ease: 'power3.inOut', onUpdate: () => controls.update() }); gsap.to(controls.target, { x: cx, y: terrH(cx, cz), z: cz, duration: 2.4, ease: 'power3.inOut' }); }
    aplicar(); }
  function salir() { sim.activo = false; pausar(); document.body.classList.remove('simulando'); bar.hidden = hud.hidden = true; Object.values(grupos).forEach(g => g.hidden = true); trail.visible = false; cerca.mostrar(false); setLs(null); }
  $('#sim-x').onclick = salir;
  return { entrar, salir, frame, get activo() { return sim.activo; } };
}
