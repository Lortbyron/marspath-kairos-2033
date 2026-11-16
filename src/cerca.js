// "Vista de cerca" del simulador KAIROS 2033: una ventana pequeña con los modelos 3D de Mateo
// (base Kairos D-02, astronautas KAIROS 01 y robot Galilei) que muestra qué pasa en el momento de la simulación.
// Es una ILUSTRACIÓN: el suelo es liso y no muestra el terreno real; la cuadrícula mide 2 m.
// En el mapa grande los modelos no se verían (1 unidad = 10 km), por eso van aquí.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { astronauta } from './modelos/astronauta.js';
import { base as crearBase } from './modelos/base.js';
import { galilei as crearGalilei } from './modelos/galilei.js';
import { ico } from './iconos.js';
import { tx, td } from './i18n.js';

const COL = { campo: '#b5603d', base: '#3f6fa0' };   // mismos colores que el mapa y el panel

export function crearCerca({ S, U, REDUCED, MOVIL, $ }) {
  const caja = $('#cerca'), pie = caja.querySelector('.pie'), PIE = pie.innerHTML, hueco = caja.querySelector('.hueco'), viaje = caja.querySelector('.viaje'), titulo = caja.querySelector('.titulo');
  const canvas = hueco.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MOVIL ? 1.5 : 2));
  renderer.shadowMap.enabled = !MOVIL; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const escena = new THREE.Scene(), cielo = new THREE.Color('#d9b48c');
  escena.background = cielo.clone(); escena.fog = new THREE.Fog(escena.background, 30, 80);
  const cam = new THREE.PerspectiveCamera(35, 1.5, .1, 200);
  const ctl = new OrbitControls(cam, canvas);
  Object.assign(ctl, { enableDamping: !REDUCED, enablePan: false, autoRotate: !REDUCED, autoRotateSpeed: .6, maxPolarAngle: Math.PI * .47, minDistance: 3, maxDistance: 45 });

  // Luz: sigue al sol real del mapa (Mars24) — misma dirección y color
  const sol = new THREE.DirectionalLight('#fff1d6', 2.4), hemi = new THREE.HemisphereLight('#f3dcc0', '#7a4e33', .9);
  sol.castShadow = true; sol.shadow.mapSize.set(1024, 1024); Object.assign(sol.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 }); sol.shadow.bias = -.0005;
  escena.add(sol, sol.target, hemi);

  // Suelo liso de color marciano + cuadrícula de 2 m (da la escala de las personas, no inventa relieve)
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(90, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#a8714b', roughness: 1 }));
  suelo.receiveShadow = true; escena.add(suelo);
  const lineas = []; for (let i = -20; i <= 20; i++) { const v = i * 2; lineas.push(-40, 0, v, 40, 0, v, v, 0, -40, v, 0, 40); }
  const gGrid = new THREE.BufferGeometry(); gGrid.setAttribute('position', new THREE.Float32BufferAttribute(lineas, 3));
  const grid = new THREE.LineSegments(gGrid, new THREE.LineBasicMaterial({ color: '#4a2c1a', transparent: true, opacity: .16, depthWrite: false })); grid.position.y = .01; escena.add(grid);

  // Modelos
  const { grupo: nave, llama } = crearBase(); escena.add(nave);
  const gente = Array.from({ length: 6 }, () => { const a = astronauta(COL.campo); escena.add(a); return a; });
  const parche = (a, color) => a.traverse(o => { if (o.isMesh && o.material.name === 'accent_orange') o.material = parcheMat(color); });
  const mats = {}; const parcheMat = c => mats[c] ??= Object.assign(new THREE.MeshStandardMaterial({ color: c, roughness: .75 }), { name: 'accent_orange' });
  const G = crearGalilei(); escena.add(G.grupo);
  // Rover presurizado: no hay modelo → contorno punteado marcado como pendiente
  const rover = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.2, 2.6, 7.2)), new THREE.LineDashedMaterial({ color: '#1b1815', dashSize: .35, gapSize: .25, transparent: true, opacity: .7 }));
  rover.computeLineDistances(); rover.position.set(0, 1.3, -.4); escena.add(rover);

  // Posiciones (metros) de cada escena
  const enArco = (n, r, z0 = 0) => Array.from({ length: n }, (_, i) => { const a = (i - (n - 1) / 2) * .32; return [Math.sin(a) * r, z0 + Math.cos(a) * r, a]; });
  const LAYOUT = {
    base: n => enArco(n, 9),
    campo: () => [[-1.6, 1.2, .5], [-.4, 2.2, .1], [1.1, 1.6, -.3], [2.2, .4, -.7]],
    rover: () => [[-.65, 1.2, 0], [.65, 1.2, 0], [-.65, -.6, 0], [.65, -.6, 0]],
  };
  const VISTA = { base: { target: [0, 3.5, 3], off: [10, 7, 20] }, campo: { target: [0, .9, .6], off: [4.5, 2.6, 7.5] }, rover: { target: [0, 1.2, -.4], off: [6, 3.5, 8] } };

  let modo = null, vistaElegida = 'campo', ultimo = '', reloj = 0, anguloG = 0;
  caja.querySelectorAll('.vistas button').forEach(b => b.onclick = () => { vistaElegida = b.dataset.vista; caja.querySelectorAll('.vistas button').forEach(o => o.setAttribute('aria-pressed', o === b)); ultimo = ''; });
  caja.querySelector('.cab .k').innerHTML = `${ico('cubo')}${tx('Vista de cerca', 'Close-up view')}`;
  const minBtn = caja.querySelector('.min');
  const minimizar = m => { caja.classList.toggle('minimizada', m); minBtn.innerHTML = ico(m ? 'cubo' : 'menos'); minBtn.setAttribute('aria-expanded', !m); minBtn.setAttribute('aria-label', m ? tx('Mostrar la vista de cerca', 'Show the close-up view') : tx('Ocultar la vista de cerca', 'Hide the close-up view')); };
  minBtn.onclick = () => minimizar(!caja.classList.contains('minimizada'));
  minimizar(MOVIL);

  function irA(v) {
    const { target, off } = VISTA[v]; ctl.target.set(...target);
    cam.position.set(target[0] + off[0], target[1] + off[1], target[2] + off[2]); ctl.update(); }

  function colocar(lista, layout, color) {
    gente.forEach((a, i) => { const p = layout[i]; a.visible = !!p && !!lista; if (!a.visible) return;
      a.position.set(p[0], 0, p[1]); a.rotation.y = p[2]; parche(a, color); });
  }

  // Esquema de los viajes Tierra ↔ Marte (no es una órbita a escala)
  function pintarViaje(st, t) {
    const ida = st.etapa === 'ida', fin = !ida && t >= S.dias - 1;
    const f = ida ? t / S.dia_aterrizaje : fin ? 1 : (t - S.dia_despegue) / (S.dias - 1 - S.dia_despegue);
    const A = ida ? [44, 118] : [276, 118], B = ida ? [276, 118] : [44, 118];
    const q = u => { const x = A[0] + (B[0] - A[0]) * u, y = A[1] - Math.sin(Math.PI * u) * 70; return [x, y]; };
    const [sx, sy] = q(Math.min(1, Math.max(0, f)));
    const dias = ida ? S.dia_aterrizaje : S.dias - 1 - S.dia_despegue, d = Math.min(dias, Math.floor(ida ? t : t - S.dia_despegue) + 1);
    viaje.innerHTML = `<svg viewBox="0 0 320 170" role="img" aria-label="${ida ? tx('Esquema del viaje de la Tierra a Marte', 'Diagram of the trip from Earth to Mars') : tx('Esquema del viaje de Marte a la Tierra', 'Diagram of the trip from Mars to Earth')}">
      <path d="M${A[0]} ${A[1]} Q160 ${A[1] - 140} ${B[0]} ${B[1]}" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="2" stroke-dasharray="4 6"/>
      <circle cx="44" cy="118" r="17" fill="#3f6fa0"/><circle cx="276" cy="118" r="11" fill="#b5603d"/>
      <text x="44" y="152" text-anchor="middle">${tx('Tierra', 'Earth')}</text><text x="276" y="152" text-anchor="middle">${tx('Marte', 'Mars')}</text>
      <g transform="translate(${sx - 12} ${sy - 12})" color="#1b1815">${ico('cohete')}</g></svg>`;
    titulo.innerHTML = fin ? `${ico('tierra')} ${tx('De regreso en la Tierra con las muestras', 'Back on Earth with the samples')}` : `${ico('cohete')} ${ida ? tx('Rumbo a Marte', 'Bound for Mars') : tx('Rumbo a la Tierra', 'Bound for Earth')} · ${tx('día', 'day')} ${d} ${tx('de', 'of')} ${dias} <small>${tx('esquema, no a escala', 'diagram, not to scale')}</small>`;
  }

  function actualizar(st, t, dt) {
    reloj += dt;
    if (st.etapa !== 'marte') {
      if (modo !== 'viaje') { modo = 'viaje'; caja.classList.add('en-viaje'); pie.innerHTML = tx('Esquema del viaje: muestra el avance por días (fechas del NASA Trajectory Browser, Traj 22313); la curva no es la órbita real. <span class="est derivado">calculado</span>', 'Trip diagram: it shows progress by day (dates from the NASA Trajectory Browser, Traj 22313); the curve is not the real orbit. <span class="est derivado">calculated</span>'); }
      pintarViaje(st, t); return;
    }
    if (modo === 'viaje' || modo === null) { caja.classList.remove('en-viaje'); pie.innerHTML = PIE; }
    const exc = !st.todos && st.ex;
    caja.querySelector('.vistas').hidden = !exc;
    let vista = st.todos ? 'base' : vistaElegida === 'base' ? 'base' : st.traslado ? 'rover' : 'campo';
    const clave = `${vista}|${st.ex?.n ?? ''}`;
    if (clave !== ultimo) { irA(vista); ultimo = clave; }
    modo = vista;

    // Aterrizaje (sol 1) y despegue (último sol): la base baja o sube con los motores encendidos
    const SOL = S.sol_en_dias, trasAterrizar = t - S.dia_aterrizaje, antesDespegar = S.dia_despegue - t;
    let alto = 0, dentro = false, despega = false;
    if (trasAterrizar < SOL * .55) { alto = 60 * (1 - trasAterrizar / (SOL * .55)) ** 2; dentro = true; }
    if (antesDespegar < SOL * .45) { dentro = despega = true; if (antesDespegar < SOL * .3) alto = 60 * (1 - antesDespegar / (SOL * .3)) ** 2; }
    nave.visible = vista === 'base'; nave.position.y = alto;
    llama.visible = nave.visible && (alto > .02 || (despega && antesDespegar < SOL * .34)); llama.scale.y = .8 + Math.sin(reloj * 40) * .15;
    if (vista === 'base') ctl.target.y = 3.5 + alto * .9;

    rover.visible = vista === 'rover';
    if (vista === 'base') {
      const n = st.todos ? 6 : 2, col = st.todos ? COL.campo : COL.base;
      colocar(!dentro, LAYOUT.base(n), col);
      G.grupo.visible = false;
      titulo.innerHTML = st.todos
        ? `${ico('base')} Base · ${td(S.paradas[0].nombre)} · ${dentro ? (alto > 0 ? (despega ? tx('despegando', 'lifting off') : tx('aterrizando', 'landing')) : tx('tripulación a bordo', 'crew on board')) : tx('6 astronautas', '6 astronauts')}`
        : `${ico('base')} ${tx('Base · equipo', 'Base · team')} ${st.ex.equipo_base} ${tx('estudia las muestras', 'studies the samples')}`;
    } else {
      colocar(true, LAYOUT[vista](), COL.campo);
      G.grupo.visible = true;
      if (vista === 'rover') {   // traslado: todos dentro del contorno del rover; el suelo avanza
        G.grupo.position.set(0, 0, -2.6); G.grupo.rotation.y = 0; G.caminar(reloj, 0);
        grid.position.z = (grid.position.z - dt * (st.u > 0 && st.u < 1 ? 3 : 0)) % 2;
        titulo.innerHTML = `${ico('rover')} ${tx('En rover presurizado', 'In the pressurized rover')} <small>${tx('modelo del rover: pendiente', 'rover model: pending')}</small>`;
      } else {                   // en el destino: Galilei camina alrededor del equipo
        anguloG += dt * (REDUCED ? 0 : .22); const r = 3.4;
        G.grupo.position.set(Math.cos(anguloG) * r, 0, Math.sin(anguloG) * r + .6); G.grupo.rotation.y = -anguloG;
        G.caminar(reloj, REDUCED ? 0 : 1); grid.position.z = 0;
        titulo.innerHTML = `${ico('casco')} ${tx('Campo', 'Field')} · ${td(st.ex.lugar)} · ${tx('4 astronautas', '4 astronauts')} + ${ico('robot')} Galilei`;
      }
    }

    // Sol y cielo del momento (mismo sol del mapa)
    const s = U.uSun.value; sol.position.set(s.x * 30, Math.max(.5, s.y * 30), s.z * 30).add(ctl.target); sol.target.position.copy(ctl.target);
    sol.color.copy(U.uSunCol.value); const luz = Math.min(1, Math.max(.25, U.uSunCol.value.g));
    hemi.intensity = .35 + .6 * luz; escena.background.copy(cielo).multiplyScalar(.35 + .65 * luz); escena.fog.color.copy(escena.background);
  }

  const tam = new ResizeObserver(() => { const w = hueco.clientWidth, h = hueco.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); });
  tam.observe(hueco);

  function render() {
    if (caja.hidden || document.body.classList.contains('solo-mapa') || modo === 'viaje' || caja.classList.contains('minimizada')) return;
    ctl.update(); renderer.render(escena, cam);
  }
  const mostrar = on => { caja.hidden = !on; ultimo = ''; modo = null; };
  return { actualizar, render, mostrar };
}
