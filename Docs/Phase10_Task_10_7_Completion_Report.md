# Phase-10 Task 10.7 — B3: Routing Accuracy Regression Suite

**Date:** 2026-06-11
**Plan gate:** ≥95% routing accuracy on existing ⌘K/ARA patterns.

## What shipped

1. **`src/test/routingAccuracy.test.ts` (NEW).** 47-pattern corpus pinning the Conductor's routing across every supported family — widget opens (13 phrasings incl. politeness), window ops (6), theme/accent/animations (4), spaces/memory (2), agent spawns (6), chains (3), skills (4), chat (8 must-NOT-be-claimed). **Measured accuracy: 100% (47/47)** — the suite asserts both zero mis-routes (strict) and the ≥95% plan gate (the contractual floor a future regression is judged against).
2. **Cascade resilience proof.** Two adversarial-LLM runs: (a) an LLM answering nonsense / low-confidence-wrong on alternating calls — threshold + JSON validation keep full-cascade accuracy at 100%; (b) a confident hallucinated intent (`"format-disk"`, 0.99) — bounded by the intent whitelist, heuristic verdict wins.
3. **`collectMisRoutes()` (llmRouter).** The re-training surface from the plan's "collect mis-routes" requirement: returns router decisions recorded `correct=false` plus 👎-rated ones; excluded from few-shot by construction. Tested.

## Verification

| Stage | Result |
|---|---|
| `tsc -b` | exit 0 |
| vitest full (Mac) | **136 files / 1179 tests PASS** (+5) |
| builds seeds=true/false | OK / OK |
| PII | 51 files, 0 leaks |
| SSR smoke (`SMOKE_TEST_PORT=3210`) | **PASS** — 200/6049 B, 0 errors |

## Honest scope notes

- Corpus accuracy is measured against the HEURISTIC leg and the threshold-protected cascade with mock LLMs — real-LLM normalization quality on fuzzy inputs is by nature not regression-testable offline; mis-route collection exists precisely to measure it in use.
- "Re-train Hermes weights" beyond collection (automated weight adjustment from mis-routes) deliberately not built — Hermes ranking already excludes fails/👎; an automated re-weighting pass is a Phase-11 candidate once real mis-route data exists.

**🎯 Block B complete (10.5 + 10.6 + 10.7).** **Vitest delta:** +5 (1174 → 1179). **Files:** 1 modified production (collectMisRoutes), 1 new test.
