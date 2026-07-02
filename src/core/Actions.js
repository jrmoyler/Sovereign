// ============================================================================
// Strategic actions: recruit talent, buy compute, campaign, secure gov,
// sabotage, alliance. Resolved against a player's economy & diplomacy.
// ============================================================================

import { ACTIONS } from '../data/balance.js';
import { canAfford, spend, scaleCost } from './util.js';
import { dealDamage } from './Combat.js';

export function actionCost(p, actionId) {
  const a = ACTIONS[actionId];
  let mul = 1;
  if (actionId === 'buy_compute') mul = p.getMod('buyDiscount', 1);
  return scaleCost(a.cost, mul);
}

export function canDoAction(game, p, actionId) {
  const a = ACTIONS[actionId];
  if (!a) return false;
  if (a.requiresTech && !p.researched.has(a.requiresTech)) return false;
  if ((p.actionCd[actionId] || 0) > 0) return false;
  return canAfford(p.res, actionCost(p, actionId));
}

export function doAction(game, p, actionId, opts = {}) {
  const a = ACTIONS[actionId];
  if (!canDoAction(game, p, actionId)) return false;
  spend(p.res, actionCost(p, actionId));
  p.actionCd[actionId] = a.cooldown;

  switch (actionId) {
    case 'recruit_talent':
      p.res.talent += 60 * p.getMod('talentGather', 1);
      break;
    case 'buy_compute':
      p.res.compute += 120 * p.getMod('computeGather', 1) * p.getMod('marketOps', 1);
      break;
    case 'campaign': {
      p.res.trust += 90 * p.getMod('trustRate', 1) * p.getMod('influence', 1);
      p.addTempMod('adoption', 1.2, 30); // 30s adoption surge
      break;
    }
    case 'secure_gov':
      p.res.gov += 70 * p.getMod('govRate', 1);
      p.res.trust = Math.min(p.res.trust + 10, 2000);
      break;
    case 'sabotage':
      resolveSabotage(game, p);
      break;
    case 'alliance':
      resolveAlliance(game, p);
      break;
  }
  if (p.isHuman) game.emit({ type: 'action_done', owner: p.index, actionId });
  return true;
}

function strongestRival(game, p) {
  let best = null, score = -1;
  for (const o of game.players) {
    if (o.index === p.index || o.defeated || p.allies.has(o.index)) continue;
    const s = o.stackIndex * 100 + o.res.compute * 0.1;
    if (s > score) { score = s; best = o; }
  }
  return best;
}
function weakestRival(game, p) {
  let best = null, score = Infinity;
  for (const o of game.players) {
    if (o.index === p.index || o.defeated || p.allies.has(o.index)) continue;
    const s = o.stackIndex * 100 + o.res.compute * 0.1;
    if (s < score) { score = s; best = o; }
  }
  return best;
}

function resolveSabotage(game, p) {
  const target = strongestRival(game, p);
  if (!target) return;
  // detection: victim's detectSabotage vs attacker's stealth
  const detected = game.rng() < Math.min(0.85, 0.2 * target.getMod('detectSabotage', 1) / p.getMod('sabotageMul', 1));
  const buildings = game.buildings.filter(b => b.owner === target.index && b.state === 'ready' && !b.def.isHQ);
  if (buildings.length) {
    const b = buildings[Math.floor(game.rng() * buildings.length)];
    dealDamage(game, b, b.maxHp * 0.28, p.index);
    game.emit({ type: 'sabotage', x: b.x, z: b.z, owner: p.index, target: target.index, detected });
  }
  const stolen = Math.min(target.res.compute, 80);
  target.res.compute -= stolen; p.res.compute += stolen;

  if (detected && target.isHuman)
    game.alert(target, 'bad', 'Sabotage Detected!', `${p.faction.name} struck your infrastructure.`);
  else if (detected && p.isHuman)
    game.alert(p, 'warn', 'Sabotage Traced', `${target.faction.name} detected your operation.`);
  else if (p.isHuman)
    game.alert(p, 'good', 'Sabotage Successful', `Struck ${target.faction.name} and siphoned ${Math.round(stolen)} Compute.`);
}

function resolveAlliance(game, p) {
  const target = weakestRival(game, p);
  if (!target) return;
  // acceptance depends on target diplomacy personality
  const dip = target.ai?.diplomacy ?? target.faction.ai?.diplomacy ?? 0.5;
  const accept = target.isHuman ? true : game.rng() < dip;
  if (accept) {
    p.allies.add(target.index); target.allies.add(p.index);
    game.emit({ type: 'alliance', a: p.index, b: target.index, formed: true });
    if (p.isHuman) game.alert(p, 'good', 'Alliance Formed', `${target.faction.name} accepts a non-aggression pact.`);
    // temporary — auto-dissolve after a while
    game.allianceTimers.push({ a: p.index, b: target.index, t: 90 });
  } else if (p.isHuman) {
    game.alert(p, 'warn', 'Alliance Rejected', `${target.faction.name} declines your offer.`);
  }
}
