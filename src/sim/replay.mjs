// Replay-as-regression-test (promoted from creativity E2).
//
// Determinism makes a fixed playthrough a total regression test. We run the
// SAME scripted run twice on fresh worlds with the same seed and assert the
// state fingerprints match — any leaked nondeterminism (a stray Math.random()/
// Date.now(), unordered iteration affecting outcomes) makes the two diverge.
// We also assert the fingerprint equals a baked-in golden value, so an
// unintended change to game logic or content fails loudly. Run: `npm run replay`.

import { loadContent } from "./content.mjs";
import { createWorld, spawnEnemy } from "./world.mjs";
import { reduce } from "./reduce.mjs";
import { serialize, deserialize } from "./save.mjs";
import { countItem } from "./player.mjs";

const SEED = 424242;
// Golden fingerprint of the scripted run at SEED. If you intentionally change
// combat math, content, or progression, re-run and update this value.
const EXPECTED = "26e5f583";

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function fingerprint(world) {
  const p = world.player;
  const compact = {
    level: p.level, xp: p.xp, hp: p.hp, maxHp: p.maxHp,
    skills: p.skills, flags: world.flags,
    quests: Object.fromEntries(Object.entries(world.quests).map(([k, v]) => [k, v.state])),
    inv: [...p.inventory].map((s) => `${s.itemId}:${s.qty}`).sort(),
    rngCount: world.rng.count, day: world.time.day, minutes: Math.round(world.time.minutes),
  };
  return fnv1a(JSON.stringify(compact));
}

function fight(world, entity, content) {
  let guard = 0;
  while (entity.alive && world.player.hp > 0 && guard++ < 300) {
    reduce(world, { type: "ATTACK", targetId: entity.id }, content);
    if (world.player.hp < world.player.maxHp * 0.35) {
      if (countItem(world, "con_greater_salve") > 0) reduce(world, { type: "USE_ITEM", itemId: "con_greater_salve" }, content);
      else if (countItem(world, "con_minor_salve") > 0) reduce(world, { type: "USE_ITEM", itemId: "con_minor_salve" }, content);
    }
  }
}

// Deterministic scripted vertical slice. Same seed => same result, always.
function playthrough(content, seed) {
  const world = createWorld(seed);
  reduce(world, { type: "CREATE_CHARACTER", archetypeId: "warden" }, content);
  reduce(world, { type: "ACCEPT_QUEST", questId: "q_clear_the_hollow" }, content);
  for (let i = 0; i < 4; i++) fight(world, spawnEnemy(world, "husk_wanderer", "wilderness", content), content);
  // mid-run save/load must not perturb the timeline
  const snap = serialize(world);
  const reloaded = deserialize(snap);
  reduce(reloaded, { type: "TURN_IN_QUEST", questId: "q_clear_the_hollow" }, content);
  reduce(reloaded, { type: "ACCEPT_QUEST", questId: "q_silence_the_king" }, content);
  reduce(reloaded, { type: "ADVANCE_TIME", minutes: 600 }, content);
  fight(reloaded, spawnEnemy(reloaded, "ruin_stalker", "dungeon", content), content);
  reduce(reloaded, { type: "ADVANCE_TIME", minutes: 60, rest: true }, content);
  fight(reloaded, spawnEnemy(reloaded, "boss_hollow_king", "dungeon", content), content);
  reduce(reloaded, { type: "TURN_IN_QUEST", questId: "q_silence_the_king" }, content);
  return reloaded;
}

const content = await loadContent();
const a = playthrough(content, SEED);
const b = playthrough(content, SEED);
const fa = fingerprint(a), fb = fingerprint(b);

let ok = true;
const check = (cond, label) => { console.log(`  ${cond ? "✓" : "✗"} ${label}`); ok = ok && cond; };

console.log("\nReplay regression test\n");
check(a.flags.bossDefeated === true, "scripted run reaches boss defeat");
check(fa === fb, `two runs at seed ${SEED} produce identical fingerprints (${fa})`);
check(fa === EXPECTED, `fingerprint matches golden value ${EXPECTED}`);

if (!ok) {
  console.error(`\nREPLAY FAILED. Got fingerprint ${fa}.`);
  console.error("If you changed combat/content/progression on purpose, set EXPECTED to the value above.\n");
  process.exit(1);
}
console.log("\nREPLAY OK — the slice is deterministic and unchanged.\n");
