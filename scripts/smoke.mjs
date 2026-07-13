// Smoke tests: serve _site, drive headless Chrome over CDP, assert behavior.
// Usage: node scripts/smoke.mjs   (exits 1 on any failure)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = "_site";
const PORT = 8123;
const CDP_PORT = 9333;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.SMOKE_BASE || `http://localhost:${PORT}`;

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".xml": "application/xml", ".txt": "text/plain", ".json": "application/json", ".mp4": "video/mp4", ".glb": "model/gltf-binary", ".ktx2": "image/ktx2", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
});
if (!process.env.SMOKE_BASE) {
  if (!existsSync(ROOT)) { console.error(`no ${ROOT}/ — run the build first`); process.exit(1); }
  await new Promise((r) => server.listen(PORT, r));
}

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${CDP_PORT}`, "--window-size=1440,900",
  "--hide-scrollbars", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
  "--no-first-run", `--user-data-dir=/tmp/axon-smoke-profile-${Date.now()}`, "about:blank",
], { stdio: "ignore" });

async function wsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome CDP not ready");
}
const ws = new WebSocket(await wsUrl());
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });

let mid = 0; const pending = new Map(); const exceptions = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
  if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params?.exceptionDetails?.text || "exception");
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++mid; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });

const targets = await send("Target.getTargets");
const pageT = targets.targetInfos.find((t) => t.type === "page");
const { sessionId } = await send("Target.attachToTarget", { targetId: pageT.targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable"); await S("Runtime.enable");

const evalJs = async (expr) => (await S("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const go = async (url, settle = 2500) => { exceptions.length = 0; await S("Page.navigate", { url }); await sleep(settle); };
const metrics = (w, h, mobile = false) => S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });

let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); if (!ok) failed++; };

/* ---- 1 · every page loads clean, correct head, no ads before consent ---- */
for (const p of ["/", "/axon.html", "/about.html", "/lab.html", "/contact.html", "/privacy.html", "/terms.html", "/checkout.html?plan=hobby", "/anime.html"]) {
  await metrics(1440, 900);
  await go(BASE + p, 3200);
  check(`${p} no JS exceptions`, exceptions.length === 0, JSON.stringify(exceptions.slice(0, 3)));
  check(`${p} title`, !!(await evalJs("document.title")));
  check(`${p} canonical`, !!(await evalJs(`document.querySelector('link[rel="canonical"]')?.href`)));
  check(`${p} og:image absolute`, String(await evalJs(`document.querySelector('meta[property="og:image"]')?.content`)).startsWith("https://stackwith.me/"));
  check(`${p} no adsense before consent`, !(await evalJs(`!!document.querySelector('script[src*="pagead2"]')`)));
  check(`${p} consent banner shown`, await evalJs(`!!document.querySelector('aside.consent')`));
  await evalJs("localStorage.clear()");
}

/* ---- 2 · hub homepage ---- */
await go(BASE + "/", 3000);
check("hub: 3 cards with correct hrefs", (await evalJs(`[...document.querySelectorAll(".hubcard")].map((a) => a.getAttribute("href")).join(",")`)) === "/axon.html,/anime.html,/blog/");
check("hub: title brand", (await evalJs("document.title")).includes("stackwith.me"));
check("hub: no nerve canvas", !(await evalJs(`!!document.querySelector(".nerve")`)));
check("hub: no AXON hero", !(await evalJs(`!!document.querySelector(".hero__title")`)));
check("hub: nav brand is stackwith.me", (await evalJs(`document.querySelector(".nav__word")?.textContent`)) === "STACKWITH.ME");
check("hub: hero CTAs", (await evalJs(`[...document.querySelectorAll(".hub__hero .hub__actions a")].map((a) => a.getAttribute("href")).join(",")`)) === "/axon.html,/blog/");
check("hub: fx canvas present", await evalJs(`!!document.querySelector("canvas.hubfx")`));
check("hub: spectrum 3d booted", await evalJs(`document.body.classList.contains("fx-on")`));
check("hub: hero choreography armed", await evalJs(`document.body.classList.contains("fx-dom") && document.body.classList.contains("hub-in")`));
check("hub: 3 tuner chips excite channels", (await evalJs(`[...document.querySelectorAll(".tuner__chip")].map((a) => a.dataset.ch).join(",")`)) === "0,1,2");
check("hub: about section has substantive copy", (await evalJs(`document.querySelector(".hub__aboutcopy")?.textContent.trim().length`)) >= 400);
check("hub: 3 blog post cards", (await evalJs(`document.querySelectorAll(".postcard").length`)) === 3 && (await evalJs(`[...document.querySelectorAll(".postcard")].every((a) => a.getAttribute("href").startsWith("/blog/"))`)));
check("hub: footer sitemap links", await evalJs(`["/privacy.html","/terms.html","/about.html","/contact.html","/axon.html","/anime.html","/blog/"].every((h) => !!document.querySelector('.hubfoot a[href="' + h + '"]'))`));

/* ---- 2b · axon page runtime ---- */
await go(BASE + "/axon.html", 4000);
check("axon lenis active", await evalJs("!!window.__lenis"));
check("axon gsap anim armed", await evalJs(`document.body.classList.contains("anim")`));
check("axon hero decoded", (await evalJs(`document.querySelector(".hero__title").innerText.replace(/\\s+/g," ").trim()`)) === "The nervous system for your software.");
check("axon no3d not triggered", !(await evalJs(`document.body.classList.contains("no3d")`)));
check("axon --faint token", (await evalJs(`getComputedStyle(document.documentElement).getPropertyValue("--faint").trim().toUpperCase()`)) === "#78828E");
check("axon nav has Home + Stackime", (await evalJs(`[...document.querySelectorAll(".nav__links a")].map((a) => a.textContent).join(",")`)) === "Home,Platform,Process,Pricing,Stackime");

/* ---- 2c · about page (Signal Field v3 in-world instrument journey) ---- */
await go(BASE + "/about.html", 6500);
check("about: fx canvas present", await evalJs(`!!document.querySelector("canvas.aboutfx")`));
check("about: field 3d booted", await evalJs(`document.body.classList.contains("fx-on")`));
check("about: choreography armed", await evalJs(`document.body.classList.contains("fx-dom")`));
check("about: verbs marquee present", await evalJs(`!!document.querySelector(".ab-marquee__track")`));
check("about: HUD readout mounted", await evalJs(`/^0[1-6] \\//.test(document.getElementById("abReadout")?.textContent || "")`));
check("about: pulse underline drawn", await evalJs(`!!document.querySelector(".ab-pulsesvg path")`));
check("about: boot loader auto-dismisses", !(await evalJs(`!!document.getElementById("abIntro")`)) || (await evalJs(`document.getElementById("abIntro").classList.contains("is-done")`)));
check("about: hero manifesto present", (await evalJs(`document.querySelector(".ab-hero .ab-display")?.innerText.replace(/\\s+/g," ").trim()`)) === "We build software with a pulse.");
check("about: 3 work rows with correct hrefs", (await evalJs(`[...document.querySelectorAll(".ab-row")].map((a) => a.getAttribute("href")).join(",")`)) === "/axon.html,/anime.html,/blog/");
check("about: 4 principles", (await evalJs(`document.querySelectorAll(".ab-principle").length`)) === 4);
check("about: substantive copy", (await evalJs(`[...document.querySelectorAll(".ab-copy, .ab-sub")].map((n) => n.textContent).join("").trim().length`)) >= 400);
check("about: chapter rail built", (await evalJs(`document.querySelectorAll(".ab-rail__dot").length`)) === 6);
check("about: contact CTA", (await evalJs(`document.querySelector(".ab-cta__btn")?.getAttribute("href")`)) === "/contact.html");
check("about: footer sitemap links", await evalJs(`["/privacy.html","/terms.html","/about.html","/contact.html","/axon.html","/anime.html","/blog/"].every((h) => !!document.querySelector('.hubfoot a[href="' + h + '"]'))`));
check("about: sound toggle mounted", await evalJs(`!!document.getElementById("abSound")`));
check("about: sound toggle flips", await evalJs(`(() => { const b = document.getElementById("abSound"); b.click(); const on = b.getAttribute("aria-pressed") === "true"; b.click(); return on; })()`));
check("about: in-world type booted", await evalJs(`new Promise((res) => { const t0 = Date.now(); const poll = () => document.body.classList.contains("ab-type-on") ? res(true) : (Date.now() - t0 > 9000 ? res(false) : setTimeout(poll, 250)); poll(); })`));

