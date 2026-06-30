# Echoes of the Shattered Realm

A small but complete **3D RPG vertical slice**. A player explores a ruined world,
takes quests, fights enemies, gathers loot, and ends a fallen civilization's last
king — inside a polished, playable slice.

This repo is the **build** (the `Test` node of the cognitive-architecture
experiment). The thinking that produced it is distributed across the sibling
`ideas`, `memory`, `tension`, `creativity`, and `brain` repos — see
[`brain`](https://github.com/Pappydapimp69/brain) for the orchestration index.

## Status — Milestone 0 complete (Design + Simulation Core)

The **authoritative simulation** is built and proven. There is no 3D renderer
yet (Milestone 1), but the *systems* already form a complete game loop you can
run and watch:

```bash
npm run demo      # headless vertical-slice playthrough, asserts all success criteria
```

This drives the real game systems through a scripted command stream and verifies
the five success criteria end-to-end: **create a character → complete quests →
fight enemies → acquire loot → defeat a boss**, plus a mid-run save/load
round-trip. All assertions pass on Node 22+.

## How it's built

```
input ──commands──▶  src/sim  (authoritative, deterministic, headless)  ──events──▶  src/render (Three.js, M1)
```

- **`src/sim/`** — the entire game, as plain serializable data + one reducer.
  Deterministic seeded RNG, so saves round-trip exactly and lockstep co-op stays
  on the table. This is the only place state changes.
- **`src/data/`** — all content (items, enemies, quests, NPCs, archetypes) as
  JSON. Adding content is a data edit, never a code change.
- **`src/render/`** — presentation only (Milestone 1). Reads `world`, never mutates it.

## Documentation

| Deliverable | File |
|---|---|
| Overview & how to read | [`docs/00-overview.md`](docs/00-overview.md) |
| Architecture proposal | [`docs/01-architecture-proposal.md`](docs/01-architecture-proposal.md) |
| Technical design document | [`docs/02-technical-design.md`](docs/02-technical-design.md) |
| Gameplay loop | [`docs/03-gameplay-loop.md`](docs/03-gameplay-loop.md) |
| Content pipeline | [`docs/04-content-pipeline.md`](docs/04-content-pipeline.md) |
| Risk analysis | [`docs/05-risk-analysis.md`](docs/05-risk-analysis.md) |
| MVP roadmap | [`docs/06-mvp-roadmap.md`](docs/06-mvp-roadmap.md) |
| Assumptions & open questions | [`docs/07-assumptions-open-questions.md`](docs/07-assumptions-open-questions.md) |
| Key decisions (ADR log) | [`docs/decisions/`](docs/decisions/) |