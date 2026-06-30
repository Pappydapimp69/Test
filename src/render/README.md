# Presentation layer (Milestone 1)

This directory is intentionally a stub. **It contains no game logic and never will.**

The architecture (see [`docs/01-architecture-proposal.md`](../../docs/01-architecture-proposal.md))
splits the game into two halves connected by a one-way seam:

```
input ──commands──▶  SIMULATION (src/sim, authoritative)  ──events──▶  PRESENTATION (src/render)
                         owns all state                                  owns nothing, renders state
```

The simulation half is **built and proven** today (`npm run demo` runs the full
vertical-slice loop headlessly). The presentation half lands in Milestone 1:

- **Stack:** Three.js + Vite + TypeScript (pure code/text, builds & runs in CI and the browser).
- **Job:** read `world` each frame, draw the third-person scene, translate input
  (WASD + camera) into `MOVE`/`ATTACK`/`INTERACT` commands, play the day/night
  lighting from `world.time.phase`.
- **Rule it must obey:** it may *read* `world` but must never mutate it. Every
  change goes through `reduce()`. Breaking this rule is the one thing that would
  cost us co-op later, so it is a hard architectural boundary, not a style guide.

Why the seam first? See `docs/05-risk-analysis.md` — "renderer owns state" is the
single most expensive RPG mistake to unwind, so we paid it down on day one.