/* ---- 2d · lab page (Deep Signal — baked-asset WebGL descent) ---- */
await go(BASE + "/lab.html", 4000);
check("lab: fx canvas present", await evalJs(`!!document.querySelector("canvas.labfx")`));
// glb + ktx2 load async — poll for the boot class instead of a fixed sleep
check("lab: world booted from baked assets", await evalJs(`new Promise((res) => { const t0 = Date.now(); const poll = () => document.body.classList.contains("fx-on") ? res(true) : (document.body.classList.contains("lab-no3d") || Date.now() - t0 > 15000 ? res(false) : setTimeout(poll, 250)); poll(); })`));
check("lab: boot loader auto-dismisses", await evalJs(`new Promise((res) => { const t0 = Date.now(); const poll = () => { const i = document.getElementById("labIntro"); (!i || i.classList.contains("is-done")) ? res(true) : (Date.now() - t0 > 12000 ? res(false) : setTimeout(poll, 250)); }; poll(); })`));
check("lab: in-world type booted", await evalJs(`new Promise((res) => { const t0 = Date.now(); const poll = () => document.body.classList.contains("lab-type-on") ? res(true) : (Date.now() - t0 > 9000 ? res(false) : setTimeout(poll, 250)); poll(); })`));
check("lab: HUD readout mounted", await evalJs(`/^0[0-4] \\//.test(document.getElementById("labReadout")?.textContent || "")`));
check("lab: scroll track is a descent", await evalJs(`document.documentElement.scrollHeight >= innerHeight * 4.5`));
check("lab: draco glb served", await evalJs(`fetch("/assets/3d/lab-crystals.glb").then(async (r) => r.ok && (await r.arrayBuffer()).byteLength > 4000)`));
check("lab: ktx2 matcap served", await evalJs(`fetch("/assets/3d/lab-matcap.ktx2").then((r) => r.ok)`));
check("lab: draco decoder served", await evalJs(`fetch("/assets/3d/draco/draco_decoder.wasm").then((r) => r.ok)`));
check("lab: basis transcoder served", await evalJs(`fetch("/assets/3d/basis/basis_transcoder.wasm").then((r) => r.ok)`));
check("lab: sound toggle mounted", await evalJs(`!!document.getElementById("labSound")`));
check("lab: sound toggle flips", await evalJs(`(() => { const b = document.getElementById("labSound"); b.click(); const on = b.getAttribute("aria-pressed") === "true"; b.click(); return on; })()`));
check("lab: fallback article substantive", (await evalJs(`document.querySelector(".lab-fallback")?.textContent.trim().length`)) >= 400);
check("lab: end card links", (await evalJs(`[...document.querySelectorAll(".lab-end a")].map((a) => a.getAttribute("href")).join(",")`)) === "/about.html,/");
await evalJs(`(() => { const y = document.documentElement.scrollHeight - innerHeight; scrollTo(0, y); window.__labLenis && window.__labLenis.scrollTo(y, { immediate: true }); })()`);
await sleep(1800);
check("lab: descent reaches RESURFACE", (await evalJs(`document.getElementById("labReadout")?.textContent`)) === "04 / RESURFACE", String(await evalJs(`document.getElementById("labReadout")?.textContent`)));
check("lab: end card goes live", await evalJs(`document.getElementById("labEnd").classList.contains("is-live")`));
await evalJs(`scrollTo(0, 0); window.__labLenis && window.__labLenis.scrollTo(0, { immediate: true })`);

