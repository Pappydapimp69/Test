// Player creation, derived stats, and inventory helpers.
//
// Derived stats (effective power/defense) are computed from base stats + equipped
// gear on demand — never stored — so equipment swaps and save/load can never
// desync a cached number from the gear that produced it.

export function createCharacter(world, archetypeId, content) {
  const arch = content.archetypes.get(archetypeId);
  if (!arch) throw new Error(`unknown archetype: ${archetypeId}`);
  const b = arch.baseStats;
  world.player = {
    archetype: archetypeId,
    name: arch.name,
    level: 1,
    xp: 0,
    skillPoints: 0,
    skills: { ...arch.startingSkills },
    base: { power: b.power, defense: b.defense },
    hp: b.maxHp,
    maxHp: b.maxHp,
    stamina: b.maxStamina,
    maxStamina: b.maxStamina,
    location: "village_square",
    inventory: [], // [{ itemId, qty }]
    equipped: { mainhand: null, chest: null },
  };
  for (const itemId of arch.startingItems) addItem(world, itemId, 1);
  // Auto-equip the starting weapon/armor so a fresh character is combat-ready.
  for (const itemId of arch.startingItems) {
    const def = content.items.get(itemId);
    if (def && (def.type === "weapon" || def.type === "armor")) {
      equip(world, itemId, content);
    }
  }
  return world.player;
}

export function addItem(world, itemId, qty = 1) {
  const inv = world.player.inventory;
  const slot = inv.find((s) => s.itemId === itemId);
  if (slot) slot.qty += qty;
  else inv.push({ itemId, qty });
}

export function removeItem(world, itemId, qty = 1) {
  const inv = world.player.inventory;
  const slot = inv.find((s) => s.itemId === itemId);
  if (!slot || slot.qty < qty) return false;
  slot.qty -= qty;
  if (slot.qty <= 0) inv.splice(inv.indexOf(slot), 1);
  return true;
}

export function countItem(world, itemId) {
  const slot = world.player.inventory.find((s) => s.itemId === itemId);
  return slot ? slot.qty : 0;
}

export function equip(world, itemId, content) {
  const def = content.items.get(itemId);
  if (!def || !def.slot) return false;
  if (countItem(world, itemId) <= 0) return false;
  world.player.equipped[def.slot] = itemId;
  return true;
}

// Effective combat stats: base + equipped gear. Computed, never cached.
export function effectivePower(world, content) {
  const p = world.player;
  let power = p.base.power;
  const w = p.equipped.mainhand && content.items.get(p.equipped.mainhand);
  if (w && w.power) power += w.power;
  power += (p.skills.blade || 0); // skills nudge effectiveness — use-based growth
  return power;
}

export function effectiveDefense(world, content) {
  const p = world.player;
  let def = p.base.defense;
  const a = p.equipped.chest && content.items.get(p.equipped.chest);
  if (a && a.defense) def += a.defense;
  def += (p.skills.guard || 0);
  return def;
}
