# 02 — Technical Design Document

Concrete shapes for the simulation that exists today (`src/sim/`) and the
renderer that lands in Milestone 1.

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript / modern ESM JS | One language client+server; structural typing fits data-driven content. |
| Render | Three.js | Mature, code-first 3D; runs in the browser and headless-ish in CI. |
| Build/dev | Vite | Fast HMR, zero-config TS, trivial static deploy. |
| Runtime | Browser + Node 22 | Browser = the game; Node = headless sim tests/CI. |
| Persistence | JSON blob (localStorage in browser, file in Node) | The world is already plain data. |
| Netcode (future) | WebSocket, authoritative server | The seam is built; transport is deferred. |

Rationale: a code/text-only stack builds, tests, and version-controls cleanly in
an agentic/CI environment, and the simulation half runs with **zero runtime
dependencies** — proven by `npm run demo`.

## The `world` object (single source of truth)

```jsonc
{
  "version": 1,
  "seed": 20260630,
  "rng": { "seed": 20260630, "count": 142 },   // deterministic RNG cursor
  "tick": 0,
  "time": { "minutes": 540, "day": 1, "phase": "day" },
  "player": {
    "archetype": "warden", "level": 4, "xp": 30, "skillPoints": 3,
    "skills": { "blade": 4, "guard": 2, "lore": 0 },
    "base": { "power": 20, "defense": 11 },
    "hp": 165, "maxHp": 165, "stamina": 100, "maxStamina": 100,
    "location": "village_square",
    "inventory": [ { "itemId": "con_minor_salve", "qty": 2 } ],
    "equipped": { "mainhand": "wpn_ember_blade", "chest": "arm_wardplate" }
  },
  "entities": { "e1": { "id": "e1", "kind": "enemy", "typeId": "husk_wanderer", "hp": 0, "alive": false, "location": "wilderness", "looted": true } },
  "quests": { "q_clear_the_hollow": { "state": "turnedin", "progress": { "o_kill_husks": 3, "o_collect_shard": 3 } } },
  "flags": { "bossDefeated": true },
  "log": []
}
```

**Invariants** (the rules that keep saves honest):
- No functions, class instances, or renderer references ever enter `world`.
- Derived values (effective power/defense) are **computed, never stored**, so
  equipment swaps can't desync a cached stat.
- All randomness flows through `world.rng`; `Math.random()` is banned in `src/sim`.

## Modules (`src/sim/`)

| Module | Responsibility |
|---|---|
| `rng.mjs` | Deterministic mulberry32. `nextFloat/nextInt/chance` advance `rng.count`. |
| `world.mjs` | World factory, entity spawning, day/night phase math, event log. |
| `content.mjs` | Loads `data/*.json` into id-keyed maps. Content is read-only at runtime. |
| `player.mjs` | Character creation, inventory ops, **computed** effective stats. |
| `reduce.mjs` | The authoritative reducer — the only writer of `world`. |
| `save.mjs` | `serialize`/`deserialize` (+ save-version guard, log capping). |
| `demo.mjs` | Headless scripted playthrough asserting the success criteria. |

## Command set (input → simulation)

`reduce(world, command, content) → { ok, events, error? }`

| Command | Effect |
|---|---|
| `CREATE_CHARACTER {archetypeId}` | Instantiate the player from an archetype template. |
| `ACCEPT_QUEST {questId}` | Activate a quest if prereqs met; seed objective progress. |
| `ATTACK {targetId}` | Resolve one combat exchange (player hit → retaliation). |
| `USE_ITEM {itemId}` | Consume a consumable (heal). |
| `EQUIP {itemId}` | Move gear into its slot. |
| `TURN_IN_QUEST {questId}` | Validate objectives, consume quest items, grant rewards. |
| `ADVANCE_TIME {minutes, rest?}` | Advance the world clock / phase; optional rest restores. |

The M1 renderer adds `MOVE`, `INTERACT`, and `LOCK_ON` — purely additional
commands, no change to the reducer's contract.

## Combat math (slice-tuned, all in `reduce.mjs`)

```
damage      = max(1, attackerPower − defenderDefense)
crit (15%)  → round(damage × 1.5)
playerPower = base.power + weapon.power + skills.blade
playerDef   = base.defense + armor.defense + skills.guard
enemyPower  = def.power + (phase === "night" ? def.nightAggroBonus : 0)
```

An `ATTACK` is one exchange: the player strikes; if the target lives and is
aggressive, it retaliates. Night raises enemy power — the day/night cycle is a
*mechanic*, not just a lighting effect.

## Progression

- XP to reach the next level = `level × 100` (cumulative-reset model).
- Level-up: `maxHp += 15`, `power += 2`, `defense += 1`, `+1 skillPoint`, full heal.
- **Use-based skills**: repeated actions train the relevant skill (e.g. blade
  trains every 10 strikes), gated to integer gains so saves stay clean.

This is the hybrid progression: archetype sets the starting shape; play shapes
the rest.

## Quests as data

A quest is a record with typed objectives. Objective *types* (`kill`, `collect`)
are the extensible unit — adding `talk`, `reach`, or `escort` is a new case in
one switch plus JSON, never a new system. `collect` progress is recomputed from
inventory on every state change so it can never drift from what the player holds.

## Save/load

`serialize(world)` = `JSON.stringify` (log capped to the last 200 events).
`deserialize(json)` = `JSON.parse` + version guard. Content is **not** saved; it
is reloaded and rebound, so content patches apply to old saves. Because the RNG
cursor is part of the world, a reloaded game's next roll is identical to the
un-saved timeline — verified in the demo.

## Renderer plan (Milestone 1)

- Capsule-controller third-person movement; orbit camera with optional soft
  lock-on (target nearest aggressive entity, lerp camera focus).
- Scene = village hub + wilderness + dungeon, authored as simple gridded/boxy
  geometry first, art-passed later.
- A directional "sun" driven by `world.time.phase`/`minutes` for the day/night cycle.
- HUD reads `world` each frame; floating combat text and quest toasts are driven
  by the `events` array returned from `reduce`.
- **Hard rule:** the renderer calls `reduce` and reads `world`; it never assigns
  to `world`.
