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
  let authFails = 0; // repeat sign-in failures offer the hosted payment fallback
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
