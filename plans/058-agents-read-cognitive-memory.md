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
