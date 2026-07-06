# Razorpay Pricing Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pricing tiers on index.html real: click Hobby/Studio → AXON-styled modal with full benefits + buyer details → pay via client-side Razorpay Checkout → success screen with downloadable Supporter Pass + EmailJS benefits email.

**Architecture:** 100% static (GitHub Pages, no backend). A new `payments.js` module (imported by `main.js`, so esbuild folds it into the existing hashed `assets.main` bundle — zero build-config changes) owns a reusable checkout modal defined statically in `index.html`. Razorpay `checkout.js` is lazy-injected on first Pay click; the success handler renders a canvas Supporter Pass and fires a `fetch` to EmailJS's REST API. Spec: `docs/superpowers/specs/2026-07-06-razorpay-pricing-design.md`.

**Tech Stack:** Eleventy 3 + esbuild (existing), vanilla JS (IIFE-adjacent module style of `main.js`), Razorpay Standard Checkout (no order_id — auto-capture enabled in dashboard), EmailJS REST API (no SDK), CDP smoke harness (`scripts/smoke.mjs`).

## Global Constraints

- Design stays pixel-identical **except** sanctioned changes: tier card prices/CTAs, plans section heading, new modal.
- Never touch: `src/blog/`, `src/404.html`, BLOG/FAQ/404 sections of `styles.css` (lines ~481–523).
- Amounts exact: Hobby **500 paise (₹5)**, Studio **699900 paise (₹6,999)**; Enterprise card unchanged.
- Honest-copy line verbatim (amount substituted): "AXON is a design showcase. This is a genuine ₹{amount} payment for an AXON Supporter Pass, delivered by email — no software product is provided."
- All new copy professional in register. No new npm dependencies. No changes to `scripts/build-assets.mjs`.
- `npm run build && npm run smoke` must end **ALL PASS** after every task.
- Smoke Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- Placeholders empty until user supplies: `RAZORPAY_KEY_ID`, EmailJS `serviceId`/`templateId`/`publicKey`. With empty key the Pay flow shows an honest "not live yet" error + `razorpay.me/@stackwith` fallback link — never a fake success.
- Config-override hooks `window.__axonEmailCfg` (and Razorpay constructor picked up from `window.Razorpay` if already present) exist so smoke/QA can run without editing source constants.

---

### Task 1: Tier cards show real ₹ prices

**Files:**
- Modify: `src/index.html:222` (heading), `src/index.html:225-250` (Hobby + Studio cards)
- Test: `scripts/smoke.mjs` (new section 6, first three checks)

**Interfaces:**
- Produces: `<button type="button" class="btn …" data-plan="hobby|studio">` CTAs that Task 2's `initPayments()` binds to. Enterprise card keeps its `<a href="#engage">`.

- [x] **Step 1: Add failing smoke checks**

In `scripts/smoke.mjs`, insert before the final `ws.close(); chrome.kill(); server.close();` line:

```js
/* ---- 6 · payments: cards, modal, checkout, pass, email ---- */
await metrics(1440, 900);
await go(BASE + "/", 3000);
check("pay: heading says Start for ₹5", (await evalJs(`document.querySelector(".plans .section__title")?.textContent.replace(/\\s+/g, " ").trim() || ""`)).includes("Start for ₹5"));
check("pay: hobby card ₹5 one-time", (await evalJs(`document.querySelector('button[data-plan="hobby"]')?.closest(".tier")?.querySelector(".tier__price")?.textContent.replace(/\\s+/g, " ") || ""`)).includes("₹5 one-time"));
check("pay: studio card ₹6,999 one-time", (await evalJs(`document.querySelector('button[data-plan="studio"]')?.closest(".tier")?.querySelector(".tier__price")?.textContent.replace(/\\s+/g, " ") || ""`)).includes("₹6,999 one-time"));
check("pay: no $ price on payable cards", !(await evalJs(`/\\$\\d/.test(document.querySelector(".tiers")?.textContent || "")`)) || (await evalJs(`document.querySelector(".tier:last-of-type .tier__price").textContent`)) === "Custom");
check("pay: enterprise card untouched", (await evalJs(`document.querySelector(".tier:last-of-type .btn")?.getAttribute("href")`)) === "#engage");
```

- [x] **Step 2: Run to verify failure**

Run: `npm run build && npm run smoke`
Expected: `FAIL  pay: heading says Start for ₹5`, `FAIL  pay: hobby card ₹5 one-time`, `FAIL  pay: studio card ₹6,999 one-time` (existing checks all PASS; exit 1).

- [x] **Step 3: Edit the cards**

