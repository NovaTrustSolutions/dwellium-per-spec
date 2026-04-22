# Dwellium Shell — Gap Analysis vs. Phase 3-H Engineer Handoff

**Source of truth:** `~/Documents/Andy/AstraStrata Review/Reports/Phase3H_Engineer_Handoff.docx` (`[CT-3H-HANDOFF-M4Q7]`, FINAL, 2026-04-16)
**Current state:** `~/Downloads/Dwellium -Per Spec/qualia-shell/` (git: `feat/f1-universal-shell-and-wip`)
**Analysis date:** 2026-04-19
**Scope:** Only 3H engineering-actionable items. Non-engineering Phase-3 artifacts (3B/3C/3D/3G spreadsheets, quality scoring, PB8/PB9 data-scrub gaps) are out of scope for this build gap analysis.

---

## 1. Executive Summary

The current `qualia-shell` repo contains a working production build with the **F-1 Universal Shell scaffold implemented**, but **two of the three ratified P0 decisions (C-1 and C-9) are not yet realized in code**. The repo is ahead of handoff on widget breadth (26 registered widgets, 33 Strata modules, 5 Astra tabs operational) and behind on the Background Engine migration (Inbox Zero removal) and the Hybrid Boards/B.L.A.S.T.-gated renderer.

| Ratified decision | Build status | Severity |
|---|---|---|
| F-1 Universal Shell | Scaffold complete; adapter coverage partial (3/~14 containers) | MEDIUM — expansion work, not missing feature |
| C-1 Background Engine | **Not implemented** — Inbox Zero frontend still registered; routing rules engine not extracted | HIGH — contradicts ratified decision |
| C-9 Hybrid Boards + B.L.A.S.T. gate | **Not implemented** — TrelloBoard lacks AI card suggestion; B.L.A.S.T. gate only referenced as planning docs | HIGH — contradicts ratified decision |

Of the three Red Team CRITICAL mitigations, **RT-01 is in place** (AdapterBoundary isolates column crashes). **RT-05 and RT-09 are not demonstrable** because the features they guard (C-1 routing, C-9 auto-populate) are not built.

---

## 2. Methodology

1. Extracted the 3H docx to markdown via pandoc (313 lines, all tables preserved).
2. Extracted the ratified-decision table (§3), the Red Team CRITICAL table (§5), the P1/P2 open-decision list (§6.1), and the AppFolio/Trello migration roadmap (§7) as the engineering requirement set.
3. Static-scanned `qualia-shell/src/` for: `widgetRegistry.ts` entries, component directory presence, canary tokens, specific feature keywords (routing rules, AI suggest, B.L.A.S.T.), and `src/components/UniversalShell/` file inventory.
4. Cross-referenced the three internal docs (`README.md`, `Docs/F1_UniversalShell_Schema.md`, `qualia-shell/BUILD.md`, `Docs/Handoff_Parity_Checklist.md`, `Docs/Widget_Audit.md`) against observed state.
5. Classified each 3H requirement as MET / PARTIAL / GAP, with inline source citations to both the 3H docx and the code.

Note on canary tokens: per the 3H author, `CT-3H-HANDOFF-M4Q7` is scoped to review deliverables (the docx), not to Dwellium source files. Internal docs that assert the canary should appear in 9 TSX/TS files are an over-scope by a different session and are listed under **Documentation Drift** in §6 — not as a code gap.

---

## 3. Ratified P0 Decisions — Detailed Gap Matrix

### 3.1 F-1 — Universal Shell (Option C)

**3H requirement (§3 Table row F-1):** Build adapter layer between container data model and 4-column renderer. Each container exposes a standard interface; shell routes to columns.

