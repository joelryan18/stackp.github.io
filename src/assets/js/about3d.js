/* ============================================================
   stackwith.me — about3d.js · "The Field"
   Active-Theory-style immersive About page. One full-viewport
   GPU particle field (curl-noise drift + pointer repulsion)
   lives behind the whole page; scroll drives a hue journey
   through the three channel colors (lime → magenta → cyan),
   hovering a work row tints the field to that channel.
   Lenis inertial scroll, boot loader, IO chapter reveals,
   chapter rail. Fallbacks: <680px / reduced-motion / GL-fail
   → body.about-no3d static scrim; no-JS keeps all content
   visible via noscript rules in the layout.
   ============================================================ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import Lenis from "@studio-freight/lenis";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hoverFine = matchMedia("(hover: hover) and (pointer: fine)").matches;

/* channel palette — mirrors --ch0/1/2 tokens (lime / magenta / cyan) */
const CH = [new THREE.Color(0xb8ff3c), new THREE.Color(0xff4fa3), new THREE.Color(0x4fc4ff)];

/* ------------------------------------------------------------
   boot loader — wordmark + counter, then release the page
   ------------------------------------------------------------ */
const intro = document.getElementById("abIntro");
const releaseIntro = () => {
  if (!intro || intro.classList.contains("is-done")) return;
  intro.classList.add("is-done");
  document.body.classList.add("ab-in");
  setTimeout(() => intro.remove(), 900);
};
if (intro) {
  if (reduced) {
    releaseIntro();
  } else {
    const pct = intro.querySelector(".ab-intro__pct");
    const t0 = performance.now();
    const DUR = 1400;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / DUR);
      if (pct) pct.textContent = String(Math.round(p * 100)).padStart(3, "0");
      if (p < 1) requestAnimationFrame(tick);
      else setTimeout(releaseIntro, 250);
    };
    requestAnimationFrame(tick);
    intro.addEventListener("click", releaseIntro);
    setTimeout(releaseIntro, 4000); // hard fallback
  }
} else {
  document.body.classList.add("ab-in");
}

/* ------------------------------------------------------------
   DOM choreography — runs everywhere, no WebGL required
   ------------------------------------------------------------ */
document.body.classList.add("fx-dom");

const revealables = document.querySelectorAll("[data-abreveal]");
if (reduced || !("IntersectionObserver" in window)) {
  revealables.forEach((el) => el.classList.add("in"));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.15, rootMargin: "0px 0px -10% 0px" });
  revealables.forEach((el) => io.observe(el));
}

/* smooth inertial scroll */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1.0 });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

/* chapter rail — dot per [data-abchapter], active follows scroll */
const chapters = [...document.querySelectorAll("[data-abchapter]")];
const rail = document.getElementById("abRail");
const dots = [];
if (rail && chapters.length) {
  chapters.forEach((ch, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ab-rail__dot";
    b.setAttribute("aria-label", ch.dataset.abchapter || `Chapter ${i + 1}`);
    b.addEventListener("click", () => {
      const y = ch.getBoundingClientRect().top + scrollY - 70;
      lenis ? lenis.scrollTo(y) : scrollTo({ top: y, behavior: "smooth" });
    });
    rail.appendChild(b);
    dots.push(b);
  });
}
const markChapter = () => {
  if (!dots.length) return;
  const mid = scrollY + innerHeight * 0.45;
  let active = 0;
  chapters.forEach((ch, i) => { if (ch.offsetTop <= mid) active = i; });
  dots.forEach((d, i) => d.classList.toggle("is-active", i === active));
  return active;
};
addEventListener("scroll", markChapter, { passive: true });
markChapter();

/* work rows — hover tints the field to that channel */
let hoverCh = -1;
document.querySelectorAll(".ab-row[data-ch]").forEach((row) => {
  const ch = Number(row.dataset.ch);
  row.addEventListener("pointerenter", () => { hoverCh = ch; });
  row.addEventListener("pointerleave", () => { hoverCh = -1; });
});

/* ------------------------------------------------------------
   WebGL particle field — desktop, motion-ok
   ------------------------------------------------------------ */
const canvas = document.getElementById("aboutfx");
if (!canvas || reduced || innerWidth < 680) {
  document.body.classList.add("about-no3d");
} else {
  try { start(); }
  catch (err) { console.warn("[aboutfx] 3D disabled:", err); document.body.classList.add("about-no3d"); }
}

