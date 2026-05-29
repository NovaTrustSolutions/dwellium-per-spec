# LINKAGE.md — ARA / Stella / Inbox Zero cross-widget linkage audit

**Branch:** `feat/ara-stella-inbox-linkage` (off `feat/workspace-widget` @ `15a2c4b`)
**Cycle 1 produced this** — 2026-05-29. Read by Cycles 2–8 as the gap backlog; finalized in Cycle 8.

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
| ARAConsole chat → per-user LLM (`callLlm`/`hasActiveLlm`) | — | ❌ missing-but-expected | unlike Stella, ARAConsole chat has **no LLM-ready offline path**; backend-only. Candidate Cycle 2. |
| AraMiniPanel ← `scribe:send-to-ara` (selection → ARA) | `addEventListener` | ✅ present | only the **mini panel** receives selections, not the console |
| ARAConsole ← `scribe:send-to-ara` | — | ⚠️ partial | console is blind to Scribe selections; mini panel covers the case but the full widget cannot receive a selection handoff |
| ARAConsole → `dwellium:open-widget` ("open in <widget>") | — | ❌ missing-but-expected | ARA can answer about inbox/files/docs but cannot **open** them. Cycle 3 target. |
| ARAConsole ← `dwellium:open-widget` / context (hierarchy/active selection) | — | ❌ missing-but-expected | ARA receives no active-domaine/selection context. Cycle 3 target. |
| ARAConsole → `qualia-toast` (user feedback) | — | ⚠️ partial | uses inline `actionStatus` banner instead of global toast; acceptable, note only |

**ARA gaps for later cycles:** (A1) LLM-ready offline chat path in ARAConsole [Cycle 2 correctness]; (A2) ARAConsole emits `dwellium:open-widget` for "open in Inbox/Files/DocViewer" handoffs [Cycle 3]; (A3) ARAConsole receives a `scribe:send-to-ara` / context payload so the full widget can act on a selection [Cycle 3].

---

## 2. Stella — linkage matrix  🔒 PROTECTED (fix-only, no redesign)

| Link | Mechanism | State | Note |
|---|---|---|---|
| Stella → backend `/api/stella` (chat/status/skills/memory/cron/mcp) | direct fetch | ✅ present | core |
| Stella → `/api/v1/telegram`, `/api/honcho`, `/api/hermes` | direct fetch | ✅ present | telegram + memory + delegation |
| Stella chat → per-user LLM | `callLlm` + `hasActiveLlm` (L498 relaxed `status !== 'online'` gate) | ✅ present | LLM-ready offline path already works |
| Stella ← inbox context | direct `/api/v1/inbox?limit=3` fetch (L1104) | ✅ present | consumes inbox via fetch, not bus — acceptable |
| Stella ← files context | direct `/api/files` fetch | ✅ present | |
| Stella → `dwellium:open-widget` (control-panel/Settings) | `dispatchEvent` (L1416) | ✅ present | already on the NEW bus |
| Stella → `dwellium:open-widget` (open Inbox / ARA / Files when referenced) | — | ⚠️ partial | only opens Settings; could hand off to the widgets it talks about. **Fix-only candidate, Cycle 5** (additive event dispatch, no restyle) |
| Stella → `qualia-toast` | — | ⚠️ partial | inline status only; acceptable |

**Stella gaps (fix-only):** (S1) connection-status / failed-`/api/stella` resilience review [Cycle 4]; (S2) additive `dwellium:open-widget` handoff when Stella references another widget [Cycle 5] — strictly additive, no cosmetic/structural change.

---

## 3. Inbox Zero — linkage matrix

| Link | Mechanism | State | Note |
|---|---|---|---|
| InboxZero ← backend `/api/inbox/*`, `/api/settings`, `/api/auth/*` | `useInboxQueries` + authFetch | ✅ present | |
| InboxZero ← SSE `inbox:new` / `inbox:status-change` | EventSource `/stream` (L330) | ✅ present | real-time cache invalidation (GAP-01 already done) |
| InboxZero ← `qualia-inbox-focus-item` | `addEventListener` (L377) | ✅ present | CommandPalette emits → focus item |
| InboxZero → `qualia-toast` | `dispatchEvent` (multiple) | ✅ present | |
| InboxZero / SmartActions → `dwellium:open-widget` (open relevant widget on action) | — | ❌ missing-but-expected | SmartActions (`SmartActions.tsx`) only calls `/api/inbox/actions`; no widget handoff. Cycle 7 target. |
| InboxZero → ARA / Stella ("draft reply with ARA/Stella") | — | ❌ missing-but-expected | no handoff to the two assistants. Cycle 7 target (open assistant via bus). |
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

**No test for InboxZero yet** — add `src/test/InboxZero.test.tsx` in Cycle 6.

> States legend: ✅ present · ⚠️ partial (works but incomplete/indirect) · ❌ missing-but-expected.
> This matrix is re-verified and every intended link flipped to ✅ (or marked blocked-with-reason) in **Cycle 8**.
