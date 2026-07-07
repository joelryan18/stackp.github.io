# AXON — Supabase backend (fulfillment)

Source of truth for everything that runs inside the Supabase project
(`jldzkjihbekxqxagkame` — the same project that powers checkout sign-in).
Spec: `docs/superpowers/specs/2026-07-07-hobby-benefits-fulfillment-design.md`.

```
supabase/
  migrations/   SQL, one file per plan task, apply in filename order
  functions/    Edge Functions (Deno) — razorpay-webhook, run-agent, agent-hook
```

## Applying migrations (user-gated — needs dashboard or CLI auth)

**Option A — dashboard (no install):** Supabase → SQL Editor → paste the whole
migration file → Run. Apply files in filename order, each exactly once (they are
plain CREATEs, not idempotent).

**Option B — CLI:**

```sh
brew install supabase/tap/supabase
supabase login                                  # opens browser
supabase link --project-ref jldzkjihbekxqxagkame
supabase db push                                # applies supabase/migrations/*
```

### Verify after applying `20260707000001_entitlements.sql`

```sql
select tablename from pg_tables where schemaname = 'public' order by 1;
-- expect: access_requests, agents, passes, registry_entries, run_quota, runs

select tablename, policyname from pg_policies where schemaname = 'public' order by 1, 2;
-- expect the "owner reads / pass holder inserts / …" policies per table

select rolname from pg_roles r join pg_class c on c.relowner = r.oid
 where c.relname = 'registry_public';
```

Client sanity (publishable key, signed in, **no pass yet**): selecting from
`passes` returns `[]`; inserting into `agents` fails; inserting into
`access_requests` succeeds and lands with `priority = false`.

## Edge Functions (user-gated — needs CLI auth)

```sh
supabase functions deploy razorpay-webhook --no-verify-jwt   # Razorpay calls it, no JWT
```

### Wiring the activation webhook (Razorpay dashboard)

1. Generate a strong secret: `openssl rand -hex 32`.
2. `supabase secrets set RAZORPAY_WEBHOOK_SECRET=<that value>`
3. Razorpay dashboard → Settings → Webhooks → Add:
   - URL `https://jldzkjihbekxqxagkame.supabase.co/functions/v1/razorpay-webhook`
   - Secret: the same value
   - Active events: **payment.captured** and **refund.processed** only.
4. Sanity: `curl -X POST <url> -d '{}'` → `401 {"error":"bad_signature"}` proves
   the function is up and rejecting unsigned calls.
5. Real proof is the pending ₹5 verification: after payment, a `passes` row with
   `plan='hobby', amount=500, status='active'` and your `auth_uid`; after the
   refund, the same row flips to `status='refunded'`.

Idempotency: Razorpay retries are safe — the insert upserts on `payment_id`.
Authentic-but-invalid events (wrong amount/plan/uid) are answered `200
{skipped}` and logged, so they never retry-storm; genuine write failures answer
5xx so Razorpay retries them.

## Secrets (arrive with Tasks 3–4 — never commit any of these)

| Secret | Where | Used by |
|---|---|---|
| `RAZORPAY_WEBHOOK_SECRET` | `supabase secrets set` | `razorpay-webhook` signature verify |
| `AXON_CRON_SECRET` | `supabase secrets set` **and** Vault (`select vault.create_secret('<value>', 'axon_cron_secret');`) | `run-agent` scheduled dispatch |
| Alert-mail API key | `supabase secrets set` | `run-agent` / `agent-hook` trigger emails |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions by
the platform — never in the repo. The `sb_secret_…` admin key must never be
committed anywhere (standing rule).
