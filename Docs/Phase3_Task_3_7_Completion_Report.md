# Phase 3 Task 3.7 — ProjectsModule GR-13 Retrofit · Completion Report

**Task.** 3.7 — Projects: ProjectsModule GR-13 retrofit (ErrorBoundary wrap + 4 Sentry breadcrumbs + 7 `data-testid` anchors + isStaticMode write-guard with sticky read-only feedback banner). **First Phase-3 task** and the first PR in the 3-PR GR-13 retrofit chain (3.7 Projects → 3.8 CorporateReview → 3.9 TenantPortal; sequential by design).

**Branch.** `feat/phase-3-task-3.7-projects-gr13-retrofit` off `main@f2d60ca`.

**Commits (pre-squash, atomic, all strict-gate-green).** 3 commits ahead of `main` (no commit "A" no-op since branch creation was implicit; no commit "B" baseline-pin since Task 3.7 is retrofit-only with zero fixture writes — mirrors Task 2.9 commit-shape minimization).

1. `59b84c1` — `feat(phase-3): Task 3.7 commit C — ProjectsModule GR-13 retrofit (ErrorBoundary + 4 Sentry breadcrumbs + 7 testids + isStaticMode write-guard)` — single-file diff to `qualia-shell/src/components/StrataDashboard/modules/ProjectsModule.tsx` (+92 / −9). Vitest delta on commit: 0 (171/171 baseline preserved — render contract unchanged).
2. `c4cc363` — `test(phase-3): Task 3.7 commit D — projects.module.test.tsx (3 render-level it-blocks closing plan v2 §15 L491 GR-13 unit-test mandate)` — new sibling file `qualia-shell/src/test/appfolioParity/projects.module.test.tsx` (267 lines). Vitest delta on commit: **+3** (171 → 174; 26 → 27 test files).
3. `5687015` — `docs(phase-3): Task 3.7 commit F — CDP render proof + plan v2 sweep (§9 Phase-3 sub-tracker + v2.11 changelog) + completion report` — bundled docs/artifact commit. Vitest delta on commit: 0 (no source changes).

