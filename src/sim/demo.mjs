// Headless vertical-slice playthrough.
//
// This is the proof that the *systems* form a complete game loop BEFORE any 3D
// rendering exists. It drives the authoritative reducer with a scripted command
// stream and asserts the project's five success criteria:
//   create a character → complete quests → fight enemies → acquire loot → defeat a boss.
// It also proves save/load round-trips mid-run. Run: `npm run demo` (or
// `node src/sim/demo.mjs`). Exits non-zero on any failed assertion.

import { loadContent } from "./content.mjs";
import { createWorld, spawnEnemy } from "./world.mjs";
import { reduce } from "./reduce.mjs";
import { serialize, deserialize } from "./save.mjs";
import { countItem } from "./player.mjs";

let passed = 0;
function assert(cond, label) {
  if (!cond) { console.error(`  ✗ FAIL: ${label}`); process.exit(1); }
  passed++;
  console.log(`  ✓ ${label}`);
}

function run(world, cmd, content) {
  const r = reduce(world, cmd, content);
  if (!r.ok) { console.error(`  ✗ command ${cmd.type} failed: ${r.error}`); process.exit(1); }
  return r;
}

// Spawn enemies, attacking with salve-healing until the target is dead.
function fightToDeath(world, entity, content) {
  let guard = 0;
  while (entity.alive && world.player.hp > 0 && guard++ < 200) {
    run(world, { type: "ATTACK", targetId: entity.id }, content);
    if (world.player.hp < world.player.maxHp * 0.35 && countItem(world, "con_greater_salve") > 0) {
      run(world, { type: "USE_ITEM", itemId: "con_greater_salve" }, content);
    } else if (world.player.hp < world.player.maxHp * 0.35 && countItem(world, "con_minor_salve") > 0) {
      run(world, { type: "USE_ITEM", itemId: "con_minor_salve" }, content);
    }
  }
}

const content = await loadContent();
let world = createWorld(20260630);

console.log("\nEchoes of the Shattered Realm — headless vertical slice\n");

console.log("[1] Character creation");
run(world, { type: "CREATE_CHARACTER", archetypeId: "warden" }, content);
assert(world.player && world.player.level === 1, "character created at level 1");
assert(world.player.equipped.mainhand === "wpn_iron_sword", "starting weapon auto-equipped");

console.log("\n[2] Accept quest");
run(world, { type: "ACCEPT_QUEST", questId: "q_clear_the_hollow" }, content);
assert(world.quests.q_clear_the_hollow.state === "active", "quest 'Clear the Hollow' active");

console.log("\n[3] Fight wilderness enemies + acquire loot");
for (let i = 0; i < 4; i++) {
  const husk = spawnEnemy(world, "husk_wanderer", "wilderness", content);
  fightToDeath(world, husk, content);
}
assert(world.player.hp > 0, "player survived the wilderness");
assert(countItem(world, "mat_husk_shard") >= 3, "acquired loot (>=3 husk shards)");

console.log("\n[4] Save / load round-trip mid-run");
const snapshot = serialize(world);
world = deserialize(snapshot);
assert(JSON.parse(snapshot).rng.count === world.rng.count, "rng stream preserved across save/load");

console.log("\n[5] Complete quest");
assert(
  world.quests.q_clear_the_hollow.progress.o_kill_husks >= 3 &&
  world.quests.q_clear_the_hollow.progress.o_collect_shard >= 3,
  "both quest objectives satisfied"
);
run(world, { type: "TURN_IN_QUEST", questId: "q_clear_the_hollow" }, content);
assert(world.quests.q_clear_the_hollow.state === "turnedin", "quest turned in");
assert(countItem(world, "key_dungeon_seal") === 1, "quest reward (dungeon seal) received");

console.log("\n[6] Descend to dungeon, accept boss quest");
run(world, { type: "ACCEPT_QUEST", questId: "q_silence_the_king" }, content);
run(world, { type: "ADVANCE_TIME", minutes: 600 }, content); // travel into the night
const stalker = spawnEnemy(world, "ruin_stalker", "dungeon", content);
fightToDeath(world, stalker, content);
assert(!stalker.alive, "cleared a dungeon guardian");

console.log("\n[7] Defeat the boss");
run(world, { type: "ADVANCE_TIME", minutes: 60, rest: true }, content); // rest before the fight
const boss = spawnEnemy(world, "boss_hollow_king", "dungeon", content);
fightToDeath(world, boss, content);
assert(world.flags.bossDefeated === true, "Hollow King defeated");
assert(countItem(world, "wpn_ember_blade") === 1, "boss loot (Ember Blade) acquired");
run(world, { type: "TURN_IN_QUEST", questId: "q_silence_the_king" }, content);
assert(world.quests.q_silence_the_king.state === "turnedin", "boss quest turned in");

console.log(`\n  Final: level ${world.player.level}, ${world.player.hp}/${world.player.maxHp} HP, day ${world.time.day} (${world.time.phase})`);
console.log(`\nALL ${passed} ASSERTIONS PASSED — vertical-slice loop is complete.\n`);
