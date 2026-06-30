# ADR-0006 — Real-time action combat with optional soft lock-on

**Context.** "Real-time or lock-on?" is a false binary — lock-on is a targeting/
camera layer over real-time, not a different combat model. The deliverable must
read as a "3D RPG."

**Decision.** **Real-time** action combat. Targeting offers **optional soft
lock-on** (lock the nearest aggressive entity; camera lerps to frame it). The sim
resolves combat as discrete exchanges (`ATTACK` command); lock-on is a renderer/
input concern (`LOCK_ON` command) that picks the target id — no change to combat
math.

**Consequences.**
- + One combat model; lock-on is additive and cuttable.
- + Sim stays headless-testable (targeting is just "which id").
- − "Feel" (timing, reactions, camera) is unprovable until M2 with a controller —
  the real validation is deferred and explicitly risk-tracked (R5).

**Status.** Accepted (M0); feel validated in M2.
