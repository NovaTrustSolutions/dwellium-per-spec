# LINKAGE.md — ARA / Stella / Inbox Zero cross-widget linkage audit

**Branch:** `feat/ara-stella-inbox-linkage` (off `feat/workspace-widget` @ `15a2c4b`)
**Cycle 1 produced this** — 2026-05-29. Read by Cycles 2–8 as the gap backlog. **🎯 FINALIZED in Cycle 8 (2026-05-29):** all 8 gaps (A1–A3, S1–S2, I1–I3) RESOLVED and re-verified against live source; the one intentionally-unreachable handoff (calendar) is marked 🚫 blocked-with-reason. See §5.

---

## 0. Cross-widget bus inventory (ground truth, verified by grep)

| Bus / event name | Listener (sink) | Emitters (sources) | Helper |
|---|---|---|---|
| `dwellium:open-widget` (NEW intent bus) | `WindowContext.tsx:457` → opens widget by `{widgetId,label?,icon?}` | `Workspace/workspaceScribe.ts:60`, `StellaAgent.tsx:1416` (control-panel/Settings) | `workspaceScribe.ts::dispatchOpenWidget` |
| `qualia-open-widget` (OLDER bus) | `Desktop.tsx:590` → open widget by component-id string | `AdminShell.tsx:133` (two-brains) | — |
| `scribe:send-to-ara` | `Scribe/AraMiniPanel.tsx:99` (Scribe-embedded ARA, **not** ARAConsole) | `Scribe/SelectionToolbar.tsx:50` | — |
| `qualia-inbox-focus-item` | `InboxZero.tsx:377` | `CommandPalette.tsx:859` (deferred) | — |
| `qualia-taskmenu-focus-task` | `TaskMenu.tsx:98` | `CommandPalette.tsx:851` | — |
| `qualia-notepad-open-note` | `Notepad.tsx:256` | `CommandPalette.tsx:879` | — |
| `qualia-docviewer-open-file` | `DocViewer.tsx:309` | `Desktop.tsx:154`, `FileManager.tsx:175` | — |
| `qualia-toast` | `Desktop.tsx:570` (global toast) | many (InboxZero, GlobalAuditTab, TranscriptionHub, FactCheckLog, WindowContext, AdminShell, …) | — |
| `strata:navigate` | StrataDashboard modules | `ComplianceEngine.tsx:783` | — |
| `qualia-skin-change` | `AdminShell.tsx:62` | `Desktop.tsx:1040` | — |
| SSE `inbox:new` / `inbox:status-change` | `InboxZero.tsx:332/336` (EventSource `/stream`) | backend push | — |

> **Linkage rule for this arc:** prefer the **NEW `dwellium:open-widget` bus** via `dispatchOpenWidget` for any "open in <widget>" handoff (mirror the workspaceScribe injectable-deps pattern so it stays unit-testable). Do not invent new plumbing.

---

## 1. ARA — linkage matrix

ARA has **two** surfaces: the full **ARAConsole** widget (`ARAConsole.tsx`, 2029 L) and the Scribe-embedded **AraMiniPanel** (`Scribe/AraMiniPanel.tsx`). They are wired differently.

| Link (feeds → / ← receives) | Mechanism | State | Note |
|---|---|---|---|
| ARAConsole → backend `/api/ara`, `/api/transcribe` | direct fetch | ✅ present | core chat/voice/observability |
| ARAConsole → OpenAI TTS (per-user key) | `integrations.llm.openai.apiKey` | ✅ present | TTS only |
| ARAConsole chat → per-user LLM (`callLlm`/`hasActiveLlm`) | `ARAConsole.tsx:975` LLM-ready offline path | ✅ **RESOLVED — A1, `51b01bb` (Cycle 2)** | offline fallback now mirrors Stella; covered by `ARAConsole.test.tsx` happy + failure path |
| AraMiniPanel ← `scribe:send-to-ara` (selection → ARA) | `addEventListener` | ✅ present | only the **mini panel** receives selections, not the console |
| ARAConsole ← `scribe:send-to-ara` | `ARAConsole.tsx:1057` `addEventListener` | ✅ **RESOLVED — A3, `0fec701` (Cycle 3)** | full console now also receives Scribe-selection handoffs; `composeAraPrompt` reuses AraMiniPanel's exact contract |
| ARAConsole → `dwellium:open-widget` ("open in <widget>") | `araLinkage.ts` → `openWidgetHandoff` (`ARAConsole.tsx:1074`) | ✅ **RESOLVED — A2, `0fec701` (Cycle 3)** | keyword-scan of latest reply surfaces ≤3 "open in" chips; covered by `ARAConsole.linkage.test.ts` (12 tests) |
| ARAConsole ← context (hierarchy/active selection) | selection handoff via A3 | ✅ **RESOLVED via A3** | selection context now reaches the console; an ambient hierarchy/active-domain context bus does not exist in the app (§0), so nothing further to wire |
| ARAConsole → `qualia-toast` (user feedback) | inline `actionStatus` banner | ⚠️ accepted (note only) | inline banner is the established ARA pattern; not a gap |

