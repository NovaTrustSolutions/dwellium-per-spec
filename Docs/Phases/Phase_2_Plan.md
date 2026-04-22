# Phase 2 — Partial-Coverage Module Upgrades

**Parent plan.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §8 (Phase 2 refinements)
**Phase status.** Not started. Blocked on Phase 1 exit gate.
**Budget.** 2 days + 1 day buffer = 3 days
**Owner.** TBD per task
**Dependencies.** Phase 1 complete; new canonical types available.
**Parallelizable?** **Yes, with constraints.** Tasks 2.1–2.10 may run in parallel ONLY if they touch disjoint files (Appendix D). Conflict pairs: 2.3 + 2.5 (both touch `compliance.json`); 2.4 + 2.10 (both touch `properties.json`). Those pairs must be sequential.

---

## §1. Scope

Upgrade the 10 modules the gap analysis marked "Partial" (covers the AppFolio feature in name only) to full parity by adding the captured-but-not-displayed fields, new sub-components, new seed data, and one contract test per task.

Scope boundaries:

- IN — calendar, communication, complianceEngine, forecast, insurance, utilities, audit, sentiment, projects, propertyTimeline.
- OUT — strata-unique modules (GR-1 protected); backend wiring; real-data bulk load (Phase 4).

---

## §2. Definition of Ready

Per task 2.N:

1. Phase 1 exit gate passed.
2. New canonical types from Phase 1 are available on `main`.
3. Engineer has read the linked module source + AppFolio JSON capture.
4. File-ownership check: the task's files are not currently held by another task branch (Appendix D).

---

## §3. Definition of Done

Per task:

1. Any new types added to `packages/types/index.ts` are optional (GR-2) and re-exported.
2. Module UI consumes the new data; error boundary wraps each new block (GR-13).
3. One contract test replacing the Phase 0 stub under `qualia-shell/src/test/appfolioParity/{module}.test.ts`.
4. `vitest / tsc / vite build / playwright` pass per §5.
5. `/security-review` pass.
6. PII-leak scan pass.
7. GR-3 row-count not regressed (Appendix C of parent plan).

---

## §4. Tasks

### Task 2.1 — Calendar / Scheduling view

**Goal.** Render AppFolio's day/week calendar view for maintenance + showings.

**Files touched.**

- `modules/CalendarModule.tsx` — add week-view grid; selectable day column opens detail panel.
- `modules/__calendar/DayColumn.tsx` (new).
- `qualia-shell/public/data/showings.json` (new) — 8 rows from capture.
- `appfolioParity/calendar.test.ts` — real test.

**Contract test.** "Given 2026-04-20 with 3 WO 19511 availability windows + 1 showing, the week column for that day renders 4 time-boxed blocks in chronological order."

**Conflicts.** None.

---

### Task 2.2 — Communication seed + viewer

**Goal.** Surface the community-email thread with proper sanitization.

**Files touched.**

- `modules/CommunicationModule.tsx` — render threads with From / To / Subject / timestamp.
- `qualia-shell/public/data/communications.json` — seeded from `fixtures/appfolioDerived/communications.ts`. Real emails replaced with `tenant-{occ_id}-{seq}@example.com` by the derivation script.
- `appfolioParity/communication.test.ts` — real test.

**Sanitize rule (mandatory).** Derivation script emits only `@example.com` addresses. Phase 0.0 Task 0.0.5 `verify_no_pii_leak.mjs` catches any leak.

**Contract test.** "Given 7 sanitized community emails, CommunicationModule renders 7 rows with no `@gmail.com` / `@yahoo.com` / etc. in the DOM."

**Conflicts.** None.

---

### Task 2.3 — ComplianceEngine full schema

**Goal.** Promote `ComplianceEngine` from a placeholder list to a typed, gateable compliance tracker.

**Files touched.**

- `packages/types/index.ts`:
  - `ComplianceItem { id, entityType, entityId, entityName?, kind, expirationDate?, itemType?, computedStatus?, notes?, source? }`
  - `InsurancePolicy { id, entityId, policyNumber?, carrier?, coverageLimits?, effectiveDate?, expirationDate?, status? }`
- `strataTypes.ts` — re-export.
- `modules/ComplianceEngine.tsx` — render expiration-sorted table with color-coded status; insurance section.
- `qualia-shell/public/data/compliance.json` — 6 vendor rows + 9 AHA inspections from Phase 0 capture.
- `appfolioParity/complianceEngine.test.ts` — real test.

