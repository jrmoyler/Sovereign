// ============================================================================
// Pure math / helper utilities used across the simulation. No Three.js, no DOM.
// ============================================================================

let _id = 1;
export const nextId = () => _id++;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
export function dist(ax, az, bx, bz) { return Math.sqrt(dist2(ax, az, bx, bz)); }

// Mulberry32 seeded RNG so games are reproducible if we want them to be.
export function makeRng(seed = 12345) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Can `res` afford `cost`? cost is a { resKey: amount } map.
export function canAfford(res, cost) {
  for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
  return true;
}
export function spend(res, cost) {
  for (const k in cost) res[k] = (res[k] || 0) - cost[k];
}
export function scaleCost(cost, mul) {
  const out = {};
  for (const k in cost) out[k] = Math.round(cost[k] * mul);
  return out;
}
