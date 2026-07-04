// QA harness: drive real Chrome over CDP, scroll through the live page, screenshot each section.
// Usage: node scripts/qa-shots.mjs [width] [height]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const W = parseInt(process.argv[2] || "1440", 10);
const H = parseInt(process.argv[3] || "900", 10);
const OUT = "/tmp/axon-qa";
const URL = "http://localhost:8080/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9222 + (W % 100);
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`,
  "--hide-scrollbars", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
  "--no-first-run", "--user-data-dir=/tmp/axon-qa-profile", "about:blank",
], { stdio: "ignore" });

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome CDP not ready");
}

function cdpClient(ws) {
  let id = 0;
  const pending = new Map();
  const sessions = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return { send };
}

const ws = await (async () => {
  const url = await getWsUrl();
  const s = new WebSocket(url);
  await new Promise((res, rej) => { s.addEventListener("open", res); s.addEventListener("error", rej); });
  return s;
})();

const cdp = cdpClient(ws);
const targets = await cdp.send("Target.getTargets");
const page = targets.targetInfos.find((t) => t.type === "page");
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const S = (m, p) => cdp.send(m, p, sessionId);

await S("Page.enable");
await S("Runtime.enable");
await S("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await S("Page.navigate", { url: URL });
await sleep(3500); // fonts + first paint + boot veil

const evalJs = async (expr) => {
  const r = await S("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};

const shoot = async (name) => {
  const { data } = await S("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${W}-${name}.png`, Buffer.from(data, "base64"));
};

// collect console errors
const errors = [];
await S("Log.enable").catch(() => {});
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params?.exceptionDetails?.text || "exception");
  if (m.method === "Log.entryAdded" && m.params?.entry?.level === "error") errors.push(m.params.entry.text);
});

// section anchors to visit
const sections = ["hero", "datasheet", "pipeline", "slabs", "readouts", "trace", "voices", "plans", "engage"];
await shoot("00-top");
for (const id of sections) {
  // scroll via Lenis if present (otherwise instant), then WAIT for it to settle
  await evalJs(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return false;
    const y = el.getBoundingClientRect().top + window.scrollY;
    if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true });
    else window.scrollTo(0, y);
    return true;
  })()`);
  await sleep(1400); // let Lenis settle + reveals fire
  await shoot(id);
}
// bottom / footer
await evalJs(`window.scrollTo({top: document.body.scrollHeight, behavior:'instant'})`);
await sleep(700);
await shoot("zz-footer");

// report body class + any no3d + errors + a few computed colors
const report = await evalJs(`JSON.stringify({
  bodyClass: document.body.className,
  no3d: document.body.classList.contains('no3d'),
  htmlBg: getComputedStyle(document.documentElement).backgroundColor,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  navFound: !!document.getElementById('nav'),
  pinFound: !!document.getElementById('pipePin'),
  scrollH: document.body.scrollHeight
})`);
console.log("REPORT " + report);
console.log("ERRORS " + JSON.stringify([...new Set(errors)].slice(0, 12)));

ws.close();
chrome.kill();
await sleep(200);
process.exit(0);
