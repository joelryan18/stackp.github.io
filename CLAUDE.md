# stackwith.me — project context (read this, skip re-exploration)

Multi-section site live at https://stackwith.me via GitHub Pages, repo
`joelryan18/stackp.github.io`, branch `main`.

**Work in THIS directory (`~/Projects/axon-site`) only.**

## Current state (2026-07-10)

- **About page "The Field" — Active Theory-style immersive rebuild SHIPPED
  2026-07-10** (user top-priority ask: activetheory.net design language;
  axon/homepage redesigns to be briefed later): `/about.html` is now the
  **stackwith.me studio page** (was AXON-only doc page). New
  `src/assets/js/about3d.js` ESM bundle (registered in build-assets esm build):
  full-viewport curl-noise particle field on fixed `canvas#aboutfx` (pointer
  repulsion, scroll lerps hues lime→magenta→cyan via the CH channel colors,
  bloom+ACES), Lenis smooth scroll, `#abIntro` boot loader (wordmark+counter
  ~1.65s, click-skip), IO reveals `[data-abreveal]`, chapter dot rail
  `#abRail` (6 chapters), `.ab-row[data-ch]` work-row hover tints the field.
  New `layouts/about.njk` (hub nav STACKWITH.ME brand + hubfoot footer),
  7-chapter copy in `src/about.html` (manifesto "We build software with a
  pulse." / who / work rows → axon+anime+blog / 3:14am origin / 4 principles
  / contact CTA — old AXON copy folded in, not deleted), `/* ABOUT */` CSS
  (`.ab-*`; `.ab-body::before{display:none}` since the loader replaces the
  boot veil). Fallbacks: <680px / reduced-motion / GL-fail → `body.about-no3d`
  static tri-hue scrim; no-JS unhides all. Smoke section 2c: 12 `about:`
  checks ALL PASS (manifesto check uses `innerText` — `<br>` breaks
  textContent). Verified live: /about.html 200, hashed about3d 200, hub/axon
  untouched. Plan: `docs/superpowers/plans/2026-07-10-about-activetheory-redesign.md`.
  GOTCHA: uncommitted homepage-gem WIP (index.html/hub3d.js/hub.njk/smoke
  hub-check edits + `/* HUB v4 Studio */` CSS rewrite) pre-existed in the
  worktree; it was stashed for the ship and restored after — still uncommitted.

