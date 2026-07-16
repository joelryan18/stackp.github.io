# Lab v3 "Deep Signal — Prismatic" — high-poly, igloo-exceptional upgrade

User ask (2026-07-16): improve /lab.html further toward igloo.inc-exceptional;
convert the low-poly crystals to high-poly; divide the work into separate
tasks because ~5 hr cooldowns may interrupt sessions.

Built ON TOP of v2 (commit `ffa56e7`). Same 5-chapter descent, DOM, fallbacks,
honesty contract. What changes: geometry density, matcap fidelity, shader
optics, atmosphere, and a LOD system so high-poly stays 60fps.

## Contract that must NOT break (from v2)

- Node names: `Shard0..Shard5` prefix + exact `Gem`; local +Y growth axis.
- Body classes: `fx-dom` always; `lab-in`; `fx-on`+`lab-crystalline` only on
  real asset boot; `lab-no3d` fallback; `lab-type-on` from troika sync.
- Asset paths `/assets/3d/lab-crystals.glb`, `lab-matcap.ktx2`,
  `lab-matcap-int.ktx2`, draco/basis dirs; font ClashDisplay-700.woff.
- Smoke 2d (18 checks) incl. glb byteLength > 4000, readout regex, end-card
  hrefs, fallback ≥ 400 chars. Coupled numbers: aerial-fade 36u ↔ band cull;
  BAND_H 10 / NBANDS 6; uGrow ↔ births ↔ minBirth.
- Homepage untouched (hub3d.5XGXAZ7X); HUB WIP stashed PATH-SCOPED for ship:
  `git stash push -- src/index.html src/assets/js/hub3d.js src/_includes/layouts/hub.njk`

## Task 1 — GEOMETRY: high-poly quartz (`gen_crystals.py` rewrite) [commit alone]

- Prism cross-section 6 → 6 with **beveled edges**: keep quartz hex habit
  (real quartz IS 6-sided; hi-poly ≠ round), but every hard edge gets a
  Bevel modifier (width ~0.02, segments 2–3, angle limit 30°) → catch-light
  edge highlights, the single biggest "expensive" read.
- Add mid-height ring loops (3–5) with slight radius noise → subtle facet
  banding / growth striations along the prism (real quartz striae, horizontal
  on prism faces).
- Termination: multi-step pyramid (2 stacked taper rings before apex) with
  per-face jitter; small parasite crystals (1–2 micro spikes) on Shard3–5.
- Targets: Shard0–3 ~800–1,500 tris each, Shard4 ~2,500, Shard5 ~3,500;
  Gem: `n_pts` 30→90, bevel segments 1→3 (~2–3k tris). Total glb should land
  ~40–90 KB Draco (fine; about-instrument is 34.6 KB).
- **Also emit LOD geometry**: second low-detail copy per shard named
  `Shard0_LOD1` … (roughly the v2 density) for far bands. Keep +Y axis
  identical between LOD0/LOD1 so the same instance matrices work.
- Keep flat facets (`use_smooth=False` on facet faces) but let bevel strips
  shade smooth (mark bevel geometry smooth via modifier `harden_normals` or
  smooth-by-angle 30°) — that's the machined-crystal look.
- Deterministic seeds preserved. Verify in Blender headless: print tri counts.

## Task 2 — LIGHT: 1024² matcap re-bakes + dispersion source [commit alone]

- Re-bake both matcaps at **1024×1024** (v2: 512), samples 256. At v2's 512
  the new fine bevels would alias.
- Exterior: add a thin bright ring light (edge highlight source for bevels)
  to the 5-light rig; keep deep-navy body (the tint²/mc² squaring downstream
  depends on a dark body — do NOT brighten the base, brighten only rim/kicks).
- Interior: increase Noise detail for finer internal fracture (scale 7→10,
  detail 8→12), keep heart brightness EXACTLY as v2 (3 bake iterations
  established the ACES+bloom blow-out ceiling — do not touch emission 0.9 /
  ADD 0.45 / ramp 0.60→0.74).
- toktx: try `--uastc_quality 4` for the 1024s; accept ≤ ~450 KB each, else
  drop back. Rebuild via `node scripts/build-3d.mjs lab`, commit assets.

## Task 3 — OPTICS: shader + world upgrades (`lab3d.js`) [commit alone]

- **Chromatic dispersion** in the interior refraction: 3 refract samples at
  IOR 0.635/0.645/0.655 → R/G/B channels (the signature "expensive glass"
  read igloo has). Costs 2 extra texture fetches; gate to quality tier 0–1
  via a `uDisp` uniform the governor sets (tier 2 = single sample, v2 path).
- **Bevel glint boost**: fresnel exponent 2.4 → keep, but add a second
  tight spec lobe (pow 160) aimed at the new ring-light direction so bevel
  strips flash as the camera moves.
- **LOD wiring**: bucket build gains LOD — bands with `|bandY − camY| > 18`
  use `Shard*_LOD1` geometry. Two mesh sets per bucket, visibility loop picks
  one (never both). Pop-free: swap happens beyond the fog/aerial haze onset.
- Instance counts unchanged (1710/930) — density comes from geometry now.
- **Atmosphere**: (a) 2–3 slow drifting dust "caustic sheets" (additive
  planes with scrolling noise, alpha ≤ 0.04) in THE VEIN band; (b) godlight
  cones get subtle animated noise along their length (uTime scroll in the
  existing shaftLightMat). Keep alpha discipline (v2 lesson: 0.16 = milk).
- Bloom threshold may need +0.02 with brighter bevels — tune visually.

## Task 4 — PERF + POLISH pass [commit alone]

- Verify governor: high-poly worst case (CORE chapter, all bands visible)
  ≥ ~50fps at tier 0 on the dev machine; ensure tier stepping disables
  dispersion before dropping DPR.
- Frame-time print via QA driver; check MID path (930 instances + LOD1-only
  option if needed: MID uses LOD1 everywhere with dispersion off).
- Micro-polish from full-descent review: near-lens dither vs new bevels,
  aerial fade color vs new matcap, RESURFACE end frame composition.

## Task 5 — SHIP: honesty copy, smoke, live verify

- Update `lab.html` fallback copy numbers (tri counts, "high-poly quartz,
  beveled facets, LOD"), keep ≥ 400 chars; keep smoke asserts in sync.
- Smoke additions: LOD nodes present in glb? (cheap: glb byteLength now
  > 20,000), keep all 18 existing checks green.
- Full suite with HUB WIP stashed path-scoped → ALL PASS → commit → push →
  live verify real Chrome (fx-on/lab-crystalline/lab-type-on on
  stackwith.me/lab.html, chapters 00→04, console clean, assets 200,
  homepage hub3d.5XGXAZ7X untouched). Restore WIP.

## Cooldown / resumability

Each task is one commit and independently resumable. Tasks 1–2 can ship
committed but the site keeps rendering v2 visuals until Task 3 wires LOD
(glb node names stay backward-compatible: loader matches `Shard*` prefix,
so extra `_LOD1` nodes are ignored by v2 runtime — safe to commit early).
Only Task 5 pushes to main. If a session dies mid-task, the plan checkbox
state + commit history is the resume point.

- [x] Task 1 geometry
- [x] Task 2 matcaps
- [x] Task 3 optics/LOD
- [x] Task 4 perf/polish
- [x] Task 5 ship
