# AXON Site — Professional Toolchain Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the AXON landing site from zero-build plain files to Eleventy 3 + esbuild + GitHub Actions, folding in all audited engineering fixes, with pixel-identical design.

**Architecture:** Eleventy renders 5 pages from Nunjucks layouts (shared head/nav/footer); esbuild bundles 3 JS entries (npm `three`/`gsap`/`lenis` replace all CDNs) and CSS with content hashes exposed to templates via a JSON manifest; fonts are self-hosted woff2; GitHub Actions builds `_site` and deploys to Pages (custom domain stackwith.me).

**Tech Stack:** @11ty/eleventy 3, esbuild, html-minifier-terser, three@0.160.0, gsap@3.12.5, @studio-freight/lenis@1.0.42, raw-CDP smoke tests (no test framework deps), GitHub Actions `deploy-pages`.

## Global Constraints

- Working directory: `/Users/joel/Projects/axon-site` (clone of `joelryan18/stackp.github.io`, branch `main`). Never operate on the old checkout at `/Users/joel` until Task 15.
- Visual design pixel-identical. ONLY sanctioned rendered changes: `--faint: #565E6A` → `#78828E`; honest form success/error copy.
- OUT OF SCOPE / DO NOT EDIT: `blog/` (all files), `404.html`, the BLOG/FAQ/404 sections of `styles.css` (preserve byte-for-byte), page body copy.
- Page URLs must stay flat: `/`, `/about.html`, `/contact.html`, `/privacy.html`, `/terms.html` (live sitemap depends on them).
- Pinned deps: `three@0.160.0`, `gsap@3.12.5`, `@studio-freight/lenis@1.0.42` (exact versions — they match current CDN behavior).
- No third-party runtime origins in shipped HTML except consent-gated AdSense (`pagead2.googlesyndication.com`, injected by consent.js only after "Accept all").
- AdSense client id: `ca-pub-7262404901375077`. Consent localStorage key: `axon-consent` (values `all` | `essential`).
- Node ≥ 20. macOS host with Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (used by qa/smoke scripts).
- Commit at the end of every task with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Do not `git push` until Task 14 says so.

---

### Task 1: Baseline screenshots of the current site

Captures the pre-migration look so later tasks can prove pixel-identity.

**Files:** none created in repo (screenshots land in `/tmp`).

- [x] **Step 1: Serve the current (unmigrated) site**

```bash
cd /Users/joel/Projects/axon-site
python3 -m http.server 8080 &
echo $! > /tmp/axon-serve.pid
sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/
```
Expected: `200`

- [x] **Step 2: Capture desktop + mobile baselines**

```bash
node scripts/qa-shots.mjs 1440 900
mv /tmp/axon-qa /tmp/axon-qa-baseline-desktop
node scripts/qa-shots.mjs 390 844
mv /tmp/axon-qa /tmp/axon-qa-baseline-mobile
kill $(cat /tmp/axon-serve.pid)
ls /tmp/axon-qa-baseline-desktop | head
```
Expected: `1440-*.png` files for hero/datasheet/pipeline/… and the script prints `REPORT {...}` with `"no3d":false` and `ERRORS []` (or only AdSense-blocked noise). If `ERRORS` shows real exceptions, record them — they are pre-existing, not regressions.

No commit (nothing changed).

---

### Task 2: npm scaffold

**Files:**
- Create: `package.json`, `.gitignore`
- Produces: `npm ci`-able project; scripts `build`, `dev`, `smoke`, `qa` (wired in later tasks).

- [x] **Step 1: Write `package.json`**

```json
{
  "name": "axon-site",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "node scripts/build-assets.mjs && eleventy",
    "dev": "node scripts/build-assets.mjs && eleventy --serve",
    "watch:assets": "node scripts/build-assets.mjs --watch",
    "smoke": "node scripts/smoke.mjs",
    "qa": "node scripts/qa-shots.mjs"
  },
  "dependencies": {
    "@studio-freight/lenis": "1.0.42",
    "gsap": "3.12.5",
    "three": "0.160.0"
  },
  "devDependencies": {
    "@11ty/eleventy": "^3.0.0",
    "esbuild": "^0.21.5",
    "html-minifier-terser": "^7.2.0"
  }
}
```

- [x] **Step 2: Write `.gitignore`**

```
node_modules/
_site/
dist-assets/
.DS_Store
```

- [x] **Step 3: Install and verify**

```bash
cd /Users/joel/Projects/axon-site && npm install && npx @11ty/eleventy --version
```
Expected: prints a `3.x` version; `package-lock.json` created.

