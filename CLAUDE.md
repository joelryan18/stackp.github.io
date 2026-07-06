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
- **Next feature (requested 2026-07-06, not started): make the pricing plans at the bottom
  of index.html real** — click a plan → show full benefits → collect buyer details → pay via
  **Razorpay**; the "free" tier should charge a minimum (~₹5 incl. tax) instead of being free.
  Needs design first: static site (no backend) → Razorpay hosted options (Payment
  Button/Links/Pages) vs. serverless order-creation; also honest-copy concerns (site is a
  fictional-product showcase).

## Standing decisions

- Design stays pixel-identical unless the user sanctions a change (sanctioned so far:
  `--faint` → `#78828E`, honest form copy).
- Out of scope, never touch: `src/blog/`, `src/404.html`, and the BLOG/FAQ/404 CSS sections
  in `styles.css` (carried over verbatim, copied not templated).
- AdSense client `ca-pub-7262404901375077`; consent localStorage key `axon-consent`;
  AdSense loads ONLY after "Accept all" (consent.js `loadAds()`).
- Chrome for QA/smoke: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- QA baselines: `/tmp/axon-qa-baseline-desktop` + `/tmp/axon-qa-baseline-mobile`
  (post-migration finals: `/tmp/axon-qa-final-desktop|mobile`). `/tmp` is volatile — regenerate
  with `npm run qa` if missing.
