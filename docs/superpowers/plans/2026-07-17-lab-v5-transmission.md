# Lab v5 — "Deep Signal — Transmission" (2026-07-17)

User directive: own the page, take theme/hero/colors to award level, must read
hand-crafted. Supersedes the 2026-07-16 "transcendent" draft (deleted — its
checkboxes claimed 12/12 while 4 shader features sat uncommitted, two of them
defective) and folds in the open boxes of `2026-07-16-lab-v5-pocket-descent.md`.

## Verdict on the inherited WIP (uncommitted lab3d.js, +99 lines)

- **KEEP** breathing shaft walls (proximity-gated radial pulse) — correct as written.
- **KEEP** proximity morphing (elongate/twist/pulse near camera) — params tuned here.
- **REBUILD** spring camera: the WIP created + stopped two `motion` animations
  *per frame* — the spring never integrated, pure allocation churn, +62kb dep.
  Replaced with a hand-rolled damped harmonic spring (semi-implicit Euler,
  ω≈4.4 ζ≈0.85, dt-clamped). `motion` removed from package.json.
- **REBUILD** time dilation: `dilatedT = t * dilation` with a falling dilation
  makes uTime run BACKWARDS during fast descents (d/dt = dil + t·dil′ < 0),
  so v4 ripple/wave births stamped "now" acquire negative age → the resonance
  and charge-wave systems silently die at depth. Fix: accumulated world clock
  `labT += dt * dilation` — monotonic; shaders and strike/wave stamps share it.

## The ship

One fiction — a recovery descent — carried by five climates and a live log.

- [x] **Task 1 — Foundation.** Hand spring camera (pos+look, overshoot ~ζ0.85,
  reduced-motion unaffected — no3d path), accumulated dilated clock `labT`
  (world visuals + stamps; governor/grade-grain stay on real t), morph tune
  (pulse 0.08→0.05), `npm rm motion`. Build + QA screenshots. Commit.

- [x] **Task 2 — Five climates.** Per-chapter atmosphere: CH_FOG drives
  scene.fog + clearColor + shaft uTop/uDeep + shard uHaze (aerial fade —
  replaces the hardcoded vec3), all lerped in the loop. DOM follows: JS sets
  `--labAcc`/`--labAccSoft` on :root per chapter (ice #9FD8FF → cyan #4FC4FF →
  magenta #FF4FA3 → lime #B8FF3C → pearl #E9F2FF); LAB CSS adopts
  `var(--labAcc, …)` for cursor dot/ring, cue line, readout ping, sound-pill
  on-state, intro bar — with color transitions so the chrome *travels*. Commit.

- [x] **Task 3 — Descent log (signature).** (a) Loader transcript
  `.lab-intro__log`: real boot milestones with real ms (GL context, glb+matcaps
  loaded, world built with true instance count, font). (b) HUD depth meter:
  `DEPTH −0,000 M` (scroll depth × 4,600 m fiction; #labPct kept). (c) One
  transmission line per chapter, scramble type-on at hand-off (`#labTx`, mono):
  00 CONTACT · SIGNAL FAINT · 4,600 M BELOW / 01 DESCENT BEGUN · THE WALLS
  GROW AS YOU PASS / 02 THREE CHANNELS BRAIDED · CURRENT RISING / 03 SOURCE
  PROXIMITY · HOLD TO CHARGE / 04 SIGNAL RECOVERED · BEGIN ASCENT. (d) End
  kicker → "[ SIGNAL RECOVERED ]". Honesty: `lab-transmission` body class only
  when the log actually paints; gated on fx-on so no3d never claims it. Commit.

- [x] **Task 4 — World mechanics.** (a) Strike cascade: uRip 4→6 slots;
  strike() scans plan origins for ≤2 neighbors within 5u, schedules echo
  ripples at +120/220 ms (direct slot writes, no recursion), `__labQ().echo`.
  (b) Charge inhale: shard vertex uCharge pulls instance origins toward the
  camera (k=0.045·smoothstep(25,6,d)) — space compresses while you hold.
  (c) Core breakdown: grade uBreak (window around cp 3.2, amplified by charge)
  → occasional hash-gated scanline tears + CA spike. Commit.

- [ ] **Task 5 — Pocket chrome + touch feel** (pocket plan tasks 2–3).
  ≤680px: HUD compact instead of hidden (smaller type, inset corners,
  safe-area-inset-bottom on pill/cue), overscroll containment, viewport-fit
  check (base.njk, add only if missing). Coarse pointers: drag-to-ring
  (pointermove strikes while a pointer is down). Check pocket plan boxes. Commit.

- [ ] **Task 6 — Ship** (pocket plan task 4 folded in). Fallback copy rewritten
  for v5 (springs/climates/cascade/log claims honest, ≥400 chars). Smoke: +
  transmission log paints, climate accent changes with depth, cascade echo
  fires, depth meter counts, and the mobile lab block (390×844 metrics: pocket
  boots, tap strikes; restore metrics). Adversarial review pass on the full
  diff. Full suite ALL PASS with HUB WIP path-scope-stashed (`git stash push --
  src/index.html src/assets/js/hub3d.js src/_includes/layouts/hub.njk`). Push;
  live-verify real Chrome desktop AND --mobile (classes, chapters, strikes,
  charge, console clean, homepage hub3d untouched); restore WIP; CLAUDE.md.

## Contract (do not break)

- All 251 existing smoke checks stay green; readout format `NN / NAME`, end
  card hrefs `/about.html,/`, marker classes, `__labQ()` shape (additive only).
- Deep-navy body discipline: climates tint, never wash; alpha lessons stand
  (0.16 = milk). Bloom threshold 0.74 untouched.
- Homepage untouched (hub3d.5XGXAZ7X); HUB WIP stays uncommitted, stash
  path-scoped only.
- Honest copy everywhere: no claimed feature without its runtime marker.