In `src/index.html`:

Heading (line 222):
```html
<h2 class="section__title" data-lines data-weight>Start for ₹5. Scale when your agents earn it.</h2>
```

Hobby card — replace price line and CTA:
```html
<p class="tier__price">₹5<span> one-time</span></p>
```
```html
<button type="button" class="btn btn--ghost" data-plan="hobby" data-probe>Get access</button>
```

Studio card — replace price line and CTA:
```html
<p class="tier__price">₹6,999<span> one-time</span></p>
```
```html
<button type="button" class="btn btn--signal" data-plan="studio" data-probe="DEPLOY">Get access</button>
```

Enterprise card: no changes.

- [x] **Step 4: Run to verify pass**

Run: `npm run build && npm run smoke`
Expected: **ALL PASS** (the 5 new checks included).

- [x] **Step 5: Commit**

```bash
git add src/index.html scripts/smoke.mjs
git commit -m "feat: tier cards show real one-time ₹ prices (sanctioned copy change)"
```

---

### Task 2: Checkout modal — markup, styles, open/close/populate

**Files:**
- Modify: `src/index.html` (modal markup after the ENGAGE section, before end of file)
- Modify: `src/assets/css/styles.css` (new section between PLANS and ENGAGE, i.e. after line 429)
- Create: `src/assets/js/payments.js`
- Modify: `src/assets/js/main.js` (import + init)
- Test: `scripts/smoke.mjs` (section 6 continues)

**Interfaces:**
- Consumes: `button[data-plan]` CTAs from Task 1.
- Produces: `export function initPayments()`; `PLANS` object `{ hobby|studio: { name, tag, amount /*paise*/, display, description, benefits[] } }`; DOM ids `#paywrap #payPlanName #payPlanTag #payPrice #payBenefits #payNoteAmount #payForm #payName #payEmail #payPhone #payErr #payBtn #passCanvas #okPlan #okPassId #okMailNote #payDownload #payDone`; stages `[data-stage="form"]` / `[data-stage="success"]`; internal fns later tasks extend: `openModal(key)`, `closeModal()`.

- [x] **Step 1: Add failing smoke checks**

Append to section 6 in `scripts/smoke.mjs`:

```js
// modal opens, populated from PLANS
await evalJs(`document.querySelector('button[data-plan="studio"]').click()`);
await sleep(500);
check("pay: modal opens", !(await evalJs(`document.getElementById("paywrap").hidden`)));
check("pay: modal is dialog", (await evalJs(`document.querySelector(".paymodal").getAttribute("aria-modal")`)) === "true");
check("pay: plan name", (await evalJs(`document.getElementById("payPlanName").textContent`)) === "Studio");
check("pay: modal price", (await evalJs(`document.getElementById("payPrice").textContent`)).includes("₹6,999"));
check("pay: benefits ≥ 8", (await evalJs(`document.querySelectorAll("#payBenefits li").length`)) >= 8, String(await evalJs(`document.querySelectorAll("#payBenefits li").length`)));
check("pay: honest note", (await evalJs(`document.querySelector(".paymodal__note").textContent.replace(/\\s+/g, " ")`)).includes("AXON is a design showcase. This is a genuine ₹6,999 payment"));
check("pay: focus inside modal", await evalJs(`document.querySelector(".paymodal").contains(document.activeElement)`));
check("pay: body scroll locked", await evalJs(`document.body.classList.contains("pay-open")`));
// Esc closes, focus returns
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
await sleep(300);
check("pay: Escape closes", await evalJs(`document.getElementById("paywrap").hidden`));
check("pay: focus returns to CTA", await evalJs(`document.activeElement === document.querySelector('button[data-plan="studio"]')`));
// backdrop click closes; hobby populates too
await evalJs(`document.querySelector('button[data-plan="hobby"]').click()`);
await sleep(300);
check("pay: hobby price", (await evalJs(`document.getElementById("payPrice").textContent`)).includes("₹5"));
await evalJs(`document.querySelector(".paywrap__backdrop").click()`);
await sleep(300);
check("pay: backdrop closes", await evalJs(`document.getElementById("paywrap").hidden`));
```

- [x] **Step 2: Run to verify failure**

Run: `npm run build && npm run smoke`
Expected: FAILs on all new "pay: modal…" checks (Task 1 checks still PASS).

- [x] **Step 3: Add modal markup**

In `src/index.html`, after the closing `</section>` of the ENGAGE section (end of file):

