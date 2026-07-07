/* ============================================================
   AXON — anime.js · community anime tracker (/anime.html)
   Catalog + per-user lists on Supabase (RLS: public reads,
   owner-only writes); title search via the AniList GraphQL API.
   ============================================================ */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jldzkjihbekxqxagkame.supabase.co"; // same project as checkout.js
const SUPABASE_ANON_KEY = "sb_publishable_Nm79C7JsHnf4lLjruU5g2Q_EuwskRuK"; // publishable key — safe to ship by design
const ANILIST_URL = "https://graphql.anilist.co";
const ANILIST_QUERY = `query ($search: String) {
  Page(perPage: 8) {
    media(search: $search, type: ANIME, isAdult: false) {
      id title { english romaji } coverImage { large }
      episodes seasonYear format genres
    }
  }
}`;

const STATUSES = ["watching", "completed", "plan_to_watch", "paused", "dropped"];
const STATUS_LABEL = {
  watching: "Watching", completed: "Completed", plan_to_watch: "Plan to watch",
  paused: "Paused", dropped: "Dropped",
};

(() => {
  "use strict";
  const grid = document.getElementById("aniGrid");
  if (!grid) return;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // — session plumbing (window.__axonAuthCfg is the QA/smoke override hook — do not remove)
  const hook = window.__axonAuthCfg; // may carry { session } and/or { url, key } overrides
  const authUrl = hook && hook.url !== undefined ? hook.url : SUPABASE_URL;
  const authKey = hook && hook.key !== undefined ? hook.key : SUPABASE_ANON_KEY;
  const sb = createClient(authUrl, authKey);

  let identity = null; // { uid, email, name } — null while signed out
  let catalog = []; // cached anime_catalog rows
  let pendingAdd = false; // reopen the add modal after a successful sign-in

  function applySession(session) {
    if (!session || !session.user) {
      identity = null;
    } else {
      const u = session.user;
      identity = {
        uid: u.id,
        email: u.email || "",
        name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "user_" + u.id.slice(0, 8),
      };
    }
    $("aniTabMine").hidden = !identity;
    $("aniNavAuth").hidden = !!identity;
    if (identity) {
      $("aniAuth").hidden = true;
      if (pendingAdd) { pendingAdd = false; openModal(); }
      if (location.hash === "#mine") renderMine();
    } else if (location.hash === "#mine") {
      location.hash = "#catalog";
    }
  }

  if (hook && hook.session) {
    applySession(hook.session);
  } else {
    sb.auth.getSession().then(({ data }) => applySession(data.session));
    sb.auth.onAuthStateChange((_event, session) => applySession(session));
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    const oauthErr = h.get("error_description");
    if (oauthErr) { openAuth(); showAuthError(oauthErr.replace(/\+/g, " ") + " You can retry."); }
  }

  // — profiles: everyone appears under a display name, never an email
  async function ensureProfile() {
    const { data } = await sb.from("profiles").select("display_name").eq("user_id", identity.uid).maybeSingle();
    if (data) return data.display_name;
    const name = identity.name.slice(0, 32).padEnd(2, "_");
    await sb.from("profiles").insert({ display_name: name }); // 23505 race → row exists, fine
    return name;
  }

  // ============================================================
  // views — #catalog (default) · #a/<id> · #mine · #u/<uuid>
  // ============================================================
  const views = document.querySelectorAll(".ani__view");

  function setView(name) {
    views.forEach((v) => { v.hidden = v.getAttribute("data-view") !== name; });
    document.querySelectorAll(".ani__tab").forEach((t) => {
      if (t.getAttribute("data-view") === name) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
  }

  function route() {
    const hash = location.hash || "#catalog";
    let m;
    if ((m = hash.match(/^#a\/(\d+)$/))) { setView("detail"); renderDetail(Number(m[1])); return; }
    if ((m = hash.match(/^#u\/([0-9a-f-]{36})$/))) { setView("user"); renderUser(m[1]); return; }
    if (hash === "#mine") {
      if (!identity) { setView("catalog"); openAuth(); return; }
      setView("mine"); renderMine(); return;
    }
    setView("catalog");
  }
  window.addEventListener("hashchange", route);

  // ============================================================
  // catalog
  // ============================================================
  const catalogStatus = $("aniCatalogStatus");

  async function loadCatalog() {
    const { data, error } = await sb.from("anime_catalog").select("*");
    if (error) {
      catalogStatus.textContent = "Catalog is initializing — check back soon.";
      return;
    }
    catalog = data || [];
    renderCatalog();
  }

  function renderCatalog() {
    const q = $("aniFilter").value.trim().toLowerCase();
    const sort = $("aniSort").value;
    let rows = catalog.filter((a) =>
      !q || a.title.toLowerCase().includes(q) || (a.title_romaji || "").toLowerCase().includes(q));
    rows = rows.slice().sort((a, b) => {
      if (sort === "watchers") return b.watchers - a.watchers;
      if (sort === "score") return (b.avg_score || 0) - (a.avg_score || 0);
      return (b.last_activity || "").localeCompare(a.last_activity || "");
    });

    grid.replaceChildren();
    if (!rows.length) {
      catalogStatus.textContent = q ? "No titles match “" + q + "”." : "No titles yet — be the first to add one.";
      catalogStatus.hidden = false; grid.hidden = true;
      return;
    }
    catalogStatus.hidden = true; grid.hidden = false;
    rows.forEach((a) => {
      const card = el("button", "ani__card");
      card.type = "button";
      card.setAttribute("data-anime-id", a.id);
      if (a.cover_url) {
        const img = el("img", "ani__cover");
        img.src = a.cover_url; img.alt = ""; img.loading = "lazy";
        card.appendChild(img);
      } else {
        card.appendChild(el("div", "ani__cover"));
      }
      const body = el("div", "ani__cardbody");
      body.appendChild(el("div", "ani__cardtitle", a.title));
      body.appendChild(el("div", "ani__cardmeta", [a.year, a.format, a.episodes ? a.episodes + " ep" : null].filter(Boolean).join(" · ")));
      const stats = el("div", "ani__cardstats");
      const w = el("span"); w.append("watchers "); w.appendChild(el("b", null, String(a.watchers)));
      stats.appendChild(w);
      if (a.avg_score != null) {
        const s = el("span"); s.append("avg "); s.appendChild(el("b", null, String(a.avg_score)));
        stats.appendChild(s);
      }
      body.appendChild(stats);
      card.appendChild(body);
      card.addEventListener("click", () => { location.hash = "#a/" + a.id; });
      grid.appendChild(card);
    });
  }

  $("aniFilter").addEventListener("input", renderCatalog);
  $("aniSort").addEventListener("change", renderCatalog);

  // ============================================================
  // detail — one title, everyone tracking it
  // ============================================================
  async function renderDetail(animeId) {
    const box = $("aniDetail");
    box.replaceChildren(el("p", "ani__status", "Loading…"));
    const [{ data: anime }, { data: entries }] = await Promise.all([
      sb.from("anime").select("*").eq("id", animeId).maybeSingle(),
      sb.from("anime_entries").select("*").eq("anime_id", animeId).order("updated_at", { ascending: false }),
    ]);
    if (!anime) { box.replaceChildren(el("p", "ani__status", "Title not found.")); return; }
    const names = await profileNames((entries || []).map((e) => e.user_id));

    box.replaceChildren();
    if (anime.cover_url) {
      const img = el("img", "ani__cover"); img.src = anime.cover_url; img.alt = "";
      box.appendChild(img);
    } else {
      box.appendChild(el("div", "ani__cover"));
    }
    const info = el("div");
    info.appendChild(el("h2", "ani__detailtitle", anime.title));
    info.appendChild(el("p", "ani__detailmeta",
      [anime.title_romaji, anime.year, anime.format, anime.episodes ? anime.episodes + " episodes" : null, (anime.genres || []).join(" / ")].filter(Boolean).join(" · ")));
    const list = el("div", "ani__watchers");
    if (!(entries || []).length) list.appendChild(el("p", "ani__status", "Nobody has logged this yet."));
    (entries || []).forEach((e) => {
      const row = el("div", "ani__watcher");
      const a = el("a", null, names.get(e.user_id) || "user");
      a.href = "#u/" + e.user_id;
      row.appendChild(a);
      row.appendChild(statusChip(e.status));
      if (anime.episodes && e.progress) row.appendChild(el("span", "ani__rowmeta", e.progress + "/" + anime.episodes + " ep"));
      if (e.score != null) row.appendChild(el("span", "ani__score", "★ " + e.score));
      list.appendChild(row);
    });
    info.appendChild(list);
    box.appendChild(info);
  }
  $("aniDetailBack").addEventListener("click", () => { location.hash = "#catalog"; });

  function statusChip(status) {
    const mod = { watching: " ani__chip--watching", completed: " ani__chip--completed", dropped: " ani__chip--dropped" }[status] || "";
    return el("span", "ani__chip" + mod, STATUS_LABEL[status] || status);
  }

  async function profileNames(userIds) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return new Map();
    const { data } = await sb.from("profiles").select("user_id, display_name").in("user_id", ids);
    return new Map((data || []).map((p) => [p.user_id, p.display_name]));
  }

  // ============================================================
  // list rendering — grouped rows (mine = editable, user = read-only)
  // ============================================================
  function renderRows(target, entries, editable) {
    target.replaceChildren();
    if (!entries.length) {
      target.appendChild(el("p", "ani__status", editable ? "Nothing here yet — hit “+ Add anime”." : "This list is empty."));
      return;
    }
    STATUSES.forEach((status) => {
      const group = entries.filter((e) => e.status === status);
      if (!group.length) return;
      target.appendChild(el("h3", "ani__group", STATUS_LABEL[status] + " · " + group.length));
      const rows = el("div", "ani__rows");
      group.forEach((e) => rows.appendChild(editable ? editableRow(e) : readonlyRow(e)));
      target.appendChild(rows);
    });
  }

  function rowShell(e) {
    const row = el("div", "ani__row");
    const a = e.anime || {};
    if (a.cover_url) {
      const img = el("img", "ani__rowcover"); img.src = a.cover_url; img.alt = ""; img.loading = "lazy";
      row.appendChild(img);
    } else {
      row.appendChild(el("div", "ani__rowcover"));
    }
    const title = el("a", "ani__rowtitle", a.title || "—");
    title.href = "#a/" + e.anime_id;
    row.appendChild(title);
    return row;
  }

  function readonlyRow(e) {
    const row = rowShell(e);
    const a = e.anime || {};
    if (e.progress) row.appendChild(el("span", "ani__rowmeta", e.progress + (a.episodes ? "/" + a.episodes : "") + " ep"));
    if (e.score != null) row.appendChild(el("span", "ani__score", "★ " + e.score));
    return row;
  }

  function editableRow(e) {
    const row = rowShell(e);
    const acts = el("div", "ani__rowacts");

    const status = el("select");
    STATUSES.forEach((s) => {
      const o = el("option", null, STATUS_LABEL[s]); o.value = s; o.selected = s === e.status;
      status.appendChild(o);
    });
    status.setAttribute("aria-label", "Status");
    acts.appendChild(status);

    const score = el("select");
    const none = el("option", null, "★ —"); none.value = ""; score.appendChild(none);
    for (let i = 10; i >= 1; i--) {
      const o = el("option", null, "★ " + i); o.value = String(i); o.selected = e.score === i;
      score.appendChild(o);
    }
    score.setAttribute("aria-label", "Score");
    acts.appendChild(score);

    const progress = el("input");
    progress.type = "number"; progress.min = "0"; progress.max = "10000";
    progress.value = String(e.progress || 0);
    progress.setAttribute("aria-label", "Episodes seen");
    acts.appendChild(progress);

    const save = async () => {
      await sb.from("anime_entries").update({
        status: status.value,
        score: score.value ? Number(score.value) : null,
        progress: Math.max(0, Math.min(10000, Number(progress.value) || 0)),
      }).eq("id", e.id);
      loadCatalog();
    };
    status.addEventListener("change", save);
    score.addEventListener("change", save);
    progress.addEventListener("change", save);

    const del = el("button", "ani__del", "[ remove ]");
    del.type = "button";
    del.addEventListener("click", async () => {
      if (!window.confirm("Remove “" + ((e.anime && e.anime.title) || "this title") + "” from your list?")) return;
      await sb.from("anime_entries").delete().eq("id", e.id);
      row.remove();
      loadCatalog();
    });
    acts.appendChild(del);

    row.appendChild(acts);
    return row;
  }

  // ============================================================
  // my list
  // ============================================================
  async function renderMine() {
    if (!identity) return;
    $("aniMe").hidden = false;
    $("aniMeName").textContent = await ensureProfile();
    const { data } = await sb.from("anime_entries")
      .select("*, anime(*)").eq("user_id", identity.uid).order("updated_at", { ascending: false });
    renderRows($("aniMine"), data || [], true);
  }

  $("aniSignout").addEventListener("click", () => {
    sb.auth.signOut();
    applySession(null);
    location.hash = "#catalog";
  });

  $("aniRename").addEventListener("click", async () => {
    const current = $("aniMeName").textContent;
    const name = (window.prompt("Display name (2–32 characters):", current) || "").trim();
    if (!name || name === current) return;
    const { error } = await sb.from("profiles").update({ display_name: name.slice(0, 32) }).eq("user_id", identity.uid);
    if (!error) $("aniMeName").textContent = name.slice(0, 32);
  });

  // ============================================================
  // someone else's list
  // ============================================================
  async function renderUser(userId) {
    const [{ data: profile }, { data }] = await Promise.all([
      sb.from("profiles").select("display_name").eq("user_id", userId).maybeSingle(),
      sb.from("anime_entries").select("*, anime(*)").eq("user_id", userId).order("updated_at", { ascending: false }),
    ]);
    $("aniUserName").textContent = profile ? profile.display_name : "user";
    renderRows($("aniUserList"), data || [], false);
  }
  $("aniUserBack").addEventListener("click", () => { location.hash = "#catalog"; });

  // ============================================================
  // sign-in panel
  // ============================================================
  const authWrap = $("aniAuth");
  const authErr = $("aniAuthErr");
  const authForm = $("aniAuthForm");
  const authSubmit = $("aniAuthSubmit");
  const authToggle = $("aniAuthToggle");

  function openAuth() { authErr.hidden = true; authWrap.hidden = false; $("aniAuthEmail").focus(); }
  function showAuthError(message) { authErr.textContent = message; authErr.hidden = false; }

  $("aniAuthClose").addEventListener("click", () => { authWrap.hidden = true; pendingAdd = false; });
  $("aniNavAuth").addEventListener("click", openAuth);

  authWrap.querySelectorAll("[data-auth]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      authErr.hidden = true;
      const { error } = await sb.auth.signInWithOAuth({
        provider: btn.getAttribute("data-auth"),
        options: { redirectTo: location.origin + location.pathname },
      });
      if (error) showAuthError(error.message + " You can retry.");
    }));

  let mode = "signin";
  authToggle.addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    authSubmit.textContent = mode === "signin" ? "Sign in" : "Create account";
    authToggle.textContent = mode === "signin" ? "New here? Create an account" : "Have an account? Sign in";
    $("aniAuthPassword").setAttribute("autocomplete", mode === "signin" ? "current-password" : "new-password");
    authErr.hidden = true;
  });

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!authForm.checkValidity()) { authForm.reportValidity(); return; }
    authErr.hidden = true;
    const creds = { email: $("aniAuthEmail").value.trim(), password: $("aniAuthPassword").value };
    authSubmit.setAttribute("aria-busy", "true");
    const { data, error } = mode === "signin"
      ? await sb.auth.signInWithPassword(creds)
      : await sb.auth.signUp({ ...creds, options: { emailRedirectTo: location.origin + location.pathname } });
    authSubmit.removeAttribute("aria-busy");
    if (error) {
      const hint = mode === "signin" ? " New here? Use “Create an account” below." : " Already registered? Switch to “Sign in”.";
      showAuthError(error.message + hint);
      return;
    }
    if (mode === "signup" && data && !data.session) {
      showAuthError("Almost there — confirm the email we just sent you, then reload this page.");
    }
    // a returned session flows through onAuthStateChange → applySession
  });

  // ============================================================
  // add modal — AniList search → entry form
  // ============================================================
  const modal = $("aniModal");
  const searchInput = $("aniSearch");
  const searchStatus = $("aniSearchStatus");
  const results = $("aniResults");
  const stages = modal.querySelectorAll(".ani__modalstage");
  let picked = null; // AniList media picked from the results

  function setModalStage(name) {
    stages.forEach((s) => { s.hidden = s.getAttribute("data-stage") !== name; });
  }

  function openModal() {
    picked = null;
    searchInput.value = "";
    results.replaceChildren();
    searchStatus.hidden = true;
    $("aniEntryErr").hidden = true;
    setModalStage("search");
    modal.hidden = false;
    searchInput.focus();
  }

  $("aniAdd").addEventListener("click", () => {
    if (!identity) { pendingAdd = true; openAuth(); return; }
    openModal();
  });
  $("aniModalClose").addEventListener("click", () => { modal.hidden = true; });
  $("aniEntryBack").addEventListener("click", () => setModalStage("search"));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modal.hidden) modal.hidden = true;
    else if (!authWrap.hidden) { authWrap.hidden = true; pendingAdd = false; }
  });

  let searchTimer = 0;
  let searchSeq = 0;
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) { results.replaceChildren(); searchStatus.hidden = true; return; }
    searchTimer = window.setTimeout(() => searchAniList(q), 300);
  });

  async function searchAniList(q) {
    const seq = ++searchSeq;
    searchStatus.textContent = "Searching AniList…"; searchStatus.hidden = false;
    let media = [];
    try {
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: q } }),
      });
      const json = await res.json();
      media = (json.data && json.data.Page && json.data.Page.media) || [];
    } catch {
      if (seq === searchSeq) searchStatus.textContent = "AniList didn't answer — try again in a moment.";
      return;
    }
    if (seq !== searchSeq) return; // a newer search superseded this one
    results.replaceChildren();
    if (!media.length) { searchStatus.textContent = "No matches for “" + q + "”."; return; }
    searchStatus.hidden = true;
    media.forEach((m) => {
      const li = el("li");
      const btn = el("button", "ani__result");
      btn.type = "button";
      const img = el("img", "ani__rowcover");
      img.src = (m.coverImage && m.coverImage.large) || ""; img.alt = ""; img.loading = "lazy";
      btn.appendChild(img);
      const txt = el("div");
      txt.appendChild(el("div", "ani__picktitle", (m.title && (m.title.english || m.title.romaji)) || "Untitled"));
      txt.appendChild(el("div", "ani__pickmeta", [m.seasonYear, m.format, m.episodes ? m.episodes + " ep" : null].filter(Boolean).join(" · ")));
      btn.appendChild(txt);
      btn.addEventListener("click", () => pick(m));
      li.appendChild(btn);
      results.appendChild(li);
    });
  }

  function pick(m) {
    picked = m;
    const box = $("aniPick");
    box.replaceChildren();
    const img = el("img", "ani__rowcover");
    img.src = (m.coverImage && m.coverImage.large) || ""; img.alt = "";
    box.appendChild(img);
    const txt = el("div");
    txt.appendChild(el("div", "ani__picktitle", (m.title && (m.title.english || m.title.romaji)) || "Untitled"));
    txt.appendChild(el("div", "ani__pickmeta", [m.seasonYear, m.format, m.episodes ? m.episodes + " ep" : null].filter(Boolean).join(" · ")));
    box.appendChild(txt);
    if (picked.episodes) $("aniEntryProgress").max = String(picked.episodes);
    $("aniEntryErr").hidden = true;
    setModalStage("entry");
  }

  $("aniEntryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!picked || !identity) return;
    const err = $("aniEntryErr");
    err.hidden = true;
    const saveBtn = $("aniEntrySave");
    saveBtn.setAttribute("aria-busy", "true");

    await ensureProfile();
    const cover = (picked.coverImage && picked.coverImage.large) || null;
    const { error: animeErr } = await sb.from("anime").upsert({
      id: picked.id,
      title: ((picked.title && (picked.title.english || picked.title.romaji)) || "Untitled").slice(0, 200),
      title_romaji: (picked.title && picked.title.romaji || "").slice(0, 200) || null,
      cover_url: cover && cover.startsWith("https://") && cover.includes(".anilist.co/") ? cover : null,
      episodes: picked.episodes || null,
      year: picked.seasonYear || null,
      format: picked.format || null,
      genres: (picked.genres || []).slice(0, 20),
    }, { onConflict: "id", ignoreDuplicates: true });

    const entry = {
      anime_id: picked.id,
      status: $("aniEntryStatus").value,
      score: $("aniEntryScore").value ? Number($("aniEntryScore").value) : null,
      progress: Math.max(0, Math.min(10000, Number($("aniEntryProgress").value) || 0)),
    };
    let { error } = animeErr ? { error: animeErr } : await sb.from("anime_entries").insert(entry);
    if (error && error.code === "23505") {
      // already on the list → update the existing row instead
      ({ error } = await sb.from("anime_entries")
        .update({ status: entry.status, score: entry.score, progress: entry.progress })
        .eq("anime_id", entry.anime_id).eq("user_id", identity.uid));
    }
    saveBtn.removeAttribute("aria-busy");
    if (error) {
      err.textContent = "Couldn't save — " + error.message;
      err.hidden = false;
      return;
    }
    modal.hidden = true;
    loadCatalog();
    location.hash = "#mine";
    renderMine();
  });

  // — boot
  loadCatalog();
  route();
})();
