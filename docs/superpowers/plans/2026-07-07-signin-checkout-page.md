# Sign-in-gated Checkout Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the checkout modal with a dedicated `/checkout.html` page that requires real sign-in (Supabase Auth: Google, GitHub, Discord, email + password) before the existing Razorpay purchase flow.

**Architecture:** New Eleventy page + new esbuild IIFE bundle `checkout.js` (Supabase client + auth gate + page glue) that consumes a refactored `payments.js` (plan data + pay flow, modal chrome deleted). Landing tier CTAs become plain links; the modal is removed. Spec: `docs/superpowers/specs/2026-07-07-signin-checkout-page-design.md`.

**Tech Stack:** Eleventy 3 + esbuild (existing), `@supabase/supabase-js` v2 (only new dependency), Razorpay Standard Checkout + EmailJS (existing, unchanged), CDP smoke harness (`scripts/smoke.mjs`).

## Execution Tracker (tick as tasks land — designed for one-or-more tasks per session)

- [x] **Task 1** — Checkout page with sign-in gate · commit `feat: checkout page with Supabase sign-in gate (Google/GitHub/Discord/email)`
- [ ] **Task 2** — Purchase cutover, modal removed · commit `feat: purchases move to the sign-in-gated checkout page; modal removed`
- [ ] **Task 3** — Docs + QA baselines · commit `docs: sign-in setup guide (Supabase) + project state`
- [ ] **Task 4** — Rollout (user-gated: needs Supabase project + provider apps) · commit `feat: live Supabase sign-in configuration`

**Resuming in a fresh session:** say "proceed with tasks" (superpowers:executing-plans
on this file). Then:
1. `git log --oneline -6` — the commit messages above show which tasks already
   landed; cross-check this tracker and the per-step checkboxes.
2. `npm run build && npm run smoke` — must be **ALL PASS** before starting anything.
3. Execute the first unchecked task's steps in order, ticking checkboxes as you go.
   Every task ends ALL PASS + its own commit, so the tree is releasable at every
   task boundary — a session may stop cleanly after any task.