```html
    <!-- ░░ SIG.07a · CHECKOUT MODAL (Razorpay supporter pass) ░░ -->
    <div class="paywrap" id="paywrap" hidden>
      <div class="paywrap__backdrop" data-pay-close></div>
      <div class="paymodal" role="dialog" aria-modal="true" aria-labelledby="payTitle">
        <button type="button" class="paymodal__x" data-pay-close aria-label="Close checkout">✕</button>

        <div class="paymodal__stage" data-stage="form">
          <p class="eyebrow">[ SIG.07 · CHECKOUT ]</p>
          <header class="paymodal__head">
            <h3 id="payTitle"><span id="payPlanName">—</span></h3>
            <span class="tier__tag" id="payPlanTag">[ — ]</span>
          </header>
          <p class="tier__price"><span id="payPrice">—</span><span> · one-time</span></p>
          <ul class="paymodal__benefits" id="payBenefits"></ul>
          <form class="paymodal__form" id="payForm">
            <input type="text" id="payName" name="name" placeholder="Full name" aria-label="Full name" autocomplete="name" required minlength="2" />
            <input type="email" id="payEmail" name="email" placeholder="you@company.com" aria-label="Email address" autocomplete="email" required />
            <input type="tel" id="payPhone" name="phone" placeholder="Phone (10 digits)" aria-label="Phone number" autocomplete="tel" required pattern="[0-9+ -]{10,15}" />
            <p class="paymodal__note">AXON is a design showcase. This is a genuine <span id="payNoteAmount">₹—</span> payment for an AXON Supporter Pass, delivered by email — no software product is provided.</p>
            <p class="paymodal__err" id="payErr" role="alert" hidden></p>
            <button type="submit" class="btn btn--signal" id="payBtn" data-probe="PAY">Pay ₹—</button>
          </form>
        </div>

        <div class="paymodal__stage" data-stage="success" hidden>
          <p class="eyebrow">[ SIG.07 · CONFIRMED ]</p>
          <h3 class="paymodal__oktitle">Signal received.</h3>
          <p class="paymodal__okline">Your <b id="okPlan">—</b> Supporter Pass is issued. Pass ID <b id="okPassId">—</b></p>
          <canvas class="paymodal__pass" id="passCanvas" width="1200" height="675" aria-label="Your AXON Supporter Pass"></canvas>
          <p class="paymodal__mailnote" id="okMailNote" role="status">A confirmation email with your benefits is on its way.</p>
          <div class="paymodal__actions">
            <button type="button" class="btn btn--signal" id="payDownload">Download pass</button>
            <button type="button" class="btn btn--ghost" id="payDone" data-pay-close>Done</button>
          </div>
        </div>
      </div>
    </div>
```

- [x] **Step 4: Add modal CSS**

In `src/assets/css/styles.css`, insert between the PLANS section (ends line 429) and the ENGAGE section header (line 431):

```css
/* ============================================================
   CHECKOUT MODAL (Razorpay supporter pass)
   ============================================================ */
.paywrap { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 1.2rem; }
.paywrap[hidden] { display: none; }
.paywrap__backdrop { position: absolute; inset: 0; background: rgba(7, 8, 10, 0.78); backdrop-filter: blur(6px); }
.paymodal { position: relative; z-index: 1; width: min(560px, 100%); max-height: min(86vh, 780px); overflow: auto; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 14px; padding: 2rem; }
.paymodal__stage { display: flex; flex-direction: column; gap: 1rem; }
.paymodal__stage[hidden] { display: none; }
.paymodal__x { position: absolute; top: 0.9rem; right: 0.9rem; width: 2rem; height: 2rem; background: none; border: 1px solid var(--line); border-radius: 6px; color: var(--muted); font-family: var(--mono); font-size: 0.8rem; cursor: pointer; transition: border-color 0.3s var(--ease), color 0.3s var(--ease); }
.paymodal__x:hover { color: var(--text); border-color: var(--line-strong); }
.paymodal__head { display: flex; align-items: baseline; justify-content: space-between; }
.paymodal__head h3 { font-family: var(--display); font-weight: 600; font-size: 1.5rem; }
.paymodal__benefits { display: flex; flex-direction: column; gap: 0.55rem; }
.paymodal__benefits li { font-size: 0.9rem; color: var(--text-dim); padding-left: 1.4rem; position: relative; }
.paymodal__benefits li::before { content: "▸"; position: absolute; left: 0; color: var(--signal); font-size: 0.8rem; }
.paymodal__form { display: flex; flex-direction: column; gap: 0.6rem; }
.paymodal__form input { background: var(--bg-soft); border: 1px solid var(--line-strong); border-radius: 4px; padding: 0.8rem 1.1rem; color: var(--text); font-family: var(--mono); font-size: 0.88rem; }
.paymodal__form input:focus { outline: none; border-color: var(--signal); }
.paymodal__note { font-family: var(--mono); font-size: 0.74rem; color: var(--faint); border-left: 2px solid var(--line-strong); padding-left: 0.8rem; }
.paymodal__err { font-family: var(--mono); font-size: 0.8rem; color: var(--warn); }
.paymodal__err a { color: var(--signal); text-decoration: underline; }
.paymodal__oktitle { font-family: var(--display); font-weight: 600; font-size: 1.5rem; }
.paymodal__okline { color: var(--text-dim); font-size: 0.95rem; }
.paymodal__okline b { color: var(--signal); font-weight: 500; font-family: var(--mono); }
.paymodal__pass { width: 100%; height: auto; border: 1px solid var(--line); border-radius: 8px; }
.paymodal__mailnote { font-family: var(--mono); font-size: 0.78rem; color: var(--muted); }
.paymodal__actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.paymodal .btn { justify-content: center; }
body.pay-open { overflow: hidden; }
```

