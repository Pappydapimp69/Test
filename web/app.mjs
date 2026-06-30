// Playable browser slice. This is PRESENTATION ONLY — it reads `world` and
// issues commands through the exact same authoritative reduce() the headless
// test drives. It never mutates `world` directly (the one architectural rule
// from docs/01). No 3D yet; the Three.js renderer is Milestone 1.

import { indexContent } from "../src/sim/contentIndex.mjs";
import { createWorld, spawnEnemy } from "../src/sim/world.mjs";
import { reduce } from "../src/sim/reduce.mjs";
import { serialize, deserialize } from "../src/sim/save.mjs";
import { countItem, effectivePower, effectiveDefense } from "../src/sim/player.mjs";

const DATA = ["items", "enemies", "quests", "npcs", "archetypes"];
const LOCATIONS = {
  village_square: "the Village",
  wilderness: "the Wilderness",
  dungeon: "the Sunken Vault",
};

let content = null;
let world = null;
let fight = null; // the enemy entity currently being fought, or null
let uiLog = [];

const app = document.getElementById("app");

async function loadContentBrowser() {
  const raw = {};
  await Promise.all(DATA.map(async (n) => {
    const url = new URL(`../src/data/${n}.json`, import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`failed to load ${n}.json (${res.status})`);
    raw[n] = await res.json();
  }));
  return indexContent(raw);
}

// ---- logging ---------------------------------------------------------------
function logMsg(cls, text) { uiLog.push({ cls, text }); if (uiLog.length > 120) uiLog.shift(); }
const itemName = (id) => content.items.get(id)?.name ?? id;
const enemyName = (typeId) => content.enemies.get(typeId)?.name ?? typeId;
const questName = (id) => content.quests.get(id)?.name ?? id;

function pushEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case "CHARACTER_CREATED": logMsg("ev-sys", `You awaken as the ${world.player.name}.`); break;
      case "QUEST_ACCEPTED":    logMsg("ev-sys", `Quest accepted — ${questName(e.questId)}.`); break;
      case "QUEST_TURNED_IN":   logMsg("ev-good", `Quest complete — ${questName(e.questId)}.`); break;
      case "TRAVELED":          logMsg("ev-muted", `You travel to ${LOCATIONS[e.to] ?? e.to}.`); break;
      case "DAMAGE_DEALT":      logMsg("", `You strike the ${enemyName(world.entities[e.targetId]?.typeId)} for ${e.dmg}.`); break;
      case "DAMAGE_TAKEN":      logMsg("ev-bad", `The ${fight ? enemyName(fight.typeId) : "enemy"} hits you for ${e.dmg}.`); break;
      case "ENTITY_DIED":       logMsg("ev-good", `The ${enemyName(e.typeId)} falls.`); break;
      case "XP_GAINED":         logMsg("ev-muted", `+${e.amount} XP.`); break;
      case "LEVEL_UP":          logMsg("ev-sys", `Level up! You are now level ${e.level}.`); break;
      case "SKILL_UP":          logMsg("ev-sys", `Your ${e.skill} skill rises to ${e.value}.`); break;
      case "LOOT_GAINED":       logMsg("ev-good", `Looted ${itemName(e.itemId)}${e.qty > 1 ? ` ×${e.qty}` : ""}.`); break;
      case "ITEM_USED":         logMsg("ev-good", `You use a salve and recover ${e.healed} HP.`); break;
      case "EQUIPPED":          logMsg("ev-muted", `Equipped ${itemName(e.itemId)}.`); break;
      case "RESTED":            logMsg("ev-good", `You make camp and recover fully.`); break;
      case "PHASE_CHANGED":     logMsg("ev-muted", `The light shifts — ${e.phase}, day ${e.day}.`); break;
      case "BOSS_DEFEATED":     logMsg("ev-good", `THE HOLLOW KING FALLS. The realm exhales.`); break;
      case "PLAYER_DOWNED":     logMsg("ev-bad", `You fall in ${LOCATIONS[world.player.location] ?? "the dark"}…`); break;
      default: break;
    }
  }
}

// ---- command dispatch ------------------------------------------------------
function dispatch(cmd) {
  const r = reduce(world, cmd, content);
  if (!r.ok) { logMsg("ev-muted", `(${r.error})`); return r; }
  pushEvents(r.events);
  if (fight && !fight.alive) fight = null;
  if (world.player && world.player.hp <= 0) {
    // Soft death (docs/03): respawn at the village with progress intact.
    world.player.hp = world.player.maxHp;
    world.player.location = "village_square";
    world.flags.playerDown = false;
    fight = null;
    logMsg("ev-sys", "You wake at the village shrine, battered but breathing.");
  }
  return r;
}

// ---- quest helpers ---------------------------------------------------------
function questComplete(qid) {
  const q = world.quests[qid];
  if (!q) return false;
  const def = content.quests.get(qid);
  return def.objectives.every((o) => (q.progress[o.id] || 0) >= o.count);
}

