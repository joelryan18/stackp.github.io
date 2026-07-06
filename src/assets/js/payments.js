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

  let planKey = null, opener = null, failCount = 0;

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
    failCount = 0;
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

  function onPaymentFailed(resp, plan) {
    failCount++;
    const reason = resp && resp.error && resp.error.description
      ? resp.error.description
      : "Payment could not be completed.";
    showPayError(reason + " You can retry.", plan, failCount >= 2);
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