- [x] **Step 5: Create `src/assets/js/payments.js`**

```js
/* ============================================================
   AXON — payments.js · plans checkout (Razorpay) + supporter pass
   ============================================================ */

const RAZORPAY_KEY_ID = ""; // ← paste rzp_test_… for QA, rzp_live_… for deploy (README → Payments)
const EMAILJS_DEFAULT = { serviceId: "", templateId: "", publicKey: "" }; // ← README → Payments
const FALLBACK_HANDLE = "https://razorpay.me/@stackwith";
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

const PLANS = {
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

export function initPayments() {
  const wrap = document.getElementById("paywrap");
  if (!wrap) return;
  const modal = wrap.querySelector(".paymodal");
  const stageForm = wrap.querySelector('[data-stage="form"]');
  const stageOk = wrap.querySelector('[data-stage="success"]');
  const form = document.getElementById("payForm");
  const err = document.getElementById("payErr");
  const payBtn = document.getElementById("payBtn");

  let planKey = null, opener = null;

  const focusables = () =>
    [...modal.querySelectorAll("button, input, a[href]")].filter((el) => el.offsetParent !== null);

  function openModal(key) {
    const plan = PLANS[key];
    if (!plan) return;
    planKey = key;
    opener = document.activeElement;
    document.getElementById("payPlanName").textContent = plan.name;
    document.getElementById("payPlanTag").textContent = plan.tag;
    document.getElementById("payPrice").textContent = plan.display;
    document.getElementById("payNoteAmount").textContent = plan.display;
    payBtn.textContent = "Pay " + plan.display;
    payBtn.removeAttribute("aria-busy");
    const ul = document.getElementById("payBenefits");
    ul.replaceChildren(...plan.benefits.map((b) => {
      const li = document.createElement("li"); li.textContent = b; return li;
    }));
    err.hidden = true; err.replaceChildren();
    stageOk.hidden = true; stageForm.hidden = false;
    wrap.hidden = false;
    document.body.classList.add("pay-open");
    setTimeout(() => document.getElementById("payName").focus(), 50);
  }

  function closeModal() {
    wrap.hidden = true;
    document.body.classList.remove("pay-open");
    if (opener && opener.focus) opener.focus();
  }

  document.querySelectorAll("button[data-plan]").forEach((btn) =>
    btn.addEventListener("click", () => openModal(btn.getAttribute("data-plan"))));
  wrap.querySelectorAll("[data-pay-close]").forEach((el) =>
    el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => {
    if (wrap.hidden) return;
    if (e.key === "Escape") { closeModal(); return; }
    if (e.key !== "Tab") return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}
```

- [x] **Step 6: Wire into `main.js`**

At the top of `src/assets/js/main.js` (after the Lenis import, line 7):

```js
import { initPayments } from "./payments.js";
```

Inside the IIFE, immediately before the final `console.log("%cAXON", …)` line:

```js
  initPayments();
```

- [x] **Step 7: Run to verify pass**

Run: `npm run build && npm run smoke`
Expected: **ALL PASS** (page-load exception checks in section 1 also confirm payments.js parses clean).

- [x] **Step 8: Commit**

```bash
git add src/index.html src/assets/css/styles.css src/assets/js/payments.js src/assets/js/main.js scripts/smoke.mjs
git commit -m "feat: checkout modal — markup, styles, open/close/populate"
```

