// Milestone 1 — the Render Spine.
//
// PRESENTATION ONLY. It reads `world` and issues commands (MOVE / TRAVEL /
// ACCEPT_QUEST / …) through the same authoritative reduce() the headless test
// drives. It never mutates `world` directly. The 3D is greybox by design
// (docs/06 M1); combat *feel* is M2.
//
// Retrieved lessons applied (Brain → memory):
//   • lockstep E6  → clamp max frame delta (a tab stall must not jump the clock
//                    or teleport the player).
//   • [input][coop] → edge-gate the interact key so one press fires once.
//   • [phaser][vite] → guard the single canvas/loop owner against double-init.
// Honors tension T2: movement is kinematic & cosmetic; no authoritative
// outcome depends on float position, so the sim stays deterministic.

import * as THREE from "./vendor/three.module.js";
import { loadContentBrowser } from "./contentWeb.mjs";
import { createWorld } from "../src/sim/world.mjs";
import { reduce } from "../src/sim/reduce.mjs";
import { countItem } from "../src/sim/player.mjs";

const TIME_SCALE = 3;        // in-game minutes per real second (~8 min/day)
const MOVE_SPEED = 14;       // world units / second
const MAX_DT = 0.1;          // clamp (lockstep E6) — seconds
const INTERACT_RANGE = 8;

const DUNGEON_X = 108;       // entrance; zone math below
function zoneFor(x) {
  if (x >= 96) return "dungeon";
  if (x >= 34) return "wilderness";
  return "village_square";
}
const ZONE_LABEL = { village_square: "The Village", wilderness: "The Wilderness", dungeon: "The Sunken Vault" };

// ---- module state ----------------------------------------------------------
let content, world;
let renderer = null, scene = null, camera = null, webgl = false;
let playerMesh = null, miraMesh = null, sun = null, hemi = null;
let camYaw = -Math.PI / 2, camPitch = 0.34; // start looking east (toward the vault)
const keys = new Set();
let lastT = 0, started = false;
const facing = new THREE.Vector3(1, 0, 0);

const el = (id) => document.getElementById(id);

// ---- toasts / HUD ----------------------------------------------------------
function toast(text, cls = "") {
  const t = el("toast"); if (!t) return;
  const p = document.createElement("p"); p.className = cls; p.textContent = text;
  t.appendChild(p); setTimeout(() => p.remove(), 5000);
}
function describeToast(events) {
  for (const e of events) {
    if (e.type === "QUEST_ACCEPTED") toast(`Quest accepted — ${content.quests.get(e.questId).name}`, "sys");
    else if (e.type === "QUEST_TURNED_IN") toast(`Quest complete — ${content.quests.get(e.questId).name}`, "good");
    else if (e.type === "LOOT_GAINED") toast(`Looted ${content.items.get(e.itemId).name}`, "good");
    else if (e.type === "LEVEL_UP") toast(`Level up — ${e.level}!`, "sys");
    else if (e.type === "PHASE_CHANGED") toast(`${e.phase} settles over the realm`, "");
    else if (e.type === "RESTED") toast("You rest until the light returns.", "good");
  }
}
function dispatch(cmd) {
  const r = reduce(world, cmd, content);
  if (r.ok) describeToast(r.events);
  return r;
}

// ---- interaction -----------------------------------------------------------
function nearMira() {
  if (!world.player.pos) return false;
  const dx = world.player.pos.x - MIRA_POS.x, dz = world.player.pos.z - MIRA_POS.z;
  return Math.hypot(dx, dz) < INTERACT_RANGE;
}
function atVaultGate() {
  return world.player.pos && world.player.pos.x >= DUNGEON_X - 4;
}
function questComplete(qid) {
  const q = world.quests[qid]; if (!q) return false;
  return content.quests.get(qid).objectives.every((o) => (q.progress[o.id] || 0) >= o.count);
}
function talkToMira() {
  const q1 = world.quests.q_clear_the_hollow, q2 = world.quests.q_silence_the_king;
  if (!q1) return dispatch({ type: "ACCEPT_QUEST", questId: "q_clear_the_hollow" });
  if (q1.state === "active" && questComplete("q_clear_the_hollow"))
    return dispatch({ type: "TURN_IN_QUEST", questId: "q_clear_the_hollow" });
  if (q1.state === "turnedin" && !q2) return dispatch({ type: "ACCEPT_QUEST", questId: "q_silence_the_king" });
  toast('"The husks press closer each dusk. The wilderness lies east."', "");
}
function interact() {
  if (nearMira()) return talkToMira();
  if (atVaultGate()) {
    world.flags.reachedVault = true; // M1 exit beat
    toast("The Sunken Vault yawns open before you. (Descent & combat: Milestone 2)", "sys");
    return;
  }
  toast("Nothing to interact with here.", "");
}

// ---- scene build -----------------------------------------------------------
const MIRA_POS = { x: 0, z: 6 };
function tryInitRenderer() {
  try {
    const canvas = el("scene");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    webgl = true;
  } catch (err) {
    webgl = false; // headless / no-GL: keep logic loop, skip rendering
    console.warn("WebGL unavailable, running render spine headless:", err.message);
  }
}

