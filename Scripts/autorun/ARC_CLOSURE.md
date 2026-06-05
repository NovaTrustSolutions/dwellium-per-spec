# ARC_CLOSURE.md — Scribe-ingestion / Honcho / statute + TW / Stella / Hermes arc

**Branch.** `feat/scribe-ingestion-honcho` (built on the `feat/pm-exec-dashboard` arc base).
**Scope.** FULL arc — Block A (Cycles 1–11) + Block B (Cycles 12–18). This is the
terminal closure; `ALL_DONE` is touched after the fresh full-gate below passes.
**Date.** 2026-05-29.
**Block A sub-closure (Cycles 1–10 detail):** see `Scripts/autorun/INGEST_CLOSURE.md`.
**Per-fork decisions:** `Scripts/autorun/INGEST_DECISIONS.md`. **Plan:** `Scripts/autorun/INGEST_PLAN.md`.

---

## 1. Commit SHAs (whole arc, oldest → newest)

### Block A — ingestion + Honcho standalone + statute (Cycles 1–11)

| Cycle | Deliverable | Feature SHA | Log SHA |
|------:|-------------|-------------|---------|
| 1 | AUDIT + PLAN (`INGEST_PLAN.md`) | — | `1d50a0d` |
| 2 | Ingestion storage layer (`ingestionStore.ts` + `ingestionApi.ts` + tests) | `b5b21b2` | `ddfb89b` |
| 3 | Backend ingest route CONTRACT (`Docs/backend-ingest-routes.ts`) | `1447719` | — |
| 4 | Folder-picker UI (`IngestionPanel`, FS Access API, SSR-safe) + test | `894a532` | `945ce47` |
| 5 | Client-side convert + backup write (html/txt→md, .md passthrough) + tests | `b3cc796` | `7b19d5e` |
| 6 | Honcho standalone widget (register + pinned dock) + widget test | `b892c00` | `c1d372a` |
| 7 | Honcho Markdown arrange/filter view (`markdownArrange.ts`) + tests | `57a4919` | `b8ea3b9` |
| 8 | Honcho always-on-by-default + Dreams abilities + multi-screen deferral | `3efc5c8` | (in commit) |
| 9 | TranscriptionHub statute-matching (`statuteMatch.ts` + 22 tests) | `0166c73` | `4832003` |
| 10 | a11y polish across ingestion + Honcho surfaces | `9ac84d7` | `83d4aad` |
| 11 | BLOCK A sub-closure (`INGEST_CLOSURE.md`) | — | `e980d6a` |

### Block B — TW reports/insights · TW↔ARA↔Honcho · Hermes learning · Stella tools (Cycles 12–18)

| Cycle | Deliverable | Feature SHA | Log SHA |
|------:|-------------|-------------|---------|
| 12 | TW reports + insights store (`reportStore.ts` + `insights.ts`, local) + tests | `b4c5cb3` | (+ safety-net `002c3a8`) |
| 13 | TW Reports/Insights UI + `reportEngine.ts` + on-open catch-up + "Generate now" | `a668bd6` | `5eb6690` |
| 14 | Scheduler CONTRACT (`Docs/backend-schedule-routes.ts`) for the Electron build | `a7a0602` | — |
| 15 | TW ↔ ARA ↔ Honcho integration (`thoughtWeaverLinkage.ts`) + tests | `f0b9c8b` | — |
| 16 | Hermes self-improvement store (`hermesLearningStore.ts`, local per-user) + 16 tests | `66269e4` | — |
| 17A | Hermes learning wired into runs + shared `hermesRunner.ts` + rating UI + 10 tests | `becffe4` | — |
| 17B | Stella → Hermes first-class spawn (`stellaHermesSpawn.ts`, reuses runner) + 9 tests | `1635820` / `832024d` | `444d6f8` |
| 18A | Stella tool-library catalog (`stellaToolCatalog.ts`, 15 tools / 6 cats) + 12 tests | `0281776` | — |
| 18B | FULL ARC CLOSURE (this doc) + fresh full gate + `ALL_DONE` | (this commit) | — |

