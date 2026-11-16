// Iconos SVG del simulador KAIROS 2033: trazo de 24 px, color = currentColor (siguen el tema de la página).
const P = {
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pausa: '<rect x="7" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" stroke="none"/>',
  rapido: '<path d="M4 6.5l7.5 5.5L4 17.5zM12.5 6.5L20 12l-7.5 5.5z"/>',
  seguir: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  salir: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  cohete: '<path d="M12 2.8c3 2.4 4.2 5.8 4.2 9v4.4H7.8v-4.4c0-3.2 1.2-6.6 4.2-9z"/><circle cx="12" cy="9.3" r="1.6"/><path d="M7.8 12.6L5 15.4v3.4l2.8-1.4M16.2 12.6l2.8 2.8v3.4l-2.8-1.4M10 19.4l2 2 2-2"/>',
  aterrizaje: '<path d="M12 2.5v5.5M9.6 5.8L12 8.2l2.4-2.4"/><path d="M7.5 17.5v-3.2a4.5 4.5 0 0 1 9 0v3.2z"/><path d="M8 17.5l-2.2 3M16 17.5l2.2 3M3.5 21h17"/>',
  despegue: '<path d="M7.5 15v-3.2a4.5 4.5 0 0 1 9 0V15z"/><path d="M8 15l-2.2 3M16 15l2.2 3M12 2.5V8M9.6 4.9L12 2.5l2.4 2.4M3.5 21h17"/>',
  tierra: '<circle cx="12" cy="12" r="8.5"/><path d="M5.5 8.5c2 0 3.2 1 3.2 3s2 2.2 2 4.2M14.5 3.8c0 2 1 3.2 3.2 3.2M14 20.3c0-2 1-3 3-3"/>',
  marte: '<circle cx="12" cy="12" r="8.5"/><circle cx="15" cy="9" r="1.4"/><path d="M6.5 10h3M8.5 15.5h2.5M14 15.2h3"/>',
  lugar: '<path d="M12 21s-6.2-5.6-6.2-11a6.2 6.2 0 0 1 12.4 0c0 5.4-6.2 11-6.2 11z"/><circle cx="12" cy="10" r="2.3"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  polvo: '<path d="M3 8.5h10.5a2.8 2.8 0 1 0-2.8-2.8M3 12.5h14.5a2.8 2.8 0 1 1-2.8 2.8M3 16.5h6.5"/>',
  radiacion: '<circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M12 12L8.2 5.4a7.6 7.6 0 0 1 7.6 0z" fill="currentColor" fill-opacity=".25"/><path d="M12 12h7.6a7.6 7.6 0 0 1-3.8 6.6z" fill="currentColor" fill-opacity=".25"/><path d="M12 12l-3.8 6.6A7.6 7.6 0 0 1 4.4 12z" fill="currentColor" fill-opacity=".25"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
  casco: '<path d="M5 13.5a7 7 0 0 1 14 0V17a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M8.3 13a3.7 3 0 0 1 7.4 0v1.6H8.3z" fill="currentColor" fill-opacity=".3"/>',
  base: '<path d="M7 15.5V9.8a5 5 0 0 1 10 0v5.7z"/><circle cx="12" cy="10.3" r="1.5"/><path d="M8 15.5l-2.5 4M16 15.5l2.5 4M4 19.5h4M16 19.5h4"/>',
  robot: '<rect x="6.5" y="6" width="11" height="8" rx="1.6"/><path d="M9 9.3h6"/><circle cx="9.6" cy="9.3" r=".9" fill="currentColor"/><path d="M8.5 14l-.8 6.5M15.5 14l.8 6.5M6.5 8.5l-2.5 3.5M17.5 8.5l2.5 3.5"/>',
  rover: '<rect x="2.8" y="7.5" width="14.5" height="7" rx="2.2"/><path d="M17.3 9.5h2.2l1.7 3v2h-3.9M6 10.5h4.5"/><circle cx="6.8" cy="16.8" r="2"/><circle cx="14.6" cy="16.8" r="2"/>',
  lab: '<path d="M9.5 3h5M10.5 3v6.2l-5 8.6a2.2 2.2 0 0 0 1.9 3.2h9.2a2.2 2.2 0 0 0 1.9-3.2l-5-8.6V3"/><path d="M7.3 15h9.4"/>',
  roca: '<path d="M4 18l2.5-7 4-3.5 5 1.5 3.5 5.5-1.5 3.5z"/><path d="M10.5 7.5l1 5 6.5 1.5M11.5 12.5L6.5 11"/>',
  cubo: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>',
  bitacora: '<path d="M6 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6z"/><path d="M6 3.5v17M9.5 8h5M9.5 11.5h5M9.5 15h3"/>',
  expandir: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  menos: '<path d="M6 12h12"/>',
  alerta: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.5M12 17v.1"/>',
};
export const ico = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] ?? ''}</svg>`;

// Icono según el evento de la bitácora (por su título; el dato y su etiqueta no cambian)
export function icoEvento(titulo) {
  const t = titulo.toLowerCase();
  if (t.startsWith('lanzamiento')) return 'cohete';
  if (t.startsWith('aterrizaje')) return 'aterrizaje';
  if (t.startsWith('despegue')) return 'despegue';
  if (t.includes('tierra') && t.startsWith('regreso a')) return 'tierra';
  if (t.includes('rover')) return 'rover';
  if (t.includes('se queda en la base')) return 'base';
  if (t.includes('polvo')) return 'polvo';
  if (t.includes('radiación')) return 'radiacion';
  return 'info';
}
