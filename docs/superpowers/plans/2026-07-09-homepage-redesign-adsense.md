# Homepage redesign — modern professional landing + AdSense readiness

**Date:** 2026-07-09 · **Sanctioned by user:** yes (premium dark direction + AdSense-prep scope confirmed via question prompt)

## Goal

Replace the single-screen hub homepage with a full, modern, content-rich landing page that
keeps the site's dark-carbon + signal-lime identity, and add the content depth Google
AdSense reviewers look for (substantial copy, latest posts, rich footer, structured data).

## What stays fixed (guardrails)

- Same design tokens (`--bg`, `--signal`, Clash Display / Inter / JetBrains Mono) — no new fonts, no external CDNs.
- `src/blog/`, `src/404.html`, BLOG/FAQ/404 CSS sections: untouched.
- Consent-gated AdSense flow untouched (consent tests run on `/`, so the hub layout keeps `consent.js`).
- Smoke invariants preserved: `.hubcard` cards keep hrefs `/axon.html,/anime.html,/blog/`; `.nav__word` = `STACKWITH.ME`; no `.nerve` canvas; no `.hero__title` class on the homepage (new hero uses `hub__title`).
- AXON page, checkout, anime: untouched.

## Tasks

### 1. `src/index.html` — full landing page content
- [ ] **Hero**: eyebrow blip, large display headline, sub-copy, two CTA buttons
      (`Explore AXON →` → `/axon.html`, `Read the blog` → `/blog/`), subtle stat strip
      (3 sections · 3 posts · est. 2024) — reuses existing `.btn btn--signal / btn--ghost`.
- [ ] **Sections grid**: keep the three `.hubcard`s (same hrefs, same `data-hub`) but with
      upgraded visuals (larger marks, tag chips, hover sheen).
- [ ] **"What is stackwith.me?"** — new `hub__about` section: 3–4 substantive paragraphs
      (what the site is, who builds it, the honest-copy tone), plus 3 value-prop tiles
      (Transparent engineering / Real product notes / One consistent stack). This is the
      AdSense "content depth" section.
- [ ] **Latest from the blog** — 3 post cards hardcoded (blog is passthrough-copied, not an
      Eleventy collection): guardrails-are-a-feature, engineering-sub-40ms-orchestration,
      why-automation-needs-an-audit-trail, each with date, 1-line summary, `Read →`.
- [ ] **Closing CTA band** — "Start exploring" with links to AXON pricing + contact.

### 2. `src/_includes/layouts/hub.njk` — nav + footer upgrade
- [ ] Nav gains `Blog` link (About, Contact stay; brand unchanged).
- [ ] Replace the one-line footer with a full sitemap footer: 3 columns
      (Sections: AXON / Stackime / Blog · Company: About / Contact · Legal: Privacy / Terms)
      + the existing base line. Footer classes namespaced `hubfoot__` so the AXON footer CSS
      is untouched.
- [ ] Add `WebSite` JSON-LD block (base.njk already emits `Organization`).

### 3. `styles.css` — rewrite the `/* HUB */` section only
- [ ] New hero (radial signal glow, tighter type scale), refined cards, about/value-prop
      tiles, post cards, CTA band, sitemap footer, mobile breakpoints, reduced-motion rules.
- [ ] All inside the existing `/* HUB */` block; no changes to shared sections.

### 4. Smoke harness (`scripts/smoke.mjs` section 2)
- [ ] Keep the 5 existing `hub:` checks (all still true by design).
- [ ] Add: `hub: about section has substantive copy` (≥ 400 chars), `hub: 3 blog post cards`,
      `hub: footer sitemap links` (privacy+terms+about+contact present), `hub: hero CTAs`.

### 5. Verify
- [ ] `npm run build && npm run smoke` → ALL PASS.
- [ ] Headless Chrome screenshots desktop (1440) + mobile (390) of `/`, visually QA
      hero/sections/footer; compare inner pages unchanged vs `/tmp` baselines (regen if missing).

### 6. Ship
- [ ] Commit + push to `main` (Pages workflow deploys), then live-check
      https://stackwith.me/ renders the new homepage and `/axon.html` is unchanged.
- [ ] Update CLAUDE.md "Current state" with a dated entry.

## Notes for AdSense

Approval hinges on: substantial original content (Task 1 about-section + existing blog),
complete nav/footer with Privacy/Terms/About/Contact (Task 2), no broken links, consent
flow already compliant. `ads.txt` already present. No guarantee, but this removes the
"low value content / site under construction" rejection causes a thin hub screen invites.
