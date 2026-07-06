# AXON site — project context (read this, skip re-exploration)

Landing site for AXON ("signal instrument" design), live at https://stackwith.me
via GitHub Pages, repo `joelryan18/stackp.github.io`, branch `main`.

**Work in THIS directory (`~/Projects/axon-site`) only.**

## Current state (2026-07-06)

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
  **Pending (Task 8, user-gated):** paste real `RAZORPAY_KEY_ID` and `EMAILJS_DEFAULT`
  values into `payments.js` (README → Payments has the steps), test-mode QA, go-live ₹5
  verification + refund. Until keys are set, Pay shows an honest "not live yet" error with
  a razorpay.me/@stackwith fallback link.

## Standing decisions

- Design stays pixel-identical unless the user sanctions a change (sanctioned so far:
  `--faint` → `#78828E`, honest form copy; 2026-07-06: tier cards show ₹5/₹6,999 one-time
  prices, plans heading "Start for ₹5…", checkout modal).
- Payments: checkout modal + `payments.js` + smoke section 6 ("pay:" checks) exist;
  `window.__axonEmailCfg` is a QA/smoke config-override hook — do not remove. Honest-copy
  line in the modal is verbatim-sanctioned; amounts are exact (500 / 699900 paise).
- Out of scope, never touch: `src/blog/`, `src/404.html`, and the BLOG/FAQ/404 CSS sections
  in `styles.css` (carried over verbatim, copied not templated).
- AdSense client `ca-pub-7262404901375077`; consent localStorage key `axon-consent`;
  AdSense loads ONLY after "Accept all" (consent.js `loadAds()`).
- Chrome for QA/smoke: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- QA baselines: `/tmp/axon-qa-baseline-desktop` + `/tmp/axon-qa-baseline-mobile`
  (post-migration finals: `/tmp/axon-qa-final-desktop|mobile`). `/tmp` is volatile — regenerate
  with `npm run qa` if missing.
