// ============================================================================
// Combat: target acquisition, damage, splash, building defense, death.
// Emits 'attack' / 'impact' / 'death' events for the render + audio layers.
// ============================================================================

import { dist2 } from './util.js';

function hostile(game, a, ownerIndex) {
  // a is an entity; hostile if different owner and not allied
  if (a.owner === ownerIndex) return false;
  const pa = game.players[ownerIndex], pb = game.players[a.owner];
  if (!pb || pb.defeated) return false;
  if (pa.allies.has(a.owner)) return false;
  return true;
}

function nearestEnemy(game, x, z, ownerIndex, range) {
  let best = null, bd = range * range;
  for (const u of game.units) {
    if (u.state === 'dead' || !hostile(game, u, ownerIndex)) continue;
    const d = dist2(x, z, u.x, u.z);
    if (d < bd) { bd = d; best = u; }
  }
  for (const b of game.buildings) {
    if (b.state === 'dead' || !hostile(game, b, ownerIndex)) continue;
    const d = dist2(x, z, b.x, b.z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export function dealDamage(game, target, dmg, attackerOwner) {
  if (!target || target.state === 'dead') return;
  const p = game.players[target.owner];
  // structure defense reduces incoming damage for buildings
  let mult = 1;
  if (target.kind === 'building') mult /= Math.max(0.4, p.getMod('defenseMul', 1));
  else mult /= Math.max(0.6, Math.sqrt(p.getMod('unitHpMul', 1))); // tankiness folds into effective HP
  target.hp -= dmg * mult;
  target.flash = 0.18;
  if (target.hp <= 0) killEntity(game, target, attackerOwner);
}

export function killEntity(game, e, byOwner) {
  if (e.state === 'dead') return;
  e.state = 'dead';
  if (e.kind === 'unit') {
    e.dieTimer = 1.4; e.animHint = 'die'; e.selectable = false;
    game.emit({ type: 'death', kind: 'unit', x: e.x, z: e.z, owner: e.owner, id: e.id });
  } else {
    game.world.clearOccupied(e.tx, e.tz, e.size);
    e.dieTimer = 0.6; e.selectable = false;
    game.emit({ type: 'death', kind: 'building', x: e.x, z: e.z, owner: e.owner, id: e.id, big: true });
    // a player with no buildings left is eliminated (check on every loss)
    game.checkElimination(e.owner);
  }
}

function attack(game, attacker, target) {
  const def = attacker.def;
  const dmg = def.dmg * game.players[attacker.owner].getMod('unitDmgMul', 1);
  attacker.cd = def.attackCd;
  attacker.animHint = 'attack';
  attacker.flash = 0.08;
  game.emit({ type: 'attack', ranged: !!def.ranged, x: attacker.x, z: attacker.z,
    tx: target.x, tz: target.z, owner: attacker.owner, dmg });
  const hit = () => {
    dealDamage(game, target, dmg, attacker.owner);
    if (def.splash) {
      // splash also hits other enemies (units and buildings) around the target
      const r2 = def.splash * def.splash;
      for (const u of game.units)
        if (u !== target && u.state !== 'dead' && hostile(game, u, attacker.owner) && dist2(u.x, u.z, target.x, target.z) < r2)
          dealDamage(game, u, dmg * 0.6, attacker.owner);
      for (const b of game.buildings)
        if (b !== target && b.state !== 'dead' && hostile(game, b, attacker.owner) && dist2(b.x, b.z, target.x, target.z) < r2)
          dealDamage(game, b, dmg * 0.6, attacker.owner);
    }
    game.emit({ type: 'impact', x: target.x, z: target.z, ranged: !!def.ranged });
  };
  // ranged: small travel delay handled by render tracer; sim applies immediately
  hit();
}

export function updateCombat(game, dt) {
  // Units
  for (const u of game.units) {
    if (u.state === 'dead') continue;
    if (u.cd > 0) u.cd -= dt;
    const def = u.def;

    // healers repair nearby damaged friendlies
    if (def.heals) {
      for (const o of game.units) {
        if (o === u || o.state === 'dead' || o.owner !== u.owner || o.hp >= o.maxHp) continue;
        if (dist2(u.x, u.z, o.x, o.z) < 100) o.hp = Math.min(o.maxHp, o.hp + def.heals * dt);
      }
    }

    if (!def.dmg || def.class === 'worker' || def.class === 'support') {
      // non-combatants only retaliate if explicitly attacking a target
      if (u.state === 'attack' && u.targetId) tryAttackTarget(game, u);
      continue;
    }

    // explicit target
    if (u.state === 'attack' && u.targetId) { tryAttackTarget(game, u); continue; }

    // auto-acquire when idle or attack-moving
    if (u.state === 'idle' || u.attackMove || u.state === 'move') {
      const enemy = nearestEnemy(game, u.x, u.z, u.owner, def.sight);
      if (enemy) {
        if (u.state === 'move' && !u.attackMove) {
          // moving to a commanded point: only engage if very close
          if (dist2(u.x, u.z, enemy.x, enemy.z) > (def.range + 2) ** 2) continue;
        }
        u.targetId = enemy.id; u.state = 'attack';
        tryAttackTarget(game, u);
      }
    }
  }

  // Building defensive fire
  for (const b of game.buildings) {
    if (b.state !== 'ready' || !b.def.defensive) continue;
    if (b.cd > 0) { b.cd -= dt; continue; }
    const wd = b.def.defensive;
    const enemy = nearestEnemy(game, b.x, b.z, b.owner, wd.range);
    if (enemy) {
      b.cd = wd.cd;
      const dmg = wd.dmg * game.players[b.owner].getMod('unitDmgMul', 1);
      game.emit({ type: 'attack', ranged: true, x: b.x, z: b.z + b.size, tx: enemy.x, tz: enemy.z, owner: b.owner, dmg });
      dealDamage(game, enemy, dmg, b.owner);
      game.emit({ type: 'impact', x: enemy.x, z: enemy.z, ranged: true });
    }
  }
}

function tryAttackTarget(game, u) {
  const t = game.entity(u.targetId);
  if (!t || t.state === 'dead') { u.targetId = 0; u.state = 'idle'; return; }
  if (!hostile(game, t, u.owner)) { u.targetId = 0; u.state = 'idle'; return; }
  const range = u.def.range + (t.kind === 'building' ? t.size : 0.4);
  const d2 = dist2(u.x, u.z, t.x, t.z);
  if (d2 <= range * range) {
    u.vx = 0; u.vz = 0;
    u.rot = Math.atan2(t.x - u.x, t.z - u.z);
    if (u.cd <= 0) attack(game, u, t);
    else u.animHint = 'attack';
  } else {
    // chase
    u.goal = { x: t.x, z: t.z };
    game.stepToward(u, range);
    u.animHint = 'run';
  }
}