**ARA gaps — ALL RESOLVED:** (A1) LLM-ready offline chat path `51b01bb`; (A2) `dwellium:open-widget` "open in" handoffs `0fec701`; (A3) `scribe:send-to-ara` selection handoff `0fec701`.

---

## 2. Stella — linkage matrix  🔒 PROTECTED (fix-only, no redesign)

| Link | Mechanism | State | Note |
|---|---|---|---|
| Stella → backend `/api/stella` (chat/status/skills/memory/cron/mcp) | direct fetch | ✅ present | core |
| Stella → `/api/v1/telegram`, `/api/honcho`, `/api/hermes` | direct fetch | ✅ present | telegram + memory + delegation |
| Stella chat → per-user LLM | `callLlm` + `hasActiveLlm` (L498 relaxed `status !== 'online'` gate) | ✅ present | LLM-ready offline path already works |
| Stella ← inbox context | direct `/api/v1/inbox?limit=3` fetch (L1104) | ✅ present | consumes inbox via fetch, not bus — acceptable |
| Stella ← files context | direct `/api/files` fetch | ✅ present | |
| Stella → `dwellium:open-widget` (control-panel/Settings) | `dispatchEvent` (`StellaAgent.tsx:1459`) | ✅ present | already on the NEW bus |
| Stella → `dwellium:open-widget` (open Inbox / ARA / Files when referenced) | `stellaLinkage.ts` → `openWidgetHandoff` (`StellaAgent.tsx:691`) | ✅ **RESOLVED — S2, `0701d91` (Cycle 5)** | strictly additive handoff chips when Stella references another widget; covered by `StellaLinkage.test.ts`. No restyle/restructure (protection boundary honoured) |
| Stella connection-status / failed-`/api/stella` resilience | `isBackendReachable(status)` guards + `/status` `resp.ok` guard | ✅ **RESOLVED — S1, `2ba81c3` (Cycle 4)** | degraded backend state surfaced; LLM-ready offline path preserved. `StellaAgent.test.tsx` extended (fix-only) |
| Stella → `qualia-toast` | inline status banner | ⚠️ accepted (note only) | inline status is Stella's established pattern; not a gap |

**Stella gaps (fix-only) — ALL RESOLVED:** (S1) connection-status / `/api/stella` resilience `2ba81c3`; (S2) additive `dwellium:open-widget` handoff `0701d91`. Both strictly additive — no cosmetic/structural redesign (protection boundary D4 honoured).

---

## 3. Inbox Zero — linkage matrix

| Link | Mechanism | State | Note |
|---|---|---|---|
| InboxZero ← backend `/api/inbox/*`, `/api/settings`, `/api/auth/*` | `useInboxQueries` + authFetch | ✅ present | |
| InboxZero ← SSE `inbox:new` / `inbox:status-change` | EventSource `/stream` (L330) | ✅ present | real-time cache invalidation (GAP-01 already done) |
| InboxZero ← `qualia-inbox-focus-item` | `addEventListener` (L377) | ✅ present | CommandPalette emits → focus item |
| InboxZero → `qualia-toast` | `dispatchEvent` (multiple) | ✅ present | |
| InboxZero / SmartActions → `dwellium:open-widget` (open relevant widget on action) | `inboxLinkage.openWidgetHandoff` (SmartActions draft "Open in:" row) | ✅ present | **Cycle 7 (I2):** after AI Auto-Draft, SmartActions renders Scribe/ARA/Stella chips firing `dwellium:open-widget`. |
| InboxZero → ARA / Stella ("draft reply with ARA/Stella") | `inboxLinkage.getDraftHandoffs` | ✅ present | **Cycle 7 (I3):** draft hands off to `ara-console` + `stella-agent` via the same row. |
| SmartActions "Extract Events" → calendar widget | — | 🚫 blocked | no calendar widget exists in `widgetRegistry.ts` (verified Cycle 7); cannot hand off. Re-open if a calendar widget is added. |
| GlobalAuditTab → `qualia-toast` (recover/audit feedback) | `dispatchEvent` | ✅ present | |

**InboxZero gaps for later cycles:** (I1) loading/empty/error + `useInboxQueries` failure handling review [Cycle 6 correctness]; (I2) SmartActions → `dwellium:open-widget` handoff [Cycle 7]; (I3) InboxZero → open ARA/Stella assistant handoff [Cycle 7].