| Sub-requirement | Current state | Evidence | Gap | Severity |
|---|---|---|---|---|
| 4-column persistent frame | ✅ Implemented | `src/components/UniversalShell/UniversalShell.tsx` (118 LOC), `UniversalShell.css` with `us-*` classes, 4→2→1 responsive grid | None | — |
| Adapter interface (`ContainerAdapter`) | ✅ Implemented | `src/components/UniversalShell/types.ts` defines `ShellColumnId`, `AdapterContext`, `AdapterColumnSpec`, `ContainerAdapter` | None | — |
| Adapter registry | ✅ Implemented | `src/components/UniversalShell/adapterRegistry.ts` with `ADAPTER_REGISTRY`, `adaptersForSurface`, `getAdapter` | None | — |
| Per-column isolation (RT-01 mitigation) | ✅ Implemented | `src/components/UniversalShell/AdapterBoundary.tsx` (62 LOC) — React error boundary per column | None | — |
| Registered in shell | ✅ Implemented | `widgetRegistry.ts:75` (`'universal-shell'`), `hierarchy.ts:20` (`dock-universal-shell`), `iconMap.ts:51` (`'layout-grid'`) | None | — |
| Surface-agnostic landing adapter | ✅ Implemented | `adapters/FilingOverviewAdapter.tsx` (surface: `any`) | None | — |
| Strata proof adapter | ✅ Implemented | `adapters/StrataMaintenanceAdapter.tsx` with `permKey: 'strata:module:maintenance'` | None | — |
| Astra adapter | ✅ Implemented | `adapters/AstraPortfolioAdapter.tsx` (surface: `astra`) | None | — |
| **Remaining container adapters** | ❌ Deferred | F1 Schema §7 explicitly defers migration of remaining Strata modules, Astra workspace/channels/intelligence/observability → adapters | 33 Strata modules + 4 remaining Astra tabs still use `switch(activeModule)` routing instead of ContainerAdapter pattern | MEDIUM — scaffold supports incremental migration; not a breaking gap |
| Retire `switch(activeModule)` router in StrataDashboard.tsx | ❌ Not done | F1 Schema §7 item 2 | Coupled to adapter migration above | LOW — explicit downstream task |

**Verdict:** F-1 is **ARCHITECTURALLY COMPLETE**. Remaining work is adapter-by-adapter migration, which is explicitly scoped to future sessions in F1 Schema §7.

### 3.2 C-1 — Background Engine (Option C) — **HIGH-SEVERITY GAPS**

**3H requirement (§3 Table row C-1):** Remove Inbox Zero frontend. Preserve email ingestion pipeline. Add routing rules engine that classifies emails and pushes to Strata/Legal/HR containers.

| Sub-requirement | Current state | Evidence | Gap | Severity |
|---|---|---|---|---|
| Remove Inbox Zero frontend | ❌ Not done | `widgetRegistry.ts:93-94` still registers `'inbox-zero'` as a launchable widget. `src/components/InboxZero/` contains 15 files including `AnalyticsDashboard.tsx`, `CapabilitiesTab.tsx`, `ColdEmailBlocker.tsx`, `GlobalAuditTab.tsx`, `NewslettersTab.tsx`, `NifIntelligence.tsx`, `OpenTracker.tsx`, `ReplyTracker.tsx`, `RulesManager.tsx`, `SmartActions.tsx`, `StatsTab.tsx`. Widget_Audit.md §5 describes this as new WIP *added* on this branch. | Directly contradicts ratified decision — the frontend grew rather than being removed | HIGH |
| Preserve email ingestion pipeline | ⚠️ Unknown | No explicit "ingestion" service directory located; ingestion may live behind InboxZero. `src/services/` exists but only `sentry.ts` was confirmed. | Ingestion needs to be isolated into a headless service before frontend removal; current coupling unclear | MEDIUM |
| Routing rules engine (classify → route to Strata/Legal/HR) | ❌ Not extracted | Rules UI exists at `src/components/InboxZero/RulesManager.tsx` but is nested inside the InboxZero component tree, not a standalone classifier. `AutomationHub/` exists separately but grep shows no `routingRule`/`routeEmail`/`classifyEmail` identifiers across src/. | No headless routing engine exists; rules are UI-coupled | HIGH |
| RT-05 mitigation (conservative routing, 95% confidence gate, human-review queue) | ❌ Not demonstrable | No classifier exists to gate on; no human-review queue surface in the codebase | Cannot exist until routing engine is built | HIGH — blocks C-1 landing |

**Verdict:** C-1 is **NOT IMPLEMENTED**. The WIP on `feat/f1-universal-shell-and-wip` moved in the opposite direction (11 new InboxZero tabs). Before Phase 3-H can be marked "implemented" this branch must either (a) back out the InboxZero expansion and extract the routing engine, or (b) explicitly re-scope the decision.

### 3.3 C-9 — Hybrid Boards + B.L.A.S.T. Gate (Option C) — **HIGH-SEVERITY GAPS**

**3H requirement (§3 Table row C-9):** Build board renderer with AI card generation. Phase 1 ships manual mode with AI suggest; Phase 2 adds auto-population behind approval gate.

