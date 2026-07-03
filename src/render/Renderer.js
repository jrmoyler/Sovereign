// ============================================================================
// GameRenderer — the Three.js hub. Owns scene, camera rig, post-processing,
// terrain, resource-node meshes and all EntityViews. Consumes simulation
// events to spawn/remove views and fire effects; exposes picking helpers.
//
// Also owns the DAY/NIGHT CYCLE: the match begins in bright daylight and the
// sky sweeps through afternoon, dusk and finally deep night as the leading
// division closes in on Sovereign Intelligence (race progress drives the
// clock, not wall time).
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { CameraRig } from './CameraRig.js';
import { buildTerrain } from './Terrain.js';
import { resourceNodeMesh, setNightFactor } from './ModelFactory.js';
import { EntityView } from './EntityView.js';
import { Effects } from './Effects.js';
import { stackStageProgress } from '../core/Research.js';

// Day/night keyframes, sampled by race progress (0 = match start, 1 = a
// division is activating Sovereign Intelligence). `sunDir` is normalized at
// interpolation time; `night` drives building window/accent emissives.
const SKY_KEYS = [
  { t: 0.00, sunDir: [0.55, 0.95, 0.35], sunCol: 0xfff4e0, sunInt: 2.3, hemiSky: 0xbdd4f2, hemiGround: 0x424a57, hemiInt: 0.95, ambCol: 0x8fa4c0, ambInt: 0.42, bg: 0x9db8da, fog: 0x9db8da, fogDens: 0.0028, ground: 0x424b57, gridOp: 0.14, routeOp: 0.10, edgeInt: 0.25, bloom: 0.15, exposure: 1.12, env: 1.0, night: 0.0 },
  { t: 0.45, sunDir: [-0.25, 0.75, 0.5], sunCol: 0xffe9c4, sunInt: 2.0, hemiSky: 0xa8bede, hemiGround: 0x3d4450, hemiInt: 0.8, ambCol: 0x7d90ac, ambInt: 0.38, bg: 0x8aa2c4, fog: 0x8aa2c4, fogDens: 0.0038, ground: 0x3b4450, gridOp: 0.2, routeOp: 0.18, edgeInt: 0.45, bloom: 0.24, exposure: 1.08, env: 0.85, night: 0.15 },
  { t: 0.70, sunDir: [-0.8, 0.3, 0.55], sunCol: 0xff9a55, sunInt: 1.5, hemiSky: 0x8a6a88, hemiGround: 0x2a2734, hemiInt: 0.6, ambCol: 0x6a5a78, ambInt: 0.34, bg: 0x584a6a, fog: 0x584a6a, fogDens: 0.006, ground: 0x2b2b38, gridOp: 0.32, routeOp: 0.32, edgeInt: 0.8, bloom: 0.42, exposure: 1.05, env: 0.6, night: 0.55 },
  { t: 1.00, sunDir: [0.45, 0.85, -0.5], sunCol: 0x8fa8e8, sunInt: 0.7, hemiSky: 0x40567a, hemiGround: 0x0a0e16, hemiInt: 0.6, ambCol: 0x223046, ambInt: 0.35, bg: 0x05070d, fog: 0x05070d, fogDens: 0.0095, ground: 0x070a12, gridOp: 0.5, routeOp: 0.5, edgeInt: 1.2, bloom: 0.6, exposure: 1.02, env: 0.35, night: 1.0 },
];

