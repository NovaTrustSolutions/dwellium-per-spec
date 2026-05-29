# ARA_PROGRESS.md — ARA / Stella / Inbox Zero linkage arc

Branch: `feat/ara-stella-inbox-linkage` (off `feat/workspace-widget` @ `15a2c4b`).
vitest baseline at branch base: **348 passed / 0 failed / 47 files**.

Cycle ledger (✅ done / ▶ in progress / ◻ todo):
- ✅ Cycle 1 — Linkage audit (docs-only) → `LINKAGE.md`
- ◻ Cycle 2 — ARA correctness + test hardening
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
