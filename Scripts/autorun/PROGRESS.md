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

---

## 2026-05-28 — Cycle 7 (source): Threads drill-down (project view)

**Cycle:** C7 — drill into a project to see its THREADS, derived from the shared
file-explorer tree (C7-D1), each enriched with `.thread.json` sidecar metadata
(status/stage badges) fetched best-effort (C7-D2/D3). ✅ DONE.

**Did:**
- `workspaceStore.ts` — added `threadMetas` map + `threadMetaLoading` flag; the pure
  `threadsForProject(path)` selector (walks domain → project, returns the project node's
  `tier === 'thread'` children); the `loadThreadMetas(paths)` thunk (Promise.allSettled over
  `fetchThreadMeta`, caches only fulfilled metas keyed by path — best-effort, swallows
  per-thread errors). Imports `fetchThreadMeta` + `ThreadMeta` from workspaceApi. reset()
  covers the new fields. (C7-D1/D2)
- `Workspace.tsx` — replaced the `view==='project'` placeholder with the THREAD view: thread
  card list (MessageSquare + name + status badge [active=acid-lime / ✓ complete=green] +
  stage pill + "N files" hint), with treeError+Retry / treeLoading / empty states (reuses the
  shared tree status since threads derive from the tree). Lazy `loadThreadMetas()` effect on
  entering project view, keyed on the joined thread-path set. Lazy tree-load effect extended
  to fire for any non-index view. Toolbar now 3-way: title/back already resolved project name;
  added a `sortThread` `<select>` (Modified default + Name) and "Refresh threads" RefreshCw
  target with matching aria-labels. `sortProjects` generalised → `sortEntries` (shared by
  project + thread lists). (C7-D1/D3/D4)
- `src/test/Workspace.threadMetas.test.ts` (NEW) — 8 tests, `vi.mock` of BOTH fileExplorerApi
  (fetchTree) and workspaceApi (fetchThreadMeta/fetchDomaines): threadsForProject
  (thread-tier only / ignores files / empty for childless / empty for unknown) +
  loadThreadMetas (caches by path / best-effort skip on reject / empty-list no-op / merges
  into existing).
- Decisions C7-D1..D4 logged to DECISIONS.md.

**Verified — FULL strict gate 6/6 GREEN** (log `Scripts/autorun/logs/gate_c7_1780026114.log`,
exit 0):
- `tsc -b` ✓ (exit 0) · `vitest` ✓ **43 files / 310 passed / 0 failed** (+1 file, +8 tests
  vs Cycle-6 42 files / 302 passed) · `react-router build` seeds=true ✓ + seeds=false ✓
  (4 "built in" markers) · PII ✓ (51 files, 0 leaks) · SSR smoke (`SMOKE_TEST_PORT=3458`)
  ✓ PASS (200 / 5949 B, 0 console/page/ReferenceError).

**Next:** Cycle 8 — mutations: create/rename/move/delete domaine·project·thread over the
existing file-explorer routes (+ metadata sidecars via workspaceApi.putDomaine/putThreadMeta).
Touches source ⇒ full strict gate (`SMOKE_TEST_PORT=3458`).

---

### Cycle 8 — mutations (create/rename/move/delete + metadata) — 2026-05-28 23:54:06

**Did:** Shipped the Workspace MUTATION layer.
- `workspaceStore.ts` — added the `mutating`/`mutationError` pair + `clearMutationError`,
  and six thunks: `createEntry(parentPath|null, name)` (mkdir; reloads tree, +domaines for a
  depth-1 domaine), `renameEntry(path, toName)`, `removeEntry(path)` (both refetch + reload
  domaines for depth-1; rename/remove defensively follow/step-out of the active node),
  `moveEntry(fromPath, toPath)` (cross-parent), `saveDomaineMeta(path, patch)` (putDomaine
  + reload domaines), `setThreadStatus(threadPath, status)` (putThreadMeta + optimistic
  merge into threadMetas). Names validated client-side to match the backend rename guard
  (no empty / `/` / `\\` / `..`). New imports: mkdir/rename/move/deleteEntry from
  fileExplorerApi; putDomaine/putThreadMeta + DomainePatch from workspaceApi. reset() covers
  the new fields. (C8-D1)
- `Workspace.tsx` — toolbar "+ New" toggles an inline create row (domaine/project/thread by
  altitude → createEntry). Each card grew inline rename (Pencil → input, Enter/Esc) and
  two-step delete (Trash → Check/X confirm); thread cards also get a mark-complete / reopen
  toggle (setThreadStatus). Dismissible mutation-error banner, separate from load/empty/error.
  Domaine + project cards restructured from `<button>` to `<div role=listitem>` wrapping an
  inner `<div role=button tabIndex=0 onKeyDown>` so action buttons nest validly (C8-D4).
  Navigation resets all inline-editor state. Move UI + domaine-metadata-edit UI deferred
  (C8-D2/C8-D3) — those thunks ship tested, UI-less.
