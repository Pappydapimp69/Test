// World state: the single serializable source of truth for the simulation.
//
// Everything the game "is" lives in this plain object — no behavior, no class
// instances, no references to renderer/audio/input. That constraint is what
// makes save/load trivial (JSON.stringify the world) and what keeps the door
// open for a server to own the world while clients only render it.

import { makeRng } from "./rng.mjs";

let _nextEntity = 1;
export function freshEntityId(world) {
  // Counter lives on the world so ids are deterministic across save/load.
  world._eidCounter = (world._eidCounter || 0) + 1;
  return `e${world._eidCounter}`;
}

const PHASES = ["dawn", "day", "dusk", "night"];
export function phaseFor(minutes) {
  const h = Math.floor((minutes % 1440) / 60);
  if (h < 6) return "night";
  if (h < 9) return "dawn";
  if (h < 18) return "day";
  if (h < 21) return "dusk";
  return "night";
}

export function createWorld(seed = 1337) {
  return {
    version: 1,
    seed,
    rng: makeRng(seed),
    tick: 0,
    time: { minutes: 8 * 60, day: 1, phase: "day" }, // start at 08:00, day 1
    player: null,
    entities: {}, // id -> { id, kind:"enemy", typeId, hp, alive, location, looted }
    quests: {}, // questId -> { state:"available|active|complete|turnedin", progress:{objId:count} }
    flags: {},
    log: [],
    _eidCounter: 0,
  };
}

export function spawnEnemy(world, typeId, location, content) {
  const def = content.enemies.get(typeId);
  if (!def) throw new Error(`unknown enemy type: ${typeId}`);
  const id = freshEntityId(world);
  world.entities[id] = {
    id, kind: "enemy", typeId,
    hp: def.maxHp, alive: true, location, looted: false,
  };
  return world.entities[id];
}

export function logEvent(world, ev) {
  world.log.push({ tick: world.tick, ...ev });
  return ev;
}
