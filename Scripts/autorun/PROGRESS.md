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
