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

---

## Cycle 8 — Statute matching reachable on loaded transcripts (FIXED + runtime-verified)

**Feature:** Georgia O.C.G.A. statute matching inside Transcribe → Legal Shield.

### The break (renders-but-dead — classic "compiles ≠ works")
Statute matching is computed by the Legal Shield scan: `scanSegmentsViaLlm` →
`buildMatchedStatutes` (`statuteMatch.ts`) extracts every cited O.C.G.A. section from the
LLM result, normalizes to `O.C.G.A. § …`, de-dupes, weights primary (cited in `code_ref`,
similarity 1) vs secondary (summary-only, similarity 0.6), and renders each with a
similarity badge + excerpt at `TranscriptionHub.tsx:2295`. The render path + unit tests were
already correct. **But the scan was only ever enqueued during LIVE mic transcription** (the
moonshine `:1166` and cloud-STT `:938` paths push each new segment onto `legalScanQueue`).
`loadTranscription` (`:1374`) — the ONLY non-mic way to get segments into the view — set the
segments but never queued a scan. So anyone REVIEWING a saved transcript saw zero matched
statutes: the feature was structurally unreachable outside a live microphone.

### Fix (production source — `TranscriptionHub.tsx` `loadTranscription`)
After loading a saved transcript's segments, enqueue their texts for a legal scan (same
`text.length > 15` gate the live path uses) when Legal Shield is on. The existing scan
effect drains the queue and only calls the LLM when a provider is active — so it's a no-op
offline (correct: no false alerts without an LLM). 8 lines; mirrors the live-path enqueue.

### Runtime proof (PASS, exit 0; served build :3460)
Harness action `statute-match` (`_drive.mjs`): seeds a saved transcript (2 segments) + an
active `local` LLM bundle in the per-user `integrations:<uid>` store, route-stubs ONLY the
`/v1/chat/completions` network call (echoing a canned Georgia-code legal-scan keyed off the
segment text), then drives the REAL flow — open Transcribe → maximize → Log tab → click the
entry → `loadTranscription` enqueues → scan resolves → matched statutes render.
```
statute-match lists=2 ids=[O.C.G.A. § 44-7-14, O.C.G.A. § 44-7-7, O.C.G.A. § 44-7-30, O.C.G.A. § 44-7-34] \
  sims=[100%,100%,100%,60%] excerpts=4 lockStatutes=true depositStatutes=true has100=true has60=true
```
- Lockout segment ("…change the locks myself") → **violation**, `§ 44-7-14` + `§ 44-7-7`
  both **100%** (both in `code_ref` = primary).
- Deposit segment ("…security deposit return…") → **caution**, `§ 44-7-30` **100%**
  (primary) + `§ 44-7-34` **60%** (named only in the summary = secondary weight).
- 4 excerpts rendered. Screenshot `cleanup-shots/statute-match.png` shows both segments with
  similarity badges + excerpt text — the feature actually does the thing.
- Extraction/normalize/de-dupe/similarity/render are ALL real; only the LLM HTTP call is
  stubbed (no live key in this env). Proves both the wiring AND the reachability fix.

**Harness note:** at quadrant-spawn width the Transcribe log list collapses to zero height
(`flex min-height:0 + overflow:hidden`) → entries are `hidden`; the driver now maximizes the
window (titlebar double-click) before reading the log. Reusable for future Transcribe cycles.

### Gate (green)
- `tsc -b` rc=0 ✓ · `vitest run` **661/661** (75 files) ✓ · `react-router build` rc=0 ✓ ·
  SSR smoke (`SMOKE_TEST_PORT=3458`) **PASS** (0 console / 0 warnings / 0 page errors) ✓.

### Cycle status
- Cycle 8 (Statute matching): ✅ DONE — verified working at runtime; reachability fixed.
- Next: Cycle 9 (Workspace — Domaine→Project→Thread drill-down; currently ❌ domaines 404).

---

## Cycle 9 — Workspace Domaine→Project→Thread drill-down reachable offline (FIXED + runtime-verified)

**Feature:** Workspace widget drill-down (Domaines index → Projects → Threads).

### The break (renders-but-dead — classic "compiles ≠ works")
Workspace is a pure METADATA + STRUCTURE view over two backend routes:
`GET /api/workspace/domaines` (domaine sidecars) and `GET /api/file-explorer/tree`
(folder structure → tier-classified Domaine/Project/Thread). Both 404 with no backend
filesystem in this env, so the index view dead-ended at **"Failed to load domaines —
HTTP 404" + Retry** with nothing to drill into. The drill-down LOGIC was already correct
and unit-tested (`openDomaine`/`openProject`/`goBack` + the pure `projectsForDomaine`/
`threadsForProject` selectors) — but it was **structurally unreachable** offline because
there was no data to derive from.

### Fix (local-first fallback — mirrors Cycle 5/6 "reachable offline" theme)
- NEW `workspaceLocalSeed.ts` — a tiny, self-consistent in-memory sample workspace
  (3 domaines → projects → threads → files) where every `DomaineMeta.path` matches a
  top-level tree node, so the existing pure selectors derive projects/threads unchanged.
