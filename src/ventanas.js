// Ventanas minimizables y modo "Solo el mapa".
// Cada ventana tiene un botón – que la reduce a una pastilla con su nombre; al tocarla vuelve a abrirse.
// "Solo el mapa" esconde todas las ventanas (y pide pantalla completa al navegador si se puede).
// El aviso educativo nunca desaparece: si la portada está minimizada o oculta, se muestra en versión corta.
import { ico } from './iconos.js';
import { tx } from './i18n.js';

const VENTANAS = [
  { sel: '#title', nombre: 'KAIROS 2033', icono: 'marte' },
  { sel: '#panel', nombre: tx('Capas del mapa', 'Map layers'), icono: 'cubo' },
  { sel: '#legend', nombre: tx('Altitud', 'Elevation'), icono: 'lugar' },
  { sel: '#time', nombre: tx('Hora solar', 'Solar time'), icono: 'sol' },
  { sel: '#hud', nombre: tx('Panel del simulador', 'Simulator panel'), icono: 'bitacora' },
  { sel: '#sim', nombre: tx('Línea de tiempo', 'Timeline'), icono: 'reloj', compacta: true },   // minimizada deja reproducir y el sol
];
const CLAVE = 'kairos.ventanas';
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) ?? {}; } catch { return {}; } };
const guardar = e => { try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch { /* sin almacenamiento: no pasa nada */ } };

export function crearVentanas({ $, MOVIL }) {
  const estado = leer();
  const aviso = $('#aviso-mini');
  // Visible cuando la portada (que trae el aviso completo) no se ve: minimizada, en "Solo el mapa" o escondida en el celular
  const revisarAviso = () => { const t = $('#title'); aviso.hidden = !(document.body.classList.contains('solo-mapa') || t.classList.contains('minimizada') || getComputedStyle(t).display === 'none'); };
  new MutationObserver(revisarAviso).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  for (const v of VENTANAS) {
    const el = $(v.sel); if (!el) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'vmin';
    const pintar = m => {
      el.classList.toggle('minimizada', m); el.classList.toggle('compacta', m && !!v.compacta);
      b.innerHTML = m && !v.compacta ? `${ico(v.icono)}<span>${v.nombre}</span>` : ico(m ? v.icono : 'menos');
      b.setAttribute('aria-expanded', !m); const verbo = m ? tx('Mostrar', 'Show') : tx('Minimizar', 'Minimize'); b.setAttribute('aria-label', `${verbo}: ${v.nombre}`); b.title = `${verbo} ${v.nombre.toLowerCase()}`;
      revisarAviso();
    };
    b.onclick = () => { const m = !el.classList.contains('minimizada'); estado[v.sel] = m; guardar(estado); pintar(m); };
    (v.sel === '#sim' ? el.querySelector('.fila') : v.sel === '#time' ? el : el).append(b);
    pintar(!!estado[v.sel]);
  }

  // Solo el mapa
  const solo = $('#b-solo');
  const pintarSolo = on => {
    document.body.classList.toggle('solo-mapa', on);
    solo.innerHTML = on ? `${ico('cubo')}<span>${tx('Mostrar paneles', 'Show panels')}</span>` : `${ico('expandir')}<span>${tx('Solo el mapa', 'Map only')}</span>`;
    solo.setAttribute('aria-pressed', on); revisarAviso();
  };
  solo.onclick = async () => {
    const on = !document.body.classList.contains('solo-mapa'); pintarSolo(on);
    try {
      if (on && !MOVIL && document.fullscreenEnabled && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      else if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* el navegador no dejó: igual quedan ocultos los paneles */ }
  };
  // Si sale de pantalla completa con Esc, vuelven los paneles
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('solo-mapa')) pintarSolo(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('solo-mapa') && !document.fullscreenElement) pintarSolo(false); });
  pintarSolo(false);
}
