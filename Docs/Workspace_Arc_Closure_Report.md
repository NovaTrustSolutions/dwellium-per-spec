# Workspace Widget — Port Arc Closure Report

**Branch.** `feat/workspace-widget`
**Closed.** 2026-05-29 (Cycle 11 — registration + final strict gate + closure)
**Source.** Holocron (`Docs/holocron-reference/editor/**`, Electron) → Dwellium (React + react-router SSR, web-over-HTTP).
**Scope of this branch.** Client widget + `Docs/backend-workspace-routes.ts` route contract + porting plan/decisions. Backend route implementation lives in the sibling repo (`ai-dashboard369-file-manager`) and is **Ilya-gated / out of scope here**.

---

## 1. What shipped

A new **Workspace** widget — the *organizational* altitude over the per-user file tree:
**Domaine** cards → **Project** lists → **Thread** lists with status/stage metadata, plus
create/rename/move/delete mutations, a Scribe "open in Scribe" handoff, per-user persistence
(active domaine, sort prefs), and full a11y + WCAG AA polish.

This is a **runtime translation**, not a copy: Holocron's Electron primitives (chokidar
file-watch, IPC, main-process Postgres + `fs`) became HTTP fetches against
`${API_BASE}/api/workspace/*` + `/api/file-explorer/tree` with `getAuthHeaders()`, and
per-user UI state on `createLocalStorageStore` keyed by user id — mirroring the established
Scribe / FileExplorer / integrations patterns.

### Data model (per plan §2 + decisions D1/D2/D3)
`Domaine` → `Project` → `Thread`, **derived from the shared per-user file tree** (`/api/file-explorer/tree`)
rather than a parallel namespace/DB model. Domaine + Thread **metadata** (color, description,
position; thread status/stage) lives in **`domaine.json` / `thread.json` sidecar files** on the
same fs — no new DB table; the most reversible choice.

---

## 2. Cycle ledger (all on `feat/workspace-widget`)

| Cycle | SHA | What |
|------:|:----|:-----|
| 1 | `c813394` | porting-plan stub scaffold |
| 2 | `45586c7` | discovery + porting plan (architecture xlation table, data model, D1–D7, 10-cycle sequence) |
| 3 | `4dd8c63` | `Docs/backend-workspace-routes.ts` — `/api/workspace/*` metadata route contract (sibling-backend-gated) |
| 4 | `219fd3a` | `workspaceApi.ts` + `workspaceStore.ts` + `workspaceUiStore.ts` scaffold + unit tests |
| 5 | `71dda87` | Domaines index view (fetch + cards + loading/empty/error states) |
| 6 | `5a85647` | Projects drill-down (domaine view, derived from shared tree) + back-nav |
| 7 | `47b200f` | Threads drill-down (project view) with status/stage badges |
| 8 | `c81cc90` | mutations — create/rename/move/delete + thread-status/domaine metadata |
| 9 | `3db02b6` | Scribe "open in Scribe" handoff (intent bus) + `DomaineBadge` |
| 10 | `0e1593f` | restore last-active domaine + a11y pass + WCAG AA contrast remediation |
| **11** | *(this commit)* | **registration** (`widgetRegistry.ts` + `hierarchy.ts` + `iconMap.ts`) + final strict gate + this closure doc |

---

## 3. Cycle 11 changes (registration)

The widget existed at `src/components/Workspace/Workspace.tsx` but was **not reachable** — no
registry entry, no dock row. Cycle 11 wires it in via three minimal edits (the registry comment's
"add ONE entry" pattern; `WINDOW_COMPONENTS` in `Desktop.tsx` spreads `REGISTRY_COMPONENTS`, so a
single registry entry auto-discovers Desktop + Sidebar + CommandPalette + PopupShell):

