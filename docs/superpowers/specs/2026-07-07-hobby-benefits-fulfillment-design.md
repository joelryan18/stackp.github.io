# Hobby benefits fulfillment — design spec

**Date:** 2026-07-07
**Status:** Approved pending user spec review (plan Task 1)
**Goal:** After a Hobby purchase is activated, the buyer genuinely receives every benefit
on the Hobby card. An "agent" is a configured **signal watcher** — fetch a source,
evaluate a condition, log the run, notify by email on trigger. No LLM, no per-run cost
beyond the Supabase free tier. The site stays static; everything trusted runs in
Supabase (Postgres + RLS, Edge Functions, pg_cron).

## Fulfillment map (the contract)

| Hobby promise | Deliverable | Surface | Task |
|---|---|---|---|
| 1 active agent | 1 agent row per Hobby pass (create/edit/delete), limit enforced server-side | Console | 2, 5 |
| 500 runs / month | Runs executed by Edge Function; monthly counter enforced server-side; meter in console | `run-agent` fn | 2, 4, 5 |
| Community connectors | `connectors/` preset library in repo (RSS, JSON API, HTTP status, webhook), open to PRs, picker in console | Repo + console | 6 |
| Community support | GitHub Discussions on this repo, linked from console + benefits email | GitHub | 8, 11 |
| Signal replay — 7-day retention | Run log with stored results, replay (re-run) from console; pg_cron purges rows > 7 days | Console | 4, 5 |
| Starter agent templates | ≥5 one-click-import templates | `connectors/templates/` + console | 7 |
| Supporter listing in the AXON registry | Opt-in display name on public `/registry.html` | Registry page | 9 |
| Priority queue for access requests | Signed-in request form; pass holders flagged `priority`, ordered first | Console | 10 |

## 1. Architecture

- **Supabase project** (existing auth project `jldzkjihbekxqxagkame`) grows: Postgres
  tables + RLS, three Edge Functions, `pg_cron` + `pg_net` for schedules, Vault for the
  cron secret.
- **Repo is source of truth:** `supabase/migrations/*.sql`, `supabase/functions/*/index.ts`,
  `connectors/*.json`. Applying migrations / deploying functions / setting secrets needs
  dashboard or CLI access → **user-gated deploy steps**, documented in `supabase/README.md`.
- **Trust boundary:** the browser only ever holds the publishable key; RLS scopes it to
  the signed-in user's own rows. Anything that grants value — passes, runs, quota — is
  written **only** by Edge Functions using the service role. A client can never grant
  itself a pass, an extra agent, or extra runs.
- **New pages:** `/console.html` (sign-in-gated, `noindex`) and `/registry.html` (public),
  both on the checkout page's visual language. The console makes no marketing claims, so
  Tasks 2–10 can ship while the sanctioned honest-copy line stands (revised only in Task 12).

## 2. Data model (`supabase/migrations/0001_entitlements.sql`)

Plan limits live in two immutable SQL functions (single source of truth):
`plan_agent_limit('hobby'|'studio') → 1 | NULL` (NULL = unlimited) and
`plan_run_limit(...) → 500 | 100000`.

### `passes` — entitlements (written only by the Razorpay webhook)

| column | type / constraint |
|---|---|
| `id` | uuid pk default `gen_random_uuid()` |
| `user_id` | uuid not null → `auth.users(id)` on delete cascade |
| `plan` | text not null check in (`hobby`,`studio`) |
| `payment_id` | text not null **unique** (Razorpay payment id — idempotency key) |
| `amount` | int not null (paise, verified: 500 / 699900) |
| `buyer_email`, `buyer_name` | text |
| `status` | text not null default `active` check in (`active`,`refunded`,`revoked`) |
| `created_at` | timestamptz not null default `now()` |

### `agents` — signal watchers

| column | type / constraint |
|---|---|
| `id` | uuid pk default `gen_random_uuid()` |
| `user_id` | uuid not null default `auth.uid()` → `auth.users` cascade |
| `name` | text not null, 1–60 chars |
| `connector` | text not null check in (`rss`,`json_api`,`http_status`,`webhook`) |
| `source_url` | text, `^https?://`, required unless connector = `webhook` |
| `condition` | jsonb not null default `{"kind":"always"}` (§5) |
| `notify_email` | text not null (defaults in UI to account email) |
| `schedule` | text not null default `manual` check in (`manual`,`hourly`,`daily`) |
| `enabled` | boolean not null default true |
| `state` | jsonb not null default `{}` (executor-owned: e.g. `last_item_id`) |
| `hook_token` | uuid not null default `gen_random_uuid()` (inbound webhook auth) |
| `last_run_at` | timestamptz |
| `created_at` | timestamptz not null default `now()` |

