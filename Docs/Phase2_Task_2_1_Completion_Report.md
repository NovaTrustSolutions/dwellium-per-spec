# Phase 2 Task 2.1 — CalendarModule AHA Section-8 Inspection Seed · Completion Report

**Task.** 2.1 — Calendar — 9 AHA inspections (Riverwood Club, 2026-04-27..30). Second Phase-2 general-pool task landed post-B3.

**Branch.** `feat/phase-2-task-2.1-calendar-inspections-seed` off `main@b98e84c`.

**Commits (pre-squash, atomic, all strict-gate-green).**
0. `4e14833` — `fix(ui): CommunicationModule — query preview field in search filter (Task 2.2 follow-up)` — opportunistic piggyback.
1. `070a51b` — `feat(data): seed 9 AHA Section-8 inspection workitems for Riverwood Club (Task 2.1)`
2. `989a06f` — `feat(ui): CalendarModule — ErrorBoundary + 2 Sentry breadcrumbs + 6 data-testids (Task 2.1)`
3. `2c3ad12` — `test(parity): calendar contract tests + RTL grid regression + upcoming-list distribution + contamination + PII guards (Task 2.1)`
4. `f7f30bd` — `docs(plan+repo): v2.4 -> v2.5 + §9 Task 2.1 row flip + Task 2.2 SHA backfill + CLAUDE.md drift sweep`
5. *This report + CDP render proof (commit 5).*

**Merge SHA (post-squash).** _(populated by squash-to-main on close)_
**Closure date.** 2026-04-24.

---

## Summary

Task 2.1 appends 9 new `type: 'inspection'` Workitem rows to `workitems.json` (1139 → 1148 rows) seeding the CalendarModule's upcoming-inspection demo for Riverwood Club Apartments on 2026-04-27..30 in a 3/3/2/1 date distribution. Retrofits CalendarModule.tsx with GR-13 observability (ErrorBoundary + 2 Sentry breadcrumbs + 6 data-testid anchors per the Option α split) and a minor behavioral change (upcoming-events list slice 8 → 30) so all 9 inspections render without capping.

**Scope lock (DoR-PRE0):** Per scheduling-pass `Docs/Session_Notes/2026-04-23_phase_2_schedule.md` §6 L29 — plan doc §8 has no Task 2.1 body; scheduling-pass is sole authoritative source. Task 2.1 = **"Calendar — 9 AHA inspections"** on Riverwood Club (real UUID `705a6f52-...`) dated 04/27–04/30/2026.

**Commit 0 piggyback:** Resolved Task 2.2 completion-report §7 item 5 (CommunicationModule L121 search filter now queries `preview` field alongside `subject` + `fromAddress`). Opportunistic single-commit fix on this branch per the Task 2.7 L131 archive-search rewire precedent — avoids a separate micro-PR.

**B3 chain status:** Unchanged (CLOSED at Task 2.7 merge `40875db`). Task 2.1 is the second general-pool task post-B3 (Task 2.2 `b98e84c` was the first).

---

## §1 — Scope & DoR evidence

### 15-item DoR complete (all green)

