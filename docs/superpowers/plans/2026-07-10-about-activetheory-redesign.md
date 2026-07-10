# About page — Active Theory-style immersive redesign (2026-07-10)

**User directive (top priority, overrides current queue):** rebuild `/about.html`
in the design language of https://activetheory.net/ — "same design and workflow…
little more better if possible". Axon page + homepage redesigns will be briefed
later; do NOT touch them now.

**IP note:** we recreate the *style* (original code, original copy, original
visuals) — no Active Theory assets, text, or code are copied.

## What "Active Theory style" means here

Their signature moves, translated to our stack:

1. **Full-viewport WebGL particle field** as the living background of the whole
   page (their hallmark) — not a hero-only canvas.
2. **Minimal overlay nav** on a transparent bar; content floats over the canvas.
3. **Huge centered display typography** — short manifesto lines, one thought per
   screen, generous whitespace.
4. **Scroll as the narrative** — full-height "chapters" that fade/rise in as you
   scroll; the particle system reacts to scroll progress (color/flow shifts per
   chapter).
5. **Custom cursor** + magnetic hover states (we already have the `.probe`
   cursor pattern on AXON pages — reuse the pattern, restyle for About).
6. **Smooth inertial scroll** — `@studio-freight/lenis` is already a dependency
   (currently unused on this page).
7. **Loader/boot moment** — brief percentage/wordmark intro before the field
   fades in (we already have the two-beat boot veil pattern).
8. **Selected-work rows** — big typographic list items that light up on hover
   (their Work index). Ours: AXON / Stackime / Blog.

## The "little better" upgrades

- Particles use curl-noise flow + pointer repulsion (they swirl away from the
  cursor) and per-chapter color grading through the existing channel tokens
  (`--ch0` lime / `--ch1` magenta / `--ch2` cyan) so About visually rhymes with
  the Spectrum homepage.
- Chapter progress rail (thin dot rail, right edge) — orientation their long
  pages lack.
- Full no-JS / reduced-motion / mobile story: everything readable, static
  gradient fallback (`body.about-no3d`), zero content hidden behind JS.

## Page structure (original copy, studio-level)

Site is a portal now; About becomes the **stackwith.me studio page** (hub nav +
hubfoot footer, `STACKWITH.ME` brand), with AXON's origin story kept as a
chapter. Sections (each `data-abreveal`, full-height where it fits):

1. **Boot loader** — `#abIntro` overlay: wordmark + counter, ~1.6s, click-skip,
   reduced-motion skips entirely.
2. **Hero manifesto** — eyebrow `[ STUDIO · EST. 2024 ]`, display line like
   "We build software with a pulse." + sub-line; scroll cue.
3. **Who** — one-person studio statement, substantive paragraph (≥400 chars
   total page copy stays well above AdSense bar; current about copy is reworked
   in, not deleted).
4. **What we make** — Active-Theory-style work rows: AXON (agents), Stackime
   (anime tracker), Blog (engineering notes) → links to `/axon.html`,
   `/anime.html`, `/blog/`; hover = row lights in its channel color, particle
   field tints to match.
5. **Origin** — the 3:14 a.m. pager story (existing copy, trimmed/kept).
6. **Principles** — the four beliefs (audit trail, guardrails, latency,
   marketing-at-tolerance) as big numbered statements instead of a `<ul>`.
7. **Contact CTA band** — "Tell us your worst 3 a.m. incident" → `/contact.html`.

## Implementation tasks

- [ ] **1. `src/assets/js/about3d.js`** (new ESM bundle): three.js GPU particle
      field (~6–12k points, curl-noise drift, pointer repulsion, scroll-driven
      hue lerp between chapter palettes), ACES + mild bloom on fixed
      `canvas#aboutfx`; Lenis smooth scroll (skip when reduced-motion); IO
      reveals for `[data-abreveal]`; chapter rail; work-row hover → field tint;
      boot overlay timing. Guards: `<680px` / reduced-motion / GL-fail →
      `body.about-no3d` static scrim, reveals forced visible. Register in
      `scripts/build-assets.mjs` esm build (`about3d` manifest key).
- [ ] **2. `src/_includes/layouts/about.njk`** (new): hub-style transparent nav
      (STACKWITH.ME brand, Blog/About/Contact links, About `aria-current`),
      `canvas#aboutfx` + scrim, boot overlay markup, hubfoot footer (copied
      structure from hub.njk so smoke's footer expectations hold if extended),
      `<script type="module" src="{{ assets.about3d }}">` + consent script.
      No-JS `<noscript>` unhides everything.
- [ ] **3. Rewrite `src/about.html`** to the 7-section structure above —
      `layout: layouts/about.njk`, same permalink/title pattern, description
      updated to studio framing. All copy original; keep ≥400 chars substance.
- [ ] **4. CSS `/* ABOUT */` section** appended to `styles.css`: `.ab-*`
      classes only (hero type ~clamp(3rem,9vw,7.5rem) ClashDisplay, work rows,
      numbered principles, rail, intro overlay, `about-no3d` fallback,
      mobile/reduced-motion rules). Design tokens untouched; BLOG/FAQ/404
      sections untouched.
- [ ] **5. Smoke additions** (new section `about:`): about3d asset loads,
      "about 3d booted" (body gets `fx-on`-style class in smoke Chrome — hub3d
      proves WebGL works there), boot overlay auto-dismisses, 3 work rows with
      correct hrefs, copy length ≥400, principles count = 4, no JS exceptions
      (section 1 already covers head/consent on /about.html — those must stay
      green). GOTCHA: kill anything on port 8123 first.
- [ ] **6. Build + full smoke ALL PASS**; `npm run qa`-style headless
      screenshots of /about.html at 1440 + 390 (with and without no3d fallback)
      for visual QA.
- [ ] **7. Ship**: commit + push `main`, verify live `/about.html` 200, hashed
      about3d asset 200, hub/axon/anime untouched.

## Explicitly out of scope

- Homepage + axon.html redesigns (user will brief later).
- `src/blog/`, `src/404.html`, BLOG/FAQ/404 CSS (standing never-touch rule).
- Nav labels elsewhere; smoke's existing label assertions must keep passing.

## Open user calls (proceeding with defaults, easy to flip)

- **Branding:** studio-level stackwith.me About (default) vs keeping it
  AXON-only. Default chosen because the hub footer already positions
  stackwith.me as "a one-person studio shipping in public".
- The old AXON-flavored about copy is folded in, not deleted, so AdSense
  substance only grows.
