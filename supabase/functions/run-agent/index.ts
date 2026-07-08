/* ============================================================
   AXON — run-agent · the executor (manual + scheduled runs)
   Spec §4b: docs/superpowers/specs/2026-07-07-hobby-benefits-fulfillment-design.md
   Deploy with JWT verification OFF (cron dispatch carries no JWT — auth is
   resolved in-code: user JWT for console "Run now", x-axon-cron for pg_cron):
     supabase functions deploy run-agent --no-verify-jwt
   ============================================================ */
import {
  activePlan, adminClient, evaluateCondition, guardedFetch, json, logRun,
  PLAN_RUN_LIMITS, quotaUsed, RESULT_EXCERPT_CHARS, sendAlert, takeRun,
} from "../_shared/run.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let agentId: unknown;
  try { agentId = (await req.json()).agent_id; } catch { return json(400, { error: "bad_body" }); }
  if (typeof agentId !== "string" || !UUID_RE.test(agentId)) return json(400, { error: "bad_agent_id" });

  const admin = adminClient();

  // — caller: pg_cron (shared secret) or a signed-in owner (JWT)
  const cronSecret = Deno.env.get("AXON_CRON_SECRET");
  const isCron = !!cronSecret && req.headers.get("x-axon-cron") === cronSecret;
  let callerId: string | null = null;
  if (!isCron) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: "no_auth" });
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data?.user) return json(401, { error: "bad_auth" });
    callerId = data.user.id;
  }

  const { data: agent, error: agentErr } = await admin.from("agents")
    .select("*").eq("id", agentId).maybeSingle();
  if (agentErr) return json(500, { error: "agent_lookup_failed" });
  if (!agent) return json(404, { error: "agent_not_found" });
  if (callerId && agent.user_id !== callerId) return json(403, { error: "not_owner" });
  if (!agent.enabled) return json(403, { error: "agent_disabled" });
  if (agent.connector === "webhook") return json(400, { error: "webhook_agents_are_inbound" });

  const plan = await activePlan(admin, agent.user_id);
  if (!plan) return json(403, { error: "no_active_pass" });
  const limit = PLAN_RUN_LIMITS[plan] ?? 0;

  if (!(await takeRun(admin, agent.user_id, limit))) {
    return json(429, { error: "quota_exhausted", quota: { used: await quotaUsed(admin, agent.user_id), limit } });
  }

  // — the run itself: fetch → evaluate → log → maybe alert.
  //   A failed fetch/evaluation still logged + consumed (it WAS a run).
  let status = "ok";
  let httpStatus: number | null = null;
  let triggered = false;
  let note: string | null = null;
  // deno-lint-ignore no-explicit-any
  let result: Record<string, any> | null = null;
  let newState: Record<string, unknown> | null = null;

  const fetched = await guardedFetch(agent.source_url);
  httpStatus = fetched.httpStatus;
  if (!fetched.ok && agent.condition?.kind !== "status") {
    status = "error";
    note = fetched.error;
  } else {
    try {
      const ev = evaluateCondition(agent.condition, fetched.body, httpStatus, agent.state ?? {});
      triggered = ev.triggered;
      newState = ev.newState;
      status = triggered ? "triggered" : "ok";
      result = {
        detail: ev.detail,
        excerpt: fetched.body.slice(0, RESULT_EXCERPT_CHARS),
      };
      if (fetched.error) note = fetched.error; // status-kind runs may evaluate a failed fetch
    } catch (e) {
      status = "error";
      note = (e as Error).message;
    }
  }

  if (triggered) {
    const mailNote = await sendAlert(
      agent.notify_email,
      `AXON signal — ${agent.name}`,
      `Your agent “${agent.name}” triggered.\n\n${result?.detail ?? ""}\nSource: ${agent.source_url}\n\nReplay the run in your console: https://stackwith.me/console.html`,
    );
    if (mailNote) note = note ? `${note} · ${mailNote}` : mailNote;
  }

  const runId = await logRun(admin, {
    agent_id: agent.id,
    user_id: agent.user_id,
    status,
    http_status: httpStatus,
    result,
    note,
  });

  await admin.from("agents")
    .update({ last_run_at: new Date().toISOString(), ...(newState ? { state: newState } : {}) })
    .eq("id", agent.id);

  return json(200, {
    run_id: runId,
    status,
    triggered,
    quota: { used: await quotaUsed(admin, agent.user_id), limit },
  });
});
