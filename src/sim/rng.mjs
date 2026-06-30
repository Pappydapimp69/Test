// Deterministic seeded RNG (mulberry32).
//
// WHY this matters architecturally: every random outcome (crits, loot rolls)
// must be reproducible from (seed, callCount). That single discipline buys us
// three things at once:
//   - save/load that round-trips exactly (serialize seed + count, not floats),
//   - replay & debugging (re-run a session from its seed),
//   - the seam for future lockstep co-op (all clients share one RNG stream).
// Never call Math.random() inside the sim. Route every roll through here.

export function makeRng(seed, count = 0) {
  return { seed: seed >>> 0, count: count >>> 0 };
}

// Advance the stream and return a float in [0, 1). Mutates rng.count.
export function nextFloat(rng) {
  rng.count = (rng.count + 1) >>> 0;
  let t = (rng.seed + rng.count * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Integer in [min, max] inclusive.
export function nextInt(rng, min, max) {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

// True with probability p.
export function chance(rng, p) {
  return nextFloat(rng) < p;
}
