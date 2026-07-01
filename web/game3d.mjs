// Echoes of the Shattered Realm — 3D client (Milestones 1–2+).
//
// PRESENTATION ONLY. Reads `world`, issues commands through the authoritative
// reduce(); never mutates `world` directly. Mobile-first: touch joystick + look
// + on-screen buttons, responsive HUD, low-spec perf mode. Real-time combat is
// kinematic/cosmetic in the renderer (enemy positions live here, not in the sim)
// so the sim stays deterministic — honors tension T2. Lessons applied: clamp
// frame delta + pause on blur (lockstep E6), edge-gate keys ([input][coop]).

import * as THREE from "./vendor/three.module.js";
import { loadContentBrowser } from "./contentWeb.mjs";
import { createWorld, spawnEnemy } from "../src/sim/world.mjs";
import { reduce } from "../src/sim/reduce.mjs";
import { countItem } from "../src/sim/player.mjs";

const TOUCH = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MAX_DT = 0.1;

const ZONE_LABEL = { village_square: "The Village", wilderness: "The Wilderness", dungeon: "The Sunken Vault" };
function zoneFor(x) { return x >= 96 ? "dungeon" : x >= 34 ? "wilderness" : "village_square"; }
const MIRA_POS = { x: 0, z: 6 };
const VAULT_X = 104;

// fixed greybox enemy layout (renderer-side homes)
const SPAWNS = [
  { typeId: "husk_wanderer", x: 46, z: -10 }, { typeId: "husk_wanderer", x: 56, z: 9 },
  { typeId: "husk_wanderer", x: 66, z: -12 }, { typeId: "husk_wanderer", x: 76, z: 11 },
  { typeId: "husk_wanderer", x: 86, z: -6 },
  { typeId: "ruin_stalker", x: 110, z: 7 }, { typeId: "ruin_stalker", x: 124, z: -9 },
  { typeId: "ruin_stalker", x: 136, z: 6 },
];

let content, feel, world;
let renderer = null, scene = null, camera = null, webgl = false;
let playerMesh = null, sun = null, hemi = null;
let camYaw = -Math.PI / 2, camPitch = 0.34, lowSpec = TOUCH;
let lastT = 0, paused = false, started = false, helpOpen = true, won = false;
let seed = 1337, archetype = "warden";

const enemies = [];           // { id, typeId, def, group, fill, pos, alive, dying, dieT, cd, lunge }
const byId = new Map();
let bossSpawned = false;
let pAtkCd = 0, lungeT = 0, hurtFlash = 0, shakeT = 0;
let dodgeCd = 0, dodgeT = 0, stepT = 0; // dodge cooldown / active i-frame timer / footstep timer
let gpx = 0, gpy = 0, padIndex = null, gpFocus = 0, navCd = 0; const prevBtn = []; // gamepad
const keys = new Set();
let jx = 0, jy = 0;           // joystick vector
const facing = new THREE.Vector3(1, 0, 0);
const el = (id) => document.getElementById(id);

// ---------------------------------------------------------------- audio (WebAudio, gesture-init)
// Fully synthesized — no audio assets. Tones via oscillators; impacts/whooshes/
// wind via filtered white-noise bursts so hits read as percussive, not beepy.
let actx = null, muted = false, noiseBuf = null, windGain = null;
function audioInit() { if (actx || muted) return; try { actx = new (window.AudioContext || window.webkitAudioContext)(); makeNoise(); startWind(); } catch { actx = null; } }
function makeNoise() { const n = actx.sampleRate; noiseBuf = actx.createBuffer(1, n, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
function beep(freq, dur = 0.08, type = "square", gain = 0.045) { if (!actx || muted) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = freq; o.connect(g); g.connect(actx.destination); const t = actx.currentTime; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur); }
function noise(dur, freq, q, gain, type = "bandpass") { if (!actx || muted || !noiseBuf) return; const s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = actx.createGain(); s.connect(f); f.connect(g); g.connect(actx.destination); const t = actx.currentTime; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.start(t); s.stop(t + dur); }
function startWind() { if (!actx || windGain || !noiseBuf) return; const s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 420; windGain = actx.createGain(); windGain.gain.value = 0.012; s.connect(f); f.connect(windGain); windGain.connect(actx.destination); s.start(); }
function sfx(kind) {
  if (!actx || muted) return;
  switch (kind) {
    case "hit": noise(0.09, 1300, 1.2, 0.06); beep(300, 0.045, "square", 0.02); break;     // metallic impact
    case "hurt": noise(0.17, 240, 0.7, 0.085, "lowpass"); break;                            // dull thud
    case "swing": noise(0.12, 1100, 0.5, 0.03, "highpass"); break;                          // blade whoosh
    case "die": beep(120, 0.22, "sawtooth", 0.045); noise(0.3, 200, 0.5, 0.05, "lowpass"); break;
    case "loot": beep(660, 0.06, "triangle", 0.04); setTimeout(() => beep(880, 0.07, "triangle", 0.04), 60); break;
    case "level": beep(523, 0.1); setTimeout(() => beep(659, 0.1), 90); setTimeout(() => beep(784, 0.15), 190); break;
    case "ui": beep(440, 0.03, "sine", 0.028); break;
    case "step": noise(0.05, 170, 0.9, 0.018, "lowpass"); break;                            // footfall
    case "dodge": noise(0.2, 700, 0.5, 0.035); break;                                       // dash
    case "roar": beep(68, 0.5, "sawtooth", 0.06); noise(0.5, 150, 0.4, 0.05, "lowpass"); break;
    case "win": [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, "square", 0.045), i * 150)); break;
  }
}

