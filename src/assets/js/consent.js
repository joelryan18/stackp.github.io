/* AXON — consent.js · cookie-consent banner + consent-gated AdSense loader
   The AdSense script is ONLY injected after explicit "Accept all" consent
   (or a stored "all" choice from a previous visit). "Essential only" never
   loads it. Not a full IAB TCF CMP — see README "Consent architecture". */
(() => {
  "use strict";
  const ADS_CLIENT = "ca-pub-7262404901375077";

  const loadAds = () => {
    if (document.getElementById("adsbygoogle-js")) return;
    const s = document.createElement("script");
    s.id = "adsbygoogle-js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + ADS_CLIENT;
    document.head.appendChild(s);
  };

  let stored = null;
  try { stored = localStorage.getItem("axon-consent"); } catch (e) { /* private mode */ }
  if (stored === "all") loadAds();
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
      if (val === "all") loadAds();
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