1. **`src/components/Sidebar/iconMap.ts`** — import `Layers` (lucide) + map `'layers' → Layers`
   (the Workspace's layered Domaine→Project→Thread hierarchy).
2. **`src/registry/widgetRegistry.ts`** — new `'workspace'` entry next to its filing sibling
   `file-explorer`: `lazyWithReload(() => import('../components/Workspace/Workspace'))`,
   `category: 'filing'`, `minWidth: 380`, `minHeight: 420`.
3. **`src/data/hierarchy.ts`** — new `dock-workspace` row in the **Filing Cabinet** group
   (per decision D7 — map onto existing hierarchy, consistent with scribe/file-explorer siblings),
   placed directly after `dock-file-explorer`.

**Build-graph proof of reachability:** before Cycle 11 the Workspace chunk was orphaned (no
importer); the Cycle 11 build emits it into the graph:
`build/client/assets/Workspace-R6ODW2Z6.js  26.53 kB │ gzip: 6.86 kB` +
`build/server/assets/Workspace-C5mt_Rw_.js  56.02 kB`.

---

## 4. Final strict gate — 6/6 GREEN

Log: `Scripts/autorun/logs/gate_c11_1780027796.log` · `SMOKE_TEST_PORT=3458`.

| Stage | Result |
|:------|:-------|
| `tsc -b` | ✓ EXIT=0 |
| `vitest run` | ✓ **47 files / 348 passed / 0 failed** (unchanged vs Cycle 10 — registration-only, no new tests) |
| `react-router build` (seeds=true) | ✓ (client + server "built in") |
| `react-router build` (seeds=false) | ✓ (4 total "✓ built in" markers across both builds) |
| `verify_no_pii_leak.mjs` | ✓ 51 files / 2 roots / **0 leaks** |
| SSR smoke (`smoke_test_ssr_phase8.mjs`, port 3458) | ✓ **PASS** — 200 / 5949 B · 0 console / 0 page / 0 ReferenceError / 0 hydration warnings |

SSR-safety holds: Workspace state is on `createLocalStorageStore` (SSR-safe via `getServerSnapshot`),
no `useState(() => localStorage.…)` init-time browser-global reads — per the per-provider-SSR-safety
taxonomy. The smoke test (which renders under true `ssr:true`) passes clean with the widget now in
the graph.

---

## 5. Decisions enacted (recommended defaults from plan §10, all logged in `Scripts/autorun/DECISIONS.md`)

- **D1 / D3** — reuse the existing file-explorer 3-tier backend + share `/api/file-explorer/tree`;
  add only metadata routes. *(Avoids a parallel model; one source of truth.)*
- **D2** — Domaine/Thread metadata in `domaine.json` / `thread.json` sidecar files. *(No new DB table.)*
- **D4** — minimal Scribe "open in Scribe" handoff via an intent bus (Cycle 9). *(Low-risk, high-value.)*
- **D5** — Thread↔Honcho chat-memory binding **deferred** (orthogonal; Stella owns Honcho).
- **D6** — live file-watch (chokidar analog) **dropped** for MVP; manual refresh + refetch-on-mutation.
- **D7** — map onto existing hierarchy: new `workspace` dock row in Filing Cabinet. *(Consistency.)*

---

## 6. Open items for Ilya (none blocking)

1. **Backend routes (sibling repo).** `Docs/backend-workspace-routes.ts` is a **contract only**.
   `/api/workspace/*` (domaine list + metadata sidecar read/write) must be implemented in
   `ai-dashboard369-file-manager`. Until then the widget renders graceful empty/loading/error
   states and the tree-derived views work off the existing `/api/file-explorer/tree`.
2. **Screenshot/axe baselines.** The 8 existing Playwright screenshot baselines cover the 8
   standalone AppFolio **parity routes**, not window-opened **widgets** — Scribe and FileExplorer
   (the Workspace's Filing-Cabinet siblings) likewise have no dedicated screenshot baseline. So no
   new baseline is required by the parity gate for this widget. If a Workspace-specific visual
   baseline is later desired, it would be added via the
   `Capture Linux Playwright Baselines (workflow_dispatch only)` workflow — Ilya-gated.
3. **Deferred per plan (D5/D6).** Thread↔Honcho binding + live file-watch remain post-MVP add-ons.

---

## 7. Push commands (Ilya pushes — this arc never pushes)

```bash
git push origin main
git push -u origin feat/workspace-widget
```