// ---------------------------------------------------------------- toasts / fx
function toast(text, cls = "") { const t = el("toast"); if (!t) return; const p = document.createElement("p"); p.className = cls; p.textContent = text; t.appendChild(p); setTimeout(() => p.remove(), 5000); }
function project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { sx: (v.x * 0.5 + 0.5) * innerWidth, sy: (-v.y * 0.5 + 0.5) * innerHeight, vis: v.z < 1 }; }
function popText(x, y, z, text, cls) {
  if (!webgl) return; const p = project(x, y, z); if (!p.vis) return;
  const s = document.createElement("span"); s.className = cls; s.textContent = text;
  s.style.left = p.sx + "px"; s.style.top = p.sy + "px"; el("dmg").appendChild(s); setTimeout(() => s.remove(), 900);
}

// ---------------------------------------------------------------- dispatch
function dispatch(cmd) { const r = reduce(world, cmd, content); if (r.ok) processEvents(r.events); return r; }
function processEvents(events) {
  for (const e of events) {
    if (e.type === "DAMAGE_DEALT") { const en = byId.get(e.targetId); if (en) popText(en.pos.x, 4.5, en.pos.z, String(e.dmg), "hit"); sfx("hit"); }
    else if (e.type === "DAMAGE_TAKEN") { const p = world.player.pos; popText(p.x, 3.2, p.z, "-" + e.dmg, "hurt"); sfx("hurt"); hurtFlash = 0.5; if (!REDUCED_MOTION) shakeT = 0.25; }
    else if (e.type === "ENTITY_DIED") { const en = byId.get(e.targetId); if (en) { en.alive = false; en.dying = true; en.dieT = 0; } sfx("die"); }
    else if (e.type === "LEVEL_UP") { toast(`Level up — ${e.level}!`, "sys"); sfx("level"); }
    else if (e.type === "LOOT_GAINED") { toast(`Looted ${content.items.get(e.itemId).name}`, "good"); sfx("loot"); }
    else if (e.type === "QUEST_ACCEPTED") toast(`Quest — ${content.quests.get(e.questId).name}`, "sys");
    else if (e.type === "QUEST_TURNED_IN") { toast(`Quest complete — ${content.quests.get(e.questId).name}`, "good"); sfx("win"); if (e.questId === "q_silence_the_king") victory(); }
    else if (e.type === "BOSS_DEFEATED") toast("THE HOLLOW KING FALLS.", "good");
    else if (e.type === "PHASE_CHANGED") toast(`${e.phase} settles over the realm`, "");
    else if (e.type === "RESTED") toast("You rest and recover.", "good");
    else if (e.type === "RESPAWNED") toast("You wake at the village shrine.", "bad");
  }
}

// ---------------------------------------------------------------- meshes
function mat(c, rough = .9) { return new THREE.MeshStandardMaterial({ color: c, roughness: rough }); }
function box(w, h, d, c, x, y, z, cast = true) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = cast && !lowSpec; m.receiveShadow = !lowSpec; return m; }
function cone(r, h, c, x, z) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat(c, 1)); m.position.set(x, h / 2, z); m.castShadow = !lowSpec; return m; }

