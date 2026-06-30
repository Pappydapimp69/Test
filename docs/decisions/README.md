# Decision Log (ADRs)

Short Architecture Decision Records. Each answers one of the project's seven
"Questions to Explore." Format: **Context → Decision → Consequences → Status**.
ADRs are append-only; supersede, don't edit.

| ADR | Question | Decision |
|---|---|---|
| [0001](0001-tech-stack.md) | Engine/stack | Three.js + Vite + TypeScript |
| [0002](0002-authoritative-sim.md) | Where state lives | Authoritative sim; renderer is read-only |
| [0003](0003-world-structure.md) | Open world vs hub-and-spoke | Hub-and-spoke |
| [0004](0004-progression.md) | Class vs skill progression | Hybrid: archetype + use-based skills |
| [0005](0005-quests-narrative.md) | Scripted vs emergent; narrative delivery | Scripted data-graph; dialogue + lore |
| [0006](0006-combat.md) | Real-time vs lock-on combat | Real-time + soft lock-on |
| [0007](0007-coop-readiness.md) | Co-op without a rewrite | Command/event seam + determinism, defer netcode |