| Sub-requirement | Current state | Evidence | Gap | Severity |
|---|---|---|---|---|
| Board renderer | ✅ Exists | `src/components/TrelloBoard/` registered as `'trello-board'` widget; also `TrelloCardModal.tsx` under StrataDashboard modules | Manual-only Kanban currently — matches Phase 1 precondition | LOW |
| Phase-1 AI card suggestion | ❌ Not implemented | `grep` for `aiSuggest` / `suggestCard` / `cardSuggestion` in `src/components/TrelloBoard/` returned zero matches | No AI-suggestion integration on boards | HIGH — blocks Phase 1 |
| Phase-2 AI auto-populate behind approval gate | ❌ Not implemented | No auto-populate surface exists | Future work; depends on Phase 1 | — (correctly deferred) |
| B.L.A.S.T. approval gate intercepting **card creation** (RT-09) | ❌ Not implemented in code | Only one reference to "blast" in `src/`: `AutomationHub.tsx`. Root-level `blast/` folder contains **planning docs only** (`findings.md`, `gemini.md`, `progress.md`, `task_plan.md`) — no runtime code | Gate must intercept card creation, not just execution (per RT-09). No such interceptor exists. | HIGH |

**Verdict:** C-9 is **NOT IMPLEMENTED**. Existing Kanban (`TrelloBoard`) is the Phase-0 starting point. AI suggestion and B.L.A.S.T. gate are both unbuilt. Planning work in `blast/` is design-only.

---

## 4. Red Team CRITICAL Mitigations (§5)

| Finding | Required mitigation | Status | Evidence |
|---|---|---|---|
| RT-01 Adapter Failure Cascade | Adapter isolation with graceful degradation; failed adapter shows error state in its column; other columns continue operating | ✅ **MET** | `AdapterBoundary.tsx` wraps each column; `us-column-error` CSS state in UniversalShell.css |
| RT-05 Classification Accuracy | Conservative routing (high-confidence only); unclassified emails queue for human review; widen automation threshold only after 95%+ accuracy demonstrated | ❌ **NOT DEMONSTRABLE** | Blocked by C-1 gap — no classifier exists to gate |
| RT-09 B.L.A.S.T. Protocol Boundary | B.L.A.S.T. gate intercepts card **creation**, not just execution (AI proposes → human approves → card appears) | ❌ **NOT IMPLEMENTED** | No interceptor in code; planning docs only in `blast/` |

---

## 5. Roadmap Coverage (§7)

### 5.1 AppFolio Migration (6 areas)

| Area | Target container | Current widget | Status |
|---|---|---|---|
| Leasing/Applications | Leasing Pipeline | `StrataDashboard/modules/LeasingModule.tsx` (1,255 LOC) | Present; depth unverified |
| Maintenance/Work Orders | Strata operations modules | `StrataDashboard/modules/MaintenanceModule.tsx` | Present; depth unverified |
| Accounting/Bill Pay | Bill Pay & Invoice Pipeline + read-only QuickBooks | No `BillPay`/`InvoicePipeline` component directory found in 41-dir scan | **MISSING** |
| Tenant Communications | Profile Pages + AI-drafted notices | `TenantPortal/`, `TenantPortalMgmt/`, `StrataDashboard/modules/TenantPortalModule.tsx` | Present; AI-drafted notices pending E-1 decision |
| Reporting/Analytics | Astra owner dashboard + Knowledge Vault | `AstraDashboard/`, `IntelligenceDashboard.tsx` | Present; Knowledge Vault not separately identified |
| Vendor Management | Strata vendor modules + Bill Pay vendor invoice flow | `StrataDashboard/modules/VendorsModule.tsx` (1,238 LOC) | Present for vendor side; Bill Pay side MISSING |

### 5.2 Trello Cutover (3-Phase)

Phase 1 (manual in Dwellium, AI suggest, Trello parallel) — partially: manual Dwellium board exists, AI suggest missing (see §3.3). Phases 2–3 are explicitly future.

---

## 6. Documentation Drift (Internal Docs vs. Reality)

Flagged per 3H author guidance: the canary-in-source assertion is an over-scope. These internal docs need correction to match the actual compliance schema.

| File | Drift | Recommended fix |
|---|---|---|
| `Docs/F1_UniversalShell_Schema.md` §3 | "Every file contains the canary tokens in its header docblock" — only 2 of 9 UniversalShell files contain `CT-3H-HANDOFF-M4Q7`, only 8 of 9 contain `CT-3E-ARCH-W8K3` | Remove the assertion, OR reframe as a future provenance embedding step marked `[PROPOSED, NOT ENFORCED]` |
| `qualia-shell/BUILD.md` §4 row 5 | Parity check expects `grep -rl "CT-3H-HANDOFF-M4Q7" src/components/UniversalShell/` → 9 files. Actual: 2 files | Remove the row, OR lower the expected value to "docx-only" and grep the Reports/ dir instead |
| `Docs/Handoff_Parity_Checklist.md` Step 7 | Same grep-the-source expectation | Same — remove or reframe |
| `Docs/Widget_Audit.md` §7 | References `src/registry/WIDGET_REGISTRY.ts` (uppercase) | Actual filename is `widgetRegistry.ts` (camelCase). Correct the path |
| Expected "Node ≥25.5.0, npm ≥11.8.0" | `qualia-shell/package.json` matches; confirm target machine | OK — just flag in BUILD runbook |

