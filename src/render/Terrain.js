// ============================================================================
// Terrain: ground plane, subtle grid, glowing "data route" lines and a
// luminous world boundary. The ground and line materials are exposed so the
// renderer's day/night cycle can retint them — a cool slate field by day,
// dark obsidian with glowing routes by night.
// ============================================================================

import * as THREE from 'three';
import { MAP } from '../data/constants.js';

export function buildTerrain(scene, rng) {
  const group = new THREE.Group();
  const S = MAP.SIZE;

  // Ground — retinted through the day/night cycle by the renderer.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x39414e, metalness: 0.35, roughness: 0.7 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  ground.userData.pickGround = true;
  group.add(ground);

  // Subtle grid.
  const grid = new THREE.GridHelper(S, MAP.GRID, 0x1a2740, 0x0e1626);
  grid.position.y = 0.02;
  grid.material.transparent = true; grid.material.opacity = 0.5;
  group.add(grid);

  // Glowing data-route lines snaking across the map.
  const routeMat = new THREE.LineBasicMaterial({ color: 0x2f6bd0, transparent: true, opacity: 0.5 });
  const routes = new THREE.Group();
  const half = S / 2;
  const rnd = rng || Math.random;
  for (let i = 0; i < 14; i++) {
    const pts = [];
    let x = (rnd() - 0.5) * S, z = -half;
    const steps = 10;
    for (let s = 0; s <= steps; s++) {
      x += (rnd() - 0.5) * 16;
      z = -half + (S * s) / steps;
      pts.push(new THREE.Vector3(THREE.MathUtils.clamp(x, -half, half), 0.06, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    routes.add(new THREE.Line(geo, routeMat));
  }
  group.add(routes);

  // Luminous boundary frame.
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x1a3a6a, emissive: 0x1e4f9a, emissiveIntensity: 1.2, metalness: 0.3, roughness: 0.4 });
  for (const [w, d, x, z] of [[S, 1.2, 0, -half], [S, 1.2, 0, half], [1.2, S, -half, 0], [1.2, S, half, 0]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), edgeMat);
    bar.position.set(x, 0.7, z); group.add(bar);
  }

  scene.add(group);
  return { group, routes, routeMat, groundMat, gridMat: grid.material, edgeMat };
}
