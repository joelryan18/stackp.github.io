# Hobby Benefits Fulfillment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a Hobby purchase is activated, the buyer actually receives every benefit
listed on the Hobby tier — not just an email that names them. This converts AXON from a
pure design showcase into a small real product ("signal instrument": agents are signal
watchers, not LLM agents), so the honest-copy line must be revised (user-sanctioned) once
deliverables ship.

**Why:** The Hobby card promises "1 active agent, 500 runs / month, community connectors,
community support, signal replay — 7-day retention, starter agent templates, supporter
listing in the AXON registry, priority queue for access requests." Today a buyer gets a
success screen, a canvas Supporter Pass image, and an EmailJS mail that lists these as
text. Nothing is provisioned. The user has decided buyers must genuinely get all of it.

**Architecture:** Supabase is already the auth backbone (checkout sign-in). Extend it:
Postgres tables + RLS for entitlements, Edge Functions for trusted writes (Razorpay
webhook activation, agent run executor), pg_cron for scheduled runs + 7-day purge. New
Eleventy pages `/console.html` (sign-in-gated, noindex) and `/registry.html` (public).
An "agent" = a configured signal watcher: fetch a source (RSS/JSON/HTTP status), evaluate
a condition, log the run, notify by email on trigger. No LLM, no per-run cost beyond
Supabase free tier.

## Benefit → deliverable map (the contract this plan fulfills)

| Hobby promise | Concrete deliverable |
|---|---|
| 1 active agent | Console lets a pass holder create/keep exactly 1 agent (source URL + connector type + condition + notify email), stored in Supabase |
| 500 runs / month | Each run = Edge Function fetch→evaluate→log; monthly quota of 500 enforced server-side; quota meter in console |
| Community connectors | Public `connectors/` preset library in the repo (RSS, JSON API, HTTP status, webhook), open to PRs, selectable in console |
| Community support | GitHub Discussions on this repo; linked from console + benefits email |
| Signal replay — 7-day retention | Run log viewable/replayable in console; rows older than 7 days purged (pg_cron) |
| Starter agent templates | ≥5 one-click-import templates (price watcher, RSS digest, uptime ping, keyword alert, release watcher) |
| Supporter listing in the AXON registry | Public `/registry.html` listing opt-in supporter display names |
| Priority queue for access requests | Access-request form; pass holders' requests flagged `priority` and ordered first |

## Execution Tracker (tick as tasks land — designed for one-or-more tasks per session)

- [ ] **Task 1** — Spec: fulfillment map, data model, RLS, Edge Function contracts · commit `docs: hobby benefits fulfillment spec`
- [ ] **Task 2** — Supabase schema + RLS (passes, agents, runs, access_requests, registry opt-in) · commit `feat: entitlements schema + RLS`
- [ ] **Task 3** — Activation webhook: Razorpay → Edge Function (signature verify) → passes row (user-gated: webhook + secret in Razorpay dashboard) · commit `feat: verified purchase activation via Razorpay webhook`
- [ ] **Task 4** — Run executor Edge Function + 500/month quota + 7-day purge + pg_cron schedule · commit `feat: agent run executor with quota and replay retention`
- [ ] **Task 5** — AXON Console page (`/console.html`): sign-in gate, pass check, 1-agent CRUD, manual run, replay view, quota meter · commit `feat: AXON console for pass holders`
- [ ] **Task 6** — Community connectors preset library + console picker · commit `feat: community connector presets`
- [ ] **Task 7** — Starter agent templates (≥5) with one-click import · commit `feat: starter agent templates`
- [ ] **Task 8** — Community support: enable GitHub Discussions (user-gated: repo settings) + links · commit `feat: community support links`
- [ ] **Task 9** — Supporter registry: opt-in at checkout + public `/registry.html` · commit `feat: AXON supporter registry`
- [ ] **Task 10** — Priority access-request queue · commit `feat: priority access requests for pass holders`
- [ ] **Task 11** — Post-purchase surfaces: success stage links console; EmailJS template gains console/community/registry links (user-gated: EmailJS template edit) · commit `feat: activation hands the buyer their benefits`
- [ ] **Task 12** — Copy alignment (USER SANCTION REQUIRED): revise honest-note line — software is now provided — and any tier bullet wording · commit `feat: honest copy reflects real deliverables`
- [ ] **Task 13** — Smoke additions (console gate, registry, request queue) · `npm run build && npm run smoke` ALL PASS · commit `test: smoke coverage for fulfillment surfaces`
- [ ] **Task 14** — Studio parity decision (USER DECISION): deliver or reword Studio's promises (unlimited agents, 100k runs, guardrails, audit log) before further Studio sales

**Resuming in a fresh session:** say "proceed with tasks" (superpowers:executing-plans
on this file). Then:
1. `git log --oneline -8` — cross-check commit messages against this tracker.
2. `npm run build && npm run smoke` — must be **ALL PASS** before starting anything.
3. Execute the first unchecked task's steps in order. Every task ends ALL PASS + its own
   commit, so the tree is releasable at every task boundary.
4. Order matters: 2 needs 1; 3, 4, 9, 10 need 2; 5 needs 4; 6, 7 need 5; 11 needs 3 + 5;
   13 needs 5, 9, 10, 11; 12 and 14 need 1 and the user's word.

## Global Constraints

- Design pixel-identical **except** sanctioned changes; new pages follow the existing
  checkout page's visual language. Never touch: `src/blog/`, `src/404.html`, BLOG/FAQ/404
  sections of `styles.css`.
- Amounts exact: Hobby **500 paise (₹5)**, Studio **699900 paise (₹6,999)**.
- The current honest-copy line is verbatim-sanctioned; it must NOT change until Task 12's
  replacement wording is user-sanctioned. Until then nothing ships that contradicts it —
  Tasks 2–10 can land unreleased (or behind the console page, which makes no claims).
- Trusted writes only via Edge Functions (webhook activation, run executor). Client gets
  RLS-scoped reads/writes; a client can never grant itself a pass or extra runs.
- Never commit secrets: Razorpay webhook secret and `sb_secret_…` live only in Supabase
  Edge Function env (`supabase secrets set`). Publishable key in client code is fine.
- Standing hooks — do not remove: `window.__axonEmailCfg`, `window.__axonAuthCfg`.
- `npm run build && npm run smoke` must end **ALL PASS** after every task. Smoke Chrome:
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- User-gated steps (need dashboard access or a decision): Task 3 (Razorpay webhook
  config), Task 8 (enable GitHub Discussions), Task 11 (EmailJS template edit),
  Task 12 (copy sanction), Task 14 (Studio decision).