**Vitest trajectory:** base **459/56** → Block A **541/64** → Block B **644/72**
(+185 tests / +16 files across the arc). Every source-touching cycle left the strict 6/6
gate green; see per-cycle proof in `Scripts/autorun/INGEST_PROGRESS.md`.

---

## 2. The six spec deliverables — disposition

1. **Scribe ingestion pipeline.** ✅ SHIPPED (client-side path) + CONTRACTED (daemon).
   `IngestionPanel` picks a SOURCE + BACKUP-DESTINATION folder via the File System Access API
   (event-handler-gated, SSR-safe), persists metadata per-user via `createLocalStorageStore`,
   and "Convert now" converts browser-convertible files (html/htm/txt → Markdown via the
   reused `htmlToMarkdown.ts`; `.md` passthrough) into the backup folder, updating a
   converted-file index. The always-on watcher + non-HTML (pdf/docx) conversion are DEFERRED
   to the documented `Docs/backend-ingest-routes.ts` contract (sibling repo / Electron).

2. **TranscriptionHub legal-statute matching.** ✅ IMPROVED. New pure `statuteMatch.ts`:
   multi-section O.C.G.A. extraction (was 1-per-segment), dedup by normalized volumeId
   (max-similarity keep), verbatim non-coded-authority fallback (citations never dropped),
   a matched-statute detail list (id + similarity% + excerpt) in the UI, and graceful
   no-LLM / failed-fetch states.

3. **Honcho standalone, always-on widget.** ✅ SHIPPED. Registered `honcho` widget +
   pinned `dock-honcho`; renders the SHARED `HonchoHermesPanel` (D-1: SHARE, zero StellaAgent
   change). Always-on = pinned + one-time auto-open (`honcho:auto-open:v1` flag, polite). NEW
   Files tab (Markdown arrange/filter by name/size/date + text filter; drill-down opens Scribe)
   + Dreams tab (per-user `honchoDreamStore` abilities).

4. **ThoughtWeaver: reports + categorize + to-do gen + non-obvious insights, all local.**
   ✅ SHIPPED. `reportStore.ts` + `reportEngine.ts` + `insights.ts` (injectable LLM dep):
   categorize captures, daily report draft, daily + weekly to-do generation (feeds
   `syncTodosFromCaptures`), and non-obvious cross-capture insights via the per-user
   `callLlm`. Reports/Insights UI with on-open catch-up + "Generate now". **All data stays in
   per-user `createLocalStorageStore`** (backend optional sync only). TW↔ARA↔Honcho wired via
   `thoughtWeaverLinkage.ts` (reuses the `scribe:send-to-ara` bus + local `honchoDreamStore`).

5. **Stella: massive tool library + Hermes spawn.** ✅ SHIPPED. `stellaToolCatalog.ts` —
   15 tools in 6 ordered categories, every action REUSING an existing mechanism (chat-command /
   open-widget bus / tab-switch); rendered as a filterable "Tool Catalog" section in the Skills
   tab. Hermes-spawn + TW/Honcho/ARA handoffs are first-class catalog entries. Stella spawns
   Hermes via `/hermes <task>` (`stellaHermesSpawn.ts`) calling the ONE shared runner.

6. **Hermes self-improvement (local, both mechanisms).** ✅ SHIPPED. `hermesLearningStore.ts`
   (per-user, key `hermes:learning:<userId>`): (a) **run-memory few-shot** — every run recorded
   (prompt, tools, steps, outcome, optional rating); `relevantPastRuns()` injects top-K similar
   SUCCESSES as context into new runs; (b) **tool success-weighting** — per-tool per-task-type
   success counts → `toolWeights()` / `rankToolsByWeight()` re-rank proven tools first. Both
   mechanisms live in the single shared `hermesRunner.ts`, so BOTH entry points (standalone
   Honcho widget + Stella `/hermes`) feed and benefit from the SAME local store. 👍/👎 rating
   control calls `rateRun()`. NO model fine-tuning (documented as Electron/backend-GPU future).

---

## 3. Local-storage confirmation (arc rule: keep TW + Hermes-learning data LOCAL)

