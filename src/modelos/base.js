// Kairos D-02 · módulo de descenso vertical.
// En el simulador representa la base: hábitat + cohete de regreso. ≈10 m de alto, escotilla y escalera hacia +z.
import * as THREE from 'three';
import { fusionar, instancia, mat as M } from './comun.js';

function construir() {
  const canvas = M('canvas', '#ddd3c1', .95), seam = M('canvas_seam', '#b3a892', .95), olive = M('olive', '#6e6f48', .75, .1);
  const orange = M('orange', '#b9562a', .85, 0, { side: THREE.DoubleSide }), metal = M('metal', '#a09c92', .45, .35);
  const dark = M('dark_metal', '#45423c', .6, .3), glass = M('glass', '#1d2226', .15, .2);
  const model = new THREE.Group();
  const add = (geo, mat, parent = model) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };
  const grp = (parent = model) => { const g = new THREE.Group(); parent.add(g); return g; };
  const Y = new THREE.Vector3(0, 1, 0);
  const beam = (a, b, w, d, mat, parent, round = false) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
    const m = add(round ? new THREE.CylinderGeometry(w, w, L, 10) : new THREE.BoxGeometry(w, L, d), mat, parent);
    m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(Y, B.sub(A).normalize()); return m; };
  const ring = (r, tube, y, mat, parent = model) => { const m = add(new THREE.TorusGeometry(r, tube, 8, 48), mat, parent); m.rotation.x = Math.PI / 2; m.position.y = y; return m; };
  const at = (theta, parent = model) => { const g = new THREE.Group(); g.rotation.y = theta; parent.add(g); return g; };
  const R = 3.25, Y0 = 3.2, Y1 = 6.4, YS = 6.7, YT = 9.4, TILT = Math.atan(1.6 / 2.7);
  const coneR = y => 3.1 - (y - YS) * 1.6 / 2.7;

  // Casco
  const P = [[0, 2.7], [2.5, 2.7], [3.0, 2.9], [R, Y0], [R, Y1], [3.2, 6.55], [3.1, YS], [1.5, YT], [1.3, 9.62], [1.0, 9.7], [0, 9.72]].map(p => new THREE.Vector2(p[0], p[1]));
  add(new THREE.LatheGeometry(P, 48), canvas);
  ring(R + .02, .07, Y0 + .05, olive); ring(3.2, .08, 6.55, olive); ring(coneR(7.9) + .02, .06, 7.9, olive); ring(coneR(9.35) + .02, .06, 9.35, olive);
  [4.25, 5.35].forEach(y => ring(R, .018, y, seam));
  for (let i = 0; i < 8; i++) {
    const g = at(i * Math.PI / 4);
    const s = add(new THREE.BoxGeometry(.16, 2.95, .05), olive, g); s.position.set(0, 8.0, coneR(8.0) + .02); s.rotation.x = -TILT;
  }
  [50, 130, 230, 310].forEach(deg => { const w = 30 * Math.PI / 180;
    add(new THREE.CylinderGeometry(R + .03, R + .03, 1.5, 10, 1, true, deg * Math.PI / 180 - w / 2, w), orange).position.y = 5.45; });
  for (let i = 0; i < 4; i++) {
    const w = grp(at(-Math.PI / 8 + i * Math.PI / 2)); w.position.set(0, 8.3, coneR(8.3)); w.rotation.x = -TILT;
    add(new THREE.BoxGeometry(.42, .36, .1), metal, w); add(new THREE.BoxGeometry(.28, .22, .12), glass, w);
  }
  add(new THREE.CylinderGeometry(.95, 1.05, .3, 32), metal).position.y = 9.85;
  add(new THREE.CylinderGeometry(.7, .7, .1, 32), dark).position.y = 10.0;
  add(new THREE.CylinderGeometry(2.3, 2.0, .35, 32), dark).position.y = 2.55;
  // Escotilla, porche y escalera (frente, +z)
  const hatch = grp(); hatch.position.set(0, 4.65, 0);
  const hz = (geo, mat, z) => { const m = add(geo, mat, hatch); m.rotation.x = Math.PI / 2; m.position.z = z; return m; };
  hz(new THREE.CylinderGeometry(1.28, 1.28, .6, 32), canvas, 3.03);
  add(new THREE.TorusGeometry(1.14, .13, 8, 40), metal, hatch).position.z = 3.33;
  hz(new THREE.CylinderGeometry(1.0, 1.0, .16, 32), canvas, 3.36);
  hz(new THREE.CylinderGeometry(.17, .17, .1, 20), glass, 3.45).position.x = .12;
  add(new THREE.BoxGeometry(.07, .5, .1), orange, hatch).position.set(-.6, 0, 3.5);
  add(new THREE.BoxGeometry(2.6, .1, 1.25), olive).position.set(0, 3.33, 3.75);
  [[-1.22, 3.3], [-1.22, 4.3], [1.22, 3.3], [1.22, 4.3]].forEach(p => beam([p[0], 3.38, p[1]], [p[0], 4.4, p[1]], .035, 0, olive, model, true));
  [-1.22, 1.22].forEach(x => beam([x, 4.4, 3.3], [x, 4.4, 4.3], .03, 0, olive, model, true));
  const ladder = grp(); ladder.position.set(0, 0, 5.45); const LL = Math.hypot(1.15, 3.4); ladder.rotation.x = -Math.atan(1.15 / 3.4);
  [-.36, .36].forEach(x => add(new THREE.BoxGeometry(.07, LL, .12), metal, ladder).position.set(x, LL / 2, 0));
  for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(.66, .04, .14), metal, ladder).position.set(0, .3 + i * .38, 0);
  // Equipo lateral
  const cb = at(-.36); add(new THREE.BoxGeometry(.34, .5, .16), canvas, cb).position.set(0, 4.0, R + .05);
  const vg = at(-1.25); add(new THREE.BoxGeometry(.6, 1.0, .1), dark, vg).position.set(0, 4.5, R - .01);
  for (const a of [-.56, -.47]) add(new THREE.CylinderGeometry(.12, .12, 1.5, 12), metal, at(a)).position.set(0, 4.35, R + .16);
  // Motores
  const bell = new THREE.LatheGeometry([[.2, .85], [.26, .6], [.4, .25], [.5, 0], [.46, 0], [.36, .25], [.22, .6], [.16, .85]].map(p => new THREE.Vector2(...p)), 18);
  [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3 + .52) * 1.35, Math.sin(i * Math.PI / 3 + .52) * 1.35])].forEach(([x, z]) => {
    const e = grp(); e.position.set(x, 0, z);
    add(new THREE.CylinderGeometry(.44, .52, .75, 16), canvas, e).position.y = 2.15;
    add(bell, dark, e).position.y = .92;
  });
  // Patas
  for (let i = 0; i < 4; i++) {
    const L = at(Math.PI / 4 + i * Math.PI / 2);
    const hip = [0, 3.55, 3.15], knee = [0, 1.75, 4.25], foot = [0, .5, 4.95];
    add(new THREE.BoxGeometry(.7, .6, .4), olive, L).position.set(0, 3.5, 3.2);
    beam(hip, knee, .46, .34, canvas, L);
    beam([0, 2.95, 3.52], [0, 2.3, 3.92], .47, .35, orange, L);
    const kj = add(new THREE.CylinderGeometry(.24, .24, .6, 14), olive, L); kj.rotation.z = Math.PI / 2; kj.position.set(...knee);
    beam(knee, foot, .11, 0, metal, L, true);
    [-1, 1].forEach(s => beam([s * .25, 1.8, 4.2], [s * 1.25, 2.85, 2.55], .07, 0, olive, L, true));
    add(new THREE.CylinderGeometry(.3, .55, .22, 8), dark, L).position.set(0, .32, 4.95);
    add(new THREE.CylinderGeometry(.68, .72, .22, 8), dark, L).position.set(0, .11, 4.95);
  }
  return fusionar(model);
}

let PARTES = null;
export function base() {
  PARTES ??= construir();
  const g = instancia(PARTES);
  // Llama de los motores: solo se ve en el aterrizaje y el despegue
  const llama = new THREE.Mesh(new THREE.ConeGeometry(1.5, 6, 20, 1, true).translate(0, 3, 0).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: '#ffc27a', transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending }));
  llama.position.y = .9; llama.visible = false; g.add(llama);
  return { grupo: g, llama };
}
