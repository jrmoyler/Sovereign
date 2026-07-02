// ============================================================================
// GameRenderer — the Three.js hub. Owns scene, camera rig, post-processing,
// terrain, resource-node meshes and all EntityViews. Consumes simulation
// events to spawn/remove views and fire effects; exposes picking helpers.
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { CameraRig } from './CameraRig.js';
import { buildTerrain } from './Terrain.js';
import { resourceNodeMesh } from './ModelFactory.js';
import { EntityView } from './EntityView.js';
import { Effects } from './Effects.js';
import { FACTIONS } from '../data/factions.js';

export class GameRenderer {
  constructor(container, assets) {
    this.container = container;
    this.assets = assets;
    this.views = new Map();       // entityId -> EntityView
    this.nodeMeshes = new Map();  // nodeId -> mesh group
    this.onSfx = null;            // callback(type, payload) for audio

    const w = container.clientWidth, h = container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio = this.renderer.setPixelRatio.bind(this.renderer);
    // cap pixel ratio harder on touch devices — mobile GPUs pay dearly for it
    const isTouch = 'ontouchstart' in window;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 1.75));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.011);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 1200);
    this.rig = new CameraRig(this.camera);

    this._setupLights();
    this.effects = new Effects(this.scene);

    // PBR environment reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // post-processing (bloom)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.65, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._proj = new THREE.Vector3();

    this.factionColors = null;
    this._ghost = null;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
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
    this.scene.add(new THREE.HemisphereLight(0x40567a, 0x0a0e16, 0.65));
    const amb = new THREE.AmbientLight(0x223046, 0.35); this.scene.add(amb);
    const sun = new THREE.DirectionalLight(0xcfe0ff, 1.7);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    const shadowRes = ('ontouchstart' in window) ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowRes, shadowRes);
    const d = 90; const c = sun.shadow.camera;
    c.left = -d; c.right = d; c.top = d; c.bottom = -d; c.near = 1; c.far = 300;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun); this.sun = sun;
    // cool rim light
    const rim = new THREE.DirectionalLight(0x4a7dff, 0.5); rim.position.set(-50, 30, -60); this.scene.add(rim);
  }

  buildWorld(game, rng) {
    this.game = game;
    this.factionColors = game.players.map(p => ({ color: p.color, color2: p.color2 }));
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
          if (ev.ranged) { this.effects.tracer(ev.x, ev.z, ev.tx, ev.tz, new THREE.Color(col).getHex()); this.effects.muzzle(ev.x, ev.z); }
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
    // apply camera shake
    this.camera.position.add(this.effects.shakeVec);
    this.composer.render();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
  }
}
