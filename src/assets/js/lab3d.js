/* ============================================================
   stackwith.me — lab3d.js · "DEEP SIGNAL" (/lab.html)
   The igloo.inc-style experience: a near-empty DOM and ONE
   continuous WebGL world — a vertical crystal shaft the camera
   descends through five chapters (SURFACE → DESCENT → THE VEIN
   → THE CORE → RESURFACE). Unlike the other pages, the world is
   built from AUTHORED, BAKED assets, not procedural geometry:
     · src/assets/3d/lab-crystals.glb — 6 shard variants + a
       bevelled hero gem, authored headless in Blender
       (assets-src/lab/gen_crystals.py), Draco-compressed via
       gltf-transform (29 KB → 7 KB)
     · src/assets/3d/lab-matcap.ktx2 — Cycles-baked EXTERIOR studio
       matcap; lab-matcap-int.ktx2 — INTERIOR refraction matcap,
       sampled along refract(v,n) so facets carry real internal
       light. These two textures ARE the crystal lighting model.
   v2 "Crystalline" (2026-07-15): quartz-habit authored geometry
   (irregular hex prisms, asymmetric pyramidal tips, twinned
   clusters), dual-matcap refraction + facet sparkle, volumetric
   godlight/core-aura cones, depth-band instance culling (~⅓ the
   per-frame shard load), crisper grade (less grain, higher bloom
   threshold).
   ~1.6k shards are instanced along the shaft wall and GROW in
   (per-instance birth threshold vs. scroll depth — the igloo
   signature). In-world SDF type (troika) names each chapter.
   Loader % is REAL asset progress. Master grade pass, synth
   sound behind a toggle, adaptive DPR governor — same proven
   systems as about3d. v5: phones render too (PHONE tier — a
   lighter cut of the MID world). Fallbacks: reduced-motion /
   GL or asset failure → body.lab-no3d + the DOM fallback
   article; no-JS unhides it via <noscript>.
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Text, preloadFont } from "troika-three-text";
import Lenis from "@studio-freight/lenis";
import gsap from "gsap";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hoverFine = matchMedia("(hover: hover) and (pointer: fine)").matches;

const CHAPTERS = ["SURFACE", "DESCENT", "THE VEIN", "THE CORE", "RESURFACE"];
const F = CHAPTERS.length - 1;

/* channel palette — mirrors --ch0/1/2 (lime / magenta / cyan) */
const CH = [new THREE.Color(0xb8ff3c), new THREE.Color(0xff4fa3), new THREE.Color(0x4fc4ff)];
const ICE = new THREE.Color(0.62, 0.74, 0.92);

document.body.classList.add("fx-dom");

/* ------------------------------------------------------------
   scroll — Lenis inertial + velocity feed. Exposed for smoke.
   ------------------------------------------------------------ */
let lenis = null;
let scrollVel = 0;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.08, wheelMultiplier: 1.05 });
  lenis.on("scroll", (e) => { scrollVel = e.velocity || 0; });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  window.__labLenis = lenis;
}

/* descent progress 0..F from raw scroll */
const progress = () => {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  return Math.min(F, Math.max(0, (scrollY / max) * F));
};

/* ------------------------------------------------------------
   boot loader — the % is REAL asset progress (LoadingManager),
   smoothed; min hold so the reveal never strobes on cache hits.
   ------------------------------------------------------------ */
const intro = document.getElementById("labIntro");
const pctEl = intro?.querySelector(".lab-intro__pct");
const barEl = intro?.querySelector(".lab-intro__bar b");
const shown = { v: 0 };
let loadTarget = 0; // 0..1 true progress
const paintPct = () => {
  if (pctEl) pctEl.textContent = String(Math.round(shown.v)).padStart(3, "0");
  if (barEl) barEl.style.transform = `scaleX(${shown.v / 100})`;
};
const tickPct = () => { // ease displayed toward target, never backwards
  shown.v += (loadTarget * 100 - shown.v) * 0.06;
  paintPct();
  if (!intro || intro.classList.contains("is-done")) return;
  requestAnimationFrame(tickPct);
};
if (intro && !reduced) requestAnimationFrame(tickPct);

const bootAt = performance.now();
/* v5 TRANSMISSION — the loader doubles as a live boot transcript.
   Every line is a REAL milestone stamped with real elapsed seconds;
   the fiction is in the phrasing, never in the facts. */
const logEl = intro?.querySelector(".lab-intro__log");
let bootLines = 0;
const bootLine = (msg) => {
  if (!logEl || intro.classList.contains("is-done")) return;
  const el = document.createElement("span");
  el.textContent = `T+${((performance.now() - bootAt) / 1000).toFixed(3)} · ${msg}`;
  logEl.appendChild(el);
  bootLines += 1;
  while (logEl.children.length > 4) logEl.removeChild(logEl.firstChild);
};
bootLine("RUNTIME ONLINE");
const releaseIntro = () => {
  if (!intro) { document.body.classList.add("lab-in"); dispatchEvent(new CustomEvent("lab:hero")); return; }
  if (intro.classList.contains("is-done")) return;
  const fire = () => {
    shown.v = 100; paintPct();
    intro.classList.add("is-done");
    document.body.classList.add("lab-in");
    dispatchEvent(new CustomEvent("lab:hero"));
    setTimeout(() => intro.remove(), 1150);
  };
  /* hold ≥1.3s so the counter reads as a moment, not a flash */
  const wait = Math.max(0, 1300 - (performance.now() - bootAt));
  reduced ? fire() : setTimeout(fire, wait);
};
if (intro) {
  const word = intro.querySelector(".lab-intro__word");
  if (word && !reduced) {
    word.innerHTML = [...word.textContent].map((c) => `<i>${c === " " ? "&nbsp;" : c}</i>`).join("");
    gsap.fromTo(word.children, { yPercent: 120 }, { yPercent: 0, duration: 0.9, ease: "power4.out", stagger: 0.04, delay: 0.15 });
  }
  intro.addEventListener("click", releaseIntro);
  setTimeout(releaseIntro, 9000); // hard fallback — never trap the page
}

/* ------------------------------------------------------------
   HUD — chapter readout, depth %, scroll cue, end card.
   DOM-level: runs with or without WebGL.
   ------------------------------------------------------------ */
const readout = document.getElementById("labReadout");
const hudPct = document.getElementById("labPct");
const cue = document.getElementById("labCue");
const endCard = document.getElementById("labEnd");
/* v5 CLIMATE ACCENT — one custom prop carries the active chapter's
   color through every piece of DOM chrome (cursor, cue, readout ping,
   sound pill, nav mark). Set on <body> inline so it beats the
   .lab-body fallback values; CSS transitions do the travelling. */
const ACC = ["#9FD8FF", "#4FC4FF", "#FF4FA3", "#B8FF3C", "#E9F2FF"];
const setAccent = (ch) => {
  const a = ACC[ch];
  const r = parseInt(a.slice(1, 3), 16), g = parseInt(a.slice(3, 5), 16), b = parseInt(a.slice(5, 7), 16);
  document.body.style.setProperty("--labAcc", a);
  document.body.style.setProperty("--labAccGlow", `rgba(${r},${g},${b},.55)`);
};
let activeCh = -1;
const markChapter = () => {
  const cp = progress();
  const ch = Math.min(F, Math.round(cp));
  if (ch !== activeCh) {
    const first = activeCh === -1;
    activeCh = ch;
    if (readout) readout.textContent = `${String(ch).padStart(2, "0")} / ${CHAPTERS[ch]}`;
    setAccent(ch);
    if (!first) dispatchEvent(new CustomEvent("lab:chapter", { detail: ch }));
  }
  if (hudPct) {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    /* depth in meters — the descent's fiction scale: 100% = −4,600 M */
    hudPct.textContent = `−${Math.min(4600, Math.round((scrollY / max) * 4600)).toLocaleString("en-US")}`;
  }
  if (cue) cue.classList.toggle("is-gone", cp > 0.06);
  if (endCard) endCard.classList.toggle("is-live", cp > F - 0.55);
};
addEventListener("scroll", markChapter, { passive: true });
markChapter();

/* ------------------------------------------------------------
   v5 TRANSMISSION LINE — one decoded field report per chapter,
   scramble-typed under the nav. Armed only from the boot success
   path (body.lab-transmission), so the page never narrates a
   world it isn't rendering.
   ------------------------------------------------------------ */
const txEl = document.getElementById("labTx");
const TX = [
  "CONTACT · SIGNAL FAINT · 4,600 M BELOW",
  "DESCENT BEGUN · THE WALLS GROW AS YOU PASS",
  "THREE CHANNELS BRAIDED · CURRENT RISING",
  "SOURCE PROXIMITY · HOLD TO CHARGE",
  "SIGNAL RECOVERED · ASCEND WHEN READY",
];
const TXCHARS = "ABCDEFGHIKLMNOPRSTUVXZ0123456789/—";
let txTimer = 0;
const txType = (line) => {
  if (!txEl) return;
  clearInterval(txTimer);
  let k = 0;
  txTimer = setInterval(() => {
    k += 2;
    if (k >= line.length) { txEl.textContent = line; clearInterval(txTimer); return; }
    txEl.textContent = line.slice(0, k) +
      [...line.slice(k, Math.min(line.length, k + 5))]
        .map((c) => (c === " " || c === "·" ? c : TXCHARS[(Math.random() * TXCHARS.length) | 0])).join("");
  }, 26);
};

/* ------------------------------------------------------------
   sound — synthesized WebAudio (same design as about3d): a
   drone bed whose filter DARKENS WITH DEPTH, air shimmer, a
   noise whoosh on chapter hand-offs. Default OFF; stored "on"
   only arms until the first gesture (autoplay policy).
   ------------------------------------------------------------ */