- **DoR-PRE0** — Task 2.1 scope locked via scheduling-pass §6 L29; §8 has no Task 2.1 body; §9 had Task 2.1 in pending row only. Branch name + commit labels + report filename all use `2.1` (not the mislabel-2.8-of-Task 2.2 reframe).
- **DoR-PRE1** — 36 real `properties.json` UUIDs enumerated; `705a6f52-f4a1-403b-ae3f-b3954b2cdac1` = Riverwood Club Apartments (verified at commit 1 time via node grep against `properties.json`; commit body includes the paste).
- **DoR-PRE2** — all 9 seeded rows use the real Riverwood UUID. No synthetic propertyIds. Test it-block #1 re-verifies via `propertiesSeed` set-membership.
- **DoR 5** — `packages/types/index.ts:21` `WorkitemType` union already includes `'inspection'`; `packages/types/index.ts:293` `Workitem` interface has all 27 required + 10 Task-1.4 optional fields; **zero type additions** needed for this task.
- **DoR 6** — `strataTypes.ts` barrel: no re-export changes needed.
- **DoR 7** — `strataApi.static.ts:104` `/workitems` route already supports `?type=`, `?domain=`, `?property_id=`, `?status=` filters via `filterBy` helper; **zero new API routes**.
- **DoR 8** — `CalendarModule.tsx` exists (494 lines pre-retrofit); in-place edit only; all existing tabs + behavior preserved; **Flag 3 direct-fetch audit** documented 3 out-of-scope sites (L89 `/api/calendar/status`, L102 `/api/calendar/events`, L148 `webcal://` ICS URL) — Google/Apple Calendar integration; not bundled into this PR.
- **DoR 9** — existing exclusive-key inventories across all 3 prior parity tests catalogued: `TASK_1_1..1_5` / `TASK_2_3_COMPLIANCE_EXCLUSIVE` / `TASK_2_5_EXCLUSIVE_KEYS` / `TASK_2_7_EXCLUSIVE_KEYS` / `TASK_2_2_EXCLUSIVE_KEYS`. **TASK_2_1_EXCLUSIVE_KEYS is empty** — Task 2.1 adds no new types; contamination guard flows one direction only.
- **DoR 10** — `audit.test.ts` unchanged (Task 2.1 WOs don't have `actionsLog`, so Task 2.7's audit-timeline join sourceBreakdown is unaffected for property `705a6f52-...`).
- **DoR 11** — PII scanner 5-regex inventory memorized (SSN / 9+-digit / card / real-email-domain / parenthesized-phone / dashed-phone); seeded rows use no PII.
- **DoR 12** — (already listed as DoR-PRE2).
- **DoR 13** — CLAUDE.md drift confirmed stale (HEAD `40875db`, last-green-CI `24869096898`/`40875db`, next-phase 6-item list); swept in commit 4.
- **DoR 14** — Sentry breadcrumb baseline on `CalendarModule.tsx` = **0**; post-commit-2 count = **2**; line refs `:87` (module.loaded) + `:505` (inspection.click).
- **DoR 15** — `.github/workflows/appfolio-parity-gate.yml` paths already cover `qualia-shell/public/data/**` + `test/appfolioParity/**`; no yaml changes.

### 3 DoR-PRE0-ack flags resolved

- **Flag 1 (AHA expansion):** LOCKED to bare "AHA" — 0 matches for "Area Housing" / "American Housing" in the repo; existing convention "Section 8 (AHA) Inspection" (9 Task-2.3 compliance.json rows + test constants). Task 2.1 uses the literal verbatim.
- **Flag 2 (Section-8 Rollup coherence):** NO REFRESH — `section8_rollup.json` is correct (`totalScheduled: 9`); Task 2.1 touches workitems.json parallel surface, not compliance.json. Secondary ComplianceEngine CDP capture was **opt-out** per ack — single Calendar capture suffices.
- **Flag 3 (CalendarModule direct-fetch rewire):** DEFERRED — 3 sites need 3 new `/api/calendar/*` static handlers; materially bigger than Task 2.7's L131 one-liner. Standalone follow-up PR candidate.

---

## §2 — Strict gate (local paste)

```
=== tsc -b ===
(clean, no output)

=== vitest ===
 Test Files  26 passed (26)
      Tests  139 passed (139)
   Start at  00:53:53
   Duration  3.22s

=== vite build (default) ===
✓ built in 5.06s

=== vite build (VITE_APPFOLIO_SEEDS=false) ===
✓ built in 5.38s

=== PII scan ===
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 47 files scanned across 2 roots, 0 leaks found (1568ms total).
```

- `tsc -b`: clean.
- `vitest`: **139 / 139** pass (was 131 post-Task-2.2; +8 net = +9 new calendar.test.tsx - 1 stub + 0 audit.test.ts change).
- `vite build` default: clean.
- `vite build` `VITE_APPFOLIO_SEEDS=false`: clean.
- PII scan: **47 files, 0 leaks** (count unchanged — workitems.json already in scope at 1139 rows; 9 appended rows scanned as part of existing file).

