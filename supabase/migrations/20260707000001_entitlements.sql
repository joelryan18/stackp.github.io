-- ============================================================
-- AXON — entitlements schema + RLS (fulfillment plan Task 2)
-- Spec: docs/superpowers/specs/2026-07-07-hobby-benefits-fulfillment-design.md
-- Apply: paste whole file into the Supabase SQL editor, or `supabase db push`.
-- Plain CREATEs — apply once; not idempotent by design.
--
-- Trust boundary: clients (anon/authenticated) get RLS-scoped reads and the
-- few column-scoped writes below. Passes, runs and quota are written ONLY by
-- Edge Functions (service role). A client can never grant itself a pass,
-- an extra agent, or extra runs.
-- ============================================================

-- ---------- plan limits (single source of truth; NULL = unlimited) ----------

create or replace function public.plan_agent_limit(p text)
returns integer language sql immutable as $$
  select case p when 'hobby' then 1 when 'studio' then null::integer else 0 end
$$;

create or replace function public.plan_run_limit(p text)
returns integer language sql immutable as $$
  select case p when 'hobby' then 500 when 'studio' then 100000 else 0 end
$$;

revoke all on function public.plan_agent_limit(text) from public, anon, authenticated;
revoke all on function public.plan_run_limit(text) from public, anon, authenticated;

-- ---------- helpers (security definer; trigger-only — no client EXECUTE,
--            so they are not probe-able via PostgREST RPC) ----------

create or replace function public.has_active_pass(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from passes where user_id = uid and status = 'active')
$$;

create or replace function public.active_plan(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select plan from passes
  where user_id = uid and status = 'active'
  order by created_at asc limit 1
$$;

revoke all on function public.has_active_pass(uuid) from public, anon, authenticated;
revoke all on function public.active_plan(uuid) from public, anon, authenticated;

-- ---------- passes — entitlements (written only by the Razorpay webhook) ----------

create table public.passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('hobby','studio')),
  payment_id text not null unique,
  amount integer not null,
  buyer_email text,
  buyer_name text,
  status text not null default 'active' check (status in ('active','refunded','revoked')),
  created_at timestamptz not null default now()
);

create index passes_user_idx on public.passes (user_id);

alter table public.passes enable row level security;

create policy "passes: owner reads" on public.passes
  for select to authenticated using (user_id = auth.uid());

revoke all on public.passes from anon;
revoke insert, update, delete, truncate on public.passes from authenticated;

-- ---------- agents — signal watchers ----------

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  connector text not null check (connector in ('rss','json_api','http_status','webhook')),
  source_url text check (source_url ~* '^https?://'),
  condition jsonb not null default '{"kind":"always"}'::jsonb check (condition ? 'kind'),
  notify_email text not null check (position('@' in notify_email) > 1),
  schedule text not null default 'manual' check (schedule in ('manual','hourly','daily')),
  enabled boolean not null default true,
  state jsonb not null default '{}'::jsonb,          -- executor-owned (e.g. last_item_id)
  hook_token uuid not null default gen_random_uuid(), -- inbound webhook auth
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  constraint agents_source_required check (connector = 'webhook' or source_url is not null)
);

create index agents_user_idx on public.agents (user_id);
create unique index agents_hook_token_idx on public.agents (hook_token);

alter table public.agents enable row level security;

create policy "agents: owner reads" on public.agents
  for select to authenticated using (user_id = auth.uid());

create policy "agents: pass holder inserts" on public.agents
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.passes p
                where p.user_id = auth.uid() and p.status = 'active')
  );

create policy "agents: owner updates" on public.agents
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "agents: owner deletes" on public.agents
  for delete to authenticated using (user_id = auth.uid());

-- column scoping: clients never write user_id/state/hook_token/last_run_at
revoke all on public.agents from anon;
revoke insert, update, truncate on public.agents from authenticated;
grant insert (name, connector, source_url, condition, notify_email, schedule, enabled)
  on public.agents to authenticated;
grant update (name, connector, source_url, condition, notify_email, schedule, enabled)
  on public.agents to authenticated;

-- agent limit: security-definer BEFORE INSERT trigger (not an RLS subquery on
-- the same table — avoids RLS recursion; advisory lock closes the count race)
create or replace function public.enforce_agent_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lim integer;
  cnt integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  lim := plan_agent_limit(active_plan(new.user_id));
  if lim is null then
    return new; -- unlimited
  end if;
  select count(*) into cnt from agents where user_id = new.user_id;
  if cnt >= lim then
    raise exception 'your plan includes % active agent(s)', lim;
  end if;
  return new;
