// ============================================================================
// Game — the simulation orchestrator. Fully decoupled from render & DOM.
// Owns the world, players and entities; runs a fixed-timestep update; exposes
// a command API for the UI and an event stream for render/audio.
// ============================================================================

import { World } from './World.js';
import { Player } from './Player.js';
import { makeUnit, makeBuilding } from './Entity.js';
import { updateEconomy, recomputeSupply, creditGather } from './Economy.js';
import { updateResearch, canResearch, startResearch } from './Research.js';
import { updateCombat } from './Combat.js';
import { updateRisk } from './Risk.js';
import { doAction, canDoAction } from './Actions.js';
import { updateAI } from '../ai/RivalAI.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { TECHS } from '../data/tech.js';
import { START_UNITS } from '../data/balance.js';
import { makeRng, canAfford, spend, dist, dist2, clamp } from './util.js';

const CARRY_CAP = 10;

export class Game {
  constructor(config) {
    // config = { factions:[{id,isHuman}], seed }
    this.rng = makeRng(config.seed || 20260702);
    this.world = new World(this.rng);
    this.dt = 1 / 20;
    this.time = 0;
    this.over = false;
    this.winner = null;
    this.events = [];
    this.riskTimer = 5;
    this.allianceTimers = [];

    this.players = config.factions.map((f, i) => new Player(i, f.id, !!f.isHuman));
    this.human = this.players.find(p => p.isHuman) || null;

    this.units = [];
    this.buildings = [];
    this._byId = new Map();

    this.world.generate(this.players.length);
    this._spawnStarts();
    this.players.forEach(p => recomputeSupply(this, p));
  }

