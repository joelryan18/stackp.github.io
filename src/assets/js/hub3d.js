/* ============================================================
   stackwith.me — hub3d.js · "The Spectrum"
   Three braided signal ribbons (one per channel: AXON lime,
   Stackime magenta, Log cyan) + particle dust, graded through
   EffectComposer → UnrealBloom → ACES OutputPass.
   Hovering a channel card/chip excites its ribbon (uniform).
   DOM part (reveals, tilt, load choreography) runs everywhere;
   WebGL boots only on capable desktop, else .hub-no3d fallback.
   ============================================================ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hoverFine = matchMedia("(hover: hover) and (pointer: fine)").matches;

/* ------------------------------------------------------------
   DOM choreography — safe on every device, no WebGL required
   ------------------------------------------------------------ */
document.body.classList.add("fx-dom");
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("hub-in")));

const revealables = document.querySelectorAll("[data-hubreveal]");
if (reduced || !("IntersectionObserver" in window)) {
  revealables.forEach((el) => el.classList.add("in"));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  revealables.forEach((el) => io.observe(el));
}

/* card tilt — pointer devices only */
if (hoverFine && !reduced) {
  document.querySelectorAll(".hubcard").forEach((card) => {
    let raf = 0;
    card.addEventListener("pointermove", (ev) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = card.getBoundingClientRect();
        const px = (ev.clientX - r.left) / r.width - 0.5;
        const py = (ev.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateY(-6px)`;
      });
    });
    card.addEventListener("pointerleave", () => { card.style.transform = ""; });
  });
}

/* channel hover → ribbon excitement (no-op until 3D boots) */
const exciteTargets = [0, 0, 0];
document.querySelectorAll("[data-ch]").forEach((el) => {
  const i = parseInt(el.dataset.ch, 10);
  if (Number.isNaN(i) || i < 0 || i > 2) return;
  const on = () => { exciteTargets[i] = 1; };
  const off = () => { exciteTargets[i] = 0; };
  el.addEventListener("pointerenter", on);
  el.addEventListener("pointerleave", off);
  el.addEventListener("focusin", on);
  el.addEventListener("focusout", off);
});

/* ------------------------------------------------------------
   WebGL spectrum — desktop, motion-ok, canvas present
   ------------------------------------------------------------ */
const canvas = document.getElementById("hubfx");
if (!canvas || reduced || window.innerWidth < 680) {
  document.body.classList.add("hub-no3d");
} else {
  try { start(); }
  catch (err) { console.warn("[hubfx] 3D disabled:", err); document.body.classList.add("hub-no3d"); }
}

function start() {
  const VOID = 0x04060c;
  const CHANNELS = [
    { color: new THREE.Color(0xb8ff3c), phase: 0.0, freq: 1.0, amp: 1.35, y: 0.5, z: 0.0 },   // AXON
    { color: new THREE.Color(0xff4fa3), phase: 2.1, freq: 0.78, amp: 1.5, y: -0.7, z: -2.6 }, // Stackime
    { color: new THREE.Color(0x4fc4ff), phase: 4.2, freq: 1.28, amp: 1.1, y: 1.5, z: 2.2 },   // Log
  ];

  const MID = window.innerWidth < 1100 || matchMedia("(pointer: coarse)").matches;
  const DPR = Math.min(devicePixelRatio || 1, MID ? 1.25 : 1.5);
  const N_DUST = MID ? 500 : 1100;

  let W = window.innerWidth, H = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H);
  renderer.setClearColor(VOID, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(VOID, 16, 44);
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 80);
  camera.position.set(0, 0.4, 13);

  /* ---- ribbons ---- */
  const ribbonUniforms = [];
  for (const ch of CHANNELS) {
    const uniforms = {
      uTime: { value: 0 },
      uAmp: { value: ch.amp },
      uPhase: { value: ch.phase },
      uFreq: { value: ch.freq },
      uExcite: { value: 0 },
      uColor: { value: ch.color },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uAmp, uPhase, uFreq, uExcite;
        varying vec2 vUv; varying float vGlow;
        void main() {
          vUv = uv;
          vec3 p = position;
          float x = p.x;
          float w1 = sin(x * 0.28 * uFreq + uTime * 0.85 + uPhase);
          float w2 = sin(x * 0.13 * uFreq - uTime * 0.5 + uPhase * 1.7) * 0.6;
          float w3 = sin(x * 0.55 * uFreq + uTime * 1.6) * 0.3 * (0.35 + uExcite);
          p.y += (w1 + w2 + w3) * uAmp * (1.0 + uExcite * 1.5);
          p.z += cos(x * 0.21 + uTime * 0.35 + uPhase) * 1.15;
          vGlow = 0.55 + 0.45 * sin(x * 0.9 + uTime * 2.1 + uPhase);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uExcite;
        varying vec2 vUv; varying float vGlow;
        void main() {
          float edge = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          float xfade = smoothstep(0.0, 0.09, vUv.x) * smoothstep(1.0, 0.91, vUv.x);
          float a = edge * edge * xfade * (0.45 + 0.55 * vGlow) * (0.4 + 0.9 * uExcite);
          gl_FragColor = vec4(uColor * (0.68 + 1.7 * uExcite + 0.5 * vGlow), a);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(72, 1.6, 360, 1), mat);
    mesh.position.set(0, ch.y, ch.z);
    mesh.frustumCulled = false;
    scene.add(mesh);
    ribbonUniforms.push(uniforms);
  }

  /* ---- dust ---- */
  const dustGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(N_DUST * 3);
  const col = new Float32Array(N_DUST * 3);
  const seed = new Float32Array(N_DUST);
  for (let i = 0; i < N_DUST; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 76;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 2] = -9 + Math.random() * 15;
    const c = CHANNELS[i % 3].color;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    seed[i] = Math.random();
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const dustUniforms = { uTime: { value: 0 }, uPx: { value: DPR } };
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    uniforms: dustUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSeed;
      uniform float uTime, uPx;
      varying vec3 vC; varying float vA;
      void main() {
        vC = aColor;
        vec3 p = position;
        p.y += sin(uTime * 0.25 + aSeed * 21.0) * 0.7;
        p.x += cos(uTime * 0.18 + aSeed * 13.0) * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = 0.14 + 0.4 * (0.5 + 0.5 * sin(uTime * (0.8 + aSeed * 1.4) + aSeed * 40.0));
        gl_PointSize = (1.4 + aSeed * 2.8) * uPx * (14.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vC, smoothstep(0.5, 0.12, d) * vA);
      }`,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  /* ---- composer ---- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.78, 0.7, 0.2));
  composer.addPass(new OutputPass());

  /* ---- interaction state ---- */
  const excite = [0, 0, 0];
  let ptrX = 0, ptrY = 0, camX = 0, camY = 0;
  if (hoverFine) {
    addEventListener("pointermove", (e) => {
      ptrX = (e.clientX / W - 0.5) * 2;
      ptrY = (e.clientY / H - 0.5) * 2;
    }, { passive: true });
  }

  let visible = true, hidden = false;
  const onScroll = () => {
    const o = Math.max(0, 1 - scrollY / (innerHeight * 1.2));
    canvas.style.opacity = o.toFixed(3);
    visible = o > 0.015;
  };
  addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", () => { hidden = document.hidden; });

  addEventListener("resize", () => {
    W = innerWidth; H = innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    composer.setSize(W, H);
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (hidden || !visible) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < 3; i++) {
      excite[i] += (exciteTargets[i] - excite[i]) * 0.06;
      ribbonUniforms[i].uTime.value = t;
      ribbonUniforms[i].uExcite.value = excite[i];
    }
    dustUniforms.uTime.value = t;
    camX += (ptrX * 1.1 - camX) * 0.03;
    camY += (-ptrY * 0.7 - camY) * 0.03;
    camera.position.x = camX;
    camera.position.y = 0.4 + camY;
    camera.lookAt(0, 0.2, 0);
    composer.render();
  });

  onScroll();
  document.body.classList.add("fx-on");
}
