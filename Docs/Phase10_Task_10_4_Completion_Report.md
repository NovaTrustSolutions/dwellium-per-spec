# Phase-10 Task 10.4 — A3: Multi-Step Command + Skill Chaining

**Date:** 2026-06-11

## What shipped

1. **`src/lib/conductorChain.ts` (NEW, React-free).** `parseChain` splits an utterance on the parseCommand connector set and resolves each clause command-first then skill; it only CLAIMS the input when every clause resolves AND ≥1 is a skill. Command-only chains stay with parseCommand (existing ack UX); any chat-shaped clause ("…and tell me a joke") sends the whole input to the LLM rather than half-running it; no-split verbs and spawn-claimed inputs are re-guarded. `executeChain` runs steps sequentially (commands fire `run()`, skills run with the per-user LLM bundle), streaming per-step outcomes; a failed step is flagged but doesn't halt the chain.
2. **Result piping.** A later skill clause may say "the result" / "the answer" / "that result" — substituted from the previous skill's output via `extractPipeValue` (calculator-shaped "= N" outputs pipe just the number, so "calculate 15% of 2400 and calculate the result + 10" → 370). Command clauses can't be re-bound (their closures capture literal text) — documented limitation.
3. **`evaluateMath` "of" fix (`lib/agents/skills.ts`).** The BACKLOG headline example "calculate 15% of 2400" FAILED standalone — "of" flunked the whitelist. One word-bounded `of → *` mapping; existing 15 agentSkills tests unaffected.
4. **ARAConsole.** Chain branch in `sendMessage` (after spawn intercept, before parseCommand): one progressive message, `✓/⚠ Step N — result` lines, completion line + TTS.
5. **`src/test/conductorChain.test.ts` (NEW).** 13 tests: the BACKLOG example end-to-end (open-widget event spied + 360 computed), parse gates (command-only/single/chat-clause/no-split/spawn null), 3-step "then" chains, piping → 370, failed-step-doesn't-halt, formatter.

## Verification

| Stage | Result |
|---|---|
| `tsc -b` | exit 0 |
| vitest full (Mac) | **133 files / 1136 tests PASS** (+13) |
| builds seeds=true/false | OK / OK |
| PII | 51 files, 0 leaks |
| SSR smoke (`SMOKE_TEST_PORT=3210`) | **PASS** — 200/6049 B, 0 errors |

## Honest scope notes

- "Open notepad **and draft a letter in it**" (typing INTO a widget) remains out of scope — that's the widget-action-bus BACKLOG item, not chaining. Chaining handles open + compute + open-style sequences.
- ⌘K still uses parseCommand alone: a chained skill clause typed into ⌘K is dropped as before (no chat surface to render skill output). Routing chained ⌘K input to ARA is a natural 10.6 (B2) addition when the dispatcher is rewired.
- Spawn steps inside chains deliberately excluded (long-running async vs. sequential chain semantics) — Phase-11 candidate.
- Live browser verification still pending for the whole Block-A stack (spawn run + hints + chains) — single session checklist before 10.5.

**Vitest delta:** +13 (1123 → 1136). **Files:** 1 new + 2 modified production, 1 new test.
