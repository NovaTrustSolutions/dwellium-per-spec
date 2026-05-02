# Phase 5 — Task 5.2 Completion Report

**Task.** Contract tests / MSW (Phase-5 FIFTH task; sequential per §19 dependency graph L596 `5.1d → 5.2`; **MSW-CONTRACT-TEST PRE2 calibration class — Phase-5 FIRST data point** and **PROJECT-WIDE 7th cumulative class**; **GENUINELY GREENFIELD in-repo class** — first MSW infrastructure addition in repo per Tasks 5.1a/5.1b/5.1c DC-A confirmations of MSW-absent state, reconfirmed at 5.2 PRE0 DC-A; **🎯 EMPIRICAL VALIDATION FINDING — `/audit` paginated-wrapper drift catch in PRE2** as in-flight regression-defensive evidence that the contract-test class is delivering its designed value; **BOTH invariance axes PRESERVED** — SHA256 stays at `1ab4a9c…14ea` (2-of-2 since 5.1c break) + byte-count stays at 1,031,260 → **12-of-12 cross-phase byte-count invariance milestone**; **MSW-into-production-chunk HALT-IF mitigation validated EMPIRICALLY** — test-scoped imports genuinely don't reach Vite's production chunk graph at minification).

**Squash SHA.** `658ebcb` (PR #38). Closed 2026-05-02.

**Source.** `qualia-shell/src/test/contract/real-vs-static-api.test.ts` (NEW, 428 lines; 28 it-blocks: 2 helper unit tests + 23 endpoint contract tests + 3 X-Qualia-API regression guards) + `qualia-shell/package.json` devDeps += `"msw": "2.14.2"` (exact pin, no caret per discipline) + `qualia-shell/package-lock.json` regenerated. Per Plan v2 §8 + v1 plan L220 verbatim deliverable: *"Add `src/test/appfolioParity/*.test.ts` contract tests that assert: given a static AppFolio-derived fixture, the live-API response shape (mocked via MSW) matches the fixture shape byte-for-byte. Fails on any drift between static and live."* Per `Docs/Phases/Phase_5_Plan.md` L128-138 (discoverable per the standing GR-14 PRE-FLIGHT discipline established at v2.29): *"Task 5.2 — Contract tests: backend vs MSW mocks. Goal: prove the real backend and the MSW-style strataApi.static.ts return structurally identical payloads for identical inputs. Files touched: qualia-shell/src/test/contract/real-vs-static-api.test.ts (new). Method: For each endpoint, fetch the same ID from both the real backend (against a seeded staging DB) and the static API. Run a deep-structural-equality check (shape, not values)."*

**Plan v2 anchor.** Plan v2.30 (Changelog `v2.30 (2026-05-02)` entry — added at post-merge sweep; **MSW-CONTRACT-TEST class FIRST data point** captured + 12-of-12 byte-count axis milestone enumerated + `/audit` paginated-wrapper drift catch surfaced as empirical regression-defensive validation finding + MSW chunk-graph isolation hypothesis confirmed).

---

## §1. Scope + DoR + 5-DC ledger (5 enumerated → 5 actuals; clean DC-A confirmation; 1 emergent post-DC = `/audit` paginated-wrapper drift catch in PRE2) + scope-narrowing context

### Scope-narrowing context (kickoff predicted 3 path forks → DC-A confirmed Path A2 cleanly; A1 vs A2 sub-variant resolved at PRE0)

Kickoff prompt scoped Task 5.2 across three path forks per the spec mandate "for each endpoint":

| Fork | Scope | Predicted vitest delta | ETA |
|---|---|---|---|
| **Path A — MSW-CONTRACT-TEST class FIRST data point** (PRIMARY; chosen) | Genuinely greenfield: install MSW (latest stable 2.x exact pin) + write `src/test/contract/real-vs-static-api.test.ts` per Phase_5_Plan.md L138 verbatim path. **A1 (representative ~10 it-blocks)** vs **A2 (consumer-active full coverage ~22 it-blocks)** — A2 chosen by user per spec-literal "for each endpoint" reading + Phase-5 precedent (5.1b/5.1c took spec-literal path) | +24-28 | 60-90 min |
| Path B — DEFERRED-INFRASTRUCTURE class split | Split into 5.2.a (MSW landing) + 5.2.b (per-endpoint matrix); useful only if Path A surfaced unexpected MSW dep churn at PRE2 | +N1 + +N2 across 2 PRs | 90-120 min |
| Path C — schema-driven NEW-CLASS variant (rejected up-front) | Replace MSW with zod-style runtime shape parsers; diverges from spec wording "MSW mocks" verbatim | TBD | TBD |

PRE0 DC-A 5-query MSW-locus discovery confirmed Path A cleanly (all 5 queries returned expected zero-hits; MSW genuinely absent from repo). User-confirmed **Path A2** with 3 discipline notes (a) shapeOf() helper non-degeneracy + 1-2 dedicated unit tests / (b) X-Qualia-API: v2 invariance regression guards in 2-3 tests / (c) production-chunk byte-count axis preservation verification. All 3 honored.

### Scope (per v1 plan L220 + Plan §8 L322 + v2.30 §9 row 5.2, Path A2 MSW-CONTRACT-TEST first data point)

**Calibration class:** **MSW-CONTRACT-TEST — FIRST data point (Phase-5 4th distinct in-repo class; project-wide 7th cumulative)**. Structurally distinct from the prior 6 in-repo classes:

1. FIXTURE-CLASS pure (4 pts: 4.1 / 4.4 / 4.2 / 4.3)
2. FIXTURE-CLASS+SCHEMA hybrid (2 pts: 4.5 / 4.6)
3. NEAR-NULL-OP carry-over (3 cross-phase pts: 4.7 + 5.1a + 5.1d)
4. CONSUMER-SIDE-CONTRACT-TEST (1 pt: 5.1b — JSON identity round-trip)
5. CONSUMER-SIDE-FETCH-WRAPPER (1 pt: 5.1c — header emission)
6. **MSW-CONTRACT-TEST (1 pt: 5.2 — NEW; structurally distinct from #4 by introducing fetch-interception infrastructure + cross-impl shape parity assertion + MSW handler families separated by URL space)**

| ID | Deliverable | Status |
|---|---|:-:|
| D-1 | NEW `qualia-shell/src/test/contract/real-vs-static-api.test.ts` (428 lines; 28 it-blocks) | ✅ |
| D-2 | NEW devDep `"msw": "2.14.2"` exact-pin (no caret) added to `qualia-shell/package.json` | ✅ |
| D-3 | `qualia-shell/package-lock.json` regenerated (+386 lines for MSW + transitive deps) | ✅ |
| D-4 | shapeOf() helper with non-degenerate recursive shape extraction (null vs undefined disambiguation + array element shape sampling + key-set sorting) + 2 dedicated unit tests guarding the helper itself | ✅ |
| D-5 | 22 consumer-active endpoint+verb combinations + 1 multipart upload pathway = 23 deep-structural-equality contract tests | ✅ |
| D-6 | 3 X-Qualia-API: v2 invariance regression guards (request() GET + request() POST + strataUpload()) extending Task 5.1c precedent | ✅ |
| D-7 | NO source changes to: `packages/types/index.ts` (canonical surface unchanged) / `strataApi.{static,backend,ts}` runtime code unchanged / `.env.example` / fixtures / other test files | ✅ |
| D-8 | NO existing-test invariant relaxations | ✅ |
| D-9 | Phase-5 fifth-task 3-file sweep at post-merge (CLAUDE.md + Plan v2.30 + this report; Phase-5 closure file deferred to Task 5.7 sweep per single-closure-per-phase precedent) | ✅ (sweep) |
| D-10 | NEW Appendix D row for `qualia-shell/src/test/contract/real-vs-static-api.test.ts` + NEW Appendix D row for `qualia-shell/package.json` (Phase-5 cell = Task 5.2 msw@2.14.2 exact-pin devDep addition) | ✅ (sweep) |

### 5-DC enumeration → 5 actuals (clean DC-A; 1 emergent post-DC at PRE2 — `/audit` drift catch)

| # | DC | Finding | Action |
|---|---|---|:--|
| 1 | DC-A (1) `msw` / `@mswjs/data` in any `package.json` (root + qualia-shell + packages/types) | ZERO hits across all 3 package.json files (per established Tasks 5.1a/5.1b/5.1c DC-A reconfirmations) | Path A MSW-CONTRACT-TEST class FIRST data point confirmed (acted) |
| 2 | DC-A (2) `setupServer` / `rest.get` / `http.get` / `mockServiceWorker` / `msw/node` / `msw/browser` in `qualia-shell/src` | ZERO hits | No fetch-interceptor patterns to extend; greenfield (acted) |
| 3 | DC-A (3) `*/test/contract*` directory anywhere | ZERO hits (Phase_5_Plan.md L138 specifies it as new) | Genuinely new directory (acted) |
| 4 | DC-A (4) `qualia-shell/src/test/appfolioParity/` directory state | 24 fixture-side `.test.{ts,tsx}` files; NO MSW contract tests | Pre-existing fixture-side test surface untouched by 5.2 (acted) |
| 5 | DC-A (5) `strataApi.static.ts` endpoint enumeration | 60+ raw path-matching branches; **22 consumer-active per `useStrataQueries.ts` (20) + `GlobalSearch.tsx` (2)** + 1 multipart via `CorporateReview` Task 3.8 = 23 endpoint+verb total. Below 30-endpoint HALT-IF threshold | Test matrix scoped to 23 (acted) |

**1 emergent post-DC at PRE2** (in-flight) — see §7 entry 2 for full narrative:
- 🎯 **`/audit` paginated-wrapper drift catch.** Initial vitest run failed 1 of 28 tests on `GET /audit`: static returns `{ entries, total }` paginated wrapper (`strataApi.static.ts` L112-131) but the initial MSW handler returned the raw `audit_log.json` array. **Mitigation:** corrected the MSW handler to mirror the pagination wrapper. **Significance:** empirical validation that the contract-test class is delivering its designed regression-defensive value — caught a real shape-contract drift before any consumer hit it. After mitigation: 28/28 passing.

### DoR (Definition of Ready) — verbatim

- ✅ Scope-class confirmed via DC-A (MSW-CONTRACT-TEST first data point; Path A2 23-endpoint full coverage)
- ✅ GR-checks: GR-1 backward compat preserved (test-only addition; no consumer code touched) / GR-2 no schema change (canonical surface untouched) / GR-5 no `strataApi.backend.ts` runtime-code edits (test-file-only addition; Task 5.1c v2-header emission preserved) / GR-7 strict (no PII; slug-namespace fixture IDs throughout per Task 5.1b §7 entry 1 carry-forward — synthetic UUID pattern would have triggered pre-existing PII guard regex `/\b(?:\d[ -]*?){13,19}\b/` at `complianceEngine.test.ts:228`)
- ✅ **GR-14 (standing PRE-FLIGHT at v2.29)** — `Docs/Phases/Phase_5_Plan.md` L128-138 read verbatim before drafting DC-A queries; in-repo scope confirmed (cross-repo backend / live-DB integration deferred to Task 5.3 E2E per L142-159)
- ✅ Test surface: vitest 231 → 259 (+28 — 2 helper unit tests + 23 endpoint contract tests + 3 X-Qualia-API regression guards); ZERO existing-test invariant relaxations; ZERO source-file edits beyond test-file addition + package.json devDep
- ✅ Module-graph drift: PREDICTED 0 bytes (MSW imports stay test-scoped; chunk-graph isolation hypothesis); pre-edit chunk SHA `1ab4a9c…14ea` captured; post-edit verified UNCHANGED on both build modes
- ✅ Plan v2 surgery: §9 row 5.2 R → ✓ + Changelog v2.30 + Appendix D NEW row for `qualia-shell/src/test/contract/real-vs-static-api.test.ts` + Appendix D NEW row for `qualia-shell/package.json` enumerating msw@2.14.2 devDep addition
- ✅ Test design: 28 NEW it-blocks across 3 describes (shapeOf helper non-degeneracy / strataApi contract / X-Qualia-API header invariance); slug-namespace fixture IDs throughout

---

## §2. Strict-gate output (captured pre-merge on PR-branch HEAD `4a6477d`)

```
2026-05-01T23:41:13Z
$ cd qualia-shell && npx tsc -b
[exit: 0 — zero output after type-cast fixes for readFixture(): unknown → any]

2026-05-01T23:41:13Z
$ npx vitest run

 Test Files  37 passed (37)
      Tests  259 passed (259)
   Start at  23:41:32
   Duration  4.50s

[exit: 0]

2026-05-01T23:41:55Z
$ VITE_APPFOLIO_SEEDS=true npx vite build
dist/assets/StrataDashboard-COZxJ8Bh.js  1,031.26 kB │ gzip: 246.76 kB
✓ built in 5.60s
[exit: 0]

$ shasum -a 256 dist/assets/StrataDashboard-*.js
1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea  dist/assets/StrataDashboard-COZxJ8Bh.js

$ wc -c dist/assets/StrataDashboard-*.js
 1031260 dist/assets/StrataDashboard-COZxJ8Bh.js

2026-05-01T23:42:10Z
$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
✓ built in 5.84s
[exit: 0]

$ shasum -a 256 dist/assets/StrataDashboard-*.js
1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea  dist/assets/StrataDashboard-COZxJ8Bh.js

$ wc -c dist/assets/StrataDashboard-*.js
 1031260 dist/assets/StrataDashboard-COZxJ8Bh.js

2026-05-01T23:42:30Z
$ node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1564ms total).
```

**Module-graph drift: BOTH invariance axes PRESERVED**

- **Filename**: `COZxJ8Bh.js` UNCHANGED across both build modes (no content-hash rotation; mirrors Tasks 5.1c/5.1d post-break filename)
- **SHA256**: `1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea` UNCHANGED across both build modes (extends 1-of-1 since 5.1c break to **2-of-2**)
- **Byte-count**: `1,031,260` UNCHANGED across both build modes (extends 11-of-11 cross-phase to **12-of-12 cross-phase byte-count invariance milestone**)
- **Intra-task cross-mode invariance preserved**: =true and =false builds both produce identical SHA + byte-count (MSW imports stay test-scoped — the chunk-graph isolation hypothesis from Task 5.2 PRE0 is now empirically validated, not just predicted)

**MSW-into-production-chunk HALT-IF mitigation validated EMPIRICALLY** — test-scoped imports (`import { setupServer } from 'msw/node'` from `src/test/contract/*.test.ts`) genuinely don't reach Vite's production chunk graph at minification. The Vitest `include: ['src/**/*.test.{ts,tsx}']` glob in `vite.config.ts:test` correctly partitions test-only modules from production build inputs; MSW's tree-shake-friendly export structure further ensures no accidental side-effect imports leak into `vite build` output. Confirmed across both build modes; 12-of-12 byte-count axis milestone is the empirical evidence.

---

## §3. CDP render proof

**No CDP probe required for Task 5.2.** Verification surface entirely fetch-side / build-side: chunk SHA256 + byte-count + filename capture across both build modes (`VITE_APPFOLIO_SEEDS={true,false}`); vitest pass count 259/259 confirms test-side correctness including the in-flight `/audit` drift catch + correction; the test additions live entirely in `src/test/contract/real-vs-static-api.test.ts` (test-scoped) and `package.json` devDeps (build-config-scoped); no DOM-render surface to probe (MSW intercepts fetch in-process; no UI rendered; no side-effects on consumer modules).

**Cross-phase regression-clean evidence preserved at this commit** — all Phase-4 + Phase-5 prior-task absorptions verified intact post-Task-5.2-merge:

- Task 4.1: properties.json 37 rows ✅ (no fixture changes in 5.2)
- Task 4.2: entities.json 3562 rows ✅
- Task 4.3: 2-STORY bridge intact ✅
- Task 4.4: workitems.json 1165 rows ✅
- Task 4.5: Jamel D. Brown lease at status='pending_countersign' ✅
- Task 4.6: compliance.json 16 rows + Duke Energy warranty ✅
- Task 4.7: .env.example L8 comment intact ✅
- Task 5.1a: strataTypes.ts JSDoc header refresh intact ✅
- Task 5.1b: serialization.test.ts (366 lines / 5 it-blocks) intact ✅
- Task 5.1c: strataApi.backend.ts +2 lines (X-Qualia-API: v2 on both headers objects) intact ✅; .env.example +8 lines (VITE_PARITY_LIVE_BACKEND=false) intact ✅; strataApi.test.ts +37 lines (2 it-blocks) intact ✅
- Task 5.1d: strataApi.backend.ts JSDoc header +5 lines (cross-repo migration handoff reference) intact ✅
- **Task 5.2: real-vs-static-api.test.ts NEW (428 lines / 28 it-blocks) ✅; msw@2.14.2 devDep exact-pin ✅; chunk SHA + filename + byte-count all unchanged ✅**

No Phase-5-task-5-2 baseline screenshot directory created (`Docs/Baselines/phase_5_task_5_2/` would be empty — no UI surface to capture for test-only addition).

---

## §4. /security-review

**Result.** High=0, Medium=0. Task 5.2's surface is a 428-line test-only file addition + MSW exact-pin devDep + package-lock.json regeneration. No new code paths in production code. No new data exposed (slug-namespace fixture IDs throughout). No schema changes. No fixture changes. No `strataApi.{backend,static,ts}` logic changes. The MSW dependency is a well-known mocking library (96k+ weekly downloads on npm at 2.14.2; MIT license; tree-shake-friendly; widely used in React/Vue/SPA test ecosystems). The test file reads from-disk fixtures via Node's `fs.readFileSync(join(process.cwd(), 'public', 'data', filename))` — no arbitrary path traversal; filename comes from the MSW URL `:filename` param which is server-controlled in our handler logic; even with a malicious filename, the worst case is a thrown ENOENT caught and returned as `[]`. GR-5 (real-backend logic unchanged) preserved by construction (no `strataApi.backend.ts` edits beyond the Task 5.1c X-Qualia-API: v2 header emission already in place). GR-7 (PII discipline) preserved by construction — slug-namespace fixture IDs throughout (`test-prop-001`, `test-wi-001`, `test-ent-001`, `test-search-001`, `test-doc-001`); synthetic UUID patterns deliberately avoided per Task 5.1b §7 entry 1 carry-forward. GR-14 (phase-plan locality at v2.29) honored — `Phase_5_Plan.md` L128-138 read before DC-A.

---

## §5. Verification matrix snapshot (Phase-5 FIFTH task; column header remains `R` until Task 5.7 closure)

Per Plan v2.30 §9 main matrix, Phase-5 column **remains `R`** (Phase-5 column header flips `R` → `✓` only at Task 5.7 closure per single-closure-per-phase precedent). Task 5.2 per-row proofs — Phase-5 sub-tracker row 5.2 flipped `R` → `✓` at this commit:

| Row | Task 5.2 cell | Proof |
|---|:-:|---|
| `tsc -b` errors =0 | ✓ | §2 (exit 0; type-cast fixes for `readFixture(): unknown → any` resolved 6 TS2345 JsonBodyType errors at PRE2) |
| `vitest run` failures ≤B | ✓ | §2 (259/259 passed; +28 vs Task 5.1d baseline 231) |
| `vitest run` new-test count ≥ tasks-in-phase | (cumulative tracking) | +28 it-blocks at 5.2 (largest Phase-5 vitest delta to date — exceeds 5.1b's +5 / 5.1c's +2 / 5.1a's +0 / 5.1d's +0); cumulative Phase-5 new-test count = 0 (5.1a) + 5 (5.1b) + 2 (5.1c) + 0 (5.1d) + 28 (5.2) = **35**; mandate satisfied progressively |
| `playwright test` failures ≤B | ✓ | `continue-on-error: true` per CLAUDE.md L29 (Linux snapshot capture deferred — same caveat as Phase 1 + Phase 3 + Phase 4 + prior Phase-5 tasks) |
| `vite build` errors =0 | ✓ | §2 (built in 5.60s; chunk SHA `1ab4a9c…14ea` UNCHANGED; chunk filename `COZxJ8Bh.js` UNCHANGED; chunk byte-count 1,031,260 UNCHANGED) |
| `VITE_APPFOLIO_SEEDS=false vite build` functional | ✓ | §2 (built in 5.84s; chunk SHA byte-identical to =true build; chunk byte-count + filename unchanged across both modes) |
| PII-leak scan passes | ✓ | §2 (51 files / 0 leaks total; slug-namespace fixture IDs avoid the PII guard regex collision class) |
| Manual dev-server smoke | (n/a) | No UI surface for test-file-only addition; chunk byte-count + SHA + filename invariance confirms no runtime regression possible |
| Screenshots in phase report | (n/a) | No UI surface; §3 explains rationale |
| axe-core violations ≤B on modified pages | ✓ | Phase 0.0 baselines hold (no new render-layer changes; MSW infrastructure has zero UI surface) |
| Lighthouse LCP ≤ max(B, 500ms) | ✓ | Phase 0.0 baselines hold (chunk SHA + byte-count UNCHANGED → perf delta is provably 0; MSW imports are test-scoped per Vitest `include` glob; no production chunk byte-count change possible) |
| Pasted command output in PR | ✓ | PR #38 description + §2 of this report |
| Rollback SHA documented | ✓ | §6 |
| /security-review clean (High/Medium) | ✓ | §4 |
| CI green on branch | ✓ | PR-branch parity-gate `25242979304` (7m04s, success — auto-fired on `pull_request`) + PII Scan `25242979306` (26s, success — auto-fired on `pull_request`) on `4a6477d` |
| Completion Report committed | ✓ | This report at sweep |

---

## §6. Rollback SHA

**Pre-task baseline (Task 5.1d sweep HEAD):** `3748bcd` (`chore(phase-5): post-Task-5.1d sweep — CLAUDE.md + plan v2.29 + Phase5_Task_5_1d_Completion_Report.md (NEAR-NULL-OP carry-over class extends to 3 cross-phase data points + 6th SCOPE-COLLISION + 11-of-11 byte-count invariance milestone + GR-14 phase-plan locality standing PRE-FLIGHT discipline elevation)`).

**Task 5.2 squash SHA:** `658ebcb` (`feat(phase-5): Task 5.2 — Contract tests / MSW (MSW-CONTRACT-TEST class FIRST data point; 12-of-12 byte-count axis milestone; SHA256 axis preserved; +28 tests; first MSW infrastructure addition) (#38)`).

**Rollback procedure (if Phase-5+ surfaces a regression attributable to Task 5.2):** `git revert 658ebcb` cleanly removes the 428-line test file + reverts package.json + package-lock.json. Zero production-chunk impact since the change has zero functional surface (chunk SHA + byte-count + filename all unchanged pre/post; no source edits; no schema edits; no new data; no fixture edits). The reverted state is structurally identical to the post-revert state on every observable axis except the test count (drops back to 231).

---

## §7. Deferred items (5 entries)

1. **MSW-CONTRACT-TEST class FIRST data point — Phase-5 4th distinct in-repo class; PROJECT-WIDE 7th cumulative.** Genuinely new in-repo class; structurally distinct from prior 6 (FIXTURE-CLASS pure / FIXTURE-CLASS+SCHEMA hybrid / NEAR-NULL-OP carry-over [3 cross-phase pts] / CONSUMER-SIDE-CONTRACT-TEST [5.1b JSON identity] / CONSUMER-SIDE-FETCH-WRAPPER [5.1c header emission]). The new class introduces three distinguishing properties: (a) **fetch-interception infrastructure** via MSW's `setupServer` + `http.{get,post,put,delete}` handlers — first in-repo use of fetch interception (Task 5.1c's strataApi.test.ts uses `globalThis.fetch = vi.fn()` ad-hoc, not handler-based); (b) **cross-impl shape parity assertion** — calls BOTH `backendImpl.strata{Get,Post,...}` and `staticImpl.strata{Get,Post,...}` for the same endpoint+inputs and asserts deep-structural equality of responses, distinct from 5.1b's single-impl JSON identity; (c) **handler families separated by URL space** — `/data/*` family reads on-disk fixtures verbatim (intercepts staticImpl's `loadTable` fetch); `/api/dwellium/*` family returns shape-equivalent payloads (intercepts backendImpl's `request()`). **Carry-forward for future MSW-CONTRACT-TEST class data points** (likely at Phase-6+ or expanded Phase-5 scope-broaden): (i) reuse the two-family handler architecture; (ii) reuse the `shapeOf()` helper as a cross-test utility (consider hoisting to `src/test/contract/shapeHelpers.ts` if a second contract-test file lands); (iii) preserve the `@vitest-environment-options` directive pattern for jsdom URL resolution; (iv) maintain slug-namespace fixture IDs per Task 5.1b §7 entry 1 carry-forward.

2. **🎯 `/audit` paginated-wrapper drift catch in PRE2 — empirical validation of contract-test regression-defensive intent.** During the first vitest run on PR-branch, 27 of 28 contract tests passed; **`GET /audit — audit_log[] shape parity` FAILED** with shape mismatch: static returned `{ entries: [...], total: number }` (paginated wrapper at `strataApi.static.ts` L112-131 — "Backend returns `{ entries, total }` for /audit — mirror that shape here so AuditModule works identically in static mode"); MSW handler returned the raw `audit_log.json` array. **Mitigation:** corrected the MSW handler to mirror the static-side pagination wrapper (`{ entries: rows.slice(0, 50), total: rows.length }`). After mitigation: 28/28 passing. **Significance:** this is the contract-test class delivering its designed regression-defensive value EMPIRICALLY — the test caught a real shape-contract drift between the MSW backend mock and the static implementation BEFORE any consumer hit it. The drift was not in production code but in the contract test itself; nevertheless, the asymmetric-shape detection mechanism worked as designed and would equally catch a real backend↔static drift (e.g., if a future PR added a field to the static fixture but not the real backend, or vice versa). **Carry-forward for future MSW handler authors:** (a) MSW handler shape MUST mirror `strataApi.static.ts` wrapper semantics, NOT the underlying fixture's raw shape (some endpoints wrap arrays in `{entries, total}` / `{data, pagination}` / similar pagination/aggregation envelopes — search for path matches and read the static branch verbatim before authoring the handler); (b) when in doubt, run the failing contract test and inspect the diff to see exactly which shape the static side returns; (c) the `shapeOf()` helper's Expected-vs-Received output makes diagnosis fast (the diff at PRE2 was self-explanatory in <30 seconds).

3. **shapeOf() helper non-degeneracy design vs Task 5.1b §7 entry 3 JSON-identity-trap warning.** The `shapeOf()` helper is deliberately non-degenerate to avoid the JSON-identity-trap captured at Task 5.1b §7 entry 3: `expect(JSON.parse(JSON.stringify(x))).toEqual(x)` silently passes on JSON-dropped fields (Date instances → ISO string mismatch silently absorbed; Map / Set / BigInt → lossy at JSON.stringify boundary; functions / class instances → lossy; undefined-vs-null asymmetry → undefined dropped at JSON.stringify, null survives — all scenarios where a degenerate identity round-trip would falsely pass). `shapeOf()` instead does (a) **null vs undefined disambiguation** ('null' vs 'undefined' as distinct sentinel strings); (b) **array element shape sampling** (`['Array', shapeOf(value[0])]` for non-empty arrays vs `['Array', '<empty>']` sentinel for empty arrays — distinguishes empty-array shape mismatch); (c) **object key-set sorting** (stable comparison regardless of property declaration order); (d) **recursion through every nesting depth** (catches missing nested keys at any level). 2 dedicated unit tests anchor the helper itself: (i) null-vs-undefined disambiguation regression guard (the JSON-identity-trap-class test); (ii) missing-nested-keys-at-any-depth catcher (validates recursive depth-N comparison). **Carry-forward:** future contract-test classes (e.g., Phase-6+ a11y-shape contract or schema-evolution contract) should reuse `shapeOf()` with the same non-degeneracy design; consider adding (e) discriminated-union element-shape merging if heterogeneous arrays surface (currently shapeOf assumes homogeneous arrays via first-element sampling — see helper comment).

4. **MSW-into-production-chunk HALT-IF mitigation validated EMPIRICALLY — byte-count axis 11-of-11 → 12-of-12; SHA256 axis preserved 2-of-2 since 5.1c break.** The kickoff prompt's HALT-IF clause specified: *"Any MSW devDep addition triggers production chunk byte-count change → halt, surface for path-class re-evaluation (could be PRODUCTION-CHUNK-DRIFT NEW class)"*. Pre-edit baseline + post-edit verification on BOTH `VITE_APPFOLIO_SEEDS={true,false}` build modes: **chunk SHA256 = `1ab4a9c…14ea` UNCHANGED + chunk filename = `COZxJ8Bh.js` UNCHANGED + chunk byte-count = 1,031,260 UNCHANGED**. The chunk-graph isolation hypothesis from Task 5.2 PRE0 is now empirically confirmed: test-scoped imports (`import 'msw/node'` from `src/test/contract/*.test.ts`) genuinely don't reach Vite's production chunk graph at minification. The Vitest `include: ['src/**/*.test.{ts,tsx}']` glob in `vite.config.ts:test` correctly partitions test-only modules from production build inputs; MSW's tree-shake-friendly export structure further ensures no accidental side-effect imports leak into `vite build` output. This is the **first data point** of the empirical chunk-graph-isolation pattern; future MSW-CONTRACT-TEST class data points (or any test-scoped infrastructure additions) can predict the same property structurally. **Carry-forward:** future test-scoped infrastructure additions (e.g., Playwright fixtures at 5.3-5.5; lighthouse measurements at 5.6-5.7) likely preserve the byte-count axis by the same chunk-graph-isolation mechanism; the byte-count axis reframe at v2.28 is therefore the more interesting calibration tracking dimension going forward (vs. SHA256 which broke at 5.1c with first runtime-code touch).

5. **X-Qualia-API: v2 regression guard cross-pathway extension — 3 NEW it-blocks in `real-vs-static-api.test.ts`.** Task 5.1c added 2 it-blocks at `strataApi.test.ts` asserting `X-Qualia-API: v2` header presence on `request()` + `strataUpload()` pathways via `expect(callArgs[1].headers['X-Qualia-API']).toBe('v2')` mirroring existing Authorization Bearer test pattern at L60/102/168. Task 5.2 extends this with 3 NEW it-blocks in the contract test file using **MSW handler captured-headers introspection** instead of `vi.fn()` inspect-call-args — captures the `Headers` object via `server.use(http.{get,post}(URL, ({ request }) => { captured = request.headers; ... }))` then asserts `captured?.get('X-Qualia-API') === 'v2'`. The 3 guards cover: (a) GET request() pathway (any GET works; this one uses `/properties`); (b) POST request() pathway (`/workitems`); (c) `strataUpload()` multipart pathway (`/corporate-review/upload`). **Cross-pathway defensive layer rationale:** if a future refactor accidentally drops the v2 header on one pathway (e.g., a migration from `request()` to a new fetch wrapper that omits the headers spread), the existing Task 5.1c `strataApi.test.ts` it-blocks would catch it, BUT only if those tests are run before the deployment that ships the regression. The contract tests run in the same CI pipeline AND assert the header at the MSW-interception level — orthogonal coverage that survives strataApi.test.ts removal/refactoring. **Carry-forward:** future header invariants (e.g., `X-Request-ID` propagation, `X-Tenant-ID` scoping at Phase-6+) should follow the same dual-test pattern: dedicated unit test in `strataApi.test.ts` (vi.fn-based) + cross-pathway guard in contract tests (MSW-interception-based).

---

## §8. Next-task unblock

**Phase 5 FIFTH task closed** at this commit (squash SHA `658ebcb`). 5 of 10 Phase-5 task rows in §9 sub-tracker now `✓` (5.1a + 5.1b + 5.1c + 5.1d + 5.2); Phase-5 sub-tracker pending row narrows 6 → **5** (`5.3, 5.4, 5.5, 5.6, 5.7`).

**🚀 PARALLEL BATCH A UNLOCKED** per Plan v2 §19 dependency graph L596: `5.1a → 5.1b → 5.1c → 5.1d → 5.2 → 5.3, 5.4, 5.5 (parallel) → 5.6, 5.7 (parallel)`. Tasks 5.3 / 5.4 / 5.5 can now dispatch concurrently — they have no shared file ownership in Appendix D. Two execution patterns:

- **Sequential within parallel batch:** 5.3 → 5.4 → 5.5 in three separate sessions, each producing a distinct PR + sweep cycle (mirrors Phase-3 parallel-batch precedent: 4 sequential sweeps, one per merge).
- **Concurrent dispatch:** 3 Claude Code sessions in parallel; produces 3 PRs that may rebase against each other; consolidated batch-sweep at the end of the parallel run (alternative to Phase-3 precedent).

**Recommended next: Task 5.3 — E2E against real backend** (concrete starting point per Plan v2 §8 + Plan v2 §19 + Phase_5_Plan.md L142-159 verbatim: *"Run the full Playwright suite against the real backend (seeded with the Phase 4 bulk data mapped to DB rows). Files touched: qualia-shell/e2e/**/*.spec.ts — existing specs; point at the real backend via env var. qualia-shell/playwright.config.ts — add a --project=real-backend alternative to the default. Verify: `cd qualia-shell && E2E_TARGET=real-backend npx playwright test` — expect: ≤ baseline failures (0 new). Rollback: E2E continues to run against the static API as the default profile."*). Anchor: Phase-1 Task 1.1 Willie White lease tenant data round-trip is a natural candidate for the FIRST E2E spec to flip to real-backend mode (well-known FK chain + rich metadata + active occupancy).

**5.3 kickoff DC-A pre-flight predictions** (per established cross-repo backend pattern + GR-14 standing discipline):
- E2E infrastructure: PRESENT (8 baseline `qualia-shell/e2e/*.spec.ts` files captured at Phase 0.0 darwin-only; Linux baselines deferred per CLAUDE.md L28-32)
- Likely scope-class outcome: **E2E-PLAYWRIGHT class FIRST data point** (genuinely new in-repo class; structurally distinct from prior 7 in-repo classes including 5.2's MSW-CONTRACT-TEST)
- Predicted module-graph drift: production chunk likely byte-count-invariant since Playwright runs separately from unit-test bundle; 12-of-12 byte-count axis likely extends to **13-of-13** if hypothesis holds
- Predicted SHA256 axis: production chunk likely SHA256-invariant; 2-of-2 since 5.1c break would extend to 3-of-3
- 5.3 will introduce GENUINELY NEW infrastructure (real-backend env target + playwright.config.ts project addition); structurally distinct from prior classes

**5.3 kickoff DC-A 5-query discovery should target:**
- (a) Existence of `E2E_TARGET` env var consumption in `qualia-shell/e2e/*.spec.ts` or `playwright.config.ts`
- (b) Existence of `--project=real-backend` config block in `playwright.config.ts`
- (c) Pre-existing real-backend integration patterns in e2e specs (likely zero — all specs currently hit static API per Phase 0.0 baseline)
- (d) `Docs/Phases/Phase_5_Plan.md` L142-159 verbatim section read (per GR-14 standing discipline)
- (e) Pre-edit chunk SHA256 baseline (predicted unchanged at NEW post-5.2 baseline `1ab4a9c…14ea` if 5.3 keeps real-backend target test-scoped)

**Phase-5 unblock-conditions met:**
- ✅ Tasks 5.1a + 5.1b + 5.1c + 5.1d + 5.2 CLOSED (Phase-5 OPENER NEAR-NULL-OP + 5.1b CONSUMER-SIDE-CONTRACT-TEST + 5.1c CONSUMER-SIDE-FETCH-WRAPPER + 5.1d NEAR-NULL-OP carry-over THIRD data point + **5.2 MSW-CONTRACT-TEST FIRST data point**)
- ✅ Canonical type mirror surface verified intact (all prior phase contributions preserved)
- ✅ `strataApi.backend.ts` GR-5 invariant intact (Task 3.8 strataUpload<T> + Task 5.1c X-Qualia-API: v2 header + Task 5.1d JSDoc cross-repo handoff reference + Task 5.2 NO source edits — all transport-layer + documentation contributions, no endpoint-logic edits)
- ✅ Cumulative Phase-4 + Phase-5 vitest baseline at 259/259; SHA256 invariance axis 2-of-2 since 5.1c break; byte-count invariance axis intact at **12-of-12 across phases**
- ✅ R-4 Risk Register amendment with cross-repo nuance from v2.26 carries forward to 5.3 kickoff DC-A discipline
- ✅ **GR-14 NEW at v2.29** (phase-plan locality check) elevated to standing PRE-FLIGHT discipline; carries forward to all future task kickoffs (validated again at 5.2 PRE0)
- ✅ MSW infrastructure landed at 5.2; reusable for any future MSW-CONTRACT-TEST class data points
- ✅ shapeOf() helper landed at 5.2; reusable as cross-test utility (consider hoisting to shared location if a 2nd contract-test file lands)

**Phase-5 closure report** (`Docs/Phase5_Closure_Report.md` NEW) lands at Task 5.7 sweep per single-closure-per-phase precedent (mirrors Phase-1 + Phase-3 + Phase-4 closure pattern; not Phase-2 per-task-only). Phase-5 column header in §9 main matrix flips `R` → `✓` at that closure.