const soundBtn = document.getElementById("labSound");
let bedFilterRef = null, acRef = null, chimeRef = null, chimeCount = 0, thumpRef = null;
if (soundBtn) {
  let AC = null, master = null, soundOn = false;
  const ensureAudio = () => {
    if (AC) return true;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      acRef = AC;
      master = AC.createGain();
      master.gain.value = 0;
      master.connect(AC.destination);
      const bed = AC.createBiquadFilter();
      bed.type = "lowpass"; bed.frequency.value = 220; bed.Q.value = 0.7;
      bed.connect(master);
      bedFilterRef = bed;
      [[48, "sine", 0.17], [96.5, "sine", 0.10], [144.8, "triangle", 0.03]].forEach(([f, ty, g]) => {
        const o = AC.createOscillator(), og = AC.createGain();
        o.type = ty; o.frequency.value = f; og.gain.value = g;
        o.connect(og); og.connect(bed); o.start();
      });
      const lfo = AC.createOscillator(), lg = AC.createGain();
      lfo.frequency.value = 0.05; lg.gain.value = 70;
      lfo.connect(lg); lg.connect(bed.frequency); lfo.start();
      const len = AC.sampleRate * 2;
      const buf = AC.createBuffer(1, len, AC.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const noise = AC.createBufferSource();
      noise.buffer = buf; noise.loop = true;
      const bp = AC.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 1600; bp.Q.value = 1.6;
      const ng = AC.createGain(); ng.gain.value = 0.011;
      noise.connect(bp); bp.connect(ng); ng.connect(master); noise.start();
      return true;
    } catch { AC = null; return false; }
  };
  /* v4 RESONANCE chime — struck crystals ring pitched. Pentatonic
     minor over the 48Hz drone root so any strike cluster stays
     consonant with the bed; azimuth picks the degree, depth drops
     the octave (the shaft gets graver as you descend), strike x
     pans the voice. Gated by soundOn; ≤6 live voices, ≥110ms apart. */
  let lastChime = 0, chimeVoices = 0;
  chimeRef = (hx, hy, hz) => {
    if (!AC || !soundOn || chimeVoices >= 6) return;
    const now = AC.currentTime;
    if (now - lastChime < 0.11) return;
    lastChime = now;
    const PENTA = [0, 3, 5, 7, 10];
    const deg = PENTA[Math.abs(Math.floor(((Math.atan2(hz, hx) + Math.PI) / (Math.PI * 2)) * 5)) % 5];
    const oct = hy > -12 ? 3 : hy > -30 ? 2 : 1;
    const f0 = 48 * Math.pow(2, oct + deg / 12);
    const g = AC.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.055, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 0.95);
    const lp = AC.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 2600; lp.Q.value = 0.9;
    g.connect(lp);
    let tail = lp;
    if (AC.createStereoPanner) {
      const pan = AC.createStereoPanner();
      pan.pan.value = Math.max(-0.8, Math.min(0.8, hx / 9));
      lp.connect(pan); tail = pan;
    }
    tail.connect(master);
    /* fundamental + a barely-detuned 3rd partial = glassy ring */
    [[f0, 1], [f0 * 2.997, 0.22]].forEach(([f, k], vi) => {
      const o = AC.createOscillator(), og = AC.createGain();
      o.type = "sine"; o.frequency.value = f; og.gain.value = k;
      o.connect(og); og.connect(g);
      if (vi === 0) o.onended = () => { try { tail.disconnect(); } catch {} }; // free the dead subgraph
      o.start(now); o.stop(now + 1.0);
    });
    chimeVoices++; chimeCount++;
    setTimeout(() => { chimeVoices--; }, 1000);
  };
  /* v4 CHARGE release thump — sub-bass drop (46→30Hz) + a short
     filtered noise crack, both scaled by how charged the core was. */
  thumpRef = (k) => {
    if (!AC || !soundOn) return;
    const now = AC.currentTime;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, 0.16 * k), now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 0.7);
    g.connect(master);
    const o = AC.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(46, now);
    o.frequency.exponentialRampToValueAtTime(30, now + 0.6);
    o.connect(g);
    o.onended = () => { try { g.disconnect(); } catch {} };
    o.start(now); o.stop(now + 0.75);
    const nb = AC.createBuffer(1, Math.floor(AC.sampleRate * 0.1), AC.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
    const ns = AC.createBufferSource(); ns.buffer = nb;
    const nf = AC.createBiquadFilter();
    nf.type = "bandpass"; nf.frequency.value = 900; nf.Q.value = 0.8;
    const ng = AC.createGain(); ng.gain.value = 0.05 * k;
    ns.connect(nf); nf.connect(ng); ng.connect(master);
    ns.onended = () => { try { ng.disconnect(); } catch {} };
    ns.start(now);
  };
  const whoosh = () => {
    if (!AC || !soundOn) return;
    const len = AC.sampleRate * 0.45;
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = AC.createBufferSource(); src.buffer = buf;
    const lp = AC.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 2.4;
    lp.frequency.setValueAtTime(2100, AC.currentTime);
    lp.frequency.exponentialRampToValueAtTime(180, AC.currentTime + 0.42);
    const g = AC.createGain(); g.gain.value = 0.08;
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start();
  };
  const setOn = (v, persist = true) => {
    if (v) ensureAudio();
    soundOn = v;
    if (v && AC?.state === "suspended") AC.resume().catch(() => {});
    soundBtn.setAttribute("aria-pressed", String(!!v));
    soundBtn.classList.toggle("is-on", v);
    if (persist) { try { localStorage.setItem("lab-sound", v ? "1" : "0"); } catch {} }
    if (master) master.gain.linearRampToValueAtTime(v ? 0.9 : 0, (AC?.currentTime || 0) + 0.7);
  };
  soundBtn.addEventListener("click", () => setOn(!soundOn));
  let pref = null;
  try { pref = localStorage.getItem("lab-sound"); } catch {}
  if (pref === "1") {
    soundBtn.classList.add("is-armed");
    addEventListener("pointerdown", function arm() {
      removeEventListener("pointerdown", arm);
      soundBtn.classList.remove("is-armed");
      setOn(true, false);
    }, { once: true });
  }
  addEventListener("lab:chapter", whoosh);
}

/* ------------------------------------------------------------
   WebGL world
   ------------------------------------------------------------ */
const canvas = document.getElementById("labfx");
const no3d = () => { document.body.classList.add("lab-no3d"); loadTarget = 1; releaseIntro(); };
if (!canvas || reduced) {
  no3d();
} else {
  start().catch((err) => { console.warn("[labfx] 3D disabled:", err); no3d(); });
}

