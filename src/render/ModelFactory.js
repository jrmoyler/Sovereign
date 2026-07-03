// ============================================================================
// Procedural architecture for buildings + resource nodes.
//
// Buildings follow a small architectural grammar instead of raw primitives:
//   massing (podium / tower / setbacks)  →  façade rhythm (window-bay
//   textures with lit/unlit emissive maps)  →  roof & detail modules
//   (parapets, HVAC, vents, cooling stacks, antennas, dishes, columns).
//
// Façade textures are canvas-generated once per (kind, accent, faction wall)
// and cached; each wall clones the texture to set its own bay/floor repeat so
// window density matches real wall dimensions. Every building is
// deterministically varied by the entity id (seeded RNG) so no two read as
// identical clones.
//
// DIVISION IDENTITY — every faction's buildings are distinguishable:
//   * façade walls are tinted with the division's `arch.wall` palette,
//   * parapets / structural trim use the division's `arch.trim` color,
//   * every building carries a division-number sign plinth, and
//   * every building carries the division's signature `arch.motif` structure
//     (halo, pylons, crown, turbine, sails, …) — 20 unique motifs.
//
// All emissive materials register themselves so the renderer can drive a
// day/night factor: windows and accent lights are dim in daylight and come
// alive as night falls (see setNightFactor()).
// ============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP } from '../data/constants.js';
import { NODE_TYPES } from '../data/balance.js';

const TILE = MAP.TILE;

// Real-ish dimensional grammar at RTS scale.
const FLOOR = 0.82;   // one storey
const BAY = 0.72;     // one window bay

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) for per-building deterministic variation.
// ---------------------------------------------------------------------------
function rng32(seed) {
  let a = (seed || 1) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Canvas façade generator. Returns { map, emissive } textures.
// kind: 'office' | 'glass' | 'industrial' | 'residential' | 'civic'
// wallCss: the faction's wall palette, blended into the per-kind base color
// so every division's architecture reads with its own material identity.
// ---------------------------------------------------------------------------
const _facadeCache = new Map();

function blendCss(aCss, bCss, t) {
  return `#${new THREE.Color(aCss).lerp(new THREE.Color(bCss), t).getHexString()}`;
}

function makeFacade(kind, accentCss, wallCss) {
  const key = `${kind}:${accentCss}:${wallCss || ''}`;
  if (_facadeCache.has(key)) return _facadeCache.get(key);

  const W = 256, H = 256;                    // one tile = 4 bays × 4 floors
  const COLS = 4, ROWS = 4;
  const albedo = document.createElement('canvas'); albedo.width = W; albedo.height = H;
  const emis = document.createElement('canvas'); emis.width = W; emis.height = H;
  const a = albedo.getContext('2d');
  const e = emis.getContext('2d');
  const r = rng32([...key].reduce((s, c) => s + c.charCodeAt(0), 7));

  const kindBase = {
    office: '#2a2f3a', glass: '#1c2430', industrial: '#343a42',
    residential: '#33383f', civic: '#3d3c38',
  }[kind] || '#2a2f3a';
  const wall = wallCss ? blendCss(kindBase, wallCss, 0.78) : kindBase;
  a.fillStyle = wall; a.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);

  // panel weathering
  for (let i = 0; i < 40; i++) {
    a.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r() * 0.04})`;
    a.fillRect(r() * W, r() * H, 8 + r() * 40, 6 + r() * 20);
  }

  const cw = W / COLS, ch = H / ROWS;
  for (let row = 0; row < ROWS; row++) {
    // floor slab line
    a.fillStyle = 'rgba(0,0,0,0.5)';
    a.fillRect(0, row * ch, W, 4);
    for (let col = 0; col < COLS; col++) {
      const x = col * cw, y = row * ch;
      let wx, wy, ww, wh;
      if (kind === 'glass') { wx = x + 4; wy = y + 8; ww = cw - 8; wh = ch - 12; }
      else if (kind === 'industrial') {
        // high clerestory strip windows only on some rows
        if (row % 2 !== 0) continue;
        wx = x + 10; wy = y + 8; ww = cw - 20; wh = ch * 0.22;
      } else if (kind === 'residential') { wx = x + 16; wy = y + 14; ww = cw - 32; wh = ch - 26; }
      else if (kind === 'civic') { wx = x + 20; wy = y + 12; ww = cw - 40; wh = ch - 22; }
      else { wx = x + 14; wy = y + 14; ww = cw - 28; wh = ch - 24; }

      const lit = r() < (kind === 'industrial' ? 0.25 : 0.42);
      // frame
      a.fillStyle = 'rgba(10,12,16,0.9)'; a.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      if (lit) {
        const warm = r() < 0.75;
        const litCol = warm ? '#ffd9a0' : accentCss;
        a.fillStyle = litCol; a.fillRect(wx, wy, ww, wh);
        e.fillStyle = litCol; e.fillRect(wx, wy, ww, wh);
        // dim the emissive per-window for variety and to keep bloom in check
        e.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.45})`; e.fillRect(wx, wy, ww, wh);
      } else {
        // dark glass with sky gradient
        const g = a.createLinearGradient(0, wy, 0, wy + wh);
        g.addColorStop(0, '#3d4c63'); g.addColorStop(1, '#161c26');
        a.fillStyle = g; a.fillRect(wx, wy, ww, wh);
      }
      // mullion
      if (kind === 'glass' || kind === 'office') {
        a.fillStyle = 'rgba(0,0,0,0.55)';
        a.fillRect(wx + ww / 2, wy, 2, wh);
      }
    }
  }

  const mk = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const out = { key, map: mk(albedo), emissive: mk(emis) };
  _facadeCache.set(key, out);
  return out;
}

