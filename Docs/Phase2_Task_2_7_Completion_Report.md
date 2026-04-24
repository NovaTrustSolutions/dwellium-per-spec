# Phase 2 Task 2.7 — AuditModule Unified Timeline (B3 Closure) · Completion Report

**Task.** 2.7 — AuditModule: unified activity timeline across 5 source tables. Final link of the B3 serial chain (2.3 → 2.5 → 2.7) on `packages/types/index.ts`.

**Branch.** `feat/phase-2-task-2.7-audit-module` off `main@f6d3fb2`.
**Commits (pre-squash, atomic).**
1. `10d0529` — `feat(types): add AuditEvent + UnifiedTimelineView + 3 unions (Task 2.7)`
2. `a0741a0` — `feat(data): seed audit_timeline_index.json (2 rows, real property UUIDs) (Task 2.7)`
3. `2795b59` — `feat(api+ui): /audit/unified-timeline join + /audit/...snapshot + archive-search rewire (Task 2.7)`
4. `c6071c3` — `feat(ui): AuditModule — unified timeline sub-tab + ErrorBoundary/Sentry (Task 2.7)`
5. `aaad065` — `test(parity): audit unified-timeline contract tests + source-provenance + contamination + PII guards (Task 2.7)`
6. `60177bc` — `docs(plan): flip §9 Phase-2 cell for Task 2.7 + Task 2.5 SHA backfill + v2.2 -> v2.3 bump + B3 chain closure note`
7. *This report (commit 7, landed with render proof + security review).*

**Merge SHA (post-squash).** _(populated by squash-to-main on close)_
**Closure date.** 2026-04-23.

---

## Summary

Task 2.7 adds a **unified activity timeline** surface to `AuditModule.tsx`, implemented as a **query-time join** across 5 source tables: `compliance.json` (Task 2.3), `insurance_policies.json` (Task 2.5), `workitems.json` `.actionsLog[]` (Task 1.4), pre-existing `audit_log.json` (370 rows), and `communications.json` (currently empty, scaffolded). Each event emitted by the join handler carries an explicit `source` **provenance tag** from the `AuditEventSource` literal union — type-confusion is structurally impossible.

B3 serial chain **closed** at this merge. `packages/types/index.ts` Phase-2 serial ownership retires. Remaining Phase-2 tasks (2.1, 2.2, 2.4, 2.6, 2.8, 2.9, 2.10) open to the general pool per Appendix D's illustrative treatment.

**Opportunistic fix:** scheduling-pass §6 item #9 (AuditModule.tsx direct-fetch to `localhost:3000/api/search`) resolved in this PR — the archive-search tab rewired to `strataGet('/search', ...)` since the file was already being edited.

---

## §1 — Scope & DoR evidence

- **DoR 1–6** — plan v2.2 §8 (Task 2.7 rescope), scheduling-pass `Docs/Session_Notes/2026-04-23_phase_2_schedule.md` §6 item #9, Appendix D row 1 pinned text ✓
- **DoR-PRE1/2** — both snapshot rows in `audit_timeline_index.json` key on **real** property UUIDs verified in `properties.json` (`e4b440e9-...` = 128 BUENA VISTA DR N; `52d4e301-...` = Woodland Parc Townhomes). No synthetic IDs. The synthetic `"riverwood-club"` used in Task 2.3 / 2.5 was NOT introduced by this PR and is a deferred-cleanup candidate independent of Task 2.7.
- **DoR 7** — source fixtures enumerated: `audit_log.json` (370 rows), `communication_log.json` + `communications.json` (0 rows each), `workitems.json` (1 populated `actionsLog` — WO `b7a6b911-...` / 2 entries on Woodland Parc).
- **DoR 8–9** — tests count 117 (pre) → 123 (post) = +6 net (7 new it-blocks, 1 stub removed).
- **DoR 10–12** — `audit.test.ts` stub replaced; no AppFolio source for "audit" (Task 2.7 synthesizes from Dwellium-owned Phase-1/2 data); PR #9 / #10 merge SHAs verified as `36ee8ca` / `f6d3fb2`.

---

