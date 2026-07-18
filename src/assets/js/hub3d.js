/* hub — "The Workshop Catalog"
   No WebGL. Three canvas-2D device screens (scope / wave / feed),
   a live LCD clock, and reveal choreography with safe defaults:
   without JS everything is visible and static.
   Honesty contract: body.wf-on is added ONLY after every screen
   has a context and the first frame has actually drawn.
   QA hook: window.__hubQ() -> { frames, screens, clock }. */

const ACID = "#B8FF3C";
const ACID_DIM = "rgba(184,255,60,0.34)";
const ACID_FAINT = "rgba(184,255,60,0.12)";
const PLATE = "#15160F";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

let frames = 0;
let clockTicks = 0;

/* ---------- LCD clock ---------- */
function startClock() {
  const el = document.getElementById("wfClock");
  if (!el) return false;
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });
    clockTicks++;
  };
  tick();
  setInterval(tick, 1000);
  return true;
}

/* ---------- device screens ---------- */
function mountScreen(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const s = { canvas, ctx, kind: canvas.dataset.screen, w: 0, h: 0, dpr: 1, visible: true, t: Math.random() * 100 };
  const size = () => {
    const r = canvas.parentElement.getBoundingClientRect();
    s.dpr = Math.min(devicePixelRatio || 1, 2);
    s.w = Math.max(1, Math.round(r.width * s.dpr));
    s.h = Math.max(1, Math.round(r.height * s.dpr));
    canvas.width = s.w;
    canvas.height = s.h;
  };
  size();
  addEventListener("resize", size);
  return s;
}

function drawScope(s, t) {
  const { ctx, w, h } = s;
  ctx.fillStyle = PLATE;
  ctx.fillRect(0, 0, w, h);
  const u = w / 100;
  /* graticule dots */
  ctx.fillStyle = "rgba(184,255,60,0.09)";
  for (let gx = 8; gx < 100; gx += 12)
    for (let gy = 12; gy < 100; gy += 22) ctx.fillRect(gx * u, (gy / 100) * h, 1.5, 1.5);
  /* heartbeat trace — the brand mark, sweeping */
  const mid = h * 0.55, amp = h * 0.3;
  const beat = (x) => {
    const p = ((x * 0.011 + t * 0.14) % 1 + 1) % 1;
    if (p < 0.14) return 0;
    if (p < 0.2) return -Math.sin((p - 0.14) / 0.06 * Math.PI) * 0.22;
    if (p < 0.3) return Math.sin((p - 0.2) / 0.1 * Math.PI) * 1;
    if (p < 0.42) return -Math.sin((p - 0.3) / 0.12 * Math.PI) * 0.36;
    return Math.sin(p * 21 + t) * 0.02;
  };
  ctx.beginPath();
  for (let x = 0; x <= 100; x += 0.75) {
    const y = mid - beat(x) * amp;
    x === 0 ? ctx.moveTo(x * u, y) : ctx.lineTo(x * u, y);
  }
  ctx.strokeStyle = ACID;
  ctx.lineWidth = Math.max(1.4, s.dpr * 1.1);
  ctx.shadowColor = ACID;
  ctx.shadowBlur = 8 * s.dpr;
  ctx.stroke();
  ctx.shadowBlur = 0;
  /* readout */
  ctx.fillStyle = ACID_DIM;
  ctx.font = `${9 * s.dpr}px "JetBrains Mono", monospace`;
  ctx.fillText("TRACE LIVE", 8 * s.dpr, 13 * s.dpr);
}