Agent limit enforced by a **security-definer BEFORE INSERT trigger** (not an RLS
subquery on the same table — avoids RLS recursion and races): count of own agents must
be < `plan_agent_limit(active plan)`; no active pass → reject.

### `runs` — run log (replay source)

`id` bigint identity pk · `agent_id` uuid → agents cascade · `user_id` uuid not null ·
`started_at` timestamptz default now() · `status` text check in (`ok`,`triggered`,`error`) ·
`http_status` int · `result` jsonb (excerpt, ≤ 8 KB) · `note` text.
Written only by Edge Functions. Purged after 7 days (§4d).

### `run_quota` — monthly counter (survives the 7-day purge, so it is the quota's truth)

`user_id` uuid · `month` date (first of month) · `used` int not null default 0 ·
pk `(user_id, month)`. Incremented atomically by
`increment_run_quota(uid, cap) → boolean` (security definer: upsert + `used < cap`
guard in one statement; false = quota exhausted).

### `access_requests` — priority queue

`id` uuid pk · `user_id` uuid not null default `auth.uid()` → auth.users cascade ·
`email` text not null · `message` text not null ≤ 2000 chars ·
`priority` boolean not null default false · `status` text not null default `queued`
check in (`queued`,`answered`,`closed`) · `created_at` timestamptz default now().
A security-definer BEFORE INSERT trigger **forces** `priority :=
has_active_pass(user_id)` and `status := 'queued'` — the client cannot set either
(column grants exclude them too). Owner triage happens in the Supabase dashboard:
`order by priority desc, created_at asc`.

### `registry_entries` — supporter listing opt-in

`user_id` uuid pk default `auth.uid()` → auth.users cascade · `display_name` text
not null 1–40 chars · `created_at` timestamptz default now().
Public read goes through **view `registry_public`** exposing only
`display_name, created_at` (owner-security view, `select` granted to `anon`) — the
base table (and its uuids) is never exposed anonymously.

## 3. RLS & grants matrix

RLS **enabled on every table**. `anon` gets no table grants at all (only
`registry_public`). Helper predicates (`has_active_pass`, `active_plan`) are
security-definer functions with EXECUTE revoked from `anon`/`authenticated` — callable
only from triggers/policies, not via PostgREST RPC.

| Table | `authenticated` may | Never (client) |
|---|---|---|
| `passes` | SELECT own | any write — service role only |
| `agents` | SELECT own; INSERT own (columns: name, connector, source_url, condition, notify_email, schedule, enabled) **with check** active pass + limit trigger; UPDATE own (same columns); DELETE own | touch `state`, `hook_token`, `user_id`, others' rows |
| `runs` | SELECT own | any write |
| `run_quota` | SELECT own (quota meter) | any write |
| `access_requests` | INSERT own (columns: email, message); SELECT own | set `priority`/`status`; read others |
| `registry_entries` | SELECT/INSERT/UPDATE/DELETE own row, insert/update **with check** active pass | read others' rows (public reads use the view) |

## 4. Edge Function contracts (`supabase/functions/`)

Shared env (via `supabase secrets set`, **never committed**): `RAZORPAY_WEBHOOK_SECRET`,
`AXON_CRON_SECRET`, alert-mail key (§4e). `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
are injected by the platform.

### 4a. `razorpay-webhook` (JWT verification off — Razorpay calls it)

- `POST` raw JSON body; header `x-razorpay-signature` = HMAC-SHA256(body, secret) hex.
  Verify with constant-time compare → mismatch **401**.
- `payment.captured`: validate `currency == "INR"`, `notes.plan ∈ {hobby, studio}`,
  `amount ==` exact plan amount (500 / 699900), `notes.auth_uid` is a UUID that exists in
  `auth.users` (admin lookup). Valid → insert `passes` row
  (`on conflict (payment_id) do nothing` — idempotent, Razorpay retries safely).
  Authentic-but-invalid → **200** `{ skipped, reason }` (logged; no retry storm).
- `refund.processed`: `status = 'refunded'` where `payment_id` matches. (The planned ₹5
  buy-then-refund verification exercises both paths.)
- Other events → 200 `{ ignored: true }`. Always answer < 5 s.
- **User-gated:** create the webhook in the Razorpay dashboard (URL =
  `https://<ref>.supabase.co/functions/v1/razorpay-webhook`, events: payment.captured,
  refund.processed) and `supabase secrets set RAZORPAY_WEBHOOK_SECRET=…`.

### 4b. `run-agent` — the executor