## §2 — Strict gate (local paste)

```
=== tsc -b ===
(clean, no output)

=== vitest ===
 Test Files  26 passed (26)
      Tests  123 passed (123)
   Start at  19:08:21
   Duration  2.58s

=== vite build (default) ===
✓ built in 5.02s

=== vite build (VITE_APPFOLIO_SEEDS=false) ===
✓ built in 4.92s

=== PII scan ===
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 47 files scanned across 2 roots, 0 leaks found (1489ms total).
```

- `tsc -b`: clean.
- `vitest`: 123 / 123 pass (was 117; +7 new, -1 stub = +6 net).
- `vite build` default: clean.
- `vite build` `VITE_APPFOLIO_SEEDS=false`: clean.
- PII scan strict scope: **47 files, 0 leaks** (was 46 — new `audit_timeline_index.json` added to scope).

---

## §3 — CDP render proof

**Tool.** `ws`-based CDP client against headless Chrome (`--remote-debugging-port=9223`), `VITE_USE_STATIC_API=true` dev server on `http://127.0.0.1:5173/`.

**Nav path.** sign-in (Andy / God Mode) → fill gate-passphrase (`Comet2878!` — pre-existing dev-only literal in `src/components/Auth/LoginScreen.tsx:52`, NOT introduced by Task 2.7) → expand `+Property Management` sidebar group → click `Strata` → click `Audit Log` module → click `audit-unified-tab`.

**Non-empty guard (micro-plan ack clause).** Before `Page.captureScreenshot`: the harness asserts `document.querySelectorAll('[data-testid="audit-unified-event-row"]').length > 0`. If zero, the harness throws and no screenshot is written.

**Capture result** (`Docs/Baselines/phase_2_task_2_7/cdp_summary.json`):

```
rowProbe.rowCount            = 100 (at default limit)
rowProbe.emptyPainted        = false
rowProbe.breakdownPainted    = true  (audit-unified-source-breakdown container)
rowProbe.containerPainted    = true  (audit-unified-timeline)
rowProbe.sourceBadges        = 100   (audit-unified-source-badge per row)
rowProbe.severityBadges      = 100   (audit-unified-severity-badge per row)
rowProbe.firstThreeSources   = ['insurance', 'compliance', 'compliance']
pngBytes                     = 709776
pngPath                      = Docs/Baselines/phase_2_task_2_7/AuditModule-unified-timeline.png
```

**Seed layer probe** (captured mid-harness before UI nav):
- `audit_timeline_index.json`: 2 rows, both real properties.json UUIDs.
- `compliance.json`: 15 rows. `insurance_policies.json`: 6. `workitems.json`: 1139. `audit_log.json`: 370. `communications.json`: 0.

All 6 nav steps succeeded; all 5 `data-testid` anchors painted; 0 rows in empty state (the `audit-unified-empty` testid is not rendered, confirming non-empty branch). PNG artifact: `Docs/Baselines/phase_2_task_2_7/AuditModule-unified-timeline.png`.

---

## §4 — /security-review deep pass (Task 2.7 only)

**Scope.** Only code introduced by this branch (`packages/types/index.ts` additions, `strataApi.static.ts` new routes, `AuditModule.tsx` additions, `audit.test.ts`, `audit_timeline_index.json`, plan doc edits).

### Sink grep (new code only)
```
dangerouslySetInnerHTML, __html, innerHTML=, eval(, new Function,
document.write, srcdoc=, setAttribute('on, outerHTML, .html(
  → 0 hits across all new code
```

### Findings