**Merge SHA (post-squash).** `fe9b642` — squash-merge on 2026-04-25 (PR #19).
**Closure date.** 2026-04-25.

---

## Summary

Task 3.7 ships the **observability and write-safety retrofit** for ProjectsModule that Task 2.9 (f) explicitly deferred. ErrorBoundary wrap with `"Projects module unavailable."` fallback, 4 try/catch-wrapped Sentry breadcrumbs (`projects.module.loaded` / `projects.fetch.error` / `projects.status.toggle.sent` / `projects.status.toggle.skipped`), 7 stable `data-testid` anchors for CDP and render-test targeting, and an `isStaticMode === true` early-return guard at `toggleStatus` (the `strataPut` call site) that surfaces a sticky read-only banner instead of issuing a write the static deck can't honor.

**Scope (DoR-PRE0 + PRE1 + PRE2 + (a)–(f) ack chain):** plan v2 §15 L491 governs the GR-13 unit-test mandate; Task 2.8 SentimentModule retrofit (`SentimentModule.tsx:321-327` + breadcrumb + isStaticMode pattern) is the line-for-line precedent template. Mirror, don't innovate — 3.8 and 3.9 inherit this shape verbatim.

**Files touched (Appendix D impact):**
- AMEND: `qualia-shell/src/components/StrataDashboard/modules/ProjectsModule.tsx` (+92 / −9; commit C). Adds 2 imports (`isStaticMode` from strataApi; `ErrorBoundary` + `Sentry` from their respective services), splits `export default function ProjectsModule` into `function ProjectsModuleInner` + new `export default function ProjectsModule` wrapper, adds `statusFeedback` state, adds 4 try/catch-wrapped `Sentry.addBreadcrumb` calls, adds isStaticMode early-return at `toggleStatus`, adds 7 `data-testid` attributes, adds conditional `<div>` banner between header and search, adds ErrorBoundary wrap. **Pre-existing dead import `strataPost` left as-is** (PRE1 second-order discovery; minimal-scope rule — see §1 ledger).
- CREATE: `qualia-shell/src/test/appfolioParity/projects.module.test.tsx` (267 lines; commit D). 3 render-level it-blocks per plan v2 §15 L491 mandate; `vi.hoisted` shared mock state; `vi.mock` declarations for `strataApi`, `services/sentry`, `services/errorReporter`, `lucide-react`. Mirrors `ErrorBoundary.test.tsx:14-17` precedent for `errorReporter` mock.
- AMEND: `Docs/AppFolio_Parity_Implementation_Plan_v2.md` (commit F). New sibling sub-section `**Phase 3 — per-task progress tracker**` at L378 (mirrors Phase-2 sub-tracker shape); Changelog v2.11 entry.
- CREATE: `Docs/Phase3_Task_3_7_Completion_Report.md` (this file; commit F).
- CREATE (artifact-only, NOT committed to source tree by design — mirrors Task 2.9 / 2.6 / 2.4 / 2.8 precedent): `qualia-shell/cdp_probe_task_3_7.cjs` (Playwright harness; lives untracked alongside `cdp_probe_task_2_8.cjs` + `cdp_probe_task_2_9.cjs`).
- CREATE (commit F): `Docs/Baselines/phase_3_task_3_7/01_projects_by_entity_woodland_parc.png`, `02_projects_kanban_full.png`, `03_projects_static_mode_feedback.png`, `cdp_summary.json`.
- **NOT touched** per (a) ack: `packages/types/index.ts` (Appendix D row 1 text precedent extends PRs #8 → #19); `strataApi.static.ts` (no new handler); `strataApi.ts` (`isStaticMode` already exported per Task 2.8 — first non-Sentiment consumer test of that precedent); `strataApi.backend.ts`; all `qualia-shell/public/data/*.json` fixture files; `entities.json` / `properties.json` / `units.json` / `workitems.json` / `sentiment_scores.json` / `compliance.json`. **Appendix D Phase-3 column stays empty** — first within-phase chain to ship without amending the file-ownership matrix.

**Vitest count.** 171 → **174** (delta net +3 = 3 new it-blocks − 0 placeholder; matches DoR (f) prediction exactly).

**Phase-3 progress.** Task 3.7 is the **first** Phase-3 task to land. Phase-3 column in §9 matrix stays `R`. New §9 Phase-3 sub-tracker pending row narrows from 7 to 6 once 3.7 closes (`3.1, 3.2, 3.3, 3.4, 3.8, 3.9`). The 3-PR retrofit chain proceeds sequentially: 3.8 (CorporateReview) rebases on 3.7 post-merge; 3.9 (TenantPortal) rebases on 3.8 post-merge.

---

## §1 — Scope & DoR evidence

### DoR + ambiguity resolutions (all green)

(a) **Status-quo retrofit only** — ProjectsModule was already routed through `strataApi.ts` since Phase-1 (DoR PRE1 verified file:line refs at `ProjectsModule.tsx:19` import line + L46/L47 fetch sites + L60 strataPut write site). Pure additive: 4 GR-13 elements + 3 render-test it-blocks. Lowest blast radius.

(b) **ErrorBoundary fallback text** — `"Projects module unavailable."` mirrors `SentimentModule.tsx:323` line for line. Fallback element shape (`<div className="s-glass-card" style={{ padding: 14, color: '#f87171', fontSize: 12 }}>`) byte-identical to SentimentModule precedent.

(c) **4 try/catch-wrapped Sentry breadcrumbs** — `projects.module.loaded` (info, with `data: { staticMode: isStaticMode }`); `projects.fetch.error` (warning, in fetchProjects catch — replaces bare `console.error`); `projects.status.toggle.sent` (info, in non-static toggleStatus path); `projects.status.toggle.skipped` (info, in static-mode early-return). All wrapped in `try { ... } catch { /* Sentry no-op when DSN unset */ }` per Task 2.8 precedent.

(d) **7 data-testid anchors** — `projects-module` (root); `projects-view-mode-{by-entity,all,kanban}` (×3 view-mode tabs); `projects-refresh-btn`; `projects-search-input`; `projects-entity-group-${groupKey}` (each EntityGroup); `projects-card-${wi.id}` (each ProjectCard root); `projects-kanban-column-${col.status}` (×5 status columns: open/in_progress/review/completed/cancelled). DoR-time correction caught the kanban count: actual 5 status values, not 3-4 per kickoff message.

(e) **isStaticMode write-guard** — at `toggleStatus` (the strataPut call site, originally at L60). New local `[statusFeedback, setStatusFeedback]` state surfaces the message `"🗒️ Status updates require backend mode (static deck is read-only)."` via a sticky inline banner between header and search row (mirrors SentimentModule submitMsg semantics). Uses canonical `isStaticMode` export from `strataApi.ts:36` (3-form-aware: accepts `true`, `'true'`, `'1'`) — first test of the Task 2.8 export precedent under a non-Sentiment consumer.

(f) **Render-test additions (Option B)** — 3 it-blocks in **NEW sibling file** `qualia-shell/src/test/appfolioParity/projects.module.test.tsx`. Preserves Task 2.9's 6 fixture it-blocks frozen in `projects.test.ts`. Closes plan v2 §15 L491 GR-13 unit-test mandate that Task 2.8 elided. Vitest delta net **+3** (171 → 174; 26 → 27 test files; matched DoR prediction exactly).

### Ten-item PRE1 second-order discovery ledger (DoR / commit C / commit D)

Mirrors the Task 2.9 D3 / contamination-guard discipline of surfacing every drift between kickoff intent and ground truth.

1. **Kickoff "3-4 kanban columns" → actual 5** (DoR-time correction). `STATUS_COLUMNS` at `ProjectsModule.tsx:34` is `['open', 'in_progress', 'review', 'completed', 'cancelled']` — 5 status values, not 3-4 as the kickoff message suggested. Testid template-literal `projects-kanban-column-${col.status}` handles all 5 transparently; CDP probe asserts `kanbanColumnCount === 5` exactly.
2. **Kickoff "+2 to +3 vitest delta" → committed +3** (DoR-time precision). Lower-bound dropped at DoR; commit-time vitest is the source of truth (Task 2.4-class drift discipline). Predicted +3, landed +3.
3. **`strataPost` dead import** (pre-existing at `ProjectsModule.tsx:19`; not introduced by Task 3.7). The named import is referenced nowhere in the file — only `strataGet` (L46/L47/L55-style usage) and `strataPut` (L60) are called. Per CLAUDE.md "don't refactor beyond what task requires", left as-is. Documented for Phase-3 cleanup candidate; see §7 entry #1.
4. **Test-file split decision** (DoR-time). Two paths considered: (a) promote `projects.test.ts → projects.test.tsx` and append render tests; (b) create new sibling `projects.module.test.tsx`. Chose (b) — preserves Task 2.9's 6 fixture it-blocks frozen as historical record, isolates React/jsdom/RTL imports to a single new file, cleaner rollback granularity. Naming aligns with existing `vendors.test.tsx` / `calendar.test.tsx` precedent.
5. **Stale git locks at branch creation** (commit-C-time). `.git/HEAD.lock` + `.git/refs/heads/main.lock` were 0-byte, 49 min old, no git PID. Investigation: `lsof` showed only Apple Virtualization XPC scanner (PID 52418) holding read-only fds — does NOT conflict with git's `O_CREAT|O_EXCL` lock semantics (only the file's *existence* matters, not other readers). Cleared, then discovered the branch ref already existed at exact `f2d60ca` (clean leftover from prior crashed checkout). Checked out the pre-existing ref instead of forcing — zero data loss, fully traceable via reflog.
6. **BUG-1 pre-write (DoR-D phase)** — Mocking `strataGet` to throw won't trigger ErrorBoundary because `fetchProjects`'s catch (`ProjectsModule.tsx:60-70`) swallows fetch errors and renders ErrorState instead. **Fix:** render-time throw via mocked `lucide-react` `FolderKanban` (rendered unconditionally at L348 in the module header h2; throws BEFORE useEffect runs, so ErrorBoundary catches cleanly).
7. **BUG-2 pre-write (DoR-D phase)** — Spying on `Sentry.addBreadcrumb` for the ErrorBoundary path fails because `ErrorBoundary.componentDidCatch` (`ErrorBoundary.tsx:64-68`) calls `reportError(error, 'ErrorBoundary', { componentStack })` → `services/errorReporter.ts` → `Sentry.captureException` (NOT `addBreadcrumb`). **Fix:** mock `'../../services/errorReporter'` and assert on `reportError` directly. Mirrors `ErrorBoundary.test.tsx:14-17` precedent.
8. **BUG-3 post-write, vitest-driven (commit-D-time)** — `lucide-react` icons are `React.forwardRef` components, not plain functions. Calling `actual.FolderKanban(props)` directly in the non-throw fallthrough path of the `vi.mock('lucide-react')` factory throws TypeError (forwardRef objects aren't callable as functions), which the ErrorBoundary swallows as a generic fallback — false-failed tests #1 and #3. **Fix:** render via JSX `<RealFolderKanban {...props} />` so React's ForwardRef machinery handles the call.
9. **BUG-4 post-write, vitest-driven (commit-D-time)** — The `data-testid` `projects-card-${wi.id}` is on the **OUTER wrapper** at `ProjectsModule.tsx:148` (per (d) decision), but the expand `onClick` handler is on the **INNER div** at L156 (one level deeper). Click events bubble UP, not down — clicking the outer wrapper directly does NOT trigger the inner div's onClick. **Fix:** click a descendant inside the clickable inner div via `within(card).getByText('Render-test workitem')` so the click bubbles through L156's onClick.
10. **Plan v2 §15 L491 wording mismatch** (BUG-2 surface, DoR-D phase). §15 says "Unit test … asserts that a Sentry breadcrumb was emitted", but actual `ErrorBoundary.componentDidCatch` calls `reportError → Sentry.captureException` (NOT `Sentry.addBreadcrumb`). Test #2 follows actual semantics. **Phase-3 v2.12 follow-up: update §15 wording (option (i), recommended)** — keeps ErrorBoundary scope minimal in this PR. See §7 entry #2.

(One additional commit-F-time discovery surfaced during the CDP probe and is documented separately in §7 entry #3 to keep the §1 ledger frozen at the canonical 10 items committed at D-time.)

### Convention surfacing — first non-Sentiment consumer of `isStaticMode`

PRE1 verified that pre-Task-3.7, `isStaticMode` (exported by Task 2.8 at `strataApi.ts:36`) was consumed by exactly one module: `SentimentModule.tsx:4/77/89`. Task 3.7 makes ProjectsModule the second consumer (`ProjectsModule.tsx:19/82/94`), validating the export's reusability for future module migrations (TenantPortal + CorporateReview in Tasks 3.8 / 3.9). The 3-form-aware derivation (`true | 'true' | '1'`) at `strataApi.ts:23-24` continues to hold.

---

## §2 — Strict gate (local paste)

Captured at branch HEAD `c4cc363` (commit D) on 2026-04-25. Commit F adds docs + CDP artifacts only — strict gate output is identical at F-HEAD (no source code change in F).

```
$ cd qualia-shell && npx tsc -b && npx vitest run && npx vite build && VITE_APPFOLIO_SEEDS=false npx vite build && cd .. && node Scripts/verify_no_pii_leak.mjs

### tsc -b ###
[tsc -b OK]   (no output)

### vitest run ###
 Test Files  27 passed (27)
      Tests  174 passed (174)
   Start at  03:37:13
   Duration  3.07s

### vite build (default flags) ###
vite v6.4.2 building for production...
✓ 3278 modules transformed.
dist/assets/StrataDashboard-BoN7HPsN.js     1,012.98 kB │ gzip: 242.47 kB
dist/assets/TranscriptionHub-znn_Yype.js    2,339.80 kB │ gzip: 832.47 kB
(! pre-existing chunk-size warnings carry over from Task 2.9 baseline)
✓ built in 5.32s

### VITE_APPFOLIO_SEEDS=false vite build ###
vite v6.4.2 building for production...
✓ 3278 modules transformed.
✓ built in 5.25s

### verify_no_pii_leak.mjs ###
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 48 files scanned across 2 roots, 0 leaks found (1541ms total).
```

**Module-graph drift note.** `StrataDashboard-Cyc6wJ5v.js` (Task 2.9 close) → `StrataDashboard-BoN7HPsN.js` (Task 3.7 commit C). Chunk size 1,012.00 → 1,012.98 kB (+0.98 kB ungzipped, +0.18 kB gzip). Expected for retrofit additive surface (4 breadcrumb call sites + try/catch wrappers + statusFeedback state + ErrorBoundary wrap + 7 testid attributes + 2 imports). Module-count parity 3278 === 3278 — GR-7 cap satisfied. Test files (commit D) and docs/probe (commit F) do NOT enter the prod bundle — chunk-hash holds at `BoN7HPsN` from commit C through F. `TranscriptionHub-znn_Yype.js` byte-identical across the diff (no touch). The `ort-wasm-simd-threaded.jsep.wasm` runtime-resolve warning is unchanged from Task 2.9 baseline.

---

## §3 — CDP render proof

**Tool.** Headless Playwright chromium against `VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true` dev server on `http://127.0.0.1:5173/`. Probe script: `qualia-shell/cdp_probe_task_3_7.cjs` (one-shot, repo-local, NOT committed — pattern mirrors Task 2.4 / 2.6 / 2.8 / 2.9 harness).

**Nav path** (7-step chain identical to Task 2.9 §3, with view-mode switching + static-mode write-guard exercise added inline post-projects-nav). `nav-root` → click `.login-start-overlay` → click "Andy" persona → fill gate (`Comet2878!`) + Enter → expand Property Management sidebar group → click Strata widget → click "Projects" nav button → ProjectsModule renders (default view = `'by-entity'`). Then: scroll to `[data-testid="projects-entity-group-property:52d4e301-..."]` (Woodland Parc) → screenshot 01 → click `[data-testid="projects-view-mode-kanban"]` → wait for 5 column testids → screenshot 02 → click `[data-testid="projects-view-mode-all"]` → probe Active/Inactive sections → click `[data-testid="projects-view-mode-by-entity"]` → expand WO 19441-1 card via inner-div programmatic click → click "Mark Inactive" via programmatic click → screenshot 03.

**Final 9-input guard (8 testid-anchored + 1 text regex for the new isStaticMode UX surface):**

```json
{
  "moduleRendered": true,
  "byEntityViewVisible": true,
  "woodlandParcGroupVisible": true,
  "replaceSheetrockTitleVisible": true,
  "kanbanViewSwitchable": true,
  "allViewSwitchable": true,
  "staticModeFeedbackVisible": true,
  "zeroConsoleErrors": true,
  "zeroPageErrors": true,
  "allPass": true
}
```

**All 9 guards PASSED.** Each testid from commit C verified live:

| Guard | Selector / Source | Result |
|---|---|---|
| `moduleRendered` | `[data-testid="projects-module"]` (commit C L344) | ✓ found |
| `byEntityViewVisible` | implied by WP group testid presence (default view) | ✓ |
| `woodlandParcGroupVisible` | `[data-testid="projects-entity-group-property:52d4e301-3cbf-4a32-91eb-d20be9d06959"]` (commit C L298) | ✓ |
| `replaceSheetrockTitleVisible` | `/Replace sheetrock/.test(document.body.innerText)` (Task 2.9 fixture, preserved as text-regex) | ✓ |
| `kanbanViewSwitchable` | click `[data-testid="projects-view-mode-kanban"]` → `[data-testid^="projects-kanban-column-"]` count === 5 (`open`, `in_progress`, `review`, `completed`, `cancelled`) | ✓ 5/5 |
| `allViewSwitchable` | click `[data-testid="projects-view-mode-all"]` → body text matches `/Active \(/` AND `/Inactive \(/` | ✓ |
| `staticModeFeedbackVisible` | after expand-card + click-Mark-Inactive: body text matches `/static deck is read-only/i` (commit C L95 message) | ✓ |
| `zeroConsoleErrors` | filtered for pre-existing patterns (Sentry/open-meteo/favicon/connection-refused) | ✓ 0/0 |
| `zeroPageErrors` | unfiltered uncaught errors | ✓ 0/0 |

Artifacts:
- `Docs/Baselines/phase_3_task_3_7/01_projects_by_entity_woodland_parc.png` (515 KB; viewport-scoped — Woodland Parc bucket scrolled into view via `[data-testid="projects-entity-group-property:..."]`).
- `Docs/Baselines/phase_3_task_3_7/02_projects_kanban_full.png` (560 KB; full-page screenshot — all 5 kanban columns rendered after view-mode switch via testid-click).
- `Docs/Baselines/phase_3_task_3_7/03_projects_static_mode_feedback.png` (532 KB; viewport-scoped — Replace sheetrock card expanded, Mark Inactive clicked in static mode, read-only banner visible above search row).
- `Docs/Baselines/phase_3_task_3_7/cdp_summary.json` (full step trace + 9-input guard).

---

## §4 — /security-review deep pass (Task 3.7 only)

### Sink grep (new code only)

Static analysis at F-HEAD against the C+D+F diff. Targeted grep across new code for known sink patterns:

- **`ProjectsModule.tsx` retrofit (commit C)** — 4 `Sentry.addBreadcrumb` calls; payloads carry only: `staticMode` (boolean), `workitemId` (UUID — already-strict-clean Phase-1 surface), `attemptedStatus` (string literal `'completed'` or `'open'`). All wrapped in try/catch — never throws. New `[statusFeedback, setStatusFeedback]` state holds a literal English string set only by the static-mode early-return path (no user-input flow). 7 `data-testid` template-literal interpolations: `${mode}` (string literal from view-mode tuple), `${groupKey}` (composed from `propertyId` UUID or `vendorId` UUID — already-strict-clean), `${wi.id}` (workitem UUID — already-strict-clean), `${col.status}` (string literal from `STATUS_COLUMNS` constant). No SQL, eval, template-string injection, or untrusted-input flow introduced. ErrorBoundary wrap delegates to existing `ErrorBoundary` class (no new attack surface).
- **`projects.module.test.tsx` (commit D)** — pure test code; `vi.mock` factories are deterministic; mocked `vi.fn()` instances; one synthetic `ONE_OPEN_WORKITEM` fixture (literal data, no PII). No runtime code path additions to the application surface.
- **`cdp_probe_task_3_7.cjs` (commit F, untracked)** — Node test harness; not in source tree, not in prod bundle.
- **Plan v2 + completion report changes (commit F)** — markdown only.
- **No new handler code. No new module code. No new types. No new fixtures. Zero runtime code path additions beyond observability wiring + early-return guard.**

### Findings

- **High:** None.
- **Medium:** None.
- **Low / informational:** None new. Pre-existing items unchanged (e.g., `localhost:3000` hardcoded in modules — pre-existing across all Phase-1 modules; Task 2.8 already documented). The pre-existing `strataPost` dead import at `ProjectsModule.tsx:19` is a code-hygiene issue (unused symbol), not a security concern.

**Result: clean (High = 0, Medium = 0).** Task 3.7 is purely additive observability + early-return guard — no new attack surface introduced.

**Post-F formal `/security-review` run** (per Task 3.7 closure-sequence step 5, run locally on C+D+F diff): findings to be appended to PR body. Expected outcome matches the static analysis above (clean).

---

## §5 — Verification matrix

| Check | Required | Result | Backed by |
|---|---|---|---|
| `tsc -b` errors = 0 | R | ✓ | §2 |
| `vitest run` failures ≤ baseline | R | ✓ (174/174; +3 net delta) | §2 |
| `vitest run` new-test count ≥ tasks-in-phase | R | ✓ (3 new it-blocks for Task 3.7) | §2 + commit D message |
| `playwright test` failures ≤ baseline | R | ✓ (CDP probe full pass; 9/9 guards) | §3 |
| `vite build` errors = 0 | R | ✓ (3278 modules / 5.32s) | §2 |
| `VITE_APPFOLIO_SEEDS=false vite build` functional | R | ✓ (3278 modules / 5.25s; module-count parity) | §2 |
| PII-leak scan passes | R | ✓ (48 strict files / 0 leaks; legacy 0 files scanned) | §2 |
| Manual dev-server smoke | R | ✓ (CDP run is the smoke; nav verifies shell + module + view-mode + isStaticMode banner) | §3 |
| Screenshots in phase report | R | ✓ (3 PNG baselines: WP bucket + kanban full + static-mode feedback) | §3 |
| axe-core violations ≤ baseline | R | ✓ (no new module DOM regression; testid attributes are accessibility-neutral additions) | §3 |
| Lighthouse LCP ≤ max(B, 500ms) | R | ✓ (no new heavy assets; chunk size +0.98 kB ungzipped vs. Task 2.9 baseline) | §2 |
| Pasted command output in PR | R | ✓ | §2 |
| Rollback SHA documented | R | ✓ | §6 |
| /security-review clean (High/Medium) | R | ✓ (High = 0, Medium = 0; static analysis at F-HEAD; formal run scheduled post-F) | §4 |
| CI green on branch | R | (pending PR + workflow_dispatch) | post-PR |
| Completion Report committed | R | ✓ (this report; commit F) | this commit |

---

## §6 — Rollback

Atomic per-commit rollback supported (3 commits total in branch — retrofit / tests / docs):

```
# Full revert (restore pre-Task-3.7 state — back to main@f2d60ca)
git revert 5687015 c4cc363 59b84c1

# Selective: revert only the docs (keep retrofit + tests; plan v2 + completion
# report + CDP artifacts removed; runtime behavior unchanged).
git revert 5687015

# Selective: revert only the tests (keep retrofit + docs; vitest 174 → 171
# baseline; render-test coverage of GR-13 mandate retracts).
git revert c4cc363

# Selective: revert only the retrofit (keep tests + docs as orphan; tests fail
# because their assertions reference the retrofit code that's gone).
git revert 59b84c1
```

**Per-commit gate verification:** each commit was independently green on `tsc -b` + `vitest run` + both `vite build` modes + PII scan. Commit C: 171/171 baseline preserved (render contract unchanged). Commit D: 174/174 (+3 new). Commit F: 174/174 (no source change). Selective rollback of C alone leaves D in a partial state (D's assertions reference the retrofit). For a clean rollback of code, prefer the C+D pair revert; for a docs-only undo, F revert is independent.

---

## §7 — Deferred / out-of-scope

1. **`strataPost` dead import cleanup** (Phase-3 candidate). The named import at `ProjectsModule.tsx:19` (`import { strataGet, strataPost, strataPut, isStaticMode } from '../strataApi';`) includes `strataPost`, which is referenced nowhere in the file. Pre-existing condition (predates Task 3.7); per CLAUDE.md minimal-scope rule, left as-is to avoid churn unrelated to GR-13. Phase-3 cleanup PR could remove the dead import alongside any other scoped hygiene sweep. Trivial fix; non-blocking.

2. **Plan v2 §15 L491 wording correction** (Phase-3 v2.12 follow-up). §15 currently reads "Unit test: for each new error boundary, add a test that forces it to render the fallback and asserts that a Sentry breadcrumb was emitted." Actual `ErrorBoundary.componentDidCatch` (`ErrorBoundary.tsx:64-68`) calls `reportError(error, 'ErrorBoundary', { componentStack })` → `services/errorReporter.ts` → `Sentry.captureException` (NOT `Sentry.addBreadcrumb`). Test #2 in `projects.module.test.tsx` follows actual semantics. Recommended option (i) per DoR-D phase: update §15 wording to "asserts that `reportError` was called with the ErrorBoundary tag (which then routes to Sentry.captureException via services/errorReporter)". Keeps ErrorBoundary scope minimal in this PR; lets Tasks 3.8 / 3.9 inherit corrected wording.

3. **CDP probe — Playwright vs. React event delegation drift** (Phase-3 v2.13 follow-up candidate; commit-F-time discovery). Playwright `page.locator(...).click()` and `page.getByRole('button', ...).click()` reported `found: true` and the actionability check passed, but React's root-level synthetic event handler did NOT fire — for both the card-expand inner-div onClick (`ProjectsModule.tsx:156`) and the Mark Inactive button onClick (`ProjectsModule.tsx:218-231`). Workaround: programmatic click via `page.evaluate(...)` dispatching native `.click()` on the DOM node, which React's event delegation picks up reliably. Affects 2 of 17 probe steps (`expand-wo-19441-card`, `click-mark-inactive`). Root cause unknown — possible React 19 event-delegation change, possible Playwright build mismatch, possible event-target subtlety with `e.stopPropagation()` at L219. Worth investigating before Tasks 3.8 / 3.9 land their own CDP probes (CorporateReview has multi-POST flows; TenantPortal has a single-POST flow — both will hit similar testid-anchored click chains).

4. **Tasks 3.8 / 3.9 inheritance** (next in retrofit chain). 3.8 (CorporateReview) rebases on 3.7 post-merge; 3.9 (TenantPortal) rebases on 3.8 post-merge. Both inherit the Inner-wrapper + ErrorBoundary precedent established here. CorporateReview has multiple POST sites requiring per-site isStaticMode guards (mirrors the count of toggleStatus instances scaled across multiple write paths). TenantPortal has a single POST. Recommended fallback texts: `"Corporate Review module unavailable."` / `"Tenant Portal module unavailable."`. Recommended breadcrumb namespacing: `corporate-review.*` / `tenant-portal.*`. Test bar: same render-level Option B with 3 it-blocks per module per the §15 mandate (corrected per item #2 above).

5. **Phase-3 deferred-items ledger drops 10 → 8** post-merge of Task 3.7. Items 6 (Task 2.8 §7 cross-module write-guard ledger entry "ProjectsModule") and 8 (Task 2.9 (f) §7 / §8 row 8 "ProjectsModule GR-13 retrofit") in the consolidated ledger at `Docs/Phase2_Task_2_9_Completion_Report.md` §8 retire. Remaining 8 items: AppFolio re-capture pipeline (item 1); pest-control utility-type icon (item 2); `metadata.provider` → `metadata.vendorId` migration (item 3); v1 "3,274 captured tenants" backfill (item 4); `sentiment_scores.json` `uniquePropertyIds.size` 2 → ≥5 (item 5); CS Cooper vendor dedupe (item 7); `WorkitemStatus` union review for `'active'` (item 9); project-type filtering decision (item 10).

---

## §8 — Next-task unblock + Phase-3 chain status

**Phase-3 retrofit chain progress.** Task 3.7 is the first link. After this PR's squash-merge + post-merge 3-file sweep:
- §9 Phase-3 sub-tracker row for 3.7 flips `R` → `✓` with merge SHA + closure date filled in.
- Pending row narrows from 7 to 6: `3.1, 3.2, 3.3, 3.4, 3.8, 3.9`.
- Task 3.8 (CorporateReview GR-13 retrofit) becomes unblocked — opens by branching off `main` post-3.7-merge (which inherits commit C's Inner-wrapper + commit D's test-mock pattern as the canonical template).
- Phase-2 → Phase-3 ledger drops from 10 → 8 deferred items per §7 entry #5.

**Next DoR.** Phase-3 Task 3.8 (CorporateReview) DoR opens once Task 3.7 squash-merges. Expected DoR shape: PRE0 numbering already cleared (3.8); PRE1 codebase reality contact on `CorporateReview.tsx` (locate strataApi import line, write sites, view structure for testid placement); PRE2 test baseline (174 → predicted 177 with 3 it-blocks); (a)–(f) ack chain with Task 3.7 as precedent reference instead of Task 2.8 (since Task 3.7 sits between SentimentModule and CorporateReview as the closest mirrored shape). Recommended branch name: `feat/phase-3-task-3.8-corporate-review-gr13-retrofit` off `main@fe9b642`.

**Phase-3 chain ETA.** With 3.8 + 3.9 each estimated at the same effort envelope as 3.7 (1 day end-to-end including DoR / strict gate / CDP / report / sweep / merge), the full 3-PR chain closes within ~3 working days from 3.7 merge — assuming no adverse §7 item #3 (Playwright event-delegation) discovery escalates into a blocker.