4. Tasks must land **in order** (each consumes the previous task's interfaces).
   Task 4 cannot start without user-supplied Supabase values — ask and stop if
   they aren't provided.

## Global Constraints

- Design pixel-identical **except** sanctioned changes: tier CTAs become links (same classes/`data-probe`), modal removed, new checkout page.
- Never touch: `src/blog/`, `src/404.html`, BLOG/FAQ/404 sections of `styles.css`.
- Amounts exact: Hobby **500 paise (₹5)**, Studio **699900 paise (₹6,999)**; honest-copy line **verbatim** (amount substituted).
- Payment mechanics unchanged: same Razorpay options + EmailJS + Supporter Pass; `notes` additionally gains `auth_uid`, `auth_provider`.
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants ship **empty** until the user supplies them (Task 4). While empty: all sign-in options render; activating any shows "Sign-in isn't configured yet — payments open shortly." + fallback link `https://razorpay.me/@stackwith/{rupees}`.
- Standing hooks — do not remove: `window.__axonEmailCfg`, and new `window.__axonAuthCfg = { session: { user: … } }` (read once at `checkout.js` init).
- `npm run build && npm run smoke` must end **ALL PASS** after every task. Smoke Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- Keep existing constants in `payments.js` (live Razorpay key + EmailJS IDs) exactly as they are.

---

### Task 1: Checkout page with sign-in gate (Supabase wired, payments not yet)

**Files:**
- Modify: `package.json` (+ `@supabase/supabase-js`)
- Modify: `scripts/build-assets.mjs:43-45` (new entry)
- Modify: `src/_includes/layouts/base.njk:16` (noindex support)
- Create: `src/_includes/layouts/checkout.njk`
- Create: `src/checkout.html`
- Create: `src/assets/js/checkout.js`
- Modify: `src/assets/js/payments.js:10` (`export` PLANS)
- Modify: `src/assets/css/styles.css` (additions after the CHECKOUT MODAL section, before SUBPAGES)
- Test: `scripts/smoke.mjs` (section 1 page list + new section 6b)

**Interfaces:**
- Consumes: `PLANS` from `payments.js` (adds the `export` keyword only; modal keeps working).
- Produces: page DOM — stages `[data-stage="auth"|"pay"|"success"]`, ids `#payPlanName #payPlanTag #payPrice #payBenefits #payNoteAmount #payForm #payName #payEmail #payPhone #payErr #payBtn #passCanvas #okPlan #okPassId #okMailNote #payDownload #payDone #authEmailForm #authEmail #authPassword #authSubmit #authToggle #authErr #authStatus #authEmailShown #authSignout`, buttons `[data-auth="google"|"github"|"discord"]`. `checkout.js` module-scope `identity` = `{ uid, provider, email, name } | null`, kept current by `applySession(session)`. Manifest key `assets.checkout`.

- [x] **Step 1: Install the dependency**

Run: `npm install --save-exact @supabase/supabase-js@2`
Expected: `package.json` dependencies gain an exact-pinned `@supabase/supabase-js` 2.x entry.

- [x] **Step 2: Add failing smoke checks**

In `scripts/smoke.mjs`, section 1: change the page list (line 75) to include the checkout page:

```js
for (const p of ["/", "/about.html", "/contact.html", "/privacy.html", "/terms.html", "/checkout.html?plan=hobby"]) {
```

Then insert before the final `ws.close(); chrome.kill(); server.close();` line:

```js
/* ---- 6b · checkout page: sign-in gate ---- */
await metrics(1440, 900);
// invalid plan bounces to the plans section
await go(BASE + "/checkout.html?plan=nope", 2500);
check("gate: invalid plan redirects", (await evalJs("location.pathname + location.hash")) === "/#plans");
// signed out → auth stage
await go(BASE + "/checkout.html?plan=studio", 3000);
check("gate: no JS exceptions", exceptions.length === 0, JSON.stringify(exceptions.slice(0, 3)));
check("gate: auth stage visible", !(await evalJs(`document.querySelector('[data-stage="auth"]').hidden`)));
check("gate: pay stage hidden", await evalJs(`document.querySelector('[data-stage="pay"]').hidden`));
check("gate: plan summary shown signed-out", (await evalJs(`document.getElementById("payPrice").textContent`)).includes("₹6,999"));
check("gate: google option", await evalJs(`!!document.querySelector('button[data-auth="google"]')`));
check("gate: github option", await evalJs(`!!document.querySelector('button[data-auth="github"]')`));
check("gate: discord option", await evalJs(`!!document.querySelector('button[data-auth="discord"]')`));
check("gate: email form present", await evalJs(`!!document.getElementById("authEmailForm")`));
check("gate: page noindex", (await evalJs(`document.querySelector('meta[name="robots"]')?.content`)) === "noindex");
// unconfigured constants → honest error + fallback link
await evalJs(`document.querySelector('button[data-auth="google"]').click()`);
await sleep(300);
check("gate: unconfigured error", (await evalJs(`document.getElementById("authErr").textContent`)).includes("isn't configured yet"));
check("gate: fallback link", (await evalJs(`document.querySelector("#authErr a")?.href || ""`)) === "https://razorpay.me/@stackwith/6999");
// email mode toggle
await evalJs(`document.getElementById("authToggle").click()`);
check("gate: toggle flips to signup", (await evalJs(`document.getElementById("authSubmit").textContent`)) === "Create account");
// signed in via the QA hook — must exist before checkout.js runs, so preload it
const { identifier: authPreload } = await S("Page.addScriptToEvaluateOnNewDocument", { source: `window.__axonAuthCfg = { session: { user: { id: "uid_smoke_1", email: "smoke@test.dev", user_metadata: { full_name: "Smoke Tester" }, app_metadata: { provider: "google" } } } };` });
await go(BASE + "/checkout.html?plan=studio", 3000);
check("gate: signed-in shows pay stage", !(await evalJs(`document.querySelector('[data-stage="pay"]').hidden`)));
check("gate: auth stage hidden when signed in", await evalJs(`document.querySelector('[data-stage="auth"]').hidden`));
check("gate: status shows account email", (await evalJs(`document.getElementById("authEmailShown").textContent`)) === "smoke@test.dev");
check("gate: buyer email prefilled readonly", await evalJs(`document.getElementById("payEmail").value === "smoke@test.dev" && document.getElementById("payEmail").readOnly`));
check("gate: buyer name prefilled", (await evalJs(`document.getElementById("payName").value`)) === "Smoke Tester");
// sign out flips back (hook path)
await evalJs(`document.getElementById("authSignout").click()`);
await sleep(300);
check("gate: sign out returns to auth stage", !(await evalJs(`document.querySelector('[data-stage="auth"]').hidden`)));
await S("Page.removeScriptToEvaluateOnNewDocument", { identifier: authPreload });
```

- [x] **Step 3: Run to verify failure**

Run: `npm run build && npm run smoke`
Expected: exit 1. The six new section-1 checks for `/checkout.html?plan=hobby` FAIL (page doesn't exist → 404 body), and every "gate:" check FAILs. All pre-existing checks still PASS.

- [x] **Step 4: Add the build entry**

In `scripts/build-assets.mjs`, replace:

```js
    entryPoints: ["src/assets/js/main.js", "src/assets/js/consent.js"],
    format: "iife",
    plugins: [manifestPlugin({ "src/assets/js/main.js": "main", "src/assets/js/consent.js": "consent" })],
```

with:

```js
    entryPoints: ["src/assets/js/main.js", "src/assets/js/consent.js", "src/assets/js/checkout.js"],
    format: "iife",
    plugins: [manifestPlugin({ "src/assets/js/main.js": "main", "src/assets/js/consent.js": "consent", "src/assets/js/checkout.js": "checkout" })],
```

- [x] **Step 5: noindex support in the base layout**

In `src/_includes/layouts/base.njk`, after the line `  <meta name="theme-color" content="#07080A" />`, insert:

```njk
  {% if noindex %}<meta name="robots" content="noindex" />{% endif %}
```

- [x] **Step 6: Create `src/_includes/layouts/checkout.njk`**

A `page.njk` clone whose `<main>` skips the `.doc` prose styles (they'd override the card's type/colors) and which loads the checkout bundle:

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
    <a href="/about.html" data-index="01">About</a>
    <a href="/contact.html" data-index="02">Contact</a>
  </nav>
  <div class="nav__right">
    <a href="/#engage" class="btn btn--signal">Get access</a>
  </div>
</header>

<main id="main" class="checkout-main">
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
<script src="{{ assets.checkout }}" defer></script>
<script>document.getElementById("year").textContent = new Date().getFullYear();</script>
```

- [x] **Step 7: Create `src/checkout.html`**

```html
---
layout: layouts/checkout.njk
title: "Checkout — AXON"
description: "Sign in and complete your AXON Supporter Pass purchase."
permalink: "checkout.html"
noindex: true
---
    <section class="checkout">
      <div class="paymodal">
        <p class="eyebrow">[ SIG.07 · CHECKOUT ]</p>
        <header class="paymodal__head">
          <h3 id="payTitle"><span id="payPlanName">—</span></h3>
          <span class="tier__tag" id="payPlanTag">[ — ]</span>
        </header>
        <p class="tier__price"><span id="payPrice">—</span><span> · one-time</span></p>

        <div class="paymodal__stage" data-stage="auth" hidden>
          <h4 class="paymodal__subtitle">Sign in to continue</h4>
          <p class="paymodal__hint">Your Supporter Pass is issued against your account email.</p>
          <div class="payauth">
            <button type="button" class="btn btn--ghost payauth__btn" data-auth="google"><span class="payauth__tag">[ G ]</span> Continue with Google</button>
            <button type="button" class="btn btn--ghost payauth__btn" data-auth="github"><span class="payauth__tag">[ GH ]</span> Continue with GitHub</button>
            <button type="button" class="btn btn--ghost payauth__btn" data-auth="discord"><span class="payauth__tag">[ DC ]</span> Continue with Discord</button>
            <p class="payauth__divider">or use email</p>
            <form class="paymodal__form" id="authEmailForm">
              <input type="email" id="authEmail" name="email" placeholder="you@company.com" aria-label="Email address" autocomplete="email" required />
              <input type="password" id="authPassword" name="password" placeholder="Password (8+ characters)" aria-label="Password" autocomplete="current-password" required minlength="8" />
              <button type="submit" class="btn btn--signal" id="authSubmit">Sign in</button>
              <button type="button" class="payauth__toggle" id="authToggle">New here? Create an account</button>
            </form>
            <p class="paymodal__err" id="authErr" role="alert" hidden></p>
          </div>
        </div>

        <div class="paymodal__stage" data-stage="pay" hidden>
          <p class="paymodal__status" id="authStatus">Signed in as <b id="authEmailShown">—</b><button type="button" class="payauth__toggle" id="authSignout">Sign out</button></p>
          <ul class="paymodal__benefits" id="payBenefits"></ul>
          <form class="paymodal__form" id="payForm">
            <input type="text" id="payName" name="name" placeholder="Full name" aria-label="Full name" autocomplete="name" required minlength="2" />
            <input type="email" id="payEmail" name="email" placeholder="you@company.com" aria-label="Email address" autocomplete="email" required readonly />
            <input type="tel" id="payPhone" name="phone" placeholder="Phone (10 digits)" aria-label="Phone number" autocomplete="tel" required pattern="[0-9+ -]{10,15}" />
            <p class="paymodal__note">AXON is a design showcase. This is a genuine <span id="payNoteAmount">₹—</span> payment for an AXON Supporter Pass, delivered by email — no software product is provided.</p>
            <p class="paymodal__err" id="payErr" role="alert" hidden></p>
            <button type="submit" class="btn btn--signal" id="payBtn" data-probe="PAY">Pay ₹—</button>
          </form>
        </div>

        <div class="paymodal__stage" data-stage="success" hidden>
          <h3 class="paymodal__oktitle">Signal received.</h3>
          <p class="paymodal__okline">Your <b id="okPlan">—</b> Supporter Pass is issued. Pass ID <b id="okPassId">—</b></p>
          <canvas class="paymodal__pass" id="passCanvas" width="1200" height="675" aria-label="Your AXON Supporter Pass"></canvas>
          <p class="paymodal__mailnote" id="okMailNote" role="status">A confirmation email with your benefits is on its way.</p>
          <div class="paymodal__actions">
            <button type="button" class="btn btn--signal" id="payDownload">Download pass</button>
            <a class="btn btn--ghost" id="payDone" href="/#plans">Done</a>
          </div>
        </div>
      </div>
    </section>
```

- [x] **Step 8: Export PLANS**

In `src/assets/js/payments.js`, change `const PLANS = {` to `export const PLANS = {`. (Nothing else in this file changes in this task — the index modal keeps working.)

- [x] **Step 9: Create `src/assets/js/checkout.js`**

```js
/* ============================================================
   AXON — checkout.js · sign-in gate + checkout page controller
   ============================================================ */
import { createClient } from "@supabase/supabase-js";
import { PLANS } from "./payments.js";

const SUPABASE_URL = "";      // ← Supabase → Settings → API (README → Sign-in)
const SUPABASE_ANON_KEY = ""; // ← publishable anon key, same place
const FALLBACK_HANDLE = "https://razorpay.me/@stackwith";

(() => {
  "use strict";
  const card = document.querySelector(".paymodal");
  if (!card) return;

  const planKey = new URLSearchParams(location.search).get("plan");
  const plan = PLANS[planKey];
  if (!plan) { location.replace("/#plans"); return; }

  // — plan header (visible in every stage)
  document.getElementById("payPlanName").textContent = plan.name;
  document.getElementById("payPlanTag").textContent = plan.tag;
  document.getElementById("payPrice").textContent = plan.display;
  document.title = plan.name + " checkout — AXON";

  const stages = {
    auth: card.querySelector('[data-stage="auth"]'),
    pay: card.querySelector('[data-stage="pay"]'),
    success: card.querySelector('[data-stage="success"]'),
  };
  const authErr = document.getElementById("authErr");
  const emailForm = document.getElementById("authEmailForm");
  const authSubmit = document.getElementById("authSubmit");
  const authToggle = document.getElementById("authToggle");
  const NOT_CONFIGURED = "Sign-in isn't configured yet — payments open shortly.";

  function setStage(name) {
    Object.entries(stages).forEach(([key, el]) => { el.hidden = key !== name; });
  }

  function showAuthError(message, withFallback) {
    authErr.replaceChildren(document.createTextNode(message + " "));
    if (withFallback) {
      const a = document.createElement("a");
      a.href = FALLBACK_HANDLE + "/" + Math.round(plan.amount / 100);
      a.target = "_blank"; a.rel = "noopener";
      a.textContent = "Pay via our Razorpay page instead ↗";
      authErr.appendChild(a);
    }
    authErr.hidden = false;
  }

  // — session plumbing (window.__axonAuthCfg is the QA/smoke override hook — do not remove)
  let sb = null;
  let authFails = 0; // repeat sign-in failures offer the hosted payment fallback (spec §5)
  let identity = null; // { uid, provider, email, name } — read by the pay flow at submit time

  function applySession(session) {
    if (!session || !session.user) {
      identity = null;
      setStage("auth");
      return;
    }
    authFails = 0;
    const u = session.user;
    identity = {
      uid: u.id,
      provider: (u.app_metadata && u.app_metadata.provider) || "email",
      email: u.email || "",
      name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || (u.email || "").split("@")[0],
    };
    document.getElementById("authEmailShown").textContent = identity.email;
    const nameEl = document.getElementById("payName");
    if (!nameEl.value) nameEl.value = identity.name;
    const emailEl = document.getElementById("payEmail");
    emailEl.value = identity.email;
    emailEl.readOnly = true;
    setStage("pay");
  }

  const hook = window.__axonAuthCfg;
  if (hook && hook.session) {
    applySession(hook.session);
  } else if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    sb.auth.getSession().then(({ data }) => applySession(data.session));
    sb.auth.onAuthStateChange((_event, session) => applySession(session));
    // surface an OAuth error bounced back in the URL
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    const oauthErr = q.get("error_description") || h.get("error_description");
    if (oauthErr) { setStage("auth"); showAuthError(oauthErr.replace(/\+/g, " ") + " You can retry."); }
  } else {
    setStage("auth");
  }

  // — OAuth providers
  card.querySelectorAll("[data-auth]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      authErr.hidden = true;
      if (!sb) { showAuthError(NOT_CONFIGURED, true); return; }
      const { error } = await sb.auth.signInWithOAuth({
        provider: btn.getAttribute("data-auth"),
        options: { redirectTo: location.href },
      });
      if (error) showAuthError(error.message + " You can retry.", ++authFails >= 2);
    }));

  // — email + password (Sign in ⇄ Create account)
  let mode = "signin";
  authToggle.addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    authSubmit.textContent = mode === "signin" ? "Sign in" : "Create account";
    authToggle.textContent = mode === "signin" ? "New here? Create an account" : "Have an account? Sign in";
    document.getElementById("authPassword").setAttribute("autocomplete", mode === "signin" ? "current-password" : "new-password");
    authErr.hidden = true;
  });
  emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!emailForm.checkValidity()) { emailForm.reportValidity(); return; }
    authErr.hidden = true;
    if (!sb) { showAuthError(NOT_CONFIGURED, true); return; }
    const creds = {
      email: document.getElementById("authEmail").value.trim(),
      password: document.getElementById("authPassword").value,
    };
    authSubmit.setAttribute("aria-busy", "true");
    const { data, error } = mode === "signin"
      ? await sb.auth.signInWithPassword(creds)
      : await sb.auth.signUp(creds);
    authSubmit.removeAttribute("aria-busy");
    if (error) {
      const hint = mode === "signin" ? " New here? Use “Create an account” below." : " Already registered? Switch to “Sign in”.";
      showAuthError(error.message + hint, ++authFails >= 2);
      return;
    }
    if (mode === "signup" && data && !data.session) {
      showAuthError("Almost there — confirm the email we just sent you, then reload this page.");
    }
    // a returned session flows through onAuthStateChange → pay stage
  });

  // — sign out
  document.getElementById("authSignout").addEventListener("click", () => {
    if (sb) sb.auth.signOut();
    else applySession(null); // hook path
  });
})();
```

- [x] **Step 10: Add checkout-page CSS**

In `src/assets/css/styles.css`, immediately after the CHECKOUT MODAL section's last rule (`body.pay-open { overflow: hidden; }`) and before the ENGAGE section header, insert:

```css
/* ============================================================
   CHECKOUT PAGE (sign-in gate)
   ============================================================ */
