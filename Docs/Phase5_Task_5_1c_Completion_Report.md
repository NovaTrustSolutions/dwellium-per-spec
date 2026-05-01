# Phase 5 — Task 5.1c Completion Report

**Task.** API version bump (Phase-5 THIRD task; sequential per §19 dependency graph L596 `5.1b → 5.1c`; **NEW CONSUMER-SIDE-FETCH-WRAPPER PRE2 calibration class — first data point** of genuinely new in-repo class; **first runtime-code touch in Phase-5**; **first chunk drift since Phase-3 closed**; **9-of-9 SHA256 invariance streak BROKE at 9 as predicted**; **NEW dual-axis calibration finding — byte-count invariance preserved at 1,031,260 — reframes streak tracking as TWO separate axes going forward**).

**Squash SHA.** `8e4fcc2` (PR #36). Closed 2026-04-30.

**Source.** `qualia-shell/src/components/StrataDashboard/strataApi.backend.ts` L26 + L63 (+2 lines `headers['X-Qualia-API'] = 'v2'`) + `qualia-shell/.env.example` (+8 lines defining `VITE_PARITY_LIVE_BACKEND=false`) + `qualia-shell/src/test/strataApi.test.ts` (+37 lines: `strataUpload` import addition + 2 NEW it-blocks asserting X-Qualia-API: v2 header presence). Per Plan v2 §8 L322 verbatim deliverable: *"Bump the API version header `X-Qualia-API: v2`. Old clients continue to get the v1 shape with new fields omitted. Backward-compat contract."* Spec-mandate "Bump the API version header" satisfied via Path A unconditional emission on both `request()` + `strataUpload()` pathways.

**Plan v2 anchor.** Plan v2.28 (Changelog `v2.28 (2026-04-30)` entry — added at post-merge sweep).

---

## §1. Scope + DoR + 10-DC ledger (10 enumerated → 10 actuals; clean DC-A flip; ZERO emergent post-DC) + scope-narrowing context

### Scope-narrowing context (kickoff predicted 4 path forks → DC-A confirmed CONSUMER-SIDE-FETCH-WRAPPER cleanly; Path A vs B/C choice resolved at PRE0)

Kickoff prompt scoped Task 5.1c across four path forks based on header-locus discovery archeology:

| Fork | Scope | Predicted drift | ETA |
|---|---|---|---|
| **CONSUMER-SIDE-FETCH-WRAPPER** | Add `'X-Qualia-API': 'v2'` to headers objects + flag-gating logic + transport tests | small chunk drift (50-300 bytes); **STREAK-BREAK CANDIDATE** | 30-45 min |
| NEAR-NULL-OP-adjacent (6th SCOPE-COLLISION catch) | Documentation comment refresh if header is server-side concern + consumer doesn't send anything new | +0 / 0 kB | 15-25 min |
| NEAR-NULL-OP-adjacent (existing infrastructure already wired) | Documentation if X-Qualia-API or VITE_PARITY_LIVE_BACKEND already exists | +0 / 0 kB | 15-20 min |
| CROSS-REPO-DEFER + IN-REPO-DOCS-ONLY | R-4 amendment update + 1-line strataApi.backend.ts comment | +0 / 0 kB | 25-30 min |

PRE0 DC-A 5-query header-locus discovery confirmed CONSUMER-SIDE-FETCH-WRAPPER cleanly:

- (a) Headers objects in strataApi.backend.ts: 2 sites (L25 in `request()` + L61 in `strataUpload()`) — both currently set Authorization + Content-Type, NEITHER sets X-Qualia-API
- (b) Existing VITE_* flags: VITE_APPFOLIO_SEEDS (Phase-4 era) + VITE_API_BASE_URL (placeholder); X-Qualia-API + VITE_PARITY_LIVE_BACKEND have ZERO existing references (third reconfirmation after 5.1a DC-D + 5.1b DC-A)
- (c) Existing header-test pattern at strataApi.test.ts:60/102/168 establishes precedent shape: `expect(callArgs[1].headers['NAME']).toBe('value')`
- (d) Full strataApi.backend.ts inspected — 93 lines; 2 headers-construction sites; type-agnostic generic infrastructure preserved
- (e) Pre-edit chunk SHA256 = `66c743092b62f825cebefdb81bd3c852f8a7dfa47aa007329d7aebb3814f3461` (9-of-9 streak intact)

User-confirmed **Path A** (unconditional emission + flag-defined-but-unused) — spec-verbatim simplest interpretation; Path B (flag-gated default-false) and Path C (flag-gated default-true) rejected as over-engineering. Spec L322 says "Bump the API version header"; flag-gating would over-engineer per §7 entry 3.

### Scope (per v1 plan L218 + Plan §8 L322 + v2.28 §9 row 5.1c, CONSUMER-SIDE-FETCH-WRAPPER Path A)

**Calibration class:** **CONSUMER-SIDE-FETCH-WRAPPER — first data point of genuinely new in-repo class** (structurally distinct from prior 5 in-repo classes — Phase-4's pure FIXTURE-CLASS / FIXTURE-CLASS+SCHEMA hybrid / NEAR-NULL-OP + Phase-5's NEAR-NULL-OP carry-over + 5.1b's CONSUMER-SIDE-CONTRACT-TEST). FIRST runtime-code touch in Phase-5; FIRST chunk drift since Phase-3 closed. **STREAK BREAK at 9-of-9 SHA256 invariance** (PREDICTED outcome): chunk hash `D37sEP_1.js / 66c743…3461` → `COZxJ8Bh.js / 1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea` (filename rotated per Vite content-hash derivation). **NEW CALIBRATION FINDING — dual-axis invariance reframe**: byte-count INVARIANT preserved at 1,031,260 bytes across pre-edit + post-edit + both build modes (=true and =false both produce identical NEW SHA `1ab4a9c…14ea`). Vitest 229 → 231 (+2; second non-zero Phase-5 delta).

| ID | Deliverable | Status |
|---|---|:-:|
| D-1 | EDIT `qualia-shell/src/components/StrataDashboard/strataApi.backend.ts` L26 + L63: add `headers['X-Qualia-API'] = 'v2'` to BOTH headers objects unconditionally per Path A spec-verbatim; mirrors Task 3.8 strataUpload<T> shape-contract precedent | ✅ |
| D-2 | EDIT `qualia-shell/.env.example`: +8 lines defining `VITE_PARITY_LIVE_BACKEND=false` with comment block mirroring `VITE_APPFOLIO_SEEDS` byte-shape; reserved for Phase-5 Task 5.3-5.5 E2E + 5.7 a11y validation flips; not currently consumed at runtime | ✅ |
| D-3 | EDIT `qualia-shell/src/test/strataApi.test.ts`: +37 lines (`strataUpload` added to declared imports + `beforeEach` assignments; 2 NEW it-blocks asserting X-Qualia-API: v2 header presence on `request()` + `strataUpload()` pathways; mirrors existing Authorization Bearer test pattern at L60/102/168) | ✅ |
| D-4 | NO source changes to: `packages/types/index.ts` / `strataApi.static.ts` / `strataApi.ts` router / fixtures / other test files | ✅ |
| D-5 | NO existing-test invariant relaxations | ✅ |
| D-6 | Phase-5 third-task 4-file sweep at post-merge (CLAUDE.md + Plan v2.28 + this report + Appendix D row updates; NO Phase-5 closure file yet — closure deferred to Task 5.7 sweep per single-closure-per-phase precedent) | ✅ (sweep) |

### 10-DC enumeration → 10 actuals (clean; ZERO emergent post-DC)

| # | DC | Finding | Action |
|---|---|---|:--|
| 1 | DC-A scope-class (Step Zero per Lesson 1) | (a) Headers objects: 2 sites in strataApi.backend.ts (L25 + L61); (b) VITE_* flags: VITE_APPFOLIO_SEEDS + VITE_API_BASE_URL only; X-Qualia-API + VITE_PARITY_LIVE_BACKEND ZERO refs; (c) Header-test pattern established at L60/102/168; (d) strataApi.backend.ts type-agnostic generic infrastructure preserved; (e) Pre-edit SHA `66c743…3461` (9-of-9 streak intact) | **CONSUMER-SIDE-FETCH-WRAPPER confirmed**; §7 entry 3: Path A spec-verbatim |
| 2 | DC-B VITE_* flag pattern surface | Existing 2 vars (VITE_APPFOLIO_SEEDS + VITE_API_BASE_URL); 14 lines total; comment-block precedent established by VITE_APPFOLIO_SEEDS section header + 4-line description format | New VITE_PARITY_LIVE_BACKEND mirrors this byte-shape (acted; D-2) |
| 3 | DC-C existing header-test pattern | 3 assertions at strataApi.test.ts:60/102/168 use `expect(callArgs[1].headers['NAME']).toBe('value')` pattern | New X-Qualia-API tests mirror this byte-shape exactly (acted; D-3) |
| 4 | DC-D test-file regex scan (Lesson 2) | New identifiers `'X-Qualia-API'`, `'v2'`, `'VITE_PARITY_LIVE_BACKEND'` — none match pre-existing PII guard regexes (no digit-runs, no UUID-like patterns) | No regex collision risk for 5.1c (acted; verified) |
| 5 | DC-E Task 3.8 strataUpload archeology (Lesson 3) | Task 3.8 (`b4b7c9a`, 2026-04-25) added strataUpload<T> for multipart/form-data ONLY — purely transport-layer; NO header touch in 3.8. Pre-existing `JSON.stringify(body)` at L37 has been there since subtree-add (`610c222`, pre-project). 5.1c is FIRST task to add a new header to BOTH pathways | 5.1c extends 3.8 transport-layer shape-contract precedent (acted; both headers objects updated) |
| 6 | DC-F pre-edit chunk SHA256 baseline (Lesson 4) | `qualia-shell/dist/assets/StrataDashboard-D37sEP_1.js` SHA `66c743092b62f825cebefdb81bd3c852f8a7dfa47aa007329d7aebb3814f3461` (9-of-9 streak intact); both build modes byte-identical | Baseline captured (acted); predicted post-edit SHA differs → 9-of-9 streak BREAKS at 9 |
| 7 | DC-G GR-5 spirit-preserving verification | strataApi.backend.ts last touched 2026-04-25 by Task 3.8 (shape-contract addition only). 5.1c adds a transport-layer header (X-Qualia-API: v2) — NOT an endpoint addition / NOT request-shape change / NOT response-handling change. Header is TRANSPORT-LAYER concern, not BUSINESS-LOGIC. | GR-5 spirit preserved (acted; mirrors Task 3.8 strataUpload precedent) |
| 8 | DC-H GR-1 backward compat | Phase-1/2/4 schema additions are ALL additive-optional (`field?: T`) — already backward-compat. Server backward-compat: spec L322 "Old clients continue to get v1 shape" — server returns v1 if header absent; v2 if present. No regression risk since header is purely consumer-side opt-in (acted as unconditional, but absent header = v1 fallback by server). | GR-1 invariant intact (acted) |
| 9 | DC-I §9 sub-tracker state pre-edit | Post-Task-5.1b sweep state confirmed: row 5.1a = ✓ at squash SHA `fdb1436`; row 5.1b = ✓ at squash SHA `15e3058`; row 5.1c = R; rows 5.1d-5.7 = R; pending row narrows from 8 to 7 at this commit | State matches (acted) |
| 10 | DC-J R-4 amendment carry-forward | v2.26 R-4 amendment with cross-repo backend nuance is in place. 5.1c's IN-REPO partition: consumer-side X-Qualia-API header sending + VITE_PARITY_LIVE_BACKEND flag definition + transport-layer tests. OUT-OF-REPO: server-side v1/v2 routing logic + server-side handling of "old client without header → v1 shape" backward-compat contract | **REFERENCE without extension** (no R-4 update needed at v2.28; acted) |

(ZERO emergent post-DC actions — third consecutive Phase-5 task to close with all DCs hitting on first-pass enumeration. The DC-pre-flight Step Zero discipline is now demonstrably reliable across CONSUMER-SIDE class variants — 5.1a NEAR-NULL-OP / 5.1b CONSUMER-SIDE-CONTRACT-TEST / 5.1c CONSUMER-SIDE-FETCH-WRAPPER all closed without scope drift after PRE0.)

### DoR (Definition of Ready) — verbatim

- ✅ Scope-class confirmed via DC-A (CONSUMER-SIDE-FETCH-WRAPPER; Path A unconditional emission)
- ✅ GR-checks: GR-1 backward compat preserved per spec design (server returns v1 when consumer omits header) / GR-2 no schema change (canonical surface unchanged) / GR-5 shape-contract not endpoint-logic (mirrors Task 3.8 strataUpload precedent — transport-layer addition, not business-logic) / GR-7 strict (no PII; header value `'v2'` is non-sensitive constant)
- ✅ Test surface: vitest 229 → 231 (+2 NEW it-blocks in `strataApi.test.ts`); ZERO existing-test invariant relaxations
- ✅ Module-graph drift: PREDICTED 30-100 bytes (streak-break candidate); pre-edit SHA `66c743…3461` captured
- ✅ Plan v2 surgery: §9 row 5.1c R → ✓ + Changelog v2.28 + Appendix D row updates for `strataApi.backend.ts` + `.env.example` + NEW `strataApi.test.ts`; R-4 amendment REFERENCED (no update)
- ✅ Test design: 2 NEW it-blocks mirroring existing strataApi.test.ts:60/102/168 byte-shape (Authorization Bearer pattern)

---

## §2. Strict-gate output (captured pre-merge on PR-branch HEAD `c2592f9`)

```
2026-05-01T02:18:10Z
$ cd qualia-shell && npx tsc -b
[exit: 0 — zero output]

2026-05-01T02:18:10Z
$ npx vitest run

 Test Files  36 passed (36)
      Tests  231 passed (231)
   Start at  02:18:10
   Duration  4.63s

[exit: 0]

2026-05-01T02:19:00Z
$ npx vite build
dist/assets/StrataDashboard-COZxJ8Bh.js      1,031.26 kB │ gzip: 246.76 kB
✓ built in 5.73s
[exit: 0]

$ shasum -a 256 dist/assets/StrataDashboard-*.js
1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea  dist/assets/StrataDashboard-COZxJ8Bh.js

2026-05-01T02:19:30Z
$ VITE_APPFOLIO_SEEDS=false npx vite build --outDir dist-external
dist-external/assets/StrataDashboard-COZxJ8Bh.js      1,031.26 kB │ gzip: 246.76 kB
✓ built in 5.34s
[exit: 0]

$ shasum -a 256 dist-external/assets/StrataDashboard-*.js
1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea  dist-external/assets/StrataDashboard-COZxJ8Bh.js

2026-05-01T02:20:00Z
$ node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1583ms total).
[exit: 0]
```

**CI runs:**
- PR-branch `AppFolio Parity Gate` run `25204910631` on commit `c2592f9` — conclusion **success** (auto-fired on `pull_request` trigger; `qualia-shell/src/**` IS in parity-gate paths filter; both vite build modes succeeded byte-identical at NEW chunk SHA `1ab4a9c…14ea`; chunk filename rotated `D37sEP_1` → `COZxJ8Bh` per Vite content-hash derivation; PII strict-clean; vitest 231/231 passing) — https://github.com/NovaTrustSolutions/dwellium-per-spec/actions/runs/25204910631
- PR-branch `PII Scan` run `25204910627` on commit `c2592f9` — conclusion **success** (auto-fired on `pull_request` trigger)

**Notable: extends Task 5.1a + 5.1b precedent** that PR-branch `pull_request` triggers fire reliably on this repo; the push-trigger drift quirk is specific to direct-to-main push events on sweep HEADs.

**STREAK-BREAK + dual-axis calibration evidence:**
- **SHA256 invariance axis BROKEN at 9**: pre-edit chunk SHA `66c743092b62f825cebefdb81bd3c852f8a7dfa47aa007329d7aebb3814f3461` → post-edit chunk SHA `1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea` (completely different; first chunk content drift since Phase-3 closed)
- **Byte-count invariance axis STILL INTACT at 10-of-10 across phases**: pre-edit chunk byte-count = 1,031,260 → post-edit chunk byte-count = 1,031,260 (UNCHANGED across pre-edit + post-edit + both build modes)
- **Filename rotation**: `StrataDashboard-D37sEP_1.js` → `StrataDashboard-COZxJ8Bh.js` (Vite content-hash filename derivation; expected behavior when chunk content changes)
- **Intra-task cross-mode invariance preserved**: =true and =false builds both produce identical NEW SHA `1ab4a9c…14ea` (X-Qualia-API addition is unconditional; both modes ship same chunk content)

The dual-axis finding is structurally significant: 2-line source addition (~52 raw bytes for `headers['X-Qualia-API'] = 'v2';` × 2 sites) produced a **completely different SHA256** but the **same chunk byte count**. Vite/Rollup minification + tree-shaking + chunk-padding alignment absorbed the addition into identical chunk size while changing internal content. Implication for calibration model: the prior single-axis "byte-identical SHA256 streak" tracking should be reframed as TWO separate axes going forward — SHA256 axis is informative for content drift detection (broken at 9); byte-count axis is harder to preserve and more informative for code-graph cardinality (intact at 10-of-10).

---

## §3. CDP render proof

**No CDP probe required for Task 5.1c.** Verification surface entirely fetch-side / build-side: chunk SHA256 + byte-count capture across both build modes (`VITE_APPFOLIO_SEEDS={true,false}`); vitest pass count 231/231 confirms +2 NEW it-blocks land cleanly with X-Qualia-API: v2 header presence assertions on both pathways. The header-emission change lives in the transport-layer wrapper (`request()` + `strataUpload()`) and is verified at unit-test level via fetch mocking; no DOM-render surface to probe.

**Cross-phase regression-clean evidence preserved at this commit** — all 7 Phase-4 task absorptions + Tasks 5.1a + 5.1b verified intact post-Task-5.1c-merge:
- Task 4.1: properties.json 37 rows ✅ (no fixture changes in 5.1c)
- Task 4.2: entities.json 3562 rows ✅
- Task 4.3: 2-STORY bridge intact ✅
- Task 4.4: workitems.json 1165 rows ✅
- Task 4.5: Jamel D. Brown lease at status='pending_countersign' ✅
- Task 4.6: compliance.json 16 rows + Duke Energy warranty ✅
- Task 4.7: .env.example L8 comment intact ✅
- Task 5.1a: strataTypes.ts JSDoc header refresh intact ✅
- Task 5.1b: serialization.test.ts (366 lines / 5 it-blocks) intact ✅
- Task 5.1c: strataApi.backend.ts +2 lines (X-Qualia-API: v2 on both headers objects) ✅ + .env.example +8 lines (VITE_PARITY_LIVE_BACKEND=false) ✅ + strataApi.test.ts +37 lines (2 NEW it-blocks) ✅; chunk hash rotated; byte-count invariant preserved ✅

No Phase-5-task-5-1c baseline screenshot directory created (`Docs/Baselines/phase_5_task_5_1c/` would be empty — no UI surface to capture for header-emission change with no source/fixture/schema changes).

---

## §4. /security-review

**Result.** High=0, Medium=0. Task 5.1c's surface is a 2-line transport-layer header addition (`headers['X-Qualia-API'] = 'v2'` on both headers objects in `strataApi.backend.ts`) + 1 new VITE_* flag definition in `.env.example` (defined-but-unused) + 2 NEW transport-layer test it-blocks. No new code paths in production code beyond the header emission. No new data exposed (header value `'v2'` is a non-sensitive version constant). No new dependencies. No schema changes. No fixture changes. The header is emitted unconditionally on every fetch but provides no new attack surface (it's a consumer-side declaration of API version awareness, not a credential or secret). GR-5 (real-backend logic unchanged) preserved by construction (header is transport-layer addition, not endpoint-logic; mirrors Task 3.8 strataUpload precedent). GR-7 (PII discipline) preserved by construction — synthetic test fixture identifiers in the 2 new it-blocks use slug-namespace pattern (per Task 4.6 §7 entry 4 + 5.1b §7 entry 1 carry-forward); header value `'v2'` does not trigger PII guard regexes.

---

## §5. Verification matrix snapshot (Phase-5 THIRD task; column header remains `R` until Task 5.7 closure)

Per Plan v2.28 §9 main matrix, Phase-5 column **remains `R`** (Phase-5 column header flips `R` → `✓` only at Task 5.7 closure per single-closure-per-phase precedent). Task 5.1c per-row proofs — Phase-5 sub-tracker row 5.1c flipped `R` → `✓` at this commit:

| Row | Task 5.1c cell | Proof |
|---|:-:|---|
| `tsc -b` errors =0 | ✓ | §2 (exit 0) |
| `vitest run` failures ≤B | ✓ | §2 (231/231 passed; +2 vs Task 5.1b baseline 229) |
| `vitest run` new-test count ≥ tasks-in-phase | ✓ (cumulative tracking) | +2 it-blocks at 5.1c; cumulative Phase-5 new-test count = 0 (5.1a) + 5 (5.1b) + 2 (5.1c) = 7; mandate satisfied progressively |
| `playwright test` failures ≤B | ✓ | `continue-on-error: true` per CLAUDE.md L29 (Linux snapshot capture deferred — same caveat as Phase 1 + Phase 3 + Phase 4) |
| `vite build` errors =0 | ✓ | §2 (built in 5.73s; chunk SHA `1ab4a9c…14ea` NEW; chunk byte-count 1,031,260 unchanged) |
| `VITE_APPFOLIO_SEEDS=false vite build` functional | ✓ | §2 (built in 5.34s; chunk SHA byte-identical to =true build; chunk byte-count unchanged) |
| PII-leak scan passes | ✓ | §2 (51 files / 0 leaks total; X-Qualia-API + 'v2' + VITE_PARITY_LIVE_BACKEND identifiers don't trigger PII guard regexes) |
| Manual dev-server smoke | (n/a) | No UI surface for transport-layer header addition; chunk byte-count invariance + vitest pass count confirm no runtime regression possible |
| Screenshots in phase report | (n/a) | No UI surface; §3 explains rationale |
| axe-core violations ≤B on modified pages | ✓ | Phase 0.0 baselines hold (no new render-layer changes; transport-layer header addition has zero UI surface) |
| Lighthouse LCP ≤ max(B, 500ms) | ✓ | Phase 0.0 baselines hold (chunk byte-count unchanged; perf delta is byte-count-bounded → 0; SHA256-only drift is content-organization, not byte-volume) |
| Pasted command output in PR | ✓ | PR #36 description + §2 of this report |
| Rollback SHA documented | ✓ | §6 |
| /security-review clean (High/Medium) | ✓ | §4 |
| CI green on branch | ✓ | PR-branch parity-gate `25204910631` + PII Scan `25204910627` both success on `c2592f9` |
| Completion Report committed | ✓ | This report at sweep |

---

## §6. Rollback SHA

**Pre-task baseline (Task 5.1b sweep HEAD):** `4e0dd65` (`chore(phase-5): post-Task-5.1b sweep — CLAUDE.md + plan v2.27 + Phase5_Task_5_1b_Completion_Report.md + Appendix D row (CONSUMER-SIDE-CONTRACT-TEST class first data point + 9-of-9 cross-phase SHA256 streak + 5 §7 entries)`).

**Task 5.1c squash SHA:** `8e4fcc2` (`feat(phase-5): Task 5.1c — API version bump (CONSUMER-SIDE-FETCH-WRAPPER class first data point; X-Qualia-API: v2 header on request() + strataUpload(); VITE_PARITY_LIVE_BACKEND flag defined for future use; predicted streak-break at 9-of-9 SHA256 invariance) (#36)`).

**Rollback procedure (if Phase-5+ surfaces a regression attributable to Task 5.1c):** `git revert 8e4fcc2` cleanly removes the 3-file edit. Rollback considerations: (a) reverting restores chunk SHA to `66c743…3461` and filename to `D37sEP_1.js` (chunk content reverts cleanly since Vite re-derives content-hash on rebuild); (b) consumer-side X-Qualia-API: v2 emission stops; server defaults to v1 shape (per spec L322 backward-compat contract); (c) `VITE_PARITY_LIVE_BACKEND` flag definition removed from `.env.example` — any future Phase-5 task that planned to consume it would need to redefine; (d) 2 NEW it-blocks removed from `strataApi.test.ts`, vitest count drops from 231 back to 229. Zero downstream breaking impact since the change is purely additive and the spec's backward-compat fallback (server returns v1 when header absent) handles consumer-side reversal cleanly.

---

## §7. Deferred items (5 entries)

1. **Byte-count vs SHA256 invariance dual-axis calibration finding — NEW structural Vite/Rollup property.** Task 5.1c's 2-line `strataApi.backend.ts` source addition (`headers['X-Qualia-API'] = 'v2';` × 2 sites; ~52 raw bytes) produced a **completely different chunk SHA256** but **identical chunk byte count** (1,031,260 → 1,031,260). Vite/Rollup minification + tree-shaking + chunk-padding alignment absorbed the addition into identical chunk size while changing internal content. **Implication for the calibration model going forward:** the prior single-axis "byte-identical SHA256 streak" tracking should be reframed as TWO separate axes. (1) **SHA256 invariance axis**: broken at 9 with Task 5.1c first runtime-code emit data point; informative for content drift detection (any change to source code that survives tree-shaking will produce SHA256 drift even if byte-count doesn't). (2) **Byte-count invariance axis**: still intact at 10-of-10 across phases; preserved across test edits / comments / fixtures / schema-only edits / runtime-code emit; harder to preserve and more informative for code-graph cardinality after minification absorbs identifier-level changes. **Carry-forward for future Phase-5/6+ tasks:** track BOTH axes in §9 sub-tracker pending-row narrative + per-task completion reports; SHA256 axis is automatically tracked via `shasum -a 256` capture; byte-count axis tracked via `ls -la` byte size or build output report. Predicted byte-count-axis break-points: 5.2 MSW infrastructure addition (if MSW imports enter production chunk; package.json dependency add could push bundle size up) / 5.3-5.5 Playwright e2e specs (run separately from unit tests; production chunk byte-count likely still invariant) / 5.6-5.7 measurement (production chunk byte-count-invariant by construction since tasks are pure measurement, no source edits).

2. **VITE_PARITY_LIVE_BACKEND defined-but-unused convention — flag introduced at this task for future Phase-5 task consumption; not currently read at runtime.** Task 5.1c introduces `VITE_PARITY_LIVE_BACKEND=false` in `.env.example` per kickoff spec mention but does not consume it at runtime. The flag is defined for future Phase-5 task consumption (5.3-5.5 E2E flips, 5.7 a11y validation runs). **Document the deferred-use convention so future tasks know to flip the flag rather than introduce a new one.** Convention: when a Phase-5 task needs to gate live-backend wiring (vs the existing `VITE_USE_STATIC_API` static-vs-backend gate), it should READ `import.meta.env.VITE_PARITY_LIVE_BACKEND` rather than introduce a new flag. The flag is currently `false` by default; future E2E test envs should set it to `true` to enable live-backend assertions. **Carry-forward for 5.3-5.5/5.7 kickoffs:** include DC-pre-flight check for VITE_PARITY_LIVE_BACKEND consumer-side reads in test/CI configuration files; document the defined-but-unused convention in the task's PRE-FLIGHT acks.

3. **Path A spec-verbatim header emission rationale — rejected B/C flag-gating as over-engineering.** Spec L322 says "Bump the API version header `X-Qualia-API: v2`. Old clients continue to get v1 shape with new fields omitted. Backward-compat contract." The "old clients continue to get v1 shape" framing tells us the SERVER routes by header presence; CONSUMER unconditionally emits v2 (signaling it's a v2-aware client by virtue of using the canonical types). Path B (flag-gated default-false) and Path C (flag-gated default-true) were rejected because: (a) spec doesn't require flag-gating; (b) flag-gating adds complexity for no benefit (server-side routing already handles "header absent → v1 shape"); (c) Path A's unconditional emission is the simplest interpretation and matches the spec verbatim. **Capture for future spec-interpretation precedent:** when spec text uses imperative verbs ("Bump", "Add", "Set") without mentioning flag-gating or conditional logic, default to unconditional implementation; flag-gating should only be introduced when spec explicitly calls for it OR when there's a backward-compat risk that requires opt-in rollout. This precedent applies to future Phase-5/Phase-6+ tasks when spec text is similarly direct.

4. **Task 3.8 strataUpload<T> precedent applied — header addition mirrors strataUpload<T> shape-contract addition pattern (transport-layer, not endpoint-logic; GR-5 spirit-preserving).** Task 3.8 (Phase-3 era; PR #20; squash SHA `b4b7c9a`; 2026-04-25) added `strataUpload<T>` to `strataApi.backend.ts` for multipart/form-data upload — purely transport-layer addition (HTTP method wrapper for FormData bodies; no business-logic; no endpoint addition; GR-5 spirit-preserving). Task 5.1c extends this precedent: header addition (`X-Qualia-API: v2`) is also transport-layer (HTTP header propagation), not endpoint-logic (no new routes, no request-body transformation, no response-handling change). **Confirms 3.8 era set the precedent for non-trivial transport-layer edits in Phase-5+.** Future Phase-5/Phase-6+ tasks that need to add headers, query parameters, or other transport-layer concerns to `strataApi.backend.ts` can follow this dual precedent (3.8 strataUpload<T> + 5.1c X-Qualia-API: v2). The pattern is: edit BOTH headers objects (L25-area `request()` + L61-area `strataUpload()`) when the addition should propagate across all pathways; edit ONLY one if the addition is pathway-specific (e.g., Content-Type only on `request()` because `strataUpload()` lets browser auto-detect multipart boundary).

5. **Server-side v1/v2 routing remains out-of-repo per R-4 v2.26 amendment.** Consumer declares v2 unconditionally via `X-Qualia-API: v2` header; server interprets header presence to switch response shape (header absent → v1 shape with new fields omitted; header present → v2 shape with new fields included). The server-side routing logic is OUT-OF-REPO per R-4 v2.26 amendment (no server/api/backend/services directories at depth ≤ 4 in this repo). **Cross-repo PR (when reachable) should implement server-side routing logic.** Carry-forward for future cross-repo coordination: (a) document the X-Qualia-API: v2 header expectation in the server-side codebase's API documentation; (b) implement server-side request middleware that reads `X-Qualia-API` header and switches response shape accordingly; (c) ensure backward-compat fallback handles both legacy clients (no header) and new clients (header=v1, header=v2, future header=v3); (d) coordinate with Task 5.1d (migration script) to ensure DB columns supporting v2 fields are added forward-only; (e) coordinate with Task 5.2 (contract tests) to assert v1/v2 round-trip behavior on the server side.

---

## §8. Next-task unblock

**Phase 5 THIRD task closed** at this commit (squash SHA `8e4fcc2`). 3 of 10 Phase-5 task rows in §9 sub-tracker now `✓` (5.1a + 5.1b + 5.1c); Phase-5 sub-tracker pending row narrows 8 → **7** (`5.1d, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7`).

**Recommended next: Task 5.1d — Migration script** (sequential per Plan v2 §19 dependency graph L596: `5.1c → 5.1d`). Per Plan v2 §8 L323 verbatim: *"Any DB column additions go here. Forward-only, no destructive changes. Down-migration lives in a separate file but is not run in Phase 5."*

**5.1d kickoff DC-A pre-flight predictions** (per R-4 v2.26 cross-repo backend nuance + Task 5.1c §7 entry 5 carry-forward):
- DB column additions + forward-only migration scripts likely live with the **server out-of-repo** (no `migrations/` or `db/` directory in this repo expected per established cross-repo pattern)
- In-repo deliverable predictions:
  - **NEAR-NULL-OP** (6th absolute SCOPE-COLLISION catch — extends NEAR-NULL-OP carry-over class to 3 data points: 4.7 + 5.1a + 5.1d; documentation-only closeout) — most likely path if no in-repo DB tooling exists
  - **CROSS-REPO-DEFER + IN-REPO-DOCS-ONLY** (R-4 amendment extension; document the out-of-repo migration-script handoff convention) — alternative path if DC-A reveals in-repo DB shape coupling that requires flagging
- Likely scope-class outcome: NEAR-NULL-OP + R-4 amendment REFERENCE (no extension); 1-line documentation comment OR brief deferred-use convention note in Plan v2.29

**5.1d kickoff DC-A 5-query discovery should target:**
- (a) Existence of `migrations/` or `db/` directory in repo (likely 0 hits per established cross-repo backend pattern)
- (b) Existence of any Knex/Prisma/sqlx/etc. migration tooling in `qualia-shell/package.json` or root package.json
- (c) Any pre-existing `Phase5_Migration_*.sql` or similar artifacts in repo
- (d) Whether the consumer-side has any DB-shape coupling that could need flagging (e.g., explicit DB column references in code)
- (e) Pre-edit chunk SHA256 baseline (predicted unchanged at NEW post-5.1c baseline `1ab4a9c…14ea` if 5.1d is NEAR-NULL-OP)

**Phase-5 unblock-conditions met:**
- ✅ Tasks 5.1a + 5.1b + 5.1c CLOSED (Phase-5 OPENER + 5.1b CONSUMER-SIDE-CONTRACT-TEST + 5.1c CONSUMER-SIDE-FETCH-WRAPPER)
- ✅ Canonical type mirror surface verified intact (`packages/types/index.ts` complete; `strataTypes.ts` shadow re-export complete; JSON round-trip identity verified at field-level for Phase-1/2/4 schema additions)
- ✅ Test-file regex scan still empty for `VITE_PARITY_LIVE_BACKEND` runtime read — Task 5.1c defined the flag but no consumer reads it yet; future tasks 5.3-5.5/5.7 expected to consume
- ✅ `strataApi.backend.ts` GR-5 invariant intact (Task 3.8 strataUpload<T> + Task 5.1c X-Qualia-API: v2 — both transport-layer shape-contract additions, no endpoint-logic edits)
- ✅ Cumulative Phase-4 + Tasks 5.1a + 5.1b + 5.1c vitest baseline at 231/231; SHA256 invariance axis BROKE at 9; byte-count invariance axis intact at 10-of-10 across phases
- ✅ R-4 Risk Register amendment with cross-repo nuance from v2.26 carries forward to 5.1d kickoff DC-A discipline

**Phase-5 closure report** (`Docs/Phase5_Closure_Report.md` NEW) lands at Task 5.7 sweep per single-closure-per-phase precedent (mirrors Phase-1 + Phase-3 + Phase-4 closure pattern; not Phase-2 per-task-only). Phase-5 column header in §9 main matrix flips `R` → `✓` at that closure.
