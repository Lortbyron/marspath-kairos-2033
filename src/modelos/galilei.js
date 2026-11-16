// Robot Galilei (diseño de Mateo). 1.20 m, bípedo.
// Hipotético: no tiene velocidad, carga ni autonomía con fuente NASA. Se arma con articulaciones para que pueda caminar.
import * as THREE from 'three';
import { mat } from './comun.js';

export function galilei() {
  const M = {
    alu: mat('aluminum', 0xbdb8ae, .5, .35), aluDark: mat('aluminum_dark', 0x9d978d, .55, .35), rubber: mat('rubber', 0x1b1b1a, .92),
    dark: mat('dark_composite', 0x3b3a37, .65, .2), glass: mat('lens_glass', 0x0a0e13, .12, .3), led: mat('status_led', 0xd9623a, .4)
  };
  M.led.emissive = new THREE.Color(0xd9623a); M.led.emissiveIntensity = .8;
  const robot = new THREE.Group(); robot.name = 'Galilei';
  const add = (parent, geo, m, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r1, r2, d, n = 20) => new THREE.CylinderGeometry(r1, r2, d, n).rotateX(Math.PI / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const J = { hip: {}, shoulder: {}, elbow: {} };

  // Torso con la franja de sensores (cámara, micrófono, parlante)
  const upper = new THREE.Group(); robot.add(upper); J.waist = upper;
  {
    const s = new THREE.Shape();
    [[-.09, .72], [.09, .72], [.09, 1.172], [.066, 1.2], [-.066, 1.2], [-.09, 1.172]].forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
    add(upper, new THREE.ExtrudeGeometry(s, { depth: .30, bevelEnabled: false }).translate(0, 0, -.15).rotateY(Math.PI / 2), M.alu);
    [.865, 1.0].forEach(y => add(upper, box(.3015, .003, .1815), M.aluDark, 0, y, 0));
    const strip = new THREE.Group(); strip.position.set(0, 1.112, .089); upper.add(strip);
    add(strip, box(.18, .046, .008), M.dark);
    add(strip, cyl(.021, .022, .006, 24), M.aluDark, -.07, 0, .007);
    add(strip, cyl(.0165, .018, .014, 24), M.rubber, -.07, 0, .012);
    add(strip, new THREE.SphereGeometry(.0135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, .35), M.glass, -.07, 0, .0175);
    add(strip, cyl(.0028, .0028, .003, 8), M.led, -.11, .014, .009);
    add(strip, cyl(.011, .011, .003, 20), M.aluDark, -.022, 0, .0055);
    add(strip, box(.086, .032, .003), M.aluDark, .048, 0, .0055);
    for (let i = 0; i < 5; i++) add(strip, box(.07 - Math.abs(i - 2) * .008, .0026, .002), M.rubber, .048, (i - 2) * .0056, .0072);
    add(upper, box(.2, .2, .006), M.aluDark, 0, 1.0, -.092);
  }
  // Fuelle de la cintura
  for (let i = 0; i < 6; i++) { const big = i % 2 === 0; add(robot, box(big ? .3 : .282, .0172, big ? .176 : .162), M.rubber, 0, .6285 + i * .0167, 0); }
  // Piernas (giran en la cadera)
  const TOP = .62, BOT = .024;
  for (const s of [1, -1]) {
    const hip = new THREE.Group(); hip.position.y = .62; robot.add(hip); J.hip[s] = hip;
    const leg = new THREE.Group(); leg.position.y = -.62; hip.add(leg);
    const xi = [.008, .042], xo = [.146, .226];
    const sh = new THREE.Shape();
    [[xi[0], TOP], [xo[0], TOP], [xo[1], BOT], [xi[1], BOT]].forEach(([x, y], i) => i ? sh.lineTo(x * s, y) : sh.moveTo(x * s, y));
    add(leg, new THREE.ExtrudeGeometry(sh, { depth: .16, bevelEnabled: false }).translate(0, 0, -.08), M.alu);
    for (const z of [.0805, -.0805]) for (const f of [.25, .5, .75]) {
      const xt = lerp(xi[0], xo[0], f), xb = lerp(xi[1], xo[1], f), len = Math.hypot(xb - xt, TOP - BOT);
      add(leg, box(.0025, len - .01, .002), M.aluDark, s * (xt + xb) / 2, (TOP + BOT) / 2, z).rotation.z = s * Math.atan2(xb - xt, TOP - BOT);
    }
    const t = (TOP - .33) / (TOP - BOT), a = lerp(xi[0], xi[1], t), b = lerp(xo[0], xo[1], t);
    add(leg, box(b - a + .002, .004, .1625), M.aluDark, s * (a + b) / 2, .33, 0);
    add(leg, box(.142, .012, .166), M.rubber, s * .077, .617, 0);
    add(leg, box(.196, .026, .178), M.rubber, s * .135, .013, 0);
  }
  // Hombros, brazos y pinzas
  for (const s of [1, -1]) {
    for (let i = 0; i < 5; i++) { const r = i % 2 === 0 ? .052 : .044; add(upper, new THREE.CylinderGeometry(r, r, .0092, 24).rotateZ(Math.PI / 2), M.rubber, s * (.1545 + i * .009), 1.1, 0); }
    add(upper, box(.085, .1, .118), M.dark, s * .2375, 1.105, 0);
    add(upper, new THREE.CylinderGeometry(.04, .04, .008, 24).rotateZ(Math.PI / 2), M.aluDark, s * .283, 1.105, 0);
    const arm = new THREE.Group(); arm.position.set(s * .238, 1.075, 0); arm.rotation.z = s * .12; upper.add(arm); J.shoulder[s] = arm;
    const elbow = new THREE.Group(); elbow.position.y = -.305; arm.add(elbow); J.elbow[s] = elbow;
    const fore = new THREE.Group(); fore.position.y = .305; elbow.add(fore);
    add(arm, box(.056, .27, .076), M.alu, 0, -.155, 0);
    add(arm, box(.062, .03, .082), M.rubber, 0, -.305, 0);
    add(arm, new THREE.CylinderGeometry(.021, .021, .092, 20).rotateX(Math.PI / 2), M.dark, 0, -.305, 0);
    add(fore, box(.054, .21, .072), M.alu, 0, -.425, 0);
    add(fore, box(.046, .024, .06), M.rubber, 0, -.542, 0);
    add(fore, box(.066, .03, .046), M.dark, 0, -.568, 0);
    for (const d of [1, -1]) {
      const fp = new THREE.Group(); fp.position.set(d * .024, -.58, 0); fore.add(fp);
      add(fp, box(.014, .05, .03), M.dark, d * .01, -.023, 0).rotation.z = d * .4;
      add(fp, box(.013, .046, .03), M.dark, d * .01, -.064, 0).rotation.z = -d * .5;
    }
  }

  // Caminar: mismo ciclo que el modelo original (botón "Caminar" de Mateo). k = 0 quieto … 1 caminando.
  const rad = v => v * Math.PI / 180;
  function caminar(t, k = 1) {
    const p = Math.sin(t / .32) * k;
    J.hip[1].rotation.x = rad(22 * p); J.hip[-1].rotation.x = rad(-22 * p);
    J.shoulder[1].rotation.x = rad(-26 * p); J.shoulder[-1].rotation.x = rad(26 * p);
    J.elbow[1].rotation.x = -rad(14 * k + 10 * p); J.elbow[-1].rotation.x = -rad(14 * k - 10 * p);
    J.waist.rotation.y = rad(5 * p);
    upper.position.y = Math.abs(Math.sin(t / .32)) * .012 * k;
  }
  return { grupo: robot, caminar };
}
