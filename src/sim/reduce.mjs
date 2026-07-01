// The authoritative reducer: the ONLY place world state changes.
//
//   reduce(world, command, content) -> { ok, events, error? }
//
// Input, AI, and (later) the network layer all funnel through here. Nothing
// outside this module mutates the world. That single chokepoint is what makes
// the design co-op-ready: a server runs reduce(), clients send commands and
// receive the returned events. Single-player is just "the server is local."

import { chance, nextFloat } from "./rng.mjs";
import { logEvent, phaseFor } from "./world.mjs";
import {
  createCharacter, addItem, removeItem, countItem, equip,
  effectivePower, effectiveDefense,
} from "./player.mjs";

function xpForNextLevel(level) {
  return level * 100;
}

function awardXp(world, content, amount, events) {
  const p = world.player;
  p.xp += amount;
  events.push(logEvent(world, { type: "XP_GAINED", amount }));
  while (p.xp >= xpForNextLevel(p.level)) {
    p.xp -= xpForNextLevel(p.level);
    p.level += 1;
    p.maxHp += 15;
    p.hp = p.maxHp; // full heal on level up
    p.base.power += 2;
    p.base.defense += 1;
    p.skillPoints += 1;
    events.push(logEvent(world, { type: "LEVEL_UP", level: p.level }));
  }
}

function rollDamage(world, atk, def) {
  let dmg = Math.max(1, atk - def);
  if (chance(world.rng, 0.15)) dmg = Math.round(dmg * 1.5); // crit
  return dmg;
}

// Recompute "collect" objective progress straight from inventory so it can
// never drift from what the player actually holds.
function syncCollectObjectives(world, content) {
  for (const [qid, q] of Object.entries(world.quests)) {
    if (q.state !== "active") continue;
    const def = content.quests.get(qid);
    for (const obj of def.objectives) {
      if (obj.type === "collect") {
        q.progress[obj.id] = Math.min(obj.count, countItem(world, obj.target));
      }
    }
  }
}

function isQuestComplete(world, content, qid) {
  const def = content.quests.get(qid);
  const prog = world.quests[qid].progress;
  return def.objectives.every((o) => (prog[o.id] || 0) >= o.count);
}

function dropLoot(world, content, entity, events) {
  const def = content.enemies.get(entity.typeId);
  for (const drop of def.loot) {
    if (chance(world.rng, drop.chance)) {
      addItem(world, drop.itemId, drop.qty);
      events.push(logEvent(world, { type: "LOOT_GAINED", itemId: drop.itemId, qty: drop.qty }));
    }
  }
  entity.looted = true;
}

