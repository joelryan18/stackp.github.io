# AXON — "Signal Instrument"

An award-caliber, non-templated landing page for a fictional autonomous-agent
platform, art-directed as a **lab oscilloscope**: carbon canvas, one rationed
electric **signal-green**, and a **modern WebGL nerve you fly through as you scroll**.

**Zero build step** — plain HTML/CSS/JS. Libraries load from CDN (GSAP, ScrollTrigger,
Lenis, and Three.js r160 + addons via import-map).

```
axon-site/
├── index.html      # structure, copy, meta/OG/JSON-LD, import-map, noscript
├── about.html · contact.html · privacy.html · terms.html   # content/legal pages
├── styles.css      # instrument design system, layout, responsive, reduced-motion
├── main.js         # boot, smooth scroll, probe cursor, reveals, trace, counters, form
├── consent.js      # cookie-consent banner (GDPR/CCPA, required for ads)
├── neural3d.js     # Three.js HDR nerve flythrough (ES module)
├── og.png          # 1200×630 social card (rendered)
├── robots.txt · sitemap.xml
└── scripts/        # dev-only: og-card.html + qa-shots.mjs (CDP screenshot harness)
```

## Google AdSense readiness

The site ships with everything reviewers check: **Privacy Policy** (with AdSense/DoubleClick
cookie disclosures + opt-out links), **Terms**, **About**, **Contact**, a **cookie-consent
banner**, zero dead links, canonical + og:url, robots.txt and a 5-page sitemap.

To activate ads after approval:
1. Replace every `stackwith.me` URL with your real domain (index + 4 pages + sitemap + robots).
2. Paste your AdSense `<script async …adsbygoogle.js?client=ca-pub-…>` snippet where the
   comment in `index.html`'s `<head>` marks it.
3. Add your `ads.txt` (e.g. `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`)
   at the site root.

## The craft

- **Modern WebGL nerve** — an `EffectComposer` HDR pipeline: 24k vertex-shader-animated
  particles form a flowing sheath, a glowing filament of current carries a travelling
  signal band, synapse nodes fire as the impulse passes → **UnrealBloom → ACES tone-map
  → filmic grade (chromatic aberration + vignette + grain) → SMAA**, crisp at capped DPR.
  The camera rides down the nerve on scroll.
- **Two-beat power-on** boot + **decode** headline (scramble → resolve, non-breaking words).
- **Probe cursor** — drawn crosshair with a live x/y + state HUD, magnetic to buttons.
- **SIG margin rail** with a scroll-progress "nerve" line + live section index.
- **Pinned horizontal** CONNECT → REASON → ACT → OBSERVE section.
- **Sticky-stacking** slabs, **monospace datasheet**, line-mask title reveals, weight-breathe
  headings, tabular counters, velocity marquee, live reasoning trace, inline form success.
- Fully **responsive**; honors **`prefers-reduced-motion`**; degrades gracefully —
  no-WebGL / < 680px / reduced-motion → a static gradient replaces the 3D; no-JS shows content.

## Preview locally  (a server is required)

The 3D uses ES modules + an import-map, so **open over http, not `file://`**:

```bash
cd axon-site
python3 -m http.server 8080      # → http://localhost:8080
# or: npx serve .
```

## Deploy — pick one (all free, all work as-is)

**Netlify (easiest):** drag the `axon-site` folder onto <https://app.netlify.com/drop>.

```bash
# CLI equivalents:
npx netlify-cli deploy --prod          # Netlify
npx vercel --prod                      # Vercel
npx wrangler pages deploy .            # Cloudflare Pages
# GitHub Pages: push repo → Settings → Pages → deploy from main / root
```

## Customize

- **Palette / type / spacing:** the `:root` block in `styles.css` (all design tokens).
- **Page color:** `html`/`body` gradient + `.nerve-scrim` in `styles.css`; 3D clear color in `neural3d.js`.
- **3D nerve:** tune `N_POINTS`, bloom (`0.5, 0.7, 0.9`), exposure, fade `uNear/uFar`, grain in `neural3d.js`.
- **Copy:** all text is in `index.html`. **Trace / datasheet:** arrays/markup in `main.js` / `index.html`.
- **Regenerate OG:** `scripts/og-card.html` → screenshot at 1200×630 (see commit history / qa harness).

## Dev tooling (optional, not needed to run the site)

`scripts/qa-shots.mjs` drives headless Chrome over the DevTools Protocol to screenshot
every section at any viewport — handy for visual regression:

```bash
node scripts/qa-shots.mjs 1440 900   # desktop → /tmp/axon-qa/
node scripts/qa-shots.mjs 390 844    # mobile
```

---
Made with intent.