.checkout-main { display: grid; justify-items: center; }
.checkout { width: min(560px, 100%); }
.paymodal__subtitle { font-family: var(--display); font-weight: 600; font-size: 1.15rem; }
.paymodal__hint { font-family: var(--mono); font-size: 0.78rem; color: var(--muted); }
.payauth { display: flex; flex-direction: column; gap: 0.6rem; }
.payauth .btn { justify-content: flex-start; gap: 0.6rem; }
.payauth__tag { font-family: var(--mono); font-size: 0.72rem; color: var(--signal); }
.payauth__divider { display: flex; align-items: center; gap: 0.8rem; font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.1em; color: var(--faint); text-transform: uppercase; }
.payauth__divider::before, .payauth__divider::after { content: ""; height: 1px; flex: 1; background: var(--line); }
.payauth__toggle { align-self: flex-start; background: none; border: none; padding: 0; font-family: var(--mono); font-size: 0.76rem; color: var(--muted); text-decoration: underline; cursor: pointer; }
.payauth__toggle:hover { color: var(--text); }
.paymodal__status { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; font-family: var(--mono); font-size: 0.78rem; color: var(--muted); }
.paymodal__status b { color: var(--signal); font-weight: 500; }
.paymodal__form input[readonly] { color: var(--muted); border-color: var(--line); }
```

(Note: `.page main` already gives the centered 860px column with 8.5rem top padding; `.checkout-main` skips the `.doc` prose styles on purpose — they'd override the card's colors and list markers.)

- [x] **Step 11: Run to verify pass**

Run: `npm run build && npm run smoke`
Expected: **ALL PASS** (six new section-1 checks for the checkout page + all "gate:" checks; old modal section 6 untouched and still green).

- [x] **Step 12: Commit**

```bash
git add package.json package-lock.json scripts/build-assets.mjs src/_includes/layouts/base.njk src/_includes/layouts/checkout.njk src/checkout.html src/assets/js/checkout.js src/assets/js/payments.js src/assets/css/styles.css scripts/smoke.mjs
git commit -m "feat: checkout page with Supabase sign-in gate (Google/GitHub/Discord/email)"
```

---

### Task 2: Purchase cutover — pay flow moves to the page, modal removed

**Files:**
- Modify: `src/assets/js/payments.js` (full refactor, content below)
- Modify: `src/assets/js/checkout.js` (2 lines: import + init)
- Modify: `src/assets/js/main.js` (remove import + init)
- Modify: `src/index.html` (CTA links; modal block deleted)
- Modify: `src/assets/css/styles.css` (modal-only rules deleted)
- Test: `scripts/smoke.mjs` (section 6 rewritten)

**Interfaces:**
- Consumes: Task 1's page DOM ids/stages and `checkout.js`'s `identity`/`planKey`.
- Produces: `export function initPayFlow(planKey, getIdentity)` in `payments.js` — `getIdentity(): { uid, provider, email, name } | null`, called at submit time; Razorpay `notes` = `{ plan, buyer_name, auth_uid, auth_provider }`. `initPayments` no longer exists.

- [ ] **Step 1: Rewrite smoke section 6**

In `scripts/smoke.mjs`, replace everything from the line `/* ---- 6 · payments: cards, modal, checkout, pass, email ---- */` down to (but not including) the line `/* ---- 6b · checkout page: sign-in gate ---- */` with:

```js
/* ---- 6 · plans → checkout page purchase flow ---- */
await metrics(1440, 900);
await go(BASE + "/", 3000);
check("pay: heading says Start for ₹5", (await evalJs(`document.querySelector(".plans .section__title")?.textContent.replace(/\\s+/g, " ").trim() || ""`)).includes("Start for ₹5"));
check("pay: hobby CTA links to checkout", (await evalJs(`document.querySelector('a[data-plan="hobby"]')?.getAttribute("href")`)) === "/checkout.html?plan=hobby");
check("pay: studio CTA links to checkout", (await evalJs(`document.querySelector('a[data-plan="studio"]')?.getAttribute("href")`)) === "/checkout.html?plan=studio");
check("pay: hobby card ₹5 one-time", (await evalJs(`document.querySelector('a[data-plan="hobby"]')?.closest(".tier")?.querySelector(".tier__price")?.textContent.replace(/\\s+/g, " ") || ""`)).includes("₹5 one-time"));
check("pay: studio card ₹6,999 one-time", (await evalJs(`document.querySelector('a[data-plan="studio"]')?.closest(".tier")?.querySelector(".tier__price")?.textContent.replace(/\\s+/g, " ") || ""`)).includes("₹6,999 one-time"));
check("pay: no $ price on payable cards", !(await evalJs(`/\\$\\d/.test(document.querySelector(".tiers")?.textContent || "")`)) || (await evalJs(`document.querySelector(".tier:last-of-type .tier__price").textContent`)) === "Custom");
check("pay: enterprise card untouched", (await evalJs(`document.querySelector(".tier:last-of-type .btn")?.getAttribute("href")`)) === "#engage");
check("pay: modal markup gone", !(await evalJs(`!!document.getElementById("paywrap")`)));

