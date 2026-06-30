# ADR-0002 — Authoritative simulation; renderer is read-only

**Context.** RPG state is highly interconnected (combat→quests→dialogue→items→
combat). If many systems and the UI all mutate shared state, save/load and co-op
become a rewrite. This is the most expensive RPG mistake to unwind.

**Decision.** All state lives in one plain `world` object. The **only** writer is
`reduce(world, command, content)`. Input/AI/network produce *commands*; the
reducer produces *events*; the renderer consumes events + reads `world` but
**never writes** it.

**Consequences.**
- + Save/load = `JSON.stringify(world)`; one place to debug state.
- + Natural network boundary (server runs `reduce`; clients send commands).
- + Determinism possible (see ADR-0007).
- − Discipline cost: a hard "renderer never mutates" boundary the team must hold.
- − Slightly more indirection than mutating state inline.

**Status.** Accepted (M0). Proven headless before any renderer exists.
