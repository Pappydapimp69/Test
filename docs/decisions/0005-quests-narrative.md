# ADR-0005 — Scripted quests on a data graph; dialogue + environmental lore

**Context.** Emergent systems are seductive but unbounded; a slice needs a
hand-authored, completable arc. Narrative must ship without cutscene tech.

**Decision.** **Scripted quests** defined as data, built from typed **objectives**
(`kill`, `collect`, extensible). Narrative is delivered via **state-keyed NPC
dialogue trees** + **environmental/collectible lore**. Adding an objective *type*
is the one place content meets code (one reducer case).

**Consequences.**
- + Authorable and testable now; the demo validates the whole quest graph.
- + Objective-types-as-extension leaves room for emergent later without a rewrite.
- + No cutscene/animation dependency for story.
- − Pure scripted quests won't surprise the way emergent systems can — acceptable
  for a slice; revisit post-MVP.

**Status.** Accepted (M0).