// signed-in purchase on the checkout page
const { identifier: payPreload } = await S("Page.addScriptToEvaluateOnNewDocument", { source: `window.__axonAuthCfg = { session: { user: { id: "uid_smoke_1", email: "smoke@test.dev", user_metadata: { full_name: "Smoke Tester" }, app_metadata: { provider: "google" } } } };` });
await go(BASE + "/checkout.html?plan=studio", 3000);
check("pay: benefits ≥ 8", (await evalJs(`document.querySelectorAll("#payBenefits li").length`)) >= 8, String(await evalJs(`document.querySelectorAll("#payBenefits li").length`)));
check("pay: honest note", (await evalJs(`document.querySelector(".paymodal__note").textContent.replace(/\\s+/g, " ")`)).includes("AXON is a design showcase. This is a genuine ₹6,999 payment"));
check("pay: pay button labelled", (await evalJs(`document.getElementById("payBtn").textContent`)) === "Pay ₹6,999");

// stub Razorpay + fetch BEFORE interacting (read lazily by the pay flow)
await evalJs(`(() => {
  window.__rzpCalls = []; window.__rzpOpened = 0;
  window.Razorpay = function (opts) {
    window.__rzpCalls.push(opts);
    this.open = () => { window.__rzpOpened++; };
    this.on = (ev, cb) => { if (ev === "payment.failed") window.__rzpFail = cb; };
  };
  window.__fetches = [];
  window.fetch = (url, init) => { window.__fetches.push({ url: String(url), body: (init && init.body) || "" }); return Promise.resolve(new Response("{}", { status: 200 })); };
  window.__axonEmailCfg = { serviceId: "svc_smoke", templateId: "tpl_smoke", publicKey: "pub_smoke" };
})()`);
// phone still empty → native validation blocks
await evalJs(`document.getElementById("payForm").requestSubmit()`);
await sleep(300);
check("pay: incomplete form blocked", (await evalJs(`window.__rzpCalls.length`)) === 0);
// complete the form (name/email came from the session) and submit
await evalJs(`(() => {
  document.getElementById("payPhone").value = "9999999999";
  document.getElementById("payForm").requestSubmit();
})()`);
await sleep(500);
check("pay: checkout opened", (await evalJs(`window.__rzpOpened`)) === 1);
const rzpOpts = await evalJs(`window.__rzpCalls[0] && { amount: window.__rzpCalls[0].amount, currency: window.__rzpCalls[0].currency, name: window.__rzpCalls[0].name, email: window.__rzpCalls[0].prefill?.email, contact: window.__rzpCalls[0].prefill?.contact, plan: window.__rzpCalls[0].notes?.plan, auth_uid: window.__rzpCalls[0].notes?.auth_uid, auth_provider: window.__rzpCalls[0].notes?.auth_provider, hasHandler: typeof window.__rzpCalls[0].handler === "function" }`);
check("pay: amount 699900 paise", rzpOpts?.amount === 699900, JSON.stringify(rzpOpts));
check("pay: currency INR", rzpOpts?.currency === "INR");
check("pay: prefill email from account", rzpOpts?.email === "smoke@test.dev");
check("pay: prefill contact", rzpOpts?.contact === "9999999999");
check("pay: notes.plan studio", rzpOpts?.plan === "studio");
check("pay: notes.auth_uid", rzpOpts?.auth_uid === "uid_smoke_1");
check("pay: notes.auth_provider", rzpOpts?.auth_provider === "google");
check("pay: success handler wired", rzpOpts?.hasHandler === true);