function makeEnemy(typeId, x, z) {
  const def = content.enemies.get(typeId);
  const ent = spawnEnemy(world, typeId, zoneFor(x), content);
  const group = new THREE.Group();
  const isBoss = def.isBoss;
  const col = isBoss ? 0x7a1f24 : typeId === "ruin_stalker" ? 0x3a2f44 : 0x37402c;
  const s = isBoss ? 2.4 : 1;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1 * s, 2 * s, 5, 10), mat(col, .7));
  body.position.y = 2 * s; body.castShadow = !lowSpec; group.add(body);
  // health bar (billboarded)
  const bar = new THREE.Group(); bar.position.y = (isBoss ? 6.4 : 3.4);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), new THREE.MeshBasicMaterial({ color: isBoss ? 0xd2685f : 0xc06a3a }));
  fill.position.z = 0.01; bar.add(bg); bar.add(fill); group.add(bar);
  group.position.set(x, 0, z); scene && scene.add(group);
  const rec = { id: ent.id, typeId, def, group, fill, bar, body, pos: { x, z }, alive: true, dying: false, dieT: 0, cd: 0, s };
  enemies.push(rec); byId.set(ent.id, rec); return rec;
}

function setupScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0c12, 70, lowSpec ? 170 : 230);
  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 700);
  hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a2620, 0.85); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 1.0);
  if (!lowSpec) { sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); const c = sun.shadow.camera; c.left = -120; c.right = 120; c.top = 120; c.bottom = -120; c.far = 400; }
  scene.add(sun); scene.add(sun.target);

  const zone = (x0, x1, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 150), mat(c, 1)); m.rotation.x = -Math.PI / 2; m.position.x = (x0 + x1) / 2; m.receiveShadow = !lowSpec; scene.add(m); };
  zone(-44, 34, 0x3c4a3a); zone(34, 96, 0x5a4d33); zone(96, 170, 0x23222b);

  for (const [x, z] of [[-14, -8], [-20, 6], [-8, 12], [12, -10], [16, 8]]) { scene.add(box(6, 5, 6, 0x6b5b46, x, 2.5, z)); scene.add(box(7, 1.4, 7, 0x4a3c2c, x, 5.4, z)); }
  const mira = box(1.4, 3, 1.4, 0xcaa24b, MIRA_POS.x, 1.5, MIRA_POS.z); scene.add(mira);
  const mk = box(0.8, 0.8, 0.8, 0xffe08a, MIRA_POS.x, 4, MIRA_POS.z, false); mk.rotation.y = Math.PI / 4; mira.userData.mk = mk; scene.add(mk); scene.userData.mira = mira;
  for (const [x, z] of [[42, -14], [50, 10], [58, -6], [66, 16], [72, -18], [80, 4], [88, -10], [62, -24]]) { scene.add(cone(2.4, 9, 0x2f3d2a, x, z)); scene.add(box(1, 3, 1, 0x4a3826, x, 1.5, z)); }
  scene.add(box(3, 12, 3, 0x15161d, VAULT_X, 6, -7)); scene.add(box(3, 12, 3, 0x15161d, VAULT_X, 6, 7));
  scene.add(box(14, 3, 3, 0x15161d, VAULT_X, 12, 0)); scene.add(box(7, 9, 1, 0x000000, VAULT_X, 5, 0, false));

  playerMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1, 2, 6, 12), mat(archetype === "seeker" ? 0xd8b765 : 0xcfd6e6, .7)); body.position.y = 2; body.castShadow = !lowSpec;
  playerMesh.add(body); playerMesh.add(box(0.5, 0.5, 1.2, 0x9aa6c4, 0, 2, 1.1)); playerMesh.userData.body = body; scene.add(playerMesh);

  // distant silhouettes for depth (cheap, no shadows)
  for (const [x, z, w, h] of [[60, -90, 220, 40], [60, 90, 220, 46], [180, 0, 40, 70], [-90, 0, 36, 50]])
    scene.add(box(w, h, 8, 0x161821, x, h / 2, z, false));

  for (const s of SPAWNS) makeEnemy(s.typeId, s.x, s.z);
}

// ---------------------------------------------------------------- perf guard
let _ft = [], _downgraded = false;
function perfGuard(dt) {
  if (_downgraded || !webgl || dt <= 0) return;
  _ft.push(dt); if (_ft.length < 90) return;
  const avg = _ft.reduce((a, b) => a + b, 0) / _ft.length; _ft = [];
  if (avg > 0.04) { renderer.setPixelRatio(1); renderer.shadowMap.enabled = false; _downgraded = true; } // sustained <~25fps
}