---

## 7. Items NOT In Scope for This Gap Analysis

Per 3H §6.1, §6.2, §6.3 these are tracked but not engineering-build blockers for Phase 3-H landing:

- 13 P1/P2 open decisions (C-2, C-3, C-6, C-8, D-1, E-1, E-2, E-3, F-3, …) — detailed-design work during implementation
- 6 data-recovery gaps (PB9-1 Mehrdad dispute, PB9-2 59 PDFs, PB9-3 Chamblee Brownfield, D-4, D-5, E-4) — data ingestion, not code
- Quality-audit delta (8.84 vs 9.1 benchmark) — document-quality metric, not code
- The 4 known pre-existing TS errors in `ErrorBoundary.tsx` + `InboxWidget.tsx` — documented in Widget_Audit.md §6; non-runtime

---

## 8. Recommended Remediation Path (Ordered)

1. **Back out or isolate the InboxZero WIP branch before merging.** The 11 new InboxZero tab modules directly contradict C-1. Product decision required: keep and re-scope C-1, or remove and build the routing engine.
2. **Extract the routing rules engine** from `InboxZero/RulesManager.tsx` into a headless service (e.g., `src/services/emailRouter.ts`) with a 95%-confidence gate and a human-review queue surface. Unblocks RT-05.
3. **Add AI card suggestion to TrelloBoard** (Phase-1 of C-9). Minimal: a suggestion panel that calls into an existing agent (HydraAI/StellaAgent) and proposes cards the user can accept/reject.
4. **Implement B.L.A.S.T. creation interceptor** per RT-09 — gate sits on the card-creation path, not card-execution. Make it mandatory in Phase 2 auto-populate mode.
5. **Migrate first wave of Strata modules into ContainerAdapters** — start with MaintenanceModule (already has a StrataMaintenanceAdapter stub to extend) and 2-3 others; prove the adapter pattern at scale.
6. **Build Bill Pay & Invoice Pipeline container** — missing entirely per AppFolio mapping area 3.
7. **Correct the four drifted internal docs** per §6 above. Bring them in line with the 3H compliance schema.

---

## 9. Verification Evidence (for this analysis)

Commands run in-sandbox (Node N/A — static analysis only):

```
ls src/components/ | wc -l                                    → 41
ls src/components/StrataDashboard/modules/ | grep -c '.tsx$'  → 33
find src/components/UniversalShell -type f | wc -l            → 9
grep -cE "^\s*'[a-z-]+':\s*\{" src/registry/widgetRegistry.ts → 26
grep -n "'universal-shell'" src/registry/widgetRegistry.ts    → 75:
grep -n "dock-universal-shell" src/data/hierarchy.ts          → 20:
grep -n "layout-grid" src/components/Sidebar/iconMap.ts       → 51:
grep -n "'inbox-zero'" src/registry/widgetRegistry.ts         → 93:
grep -rl "CT-3H-HANDOFF-M4Q7" src/components/UniversalShell/  → 2 (of 9)
grep -rl "CT-3E-ARCH-W8K3"    src/components/UniversalShell/  → 8 (of 9)
grep -rli "routingRule\|routeEmail\|classifyEmail" src/       → 0 matches
grep -li  "aiSuggest\|suggestCard\|cardSuggestion" src/components/TrelloBoard/ → 0 matches
grep -rli "blast" src/                                        → 1 file (AutomationHub.tsx only)
```

---

## 10. Sources

- Phase 3-H Engineer Handoff: `~/Documents/Andy/AstraStrata Review/Reports/Phase3H_Engineer_Handoff.docx` (§3 ratified decisions, §5 Red Team CRITICAL, §6 open items, §7 migration roadmap)
- Current state: `~/Downloads/Dwellium -Per Spec/qualia-shell/` (src scan 2026-04-19)
- Internal provenance: `Docs/F1_UniversalShell_Schema.md`, `Docs/Widget_Audit.md`, `Docs/Handoff_Parity_Checklist.md`, `qualia-shell/BUILD.md`

---

*This gap analysis is source-only static analysis. Runtime verification requires running the build per `Dwellium_Build_Runbook.md` on a machine with Node ≥25.5.0 and manually exercising the 8-point parity gate. Sandbox Node is 22.22.0 — below engine requirement — so runtime verification was not performed here.*
