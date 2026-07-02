// ============================================================================
// Research tree. Generic tiers are available to everyone; each faction also
// has a unique branch culminating in a signature ULTIMATE technology.
//
// effect = {
//   mods:   { key: multiplier }   -> multiplied into the faction's live mod bag
//   unlock: [unitId | buildingId] -> removes a requiresTech gate
//   action: 'actionId'            -> enables a strategic action button
//   ultimate: true                -> flagged as the faction signature tech
//   sovereign: 'stageId'          -> instantly completes a Sovereign stack stage
// }
// requires: array of tech ids that must be researched first.
// faction: if set, only that faction can see/research this node.
// ============================================================================

export const TECHS = {
  // ---- Tier 1 : Foundations (all factions) ----
  compute_1: { id: 'compute_1', name: 'Distributed Compute', tier: 1, time: 20,
    cost: { compute: 60, capital: 80 }, desc: '+18% Compute gathering. Scale the substrate.',
    effect: { mods: { computeGather: 1.18 } } },
  data_1: { id: 'data_1', name: 'Data Pipelines', tier: 1, time: 20,
    cost: { data: 60, capital: 80 }, desc: '+18% Data gathering. Feed the models.',
    effect: { mods: { dataGather: 1.18 } } },
  logistics_1: { id: 'logistics_1', name: 'Autonomous Logistics', tier: 1, time: 22,
    cost: { capital: 120, infra: 40 }, desc: '+22% build & construction speed.',
    effect: { mods: { buildSpeed: 1.22 } } },

  // ---- Tier 2 : Capabilities ----
  robotics_1: { id: 'robotics_1', name: 'Combat Robotics', tier: 2, time: 30, requires: ['logistics_1'],
    cost: { capital: 160, infra: 60, energy: 40 }, desc: 'Unlocks the Combat Robot. +8% unit HP.',
    effect: { unlock: ['robot'], mods: { unitHpMul: 1.08 } } },
  market_1: { id: 'market_1', name: 'Market Operations', tier: 2, time: 28, requires: ['compute_1'],
    cost: { capital: 140, data: 40 }, desc: 'Unlocks Buy Compute & market ops. +15% Capital rate.',
    effect: { unlock: ['market_maker'], action: 'buy_compute', mods: { capitalRate: 1.15 } } },
  influence_1: { id: 'influence_1', name: 'Narrative Engines', tier: 2, time: 28, requires: ['data_1'],
    cost: { capital: 140, trust: 40 }, desc: 'Unlocks Public Campaigns. +18% Trust rate.',
    effect: { unlock: ['influencer'], action: 'campaign', mods: { trustRate: 1.18 } } },
  defense_2: { id: 'defense_2', name: 'Counterintelligence Grid', tier: 2, time: 30, requires: ['logistics_1'],
    cost: { capital: 150, gov: 30, energy: 30 }, desc: 'Unlocks the Sentinel. +25% structure defense.',
    effect: { unlock: ['sentinel'], mods: { defenseMul: 1.25, detectSabotage: 1.3 } } },

  // ---- Tier 3 : Acceleration ----
  recursion_1: { id: 'recursion_1', name: 'Recursive Research', tier: 3, time: 40, requires: ['compute_1', 'data_1'],
    cost: { compute: 200, data: 150, talent: 80 }, desc: '+28% research speed. Compounding gains.',
    effect: { mods: { researchSpeed: 1.28 } } },
  grid_1: { id: 'grid_1', name: 'Continental Grid', tier: 3, time: 38, requires: ['logistics_1'],
    cost: { capital: 240, infra: 120, energy: 80 }, desc: '+22% Infrastructure & Energy output.',
    effect: { mods: { infraRate: 1.22, energyGather: 1.22 } } },
  robotics_2: { id: 'robotics_2', name: 'Heavy Automation', tier: 3, time: 44, requires: ['robotics_1'],
    cost: { capital: 260, infra: 140, energy: 90 }, desc: 'Unlocks the Siege Android. +12% unit damage.',
    effect: { unlock: ['siege_android'], mods: { unitDmgMul: 1.12 } } },

  // ---- Faction branches + ULTIMATES ----
  ult_lattice_pre: { id: 'ult_lattice_pre', name: 'Agent Lattice', tier: 3, time: 34, faction: 'zenflow',
    requires: ['recursion_1'], cost: { compute: 200, talent: 100 },
    desc: 'Unlocks the Agent Swarm and links every agent into one mind.',
    effect: { unlock: ['agent_swarm'], mods: { agentCoord: 1.3 } } },
  ult_lattice: { id: 'ult_lattice', name: '600-Agent Lattice', tier: 4, time: 60, faction: 'zenflow',
    requires: ['ult_lattice_pre'], cost: { compute: 500, data: 300, talent: 200 },
    desc: 'ULTIMATE — research speed +60% and Talent Network stack stage completes instantly.',
    effect: { ultimate: true, mods: { researchSpeed: 1.6 }, sovereign: 'talent_network' } },

  ult_swarm: { id: 'ult_swarm', name: 'Legion Protocol', tier: 4, time: 60, faction: 'animus',
    requires: ['robotics_2'], cost: { capital: 500, infra: 300, energy: 200 },
    desc: 'ULTIMATE — all combat units +35% damage and train 40% faster.',
    effect: { ultimate: true, mods: { unitDmgMul: 1.35, robotTrain: 1.4 } } },

  ult_buyout: { id: 'ult_buyout', name: 'Hostile Buyout', tier: 4, time: 55, faction: 'quantum',
    requires: ['market_1', 'recursion_1'], cost: { capital: 900, data: 200 },
    desc: 'ULTIMATE — Capital +80% and Compute Supremacy stack stage completes instantly.',
    effect: { ultimate: true, mods: { capitalRate: 1.8, buyDiscount: 0.65 }, sovereign: 'compute_supremacy' } },

  ult_blackout: { id: 'ult_blackout', name: 'Total Blackout', tier: 4, time: 55, faction: 'obsidian',
    requires: ['defense_2'], cost: { capital: 400, gov: 200, energy: 150 },
    desc: 'ULTIMATE — structure defense +60%, perfect sabotage immunity, and Sentinels gain +40% range.',
    effect: { ultimate: true, mods: { defenseMul: 1.6, counterIntel: 3, detectSabotage: 3 } } },

  ult_viral: { id: 'ult_viral', name: 'Total Virality', tier: 4, time: 55, faction: 'signal',
    requires: ['influence_1'], cost: { capital: 400, trust: 300, talent: 120 },
    desc: 'ULTIMATE — Trust +90%, adoption +40%, and Trust Threshold stack stage completes instantly.',
    effect: { ultimate: true, mods: { trustRate: 1.9, adoption: 1.4 }, sovereign: 'trust_threshold' } },

  ult_orchestration: { id: 'ult_orchestration', name: 'Grand Orchestration', tier: 4, time: 55, faction: 'collective',
    requires: ['recursion_1'], cost: { capital: 600, data: 200, talent: 150 },
    desc: 'ULTIMATE — the whole civilization moves as one: research +35%, Capital +35%, coordination +30%.',
    effect: { ultimate: true, mods: { researchSpeed: 1.35, capitalRate: 1.35, agentCoord: 1.3 } } },
  ult_flourish: { id: 'ult_flourish', name: 'Human Flourishing', tier: 4, time: 55, faction: 'hybrid',
    requires: ['recursion_1'], cost: { capital: 400, trust: 250, talent: 200 },
    desc: 'ULTIMATE — Talent +70%, unit HP +20%, and Talent Network stack stage completes instantly.',
    effect: { ultimate: true, mods: { talentGather: 1.7, unitHpMul: 1.2 }, sovereign: 'talent_network' } },
  ult_dreamforge: { id: 'ult_dreamforge', name: 'Dreamforge', tier: 4, time: 55, faction: 'nexus',
    requires: ['influence_1'], cost: { capital: 450, trust: 250, data: 150 },
    desc: 'ULTIMATE — narrative supremacy: Trust +60%, influence +50%, Data +25%.',
    effect: { ultimate: true, mods: { trustRate: 1.6, influence: 1.5, dataGather: 1.25 } } },
  ult_metropolis: { id: 'ult_metropolis', name: 'Instant Metropolis', tier: 4, time: 55, faction: 'terra',
    requires: ['grid_1'], cost: { capital: 500, infra: 300, energy: 150 },
    desc: 'ULTIMATE — Infrastructure +70%, build speed +40%, and Infrastructure Lock-in completes instantly.',
    effect: { ultimate: true, mods: { infraRate: 1.7, buildSpeed: 1.4 }, sovereign: 'infra_lockin' } },
  ult_longevity: { id: 'ult_longevity', name: 'Longevity Protocol', tier: 4, time: 55, faction: 'vital',
    requires: ['recursion_1'], cost: { capital: 450, data: 250, talent: 150 },
    desc: 'ULTIMATE — bio-digital resilience: unit HP +35%, research +30%, Trust +25%.',
    effect: { ultimate: true, mods: { unitHpMul: 1.35, researchSpeed: 1.3, trustRate: 1.25 } } },
  ult_compile: { id: 'ult_compile', name: 'Reality Compiler', tier: 4, time: 55, faction: 'binary',
    requires: ['recursion_1'], cost: { compute: 550, capital: 350, data: 150 },
    desc: 'ULTIMATE — Compute +60%, build speed +30%, and Compute Supremacy completes instantly.',
    effect: { ultimate: true, mods: { computeGather: 1.6, buildSpeed: 1.3 }, sovereign: 'compute_supremacy' } },
  ult_biosphere: { id: 'ult_biosphere', name: 'Closed Biosphere', tier: 4, time: 55, faction: 'gaia',
    requires: ['grid_1'], cost: { capital: 400, energy: 300, infra: 150 },
    desc: 'ULTIMATE — limitless clean power: Energy +90%, Infrastructure +35%, Trust +25%.',
    effect: { ultimate: true, mods: { energyGather: 1.9, infraRate: 1.35, trustRate: 1.25 } } },
  ult_omnimesh: { id: 'ult_omnimesh', name: 'Omnimesh', tier: 4, time: 55, faction: 'aether',
    requires: ['recursion_1'], cost: { compute: 300, data: 400, capital: 300 },
    desc: 'ULTIMATE — Data +60%, coordination +50%, and Data Dominance completes instantly.',
    effect: { ultimate: true, mods: { dataGather: 1.6, agentCoord: 1.5 }, sovereign: 'data_dominance' } },
  ult_overdrive: { id: 'ult_overdrive', name: 'Overdrive', tier: 4, time: 55, faction: 'kinetic',
    requires: ['robotics_1'], cost: { capital: 450, energy: 200, talent: 150 },
    desc: 'ULTIMATE — peak performance: unit speed +40%, damage +30%, training +30% faster.',
    effect: { ultimate: true, mods: { unitSpeed: 1.4, unitDmgMul: 1.3, robotTrain: 1.3 } } },
  ult_mandate: { id: 'ult_mandate', name: 'Public Mandate', tier: 4, time: 55, faction: 'civic',
    requires: ['influence_1'], cost: { capital: 400, trust: 250, gov: 150 },
    desc: 'ULTIMATE — the people decide: Trust +50%, Governance +50%, adoption +30%.',
    effect: { ultimate: true, mods: { trustRate: 1.5, govRate: 1.5, adoption: 1.3 } } },
  ult_transformation: { id: 'ult_transformation', name: 'Total Transformation', tier: 4, time: 55, faction: 'consulting',
    requires: ['market_1'], cost: { capital: 700, trust: 150, talent: 150 },
    desc: 'ULTIMATE — enterprise capture: Capital +60%, adoption +45%, influence +25%.',
    effect: { ultimate: true, mods: { capitalRate: 1.6, adoption: 1.45, influence: 1.25 } } },
  ult_mindshare: { id: 'ult_mindshare', name: 'Mindshare Monopoly', tier: 4, time: 55, faction: 'cognara',
    requires: ['influence_1'], cost: { capital: 450, trust: 250, data: 200 },
    desc: 'ULTIMATE — influence +70%, sabotage +50% stronger, and Trust Threshold completes instantly.',
    effect: { ultimate: true, mods: { influence: 1.7, sabotageMul: 1.5 }, sovereign: 'trust_threshold' } },
  ult_precedent: { id: 'ult_precedent', name: 'Binding Precedent', tier: 4, time: 55, faction: 'juris',
    requires: ['logistics_1'], cost: { capital: 450, gov: 300, trust: 100 },
    desc: 'ULTIMATE — Governance +80%, defense +25%, and Governance Clearance completes instantly.',
    effect: { ultimate: true, mods: { govRate: 1.8, defenseMul: 1.25 }, sovereign: 'gov_clearance' } },
  ult_titanfall: { id: 'ult_titanfall', name: 'Titanfall Doctrine', tier: 4, time: 55, faction: 'titan',
    requires: ['robotics_2'], cost: { capital: 550, infra: 300, energy: 200 },
    desc: 'ULTIMATE — hardware supremacy: unit HP +40%, damage +30%, Infrastructure +35%.',
    effect: { ultimate: true, mods: { unitHpMul: 1.4, unitDmgMul: 1.3, infraRate: 1.35 } } },
  ult_exodus: { id: 'ult_exodus', name: 'Eternal Exodus', tier: 4, time: 55, faction: 'nomad',
    requires: ['grid_1'], cost: { capital: 450, energy: 250, compute: 200 },
    desc: 'ULTIMATE — the mobile civilization: unit speed +35%, build speed +35%, Energy +35%.',
    effect: { ultimate: true, mods: { unitSpeed: 1.35, buildSpeed: 1.35, energyGather: 1.35 } } },
};

export const TECH_LIST = Object.values(TECHS);

// Techs a given faction can research (generic + its own branch).
export function techsFor(factionId) {
  return TECH_LIST.filter(t => !t.faction || t.faction === factionId);
}
