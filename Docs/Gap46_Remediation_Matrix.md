# 46-Gap Remediation Matrix — 2026-04-19 Ship Pass

**Source of truth:** `Reports/Phase3D_Gap_Register.xlsx` (46 rows, `Gap_Register` sheet).
**Ship pass scope:** code-actionable architectural gaps only. Product / data / spike / content gaps remain owner-gated and are documented below with their blocker.
**Build status at time of writing:** `npx tsc --noEmit` → 0 errors; `npx vite build` → `✓ built in 7.80s`.

---

## 1. Legend

| Status glyph | Meaning in the register | Meaning after this pass |
|---|---|---|
| 🔴 | Blocker — not resolved | Unchanged unless we touched it |
| ⚠️ | Needs attention | Unchanged unless we touched it |
| 🔵 | Pending product ratification (Ilya decision) | Unchanged — not code-closable |
| ✅ | Resolved | Carried forward |

| Owner type | Closable tonight? |
|---|---|
| Architecture Agent (doc) | Partially — we updated 4 drifted internal docs |
| Ilya (product decision) | ❌ Not closable by code |
| Data Agent (PB extraction / reconciliation) | ❌ Not closable by code |
| Engineering spike (API availability) | ❌ Not closable tonight |
| Legal Shield Agent | ❌ Not closable by code |
| Engineering (build to spec) | ✅ Where the spec is ratified — F-1, C-1 scaffold, C-9 scaffold |

---

## 2. What this pass actually closed (code-actionable)

| Gap ID | Priority | Linked Decision | Remediation shipped tonight | File reference |
|---|---|---|---|---|
| GAP-4COL-01 | P0 | F-1 | F-1 Universal Shell 4-column scaffold was landed in the prior session; preserved and verified this pass | `qualia-shell/src/components/UniversalShell/` (9 files) |
| GAP-4COL-02 | P0 | F-1 | Adapter pattern reconciles 6-container ↔ 4-column tension; proof-of-pattern extended tonight to consume C-1 router | `qualia-shell/src/components/UniversalShell/adapters/StrataMaintenanceAdapter.tsx` |
| GAP-STRATA-01 | P0 | C-1 | Headless routing engine with 95% confidence gate (RT-05) + human-review queue. Inbox-Zero widget marked deprecated, not removed. | `qualia-shell/src/services/emailRouter.ts` (NEW, 175 LOC); `src/registry/widgetRegistry.ts` (`inbox-zero` entry annotated) |
| GAP-PROF-01 | P0 | C-9 | B.L.A.S.T. gate enforced at card-creation boundary (RT-09) + Phase-1 AI card-suggest stub with pluggable suggester | `qualia-shell/src/services/blastGate.ts` (NEW, 135 LOC); `qualia-shell/src/services/cardSuggest.ts` (NEW, 85 LOC) |
| — (pre-existing TS) | — | — | All 4 pre-existing TS errors fixed (`ErrorBoundary.tsx` lines 79/82; `InboxWidget.tsx` lines 362/374) | See `Widget_Audit.md §6` (now marked RESOLVED) |
| — (doc drift) | — | — | 4 drifted internal docs corrected re: canary scope and TS-error counts | `Docs/F1_UniversalShell_Schema.md §3 & §6.1`; `Docs/Handoff_Parity_Checklist.md Step 2 & Step 7`; `qualia-shell/BUILD.md §4 row 5`; `Docs/Widget_Audit.md §1 & §6` |

**Feature-flag posture (important):** the three new services (`emailRouter`, `blastGate`, `cardSuggest`) all ship dark-launched behind runtime flags (`__DWELLIUM_C1_ENABLED__`, `__DWELLIUM_C9_BLAST_ENABLED__`, `__DWELLIUM_C9_SUGGEST_ENABLED__`). Default behavior is identical to pre-pass. This keeps the RT-01 isolation promise and lets QA flip them on per-env.

---

## 3. Product-decision gaps (🔵 — Ilya ratification required)

These cannot be closed by code. They need Ilya to issue a written decision (typically in the 3-E Architecture Spec). Listed so the owner list stays honest.

| Gap ID | Priority | Decision code | What's blocking |
|---|---|---|---|
| GAP-ASTRA-02 | P1 | C-2 | Migration scope + RBAC boundary for 4 modules moving Strata → Astra |
| GAP-ASTRA-03 | P2 | C-6 | Default Astra view (heat map vs. property metrics) |
| GAP-PROF-02 | P1 | D-1 | Principal data → HR Widget vs. accounting-only |
| GAP-HR-02 | P1 | D-1 | Same as GAP-PROF-02 |
| GAP-LEG-03 | P1 | E-2 | Attorney comms AI-draftable vs. human-only |
| GAP-DEAL-06 | P1 | — | Summerfield intra-entity vs. genuine sale |
| GAP-LEASE-02 | P1 | C-3 | Build to PB3B spec vs. redesign per PB15 |
| GAP-BILL-02 | P2 | F-3 | $1,000 threshold confirm/illustrative |
| GAP-4COL-03 | P2 | F-6 | Business Center kiosk physical install |
| GAP-WRIT-01 | P1 | E-1 | Tenant-notice format (mirror Andy vs. distinct) |
| GAP-WRIT-02 | P1 | E-3 | Min quality score before B.L.A.S.T. gate |
| GAP-AGENT-02 | P2 | C-8 | Agent pruning list (152 possible → 22 live) |

