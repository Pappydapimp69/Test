# ADR-0007 — Co-op readiness: buy the seam, defer the netcode

**Context.** "Single-player first, but leave room for co-op without a rewrite."
Building netcode now would blow the slice budget; ignoring co-op risks an
architecture that can't accept it later.

**Decision.** Buy only the **cheap** options now:
1. **Command/event seam** (ADR-0002) — the server/client boundary already exists
   in shape; single-player is a local "server."
2. **Determinism** — one seeded RNG stream in `world`; `Math.random()` banned in
   the sim. Enables lockstep co-op *and* exact save/load + replay.
Defer the **expensive** options: transport (WebSocket), client prediction,
reconciliation, per-client identity in the world schema.

**Consequences.**
- + Co-op becomes "add a transport + reconcile," not "rewrite state ownership."
- + Determinism pays off immediately in single-player (saves, replays, repro bugs).
- − A future co-op schema change (per-client identity inside `world`) is a real,
  unfinished question — see open question #4; the "no rewrite" promise covers the
  *sim spine*, not the netcode itself.
- − Determinism constrains the renderer: physics-driven float nondeterminism must
  stay out of the authoritative sim (open question #7).

**Status.** Accepted (M0).
