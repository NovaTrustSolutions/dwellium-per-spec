# Phase-10 Task 10.6 — B2: Dispatcher Rewire (Heuristic-First, LLM-on-Miss)

**Date:** 2026-06-11
**Wiring gate (Ilya):** heuristic-first; LLM only when no exact parser claims the input — zero latency regression on exact commands, LLM catches fuzzy phrasings. (The plan's LLM-first reading was rejected at PRE0 for the dispatch round-trip cost.)

## What shipped

1. **llmRouter normalization.** `RouteDecision.normalized` — classification alone isn't actionable, so the LLM verdict now carries a canonical imperative rephrasing ("can you get the strata thing up" → "open strata") that the exact parsers can execute. Whitelist validation unchanged; empty normalized dropped. `looksActionable` pre-filter (≤10 words, non-question) keeps classify-then-chat double-round-trips off the common chat path.
2. **ARAConsole `dispatchTiers` refactor.** The four exact-parser tiers (spawn → chain → command → skill) extracted from `sendMessage` into one reusable dispatcher, parameterized by `parseText` (what parsers see) vs `echoText` (what the transcript shows — always the raw utterance). `sendMessage` = pass 1 raw → pass 2 LLM-normalized re-dispatch (decisions Hermes-logged via `recordRoutingDecision`) → chat. No behavior change for previously-working inputs (existing ARAConsole component tests pass unmodified).
3. **⌘K "Ask ARA" row.** Multi-word queries no parser claims get a low-scored palette row; running it opens ARA and hands the query over via the new `dwellium:ara-prompt` bus (pending-slot mirror of spawn's, covering the lazy-chunk mount race). ARA re-runs tiers + normalization on arrival — ⌘K-typed chains/skills (10.4's documented ⌘K gap) now execute instead of being dropped.
4. **`src/test/llmRouterWiring.test.ts` (NEW).** 13 tests: normalized verdict carried + re-parses via parseCommand, whitespace-normalized dropped, looksActionable corpus (4 actionable / 6 not), prompt-bus one-shot + live-event semantics.

## Verification

| Stage | Result |
|---|---|
| `tsc -b` | exit 0 |
| vitest full (Mac) | **135 files / 1174 tests PASS** (+13; ARAConsole suites pass unmodified post-refactor) |
| builds seeds=true/false | OK / OK |
| PII | 51 files, 0 leaks |
| SSR smoke (`SMOKE_TEST_PORT=3210`) | **PASS** — 200/6049 B, 0 errors |

## Honest scope notes

- The LLM-on-miss path needs the live-browser pass like the rest of the arc (fuzzy phrase → normalized execution with a real key). All mock-verified.
- Routing decisions are recorded `correct=true` at dispatch time — actual correctness signal (mis-route collection) is 10.7's scope.
- ⌘K palette suggestion list stays fully synchronous (no as-you-type LLM calls by design); AI routing costs one explicit Enter on the "Ask ARA" row.

**Vitest delta:** +13 (1161 → 1174). **Files:** 3 modified production (llmRouter, ARAConsole, CommandPalette), 1 new test.
