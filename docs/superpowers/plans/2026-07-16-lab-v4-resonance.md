# Lab v4 — "Deep Signal — Resonance" (2026-07-16)

v1 built the descent, v2 made the world real, v3 made it rich. **v4 makes it
RESPOND**: the crystal shaft answers the pointer — crystals ring where you
touch the wall, and THE CORE becomes a playable instrument (hold to charge
the heart, release a shockwave). This is the igloo-tier ingredient the lab
still lacks: **interactivity with the world itself**, not just a camera on
rails.

Everything is runtime-only (`lab3d.js` + CSS + lab.html + smoke) — **no
Blender, no asset rebuilds**, so every task is a small, independently
committable diff (cooldown-resilient like the v3 plan).

## Contract (unchanged from v3 — do not break)

- Body classes: `fx-dom / lab-in / fx-on / lab-crystalline / lab-type-on /
  lab-no3d`. v4 adds `lab-resonant` (honesty marker: set only when the
  first real ripple is written) and `lab-cursor-on` (reticle active).
- Asset paths / node names / glb+ktx2 untouched. New shader uniforms are
  ADDITIVE (`uRip[4]`, `uWave`, `uCharge`).
- The deep-navy discipline: ripple/shock glow is tint-colored and capped —
  bodies never wash pastel (v2/v3 lesson: contributions get squared/bloomed).
- Existing 18 smoke `lab:` checks stay green throughout; suite must be ALL
  PASS **with HUB WIP path-scope-stashed**
  (`git stash push -- src/index.html src/assets/js/hub3d.js
  src/_includes/layouts/hub.njk`).
- Homepage stays `hub3d.5XGXAZ7X` — never touched.

## Tasks

- [x] **Task 1 — Pointer resonance (visual).** Analytic ray→shaft-wall hit
  each pointermove (unproject NDC ray, intersect cylinder x²+z²≈9.2² around
  the shaft axis — no THREE.Raycaster, O(1)); write into a 4-slot round-robin
  ripple buffer `uRip[4]` (xyz = world hit, w = birth time; new slot only if
  moved >1.2u or >120ms). Shard shaders: vertex swell `1 + 0.06·k`, fragment
  glow `vTint · k · ~0.5` where k = smoothstep-radius-3.5 kernel ×
  exp time decay ~1.1s, summed over 4 slots. Coarse pointers: taps ripple
  (pointerdown), continuous excite is hover-fine only. First ripple sets
  `lab-resonant`; `__labQ()` gains `rip`. QA screenshots must hold the navy
  read. Commit.

- [x] **Task 2 — Resonance sound.** Module-level `chimeRef(hit)` exposed from
  the sound block (same pattern as `bedFilterRef`): ≤6-voice pool, sine +
  faint 5th partial → lowpass → StereoPanner (pan = hit.x/9), pentatonic
  degrees over the 48Hz drone root, octave drops with depth, ~0.9s exp decay,
  gain ≤0.05, throttle ≥110ms, only when `soundOn`. Ripples call it. Commit.

- [ ] **Task 3 — Core charge event.** Armed when `heartNear > 0.15` (reuses
  the existing loop math): pointerdown ramps `uCharge` 0→1 (~1.1s) — heart
  uEnergy and bloom swell, drone filter opens, FOV pinches −4·charge
  (dolly-zoom read). Release (or full charge) fires `uWave` (origin = heart,
  expanding band radius `(t−t0)·9`, exp decay): shard band-glow + swell,
  bass thump (42Hz sine + noise crack through master), grade kick via the
  existing chapterPulse path, camera roll kick. DOM cue `[ HOLD TO CHARGE ]`
  bottom-center while armed & unused, fades after first fire. Touch works
  (pointerdown/up). `__labQ()` gains `charge`. Commit.

- [ ] **Task 4 — Reticle cursor + HUD polish.** `#labCursor` instrument
  reticle (dot + thin bracket ring; rotates/expands on press; label slot fed
  by `[data-cursor]` on the end-card links) — hover-fine && !reduced only,
  about3d cursor pattern; body `lab-cursor-on`. Magnetic end-card links
  (gsap quickTo). `#labReadout` flickers (class-toggle text-shadow pulse) on
  ripple. CSS additions inside the LAB section only. Commit.

- [ ] **Task 5 — Ship.** Fallback copy gains one honest sentence about
  resonance/charge interaction (stays ≥400 chars). Smoke 2d: `lab: resonance
  ripples fire` (synthetic pointermoves → poll `lab-resonant`), `lab: core
  charge responds` (scroll ~78%, pointerdown ≥1.2s → `__labQ().charge >
  0.3`), `lab: reticle cursor mounted` (#labCursor in DOM). Full suite ALL
  PASS with HUB WIP stashed; push; live-verify real Chrome on
  stackwith.me/lab.html (boot classes incl. lab-resonant after a wiggle,
  00→04, console clean, homepage hub3d.5XGXAZ7X); restore WIP; CLAUDE.md
  v4 note. Commit.

## Resumability

Each task lands as one commit and the page remains shippable after any of
them: ripples alone are a complete feature; sound, charge, and cursor are
strictly additive layers. If a cooldown interrupts mid-task, `git status`
+ this file's checkboxes carry the state.