// ---------------------------------------------------------------- day/night
const SKY = { dawn: 0x46506b, day: 0x8fb6e8, dusk: 0x3b2a3a, night: 0x070810 };
const SUNC = { dawn: 0xffb27a, day: 0xfff4dc, dusk: 0xff8a5c, night: 0x4a5a86 };
function applyTimeOfDay() {
  if (!webgl) return; const m = world.time.minutes, ph = world.time.phase;
  const ang = (m / 1440) * Math.PI * 2 - Math.PI / 2, day = Math.max(0.04, Math.sin(ang));
  sun.position.set(Math.cos(ang) * 120, Math.max(6, Math.sin(ang) * 120), 40);
  sun.target.position.set(world.player.pos.x, 0, world.player.pos.z);
  sun.intensity = ph === "night" ? 0.18 : 0.6 + day; sun.color.setHex(SUNC[ph]);
  hemi.intensity = ph === "night" ? 0.32 : 0.85;
  const sky = new THREE.Color(SKY[ph]); scene.background = sky; scene.fog.color.copy(sky);
}

// ---------------------------------------------------------------- combat
function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }
function nearestEnemy(range) { let best = null, bd = range * range; const p = world.player.pos; for (const e of enemies) { if (!e.alive) continue; const d = dist2(p, e.pos); if (d <= bd) { bd = d; best = e; } } return best; }
function playerAttack() { if (pAtkCd > 0 || helpOpen || !world.player) return; pAtkCd = feel.playerAttackCooldown; lungeT = 0.18; sfx("swing"); const t = nearestEnemy(feel.playerReach); if (t) dispatch({ type: "ATTACK", targetId: t.id, retaliate: false }); }
function dodge() { if (dodgeCd > 0 || helpOpen || !world.player || won) return; dodgeCd = 0.85; dodgeT = 0.24; sfx("dodge"); } // brief i-frames (skip enemy strikes while active)
function useSalve() { const id = countItem(world, "con_greater_salve") > 0 ? "con_greater_salve" : countItem(world, "con_minor_salve") > 0 ? "con_minor_salve" : null; if (id) dispatch({ type: "USE_ITEM", itemId: id }); else toast("No salves left.", ""); }
function rest() { if (nearestEnemy(feel.aggroRadius)) { toast("Too dangerous to rest here.", "bad"); return; } dispatch({ type: "ADVANCE_TIME", minutes: 480, rest: true }); }

function nearMira() { const p = world.player.pos; return Math.hypot(p.x - MIRA_POS.x, p.z - MIRA_POS.z) < 8; }
function questComplete(qid) { const q = world.quests[qid]; if (!q) return false; return content.quests.get(qid).objectives.every((o) => (q.progress[o.id] || 0) >= o.count); }
function talkToMira() {
  const q1 = world.quests.q_clear_the_hollow, q2 = world.quests.q_silence_the_king;
  if (!q1) return dispatch({ type: "ACCEPT_QUEST", questId: "q_clear_the_hollow" });
  if (q1.state === "active" && questComplete("q_clear_the_hollow")) return dispatch({ type: "TURN_IN_QUEST", questId: "q_clear_the_hollow" });
  if (q1.state === "turnedin" && !q2) return dispatch({ type: "ACCEPT_QUEST", questId: "q_silence_the_king" });
  if (q2 && q2.state === "active" && world.flags.bossDefeated) return dispatch({ type: "TURN_IN_QUEST", questId: "q_silence_the_king" });
  toast('"The husks press closer each dusk. The wilderness lies east."', "");
}
function interact() {
  if (helpOpen) return;
  if (nearMira()) return talkToMira();
  if (world.player.pos.x >= VAULT_X - 4) { toast("The Vault yawns open. The Hollow King waits deeper east.", "sys"); return; }
  toast("Nothing to interact with here.", "");
}
function victory() { won = true; const h = el("help"); h.classList.add("show"); helpOpen = true; h.querySelector("strong").textContent = "The realm exhales"; h.querySelector(".body").innerHTML = "You created a character, cleared the wilderness, recovered the seal, descended the Sunken Vault, and ended the Hollow King's vigil. The vertical slice is complete — dawn means something again."; h.querySelector("#help-go").textContent = "Play again"; }

