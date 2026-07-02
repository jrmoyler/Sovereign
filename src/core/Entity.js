// ============================================================================
// Entity factories for units and buildings. Entities are plain simulation
// state objects (no rendering). The render layer reads x/z/rot/state to draw.
// ============================================================================

import { nextId } from './util.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';

export function makeUnit(defId, owner, x, z) {
  const def = UNITS[defId];
  return {
    id: nextId(), kind: 'unit', defId, def, owner: owner.index,
    x, z, rot: Math.random() * Math.PI * 2, vx: 0, vz: 0,
    hp: def.hp, maxHp: def.hp, speed: def.speed,
    state: 'idle',               // idle|move|gather|return|build|attack|dead
    goal: null,                  // { x, z }
    targetId: 0,                 // entity being attacked/interacted
    attackMove: false,
    gatherRes: null, carry: 0, carryRes: null, homeNode: 0,
    buildId: 0,                  // building being constructed
    cd: 0,                       // attack cooldown
    animHint: 'idle',            // hint for render: idle|walk|run|work|attack|die
    dieTimer: 0,
    flash: 0,
    selectable: true,
  };
}

export function makeBuilding(defId, owner, tx, tz, world, instant = false) {
  const def = BUILDINGS[defId];
  const c = world.tileToWorld(tx, tz);
  const center = {
    x: c.x + ((def.size - 1) * world.tile) / 2,
    z: c.z + ((def.size - 1) * world.tile) / 2,
  };
  const b = {
    id: nextId(), kind: 'building', defId, def, owner: owner.index,
    tx, tz, size: def.size, x: center.x, z: center.z,
    hp: instant ? def.hp : Math.floor(def.hp * 0.12),
    maxHp: def.hp,
    state: instant ? 'ready' : 'construct',
    buildProgress: instant ? 1 : 0,
    queue: [],                   // production queue: [{ defId, progress, time }]
    rally: null,                 // { x, z }
    genPartial: {},              // fractional resource accumulation
    cd: 0,                       // defensive weapon cooldown
    researchNode: !!def.researchNode,
    flash: 0,
    selectable: true,
  };
  world.setOccupied(tx, tz, def.size, b.id);
  return b;
}
