// ============================================================================
// Risk system: periodic events driven by each player's state. Public backlash,
// regulation, poaching, model failure, overload, cyber attack, energy shortage,
// agent misalignment — plus rare positive breakthroughs.
// ============================================================================

import { RISK } from '../data/balance.js';

const TRIGGER_TESTS = {
  lowTrust:    p => p.res.trust < 80,
  highGov:     p => p.res.gov > 400,
  highCompute: p => p.res.compute > 500,
  lowEnergy:   p => p.res.energy < 40 || p.income.energy < 0,
  random:      () => true,
  goodLuck:    () => true,
};

export function updateRisk(game, dt) {
  game.riskTimer -= dt;
  if (game.riskTimer > 0) return;
  game.riskTimer = RISK.checkInterval;

  for (const p of game.players) {
    if (p.defeated) continue;
    rollFor(game, p);
  }
}

function rollFor(game, p) {
  // Build candidate list weighted by whether their trigger condition holds.
  const candidates = [];
  for (const key in RISK.events) {
    const ev = RISK.events[key];
    const test = TRIGGER_TESTS[ev.trigger] || TRIGGER_TESTS.random;
    const active = test(p);
    let weight = ev.kind === 'good' ? 0.5 : (active ? 3 : 0.4);
    candidates.push({ key, ev, weight });
  }
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  // ~55% chance nothing happens on a given roll to avoid spam
  if (game.rng() < 0.45) return;
  let r = game.rng() * total;
  let chosen = candidates[0];
  for (const c of candidates) { if ((r -= c.weight) <= 0) { chosen = c; break; } }
  applyEvent(game, p, chosen.key, chosen.ev);
}

function applyEvent(game, p, key, ev) {
  // Obsidian / counterintel resists cyber attacks; misalignment softened by lattice.
  let effect = { ...ev.effect };
  if (key === 'cyber_attack') {
    const resist = p.getMod('counterIntel', 1);
    for (const k in effect) effect[k] = Math.round(effect[k] / resist);
  }
  if (key === 'misalignment') {
    const coord = p.getMod('agentCoord', 1);
    for (const k in effect) effect[k] = Math.round(effect[k] / coord);
  }
  for (const k in effect) p.res[k] = Math.max(0, (p.res[k] || 0) + effect[k]);

  game.emit({ type: 'risk', owner: p.index, key, ev });
  if (p.isHuman) {
    game.alert(p, ev.kind === 'good' ? 'good' : 'bad', ev.name, ev.desc);
  }
}
