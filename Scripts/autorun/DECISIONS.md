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

---

## Cycle 4 (2026-05-28) — store/api split + "no fetch yet" interpretation

Plan §11 scopes Cycle 4 as "`workspaceApi.ts` + `workspaceStore.ts` + `workspaceUiStore.ts`
scaffold (no fetch wiring yet) + unit tests". Two forks resolved:

### C4-D1 — meaning of "no fetch wiring yet"
- Chosen: **define the real HTTP client surface in `workspaceApi.ts`, but leave it
  unconsumed** — the drill-down store (`workspaceStore.ts`) gets state + pure synchronous
  setters only, with NO async `loadDomaines()` action this cycle.
- Why: a "HTTP client" file whose functions are stubs would be pointless; mirroring
  `fileExplorerApi.ts` (which is a pure fetch wrapper) is the established pattern. Keeping
  the *stores* fetch-free is what "no fetch yet" actually buys — pure, fast unit tests and
  no live-backend dependency in the gate. Cycle 5 wires `fetchDomaines()` into the index view.
- Reversibility: adding the async action in Cycle 5 is purely additive; nothing here locks in.

### C4-D2 — two stores, not one (transient nav vs persisted prefs)
- Chosen: **`workspaceStore.ts` = plain zustand** (transient drill-down: `view`,
  `activeDomainePath`, `activeProjectPath`, cached `domaines[]`, `loading`, `error`) +
  **`workspaceUiStore.ts` = `createLocalStorageStore`** dynamic-key `workspace:${uid}`
  (per-user persisted prefs: sort modes, `lastActiveDomainePath`, `expanded`).
- Why: matches plan §7 exactly (transient view state in plain zustand mirroring Holocron's
  `domainesStore`; per-user-persisted bits through the SSR-safe factory like
  `fileExplorerStore`). Server data is cached in the transient store, never persisted.
- Reversibility: the split is conventional (sister to Scribe's zustand + FileExplorer's
  factory store); merging or moving fields later is mechanical.
