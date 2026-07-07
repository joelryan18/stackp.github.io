# AXON Anime List — public community tracker (2026-07-07)

> **Status:** executed 2026-07-08 (Tasks 1–9, 11); Task 10 (apply migration + live
> check) is user-gated and OPEN. Hobby benefits fulfillment plan
> (`2026-07-07-hobby-benefits-fulfillment.md`) is ON HOLD per user; this feature ran first.
> Deviations: (a) migration renamed to `20260708000001_anime.sql` — the on-hold
> executor work already holds version `20260707000002`; (b) QA screenshots caught the
> overlays painting on load (author `display:grid` beats the `hidden` attribute) —
> fixed with a `.ani [hidden] { display:none !important }` guard and the smoke checks
> now assert computed visibility, not just the DOM property.

## Goal

A public anime tracker at `/anime.html` — "AniList from AXON." Anyone can browse a
community catalog; signed-in users add anime they've watched (AniList search with
cover art), track status/score/progress, and everyone's personal lists are viewable.
Clean, professional, AXON design language throughout.

## User-sanctioned decisions (this plan)

- **Public page, indexed**, with per-user lists visible to everyone.
- **"Anime" nav link added to home + subpage + checkout navs** — an explicit,
  user-sanctioned change to the landing-page design (2026-07-07).
- **Community catalog is the main view**: every anime anyone has added, with watcher
  count + average score; click through to per-user lists.
- **Add flow = AniList GraphQL search** (free public API, `https://graphql.anilist.co`,
  no key, CORS-open) — covers/episodes/year auto-fill.
- **Backend = Supabase** (same project as checkout auth), new tables under RLS.
- Blog files stay untouched (out of scope, verbatim rule); BLOG/FAQ/404 CSS untouched.

## Architecture

### Database — new migration `supabase/migrations/20260708000001_anime.sql`

Follows the `20260707000001_entitlements.sql` idioms (RLS on, column-scoped grants,
`security_invoker` view, `set_updated_at` trigger — reuse the function if that
migration is applied, else create `if not exists`).

1. **`public.anime`** — canonical catalog keyed by AniList media id (natural dedupe):
   - `id bigint primary key check (id > 0)` (AniList id)
   - `title text not null check (char_length(title) between 1 and 200)`
   - `title_romaji text check (char_length(title_romaji) <= 200)`
   - `cover_url text check (cover_url like 'https://%.anilist.co/%')` — pins images
     to AniList's CDN so authenticated users can't inject arbitrary image URLs
   - `episodes int check (episodes between 0 and 10000)`, `year int`, `format text`,
     `genres text[]`, `created_at timestamptz default now()`
   - RLS: `select` to `anon, authenticated`; `insert` (column-scoped) to
     `authenticated` (client upserts on add; `on conflict (id) do nothing`). No
     update/delete from clients.
2. **`public.anime_entries`** — one row per user per anime:
   - `id uuid primary key default gen_random_uuid()`
   - `user_id uuid not null default auth.uid() references auth.users (id) on delete cascade`
   - `anime_id bigint not null references public.anime (id)`
   - `status text not null check (status in ('watching','completed','plan_to_watch','paused','dropped'))`
   - `score smallint check (score between 1 and 10)` (nullable)
   - `progress int not null default 0 check (progress between 0 and 10000)`
   - `created_at` / `updated_at` + trigger; `unique (user_id, anime_id)`
   - RLS: `select` to `anon, authenticated` (public lists); insert/update/delete
     only where `user_id = auth.uid()`, insert/update column-scoped to
     `(anime_id, status, score, progress)` — `user_id` always comes from the default.
3. **`public.profiles`** — public display names (auth.users is not readable):
   - `user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade`
   - `display_name text not null check (char_length(display_name) between 2 and 32)`
   - RLS: `select` to `anon, authenticated`; owner-only insert/update.
   - Client auto-creates on first entry: `user_metadata.full_name` → else
     `user_<uid-prefix>`; renameable from the My List view. Never derived from email
     (no address leakage).
4. **`public.anime_catalog` view** (`security_invoker = true`):
   `anime.* + count(entries) as watchers + round(avg(score),1) as avg_score`.

**Applying the migration is user-gated** (no `supabase` CLI assumed, `sb_secret_…`
rotated): paste the SQL into the Supabase dashboard SQL editor. Build + smoke pass
without it (smoke stubs the network); the live page shows an "initializing" empty
state until applied.

### Frontend

- **`src/anime.html`** (`layout: layouts/anime.njk`, `permalink: anime.html`,
  indexed + canonical; added to `src/sitemap.xml`).
- **`src/_includes/layouts/anime.njk`** — new layout on `base.njk`: nav with
  `Home (/) · Blog (/blog/) · Anime (aria-current)` + sign-in chip, standard footer,
  loads `consent` + new `anime` bundle.