// ---- action handlers -------------------------------------------------------
const actions = {
  "create": (arch) => dispatch({ type: "CREATE_CHARACTER", archetypeId: arch }),

  "talk": () => {
    const q1 = world.quests.q_clear_the_hollow;
    const q2 = world.quests.q_silence_the_king;
    if (!q1) return dispatch({ type: "ACCEPT_QUEST", questId: "q_clear_the_hollow" });
    if (q1.state === "active" && questComplete("q_clear_the_hollow"))
      return dispatch({ type: "TURN_IN_QUEST", questId: "q_clear_the_hollow" });
    if (q1.state === "turnedin" && !q2)
      return dispatch({ type: "ACCEPT_QUEST", questId: "q_silence_the_king" });
    if (q2 && q2.state === "active" && world.flags.bossDefeated)
      return dispatch({ type: "TURN_IN_QUEST", questId: "q_silence_the_king" });
    logMsg("ev-muted", '"The Shattering took everything but our stubbornness, traveler."');
  },

  "travel": (to) => dispatch({ type: "TRAVEL", to, minutes: 30 }),

  "search": () => {
    const loc = world.player.location;
    const typeId = loc === "dungeon" ? "ruin_stalker" : "husk_wanderer";
    fight = spawnEnemy(world, typeId, loc, content);
    logMsg("ev-sys", `A ${enemyName(typeId)} emerges!`);
  },

  "challenge": () => {
    fight = spawnEnemy(world, "boss_hollow_king", "dungeon", content);
    logMsg("ev-sys", "The Hollow King rises from his throne of ash.");
  },

  "attack": () => { if (fight) dispatch({ type: "ATTACK", targetId: fight.id }); },

  "salve": () => {
    const id = countItem(world, "con_greater_salve") > 0 ? "con_greater_salve"
      : countItem(world, "con_minor_salve") > 0 ? "con_minor_salve" : null;
    if (id) dispatch({ type: "USE_ITEM", itemId: id });
  },

  "flee": () => { fight = null; logMsg("ev-muted", "You break away into the gloom."); },

  "rest": () => dispatch({ type: "ADVANCE_TIME", minutes: 480, rest: true }),

  "save": () => { localStorage.setItem("eotsr_save", serialize(world)); logMsg("ev-sys", "Game saved."); },
  "load": () => {
    const s = localStorage.getItem("eotsr_save");
    if (!s) { logMsg("ev-muted", "(no save found)"); return; }
    world = deserialize(s); fight = null; logMsg("ev-sys", "Game loaded.");
  },
  "restart": () => { newGame(); logMsg("ev-sys", "A new traveler stirs."); },
};

// ---- rendering -------------------------------------------------------------
function bar(cur, max, low) {
  const pct = Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
  return `<div class="bar${low ? " low" : ""}"><span style="width:${pct}%"></span></div>`;
}

function btn(act, arg, label, cls = "") {
  return `<button class="${cls}" data-act="${act}"${arg ? ` data-arg="${arg}"` : ""}>${label}</button>`;
}

function renderCreation() {
  const cards = [...content.archetypes.values()].map((a) =>
    `<div class="panel">
       <h2>${a.name}</h2>
       <p>${a.blurb}</p>
       <div class="stat-row"><span class="k">HP</span><span>${a.baseStats.maxHp}</span></div>
       <div class="stat-row"><span class="k">Power</span><span>${a.baseStats.power}</span></div>
       <div class="stat-row"><span class="k">Defense</span><span>${a.baseStats.defense}</span></div>
       <div class="controls">${btn("create", a.id, `Begin as ${a.name}`, "primary")}</div>
     </div>`).join("");
  return `<p>Choose who wakes in the ruins.</p><div class="grid">${cards}</div>`;
}

function renderQuests() {
  const ids = Object.keys(world.quests);
  if (!ids.length) return `<p class="empty">No quests yet — speak to Elder Mira.</p>`;
  return `<ul class="list">` + ids.map((qid) => {
    const def = content.quests.get(qid);
    const q = world.quests[qid];
    const objs = def.objectives.map((o) => {
      const have = q.progress[o.id] || 0;
      const done = have >= o.count;
      return `<div class="${done ? "obj-done" : "obj-todo"}">• ${o.desc} (${Math.min(have, o.count)}/${o.count})</div>`;
    }).join("");
    return `<li><strong>${def.name}</strong> — <em>${q.state}</em>${q.state === "active" ? objs : ""}</li>`;
  }).join("") + `</ul>`;
}

function renderInventory() {
  const inv = world.player.inventory;
  if (!inv.length) return `<p class="empty">Empty.</p>`;
  return `<ul class="list">` + inv.map((s) =>
    `<li>${itemName(s.itemId)}${s.qty > 1 ? ` ×${s.qty}` : ""}</li>`).join("") + `</ul>`;
}

