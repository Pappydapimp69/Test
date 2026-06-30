// Content loader — turns the data/*.json files into fast lookup maps.
//
// Code is systems; content is data. The sim never hard-codes an item, enemy,
// quest, or line of dialogue — it only knows *shapes*. Adding content is a JSON
// edit, never a code change. This is the seam the content pipeline plugs into.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

async function loadJson(name) {
  return JSON.parse(await readFile(join(DATA_DIR, name), "utf8"));
}

function byId(arr) {
  const m = new Map();
  for (const x of arr) m.set(x.id, x);
  return m;
}

export async function loadContent() {
  const [items, enemies, quests, npcs, archetypes] = await Promise.all([
    loadJson("items.json"),
    loadJson("enemies.json"),
    loadJson("quests.json"),
    loadJson("npcs.json"),
    loadJson("archetypes.json"),
  ]);
  return {
    items: byId(items.items),
    enemies: byId(enemies.enemies),
    quests: byId(quests.quests),
    npcs: byId(npcs.npcs),
    archetypes: byId(archetypes.archetypes),
  };
}