function start() {
  const MID = innerWidth < 1100 || matchMedia("(pointer: coarse)").matches;
  const DPR = Math.min(devicePixelRatio || 1, MID ? 1.25 : 1.5);
  let W = innerWidth, H = innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H);
  renderer.setClearColor(0x07080a, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 80);
  camera.position.set(0, 0, 16);

  /* deep gradient wash behind the particles */
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 60),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color(CH[0]) } },
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uTint; varying vec2 vUv;
        void main() {
          vec3 c = vec3(0.028, 0.031, 0.041);
          vec2 p = vec2(0.5 + 0.08 * sin(uTime * 0.07), 0.42 + 0.06 * cos(uTime * 0.05));
          c += uTint * 0.055 * smoothstep(0.75, 0.0, distance(vUv, p));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  field.position.z = -20;
  scene.add(field);

  /* ---- the particle field: curl-noise drift in the vertex shader ---- */
  const N = MID ? 4500 : 9000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 34;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 2] = -6 + Math.random() * 10;
    seed[i] = Math.random();
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

  const uniforms = {
    uTime: { value: 0 },
    uPx: { value: DPR },
    uPtr: { value: new THREE.Vector3(999, 999, 0) }, // world-space pointer, far away = inert
    uColA: { value: new THREE.Color(CH[0]) },
    uColB: { value: new THREE.Color(CH[2]) },
    uMix: { value: 0 },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uPx;
      uniform vec3 uPtr;
      varying float vA, vSeed;

      /* cheap analytic curl of a sin/cos field — no texture lookups */
      vec3 curl(vec3 p) {
        float t = uTime * 0.12;
        return vec3(
          sin(p.y * 0.45 + t) + cos(p.z * 0.38 - t * 1.3),
          sin(p.z * 0.41 - t * 0.8) + cos(p.x * 0.36 + t),
          sin(p.x * 0.43 + t * 1.1) + cos(p.y * 0.39 - t)
        );
      }

      void main() {
        vec3 p = position;
        p += curl(p + aSeed * 6.2831) * (0.9 + aSeed * 0.8);
        p.y += sin(uTime * 0.15 + aSeed * 40.0) * 0.4;

        /* pointer repulsion — particles swirl away from the cursor */
        vec3 d = p - uPtr;
        float dist = length(d.xy);
        float push = smoothstep(4.5, 0.0, dist);
        p.xy += normalize(d.xy + 0.0001) * push * 2.6;
        p.z += push * 1.2;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = (0.12 + 0.5 * (0.5 + 0.5 * sin(uTime * (0.4 + aSeed) + aSeed * 30.0))) * (1.0 + push * 1.6);
        vSeed = aSeed;
        gl_PointSize = (1.1 + aSeed * 2.4) * uPx * (15.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColA, uColB;
      uniform float uMix;
      varying float vA, vSeed;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        vec3 col = mix(uColA, uColB, clamp(uMix + (vSeed - 0.5) * 0.35, 0.0, 1.0));
        col = mix(vec3(0.75, 0.8, 0.9), col, 0.8);
        gl_FragColor = vec4(col, smoothstep(0.5, 0.05, d) * vA);
      }`,
  }));
  scene.add(points);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.7, 0.68));
  composer.addPass(new OutputPass());

  /* ---- pointer → world space at z≈0 ---- */
  const ptrTarget = new THREE.Vector3(999, 999, 0);
  if (hoverFine) {
    addEventListener("pointermove", (e) => {
      const nx = (e.clientX / W) * 2 - 1;
      const ny = -(e.clientY / H) * 2 + 1;
      const vh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      ptrTarget.set(nx * vh * camera.aspect, ny * vh, 0);
    }, { passive: true });
    addEventListener("pointerleave", () => ptrTarget.set(999, 999, 0), { passive: true });
  }

  /* ---- scroll → hue journey across the chapters ---- */
  let scrollP = 0;
  const onScroll = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    scrollP = scrollY / max;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  let hidden = false;
  document.addEventListener("visibilitychange", () => { hidden = document.hidden; });

  addEventListener("resize", () => {
    W = innerWidth; H = innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    composer.setSize(W, H);
  });

  /* palette waypoints across scroll: lime → magenta → cyan → lime */
  const stops = [CH[0], CH[1], CH[2], CH[0]];
  const colA = new THREE.Color(CH[0]), colB = new THREE.Color(CH[2]), tint = new THREE.Color(CH[0]);
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();

  const clock = new THREE.Clock();
  let camX = 0, camY = 0;
  renderer.setAnimationLoop(() => {
    if (hidden) return;
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    field.material.uniforms.uTime.value = t;

    /* scroll position picks a segment of the palette journey */
    const j = scrollP * (stops.length - 1);
    const i0 = Math.min(stops.length - 2, Math.floor(j));
    tmpA.copy(stops[i0]);
    tmpB.copy(stops[i0 + 1]);
    /* hovering a work row overrides the journey with that channel */
    if (hoverCh >= 0) { tmpA.copy(CH[hoverCh]); tmpB.copy(CH[hoverCh]); }
    colA.lerp(tmpA, 0.04);
    colB.lerp(tmpB, 0.04);
    uniforms.uColA.value.copy(colA);
    uniforms.uColB.value.copy(colB);
    uniforms.uMix.value = j - i0;
    tint.lerp(hoverCh >= 0 ? CH[hoverCh] : tmpA, 0.03);
    field.material.uniforms.uTint.value.copy(tint);

    uniforms.uPtr.value.lerp(ptrTarget, 0.08);

    camX += (Math.sin(t * 0.05) * 0.4 - camX) * 0.02;
    camY += (scrollP * -1.4 - camY) * 0.04;
    camera.position.x = camX;
    camera.position.y = camY;
    camera.lookAt(0, camY, 0);
    composer.render();
  });

  document.body.classList.add("fx-on");
}
