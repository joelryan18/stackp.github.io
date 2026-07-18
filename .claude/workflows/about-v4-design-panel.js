export const meta = {
  name: 'about-v4-design-panel',
  description: 'Judge-panel design: 4 lenses propose about-page v4 enhancements, 3 judges score',
  phases: [
    { title: 'Design', detail: '4 independent designer lenses read the code and propose' },
    { title: 'Judge', detail: '3 judges score all proposals' },
  ],
}

const CONTEXT = `
You are designing enhancements for the About page of stackwith.me — a one-person-studio site.
The page is "Signal Field v3 — In-World": an award-tier WebGL instrument journey already at
activetheory.net level. The user wants it pushed to "professional god level peak — add more detailing".
So: NOT a rebuild. Additive DETAIL — the kind of obsessive micro-craft that separates an Awwwards
Site of the Day from an honorable mention. The page's concept is "a calibrated lab instrument":
one 62k-particle field morphs through 6 formations (ECG pulse → core+orbit → 3 braided channel
strands → "3:14" glyphs → cubic lattice → ∿ pulse mark) while a Catmull-Rom camera travels between
chapter keyframes. Giant troika SDF ghost numerals 01–05 stand at each stop. Master grade pass
(CA, corner glow tinted per chapter, split-tone, vignette, grain, fluid pointer-trail warp).
Synth WebAudio (drone bed, channel blips D5/F#5/A5, chapter whoosh) behind a HUD toggle.
Custom cursor, Lenis scroll, velocity skew/marquee, magnetic CTA, adaptive DPR governor.

READ THESE FILES (all paths absolute):
- /Users/joel/Projects/axon-site/src/about.html (content markup)
- /Users/joel/Projects/axon-site/src/_includes/layouts/about.njk (page chrome: loader, HUD, cursor, rail)
- /Users/joel/Projects/axon-site/src/assets/js/about3d.js (the whole world, 1236 lines — read it ALL)
- /Users/joel/Projects/axon-site/src/assets/css/styles.css lines 997–1247 (the ABOUT section)

HARD CONSTRAINTS (violating any = proposal dead on arrival):
- Smoke pins: hero innerText exactly "We build software with a pulse."; 3 .ab-row hrefs
  /axon.html,/anime.html,/blog/; exactly 4 .ab-principle; exactly 6 [data-abchapter] sections
  (6 rail dots); .ab-cta__btn href /contact.html; #abSound toggle; body gets fx-on + ab-type-on.
  New copy may be ADDED (copy length check is >= 400 chars, additive is safe).
- Performance: 60fps target with an adaptive DPR governor already stepping quality. New GPU work
  must be cheap (points/instancing/shader-only). No new heavy post passes; folding INTO the existing
  grade pass is fine. GLSL1 (gl_FragColor), swiftshader-safe: no float textures, no MRT.
- No new binary assets (no image/video/model files). Procedural only. troika + gsap + lenis + three
  are already in the bundle.
- Fallbacks must keep working: <680px / reduced-motion / GL-fail → about-no3d static scrim;
  noscript unhides all content. Anything you add to the DOM must degrade gracefully.
- Honesty brand rule: any number shown must be TRUE (particle count, fps, real dates OK; fake
  stats forbidden).
- Known bug classes to avoid: three's ShaderPass clones plain-object uniforms (pass a real
  ShaderMaterial); never write uniform.value = uniform.value * k in the loop (exponential decay);
  troika stroke fades must drive fillOpacity/strokeOpacity, not material.opacity.

Return proposals as structured output. Each proposal must be CONCRETE: name the exact file,
the exact hook point (function/section), and sketch the implementation in 2-5 sentences a senior
engineer could build from. 6–10 proposals. Rank your own list by impact. "wow" = one sentence on
what the user FEELS. Aim for details a jury would screenshot: micro-typography, live telemetry,
physical-feeling motion, sound nuance, information-design plaques — not generic "add more particles".`

const PROPOSAL_SCHEMA = {
  type: 'object',
  required: ['proposals'],
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'layer', 'wow', 'description', 'implementation', 'cost', 'risk'],
        properties: {
          id: { type: 'string', description: 'kebab-case slug' },
          title: { type: 'string' },
          layer: { type: 'string', description: 'webgl | dom | hud | sound | content | css' },
          wow: { type: 'string' },
          description: { type: 'string' },
          implementation: { type: 'string', description: 'file + hook point + concrete sketch' },
          cost: { type: 'string', description: 'S/M/L engineering effort + runtime cost note' },
          risk: { type: 'string' },
        },
      },
    },
  },
}

