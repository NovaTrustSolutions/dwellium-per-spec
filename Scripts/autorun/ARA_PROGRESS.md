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


## 2026-05-29 02:04 EDT — Iteration 3 — Cycle 3 (ARA LINKAGE) ✅

**Did:** Wired ARAConsole into the cross-widget buses, closing gaps **A2** + **A3**.

- **A2 (ARA → widgets).** New `src/components/ARAConsole/araLinkage.ts` with
  `detectWidgetHandoffs(replyText)` — word-boundary keyword scan over a tight catalog
  (inbox / file-manager / doc-viewer / scribe / stella-agent), deduped by widgetId,
  catalog-ordered, capped at `MAX_HANDOFFS=3`, empty-safe. ARAConsole computes
  `suggestedHandoffs` (useMemo over the latest assistant message) and renders an
  `Open: <widget>` chip row in the Conversation Actions panel; clicking calls
  `openWidgetHandoff` → reuses `workspaceScribe.dispatchOpenWidget` to fire the shared
  `dwellium:open-widget` bus (NO new plumbing, per D2). **Inbox handoff targets the
  LIVE `inbox` id, NOT the @deprecated `inbox-zero`** (verified in widgetRegistry.ts).
- **A3 (ARA ← selection).** ARAConsole now listens for `scribe:send-to-ara` (previously
  only the Scribe-embedded AraMiniPanel did). `composeAraPrompt(detail)` mirrors
  AraMiniPanel's exact contract (preface + blockquoted text), then `sendPrompt(composed)`.
- CSS: minimal `.ara-handoff-row/-label/-btn` matching existing `.ara-action-btn` styling.
- Tests: `src/test/ARAConsole.linkage.test.ts` — 12 unit tests (keyword detection,
  dedupe, cap, word-boundary no-false-positive, empty-safe; injected-dep + default-bus
  dispatch; composeAraPrompt blockquote / bare / null). Mirrors Workspace.scribe.test.ts.

**Proof (FULL gate, 6/6 green):**
- `npx tsc -b` ✓ (exit 0, no output)
- `npx vitest run` → **48 files / 362 passed** (+12 vs 350 at Cycle 2; ARAConsole.linkage 12/12)
- `npx react-router build` ✓ (build/client emitted)
- `VITE_APPFOLIO_SEEDS=false npx react-router build` ✓
- `node Scripts/verify_no_pii_leak.mjs` ✓ (51 files, 0 leaks)
- `SMOKE_TEST_PORT=3458 … smoke_test_ssr_phase8.mjs` → **✓ PASS** (0 errors/warnings/page-errors; status 200)
- Commit: `0fec701`

**Next:** Cycle 4 — Stella correctness (PROTECTED, fix-only). Review connection-status
handling, LLM-ready offline path (`hasActiveLlm`), failed `/api/stella` resilience (gap
S1). Extend `StellaAgent.test.tsx`. NO restyle/restructure. FULL gate.


## 2026-05-29 02:09 EDT — Iteration 4 — Cycle 4 (STELLA CORRECTNESS, fix-only) ✅

**Did:** Closed gap **S1** (connection-status / failed-`/api/stella` resilience) — fix-only,
PROTECTED widget, NO redesign/restyle.

- **`degraded` was a dead state.** `ConnectionStatus` type + `.stella__status-dot--degraded`
  CSS both existed, but `checkStatus` never set it (collapsed a backend-reported
  `degraded` → `offline`) and the status-bar label rendered "Offline" for it.
  `checkStatus` now maps `d.status === 'degraded'` → `'degraded'`, and the label
  reads "Degraded".
- **`resp.ok` guard.** `checkStatus` parsed `/status` JSON without checking `resp.ok`;
  a 5xx with a parseable `{success:true}` body could be trusted as online. Added an
  early `if (!resp.ok) { setStatus('offline'); return; }`.
- **`degraded` is chat-reachable.** New module-level `isBackendReachable(s)` = online||degraded.
  Wired into the `sendMessage` send-gate, the LLM-error fall-through, the chat input/send
  `disabled`, and the placeholder so a degraded (reachable) agent isn't hard-blocked.
