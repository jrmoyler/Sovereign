// ============================================================================
// Research system + Sovereign Intelligence stack progression.
// ============================================================================

import { TECHS } from '../data/tech.js';
import { SOVEREIGN_STACK } from '../data/constants.js';
import { dist2 } from './util.js';

// Can a player start researching this tech right now?
export function canResearch(game, p, techId) {
  const t = TECHS[techId];
  if (!t) return false;
  if (p.researched.has(techId)) return false;
  if (p.currentResearch) return false;
  if (t.faction && t.faction !== p.factionId) return false;
  if (t.requires) for (const r of t.requires) if (!p.researched.has(r)) return false;
  // must own a research lab
  if (!game.buildings.some(b => b.owner === p.index && b.researchNode && b.state === 'ready')) return false;
  return true;
}

export function startResearch(game, p, techId) {
  const t = TECHS[techId];
  p.currentResearch = { techId, progress: 0, time: t.time };
  if (p.isHuman) game.emit({ type: 'research_start', owner: p.index, tech: t });
}

function researcherBoost(game, p) {
  // researchers/agents near a research lab add flat % each
  const labs = game.buildings.filter(b => b.owner === p.index && b.researchNode && b.state === 'ready');
  if (!labs.length) return 0;
  let boost = 0;
  for (const u of game.units) {
    if (u.owner !== p.index || u.state === 'dead' || !u.def.aura?.researchSpeed) continue;
    for (const lab of labs) {
      if (dist2(u.x, u.z, lab.x, lab.z) < 18 * 18) { boost += u.def.aura.researchSpeed; break; }
    }
  }
  return Math.min(boost, 1.0);
}

export function updateResearch(game, dt) {
  for (const p of game.players) {
    if (p.defeated) continue;

    // active tech
    if (p.currentResearch) {
      const speed = p.getMod('researchSpeed', 1) * (1 + researcherBoost(game, p));
      p.currentResearch.progress += dt * speed;
      if (p.currentResearch.progress >= p.currentResearch.time) {
        applyTech(game, p, p.currentResearch.techId);
        p.currentResearch = null;
      }
    }

    updateStack(game, p, dt);
  }
}

export function applyTech(game, p, techId) {
  const t = TECHS[techId];
  if (!t || p.researched.has(techId)) return;
  p.researched.add(techId);
  const e = t.effect || {};
  if (e.mods) for (const k in e.mods) p.addTechMod(k, e.mods[k]);
  if (e.unlock) for (const u of e.unlock) p.unlocked.add(u);
  if (e.action) p.unlockedActions.add(e.action);
  if (e.ultimate) p.ultimateDone = true;
  if (e.sovereign) p.stackSkips.add(e.sovereign);
  game.emit({ type: 'research_done', owner: p.index, tech: t });
  if (p.isHuman)
    game.alert(p, e.ultimate ? 'good' : 'good', 'Research Complete', `${t.name} unlocked.`);
}

function requirementsMet(p, stage) {
  for (const r in stage.need) if ((p.res[r] || 0) < stage.need[r]) return false;
  return true;
}

function updateStack(game, p, dt) {
  if (p.stackIndex >= SOVEREIGN_STACK.length) return;
  const stage = SOVEREIGN_STACK[p.stackIndex];

  // Ultimate-granted instant completion.
  if (p.stackSkips.has(stage.id)) {
    completeStage(game, p, stage);
    return;
  }
  if (requirementsMet(p, stage)) {
    p.stackProgress += dt;
    if (p.stackProgress >= stage.time) completeStage(game, p, stage);
  }
  // else: progress holds — sustained capacity is required.
}

function completeStage(game, p, stage) {
  p.stackIndex++;
  p.stackProgress = 0;
  game.emit({ type: 'stage_done', owner: p.index, stage });
  if (p.isHuman) game.alert(p, 'good', 'Sovereign Stack', `${stage.name} secured (${p.stackIndex}/8).`);
  else if (game.human && !game.human.defeated)
    game.alert(game.human, 'warn', 'Rival Progress', `${p.faction.name} completed ${stage.name}.`);

  if (p.stackIndex >= SOVEREIGN_STACK.length) game.declareWinner(p);
}

// % progress [0..1] of the current stage, for the HUD.
export function stackStageProgress(p) {
  const stage = SOVEREIGN_STACK[p.stackIndex];
  if (!stage) return 1;
  if (p.stackSkips.has(stage.id)) return 1;
  return Math.min(1, p.stackProgress / stage.time);
}
export function stageRequirementsMet(p) {
  const stage = SOVEREIGN_STACK[p.stackIndex];
  if (!stage) return true;
  return requirementsMet(p, stage);
}
