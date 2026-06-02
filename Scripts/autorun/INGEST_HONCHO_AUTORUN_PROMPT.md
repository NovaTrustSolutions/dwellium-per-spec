# Scribe Ingestion + Honcho-app + Statute-matching arc — CONTINUOUS AUTONOMOUS driver

You are running UNATTENDED for ~2 hours. Ilya is NOT at the keyboard and will NOT
answer anything. **Never ask questions. Never stop for review between cycles.** Decide,
log, keep moving. This prompt is re-fed every iteration — re-orient from the repo each
time, do ONE bounded cycle, leave the tree committed + green, end the turn.

Global rules (Ilya's CLAUDE.md): 🧪 in every response; ETA before each step; **paste
verification proof inline BEFORE any "done/green/complete" claim**; no browser subagents
(run_command/curl/node); NO `git push` ever; never undo Ilya's manual commits; never
delete `Scripts/autorun/HALT`.

═══════════════════════════════════════════════════════════════════════════════
## GOAL OF THIS ARC (6 deliverables — Block A cycles 1-11, Block B cycles 12-18)
═══════════════════════════════════════════════════════════════════════════════
### BLOCK A — ingestion + Honcho + statute (cycles 1-11)
1. **Scribe ingestion pipeline.** User picks a SOURCE folder (desktop or cloud, via the
   browser File System Access API) and a BACKUP DESTINATION folder. Anything in the source
   folder is auto-converted to Markdown and written to the backup destination. Browsers
   cannot run a true always-on background watcher, so ship BOTH: (a) an in-app folder
   picker + on-demand "sync/convert now" that works TODAY, and (b) a documented
   `/api/ingest/*` backend-watcher route CONTRACT for the always-on daemon (sibling repo
   / the planned Electron build implements it; out of scope for this branch).
2. **TranscriptionHub legal-statute matching — improve it.** (Confirmed = statute matching.)
3. **Honcho as a standalone, always-on widget.** Promote Honcho out of being just a Stella
   tab into its own registered widget, expose its existing abilities, and give it a
   Markdown-file arrange/filter view (sort/filter the converted .md files by size,
   date-created, name, etc.). "Always-on by default" = pinned + opens by default.

### BLOCK B — ThoughtWeaver ↔ ARA ↔ Honcho integration + Stella tools + Hermes (cycles 12-18)
4. **ThoughtWeaver: reports + categorize + to-do generation + non-obvious AI insights, all
   local.** TW must: categorize ALL incoming thoughts (extend existing `/api/thought-weaver`
   + LLM categorize), generate DAILY reports + DAILY and WEEKLY to-do lists from captured
   info (extend `todoStore` + `syncTodosFromCaptures`), and use the per-user LLM to surface
   NON-OBVIOUS insights (patterns/connections the user wouldn't spot). **All TW data stays
   in local per-user `createLocalStorageStore`** (it already is local-first — keep it that
   way; backend is optional sync only). Integrate TW ↔ ARA ↔ Honcho (shared captures/memory
   via the cross-widget bus + shared stores).
5. **Stella: a massive library of tools** to complete user tasks — expand Stella's existing
   skills/tools surface (`/skills`, `/skills/search`) into a broad, well-organized tool
   catalog, AND give Stella the ability to **call/spawn the Hermes agent** (wire Stella →
   the existing Hermes run path in HonchoHermesPanel: `/api/hermes/*`).
6. **Hermes self-improvement — "the more it's used, the better it gets," built into its own
   store/repo.** BOTH mechanisms, local + per-user: (a) **run-memory few-shot** — record
   every Hermes run (prompt, tools used, steps, success/fail, optional user rating) to a
   local store and inject relevant PAST SUCCESSES as context into new runs; (b) **tool
   success-weighting** — track which tools succeed for which task types and re-rank/prefer
   proven tools over time. NO model fine-tuning (not feasible in-app; that's a future
   Electron/backend-GPU concern — document, don't attempt).

### SCHEDULING / ELECTRON NOTE (applies to Block B daily/weekly reports)
A browser cannot run a true background scheduler. Per Ilya: **the app will be converted to
Electron later.** So for daily reports + daily/weekly to-do generation, ship: (a) **on-open
catch-up** (generate what's due since last open) + a **"generate now"** button that works
TODAY in the web app, AND (b) a documented **scheduler contract** (`/api/schedule/*` or an
Electron main-process cron note) that the Electron build wires to a real daily schedule +
notification/delivery. Do NOT fake background execution in the browser.

═══════════════════════════════════════════════════════════════════════════════
## ABSOLUTE AUTONOMY RULES (same as the 3 arcs that already succeeded)
═══════════════════════════════════════════════════════════════════════════════
1. NO QUESTIONS, NO REVIEW STOPS. Chain Cycle 1 → 2 → … continuously.
2. DECIDE + LOG every fork to `Scripts/autorun/INGEST_DECISIONS.md` (reversible defaults).
3. ONE CYCLE PER ITERATION. Finish, gate, commit, end turn.
4. ALWAYS LEAVE IT GREEN + COMMITTED. Can't get green → revert your cycle's changes, log
   why, move on. Never leave it broken.
5. HALT ONLY ON A TRUE BLOCKER (`touch Scripts/autorun/STOP`) — same failure 3 iterations
   running, or destructive action needed. `touch Scripts/autorun/ALL_DONE` only when the
   whole arc (incl. closure) is verified done.
6. LOG EVERY ITERATION to `Scripts/autorun/INGEST_PROGRESS.md`.

## STELLA IS PROTECTED
You will TOUCH StellaAgent.tsx ONLY to extract/share the Honcho code into the standalone
widget — do the minimum surgical change (e.g. import the shared panel) and do NOT redesign
or restyle Stella. If extraction risks Stella's tests, prefer SHARING a component both use
over moving code out from under Stella.

## KNOWN TRAPS — handle automatically, never stop on these
- **Port 3000 = live Dwellium app.** ALWAYS run the smoke step with `SMOKE_TEST_PORT=3458`.
- **Terminal truncates long output.** Capture the gate to a log, read the tail.
- **cwd does NOT persist between run_command calls.** `cd` to the absolute repo path each command.
- **vitest baseline at this branch's base = 459 passed / 56 files** (after the dashboard arc).
  Higher count = good (you added tests); note the delta. Failure you didn't cause: prove
  pre-existing (git stash + run), then proceed.
- **`Scripts/autorun/HALT`** — leave untracked, never delete/commit. (If HALT is present,
  this driver still proceeds — HALT is a leftover from a deleted scheduled task, NOT a live
  pause; Ilya launched THIS run intentionally.)
- **SSR safety (critical for the folder picker):** `showDirectoryPicker` / `FileSystemDirectoryHandle`
  / `window` / `localStorage` are browser-only. NEVER call them at module top-level or in a
  `useState(() => ...)` initializer (throws on server render). Gate behind event handlers
  (onClick) or `useEffect`, and persist any handles/prefs via `createLocalStorageStore`
  (per-user dynamic key, mirror fileExplorerStore). The SSR smoke test WILL catch violations.

## THE STRICT GATE (end of every cycle that touches source)
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell" && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_PORT=3458 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```
6/6 green = commit. Red you caused = fix or revert. Docs-only cycles need only `git status`.

═══════════════════════════════════════════════════════════════════════════════
## STEP 0 — FIRST ITERATION ONLY: create the branch
═══════════════════════════════════════════════════════════════════════════════
If branch `feat/scribe-ingestion-honcho` does NOT exist:
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec"
git status --short    # expect clean except untracked autorun files
git checkout feat/pm-exec-dashboard 2>/dev/null || true   # build on the dashboard arc
git checkout -b feat/scribe-ingestion-honcho
git rev-parse --abbrev-ref HEAD   # MUST be feat/scribe-ingestion-honcho
```
If it already exists, checkout + continue from PROGRESS. Create `INGEST_PROGRESS.md` +
`INGEST_DECISIONS.md` on iteration 1.

═══════════════════════════════════════════════════════════════════════════════
## EVERY ITERATION — orient, then do the next undone cycle
═══════════════════════════════════════════════════════════════════════════════
a. `cd` repo, confirm branch `feat/scribe-ingestion-honcho` (checkout if needed), status
   clean except untracked autorun files (clean only YOUR junk, never HALT).
b. Read last ~10 lines of `Scripts/autorun/INGEST_PROGRESS.md`.
c. Lowest undone cycle → do it → gate → commit → mark done → end turn.
d. All cycles incl. closure done + gate green → closure summary + `touch ALL_DONE`.

## GROUND TRUTH (verify as you go)
- **Scribe converter (REUSE):** `src/components/Scribe/htmlToMarkdown.ts` (no-dep HTML→MD)
  + `dropHandler.ts` (branches by MIME; already converts html/url→markdown). Existing
  routes: `/api/scribe/{files,images,comments,version,fetch-article}`, `/api/file-explorer/read`.
  For NON-html source files (pdf/docx/etc.) the real conversion is a BACKEND concern — the
  in-app path converts what the browser can (html/txt/md), and the `/api/ingest/*` contract
  covers server-side conversion (pdf/docx → md). PDFGear already does PDF work — note it as
  the server-side converter reference; don't duplicate.
- **Honcho (PROMOTE):** lives as Stella tab `honcho` (StellaAgent.tsx:206) + component
  `src/components/HonchoHermesPanel/HonchoHermesPanel.tsx` (563 L, NOT registered) + state
  `src/components/StellaAgent/honchoDreamStore.ts` (per-user dream entries via
  createLocalStorageStore; exports appendDream/deleteDream/clearDreams/dreamStore). To make
  standalone: register a `honcho` widget in `widgetRegistry.ts` + add a pinned dock entry in
  `data/hierarchy.ts`; render HonchoHermesPanel (shared with Stella's tab).
- **Statute matching (IMPROVE):** `src/components/TranscriptionHub/TranscriptionHub.tsx`
  (2955 L). `scanSegmentsViaLlm` → maps LLM `code_ref/summary/suggested_action` →
  `statute/advice/matchedStatutes`. `API_GEORGIA_CODE = /api/georgia-code`,
  `/api/transcribe/fact-check`. matchedStatutes has {volumeId, similarity, excerpt}.
- **Folder picker primitive:** File System Access API is used NOWHERE yet — introduce
  fresh, SSR-safe (event-handler-gated). Persistence: `createLocalStorageStore` per-user
  (mirror `fileExplorerStore.ts` / `savedLayoutsStore`).
- **Cross-widget bus / injectable-deps test pattern:** `src/components/Workspace/workspaceScribe.ts`.
- **Backend route-contract format:** find the existing `Docs/backend-*-routes.ts`
  (file-explorer one exists — locate it with `find . -name "backend-*-routes.ts" -not -path '*/node_modules/*'`)
  and mirror its exact shape for the new contract.
- **ThoughtWeaver (Block B — EXTEND, already local-first):** `src/components/ThoughtWeaver/`
  = `ThoughtWeaver.tsx` + `thoughtWeaverStore.ts` (per-user `LocalCapture[]` via
  createLocalStorageStore; `appendLocalCapture`/`deleteLocalCapture`/`clearLocalCaptures`)
  + `todoStore.ts` (per-user `TodoItem[]`; `addTodo`/`syncTodosFromCaptures` dedup-bulk-add/
  `toggleTodo`/`clearDoneTodos`). Already categorizes via `/api/thought-weaver` + per-user LLM
  (ThoughtWeaver.tsx:279 fallback). NEW work: reports + insights + daily/weekly to-do gen +
  ARA/Honcho integration. KEEP all storage local.
- **Hermes (Block B — REAL, wire + add learning):** `src/components/HonchoHermesPanel/
  HonchoHermesPanel.tsx` runs Hermes: `/api/hermes/status` (ollamaOnline), `/api/hermes/tools`,
  a run path producing `HermesStep[]`, an `agents` tab + `AgentStatus[]`. Honcho memory:
  `/api/honcho/memories`, `/api/honcho/stats`. Stella mirrors a `hermes` tab (StellaAgent.tsx:207).
  NEW: a per-user `hermesLearningStore` (run history + tool-success stats) + Stella→Hermes spawn.
- **Stella tools (Block B — EXPAND):** Stella has a skills surface — `/skills`, `/skills/search`,
  `/skills/:name/:action` (enable/disable) at StellaAgent.tsx ~699-791, tabs incl. `skills`+`hermes`.
  Expand into a broad tool catalog; add Hermes-spawn as a first-class Stella capability.
- **Cross-widget integration bus:** `dwellium:open-widget` (WindowContext.tsx:447) + shared
  per-user stores are how TW ↔ ARA ↔ Honcho share state without tight coupling.

═══════════════════════════════════════════════════════════════════════════════
## CYCLE SEQUENCE (in order; each gate-green + committed)
═══════════════════════════════════════════════════════════════════════════════
**Cycle 1 — AUDIT + PLAN (docs-only).** Read the Scribe converter + dropHandler, the
Honcho panel/store + how Stella mounts it, the TranscriptionHub statute code, and the
existing backend-route-contract doc. Write `Scripts/autorun/INGEST_PLAN.md`: (a) ingestion
data flow (source picker → convert → backup dest; what converts client-side vs. needs
`/api/ingest/*` backend), (b) Honcho-standalone extraction approach (share vs. move — pick
the one that keeps Stella's tests green; log to DECISIONS), (c) statute-matching
improvement list, (d) SSR-safety notes for the picker, (e) ~10-cycle sequence. Commit. End turn.

**Cycle 2 — Ingestion storage layer (no UI).** Create `src/components/Scribe/ingestion/
ingestionStore.ts` (per-user `createLocalStorageStore`: source-folder handle ref + backup-
dest handle ref + last-sync time + converted-file index) + `ingestionApi.ts` (typed client
for the `/api/ingest/*` contract) + unit tests with mocked deps. SSR-safe. FULL gate. Commit.

**Cycle 3 — Backend ingest route CONTRACT (docs).** Write `Docs/backend-ingest-routes.ts`
mirroring the file-explorer contract: `POST /ingest/watch` (register a watched folder),
`GET /ingest/status`, `POST /ingest/convert` (server-side file→md for pdf/docx/etc.),
`GET /ingest/converted`. Mark "always-on watcher + non-html conversion implemented in
sibling backend — out of scope for this branch." Docs-only. Commit.

**Cycle 4 — Folder-picker UI in Scribe.** A Scribe panel/section: "Choose source folder"
+ "Choose backup destination" (File System Access API, event-handler-gated, SSR-safe),
persisted via ingestionStore. Show picked paths + a "Convert now" button. Loading/empty/
error states. Add a test (mock the FS API). FULL gate. Commit.

**Cycle 5 — Client-side convert + backup write.** On "Convert now": enumerate source-folder
files, convert browser-convertible ones (html/txt → md via htmlToMarkdown; .md passthrough)
to Markdown, write them into the backup destination folder, update the converted-file index.
Non-convertible types (pdf/docx) → queued + labeled "needs backend conversion" (per the
contract). Add tests. FULL gate. Commit.

**Cycle 6 — Honcho standalone widget (extraction).** Register a `honcho` widget in
widgetRegistry.ts + a pinned `dock-honcho` entry in hierarchy.ts (group: AI Tools).
Render the shared HonchoHermesPanel as the widget body. Stella's `honcho` tab keeps working
via the SAME shared component (do NOT break Stella — minimal surgical change). Add a widget
test. FULL gate. Commit.

**Cycle 7 — Honcho markdown arrange/filter view.** In the Honcho widget, add a view that
lists the converted .md files (from the ingestion index / file-explorer tree) with
sort+filter controls: by size, date-created/modified, name (A→Z), and a text filter.
Drill-down opens a file in Scribe via `dwellium:open-widget`. Add tests. FULL gate. Commit.

**Cycle 8 — Honcho "always-on by default" + abilities surface.** Make Honcho pinned/open by
default (per the hierarchy `pinned: true` + default-open mechanism) and surface its existing
abilities (dream/memory: appendDream/deleteDream/clearDreams) in the standalone widget.
Document the "see multiple physical desktop screens" ask as REQUIRING Electron/OS-level
access — NOT possible in the web app — as a deferred item in INGEST_DECISIONS.md. FULL gate. Commit.

**Cycle 9 — TranscriptionHub statute-matching improvements.** Improve the statute path:
better statute extraction + dedup of matchedStatutes, surface similarity/excerpt in the UI,
graceful no-LLM + failed-fetch states, and a clearer matched-statutes display. Add/extend
tests. FULL gate. Commit.

**Cycle 10 — a11y + polish + interactivity.** Consistent loading/empty/error UI across the
new ingestion + Honcho surfaces, WCAG AA labels on the new controls (pickers, sort/filter,
convert button), keyboard nav. FULL gate. Commit.

**Cycle 11 — BLOCK A sub-closure (docs-only).** Write `Scripts/autorun/INGEST_CLOSURE.md`
(Block A commit SHAs, what ships client-side vs. deferred to `/api/ingest/*`, Honcho-standalone
summary, statute-improvement summary, deferred items incl. multi-screen + non-html conversion).
Do NOT touch ALL_DONE yet — Block B (cycles 12-18) continues the arc. Commit. End turn.

─────────────────────────────  BLOCK B (cycles 12-18)  ─────────────────────────────

**Cycle 12 — TW reports + insights store (local).** Create `src/components/ThoughtWeaver/
reportStore.ts` (per-user `createLocalStorageStore`: generated daily reports + weekly summaries
+ insight entries, keyed `thought-weaver:reports:<userId>`) + an `insights.ts` helper that calls
the per-user LLM (`lib/llmClient.ts callLlm`) to (a) categorize captures, (b) draft a daily
report from the day's captures, (c) generate daily + weekly to-do lists (feed `syncTodosFromCaptures`),
(d) surface NON-OBVIOUS insights (cross-capture patterns). Pure functions + injectable LLM dep
so they're unit-testable; add tests with a mocked LLM. KEEP ALL DATA LOCAL. FULL gate. Commit.

**Cycle 13 — TW reports/insights UI + on-open catch-up + "generate now".** Wire reportStore +
insights into ThoughtWeaver.tsx: a Reports/Insights view, a "Generate now" button, and on-open
catch-up (generate the daily report + refresh to-do lists if not already done since last open —
compute "due" from last-generated timestamp). Graceful no-LLM/empty states. Tests (real clock,
NOT fake timers per the React-19 scheduler anti-pattern in CLAUDE.md). FULL gate. Commit.

**Cycle 14 — Scheduler CONTRACT (docs) for the Electron build.** Write `Docs/backend-schedule-routes.ts`
(or `Docs/electron-scheduler-notes.md`): the daily/weekly report + to-do generation schedule the
Electron main-process (or sibling backend) will run, + delivery (notification/email) contract.
Mark "web build does on-open catch-up; true background schedule activates in the Electron build."
Docs-only. Commit.

**Cycle 15 — TW ↔ ARA ↔ Honcho integration.** Wire the three: TW captures/insights shareable to
ARA (context) + Honcho (memory) via the `dwellium:open-widget` bus + shared per-user stores;
"send to ARA" / "save to Honcho memory" handoffs; ARA can pull TW context. Mirror the
`workspaceScribe.ts` injectable-deps pattern for testability. Add integration tests. FULL gate. Commit.

**Cycle 16 — Hermes self-improvement store (local, both mechanisms).** Create
`src/components/HonchoHermesPanel/hermesLearningStore.ts` (per-user `createLocalStorageStore`,
key `hermes:learning:<userId>`): (a) **run history** — append each run {prompt, toolsUsed[],
steps, outcome: success|fail, rating?, ts}; (b) **tool-success stats** — per-tool per-task-type
success counts → a weight. Export `recordRun()`, `relevantPastRuns(prompt)` (returns top-K similar
successful runs for few-shot injection), `toolWeights(taskType)` (re-rank helper). Pure +
unit-tested. FULL gate. Commit.

**Cycle 17 — Wire Hermes learning into runs + Stella→Hermes spawn.** (a) On every Hermes run in
HonchoHermesPanel, inject `relevantPastRuns()` as few-shot context + use `toolWeights()` to order
tool choice, and `recordRun()` on completion (with a thumbs up/down rating control). (b) Give
Stella a first-class "spawn Hermes" capability: from Stella, dispatch a Hermes run (reuse the
existing run path / `/api/hermes/*`) and surface the result. Add tests for both. FULL gate. Commit.

**Cycle 18 — Stella tool-library expansion + a11y/polish + ARC CLOSURE.** (a) Expand Stella's
skills/tools surface into a broad, organized catalog (categories, search already exists — add
breadth + the Hermes-spawn tool + TW/Honcho handoff tools). (b) a11y/empty/error polish across all
Block B surfaces. (c) Write `Scripts/autorun/ARC_CLOSURE.md` (FULL arc: Block A + B commit SHAs,
local-storage confirmation, Hermes-learning summary, Stella-tools summary, TW reports/insights/
integration summary, deferred items incl. multi-screen + model-fine-tuning + Electron scheduler,
push commands). Re-run the FULL gate fresh at closure HEAD. `touch Scripts/autorun/ALL_DONE`.

If a cycle is bigger than one iteration, split it: coherent chunk, gate, commit, DON'T mark
done — next iteration continues it. **Reuse before building. Never duplicate converter/fetch/
LLM logic. KEEP ThoughtWeaver + Hermes-learning data LOCAL (per-user createLocalStorageStore).**

═══════════════════════════════════════════════════════════════════════════════
## END-OF-ARC
═══════════════════════════════════════════════════════════════════════════════
When all cycles done + gate green: append final summary to INGEST_PROGRESS.md with push
commands (`git push origin main` then `git push -u origin feat/scribe-ingestion-honcho`) and
`touch Scripts/autorun/ALL_DONE`. Do NOT push.

LOOP CONTRACT: one bounded cycle, verified green, committed, logged — then end the turn.
