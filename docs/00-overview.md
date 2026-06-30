# 00 — Overview

**Echoes of the Shattered Realm** is a single-player 3D action-RPG vertical
slice: one village hub, a stretch of wilderness, one dungeon, one boss. The goal
of Milestone 0 is not content — it is a *spine* strong enough that content,
polish, and (eventually) co-op can be hung on it without a rewrite.

## The one-paragraph pitch

You wake in the ruins of a civilization undone by an event called the Shattering.
The village of survivors clings to a guttering seal. Elder Mira sends you into
the wilderness to thin the husks and recover proof the seal still holds; that
proof opens the Sunken Vault, where the realm's last king keeps a hollow vigil.
End him, and dawn means something again.

## How to read this design set

Read in order; each doc assumes the one before it.

1. **[01 Architecture proposal](01-architecture-proposal.md)** — the shape of the
   system and *why* (the load-bearing decisions, including the co-op seam).
2. **[02 Technical design](02-technical-design.md)** — concrete data model,
   modules, combat math, save format.
3. **[03 Gameplay loop](03-gameplay-loop.md)** — minute-to-minute and
   session-to-session player experience.
4. **[04 Content pipeline](04-content-pipeline.md)** — how items/enemies/quests
   get authored and validated without touching code.
5. **[05 Risk analysis](05-risk-analysis.md)** — what can sink the slice and the
   chosen mitigations.
6. **[06 MVP roadmap](06-mvp-roadmap.md)** — the 2–4 week plan, milestone by milestone.
7. **[07 Assumptions & open questions](07-assumptions-open-questions.md)** — what
   we are betting on and what is still unresolved.
8. **[decisions/](decisions/)** — short ADRs answering the project's seven
   "Questions to Explore."

## Design north stars (in priority order)

1. **A playable slice beats a feature list.** Every decision is judged by whether
   it gets a polished end-to-end loop sooner.
2. **Simple, extensible systems over content volume.** One quest type done
   data-driven beats five hard-coded ones.
3. **Don't pay for co-op now; don't make it impossible later.** We buy the cheap
   architectural option (the command/event seam) and defer the expensive one
   (netcode).
4. **Avoid premature optimization.** Correctness and clarity first; the slice is
   tiny enough that it doesn't matter yet.
