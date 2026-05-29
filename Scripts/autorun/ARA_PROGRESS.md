# ARA_PROGRESS.md — ARA / Stella / Inbox Zero linkage arc

Branch: `feat/ara-stella-inbox-linkage` (off `feat/workspace-widget` @ `15a2c4b`).
vitest baseline at branch base: **348 passed / 0 failed / 47 files**.

Cycle ledger (✅ done / ▶ in progress / ◻ todo):
- ✅ Cycle 1 — Linkage audit (docs-only) → `LINKAGE.md`
- ✅ Cycle 2 — ARA correctness + test hardening
- ◻ Cycle 3 — ARA linkage
- ◻ Cycle 4 — Stella correctness (protected, fix-only)
- ◻ Cycle 5 — Stella linkage (fix-only)
- ◻ Cycle 6 — Inbox Zero correctness + first test
- ◻ Cycle 7 — Inbox Zero linkage
- ◻ Cycle 8 — Cross-feature linkage verification + LINKAGE.md finalize
- ◻ Cycle 9 — a11y + polish (ARA + InboxZero; Stella fix-only)
- ◻ Cycle 10 — Closure

---

## 2026-05-29 01:51 EDT — Iteration 1 — Cycle 1 (LINKAGE AUDIT) ✅

**Did:** Created branch `feat/ara-stella-inbox-linkage` off `feat/workspace-widget` (`15a2c4b`). Created `ARA_PROGRESS.md` + `ARA_DECISIONS.md`. Audited cross-widget linkage by grepping all `CustomEvent`/`dispatchEvent`/`addEventListener`/`EventSource`/`/api/` across `src/` and reading the linkage surfaces of ARAConsole, StellaAgent, InboxZero (+ tabs), AraMiniPanel, SmartActions. Produced `Scripts/autorun/LINKAGE.md`: full bus inventory + per-feature matrix + 8-item consolidated gap backlog (A1–A3, S1–S2, I1–I3).

**Key findings:**
- ARAConsole (full widget) participates in **zero** cross-widget buses; only the Scribe-embedded AraMiniPanel receives `scribe:send-to-ara`. ARAConsole chat lacks the LLM-ready offline path Stella has.
- Stella already on the NEW `dwellium:open-widget` bus (Settings only) + has `callLlm`/`hasActiveLlm` offline path; consumes inbox/files via direct fetch.
- InboxZero well-wired inbound (SSE + focus-item + toast) but never hands off outbound (SmartActions → open widget / open assistant missing). No InboxZero test exists yet.

**Proof (docs-only cycle → git status check, no full gate per arc rules):**
- Branch confirmed: `git rev-parse --abbrev-ref HEAD` → `feat/ara-stella-inbox-linkage`.
- Grep evidence captured inline this iteration (bus inventory verified against `WindowContext.tsx:447/457`, `Desktop.tsx:590`, `AraMiniPanel.tsx:99`, `InboxZero.tsx:332/377`, `StellaAgent.tsx:1416`, `workspaceScribe.ts:60`).
- New files only under `Scripts/autorun/` (outside parity-gate paths filter) → no source touched → no tsc/vitest/build needed this cycle.

**Next:** Cycle 2 — ARA correctness. Fix ARAConsole error/empty/loading + failed-fetch + integrations-not-configured paths; evaluate A1 (LLM-ready offline chat path); extend `ARAConsole.test.tsx` with happy + one failure path. FULL gate.

## 2026-05-29 01:58 EDT — Iteration 2 — Cycle 2 (ARA CORRECTNESS) ✅

**Did:** Closed gap **A1** — ARAConsole chat now has an LLM-ready offline path.
In `sendPrompt`'s catch block, when the backend `/api/ara/chat` call fails AND the
user has an active per-user LLM (`hasActiveLlm(integrations.llm)`), ARA falls back to
`callLlm(...)` and shows the reply + a success status ("Backend offline — answered via
your <provider> key."). Backend is tried FIRST (preserves ARA's deep context: modes,
entity guardian, observability, ruVector) — the ARA-correct inversion of Stella's
LLM-first ordering, per the LINKAGE note that ARA's backend context shouldn't be
dropped by naive wiring. Imported `callLlm`/`hasActiveLlm` from `lib/llmClient`; added
`integrations.llm` to the `sendPrompt` deps.

Test hardening: `ARAConsole.test.tsx` 3 → 5 tests. Added module mock for
`../lib/llmClient` (mutable `llmActive` + `callLlmMock`, defaulting to no-LLM so the
existing 3 tests are unaffected) and a `chatShouldThrow` switch on the `/chat` mock.
New tests: (1) backend fails + no LLM → "Last request failed:" banner + `[Error]`
message, `callLlm` NOT called; (2) backend fails + LLM active → "Offline LLM reply."
shown + "answered via your" status + no error banner, `callLlm` called once.

**Proof (FULL gate, 6/6 green; log Scripts/autorun/logs/ara_gate_*.log):**
- `npx tsc -b` ✓ (no output / exit 0)
- `npx vitest run` → **47 files / 350 passed** (+2 vs 348 baseline; ARAConsole 5/5)
- `npx react-router build` ✓ (3373 modules; build/client emitted)
- `VITE_APPFOLIO_SEEDS=false npx react-router build` ✓
- `node Scripts/verify_no_pii_leak.mjs` ✓ (chained && reached smoke)
- `SMOKE_TEST_PORT=3458 ... smoke_test_ssr_phase8.mjs` → **✓ PASS** (0 console errors / 0 warnings / 0 page errors; status 200)
- Commit: `51b01bb`

**Next:** Cycle 3 — ARA linkage. Wire gaps **A2** (ARAConsole emits `dwellium:open-widget`
for "open in Inbox/Files/DocViewer" handoffs) + **A3** (ARAConsole receives a
selection/context payload). Mirror `workspaceScribe.ts` injectable-deps pattern; add a
linkage unit test. FULL gate.

