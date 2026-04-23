# Phase 2 — Scheduling Pass

**Session date.** 2026-04-23
**Author.** Claude (scheduling-only session; no code written)
**Source plans.** `Docs/AppFolio_Parity_Implementation_Plan_v2.md` (§8 refinements, §19 DAG, §21 Appendix D) + `Docs/AppFolio_Parity_Implementation_Plan.md` v1.0 Phase 2 task body (§ Phase 2, lines 126–156).
**Prior phase.** Phase 1 closed 2026-04-23 at squash `6c43982`. Phase-1 Completion Report §7 lists 5 deferred items carried into Phase 2.
**HEAD for Phase 2 open.** `6c43982` (main).

🧪

---

## §0. Prerequisite before any Phase-2 task opens

**Deferred Item #4 from `Docs/Phase1_Completion_Report.md` §7 — Vite `import.meta.env` optional-chaining transform gap.** `qualia-shell/src/components/StrataDashboard/strataApi.ts:22` currently reads `(import.meta as any)?.env?.VITE_USE_STATIC_API`. Vite 6.4's dev transform does not rewrite optional-chained `import.meta?.env?.FOO` accesses, so `VITE_USE_STATIC_API=true` does not flip the app to static mode in dev.

Phase 2's §9 Verification Matrix row "Manual dev-server smoke" is `R` for Phase 2, and every Phase-2 task is expected to include a screenshot in its Phase Report. Without this fix, dev-mode smoke emits backend-unreachable 500s for modules whose static handlers we rely on. Fix is ≤5 LoC (drop the optional chaining).

**Recommendation.** Land this fix as its own micro-PR (`phase-2/pre-vite-env-fix`) **before** Task 2.x opens. Not a Phase-2 task; a Phase-1 spillover. Estimated ETA: 30 min end-to-end (edit + tsc + vitest + manual verify + PR + CI).

---

## §1. Task inventory (2.1 → 2.10)

Derived from v1.0 plan Phase 2 body + v2.0 §8 refinements. Files columns reconcile task-body intent with repo inspection (`git ls-files`), plus Appendix D ownership where declared. **⚠ flags** mark paths referenced by task intent but missing from Appendix D Phase-2 column — those are the ambiguities in §6.

