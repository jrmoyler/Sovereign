// ============================================================================
// Unit definitions. Data-driven: the simulation & render read these fields.
//
// model: which rigged glTF drives the mesh ('soldier' humanoid | 'robot').
// class: behavioural role used by the sim (worker/combat/support/scout...).
// gather: resource keys this unit can harvest from map nodes (workers only).
// supply: population cost (capped by HQ + habitats).
// faction: if set, unit is a faction-unique specialist.
// ============================================================================

export const UNITS = {
  worker: {
    id: 'worker', name: 'Agent Worker', class: 'worker', model: 'soldier', glyph: '⛏', key: 'Q',
    cost: { capital: 50, talent: 10 }, buildTime: 6, hp: 60, supply: 1,
    dmg: 4, range: 1.6, attackCd: 1.2, speed: 7.5, sight: 16, gatherRate: 7,
    gather: ['compute', 'data', 'energy', 'talent'], canBuild: true,
    tint: '#9fb4d8', desc: 'Gathers Compute, Data, Energy & Talent, and constructs buildings.',
    producedBy: 'hq',
  },
  engineer: {
    id: 'engineer', name: 'Engineer', class: 'worker', model: 'soldier', glyph: '🔧', key: 'E',
    cost: { capital: 80, talent: 25, infra: 10 }, buildTime: 9, hp: 90, supply: 1,
    dmg: 5, range: 1.6, attackCd: 1.2, speed: 7, sight: 16, gatherRate: 5, buildSpeedMul: 2.2,
    gather: ['compute', 'data', 'energy', 'talent'], canBuild: true,
    tint: '#ffb25c', desc: 'Constructs and repairs 2.2× faster than a worker. Reinforces the build-out.',
    producedBy: 'hq',
  },
  scout: {
    id: 'scout', name: 'Scout Drone', class: 'scout', model: 'robot', glyph: '👁', key: 'C',
    cost: { capital: 60, energy: 20 }, buildTime: 6, hp: 55, supply: 1,
    dmg: 6, range: 8, attackCd: 1.4, speed: 13, sight: 30, ranged: true,
    tint: '#7de0ff', desc: 'Very fast, huge sight radius. Reveals the map and spots sabotage.',
    producedBy: 'security_hub',
  },
  security: {
    id: 'security', name: 'Security Unit', class: 'combat', model: 'soldier', glyph: '🛡', key: 'S',
    cost: { capital: 90, talent: 20, energy: 15 }, buildTime: 9, hp: 150, supply: 1,
    dmg: 16, range: 9, attackCd: 1.1, speed: 8, sight: 20, ranged: true,
    tint: '#5f8fff', desc: 'Ranged defender. The backbone of any base garrison.',
    producedBy: 'security_hub',
  },
  robot: {
    id: 'robot', name: 'Combat Robot', class: 'combat', model: 'robot', glyph: '🤖', key: 'R',
    cost: { capital: 140, infra: 30, energy: 30 }, buildTime: 13, hp: 300, supply: 2,
    dmg: 34, range: 2.2, attackCd: 1.3, speed: 7, sight: 18, ranged: false,
    tint: '#ff6d6d', desc: 'Heavy melee bruiser. High HP and damage; slow to build.',
    producedBy: 'security_hub', requiresTech: 'robotics_1',
  },
  researcher: {
    id: 'researcher', name: 'Researcher', class: 'support', model: 'soldier', glyph: '🔬', key: 'F',
    cost: { capital: 70, talent: 40, data: 20 }, buildTime: 8, hp: 70, supply: 1,
    dmg: 3, range: 1.6, attackCd: 1.4, speed: 6.5, sight: 15, aura: { researchSpeed: 0.05 },
    tint: '#37e0a0', desc: 'Each researcher near a Research Lab adds +5% research speed.',
    producedBy: 'research_lab',
  },
  media: {
    id: 'media', name: 'Media Unit', class: 'support', model: 'soldier', glyph: '📡', key: 'M',
    cost: { capital: 80, talent: 20, trust: 10 }, buildTime: 8, hp: 65, supply: 1,
    dmg: 3, range: 1.6, attackCd: 1.4, speed: 7, sight: 16, generates: { trust: 0.6 },
    tint: '#ff8fc7', desc: 'Generates Public Trust continuously and amplifies campaigns.',
    producedBy: 'broadcast',
  },
  legal: {
    id: 'legal', name: 'Legal Unit', class: 'support', model: 'soldier', glyph: '⚖', key: 'L',
    cost: { capital: 90, talent: 30, gov: 10 }, buildTime: 8, hp: 70, supply: 1,
    dmg: 3, range: 1.6, attackCd: 1.4, speed: 6.5, sight: 15, generates: { gov: 0.5 },
    tint: '#6fd0e0', desc: 'Generates Governance Clearance and blunts Regulation pressure.',
    producedBy: 'policy_office',
  },

  // ---------------- Faction-unique specialists ----------------
  agent_swarm: {
    id: 'agent_swarm', name: 'Agent Swarm', class: 'combat', model: 'robot', glyph: '✳', key: 'X',
    faction: 'zenflow', cost: { compute: 60, talent: 20, energy: 15 }, buildTime: 5, hp: 90, supply: 1,
    dmg: 14, range: 7, attackCd: 0.8, speed: 11, sight: 20, ranged: true, aura: { researchSpeed: 0.03 },
    tint: '#7d5cff', desc: 'Cheap, fast lattice agents. Strong in numbers and boost nearby research.',
    producedBy: 'hq', requiresTech: 'ult_lattice_pre',
  },
  siege_android: {
    id: 'siege_android', name: 'Siege Android', class: 'combat', model: 'robot', glyph: '⚔', key: 'X',
    faction: 'animus', cost: { capital: 200, infra: 60, energy: 50 }, buildTime: 16, hp: 520, supply: 3,
    dmg: 60, range: 3, attackCd: 1.4, speed: 6, sight: 20, ranged: false, splash: 3,
    tint: '#ff4d4d', desc: 'Colossal android. Splash melee damage; crushes bases.',
    producedBy: 'security_hub', requiresTech: 'robotics_2',
  },
  market_maker: {
    id: 'market_maker', name: 'Market Maker', class: 'support', model: 'soldier', glyph: '💠', key: 'X',
    faction: 'quantum', cost: { capital: 150, talent: 30 }, buildTime: 10, hp: 80, supply: 1,
    dmg: 4, range: 8, attackCd: 1.4, speed: 8, sight: 18, ranged: true, generates: { capital: 2.2 },
    tint: '#ffe08a', desc: 'Prints Capital continuously. Fund the machine faster than rivals can build.',
    producedBy: 'capital_exchange', requiresTech: 'market_1',
  },
  sentinel: {
    id: 'sentinel', name: 'Sentinel', class: 'combat', model: 'robot', glyph: '🔷', key: 'X',
    faction: 'obsidian', cost: { capital: 130, energy: 40, gov: 10 }, buildTime: 12, hp: 360, supply: 2,
    dmg: 26, range: 12, attackCd: 1.0, speed: 6.5, sight: 30, ranged: true, detects: true,
    tint: '#6fd0e0', desc: 'Long-range guardian with vast sight. Detects sabotage & cloaked threats.',
    producedBy: 'security_hub', requiresTech: 'defense_2',
  },
  influencer: {
    id: 'influencer', name: 'Influencer', class: 'support', model: 'soldier', glyph: '🌟', key: 'X',
    faction: 'signal', cost: { capital: 120, trust: 20, talent: 20 }, buildTime: 9, hp: 70, supply: 1,
    dmg: 3, range: 1.6, attackCd: 1.4, speed: 8, sight: 18, generates: { trust: 1.4 },
    aura: { adoption: 0.08 }, tint: '#ff8fc7', desc: 'Mass Trust generation and an adoption aura that accelerates the whole economy.',
    producedBy: 'broadcast', requiresTech: 'influence_1',
  },
};

export const UNIT_LIST = Object.values(UNITS);
