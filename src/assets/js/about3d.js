/* ============================================================
   stackwith.me — about3d.js · "The Signal Field v3 — In-World"
   An instrument journey: one 65k-particle field morphs into
   each chapter's idea (ECG pulse → sphere → three channel
   strands → "3:14" → lattice → pulse mark) while a keyframed
   camera travels the world. v3 puts CONTENT in the world:
   giant SDF ghost numerals (troika) stand at each camera stop,
   an iridescent instrument core breathes inside the hero ring,
   a canvas fluid-trail texture drives the grade pass, and a
   synthesized WebAudio soundscape sits behind a HUD toggle.
   An adaptive quality governor steps DPR against frame time.
   Morphing runs on vertex attributes (6 targets), so there is
   no float-texture dependency — one robust GL pipeline.
   Fallbacks: <680px / reduced-motion / GL-fail →
   body.about-no3d static scrim; no-JS unhides all content.
   ============================================================ */

import * as THREE from "three";
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

/* channel palette — mirrors --ch0/1/2 tokens (lime / magenta / cyan) */
const CH = [new THREE.Color(0xb8ff3c), new THREE.Color(0xff4fa3), new THREE.Color(0x4fc4ff)];

if (!reduced) document.body.classList.add("ab-anim");

/* ------------------------------------------------------------
   scroll state — Lenis inertial scroll + velocity feed
   ------------------------------------------------------------ */
let lenis = null;
let scrollVel = 0; // decayed |velocity| for kick/skew/marquee
if (!reduced) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1.0 });
  lenis.on("scroll", (e) => { scrollVel = e.velocity || 0; });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

/* ------------------------------------------------------------
   boot loader — counter + wordmark, shutter release
   ------------------------------------------------------------ */
const intro = document.getElementById("abIntro");
const heroStart = () => dispatchEvent(new CustomEvent("ab:hero"));
const releaseIntro = () => {
  if (!intro || intro.classList.contains("is-done")) return;
  intro.classList.add("is-done");
  document.body.classList.add("ab-in");
  heroStart();
  setTimeout(() => intro.remove(), 1100);
};
if (intro) {
  if (reduced) {
    releaseIntro();
  } else {
    /* split the wordmark into chars for the stagger */
    const word = intro.querySelector(".ab-intro__word");
    if (word) {
      const chars = [...word.textContent].map((c) => `<i>${c === " " ? "&nbsp;" : c}</i>`).join("");
      word.innerHTML = chars;
      gsap.fromTo(word.children, { yPercent: 120 }, { yPercent: 0, duration: 0.9, ease: "power4.out", stagger: 0.035, delay: 0.15 });
    }
    const pct = intro.querySelector(".ab-intro__pct");
    const bar = intro.querySelector(".ab-intro__bar b");
    const n = { v: 0 };
    gsap.to(n, {
      v: 100, duration: 1.55, ease: "power2.inOut",
      onUpdate: () => {
        if (pct) pct.textContent = String(Math.round(n.v)).padStart(3, "0");
        if (bar) bar.style.transform = `scaleX(${n.v / 100})`;
      },
      onComplete: () => setTimeout(releaseIntro, 180),
    });
    intro.addEventListener("click", releaseIntro);
    setTimeout(releaseIntro, 4000); // hard fallback
  }
} else {
  document.body.classList.add("ab-in");
  heroStart();
}

/* ------------------------------------------------------------
   DOM choreography — runs everywhere, no WebGL required
   ------------------------------------------------------------ */
document.body.classList.add("fx-dom");

/* IO reveals with per-section stagger */
const revealables = [...document.querySelectorAll("[data-abreveal]")];
if (reduced || !("IntersectionObserver" in window)) {
  revealables.forEach((el) => el.classList.add("in"));
} else {
  const bySection = new Map();
  revealables.forEach((el) => {
    const sec = el.closest("section") || document.body;
    if (!bySection.has(sec)) bySection.set(sec, 0);
    el.style.transitionDelay = `${Math.min(bySection.get(sec), 6) * 80}ms`;
    bySection.set(sec, bySection.get(sec) + 1);
  });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  revealables.forEach((el) => io.observe(el));
}

/* hero entrance — masked line rise + pulse underline draw.
   initial hidden states are set from JS (not CSS) so no-JS and
   reduced-motion users always see the content. */
const pulsePath = document.querySelector(".ab-pulsesvg path");
if (pulsePath) {
  const L = pulsePath.getTotalLength();
  pulsePath.style.strokeDasharray = String(L);
  pulsePath.style.strokeDashoffset = reduced ? "0" : String(L);
}
if (!reduced) {
  gsap.set(".ab-hero .ab-ln", { yPercent: 112, rotate: 3 });
  gsap.set(".ab-hero .ab-eyebrow, .ab-hero .ab-sub, .ab-hero .ab-cue", { opacity: 0, y: 20 });
}
addEventListener("ab:hero", () => {
  if (reduced) return;
  const tl = gsap.timeline({ delay: 0.05 });
  tl.to(".ab-hero .ab-ln", { yPercent: 0, rotate: 0, duration: 1.2, ease: "power4.out", stagger: 0.12 })
    .to(".ab-hero .ab-eyebrow, .ab-hero .ab-sub, .ab-hero .ab-cue", { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.1 }, "-=0.75");
  if (pulsePath) tl.to(pulsePath, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, "-=0.6");
}, { once: true });

/* chapter rail + HUD readout */
const chapters = [...document.querySelectorAll("[data-abchapter]")];
const rail = document.getElementById("abRail");
const readout = document.getElementById("abReadout");
const hudPct = document.getElementById("abPct");
const dots = [];
if (rail && chapters.length) {
  chapters.forEach((ch, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ab-rail__dot";
    b.setAttribute("aria-label", ch.dataset.abchapter || `Chapter ${i + 1}`);
    b.addEventListener("click", () => {
      const y = ch.getBoundingClientRect().top + scrollY - 60;
      lenis ? lenis.scrollTo(y) : scrollTo({ top: y, behavior: "smooth" });
    });
    rail.appendChild(b);
    dots.push(b);
  });
}
let activeCh = -1;
const markChapter = () => {
  const mid = scrollY + innerHeight * 0.45;
  let active = 0;
  chapters.forEach((ch, i) => { if (ch.offsetTop <= mid) active = i; });
  if (active !== activeCh) {
    const first = activeCh === -1;
    activeCh = active;
    dots.forEach((d, i) => d.classList.toggle("is-active", i === active));
    if (readout) readout.textContent =
      `${String(active + 1).padStart(2, "0")} / ${(chapters[active].dataset.abchapter || "").toUpperCase()}`;
    if (!first) dispatchEvent(new CustomEvent("ab:chapter", { detail: active }));
  }
  if (hudPct) {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    hudPct.textContent = String(Math.min(100, Math.round((scrollY / max) * 100))).padStart(3, "0");
  }
};
addEventListener("scroll", markChapter, { passive: true });
markChapter();

