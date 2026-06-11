# Phase-10 Task 10.5 — B1: llmRouter Intent Classifier

**Date:** 2026-06-11
**Gate (locked at kickoff):** per-user LLM key first (llmClient browser-direct) → backend fallback → heuristic.

## What shipped

1. **`src/lib/llmRouter.ts` (NEW).** `classifyIntent(text, deps)` cascade exactly per the locked gate: (1) per-user LLM, JSON-classified (`temperature 0`, `responseFormat 'json'`, `extractJson` tolerates fenced/chatty output) with intent taxonomy `spawn | chain | command | skill | chat`; (2) backend leg as an injectable `deps.backendClassify` hook — **the server route does not exist yet** (carry-forward, sister to humanize/test-postgres: frontend-ready, backend pending); (3) `heuristicRoute` — total function derived from the existing exact parsers (parseSpawn → parseChain → parseCommand → matchSkill → chat), parser hits at 0.95 confidence, chat fallback at 0.5.
2. **Threshold semantics.** `ROUTER_CONFIDENCE_THRESHOLD = 0.7` exported for B2: LLM/backend verdicts below it (or malformed, or invalid-intent, or thrown) fall through rather than being trusted. Verdict validation whitelists the intent enum — a hallucinated intent can't reach the dispatcher.
3. **Hermes routing memory.** Decisions recorded under tag `llm-router` (separate from `ara-chat` + lab runs, same one-log pattern as 10.3); `routerFewShot` injects top-3 similar PAST decisions into the classifier prompt (positive-similarity gate; mis-routes recorded `correct=false` and 👎-rated runs never surface). `recordRoutingDecision` is the hook 10.7's mis-route collection builds on.
4. **`src/test/llmRouter.test.ts` (NEW).** 25 tests: 13-case heuristic corpus (spawn/chain/command/skill/chat incl. politeness + compound placements), cascade legs (confident-LLM trusted, low-confidence falls through, malformed JSON, invalid intent rejected, backend leg, throwing leg, key-less pure-heuristic, fenced JSON), few-shot recording/exclusion/prompt-injection.

## Verification

| Stage | Result |
|---|---|
| `tsc -b` | exit 0 |
| vitest full (Mac) | **134 files / 1161 tests PASS** (+25) |
| builds seeds=true/false | OK / OK |
| PII | 51 files, 0 leaks |
| SSR smoke (`SMOKE_TEST_PORT=3210`) | **PASS** — 200/6049 B, 0 errors |

## Honest scope notes

- **Nothing is rewired yet** — ⌘K and ARA still route purely heuristically. 10.6 (B2) swaps the dispatcher to `classifyIntent` with the heuristic kept as the sub-threshold leg.
- Backend classifier route (`/api/...`) is a backend-repo change — carry-forward to the ARA per-user-key passthrough backend session.
- LLM-leg latency vs. the instant heuristic is a real UX question for 10.6 (classification adds a round-trip before dispatch); 10.7's accuracy run will inform whether LLM-first or heuristic-first-LLM-on-miss is the right wiring. Flagged for the 10.6 PRE0.

**Vitest delta:** +25 (1136 → 1161). **Files:** 1 new production, 1 new test.
