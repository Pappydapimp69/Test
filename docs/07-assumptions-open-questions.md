# 07 — Assumptions & Open Questions

Uncertainty is preserved here on purpose, not hidden. These feed the `tension`
node of the cognitive architecture.

## Assumptions we are betting on

| # | Assumption | If wrong… |
|---|---|---|
| A1 | A browser + Three.js stack is acceptable for a "3D RPG" deliverable. | Port the renderer; the sim core is engine-agnostic and survives. |
| A2 | Greybox-first keeps the slice on schedule; art is polish, not foundation. | Schedule slips into the buffer; loop still ships. |
| A3 | A single player + ~3 enemy kinds doesn't justify a full ECS. | Promote world records to components incrementally. |
| A4 | The command/event seam is enough co-op prep; netcode can wait. | Co-op costs a transport + reconciliation layer — but no sim rewrite. |
| A5 | Deterministic lockstep is a *viable* co-op path, not just a clean save trick. | Fall back to authoritative-server+snapshots; seam still pays off. |
| A6 | Soft lock-on satisfies "lock-on combat" without a bespoke targeting system. | Build a real target manager in M2; commands already allow it. |
| A7 | Scripted quests are enough narrative for a slice. | Add emergent objective types — they're data + one reducer case. |
| A8 | The 2–4 week budget assumes one focused builder, no art outsourcing. | Re-scope content down, not systems. |

## Open questions (unresolved — owned by `tension`)

1. **Progression depth.** Use-based skills are seeded but shallow. How much
   build-divergence does a *slice* actually need before it's noise? (Currently:
   blade trains on use; guard/lore are inert. Deliberate placeholder.)
2. **Death model.** Soft respawn keeps the slice friendly, but a "fallen
   civilization" tone might want stakes. Souls-like recovery? Permadeath toggle?
   Reversible either way.
3. **Combat identity.** Real-time + soft lock-on is the plan, but feel is
   unprovable headless (R5). The real decision happens in M2 with a controller in
   hand.
4. **Save scope vs. co-op.** A single serialized `world` is perfect for
   single-player. Co-op needs per-client identity *inside* the world — when does
   that schema change land, and does it break A4's "no rewrite" promise?
5. **Content authoring ergonomics.** Hand-edited JSON scales to a slice. At what
   content volume does the lack of a validating editor start shipping broken
   quests faster than humans catch them?
6. **ECS threshold.** Systems-over-data is right *now*. What concrete signal
   (entity count? system count? a specific painful refactor) means we've crossed
   into needing a real ECS?
7. **Determinism vs. floats.** Integer/seeded determinism holds in the sim, but a
   physics-driven renderer introduces float nondeterminism. Does lockstep co-op
   then require the sim to stay physics-free? (Likely yes — flagged early.)

## Resolved during Milestone 0 (moved out of "open")

- *Engine?* → Three.js + Vite + TS ([ADR-0001](decisions/0001-tech-stack.md)).
- *World layout?* → Hub-and-spoke ([ADR-0003](decisions/0003-world-structure.md)).
- *Where does state live?* → Authoritative sim, never the renderer
  ([ADR-0002](decisions/0002-authoritative-sim.md)).
