/* ============================================================
   SIGNAL STRIKE — /game.html · game3d.js
   First-person last-node-standing arena vs 11 AI nodes.
   One WebGL world, procedural geometry only, synth audio.
   Fortnite lineage: glider drop · shrinking storm · pickups ·
   siphon · placement. Valorant lineage: hitscan + recoil
   pattern · first-shot accuracy · headshot dink · hardlight
   barrier · tactical HUD.
   Honesty markers: body.game-live only after the first real
   rendered frame; body.game-no3d on any degraded path.
   ============================================================ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createClient } from "@supabase/supabase-js";

/* ---------- capability gates ---------- */
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COARSE_ONLY = matchMedia("(hover: none)").matches;
const SMALL = innerWidth < 960;

function toFallback() {
  document.body.classList.add("game-no3d");
  document.body.classList.remove("game-live", "game-match");
}

/* boot decision runs at the END of this module — every const below
   must exist before start() executes */

function boot() {
  try {
    start();
  } catch (e) {
    toFallback();
  }
}

/* ---------- config ---------- */
const COL = {
  lime: 0xb8ff3c, cyan: 0x4fc4ff, magenta: 0xff4fa3,
  teal: 0x3ce0c8, amber: 0xffb020, ink: 0x07080a, pearl: 0xe9f2ff,
};
const ARENA_R = 195;            /* hard bound — nothing playable beyond */
const STORM_R0 = 190;
/* phases: wait s, shrink s, target radius, storm dps while outside */
const STORM_PHASES = [
  { wait: 25, shrink: 20, r: 120, dps: 1 },
  { wait: 20, shrink: 18, r: 75,  dps: 2 },
  { wait: 15, shrink: 15, r: 42,  dps: 5 },
  { wait: 12, shrink: 12, r: 20,  dps: 8 },
  { wait: 10, shrink: 10, r: 8,   dps: 10 },
  { wait: 8,  shrink: 8,  r: 2,   dps: 12 },
];
const WEAPONS = [
  {
    id: "rifle", name: "PULSE-7", rpm: 650, mag: 30, reload: 2.1,
    dmg: 26, hsMult: 3.0, kick: 1.0, ads: false,
    /* Valorant-style pattern, degrees [yaw, pitch] per shot; climbs
       hard for 6, then weaves. Indexes past the end loop the tail. */
    pat: [
      [0.00, 0.32], [0.02, 0.52], [0.05, 0.72], [-0.06, 0.88],
      [0.10, 0.98], [-0.16, 1.02], [0.34, 0.55], [0.55, 0.22],
      [0.38, -0.06], [-0.30, 0.18], [-0.58, 0.10], [-0.42, -0.04],
    ],
    patTail: 6,
    spreadBase: 0.0012, spreadMove: 0.020, spreadAir: 0.034,
  },
  {
    id: "dmr", name: "LANCE-1", rpm: 150, mag: 12, reload: 2.6,
    dmg: 70, hsMult: 2.3, kick: 2.2, ads: true, zoomFov: 30,
    pat: [[0.0, 1.55]], patTail: 1,
    spreadBase: 0.020, spreadAds: 0.0006, spreadMove: 0.030, spreadAir: 0.05,
  },
];
const BOT_NAMES = ["VOLT", "HEX", "NOVA", "RELAY", "FLUX", "ONYX", "PULSE", "CIPHER", "DRIFT", "ECHO", "RUNE"];
const BOT_HUES = [COL.cyan, COL.magenta, COL.amber, COL.teal, 0x9fd8ff, COL.pearl];
const PLAYER_HP = 100, PLAYER_SH = 75, BOT_HP = 100, BOT_SH = 50;
const SIPHON = 20;              /* shield on kill */
const BARRIER_HP = 300, BARRIER_CD = 18, BARRIER_LIFE = 30;

/* deterministic arena — the map is learnable, like a real ranked map */
const SEED = 1187;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
   SQUAD LINK transports — one interface, three wires.
   supa: Supabase Realtime broadcast+presence (the real internet;
         same project + publishable key as /checkout + /anime)
   bc:   BroadcastChannel — same-browser tabs, local QA, no net
   stub: scripted phantom peer — smoke checks, fully offline
   Handlers: onPeers(Map id→meta) · onMsg(payload) · onState(str)
   ============================================================ */
const SUPA_URL = "https://jldzkjihbekxqxagkame.supabase.co";
const SUPA_KEY = "sb_publishable_Nm79C7JsHnf4lLjruU5g2Q_EuwskRuK";

function supaTransport(h) {
  let sb = null, ch = null;
  return {
    kind: "supa",
    join(code, meta) {
      const cfg = window.__gameNetCfg || {};   /* QA override hook (same pattern as __axonAuthCfg) */
      sb = createClient(cfg.url || SUPA_URL, cfg.key || SUPA_KEY, { realtime: { params: { eventsPerSecond: 32 } } });
      ch = sb.channel("strike-" + code, { config: { broadcast: { self: false, ack: false }, presence: { key: meta.id } } });
      ch.on("broadcast", { event: "g" }, (m) => h.onMsg(m.payload));
      ch.on("presence", { event: "sync" }, () => {
        const st = ch.presenceState(), peers = new Map();
        for (const k of Object.keys(st)) { if (k !== meta.id && st[k][0]) peers.set(k, st[k][0]); }
        h.onPeers(peers);
      });
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") { ch.track(meta).catch(() => {}); h.onState("on"); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") h.onState("err");
      });
    },
    send(p) { try { ch?.send({ type: "broadcast", event: "g", payload: p }); } catch (e) { /* transient */ } },
    leave() { try { if (ch) sb.removeChannel(ch); } catch (e) { /* closing */ } ch = null; h.onState("off"); },
  };
}

function bcTransport(h) {
  let bc = null, me = null, timer = 0;
  const peers = new Map();                       /* id → {meta, seen} */
  const sync = () => { const out = new Map(); for (const [k, v] of peers) out.set(k, v.meta); h.onPeers(out); };
  return {
    kind: "bc",
    join(code, meta) {
      me = meta;
      bc = new BroadcastChannel("strike-" + code);
      bc.onmessage = (e) => {
        const m = e.data;
        if (m.hi) {
          const known = peers.has(m.hi.id);
          peers.set(m.hi.id, { meta: m.hi, seen: Date.now() });
          if (!known) { sync(); bc.postMessage({ hi: me, echo: 1 }); }
          return;
        }
        if (m.bye) { if (peers.delete(m.bye)) sync(); return; }
        if (m.g && m.from !== me.id) h.onMsg(m.g);
      };
      bc.postMessage({ hi: me });
      timer = setInterval(() => {
        bc.postMessage({ hi: me, echo: 1 });
        const now = Date.now(); let drop = false;
        for (const [k, v] of peers) if (now - v.seen > 7000) { peers.delete(k); drop = true; }
        if (drop) sync();
      }, 2000);
      h.onState("on");
    },
    send(p) { bc?.postMessage({ g: p, from: me.id }); },
    leave() { clearInterval(timer); try { bc?.postMessage({ bye: me.id }); bc?.close(); } catch (e) { /* closed */ } bc = null; h.onState("off"); },
  };
}

/* smoke-only phantom peer "DRONE": joins after me, circles the plaza,
   pokes me for 4 dmg every 2.5s, dies after 60 dmg, reports its death */
function stubTransport(h) {
  let timers = [], hp = 60, dead = false, going = false, me = null;
  const PEER = { id: "stub-1", name: "DRONE" };
  const stop = () => { timers.forEach(clearInterval); timers = []; };
  return {
    kind: "stub",
    join(code, meta) {
      me = meta;
      PEER.joinT = meta.joinT + 1;               /* I created the room → I host */
      h.onState("on");
      setTimeout(() => h.onPeers(new Map([[PEER.id, PEER]])), 250);
    },
    send(p) {
      if (p.t === "go" && !going) {
        going = true;
        let a = 0;
        timers.push(setInterval(() => {
          if (dead) return;
          a += 0.12;
          h.onMsg({ t: "s", id: PEER.id, x: +(10 + Math.cos(a) * 14).toFixed(1), y: 0, z: +(-6 + Math.sin(a) * 14).toFixed(1), yw: +a.toFixed(2), hp, sh: 0, al: 1, gl: 0, cr: 0, w: 0 });
        }, 150));
        timers.push(setInterval(() => { if (!dead) h.onMsg({ t: "hit", tgt: me.id, dmg: 4, by: PEER.name, bid: PEER.id, crit: false }); }, 2500));
        setTimeout(() => { if (!dead) h.onMsg({ t: "hit", tgt: me.id, dmg: 4, by: PEER.name, bid: PEER.id, crit: false }); }, 1200);
      }
      if (p.t === "hit" && p.tgt === PEER.id && !dead) {
        hp -= p.dmg;
        if (hp <= 0) { dead = true; stop(); h.onMsg({ t: "died", id: PEER.id, by: p.by, bid: p.bid }); }
      }
    },
    leave() { stop(); h.onState("off"); },
  };
}

/* ============================================================
   synth audio — no samples, whole kit from oscillators + noise
   ============================================================ */
let AC = null, master = null, noiseBuf = null;
let sndOn = true;
try { sndOn = localStorage.getItem("game-sound") !== "off"; } catch (e) { /* private mode */ }

function audioBoot() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = sndOn ? 0.85 : 0;
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 8;
    master.connect(comp); comp.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function setSnd(v) {
  sndOn = v;
  try { localStorage.setItem("game-sound", v ? "on" : "off"); } catch (e) { /* ignore */ }
  if (AC && master) master.gain.setTargetAtTime(v ? 0.85 : 0, AC.currentTime, 0.05);
  if (v && AC?.state === "suspended") AC.resume().catch(() => {});
}
/* one enveloped noise burst through a filter — the workhorse */
function nBurst({ dur = 0.1, type = "highpass", freq = 900, q = 0.8, gain = 0.5, at = 0, pan = 0, rate = 1 }) {
  if (!AC || !sndOn) return;
  const t = AC.currentTime + at;
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rate;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = AC.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
  src.connect(f); f.connect(g); g.connect(p); p.connect(master);
  src.start(t); src.stop(t + dur + 0.05);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); p.disconnect(); };
}
function tone({ freq = 440, freq2 = 0, dur = 0.15, type = "sine", gain = 0.2, at = 0, pan = 0 }) {
  if (!AC || !sndOn) return;
  const t = AC.currentTime + at;
  const o = AC.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = AC.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
  o.connect(g); g.connect(p); p.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
  o.onended = () => { o.disconnect(); g.disconnect(); p.disconnect(); };
}
const sfxShot = (dmr) => {
  if (dmr) {
    nBurst({ dur: 0.16, freq: 700, gain: 0.62 });
    tone({ freq: 130, freq2: 46, dur: 0.16, type: "triangle", gain: 0.4 });
  } else {
    nBurst({ dur: 0.085, freq: 950, gain: 0.42 });
    tone({ freq: 185, freq2: 62, dur: 0.07, type: "square", gain: 0.16 });
  }
};
const sfxDistantShot = (dist, pan) => {
  const k = Math.max(0, 1 - dist / 160);
  if (k <= 0.02) return;
  nBurst({ dur: 0.12, type: "lowpass", freq: 500 + k * 900, gain: 0.16 * k, pan });
};
const sfxDink = () => { tone({ freq: 1245, dur: 0.1, gain: 0.3 }); tone({ freq: 1660, dur: 0.07, gain: 0.16 }); };
const sfxHit = () => nBurst({ dur: 0.05, type: "bandpass", freq: 420, q: 2, gain: 0.24 });
const sfxHurt = () => { nBurst({ dur: 0.09, type: "lowpass", freq: 380, gain: 0.4 }); tone({ freq: 90, freq2: 55, dur: 0.12, type: "triangle", gain: 0.3 }); };
const sfxShieldBreak = () => { nBurst({ dur: 0.22, type: "bandpass", freq: 2100, q: 4, gain: 0.3 }); tone({ freq: 620, freq2: 210, dur: 0.2, type: "sawtooth", gain: 0.1 }); };
const sfxReload = () => { nBurst({ dur: 0.03, type: "bandpass", freq: 1300, q: 5, gain: 0.3, at: 0.05 }); nBurst({ dur: 0.03, type: "bandpass", freq: 900, q: 5, gain: 0.3, at: 0.55 }); nBurst({ dur: 0.06, type: "bandpass", freq: 1600, q: 4, gain: 0.35, at: 1.4 }); };
const sfxStep = (run) => nBurst({ dur: 0.045, type: "lowpass", freq: run ? 520 : 380, gain: run ? 0.1 : 0.06, rate: 0.9 + Math.random() * 0.25 });
const sfxPickup = () => { tone({ freq: 660, dur: 0.08, gain: 0.2 }); tone({ freq: 990, dur: 0.12, gain: 0.2, at: 0.07 }); };
const sfxBarrier = () => { tone({ freq: 220, freq2: 440, dur: 0.25, type: "sawtooth", gain: 0.12 }); nBurst({ dur: 0.2, type: "bandpass", freq: 800, q: 3, gain: 0.2 }); };
const sfxBarrierBreak = () => { nBurst({ dur: 0.3, type: "bandpass", freq: 1500, q: 2, gain: 0.4 }); tone({ freq: 300, freq2: 90, dur: 0.3, type: "sawtooth", gain: 0.15 }); };
const sfxKill = () => { tone({ freq: 494, dur: 0.09, gain: 0.22 }); tone({ freq: 740, dur: 0.09, gain: 0.22, at: 0.08 }); tone({ freq: 988, dur: 0.16, gain: 0.22, at: 0.16 }); };
const sfxUi = () => tone({ freq: 880, dur: 0.05, gain: 0.12 });
const sfxWin = () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.35, gain: 0.18, at: i * 0.12 })); nBurst({ dur: 0.8, type: "highpass", freq: 3000, gain: 0.1, at: 0.5 }); };
const sfxLose = () => { tone({ freq: 220, freq2: 110, dur: 0.7, type: "triangle", gain: 0.25 }); nBurst({ dur: 0.5, type: "lowpass", freq: 200, gain: 0.3 }); };
const sfxLand = () => { nBurst({ dur: 0.12, type: "lowpass", freq: 300, gain: 0.35 }); };
const sfxSwitch = () => nBurst({ dur: 0.05, type: "bandpass", freq: 1100, q: 4, gain: 0.22 });
const sfxEmpty = () => tone({ freq: 1200, dur: 0.03, type: "square", gain: 0.08 });

/* looped beds: ambient drone, storm proximity rumble, glider wind */
let bedNodes = null;
function bedsBoot() {
  if (!AC || bedNodes) return;
  const mk = (type, freq, filt, fFreq, g0) => {
    const o = AC.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = AC.createBiquadFilter(); f.type = filt; f.frequency.value = fFreq;
    const g = AC.createGain(); g.gain.value = g0;
    o.connect(f); f.connect(g); g.connect(master); o.start();
    return { o, f, g };
  };
  const mkN = (filt, fFreq, g0) => {
    const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = AC.createBiquadFilter(); f.type = filt; f.frequency.value = fFreq;
    const g = AC.createGain(); g.gain.value = g0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return { src, f, g };
  };
  bedNodes = {
    droneA: mk("sawtooth", 48, "lowpass", 260, 0.016),
    droneB: mk("sawtooth", 48.6, "lowpass", 260, 0.016),
    storm: mkN("lowpass", 190, 0),
    wind: mkN("bandpass", 620, 0),
  };
}

/* ============================================================
   the world
   ============================================================ */