// synthetic success → pass rendered
await evalJs(`window.__rzpCalls[0].handler({ razorpay_payment_id: "pay_SMOKE1234567890" })`);
await sleep(700);
check("pay: success stage shown", !(await evalJs(`document.querySelector('[data-stage="success"]').hidden`)));
check("pay: pay stage hidden", await evalJs(`document.querySelector('[data-stage="pay"]').hidden`));
check("pay: pass id shown", (await evalJs(`document.getElementById("okPassId").textContent`)) === "pay_SMOKE1234567890");
check("pay: plan named on success", (await evalJs(`document.getElementById("okPlan").textContent`)) === "Studio");
check("pay: pass canvas painted", (await evalJs(`document.getElementById("passCanvas").getContext("2d").getImageData(100, 100, 1, 1).data.join()`)) === "7,8,10,255");
check("pay: download button visible", await evalJs(`!document.getElementById("payDownload").hidden`));
check("pay: done links to plans", (await evalJs(`document.getElementById("payDone").getAttribute("href")`)) === "/#plans");

// EmailJS request captured by the fetch stub
const mail = await evalJs(`window.__fetches.find((f) => f.url.includes("api.emailjs.com"))`);
check("pay: emailjs request sent", !!mail, JSON.stringify(await evalJs(`window.__fetches.map((f) => f.url)`)));
const mailBody = mail ? JSON.parse(mail.body) : {};
check("pay: emailjs service/template", mailBody.service_id === "svc_smoke" && mailBody.template_id === "tpl_smoke" && mailBody.user_id === "pub_smoke", mail && mail.body);
check("pay: emailjs to_email", mailBody.template_params?.to_email === "smoke@test.dev");
check("pay: emailjs pass_id", mailBody.template_params?.pass_id === "pay_SMOKE1234567890");
check("pay: emailjs benefits included", String(mailBody.template_params?.benefits || "").includes("Priority trace lanes"));
check("pay: mail note optimistic", (await evalJs(`document.getElementById("okMailNote").textContent`)).includes("on its way"));

// failure path on the hobby page: readable error, fallback link on 2nd failure
await go(BASE + "/checkout.html?plan=hobby", 3000);
await evalJs(`(() => {
  window.__rzpCalls = []; window.__rzpOpened = 0;
  window.Razorpay = function (opts) {
    window.__rzpCalls.push(opts);
    this.open = () => { window.__rzpOpened++; };
    this.on = (ev, cb) => { if (ev === "payment.failed") window.__rzpFail = cb; };
  };
})()`);
await evalJs(`(() => {
  document.getElementById("payPhone").value = "9999999999";
  document.getElementById("payForm").requestSubmit();
})()`);
await sleep(400);
await evalJs(`window.__rzpFail({ error: { description: "Card declined by issuer" } })`);
await sleep(300);
check("pay: failure reason shown", (await evalJs(`document.getElementById("payErr").textContent`)).includes("Card declined by issuer"));
check("pay: no fallback on 1st failure", !(await evalJs(`!!document.querySelector("#payErr a")`)));
check("pay: pay button re-enabled", !(await evalJs(`document.getElementById("payBtn").hasAttribute("aria-busy")`)));
await evalJs(`document.getElementById("payForm").requestSubmit()`);
await sleep(400);
await evalJs(`window.__rzpFail({ error: { description: "Card declined by issuer" } })`);
await sleep(300);
const fb = await evalJs(`document.querySelector("#payErr a")?.href || ""`);
check("pay: fallback link on 2nd failure", fb === "https://razorpay.me/@stackwith/5", fb);
await S("Page.removeScriptToEvaluateOnNewDocument", { identifier: payPreload });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run build && npm run smoke`
Expected: exit 1 — "pay: hobby CTA links to checkout", "pay: studio CTA links to checkout", "pay: modal markup gone" FAIL (CTAs are still buttons, modal exists), and the checkout-page purchase checks FAIL ("pay: benefits ≥ 8" onward — no pay flow is bound on the page yet). Section 6b "gate:" checks still PASS.

- [ ] **Step 3: Rewrite `src/assets/js/payments.js`**

Replace the entire file with (constants keep their current committed values — live Razorpay key + EmailJS IDs):

```js
/* ============================================================
   AXON — payments.js · plan data + Razorpay pay flow + supporter pass
   ============================================================ */