- `POST { agent_id }`. Auth: **either** the user's JWT (supabase-js `functions.invoke`)
  **or** header `x-axon-cron: $AXON_CRON_SECRET` (scheduled dispatch).
- Sequence: load agent (JWT caller must own it) → owner has active pass else **403** →
  `increment_run_quota(owner, plan_run_limit(plan))` else **429** `{ error: "quota_exhausted" }`
  → fetch `source_url` (GET, 10 s timeout, 256 KB cap, UA `AXON-Signal/1.0
  (+https://stackwith.me)`, http/https only, localhost/private-range hosts refused) →
  evaluate `condition` (§5) → insert `runs` row (`ok` / `triggered` / `error` +
  `http_status` + result excerpt ≤ 8 KB) → update `agents.state`, `last_run_at` →
  on `triggered`, send alert email (§4e; mail failure appends to `note`, run stands) →
  **200** `{ run_id, status, triggered, quota: { used, limit } }`.
- A failed fetch still consumes a run (it *was* a run; keeps quota honest).
- `connector = webhook` agents refuse manual/scheduled runs → **400** (they are inbound).
- Errors: 400 bad body · 401 no auth · 403 not owner / no pass / disabled · 404 · 429.

### 4c. `agent-hook` — inbound webhook connector (JWT verification off)

- `POST /agent-hook?token=<hook_token>`, body ≤ 64 KB. Unknown token → **404**
  (uuid — unguessable). Agent must be `webhook`, enabled, owner passing + quota
  (as 4b). Evaluate condition against the raw body (`keyword` / `always`), log run,
  email on trigger → 200 `{ ok }`.

### 4d. Schedules (pg_cron, created in the migration)

- `axon-purge-runs` — daily: `delete from runs where started_at < now() - interval '7 days'`
  (the 7-day replay retention promise, enforced).
- `axon-scheduled-runs` — hourly: security-definer `dispatch_scheduled_runs()` selects
  due agents (`enabled`, schedule `hourly`, or `daily` with `last_run_at` > ~23 h old,
  owner has active pass, quota not exhausted) and `net.http_post`s each to `run-agent`
  with the cron secret read from **Vault** (`axon_cron_secret` — set at deploy, never
  committed).

### 4e. Alert email channel (resolved at Task 4 — default noted)

Default **Resend** free tier (3k/mo) via `RESEND_API_KEY` + one-time DNS verification of
`stackwith.me` (user-gated). Alternative if preferred: EmailJS's server-side REST API
(needs its private key + the "non-browser applications" account toggle). Either way the
run log records `triggered` regardless of mail success — the benefit is never silently lost.

## 5. Connectors, conditions, templates

`condition` jsonb, validated by the executor:

| kind | fields | semantics |
|---|---|---|
| `always` | — | every run triggers (heartbeat/digest) |
| `keyword` | `value` | body/title contains value, case-insensitive |
| `status` | `op` (eq,neq,gte,lt), `value` | compare HTTP status (uptime) |
| `json_path` | `path` (dot/index), `op` (eq,neq,gt,lt,contains), `value` | compare a JSON field |
| `new_item` | — | RSS/Atom: newest item id ≠ `state.last_item_id` |

- **`connectors/` (repo root, PR-open):** `rss.json`, `json-api.json`, `http-status.json`,
  `webhook.json` — `{ id, name, connector, description, default_condition,
  example_source, docs }` + an `index.json` manifest. Passthrough-copied into `_site/`
  so the console picker fetches same-origin. `connectors/README.md` states the PR contract.
- **`connectors/templates/` (≥ 5, one-click import):** price-watcher (`json_path` lt),
  rss-digest (`new_item`), uptime-ping (`status` neq 200), keyword-alert (`keyword`),
  release-watcher (GitHub releases Atom + `new_item`). Import = console pre-fills the
  agent form; the user supplies source specifics and saves.

## 6. Pages

### `/console.html` — sign-in-gated, `noindex`

Three states driven by session + `passes`: **signed-out** → auth gate (same options as
checkout); **signed-in, no active pass** → honest "no pass on this account" + links to
`/#plans`, the access-request form, community links; **pass holder** → full console:

- Pass panel: plan, pass id, status; **quota meter** `used / limit · resets <next month>`
  (from `run_quota`).
- Agent panel: create/edit form (name, connector picker fed by `connectors/index.json`,
  source URL, condition builder for §5 kinds, notify email, schedule, enabled toggle),
  **Run now** (`run-agent` invoke), delete. Limit errors from the server surface
  verbatim ("Hobby includes 1 active agent").
