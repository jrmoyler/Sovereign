// ============================================================================
// Building definitions. Data-driven.
//
// generates: passive resource output per second (scaled by faction mods).
// needsEnergy: output halts if the faction's energy balance is negative.
// trains: unit ids this building can produce.
// supply: population capacity this building provides.
// defensive: { dmg, range, cd } makes the building shoot at enemies.
// size: footprint in grid tiles (square).
// ============================================================================

export const BUILDINGS = {
  hq: {
    id: 'hq', name: 'Headquarters', glyph: '⌂', key: '', category: 'core', isHQ: true,
    cost: { capital: 400, infra: 100 }, buildTime: 30, hp: 3000, size: 3, sight: 26, supply: 20,
    trains: ['worker', 'engineer'], generates: { capital: 3.0, infra: 1.2, talent: 0.4 }, dropoff: true,
    defensive: { dmg: 18, range: 14, cd: 1.4 },
    desc: 'Division core. Trains workers, drives the Sovereign Intelligence stack, and defends itself.',
  },
  data_center: {
    id: 'data_center', name: 'Data Center', glyph: '▤', key: 'D', category: 'economy',
    cost: { capital: 220, infra: 60 }, buildTime: 16, hp: 700, size: 2, sight: 12, needsEnergy: true,
    generates: { compute: 3.2, data: 2.2, infra: 0.8 }, dropoff: true,
    desc: 'Generates Compute, Data and a little Infrastructure. Requires positive Energy for full output.',
  },
  power_node: {
    id: 'power_node', name: 'Energy Node', glyph: '☀', key: 'P', category: 'economy',
    cost: { capital: 160, infra: 40 }, buildTime: 12, hp: 500, size: 2, sight: 10,
    generates: { energy: 5, infra: 1.0 },
    desc: 'Produces Energy and grid Infrastructure. Everything compute-related throttles when Energy runs negative.',
  },
  capital_exchange: {
    id: 'capital_exchange', name: 'Capital Exchange', glyph: '$', key: 'X', category: 'economy',
    cost: { capital: 180, data: 40 }, buildTime: 15, hp: 600, size: 2, sight: 12,
    generates: { capital: 4.5 }, trains: ['market_maker'],
    desc: 'Generates Capital and enables market operations. Trains Quantum Ledger specialists.',
  },
  research_lab: {
    id: 'research_lab', name: 'Research Lab', glyph: '🔬', key: 'R', category: 'tech',
    cost: { capital: 240, data: 60, talent: 15 }, buildTime: 18, hp: 650, size: 2, sight: 12,
    trains: ['researcher'], researchNode: true, needsEnergy: true,
    desc: 'Unlocks the research tree and the Sovereign stack. Researchers nearby speed it up.',
  },
  security_hub: {
    id: 'security_hub', name: 'Security Hub', glyph: '⚔', key: 'B', category: 'military',
    cost: { capital: 220, infra: 50 }, buildTime: 16, hp: 900, size: 2, sight: 14, supply: 6,
    trains: ['scout', 'security', 'robot', 'siege_android', 'sentinel'],
    desc: 'Trains combat units and scouts. Raises your supply cap.',
  },
  broadcast: {
    id: 'broadcast', name: 'Broadcast Nexus', glyph: '📡', key: 'M', category: 'influence',
    cost: { capital: 200, trust: 30 }, buildTime: 15, hp: 550, size: 2, sight: 14,
    generates: { trust: 1.4 }, trains: ['media', 'influencer'],
    desc: 'Generates Public Trust and launches public campaigns. Trains media units.',
  },
  policy_office: {
    id: 'policy_office', name: 'Policy Office', glyph: '§', key: 'G', category: 'influence',
    cost: { capital: 200, gov: 20 }, buildTime: 15, hp: 550, size: 2, sight: 12,
    generates: { gov: 1.1 }, trains: ['legal'],
    desc: 'Generates Governance Clearance and secures government favor. Trains legal units.',
  },
  habitat: {
    id: 'habitat', name: 'Talent Habitat', glyph: '⌾', key: 'H', category: 'economy',
    cost: { capital: 140, trust: 10 }, buildTime: 11, hp: 500, size: 2, sight: 10, supply: 12,
    generates: { talent: 0.8 }, dropoff: true,
    desc: 'Houses talent — raises your supply cap and slowly recruits Talent.',
  },
  defense_node: {
    id: 'defense_node', name: 'Defense Turret', glyph: '⊕', key: 'T', category: 'military',
    cost: { capital: 130, infra: 30, energy: 20 }, buildTime: 12, hp: 800, size: 1, sight: 20,
    defensive: { dmg: 30, range: 18, cd: 1.0 },
    desc: 'Automated ranged turret. Cheap, tanky perimeter defense.',
  },
};

export const BUILDING_LIST = Object.values(BUILDINGS);

// Which buildings appear in the build menu (worker-constructable), in order.
export const BUILDABLE = [
  'data_center', 'power_node', 'capital_exchange', 'research_lab',
  'security_hub', 'broadcast', 'policy_office', 'habitat', 'defense_node',
];