| # | Title | Files touched (intent + repo-verified) | 1-line scope |
|---|---|---|---|
| 2.1 | Calendar — 9 AHA inspections | `qualia-shell/public/data/workitems.json` (exists; owned 2.1 per Appendix D) • `qualia-shell/src/components/StrataDashboard/modules/CalendarModule.tsx` (exists) | Seed 9 Riverwood Club inspection WOs dated 04/27–04/30/2026 |
| 2.2 | Communication — 10 outbound emails | `qualia-shell/public/data/communications.json` (exists; ⚠ not in Appendix D Phase-2 column) • `qualia-shell/src/components/StrataDashboard/modules/CommunicationModule.tsx` (exists) | Import 10 sanitized (`@example`) outbound email rows for LaSonta M. Westbrook |
| 2.3 | ComplianceEngine — vendor matrix + Section-8 rollup | `qualia-shell/public/data/compliance.json` (exists; owned 2.3 + 2.5 sequential) • `packages/types/index.ts` (exists, 527 lines; Appendix D: 2.3 only in Phase 2) • `qualia-shell/src/components/StrataDashboard/strataTypes.ts` (shadow) • `qualia-shell/src/components/StrataDashboard/modules/ComplianceEngine.tsx` (exists) • `qualia-shell/src/components/StrataDashboard/strataApi.static.ts` (likely new `/compliance/audit` handler body — currently `return []` at line 143) | Seed vendor × expiration grid for 2-Story Technical Roofing + 9 AHA items; wire Vendor Matrix view |
| 2.4 | Forecast — 50-property seed | `qualia-shell/public/data/properties.json` (exists; owned 2.4 + 2.10 sequential) • `qualia-shell/src/components/StrataDashboard/modules/ForecastModule.tsx` (exists; currently hits backend `/api/forecast`) • `qualia-shell/src/components/StrataDashboard/strataApi.static.ts` (⚠ new `/forecast` handler required — no `forecast` route today) | Merge 50 AppFolio properties with the 4 existing mocks (GR-3 merge-not-replace) |
| 2.5 | InsuranceModule — FolioGuard enforcement | `qualia-shell/public/data/insurance_policies.json` (exists) • `packages/types/index.ts` (⚠ Appendix D says Task 2.3 ONLY in Phase 2; 2.5 requires `enforcementStatus` enum add — see ambiguity §6.2) • `qualia-shell/src/components/StrataDashboard/strataTypes.ts` • `qualia-shell/src/components/StrataDashboard/modules/InsuranceModule.tsx` (exists) | Add `enforcementStatus: 'required'\|'not-required'\|'lapsed'\|'fulfilled'` + "Policies Requiring Action" card |
| 2.6 | Utilities — real utility vendor relationships | ⚠ **no utilities fixture exists** — Task 2.6 must create (candidate names: `utility_accounts.json` / `utilities.json`) or piggyback on `entities.json` (for Georgia Power / Duke Energy / Massey Pest vendor rows) + `vendor_associations.json` (exists) • `qualia-shell/src/components/StrataDashboard/modules/UtilitiesModule.tsx` (exists) • `qualia-shell/src/components/StrataDashboard/strataApi.static.ts` (⚠ no `/utilities` handler today — implicit scope expansion) | Seed 3 utility vendors + property relationships; filter by 128 Buena Vista returns 2 rows |
| 2.7 | AuditModule — unified activity timeline (v2.0 rescoped) | `qualia-shell/public/data/audit_log.json` (exists; static handler `/audit` already present at static.ts:112) • `qualia-shell/public/data/communication_log.json` (exists; read-only) • `qualia-shell/public/data/workitems.json` (read-only — workitem actions log) • `packages/types/index.ts` (⚠ rescope → real schema; conflict with Appendix D's "2.3 only" rule — see ambiguity §6.4) • `qualia-shell/src/components/StrataDashboard/modules/AuditModule.tsx` (exists; currently fetches `localhost:3000/api/search` at line 131 — needs rewire) | Render WO actions log + communication log as a unified activity timeline for a given entity |
| 2.8 | Sentiment — 20 at-risk tenants | `qualia-shell/public/data/entities.json` (exists; ⚠ not in Appendix D Phase-2 — possible tenant-record touch) OR new fixture `sentiment_scores.json` • `qualia-shell/src/components/StrataDashboard/modules/SentimentModule.tsx` (exists; hits backend `/api/sentiment/trends` + `/api/sentiment/response`) • `qualia-shell/src/components/StrataDashboard/strataApi.static.ts` (⚠ no `/sentiment/*` handlers today) | Mark 20 of the 3,274 captured tenants as at-risk with sample sentiment scores |
| 2.9 | Projects — entity-grouped Kanban seed | `qualia-shell/public/data/workitems.json` (⚠ **discovered conflict with Task 2.1** — Appendix D lists only 2.1 as Phase-2 owner; WO 19441-1 grep'd and is NOT present in current workitems.json, so 2.9 must write) • `qualia-shell/src/components/StrataDashboard/modules/ProjectsModule.tsx` (exists) | Reuse WO 19441-1 (Replace sheetrock, Woodland Parc 2767-3, CS Cooper) as canonical project fixture |
| 2.10 | PropertyTimeline — unified feed | `qualia-shell/public/data/properties.json` (owned 2.4 + 2.10 sequential) • reads `workitems.json` (⚠ needs 2.1 landed for 9-inspection completeness) • reads `communications.json` (⚠ needs 2.2 landed for full 49-email feed) • `qualia-shell/src/components/StrataDashboard/modules/PropertyTimeline.tsx` (exists) | Chronologically merge WO events + 19 attachments + 49 community emails for 128 Buena Vista |

**File-path reconciliation notes.**
- All ten modules and all referenced JSON fixtures named in task bodies exist in repo HEAD `6c43982`. No plan↔reality path mismatches on existing-file references.
- Four task bodies reference data surfaces the plan does not fully enumerate: forecast handler, utilities fixture+handler, sentiment handlers, audit-module rewire. These are real scope that §8 did not call out.

---

## §2. Conflict matrix (lower-triangular)

Legend: `—` = no shared file; `✓` = pre-seeded in plan §8/§21; `★` = undiscovered, flagged by this pass.

|      | 2.1 | 2.2 | 2.3 | 2.4 | 2.5 | 2.6 | 2.7 | 2.8 | 2.9 |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 2.2  | —   |     |     |     |     |     |     |     |     |
| 2.3  | —   | —   |     |     |     |     |     |     |     |
| 2.4  | —   | —   | static.ts★ |     |     |     |     |     |     |
| 2.5  | —   | —   | ✓ compliance.json + types.ts★ | static.ts★ |     |     |     |     |     |
| 2.6  | —   | —   | static.ts★ | static.ts★ | static.ts★ |     |     |     |     |
| 2.7  | wi.json (read)★ | comm.json (read)★ | types.ts★ | static.ts★ | types.ts + static.ts★ | static.ts★ |     |     |     |
| 2.8  | —   | —   | static.ts★ | static.ts★ | static.ts★ | entities.json★ + static.ts★ | static.ts★ |     |     |
| 2.9  | ★ workitems.json | —   | —   | —   | —   | —   | wi.json (read)★ | —   |     |
| 2.10 | wi.json (read)★ | comm.json (read)★ | —   | ✓ properties.json | —   | —   | —   | —   | wi.json (read)★ |

**Pre-seeded from plan (as expected, 2 total).**
1. `2.3 ∩ 2.5` — `qualia-shell/public/data/compliance.json`. Plan §8 declares sequential.
2. `2.4 ∩ 2.10` — `qualia-shell/public/data/properties.json`. Plan §8 declares sequential.

**Discovered this pass (11 total, bucketed).**

*Hard write-write conflicts (must serialize):*
3. **`2.1 ∩ 2.9` on `workitems.json`.** Task 2.9 reuses WO 19441-1; grep confirms the WO is **not** in the file today, so 2.9 is a write. Appendix D declares 2.1 as the sole Phase-2 owner. **Undeclared by plan.**
4. **`2.3 ∩ 2.5` on `packages/types/index.ts`.** Task 2.5 body adds `enforcementStatus` enum. Appendix D declares "Task 2.3 only" in Phase 2. 2.5 must either sequence after 2.3 or Appendix D must relax. **Contradiction inside plan.**
5. **`2.3 ∩ 2.7` on `packages/types/index.ts`.** Task 2.7 rescope (§8) makes it "real schema+UI," implying type add. Same contradiction vs Appendix D.
6. **`2.5 ∩ 2.7` on `packages/types/index.ts`.** Transitive. Three-way sequential: 2.3 → 2.5 → 2.7.

*Soft conflicts (rebase pattern — Appendix D pre-declares "Task 2.* rebase onto each other"):*
7. **Six-way on `qualia-shell/src/components/StrataDashboard/strataApi.static.ts`** — 2.3 (compliance/audit body), 2.4 (new `/forecast` handler), 2.6 (new `/utilities` handler), 2.7 (rewire `/audit` to serve timeline unified shape), 2.8 (new `/sentiment/*` handlers), 2.3/2.5 compliance overlap. Appendix D calls for "rebase onto each other" — workable via strict serialization.

*Implicit cross-writes on files Appendix D does not enumerate for Phase 2:*
8. **`2.6 ∩ 2.8` on `entities.json`.** 2.6 adds Georgia Power / Duke Energy / Massey Pest as utility-vendor rows; 2.8 adds `at-risk: true` to 20 tenant rows. Both are plausible writes; Appendix D Phase-2 column is silent on `entities.json`. **Plan gap.**
9. **`2.2` touches `communications.json`.** Not listed in Appendix D Phase-2 column. **Plan gap.**
10. **`2.10` reads `workitems.json` + `communications.json`** — acceptable if read-only; shape changes from 2.1/2.2 must not break 2.10's expected event-merge shape.

*Candidate new files (plan-silent; resolution needed before implementation):*
11. **Task 2.6** needs a utilities fixture that does not exist. Candidates: `utility_accounts.json` or extension of `vendor_associations.json`.
12. **Task 2.8** at-risk storage choice: augment `entities.json` tenant records (Phase-1 contaminated surface) vs new `sentiment_scores.json`. Plan silent.
13. **Task 2.7** unified timeline storage choice: virtual merge at render time (no new fixture) vs materialized `activity_timeline.json`. Plan silent.

---

## §3. Dependency DAG

`pre` = prerequisite Vite fix (§0 of this doc). Solid `→` = hard sequential (file-write conflict). Dashed `⟶` = soft rebase serialization (strataApi.static.ts).

```
pre (Vite env fix)
  │
  ├── 2.2 (Communication — communications.json)         [no outbound edges]
  │
  ├── 2.1 (Calendar — workitems.json) ───────────► 2.9 (Projects — workitems.json)
  │                                    │
  │                                    └─ shape-contract dep (read) ─► 2.10
  │
  ├── 2.3 (Compliance — types + compliance.json) ─► 2.5 (Insurance — types)
  │                                                       │
  │                                                       └─► 2.7 (AuditModule — types + module)
  │
  ├── 2.4 (Forecast — properties.json + new /forecast handler) ──► 2.10 (Timeline — properties.json)
  │
  ├── 2.6 (Utilities — new fixture + entities.json write + /utilities)
  │                                    │
  │                                    └─ entities.json collision ─► 2.8
  │
  └── 2.8 (Sentiment — entities.json OR new fixture + /sentiment/*)

strataApi.static.ts rebase train (soft-serial order recommended):
  pre ⟶ 2.3 ⟶ 2.4 ⟶ 2.6 ⟶ 2.7 ⟶ 2.8
  (rationale: types-bearing tasks first so handler bodies can reference stable types; simplest fixture tasks earliest)
```

**Strongly-connected components (by hard-conflict edges).**
- **SCC-A (types chain, serial):** {2.3, 2.5, 2.7}
- **SCC-B (workitems.json chain, serial):** {2.1, 2.9}
- **SCC-C (properties.json chain, serial):** {2.4, 2.10}
- **SCC-D (entities.json candidate chain, serial if both write to entities.json):** {2.6, 2.8}  *(contingent on ambiguity §6.5 + §6.6)*
- **Singleton:** {2.2}

---

## §4. Parallel execution bundles

Four bundles. All four can open concurrently **after** the Vite pre-fix lands. Within a bundle, tasks serialize per §3. Between bundles, no write-write conflict (subject to ambiguity resolutions in §6).

| Bundle | Member tasks | Rationale | Ready? |
|---|---|---|---|
| **B1 — Fixture-only, smallest** | `2.2` | Single JSON write, no types, no module, no new handler. Pure sanitized seed. Phase-0.0 Task 0.0.5 already proves the sanitize step. | Yes |
| **B2 — Workitems chain** | `2.1` → `2.9` | Both fixture-only. 2.1 first (9 inspection rows + Calendar render), 2.9 extends with WO 19441-1. Re-touches Workitem block — GR-1 discipline required (full vitest + snapshot on Incident/Legal/Projects/Utilities/Leasing). | Yes |
| **B3 — Types + compliance chain (schema-bearing)** | `2.3` → `2.5` → `2.7` | All three need `packages/types/index.ts`. Adds compliance matrix seed (2.3), InsurancePolicy.enforcementStatus (2.5), AuditEntry/Timeline type (2.7). Heaviest bundle — land last or in parallel with B1. | Blocked on ambiguity §6.2 resolution |
| **B4 — Properties + forecast/timeline chain** | `2.4` → `2.10` | Both touch `properties.json`. 2.4 adds 50 AppFolio properties + new `/forecast` handler; 2.10 merges timeline. Re-touches Property block — GR-1 discipline. | Ready; scope-expansion needs ack for new `/forecast` handler |
| **B5 — Utility + sentiment chain** | `2.6` → `2.8` (if both write entities.json) | If §6.5/§6.6 resolve to "keep tenant at-risk in entities.json and utility vendors in entities.json," then serial. If either moves to a new fixture, they become parallel. | Blocked on ambiguity §6.5 + §6.6 |

**Recommended execution order (lowest-risk-first).**
1. **Ship pre-fix (§0).** Unblocks every dev-mode smoke.
2. **Open B3 first** (not B1). Reason: `packages/types/index.ts` is the highest-contention file in Phase 2 (three tasks need it). Landing 2.3 first — the Appendix-D-sanctioned types owner — establishes the ownership invariant; 2.5 and 2.7 rebase onto it mechanically. Opening B3 early also fails fast if the §6.2 ambiguity forces a plan amendment.
3. **B1 in parallel with B3 tail** (B1 is independent; can ship any time).
4. **B2 after B3 lands** (B2 requires Workitem shape stability, which 2.7's schema for audit entries consumes as read-only).
5. **B4 after B3 lands** (B4's new `/forecast` handler rebases onto static.ts post-2.3).
6. **B5 last** (plan-silent on fixtures; schedule last to absorb any replan from §6).

---

## §5. First-task recommendation

**Task 2.3 — ComplianceEngine: vendor matrix seed + Section-8 rollup.**

*Justification.*
- **(a) Criticality.** HIGH leverage. Appendix D declares `packages/types/index.ts` Phase-2 owner is `Task 2.3 only`. Landing 2.3 first is the plan's own ordering invariant; any other first-task choice that touches types violates Appendix D or forces replan. 2.3 also unblocks 2.5 and 2.7 directly (three-task chain depends on it).
- **(b) Blast radius.** Moderate and bounded. Writes `compliance.json` (Phase-1 column in Appendix D is `—` — zero Phase-1 contamination), `packages/types/index.ts` (additive only, GR-1 protected, Phase-1 just proved additive type expansion is safe across all consumers), `ComplianceEngine.tsx` (new Phase-2 surface; not a Phase-1 touched module), and a small static-API body at `strataApi.static.ts:143` where `/compliance/audit` currently returns `[]`.
- **(c) Unblocks.** 2.5 (`enforcementStatus` needs a stable types file), 2.7 (unified timeline needs stable types file), plus the entire B3 bundle. Every other Phase-2 task either waits on B3 (2.5, 2.7) or is independent (2.1, 2.2, 2.4, 2.6, 2.8, 2.9, 2.10).
- **(d) Phase-1 contamination-guard discipline.** ✅ Does **not** re-touch Workitem (Task 1.4), Property (Task 1.3), or Vendor (Tasks 1.1/1.2) blocks. Compliance is a fresh Phase-2 surface. GR-1 protected modules (Incident/Legal/Projects/Utilities/Leasing) are untouched. The one small-shape type add goes through Appendix D's declared owner for Phase 2, which is the safest channel the plan provides.

**Alternative zero-risk warm-up.** If Ilya prefers a smaller opening PR before committing to the types-ownership chain, Task 2.2 (Communication — 10 sanitized outbound emails) is a single-file fixture write with zero schema and zero Phase-1 re-touch. Cost: does not unblock anything; defers the B3 chain by the length of its own PR.

---

## §6. Open ambiguities

Ten items. Same STOP-and-ack discipline as Phase 1: resolve each before the matching task opens. **Items #2, #4, #5, #6 block B3/B5 opening.** Items #7, #8, #9 are scope-positive against §8 and need explicit ack.

| # | Ambiguity | Locus | Proposed resolution (non-binding) |
|---|---|---|---|
| 1 | Plan §8 vs Appendix D scope on files not enumerated in Appendix D Phase-2 column (`communications.json`, `entities.json`, `insurance_policies.json`, `audit_log.json`, `strataTypes.ts`, all module `.tsx` files). | §21 Appendix D | Treat Appendix D as illustrative for conflict-prone files only; task-body file lists govern otherwise. Needs ack. |
| 2 | **`packages/types/index.ts` — "Task 2.3 only" is contradicted by 2.5 and 2.7 type requirements.** | §21 Appendix D row 1 vs §7 Task 2.5 + §8 Task 2.7 rescope | Amend Appendix D to read "Task 2.3 → 2.5 → 2.7 sequential" (or the full B3 serialization). **Blocks B3.** |
| 3 | Task 2.3 schema: does 2.3 itself add a new type, or is Appendix D's ownership assignment a reservation for 2.5/2.7? v1.0 task body mentions no schema change. | §7 Task 2.3 body | Define 2.3's type delta explicitly (e.g., `ComplianceRow` grid shape) or declare 2.3 touches no types and reassign ownership. |
| 4 | **Task 2.5 needs an `InsurancePolicy` type but none exists in `packages/types/index.ts`** (grep confirms absence). Is 2.5 creating the interface or extending an untyped static shape? | §7 Task 2.5 body | 2.5 creates the `InsurancePolicy` interface end-to-end with `enforcementStatus` included. Scope +1. **Blocks 2.5.** |
| 5 | **Task 2.6 utilities fixture does not exist** — no `utility_accounts.json` or similar. Plan is silent. | §7 Task 2.6 body | Create `qualia-shell/public/data/utility_accounts.json`; add route in static.ts. Scope +1. |
| 6 | **Task 2.8 at-risk storage** — augment `entities.json` tenant rows (Phase-1 contaminated surface) vs new `sentiment_scores.json`. Plan silent. | §7 Task 2.8 body | Prefer new `sentiment_scores.json` to avoid re-touching Phase-1 tenant rows; Scope +1. |
| 7 | **Task 2.4 Forecast needs a new `strataApi.static.ts` `/forecast` handler** — module currently hits backend `/api/forecast` only. §8 does not mention this. | `ForecastModule.tsx:77` | Add `/forecast` static handler body that returns 50 properties + inferred revenue. Scope +1; ack needed. |
| 8 | **Task 2.8 Sentiment needs `/sentiment/trends` + `/sentiment/response` handlers** — module hits backend only. §8 silent. | `SentimentModule.tsx:52,70,77` | Add two static handlers. Scope +1; ack needed. |
| 9 | **Task 2.7 AuditModule hits `localhost:3000/api/search` directly** (bypassing strataApi.ts routing at line 131). Timeline rescope requires either (a) rewire to `/audit` via strataApi.ts and extend the `/audit` static handler, or (b) add a new `/audit/timeline` route. | `AuditModule.tsx:131` | Rewire to go through `strataApi.ts`; extend `/audit` static handler to accept an `entity` param and merge workitem actions + communication_log. Scope +1. |
| 10 | **Task 2.9 canonical project fixture WO 19441-1 is not in `workitems.json`** — grep confirms. Plan implies 2.9 writes to workitems.json but Appendix D grants exclusive Phase-2 ownership to 2.1. | §7 Task 2.9 body vs §21 Appendix D | Amend Appendix D to "workitems.json — Task 2.1 → 2.9 sequential." 2.9 appends WO 19441-1 as append-only. **Blocks 2.9.** |

---

## §7. Hand-off

- **No code touched.** No branches, commits, or PRs on source. Working tree is clean except for this scheduling doc.
- This doc will be committed on branch `phase-2/scheduling-pass` as `docs(phase-2): scheduling pass — task inventory + conflict matrix`. **No PR** until Ilya acks §5 + resolutions on §6 blocking items (#2, #4, #5, #6, #10).
- On ack, a **separate** session opens `phase-2/pre-vite-env-fix` (§0), then Task 2.3 on its own branch per §5.
- Plan amendments (Appendix D + any scope-positive items from §6 #7, #8, #9) should be committed to `Docs/AppFolio_Parity_Implementation_Plan_v2.md` as a v2.1 changelog entry before the matching task opens.

🧪