const LENSES = [
  { key: 'world', prompt: `${CONTEXT}\n\nYOUR LENS: THE WEBGL WORLD. Formations, hero ring/core artifacts, backdrop, camera language, the grade pass, in-world typography. What physical detail would make the world feel HAND-MADE and alive — secondary motion, signal life traveling through the formations, instrument-dial details on the ring, richer chapter transitions? Propose only in-world/GPU work.` },
  { key: 'dom', prompt: `${CONTEXT}\n\nYOUR LENS: DOM TYPOGRAPHY & MICROINTERACTION. The hero, work rows, principles ledger, marquee, cursor, reveals, CTA. What micro-typographic and interaction detail (char-level animation, text scramble, hover physics, per-element choreography, list annotations, link underline craft) would read as obsessive top-0.1% polish? Propose only DOM/CSS/GSAP work.` },
  { key: 'hud', prompt: `${CONTEXT}\n\nYOUR LENS: HUD / CHROME / INSTRUMENT TELEMETRY + SOUND. The corner-bracket HUD, readout, rail, sound toggle, loader. The page is "a calibrated instrument" — what LIVE telemetry (real fps, real particle count, camera coords, formation name), boot-sequence detail, scramble readouts, or sound-design nuance (stereo panning, scroll-linked filter, per-chapter drone key) would sell that fantasy completely? Numbers must be real.` },
  { key: 'content', prompt: `${CONTEXT}\n\nYOUR LENS: NARRATIVE & INFORMATION DESIGN. What ADDITIVE content detailing — museum-plaque captions per chapter, spec-sheet annotations, an honest "by the numbers" moment, richer work-row metadata (status lines, real ship dates from the site itself), footer/CTA moments, email scramble reveal — would give the page editorial depth without bloating it? Copy must stay honest (this is really a one-person studio; AXON/Stackime/Log really exist on this domain; studio est. 2024; the site really ships in public).` },
]

phase('Design')
const results = await parallel(LENSES.map((l) => () =>
  agent(l.prompt, { label: `design:${l.key}`, phase: 'Design', schema: PROPOSAL_SCHEMA })
))
const all = results.filter(Boolean).flatMap((r, li) =>
  r.proposals.map((p) => ({ ...p, id: `${LENSES[li] ? LENSES[li].key : li}-${p.id}` }))
)
log(`${all.length} proposals collected from ${results.filter(Boolean).length}/4 designers`)

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['scores', 'top', 'kill'],
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'distinctive', 'coherent', 'feasible', 'perfSafe', 'note'],
        properties: {
          id: { type: 'string' },
          distinctive: { type: 'number', description: '1-10 award-jury wow' },
          coherent: { type: 'number', description: '1-10 fit with the instrument concept' },
          feasible: { type: 'number', description: '1-10 buildable as sketched in THIS codebase' },
          perfSafe: { type: 'number', description: '1-10 (10 = negligible runtime cost)' },
          note: { type: 'string' },
        },
      },
    },
    top: { type: 'array', items: { type: 'string' }, description: '10-14 proposal ids, best first' },
    kill: { type: 'array', items: { type: 'string' }, description: 'ids that should NOT ship, with reason folded into note' },
  },
}

phase('Judge')
const proposalDoc = JSON.stringify(all, null, 1)
const JUDGES = [
  'You are an Awwwards/FWA jury member who has judged 500 sites. Taste is everything: kill anything generic, derivative, or noisy. Reward restraint, coherence, and details that reward attention.',
  'You are a principal graphics engineer (three.js core contributor). Judge feasibility and runtime cost in THIS codebase ruthlessly. You may skim the actual files at /Users/joel/Projects/axon-site/src/assets/js/about3d.js and the CSS to verify hook points exist.',
  'You are the site owner: a one-person studio whose brand is HONESTY and instrument-grade engineering. Judge concept coherence and whether each detail strengthens or dilutes the "calibrated instrument" story. Fake-feeling flourishes get killed.',
]
const verdicts = await parallel(JUDGES.map((j, i) => () =>
  agent(`${j}\n\nScore EVERY proposal below (all of them) on the four axes, then give your top list and kill list.\n\nPROPOSALS:\n${proposalDoc}`,
    { label: `judge:${i}`, phase: 'Judge', schema: VERDICT_SCHEMA })
))

return { proposals: all, verdicts: verdicts.filter(Boolean) }