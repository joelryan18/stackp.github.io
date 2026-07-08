/* ============================================================
   AXON — executor logic tests · node scripts/test-executor.mjs
   Transpiles supabase/functions/_shared/run.ts (Deno TS) with esbuild,
   stubs the jsr: supabase import, and unit-tests the pure logic
   (feed-id extraction, condition evaluation) in Node. No network, no Deno.
   ============================================================ */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const src = await readFile(new URL("../supabase/functions/_shared/run.ts", import.meta.url), "utf8");
const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });

const dir = await mkdtemp(join(tmpdir(), "axon-executor-"));
const stub = join(dir, "sb-stub.mjs");
await writeFile(stub, "export const createClient = () => null;\nexport class SupabaseClient {}\n");
const mod = join(dir, "run.mjs");
await writeFile(mod, code.replace('"jsr:@supabase/supabase-js@2"', JSON.stringify(pathToFileURL(stub).href)));

const { evaluateCondition, firstItemId } = await import(pathToFileURL(mod).href);

let fails = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
  if (!ok) fails++;
};

// — feed id extraction
const rss = `<?xml version="1.0"?><rss><channel><title>Feed</title>
<item><title><![CDATA[Post two]]></title><guid isPermaLink="false"><![CDATA[tag:blog,2]]></guid></item>
<item><title>Post one</title><guid>tag:blog,1</guid></item></channel></rss>`;
t("rss guid + CDATA", firstItemId(rss), "tag:blog,2");

const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>releases</title>
<entry><id>tag:github.com,2008:Repository/1/v2.0</id><title>v2.0</title></entry>
<entry><id>tag:github.com,2008:Repository/1/v1.0</id></entry></feed>`;
t("atom entry id", firstItemId(atom), "tag:github.com,2008:Repository/1/v2.0");

t("fallback to title", firstItemId("<rss><channel><item><title>Only title here</title></item></channel></rss>"), "Only title here");
t("no items -> null", firstItemId("<html>nope</html>"), null);

// — new_item lifecycle
let ev = evaluateCondition({ kind: "new_item" }, rss, 200, {});
t("new_item baseline not triggered", ev.triggered, false);
t("new_item baseline stores id", ev.newState.last_item_id, "tag:blog,2");
t("new_item same id not triggered", evaluateCondition({ kind: "new_item" }, rss, 200, { last_item_id: "tag:blog,2" }).triggered, false);
t("new_item changed id triggered", evaluateCondition({ kind: "new_item" }, rss, 200, { last_item_id: "tag:blog,0" }).triggered, true);

// — keyword
t("keyword hit (case-insensitive)", evaluateCondition({ kind: "keyword", value: "PoSt TwO" }, rss, 200, {}).triggered, true);
t("keyword miss", evaluateCondition({ kind: "keyword", value: "absent" }, rss, 200, {}).triggered, false);
t("keyword empty never triggers", evaluateCondition({ kind: "keyword", value: "" }, rss, 200, {}).triggered, false);

// — status (uptime)
t("status 500 neq 200 triggers", evaluateCondition({ kind: "status", op: "neq", value: 200 }, "", 500, {}).triggered, true);
t("status 200 neq 200 quiet", evaluateCondition({ kind: "status", op: "neq", value: 200 }, "", 200, {}).triggered, false);
t("status null (fetch failed) neq 200 triggers", evaluateCondition({ kind: "status", op: "neq", value: 200 }, "", null, {}).triggered, true);
t("status gte 500", evaluateCondition({ kind: "status", op: "gte", value: 500 }, "", 503, {}).triggered, true);

// — json_path
const priceJson = JSON.stringify({ data: { price: 42, items: [{ name: "widget-alpha" }] } });
t("json_path lt hit", evaluateCondition({ kind: "json_path", path: "data.price", op: "lt", value: 100 }, priceJson, 200, {}).triggered, true);
t("json_path lt miss", evaluateCondition({ kind: "json_path", path: "data.price", op: "lt", value: 10 }, priceJson, 200, {}).triggered, false);
t("json_path array index + contains", evaluateCondition({ kind: "json_path", path: "data.items.0.name", op: "contains", value: "ALPHA" }, priceJson, 200, {}).triggered, true);
t("json_path eq numeric string", evaluateCondition({ kind: "json_path", path: "data.price", op: "eq", value: "42" }, priceJson, 200, {}).triggered, true);
t("json_path missing path eq quiet", evaluateCondition({ kind: "json_path", path: "data.nope", op: "eq", value: "x" }, priceJson, 200, {}).triggered, false);
try { evaluateCondition({ kind: "json_path", path: "a", op: "eq", value: 1 }, "not json", 200, {}); t("json_path bad json throws", "no-throw", "throw"); }
catch (e) { t("json_path bad json throws", e.message, "source is not valid JSON"); }

// — always / unknown
t("always triggers", evaluateCondition({ kind: "always" }, "", 200, {}).triggered, true);
t("missing condition defaults to always", evaluateCondition(null, "", 200, {}).triggered, true);
try { evaluateCondition({ kind: "wat" }, "", 200, {}); t("unknown kind throws", "no-throw", "throw"); }
catch { t("unknown kind throws", "throw", "throw"); }

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
