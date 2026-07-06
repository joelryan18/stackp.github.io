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

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain", ".json": "application/json" };
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
for (const p of ["/", "/about.html", "/contact.html", "/privacy.html", "/terms.html"]) {
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

/* ---- 2 · index runtime ---- */
await go(BASE + "/", 4000);
check("index lenis active", await evalJs("!!window.__lenis"));
check("index gsap anim armed", await evalJs(`document.body.classList.contains("anim")`));
check("index hero decoded", (await evalJs(`document.querySelector(".hero__title").innerText.replace(/\\s+/g," ").trim()`)) === "The nervous system for your software.");
check("index no3d not triggered", !(await evalJs(`document.body.classList.contains("no3d")`)));
check("index --faint token", (await evalJs(`getComputedStyle(document.documentElement).getPropertyValue("--faint").trim().toUpperCase()`)) === "#78828E");

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
await go(BASE + "/", 3000);
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
await go(BASE + "/", 3000);
await evalJs(`(() => { const f = document.querySelector(".engage__form"); f.querySelector("input").value = "smoke@test.dev"; f.requestSubmit(); })()`);
await sleep(1200);
const okText = await evalJs(`document.querySelector(".engage__ok")?.textContent || ""`);
check("form: honest success shown", okText.includes("on the list"), okText);
check("form: no inbox promise", !okText.toLowerCase().includes("inbox"), okText);

/* ---- 6 · payments: cards, modal, checkout, pass, email ---- */
await metrics(1440, 900);
await go(BASE + "/", 3000);
check("pay: heading says Start for ₹5", (await evalJs(`document.querySelector(".plans .section__title")?.textContent.replace(/\\s+/g, " ").trim() || ""`)).includes("Start for ₹5"));
check("pay: hobby card ₹5 one-time", (await evalJs(`document.querySelector('button[data-plan="hobby"]')?.closest(".tier")?.querySelector(".tier__price")?.textContent.replace(/\\s+/g, " ") || ""`)).includes("₹5 one-time"));
check("pay: studio card ₹6,999 one-time", (await evalJs(`document.querySelector('button[data-plan="studio"]')?.closest(".tier")?.querySelector(".tier__price")?.textContent.replace(/\\s+/g, " ") || ""`)).includes("₹6,999 one-time"));
check("pay: no $ price on payable cards", !(await evalJs(`/\\$\\d/.test(document.querySelector(".tiers")?.textContent || "")`)) || (await evalJs(`document.querySelector(".tier:last-of-type .tier__price").textContent`)) === "Custom");
check("pay: enterprise card untouched", (await evalJs(`document.querySelector(".tier:last-of-type .btn")?.getAttribute("href")`)) === "#engage");

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

// synthetic success → pass rendered
await evalJs(`window.__rzpCalls[0].handler({ razorpay_payment_id: "pay_SMOKE1234567890" })`);
await sleep(700);
check("pay: success stage shown", !(await evalJs(`document.querySelector('[data-stage="success"]').hidden`)));
check("pay: form stage hidden", await evalJs(`document.querySelector('[data-stage="form"]').hidden`));
check("pay: pass id shown", (await evalJs(`document.getElementById("okPassId").textContent`)) === "pay_SMOKE1234567890");
check("pay: plan named on success", (await evalJs(`document.getElementById("okPlan").textContent`)) === "Studio");
check("pay: pass canvas painted", (await evalJs(`document.getElementById("passCanvas").getContext("2d").getImageData(100, 100, 1, 1).data.join()`)) === "7,8,10,255");
check("pay: download button visible", await evalJs(`!document.getElementById("payDownload").hidden`));

ws.close(); chrome.kill(); server.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