// Concrete / roof texture (shared).
let _concreteTex = null;
function concreteTexture() {
  if (_concreteTex) return _concreteTex;
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#3a3d43'; x.fillRect(0, 0, S, S);
  const r = rng32(99);
  for (let i = 0; i < 600; i++) {
    x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r() * 0.05})`;
    x.fillRect(r() * S, r() * S, 1 + r() * 5, 1 + r() * 5);
  }
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.moveTo(0, S / 2); x.lineTo(S, S / 2); x.stroke();
  _concreteTex = new THREE.CanvasTexture(c);
  _concreteTex.wrapS = _concreteTex.wrapT = THREE.RepeatWrapping;
  _concreteTex.colorSpace = THREE.SRGBColorSpace;
  _concreteTex.anisotropy = 8;
  return _concreteTex;
}

// ---------------------------------------------------------------------------
// Material helpers — memoized so identical materials are shared across all
// buildings. Shared materials let the static-geometry compiler merge whole
// buildings into a handful of draw calls.
//
// Every emissive material registers its base intensity so the renderer can
// drive the day/night cycle: setNightFactor(0) = full daylight (windows and
// accent lights nearly off), setNightFactor(1) = deep night (full glow).
// ---------------------------------------------------------------------------
const _matCache = new Map();
const _nightMats = [];       // { m, base, dayMul }
let _nightFactor = 1;

function registerNight(m, base, dayMul = 0.18) {
  _nightMats.push({ m, base, dayMul });
  m.emissiveIntensity = base * (dayMul + (1 - dayMul) * _nightFactor);
}

// f: 0 = daylight, 1 = night. Called by the renderer each frame.
export function setNightFactor(f) {
  f = Math.min(1, Math.max(0, f));
  if (Math.abs(f - _nightFactor) < 0.002) return;
  _nightFactor = f;
  for (const { m, base, dayMul } of _nightMats) {
    m.emissiveIntensity = base * (dayMul + (1 - dayMul) * f);
  }
}

function mat(color, { emissive = 0x000000, ei = 0, metal = 0.35, rough = 0.65 } = {}) {
  const key = `m:${color}:${emissive}:${ei}:${metal}:${rough}`;
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, metalness: metal, roughness: rough });
    m.userData.shared = true;
    if (ei > 0) registerNight(m, ei);
    _matCache.set(key, m);
  }
  return m;
}

function concreteMat(tint = 0xffffff, rough = 0.85) {
  const key = `c:${tint}:${rough}`;
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: tint, metalness: 0.08, roughness: rough });
    m.map = concreteTexture();
    m.userData.shared = true;
    _matCache.set(key, m);
  }
  return m;
}

function facadeMat(fac, bays, floors, { rough = 0.5, metal = 0.25, ei = 0.36 } = {}) {
  const key = `f:${fac.key}:${bays}:${floors}:${rough}:${metal}:${ei}`;
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ metalness: metal, roughness: rough });
    m.map = fac.map.clone(); m.map.repeat.set(bays / 4, floors / 4);
    m.map.needsUpdate = true;
    m.emissiveMap = fac.emissive.clone(); m.emissiveMap.repeat.set(bays / 4, floors / 4);
    m.emissiveMap.needsUpdate = true;
    m.emissive = new THREE.Color(0xffffff);
    m.userData.shared = true;
    // windows glow at night, read as dark glass in daylight
    registerNight(m, ei, 0.1);
    _matCache.set(key, m);
  }
  return m;
}

// Merge all static single-material meshes in a building group into one mesh
// per material. Animated parts (spin/pulse/turret) and multi-material façade
// blocks are left as-is. Cuts a 30–45 mesh building down to ~6–10 draws.
function compileStatic(g) {
  g.updateMatrixWorld(true);
  const buckets = new Map();
  const remove = [];
  g.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    let p = o, animated = false;
    while (p && p !== g) {
      if (p.userData.spin || p.userData.pulse || p.userData.turret) { animated = true; break; }
      p = p.parent;
    }
    if (animated) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo);
    remove.push(o);
  });
  for (const o of remove) { o.parent.remove(o); o.geometry.dispose(); }
  for (const [m, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const x of geos) x.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }
}

function shadowed(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

// A textured architectural block: window façades on all four sides, concrete
// roof/underside. w/d in world units, h in world units, y = base height.
function block(fac, w, h, d, y = 0, opts = {}) {
  const baysX = Math.max(1, Math.round(w / BAY));
  const baysZ = Math.max(1, Math.round(d / BAY));
  const floors = Math.max(1, Math.round(h / FLOOR));
  const roof = opts.roofMat || concreteMat(0x71767e);
  const sideX = facadeMat(fac, baysZ, floors, opts);
  const sideZ = facadeMat(fac, baysX, floors, opts);
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, [sideX, sideX, roof, roof, sideZ, sideZ]);
  mesh.position.y = y + h / 2;
  return shadowed(mesh);
}

// Simple solid box helper.
function box(w, h, d, m, y = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.y = y + h / 2;
  return shadowed(mesh);
}

function cyl(rTop, rBot, h, m, y = 0, seg = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m);
  mesh.position.y = y + h / 2;
  return shadowed(mesh);
}

// The style of the building currently being generated (set by buildingMesh,
// read by shared helpers so per-division trim doesn't have to thread through
// every generator signature). Building generation is synchronous.
let STYLE = null;

// Parapet frame around a roof (cx/cz = roof center offset). Trim takes the
// division's structural color so silhouettes read per-faction.
function parapet(g, w, d, y, t = 0.1, h = 0.22, cx = 0, cz = 0) {
  const pm = STYLE ? concreteMat(STYLE.trim) : concreteMat(0x9ba0a8);
  for (const [bw, bd, x, z] of [
    [w, t, 0, d / 2 - t / 2], [w, t, 0, -d / 2 + t / 2],
    [t, d, w / 2 - t / 2, 0], [t, d, -w / 2 + t / 2, 0],
  ]) {
    const b = box(bw, h, bd, pm, y);
    b.position.x = cx + x; b.position.z = cz + z; g.add(b);
  }
}

// Rooftop clutter: HVAC boxes, vents, pipes — scaled to the roof area.
function roofClutter(g, r, w, d, y, count = 3) {
  const hvac = mat(0x7c828c, { metal: 0.5, rough: 0.5 });
  const dark = mat(0x4a4f58, { metal: 0.45, rough: 0.6 });
  for (let i = 0; i < count; i++) {
    const bw = 0.4 + r() * 0.5, bh = 0.24 + r() * 0.3, bd = 0.4 + r() * 0.5;
    const b = box(bw, bh, bd, r() < 0.6 ? hvac : dark, y);
    b.position.set((r() - 0.5) * (w - bw - 0.3), b.position.y, (r() - 0.5) * (d - bd - 0.3));
    b.rotation.y = r() < 0.3 ? Math.PI / 4 : 0;
    g.add(b);
    if (r() < 0.5) { // vent stack next to it
      const v = cyl(0.07, 0.09, 0.4 + r() * 0.4, dark, y, 8);
      v.position.set(b.position.x + 0.4, v.position.y, b.position.z + 0.2);
      g.add(v);
    }
  }
}

// Slim antenna with warm aircraft-warning tip.
function antenna(g, x, y, z, h, accent) {
  const m = mat(0x565c66, { metal: 0.7, rough: 0.35 });
  const pole = cyl(0.03, 0.05, h, m, y, 6); pole.position.x = x; pole.position.z = z; g.add(pole);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xff4444, { emissive: 0xff3333, ei: 1.6, metal: 0 }));
  tip.position.set(x, y + h + 0.06, z); g.add(tip);
}

// Ground slab + apron every building sits on. Much subtler than the old
// glowing rim — a concrete pad with a thin accent service light at the curb.
function foundation(size, accent) {
  const g = new THREE.Group();
  const w = size * TILE;
  const pad = box(w * 0.99, 0.22, w * 0.99, concreteMat(0x6f747c), 0);
  g.add(pad);
  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.995, 0.05, w * 0.995),
    mat(accent, { emissive: accent, ei: 0.55, metal: 0.2, rough: 0.6 }),
  );
  curb.position.y = 0.03; g.add(curb);
  return g;
}

// ---------------------------------------------------------------------------
// Division-number signage. Every building carries a small monolith sign with
// the division number in the faction accent — instant ownership readability
// even between divisions that share similar palettes. Unlit material so it
// stays readable through the whole day/night cycle.
// ---------------------------------------------------------------------------
const _signCache = new Map();

function divisionSignMat(num, accentCss) {
  const key = `${num}:${accentCss}`;
  let m = _signCache.get(key);
  if (m) return m;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#0b0e14'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = accentCss; x.lineWidth = 6; x.strokeRect(5, 5, 118, 118);
  x.fillStyle = accentCss;
  x.font = '900 74px "Segoe UI", system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(num, 64, 56);
  x.font = '700 20px "Segoe UI", system-ui, sans-serif';
  x.fillText('DIVISION', 64, 106);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  m = new THREE.MeshBasicMaterial({ map: tex });
  m.userData.shared = true;
  _signCache.set(key, m);
  return m;
}

function addSignage(g, w, y0) {
  const face = divisionSignMat(STYLE.num, STYLE.accentCss);
  const frame = mat(0x22262e, { metal: 0.5, rough: 0.45 });
  const cx = w * 0.42, cz = w * 0.42;
  const post = box(0.14, 1.3, 0.14, concreteMat(STYLE.trim), y0);
  post.position.set(cx, post.position.y, cz); g.add(post);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.08),
    [frame, frame, frame, frame, face, face]);
  panel.position.set(cx, y0 + 1.85, cz);
  panel.rotation.y = Math.PI / 4;   // face outward on the diagonal
  shadowed(panel); g.add(panel);
}

// ---------------------------------------------------------------------------
// Signature motifs — one unique structural signature per division, applied to
// every building the division constructs. `top` is the building's current
// bounding-box height so rooftop motifs sit above the massing.
// ---------------------------------------------------------------------------
const MOTIFS = {
  // ZenFlow — floating luminous lattice halo above the structure
  halo({ g, w, accent, top }) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.3, 0.05, 8, 36),
      mat(accent, { emissive: accent, ei: 1.3, metal: 0.3, rough: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = top + 0.9;
    ring.userData.spin = 0.35; g.add(ring);
  },
  // The Collective — command obelisk with a glowing seam
  obelisk({ g, w, y0, accent, trim }) {
    const o = box(0.3, 2.4, 0.3, concreteMat(trim), y0);
    o.position.set(-w * 0.42, o.position.y, w * 0.4); o.rotation.y = Math.PI / 5; g.add(o);
    const seam = box(0.06, 2.1, 0.06, mat(accent, { emissive: accent, ei: 1.4 }), y0 + 0.1);
    seam.position.set(-w * 0.42 + 0.14, seam.position.y, w * 0.4); seam.rotation.y = Math.PI / 5; g.add(seam);
  },
  // Hybrid Living — living-roof greenery and courtyard trees
  garden({ g, w, r, y0, top }) {
    const green = mat(0x3f7a4a, { rough: 0.9, metal: 0 });
    const canopy = mat(0x59985e, { rough: 0.9, metal: 0 });
    const pad = box(w * 0.34, 0.1, w * 0.34, green, top - 0.02); g.add(pad);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5;
      const tr = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.7, 7), i % 2 ? green : canopy);
      tr.position.set(Math.cos(a) * w * 0.42, y0 + 0.35, Math.sin(a) * w * 0.42);
      tr.castShadow = true; g.add(tr);
    }
  },
  // Nexus Labs — story-projector beacon with spinning film ring
  projector({ g, w, accent, accent2, top }) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(w * 0.16, 1.6, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: accent2, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = top + 0.8; g.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.18, 0.045, 6, 24),
      mat(accent, { emissive: accent, ei: 1.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = top + 1.5; ring.userData.spin = 1.1; g.add(ring);
  },
  // Terra Axis — external structural exoskeleton frame
  frame({ g, w, trim, top }) {
    const fm = concreteMat(trim);
    const h = Math.min(top * 0.92, top - 0.1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const beam = box(0.12, h, 0.12, fm, 0.1);
      beam.position.set(sx * w * 0.44, beam.position.y, sz * w * 0.44); g.add(beam);
    }
    for (const sz of [-1, 1]) {
      const rail = box(w * 0.88, 0.1, 0.12, fm, h);
      rail.position.z = sz * w * 0.44; g.add(rail);
    }
  },
  // Vital Helix — double-helix strand climbing a mast
  helix({ g, w, accent, accent2, top }) {
    const mastM = mat(0x565c66, { metal: 0.7, rough: 0.35 });
    const pole = cyl(0.04, 0.06, 1.9, mastM, top - 0.2, 6);
    pole.position.x = w * 0.3; pole.position.z = -w * 0.3; g.add(pole);
    const beads = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const t = i / 13, a = t * Math.PI * 3.2;
      for (const [phase, col] of [[0, accent], [Math.PI, accent2]]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5),
          mat(col, { emissive: col, ei: 1.1, metal: 0 }));
        b.position.set(Math.cos(a + phase) * 0.22, top - 0.1 + t * 1.7, Math.sin(a + phase) * 0.22);
        beads.add(b);
      }
    }
    beads.position.set(w * 0.3, 0, -w * 0.3); beads.userData.spin = 0.6; g.add(beads);
  },
  // Binary Loom — vertical data-fin array
  fins({ g, w, accent, trim, top }) {
    const fm = concreteMat(trim);
    for (let i = 0; i < 4; i++) {
      const fh = 0.9 - i * 0.14;
      const fin = box(0.07, fh, 0.55, fm, top - 0.05);
      fin.position.x = -w * 0.3 + i * (w * 0.2); g.add(fin);
      const edge = box(0.03, fh * 0.9, 0.05, mat(accent, { emissive: accent, ei: 1.2 }), top - 0.02);
      edge.position.set(-w * 0.3 + i * (w * 0.2), edge.position.y, 0.28); g.add(edge);
    }
  },
  // Gaia Synthesis — working wind turbine
  turbine({ g, w, y0, trim }) {
    const tx = w * 0.38, tz = w * 0.38;
    const mastM = concreteMat(trim);
    const mast = cyl(0.05, 0.09, 2.6, mastM, y0, 8);
    mast.position.set(tx, mast.position.y, tz); g.add(mast);
    const hub = new THREE.Group(); hub.position.set(tx, y0 + 2.6, tz);
    hub.userData.spin = 2.2; hub.rotation.x = Math.PI / 2; // blades spin in a vertical plane
    const bladeM = mat(0xdfe4ea, { metal: 0.3, rough: 0.5 });
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.14), bladeM);
      blade.position.y = 0.5; blade.castShadow = true;
      const arm = new THREE.Group(); arm.rotation.z = (i / 3) * Math.PI * 2;
      arm.add(blade); hub.add(arm);
    }
    g.add(hub);
  },
  // Animus Prime — heavy armored pylons with warning glow
  pylons({ g, w, y0, accent, trim }) {
    const pm = concreteMat(trim);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = box(0.32, 1.5, 0.32, pm, y0);
      p.position.set(sx * w * 0.42, p.position.y, sz * w * 0.42);
      p.rotation.y = Math.PI / 4; g.add(p);
      const glow = box(0.34, 0.09, 0.34, mat(accent, { emissive: accent, ei: 1.3 }), y0 + 1.15);
      glow.position.set(sx * w * 0.42, glow.position.y, sz * w * 0.42);
      glow.rotation.y = Math.PI / 4; g.add(glow);
    }
  },
  // Aether Link — segmented relay mast with dishes
  mast({ g, w, y0, accent, top }) {
    const mx = w * 0.36, mz = w * 0.34;
    const mm = mat(0x565c66, { metal: 0.7, rough: 0.35 });
    const s1 = cyl(0.06, 0.11, 1.6, mm, y0, 6); s1.position.set(mx, s1.position.y, mz); g.add(s1);
    const s2 = cyl(0.03, 0.06, 1.3, mm, y0 + 1.6, 6); s2.position.set(mx, s2.position.y, mz); g.add(s2);
    for (let i = 0; i < 2; i++) {
      const drum = cyl(0.12, 0.12, 0.2, mat(0xd7dbe2, { metal: 0.3, rough: 0.5 }), y0 + 1.2 + i * 0.7, 10);
      drum.position.set(mx, drum.position.y, mz); g.add(drum);
    }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(accent, { emissive: accent, ei: 1.8 }));
    tip.position.set(mx, y0 + 3.05, mz); tip.userData.pulse = 1; g.add(tip);
  },
  // Obsidian Arc — angled corner armor shields
  bastion({ g, w, y0, accent, trim }) {
    const am = concreteMat(trim, 0.8);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const plate = box(0.7, 1.1, 0.1, am, y0);
      plate.position.set(sx * w * 0.4, plate.position.y, sz * w * 0.4);
      plate.rotation.y = Math.atan2(sx, sz) + Math.PI;
      plate.rotation.x = -0.14; g.add(plate);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(accent, { emissive: accent, ei: 1.6 }));
    eye.position.set(0, y0 + 1.55, w * 0.4); g.add(eye);
  },
  // Kinetic Edge — swept speed blades
  blades({ g, w, y0, accent, trim }) {
    const bm = concreteMat(trim);
    for (let i = 0; i < 3; i++) {
      const blade = box(0.1, 1.1 + i * 0.45, 0.5, bm, y0);
      blade.position.set(-w * 0.42 + i * 0.42, blade.position.y, -w * 0.4);
      blade.rotation.z = 0.28; g.add(blade);
      const tip = box(0.05, 0.3, 0.4, mat(accent, { emissive: accent, ei: 1.2 }), y0 + 0.85 + i * 0.45);
      tip.position.set(-w * 0.42 + i * 0.42 + 0.32, tip.position.y, -w * 0.4);
      tip.rotation.z = 0.28; g.add(tip);
    }
  },
  // Civic Core — plaza flag row
  flags({ g, w, y0, accent, accent2 }) {
    const poleM = mat(0x9ba0a8, { metal: 0.6, rough: 0.4 });
    for (let i = 0; i < 3; i++) {
      const x = -w * 0.2 + i * w * 0.2, z = w * 0.44;
      const pole = cyl(0.025, 0.035, 1.5, poleM, y0, 6);
      pole.position.set(x, pole.position.y, z); g.add(pole);
      const col = i === 1 ? accent2 : accent;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.26),
        mat(col, { emissive: col, ei: 0.5, metal: 0, rough: 0.8 }));
      flag.material.side = THREE.DoubleSide;
      flag.position.set(x + 0.24, y0 + 1.32, z); g.add(flag);
    }
  },
  // Quantum Ledger — gilded crown band and orb
  crown({ g, w, accent2, top }) {
    const gold = mat(0xd8b968, { emissive: 0x8a6a20, ei: 0.5, metal: 0.85, rough: 0.25 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(w * 0.24, 0.06, 8, 28), gold);
    band.rotation.x = Math.PI / 2; band.position.y = top + 0.16; g.add(band);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      mat(accent2, { emissive: accent2, ei: 1.4, metal: 0.4 }));
    orb.position.y = top + 0.6; orb.userData.pulse = 1; g.add(orb);
  },
  // Collective Consulting — glass atrium annex
  atrium({ g, w, y0, accent, trim }) {
    const glassM = mat(0x2c3e58, { emissive: accent, ei: 0.4, metal: 0.6, rough: 0.2 });
    const cube = box(0.9, 0.9, 0.9, glassM, y0);
    cube.position.set(w * 0.36, cube.position.y, -w * 0.36); cube.rotation.y = Math.PI / 7; g.add(cube);
    const cap = box(1.0, 0.08, 1.0, concreteMat(trim), y0 + 0.9);
    cap.position.set(w * 0.36, cap.position.y, -w * 0.36); cap.rotation.y = Math.PI / 7; g.add(cap);
  },
  // Cognara Mind — hovering mind-orb in a tilted ring
  orb({ g, w, accent, accent2, top }) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 9),
      mat(accent2, { emissive: accent2, ei: 1.6, metal: 0.2 }));
    o.position.y = top + 0.75; o.userData.pulse = 1; g.add(o);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 24),
      mat(accent, { emissive: accent, ei: 0.9, metal: 0.5 }));
    cage.position.y = top + 0.75; cage.rotation.x = Math.PI / 3; cage.userData.spin = 0.8; g.add(cage);
  },
  // Juris Guard — corner columns with an entablature bar
  columns({ g, w, y0, trim }) {
    const stone = concreteMat(trim, 0.8);
    for (const sx of [-1, 1]) {
      const c = cyl(0.1, 0.13, 1.6, stone, y0, 10);
      c.position.set(sx * w * 0.32, c.position.y, w * 0.43); g.add(c);
    }
    const bar = box(w * 0.72, 0.16, 0.24, stone, y0 + 1.6);
    bar.position.z = w * 0.43; g.add(bar);
  },
  // Signal Velocity — large glowing division billboard
  billboard({ g, w, y0, top }) {
    const face = divisionSignMat(STYLE.num, STYLE.accentCss);
    const frame = mat(0x22262e, { metal: 0.5, rough: 0.45 });
    const poleM = mat(0x565c66, { metal: 0.7, rough: 0.35 });
    const pole = cyl(0.06, 0.09, top + 1.0 - y0, poleM, y0, 8);
    pole.position.set(-w * 0.36, pole.position.y, -w * 0.36); g.add(pole);
    const bb = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.08),
      [frame, frame, frame, frame, face, face]);
    bb.position.set(-w * 0.36, top + 1.0, -w * 0.36);
    bb.rotation.y = Math.PI / 4; shadowed(bb); g.add(bb);
  },
  // Titan Directorate — foundry smokestacks with ember collars
  stacks({ g, w, y0, trim }) {
    for (let i = 0; i < 2; i++) {
      const x = w * 0.36 - i * 0.5, z = -w * 0.38;
      const s = cyl(0.11, 0.16, 2.0 + i * 0.5, concreteMat(trim, 0.85), y0, 10);
      s.position.set(x, s.position.y, z); g.add(s);
      const ember = cyl(0.12, 0.12, 0.1, mat(0xff7a3c, { emissive: 0xff5a1c, ei: 1.5 }), y0 + 1.85 + i * 0.5, 10);
      ember.position.set(x, ember.position.y, z); ember.userData.pulse = 1; g.add(ember);
    }
  },
  // Nomad Nexus — tensile nomad sails
  sails({ g, w, y0, accent, trim }) {
    const poleM = concreteMat(trim);
    for (const [x, z, ry] of [[-w * 0.38, w * 0.36, 0.5], [w * 0.4, -w * 0.32, 2.4]]) {
      const pole = cyl(0.035, 0.05, 1.7, poleM, y0, 6);
      pole.position.set(x, pole.position.y, z); g.add(pole);
      const sail = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 3, 1, true),
        mat(accent, { emissive: accent, ei: 0.35, metal: 0.1, rough: 0.7 }));
      sail.material.side = THREE.DoubleSide;
      sail.scale.z = 0.12;                    // flatten into a canvas sail
      sail.position.set(x, y0 + 0.95, z);
      sail.rotation.y = ry; sail.rotation.x = 0.2;
      sail.castShadow = true; g.add(sail);
    }
  },
};

function addMotif(g, w, r, y0) {
  const fn = MOTIFS[STYLE.motif];
  if (!fn) return;
  const bbox = new THREE.Box3().setFromObject(g);
  const top = Math.max(1.2, bbox.max.y);
  fn({ g, w, r, y0, top, accent: STYLE.accent, accent2: STYLE.accent2, trim: STYLE.trim });
}

// ===========================================================================
// BUILDING GENERATORS
// ===========================================================================

function genHQ(g, w, fac, glass, accent, accent2, r, y0) {
  // Podium: 2 tall commercial floors.
  const podW = w * 0.86, podH = FLOOR * 2.4;
  g.add(block(fac, podW, podH, podW, y0, { ei: 0.4 }));
  parapet(g, podW, podW, y0 + podH);
  // Main tower with two setbacks (offset from center for asymmetry).
  const off = (r() - 0.5) * w * 0.14;
  let tw = w * 0.52, th = FLOOR * (5 + Math.floor(r() * 2)), ty = y0 + podH;
  const t1 = block(glass, tw, th, tw, ty, { ei: 0.35 }); t1.position.x = off; g.add(t1);
  parapet(g, tw, tw, ty + th, 0.1, 0.22, off, 0); ty += th;
  let tw2 = tw * 0.74, th2 = FLOOR * 3;
  const t2 = block(glass, tw2, th2, tw2, ty, { ei: 0.35 }); t2.position.x = off; g.add(t2);
  ty += th2;
  // Crown: dark mechanical floor with a thin accent light band + spire.
  const crown = box(tw2 * 0.92, 0.4, tw2 * 0.92, mat(0x22262e, { metal: 0.5, rough: 0.45 }), ty);
  crown.position.x = off; g.add(crown);
  const bandHQ = box(tw2 * 0.94, 0.07, tw2 * 0.94, mat(accent, { emissive: accent, ei: 1.1, metal: 0.2 }), ty + 0.16);
  bandHQ.position.x = off; g.add(bandHQ);
  const spire = cyl(0.02, 0.09, 2.6, mat(0x565c66, { metal: 0.7, rough: 0.3 }), ty + 0.5, 6);
  spire.position.x = off; g.add(spire);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(accent2, { emissive: accent2, ei: 2.0, metal: 0 }));
  beacon.position.set(off, ty + 3.2, 0); beacon.userData.pulse = 1; g.add(beacon);
  // Podium roof: helipad + clutter.
  const heliR = podW * 0.16;
  const pad = cyl(heliR, heliR, 0.06, concreteMat(0x50555e), y0 + podH, 20);
  pad.position.set(-podW * 0.28, pad.position.y, podW * 0.26); g.add(pad);
  const hRing = new THREE.Mesh(new THREE.TorusGeometry(heliR * 0.8, 0.035, 6, 24), mat(0xffd27a, { emissive: 0xffc35c, ei: 0.9 }));
  hRing.rotation.x = Math.PI / 2; hRing.position.set(-podW * 0.28, y0 + podH + 0.08, podW * 0.26); g.add(hRing);
  roofClutter(g, r, podW * 0.8, podW * 0.5, y0 + podH, 3);
  antenna(g, podW * 0.32, y0 + podH, -podW * 0.3, 1.6, accent);
  // Entrance canopy.
  const canopy = box(podW * 0.4, 0.1, 0.9, mat(0x30353e, { metal: 0.5, rough: 0.4 }), y0 + FLOOR * 1.15);
  canopy.position.z = podW / 2 + 0.42; g.add(canopy);
}

function genDataCenter(g, w, fac, accent, r, y0) {
  const ind = fac;
  // Two long server halls with shallow-pitched metal roofs.
  const hallW = w * 0.40, hallH = FLOOR * 1.7, hallD = w * 0.88;
  const roofM = concreteMat(0x8a8f97, 0.7);
  for (const sx of [-1, 1]) {
    const hall = block(ind, hallW, hallH, hallD, y0, { ei: 0.28, roofMat: roofM });
    hall.position.x = sx * w * 0.235; g.add(hall);
    // roof vent row
    for (let i = 0; i < 4; i++) {
      const v = cyl(0.1, 0.12, 0.3, mat(0x565c66, { metal: 0.5 }), y0 + hallH, 8);
      v.position.set(sx * w * 0.235, v.position.y, -hallD / 2 + (i + 0.5) * (hallD / 4));
      g.add(v);
    }
    // status light strip along the eave
    const strip = box(0.05, 0.06, hallD * 0.94, mat(accent, { emissive: accent, ei: 1.1 }), y0 + hallH - 0.12);
    strip.position.x = sx * (w * 0.235 + hallW / 2 - 0.02); g.add(strip);
  }
  // Pipe rack + chillers between the halls.
  const rackM = mat(0x4a4f58, { metal: 0.6, rough: 0.5 });
  for (let i = 0; i < 3; i++) {
    const p = cyl(0.09, 0.09, w * 0.8, rackM, 0, 8);
    p.rotation.x = Math.PI / 2; p.position.set(0, y0 + 0.5 + i * 0.26, 0); g.add(p);
  }
  for (let i = 0; i < 2; i++) {
    const ch = box(0.6, 0.5, 0.6, mat(0x7c828c, { metal: 0.5, rough: 0.5 }), y0);
    ch.position.set(0, ch.position.y, (i - 0.5) * w * 0.5);
    g.add(ch);
    const fan = cyl(0.22, 0.22, 0.08, mat(0x30353e, { metal: 0.4 }), y0 + 0.5, 12);
    fan.position.copy(ch.position); fan.position.y = y0 + 0.54; fan.userData.spin = 6; g.add(fan);
  }
  // Small front office block.
  const off = block(fac, w * 0.34, FLOOR * 1.2, w * 0.2, y0, { ei: 0.4 });
  off.position.set(-w * 0.1, off.position.y, w * 0.36); g.add(off);
}

function genPowerNode(g, w, fac, accent, r, y0) {
  // Containment dome on a drum.
  const drumR = w * 0.2;
  const drum = cyl(drumR, drumR * 1.06, FLOOR * 1.6, concreteMat(0xb9bdc4), y0, 18);
  drum.position.set(-w * 0.18, drum.position.y, -w * 0.12); g.add(drum);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(drumR, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    concreteMat(0xaeb3ba, 0.6));
  dome.position.set(-w * 0.18, y0 + FLOOR * 1.6, -w * 0.12); shadowed(dome); g.add(dome);
  const domeRing = new THREE.Mesh(new THREE.TorusGeometry(drumR * 0.99, 0.04, 6, 24), mat(accent, { emissive: accent, ei: 1.2 }));
  domeRing.rotation.x = Math.PI / 2; domeRing.position.set(-w * 0.18, y0 + FLOOR * 1.6 + 0.05, -w * 0.12); g.add(domeRing);
  // Hyperbolic cooling stack.
  const stack = cyl(w * 0.13, w * 0.17, FLOOR * 3.4, concreteMat(0xa9adb4), y0, 16);
  stack.position.set(w * 0.24, stack.position.y, w * 0.18); g.add(stack);
  const stackTop = cyl(w * 0.135, w * 0.125, 0.24, mat(0x30353e, { rough: 0.8 }), y0 + FLOOR * 3.4, 16);
  stackTop.position.set(w * 0.24, stackTop.position.y, w * 0.18); g.add(stackTop);
  // Turbine hall.
  const hall = block(fac, w * 0.44, FLOOR * 1.3, w * 0.3, y0, { ei: 0.28 });
  hall.position.set(-w * 0.05, hall.position.y, w * 0.3); g.add(hall);
  // Transformer yard: small switchgear + insulators.
  const yard = { x: w * 0.26, z: -w * 0.26 };
  for (let i = 0; i < 3; i++) {
    const t = box(0.34, 0.4, 0.3, mat(0x4a4f58, { metal: 0.6, rough: 0.5 }), y0);
    t.position.set(yard.x - 0.5 + i * 0.5, t.position.y, yard.z); g.add(t);
    const ins = cyl(0.03, 0.045, 0.34, mat(0x8b9099, { metal: 0.4 }), y0 + 0.4, 6);
    ins.position.set(yard.x - 0.5 + i * 0.5, ins.position.y, yard.z); g.add(ins);
  }
  // Energy glow inside the dome ring only (subtle).
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(accent, { emissive: accent, ei: 1.8, metal: 0 }));
  core.position.set(-w * 0.18, y0 + FLOOR * 1.6 + drumR * 0.55, -w * 0.12);
  core.userData.pulse = 1; g.add(core);
}

function genExchange(g, w, fac, glass, accent, r, y0) {
  // Sleek curtain-wall tower with a sloped crown + low trading hall.
  const tw = w * 0.42, th = FLOOR * (6 + Math.floor(r() * 2));
  const tower = block(glass, tw, th, tw, y0, { ei: 0.35, rough: 0.25, metal: 0.5 });
  tower.position.set(-w * 0.14, tower.position.y, -w * 0.1); g.add(tower);
  // sloped glass crown
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, tw * 0.62, FLOOR * 1.4, 4),
    mat(0x232c3a, { emissive: accent, ei: 0.18, metal: 0.3, rough: 0.55 }));
  crown.rotation.y = Math.PI / 4;
  crown.position.set(-w * 0.14, y0 + th + FLOOR * 0.7, -w * 0.1); shadowed(crown); g.add(crown);
  // ticker band around the tower top
  const band = box(tw + 0.06, 0.28, tw + 0.06, mat(0x11151c, { emissive: accent, ei: 1.3, metal: 0.3 }), y0 + th - FLOOR * 1.2);
  band.position.set(-w * 0.14, band.position.y, -w * 0.1); g.add(band);
  // trading hall with arched glass roof
  const hall = block(fac, w * 0.5, FLOOR * 1.5, w * 0.34, y0, { ei: 0.42 });
  hall.position.set(w * 0.2, hall.position.y, w * 0.24); g.add(hall);
  const arch = new THREE.Mesh(
    new THREE.CylinderGeometry(w * 0.17, w * 0.17, w * 0.48, 14, 1, false, 0, Math.PI),
    mat(0x39506e, { metal: 0.55, rough: 0.3, emissive: 0x18283c, ei: 0.4 }));
  arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2;
  arch.position.set(w * 0.2, y0 + FLOOR * 1.5, w * 0.24); shadowed(arch); g.add(arch);
  parapet(g, tw, tw, y0 + th, 0.08, 0.18);
}

function genLab(g, w, fac, glass, accent, r, y0) {
  // L-shaped research block + corner observatory tower.
  const aH = FLOOR * 1.9;
  const wingA = block(fac, w * 0.8, aH, w * 0.34, y0, { ei: 0.4 });
  wingA.position.z = -w * 0.22; g.add(wingA);
  const wingB = block(fac, w * 0.34, aH, w * 0.5, y0, { ei: 0.4 });
  wingB.position.set(-w * 0.23, wingB.position.y, w * 0.18); g.add(wingB);
  parapet(g, w * 0.8, w * 0.34, y0 + aH, 0.1, 0.22, 0, -w * 0.22);
  // observatory tower + dome
  const tR = w * 0.15;
  const tower = cyl(tR, tR, FLOOR * 2.6, concreteMat(0xb9bdc4), y0, 16);
  tower.position.set(w * 0.24, tower.position.y, w * 0.24); g.add(tower);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(tR * 0.95, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0x6e747d, { metal: 0.45, rough: 0.5 }));
  dome.position.set(w * 0.24, y0 + FLOOR * 2.6, w * 0.24); shadowed(dome); g.add(dome);
  const slit = box(0.14, tR * 0.9, tR * 1.02, mat(0x11151c, { emissive: accent, ei: 0.9 }), y0 + FLOOR * 2.6);
  slit.position.set(w * 0.24, y0 + FLOOR * 2.6 + tR * 0.32, w * 0.24); g.add(slit);
  // roof: skylights + instruments
  for (let i = 0; i < 3; i++) {
    const sky = box(0.5, 0.1, 0.34, mat(0x2c3e58, { emissive: accent, ei: 0.5, metal: 0.5, rough: 0.25 }), y0 + aH);
    sky.position.set(-w * 0.28 + i * 0.62, sky.position.y, -w * 0.22); g.add(sky);
  }
  antenna(g, -w * 0.23, y0 + aH, w * 0.18, 1.5, accent);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.6),
    mat(0x9ba0a8, { metal: 0.55, rough: 0.35 }));
  dish.rotation.x = Math.PI * 0.78; dish.position.set(0.1, y0 + aH + 0.35, -w * 0.1);
  dish.userData.spin = 0.4; shadowed(dish); g.add(dish);
}

function genSecurityHub(g, w, fac, accent, r, y0) {
  // Armored central bunker with battered (sloped) walls.
  const coreW = w * 0.52;
  const slope = new THREE.Mesh(
    new THREE.CylinderGeometry(coreW * 0.62, coreW * 0.78, FLOOR * 1.8, 4),
    concreteMat(0x8b9099, 0.8));
  slope.rotation.y = Math.PI / 4; slope.position.y = y0 + FLOOR * 0.9; shadowed(slope); g.add(slope);
  const cap = box(coreW * 0.8, 0.4, coreW * 0.8, concreteMat(0x6f747c), y0 + FLOOR * 1.8);
  g.add(cap);
  // rotating radar
  const mastM = mat(0x565c66, { metal: 0.7, rough: 0.35 });
  const mast = cyl(0.05, 0.07, 0.9, mastM, y0 + FLOOR * 1.8 + 0.4, 6); g.add(mast);
  const radar = box(0.9, 0.18, 0.05, mat(0x7c828c, { metal: 0.6, emissive: accent, ei: 0.4 }), y0 + FLOOR * 1.8 + 1.3);
  radar.userData.spin = 1.6; g.add(radar);
  // corner watchtowers
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = cyl(0.2, 0.26, FLOOR * 2.3, concreteMat(0x9ba0a8), y0, 8);
    t.position.set(sx * w * 0.36, t.position.y, sz * w * 0.36); g.add(t);
    const head = box(0.5, 0.34, 0.5, mat(0x30353e, { metal: 0.5, rough: 0.45 }), y0 + FLOOR * 2.3);
    head.position.set(sx * w * 0.36, head.position.y, sz * w * 0.36); g.add(head);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(accent, { emissive: accent, ei: 1.5 }));
    lamp.position.set(sx * w * 0.36, y0 + FLOOR * 2.3 + 0.42, sz * w * 0.36); g.add(lamp);
  }
  // perimeter walls between towers
  const wallM = concreteMat(0x7c828c, 0.85);
  for (const [bw, bd, x, z] of [
    [w * 0.66, 0.16, 0, w * 0.36], [w * 0.66, 0.16, 0, -w * 0.36],
    [0.16, w * 0.66, w * 0.36, 0], [0.16, w * 0.66, -w * 0.36, 0],
  ]) {
    const wall = box(bw, 0.7, bd, wallM, y0);
    wall.position.x = x; wall.position.z = z; g.add(wall);
  }
  // barracks annex
  const annex = block(fac, w * 0.3, FLOOR * 1.1, w * 0.2, y0, { ei: 0.3 });
  annex.position.set(0, annex.position.y, 0.02 - w * 0.18); g.add(annex);
}

function genBroadcast(g, w, fac, accent, r, y0) {
  // Studio building + broadcast mast with dishes.
  const studio = block(fac, w * 0.55, FLOOR * 1.7, w * 0.42, y0, { ei: 0.42 });
  studio.position.set(-w * 0.12, studio.position.y, w * 0.14); g.add(studio);
  parapet(g, w * 0.55, w * 0.42, y0 + FLOOR * 1.7);
  roofClutter(g, r, w * 0.45, w * 0.32, y0 + FLOOR * 1.7, 2);
  // mast: tapering lattice approximated with 3 stacked cylinders
  const mx = w * 0.26, mz = -w * 0.2;
  const mastM = mat(0x565c66, { metal: 0.7, rough: 0.35 });
  const seg1 = cyl(0.1, 0.2, FLOOR * 2.2, mastM, y0, 6); seg1.position.x = mx; seg1.position.z = mz; g.add(seg1);
  const seg2 = cyl(0.05, 0.1, FLOOR * 2.2, mastM, y0 + FLOOR * 2.2, 6); seg2.position.x = mx; seg2.position.z = mz; g.add(seg2);
  const seg3 = cyl(0.02, 0.05, FLOOR * 1.6, mastM, y0 + FLOOR * 4.4, 6); seg3.position.x = mx; seg3.position.z = mz; g.add(seg3);
  // antenna drums + dish
  for (let i = 0; i < 3; i++) {
    const drum = cyl(0.14, 0.14, 0.24, mat(0xd7dbe2, { metal: 0.3, rough: 0.5 }), 0, 10);
    drum.position.set(mx, y0 + FLOOR * (2.4 + i * 0.8), mz); g.add(drum);
  }
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.6),
    mat(0xc3c8cf, { metal: 0.4, rough: 0.4 }));
  dish.rotation.x = Math.PI * 0.72; dish.rotation.z = 0.4;
  dish.position.set(mx - 0.35, y0 + FLOOR * 2.0, mz + 0.2); dish.userData.spin = 0.5;
  shadowed(dish); g.add(dish);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xff4444, { emissive: 0xff3333, ei: 2.0 }));
  beacon.position.set(mx, y0 + FLOOR * 6.1, mz); beacon.userData.pulse = 1; g.add(beacon);
  // uplink glow on the studio roof edge
  const strip = box(w * 0.5, 0.07, 0.07, mat(accent, { emissive: accent, ei: 1.0 }), y0 + FLOOR * 1.7);
  strip.position.set(-w * 0.12, strip.position.y, w * 0.14 + w * 0.21); g.add(strip);
}

function genPolicyOffice(g, w, fac, accent, r, y0) {
  // Civic architecture: stepped plinth, colonnade, entablature, attic block.
  const stone = concreteMat(0xcfd3d9, 0.75);
  const stoneDark = concreteMat(0xa9adb4, 0.8);
  // steps
  for (let i = 0; i < 3; i++) {
    const s = box(w * (0.8 - i * 0.06), 0.14, w * (0.62 - i * 0.06), stoneDark, y0 + i * 0.14);
    s.position.z = w * 0.06; g.add(s);
  }
  const plinthTop = y0 + 3 * 0.14;
  // main block behind the portico
  const main = block(fac, w * 0.66, FLOOR * 2.2, w * 0.4, plinthTop, { ei: 0.32 });
  main.position.z = -w * 0.06; g.add(main);
  // colonnade
  const colH = FLOOR * 2.0;
  for (let i = 0; i < 6; i++) {
    const c = cyl(0.09, 0.11, colH, stone, plinthTop, 10);
    c.position.set(-w * 0.28 + i * (w * 0.112), c.position.y, w * 0.22); g.add(c);
  }
  // entablature + pediment slab
  const ent = box(w * 0.7, 0.22, 0.5, stone, plinthTop + colH);
  ent.position.z = w * 0.22; g.add(ent);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.02, w * 0.34, 0.5, 3),
    stone);
  ped.rotation.z = Math.PI / 2; ped.rotation.x = Math.PI / 2;
  ped.position.set(0, plinthTop + colH + 0.42, w * 0.22); shadowed(ped); g.add(ped);
  // attic + low dome
  const attic = box(w * 0.3, 0.5, w * 0.3, stone, plinthTop + FLOOR * 2.2);
  attic.position.z = -w * 0.06; g.add(attic);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(w * 0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0x8fa3b8, { metal: 0.6, rough: 0.35 }));
  dome.position.set(0, plinthTop + FLOOR * 2.2 + 0.5, -w * 0.06); shadowed(dome); g.add(dome);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(accent, { emissive: accent, ei: 1.4 }));
  finial.position.set(0, plinthTop + FLOOR * 2.2 + 0.5 + w * 0.15, -w * 0.06); g.add(finial);
}

function genHabitat(g, w, fac, accent, r, y0) {
  // Three residential towers of varied heights + skybridge + roof gardens.
  const heights = [3 + Math.floor(r() * 2), 4 + Math.floor(r() * 2), 2 + Math.floor(r() * 2)];
  const pos = [[-w * 0.26, -w * 0.16], [w * 0.2, -w * 0.2], [w * 0.02, w * 0.26]];
  const green = mat(0x3f7a4a, { rough: 0.9, metal: 0 });
  const towers = [];
  heights.forEach((fl, i) => {
    const tw = w * (0.24 + r() * 0.05), th = FLOOR * fl;
    const t = block(fac, tw, th, tw, y0, { ei: 0.45 });
    t.position.set(pos[i][0], t.position.y, pos[i][1]); g.add(t); towers.push({ t, tw, th, x: pos[i][0], z: pos[i][1] });
    // roof garden or clutter
    if (r() < 0.6) {
      const garden = box(tw * 0.7, 0.08, tw * 0.7, green, y0 + th);
      garden.position.set(pos[i][0], garden.position.y, pos[i][1]); g.add(garden);
    }
    parapet(g, tw, tw, y0 + th, 0.07, 0.16, pos[i][0], pos[i][1]);
  });
  // skybridge between towers 0 and 1
  const a = towers[0], b = towers[1];
  const bx = (a.x + b.x) / 2, bz = (a.z + b.z) / 2;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const bridge = box(len, 0.32, 0.36, mat(0x2c3e58, { metal: 0.5, rough: 0.3, emissive: accent, ei: 0.35 }), y0 + FLOOR * 2);
  bridge.position.set(bx, bridge.position.y, bz);
  bridge.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  g.add(bridge);
  // courtyard trees (billboard-cheap cones)
  for (let i = 0; i < 3; i++) {
    const tr = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 7), green);
    tr.position.set((r() - 0.5) * w * 0.5, y0 + 0.3, (r() - 0.5) * w * 0.5);
    tr.castShadow = true; g.add(tr);
  }
}

function genDefenseNode(g, w, fac, accent, r, y0) {
  // Compact hardened turret emplacement.
  const base = cyl(w * 0.34, w * 0.42, 0.6, concreteMat(0x8b9099, 0.85), y0, 10);
  g.add(base);
  // armor skirt plates
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const plate = box(0.5, 0.44, 0.08, concreteMat(0x6f747c), y0 + 0.1);
    plate.position.set(Math.cos(a) * w * 0.38, plate.position.y, Math.sin(a) * w * 0.38);
    plate.rotation.y = -a + Math.PI / 2; g.add(plate);
  }
  // turret: ring + armored dome + twin barrels
  const ring = cyl(w * 0.22, w * 0.26, 0.22, mat(0x4a4f58, { metal: 0.6, rough: 0.4 }), y0 + 0.6, 12);
  g.add(ring);
  const turret = new THREE.Group(); turret.position.y = y0 + 0.82; turret.userData.turret = 1;
  const domeM = mat(0x565c66, { metal: 0.65, rough: 0.35 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeM);
  shadowed(dome); turret.add(dome);
  for (const off of [-0.09, 0.09]) {
    const barrel = cyl(0.045, 0.055, 0.9, mat(0x30353e, { metal: 0.7, rough: 0.3 }), 0, 8);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.55, w * 0.08, off);
    turret.add(barrel);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(accent, { emissive: accent, ei: 2.0 }));
  eye.position.set(w * 0.16, w * 0.12, 0); turret.add(eye);
  g.add(turret);
  antenna(g, -w * 0.2, y0 + 0.6, -w * 0.2, 0.9, accent);
}

function genGenericOffice(g, w, fac, accent, r, y0) {
  const h = FLOOR * (2 + Math.floor(r() * 2));
  const main = block(fac, w * 0.62, h, w * 0.5, y0, { ei: 0.38 });
  main.position.set(-w * 0.05, main.position.y, 0); g.add(main);
  parapet(g, w * 0.62, w * 0.5, y0 + h);
  roofClutter(g, r, w * 0.5, w * 0.4, y0 + h, 2);
  const annex = block(fac, w * 0.26, FLOOR * 1.2, w * 0.3, y0, { ei: 0.38 });
  annex.position.set(w * 0.3, annex.position.y, w * 0.12); g.add(annex);
  antenna(g, w * 0.3, y0 + FLOOR * 1.2, w * 0.12, 1.1, accent);
}

// ===========================================================================
// PUBLIC API
// ===========================================================================
// `fc` is the faction descriptor: { color, color2, num, arch } where arch is
// the division's architectural identity from factions.js.
export function buildingMesh(def, fc, seed = 1) {
  const g = new THREE.Group();
  const size = def.size;
  const w = size * TILE;
  const color = fc.color, color2 = fc.color2 || fc.color;
  const arch = fc.arch || {};
  const accent = new THREE.Color(color).getHex();
  const accent2 = new THREE.Color(color2).getHex();
  const accentCss = new THREE.Color(color).getStyle();
  const r = rng32(seed * 2654435761);

  STYLE = {
    num: fc.num || '',
    accent, accent2, accentCss,
    wall: arch.wall || null,
    trim: new THREE.Color(arch.trim || '#9ba0a8').getHex(),
    motif: arch.motif || null,
  };

  const office = makeFacade('office', accentCss, STYLE.wall);
  const glass = makeFacade('glass', accentCss, STYLE.wall);
  const industrial = makeFacade('industrial', accentCss, STYLE.wall);
  const residential = makeFacade('residential', accentCss, STYLE.wall);
  const civic = makeFacade('civic', accentCss, STYLE.wall);

  g.add(foundation(size, accent));
  const y0 = 0.22;

  switch (def.id) {
    case 'hq': genHQ(g, w, office, glass, accent, accent2, r, y0); break;
    case 'data_center': genDataCenter(g, w, industrial, accent, r, y0); break;
    case 'power_node': genPowerNode(g, w, industrial, accent, r, y0); break;
    case 'capital_exchange': genExchange(g, w, office, glass, accent, r, y0); break;
    case 'research_lab': genLab(g, w, office, glass, accent, r, y0); break;
    case 'security_hub': genSecurityHub(g, w, industrial, accent, r, y0); break;
    case 'broadcast': genBroadcast(g, w, office, accent, r, y0); break;
    case 'policy_office': genPolicyOffice(g, w, civic, accent, r, y0); break;
    case 'habitat': genHabitat(g, w, residential, accent, r, y0); break;
    case 'defense_node': genDefenseNode(g, w, industrial, accent, r, y0); break;
    default: genGenericOffice(g, w, office, accent, r, y0); break;
  }

  // Division identity: signature motif + number sign on every building.
  addMotif(g, w, r, y0);
  if (STYLE.num && def.id !== 'defense_node') addSignage(g, w, y0);

  compileStatic(g);
  STYLE = null;
  return g;
}

export function resourceNodeMesh(node) {
  const info = NODE_TYPES[node.type];
  const color = new THREE.Color(info.color).getHex();
  const g = new THREE.Group();
  // rocky outcrop base instead of a machined pad
  const rockM = concreteMat(0x565b63, 0.95);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + Math.random() * 0.5, 0), rockM);
    rock.position.set(Math.cos(a) * 1.3, 0.25, Math.sin(a) * 1.3);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = true; rock.receiveShadow = true;
    g.add(rock);
  }
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.24, 18), rockM);
  pad.position.y = 0.12; pad.receiveShadow = true; g.add(pad);
  const shardMat = mat(color, { emissive: color, ei: 1.3, metal: 0.2, rough: 0.15 });
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
