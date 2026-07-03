// ============================================================================
// EntityView — one Object3D per simulation entity. Syncs transform, drives
// skeletal animation for units, procedural meshes for buildings, and shows
// selection rings + health bars.
// ============================================================================

import * as THREE from 'three';
import { buildingMesh } from './ModelFactory.js';

const UP = new THREE.Vector3(0, 1, 0);

// per-model visual scale so the real glTF models read at RTS scale
const MODEL_SCALE = { soldier: 2.1, robot: 1.15 };

const UNIT_VISUALS = {
  worker: { scale: 0.95, backpack: true, tool: 'pick', shoulder: 0x9fb4d8 },
  engineer: { scale: 1.02, backpack: true, tool: 'wrench', shoulder: 0xffb25c, halo: true },
  scout: { scale: 0.78, hover: true, antenna: true, fins: true, emissive: 0x7de0ff },
  security: { scale: 1.08, shield: true, weapon: 'rifle', shoulder: 0x5f8fff },
  robot: { scale: 1.22, heavy: true, horns: true, weapon: 'claws', emissive: 0xff6d6d },
  agent_swarm: { scale: 0.72, hover: true, wings: true, antenna: true, emissive: 0x7d5cff },
  siege_android: { scale: 1.65, heavy: true, horns: true, hammer: true, emissive: 0xff4d4d },
  sentinel: { scale: 1.28, heavy: true, shield: true, antenna: true, emissive: 0x6fd0e0 },
  gridwright: { scale: 1.12, backpack: true, crane: true, tool: 'wrench', emissive: 0x8ad0ff },
  compiler_daemon: { scale: 0.9, hover: true, wings: true, codeCrown: true, emissive: 0x7dff9d },
  terraformer: { scale: 1.05, backpack: true, halo: true, fins: true, emissive: 0x9bd45a },
  relay_warden: { scale: 0.95, antenna: true, dish: true, hover: true, emissive: 0x7dc0ff },
  juggernaut: { scale: 1.55, heavy: true, hammer: true, shoulder: 0xc07d3c, emissive: 0xff9d5c },
  pathfinder: { scale: 0.88, fins: true, antenna: true, hover: true, emissive: 0x7de0e0 },
};

function addUnitKit(root, e, fc) {
  const v = UNIT_VISUALS[e.def.id] || {};
  const accent = new THREE.Color(v.emissive ?? e.def.tint ?? fc.color);
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.65, metalness: 0.45, roughness: 0.38 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x171c26, metalness: 0.7, roughness: 0.42 });
  const add = (mesh, x, y, z, sx=1, sy=1, sz=1) => { mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); root.add(mesh); return mesh; };
  if (v.scale) root.scale.multiplyScalar(v.scale);
  if (v.hover) { add(new THREE.Mesh(new THREE.TorusGeometry(0.42,0.035,8,24), accentMat), 0, 0.42, 0, 1,1,1).rotation.x = Math.PI/2; }
  if (v.backpack) add(new THREE.Mesh(new THREE.BoxGeometry(0.34,0.55,0.18), darkMat), 0, 1.2, -0.28);
  if (v.shoulder || v.heavy) { add(new THREE.Mesh(new THREE.BoxGeometry(0.32,0.18,0.28), accentMat), -0.34, 1.55, 0); add(new THREE.Mesh(new THREE.BoxGeometry(0.32,0.18,0.28), accentMat), 0.34, 1.55, 0); }
  if (v.shield) { const sh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.34,0.08,6), accentMat), -0.55, 1.15, 0.16); sh.rotation.z = Math.PI/2; }
  if (v.weapon === 'rifle') { const gun = add(new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,0.75), darkMat), 0.42, 1.05, 0.36); gun.rotation.x = 0.22; }
  if (v.weapon === 'claws') { for (const x of [-0.38,0.38]) { const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.07,0.42,8), accentMat), x, 0.72, 0.32); c.rotation.x = Math.PI/2; } }
  if (v.tool === 'pick') { const t = add(new THREE.Mesh(new THREE.BoxGeometry(0.08,0.55,0.08), accentMat), 0.42, 0.9, 0.18); t.rotation.z = -0.7; }
  if (v.tool === 'wrench') add(new THREE.Mesh(new THREE.TorusGeometry(0.12,0.025,8,12), accentMat), 0.45, 1.02, 0.2);
  if (v.hammer) { const h = add(new THREE.Mesh(new THREE.BoxGeometry(0.2,0.2,0.65), accentMat), 0.52, 1.0, 0.25); h.rotation.x = 0.55; add(new THREE.Mesh(new THREE.BoxGeometry(0.42,0.28,0.22), accentMat), 0.52, 1.24, 0.52); }
  if (v.antenna) { const mast = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.62,6), accentMat), 0, 2.12, -0.05); add(new THREE.Mesh(new THREE.SphereGeometry(0.08,8,6), accentMat), 0, 2.48, -0.05); }
  if (v.dish) { const d = add(new THREE.Mesh(new THREE.ConeGeometry(0.22,0.12,18,1,true), accentMat), 0, 2.18, 0.1); d.rotation.x = Math.PI/2; }
  if (v.horns) { for (const x of [-0.18,0.18]) { const horn = add(new THREE.Mesh(new THREE.ConeGeometry(0.07,0.32,8), accentMat), x, 2.12, 0.05); horn.rotation.x = -0.35; } }
  if (v.fins || v.wings) { for (const x of [-0.38,0.38]) { const fin = add(new THREE.Mesh(new THREE.ConeGeometry(0.16,0.5,3), accentMat), x, 1.24, -0.18); fin.rotation.z = x < 0 ? 0.8 : -0.8; } }
  if (v.halo || v.codeCrown) { const halo = add(new THREE.Mesh(new THREE.TorusGeometry(0.34,0.025,6,24), accentMat), 0, 2.32, 0); halo.rotation.x = Math.PI/2; halo.userData.pulse = true; }
}