| # | Category | Severity | Disposition |
|---|---|---|---|
| S-1 | Multi-source type-confusion (a compliance row masquerading as an insurance event via computed `source` key) | N/A | **Defended.** Every source branch writes a LITERAL `source: 'compliance' \| 'insurance' \| ...` on every event it emits. No computed-key access. Test it-block #4 asserts the related* FK matches the source tag for every row. |
| S-2 | Property-scope leak (a property-filtered query returning unscoped system events) | N/A | **Defended.** When `propertyFilter` is set, `audit_log` rows (which have no `propertyId`) are EXCLUDED from the join. Test it-block #3 asserts `view.sourceBreakdown.audit_log === 0` for property-scoped queries on both target property IDs. |
| S-3 | Unbounded `Array.slice` from `?limit=` | N/A | **Defended.** `Math.min(parseInt(limit, 10), 1000)` caps the slice at 1000. Harmless on static JSON but mandatory per checklist. |
| S-4 | Unsafe arithmetic on timestamps | N/A | **Defended.** Sort uses `String.prototype.localeCompare` on ISO-string timestamps with a frozen epoch (`'1970-01-01T00:00:00.000Z'`) fallback. No `Date.parse` or subtraction on untrusted input. |
| S-5 | Path traversal through `loadTable(name)` | N/A | **N/A to Task 2.7.** `loadTable` invocations pass LITERALS only (`'compliance'`, `'insurance_policies'`, `'workitems'`, `'audit_log'`, `'communications'`, `'audit_timeline_index'`). No user-controlled `name` argument. |
| S-6 | Secret exposure | N/A | **None.** No secrets added. `GATE_PASSPHRASE` is pre-existing (documented in report §3); L131 rewire REMOVES a `localStorage.getItem('dwellium_token')` direct-fetch call and routes through `strataGet`, which is a neutral refactor — `strataGet` attaches auth via its own established plumbing (see pre-existing usages in `AuditModule.tsx` L102 and L145). |
| S-7 | XSS via untrusted event fields (`title`, `description`, `actor`) | N/A | **Defended.** All fields render as React JSX text-content (auto-escaped). No `dangerouslySetInnerHTML`, no `innerHTML=`, no `setAttribute('on…')`. Source-badge text derives from the literal `AuditEventSource` union (not free-text input). Sink grep: 0 hits. |
| S-8 | PII exposure via new fixture | N/A | **Defended.** `audit_timeline_index.json` contains only corporate property names (`128 BUENA VISTA DR N`, `Woodland Parc Townhomes`). PII scan: 46 → 47 files, **0 leaks**. Test it-block #7 runs SSN / 9+-digit / card / real-email / phone regex on the blob. |

**Verdict: High = 0, Medium = 0, Low = 0.**

---

## §5 — Verification matrix

| # | Claim | Evidence |
|---|---|---|
| 1 | `AuditEvent` + `UnifiedTimelineView` + 3 unions defined canonically | `packages/types/index.ts` L522+ insertion block (contiguous with Task 2.3/2.5 region) |
| 2 | Re-exports land in strata barrel | `strataTypes.ts` L76–80 (appended after `FolioGuardRollup`) |
| 3 | `audit_timeline_index.json` has 2 rows on real UUIDs | `public/data/audit_timeline_index.json` + `audit.test.ts` it-block #5 (membership in `properties.json` UUIDs asserted) |
| 4 | `/audit/unified-timeline` returns UnifiedTimelineView | `strataApi.static.ts` L132–269 + `audit.test.ts` it-block #2 |
| 5 | audit_log excluded from property-scoped queries | `strataApi.static.ts` L229–244 + `audit.test.ts` it-block #3 |
| 6 | Source provenance literal-only | `strataApi.static.ts` every branch writes `source: '<literal>'` + `audit.test.ts` it-block #4 |
| 7 | Limit hard-capped at 1000 | `strataApi.static.ts` `Math.min(raw, 1000)` + §4 S-3 |
| 8 | `/audit/unified-timeline/snapshot` by propertyId or no-param | `strataApi.static.ts` L270–277 + `audit.test.ts` it-block #5 |
| 9 | Archive-search direct-fetch rewired | `AuditModule.tsx` L132–141 (pre-existing `localhost:3000/api/search` replaced with `strataGet('/search', {q})`) + §3 nav path |
| 10 | New 'unified' sub-tab with 5 data-testids | `AuditModule.tsx` L215–241 (tab button) + L555–620 (render block) + §3 rowProbe.sourceBadges=100 / severityBadges=100 / containerPainted=true |
| 11 | ErrorBoundary wraps the new surface + 3 Sentry breadcrumbs | `AuditModule.tsx` imports L14 + render `<ErrorBoundary>` + 3 `Sentry.addBreadcrumb` calls (loaded, tab.click, event.click) |
| 12 | vitest: 117 → 123 (+6 net) | §2 strict-gate paste |
| 13 | PII scan 46 → 47 files, 0 leaks | §2 strict-gate paste |
| 14 | No new dangerously* / innerHTML / eval sinks | §4 sink grep |
| 15 | B3 chain closure documented in plan v2.3 | `Docs/AppFolio_Parity_Implementation_Plan_v2.md` §9 + Changelog v2.3 entry |
| 16 | Opportunistic fix: scheduling-pass §6 #9 resolved | §1 + §4 S-6 + Changelog v2.3 entry |

