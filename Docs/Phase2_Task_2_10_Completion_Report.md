# Phase 2 Task 2.10 — PropertyTimeline Multi-Source Merge for 128 Buena Vista · Completion Report

**Task.** 2.10 — PropertyTimeline unified feed. Third Phase-2 general-pool task landed post-B3.

**Branch.** `feat/phase-2-task-2.10-property-timeline-bv` off `main@67768c9`.

**Commits (pre-squash, atomic, all strict-gate-green).**
1. `09613ff` — `feat(types): widen ActivityEvent.type to 6 sources + PropertyTimelineView aggregate (Task 2.10)` — GR-2 widening with full consumer grep-transparency table.
2. *(seed skipped per Option (b) — 4 BV rows currently seeded suffice)*
3. `d2af7a1` — `feat(api): /property-activity/{id} multi-source merge upgrade (Task 2.10)` — handler 9-line projection → 5-source merge with explicit provenance tags + full-init sourceBreakdown.
4. `67eba33` — `feat(ui): PropertyTimeline — ErrorBoundary + 2 Sentry breadcrumbs + 5 data-testids (Task 2.10)` — in-place retrofit, Option-α testid discipline, 2 new lucide icons for new sources.
5. `6986d9a` — `test(parity): propertyTimeline multi-source merge contract + audit_log exclusion + provenance + PII (Task 2.10)` — 9 new it-blocks (+1 over planned 8; explicitly disclosed; `?limit=` cap covers commit-3 security code).
6. `0337ea9` — `docs(plan+repo): v2.5 -> v2.6 + §9 Task 2.10 row flip + Task 2.1 SHA backfill + CLAUDE.md drift sweep`.
7. *This report + CDP render proof (commit 7).*

**Merge SHA (post-squash).** _(populated by squash-to-main on close)_
**Closure date.** 2026-04-24.

---

## Summary

Task 2.10 upgrades `/property-activity/{id}` from a workitems-only 9-line projection to a **5-source chronologically-merged feed** (workitems + communications + compliance + insurance; audit_log EXCLUDED per Task 2.7 precedent for property-scope cross-leak guard). Widens `ActivityEvent.type` union from 3 to 6 source literals (GR-2 safe — verified pre-widening via repo-wide consumer grep). Adds `PropertyTimelineView` aggregate shape. Retrofits `PropertyTimeline.tsx` with ErrorBoundary + 2 Sentry breadcrumbs + 5 data-testid anchors.

**Scope (DoR-PRE0):** Per scheduling-pass `Docs/Session_Notes/2026-04-23_phase_2_schedule.md` §6 L38 — plan doc §8 has no Task 2.10 body; scheduling-pass is sole authoritative source. Option (b) scope-gate: build against 4 currently-seeded BV rows (2 insurance + 2 communications); defer the 19+49 aspiration to Phase-3 with a test-level drift-bound `[4, 68)` assertion.

**Bonus latent-bug fixes:** Pre-Task-2.10 handler projected `type: w.type` (workitem subtype) to ActivityEvent slots that expected 'workitem' literal — every row fell through PropertyTimeline's eventIcon default (Clock icon). Also projected `date:` field when interface declared `timestamp:` — timeAgo() always rendered blank. Both fixed by the commit-3 upgrade.

**B3 chain status:** UNCHANGED — CLOSED. Task 2.10 is the **third** general-pool task landed post-B3 (Task 2.2 `b98e84c` first; Task 2.1 `67768c9` second; Task 2.10 this PR third).

---

## §1 — Scope & DoR evidence

### 15-item DoR + 4 ambiguity resolutions (all green)

