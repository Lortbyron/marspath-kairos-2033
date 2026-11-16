import './relieve.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import { animate, stagger } from 'motion';
import { prepare, layout } from '@chenglou/pretext';
import { cargarRelieve, cargarCapa, fetchJSON } from './datos.js';
import { CAPAS, UNIDADES, EPOCA, CLASES_PEND, clasePend, cargarCapas, cargarMOLA } from './capas.js';
import { crearSimulador } from './simulador.js';
import { ico } from './iconos.js';
import { tx, td, dec, nf, LOC, EN, traducirHTML, crearSwitch } from './i18n.js';
import { crearVentanas } from './ventanas.js';
import { crearAutodestruccion } from './autodestruccion.js';

// Misión KAIROS 2033 · Fase 1–2: relieve REAL del cráter Jezero (NASA/JPL CTX DEM 20 m + ortomosaico CTX).
// Nada de este mapa es procedural: alturas, foto, nombres y paradas vienen de public/data (ver fuentes.json).

const $ = s => document.querySelector(s);
traducirHTML(); crearSwitch($('#idioma'));   // idioma ES/EN antes de pintar nada
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOVIL = innerWidth < 820 || (navigator.deviceMemory ?? 8) <= 4;
await Promise.all(['600 30px "Fraunces"', 'italic 400 15px "Fraunces"', '400 14px "DM Sans"'].map(f => document.fonts.load(f))); await document.fonts.ready;

const [R, nombresIAU, plan, validacion, fuentes, radiacion, simData, valFinal] = await Promise.all([
  cargarRelieve(MOVIL ? 'baja' : 'alta'), cargarCapa('nombres_iau'), fetchJSON('mision/plan_mision.json'), fetchJSON('validacion.json'), fetchJSON('fuentes.json'), fetchJSON('riesgos/radiacion.json'), fetchJSON('mision/simulacion.json'), fetchJSON('validacion_final.json')]);
const capas = await cargarCapas(R, MOVIL);
const HMIN = R.meta.hmin_m, RANGO = R.meta.hmax_m - R.meta.hmin_m;
const NX = R.ancho, NY = R.alto;
const M_POR_UNIDAD = 10000;                                  // 1 unidad de escena = 10 km
const W = R.anchoM / M_POR_UNIDAD, D = R.altoM / M_POR_UNIDAD; // ≈ 8.9 × 10.1 unidades
const RANGO_U = RANGO / M_POR_UNIDAD;                          // relieve total en unidades a escala 1×

// Alturas normalizadas 0..1 (fila 0 = norte). Los pocos píxeles sin dato (0.06 %) toman el valor vecino.
const NORM = new Float32Array(NX * NY);
{ let last = .5; for (let k = 0; k < NORM.length; k++) { const h = R.alturas[k]; if (Number.isFinite(h)) last = (h - HMIN) / RANGO; NORM[k] = last; } }
const sampleN = (u, v) => { const x = Math.min(NX - 1.001, Math.max(0, u * (NX - 1))), y = Math.min(NY - 1.001, Math.max(0, v * (NY - 1))), xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, i = yi * NX + xi;
  return NORM[i] * (1 - fx) * (1 - fy) + NORM[i + 1] * fx * (1 - fy) + NORM[i + NX] * (1 - fx) * fy + NORM[i + NX + 1] * fx * fy; };

// Textura de altura (half-float, fila 0 = SUR para coincidir con el uv de la malla)
const half = new Uint16Array(NX * NY);
for (let j = 0; j < NY; j++) { const src = j * NX, dst = (NY - 1 - j) * NX; for (let i = 0; i < NX; i++) half[dst + i] = THREE.DataUtils.toHalfFloat(NORM[src + i]); }
const heightTex = new THREE.DataTexture(half, NX, NY, THREE.RedFormat, THREE.HalfFloatType);
heightTex.unpackAlignment = 2; heightTex.minFilter = heightTex.magFilter = THREE.LinearFilter; heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping; heightTex.needsUpdate = true;
const fotoTex = await new THREE.TextureLoader().loadAsync(R.texturaURL);
fotoTex.colorSpace = THREE.NoColorSpace; fotoTex.wrapS = fotoTex.wrapT = THREE.ClampToEdgeWrapping;

// ───────── Three: renderer, cámara, controles ─────────
const canvas = $('#gl'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
fotoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const calcoTex = new THREE.CanvasTexture(capas.lienzo); calcoTex.colorSpace = THREE.NoColorSpace; calcoTex.anisotropy = fotoTex.anisotropy;
const molaTex = new THREE.Texture(); molaTex.magFilter = THREE.NearestFilter; molaTex.minFilter = THREE.LinearFilter; molaTex.colorSpace = THREE.NoColorSpace;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, .05, 120);
const controls = new OrbitControls(camera, canvas); Object.assign(controls, { enableDamping: !REDUCED, dampingFactor: .07, minDistance: 1.2, maxDistance: 26, maxPolarAngle: Math.PI * .47, minPolarAngle: .05, enablePan: true, screenSpacePanning: false, zoomToCursor: true, rotateSpeed: .7 });

const uvAMundo = (u, v) => [(u - .5) * W, (v - .5) * D];                        // v = 0 norte → z negativo
const [CX, CZ] = uvAMundo(...R.lonLatAUV(77.6873, 18.4082));                     // centro IAU del cráter Jezero
camera.position.set(CX, 24, CZ + .01); controls.target.set(CX, .2, CZ); controls.update();

const U = { uMap: { value: heightTex }, uFoto: { value: fotoTex }, uRise: { value: 0 }, uExag: { value: 3 }, uRangoU: { value: RANGO_U }, uRangoM: { value: RANGO }, uHmin: { value: HMIN },
  uSun: { value: new THREE.Vector3(.5, .6, .4) }, uSunCol: { value: new THREE.Color('#fff1d6') }, uAmb: { value: new THREE.Color('#dfe3ea') },
  uFotoOn: { value: 1 }, uCalco: { value: calcoTex }, uMola: { value: molaTex }, uBase: { value: 0 }, uAlt: { value: 1 }, uContour: { value: 1 }, uShadow: { value: 1 }, uSteps: { value: 40 },
  uTexel: { value: new THREE.Vector2(1 / NX, 1 / NY) }, uSize: { value: new THREE.Vector2(W, D) } };
const SEG = MOVIL ? [300, Math.round(300 * D / W)] : [640, Math.round(640 * D / W)];
const terrain = new THREE.Mesh(new THREE.PlaneGeometry(W, D, ...SEG).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: U,
  vertexShader: /* glsl */`
  uniform sampler2D uMap; uniform float uRise, uExag, uRangoU; varying vec2 vUv;
  void main(){ vUv = uv; vec3 p = position; p.y = texture2D(uMap, uv).r * uRangoU * uExag * uRise; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`,
  fragmentShader: /* glsl */`
  uniform sampler2D uMap, uFoto, uCalco, uMola; uniform float uBase, uRise, uExag, uRangoU, uRangoM, uHmin, uFotoOn, uAlt, uContour, uShadow, uSteps; uniform vec2 uTexel, uSize; uniform vec3 uSun, uSunCol, uAmb; varying vec2 vUv;
  float H(vec2 uv){ return texture2D(uMap, uv).r; }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  vec3 ramp(float t){                                   // altitud: del fondo del cráter (azul pizarra) a las mesetas (arena clara)
    vec3 c = vec3(.20,.24,.33);
    c = mix(c, vec3(.36,.36,.40), smoothstep(.00,.20,t)); c = mix(c, vec3(.58,.42,.30), smoothstep(.20,.40,t));
    c = mix(c, vec3(.76,.55,.33), smoothstep(.40,.60,t)); c = mix(c, vec3(.88,.74,.52), smoothstep(.60,.80,t)); c = mix(c, vec3(.96,.92,.84), smoothstep(.80,1.,t)); return c; }
  void main(){
    vec2 uv = vUv; float h = H(uv); float HS = uRangoU * uExag * max(uRise, .05); vec2 e = uTexel * 1.5;
    float dx = (H(uv + vec2(e.x,0.)) - H(uv - vec2(e.x,0.))) * HS / (2.*e.x*uSize.x);
    float dv = (H(uv + vec2(0.,e.y)) - H(uv - vec2(0.,e.y))) * HS / (2.*e.y*uSize.y);
    vec3 n = normalize(vec3(-dx, 1., dv));             // v crece hacia el norte (−z)
    vec3 s = normalize(uSun); float lam = clamp(dot(n, s), 0., 1.);
    // sombras: marcha de rayo sobre el relieve real hacia el sol
    float sh = 1.;
    if (uShadow > .5) { vec2 dir = normalize(vec2(s.x / uSize.x, -s.z / uSize.y) + 1e-6); float paso = .004; float mundo = length(dir * uSize) * paso;
      float tanE = s.y / max(length(s.xz), 1e-3); float occ = 0.; float h0 = h * HS;
      for (int i = 1; i < 64; i++) { if (float(i) > uSteps) break; vec2 q = uv + dir * paso * float(i); if (q.x<0.||q.x>1.||q.y<0.||q.y>1.) break;
        occ = max(occ, H(q) * HS - (h0 + float(i) * mundo * tanE + .0015)); }
      sh = 1. - smoothstep(0., .03, occ); }
    float light = lam * sh;
    vec3 alt = ramp(h); float g = texture2D(uFoto, uv).r; vec3 col; vec3 lit;
    if (uFotoOn > .5 && uBase > .5) { col = texture2D(uMola, uv).rgb; lit = col * (.6 + .5 * light * uSunCol); }   // MOLA (MGS): ya viene coloreado y sombreado
    else if (uFotoOn > .5) { vec3 foto = vec3(g); col = uAlt > .5 ? mix(foto, foto * alt * 1.85, .55) : foto;
      lit = col * (.5 + .62 * light * uSunCol); }        // la foto ya trae el sombreado del sol real: luz suave encima
    else { col = uAlt > .5 ? alt : vec3(.82,.80,.77); lit = col * (uAmb * .45 + uSunCol * light * .9); }
    if (uContour > .5) { float m = uHmin + h * uRangoM; float c = m / 50.; float fw = fwidth(c) * 1.1 + 1e-4; float l1 = 1. - smoothstep(0., fw, abs(fract(c - .5) - .5));
      float c5 = m / 250.; float fw5 = fwidth(c5) * 1.1 + 1e-4; float l5 = 1. - smoothstep(0., fw5, abs(fract(c5 - .5) - .5));
      lit = mix(lit, vec3(.16,.12,.09), clamp(l1 * .18 + l5 * .42, 0., .55)); }
    vec4 calco = texture2D(uCalco, uv); lit = mix(lit, calco.rgb * (.82 + .3 * light), calco.a);   // capas de misiones
    lit += (hash(gl_FragCoord.xy) - .5) * .014;
    gl_FragColor = vec4(lit, 1.); }` }));
