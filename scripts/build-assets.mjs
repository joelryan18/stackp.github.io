// Bundles JS entries + CSS with content hashes; writes src/_data/assets.json
// so Eleventy templates can reference hashed filenames.
import * as esbuild from "esbuild";
import { rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WATCH = process.argv.includes("--watch");
const OUTDIR = "dist-assets";
const manifest = {};

const manifestPlugin = (names) => ({
  name: "manifest",
  setup(build) {
    build.onEnd(async (result) => {
      if (!result.metafile) return;
      for (const [out, meta] of Object.entries(result.metafile.outputs)) {
        if (!meta.entryPoint) continue;
        const name = names[meta.entryPoint];
        if (name) manifest[name] = "/assets/" + path.basename(out);
      }
      await writeFile("src/_data/assets.json", JSON.stringify(manifest, null, 2) + "\n");
      console.log("[assets]", JSON.stringify(manifest));
    });
  },
});

await rm(OUTDIR, { recursive: true, force: true });
await mkdir(OUTDIR, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  metafile: true,
  target: "es2020",
  outdir: OUTDIR,
  entryNames: "[name].[hash]",
  logLevel: "info",
};

const builds = [
  {
    ...common,
    entryPoints: ["src/assets/js/main.js", "src/assets/js/consent.js", "src/assets/js/checkout.js", "src/assets/js/anime.js"],
    format: "iife",
    plugins: [manifestPlugin({ "src/assets/js/main.js": "main", "src/assets/js/consent.js": "consent", "src/assets/js/checkout.js": "checkout", "src/assets/js/anime.js": "anime" })],
  },
  {
    ...common,
    entryPoints: ["src/assets/js/neural3d.js"],
    format: "esm",
    plugins: [manifestPlugin({ "src/assets/js/neural3d.js": "neural3d" })],
  },
  {
    ...common,
    entryPoints: ["src/assets/css/styles.css"],
    external: ["*.woff2"],
    plugins: [manifestPlugin({ "src/assets/css/styles.css": "styles" })],
  },
];

if (WATCH) {
  for (const opts of builds) (await esbuild.context(opts)).watch();
  console.log("[assets] watching…");
} else {
  await Promise.all(builds.map((opts) => esbuild.build(opts)));
}
