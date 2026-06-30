// Pure, environment-agnostic content indexing — NO node/browser-specific imports.
//
// Both the Node loader (content.mjs, via fs) and the browser app (via fetch)
// parse the JSON themselves and hand the raw objects here. Keeping this module
// free of any IO is what lets the exact same sim run headless in Node and live
// in the browser.

function byId(arr) {
  const m = new Map();
  for (const x of arr) m.set(x.id, x);
  return m;
}

// raw = { items, enemies, quests, npcs, archetypes } — each the parsed JSON file.
export function indexContent(raw) {
  return {
    items: byId(raw.items.items),
    enemies: byId(raw.enemies.enemies),
    quests: byId(raw.quests.quests),
    npcs: byId(raw.npcs.npcs),
    archetypes: byId(raw.archetypes.archetypes),
  };
}
