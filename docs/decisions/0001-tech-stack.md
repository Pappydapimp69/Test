# ADR-0001 — Tech stack: Three.js + Vite + TypeScript

**Context.** Need a 3D RPG slice in 2–4 weeks, buildable/testable in an
agentic + CI environment, single-player now with room for co-op. No fixed engine.

**Decision.** Browser stack: **Three.js** (render), **Vite** (build/dev),
**TypeScript/ESM** (one language client+server). The simulation core has **zero
runtime dependencies** and runs under Node for headless tests.

**Consequences.**
- + Pure code/text — version-controls, diffs, and builds cleanly; no binary editor.
- + Same language and data model client and (future) server.
- + Sim verifiable headless in CI (`npm run demo`).
- − Three.js gives less out-of-the-box than Unity/Godot (animation, physics) —
  acceptable for a greybox slice; revisit if content scope grows.
- Engine risk is isolated: the sim is engine-agnostic, so a future port is a
  renderer swap, not a rewrite.

**Status.** Accepted (M0).
