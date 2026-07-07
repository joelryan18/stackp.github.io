# Sign-in-gated checkout page — design spec

**Date:** 2026-07-07
**Status:** Approved pending user spec review
**Goal:** Require a real sign-in before purchase. Replace the checkout modal with a
dedicated `/checkout.html` page that offers Google, GitHub, Discord, and
email + password sign-in (Supabase Auth), then the existing Razorpay checkout.
Still 100% static — no backend of ours (one may come later; this must carry over).

## Decisions (made with user)

| Decision | Choice |
|---|---|
| Auth mechanism | **Supabase Auth** (hosted; the only service natively covering the chosen providers with no backend of ours; sessions/JWTs carry over to a future backend) |
| Sign-in options | Google, GitHub, Discord, email + password |
| Gate | Hard gate — plan details/pay stage render only when signed in |
| Flow | Tier click → **navigate to `/checkout.html?plan=hobby\|studio`** (no popup/modal); one page hosts sign-in → checkout → success |
| Modal fate | Removed entirely (markup + init call); its CSS is repurposed for the page card |
| Identity binding | Buyer **email prefilled from the account and read-only**; name prefilled but editable; phone manual; `auth_uid` + `auth_provider` added to Razorpay `notes` |
| Payment mechanics | Unchanged from the 2026-07-06 payments spec (client-side Checkout.js, amounts exact, honest-copy line verbatim, EmailJS + Supporter Pass) |

## 1. Landing page changes (sanctioned)

- Hobby/Studio CTAs: `<button type="button" … data-plan="…">` →
  **`<a class="btn btn--ghost|btn--signal" href="/checkout.html?plan=hobby|studio" data-probe…>`**.
  Same classes and `data-probe` value (probe/magnet behaviors bind by attribute and
  work on links) — pixel-identical rendering. Enterprise card untouched.
- Checkout modal markup removed from `src/index.html`; `main.js` drops the
  `initPayments` import (landing bundle gets lighter). No other landing changes.

## 2. Checkout page (`/checkout.html`)

Eleventy page on the existing nav + footer shell, `noindex` (transactional).
Reads `?plan=hobby|studio`; any other value → `location.replace("/#plans")`.
Single centered card (~560 px) carrying over the modal's sanctioned design:
eyebrow `[ SIG.07 · CHECKOUT ]`, tier name + tag, price, benefits list,
honest-copy line **verbatim** (amount substituted), amounts exact
(**500 / 699900 paise**). Three stages, exactly one visible:

### 2a. Auth stage (signed out)

- Heading "Sign in to continue" + one professional line explaining why
  (the Supporter Pass is issued against your account email).
- Sign-in options, AXON design language (no provider brand images from external
  origins — small self-hosted inline SVG marks or mono text tags):
  - **Continue with Google / GitHub / Discord** →
    `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: location.href } })`
    — full-page redirect; the session returns on the same checkout URL and the SDK
    persists it (localStorage).
  - Divider, then **email + password** mini-form with a Sign in ⇄ Create account
    toggle (`signInWithPassword` / `signUp`).
- Dashboard recommendation: **"Confirm email" OFF** for the Email provider
  (checkout friction). If the user leaves it on, the UI shows
  "check your inbox to confirm, then reload this page" after `signUp`.

### 2b. Pay stage (signed in)

- Status line: `Signed in as {email} · Sign out` (`signOut()` → auth stage).
- Buyer form: **name** prefilled from `user_metadata.full_name || user_metadata.name`
  (else the email local-part), editable; **email** prefilled from the session,
  `readonly`; **phone** manual (same validation pattern as today).
- Pay button → the existing flow unchanged: lazy-inject `checkout.js`, options
  identical to the payments spec, plus `notes: { plan, buyer_name, auth_uid,
  auth_provider }`.
- Failure handling unchanged: readable `error.description`, retry, razorpay.me
  fallback link from the second failure per page visit.

### 2c. Success stage

Identical to the modal's success stage (Supporter Pass canvas + download,
EmailJS dispatch, "email delivery delayed" fallback note). "Done" → `/#plans`.

## 3. Auth/session mechanics

- `@supabase/supabase-js` v2 from npm, bundled by esbuild into a **new IIFE entry
  `checkout.js`** (manifest key `checkout`), loaded **only** by `checkout.html` —
  the landing page keeps its zero-third-party-origins property; Supabase network
  traffic happens only on the checkout page.
