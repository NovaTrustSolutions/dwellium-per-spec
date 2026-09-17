# Plan 057 — Cognitive Memory Network: real, persistent, app-wide

**Branch:** `feat/057-cognitive-memory-network` (off `main` @ `20f8a33`)
**Date:** 2026-09-17
**Owner:** Ilya · orchestrated by Claude (core in-session) + Ringer GLM workers (mechanical lanes)

## Why

The 2026-09-17 audit (this session) found the "Cognitive M Network" is an
**isolated widget**: `MemoryGraphRAG` builds a private in-memory engine per
mount (nothing persists, nothing else in the app reads or writes it), its HUD
prints invented telemetry (TPS/latency from the render tick, `NETWORK HEALTH
99.x%` from `edges % 10`, always-on `ACTIVE / ENABLED / VERIFIED: TRUE`, a
conflict banner on every query), `CognitiveHarness` is 100% decoration
(`Math.random()` logs, static "CONNECTED"), and System Health marks it `ok`
unconditionally (`requires: 'local'` → `'ok'`). 0 of 69 widgets connect to it.
The engine underneath (`lib/memoryGraphRag/`, 1,112 lines) is real: three-layer
store, hashed-trigram embeddings + cosine bridging, Personalized PageRank
retrieval, conflict resolution, optional LLM answer.

## Goal

One shared, persistent memory network per user that the whole app feeds, with
every number on screen measured and a health row that can actually go red.

## Non-goals (explicitly deferred, Ilya-gated)

- Injecting recalled memory into agent prompts (Stella/ARA/Hermes). Behaviour
  change + API spend → separate plan. This plan ships `cmn.recall()` for it.
- Backend `/api/mgrag/*` accelerators (`BackendEmbeddingProvider` stays unused).
- IndexedDB. localStorage first; `persist: 'full'` is surfaced, not hidden.

## Design

| Piece | File | Who |
|---|---|---|
| Shared per-user engine, persistence, dedupe, measured metrics, event log, probe | `src/lib/memoryGraphRag/shared.ts` (+ `offline` option in `index.ts`) | in-session ✅ |
| Document builders for local stores (Tag File / Scribe / captures / syntheses) | `src/lib/memoryGraphRag/sources.ts` | in-session ✅ |
| App-wide auto-feed hook, mounted in `AdminShell` beside the Honcho/Hermes runners; offline extractor only | `src/services/cognitiveMemoryBridge.ts` | in-session ✅ |
| Tests for all of the above | `src/test/memoryGraphRag/shared.test.ts`, `bridge.test.tsx` | in-session ✅ |
| **Lane A** — widget uses the shared network (no private engine), `Pull…` buttons use `sources.ts`, shows persist state, passes `metrics` to the HUD | `src/components/MemoryGraphRAG/MemoryGraphRAG.tsx` | Ringer/GLM |
| **Lane B** — HUD shows only measured values: latency from `metrics.lastQueryMs`, counts, conflicts only when `resolutions.length > 0`, `VERIFIED` only when a passage backs it; remove TPS + `99.x%` formula + fake badges | `src/components/MemoryGraphRAG/MemoryGraphView.tsx` | Ringer/GLM |
| **Lane C** — System Health probes the live network (`peekCmn()?.probe()`), `'local'` no longer means "always ok" | `src/lib/systemHealth.ts`, `src/hooks/useSystemHealth.ts` | Ringer/GLM |
| **Lane D** — CognitiveHarness binds RAG / Graph-RAG / Vector / Memory cards + log feed to `metrics()` and `events`; subsystems with no backing code are labelled "Not connected"; no `Math.random`, no `setInterval` fakery | `src/components/CognitiveHarness/CognitiveHarness.tsx` | Ringer/GLM |

Contract the lanes build on (already on the branch):

```ts
import { getCmn, peekCmn, type CmnMetrics } from 'lib/memoryGraphRag/shared';
const cmn = getCmn(userId, integrations.llm);   // one instance per user, hydrated from localStorage
useSyncExternalStore(cmn.subscribe, cmn.getVersion);
await cmn.ingest(docs, 'Pasted');               // dedupes; { ingested, skipped }
await cmn.answer(q); cmn.recall(q, 5);          // measured → metrics().lastQueryMs
cmn.metrics(); cmn.probe(); await cmn.reset();  // reset = user-initiated only
```

## Acceptance

1. Paste text in the widget → reload the page → it is still there (`persist: 'ok'`).
2. Save a Scribe file / Tag item / capture anywhere → within ~2 s the network's
   document count rises without opening the widget; `callLlm` is never invoked.
3. Every HUD number is traceable to `metrics()` or the store; `grep -nE
   "tick \* 137|99\.0 \+|Math\.random|VERIFIED.*TRUE" MemoryGraphView.tsx
   CognitiveHarness.tsx` returns nothing.
4. System Health shows "Cognitive M Network" red when `probe().ok === false`.
5. Strict gate green: `npx tsc -b && npx vitest run && npx react-router build`.
6. Report: `Docs/057_Cognitive_Memory_Network_Report.md` with browser evidence.

## Verification log

_(appended as lanes land)_

- 2026-09-17 — core `4008876`, lanes A–C `6d8000b`, lane D `784f22f`. Strict gate on the Mac:
  `tsc -b` exit 0 · vitest 346 files / 3,019 tests passed · `react-router build` exit 0.
  Acceptance #3 grep over MemoryGraphView.tsx + CognitiveHarness.tsx: no matches.
  Report: `Docs/057_Cognitive_Memory_Network_Report.md` (browser section pending sign-in).