/* ---- 3 · consent gating ---- */
await evalJs("localStorage.clear()");
await go(BASE + "/", 2500);
await evalJs(`document.querySelector(".consent .btn--ghost").click()`); // Essential only
await sleep(400);
check("essential → stored", (await evalJs(`localStorage.getItem("axon-consent")`)) === "essential");
check("essential → no ads script", !(await evalJs(`!!document.querySelector('script[src*="pagead2"]')`)));
await go(BASE + "/", 2500);
check("essential persists, no banner", !(await evalJs(`!!document.querySelector("aside.consent")`)));
check("essential persists, still no ads", !(await evalJs(`!!document.querySelector('script[src*="pagead2"]')`)));
await evalJs("localStorage.clear()");
await go(BASE + "/", 2500);
await evalJs(`document.querySelector(".consent .btn--signal").click()`); // Accept all
await sleep(400);
check("accept → ads script injected", await evalJs(`!!document.querySelector('script[src*="pagead2"]')`));
await go(BASE + "/", 2500);
check("accept persists → ads on load", await evalJs(`!!document.querySelector('script[src*="pagead2"]')`));
await evalJs("localStorage.clear()");

/* ---- 4 · mobile menu a11y ---- */
await metrics(390, 844, true);
await go(BASE + "/axon.html", 3000);
check("mobile: burger visible", await evalJs(`getComputedStyle(document.getElementById("burger")).display !== "none"`));
check("mobile: closed menu hidden", (await evalJs(`getComputedStyle(document.getElementById("menu")).visibility`)) === "hidden");
await evalJs(`document.getElementById("burger").click()`);
await sleep(600);
check("mobile: menu opens", await evalJs(`document.getElementById("menu").classList.contains("is-open")`));
check("mobile: focus moved into menu", await evalJs(`document.getElementById("menu").contains(document.activeElement)`));
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
await sleep(600);
check("mobile: Escape closes menu", !(await evalJs(`document.getElementById("menu").classList.contains("is-open")`)));
check("mobile: focus returned to burger", await evalJs(`document.activeElement === document.getElementById("burger")`));

