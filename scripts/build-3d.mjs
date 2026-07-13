// build-3d.mjs — authored-asset pipeline for /lab.html ("Deep Signal").
// Blender (headless) → raw glb + matcap png → Draco glb + KTX2 texture
// → src/assets/3d/ (committed; NOT part of npm run build — Blender and
// toktx are machine deps, the outputs are checked in).
//
//   node scripts/build-3d.mjs            # full pipeline incl. Blender
//   node scripts/build-3d.mjs --no-bake  # reuse /tmp/lab-assets raw outputs
//
// Machine deps: /opt/homebrew/bin/blender (5.x), /opt/homebrew/bin/toktx
// (KTX-Software, hand-installed — no brew formula), npx gltf-transform.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, existsSync, statSync } from "node:fs";

const BLENDER = "/opt/homebrew/bin/blender";
const TOKTX = "/opt/homebrew/bin/toktx";
const TMP = "/tmp/lab-assets";
const OUT = "src/assets/3d";

const run = (cmd, args) => {
  console.log(`[3d] ${cmd.split("/").pop()} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit" });
};
const kb = (p) => `${(statSync(p).size / 1024).toFixed(1)} KB`;

mkdirSync(TMP, { recursive: true });
mkdirSync(`${OUT}/draco`, { recursive: true });
mkdirSync(`${OUT}/basis`, { recursive: true });

// 1 · author in Blender (deterministic — seeded)
if (!process.argv.includes("--no-bake")) {
  run(BLENDER, ["--background", "--factory-startup", "--python", "assets-src/lab/gen_crystals.py", "--", TMP]);
}
for (const f of [`${TMP}/lab-crystals-raw.glb`, `${TMP}/lab-matcap.png`]) {
  if (!existsSync(f)) { console.error(`[3d] missing ${f} — run without --no-bake`); process.exit(1); }
}

// 2 · Draco-compress the geometry
run("npx", ["gltf-transform", "draco", `${TMP}/lab-crystals-raw.glb`, `${OUT}/lab-crystals.glb`]);

// 3 · KTX2 the matcap (UASTC — the matcap is all soft gradients, ETC1S bands)
run(TOKTX, ["--t2", "--encode", "uastc", "--uastc_quality", "3", "--zcmp", "19", "--genmipmap", "--assign_oetf", "srgb", `${OUT}/lab-matcap.ktx2`, `${TMP}/lab-matcap.png`]);

// 4 · runtime decoders, served next to the assets
const LIBS = "node_modules/three/examples/jsm/libs";
for (const f of ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]) {
  cpSync(`${LIBS}/draco/gltf/${f}`, `${OUT}/draco/${f}`);
}
for (const f of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
  cpSync(`${LIBS}/basis/${f}`, `${OUT}/basis/${f}`);
}

console.log(`[3d] ok — glb ${kb(`${OUT}/lab-crystals.glb`)}, matcap ${kb(`${OUT}/lab-matcap.ktx2`)}`);