/* piecewise chapter progress 0..(chapters-1) — drives world + camera */
let chTops = [];
const measureChapters = () => { chTops = chapters.map((c) => c.offsetTop); };
measureChapters();
addEventListener("resize", measureChapters);
addEventListener("load", measureChapters);
const chapterProgress = () => {
  if (!chTops.length) return 0;
  const mid = scrollY + innerHeight * 0.42;
  if (mid <= chTops[0]) return 0;
  for (let i = chTops.length - 1; i >= 0; i--) {
    if (mid >= chTops[i]) {
      if (i === chTops.length - 1) return i;
      return i + Math.min(1, (mid - chTops[i]) / Math.max(1, chTops[i + 1] - chTops[i]));
    }
  }
  return 0;
};

/* work rows — hover excites that channel strand */
let hoverCh = -1;
document.querySelectorAll(".ab-row[data-ch]").forEach((row) => {
  const ch = Number(row.dataset.ch);
  row.addEventListener("pointerenter", () => { hoverCh = ch; });
  row.addEventListener("pointerleave", () => { hoverCh = -1; });
});

/* velocity marquee — JS-driven on fine pointers, CSS anim otherwise */
const marquee = document.getElementById("abMarquee");
if (marquee && hoverFine && !reduced) {
  marquee.parentElement.classList.add("is-js");
  let x = 0;
  const half = () => marquee.scrollWidth / 2 || 1;
  gsap.ticker.add(() => {
    x -= 0.9 + Math.min(7, Math.abs(scrollVel)) * 0.5;
    if (-x >= half()) x += half();
    marquee.style.transform = `translate3d(${x}px,0,0)`;
  });
}

/* scroll-velocity skew on the content column */
if (hoverFine && !reduced) {
  const main = document.getElementById("main");
  if (main) {
    main.style.willChange = "transform";
    const skewTo = gsap.quickTo(main, "skewY", { duration: 0.5, ease: "power2.out" });
    gsap.ticker.add(() => {
      skewTo(gsap.utils.clamp(-1.6, 1.6, scrollVel * 0.22));
      scrollVel *= 0.92;
    });
  }
}

/* custom cursor — dot + lagging labelled ring */
const cursor = document.getElementById("abCursor");
if (cursor && hoverFine && !reduced) {
  document.body.classList.add("ab-cursor-on");
  const label = cursor.querySelector(".ab-cursor__label");
  const dot = document.getElementById("abCursorDot");
  let px = innerWidth / 2, py = innerHeight / 2, rx = px, ry = py, seen = false;
  addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; seen = true; }, { passive: true });
  gsap.ticker.add(() => {
    if (!seen) return;
    rx += (px - rx) * 0.16; ry += (py - ry) * 0.16;
    cursor.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    if (dot) dot.style.transform = `translate3d(${px}px,${py}px,0)`;
  });
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest("[data-cursor]");
    cursor.classList.toggle("is-hover", !!t);
    if (t && label) label.textContent = t.dataset.cursor;
  });
}

/* magnetic CTA button */
if (hoverFine && !reduced) {
  document.querySelectorAll(".ab-cta__btn").forEach((btn) => {
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

/* ------------------------------------------------------------
   sound design — fully synthesized WebAudio, zero assets.
   A low breathing drone + air shimmer bed; channel-pitched
   blips on work-row hover; a filtered-noise whoosh on chapter
   hand-offs. Default OFF behind the HUD toggle; the preference
   persists, but (autoplay policy) a stored "on" only arms and
   waits for the first gesture. DOM-level: works without WebGL.
   ------------------------------------------------------------ */
const soundBtn = document.getElementById("abSound");
if (soundBtn) {
  let AC = null, master = null, bedFilter = null, soundOn = false;
  const ensureAudio = () => {
    if (AC) return true;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain();
      master.gain.value = 0;
      master.connect(AC.destination);
      /* drone bed: three detuned partials through a breathing lowpass */
      bedFilter = AC.createBiquadFilter();
      bedFilter.type = "lowpass"; bedFilter.frequency.value = 240; bedFilter.Q.value = 0.6;
      bedFilter.connect(master);
      [[54, "sine", 0.16], [108.6, "sine", 0.10], [162.4, "triangle", 0.035]].forEach(([f, ty, g]) => {
        const o = AC.createOscillator(), og = AC.createGain();
        o.type = ty; o.frequency.value = f; og.gain.value = g;
        o.connect(og); og.connect(bedFilter); o.start();
      });
      const lfo = AC.createOscillator(), lg = AC.createGain();
      lfo.frequency.value = 0.06; lg.gain.value = 90;
      lfo.connect(lg); lg.connect(bedFilter.frequency); lfo.start();
      /* air shimmer: looped noise through a narrow bandpass */
      const len = AC.sampleRate * 2;
      const buf = AC.createBuffer(1, len, AC.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const noise = AC.createBufferSource();
      noise.buffer = buf; noise.loop = true;
      const bp = AC.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 1.4;
      const ng = AC.createGain(); ng.gain.value = 0.012;
      noise.connect(bp); bp.connect(ng); ng.connect(master); noise.start();
      return true;
    } catch { AC = null; return false; }
  };
  const blip = (freq, vol = 0.10, dur = 0.10) => {
    if (!AC || !soundOn) return;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(AC.currentTime + dur + 0.02);
  };
  const whoosh = () => {
    if (!AC || !soundOn) return;
    const len = AC.sampleRate * 0.4;
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = AC.createBufferSource(); src.buffer = buf;
    const lp = AC.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 2.2;
    lp.frequency.setValueAtTime(2400, AC.currentTime);
    lp.frequency.exponentialRampToValueAtTime(220, AC.currentTime + 0.38);
    const g = AC.createGain(); g.gain.value = 0.07;
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start();
  };
  const setOn = (v, persist = true) => {
    if (v) ensureAudio();
    soundOn = v;
    if (v && AC?.state === "suspended") AC.resume().catch(() => {});
    soundBtn.setAttribute("aria-pressed", String(!!v));
    soundBtn.classList.toggle("is-on", v);
    if (persist) { try { localStorage.setItem("ab-sound", v ? "1" : "0"); } catch {} }
    if (master) master.gain.linearRampToValueAtTime(v ? 0.9 : 0, (AC?.currentTime || 0) + 0.7);
  };
  soundBtn.addEventListener("click", () => setOn(!soundOn));
  /* stored "on" arms on the first gesture anywhere */
  let pref = null;
  try { pref = localStorage.getItem("ab-sound"); } catch {}
  if (pref === "1") {
    soundBtn.classList.add("is-armed");
    addEventListener("pointerdown", function arm() {
      removeEventListener("pointerdown", arm);
      soundBtn.classList.remove("is-armed");
      setOn(true, false);
    }, { once: true });
  }
  /* hook points */
  const NOTES = [587.33, 739.99, 880]; // D5 / F#5 / A5 — one per channel
  document.querySelectorAll(".ab-row[data-ch]").forEach((row) => {
    row.addEventListener("pointerenter", () => blip(NOTES[Number(row.dataset.ch)] || 660, 0.09));
  });
  document.querySelectorAll(".ab-rail__dot").forEach((d, i) => {
    d.addEventListener("click", () => blip(392 + i * 49, 0.08, 0.14));
  });
  document.querySelectorAll(".ab-cta__btn").forEach((b) => {
    b.addEventListener("pointerenter", () => blip(987.77, 0.06, 0.08));
  });
  addEventListener("ab:chapter", whoosh);
}

/* ------------------------------------------------------------
   WebGL world — desktop, motion-ok
   ------------------------------------------------------------ */
const canvas = document.getElementById("aboutfx");
if (!canvas || reduced || innerWidth < 680) {
  document.body.classList.add("about-no3d");
} else {
  const boot = () => {
    try { start(); }
    catch (err) { console.warn("[aboutfx] 3D disabled:", err); document.body.classList.add("about-no3d"); }
  };
  /* wait briefly for fonts so the "3:14" glyph sampling uses JetBrains Mono */
  Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 900))]).then(boot, boot);
}

