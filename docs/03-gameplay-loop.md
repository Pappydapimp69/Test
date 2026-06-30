# 03 — Gameplay Loop

## Core loop (seconds to minutes)

```
        ┌─────────────────────────────────────────────┐
        ▼                                             │
   EXPLORE ──▶ ENGAGE ──▶ RESOLVE ──▶ REWARD ──▶ SPEND/EQUIP
   (wilderness, (real-time  (kill / flee  (XP, loot,   (level perks,
    dungeon)     combat,     / heal)       quest tick)  gear, salves)
                 lock-on)                                   │
        ▲                                                   │
        └───────────────────────────────────────────────────┘
```

Each verb maps to a command the simulation already understands:
`MOVE`/`INTERACT` → explore, `ATTACK` → engage, the reducer's combat resolution →
resolve, `LOOT_GAINED`/`XP_GAINED`/`LEVEL_UP` events → reward, `EQUIP`/`USE_ITEM`
→ spend.

## Session loop (a 20–40 minute sitting)

1. **Arrive in the village hub.** Talk to Elder Mira; accept *Clear the Hollow*.
2. **Sortie into the wilderness.** Fight Husk Wanderers, gather Husk Shards,
   manage HP with salves. Watch the light: dusk is coming and husks hit harder at
   night.
3. **Return and turn in.** Bigger reward, a level or two, and the Cracked Seal —
   which gates the dungeon.
4. **Descend the Sunken Vault.** Tougher Ruin Stalkers, tighter resource
   pressure, the night-aggro mechanic now mandatory to respect.
5. **The boss.** The Hollow King is a stamina/positioning test, not a numbers
   wall: ~6× a normal enemy's HP, punishing if you fight him carelessly at night.
6. **Resolution.** Loot the Ember Blade + Wardplate, turn in *Silence the King*,
   dawn returns. Credits-worthy beat.

This is exactly the path `npm run demo` walks today — the loop is real before the
graphics are.

## The three tensions that make it a *game*

1. **Risk vs. clock.** The day/night cycle turns "one more fight" into a real
   decision: push deeper before night, or bank your loot.
2. **Resource vs. greed.** Salves are finite and quest items occupy the same
   mental budget as healing. Do you spend the Greater Salve now or save it for
   the boss?
3. **Build vs. breadth.** Skill points and gear let the Warden tank or the Seeker
   burst — the slice is short, but the archetype choice changes how you solve it.

## Pacing targets (slice)

| Beat | Target time | Player level |
|---|---|---|
| Character creation → first fight | < 2 min | 1 |
| First quest complete | ~8–12 min | 2–3 |
| Dungeon entrance | ~15 min | 3 |
| Boss defeated | ~25–35 min | 4–5 |

## Failure & recovery

Death is **soft** for the slice: on `PLAYER_DOWNED` the player respawns at the
village with progress intact (quest state and loot persist; the dungeon
repopulates). This keeps the slice friendly to test and demo while leaving the
hooks for a harsher death model later (a `flags.deaths` counter is already cheap
to add). This is a deliberate, reversible choice — flagged in open questions.
