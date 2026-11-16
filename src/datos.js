// Acceso a los datos oficiales preparados en la Fase 0 (public/data/).
// Todo sale de NASA/USGS; ver public/data/fuentes.json para la ficha de cada capa.

const BASE = `${import.meta.env.BASE_URL}data/`;
const R_MARS = 3396190;                         // radio IAU Mars 2000 (m)
const LAT_TS = 18.4663 * Math.PI / 180;         // paralelo estándar de la Jezero_Crater_Projection
const rad = d => d * Math.PI / 180;

export const fetchJSON = async ruta => { const r = await fetch(BASE + ruta); if (!r.ok) throw new Error(`${ruta}: ${r.status}`); return r.json(); };
export const cargarFuentes = () => fetchJSON('fuentes.json');
export const cargarValidacion = () => fetchJSON('validacion.json');
export const cargarCapa = id => fetchJSON(`capas/${id}.geojson`);

/** lon/lat (grados, este positivo) → metros en la proyección del relieve (igual que easting/northing del rover). */
export const lonLatAMetros = (lon, lat) => [R_MARS * rad(lon) * Math.cos(LAT_TS), R_MARS * rad(lat)];

/** Distancia real en Marte (m) entre dos puntos lon/lat — fórmula del haversine con radio de Marte. */
export function distanciaMarte([lon1, lat1], [lon2, lat2]) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MARS * Math.asin(Math.sqrt(a));
}

/**
 * Carga el relieve real. calidad: 'baja' (≈99 m/px) | 'alta' (≈50 m/px).
 * Devuelve alturas en metros (Float32Array, fila 0 = norte, NaN = sin dato) y helpers de georreferencia.
 */
export async function cargarRelieve(calidad = 'alta') {
  const meta = await fetchJSON('relieve/jezero_relieve.json');
  const v = meta.versiones[calidad === 'baja' ? 0 : meta.versiones.length - 1];
  const buf = await (await fetch(BASE + v.archivo)).arrayBuffer();
  const q = new Uint16Array(buf), alturas = new Float32Array(q.length), k = (meta.hmax_m - meta.hmin_m) / 65534;
  for (let i = 0; i < q.length; i++) alturas[i] = q[i] === 0 ? NaN : meta.hmin_m + (q[i] - 1) * k;
  const L = meta.limites_m, W = v.ancho, H = v.alto;
  const tex = meta.texturas.filter(t => t.ancho <= W * 2).at(-1) ?? meta.texturas[0];

  /** lon/lat → posición en la malla: u,v ∈ [0,1] (v = 0 en el norte) */
  const lonLatAUV = (lon, lat) => { const [x, y] = lonLatAMetros(lon, lat); return [(x - L.oeste) / (L.este - L.oeste), (L.norte - y) / (L.norte - L.sur)]; };
  /** altura real (m) en u,v con interpolación bilineal */
  const alturaEnUV = (u, vv) => {
    const x = Math.min(W - 1.001, Math.max(0, u * W - .5)), y = Math.min(H - 1.001, Math.max(0, vv * H - .5));
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, i = yi * W + xi;
    return alturas[i] * (1 - fx) * (1 - fy) + alturas[i + 1] * fx * (1 - fy) + alturas[i + W] * (1 - fx) * fy + alturas[i + W + 1] * fx * fy;
  };
  /** u,v (v = 0 en el norte) → [lon, lat] en grados */
  const uvALonLat = (u, vv) => [(L.oeste + u * (L.este - L.oeste)) / (R_MARS * Math.cos(LAT_TS)) * 180 / Math.PI,
                                (L.norte - vv * (L.norte - L.sur)) / R_MARS * 180 / Math.PI];
  return { meta, ancho: W, alto: H, alturas, mPorPixel: v.m_por_pixel_x, mPorPixelY: v.m_por_pixel_y, texturaURL: BASE + tex.archivo,
    anchoM: L.este - L.oeste, altoM: L.norte - L.sur, lonLatAUV, uvALonLat, alturaEnUV,
    alturaEnLonLat: (lon, lat) => alturaEnUV(...lonLatAUV(lon, lat)) };
}