function drawWave(s, t) {
  const { ctx, w, h } = s;
  ctx.fillStyle = PLATE;
  ctx.fillRect(0, 0, w, h);
  const n = 36, gap = w / n;
  const play = ((t * 0.06) % 1 + 1) % 1;
  for (let i = 0; i < n; i++) {
    const v = 0.24 + 0.62 * Math.abs(Math.sin(i * 1.7 + 0.35) * Math.cos(i * 0.31 + t * 0.7));
    const bh = v * h * 0.62;
    const x = i * gap + gap * 0.28, y = h * 0.78 - bh;
    ctx.fillStyle = i / n <= play ? ACID : ACID_FAINT;
    ctx.fillRect(x, y, gap * 0.44, bh);
  }
  /* playhead */
  const px = play * w;
  ctx.fillStyle = "rgba(233,231,225,0.75)";
  ctx.fillRect(px, h * 0.08, Math.max(1, s.dpr), h * 0.78);
  ctx.fillStyle = ACID_DIM;
  ctx.font = `${9 * s.dpr}px "JetBrains Mono", monospace`;
  ctx.fillText("EP " + String(1 + Math.floor(play * 12)).padStart(2, "0") + " / 12", 8 * s.dpr, 13 * s.dpr);
}

const FEED = [
  "2026-06-24  AUTOMATION NEEDS AN AUDIT TRAIL",
  "2026-06-10  SUB-40MS ORCHESTRATION",
  "2026-05-28  GUARDRAILS ARE A FEATURE",
  "----------  ------------------------------",
];
function drawFeed(s, t) {
  const { ctx, w, h } = s;
  ctx.fillStyle = PLATE;
  ctx.fillRect(0, 0, w, h);
  const lh = 15 * s.dpr;
  const scroll = (t * 0.5 * lh) % (FEED.length * lh);
  ctx.font = `${9.5 * s.dpr}px "JetBrains Mono", monospace`;
  for (let i = -1; i < h / lh + FEED.length; i++) {
    const idx = ((i % FEED.length) + FEED.length) % FEED.length;
    const y = h - (i * lh - scroll) - lh * 0.6;
    if (y < -lh || y > h + lh) continue;
    const head = y > h - lh * 1.6;                       /* freshly printed line */
    ctx.fillStyle = head ? ACID : ACID_DIM;
    ctx.fillText(FEED[idx], 8 * s.dpr, y);
  }
  /* printer head */
  ctx.fillStyle = "rgba(233,231,225,0.5)";
  ctx.fillRect(0, h - 2 * s.dpr, w, s.dpr);
}

const DRAW = { scope: drawScope, wave: drawWave, feed: drawFeed };

/* ---------- boot ---------- */
try {
  const canvases = [...document.querySelectorAll("canvas.wf-screen")];
  const screens = canvases.map(mountScreen).filter(Boolean);

  if (screens.length && screens.length === canvases.length) {
    /* only burn cycles on screens actually in view */
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const s = screens.find((x) => x.canvas === e.target);
        if (s) s.visible = e.isIntersecting;
      }
    }, { rootMargin: "120px" });
    screens.forEach((s) => io.observe(s.canvas));

    const drawAll = (t) => {
      for (const s of screens) if (s.visible) DRAW[s.kind]?.(s, s.t + t);
      frames++;
    };
    drawAll(0); /* first frame before claiming anything works */

    if (!reduced) {
      let last = 0;
      const loop = (ms) => {
        if (!document.hidden && ms - last > 33) { last = ms; drawAll(ms / 1000); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      addEventListener("resize", () => drawAll(performance.now() / 1000));
    } else {
      addEventListener("resize", () => drawAll(0));
    }

    startClock();
    document.body.classList.add("wf-on");           /* honesty marker: screens render */

    /* reveal choreography — armed only here, so no-JS stays visible */
    if (!reduced) {
      document.body.classList.add("wf-anim");
      const rio = new IntersectionObserver((es) => {
        for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); rio.unobserve(e.target); }
      }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
      document.querySelectorAll("[data-wf]").forEach((el) => rio.observe(el));
    }
  } else {
    startClock(); /* clock is DOM-only; keep it honest even if canvas fails */
  }
} catch (e) {
  /* any failure: page stays static and fully readable, no wf-on claim */
}

window.__hubQ = () => ({ frames, screens: document.querySelectorAll("canvas.wf-screen").length, clock: clockTicks });