scene.add(terrain);

// faldón de cartón (paredes del bloque)
const skirtMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: `uniform sampler2D uMap; uniform float uRise, uExag, uRangoU; attribute vec2 aUV; attribute float aTop; varying float vY;
  void main(){ float yTop = texture2D(uMap, aUV).r * uRangoU * uExag * uRise; float y = mix(-.38, yTop, aTop); vY = y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, y, position.z, 1.); }`,
  fragmentShader: `varying float vY; float hash(float n){ return fract(sin(n)*43758.5453); }
  void main(){ float band = floor((vY + .4) / .07); float f = fract((vY + .4) / .07); vec3 kraft = mix(vec3(.72,.55,.38), vec3(.80,.63,.44), hash(band)); kraft *= .92 + .1 * hash(band + 9.); float line = smoothstep(.0,.07,f) * (1. - smoothstep(.93,1.,f)); kraft = mix(kraft * .55, kraft, line); gl_FragColor = vec4(kraft * .92, 1.); }`, side: THREE.DoubleSide });
{ const SX = W / 2, SZ = D / 2, N = 240, pos = [], uvs = [], top = [], idx = [];
  const lados = [[t => [-SX + t * W, SZ], t => [t, 0]], [t => [SX, SZ - t * D], t => [1, t]], [t => [SX - t * W, -SZ], t => [1 - t, 1]], [t => [-SX, -SZ + t * D], t => [0, 1 - t]]]; let base = 0;
  lados.forEach(([pf, uf]) => { for (let i = 0; i <= N; i++) { const t = i / N, [x, z] = pf(t), [u, v] = uf(t); for (const tp of [1, 0]) { pos.push(x, 0, z); uvs.push(u, v); top.push(tp); } if (i < N) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } } base += (N + 1) * 2; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aUV', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1)); g.setIndex(idx); scene.add(new THREE.Mesh(g, skirtMat)); }
const plate = new THREE.Mesh(new THREE.BoxGeometry(W + .5, .14, D + .5), new THREE.MeshBasicMaterial({ color: '#2b2622' })); plate.position.y = -.45; scene.add(plate);
{ const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 20, 128, 128, 128); g.addColorStop(0, 'rgba(40,30,20,.5)'); g.addColorStop(.6, 'rgba(40,30,20,.18)'); g.addColorStop(1, 'rgba(40,30,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.9, D * 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); sh.position.y = -.53; scene.add(sh); }

// ───────── Sol real sobre Jezero: hora solar local en el sol 1 de KAIROS ─────────
// Declinación solar de Marte (Mars24, Allison & McEwen 2000): δ = asin(0.42565·sin Ls) + 0.25°·sin Ls
const LAT = 18.4082 * Math.PI / 180, LS = plan.fases_superficie[0].Ls_inicio, rad = d => d * Math.PI / 180;
const declinacion = ls => Math.asin(.42565 * Math.sin(rad(ls))) + rad(.25 * Math.sin(rad(ls)));
let LSv = LS, DECL = declinacion(LS), etiquetaSol = `sol 1 · Ls ${LS}°`;
// El simulador cambia la estación (Ls del día) y la hora; null vuelve al sol 1
function setLs(ls) { LSv = ls ?? LS; DECL = declinacion(LSv); etiquetaSol = ls == null ? `sol 1 · Ls ${LS}°` : `Ls ${LSv.toFixed(0)}°`; setSun(tod.v); }
function setHora(v) { tod.v = v; setSun(v); }
const tod = { v: .3 }; const sunWarm = new THREE.Color('#ffb877'), sunMid = new THREE.Color('#fff1d6');
function setSun(v) {
  const horas = 6 + v * 12, Hh = rad(15 * (horas - 12));
  const el = Math.asin(Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(Hh));
  const az = Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(LAT) - Math.tan(DECL) * Math.cos(LAT)) + Math.PI;  // desde el norte, sentido horario
  const e = Math.max(el, rad(2.5));
  U.uSun.value.set(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e));
  const k = Math.min(1, Math.max(0, Math.sin(el) * 2.2)); U.uSunCol.value.copy(sunWarm).lerp(sunMid, k).multiplyScalar(el > 0 ? 1 : .35); U.uAmb.value.set(.78 + .1 * k, .8 + .08 * k, .9);
  const mins = horas * 60; $('#clock').textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(Math.floor(mins % 60)).padStart(2, '0')}`;
  $('#sunel').textContent = el > 0 ? `${tx('Sol a', 'Sun at')} ${Math.round(el * 180 / Math.PI)}° · ${etiquetaSol}` : `${tx('Sol bajo el horizonte', 'Sun below the horizon')} · ${etiquetaSol}`; $('#tod').value = v; }
setSun(tod.v);

// ───────── Etiquetas: nombres IAU y paradas de KAIROS (coordenadas oficiales) ─────────
const labelsRoot = $('#labels'), labelEls = [], wp = new THREE.Vector3();
const terrH = (x, z) => sampleN(x / W + .5, z / D + .5) * RANGO_U * U.uExag.value * U.uRise.value;
function addLabel(lon, lat, html, cls, capa) { const [u, v] = R.lonLatAUV(lon, lat); if (u < 0 || u > 1 || v < 0 || v > 1) return; const [x, z] = uvAMundo(u, v);
  const el = document.createElement('div'); el.className = `lbl ${cls}`; el.innerHTML = html; el.style.opacity = 0; labelsRoot.append(el); labelEls.push({ el, x, z, cls, capa }); }
plan.ruta.forEach((p, k) => addLabel(p.lon, p.lat, `<i>${k + 1}</i><span>${td(p.nombre)}</span>`, 'stop', 'kairos'));
for (const v of capas.vehiculos) addLabel(v.lon, v.lat, v.html, v.capa === 'heli_vuelos' ? 'veh heli' : 'veh', v.capa);
for (const f of nombresIAU.features) { const [lon, lat] = f.geometry.coordinates; addLabel(lon, lat, `<i></i><span>${f.properties.name}</span>`, 'iau', 'nombres_iau'); }
// Evita que las etiquetas se encimen: prioridad a las paradas de KAIROS; si no caben, quedan solo con su número.
const caja = (x, y, w, h) => ({ x0: x - 6, y0: y - h / 2 - 2, x1: x - 6 + w + 4, y1: y + h / 2 + 2 });
const choca = (a, lista) => lista.some(b => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
function updateLabels() {
  const ocupadas = [];
  for (const L of labelEls) {
    wp.set(L.x, terrH(L.x, L.z) + .03, L.z).project(camera); const x = (wp.x * .5 + .5) * innerWidth, y = (-wp.y * .5 + .5) * innerHeight;
    L.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-5px,-50%)`;
    if (wp.z > 1 || L.el.classList.contains('off')) { L.el.style.visibility = 'hidden'; continue; }
    if (!L.w) { L.el.classList.remove('compact'); const r = L.el.getBoundingClientRect(); L.w = r.width; L.h = r.height; }
    let c = caja(x, y, L.w, L.h), compacta = false;
    if (choca(c, ocupadas)) { if (L.cls === 'stop') { compacta = true; c = caja(x, y, 20, 20); } else { L.el.style.visibility = 'hidden'; continue; } }
    L.el.classList.toggle('compact', compacta); L.el.style.visibility = 'visible'; ocupadas.push(c);
  }
}

