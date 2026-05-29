# Workspace Arc — Autonomous Decisions Log

Running unattended. At each fork, the most reasonable + most REVERSIBLE default is
chosen, logged here with rationale, and work proceeds. (Per WORKSPACE_AUTORUN_PROMPT.md
rule 2.)

---

## Cycle 3 (2026-05-28) — adopt plan §10 recommended defaults D1–D7

The Cycle 2 plan marked decisions D1–D7 "for Ilya". Ilya is not at the keyboard for this
run, so the plan's **recommended defaults are adopted as-is** (each is the more reversible
option — sidecars/reuse can be swapped for a dedicated table later without client churn).

| # | Decision | Adopted | Rationale (= plan's recommended default) |
|---|----------|---------|------------------------------------------|
| D1 | Reuse file-explorer 3-tier backend vs separate `/api/workspace/*`+table | **Reuse** | Tree + per-user fs already exist & proven; avoids a parallel model. Workspace adds only a metadata layer. |
| D2 | Where domaine/thread metadata lives | **Sidecar JSON files** on the same fs | No new DB table; portable; backend already does sidecar-style writes. |
| D3 | Workspace tree endpoint | **Share `GET /api/file-explorer/tree`** | One source of truth for the per-user tree; project→domaine mapping is implicit in the path. |
| D4 | Scribe "open in Scribe" handoff in MVP | **Yes, minimal** (`scribeStore.openFile`) | Low-risk, high-value, API already exists. |
| D5 | Thread↔Honcho chat-memory binding | **Defer** to post-MVP | Orthogonal; large scope; Stella already owns Honcho. |
| D6 | Live file-watch (chokidar analog) | **Drop** for MVP; manual refresh + refetch-on-mutation | No web equivalent; FileExplorer ships without it. |
| D7 | New top-level concept vs map onto existing hierarchy | **Map onto existing** — new `'workspace'` dock row in Filing Cabinet group | Consistency with scribe/file-explorer siblings. |

### D2-refinement — sidecar files are DOT-PREFIXED
- Chosen: `.domaine.json` (at depth-1 domain folder) and `.thread.json` (at depth-3 thread folder).
- Why: the existing file-explorer `walkTree` skips `.`-prefixed entries (`backend-file-explorer-routes.ts:64`),
  so dot-prefixed sidecars do NOT appear as stray files in the FileExplorer tree view.
  Holocron used a visible `thread.json`, but Holocron had no shared file-tree widget to pollute.
- Reversibility: renaming the sidecars is a one-line constant change in the backend file +
  the client `workspaceApi`; no data-model lock-in.

### D1/D3-refinement — NO folder CRUD in `/api/workspace/*`
- The workspace contract (`Docs/backend-workspace-routes.ts`) exposes metadata only:
  `GET /domaines`, `PUT /domaine`, `GET/PUT /thread-meta`.
- Create/rename/move/delete of domaine/project/thread FOLDERS reuses the existing
  file-explorer routes (`/mkdir`, `/rename`, `/move`, `/entry`). Documented in the contract header.
- Why: avoids duplicating path-traversal-guarded folder CRUD; keeps the new backend surface minimal.
