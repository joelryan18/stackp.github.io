<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500&display=swap" rel="stylesheet" />
<link href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&display=swap" rel="stylesheet" />
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    background:
      radial-gradient(60% 90% at 78% 30%, rgba(184,255,60,0.16), transparent 55%),
      radial-gradient(50% 70% at 82% 70%, rgba(60,224,200,0.10), transparent 60%),
      linear-gradient(160deg, #090B0F, #07080A 60%, #050608);
    color: #F2F4F3; font-family: "Inter", sans-serif; position: relative;
    padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between;
  }
  /* faint oscilloscope grid */
  body::before {
    content: ""; position: absolute; inset: 0;
    background-image: linear-gradient(#1C2026 1px, transparent 1px), linear-gradient(90deg, #1C2026 1px, transparent 1px);
    background-size: 60px 60px;
    -webkit-mask-image: radial-gradient(120% 90% at 75% 40%, #000, transparent 70%);
    opacity: .5;
  }
  /* signal trace */
  .wave { position: absolute; inset: 0; z-index: 0; }
  .wave path { fill: none; stroke: #B8FF3C; stroke-width: 2.5; filter: drop-shadow(0 0 10px rgba(184,255,60,.6)); }
  .row { position: relative; z-index: 2; display: flex; align-items: center; gap: 16px; }
  .mark { width: 44px; height: 44px; }
  .mark path { fill: none; stroke: #B8FF3C; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .brand { font-family: "Clash Display", sans-serif; font-weight: 600; font-size: 40px; letter-spacing: .06em; }
  .eyebrow { font-family: "JetBrains Mono", monospace; font-size: 20px; letter-spacing: .22em; color: #7E8794; text-transform: uppercase; }
  h1 { font-family: "Clash Display", sans-serif; font-weight: 600; font-size: 92px; line-height: .98; letter-spacing: -.03em; max-width: 15ch; position: relative; z-index: 2; }
  .foot { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: flex-end; }
  .mono { font-family: "JetBrains Mono", monospace; font-size: 20px; color: #7E8794; letter-spacing: .04em; }
  .mono b { color: #B8FF3C; font-weight: 500; }
  .pill { font-family: "JetBrains Mono", monospace; font-size: 18px; color: #0A0E04; background: #B8FF3C; padding: 10px 20px; border-radius: 100px; font-weight: 700; letter-spacing: .04em; }
</style>
</head>
<body>
  <svg class="wave" viewBox="0 0 1200 630" preserveAspectRatio="none">
    <path d="M0,470 L280,470 L330,300 L390,540 L440,470 L1200,470" />
  </svg>
  <div class="row">
    <svg class="mark" viewBox="0 0 28 28"><path d="M2 14h5l3-7 6 14 3-7h7"/></svg>
    <span class="brand">AXON</span>
  </div>
  <h1>The nervous system for your software.</h1>
  <div class="foot">
    <span class="mono">Autonomous agents that sense, reason &amp; <b>act</b> — in microseconds.</span>
    <span class="pill">DEPLOY AN AGENT</span>
  </div>
</body>
</html>