// ───────── Lectura del terreno: altitud, pendiente y coordenadas reales ─────────
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), tip = $('#tip'); const marker = new THREE.Mesh(new THREE.SphereGeometry(.035, 16, 12), new THREE.MeshBasicMaterial({ color: '#b5603d' })); marker.visible = false; scene.add(marker);
function pick(cx, cy) { ptr.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera); const o = ray.ray.origin, d = ray.ray.direction; let t = 0, prev = 0, hit = false;
  for (let k = 0; k < 1500; k++) { t += .02; const x = o.x + d.x * t, z = o.z + d.z * t, y = o.y + d.y * t; if (Math.abs(x) > W / 2 || Math.abs(z) > D / 2) { prev = t; if (y < -1) break; continue; }
    if (y <= terrH(x, z)) { let a = prev, b = t; for (let m = 0; m < 12; m++) { const c = (a + b) / 2; (o.y + d.y * c <= terrH(o.x + d.x * c, o.z + d.z * c)) ? b = c : a = c; } t = b; hit = true; break; } prev = t; }
  if (!hit) return null; const x = o.x + d.x * t, z = o.z + d.z * t, u = x / W + .5, v = z / D + .5;
  const du = 1 / NX, dv = 1 / NY, gx = (sampleN(u + du, v) - sampleN(u - du, v)) * RANGO / (2 * R.mPorPixel), gz = (sampleN(u, v + dv) - sampleN(u, v - dv)) * RANGO / (2 * R.mPorPixelY);
  return { x, z, y: terrH(x, z), alt: HMIN + sampleN(u, v) * RANGO, pend: Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI, lonlat: R.uvALonLat(u, v) }; }
const fmt = n => Math.round(n).toLocaleString(LOC).replace('-', '−');
let lastPick = 0; canvas.addEventListener('pointermove', e => { const now = performance.now(); if (now - lastPick < 30 || tour.on) return; lastPick = now; const r = pick(e.clientX, e.clientY);
  if (!r || U.uRise.value < .6) { tip.style.opacity = 0; marker.visible = false; return; } marker.visible = true; marker.position.set(r.x, r.y + .02, r.z); marker.scale.setScalar(camera.position.distanceTo(marker.position) * .006 / .035);
  const [lon, lat] = r.lonlat, uni = capas.unidadEn(r.x / W + .5, r.z / D + .5), mu = activas.muestras_roca ? capas.muestraCerca(r.lonlat) : null;
  const p20 = capas.pendienteEn(r.x / W + .5, r.z / D + .5) ?? r.pend, cl = clasePend(p20);
  tip.innerHTML = `<b>${fmt(r.alt)} m</b>${tx('Pendiente', 'Slope')} ${Math.round(p20)}°<small>${lat.toFixed(4)}° N · ${lon.toFixed(4)}° E</small>`
    + `<span class="geo riesgo"><i class="sw" style="background:${cl.color}"></i>${cl.veredicto}</span>`
    + (uni ? `<span class="geo"><b>${uni}</b> · ${UNIDADES[uni].es}<br>${EPOCA(uni)} · USGS SIM 3464</span>` : '')
    + (mu ? `<span class="geo"><b>${tx('Muestra', 'Sample')} ${mu.nombre}</b> · ${mu.tipo}${mu.roca && mu.roca !== 'n/a' ? ` · ${mu.roca}` : ''}<br>${mu.lugar} · sol ${mu.sol}</span>` : '');
  const tipX = Math.min(e.clientX + 16, innerWidth - 290); tip.style.transform = `translate(${tipX}px,${e.clientY + 16}px)`; tip.style.opacity = 1; });
for (const ev of ['pointerleave', 'wheel', 'pointerdown']) canvas.addEventListener(ev, () => { tip.style.opacity = 0; marker.visible = false; }, { passive: true });

// ───────── Calidad adaptable ─────────
const Q = [{ name: tx('baja', 'low'), pr: 1, steps: 0 }, { name: tx('media', 'medium'), pr: 1.25, steps: 24 }, { name: tx('alta', 'high'), pr: Math.min(devicePixelRatio, 2), steps: 40 }]; let qLevel = MOVIL ? 1 : 2, qAuto = true, fpsAcc = 0, fpsN = 0, lowSecs = 0;
function applyQ() { const q = Q[qLevel]; renderer.setPixelRatio(q.pr); U.uSteps.value = q.steps; resize(); $('#b-q').textContent = `${tx('Calidad', 'Quality')}: ${qAuto ? 'auto · ' : ''}${q.name}`; }
$('#b-q').onclick = () => { if (qAuto) { qAuto = false; qLevel = 2; } else if (qLevel > 0) qLevel--; else qAuto = true; lowSecs = 0; applyQ(); };

// ───────── Controles de interfaz ─────────
const bind = (id, fn) => $(id).addEventListener('input', e => fn(e.target));
bind('#exag', t => { U.uExag.value = +t.value; $('#v-exag').textContent = (+t.value).toFixed(1) + '×'; });
bind('#l-alt', t => { U.uAlt.value = +t.checked; });
bind('#l-contour', t => { U.uContour.value = +t.checked; }); bind('#l-shadow', t => { U.uShadow.value = +t.checked; });
// Imagen base: CTX (MRO, 5 m), MOLA (MGS, 463 m, cargada desde NASA Mars Trek al elegirla) o sin foto
let molaLista = null;
for (const r of document.querySelectorAll('input[name=base]')) r.addEventListener('change', async () => {
  if (r.value === 'mola' && !molaLista) { $('#b-mola').parentElement.querySelector('small').textContent = tx('cargando…', 'loading…');
    try { molaLista = await cargarMOLA(R); molaTex.image = molaLista.lienzo; molaTex.needsUpdate = true; $('#b-mola').parentElement.querySelector('small').textContent = 'MGS'; }
    catch { $('#b-mola').parentElement.querySelector('small').textContent = tx('sin conexión', 'offline'); $('#b-ctx').checked = true; return; } }
  U.uFotoOn.value = r.value === 'none' ? 0 : 1; U.uBase.value = r.value === 'mola' ? 1 : 0; });

// Capas de misiones (calco) + etiquetas, cada una con su ficha técnica
const activas = Object.fromEntries(CAPAS.map(c => [c.id, c.on]));
const visibles = { nombres_iau: true, kairos: false };
const filasCapas = [...CAPAS.map(c => ({ ...c, tipo: 'calco' })).filter(c => !c.grupo),
  { id: 'kairos', nombre: tx('Paradas de KAIROS', 'KAIROS stops'), on: false, color: '#b5603d', tipo: 'etiqueta' },
  { id: 'nombres_iau', nombre: tx('Nombres oficiales (IAU)', 'Official names (IAU)'), on: true, color: '#f6efdf', tipo: 'etiqueta' }];
const filaCapa = c => `<div class="cap"><label><input type="checkbox" autocomplete="off" id="c-${c.id}" ${c.on ? 'checked' : ''} /><i class="sw" style="background:${c.color}"></i>${c.nombre}</label><button class="info" type="button" data-info="${c.id}" aria-label="${tx('Ficha de', 'Data sheet:')} ${c.nombre}">i</button></div>`;
const filasRiesgo = CAPAS.filter(c => c.grupo === 'riesgos').map(c => ({ ...c, tipo: 'calco' }));
$('#capas').insertAdjacentHTML('beforeend', filasCapas.map(filaCapa).join(''));
$('#riesgos').insertAdjacentHTML('beforeend', filasRiesgo.map(filaCapa).join('')
  + `<div class="chips">${[...CLASES_PEND].reverse().map(c => `<span><i class="sw" style="background:${c.color}"></i>${c.corto}</span>`).join('')}</div>`);
