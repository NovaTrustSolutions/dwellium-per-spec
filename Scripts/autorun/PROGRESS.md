# Workspace Arc — Progress Log

One entry per autonomous iteration. Cycle sequence defined in `WORKSPACE_PORTING_PLAN.md §11`.

Baseline (main): vitest 278 passed | 39 skipped.

---

## 2026-05-28 — Cycle 3 (docs-only): `/api/workspace/*` route contract

**Cycle:** C3 — `Docs/backend-workspace-routes.ts` metadata-endpoint contract (per plan §11).
**Status:** ✅ DONE.

**Did:**
- Adopted plan §10 decisions D1–D7 at recommended defaults (Ilya away). Logged to `DECISIONS.md`
  with the D2 dot-prefixed-sidecar refinement and the D1/D3 no-folder-CRUD scoping.
- Wrote `Docs/backend-workspace-routes.ts` — sister to `Docs/backend-file-explorer-routes.ts`.
  Metadata-only surface: `GET /domaines`, `PUT /domaine`, `GET /thread-meta`, `PUT /thread-meta`.
  Reuses file-explorer path guards (`validateRelPath`/`resolveAndGuard`), `authenticate` middleware,
  `req.user.id` scoping, `{success,data}` envelope. Sidecars `.domaine.json`/`.thread.json` are
  dot-prefixed so file-explorer `walkTree` won't surface them. Folder CRUD explicitly delegated to
  the existing file-explorer routes (header table).
- Created `DECISIONS.md` + this `PROGRESS.md`.

**Verified (docs-only cycle — no full gate per WORKSPACE_AUTORUN_PROMPT.md):**
- Files touched are all OUTSIDE the parity-gate paths filter: `Docs/**` + `Scripts/autorun/**`.
  No `qualia-shell/src/**`, `qualia-shell/app/**`, or `.github/workflows/**` touched ⇒ no gate auto-fire,
  full strict gate not required this cycle. `git status` sanity check used instead (rule: docs-only
  cycles need only a status check).

**Next:** Cycle 4 — `workspaceApi.ts` + `workspaceStore.ts` + `workspaceUiStore.ts` scaffold (no fetch
wiring yet) + unit tests, under `qualia-shell/src/components/Workspace/`. That cycle touches source ⇒
FULL strict gate (with `SMOKE_TEST_PORT=3458`).

---

## 2026-05-28 — Cycle 4 (source): Workspace store + api scaffold

**Cycle:** C4 — `workspaceApi.ts` + `workspaceStore.ts` + `workspaceUiStore.ts` scaffold
(no fetch wiring) + unit tests (per plan §11). ✅ DONE.

**Did:**
- `qualia-shell/src/components/Workspace/workspaceApi.ts` — HTTP client mirroring
  `fileExplorerApi.ts` (`API_BASE` + `getAuthHeaders()`, `{success,data}` envelope, base
  `/api/workspace`). Functions `fetchDomaines/putDomaine/fetchThreadMeta/putThreadMeta` +
  client mirrors of `DomaineMeta`/`ThreadMeta`/patch types from the Cycle 3 contract.
  Defined but NOT yet consumed (decision C4-D1).
- `qualia-shell/src/components/Workspace/workspaceStore.ts` — transient zustand drill-down
  nav (`index→domaine→project`): `view`, `activeDomainePath`, `activeProjectPath`, cached
  `domaines[]`, `loading`, `error`; pure setters (`openDomaine/openProject/goBack/goToIndex/
  setDomaines/...`) + `domaineForProject` (path-prefix resolver, D3) + `reset()`. No async fetch.
- `qualia-shell/src/components/Workspace/workspaceUiStore.ts` — per-user persisted prefs via
  `createLocalStorageStore` dynamic-key `workspace:${uid}` + `workspaceUserIdHolder` + `normalize`
  + `saveWorkspaceUi`/`toggleWorkspaceExpanded`. Sister-shape to `fileExplorerStore.ts`. SSR-safe.
- `qualia-shell/src/test/Workspace.store.test.ts` — 12 tests (SSR getServerSnapshot contract,
  persistence/normalize/coerce, per-user isolation, zustand nav reducers). `.reset()` in
  `beforeEach` per v2.72.1. Decisions logged to DECISIONS.md (C4-D1, C4-D2).

**Verified — FULL strict gate 6/6 GREEN** (log `Scripts/autorun/logs/gate_1780024862.log`):
- `tsc -b` ✓ (no halt) · `vitest` ✓ **40 files / 290 passed / 0 skipped** (+1 file, +12 tests
  vs verified baseline 39 files / 278 passed / 0 skipped — confirmed by setting the new test
  aside and re-running) · `react-router build` (seeds=true) ✓ built · (seeds=false) ✓ built ·
  PII ✓ clean (51 files, 0 leaks) · SSR smoke (`SMOKE_TEST_PORT=3458`) ✓ PASS (0 console/page
  errors, 0 ReferenceError, 0 hydration mismatch, pre-hydration 200 / 5949 B).
- Baseline-note correction: the prompt's "278 passed | 39 skipped" is actually 278 passed +
  39 test FILES; there are 0 skipped. Recorded here for future iterations.

**Next:** Cycle 5 — Domaines index view in `Workspace.tsx`: wire `fetchDomaines()` into a
`loadDomaines()` action on `workspaceStore`, render domaine cards, with loading/empty/error
states. Touches source ⇒ full strict gate (`SMOKE_TEST_PORT=3458`).

---

## 2026-05-28 — Cycle 5 (source): Domaines index view

