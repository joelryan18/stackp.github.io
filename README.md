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

## Payments (Razorpay + EmailJS)

Pricing tiers charge one-time via client-side Razorpay Checkout (no backend).
Config lives at the top of `src/assets/js/payments.js`:

- `RAZORPAY_KEY_ID` — Dashboard → Account & Settings → API Keys. Use
  `rzp_test_…` for QA, swap to `rzp_live_…` before deploying.
- `EMAILJS_DEFAULT` — from https://dashboard.emailjs.com: **Email Services →
  Add service** (connect your mailbox; note the Service ID), **Email
  Templates → Create template** (note the Template ID), **Account → API
  Keys** (Public Key).

EmailJS template (set "To Email" to `{{to_email}}`):

- Subject: `Your AXON Supporter Pass — {{pass_id}}`
- Body:

      Hi {{to_name}},

      Thank you for supporting AXON. Your {{plan_name}} Supporter Pass is
      confirmed ({{amount}}, one-time).

      Pass ID: {{pass_id}}
      Benefits: {{benefits}}

      AXON is a design showcase — this pass certifies your support; no
      software product is delivered.

      — stackwith.me

Razorpay dashboard prep (one-time):

1. Settings → Payment capture → enable automatic capture.
2. Settings → Notifications → enable customer email notifications (receipt backup).

QA: paste the test key, run through both tiers with Razorpay test cards
(https://razorpay.com/docs/payments/payments/test-card-details/), confirm the
EmailJS mail arrives, then swap in the live key, deploy, make one real ₹5
purchase and refund it from the dashboard. Fallback payment page:
https://razorpay.me/@stackwith/{amount-in-rupees}.

Made with intent.
