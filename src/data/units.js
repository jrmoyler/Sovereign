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
  strategist: {
    id: 'strategist', name: 'Venture Strategist', class: 'support', model: 'soldier', glyph: '♟', key: 'X',
    faction: 'collective', cost: { capital: 130, talent: 30 }, buildTime: 9, hp: 80, supply: 1,
    dmg: 4, range: 1.6, attackCd: 1.4, speed: 7.5, sight: 20, generates: { capital: 1.4 },
    aura: { researchSpeed: 0.04 }, tint: '#9db4ff', desc: 'Prints Capital and boosts research near a lab. The whole board at once.',
    producedBy: 'hq', requiresTech: 'logistics_1',
  },
  mentor: {
    id: 'mentor', name: 'Mentor', class: 'support', model: 'soldier', glyph: '🌱', key: 'X',
    faction: 'hybrid', cost: { capital: 100, trust: 20 }, buildTime: 8, hp: 90, supply: 1,
    dmg: 3, range: 1.6, attackCd: 1.4, speed: 7, sight: 16, generates: { talent: 1.2, trust: 0.4 },
    tint: '#7fe0b0', desc: 'Continuously develops Talent and a little Trust. People are the edge.',
    producedBy: 'habitat', requiresTech: 'data_1',
  },
  worldsmith: {
    id: 'worldsmith', name: 'Worldsmith', class: 'support', model: 'soldier', glyph: '🎬', key: 'X',
    faction: 'nexus', cost: { capital: 120, data: 30 }, buildTime: 9, hp: 70, supply: 1,
    dmg: 3, range: 1.6, attackCd: 1.4, speed: 7.5, sight: 17, generates: { trust: 1.0, data: 0.6 },
    tint: '#c77dff', desc: 'Authors narrative worlds — generates Trust and Data simultaneously.',
    producedBy: 'broadcast', requiresTech: 'influence_1',
  },
  gridwright: {
    id: 'gridwright', name: 'Gridwright', class: 'worker', model: 'robot', glyph: '🏗', key: 'X',
    faction: 'terra', cost: { capital: 120, infra: 30 }, buildTime: 10, hp: 140, supply: 1,
    dmg: 6, range: 1.6, attackCd: 1.3, speed: 7, sight: 16, gatherRate: 6, buildSpeedMul: 3,
    gather: ['compute', 'data', 'energy', 'talent'], canBuild: true, generates: { infra: 0.8 },
    tint: '#8ad0ff', desc: 'Master constructor — builds 3× faster and radiates Infrastructure.',
    producedBy: 'hq', requiresTech: 'logistics_1',
  },
  biomedic: {
    id: 'biomedic', name: 'Biomedic', class: 'support', model: 'soldier', glyph: '🧬', key: 'X',
    faction: 'vital', cost: { capital: 110, data: 30, talent: 20 }, buildTime: 9, hp: 85, supply: 1,
    dmg: 3, range: 1.6, attackCd: 1.4, speed: 7.5, sight: 16, generates: { data: 0.9 }, heals: 4,
    tint: '#5fe0c0', desc: 'Field medic of the bio-digital age — repairs nearby friendly units over time.',
    producedBy: 'research_lab', requiresTech: 'data_1',
  },
  compiler_daemon: {
    id: 'compiler_daemon', name: 'Compiler Daemon', class: 'combat', model: 'robot', glyph: '⌘', key: 'X',
    faction: 'binary', cost: { compute: 50, capital: 70, energy: 15 }, buildTime: 7, hp: 110, supply: 1,
    dmg: 15, range: 8, attackCd: 0.9, speed: 10, sight: 20, ranged: true,
    tint: '#7dff9d', desc: 'Cheap, fast software construct. Compiles quickly; swarms in numbers.',
    producedBy: 'security_hub', requiresTech: 'compute_1',
  },
  terraformer: {
    id: 'terraformer', name: 'Terraformer', class: 'support', model: 'robot', glyph: '🌿', key: 'X',
    faction: 'gaia', cost: { capital: 120, energy: 30 }, buildTime: 10, hp: 130, supply: 1,
    dmg: 5, range: 1.6, attackCd: 1.4, speed: 6.5, sight: 16, generates: { energy: 1.8, infra: 0.4 },
    tint: '#9bd45a', desc: 'A walking green power plant — generates Energy and Infrastructure.',
    producedBy: 'hq', requiresTech: 'logistics_1',
  },
  relay_warden: {
    id: 'relay_warden', name: 'Relay Warden', class: 'support', model: 'robot', glyph: '📶', key: 'X',
    faction: 'aether', cost: { capital: 110, data: 30, energy: 15 }, buildTime: 8, hp: 95, supply: 1,
    dmg: 8, range: 9, attackCd: 1.2, speed: 10, sight: 28, ranged: true, generates: { data: 1.0 },
    aura: { adoption: 0.05 }, tint: '#7dc0ff', desc: 'Mobile mesh node — huge sight, Data generation and an adoption aura.',
    producedBy: 'hq', requiresTech: 'data_1',
  },
  pacesetter: {
    id: 'pacesetter', name: 'Pacesetter', class: 'combat', model: 'soldier', glyph: '🏃', key: 'X',
    faction: 'kinetic', cost: { capital: 110, talent: 25, energy: 15 }, buildTime: 8, hp: 170, supply: 1,
    dmg: 22, range: 2.0, attackCd: 0.8, speed: 13, sight: 22, ranged: false,
    tint: '#ff9d3c', desc: 'Elite fast striker. Hits hard, hits first, and outruns everything.',
    producedBy: 'security_hub', requiresTech: 'logistics_1',
  },
  organizer: {
    id: 'organizer', name: 'Community Organizer', class: 'support', model: 'soldier', glyph: '🗳', key: 'X',
    faction: 'civic', cost: { capital: 100, trust: 25 }, buildTime: 8, hp: 80, supply: 1,
    dmg: 3, range: 1.6, attackCd: 1.4, speed: 7, sight: 16, generates: { trust: 0.9, gov: 0.5 },
    tint: '#5ac0d0', desc: 'Builds public mandate — generates Trust and Governance together.',
    producedBy: 'policy_office', requiresTech: 'data_1',
  },
  consultant: {
    id: 'consultant', name: 'Transformation Lead', class: 'support', model: 'soldier', glyph: '💼', key: 'X',
    faction: 'consulting', cost: { capital: 140, talent: 25 }, buildTime: 9, hp: 75, supply: 1,
    dmg: 3, range: 1.6, attackCd: 1.4, speed: 8, sight: 17, generates: { capital: 1.8 },
    aura: { adoption: 0.06 }, tint: '#b0b8d0', desc: 'Bills by the hour — strong Capital generation and an adoption aura.',
    producedBy: 'capital_exchange', requiresTech: 'market_1',
  },
  mesmerist: {
    id: 'mesmerist', name: 'Mesmerist', class: 'support', model: 'soldier', glyph: '🌀', key: 'X',
    faction: 'cognara', cost: { capital: 120, trust: 20, data: 20 }, buildTime: 9, hp: 75, supply: 1,
    dmg: 10, range: 9, attackCd: 1.3, speed: 8, sight: 20, ranged: true, generates: { trust: 0.8 },
    tint: '#d07dff', desc: 'Persuasion at range — generates Trust and disrupts minds from afar.',
    producedBy: 'broadcast', requiresTech: 'influence_1',
  },
  advocate: {
    id: 'advocate', name: 'Lead Advocate', class: 'support', model: 'soldier', glyph: '🏛', key: 'X',
    faction: 'juris', cost: { capital: 120, gov: 20 }, buildTime: 9, hp: 85, supply: 1,
    dmg: 3, range: 1.6, attackCd: 1.4, speed: 6.5, sight: 16, generates: { gov: 1.2 },
    tint: '#d0c060', desc: 'Fast-tracks clearance — the strongest Governance generation in the game.',
    producedBy: 'policy_office', requiresTech: 'logistics_1',
  },
  juggernaut: {
    id: 'juggernaut', name: 'Juggernaut', class: 'combat', model: 'robot', glyph: '🛠', key: 'X',
    faction: 'titan', cost: { capital: 190, infra: 70, energy: 40 }, buildTime: 15, hp: 560, supply: 3,
    dmg: 48, range: 2.6, attackCd: 1.5, speed: 5.5, sight: 18, ranged: false, splash: 2.6,
    tint: '#c07d3c', desc: 'Industrial colossus. Immense HP and crushing splash damage.',
    producedBy: 'security_hub', requiresTech: 'robotics_1',
  },
  pathfinder: {
    id: 'pathfinder', name: 'Pathfinder', class: 'combat', model: 'robot', glyph: '🧭', key: 'X',
    faction: 'nomad', cost: { capital: 100, energy: 25 }, buildTime: 7, hp: 120, supply: 1,
    dmg: 13, range: 10, attackCd: 1.0, speed: 12, sight: 26, ranged: true,
    tint: '#7de0e0', desc: 'Nomadic outrider — fast, long-ranged, sees far. Strikes and vanishes.',
    producedBy: 'security_hub', requiresTech: 'compute_1',
  },
};

export const UNIT_LIST = Object.values(UNITS);
