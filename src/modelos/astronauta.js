// Astronauta KAIROS 01 (diseño de Mateo). 1.88 m de alto, pies en y = 0.
import * as THREE from 'three';
import { fusionar, instancia, mat as M } from './comun.js';

let PARTES = null;

function construir() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const mat = {
    suit: M('suit_fabric', '#d9cdb7', .92), dust: M('suit_dusty', '#c8b99e', .95), pack: M('hard_shell', '#d2c8b5', .6, .05),
    rubber: M('rubber_dark', '#4b4944', .85), web: M('webbing_olive', '#6b7048', .9), accent: M('accent_orange', '#b85a2b', .75),
    metal: M('hardware_grey', '#8a867c', .45, .35), visor: M('visor_gold', '#c08a32', .12, .4), boot: M('boot_mud', '#7a6a55', .95)
  };
  const model = new THREE.Group();
  const add = (geo, m, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], parent = model) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(...p); mesh.rotation.set(...r); mesh.scale.set(...s); parent.add(mesh); return mesh; };
  const UP = V(0, 1, 0);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sph = r => new THREE.SphereGeometry(r, 20, 14);
  const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const limb = (a, b, r1, r2, m) => { const d = b.clone().sub(a), mesh = add(cyl(r2, r1, d.length()), m);
    mesh.position.copy(a).addScaledVector(d, .5); mesh.quaternion.setFromUnitVectors(UP, d.clone().normalize()); return mesh; };
  const ribs = (a, b, r, n, m, tube = .014) => { const d = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d.clone().normalize());
    for (let i = 0; i < n; i++) { const t = add(new THREE.TorusGeometry(r, tube, 6, 20), m); t.position.copy(a).addScaledVector(d, i / (n - 1)); t.quaternion.copy(q); } };
  const tube = (pts, r, m) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V(...p))), 24, r, 6), m);
  const ring = (R, t, m, p, s = [1, 1, 1]) => add(new THREE.TorusGeometry(R, t, 8, 28), m, p, [Math.PI / 2, 0, 0], s);

  // Torso
  const prof = [[0, .90], [.15, .91], [.185, .97], [.19, 1.08], [.195, 1.2], [.22, 1.34], [.215, 1.43], [.16, 1.49], [.11, 1.51], [0, 1.51]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(prof, 28), mat.suit, [0, 0, 0], [0, 0, 0], [1, 1, .74]);
  ring(.196, .022, mat.web, [0, 1.02, 0], [1, .74, 1.7]);
  add(box(.21, .14, .06), mat.pack, [0, 1.33, .165], [-.08, 0, 0]);
  add(box(.09, .035, .01), mat.accent, [0, 1.35, .198], [-.08, 0, 0]);
  add(box(.09, .09, .045), mat.dust, [0, 1.19, .155]);
  for (const s of [-1, 1]) {
    tube([[s * .09, 1.03, .148], [s * .115, 1.2, .158], [s * .125, 1.38, .165], [s * .13, 1.49, .09], [s * .13, 1.5, -.04], [s * .125, 1.4, -.14]], .017, mat.web);
    tube([[s * .09, 1.0, .15], [s * .17, .9, .12], [s * .215, .82, .02], [s * .17, .86, -.11], [s * .08, .98, -.14]], .013, mat.web);
  }
  add(box(.26, .03, .02), mat.web, [0, 1.245, .168]);
  // Mochila de soporte vital
  add(box(.36, .48, .17), mat.pack, [0, 1.25, -.225]);
  add(box(.3, .2, .02), mat.dust, [0, 1.33, -.318]);
  add(box(.2, .11, .02), mat.rubber, [0, 1.1, -.312]);
  for (const s of [-1, 1]) {
    add(cyl(.035, .035, .34), mat.dust, [s * .205, 1.25, -.22]);
    add(cyl(.038, .038, .03), mat.metal, [s * .205, 1.43, -.22]);
    add(box(.03, .44, .02), mat.web, [s * .13, 1.25, -.318]);
  }
  tube([[-.15, 1.06, -.27], [-.215, 1.03, -.2], [-.235, 1.04, -.02], [-.19, 1.08, .12], [-.1, 1.1, .165]], .022, mat.rubber);
  // Cuello y casco
  add(cyl(.125, .15, .05), mat.rubber, [0, 1.5, 0]);
  ring(.15, .022, mat.metal, [0, 1.525, 0]);
  const HY = 1.69, HR = .175, open = 1.05;
  const shellM = mat.pack.clone(); shellM.name = 'helmet_shell'; shellM.side = THREE.DoubleSide;
  add(new THREE.SphereGeometry(HR, 28, 18, Math.PI / 2 + open, Math.PI * 2 - open * 2), shellM, [0, HY, 0]);
  add(new THREE.SphereGeometry(HR, 28, 8, 0, Math.PI * 2, 0, .78), shellM, [0, HY, 0]);
  add(new THREE.SphereGeometry(HR, 28, 8, 0, Math.PI * 2, 2.25, Math.PI - 2.25), shellM, [0, HY, 0]);
  add(new THREE.SphereGeometry(HR - .008, 28, 18), mat.visor, [0, HY, 0]);
  add(new THREE.TorusGeometry(HR + .004, .014, 6, 24, Math.PI * .72), mat.dust, [0, HY, 0], [0, Math.PI / 2, 0], [1, 1, 2.2]);
  for (const s of [-1, 1]) add(cyl(.055, .06, .035), mat.metal, [s * .172, HY - .01, -.01], [0, 0, Math.PI / 2]);
  // Brazos
  for (const s of [-1, 1]) {
    const el = V(s * .355, 1.12, -.01), wr = V(s * .4, .85, .07);
    add(sph(.105), mat.suit, [s * .255, 1.41, 0], [0, 0, 0], [1, 1, .95]);
    add(box(.085, .012, .11), mat.accent, [s * .305, 1.475, 0], [0, 0, -s * .75]);
    ribs(V(s * .275, 1.35, 0), V(s * .3, 1.28, -.003), .088, 3, mat.rubber, .013);
    limb(V(s * .3, 1.28, -.003), V(s * .34, 1.17, -.008), .088, .08, mat.suit);
    ribs(V(s * .343, 1.16, -.009), V(s * .365, 1.07, 0), .078, 3, mat.rubber);
    add(sph(.072), mat.rubber, el.toArray());
    limb(V(s * .365, 1.065, .003), wr, .082, .065, mat.suit);
    const g = new THREE.Group(); g.position.copy(wr); g.quaternion.setFromUnitVectors(V(0, -1, 0), wr.clone().sub(el).normalize()); model.add(g);
    add(cyl(.05, .056, .05), mat.rubber, [0, -.03, 0], [0, 0, 0], [1, 1, 1], g);
    add(sph(.05), mat.rubber, [0, -.1, 0], [0, 0, 0], [.62, 1.3, .95], g);
  }
  // Piernas
  for (const s of [-1, 1]) {
    const hip = V(s * .1, .93, 0), knee = V(s * .125, .52, .012), ank = V(s * .135, .2, 0);
    add(sph(.115), mat.suit, hip.toArray(), [0, 0, 0], [1, 1.1, 1.05]);
    limb(hip, knee, .115, .092, mat.suit);
    add(sph(.094), mat.suit, knee.toArray());
    limb(knee, ank, .092, .082, mat.suit);
    limb(V(s * .131, .33, .004), V(s * .135, .2, 0), .09, .088, mat.dust);
    add(sph(.075), mat.rubber, [s * .125, .52, .06], [0, 0, 0], [1, 1.15, .72]);
    add(box(.045, .15, .13), mat.dust, [s * .215, .74, .01], [0, 0, s * .06]);
    ring(.088, .012, mat.web, [s * .135, .215, 0], [1, 1, 2.2]);
    add(cyl(.08, .075, .15), mat.boot, [s * .135, .125, -.005]);
    add(sph(.07), mat.boot, [s * .135, .075, .07], [0, 0, 0], [.92, .82, 1.75]);
    add(box(.135, .04, .33), mat.rubber, [s * .135, .02, .045]);
  }
  add(sph(.15), mat.suit, [0, .93, 0], [0, 0, 0], [1.25, .75, .9]);
  return fusionar(model);
}

// color = color del parche del equipo (base o campo), igual que en el mapa
const parches = new Map();
export function astronauta(color = '#b85a2b') {
  PARTES ??= construir();
  if (!parches.has(color)) parches.set(color, M('accent_orange', color, .75));
  return instancia(PARTES, { accent_orange: parches.get(color) });
}