function start() {
  const canvas = document.getElementById("gamefx");
  if (!canvas) { toFallback(); return; }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  const DPR = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  scene.fog = new THREE.FogExp2(0x070a12, 0.0044);

  const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 900);
  const BASE_FOV = 74;

  /* camera rig: yaw group → pitch group → camera (+ recoil offsets) */
  const yawG = new THREE.Group(), pitchG = new THREE.Group();
  yawG.add(pitchG); pitchG.add(camera); scene.add(yawG);

  /* light — flat + cheap, no shadow maps; grounding comes from blob
     sprites + the ground shader's radial shade */
  scene.add(new THREE.HemisphereLight(0x8fb3d9, 0x232c3a, 0.8));
  scene.add(new THREE.AmbientLight(0x2a3444, 0.55));
  const sun = new THREE.DirectionalLight(0xdfeaff, 1.15);
  sun.position.set(60, 120, -40);
  scene.add(sun);
  const muzzleLight = new THREE.PointLight(COL.lime, 0, 9);
  scene.add(muzzleLight);

  const rng = mulberry32(SEED);

  /* ---------- sky: gradient dome + static star points ---------- */
  {
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uT: { value: 0 } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 lo = vec3(0.055, 0.075, 0.13);
          vec3 mid = vec3(0.022, 0.030, 0.058);
          vec3 hi = vec3(0.008, 0.010, 0.022);
          vec3 c = mix(lo, mid, smoothstep(-0.08, 0.25, h));
          c = mix(c, hi, smoothstep(0.2, 0.85, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(760, 24, 16), skyMat));
    const starN = 900, sp = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      const a = rng() * Math.PI * 2, e = 0.06 + rng() * 1.35, r = 700;
      sp[i * 3] = Math.cos(a) * Math.cos(e) * r;
      sp[i * 3 + 1] = Math.sin(e) * r;
      sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfd4ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false })));
  }

  /* ---------- storm + ground shared uniforms ---------- */
  const stormU = {
    uR: { value: STORM_R0 },          /* current radius */
    uTR: { value: STORM_R0 },         /* target ring radius */
    uC: { value: new THREE.Vector2(0, 0) },
    uTC: { value: new THREE.Vector2(0, 0) },
    uT: { value: 0 },
  };

  /* ---------- ground ---------- */
  {
    const gMat = new THREE.ShaderMaterial({
      uniforms: { ...stormU, uFogC: { value: new THREE.Color(0x070a12) } },
      vertexShader: `
        varying vec3 vW;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        varying vec3 vW;
        uniform float uR, uTR, uT; uniform vec2 uC, uTC; uniform vec3 uFogC;
        void main(){
          /* carbon plate + fine grid */
          vec3 col = vec3(0.030, 0.036, 0.050);
          vec2 g1 = abs(fract(vW.xz / 4.0) - 0.5);
          float grid = smoothstep(0.485, 0.5, max(g1.x, g1.y));
          vec2 g2 = abs(fract(vW.xz / 24.0) - 0.5);
          float grid2 = smoothstep(0.492, 0.5, max(g2.x, g2.y));
          col += vec3(0.05, 0.07, 0.10) * grid * 0.55;
          col += vec3(0.10, 0.16, 0.20) * grid2 * 0.8;
          /* center pad rings (the antenna plaza) */
          float d0 = length(vW.xz);
          float rings = smoothstep(0.35, 0.0, abs(fract(d0 / 7.0) - 0.5) * 7.0 - 0.22) * smoothstep(30.0, 8.0, d0);
          col += vec3(0.35, 0.62, 0.18) * rings * 0.14;
          /* storm: outside current radius burns iris/magenta */
          float ds = length(vW.xz - uC);
          float outside = smoothstep(uR - 0.6, uR + 3.0, ds);
          vec3 stormCol = mix(vec3(0.28, 0.16, 0.75), vec3(0.62, 0.12, 0.42), 0.5 + 0.5 * sin(uT * 0.7 + ds * 0.05));
          col = mix(col, col * 0.35 + stormCol * 0.35, outside);
          /* current edge line + target ring guide (white, dashed feel) */
          float edge = smoothstep(1.4, 0.15, abs(ds - uR));
          col += vec3(0.45, 0.30, 0.95) * edge * (0.5 + 0.3 * sin(uT * 3.0));
          float dt2 = length(vW.xz - uTC);
          float tEdge = smoothstep(0.45, 0.06, abs(dt2 - uTR)) * (0.5 + 0.5 * sin(dt2 * 2.2 + uT * 2.0));
          col += vec3(0.85) * tEdge * 0.085;
          /* radial shade toward horizon + cheap fog */
          col *= 1.0 - smoothstep(60.0, 240.0, d0) * 0.35;
          float fogF = 1.0 - exp(-0.0044 * 0.0044 * dot(vW.xz - cameraPosition.xz, vW.xz - cameraPosition.xz));
          gl_FragColor = vec4(mix(col, uFogC, clamp(fogF, 0.0, 1.0)), 1.0);
        }`,
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 240, 72), gMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
  }

  /* ---------- storm wall ---------- */
  const stormWall = (() => {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uT: stormU.uT },
      vertexShader: `
        varying vec2 vUv; varying vec3 vW;
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        varying vec2 vUv; varying vec3 vW; uniform float uT;
        float hx(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          float cell = 26.0;
          vec2 p = vec2(vUv.x * cell * 6.0, vUv.y * cell + uT * 0.55);
          float n = hx(floor(p));
          float band = smoothstep(0.62, 0.98, n) * 0.8;
          float base = 0.10 + 0.08 * sin(vUv.x * 40.0 + uT * 1.3);
          float vFade = smoothstep(1.0, 0.72, vUv.y) * smoothstep(0.0, 0.06, vUv.y);
          vec3 col = mix(vec3(0.30, 0.18, 0.85), vec3(0.75, 0.16, 0.5), 0.5 + 0.5 * sin(uT * 0.4 + vUv.x * 6.28));
          float a = (base + band * 0.5) * vFade * 0.22;
          float dCam = distance(vW.xz, cameraPosition.xz);
          a *= smoothstep(2.0, 9.0, dCam);        /* don't blind at the membrane */
          a *= 0.35 + 0.65 * smoothstep(160.0, 60.0, dCam);  /* far side = glow, not wash */
          gl_FragColor = vec4(col, a);
        }`,
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 72, 96, 1, true), m);
    wall.position.y = 36;
    scene.add(wall);
    return wall;
  })();

  /* ---------- colliders ----------
     Static AABBs: {min, max}. Dynamic (barriers) get {hp, mesh}. */
  const colliders = [];
  const addBox = (cx, cz, w, d, h, y0 = 0) =>
    colliders.push({ min: new THREE.Vector3(cx - w / 2, y0, cz - d / 2), max: new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2) });

  /* ---------- buildings: instanced towers w/ procedural windows ---------- */
  const bTint = new THREE.Color();
  {
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    bGeo.translate(0, 0.5, 0); /* origin at feet — scale.y = height */
    const bMat = new THREE.ShaderMaterial({
      uniforms: { uT: stormU.uT, uFogC: { value: new THREE.Color(0x070a12) } },
      vertexShader: `
        attribute vec3 iCol;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vCol; varying vec3 vScale;
        void main(){
          vUv = uv; vCol = iCol;
          vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vCol; varying vec3 vScale;
        uniform float uT; uniform vec3 uFogC;
        float hx(vec2 p){ return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453); }
        void main(){
          vec3 base = vec3(0.045, 0.052, 0.070);
          float upN = abs(vN.y);
          /* side faces: window grid scaled by real face size */
          vec2 fSize = (abs(vN.x) > 0.5) ? vScale.zy : vScale.xy;
          vec2 wuv = vUv * fSize;
          vec2 cellId = floor(wuv / vec2(1.15, 1.35));
          vec2 cuv = fract(wuv / vec2(1.15, 1.35));
          float win = step(0.30, cuv.x) * step(cuv.x, 0.74) * step(0.32, cuv.y) * step(cuv.y, 0.72);
          float lit = step(0.55, hx(cellId + floor(vCol.rg * 91.0)));
          float flick = 0.75 + 0.25 * sin(uT * (0.4 + hx(cellId.yx) * 1.2) + hx(cellId) * 40.0);
          vec3 winCol = vCol * (0.35 + 0.65 * lit) * flick;
          vec3 col = base * (0.75 + 0.25 * vN.y);
          col += winCol * win * (1.0 - upN) * 0.85;
          /* roof rim glow */
          float rim = smoothstep(0.965, 1.0, vUv.y) * (1.0 - upN);
          col += vCol * rim * 0.9;
          if (upN > 0.5) col = base * 1.4 + vCol * 0.05;   /* roofs readable to land on */
          float fogF = 1.0 - exp(-0.0044 * 0.0044 * dot(vW.xz - cameraPosition.xz, vW.xz - cameraPosition.xz));
          gl_FragColor = vec4(mix(col, uFogC, clamp(fogF, 0.0, 1.0)), 1.0);
        }`,
    });

    /* POIs: 6 districts around the ring + center plaza structures */
    const placements = [];
    const place = (cx, cz, w, d, h, tint) => { placements.push({ cx, cz, w, d, h, tint }); addBox(cx, cz, w, d, h); };
    const HUES = [COL.lime, COL.cyan, COL.magenta, COL.teal, COL.amber, COL.pearl];
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2 + 0.35;
      const pr = 96 + rng() * 34;
      const px = Math.cos(a) * pr, pz = Math.sin(a) * pr;
      const hue = HUES[p];
      const n = 5 + Math.floor(rng() * 3);
      for (let b = 0; b < n; b++) {
        const ba = rng() * Math.PI * 2, br = 4 + rng() * 22;
        const bx = px + Math.cos(ba) * br, bz = pz + Math.sin(ba) * br;
        const w = 5 + rng() * 9, d = 5 + rng() * 9;
        const h = 3.2 + rng() * (b === 0 ? 16 : 9);
        place(bx, bz, w, d, h, hue);
      }
      /* stair run up to one low roof per district: rising boxes */
      const sx = px + 14, sz = pz - 8;
      for (let s = 0; s < 6; s++) place(sx + s * 1.35, sz, 1.35, 3.2, 0.48 * (s + 1), hue);
    }
    /* mid-field scatter: lone relays between districts */
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, r = 30 + rng() * 60;
      place(Math.cos(a) * r, Math.sin(a) * r, 3.5 + rng() * 4, 3.5 + rng() * 4, 2.6 + rng() * 5, HUES[Math.floor(rng() * 6)]);
    }
    /* center plaza: 4 low bunkers around the antenna */
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4;
      place(Math.cos(a) * 13, Math.sin(a) * 13, 6, 6, 3.0, COL.lime);
    }

    const inst = new THREE.InstancedMesh(bGeo, bMat, placements.length);
    const iCol = new Float32Array(placements.length * 3);
    const m4 = new THREE.Matrix4();
    placements.forEach((p, i) => {
      m4.makeScale(p.w, p.h, p.d).setPosition(p.cx, 0, p.cz);
      inst.setMatrixAt(i, m4);
      bTint.setHex(p.tint);
      iCol[i * 3] = bTint.r; iCol[i * 3 + 1] = bTint.g; iCol[i * 3 + 2] = bTint.b;
    });
    bGeo.setAttribute("iCol", new THREE.InstancedBufferAttribute(iCol, 3));
    inst.frustumCulled = false;
    scene.add(inst);
  }

  /* ---------- crates: jumpable cover (1.2u) + stacks ---------- */
  {
    const cGeo = new THREE.BoxGeometry(1.7, 1.2, 1.7);
    cGeo.translate(0, 0.6, 0);
    const cMat = new THREE.MeshStandardMaterial({ color: 0x1c2431, roughness: 0.7, metalness: 0.15, emissive: 0x0c2a10, emissiveIntensity: 0.6 });
    const spots = [];
    for (let i = 0; i < 46; i++) {
      const a = rng() * Math.PI * 2, r = 12 + rng() * 150;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const stack = rng() < 0.3 ? 2 : 1;
      for (let s = 0; s < stack; s++) { spots.push([x, s * 1.2, z]); }
      addBox(x, z, 1.7, 1.7, 1.2 * stack);
    }
    const inst = new THREE.InstancedMesh(cGeo, cMat, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach((s, i) => { m4.makeTranslation(s[0], s[1], s[2]); inst.setMatrixAt(i, m4); });
    inst.frustumCulled = false;
    scene.add(inst);
  }

  /* ---------- the antenna (center landmark, visible everywhere) ---------- */
  {
    const g = new THREE.Group();
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x2a3342, roughness: 0.55, metalness: 0.25 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 64, 8), mastMat);
    mast.position.y = 32; g.add(mast);
    const dishMat = new THREE.MeshStandardMaterial({ color: 0x0e1218, emissive: COL.lime, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2 - i * 0.8, 0.12, 6, 32), dishMat);
      ring.position.y = 46 + i * 6; ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: COL.lime }));
    beacon.position.y = 65; g.add(beacon);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.6, 10), mastMat);
    plat.position.y = 0.3; g.add(plat);
    addBox(0, 0, 3.0, 3.0, 64);        /* mast blocks bullets + walking */
    addBox(0, 0, 11, 11, 0.62);        /* plaza platform, walkable */
    scene.add(g);
    /* slow beacon pulse baked into the loop below via userData */
    stormWall.userData.beacon = beacon;
  }

  /* ---------- arena boundary: faint hex membrane at ARENA_R ---------- */
  {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { uT: stormU.uT },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv; uniform float uT;
        void main(){
          float ln = smoothstep(0.06, 0.0, abs(fract(vUv.x * 120.0) - 0.5) * 0.16)
                   + smoothstep(0.06, 0.0, abs(fract(vUv.y * 16.0) - 0.5) * 0.16);
          float vFade = smoothstep(1.0, 0.55, vUv.y);
          gl_FragColor = vec4(vec3(0.35, 0.75, 1.0), ln * vFade * 0.045);
        }`,
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R, ARENA_R, 40, 96, 1, true), m);
    wall.position.y = 20;
    scene.add(wall);
  }

  /* ============================================================
     physics helpers — capsule vs AABB, ray vs AABB
     ============================================================ */
  const dynColliders = [];   /* barriers: {min,max,hp,mesh,owner} */
  const allCols = () => colliders.concat(dynColliders);

  /* resolve a sphere at p (radius r) against every box; returns
     ground contact. Two sphere samples approximate the capsule. */
  const _cl = new THREE.Vector3();
  function pushOutSphere(p, r) {
    let onTop = false;
    for (const c of allCols()) {
      _cl.set(
        Math.max(c.min.x, Math.min(p.x, c.max.x)),
        Math.max(c.min.y, Math.min(p.y, c.max.y)),
        Math.max(c.min.z, Math.min(p.z, c.max.z)),
      );
      const dx = p.x - _cl.x, dy = p.y - _cl.y, dz = p.z - _cl.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-9) {
        /* center inside the box — push out along smallest penetration */
        const px = Math.min(p.x - c.min.x, c.max.x - p.x);
        const py = Math.min(p.y - c.min.y, c.max.y - p.y);
        const pz = Math.min(p.z - c.min.z, c.max.z - p.z);
        if (px <= py && px <= pz) p.x += (p.x - c.min.x < c.max.x - p.x ? -(px + r) : px + r);
        else if (py <= px && py <= pz) { p.y += (p.y - c.min.y < c.max.y - p.y ? -(py + r) : py + r); if (p.y > c.max.y) onTop = true; }
        else p.z += (p.z - c.min.z < c.max.z - p.z ? -(pz + r) : pz + r);
        continue;
      }
      const d = Math.sqrt(d2), k = (r - d) / d;
      p.x += dx * k; p.y += dy * k; p.z += dz * k;
      if (dy > 0.7 * d) onTop = true;
    }
    return onTop;
  }

  /* slab-method ray vs AABB; returns t or Infinity */
  function rayBox(o, d, box, maxT) {
    let t0 = 0, t1 = maxT;
    for (const ax of ["x", "y", "z"]) {
      const inv = 1 / d[ax];
      let ta = (box.min[ax] - o[ax]) * inv, tb = (box.max[ax] - o[ax]) * inv;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return Infinity;
    }
    return t0;
  }
  /* nearest world hit along a ray: returns {t, dyn} (dyn = barrier ref) */
  function rayWorld(o, d, maxT) {
    let best = Infinity, dyn = null;
    for (const c of colliders) { const t = rayBox(o, d, c, maxT); if (t < best) { best = t; dyn = null; } }
    for (const c of dynColliders) { const t = rayBox(o, d, c, maxT); if (t < best) { best = t; dyn = c; } }
    /* ground plane */
    if (d.y < -1e-6) { const t = -o.y / d.y; if (t > 0 && t < best && t < maxT) { best = t; dyn = null; } }
    return { t: best, dyn };
  }
  /* ray vs vertical capsule (segment y0..y1, radius r) — cheap: sample
     as sphere at closest segment point to the ray's closest approach */
  const _q = new THREE.Vector3(), _w = new THREE.Vector3();
  function rayCapsule(o, d, cx, cy0, cy1, cz, r, maxT) {
    /* coarse: closest approach of ray to capsule axis midpointish */
    for (let s = 0; s < 3; s++) {
      const cy = cy0 + (cy1 - cy0) * (s / 2);
      _q.set(cx, cy, cz).sub(o);
      const tca = _q.dot(d);
      if (tca < 0 || tca > maxT) continue;
      _w.copy(d).multiplyScalar(tca).add(o);
      /* clamp to segment in y */
      const py = Math.max(cy0, Math.min(_w.y, cy1));
      const dx = _w.x - cx, dz = _w.z - cz, dy = _w.y - py;
      if (dx * dx + dy * dy + dz * dz < r * r) return tca;
    }
    return Infinity;
  }

  /* ============================================================
     player state
     ============================================================ */
  const P = {
    pos: new THREE.Vector3(0, 60, 118),   /* drop start; set again on deploy */
    vel: new THREE.Vector3(),
    yaw: Math.PI, pitch: 0,
    hp: PLAYER_HP, sh: PLAYER_SH,
    alive: true, grounded: false,
    crouch: false, sprintable: true,
    wIdx: 0, ammo: [WEAPONS[0].mag, WEAPONS[1].mag],
    reserve: [180, 48],
    reloading: 0, shotT: 0, burst: 0, recoilT: 0,
    spread: 0, ads: 0, adsOn: false,
    barrierCd: 0, kills: 0, dmgDone: 0,
    stormT: 0, lastStep: 0, deployed: false, gliding: false,
  };
  const EYE = 1.62, EYE_CROUCH = 1.05, RADIUS = 0.42;

  /* recoil springs (view punch) + weapon view model kick */
  const recoil = { p: 0, y: 0, vp: 0, vy: 0 };

  /* ============================================================
     view model — procedural rig + gun, lime accents
     ============================================================ */
  const vm = new THREE.Group();
  camera.add(vm);
  /* dedicated viewmodel lamp — world lights rarely face the camera */
  const vmLamp = new THREE.PointLight(0xaebfd8, 2.6, 3.2);
  vmLamp.position.set(0.35, 0.3, 0.3);
  camera.add(vmLamp);
  const vmMat = new THREE.MeshStandardMaterial({ color: 0x39424f, roughness: 0.5, metalness: 0.25, emissive: 0x171c26, emissiveIntensity: 1 });
  const vmAcc = new THREE.MeshBasicMaterial({ color: COL.lime });
  const guns = [];
  {
    /* rifle */
    const g0 = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), vmMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 8), vmMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.44);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.1), vmMat);
    mag.position.set(0, -0.14, 0.05); mag.rotation.x = 0.18;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.4), vmAcc);
    strip.position.set(0.052, 0.03, -0.1);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), vmMat);
    sight.position.set(0, 0.09, -0.1);
    g0.add(body, barrel, mag, strip, sight);
    /* dmr */
    const g1 = new THREE.Group();
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.78), vmMat);
    const br1 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.5, 8), vmMat);
    br1.rotation.x = Math.PI / 2; br1.position.set(0, 0.025, -0.6);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10), vmMat);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.1, -0.05);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.036, 10), new THREE.MeshBasicMaterial({ color: COL.cyan }));
    lens.position.set(0, 0.1, -0.161);
    const strip1 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.5), new THREE.MeshBasicMaterial({ color: COL.cyan }));
    strip1.position.set(0.048, 0.02, -0.15);
    g1.add(b1, br1, scope, lens, strip1);
    guns.push(g0, g1);
    g0.position.set(0.22, -0.20, -0.42); g0.rotation.y = 0.03;
    g1.position.set(0.22, -0.20, -0.42); g1.rotation.y = 0.03;
    g1.visible = false;
    vm.add(g0, g1);
    /* muzzle flash quad */
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xeaffc8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flash.position.set(0.22, -0.15, -1.0);
    vm.add(flash);
    vm.userData.flash = flash;
  }

  /* ============================================================
     bots — capsule bodies with hue accents + AI state machines.
     The rig factory is shared with squad replicas (remote humans).
     ============================================================ */
  const bots = [];
  const botGeoBody = new THREE.CapsuleGeometry(0.42, 0.9, 3, 8);
  const botGeoHead = new THREE.SphereGeometry(0.26, 10, 8);
  const botGeoVisor = new THREE.BoxGeometry(0.34, 0.09, 0.12);
  const rigGunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const rigGunMat = new THREE.MeshStandardMaterial({ color: 0x39424f, roughness: 0.5, metalness: 0.25 });
  const blobGeo = new THREE.CircleGeometry(0.55, 12);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
  function makeRig(hue) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x232c3a, roughness: 0.55, metalness: 0.2, emissive: hue, emissiveIntensity: 0.16 });
    const body = new THREE.Mesh(botGeoBody, bodyMat);
    body.position.y = 0.87;
    const head = new THREE.Mesh(botGeoHead, bodyMat.clone());
    head.position.y = 1.72;
    const visor = new THREE.Mesh(botGeoVisor, new THREE.MeshBasicMaterial({ color: hue }));
    visor.position.set(0, 1.74, -0.18);
    const gun = new THREE.Mesh(rigGunGeo, rigGunMat);
    gun.position.set(0.3, 1.15, -0.3);
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02;
    g.add(body, head, visor, gun, blob);   /* body FIRST — hit flash reads children[0] */
    scene.add(g);
    return { g, visor };
  }
  /* floating callsign for squad replicas — canvas sprite, faces camera */
  function nameSprite(text, hue) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 48;
    const cx = cv.getContext("2d");
    cx.font = "700 26px 'JetBrains Mono', monospace";
    cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.lineWidth = 7; cx.strokeStyle = "rgba(5,7,12,0.9)";
    cx.strokeText(text, 128, 26);
    cx.fillStyle = "#" + hue.toString(16).padStart(6, "0");
    cx.fillText(text, 128, 26);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false, opacity: 0.92 }));
    spr.scale.set(3.4, 0.64, 1);
    spr.position.y = 2.4;
    return spr;
  }
  for (let i = 0; i < 11; i++) {
    const hue = BOT_HUES[i % BOT_HUES.length];
    const { g, visor } = makeRig(hue);
    const a = (i / 11) * Math.PI * 2;
    bots.push({
      id: i, name: BOT_NAMES[i], hue, g, visor,
      pos: new THREE.Vector3(Math.cos(a) * (70 + rng() * 60), 0, Math.sin(a) * (70 + rng() * 60)),
      vel: new THREE.Vector3(), yaw: rng() * Math.PI * 2,
      hp: BOT_HP, sh: BOT_SH, alive: true,
      state: "drop", tState: rng() * 2,
      target: null, tHuman: null,
      wanderTo: new THREE.Vector3(), fireT: 0.4 + rng() * 0.6, burstLeft: 0,
      aim: 0.55 + rng() * 0.4,          /* skill: hit prob vs still target */
      react: 0.35 + rng() * 0.65,       /* s to acquire */
      acquireT: 0, kills: 0, strafeDir: rng() < 0.5 ? 1 : -1, strafeT: 0,
      dropY: 55 + rng() * 25, hitFlash: 0,
      npos: new THREE.Vector3(), nyaw: 0, nfresh: false,   /* guest-side net targets */
    });
  }
  const aliveBots = () => bots.filter((b) => b.alive);

  /* ---------- pickups: shield cells + ammo caches ---------- */
  const pickups = [];
  {
    const shGeo = new THREE.OctahedronGeometry(0.34, 0);
    const amGeo = new THREE.BoxGeometry(0.5, 0.34, 0.5);
    const shMat = new THREE.MeshBasicMaterial({ color: COL.cyan });
    const amMat = new THREE.MeshBasicMaterial({ color: COL.amber });
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * 155;
      const kind = i % 2 ? "shield" : "ammo";
      const m = new THREE.Mesh(kind === "shield" ? shGeo : amGeo, kind === "shield" ? shMat : amMat);
      m.position.set(Math.cos(a) * r, 0.8, Math.sin(a) * r);
      scene.add(m);
      pickups.push({ kind, m, live: true, spin: rng() * Math.PI * 2, i });
    }
  }

  /* ---------- tracers + impact sparks (pooled) ---------- */
  const tracers = [];
  {
    const tGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 4, 1, true);
    tGeo.translate(0, 0.5, 0); tGeo.rotateX(-Math.PI / 2);   /* +Z aligned */
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xdfffb0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      tracers.push({ m, t: 1 });
    }
  }
  let trI = 0;
  function spawnTracer(from, to, hue = 0xdfffb0) {
    const tr = tracers[trI++ % tracers.length];
    tr.m.material.color.setHex(hue);
    tr.m.position.copy(from);
    tr.m.lookAt(to);
    tr.m.scale.set(1, 1, from.distanceTo(to));
    tr.m.visible = true; tr.t = 0;
  }
  const sparks = [];
  {
    const sGeo = new THREE.SphereGeometry(0.05, 6, 4);
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      sparks.push({ m, t: 1, vel: new THREE.Vector3() });
    }
  }
  let spI = 0;
  function spawnSparks(at, n, hue) {
    for (let i = 0; i < n; i++) {
      const s = sparks[spI++ % sparks.length];
      s.m.material.color.setHex(hue);
      s.m.position.copy(at);
      s.vel.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).multiplyScalar(6);
      s.m.visible = true; s.t = 0;
    }
  }

  /* ---------- hardlight barrier (player tactical, Q) ---------- */
  const barrierMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: stormU.uT, uHp: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uT, uHp;
      void main(){
        vec2 g = abs(fract(vUv * vec2(10.0, 4.0)) - 0.5);
        float ln = smoothstep(0.5, 0.44, max(g.x, g.y));
        float edge = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x)
                   * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
        float scan = 0.75 + 0.25 * sin(vUv.y * 40.0 - uT * 6.0);
        vec3 col = mix(vec3(1.0, 0.35, 0.45), vec3(0.35, 0.9, 1.0), uHp);
        float a = (0.10 + (1.0 - ln) * 0.16) * scan + (1.0 - edge) * 0.25;
        gl_FragColor = vec4(col, a * 0.7);
      }`,
  });
  function placeBarrier(owner, x, z, yaw, y0 = 0, nid = null) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.6), barrierMat.clone());
    m.position.set(x, y0 + 1.3, z); m.rotation.y = yaw;
    scene.add(m);
    /* AABB: thin slab aligned to yaw's dominant axis (cheap + fine) */
    const c = Math.abs(Math.cos(yaw)), halfW = 2.3;
    const ex = c > 0.5 ? halfW : 0.35, ez = c > 0.5 ? 0.35 : halfW;
    const col = {
      min: new THREE.Vector3(x - ex, y0, z - ez),
      max: new THREE.Vector3(x + ex, y0 + 2.6, z + ez),
      hp: BARRIER_HP, mesh: m, owner, life: BARRIER_LIFE, nid,
    };
    dynColliders.push(col);
    sfxBarrier();
    return col;
  }
  function damageBarrier(col, dmg) {
    col.hp -= dmg;
    col.mesh.material.uniforms.uHp.value = Math.max(0, col.hp / BARRIER_HP);
    if (col.hp <= 0) {
      scene.remove(col.mesh); col.mesh.material.dispose();
      dynColliders.splice(dynColliders.indexOf(col), 1);
      sfxBarrierBreak();
    }
  }

  /* ============================================================
     HUD DOM refs (authored in game.html; JS only mutates)
     ============================================================ */
  const $ = (id) => document.getElementById(id);
  const hudEl = $("gHud"), menuEl = $("gMenu"), endEl = $("gEnd");
  const hpBar = $("gHpBar"), shBar = $("gShBar"), hpNum = $("gHpNum"), shNum = $("gShNum");
  const ammoEl = $("gAmmo"), reserveEl = $("gReserve"), wNameEl = $("gWName");
  const aliveEl = $("gAlive"), killsEl = $("gKills"), stormEl = $("gStorm");
  const feedEl = $("gFeed"), crossEl = $("gCross"), hitEl = $("gHitmark");
  const vigEl = $("gVig"), compEl = $("gCompass"), barCdEl = $("gBarCd");
  const miniCv = $("gMini"), miniCtx = miniCv ? miniCv.getContext("2d") : null;
  const dmgLayer = $("gDmg"), endTitle = $("gEndTitle"), endStats = $("gEndStats");
  const bannerEl = $("gBanner"), specEl = $("gSpec"), specName = $("gSpecName");
  const sndBtn = $("gSnd"), playBtn = $("gPlay"), againBtn = $("gAgain");

  /* floating damage numbers — small DOM pool projected from world */
  const dmgPool = [];
  for (let i = 0; i < 14; i++) {
    const el = document.createElement("b");
    el.className = "g-dmgnum";
    dmgLayer.appendChild(el);
    dmgPool.push({ el, t: 1, w: new THREE.Vector3(), crit: false });
  }
  let dmgI = 0;
  const _pv = new THREE.Vector3();
  function dmgNum(worldPos, amount, crit) {
    const d = dmgPool[dmgI++ % dmgPool.length];
    d.w.copy(worldPos); d.w.y += 0.6 + Math.random() * 0.4;
    d.w.x += (Math.random() - 0.5) * 0.5; d.w.z += (Math.random() - 0.5) * 0.5;
    d.t = 0; d.crit = crit;
    d.el.textContent = Math.round(amount);
    d.el.className = "g-dmgnum is-on" + (crit ? " is-crit" : "");
  }

  function feed(html) {
    const li = document.createElement("li");
    li.innerHTML = html;
    feedEl.prepend(li);
    while (feedEl.children.length > 5) feedEl.lastChild.remove();
    setTimeout(() => { li.classList.add("is-out"); setTimeout(() => li.remove(), 600); }, 4200);
  }
  function banner(text, cls = "") {
    bannerEl.textContent = text;
    bannerEl.className = "g-banner is-on " + cls;
    clearTimeout(banner._t);
    banner._t = setTimeout(() => bannerEl.classList.remove("is-on"), 2600);
  }

  /* ============================================================
     match state + storm
     ============================================================ */
  const M = {
    on: false, over: false, t: 0,
    phase: 0, phaseT: 0, shrinking: false,
    placement: 12, spectating: null,
    stormFrom: STORM_R0, stormFromC: new THREE.Vector2(),
  };

  function stormTargetFor(phase) {
    /* next circle center stays inside the shrunk-to circle (Fortnite rule) */
    const p = STORM_PHASES[phase];
    const prevR = phase === 0 ? STORM_R0 : STORM_PHASES[phase - 1].r;
    const prevC = stormU.uTC.value;
    const maxOff = Math.max(0, prevR - p.r) * 0.7;
    const a = rng() * Math.PI * 2, r = rng() * maxOff;
    return new THREE.Vector2(prevC.x + Math.cos(a) * r, prevC.y + Math.sin(a) * r);
  }

  function resetMatch() {
    M.on = true; M.over = false; M.t = 0; M.phase = 0; M.phaseT = 0; M.shrinking = false;
    M.placement = 12; M.spectating = null;
    stormU.uR.value = STORM_R0; stormU.uC.value.set(0, 0);
    stormU.uTR.value = STORM_PHASES[0].r;
    stormU.uTC.value.copy(stormTargetFor(0));
    M.stormFrom = STORM_R0; M.stormFromC.set(0, 0);
    P.hp = PLAYER_HP; P.sh = PLAYER_SH; P.alive = true; P.kills = 0; P.dmgDone = 0;
    P.ammo = [WEAPONS[0].mag, WEAPONS[1].mag]; P.reserve = [180, 48];
    P.wIdx = 0; P.reloading = 0; P.burst = 0; P.adsOn = false; P.barrierCd = 0;
    guns[0].visible = true; guns[1].visible = false;
    const da = Math.PI * 0.3 + rng() * Math.PI * 1.4;
    P.pos.set(Math.cos(da) * 130, 88, Math.sin(da) * 130);
    P.vel.set(0, 0, 0); P.yaw = Math.atan2(P.pos.x, P.pos.z) + Math.PI; P.pitch = -0.15;
    P.gliding = true; P.deployed = true;
    bots.forEach((b, i) => {
      b.alive = true; b.hp = BOT_HP; b.sh = BOT_SH; b.kills = 0;
      const a = (i / 11) * Math.PI * 2 + rng() * 0.5;
      b.pos.set(Math.cos(a) * (60 + rng() * 70), b.dropY, Math.sin(a) * (60 + rng() * 70));
      b.vel.set(0, 0, 0); b.state = "drop"; b.g.visible = true; b.target = null;
      b.tHuman = null; b.nfresh = false;
      b.fireT = 0.5 + rng();
    });
    for (const c of dynColliders.splice(0)) { scene.remove(c.mesh); c.mesh.material.dispose(); }
    pickups.forEach((p) => { p.live = true; p.m.visible = true; });
    feedEl.innerHTML = "";
    document.body.classList.add("game-match");
    banner("DROP LAUNCHED — STEER TO A DISTRICT", "is-lime");
    bedsBoot();
  }

  /* who's left, including me + squad humans */
  const aliveCount = () => aliveBots().length + (P.alive ? 1 : 0) + alivePeers().length;

  function endMatch(won) {
    if (M.over) return;
    M.over = true; M.on = false;
    specEl.classList.remove("is-on");
    document.exitPointerLock?.();
    won ? sfxWin() : sfxLose();
    endTitle.textContent = won ? "SIGNAL SECURED" : "SIGNAL LOST";
    endTitle.className = "g-end__title " + (won ? "is-win" : "is-lose");
    const place = won ? 1 : M.placement;
    const winner = won ? "YOU" : (aliveBots()[0]?.name || alivePeers()[0]?.name || "NO SIGNAL");
    endStats.innerHTML =
      `<span># ${place} <i>/ 12</i></span>` +
      `<span>${P.kills} <i>ELIMS</i></span>` +
      `<span>${Math.round(P.dmgDone)} <i>DMG</i></span>` +
      `<span>${Math.floor(M.t / 60)}:${String(Math.floor(M.t % 60)).padStart(2, "0")} <i>SURVIVED</i></span>` +
      (NET.started ? `<span>${winner} <i>WINNER</i></span>` : "");
    if (againBtn && NET.on && !iAmHost()) { againBtn.disabled = true; againBtn.textContent = "HOST RELAUNCHES"; }
    setTimeout(() => { endEl.classList.add("is-on"); hudEl.classList.remove("is-live"); }, won ? 1400 : 900);
  }

  function onPlayerDeath(killerName, killerId) {
    P.alive = false;
    M.placement = aliveCount() + 1;
    feed(`<b class="f-them">${killerName}</b> eliminated <b class="f-you">YOU</b>`);
    banner(`ELIMINATED — #${M.placement} OF 12`, "is-red");
    sfxLose();
    if (NET.on && NET.started) netSend({ t: "died", id: NET.id, by: killerName, bid: killerId || null });
    /* spectate the killer (human or bot), or whoever still stands */
    const kp = killerId ? NET.peers.get(killerId) : null;
    M.spectating = (kp?.inMatch && kp.alive ? kp : null)
      || aliveBots().find((b) => b.name === killerName) || aliveBots()[0] || alivePeers()[0] || null;
    if (M.spectating) {
      specEl.classList.add("is-on");
      specName.textContent = M.spectating.name;
    } else { endMatch(false); }
  }

  function killBot(b, byPlayer, killerName, srcHid) {
    b.alive = false; b.g.visible = false;
    if (NET.on && NET.started)
      netSend({ t: "bkill", i: b.id, by: byPlayer ? NET.callsign : killerName, bid: byPlayer ? NET.id : (srcHid && srcHid !== "me" ? srcHid : null) });
    botDeathFx(b, byPlayer, killerName);
  }

  /* damage router: any source → any target */
  function hurtBot(b, dmg, crit, from, byPlayer, killerName, srcHid) {
    if (!b.alive) return;
    let left = dmg;
    if (b.sh > 0) { const absorbed = Math.min(b.sh, left); b.sh -= absorbed; left -= absorbed; if (b.sh <= 0) sfxShieldBreak(); }
    b.hp -= left;
    b.hitFlash = 1;
    if (byPlayer) {
      P.dmgDone += dmg;
      dmgNum(b.pos.clone().setY(b.pos.y + 1.5), dmg, crit);
      crit ? sfxDink() : sfxHit();
      hitEl.className = "g-hitmark is-on" + (crit ? " is-crit" : "");
      clearTimeout(hitEl._t); hitEl._t = setTimeout(() => (hitEl.className = "g-hitmark"), 120);
    }
    if (b.hp <= 0) killBot(b, byPlayer, killerName, srcHid);
    else if (byPlayer || (srcHid && srcHid !== "me")) {
      /* return fire interest — at whichever human shot it */
      b.acquireT = Math.min(b.acquireT, b.react * 0.3);
      b.target = null; b.tHuman = byPlayer ? "me" : srcHid; b.state = "engage";
    }
  }
  function hurtPlayer(dmg, killerName, killerId) {
    if (!P.alive || M.over) return;
    let left = dmg;
    if (P.sh > 0) { const absorbed = Math.min(P.sh, left); P.sh -= absorbed; left -= absorbed; if (P.sh <= 0) sfxShieldBreak(); }
    P.hp -= left;
    sfxHurt();
    vigEl.classList.add("is-hit");
    clearTimeout(vigEl._t); vigEl._t = setTimeout(() => vigEl.classList.remove("is-hit"), 220);
    recoil.vp += 0.9; recoil.vy += (Math.random() - 0.5) * 1.2;
    if (P.hp <= 0) { P.hp = 0; onPlayerDeath(killerName, killerId); }
  }

  /* ============================================================
     SQUAD LINK — online rooms with friends.
     Authority model: every client owns its OWN player (movement,
     hp, and the shots it fires — favor the shooter); the HOST
     (earliest joiner present) owns the bots, the storm clock and
     its phase targets. Small JSON payloads on one broadcast event.
     ============================================================ */
  const QS = new URLSearchParams(location.search);
  const NET = {
    t: null, on: false, room: "", started: false,
    id: Math.random().toString(36).slice(2, 9),
    callsign: "", joinT: 0, hostId: null,
    peers: new Map(), seq: 0, lastShotTx: 0, lastBotTx: 0,
  };
  try { NET.callsign = localStorage.getItem("game-callsign") || ""; } catch (e) { /* private mode */ }
  NET.callsign = NET.callsign.toUpperCase().replace(/[^A-Z0-9\-]/g, "").slice(0, 10) || ("NODE-" + NET.id.slice(0, 2).toUpperCase());
  const netSend = (p) => { if (NET.t && NET.on) NET.t.send(p); };
  const iAmHost = () => !NET.on || NET.hostId === NET.id;
  const alivePeers = () => { const a = []; for (const pr of NET.peers.values()) if (pr.inMatch && pr.alive) a.push(pr); return a; };
  const feedName = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9\- ]/g, "").slice(0, 12) || "UNIT";
  const HUMAN_HUES = [COL.teal, COL.amber, 0x9fd8ff, COL.pearl];
  const hueFor = (id) => HUMAN_HUES[(id.charCodeAt(0) * 7 + id.charCodeAt(1)) % HUMAN_HUES.length];
  const _no = new THREE.Vector3(), _nh = new THREE.Vector3();
  let _hum = [];                               /* humans list, rebuilt each host sim tick */

  function humansAll() {
    const out = [];
    if (P.alive && M.on && !M.over) out.push({ hid: "me", pos: P.pos, eye: playerEye(), vel: P.vel, crouch: P.crouch });
    for (const pr of alivePeers()) out.push({ hid: pr.id, pos: pr.pos, eye: pr.pos.y + 1.55, vel: pr.vel, crouch: pr.crouch });
    return out;
  }

  function mkPeer(id, meta) {
    return {
      id, name: feedName(meta.name).replace(/ /g, "-").slice(0, 10), joinT: meta.joinT || Date.now(),
      hue: hueFor(id),
      inMatch: false, alive: false, hp: PLAYER_HP, sh: PLAYER_SH,
      rig: null, pos: new THREE.Vector3(), yaw: 0, vel: new THREE.Vector3(),
      gliding: false, crouch: false, wIdx: 0, p0: null, p1: null,
    };
  }
  function peerRig(pr) {
    if (pr.rig) return;
    pr.rig = makeRig(pr.hue);
    pr.rig.g.add(nameSprite(pr.name, pr.hue));
    pr.rig.g.visible = false;
  }
  function removePeerRig(pr) {
    if (!pr.rig) return;
    scene.remove(pr.rig.g);
    for (const o of pr.rig.g.children) {
      if (o.material === rigGunMat || o.material === blobMat) continue;
      if (o.material?.map) o.material.map.dispose();
      o.material?.dispose?.();
    }
    pr.rig = null;
  }

  /* ---------- squad panel DOM ---------- */
  const squadEl = $("gSquad"), squadState = $("gSquadState"), makeBox = $("gSquadMake"), roomBox = $("gSquadRoom");
  const callsignIn = $("gCallsign"), codeIn = $("gCode"), hostBtn = $("gHost"), joinBtn = $("gJoin");
  const roomCodeEl = $("gRoomCode"), rosterEl = $("gRoster"), copyBtn = $("gCopy"), leaveBtn = $("gLeave");

  if (callsignIn) {
    callsignIn.value = NET.callsign;
    callsignIn.addEventListener("input", () => {
      NET.callsign = callsignIn.value.toUpperCase().replace(/[^A-Z0-9\-]/g, "").slice(0, 10) || "NODE";
      callsignIn.value = NET.callsign;
      try { localStorage.setItem("game-callsign", NET.callsign); } catch (e) { /* ignore */ }
    });
  }

  function roomCode() {
    const AB = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
    let c = "";
    for (let i = 0; i < 4; i++) c += AB[Math.floor(Math.random() * AB.length)];
    return c;
  }

  function syncSquadUi() {
    if (!squadEl) return;
    squadEl.classList.toggle("is-on", NET.on && NET.t?.kind === "supa");
    squadEl.classList.toggle("is-link", NET.on && NET.t?.kind !== "supa");
    makeBox.hidden = !!NET.t;
    roomBox.hidden = !NET.t;
    roomCodeEl.textContent = NET.room || "----";
    if (NET.t) {
      const rows = [{ id: NET.id, name: NET.callsign, joinT: NET.joinT, me: true }];
      for (const pr of NET.peers.values()) rows.push({ id: pr.id, name: pr.name, joinT: pr.joinT });
      rows.sort((a, b) => a.joinT - b.joinT || (a.id < b.id ? -1 : 1));
      rosterEl.innerHTML = rows.map((r) =>
        `<li class="${r.id === NET.hostId ? "is-host" : ""}${r.me ? " is-me" : ""}">${r.id === NET.hostId ? "★ " : ""}${r.name}${r.me ? " · YOU" : ""}</li>`).join("");
    }
    /* deploy button reflects squad role */
    if (NET.on && !iAmHost()) {
      const live = M.on && !M.over;
      playBtn.disabled = !live;
      playBtn.textContent = live ? "DROP NOW" : "WAITING FOR HOST";
    } else if (NET.on) {
      playBtn.disabled = false;
      playBtn.textContent = M.on && !M.over ? "RESUME DROP" : "DEPLOY SQUAD";
    } else if (!M.on) {
      playBtn.disabled = false;
      playBtn.textContent = "DEPLOY";
    }
  }

  function recomputeHost() {
    let best = { id: NET.id, joinT: NET.joinT };
    for (const pr of NET.peers.values())
      if (pr.joinT < best.joinT || (pr.joinT === best.joinT && pr.id < best.id)) best = pr;
    const was = NET.hostId;
    NET.hostId = best.id;
    if (was && was !== NET.hostId && NET.hostId === NET.id && NET.started && M.on && !M.over) {
      /* promoted mid-match: adopt the replicated bots + storm as sim state */
      for (const b of aliveBots()) { b.state = "wander"; b.tState = 0.3; b.target = null; b.tHuman = null; b.vel.set(0, 0, 0); }
      banner("SIGNAL AUTHORITY ASSUMED", "is-amber");
    }
  }

  function netState(s) {
    if (s === "on") {
      NET.on = true;
      squadState.textContent = "ROOM LIVE";
      /* honesty markers: game-squad claims a REAL internet relay */
      if (NET.t.kind === "supa") document.body.classList.add("game-squad");
      else if (NET.t.kind === "bc") document.body.classList.add("game-squad-local");
      recomputeHost(); syncSquadUi(); sfxUi();
    } else if (s === "err") {
      const was = NET.on;
      NET.on = false;
      document.body.classList.remove("game-squad", "game-squad-local");
      squadState.textContent = "LINK LOST";
      if (was && M.on && !M.over) banner("SQUAD LINK LOST", "is-red");
      syncSquadUi();
    } else {
      NET.on = false;
      document.body.classList.remove("game-squad", "game-squad-local");
      squadState.textContent = "OFFLINE";
      syncSquadUi();
    }
  }

  function netJoin(code) {
    if (NET.t) return;
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (code.length < 4) { squadState.textContent = "CODE?"; return; }
    NET.room = code; NET.joinT = Date.now();
    squadState.textContent = "LINKING…";
    const kindQ = QS.get("net");
    const make = kindQ === "stub" ? stubTransport : kindQ === "bc" ? bcTransport : supaTransport;
    NET.t = make({ onPeers: onPeersSync, onMsg: netMsg, onState: netState });
    syncSquadUi();
    NET.t.join(code, { id: NET.id, name: NET.callsign, joinT: NET.joinT });
  }

  function netLeave() {
    if (!NET.t) return;
    NET.t.leave(); NET.t = null;
    for (const pr of NET.peers.values()) removePeerRig(pr);
    NET.peers.clear(); NET.hostId = null; NET.room = ""; NET.started = false;
    syncSquadUi();
  }

  function onPeersSync(map) {
    for (const [id, meta] of map)
      if (!NET.peers.has(id)) { NET.peers.set(id, mkPeer(id, meta)); sfxUi(); }
    for (const [id, pr] of NET.peers)
      if (!map.has(id)) { peerLeft(pr); NET.peers.delete(id); }
    recomputeHost(); syncSquadUi();
  }
  function peerLeft(pr) {
    if (pr.inMatch && pr.alive && NET.started && M.on && !M.over) {
      pr.alive = false;
      feed(`<b class="f-them">${pr.name}</b> lost link — eliminated`);
      endCheck();
    }
    removePeerRig(pr);
  }

  /* ---------- match lifecycle over the wire ---------- */
  function startNetMatch(roster) {
    endEl.classList.remove("is-on");
    M.over = false;
    resetMatch();
    NET.started = true;
    const ids = roster.map((r) => r[0]);
    const botsUsed = Math.max(0, 12 - ids.length);
    for (const b of bots) if (b.id >= botsUsed) { b.alive = false; b.g.visible = false; }
    for (const pr of NET.peers.values()) {
      const inR = ids.includes(pr.id);
      pr.inMatch = inR; pr.alive = inR;
      pr.hp = PLAYER_HP; pr.sh = PLAYER_SH;
      pr.p0 = pr.p1 = null;
      if (inR) peerRig(pr);
      if (pr.rig) pr.rig.g.visible = false;    /* until the first snap */
    }
    if (againBtn) { againBtn.disabled = false; againBtn.textContent = "RE-DEPLOY"; }
    banner(`SQUAD DROP — ${ids.length} NODE${ids.length > 1 ? "S" : ""} LINKED`, "is-lime");
    syncSquadUi();
  }

  function launchSquad() {
    const rows = [{ id: NET.id, name: NET.callsign, joinT: NET.joinT }];
    for (const pr of NET.peers.values()) rows.push({ id: pr.id, name: pr.name, joinT: pr.joinT });
    rows.sort((a, b) => a.joinT - b.joinT || (a.id < b.id ? -1 : 1));
    const roster = rows.slice(0, 4).map((r) => [r.id, r.name]);
    startNetMatch(roster);
    netSend({ t: "go", roster, st0: { tr: stormU.uTR.value, tc: [stormU.uTC.value.x, stormU.uTC.value.y] } });
  }

  function onGo(m) {
    if (!Array.isArray(m.roster) || !m.roster.some((r) => r[0] === NET.id)) {
      $("gMenuTitle").textContent = "MATCH IN PROGRESS — WAIT FOR THE NEXT DROP";
      return;
    }
    startNetMatch(m.roster);
    if (m.st0) { stormU.uTR.value = m.st0.tr; stormU.uTC.value.set(m.st0.tc[0], m.st0.tc[1]); }
    if (!locked && !SIM) {
      menuEl.classList.add("is-on");
      $("gMenuTitle").textContent = "SQUAD DEPLOYED — DIVE NOW";
    }
    syncSquadUi();
  }

  /* ---------- snapshots ---------- */
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  function txSnap() {
    if (!NET.on || !NET.started || !M.on || M.over || !P.deployed) return;
    netSend({ t: "s", id: NET.id, x: r1(P.pos.x), y: r1(P.pos.y), z: r1(P.pos.z), yw: r2(P.yaw),
      hp: Math.round(P.hp), sh: Math.round(P.sh), al: P.alive ? 1 : 0,
      gl: P.gliding ? 1 : 0, cr: P.crouch ? 1 : 0, w: P.wIdx });
  }
  function onSnap(m) {
    if (![m.x, m.y, m.z, m.yw].every(Number.isFinite)) return;   /* malformed peer — never NaN the sim */
    let pr = NET.peers.get(m.id);
    if (!pr) {
      if (NET.peers.size >= 16) return;                          /* flood guard */
      pr = mkPeer(m.id, { name: "UNIT", joinT: Date.now() }); NET.peers.set(m.id, pr);
    }
    if (NET.started && !pr.inMatch) { pr.inMatch = true; pr.alive = !!m.al; peerRig(pr); }  /* snap-before-presence heal */
    pr.hp = m.hp; pr.sh = m.sh;
    pr.gliding = !!m.gl; pr.crouch = !!m.cr; pr.wIdx = m.w || 0;
    if (pr.p1) pr.p0 = pr.p1;
    pr.p1 = { rt: performance.now(), x: m.x, y: m.y, z: m.z, yw: m.yw };
    if (!pr.p0) { pr.pos.set(m.x, m.y, m.z); pr.yaw = m.yw; }
  }
  const REND_LAG = 140;                        /* render replicas this far in the past */
  function stepPeers() {
    const rNow = performance.now() - REND_LAG;
    for (const pr of NET.peers.values()) {
      if (!pr.rig) continue;
      const a = pr.p0, b = pr.p1;
      if (b) {
        if (a && b.rt > a.rt) {
          const span = (b.rt - a.rt) / 1000 || 0.1;
          const k = Math.max(0, Math.min(1.3, (rNow - a.rt) / (b.rt - a.rt)));
          pr.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
          pr.vel.set((b.x - a.x) / span, 0, (b.z - a.z) / span);
          let dy = b.yw - a.yw;
          while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
          pr.yaw = a.yw + dy * Math.min(1, k);
        } else { pr.pos.set(b.x, b.y, b.z); pr.yaw = b.yw; }
      }
      pr.rig.g.visible = NET.started && pr.inMatch && pr.alive && !!b;
      pr.rig.g.position.copy(pr.pos);
      pr.rig.g.rotation.y = pr.yaw;
      pr.rig.g.rotation.x = pr.gliding ? 0.4 : 0;
    }
  }

  /* ---------- host authority broadcast: bots + storm ---------- */
  function txBots() {
    const rows = [];
    for (const b of aliveBots()) rows.push([b.id, r1(b.pos.x), r1(b.pos.y), r1(b.pos.z), r2(b.yaw), Math.round(b.hp), Math.round(b.sh)]);
    netSend({ t: "bs", b: rows });
  }
  function onBotSnap(m) {
    for (const row of m.b) {
      if (!Array.isArray(row) || !row.slice(1).every(Number.isFinite)) continue;
      const b = bots[row[0]];
      if (!b || !b.alive) continue;
      b.npos.set(row[1], row[2], row[3]); b.nyaw = row[4]; b.nfresh = true;
      b.hp = row[5]; b.sh = row[6];
    }
  }
  function guestBotStep(dt) {
    for (const b of aliveBots()) {
      if (!b.nfresh) continue;
      b.pos.lerp(b.npos, Math.min(1, dt * 8));
      let dy = b.nyaw - b.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      b.yaw += dy * Math.min(1, dt * 8);
      b.g.position.copy(b.pos); b.g.rotation.y = b.yaw;
      if (b.hitFlash > 0) {
        b.hitFlash = Math.max(0, b.hitFlash - dt * 5);
        b.g.children[0].material.emissiveIntensity = 0.12 + b.hitFlash * 1.4;
      }
    }
  }
  function txStorm() {
    netSend({ t: "st", ph: M.phase, sk: M.shrinking ? 1 : 0, pt: r1(M.phaseT),
      r: r1(stormU.uR.value), c: [r1(stormU.uC.value.x), r1(stormU.uC.value.y)],
      tr: r1(stormU.uTR.value), tc: [r1(stormU.uTC.value.x), r1(stormU.uTC.value.y)],
      fr: r1(M.stormFrom), fc: [r1(M.stormFromC.x), r1(M.stormFromC.y)] });
  }
  function onStorm(m) {
    if (m.sk && !M.shrinking) banner("THE RING IS CLOSING", "is-iris");
    M.phase = m.ph; M.shrinking = !!m.sk; M.phaseT = m.pt;
    M.stormFrom = m.fr; M.stormFromC.set(m.fc[0], m.fc[1]);
    stormU.uTR.value = m.tr; stormU.uTC.value.set(m.tc[0], m.tc[1]);
    /* R/C converge halfway per sync — no teleport pop */
    stormU.uR.value += (m.r - stormU.uR.value) * 0.5;
    stormU.uC.value.x += (m.c[0] - stormU.uC.value.x) * 0.5;
    stormU.uC.value.y += (m.c[1] - stormU.uC.value.y) * 0.5;
  }

  /* ---------- deaths over the wire ---------- */
  function endCheck() {
    if (M.on && !M.over && aliveCount() <= 1) endMatch(P.alive);
  }
  function nextSpectate() {
    const cands = [...aliveBots(), ...alivePeers()];
    M.spectating = cands[0] || null;
    if (M.spectating) { specEl.classList.add("is-on"); specName.textContent = M.spectating.name; }
    else if (M.on && !M.over) endMatch(false);
  }
  function botDeathFx(b, byMe, killerName) {
    spawnSparks(b.pos.clone().setY(b.pos.y + 1.2), 8, b.hue);
    if (byMe) {
      P.kills++;
      P.sh = Math.min(PLAYER_SH, P.sh + SIPHON);   /* Fortnite siphon */
      sfxKill();
      feed(`<b class="f-you">YOU</b> eliminated <b class="f-them">${b.name}</b>`);
      banner(`ELIMINATED ${b.name} — ${aliveCount() - 1} REMAIN`, "is-lime");
    } else {
      feed(`<b class="f-them">${killerName}</b> eliminated <b class="f-them">${b.name}</b>`);
    }
    if (M.spectating === b) nextSpectate();
    endCheck();
  }
  function onBotKillMsg(m) {
    if (iAmHost()) return;                       /* authority already resolved its own */
    const b = bots[m.i];
    if (!b || !b.alive) return;
    b.alive = false; b.g.visible = false;
    botDeathFx(b, m.bid === NET.id, feedName(m.by));
  }
  function onPeerDied(m) {
    const pr = NET.peers.get(m.id);
    if (!pr || !pr.alive) return;
    pr.alive = false;
    if (pr.rig) pr.rig.g.visible = false;
    spawnSparks(pr.pos.clone().setY(pr.pos.y + 1.2), 8, pr.hue);
    const mine = m.bid === NET.id;
    feed(`<b class="${mine ? "f-you" : "f-them"}">${mine ? "YOU" : feedName(m.by)}</b> eliminated <b class="f-them">${pr.name}</b>`);
    if (mine && P.alive) {
      P.kills++; P.sh = Math.min(PLAYER_SH, P.sh + SIPHON);
      sfxKill();
      banner(`ELIMINATED ${pr.name} — ${aliveCount() - 1} REMAIN`, "is-lime");
    }
    if (M.spectating === pr) nextSpectate();
    endCheck();
  }

  /* ---------- inbound dispatch ---------- */
  /* wire numbers are peer-controlled: clamp so a buggy (or hostile)
     client can never NaN-poison hp/sh — the trust model between
     friends stays, sim integrity doesn't ride on it */
  const saneDmg = (v) => Math.min(220, Math.max(0, Number.isFinite(+v) ? +v : 0));
  function netMsg(m) {
    if (!m || !m.t) return;
    switch (m.t) {
      case "s": onSnap(m); break;
      case "go": onGo(m); break;
      case "st": if (!iAmHost()) onStorm(m); break;
      case "bs": if (!iAmHost()) onBotSnap(m); break;
      case "hit": {
        const d = saneDmg(m.dmg);
        if (d && m.tgt === NET.id && NET.started) hurtPlayer(d, feedName(m.by), m.bid || null);
        break;
      }
      case "hitb": {
        const d = saneDmg(m.dmg);
        if (d && iAmHost()) { const b = bots[m.i]; if (b?.alive) hurtBot(b, d, m.crit, null, false, feedName(m.by), m.fid); }
        break;
      }
      case "bkill": onBotKillMsg(m); break;
      case "died": onPeerDied(m); break;
      case "shot": {
        if (!(Array.isArray(m.o) && Array.isArray(m.h) && m.o.every(Number.isFinite) && m.h.every(Number.isFinite))) break;
        _no.set(m.o[0], m.o[1], m.o[2]); _nh.set(m.h[0], m.h[1], m.h[2]);
        spawnTracer(_no, _nh, m.b ? 0xffb0c8 : m.d ? 0xbfe8ff : 0xdfffb0);
        spawnSparks(_nh, 1, 0x9fb8d8);
        if (P.alive) {
          const dx = m.o[0] - P.pos.x, dz = m.o[2] - P.pos.z, pd = Math.hypot(dx, dz);
          const fwdX = -Math.sin(P.yaw), fwdZ = -Math.cos(P.yaw);
          sfxDistantShot(pd, (dx * -fwdZ + dz * fwdX) / (pd || 1));
        }
        break;
      }
      case "bar": if ([m.x, m.z, m.yaw, m.y0].every(Number.isFinite) && !dynColliders.some((c) => c.nid === m.nid)) placeBarrier("net", m.x, m.z, m.yaw, m.y0, m.nid); break;
      case "barh": { const c = dynColliders.find((c2) => c2.nid === m.nid); if (c) damageBarrier(c, saneDmg(m.dmg)); break; }
      case "pk": { const p = pickups[m.i]; if (p?.live) { p.live = false; p.m.visible = false; } break; }
    }
  }

  /* ---------- squad panel events + auto flows ---------- */
  hostBtn?.addEventListener("click", () => { audioBoot(); netJoin(roomCode()); });
  joinBtn?.addEventListener("click", () => { audioBoot(); netJoin(codeIn.value); });
  codeIn?.addEventListener("keydown", (e) => { if (e.key === "Enter") netJoin(codeIn.value); });
  copyBtn?.addEventListener("click", () => {
    const url = location.origin + location.pathname + "?room=" + NET.room;
    const flash = (txt) => { copyBtn.textContent = txt; setTimeout(() => (copyBtn.textContent = "COPY INVITE LINK"), 1600); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => flash("COPIED"), () => flash(url));
    else flash(url);
    sfxUi();
  });
  leaveBtn?.addEventListener("click", () => { netLeave(); sfxUi(); });
  addEventListener("pagehide", () => { if (NET.t) NET.t.leave(); });   /* immediate goodbye — peers don't wait out the presence timeout */
  {
    /* invite link ?room=CODE auto-joins; ?mp=host|join are QA autoflows */
    const mp = QS.get("mp"), rq = (QS.get("room") || "").toUpperCase();
    if (mp === "host") netJoin(rq || roomCode());
    else if (mp === "join" || rq) netJoin(rq);
  }

  /* replication clocks — timers, not rAF, so a backgrounded tab
     keeps announcing itself (throttled to 1Hz, still alive) */
  setInterval(txSnap, 100);
  setInterval(() => { if (NET.on && NET.started && iAmHost() && M.on && !M.over) txBots(); }, 125);
  setInterval(() => { if (NET.on && NET.started && iAmHost() && M.on && !M.over) txStorm(); }, 500);

  /* ============================================================
     input — pointer lock + WASD; menu drives lock acquisition.
     ?sim=1 is the QA hook (smoke/CDP): headless Chrome cannot
     grant pointer lock, so sim mode enters the match without it.
     ============================================================ */
  const SIM = new URLSearchParams(location.search).has("sim");
  const keys = {};
  let locked = false, mouseDown = false;
  addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    if ((!locked && !SIM) || !M.on) return;
    if (e.code === "KeyR") tryReload();
    if (e.code === "Digit1") switchW(0);
    if (e.code === "Digit2") switchW(1);
    if (e.code === "KeyQ") tryBarrier();
    if (e.code === "KeyM") setSnd(!sndOn), syncSnd();
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  addEventListener("mousedown", (e) => { if (locked && e.button === 0) mouseDown = true; if (locked && e.button === 2) P.adsOn = true; });
  addEventListener("mouseup", (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) P.adsOn = false; });
  addEventListener("contextmenu", (e) => { if (locked) e.preventDefault(); });

  const SENS = 0.00185;
  addEventListener("mousemove", (e) => {
    if (!locked) return;   /* SIM aims via __gameDrive.look, not events */
    const zoomK = 1 - P.ads * 0.6;   /* ads lowers sens like Valorant */
    P.yaw -= e.movementX * SENS * zoomK;
    P.pitch -= e.movementY * SENS * zoomK;
    P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch));
  });

  function enterMatch() {
    menuEl.classList.remove("is-on");
    hudEl.classList.add("is-live");
    if (!M.on && !M.over) resetMatch();
    audioBoot(); bedsBoot();
    if (AC?.state === "suspended") AC.resume().catch(() => {});
  }
  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === canvas;
    if (locked) {
      enterMatch();
    } else if (M.on && P.alive && !M.over) {
      /* Esc = pause to menu (match keeps simulating quietly) */
      menuEl.classList.add("is-on");
      $("gMenuTitle").textContent = "PAUSED — SIGNAL LIVE";
      playBtn.textContent = "RESUME DROP";
    }
  });

  function requestPlay() {
    audioBoot();
    if (NET.on && !iAmHost() && (!M.on || M.over)) { syncSquadUi(); return; }  /* guests wait for host */
    if (NET.on && iAmHost() && (!M.on || M.over)) launchSquad();
    else if (M.over) { M.over = false; endEl.classList.remove("is-on"); resetMatch(); }
    if (SIM) { locked = true; enterMatch(); return; }
    try {
      const r = canvas.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch (e) { /* lock denied — menu stays, user clicks again */ }
  }
  playBtn?.addEventListener("click", requestPlay);
  againBtn?.addEventListener("click", requestPlay);
  canvas.addEventListener("click", () => { if (!locked && !menuEl.classList.contains("is-on") && !endEl.classList.contains("is-on")) requestPlay(); });

  const syncSnd = () => {
    if (!sndBtn) return;
    sndBtn.setAttribute("aria-pressed", String(sndOn));
    sndBtn.classList.toggle("is-on", sndOn);
  };
  sndBtn?.addEventListener("click", () => { audioBoot(); setSnd(!sndOn); syncSnd(); sfxUi(); });
  syncSnd();

  /* ============================================================
     firing — hitscan with pattern recoil + spread
     ============================================================ */
  const _dir = new THREE.Vector3(), _o = new THREE.Vector3(), _hit = new THREE.Vector3();
  const _right = new THREE.Vector3(), _up2 = new THREE.Vector3();

  function switchW(idx) {
    if (idx === P.wIdx || P.reloading > 0) return;
    P.wIdx = idx;
    guns[0].visible = idx === 0; guns[1].visible = idx === 1;
    wNameEl.textContent = WEAPONS[idx].name;
    P.burst = 0; sfxSwitch();
    vm.position.y = -0.08; /* draw dip, lerped back in the loop */
  }
  function tryReload() {
    const w = WEAPONS[P.wIdx];
    if (P.reloading > 0 || P.ammo[P.wIdx] >= w.mag || P.reserve[P.wIdx] <= 0) return;
    P.reloading = w.reload; sfxReload();
  }
  function tryBarrier() {
    if (P.barrierCd > 0) return;
    /* place 3u ahead, snapped to face the player */
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const px = P.pos.x + fx * 3.2, pz = P.pos.z + fz * 3.2;
    if (Math.hypot(px, pz) > ARENA_R - 1) return;
    const y0 = Math.max(0, P.pos.y - EYE);
    const nid = NET.on && NET.started ? NET.id + ":" + (++NET.seq) : null;
    placeBarrier("you", px, pz, P.yaw, y0, nid);
    if (nid) netSend({ t: "bar", nid, x: r1(px), z: r1(pz), yaw: r2(P.yaw), y0: r1(y0) });
    P.barrierCd = BARRIER_CD;
  }

  function playerEye() { return P.pos.y + (P.crouch ? EYE_CROUCH : EYE) - 0.2; }

  function fire() {
    const w = WEAPONS[P.wIdx];
    if (P.reloading > 0 || P.shotT > 0) return;
    if (P.ammo[P.wIdx] <= 0) { sfxEmpty(); P.shotT = 0.22; return; }
    P.ammo[P.wIdx]--;
    P.shotT = 60 / w.rpm;

    /* pattern index: resets when burst fully decayed (Valorant reset) */
    const pi = Math.min(P.burst, w.pat.length - 1);
    const pk = P.burst < w.pat.length ? w.pat[pi] : w.pat[w.pat.length - w.patTail + ((P.burst - w.pat.length) % w.patTail)];
    P.burst++;
    P.recoilT = 0.4;

    /* view punch springs */
    recoil.vp += pk[1] * 0.017 * w.kick;
    recoil.vy += pk[0] * 0.013 * w.kick;

    /* spread: base + movement + air, ADS trims on dmr */
    const speed2 = P.vel.x * P.vel.x + P.vel.z * P.vel.z;
    let spread = w.spreadBase + Math.min(1, speed2 / 30) * w.spreadMove + (P.grounded ? 0 : w.spreadAir);
    if (w.ads && P.ads > 0.5) spread = w.spreadAds + Math.min(1, speed2 / 30) * w.spreadMove * 0.5;

    /* build the shot ray from camera basis + random spread; the recoil
       pattern lives in the view punch, so shots stay true to crosshair */
    camera.getWorldDirection(_dir);
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up2.setFromMatrixColumn(camera.matrixWorld, 1);
    const jx = (Math.random() - 0.5) * 2 * spread;
    const jy = (Math.random() - 0.5) * 2 * spread;
    _dir.addScaledVector(_right, jx).addScaledVector(_up2, jy).normalize();
    _o.set(P.pos.x, playerEye(), P.pos.z);

    /* world first */
    const MAXT = 320;
    const wh = rayWorld(_o, _dir, MAXT);
    /* then bots — nearest capsule hit that's in front of the wall */
    let hitBot = null, hitT = wh.t, crit = false;
    for (const b of aliveBots()) {
      const t = rayCapsule(_o, _dir, b.pos.x, b.pos.y + 0.35, b.pos.y + 1.55, b.pos.z, 0.5, Math.min(MAXT, hitT));
      if (t < hitT) {
        /* head test: tighter capsule near the top */
        const th = rayCapsule(_o, _dir, b.pos.x, b.pos.y + 1.55, b.pos.y + 1.9, b.pos.z, 0.3, Math.min(MAXT, hitT));
        hitBot = b; hitT = t; crit = th < t + 0.6;
      }
    }
    /* then squad humans — favor the shooter: my ray, my hit */
    let hitPeer = null;
    if (NET.on && NET.started) {
      for (const pr of alivePeers()) {
        const t = rayCapsule(_o, _dir, pr.pos.x, pr.pos.y + 0.35, pr.pos.y + 1.55, pr.pos.z, 0.5, Math.min(MAXT, hitT));
        if (t < hitT) {
          const th = rayCapsule(_o, _dir, pr.pos.x, pr.pos.y + 1.55, pr.pos.y + 1.9, pr.pos.z, 0.3, Math.min(MAXT, hitT));
          hitPeer = pr; hitBot = null; hitT = t; crit = th < t + 0.6;
        }
      }
    }

    _hit.copy(_o).addScaledVector(_dir, Math.min(hitT, MAXT));
    /* tracer from muzzle-ish */
    const muzzle = _o.clone().addScaledVector(_right, 0.16).addScaledVector(_up2, -0.12).addScaledVector(_dir, 0.6);
    spawnTracer(muzzle, _hit, P.wIdx ? 0xbfe8ff : 0xdfffb0);

    if (hitPeer) {
      const dmg = crit ? w.dmg * w.hsMult : w.dmg;
      P.dmgDone += dmg;
      dmgNum(hitPeer.pos.clone().setY(hitPeer.pos.y + 1.5), dmg, crit);
      crit ? sfxDink() : sfxHit();
      hitEl.className = "g-hitmark is-on" + (crit ? " is-crit" : "");
      clearTimeout(hitEl._t); hitEl._t = setTimeout(() => (hitEl.className = "g-hitmark"), 120);
      netSend({ t: "hit", tgt: hitPeer.id, dmg: Math.round(dmg), crit, by: NET.callsign, bid: NET.id });
      spawnSparks(_hit, 3, crit ? 0xffe08a : hitPeer.hue);
    } else if (hitBot) {
      const dmg = crit ? w.dmg * w.hsMult : w.dmg;
      if (NET.on && NET.started && !iAmHost()) {
        /* shooter-side feedback now; the host arbitrates the hp */
        P.dmgDone += dmg;
        hitBot.hitFlash = 1;
        dmgNum(hitBot.pos.clone().setY(hitBot.pos.y + 1.5), dmg, crit);
        crit ? sfxDink() : sfxHit();
        hitEl.className = "g-hitmark is-on" + (crit ? " is-crit" : "");
        clearTimeout(hitEl._t); hitEl._t = setTimeout(() => (hitEl.className = "g-hitmark"), 120);
        netSend({ t: "hitb", i: hitBot.id, dmg: Math.round(dmg), crit, by: NET.callsign, fid: NET.id });
      } else {
        hurtBot(hitBot, dmg, crit, _o, true, "YOU", "me");
      }
      spawnSparks(_hit, 3, crit ? 0xffe08a : hitBot.hue);
    } else if (hitT < MAXT) {
      if (wh.dyn) {
        damageBarrier(wh.dyn, w.dmg);
        if (NET.on && NET.started && wh.dyn.nid) netSend({ t: "barh", nid: wh.dyn.nid, dmg: w.dmg });
      }
      spawnSparks(_hit, 2, 0x9fb8d8);
    }

    /* replicate the muzzle report, throttled — squadmates hear/see it */
    if (NET.on && NET.started) {
      const nowS = performance.now() / 1000;
      if (nowS - NET.lastShotTx > 0.16) {
        NET.lastShotTx = nowS;
        netSend({ t: "shot", o: [r1(muzzle.x), r1(muzzle.y), r1(muzzle.z)], h: [r1(_hit.x), r1(_hit.y), r1(_hit.z)], d: P.wIdx === 1 ? 1 : 0 });
      }
    }

    sfxShot(P.wIdx === 1);
    muzzleLight.intensity = 2.6;
    muzzleLight.position.copy(muzzle);
    const flash = vm.userData.flash;
    flash.material.opacity = 0.9;
    flash.rotation.z = Math.random() * Math.PI;
    vm.position.z = 0.035 * w.kick;   /* view model kickback */
  }

  /* ============================================================
     bot AI
     ============================================================ */
  const _bo = new THREE.Vector3(), _bd = new THREE.Vector3(), _bt = new THREE.Vector3();

  /* line of sight between two eye points, blocked by world boxes */
  function los(ax, ay, az, bx, by, bz) {
    _bo.set(ax, ay, az); _bd.set(bx - ax, by - ay, bz - az);
    const dist = _bd.length();
    if (dist < 1e-4) return true;
    _bd.divideScalar(dist);
    return rayWorld(_bo, _bd, dist - 0.4).t === Infinity;
  }

  function botPickTarget(b) {
    /* proximity acquisition: humans are spotted at 70u, other bots
       only at 45u — the shrinking ring escalates encounters naturally.
       At most 2 bots pressure any one human at a time. */
    let best = null, bestH = null, bestD = 70 * 70;
    for (const h of _hum) {
      const engagers = bots.filter((o) => o.alive && o !== b && o.state === "engage" && o.tHuman === h.hid).length;
      if (engagers >= 2) continue;
      const d2 = b.pos.distanceToSquared(h.pos);
      if (d2 < bestD && los(b.pos.x, b.pos.y + 1.6, b.pos.z, h.pos.x, h.eye, h.pos.z)) { bestH = h.hid; bestD = d2; }
    }
    /* other bots are only spotted close — and a NEARER bot beats a human */
    bestD = Math.min(bestD, 45 * 45);
    for (const o of aliveBots()) {
      if (o === b) continue;
      const d2 = b.pos.distanceToSquared(o.pos);
      if (d2 < bestD && los(b.pos.x, b.pos.y + 1.6, b.pos.z, o.pos.x, o.pos.y + 1.6, o.pos.z)) { best = o; bestH = null; bestD = d2; }
    }
    b.target = best; b.tHuman = bestH;
    return best || bestH;
  }

  function botFire(b, dt) {
    b.fireT -= dt;
    if (b.fireT > 0) return;
    const h = b.tHuman ? _hum.find((x) => x.hid === b.tHuman) : null;
    if (b.tHuman && !h) { b.state = "wander"; b.tState = 0; b.tHuman = null; return; }
    const tp = h ? h.pos : b.target.pos;
    const ty = h ? h.eye : b.target.pos.y + 1.2;
    const dist = Math.hypot(tp.x - b.pos.x, tp.z - b.pos.z);
    /* burst cadence: 3–5 shots then a breath */
    if (b.burstLeft <= 0) { b.burstLeft = 3 + Math.floor(Math.random() * 3); b.fireT = 0.55 + Math.random() * 0.5; return; }
    b.burstLeft--;
    b.fireT = 0.11 + Math.random() * 0.05;

    /* muzzle + intended dir */
    _bo.set(b.pos.x, b.pos.y + 1.45, b.pos.z);
    _bd.set(tp.x - _bo.x, ty - 0.15 - _bo.y, tp.z - _bo.z).normalize();

    /* hit probability: skill, falls with distance + target speed.
       Bot-vs-bot fights run at half lethality — they're the match's
       background pulse, not a 60-second bloodbath */
    const tv = h ? h.vel : b.target.vel;
    const tSpeed = Math.hypot(tv.x, tv.z);
    let acc = b.aim * (1 - Math.min(0.55, dist / 160)) * (1 - Math.min(0.45, tSpeed / 18));
    if (h && h.crouch) acc *= 0.85;
    if (!h) acc *= 0.32;
    const hits = Math.random() < acc;

    /* the shot must also clear world geometry */
    const maxT = dist + 4;
    const wh = rayWorld(_bo, _bd, maxT);
    const blocked = wh.t < dist - 0.6;

    /* tracer to actual terminus */
    _bt.copy(_bo).addScaledVector(_bd, blocked ? wh.t : dist);
    if (!hits && !blocked) _bt.x += (Math.random() - 0.5) * 3, _bt.y += Math.random() * 1.5, _bt.z += (Math.random() - 0.5) * 3;
    spawnTracer(_bo, _bt, 0xffb0c8);
    /* squadmates see a sampling of bot fire too */
    if (NET.on && NET.started) {
      const nowS = performance.now() / 1000;
      if (nowS - NET.lastBotTx > 0.3) {
        NET.lastBotTx = nowS;
        netSend({ t: "shot", o: [r1(_bo.x), r1(_bo.y), r1(_bo.z)], h: [r1(_bt.x), r1(_bt.y), r1(_bt.z)], b: 1 });
      }
    }

    /* player hears distant fire, panned by azimuth */
    if (P.alive) {
      const dx = b.pos.x - P.pos.x, dz = b.pos.z - P.pos.z;
      const pd = Math.hypot(dx, dz);
      const fwdX = -Math.sin(P.yaw), fwdZ = -Math.cos(P.yaw);
      const pan = (dx * -fwdZ + dz * fwdX) / (pd || 1);
      sfxDistantShot(pd, pan);
    }

    if (blocked) {
      if (wh.dyn) {
        damageBarrier(wh.dyn, 24);
        if (NET.on && NET.started && wh.dyn.nid) netSend({ t: "barh", nid: wh.dyn.nid, dmg: 24 });
      }
      spawnSparks(_bt, 2, 0x9fb8d8);
      return;
    }
    if (!hits) return;
    if (h) {
      if (h.hid === "me") hurtPlayer(7 + Math.random() * 6, b.name);
      else netSend({ t: "hit", tgt: h.hid, dmg: Math.round(7 + Math.random() * 6), by: b.name, bid: null });
    } else {
      const tgt = b.target;
      hurtBot(tgt, 5 + Math.random() * 4, false, b.pos, false, b.name);
      if (!tgt.alive) {
        b.kills++;
        /* breathe after a kill: back to roaming for a beat */
        b.state = "wander"; b.tState = 2.4 + Math.random() * 2; b.target = null; b.burstLeft = 0;
      }
    }
  }

  function botStep(b, dt) {
    if (!b.alive) return;
    /* drop-in */
    if (b.state === "drop") {
      b.pos.y -= dt * (b.pos.y > 20 ? 22 : 12);
      if (b.pos.y <= 0) { b.pos.y = 0; b.state = "wander"; b.tState = 0; }
      b.g.position.copy(b.pos);
      return;
    }

    b.tState -= dt;
    const stormC = stormU.uC.value, stormR = stormU.uR.value;
    const distC = Math.hypot(b.pos.x - stormC.x, b.pos.z - stormC.y);

    /* storm damage + hard flee override */
    if (distC > stormR) {
      b.hp -= STORM_PHASES[Math.min(M.phase, STORM_PHASES.length - 1)].dps * dt;
      if (b.hp <= 0) { killBot(b, false, "THE STORM"); return; }
      b.state = "flee";
    }

    if (b.state === "flee") {
      /* run toward storm center-ish with a slight tangent */
      _bt.set(stormC.x - b.pos.x, 0, stormC.y - b.pos.z).normalize();
      b.yaw += (Math.atan2(-_bt.x, -_bt.z) - b.yaw) * 0.1;
      b.vel.x = _bt.x * 7.5; b.vel.z = _bt.z * 7.5;
      if (distC < stormR * 0.8) { b.state = "wander"; b.tState = 0; }
    } else if (b.state === "engage" && (b.tHuman ? _hum.some((x) => x.hid === b.tHuman) : b.target?.alive)) {
      const h = b.tHuman ? _hum.find((x) => x.hid === b.tHuman) : null;
      const tp = h ? h.pos : b.target.pos;
      const d = Math.hypot(tp.x - b.pos.x, tp.z - b.pos.z);
      /* face target */
      const wantYaw = Math.atan2(-(tp.x - b.pos.x), -(tp.z - b.pos.z));
      let dy = wantYaw - b.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      b.yaw += dy * Math.min(1, dt * 6);
      /* strafe + keep 12–35u */
      b.strafeT -= dt;
      if (b.strafeT < 0) { b.strafeDir *= -1; b.strafeT = 0.6 + Math.random() * 1.1; }
      const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
      const sx = -fz * b.strafeDir, sz = fx * b.strafeDir;
      const push = d > 35 ? 1 : d < 12 ? -0.8 : 0;
      b.vel.x = (fx * push + sx * 0.8) * 5.2;
      b.vel.z = (fz * push + sz * 0.8) * 5.2;
      /* LOS check every ~0.4s via acquire timer */
      b.acquireT -= dt;
      if (b.acquireT <= 0) {
        b.acquireT = 0.4;
        const ty = h ? h.eye : b.target.pos.y + 1.6;
        if (!los(b.pos.x, b.pos.y + 1.6, b.pos.z, tp.x, ty, tp.z) || d > 100) {
          b.state = "wander"; b.tState = 0; b.target = null; b.tHuman = null;
        }
      }
      if (b.state === "engage") botFire(b, dt);
    } else {
      /* wander: drift between POIs, scan for targets */
      if (b.tState <= 0) {
        b.tState = 2.5 + Math.random() * 3;
        /* bias wander inward as storm shrinks, but prefer breathing
           room: of two candidates take the one farther from the
           nearest other bot (keeps the mid-game from imploding) */
        let bx = 0, bz = 0, bestSpace = -1;
        for (let c = 0; c < 2; c++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * Math.max(12, stormR * 0.75);
          const cx = stormC.x + Math.cos(a) * r, cz = stormC.y + Math.sin(a) * r;
          let near = Infinity;
          for (const o of aliveBots()) { if (o !== b) near = Math.min(near, (o.pos.x - cx) ** 2 + (o.pos.z - cz) ** 2); }
          if (near > bestSpace) { bestSpace = near; bx = cx; bz = cz; }
        }
        b.wanderTo.set(bx, 0, bz);
        /* scan */
        const t = botPickTarget(b);
        if (t) { b.state = "engage"; b.acquireT = b.react; b.burstLeft = 0; b.fireT = b.react; }
      }
      _bt.set(b.wanderTo.x - b.pos.x, 0, b.wanderTo.z - b.pos.z);
      if (_bt.lengthSq() > 2) {
        _bt.normalize();
        const wantYaw = Math.atan2(-_bt.x, -_bt.z);
        let dy = wantYaw - b.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        b.yaw += dy * Math.min(1, dt * 3);
        b.vel.x = _bt.x * 4.2; b.vel.z = _bt.z * 4.2;
      } else { b.vel.x *= 0.8; b.vel.z *= 0.8; }
    }

    /* integrate + collide (bots stay on ground plane, sphere pushout) */
    b.pos.x += b.vel.x * dt; b.pos.z += b.vel.z * dt;
    const bp = _bo.set(b.pos.x, 0.9, b.pos.z);
    pushOutSphere(bp, 0.45);
    b.pos.x = bp.x; b.pos.z = bp.z;
    const rB = Math.hypot(b.pos.x, b.pos.z);
    if (rB > ARENA_R - 2) { b.pos.x *= (ARENA_R - 2) / rB; b.pos.z *= (ARENA_R - 2) / rB; }

    /* pickups */
    for (const pk of pickups) {
      if (!pk.live) continue;
      if (pk.kind === "shield" && b.sh < BOT_SH && b.pos.distanceToSquared(pk.m.position) < 2.6) {
        pk.live = false; pk.m.visible = false;
        b.sh = Math.min(BOT_SH, b.sh + 25);
        if (NET.on && NET.started) netSend({ t: "pk", i: pk.i });
      }
    }

    b.g.position.copy(b.pos);
    b.g.rotation.y = b.yaw;
    if (b.hitFlash > 0) {
      b.hitFlash = Math.max(0, b.hitFlash - dt * 5);
      b.g.children[0].material.emissiveIntensity = 0.12 + b.hitFlash * 1.4;
    }
  }

  /* ============================================================
     storm tick
     ============================================================ */
  function stormStep(dt) {
    if (!M.on || M.over) return;
    const ph = STORM_PHASES[Math.min(M.phase, STORM_PHASES.length - 1)];
    const auth = iAmHost();          /* guests ease locally, never advance phase */
    M.phaseT += dt;
    if (!M.shrinking) {
      const left = ph.wait - M.phaseT;
      stormEl.textContent = left > 0 ? `RING CLOSES ${Math.ceil(left)}s` : "RING CLOSING";
      if (M.phaseT >= ph.wait) {
        if (auth) {
          M.shrinking = true; M.phaseT = 0;
          M.stormFrom = stormU.uR.value;
          M.stormFromC.copy(stormU.uC.value);
          banner("THE RING IS CLOSING", "is-iris");
          if (NET.on && NET.started) txStorm();
        } else { M.phaseT = ph.wait; }        /* hold for the authority's clock */
      }
    } else {
      const k = Math.min(1, M.phaseT / ph.shrink);
      const e = k * k * (3 - 2 * k);
      stormU.uR.value = M.stormFrom + (ph.r - M.stormFrom) * e;
      stormU.uC.value.lerpVectors(M.stormFromC, stormU.uTC.value, e);
      stormEl.textContent = "RING CLOSING";
      if (k >= 1) {
        if (auth) {
          M.shrinking = false; M.phaseT = 0;
          if (M.phase < STORM_PHASES.length - 1) {
            M.phase++;
            stormU.uTR.value = STORM_PHASES[M.phase].r;
            stormU.uTC.value.copy(stormTargetFor(M.phase));
          }
          if (NET.on && NET.started) txStorm();
        } else { M.phaseT = ph.shrink; }
      }
    }
    /* player storm damage */
    if (P.alive) {
      const d = Math.hypot(P.pos.x - stormU.uC.value.x, P.pos.z - stormU.uC.value.y);
      if (d > stormU.uR.value) {
        P.stormT += dt;
        if (P.stormT >= 1) {
          P.stormT -= 1;
          hurtPlayer(ph.dps, "THE STORM");
          banner("YOU ARE IN THE STORM", "is-red");
        }
        vigEl.classList.add("is-storm");
      } else { vigEl.classList.remove("is-storm"); P.stormT = 0; }
    }
    /* wall follows current circle */
    stormWall.position.set(stormU.uC.value.x, 36, stormU.uC.value.y);
    stormWall.scale.set(stormU.uR.value, 1, stormU.uR.value);
    /* proximity rumble */
    if (bedNodes && P.alive) {
      const d = Math.abs(Math.hypot(P.pos.x - stormU.uC.value.x, P.pos.z - stormU.uC.value.y) - stormU.uR.value);
      bedNodes.storm.g.gain.setTargetAtTime(Math.max(0, 1 - d / 40) * 0.14, AC.currentTime, 0.3);
    }
  }

  /* ============================================================
     player step — glider then ground movement
     ============================================================ */
  const WALK = 6.1, SPRINT = 8.6, CROUCH_S = 3.1, ACCEL = 42, AIR_ACCEL = 9, JUMP = 7.6, GRAV = 21;
  const _wish = new THREE.Vector3(), _pp = new THREE.Vector3();
  let bobT = 0;

  function playerStep(dt) {
    if (!P.alive || M.over) return;

    if (P.gliding) {
      /* Fortnite glider: slow fall, WASD steers, look = heading */
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      const rx = -fz, rz = fx;
      let mx = 0, mz = 0;
      if (keys.KeyW) { mx += fx; mz += fz; }
      if (keys.KeyS) { mx -= fx * 0.5; mz -= fz * 0.5; }
      if (keys.KeyA) { mx -= rx; mz -= rz; }
      if (keys.KeyD) { mx += rx; mz += rz; }
      P.vel.x += mx * 26 * dt; P.vel.z += mz * 26 * dt;
      const hs = Math.hypot(P.vel.x, P.vel.z);
      const maxH = 24;
      if (hs > maxH) { P.vel.x *= maxH / hs; P.vel.z *= maxH / hs; }
      P.vel.x *= 1 - 0.5 * dt; P.vel.z *= 1 - 0.5 * dt;
      /* dive if looking down */
      const dive = Math.max(0, -P.pitch);
      P.vel.y = -(4.2 + dive * 14);
      P.pos.addScaledVector(P.vel, dt);
      if (bedNodes) bedNodes.wind.g.gain.setTargetAtTime(0.12, AC.currentTime, 0.2);
      /* land when close to ground or a roof */
      _pp.copy(P.pos); _pp.y = Math.max(0.5, _pp.y);
      let landY = 0;
      for (const c of colliders) {
        if (P.pos.x > c.min.x - 0.4 && P.pos.x < c.max.x + 0.4 && P.pos.z > c.min.z - 0.4 && P.pos.z < c.max.z + 0.4 && c.max.y > landY && c.max.y < P.pos.y + 0.5)
          landY = c.max.y;
      }
      if (P.pos.y <= landY + 0.15) {
        P.pos.y = landY; P.vel.set(0, 0, 0); P.gliding = false;
        sfxLand();
        if (bedNodes) bedNodes.wind.g.gain.setTargetAtTime(0, AC.currentTime, 0.4);
        banner("BOOTS DOWN — FIND THE SIGNAL", "is-lime");
      }
      const r = Math.hypot(P.pos.x, P.pos.z);
      if (r > ARENA_R - 2) { P.pos.x *= (ARENA_R - 2) / r; P.pos.z *= (ARENA_R - 2) / r; }
      return;
    }

    /* ground: build wish dir in yaw space */
    P.crouch = !!keys.ControlLeft || !!keys.KeyC;
    const sprint = !!keys.ShiftLeft && !P.crouch && !P.adsOn;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const rx = -fz, rz = fx;
    _wish.set(0, 0, 0);
    if (keys.KeyW) { _wish.x += fx; _wish.z += fz; }
    if (keys.KeyS) { _wish.x -= fx; _wish.z -= fz; }
    if (keys.KeyA) { _wish.x -= rx; _wish.z -= rz; }
    if (keys.KeyD) { _wish.x += rx; _wish.z += rz; }
    if (_wish.lengthSq() > 0) _wish.normalize();
    const targetS = P.crouch ? CROUCH_S : sprint ? SPRINT : WALK;
    const acc = P.grounded ? ACCEL : AIR_ACCEL;
    P.vel.x += (_wish.x * targetS - P.vel.x) * Math.min(1, acc * dt / targetS) * (P.grounded ? 1 : 0.35);
    P.vel.z += (_wish.z * targetS - P.vel.z) * Math.min(1, acc * dt / targetS) * (P.grounded ? 1 : 0.35);
    if (P.grounded && keys.Space) { P.vel.y = JUMP; P.grounded = false; }
    P.vel.y -= GRAV * dt;
    P.pos.addScaledVector(P.vel, dt);

    /* collide: two spheres (feet + chest) approximate the capsule */
    let onTop = false;
    _pp.set(P.pos.x, P.pos.y + RADIUS + 0.02, P.pos.z);
    if (pushOutSphere(_pp, RADIUS)) onTop = true;
    P.pos.x = _pp.x; P.pos.z = _pp.z; P.pos.y = _pp.y - RADIUS - 0.02;
    _pp.set(P.pos.x, P.pos.y + 1.15, P.pos.z);
    pushOutSphere(_pp, RADIUS);
    P.pos.x = _pp.x; P.pos.z = _pp.z;

    P.grounded = false;
    if (P.pos.y <= 0.001) { P.pos.y = 0; P.vel.y = Math.max(0, P.vel.y); P.grounded = true; }
    else if (onTop && P.vel.y <= 0) { P.vel.y = 0; P.grounded = true; }

    const r = Math.hypot(P.pos.x, P.pos.z);
    if (r > ARENA_R - 1) { P.pos.x *= (ARENA_R - 1) / r; P.pos.z *= (ARENA_R - 1) / r; }

    /* footsteps */
    const hs = Math.hypot(P.vel.x, P.vel.z);
    if (P.grounded && hs > 2) {
      bobT += dt * hs * 1.35;
      P.lastStep += dt;
      const period = sprint ? 0.30 : 0.42;
      if (P.lastStep > period) { P.lastStep = 0; sfxStep(sprint); }
    } else { P.lastStep = 0.2; }

    /* pickups */
    for (const pk of pickups) {
      if (!pk.live) continue;
      if (P.pos.distanceToSquared(pk.m.position) < 3.2) {
        if (pk.kind === "shield" && P.sh < PLAYER_SH) {
          pk.live = false; pk.m.visible = false;
          P.sh = Math.min(PLAYER_SH, P.sh + 25); sfxPickup();
          banner("+25 SHIELD", "is-cyan");
          if (NET.on && NET.started) netSend({ t: "pk", i: pk.i });
        } else if (pk.kind === "ammo") {
          pk.live = false; pk.m.visible = false;
          P.reserve[0] = Math.min(240, P.reserve[0] + 60);
          P.reserve[1] = Math.min(60, P.reserve[1] + 12);
          sfxPickup(); banner("+AMMO", "is-amber");
          if (NET.on && NET.started) netSend({ t: "pk", i: pk.i });
        }
      }
    }

    /* weapons timing */
    if (P.shotT > 0) P.shotT -= dt;
    if (P.reloading > 0) {
      P.reloading -= dt;
      if (P.reloading <= 0) {
        const w = WEAPONS[P.wIdx];
        const need = w.mag - P.ammo[P.wIdx];
        const take = Math.min(need, P.reserve[P.wIdx]);
        P.ammo[P.wIdx] += take; P.reserve[P.wIdx] -= take;
        P.burst = 0;
      }
    }
    if (P.recoilT > 0) { P.recoilT -= dt; if (P.recoilT <= 0) P.burst = 0; }
    if (P.barrierCd > 0) P.barrierCd -= dt;
    if (mouseDown && locked) fire();
    /* auto-reload on empty mag pause */
    if (P.ammo[P.wIdx] === 0 && P.reloading <= 0 && P.reserve[P.wIdx] > 0 && P.shotT <= 0) tryReload();

    /* ads blend */
    const w = WEAPONS[P.wIdx];
    const wantAds = P.adsOn && w.ads ? 1 : 0;
    P.ads += (wantAds - P.ads) * Math.min(1, dt * 10);
  }

  /* ============================================================
     minimap
     ============================================================ */
  function drawMini() {
    if (!miniCtx) return;
    const S = miniCv.width, half = S / 2, scale = half / (ARENA_R + 10);
    miniCtx.clearRect(0, 0, S, S);
    miniCtx.save();
    miniCtx.translate(half, half);
    /* arena edge */
    miniCtx.strokeStyle = "rgba(140,170,210,0.35)"; miniCtx.lineWidth = 1.5;
    miniCtx.beginPath(); miniCtx.arc(0, 0, ARENA_R * scale, 0, Math.PI * 2); miniCtx.stroke();
    /* storm current (iris) + target (white) */
    miniCtx.strokeStyle = "rgba(122,80,255,0.9)"; miniCtx.lineWidth = 2;
    miniCtx.beginPath(); miniCtx.arc(stormU.uC.value.x * scale, stormU.uC.value.y * scale, stormU.uR.value * scale, 0, Math.PI * 2); miniCtx.stroke();
    miniCtx.strokeStyle = "rgba(255,255,255,0.75)"; miniCtx.lineWidth = 1;
    miniCtx.beginPath(); miniCtx.arc(stormU.uTC.value.x * scale, stormU.uTC.value.y * scale, stormU.uTR.value * scale, 0, Math.PI * 2); miniCtx.stroke();
    /* bots: radar rule — only pinged within 55u of the player */
    miniCtx.fillStyle = "rgba(255,79,163,0.85)";
    for (const b of aliveBots()) {
      if (b.pos.distanceToSquared(P.pos) > 55 * 55) continue;
      miniCtx.beginPath(); miniCtx.arc(b.pos.x * scale, b.pos.z * scale, 2, 0, Math.PI * 2); miniCtx.fill();
    }
    /* squad humans: always pinged — friends can find (or hunt) each other */
    if (NET.on && NET.started) {
      miniCtx.fillStyle = "rgba(233,242,255,0.95)";
      for (const pr of alivePeers()) {
        miniCtx.beginPath(); miniCtx.arc(pr.pos.x * scale, pr.pos.z * scale, 2.4, 0, Math.PI * 2); miniCtx.fill();
      }
    }
    /* player wedge */
    const px = P.pos.x * scale, pz = P.pos.z * scale;
    miniCtx.translate(px, pz); miniCtx.rotate(-P.yaw);
    miniCtx.fillStyle = "#B8FF3C";
    miniCtx.beginPath(); miniCtx.moveTo(0, -5); miniCtx.lineTo(3.4, 3.6); miniCtx.lineTo(-3.4, 3.6); miniCtx.closePath(); miniCtx.fill();
    miniCtx.restore();
  }

  /* compass strip: bearing tape from yaw */
  const COMPASS = ["N", "·", "NE", "·", "E", "·", "SE", "·", "S", "·", "SW", "·", "W", "·", "NW", "·"];
  function drawCompass() {
    /* yaw 0 = looking -Z = N */
    let deg = (-P.yaw * 180 / Math.PI) % 360; if (deg < 0) deg += 360;
    const idx = deg / 22.5;
    let out = "";
    for (let k = -3; k <= 3; k++) {
      const i = ((Math.round(idx) + k) % 16 + 16) % 16;
      out += k === 0 ? `<b>${COMPASS[i]}</b>` : `<span>${COMPASS[i]}</span>`;
    }
    compEl.innerHTML = out;
  }

  /* ============================================================
     HUD sync
     ============================================================ */
  let hudT = 0;
  function syncHud(dt) {
    hudT -= dt;
    if (hudT > 0) return;
    hudT = 0.1;
    hpBar.style.width = Math.max(0, P.hp / PLAYER_HP * 100) + "%";
    shBar.style.width = Math.max(0, P.sh / PLAYER_SH * 100) + "%";
    hpNum.textContent = Math.ceil(Math.max(0, P.hp));
    shNum.textContent = Math.ceil(Math.max(0, P.sh));
    const w = WEAPONS[P.wIdx];
    ammoEl.textContent = P.reloading > 0 ? "--" : P.ammo[P.wIdx];
    reserveEl.textContent = P.reserve[P.wIdx];
    wNameEl.textContent = w.name + (P.reloading > 0 ? " · REFEED" : "");
    aliveEl.textContent = String(aliveCount()).padStart(2, "0");
    killsEl.textContent = String(P.kills).padStart(2, "0");
    barCdEl.textContent = P.barrierCd > 0 ? Math.ceil(P.barrierCd) : "Q";
    barCdEl.classList.toggle("is-ready", P.barrierCd <= 0);
    /* crosshair spread visual */
    const speed2 = P.vel.x * P.vel.x + P.vel.z * P.vel.z;
    const sp = 4 + Math.min(1, speed2 / 30) * 10 + (P.grounded ? 0 : 12) + P.burst * 1.1;
    crossEl.style.setProperty("--gap", sp.toFixed(1) + "px");
    crossEl.classList.toggle("is-ads", P.ads > 0.5);
    drawMini(); drawCompass();
  }

  /* one simulation tick — the loop calls this per frame; the QA
     fast-forward calls it synchronously in a burst. Guests own only
     their player: bots + storm phases follow the host's wire state. */
  function simStep(dt) {
    M.t += dt;
    _hum = humansAll();
    playerStep(dt);
    if (NET.on && NET.started && !iAmHost()) guestBotStep(dt);
    else for (const b of bots) botStep(b, dt);
    stormStep(dt);
  }

  /* ============================================================
     main loop
     ============================================================ */
  const clock = new THREE.Clock();
  let frames = 0, emaMs = 16.7, qLow = false;

  /* post: bloom tuned low — the game must stay readable */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  /* attract cam for the lobby: slow orbit high above the arena */
  function attractCam(t) {
    const a = t * 0.05;
    camera.position.set(0, 0, 0);
    yawG.position.set(Math.cos(a) * 120, 46 + Math.sin(t * 0.11) * 8, Math.sin(a) * 120);
    yawG.rotation.y = a + Math.PI / 2 + 0.35;
    pitchG.rotation.x = -0.34;
  }

  let dmgProj = 0;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    stormU.uT.value = t;

    /* quality governor: one step, DPR only */
    emaMs += (dt * 1000 - emaMs) * 0.05;
    if (!qLow && emaMs > 34 && frames > 120) { qLow = true; renderer.setPixelRatio(Math.min(DPR, 1)); bloom.enabled = false; }

    const beacon = stormWall.userData.beacon;
    if (beacon) beacon.material.color.setHex(Math.sin(t * 2.4) > 0 ? COL.lime : 0x2a4a12);

    if (M.on && !M.over) {
      simStep(dt);
      syncHud(dt);
    }
    if (NET.on || NET.peers.size) stepPeers();   /* replicas interpolate even while spectating/end */

    /* camera from state (play, spectate, or attract) */
    if (M.on && P.alive) {
      yawG.position.set(P.pos.x, playerEye(), P.pos.z);
      yawG.rotation.y = P.yaw;
      /* recoil springs: stiff return, light damping */
      recoil.vp += (-recoil.p * 60 - recoil.vp * 11) * dt;
      recoil.vy += (-recoil.y * 60 - recoil.vy * 11) * dt;
      recoil.p += recoil.vp * dt; recoil.y += recoil.vy * dt;
      pitchG.rotation.x = P.pitch + recoil.p;
      yawG.rotation.y = P.yaw + recoil.y;
      /* head bob + gun sway */
      const hs = Math.hypot(P.vel.x, P.vel.z);
      const bob = P.grounded ? Math.sin(bobT * 2) * 0.014 * Math.min(1, hs / WALK) : 0;
      camera.position.y = bob;
      camera.position.x = P.grounded ? Math.cos(bobT) * 0.008 * Math.min(1, hs / WALK) : 0;
      /* ads: fov + gun to center */
      const w = WEAPONS[P.wIdx];
      const targetFov = BASE_FOV - (w.ads ? P.ads * (BASE_FOV - w.zoomFov) : 0) + (P.gliding ? 6 : 0) + Math.min(6, hs * 0.25);
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 9);
      camera.updateProjectionMatrix();
      const g = guns[P.wIdx];
      const gx = 0.22 - P.ads * 0.22, gy = -0.20 + P.ads * 0.075;
      g.position.x += (gx - g.position.x) * Math.min(1, dt * 10);
      g.position.y += (gy - g.position.y) * Math.min(1, dt * 10);
      vm.position.z += (0 - vm.position.z) * Math.min(1, dt * 8);
      vm.position.y += (0 - vm.position.y) * Math.min(1, dt * 6);
      vm.rotation.z = Math.sin(bobT) * 0.006 * Math.min(1, hs / WALK);
    } else if (M.on && M.spectating?.alive) {
      const b = M.spectating;
      const back = 5.5;
      yawG.position.set(b.pos.x + Math.sin(b.yaw) * back, b.pos.y + 3.2, b.pos.z + Math.cos(b.yaw) * back);
      yawG.rotation.y = b.yaw;
      pitchG.rotation.x = -0.24;
      camera.position.set(0, 0, 0);
      syncHud(dt);
    } else if (!M.on) {
      attractCam(t);
    }

    /* pooled fx decay */
    for (const tr of tracers) {
      if (!tr.m.visible) continue;
      tr.t += dt * 6;
      tr.m.material.opacity = Math.max(0, 0.85 - tr.t);
      if (tr.t >= 1) tr.m.visible = false;
    }
    for (const s of sparks) {
      if (!s.m.visible) continue;
      s.t += dt * 2.4;
      s.vel.y -= 14 * dt;
      s.m.position.addScaledVector(s.vel, dt);
      s.m.material.opacity = Math.max(0, 1 - s.t);
      if (s.t >= 1) s.m.visible = false;
    }
    muzzleLight.intensity *= Math.pow(0.0001, dt);
    const flash = vm.userData.flash;
    if (flash.material.opacity > 0) flash.material.opacity = Math.max(0, flash.material.opacity - dt * 9);

    /* barrier lifetimes */
    for (let i = dynColliders.length - 1; i >= 0; i--) {
      const c = dynColliders[i];
      c.life -= dt;
      if (c.life <= 0) { scene.remove(c.mesh); c.mesh.material.dispose(); dynColliders.splice(i, 1); }
    }

    /* pickup idle spin */
    for (const pk of pickups) {
      if (!pk.live) continue;
      pk.spin += dt * 1.6;
      pk.m.rotation.y = pk.spin;
      pk.m.position.y = 0.8 + Math.sin(pk.spin * 1.3) * 0.12;
    }

    /* damage numbers: project → screen */
    dmgProj -= dt;
    for (const d of dmgPool) {
      if (d.t >= 1) { if (d.el.classList.contains("is-on")) d.el.className = "g-dmgnum"; continue; }
      d.t += dt * 0.9;
      d.w.y += dt * 1.1;
      _pv.copy(d.w).project(camera);
      if (_pv.z > 1 || Math.abs(_pv.x) > 1.1) { d.t = 1; d.el.className = "g-dmgnum"; continue; }
      d.el.style.transform = `translate(${((_pv.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((-_pv.y + 1) / 2 * innerHeight).toFixed(1)}px)`;
      d.el.style.opacity = String(Math.max(0, 1 - d.t));
    }

    composer.render();
    frames++;
    if (frames === 1) {
      /* honesty marker: only after a real frame */
      document.body.classList.add("game-live");
      document.getElementById("gBootVeil")?.classList.add("is-done");
    }
  }

  /* QA hook */
  window.__gameQ = () => ({
    frames, emaMs: Math.round(emaMs * 10) / 10, locked,
    match: M.on, over: M.over, phase: M.phase,
    stormR: Math.round(stormU.uR.value * 10) / 10,
    alive: aliveCount(), botsAlive: aliveBots().length,
    p: { x: +P.pos.x.toFixed(1), y: +P.pos.y.toFixed(1), z: +P.pos.z.toFixed(1), hp: Math.round(P.hp), sh: Math.round(P.sh), kills: P.kills, gliding: P.gliding, alive: P.alive },
    colliders: colliders.length, barriers: dynColliders.length,
    placement: M.placement, spectating: M.spectating?.name || null,
    net: {
      kind: NET.t?.kind || null, on: NET.on, room: NET.room, host: iAmHost(), started: NET.started,
      peers: NET.peers.size, peersAlive: alivePeers().length,
      peer0: (() => { const pr = [...NET.peers.values()][0]; return pr ? { name: pr.name, alive: pr.alive, hp: Math.round(pr.hp), sh: Math.round(pr.sh), x: +pr.pos.x.toFixed(1), y: +pr.pos.y.toFixed(1), z: +pr.pos.z.toFixed(1), rig: !!pr.rig?.g.visible } : null; })(),
    },
  });

  /* QA drive — only in ?sim=1 mode; writes the same input state the
     real handlers write, so it exercises the true pipeline */
  if (SIM) {
    window.__gameDrive = {
      look: (yaw, pitch) => { P.yaw = yaw; P.pitch = Math.max(-1.45, Math.min(1.45, pitch)); },
      key: (code, down) => { keys[code] = !!down; },
      fire: (on) => { mouseDown = !!on; },
      barrier: () => tryBarrier(),
      reload: () => tryReload(),
      weapon: (i) => switchW(i),
      warp: (x, z) => { P.pos.x = x; P.pos.z = z; P.vel.set(0, 0, 0); },
      aimNearest: () => {
        let best = null, bd = Infinity;
        for (const b of aliveBots()) { const d = b.pos.distanceToSquared(P.pos); if (d < bd) { bd = d; best = b; } }
        for (const pr of alivePeers()) { const d = pr.pos.distanceToSquared(P.pos); if (d < bd) { bd = d; best = pr; } }
        if (!best) return null;
        const dx = best.pos.x - P.pos.x, dz = best.pos.z - P.pos.z;
        const dh = Math.hypot(dx, dz);
        P.yaw = Math.atan2(-dx, -dz);
        P.pitch = Math.atan2(best.pos.y + 1.2 - playerEye(), dh);
        return { name: best.name, dist: Math.round(dh), hp: Math.round(best.hp + best.sh) };
      },
      ff: (seconds) => {
        /* synchronous fast-forward: true simulation, muted + capped */
        const was = sndOn; sndOn = false;
        const steps = Math.min(24000, Math.round(seconds * 30));
        for (let i = 0; i < steps && M.on && !M.over; i++) simStep(1 / 30);
        sndOn = was;
        return window.__gameQ();
      },
      winTest: () => {
        /* storm-kill every bot — verifies the victory path end-to-end */
        const was = sndOn; sndOn = false;
        for (const b of aliveBots()) killBot(b, false, "THE STORM");
        sndOn = was;
        return window.__gameQ();
      },
    };
  }

  loop();
}

/* boot decision — after all module consts exist */
if (REDUCED || COARSE_ONLY || SMALL || !window.WebGL2RenderingContext) {
  toFallback();
} else {
  boot();
}

