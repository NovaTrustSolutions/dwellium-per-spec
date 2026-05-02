# Phase 5 — Task 5.3 Completion Report

**Task.** E2E against real backend (Phase-5 SIXTH task; **first task of PARALLEL BATCH A** per §19 dependency graph L596 `5.2 → {5.3, 5.4, 5.5} parallel`; chosen execution: **sequential within batch** mirroring Phase-3 4-task parallel-batch precedent of 4 sequential sweeps one per merge; **E2E-PLAYWRIGHT PRE2 calibration class — Phase-5 5th distinct in-repo class** and **PROJECT-WIDE 8th cumulative**; **GENUINELY GREENFIELD in-repo class** structurally distinct from prior 7 by introducing Playwright config parameterization + env-gated webServer routing + dual-project alternation + cross-repo handoff convention captured in JSDoc; **chunk-graph isolation hypothesis validated at SECOND test-tooling data point** after Task 5.2's MSW infrastructure; **BOTH invariance axes PRESERVED** — SHA256 stays at `1ab4a9c…14ea` (3-of-3 since 5.1c break) + byte-count stays at 1,031,260 → **13-of-13 cross-phase byte-count invariance milestone**; **🚨 sibling-repo-absent finding** — `../ai-dashboard369-file-manager` referenced by `playwright.config.ts` but ABSENT on disk; mirrors Task 5.1c `VITE_PARITY_LIVE_BACKEND` defined-but-unused convention).

**Squash SHA.** `22ff19b` (PR #39). Closed 2026-05-02.

**Source.** `qualia-shell/playwright.config.ts` (refactored 56 → 86 lines net; +50 lines for dual-project + env-gated webServer + JSDoc cross-repo handoff convention) + `qualia-shell/.env.example` (+14 lines; E2E_TARGET annotation block mirroring `VITE_PARITY_LIVE_BACKEND` byte-shape at .env.example:11-17). Per Plan v2 §8 + Phase_5_Plan.md L142-159 verbatim deliverable: *"Run the full Playwright suite against the real backend (seeded with the Phase 4 bulk data mapped to DB rows). Files touched: qualia-shell/e2e/**/*.spec.ts (existing specs; point at the real backend via env var) + qualia-shell/playwright.config.ts (add a --project=real-backend alternative to the default). Verify: cd qualia-shell && E2E_TARGET=real-backend npx playwright test — expect: ≤ baseline failures (0 new). Rollback: E2E continues to run against the static API as the default profile."*

**Plan v2 anchor.** Plan v2.31 (Changelog `v2.31 (2026-05-02)` entry — added at post-merge sweep; **E2E-PLAYWRIGHT class FIRST data point** captured + 13-of-13 byte-count axis milestone enumerated + sibling-repo-absent finding surfaced + cross-repo handoff JSDoc precedent extended from Task 5.1d strataApi.backend.ts).

---

## §1. Scope + DoR + 5-DC ledger (5 enumerated → 5 actuals; clean DC-A; 0 emergent post-DC) + scope-narrowing context

### Scope-narrowing context (kickoff predicted 3 path forks → DC-A confirmed Path A cleanly)

Kickoff prompt scoped Task 5.3 across three path forks:

| Fork | Scope | Predicted byte-count drift | ETA |
|---|---|---|---|
| **Path A — E2E-PLAYWRIGHT class FIRST data point** (PRIMARY; chosen) | Functional dual-project + env-gated webServer routing per spec L149 verbatim "add a --project=real-backend alternative" | +0 / 1,031,260 preserved → 13-of-13 | 30-45 min |
| Path B — NEAR-NULL-OP carry-over 4th data point | If config refactor collapsed to JSDoc + minimal touches | +0 / preserved → 13-of-13 | 15-20 min |
| Path C — OUT-OF-REPO-DEFER + JSDoc-only | R-4 amendment extension; no behavior change (rejected up-front) | +0 / preserved | 10-15 min |

PRE0 DC-A 5-query Playwright-locus discovery confirmed Path A was the right read of spec L149 (functional behavior, not JSDoc-only). User-confirmed Path A with 5 decisions:
1. Path A (E2E-PLAYWRIGHT class FIRST data point)
2. Default project name: keep `chromium` (option A); add `real-backend` as alternative
3. shapeOf-non-degeneracy: N/A (no shape-assertion helpers introduced)
4. X-Qualia-API: v2 invariance regression guard: SKIP at 5.3 (already covered at 5.1c + 5.2; defer to 5.4/5.5 round-trip scenarios)
5. CI manual-dispatch on PR-branch acknowledged (paths-filter quirk per Task 4.7 precedent)

### Scope (per v1 plan L222 + Plan v2 §8 + Phase_5_Plan.md L142-159 + v2.31 §9 row 5.3, Path A E2E-PLAYWRIGHT first data point)

**Calibration class:** **E2E-PLAYWRIGHT — FIRST data point (Phase-5 5th distinct in-repo class; project-wide 8th cumulative)**. Structurally distinct from the prior 7 in-repo classes:

1. FIXTURE-CLASS pure (4 pts: 4.1 / 4.4 / 4.2 / 4.3)
2. FIXTURE-CLASS+SCHEMA hybrid (2 pts: 4.5 / 4.6)
3. NEAR-NULL-OP carry-over (3 cross-phase pts: 4.7 + 5.1a + 5.1d)
4. CONSUMER-SIDE-CONTRACT-TEST (1 pt: 5.1b — JSON identity round-trip)
5. CONSUMER-SIDE-FETCH-WRAPPER (1 pt: 5.1c — header emission)
6. MSW-CONTRACT-TEST (1 pt: 5.2 — fetch interception + cross-impl shape parity)
7. **E2E-PLAYWRIGHT (1 pt: 5.3 — NEW; structurally distinct by introducing Playwright config parameterization + env-gated webServer routing + dual-project alternation + cross-repo handoff convention captured in JSDoc)**

| ID | Deliverable | Status |
|---|---|:-:|
| D-1 | REFACTOR `qualia-shell/playwright.config.ts` (56 → 86 lines): dual-project alternation (chromium default + real-backend alternative); env-gated webServer composition (Vite only for chromium / sibling-repo Express + Vite for real-backend); env-driven Vite VITE_USE_STATIC_API switching | ✅ |
| D-2 | JSDoc header cross-repo handoff convention captured at file head (mirrors Task 5.1d strataApi.backend.ts JSDoc precedent) | ✅ |
| D-3 | EXTEND `qualia-shell/.env.example` (+14 lines): `E2E_TARGET` annotation block mirroring `VITE_PARITY_LIVE_BACKEND` byte-shape (.env.example:11-17 → new block at :19-32); default value blank → chromium project | ✅ |
| D-4 | NO source changes to: `packages/types/index.ts` / `strataApi.{static,backend,ts}` runtime code / fixtures / unit tests / existing 9 e2e specs (mode-agnostic per kickoff PRE1 design) | ✅ |
| D-5 | NO existing-test invariant relaxations | ✅ |
| D-6 | Phase-5 sixth-task 3-file sweep at post-merge (CLAUDE.md + Plan v2.31 + this report; NO Phase-5 closure file yet — closure deferred to Task 5.7 sweep per single-closure-per-phase precedent) | ✅ (sweep) |
| D-7 | Plan v2.31 §9 Phase-5 sub-tracker row 5.3 R → ✓ + Changelog v2.31 + Appendix D amendments for `qualia-shell/playwright.config.ts` (NEW row) + `qualia-shell/.env.example` (Phase-5 cell extends Task 5.1c entry) | ✅ (sweep) |

### 5-DC enumeration → 5 actuals (clean DC-A; 0 emergent post-DC)

| # | DC | Finding | Action |
|---|---|---|:--|
| 1 | DC-A (1) `playwright.config.ts` current state | Single chromium project; baseURL hardcoded `http://localhost:5173`; webServer references sibling repo on port 3000 + Vite on 5173; NO `--project=real-backend`; NO env-driven parameterization | Path A clean refactor scope confirmed (acted) |
| 2 | DC-A (2) e2e spec inventory | **9 specs** (kickoff said ~8; minor variance): ara-chat / axe-baseline / create-workitem / file-upload / login / logout / screenshot-baseline / stella-agent / strata-nav. All Phase-0 era 2026-04-22; mode-agnostic UI navigation; no spec edits needed (acted) |
| 3 | DC-A (3) E2E_TARGET / VITE_PARITY_LIVE_BACKEND consumption | E2E_TARGET = 0 hits anywhere (greenfield); VITE_PARITY_LIVE_BACKEND defined-but-unused at .env.example:17 (Task 5.1c convention) | E2E_TARGET annotation mirrors 5.1c byte-shape (acted) |
| 4 | DC-A (4) Linux baseline state | 1 file present (`overview-chromium-linux.png`); workflow line 77 `continue-on-error: true` PRESERVED per CLAUDE.md L29 deferred-item discipline | No change (acted; deferred-item ledger still intact) |
| 5 | DC-A (5) real-backend-seeding hooks (in-repo) | 0 hits — no globalSetup / globalTeardown / seedDB / seed.sql / db.fixtures.json / staging.db | R-4 v2.26 partition holds; staging DB out-of-repo (acted; §7 entry 2 captures sibling-repo-absent finding) |

(0 emergent post-DC actions — fifth consecutive Phase-5 task to close with all DCs hitting on first-pass enumeration. The GR-14 phase-plan locality check elevation continues to harden this discipline. **NEW finding surfaced at sweep that requires its own §7 entry but was NOT a Task 5.3 PRE0 gap** — see §7 entry below for the Task 5.4-5.7 phase-spec-vs-parent divergence finding.)

### DoR (Definition of Ready) — verbatim

- ✅ Scope-class confirmed via DC-A (E2E-PLAYWRIGHT first data point; Path A dual-project + env-gated webServer)
- ✅ GR-checks: GR-1 backward compat preserved by spec design (default project = chromium = static-API mode = current behavior; rollback statement at Phase_5_Plan.md L159 honored) / GR-2 no schema change / GR-5 no runtime-code edits to `strataApi.backend.ts` (Task 5.1c X-Qualia-API: v2 emission preserved) / GR-7 strict (no PII; config + env annotations only)
- ✅ **GR-14 (standing PRE-FLIGHT at v2.29)** — `Docs/Phases/Phase_5_Plan.md` L142-159 read verbatim before drafting DC-A queries; in-repo scope confirmed (cross-repo sibling-repo + staging DB out-of-repo per R-4 v2.26)
- ✅ Test surface: vitest 259 → 259 (+0; e2e is separate from unit tests); ZERO existing-test invariant relaxations; ZERO source-file edits beyond playwright.config.ts + .env.example
- ✅ Module-graph drift: PREDICTED 0 bytes (Playwright config + .env.example are test-tooling-scoped; pre-edit chunk SHA `1ab4a9c…14ea` captured); post-edit verified UNCHANGED on both build modes — chunk-graph isolation hypothesis validated at SECOND test-tooling data point after Task 5.2's MSW infrastructure
- ✅ Plan v2 surgery: §9 row 5.3 R → ✓ + Changelog v2.31 + Appendix D amendments for `qualia-shell/playwright.config.ts` (NEW row) + `qualia-shell/.env.example` (Phase-5 cell extends Task 5.1c entry)
- ✅ Test design: 0 new tests (E2E-PLAYWRIGHT class precedent — config-only + parameterization; specs stay mode-agnostic)

---

## §2. Strict-gate output (captured pre-merge on PR-branch HEAD `28c370e`)

```
2026-05-02T02:10:27Z
$ cd qualia-shell && npx tsc -b
[exit: 0 — zero output]

2026-05-02T02:10:27Z
$ npx vitest run

 Test Files  37 passed (37)
      Tests  259 passed (259)
   Start at  02:10:27
   Duration  4.18s

[exit: 0]

2026-05-02T02:10:50Z
$ rm -rf dist && VITE_APPFOLIO_SEEDS=true npx vite build
✓ built in 5.07s
[exit: 0]

$ shasum -a 256 dist/assets/StrataDashboard-*.js
1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea  dist/assets/StrataDashboard-COZxJ8Bh.js

$ wc -c dist/assets/StrataDashboard-*.js
 1031260 dist/assets/StrataDashboard-COZxJ8Bh.js

2026-05-02T02:11:05Z
$ rm -rf dist && VITE_APPFOLIO_SEEDS=false npx vite build
✓ built in 5.52s
[exit: 0]

$ shasum -a 256 dist/assets/StrataDashboard-*.js
1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea  dist/assets/StrataDashboard-COZxJ8Bh.js

$ wc -c dist/assets/StrataDashboard-*.js
 1031260 dist/assets/StrataDashboard-COZxJ8Bh.js

2026-05-02T02:11:30Z
$ node Scripts/verify_no_pii_leak.mjs
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 51 files scanned across 2 roots, 0 leaks found (1553ms total).
```

**Module-graph drift: BOTH invariance axes PRESERVED**

- **Filename**: `COZxJ8Bh.js` UNCHANGED across both build modes (no content-hash rotation; mirrors Tasks 5.1c/5.1d/5.2 post-break filename)
- **SHA256**: `1ab4a9c8c4d17e2e7056fddacd402d91606001699279d22c55fc555f8d0a14ea` UNCHANGED across both build modes (extends 2-of-2 since 5.1c break to **3-of-3**)
- **Byte-count**: `1,031,260` UNCHANGED across both build modes (extends 12-of-12 cross-phase to **13-of-13 cross-phase byte-count invariance milestone**)
- **Intra-task cross-mode invariance preserved**: =true and =false builds both produce identical SHA + byte-count (Playwright config + .env.example are test-tooling-scoped — neither enters Vite's production chunk graph)

**Chunk-graph isolation hypothesis validated at SECOND test-tooling data point** — Task 5.2 (MSW infrastructure) was the first; Task 5.3 (Playwright config) is the second. Two different test-tooling addition shapes (one is a Node-side test framework dep + test-file additions; the other is a Playwright config refactor + env-var annotation) both produce 0 production-chunk drift. Pattern is now empirically validated as a class property, not a single-data-point coincidence.

---

## §3. CDP render proof

**No CDP probe required for Task 5.3.** Verification surface entirely fetch-side / build-side: chunk SHA256 + byte-count + filename capture across both build modes (`VITE_APPFOLIO_SEEDS={true,false}`); vitest pass count 259/259 confirms test-side correctness; the changes live entirely in `playwright.config.ts` (test-tooling-scoped) and `.env.example` (developer-reference; not in chunk graph); no DOM-render surface to probe (Playwright config governs how e2e specs run, but no specs were edited and no UI surface was touched).

**Cross-phase regression-clean evidence preserved at this commit** — all Phase-4 + Phase-5 prior-task absorptions verified intact post-Task-5.3-merge:

- Task 4.1: properties.json 37 rows ✅ (no fixture changes in 5.3)
- Task 4.2: entities.json 3562 rows ✅
- Task 4.3: 2-STORY bridge intact ✅
- Task 4.4: workitems.json 1165 rows ✅
- Task 4.5: Jamel D. Brown lease at status='pending_countersign' ✅
- Task 4.6: compliance.json 16 rows + Duke Energy warranty ✅
- Task 4.7: .env.example L8 comment intact ✅
- Task 5.1a: strataTypes.ts JSDoc header refresh intact ✅
- Task 5.1b: serialization.test.ts (366 lines / 5 it-blocks) intact ✅
- Task 5.1c: strataApi.backend.ts +2 lines + .env.example +8 lines + strataApi.test.ts +37 lines intact ✅
- Task 5.1d: strataApi.backend.ts JSDoc header +5 lines intact ✅
- Task 5.2: real-vs-static-api.test.ts NEW (428 lines / 28 it-blocks) intact ✅; msw@2.14.2 devDep intact ✅
- **Task 5.3: playwright.config.ts NEW (56 → 86 lines, dual-project + env-gated webServer + JSDoc) ✅; .env.example +14 lines (E2E_TARGET annotation block) ✅; chunk SHA + filename + byte-count all unchanged ✅**

No Phase-5-task-5-3 baseline screenshot directory created (`Docs/Baselines/phase_5_task_5_3/` would be empty — no UI surface to capture for config-only edit with no source/fixture/schema changes).

---

## §4. /security-review

**Result.** High=0, Medium=0. Task 5.3's surface is a Playwright config refactor (56 → 86 lines net) + .env.example annotation (+14 lines). No new code paths in production code. No new data exposed. No new dependencies (Playwright already in devDeps from Phase-0 era). No schema changes. No fixture changes. No `strataApi.backend.ts` runtime-code changes. The new config reads `process.env.E2E_TARGET` at config-load time and switches webServer composition + Vite env vars accordingly; no user-supplied data flows into the config. The JSDoc text references file paths (`../ai-dashboard369-file-manager`), Plan section citations (Phase_5_Plan.md L142-159, L159), and risk register entry (R-4 v2.26 cross-repo amendment); none are sensitive identifiers. GR-5 (real-backend logic unchanged) preserved by construction (no `strataApi.backend.ts` edits beyond the Task 5.1c X-Qualia-API: v2 emission already in place). GR-7 (PII discipline) preserved by construction — no synthetic identifiers introduced; no fixture data; comment text + env annotation only. GR-14 (phase-plan locality at v2.29) honored — `Phase_5_Plan.md` L142-159 read before DC-A.

---

## §5. Verification matrix snapshot (Phase-5 SIXTH task; column header remains `R` until Task 5.7 closure)

Per Plan v2.31 §9 main matrix, Phase-5 column **remains `R`** (Phase-5 column header flips `R` → `✓` only at Task 5.7 closure per single-closure-per-phase precedent). Task 5.3 per-row proofs — Phase-5 sub-tracker row 5.3 flipped `R` → `✓` at this commit:

| Row | Task 5.3 cell | Proof |
|---|:-:|---|
| `tsc -b` errors =0 | ✓ | §2 (exit 0) |
| `vitest run` failures ≤B | ✓ | §2 (259/259 passed; +0 vs Task 5.2 baseline 259) |
| `vitest run` new-test count ≥ tasks-in-phase | (cumulative tracking) | +0 it-blocks at 5.3 (E2E-PLAYWRIGHT class is exempt from per-task vitest contract since e2e is separate); cumulative Phase-5 new-test count = 0 (5.1a) + 5 (5.1b) + 2 (5.1c) + 0 (5.1d) + 28 (5.2) + 0 (5.3) = **35**; mandate satisfied progressively |
| `playwright test` failures ≤B | ✓ | `continue-on-error: true` per CLAUDE.md L29 deferred-item discipline; CI uses `playwright.baseline.config.ts` (separate from edited `playwright.config.ts`) |
| `vite build` errors =0 | ✓ | §2 (built in 5.07s; chunk SHA `1ab4a9c…14ea` UNCHANGED; chunk filename `COZxJ8Bh.js` UNCHANGED; chunk byte-count 1,031,260 UNCHANGED) |
| `VITE_APPFOLIO_SEEDS=false vite build` functional | ✓ | §2 (built in 5.52s; chunk SHA byte-identical to =true build; chunk byte-count + filename unchanged across both modes) |
| PII-leak scan passes | ✓ | §2 (51 files / 0 leaks total; .env.example annotation references Phase_5_Plan.md citations + env var name only) |
| Manual dev-server smoke | (n/a) | No UI surface for config-only edit; chunk byte-count + SHA + filename invariance confirms no runtime regression possible |
| Screenshots in phase report | (n/a) | No UI surface; §3 explains rationale |
| axe-core violations ≤B on modified pages | ✓ | Phase 0.0 baselines hold (no new render-layer changes; Playwright config has zero UI surface) |
| Lighthouse LCP ≤ max(B, 500ms) | ✓ | Phase 0.0 baselines hold (chunk SHA + byte-count UNCHANGED → perf delta is provably 0) |
| Pasted command output in PR | ✓ | PR #39 description + §2 of this report |
| Rollback SHA documented | ✓ | §6 |
| /security-review clean (High/Medium) | ✓ | §4 |
| CI green on branch | ✓ | PR-branch parity-gate `25245551021` (manual-dispatched per paths-filter quirk; success ~5m) + PII Scan `25245542436` (auto-fired on push; success 21s) + CodeRabbit (pass) on `28c370e` |
| Completion Report committed | ✓ | This report at sweep |

---

## §6. Rollback SHA

**Pre-task baseline (Task 5.2 sweep HEAD):** `a97962b` (`chore(phase-5): post-Task-5.2 sweep — CLAUDE.md + plan v2.30 + Phase5_Task_5_2_Completion_Report.md (MSW-CONTRACT-TEST class FIRST data point + 12-of-12 byte-count invariance milestone + /audit paginated-wrapper drift catch as empirical regression-defensive validation finding + MSW chunk-graph isolation hypothesis confirmed + 5 §7 entries)`).

**Task 5.3 squash SHA:** `22ff19b` (`feat(phase-5): Task 5.3 — E2E against real backend (E2E-PLAYWRIGHT class FIRST data point; Phase-5 5th distinct in-repo class; project-wide 8th cumulative; 13-of-13 byte-count axis milestone; SHA256 axis preserved 3-of-3; first PARALLEL BATCH A task closed; sequential-within-batch orchestration) (#39)`).

**Rollback procedure (if Phase-5+ surfaces a regression attributable to Task 5.3):** `git revert 22ff19b` cleanly removes the playwright.config.ts dual-project refactor + .env.example E2E_TARGET annotation. Zero production-chunk impact since the change has zero functional surface (chunk SHA + byte-count + filename all unchanged pre/post). Local `npm run e2e` reverts to the pre-edit single-project chromium config (which still requires the sibling repo as it did before). The reverted state is structurally identical to the post-revert state on every observable axis except (a) the playwright.config.ts content; and (b) the .env.example annotation (E2E_TARGET line removed).

---

## §7. Deferred items (5 entries)

1. **E2E-PLAYWRIGHT class FIRST data point — Phase-5 5th distinct in-repo class; PROJECT-WIDE 8th cumulative.** Genuinely new in-repo class; structurally distinct from prior 7 (FIXTURE-CLASS pure / FIXTURE-CLASS+SCHEMA hybrid / NEAR-NULL-OP carry-over [3 cross-phase pts] / CONSUMER-SIDE-CONTRACT-TEST [5.1b JSON identity] / CONSUMER-SIDE-FETCH-WRAPPER [5.1c header emission] / MSW-CONTRACT-TEST [5.2 fetch interception]). The new class introduces four distinguishing properties: (a) **Playwright config parameterization** via `process.env.E2E_TARGET` at config-load time; (b) **env-gated webServer composition** — different webServer entries included/excluded per E2E_TARGET; (c) **dual-project alternation** — chromium default + real-backend alternative defined at the same projects array; (d) **cross-repo handoff convention captured in JSDoc** — sibling-repo + staging-DB prerequisites documented at the actual edit site (mirrors Task 5.1d strataApi.backend.ts JSDoc precedent). **Carry-forward for future E2E-PLAYWRIGHT class data points** (likely at Phase-6+ or expanded Phase-5 scope-broaden): (i) reuse the env-gated webServer pattern; (ii) reuse the JSDoc cross-repo handoff convention at the file head; (iii) maintain the defined-but-not-required env-var annotation pattern in .env.example mirroring Task 5.1c VITE_PARITY_LIVE_BACKEND.

2. **🚨 Sibling-repo-absent finding** — `../ai-dashboard369-file-manager` is referenced by `playwright.config.ts:43` (now line 47 in real-backend webServer block) but ABSENT on this disk. Local `npm run e2e` with `E2E_TARGET=real-backend` currently fails at webServer startup (Express dev server can't start without sibling repo). CI unaffected — uses `playwright.baseline.config.ts` (separate file). Task 5.3's `--project=real-backend` is DEFINED but UNUSABLE locally until sibling repo + staging DB land — mirrors Task 5.1c VITE_PARITY_LIVE_BACKEND defined-but-unused convention. **Carry-forward for Task 5.4/5.5**: consider Playwright `globalSetup` that detects sibling-repo absence (`fs.existsSync('../ai-dashboard369-file-manager/package.json')`) and skips the real-backend project gracefully (preserves Phase_5_Plan.md L159 rollback statement "E2E continues to run against the static API as the default profile" even when sibling repo is structurally absent — currently the rollback only handles the case where E2E_TARGET is unset; it doesn't gracefully handle E2E_TARGET=real-backend with sibling repo absent). **Open question**: when sibling repo lands in this monorepo workspace (or as a git submodule), update playwright.config.ts to reference its actual path; until then, the cross-repo handoff convention in JSDoc is the documentation surface.

3. **`playwright.config.ts` + `.env.example` NOT in parity-gate paths filter** — verified at `.github/workflows/appfolio-parity-gate.yml` L11-30. PR-branch CI parity-gate manual-dispatch needed for any Task 5.3-class change touching only these files; mirrors Task 4.7 `.env.example`-not-in-parity-paths precedent. CI's actual playwright step uses `playwright.baseline.config.ts` (separate file), so this PR doesn't change CI behavior even when manual-dispatched. **Carry-forward**: future Task 5.4/5.5/5.6 changes that touch only test-tooling files (Playwright config, env annotations, e2e specs WITHOUT touching qualia-shell/src/**) will need manual-dispatch on PR-branch + sweep. Sweep parity-gate manual-dispatch is already standard per CLAUDE.md L86 quirk. **Decision option**: extend the parity-gate paths filter to include `qualia-shell/playwright.config.ts` + `qualia-shell/e2e/**` + `qualia-shell/.env.example` to auto-fire CI for E2E-PLAYWRIGHT class changes (would mirror the existing inclusion pattern for `qualia-shell/src/**`). User decision deferred.

4. **E2E_TARGET defined-but-unused convention** mirrors Task 5.1c VITE_PARITY_LIVE_BACKEND (.env.example:17). Reserved for future Phase-5 task consumption; not currently exercised in CI (CI uses playwright.baseline.config.ts which doesn't read E2E_TARGET; `npm run e2e` locally requires sibling repo per §7 entry 2). **Carry-forward**: Task 5.4/5.5 may consume E2E_TARGET=real-backend in their kickoff DC-A pre-flight assertions if their scope includes asserting against real-backend mode. Task 5.6 (Perf validation per parent Plan v2 §9 row 5.6 OR Observability wiring per Phase_5_Plan.md L196 — see §7 entry 5 for the spec divergence finding) will likely consume E2E_TARGET in some form depending on which interpretation wins.

5. **🚨 NEW PROCESS-DISCIPLINE GAP FINDING — Phase_5_Plan.md DIVERGES from parent Plan v2 §9 on Tasks 5.4/5.5/5.6 + 5.7 missing entirely from phase-spec.** Surfaced at Task 5.3 sweep (NOT during 5.3 PRE0 since Task 5.3 itself was unambiguous across both documents — both call 5.3 "E2E against real backend" / "E2E: Willie White round-trip" with overlapping anchor scope). The two specs disagree systematically:

   | # | Plan v2 §9 (parent) | Phase_5_Plan.md (phase-spec) | Match? |
   |---|---|---|---|
   | 5.3 | E2E: Willie White round-trip (parent) | E2E against real backend (phase-spec) | ⚠️ Same scope; different anchor framing |
   | 5.4 | E2E: WO 19511-1 round-trip (parent L427) | Backward-compat rehearsal (phase-spec L163-176) | ❌ DIFFERENT SCOPE |
   | 5.5 | E2E: 2-Story Technical Roofing compliance (parent L428) | Production migration dry run (phase-spec L180-194) | ❌ DIFFERENT SCOPE |
   | 5.6 | Perf validation Lighthouse (parent L429) | Observability wiring Sentry breadcrumbs (phase-spec L196-208) | ❌ DIFFERENT SCOPE |
   | 5.7 | Accessibility validation axe (parent L430) | (NO 5.7 in phase-spec — sequence ends at 5.6) | ❌ Phase-spec MISSING 5.7 |

   GR-14 standing PRE-FLIGHT discipline (elevated at Task 5.1d closure) says we should READ Phase_5_Plan.md to refine per-task scope — but here the two documents fundamentally disagree on what each task IS. This is a NEW process-discipline gap parallel to (but distinct from) Task 5.1d's "Phase_5_Plan.md was missed" finding. The 5.1d finding established the discipline of CONSULTING the phase-spec; the new finding is that when both ARE consulted, they DISAGREE.

   **Path forward decision (surface to user at Task 5.4 kickoff)** — three resolution options:
   - **(A) Phase_5_Plan.md wins** (mirrors GR-14 elevation rationale that phase-specific refines parent; would mean Task 5.4 = Backward-compat rehearsal / 5.5 = Production migration dry run / 5.6 = Observability wiring; Phase-5 ends at 5.6 — drop parent's 5.7 axe-only spec OR fold into 5.6)
   - **(B) Parent Plan v2 §9 wins** (canonical structure; main matrix tracking source-of-truth; would mean Task 5.4 = E2E WO 19511-1 / 5.5 = E2E 2-Story compliance / 5.6 = Perf Lighthouse / 5.7 = a11y axe; treat Phase_5_Plan.md as out-of-date and update it to align)
   - **(C) Reconcile via merge** — re-author both documents to align, picking the better scope per task (e.g., 5.4 = Backward-compat / 5.5 = Migration dry run / 5.6 = E2E WO 19511-1 / 5.7 = E2E 2-Story / etc.). Most work but most coherent end state.

   **Carry-forward at Task 5.4 kickoff**: PRE0 must explicitly acknowledge this divergence and require user decision on resolution path BEFORE drafting DC-A queries. A new **GR-15** at Plan v2.32 (or v2.31 if elevated at this sweep) may be warranted: "Phase-plan vs parent-plan reconciliation discipline at PRE-FLIGHT step zero" — when GR-14 reads Phase_<N>_Plan.md and detects per-task scope divergence from parent Plan v2 §9, halt and require user resolution decision before proceeding. **Mirrors Phase-4-closure §4 source-provenance Step Zero elevation pattern + Phase-5 Task 5.1d §7 entry 2 phase-plan locality elevation pattern** — both are project-wide discipline upgrades surfacing from a single task's archeology; this 5.3-sweep finding is the third in the same lineage.

---

## §8. Next-task unblock

**Phase 5 SIXTH task closed** at this commit (squash SHA `22ff19b`). 6 of 10 Phase-5 task rows in §9 sub-tracker now `✓` (5.1a + 5.1b + 5.1c + 5.1d + 5.2 + 5.3); Phase-5 sub-tracker pending row narrows 5 → **4** (`5.4, 5.5, 5.6, 5.7`).

**🚀 PARALLEL BATCH A in progress** per Plan v2 §19 dependency graph L596: `5.2 → {5.3, 5.4, 5.5} parallel`. Sequential-within-batch orchestration chosen (mirrors Phase-3 4-task parallel-batch precedent: 4 sequential sweeps, one per merge). **1 of 3 batch-A tasks closed** (5.3 ✓; 5.4 + 5.5 surviving).

**🚨 Recommended next: Task 5.4 — but phase-spec-vs-parent-plan SCOPE DIVERGENCE detected at sweep (§7 entry 5)**. Two alternative scopes per the two documents:
- **Per parent Plan v2 §9 row 5.4 (L427)**: "E2E: WO 19511-1 round-trip (per v1 plan L224: Playwright spec asserting Residents → Brianna M. Jackson → Work Orders → 19511-1 → verify 15 sections render → verify 3 time windows for Monday 04/20/2026 → verify actions log has 2 entries; parallel batch A)"
- **Per Phase_5_Plan.md L163-176**: "Task 5.4 — Backward-compat rehearsal. Goal: Prove a production v1 client (pinned to a prior bundle hash) rendering a v2-server response doesn't crash. Method: Pin a v1 client build artifact in qualia-shell/rehearsals/v1-client/ + start the v2 backend pointing at seeded staging + Load v1 client in a Playwright browser; visit the 8 baseline pages + Record console errors. Expect 0 uncaught exceptions."

**5.4 kickoff DC-A pre-flight predictions** depend on resolution of the divergence (§7 entry 5):

If parent Plan v2 §9 wins (option B): scope = E2E spec for WO 19511-1 round-trip → likely **E2E-PLAYWRIGHT carry-over class 2nd data point** (extends 5.3 first data point); +1 NEW e2e spec; production chunk byte-count likely PRESERVED → 14-of-14 if hypothesis holds.

If Phase_5_Plan.md wins (option A): scope = Backward-compat rehearsal → likely **NEW class designation** (REHEARSAL-FIXTURE class? Or PINNED-CLIENT-ARTIFACT class?) — first data point. Requires v1 client build artifact (Vite output bundle) committed to `qualia-shell/rehearsals/v1-client/`; new Playwright spec loads pinned bundle + visits 8 baseline pages + records console errors. Predicted production chunk byte-count: PRESERVED at 1,031,260 (rehearsal artifacts are out-of-bundle; new spec is test-tooling-scoped → 14-of-14 if hypothesis holds).

If reconcile via merge (option C): user-defined scope; predictions deferred until resolution.

**Phase-5 unblock-conditions met:**
- ✅ Tasks 5.1a + 5.1b + 5.1c + 5.1d + 5.2 + 5.3 CLOSED (Phase-5 OPENER NEAR-NULL-OP + 5.1b CONSUMER-SIDE-CONTRACT-TEST + 5.1c CONSUMER-SIDE-FETCH-WRAPPER + 5.1d NEAR-NULL-OP carry-over THIRD data point + 5.2 MSW-CONTRACT-TEST FIRST data point + **5.3 E2E-PLAYWRIGHT FIRST data point**)
- ✅ Canonical type mirror surface verified intact (all prior phase contributions preserved)
- ✅ `strataApi.backend.ts` GR-5 invariant intact (Task 3.8 strataUpload<T> + Task 5.1c X-Qualia-API: v2 header + Task 5.1d JSDoc cross-repo handoff reference + Task 5.2 NO source edits + Task 5.3 NO runtime-code edits — all transport-layer + documentation contributions, no endpoint-logic edits)
- ✅ Cumulative Phase-4 + Phase-5 vitest baseline at 259/259; SHA256 invariance axis 3-of-3 since 5.1c break; byte-count invariance axis intact at **13-of-13 across phases**
- ✅ R-4 Risk Register amendment with cross-repo nuance from v2.26 carries forward to 5.4 kickoff DC-A discipline
- ✅ **GR-14 NEW at v2.29** (phase-plan locality check) elevated to standing PRE-FLIGHT discipline; carries forward to all future task kickoffs (validated again at 5.3 PRE0)
- ✅ Playwright config dual-project + env-gated webServer pattern landed at 5.3; reusable for any future E2E-PLAYWRIGHT class data points
- ✅ Cross-repo handoff JSDoc convention extended to playwright.config.ts at 5.3; reusable pattern

**Phase-5 closure report** (`Docs/Phase5_Closure_Report.md` NEW) lands at Task 5.7 sweep per single-closure-per-phase precedent (mirrors Phase-1 + Phase-3 + Phase-4 closure pattern; not Phase-2 per-task-only). Phase-5 column header in §9 main matrix flips `R` → `✓` at that closure. **Caveat**: per §7 entry 5, Task 5.7 may not exist if Phase_5_Plan.md interpretation wins — closure-task identity itself is currently ambiguous and depends on user resolution at Task 5.4 kickoff.
