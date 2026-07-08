/* ============================================================
   AXON — agent-hook · inbound run path for webhook-connector agents
   Spec §4c: docs/superpowers/specs/2026-07-07-hobby-benefits-fulfillment-design.md
   Deploy with JWT verification OFF (external services POST here; auth is the
   per-agent unguessable hook token):
     supabase functions deploy agent-hook --no-verify-jwt
   ============================================================ */
import {
  activePlan, adminClient, json, logRun, PLAN_RUN_LIMITS, quotaUsed,
  RESULT_EXCERPT_CHARS, sendAlert, takeRun,
} from "../_shared/run.ts";

const BODY_CAP = 64 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!UUID_RE.test(token)) return json(404, { error: "unknown_token" });

  const admin = adminClient();
  const { data: agent } = await admin.from("agents")
    .select("*").eq("hook_token", token).maybeSingle();
  // unknown and known-but-wrong-kind both answer 404 — no token oracle
  if (!agent || agent.connector !== "webhook") return json(404, { error: "unknown_token" });
  if (!agent.enabled) return json(403, { error: "agent_disabled" });

  const plan = await activePlan(admin, agent.user_id);
  if (!plan) return json(403, { error: "no_active_pass" });
  const limit = PLAN_RUN_LIMITS[plan] ?? 0;

  if (!(await takeRun(admin, agent.user_id, limit))) {
    return json(429, { error: "quota_exhausted" });
  }

  const body = (await req.text()).slice(0, BODY_CAP);

  // webhook conditions: keyword (contains in raw body) or always (spec §4c)
  let triggered = true;
  let detail = "inbound signal received";
  if (agent.condition?.kind === "keyword") {
    const value = String(agent.condition.value ?? "");
    triggered = value !== "" && body.toLowerCase().includes(value.toLowerCase());
    detail = triggered ? `keyword “${value}” found in payload` : `keyword “${value}” not in payload`;
  }

  let note: string | null = null;
  if (triggered) {
    const mailNote = await sendAlert(
      agent.notify_email,
      `AXON signal — ${agent.name}`,
      `Your agent “${agent.name}” received a triggering webhook.\n\n${detail}\n\nReplay the run in your console: https://stackwith.me/console.html`,
    );
    if (mailNote) note = mailNote;
  }

  const runId = await logRun(admin, {
    agent_id: agent.id,
    user_id: agent.user_id,
    status: triggered ? "triggered" : "ok",
    http_status: null,
    result: { detail, excerpt: body.slice(0, RESULT_EXCERPT_CHARS) },
    note,
  });

  await admin.from("agents")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", agent.id);

  return json(200, { ok: true, run_id: runId, triggered, quota: { used: await quotaUsed(admin, agent.user_id), limit } });
});