end $$;

revoke all on function public.enforce_agent_limit() from public, anon, authenticated;

create trigger agents_limit
  before insert on public.agents
  for each row execute function public.enforce_agent_limit();

-- ---------- runs — run log (replay source; 7-day retention via pg_cron, Task 4) ----------

create table public.runs (
  id bigint generated always as identity primary key,
  agent_id uuid not null references public.agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  status text not null check (status in ('ok','triggered','error')),
  http_status integer,
  result jsonb,
  note text
);

create index runs_user_idx on public.runs (user_id, started_at desc);
create index runs_agent_idx on public.runs (agent_id, started_at desc);
create index runs_purge_idx on public.runs (started_at);

alter table public.runs enable row level security;

create policy "runs: owner reads" on public.runs
  for select to authenticated using (user_id = auth.uid());

revoke all on public.runs from anon;
revoke insert, update, delete, truncate on public.runs from authenticated;

-- ---------- run_quota — monthly counter (survives the 7-day purge:
--            THIS is the quota's source of truth, not the runs table) ----------

create table public.run_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  used integer not null default 0,
  primary key (user_id, month)
);

alter table public.run_quota enable row level security;

create policy "run_quota: owner reads" on public.run_quota
  for select to authenticated using (user_id = auth.uid());

revoke all on public.run_quota from anon;
revoke insert, update, delete, truncate on public.run_quota from authenticated;

-- atomic take-one-run: true = run granted, false = quota exhausted.
-- Called by the run executor (service role) only.
create or replace function public.increment_run_quota(uid uuid, cap integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into run_quota (user_id, month, used)
  values (uid, date_trunc('month', now())::date, 1)
  on conflict (user_id, month)
    do update set used = run_quota.used + 1
    where run_quota.used < cap;
  return found;
end $$;

revoke all on function public.increment_run_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_run_quota(uuid, integer) to service_role;

-- ---------- access_requests — priority queue ----------

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  message text not null check (char_length(message) between 1 and 2000),
  priority boolean not null default false,
  status text not null default 'queued' check (status in ('queued','answered','closed')),
  created_at timestamptz not null default now()
);

-- owner triage order (Supabase dashboard): priority desc, created_at asc
create index access_requests_queue_idx on public.access_requests (priority desc, created_at asc);

alter table public.access_requests enable row level security;

create policy "access_requests: owner inserts" on public.access_requests
  for insert to authenticated with check (user_id = auth.uid());

create policy "access_requests: owner reads" on public.access_requests
  for select to authenticated using (user_id = auth.uid());

-- clients submit email + message only; priority/status are stamped server-side
revoke all on public.access_requests from anon;
revoke insert, update, delete, truncate on public.access_requests from authenticated;
grant insert (email, message) on public.access_requests to authenticated;

create or replace function public.stamp_access_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.priority := has_active_pass(new.user_id);
  new.status := 'queued';
  return new;
end $$;

revoke all on function public.stamp_access_request() from public, anon, authenticated;

create trigger access_requests_stamp
  before insert on public.access_requests
  for each row execute function public.stamp_access_request();

-- ---------- registry_entries — supporter listing opt-in ----------

create table public.registry_entries (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

alter table public.registry_entries enable row level security;

create policy "registry: owner reads" on public.registry_entries
  for select to authenticated using (user_id = auth.uid());

create policy "registry: pass holder inserts" on public.registry_entries
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.passes p
                where p.user_id = auth.uid() and p.status = 'active')
  );

create policy "registry: pass holder updates" on public.registry_entries
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.passes p
                where p.user_id = auth.uid() and p.status = 'active')
  );

create policy "registry: owner deletes" on public.registry_entries
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.registry_entries from anon;
revoke insert, update, truncate on public.registry_entries from authenticated;
grant insert (display_name) on public.registry_entries to authenticated;
grant update (display_name) on public.registry_entries to authenticated;

-- public read surface: display names + dates only — never uuids or emails.
-- Owner-security view (owner bypasses base-table RLS) — the intended pattern
-- for a public projection of an RLS-protected table.
create view public.registry_public with (security_invoker = off) as
  select display_name, created_at from public.registry_entries;

-- the single-table view would be auto-updatable — reads only, explicitly
revoke all on public.registry_public from anon, authenticated;
grant select on public.registry_public to anon, authenticated;
