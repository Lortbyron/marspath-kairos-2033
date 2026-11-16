// Fase 2 · Capas de varias misiones dibujadas sobre el relieve real.
// Cada capa sale de public/data/capas (NASA/JPL MMGIS, USGS, IAU) y su ficha técnica de fuentes.json.
// Las capas vectoriales se dibujan en un lienzo alineado con el relieve (mismo norte, mismos límites)
// que el shader del terreno usa como calco: así las líneas siguen la forma del suelo.
import { cargarCapa, fetchJSON } from './datos.js';
import { tx } from './i18n.js';

// Unidades del mapa geológico USGS SIM 3464. Nombre oficial (inglés) → nombre en español.
// La letra inicial del símbolo indica la época: N = Noéico (la más antigua), H = Hespérico, A = Amazónico (la más reciente).
// Los colores son de este mapa (no son los del mapa impreso de USGS); unidades y límites sí son de USGS.
export const UNIDADES = {
  Aeb:   { es: tx('Formas eólicas: dunas y ondas de arena', 'Aeolian bedforms: dunes and ripples'), color: '#e9c46a' },
  Nue:   { es: tx('Unidad erosionada superior', 'Upper etched unit'), color: '#b07aa1' },
  Nle:   { es: tx('Unidad erosionada inferior', 'Lower etched unit'), color: '#7d5ba6' },
  Nnp1:  { es: 'Nili Planum 1', color: '#6b8e4e' },
  Nnp2:  { es: 'Nili Planum 2', color: '#9bb56f' },
  Hnpf:  { es: tx('Abanico de Nili Planum', 'Nili Planum fan'), color: '#c9a24d' },
  Nrb:   { es: tx('Unidad clara y rugosa', 'Light-toned rough unit'), color: '#d8cfc0' },
  cr:    { es: tx('Borde de cráter', 'Crater rim'), color: '#a0522d' },
  ce:    { es: tx('Eyecta de cráter (material lanzado por el impacto)', 'Crater ejecta (material thrown out by the impact)'), color: '#d08a4a' },
  ci:    { es: tx('Interior de cráter', 'Crater interior'), color: '#e0b98a' },
  su:    { es: tx('Unidad lisa (sin dividir)', 'Smooth unit (undivided)'), color: '#9fb6c3' },
  Njf:   { es: tx('Fondo del cráter Jezero', 'Jezero crater floor'), color: '#6f8fae' },
  NHjf1: { es: tx('Abanico (delta) de Jezero 1', 'Jezero fan (delta) 1'), color: '#4f8fcf' },
  NHjf2: { es: tx('Abanico (delta) de Jezero 2', 'Jezero fan (delta) 2'), color: '#2c5f9e' },
};
export const EPOCA = s => s.startsWith('NH') ? tx('Noéico–Hespérico', 'Noachian–Hesperian') : s[0] === 'N' ? tx('Noéico (la más antigua)', 'Noachian (the oldest)') : s[0] === 'H' ? tx('Hespérico', 'Hesperian') : s[0] === 'A' ? tx('Amazónico (la más reciente)', 'Amazonian (the most recent)') : tx('Unidad de cráter', 'Crater unit');
const TIPO_MUESTRA = { 'Rock Core': tx('Núcleo de roca', 'Rock core'), Regolith: tx('Regolito (suelo suelto)', 'Regolith (loose soil)'), Atmospheric: tx('Atmósfera', 'Atmosphere') };

