# 057 — Cognitive Memory Network: functionality report

**Date:** 2026-09-17 · **Branch:** `feat/057-cognitive-memory-network` (3 commits on `main` @ `20f8a33`) · **Plan:** `plans/057-cognitive-memory-network.md`
**Diff:** 15 files, +994 / −276 · **Gate:** `tsc -b` exit 0 · vitest **346 files / 3,019 tests passed** · `react-router build` exit 0 (all run on the Mac, 2026-09-17)

## 1. What changed, in one paragraph

Before: the "Cognitive M Network" was one widget with a private, in-memory engine; nothing persisted, no other part of the app could reach it, its HUD printed invented numbers, `CognitiveHarness` was a pure mock-up, and System Health marked it green unconditionally. After: there is **one memory network per signed-in user**, saved in the browser and restored on reload, **fed automatically by the whole app** (Tag File, Scribe documents, Foundry captures, Syntheses) without opening any widget, with **every on-screen number measured** and a **health row that can turn red**.

## 2. Capabilities now (with the evidence for each)

| Capability | How it works | Evidence |
|---|---|---|
| **Persistent memory** | `CognitiveMemoryNetwork` saves an engine snapshot + seen-document hashes to `localStorage` (`dwellium-cmn-v1:<userId>`) after every ingest and re-hydrates on construction, rebuilding bridges. Corrupt saves are left untouched, never deleted. | `qualia-shell/src/lib/memoryGraphRag/shared.ts` · tests "persists what it ingests…", "leaves an unreadable saved copy on disk…" in `src/test/memoryGraphRag/shared.test.ts` |
| **One network per user** | `getCmn(userId)` returns the same instance for the same user; switching users swaps instances (Andy ≠ Lisa). | test "returns one shared instance per user and isolates users" |
| **App-wide auto-feed** | `useCognitiveMemoryBridge()` is mounted in `AdminShell` beside the Honcho/Hermes runners; subscribes to the four local stores, debounces 1.5 s, feeds `allLocalDocuments(uid)`. | `src/services/cognitiveMemoryBridge.ts`, `src/components/Shell/AdminShell.tsx` · `src/test/memoryGraphRag/bridge.test.tsx` |
| **Never spends the LLM key in the background** | The bridge ingests with `{ offline: true }`, which forces the heuristic extractor even when an LLM is configured. | `index.ts` `ingest(docs, { offline })` · test "background (offline) ingest never calls the LLM even when one is active" (`callLlm` mock asserted not called) |
| **De-duplicated ingestion** | Documents are keyed by `sourceId` + djb2 hash of text; unchanged docs are skipped, changed docs re-ingested. | test "skips documents it has already seen and re-ingests changed text" → `{ingested:2,skipped:0}` then `{0,2}` then `{1,1}` |
| **Measured metrics + event log** | `metrics()` reports counts, bridges, documents, ingests, queries, `lastIngestMs`, `lastQueryMs`, conflicts resolved, persist state/bytes, and the last 50 events (kind, detail, source, ms). | test "reports measured metrics and a real event log" |
| **Real liveness probe** | `probe()` exercises the store and retrieval and reports storage state; `full`/`unavailable` → not ok. | tests "flags a full browser store instead of pretending to save", "probe is healthy on a working engine…" |
| **System Health can go red** | `HealthCtx.localOk` + `probeLocal()`; `'local'` items resolve `down` when the probe says `ok:false`. | `src/lib/systemHealth.ts`, `src/hooks/useSystemHealth.ts` · `src/test/systemHealthCmn.test.ts` (6 tests) |
| **Widget on the shared network** | `MemoryGraphRAG` uses `getCmn()` + `useSyncExternalStore`; "Pull…" buttons use `sources.ts`; shows "Saved locally · N KB" / "NOT SAVED — browser storage full"; Reset is the only place memory is cleared (user-initiated). | `src/components/MemoryGraphRAG/MemoryGraphRAG.tsx` |
| **HUD shows measured values only** | LATENCY/INGEST from `lastQueryMs`/`lastIngestMs`; STORAGE from persist state; CONFLICTS RESOLVED/BRIDGES from metrics; conflict banners only when resolutions exist; RELEVANCE = real PageRank score; sparklines from the event log. Removed: TPS, `99.x%` health formula, ACTIVE/ENABLED/VERIFIED:TRUE. | `src/components/MemoryGraphRAG/MemoryGraphView.tsx` · grep `tick \* 137\|99\.0 \+\|Math\.random\|VERIFIED.*TRUE` over both UI files → **no matches** |
| **CognitiveHarness is data-bound** | RAG / Graph-RAG / Vector DB / Memory cards read `metrics()`; the six subsystems with no backing code say **"Not connected"**; log feed = real events; header = CONNECTED only when `probe().ok`; particle canvas labelled *visualization*, deterministic PRNG. | `src/components/CognitiveHarness/CognitiveHarness.tsx` |
| **Recall API for future consumers** | `cmn.recall(query, limit)` — retrieval only, no LLM spend — for agents/widgets to pull context. Wiring it into Stella/ARA/Hermes prompts is deferred (behaviour change + spend; Ilya-gated). | `shared.ts` |

## 3. What is still NOT true (honest limits)

- **localStorage only** (~5 MB/origin). When it fills, the UI says "NOT SAVED — browser storage full" and System Health goes red; nothing is silently dropped, but nothing new is saved either. Upgrade path: IndexedDB (`ponytail:` comment in `shared.ts`).
- **Re-ingesting a document that shrank** leaves its old higher-index passages behind (documented in code). Reset clears everything.
- **No agent uses `recall()` yet.** The network is fed app-wide; it is not yet *read* app-wide beyond the two widgets + System Health.
- **Backend accelerators** (`BackendEmbeddingProvider`, `/api/mgrag/*`) remain unimplemented; everything runs client-side.
- **Browser walkthrough:** see §5 — pending sign-in at the time of writing.

## 4. How it was built (swarm record)

| Lane | Files | Worker | Result |
|---|---|---|---|
| Core (engine, persistence, bridge, tests, plan) | `lib/memoryGraphRag/{shared,sources,index}.ts`, `services/cognitiveMemoryBridge.ts`, `Shell/AdminShell.tsx`, tests | Claude (in-session) | committed `4008876` |
| A — widget rewire | `MemoryGraphRAG.tsx` | Ringer · claude-sonnet-5 | PASS, attempt 1, 154 s |
| B — HUD de-faking | `MemoryGraphView.tsx` | Ringer · claude-sonnet-5 | PASS, attempt 1, 353 s |
| C — real health probe | `systemHealth.ts`, `useSystemHealth.ts`, new test | Ringer · claude-haiku-4-5 (exploration lane) | PASS, attempt 1, 132 s |
| D — harness data-binding | `CognitiveHarness.tsx/.css` | Ringer · claude-sonnet-5 | code correct after attempt 2; the check's `setInterval\(` regex wrongly flagged the spec-permitted 6 s tab auto-cycle → check bug, patch reviewed + applied |

Every lane's patch was produced in an isolated git worktree, verified by an executed check (`tsc --noEmit` + targeted vitest + required/forbidden content greps), then reviewed line-by-line and applied with explicit `git add` paths. Earlier GLM attempts failed on authentication (root-caused and fixed in Ringer's `glm` wrapper: isolated `CLAUDE_CONFIG_DIR`); no GLM code landed.

## 5. Browser walkthrough (localhost:5177, worktree build)

_Pending — requires the access password on the preview tab. To be appended with screenshots: paste → reload → still present; Scribe save → document count rises without opening the widget; HUD readouts; System Health row._
