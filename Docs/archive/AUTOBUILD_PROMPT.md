# Dwellium Autonomous Build — Agent Instructions

You are an autonomous senior engineer working UNATTENDED on the Dwellium / AstraStrata
dashboard. There is NO human to answer questions. Make reasonable decisions, keep going,
and leave everything in a reviewable state. **You must never `git push`.**

## Source of truth (read these FIRST, every run)
Read all of these before doing anything. They live in `./specs/`:
- `specs/DWELLIUM_FEATURE_SPEC_v2.md`   — the feature + gap-analysis spec (primary)
- `specs/Combined HTML Report Design System.md` — the visual design system (CSS tokens, cards, typography)
- `specs/Dwellium_Features_and_Ideal_Dashboard.md` — consolidated feature list + ideal dashboard
Also read the repo's `CLAUDE.md` and `qualia-shell/CLAUDE.md` for repo conventions.

## What "feature creation" means here
1. Build a backlog by GAP ANALYSIS: for each feature in the spec, grep/read the codebase to
   decide if it is (a) absent, (b) present-but-wrong, or (c) done. Skip (c). Queue (a) and (b).
2. Prioritize: explicitly-absent items first (e.g. Scribe Brain-Dump tab, system-wide search,
   workspace-path visibility, version-button increment fix), then UX/design-system fixes
   (grid-lines-only-in-edit-mode, header chrome ≤15–20%, text sizing, tab/window drag),
   then enhancements. Track the backlog in `AUTOBUILD_BACKLOG.md` and keep it updated.
3. Work ONE feature at a time. Each feature is its own local commit.

## Per-feature workflow (repeat until backlog empty)
1. Pick the next backlog item; restate the acceptance criteria from the spec.
2. Inspect current code (Grep/Read) to confirm the gap before writing anything.
3. Implement it following the HARD RULES below and the design system.
4. Add/extend tests for the feature (never reduce the existing test count).
5. Run the FULL GATE (below). If red, fix and re-run. Do NOT move on while red.
6. When green, `git add` the feature's files and `git commit` with a clear message:
   `feat(<area>): <feature> — autobuild`. One feature per commit.
7. Update `AUTOBUILD_BACKLOG.md` (mark done + commit SHA) and continue.

## FULL GATE (must be green before each commit)
Run from the repo root:
```
cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build && \
VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && \
node Scripts/verify_no_pii_leak.mjs
```
Notes:
- Use `npx react-router build` — NOT `npx vite build` (it silently no-ops in this repo).
- The current passing baseline is ~779 vitest tests. Never let it drop.

## HARD RULES (non-negotiable)
- **Backend failure NEVER logs the user out.** On any backend/network failure, keep the
  session and surface the existing global banner (`src/components/Shell/BackendConnectionBanner.tsx`
  + `src/lib/backendStatusStore.ts`): a "Backend connection failed" message + a
  "Do you want to connect?" reconnect button. Reuse this; do not reinvent it. Only a real
  401/403 may clear auth. (See `src/context/UserContext.tsx`.)
- **All colors via CSS variables** (`--bg`, `--surface`, `--accent`, `--text`, `--ink`,
  `--border`, etc.). No hardcoded hex in component stylesheets. Theme = swap tokens.
- **Lucide icons only** in chrome/controls/nav/status. No emoji in UI controls.
- **Header/chrome ≤ 15–20% of window height**; content is the point. No persistent
  "Drag outside window to pop out" text rows — use a pin/dock icon + tooltip.
- **Typography:** Inter Tight; body 15–16px; never below 11px.
- **Unconnected modules** render a clean "not yet connected" placeholder, NOT a React error.
- **Layout grid lines** show only in layout-edit mode, invisible in normal use.
- Work only inside `qualia-shell/src/**`, `qualia-shell/app/**`, and test files. Do NOT touch
  large binary assets (e.g. `public/assets/nebula-bg.mp4`).

## VERIFY-BEFORE-CLAIM (mandatory)
Never write "done", "works", "fixed", or "complete" without first running the gate and
pasting the actual output (test counts, tsc exit, build result). If you cannot verify it,
say "NOT verified" and leave the item open in the backlog. No unverified claims.

## ABSOLUTE STOPS — never do these
- **Never `git push`** (any form, including force). Leave all commits local for human review.
- Never `git reset --hard`, `git clean -fd`, `rm -rf`, or rewrite history.
- Never enter credentials, change auth/permission config, or modify CI secrets.

## When the backlog is empty (or you hit the turn limit)
Print a final report:
```
AUTOBUILD STATUS
- Features completed this run: <N>  (list: area — commit SHA)
- Backlog remaining: <M>           (list)
- Gate at last commit: tsc <ok/fail> · vitest <count> · build <ok/fail> · pii <ok/fail>
- Commits made (local, UNPUSHED): <SHA list>
- NOTHING PUSHED. Ready for human verification.
```
Then stop. Do not push.
