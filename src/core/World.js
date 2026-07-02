// ============================================================================
// The World: terrain grid, resource nodes and building occupancy.
// Coordinates: world-space is centered on origin, spanning [-SIZE/2, +SIZE/2].
// The grid maps world-space to integer tiles for placement & occupancy.
// ============================================================================

import { MAP } from '../data/constants.js';
import { NODE_TYPES, MAP_GEN } from '../data/balance.js';
import { nextId, dist2 } from './util.js';

export class World {
  constructor(rng) {
    this.rng = rng;
    this.size = MAP.SIZE;
    this.half = MAP.SIZE / 2;
    this.tile = MAP.TILE;
    this.grid = MAP.GRID;
    // occupancy[tileIndex] = building id or 0
    this.occupied = new Int32Array(this.grid * this.grid);
    this.nodes = [];          // resource nodes
    this.startPositions = []; // one per player, world-space {x,z}
  }

  worldToTile(x, z) {
    return {
      tx: Math.floor((x + this.half) / this.tile),
      tz: Math.floor((z + this.half) / this.tile),
    };
  }
  tileToWorld(tx, tz) {
    return {
      x: (tx + 0.5) * this.tile - this.half,
      z: (tz + 0.5) * this.tile - this.half,
    };
  }
  inBounds(tx, tz, size = 1) {
    return tx >= 0 && tz >= 0 && tx + size <= this.grid && tz + size <= this.grid;
  }

  // Can a `size`x`size` footprint be placed with top-left tile (tx,tz)?
  canPlace(tx, tz, size) {
    if (!this.inBounds(tx, tz, size)) return false;
    for (let z = tz; z < tz + size; z++)
      for (let x = tx; x < tx + size; x++)
        if (this.occupied[z * this.grid + x]) return false;
    // keep a small clearance from resource nodes
    const w = this.tileToWorld(tx, tz);
    for (const n of this.nodes)
      if (dist2(w.x, w.z, n.x, n.z) < 9) return false;
    return true;
  }
  setOccupied(tx, tz, size, id) {
    for (let z = tz; z < tz + size; z++)
      for (let x = tx; x < tx + size; x++)
        this.occupied[z * this.grid + x] = id;
  }
  clearOccupied(tx, tz, size) { this.setOccupied(tx, tz, size, 0); }

  // Is a world-space point inside a building footprint? Only the containing
  // tile is tested so buildings block their own cells but leave walkable
  // space right up to their edges (units can path adjacent to gather/build).
  isBlocked(x, z) {
    const { tx, tz } = this.worldToTile(x, z);
    if (tx < 0 || tz < 0 || tx >= this.grid || tz >= this.grid) return false;
    return !!this.occupied[tz * this.grid + tx];
  }

  addNode(type, x, z) {
    const t = NODE_TYPES[type];
    const node = { id: nextId(), type, res: t.res, x, z, amount: t.amount, max: t.amount };
    this.nodes.push(node);
    return node;
  }
  nearestNodeOfRes(res, x, z, maxD = Infinity) {
    let best = null, bd = maxD * maxD;
    for (const n of this.nodes) {
      if (n.amount <= 0 || n.res !== res) continue;
      const d = dist2(x, z, n.x, n.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  nearestNodeAny(x, z, maxD = Infinity) {
    let best = null, bd = maxD * maxD;
    for (const n of this.nodes) {
      if (n.amount <= 0) continue;
      const d = dist2(x, z, n.x, n.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // Generate symmetric start positions on a ring and scatter resource nodes.
  generate(numPlayers) {
    const R = this.half * 0.66;
    for (let i = 0; i < numPlayers; i++) {
      const a = (i / numPlayers) * Math.PI * 2 - Math.PI / 2;
      this.startPositions.push({ x: Math.cos(a) * R, z: Math.sin(a) * R });
    }
    // per-base node rings
    this.startPositions.forEach((p) => {
      const order = [];
      for (const t in MAP_GEN.nodesPerBase)
        for (let k = 0; k < MAP_GEN.nodesPerBase[t]; k++) order.push(t);
      order.forEach((type, idx) => {
        const a = (idx / order.length) * Math.PI * 2 + this.rng() * 0.4;
        const r = MAP_GEN.baseRingRadius + this.rng() * 6;
        this.addNode(type, this.clampX(p.x + Math.cos(a) * r), this.clampX(p.z + Math.sin(a) * r));
      });
    });
    // contested central clusters
    const types = Object.keys(NODE_TYPES);
    for (let c = 0; c < MAP_GEN.neutralClusters; c++) {
      const a = this.rng() * Math.PI * 2, r = this.rng() * this.half * 0.35;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const type = types[Math.floor(this.rng() * types.length)];
      this.addNode(type, this.clampX(cx), this.clampX(cz));
    }
  }
  clampX(v) { const m = this.half - 6; return v < -m ? -m : v > m ? m : v; }
}
