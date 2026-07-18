/* ============================================================
   stackwith.me — hub3d.js · "The Gem"
   One iridescent refractive glass polyhedron over a soft
   violet/blue gradient field, environment-lit (RoomEnvironment
   → PMREM), mild bloom, ACES. Pointer parallax; scroll rotates
   and releases it. DOM part (reveals, sticky-stack scaling,
   load choreography) runs everywhere; WebGL boots only on
   capable desktop, else .hub-no3d static fallback.
   ============================================================ */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
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

/* sticky project stack — earlier cards recede as the next slides over */
const stackCards = [...document.querySelectorAll(".hub__stack .hubcard")];
if (stackCards.length && !reduced) {
  let ticking = false;
  const settle = () => {
    ticking = false;
    const vh = innerHeight;
    for (let i = 0; i < stackCards.length - 1; i++) {
      const next = stackCards[i + 1].getBoundingClientRect();
      const p = Math.min(1, Math.max(0, 1 - (next.top - 130) / (vh * 0.7)));
      stackCards[i].style.transform = `scale(${(1 - p * 0.05).toFixed(4)}) translateY(${(p * -12).toFixed(2)}px)`;
      stackCards[i].style.opacity = (1 - p * 0.35).toFixed(3);
    }
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(settle); } }, { passive: true });
  settle();
}

/* ------------------------------------------------------------
   WebGL gem — desktop, motion-ok, canvas present
   ------------------------------------------------------------ */
const canvas = document.getElementById("hubfx");
if (!canvas || reduced || window.innerWidth < 680) {
  document.body.classList.add("hub-no3d");
} else {
  try { start(); }
  catch (err) { console.warn("[hubfx] 3D disabled:", err); document.body.classList.add("hub-no3d"); }
}

function start() {
  const BG = 0x0a0b10;
  const MID = window.innerWidth < 1100 || matchMedia("(pointer: coarse)").matches;
  const DPR = Math.min(devicePixelRatio || 1, MID ? 1.25 : 1.5);

  let W = window.innerWidth, H = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, stencil: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H);
  renderer.setClearColor(BG, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 60);
  camera.position.set(0, 0, 13);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  /* ---- gradient field the glass refracts ---- */
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 50),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        void main() {
          vec3 base = vec3(0.039, 0.043, 0.063);
          vec2 p1 = vec2(0.66 + 0.05*sin(uTime*0.11), 0.60 + 0.05*cos(uTime*0.09));
          vec2 p2 = vec2(0.30 + 0.06*cos(uTime*0.07), 0.34 + 0.05*sin(uTime*0.13));
          float d1 = distance(vUv, p1), d2 = distance(vUv, p2);
          vec3 c = base;
          c += vec3(0.545, 0.486, 1.0) * 0.16 * smoothstep(0.55, 0.0, d1);
          c += vec3(0.349, 0.655, 1.0) * 0.13 * smoothstep(0.5, 0.0, d2);
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  field.position.z = -14;
  scene.add(field);

  /* ---- the gem ---- */
  const gemGeo = new THREE.IcosahedronGeometry(2.7, 1);
  const gemMat = new THREE.MeshPhysicalMaterial({
    transmission: 1, thickness: 2.6, roughness: 0.06, metalness: 0, ior: 1.45,
    iridescence: 1, iridescenceIOR: 1.55, clearcoat: 0.7, clearcoatRoughness: 0.15,
    envMapIntensity: 1.15, flatShading: true, color: 0xffffff,
  });
  const gem = new THREE.Mesh(gemGeo, gemMat);
  scene.add(gem);

  /* thin halo ring behind the gem */
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.1, 0.012, 8, 160),
    new THREE.MeshBasicMaterial({ color: 0x8b7cff, transparent: true, opacity: 0.5 })
  );
  ring.rotation.x = Math.PI / 2.4;
  scene.add(ring);

  /* faint neutral dust */
  const N = MID ? 220 : 420;
  const dustGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 40;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 2] = -10 + Math.random() * 14;
    seed[i] = Math.random();
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const dustUniforms = { uTime: { value: 0 }, uPx: { value: DPR } };
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    uniforms: dustUniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime, uPx; varying float vA;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.2 + aSeed * 25.0) * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = 0.10 + 0.25 * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0));
        gl_PointSize = (1.2 + aSeed * 2.0) * uPx * (13.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(0.82, 0.85, 0.95), smoothstep(0.5, 0.1, d) * vA);
      }`,
  }));
  scene.add(dust);

  /* ---- composer: mild bloom for the glass highlights ---- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.6, 0.72));
  composer.addPass(new OutputPass());

  /* ---- layout: gem sits right of the headline on wide screens ---- */
  const place = () => {
    const wide = W / H > 1.15;
    gem.position.x = wide ? 3.4 : 0;
    gem.position.y = wide ? 0.1 : 2.6;
    ring.position.copy(gem.position);
  };
  place();

  /* ---- interaction ---- */
  let ptrX = 0, ptrY = 0, camX = 0, camY = 0;
  if (hoverFine) {
    addEventListener("pointermove", (e) => {
      ptrX = (e.clientX / W - 0.5) * 2;
      ptrY = (e.clientY / H - 0.5) * 2;
    }, { passive: true });
  }

  let visible = true, hidden = false, scrollP = 0;
  const onScroll = () => {
    scrollP = scrollY / H;
    const o = Math.max(0, 1 - scrollP / 1.25);
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
    place();
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (hidden || !visible) return;
    const t = clock.getElapsedTime();
    gem.rotation.y = t * 0.16 + scrollP * 2.2;
    gem.rotation.x = Math.sin(t * 0.11) * 0.18 + scrollP * 0.8;
    gem.position.y += (Math.sin(t * 0.5) * 0.14 + (innerWidth / innerHeight > 1.15 ? 0.1 : 2.6) + scrollP * 1.6 - gem.position.y) * 0.04;
    ring.position.y = gem.position.y;
    ring.rotation.z = t * 0.05;
    field.material.uniforms.uTime.value = t;
    dustUniforms.uTime.value = t;
    camX += (ptrX * 0.55 - camX) * 0.03;
    camY += (-ptrY * 0.35 - camY) * 0.03;
    camera.position.x = camX;
    camera.position.y = camY;
    camera.lookAt(0, 0, 0);
    composer.render();
  });

  onScroll();
  document.body.classList.add("fx-on");
}