// ---------------------------------------------------------------- per-frame
function movement(dt) {
  let ix = 0, iz = 0;
  if (keys.has("w")) iz += 1; if (keys.has("s")) iz -= 1; if (keys.has("a")) ix -= 1; if (keys.has("d")) ix += 1;
  ix += jx + gpx; iz += -jy - gpy;
  const len = Math.hypot(ix, iz);
  // dodge dash continues along current facing even with no input
  if (len < 0.05 && dodgeT <= 0) return;
  if (len > 1) { ix /= len; iz /= len; }
  const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const mv = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix);
  if (mv.lengthSq() === 0) { if (dodgeT > 0) mv.copy(facing); else return; }
  const speed = feel.moveSpeed * (dodgeT > 0 ? 2.6 : 1);
  mv.normalize().multiplyScalar(speed * dt);
  facing.copy(mv).normalize(); dispatch({ type: "MOVE", dx: mv.x, dz: mv.z });
  // footsteps
  stepT -= dt; if (stepT <= 0 && dodgeT <= 0) { sfx("step"); stepT = 0.34; }
}
function syncZone() { const z = zoneFor(world.player.pos.x); if (z !== world.player.location) { dispatch({ type: "TRAVEL", to: z }); toast(`Entering ${ZONE_LABEL[z]}`, "sys"); } }

function updateEnemies(dt) {
  const p = world.player.pos;
  if (!bossSpawned && world.quests.q_silence_the_king?.state === "active" && p.x > 96) {
    makeEnemy("boss_hollow_king", Math.max(p.x + 26, 144), 0); bossSpawned = true; toast("The Hollow King rises from his throne of ash.", "bad"); sfx("roar");
  }
  for (const e of enemies) {
    if (e.dying) { e.dieT += dt; e.group.position.y = -e.dieT * 3; e.group.scale.setScalar(Math.max(0.01, 1 - e.dieT)); if (e.dieT > 1.3 && scene) { scene.remove(e.group); e.dying = false; } continue; }
    if (!e.alive) continue;
    const d = Math.sqrt(dist2(p, e.pos));
    if (d < feel.aggroRadius && d > feel.meleeRange - 0.5) { e.pos.x += ((p.x - e.pos.x) / d) * feel.enemySpeed * dt; e.pos.z += ((p.z - e.pos.z) / d) * feel.enemySpeed * dt; }
    e.cd -= dt;
    if (d <= feel.meleeRange && e.cd <= 0 && !helpOpen && !won && dodgeT <= 0) { dispatch({ type: "ENEMY_STRIKE", entityId: e.id }); e.cd = feel.enemyAttackCooldown; }
    e.group.position.set(e.pos.x, 0, e.pos.z);
    if (d > 0.1) e.group.rotation.y = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
    const ent = world.entities[e.id]; const frac = Math.max(0, ent.hp / e.def.maxHp);
    e.fill.scale.x = frac; e.fill.position.x = -2 * (1 - frac);
    if (camera) e.bar.quaternion.copy(camera.quaternion);
    // boss telegraph: glow red as its strike winds up
    if (e.def.isBoss && e.body.material.emissive) { const w = e.cd < 0.45 && d < feel.aggroRadius ? (0.45 - Math.max(0, e.cd)) * 1.6 : 0; e.body.material.emissive.setRGB(w, 0, 0); }
  }
}
function updateCamera() {
  if (!webgl) return; const p = world.player.pos;
  playerMesh.position.set(p.x, 0, p.z); playerMesh.rotation.y = Math.atan2(facing.x, facing.z);
  lungeT = Math.max(0, lungeT - 0.016); playerMesh.userData.body.position.z = lungeT * 6; // lunge on attack
  const mira = scene.userData.mira; if (mira) mira.userData.mk.rotation.y += 0.02;
  const camDist = feel.camDistance * (TOUCH ? 0.9 : 1); // pull in a touch on phones
  const off = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch) + 0.35, Math.cos(camYaw) * Math.cos(camPitch)).multiplyScalar(camDist);
  let sx = 0, sy = 0;
  if (shakeT > 0) { shakeT = Math.max(0, shakeT - 0.016); const a = shakeT * 2.2; sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; }
  camera.position.set(p.x + off.x + sx, Math.max(3, off.y + feel.camHeight * 0.5 + sy), p.z + off.z); camera.lookAt(p.x, 2, p.z);
  if (hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - 0.03); el("vignette").style.opacity = hurtFlash;
}
function updateHud() {
  const p = world.player, t = world.time;
  el("clock").textContent = `${String(Math.floor(t.minutes / 60) % 24).padStart(2, "0")}:${String(Math.floor(t.minutes % 60)).padStart(2, "0")} · ${t.phase}`;
  el("zone").textContent = ZONE_LABEL[world.player.location] ?? world.player.location;
  el("pname").textContent = p.name; el("plevel").textContent = `Lv ${p.level}`;
  const f = el("hpfill"); f.style.width = Math.round((p.hp / p.maxHp) * 100) + "%"; f.classList.toggle("low", p.hp < p.maxHp * 0.35);
  el("hptext").textContent = `${p.hp} / ${p.maxHp} HP`;
  const qid = Object.keys(world.quests).find((id) => world.quests[id].state === "active"); const qb = el("quest");
  if (qid) { const def = content.quests.get(qid), q = world.quests[qid]; qb.innerHTML = `<div class="qname">${def.name}</div>` + def.objectives.map((o) => { const h = Math.min(q.progress[o.id] || 0, o.count), dn = h >= o.count; return `<div class="${dn ? "obj-done" : "obj-todo"}">• ${o.desc} (${h}/${o.count})</div>`; }).join(""); } else qb.innerHTML = "";
  // lock-on target panel
  const tg = nearestEnemy(feel.lockRange), tp = el("target");
  if (tg) { const ent = world.entities[tg.id]; tp.classList.add("show"); tp.innerHTML = `<div class="tn"><span class="${tg.def.isBoss ? "boss" : ""}">${tg.def.name}</span><span>${Math.max(0, ent.hp)}/${tg.def.maxHp}</span></div><div class="bar"><span style="width:${Math.max(0, ent.hp / tg.def.maxHp) * 100}%"></span></div>`; } else tp.classList.remove("show");
  const pr = el("prompt");
  if (nearMira()) { pr.textContent = "✦ Speak with Elder Mira"; pr.classList.add("show"); }
  else if (world.player.pos.x >= VAULT_X - 4 && !bossSpawned) { pr.textContent = "✦ The Vault gate"; pr.classList.add("show"); }
  else pr.classList.remove("show");
}

