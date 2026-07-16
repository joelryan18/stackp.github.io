// build-3d.mjs — authored-asset pipeline (/lab.html "Deep Signal" +
// /about.html "Signal Field v5 — Machined").
// Blender (headless) → raw glb + matcap png → Draco glb + KTX2 texture
// → src/assets/3d/ (committed; NOT part of npm run build — Blender and
// toktx are machine deps, the outputs are checked in).
//
//   node scripts/build-3d.mjs            # all bundles incl. Blender
//   node scripts/build-3d.mjs about      # one bundle by name
//   node scripts/build-3d.mjs --no-bake  # reuse /tmp raw outputs
//
// Machine deps: /opt/homebrew/bin/blender (5.x), /opt/homebrew/bin/toktx
// (KTX-Software, hand-installed — no brew formula), npx gltf-transform.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, existsSync, statSync } from "node:fs";

const BLENDER = "/opt/homebrew/bin/blender";
const TOKTX = "/opt/homebrew/bin/toktx";
const OUT = "src/assets/3d";

// one entry per page bundle: Blender authoring script + its outputs
const BUNDLES = {
  // rdo: v3 matcaps are 1024² — UASTC RDO halves them (~840→~445 KB) with no visible loss on soft gradients
  lab: { script: "assets-src/lab/gen_crystals.py", tmp: "/tmp/lab-assets", glb: "lab-crystals", matcap: "lab-matcap", extraMatcaps: ["lab-matcap-int"], rdo: true },
  about: { script: "assets-src/about/gen_instrument.py", tmp: "/tmp/about-assets", glb: "about-instrument", matcap: "about-matcap" },
};

const run = (cmd, args) => {
  console.log(`[3d] ${cmd.split("/").pop()} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit" });
};
const kb = (p) => `${(statSync(p).size / 1024).toFixed(1)} KB`;

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const picked = Object.entries(BUNDLES).filter(([name]) => !only.length || only.includes(name));
if (!picked.length) { console.error(`[3d] unknown bundle "${only}" — have: ${Object.keys(BUNDLES).join(", ")}`); process.exit(1); }

mkdirSync(`${OUT}/draco`, { recursive: true });
mkdirSync(`${OUT}/basis`, { recursive: true });

for (const [name, b] of picked) {
  mkdirSync(b.tmp, { recursive: true });

  // 1 · author in Blender (deterministic)
  if (!process.argv.includes("--no-bake")) {
    run(BLENDER, ["--background", "--factory-startup", "--python", b.script, "--", b.tmp]);
  }
  for (const f of [`${b.tmp}/${b.glb}-raw.glb`, `${b.tmp}/${b.matcap}.png`]) {
    if (!existsSync(f)) { console.error(`[3d] missing ${f} — run without --no-bake`); process.exit(1); }
  }

  // 2 · Draco-compress the geometry
  run("npx", ["gltf-transform", "draco", `${b.tmp}/${b.glb}-raw.glb`, `${OUT}/${b.glb}.glb`]);

  // 3 · KTX2 the matcap(s) (UASTC — all soft gradients, ETC1S bands)
  for (const m of [b.matcap, ...(b.extraMatcaps || [])]) {
    if (!existsSync(`${b.tmp}/${m}.png`)) { console.error(`[3d] missing ${b.tmp}/${m}.png — run without --no-bake`); process.exit(1); }
    run(TOKTX, ["--t2", "--encode", "uastc", "--uastc_quality", "3",
      ...(b.rdo ? ["--uastc_rdo_l", "1.5", "--uastc_rdo_d", "8192"] : []),
      "--zcmp", "19", "--genmipmap", "--assign_oetf", "srgb", `${OUT}/${m}.ktx2`, `${b.tmp}/${m}.png`]);
  }

  console.log(`[3d] ${name} ok — glb ${kb(`${OUT}/${b.glb}.glb`)}, matcap ${kb(`${OUT}/${b.matcap}.ktx2`)}`);
}

// 4 · runtime decoders, served next to the assets
const LIBS = "node_modules/three/examples/jsm/libs";
for (const f of ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]) {
  cpSync(`${LIBS}/draco/gltf/${f}`, `${OUT}/draco/${f}`);
}
for (const f of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
  cpSync(`${LIBS}/basis/${f}`, `${OUT}/basis/${f}`);
}
