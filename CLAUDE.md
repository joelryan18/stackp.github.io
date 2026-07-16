# stackwith.me — project context (read this, skip re-exploration)

Multi-section site live at https://stackwith.me via GitHub Pages, repo
`joelryan18/stackp.github.io`, branch `main`.

**Work in THIS directory (`~/Projects/axon-site`) only.**

## Current state (2026-07-16)

- **/lab.html v2 "Deep Signal — Crystalline" SHIPPED 2026-07-16** (user:
  "evolve the lab into peak performance clearity and more realistc award
  wiining … but do evolve it"): commit `ffa56e7`, built ON TOP of v1 —
  same 5-chapter descent/DOM/fallbacks, the world got real. (a) GEOMETRY —
  `gen_crystals.py` rewritten: quartz-habit shards (irregular hex prisms,
  6 jittered radii 0.72–1.12, taper, asymmetric 6-face pyramid tips w/
  off-axis apex); Shard0–3 single points, Shard4 twin (+34° lean child),
  Shard5 triplet cluster; local +Y growth axis PRESERVED so the runtime
  placement quats still work; glb 7.4KB Draco. (b) LIGHT — SECOND Cycles
  bake `lab-matcap-int.ktx2` (226.7KB): interior refraction matcap (Layer
  Weight facing ramp navy heart (.085,.20,.42)→grazing dark + Noise
  7.0/8.0/1.6 fracture streaks through 0.60→0.74 ramp, ADD 0.45, emission
  0.9 — took 3 bake iterations, brighter hearts blow out under ACES+bloom);
  `build-3d.mjs` bundles gained `extraMatcaps: []` looped in step 3.
  Fragment shader: `ri = texture2D(uMatcapInt, refract(-v,n,0.645).xy*
  0.49+0.5 + seedOffset)`, col = ri·tint² + mc²·mix(1,tint,.5)·fresnel +
  tint·(fresnel+band+pulse) + facet spark glints; **tint²/mc² squaring is
  what kills the washed-pastel read** (bodies stay deep navy, only rims/
  glints near white; bloom threshold raised 0.74, grain 0.055). Near-lens:
  R2 screen-door dither dissolve (`fract(dot(floor(gl_FragCoord.xy),
  vec2(0.75487766,0.56984029)))`, discard > nearK²) replaced v1's dark-
  silhouette slab; aerial fade to shaft-haze at 36u. (c) ATMOSPHERE — two
  additive godlight cones (`shaftLightMat(tint, down)`: fresnel-edge +
  mouth-softened falloff, uDown flips bright end; alpha 0.055 — 0.16 read
  as solid milk washing the hero): surface sun shaft (y −4, fades by
  cp·0.75) + lime core aura (y −41.5, peaks near F−0.85). (d) PERF —
  depth-band culling: buckets = 6 variants × 6 bands (BAND_H 10,
  `bandOf(y)=floor((3−y)/10)` clamped), loop sets `m.visible = minBirth <
  uGrow+0.02 && |bandY − camY| − 5 < 36`; provably pop-free (ungrown band
  = all scale-0; 36u = the shader's own aerial-fade horizon, vertical
  distance lower-bounds view distance). (e) Core bloom TAMED (scale
  .32+.6·r, radius 4.0–6.8, tint·0.6) — at v2 facet brightness the v1
  sizes read as screen-filling slabs over the end card; now the RESURFACE
  frame is the lit gem heart ringed by deep quartz spikes. Boot adds body
  class `lab-crystalline` ONLY on real asset boot (QA/smoke honesty
  marker); fallback copy in lab.html updated to describe the v2 pipeline.
  Smoke 2d +2 (crystalline poll, int-matcap served) = 18 lab checks, suite
  **248 ALL PASS** with HUB WIP stashed. Mobile <680 = lab-no3d, no
  crystalline claim (correct). Live-verified real Chrome (fx-on/
  lab-crystalline/lab-type-on on stackwith.me/lab.html, 00→04 chapters,
  console clean, 3 assets 200, homepage untouched hub3d.5XGXAZ7X). QA
  driver /tmp/lab-qa.mjs recreated (PORT 8147, `--mobile`/`--live`).
  **Stash lesson: `git stash push -- src/index.html src/assets/js/hub3d.js
  src/_includes/layouts/hub.njk` (WIP paths ONLY) — a bare stash grabs the
  ship's own tracked edits, and the path-scoped stash also popped clean
  with NO assets.json conflict.** HUB WIP restored, still uncommitted, its
  CSS layer still MISSING (see v3 warning below).

- **About page v5 "Signal Field — Machined" SHIPPED 2026-07-15** (user:
  "use blender models 3d workflow, make it even better and cleaner"; when a
  design-panel workflow was launched the user cut it off — "one is enough
  choose and make the best design" — so ONE design was chosen and built
  directly, no panel): commit `94dfbf3`, built ON TOP of v4. The hero
  procedural TorusGeometry ring hands off to a **Blender-authored machined
  gyroscope** — lathed bezel with REAL graduation-tick geometry + a cut
  phosphor groove (r≈4.215, shader paints it lime w/ rotating sweep +
  uBeat flash), two nested gimbal rings on radial pivot studs (A spins
  three-X at t·0.31+beat·0.20, B nested inside A spins three-Y at t·0.47)
  around the KEPT procedural breathing core; all lit by ONE Cycles-baked
  brushed-steel matcap whose light rig encodes the palette (warm key, cyan
  rim, lime kick, magenta fill). Second authored-asset bundle after lab:
  `assets-src/about/gen_instrument.py` (deterministic, zero RNG; bmesh
  spin-lathe helper + tick add_box loop + add_stud; matcap bake scene) →
  `scripts/build-3d.mjs` now a **BUNDLES map** (lab + about; positional
  args filter: `node scripts/build-3d.mjs about`, `--no-bake` kept) →
  `about-instrument.glb` 34.6KB Draco (367KB raw) + `about-matcap.ktx2`
  235.7KB UASTC, committed under `src/assets/3d/`. Runtime (about3d.js):
  GLTFLoader+DRACOLoader+KTX2Loader async IIFE (decoders shared w/ lab at
  /assets/3d/draco|basis/), matcap ShaderMaterial (mc·1.30 + irid fresnel
  ·0.22), parts found BY NAME (Bezel/GimbalA/GimbalB — throws if missing),
  B parented inside A, group copies ring pos/rot each frame; crossfade
  `machined.blend` 0→1 via gsap on dock, loop composes
  `ringU.uOp = bootState.ring·(1−heroBlend)·(1−blend)` and
  `machU.uOp = …·blend` FRESH each frame (never self-multiplied — v2 bug
  class). ANY failure → catch → procedural ring stays, silently. Orientation
  gotcha: Blender Y-spin profile + y-up glTF export lands rings in three's
  XY plane (axis Z) matching TorusGeometry; GimbalA studs on Blender X →
  three X, GimbalB studs on Blender Z → three Y. Honesty: colophon line got
  `#abColMach` span — static "0 STOCK ASSETS" stays true no-JS/no3d, JS
  refines to "0 STOCK ASSETS · HERO MACHINED IN BLENDER" only inside the
  dock success path (abColN pattern); body class `ab-machined` is the
  QA/smoke marker, also only set on dock. Smoke 2c +4 checks (docked-class
  12s poll, glb arrayBuffer>4000, ktx2 r.ok, colophon claim) = 30 about:
  checks, suite **246 ALL PASS** with HUB WIP stashed. Live-verified in
  real Chrome (fx-on/ab-type-on/ab-machined + colophon claim on
  stackwith.me/about.html, console clean, assets 200, homepage untouched
  hub3d.5XGXAZ7X). Mobile <680px is about-no3d by design → no machined, no
  colophon claim (correct honesty behavior). QA driver /tmp/ab-qa4.mjs
  gained ab-machined + colophon prints. HUB WIP stash-popped clean after
  ship (NO assets.json conflict this time — ship committed the fresh
  hashes). WIP still uncommitted, its CSS layer still MISSING (see v3
  warning below).

- **About page v4 "Signal Field — Calibrated" SHIPPED 2026-07-15** (user:
  "professional god level peak, add more detailing"): commit `fe690cd`, built
  ON TOP of v3 — additive detailing chosen by a 4-designer/2-judge workflow
  (saved: `.claude/workflows/about-v4-design-panel.js`; killed: hero char
  physics [smoke-pinned string], in-world specimen plaques [illegible behind
  DOF], scramble-everywhere, fake threshold-mapped loader lines). Shipped:
  (a) WORLD — signal-life packets per formation in the points vertex shader
  (`life(k, target)` evaluated on BOTH hand-off endpoints, blended by e, else
  it flickers; colon of "3:14" blinks at 1Hz at x≈−0.97 — derived from
  JetBrains Mono 0.6em advance, verify visually if font changes), global
  heartbeat `beatState` sampled from the SAME `ecgY()` the particles form
  (peak-hold decay; drives ring rim-flash/bloom/backdrop shaft/field sway,
  ~50BPM at t*9.2), per-chapter backdrop relighting (uShaftY per chapter +
  grade tint shared), reformation shockwave (uWaveT reset on hand-off),
  rack-focus overshoot (`focus + chapterPulse*?` — folded into bloom target,
  never self-multiplied), ring bezel graduations (smoothstep-on-cos, no
  moiré; needle idea dropped — parented to a spinning ring it would LIE).
  (b) HUD — real boot log (`bootLog()` dispatches `ab:boot` at true init
  milestones w/ real ms + GPU name via WEBGL_debug_renderer_info; loader
  prints last 3, no-ops after is-done), live telemetry `#abTelem` (real
  N/FPS/Q-tier @2Hz — honestly reads 12 FPS · Q:LO on swiftshader, that IS
  the P·04 brand), formation plaque `#abPlaque` + readout scramble (ONE
  shared `scramble()` util = single decode locus; first markChapter paint is
  INSTANT — smoke pins `/^0[1-6] \//`; plaque gated on fx-on so no3d never
  claims a formation it isn't rendering, seeded at end of start()),
  chapter-tinted bracket flash + rail accent via `--abAccent` on :root,
  spooling % (gsap.ticker lerp; instant under reduced) + hairline
  `#abHair` w/ ticks at REAL chTops offsets (placed in measureChapters),
  rail depth-gauge spine + hover labels. (c) SOUND — AnalyserNode inserted
  master→analyser→destination drives the 4 EQ bars for real (`.is-live`
  disables the CSS-keyframe fake meter; rAF stops when off), per-chapter
  drone key (`setTargetAtTime` ratios), stereo-panned channel blips.
  (d) CONTENT — work-row ship ledger (`.ab-row__meta`; Stackime date
  2026-07-08 verified in git; ≤860px grid-template-areas gained a "meta"
  row), principle proof links (3 blog posts map 1:1 by name + axon
  #datasheet — smoke asserts exact hrefs), rail marginalia
  (`.ab-kicker__note`, sticky under kickers), colophon `.ab-colophon`
  (plain div — [data-abchapter] count stays 6; static copy says "UP TO
  62,000", JS refines to exact N only when the world boots — stays true
  no-JS/no3d), marquee ink fill (`--mink` written in the SAME ticker as the
  x transform; span color `rgb(244 245 247 / var(--mink,0))`), exit-and-
  return underline on .ab-copy links. Desktop `.ab-row` gap became
  `.8rem 1.6rem` (row-gap for the meta line). Smoke 2c = 26 `about:` checks
  (+8 v4) — suite ALL PASS with HUB WIP stashed. Live-verified in real
  Chrome (fx-on/ab-type-on on stackwith.me, console clean, colophon shows
  exact 62,000, homepage untouched hub3d.5XGXAZ7X). QA driver
  `/tmp/ab-qa4.mjs` (`--mobile`/`--live`/`--dim`). HUB WIP stash-popped
  after ship (assets.json conflict → rebuild, same as v3 ship) — WIP still
  uncommitted, its CSS layer still MISSING (see warning below).

- **/lab.html "Deep Signal" SHIPPED 2026-07-13** (user pointed at igloo.inc:
  "add this type of workflow, make it extreme"): commit `4e1d7cd`, live-verified
  in a real browser (fx-on/lab-type-on boot, all 5 chapters advance, console
  clean, homepage untouched on hub3d.5XGXAZ7X). The igloo formula: near-empty
  DOM, ONE WebGL world — a five-chapter camera descent (SURFACE → DESCENT →
  THE VEIN → THE CORE → RESURFACE) down a crystal shaft; ~1.6k instanced
  shards GROW in per-instance as scroll passes their birth depth (uGrow =
  0.6·boot + cp·0.9 vs aBirth attr). **First authored-asset pipeline on the
  site** (everything else is procedural): `assets-src/lab/gen_crystals.py`
  runs in headless Blender (6 convex-hull shard variants + bevelled gem, and
  a Cycles-baked studio matcap) → `scripts/build-3d.mjs` (NOT part of npm
  build; Blender+toktx are machine deps) → Draco glb 7.3KB + UASTC KTX2
  232KB + Draco/Basis decoder runtimes, ALL COMMITTED under `src/assets/3d/`
  (new eleventy passthrough). `lab3d.js` (~700 lines, new esm entry): matcap
  ShaderMaterial w/ instanceMatrix + aTint/aBirth/aSeed attrs, near-camera
  silhouette fade (`mix(0.12,1,smoothstep(0.9,3.4,length(vV)))` kills lens-
  crossing flares), vein = 3 azimuth sectors tinted --ch0/1/2 at y −13..−27,
  troika chapter names (fill .07/stroke .55, prox slope 2.2), REAL-progress
  loader (LoadingManager), grade pass + governor + synth sound (drone filter
  darkens with depth, key `lab-sound`) reused from about3d. Fallbacks:
  <680/reduced/GL-or-asset-fail → `lab-no3d` styled reading article
  (`.lab-fallback`, also the crawlable copy; noscript unhides). Smoke:
  /lab.html in the section-1 page loop + section 2d (16 `lab:` checks incl.
  glb/ktx2/decoder serving — use arrayBuffer().byteLength, the smoke server
  sends no content-length) — suite ALL PASS with HUB WIP stashed. Sitemap
  +lab.html. QA drivers `/tmp/lab-qa.mjs` (+`-live` variant, `--mobile`).
  No hub card links to /lab yet (index.html is WIP-locked) — add one when
  HUB v4 ships.
  **CRITICAL BUG FIXED in the same ship (found reviewing lab, also live on
  about): three's ShaderPass CLONES the uniforms of a plain shader object
  (`UniformsUtils.clone`), so every render-loop write to the outer
  gradeUniforms hit a dead copy — about v3's grade dynamics (uTime grain/
  cnoise drift, uWarp, uTint chapter lerp, uMouse wake, tTrail fluid trail)
  shipped FROZEN at boot values; stills looked right because static uniforms
  (vignette/grain amount/initial tint) survive the clone. Fix: pass a real
  `new THREE.ShaderMaterial({...})` to ShaderPass (adopted by reference).
  Same silent-visual-no-op class as the v2 self-multiplying-uniform bug —
  when a ShaderPass "works in stills", check the uniforms are actually live.**

- **About page v3 "Signal Field — In-World" SHIPPED 2026-07-12** (user asked
  for activetheory.net "similar but better, award-winning performance" using
  the freshly installed award toolkit): built ON TOP of v2 in
  `src/assets/js/about3d.js` (~1100 lines). New in v3: (1) **in-world SDF
  typography** — troika-three-text ghost numerals 01–05 (outlined, fill .03 /
  stroke .34) standing at each chapter's camera stop; font is
  `src/assets/fonts/ClashDisplay-700.woff` (woff1 converted FROM the woff2
  via fonttools — troika can't parse woff2; digits verified present); fade =
  `cpEff = chapterProgress − 0.42` (probe sits 42% down the viewport — without
  this offset "01" bleeds into the hero) with slope 2.0 and per-glyph `at`
  (05 uses at:4.6, last chapter never reaches 5.42); body gets `ab-type-on`
  on first sync; ALL wrapped try/catch = numerals are optional. (2) **master
  grade pass** (WIP finished): fullscreen ShaderPass after OutputPass — CA,
  cnoise corner glow tinted per chapter (CH_TINT/CH_BLOOM lerp), split-tone,
  vignette, grain, breathing zoom, transition warp. (3) **fluid pointer
  trail** — 128² 2D canvas wake → CanvasTexture (`tTrail`) sampled in the
  grade pass; image warps along the trail's gradient + tint luminesce
  (AT's fluid sim without float FBOs, swiftshader-safe). (4) **hero
  instrument core** — vertex-noise-displaced icosahedron w/ thin-film fresnel
  inside the torus, pointer proximity (NDC, no raycaster) ripples it.
  **FIXED a live v2 bug found via DOM-dimmed QA shot: the loop assigned
  `uOp.value = uOp.value * (1-heroBlend)` — self-multiplying uniform decayed
  exponentially → the hero torus NEVER actually showed on v2.** Boot opacity
  now lives in `bootState` {ring,core}, uniform = bootState × blend.
  (5) **synth WebAudio sound design** — drone bed + bandpass shimmer,
  channel-pitched hover blips (D5/F#5/A5), noise whoosh on `ab:chapter`
  (markChapter now dispatches it), behind HUD pill `#abSound` (aria-pressed,
  sits OUTSIDE aria-hidden `.ab-hud`, fixed bottom-center z13); default OFF,
  pref in localStorage `ab-sound`, stored-on only ARMS until first
  pointerdown (autoplay policy). DOM-level: works in no3d/reduced-motion.
  (6) **adaptive quality governor** — frame-time EMA steps DPR through
  QCAPS tiers w/ hysteresis+cooldown (`applyQ` also re-syncs uPx/uResolution;
  resize handler must use `dprNow` not the boot DPR). Bundle 723KB min /
  209KB gz (troika +~50KB gz). Smoke 2c = 18 `about:` checks (+sound
  mounted/flips, in-world type booted via ab-type-on poll) — 211 PASS, only
  standing failure is the pre-existing uncommitted HUB v4 WIP chip check.
  QA driver: `/tmp/ab-qa3.mjs` (+`-mobile` variant); trick worth keeping:
  dim `#main` + hide scrim before a shot to photograph the raw world.
  Blender MCP was checked — addon still not connected in Blender, so the
  core is procedural (no asset). **Ship completed 2026-07-12 in a follow-up
  session** (prior session ended after writing this note but before commit):
  commit `9ce58aa`, HUB WIP stashed for the ship (smoke 212/212 ALL PASS with
  it stashed), pushed, live-verified in a real browser (fx-on + ab-type-on
  boot on https://stackwith.me/about.html, font/bundle 200, console clean,
  homepage still Spectrum `hub3d.5XGXAZ7X`), WIP restored after.
  **HUB v4 WIP WARNING (verified 2026-07-12): the WIP's CSS layer is GONE.**
  `src/index.html` markup uses `hub__stack/hubchips/hubcard__viz/hub__sechead/
  hub__grad/hub__hint` — zero rules for any of them in styles.css (the
  "/* HUB v4 Studio */ CSS rewrite" from the 2026-07-10 note was lost in a
  stash/conflict cycle). The WIP = new hero copy ("Build in public. Ship for
  real."), sticky-stack cards, gem-polyhedron hub3d.js ("The Gem"), hub.njk
  copy tweaks — but it renders UNSTYLED and fails smoke's chip check; the
  CSS + smoke updates must be rebuilt before it can ship. v2 foundation
  below still accurate:

- **About page v2 "Signal Field" — full morphing-world rebuild SHIPPED
  2026-07-11** (user: v1 "looked old", wanted true activetheory.net level;
  studied their live site + delivered bundle first — key insight: they run ONE
  persistent 3D world whose camera travels between chapter scenes, content is
  IN the world, not wallpaper behind it). `src/assets/js/about3d.js` fully
  rewritten (~700 lines): one 62k-particle field (26k below 1100px/coarse)
  morphs through SIX formations tied to chapters — ECG heartbeat wave →
  core+tilted orbit → three braided channel strands → "3:14" glyphs (canvas
  text sampling, JetBrains Mono via document.fonts.ready) → cubic lattice →
  ∿ pulse mark. Morphing is vertex-attribute based (aT1..aT5 vec4 attrs =
  pos+hue, per-particle staggered flight + mid-flight curl swarm) — NO
  float-texture/GPGPU dependency, works on swiftshader. Keyframed Catmull-Rom
  camera rig (KEYS per chapter; lookAt.x biased +2ish on copy chapters so the
  formation sits screen-LEFT of the right-hand text column), shader DOF
  (coc from uFocus, alpha/coc² so defocus dims — critical, else washout),
  bokeh dust layer, iridescent fresnel torus in hero (rises away on scroll),
  UnrealBloom 0.22. DOM chrome: shutter loader (big counter + scaleY panels,
  GSAP char-stagger wordmark), corner-bracket HUD (`#abReadout` chapter +
  `#abPct` scroll %), custom cursor (dot + lagging labelled ring,
  `[data-cursor]`), outlined-text verbs marquee (scroll-velocity driven),
  masked line-rise hero (`.ab-lnmask/.ab-ln`, JS-set initial states so no-JS
  is safe) + stroke-drawn pulse underline SVG, scroll-velocity skewY on main,
  magnetic CTA. Layout: chapters are `230px kicker | body` grid w/ sticky
  kickers + `::before` radial vignette behind body text (legibility over
  bright formations); principles = ledger rows; work-row hover dims siblings
  + excites that channel's strand (uEx). Smoke 2c now 15 `about:` checks
  (added marquee/HUD-readout/pulse-path) — suite 209/209 PASS. QA driver kept
  at `/tmp/ab-qa.mjs`. Verified LIVE: body classes fx-on/ab-in, hero+origin
  screenshots good, homepage untouched (hub3d.5XGXAZ7X). GOTCHAS: (a) global
  `.page main{max-width:860px}` must be beaten by `.ab-body main.ab` (v1's
  bare `.ab` selector silently lost → squeezed layout); (b) hero uses
  Fable-set `white-space:nowrap` per line, dropped <680px; (c) the HUB v4
  WIP was stashed during ship — `git checkout --theirs` conflict on generated
  assets.json, resolved by rebuild; WIP restored, STILL uncommitted.

- **Homepage v3 "The Spectrum" — WebGL 3D hero SHIPPED 2026-07-10**
  (user-requested "award-winning / 3D"): new `src/assets/js/hub3d.js` ESM bundle
  (three.js, added to build-assets esm build alongside neural3d) renders three
  braided signal ribbons — channel colors **AXON lime #B8FF3C / Stackime magenta
  #FF4FA3 / Log cyan #4FC4FF** (`--ch0/1/2` tokens scoped to `.hub-body`) — plus
  particle dust through UnrealBloom+ACES on fixed `canvas#hubfx` (NOT `.nerve`;
  smoke's "no nerve canvas" still passes). Hover on any `[data-ch]` card/tuner-chip
  excites that ribbon (uniform lerp). Same bundle does DOM choreography: `fx-dom`/
  `hub-in` body classes gate hero line-rise + `[data-hubreveal]` IO reveals
  (no-JS = everything visible), pointer card tilt. Fallback `<680px`/reduced-motion/
  GL-fail → `body.hub-no3d` static tri-hue scrim. Hero: "One stack. Many signals."
  w/ animated gradient word + CH·01/02/03 tuner chips (replaced stat strip); cards
  per-channel accents (color-mix); ALL AdSense content sections kept verbatim.
  Smoke: 13 hub checks incl. "spectrum 3d booted" (WebGL works in smoke Chrome)
  ALL PASS. GOTCHA: smoke's static server binds **port 8123** — kill any QA
  http.server on 8123 first. Verified live: hub3d asset 200, axon.html untouched.

- **Homepage redesigned as full modern landing page SHIPPED 2026-07-09**
  (user-requested): single-screen hub → multi-section professional landing with
  hero (eyebrow blip, display h1, CTA buttons, stat strip), 3 upgraded section
  cards (tag chips, gradient borders, larger marks), "What is stackwith.me?"
  about section (400+ char substantive copy + 3 value-prop tiles), latest blog
  posts section (3 hardcoded post cards w/ dates + summaries), closing CTA band,
  full sitemap footer (hubfoot__ classes: brand + 3 cols for Sections/Company/Legal).
  hub.njk nav gained Blog link; WebSite JSON-LD added. CSS: full `/* HUB */`
  rewrite (radial bg glow, new hero/cards/tiles/footer grid, mobile responsive).
  Smoke: 9 hub checks (5 existing + hero CTAs + about copy ≥400 + 3 postcards +
  footer sitemap links) ALL PASS. Design tokens unchanged; AXON/anime/blog untouched.
  QA'd headless 1440 + 390 screenshots; live at https://stackwith.me/.
  **AdSense readiness:** substantial original content, complete nav/footer with
  Privacy/Terms/About/Contact, blog posts, no thin "under construction" signals.
  Plan: `docs/superpowers/plans/2026-07-09-homepage-redesign-adsense.md`.

- **Homepage became a portal hub; AXON moved to subsection SHIPPED 2026-07-09**
  (earlier same day, user-requested): `/` = single-screen hub (`layouts/hub.njk` +
  `src/index.html` + `/* HUB */` CSS) with cards → `/axon.html`, `/anime.html`,
  `/blog/`. The AXON landing moved **verbatim** to `src/axon.html`
  (`permalink: axon.html`; home.njk nav gained a `Home → /` link). Nav label
  "Anime" → **"Stackime"** site-wide; page/checkout navs gained an Axon link.
  All `/#plans`+`/#engage` anchors now → `/axon.html#…` (incl. checkout.js
  invalid-plan redirect + `#payDone`). Sitemap has /axon.html (0.9). Smoke
  reworked: section 2 = hub checks (`hub:`), 2b = ex-index runtime (`axon:`),
  sections 4–6 visit /axon.html, consent tests stay on `/`; label assertions
  updated ("Home,Axon,Blog,Stackime" on anime page) — ALL PASS. Verified live:
  hub at `/`, 200 on /axon.html, Stackime label on anime nav. Plan:
  `docs/superpowers/plans/2026-07-09-hub-homepage-axon-subsection.md`.
  NOTE for older notes below: anything that says "index" / homepage about the
  AXON landing now means **/axon.html**.

- **Anime page rebranded "Stackime" + intro splash SHIPPED 2026-07-08**
  (user-requested): /anime.html brand is now **Stackime** — user asked for a
  small unique fusion of "stackwithme" + "animelist"; "Stackime" had zero exact
  web hits ("AniStack" was taken). New title/eyebrow/h1/lede in `src/anime.html`;
  nav label stays "Anime" (smoke asserts it site-wide). Opening plays an
  enma.lol-style splash: fullscreen black `#aniIntro` overlay (layouts/anime.njk),
  "STACKIME" SVG text stroke-draws in `--signal` then glow-pulses then overlay
  fades (`.ani-intro*` rules at end of `/* ANIME */` CSS; keyframes aniIntroDraw/
  Glow/Tag), dismissed by anime.js at 3.4s (click skips; prefers-reduced-motion
  hides + removes). Smoke: "anime: stackime intro painted" + "anime: intro
  auto-dismisses". Headless screenshot QA confirmed draw/glow/reveal; the live
  Supabase `anime_catalog` call returned 200 empty ("No titles yet") — the anime
  SQL migration appears to have been applied.
  **Round 2 (same day, user-requested):** (a) anime banner art now reveals
  INSIDE the letters (SVG `<mask>`; anime.js shuffles hardcoded AniList CDN
  banners — `INTRO_BANNERS`); (b) AniList discover rails on the catalog view
  (`#aniDiscover`): Trending now / New & airing / Coming soon via one aliased
  GraphQL query (`DISCOVER_QUERY`, sessionStorage cache, silent-skip on failure,
  rails hidden while the filter has text). Rail cards use `.ani__railcard` (NOT
  `.ani__card` — smoke counts depend on that). Click: in catalog → `#a/<id>`;
  signed-in → add-modal entry stage prefilled (`pick(m)`); signed-out → sign-in,
  then `pendingPick` restores the picked title.
  **Round 3 (same day, user compared to enma and wanted video-feel + pro
  discover):** enma actually clips a real `<video src="/intro.mp4">` into its
  letters via foreignObject+clipPath (verified in their bundle). Asset-free
  equivalent shipped: THREE `<image>` frames Ken-Burns-crossfade inside the mask
  (`.ani-intro__art--1/2/3`, shuffled per load), a light sheen sweeps the
  letters after the outline draw (~2.4s), overlay scale-out on exit; dismiss at
  3.8s (remove 4.4s — smoke sleeps 1700ms before the dismissal check).
  Discover got: rotating SPOTLIGHT hero (top-5 trending w/ bannerImage, 7s
  interval + dots + hover-pause, "+ Track this" CTA → same `discoverPick()`
  flow), rail scroll arrows (`.ani__railbtn`, hidden on hover:none), hover
  "+ Track" overlay + ★ score badges on rail cards; fragment now fetches
  bannerImage/averageScore/description; cache key bumped to
  `stackime-discover-v2`. GOTCHA: smoke section 1 visits /anime.html
  un-stubbed → real AniList data lands in the sessionStorage cache → section 7
  stub preload must `sessionStorage.removeItem("stackime-discover-v2")` (it
  does; keep key in sync).
  **Round 4 (same day):** intro now clips a REAL `<video>` into the letters
  (enma's exact foreignObject + clipPath structure): self-generated royalty-free
  clip `src/assets/video/intro-signal.mp4` (455 KB, 1280×288, 3.4s — anime
  speed-lines + AXON heartbeat pulse in --signal lime), regenerable via
  `scripts/gen-intro-video.py` (venv: pillow + imageio + imageio-ffmpeg;
  deterministic seed). Passthrough `src/assets/video` added to
  eleventy.config.js; smoke server MIME map has .mp4. Video `ended` → dismiss
  (enma pattern) with the 3.8s timer as fallback; autoplay-refusal is caught and
  the 3 Ken-Burns banner frames underneath carry the splash (they stay in the
  markup as the no-video fallback).

- **Anime list community tracker SHIPPED 2026-07-08** (Tasks 1–9, 11 of
  `docs/superpowers/plans/2026-07-07-anime-list-community-tracker.md`): public
  `/anime.html` ("AniList from AXON") — community catalog + per-user lists +
  AniList GraphQL search, backed by Supabase tables `anime` / `anime_entries` /
  `profiles` + `anime_catalog` view (public reads, owner-only column-scoped
  writes). New `src/assets/js/anime.js` bundle (own Supabase client, same
  `__axonAuthCfg` hook), `layouts/anime.njk`, `/* ANIME */` CSS section, smoke
  section 7 (`anime:` checks, network fully stubbed). "Anime" nav link added to
  home (desktop+burger), page, checkout navs — **user-sanctioned**.
  **USER-GATED, OPEN: paste `supabase/migrations/20260708000001_anime.sql` into
  the Supabase SQL editor** (page shows "Catalog is initializing" until then),
  then live-check: Google sign-in on /anime.html → add a title → visible
  signed-out. NOTE: two migration files share the date — `…000002_executor_schedules.sql`
  (on-hold executor work, untracked) vs `…20260708000001_anime.sql` (shipped).

- Toolchain migration plan **fully executed (Tasks 1–15)** and live:
  `docs/superpowers/plans/2026-07-05-axon-site-professional-toolchain.md` (all boxes checked,
  deviations noted inline). Eleventy 3 + esbuild + self-hosted fonts + consent-gated AdSense +
  CDP smoke harness (`npm run build && npm run smoke` → must be ALL PASS).
- Deploys: push to `main` → `.github/workflows/deploy.yml` → Pages artifact
  (Pages `build_type=workflow` since 2026-07-06). Old home-directory clone of this repo
  was deleted per plan Task 15 (`~/package.json` + `node_modules` with framer-motion were
  unrelated and left in place).
- `gh` CLI is NOT installed. For GitHub API calls, pull the token from the keychain:
  `git credential fill` → `curl -H "Authorization: token …"` (worked for the Pages API).
- Manual step still open: create a Formspree form and paste its endpoint into
  `FORM_ENDPOINT` in `src/assets/js/main.js`.
- **Pricing plans feature implemented** (Tasks 1–7 of
  `docs/superpowers/plans/2026-07-06-razorpay-pricing-plans.md`; spec in
  `docs/superpowers/specs/`). Client-side Razorpay Checkout + EmailJS benefits mail +
  canvas Supporter Pass, all in `src/assets/js/payments.js` + modal in `index.html`.
  **Live config set 2026-07-07** (user supplied `rzp_live_…` + EmailJS IDs directly;
  test-mode QA skipped — impossible against a live key). Local live sanity check passed:
  production sheet opens order-less with correct amount/theme/prefill.
  **Pending (Task 8 Step 4, user-gated):** one real ₹5 Hobby purchase on stackwith.me,
  confirm captured + notes in dashboard (notes now include `plan, buyer_name, auth_uid,
  auth_provider`), EmailJS mail arrives, then refund; then Step 5 close-out.
- **Purchases moved to a sign-in-gated `/checkout.html`** (2026-07-07, Tasks 1–3 of
  `docs/superpowers/plans/2026-07-07-signin-checkout-page.md`; spec in
  `docs/superpowers/specs/`). Supabase Auth (Google/GitHub/Discord/email+password) in
  `src/assets/js/checkout.js`; `payments.js` refactored to `PLANS` + `initPayFlow`;
  the index checkout modal is **gone**. **Supabase config is set in `checkout.js`**
  (2026-07-07: project URL + `sb_publishable_…` key; email+password sign-in QA'd E2E
  headlessly against the real project — wrong-password error, sign-in → pay stage,
  prefill readonly, session persists, sign-out). **Pushed live 2026-07-07:** Google
  provider ENABLED in Supabase (verified: `/auth/v1/authorize?provider=google` 302s to
  a real consent screen) so the hold was released; GitHub/Discord are still DISABLED
  in the dashboard, so their buttons ship `disabled` with a `payauth__soon` "soon"
  badge (checkout.html + styles.css) — when the user enables those providers, remove
  the `disabled` attrs + badges and repush. **Still recommend Confirm email OFF**:
  it's ON and the default Supabase SMTP allows ~2 confirmation mails/hour ("email rate
  limit exceeded" otherwise). Remaining user-gated steps: live Google sign-in spot
  check, then the ₹5 purchase verification above. Never commit the `sb_secret_…` key
  (admin/service key, used only for transient local QA; user was advised to rotate it).
- **Next feature: Hobby benefits fulfillment** (planned 2026-07-07, not started):
  buyers must actually receive every Hobby-tier benefit after activation. Plan with
  benefit→deliverable map and 14 tracked tasks:
  `docs/superpowers/plans/2026-07-07-hobby-benefits-fulfillment.md`. Key calls: agents
  are signal watchers (no LLM), Supabase Edge Functions for trusted writes (Razorpay
  webhook activation, run executor), new `/console.html` + `/registry.html`. The
  verbatim honest-copy line ("no software product is provided") stays until Task 12's
  replacement is user-sanctioned; Studio parity is an open user decision (Task 14).

## Standing decisions

- Design stays pixel-identical unless the user sanctions a change (sanctioned so far:
  `--faint` → `#78828E`, honest form copy; 2026-07-06: tier cards show ₹5/₹6,999 one-time
  prices, plans heading "Start for ₹5…", checkout modal).
- Payments: checkout page (`/checkout.html?plan=…`) + `payments.js` + smoke section 6
  ("pay:" checks) + section 6b ("gate:" checks) exist; `window.__axonEmailCfg` and
  `window.__axonAuthCfg` (accepts `{ session }` and/or `{ url, key }` overrides) are
  QA/smoke config-override hooks — do not remove. Honest-copy
  line on the page is verbatim-sanctioned; amounts are exact (500 / 699900 paise).
- Tier CTAs are links to `/checkout.html?plan=hobby|studio` (same classes/`data-probe`);
  the checkout page is `noindex`; sign-in required before the pay stage.
- Out of scope, never touch: `src/blog/`, `src/404.html`, and the BLOG/FAQ/404 CSS sections
  in `styles.css` (carried over verbatim, copied not templated).
- AdSense client `ca-pub-7262404901375077`; consent localStorage key `axon-consent`;
  AdSense loads ONLY after "Accept all" (consent.js `loadAds()`).
- Chrome for QA/smoke: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- QA baselines: `/tmp/axon-qa-baseline-desktop` + `/tmp/axon-qa-baseline-mobile`
  (post-migration finals: `/tmp/axon-qa-final-desktop|mobile`). `/tmp` is volatile — regenerate
  with `npm run qa` if missing.