- `workspaceStore.ts` — added `offline` flag + `useLocalWorkspace()` action (loads seed
  into domaines+tree together, flips `offline`, clears load errors). Successful real loads
  set `offline:false` so a backend coming online auto-replaces the seed. **Thunks' tested
  error contract is UNCHANGED** (existing `loadDomaines` error-path tests still pass) — the
  fallback is wired at the component layer.
- `Workspace.tsx` — the mount/drill load effects + manual Refresh now fall back to
  `useLocalWorkspace()` when a load errors with an empty list, and an honest amber banner
  ("Backend unavailable — showing a local sample workspace. Drill-down works; creating/
  renaming folders needs the backend.") surfaces in offline mode. Read-only: structure
  mutations still require the backend (honest mutation error offline).
- 7 NEW tests (`Workspace.localFallback.test.ts`): action populates domaines+tree+offline,
  seed self-consistency, selectors derive projects+threads off the seed, nav altitude
  transitions, offline-cleared-on-successful-load, reset clears offline.

### Runtime proof (PASS, exit 0; served build :3460, real backend :3000 → 404s = offline path)
Harness action `workspace-drilldown` (`_drive.mjs`): opens Workspace, maximizes the window,
then drives the REAL drill-down end-to-end and asserts each altitude + back-nav.
```
workspace-drilldown offline=true domaines=3 firstDomaine="Property Operations…" \
  projects=2 threads=2 back→projects=true back→index=true
```
- Backend domaines/tree routes 404 → `useLocalWorkspace` fires → **offline banner shown**.
- Index: **3 domaines**. Click "Property Operations" → **2 projects** render (openDomaine →
  projectsForDomaine off the seeded tree). Click first project → **2 threads** render
  (openProject → threadsForProject). Back button → projects list returns; back again →
  domaines index returns (goBack steps project→domaine→index). Screenshot
  `cleanup-shots/workspace-drilldown.png`.
- The 7 console 404s are the EXPECTED backend-absent fetch failures that TRIGGER the
  fallback — not JS crashes. The navigation logic + selectors are the real code; only the
  data source is the offline seed (there is no backend filesystem in this env).

### Gate (green)
- `tsc -b` rc=0 ✓ · `vitest run` **667/667** (76 files; +6 net) ✓ · `react-router build`
  rc=0 ✓ · SSR smoke (`SMOKE_TEST_PORT=3458`) **PASS** (0 console / 0 warnings / 0 page
  errors) ✓.

### Cycle status
- Cycle 9 (Workspace drill-down): ✅ DONE — verified navigating at runtime offline.
- Next: Cycle 10 (Dashboard UI Pass 1 — Astra/PM-exec layout + responsiveness).

═══════════════════════════════════════════════════════════════════════════════
## Cycle 10 — DASHBOARD UI PASS 1: layout + responsiveness (Astra/PM-exec)
**Date:** 2026-05-31 · Branch `feat/scribe-ingestion-honcho`

### The break (runtime-proven, not theoretical)
Astra renders inside a draggable/resizable **shell window**. Its responsive rules were
**viewport `@media (max-width:900px)`** — but a viewport query NEVER fires when a user
shrinks the *window* on a wide monitor. Probed it: viewport 1440 + window forced to **680px**
→ the 3-col grid stayed 3-col (`116px 345px 292px`) and panels overflowed the window by
**152px** (`a-grid-right`, `a-calendar`, `a-compliance`, `a-vendors`, `a-risk` all +152).
This is exactly the window-vs-viewport mismatch CLAUDE.md says Strata solved with container
queries. (The prior iteration's topbar `flex-wrap` fixed the *viewport*-narrow case only;
the window-narrow case was still broken.)

### Fix (repo convention — container queries, mirrors Strata `.s-module`)
`qualia-shell/src/components/AstraDashboard/AstraDashboard.css`:
- `.a-content` (the window-width-bound scroll region wrapping every tab) → `container-type:
  inline-size; container-name: astra-content;`.
- Replaced the single viewport `@media (max-width:900px)` collapse with **container** queries
  on `.a-content`: `@container astra-content (max-width:1080px)` → 2-col; `(max-width:820px)`
  → 1-col (+ the workspace/channels split-views stack). Kept a slim `@media (max-width:820px)`
  legacy fallback for no-container-query contexts.

Driver: added `DRIVE_WIN_W` to `_drive.mjs` `astra-responsive` so the OS-window width can be
forced INDEPENDENTLY of the viewport (this is what exposed the real defect).

### Runtime proof (served build :3460, real backend :3000)
| viewport | window | grid cols | rootOverflow | maxChildOverflow | deadButtons |
|---------:|-------:|-----------|-------------:|-----------------:|------------:|
| 1440 | **680** | **1** (`614px`) | 0 | **0** (was 152) | 0 |
| 1440 | 950 | 2 (`435 435`) | 0 | 0 | 0 |
| 1440 | 1440 | 3 (`448 448 448`) | 0 | 0 | 0 |

Shots: `cleanup-shots/c10-fixed-win680.png` (clean 1-col stack, nothing clipped),
`c10-fixed-win950.png`, `c10-fixed-win1440.png`. Defect baseline: `c10-defect-win680.png`.

### Gate (green)
- `tsc -b` rc=0 ✓ · `vitest run` **667/667** (76 files) ✓ · `react-router build` ✓ ·
  SSR smoke (`SMOKE_TEST_PORT=3458`) **PASS** (0 console / 0 warnings / 0 page errors) ✓.

### Cycle status
- Cycle 10 (Dashboard UI Pass 1 — layout + responsiveness): ✅ DONE — grid now reflows on
  WINDOW width 3→2→1 col with zero overflow at every size; runtime-verified.
- Next: Cycle 11 (Dashboard UI Pass 2 — loading/empty/error states, a11y, zero console errors).

═══════════════════════════════════════════════════════════════════════════════
## Cycle 11 — DASHBOARD UI PASS 2: states + a11y + zero console errors
**Date:** 2026-05-31 · Branch `feat/scribe-ingestion-honcho`

### What I tested (runtime, headless Astra on served build :3460)
Built a new reusable driver action `astra-a11y` (_drive.mjs): raises the Astra
window, enters Edit mode (renders the 90 per-panel layout controls), freezes CSS
transitions for deterministic reads, then **Tab-walks every focusable control**
recording — per control — focus-ring visibility, branded-vs-UA colour (resolved
against the live theme `--a-accent`), and `outline-offset`. Also counts JS console
errors (network 404s from the absent backend are excluded — they're caught by the
data layer's per-section `settle()` and were documented expected since Cycle 9).

### Findings — most of Pass 2 was ALREADY met (honest baseline)
- ✅ **Zero JS console errors** (only backend-absent 404s, which degrade gracefully).
- ✅ **Zero focus-INVISIBLE controls** — every control shows a ring (WCAG 2.4.7 OK).
- ✅ **Full WAI-ARIA tabs pattern** already present: `role=tablist/tab/tabpanel`,
  roving `tabIndex`, ArrowLeft/Right/Up/Down + Home/End (`onTabKeyDown`), `aria-selected`,
  `aria-controls`, `aria-labelledby` (AstraDashboard.tsx:1317-1374).
- ✅ **0 dead/unlabeled buttons** (all 19 icon buttons carry `aria-label`).
- ✅ **Consistent loading/empty/error states** — unified `PanelStatus` helper
  (`role=status` / `role=alert` / empty) used by 14/16 data panels; the 2 exceptions
  (HR = always-present sample data; Research = LLM panel) reuse the same
  `a-panel-state` classes inline. Verified in source.

### The ONE real gap (runtime-measured) + fix
**Focus-ring OFFSET was inconsistent.** Frozen-transition Tab-walk, BEFORE:
`offsets=["1px","3px"]` — the per-panel layout edit controls (`.a-panel-ctrl`:
move ◂▴▾▸ + hide ✕) had **no local `:focus-visible` rule**, so they fell back to
the *global* `styles/global.css:65` ring at `outline-offset: 3px`, while every
other dashboard control uses `1px`. A keyboard user editing the layout saw a
looser ring than everywhere else.

Fix — one consolidated rule appended to `AstraDashboard.css` (mirrors the existing
`var(--a-accent)` 2px-solid pattern), placed last so it harmonises every control:
```css
.astra-dashboard :is(button, a[href], input, textarea, select, [tabindex]):focus-visible {
    outline: 2px solid var(--a-accent);
    outline-offset: 1px;
    border-radius: inherit;
}
```
Keyboard-only by design (`:focus-visible` never fires on mouse click); theme-aware
(`--a-accent` = `var(--accent, #D6FE51)`, follows the active skin).

### Runtime proof (frozen-transition Tab-walk, same harness, both on rebuilt artifacts)
| | offsets | branded | focus-invisible | JS errors | verdict |
|---|---|---|---|---|---|
| BEFORE | `["1px","3px"]` | all | 0 | 0 | FAIL (mixed offset) |
| AFTER  | `["1px"]`       | all | 0 | 0 | **PASS** |
Shots: `cleanup-shots/c11-a11y-before.png`, `c11-a11y-after.png`.

> Honesty note (anchor-bias discipline): my first hypothesis — "controls lacking a
> local `:focus-visible` rule have INVISIBLE focus" — was REFUTED at runtime (the
> global rule + UA defaults always render a ring). The real, narrower defect was an
> offset *inconsistency*, not invisibility. Recorded as found, not as assumed.

### Gate (green)
- `tsc -b` rc=0 ✓ · `vitest run` **667/667** (76 files; +0 — CSS-only) ✓ ·
  `react-router build` ✓ · `verify_no_pii_leak` clean ✓ · SSR smoke
  (`SMOKE_TEST_PORT=3458`) **PASS** (0 console / 0 warnings / 0 page errors) ✓.

### Cycle status
- Cycle 11 (Dashboard UI Pass 2 — states + a11y + zero console errors): ✅ DONE —
  states/a11y verified already-solid; focus-ring offset unified 1px/3px → 1px;
  runtime-verified before/after.
- Next: Cycle 12 (CLOSURE — CLEANUP_CLOSURE.md per-feature table + ALL_DONE).
