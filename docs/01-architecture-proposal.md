# 01 — Architecture Proposal

## The one decision everything else hangs on

> **The simulation is authoritative and lives apart from the renderer. Input
> produces *commands*; the simulation consumes commands and produces *events*;
> the renderer consumes events and state but never writes back.**

```
        ┌────────────┐   commands   ┌───────────────────────┐   events   ┌────────────┐
 input ─▶  intent     ├─────────────▶│  SIMULATION (src/sim)  ├───────────▶│ presentation│
        │  mapping   │              │  • owns ALL state      │            │ (src/render)│
        └────────────┘              │  • reduce() only       │            │ • read-only │
                                    │  • deterministic RNG   │◀───────────┤ • Three.js  │
                                    └───────────────────────┘   reads     └────────────┘
```

Everything else in this document is downstream of that seam. We adopt it on day
one because it is *cheap now and ruinously expensive to retrofit* (see
[ADR-0007](decisions/0007-coop-readiness.md) and the risk analysis).

## Why this shape

A 3D RPG accretes systems that all want to touch the same state: combat changes
HP, which changes quest progress, which unlocks dialogue, which grants items,
which changes combat. If each system mutates shared state wherever it likes, the
game becomes a web of order-dependent side effects — the classic RPG tar pit.
Funnelling every mutation through a single `reduce(world, command)` function
gives us:

- **One place to look** when state is wrong.
- **Trivial save/load** — the world is plain data; a save is `JSON.stringify`.
- **Determinism** — same seed + same command stream = same outcome, which gives
  us replay, reproducible bug reports, and the lockstep option for co-op.
- **A natural network boundary** — the server runs `reduce`, clients send
  commands and render events. Single-player is the same code with a local "server."

## Layered view

| Layer | Owns | Knows about | Lives in |
|---|---|---|---|
| **Content** | items, enemies, quests, NPCs, archetypes | nothing | `src/data/*.json` |
| **Simulation** | the `world` object + all rules | content (read-only) | `src/sim/` |
| **Presentation** | meshes, camera, lighting, HUD, audio | the `world` (read-only) + events | `src/render/` (M1) |
| **Platform** | window, render loop, input device, storage | presentation | `src/main.ts` (M1) |

Dependencies point **downward only**. The simulation must compile and run with
no renderer present — proven today by `npm run demo`, which plays the whole slice
in a terminal.

## Architectural style: "systems over data," not a full ECS

We deliberately stop short of a formal Entity-Component-System. The slice has a
handful of entity kinds (player, enemy, NPC) and a single player. A full ECS
would be ceremony without payoff. Instead:

- The `world` holds plain records keyed by id.
- "Systems" are pure-ish functions inside `reduce` (combat, quests, progression,
  day/night) that read and write the world in a defined order.
- If entity count or variety later explodes, the records can be promoted to
  components incrementally — the data is already a flat, serializable bag.

This is captured as a tension, not a settled truth (see
[07 Open Questions](07-assumptions-open-questions.md)): *systems-over-data is the
right call for a slice; it may not survive contact with a full game.*

## The seven project questions, answered

Each is an ADR in [`decisions/`](decisions/); summarized here.

| Question | Decision | One-line rationale |
|---|---|---|
| Class vs skill progression | **Hybrid** — pick an archetype (data template), grow via use-based skills + level perks | Archetype gives instant identity; skills give extensibility. |
| Open world vs hub-and-spoke | **Hub-and-spoke** | Matches the slice scope; a hub is cheaper to polish than open terrain. |
| Scripted vs emergent quests | **Scripted on a data-driven quest graph** | Authorable now, with objective *types* that leave room for emergent later. |
| Real-time vs lock-on combat | **Real-time action with optional soft lock-on** | Reads as "3D RPG"; lock-on is a camera/targeting layer, not a combat rewrite. |
| Narrative delivery | **NPC dialogue trees + environmental + collectible lore** | All data-driven; no cutscene tech needed for the slice. |
| What is data-driven | **All content; systems stay in code** | Items, enemies, quests, dialogue, loot, day/night config = JSON. |
| Co-op without a rewrite | **Command/event seam + deterministic sim from day one** | Defer netcode; never let the renderer own state. |

## What we are explicitly NOT building in the slice

Networking transport, a quest editor GUI, procedural generation, an ECS,
physics beyond capsule-vs-ground, and any optimization pass. Each is a known
extension point, listed in the roadmap, not a gap.