function objectiveTarget() {
  const q1 = world.quests.q_clear_the_hollow, q2 = world.quests.q_silence_the_king;
  if (!q1) return { x: MIRA_POS.x, z: MIRA_POS.z, label: "Elder Mira" };
  if (q1.state === "active" && !questComplete("q_clear_the_hollow")) return { x: 66, z: 0, label: "Husks → east" };
  if (q1.state === "active") return { x: MIRA_POS.x, z: MIRA_POS.z, label: "→ Mira" };
  if (q1.state === "turnedin" && !q2) return { x: MIRA_POS.x, z: MIRA_POS.z, label: "→ Mira" };
  if (q2 && q2.state === "active" && !world.flags.bossDefeated) { const b = enemies.find((e) => e.typeId === "boss_hollow_king" && e.alive); return b ? { x: b.pos.x, z: b.pos.z, label: "Hollow King" } : { x: 150, z: 0, label: "The Vault" }; }
  if (q2 && q2.state === "active" && world.flags.bossDefeated) return { x: MIRA_POS.x, z: MIRA_POS.z, label: "→ Mira" };
  return null;
}
function updateCompass() {
  const c = el("compass"); const t = objectiveTarget(); const p = world.player.pos;
  if (!t || won) { c.classList.add("hide"); return; }
  const dx = t.x - p.x, dz = t.z - p.z; const d = Math.hypot(dx, dz);
  if (d < 6) { c.classList.add("hide"); return; }
  c.classList.remove("hide");
  const fwdAngle = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
  const rel = Math.atan2(dx, dz) - fwdAngle;
  el("compass-arrow").style.transform = `rotate(${rel}rad)`;
  el("compass-label").textContent = t.label;
}

