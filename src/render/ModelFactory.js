// ============================================================================
// Procedural meshes for buildings and resource nodes — premium sci-fi shapes
// with faction-colored emissive accents. Kept low-poly for performance.
// ============================================================================

import * as THREE from 'three';
import { MAP } from '../data/constants.js';
import { NODE_TYPES } from '../data/balance.js';

const TILE = MAP.TILE;

function mat(color, { emissive = 0x000000, ei = 0, metal = 0.7, rough = 0.4 } = {}) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, metalness: metal, roughness: rough });
}

// A dark base slab every building sits on.
function base(size, accent) {
  const g = new THREE.Group();
  const w = size * TILE;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.6, w * 0.98), mat(0x11151f, { metal: 0.4, rough: 0.7 }));
  slab.position.y = 0.3; slab.castShadow = true; slab.receiveShadow = true;
  g.add(slab);
  // glowing rim
  const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, w), mat(accent, { emissive: accent, ei: 1.2, metal: 0.2 }));
  rim.position.y = 0.62; g.add(rim);
  return g;
}

function box(w, h, d, m, y = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.y = y + h / 2; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

export function buildingMesh(def, color, color2) {
  const g = new THREE.Group();
  const size = def.size;
  const w = size * TILE;
  const body = mat(0x1b2130, { metal: 0.75, rough: 0.35 });
  const accent = new THREE.Color(color).getHex();
  const accent2 = new THREE.Color(color2 || color).getHex();
  g.add(base(size, accent));
  const y0 = 0.62;

  switch (def.id) {
    case 'hq': {
      g.add(box(w * 0.7, 1.4, w * 0.7, body, y0));
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, w * 0.28, 6.5, 6), mat(accent, { emissive: accent, ei: 0.8 }));
      spire.position.y = y0 + 4.2; spire.castShadow = true; g.add(spire);
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), mat(accent2, { emissive: accent2, ei: 1.6, metal: 0.2 }));
      core.position.y = y0 + 7.6; g.add(core); core.userData.spin = 1;
      break;
    }
    case 'data_center': {
      for (let i = 0; i < 3; i++) g.add(box(w * (0.82 - i * 0.16), 0.7, w * 0.82, body, y0 + i * 0.85));
      const glow = box(w * 0.5, 0.3, w * 0.5, mat(accent, { emissive: accent, ei: 1.4 }), y0 + 2.6); g.add(glow);
      break;
    }
    case 'power_node': {
      g.add(box(w * 0.5, 0.8, w * 0.5, body, y0));
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), mat(accent, { emissive: accent, ei: 2.0, metal: 0.1 }));
      orb.position.y = y0 + 2.6; g.add(orb); orb.userData.pulse = 1;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 8, 24), mat(accent2, { emissive: accent2, ei: 1.2 }));
      ring.position.y = y0 + 2.6; ring.rotation.x = Math.PI / 2; g.add(ring); ring.userData.spin = 2;
      break;
    }
    case 'capital_exchange': {
      const v = box(w * 0.6, 2.4, w * 0.6, body, y0); v.rotation.y = Math.PI / 4; g.add(v);
      const bars = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.2, w * 0.7), mat(accent, { emissive: accent, ei: 1.5 }));
      bars.position.y = y0 + 2.7; g.add(bars);
      break;
    }
    case 'research_lab': {
      g.add(box(w * 0.7, 0.9, w * 0.7, body, y0));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.36, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(accent, { emissive: accent, ei: 0.7, metal: 0.2, rough: 0.2 }));
      dome.position.y = y0 + 0.9; g.add(dome);
      break;
    }
    case 'security_hub': {
      g.add(box(w * 0.85, 1.3, w * 0.85, body, y0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const t = box(0.5, 2.4, 0.5, mat(0x232a3a, { metal: 0.8 }), y0);
        t.position.set(sx * w * 0.36, t.position.y, sz * w * 0.36); g.add(t);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 4), mat(accent, { emissive: accent, ei: 1.3 }));
        tip.position.set(sx * w * 0.36, y0 + 2.6, sz * w * 0.36); g.add(tip);
      }
      break;
    }
    case 'broadcast': {
      g.add(box(w * 0.5, 1.0, w * 0.5, body, y0));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.5, 6), mat(0x333a4a));
      mast.position.y = y0 + 3.0; g.add(mast);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(accent, { emissive: accent, ei: 0.9, metal: 0.3 }));
      dish.position.y = y0 + 4.6; dish.rotation.x = Math.PI * 0.85; g.add(dish); dish.userData.spin = 0.6;
      break;
    }
    case 'policy_office': {
      g.add(box(w * 0.8, 1.6, w * 0.55, body, y0));
      for (let i = 0; i < 4; i++) {
        const col = box(0.28, 1.9, 0.28, mat(0x2a3145), y0);
        col.position.set(-w * 0.3 + i * (w * 0.2), col.position.y, w * 0.32); g.add(col);
      }
      const ped = box(w * 0.85, 0.18, w * 0.6, mat(accent, { emissive: accent, ei: 1.1 }), y0 + 1.6); g.add(ped);
      break;
    }
    case 'habitat': {
      for (let i = 0; i < 3; i++) {
        const pod = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), mat(0x222a3c, { metal: 0.5 }));
        const a = (i / 3) * Math.PI * 2;
        pod.position.set(Math.cos(a) * 1.1, y0 + 0.9, Math.sin(a) * 1.1); pod.castShadow = true; g.add(pod);
      }
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), mat(accent, { emissive: accent, ei: 1.4 }));
      hub.position.y = y0 + 1.3; g.add(hub);
      break;
    }
    case 'defense_node': {
      g.add(box(w * 0.7, 0.7, w * 0.7, body, y0));
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.7, 8), mat(0x2a3145, { metal: 0.85 }));
      turret.position.y = y0 + 1.1; g.add(turret); turret.userData.turret = 1;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.4, 6), mat(accent, { emissive: accent, ei: 1.0 }));
      barrel.rotation.z = Math.PI / 2; barrel.position.set(0.8, y0 + 1.15, 0); turret.add(barrel);
      break;
    }
    default:
      g.add(box(w * 0.7, 1.4, w * 0.7, body, y0));
  }
  return g;
}

export function resourceNodeMesh(node) {
  const info = NODE_TYPES[node.type];
  const color = new THREE.Color(info.color).getHex();
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 0.3, 20), mat(0x0d1018, { metal: 0.3, rough: 0.8 }));
  pad.position.y = 0.15; pad.receiveShadow = true; g.add(pad);
  const shardMat = mat(color, { emissive: color, ei: 1.4, metal: 0.2, rough: 0.15 });
  const shards = new THREE.Group();
  const n = 5;
  for (let i = 0; i < n; i++) {
    const h = 1.4 + Math.random() * 2.2;
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.35 + Math.random() * 0.2, h, 5), shardMat);
    const a = (i / n) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.9, 0.3 + h / 2, Math.sin(a) * 0.9);
    s.rotation.z = (Math.random() - 0.5) * 0.4; s.castShadow = true;
    shards.add(s);
  }
  g.add(shards);
  g.userData.shards = shards;
  g.userData.color = color;
  return g;
}