filasCapas.push(...filasRiesgo);
$('#riesgos').insertAdjacentHTML('beforeend', `<div class="cap rad"><span><i class="sw" style="background:#b5603d"></i>${tx('Radiación de la misión', 'Mission radiation')}</span><button class="info" type="button" data-info="radiacion" aria-label="${tx('Ficha de radiación', 'Radiation data sheet')}">i</button></div>`);
function aplicarEtiquetas() { for (const L of labelEls) L.el.classList.toggle('off', !(activas[L.capa] ?? visibles[L.capa] ?? true)); }
for (const c of filasCapas) bind(`#c-${c.id}`, t => { if (c.tipo === 'calco') { activas[c.id] = t.checked; capas.redibujar(activas); calcoTex.needsUpdate = true; } else visibles[c.id] = t.checked; aplicarEtiquetas(); });
capas.redibujar(activas); calcoTex.needsUpdate = true; aplicarEtiquetas();

// Inspector: ficha técnica leída de fuentes.json (misión, instrumento, resolución, fuente, huella SHA-256)
const POR_QUE = EN ? {
  textura_jpl_ctx: 'The CTX camera on the MRO orbiter sees details of about 5 m: large rocks, dunes and the rover tracks.',
  trek_mola: 'MOLA measured the height of Mars with a laser from the Mars Global Surveyor orbiter, which arrived in 1997. Each pixel covers hundreds of meters: compare it with CTX and you will see the delta almost disappear. Its colors (blue low, green and brown high) show height; they are not the real color of Mars.',
  relieve_jpl_ctx: 'The heights were calculated from pairs of CTX photos taken from different angles (stereo), the same way our two eyes judge distance.',
  rover_traza: 'Each segment is a real drive of Perseverance since it landed in 2021.',
  muestras_roca: 'Places where Perseverance stored rock, soil or air in sealed tubes. Hover near a yellow dot to see which one it is.',
  deposito_three_forks: 'Ten sample tubes were left on the ground here. Recovering them is the main goal of KAIROS. The real area is only about 66 × 68 m, so the pink circle is an enlarged symbol to make it visible. Perseverance was within 30 m of this spot between sols 652 and 693.',
  elipse_aterrizaje: 'The area where NASA expected Perseverance to land.',
  heli_vuelos: 'The 72 flights of Ingenuity, the first helicopter to fly on another planet (2021–2024).',
  geologia_unidades: 'Each color is a type of terrain by origin and age. Hover to see which unit is at each place.',
  nombres_iau: 'Names approved by the International Astronomical Union.',
  pendiente_clases: 'Slope is how tilted the ground is. We calculated it for every 20 × 20 m cell of the NASA elevation and colored it by the limits NASA publishes for astronauts and vehicles.',
  ruta_segura: 'The shortest path between the stops that never steps on ground steeper than 10°. If none exists, it allows up to 15°. It never goes over 20°, the NASA limit for walking in a suit. It was calculated with the most detailed elevation available: HiRISE, 1 m per pixel.',
  kairos: "The 6 stops of the mission Mateo designed. Their coordinates come from Perseverance's official data." } : {
  textura_jpl_ctx: 'La cámara CTX de la sonda MRO ve detalles de unos 5 m: rocas grandes, dunas y las huellas del rover.',
  trek_mola: 'MOLA medía la altura de Marte con un láser desde la sonda Mars Global Surveyor, que llegó en 1997. Cada píxel mide cientos de metros: compara con CTX y verás cómo el delta casi desaparece. Sus colores (azul abajo, verde y café arriba) indican altura; no son el color real de Marte.',
  relieve_jpl_ctx: 'Las alturas se calcularon con pares de fotos CTX tomadas desde ángulos distintos (estéreo), igual que nuestros dos ojos calculan la distancia.',
  rover_traza: 'Cada tramo es un recorrido real de Perseverance desde su aterrizaje en 2021.',
  muestras_roca: 'Lugares donde Perseverance guardó roca, suelo o aire en tubos sellados. Pasa el cursor cerca de un punto amarillo para ver cuál es.',
  deposito_three_forks: 'Aquí quedaron 10 tubos de muestras sobre el suelo. Recuperarlos es el objetivo principal de KAIROS. La zona real mide solo unos 66 × 68 m, así que el círculo rosa es un símbolo agrandado para poder verla. Perseverance estuvo a menos de 30 m de este lugar entre los soles 652 y 693.',
  elipse_aterrizaje: 'La zona donde la NASA esperaba que aterrizara Perseverance.',
  heli_vuelos: 'Los 72 vuelos de Ingenuity, el primer helicóptero en volar en otro planeta (2021–2024).',
  geologia_unidades: 'Cada color es un tipo de terreno según su origen y su edad. Pasa el cursor para ver qué unidad hay en cada lugar.',
  nombres_iau: 'Nombres aprobados por la Unión Astronómica Internacional.',
  pendiente_clases: 'La pendiente es qué tan inclinado está el suelo. La calculamos en cada cuadrito de 20 × 20 m del relieve de la NASA y la pintamos según los límites que la NASA publica para astronautas y vehículos.',
  ruta_segura: 'El camino más corto entre las paradas que nunca pisa suelo de más de 10°. Si no existe, permite hasta 15°. Nunca pasa de 20°, el límite de la NASA para caminar con traje. Se calculó con el relieve más detallado que hay: HiRISE, 1 m por píxel.',
  kairos: 'Las 6 paradas de la misión que diseñó Mateo. Sus coordenadas salen de los datos oficiales de Perseverance.' };