function frame(now) {
  const dt = paused ? 0 : Math.min(MAX_DT, (now - lastT) / 1000 || 0); lastT = now;
  pollGamepad(dt);
  if (!paused && !won) {
    if (world.player.hp <= 0) dispatch({ type: "RESPAWN" });
    dispatch({ type: "ADVANCE_TIME", minutes: dt * feel.timeScale });
    pAtkCd = Math.max(0, pAtkCd - dt); dodgeCd = Math.max(0, dodgeCd - dt); dodgeT = Math.max(0, dodgeT - dt);
    movement(dt); syncZone(); updateEnemies(dt);
  }
  applyTimeOfDay(); updateCamera(); updateHud(); updateCompass(); perfGuard(dt);
  if (webgl) renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- input
function bindInput() {
  addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if (k === "e") { if (!keys.has("e")) interact(); keys.add("e"); return; } if (k === "f") { if (!keys.has("f")) useSalve(); keys.add("f"); return; } if (k === "r") { if (!keys.has("r")) rest(); keys.add("r"); return; } if (k === "shift") { if (!keys.has("shift")) dodge(); keys.add("shift"); return; } if (k === " ") { e.preventDefault(); if (!keys.has(" ")) playerAttack(); keys.add(" "); return; } keys.add(k); });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  const canvas = el("scene"); let lookId = null, lx = 0, ly = 0, stickId = null, srect = null;
  canvas.addEventListener("pointerdown", (e) => { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; });
  addEventListener("pointermove", (e) => {
    if (e.pointerId === stickId) { updateStick(e); return; }
    if (e.pointerId === lookId) { camYaw -= (e.clientX - lx) * 0.005; camPitch = Math.max(0.12, Math.min(1.2, camPitch + (e.clientY - ly) * 0.004)); lx = e.clientX; ly = e.clientY; }
  });
  addEventListener("pointerup", (e) => { if (e.pointerId === lookId) lookId = null; if (e.pointerId === stickId) { stickId = null; jx = jy = 0; el("knob").style.transform = "translate(0,0)"; } });

  const stick = el("stick"), knob = el("knob");
  function updateStick(e) { const r = srect, cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = e.clientX - cx, dy = e.clientY - cy; const rad = r.width / 2; const m = Math.hypot(dx, dy); if (m > rad) { dx *= rad / m; dy *= rad / m; } jx = dx / rad; jy = dy / rad; knob.style.transform = `translate(${dx}px,${dy}px)`; }
  stick.addEventListener("pointerdown", (e) => { stickId = e.pointerId; srect = stick.getBoundingClientRect(); updateStick(e); e.preventDefault(); });

  const tap = (id, fn) => { const b = el(id); if (b) b.addEventListener("pointerdown", (ev) => { ev.preventDefault(); audioInit(); sfx("ui"); fn(); }); };
  tap("b-attack", playerAttack); tap("b-interact", interact); tap("b-salve", useSalve); tap("b-rest", rest); tap("b-dodge", dodge);
  addEventListener("gamepadconnected", (e) => { padIndex = e.gamepad.index; document.body.classList.add("pad"); toast("Controller connected: " + (e.gamepad.id.split("(")[0].trim() || "Gamepad"), "sys"); });
  addEventListener("gamepaddisconnected", (e) => { if (padIndex === e.gamepad.index) { padIndex = null; document.body.classList.remove("pad"); } });
  el("b-menu").onclick = openMenu; el("m-resume").onclick = closeMenu;
  el("b-save").onclick = () => { save(); closeMenu(); };
  el("b-load").onclick = () => { load(); closeMenu(); };
  el("m-restart").onclick = restart;
  el("b-help").onclick = () => { el("menu").classList.remove("show"); el("help").classList.add("show"); helpOpen = true; };
  el("m-mute").onclick = () => { muted = !muted; el("m-mute").textContent = "Sound: " + (muted ? "Off" : "On"); if (!muted) audioInit(); if (windGain) windGain.gain.value = muted ? 0 : 0.012; };
  el("help-go").onclick = closeHelp; el("help-x").onclick = closeHelp;
  el("arch")?.querySelectorAll(".arch").forEach((b) => b.onclick = () => { el("arch").querySelectorAll(".arch").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); chooseArchetype(b.dataset.arch); });

  addEventListener("resize", () => { if (!webgl) return; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  document.addEventListener("visibilitychange", () => { paused = document.hidden; if (!paused) lastT = performance.now(); });
  addEventListener("contextmenu", (e) => e.preventDefault());
}
function closeHelp() { audioInit(); if (won) { restart(); return; } el("help").classList.remove("show"); helpOpen = false; }
function openMenu() { el("menu").classList.add("show"); paused = true; }
function closeMenu() { el("menu").classList.remove("show"); paused = false; lastT = performance.now(); }
function toggleMenu() { el("menu").classList.contains("show") ? closeMenu() : openMenu(); }

// Xbox / standard gamepad (USB or Bluetooth — both surface through the Gamepad API).
function pollGamepad(dt) {
  gpx = 0; gpy = 0;
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  // Actively adopt a pad even if the connect event never fired (Chrome only
  // exposes pads after the first input, and menus need it before gameplay).
  if (padIndex === null) { for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { padIndex = i; document.body.classList.add("pad"); break; } }
  if (padIndex === null) return;
  const gp = pads[padIndex]; if (!gp) { padIndex = null; document.body.classList.remove("pad"); return; }
  const down = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = (i) => down(i) && !prevBtn[i];
  if (navCd > 0) navCd -= 0.016;
  // Menu / start-screen navigation with the D-pad + A
  const ov = el("help").classList.contains("show") ? "help" : el("menu").classList.contains("show") ? "menu" : null;
  if (ov) {
    const btns = ov === "help" ? [...el("arch").querySelectorAll(".arch"), el("help-go")] : [...el("menu").querySelectorAll(".mbtn")];
    if (gpFocus >= btns.length) gpFocus = 0;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let nav = 0;
    if (edge(13) || edge(15)) nav = 1;                                  // dpad down/right
    else if (edge(12) || edge(14)) nav = -1;                            // dpad up/left
    else if (navCd <= 0 && (Math.abs(ay) > 0.5 || Math.abs(ax) > 0.5)) { nav = (ay || ax) > 0 ? 1 : -1; navCd = 0.22; } // stick
    if (nav) gpFocus = (gpFocus + nav + btns.length) % btns.length;
    btns.forEach((b, i) => b.classList.toggle("gp-focus", i === gpFocus));
    if (edge(0)) btns[gpFocus] && btns[gpFocus].click();              // A activates
    if (edge(9) && ov === "menu") closeMenu();                        // Start closes pause menu
    for (let i = 0; i < gp.buttons.length; i++) prevBtn[i] = down(i);
    return;
  }
  gpFocus = 0;
  if (edge(9)) toggleMenu();                                    // Start → pause menu
  if (!paused && !helpOpen) {
    const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
    gpx = dz(gp.axes[0] || 0); gpy = dz(gp.axes[1] || 0);       // left stick → move
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);   // right stick → look
    camYaw -= rx * 2.6 * dt; camPitch = Math.max(0.12, Math.min(1.2, camPitch + ry * 1.9 * dt));
    if (down(0) || down(5) || down(7)) playerAttack();          // A / RB / RT
    if (edge(2)) interact();                                    // X
    if (edge(3)) useSalve();                                    // Y
    if (edge(1)) dodge();                                       // B
  }
  for (let i = 0; i < gp.buttons.length; i++) prevBtn[i] = down(i);
}
function chooseArchetype(id) {
  if (id === archetype) return; archetype = id;
  for (const e of enemies) if (scene) scene.remove(e.group);
  enemies.length = 0; byId.clear(); bossSpawned = false; won = false;
  world = createWorld(seed);
  dispatch({ type: "CREATE_CHARACTER", archetypeId: id });
  for (const s of SPAWNS) makeEnemy(s.typeId, s.x, s.z);
  if (playerMesh) playerMesh.userData.body.material.color.setHex(id === "seeker" ? 0xd8b765 : 0xcfd6e6);
}