function boxZone(x0, x1, color) {
  const g = new THREE.PlaneGeometry(x1 - x0, 140);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x0 + x1) / 2, 0, 0);
  mesh.receiveShadow = true;
  return mesh;
}
function box(w, h, d, color, x, y, z, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .9 }));
  mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true;
  return mesh;
}
function cone(r, h, color, x, z) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  mesh.position.set(x, h / 2, z); mesh.castShadow = true;
  return mesh;
}

function setupScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0c12, 60, 200);
  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);

  hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a2620, 0.85);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120; sun.shadow.camera.far = 400;
  scene.add(sun);
  scene.add(sun.target);

  scene.add(boxZone(-40, 34, 0x3c4a3a));   // village turf
  scene.add(boxZone(34, 96, 0x5a4d33));     // wilderness scrub
  scene.add(boxZone(96, 160, 0x23222b));    // vault approach

  // Village: a few huts + Elder Mira.
  for (const [x, z] of [[-14, -8], [-20, 6], [-8, 12], [12, -10], [16, 8]]) {
    scene.add(box(6, 5, 6, 0x6b5b46, x, 2.5, z));
    scene.add(box(7, 1.4, 7, 0x4a3c2c, x, 5.4, z)); // roof slab
  }
  miraMesh = box(1.4, 3, 1.4, 0xcaa24b, MIRA_POS.x, 1.5, MIRA_POS.z);
  scene.add(miraMesh);
  const marker = box(0.8, 0.8, 0.8, 0xffe08a, MIRA_POS.x, 4, MIRA_POS.z, false);
  marker.rotation.y = Math.PI / 4; miraMesh.userData.marker = marker; scene.add(marker);

  // Wilderness: deterministic scatter of "trees" + a couple of cairns.
  const trees = [[42, -14], [50, 10], [58, -6], [66, 16], [72, -18], [80, 4], [88, -10], [46, 22], [62, -24], [84, 20]];
  for (const [x, z] of trees) { scene.add(cone(2.4, 9, 0x2f3d2a, x, z)); scene.add(box(1, 3, 1, 0x4a3826, x, 1.5, z)); }

  // The Sunken Vault gate.
  scene.add(box(3, 12, 3, 0x15161d, DUNGEON_X - 4, 6, -7));
  scene.add(box(3, 12, 3, 0x15161d, DUNGEON_X - 4, 6, 7));
  scene.add(box(14, 3, 3, 0x15161d, DUNGEON_X - 4, 12, 0));
  scene.add(box(7, 9, 1, 0x000000, DUNGEON_X - 4, 5, 0, false)); // dark doorway

  // Player avatar: capsule + a nose box for facing.
  playerMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1, 2, 6, 12), new THREE.MeshStandardMaterial({ color: 0xcfd6e6, roughness: .7 }));
  body.position.y = 2; body.castShadow = true;
  const nose = box(0.5, 0.5, 1.2, 0x9aa6c4, 0, 2, 1.1);
  playerMesh.add(body); playerMesh.add(nose);
  scene.add(playerMesh);
}

// ---- day/night -------------------------------------------------------------
const SKY = { dawn: 0x46506b, day: 0x8fb6e8, dusk: 0x3b2a3a, night: 0x070810 };
const SUNC = { dawn: 0xffb27a, day: 0xfff4dc, dusk: 0xff8a5c, night: 0x4a5a86 };
function applyTimeOfDay() {
  const m = world.time.minutes, phase = world.time.phase;
  const ang = (m / 1440) * Math.PI * 2 - Math.PI / 2; // sun arc over the day
  if (!webgl) return;
  sun.position.set(Math.cos(ang) * 120, Math.max(6, Math.sin(ang) * 120), 40);
  sun.target.position.set(world.player.pos.x, 0, world.player.pos.z);
  const dayness = Math.max(0.04, Math.sin(ang)); // 0 at night, 1 at noon
  sun.intensity = phase === "night" ? 0.18 : 0.6 + dayness;
  sun.color.setHex(SUNC[phase]); hemi.intensity = phase === "night" ? 0.32 : 0.85;
  const sky = new THREE.Color(SKY[phase]);
  scene.background = sky; scene.fog.color.copy(sky);
}

// ---- per-frame -------------------------------------------------------------
function applyMovement(dt) {
  let ix = 0, iz = 0;
  if (keys.has("w")) iz += 1; if (keys.has("s")) iz -= 1;
  if (keys.has("a")) ix -= 1; if (keys.has("d")) ix += 1;
  if (!ix && !iz) return;
  // forward = horizontal direction from camera toward player (where we look)
  const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const move = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix);
  if (move.lengthSq() === 0) return;
  move.normalize().multiplyScalar(MOVE_SPEED * dt);
  facing.copy(move).normalize();
  dispatch({ type: "MOVE", dx: move.x, dz: move.z });
}

