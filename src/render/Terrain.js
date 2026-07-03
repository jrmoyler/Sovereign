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
  const rnd = rng || Math.random;

  // Ground — retinted through the day/night cycle by the renderer.
  const groundTex = makeGroundTexture();
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x566273, map: groundTex, metalness: 0.28, roughness: 0.82 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  ground.userData.pickGround = true;
  group.add(ground);

  // Layered tactical grid and concrete tile seams.
  const grid = new THREE.GridHelper(S, MAP.GRID, 0x355174, 0x172235);
  grid.position.y = 0.02;
  grid.material.transparent = true; grid.material.opacity = 0.72;
  group.add(grid);

  // Low environmental props: plaza pads, vents, and neon route beacons make
  // the arena read as an inhabited AI datacenter rather than an empty plane.
  const propMat = new THREE.MeshStandardMaterial({ color: 0x2b3442, metalness: 0.42, roughness: 0.66 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x6bdcff, emissive: 0x2f8cff, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.35 });
  for (let i = 0; i < 42; i++) {
    const x = (rnd() - 0.5) * S * 0.92, z = (rnd() - 0.5) * S * 0.92;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.7 + rnd()*1.4, 0.8 + rnd()*1.5, 0.08, 6), propMat);
    pad.position.set(x, 0.05, z); pad.rotation.y = rnd() * Math.PI; pad.receiveShadow = true; group.add(pad);
    if (rnd() < 0.45) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55 + rnd()*0.8, 0.18), glowMat); b.position.set(x + (rnd()-0.5)*1.2, 0.35, z + (rnd()-0.5)*1.2); group.add(b); }
  }

  // Glowing data-route lines snaking across the map.
  const routeMat = new THREE.LineBasicMaterial({ color: 0x2f6bd0, transparent: true, opacity: 0.5 });
  const routes = new THREE.Group();
  const half = S / 2;
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

function makeGroundTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#596575'; x.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 64) for (let xx = 0; xx < S; xx += 64) {
    x.fillStyle = ((xx + y) / 64) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
    x.fillRect(xx, y, 64, 64);
  }
  x.strokeStyle = 'rgba(18,28,44,0.55)'; x.lineWidth = 2;
  for (let i = 0; i <= S; i += 64) { x.beginPath(); x.moveTo(i,0); x.lineTo(i,S); x.moveTo(0,i); x.lineTo(S,i); x.stroke(); }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random()<0.5?'255,255,255':'0,0,0'},${0.025 + Math.random()*0.035})`; x.fillRect(Math.random()*S, Math.random()*S, 1+Math.random()*7, 1+Math.random()*7); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(10, 10); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
