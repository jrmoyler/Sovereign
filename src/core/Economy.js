// ============================================================================
// Economy: passive resource generation from buildings, energy gating, supply.
// Worker gathering is handled in Game (per-unit), but credited here helpers.
// ============================================================================

import { RES } from '../data/constants.js';

// map resource key -> the faction/tech mod that scales its generation rate
const RATE_MOD = {
  compute: 'computeGather', data: 'dataGather', talent: 'talentGather',
  capital: 'capitalRate', trust: 'trustRate', infra: 'infraRate',
  energy: 'energyGather', gov: 'govRate',
};
const ENERGY_CONSUMPTION = 1.5; // per energy-dependent building, per second

export function updateEconomy(game, dt) {
  for (const p of game.players) {
    if (p.defeated) continue;
    const income = Object.fromEntries(RES.map(r => [r, 0]));

    // First pass: does this player have positive energy headroom?
    const hasEnergy = p.res.energy > 4;
    const adoption = p.getMod('adoption', 1);

    for (const b of game.buildings) {
      if (b.owner !== p.index || b.state !== 'ready') continue;
      const def = b.def;
      const energyFactor = def.needsEnergy ? (hasEnergy ? 1 : 0.4) : 1;
      if (def.needsEnergy) income.energy -= ENERGY_CONSUMPTION;
      if (def.generates) {
        for (const r in def.generates) {
          const rateMod = p.getMod(RATE_MOD[r] || '_none', 1);
          income[r] += def.generates[r] * rateMod * energyFactor * adoption;
        }
      }
    }

    // Support units that generate resources (media, legal, market_maker, ...)
    for (const u of game.units) {
      if (u.owner !== p.index || u.state === 'dead' || !u.def.generates) continue;
      for (const r in u.def.generates) {
        const rateMod = p.getMod(RATE_MOD[r] || '_none', 1);
        income[r] += u.def.generates[r] * rateMod * adoption;
      }
    }

    // Commit income
    for (const r of RES) {
      p.res[r] = Math.max(0, p.res[r] + income[r] * dt);
      p.income[r] = income[r]; // instantaneous rate for HUD (gather adds shown separately)
    }
    p.res.trust = Math.min(p.res.trust, 2000);
  }
}

// Recompute supply cap/used for a player from live entities.
export function recomputeSupply(game, p) {
  let cap = 0, used = 0;
  for (const b of game.buildings)
    if (b.owner === p.index && b.state === 'ready' && b.def.supply) cap += b.def.supply;
  for (const u of game.units)
    if (u.owner === p.index && u.state !== 'dead') used += (u.def.supply || 1);
  p.supplyCap = cap;
  p.supplyUsed = used;
}

// Credit a completed gather trip (called from Game on deposit).
export function creditGather(game, p, res, amount) {
  const rateMod = p.getMod(RATE_MOD[res] || '_none', 1) * p.getMod('adoption', 1);
  p.res[res] += amount * rateMod;
  game.emit({ type: 'gather', owner: p.index, res, amount: amount * rateMod });
}