/* ---- 5 · form (endpoint unset → honest inline success) ---- */
await metrics(1440, 900);
await go(BASE + "/axon.html", 3000);
await evalJs(`(() => { const f = document.querySelector(".engage__form"); f.querySelector("input").value = "smoke@test.dev"; f.requestSubmit(); })()`);
await sleep(1200);
const okText = await evalJs(`document.querySelector(".engage__ok")?.textContent || ""`);
check("form: honest success shown", okText.includes("on the list"), okText);
check("form: no inbox promise", !okText.toLowerCase().includes("inbox"), okText);

/* ---- 6 · plans → checkout page purchase flow ---- */
await metrics(1440, 900);
await go(BASE + "/axon.html", 3000);
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
check("pay: done links to plans", (await evalJs(`document.getElementById("payDone").getAttribute("href")`)) === "/axon.html#plans");

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

/* ---- 6b · checkout page: sign-in gate ---- */
await metrics(1440, 900);
// invalid plan bounces to the plans section
await go(BASE + "/checkout.html?plan=nope", 2500);
check("gate: invalid plan redirects", (await evalJs("location.pathname + location.hash")) === "/axon.html#plans");
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
// live Supabase config must ship in the bundle (constants were empty pre-rollout)
const checkoutBundle = await readFile(path.join(ROOT, JSON.parse(await readFile("src/_data/assets.json", "utf8")).checkout), "utf8");
check("gate: live supabase config shipped", checkoutBundle.includes("https://jldzkjihbekxqxagkame.supabase.co") && checkoutBundle.includes("sb_publishable_"));
// hook-forced empty config → honest error + fallback link (safety-net path, kept deterministic)
const { identifier: unconfPreload } = await S("Page.addScriptToEvaluateOnNewDocument", { source: `window.__axonAuthCfg = { url: "", key: "" };` });
await go(BASE + "/checkout.html?plan=studio", 3000);
await evalJs(`document.querySelector('button[data-auth="google"]').click()`);
await sleep(300);
check("gate: unconfigured error", (await evalJs(`document.getElementById("authErr").textContent`)).includes("isn't configured yet"));
check("gate: fallback link", (await evalJs(`document.querySelector("#authErr a")?.href || ""`)) === "https://razorpay.me/@stackwith/6999");
// email mode toggle
await evalJs(`document.getElementById("authToggle").click()`);
check("gate: toggle flips to signup", (await evalJs(`document.getElementById("authSubmit").textContent`)) === "Create account");
await S("Page.removeScriptToEvaluateOnNewDocument", { identifier: unconfPreload });
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

