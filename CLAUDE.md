# AXON site — project context (read this, skip re-exploration)

Landing site for AXON ("signal instrument" design), live at https://stackwith.me
via GitHub Pages, repo `joelryan18/stackp.github.io`, branch `main`.

**Work in THIS directory (`~/Projects/axon-site`) only.**

## Current state (2026-07-08)

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