**Contract test.** "Given 6 vendor compliance rows + 9 inspection rows, ComplianceEngine renders 15 entries sorted by expirationDate ascending; expired items have red status chip."

**Conflicts.** With 2.5 (insurance) on `compliance.json` — 2.3 goes first; 2.5 rebases.

---

### Task 2.4 — Forecast 50-property seed

**Goal.** Populate the Forecast module with the 50-property list from AppFolio page 1.

**Files touched.**

- `modules/ForecastModule.tsx` — table renders 50 rows with occupancy ratio + monthly rent projection.
- `qualia-shell/public/data/properties.json` — merge 50 AppFolio properties WITH the existing 4 Strata mocks (GR-3 row-count rule: never replace).
- `appfolioParity/forecast.test.ts` — real test.

**Merge rule.** When `VITE_APPFOLIO_SEEDS=true`: 54 rows (4 Strata + 50 AppFolio). When `false`: 4 rows (Strata only). Never <4.

**Contract test.** "Given flag=true, ForecastModule renders 54 rows; given flag=false, 4 rows."

**Conflicts.** With 2.10 (PropertyTimeline) on `properties.json` — 2.4 goes first; 2.10 rebases.

---

### Task 2.5 — Insurance block

**Goal.** Show insurance policies as a distinct block on property/vendor detail.

**Files touched.**

- `modules/InsuranceModule.tsx` (or a sub-component on `PropertiesModule.tsx`).
- `qualia-shell/public/data/compliance.json` — add insurance rows (uses `InsurancePolicy` from 2.3).
- `appfolioParity/insurance.test.ts` — real test.

**Contract test.** "Given property appfolio-18 with 2 active policies, the Insurance block renders 2 rows with policyNumber + carrier + coverageLimits."

**Conflicts.** With 2.3. Rebase onto 2.3.

---

### Task 2.6 — Utilities module

**Goal.** Track utility accounts per property with billing schedules.

**Files touched.**

- `modules/UtilitiesModule.tsx` — table: utility type / account / billing cycle / last bill / next bill.
- `qualia-shell/public/data/utilities.json` (new).
- `appfolioParity/utilities.test.ts` — real test.

**Contract test.** "Given property appfolio-18 with 3 utility accounts (water, power, gas), UtilitiesModule renders 3 rows."

**Conflicts.** None.

---

### Task 2.7 — Audit Log viewer (rescoped from v1.0 banner)

**v1.0 was wrong.** v1.0 Task 2.7 proposed a marketing banner labeled "Audit Log". v2.0 rescopes to a real viewer: for a given entity (property, unit, tenant, vendor), render the WO actions log + communication log as a unified activity timeline. This is what AppFolio's paid Audit Center shows; Strata surfaces it at Core tier.

**Files touched.**

- `modules/AuditModule.tsx` — unified timeline component.
- `__audit/TimelineEntry.tsx` (new).
- `qualia-shell/public/data/activity_log.json` (new) — aggregates WO actionsLog + communications per entity.
- `appfolioParity/audit.test.ts` — real test.

**Contract test.** "Given property appfolio-18 with 2 WO action entries + 1 communication, the audit viewer for appfolio-18 renders 3 timeline entries sorted newest-first."

**Conflicts.** None.

---

### Task 2.8 — Sentiment module (real, not mock)

**Goal.** Replace the hardcoded sentiment stubs with tenant-communication-derived sentiment scoring.

**Files touched.**

- `modules/SentimentModule.tsx` — render per-tenant sentiment from communication log.
- `qualia-shell/src/lib/sentiment.ts` (new) — simple keyword-based scorer (no ML dep).
- `appfolioParity/sentiment.test.ts` — real test.

**Contract test.** "Given 3 communications from tenant-2800-1 (2 positive, 1 neutral), `sentimentFor('tenant-2800-1')` returns score ≥ 0.3."

**Conflicts.** None.

---

### Task 2.9 — Projects module

**Goal.** Surface multi-WO projects (e.g., roof replacement → 3 WOs).

**Files touched.**

- `packages/types/index.ts` — `Project { id, name, status, startDate?, endDate?, workitemIds: string[] }`.
- `strataTypes.ts` — re-export.
- `modules/ProjectsModule.tsx` — list projects; expand to show member WOs.
- `qualia-shell/public/data/projects.json` (new).
- `appfolioParity/projects.test.ts` — real test.

**Contract test.** "Given project 'Roof Replacement 128 BV' with 3 member WOs, ProjectsModule renders 1 project row with expandable 3-WO detail."