function syncZone() {
  const z = zoneFor(world.player.pos.x);
  if (z !== world.player.location) {
    dispatch({ type: "TRAVEL", to: z });
    toast(`Entering ${ZONE_LABEL[z]}`, "sys");
  }
}

function updateCamera() {
  if (!webgl) return;
  const p = world.player.pos;
  playerMesh.position.set(p.x, 0, p.z);
  playerMesh.rotation.y = Math.atan2(facing.x, facing.z);
  if (miraMesh.userData.marker) miraMesh.userData.marker.rotation.y += 0.02;
  const dist = 16;
  const off = new THREE.Vector3(
    Math.sin(camYaw) * Math.cos(camPitch),
    Math.sin(camPitch) + 0.35,
    Math.cos(camYaw) * Math.cos(camPitch)
  ).multiplyScalar(dist);
  camera.position.set(p.x + off.x, Math.max(3, off.y + 3), p.z + off.z);
  camera.lookAt(p.x, 2, p.z);
}

function updateHud() {
  const p = world.player, t = world.time;
  const hh = String(Math.floor(t.minutes / 60) % 24).padStart(2, "0");
  const mm = String(Math.floor(t.minutes % 60)).padStart(2, "0");
  el("clock").textContent = `${hh}:${mm} · day ${t.day} · ${t.phase}`;
  el("zone").textContent = ZONE_LABEL[world.player.location] ?? world.player.location;
  el("pname").textContent = p.name; el("plevel").textContent = `Lv ${p.level}`;
  const fill = el("hpfill"); const pct = Math.round((p.hp / p.maxHp) * 100);
  fill.style.width = pct + "%"; fill.classList.toggle("low", p.hp < p.maxHp * 0.35);
  el("hptext").textContent = `${p.hp} / ${p.maxHp} HP`;

  // active quest tracker
  const qid = Object.keys(world.quests).find((id) => world.quests[id].state === "active");
  const qbox = el("quest");
  if (qid) {
    const def = content.quests.get(qid), q = world.quests[qid];
    qbox.innerHTML = `<div class="qname">${def.name}</div>` + def.objectives.map((o) => {
      const have = Math.min(q.progress[o.id] || 0, o.count), done = have >= o.count;
      return `<div class="${done ? "obj-done" : "obj-todo"}">• ${o.desc} (${have}/${o.count})</div>`;
    }).join("");
  } else qbox.innerHTML = "";

  const pr = el("prompt");
  if (nearMira()) { pr.textContent = "Press E — speak with Elder Mira"; pr.classList.add("show"); }
  else if (atVaultGate()) { pr.textContent = "Press E — approach the Vault gate"; pr.classList.add("show"); }
  else pr.classList.remove("show");
}

function frame(now) {
  const dt = Math.min(MAX_DT, (now - lastT) / 1000 || 0); // clamp (memory: lockstep E6)
  lastT = now;
  dispatch({ type: "ADVANCE_TIME", minutes: dt * TIME_SCALE });
  applyMovement(dt);
  syncZone();
  applyTimeOfDay();
  updateCamera();
  updateHud();
  if (webgl) renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---- input -----------------------------------------------------------------
function bindInput() {
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "e") { if (!keys.has("e")) interact(); keys.add("e"); return; } // edge-gate
    if (k === "r") { if (!keys.has("r")) dispatch({ type: "ADVANCE_TIME", minutes: 480, rest: true }); keys.add("r"); return; }
    keys.add(k);
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  let dragging = false, px = 0, py = 0;
  const canvas = el("scene");
  canvas.addEventListener("pointerdown", (e) => { dragging = true; px = e.clientX; py = e.clientY; });
  addEventListener("pointerup", () => { dragging = false; });
  addEventListener("pointermove", (e) => {
    if (!dragging) return;
    camYaw -= (e.clientX - px) * 0.005; camPitch = Math.max(0.1, Math.min(1.2, camPitch + (e.clientY - py) * 0.004));
    px = e.clientX; py = e.clientY;
  });
  addEventListener("resize", () => {
    if (!webgl) return;
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

// ---- boot ------------------------------------------------------------------
(async function boot() {
  if (started) return; started = true; // guard double-init (memory: [vite] global owner)
  try {
    content = await loadContentBrowser();
    world = createWorld(Math.floor(Date.now() % 1e9) || 1337);
    dispatch({ type: "CREATE_CHARACTER", archetypeId: "warden" });
    tryInitRenderer();
    if (webgl) setupScene();
    bindInput();
    el("boot").classList.add("hidden");

    // test/debug hook — drives the exact same paths the keyboard does
    window.__game = {
      get world() { return world; }, get webgl() { return webgl; }, ready: true, zoneFor,
      move: (dx, dz) => { dispatch({ type: "MOVE", dx, dz }); syncZone(); },
      advanceMinutes: (m) => dispatch({ type: "ADVANCE_TIME", minutes: m }),
      interact,
    };
    lastT = performance.now();
    requestAnimationFrame(frame);
  } catch (err) {
    const b = el("boot"); b.className = "error"; b.textContent = "Failed to summon the realm: " + err.message;
    throw err;
  }
})();