export function reduce(world, cmd, content) {
  const events = [];
  const fail = (error) => ({ ok: false, events, error });
  const done = () => ({ ok: true, events });

  switch (cmd.type) {
    case "CREATE_CHARACTER": {
      if (world.player) return fail("character already exists");
      createCharacter(world, cmd.archetypeId, content);
      events.push(logEvent(world, { type: "CHARACTER_CREATED", archetype: cmd.archetypeId }));
      return done();
    }

    case "ACCEPT_QUEST": {
      const def = content.quests.get(cmd.questId);
      if (!def) return fail("unknown quest");
      if (world.quests[cmd.questId]) return fail("quest already taken");
      for (const pre of def.prereq) {
        if (world.quests[pre]?.state !== "turnedin") return fail(`prereq not met: ${pre}`);
      }
      world.quests[cmd.questId] = { state: "active", progress: {} };
      for (const o of def.objectives) world.quests[cmd.questId].progress[o.id] = 0;
      syncCollectObjectives(world, content);
      events.push(logEvent(world, { type: "QUEST_ACCEPTED", questId: cmd.questId }));
      return done();
    }

    case "ATTACK": {
      const target = world.entities[cmd.targetId];
      if (!target || !target.alive) return fail("invalid target");
      const atkPower = effectivePower(world, content);
      const eDef = content.enemies.get(target.typeId);
      const dmg = rollDamage(world, atkPower, eDef.defense);
      target.hp -= dmg;
      events.push(logEvent(world, { type: "DAMAGE_DEALT", targetId: target.id, dmg }));

      // Use-based skill growth hook: blade trains on a successful strike.
      // Gated to whole-point gains so skill values stay integers (save-safe).
      world.player._bladeReps = (world.player._bladeReps || 0) + 1;
      if (world.player._bladeReps % 10 === 0) {
        world.player.skills.blade = (world.player.skills.blade || 0) + 1;
        events.push(logEvent(world, { type: "SKILL_UP", skill: "blade", value: world.player.skills.blade }));
      }

      if (target.hp <= 0) {
        target.alive = false;
        events.push(logEvent(world, { type: "ENTITY_DIED", targetId: target.id, typeId: target.typeId }));
        awardXp(world, content, eDef.xp, events);
        dropLoot(world, content, target, events);
        // Kill objectives.
        for (const [qid, q] of Object.entries(world.quests)) {
          if (q.state !== "active") continue;
          const qdef = content.quests.get(qid);
          for (const o of qdef.objectives) {
            if (o.type === "kill" && o.target === target.typeId) {
              q.progress[o.id] = Math.min(o.count, (q.progress[o.id] || 0) + 1);
            }
          }
        }
        if (eDef.isBoss) {
          world.flags.bossDefeated = true;
          events.push(logEvent(world, { type: "BOSS_DEFEATED", typeId: target.typeId }));
        }
      } else if (cmd.retaliate !== false) {
        // Turn-based exchange (headless demo/replay): the enemy strikes back now.
        // Real-time 3D passes retaliate:false and drives enemy hits via
        // ENEMY_STRIKE on its own cooldown instead.
        const nightBonus = world.time.phase === "night" ? (eDef.nightAggroBonus || 0) : 0;
        const back = rollDamage(world, eDef.power + nightBonus, effectiveDefense(world, content));
        world.player.hp = Math.max(0, world.player.hp - back);
        events.push(logEvent(world, { type: "DAMAGE_TAKEN", dmg: back }));
        if (world.player.hp <= 0) {
          world.flags.playerDown = true;
          events.push(logEvent(world, { type: "PLAYER_DOWNED" }));
        }
      }
      syncCollectObjectives(world, content);
      return done();
    }

    case "ENEMY_STRIKE": {
      // An enemy damages the player (real-time AI, renderer-driven cooldown).
      const e = world.entities[cmd.entityId];
      if (!e || !e.alive) return fail("invalid attacker");
      const def = content.enemies.get(e.typeId);
      const nightBonus = world.time.phase === "night" ? (def.nightAggroBonus || 0) : 0;
      const dmg = rollDamage(world, def.power + nightBonus, effectiveDefense(world, content));
      world.player.hp = Math.max(0, world.player.hp - dmg);
      events.push(logEvent(world, { type: "DAMAGE_TAKEN", dmg, from: e.id }));
      // Use-based growth (T7 depth): weathering blows trains the guard skill,
      // which feeds effectiveDefense. Real-time path only — golden replay unaffected.
      const pl = world.player;
      pl._guardReps = (pl._guardReps || 0) + 1;
      if (pl._guardReps % 12 === 0) { pl.skills.guard = (pl.skills.guard || 0) + 1; events.push(logEvent(world, { type: "SKILL_UP", skill: "guard", value: pl.skills.guard })); }
      if (world.player.hp <= 0) {
        world.flags.playerDown = true;
        events.push(logEvent(world, { type: "PLAYER_DOWNED" }));
      }
      return done();
    }

    case "USE_ITEM": {
      const def = content.items.get(cmd.itemId);
      if (!def || def.type !== "consumable") return fail("not a consumable");
      if (!removeItem(world, cmd.itemId, 1)) return fail("not in inventory");
      const before = world.player.hp;
      world.player.hp = Math.min(world.player.maxHp, world.player.hp + (def.heal || 0));
      events.push(logEvent(world, { type: "ITEM_USED", itemId: cmd.itemId, healed: world.player.hp - before }));
      return done();
    }

    case "EQUIP": {
      if (!equip(world, cmd.itemId, content)) return fail("cannot equip");
      events.push(logEvent(world, { type: "EQUIPPED", itemId: cmd.itemId }));
      return done();
    }

    case "TURN_IN_QUEST": {
      const q = world.quests[cmd.questId];
      const def = content.quests.get(cmd.questId);
      if (!q || q.state !== "active") return fail("quest not active");
      if (!isQuestComplete(world, content, cmd.questId)) return fail("objectives incomplete");
      // Consume collected quest items, then grant rewards.
      for (const o of def.objectives) {
        if (o.type === "collect") removeItem(world, o.target, o.count);
      }
      q.state = "turnedin";
      awardXp(world, content, def.rewards.xp, events);
      for (const itemId of def.rewards.items) {
        addItem(world, itemId, 1);
        events.push(logEvent(world, { type: "LOOT_GAINED", itemId, qty: 1 }));
      }
      events.push(logEvent(world, { type: "QUEST_TURNED_IN", questId: cmd.questId }));
      return done();
    }

    case "RESPAWN": {
      // Soft death (docs/03): revive at the village with progress intact.
      const p = world.player;
      if (!p) return fail("no character");
      if (cmd.harsh) p.xp = Math.floor(p.xp * 0.5); // harsh stakes (T5): lose half current-level XP
      p.hp = p.maxHp;
      p.location = "village_square";
      p.pos = { x: 0, z: 0 };
      world.flags.playerDown = false;
      events.push(logEvent(world, { type: "RESPAWNED", harsh: !!cmd.harsh }));
      return done();
    }

    case "MOVE": {
      // Kinematic, advisory position update from the renderer. Deliberately
      // emits NO event and NO authoritative outcome depends on float position
      // (honors tension T2: physics stays cosmetic, the sim stays deterministic).
      const p = world.player;
      if (!p) return fail("no character");
      if (!p.pos) p.pos = { x: 0, z: 0 };
      // isFinite-guard the delta (mined from Dog Park: one NaN poisons pos →
      // camera → panners → AI). Reject non-finite input at the boundary.
      const dx = Number.isFinite(cmd.dx) ? cmd.dx : 0, dz = Number.isFinite(cmd.dz) ? cmd.dz : 0;
      p.pos.x = Math.max(-60, Math.min(160, p.pos.x + dx));
      p.pos.z = Math.max(-80, Math.min(80, p.pos.z + dz));
      return done();
    }

    case "TRAVEL": {
      if (!world.player) return fail("no character");
      world.player.location = cmd.to;
      events.push(logEvent(world, { type: "TRAVELED", to: cmd.to }));
      if (cmd.minutes) reduce(world, { type: "ADVANCE_TIME", minutes: cmd.minutes }, content)
        .events.forEach((e) => events.push(e));
      return done();
    }

    case "ADVANCE_TIME": {
      const mins = cmd.minutes || 0;
      const t = world.time;
      t.minutes += mins;
      while (t.minutes >= 1440) { t.minutes -= 1440; t.day += 1; }
      const newPhase = phaseFor(t.minutes);
      if (newPhase !== t.phase) {
        t.phase = newPhase;
        events.push(logEvent(world, { type: "PHASE_CHANGED", phase: newPhase, day: t.day }));
      }
      // Passive regen while time passes (resting).
      if (cmd.rest && world.player) {
        world.player.hp = world.player.maxHp;
        world.player.stamina = world.player.maxStamina;
        events.push(logEvent(world, { type: "RESTED" }));
      }
      return done();
    }

    default:
      return fail(`unknown command: ${cmd.type}`);
  }
}