- Replay panel: runs list (time, status, HTTP status), expandable stored `result`,
  **Replay** = re-run now; "runs retained 7 days" note.
- Templates picker (Task 7), registry opt-in manage (Task 9), access-request form
  (Task 10), community links (Task 8), sign out.

### `/registry.html` — public

Reads `registry_public` (anon key, plain `fetch` to PostgREST — no SDK bundle).
Display names + since-dates in the site's list style; honest line that this is the
supporter registry. Indexable.

### Post-purchase (Task 11)

Success stage gains a "Open your console →" link; registry opt-in offered on success
(pass row lands via webhook seconds after payment — the opt-in save **polls `passes`
for up to ~60 s** before enabling). EmailJS benefits template gains console /
Discussions / registry links (**user-gated:** template edited in the EmailJS dashboard).

## 7. Code structure

| File | Change |
|---|---|
| `supabase/migrations/0001_entitlements.sql` | **New:** everything in §2–§4d |
| `supabase/functions/{razorpay-webhook,run-agent,agent-hook}/index.ts` | **New** (Deno) |
| `supabase/README.md` | **New:** apply/deploy/secrets runbook (user-gated steps) |
| `connectors/**` | **New:** presets + templates + PR contract |
| `src/console.html` | **New page** |
| `src/registry.html` | **New page** |
| `src/assets/js/sb.js` | **New shared module:** Supabase constants + client + `__axonAuthCfg` hook handling (extracted from checkout.js) |
| `src/assets/js/console.js` | **New esbuild IIFE entry** (manifest key `console`) |
| `src/assets/js/checkout.js` | Refactor to import `sb.js`; success-stage additions (Task 11) — behavior unchanged, smoke must stay green |
| `src/assets/css/styles.css` | Console/registry sections using existing tokens (BLOG/FAQ/404 untouched) |
| `scripts/build-assets.mjs` | `console` entry + `connectors/` passthrough |
| `scripts/smoke.mjs` | §9 additions |

QA hooks (standing, same status as the existing two): `window.__axonConsoleCfg`
(inject `{ session, pass, agents, runs, quota }` fixtures) and
`window.__axonRegistryCfg` (`{ entries }`) — smoke exercises rendering without network.

## 8. Error handling

| Failure | Behavior |
|---|---|
| Quota exhausted | 429 → meter full, "renews on <1st of next month>"; Run now disabled |
| Source fetch fails / times out | Run logged `error` + note; console shows it; run consumed |
| No active pass (or refunded) | Console no-pass state; executor 403; agents kept but inert |
| Agent limit reached | Server error surfaces verbatim in console form |
| Webhook bad signature | 401, no write (Razorpay retries; real events re-verify) |
| Webhook valid but malformed event | 200 `{ skipped }` + log — never a retry storm |
| Alert email fails | Run stays `triggered`; note records mail failure |
| Supabase unreachable in console | Honest inline error + retry button |
| Registry/console before config | Same "isn't configured yet" honesty pattern as checkout |

## 9. Testing & rollout

1. Every task: `npm run build && npm run smoke` **ALL PASS** before its commit.
2. Smoke additions (Task 13): console — no JS exceptions, `noindex`, gate visible
   signed-out, fixture session (`__axonConsoleCfg`) shows console, quota meter renders,
   agent form present, replay list renders fixtures; registry — renders fixture entries,
   title/canonical; access-request form present + validates; checkout success stage
   still green after Task 11.
3. SQL applied to the live project via dashboard SQL editor or `supabase db push`
   (**user-gated**); Edge Functions via `supabase functions deploy` (**user-gated**);
   secrets via `supabase secrets set` + Vault (**user-gated**). The repo carries
   everything so these are paste/run steps.
4. E2E once live: seed a test pass (SQL, then delete) → create agent from a template →
   Run now → run logged, meter ticks → trigger condition → alert mail → replay view →
   registry opt-in appears on `/registry.html` → access request lands `priority`.
   Then the real ₹5 purchase verification (still pending from the payments plan)
   additionally confirms webhook activation + refund revocation end-to-end.
5. Honest-copy line stays verbatim until Task 12's replacement is user-sanctioned;
   Studio parity decided in Task 14 before further Studio sales.

## Security notes

- Never committed: `sb_secret_…`, `RAZORPAY_WEBHOOK_SECRET`, `AXON_CRON_SECRET`,
  mail API key. Publishable anon key in client code is fine (existing stance).
- Executor fetch is SSRF-guarded (scheme allowlist, private-host denylist, size/time caps).
- `hook_token` is per-agent and rotatable by delete/recreate; inbound bodies capped.
- Public registry exposes display names only — no uuids, no emails.
