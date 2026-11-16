// Idioma de la página: español o inglés (requisito ES + EN de NASA Space Apps).
// Orden: ?lang=es|en en la URL → elección guardada → idioma del navegador (español si empieza por "es"; si no, inglés).
// Los datos (JSON de public/data) se escriben en español y se traducen con el diccionario de i18n_datos.js;
// si una frase no está en el diccionario se muestra en español (nunca se inventa un dato).
import EN_DATOS from './i18n_datos.js';

const CLAVE = 'kairos.idioma';
const valido = v => (v === 'es' || v === 'en') ? v : null;
const deUrl = valido(new URLSearchParams(location.search).get('lang')) ?? valido(location.hash.slice(1));
const guardado = (() => { try { return valido(localStorage.getItem(CLAVE)); } catch { return null; } })();
const delNavegador = (navigator.languages?.[0] ?? navigator.language ?? 'es').toLowerCase().startsWith('es') ? 'es' : 'en';

export const LANG = deUrl ?? guardado ?? delNavegador;
export const EN = LANG === 'en';
export const LOC = EN ? 'en-US' : 'es';
/** Texto de la interfaz: tx('Hola', 'Hello') */
export const tx = (es, en) => EN ? en : es;
/** Texto que viene de los datos (español): lo traduce si está en el diccionario */
export const td = s => (EN && s != null && EN_DATOS[s]) || s;
/** Número con el separador decimal del idioma (3,5 en español · 3.5 en inglés) */
export const dec = v => EN ? String(v) : String(v).replace('.', ',');
/** Número entero con separador de miles del idioma */
export const nf = n => Number(n).toLocaleString(LOC);

// Textos fijos del HTML: cada elemento lleva su versión en inglés en data-en (innerHTML), data-en-aria y data-en-title
export function traducirHTML() {
  document.documentElement.lang = LANG;
  if (!EN) return;
  document.title = 'KAIROS 2033 · Jezero';
  for (const el of document.querySelectorAll('[data-en]')) el.innerHTML = el.dataset.en;
  for (const el of document.querySelectorAll('[data-en-aria]')) el.setAttribute('aria-label', el.dataset.enAria);
  for (const el of document.querySelectorAll('[data-en-title]')) el.title = el.dataset.enTitle;
}

// Switch ES | EN: guarda la elección y recarga la página en el otro idioma
export function crearSwitch(contenedor) {
  contenedor.innerHTML = ['es', 'en'].map(l => `<button type="button" lang="${l}" aria-pressed="${l === LANG}" aria-label="${l === 'es' ? 'Español' : 'English'}">${l.toUpperCase()}</button>`).join('');
  contenedor.setAttribute('role', 'group'); contenedor.setAttribute('aria-label', tx('Idioma', 'Language'));
  for (const b of contenedor.querySelectorAll('button')) b.onclick = () => {
    const l = b.getAttribute('lang'); if (l === LANG) return;
    try { localStorage.setItem(CLAVE, l); } catch { /* sin almacenamiento: queda en la URL */ }
    const u = new URL(location.href); u.searchParams.set('lang', l); u.hash = ''; location.href = u.toString();
  };
}
