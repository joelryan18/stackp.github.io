/* AXON — consent.js · lightweight cookie-consent banner (no dependencies)
   Required for ad-supported pages (e.g. Google AdSense) in GDPR/CCPA regions. */
(() => {
  "use strict";
  let stored = null;
  try { stored = localStorage.getItem("axon-consent"); } catch (e) { /* private mode */ }
  if (stored) return;

  const bar = document.createElement("aside");
  bar.className = "consent";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Cookie consent");

  const msg = document.createElement("p");
  msg.append("[ COOKIES ] We use cookies to analyse traffic and, with your consent, to serve ads. Details in our ");
  const link = document.createElement("a");
  link.href = "/privacy.html";
  link.textContent = "Privacy Policy";
  msg.append(link, ".");

  const acts = document.createElement("div");
  acts.className = "consent__acts";
  const mk = (label, val, cls) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn " + cls;
    b.textContent = label;
    b.addEventListener("click", () => {
      try { localStorage.setItem("axon-consent", val); } catch (e) { /* ignore */ }
      bar.remove();
    });
    return b;
  };
  acts.append(mk("Accept all", "all", "btn--signal"), mk("Essential only", "essential", "btn--ghost"));

  bar.append(msg, acts);
  const mount = () => document.body.appendChild(bar);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