- **DoR-PRE0** — Task 2.10 scope locked via scheduling-pass §6 L38 (§8 has no Task 2.10 body; §9 pending pre-PR). Branch / commit labels / report filename / §9 row all reference `2.10`.
- **DoR-PRE1** — `e4b440e9-5062-4da1-ae25-818dffab8b3b` = 128 BUENA VISTA DR N (established across Tasks 2.5 / 2.2 / 2.7 audit_timeline_index / 2.1 deferred-cleanup reference; re-confirmed in test it-block #8).
- **DoR-PRE2** — pre-loaded BV row counts (verified in CDP probe): 2 insurance + 2 communications + 0 workitems + 0 compliance + 0 audit_log = **4 total**. Gap to plan §6 L38 aspiration (68) = 64 rows — deferred to Phase-3.
- **DoR 5–15** — all read/verified; see commit-1/3/4/5/6 bodies for per-item acks.
- **Ambiguity #1 (scope):** Option (b) scope-gate + merge-handler upgrade. No new fixtures. 4 BV rows today.
- **Ambiguity #2 (attachments fixture):** CONFIRMED DOES NOT EXIST (`evidence_objects.json` 0 rows; `space_items.json` 0 rows; no `attachments.json`). NOT created per Option (b).
- **Ambiguity #3 (audit_log join):** EXCLUDED from property-scoped queries. Task 2.7 precedent at `strataApi.static.ts:244`. Security-critical — documented in §4 below + tested in it-block #5.
- **Ambiguity #4 (Task 2.4 sequential on properties.json):** Task 2.10 is READ-ONLY on `properties.json` — no sequential conflict. Test it-block #8 pins the invariant (rowcount stays at 36).

---

## §2 — Strict gate (local paste)

```
=== tsc -b ===
(clean, no output)

=== vitest ===
 Test Files  26 passed (26)
      Tests  147 passed (147)
   Start at  02:00:08
   Duration  2.71s

=== vite build (default) ===
✓ built in 5.20s

=== vite build (VITE_APPFOLIO_SEEDS=false) ===
✓ built in 5.10s

=== PII scan ===
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 47 files scanned across 2 roots, 0 leaks found (1515ms total).
```

- `tsc -b`: clean (**GR-2 widening safety verified** — 3→6 union widening with zero consumer break).
- `vitest`: **147 / 147** pass (was 139; **+8 net** = 9 new - 1 stub). Delta +1 over the planned +7 target — explicitly disclosed in commit 5 body and re-ack'd by Ilya post-commit for `?limit=` cap coverage of the commit-3 security logic.
- `vite build` default + `VITE_APPFOLIO_SEEDS=false`: both clean.
- PII scan strict scope: **47 files, 0 leaks** (count unchanged — Task 2.10 touches no fixtures).

---

## §3 — CDP render proof

**Tool.** `ws`-based CDP client against headless Chrome (`--remote-debugging-port=9223`), `VITE_USE_STATIC_API=true` dev server on `http://127.0.0.1:5173/`.

**Nav path.** sign-in (Andy) → gate passphrase → expand Property Management → Strata → click Properties module → click `128 BUENA VISTA DR N` property card → timeline panel renders.

**Guard clause (Ilya's ack literal, future-proof `>= 4` operator for Phase-3 growth):**
```js
document.querySelectorAll('[data-testid="property-timeline-event"]').length >= 4
```

**Additional inline assertion (both required sources present — commit-3 merge proof):**
```js
const events = [...document.querySelectorAll('[data-testid="property-timeline-event"]')];
const sources = new Set(events.map(el => el.getAttribute('data-source')));
// REQUIRED: sources.has('insurance') && sources.has('communication')
```

**Guard return value (captured inline per handback spec):**
```json
{
  "rowCount": 4,
  "moduleRendered": true,
  "breakdownRendered": true,
  "sources": ["communication", "insurance"],
  "hasInsurance": true,
  "hasCommunication": true,
  "pngBytes": 793641,
  "pngPath": "Docs/Baselines/phase_2_task_2_10/PropertyTimeline-BV.png"
}
```

**All guard conditions PASSED.** 4 event rows rendered (2 insurance + 2 communication per BV seed inventory), both required sources present in the `data-source` attribute Set, breakdown chip row painted, module testid present.

**Seed probe (mid-harness, pre-nav — DoR-PRE2 confirmation):**
```json
{ "bvInsurance": 2, "bvCommunications": 2, "bvCompliance": 0, "bvWorkitems": 0 }
```

Artifact: `Docs/Baselines/phase_2_task_2_10/PropertyTimeline-BV.png` (793 KB).

---

## §4 — /security-review deep pass (Task 2.10 only)

**Scope.** Only code introduced by this branch.

### Sink grep (new code only)
```
dangerouslySetInnerHTML / __html / innerHTML= / eval( / new Function /
document.write / srcdoc= / setAttribute('on / outerHTML / .html(
  → 0 hits across all new code (types widening, API handler, UI retrofit, tests, docs)
```

### Findings

| # | Category | Severity | Disposition |
|---|---|---|---|
| S-1 | **audit_log cross-property leak via property-scoped timeline** | N/A | **DEFENDED (CRITICAL).** Ambiguity #3 resolution: audit_log EXCLUDED from `/property-activity/{id}` unconditionally. audit_log rows have no `propertyId` field; including them would mix non-property system events into a property-scoped view. Task 2.7 precedent at `strataApi.static.ts:244` (Task 2.7 `/audit/unified-timeline` EXCLUDES audit_log when `propertyFilter` is set). Handler implementation has NO audit_log loadTable call. Test it-block #5 asserts `sourceBreakdown.audit === 0` (field-exists-with-value, not undefined reliance) AND no event has `type: 'audit'` — cross-checked on a second property (Woodland Parc). |
| S-2 | **Type-confusion between merged sources (e.g., a workitem masquerading as insurance)** | N/A | **DEFENDED.** Every source branch emits an EXPLICIT literal `type: 'workitem' \| 'communication' \| 'compliance' \| 'insurance'` — no computed-key access, no dynamic source propagation from input params. Test it-block #6 asserts exact-one-related-FK-per-source (compliance → relatedComplianceId only; insurance → relatedPolicyId only; etc.). Type-confusion structurally impossible. |
| S-3 | **XSS via event field rendering in PropertyTimeline.tsx** | N/A | **DEFENDED.** All ActivityEvent fields (title, description, actor, action, type, status) render as React JSX text content (auto-escape). `data-source` attribute value bound to typed literal `ActivityEventSource` union (6-member closed set), never free-text. Sink grep: 0 hits. |
| S-4 | **Unbounded `Array.slice` via user-controlled `?limit=` param** | N/A | **DEFENDED.** `Math.min(parseInt(rawLimit, 10), 500)` caps the slice at 500; default 50 when unset/NaN. Harmless on static JSON but mandatory per the multi-source-join checklist. Test it-block #7 exercises the cap. |
| S-5 | **Unsafe arithmetic on timestamps / Date.parse on untrusted input** | N/A | **DEFENDED.** Chronological sort uses `String.prototype.localeCompare` on ISO-string timestamps with a frozen-epoch fallback (`'1970-01-01T00:00:00.000Z'`). No `Date.parse`, no subtraction, no `new Date()` on untrusted data. |
| S-6 | **Property-scope bypass via computed-key access** | N/A | **DEFENDED.** Every source-branch's property filter uses strict `=== propertyId` on the row's OWN `propertyId` field. No substring match, no regex, no SQL/NoSQL, no template literal interpolation from input. Test it-block #3 asserts all events have `propertyId === BV UUID` (or null for audit_log-like rows, which are excluded). |
| S-7 | **GR-2 widening breaks a downstream exhaustive-switch consumer (silent narrowing)** | N/A | **DEFENDED.** Pre-widening grep verified only `PropertyTimeline.tsx` has a `switch(type)` consumer, and it has a `default` case at L25. No `never`-branch narrowing. All other `ev.type` hits in the repo either render as text or use unrelated type unions. Full grep table in commit 1 body. tsc -b stays clean post-widening. |
| S-8 | **Observability side-channel via Sentry breadcrumbs** | N/A | **DEFENDED.** Breadcrumb `data` fields carry only non-PII aggregate metadata (`propertyId`, `total`, `sourceBreakdown`, `source`, `sourceId`). No event bodies, titles, or descriptions in payloads. Pattern matches Task 1.5 / 2.3 / 2.5 / 2.7 / 2.2 / 2.1 precedent. Both calls try/catch-wrapped (missing DSN = silent no-op). |
| S-9 | **ErrorBoundary masking genuine runtime errors** | N/A | **Expected behavior.** Fallback is user-facing UX ("Property timeline unavailable.") and non-silent (visible glass card). Sentry breadcrumb `property.timeline.loaded` emits for ops-side diagnosis. |

**Verdict: High = 0, Medium = 0, Low = 0.**

---

## §5 — Verification matrix

| # | Claim | Evidence |
|---|---|---|
| 1 | ActivityEvent.type widened 3→6 literals; GR-2 safe | `packages/types/index.ts` L728+; commit 1 grep-transparency table; tsc -b clean |
| 2 | PropertyTimelineView aggregate shape declared | `packages/types/index.ts:764+` + barrel re-export (strataTypes.ts:79-80) |
| 3 | `/property-activity/{id}` handler upgraded to 5-source merge | `strataApi.static.ts:511-639`; commit 3 body + consumer grep table |
| 4 | sole consumer PropertyTimeline.tsx unaffected (superset return shape) | consumer grep at commit-3 time = 1 match (PropertyTimeline.tsx:60); `data?.events` read works pre-and-post |
| 5 | 5 data-testids wired | `PropertyTimeline.tsx` L70/130/166/199/245 (static grep, no conditionals) |
| 6 | 2 Sentry breadcrumbs (baseline 0) | `grep -c Sentry.addBreadcrumb` on parent: 0; on HEAD: 2; line refs L87+L178 |
| 7 | audit_log EXCLUDED from property-scoped queries (security-critical) | Handler has NO audit_log loadTable; test it-block #5 asserts on 2 properties |
| 8 | sourceBreakdown full-init all 6 keys to 0 (ack item 3) | Handler at strataApi.static.ts:616+ initializes all 6 keys; test it-block #1 + #5 verify |
| 9 | Task 2.10 READ-ONLY on properties.json (Ambiguity #4) | No `loadTable('properties')` call in upgraded handler; test it-block #8 asserts rowcount stays 36 |
| 10 | vitest 139 → 147 (+8 net; +1 disclosed) | §2 strict-gate paste; commit 5 body explicit disclosure |
| 11 | PII 47 / 0 (Task 2.10 touches no fixtures) | §2 strict-gate paste |
| 12 | CDP guard `>= 4` passed | §3 guard return value `rowCount: 4` + sources Set `{insurance, communication}` |
| 13 | Plan v2.5 → v2.6 + §9 Task 2.1 SHA backfill + Task 2.10 row ✓ | plan doc header + §9 L367-L372 + Changelog v2.6 |
| 14 | CLAUDE.md drift fixed | CLAUDE.md L9-16 (HEAD, last-green-CI, next-phase 4-item list) |
| 15 | Pending narrowed to 4 items (2.8 retained) | plan §9 pending-row + CLAUDE.md next-phase line |
| 16 | Appendix D row 1 UNTOUCHED | `grep -n "packages/types/index.ts"` L582 reads "Task 2.3 → 2.5 → 2.7 (strictly serial)" — same as PR #8 landed |
| 17 | Pre-existing latent bugs fixed | Commit 3 body documents `type: w.type` → `type: 'workitem'` fix and `date:` → `timestamp:` fix |

---

## §6 — Rollback

Atomic per-commit rollback supported (6 commits total; seed skipped):

```
# Full revert
git revert --no-commit 0337ea9 6986d9a 67eba33 d2af7a1 09613ff
git commit -m "revert: Task 2.10 PropertyTimeline multi-source merge (post-B3 general-pool rollback)"
```

Partial fingerprints:
- Types only: revert `09613ff` — narrows ActivityEvent.type back to 3 literals; removes PropertyTimelineView + ActivityEventSource. Commits 3–6 depend on these; must revert 3–6 first.
- API only: revert `d2af7a1` — restores 9-line workitems-only projection (re-introduces both latent bugs — type-subtype mismatch + date/timestamp field mismatch). Commits 4 + 5 tests will fail.
- UI only: revert `67eba33` — removes ErrorBoundary + Sentry + testids. Commit 5 RTL tests (none — this task has no RTL tests) and CDP guard fail.
- Tests only: revert `6986d9a` — restores 16-line stub; suite 147 → 139.
- Docs only: revert `0337ea9` — plan reverts v2.6 → v2.5; CLAUDE.md reverts to pre-Task-2.10 state.

---

## §7 — Deferred

1. **19+49 seed expansion (plan §6 L38 aspiration)** — Phase-3 data-completeness work. 17 new attachments (requires new `attachments.json` fixture + Appendix D row) + 47 new BV communications (touches Task 2.2's writer ownership — requires retro-amend discussion). Tracked by test drift-bound `[4, 68)` assertion.
2. **Synthetic `"riverwood-club"` cleanup in Tasks 2.3 / 2.5 fixtures** — carried forward across 5 PRs now (#11/#12/#13/#14). Task 2.10's multi-source merge would automatically pick up real-UUID compliance rows once the migration lands.
3. **attachments fixture creation** — `evidence_objects.json` + `space_items.json` both exist as 0-row files today. If Phase-3 creates an attachments fixture, the Task 2.10 handler can easily extend to a 6th source branch (pattern established).
4. **Task 2.4 forecast seed (pending)** — will land next and write to properties.json; Appendix D 2.4 + 2.10 sequential constraint is satisfied (Task 2.10 was read-only; Task 2.4 is next in line).
5. **Linux Playwright baselines** — Phase 0.0 deferred item, still open.
6. **CalendarModule Google/Apple Calendar direct-fetch rewire** — Task 2.1 deferred follow-up PR candidate still open.
7. **CommunicationModule preview-field search fix** — RESOLVED in Task 2.1 commit 0 (`4e14833`) on PR #13; no longer deferred.

---

## §8 — Next-task unblock

**B3 chain remains closed.** Phase-2 general pool now has **4 remaining tasks**:

- **2.4** — Forecast 50-property seed + new `/forecast` static handler. **Task 2.10 is READ-ONLY on properties.json**, so Task 2.4 can proceed without re-ordering concerns.
- **2.6** — Utilities module + vendor additions.
- **2.8** — Sentiment static handlers (`/sentiment/scores`, `/sentiment/history`, `/sentiment/by-entity`) + `sentiment_scores.json`.
- **2.9** — Projects entity-grouped Kanban seed (writes WO 19441-1 to workitems.json append-only per Appendix D 2.1→2.9 sequential resolution; Task 2.1 closed, so 2.9 is unblocked).

No downstream task depends on Task 2.10 specifically — it's a leaf task. Ordering among the remaining 4 is now flexible. Task 2.4 is the most-blocked-by-plan task (Task 2.10 was downstream of it but has landed with read-only discipline; if Task 2.4 lands next it may need to adjust any Task-2.10 test that ran against an unchanged 36-row properties.json — the test it-block #8 will flag this as a scope check).

---

🧪