const RAZORPAY_KEY_ID = "rzp_live_TAKxGxbsRAvd0N"; // live key — publishable by design (README → Payments)
const EMAILJS_DEFAULT = { serviceId: "service_keg45ah", templateId: "template_x5fq3zo", publicKey: "yeb2fwT093Ki8zSG_" }; // README → Payments
const FALLBACK_HANDLE = "https://razorpay.me/@stackwith";
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export const PLANS = {
  hobby: {
    name: "Hobby", tag: "[ 00 ]", amount: 500, display: "₹5",
    description: "Hobby — AXON Supporter Pass (one-time)",
    benefits: [
      "1 active agent", "500 runs / month", "Community connectors", "Community support",
      "Signal replay — 7-day retention", "Starter agent templates",
      "Supporter listing in the AXON registry", "Priority queue for access requests",
    ],
  },
  studio: {
    name: "Studio", tag: "[ 01 ]", amount: 699900, display: "₹6,999",
    description: "Studio — AXON Supporter Pass (one-time)",
    benefits: [
      "Unlimited agents", "100k runs / month", "200+ connectors", "Guardrails & audit log",
      "Priority support", "Priority trace lanes", "Workspace-level guardrail policies",
      "Early access to new instrument modules",
    ],
  },
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });
}

/* Binds the purchase flow on the checkout page. `getIdentity` returns the
   signed-in buyer ({ uid, provider, email, name }) or null; it is called at
   submit time so a sign-out mid-page never uses a stale identity. */
export function initPayFlow(planKey, getIdentity) {
  const plan = PLANS[planKey];
  const form = document.getElementById("payForm");
  if (!plan || !form) return;
  const stagePay = document.querySelector('[data-stage="pay"]');
  const stageOk = document.querySelector('[data-stage="success"]');
  const err = document.getElementById("payErr");
  const payBtn = document.getElementById("payBtn");
  let failCount = 0;

  document.getElementById("payNoteAmount").textContent = plan.display;
  payBtn.textContent = "Pay " + plan.display;
  document.getElementById("payBenefits").replaceChildren(...plan.benefits.map((b) => {
    const li = document.createElement("li"); li.textContent = b; return li;
  }));

  function showPayError(message, withFallback) {
    err.replaceChildren(document.createTextNode(message + " "));
    if (withFallback) {
      const a = document.createElement("a");
      a.href = FALLBACK_HANDLE + "/" + Math.round(plan.amount / 100);
      a.target = "_blank"; a.rel = "noopener";
      a.textContent = "Pay via our Razorpay page instead ↗";
      err.appendChild(a);
    }
    err.hidden = false;
    payBtn.removeAttribute("aria-busy");
    payBtn.textContent = "Pay " + plan.display;
  }

  async function launchCheckout(buyer) {
    if (!window.Razorpay) {
      if (!RAZORPAY_KEY_ID) {
        showPayError("Payments aren't live yet — configuration is pending.", true);
        return;
      }
      try { await loadScript(CHECKOUT_SRC); }
      catch { showPayError("Could not reach the payment service. Check your connection and retry.", true); return; }
    }
    const id = getIdentity() || { uid: "", provider: "" };
    const rzp = new window.Razorpay({
      key: RAZORPAY_KEY_ID,
      amount: plan.amount,
      currency: "INR",
      name: "AXON",
      description: plan.description,
      prefill: { name: buyer.name, email: buyer.email, contact: buyer.phone },
      notes: { plan: planKey, buyer_name: buyer.name, auth_uid: id.uid, auth_provider: id.provider },
      theme: { color: "#B8FF3C" },
      handler: (response) => showSuccess(buyer, response.razorpay_payment_id),
      modal: { ondismiss: () => { payBtn.removeAttribute("aria-busy"); payBtn.textContent = "Pay " + plan.display; } },
    });
    rzp.on("payment.failed", onPaymentFailed);
    rzp.open();
  }

  function sendBenefitsEmail(buyer, passId) {
    const cfg = window.__axonEmailCfg || EMAILJS_DEFAULT;
    if (!cfg.serviceId || !cfg.templateId || !cfg.publicKey) {
      return Promise.reject(new Error("emailjs unconfigured"));
    }
    return fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: cfg.serviceId,
        template_id: cfg.templateId,
        user_id: cfg.publicKey,
        template_params: {
          to_name: buyer.name,
          to_email: buyer.email,
          plan_name: plan.name,
          amount: plan.display,
          pass_id: passId,
          benefits: plan.benefits.join(" · "),
        },
      }),
    }).then((res) => { if (!res.ok) throw new Error("HTTP " + res.status); });
  }

  function renderPass(buyer, passId) {
    const c = document.getElementById("passCanvas");
    if (!c || !c.getContext) return false;
    try {
      const x = c.getContext("2d");
      const W = c.width, H = c.height; // 1200 × 675
      const mono = (w, s) => `${w} ${s}px "JetBrains Mono", monospace`;
      x.fillStyle = "#07080A"; x.fillRect(0, 0, W, H);
      x.strokeStyle = "rgba(255,255,255,0.14)"; x.lineWidth = 2;
      x.strokeRect(28, 28, W - 56, H - 56);
      x.fillStyle = "#B8FF3C"; x.fillRect(28, 28, W - 56, 5);
      x.fillStyle = "#B8FF3C"; x.font = mono(700, 58); x.fillText("AXON", 76, 150);
      x.fillStyle = "#7E8794"; x.font = mono(500, 24); x.fillText("SUPPORTER PASS · " + plan.tag, 76, 196);
      x.fillStyle = "#F2F4F3"; x.font = mono(600, 46);
      x.fillText(buyer.name.slice(0, 28), 76, 320);
      x.fillStyle = "#B7BEC6"; x.font = mono(500, 26);
      x.fillText(plan.name + " · " + plan.display + " · one-time", 76, 375);
      x.fillStyle = "#7E8794"; x.font = mono(500, 22);
      x.fillText("PASS ID  " + passId, 76, 470);
      x.fillText("ISSUED   " + new Date().toISOString().slice(0, 10), 76, 508);
      x.fillStyle = "#78828E"; x.font = mono(500, 17);
      x.fillText("stackwith.me — AXON is a design showcase. This pass certifies your support.", 76, 600);
      return true;
    } catch { return false; }
  }

  function downloadPass(passId) {
    const c = document.getElementById("passCanvas");
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "axon-supporter-pass-" + passId + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  }

  let lastPassId = "";
  function showSuccess(buyer, paymentId) {
    lastPassId = paymentId;
    document.getElementById("okPlan").textContent = plan.name;
    document.getElementById("okPassId").textContent = paymentId;
    const drew = renderPass(buyer, paymentId);
    document.getElementById("payDownload").hidden = !drew;
    document.getElementById("passCanvas").hidden = !drew;
    stagePay.hidden = true; stageOk.hidden = false;
    const note = document.getElementById("okMailNote");
    note.textContent = "A confirmation email with your benefits is on its way.";
    sendBenefitsEmail(buyer, paymentId).catch(() => {
      note.textContent = "Email delivery delayed — your pass ID above is your proof of purchase.";
    });
  }

  document.getElementById("payDownload").addEventListener("click", () => downloadPass(lastPassId));

  function onPaymentFailed(resp) {
    failCount++;
    const reason = resp && resp.error && resp.error.description
      ? resp.error.description
      : "Payment could not be completed.";
    showPayError(reason + " You can retry.", failCount >= 2);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (payBtn.getAttribute("aria-busy") === "true") return;
    err.hidden = true;
    payBtn.setAttribute("aria-busy", "true");
    payBtn.textContent = "OPENING…";
    launchCheckout({
      name: document.getElementById("payName").value.trim(),
      email: document.getElementById("payEmail").value.trim(),
      phone: document.getElementById("payPhone").value.trim(),
    });
  });
}
```

- [ ] **Step 4: Bind the pay flow in `checkout.js`**

In `src/assets/js/checkout.js`, change the import line:

```js
import { PLANS } from "./payments.js";
```

to:

```js
import { PLANS, initPayFlow } from "./payments.js";
```

and immediately after the `document.title = plan.name + " checkout — AXON";` line, add:

```js
  initPayFlow(planKey, () => identity);