export class GameRenderer {
  constructor(container, assets) {
    this.container = container;
    this.assets = assets;
    this.views = new Map();       // entityId -> EntityView
    this.nodeMeshes = new Map();  // nodeId -> mesh group
    this.onSfx = null;            // callback(type, payload) for audio

    const w = container.clientWidth, h = container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Render at (close to) native resolution — the old 1.5/1.75 caps are the
    // main reason everything looked soft, especially on 3x phone screens.
    this.isTouch = 'ontouchstart' in window;
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9db8da);
    this.scene.fog = new THREE.FogExp2(0x9db8da, 0.0045);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 1200);
    this.rig = new CameraRig(this.camera);

    this._setupLights();
    this.effects = new Effects(this.scene);

    // PBR environment reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // Post-processing. The composer renders into an off-screen target which
    // bypasses the canvas's built-in MSAA — request multisampling on the
    // target itself, otherwise the whole frame comes out aliased AND soft.
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.15, 0.45, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._proj = new THREE.Vector3();

    this.factionColors = null;
    this._ghost = null;

    // day/night state (0 = day start, 1 = deep night)
    this.dayPhase = 0;
    this._skyA = { ...SKY_KEYS[0] };   // scratch for interpolation
    this._col = new THREE.Color(); this._col2 = new THREE.Color();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  _pixelRatio() {
    // Native DPR capped at 2 — sharp on 1x/2x monitors and 3x phones alike
    // without tripling the mobile GPU load.
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m.userData?.shared) m.dispose?.(); }); });
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }

  _setupLights() {
    this.hemi = new THREE.HemisphereLight(0xbdd4f2, 0x4a5261, 0.95);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0x8fa4c0, 0.42); this.scene.add(this.amb);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.3);
    sun.position.set(55, 95, 35);
    sun.castShadow = true;
    const shadowRes = this.isTouch ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowRes, shadowRes);
    const d = 90; const c = sun.shadow.camera;
    c.left = -d; c.right = d; c.top = d; c.bottom = -d; c.near = 1; c.far = 300;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun); this.sun = sun;
    // cool rim light
    this.rim = new THREE.DirectionalLight(0x4a7dff, 0.35); this.rim.position.set(-50, 30, -60); this.scene.add(this.rim);
  }

  // ---- day/night cycle ------------------------------------------------------
  // The clock is the race itself: the furthest-progressed division's Sovereign
  // stack completion drives the sky from morning daylight into deep night,
  // with a small time-based drift so the sky never feels frozen early on.
  _raceProgress() {
    if (!this.game) return 0;
    let best = 0;
    for (const p of this.game.players) {
      if (p.defeated) continue;
      best = Math.max(best, (p.stackIndex + stackStageProgress(p)) / 8);
    }
    const drift = Math.min(0.12, (this.game.time / 900) * 0.12);
    return Math.min(1, Math.max(best, drift));
  }

  _sampleSky(t, out) {
    let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (t >= SKY_KEYS[i].t && t <= SKY_KEYS[i + 1].t) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
    }
    const span = Math.max(1e-6, b.t - a.t);
    const k = THREE.MathUtils.smoothstep((t - a.t) / span, 0, 1);
    const L = (x, y) => x + (y - x) * k;
    out.sunDir = [L(a.sunDir[0], b.sunDir[0]), L(a.sunDir[1], b.sunDir[1]), L(a.sunDir[2], b.sunDir[2])];
    out.sunInt = L(a.sunInt, b.sunInt); out.hemiInt = L(a.hemiInt, b.hemiInt);
    out.ambInt = L(a.ambInt, b.ambInt); out.fogDens = L(a.fogDens, b.fogDens);
    out.gridOp = L(a.gridOp, b.gridOp); out.routeOp = L(a.routeOp, b.routeOp);
    out.edgeInt = L(a.edgeInt, b.edgeInt); out.bloom = L(a.bloom, b.bloom);
    out.exposure = L(a.exposure, b.exposure); out.env = L(a.env, b.env);
    out.night = L(a.night, b.night);
    const C = (ca, cb) => this._col.set(ca).lerp(this._col2.set(cb), k).getHex();
    out.sunCol = C(a.sunCol, b.sunCol); out.hemiSky = C(a.hemiSky, b.hemiSky);
    out.hemiGround = C(a.hemiGround, b.hemiGround); out.ambCol = C(a.ambCol, b.ambCol);
    out.bg = C(a.bg, b.bg); out.fog = C(a.fog, b.fog); out.ground = C(a.ground, b.ground);
    return out;
  }

  _updateDayNight(dt) {
    const target = this._raceProgress();
    // ease toward the target so stage completions shift the sky gracefully
    this.dayPhase += (target - this.dayPhase) * Math.min(1, dt * 0.25);
    const s = this._sampleSky(this.dayPhase, this._skyA);

    this.sun.color.set(s.sunCol); this.sun.intensity = s.sunInt;
    this.sun.position.set(s.sunDir[0], s.sunDir[1], s.sunDir[2]).normalize().multiplyScalar(110);
    this.hemi.color.set(s.hemiSky); this.hemi.groundColor.set(s.hemiGround); this.hemi.intensity = s.hemiInt;
    this.amb.color.set(s.ambCol); this.amb.intensity = s.ambInt;
    this.rim.intensity = 0.2 + s.night * 0.35;

    this.scene.background.set(s.bg);
    this.scene.fog.color.set(s.fog); this.scene.fog.density = s.fogDens;
    this.scene.environmentIntensity = s.env;
    this.renderer.toneMappingExposure = s.exposure;
    this.bloom.strength = s.bloom;

    if (this.terrain) {
      this.terrain.groundMat.color.set(s.ground);
      this.terrain.gridMat.opacity = s.gridOp;
      this.terrain.routeMat.opacity = s.routeOp;
      this.terrain.edgeMat.emissiveIntensity = s.edgeInt;
    }
    // building windows / accent lights come alive as night falls
    setNightFactor(s.night);
  }

  buildWorld(game, rng) {
    this.game = game;
    this.factionColors = game.players.map(p => ({
      color: p.color, color2: p.color2,
      num: p.faction.num, arch: p.faction.arch,
    }));
    const t = buildTerrain(this.scene, rng);
    this.terrain = t;
    this.ground = this.scene.children.find(() => false); // set below
    // find ground mesh for picking
    t.group.traverse(o => { if (o.userData && o.userData.pickGround) this.ground = o; });

    for (const node of game.world.nodes) {
      const m = resourceNodeMesh(node);
      m.position.set(node.x, 0, node.z);
      this.scene.add(m);
      this.nodeMeshes.set(node.id, m);
    }
    // create views for initial entities
    for (const b of game.buildings) this._addView(b);
    for (const u of game.units) this._addView(u);
    // focus camera on the human start
    const hp = game.human ? game.human.index : 0;
    const s = game.world.startPositions[hp];
    this.rig.focus(s.x, s.z);
  }

  _addView(entity) {
    const v = new EntityView(entity, { assets: this.assets, factionColors: this.factionColors });
    v.group.userData.entityId = entity.id;
    v.group.traverse(o => { o.userData.entityId = entity.id; });
    this.scene.add(v.group);
    this.views.set(entity.id, v);
    return v;
  }

  // ---- process one frame's simulation events -------------------------------
  handleEvents(events, selectionIds) {
    for (const ev of events) {
      switch (ev.type) {
        case 'spawn': if (!this.views.has(ev.id)) this._addView(ev.entity); break;
        case 'remove': { const v = this.views.get(ev.id); if (v) { this.scene.remove(v.group); v.dispose(); this.views.delete(ev.id); } break; }
        case 'attack': {
          const col = this.factionColors[ev.owner]?.color;
          if (ev.ranged) {
            this.effects.tracer(ev.x, ev.z, ev.tx, ev.tz, new THREE.Color(col).getHex());
            this.effects.muzzle(ev.x, ev.z, new THREE.Color(col).getHex());
          } else {
            this.effects.meleeArc(ev.x, ev.z, ev.tx, ev.tz, new THREE.Color(col).getHex());
          }
          this.effects.floatText(ev.tx, ev.tz, `-${Math.round(ev.dmg)}`, ev.ranged ? '#ffe08a' : '#ff8a7a');
          this.onSfx && this.onSfx(ev.ranged ? 'shoot' : 'melee', ev);
          break;
        }
        case 'impact': this.effects.impact(ev.x, ev.z, ev.ranged); break;
        case 'death':
          if (ev.big) { this.effects.explosion(ev.x, ev.z); this.onSfx && this.onSfx('explosion', ev); }
          else { this.effects.impact(ev.x, ev.z, false); this.onSfx && this.onSfx('death', ev); }
          break;
        case 'gather': if (ev.owner === (this.game.human?.index)) { /* floaters handled below */ } break;
        case 'build_start': { const v = this.views.get(ev.id); if (v) this.effects.ringPulse(v.group.position.x, v.group.position.z, 0x8fd0ff, 4); this.onSfx && this.onSfx('build_start', ev); break; }
        case 'build_complete': { const v = this.views.get(ev.id); if (v) { this.effects.ringPulse(v.group.position.x, v.group.position.z, 0x37e0a0, 5); } this.onSfx && this.onSfx('build_complete', ev); break; }
        case 'sabotage': this.effects.explosion(ev.x, ev.z, 0xff5d6c); this.onSfx && this.onSfx('sabotage', ev); break;
        case 'stage_done': this.onSfx && this.onSfx('stage', ev); break;
        case 'research_done': this.onSfx && this.onSfx('research', ev); break;
        case 'unit_trained': this.onSfx && this.onSfx('trained', ev); break;
      }
    }
  }

  syncEntities(dt) {
    for (const v of this.views.values()) v.update(dt);
    // node depletion visuals
    for (const node of this.game.world.nodes) {
      const m = this.nodeMeshes.get(node.id);
      if (!m) continue;
      const frac = node.amount / node.max;
      if (m.userData.shards) {
        m.userData.shards.scale.y = 0.25 + frac * 0.75;
        m.userData.shards.rotation.y += dt * 0.3;
      }
      if (node.amount <= 0 && m.visible) m.visible = false;
    }
  }

  setSelection(ids) {
    for (const v of this.views.values()) v.setSelected(false);
    for (const id of ids) { const v = this.views.get(id); if (v) v.setSelected(true); }
  }

  // ---- build preview ghost --------------------------------------------------
  showGhost(mesh) { this.hideGhost(); this._ghost = mesh; this.scene.add(mesh); }
  moveGhost(x, z, valid, size) {
    if (!this._ghost) return;
    this._ghost.position.set(x, 0, z);
    this._ghost.traverse(o => { if (o.isMesh && o.material) { o.material.color.set(valid ? 0x37e0a0 : 0xff5d6c); o.material.opacity = 0.5; } });
  }
  hideGhost() { if (this._ghost) { this.scene.remove(this._ghost); this._ghost = null; } }

  // ---- picking -------------------------------------------------------------
  _setNdc(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this._ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    this._ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  }
  groundPoint(clientX, clientY) {
    this._setNdc(clientX, clientY);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }
  pickEntity(clientX, clientY, pxRadius = 22) {
    this._setNdc(clientX, clientY);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this.raycaster.intersectObjects(Array.from(this.views.values()).map(v => v.group), true);
    for (const hit of hits) {
      let o = hit.object;
      while (o) { if (o.userData && o.userData.entityId) return o.userData.entityId; o = o.parent; }
    }
    // Forgiving fallback (essential for skinned meshes + touch): nearest unit
    // by screen-space distance within a small pixel radius.
    const r = this.renderer.domElement.getBoundingClientRect();
    let best = 0, bd = pxRadius * pxRadius;
    for (const v of this.views.values()) {
      const e = v.e;
      if (e.kind !== 'unit' || e.state === 'dead' || !e.selectable) continue;
      this._proj.set(v.group.position.x, 1, v.group.position.z).project(this.camera);
      if (this._proj.z > 1) continue;
      const sx = (this._proj.x * 0.5 + 0.5) * r.width + r.left;
      const sy = (-this._proj.y * 0.5 + 0.5) * r.height + r.top;
      const d = (sx - clientX) ** 2 + (sy - clientY) ** 2;
      if (d < bd) { bd = d; best = e.id; }
    }
    return best;
  }
  pickNode(clientX, clientY) {
    this._setNdc(clientX, clientY);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this.raycaster.intersectObjects(Array.from(this.nodeMeshes.values()), true);
    if (hits.length) {
      for (const [id, m] of this.nodeMeshes) {
        let o = hits[0].object; while (o) { if (o === m) return id; o = o.parent; }
      }
    }
    return 0;
  }
  // units of a given owner whose screen projection lies within an NDC rect
  unitsInRect(x0, y0, x1, y1, owner) {
    const minx = Math.min(x0, x1), maxx = Math.max(x0, x1);
    const miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
    const out = [];
    for (const v of this.views.values()) {
      const e = v.e;
      if (e.kind !== 'unit' || e.owner !== owner || e.state === 'dead' || !e.selectable) continue;
      this._proj.set(e.x, 1, e.z).project(this.camera);
      if (this._proj.x >= minx && this._proj.x <= maxx && this._proj.y >= miny && this._proj.y <= maxy) out.push(e.id);
    }
    return out;
  }
  worldToScreen(x, z) {
    this._proj.set(x, 1, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: (this._proj.x * 0.5 + 0.5) * r.width + r.left, y: (-this._proj.y * 0.5 + 0.5) * r.height + r.top, behind: this._proj.z > 1 };
  }

  render(dt) {
    this.rig.update(dt);
    this.effects.update(dt);
    this._updateDayNight(dt);
    // apply camera shake
    this.camera.position.add(this.effects.shakeVec);
    this.composer.render();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    // DPR can change when a window moves between monitors or the page zooms
    const pr = this._pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }
}
