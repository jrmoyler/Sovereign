// ============================================================================
// Rival faction AI. Personality-driven economic + military behaviour that
// races toward the Sovereign Intelligence stack, expands, builds an army,
// attacks, sabotages and forms opportunistic alliances.
//
// Personality (faction.ai): aggression, expansion, economy, research,
// sabotage, diplomacy — each 0..1, weighting the decision it governs.
// ============================================================================

import { BUILDINGS } from '../data/buildings.js';
import { UNITS } from '../data/units.js';
import { techsFor } from '../data/tech.js';
import { SOVEREIGN_STACK } from '../data/constants.js';
import { AI } from '../data/balance.js';
import { canResearch } from '../core/Research.js';
import { canDoAction } from '../core/Actions.js';
import { canAfford } from '../core/util.js';

// Building priority templates keyed by the resource a stack stage needs.
const RES_BUILDING = {
  compute: 'data_center', data: 'data_center', energy: 'power_node',
  talent: 'habitat', capital: 'capital_exchange', trust: 'broadcast',
  gov: 'policy_office', infra: 'power_node',
};

export function updateAI(game, p, dt) {
  if (!p.aiState) p.aiState = { timer: 1 + p.index * 0.3, army: [], attacking: false, rally: null };
  const st = p.aiState;
  st.timer -= dt;
  if (st.timer > 0) return;
  st.timer = AI.decisionInterval;

  const persona = p.faction.ai;
  const hq = game.buildings.find(b => b.owner === p.index && b.def.isHQ && b.state === 'ready');
  if (!hq) return;

  applyHandicap(p, dt);
  manageWorkers(game, p, hq);
  manageResearch(game, p, persona);   // research claims capital before buildings drain it
  manageBuildings(game, p, hq, persona);
  manageArmy(game, p, hq, persona);
  manageActions(game, p, persona);
  manageMilitary(game, p, persona);
}

// Give AI a gentle economy trickle so it stays competitive without micro.
function applyHandicap(p, dt) {
  const stage = SOVEREIGN_STACK[p.stackIndex];
  if (!stage) return;
  for (const r in stage.need) {
    // nudge the needed resource so the AI keeps pace toward its next stage
    p.res[r] += 3.4 * AI.handicap * dt;
  }
}

function count(game, p, defId) {
  return game.buildings.filter(b => b.owner === p.index && b.defId === defId && b.state !== 'dead').length;
}
function unitCount(game, p, cls) {
  return game.units.filter(u => u.owner === p.index && u.state !== 'dead' && (!cls || u.def.class === cls)).length;
}

function manageWorkers(game, p, hq) {
  const workers = unitCount(game, p, 'worker');
  const target = 10;
  if (workers < target && hq.queue.length === 0 && canAfford(p.res, UNITS.worker.cost) &&
      p.supplyUsed < p.supplyCap) {
    game.commandTrain(hq.id, 'worker');
  }
}

function manageBuildings(game, p, hq, persona) {
  // don't spam construction
  const underConstruction = game.buildings.filter(b => b.owner === p.index && b.state === 'construct').length;
  if (underConstruction >= 2) return;

  // desired counts (economy-first so the capital engine gets going early,
  // research lab comes early so the AI actually techs)
  const want = {
    capital_exchange: 1, power_node: 2, data_center: 2, research_lab: 1,
    security_hub: 1, habitat: 1, broadcast: 1, policy_office: 1,
    defense_node: Math.round(1 + persona.aggression * 2),
  };
  // A second wave once the core economy exists — bias to the current stack need.
  const stage = SOVEREIGN_STACK[p.stackIndex];
  const late = count(game, p, 'research_lab') > 0;
  if (late) {
    want.data_center = 4; want.power_node = 3;
    if (stage) for (const r in stage.need) { const b = RES_BUILDING[r]; if (b) want[b] = (want[b] || 0) + 1; }
  }

  // strict priority order — build the first under-supplied one we can afford,
  // otherwise wait/save for it (don't skip capital just because we can afford a turret)
  const PRIORITY = ['capital_exchange', 'power_node', 'data_center', 'research_lab',
    'security_hub', 'habitat', 'broadcast', 'policy_office', 'defense_node'];
  // keep a small capital reserve for research when a lab is up
  const reserve = late && !p.currentResearch ? 90 : 0;
  for (const id of PRIORITY) {
    if (count(game, p, id) >= (want[id] || 0)) continue;
    const def = BUILDINGS[id];
    const affordable = canAfford(p.res, def.cost) && (p.res.capital - (def.cost.capital || 0)) >= reserve;
    if (!affordable) return; // save up for this one
    const spot = findSpot(game, p, hq);
    if (spot) game.commandBuild(p.index, id, spot.x, spot.z, null);
    return;
  }
}

function findSpot(game, p, hq) {
  for (let ring = 1; ring <= 8; ring++) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2 + ring * 0.5;
      const x = hq.x + Math.cos(ang) * (6 + ring * 3.2);
      const z = hq.z + Math.sin(ang) * (6 + ring * 3.2);
      const half = game.world.half - 6;
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      if (game.canBuildAt('data_center', x, z, p.index).ok) return { x, z };
    }
  }
  return null;
}

