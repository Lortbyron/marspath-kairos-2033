// Autodestrucción (broma para el cierre del pitch). NO es una simulación científica.
// Se activa manteniendo presionado el título 3 segundos. Es independiente del simulador:
// no cambia su estado, ni la cámara, ni el sol; solo anima la exageración vertical (y la devuelve),
// agrega chispas a la escena (y las quita) y pone capas HTML encima. "Reiniciar misión" deja todo como estaba.
import * as THREE from 'three';
import gsap from 'gsap';
import { ico } from './iconos.js';
import { tx } from './i18n.js';

const MANTENER_MS = 3000, CUENTA = 5;

export function crearAutodestruccion({ scene, U, terrH, camera, controls, REDUCED, $ }) {
  // La explosión sale de donde mira la cámara (solo se lee su posición, no se mueve) y se escala con la distancia
  let centro = [0, 0], escala = 1;
  const medir = () => { centro = [controls.target.x, controls.target.z]; escala = camera.position.distanceTo(controls.target) / 6; };
  const titulo = $('#title');
  let activa = false, timer = null, inicio = null, vuelta = 0;   // vuelta: evita que un temporizador viejo actúe tras reiniciar

  // ── Activación oculta: mantener presionado el título (no sus botones) ──
  const cancelar = () => { clearTimeout(timer); timer = null; inicio = null; titulo.classList.remove('cargando-boom'); };
  titulo.addEventListener('pointerdown', e => {
    if (activa || e.button > 0 || e.target.closest('button, a, input') || titulo.classList.contains('minimizada')) return;
    inicio = [e.clientX, e.clientY]; titulo.classList.add('cargando-boom');
    timer = setTimeout(() => { cancelar(); disparar(); }, MANTENER_MS);
  });
  titulo.addEventListener('pointermove', e => { if (inicio && Math.hypot(e.clientX - inicio[0], e.clientY - inicio[1]) > 12) cancelar(); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) titulo.addEventListener(ev, cancelar);
  titulo.addEventListener('contextmenu', e => { if (timer) e.preventDefault(); });   // en táctil, que no salga el menú

  // ── Chispas (THREE.Points) ──
  const punto = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#fff'); r.addColorStop(.25, '#ffe2a8'); r.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  function chispas(n, rapidez, tamano, vida) {
    rapidez *= escala; tamano *= escala;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    const paleta = ['#ffffff', '#ffe08a', '#ffb347', '#ff7a1a', '#e2401c'].map(c => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      const foco = Math.floor(Math.random() * 3), cx = centro[0] + [0, -.35, .4][foco] * escala, cz = centro[1] + [0, .25, .2][foco] * escala;
      pos.set([cx + (Math.random() - .5) * .15 * escala, terrH(cx, cz) + .02, cz + (Math.random() - .5) * .15 * escala], i * 3);
      const a = Math.random() * Math.PI * 2, sube = .25 + Math.random() * .9, v = rapidez * (.35 + Math.random());
      vel.set([Math.cos(a) * v * (1 - sube * .5), sube * v * 1.4, Math.sin(a) * v * (1 - sube * .5)], i * 3);
      const c = paleta[Math.floor(Math.random() ** 1.6 * paleta.length)]; col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: tamano, map: punto, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.renderOrder = 20; pts.frustumCulled = false; scene.add(pts);
    return { pts, vel, vida, t: 0 };
  }
  function anilloPolvo() {
    const [cx, cz] = centro;
    const m = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 128).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffb070', transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.set(cx, terrH(cx, cz) + .05 * escala, cz); m.scale.setScalar(.15 * escala); m.renderOrder = 19; scene.add(m); return m;
  }

  let efectos = [], anillo = null, raf = 0, ultimo = 0;
  function animar(now) {
    const dt = Math.min(.05, (now - ultimo) / 1000 || 0); ultimo = now;
    for (const e of efectos) {
      e.t += dt; const p = e.pts.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) { e.vel[i + 1] -= 2.2 * escala * dt; e.vel[i] *= .995; e.vel[i + 2] *= .995;
        p[i] += e.vel[i] * dt; p[i + 1] += e.vel[i + 1] * dt; p[i + 2] += e.vel[i + 2] * dt;
        const suelo = terrH(p[i], p[i + 2]); if (p[i + 1] < suelo) { p[i + 1] = suelo; e.vel[i + 1] *= -.25; e.vel[i] *= .6; e.vel[i + 2] *= .6; } }
      e.pts.geometry.attributes.position.needsUpdate = true;
      e.pts.material.opacity = Math.max(0, 1 - e.t / e.vida);
    }
    efectos = efectos.filter(e => { if (e.t < e.vida) return true; scene.remove(e.pts); e.pts.geometry.dispose(); e.pts.material.dispose(); return false; });
    if (efectos.length || anillo) raf = requestAnimationFrame(animar); else raf = 0;
  }
  const arrancar = () => { if (!raf) { ultimo = performance.now(); raf = requestAnimationFrame(animar); } };

  // ── Capas HTML ──
  const capa = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; document.body.append(d); return d; };
  let alerta = null, flash = null, final = null, exagGuardada = 1, tl = null;

  function disparar() {
    if (activa) return; activa = true; vuelta++;
    exagGuardada = U.uExag.value;
    alerta = capa('boom-alerta', `<div class="caja">${ico('alerta')}<p>${tx('Autodestrucción activada', 'Self-destruct activated')}</p><b>${CUENTA}</b><small>${tx('Misión KAIROS 2033 · cráter Jezero', 'KAIROS 2033 Mission · Jezero crater')}</small></div>`);
    alerta.setAttribute('role', 'alert');
    const num = alerta.querySelector('b');
    tl = gsap.timeline();
    // 1 · cuenta regresiva: el cráter tiembla cada vez más
    for (let k = CUENTA; k >= 1; k--) tl.call(() => { num.textContent = k; num.classList.remove('late'); void num.offsetWidth; num.classList.add('late'); }, null, CUENTA - k);
    if (!REDUCED) tl.to(U.uExag, { value: exagGuardada + .6, duration: .12, repeat: 39, yoyo: true, ease: 'sine.inOut' }, 0);
    document.body.classList.add('boom-cuenta');
    // 2 · explosión
    tl.call(explotar, null, CUENTA);
  }

  function explotar() {
    document.body.classList.remove('boom-cuenta'); document.body.classList.add('boom');
    alerta?.remove(); alerta = null;
    flash = capa('boom-flash');
    gsap.to(flash, { opacity: 0, duration: REDUCED ? .6 : 1.4, delay: .08, ease: 'power2.out' });
    // el relieve real "revienta": se estira, se desploma y queda temblando
    gsap.killTweensOf(U.uExag);
    if (REDUCED) gsap.to(U.uExag, { value: .4, duration: 1.2 });
    else gsap.timeline().to(U.uExag, { value: 14, duration: .22, ease: 'power4.out' }).to(U.uExag, { value: .25, duration: .9, ease: 'power3.in' })
      .to(U.uExag, { value: 1.2, duration: 2.6, ease: 'elastic.out(1, .25)' });
    medir();
    efectos.push(chispas(REDUCED ? 600 : 5000, 2.2, .22, 4.5));
    // bola de fuego en el centro: crece rápido y se apaga
    const fuego = new THREE.Sprite(new THREE.SpriteMaterial({ map: punto, color: '#ffd9a0', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    fuego.position.set(centro[0], terrH(centro[0], centro[1]) + .2 * escala, centro[1]); fuego.scale.setScalar(.1 * escala); fuego.renderOrder = 21; scene.add(fuego);
    gsap.to(fuego.scale, { x: 4 * escala, y: 4 * escala, duration: .7, ease: 'power3.out' });
    gsap.to(fuego.material, { opacity: 0, duration: 2.2, delay: .2, ease: 'power2.in', onComplete: () => { scene.remove(fuego); fuego.material.dispose(); } });
    const v = vuelta;
    if (!REDUCED) setTimeout(() => activa && v === vuelta && efectos.push(chispas(2500, 1.1, .14, 5.5)), 350);
    anillo = anilloPolvo();
    gsap.to(anillo.scale, { x: 3 * escala, y: 3 * escala, z: 3 * escala, duration: 3.5, ease: 'power2.out' });
    gsap.to(anillo.material, { opacity: 0, duration: 3.5, ease: 'power1.in', onComplete: () => { if (anillo) { scene.remove(anillo); anillo.geometry.dispose(); anillo.material.dispose(); anillo = null; } } });
    arrancar();
    setTimeout(() => { if (activa && v === vuelta) mostrarFinal(); }, REDUCED ? 1500 : 3600);
  }

  function mostrarFinal() {
    final = capa('boom-final', `<div class="card" role="dialog" aria-modal="true" aria-labelledby="boom-t">
      <p class="k">${ico('alerta')}${tx('Misión KAIROS 2033', 'KAIROS 2033 Mission')}</p>
      <h2 id="boom-t">${tx('Misión fallida', 'Mission failed')}</h2>
      <p class="frase">${tx('Esto pasa cuando una misión se planea con datos inventados.', 'This is what happens when a mission is planned with made-up data.')}</p>
      <p>${tx('Por eso KAIROS 2033 usa solo datos verificados de la NASA, el USGS y la IAU.', 'That is why KAIROS 2033 only uses verified data from NASA, USGS and the IAU.')}</p>
      <p class="galilei">${ico('robot')}<span>${tx('Galilei apretó el botón equivocado.', 'Galilei pressed the wrong button.')}</span></p>
      <span class="est supuesto">${tx('broma · no es una simulación científica', 'joke · not a scientific simulation')}</span>
      <button type="button" class="cta">${ico('cohete')}<span>${tx('Reiniciar misión', 'Restart mission')}</span></button></div>`);
    const b = final.querySelector('button'); b.onclick = reiniciar; b.focus();
  }

  function reiniciar() {
    tl?.kill(); gsap.killTweensOf(U.uExag);
    gsap.to(U.uExag, { value: exagGuardada, duration: REDUCED ? 0 : 1.2, ease: 'power2.inOut' });
    for (const e of efectos) { scene.remove(e.pts); e.pts.geometry.dispose(); e.pts.material.dispose(); } efectos = [];
    if (anillo) { gsap.killTweensOf(anillo.scale); gsap.killTweensOf(anillo.material); scene.remove(anillo); anillo.geometry.dispose(); anillo.material.dispose(); anillo = null; }
    for (const d of [alerta, flash, final]) d?.remove(); alerta = flash = final = null;
    document.body.classList.remove('boom', 'boom-cuenta');
    activa = false;
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && activa && final) reiniciar(); });
}
