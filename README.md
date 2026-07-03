# AXON — "Signal Instrument" landing page

An award-caliber, non-templated marketing site for a fictional autonomous-agent
platform, art-directed as a **lab oscilloscope**: a carbon canvas, one rationed
electric **signal-green**, and a **3D nerve you fly through as you scroll**.

Still **zero build step** — plain HTML/CSS/JS. Animation + 3D libraries load from
CDN (GSAP, ScrollTrigger, Lenis, and Three.js via import-map).

```
axon-site/
├── index.html    # structure + copy + all sections
├── styles.css    # instrument design system, layout, responsive, reduced-motion
├── main.js       # boot, smooth scroll, probe cursor, scroll story, trace, counters
├── neural3d.js   # Three.js scroll-driven nerve flythrough (ES module)
└── README.md
```

## The craft

- **3D nerve flythrough** — a branching WebGL axon descends the whole page; the
  camera rides alongside a glowing signal impulse racing ahead, and synapse nodes
  fire signal-green as the pulse passes. Driven by scroll progress.
- **Two-beat power-on** boot + **decode** headline (scramble → resolve).
- **Probe cursor** — a drawn crosshair with a live x/y + state HUD, magnetic to buttons.
- **SIG margin rail** with a scroll-progress "nerve" line and live section index.
- **Pinned horizontal** CONNECT → REASON → ACT → OBSERVE section.
- **Sticky-stacking** instrument slabs, a **monospace datasheet**, **weight-breathe**
  headings, line-mask reveals, tabular counters, velocity marquee, live reasoning trace.
- Fully **responsive**, honors **`prefers-reduced-motion`**, and degrades gracefully:
  no WebGL / small screen / reduced-motion → a static gradient stands in for the 3D.

## Preview locally  (a server is required)

The 3D uses ES modules + an import-map, so **open it over http, not `file://`**:

```bash
cd axon-site
python3 -m http.server 8080      # → http://localhost:8080
# or: npx serve .
```

## Deploy — pick one (all free, all work as-is)

### Netlify (drag & drop — easiest)
1. Go to <https://app.netlify.com/drop>
2. Drag the whole `axon-site` folder on. Instant live URL.

```bash
# or CLI:
npm i -g netlify-cli && cd axon-site && netlify deploy --prod
```

### Cloudflare Pages
```bash
npm i -g wrangler && cd axon-site && wrangler pages deploy . --project-name axon-site
```

### Vercel
```bash
npm i -g vercel && cd axon-site && vercel --prod
```

### GitHub Pages
```bash
cd axon-site && git init && git add . && git commit -m "AXON"
gh repo create axon-site --public --source=. --push
# repo → Settings → Pages → Deploy from branch → main / root
```

## Customize

- **Palette / type / spacing:** the `:root` block in `styles.css` (all design tokens).
- **Copy:** all text is in `index.html`.
- **3D nerve:** tune `SPAN`, `BRANCHES`, particle count, fog density, and the
  camera offset in `neural3d.js`. Swap the Three.js version in the import-map in `<head>`.
- **Reasoning trace / datasheet rows:** edit the arrays/markup in `main.js` / `index.html`.
- **Social preview:** drop an `og.png` (1200×630) in the folder — it's already referenced.

---
Made with intent.