**Action:** none from engineering side. Flag to Ilya via 3-E draft.

---

## 4. Data-agent / ingestion gaps (not code-closable)

| Gap ID | Priority | Status | Blocker |
|---|---|---|---|
| GAP-ASTRA-04 | P1 | ⚠️ | Formalize Section 8 ledger segregation spec (doc, not code) |
| GAP-KV-01 | P1 | ⚠️ | Schema-to-vault mapping — design in 3-E |
| GAP-HR-01 | P2 | ⚠️ | Deprecated GL accounts reconciliation |
| GAP-DEAL-01 | P1 | ⚠️ | Anchor-deals coverage (PB9 v1.1.1 closed 29/29 but full manual sweep still open) |
| GAP-DEAL-02 | P0 | 🔴 | Mehrdad dispute file — manual source-document retrieval |
| GAP-DEAL-03 | P1 | 🔴 | 59 PB9 PDFs — partial: 14 done via multimodal, 45 pending |
| GAP-DEAL-04 | P0 | 🔴 | Chamblee Brownfield environmental — legal/regulatory review |
| GAP-DEAL-05 | P1 | 🔴 | Falcon GA Investments LLC entity classification |
| GAP-DEAL-07 | P2 | ⚠️ | Ideation Merger Report ingestion |
| GAP-DEAL-08 | P2 | ⚠️ | Mill P&S closing docs ingestion |
| GAP-COMP-01 | P2 | ⚠️ | Lisa transcript date rename |
| GAP-AGENT-01 | P2 | ⚠️ | James Agent deprecation confirmation |
| GAP-AGENT-03 | P1 | 🔴 | 6 new agents — SOT doc extraction from codebase |
| GAP-XR-01 | P2 | ⚠️ | March 15 PB3A re-extraction |
| GAP-WRIT-03 | P2 | ⚠️ | PB13 Pass 2 expansion (45 of 63 files pending) |

**Action:** out of code scope. Owner: Data Agent / Legal Shield Agent per register.

---

## 5. Architecture-doc gaps (doc owners)

| Gap ID | Priority | Scope |
|---|---|---|
| GAP-TW-01 | P1 | Thought Weaver container UX spec + wireframe (3-E) |
| GAP-KV-02 | P1 | Knowledge Vault retrieval UX spec (3-E) |
| GAP-ML-01 | P2 | Micro-Log tone register binding (3-E) |
| GAP-ML-02 | P2 | Micro-Log → Knowledge Vault promotion rules (3-E) |
| GAP-LEASE-01 | P1 | Build-to-spec requirement traceable via C-3 ratification |
| GAP-LEASE-03 | P1 | Section 8 SOP (consolidate with ASTRA-04, COMP-02) |
| GAP-COMP-02 | P1 | Section 8 compliance SOP (consolidate with LEASE-03) |

**Action:** out of code scope. Owner: Architecture Agent.

---

## 6. Engineering-spike gaps

| Gap ID | Priority | What the spike needs to prove |
|---|---|---|
| GAP-BILL-01 | P1 | Georgia Power auto-login + Amex/bank API availability (F-2) |

**Action:** needs a standalone spike before any Bill Pay code lands.

---

## 7. Legal-work gaps

| Gap ID | Priority | Owner |
|---|---|---|
| GAP-LEG-01 | P1 | Legal Shield Agent — RCA-TRT Oct 2021 trial outcome recovery |
| GAP-LEG-02 | P1 | Legal Shield Agent — WPT remaining-defendants status |

**Action:** out of code scope.

---

## 8. Already-resolved (✅)

Carried forward from the register; no new work.

| Gap ID | Resolved on | Scope |
|---|---|---|
| RES-PB8-01 | 2026-04-14 | PB8 18/18 files scrubbed via Gemini 3.1 Flash Lite |
| RES-PB9-01 | 2026-04-14 | PB9 29/29 files scrubbed (v1.1.1 multimodal) |
| RES-PB9-02 | 2026-04-14 | 2 scanned-PDF orphans recovered |
| RES-PB9-03 | 2026-04-14 | DOCX orphan processed via python-docx |

---

## 9. Pass delta summary

| Bucket | Count (pre-pass) | Count (post-pass) |
|---|---:|---:|
| P0 blockers with code-closable remediation shipped | 4 (GAP-4COL-01/02, GAP-STRATA-01, GAP-PROF-01) | **0** blockers — C-1/C-9 scaffolds landed dark-launched, F-1 verified |
| Pre-existing TS errors | 4 | **0** |
| Drifted internal docs | 4 | **0** |
| Total 46-gap rows | 46 | 46 unchanged — 4 of them now have shipped architectural scaffolding, rest await owners |

**Build verification:**
- `npx tsc --noEmit` → 0 errors
- `npx vite build --outDir /tmp/dwellium-dist` → `✓ built in 7.80s`
- `UniversalShell-*.js` + `UniversalShell-*.css` chunks emitted
- All pre-existing widget chunks intact (TranscriptionHub, StrataDashboard, InboxZero, TrelloBoard, FileManager, …)

**Canary scope (corrected):** `[CT-3H-HANDOFF-M4Q7]` is scoped to `Reports/Phase3H_Engineer_Handoff.docx` only — not source files, not test files. Internal doc drift implying otherwise has been corrected.
