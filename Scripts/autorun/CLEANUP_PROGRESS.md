# CLEANUP_PROGRESS

## Iteration 1 — 2026-05-31 — Cycle 2 DONE (ThoughtWeaver offline capture→categorize)

**Branch:** feat/scribe-ingestion-honcho (confirmed)

### What was done
Committed the prior iteration's in-flight **Cycle-2** work (make ThoughtWeaver
capture→categorize actually fire with NO LLM and NO backend):
- `qualia-shell/src/components/ThoughtWeaver/localCategorizer.ts` — NEW. Deterministic,
  dependency-free `localCategorize(raw)` → {people|projects|ideas|admin|needs_review} with
  confidence + label. Pure function.
- `qualia-shell/src/components/ThoughtWeaver/ThoughtWeaver.tsx` — offline branch (path 3)
  now calls `localCategorize` instead of dumping every thought as needs_review/0, plus an
  honest provenance badge (✨ via your LLM / 🛰 via backend / 💾 sorted locally · offline).
- `qualia-shell/src/config.ts` — `API_BASE` resolves to same-origin (relative '') on a
  non-localhost browser origin instead of hard-coded `http://localhost:3000` a deployed
  build can never reach (likely the real "it doesn't send" root cause). SSR-safe via
  `typeof window` guard.
- `qualia-shell/src/test/localCategorizer.test.ts` — NEW (10 cases).
- `qualia-shell/src/test/thoughtWeaverCapture.offline.test.tsx` — NEW. Renders the REAL
  component, drives the REAL capture button with all fetch rejected, asserts the thought is
  "sorted locally / Filed →" (NOT Needs Review). True component-level RUNTIME proof.
- Removed stale junk dirs `qualia-shell/build.partial.*` / `build.stale.*`.

### Verification — FULL STRICT GATE GREEN (all retrieved this session)
- ✅ `npx tsc -b` → PASS (exit 0).
- ✅ `npx vitest run` → 74 files / 655 tests PASS (incl. both new tests).
- ✅ `npx react-router build` → PASS RC=0 (seeds=default, ~867ms).
- ✅ `VITE_APPFOLIO_SEEDS=false npx react-router build` → PASS RC=0 (~895ms).
- ✅ `node Scripts/verify_no_pii_leak.mjs` → PASS (51 files, 0 leaks).
- ✅ `SMOKE_TEST_PORT=3458 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs`
  → ✓ PASS (HTTP 200, 5949 bytes, 0 console errors, 0 warnings, 0 page errors).

> Note: tool-result delivery was intermittently laggy/batched this session (results
> arrived in big delayed bursts; one stray `grep` exit-1 cancelled a queued batch). The
> commit was issued as an isolated call after the gate came back green; if a future
> iteration finds HEAD still at `d71f2e0`, simply re-stage the 5 files above and re-commit
> (the gate is documented green here).

### Cycle status
- Cycle 1 (harness `_drive.mjs` + `FEATURE_STATUS.md` baseline): NOT done yet.
- Cycle 2 (ThoughtWeaver offline capture→categorize): ✅ DONE (committed, gate green,
  runtime-proven via offline RTL drive test).
- No `git push`. Ilya's commits untouched. No STOP/HALT/ALL_DONE created.

### Next iteration plan
1. Confirm Cycle-2 commit is at HEAD (re-commit if the cancellation dropped it).
2. Build `Scripts/autorun/_drive.mjs` (headless login → open widget → action → assert →
   screenshot to `Scripts/autorun/cleanup-shots/`) and write `FEATURE_STATUS.md` baseline
   (Cycle 1).
3. Continue CYCLE LIST: TW Reports/Insights generate (3) → Honcho (4) → Stella tools +
   /hermes (5) → Hermes learning (6) → Scribe ingestion (7) → statutes (8) → Workspace (9)
   → Dashboard UI passes (10–11) → closure (12).

---

## Iteration — Cycle 1 DONE: harness `_drive.mjs` + runtime feature baseline (2026-05-31)

**ETA per step:** build (~1m) → harness write (~2m) → 9-widget audit drive (~3m) → doc+commit (~1m).

### What I did
- Confirmed Cycle-2 commit `4a20603` IS at HEAD (the worried-about re-commit was not needed).
- Discovered the **REAL backend is LIVE on :3000** (Express): `/api/auth/me`→Andy/god,
  `POST /api/thought-weaver/capture`→real categorization, CORS `*`. Built UI served on :3460
  hits it via `API_BASE=http://localhost:3000`.
