# 05 — Risk Analysis

Scored **likelihood × impact** on the 2–4 week slice. Mitigations marked ✅ are
already in place after Milestone 0.

## Top risks

### R1 — Renderer ends up owning state (HIGH × HIGH)
The single most expensive RPG mistake: gameplay logic creeps into the render/UI
layer, state scatters, and save/load + co-op become a rewrite.
- **Mitigation ✅** The authoritative `reduce()` seam exists and is proven
  headless *before* any renderer is written. The renderer's read-only contract is
  documented as a hard boundary (`src/render/README.md`).

### R2 — Scope creep past the slice (HIGH × HIGH)
"Just one more system" (crafting, factions, open world) eats the 2–4 weeks.
- **Mitigation** The roadmap is a fixed slice; everything else is an explicitly
  listed extension point. The success criteria are the definition of done — not a
  feature checklist.

### R3 — 3D content/art is a time sink (MED × HIGH)
Modeling, rigging, and animation can silently consume the schedule.
- **Mitigation** Greybox-first: boxy geometry and capsule characters get the loop
  shippable; art is a *polish* pass (M4), not a prerequisite. The sim already
  works with zero art.

### R4 — Data-driven content loses compile-time safety (MED × MED)
A typo'd item id ships an uncompletable quest; the failure moves from compiler to
player.
- **Mitigation** The content-pipeline validation ladder (schema → referential
  integrity → demo smoke test). The demo already fails loudly on a broken graph.

### R5 — Combat "feel" can't be proven in a headless sim (MED × MED)
The math balances on paper and in the demo, but *feel* (hit reactions, timing,
camera) only exists once rendered.
- **Mitigation** Sequence the renderer's combat feedback early (M2), reserve a
  dedicated feel/tuning pass (M4), and keep all tunables in data so iteration is a
  JSON edit, not a recompile.

### R6 — Premature co-op work (LOW × HIGH)
Building netcode now would blow the budget for a feature the slice doesn't need.
- **Mitigation** We bought *only* the cheap option (the command/event seam +
  determinism) and explicitly deferred transport, prediction, and reconciliation.
  See [ADR-0007](decisions/0007-coop-readiness.md).

### R7 — Determinism is subtly violated (LOW × MED)
A stray `Math.random()`, `Date.now()`, or unordered map iteration breaks
reproducible saves/replays.
- **Mitigation ✅** `Math.random()` is banned in `src/sim`; all rolls go through
  the seeded RNG; the save/load round-trip is asserted in the demo. A lint rule
  to enforce the ban is a cheap M1 add.

### R8 — Save format churn breaks playtesters' saves (LOW × MED)
- **Mitigation** `world.version` + a guard already exist; a migration shim slots
  in when the schema first changes.

## Risk posture

The expensive, hard-to-reverse risks (R1, R6, R7) are the ones already paid down
in Milestone 0 — that was the *point* of building the sim spine before the
graphics. The remaining risks (R2–R5, R8) are schedule/quality risks managed by
sequencing, not architecture, and are reversible.
