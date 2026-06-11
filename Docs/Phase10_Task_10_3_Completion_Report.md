# Phase-10 Task 10.3 — A2: Hermes Quick-Chat Hints in ARA + 👍/👎 Voting

**Date:** 2026-06-11

## What shipped

1. **`src/components/ARAConsole/araHermes.ts` (NEW).** ARA quick-chat layer over the ONE per-user Hermes log — separation by tag, not by store: chat runs are recorded with `toolsUsed: ['ara-chat']`; ARA few-shot ranks ONLY over ara-chat-tagged runs (lab batches never bleed into chat hints, Honcho/Hermes panel still sees everything). K pinned at 3 (risk-register low end). **Quality fix surfaced by tests:** the store's `rankPastRuns` taskType-boost (0.15) admits zero-similarity runs; `relevantAraRuns` additionally requires positive token similarity — fine for tool-routing, noise for chat hints.
2. **ARAConsole `sendPrompt`.** Per-user holder set, then hints injected on BOTH answer paths: backend → bracketed context block appended to the outgoing message (humanize-prefix precedent; `/api/ara/chat` has no system-prompt field); LLM offline-fallback → appended to `systemPrompt` (cleaner; user prompt left bare). Successful answers from either path are recorded via `recordAraChat` and carry `hermesRunId` on the message.
3. **👍/👎 voting.** `ChatMessage.hermesRunId` + vote chips in the assistant message header (sister styling to `.ara-speak-btn`, hover-reveal, focus-visible outline, aria-labels). 👍 = `rateRun(+1)` → ranking boost; 👎 = `rateRun(−1)` → **excluded** from future ARA hints entirely (strongest no-training "don't do that again" signal).
4. **`src/test/araHermes.test.ts` (NEW).** 7 tests: tagging, lab-run separation, 👎 exclusion, 👍 boost-overcomes-recency-tiebreak, formatter, K-cap, no-similarity-empty. Store `.reset()` per v2.72.1.

## Verification

| Stage | Result |
|---|---|
| `tsc -b` | exit 0 |
| vitest full (Mac) | **132 files / 1123 tests PASS** (+7) |
| builds seeds=true/false | OK / OK |
| PII | 51 files, 0 leaks |
| SSR smoke (`SMOKE_TEST_PORT=3210`) | **PASS** — 200/6049 B, 0 errors/warnings |

## Honest scope notes

- Hint injection live behavior (does the backend tolerate the bracketed block gracefully; do hints actually improve answers) is NOT yet verified end-to-end — same live-session check as 10.2's spawn run.
- Votes persist on the Hermes record (One Save-synced); the chip's *visual* voted-state is session-local (`useState`) — re-opening ARA shows unvoted chips even though the rating persisted. Cosmetic; noted for polish.
- Backend `/api/ara/chat` ignores the context block semantics (it's just message text to it) — a dedicated `hints` field is a backend-route change, listed for the ARA per-user-key passthrough backend session (carry-forward).

**Vitest delta:** +7 (1116 → 1123). **Files:** 1 new + 2 modified production (ARAConsole.tsx + .css), 1 new test.