const buscarFicha = id => [...fuentes.rasters, ...fuentes.capas, ...fuentes.servicios_teselas].find(f => f.id === id);
const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
function ficha(id) {
  if (id === 'kairos') return `<p class="k">${tx('Misión KAIROS 2033', 'KAIROS 2033 Mission')}</p><h2>${tx('Paradas de la ruta del lago', 'Stops on the lake route')}</h2><p class="why">${POR_QUE.kairos}</p><dl>${plan.ruta.map((p, k) => `<dt>${k + 1}</dt><dd>${esc(td(p.nombre))}<br><small>${p.lat.toFixed(4)}° N · ${p.lon.toFixed(4)}° E · ${esc(td(p.fuente))}</small></dd>`).join('')}</dl><p class="nota">${tx('Lo único hipotético es que viaje una tripulación. El orden y los objetivos son el diseño de Mateo.', "The only hypothetical part is that a crew travels. The order and the goals are Mateo's design.")}</p>`;
  if (id === 'pendiente_clases' || id === 'ruta_segura') return fichaRiesgo(id);
  if (id === 'radiacion') return fichaRadiacion();
  if (id === 'simulacion') return fichaSimulacion();
  if (id === 'validacion') { const g = [...new Set(valFinal.pruebas.map(p => p.grupo))];
    return `<p class="k">MarsPath · ${tx('Fase', 'Phase')} 6</p><h2>${tx('Validación automática', 'Automatic validation')}</h2><p class="why"><b>${valFinal.aprobadas} ${tx('de', 'of')} ${valFinal.total}</b> ${tx('pruebas aprobadas. Un programa revisa todo el proyecto: que los archivos sean los originales de la NASA, que cada capa tenga fuente, que los números coincidan en todas partes y que la ruta respete los límites de la NASA.', "tests passed. A program checks the whole project: that the files are NASA's originals, that every layer has a source, that numbers match everywhere and that the route respects NASA limits.")}</p>
      ${g.map(n => `<h3>${esc(td(n))}</h3><ul class="pend conf">${valFinal.pruebas.filter(p => p.grupo === n).map(p => `<li>${p.ok ? etiqueta('verificado') : etiqueta('no_incluido')}<span><b>${esc(td(p.prueba))}</b><br><small>${esc(td(p.detalle))}</small></span></li>`).join('')}</ul>`).join('')}
      <p class="nota">${tx('Revisado el', 'Checked on')} ${valFinal.generado_utc.slice(0, 10)} ${tx('con', 'with')} <code>scripts/fase6_validar.py</code>. ${tx('Cualquiera puede volver a correrlo.', 'Anyone can run it again.')}</p>`; }
  const f = buscarFicha(id); if (!f) return `<p>${tx('Sin ficha.', 'No data sheet.')}</p>`;
  const fu = f.fuente ?? {}, res = f.resolucion_original_m ?? f.resolucion_m;
  const filas = [[tx('Misión', 'Mission'), td(f.mision)], [tx('Proveedor', 'Provider'), td(f.proveedor)], [tx('Resolución', 'Resolution'), res != null ? `${res} ${tx('m por píxel', 'm per pixel')}` : null], [tx('Elementos', 'Features'), f.elementos],
    [tx('Proyección', 'Projection'), td(f.proyeccion)], [tx('Descargado', 'Downloaded'), fu.descargado_utc?.slice(0, 10)], ['SHA-256', fu.sha256 ? `${fu.sha256.slice(0, 16)}…` : null],
    ['LINK', (fu.url ?? f.url ?? f.capacidades) ? `<a href="${esc(fu.url ?? f.capacidades ?? f.url.split('{')[0])}" target="_blank" rel="noopener">${tx('abrir enlace oficial', 'open official link')}</a>` : null], ['DOI', f.doi ? `<a href="${esc(f.doi)}" target="_blank" rel="noopener">${esc(f.doi.replace('https://doi.org/', ''))}</a>` : null]]
    .filter(([, v]) => v != null && v !== '').map(([k, v]) => `<dt>${k === 'LINK' ? tx('Fuente', 'Source') : k}</dt><dd>${k === 'LINK' || k === 'DOI' ? v : esc(v)}</dd>`).join('');
  const nota = td(f.aviso ?? f.nota) ?? (id === 'trek_mola' && molaLista ? tx(`En esta vista cada píxel de MOLA cubre unos ${Math.round(molaLista.mPorPixel)} m (nivel 7 de Mars Trek).`, `In this view each MOLA pixel covers about ${Math.round(molaLista.mPorPixel)} m (Mars Trek level 7).`) : null);
  const leyenda = id === 'geologia_unidades' ? `<ul class="uni">${Object.entries(UNIDADES).map(([k, u]) => `<li><i class="sw" style="background:${u.color}"></i><b>${k}</b><span>${u.es}<br><small>${EPOCA(k)}</small></span></li>`).join('')}</ul><p class="nota">${tx('Unidades y límites: USGS SIM 3464. Los colores son de este mapa, no los del mapa impreso.', 'Units and boundaries: USGS SIM 3464. The colors belong to this map, not to the printed map.')}</p>` : '';
  return `<p class="k">${esc(td(f.mision) ?? '')}</p><h2>${esc(td(f.titulo))}</h2>${POR_QUE[id] ? `<p class="why">${POR_QUE[id]}</p>` : ''}<dl>${filas}</dl>${nota ? `<p class="nota">${esc(nota)}</p>` : ''}${leyenda}`;
}
const km = m => dec((m / 1000).toFixed(1)) + ' km', pc = n => dec(n) + (EN ? '%' : ' %');
function fichaRiesgo(id) {
  const rz = capas.riesgos, f = buscarFicha(id), fu = f?.fuente ?? {};
  const huella = `<dl><dt>${tx('Relieve', 'Elevation')}</dt><dd>NASA/JPL CTX DEM, 20 m</dd><dt>SHA-256</dt><dd>${esc(fu.sha256?.slice(0, 16) ?? '')}…</dd><dt>${tx('Fuente', 'Source')}</dt><dd><a href="${esc(fu.url ?? '')}" target="_blank" rel="noopener">${tx('abrir enlace oficial', 'open official link')}</a></dd><dt>${tx('Método', 'Method')}</dt><dd>${esc(td(id === 'ruta_segura' ? rz.metodo.ruta : rz.metodo.pendiente))}</dd></dl>`;
  const limites = `<h3>${tx('Límites publicados por la NASA', 'Limits published by NASA')}</h3><ul class="lim">${rz.limites_nasa.map(l => `<li><b>${l.grados}°</b><span>${esc(td(l.quien))}<br><small>“${esc(l.cita)}” · <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(td(l.documento))}</a>${l.nota ? `<br>${esc(td(l.nota))}` : ''}</small></span></li>`).join('')}</ul>
    <p class="nota">${esc(td(rz.aviso_luna_marte))}</p>`;
  if (id === 'pendiente_clases') {
    const a = rz.areas.dentro_del_crater, v = rz.validacion_perseverance;
    return `<p class="k">KAIROS 2033 · ${tx('Fase 3 · derivado', 'Phase 3 · derived')}</p><h2>${tx('Pendientes y zonas de riesgo', 'Slopes and risk zones')}</h2><p class="why">${POR_QUE[id]}</p>
      <h3>${tx('Dentro del cráter Jezero', 'Inside Jezero crater')}</h3><ul class="uni">${a.map((c, k) => `<li><i class="sw" style="background:${[...CLASES_PEND].reverse()[k].color}"></i><b>${pc(c.porcentaje)}</b><span>${esc(td(c.clase))}<br><small>${dec(c.km2)} km²</small></span></li>`).join('')}</ul>
      ${limites}<h3>${tx('Comprobación con Perseverance', 'Check against Perseverance')}</h3><p class="why">${tx(`Bajo el recorrido real del robot, la pendiente mediana es ${dec(v.mediana)}° y la máxima ${dec(v.max)}°. El ${pc(v.pct_mas_20)} del recorrido pasa por más de 20°: un robot puede ir donde una persona no debería (su límite es 30° de inclinación).`, `Under the robot's real traverse, the median slope is ${dec(v.mediana)}° and the maximum ${dec(v.max)}°. ${pc(v.pct_mas_20)} of the traverse crosses more than 20°: a robot can go where a person should not (its limit is a 30° tilt).`)}</p>
      ${huella}<p class="nota">${esc(td(rz.metodo.limitacion))}</p>`; }
  const H = rz.hirise, T = H.total, g = n => dec(n) + '°';
  return `<p class="k">KAIROS 2033 · ${tx('Fase 3 · derivado', 'Phase 3 · derived')}</p><h2>${tx('Ruta más segura', 'Safest route')}</h2><p class="why">${POR_QUE[id]}</p>
    <p class="why"><b>${km(T.largo_m)}</b> ${tx('en total · pendiente máxima', 'in total · max. slope')} <b>${g(T.pendiente_max)}</b> · ${tx('medida con el relieve HiRISE de 1 m (celdas de 2 m).', 'measured with the HiRISE 1 m elevation (2 m cells).')}</p>
    <table class="tramos"><thead><tr><th>${tx('Tramo', 'Leg')}</th><th>${tx('Largo', 'Length')}</th><th>${tx('Máx.', 'Max.')}</th><th>${tx('Ruta de 20 m vista a 2 m', '20 m route seen at 2 m')}</th></tr></thead><tbody>${H.tramos.map((t, k) => { const c = t.ruta_ctx_vista_en_hirise;
      return `<tr><td>${k + 1}→${k + 2}<br><small>${esc(td(t.hasta))}</small></td><td>${km(t.largo_m)}${t.a_pie_2km ? '' : `<br><small>${tx('más de 2 km: rover', 'over 2 km: rover')}</small>`}</td><td>${g(t.pendiente_max)}<br><small>${tx('regla', 'rule')} ${t.umbral_usado}°</small></td><td class="${c.pct_mas_20 > 0 ? 'mal' : ''}">${g(c.pendiente_max)}${c.pct_mas_20 > 0 ? `<br><small>${pc(c.pct_mas_20)} ${tx('sobre 20°', 'over 20°')}</small>` : ''}</td></tr>`; }).join('')}</tbody></table>
    ${(() => { const mx = g(Math.max(...H.tramos.map(t => t.ruta_ctx_vista_en_hirise.pendiente_max))), rr = g(rz.tramos[2].linea_recta.pendiente_max), ar = T.arena_m ?? rz.total.arena_m; return EN
      ? `<p class="nota">The green line uses the HiRISE 1 m elevation. The white dashed line is the route calculated with the CTX 20 m elevation: it looked safe, but at 2 m it crosses steps of up to ${mx}. With more detail the route changes: that is why resolution matters.</p>
    <p class="nota">In a straight line, leg 3→4 crosses the delta scarp (up to ${rr} in the 20 m elevation). ${ar} m of the 20 m route cross sand (USGS unit Aeb): the Spirit rover got stuck in sand in 2009.</p>
    <p class="why">According to NASA, walks are planned up to 2 km from the vehicle, at about 2 km/h on flat ground. Legs longer than 2 km would be driven in a pressurized rover.</p>`
      : `<p class="nota">La línea verde usa el relieve HiRISE de 1 m. La línea blanca punteada es la ruta calculada con el relieve CTX de 20 m: parecía segura, pero a 2 m cruza escalones de hasta ${mx}. Con más detalle, la ruta cambia: por eso la resolución importa.</p>
    <p class="nota">En línea recta, el tramo 3→4 cruza el escarpe del delta (hasta ${rr} en el relieve de 20 m). ${ar} m de la ruta de 20 m cruzan arena (unidad Aeb de USGS): en arena se atascó el rover Spirit en 2009.</p>
    <p class="why">Según la NASA, a pie se planea alejarse hasta 2 km del vehículo, a unos 2 km/h en terreno plano. Los tramos de más de 2 km se harían en rover presurizado.</p>`; })()}
    ${limites}<dl><dt>${tx('Relieve', 'Elevation')}</dt><dd>HiRISE 1 m · USGS Mars 2020 TRN</dd><dt>SHA-256</dt><dd>${esc(H.fuente.sha256_recorte.slice(0, 16))}… (${tx('recorte', 'crop')})</dd><dt>${tx('Fuente', 'Source')}</dt><dd><a href="${esc(H.fuente.url)}" target="_blank" rel="noopener">${tx('abrir enlace oficial', 'open official link')}</a></dd><dt>${tx('Método', 'Method')}</dt><dd>${esc(td(rz.metodo.ruta))} ${esc(td(H.metodo))}</dd></dl>
    <p class="nota">${tx('Aún a 1 m no se ven rocas sueltas pequeñas. En una misión real se revisaría con las fotos HiRISE de 25 cm.', 'Even at 1 m, small loose rocks are not visible. A real mission would check with the 25 cm HiRISE photos.')}</p>`;
}
// Radiación: dosis acumulada día a día (una sola serie) con el límite de la NASA como referencia
function graficaDosis(rz) {
  const S = rz.serie_diaria_mSv, n = S.length, Wg = 284, Hg = 150, m = { l: 34, r: 8, t: 10, b: 22 }, ymax = 1100;
  const X = i => m.l + i / (n - 1) * (Wg - m.l - m.r), Y = v => m.t + (1 - v / ymax) * (Hg - m.t - m.b);
  const d0 = new Date(rz.serie_inicio), idx = f => Math.round((new Date(f) - d0) / 864e5);
  const iA = idx(rz.fechas_clave.aterrizaje), iD = idx(rz.fechas_clave.despegue), c = rz.cruza_limite;
  const linea = S.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const banda = (a, b, t) => `<rect x="${X(a)}" y="${m.t}" width="${X(b) - X(a)}" height="${Hg - m.t - m.b}" fill="var(--banda)"/><text x="${(X(a) + X(b)) / 2}" y="${Hg - 8}" text-anchor="middle">${t}</text>`;
  return `<figure class="graf"><svg viewBox="0 0 ${Wg} ${Hg}" role="img" aria-label="${tx(`Dosis acumulada: ${rz.total_mSv} mSv al regresar; cruza el límite de ${rz.limite_mSv} mSv el sol ${c.sol}`, `Accumulated dose: ${rz.total_mSv} mSv on return; crosses the ${rz.limite_mSv} mSv limit on sol ${c.sol}`)}">
    ${banda(iA, iD, tx('en Marte', 'on Mars'))}<text x="${(X(0) + X(iA)) / 2}" y="${Hg - 8}" text-anchor="middle">${tx('ida', 'out')}</text><text x="${(X(iD) + X(n - 1)) / 2}" y="${Hg - 8}" text-anchor="middle">${tx('vuelta', 'back')}</text>
    ${[0, 500, 1000].map(v => `<line class="grid" x1="${m.l}" x2="${Wg - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 4}" y="${Y(v) + 3}" text-anchor="end">${nf(v)}</text>`).join('')}
    <line class="lim" x1="${m.l}" x2="${Wg - m.r}" y1="${Y(rz.limite_mSv)}" y2="${Y(rz.limite_mSv)}"/><text class="limt" x="${m.l + 3}" y="${Y(rz.limite_mSv) - 4}">${tx('límite NASA', 'NASA limit')} ${rz.limite_mSv}</text>
    <path class="serie" d="${linea}"/><circle class="pt" cx="${X(c.dia_mision - 1)}" cy="${Y(rz.limite_mSv)}" r="4"/>
    <line class="cruz" y1="${m.t}" y2="${Hg - m.b}" x1="0" x2="0" visibility="hidden"/><circle class="hov" r="4" visibility="hidden"/>
    <rect class="hit" x="${m.l}" y="0" width="${Wg - m.l - m.r}" height="${Hg}" fill="transparent"/></svg>
    <figcaption class="gtip" aria-live="polite">${tx('Pasa el cursor por la línea para ver cada día.', 'Hover over the line to see each day.')}</figcaption></figure>`;
}
function activarGrafica(rz) {
  const svg = document.querySelector('#insp .graf svg'); if (!svg) return;
  const S = rz.serie_diaria_mSv, n = S.length, cap = document.querySelector('#insp .gtip'), cruz = svg.querySelector('.cruz'), hov = svg.querySelector('.hov');
  const d0 = new Date(rz.serie_inicio), iA = Math.round((new Date(rz.fechas_clave.aterrizaje) - d0) / 864e5), iD = Math.round((new Date(rz.fechas_clave.despegue) - d0) / 864e5);
  svg.querySelector('.hit').addEventListener('pointermove', e => { const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * 284, i = Math.max(0, Math.min(n - 1, Math.round((vx - 34) / (284 - 42) * (n - 1))));
    const x = 34 + i / (n - 1) * 242, y = 10 + (1 - S[i] / 1100) * 118, f = new Date(d0.getTime() + i * 864e5);
    cruz.setAttribute('x1', x); cruz.setAttribute('x2', x); cruz.setAttribute('visibility', 'visible'); hov.setAttribute('cx', x); hov.setAttribute('cy', y); hov.setAttribute('visibility', 'visible');
    const etapa = i < iA ? tx('viaje de ida', 'outbound trip') : i < iD ? `${tx('en Marte', 'on Mars')} · sol ${Math.floor((i - iA) / 1.02749) + 1}` : tx('viaje de vuelta', 'return trip');
    cap.innerHTML = `<b>${nf(Math.round(S[i]))} mSv</b> · ${tx('día', 'day')} ${i + 1} · ${f.toISOString().slice(0, 10)} · ${etapa}`; });
  svg.querySelector('.hit').addEventListener('pointerleave', () => { cruz.setAttribute('visibility', 'hidden'); hov.setAttribute('visibility', 'hidden'); cap.textContent = tx('Pasa el cursor por la línea para ver cada día.', 'Hover over the line to see each day.'); });
}
// Etiquetas de confianza (las mismas en todo el proyecto)
const CONF = EN ? { verificado: 'verified', corregido: 'corrected', derivado: 'calculated', otro_lugar: 'from another place', pendiente: 'pending', no_incluido: 'not included', supuesto: 'assumption', diseno: "Mateo's design", hipotetico: 'hypothetical', real: 'real data' }
  : { verificado: 'verificado', corregido: 'corregido', derivado: 'calculado', otro_lugar: 'de otro lugar', pendiente: 'pendiente', no_incluido: 'no incluido', supuesto: 'supuesto', diseno: 'diseño de Mateo', hipotetico: 'hipotético', real: 'dato real' };
function etiqueta(t) { return `<span class="est ${t}">${CONF[t] ?? t}</span>`; }
function fichaSimulacion() {
  const S = simData;
  return `<p class="k">KAIROS 2033 · ${tx('Fase', 'Phase')} 5</p><h2>${tx('Supuestos y fuentes del simulador', 'Simulator assumptions and sources')}</h2>
    <p class="why">${tx('El simulador junta los datos de las fases anteriores y los recorre día por día. No agrega números nuevos: lo que no tiene fuente está marcado.', 'The simulator brings together the data from the previous phases and walks through it day by day. It adds no new numbers: anything without a source is labeled.')}</p>
    <div class="leyconf"><b>${tx('Qué tan seguro es cada dato', 'How certain each piece of data is')}</b>${['real', 'derivado', 'otro_lugar', 'diseno', 'supuesto', 'pendiente', 'hipotetico'].map(etiqueta).join('')}</div>
    <h3>${tx('Datos que usa', 'Data it uses')}</h3><ul class="pend conf">
      <li>${etiqueta('real')}<span>${tx('Fechas de viaje: NASA Ames Trajectory Browser, trayectoria', 'Travel dates: NASA Ames Trajectory Browser, trajectory')} ${plan.trayectoria.traj_id} (${S.inicio} → ${plan.trayectoria.regreso_tierra}).</span></li>
      <li>${etiqueta('derivado')}<span>${tx('Estación (Ls) de cada día y temporada de polvo: Mars24 de la NASA (Allison y McEwen 2000).', "Season (Ls) of each day and dust season: NASA's Mars24 (Allison and McEwen 2000).")}</span></li>
      <li>${etiqueta('derivado')}<span>${tx('Ruta segura con el relieve HiRISE de 1 m (USGS). Nunca pasa de 15°.', 'Safe route with the HiRISE 1 m elevation (USGS). It never goes over 15°.')}</span></li>
      <li>${etiqueta('verificado')}<span>${tx(`A pie solo los tramos de hasta ${S.regla_a_pie.max_m / 1000} km, a unos ${S.regla_a_pie.kmh} km/h`, `On foot only for legs up to ${S.regla_a_pie.max_m / 1000} km, at about ${S.regla_a_pie.kmh} km/h`)}: ${esc(td(S.regla_a_pie.fuente))}. ${tx('Los demás, en rover presurizado.', 'The rest, by pressurized rover.')}</span></li>
      <li>${etiqueta('otro_lugar')}<span>${tx('Radiación día por día: RAD de Curiosity, medida en Gale y en el viaje de 2011–2012 (ver ficha de radiación).', "Day-by-day radiation: Curiosity's RAD, measured at Gale and during the 2011–2012 trip (see the radiation data sheet).")}</span></li></ul>
    <h3>${tx('Supuestos del simulador', 'Simulator assumptions')}</h3><ul class="pend conf">${S.supuestos.map(x => `<li>${etiqueta(x.tipo)}<span>${esc(td(x.texto))}</span></li>`).join('')}</ul>
    <h3>${tx('Robot', 'Robot')} ${esc(S.robot.nombre)}</h3><ul class="pend conf"><li>${etiqueta('hipotetico')}<span>${esc(td(S.robot.hace))} ${esc(td(S.robot.porque))} <a href="${esc(S.robot.fuente_nombre)}" target="_blank" rel="noopener">${tx('fuente', 'source')}</a><br><small>${esc(td(S.robot.aviso))}</small></span></li></ul>
    <h3>${tx('Turnos de exploración', 'Exploration shifts')}</h3><table class="tramos"><thead><tr><th>${tx('Turno', 'Shift')}</th><th>${tx('Destino', 'Destination')}</th><th>${tx('En la base', 'At the base')}</th></tr></thead><tbody>${S.excursiones.map(e => { const ida = S.traslados.find(t => t.excursion === e.n - 1);
      return `<tr><td>${e.n}<br><small>${tx('soles', 'sols')} ${e.sol_salida}–${e.sol_regreso}</small></td><td>${esc(td(e.lugar))}<br><small>${km(ida.largo_m)} ${tx('en', 'by')} ${td(ida.modo)} · ${tx('máx.', 'max.')} ${dec(ida.pendiente_max)}°</small></td><td>${tx('Equipo', 'Team')} ${e.equipo_base}<br><small>${tx('astronautas', 'astronauts')} ${e.astronautas_base.join(tx(' y ', ' and '))}</small></td></tr>`; }).join('')}</tbody></table>`;
}
function fichaRadiacion() {
  const rz = radiacion, e = rz.etapas, c = rz.cruza_limite, cmp = rz.comparacion_nasa, n1 = dec;
  const meta = Object.values(rz.meta_revision).map(f => `<li><b>${n1(f.valor)} ${esc(td(f.unidad))}</b>${etiqueta(f.estado)}<span>${esc(td(f.que))}<br><small>“${esc(f.cita)}” · <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(td(f.pagina))}</a>${f.articulo ? ` · ${esc(f.articulo)}` : ''}${f.nota ? `<br>${esc(td(f.nota))}` : ''}</small></span></li>`).join('');
  const T = EN ? {
      k: 'Phase 4 · derived', h: 'Mission radiation',
      p1: 'Away from Earth there is no magnetic field or thick air to stop cosmic rays. The Curiosity rover carried a detector (RAD) that measured how much radiation a person would receive on the trip and on the surface of Mars.',
      p2: '<b>Estimate with data from another place.</b> Radiation was measured at Gale crater and inside Curiosity\'s spacecraft, not at Jezero. The labels below say what is verified and what is not.',
      tot: `<b>${nf(rz.total_mSv)} mSv</b> in ${plan.duracion.total_dias} days: ${n1(rz.veces_limite)} times the career limit of a NASA astronaut (${rz.limite_mSv} mSv).`,
      th: ['Stage', 'Days', 'Dose'], f: ['Outbound (1.8 mSv/day)', 'Surface (0.67 mSv/day)', 'Return (1.8 mSv/day)'],
      cruza: `The crew passes the ${rz.limite_mSv} mSv limit on <b>sol ${c.sol}</b> (${c.fecha}), during the “${esc(td(c.fase))}” phase. That is why the survival guide must teach how to stay protected: a shielded shelter and less time outside.`,
      cmp: `<b>Independent check:</b> NASA calculated about ${nf(cmp.referencia_mSv)} mSv for a ${cmp.referencia_dias.join(' + ')} day mission. KAIROS (${cmp.kairos_dias.join(' + ')} days) gives ${nf(rz.total_mSv)} mSv: a ${n1(cmp.diferencia_pct)}% difference.`,
      ley: 'How certain each piece of data is', meta: 'Meta-review of every number', pend: 'What is not 100% verified' } : {
      k: 'Fase 4 · derivado', h: 'Radiación de la misión',
      p1: 'Fuera de la Tierra no hay campo magnético ni aire grueso que frenen los rayos cósmicos. El rover Curiosity llevó un detector (RAD) que midió cuánta radiación recibiría una persona en el viaje y en la superficie de Marte.',
      p2: '<b>Estimación con datos de otro lugar.</b> La radiación se midió en el cráter Gale y dentro de la nave de Curiosity, no en Jezero. Las etiquetas de abajo dicen qué está verificado y qué no.',
      tot: `<b>${nf(rz.total_mSv)} mSv</b> en ${plan.duracion.total_dias} días: ${n1(rz.veces_limite)} veces el límite de toda la carrera de un astronauta de la NASA (${rz.limite_mSv} mSv).`,
      th: ['Etapa', 'Días', 'Dosis'], f: ['Ida (1,8 mSv/día)', 'Superficie (0,67 mSv/día)', 'Vuelta (1,8 mSv/día)'],
      cruza: `La tripulación pasa el límite de ${rz.limite_mSv} mSv el <b>sol ${c.sol}</b> (${c.fecha}), durante la fase “${esc(c.fase)}”. Por eso la guía de supervivencia debe enseñar a protegerse: refugio con blindaje y menos tiempo afuera.`,
      cmp: `<b>Comprobación independiente:</b> la NASA calculó unos ${nf(cmp.referencia_mSv)} mSv para una misión de ${cmp.referencia_dias.join(' + ')} días. KAIROS (${cmp.kairos_dias.join(' + ')} días) da ${nf(rz.total_mSv)} mSv: ${n1(cmp.diferencia_pct)} % de diferencia.`,
      ley: 'Qué tan seguro es cada dato', meta: 'Meta-revisión de cada número', pend: 'Lo que no está 100 % verificado' };
  return `<p class="k">KAIROS 2033 · ${T.k}</p><h2>${T.h}</h2>
    <p class="why">${T.p1}</p>
    <p class="nota">${T.p2}</p>
    <p class="why">${T.tot}</p>
    ${graficaDosis(rz)}
    <table class="tramos"><thead><tr><th>${T.th[0]}</th><th>${T.th[1]}</th><th>${T.th[2]}</th></tr></thead><tbody>
      <tr><td>${T.f[0]}</td><td>${e.ida.dias}</td><td>${e.ida.mSv} mSv</td></tr><tr><td>${T.f[1]}</td><td>${e.superficie.dias}</td><td>${e.superficie.mSv} mSv</td></tr>
      <tr><td>${T.f[2]}</td><td>${e.vuelta.dias}</td><td>${e.vuelta.mSv} mSv</td></tr></tbody></table>
    <p class="nota">${T.cruza}</p>
    <p class="why">${T.cmp}</p>
    <div class="leyconf"><b>${T.ley}</b>${['verificado', 'corregido', 'derivado', 'otro_lugar', 'pendiente', 'no_incluido'].map(etiqueta).join('')}</div>
    <h3>${T.meta}</h3><ul class="lim meta">${meta}</ul>
    <h3>${T.pend}</h3><ul class="pend conf">${rz.pendientes.map(t => `<li>${etiqueta(t.tipo)}<span>${esc(td(t.texto))}</span></li>`).join('')}</ul>
    <p class="nota">${esc(td(rz.aviso))}</p>`;
}
let fichaAbierta = null;
function abrirFicha(id) { const insp = $('#inspector'); document.querySelectorAll('button.info').forEach(b => b.setAttribute('aria-pressed', b.dataset.info === id && fichaAbierta !== id));
  if (fichaAbierta === id) { insp.hidden = true; fichaAbierta = null; return; } fichaAbierta = id; $('#insp').innerHTML = ficha(id); if (id === 'radiacion') activarGrafica(radiacion); insp.hidden = false; insp.scrollTop = 0; }
document.querySelectorAll('button.info').forEach(b => b.addEventListener('click', () => abrirFicha(b.dataset.info)));
// ───────── Fase 5 · Simulador ─────────
const proyectar = (x, y, z) => { wp.set(x, y, z).project(camera); return [(wp.x * .5 + .5) * innerWidth, (-wp.y * .5 + .5) * innerHeight, wp.z < 1]; };
const simulador = crearSimulador({ S: simData, R, scene, camera, controls, terrH, uvAMundo, setLs, setHora, abrirFicha: id => { if (fichaAbierta !== id) abrirFicha(id); }, etiqueta, REDUCED, MOVIL, U, $ });
$('#b-sim').innerHTML = `${ico('play')}<span>${tx('Iniciar simulador KAIROS 2033', 'Start the KAIROS 2033 simulator')}</span>`;
$('#b-sim').onclick = () => { if (tour.on) endTour(); playT?.kill(); simulador.entrar(); };
$('#insp-x').onclick = () => abrirFicha(fichaAbierta);
bind('#tod', t => { tod.v = +t.value; setSun(tod.v); });
let playing = false, playT = null; $('#b-play').onclick = () => { playing = !playing; $('#b-play').textContent = playing ? '❚❚' : '▶'; if (playing) { if (REDUCED) { playing = false; $('#b-play').textContent = '▶'; return; } playT = gsap.to(tod, { v: 1, duration: (1 - tod.v) * 22, ease: 'none', onUpdate: () => setSun(tod.v), onComplete: () => { tod.v = 0; playing = false; $('#b-play').textContent = '▶'; } }); } else playT?.kill(); };
let risen = true; $('#b-rise').onclick = () => { risen = !risen; $('#b-rise').textContent = risen ? tx('Aplanar', 'Flatten') : tx('Levantar', 'Raise'); if (REDUCED) { U.uRise.value = risen ? 1 : 0; return; } gsap.to(U.uRise, { value: risen ? 1 : 0, duration: 2.4, ease: 'power3.inOut' }); };

// leyenda con las altitudes reales del mapa
$('#ticks').innerHTML = [0, .25, .5, .75, 1].map(t => `<span>${fmt(HMIN + t * RANGO)}</span>`).join('');
const vr = validacion.resultados[0];
$('#val').innerHTML = `<button type="button" class="valbtn" data-info="validacion">✓ ${valFinal.aprobadas} ${tx('de', 'of')} ${valFinal.total} ${tx('pruebas de validación aprobadas', 'validation tests passed')}</button><br>${tx('Relieve vs.', 'Elevation vs.')} ${vr.puntos} ${tx('paradas del rover', 'rover stops')}: ${dec(vr.dif_mediana_abs_m)} ${tx('m de diferencia mediana.', 'm median difference.')}`;
$('#val .valbtn').onclick = () => abrirFicha('validacion');

// ───────── Vuelo guiado: órbita baja alrededor del borde del cráter ─────────
const tour = { on: false, t: 0 }; const RADIO = 3.1;  // el borde está a ≈2.4 unidades (23.8 km) del centro
const VIEWS = [[CX + 5.5, 6.5, CZ + 7.5], [CX - 6, 4, CZ + 3], [CX + 1.5, 3.5, CZ - 7], [CX, 18, CZ + .5]]; let viewIdx = 0;
$('#b-tour').onclick = () => {
  if (REDUCED) { viewIdx = (viewIdx + 1) % VIEWS.length; camera.position.set(...VIEWS[viewIdx]); controls.target.set(CX, .3, CZ); controls.update(); return; }
  if (tour.on) return endTour(); tour.on = true; tour.t = 0; controls.enabled = false; gsap.to(camera, { fov: 50, duration: 1.2, onUpdate: () => camera.updateProjectionMatrix() }); $('#b-tour').textContent = tx('Detener vuelo', 'Stop flight'); tip.style.opacity = 0; marker.visible = false;
  gsap.to(tour, { t: 1, duration: 40, ease: 'none', onComplete: endTour }); };
function endTour() { if (!tour.on) return; gsap.killTweensOf(tour); tour.on = false; controls.enabled = true; gsap.to(camera, { fov: 32, duration: 1.2, onUpdate: () => camera.updateProjectionMatrix() }); $('#b-tour').textContent = tx('Vuelo sobre el cráter', 'Fly over the crater'); controls.target.set(CX, .3, CZ); controls.update(); }
const tp = new THREE.Vector3(), tl2 = new THREE.Vector3();
function tourFrame() { const a = tour.t * Math.PI * 2 + 2.6; tp.set(CX + Math.cos(a) * RADIO, 0, CZ + Math.sin(a) * RADIO);
  tp.x = Math.max(-W / 2 + .2, Math.min(W / 2 - .2, tp.x)); tp.z = Math.max(-D / 2 + .2, Math.min(D / 2 - .2, tp.z)); tp.y = terrH(tp.x, tp.z) + 1.1;
  tl2.set(CX, terrH(CX, CZ) + .05, CZ); camera.position.lerp(tp, .05); controls.target.lerp(tl2, .05); camera.lookAt(controls.target); }

// ───────── Intro y bucle ─────────
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); applyQ(); $('#carga').remove();
{ const h1 = $('#title h1'), cs = getComputedStyle(h1), font = `${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`, w = h1.getBoundingClientRect().width, p = prepare(h1.textContent, font), n = layout(p, w, parseFloat(cs.lineHeight)).lineCount; let lo = 60, hi = w; while (hi - lo > 1) { const m = (lo + hi) / 2; layout(p, m, parseFloat(cs.lineHeight)).lineCount === n ? hi = m : lo = m; } h1.style.maxWidth = Math.ceil(hi) + 2 + 'px'; }
if (REDUCED) { U.uRise.value = 1; camera.position.set(...VIEWS[0]); controls.target.set(CX, .3, CZ); controls.update(); labelEls.forEach(l => l.el.style.opacity = 1); }
else { ['#title', '#panel', '#time', '#legend'].forEach(s => { $(s).style.opacity = 0; });
  const [vx, vy, vz] = VIEWS[0];
  gsap.timeline().to(U.uRise, { value: 1, duration: 3.4, ease: 'power3.inOut' }, .6)
    .to(camera.position, { x: vx, y: vy, z: vz, duration: 3.6, ease: 'power3.inOut', onUpdate: () => controls.update() }, .6).to(tod, { v: .3, duration: 3.6, ease: 'power2.inOut', onUpdate: () => setSun(tod.v) }, .6)
    .add(() => { animate('#title', { opacity: [0, 1], y: [-14, 0] }, { type: 'spring', stiffness: 220, damping: 22 }); animate([...document.querySelectorAll('#panel, #time, #legend')], { opacity: [0, 1], y: [16, 0] }, { delay: stagger(.12, { startDelay: .2 }), type: 'spring', stiffness: 220, damping: 22 }); }, 2.8)
    .add(() => labelEls.forEach(({ el }, k) => gsap.to(el, { opacity: 1, duration: .6, delay: k * .06 })), 3.8);
  tod.v = .1; setSun(tod.v); }
crearVentanas({ $, MOVIL });
crearAutodestruccion({ scene, U, terrH, camera, controls, REDUCED, $ });   // broma oculta del pitch: mantener presionado el título
for (const b of document.querySelectorAll('button')) { const sp = { type: 'spring', stiffness: 500, damping: 20 }; b.addEventListener('pointerenter', () => animate(b, { scale: 1.05 }, sp)); b.addEventListener('pointerleave', () => animate(b, { scale: 1 }, sp)); }

let last = performance.now(); const fpsEl = $('#fps');
renderer.setAnimationLoop(now => {
  const dt = Math.min(.1, (now - last) / 1000); last = now; fpsAcc += dt; fpsN++; if (fpsAcc > .5) { const fps = fpsN / fpsAcc; fpsEl.textContent = `${Math.round(fps)} fps`; fpsAcc = fpsN = 0;
    if (qAuto && !tour.on) { lowSecs = fps < 40 ? lowSecs + .5 : Math.max(0, lowSecs - .5); if (lowSecs >= 2 && qLevel > 0) { qLevel--; lowSecs = 0; applyQ(); } } }
  if (tour.on) tourFrame(); else controls.update();
  simulador.frame(dt, proyectar);
  renderer.render(scene, camera); updateLabels();
});
