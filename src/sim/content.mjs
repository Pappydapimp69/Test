// Content loader (Node) — reads data/*.json from disk and indexes it.
//
// Code is systems; content is data. The sim never hard-codes an item, enemy,
// quest, or line of dialogue — it only knows *shapes*. The actual indexing is
// in contentIndex.mjs (IO-free) so the browser app can share it via fetch.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { indexContent } from "./contentIndex.mjs";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

async function loadJson(name) {
  return JSON.parse(await readFile(join(DATA_DIR, name), "utf8"));
}

export async function loadContent() {
  const [items, enemies, quests, npcs, archetypes] = await Promise.all([
    loadJson("items.json"),
    loadJson("enemies.json"),
    loadJson("quests.json"),
    loadJson("npcs.json"),
    loadJson("archetypes.json"),
  ]);
  return indexContent({ items, enemies, quests, npcs, archetypes });
}
