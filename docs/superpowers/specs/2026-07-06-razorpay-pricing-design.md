# Razorpay pricing plans — design spec

**Date:** 2026-07-06
**Status:** Approved pending user spec review
**Goal:** Make the pricing plans in `src/index.html` real: click a plan → see full
benefits → enter buyer details → pay via Razorpay. The former free tier charges a
minimum amount instead of being free.

## Decisions (made with user)

| Decision | Choice |
|---|---|
| Charging model | One-time payments (no subscriptions) |
| Amounts | Hobby **₹5**, Studio **₹6,999**, Enterprise stays contact-only |
| Integration | **Client-side Checkout.js**, 100% static, no backend/serverless |
| Card copy | Cards display the real ₹ one-time prices (sanctioned design change) |
| Tone | All new copy professional in register — no gimmicks |
| Razorpay account | Already activated (live mode available) |
| Post-payment delivery | Branded benefits email via EmailJS (client-side, free tier) + personalized downloadable Supporter Pass on the success screen; Razorpay receipt email enabled as backup |

## 1. Card copy changes (sanctioned)

- **Section heading:** "Start free. Scale when your agents earn it." →
  **"Start for ₹5. Scale when your agents earn it."**
- **Hobby:** price `$0/mo` → **`₹5` + small `one-time` suffix** (same
  `tier__price`/`span` markup pattern); CTA "Start free" → **"Get access"**.
- **Studio:** price `$79/mo` → **`₹6,999` + `one-time`**; CTA stays "Get access".
- **Enterprise:** unchanged (Custom / "Talk to us" → `#engage`).
- Payable CTAs become `<button type="button" class="btn …" data-plan="hobby|studio">`
  keeping `data-probe` / `data-magnet` behaviors; Enterprise keeps its anchor.

## 2. Purchase modal (one reusable component)

AXON design language throughout — eyebrow tag, tier name, existing tokens/typography.
No Razorpay branding until Razorpay's own popup opens.

Contents, top to bottom:

1. **Header:** eyebrow (e.g. `[ SIG.07 · CHECKOUT ]`), tier name, price
   (`₹5 · one-time` / `₹6,999 · one-time`).
2. **Full benefits:** the card's list plus 3–4 expanded lines per tier. Copy drafted
   during implementation in a professional register consistent with the site's
   fictional AXON voice (e.g. Hobby: "Signal replay — 7-day retention"; Studio:
   "Priority trace lanes", "Workspace-level guardrail policies"). User reviews final
   copy at QA.
3. **Buyer details form:** name, email, phone — all required, validated inline
   (same validation/error styling approach as the engage form). Values prefill
   Razorpay checkout; name + plan also passed in `notes`.
4. **Honest-copy line (professional wording):**
   > AXON is a design showcase. This is a genuine ₹{amount} payment for an AXON
   > Supporter Pass, delivered by email — no software product is provided.
5. **Pay button:** `Pay ₹5` / `Pay ₹6,999` (`btn btn--signal`).

Behavior:

- Opens on payable-card CTA click; closes via ✕, Esc, and backdrop click.
- Focus trap while open; focus returns to the triggering button on close
  (mirror the burger-menu accessibility pattern in `main.js`). `role="dialog"`,
  `aria-modal="true"`, labelled by the tier heading.
- Page scroll locked while open.

## 3. Payment flow

1. First **Pay** click lazy-injects `https://checkout.razorpay.com/v1/checkout.js`
   (never loaded at page load — performance, and no third-party call before explicit
   user intent; unrelated to the AdSense consent gate but same spirit).
2. Open Razorpay Standard Checkout with:
   - `key`: `RAZORPAY_KEY_ID` constant (publishable key — safe to embed),
   - `amount`: paise (`500` / `699900`), `currency: "INR"`,
   - `name: "AXON"`, `description: "{Tier} — supporter pass (one-time)"`,
   - `prefill: { name, email, contact }` from the modal form,
   - `notes: { plan, buyer_name }` (surfaces in the Razorpay dashboard per payment),
   - `theme.color` matched to the site accent,
   - `modal.ondismiss` → return to our modal silently.
3. **Success** (`handler`): modal flips to a success state (see §3a) and the
   benefits email is dispatched.
4. No order_id / no signature verification: accepted trade-off of the static
   client-side approach (amount is technically editable via dev tools; nothing is
   fulfilled, so integrity risk is cosmetic). Payments must be **auto-captured** —
   user enables this in Razorpay Dashboard → Settings → Payment capture.