/* ---- 7 · anime list (community tracker) ---- */
// stub the network BEFORE anime.js boots: Supabase REST + AniList GraphQL → fixtures
const ANI_ME = "99999999-9999-4999-8999-999999999999";
const ANI_U1 = "11111111-1111-4111-8111-111111111111";
const { identifier: aniStubPreload } = await S("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__writes = [];
  try { sessionStorage.removeItem("stackime-discover-v3"); } catch {} // earlier un-stubbed visits cached REAL AniList data
  const FIX = {
    catalog: [
      { id: 101, title: "Frieren: Beyond Journey's End", title_romaji: "Sousou no Frieren", cover_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587.jpg", episodes: 28, year: 2023, format: "TV", genres: ["Adventure","Fantasy"], created_at: "2026-07-01T00:00:00Z", watchers: 2, avg_score: 9.5, last_activity: "2026-07-07T10:00:00Z" },
      { id: 202, title: "Cowboy Bebop", title_romaji: "Cowboy Bebop", cover_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.jpg", episodes: 26, year: 1998, format: "TV", genres: ["Action","Sci-Fi"], created_at: "2026-06-01T00:00:00Z", watchers: 1, avg_score: 8, last_activity: "2026-07-06T10:00:00Z" },
    ],
    entries101: [
      { id: "e1", user_id: "${ANI_U1}", anime_id: 101, status: "completed", score: 10, progress: 28, updated_at: "2026-07-07T10:00:00Z" },
      { id: "e2", user_id: "22222222-2222-4222-8222-222222222222", anime_id: 101, status: "watching", score: 9, progress: 12, updated_at: "2026-07-06T10:00:00Z" },
    ],
    mine: [
      { id: "m1", user_id: "${ANI_ME}", anime_id: 101, status: "watching", score: 9, progress: 12, updated_at: "2026-07-07T10:00:00Z", anime: { id: 101, title: "Frieren: Beyond Journey's End", cover_url: null, episodes: 28 } },
      { id: "m2", user_id: "${ANI_ME}", anime_id: 202, status: "completed", score: 8, progress: 26, updated_at: "2026-07-06T10:00:00Z", anime: { id: 202, title: "Cowboy Bebop", cover_url: null, episodes: 26 } },
    ],
    profiles: [
      { user_id: "${ANI_U1}", display_name: "Aki" },
      { user_id: "22222222-2222-4222-8222-222222222222", display_name: "Rei" },
    ],
    media: [
      { id: 909, title: { english: "Steins;Gate", romaji: "Steins;Gate" }, coverImage: { large: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx9253.jpg" }, episodes: 24, seasonYear: 2011, format: "TV", genres: ["Sci-Fi","Thriller"], bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/9253.jpg", averageScore: 88, description: "<p>A self-proclaimed mad scientist discovers time travel.</p>" },
      { id: 910, title: { english: null, romaji: "Sousou no Frieren" }, coverImage: { large: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587.jpg" }, episodes: 28, seasonYear: 2023, format: "TV", genres: ["Fantasy"], bannerImage: null, averageScore: 91, description: null },
    ],
    detail101: { trailer: { id: "dQw4w9WgXcQ", site: "youtube" }, episodes: 28, description: "<p>After the party of heroes defeated the Demon King, they restored peace to the land and returned to lives of solitude.</p>" },
  };
  const reply = (status, body) => Promise.resolve(new Response(body, { status, headers: { "content-type": "application/json" } }));
  window.fetch = (url, init) => {
    url = String(url); init = init || {};
    const method = (init.method || "GET").toUpperCase();
    if (url.includes("graphql.anilist.co")) {
      // discover rails query (aliased) vs. title search vs. detail query (Media by ID)
      const body = String(init.body || "");
      if (body.includes("trending:")) return reply(200, JSON.stringify({ data: {
        trending: { media: FIX.media }, latest: { media: FIX.media.slice(0, 1) }, upcoming: { media: FIX.media.slice(1) },
        topRated: { media: FIX.media.slice(0, 1) }, popular: { media: FIX.media.slice(1) },
      } }));
      if (body.includes("Media(id:") && body.includes("trailer")) return reply(200, JSON.stringify({ data: { Media: FIX.detail101 } }));
      return reply(200, JSON.stringify({ data: { Page: { media: FIX.media } } }));
    }
    if (url.includes("/rest/v1/")) {
      if (method === "GET") {
        if (url.includes("anime_catalog")) return reply(200, JSON.stringify(FIX.catalog));
        if (url.includes("anime_entries")) return reply(200, JSON.stringify(url.includes("anime_id=eq.101") ? FIX.entries101 : (url.includes("user_id=eq.") ? FIX.mine : [])));
        if (url.includes("profiles")) return reply(200, JSON.stringify(url.includes("in.%28") || url.includes("in.(") ? FIX.profiles : (url.includes("user_id=eq.${ANI_U1}") ? [FIX.profiles[0]] : [])));
        if (url.includes("/anime?")) return reply(200, JSON.stringify(FIX.catalog.filter((a) => url.includes("id=eq." + a.id)).map(({ watchers, avg_score, last_activity, ...a }) => a)));
        return reply(200, "[]");
      }
      window.__writes.push({ url, method, body: String(init.body || "") });
      return reply(method === "POST" ? 201 : 204, "");
    }
    return reply(200, "{}");
  };
` });

// signed out: catalog browsing, detail view, add → sign-in gate
await metrics(1440, 900);
await go(BASE + "/anime.html", 3000);
check("anime: no JS exceptions", exceptions.length === 0, JSON.stringify(exceptions.slice(0, 3)));
// Stackime intro splash: still playing at 3.0s, gone (fade + remove) by ~4.4s
check("anime: stackime intro painted", await evalJs(`!!document.getElementById("aniIntro") && document.querySelector(".ani-intro__word")?.textContent === "STACKIME"`));
check("anime: intro has 3 fallback frames", (await evalJs(`document.querySelectorAll(".ani-intro__art").length`)) === 3);
check("anime: intro video clipped into letters", await evalJs(`(() => { const v = document.querySelector("foreignObject .ani-intro__video"); return !!v && v.getAttribute("src") === "/assets/video/intro-signal.mp4" && v.muted; })()`));
await sleep(1700);
check("anime: intro auto-dismisses", await evalJs(`!document.getElementById("aniIntro")`));
check("anime: nav Home/Axon/Blog/Stackime", (await evalJs(`[...document.querySelectorAll(".nav__links a")].map((a) => a.textContent).join(",")`)) === "Home,Axon,Blog,Stackime");
check("anime: nav marks Anime current", (await evalJs(`document.querySelector('.nav__links a[aria-current="page"]')?.getAttribute("href")`)) === "/anime.html");
check("anime: overlays not painted on load", await evalJs(`getComputedStyle(document.getElementById("aniAuth")).display === "none" && getComputedStyle(document.getElementById("aniModal")).display === "none"`));
check("anime: catalog renders fixtures", (await evalJs(`document.querySelectorAll(".ani__card").length`)) === 2);
check("anime: sorted by recent activity", (await evalJs(`document.querySelector(".ani__card .ani__cardtitle")?.textContent`)) === "Frieren: Beyond Journey's End");
check("anime: card shows watchers + avg", (await evalJs(`document.querySelector(".ani__card .ani__cardstats")?.textContent.replace(/\\s+/g, " ")`)).includes("watchers 2"));
check("anime: signed out hides My list tab", await evalJs(`document.getElementById("aniTabMine").hidden`));
check("anime: signed out shows nav Sign in", !(await evalJs(`document.getElementById("aniNavAuth").hidden`)));
check("anime: discover rails render", (await evalJs(`document.querySelectorAll(".ani__rail").length`)) === 5);
check("anime: rail cards from AniList", (await evalJs(`document.querySelectorAll(".ani__railcard").length`)) === 6, String(await evalJs(`document.querySelectorAll(".ani__railcard").length`)));
check("anime: spotlight renders top trending", (await evalJs(`document.querySelector(".ani__spottitle")?.textContent`)) === "Steins;Gate");
check("anime: spotlight meta has score", String(await evalJs(`document.querySelector(".ani__spotmeta")?.textContent`)).includes("★ 8.8"));
check("anime: rail scroll arrows wired", (await evalJs(`document.querySelectorAll(".ani__railbtn").length`)) === 10);
await evalJs(`(() => { const f = document.getElementById("aniFilter"); f.value = "cowboy"; f.dispatchEvent(new Event("input", { bubbles: true })); })()`);
await sleep(300);
check("anime: filter narrows catalog", (await evalJs(`document.querySelectorAll(".ani__card").length`)) === 1);
check("anime: filter hides discover rails", await evalJs(`document.getElementById("aniDiscover").hidden`));
await evalJs(`(() => { const f = document.getElementById("aniFilter"); f.value = ""; f.dispatchEvent(new Event("input", { bubbles: true })); })()`);
check("anime: cleared filter restores rails", !(await evalJs(`document.getElementById("aniDiscover").hidden`)));
await evalJs(`document.getElementById("aniAdd").click()`);
await sleep(300);
check("anime: signed-out add opens sign-in", await evalJs(`!document.getElementById("aniAuth").hidden && getComputedStyle(document.getElementById("aniAuth")).display !== "none"`));
check("anime: google sign-in offered", await evalJs(`!!document.querySelector('#aniAuth button[data-auth="google"]')`));
check("anime: email form present", await evalJs(`!!document.getElementById("aniAuthForm")`));
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
await sleep(200);
check("anime: Escape closes sign-in", await evalJs(`document.getElementById("aniAuth").hidden`));
await evalJs(`location.hash = "#a/101"`);
await sleep(700);
check("anime: detail view shown", !(await evalJs(`document.querySelector('.ani__view[data-view="detail"]').hidden`)));
check("anime: detail title", (await evalJs(`document.querySelector(".ani__detailtitle")?.textContent`)) === "Frieren: Beyond Journey's End");
check("anime: detail trailer embed", (await evalJs(`document.querySelector(".ani__trailer")?.src`)).includes("youtube-nocookie.com/embed/dQw4w9WgXcQ"));
check("anime: detail description rendered", (await evalJs(`document.querySelector(".ani__description")?.textContent`)).includes("After the party of heroes"));
check("anime: detail lists watchers", (await evalJs(`document.querySelectorAll(".ani__watcher").length`)) === 2);
check("anime: watcher named via profile", (await evalJs(`document.querySelector(".ani__watcher a")?.textContent`)) === "Aki");
check("anime: watcher links to user list", (await evalJs(`document.querySelector(".ani__watcher a")?.getAttribute("href")`)) === "#u/" + ANI_U1);

// someone else's list is read-only
await evalJs(`location.hash = "#u/${ANI_U1}"`);
await sleep(700);
check("anime: user list shown", !(await evalJs(`document.querySelector('.ani__view[data-view="user"]').hidden`)));
check("anime: user display name", (await evalJs(`document.getElementById("aniUserName").textContent`)) === "Aki");
check("anime: user rows grouped", (await evalJs(`document.querySelectorAll("#aniUserList .ani__group").length`)) === 2);
check("anime: user rows read-only", (await evalJs(`document.querySelectorAll("#aniUserList select").length`)) === 0);

// signed in: AniList search → save entry → my list
const { identifier: aniAuthPreload } = await S("Page.addScriptToEvaluateOnNewDocument", { source: `window.__axonAuthCfg = { session: { user: { id: "${ANI_ME}", email: "smoke@test.dev", user_metadata: { full_name: "Smoke Tester" }, app_metadata: { provider: "google" } } } };` });
await go(BASE + "/anime.html", 3000);
check("anime: signed in shows My list tab", !(await evalJs(`document.getElementById("aniTabMine").hidden`)));
check("anime: signed in hides nav Sign in", await evalJs(`document.getElementById("aniNavAuth").hidden`));
// a discover rail card not yet in the catalog jumps straight to the entry form
await evalJs(`document.querySelector(".ani__railcard").click()`);
await sleep(300);
check("anime: rail card opens entry form", !(await evalJs(`document.getElementById("aniModal").hidden`)) && !(await evalJs(`document.querySelector('.ani__modalstage[data-stage="entry"]').hidden`)));
check("anime: rail pick shows title", (await evalJs(`document.querySelector("#aniPick .ani__picktitle")?.textContent`)) === "Steins;Gate");
await evalJs(`document.getElementById("aniModalClose").click()`);
await sleep(200);
// the spotlight CTA runs the same pick flow
await evalJs(`document.querySelector(".ani__spotadd").click()`);
await sleep(300);
check("anime: spotlight CTA opens entry form", !(await evalJs(`document.getElementById("aniModal").hidden`)) && (await evalJs(`document.querySelector("#aniPick .ani__picktitle")?.textContent`)) === "Steins;Gate");
await evalJs(`document.getElementById("aniModalClose").click()`);
await sleep(200);
await evalJs(`document.getElementById("aniAdd").click()`);
await sleep(300);
check("anime: add opens search modal", !(await evalJs(`document.getElementById("aniModal").hidden`)));
await evalJs(`(() => { const s = document.getElementById("aniSearch"); s.value = "steins"; s.dispatchEvent(new Event("input", { bubbles: true })); })()`);
await sleep(900); // 300ms debounce + render
check("anime: AniList results render", (await evalJs(`document.querySelectorAll(".ani__result").length`)) === 2);
check("anime: result titled", (await evalJs(`document.querySelector(".ani__result .ani__picktitle")?.textContent`)) === "Steins;Gate");
await evalJs(`document.querySelector(".ani__result").click()`);
await sleep(300);
check("anime: pick shows entry form", !(await evalJs(`document.querySelector('.ani__modalstage[data-stage="entry"]').hidden`)));
await evalJs(`(() => { document.getElementById("aniEntryStatus").value = "completed"; document.getElementById("aniEntryScore").value = "10"; document.getElementById("aniEntryProgress").value = "24"; document.getElementById("aniEntryForm").requestSubmit(); })()`);
await sleep(900);
check("anime: no JS exceptions after save", exceptions.length === 0, JSON.stringify(exceptions.slice(0, 3)));
const aniWrites = await evalJs(`window.__writes`);
check("anime: profile auto-created", aniWrites.some((w) => w.method === "POST" && w.url.includes("/rest/v1/profiles") && w.body.includes("Smoke Tester")), JSON.stringify(aniWrites));
check("anime: catalog row upserted", aniWrites.some((w) => w.method === "POST" && w.url.includes("/rest/v1/anime?") && w.body.includes('"id":909') && w.body.includes("Steins;Gate")));
check("anime: entry saved", aniWrites.some((w) => w.method === "POST" && w.url.includes("/rest/v1/anime_entries") && w.body.includes('"anime_id":909') && w.body.includes('"status":"completed"') && w.body.includes('"score":10') && !w.body.includes("user_id")));
check("anime: lands on my list", (await evalJs("location.hash")) === "#mine");
check("anime: my list renders groups", (await evalJs(`document.querySelectorAll("#aniMine .ani__group").length`)) === 2);
check("anime: my rows editable", (await evalJs(`document.querySelectorAll("#aniMine select").length`)) > 0);
check("anime: display name shown", (await evalJs(`document.getElementById("aniMeName").textContent`)) === "Smoke Tester");

// inline edit fires a scoped update
await evalJs(`window.__writes.length = 0`);
await evalJs(`(() => { const s = document.querySelector("#aniMine .ani__rowacts select"); s.value = "completed"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
await sleep(500);
check("anime: inline edit patches entry", await evalJs(`window.__writes.some((w) => w.method === "PATCH" && w.url.includes("/rest/v1/anime_entries") && w.url.includes("id=eq.m1") && w.body.includes('"status":"completed"'))`), JSON.stringify(await evalJs(`window.__writes`)));
check("anime: page indexed (no robots meta)", !(await evalJs(`!!document.querySelector('meta[name="robots"]')`)));
const animeBundle = await readFile(path.join(ROOT, JSON.parse(await readFile("src/_data/assets.json", "utf8")).anime), "utf8");
check("anime: supabase config shipped", animeBundle.includes("https://jldzkjihbekxqxagkame.supabase.co") && animeBundle.includes("sb_publishable_"));
await S("Page.removeScriptToEvaluateOnNewDocument", { identifier: aniAuthPreload });
await S("Page.removeScriptToEvaluateOnNewDocument", { identifier: aniStubPreload });

ws.close(); chrome.kill(); server.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
