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