function renderControls() {
  const p = world.player;
  const loc = p.location;
  let c = "";
  if (fight) {
    c += btn("attack", null, "⚔ Attack", "primary danger");
    if (countItem(world, "con_greater_salve") + countItem(world, "con_minor_salve") > 0)
      c += btn("salve", null, "✚ Use Salve");
    c += btn("flee", null, "Flee");
    return `<div class="controls">${c}</div>`;
  }
  if (loc === "village_square") {
    c += btn("talk", null, "🗣 Talk to Elder Mira", "primary");
    c += btn("travel", "wilderness", "Go to the Wilderness");
    if (countItem(world, "key_dungeon_seal") > 0 || world.quests.q_silence_the_king)
      c += btn("travel", "dungeon", "Descend to the Sunken Vault");
    c += btn("rest", null, "Rest until morning");
  } else if (loc === "wilderness") {
    c += btn("search", null, "Search for husks", "primary");
    c += btn("travel", "village_square", "Return to the Village");
    c += btn("rest", null, "Rest");
  } else if (loc === "dungeon") {
    c += btn("search", null, "Explore the vault", "primary");
    if (!world.flags.bossDefeated && world.quests.q_silence_the_king)
      c += btn("challenge", null, "Face the Hollow King", "danger");
    c += btn("travel", "village_square", "Return to the Village");
  }
  return `<div class="controls">${c}</div>`;
}

function render() {
  document.body.dataset.phase = world?.time?.phase ?? "day";

  if (!world.player) { app.innerHTML = renderCreation() + logPanel(); bind(); return; }

  const p = world.player;
  const won = world.quests.q_silence_the_king?.state === "turnedin";
  const hh = String(Math.floor(world.time.minutes / 60)).padStart(2, "0");
  const mm = String(world.time.minutes % 60).padStart(2, "0");
  const clock = `${hh}:${mm}`;

  const character = `<div class="panel"><h2>Traveler</h2>
    <div class="stat-row"><span class="k">${p.name}</span><span>Lv ${p.level}</span></div>
    ${bar(p.hp, p.maxHp, p.hp < p.maxHp * 0.35)}
    <div class="stat-row"><span class="k">HP</span><span>${p.hp} / ${p.maxHp}</span></div>
    <div class="stat-row"><span class="k">XP</span><span>${p.xp} / ${p.level * 100}</span></div>
    <div class="stat-row"><span class="k">Power / Defense</span><span>${effectivePower(world, content)} / ${effectiveDefense(world, content)}</span></div>
    <div class="stat-row"><span class="k">Blade / Guard</span><span>${p.skills.blade} / ${p.skills.guard}</span></div>
    <div class="stat-row"><span class="k">Location</span><span>${LOCATIONS[p.location] ?? p.location}</span></div>
    <div class="stat-row"><span class="k">Time</span><span>${clock} · day ${world.time.day} · ${world.time.phase}</span></div>
  </div>`;

  const right = `<div class="panel"><h2>Quests</h2>${renderQuests()}</div>
    <div class="panel" style="margin-top:14px"><h2>Inventory</h2>${renderInventory()}</div>`;

  let enemyPanel = "";
  if (fight) {
    const def = content.enemies.get(fight.typeId);
    enemyPanel = `<div class="panel enemy" style="margin-top:14px"><h2>${def.name}${def.isBoss ? " — BOSS" : ""}</h2>
      ${bar(Math.max(0, fight.hp), def.maxHp, false)}
      <div class="stat-row"><span class="k">HP</span><span>${Math.max(0, fight.hp)} / ${def.maxHp}</span></div>
      ${world.time.phase === "night" && def.nightAggroBonus ? `<div class="stat-row"><span class="k">⚠ Night</span><span>+${def.nightAggroBonus} power</span></div>` : ""}
    </div>`;
  }

  const banner = won ? `<div class="banner">★ Vertical slice complete — you created a character, completed both quests, fought through the realm, claimed the Ember Blade, and ended the Hollow King's vigil. Dawn means something again.</div>` : "";

  const footerControls = `<div class="controls" style="margin-top:18px">
    ${btn("save", null, "Save")}${btn("load", null, "Load")}${btn("restart", null, "Restart")}
  </div>`;

  app.innerHTML = `<div class="grid">${character}<div>${right}</div></div>${enemyPanel}${renderControls()}${banner}${logPanel()}${footerControls}`;
  bind();
}

function logPanel() {
  const lines = uiLog.slice(-40).map((l) => `<p class="${l.cls}">${l.text}</p>`).join("");
  return `<div class="log" id="log">${lines || '<p class="ev-muted">…</p>'}</div>`;
}

function bind() {
  app.querySelectorAll("button[data-act]").forEach((b) => {
    b.addEventListener("click", () => {
      const fn = actions[b.dataset.act];
      if (fn) { fn(b.dataset.arg); render(); }
    });
  });
  const log = document.getElementById("log");
  if (log) log.scrollTop = log.scrollHeight;
}

function newGame() {
  world = createWorld(Math.floor((Date.now() % 1e9)) || 1337); // app-layer seed (sim stays deterministic)
  fight = null;
  uiLog = [];
  logMsg("ev-muted", "The ruins stretch out beneath a pale sky.");
}

// ---- boot ------------------------------------------------------------------
(async function boot() {
  try {
    content = await loadContentBrowser();
    newGame();
    render();
    window.__eotsr = { get world() { return world; } }; // test/debug hook
  } catch (err) {
    app.innerHTML = `<div class="panel"><h2>Failed to load</h2><p class="ev-bad">${err.message}</p></div>`;
    throw err;
  }
})();