// Capas que se pueden activar. id = id en fuentes.json
export const CAPAS = [
  { id: 'rover_traza', nombre: tx('Recorrido de Perseverance', 'Perseverance traverse'), on: false, color: '#3fb0e8' },
  { id: 'muestras_roca', nombre: tx('Sitios de muestras', 'Sample sites'), on: false, color: '#f2c14e' },
  { id: 'deposito_three_forks', nombre: tx('Depósito Three Forks', 'Three Forks depot'), on: false, color: '#ff6b8b' },
  { id: 'elipse_aterrizaje', nombre: tx('Elipse de aterrizaje', 'Landing ellipse'), on: false, color: '#ff9ad5' },
  { id: 'heli_vuelos', nombre: tx('Vuelos de Ingenuity', 'Ingenuity flights'), on: false, color: '#ffd23f', extra: ['heli_aerodromos', 'heli_zona_prueba'] },
  { id: 'geologia_unidades', nombre: tx('Mapa geológico (USGS)', 'Geologic map (USGS)'), on: false, color: '#7d5ba6' },
  // Fase 3 · riesgos (derivados del relieve JPL CTX DEM 20 m; ver scripts/fase3_pendientes.py)
  { id: 'pendiente_clases', nombre: tx('Pendientes de riesgo', 'Risky slopes'), on: false, color: '#ff8020', grupo: 'riesgos' },
  { id: 'ruta_segura', nombre: tx('Ruta más segura', 'Safest route'), on: false, color: '#4fe0a0', grupo: 'riesgos' },
];
// Clases de pendiente (límites NASA: 20° a pie y en rover presurizado, 25° rover abierto tipo Apollo)
export const CLASES_PEND = [
  { desde: 25, color: '#dc1e28', corto: tx('más de 25°', 'over 25°'), veredicto: tx('Fuera del límite de cualquier vehículo con personas', 'Beyond the limit of any crewed vehicle') },
  { desde: 20, color: '#ff8020', corto: '20–25°', veredicto: tx('Fuera del límite NASA para caminar (20°)', 'Beyond the NASA walking limit (20°)') },
  { desde: 15, color: '#ffd640', corto: '15–20°', veredicto: tx('Difícil: cerca del límite NASA', 'Hard: close to the NASA limit') },
  { desde: 0, color: '#4fe0a0', corto: '0–15°', veredicto: tx('Transitable a pie y en rover', 'Passable on foot and by rover') },
];
export const clasePend = g => CLASES_PEND.find(c => g >= c.desde);