> Deviation (executed): `openModal(key, trigger)` receives the clicked button and uses it as the focus-return target — `document.activeElement` is `<body>` for mouse/JS clicks, so the plan's original code failed the "focus returns to CTA" check.

---

### Task 3: Buyer form → Razorpay checkout launch

**Files:**
- Modify: `src/assets/js/payments.js`
- Test: `scripts/smoke.mjs` (section 6 continues)

**Interfaces:**
- Consumes: `openModal`/`closeModal`, `#payForm` fields, `PLANS` from Task 2.
- Produces: `launchCheckout(plan, buyer)` where `buyer = { name, email, phone }`; `loadScript(src)`; `showPayError(message, plan, withFallback)`; checkout `options.handler(response)` invoked on success (Task 4 fills in `showSuccess`); `rzp.on("payment.failed", …)` wired (Task 6 extends). Uses `window.Razorpay` if already defined (smoke stub path); options include `key, amount, currency: "INR", name: "AXON", description, prefill: { name, email, contact }, notes: { plan, buyer_name }, theme: { color: "#B8FF3C" }, modal: { ondismiss } `.

- [x] **Step 1: Add failing smoke checks**

Append to section 6 in `scripts/smoke.mjs`:

```js
// checkout launch — stub Razorpay + fetch BEFORE interacting
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
await evalJs(`document.querySelector('button[data-plan="studio"]').click()`);
await sleep(300);
// empty form blocked by native validation
await evalJs(`document.getElementById("payForm").requestSubmit()`);
await sleep(300);
check("pay: empty form blocked", (await evalJs(`window.__rzpCalls.length`)) === 0);
// filled form launches checkout with exact options
await evalJs(`(() => {
  document.getElementById("payName").value = "Smoke Tester";
  document.getElementById("payEmail").value = "smoke@test.dev";
  document.getElementById("payPhone").value = "9999999999";
  document.getElementById("payForm").requestSubmit();
})()`);
await sleep(500);
check("pay: checkout opened", (await evalJs(`window.__rzpOpened`)) === 1);
const rzpOpts = await evalJs(`window.__rzpCalls[0] && { amount: window.__rzpCalls[0].amount, currency: window.__rzpCalls[0].currency, name: window.__rzpCalls[0].name, email: window.__rzpCalls[0].prefill?.email, contact: window.__rzpCalls[0].prefill?.contact, plan: window.__rzpCalls[0].notes?.plan, hasHandler: typeof window.__rzpCalls[0].handler === "function" }`);
check("pay: amount 699900 paise", rzpOpts?.amount === 699900, JSON.stringify(rzpOpts));
check("pay: currency INR", rzpOpts?.currency === "INR");
check("pay: prefill email", rzpOpts?.email === "smoke@test.dev");
check("pay: prefill contact", rzpOpts?.contact === "9999999999");
check("pay: notes.plan studio", rzpOpts?.plan === "studio");
check("pay: success handler wired", rzpOpts?.hasHandler === true);
```

- [x] **Step 2: Run to verify failure**

Run: `npm run build && npm run smoke`
Expected: FAIL on "pay: checkout opened" and the option checks (empty-form check may already pass — native `required` blocks submit even without JS).

- [x] **Step 3: Implement checkout launch in `payments.js`**

Add below `PLANS` (module scope):

```js
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });
}
```

Inside `initPayments()`, add after `closeModal()`:

