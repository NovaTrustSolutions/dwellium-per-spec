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

## Cycle 5 (2026-05-28) — Domaines index view

**C5-D1 — `loadDomaines()` lives on the transient zustand `workspaceStore`, not in the
component.** The async fetch thunk sets `{loading, error, domaines}` on the store so any
future view (drill-down, mutations) shares one source of truth and one in-flight flag.
- Why: mirrors how the store already owns the fetch-status triplet (Cycle 4 setters); keeps
  `Workspace.tsx` a thin renderer. Tests `vi.mock` the api module for determinism.
- Reversibility: trivial — the thunk is one method; moving it to a hook later is mechanical.

**C5-D2 — Non-index views render a minimal placeholder + back affordance this cycle.**
Clicking a domaine card calls `openDomaine(path)` (sets `view='domaine'`), but the
domaine/project body is a "arrives next cycle" placeholder with a ChevronLeft back button.
- Why: keeps Cycle 5 strictly the index view per plan §11 while never leaving the widget in
  a dead end (rule 4 — always usable + green). Cycle 6 replaces the placeholder with the
  real project list.
- Reversibility: the placeholder branch is a single `view !== 'index'` block, deleted whole.

**C5-D3 — `useWorkspaceUi` hook (sister to `useFileExplorer`) owns the holder wiring.**
Reads `UserContext` via `useContext` (not `useUser()`), sets `workspaceUserIdHolder.current`
during render, then `useSyncExternalStore` over `workspaceUiStore`. Exposes sort setters.
- Why: established per-user-store consumption pattern; test-resilient (no auth provider needed).
- Reversibility: pure convenience wrapper; inlining is mechanical.

**C5-D4 — `modified-desc` domaine sort falls through to position-asc.** Domaines have no
folder-level timestamp in the metadata contract yet, so only Position + Name are offered in
the index sort control; the stored `sortDomaine` default stays `position-asc`.
- Why: honest — no timestamp data to sort by. Threads (which DO carry `lastModified`) keep
  `modified-desc` as their default in the UI store.
- Reversibility: add the option back the moment a domaine timestamp exists in the contract.

---

## Cycle 6 (2026-05-28) — Projects drill-down (domaine view)

**C6-D1 — Projects are DERIVED from the shared file-explorer tree, not a new endpoint.**
`loadTree()` calls `fetchTree()` from `../FileExplorer/fileExplorerApi` (decision D3 — one
source of truth for per-user structure); the pure `projectsForDomaine(path)` selector reads
the cached `tree` and returns the matching domain node's `tier === 'project'` children. No
`/api/workspace/projects` route is added.
- Why: D3 already chose to share `GET /api/file-explorer/tree`; the backend tier-classifies
  nodes, so projects fall out of the tree for free. Avoids a redundant endpoint + a second
  contract surface to keep in sync.
- Reversibility: trivial — `projectsForDomaine` is one pure method; swapping it for a
  dedicated fetch later is mechanical and contained to the store.

**C6-D2 — Tree fetched LAZILY on entering the domaine view, with its own loading/error pair.**
An effect keyed on `view === 'domaine' && tree.length === 0` triggers `loadTree()` once;
`treeLoading`/`treeError` are independent of the index view's `loading`/`error`.
- Why: don't pay the tree fetch until the user drills in; keeping the status pair separate
  means a projects-fetch failure never colours the domaines index (and vice-versa).
- Reversibility: to prefetch alongside domaines instead, move the call into the mount effect —
  one line. To merge the status pairs, delete the tree* fields — contained to the store.

