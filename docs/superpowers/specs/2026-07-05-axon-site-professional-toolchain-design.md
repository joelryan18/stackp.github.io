# AXON Site — Professionalization & Toolchain Migration (Design)

**Date:** 2026-07-05
**Repo:** `joelryan18/stackp.github.io` → local working copy `~/Projects/axon-site`
**Live site:** https://stackwith.me (GitHub Pages, custom domain via CNAME)

## Goal

Professionalize the engineering of the AXON landing site — code quality, performance,
accessibility, SEO, security, maintainability — while keeping the visual design
pixel-identical (single sanctioned exception: the `--faint` contrast token, below).
Migrate from zero-build plain files to a full static-site toolchain (Approach C,
user-selected): Eleventy 3 + esbuild + GitHub Actions deploy.

## Out of scope

- The in-progress blog (`blog/`), `404.html`, and the FAQ styles appended to
  `styles.css`. These ride along verbatim (passthrough-copied into the build) but are
  NOT wired into nav/sitemap and NOT edited.
- Copy/design changes of any kind.
- AdSense content-policy questions (fictional product content).

## Decisions (user delegated; recorded here)

1. **Form:** real submission path behind a `FORM_ENDPOINT` constant (Formspree-compatible
   fetch POST with busy/error states). Empty endpoint → honest inline success copy with no
   false "check your inbox" promise. README documents the 5-minute Formspree hookup.
2. **Contrast:** bump `--faint` from `#565E6A` (≈2.9:1 on `--bg`) to `#78828E` (≈4.6:1,
   passes WCAG AA for normal text). No other token changes.
3. **Home-directory repo:** after the new checkout is verified and deployed, remove the
   git repo from `/Users/joel` (delete `.git` plus tracked site files only, after an
   explicit verification checklist passes). The home directory stops being a clone of a
   public repo.

## Target structure

```
axon-site/
├── eleventy.config.js
├── package.json                # eleventy, esbuild, three, gsap, lenis, html-minifier-terser
├── .gitignore                  # node_modules/, _site/
├── .github/workflows/deploy.yml
├── docs/                       # this spec + plans (excluded from build)
└── src/
    ├── _data/site.js           # url ("https://stackwith.me"), name, default description
    ├── _includes/
    │   ├── layouts/base.njk    # <head> (meta/OG/JSON-LD/fonts/favicon), body shell
    │   ├── layouts/page.njk    # subpage shell (class="no3d page", nav variant, footer)
    │   └── partials/{nav,footer}.njk
    ├── index.html              # front matter + existing body markup verbatim
    ├── about.html · contact.html · privacy.html · terms.html   # same treatment
    ├── 404.html                # passthrough, untouched
    ├── blog/                   # passthrough, untouched
    ├── assets/
    │   ├── css/styles.css      # source of truth; minified at build
    │   ├── js/main.js          # imports gsap/ScrollTrigger/lenis from npm
    │   ├── js/consent.js       # consent + gated AdSense loader
    │   ├── js/neural3d.js      # imports three from npm (import map removed)
    │   └── fonts/*.woff2       # self-hosted Inter, JetBrains Mono, Clash Display
    ├── og.png · robots.txt · ads.txt · CNAME · sitemap.xml     # passthrough
```

## Build pipeline

- **Eleventy 3** with Nunjucks layouts. The five pages keep their exact body markup;
  only the duplicated head/nav/footer move into layouts/partials. Per-page front matter:
  `title`, `description`, `canonicalPath`, `bodyClass`, `ogImage` (defaults from site data).
- **esbuild** bundles each entry (`main.js`, `consent.js`, `neural3d.js`) to minified
  IIFE/ESM with `three`, `gsap`, `lenis` resolved from npm. Import map deleted from HTML.
  Target: ES2018. Content-hash in output filenames (e.g. `main.4f3a2b.js`); the hash map
  is exposed to templates so layouts reference hashed names.
- **CSS**: single `styles.css` minified (esbuild CSS or lightningcss) with the same
  hashing. The FAQ/blog/404 rules within it are preserved byte-for-byte in source.
- **HTML**: minified via an Eleventy transform (html-minifier-terser, conservative flags).
- **Fonts**: woff2 files self-hosted with `@font-face` + `font-display: swap`; preload
  the 2–3 fonts used above the fold. Google Fonts / Fontshare `<link>`s and their four
  preconnects removed. License files for Clash Display (ITF FFL) kept alongside.