- **Homepage v3 "The Spectrum" — WebGL 3D hero SHIPPED 2026-07-10**
  (user-requested "award-winning / 3D"): new `src/assets/js/hub3d.js` ESM bundle
  (three.js, added to build-assets esm build alongside neural3d) renders three
  braided signal ribbons — channel colors **AXON lime #B8FF3C / Stackime magenta
  #FF4FA3 / Log cyan #4FC4FF** (`--ch0/1/2` tokens scoped to `.hub-body`) — plus
  particle dust through UnrealBloom+ACES on fixed `canvas#hubfx` (NOT `.nerve`;
  smoke's "no nerve canvas" still passes). Hover on any `[data-ch]` card/tuner-chip
  excites that ribbon (uniform lerp). Same bundle does DOM choreography: `fx-dom`/
  `hub-in` body classes gate hero line-rise + `[data-hubreveal]` IO reveals
  (no-JS = everything visible), pointer card tilt. Fallback `<680px`/reduced-motion/
  GL-fail → `body.hub-no3d` static tri-hue scrim. Hero: "One stack. Many signals."
  w/ animated gradient word + CH·01/02/03 tuner chips (replaced stat strip); cards
  per-channel accents (color-mix); ALL AdSense content sections kept verbatim.
  Smoke: 13 hub checks incl. "spectrum 3d booted" (WebGL works in smoke Chrome)
  ALL PASS. GOTCHA: smoke's static server binds **port 8123** — kill any QA
  http.server on 8123 first. Verified live: hub3d asset 200, axon.html untouched.

- **Homepage redesigned as full modern landing page SHIPPED 2026-07-09**
  (user-requested): single-screen hub → multi-section professional landing with
  hero (eyebrow blip, display h1, CTA buttons, stat strip), 3 upgraded section
  cards (tag chips, gradient borders, larger marks), "What is stackwith.me?"
  about section (400+ char substantive copy + 3 value-prop tiles), latest blog
  posts section (3 hardcoded post cards w/ dates + summaries), closing CTA band,
  full sitemap footer (hubfoot__ classes: brand + 3 cols for Sections/Company/Legal).
  hub.njk nav gained Blog link; WebSite JSON-LD added. CSS: full `/* HUB */`
  rewrite (radial bg glow, new hero/cards/tiles/footer grid, mobile responsive).
  Smoke: 9 hub checks (5 existing + hero CTAs + about copy ≥400 + 3 postcards +
  footer sitemap links) ALL PASS. Design tokens unchanged; AXON/anime/blog untouched.
  QA'd headless 1440 + 390 screenshots; live at https://stackwith.me/.
  **AdSense readiness:** substantial original content, complete nav/footer with
  Privacy/Terms/About/Contact, blog posts, no thin "under construction" signals.
  Plan: `docs/superpowers/plans/2026-07-09-homepage-redesign-adsense.md`.

- **Homepage became a portal hub; AXON moved to subsection SHIPPED 2026-07-09**
  (earlier same day, user-requested): `/` = single-screen hub (`layouts/hub.njk` +
  `src/index.html` + `/* HUB */` CSS) with cards → `/axon.html`, `/anime.html`,
  `/blog/`. The AXON landing moved **verbatim** to `src/axon.html`
  (`permalink: axon.html`; home.njk nav gained a `Home → /` link). Nav label
  "Anime" → **"Stackime"** site-wide; page/checkout navs gained an Axon link.
  All `/#plans`+`/#engage` anchors now → `/axon.html#…` (incl. checkout.js
  invalid-plan redirect + `#payDone`). Sitemap has /axon.html (0.9). Smoke
  reworked: section 2 = hub checks (`hub:`), 2b = ex-index runtime (`axon:`),
  sections 4–6 visit /axon.html, consent tests stay on `/`; label assertions
  updated ("Home,Axon,Blog,Stackime" on anime page) — ALL PASS. Verified live:
  hub at `/`, 200 on /axon.html, Stackime label on anime nav. Plan:
  `docs/superpowers/plans/2026-07-09-hub-homepage-axon-subsection.md`.
  NOTE for older notes below: anything that says "index" / homepage about the
  AXON landing now means **/axon.html**.

- **Anime page rebranded "Stackime" + intro splash SHIPPED 2026-07-08**
  (user-requested): /anime.html brand is now **Stackime** — user asked for a
  small unique fusion of "stackwithme" + "animelist"; "Stackime" had zero exact
  web hits ("AniStack" was taken). New title/eyebrow/h1/lede in `src/anime.html`;
  nav label stays "Anime" (smoke asserts it site-wide). Opening plays an
  enma.lol-style splash: fullscreen black `#aniIntro` overlay (layouts/anime.njk),
  "STACKIME" SVG text stroke-draws in `--signal` then glow-pulses then overlay
  fades (`.ani-intro*` rules at end of `/* ANIME */` CSS; keyframes aniIntroDraw/
  Glow/Tag), dismissed by anime.js at 3.4s (click skips; prefers-reduced-motion
  hides + removes). Smoke: "anime: stackime intro painted" + "anime: intro
  auto-dismisses". Headless screenshot QA confirmed draw/glow/reveal; the live
  Supabase `anime_catalog` call returned 200 empty ("No titles yet") — the anime
  SQL migration appears to have been applied.
  **Round 2 (same day, user-requested):** (a) anime banner art now reveals
  INSIDE the letters (SVG `<mask>`; anime.js shuffles hardcoded AniList CDN
  banners — `INTRO_BANNERS`); (b) AniList discover rails on the catalog view
  (`#aniDiscover`): Trending now / New & airing / Coming soon via one aliased
  GraphQL query (`DISCOVER_QUERY`, sessionStorage cache, silent-skip on failure,
  rails hidden while the filter has text). Rail cards use `.ani__railcard` (NOT
  `.ani__card` — smoke counts depend on that). Click: in catalog → `#a/<id>`;
  signed-in → add-modal entry stage prefilled (`pick(m)`); signed-out → sign-in,
  then `pendingPick` restores the picked title.
  **Round 3 (same day, user compared to enma and wanted video-feel + pro
  discover):** enma actually clips a real `<video src="/intro.mp4">` into its
  letters via foreignObject+clipPath (verified in their bundle). Asset-free
  equivalent shipped: THREE `<image>` frames Ken-Burns-crossfade inside the mask
  (`.ani-intro__art--1/2/3`, shuffled per load), a light sheen sweeps the
  letters after the outline draw (~2.4s), overlay scale-out on exit; dismiss at
  3.8s (remove 4.4s — smoke sleeps 1700ms before the dismissal check).
  Discover got: rotating SPOTLIGHT hero (top-5 trending w/ bannerImage, 7s
  interval + dots + hover-pause, "+ Track this" CTA → same `discoverPick()`
  flow), rail scroll arrows (`.ani__railbtn`, hidden on hover:none), hover
  "+ Track" overlay + ★ score badges on rail cards; fragment now fetches
  bannerImage/averageScore/description; cache key bumped to
  `stackime-discover-v2`. GOTCHA: smoke section 1 visits /anime.html
  un-stubbed → real AniList data lands in the sessionStorage cache → section 7
  stub preload must `sessionStorage.removeItem("stackime-discover-v2")` (it
  does; keep key in sync).
  **Round 4 (same day):** intro now clips a REAL `<video>` into the letters
  (enma's exact foreignObject + clipPath structure): self-generated royalty-free
  clip `src/assets/video/intro-signal.mp4` (455 KB, 1280×288, 3.4s — anime
  speed-lines + AXON heartbeat pulse in --signal lime), regenerable via
  `scripts/gen-intro-video.py` (venv: pillow + imageio + imageio-ffmpeg;
  deterministic seed). Passthrough `src/assets/video` added to
  eleventy.config.js; smoke server MIME map has .mp4. Video `ended` → dismiss
  (enma pattern) with the 3.8s timer as fallback; autoplay-refusal is caught and
  the 3 Ken-Burns banner frames underneath carry the splash (they stay in the
  markup as the no-video fallback).

- **Anime list community tracker SHIPPED 2026-07-08** (Tasks 1–9, 11 of
  `docs/superpowers/plans/2026-07-07-anime-list-community-tracker.md`): public
  `/anime.html` ("AniList from AXON") — community catalog + per-user lists +
  AniList GraphQL search, backed by Supabase tables `anime` / `anime_entries` /
  `profiles` + `anime_catalog` view (public reads, owner-only column-scoped
  writes). New `src/assets/js/anime.js` bundle (own Supabase client, same
  `__axonAuthCfg` hook), `layouts/anime.njk`, `/* ANIME */` CSS section, smoke
  section 7 (`anime:` checks, network fully stubbed). "Anime" nav link added to
  home (desktop+burger), page, checkout navs — **user-sanctioned**.
  **USER-GATED, OPEN: paste `supabase/migrations/20260708000001_anime.sql` into
  the Supabase SQL editor** (page shows "Catalog is initializing" until then),
  then live-check: Google sign-in on /anime.html → add a title → visible
  signed-out. NOTE: two migration files share the date — `…000002_executor_schedules.sql`
  (on-hold executor work, untracked) vs `…20260708000001_anime.sql` (shipped).

- Toolchain migration plan **fully executed (Tasks 1–15)** and live:
  `docs/superpowers/plans/2026-07-05-axon-site-professional-toolchain.md` (all boxes checked,
  deviations noted inline). Eleventy 3 + esbuild + self-hosted fonts + consent-gated AdSense +
  CDP smoke harness (`npm run build && npm run smoke` → must be ALL PASS).
- Deploys: push to `main` → `.github/workflows/deploy.yml` → Pages artifact
  (Pages `build_type=workflow` since 2026-07-06). Old home-directory clone of this repo
  was deleted per plan Task 15 (`~/package.json` + `node_modules` with framer-motion were
  unrelated and left in place).
- `gh` CLI is NOT installed. For GitHub API calls, pull the token from the keychain:
  `git credential fill` → `curl -H "Authorization: token …"` (worked for the Pages API).
- Manual step still open: create a Formspree form and paste its endpoint into
  `FORM_ENDPOINT` in `src/assets/js/main.js`.
- **Pricing plans feature implemented** (Tasks 1–7 of
  `docs/superpowers/plans/2026-07-06-razorpay-pricing-plans.md`; spec in
  `docs/superpowers/specs/`). Client-side Razorpay Checkout + EmailJS benefits mail +
  canvas Supporter Pass, all in `src/assets/js/payments.js` + modal in `index.html`.
  **Live config set 2026-07-07** (user supplied `rzp_live_…` + EmailJS IDs directly;
  test-mode QA skipped — impossible against a live key). Local live sanity check passed:
  production sheet opens order-less with correct amount/theme/prefill.
  **Pending (Task 8 Step 4, user-gated):** one real ₹5 Hobby purchase on stackwith.me,
  confirm captured + notes in dashboard (notes now include `plan, buyer_name, auth_uid,
  auth_provider`), EmailJS mail arrives, then refund; then Step 5 close-out.
- **Purchases moved to a sign-in-gated `/checkout.html`** (2026-07-07, Tasks 1–3 of
  `docs/superpowers/plans/2026-07-07-signin-checkout-page.md`; spec in
  `docs/superpowers/specs/`). Supabase Auth (Google/GitHub/Discord/email+password) in
  `src/assets/js/checkout.js`; `payments.js` refactored to `PLANS` + `initPayFlow`;
  the index checkout modal is **gone**. **Supabase config is set in `checkout.js`**
  (2026-07-07: project URL + `sb_publishable_…` key; email+password sign-in QA'd E2E
  headlessly against the real project — wrong-password error, sign-in → pay stage,
  prefill readonly, session persists, sign-out). **Pushed live 2026-07-07:** Google
  provider ENABLED in Supabase (verified: `/auth/v1/authorize?provider=google` 302s to
  a real consent screen) so the hold was released; GitHub/Discord are still DISABLED
  in the dashboard, so their buttons ship `disabled` with a `payauth__soon` "soon"
  badge (checkout.html + styles.css) — when the user enables those providers, remove
  the `disabled` attrs + badges and repush. **Still recommend Confirm email OFF**:
  it's ON and the default Supabase SMTP allows ~2 confirmation mails/hour ("email rate
  limit exceeded" otherwise). Remaining user-gated steps: live Google sign-in spot
  check, then the ₹5 purchase verification above. Never commit the `sb_secret_…` key
  (admin/service key, used only for transient local QA; user was advised to rotate it).
- **Next feature: Hobby benefits fulfillment** (planned 2026-07-07, not started):
  buyers must actually receive every Hobby-tier benefit after activation. Plan with
  benefit→deliverable map and 14 tracked tasks:
  `docs/superpowers/plans/2026-07-07-hobby-benefits-fulfillment.md`. Key calls: agents
  are signal watchers (no LLM), Supabase Edge Functions for trusted writes (Razorpay
  webhook activation, run executor), new `/console.html` + `/registry.html`. The
  verbatim honest-copy line ("no software product is provided") stays until Task 12's
  replacement is user-sanctioned; Studio parity is an open user decision (Task 14).

## Standing decisions

- Design stays pixel-identical unless the user sanctions a change (sanctioned so far:
  `--faint` → `#78828E`, honest form copy; 2026-07-06: tier cards show ₹5/₹6,999 one-time
  prices, plans heading "Start for ₹5…", checkout modal).
- Payments: checkout page (`/checkout.html?plan=…`) + `payments.js` + smoke section 6
  ("pay:" checks) + section 6b ("gate:" checks) exist; `window.__axonEmailCfg` and
  `window.__axonAuthCfg` (accepts `{ session }` and/or `{ url, key }` overrides) are
  QA/smoke config-override hooks — do not remove. Honest-copy
  line on the page is verbatim-sanctioned; amounts are exact (500 / 699900 paise).
- Tier CTAs are links to `/checkout.html?plan=hobby|studio` (same classes/`data-probe`);
  the checkout page is `noindex`; sign-in required before the pay stage.
- Out of scope, never touch: `src/blog/`, `src/404.html`, and the BLOG/FAQ/404 CSS sections
  in `styles.css` (carried over verbatim, copied not templated).
- AdSense client `ca-pub-7262404901375077`; consent localStorage key `axon-consent`;
  AdSense loads ONLY after "Accept all" (consent.js `loadAds()`).
- Chrome for QA/smoke: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- QA baselines: `/tmp/axon-qa-baseline-desktop` + `/tmp/axon-qa-baseline-mobile`
  (post-migration finals: `/tmp/axon-qa-final-desktop|mobile`). `/tmp` is volatile — regenerate
  with `npm run qa` if missing.