```

(`identity` is declared below with `let` — function-scoped closure reads its current value at submit time; the declaration is hoisted, so this call site is fine because `initPayFlow` only *stores* the callback.)

- [ ] **Step 5: Swap the landing CTAs to links**

In `src/index.html`, replace:

```html
          <button type="button" class="btn btn--ghost" data-plan="hobby" data-probe>Get access</button>
```

with:

```html
          <a class="btn btn--ghost" href="/checkout.html?plan=hobby" data-plan="hobby" data-probe>Get access</a>
```

and replace:

```html
          <button type="button" class="btn btn--signal" data-plan="studio" data-probe="DEPLOY">Get access</button>
```

with:

```html
          <a class="btn btn--signal" href="/checkout.html?plan=studio" data-plan="studio" data-probe="DEPLOY">Get access</a>
```

- [ ] **Step 6: Delete the modal markup**

In `src/index.html`, delete the entire block from the line

```html
    <!-- ░░ SIG.07a · CHECKOUT MODAL (Razorpay supporter pass) ░░ -->
```

through the closing `</div>` of `#paywrap` (the block ends with the success stage's `</div>`, the `.paymodal` `</div>`, and the `.paywrap` `</div>` — three closing divs after `payDone`).

- [ ] **Step 7: Unwire `main.js`**

In `src/assets/js/main.js`, delete the line:

```js
import { initPayments } from "./payments.js";
```

and delete the line (immediately before the `console.log("%cAXON", …)` line):

```js
  initPayments();
```

- [ ] **Step 8: Delete modal-only CSS**

In `src/assets/css/styles.css` (CHECKOUT MODAL section), delete these rules — they styled the fixed overlay that no longer exists:

```css
.paywrap { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 1.2rem; }
.paywrap[hidden] { display: none; }
.paywrap__backdrop { position: absolute; inset: 0; background: rgba(7, 8, 10, 0.78); backdrop-filter: blur(6px); }
```

```css
.paymodal__x { position: absolute; top: 0.9rem; right: 0.9rem; width: 2rem; height: 2rem; background: none; border: 1px solid var(--line); border-radius: 6px; color: var(--muted); font-family: var(--mono); font-size: 0.8rem; cursor: pointer; transition: border-color 0.3s var(--ease), color 0.3s var(--ease); }
.paymodal__x:hover { color: var(--text); border-color: var(--line-strong); }
```

```css
body.pay-open { overflow: hidden; }
```

Also in the `.paymodal` rule, change `max-height: min(86vh, 780px); overflow: auto;` to nothing (delete those two declarations — the page scrolls naturally), and update the section header comment from `CHECKOUT MODAL (Razorpay supporter pass)` to `CHECKOUT CARD (Razorpay supporter pass)`.

- [ ] **Step 9: Run to verify pass**

Run: `npm run build && npm run smoke`
Expected: **ALL PASS** — rewritten section 6, untouched section 6b, and all earlier sections.

- [ ] **Step 10: Commit**

```bash
git add src/assets/js/payments.js src/assets/js/checkout.js src/assets/js/main.js src/index.html src/assets/css/styles.css scripts/smoke.mjs
git commit -m "feat: purchases move to the sign-in-gated checkout page; modal removed"
```

---

### Task 3: Docs, QA baselines, project state

**Files:**
- Modify: `README.md` (new "Sign-in (Supabase)" section after "Payments")
- Modify: `CLAUDE.md` (current state + standing decisions)
- Test: full `npm run build && npm run smoke`, then `npm run qa` + checkout-page shots

**Interfaces:**
- Consumes: everything shipped in Tasks 1–2.
- Produces: operator documentation the user follows in Task 4.

- [ ] **Step 1: Add README "Sign-in (Supabase)" section**

Append to `README.md` after the Payments section:

