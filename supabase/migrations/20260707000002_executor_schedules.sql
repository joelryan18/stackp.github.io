-- ============================================================
-- AXON — executor schedules (fulfillment plan Task 4)
-- Spec §4d: docs/superpowers/specs/2026-07-07-hobby-benefits-fulfillment-design.md
-- Apply AFTER 20260707000001_entitlements.sql.
--
-- Requires (user-gated, see supabase/README.md):
--   select vault.create_secret('<same value as AXON_CRON_SECRET>', 'axon_cron_secret');
-- Until that secret exists the dispatcher logs a warning and skips — safe to
-- apply this file before the run-agent function is deployed.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- hourly dispatcher: POSTs each due agent to the run-agent Edge Function.
-- Due = enabled, sourced (not inbound-webhook), schedule hit, owner holds an
-- active pass, monthly quota not exhausted (executor re-checks authoritatively).
create or replace function public.dispatch_scheduled_runs()
returns void language plpgsql security definer set search_path = public as $$
declare
  secret text;
  fn_url constant text := 'https://jldzkjihbekxqxagkame.supabase.co/functions/v1/run-agent';
  a record;
begin
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'axon_cron_secret';
  if secret is null then
    raise warning 'axon_cron_secret missing from vault — scheduled runs skipped';
    return;
  end if;

  for a in
    select ag.id
    from agents ag
    where ag.enabled
      and ag.connector <> 'webhook'
      and (ag.schedule = 'hourly'
           or (ag.schedule = 'daily'
               and (ag.last_run_at is null
                    or ag.last_run_at < now() - interval '23 hours')))
      and exists (select 1 from passes p
                  where p.user_id = ag.user_id and p.status = 'active')
      and coalesce((select q.used from run_quota q
                    where q.user_id = ag.user_id
                      and q.month = date_trunc('month', now())::date), 0)
          < coalesce(public.plan_run_limit(public.active_plan(ag.user_id)), 0)
  loop
    perform net.http_post(
      url := fn_url,
      body := jsonb_build_object('agent_id', a.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-axon-cron', secret)
    );
  end loop;
end $$;

revoke all on function public.dispatch_scheduled_runs() from public, anon, authenticated;

select cron.schedule('axon-scheduled-runs', '23 * * * *',
  $$select public.dispatch_scheduled_runs()$$);

-- the "signal replay — 7-day retention" promise, enforced
select cron.schedule('axon-purge-runs', '17 3 * * *',
  $$delete from public.runs where started_at < now() - interval '7 days'$$);