```js
  function showPayError(message, plan, withFallback) {
    err.replaceChildren(document.createTextNode(message + " "));
    if (withFallback && plan) {
      const a = document.createElement("a");
      a.href = FALLBACK_HANDLE + "/" + Math.round(plan.amount / 100);
      a.target = "_blank"; a.rel = "noopener";
      a.textContent = "Pay via our Razorpay page instead ↗";
      err.appendChild(a);
    }
    err.hidden = false;
    payBtn.removeAttribute("aria-busy");
    payBtn.textContent = plan ? "Pay " + plan.display : "Pay";
  }

  async function launchCheckout(plan, buyer) {
    if (!window.Razorpay) {
      if (!RAZORPAY_KEY_ID) {
        showPayError("Payments aren't live yet — configuration is pending.", plan, true);
        return;
      }
      try { await loadScript(CHECKOUT_SRC); }
      catch { showPayError("Could not reach the payment service. Check your connection and retry.", plan, true); return; }
    }
    const rzp = new window.Razorpay({
      key: RAZORPAY_KEY_ID,
      amount: plan.amount,
      currency: "INR",
      name: "AXON",
      description: plan.description,
      prefill: { name: buyer.name, email: buyer.email, contact: buyer.phone },
      notes: { plan: planKey, buyer_name: buyer.name },
      theme: { color: "#B8FF3C" },
      handler: (response) => showSuccess(plan, buyer, response.razorpay_payment_id),
      modal: { ondismiss: () => { payBtn.removeAttribute("aria-busy"); payBtn.textContent = "Pay " + plan.display; } },
    });
    rzp.on("payment.failed", (resp) => onPaymentFailed(resp, plan));
    rzp.open();
  }

  function showSuccess(plan, buyer, paymentId) {
    // Task 4 replaces this placeholder body with the pass + email flow.
    stageForm.hidden = true; stageOk.hidden = false;
  }

  function onPaymentFailed(resp, plan) {
    // Task 6 replaces this placeholder body with readable errors + fallback.
    showPayError("Payment failed. Please retry.", plan, false);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const plan = PLANS[planKey];
    if (!plan || payBtn.getAttribute("aria-busy") === "true") return;
    err.hidden = true;
    payBtn.setAttribute("aria-busy", "true");
    payBtn.textContent = "OPENING…";
    launchCheckout(plan, {
      name: document.getElementById("payName").value.trim(),
      email: document.getElementById("payEmail").value.trim(),
      phone: document.getElementById("payPhone").value.trim(),
    });
  });
```

- [x] **Step 4: Run to verify pass**

Run: `npm run build && npm run smoke`
Expected: **ALL PASS**.

- [x] **Step 5: Commit**

```bash
git add src/assets/js/payments.js scripts/smoke.mjs
git commit -m "feat: buyer form validates and launches Razorpay checkout"
```

---

### Task 4: Success stage — Supporter Pass canvas + download

**Files:**
- Modify: `src/assets/js/payments.js`
- Test: `scripts/smoke.mjs` (section 6 continues)

**Interfaces:**
- Consumes: `showSuccess(plan, buyer, paymentId)` placeholder from Task 3; success-stage DOM ids from Task 2.
- Produces: real `showSuccess` (fills `#okPlan #okPassId`, renders canvas, triggers email dispatch via `sendBenefitsEmail` — Task 5 provides it; until then `showSuccess` calls it guarded: `typeof sendBenefitsEmail === "function"` is NOT used — instead Task 4 includes a stub `sendBenefitsEmail` returning `Promise.reject()` that Task 5 replaces); `renderPass(plan, buyer, passId)` → boolean; `downloadPass(passId)`.

- [x] **Step 1: Add failing smoke checks**