- Constants at the top of the module, same pattern as `RAZORPAY_KEY_ID`
  (publishable by design): `SUPABASE_URL`, `SUPABASE_ANON_KEY`. While empty, the
  auth stage still renders all sign-in options (so layout/smoke are config-independent),
  and activating any of them surfaces an honest "Sign-in isn't configured yet" error +
  the `razorpay.me/@stackwith/{rupees}` fallback link — the purchase path is never
  silently dead.
- Stage switching driven by `getSession()` + `onAuthStateChange` (covers OAuth
  return, sign-out, token expiry).
- **QA/smoke hook (standing decision, do not remove):**
  `window.__axonAuthCfg = { session: { user: { id, email, user_metadata, app_metadata } } }`
  → the module uses the injected session and skips Supabase entirely.
  Same status as `window.__axonEmailCfg`.

## 4. Code structure

| File | Change |
|---|---|
| `src/checkout.html` | **New page**: shell + card markup, three stages |
| `src/assets/js/checkout.js` | **New module**: Supabase init, auth gate, stage controller, prefill; consumes the shared payment logic |
| `src/assets/js/payments.js` | Refactor: delete modal open/close/focus-trap; export `PLANS`, checkout launcher, pass renderer/download, EmailJS dispatch, error/failure handlers for `checkout.js` to consume |
| `src/assets/js/main.js` | Remove the payments import + init |
| `src/index.html` | §1 CTA swap; modal markup removed |
| `src/assets/css/styles.css` | CHECKOUT MODAL section becomes the checkout-page card section + auth-option styles (existing tokens only; **BLOG/FAQ/404 sections untouched** — standing rule) |
| `scripts/build-assets.mjs` | `checkout.js` added to the IIFE entry list + manifest |
| `scripts/smoke.mjs` | Section 6 rewritten against `/checkout.html` (§6) |

Out of scope, unchanged: `src/blog/`, `src/404.html`, consent/AdSense flow,
engage form, deploy workflow, payment amounts/copy.

## 5. Error handling

| Failure | Behavior |
|---|---|
| Supabase constants empty | Honest "sign-in isn't configured yet" + hosted fallback payment link |
| OAuth redirect returns an error (`error` params) / user cancels at provider | Readable inline error; all sign-in options remain for retry |
| Invalid credentials on sign-in | Inline error + hint to toggle to Create account |
| `signUp` with an existing email | Inline error suggesting Sign in instead |
| Supabase SDK/network failure | Inline error + retry; fallback link after repeat failure |
| Session expires / signed out elsewhere | `onAuthStateChange` flips back to the auth stage |
| Invalid `?plan=` | `location.replace("/#plans")` |
| Payment / EmailJS / pass-render failures | Unchanged from the payments spec |

## 6. Testing & rollout

1. `npm run build && npm run smoke` stays **ALL PASS**. Section 6 rewritten:
   - Landing: payable CTAs are links with the right hrefs; `#paywrap` gone from
     the built page; Enterprise still `#engage`.
   - Checkout signed-out: auth stage visible with all four sign-in options;
     pay stage hidden.
   - Checkout signed-in (via `__axonAuthCfg` hook): pay stage shown, email
     prefilled + readonly, name prefilled; Razorpay stub captures options —
     amount, currency, prefill, `notes.auth_uid`/`auth_provider`; synthetic
     success → pass renders, EmailJS request captured; failure path → readable
     reason + fallback link on second failure.
   - Invalid plan param redirects to `/#plans`.
2. `npm run qa` + checkout-page shots (auth and pay stages) at desktop + mobile;
   baselines regenerated and eyeballed.
3. Rollout — user-provided inputs (README gets a "Sign-in (Supabase)" guide):
   - Free Supabase project → Settings → API: **URL + anon key** → paste into
     `checkout.js` constants.
   - Auth → Providers: enable **Email** (recommend Confirm email OFF); enable
     **Google / GitHub / Discord**, each via a free OAuth app registered at the
     provider with callback `https://<project-ref>.supabase.co/auth/v1/callback`,
     id + secret pasted into the Supabase dashboard.
   - Auth → URL Configuration: Site URL `https://stackwith.me`; additional
     redirect URLs `https://stackwith.me/checkout.html` and
     `http://localhost:8080/checkout.html` (local QA).
4. The still-pending **₹5 live verification** (payments plan Task 8 Step 4) is
   performed on the new page after this ships — additionally confirming
   `auth_uid`/`auth_provider` appear in the payment's notes in the Razorpay
   dashboard, then refunding.
