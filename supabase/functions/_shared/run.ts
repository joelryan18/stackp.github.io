/* ============================================================
   AXON — _shared/run.ts · executor plumbing shared by
   run-agent (manual + scheduled) and agent-hook (inbound).
   Spec §4b–§4e / §5:
   docs/superpowers/specs/2026-07-07-hobby-benefits-fulfillment-design.md
   ============================================================ */
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const PLAN_RUN_LIMITS: Record<string, number> = { hobby: 500, studio: 100000 };

export const FETCH_TIMEOUT_MS = 10_000;
export const FETCH_BODY_CAP = 256 * 1024; // bytes read from a watched source
export const RESULT_EXCERPT_CHARS = 2_000; // stored excerpt stays well under the 8 KB spec cap

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/* ---------- entitlement checks ---------- */

export async function activePlan(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("passes")
    .select("plan").eq("user_id", userId).eq("status", "active")
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data?.plan ?? null;
}

/* true = run granted; false = monthly quota exhausted */
export async function takeRun(admin: SupabaseClient, userId: string, cap: number): Promise<boolean> {
  const { data, error } = await admin.rpc("increment_run_quota", { uid: userId, cap });
  if (error) throw new Error("quota rpc failed: " + error.message);
  return data === true;
}

export async function quotaUsed(admin: SupabaseClient, userId: string): Promise<number> {
  const month = new Date().toISOString().slice(0, 8) + "01";
  const { data } = await admin.from("run_quota")
    .select("used").eq("user_id", userId).eq("month", month).maybeSingle();
  return data?.used ?? 0;
}

/* ---------- guarded fetch (SSRF: scheme allowlist + private-host denylist,
              time + size caps) ---------- */

function hostBlocked(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h.startsWith("[")) return true; // IPv6 literals refused wholesale
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true;
  }
  return false;
}

async function readCapped(resp: Response, cap: number): Promise<string> {
  const reader = resp.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(total, cap));
  let off = 0;
  for (const c of chunks) {
    const slice = c.subarray(0, Math.min(c.length, cap - off));
    buf.set(slice, off);
    off += slice.length;
    if (off >= cap) break;
  }
  return new TextDecoder().decode(buf);
}

export interface FetchOutcome {
  ok: boolean;
  httpStatus: number | null;
  body: string;
  error: string | null;
}

export async function guardedFetch(sourceUrl: string): Promise<FetchOutcome> {
  let url: URL;
  try { url = new URL(sourceUrl); } catch { return { ok: false, httpStatus: null, body: "", error: "invalid source url" }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, httpStatus: null, body: "", error: "only http/https sources" };
  }
  if (hostBlocked(url.hostname)) {
    return { ok: false, httpStatus: null, body: "", error: "source host not allowed" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "AXON-Signal/1.0 (+https://stackwith.me)" },
    });
    const body = await readCapped(resp, FETCH_BODY_CAP);
    return { ok: true, httpStatus: resp.status, body, error: null };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "source timed out" : "source fetch failed: " + (e as Error).message;
    return { ok: false, httpStatus: null, body: "", error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- condition evaluation (§5 — no LLM, plain checks) ---------- */

function compare(op: string, actual: unknown, expected: unknown): boolean {
  const an = Number(actual), en = Number(expected);
  const bothNumeric = Number.isFinite(an) && Number.isFinite(en);
  switch (op) {
    case "eq": return bothNumeric ? an === en : String(actual) === String(expected);
    case "neq": return !compare("eq", actual, expected);
    case "gt": return bothNumeric && an > en;
    case "gte": return bothNumeric && an >= en;
    case "lt": return bothNumeric && an < en;
    case "lte": return bothNumeric && an <= en;
    case "contains": return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    default: return false;
  }
}

function walkPath(obj: unknown, path: string): unknown {
  // deno-lint-ignore no-explicit-any
  return path.split(".").reduce((acc: any, key) => (acc == null ? undefined : acc[key]), obj);
}

function stripCdata(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
}

export function firstItemId(xml: string): string | null {
  const item = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/i)?.[0];
  if (!item) return null;
  const id = item.match(/<(?:guid|id)\b[^>]*>([\s\S]*?)<\/(?:guid|id)>/i)?.[1]
    ?? item.match(/<link\b[^>]*href="([^"]+)"/i)?.[1]
    ?? item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1]
    ?? item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return id ? stripCdata(id) : null;
}

export interface Evaluation {
  triggered: boolean;
  detail: string;
  newState: Record<string, unknown> | null; // null = state unchanged
}

// deno-lint-ignore no-explicit-any
export function evaluateCondition(condition: any, body: string, httpStatus: number | null, state: Record<string, unknown>): Evaluation {
  const kind = condition?.kind ?? "always";
  switch (kind) {
    case "always":
      return { triggered: true, detail: "always-on signal", newState: null };
    case "keyword": {
      const value = String(condition.value ?? "");
      const hit = value !== "" && body.toLowerCase().includes(value.toLowerCase());
      return { triggered: hit, detail: hit ? `keyword “${value}” found` : `keyword “${value}” not found`, newState: null };
    }
    case "status": {
      const hit = compare(condition.op ?? "neq", httpStatus, condition.value ?? 200);
      return { triggered: hit, detail: `HTTP ${httpStatus} ${condition.op ?? "neq"} ${condition.value ?? 200} → ${hit}`, newState: null };
    }
    case "json_path": {
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { throw new Error("source is not valid JSON"); }
      const actual = walkPath(parsed, String(condition.path ?? ""));
      const hit = compare(condition.op ?? "eq", actual, condition.value);
      return { triggered: hit, detail: `${condition.path} = ${JSON.stringify(actual)} (${condition.op ?? "eq"} ${JSON.stringify(condition.value)} → ${hit})`, newState: null };
    }
    case "new_item": {
      const id = firstItemId(body);
      if (!id) throw new Error("no feed items found");
      const last = state.last_item_id;
      const hit = last != null && last !== id; // first run establishes the baseline silently
      return {
        triggered: hit,
        detail: hit ? "new item detected" : (last == null ? "baseline recorded" : "no new items"),
        newState: { ...state, last_item_id: id },
      };
    }
    default:
      throw new Error(`unknown condition kind “${kind}”`);
  }
}

/* ---------- run log + alert email (§4e — Resend by default; a mail failure
              never voids the run) ---------- */

// deno-lint-ignore no-explicit-any
export async function logRun(admin: SupabaseClient, row: Record<string, any>): Promise<number | null> {
  const { data, error } = await admin.from("runs").insert(row).select("id").single();
  if (error) {
    console.error("run insert failed:", error.message);
    return null;
  }
  return data.id;
}

/* returns null on success, else a note string recorded on the run */
export async function sendAlert(to: string, subject: string, text: string): Promise<string | null> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "alert email unconfigured (RESEND_API_KEY missing)";
  const from = Deno.env.get("AXON_ALERT_FROM") ?? "AXON Signals <alerts@stackwith.me>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) return `alert email failed (HTTP ${res.status})`;
    return null;
  } catch (e) {
    return `alert email failed (${(e as Error).message})`;
  }
}
