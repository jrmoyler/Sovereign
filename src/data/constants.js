// ============================================================================
// Global constants shared by simulation, render and UI.
// Keep this free of any Three.js / DOM references — pure data only.
// ============================================================================

export const MAP = {
  SIZE: 120,        // world is SIZE x SIZE in world units, centered on origin
  TILE: 3,          // grid cell size used for pathing / building footprints
  get GRID() { return Math.floor(this.SIZE / this.TILE); },
};

// Fixed simulation timestep (seconds). Render interpolates between ticks.
export const SIM_DT = 1 / 20;

// The eight core resources of the Collective AI economy.
// order drives the resource bar layout.
export const RES = ['compute', 'data', 'talent', 'capital', 'trust', 'infra', 'energy', 'gov'];

export const RESOURCE_INFO = {
  compute: { name: 'Compute',      abbr: 'C',  glyph: '⚡', color: '#4ea3ff', desc: 'Raw processing capacity. Powers research and agent deployment.' },
  data:    { name: 'Data',         abbr: 'D',  glyph: '◈', color: '#37e0a0', desc: 'Training signal. Feeds models and the Data Dominance stack.' },
  talent:  { name: 'Talent',       abbr: 'T',  glyph: '✦', color: '#ffcf5c', desc: 'Human + agent expertise. Trains units and unlocks research.' },
  capital: { name: 'Capital',      abbr: '$',  glyph: '$', color: '#c9a24b', desc: 'Money. Buys everything; sped up by market operations.' },
  trust:   { name: 'Public Trust', abbr: 'P',  glyph: '♥', color: '#ff8fc7', desc: 'Public perception. Gates adoption and the Trust Threshold.' },
  infra:   { name: 'Infrastructure', abbr: 'I', glyph: '⬡', color: '#8a7dff', desc: 'Physical build-out. Required for Infrastructure Lock-in.' },
  energy:  { name: 'Energy',       abbr: 'E',  glyph: '☀', color: '#ff9d5c', desc: 'Powers compute. Shortages throttle everything.' },
  gov:     { name: 'Governance',   abbr: 'G',  glyph: '§', color: '#6fd0e0', desc: 'Regulatory clearance. Required to activate Sovereign Intelligence.' },
};

// The 8-stage Sovereign Intelligence stack — the true win condition.
export const SOVEREIGN_STACK = [
  { id: 'compute_supremacy', name: 'Compute Supremacy',        need: { compute: 800 },                 time: 30 },
  { id: 'data_dominance',    name: 'Data Dominance',           need: { data: 700 },                    time: 30 },
  { id: 'talent_network',    name: 'Talent Network',           need: { talent: 420 },                  time: 34 },
  { id: 'trust_threshold',   name: 'Trust Threshold',          need: { trust: 520 },                   time: 34 },
  { id: 'gov_clearance',     name: 'Governance Clearance',     need: { gov: 440 },                     time: 38 },
  { id: 'recursive_agent',   name: 'Recursive Agent Breakthrough', need: { compute: 650, data: 520, talent: 340 }, time: 55 },
  { id: 'infra_lockin',      name: 'Physical Infrastructure Lock-in', need: { infra: 700, energy: 520 }, time: 55 },
  { id: 'activation',        name: 'Sovereign Intelligence Activation', need: { compute: 1050, gov: 620 }, time: 70 },
];

export const TEAM_COLORS_FALLBACK = ['#4ea3ff', '#ff5d6c', '#37e0a0', '#ffcf5c', '#b07dff', '#ff9d5c'];

// Camera / control tuning
export const CAMERA = {
  MIN_ZOOM: 24, MAX_ZOOM: 130, START_ZOOM: 70,
  PAN_SPEED: 1.0, EDGE_PAN: 14, ROT_SPEED: 0.006,
  PITCH_MIN: 0.55, PITCH_MAX: 1.15, START_PITCH: 0.9,
};
