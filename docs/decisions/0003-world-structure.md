# ADR-0003 — Hub-and-spoke world, not open world

**Context.** "Small explorable world (one village + wilderness)" plus a 2–4 week
budget and a polish-over-volume mandate.

**Decision.** **Hub-and-spoke**: a village hub (NPCs, quests, respawn) with
spokes — wilderness and one dungeon. Locations are named tags on entities now;
real geometry per location in M1.

**Consequences.**
- + A hub is far cheaper to author and polish than seamless open terrain.
- + Clear pacing gates (seal item gates the dungeon spoke).
- + Spokes are independently addable content (new spoke = new location tag + geometry).
- − Less exploratory freedom than open world — out of scope for the slice anyway.

**Status.** Accepted (M0).
