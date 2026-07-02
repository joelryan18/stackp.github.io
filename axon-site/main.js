/* ============================================================
   AXON — Signal Instrument · main.js
   boot · lenis+gsap · probe · oscilloscope · scroll story · trace
   ============================================================ */
(() => {
  "use strict";

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced   = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hoverFine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGSAP   = !!(window.gsap && window.ScrollTrigger);
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  const yearEl = $("#year"); if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------------------------------------------------
     1 · LENIS + GSAP wiring
  --------------------------------------------------------- */
  let lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
    if (hasGSAP) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  // smooth anchor scrolling
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const target = $(id);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      if (lenis) lenis.scrollTo(target, { offset: -10, duration: 1.2 });
      else target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    });
  });

  /* ---------------------------------------------------------
     2 · BOOT — two-beat power-on
  --------------------------------------------------------- */
  function boot() {
    document.body.classList.remove("booting");
    if (!reduced) decode($(".hero__title"), 240);
  }
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);
  // safety: never leave the veil up
  setTimeout(() => document.body.classList.remove("booting"), 1600);

  /* ---------------------------------------------------------
     3 · NAV + mobile menu
  --------------------------------------------------------- */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const burger = $("#burger"), menu = $("#menu");
  function toggleMenu() {
    const open = menu.classList.toggle("is-open");
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
  }
  function closeMenu() {
    if (!menu) return;
    menu.classList.remove("is-open"); burger.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false"); menu.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  burger?.addEventListener("click", toggleMenu);

  /* ---------------------------------------------------------
     4 · PROBE — crosshair cursor + magnetic + HUD
  --------------------------------------------------------- */
  if (hoverFine && !reduced) {
    document.body.classList.add("has-probe");
    const probe = $(".probe");
    const px = $(".probe__x"), py = $(".probe__y");
    const coord = $(".probe__coord"), state = $(".probe__state");
    let tx = innerWidth / 2, ty = innerHeight / 2, cx = tx, cy = ty;

    window.addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function loop() {
      cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22;
      probe.style.transform = `translate(${cx}px, ${cy}px)`;
      px.style.top = cy + "px"; py.style.left = cx + "px";
      if (coord) coord.textContent = "x" + String(Math.round(tx)).padStart(3, "0") + " y" + String(Math.round(ty)).padStart(3, "0");
      requestAnimationFrame(loop);
    })();

    // hover targets change probe state
    $$("[data-probe]").forEach((el) => {
      const lbl = el.getAttribute("data-probe") || "SIGNAL";
      el.addEventListener("mouseenter", () => { probe.classList.add("is-hot"); if (state) state.textContent = lbl; });
      el.addEventListener("mouseleave", () => { probe.classList.remove("is-hot"); if (state) state.textContent = "IDLE"; });
    });

    // magnetic + lock
    $$("[data-magnet]").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${mx * 0.3}px, ${my * 0.3}px)`;
        probe.classList.add("is-locked");
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; probe.classList.remove("is-locked"); });
    });
  }

  /* ---------------------------------------------------------
     5 · OSCILLOSCOPE (hero canvas)
  --------------------------------------------------------- */
  const scope = $("#scope");
  if (scope && !reduced) {
    const ctx = scope.getContext("2d");
    let w, h, dpr, N, buf, t = 0, spikeT = 0, mouseAmp = 0, mouseY = 0, rafId = null;

    function size() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = scope.clientWidth; h = scope.clientHeight;
      scope.width = w * dpr; scope.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      N = Math.max(120, Math.floor(w / 2));
      buf = new Float32Array(N);
    }
    window.addEventListener("mousemove", (e) => {
      const r = scope.getBoundingClientRect();
      mouseY = (e.clientY - r.top) / r.height - 0.5;
      const near = 1 - Math.min(1, Math.abs(e.clientX - r.left - r.width / 2) / (r.width / 2));
      mouseAmp = near;
    }, { passive: true });

    function sample() {
      t += 1;
      let base = 0.14 * Math.sin(t * 0.045) + 0.07 * Math.sin(t * 0.11) + 0.03 * Math.sin(t * 0.23);
      // travelling impulse (nerve firing)
      spikeT -= 1;
      if (spikeT <= 0) spikeT = 90 + Math.random() * 80;
      const env = Math.exp(-Math.pow((spikeT - 45) / 6, 2));
      base += env * (0.55 + 0.25 * Math.random());
      base += (Math.random() - 0.5) * 0.02;
      base += mouseY * 0.25;
      base *= 0.7 + mouseAmp * 0.6;
      return base;
    }

    function draw() {
      // shift buffer
      for (let i = 0; i < N - 1; i++) buf[i] = buf[i + 1];
      buf[N - 1] = sample();

      ctx.clearRect(0, 0, w, h);
      const cy = h * 0.52, amp = h * 0.3;
      // trace
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * w;
        const y = cy - buf[i] * amp;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(184,255,60,0.75)";
      ctx.lineWidth = 1.4;
      ctx.shadowColor = "rgba(184,255,60,0.6)";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // leading dot
      const lx = w, ly = cy - buf[N - 1] * amp;
      ctx.beginPath(); ctx.arc(lx - 2, ly, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = "#B8FF3C"; ctx.fill();

      mouseAmp *= 0.96;
      rafId = requestAnimationFrame(draw);
    }
    const start = () => { if (!rafId) draw(); };
    const stop  = () => { if (rafId) cancelAnimationFrame(rafId), (rafId = null); };
    window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => e.isIntersecting ? start() : stop(), { threshold: 0.01 }).observe($("#hero"));
    }
    size(); start();
  }

  /* ---------------------------------------------------------
     6 · DECODE (scramble → resolve)
  --------------------------------------------------------- */
  const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/\\<>[]=+*#%";
  function decode(el, startDelay) {
    if (!el) return;
    const raw = el.getAttribute("data-src") || el.innerHTML;
    el.setAttribute("data-src", raw);
    const lines = raw.split(/<br\s*\/?>/i);
    el.innerHTML = "";
    const glyphs = [];
    lines.forEach((line, li) => {
      [...line].forEach((ch) => {
        if (ch === " ") { el.appendChild(document.createTextNode(" ")); return; }
        const s = document.createElement("span");
        s.className = "glyph"; s.textContent = ch; s.style.color = "var(--signal)";
        el.appendChild(s); glyphs.push({ node: s, final: ch, done: false });
      });
      if (li < lines.length - 1) el.appendChild(document.createElement("br"));
    });
    const per = 2;
    glyphs.forEach((g, i) => (g.revealAt = i * per + 6));
    let f = 0; const total = glyphs.length * per + 24;
    const tick = () => {
      f++;
      for (const g of glyphs) {
        if (g.done) continue;
        if (f >= g.revealAt) { g.node.textContent = g.final; g.node.style.color = ""; g.done = true; }
        else if (f % 2 === 0) g.node.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      if (f < total) requestAnimationFrame(tick);
      else glyphs.forEach((g) => { g.node.textContent = g.final; g.node.style.color = ""; });
    };
    setTimeout(() => requestAnimationFrame(tick), startDelay || 0);
  }
  // engage title decodes on scroll-in
  const engageTitle = $(".engage__title");
  if (engageTitle && !reduced && "IntersectionObserver" in window) {
    let done = false;
    new IntersectionObserver(([e]) => { if (e.isIntersecting && !done) { done = true; decode(engageTitle, 0); } }, { threshold: 0.5 })
      .observe(engageTitle);
  }

  /* ---------------------------------------------------------
     7 · SPLIT-LINE reveals  ·  data-reveal  ·  weight-breathe
  --------------------------------------------------------- */
  if (hasGSAP && !reduced) {
    document.body.classList.add("anim");

    // line/word mask reveals
    $$("[data-lines]").forEach((el) => {
      const target = el.querySelector("p") || el;
      const words = target.textContent.trim().split(/\s+/);
      target.innerHTML = words.map((wd) => `<span class="ln"><span>${wd}</span></span>`).join(" ");
      el.classList.add("is-split");
      const spans = el.querySelectorAll(".ln > span");
      gsap.set(spans, { yPercent: 110 });
      gsap.to(spans, {
        yPercent: 0, duration: 0.9, ease: "expo.out", stagger: 0.045,
        scrollTrigger: { trigger: el, start: "top 84%" },
      });
    });

    // generic reveals
    $$("[data-reveal]").forEach((el) => {
      gsap.to(el, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%" } });
    });

    // weight-breathe on display titles
    $$("[data-weight]").forEach((el) => {
      ScrollTrigger.create({
        trigger: el, start: "top 92%", end: "top 42%", scrub: true,
        onUpdate: (self) => {
          const p = self.progress;
          el.style.fontWeight = p < 0.4 ? 500 : p < 0.8 ? 600 : 700;
        },
      });
    });
  } else {
    // no-gsap / reduced fallback: everything visible
    $$("[data-reveal]").forEach((el) => { el.style.opacity = 1; el.style.transform = "none"; });
  }

  /* ---------------------------------------------------------
     8 · RAIL — scroll-progress nerve + section index
  --------------------------------------------------------- */
  const railPulse = $("#railPulse");
  if (hasGSAP && railPulse) {
    ScrollTrigger.create({
      start: 0, end: "max",
      onUpdate: (self) => { railPulse.style.strokeDashoffset = String(100 * (1 - self.progress)); },
    });
    $$(".rail__mark").forEach((mark) => {
      const sec = document.getElementById(mark.dataset.target);
      if (!sec) return;
      ScrollTrigger.create({
        trigger: sec, start: "top 55%", end: "bottom 55%",
        onToggle: (self) => mark.classList.toggle("is-active", self.isActive),
      });
    });
  } else if (railPulse) {
    // vanilla progress fallback
    const upd = () => {
      const p = window.scrollY / Math.max(1, document.body.scrollHeight - innerHeight);
      railPulse.style.strokeDashoffset = String(100 * (1 - p));
    };
    upd(); window.addEventListener("scroll", upd, { passive: true });
  }

  /* ---------------------------------------------------------
     9 · PINNED HORIZONTAL pipeline
  --------------------------------------------------------- */
  const pin = $("#pipePin"), track = $("#pipeTrack");
  if (hasGSAP && !reduced && pin && track && matchMedia("(min-width: 721px)").matches) {
    const distance = () => Math.max(1, track.scrollWidth - pin.clientWidth + 40);
    gsap.to(track, {
      x: () => -distance(), ease: "none",
      scrollTrigger: {
        trigger: ".pipeline", start: "top top", end: () => "+=" + distance(),
        scrub: 0.6, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
      },
    });
  }

  /* ---------------------------------------------------------
     10 · DATASHEET row reveal
  --------------------------------------------------------- */
  if (hasGSAP && !reduced) {
    gsap.from("[data-row]", {
      opacity: 0, x: -18, duration: 0.7, ease: "power3.out", stagger: 0.08,
      scrollTrigger: { trigger: ".sheet", start: "top 80%" },
    });
  }

  /* ---------------------------------------------------------
     11 · COUNTERS (tabular)
  --------------------------------------------------------- */
  const runCounter = (el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = (el.dataset.count.split(".")[1] || "").length;
    const prefix = el.dataset.prefix || "", suffix = el.dataset.suffix || "";
    const dur = 1600, t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + (target * e).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const counters = $$("[data-count]");
  if ("IntersectionObserver" in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { runCounter(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counters.forEach((c) => io.observe(c));
  } else {
    counters.forEach((el) => {
      el.textContent = (el.dataset.prefix || "") + el.dataset.count + (el.dataset.suffix || "");
    });
  }

  // live drift on hero + nav
  const firing = $("#firing"), throughput = $("#throughput");
  if (!reduced) setInterval(() => {
    if (firing) firing.textContent = (12041 + Math.floor(Math.sin(Date.now() / 9000) * 40 + Math.random() * 14)).toLocaleString();
    if (throughput) throughput.textContent = (3.55 + Math.random() * 0.12).toFixed(2) + "k";
  }, 2600);

  /* ---------------------------------------------------------
     12 · VELOCITY MARQUEE
  --------------------------------------------------------- */
  const mtrack = $("#marquee");
  if (mtrack && !reduced) {
    mtrack.innerHTML += mtrack.innerHTML;
    let off = 0, base = 0.4;
    (function move() {
      const v = lenis ? Math.min(6, Math.abs(lenis.velocity || 0) * 0.35) : 0;
      off -= base + v;
      const half = mtrack.scrollWidth / 2;
      if (-off >= half) off += half;
      mtrack.style.transform = `translateX(${off}px)`;
      requestAnimationFrame(move);
    })();
  }

  /* ---------------------------------------------------------
     13 · CTA wave (SVG)
  --------------------------------------------------------- */
  const ctaWave = $("#ctaWave");
  if (ctaWave && !reduced) {
    let ph = 0, running = false;
    const render = () => {
      ph += 0.05;
      let d = "M0,60";
      for (let x = 0; x <= 1200; x += 20) {
        const y = 60 + Math.sin(x * 0.02 + ph) * 16 * Math.sin(ph * 0.3 + x * 0.002);
        d += ` L${x},${y.toFixed(1)}`;
      }
      ctaWave.setAttribute("d", d);
      if (running) requestAnimationFrame(render);
    };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => {
        running = e.isIntersecting;
        if (running) requestAnimationFrame(render);
      }, { threshold: 0.1 }).observe($("#engage"));
    }
  }

  /* ---------------------------------------------------------
     14 · REASONING TRACE (typewriter)
  --------------------------------------------------------- */
  const term = $("#term");
  if (term) {
    const lines = [
      { t: '<span class="k">▸ sense</span>   webhook: 37 failed payments · last 24h', d: 22 },
      { t: '<span class="k">◇ plan</span>    pull failures → match refunds → retry|flag', d: 16 },
      { t: '<span class="c">→ act</span>     stripe.charges status=failed  <span class="g">[37]</span>', d: 14 },
      { t: '<span class="c">→ act</span>     ledger.reconcile  <span class="g">[31 auto]</span> <span class="d">6 ambiguous</span>', d: 14 },
      { t: '<span class="c">→ act</span>     retry(31)  <span class="g">29 ok</span> · <span class="d">2 flagged</span>', d: 14 },
      { t: '<span class="k">◇ observe</span> 6 → human review · ticket <span class="g">#OPS-4471</span>', d: 16 },
      { t: '<span class="g">✓ done</span>    $18,204 recovered · 0 side-effects · 4.1s', d: 20 },
    ];
    const caret = '<span class="term-caret"></span>';
    let li = 0, out = "";
    const plainLen = (html) => html.replace(/<[^>]+>/g, "").length;
    const partial = (html, n) => {
      let count = 0, res = "", inTag = false;
      for (let c = 0; c < html.length; c++) {
        const ch = html[c];
        if (ch === "<") inTag = true;
        res += ch;
        if (ch === ">") { inTag = false; continue; }
        if (!inTag) { count++; if (count >= n) return res; }
      }
      return res;
    };
    function typeLine() {
      const line = lines[li]; let i = 0;
      const step = () => {
        term.innerHTML = out + partial(line.t, i) + caret;
        i++;
        if (i <= plainLen(line.t)) setTimeout(step, line.d);
        else { out += line.t + "\n"; li++;
          if (li < lines.length) setTimeout(typeLine, 380);
          else setTimeout(reset, 3400);
        }
      };
      step();
    }
    function reset() { out = ""; li = 0; term.innerHTML = caret; setTimeout(typeLine, 500); }

    if (reduced) term.innerHTML = lines.map((l) => l.t).join("\n");
    else if ("IntersectionObserver" in window) {
      let started = false;
      new IntersectionObserver(([e]) => { if (e.isIntersecting && !started) { started = true; typeLine(); } }, { threshold: 0.35 }).observe(term);
    } else typeLine();
  }

  /* ---------------------------------------------------------
     15 · refresh ScrollTrigger once fonts settle (pin accuracy)
  --------------------------------------------------------- */
  if (hasGSAP && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
  window.addEventListener("load", () => hasGSAP && ScrollTrigger.refresh());

  console.log("%cAXON", "font:700 20px 'JetBrains Mono',monospace;color:#B8FF3C", "· signal instrument online.");
})();