Every new per-user store uses `createLocalStorageStore` (dynamic key, `_anonymous` degrade,
`.reset()` escape-hatch per v2.72.1) — no backend write on the critical path:

- `ingestionStore` — picked-folder metadata + converted-file index.
- `reportStore` (`thought-weaver:reports:<userId>`) — daily reports + weekly summaries + insights.
- `todoStore` / `thoughtWeaverStore` — captures + to-dos (pre-existing, local).
- `honchoDreamStore` — Honcho memory/dreams (pre-existing, local) — also the TW→Honcho sink.
- `hermesLearningStore` (`hermes:learning:<userId>`) — run history + tool-success stats.

Backend routes (`/api/thought-weaver`, `/api/hermes/*`, `/api/honcho/*`) remain OPTIONAL sync /
execution only; no arc feature requires a backend write to function.

---

## 4. Deferred items (carry-forward — Electron / backend / future tasks)

| # | Item | Where / why |
|---|------|-------------|
| 1 | Always-on filesystem watcher | Backend/Electron — `Docs/backend-ingest-routes.ts` contract |
| 2 | Non-HTML conversion (pdf/docx→md) | Backend `POST /ingest/convert`; client queues + labels |
| 3 | `FileSystemDirectoryHandle` persistence across reload | D-2 — IndexedDB + `queryPermission()` re-grant |
| 4 | FS Access API fallback (Firefox/Safari) | D-3 — `<input type=file webkitdirectory>` path |
| 5 | Multi-physical-screen awareness | D-6 — Electron only (`screen` + `desktopCapturer`); NOT web-possible |
| 6 | Single source of truth for Honcho (Stella inline tabs → import the shared panel) | D-1 reversal — separate task |
| 7 | True background daily/weekly schedule + notification delivery | `Docs/backend-schedule-routes.ts`; web does on-open catch-up only |
| 8 | Hermes MODEL fine-tuning ("more use → better") | Out-of-app — Electron/backend-GPU future; the in-app store does few-shot + tool-weighting instead |
| 9 | ARA auto-pull of TW context (unprompted) | D15-3 — `buildTwContextDigest` helper makes it a one-liner; deferred to avoid coupling ARA to TW's store |
| 10 | Refactor Stella's legacy Hermes-tab `delegateToHermes` to the shared runner | D17B-1 — Stella protected; optional cleanup, not required |

---

## 5. Conventions honored across the arc

- **SSR safety** — no top-level / `useState(()=>…)` browser-global access; `showDirectoryPicker`
  + handles gated behind onClick/effects; all persistence via `createLocalStorageStore`
  dynamic-key + UserContext-direct reads. SSR smoke test PASSED every source-touching cycle.
- **Reuse-before-build** — one converter (`htmlToMarkdown.ts`), one open-widget bus
  (`dwellium:open-widget`), one Hermes run path (`hermesRunner.ts`), one LLM client
  (`lib/llmClient.ts`). No duplicated converter / fetch / LLM logic.
- **Stella protected** — additive-only StellaAgent.tsx changes (imports + holder + intercept +
  catalog section); 12 existing StellaAgent.test.tsx assertions pass unchanged; no redesign.
- **Injectable-deps test pattern** — `*Linkage.ts` + `hermesRunner.ts` + `stellaHermesSpawn.ts`
  + `insights.ts` mirror `workspaceScribe.ts`: pure functions + injected side-effects → unit-test
  with no DOM / no live bus / no real store.
- **No fake timers** (Phase-7 Finding (B) — real clock in all new tests).

---

## 6. Fresh full-gate proof at closure HEAD

See the Cycle-18B entry in `Scripts/autorun/INGEST_PROGRESS.md` for the pasted 6/6 gate output
captured at this commit's parent (`0281776`) → this commit.

---

## 7. Push commands (NOT run by the autorun driver — Ilya runs these)

```bash
# from repo root
git push origin main                          # if main moved (it did not in this arc)
git push -u origin feat/scribe-ingestion-honcho
# then open a PR feat/scribe-ingestion-honcho → main
```

**The autorun driver never pushes.** This arc is complete and green on the branch; `ALL_DONE`
is touched after the fresh full gate below passes.
