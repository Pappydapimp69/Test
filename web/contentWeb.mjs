// Browser content loader — fetches data/*.json and indexes it with the same
// IO-free indexer the Node loader uses. Shared by the text slice (app.mjs) and
// the 3D render spine (game3d.mjs).

import { indexContent } from "../src/sim/contentIndex.mjs";

const DATA = ["items", "enemies", "quests", "npcs", "archetypes"];

export async function loadContentBrowser() {
  const raw = {};
  await Promise.all(DATA.map(async (n) => {
    const url = new URL(`../src/data/${n}.json`, import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`failed to load ${n}.json (${res.status})`);
    raw[n] = await res.json();
  }));
  return indexContent(raw);
}