- **Additive soft degraded banner** mirroring the existing LLM-fallback banner styling
  (inline rgba like the sister banner — additive UI, not a restyle).
- **Tests +3** in `StellaAgent.test.tsx`: degraded distinct-from-offline + input stays
  enabled; non-2xx `/status` → offline (resp.ok guard); backend chat-call failure surfaces
  the system error message.

**Proof (FULL gate, 6/6 green):**
- `npx tsc -b` ✓ (exit 0)
- `npx vitest run` → **48 files / 365 passed** (+3 vs 362 at Cycle 3)
- `npx react-router build` ✓ (BUILD1_OK)
- `VITE_APPFOLIO_SEEDS=false npx react-router build` ✓ (BUILD2_OK)
- `node Scripts/verify_no_pii_leak.mjs` ✓ (51 files, 0 leaks)
- `SMOKE_TEST_PORT=3458 … smoke_test_ssr_phase8.mjs` → **✓ PASS** (0 errors/warnings/page-errors; 200)
- Commit: `2ba81c3`

**Next:** Cycle 5 — Stella linkage (fix-only, gap **S2**). Additive `dwellium:open-widget`
handoff when Stella references another widget (Inbox / ARA / Files / DocViewer), reusing
the existing bus + `araLinkage`-style detector. NO cosmetic/structural change. Add a
linkage test. FULL gate.

## 2026-05-29 02:15 EDT — Iteration 5 — Cycle 5 (STELLA LINKAGE, fix-only/additive) ✅

**Did:** Closed gap **S2** — additive `dwellium:open-widget` handoff when Stella references
another widget. PROTECTED widget: strictly additive, NO restyle/restructure.

- **NEW `src/components/StellaAgent/stellaLinkage.ts`** — pure, injectable detector +
  dispatcher mirroring ARA's Cycle-3 `araLinkage.ts` exactly. `detectWidgetHandoffs(reply)`
  scans for widget keywords (word-boundary, deduped, capped at 3); `openWidgetHandoff`
  fires the existing `dwellium:open-widget` bus via `workspaceScribe.dispatchOpenWidget`
  (no new plumbing). Catalog: inbox / file-manager / doc-viewer / scribe / **ara-console**
  (sibling assistant, NOT self `stella-agent`). Targets LIVE `inbox`, never deprecated
  `inbox-zero`.
- **StellaAgent.tsx** — additive only: import + `useMemo` of last assistant reply →
  `suggestedHandoffs`, `handleHandoffClick`, and an "Open:" `stella__handoff-row` rendered
  above the existing input area. No existing markup changed.
- **StellaAgent.css** — additive `.stella__handoff-row/-label/-btn` mirroring ARA's
  `.ara-handoff-row` (acid-lime chip styling consistent with `.stella__diagnose-cta`).
- **Tests +9** in NEW `src/test/StellaLinkage.test.ts` (mirrors ARAConsole.linkage.test.ts):
  inbox detect, live-vs-deprecated id, ARA-sibling handoff, multi/cap/dedupe/word-boundary,
  empty-safe, injected-dep dispatch, default `dwellium:open-widget` bus dispatch.

**Proof (FULL gate, 6/6 green):**
- `npx tsc -b` ✓ (TSC_OK)
- `npx vitest run` → **49 files / 374 passed** (+9 vs 365 at Cycle 4)
- `npx react-router build` ✓ (BUILD1_OK)
- `VITE_APPFOLIO_SEEDS=false npx react-router build` ✓ (BUILD2_OK)
- `node Scripts/verify_no_pii_leak.mjs` ✓ (51 files, 0 leaks)
- `SMOKE_TEST_PORT=3458 … smoke_test_ssr_phase8.mjs` → **✓ PASS** (0 errors/warnings/page-errors; 200)
- Commit: `0701d91`

**Next:** Cycle 6 — Inbox Zero correctness (~15 files). Fix most-impactful real issues
(loading/empty/error states, broken tabs, `useInboxQueries` failure handling). Add NEW
`src/test/InboxZero.test.tsx` covering main view + one failure path. FULL gate.
