# 06 — MVP Roadmap

A 2–4 week vertical slice. Each milestone ends in something runnable and ends
with a **Cognitive Update** (the standing milestone rule).

## Milestone 0 — Design + Simulation Core ✅ DONE
*Goal: prove the systems form a complete loop with no graphics.*
- Architecture, TDD, gameplay loop, content pipeline, risk, roadmap docs. ✅
- Authoritative `reduce()` sim: combat, quests, progression, inventory, day/night. ✅
- Deterministic RNG + save/load round-trip. ✅
- Five data-driven content files + loader. ✅
- `npm run demo` asserts all five success criteria headless. ✅
- **Exit check:** `npm run demo` is green. ✅

## Milestone 1 — Render Spine (≈ days 3–7)
*Goal: see the world and move in it.*
- Vite + Three.js + TS scaffold; capsule third-person controller; orbit camera.
- Greybox village hub + wilderness + dungeon as boxy geometry.
- Day/night directional light driven by `world.time`.
- Input → `MOVE`/`INTERACT` commands; HUD reads `world`.
- **Exit check:** walk from village to dungeon entrance; clock visibly cycles.

## Milestone 2 — Combat & Interaction Feel (≈ days 7–12)
*Goal: the core loop is playable, not just runnable.*
- Render `ATTACK`/`DAMAGE_*` events: hit reactions, floating combat text, death.
- Soft lock-on targeting; stamina-gated attacks.
- Enemy approach/aggro behavior wired to the sim's aggression flags.
- Pickup + equip UI; consumable hotkey.
- **Exit check:** kill a husk with camera, feedback, and loot — by feel.

## Milestone 3 — Quests, Dialogue, NPCs, Save UI (≈ days 12–17)
*Goal: the full narrative spine is playable.*
- Dialogue UI reading state-keyed NPC lines; accept/turn-in flow.
- Quest log + objective tracker from `world.quests`.
- Save/load menu over the existing serialize/deserialize.
- Collectible lore fragments (environmental narrative).
- **Exit check:** accept → complete → turn in both quests entirely in-game.

## Milestone 4 — Boss, Polish & Tuning (≈ days 17–24)
*Goal: a polished, demo-ready slice.*
- Hollow King encounter: telegraphed attacks, phase at low HP, arena.
- Combat feel/tuning pass (all values are data — iterate freely).
- Audio cues, basic VFX, title + character-creation screens, dawn-returns ending.
- Greybox → first art pass where it buys the most.
- **Exit check:** a fresh player completes the whole success-criteria arc, polished.

## Buffer / cut lines (if the clock runs out)
Cut in this order, last-first: art pass → audio → second archetype's bespoke feel
→ collectible lore. **Never cut:** the end-to-end loop or save/load. A rough but
*complete* slice beats a pretty fragment — that is north star #1.

## Dependency note
M1–M4 all build on the M0 sim without modifying its contract; new player verbs
are additive commands. If a milestone slips, the sim still runs headless, so the
slice is never *un*-demoable — only less rendered.