- Wrote `Scripts/autorun/_drive.mjs` — headless playwright driver (login Andy → open widget
  by sidebar-label substring → optional action → assert → screenshot). Auth-stub fallback if
  backend absent. Reusable every cycle; signature `node _drive.mjs <widget> <action> <out>`.
- Ran the honest baseline across 9 widgets → `Scripts/autorun/FEATURE_STATUS.md` +
  `cleanup-shots/audit-*.png`.

### Runtime proof (baseline — all 9 widgets MOUNTED, 0 crashes)
- ✅ **Thought Weaver** — Recent Captures shows real backend item "buy milk tomorrow → admin 95%".
- ✅ **Inbox Zero** — renders with real data (invoice #4821, HOA notice).
- ⚠️ **Honcho / Stella / Astra / ARA / Transcribe / Fact Check** — render; offline/empty/untested-action.
  Stella + Hermes honest offline banners (python agent down) = correct behavior.
- ❌ **Workspace** — "Failed to load domaines — HTTP 404" (backend route missing). Real break.
- Cross-cutting: every widget logs 4–7 `/api/* 404` console errors → per-feature triage needed.

### Verification
- No `qualia-shell/src/**` production source touched this cycle → build/tests unaffected
  (Cycle-2 green stands; fresh `npx react-router build` rc=0 confirmed while serving).
- Committing harness + baseline + screenshots only (NOT Ilya's launch_*.sh / prompt scaffolding).

### Cycle status
- Cycle 1 (harness + FEATURE_STATUS baseline): ✅ DONE.
- Next: Cycle 3 (TW Reports/Insights generate) — but first **fix Workspace domaines 404**
  is the highest-value real break found; consider pulling it forward, else continue list order.

---

## Iteration — Cycle 3 DONE: ThoughtWeaver Reports + Insights generate (runtime-verified) (2026-05-31)

**ETA per step:** read TW source (~2m) → add `tw-generate` driver action (~1m) → build (~1m) → serve+drive (~1m) → log+commit (~1m).

### What I did
- Audited the Reports tab path in `ThoughtWeaver.tsx` (`runGenerate` → `reportEngine.generateReports`
  → local-first `reportStore`/`todoStore`; LLM injected via `callLlm(req, integrations.llm)`).
  This code shipped in the prior scribe-ingest arc ("Cycle 13"); my job was to PROVE it fires.
- Added a reusable `tw-generate` action to `Scripts/autorun/_drive.mjs`: open TW → Reports tab →
  click "✨ Generate now" → assert a `.tw-report-card`/`.tw-insight` renders or genMsg says "Generated".

### Runtime proof (PASS, exit 0)
```
DRIVE_RESULT {"widget":"thought","action":"tw-generate","opened":true,
 "assertion":"reports: cards=2 insights=0 msg=Generated daily report, weekly summary, 0 insights.",
 "pass":true,"note":"btnDisabled=false cards=2 insights=0 msg=\"Generated daily report, weekly summary, 0 insights.\""}
```
Screenshot `cleanup-shots/tw-reports.png` shows **Daily Reports** card (2026-05-25, 1 capture) +
**Weekly Summaries** card (Week of 2026-05-25, 1 capture) rendered from backend captures.
`insights=0` is the CORRECT no-LLM state (heuristic-only; insights pass is LLM-gated by design —
the in-UI hint says exactly this).

### Verification
- No `qualia-shell/src/**` production source touched → build/tests unaffected; fresh
  `npx react-router build` rc=0 (logged at /tmp/twbuild.log). Cycle-2 green stands.
- Cross-cutting `/api/* 404`s persist (missing backend bucket routes) — NOT on the Reports path
  (Reports is local-first, no backend dependency). Tracked as cross-cutting in FEATURE_STATUS.

### Cycle status
- Cycle 3 (TW Reports/Insights generate): ✅ DONE — runtime-verified working, no fix needed.
- Next: Cycle 4 (Honcho — Add Memory + Files arrange/filter).

---

## Iteration — Cycle 4 DONE: Honcho Add Memory + Files arrange/filter (runtime-verified + FIXED) (2026-05-31)

**ETA per step:** probe backend honcho routes (~1m) → mirror local-first store pattern (~3m) → wire into panel (~3m) → +unit test (~2m) → driver actions (~3m) → build+drive+debug auto-open toggle (~6m) → gate+commit (~3m).

### The real break I found + fixed
- `+ Add Memory` POSTed to `/api/honcho/memories`; the live Express backend on :3000 **404s** that route
  (`curl` confirmed: `Cannot POST /api/honcho/memories`). The catch swallowed it and `fetchMemories`
  `if(!res.ok) return` left the list empty → **renders-but-dead**: the exact class this arc exists to fix.
- **Fix (local-first, reuses the established pattern):** new `honchoMemoryStore.ts` mirroring
  `honchoDreamStore`/`todoStore` (per-user `createLocalStorageStore`, dynamic key `honcho:memories:<userId>`).
  `addMemory` now persists locally FIRST (shows instantly + survives reload) then best-effort backend POST;
  `deleteMemory` removes locally + best-effort backend DELETE; list = `[...local, ...backend]` deduped;
  header count = backend stat + local count. Backend-online behaviour unchanged (additive).
- Files tab arrange/filter was already wired (`arrangeMarkdownFiles` over `ingestion.converted`); I proved it
  reorders at runtime (no fix needed — it functions).

### Runtime proof (both PASS, exit 0)
```
honcho/honcho-memory — rendered=1 persistedKey=honcho:memories:212089d6-…  header="… · 1 memories"
honcho/honcho-files  — seeded=3 order1=zulu,mike,alpha order2=alpha,mike,zulu reordered=true
```
Screenshots: `cleanup-shots/honcho-memory.png` (memory card "AUTORUN remember: water the plants …", MEDIUM,
manual, just now; header "1 memories") + `cleanup-shots/honcho-files.png` (Converted Markdown: alpha/mike/zulu).

### Harness improvement (reused next cycles)
- Extracted `login()` + `openWidget()` helpers and added **`ensureOpen(rootSel,label)`** — discovered Honcho
  AUTO-OPENS once on first Desktop ready (`honchoAutoOpen.ts`), so a blind sidebar click TOGGLES it CLOSED.
  `ensureOpen` clicks only when the panel is absent. Also: backend-auth login does NOT write `dwellium-user`,
  so the uid is recovered from the `qualia_saved_layouts_<uid>` key suffix for per-user seeding.
- New driver actions: `honcho-memory`, `honcho-files`.

### Gate (green)
- `tsc -b` ✓ · `vitest run` **661/661** (75 files; +6 new `honchoMemoryStore.test.ts`) ✓ ·
  `react-router build` rc=0 ✓ · SSR smoke (`SMOKE_TEST_PORT=3458`) **PASS** (0 console/page errors) ✓.

### Cycle status
- Cycle 4 (Honcho Add Memory + Files): ✅ DONE — Add Memory FIXED (local-first), Files VERIFIED working.
- Next: Cycle 5 (Stella — tool catalog search + /hermes spawn).

---

## Iteration — Cycle 5 DONE: Stella tool-catalog search + /hermes spawn (FIXED) (2026-05-31)

**ETA per step:** read Stella sources (~4m) → find break (~2m) → fix composer enable-logic
(~2m) → add `stella-skills` + `stella-hermes` driver actions (~5m) → build+serve+drive (~3m)
→ gate (~5m) → commit (~2m).

### The real break I found + fixed
- Stella's intro message advertises *"type `/hermes <task>` to spawn the Hermes agent"* and the
  `sendMessage` comment states Hermes *"is independent of the Stella backend + personal LLM, so
  it runs even when both are down."* **But** the chat composer `<textarea>` (`stella__input`) AND
  the send button were `disabled={!isBackendReachable(status) && !hasActiveLlm(integrations.llm)}`
  — so when Stella is offline with no LLM key (the headless/no-key reality), the composer is dead
  and the user **cannot type `/hermes` at all**. The advertised, independently-runnable command was
  structurally unreachable → exactly the renders-but-dead class this arc exists to kill.
- **Fix (`StellaAgent.tsx`, chat composer):** textarea is now always typeable (so `/hermes` can be
  entered offline); the send button is enabled when the input is a `/hermes` command via
  `parseHermesCommand(input).isHermes`, while ordinary chat stays honestly gated offline. Placeholder
  updated to hint the `/hermes` escape hatch when offline. The Hermes runner already resolves
  failures gracefully (never throws), so an offline spawn surfaces a rendered "⚡ Hermes could not
  finish" reply rather than hanging.
- Tool Catalog search needed NO fix — it's fully client-side; I proved it filters.

### Runtime proof (both PASS, exit 0; served build :3460, real backend :3000)
```
stella/stella-skills — total=15 filtered=2 names=[Honcho Memory, Memory Explorer] allMatch=true
stella/stella-hermes — typeable=true sendEnabled=true userMsg=1 hermesReply=true
```
- `stella-skills.png`: Skills tab, Tool Catalog filtered to the 2 Memory tools by the "memory" query.
- `stella-hermes.png`: offline Stella, `/hermes summarize the latest maintenance reports` typed +
  sent (composer was enabled), user bubble + a rendered Hermes reply in the message list.
- The `POST /api/stella/chat → 405` console error persists = correct offline state for *ordinary*
  chat; the fix only unblocks the backend-independent `/hermes` path.

### Harness improvement
- New driver actions `stella-skills` (catalog filter narrows + all-match assert) and `stella-hermes`
  (asserts `typeable` + `sendEnabled` offline + a Hermes reply renders).

### Gate (green)
- `tsc -b` ✓ · `vitest run` **661/661** (75 files) ✓ · `react-router build` rc=0 ✓ ·
  SSR smoke (`SMOKE_TEST_PORT=3458`) **PASS** (0 console / 0 page errors) ✓.

### Cycle status
- Cycle 5 (Stella — tool catalog search + /hermes spawn): ✅ DONE — catalog VERIFIED, /hermes FIXED.
- Next: Cycle 6 (Hermes learning — rating + record to `hermesLearningStore`).

---

## Cycle 6 — Hermes learning: rating + record to `hermesLearningStore` ✅ FIXED + VERIFIED

ETA recap: audit (~3m) → fix (~3m) → build+drive (~4m) → gate (~5m) → commit (~2m).

### The real break I found + fixed (same renders-but-dead class as Cycle 5)
The store (`hermesLearningStore.ts`) + runner (`hermesRunner.ts`) are well-built and
unit-tested — but the **only UI path that feeds them was unreachable offline**:
- `HonchoHermesPanel` "⚡ Hermes" tab: the delegate input + Run button were
  `disabled={!hermesOnline || hermesRunning}`. `hermesOnline` = `/api/hermes/status`'s
  `ollamaOnline`, which is `false` in this env (python/Ollama agent down) → **you could
  never delegate a task → `recordRun` never fired → the 👍/👎 control never appeared →
  the entire Cycle-6 learning loop was structurally dead offline.**
- Even if you forced a run, `delegateToHermes` only set `hermesResult` on
  `outcome === 'success'`; an offline run fails → no result → and the rating control is
  nested inside the `{hermesResult && ...}` block → still no rating control.

### Fix (`HonchoHermesPanel.tsx`, 2 edits) — mirrors the Cycle-5 Stella `/hermes` fix
1. **Delegation reachable offline.** Dropped `!hermesOnline` from both `disabled` props
   (kept `hermesRunning` + empty-prompt guards). The runner is backend-INDEPENDENT at the
   resolution level (never throws; records every run incl. failures; surfaces a graceful
   message), so an offline delegation is safe + honest. Placeholder now reads
   *"Ask Hermes anyway — offline runs still record for learning..."* when offline.
2. **Result renders on failure.** Added an `else` branch setting `hermesResult` to
   *"⚡ Hermes could not finish this task — <error>"* so the result block + 👍/👎 control
   render after an offline/failed run. Rating a failed run is legitimate feedback (it
   down-weights that path next time).
The "Hermes Offline 💤" status banner is unchanged — the offline state stays honest.

### Runtime proof (PASS, exit 0; served build :3460, real backend :3000, Ollama down)
```
hermes-learning typeable=true runEnabled=true result=1 rating=1 thanks=1 \
  persisted=hermes:learning:212089d6-4e89-43fe-a0eb-0a2f16290ee8(runs=1,rated=1)
```
- A task was delegated offline, the run recorded, the 👍 was clicked, "Thanks — Hermes
  will remember." rendered, AND the per-user store `hermes:learning:<uid>` now holds the
  run with `rating === 1`. That is the exact Cycle-6 assertion.
- The 9× `404 (Not Found)` console errors = `/api/hermes/delegate` offline = correct
  offline state; the run still recorded + got rated. (`hermes-learning.png`)

### Harness improvement
- New driver action `hermes-learning`: delegate → assert result renders → click 👍 →
  assert `.hhp__rate-thanks` + assert the per-user `hermes:learning:<uid>` store holds a
  `rating === 1` record.

### Gate (green)
- `tsc -b` ✓ · `vitest run` **661/661** (75 files) ✓ · `react-router build` rc=0 ✓ ·
  SSR smoke (`SMOKE_TEST_PORT=3458`) **PASS** (0 console / 0 warnings / 0 page errors) ✓.

### Cycle status
- Cycle 6 (Hermes learning — rating + record): ✅ DONE — loop was dead offline, now FIXED.
- Next: Cycle 7 (Scribe ingestion — pickers + Convert now).

---

## Cycle 7 — Scribe ingestion: pickers + Convert now (2026-05-31)

**Goal:** confirm the source/backup folder pickers open and "Convert now" runs the
convert→write path (or shows the right state without a backend); fix if dead.

### What I found
- Scribe ingestion (`IngestionPanel` in Scribe's EmptyState, wired `onConvert={convert}`
  from `useIngestion`) was NEVER runtime-verified — two blockers:
  1. **Harness collision.** `_drive.mjs` matched the sidebar label by substring, and
     `scribe` matches **Transcribe** first → the driver opened the wrong widget (Cycle-1
     baseline flagged this as ⏳ "not isolated yet").
  2. **No picker headless.** The convert pipeline gates on `window.showDirectoryPicker`
     (File System Access API), which headless Chromium does NOT expose and whose OS
     dialog can't be automated → panel renders the honest "unsupported browser" message.

### Fix (harness-only — `Scripts/autorun/_drive.mjs`; ZERO production source changed)
1. **Exact-label match.** `openWidget` now strips the leading glyph and matches the label
   by case-insensitive equality FIRST (falls back to substring) → `scribe` deterministically
   resolves to **Scribe**, never **Transcribe**. Helps every future cycle.
2. **Injected fake FS picker** (gated on `scribe-ingest` action via `addInitScript`): an
   in-memory source dir (`notes.html`, `readme.md`, `budget.csv`) + a backup dir that records
   writes to `window.__ingestWrites`. ONLY the OS picker is stubbed — the real
   `useIngestion → convertFolder → convertFile → writeMarkdown` pipeline runs unmodified.
3. **New `scribe-ingest` action**: pick source → pick backup → assert both names render →
   assert "Convert now" enables → click → assert the converted index, the backup writes,
   and per-user persistence.

### Runtime proof (PASS, exit 0; served build :3460)
```
scribe-ingest source="AutorunSource" backup="AutorunBackup" convertEnabled=true \
  indexed=3 writes=[notes.md,readme.md] \
  persisted=scribe-ingestion:212089d6-…(n=3,statuses=[converted,passthrough,queued-backend])
```
- Picked both folders → Convert now enabled → ran. `indexed=3` with the EXACT engine
  statuses: `notes.html`→**converted** (html→md), `readme.md`→**passthrough**,
  `budget.csv`→**queued-backend** (not browser-convertible, deferred to `/api/ingest/convert`).
- `writes=[notes.md,readme.md]` — the backup folder ACTUALLY received the converted Markdown;
  the csv was correctly NOT written (queued, not errored).
- Index persisted to the per-user `scribe-ingestion:<uid>` store (n=3). (`scribe-ingest.png`)
- The convert path FUNCTIONS end-to-end — verdict ✅ (no production fix needed; it had simply
  never been driven at runtime before).

### Gate (green)
- `tsc -b` rc=0 ✓ · `vitest run` **661/661** (75 files) ✓ · SSR smoke
  (`SMOKE_TEST_PORT=3458`, existing build) **PASS** (0 console / 0 warnings / 0 page errors) ✓.
  (No `qualia-shell/src` touched — harness-only change is outside tsc/vitest scope; gate run
  confirms zero regression.)

### Cycle status
- Cycle 7 (Scribe ingestion — pickers + Convert now): ✅ DONE — verified working; harness
  unblocked for Scribe.
- Next: Cycle 8 (Statute matching — render matched statutes w/ similarity/excerpt).