---

## §3 — CDP render proof

**Tool.** `ws`-based CDP client against headless Chrome (`--remote-debugging-port=9223`), `VITE_USE_STATIC_API=true` dev server on `http://127.0.0.1:5173/`.

**Nav path.** sign-in (Andy) → gate passphrase → expand Property Management → Strata → click Calendar module.

**Guard clause (Ilya's exact paste, strict equality):**
```js
document.querySelectorAll('[data-testid="calendar-inspection-event"]').length === 9
```

**Guard return value (captured inline per handback spec):**
```json
{
  "rowCount": 9,
  "moduleRendered": true,
  "gridRendered": true,
  "gridInspectionDots": 9,
  "dueDateDistribution": {
    "2026-04-27": 3,
    "2026-04-28": 3,
    "2026-04-29": 2,
    "2026-04-30": 1
  }
}
```

**All guard conditions met.** 9 upcoming-events list rows + 9 month-grid dots + 3/3/2/1 distribution via `data-due-date` attribute matches Task 2.3's `section8_rollup.uniqueInspectionDates` exactly.

**Seed probe (mid-harness, pre-nav):**
```json
{ "workitemsTotal": 1148, "task21Count": 9, "task21Dates": ["2026-04-27","2026-04-27","2026-04-27","2026-04-28","2026-04-28","2026-04-28","2026-04-29","2026-04-29","2026-04-30"] }
```

Artifacts: `Docs/Baselines/phase_2_task_2_1/{CalendarModule-inspections.png (602 KB), cdp_summary.json}`.

---

## §4 — /security-review deep pass (Task 2.1 only)

**Scope.** Only code introduced by this branch.

### Sink grep (new code only)
```
dangerouslySetInnerHTML / __html / innerHTML= / eval( / new Function /
document.write / srcdoc= / setAttribute('on / outerHTML / .html(
  → 0 hits across all new code (seed JSON, UI retrofit, tests, docs)
```

### Findings

| # | Category | Severity | Disposition |
|---|---|---|---|
| S-1 | XSS via Workitem title / description / type-badge rendering | N/A | **Defended.** All Workitem fields render as React JSX text content (auto-escaped). Type badge uses the literal `WorkitemType` union (5 known values), never free-text. Icon lookup via `typeIcon(ev.type)` returns a known React element. No `dangerouslySetInnerHTML`, no `innerHTML=`. Sink grep: 0 hits. |
| S-2 | Cross-origin data leakage via `data-testid` / `data-type` / `data-due-date` / `data-date` attributes | N/A | **N/A.** These attributes are bound to typed union values (`WorkitemType`), ISO-date strings, or the row's own `id`. No user-controlled strings reach the DOM as attributes. Standard React attribute sanitization applies. |
| S-3 | PII exposure via 9 new Workitem rows | N/A | **Defended.** Row titles use the literal template `"Section 8 (AHA) Inspection — Riverwood Club (unit TBD)"` (property-level scope, unit TBD placeholder, no tenant names). Descriptions are fabricated neutral copy. `assignedTo` / `createdBy` / `unitId` all `null`. No email / phone / SSN / card patterns. PII scan confirms 47 / 0. |
| S-4 | Audit-log cross-property leakage via Task 2.7 join | N/A | **N/A.** Task 2.1 rows don't populate `actionsLog` (Task-1.4 optional field), so Task 2.7's `/audit/unified-timeline` handler emits 0 `workitem` events from Task 2.1 seed. No new leak surface introduced; existing Task-2.7 property-scope guard (audit_log excluded when `propertyFilter` is set) still holds. |
| S-5 | Google Calendar sync hijack via direct-fetch sites (L89 / L102 / L148) | N/A | **OUT OF SCOPE (Flag 3 deferred).** These are pre-existing backend-direct fetches for Google/Apple Calendar integration; Task 2.1 does NOT modify them. No new attack surface introduced by Task 2.1. Rewire is tracked as a deferred follow-up PR candidate. |
| S-6 | Type-confusion between Workitem inspection rows and other Workitem subtypes | N/A | **Defended.** Bidirectional contamination guard (it-block #8) enforces Task-1.1/1.2/1.3/1.5/2.2/2.3/2.5/2.7 exclusive keys forbidden on Task-2.1 rows. Task-1.4 keys intentionally OMITTED from forbidden set (shared Workitem schema design) — documented. |
| S-7 | DOM-based attribute injection via `data-due-date={ev.dueDate}` | N/A | **Defended.** `ev.dueDate` is a JSON-loaded string from a trusted static fixture (`workitems.json`); no user input reaches the attribute. Even if compromised fixture injected a malicious string, React auto-escapes attribute values. The CDP harness guard reads `data-due-date` as string-only, never evaluates. |
| S-8 | ErrorBoundary masking genuine runtime errors | N/A | **Expected.** ErrorBoundary fallback is user-facing UX ("Calendar module unavailable.") and non-silent (visible glass card). Sentry breadcrumb `calendar.module.loaded` emits data `{eventCount, inspectionCount}` for ops-side diagnosis. Pattern matches Task 1.5 / 2.3 / 2.5 / 2.7 / 2.2 precedent. |

**Verdict: High = 0, Medium = 0, Low = 0.**

---

## §5 — Verification matrix

| # | Claim | Evidence |
|---|---|---|
| 1 | No type additions (WorkitemType already includes 'inspection') | `packages/types/index.ts:21` unchanged; `git diff main...HEAD -- packages/types/` = empty |
| 2 | 9 new Workitem rows on real Riverwood UUID (DoR-PRE1/PRE2) | `public/data/workitems.json` 1139 → 1148; commit 1 body DoR-PRE1 grep paste; test it-block #1 re-verifies |
| 3 | 3/3/2/1 date distribution matches Task 2.3 section8_rollup.uniqueInspectionDates | test it-block #2 (seed-level); test it-block #7 (DOM-level via data-due-date); CDP summary `dueDateDistribution` |
| 4 | Existing `/workitems` route handles filters unchanged | `strataApi.static.ts:104` untouched; test it-block #4 asserts `?type=inspection&property_id=...` returns 9 |
| 5 | CalendarModule in-place retrofit — no structural changes | 6 data-testids added (L168/395/423/447/478/498); 2 Sentry breadcrumbs (L87/505); ErrorBoundary wrap (L166/539); upcoming-list slice 8 → 30 (L487); Google Calendar direct-fetch sites L89/L102/L148 UNCHANGED |
| 6 | 6 data-testids per Option α split | 5 static grep hits + 1 dynamic conditional at L498; verified post-commit-2 |
| 7 | 2 Sentry breadcrumbs (baseline 0) | `grep -c Sentry.addBreadcrumb` on parent of c6071c3: 0; on HEAD: 2; pattern matches Task 2.2 |
| 8 | RTL grid regression it-block | `calendar.test.tsx` it-block #6 renders CalendarModule with mocked UserContext + strataApi; asserts 9 inspection dots + parent-cell `data-date` in 4-date set |
| 9 | `/audit/unified-timeline` unaffected by Task 2.1 | Task 2.1 rows have no `actionsLog`; existing audit.test.ts it-block #9 (light-up for BV) still asserts `sourceBreakdown.communication === 2` for Riverwood scope unchanged |
| 10 | vitest 131 → 139 (+8 net) | §2 strict-gate paste; commit 3 body explicit math |
| 11 | PII 47 / 0 | §2 strict-gate paste |
| 12 | CDP guard `=== 9` passed | §3 guard return value `rowCount: 9` |
| 13 | Plan v2.4 → v2.5 + §9 Task 2.2 SHA backfill + Task 2.1 row ✓ | `Docs/AppFolio_Parity_Implementation_Plan_v2.md` header + §9 (L368-L371) + Changelog v2.5 |
| 14 | CLAUDE.md drift fixed | L9-16 (HEAD, last-green-CI, next-phase 5-item list) |
| 15 | Pending narrowed to 5 items (2.8 retained) | plan §9 tracker + CLAUDE.md next-phase line |
| 16 | Appendix D row 1 UNTOUCHED | `grep -n "packages/types/index.ts"` L581 reads "Task 2.3 → 2.5 → 2.7 (strictly serial)" — same as PR #8 landed |
| 17 | Commit 0 piggyback: L121 preview search fix | `CommunicationModule.tsx` L92-101 extended filter + test coverage in `communication.test.ts` it-block #2 |

---

## §6 — Rollback

Atomic per-commit rollback supported (all 6 commits):

```
# Full revert
git revert --no-commit f7f30bd 2c3ad12 989a06f 070a51b 4e14833
git commit -m "revert: Task 2.1 CalendarModule AHA inspection seed (post-B3 general-pool rollback)"
```

Partial fingerprints:
- Commit 0 only: revert `4e14833` — un-extends L121 search filter. Completely independent of Task 2.1 surface. Safe in isolation.
- Seed only: revert `070a51b` — workitems.json → 1139 rows; reverts maintenance.test.ts length bump. Task 2.1 tests in commit 3 will fail (expected length 1148). Must revert commit 3 too.
- UI only: revert `989a06f` — removes ErrorBoundary + Sentry + testids + slice bump. Commit 3 RTL it-blocks will fail (missing testids).
- Tests only: revert `2c3ad12` — restores 16-line stub; suite 139 → 131.
- Docs only: revert `f7f30bd` — plan reverts v2.5 → v2.4; CLAUDE.md reverts to pre-Task-2.1 state.

---

## §7 — Deferred

1. **Google/Apple Calendar direct-fetch rewire (Flag 3)** — 3 sites in `CalendarModule.tsx` (L89 `/api/calendar/status`, L102 `/api/calendar/events`, L148 `webcal://` ICS URL) bypass `strataGet`. Rewire requires 3 new `/calendar/*` static handlers. Standalone PR candidate. Out-of-scope for Task 2.1.
2. **Synthetic `"riverwood-club"` cleanup in Tasks 2.3 / 2.5 fixtures** — Task 2.1 uses the real Riverwood UUID `705a6f52-...` for its new rows, but Task 2.3's 9 `compliance.json` rows + `section8_rollup.json` still reference synthetic `"riverwood-club"`. Cleanup migrates both to the real UUID. Carried forward from PRs #11 / #12.
3. **Task 2.9 workitems.json writer** — per scheduling-pass §6 item #10, Task 2.9's WO 19441-1 is the next expected workitems.json writer; will append-only per the Appendix D "Task 2.1 → 2.9 sequential" resolution pattern. Task 2.1's exclusive Phase-2 ownership (Appendix D L586) doesn't block this.
4. **Task 2.10 PropertyTimeline** — now fully unblocked (its 2.1 + 2.2 dependencies both closed).
5. **CalendarModule upcoming-list sort/filter** — currently sorts by `dueDate` ascending, slices 30. If the portfolio grows beyond 30 upcoming events, a pagination affordance would be nice. Minor UX follow-up.
6. **Linux Playwright baselines** — Phase 0.0 deferred item still open.

---

## §8 — Next-task unblock

**B3 chain remains closed.** Phase-2 general pool now has **5 remaining tasks**:

- **2.4** — Forecast 50-property seed + new `/forecast` static handler.
- **2.6** — Utilities module + vendor additions.
- **2.8** — Sentiment static handlers (`/sentiment/scores`, `/sentiment/history`, `/sentiment/by-entity`) + `sentiment_scores.json`.
- **2.9** — Projects entity-grouped Kanban seed (writes WO 19441-1 to workitems.json append-only per Appendix D 2.1→2.9 sequential resolution).
- **2.10** — PropertyTimeline unified feed (reads `workitems.json` + `communications.json` — both now fully seeded).

**Task 2.10 is the biggest-leverage downstream task** — both its hard dependencies (2.1 + 2.2) are now closed. Can open immediately from `main@<Task-2.1-squash-SHA>`.

---

🧪
