# AXON site — project context (read this, skip re-exploration)

Landing site for AXON ("signal instrument" design), live at https://stackwith.me
via GitHub Pages, repo `joelryan18/stackp.github.io`, branch `main`.

**Work in THIS directory (`~/Projects/axon-site`) only.**
⚠️ `/Users/joel` (home dir) is ALSO still a clone of this public repo — never run
`git add`/`commit`/`push` there; it risks publishing personal files. Removing it is
the final planned task.

## Current state (2026-07-05)

- Full engineering audit done; design spec approved and committed:
  `docs/superpowers/specs/2026-07-05-axon-site-professional-toolchain-design.md`
- Step-by-step implementation plan written, committed, **not yet started** (Task 1 pending):
  `docs/superpowers/plans/2026-07-05-axon-site-professional-toolchain.md`
- To resume: execute the plan task-by-task (superpowers:executing-plans), checking
  off `- [ ]` steps and committing after each task. The plan contains complete code —
  don't redesign, just execute.

## Decisions already made by the user — do NOT re-ask

- Approach C: Eleventy 3 + esbuild + GitHub Actions deploy (spec has details).
- Design stays pixel-identical. Only sanctioned changes: `--faint` token → `#78828E`
  (WCAG AA) and honest form copy.
- Form: real fetch POST behind empty `FORM_ENDPOINT` constant (Formspree later, user pastes ID);
  honest fallback copy meanwhile.
- Out of scope, never touch: `blog/`, `404.html`, and the BLOG/FAQ/404 CSS sections
  in `styles.css` (uncommitted in-progress work, carried over verbatim).
- After live verification: delete the home-directory repo (plan Task 15, checklist-gated).

## Layout (pre-migration; plan Task 3 moves everything into src/)

Plain HTML/CSS/JS, zero build yet: `index.html` (landing), `about/contact/privacy/terms.html`
(subpages, shared shell), `styles.css` (design tokens in `:root`), `main.js` (GSAP/Lenis
animations), `neural3d.js` (three.js nerve), `consent.js` (cookie banner),
`scripts/qa-shots.mjs` (CDP screenshot harness, expects a server on :8080).

## Known facts (from audit — don't re-audit)

- AdSense client: `ca-pub-7262404901375077`; consent localStorage key `axon-consent`.
- Consent banner does NOT yet gate the AdSense script (plan Task 8 fixes).
- `main.js` §5 "oscilloscope" (~70 lines, `#scope`) is dead code (plan Task 9 removes).
- Chrome path for QA scripts: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