async function start() {
  /* v5 tiers, chosen at boot (resizing across a boundary keeps the
     boot tier — same policy MID has had since v2): PHONE < 680 is a
     lighter cut of the MID world, not a different one. */
  const PHONE = innerWidth < 680;
  const MID = PHONE || innerWidth < 1100 || matchMedia("(pointer: coarse)").matches;
  const DPR = Math.min(devicePixelRatio || 1, PHONE ? 1.1 : MID ? 1.25 : 1.5);
  let W = innerWidth, H = innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H);
  renderer.setClearColor(0x030509, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  bootLine("GL CONTEXT ACQUIRED");

  /* ---- baked assets — the authored pipeline ---- */
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_u, loaded, total) => { loadTarget = Math.max(loadTarget, loaded / Math.max(1, total)); };
  const draco = new DRACOLoader(manager).setDecoderPath("/assets/3d/draco/");
  const gltfLoader = new GLTFLoader(manager).setDRACOLoader(draco);
  const ktx2 = new KTX2Loader(manager).setTranscoderPath("/assets/3d/basis/").detectSupport(renderer);
  const [gltf, geoGltf, matcap, matcapInt] = await Promise.all([
    gltfLoader.loadAsync("/assets/3d/lab-crystals.glb"),
    gltfLoader.loadAsync("/assets/3d/lab-setpieces.glb"), // v6 ruin architecture
    ktx2.loadAsync("/assets/3d/lab-matcap.ktx2"),
    ktx2.loadAsync("/assets/3d/lab-matcap-int.ktx2"),
  ]);
  loadTarget = 1;
  bootLine("CRYSTAL ARCHIVE DECODED · 4 ASSETS");
  matcap.colorSpace = THREE.SRGBColorSpace;
  matcapInt.colorSpace = THREE.SRGBColorSpace;

  /* v3: the glb carries a high-poly Shard0..5 set (beveled quartz)
     plus Shard0_LOD1..5_LOD1 (v2-density) for far depth bands. Same
     local +Y growth axis on both, so one instance plan feeds both. */
  const hiByName = {}, loByName = {};
  let gemGeo = null;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    g.computeVertexNormals(); // Draco quantization can bruise normals; facets must stay crisp
    if (o.name.startsWith("Shard")) {
      g.center();
      if (o.name.endsWith("_LOD1")) loByName[o.name.slice(0, -5)] = g;
      else hiByName[o.name] = g;
    }
    if (o.name === "Gem") { g.center(); gemGeo = g; }
  });
  const shardNames = Object.keys(hiByName).sort();
  const shardGeos = shardNames.map((n) => hiByName[n]);
  // missing LOD1 nodes degrade to hi-poly everywhere, never a crash
  const shardGeosLo = shardNames.map((n) => loByName[n] || hiByName[n]);
  if (!shardGeos.length || !gemGeo) throw new Error("crystal glb missing nodes");

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x030509, 11, 42);
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 90);
  camera.position.set(0, 4.6, 13.5);

  /* ---- shaft backdrop — an inward-facing gradient tube. The wall
     colors are uniforms so the five-climate system can grade them:
     uTop is the master air color, uDeep its floor-shadow. ---- */
  const shaftUniforms = {
    uTime: { value: 0 }, uCamY: { value: 0 },
    uTop: { value: new THREE.Color(0.028, 0.040, 0.066) },
    uDeep: { value: new THREE.Color(0.006, 0.008, 0.020) },
  };
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(17, 15, 84, 40, 1, true),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: shaftUniforms,
      vertexShader: /* glsl */ `
        uniform float uTime, uCamY;
        varying vec3 vW;
        void main(){
          vec3 pos = position;
          /* v5 BREATHING — the tunnel walls pulse like lungs near camera.
             Radial displacement (xz only, not y) with a slow sine wave
             scaled by proximity to the camera. Breathes ±3% at peak. */
          float distFromCam = abs(pos.y - uCamY);
          float proximity = smoothstep(20.0, 5.0, distFromCam); // 1 near, 0 far
          float breath = 0.03 * sin(uTime * 0.4 + pos.y * 0.1) * proximity;
          pos.xz *= 1.0 + breath;
          vW = (modelMatrix * vec4(pos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uTop, uDeep; varying vec3 vW;
        void main(){
          float d = clamp((6.0 - vW.y) / 56.0, 0.0, 1.0); /* 0 surface → 1 core */
          vec3 c = mix(uTop, uDeep, d);
          /* faint vertical seams, slowly drifting — cave walls, not flat
             paint; seam light is the air color, so climates carry it */
          float a = atan(vW.z, vW.x);
          c += uTop * 0.45 * (0.5 + 0.5 * sin(a * 9.0 + vW.y * 0.22 + uTime * 0.06));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  shaft.position.y = -18;
  scene.add(shaft);

  /* ============================================================
     instanced crystals — matcap + ice fresnel + per-instance
     GROWTH. aBirth is the descent depth at which each shard
     erupts from the wall; uGrow sweeps past it as you scroll.
     ============================================================ */
  const shardUniforms = {
    uTime: { value: 0 },
    uGrow: { value: 0 },
    uMatcap: { value: matcap },
    uMatcapInt: { value: matcapInt }, // sampled along refract(v,n) — internal light
    uPulse: { value: 0 }, // chapter hand-off shockwave
    uDisp: { value: 1 }, // chromatic dispersion on/off — governor drops it before DPR
    uMorph: { value: 0 }, // v5 TRANSCENDENT — morph state 0=dormant 1=transcendent
    uCamPos: { value: new THREE.Vector3() }, // v5: camera position for proximity morphing
    uHaze: { value: new THREE.Color(0.008, 0.011, 0.024) }, // v5 climates — aerial fade color, derived from the chapter air
    uCharge: { value: 0 }, // v5 — while the heart charges, near crystals inhale toward the lens
    /* v4→v5 RESONANCE — 6-slot pointer-strike ring buffer: xyz = world
       hit on the shaft wall, w = birth time (−100 = empty slot). Two
       extra slots carry the v5 echo cascade without eating sweep memory. */
    uRip: {
      value: [
        new THREE.Vector4(0, 0, 0, -100), new THREE.Vector4(0, 0, 0, -100),
        new THREE.Vector4(0, 0, 0, -100), new THREE.Vector4(0, 0, 0, -100),
        new THREE.Vector4(0, 0, 0, -100), new THREE.Vector4(0, 0, 0, -100),
      ],
    },
    /* v4 CHARGE release — one expanding spherical shell: xyz = origin
       (the core heart), w = release time (−100 = never fired) */
    uWave: { value: new THREE.Vector4(0, 0, 0, -100) },
  };
  const shardMat = new THREE.ShaderMaterial({
    uniforms: shardUniforms,
    fog: false,
    vertexShader: /* glsl */ `
      attribute vec3 aTint;
      attribute float aBirth, aSeed;
      uniform float uTime, uGrow, uMorph, uCharge;
      uniform vec3 uCamPos;
      uniform vec4 uRip[6];
      uniform vec4 uWave;
      varying vec3 vTint, vN, vV;
      varying float vSeed, vY, vRip;
      void main(){
        /* growth: smoothstep past birth with a small elastic overshoot */
        float g = clamp((uGrow - aBirth) / 0.5, 0.0, 1.0);
        g = g * g * (3.0 - 2.0 * g);
        float s = g * (1.0 + 0.16 * sin(g * 3.14159));
        /* v4 RESONANCE — sum the strike kernels at the instance ORIGIN
           so a struck crystal rings as a rigid body (uniform swell),
           not as jelly. Branchless: dead slots contribute 0. */
        vec3 org = vec3(instanceMatrix[3]);
        float rip = 0.0;
        for (int i = 0; i < 6; i++) {
          float age = uTime - uRip[i].w;
          float live = step(0.0, age) * step(age, 1.6);
          rip += live * smoothstep(3.6, 0.5, distance(org, uRip[i].xyz))
               * exp(-age * 2.4) * smoothstep(0.0, 0.07, age);
        }
        vRip = min(rip, 1.25);
        /* v4 CHARGE release — a shell expands from the heart at 9u/s;
           crystals ring as the front passes them, through the SAME
           varying (same swell, same tinted fragment glow). */
        float wAge = uTime - uWave.w;
        float wd = abs(distance(org, uWave.xyz) - wAge * 9.0);
        vRip = min(vRip + step(0.0, wAge) * smoothstep(2.8, 0.0, wd) * exp(-wAge * 1.1), 1.25);

        /* v5 MORPHING — crystals transform shape based on proximity to
           camera. Near camera (< 8u) they elongate and twist; this is the
           "transcendent" state where geometry becomes fluid. */
        float distToCam = distance(org, uCamPos);
        float proximity = smoothstep(12.0, 4.0, distToCam);
        float morphAmt = uMorph * proximity * g; // only morph grown crystals

        vec3 p = position * (s * (1.0 + 0.055 * vRip));
        /* morph: a lean stretch + faint twist — enough to feel the
           crystal answer your approach, never enough to bend the
           quartz habit into something organic (the asset's identity) */
        p.y *= 1.0 + morphAmt * 0.16;
        float twist = morphAmt * 0.18 * (p.y / length(position));
        float co = cos(twist);
        float si = sin(twist);
        p.xz = mat2(co, -si, si, co) * p.xz;
        /* pulsing displacement along normal — kept faint so the facet
           read (the matcaps' whole job) survives the morph */
        p += normal * morphAmt * 0.035 * sin(uTime * 2.0 + aSeed * 31.0);

        vec4 wp = instanceMatrix * vec4(p, 1.0);
        /* v5 CHARGE inhale — while the heart is fed, crystals within
           ~25u lean toward the lens as rigid bodies (whole-instance
           offset, same trick as the ripple swell): the world holds
           its breath with you, and snaps back on release. */
        wp.xyz += (uCamPos - org) * (uCharge * 0.045 * smoothstep(25.0, 6.0, distToCam));
        /* glacial idle sway */
        wp.x += sin(uTime * 0.22 + aSeed * 17.0) * 0.05;
        wp.z += cos(uTime * 0.19 + aSeed * 23.0) * 0.05;
        vec4 mv = viewMatrix * wp;
        vN = normalize((viewMatrix * vec4(mat3(instanceMatrix) * normal, 0.0)).xyz);
        vV = -mv.xyz;
        vTint = aTint;
        vSeed = aSeed;
        vY = wp.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMatcap, uMatcapInt;
      uniform float uTime, uPulse, uDisp;
      uniform vec3 uHaze;
      varying vec3 vTint, vN, vV;
      varying float vSeed, vY, vRip;
      void main(){
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        float ndv = abs(dot(n, v));
        /* exterior surface — studio-ice matcap by view-space normal */
        vec3 mc = texture2D(uMatcap, n.xy * 0.49 + 0.5).rgb;
        /* INTERIOR light — sample the refraction matcap along the bent
           ray (ior ~1.55). Per-shard seed offsets the lookup so
           neighbours never carry identical interiors. v3: CHROMATIC
           DISPERSION — R/G/B each refract at a slightly different IOR,
           so facet edges fringe into spectra exactly where the bent
           rays diverge (the expensive-glass read); the governor sets
           uDisp 0 on the lowest tier, collapsing to the single tap. */
        vec2 seedOff = vec2(vSeed * 0.07 - 0.035);
        vec3 rfG = refract(-v, n, 0.645);
        vec2 riUvG = rfG.xy * 0.49 + 0.5 + seedOff;
        vec3 ri = texture2D(uMatcapInt, riUvG).rgb;
        if (uDisp > 0.5) {
          vec2 riUvR = refract(-v, n, 0.635).xy * 0.49 + 0.5 + seedOff;
          vec2 riUvB = refract(-v, n, 0.655).xy * 0.49 + 0.5 + seedOff;
          ri = vec3(texture2D(uMatcapInt, riUvR).r, ri.g, texture2D(uMatcapInt, riUvB).b);
        }
        float fr = pow(1.0 - ndv, 2.4);
        /* signal current — a luminous band travelling DOWN the shaft */
        float band = smoothstep(2.6, 0.0, abs(mod(-vY + uTime * 1.6, 22.0) - 11.0));
        /* facet body: interior refraction tinted, exterior reflection
           on top — sums tuned so the BODY stays deep navy and only
           rims/glints approach white (bloom threshold 0.74) */
        vec3 tintDeep = vTint * vTint;                    /* saturate — kills the washed-pastel read */
        vec3 col = ri * tintDeep * (0.55 + 0.45 * ndv);
        col += mc * mc * mix(vec3(1.0), vTint, 0.5) * (0.22 + fr * 0.75);
        col += vTint * fr * (0.34 + band * 0.9 + uPulse * 1.4);
        col += vTint * band * 0.06;
        /* v4 RESONANCE glow — struck crystals ring in their OWN
           channel tint (never white), fresnel-weighted so the light
           gathers at the rim; capped upstream at 1.25 so a pile-up
           of strikes can't break the body-navy discipline */
        col += vTint * vRip * (0.4 + fr * 0.45);
        /* facet sparkle — a facet glints hard when its normal sweeps
           the half-vector of an implied top light; gated per facet by
           seed so glints twinkle across the wall, not strobe in sync */
        float spark = pow(max(0.0, dot(n, normalize(vec3(0.3, 0.75, 0.6)))), 60.0);
        spark *= 0.55 + 0.45 * sin(uTime * (1.3 + vSeed * 2.2) + vSeed * 40.0);
        col += vec3(0.85, 0.95, 1.0) * spark * (0.7 + uPulse);
        /* bevel glint — a second, much tighter lobe aimed where the
           1024 matcap's halo ring lives; only the thin bevel strips
           (normals between adjacent facets) sweep through it, so they
           flash as the camera moves — the machined-edge read */
        float bevG = pow(max(0.0, dot(n, normalize(vec3(-0.55, 0.35, 0.75)))), 160.0);
        col += vec3(0.9, 0.97, 1.0) * bevG * 0.4;
        /* aerial perspective — distant shards melt into the chapter's
           own air (also what makes the 36u band cull provably invisible) */
        float dist = length(vV);
        col = mix(uHaze, col, smoothstep(36.0, 22.0, dist));
        /* near-lens crossing: dissolve via stable R2 screen-door
           dither instead of blocking the frame as a dark slab */
        float nearK = smoothstep(1.1, 3.0, dist);
        if (nearK < 0.999) {
          float dith = fract(dot(floor(gl_FragCoord.xy), vec2(0.75487766, 0.56984029)));
          if (dith > nearK * nearK) discard;
        }
        col *= mix(0.3, 1.0, smoothstep(1.4, 5.5, dist)); /* close-passers dim progressively, never bloom-blow */
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  /* placement plan: wall spiral + surface garden + core bloom.
     Each entry: position matrix + birth + tint. Round-robin over
     the 6 authored shard variants so repetition never reads. */
  const dummy = new THREE.Object3D();
  const UP = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion(), qTwist = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  const plan = []; // { pos, quat, scale, birth, tint }
  const rand = () => Math.random();

  /* wall spiral — the descent itself */
  const WALL = PHONE ? 460 : MID ? 720 : 1380;
  for (let i = 0; i < WALL; i++) {
    const t = i / WALL;
    const y = -2.5 - t * 41 + (rand() - 0.5) * 1.6;
    const a = t * Math.PI * 26 + rand() * 0.9;
    const r = 8.6 + rand() * 3.6; // outside the camera rail (max |x/z| offset ~8.8) so slabs never clip the lens
    const pos = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    dir.set(-Math.cos(a), 0.25 + rand() * 0.6, -Math.sin(a)).normalize(); // tips lean inward+up
    q.setFromUnitVectors(UP, dir);
    qTwist.setFromAxisAngle(dir, rand() * Math.PI * 2);
    /* THE VEIN: three azimuth sectors carry the channel colors mid-shaft */
    let tint = ICE.clone().multiplyScalar(0.85 + rand() * 0.3);
    if (y < -13 && y > -27) {
      const sector = Math.floor((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2 / 3));
      if (rand() < 0.85) tint = CH[sector].clone().lerp(ICE, 0.1);
    }
    plan.push({ pos, quat: q.clone().multiply(qTwist), scale: 0.45 + rand() * 1.0, birth: 0.55 + t * 2.55 + rand() * 0.22, tint });
  }
  /* surface garden — a frozen ring under the hero gem */
  const GARDEN = PHONE ? 70 : MID ? 110 : 170;
  for (let i = 0; i < GARDEN; i++) {
    const a = rand() * Math.PI * 2;
    const r = 4.6 + rand() * 5.4;
    const pos = new THREE.Vector3(Math.cos(a) * r, 1.6 + rand() * 0.7, Math.sin(a) * r);
    dir.set((rand() - 0.5) * 0.5, 1, (rand() - 0.5) * 0.5).normalize();
    q.setFromUnitVectors(UP, dir);
    qTwist.setFromAxisAngle(dir, rand() * Math.PI * 2);
    plan.push({ pos, quat: q.clone().multiply(qTwist), scale: 0.35 + rand() * 0.9, birth: rand() * 0.42, tint: ICE.clone().lerp(CH[0], rand() * 0.3) });
  }
  /* core bloom — a radial burst around the heart. Kept SMALL and
     deep-tinted: these sit closest to the final camera, and at v2's
     brighter facet response full-size shards read as screen-filling
     slabs (v1 could afford it — its bodies were near-silhouettes). */
  const CORE = PHONE ? 70 : MID ? 100 : 160;
  for (let i = 0; i < CORE; i++) {
    dir.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const r = 4.0 + rand() * 2.8;
    const pos = new THREE.Vector3(0, -46.5, 0).addScaledVector(dir, r);
    q.setFromUnitVectors(UP, dir); // tips point outward from the heart
    qTwist.setFromAxisAngle(dir, rand() * Math.PI * 2);
    const tint = CH[Math.floor(rand() * 3)].clone().lerp(ICE, 0.2).multiplyScalar(0.6);
    plan.push({ pos, quat: q.clone().multiply(qTwist), scale: 0.32 + rand() * 0.6, birth: 2.95 + rand() * 0.5, tint });
  }

  /* distribute the plan across the 6 authored variants × 4 depth
     bands. Banding exists purely for CULLING, two provably pop-free
     gates per band: (a) growth — a band whose EARLIEST birth is
     still ahead of the growth front has every instance at scale 0,
     so skipping it changes nothing; (b) distance — bands whose
     nearest content is beyond the shader's aerial fade-out (37u)
     can't be seen. Early in the descent this skips most of the
     ~1.6k shards v1 vertex-processed every frame. */
  const BAND_H = 10, NBANDS = 6;
  const bandOf = (y) => Math.max(0, Math.min(NBANDS - 1, Math.floor((3 - y) / BAND_H)));
  bootLine(`${plan.length.toLocaleString("en-US")} INSTANCES SEEDED`); // real count — the fiction never lies
  const buckets = [];
  const bucketMeta = [];
  for (let gi = 0; gi < shardGeos.length; gi++) {
    for (let b = 0; b < NBANDS; b++) { buckets.push([]); bucketMeta.push({ gi, band: b }); }
  }
  plan.forEach((e, i) => buckets[(i % shardGeos.length) * NBANDS + bandOf(e.pos.y)].push(e));
  /* v3 LOD: every bucket materialises TWICE — a high-poly beveled
     mesh and a v2-density LOD1 mesh sharing the identical instance
     matrices + attrs. The loop shows exactly ONE of the pair: LOD1
     when the band is > LOD_DIST from the camera (well past fog onset
     at 11u, so the swap is invisible). MID skips the hi copies
     entirely — the coarse tier renders LOD1 everywhere. */
  const LOD_DIST = 18;
  const meshes = buckets.flatMap((list, bi) => {
    if (!list.length) return [];
    const gi = bucketMeta[bi].gi;
    const tints = new Float32Array(list.length * 3);
    const births = new Float32Array(list.length);
    const seeds = new Float32Array(list.length);
    const mats = list.map((e, i) => {
      dummy.position.copy(e.pos);
      dummy.quaternion.copy(e.quat);
      dummy.scale.setScalar(e.scale);
      dummy.updateMatrix();
      e.tint.toArray(tints, i * 3);
      births[i] = e.birth;
      seeds[i] = rand();
      return dummy.matrix.clone();
    });
    const build = (geo, lod) => {
      const im = new THREE.InstancedMesh(geo.clone(), shardMat, list.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 3));
      im.geometry.setAttribute("aBirth", new THREE.InstancedBufferAttribute(births, 1));
      im.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false; // culled by BAND in the loop instead
      im.userData.bandY = 3 - (bucketMeta[bi].band + 0.5) * BAND_H; // band center
      im.userData.minBirth = list.reduce((m, e) => Math.min(m, e.birth), Infinity);
      im.userData.lod = lod;
      scene.add(im);
      return im;
    };
    return MID ? [build(shardGeosLo[gi], 1)]
               : [build(shardGeos[gi], 0), build(shardGeosLo[gi], 1)];
  });

  /* ---- the two gems — hero (surface) + heart (core) ---- */
  const gemUniforms = () => ({
    uTime: { value: 0 },
    uMatcap: { value: matcap },
    uMatcapInt: { value: matcapInt },
    uOp: { value: 1 },
    uEnergy: { value: 0 },
  });
  const gemMatOf = (u) => new THREE.ShaderMaterial({
    uniforms: u, fog: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vN, vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMatcap, uMatcapInt;
      uniform float uTime, uOp, uEnergy;
      varying vec3 vN, vV;
      vec3 pal(float t){ return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
      void main(){
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        float ndv = abs(dot(n, v));
        vec3 mc = texture2D(uMatcap, n.xy * 0.49 + 0.5).rgb;
        /* refracted interior — the gem carries a lit heart, and energy
           swirls the lookup so the core visibly CHURNS when excited */
        vec3 rf = refract(-v, n, 0.645);
        vec2 riUv = rf.xy * 0.49 + 0.5;
        riUv += vec2(sin(uTime * 0.4), cos(uTime * 0.31)) * 0.02 * (1.0 + uEnergy * 2.0);
        vec3 ri = texture2D(uMatcapInt, riUv).rgb;
        float fr = pow(1.0 - ndv, 1.8);
        /* thin-film flicker across the facets */
        vec3 film = pal(fr * 0.8 + n.x * 0.14 + uTime * 0.03);
        vec3 col = ri * (0.75 + uEnergy * 0.8) + mc * (0.55 + fr * 0.8);
        col += film * fr * (0.4 + uEnergy * 1.2);
        col += vec3(0.72, 1.0, 0.24) * uEnergy * 0.12;
        gl_FragColor = vec4(col * uOp, 1.0);
      }`,
  });
  const heroU = gemUniforms(), heartU = gemUniforms();
  const heroGem = new THREE.Mesh(gemGeo, gemMatOf(heroU));
  heroGem.position.set(0, 4.3, 0);
  heroGem.scale.setScalar(1.15);
  scene.add(heroGem);
  const heartGem = new THREE.Mesh(gemGeo, gemMatOf(heartU));
  heartGem.position.set(0, -46.5, 0);
  heartGem.scale.setScalar(2.1);
  scene.add(heartGem);

  /* ---- volumetric light shafts — fake godlight cones. One pours
     down from the surface opening (sells "you are underground, the
     light is up THERE"), one rises off the core heart. Additive,
     depth-read-only, edge-faded by view fresnel so the cone never
     shows a hard silhouette. ---- */
  const shaftLightMat = (tint, down) => {
    const u = { uTime: { value: 0 }, uOp: { value: 0 }, uTint: { value: tint }, uDown: { value: down } };
    return {
      u,
      mat: new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, fog: false,
        vertexShader: /* glsl */ `
          varying vec3 vN, vV; varying vec2 vUv; varying float vY;
          void main(){
            vUv = uv;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = -mv.xyz;
            vY = position.y;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uOp, uDown; uniform vec3 uTint;
          varying vec3 vN, vV; varying vec2 vUv; varying float vY;
          void main(){
            float edge = abs(dot(normalize(vN), normalize(vV)));         /* rim → 0 */
            float body = smoothstep(0.0, 0.55, edge);                    /* no hard cone edge */
            /* bright at the light's mouth, dying along the throw —
               and softened again AT the mouth so the open cylinder
               rim never draws a hard ellipse */
            float fall = mix(smoothstep(0.0, 0.9, vUv.y) * smoothstep(1.0, 0.86, vUv.y),
                             smoothstep(1.0, 0.1, vUv.y) * smoothstep(0.0, 0.14, vUv.y), uDown);
            float flick = 0.82 + 0.18 * sin(vUv.x * 19.0 + uTime * 0.7)  /* slow ray shimmer */
                                * sin(vUv.x * 7.0 - uTime * 0.4);
            /* v3: drifting density along the throw — dust banks slide
               through the beam instead of a static gradient */
            float drift = 0.86 + 0.14 * sin(vUv.y * 11.0 - uTime * 0.23 + sin(vUv.x * 5.0) * 1.7)
                                 * sin(vUv.y * 4.0 + uTime * 0.11);
            gl_FragColor = vec4(uTint, body * fall * flick * drift * 0.055 * uOp);
          }`,
      }),
    };
  };
  /* surface godlight: wide cone, mouth up at the opening */
  const sun = shaftLightMat(new THREE.Color(0.62, 0.78, 1.0), 0); // mouth at the surface opening
  const sunCone = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 8.6, 26, 28, 6, true), sun.mat);
  sunCone.position.set(0, -4, 0);
  scene.add(sunCone);
  /* core aura: tight column rising off the heart */
  const aura = shaftLightMat(new THREE.Color(0.72, 1.0, 0.30), 1); // mouth at the heart
  const auraCone = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 3.4, 14, 24, 4, true), aura.mat);
  auraCone.position.set(0, -41.5, 0);
  scene.add(auraCone);

  /* ---- v3 vein caustics — three faint horizontal light sheets
     drifting through THE VEIN band (y −13..−27), one per channel
     color. Additive, ultra-low alpha (v2 lesson: 0.16 reads as
     milk), noise-broken so they read as suspended particulate
     catching the channel light, not as flat discs. ---- */
  const caustU = { uTime: { value: 0 }, uOp: { value: 0 } };
  const caustMat = (tint) => new THREE.ShaderMaterial({
    uniforms: { ...caustU, uTint: { value: tint } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOp; uniform vec3 uTint;
      varying vec2 vUv;
      float n2(vec2 p){
        return 0.5 + 0.25 * sin(p.x * 5.1 + uTime * 0.14) * sin(p.y * 4.3 - uTime * 0.10)
                   + 0.25 * sin(p.x * 11.0 - uTime * 0.07 + sin(p.y * 6.0) * 2.0);
      }
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        float disc = smoothstep(1.0, 0.25, r);          /* soft round falloff */
        float mottle = smoothstep(0.42, 0.85, n2(vUv * 3.0));
        gl_FragColor = vec4(uTint, disc * mottle * 0.035 * uOp);
      }`,
  });
  const caustics = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), caustMat(CH[i].clone()));
    m.rotation.x = -Math.PI / 2;
    m.position.set(Math.cos(i * 2.1) * 2.0, -15.5 - i * 4.3, Math.sin(i * 2.1) * 2.0);
    m.userData.baseY = m.position.y;
    scene.add(m);
    return m;
  });

  /* ---- drift dust — depth cue along the whole shaft ---- */
  const DN = PHONE ? 180 : MID ? 300 : 520;
  const dgeo = new THREE.BufferGeometry();
  const dpos = new Float32Array(DN * 3);
  const dseed = new Float32Array(DN);
  for (let i = 0; i < DN; i++) {
    dpos[i * 3] = (rand() - 0.5) * 26;
    dpos[i * 3 + 1] = 6 - rand() * 56;
    dpos[i * 3 + 2] = (rand() - 0.5) * 26;
    dseed[i] = rand();
  }
  dgeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute("aSeed", new THREE.BufferAttribute(dseed, 1));
  const dustU = { uTime: { value: 0 }, uPx: { value: DPR }, uBoot: { value: 0 } };
  const dust = new THREE.Points(dgeo, new THREE.ShaderMaterial({
    uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uPx, uBoot;
      varying float vA;
      void main(){
        vec3 p = position;
        p.y += sin(uTime * 0.08 + aSeed * 20.0) * 1.4 - uTime * 0.12 * aSeed; /* slow snowfall */
        p.x += sin(uTime * 0.06 + aSeed * 31.0) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dep = -mv.z;
        gl_PointSize = clamp((1.6 + aSeed * 5.0) * uPx * (16.0 / max(1.0, dep)), 1.0, 26.0);
        vA = (0.04 + aSeed * 0.12) * uBoot * smoothstep(34.0, 10.0, dep);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(0.7, 0.82, 1.0), smoothstep(0.5, 0.1, d) * vA);
      }`,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  /* ---- in-world SDF chapter type (troika) — optional, any
     failure leaves the world intact minus the words ---- */
  const FONT_URL = "/assets/fonts/ClashDisplay-700.woff";
  const glyphs = [];
  const TYPE_KEYS = [
    { s: "DEEP SIGNAL", at: 0.0, p: [0, 5.6, -7.5], ry: 0, fs: 2.1 },
    { s: "GROWTH", at: 1.0, p: [-3.6, -10.6, -2.2], ry: 0.28, fs: 2.3 },
    { s: "THE VEIN", at: 2.0, p: [3.2, -21.6, -2.6], ry: -0.24, fs: 2.3 },
    { s: "THE CORE", at: 3.0, p: [-3.0, -34.4, -2.2], ry: 0.2, fs: 2.3 },
    { s: "RESURFACE", at: 4.0, p: [0, -42.6, -1.5], ry: 0, fs: 1.7 },
  ];
  try {
    preloadFont({ font: FONT_URL, characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ " }, () => {
      try {
        TYPE_KEYS.forEach((k) => {
          const t = new Text();
          t.font = FONT_URL;
          t.text = k.s;
          t.fontSize = k.fs;
          t.anchorX = "center"; t.anchorY = "middle";
          t.letterSpacing = 0.02;
          t.color = 0xd7e6f6;
          t.strokeColor = 0xe2eefb;
          t.strokeWidth = "0.5%";
          t.fillOpacity = 0;
          t.strokeOpacity = 0;
          t.position.set(...k.p);
          t.rotation.y = k.ry;
          t.material.depthWrite = false;
          t.visible = false;
          const entry = { obj: t, at: k.at, base: k.p.slice(), k: 0, ready: false };
          glyphs.push(entry);
          t.sync(() => {
            entry.ready = true;
            document.body.classList.add("lab-type-on");
          });
          scene.add(t);
        });
      } catch (e) { console.warn("[labfx] in-world type disabled:", e); }
    });
  } catch (e) { console.warn("[labfx] font preload failed:", e); }

  /* ---- post: bloom → tone → master grade (about3d's proven look,
     tuned colder: CA, cnoise corner glow per chapter, split-tone,
     vignette, grain, velocity warp, breathing) ---- */
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), 0.34, 0.6, 0.74); // v2: higher threshold — only true glints bloom
  const gradeUniforms = {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(W * DPR, H * DPR) },
    uAberration: { value: 0 },
    uWarp: { value: 0 },
    uGrain: { value: 0.055 }, // v2: lighter grain — facet edges stay crisp
    uContact: { value: 0 },
    uBreak: { value: 0 }, // v5 — reality tears near the core (scanline rips + CA spike, hash-gated)
    uTint: { value: new THREE.Color(0.35, 0.5, 0.62) },
  };
  /* NOTE: ShaderPass CLONES the uniforms of a plain shader object —
     loop writes would hit a dead copy. Passing a real ShaderMaterial
     makes the pass share this uniforms object by reference. */
  const gradePass = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: gradeUniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tDiffuse;
      uniform float uTime, uAberration, uWarp, uGrain, uContact, uBreak;
      uniform vec2 uResolution;
      uniform vec3 uTint;
      varying vec2 vUv;
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float cnoise(vec2 v){
        float t = v.x * 0.3; v.y *= 0.8; float n = 0.0; float s = 0.5;
        n += (sin(v.x * 0.9 / s + t * 4.0) + sin(v.x * 2.4 / s) + sin(v.x * -3.5 / s + t * 2.0)) * 0.3;
        n += (sin(v.y * -0.3 / s + t * 3.0) + sin(v.y * 1.6 / s) + sin(v.y * 2.6 / s - t)) * 0.3;
        return n;
      }
      void main(){
        vec2 uv = vUv;
        vec2 c = uv - 0.5;
        uv = 0.5 + c * (1.0 - uContact * 0.04);
        uv.x += sin(uv.y * 12.0 + uTime * 3.4) * 0.006 * uWarp;
        uv.y += cos(uv.x * 9.0 - uTime * 2.6) * 0.004 * uWarp;
        /* v5 BREAK — passing the source, the signal itself degrades:
           hash-gated horizontal band tears (3px rows, re-rolled 24×/s)
           shove the image sideways and spike the fringe. Gated so it
           FLICKERS — a constant offset would read as a bug, a 2%-of-
           rows stutter reads as transmission strain. */
        float tearRow = floor(vUv.y * uResolution.y / 3.0);
        float tearRoll = hash(vec2(tearRow, floor(uTime * 24.0)));
        float tear = step(1.0 - uBreak * 0.028, tearRoll) * step(0.001, uBreak);
        uv.x += (hash(vec2(tearRow, 7.7)) - 0.5) * 0.06 * tear * uBreak;
        float edge = dot(c, c);
        float amt = uAberration * 0.002 + edge * 0.0026 + uWarp * 0.005 + tear * uBreak * 0.004;
        vec2 dir = normalize(c + 1e-4);
        vec3 col = vec3(
          texture2D(tDiffuse, uv + dir * amt).r,
          texture2D(tDiffuse, uv).g,
          texture2D(tDiffuse, uv - dir * amt).b);
        float g = 0.5 + 0.5 * cnoise(c * 3.4 + uTime * 0.05);
        float corner = smoothstep(0.14, 0.95, length(c) * 1.34);
        col += uTint * pow(corner * g, 2.0) * 0.22;
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, col * vec3(0.86, 0.96, 1.18), (1.0 - lum) * 0.30);
        col = mix(col, col * vec3(1.06, 1.0, 0.92), lum * 0.18);
        col = (col - 0.5) * 1.07 + 0.5;
        float vig = smoothstep(1.2, 0.34, length(c) * 1.3);
        col *= vig;
        float grain = hash(uv * uResolution + fract(uTime) * 431.0);
        col = mix(col, col * (0.82 + grain * 0.36), uGrain);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`,
  }));
  gradePass.renderToScreen = true;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  composer.addPass(gradePass);

  const CH_TINT = [
    new THREE.Color(0.40, 0.60, 0.50), // surface — ice-lime dawn
    new THREE.Color(0.30, 0.46, 0.80), // descent — cold blue
    new THREE.Color(0.80, 0.34, 0.60), // vein — magenta current
    new THREE.Color(0.31, 0.77, 1.00), // core approach — cyan
    new THREE.Color(0.62, 0.78, 1.00), // resurface — pearl lift (v5: the finale breathes light, not acid)
  ];
  const CH_BLOOM = [0.34, 0.40, 0.52, 0.86, 0.44];
  const tintTmp = new THREE.Color();

  /* v5 FIVE CLIMATES — each chapter is its own atmosphere. Every lab
     material opts out of scene.fog, so the "air" here is really three
     hand-tuned shader colors: the shaft wall gradient (uTop/uDeep)
     and the shards' aerial haze (uHaze). One master air color per
     chapter drives all three each frame, so the whole world agrees
     about what the air is made of. Values sit in shader space (the
     numeric Color ctor doesn't convert) and tint the dark — the
     deep-navy body discipline stands, nothing washes. */
  const CH_AIR = [
    new THREE.Color(0.028, 0.040, 0.066), // 00 surface — the baseline navy dawn
    new THREE.Color(0.020, 0.034, 0.072), // 01 descent — colder, bluer, thinner
    new THREE.Color(0.052, 0.026, 0.070), // 02 the vein — violet blood-light
    new THREE.Color(0.026, 0.048, 0.034), // 03 the core — ember lime-black
    new THREE.Color(0.034, 0.044, 0.064), // 04 resurface — a breath lighter than the dawn, never milk
  ];
  const airTarget = new THREE.Color(), airNow = CH_AIR[0].clone();

  /* ---- camera rig — keyframed descent, Catmull-Rom ---- */
  const KEYS = [
    { p: [0.0, 4.6, 13.5], l: [0.0, 4.0, 0.0], f: 50 },
    { p: [2.6, -8.5, 8.8], l: [-0.5, -12.0, 0.0], f: 53 },
    { p: [-2.2, -20.5, 8.2], l: [0.8, -23.5, 0.0], f: 51 },
    { p: [2.0, -32.5, 7.6], l: [-0.5, -36.5, 0.0], f: 48 },
    { p: [0.0, -40.8, 7.4], l: [0.0, -46.4, 0.0], f: 44 },
  ];
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.p)), false, "centripetal", 0.4);
  const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.l)), false, "centripetal", 0.4);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const curPos = new THREE.Vector3(...KEYS[0].p), curLook = new THREE.Vector3(...KEYS[0].l);

  /* ============================================================
     v6 THE RUIN — the shaft is revealed as BUILT. One authored
     stone remnant per chapter (lab-setpieces.glb): the broken Gate
     the rail passes through, sheared strata slabs spiraling the
     descent, the machined Cradle holding the heart, and the Gate's
     INTACT twin standing at the surface horizon — the bookend.
     Stone shares the crystal matcap but reads as a different
     substance: darker body, no dispersion, sediment bands and the
     Cradle's charge strip carried in baked vertex color R.
     ============================================================ */
  const geoNodes = {};
  geoGltf.scene.traverse((o) => { if (o.isMesh) geoNodes[o.name] = o.geometry; });
  if (!geoNodes.Gate || !geoNodes.Cradle) throw new Error("setpieces glb missing nodes");
  /* shared uniform OBJECTS (spread by reference — a clone would give
     the loop dead copies, the ShaderPass lesson) */
  const stoneShared = {
    uTime: { value: 0 },
    uCharge: { value: 0 },
    uStoneRip: { value: new THREE.Vector4(0, 0, 0, -100) }, // 1-slot stone ring (Task 3 wires strikes)
    uBand: { value: gradeUniforms.uTint.value }, // chapter tint — same Color INSTANCE, lerps for free
    uHaze: shardUniforms.uHaze,                  // same aerial air as the crystals
  };
  const stoneMatOf = (strip) => new THREE.ShaderMaterial({
    uniforms: { ...stoneShared, uMatcap: { value: matcap }, uStrip: { value: strip } },
    fog: false,
    vertexShader: /* glsl */ `
      attribute vec4 color;
      uniform float uTime;
      varying vec3 vN, vV, vWp;
      varying float vCol;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp;
        vN = normalize((viewMatrix * vec4(mat3(modelMatrix) * normal, 0.0)).xyz);
        vV = -mv.xyz;
        vWp = wp.xyz;
        vCol = color.r;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMatcap;
      uniform float uTime, uCharge, uStrip;
      uniform vec4 uStoneRip;
      uniform vec3 uBand, uHaze;
      varying vec3 vN, vV, vWp;
      varying float vCol;
      void main(){
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        float ndv = abs(dot(n, v));
        vec3 mc = texture2D(uMatcap, n.xy * 0.49 + 0.5).rgb;
        /* stone body — the crystal matcap squared over a DARK mineral
           base. Stone must sit a full stop below the crystals: the
           ruin is the shadow the crystals grew against. */
        vec3 col = mc * mc * vec3(0.20, 0.23, 0.30) * 0.7;
        col += vec3(0.03, 0.045, 0.075) * (1.0 - ndv);      /* cold rim */
        float fr = pow(1.0 - ndv, 3.0);
        col += uBand * fr * 0.30;                            /* climate breathes on the edges */
        /* sediment bands (slabs) — baked vcol strips lit by the
           chapter tint; the ruin agrees with the air around it */
        col += uBand * vCol * 0.30 * (1.0 - uStrip);
        /* charge strip (Cradle arms) — vcol is the 0..1 arm-length
           param; the lime fill climbs root→grip while you hold */
        float fill = step(vCol, uCharge * 1.05) * step(0.02, vCol) * uStrip;
        col += vec3(0.72, 1.0, 0.24) * fill * (0.5 + 0.5 * sin(uTime * 9.0));
        /* stone answers strikes slowly — a deep pulse, not a flash */
        float age = uTime - uStoneRip.w;
        float ring = step(0.0, age) * exp(-age * 1.4) * smoothstep(6.0, 0.8, distance(vWp, uStoneRip.xyz));
        col += uBand * ring * 0.5;
        float dist = length(vV);
        col = mix(uHaze, col, smoothstep(36.0, 22.0, dist)); /* same aerial fade as the shards */
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const setPieces = [];
  const placeStone = (geo, strip, pos, ry, scale, tiltZ = 0) => {
    const m = new THREE.Mesh(geo, stoneMatOf(strip));
    m.position.copy(pos);
    m.rotation.y = ry;
    if (tiltZ) m.rotation.z = tiltZ;
    m.scale.setScalar(scale);
    scene.add(m);
    setPieces.push(m);
    return m;
  };
  /* the GATE straddles the rail where it crosses y≈−2.5 — found on the
     actual curve so the camera provably passes through the frame */
  {
    const gp = new THREE.Vector3(), gt = new THREE.Vector3();
    let tAt = 0.08;
    for (let tt = 0.02; tt < 0.3; tt += 0.005) {
      posCurve.getPoint(tt, gp);
      if (gp.y <= -2.5) { tAt = tt; break; }
    }
    posCurve.getPoint(tAt, gp);
    posCurve.getTangent(tAt, gt);
    const gate = placeStone(geoNodes.Gate, 0, gp, Math.atan2(gt.x, gt.z), 1.0);
    gate.rotation.x = -0.12; // lintel leans a breath into the descent
  }
  /* strata stair — 8 hand-posed slabs spiraling the DESCENT chapter */
  const SLAB_POSE = [
    [0, -9.2, 2.1, 8.4, 0.4, 1.5, 0.06], [1, -10.6, 3.3, 8.8, 1.7, 1.2, -0.08],
    [2, -12.1, 4.4, 8.2, 2.9, 1.6, 0.10], [0, -13.4, 5.6, 9.0, 4.1, 1.3, -0.05],
    [1, -15.0, 0.5, 8.6, 5.4, 1.7, 0.08], [2, -16.4, 1.6, 8.3, 0.3, 1.2, -0.11],
    [0, -17.7, 2.8, 8.9, 1.5, 1.5, 0.04], [1, -19.1, 3.9, 8.5, 2.8, 1.3, -0.07],
  ];
  for (const [vi, y, a, r, ry, sc, tz] of SLAB_POSE) {
    placeStone(geoNodes[`Slab${vi}`], 0,
      new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), ry, sc, tz);
  }
  /* the CRADLE rises to hold the heart (gem y −46.5, scale 2.1) */
  const cradle = placeStone(geoNodes.Cradle, 1, new THREE.Vector3(0, -51.2, 0), 0.5, 1.45);
  /* GateFar — the INTACT twin on the surface horizon, fog-shrouded
     behind the hero gem: you meet the ruin's whole self first, then
     descend through what broke */
  placeStone(geoNodes.GateFar, 0, new THREE.Vector3(0, 1.2, -13.5), 0.35, 1.55);
  document.body.classList.add("lab-ruin"); // v6 QA marker — only after real node lookup

  /* pointer parallax */
  let pxN = 0, pyN = 0;
  if (hoverFine) {
    addEventListener("pointermove", (e) => {
      pxN = (e.clientX / W) * 2 - 1;
      pyN = -(e.clientY / H) * 2 + 1;
    }, { passive: true });
  }

  /* ---- v4 RESONANCE: pointer strikes ring the shaft wall ----
     Analytic ray→cylinder hit (the crystals live on the wall at
     r≈8.6–12.2 and the camera rail stays inside it) — no Raycaster,
     no per-instance attribute writes: 6 uniform slots drive every
     shard. Hover-fine pointers excite continuously as they sweep;
     coarse pointers strike on tap. v5 ECHO CASCADE: a deliberate
     strike (tap, or first contact after a pause) finds up to two
     neighbouring crystal origins within 5u and re-rings them at
     +120/220ms — the wall answers in sequence, not all at once. */
  const RIP_R = 9.4;
  const ripDir = new THREE.Vector3();
  let ripSlot = 0, ripLastT = -10, ripCount = 0, echoCount = 0;
  let ripX = 1e9, ripY = 1e9, ripZ = 1e9;
  const ripWrite = (x, y, z) => {
    shardUniforms.uRip.value[ripSlot].set(x, y, z, shardUniforms.uTime.value);
    ripSlot = (ripSlot + 1) % 6;
  };
  const strike = (cx, cy, force) => {
    const now = shardUniforms.uTime.value;
    const o = camera.position;
    ripDir.set((cx / W) * 2 - 1, -(cy / H) * 2 + 1, 0.5).unproject(camera).sub(o).normalize();
    const qa = ripDir.x * ripDir.x + ripDir.z * ripDir.z;
    const qb = 2 * (o.x * ripDir.x + o.z * ripDir.z);
    const qc = o.x * o.x + o.z * o.z - RIP_R * RIP_R;
    const disc = qb * qb - 4 * qa * qc;
    let tH = 14; // looking straight down the axis — strike mid-haze
    if (qa > 1e-5 && disc > 0) tH = Math.min(34, (-qb + Math.sqrt(disc)) / (2 * qa));
    const hx = o.x + ripDir.x * tH, hy = o.y + ripDir.y * tH, hz = o.z + ripDir.z * tH;
    const dx = hx - ripX, dy = hy - ripY, dz = hz - ripZ;
    /* gate sweeps: ≥90ms between strikes AND ≥1.2u travel on the
       wall, so idle jitter never restrikes; taps bypass both */
    if (!force && (now - ripLastT < 0.09 || dx * dx + dy * dy + dz * dz < 1.44)) return;
    /* cascade only on deliberate contact — sweeps stay single-voice so
       painting the wall never floods the 6-slot ring */
    const cascade = force || now - ripLastT > 0.45;
    ripWrite(hx, hy, hz);
    ripX = hx; ripY = hy; ripZ = hz; ripLastT = now;
    if (chimeRef) chimeRef(hx, hy, hz); // v4 sound — struck wall rings pitched (no-op when sound off)
    if (readout) { readout.classList.remove("is-ping"); void readout.offsetWidth; readout.classList.add("is-ping"); } // HUD registers the strike
    if (++ripCount === 1) document.body.classList.add("lab-resonant"); // v4 QA marker — only on a real strike
    if (!cascade) return;
    /* nearest two seeded origins in the 1.2–5u shell around the hit
       (inside 1.2u is the struck crystal itself, already ringing) */
    let n1 = null, n2 = null, d1 = 25, d2 = 25;
    for (const it of plan) {
      const ex = it.pos.x - hx, ey = it.pos.y - hy, ez = it.pos.z - hz;
      const dd = ex * ex + ey * ey + ez * ez;
      if (dd < 1.44 || dd >= d2) continue;
      if (dd < d1) { n2 = n1; d2 = d1; n1 = it.pos; d1 = dd; }
      else { n2 = it.pos; d2 = dd; }
    }
    for (const [np, ms] of [[n1, 120], [n2, 220]]) {
      if (!np) break;
      setTimeout(() => {
        ripWrite(np.x, np.y, np.z);
        echoCount += 1;
        if (chimeRef) chimeRef(np.x, np.y, np.z); // the echo is audible — a fainter, later ring
      }, ms);
    }
  };
  if (hoverFine) addEventListener("pointermove", (e) => strike(e.clientX, e.clientY, false), { passive: true });
  else {
    /* v5 touch feel — drag-to-ring: while a finger is down, moving it
       paints strikes along the wall (the same sweep gates apply, so a
       scroll flick lands at most a couple of rings, not a flood) */
    let dragging = false;
    addEventListener("pointerdown", () => { dragging = true; }, { passive: true });
    addEventListener("pointerup", () => { dragging = false; }, { passive: true });
    addEventListener("pointercancel", () => { dragging = false; }, { passive: true });
    addEventListener("pointermove", (e) => { if (dragging) strike(e.clientX, e.clientY, false); }, { passive: true });
  }
  addEventListener("pointerdown", (e) => strike(e.clientX, e.clientY, true), { passive: true });

  /* v4 CORE CHARGE — inside THE CORE the pointer becomes an
     instrument: hold to feed the heart, release to detonate one
     resonance wave through the whole field. Armed off heartNear
     in the loop; created here so no3d pages never carry the cue. */
  let charge = 0, charging = false, chargeArmed = false, releaseKick = 0;
  const chargeCue = document.createElement("div");
  chargeCue.id = "labCharge";
  chargeCue.textContent = "[ HOLD TO CHARGE ]";
  document.body.appendChild(chargeCue);
  const chargeRelease = () => {
    chargeCue.classList.remove("is-hot");
    if (!charging) return;
    charging = false;
    if (charge < 0.22) return; // a stray click never detonates
    shardUniforms.uWave.value.set(0, -46.5, 0, shardUniforms.uTime.value); // the heart
    releaseKick = Math.min(1, charge);
    if (thumpRef) thumpRef(charge);
  };
  addEventListener("pointerdown", () => { if (chargeArmed) { charging = true; chargeCue.classList.add("is-hot"); } }, { passive: true });
  addEventListener("pointerup", chargeRelease, { passive: true });
  addEventListener("pointercancel", chargeRelease, { passive: true });
  addEventListener("blur", chargeRelease);

  /* v4 RETICLE — instrument cursor (dot + lagging bracket ring,
     about3d pattern). Fine pointers only; the native cursor stays
     for reduced-motion. Created here so no3d pages never carry it. */
  if (hoverFine && !reduced) {
    const cur = document.createElement("div");
    cur.id = "labCursor";
    cur.setAttribute("aria-hidden", "true");
    cur.innerHTML = '<i class="lab-cursor__dot"></i><span class="lab-cursor__ring"><em class="lab-cursor__label"></em></span>';
    document.body.appendChild(cur);
    document.body.classList.add("lab-cursor-on");
    const ring = cur.querySelector(".lab-cursor__ring");
    const dot = cur.querySelector(".lab-cursor__dot");
    const curLabel = cur.querySelector(".lab-cursor__label");
    let cpx = W / 2, cpy = H / 2, crx = cpx, cry = cpy, curSeen = false;
    addEventListener("pointermove", (e) => { cpx = e.clientX; cpy = e.clientY; curSeen = true; }, { passive: true });
    addEventListener("pointerdown", () => cur.classList.add("is-down"), { passive: true });
    addEventListener("pointerup", () => cur.classList.remove("is-down"), { passive: true });
    gsap.ticker.add(() => {
      if (!curSeen) return;
      crx += (cpx - crx) * 0.18; cry += (cpy - cry) * 0.18;
      ring.style.transform = `translate3d(${crx}px,${cry}px,0)`;
      dot.style.transform = `translate3d(${cpx}px,${cpy}px,0)`;
    });
    document.addEventListener("pointerover", (e) => {
      const t = e.target.closest("[data-cursor]");
      cur.classList.toggle("is-hover", !!t);
      if (t) curLabel.textContent = t.dataset.cursor;
    });
    /* magnetic end-card links */
    document.querySelectorAll(".lab-end__actions a").forEach((btn) => {
      const xTo = gsap.quickTo(btn, "x", { duration: 0.4, ease: "power3.out" });
      const yTo = gsap.quickTo(btn, "y", { duration: 0.4, ease: "power3.out" });
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.3);
        yTo((e.clientY - r.top - r.height / 2) * 0.45);
      });
      btn.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
    });
  }

  let hidden = false;
  document.addEventListener("visibilitychange", () => { hidden = document.hidden; });

  addEventListener("resize", () => {
    W = innerWidth; H = innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    composer.setSize(W, H);
    gradeUniforms.uResolution.value.set(W * dprNow, H * dprNow);
  });

  /* boot growth — the surface garden erupts as the loader lifts */
  const grow = { base: 0 };
  addEventListener("lab:hero", () => {
    gsap.to(grow, { base: 0.6, duration: 2.4, ease: "power2.out", delay: 0.2 });
    gsap.to(dustU.uBoot, { value: 1, duration: 2.2, ease: "power2.out" });
  }, { once: true });
  if (document.body.classList.contains("lab-in")) { grow.base = 0.6; dustU.uBoot.value = 1; }

  /* ---- adaptive quality governor (about3d pattern) ---- */
  const QCAPS = PHONE ? [1.1, 0.9, 0.75] : MID ? [1.25, 1.0, 0.8] : [1.5, 1.15, 0.9];
  let qIdx = 0, emaMs = 16.7, qCooldown = 120, lastT = 0, dprNow = DPR;
  if (MID) shardUniforms.uDisp.value = 0; // coarse tier: single refraction tap
  const applyQ = () => {
    // dispersion is the first thing to go — cheaper than a DPR drop
    // and invisible next to one (tier 0 = full spectra, else off)
    shardUniforms.uDisp.value = !MID && qIdx === 0 ? 1 : 0;
    dprNow = Math.min(devicePixelRatio || 1, QCAPS[qIdx]);
    renderer.setPixelRatio(dprNow);
    composer.setPixelRatio(dprNow);
    renderer.setSize(W, H);
    composer.setSize(W, H);
    dustU.uPx.value = dprNow;
    gradeUniforms.uResolution.value.set(W * dprNow, H * dprNow);
  };
  window.__labQ = () => ({ qIdx, dpr: dprNow, disp: shardUniforms.uDisp.value, rip: ripCount, echo: echoCount, chime: chimeCount, charge: +charge.toFixed(3), pocket: PHONE, tx: txEl ? txEl.textContent : "", bootLines, emaMs: Math.round(emaMs) }); // QA introspection hook
  const governQuality = (t) => {
    const dt = Math.min(100, (t - lastT) * 1000);
    lastT = t;
    if (dt <= 0) return;
    emaMs += (dt - emaMs) * 0.05;
    if (--qCooldown > 0) return;
    if (emaMs > 30 && qIdx < QCAPS.length - 1) { qIdx++; applyQ(); qCooldown = 240; }
    else if (emaMs < 17 && qIdx > 0) { qIdx--; applyQ(); qCooldown = 420; }
  };

  let warpState = 0, contactState = 0, rollState = 0, prevChapter = 0, chapterPulse = 0;
  const clock = new THREE.Clock();

  /* v5 SPRING CAMERA — a real damped harmonic oscillator per axis
     (semi-implicit Euler) instead of exponential lerp. ζ just under
     critical gives the rig mass: a whisper of overshoot when the
     rail bends direction, then a clean settle. reduced-motion never
     reaches here (the no3d gate), so no snap path is needed. */
  const CAM_W = 4.4, CAM_Z = 0.85; // ω rad/s ≈ lerp-0.055 responsiveness, damping ratio
  const camVel = new THREE.Vector3(), lookVel = new THREE.Vector3();
  const springV3 = (cur, vel, tgt, dt) => {
    /* a = ω²(target−x) − 2ζω·v — integrate v before x (stable) */
    vel.x += (CAM_W * CAM_W * (tgt.x - cur.x) - 2 * CAM_Z * CAM_W * vel.x) * dt;
    vel.y += (CAM_W * CAM_W * (tgt.y - cur.y) - 2 * CAM_Z * CAM_W * vel.y) * dt;
    vel.z += (CAM_W * CAM_W * (tgt.z - cur.z) - 2 * CAM_Z * CAM_W * vel.z) * dt;
    cur.addScaledVector(vel, dt);
  };

  /* v5 DILATED WORLD CLOCK — time thickens with depth. ACCUMULATED
     (labT += dt·dilation), never t×dilation: a falling multiplier on
     absolute time runs uTime BACKWARDS mid-descent, which would hand
     every v4 ripple/wave stamped "now" a negative age and silently
     kill the resonance systems at depth. The world's visuals and the
     strike/wave stamps share this clock; the governor, grade grain
     and DOM stay on real time. */
  let labT = 0, timeDilation = 1, lastRealT = 0;

  renderer.setAnimationLoop(() => {
    if (hidden) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(1 / 30, Math.max(1e-4, t - lastRealT)); // clamp tab-back spikes
    lastRealT = t;
    governQuality(t);

    const cp = progress();
    const fa = Math.min(F - 1, Math.floor(cp));
    const frac = Math.min(1, cp - fa);

    /* dilation 1.0 at the surface → ~0.42 at the core; the world
       clock only ever moves forward, just slower the deeper you are */
    timeDilation += ((1 - cp * 0.145) - timeDilation) * 0.02;
    labT += dt * timeDilation;
    const wt = labT; // world time — every in-world visual reads this

    shardUniforms.uTime.value = wt;
    stoneShared.uTime.value = wt;
    stoneShared.uCharge.value = charge;
    /* ruin culling — same rule as the shard bands: outside the 36u
       aerial fade a set-piece has already melted into the haze */
    for (const sp of setPieces) sp.visible = Math.abs(sp.position.y - curPos.y) < 41;
    heroU.uTime.value = wt;
    heartU.uTime.value = wt;
    dustU.uTime.value = wt;
    shaft.material.uniforms.uTime.value = wt;

    /* growth sweeps with depth */
    shardUniforms.uGrow.value = grow.base + cp * 0.9;

    /* v5 MORPHING — crystals near the camera lean toward fluid.
       Ramps with depth + charge, capped well short of saturation so
       the deep-core composition stays authored, not stretched. */
    const morphTarget = Math.min(1, cp * 0.25 + charge * 0.4);
    shardUniforms.uMorph.value += (morphTarget - shardUniforms.uMorph.value) * 0.04;

    /* camera travel + parallax + banking — sprung, not lerped */
    posCurve.getPoint(cp / F, camPos);
    lookCurve.getPoint(cp / F, camLook);
    camPos.x += pxN * 0.6 + Math.sin(wt * 0.3) * 0.1;
    camPos.y += pyN * 0.35 + Math.cos(wt * 0.24) * 0.06;
    camPos.z += (0.6 - grow.base) * 4.5; // boot dolly-in
    springV3(curPos, camVel, camPos, dt);
    springV3(curLook, lookVel, camLook, dt);
    camera.position.copy(curPos);
    camera.lookAt(curLook);
    rollState += (gsap.utils.clamp(-0.05, 0.05, scrollVel * 0.006) - rollState) * 0.06;
    camera.rotateZ(rollState + Math.sin(wt * 0.16) * 0.006);
    const fv = KEYS[fa].f + (KEYS[Math.min(F, fa + 1)].f - KEYS[fa].f) * frac - 4 * charge + (PHONE ? 6 : 0); // v4: charge pinch; v5: portrait breathes wider
    if (Math.abs(camera.fov - fv) > 0.01) { camera.fov += (fv - camera.fov) * 0.06; camera.updateProjectionMatrix(); }

    /* v5: feed camera position to shaders for proximity effects */
    shardUniforms.uCamPos.value.copy(curPos);

    /* shaft follows so the tube never ends */
    shaft.position.y = curPos.y - 14;
    shaftUniforms.uCamY.value = curPos.y; // v5: feed camera Y for breathing proximity

    /* depth-band culling — a band draws only if (a) its earliest
       birth is inside the growth front (else all scale-0) and (b) it
       sits inside the shader's 36u aerial fade (vertical distance is
       a lower bound of true view distance, so this can't pop) */
    const growNow = shardUniforms.uGrow.value;
    for (const m of meshes) {
      const bandD = Math.abs(m.userData.bandY - curPos.y);
      const live = m.userData.minBirth < growNow + 0.02 && bandD - 5 < 36;
      /* LOD pick: near bands (or MID, which only built LOD1 meshes)
         draw their single copy; far bands swap hi→LOD1 past LOD_DIST,
         deep inside the fog so the swap can't read */
      m.visible = live && (MID || (m.userData.lod === (bandD - 5 < LOD_DIST ? 0 : 1)));
    }

    /* godlight lives at the surface, aura at the core */
    sun.u.uTime.value = wt;
    aura.u.uTime.value = wt;
    sun.u.uOp.value = grow.base / 0.6 * Math.max(0, 1 - cp * 0.75);
    aura.u.uOp.value = Math.max(0, 1 - Math.abs(cp - (F - 0.85)) * 0.75);
    sunCone.visible = sun.u.uOp.value > 0.01;
    auraCone.visible = aura.u.uOp.value > 0.01;

    /* vein caustic sheets live around chapter 2 only */
    caustU.uTime.value = wt;
    caustU.uOp.value = Math.max(0, 1 - Math.abs(cp - 2.0) * 1.4);
    for (let ci = 0; ci < caustics.length; ci++) {
      const cm = caustics[ci];
      cm.visible = caustU.uOp.value > 0.01;
      if (!cm.visible) continue;
      cm.position.y = cm.userData.baseY + Math.sin(wt * 0.11 + ci * 2.4) * 0.9;
      cm.rotation.z = wt * 0.02 * (ci % 2 ? -1 : 1);
    }

    /* gems */
    heroGem.rotation.y = wt * 0.22;
    heroGem.rotation.x = Math.sin(wt * 0.17) * 0.14;
    heroGem.position.y = 4.3 + Math.sin(wt * 0.5) * 0.16 + Math.min(1, cp) * 10;
    heroU.uOp.value = Math.max(0, 1 - cp * 1.1);
    heroGem.visible = heroU.uOp.value > 0.01;
    heartGem.rotation.y = -wt * 0.3;
    heartGem.rotation.z = Math.sin(wt * 0.21) * 0.12;
    const heartNear = Math.max(0, 1 - Math.abs(cp - (F - 0.6)) * 0.9);
    /* v4 CHARGE — armed only near the heart; hold ramps ~1.1s to
       full, releasing (or drifting away) drains fast. Drives the
       heart's own energy, bloom, FOV pinch and the drone filter. */
    chargeArmed = heartNear > 0.15;
    charge += ((charging && chargeArmed ? 1 : 0) - charge) * (charging ? 0.035 : 0.1);
    shardUniforms.uCharge.value = charge; // v5 inhale — the field leans in while you hold
    chargeCue.classList.toggle("is-on", chargeArmed);
    heartU.uEnergy.value += ((heartNear + chapterPulse + charge * 1.7) - heartU.uEnergy.value) * 0.06;
    heartGem.scale.setScalar(2.1 + Math.sin(wt * 1.8) * 0.05 * (1 + heartU.uEnergy.value));

    /* in-world chapter names — proximity fade (troika strokes need
       fillOpacity/strokeOpacity, not material.opacity) */
    for (const g of glyphs) {
      if (!g.ready) continue;
      const prox = Math.max(0, 1 - Math.abs(cp - g.at) * 2.2);
      g.k += (prox * prox * prox - g.k) * 0.09;
      g.obj.visible = g.k > 0.01;
      if (!g.obj.visible) continue;
      g.obj.fillOpacity = 0.07 * g.k;
      g.obj.strokeOpacity = 0.55 * g.k;
      g.obj.position.y = g.base[1] + Math.sin(wt * 0.28 + g.at * 2.0) * 0.14;
      g.obj.position.x = g.base[0] + pxN * -0.35;
    }

    /* grade wiring */
    const chNow = Math.round(cp);
    if (chNow !== prevChapter) { chapterPulse = 1; prevChapter = chNow; }
    /* five climates — the master air color eases between chapters and
       the wall gradient / floor shadow / aerial haze all derive */
    airTarget.copy(CH_AIR[fa]).lerp(CH_AIR[Math.min(F, fa + 1)], frac);
    airNow.lerp(airTarget, 0.04);
    shaftUniforms.uTop.value.copy(airNow);
    shaftUniforms.uDeep.value.copy(airNow).multiplyScalar(0.34);
    shardUniforms.uHaze.value.copy(airNow).multiplyScalar(0.31);
    /* v4 CHARGE release rides the SAME shockwave rails as a chapter
       hand-off (warp/contact/bloom/uPulse/dolly punch) + a roll kick;
       the expanding uWave shell is already in flight shader-side. */
    if (releaseKick > 0) { chapterPulse = Math.max(chapterPulse, 0.9 * releaseKick); rollState += 0.028 * releaseKick; releaseKick = 0; }
    chapterPulse *= 0.9;
    shardUniforms.uPulse.value = chapterPulse;
    const velEnergy = Math.min(1, Math.abs(scrollVel) * 0.05);
    warpState += (Math.max(velEnergy, chapterPulse) - warpState) * 0.12;
    contactState += ((velEnergy * 0.6 + 0.14 + chapterPulse * 0.4) - contactState) * 0.05;
    gradeUniforms.uTime.value = t;
    gradeUniforms.uWarp.value = warpState;
    gradeUniforms.uContact.value = contactState;
    gradeUniforms.uAberration.value = velEnergy;
    /* v5 BREAK — the tear window sits just past the heart (cp≈3.2,
       the moment you pass the source): faint on its own, violent
       while the charge is held. Zero everywhere else. */
    gradeUniforms.uBreak.value = Math.max(0, 1 - Math.abs(cp - 3.2) * 2.6) * (0.35 + charge * 0.65);
    tintTmp.copy(CH_TINT[fa]).lerp(CH_TINT[Math.min(F, fa + 1)], frac);
    gradeUniforms.uTint.value.lerp(tintTmp, 0.06);
    const targetBloom = ((CH_BLOOM[fa] + (CH_BLOOM[Math.min(F, fa + 1)] - CH_BLOOM[fa]) * frac) + chapterPulse * 0.5 + charge * 0.45) * (PHONE ? 0.85 : 1); // small screens amplify halo
    bloomPass.strength += (targetBloom - bloomPass.strength) * 0.08;
    camera.position.z -= chapterPulse * 0.5;

    /* the drone darkens with depth — and opens while the core charges */
    if (bedFilterRef && acRef) bedFilterRef.frequency.value = 230 - cp * 30 + charge * 320;

    scrollVel *= 0.94;
    composer.render();
  });

  document.body.classList.add("fx-on");
  document.body.classList.add("lab-crystalline"); // v2 QA/smoke marker — only on real boot
  if (PHONE) document.body.classList.add("lab-pocket"); // v5 marker — phone tier actually rendering
  /* v5 transmission — armed ONLY here, on real boot: the field
     reports narrate a world that is actually rendering. */
  document.body.classList.add("lab-transmission");
  bootLine("LINK ESTABLISHED · BEGIN DESCENT");
  txType(TX[Math.min(F, Math.round(progress()))]);
  addEventListener("lab:chapter", (e) => txType(TX[e.detail]));
  releaseIntro();
}