Append to section 6 in `scripts/smoke.mjs` (continues from Task 3's state — checkout was launched, `window.__rzpCalls[0].handler` is callable):

```js
// synthetic success → pass rendered
await evalJs(`window.__rzpCalls[0].handler({ razorpay_payment_id: "pay_SMOKE1234567890" })`);
await sleep(700);
check("pay: success stage shown", !(await evalJs(`document.querySelector('[data-stage="success"]').hidden`)));
check("pay: form stage hidden", await evalJs(`document.querySelector('[data-stage="form"]').hidden`));
check("pay: pass id shown", (await evalJs(`document.getElementById("okPassId").textContent`)) === "pay_SMOKE1234567890");
check("pay: plan named on success", (await evalJs(`document.getElementById("okPlan").textContent`)) === "Studio");
check("pay: pass canvas painted", (await evalJs(`document.getElementById("passCanvas").toDataURL("image/png").length`)) > 20000);
check("pay: download button visible", await evalJs(`!document.getElementById("payDownload").hidden`));
```

- [x] **Step 2: Run to verify failure**

Run: `npm run build && npm run smoke`
Expected: FAIL on "pay: pass id shown", "pay: pass canvas painted" (stage checks pass via Task 3's placeholder).

- [x] **Step 3: Implement pass rendering**

In `payments.js`, replace the placeholder `showSuccess` and add the render/download/email-stub functions inside `initPayments()`:

```js
  function sendBenefitsEmail(plan, buyer, passId) {
    return Promise.reject(new Error("email not configured")); // Task 5 replaces
  }

  function renderPass(plan, buyer, passId) {
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
  function showSuccess(plan, buyer, paymentId) {
    lastPassId = paymentId;
    document.getElementById("okPlan").textContent = plan.name;
    document.getElementById("okPassId").textContent = paymentId;
    const drew = renderPass(plan, buyer, paymentId);
    document.getElementById("payDownload").hidden = !drew;
    document.getElementById("passCanvas").hidden = !drew;
    stageForm.hidden = true; stageOk.hidden = false;
    const note = document.getElementById("okMailNote");
    note.textContent = "A confirmation email with your benefits is on its way.";
    sendBenefitsEmail(plan, buyer, paymentId).catch(() => {
      note.textContent = "Email delivery delayed — your pass ID above is your proof of purchase.";
    });
  }

  document.getElementById("payDownload").addEventListener("click", () => downloadPass(lastPassId));
```

(The `showSuccess` placeholder from Task 3 is deleted; `handler:` in `launchCheckout` already points here.)

- [x] **Step 4: Run to verify pass**

Run: `npm run build && npm run smoke`
Expected: **ALL PASS**.

- [x] **Step 5: Commit**

```bash
git add src/assets/js/payments.js scripts/smoke.mjs
git commit -m "feat: success stage renders downloadable Supporter Pass"
```

> Deviation (executed): the "pass canvas painted" smoke check samples pixel (100,100) for the pass background #"07080A" instead of asserting toDataURL().length > 20000 — headless SwiftShader PNG encoding made the size heuristic unreliable.

---

### Task 5: EmailJS benefits email

**Files:**
- Modify: `src/assets/js/payments.js`
- Test: `scripts/smoke.mjs` (section 6 continues)

**Interfaces:**
- Consumes: `sendBenefitsEmail` stub from Task 4, `EMAILJS_DEFAULT` from Task 2, `window.__axonEmailCfg` override hook (set by smoke in Task 3's stub block).
- Produces: real `sendBenefitsEmail(plan, buyer, passId)` → Promise; POST `https://api.emailjs.com/api/v1.0/email/send` with `{ service_id, template_id, user_id, template_params: { to_name, to_email, plan_name, amount, pass_id, benefits } }`.

- [x] **Step 1: Add failing smoke checks**

Append to section 6 (the success handler already fired in Task 4 with `__axonEmailCfg` set and `fetch` stubbed):

```js
// EmailJS request captured by the fetch stub
const mail = await evalJs(`window.__fetches.find((f) => f.url.includes("api.emailjs.com"))`);
check("pay: emailjs request sent", !!mail, JSON.stringify(await evalJs(`window.__fetches.map((f) => f.url)`)));
const mailBody = mail ? JSON.parse(mail.body) : {};
check("pay: emailjs service/template", mailBody.service_id === "svc_smoke" && mailBody.template_id === "tpl_smoke" && mailBody.user_id === "pub_smoke", mail && mail.body);
check("pay: emailjs to_email", mailBody.template_params?.to_email === "smoke@test.dev");
check("pay: emailjs pass_id", mailBody.template_params?.pass_id === "pay_SMOKE1234567890");
check("pay: emailjs benefits included", String(mailBody.template_params?.benefits || "").includes("Priority trace lanes"));
check("pay: mail note optimistic", (await evalJs(`document.getElementById("okMailNote").textContent`)).includes("on its way"));
```

- [x] **Step 2: Run to verify failure**

Run: `npm run build && npm run smoke`
Expected: FAIL "pay: emailjs request sent" (stub rejects without fetching). Note: "pay: mail note optimistic" will also FAIL right now (stub rejection flips the note) — that's expected.

- [x] **Step 3: Implement `sendBenefitsEmail`**

Replace the Task 4 stub inside `initPayments()`:

```js
  function sendBenefitsEmail(plan, buyer, passId) {
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
```

- [x] **Step 4: Run to verify pass**

Run: `npm run build && npm run smoke`
Expected: **ALL PASS** (stubbed fetch returns 200 → optimistic note stays).

- [x] **Step 5: Commit**

```bash
git add src/assets/js/payments.js scripts/smoke.mjs
git commit -m "feat: EmailJS benefits email on payment success"
```

---

### Task 6: Failure paths — readable errors + razorpay.me fallback

**Files:**
- Modify: `src/assets/js/payments.js`
- Test: `scripts/smoke.mjs` (section 6 continues)

**Interfaces:**
- Consumes: `onPaymentFailed` placeholder from Task 3, `showPayError` from Task 3, `window.__rzpFail` captured by the smoke stub.
- Produces: final `onPaymentFailed(resp, plan)` — shows Razorpay's `error.description` when present; offers the `razorpay.me/@stackwith/{rupees}` fallback link from the **second** failure in a modal session; `failCount` resets on `openModal`.

- [x] **Step 1: Add failing smoke checks**

Append to section 6:

```js
// failure path: readable error, fallback link on 2nd failure
await evalJs(`document.getElementById("payDone").click()`); // close success modal
await sleep(300);
await evalJs(`document.querySelector('button[data-plan="hobby"]').click()`);
await sleep(300);
await evalJs(`(() => {
  document.getElementById("payName").value = "Smoke Tester";
  document.getElementById("payEmail").value = "smoke@test.dev";
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
```

- [x] **Step 2: Run to verify failure**

Run: `npm run build && npm run smoke`
Expected: FAIL "pay: failure reason shown" (placeholder shows generic text), FAIL "pay: fallback link on 2nd failure".

- [x] **Step 3: Implement final failure handling**

In `payments.js`: add `let failCount = 0;` next to `let planKey = null, opener = null;`, set `failCount = 0;` inside `openModal` (next to `err.hidden = true`), and replace the Task 3 placeholder:

```js
  function onPaymentFailed(resp, plan) {
    failCount++;
    const reason = resp && resp.error && resp.error.description
      ? resp.error.description
      : "Payment could not be completed.";
    showPayError(reason + " You can retry.", plan, failCount >= 2);
  }
```

- [x] **Step 4: Run to verify pass**

Run: `npm run build && npm run smoke`
Expected: **ALL PASS**.

- [x] **Step 5: Commit**

```bash
git add src/assets/js/payments.js scripts/smoke.mjs
git commit -m "feat: readable payment errors + razorpay.me fallback link"
```

---

### Task 7: Docs, QA baselines, project state

**Files:**
- Modify: `README.md` (new "Payments" section), `CLAUDE.md` (current state)
- Test: full `npm run build && npm run smoke`, then `npm run qa`

**Interfaces:**
- Consumes: everything shipped in Tasks 1–6.
- Produces: operator documentation the user follows for Task 8.

- [ ] **Step 1: Add README "Payments (Razorpay + EmailJS)" section**

Append to `README.md`:

```markdown
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
```

- [ ] **Step 2: Update `CLAUDE.md`**

In the "Current state" section: replace the "Next feature (requested 2026-07-06, not started)" paragraph with a line noting the pricing feature is implemented per `docs/superpowers/plans/2026-07-06-razorpay-pricing-plans.md`, pending user config (`RAZORPAY_KEY_ID`, `EMAILJS_DEFAULT` in `src/assets/js/payments.js`) and the live ₹5 verification. Add to "Standing decisions": tier cards now show ₹5/₹6,999 one-time (sanctioned 2026-07-06); payments modal + smoke section 6 exist; `window.__axonEmailCfg` is a QA/smoke hook — do not remove.

- [ ] **Step 3: Full verification + fresh QA baselines**

Run: `npm run build && npm run smoke`
Expected: **ALL PASS**.
Run: `npm run qa`
Expected: new baseline screenshots in `/tmp` (tier-card changes are sanctioned; eyeball desktop + mobile shots for layout breakage before accepting).

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: payments setup guide (Razorpay + EmailJS) + project state"
```

---

### Task 8: Rollout (user-gated — needs keys)

**Files:**
- Modify: `src/assets/js/payments.js` (paste real config values only)

**Interfaces:**
- Consumes: README → Payments instructions from Task 7; values only the user can provide.

- [ ] **Step 1: User provides test config**

Ask the user for: `rzp_test_…` key, EmailJS service/template/public IDs (README steps). Paste into `payments.js` constants.

- [ ] **Step 2: Test-mode QA**

Run: `npm run build && npm run smoke` → ALL PASS. Then `npx serve _site` (or `npm run dev`) and manually: both tiers end-to-end with test card `4111 1111 1111 1111` (any future expiry, any CVV) — verify checkout opens with correct amount, success pass renders + downloads, EmailJS mail arrives at a real inbox, `payment.failed` path via test failure card shows reason + fallback link on retry.

- [ ] **Step 3: Go live**

Swap `RAZORPAY_KEY_ID` to `rzp_live_…`. Run `npm run build && npm run smoke` → ALL PASS. Commit:

```bash
git add src/assets/js/payments.js
git commit -m "feat: live Razorpay + EmailJS configuration"
git push
```

- [ ] **Step 4: Live verification**

After Pages deploy: one real ₹5 Hobby purchase on https://stackwith.me (user's own card/UPI), confirm dashboard shows payment **captured** + notes `{plan, buyer_name}`, email received, then refund from the Razorpay dashboard. If live checkout rejects order-less payments (`order_id` required error): stop and revisit the spec's documented Cloudflare Worker fallback.

- [ ] **Step 5: Close out**

Update `CLAUDE.md` current-state (feature live, date), commit and push.