- `src/test/Workspace.mutations.test.ts` (NEW) — 25 tests across all six thunks: create
  (domaine vs child path, trim, empty/separator rejection, error), rename (depth-1 vs project
  reload scope, active-path follow, invalid, error), remove (reload scope, step-out × 2,
  error), move (reload scope × 2, error), saveDomaineMeta (reload, error), setThreadStatus
  (merge, preserve-existing, error-leaves-cache), clearMutationError + reset.
- Decisions C8-D1..D4 logged to DECISIONS.md.

**Verified — FULL strict gate 6/6 GREEN** (log `Scripts/autorun/logs/gate_c8_1780026778.log`):
- `tsc -b` ✓ (exit 0) · `vitest` ✓ **44 files / 335 passed / 0 failed** (+1 file, +25 tests
  vs Cycle-7 43 files / 310 passed) · `react-router build` seeds=true ✓ + seeds=false ✓
  (4 "built in" markers) · PII ✓ (51 files, 0 leaks) · SSR smoke (`SMOKE_TEST_PORT=3458`)
  ✓ PASS (200 / 5949 B, 0 console/page/ReferenceError).

**Next:** Cycle 9 — Scribe "open in Scribe" handoff (D4) + DomaineBadge component (and the
deferred move UI / domaine-metadata-edit form, C8-D2/C8-D3, fold in here). Touches source ⇒
full strict gate (`SMOKE_TEST_PORT=3458`).

---

## 2026-05-29 — Cycle 9 — Scribe "open in Scribe" handoff (D4) + DomaineBadge ✅ DONE

**Scope:** Wire the Workspace→Scribe handoff (plan §8 / D4) and port Holocron's DomaineBadge.

- `src/components/Workspace/workspaceScribe.ts` (NEW) — pure handoff helpers with injected
  side effects: `threadFiles`/`threadHasFiles` (filter file-tier children), `openThreadInScribe`
  (opens every thread file via injected `openFile`, then surfaces Scribe via injected
  `openWidget`; returns file count, no-ops on a fileless thread), `dispatchOpenWidget` (fires
  the `dwellium:open-widget` intent bus). Decoupled — no `useWindows`/WindowProvider needed.
- `src/components/Workspace/DomaineBadge.tsx` (NEW) — presentational color-tinted pill
  (chip/dot variants) taking a resolved `DomaineMeta`; renders null when absent. Holocron's
  namespace/id resolution hooks dropped (no namespace model in Dwellium's tree-derived view).
- `Workspace.tsx` — imports the above + `useScribeStore`. Thread cards gained an
  ExternalLink "Open in Scribe" button (only when `threadHasFiles`), wired to
  `handleOpenInScribe` (injects `useScribeStore.getState().openFile` + `dispatchOpenWidget`).
  Toolbar now renders a `<DomaineBadge variant="chip">` of the active domaine in the
  domaine + project views. Added `activeDomaine` lookup (domaineName now derives from it).
- `src/test/Workspace.scribe.test.ts` (NEW, 5 tests) — threadFiles filtering, open-all-then-
  surface, fileless no-op, intent-bus dispatch shape.
- `src/test/DomaineBadge.test.tsx` (NEW, 4 tests) — null→nothing, chip name+label, dot
  label-without-text, color tint + accent fallback (rgb-normalized assertions).
- Decisions C9-D1 + C9-D2 logged to DECISIONS.md.

**Verified — FULL strict gate 6/6 GREEN** (log `Scripts/autorun/logs/gate_c9_*.log`):
- `tsc -b` ✓ (exit 0) · `vitest` ✓ **46 files / 344 passed / 0 failed** (+2 files, +9 tests
  vs Cycle-8 44 files / 335 passed) · `react-router build` seeds=true ✓ + seeds=false ✓
  (4 "built in" markers) · PII ✓ (51 files, 0 leaks) · SSR smoke (`SMOKE_TEST_PORT=3458`)
  ✓ PASS (200 / 5949 B, 0 console/page/ReferenceError).

**Next:** Cycle 10 — per-user persistence polish (sort prefs, active domaine), a11y pass
(aria-labels per the RefreshCw/Section conventions), WCAG AA contrast. Touches source ⇒
full strict gate (`SMOKE_TEST_PORT=3458`).