- [x] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "build: add npm scaffold (eleventy, esbuild, pinned runtime deps)"
```

---

### Task 3: Restructure into `src/` with passthrough-only Eleventy build

Build output must equal the current site (pages pass through the njk engine unchanged — none of them contain `{{`/`{%`/`{#` sequences).

**Files:**
- Create: `eleventy.config.js`
- Move (git mv): `index.html about.html contact.html privacy.html terms.html 404.html blog og.png robots.txt ads.txt CNAME sitemap.xml` → `src/`; `styles.css` → `src/assets/css/styles.css`; `main.js consent.js neural3d.js` → `src/assets/js/`
- `scripts/` stays at repo root (dev tooling, not deployed).

**Interfaces:**
- Produces: `npm run build`-style Eleventy invocation (`npx @11ty/eleventy`) that emits `_site/` with every page at its flat URL. Later tasks rely on dirs `src/_includes/`, `src/_data/`, config keys exactly as written here.

- [x] **Step 1: Move files**

```bash
cd /Users/joel/Projects/axon-site
mkdir -p src/assets/css src/assets/js
git mv index.html about.html contact.html privacy.html terms.html og.png robots.txt ads.txt CNAME sitemap.xml src/
git mv styles.css src/assets/css/styles.css
git mv main.js src/assets/js/main.js
git mv neural3d.js src/assets/js/neural3d.js
git mv consent.js src/assets/js/consent.js
mv 404.html src/404.html
mv blog src/blog
```
(`404.html`/`blog` are untracked — plain `mv`.)

- [x] **Step 2: Temporarily point pages at moved assets**

The pages still reference `./styles.css`, `./main.js`, `./consent.js`, `./neural3d.js`. Until Task 6 replaces these with hashed layout references, keep the build working by passthrough-copying the plain assets AND leaving references as-is — so add to the config below passthroughs that place them at the old URLs. No page edits in this task.

- [x] **Step 3: Write `eleventy.config.js`**

```js
export default function (eleventyConfig) {
  // hashed bundles (Task 4 populates dist-assets/)
  eleventyConfig.addPassthroughCopy({ "dist-assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/assets/fonts": "assets/fonts" });

  // TEMPORARY (removed in Task 6): plain assets at their legacy URLs
  eleventyConfig.addPassthroughCopy({ "src/assets/css/styles.css": "styles.css" });
  eleventyConfig.addPassthroughCopy({ "src/assets/js/main.js": "main.js" });
  eleventyConfig.addPassthroughCopy({ "src/assets/js/consent.js": "consent.js" });
  eleventyConfig.addPassthroughCopy({ "src/assets/js/neural3d.js": "neural3d.js" });

  // static files
  for (const f of ["src/og.png", "src/robots.txt", "src/ads.txt", "src/CNAME", "src/sitemap.xml", "src/404.html", "src/blog"]) {
    eleventyConfig.addPassthroughCopy(f);
  }
  // out-of-scope files are copied verbatim, never templated
  eleventyConfig.ignores.add("src/404.html");
  eleventyConfig.ignores.add("src/blog/**");

  eleventyConfig.addWatchTarget("dist-assets");

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
```

- [x] **Step 4: Add flat permalinks via front matter**

Eleventy outputs `src/about.html` as `/about/` by default — that breaks live URLs. Prepend front matter to each of the five pages (this is the ONLY edit to them in this task). Example for `src/about.html` — repeat with the right filename for contact/privacy/terms; `index.html` gets `permalink: "index.html"`:

```yaml
---
permalink: "about.html"
---
```

- [x] **Step 5: Build and verify output equals input**

```bash
npx @11ty/eleventy
diff <(sed '1,3d' src/about.html) <(cat _site/about.html) && echo PAGES-MATCH
ls _site/ && ls _site/blog/
```
Expected: `PAGES-MATCH` (the sed strips the 3 front-matter lines; njk passthrough emits identical bytes, possibly modulo a trailing newline — if diff shows ONLY a trailing-newline difference, that is acceptable); `_site/` contains all five pages, `404.html`, `blog/`, `styles.css`, `main.js`, `consent.js`, `neural3d.js`, `og.png`, `robots.txt`, `ads.txt`, `CNAME`, `sitemap.xml`.

- [x] **Step 6: Spot-check in browser**

```bash
python3 -m http.server 8080 -d _site & echo $! > /tmp/axon-serve.pid
node scripts/qa-shots.mjs 1440 900
kill $(cat /tmp/axon-serve.pid)
```
Expected: `REPORT` shows `"no3d":false`, `"navFound":true`; screenshots in `/tmp/axon-qa` visually match `/tmp/axon-qa-baseline-desktop` (open both, compare hero + pipeline + footer).

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "build: restructure into src/ with passthrough Eleventy build (output identical)"
```

---

### Task 4: esbuild asset pipeline with hashed filenames + manifest

**Files:**
- Create: `scripts/build-assets.mjs`, `src/_data/assets.json` (generated; commit the generated file so Eleventy always has data)

**Interfaces:**
- Produces: `src/_data/assets.json` = `{"styles": "/assets/styles.<hash>.css", "main": "/assets/main.<hash>.js", "consent": "/assets/consent.<hash>.js", "neural3d": "/assets/neural3d.<hash>.js"}`. Templates consume as `{{ assets.styles }}` etc. `dist-assets/` holds the files; Eleventy copies them to `_site/assets/`.

- [x] **Step 1: Write `scripts/build-assets.mjs`**

```js
// Bundles JS entries + CSS with content hashes; writes src/_data/assets.json
// so Eleventy templates can reference hashed filenames.
import * as esbuild from "esbuild";
import { rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WATCH = process.argv.includes("--watch");
const OUTDIR = "dist-assets";
const manifest = {};

const manifestPlugin = (names) => ({
  name: "manifest",
  setup(build) {
    build.onEnd(async (result) => {
      if (!result.metafile) return;
      for (const [out, meta] of Object.entries(result.metafile.outputs)) {
        if (!meta.entryPoint) continue;
        const name = names[meta.entryPoint];
        if (name) manifest[name] = "/assets/" + path.basename(out);
      }
      await writeFile("src/_data/assets.json", JSON.stringify(manifest, null, 2) + "\n");
      console.log("[assets]", JSON.stringify(manifest));
    });
  },
});

await rm(OUTDIR, { recursive: true, force: true });
await mkdir(OUTDIR, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  metafile: true,
  target: "es2020",
  outdir: OUTDIR,
  entryNames: "[name].[hash]",
  logLevel: "info",
};

const builds = [
  {
    ...common,
    entryPoints: ["src/assets/js/main.js", "src/assets/js/consent.js"],
    format: "iife",
    plugins: [manifestPlugin({ "src/assets/js/main.js": "main", "src/assets/js/consent.js": "consent" })],
  },
  {
    ...common,
    entryPoints: ["src/assets/js/neural3d.js"],
    format: "esm",
    plugins: [manifestPlugin({ "src/assets/js/neural3d.js": "neural3d" })],
  },
  {
    ...common,
    entryPoints: ["src/assets/css/styles.css"],
    external: ["*.woff2"],
    plugins: [manifestPlugin({ "src/assets/css/styles.css": "styles" })],
  },
];

if (WATCH) {
  for (const opts of builds) (await esbuild.context(opts)).watch();
  console.log("[assets] watching…");
} else {
  await Promise.all(builds.map((opts) => esbuild.build(opts)));
}
```

- [x] **Step 2: Run and verify**

```bash
node scripts/build-assets.mjs && cat src/_data/assets.json && ls dist-assets/
```
Expected: manifest has 4 keys with hashed paths; `dist-assets/` contains the 4 files. NOTE: `neural3d.js` bundles three.js — expect ~500 KB minified; that is comparable to today's CDN download and loads as a deferred module, so it is acceptable. `main.js` bundles gsap+lenis (~80 KB).

esbuild will FAIL on `src/assets/js/main.js`/`neural3d.js` only if imports are broken — at this point they still use globals (`window.gsap`)/import-map specifiers. `neural3d.js` imports `three` and `three/addons/...` which npm resolves — it builds now. `main.js`/`consent.js` have no imports — they build as-is. If any build errors, stop and inspect.

- [x] **Step 3: Verify Eleventy picks up the manifest**

```bash
npx @11ty/eleventy
ls _site/assets/
```
Expected: hashed files present in `_site/assets/` (pages still reference legacy URLs — that flips in Task 6).

- [x] **Step 4: Commit**

```bash
git add scripts/build-assets.mjs src/_data/assets.json
git commit -m "build: esbuild pipeline with content-hashed bundles and template manifest"
```

---

### Task 5: Self-hosted fonts

**Files:**
- Create: `src/assets/fonts/*.woff2` (9 files), `src/assets/fonts/LICENSES.md`
- Modify: `src/assets/css/styles.css` (prepend @font-face block only)

**Interfaces:**
- Produces: font URLs `/assets/fonts/<Family>-<weight>.woff2` — exact names below are referenced by Task 6's preload tags. Families/weights: Inter 400/500/600, JetBrainsMono 400/500/700, ClashDisplay 500/600/700.

- [x] **Step 1: Download Inter + JetBrains Mono (google-webfonts-helper, latin subset)**

```bash
mkdir -p /tmp/axon-fonts src/assets/fonts
curl -fsSL -o /tmp/axon-fonts/inter.zip "https://gwfh.mranftl.com/api/fonts/inter?download=zip&subsets=latin&variants=regular,500,600&formats=woff2"
curl -fsSL -o /tmp/axon-fonts/jbm.zip "https://gwfh.mranftl.com/api/fonts/jetbrains-mono?download=zip&subsets=latin&variants=regular,500,700&formats=woff2"
cd /tmp/axon-fonts && unzip -o inter.zip -d inter && unzip -o jbm.zip -d jbm && ls inter jbm
```
Expected: six woff2 files (names like `inter-v*-latin-regular.woff2`). If gwfh is down, fallback: download the same variants from https://fonts.google.com via the CSS API (fetch `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap` with a modern-Chrome User-Agent header, extract the latin-subset woff2 URLs, curl each).

- [x] **Step 2: Download Clash Display (Fontshare)**

```bash
curl -fsSL -o /tmp/axon-fonts/clash.zip "https://api.fontshare.com/v2/fonts/download/clash-display"
unzip -o /tmp/axon-fonts/clash.zip -d /tmp/axon-fonts/clash
find /tmp/axon-fonts/clash -iname "*.woff2" | sort
```
Expected: woff2 files including Medium/Semibold/Bold variants, plus a license file (`find /tmp/axon-fonts/clash -iname "*license*"`).

- [x] **Step 3: Normalize into the repo**

```bash
cd /Users/joel/Projects/axon-site
cp /tmp/axon-fonts/inter/*latin-regular.woff2 src/assets/fonts/Inter-400.woff2
cp /tmp/axon-fonts/inter/*latin-500.woff2    src/assets/fonts/Inter-500.woff2
cp /tmp/axon-fonts/inter/*latin-600.woff2    src/assets/fonts/Inter-600.woff2
cp /tmp/axon-fonts/jbm/*latin-regular.woff2  src/assets/fonts/JetBrainsMono-400.woff2
cp /tmp/axon-fonts/jbm/*latin-500.woff2      src/assets/fonts/JetBrainsMono-500.woff2
cp /tmp/axon-fonts/jbm/*latin-700.woff2      src/assets/fonts/JetBrainsMono-700.woff2
cp "$(find /tmp/axon-fonts/clash -iname '*Medium.woff2'   | head -1)" src/assets/fonts/ClashDisplay-500.woff2
cp "$(find /tmp/axon-fonts/clash -iname '*Semibold.woff2' | head -1)" src/assets/fonts/ClashDisplay-600.woff2
cp "$(find /tmp/axon-fonts/clash -iname '*Bold.woff2'     | head -1)" src/assets/fonts/ClashDisplay-700.woff2
ls -la src/assets/fonts/
```
Expected: 9 woff2 files, each > 10 KB. CAUTION: `find -iname '*Bold.woff2'` also matches `Semibold` — verify the ClashDisplay-700 copy came from a file literally named `ClashDisplay-Bold.woff2` (`find /tmp/axon-fonts/clash -iname '*-Bold.woff2'` — use that stricter pattern instead).

- [x] **Step 4: Write `src/assets/fonts/LICENSES.md`**

```markdown
# Font licenses

- **Inter** — SIL Open Font License 1.1. © The Inter Project Authors. https://github.com/rsms/inter
- **JetBrains Mono** — SIL Open Font License 1.1. © JetBrains. https://github.com/JetBrains/JetBrainsMono
- **Clash Display** — Indian Type Foundry Free Font License (FFL). Downloaded from https://www.fontshare.com/fonts/clash-display. Full license text ships in this directory if included in the Fontshare download; otherwise see https://www.fontshare.com/licenses/itf-ffl
```
Also copy the license file from the Clash zip if present:
```bash
cp "$(find /tmp/axon-fonts/clash -iname '*license*' | head -1)" src/assets/fonts/ClashDisplay-LICENSE.txt || true
```

- [x] **Step 5: Prepend @font-face block to `src/assets/css/styles.css`**

Insert immediately after the opening banner comment (before `:root {`):

```css
/* ---------- self-hosted fonts ---------- */
@font-face { font-family: "Inter"; src: url("/assets/fonts/Inter-400.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "Inter"; src: url("/assets/fonts/Inter-500.woff2") format("woff2"); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: "Inter"; src: url("/assets/fonts/Inter-600.woff2") format("woff2"); font-weight: 600; font-style: normal; font-display: swap; }
@font-face { font-family: "JetBrains Mono"; src: url("/assets/fonts/JetBrainsMono-400.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "JetBrains Mono"; src: url("/assets/fonts/JetBrainsMono-500.woff2") format("woff2"); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: "JetBrains Mono"; src: url("/assets/fonts/JetBrainsMono-700.woff2") format("woff2"); font-weight: 700; font-style: normal; font-display: swap; }
@font-face { font-family: "Clash Display"; src: url("/assets/fonts/ClashDisplay-500.woff2") format("woff2"); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: "Clash Display"; src: url("/assets/fonts/ClashDisplay-600.woff2") format("woff2"); font-weight: 600; font-style: normal; font-display: swap; }
@font-face { font-family: "Clash Display"; src: url("/assets/fonts/ClashDisplay-700.woff2") format("woff2"); font-weight: 700; font-style: normal; font-display: swap; }
```

- [x] **Step 6: Build check**

```bash
node scripts/build-assets.mjs && grep -c "@font-face" dist-assets/styles.*.css
```
Expected: `9`.

- [x] **Step 7: Commit**

```bash
git add src/assets/fonts src/assets/css/styles.css src/_data/assets.json
git commit -m "feat: self-host Inter, JetBrains Mono, Clash Display (woff2 + licenses)"
```

---

### Task 6: Layouts, partials, page conversion — CDNs and static AdSense tag removed

**Files:**
- Create: `src/_data/site.js`, `src/_includes/layouts/base.njk`, `src/_includes/layouts/home.njk`, `src/_includes/layouts/page.njk`
- Modify: all five `src/*.html` pages (front matter + strip shell, keep body verbatim), `eleventy.config.js` (remove TEMPORARY passthroughs)

**Interfaces:**
- Consumes: `assets.*` manifest (Task 4), font files (Task 5).
- Produces: page front matter contract: `layout`, `title`, `description`, `permalink`, `navCurrent` (subpages only). `site.url`/`site.name` from `src/_data/site.js`.

- [x] **Step 1: Write `src/_data/site.js`**

```js
export default {
  url: "https://stackwith.me",
  name: "AXON",
  ogImage: "/og.png",
};
```

- [x] **Step 2: Write `src/_includes/layouts/base.njk`**

```njk
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{ title }}</title>
  <meta name="description" content="{{ description }}" />

  <link rel="canonical" href="{{ site.url }}{{ page.url }}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{{ site.url }}{{ page.url }}" />
  <meta property="og:title" content="{{ ogTitle or title }}" />
  <meta property="og:description" content="{{ description }}" />
  <meta property="og:image" content="{{ site.url }}{{ site.ogImage }}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="theme-color" content="#07080A" />

  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2307080A'/%3E%3Cpath d='M4 16h6l3-8 6 16 3-8h6' fill='none' stroke='%23B8FF3C' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'/%3E%3C/svg%3E" />

  <link rel="preload" href="/assets/fonts/ClashDisplay-500.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/assets/fonts/Inter-400.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/assets/fonts/JetBrainsMono-400.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="{{ assets.styles }}" />

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "AXON",
    "url": "{{ site.url }}",
    "description": "Autonomous AI agent instrument for software teams.",
    "logo": "{{ site.url }}{{ site.ogImage }}"
  }
  </script>
  {% block extrahead %}{% endblock %}
</head>
<body class="{{ bodyClass }}">
{{ content | safe }}
</body>
</html>
```
NOTE: `page.url` for `permalink: "about.html"` renders `/about.html` — exactly the live canonical. For index it is `/`.

- [x] **Step 3: Write `src/_includes/layouts/home.njk`**

Front matter chains to base; body is everything from current `src/index.html` between `<body class="booting">` and `</body>` EXCEPT the `<main id="main">…</main>` inner content (replaced by `{{ content | safe }}`) and the `<!-- Libraries -->` script block (replaced by bundle references). Copy the markup verbatim from the current file — skip link, `canvas.nerve`, `.nerve-scrim`, `.probe`, `.rail`, `header.nav` (with Platform/Process/Pricing links, readout, burger), `.menu`, footer. End with:

```njk
---
layout: layouts/base.njk
bodyClass: booting
---
<a class="skip-link" href="#main">Skip to content</a>
… (verbatim from index.html: nerve canvas, scrim, probe, rail, nav, menu) …
<main id="main">
{{ content | safe }}
</main>
… (verbatim footer from index.html) …
<script src="{{ assets.main }}" defer></script>
<script src="{{ assets.consent }}" defer></script>
<script type="module" src="{{ assets.neural3d }}"></script>
```

And in base.njk's `extrahead` block (home only) add via override in home.njk:

```njk
{% block extrahead %}
<noscript><style>
  body::before { display: none !important; }
  body.anim [data-reveal] { opacity: 1 !important; transform: none !important; }
  .nerve, .nerve-scrim, .probe { display: none !important; }
</style></noscript>
{% endblock %}
```
IMPORTANT: Eleventy layout chaining does not support njk `{% block %}` across layout files (layouts wrap via `content`). Instead of blocks, put the noscript styles UNCONDITIONALLY in `base.njk` head (they only reference selectors that exist on the home page; harmless on subpages) and DELETE the `{% block extrahead %}` line from base.njk. Keep base.njk free of njk block syntax entirely.

DELETED for good in this step (do not carry into layouts): the Google Fonts / Fontshare `<link>`s and their 4 preconnects, the three.js import-map `<script>`, the GSAP/ScrollTrigger/Lenis CDN `<script>`s, and the static `adsbygoogle.js` `<script>` (consent.js takes over in Task 8; ads are OFF between Task 6 and Task 8 — fail-closed is intended).

- [x] **Step 4: Write `src/_includes/layouts/page.njk`**

```njk
---
layout: layouts/base.njk
bodyClass: no3d page
---
<a class="skip-link" href="#main">Skip to content</a>

<header class="nav is-scrolled">
  <a href="/" class="nav__brand" aria-label="AXON home">
    <span class="nav__mark" aria-hidden="true">
      <svg viewBox="0 0 28 28"><path d="M2 14h5l3-7 6 14 3-7h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>
    </span>
    <span class="nav__word">AXON</span>
  </a>
  <nav class="nav__links" aria-label="Primary">
    <a href="/about.html" data-index="01"{% if navCurrent == "about" %} aria-current="page"{% endif %}>About</a>
    <a href="/contact.html" data-index="02"{% if navCurrent == "contact" %} aria-current="page"{% endif %}>Contact</a>
  </nav>
  <div class="nav__right">
    <a href="/#engage" class="btn btn--signal">Get access</a>
  </div>
</header>

<main id="main" class="doc">
{{ content | safe }}
</main>

<footer class="footer">
  <div class="footer__base">
    <span>© <span id="year">2026</span> AXON</span>
    <span><a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · <a href="/about.html">About</a> · <a href="/contact.html">Contact</a></span>
    <span>MADE&nbsp;WITH&nbsp;INTENT</span>
  </div>
</footer>

<script src="{{ assets.consent }}" defer></script>
<script>document.getElementById("year").textContent = new Date().getFullYear();</script>
```
(Relative `./x.html` links become root-absolute `/x.html` — same URLs on this single-level site, and they now also work if a page is ever served from a subpath context like the blog.)

- [x] **Step 5: Convert the five pages**

For each page: front matter gains `layout`, `title`, `description`, `navCurrent` (subpages); everything outside the `<main>` inner content is deleted (the layout now provides it). The `<main>` inner content is preserved BYTE-FOR-BYTE. Example `src/about.html` front matter (YAML — quote strings containing `:` or `—`):

```yaml
---
layout: layouts/page.njk
title: "About — AXON"
description: "Why we built AXON: the story, the principles, and the team behind the nervous system for your software."
permalink: "about.html"
navCurrent: about
---
```

`src/index.html`:

```yaml
---
layout: layouts/home.njk
title: "AXON — The nervous system for your software"
description: "AXON is the autonomous agent instrument that senses, reasons, and acts across your entire stack in microseconds. Deploy agents that fire like nerves."
ogTitle: "AXON — Signal Instrument for autonomous agents"
permalink: "index.html"
---
```
(Current index og:title/og:description differ from the page title/meta description — preserve og:title via `ogTitle`; og:description follows `description`, an acceptable unification since the old og:description said the same thing shorter.)

Titles/descriptions for the other pages — copy exactly from each current file's `<title>` and `<meta name="description">`:
- contact: `Contact — AXON` / current description / `navCurrent: contact`
- privacy: `Privacy Policy — AXON` (verify against file) / current description / no navCurrent
- terms: `Terms of Service — AXON` (verify against file) / current description / no navCurrent

- [x] **Step 6: Remove the TEMPORARY passthroughs from `eleventy.config.js`** (the four lines marked TEMPORARY in Task 3).

- [x] **Step 7: Build and verify**

```bash
node scripts/build-assets.mjs && npx @11ty/eleventy
# forbidden origins must be gone from every page:
grep -rlE "fonts.googleapis|fontshare|cdnjs.cloudflare|cdn.jsdelivr|pagead2" _site --include="*.html" | grep -v "^_site/blog" ; echo "exit=$?"
# og/canonical present everywhere:
for p in index about contact privacy terms; do grep -o 'property="og:image" content="[^"]*"' _site/$p.html; done
grep -c 'rel="canonical"' _site/about.html
# hashed references:
grep -oE '/assets/(main|consent|neural3d|styles)\.[A-Za-z0-9]+\.(js|css)' _site/index.html
# key content intact:
grep -c "The nervous system" _site/index.html && grep -c "stage__no" _site/index.html
```
Expected: forbidden-origin grep exits `1` (no matches outside blog/ and 404.html, which are out of scope and keep their original heads); og:image is `https://stackwith.me/og.png` on all 5; 4 hashed asset refs on index; content greps ≥ 1.

- [x] **Step 8: Visual check against baseline**

```bash
python3 -m http.server 8080 -d _site & echo $! > /tmp/axon-serve.pid
node scripts/qa-shots.mjs 1440 900 && kill $(cat /tmp/axon-serve.pid)
```
Expected: screenshots match `/tmp/axon-qa-baseline-desktop`. Fonts must render identically (self-hosted now). `ERRORS` may list `gsap is not defined`-style failures — main.js still expects CDN globals until Task 9; if 3D/animations are broken in shots, that's the known intermediate state ONLY IF errors reference gsap/Lenis. Note it and proceed (Task 9 fixes); anything else, stop and fix.

- [x] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Nunjucks layouts; self-hosted assets replace all CDN origins; OG/canonical on every page"
```

---

### Task 7: CDP smoke-test harness

**Files:**
- Create: `scripts/smoke.mjs`

**Interfaces:**
- Produces: `node scripts/smoke.mjs` — serves `_site/` on port 8123, drives headless Chrome, exits 0/1 with a PASS/FAIL list. Later tasks add no new files for testing; they extend `CHECKS` in this file.

- [x] **Step 1: Write `scripts/smoke.mjs`**

```js
// Smoke tests: serve _site, drive headless Chrome over CDP, assert behavior.
// Usage: node scripts/smoke.mjs   (exits 1 on any failure)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = "_site";
const PORT = 8123;
const CDP_PORT = 9333;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.SMOKE_BASE || `http://localhost:${PORT}`;

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain", ".json": "application/json" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
});
if (!process.env.SMOKE_BASE) {
  if (!existsSync(ROOT)) { console.error(`no ${ROOT}/ — run the build first`); process.exit(1); }
  await new Promise((r) => server.listen(PORT, r));
}

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${CDP_PORT}`, "--window-size=1440,900",
  "--hide-scrollbars", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
  "--no-first-run", `--user-data-dir=/tmp/axon-smoke-profile-${Date.now()}`, "about:blank",
], { stdio: "ignore" });

async function wsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome CDP not ready");
}
const ws = new WebSocket(await wsUrl());
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });

let mid = 0; const pending = new Map(); const exceptions = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
  if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params?.exceptionDetails?.text || "exception");
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++mid; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });

const targets = await send("Target.getTargets");
const pageT = targets.targetInfos.find((t) => t.type === "page");
const { sessionId } = await send("Target.attachToTarget", { targetId: pageT.targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable"); await S("Runtime.enable");

const evalJs = async (expr) => (await S("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const go = async (url, settle = 2500) => { exceptions.length = 0; await S("Page.navigate", { url }); await sleep(settle); };
const metrics = (w, h, mobile = false) => S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });

let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); if (!ok) failed++; };

/* ---- 1 · every page loads clean, correct head, no ads before consent ---- */
for (const p of ["/", "/about.html", "/contact.html", "/privacy.html", "/terms.html"]) {
  await metrics(1440, 900);
  await go(BASE + p, 3200);
  check(`${p} no JS exceptions`, exceptions.length === 0, JSON.stringify(exceptions.slice(0, 3)));
  check(`${p} title`, !!(await evalJs("document.title")));
  check(`${p} canonical`, !!(await evalJs(`document.querySelector('link[rel="canonical"]')?.href`)));
  check(`${p} og:image absolute`, String(await evalJs(`document.querySelector('meta[property="og:image"]')?.content`)).startsWith("https://stackwith.me/"));
  check(`${p} no adsense before consent`, !(await evalJs(`!!document.querySelector('script[src*="pagead2"]')`)));
  check(`${p} consent banner shown`, await evalJs(`!!document.querySelector('aside.consent')`));
  await evalJs("localStorage.clear()");
}

/* ---- 2 · index runtime ---- */
await go(BASE + "/", 4000);
check("index lenis active", await evalJs("!!window.__lenis"));
check("index gsap anim armed", await evalJs(`document.body.classList.contains("anim")`));
check("index hero decoded", (await evalJs(`document.querySelector(".hero__title").textContent.replace(/\\s+/g," ").trim()`)) === "The nervous system for your software.");
check("index no3d not triggered", !(await evalJs(`document.body.classList.contains("no3d")`)));
check("index --faint token", (await evalJs(`getComputedStyle(document.documentElement).getPropertyValue("--faint").trim().toUpperCase()`)) === "#78828E");

/* ---- 3 · consent gating ---- */
await evalJs("localStorage.clear()");
await go(BASE + "/", 2500);
await evalJs(`document.querySelector(".consent .btn--ghost").click()`); // Essential only
await sleep(400);
check("essential → stored", (await evalJs(`localStorage.getItem("axon-consent")`)) === "essential");
check("essential → no ads script", !(await evalJs(`!!document.querySelector('script[src*="pagead2"]')`)));
await go(BASE + "/", 2500);
check("essential persists, no banner", !(await evalJs(`!!document.querySelector("aside.consent")`)));
check("essential persists, still no ads", !(await evalJs(`!!document.querySelector('script[src*="pagead2"]')`)));
await evalJs("localStorage.clear()");
await go(BASE + "/", 2500);
await evalJs(`document.querySelector(".consent .btn--signal").click()`); // Accept all
await sleep(400);
check("accept → ads script injected", await evalJs(`!!document.querySelector('script[src*="pagead2"]')`));
await go(BASE + "/", 2500);
check("accept persists → ads on load", await evalJs(`!!document.querySelector('script[src*="pagead2"]')`));
await evalJs("localStorage.clear()");

/* ---- 4 · mobile menu a11y ---- */
await metrics(390, 844, true);
await go(BASE + "/", 3000);
check("mobile: burger visible", await evalJs(`getComputedStyle(document.getElementById("burger")).display !== "none"`));
check("mobile: closed menu hidden", (await evalJs(`getComputedStyle(document.getElementById("menu")).visibility`)) === "hidden");
await evalJs(`document.getElementById("burger").click()`);
await sleep(600);
check("mobile: menu opens", await evalJs(`document.getElementById("menu").classList.contains("is-open")`));
check("mobile: focus moved into menu", await evalJs(`document.getElementById("menu").contains(document.activeElement)`));
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
await sleep(600);
check("mobile: Escape closes menu", !(await evalJs(`document.getElementById("menu").classList.contains("is-open")`)));
check("mobile: focus returned to burger", await evalJs(`document.activeElement === document.getElementById("burger")`));

/* ---- 5 · form (endpoint unset → honest inline success) ---- */
await metrics(1440, 900);
await go(BASE + "/", 3000);
await evalJs(`(() => { const f = document.querySelector(".engage__form"); f.querySelector("input").value = "smoke@test.dev"; f.requestSubmit(); })()`);
await sleep(1200);
const okText = await evalJs(`document.querySelector(".engage__ok")?.textContent || ""`);
check("form: honest success shown", okText.includes("on the list"), okText);
check("form: no inbox promise", !okText.toLowerCase().includes("inbox"), okText);

ws.close(); chrome.kill(); server.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
```

- [x] **Step 2: Run — expect the KNOWN failures list**

```bash
node scripts/build-assets.mjs && npx @11ty/eleventy && node scripts/smoke.mjs
```
Expected at this point (fixes land in Tasks 8–11): FAILs for `no adsense before consent`?? — NO: the static tag is already gone (Task 6), and consent.js doesn't inject yet, so ads checks PASS vacuously except `accept → ads script injected` FAILS; `lenis active`/`gsap` FAIL (main.js still expects CDN globals); `--faint token` FAILS; `closed menu hidden` FAILS; `focus` checks FAIL; `form honest` FAILS ("Check your inbox" copy). Every `no JS exceptions`, `title`, `canonical`, `og:image`, `consent banner shown` must PASS. Record the exact list — Tasks 8–11 must flip each to PASS.

- [x] **Step 3: Commit**

```bash
git add scripts/smoke.mjs
git commit -m "test: CDP smoke harness for pages, consent gating, menu a11y, form"
```

> Recorded Task 7 baseline (12 known FAILs, all expected): `index lenis active`, `index gsap anim armed`, `index hero decoded` (→ Task 9); `index --faint token`, `form: honest success shown`, `form: no inbox promise` (→ Task 11); `accept → ads script injected`, `accept persists → ads on load` (→ Task 8); `mobile: closed menu hidden`, `mobile: focus moved into menu`, `mobile: Escape closes menu`, `mobile: focus returned to burger` (→ Task 10). All page-head/consent-banner/no-exception checks PASS.

---

### Task 8: Consent-gated AdSense

**Files:**
- Modify: `src/assets/js/consent.js` (full rewrite below)

- [x] **Step 1: Replace `src/assets/js/consent.js` entirely with:**

```js
/* AXON — consent.js · cookie-consent banner + consent-gated AdSense loader
   The AdSense script is ONLY injected after explicit "Accept all" consent
   (or a stored "all" choice from a previous visit). "Essential only" never
   loads it. Not a full IAB TCF CMP — see README "Consent architecture". */
(() => {
  "use strict";
  const ADS_CLIENT = "ca-pub-7262404901375077";

  const loadAds = () => {
    if (document.getElementById("adsbygoogle-js")) return;
    const s = document.createElement("script");
    s.id = "adsbygoogle-js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + ADS_CLIENT;
    document.head.appendChild(s);
  };

  let stored = null;
  try { stored = localStorage.getItem("axon-consent"); } catch (e) { /* private mode */ }
  if (stored === "all") loadAds();
  if (stored) return;

  const bar = document.createElement("aside");
  bar.className = "consent";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Cookie consent");

  const msg = document.createElement("p");
  msg.append("[ COOKIES ] We use cookies to analyse traffic and, with your consent, to serve ads. Details in our ");
  const link = document.createElement("a");
  link.href = "/privacy.html";
  link.textContent = "Privacy Policy";
  msg.append(link, ".");

  const acts = document.createElement("div");
  acts.className = "consent__acts";
  const mk = (label, val, cls) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn " + cls;
    b.textContent = label;
    b.addEventListener("click", () => {
      try { localStorage.setItem("axon-consent", val); } catch (e) { /* ignore */ }
      if (val === "all") loadAds();
      bar.remove();
    });
    return b;
  };
  acts.append(mk("Accept all", "all", "btn--signal"), mk("Essential only", "essential", "btn--ghost"));

  bar.append(msg, acts);
  const mount = () => document.body.appendChild(bar);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
```

- [x] **Step 2: Rebuild + smoke**

```bash
node scripts/build-assets.mjs && npx @11ty/eleventy && node scripts/smoke.mjs 2>&1 | grep -E "ads|essential|accept|consent"
```
Expected: ALL consent-section checks PASS (`essential → no ads script`, `accept → ads script injected`, persistence both ways).

- [x] **Step 3: Commit**

```bash
git add src/assets/js/consent.js src/_data/assets.json
git commit -m "fix: consent banner actually gates AdSense (inject only on accept-all)"
```

---

### Task 9: main.js — npm imports, dead oscilloscope removal

**Files:**
- Modify: `src/assets/js/main.js`, `src/assets/css/styles.css`

- [x] **Step 1: Swap globals for imports in `src/assets/js/main.js`**

At the very top, BEFORE the opening `(() => {` IIFE line, add:

```js
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "@studio-freight/lenis";
```

Then inside the IIFE change the two capability lines (currently `const hasGSAP = !!(window.gsap && window.ScrollTrigger);` and the Lenis guard `if (!reduced && window.Lenis) {`):

```js
const hasGSAP = !!(gsap && ScrollTrigger);
```
```js
if (!reduced && typeof Lenis === "function") {
```
Everything else in those sections stays identical (`gsap.registerPlugin(ScrollTrigger)`, `new Lenis({...})`, `window.__lenis = lenis`).

- [x] **Step 2: Delete the dead oscilloscope section**

Remove the ENTIRE section 5 block — from the comment
`/* ---------------------------------------------------------\n     5 · OSCILLOSCOPE (hero canvas)\n  --------------------------------------------------------- */`
through the closing `}` right before the section 6 comment (`6 · DECODE`). It is ~70 lines beginning `const scope = $("#scope");` — the `#scope` canvas does not exist in the HTML; this code never ran.

- [x] **Step 3: Remove dead `.scope` CSS**

In `src/assets/css/styles.css`:
- Delete the rule `.scope { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; opacity: .9; }` (HERO section).
- In the reduced-motion block change `.scope, .engage__scope { display: none; }` → `.engage__scope { display: none; }`.

- [x] **Step 4: Rebuild + smoke**

```bash
node scripts/build-assets.mjs && npx @11ty/eleventy && node scripts/smoke.mjs 2>&1 | grep -E "lenis|gsap|decoded|no3d|exceptions"
```
Expected: `index lenis active`, `index gsap anim armed`, `index hero decoded`, `index no3d not triggered` all PASS; every `no JS exceptions` PASS. Also grep the bundle for regressions:
```bash
grep -c "scope" dist-assets/main.*.js
```
Expected: `0` (or exit 1 = no matches).

- [x] **Step 5: Visual spot-check**

```bash
python3 -m http.server 8080 -d _site & echo $! > /tmp/axon-serve.pid
node scripts/qa-shots.mjs 1440 900 && kill $(cat /tmp/axon-serve.pid)
```
Expected: screenshots match baseline; `REPORT` has `"no3d":false`; `ERRORS []`. Animations (reveals, pinned pipeline, marquee, 3D nerve) all present.

- [x] **Step 6: Commit**

```bash
git add src/assets/js/main.js src/assets/css/styles.css src/_data/assets.json
git commit -m "refactor: bundle gsap/lenis via npm imports; remove dead oscilloscope code"
```

> Task 9 verification notes: (1) `grep -c "scope" dist-assets/main.*.js` returns matches from gsap's OWN minified internals (`Invalid scope`, `this.scope`) now that gsap is bundled — the plan's expected `0` didn't account for that. Verified our dead code is gone via `grep -c '"#scope"'` = 0 matches. (2) `index hero decoded` could never pass as written: the markup is `The nervous system<br>for your software.` with no whitespace around `<br>`, so `textContent` yields "systemfor". Fixed the harness check to use `innerText` (treats `<br>` as a line break) — verified it returns exactly "The nervous system for your software." post-decode. Page content untouched.

---

### Task 10: Mobile menu accessibility

**Files:**
- Modify: `src/assets/css/styles.css` (`.menu` rule), `src/assets/js/main.js` (section 3)

- [ ] **Step 1: CSS — make the closed menu truly hidden**

Change the `.menu` rule (NAV section) from:

```css
.menu {
  position: fixed; inset: 0; z-index: 90; background: var(--bg);
  display: flex; flex-direction: column; justify-content: center; gap: 1rem; padding: var(--pad);
  opacity: 0; pointer-events: none; transform: translateY(-10px);
  transition: opacity .4s var(--ease), transform .4s var(--ease);
}
.menu.is-open { opacity: 1; pointer-events: auto; transform: none; }
```
to:
```css
.menu {
  position: fixed; inset: 0; z-index: 90; background: var(--bg);
  display: flex; flex-direction: column; justify-content: center; gap: 1rem; padding: var(--pad);
  opacity: 0; pointer-events: none; transform: translateY(-10px); visibility: hidden;
  transition: opacity .4s var(--ease), transform .4s var(--ease), visibility 0s linear .4s;
}
.menu.is-open { opacity: 1; pointer-events: auto; transform: none; visibility: visible; transition: opacity .4s var(--ease), transform .4s var(--ease), visibility 0s; }
```

- [ ] **Step 2: JS — focus management + Escape**

Replace section 3's `toggleMenu` and add the Escape handler after `burger?.addEventListener("click", toggleMenu);`:

```js
  function toggleMenu() {
    const open = menu.classList.toggle("is-open");
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
    if (open) setTimeout(() => menu.querySelector("a")?.focus(), 50);
    else burger.focus();
  }
```
```js
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu?.classList.contains("is-open")) {
      closeMenu();
      burger.focus();
    }
  });
```
(`closeMenu` already exists and is also called by anchor clicks — leave it unchanged.)

- [ ] **Step 3: Rebuild + smoke**

```bash
node scripts/build-assets.mjs && npx @11ty/eleventy && node scripts/smoke.mjs 2>&1 | grep "mobile:"
```
Expected: all five `mobile:` checks PASS.

- [ ] **Step 4: Commit**

```bash
git add src/assets/css/styles.css src/assets/js/main.js src/_data/assets.json
git commit -m "fix(a11y): mobile menu — visibility gating, Escape to close, focus management"
```

---

### Task 11: Form endpoint, idle-loop gating, contrast token

**Files:**
- Modify: `src/assets/js/main.js` (sections 11, 12, 15), `src/assets/css/styles.css` (`:root` + one new rule)

- [ ] **Step 1: Contrast token**

In `src/assets/css/styles.css` `:root`, change `--faint:     #565E6A;` → `--faint:     #78828E;` (≈5.1:1 on `--bg`, passes WCAG AA; verified with WCAG relative-luminance formula).

- [ ] **Step 2: Error style for the form**

Add after the `.engage__ok` rule:

```css
.engage__err { font-family: var(--mono); font-size: .8rem; color: var(--warn); margin-top: .8rem; }
```

- [ ] **Step 3: Replace form handler (section 15)**

Replace the whole `const form = $(".engage__form"); if (form) { ... }` block with:

```js
  const FORM_ENDPOINT = ""; // ← paste your Formspree endpoint here, e.g. "https://formspree.io/f/abcdwxyz" (see README)
  const form = $(".engage__form");
  if (form) {
    let sending = false;
    const showSuccess = (email) => {
      const p = document.createElement("p");
      p.className = "engage__ok"; p.setAttribute("role", "status");
      const dot = document.createElement("span"); dot.className = "live-dot";
      const b = document.createElement("b"); b.textContent = email || "you";
      p.append(dot, " Signal received — ", b, " is on the list. We'll be in touch.");
      form.replaceChildren(p);
    };
    const showError = () => {
      let err = form.querySelector(".engage__err");
      if (!err) { err = document.createElement("p"); err.className = "engage__err"; err.setAttribute("role", "alert"); form.appendChild(err); }
      err.textContent = "Transmission failed — please retry, or email hello@stackwith.me.";
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (sending) return;
      const input = form.querySelector("input");
      if (input && !input.checkValidity()) { input.reportValidity(); return; }
      sending = true;
      const btn = form.querySelector("button");
      if (btn) { btn.setAttribute("aria-busy", "true"); btn.textContent = "TRANSMITTING…"; }
      const email = input ? input.value.trim() : "";
      if (!FORM_ENDPOINT) { setTimeout(() => showSuccess(email), 650); return; }
      try {
        const res = await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        showSuccess(email);
      } catch (err) {
        sending = false;
        if (btn) { btn.removeAttribute("aria-busy"); btn.textContent = "Request access"; }
        showError();
      }
    });
  }
```

- [ ] **Step 4: Gate the marquee (section 12)**

Replace the whole `const mtrack = $("#marquee"); if (mtrack && !reduced) { ... }` block with:

```js
  const mtrack = $("#marquee");
  if (mtrack && !reduced) {
    mtrack.innerHTML += mtrack.innerHTML;
    let off = 0, base = 0.4, marqueeOn = false, marqueeVisible = false;
    const move = () => {
      if (!marqueeOn) return;
      const v = lenis ? Math.min(6, Math.abs(lenis.velocity || 0) * 0.35) : 0;
      off -= base + v;
      const half = mtrack.scrollWidth / 2;
      if (-off >= half) off += half;
      mtrack.style.transform = `translateX(${off}px)`;
      requestAnimationFrame(move);
    };
    const setRunning = () => {
      const should = marqueeVisible && !document.hidden;
      if (should && !marqueeOn) { marqueeOn = true; requestAnimationFrame(move); }
      else if (!should) marqueeOn = false;
    };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => { marqueeVisible = e.isIntersecting; setRunning(); }, { threshold: 0 }).observe(mtrack);
    } else { marqueeVisible = true; setRunning(); }
    document.addEventListener("visibilitychange", setRunning);
  }
```

- [ ] **Step 5: Gate the live counters (section 11)**

In the `if (!reduced) setInterval(() => { ... }, 2600);` block for `firing`/`throughput`, add as the first line of the callback:

```js
    if (document.hidden) return;
```

- [ ] **Step 6: Rebuild + smoke — everything green now**

```bash
node scripts/build-assets.mjs && npx @11ty/eleventy && node scripts/smoke.mjs
```
Expected: `ALL PASS` (every check from Task 7's list flipped).

- [ ] **Step 7: Commit**

```bash
git add src/assets/js/main.js src/assets/css/styles.css src/_data/assets.json
git commit -m "fix: real form path w/ honest copy, idle-gated marquee/counters, AA contrast token"
```

---

### Task 12: HTML minification

**Files:**
- Modify: `eleventy.config.js`

- [ ] **Step 1: Add the transform** (top of file: `import { minify } from "html-minifier-terser";`)

```js
  eleventyConfig.addTransform("htmlmin", async function (content) {
    if ((this.page.outputPath || "").endsWith(".html")) {
      return minify(content, {
        collapseWhitespace: true,
        conservativeCollapse: true,
        removeComments: true,
        keepClosingSlash: true,
        minifyJS: false,
        minifyCSS: false,
      });
    }
    return content;
  });
```

- [ ] **Step 2: Build + verify**

```bash
node scripts/build-assets.mjs && npx @11ty/eleventy
wc -c _site/index.html && grep -c "░░" _site/index.html ; echo "comments-gone=$?"
node scripts/smoke.mjs
```
Expected: index.html noticeably smaller; decorative comments gone (grep exits 1); `ALL PASS` (conservativeCollapse preserves the single spaces that inline-block word/glyph layout depends on — if any smoke visual check regresses, drop `collapseWhitespace` rather than debugging spacing).

- [ ] **Step 3: Commit**

```bash
git add eleventy.config.js
git commit -m "build: conservative HTML minification transform"
```

---

### Task 13: README rewrite

**Files:**
- Modify: `README.md` (full replacement)

- [ ] **Step 1: Replace README.md with:**

```markdown
# AXON — "Signal Instrument"

Landing site for AXON, art-directed as a lab oscilloscope: carbon canvas, one rationed
electric signal-green, and a WebGL nerve you fly through as you scroll.
Live at **https://stackwith.me** (GitHub Pages, custom domain).

## Stack

- **Eleventy 3** (Nunjucks layouts in `src/_includes/`) renders 5 pages from shared shells.
- **esbuild** bundles `main.js` (gsap + lenis), `consent.js`, `neural3d.js` (three.js) and
  `styles.css` with content-hashed filenames; `scripts/build-assets.mjs` writes the manifest
  Eleventy templates read (`src/_data/assets.json`).
- **Self-hosted fonts** (`src/assets/fonts/` — Inter, JetBrains Mono, Clash Display; see
  LICENSES.md there). Zero third-party origins at load time.
- **Deploy:** push to `main` → GitHub Actions builds `_site/` → `actions/deploy-pages`.

## Develop

```bash
npm install
npm run dev            # build assets once + eleventy --serve on :8080
npm run watch:assets   # (second terminal) rebuild bundles on JS/CSS change
npm run build          # production build → _site/
```

## Test

```bash
npm run build && npm run smoke   # CDP smoke tests: pages, consent gating, menu a11y, form
python3 -m http.server 8080 -d _site &
npm run qa                        # scrolling screenshots → /tmp/axon-qa (also: npm run qa -- 390 844)
```

## Consent architecture

`consent.js` shows the cookie banner on first visit. The Google AdSense script is injected
**only** after "Accept all" (or a stored `all` choice). "Essential only" never loads it.
This is consent-gating, not a full IAB TCF CMP — if you need TCF strings for EEA
personalized ads, wire a certified CMP and keep `loadAds()` as the post-consent hook.
Stored under `localStorage["axon-consent"]` (`all` | `essential`).

## Access form

`src/assets/js/main.js` → `FORM_ENDPOINT`. Create a free form at https://formspree.io,
paste the endpoint (e.g. `https://formspree.io/f/abcdwxyz`) into the constant, rebuild.
While empty, the form shows an honest inline confirmation and sends nothing.

## Editing

- Design tokens: `:root` in `src/assets/css/styles.css`.
- Copy: page front matter + `<main>` content in `src/*.html`; shared shells in `src/_includes/`.
- 3D nerve tuning: `N_POINTS`, bloom, exposure, `uNear/uFar` in `src/assets/js/neural3d.js`.
- `src/blog/` and `src/404.html` are copied verbatim (not templated).

Made with intent.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README for the Eleventy/esbuild toolchain"
```

---

### Task 14: GitHub Actions deploy + go live

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy site

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Final local gate before pushing**

```bash
node scripts/build-assets.mjs && npx @11ty/eleventy && node scripts/smoke.mjs
python3 -m http.server 8080 -d _site & echo $! > /tmp/axon-serve.pid
node scripts/qa-shots.mjs 1440 900
node scripts/qa-shots.mjs 390 844
kill $(cat /tmp/axon-serve.pid)
git status --short
```
Expected: `ALL PASS`; both screenshot sets match their baselines (open side-by-side; ONLY acceptable difference: slightly lighter faint-gray labels). Working tree clean except `.github/`.

- [ ] **Step 3: Commit and push**

```bash
git add .github
git commit -m "ci: build and deploy via GitHub Actions + Pages artifact"
git push origin main
```

- [ ] **Step 4: Switch Pages source to GitHub Actions**

```bash
gh auth status && gh api -X PUT repos/joelryan18/stackp.github.io/pages -f build_type=workflow
```
If `gh` is not authenticated: tell the user to open https://github.com/joelryan18/stackp.github.io/settings/pages and set **Source: GitHub Actions** (one dropdown). The branch-based site keeps serving until the first Actions deploy succeeds.

- [ ] **Step 5: Watch the workflow and verify live**

```bash
gh run watch --repo joelryan18/stackp.github.io --exit-status || gh run list --repo joelryan18/stackp.github.io --limit 3
sleep 30
curl -s -o /dev/null -w "home %{http_code}\n" https://stackwith.me/
curl -s https://stackwith.me/ | grep -oE '/assets/(main|styles)\.[A-Za-z0-9]+\.(js|css)' | head -2
curl -s https://stackwith.me/ | grep -c pagead2 ; echo "no-static-adsense=$?"
curl -s -o /dev/null -w "about %{http_code}\n" https://stackwith.me/about.html
curl -s -o /dev/null -w "sitemap %{http_code}\n" https://stackwith.me/sitemap.xml
curl -s -o /dev/null -w "404page %{http_code}\n" https://stackwith.me/does-not-exist
SMOKE_BASE=https://stackwith.me node scripts/smoke.mjs
```
Expected: workflow green; home/about/sitemap `200`; hashed assets referenced; `pagead2` grep exits 1 (not in static HTML); missing route returns `404`; live smoke run `ALL PASS`.

---

### Task 15: Home-directory repo cleanup (checklist-gated)

Only start after Task 14's live verification passed.

- [ ] **Step 1: Verify the new checkout is authoritative**

```bash
cd /Users/joel/Projects/axon-site
git status --short            # expect: empty
git log origin/main..main     # expect: empty (everything pushed)
ls src/blog src/404.html      # expect: carried-over work present
```
ALL three must hold. If not, STOP — do not delete anything.

- [ ] **Step 2: Inspect the stray root npm files before touching them**

```bash
head -20 /Users/joel/package.json && ls /Users/joel/node_modules | head
```
If `package.json` clearly belongs to a site experiment (deps like `serve`, `three`, `gsap`, nothing else), include it in Step 3's deletion. If it references anything unrelated, LEAVE IT and note it to the user.

- [ ] **Step 3: Remove the repo and tracked site files from the home directory — exactly this list, nothing more**

```bash
cd /Users/joel
rm -rf .git
rm -f CNAME README.md about.html ads.txt consent.js contact.html index.html main.js neural3d.js og.png privacy.html robots.txt sitemap.xml styles.css terms.html 404.html
rm -rf scripts blog
# only if Step 2 said site-related:
# rm -rf node_modules package.json package-lock.json
```

- [ ] **Step 4: Verify**

```bash
cd /Users/joel && git status 2>&1 | head -1
ls /Users/joel/Projects/axon-site/src/index.html
```
Expected: `fatal: not a git repository` (home dir is clean); the site lives only in `~/Projects/axon-site`.

- [ ] **Step 5: Final report to user** — summarize: new location, live URL, what changed, the one manual step remaining (Formspree endpoint), and where baselines/screenshots are.

---

## Plan Self-Review (done at write time)

- **Spec coverage:** repo relocation (T1/T15), toolchain (T2–T4), fonts (T5), layouts/OG/CDN removal (T6), smoke harness (T7), consent gating (T8), dead code (T9), menu a11y (T10), form/idle-loops/contrast (T11), minification (T12), README (T13), CI + Pages switch + live verify (T14). Blog/404 passthrough untouched (T3 ignores + passthrough). All 10 spec-table fixes have a task.
- **Placeholder scan:** no TBDs; all code complete; page-body moves are verbatim-copy instructions by design (bodies must not change).
- **Type consistency:** manifest keys `styles/main/consent/neural3d` consistent across T4 (writer), T6 (templates), T14 (curl greps). Consent key `axon-consent` + `#adsbygoogle-js` consistent across T7/T8. Font filenames consistent across T5 (files) and T6 (preloads).