**Cycle:** C5 — Domaines index view in `Workspace.tsx`: wire `fetchDomaines()` → store
thunk, render card grid, loading/empty/error states + per-user sort (plan §11). ✅ DONE.

**Did:**
- `workspaceStore.ts` — added async `loadDomaines()` thunk (imports `fetchDomaines` from
  `workspaceApi`): sets `loading:true,error:null` → `setDomaines` on success / captures
  message on failure → always clears `loading`. (C5-D1)
- `useWorkspaceUi.ts` (NEW) — per-user UI-prefs hook, sister to `useFileExplorer`: sets
  `workspaceUserIdHolder.current` from `useContext(UserContext)` during render, then
  `useSyncExternalStore` over `workspaceUiStore`; exposes sort/lastActive/expanded setters.
  SSR-safe + test-resilient (no auth provider needed). (C5-D3)
- `Workspace.tsx` (NEW) — default-export widget. `useEffect(loadDomaines)` on mount;
  renders a `repeat(auto-fill,minmax(180px,1fr))` card grid (color-swatch left border +
  FolderOpen icon + name + 2-line description clamp). Toolbar: Position/Name sort select
  (C5-D4) + RefreshCw refresh (aria-label per convention). Card click → `openDomaine` +
  persists `lastActiveDomainePath`. States: `role="alert"` error + Retry, "Loading domaines…",
  empty-state, `role="list"`/`role="listitem"` grid. Non-index view = placeholder + back
  (ChevronLeft) affordance (C5-D2). fey.com black + acid-lime `#D6FE51` inline styles.
- `src/test/Workspace.loadDomaines.test.ts` (NEW) — 4 tests, `vi.mock` of `workspaceApi`:
  happy path, error path, stale-error-cleared-on-reload, non-Error-rejection fallback.
- Decisions C5-D1..D4 logged to DECISIONS.md. NOT registered in widgetRegistry/hierarchy yet
  (plan §11 — Cycle 11). Widget is built but not yet mounted anywhere.

**Verified — FULL strict gate 6/6 GREEN** (log `Scripts/autorun/logs/gate_c5_1780025245.log`):
- `tsc -b` ✓ (exit 0) · `vitest` ✓ **41 files / 294 passed / 0 skipped** (+1 file, +4 tests
  vs Cycle-4 40 files / 290 passed) · `react-router build` seeds=true ✓ (built 4.58s client +
  732ms server) · seeds=false ✓ (4.60s + 725ms) · PII ✓ (51 files, 0 leaks) · SSR smoke
  (`SMOKE_TEST_PORT=3458`) ✓ PASS (0 console/page errors, 0 ReferenceError, pre-hydration 200 / 5949 B).

**Next:** Cycle 6 — drill-down to Projects: replace the non-index placeholder with a project
list for the active domaine (derive projects from `/api/file-explorer/tree` depth-2 folders
per D3) + back-nav already in place. Touches source ⇒ full strict gate (`SMOKE_TEST_PORT=3458`).

---

## 2026-05-28 — Cycle 6 (source): Projects drill-down (domaine view)

**Cycle:** C6 — drill into a domaine to see its PROJECTS, derived from the shared
file-explorer tree (D3) + back-nav (plan §11). ✅ DONE.

**Did:**
- `workspaceStore.ts` — added cached `tree` + `treeLoading` + `treeError` state (independent
  of the index `loading`/`error`), `setTree`, the async `loadTree()` thunk (imports
  `fetchTree` from `../FileExplorer/fileExplorerApi` per D3), and the pure
  `projectsForDomaine(path)` selector (matches the depth-1 domain node, returns its
  `tier === 'project'` children). (C6-D1/D2)
- `Workspace.tsx` — added the DOMAINE (projects) view: lazy `loadTree()` effect on entering
  `view==='domaine'`; project card grid (Folder icon + name + "N threads" hint from
  `tier==='thread'` children) with treeLoading / treeError+Retry / empty states; click →
  `openProject` (→ placeholder thread view, Cycle 7). Toolbar is now view-aware: title +
  back-label resolve the domaine display name, sort `<select>` swaps domaine⇄project sort,
  RefreshCw swaps domaines⇄projects target — all with matching aria-labels (RefreshCw convention).
  Index branch unchanged. (C6-D3/D4)
- `src/test/Workspace.loadTree.test.ts` (NEW) — 8 tests, `vi.mock` of `fileExplorerApi`:
  loadTree happy/error/stale-cleared/non-Error-fallback + projectsForDomaine
  (only project-tier children / ignores files / empty for childless / empty for unknown path).
- Decisions C6-D1..D4 logged to DECISIONS.md.

**Verified — FULL strict gate 6/6 GREEN** (log `Scripts/autorun/logs/gate_c6_1780025678.log`):
- `tsc -b` ✓ (exit 0) · `vitest` ✓ **42 files / 302 passed / 0 skipped** (+1 file, +8 tests
  vs Cycle-5 41 files / 294 passed) · `react-router build` seeds=true ✓ + seeds=false ✓
  (4 "built in" markers, 0 errors) · PII ✓ (51 files, 0 leaks) · SSR smoke
  (`SMOKE_TEST_PORT=3458`) ✓ PASS (200 / 5949 B, 0 console/page/ReferenceError).

**Next:** Cycle 7 — drill into a project to see its THREADS + `ThreadInfo`/`ThreadMeta`
surface (status/stage badges via `fetchThreadMeta`). Replace the `view==='project'`
placeholder with a thread list (tree `tier==='thread'` children) + per-thread status/stage.
Touches source ⇒ full strict gate (`SMOKE_TEST_PORT=3458`).
