// ============================================================================
// Player / faction runtime state (human or AI). Holds resources, research,
// the Sovereign stack progress, supply, cooldowns and diplomacy.
// ============================================================================

import { RES, SOVEREIGN_STACK } from '../data/constants.js';
import { START_RESOURCES, SUPPLY_START } from '../data/balance.js';
import { FACTION_BY_ID, mod as factionMod } from '../data/factions.js';

export class Player {
  constructor(index, factionId, isHuman) {
    this.index = index;
    this.faction = FACTION_BY_ID[factionId];
    this.factionId = factionId;
    this.isHuman = isHuman;
    this.defeated = false;

    this.res = { ...START_RESOURCES };
    this.income = Object.fromEntries(RES.map(r => [r, 0])); // per-second, for HUD

    this.techMods = {};                 // accumulated research multipliers
    this.researched = new Set();
    this.unlocked = new Set();          // unit/building ids unlocked past a gate
    this.unlockedActions = new Set();
    this.currentResearch = null;        // { techId, progress, time }

    this.supplyCap = SUPPLY_START;
    this.supplyUsed = 0;

    // Sovereign Intelligence stack
    this.stackIndex = 0;
    this.stackProgress = 0;
    this.stackSkips = new Set();        // stage ids granted instantly by ultimates
    this.ultimateDone = false;

    this.actionCd = {};                 // actionId -> seconds remaining
    this.allies = new Set();            // player indices

    this.aiState = null;                // populated for AI players
    this.color = this.faction.color;
    this.color2 = this.faction.color2 || this.faction.color;
  }

  // Effective modifier: faction base × research multipliers.
  getMod(key, dflt = 1) {
    return factionMod(this.faction, key, dflt) * (this.techMods[key] ?? 1);
  }

  addTechMod(key, mul) { this.techMods[key] = (this.techMods[key] ?? 1) * mul; }

  get stackStage() { return SOVEREIGN_STACK[this.stackIndex] || null; }
  get stackDoneCount() { return this.stackIndex; }

  isAlly(otherIndex) { return this.allies.has(otherIndex); }
}