- **`src/assets/js/anime.js`** — new esbuild IIFE entry (added to `entryPoints` +
  `manifestPlugin` map in `scripts/build-assets.mjs`, referenced as
  `{{ assets.anime }}`):
  - Own Supabase client init (same URL/publishable key as checkout.js) honoring the
    same **`window.__axonAuthCfg`** override hook (`{ session }` / `{ url, key }`)
    for smoke/QA. `checkout.js`/`payments.js` are NOT touched — they're QA'd and a
    live ₹5 test is pending.
  - Hash-routed views, no extra pages: `#catalog` (default) · `#mine` (signed-in) ·
    `#u/<user_id>` (someone's list) · add/edit via modal.
  - **Catalog**: responsive cover-card grid (cover, title, year/format, mono
    `watchers` + `avg` readouts), client search filter, status/sort controls
    (recently added / most watched / top rated). Card click → detail panel showing
    who watched it (profiles + status/score), each name linking to `#u/<id>`.
  - **Add modal**: debounced (~300 ms) AniList GraphQL search, keyboard-navigable
    results with covers; pick → upsert `anime` → insert `anime_entries` with
    status/score/progress. Signed-out click → inline auth panel.
  - **Auth panel**: Google OAuth (`redirectTo` = `/anime.html`) + email/password —
    matching what's actually enabled in Supabase (GitHub/Discord stay off here; no
    "soon" badges needed on this page).
  - **My List**: entries grouped by status, inline edit (status select, score,
    progress stepper), delete with confirm, display-name rename, sign-out.
  - **Security**: all user/AniList strings rendered via `textContent`/attribute
    setters — no `innerHTML` with untrusted data. Publishable key only.
- **CSS**: one new banner-commented `/* ANIME */` section appended to
  `src/assets/css/styles.css` (before RESPONSIVE; own media queries inside the
  section). Existing tokens only (`--surface`, `--line-strong`, `--signal`, `--mono`
  readouts); card patterns derived from `.tier`/`.post-card`; reuse `.btn`,
  `.btn--signal`, form-input styling. BLOG/FAQ/404 sections untouched.

### Nav change (sanctioned)

- `home.njk`: add `<a href="/anime.html" data-index="04">Anime</a>` to
  `.nav__links` **and** the burger/mobile menu list.
- `page.njk`: add Anime link (with `navCurrent` support) after Contact.
- `checkout.njk`: same link for parity.
- Blog navs untouched (out of scope).

### Smoke (`scripts/smoke.mjs`)

- Add `/anime.html` to the section-1 every-page loop (no exceptions, title,
  canonical, consent gating).
- New section 7, `anime:`-prefixed, following the 6/6b patterns:
  - Stub `window.fetch` via `Page.addScriptToEvaluateOnNewDocument`: route
    `graphql.anilist.co` → fixture search results; `/rest/v1/` (Supabase) → fixture
    catalog/entries/profiles; capture write payloads for assertions.
  - `anime: nav shows Home/Blog/Anime` (+ aria-current), `anime: catalog renders
    fixture cards`, `anime: signed-out add opens auth panel`, then preload
    `__axonAuthCfg = { session }` → `anime: search renders AniList fixtures`,
    `anime: add posts entry (anime upsert + entry insert captured)`,
    `anime: #mine renders own entries`, `anime: #u/<id> renders profile list`.

## Tasks

- [x] **1. Migration** — write `supabase/migrations/20260708000001_anime.sql`
      (tables, checks, RLS, grants, view, trigger) exactly per Architecture.
      Verify: SQL reviewed against entitlements-migration idioms; lints clean.
- [x] **2. Build wiring** — add `anime.js` entry + manifest key in
      `scripts/build-assets.mjs`. Verify: `npm run build` emits hashed `anime.*.js`
      and `src/_data/assets.json` gains `anime`.
- [x] **3. Layout + page** — `anime.njk`, `anime.html`, sitemap entry.
      Verify: `_site/anime.html` builds with nav/footer/canonical.
- [x] **4. CSS** — `/* ANIME */` section (grid, cards, modal, auth panel, list rows,
      responsive). Verify: no diffs outside the new section (`git diff` shows one
      contiguous block); other pages pixel-identical in QA shots.
- [x] **5. anime.js: client + views** — Supabase init w/ `__axonAuthCfg`, hash
      router, catalog fetch/render, detail panel, user-list view.
- [x] **6. anime.js: auth + add/edit** — auth panel (Google + email/password),
      AniList search modal, upsert/insert, my-list editing, profile create/rename,
      delete, sign-out.
- [x] **7. Nav links** — home.njk (desktop + burger), page.njk, checkout.njk.
      Verify: existing smoke mobile-menu section still passes.
- [x] **8. Smoke section 7 + section-1 loop entry** — as specced above.
      Verify: `npm run build && npm run smoke` → ALL PASS.
- [x] **9. QA shots** — `npm run qa`; eyeball anime page desktop+mobile; confirm
      home/subpages unchanged except the sanctioned nav link.
- [ ] **10. USER-GATED: apply migration** — user pastes migration SQL in Supabase
      SQL editor; then live check on stackwith.me: sign in with Google, add one
      anime via search, see it in catalog + `#mine`, second browser sees it
      signed-out.
- [x] **11. Ship** — commit + push to `main`, verify Pages deploy, update CLAUDE.md
      current-state section.

## Open risks / notes

- AniList API is third-party: add flow degrades gracefully (error note in modal) if
  it's down; catalog/browse never depends on it.
- Public writes = spam surface. Mitigations now: auth required, unique per
  user/anime, hard CHECK constraints, CDN-pinned cover URLs. If abuse appears
  later: Edge Function validator that verifies ids against AniList server-side.
- Confirm-email is still ON with ~2 mails/hour Supabase SMTP cap — new email
  signups on the anime page hit the same limit (recommendation to turn it off
  stands; Google OAuth unaffected).