**Buyer data handling:** details go to Razorpay (prefill + notes) and, on success
only, to EmailJS for the benefits email. The site stores nothing; no Formspree
involvement.

## 3a. Post-payment delivery (email + Supporter Pass)

**Success screen — Supporter Pass.** The modal's success state renders a
personalized **AXON Supporter Pass** in the site's design language: buyer name,
tier, pass ID (`razorpay_payment_id`), issue date, and the tier's benefits list.
A **Download pass** button renders it to PNG client-side (canvas, self-hosted
fonts — no new dependencies) so the buyer keeps a real artifact.

**Benefits email — EmailJS (client-side).** On the success handler, the site
calls the EmailJS REST API directly via `fetch`
(`https://api.emailjs.com/api/v1.0/email/send`) — no SDK dependency. Template
params: buyer name, email (recipient), tier name, amount, pass ID, benefits list.
The EmailJS template is authored once (AXON-branded, professional register):
subject "Your AXON Supporter Pass", body with pass details + full benefits.

- The EmailJS public key, service ID, and template ID are embedded constants
  (public by design; the fixed template means the key can only send this one
  email format; free tier is rate-limited to ~200 emails/month — acceptable).
- Email dispatch is **fire-and-forget**: failure never breaks the success state.
  On failure the pass screen shows a quiet note ("email delivery delayed — your
  pass ID above is your proof of purchase") — the Razorpay receipt (below) is
  the fallback channel.

**Razorpay receipt (backup).** User enables customer email notifications in the
Razorpay dashboard so every buyer also gets Razorpay's standard payment receipt,
independent of the browser session.

## 4. Code structure

| File | Change |
|---|---|
| `src/assets/js/payments.js` | **New module**, `import`ed by `main.js` (esbuild `bundle: true` folds it into the existing hashed `assets.main` bundle — zero build-config changes). Holds `RAZORPAY_KEY_ID` + EmailJS constants, `PLANS` config (amount, labels, benefits), modal controller, checkout launcher, success/failure handlers, Supporter Pass canvas renderer, EmailJS dispatch. |
| `src/assets/js/main.js` | One-line `import` + init call. |
| `src/index.html` | Tier card edits (§1); modal markup appended at end of page content. |
| `src/assets/css/styles.css` | New clearly-delimited "PAYMENTS MODAL" section using existing custom-property tokens. **BLOG/FAQ/404 sections untouched** (standing rule). |

Out of scope, unchanged: `src/blog/`, `src/404.html`, consent.js/AdSense flow,
engage form, deploy workflow.

## 5. Error handling

| Failure | Behavior |
|---|---|
| checkout.js fails to load (offline, blocked) | Inline error line in the modal + the Pay button re-enabled for retry |
| `payment.failed` event | Human-readable reason in the modal; retry allowed |
| Popup dismissed by user | Return to modal silently, form values intact |
| EmailJS send fails (network, quota) | Success state unaffected; quiet "email delivery delayed" note; Razorpay receipt is the fallback channel |
| Pass PNG render fails | Pass remains visible on-screen; download button hidden |
| Account requires server-side `order_id` (discovered in testing) | Documented fallback: free Cloudflare Worker creating Orders + verifying signatures. **Not built now**; revisit only if test/live checkout rejects order-less payments. |

## 6. Testing & rollout

1. `npm run build && npm run smoke` stays **ALL PASS**; extend the CDP smoke harness:
   modal opens on plan click, required-field validation blocks empty submit,
   checkout.js is requested on Pay (network-stubbed in smoke — no real Razorpay
   call), success state + Supporter Pass render when the handler is invoked
   synthetically, EmailJS request is issued with correct template params
   (network-stubbed — no real email).
2. Manual QA in **test mode** (user's test `key_id` + Razorpay test cards) covering
   both tiers end-to-end, including a real EmailJS send to the user's own address
   to verify the branded email.
3. Swap in live `key_id`; one real ₹5 self-purchase as final verification, refunded
   from the dashboard.
4. Regenerate QA baselines (`npm run qa`) — tier-card pixel changes are sanctioned.

**User-provided inputs needed at implementation time:**
- Test-mode `key_id`, then live `key_id`.
- Auto payment capture enabled in the Razorpay dashboard.
- Customer email notifications enabled in the Razorpay dashboard (receipt backup).
- Free EmailJS account: connect an email service, create the Supporter Pass
  template (content supplied by implementation plan), then provide the
  **service ID, template ID, and public key**. Exact click-by-click steps will be
  in the implementation plan.