**C6-D3 — Project card shows a thread-count hint; click drills to the (placeholder) thread view.**
Each project card renders `Folder` + name + "N threads" (count of `tier === 'thread'`
children). Clicking calls `openProject(path)` → `view='project'`, which still shows the
"Thread view arrives next cycle" placeholder (Cycle 7 fills it).
- Why: gives the project list a useful at-a-glance signal now without pulling thread metadata
  (that's Cycle 7); keeps the drill chain navigable end-to-end (rule 4 — never a dead end).
- Reversibility: the count is a one-line `threadCount()` helper; the placeholder branch is a
  single `view === 'project'` block, replaced wholesale in Cycle 7.

**C6-D4 — Project sort offers Name (default) + Modified; toolbar sort/refresh are view-aware.**
The domaine view uses the per-user `sortProject` pref (`name-asc` default, `modified-desc`
option over the tree node's `modified`). The single toolbar sort `<select>` and RefreshCw
button swap their target by `view` (domaines vs projects), with matching aria-labels.
- Why: reuses the existing per-user UI store fields; one toolbar that adapts avoids duplicate
  controls. `position-asc` isn't offered for projects (tree nodes carry no position) → name.
- Reversibility: per-view branches in the toolbar are isolated `view === …` blocks.

---

## Cycle 7 (2026-05-28) — Threads drill-down (project view)

**C7-D1 — Threads are DERIVED from the cached tree, not a new endpoint.** A pure
`threadsForProject(path)` selector walks the cached file-explorer tree (domain → project)
and returns the matching project node's `tier === 'thread'` children — sister to
`projectsForDomaine` (C6-D1, decision D3: one source of truth for per-user structure). No
`/api/workspace/threads` route is added; no extra tree fetch (the tree is already loaded
when the user drills through the domaine view).
- Why: D3 already shares `GET /api/file-explorer/tree`; the backend tier-classifies nodes,
  so threads fall out of the tree for free. Avoids a redundant endpoint + contract surface.
- Reversibility: trivial — `threadsForProject` is one pure method; swapping it for a
  dedicated fetch later is mechanical and contained to the store.

**C7-D2 — Thread metadata (status/stage) is fetched BEST-EFFORT and is purely additive.**
`loadThreadMetas(paths)` fetches each thread's `.thread.json` sidecar via
`workspaceApi.fetchThreadMeta()` using `Promise.allSettled`, caching only the fulfilled ones
into a `threadMetas` map keyed by path. The thread LIST always renders from the tree; a
missing/erroring sidecar (e.g. the sibling backend `/api/workspace/thread-meta` route not
implemented yet) simply yields a thread card with no badge.
- Why: metadata is enrichment, not the list itself — the navigation MVP must work before the
  metadata backend lands (rule 4: never a dead end; matches the FactCheck/Postgres
  "backend not implemented yet" graceful-degradation precedent). `allSettled` means one bad
  thread never blocks the rest.
- Reversibility: `threadMetas` + `threadMetaLoading` are two additive store fields; the
  badge rendering is a single `meta &&` block in the card. Removing leaves the list intact.

**C7-D3 — Metas load lazily on entering the project view, keyed on the thread-path set.**
An effect fires `loadThreadMetas()` when `view === 'project'` and threads are visible, keyed
on the joined thread-path string (stable) so it re-runs on a thread-set change, not on every
render. `threadMetaLoading` is independent of `treeLoading`/`loading`.
- Why: don't pay the meta fetches until the user drills into a project; the path-set key
  avoids effect thrash from array identity churn.
- Reversibility: move the call into a different effect / prefetch alongside the tree — one
  line; contained to the widget.

**C7-D4 — Thread sort offers Modified (default) + Name; toolbar sort/refresh now 3-way.**
The project view uses the per-user `sortThread` pref (`modified-desc` default — threads carry
`lastModified`, unlike domaines/projects). The single toolbar sort `<select>` and RefreshCw
button gain a third (thread) target by `view`, with matching aria-labels ("Sort threads" /
"Refresh threads"). The `sortProjects` helper was generalised to `sortEntries` (shared by
the project + thread lists — identical tree-node sort logic).
- Why: reuses the existing per-user UI store field (`sortThread` already existed since C4);
  one adaptive toolbar avoids duplicate controls; `position-asc` isn't offered (tree nodes
  carry no position).
- Reversibility: per-view branches are isolated `view === …` blocks; `sortEntries` is a
  pure rename of `sortProjects`.

## Cycle 8 — mutations (2026-05-28)

- **C8-D1: Mutation routing.** Structure mutations (create/rename/move/delete domaine·
  project·thread) go over the SHARED file-explorer routes (`mkdir`/`rename`/`move`/`entry`
  in `fileExplorerApi`) per plan D1/D3 — NO parallel `/api/workspace/*` structure routes.
  Metadata mutations go over the workspace sidecar routes (`putDomaine`/`putThreadMeta`).
  Each structure mutation refetches the affected cache on success (`loadTree`; plus
  `loadDomaines` when a depth-1 domaine folder changed) — refetch-on-mutation, mirroring
  FileExplorer (no live watcher). Reversible: thunks are additive; no schema lock-in.
- **C8-D2: Move UI deferred.** `moveEntry` ships as a tested store thunk, but its UI (a
  destination-picker / drag-drop) is deferred to a later polish cycle. Rationale: a
  cross-parent destination picker is its own coherent UI unit; deferring keeps Cycle 8
  bounded + gate-green. The thunk is ready for that UI to call.
- **C8-D3: Domaine metadata-edit UI deferred.** `saveDomaineMeta` (color/description/
  position via `putDomaine`) ships as a tested store thunk; the edit FORM UI is deferred
  to the same polish cycle as the DomaineBadge work (plan Cycle 9). Thread mark-complete
  (`setThreadStatus`) DID get UI this cycle (one-button toggle, high-value + trivial).
- **C8-D4: Card markup → listitem+role=button.** Domaine + project cards changed from a
  single `<button role="listitem">` to a `<div role="listitem">` wrapping an inner
  `<div role="button" tabIndex=0 onKeyDown>` open-target, so the per-card rename/delete
  action `<button>`s can nest as valid HTML (no button-in-button). Thread cards were
  already `<div>`s. No render test depended on the old markup (workspace tests are
  store-level), so this is low-risk + reversible.

---

## Cycle 9 — Scribe handoff (D4) + DomaineBadge

**C9-D1 — Scribe "open in Scribe" handoff via the cross-widget intent bus + direct store import.**
A thread is a folder, so "open in Scribe" opens each file-tier child as a Scribe tab
(`useScribeStore.getState().openFile(child.path)` — idempotent dedupe), then surfaces the
Scribe widget by dispatching the existing `dwellium:open-widget` CustomEvent
(WindowContext.tsx:447) rather than consuming `useWindows()`. Rationale: (a) keeps Workspace
free of a WindowProvider dependency so it stays test-friendly (existing Workspace tests are
provider-less `.ts` store tests); (b) the event bus is the established cross-widget pattern
(Stella self-diagnose CTA, Scribe→ARA send button already use it); (c) maximally REVERSIBLE —
the whole handoff is one helper module + one button. Side effects are injected as `deps` into
the pure `openThreadInScribe()` helper so it unit-tests without a real store or DOM listener.
Path-namespace assumption (file-explorer tree path == scribe file path on the shared per-user
fs) documented in `workspaceScribe.ts`; a mismatch degrades gracefully via Scribe's own error
state. The "Open in Scribe" button (ExternalLink icon) shows on a thread card only when the
thread has ≥1 file (`threadHasFiles`).

**C9-D2 — DomaineBadge ported as a PURELY PRESENTATIONAL component.** Holocron's DomaineBadge
resolved a domaine three ways (pre-resolved object / by id / by project-name→namespace lookup
via `useDomaineForProject` + `useDomainesStore`). Dwellium derives its tree from the shared
file-explorer endpoint and has NO namespace→domaine mapping, so the port drops the resolution
hooks and takes an already-resolved `DomaineMeta` (Workspace always knows the active domaine
from its drill state). Keeps it SSR-safe + dependency-free. Rendered as a `chip` next to the
toolbar title in the domaine + project views to surface the active domaine's color tint (the
plain text title lacks color); `dot` variant retained for tight contexts. Reversible: pure
component, removable without touching store/data.