- **Dev:** `npm run dev` = Eleventy serve + esbuild watch. `npm run build` = production build to `_site/`.

## Engineering fixes folded into the migration

| # | Fix | Where |
|---|-----|-------|
| 1 | Consent actually gates AdSense: static `adsbygoogle` tag removed from all heads; `consent.js` injects it only when stored/just-clicked choice is `all`; "Essential only" never loads it. Honest note: this is consent-gating, not a full IAB TCF CMP — documented in README. | consent.js, layouts |
| 2 | Dead oscilloscope block (`#scope`, ~70 lines) and dead `.scope` CSS removed. | main.js §5, styles.css |
| 3 | Mobile menu: `visibility` toggled with transition (no invisible tab stops), Escape closes, focus moves to first item on open and returns to burger on close. | styles.css, main.js §3 |
| 4 | `og:image` absolute URL; OG + twitter tags on every page via layout defaults. | layouts |
| 5 | Marquee rAF gated by IntersectionObserver + visibilitychange; live-counter `setInterval` paused while tab hidden. | main.js §11–12 |
| 6 | Import-map/older-Safari silent failure eliminated by bundling three; `try/catch → no3d` retained. | neural3d.js, base.njk |
| 7 | Form: fetch POST to `FORM_ENDPOINT` with aria-busy, error message on failure; honest fallback copy when endpoint unset. | main.js §15 |
| 8 | `--faint` → `#78828E` (AA). | styles.css tokens |
| 9 | SRI concern dissolved (no more third-party runtime origins: fonts + JS self-hosted/bundled; only AdSense remains, consent-gated). | — |
| 10 | README rewritten: new toolchain, dev/build/deploy, Formspree hookup, consent architecture. | README.md |

Explicitly preserved behaviors: boot veil hard-cap, reduced-motion fallbacks, no-JS
noscript styles, GSAP-absent guards (now moot but harmless), adaptive WebGL downshift,
qa-shots harness (updated to point at the built site).

## Deploy

`.github/workflows/deploy.yml`: on push to `main` → `npm ci` → `npm run build` →
`actions/upload-pages-artifact` (_site) → `actions/deploy-pages`. Repo Pages source
switched from "deploy from branch" to "GitHub Actions" (via `gh api` if authenticated,
else documented manual step). `CNAME` file included in `_site` so the custom domain
survives artifact deploys. Nothing is pushed until the local build is verified.

## Verification (before push, again after deploy)

1. `npm run build` green; `_site` contains all 6 pages + blog + 404 + static files.
2. Serve `_site` locally; click through every page; verify nav/footer/legal links.
3. Consent flows: fresh profile → banner; "Essential only" → no adsbygoogle request;
   "Accept all" → script present; choice persists.
4. qa-shots screenshot sweep at 1440×900 and 390×844 against local build; compare to
   pre-migration screenshots of the live site (taken first, as baseline).
5. Reduced-motion and JS-disabled passes; keyboard-only pass (menu, skip link, form).
6. og/twitter tags present with absolute URLs on all pages (grep _site).
7. After deploy: live checks on stackwith.me (pages, consent, 404 route, sitemap/robots
   reachable, DNS/custom domain intact).

## Home-directory cleanup (last step, checklist-gated)

Only after live verification: confirm `~/Projects/axon-site` has origin + clean status +
all carried-over files, then delete from `/Users/joel`: `.git/` and the previously
tracked site files (index/about/contact/privacy/terms html, styles.css, main.js,
neural3d.js, consent.js, og.png, robots.txt, sitemap.xml, ads.txt, CNAME, README.md,
scripts/, 404.html, blog/, package.json/package-lock.json/node_modules if they belong to
the site experiment — verified before deletion). Nothing else in the home directory is touched.

## Risks & mitigations

- **Bundling changes runtime behavior** (globals → modules): mitigated by keeping each
  script's internal logic identical, only swapping the import mechanism, and by the
  screenshot/interaction verification pass.
- **Pages source switch briefly interrupts deploys**: the branch-based site keeps serving
  until the first Actions deploy succeeds; switch is flipped only after a green build.
- **Font self-hosting license**: Inter and JetBrains Mono are SIL OFL; Clash Display is
  ITF Free Font License — all permit self-hosting; license files ship in the repo.
- **Formspree not yet configured**: form degrades to honest copy, never fake promises.