**GR-1 check.** `Projects` is NOT a GR-1 protected module (it's a parity add, not strata-unique). Safe to extend.

**Conflicts.** None on seed data; shares `Workitem` type so verify compile after Phase 1 Task 1.4 merged.

---

### Task 2.10 — Property Timeline + EntityLink

**Goal.** Link-tracking between entities (property ↔ unit ↔ tenant ↔ vendor) so the timeline view can show "2026-04-20: vendor 2716 assigned to WO 19511-1 on property 18".

**Files touched.**

- `packages/types/index.ts` — `EntityLink { id, sourceId, sourceType, targetId, targetType, linkType, note?, reportedAt? }`.
- `strataTypes.ts` — re-export.
- `modules/PropertiesModule.tsx` — add Timeline tab; consumes `EntityLink[]`.
- `qualia-shell/public/data/entity_links.json` (new).
- `qualia-shell/public/data/properties.json` — no schema change; only augment existing rows.
- `appfolioParity/propertyTimeline.test.ts` — real test.

**Contract test.** "Given 5 entity links rooted at property appfolio-18, the Timeline tab renders 5 entries newest-first with source → target labels."

**Conflicts.** With 2.4 on `properties.json` — 2.4 goes first; 2.10 rebases.

---

## §5. Verification Matrix

| Check | Target | Per-task row |
|---|---|---|
| `tsc -b` = 0 | pass | R for every task |
| `vitest run` ≤ baseline | pass | R |
| New contract test replaces stub | present | R |
| `vite build` both flag states | pass | R |
| `playwright test` ≤ baseline | pass | R |
| axe-core ≤ baseline on modified pages | pass | R |
| Lighthouse LCP ≤ max(B, 500ms) | pass | R |
| Manual dev-server smoke | pass | R |
| Screenshot attached | present | R |
| `/security-review` | no High/Medium | R |
| PII-leak scan | exit 0 | R |
| GR-3 row count ≥ baseline | pass | R (especially 2.4, 2.10) |

---

## §6. Phase-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R-2-1 | Parallel tasks step on each other's files | Med | Med | Appendix D file-ownership matrix; conflict pairs sequential |
| R-2-2 | `VITE_APPFOLIO_SEEDS=false` build loses rows <baseline | Low | High | GR-3 + merge-not-replace rule; CI enforces row-count JSON |
| R-2-3 | New types break compile in Phase 1 modules | Low | Med | Additive only; `tsc -b` gate per task |
| R-2-4 | ComplianceEngine table slow on 50+ rows | Med | Med | virtualize via `react-window` if >100 rows |
| R-2-5 | Sentiment scorer gives misleading scores | Low | Low | doc that v1 is keyword-based; ML upgrade deferred |
| R-2-6 | Audit log leaks tenant names to PDF exports | Low | Med | Export path runs through the same `@example` sanitize filter |

---

## §7. Rollback Plan

Each of 2.1–2.10 is a discrete PR. Revert order: any order works (parallel branches). All type additions optional, all new seed files self-contained. `git revert` safe.

---

## §8. Exit Gate

Phase 2 is complete when:

1. All 10 tasks merged to main.
2. Full suite `vitest / playwright / vite build` pass per §5.
3. Row-count JSON (`Docs/Baselines/Phase2_fixture_counts.json`) shows ≥ Phase 1 counts.
4. `Docs/Phase2_Completion_Report.md` committed with pasted output + 10 screenshots.
5. Ilya verifies "go Phase 3".

---

## §9. Deliverables

- 3 new interfaces (`ComplianceItem`, `InsurancePolicy`, `EntityLink`, `Project`) plus extensions.
- 10 new / extended module components with error boundaries.
- 5 new sub-components (DayColumn, TimelineEntry, etc.).
- 10 new or extended seed files under `qualia-shell/public/data/`.
- 10 contract tests replacing Phase 0 stubs.
- 10 dev-server screenshots.
- `Docs/Phase2_Completion_Report.md`.

---

## §10. Timeline

| Group | Tasks | Budget | Can parallelize |
|---|---|:-:|:-:|
| A | 2.1 Calendar, 2.2 Communication, 2.6 Utilities, 2.7 Audit, 2.8 Sentiment, 2.9 Projects | 1 day | Yes |
| B | 2.3 ComplianceEngine, 2.4 Forecast | 1 day | Yes (disjoint seeds) |
| C | 2.5 Insurance (after 2.3), 2.10 PropertyTimeline (after 2.4) | 0.5 day | Yes |
| Buffer | — | 1 day | — |
| **Total** | **10 tasks** | **3 days** | |

🧪