function start() {
  const MID = innerWidth < 1100 || matchMedia("(pointer: coarse)").matches;
  const DPR = Math.min(devicePixelRatio || 1, MID ? 1.25 : 1.5);
  const N = MID ? 26000 : 62000;
  let W = innerWidth, H = innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H);
  renderer.setClearColor(0x05060b, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05060b, 20, 46);
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 90);
  camera.position.set(0, 0.2, 19.5);

  /* deep navy backdrop + faint diagonal light shaft */
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 90),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        void main() {
          vec3 deep = vec3(0.020, 0.024, 0.043);
          vec3 edge = vec3(0.008, 0.009, 0.016);
          float r = distance(vUv, vec2(0.5, 0.42));
          vec3 c = mix(deep, edge, smoothstep(0.12, 0.75, r));
          /* diagonal volumetric shaft, slowly breathing */
          float sh = smoothstep(0.30, 0.0, abs((vUv.y - 0.18) - (vUv.x - 0.30) * 0.55));
          c += vec3(0.030, 0.036, 0.052) * sh * (0.55 + 0.45 * sin(uTime * 0.10));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  backdrop.position.z = -34;
  scene.add(backdrop);

  /* ============================================================
     FORMATIONS — six targets the field morphs between.
     Each is N points of [x, y, z, hue] where hue∈[0,2] indexes
     the lime→magenta→cyan ramp.
     ============================================================ */
  const rand = () => Math.random();
  const spread = (s) => (rand() - 0.5) * s;
  const gauss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));

  /* F0 — ECG heartbeat waveform, the studio's pulse */
  const ecgY = (x) => {
    const u = ((x % 11) + 11) % 11;
    return Math.sin(x * 0.5) * 0.16
      + gauss(u, 2.2, 0.45) * 0.5
      - gauss(u, 4.35, 0.13) * 0.9
      + gauss(u, 4.8, 0.17) * 3.3
      - gauss(u, 5.3, 0.15) * 1.15
      + gauss(u, 7.2, 0.62) * 0.72;
  };
  const fECG = (arr, i) => {
    const t = i / N;
    const x = t * 46 - 23 + spread(0.15);
    const th = (rand() + rand() + rand() - 1.5) * 0.42; // soft gaussian thickness
    arr[i * 4] = x;
    arr[i * 4 + 1] = ecgY(x) + th;
    arr[i * 4 + 2] = spread(2.2);
    arr[i * 4 + 3] = 0.06 + Math.abs(ecgY(x)) * 0.05; // lime, spikes barely warmer
  };

  /* F1 — one dense core + a thin tilted orbit (one person, whole stack) */
  const fSPHERE = (arr, i) => {
    if (i % 8 === 0) { // orbit ring
      const a = rand() * Math.PI * 2;
      const r = 7.4 + spread(0.25);
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.62;
      const y = Math.sin(a) * 1.9 + spread(0.18);
      arr[i * 4] = x; arr[i * 4 + 1] = y; arr[i * 4 + 2] = z;
      arr[i * 4 + 3] = 2.0; // cyan orbit
    } else { // fibonacci-ish core
      const k = i / N;
      const y = 1 - k * 2;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * 2.39996;
      const r = 4.4 * (0.72 + 0.28 * Math.cbrt(rand()));
      arr[i * 4] = Math.cos(th) * rr * r;
      arr[i * 4 + 1] = y * r;
      arr[i * 4 + 2] = Math.sin(th) * rr * r;
      arr[i * 4 + 3] = 0.0 + rand() * 0.12; // lime core
    }
  };

  /* F2 — three braided channel strands (AXON / Stackime / Log) */
  const fSTRANDS = (arr, i) => {
    const k = i % 3;
    const t = (Math.floor(i / 3) / (N / 3));
    const x = t * 40 - 20 + spread(0.1);
    const ph = k * 2.094;
    const off = (k - 1) * 3.1;
    arr[i * 4] = x;
    arr[i * 4 + 1] = off + Math.sin(x * 0.34 + ph) * 1.25 + (rand() + rand() - 1) * 0.30;
    arr[i * 4 + 2] = Math.cos(x * 0.29 + ph) * 1.25 + (rand() + rand() - 1) * 0.30;
    arr[i * 4 + 3] = k; // exact channel hue
  };

  /* text/path sampling helper — rasterize then pull filled pixels */
  const samplePts = (draw, w, h) => {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    draw(cx);
    const data = cx.getImageData(0, 0, w, h).data;
    const pts = [];
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 110) pts.push([x / w - 0.5, 0.5 - y / h]);
    }
    return pts;
  };

  /* F3 — "3:14" — the minute the studio started */
  const pts314 = samplePts((cx) => {
    cx.font = '700 118px "JetBrains Mono", ui-monospace, monospace';
    cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillStyle = "#fff";
    cx.fillText("3:14", 320, 84);
  }, 640, 160);
  const fTIME = (arr, i) => {
    const p = pts314.length ? pts314[i % pts314.length] : [spread(0.5), spread(0.2)];
    arr[i * 4] = p[0] * 17.5 + spread(0.14);
    arr[i * 4 + 1] = p[1] * 4.4 + spread(0.14);
    arr[i * 4 + 2] = spread(1.1);
    arr[i * 4 + 3] = 1.0 + spread(0.1); // magenta — the alarm
  };

  /* F4 — ordered lattice (structure, guardrails) */
  const side = Math.floor(Math.cbrt(N));
  const fLATTICE = (arr, i) => {
    const j = i % (side * side * side);
    const x = j % side, y = Math.floor(j / side) % side, z = Math.floor(j / (side * side));
    const s = 11.4 / side;
    arr[i * 4] = (x - side / 2) * s + spread(0.03);
    arr[i * 4 + 1] = (y - side / 2) * s + spread(0.03);
    arr[i * 4 + 2] = (z - side / 2) * s - 1.5 + spread(0.03);
    arr[i * 4 + 3] = 1.85 + spread(0.15); // cool cyan order
  };

  /* F5 — the ∿ pulse mark, carrying the full spectrum */
  const ptsMark = samplePts((cx) => {
    cx.lineWidth = 30; cx.lineJoin = "round"; cx.lineCap = "round";
    cx.strokeStyle = "#fff";
    cx.save(); cx.translate(60, 60); cx.scale(18, 18);
    cx.beginPath();
    cx.moveTo(2, 14); cx.lineTo(7, 14); cx.lineTo(10, 7); cx.lineTo(16, 21); cx.lineTo(19, 14); cx.lineTo(26, 14);
    cx.stroke(); cx.restore();
  }, 640, 400);
  const fMARK = (arr, i) => {
    const p = ptsMark.length ? ptsMark[i % ptsMark.length] : [spread(0.5), spread(0.3)];
    arr[i * 4] = p[0] * 20 + spread(0.13);
    arr[i * 4 + 1] = p[1] * 12.5 + 0.4 + spread(0.13);
    arr[i * 4 + 2] = spread(1.2);
    arr[i * 4 + 3] = (p[0] + 0.5) * 2.0; // spectrum sweep across the mark
  };

  const builders = [fECG, fSPHERE, fSTRANDS, fTIME, fLATTICE, fMARK];
  const targets = builders.map((fn) => {
    const arr = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) fn(arr, i);
    return arr;
  });

  /* ---- particle geometry: position = F0, five morph attributes ---- */
  const geo = new THREE.BufferGeometry();
  const pos0 = new Float32Array(N * 3);
  const hue0 = new Float32Array(N);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos0[i * 3] = targets[0][i * 4];
    pos0[i * 3 + 1] = targets[0][i * 4 + 1];
    pos0[i * 3 + 2] = targets[0][i * 4 + 2];
    hue0[i] = targets[0][i * 4 + 3];
    seed[i] = rand();
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos0, 3));
  geo.setAttribute("aH0", new THREE.BufferAttribute(hue0, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  for (let f = 1; f < 6; f++) geo.setAttribute(`aT${f}`, new THREE.BufferAttribute(targets[f], 4));

  const uniforms = {
    uTime: { value: 0 },
    uPx: { value: DPR },
    uBoot: { value: 0 },
    uFa: { value: 0 },       // formation A index
    uFb: { value: 0 },       // formation B index
    uProg: { value: 0 },     // morph progress A→B
    uKick: { value: 0 },     // scroll-velocity turbulence
    uFocus: { value: 17 },   // DOF focal distance
    uPtr: { value: new THREE.Vector3(999, 999, 0) },
    uEx: { value: new THREE.Vector3(0, 0, 0) }, // per-channel excitation
  };

  const morphChunk = /* glsl */ `
    attribute float aH0, aSeed;
    attribute vec4 aT1, aT2, aT3, aT4, aT5;
    uniform float uFa, uFb, uProg;
    vec4 pickTarget(float k) {
      if (k < 0.5) return vec4(position, aH0);
      if (k < 1.5) return aT1;
      if (k < 2.5) return aT2;
      if (k < 3.5) return aT3;
      if (k < 4.5) return aT4;
      return aT5;
    }`;

  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: morphChunk + /* glsl */ `
      uniform float uTime, uPx, uBoot, uKick, uFocus;
      uniform vec3 uPtr, uEx;
      varying float vA, vHue, vSeed;

      vec3 curl(vec3 p) {
        float t = uTime * 0.14;
        return vec3(
          sin(p.y * 0.42 + t) + cos(p.z * 0.36 - t * 1.3),
          sin(p.z * 0.39 - t * 0.8) + cos(p.x * 0.34 + t),
          sin(p.x * 0.41 + t * 1.1) + cos(p.y * 0.37 - t)
        );
      }

      void main() {
        vec4 A = pickTarget(uFa);
        vec4 B = pickTarget(uFb);

        /* per-particle staggered flight with mid-flight swarm */
        float d = 0.42;
        float e0 = clamp((uProg - aSeed * d) / (1.0 - d), 0.0, 1.0);
        float e = e0 * e0 * (3.0 - 2.0 * e0);
        float flight = sin(e * 3.14159);

        vec3 p = mix(A.xyz, B.xyz, e);
        float hue = mix(A.w, B.w, e);

        /* turbulence: gentle idle, strong mid-flight, scroll kick */
        p += curl(p * 0.16 + aSeed * 6.2831) * (0.30 + flight * 2.3 + uKick * 1.1) * (0.6 + aSeed * 0.8);
        p.y += sin(uTime * (0.25 + aSeed * 0.35) + aSeed * 40.0) * 0.22;

        /* pointer repulsion — swirl away from the cursor */
        vec3 dp = p - uPtr;
        float dist = length(dp.xy);
        float push = smoothstep(4.2, 0.0, dist);
        p.xy += normalize(dp.xy + 0.0001) * push * 2.4;
        p.z += push * 1.1;

        /* channel excitation (work-row hover) */
        float ex = uEx.x * smoothstep(0.5, 0.15, abs(hue - 0.0))
                 + uEx.y * smoothstep(0.5, 0.15, abs(hue - 1.0))
                 + uEx.z * smoothstep(0.5, 0.15, abs(hue - 2.0));

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dep = -mv.z;

        /* depth-of-field: blur = distance from focal plane.
           alpha falls with coc² so defocus dims instead of glowing. */
        float coc = abs(dep - uFocus) / max(6.0, uFocus);
        float size = (0.9 + aSeed * 2.1) * (1.0 + coc * 2.0) * (1.0 + ex * 0.8 + push * 0.7);
        gl_PointSize = clamp(size * uPx * (17.0 / max(1.0, dep)) * 1.7, 1.0, 24.0);

        float tw = 0.5 + 0.5 * sin(uTime * (0.4 + aSeed) + aSeed * 30.0);
        vA = (0.05 + 0.24 * tw) * uBoot / (1.0 + coc * coc * 9.0) * (1.0 + ex * 1.6 + push * 1.2 + flight * 0.4);
        vHue = hue;
        vSeed = aSeed;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uEx;
      varying float vA, vHue, vSeed;
      vec3 ramp(float h) {
        vec3 lime = vec3(0.722, 1.0, 0.235);
        vec3 mag  = vec3(1.0, 0.310, 0.639);
        vec3 cyan = vec3(0.310, 0.769, 1.0);
        return h < 1.0 ? mix(lime, mag, smoothstep(0.0, 1.0, h))
                       : mix(mag, cyan, smoothstep(1.0, 2.0, h));
      }
      void main() {
        float d = length(gl_PointCoord - 0.5);
        vec3 col = ramp(clamp(vHue, 0.0, 2.0));
        col = mix(col, vec3(0.82, 0.86, 0.92), 0.10);           /* premium desaturation */
        col = mix(col, vec3(1.0), smoothstep(0.20, 0.0, d) * 0.28); /* hot core */
        gl_FragColor = vec4(col, smoothstep(0.5, 0.04, d) * vA);
      }`,
  }));
  points.frustumCulled = false;
  scene.add(points);

  /* ---- bokeh dust — big soft out-of-focus motes for depth ---- */
  const DN = MID ? 260 : 460;
  const dgeo = new THREE.BufferGeometry();
  const dpos = new Float32Array(DN * 3);
  const dseed = new Float32Array(DN);
  for (let i = 0; i < DN; i++) {
    dpos[i * 3] = spread(64);
    dpos[i * 3 + 1] = spread(36);
    dpos[i * 3 + 2] = -14 + rand() * 30;
    dseed[i] = rand();
  }
  dgeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute("aSeed", new THREE.BufferAttribute(dseed, 1));
  const dustU = { uTime: { value: 0 }, uPx: { value: DPR }, uFocus: { value: 17 }, uBoot: { value: 0 } };
  const dust = new THREE.Points(dgeo, new THREE.ShaderMaterial({
    uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uPx, uFocus, uBoot;
      varying float vA, vSeed;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.05 + aSeed * 20.0) * 2.4;
        p.y += cos(uTime * 0.04 + aSeed * 16.0) * 1.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dep = -mv.z;
        float coc = abs(dep - uFocus) / max(6.0, uFocus);
        gl_PointSize = clamp((3.0 + aSeed * 9.0) * (0.6 + coc * 2.6) * uPx * (17.0 / max(1.0, dep)) * 1.7, 2.0, 54.0);
        vA = (0.010 + aSeed * 0.028) / (1.0 + coc * coc * 2.4) * uBoot;
        vSeed = aSeed;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA, vSeed;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        vec3 col = mix(vec3(0.55, 0.66, 0.9), vec3(0.75, 0.95, 0.7), step(0.6, vSeed));
        gl_FragColor = vec4(col, smoothstep(0.5, 0.18, d) * vA);
      }`,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  /* ---- hero artifact — iridescent signal ring ---- */
  const ringU = { uTime: { value: 0 }, uOp: { value: 0 } };
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.1, 0.10, 26, 220),
    new THREE.ShaderMaterial({
      uniforms: ringU, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vN, vV, vP;
        void main() {
          vN = normalMatrix * normal;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = -mv.xyz; vP = position;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uOp;
        varying vec3 vN, vV, vP;
        vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.00, 0.33, 0.67))); }
        void main() {
          float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
          vec3 irid = pal(fr * 0.85 + vP.x * 0.05 + vP.y * 0.04 + uTime * 0.03);
          vec3 col = mix(vec3(0.06, 0.07, 0.10), irid, 0.30 + fr * 0.7);
          gl_FragColor = vec4(col, (0.16 + fr * 0.9) * uOp);
        }`,
    })
  );
  ring.position.set(0, 0.3, -4.5);
  ring.rotation.set(0.5, 0, -0.35);
  scene.add(ring);

  /* ---- hero instrument core — a breathing thin-film heart inside
     the ring. Vertex noise makes it inhale; pointing at it sends a
     ripple across the surface (uHit, no raycaster — NDC proximity). ---- */
  const coreU = { uTime: { value: 0 }, uOp: { value: 0 }, uHit: { value: 0 } };
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.55, MID ? 24 : 48),
    new THREE.ShaderMaterial({
      uniforms: coreU, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime, uHit;
        varying vec3 vN, vV; varying float vD;
        float n3(vec3 p) {
          return sin(p.x * 2.1 + uTime * 0.6) * sin(p.y * 2.4 - uTime * 0.5) * sin(p.z * 2.2 + uTime * 0.7);
        }
        void main() {
          vec3 p = position;
          float breathe = n3(normalize(position) * 2.0) * 0.14;
          float ripple = sin(length(position.xy) * 9.0 - uTime * 6.0) * uHit * 0.10;
          vD = breathe + ripple;
          p += normal * (breathe + ripple);
          vN = normalMatrix * normal;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uOp, uHit;
        varying vec3 vN, vV; varying float vD;
        vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.00, 0.33, 0.67))); }
        void main() {
          float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          /* thin-film: hue drifts with incidence + displacement + time */
          vec3 film = pal(fr * 0.9 + vD * 1.6 + uTime * 0.02);
          vec3 col = mix(vec3(0.04, 0.05, 0.08), film, 0.16 + fr * 0.84);
          col += film * uHit * 0.25;
          gl_FragColor = vec4(col, (0.05 + fr * 0.85) * uOp);
        }`,
    })
  );
  core.position.copy(ring.position);
  scene.add(core);

  /* ---- in-world typography — giant SDF ghost numerals (troika)
     standing at each chapter's camera stop: content IN the world,
     not wallpaper behind it. Outlined, nearly transparent, fogged
     and DOF'd like everything else. Fully optional: any failure
     leaves the page identical minus the numerals. ---- */
  const FONT_URL = "/assets/fonts/ClashDisplay-700.woff";
  const glyphs = []; // { obj, ch, base, amp }
  /* `at` = chapter-progress value where the camera actually RESTS on
     that chapter (the progress probe sits 42% down the viewport, so
     rest ≈ ch + 0.0 after offsetting; the last chapter never passes
     ~4.6). Numerals fade in around `at`, so nothing bleeds into the
     hero or neighbouring chapters. */
  const TYPE_KEYS = [
    { s: "01", at: 1.0, p: [-4.6, 3.1, -7.5], ry: 0.14, fs: 6.2 },
    { s: "02", at: 2.0, p: [-7.6, 3.3, -8.5], ry: 0.10, fs: 6.8 },
    { s: "03", at: 3.0, p: [-6.0, -2.4, -6.5], ry: 0.16, fs: 5.8 },
    { s: "04", at: 4.0, p: [-3.2, 3.4, -9.0], ry: 0.10, fs: 6.6 },
    { s: "05", at: 4.6, p: [-8.4, 1.6, -10.0], ry: 0.12, fs: 6.4 },
  ];
  try {
    preloadFont({ font: FONT_URL, characters: "0123456789" }, () => {
      try {
        TYPE_KEYS.forEach((k) => {
          const t = new Text();
          t.font = FONT_URL;
          t.text = k.s;
          t.fontSize = k.fs;
          t.anchorX = "center"; t.anchorY = "middle";
          t.letterSpacing = -0.03;
          t.color = 0xcfe0ee;
          t.fillOpacity = 0.030;
          t.strokeColor = 0xdbe9f8;
          t.strokeOpacity = 0.34;
          t.strokeWidth = "0.55%";
          t.position.set(...k.p);
          t.rotation.y = k.ry;
          t.material.depthWrite = false;
          t.fillOpacity = 0;
          t.strokeOpacity = 0;
          t.visible = false;
          const entry = { obj: t, at: k.at, base: k.p.slice(), amp: 0.4 + Math.random() * 0.5, k: 0, ready: false };
          glyphs.push(entry);
          t.sync(() => {
            entry.ready = true;
            document.body.classList.add("ab-type-on");
          });
          scene.add(t);
        });
      } catch (e) { console.warn("[aboutfx] in-world type disabled:", e); }
    });
  } catch (e) { console.warn("[aboutfx] font preload failed:", e); }

  /* ---- post: bloom → tone → MASTER GRADE ----
     The grade is the "look": it turns a bright particle field in a void
     into content living inside a crafted, filmic room. Procedural, no
     textures, GLSL1 (gl_FragColor) so it runs on the swiftshader base
     pipeline like the rest. Folds, in one fullscreen pass:
       · chromatic aberration (edge + pointer-velocity + transition warp)
       · pointer WAKE ripple (a fluid-trail signature without a float FBO)
       · velocity section-transition wave warp
       · cnoise corner hue-glow tinted to the active channel (the "room")
       · filmic split-tone (cool shadows / warm highs) + contrast
       · vignette + film grain
       · uContact breathing zoom
     Adapted from activetheory.net's master composite (their shader #113). */
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), 0.30, 0.62, 0.72);

  /* fluid pointer trail — a tiny 2D canvas accumulates a fading wake,
     uploaded as a texture every frame (128², negligible even on
     software GL). The grade pass warps the image along the trail's
     gradient, which reads as AT's fluid sim without a float FBO. */
  const TS = 128;
  const trailCv = document.createElement("canvas");
  trailCv.width = trailCv.height = TS;
  const trailCx = trailCv.getContext("2d");
  trailCx.fillStyle = "#000";
  trailCx.fillRect(0, 0, TS, TS);
  const trailTex = new THREE.CanvasTexture(trailCv);
  trailTex.minFilter = THREE.LinearFilter;
  trailTex.magFilter = THREE.LinearFilter;
  trailTex.generateMipmaps = false;

  const gradeUniforms = {
    tDiffuse: { value: null },
    tTrail: { value: trailTex },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(W * DPR, H * DPR) },
    uAberration: { value: 0.0 },
    uWarp: { value: 0.0 },
    uVignette: { value: 1.0 },
    uGrain: { value: 0.085 },
    uMouse: { value: new THREE.Vector4(0.5, 0.5, 0, 0) }, // xy uv, zw velocity
    uContact: { value: 0.0 },
    uTint: { value: new THREE.Color(0.42, 0.62, 0.32) },
  };
  /* NOTE: ShaderPass CLONES the uniforms of a plain shader object —
     every loop write (uTime/uWarp/uTint/uMouse/tTrail…) would hit a
     dead copy and the grade would freeze at boot values. A real
     ShaderMaterial is adopted by reference instead. */
  const gradePass = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: gradeUniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tDiffuse;
      uniform sampler2D tTrail;
      uniform float uTime, uAberration, uWarp, uVignette, uGrain, uContact;
      uniform vec2 uResolution;
      uniform vec4 uMouse;
      uniform vec3 uTint;
      varying vec2 vUv;

      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      /* AT-style flowing sine noise for the corner glow */
      float cnoise(vec2 v){
        float t = v.x * 0.3; v.y *= 0.8; float n = 0.0; float s = 0.5;
        n += (sin(v.x * 0.9 / s + t * 4.0) + sin(v.x * 2.4 / s) + sin(v.x * -3.5 / s + t * 2.0)) * 0.3;
        n += (sin(v.y * -0.3 / s + t * 3.0) + sin(v.y * 1.6 / s) + sin(v.y * 2.6 / s - t)) * 0.3;
        return n;
      }
      vec3 rgbSplit(vec2 uv, vec2 dir, float amt){
        return vec3(texture2D(tDiffuse, uv + dir * amt).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir * amt).b);
      }
      void main(){
        vec2 uv = vUv;
        vec2 c = uv - 0.5;
        float aspect = uResolution.x / uResolution.y;

        /* breathing zoom — the world inhales on scroll energy */
        uv = 0.5 + c * (1.0 - uContact * 0.035);

        /* fluid trail — warp along the gradient of the accumulated
           pointer wake, plus a tight ripple at the cursor itself. The
           trail is a plain byte texture, so it survives software GL. */
        float tr = texture2D(tTrail, vUv).r;
        float px = 1.0 / 128.0;
        vec2 tg = vec2(
          texture2D(tTrail, vUv + vec2(px, 0.0)).r - texture2D(tTrail, vUv - vec2(px, 0.0)).r,
          texture2D(tTrail, vUv + vec2(0.0, px)).r - texture2D(tTrail, vUv - vec2(0.0, px)).r);
        uv += tg * 0.022;
        vec2 md = (uv - uMouse.xy) * vec2(aspect, 1.0);
        float mdist = length(md);
        float mvel = length(uMouse.zw);
        float ripple = sin(mdist * 40.0 - uTime * 7.0) * exp(-mdist * 8.0) * mvel;
        uv += normalize((uv - uMouse.xy) + 1e-4) * ripple * 0.03;

        /* section-transition wave warp — scroll velocity + chapter hand-off */
        uv.x += sin(uv.y * 11.0 + uTime * 3.2) * 0.006 * uWarp;
        uv.y += cos(uv.x * 8.0 - uTime * 2.4) * 0.004 * uWarp;

        /* chromatic aberration — grows to the edges, kicked by motion
           and split harder inside the fluid wake */
        float edge = dot(c, c);
        float amt = uAberration * 0.0018 + edge * 0.0024 + uWarp * 0.005 + mvel * 0.03 + tr * 0.0035;
        vec2 dir = normalize(c + 1e-4);
        vec3 col = rgbSplit(uv, dir, amt);

        /* the wake itself faintly luminesces in the channel tint */
        col += uTint * tr * 0.045;

        /* corner hue-glow — cnoise-modulated, tinted to the active channel.
           This is what makes it read as a lit room instead of a black void. */
        float g = 0.5 + 0.5 * cnoise(c * 3.2 + uTime * 0.05);
        float corner = smoothstep(0.16, 0.95, length(c) * 1.32);
        col += uTint * pow(corner * g, 2.0) * 0.20;

        /* filmic split-tone + gentle contrast */
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, col * vec3(0.90, 0.97, 1.14), (1.0 - lum) * 0.28); // cool shadows
        col = mix(col, col * vec3(1.07, 1.0, 0.90), lum * 0.20);          // warm highlights
        col = (col - 0.5) * 1.065 + 0.5;

        /* vignette */
        float vig = smoothstep(1.18, 0.32, length(c) * 1.3);
        col *= mix(1.0, vig, uVignette);

        /* film grain — overlay, animated */
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

  /* per-chapter corner-glow tints + bloom energy (AT tunes bloom per scene:
     home 3.82, work 0.5, contact 0.8 — we stay tasteful but do vary it). */
  const CH_TINT = [
    new THREE.Color(0.55, 0.72, 0.38), // manifesto — lime-white
    new THREE.Color(0.72, 1.00, 0.24), // who — lime
    new THREE.Color(0.62, 0.60, 0.85), // work — lime↔magenta↔cyan blend
    new THREE.Color(1.00, 0.31, 0.64), // origin — magenta (the alarm)
    new THREE.Color(0.31, 0.77, 1.00), // principles — cyan (cool order)
    new THREE.Color(0.66, 0.78, 0.62), // contact — full spectrum, calm
  ];
  const CH_BLOOM = [0.46, 0.34, 0.30, 0.40, 0.32, 0.44];
  const tintTmp = new THREE.Color();
  let warpState = 0, contactState = 0, rollState = 0, prevChapter = 0, chapterPulse = 0;

  /* ---- camera rig: per-chapter keyframes, Catmull-Rom travel ---- */
  /* lookAt.x biased positive on copy chapters so the formation sits
     left on screen while the text column reads on the right */
  const KEYS = [
    { p: [0.0, 0.2, 17.5], l: [0.0, 0.0, 0.0], f: 50 },  // manifesto — wave + ring, centered
    { p: [3.2, -0.4, 15.2], l: [2.4, 0.1, 0.0], f: 50 }, // who — core left, three-quarter
    { p: [0.0, -1.1, 16.2], l: [0.0, -0.3, 0.0], f: 52 },// work — strands wide behind rows
    { p: [-1.6, 0.4, 16.4], l: [1.8, 0.3, 0.0], f: 47 }, // origin — 3:14 off-axis left
    { p: [1.5, 1.5, 17.2], l: [2.2, 0.4, 0.0], f: 50 },  // principles — lattice left, high
    { p: [0.0, 0.1, 15.2], l: [0.0, 0.3, 0.0], f: 48 },  // contact — the mark, centered
  ];
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.p)), false, "centripetal", 0.4);
  const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.l)), false, "centripetal", 0.4);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const curPos = new THREE.Vector3(...KEYS[0].p), curLook = new THREE.Vector3(...KEYS[0].l);

  /* pointer → world + parallax + grade wake */
  const ptrTarget = new THREE.Vector3(999, 999, 0);
  const mouseUV = new THREE.Vector2(0.5, 0.5);      // smoothed pointer in uv space
  const mouseTargetUV = new THREE.Vector2(0.5, 0.5);
  let pxN = 0, pyN = 0;
  if (hoverFine) {
    addEventListener("pointermove", (e) => {
      pxN = (e.clientX / W) * 2 - 1;
      pyN = -(e.clientY / H) * 2 + 1;
      mouseTargetUV.set(e.clientX / W, 1 - e.clientY / H);
      const vh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.length();
      ptrTarget.set(pxN * vh * camera.aspect * 0.9, pyN * vh * 0.9, 0);
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => ptrTarget.set(999, 999, 0));
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

  /* boot-in once the loader releases */
  /* boot opacities live OUTSIDE the uniforms: the loop composes
     uniform = boot × scroll-fade every frame. (Writing the product
     back into the same uniform decays it exponentially — the v2 bug
     that silently killed the hero ring.) */
  const bootState = { ring: 0, core: 0 };
  addEventListener("ab:hero", () => {
    gsap.to(uniforms.uBoot, { value: 1, duration: 1.8, ease: "power2.out" });
    gsap.to(dustU.uBoot, { value: 1, duration: 2.2, ease: "power2.out" });
    gsap.to(bootState, { ring: 1, duration: 2.0, ease: "power2.out", delay: 0.2 });
    gsap.to(bootState, { core: 1, duration: 2.4, ease: "power2.out", delay: 0.45 });
  }, { once: true });
  if (document.body.classList.contains("ab-in")) { // loader already gone (reduced/fallback)
    uniforms.uBoot.value = 1; dustU.uBoot.value = 1; bootState.ring = 1; bootState.core = 1;
  }

  /* ---- adaptive quality governor — award-tier means 60fps on the
     machine actually in front of us. A frame-time EMA steps the
     render scale down (and back up) with hysteresis + cooldown. ---- */
  const QCAPS = MID ? [1.25, 1.0, 0.8] : [1.5, 1.15, 0.9];
  let qIdx = 0, emaMs = 16.7, qCooldown = 120, lastT = 0, dprNow = DPR;
  const applyQ = () => {
    dprNow = Math.min(devicePixelRatio || 1, QCAPS[qIdx]);
    renderer.setPixelRatio(dprNow);
    composer.setPixelRatio(dprNow);
    renderer.setSize(W, H);
    composer.setSize(W, H);
    uniforms.uPx.value = dprNow;
    dustU.uPx.value = dprNow;
    gradeUniforms.uResolution.value.set(W * dprNow, H * dprNow);
  };
  const governQuality = (t) => {
    const dt = Math.min(100, (t - lastT) * 1000);
    lastT = t;
    if (dt <= 0) return;
    emaMs += (dt - emaMs) * 0.05;
    if (--qCooldown > 0) return;
    if (emaMs > 30 && qIdx < QCAPS.length - 1) { qIdx++; applyQ(); qCooldown = 240; }
    else if (emaMs < 17 && qIdx > 0) { qIdx--; applyQ(); qCooldown = 420; }
  };

  /* trail brush state */
  let trailPX = -1, trailPY = -1;

  const F = KEYS.length - 1;
  const ex = new THREE.Vector3();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (hidden) return;
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    dustU.uTime.value = t;
    ringU.uTime.value = t;
    coreU.uTime.value = t;
    backdrop.material.uniforms.uTime.value = t;
    governQuality(t);

    /* chapter progress drives formation + camera */
    const cp = Math.min(F, Math.max(0, chapterProgress()));
    const fa = Math.min(F - 0, Math.floor(cp));
    const frac = cp - fa;
    uniforms.uFa.value = fa;
    uniforms.uFb.value = Math.min(F, fa + 1);
    uniforms.uProg.value = frac * frac * (3 - 2 * frac); // eased hand-off

    /* camera travel + pointer parallax + wobble */
    posCurve.getPoint(cp / F, camPos);
    lookCurve.getPoint(cp / F, camLook);
    camPos.x += pxN * 0.55 + Math.sin(t * 0.35) * 0.10;
    camPos.y += pyN * 0.35 + Math.cos(t * 0.28) * 0.07;
    camPos.z += (1 - uniforms.uBoot.value) * 2.6; // boot dolly-in
    curPos.lerp(camPos, 0.055);
    curLook.lerp(camLook, 0.055);
    camera.position.copy(curPos);
    camera.lookAt(curLook);
    /* confident camera language: bank into scroll velocity + idle sway */
    rollState += (gsap.utils.clamp(-0.05, 0.05, scrollVel * 0.006) - rollState) * 0.06;
    camera.rotateZ(rollState + Math.sin(t * 0.18) * 0.006);
    const fv = KEYS[fa].f + (KEYS[Math.min(F, fa + 1)].f - KEYS[fa].f) * frac;
    if (Math.abs(camera.fov - fv) > 0.01) { camera.fov += (fv - camera.fov) * 0.06; camera.updateProjectionMatrix(); }

    /* focus follows the world center */
    const focus = curPos.length();
    uniforms.uFocus.value += (focus - uniforms.uFocus.value) * 0.05;
    dustU.uFocus.value = uniforms.uFocus.value;

    /* scroll-velocity turbulence */
    uniforms.uKick.value += (Math.min(1.6, Math.abs(scrollVel) * 0.08) - uniforms.uKick.value) * 0.07;

    /* work-row hover excitation */
    ex.set(hoverCh === 0 ? 1 : 0, hoverCh === 1 ? 1 : 0, hoverCh === 2 ? 1 : 0);
    uniforms.uEx.value.lerp(ex, 0.08);

    /* ring + core live in the hero, rise away after */
    const heroBlend = Math.min(1, cp);
    ring.rotation.z = -0.35 + t * 0.05;
    ring.rotation.x = 0.5 + Math.sin(t * 0.22) * 0.06;
    ring.position.y = 0.3 + heroBlend * 9;
    ringU.uOp.value = bootState.ring * (1 - heroBlend);
    ring.visible = ringU.uOp.value > 0.005;
    core.position.set(ring.position.x, ring.position.y, ring.position.z);
    core.rotation.y = t * 0.14;
    core.rotation.x = Math.sin(t * 0.1) * 0.2;
    const coreVis = Math.max(0, 1 - heroBlend * 1.4);
    core.visible = coreVis > 0.01;
    coreU.uOp.value = bootState.core * coreVis;
    /* pointer proximity → surface ripple (NDC distance, no raycast) */
    if (core.visible && hoverFine) {
      const ndc = core.position.clone().project(camera);
      const hd = Math.hypot(ndc.x - pxN, ndc.y - pyN);
      coreU.uHit.value += (Math.max(0, 1 - hd * 2.6) - coreU.uHit.value) * 0.09;
    }

    /* in-world numerals — fade with chapter proximity, drift, parallax.
       IMPORTANT: troika strokes ignore material.opacity — the fade must
       drive fillOpacity/strokeOpacity (uniform-only updates, no relayout). */
    const cpEff = cp - 0.42; // progress probe sits 42% down the viewport
    for (const g of glyphs) {
      if (!g.ready) continue;
      /* slope 2.6 → lit ±0.38 chapters, so neighbouring numerals never
         stack mid-transition; cubed ease keeps the tail invisible */
      const prox = Math.max(0, 1 - Math.abs(cpEff - g.at) * 2.6);
      g.k += (prox * prox * prox - g.k) * 0.09;
      g.obj.visible = g.k > 0.01;
      if (!g.obj.visible) continue;
      g.obj.fillOpacity = 0.030 * g.k;
      g.obj.strokeOpacity = 0.34 * g.k;
      g.obj.position.y = g.base[1] + Math.sin(t * 0.3 + g.at * 2.1) * 0.22 * g.amp;
      g.obj.position.x = g.base[0] + pxN * -0.4;
      g.obj.rotation.y = Math.sin(t * 0.12 + g.at) * 0.04 + 0.1;
    }

    /* pointer wake: smooth uv, derive per-frame velocity */
    const mvx = mouseTargetUV.x - mouseUV.x, mvy = mouseTargetUV.y - mouseUV.y;
    mouseUV.x += mvx * 0.18; mouseUV.y += mvy * 0.18;
    const gm = gradeUniforms.uMouse.value;
    gm.x = mouseUV.x; gm.y = mouseUV.y;
    gm.z = mvx * 0.18; gm.w = mvy * 0.18;

    /* fluid trail — fade the wake, brush the smoothed pointer in */
    trailCx.fillStyle = "rgba(0,0,0,0.08)";
    trailCx.fillRect(0, 0, TS, TS);
    if (hoverFine) {
      const gx = mouseUV.x * TS, gy = (1 - mouseUV.y) * TS;
      const gvel = Math.hypot(gm.z, gm.w);
      if (trailPX < 0) { trailPX = gx; trailPY = gy; }
      const steps = Math.max(1, Math.ceil(Math.hypot(gx - trailPX, gy - trailPY) / 3));
      const a = Math.min(0.55, 0.10 + gvel * 26);
      const rad = 7 + Math.min(16, gvel * 320);
      for (let s = 1; s <= steps; s++) {
        const ix = trailPX + ((gx - trailPX) * s) / steps;
        const iy = trailPY + ((gy - trailPY) * s) / steps;
        const grd = trailCx.createRadialGradient(ix, iy, 0, ix, iy, rad);
        grd.addColorStop(0, `rgba(255,255,255,${a})`);
        grd.addColorStop(1, "rgba(255,255,255,0)");
        trailCx.fillStyle = grd;
        trailCx.beginPath();
        trailCx.arc(ix, iy, rad, 0, 6.2832);
        trailCx.fill();
      }
      trailPX = gx; trailPY = gy;
    }
    trailTex.needsUpdate = true;

    uniforms.uPtr.value.lerp(ptrTarget, 0.08);

    /* ---- master grade wiring ---- */
    const chNow = Math.round(cp);
    if (chNow !== prevChapter) { chapterPulse = 1; prevChapter = chNow; } // dolly + warp kick on hand-off
    chapterPulse *= 0.90;

    /* transition warp = scroll velocity + chapter pulse; breathing = same energy */
    const velEnergy = Math.min(1, Math.abs(scrollVel) * 0.05);
    warpState += (Math.max(velEnergy, chapterPulse) - warpState) * 0.12;
    contactState += ((velEnergy * 0.6 + 0.15 + chapterPulse * 0.4) - contactState) * 0.05;
    gradeUniforms.uTime.value = t;
    gradeUniforms.uWarp.value = warpState;
    gradeUniforms.uContact.value = contactState;
    gradeUniforms.uAberration.value = velEnergy;

    /* corner-glow tint + bloom energy interpolate between chapters */
    tintTmp.copy(CH_TINT[fa]).lerp(CH_TINT[Math.min(F, fa + 1)], frac);
    gradeUniforms.uTint.value.lerp(tintTmp, 0.06);
    const targetBloom = (CH_BLOOM[fa] + (CH_BLOOM[Math.min(F, fa + 1)] - CH_BLOOM[fa]) * frac) + chapterPulse * 0.5;
    bloomPass.strength += (targetBloom - bloomPass.strength) * 0.08;

    /* chapter dolly kick — a small push-in on each hand-off */
    camera.position.z -= chapterPulse * 0.6;

    composer.render();
  });

  document.body.classList.add("fx-on");
}
