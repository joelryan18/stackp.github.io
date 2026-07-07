-- ============================================================
-- AXON — anime list schema + RLS (community tracker Task 1)
-- Plan: docs/superpowers/plans/2026-07-07-anime-list-community-tracker.md
-- Apply: paste whole file into the Supabase SQL editor, or `supabase db push`.
-- Plain CREATEs — apply once; not idempotent by design.
-- Independent of 20260707000001_entitlements.sql (no shared objects).
--
-- Trust boundary: the catalog and everyone's entries/profiles are public
-- reads (anon + authenticated). Writes are authenticated-only and
-- column-scoped; user_id always comes from auth.uid() defaults, never from
-- the client. Catalog rows are insert-only (upsert dedupe on AniList id) —
-- no client can mutate or delete another user's view of a title.
-- ============================================================

-- ---------- anime — canonical catalog keyed by AniList media id ----------

create table public.anime (
  id bigint primary key check (id > 0),               -- AniList media id
  title text not null check (char_length(title) between 1 and 200),
  title_romaji text check (char_length(title_romaji) <= 200),
  -- pin covers to AniList's CDN so clients can't inject arbitrary image URLs
  cover_url text check (cover_url ~ '^https://[a-z0-9.-]+\.anilist\.co/'),
  episodes integer check (episodes between 0 and 10000),
  year integer check (year between 1900 and 2100),
  format text check (format in ('TV','TV_SHORT','MOVIE','SPECIAL','OVA','ONA','MUSIC')),
  genres text[] check (coalesce(array_length(genres, 1), 0) <= 20),
  created_at timestamptz not null default now()
);

alter table public.anime enable row level security;

create policy "anime: public reads" on public.anime
  for select to anon, authenticated using (true);

-- clients add missing titles (insert … on conflict (id) do nothing);
-- rows are immutable afterwards — no update/delete grants exist
create policy "anime: authenticated inserts" on public.anime
  for insert to authenticated with check (true);

revoke all on public.anime from anon;
grant select on public.anime to anon;
revoke insert, update, delete, truncate on public.anime from authenticated;
grant select on public.anime to authenticated;
grant insert (id, title, title_romaji, cover_url, episodes, year, format, genres)
  on public.anime to authenticated;

-- ---------- anime_entries — one row per user per title ----------

create table public.anime_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  anime_id bigint not null references public.anime(id),
  status text not null check (status in ('watching','completed','plan_to_watch','paused','dropped')),
  score smallint check (score between 1 and 10),
  progress integer not null default 0 check (progress between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, anime_id)
);

create index anime_entries_anime_idx on public.anime_entries (anime_id);
create index anime_entries_user_idx on public.anime_entries (user_id, updated_at desc);

alter table public.anime_entries enable row level security;

create policy "anime_entries: public reads" on public.anime_entries
  for select to anon, authenticated using (true);

create policy "anime_entries: owner inserts" on public.anime_entries
  for insert to authenticated with check (user_id = auth.uid());

create policy "anime_entries: owner updates" on public.anime_entries
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "anime_entries: owner deletes" on public.anime_entries
  for delete to authenticated using (user_id = auth.uid());

-- column scoping: clients never write user_id or timestamps
revoke all on public.anime_entries from anon;
grant select on public.anime_entries to anon;
revoke insert, update, delete, truncate on public.anime_entries from authenticated;
grant select, delete on public.anime_entries to authenticated;
grant insert (anime_id, status, score, progress) on public.anime_entries to authenticated;
grant update (status, score, progress) on public.anime_entries to authenticated;

create or replace function public.touch_anime_entry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.touch_anime_entry() from public, anon, authenticated;

create trigger anime_entries_touch
  before update on public.anime_entries
  for each row execute function public.touch_anime_entry();

-- ---------- profiles — public display names (auth.users is not readable) ----------

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 32),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: public reads" on public.profiles
  for select to anon, authenticated using (true);

create policy "profiles: owner inserts" on public.profiles
  for insert to authenticated with check (user_id = auth.uid());

create policy "profiles: owner updates" on public.profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.profiles from anon;
grant select on public.profiles to anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (display_name) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------- anime_catalog — public aggregate view ----------
-- security_invoker: runs under the caller's grants; base tables are
-- public-select so anon sees the same catalog as authenticated.

create view public.anime_catalog with (security_invoker = on) as
  select
    a.id, a.title, a.title_romaji, a.cover_url, a.episodes, a.year,
    a.format, a.genres, a.created_at,
    count(e.id)::integer as watchers,
    round(avg(e.score), 1) as avg_score,
    max(e.updated_at) as last_activity
  from public.anime a
  left join public.anime_entries e on e.anime_id = a.id
  group by a.id;

revoke all on public.anime_catalog from anon, authenticated;
grant select on public.anime_catalog to anon, authenticated;
