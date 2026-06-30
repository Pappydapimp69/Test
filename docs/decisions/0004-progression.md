# ADR-0004 — Hybrid progression: archetype + use-based skills

**Context.** Class-based gives instant identity but is rigid; skill-based is
flexible but slow to express character. The slice is short.

**Decision.** **Hybrid.** Character creation picks a data-driven **archetype**
(Warden / Seeker) that sets starting stats, skills, and kit. Play then grows
**use-based skills** (e.g. blade trains on strikes) plus per-level perks and skill
points. Archetypes are JSON templates, not code.

**Consequences.**
- + Immediate identity (archetype) + extensible growth (skills) without a class tree.
- + New archetypes are pure content.
- − Use-based skills are shallow in the slice (blade active; guard/lore seeded but
  inert) — a deliberate placeholder, tracked as an open question.

**Status.** Accepted (M0).
