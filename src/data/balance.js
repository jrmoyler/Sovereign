// ============================================================================
// Central balance values, resource-node config, strategic actions and risk
// events. Tweak here to rebalance the whole game.
// ============================================================================

export const START_RESOURCES = {
  compute: 120, data: 100, talent: 50, capital: 350,
  trust: 120, infra: 120, energy: 140, gov: 60,
};

export const START_UNITS = { worker: 5 };

// Resource-node types placed on the map. amount = how much can be harvested.
export const NODE_TYPES = {
  compute: { res: 'compute', amount: 2600, glyph: '⚡', color: '#4ea3ff', name: 'Compute Cluster' },
  data:    { res: 'data',    amount: 2400, glyph: '◈', color: '#37e0a0', name: 'Data Well' },
  energy:  { res: 'energy',  amount: 3000, glyph: '☀', color: '#ff9d5c', name: 'Energy Field' },
  talent:  { res: 'talent',  amount: 1400, glyph: '✦', color: '#ffcf5c', name: 'Talent Hub' },
};

// Map generation: how many of each node ring around each start location.
export const MAP_GEN = {
  nodesPerBase: { compute: 2, data: 2, energy: 2, talent: 1 },
  neutralClusters: 5,          // contested nodes in the middle
  baseRingRadius: 18,
};

// Strategic actions (buttons). handler ids are resolved in core/Actions.js.
export const ACTIONS = {
  recruit_talent: { id: 'recruit_talent', name: 'Recruit Talent', glyph: '✦', key: 'Y',
    cost: { capital: 120 }, cooldown: 12, desc: '+60 Talent instantly. Grow the network.' },
  buy_compute: { id: 'buy_compute', name: 'Buy Compute', glyph: '⚡', key: 'U',
    cost: { capital: 200 }, cooldown: 10, requiresTech: 'market_1',
    desc: 'Convert Capital into +120 Compute at market rate (cheaper for Quantum Ledger).' },
  campaign: { id: 'campaign', name: 'Public Campaign', glyph: '📣', key: 'I',
    cost: { capital: 150, data: 40 }, cooldown: 20, requiresTech: 'influence_1',
    desc: '+90 Trust and a temporary adoption surge. Shape the narrative.' },
  secure_gov: { id: 'secure_gov', name: 'Secure Gov Favor', glyph: '§', key: 'O',
    cost: { capital: 180, trust: 40 }, cooldown: 22,
    desc: '+70 Governance Clearance and reduces Regulation pressure.' },
  sabotage: { id: 'sabotage', name: 'Sabotage Rival', glyph: '☠', key: 'K',
    cost: { capital: 200, data: 60 }, cooldown: 30,
    desc: 'Strike the strongest rival: damages a random enemy building & steals Compute. Detectable.' },
  alliance: { id: 'alliance', name: 'Offer Alliance', glyph: '🤝', key: 'J',
    cost: { capital: 150, trust: 30 }, cooldown: 40,
    desc: 'Propose a temporary non-aggression pact with the weakest rival.' },
};

export const ACTION_LIST = Object.values(ACTIONS);

// Risk system tuning.
export const RISK = {
  checkInterval: 15,           // seconds between risk rolls
  events: {
    public_backlash:   { name: 'Public Backlash', kind: 'bad', trigger: 'lowTrust',
      desc: 'Trust collapse slows adoption.', effect: { trust: -60 } },
    regulation:        { name: 'Regulation Pressure', kind: 'bad', trigger: 'highGov',
      desc: 'Regulators freeze part of your Governance Clearance.', effect: { gov: -50 } },
    talent_poaching:   { name: 'Talent Poaching', kind: 'bad', trigger: 'random',
      desc: 'A rival poaches your researchers.', effect: { talent: -40 } },
    model_failure:     { name: 'Model Failure', kind: 'bad', trigger: 'highCompute',
      desc: 'A training run diverges — compute wasted.', effect: { compute: -80 } },
    infra_overload:    { name: 'Infrastructure Overload', kind: 'bad', trigger: 'lowEnergy',
      desc: 'Grid overload — energy drained.', effect: { energy: -70 } },
    cyber_attack:      { name: 'Cyber Attack', kind: 'bad', trigger: 'random',
      desc: 'Intrusion siphons Data (Obsidian Arc resists).', effect: { data: -70 } },
    energy_shortage:   { name: 'Energy Shortage', kind: 'bad', trigger: 'lowEnergy',
      desc: 'Rolling blackouts across your data centers.', effect: { energy: -90 } },
    misalignment:      { name: 'Agent Misalignment', kind: 'bad', trigger: 'highCompute',
      desc: 'An agent goes off-policy — Trust and Compute hit.', effect: { compute: -50, trust: -40 } },
    breakthrough:      { name: 'Research Breakthrough', kind: 'good', trigger: 'goodLuck',
      desc: 'A lab serendipity grants bonus Compute & Data.', effect: { compute: 90, data: 70 } },
    viral_moment:      { name: 'Viral Moment', kind: 'good', trigger: 'goodLuck',
      desc: 'Your narrative goes viral — Trust surges.', effect: { trust: 90 } },
  },
};

// AI difficulty scalars (applied to rival economies).
export const AI = {
  handicap: 0.9,               // rival resource-rate multiplier (<1 = easier)
  decisionInterval: 2.5,       // seconds between AI decisions
  attackArmySize: 6,           // army size before an AI commits to attack
};

export const SUPPLY_START = 20;