// ---------------------------------------------------------------- save / restart
function save() { try { localStorage.setItem("eotsr3d", JSON.stringify({ world })); toast("Game saved.", "sys"); } catch { toast("Save failed.", "bad"); } }
function load() { const s = localStorage.getItem("eotsr3d"); if (!s) { toast("No save found.", ""); return; } try { world = JSON.parse(s).world; toast("Game loaded. (enemies reset)", "sys"); } catch { toast("Load failed.", "bad"); } }
function restart() { location.reload(); }

// ---------------------------------------------------------------- perf
function tryInitRenderer() {
  try { const canvas = el("scene"); renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowSpec }); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowSpec ? feel.lowSpecPixelRatio : feel.desktopPixelRatio)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = !lowSpec; webgl = true; }
  catch (err) { webgl = false; console.warn("WebGL unavailable, headless logic mode:", err.message); }
}

// ---------------------------------------------------------------- boot
(async function boot() {
  if (started) return; started = true;
  if (TOUCH) document.body.classList.add("touch");
  try {
    [content, feel] = await Promise.all([loadContentBrowser(), fetch(new URL("../src/data/feel.json", import.meta.url)).then((r) => r.json())]);
    seed = Math.floor(Date.now() % 1e9) || 1337;
    world = createWorld(seed);
    dispatch({ type: "CREATE_CHARACTER", archetypeId: archetype });
    tryInitRenderer(); if (webgl) setupScene(); bindInput();
    el("boot").classList.add("hidden");
    window.__game = {
      get world() { return world; }, get webgl() { return webgl; }, get enemies() { return enemies; }, ready: true, zoneFor, feel,
      move: (dx, dz) => { dispatch({ type: "MOVE", dx, dz }); syncZone(); }, advanceMinutes: (m) => dispatch({ type: "ADVANCE_TIME", minutes: m }),
      interact, attack: playerAttack, dodge, closeHelp, setJoy: (x, y) => { jx = x; jy = y; }, get dodgeActive() { return dodgeT > 0; },
    };
    lastT = performance.now(); requestAnimationFrame(frame);
  } catch (err) { const b = el("boot"); b.className = "error"; b.textContent = "Failed to summon the realm: " + err.message; throw err; }
})();