function manageResearch(game, p, persona) {
  if (p.currentResearch) return;
  const options = techsFor(p.factionId).filter(t => canResearch(game, p, t.id) && canAfford(p.res, t.cost));
  if (!options.length) return;
  // prefer ultimate, then lower tier, weighted by research persona
  options.sort((a, b) => (b.effect?.ultimate ? 100 : 100 - b.tier * 10) - (a.effect?.ultimate ? 100 : 100 - a.tier * 10));
  const pick = options[0];
  game.commandResearch(p.index, pick.id);
}

function manageArmy(game, p, hq, persona) {
  const hub = game.buildings.find(b => b.owner === p.index && b.defId === 'security_hub' && b.state === 'ready');
  if (!hub) return;
  if (hub.queue.length > 1) return;
  const army = unitCount(game, p, 'combat');
  const target = Math.round(3 + persona.aggression * 10);
  if (army >= target) return;
  // choose the best unlocked combat unit
  const spec = p.faction.specialist && UNITS[p.faction.specialist];
  const order = [];
  if (spec && spec.class === 'combat' && (!spec.requiresTech || p.researched.has(spec.requiresTech)) && hub.def.trains.includes(spec.id)) order.push(spec.id);
  if (p.researched.has('robotics_1')) order.push('robot');
  order.push('security');
  for (const id of order) {
    const def = UNITS[id];
    if (canAfford(p.res, def.cost) && p.supplyUsed + (def.supply || 1) <= p.supplyCap) {
      game.commandTrain(hub.id, id); break;
    }
  }
}

function manageActions(game, p, persona) {
  const stage = SOVEREIGN_STACK[p.stackIndex];
  // keep talent flowing so research labs / units aren't starved
  if (p.res.talent < 60 && canDoAction(game, p, 'recruit_talent') && game.rng() < 0.6)
    return void game.commandAction(p.index, 'recruit_talent');
  // feed the stack's needed resource via actions
  if (stage) {
    if (stage.need.talent && canDoAction(game, p, 'recruit_talent') && game.rng() < 0.5) return void game.commandAction(p.index, 'recruit_talent');
    if (stage.need.compute && canDoAction(game, p, 'buy_compute') && game.rng() < 0.5) return void game.commandAction(p.index, 'buy_compute');
    if (stage.need.trust && canDoAction(game, p, 'campaign') && game.rng() < 0.5) return void game.commandAction(p.index, 'campaign');
    if (stage.need.gov && canDoAction(game, p, 'secure_gov') && game.rng() < 0.5) return void game.commandAction(p.index, 'secure_gov');
  }
  // sabotage if aggressive
  if (game.rng() < persona.sabotage * 0.18 && canDoAction(game, p, 'sabotage'))
    return void game.commandAction(p.index, 'sabotage');
  // alliance if losing and diplomatic
  const leader = leaderStack(game);
  if (leader && leader !== p.index && game.rng() < persona.diplomacy * 0.25 && canDoAction(game, p, 'alliance'))
    game.commandAction(p.index, 'alliance');
}

function leaderStack(game) {
  let best = -1, idx = null;
  for (const p of game.players) if (!p.defeated && p.stackIndex > best) { best = p.stackIndex; idx = p.index; }
  return idx;
}

function manageMilitary(game, p, persona) {
  const st = p.aiState;
  const army = game.units.filter(u => u.owner === p.index && u.def.class === 'combat' && u.state !== 'dead');
  const threshold = AI.attackArmySize + Math.round((1 - persona.aggression) * 6);

  if (!st.attacking && army.length >= threshold) {
    // find a target: nearest enemy building not allied
    const target = findAttackTarget(game, p);
    if (target) {
      st.attacking = true; st.targetId = target.id;
      game.commandAttack(army.map(u => u.id), target.id);
    }
  } else if (st.attacking) {
    const t = game.entity(st.targetId);
    if (!t || t.state === 'dead' || army.length < 3) {
      st.attacking = false; st.targetId = 0;
      // regroup at HQ
      const hq = game.buildings.find(b => b.owner === p.index && b.def.isHQ);
      if (hq) game.commandMove(army.map(u => u.id), hq.x + 6, hq.z + 6, false);
    } else {
      // keep pressing; retarget idle units
      const idle = army.filter(u => u.state === 'idle');
      if (idle.length) game.commandAttack(idle.map(u => u.id), st.targetId);
    }
  } else {
    // defend: pull army toward any enemy near our base
    const hq = game.buildings.find(b => b.owner === p.index && b.def.isHQ);
    if (hq) {
      const threat = game.units.find(u => u.owner !== p.index && u.state !== 'dead' &&
        !p.allies.has(u.owner) && Math.hypot(u.x - hq.x, u.z - hq.z) < 30 && u.def.class === 'combat');
      if (threat) game.commandAttack(army.map(u => u.id), threat.id);
    }
  }
}

function findAttackTarget(game, p) {
  let best = null, bd = Infinity;
  const hq = game.buildings.find(b => b.owner === p.index && b.def.isHQ);
  const ox = hq ? hq.x : 0, oz = hq ? hq.z : 0;
  for (const b of game.buildings) {
    if (b.owner === p.index || b.state === 'dead' || p.allies.has(b.owner)) continue;
    if (game.players[b.owner].defeated) continue;
    const d = (b.x - ox) ** 2 + (b.z - oz) ** 2 - (b.def.isHQ ? 400 : 0); // prefer HQs slightly
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
