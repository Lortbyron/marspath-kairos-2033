// Utilidades para los modelos de la "Vista de cerca" (diseño de Mateo).
// Los modelos se arman con código (sin archivos .obj), así la página no descarga modelos pesados.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Une todas las piezas que comparten material en una sola malla (de cientos de piezas a ~10 por modelo).
// Devuelve [{ geometria, material }] para crear copias baratas del modelo.
export function fusionar(raiz) {
  raiz.updateMatrixWorld(true);
  const porMat = new Map();
  raiz.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    if (!porMat.has(o.material)) porMat.set(o.material, []);
    porMat.get(o.material).push(g);
  });
  return [...porMat].map(([material, gs]) => ({ geometria: mergeGeometries(gs), material }));
}

// Crea un grupo con las mallas fusionadas; `cambiar` permite reemplazar un material por nombre.
export function instancia(partes, cambiar = {}) {
  const g = new THREE.Group();
  for (const { geometria, material } of partes) {
    const m = new THREE.Mesh(geometria, cambiar[material.name] ?? material);
    m.castShadow = m.receiveShadow = true; g.add(m);
  }
  return g;
}

export const mat = (name, color, roughness, metalness = 0, extra = {}) =>
  Object.assign(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }), { name });
