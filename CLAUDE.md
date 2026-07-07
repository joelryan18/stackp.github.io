# AXON site — project context (read this, skip re-exploration)

Landing site for AXON ("signal instrument" design), live at https://stackwith.me
via GitHub Pages, repo `joelryan18/stackp.github.io`, branch `main`.

**Work in THIS directory (`~/Projects/axon-site`) only.**

## Current state (2026-07-07)

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
  prefill readonly, session persists, sign-out). **Pending (Task 4, user-gated):**
  Google/GitHub/Discord providers are still DISABLED in the Supabase dashboard
  (verified via `/auth/v1/settings`) — clicking them would land on a raw 400 JSON page,
  so the deploy **push is HELD** until the user enables the provider OAuth apps + URL
  Configuration (README → Sign-in). Recommend **Confirm email OFF**: it's currently ON
  and the default Supabase SMTP allows ~2 confirmation mails/hour ("email rate limit
  exceeded" otherwise). Then: push, live sign-in check, ₹5 purchase verification above.
  Never commit the `sb_secret_…` key (admin/service key, used only for transient local
  QA; user was advised to rotate it).

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