---

## Cycle 10 — per-user persistence polish + a11y + WCAG AA (2026-05-29)

**C10-D1 — Restore the last-active domaine on first mount.** The per-user UI store already
PERSISTED `lastActiveDomainePath` (set on `handleOpenDomaine`) since Cycle 4/5 but never READ
it back — the widget always opened at the Domaines index. Cycle 10 closes the loop: a
restore-once `useEffect` (guarded by a `restoredRef`) opens the persisted domaine after the
domaines list settles. Decision points + rationale:
- **Restore vs. always-index.** Chose RESTORE (mirrors Holocron's `domainesStore` active-domaine
  restore behavior; matches "active domaine" in the Cycle-10 plan scope). Reversible — delete the
  one effect + helper to revert to always-index.
- **Stale-path safety.** Extracted a PURE `pickRestoreDomaine(domaines, path)` helper (unit-tested
  in `Workspace.restore.test.ts`) that only restores when the domaine STILL EXISTS in the freshly
  loaded list; a renamed/deleted domaine falls back to the index. No crash, no empty drill.
- **Never overrides live navigation.** The effect no-ops if the user already left the index
  (`view !== 'index' || activeDomainePath`) and fires at most once per widget instance, so
  navigating back to the index does NOT re-trigger the restore.

**C10-D2 — WCAG AA contrast: bump failing tertiary text from `#555`/`#777` → `#808080`.**
Audited every Workspace text color against its composited background (`#0a0a0a` panel /
`#101010` cards). Two tertiary grays failed AA normal-text (4.5:1): `#555` empty/loading-state
text ≈ 2.65:1 (6 sites) and `#777` thread-file-count + project-meta text ≈ 4.25:1 (2 sites).
Bumped both to the repo's established `--text-tertiary` value `#808080` (≈5.01:1 on `#0a0a0a`,
≈4.82:1 on `#101010` — passes AA on both surfaces; sister to the functionality-bringup
`#808080` calibration). `#888` (5.58:1) and the `#666` icon-only UI buttons (3.45:1, ≥3:1
non-text-contrast bar) already pass and were left unchanged.