function healthSprite() {
  // 2x backing resolution so bars stay crisp on high-DPI screens
  const c = document.createElement('canvas'); c.width = 128; c.height = 20;
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const s = new THREE.Sprite(mat); s.scale.set(2.4, 0.36, 1);
  s.userData.canvas = c; s.userData.tex = tex; s.userData.frac = -1;
  return s;
}
function drawHealth(sprite, frac, ownerColor) {
  const c = sprite.userData.canvas, ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, 128, 20);
  ctx.fillStyle = ownerColor; ctx.fillRect(2, 2, 8, 16);             // owner tab
  const w = Math.max(0, Math.min(1, frac)) * 112;
  ctx.fillStyle = frac > 0.5 ? '#37e0a0' : frac > 0.25 ? '#ffcf5c' : '#ff5d6c';
  ctx.fillRect(12, 4, w, 12);
  sprite.userData.tex.needsUpdate = true;
  sprite.userData.frac = frac;
}

export class EntityView {
  constructor(entity, ctx) {
    this.e = entity;
    this.ctx = ctx;            // { assets, factionColors:[{color,color2}] }
    this.group = new THREE.Group();
    this.group.position.set(entity.x, 0, entity.z);
    this.selected = false;
    this.dead = false;
    const fc = ctx.factionColors[entity.owner];

    if (entity.kind === 'unit') this._initUnit(entity, fc);
    else this._initBuilding(entity, fc);

    // selection ring
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(entity.kind === 'building' ? entity.size * 1.4 : 0.9, entity.kind === 'building' ? entity.size * 1.4 + 0.3 : 1.2, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.12;
    this.group.add(this.ring);

    // health bar
    this.hbar = healthSprite();
    this.hbar.position.y = entity.kind === 'building' ? entity.size * 2.4 : 2.6;
    this.hbar.visible = false;
    this.group.add(this.hbar);
    this.ownerColorHex = fc.color;
  }

  _initUnit(e, fc) {
    // Blend the unit's role tint with the owning division's color (division-
    // dominant) so armies read as their faction at a glance while roles stay
    // distinguishable within it.
    const tint = e.def.tint
      ? '#' + new THREE.Color(e.def.tint).lerp(new THREE.Color(fc.color), 0.62).getHexString()
      : fc.color;
    const inst = this.ctx.assets.instance(e.def.model, tint);
    inst.root.scale.setScalar(MODEL_SCALE[e.def.model] || 1.4);
    // specialist / combat units read a bit larger
    if (e.def.class === 'combat') inst.root.scale.multiplyScalar(1.12);
    addUnitKit(inst.root, e, fc);
    this.group.add(inst.root);
    this.mixer = inst.mixer; this.actions = inst.actions; this.root = inst.root;
    this.curAnim = null;
    this._play('idle', true);
    // faction pip above head — primary color diamond with a secondary ring so
    // divisions with similar primaries still read apart
    const pip = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), new THREE.MeshBasicMaterial({ color: fc.color }));
    pip.position.y = 2.35; this.group.add(pip);
    const pipRing = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.035, 6, 16),
      new THREE.MeshBasicMaterial({ color: fc.color2 || fc.color }));
    pipRing.rotation.x = Math.PI / 2; pipRing.position.y = 2.35; this.group.add(pipRing);
  }

  _initBuilding(e, fc) {
    this.mesh = buildingMesh(e.def, fc, e.id);
    this.group.add(this.mesh);
    this.spinners = [];
    this.mesh.traverse(o => { if (o.userData && (o.userData.spin || o.userData.pulse || o.userData.turret)) this.spinners.push(o); });
    // construction: start squashed and rise as it builds
    if (e.state === 'construct') this.mesh.scale.y = 0.05;
  }

  _play(hint, immediate = false) {
    if (!this.actions) return;
    const act = this.actions[hint] || this.actions.idle;
    if (!act || act === this.curAnim) return;
    const prev = this.curAnim;
    this.curAnimHint = hint;
    if (hint === 'die') { act.clampWhenFinished = true; act.loop = THREE.LoopOnce; }
    act.reset();
    act.enabled = true; act.setEffectiveWeight(1);
    act.play();
    if (prev && !immediate) { prev.crossFadeTo(act, 0.2, false); }
    else if (prev) prev.stop();
    this.curAnim = act;
  }

  setSelected(on) {
    this.selected = on;
    this.ring.material.opacity = on ? 0.9 : 0;
    this.ring.material.color.set(on ? this.ownerColorHex : 0xffffff);
  }

  update(dt) {
    const e = this.e;
    // smooth transform
    this.group.position.x += (e.x - this.group.position.x) * Math.min(1, dt * 14);
    this.group.position.z += (e.z - this.group.position.z) * Math.min(1, dt * 14);

    if (e.kind === 'unit') {
      // rotation slerp
      const cur = this.group.rotation.y;
      let d = e.rot - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.group.rotation.y = cur + d * Math.min(1, dt * 12);
      this.mixer && this.mixer.update(dt);
      this.root?.traverse(o => { if (o.userData?.pulse) o.rotation.z += dt * 1.8; });
      if (e.state === 'dead') {
        if (!this.dead) { this.dead = true; this._play('die'); }
        // sink & fade
        this.group.position.y -= dt * 0.6;
        this.group.scale.multiplyScalar(1 - dt * 0.5);
      } else {
        this._play(e.animHint || 'idle');
        // working/gathering bob
        if (e.animHint === 'work') this.group.position.y = Math.abs(Math.sin(performance.now() * 0.012)) * 0.12;
        else this.group.position.y = 0;
      }
    } else {
      // building construction rise
      if (e.state === 'construct') {
        const target = Math.max(0.05, e.buildProgress);
        this.mesh.scale.y += (target - this.mesh.scale.y) * Math.min(1, dt * 4);
      } else if (e.state === 'dead') {
        if (!this.dead) { this.dead = true; }
        this.group.position.y -= dt * 2.5;
        this.group.scale.multiplyScalar(1 - dt * 1.5);
      } else {
        this.mesh.scale.y += (1 - this.mesh.scale.y) * Math.min(1, dt * 4);
      }
      // animate glowing bits
      for (const o of this.spinners || []) {
        if (o.userData.spin) o.rotation.y += dt * o.userData.spin;
        if (o.userData.pulse) o.scale.setScalar(1 + Math.sin(performance.now() * 0.004) * 0.12);
      }
    }

    // health bar
    const frac = e.hp / e.maxHp;
    const show = !this.dead && (this.selected || frac < 0.98);
    this.hbar.visible = show;
    if (show && Math.abs(frac - this.hbar.userData.frac) > 0.02) drawHealth(this.hbar, frac, this.ownerColorHex);

    // hit flash
    if (e.flash > 0 && this.root) { /* subtle scale punch */ }
  }

  dispose() {
    this.group.traverse(o => {
      o.geometry?.dispose?.();
      if (o.material) {
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (m.userData?.shared) continue; // cached building materials outlive views
          m.dispose?.();
        }
      }
    });
  }
}