  _spawnStarts() {
    this.players.forEach((p, i) => {
      const s = this.world.startPositions[i];
      // HQ
      const { tx, tz } = this.world.worldToTile(s.x, s.z);
      const hq = makeBuilding('hq', p, tx - 1, tz - 1, this.world, true);
      this.register(hq);
      // starting workers
      const n = START_UNITS.worker;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const u = makeUnit('worker', p, s.x + Math.cos(a) * 6, s.z + Math.sin(a) * 6);
        this.register(u);
        this.autoGather(u);
      }
    });
  }

  // ---- registry -----------------------------------------------------------
  register(e) {
    this._byId.set(e.id, e);
    if (e.kind === 'unit') this.units.push(e); else this.buildings.push(e);
    this.emit({ type: 'spawn', kind: e.kind, id: e.id, entity: e });
    return e;
  }
  entity(id) { return this._byId.get(id); }

  // ---- event stream -------------------------------------------------------
  emit(ev) { this.events.push(ev); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  alert(p, kind, title, desc) {
    if (!p || !p.isHuman) return;
    this.emit({ type: 'alert', kind, title, desc });
  }

  // =========================================================================
  // MAIN UPDATE (one fixed sim tick)
  // =========================================================================
  update(dt) {
    if (this.over) return;
    this.dt = dt; this.time += dt;
    updateEconomy(this, dt);
    this._updateUnits(dt);
    this._updateProduction(dt);
    updateResearch(this, dt);
    updateCombat(this, dt);
    updateRisk(this, dt);
    for (const p of this.players) if (!p.isHuman && !p.defeated) updateAI(this, p, dt);
    this._updateDiplomacy(dt);
    this._cleanup(dt);
    for (const p of this.players) recomputeSupply(this, p);
    this._decayActionCooldowns(dt);
  }

  _decayActionCooldowns(dt) {
    for (const p of this.players) {
      for (const k in p.actionCd) if (p.actionCd[k] > 0) p.actionCd[k] = Math.max(0, p.actionCd[k] - dt);
      p.updateTempMods(dt);
    }
  }

  // interaction reach to a building = footprint half-extent + a small margin
  buildingReach(b) { return (b.size * this.world.tile) / 2 + 1.7; }

  // ---- movement helper ----------------------------------------------------
  stepToward(u, stopDist = 0.35) {
    if (!u.goal) { u.vx = 0; u.vz = 0; return true; }
    const dx = u.goal.x - u.x, dz = u.goal.z - u.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopDist) { u.vx = 0; u.vz = 0; return true; }
    const spd = u.speed * this.players[u.owner].getMod('unitSpeed', 1);
    let nx = dx / d, nz = dz / d;
    // local separation from same-owner units
    let sx = 0, sz = 0;
    for (const o of this.units) {
      if (o === u || o.state === 'dead' || o.owner !== u.owner) continue;
      const ddx = u.x - o.x, ddz = u.z - o.z, dd = ddx * ddx + ddz * ddz;
      if (dd < 2.4 && dd > 1e-4) { const inv = 1 / Math.sqrt(dd); sx += ddx * inv; sz += ddz * inv; }
    }
    nx += sx * 0.45; nz += sz * 0.45;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const step = spd * this.dt;
    let px = u.x + nx * step, pz = u.z + nz * step;
    if (this.world.isBlocked(px, pz)) {
      if (!this.world.isBlocked(px, u.z)) pz = u.z;
      else if (!this.world.isBlocked(u.x, pz)) px = u.x;
      else { px = u.x; pz = u.z; }
    }
    const half = this.world.half - 2;
    u.x = clamp(px, -half, half); u.z = clamp(pz, -half, half);
    u.vx = nx * spd; u.vz = nz * spd;
    u.rot = Math.atan2(nx, nz);
    u.animHint = spd > 9.5 ? 'run' : 'walk';
    return false;
  }

  // ---- unit state machine -------------------------------------------------
  _updateUnits(dt) {
    for (const u of this.units) {
      if (u.state === 'dead') { u.dieTimer -= dt; continue; }
      if (u.flash > 0) u.flash -= dt;

      switch (u.state) {
        case 'idle': u.vx = 0; u.vz = 0; if (u.animHint === 'walk' || u.animHint === 'run') u.animHint = 'idle'; break;
        case 'move': if (this.stepToward(u, u.stopDist || 0.4)) { u.state = 'idle'; u.animHint = 'idle'; } break;
        case 'gather': this._gather(u, dt); break;
        case 'return': this._return(u, dt); break;
        case 'build': this._build(u, dt); break;
        case 'attack': /* handled by Combat */ break;
      }
    }
  }

  autoGather(u) {
    if (!u.def.gather) return;
    const node = this.world.nearestNodeAny(u.x, u.z, 40);
    if (node) { u.state = 'gather'; u.homeNode = node.id; u.gatherRes = node.res; }
  }

  _gather(u, dt) {
    let node = this._node(u.homeNode);
    if (!node || node.amount <= 0) {
      node = this.world.nearestNodeOfRes(u.gatherRes, u.x, u.z, 60) || this.world.nearestNodeAny(u.x, u.z, 60);
      if (!node) { u.state = 'idle'; return; }
      u.homeNode = node.id; u.gatherRes = node.res;
    }
    u.goal = { x: node.x, z: node.z };
    const d = dist(u.x, u.z, node.x, node.z);
    if (d > 2.2) { this.stepToward(u, 2.0); return; }
    // harvest
    u.vx = 0; u.vz = 0; u.animHint = 'work';
    u.rot = Math.atan2(node.x - u.x, node.z - u.z);
    const rate = u.def.gatherRate * dt;
    const got = Math.min(rate, node.amount, CARRY_CAP - u.carry);
    node.amount -= got; u.carry += got; u.carryRes = node.res;
    if (node.amount <= 0) this.emit({ type: 'node_depleted', id: node.id });
    if (u.carry >= CARRY_CAP - 0.01) u.state = 'return';
  }

  _return(u, dt) {
    const dp = this._nearestDropoff(u);
    if (!dp) { u.state = 'gather'; return; }
    u.goal = { x: dp.x, z: dp.z };
    const reach = this.buildingReach(dp);
    if (dist(u.x, u.z, dp.x, dp.z) > reach) { this.stepToward(u, reach - 0.4); u.animHint = 'walk'; return; }
    // deposit
    creditGather(this, this.players[u.owner], u.carryRes, u.carry);
    u.carry = 0;
    u.state = 'gather';
  }

  _build(u, dt) {
    const b = this.entity(u.buildId);
    if (!b || b.state !== 'construct') { u.buildId = 0; u.state = 'idle'; this.autoGather(u); return; }
    u.goal = { x: b.x, z: b.z };
    const reach = this.buildingReach(b);
    if (dist(u.x, u.z, b.x, b.z) > reach) { this.stepToward(u, reach - 0.4); return; }
    u.vx = 0; u.vz = 0; u.animHint = 'work';
    u.rot = Math.atan2(b.x - u.x, b.z - u.z);
    const p = this.players[u.owner];
    const spd = p.getMod('buildSpeed', 1) * (u.def.buildSpeedMul || 1);
    b.buildProgress = Math.min(1, b.buildProgress + (dt / b.def.buildTime) * spd);
    b.hp = Math.max(b.hp, Math.floor(b.maxHp * (0.12 + 0.88 * b.buildProgress)));
    if (b.buildProgress >= 1) {
      b.state = 'ready'; b.hp = b.maxHp;
      this.emit({ type: 'build_complete', id: b.id, owner: b.owner });
      if (p.isHuman) this.alert(p, 'good', 'Construction Complete', `${b.def.name} online.`);
      u.buildId = 0; u.state = 'idle';
      // roll straight onto the nearest unattended construction site
      const next = this._nearestUnattendedSite(u);
      if (next) { u.buildId = next.id; u.state = 'build'; }
      else this.autoGather(u);
    }
  }

  _nearestUnattendedSite(u) {
    const attended = new Set();
    for (const o of this.units) if (o.state === 'build' && o.buildId) attended.add(o.buildId);
    let best = null, bd = 45 * 45;
    for (const b of this.buildings) {
      if (b.owner !== u.owner || b.state !== 'construct' || attended.has(b.id)) continue;
      const d = dist2(u.x, u.z, b.x, b.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  _node(id) { return this.world.nodes.find(n => n.id === id); }
  _nearestDropoff(u) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (b.owner !== u.owner || b.state !== 'ready' || !b.def.dropoff) continue;
      const d = dist2(u.x, u.z, b.x, b.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---- production ---------------------------------------------------------
  _updateProduction(dt) {
    for (const b of this.buildings) {
      if (b.state !== 'ready' || !b.queue.length) continue;
      const p = this.players[b.owner];
      const item = b.queue[0];
      const def = UNITS[item.defId];
      const isCombat = def.class === 'combat';
      const trainMul = isCombat ? p.getMod('robotTrain', 1) : 1;
      item.progress += dt * trainMul;
      if (item.progress >= item.time) {
        // supply gate at spawn time
        if (p.supplyUsed + (def.supply || 1) > p.supplyCap) { item.progress = item.time; continue; }
        b.queue.shift();
        this._spawnTrained(b, def.id);
      }
    }
  }

  _spawnTrained(b, defId) {
    const p = this.players[b.owner];
    const angle = this.rng() * Math.PI * 2;
    const rx = b.x + Math.cos(angle) * (b.size + 1.5);
    const rz = b.z + Math.sin(angle) * (b.size + 1.5);
    const u = makeUnit(defId, p, rx, rz);
    this.register(u);
    recomputeSupply(this, p);
    if (b.rally) { u.goal = { ...b.rally }; u.state = 'move'; }
    else if (u.def.gather) this.autoGather(u);
    this.emit({ type: 'unit_trained', id: u.id, owner: p.index });
  }

  // =========================================================================
  // COMMAND API (called by UI / AI)
  // =========================================================================
  selectableAt() { /* selection handled in render via projection */ }

  commandMove(ids, x, z, attackMove = false) {
    const pts = this._formation(ids.length, x, z);
    ids.forEach((id, i) => {
      const u = this.entity(id);
      if (!u || u.kind !== 'unit' || u.state === 'dead') return;
      u.goal = { x: pts[i].x, z: pts[i].z };
      u.state = 'move'; u.targetId = 0; u.buildId = 0;
      u.attackMove = attackMove;
      u.stopDist = 0.4;
    });
  }
  commandAttack(ids, targetId) {
    const t = this.entity(targetId);
    if (!t) return;
    ids.forEach(id => {
      const u = this.entity(id);
      if (!u || u.kind !== 'unit' || u.state === 'dead' || !u.def.dmg) return;
      u.targetId = targetId; u.state = 'attack'; u.attackMove = true;
    });
  }
  commandGather(ids, nodeId) {
    const node = this._node(nodeId);
    if (!node) return;
    ids.forEach(id => {
      const u = this.entity(id);
      if (!u || !u.def.gather || u.state === 'dead') return;
      u.state = 'gather'; u.homeNode = nodeId; u.gatherRes = node.res; u.carry = 0;
    });
  }

  _formation(n, cx, cz) {
    const pts = []; const per = Math.ceil(Math.sqrt(n)); const gap = 2.2;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / per), c = i % per;
      pts.push({ x: cx + (c - per / 2) * gap, z: cz + (r - per / 2) * gap });
    }
    return pts;
  }

  // placement validity for the build preview
  canBuildAt(defId, worldX, worldZ, ownerIndex) {
    const def = BUILDINGS[defId];
    const { tx, tz } = this.world.worldToTile(worldX, worldZ);
    const t0x = tx - Math.floor(def.size / 2), t0z = tz - Math.floor(def.size / 2);
    return { ok: this.world.canPlace(t0x, t0z, def.size), tx: t0x, tz: t0z };
  }

  // start construction using a chosen worker (or nearest worker)
  commandBuild(ownerIndex, defId, worldX, worldZ, builderIds) {
    const p = this.players[ownerIndex];
    const def = BUILDINGS[defId];
    if (!canAfford(p.res, def.cost)) { this.alert(p, 'warn', 'Insufficient Resources', `Cannot afford ${def.name}.`); return false; }
    const place = this.canBuildAt(defId, worldX, worldZ, ownerIndex);
    if (!place.ok) { this.alert(p, 'warn', 'Blocked', 'Cannot build there.'); return false; }
    spend(p.res, def.cost);
    const b = makeBuilding(defId, p, place.tx, place.tz, this.world, false);
    this.register(b);
    // assign builders
    let builders = (builderIds || []).map(id => this.entity(id)).filter(u => u && u.def.canBuild && u.state !== 'dead');
    if (!builders.length) {
      const w = this._nearestBuilder(ownerIndex, b.x, b.z);
      if (w) builders = [w];
    }
    builders.forEach(u => { u.buildId = b.id; u.state = 'build'; });
    this.emit({ type: 'build_start', id: b.id, owner: ownerIndex });
    return true;
  }
  // Prefer workers that aren't already constructing something — stealing an
  // active builder would leave its site abandoned forever.
  _nearestBuilder(owner, x, z) {
    let best = null, bd = Infinity, bestBusy = null, bdBusy = Infinity;
    for (const u of this.units) {
      if (u.owner !== owner || !u.def.canBuild || u.state === 'dead') continue;
      const d = dist2(u.x, u.z, x, z);
      if (u.state === 'build') { if (d < bdBusy) { bdBusy = d; bestBusy = u; } }
      else if (d < bd) { bd = d; best = u; }
    }
    return best || bestBusy;
  }

  // queue a unit at a building
  commandTrain(buildingId, defId) {
    const b = this.entity(buildingId);
    if (!b || b.state !== 'ready') return false;
    const p = this.players[b.owner];
    const def = UNITS[defId];
    if (!b.def.trains?.includes(defId)) return false;
    if (def.faction && def.faction !== p.factionId) return false;
    if (def.requiresTech && !p.researched.has(def.requiresTech) && !p.unlocked.has(defId)) {
      this.alert(p, 'warn', 'Locked', `${def.name} requires research.`); return false;
    }
    if (p.supplyUsed + this._queuedSupply(p) + (def.supply || 1) > p.supplyCap) {
      this.alert(p, 'warn', 'Supply Capped', 'Build a Security Hub or Habitat to raise supply.'); return false;
    }
    if (!canAfford(p.res, def.cost)) { this.alert(p, 'warn', 'Insufficient Resources', `Cannot afford ${def.name}.`); return false; }
    spend(p.res, def.cost);
    b.queue.push({ defId, progress: 0, time: def.buildTime });
    return true;
  }
  // total supply already committed to production queues for a player
  _queuedSupply(p) {
    let s = 0;
    for (const b of this.buildings) {
      if (b.owner !== p.index) continue;
      for (const item of b.queue) s += UNITS[item.defId].supply || 1;
    }
    return s;
  }

  commandSetRally(buildingId, x, z) {
    const b = this.entity(buildingId);
    if (b && b.kind === 'building') b.rally = { x, z };
  }
  commandResearch(ownerIndex, techId) {
    const p = this.players[ownerIndex];
    if (!canResearch(this, p, techId)) return false;
    const t = TECHS_COST(techId);
    if (!canAfford(p.res, t)) { this.alert(p, 'warn', 'Insufficient Resources', 'Cannot afford research.'); return false; }
    spend(p.res, t);
    startResearch(this, p, techId);
    return true;
  }
  commandAction(ownerIndex, actionId) {
    return doAction(this, this.players[ownerIndex], actionId);
  }
  canAction(ownerIndex, actionId) { return canDoAction(this, this.players[ownerIndex], actionId); }

  // ---- diplomacy / cleanup / win ------------------------------------------
  _updateDiplomacy(dt) {
    for (let i = this.allianceTimers.length - 1; i >= 0; i--) {
      const at = this.allianceTimers[i];
      at.t -= dt;
      if (at.t <= 0) {
        this.players[at.a]?.allies.delete(at.b);
        this.players[at.b]?.allies.delete(at.a);
        this.emit({ type: 'alliance', a: at.a, b: at.b, formed: false });
        if (this.players[at.a]?.isHuman || this.players[at.b]?.isHuman)
          this.alert(this.human, 'warn', 'Alliance Ended', 'A non-aggression pact has expired.');
        this.allianceTimers.splice(i, 1);
      }
    }
  }

  _cleanup(dt) {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.state === 'dead' && u.dieTimer <= 0) {
        this._byId.delete(u.id); this.units.splice(i, 1);
        this.emit({ type: 'remove', kind: 'unit', id: u.id });
      }
    }
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (b.state === 'dead') {
        b.dieTimer -= dt;
        if (b.dieTimer <= 0) {
          this._byId.delete(b.id); this.buildings.splice(i, 1);
          this.emit({ type: 'remove', kind: 'building', id: b.id });
        }
      }
    }
  }

  checkElimination(ownerIndex) {
    const p = this.players[ownerIndex];
    if (p.defeated) return;
    const hasBuildings = this.buildings.some(b => b.owner === ownerIndex && b.state !== 'dead');
    if (!hasBuildings) {
      p.defeated = true;
      this.emit({ type: 'eliminated', owner: ownerIndex });
      if (p.isHuman) this.declareWinner(null, 'defeat');
      else {
        this.alert(this.human, 'good', 'Rival Eliminated', `${p.faction.name} has fallen.`);
        this._checkLastStanding();
      }
    }
  }
  _checkLastStanding() {
    const alive = this.players.filter(p => !p.defeated);
    if (alive.length === 1 && !this.over) this.declareWinner(alive[0], 'conquest');
  }

  declareWinner(p, mode = 'sovereign') {
    if (this.over) return;
    this.over = true; this.winner = p;
    this.emit({ type: 'gameover', winner: p ? p.index : -1, mode, human: this.human ? this.human.index : -1 });
  }
}

function TECHS_COST(id) { return TECHS[id]?.cost || {}; }