---

## §6 — Rollback

Atomic per-commit rollback supported (all 7 commits pure-additive except the L131 rewire, which is a localized behavioral change with defensive shape-mapping):

```
# Revert all Task 2.7 commits
git revert --no-commit 60177bc aaad065 c6071c3 2795b59 a0741a0 10d0529
git commit -m "revert: Task 2.7 AuditModule unified timeline (B3 closure rollback)"
```

Partial rollback fingerprints:
- Types only: `git revert 10d0529` — removes the AuditEvent/UnifiedTimelineView block. Commits 2–5 depend on these types; `git revert` of `10d0529` would require reverting 2–5 first.
- Seed only: `git revert a0741a0` — drops `audit_timeline_index.json`. Commit 3's `/audit/unified-timeline/snapshot` route will 404 but the `/audit/unified-timeline` join still works.
- API + archive rewire: `git revert 2795b59` — restores the pre-existing `localhost:3000/api/search` direct-fetch AND removes both new routes. Commit 4's UI fetcher will fail-soft to empty-state.
- UI only: `git revert c6071c3` — removes the sub-tab; viewTab union widens to unused 'unified' variant (dead code; tsc still passes).
- Tests only: `git revert aaad065` — restores the 17-line stub; suite reverts 123 → 117.
- Docs only: `git revert 60177bc` — plan reverts v2.3 → v2.2.

---

## §7 — Deferred

1. **Synthetic `"riverwood-club"` propertyId in compliance.json / insurance_policies.json / folioguard_rollup.json** — pre-existing from Tasks 2.3 / 2.5; NOT touched by this PR. Real UUID `705a6f52-f4a1-403b-ae3f-b3954b2cdac1` ("Riverwood Club Apartments") is available in `properties.json` and would be a clean substitute. Deferred to a standalone cleanup PR because (a) it crosses Task 2.3 + 2.5 fixtures, (b) it requires coordinated test updates (RIVERWOOD_PROPERTY_ID constants in insurance.test.ts + complianceEngine.test.ts), and (c) Task 2.7 already proves the real-UUID pattern for its own fixtures.
2. **`communications.json` + `communication_log.json`** — both empty. The join handler scaffolds the `communication` source branch so later population (e.g., Task 2.8) will light up the surface automatically with no handler changes.
3. **Linux Playwright baselines** — carried forward from Phase 0.0 deferred item. Task 2.7 captures macOS CDP proof only; no new Playwright fixtures introduced.
4. **Appendix D row 1 text** — still reads "Task 2.3 → 2.5 → 2.7 strictly serial (no parallelism safe)". With B3 chain now closed, this is historical context rather than forward discipline. Deferred per established precedent (PRs #9 / #10 also preserved the text untouched).

---

## §8 — Next-task unblock

B3 chain **closed.** Remaining Phase-2 tasks (2.1, 2.2, 2.4, 2.6, 2.8, 2.9, 2.10) are independently unblocked and open to the general pool; no serial dependency remains on `packages/types/index.ts`.

Recommended next tasks (per plan §8 + §19 dependency graph):
- **Task 2.1** — Property (banner) module rescope (already disjoint from B3).
- **Task 2.2** — Entity detail module extensions.
- **Task 2.4** — Leasing module (large surface; kick off in parallel with any 2.x).

No explicit order required. Any of these can open immediately from `main@<Task-2.7-squash-SHA>`.

---

🧪
