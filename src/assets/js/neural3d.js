/* ============================================================
   AXON — neural3d.js  ·  "Living current in carbon"  (ES module, no build)
   Modern HDR pipeline: vertex-shader particle flow sheath + glowing
   filament axon + emissive synapse nodes, graded through
   EffectComposer → Bloom → ACES(OutputPass) → filmic grade → SMAA.
   Scroll rides the camera down the nerve behind an HDR signal impulse.
   ============================================================ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

const canvas = document.getElementById("nerve");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!canvas) {
  /* nothing */
} else if (reduced || window.innerWidth < 680) {
  document.body.classList.add("no3d");
} else {
  try { start(); }
  catch (err) { console.warn("[nerve] 3D disabled:", err); document.body.classList.add("no3d"); }
}

function start() {
  const CARBON = 0x07080a;
  const SIGNAL = new THREE.Color(0xb8ff3c);

  /* ---- perf tier ---- */
  const MID = window.innerWidth < 1100 || matchMedia("(pointer: coarse)").matches;
  let DPR = Math.min(devicePixelRatio || 1, MID ? 1.25 : 1.5);
  const N_POINTS = MID ? 12000 : 24000;
  let useDOF = false;   // DOF muddied the sheath into grey; bloom + grade carry the modern look

  let W = window.innerWidth, H = window.innerHeight;

  /* ---- renderer (opaque clear to carbon, ACES) ---- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, depth: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H);
  renderer.setClearColor(CARBON, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // OutputPass mirrors this
  renderer.toneMappingExposure = 0.9;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, W / H, 0.1, 120);
  const group = new THREE.Group();
  scene.add(group);

  /* ---- axon spine ---- */
  const SPAN = 150, KNOTS = 30, SEG = 600;
  const spinePts = [];
  for (let i = 0; i < KNOTS; i++) {
    const t = i / (KNOTS - 1);
    spinePts.push(new THREE.Vector3(
      Math.sin(t * Math.PI * 3.0) * 6 + Math.sin(t * 22.0) * 0.6,
      -t * SPAN,
      Math.cos(t * Math.PI * 2.3) * 6 + Math.cos(t * 18.0) * 0.6
    ));
  }
  const spine = new THREE.CatmullRomCurve3(spinePts, false, "catmullrom", 0.5);
  const frames = spine.computeFrenetFrames(SEG, false);
  const centers = [];
  for (let i = 0; i <= SEG; i++) centers.push(spine.getPointAt(i / SEG));

  /* ============================================================
     1 · FLOW SHEATH — 24k additive points, animated in-shader
     ============================================================ */
  const pos = new Float32Array(N_POINTS * 3);
  const aNrm = new Float32Array(N_POINTS * 3);
  const aBin = new Float32Array(N_POINTS * 3);
  const aRadius = new Float32Array(N_POINTS);
  const aT = new Float32Array(N_POINTS);
  const aAngle = new Float32Array(N_POINTS);
  const aSpeed = new Float32Array(N_POINTS);
  const aRand = new Float32Array(N_POINTS);

  for (let i = 0; i < N_POINTS; i++) {
    const t = Math.random();
    const si = Math.min(SEG, Math.round(t * SEG));
    const c = centers[si], n = frames.normals[si], b = frames.binormals[si];
    pos[i * 3] = c.x; pos[i * 3 + 1] = c.y; pos[i * 3 + 2] = c.z;
    aNrm[i * 3] = n.x; aNrm[i * 3 + 1] = n.y; aNrm[i * 3 + 2] = n.z;
    aBin[i * 3] = b.x; aBin[i * 3 + 1] = b.y; aBin[i * 3 + 2] = b.z;
    const haze = Math.random() < 0.25;
    aRadius[i] = haze ? 0.4 + Math.random() * 0.7 : 0.08 + Math.random() * 0.28;
    aT[i] = t;
    aAngle[i] = Math.random() * Math.PI * 2;
    aSpeed[i] = (0.15 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
    aRand[i] = Math.random();
  }

  const sheathGeo = new THREE.BufferGeometry();
  sheathGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  sheathGeo.setAttribute("aNrm", new THREE.BufferAttribute(aNrm, 3));
  sheathGeo.setAttribute("aBin", new THREE.BufferAttribute(aBin, 3));
  sheathGeo.setAttribute("aRadius", new THREE.BufferAttribute(aRadius, 1));
  sheathGeo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
  sheathGeo.setAttribute("aAngle", new THREE.BufferAttribute(aAngle, 1));
  sheathGeo.setAttribute("aSpeed", new THREE.BufferAttribute(aSpeed, 1));
  sheathGeo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 1));

  const sheathMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uHeadT: { value: 0 }, uColor: { value: SIGNAL.clone() },
      uSize: { value: 0.038 }, uAtten: { value: H * DPR * 0.5 },
      uNear: { value: 4.0 }, uFar: { value: 40.0 },
    },
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uHeadT, uSize, uAtten, uNear, uFar;
      attribute vec3 aNrm, aBin; attribute float aRadius, aT, aAngle, aSpeed, aRand;
      varying float vBright; varying float vFade;
      void main() {
        float ang = aAngle + uTime * aSpeed;
        vec3 p = position + (cos(ang) * aNrm + sin(ang) * aBin) * aRadius;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = uSize * (0.55 + aRand * 0.9) * (uAtten / max(dist, 0.001));
        float d = abs(aT - uHeadT);
        float band = exp(-pow(d / 0.045, 2.0));          // travelling signal
        vBright = 0.26 + aRand * 0.14 + band * 2.4;       // lit body, head still dominant
        vFade = smoothstep(uFar, uNear, dist);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vBright; varying float vFade;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(uv));
        gl_FragColor = vec4(uColor * vBright, a * vFade);
      }`,
  });
  group.add(new THREE.Points(sheathGeo, sheathMat));

  /* ============================================================
     2 · AXON FILAMENT — glowing shader tube w/ travelling band
     ============================================================ */
  const axonMat = filamentMaterial(2.6, 0.12);
  const axonGeo = new THREE.TubeGeometry(spine, 600, 0.05, 10, false);
  group.add(new THREE.Mesh(axonGeo, axonMat));

  // faint dark conduit that writes depth (focal reference for DOF)
  const conduit = new THREE.Mesh(
    new THREE.TubeGeometry(spine, 600, 0.02, 6, false),
    new THREE.MeshBasicMaterial({ color: 0x0a1410 })
  );
  group.add(conduit);

  /* ---- dendrites (faint additive filaments) ---- */
  const dendMat = filamentMaterial(1.2, 0.08);
  const BRANCH = 20;
  for (let b = 0; b < BRANCH; b++) {
    const t = (b + 0.5) / BRANCH;
    const base = spine.getPointAt(t);
    const tan = spine.getTangentAt(t).normalize();
    let dir = new THREE.Vector3(Math.sin(b * 1.7) + Math.cos(b * 0.5) * 0.4, Math.sin(b * 0.9) * 0.5, Math.cos(b * 1.3) + Math.sin(b * 0.7) * 0.4).normalize();
    dir.addScaledVector(tan, -0.2).normalize();
    const bp = [base.clone()]; const p = base.clone();
    const segs = 3 + (b % 3);
    for (let s = 0; s < segs; s++) {
      p.addScaledVector(dir, 1.5 + s * 0.5);
      p.x += Math.sin(b * 3 + s) * 0.5; p.y += Math.cos(b * 2 + s) * 0.4;
      bp.push(p.clone());
      dir.x += Math.sin(b + s * 1.3) * 0.35; dir.z += Math.cos(b + s * 1.1) * 0.35; dir.normalize();
    }
    const bc = new THREE.CatmullRomCurve3(bp, false, "catmullrom", 0.5);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(bc, 24, 0.02, 6, false), dendMat));
  }

  function filamentMaterial(bandBoost, fresBoost) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uHeadT: { value: 0 }, uColor: { value: SIGNAL.clone() },
        uBand: { value: bandBoost }, uFres: { value: fresBoost },
        uNear: { value: 4.0 }, uFar: { value: 40.0 },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vN, vV; varying float vFade;
        void main() {
          vUv = uv; vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz); vFade = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uHeadT, uBand, uFres, uNear, uFar; uniform vec3 uColor;
        varying vec2 vUv; varying vec3 vN, vV; varying float vFade;
        void main() {
          float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
          float band = exp(-pow((vUv.x - uHeadT) / 0.03, 2.0));
          float fade = smoothstep(uFar, uNear, vFade);
          vec3 col = uColor * (uFres * fres + band * uBand);
          float a = (uFres * fres + band) * fade;
          gl_FragColor = vec4(col, a);
        }`,
    });
  }

  /* ============================================================
     3 · SYNAPSE NODES — emissive points that flash on pass
     ============================================================ */
  const nodePos = [], nodeT = [];
  for (let b = 0; b < BRANCH; b++) {
    const t = (b + 0.5) / BRANCH; const c = spine.getPointAt(t);
    nodePos.push(c.x, c.y, c.z); nodeT.push(t);
  }
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nodePos), 3));
  nodeGeo.setAttribute("aT", new THREE.BufferAttribute(new Float32Array(nodeT), 1));
  const nodeMat = new THREE.ShaderMaterial({
    uniforms: { uHeadT: { value: 0 }, uColor: { value: SIGNAL.clone() }, uSize: { value: 0.12 }, uAtten: { value: H * DPR * 0.5 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uHeadT, uSize, uAtten; attribute float aT; varying float vB;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float on = exp(-pow((aT - uHeadT) / 0.03, 2.0));
        vB = 0.12 + on * 3.5;
        gl_PointSize = uSize * (0.4 + on) * (uAtten / max(-mv.z, 0.001));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vB;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(uColor * vB, a);
      }`,
  });
  group.add(new THREE.Points(nodeGeo, nodeMat));

  /* ---- bright HDR impulse core (writes depth → DOF focus) ---- */
  const impulse = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  group.add(impulse);

  /* ============================================================
     4 · POST PIPELINE
     ============================================================ */
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(DPR);
  composer.setSize(W, H);

  composer.addPass(new RenderPass(scene, camera));

  let bokeh = null;
  if (useDOF) {
    bokeh = new BokehPass(scene, camera, { focus: 3.0, aperture: 0.00028, maxblur: 0.008 });
    composer.addPass(bokeh);
  }

  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.7, 0.9);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());              // ACES + sRGB encode

  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 },
      uCA: { value: 0.0022 }, uVig: { value: 0.55 }, uGrain: { value: 0.03 },
      uRes: { value: new THREE.Vector2(W, H) },
    },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime, uCA, uVig, uGrain; uniform vec2 uRes;
      varying vec2 vUv;
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main() {
        vec2 d = vUv - 0.5;
        float amt = uCA * dot(d, d);
        float r = texture2D(tDiffuse, vUv - d * amt).r;
        float g = texture2D(tDiffuse, vUv).g;
        float b = texture2D(tDiffuse, vUv + d * amt).b;
        vec3 col = vec3(r, g, b);
        col *= 1.0 - smoothstep(0.32, 0.85, length(d)) * uVig;          // vignette
        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));           // filmic grain, subtle in blacks
        col += (hash(vUv * uRes + uTime) - 0.5) * uGrain * (0.35 + 0.65 * luma);
        col += (hash(vUv * uRes) - 0.5) / 255.0;                        // dither
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(grade);

  const smaa = new SMAAPass(W, H);
  composer.addPass(smaa);

  /* ============================================================
     5 · SCROLL + CAMERA RIG (kept) + MOUSE PARALLAX
     ============================================================ */
  let targetU = 0, curU = 0;
  const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const readScroll = () => { targetU = clamp(window.scrollY / maxScroll(), 0, 1); };
  readScroll();
  window.addEventListener("scroll", readScroll, { passive: true });

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("mousemove", (e) => { mouse.tx = e.clientX / W - 0.5; mouse.ty = e.clientY / H - 0.5; }, { passive: true });

  const up = new THREE.Vector3(0, 1, 0);
  const _side = new THREE.Vector3(), _realUp = new THREE.Vector3(), _tan = new THREE.Vector3(), _look = new THREE.Vector3();
  function placeCamera(u) {
    const cu = clamp(u, 0.001, 0.985);
    const p = spine.getPointAt(cu);
    _tan.copy(spine.getTangentAt(cu)).normalize();
    _side.crossVectors(_tan, up); if (_side.lengthSq() < 1e-5) _side.set(1, 0, 0); _side.normalize();
    _realUp.crossVectors(_side, _tan).normalize();
    camera.position.copy(p)
      .addScaledVector(_side, 1.7 + mouse.x * 0.9)
      .addScaledVector(_realUp, 0.9 + mouse.y * 0.6)
      .addScaledVector(_tan, -0.6);
    _look.copy(spine.getPointAt(clamp(cu + 0.045, 0, 1)));
    camera.lookAt(_look);
  }

  /* ============================================================
     6 · RENDER LOOP + adaptive perf
     ============================================================ */
  const _ip = new THREE.Vector3();
  let time = 0, last = performance.now(), fps = 60, slow = 0, degraded = false;
  let focusV = 3.0, running = true;

  function frame(now) {
    if (!running) return;                 // paused while tab hidden — do not reschedule
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;

    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    curU += (targetU - curU) * 0.09;
    const headT = clamp(curU + 0.03, 0, 1);

    placeCamera(curU);
    _ip.copy(spine.getPointAt(headT));
    impulse.position.copy(_ip);

    sheathMat.uniforms.uTime.value = time;
    sheathMat.uniforms.uHeadT.value = headT;
    axonMat.uniforms.uHeadT.value = headT;
    dendMat.uniforms.uHeadT.value = headT;
    nodeMat.uniforms.uHeadT.value = headT;
    grade.uniforms.uTime.value = time;

    if (bokeh) {
      focusV += (Math.max(0.1, camera.position.distanceTo(_ip)) - focusV) * 0.1;
      bokeh.uniforms["focus"].value = focusV;
    }

    composer.render();

    // adaptive downshift if we can't hold ~50fps
    fps += ((1 / Math.max(dt, 0.001)) - fps) * 0.1;
    if (!degraded && fps < 46) { if (++slow > 90) downshift(); } else slow = 0;
  }

  function downshift() {
    degraded = true;
    if (bokeh) { bokeh.enabled = false; }
    bloom.strength = 0.45;
    DPR = 1.0; renderer.setPixelRatio(1.0); composer.setPixelRatio(1.0);
    onResize();
    console.info("[nerve] adaptive downshift → DOF off, DPR 1.0");
  }

  function onResize() {
    W = window.innerWidth; H = window.innerHeight;
    if (W < 680) { document.body.classList.add("no3d"); return; }
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H); composer.setSize(W, H);
    grade.uniforms.uRes.value.set(W, H);
    sheathMat.uniforms.uAtten.value = H * DPR * 0.5;
    nodeMat.uniforms.uAtten.value = H * DPR * 0.5;
    readScroll();
  }
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(onResize, 150); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { running = false; }
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });

  requestAnimationFrame(frame);
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
