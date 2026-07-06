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

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });
}

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

  function openModal(key, trigger) {
    const plan = PLANS[key];
    if (!plan) return;
    planKey = key;
    opener = trigger || document.activeElement;
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

  document.querySelectorAll("button[data-plan]").forEach((btn) =>
    btn.addEventListener("click", () => openModal(btn.getAttribute("data-plan"), btn)));
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