export async function cargarCapas(R, movil) {
  const ids = [...new Set(CAPAS.filter(c => !c.grupo).flatMap(c => [c.id, ...(c.extra ?? [])]).concat(['rover_posicion_actual', 'heli_posicion_final']))];
  const BASE = `${import.meta.env.BASE_URL}data/`;
  const [datosV, riesgos, rutaSegura, rutaHirise, calcoPend, pendMax] = await Promise.all([
    Promise.all(ids.map(async id => [id, await cargarCapa(id)])), fetchJSON('riesgos/pendientes.json'), fetchJSON('riesgos/ruta_segura.geojson'), fetchJSON('riesgos/ruta_segura_hirise.geojson'),
    new Promise((ok, mal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => mal(new Error('calco de pendientes')); im.src = BASE + 'riesgos/pendiente_clases_2228x2534.png'; }),
    fetch(BASE + 'riesgos/pendiente_max_1801x2048.u8').then(r => r.arrayBuffer()).then(b => new Uint8Array(b))]);
  const datos = Object.fromEntries(datosV); datos.ruta_ctx = rutaSegura; datos.ruta_segura = rutaHirise;
  const OH = movil ? 2048 : 3072, OW = Math.round(OH * R.ancho / R.alto), k = OH / 2048;
  const lienzo = document.createElement('canvas'); lienzo.width = OW; lienzo.height = OH;
  const ctx = lienzo.getContext('2d');
  const P = (lon, lat) => { const [u, v] = R.lonLatAUV(lon, lat); return [u * OW, v * OH]; };

  const trazar = (coords, cerrar) => { ctx.beginPath(); coords.forEach(([lon, lat], i) => { const [x, y] = P(lon, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (cerrar) ctx.closePath(); };
  const lineas = g => g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  const poligonos = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const anilloDep = datos.deposito_three_forks.features[0].geometry.coordinates[0].slice(0, -1);
  const depositoCentro = [anilloDep.reduce((a, p) => a + p[0], 0) / anilloDep.length, anilloDep.reduce((a, p) => a + p[1], 0) / anilloDep.length];
  const puntos = g => g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : [];

  function dibujarLineas(id, color, ancho, guiones) {
    ctx.save(); ctx.lineJoin = ctx.lineCap = 'round'; ctx.setLineDash((guiones ?? []).map(d => d * k));
    for (const f of datos[id].features) for (const l of lineas(f.geometry)) {
      trazar(l); ctx.strokeStyle = 'rgba(20,14,10,.75)'; ctx.lineWidth = (ancho + 2.5) * k; ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = ancho * k; ctx.stroke(); }
    ctx.restore(); }
  function dibujarPuntos(id, color, radio) {
    for (const f of datos[id].features) for (const [lon, lat] of puntos(f.geometry)) {
      const [x, y] = P(lon, lat); ctx.beginPath(); ctx.arc(x, y, radio * k, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 1.6 * k; ctx.strokeStyle = 'rgba(20,14,10,.85)'; ctx.stroke(); } }
  function dibujarPoligonos(id, relleno, borde) {
    for (const f of datos[id].features) for (const pol of poligonos(f.geometry)) {
      ctx.beginPath(); for (const anillo of pol) { anillo.forEach(([lon, lat], i) => { const [x, y] = P(lon, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); }
      ctx.fillStyle = typeof relleno === 'function' ? relleno(f) : relleno; ctx.fill('evenodd');
      if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = .8 * k; ctx.stroke(); } } }

  // Geología: un segundo lienzo guarda el número de unidad en cada píxel para saber "qué roca hay aquí".
  const codigos = Object.keys(UNIDADES), idGeo = document.createElement('canvas'); idGeo.width = OW; idGeo.height = OH;
  { const g = idGeo.getContext('2d');
    for (const f of datos.geologia_unidades.features) { const i = codigos.indexOf(f.properties.symbol?.trim() ?? f.properties.unit); if (i < 0) continue;
      for (const pol of poligonos(f.geometry)) { g.beginPath(); for (const anillo of pol) { anillo.forEach(([lon, lat], j) => { const [x, y] = P(lon, lat); j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); }
        g.fillStyle = `rgb(${(i + 1) * 10},0,0)`; g.fill('evenodd'); } } }
  const idPix = idGeo.getContext('2d').getImageData(0, 0, OW, OH).data;
  const unidadEn = (u, v) => { const x = Math.min(OW - 1, Math.max(0, u * OW | 0)), y = Math.min(OH - 1, Math.max(0, v * OH | 0)); const n = Math.round(idPix[(y * OW + x) * 4] / 10) - 1; return n >= 0 ? codigos[n] : null; };

  function redibujar(activas) {
    ctx.clearRect(0, 0, OW, OH);
    if (activas.pendiente_clases) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(calcoPend, 0, 0, OW, OH); ctx.restore(); }
    if (activas.geologia_unidades) dibujarPoligonos('geologia_unidades', f => (UNIDADES[f.properties.symbol?.trim()]?.color ?? '#888') + '80', 'rgba(30,22,16,.35)');
    if (activas.elipse_aterrizaje) dibujarLineas('elipse_aterrizaje', '#ff9ad5', 3, [10, 7]);
    if (activas.heli_vuelos) { dibujarLineas('heli_zona_prueba', '#ffd23f', 1.6, [5, 4]); dibujarLineas('heli_vuelos', '#ffd23f', 2.2); dibujarPuntos('heli_aerodromos', '#ffd23f', 2.4); }
    if (activas.rover_traza) dibujarLineas('rover_traza', '#3fb0e8', 3.4);
    if (activas.ruta_segura) { dibujarLineas('ruta_ctx', 'rgba(246,239,223,.9)', 1.4, [4, 4]); dibujarLineas('ruta_segura', '#4fe0a0', 4.2); }
    if (activas.muestras_roca) dibujarPuntos('muestras_roca', '#f2c14e', 4.2);
    if (activas.deposito_three_forks) {
      // La zona real mide solo ~66 × 68 m (≈2 píxeles del calco): se dibuja el polígono real y, encima, un símbolo de tamaño fijo.
      const [x, y] = P(...depositoCentro);
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, 13 * k, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,107,139,.28)'; ctx.fill();
      ctx.lineWidth = 5.5 * k; ctx.strokeStyle = 'rgba(42,13,20,.85)'; ctx.stroke(); ctx.lineWidth = 3 * k; ctx.strokeStyle = '#ff6b8b'; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3.2 * k, 0, Math.PI * 2); ctx.fillStyle = '#ff6b8b'; ctx.fill(); ctx.restore();
      dibujarPoligonos('deposito_three_forks', 'rgba(255,107,139,.95)', '#2a0d14'); }
  }

  // Lo más cercano al cursor (para la ficha emergente): sitio de muestra a menos de 400 m
  const R_M = 3396190, rad = d => d * Math.PI / 180;
  const dist = (a, b) => { const dLa = rad(b[1] - a[1]), dLo = rad(b[0] - a[0]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLo / 2) ** 2; return 2 * R_M * Math.asin(Math.sqrt(h)); };
  function muestraCerca(lonlat, max = 400) { let best = null, bd = max;
    for (const f of datos.muestras_roca.features) { const d = dist(lonlat, f.geometry.coordinates); if (d < bd) { bd = d; best = f.properties; } }
    return best && { nombre: best.sample_name.replace(/_/g, ' '), tipo: TIPO_MUESTRA[best.sample_type] ?? best.sample_type, roca: best.rock_type, sol: best.sol, lugar: best.sample_location, m: Math.round(bd) }; }

  const rover = datos.rover_posicion_actual.features[0].properties, heli = datos.heli_posicion_final.features[0].properties;
  // Pendiente más fuerte (celdas de 20 m) dentro del píxel bajo el cursor: rejilla 1801×2048, fila 0 = norte
  const PW = 1801, PH = 2048;
  const pendienteEn = (u, v) => { const x = Math.min(PW - 1, Math.max(0, u * PW | 0)), y = Math.min(PH - 1, Math.max(0, v * PH | 0)), b = pendMax[y * PW + x]; return b ? (b - 1) / 4 : null; };
  return { lienzo, redibujar, unidadEn, muestraCerca, pendienteEn, riesgos,
    vehiculos: [{ lon: rover.lon, lat: rover.lat, html: `<i></i><span>Perseverance · ${tx('hoy', 'today')} (sol ${rover.sol})</span>`, capa: 'rover_traza' },
                { lon: heli.Lon, lat: heli.Lat, html: `<i></i><span>Ingenuity · ${tx('último vuelo', 'last flight')} (sol ${heli.Sol})</span>`, capa: 'heli_vuelos' }],
    datos };
}

// Imagen de MOLA (Mars Global Surveyor, 463 m) desde NASA Mars Trek: 4 teselas del nivel 7, recortadas a la zona del relieve.
// Se deja con píxeles visibles a propósito: así se ve la diferencia de resolución frente a CTX (5 m).
export async function cargarMOLA(R) {
  const Z = 7, G = 180 / 2 ** Z, T = 256, base = 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm';
  const { oeste: lon0, este: lon1, sur: lat0, norte: lat1 } = R.meta.limites_lonlat;
  const c0 = Math.floor((lon0 + 180) / G), c1 = Math.floor((lon1 + 180) / G), r0 = Math.floor((90 - lat1) / G), r1 = Math.floor((90 - lat0) / G);
  const mosaico = document.createElement('canvas'); mosaico.width = (c1 - c0 + 1) * T; mosaico.height = (r1 - r0 + 1) * T;
  const mctx = mosaico.getContext('2d'), carga = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) carga.push(new Promise((ok, mal) => { const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { mctx.drawImage(im, (c - c0) * T, (r - r0) * T); ok(); }; im.onerror = () => mal(new Error(`MOLA ${Z}/${r}/${c}`)); im.src = `${base}/${Z}/${r}/${c}.jpg`; }));
  await Promise.all(carga);
  const px = d => d / G * T, sx = px(lon0 + 180) - c0 * T, sy = px(90 - lat1) - r0 * T, sw = px(lon1 - lon0), sh = px(lat1 - lat0);
  const out = document.createElement('canvas'); out.width = Math.round(sw); out.height = Math.round(sh);
  const o = out.getContext('2d'); o.imageSmoothingEnabled = false; o.drawImage(mosaico, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return { lienzo: out, mPorPixel: R.anchoM / out.width };
}
