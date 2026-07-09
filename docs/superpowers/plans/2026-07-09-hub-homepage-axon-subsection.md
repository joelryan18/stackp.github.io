# stackwith.me hub homepage — AXON becomes a subsection

User-sanctioned redesign (2026-07-09): the homepage must no longer be the AXON
landing. `/` becomes a **portal hub** for all subsections; AXON moves to
`/axon.html` intact; nav label "Anime" → "Stackime" site-wide.

## Decisions (user-picked)

- Homepage = single-screen **portal hub**, same dark+lime design language:
  brand "STACKWITH.ME", eyebrow, headline, and big cards → AXON / Stackime / Blog.
- AXON lives at **/axon.html** (flat .html convention kept). Page content is
  moved verbatim — pixel-identical, only its URL changes.
- Nav label **"Stackime"** replaces "Anime" everywhere (smoke updated to match).

## Tasks

### 1. Move AXON page to /axon.html
- [ ] `git mv src/index.html src/axon.html`; front matter: `permalink: "axon.html"`.
  Title/description/og unchanged (it's still the AXON landing).
- [ ] Fix root-anchor links that assumed AXON was at `/`:
  - `src/checkout.html` `#payDone` → `/axon.html#plans`
  - `src/_includes/layouts/page.njk` "Get access" → `/axon.html#engage`
  - `src/_includes/layouts/checkout.njk` "Get access" → `/axon.html#engage`
- [ ] `layouts/home.njk` (used only by the AXON page): brand link stays `#hero`;
  add `Home → /` as first nav link (desktop + burger + footer); rename nav
  "Anime" label → "Stackime".

### 2. New hub homepage
- [ ] New `src/_includes/layouts/hub.njk` (base.njk shell): minimal nav
  (brand STACKWITH.ME → `/`, links About/Contact), footer strip w/ privacy·terms,
  loads `consent.js` only (no lenis/3D — instant load).
- [ ] New `src/index.html` (layout hub.njk, permalink index.html):
  eyebrow `[ ONE STACK · MANY SIGNALS ]`, h1 "Everything I'm building, in one
  place.", 3 cards (data-probe-friendly `<a class="hubcard">`):
  - **AXON** — "Autonomous agent instrument" → `/axon.html`
  - **STACKIME** — "Anime tracking, community catalog" → `/anime.html`
  - **BLOG** — "Notes & writing" → `/blog/`
  Cards: numbered 01/02/03, hover lift + lime glow border, each with a small
  inline SVG mark (axon waveform / stackime play-triangle / blog lines).
- [ ] New `/* HUB */` CSS section appended to `styles.css` (grid, cards,
  responsive single-column < 720px; respects prefers-reduced-motion).
- [ ] `title`: "stackwith.me — one stack, many signals"; hub is indexed.

### 3. Site-wide label + links
- [ ] "Anime" → "Stackime" in: home.njk (nav+burger), page.njk, checkout.njk,
  anime.njk (its `aria-current` nav), home.njk footer col if present.
- [ ] anime.njk nav gains `Axon → /axon.html` link (Home stays `/`).
- [ ] `src/sitemap.xml`: add `/axon.html` (priority 0.9); `/` stays 1.0.

### 4. Smoke + QA
- [ ] `scripts/smoke.mjs`:
  - section 1 page list: add `/axon.html`.
  - section 2 "index runtime" checks (lenis, hero decode, no3d, --faint) now
    run against `/axon.html`; rename check labels `index:` → `axon:`.
  - new hub checks: `/` renders, 3 `.hubcard` hrefs correct, consent banner
    still works on hub, hub has no `.nerve` canvas.
  - nav label assertions: "Home,Blog,Anime" → new expected lists w/ "Stackime".
- [ ] `npm run build && npm run smoke` → ALL PASS.
- [ ] Headless screenshot QA: hub desktop+mobile, axon.html spot check
  (pixel-identical to old homepage), anime nav label.

### 5. Ship
- [ ] Commit + push to `main` (Pages workflow deploys). Verify live:
  `https://stackwith.me/` = hub, `/axon.html` = AXON, old `/#plans` anchors
  degrade gracefully (hub has no #plans — checkout Done now points at axon).
- [ ] Update CLAUDE.md current-state notes.

## Out of scope / guarded
- `src/blog/`, `src/404.html`, BLOG/FAQ/404 CSS sections — untouched.
- AXON page content pixel-identical (only URL + nav label change sanctioned).
- No redirects possible on GitHub Pages for `/` (it's the hub now by design).
