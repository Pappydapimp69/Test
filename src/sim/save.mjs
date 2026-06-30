// Save/load = serialize the world object. That's the whole trick.
//
// Because the world is plain data (no class instances, no functions, no
// renderer refs) and all randomness is captured in rng:{seed,count}, a save is
// just JSON.stringify(world) and a load is JSON.parse. A reloaded world is
// byte-for-byte continuable — the next RNG roll is identical to what it would
// have been without the save. Content (items/enemies/quests) is NOT saved; it
// is reloaded from data and rebound, so content can be patched under old saves.

export function serialize(world) {
  return JSON.stringify({ ...world, log: world.log.slice(-200) }); // cap log growth
}

export function deserialize(json) {
  const w = JSON.parse(json);
  if (w.version !== 1) throw new Error(`unsupported save version: ${w.version}`);
  return w;
}
