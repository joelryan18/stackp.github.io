# Lab v5 — "Deep Signal — Pocket Descent" (2026-07-16)

Under 680px the lab serves the reading fallback, but the runtime already
has everything a phone needs: the MID tier builds LOD1-only meshes with
dispersion off and DPR capped, touch taps already strike (v4), charge is
hold-based, and the reticle correctly stays desktop-only. **v5 opens the
gate and tunes a true PHONE tier below MID** so mobile gets a real descent
instead of an article.

## Contract (do not break)

- Desktop/tablet rendering pixel-identical: PHONE tier activates ONLY
  under 680px; MID/full tiers keep their exact current parameters.
- The fallback article remains for no-JS / reduced-motion / GL-or-asset
  failure — only the width check leaves the gate.
- All 251 existing smoke checks stay green; suite ALL PASS with HUB WIP
  path-scope-stashed (`git stash push -- src/index.html
  src/assets/js/hub3d.js src/_includes/layouts/hub.njk`).
- Homepage untouched (hub3d.5XGXAZ7X).
- Honesty: the fallback's "viewport wider than 680px" sentence becomes
  false and must be rewritten; new body class `lab-pocket` is set only
  when the PHONE tier actually boots the world.

## Tasks

- [x] **Task 1 — Open the gate + PHONE tier.** Gate becomes
  `if (!canvas || reduced) no3d()`. `PHONE = innerWidth < 680` (implies
  MID). PHONE tuning in start(): WALL 460, GARDEN 70, CORE 70, dust 180,
  DPR cap 1.1, QCAPS [1.1, 0.9, 0.75], bloom strength ×0.85, camera FOV
  +6 (portrait framing). Tier chosen at boot (same policy as MID today).
  Body gets `lab-pocket` beside lab-crystalline; `__labQ()` gains
  `pocket`. Fallback copy sentence rewritten honestly. Verify
  /tmp/lab-qa.mjs --mobile: fx-on + lab-pocket + chapters + console
  clean. Commit.

- [x] **Task 2 — Touch-fit DOM chrome.** ≤680px LAB CSS: HUD stays but
  compact (smaller readout/pct, corners inset, safe-area-inset-bottom);
  sound pill compact; charge cue above the safe area; intro word scale
  verified. `.lab-body { overscroll-behavior-y: none }` to stop
  pull-to-refresh killing the descent. Verify base.njk viewport meta
  (viewport-fit=cover — add only if missing, without touching other
  pages). --mobile screenshots at 0/30/60/99%. Commit.

- [x] **Task 3 — Touch feel.** Today continuous strikes are hover-fine
  only; add a coarse-pointer path: while a pointer is down, pointermove
  strikes (drag-to-ring). Taps and hold-to-charge already work on touch.
  Verify with --mobile QA probes (drag sequence → rip count climbs,
  charge probe passes). Commit.

- [ ] **Task 4 — Ship.** Smoke: new mobile lab block (metrics 390×844) —
  `lab-m: pocket world boots` (fx-on + lab-pocket, 15s poll),
  `lab-m: HUD visible`, `lab-m: tap strikes` (pointerdown →
  lab-resonant); restore desktop metrics after. Full suite ALL PASS with
  HUB WIP stashed; push; live-verify real Chrome BOTH desktop (classes
  unchanged) AND --live --mobile (lab-pocket, chapters, strikes, console
  clean, homepage hub3d.5XGXAZ7X); restore WIP; CLAUDE.md v5 note.
  Commit.

## Risks / notes

- swiftshader at 390×844 with ~460 shards + bloom: the governor steps
  down (its job); the boot check's 15s poll was enough for ~1600 shards
  at 1440×900.
- iOS Safari untestable here — the tier is conservative (fewer instances
  than MID, which already targets low-end tablets) and every failure
  path still lands in the lab-no3d fallback.
- Lenis does not hijack touch (native scroll) and progress() reads
  scrollY — nothing to change for scrolling.

## Resumability

Each task lands as one commit and the page stays shippable after any of
them (Task 1 alone is the feature; 2–3 are polish layers). Checkboxes +
`git status` carry the state across cooldowns.