```markdown
## Sign-in (Supabase)

Purchases require sign-in on `/checkout.html` (Google, GitHub, Discord, or
email + password) via Supabase Auth — no backend of ours. Config lives at the
top of `src/assets/js/checkout.js`:

- `SUPABASE_URL` + `SUPABASE_ANON_KEY` — supabase.com → your project →
  Settings → API. The anon key is publishable by design.

One-time Supabase dashboard setup:

1. **Authentication → Providers → Email**: enable. Recommended: turn
   **Confirm email OFF** (buyers shouldn't bounce to their inbox mid-checkout).
2. **Authentication → Providers → Google / GitHub / Discord**: enable each,
   using a free OAuth app registered at the provider with callback/redirect URL
   `https://<project-ref>.supabase.co/auth/v1/callback`:
   - Google: console.cloud.google.com → APIs & Services → Credentials →
     OAuth client ID (Web application).
   - GitHub: github.com/settings/developers → New OAuth App.
   - Discord: discord.com/developers/applications → New Application → OAuth2.
   Paste each client ID + secret into the Supabase provider form.
3. **Authentication → URL Configuration**: Site URL `https://stackwith.me`;
   additional redirect URLs `https://stackwith.me/checkout.html` and
   `http://localhost:8080/checkout.html` (local QA).

While the constants are empty, the checkout page renders all sign-in options
and shows an honest "sign-in isn't configured yet" error (with the razorpay.me
fallback link) when one is used. `window.__axonAuthCfg` is the QA/smoke
session-injection hook — do not remove.
```

- [ ] **Step 2: Update `CLAUDE.md`**

In "Current state": note that purchases moved to a sign-in-gated `/checkout.html` (Supabase Auth: Google/GitHub/Discord/email) per `docs/superpowers/plans/2026-07-07-signin-checkout-page.md`; the modal is gone; pending user config `SUPABASE_URL`/`SUPABASE_ANON_KEY` in `src/assets/js/checkout.js` plus provider apps (README → Sign-in); the ₹5 live verification is still open and now also confirms `auth_uid`/`auth_provider` notes.
In "Standing decisions": add that tier CTAs are links to `/checkout.html?plan=…`; `window.__axonAuthCfg` is a QA/smoke hook — do not remove; checkout page is `noindex`; smoke gained section 6b ("gate:" checks).

- [ ] **Step 3: Full verification + fresh QA baselines**

Run: `npm run build && npm run smoke`
Expected: **ALL PASS**.
Run: `(python3 -m http.server 8080 -d _site &) && sleep 1 && npm run qa && npm run qa -- 390 844`
(leave the server running for the next command).

Then capture the checkout page's auth + signed-in stages. Write this one-off to `/tmp/axon-checkout-qa.mjs` and run `node /tmp/axon-checkout-qa.mjs 1440 900 && node /tmp/axon-checkout-qa.mjs 390 844; pkill -f "http.server 8080"`:

```js
// One-off: screenshot the checkout page stages — CDP pattern from scripts/qa-shots.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const W = parseInt(process.argv[2] || "1440", 10);
const H = parseInt(process.argv[3] || "900", 10);
const OUT = "/tmp/axon-qa";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9522 + (W % 100);
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`,
  "--hide-scrollbars", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
  "--no-first-run", `--user-data-dir=/tmp/axon-checkout-qa-profile-${W}`, "about:blank",
], { stdio: "ignore" });

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome CDP not ready");
}
const ws = new WebSocket(await getWsUrl());
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });

let id = 0; const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) })); });

const targets = await send("Target.getTargets");
const page = targets.targetInfos.find((t) => t.type === "page");
const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable"); await S("Runtime.enable");
await S("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 });
const evalJs = async (expr) => (await S("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const shoot = async (name) => {
  const { data } = await S("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${W}-${name}.png`, Buffer.from(data, "base64"));
};

// auth stage (signed out)
await S("Page.navigate", { url: "http://localhost:8080/checkout.html?plan=studio" });
await sleep(3000);
await evalJs(`document.querySelector(".consent .btn--ghost")?.click()`); // dismiss banner
await sleep(400);
await shoot("checkout-auth");

// signed-in pay stage via the QA hook (preload, then reload)
await S("Page.addScriptToEvaluateOnNewDocument", { source: `window.__axonAuthCfg = { session: { user: { id: "uid_qa_1", email: "qa@example.com", user_metadata: { full_name: "QA Reviewer" }, app_metadata: { provider: "google" } } } };` });
await S("Page.navigate", { url: "http://localhost:8080/checkout.html?plan=studio" });
await sleep(3000);
await shoot("checkout-pay");

console.log("checkout shots done for " + W);
ws.close(); chrome.kill(); await sleep(200); process.exit(0);
```

Eyeball all shots (landing sections + `{1440,390}-checkout-auth.png` / `-checkout-pay.png`) for layout breakage, then refresh the baselines:

```bash
mkdir -p /tmp/axon-qa-baseline-desktop /tmp/axon-qa-baseline-mobile
cp /tmp/axon-qa/1440-*.png /tmp/axon-qa-baseline-desktop/
cp /tmp/axon-qa/390-*.png /tmp/axon-qa-baseline-mobile/
```

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: sign-in setup guide (Supabase) + project state"
```

---

### Task 4: Rollout (user-gated — needs Supabase project + provider apps)

**Files:**
- Modify: `src/assets/js/checkout.js` (paste real `SUPABASE_URL` + `SUPABASE_ANON_KEY` only)

**Interfaces:**
- Consumes: README → Sign-in instructions from Task 3; values only the user can provide.

- [ ] **Step 1: User provides Supabase config**

Ask the user for: project URL + anon key, after they complete the README → Sign-in dashboard setup (Email provider, Google/GitHub/Discord OAuth apps, URL configuration). Paste into `checkout.js` constants.

- [ ] **Step 2: Local sign-in QA**

Run: `npm run build && npm run smoke` → ALL PASS. Then `python3 -m http.server 8080 -d _site` and manually at `http://localhost:8080/checkout.html?plan=hobby`: sign in with each provider (Google, GitHub, Discord) — verify the redirect returns to the checkout page signed-in with the right email; create an email/password account and sign in with it; sign out and back in; confirm the buyer email field is read-only and prefilled.

- [ ] **Step 3: Deploy**

```bash
git add src/assets/js/checkout.js
git commit -m "feat: live Supabase sign-in configuration"
git push
```

- [ ] **Step 4: Live verification**

After Pages deploys: repeat one OAuth sign-in on https://stackwith.me/checkout.html?plan=hobby (redirect URLs must accept the production origin). Then perform the still-pending **₹5 live purchase verification** (payments plan Task 8 Step 4) on this page: pay ₹5, confirm captured + `notes` now include `plan, buyer_name, auth_uid, auth_provider` in the Razorpay dashboard, EmailJS mail arrives, then refund. Update `CLAUDE.md` (feature live + date), commit and push.
