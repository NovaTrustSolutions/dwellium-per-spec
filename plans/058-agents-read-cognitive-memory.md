# Plan 058 — Agents read from the Cognitive Memory Network

**Branch:** `feat/058-agents-recall` (off `main` @ `07880ca`) · **Date:** 2026-09-17 · **Requested by:** Ilya ("wire recall() into the agents so they read from the network")

## Design
- `src/lib/memoryGraphRag/recall.ts` — `recallContext(userId, query)` → bounded markdown block
  (`## Relevant memory (Cognitive M Network)` + `[M1]…` passages, ≤2,400 chars) or `''`.
  Retrieval only (PageRank); never calls an LLM; safe before hydration; `withRecall(prompt, mem)`.
- One injection point per agent, at the existing system-prompt composition:
  - **Stella** (`StellaAgent.tsx` LLM-first chat, ~L757): `systemPrompt: withRecall(base, await recallContext(uid, text))`.
  - **ARA** (`ARAConsole.tsx` offline-fallback prompt, ~L1277): same, keeps the hermesHints suffix.
  - **Hermes** (`services/hermesAutonomousRunner.ts::runClaimedTask`): new optional `deps.recall?: (q) => Promise<string>`;
    the hook passes `(q) => recallContext(uid, q)`; the block is appended to the augmented persona prompt.
- Empty network ⇒ prompts byte-identical to today (no behaviour change until the user has memory).

## Acceptance
1. Each agent's LLM call receives the memory block when the network holds a relevant passage, and the unchanged prompt when it is empty (unit tests with `callLlm` mocked).
2. `callLlm` is never invoked by recall itself.
3. Strict gate green; e2e regression vs `main` shows no new failures.

## Verification log
- 2026-09-17 — core `f724d5a` (recallContext + 5 tests), agents `bfc8537` (Ringer lanes: Stella /
  ARA / Hermes, claude-sonnet-5; ARA + Hermes PASS attempt 1, Stella's production change PASS with a
  test-typing fix on apply). Gate on the Mac: `tsc -b` 0 · vitest 347 files / 3,030 tests · build 0.
  Full Playwright suite, isolated on :5199 (`playwright.port5199.config.ts`, `VITE_ONE_SAVE=false`):
  branch 40 failed / 36 passed vs `main` @ 07880ca 40 failed / 36 passed — identical titles, zero
  branch-only failures, cmn-057 spec 5/5. (Earlier runs on :5173 were poisoned by a foreign dev
  server — FUCKUPS.md 2026-09-17.)