---

## 4. Consolidated gap backlog (drives Cycles 2–7)

| ID | Feature | Gap | Target cycle | Type |
|---|---|---|---|---|
| A1 | ARA | ARAConsole chat has no LLM-ready offline path (`callLlm`/`hasActiveLlm`) | 2 | correctness |
| A2 | ARA | ARAConsole cannot emit `dwellium:open-widget` ("open in Inbox/Files/Docs") | 3 | linkage |
| A3 | ARA | ARAConsole cannot receive a selection/context handoff (only AraMiniPanel does) | 3 | linkage |
| S1 | Stella | connection-status / failed-`/api/stella` resilience review (fix-only) | 4 | correctness |
| S2 | Stella | additive open-widget handoff to referenced widgets (fix-only, no restyle) | 5 | linkage |
| I1 | InboxZero | loading/empty/error + `useInboxQueries` failure handling | 6 | correctness |
| I2 | InboxZero | SmartActions → `dwellium:open-widget` handoff | 7 | linkage |
| I3 | InboxZero | InboxZero → open ARA/Stella assistant handoff | 7 | linkage |

**InboxZero test** — added `src/test/InboxZero.test.tsx` (main view + failure path) in Cycle 6; `src/test/InboxLinkage.test.ts` (6 tests) in Cycle 7.

---

## 5. Cycle 8 — final cross-feature verification

Re-ran the audit against live source (grep + file read, 2026-05-29). **Every intended link is ✅ and backed by a commit + test, or 🚫 blocked-with-reason.** No ❌/⚠️-gap rows remain.

| Gap | Feature | Resolved by | Source anchor | Test |
|---|---|---|---|---|
| A1 | ARA | `51b01bb` (Cycle 2) | `ARAConsole.tsx:975` `hasActiveLlm` offline path | `ARAConsole.test.tsx` |
| A2 | ARA | `0fec701` (Cycle 3) | `ARAConsole.tsx:1074` `openWidgetHandoff` + `araLinkage.ts` | `ARAConsole.linkage.test.ts` |
| A3 | ARA | `0fec701` (Cycle 3) | `ARAConsole.tsx:1057` `scribe:send-to-ara` listener | `ARAConsole.linkage.test.ts` |
| S1 | Stella | `2ba81c3` (Cycle 4) | `StellaAgent.tsx` `isBackendReachable` + `/status` `resp.ok` guards | `StellaAgent.test.tsx` |
| S2 | Stella | `0701d91` (Cycle 5) | `StellaAgent.tsx:691` `openWidgetHandoff` + `stellaLinkage.ts` | `StellaLinkage.test.ts` |
| I1 | InboxZero | `5d9177d` (Cycle 6) | `InboxZero` error-state on failed fetch + `useInboxQueries` hardening | `InboxZero.test.tsx` |
| I2 | InboxZero | `01e8283` (Cycle 7) | `SmartActions.tsx:503/507` `getDraftHandoffs` + `openWidgetHandoff` | `InboxLinkage.test.ts` |
| I3 | InboxZero | `01e8283` (Cycle 7) | `inboxLinkage.ts` draft → `ara-console` + `stella-agent` | `InboxLinkage.test.ts` |

**Shared-bus convergence (verified):** ARA, Stella, and InboxZero now all emit "open in <widget>" handoffs through the **single** `dwellium:open-widget` intent bus via `workspaceScribe.dispatchOpenWidget` (`WindowContext.tsx:457` is the sole sink). No feature invented new plumbing — D2 honoured. Each linkage module (`araLinkage.ts` / `stellaLinkage.ts` / `inboxLinkage.ts`) is pure + injectable-deps and unit-tested independently of React.

**Cannot-complete (blocked-with-reason):**
- **SmartActions "Extract Events" → calendar widget** — 🚫 no calendar widget exists in `widgetRegistry.ts` (grep-verified Cycle 7). This is a missing-widget gap, not a linkage gap; re-open if a calendar widget is ever added. No sibling-backend dependency.

**Accepted-as-is (not gaps):** ARA + Stella user-feedback via inline status banners rather than `qualia-toast` (established per-widget pattern); Stella consuming inbox/files context via direct fetch rather than a bus (acceptable — read-only context pull).

> States legend: ✅ present/resolved · ⚠️ accepted (works, intentional pattern) · 🚫 blocked-with-reason · ❌ missing-but-expected (none remain).
> **Matrix finalized Cycle 8.** Closure ledger lands in `Scripts/autorun/ARA_CLOSURE.md` (Cycle 10).
