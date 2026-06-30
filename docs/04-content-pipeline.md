# 04 — Content Pipeline

## Principle

> **Code is systems; content is data. Adding content is a JSON edit, never a code change.**

The reducer knows *shapes* (an item has a `slot` and maybe `power`; a quest has
typed objectives). It never names a specific sword or husk. Everything nameable
lives in `src/data/*.json`.

## The five content files

| File | Defines | Keyed by |
|---|---|---|
| `archetypes.json` | starting templates (stats, skills, kit) | `id` |
| `items.json` | weapons, armor, consumables, materials, keys | `id` |
| `enemies.json` | stats, XP, loot tables, `nightAggroBonus`, `isBoss` | `id` |
| `quests.json` | summary, prereqs, typed objectives, rewards | `id` |
| `npcs.json` | location, quests given, state-keyed dialogue | `id` |

References between files are by id (`giver`, `loot[].itemId`, `rewards.items`,
`startingItems`). The loader (`content.mjs`) turns each array into an id-keyed
`Map` for O(1) lookup.

## Authoring workflows (no engine, no rebuild)

**Add an item** → append one object to `items.json`. Referenceable immediately by
any loot table, reward, or starting kit.

**Add an enemy** → append to `enemies.json` with a loot table referencing
existing item ids. Spawn it from any location.

**Add a quest** → append to `quests.json` with objectives built from existing
*types* (`kill`, `collect`). Wire a giver NPC's `givesQuests` and dialogue keys.

**Add a quest objective type** (e.g. `talk`, `reach`, `escort`) → the one place
that needs code: a new case in the reducer's objective-progress logic. This is
the deliberate seam between "content" (free) and "mechanics" (cheap, but code).

**Add dialogue** → NPC dialogue is keyed by `"<questId>.<state>"`
(`offer`/`active`/`turnin`) with a `default` fallback, so dialogue tracks quest
state with zero branching code.

## Validation (the safety net)

A content edit is the cheapest place to introduce a silent break (a typo in an
item id ships a quest that can never complete). Planned guardrails, in order of
cost:

1. **JSON Schema** per content type (`src/data/schema/`) — catches malformed records.
2. **Referential integrity check** — every `itemId`/`target`/`giver`/quest
   prereq resolves to a real id; every quest is *completable* (its collect/kill
   targets exist and drop/spawn somewhere). Runs in CI and as a pre-demo step.
3. **The headless demo as a smoke test** — `npm run demo` exercises the live
   content graph end-to-end; a broken reference fails the run loudly.

This mirrors a hard-won lesson recorded in `memory`: *data-driven content trades
compile-time safety for a validation step you must build deliberately, or
breakage moves from the compiler to the player.*

## Future pipeline extensions (not in the slice)

- A thin authoring GUI that writes the same JSON (the format is the contract, so
  a tool is additive).
- Hot-reload of content in dev (the loader already isolates data from systems).
- Localization: dialogue strings become keys into a locale table — a content
  concern, not a systems one.
