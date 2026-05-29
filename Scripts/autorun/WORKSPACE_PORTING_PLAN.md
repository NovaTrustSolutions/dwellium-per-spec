# Workspace Widget Porting Plan — Holocron → Dwellium

**Branch:** `feat/workspace-widget`
**Created:** 2026-05-28 (Cycle 2 — discovery + plan)
**Status:** DRAFT for Ilya review. No production code touched. No porting performed. STOP-for-review before Cycle 3.

---

## 0. TL;DR — the decisive finding

Holocron's "Workspace" is an **Electron desktop** construct: a chokidar file-watcher + a `Domaine → Project → Thread` folder tree on local disk, with a Postgres `rag_domaines` table and direct `fs`/IPC calls from the main process. None of `chokidar`, `BrowserWindow`, `electron`, or `fs` exists in Dwellium (a React + RR-v7 SSR web app).

**But Dwellium already has the destination pattern — and the data model.** The documented backend file-explorer disk layout is:

```
~/.dwellium/files/<userId>/<domain>/<project>/<thread>/…     (Docs/backend-file-explorer-routes.ts:4-12)
```

That is *exactly* Holocron's `<projectsRoot>/<DomaineName>/<ProjectName>/<ThreadName>/` tree — already per-user, already over HTTP, already auth-guarded. So the port is a **runtime translation, not a copy**, and Workspace is best built as a **navigator/organizer that sits on top of the existing 3-tier file-explorer backend**, not as a parallel `rag_domaines` model. Scribe + FileExplorer are the proven templates for the client shape.

The single biggest decision for Ilya (see §10): **reuse the existing file-explorer 3-tier backend (recommended), or stand up a separate `/api/workspace/*` + domaine table.**

---

## 1. What "Workspace" is in Holocron (source inventory)

Read from `Docs/holocron-reference/editor/`:

| File | Lines | Role | Electron coupling |
|------|------:|------|-------------------|
| `src/main/workspace.ts` | 110 | chokidar watcher → `BrowserWindow.webContents.send('workspace:file-changed')`; `writeWorkspaceFile`; rename-lock | **Total** — `chokidar`, `electron`, `fs` |
| `src/main/projectFs.ts` | 1,526 | The real data layer: `listProjects/createProject/listThreads/createThread/completeThread`, thread-meta CRUD, `branchThread`, `rename/move/purge Project/Thread`, `moveDocumentToThread`, memory summaries | **Total** — `fs.promises` + `ragQuery` (Postgres) |
| `src/main/domaineFs.ts` | 584 | Domaine CRUD over Postgres `rag_domaines`: `listDomaines/getDomaineById/createDomaine/updateDomaine/deleteDomaine/getRenameSummary/listProjectDomaineMap` | **Total** — `ragQuery` (Postgres) |
| `src/renderer/src/store/domainesStore.ts` | 122 | zustand drill-down state (`index→domaine→project`), cached `domaines[]` + `projectDomaineMap`, sort prefs; fetches via `window.electronAPI.domainesList()` | IPC via `window.electronAPI.*` |
| `src/renderer/src/hooks/useDomaineForProject.ts` | 28 | resolve project→domaine from cached map | renderer-only (portable) |
| `src/renderer/src/utils/threadActions.ts` | 296 | `loadThread()` orchestration: binds Honcho session, restores chat history, loads memory summaries, fires "Dreaming Agent"; `loadThreadForPath()` parses `<root>/<domaine>/<project>/<thread>` | IPC + Honcho-coupled |
| `scripts/migrations/004_domaines.sql` | 54 | `rag_domaines(id,name,description,color,position,created_at)` + `domaine_id` FK on `rag_namespaces` | Postgres |

**Key data shapes** (`projectFs.ts:19-71`):
- `ProjectInfo { name, path, threadCount, lastModified }`
- `ThreadInfo { name, path, fileCount, lastModified, isComplete, isActive }`
- `ThreadMeta { name, projectName, createdAt, lastModified, honchoSessionId, status: 'active'|'complete', stage, continuedFrom, inheritedContext, compressionCount, dumpCount, reportCount, lastDreamQuery, intakePromptShown }` — stored as `thread.json` per thread folder.
- `DomaineRow { id, name, description, color, position, created_at }` (`domaineFs.ts:14`).

---

## 2. Architecture gap — Electron desktop → React/SSR web (translation table)

| Holocron primitive | Web reality | Dwellium translation |
|--------------------|-------------|----------------------|
| `chokidar.watch()` + `webContents.send` live file events | No filesystem in browser; no push channel | **Drop live-watch.** Manual refresh + refetch-on-mutation (mirrors FileExplorer, which has no watcher). SSE/WebSocket live-watch = optional future cycle. |
| `fs.promises.*` in main process | n/a | HTTP calls to sibling backend (`ai-dashboard369-file-manager`) — same as `fileExplorerApi.ts` / `scribeStore.ts` |
| `ragQuery(...)` Postgres in main | n/a | Backend owns DB; client only sees `{success,data}` JSON |
| `window.electronAPI.*` IPC | n/a | `fetch(\`${API_BASE}/api/workspace/*\`, { headers: getAuthHeaders() })` |
| `BrowserWindow` rename-lock | n/a | Backend-side concern; client just refetches after a mutation resolves |
| Honcho session bound per thread (`threadActions.loadThread`) | Dwellium has Honcho via Stella/ARA already | **Defer.** Thread↔Honcho binding is a later cycle, not the navigation MVP |
| zustand stores (`domainesStore`, `scribeStore`) | zustand IS in Dwellium (`scribeStore.ts` uses it) | Port zustand drill-down state directly; per-**user-persisted** bits go through `createLocalStorageStore` instead |
| `thread.json` sidecar metadata on disk | no client disk | Backend stores sidecar JSON (Holocron-style) OR a small table — see §10 decision |

---

## 3. Data model: Domaine → Project → Thread

The model is a strict 3-level tree, identical between Holocron's folder layout and Dwellium's documented file-explorer layout:

```
Domaine            (Holocron: rag_domaines row + top-level folder; Dwellium fs: depth-1 "domain")
└── Project        (folder; namespace row in Holocron;            Dwellium fs: depth-2 "project")
    └── Thread     (folder w/ thread.json + System/Memory/;       Dwellium fs: depth-3 "thread")
        └── files  (Reports/, References/, notes, etc.)
```

`Docs/backend-file-explorer-routes.ts:42-48` already infers `domain|project|thread|folder|file` by depth — **the tiers exist in the backend today.** What the file-explorer tree does NOT carry: Domaine color/description/position, and `ThreadMeta` (status, stage, honcho binding, counts). Those are the only genuinely new persistence needs (see §6 + §10).

---

## 4. The reuse finding (why this shapes everything)

`Docs/backend-file-explorer-routes.ts` is a **template route contract that lives in the sibling backend repo** `ai-dashboard369-file-manager` (per its install header, lines 21-27). It already exposes per-user, auth-guarded, path-traversal-guarded CRUD over the 3-tier tree (`/tree`, `/mkdir`, `/touch`, `/read`, `/rename`, `/move`, `/entry`). The Dwellium `FileExplorer` widget consumes it via `fileExplorerApi.ts`.

**Implication:** "Workspace" ≈ a higher-altitude **drill-down navigator** (Domaines grid → Projects → Threads) over that same tree, plus a thin **metadata layer** for the things the raw filesystem can't express. We do **not** need to reimplement file CRUD, and we should **not** create a second parallel domain/project/thread store.

---

## 5. Target Dwellium shape (files Cycle 3+ would create — NOT this branch)

Mirroring Scribe/FileExplorer conventions, colocated under `qualia-shell/src/components/Workspace/`:

| File | Mirrors | Purpose |
|------|---------|---------|
| `Workspace.tsx` | `FileExplorer.tsx` | widget root; drill-down view (index→domaine→project) |
| `workspaceApi.ts` | `fileExplorerApi.ts` | HTTP client: `${API_BASE}/api/workspace/*` + `getAuthHeaders()`, `{success,data}` envelope |
| `workspaceStore.ts` | `domainesStore.ts` (logic) + zustand | drill-down view state, cached `domaines[]` + `projectDomaineMap`, sort prefs |
| `workspaceUiStore.ts` | `fileExplorerStore.ts` | per-**user** persisted UI (active domaine, sort modes) via `createLocalStorageStore` dynamic-key `workspace:${uid}` |
| `useDomaineForProject.ts` | Holocron hook (near-portable) | project→domaine resolver off the cached map |
| `Workspace.css` | `Scribe.css` | styling, `strata-dashboard`-scoped if windowed |
| `DomaineBadge.tsx` (opt.) | Holocron `DomaineBadge.tsx` | colored domaine chip |

Registration (Cycle 3+): add a `'workspace'` entry to `widgetRegistry.ts` via `lazyWithReload(() => import('../components/Workspace/Workspace'))` and a `Filing Cabinet`-group dock row in `hierarchy.ts` (sister to the existing `scribe` / `file-explorer` rows at `hierarchy.ts:43-44`).

---

## 6. `/api/workspace/*` route contract — **SIBLING-BACKEND, OUT OF SCOPE for this branch**

> ⚠️ Routes live in `ai-dashboard369-file-manager`, **not** in `qualia-shell/app/routes/` (which is only the SPA shell). This branch (`feat/workspace-widget`) ships **only** the client + a documented contract at `Docs/backend-workspace-routes.ts` — sister to `Docs/backend-file-explorer-routes.ts`. Backend implementation + install is a separate, Ilya-gated step (matches the file-explorer + scribe precedent).

Two viable backings (pick per §10 decision):

- **(Recommended) Reuse file-explorer tree** — Workspace derives Domaines/Projects/Threads from `GET /api/file-explorer/tree` (already exists). New routes needed **only** for metadata: `GET/PUT /api/workspace/domaines` (color/description/position) and `GET/PUT /api/workspace/thread-meta?path=…` (status/stage/etc., stored as `thread.json` sidecar like Holocron). Minimal new backend surface.
- **(Heavier) Dedicated `/api/workspace/*`** — full parallel of Holocron: `/domaines` CRUD, `/projects`, `/threads`, `/thread/load`, backed by its own table. More code, duplicates file CRUD.

Envelope + auth must match the house style: `authenticate` middleware, `req.user.id` scoping, `{ success, data | error }`, path-traversal guards (`Docs/backend-file-explorer-routes.ts:94-109`).

---

## 7. Per-user client state plan

Follow the established dynamic-key pattern (`integrationsStore.ts` / `fileExplorerStore.ts`):

- `workspaceUiStore = createLocalStorageStore({ key: () => \`workspace:${uid}\` , deserializer, defaultValue })`, with a module-level `workspaceUserIdHolder.current` updated **during render before** `useSyncExternalStore` reads (the holder pattern, `integrationsStore.ts:24` + `fileExplorerStore.ts:39`).
- Export `.reset()`; tests call it in `beforeEach` (v2.72.1 standing convention, `createLocalStorageStore.ts:58-74`).
- Persist per-user: `activeDomaineId`, `sortDomaine/Project/Thread`, expansion state. Do **not** persist server data (domaines list / tree) — that's fetched.
- Transient drill-down view state (`view`, `activeProject`) can stay in a plain zustand store (not persisted), mirroring `domainesStore`.

---

## 8. Scribe + FileExplorer integration decisions

- **FileExplorer overlap:** FileExplorer already renders the per-user 3-tier tree. Workspace is the *organizational* view (domaine cards → project lists → thread lists with metadata) vs FileExplorer's *raw file tree*. They share the backend tree but present different altitudes. Recommend Workspace **reuse `fileExplorerApi.fetchTree()`** for structure rather than a second tree endpoint (decision D3, §10).
- **Scribe handoff:** Holocron's `loadThreadForPath()` opens a doc in Scribe and moves active Domaine/Project/Thread. Dwellium analog: a Workspace "open in Scribe" action calls `useScribeStore.getState().openFile(relPath)` (already exists, `scribeStore.ts:223`). Clean, low-risk; recommend including a minimal version.
- **Honcho/Dreaming Agent:** Holocron binds Honcho per thread for chat memory. Dwellium has Honcho via Stella (`StellaAgent/honchoDreamStore.ts`). Recommend **deferring** any thread↔Honcho binding — it's orthogonal to the navigation MVP and would balloon scope.

---

## 9. SSR-safety + registration notes

- Widget renders under `AuthGate` (client-only at runtime), but **stores must still be SSR-safe** — the strict-gate SSR smoke test fails on init-time browser-global reads. Using `createLocalStorageStore` (already SSR-safe via `getServerSnapshot`) satisfies this; **no** `useState(() => localStorage.…)` init-time reads (per-provider-SSR-safety taxonomy, CLAUDE.md).
- Register via `lazyWithReload` at `widgetRegistry.ts` altitude (top-level lazy candidate — the 2-layer altitude rule, CLAUDE.md).
- Editing `widgetRegistry.ts` / `hierarchy.ts` / anything under `qualia-shell/src/**` AUTO-FIRES the parity gate — so Cycle 3+ (which touches source) must run the full strict gate; this Cycle 2 (docs-only under `Scripts/**`) does not.
- New widget tests must mock `UserContext` with `importOriginal` + spread (the fix just landed at `db0ab95`) if they touch `useIntegrations`/raw `UserContext`.

---

## 10. Open decisions for Ilya (recommended defaults — answer before Cycle 3)

| # | Decision | Recommended default | Why |
|---|----------|---------------------|-----|
| **D1** | Reuse the existing file-explorer 3-tier backend, or stand up a separate `/api/workspace/*` + domaine table? | **Reuse** (derive tree from `/api/file-explorer/tree`; add only metadata routes) | Tree + per-user fs already exist & proven; avoids a parallel model |
| **D2** | Where does Domaine/Thread **metadata** (color, description, position; thread status/stage) live? | **`thread.json` + `domaine.json` sidecar files** (Holocron-style) on the same fs | No new DB table; backend already does sidecar-style writes; portable |
| **D3** | Does Workspace's tree share FileExplorer's `/tree` endpoint or get its own? | **Share `/api/file-explorer/tree`** | One source of truth for the per-user tree |
| **D4** | Is a Scribe "open in Scribe" handoff in scope for the MVP? | **Yes, minimal** (`scribeStore.openFile`) | Low-risk, high-value, API already exists |
| **D5** | Thread↔Honcho chat-memory binding (Holocron's `loadThread`)? | **Defer** to a post-MVP cycle | Orthogonal; large scope; Stella already owns Honcho |
| **D6** | Live file-watch (chokidar analog)? | **Drop** for MVP; manual refresh + refetch-on-mutation | No web equivalent; FileExplorer ships without it |
| **D7** | Does Workspace introduce new top-level concepts, or map onto Dwellium's existing hierarchy (`hierarchy.ts` / Filing Cabinet)? | **Map onto existing** — new `'workspace'` dock row in Filing Cabinet group | Consistency with scribe/file-explorer siblings |

---

## 11. ~10-cycle port sketch (indicative; re-scoped after D1–D7 answered)

1. **Cycle 2 (this):** discovery + plan (DONE — stop for review).
2. **Cycle 3:** `Docs/backend-workspace-routes.ts` contract (metadata endpoints only, per D1/D2) — docs-only, sibling-backend-gated.
3. **Cycle 4:** `workspaceApi.ts` + `workspaceStore.ts` + `workspaceUiStore.ts` scaffold (no fetch yet) + unit tests. Strict gate.
4. **Cycle 5:** Domaines index view (`Workspace.tsx`) — fetch domaines, render cards; loading/empty/error states.
5. **Cycle 6:** drill-down to Projects (derive from tree per D3) + back-nav.
6. **Cycle 7:** drill-down to Threads + `ThreadInfo`/`ThreadMeta` surface (status/stage badges).
7. **Cycle 8:** mutations — create/rename/move/delete domaine·project·thread (over existing file-explorer routes + metadata).
8. **Cycle 9:** Scribe "open in Scribe" handoff (D4) + DomaineBadge.
9. **Cycle 10:** per-user persistence polish (sort prefs, active domaine), a11y pass (aria-labels per the RefreshCw/Section conventions), WCAG AA contrast.
10. **Cycle 11:** registration (`widgetRegistry.ts` + `hierarchy.ts`), full strict gate, screenshot/axe baselines, closure.

Honcho binding (D5) + live-watch (D6), if ever pursued, are post-Cycle-11 add-ons.

---

## 12. Scope boundaries (this branch, `feat/workspace-widget`)

- ✅ This branch: client widget + `Docs/backend-workspace-routes.ts` contract + this plan.
- 🚫 Backend route implementation/install (sibling repo `ai-dashboard369-file-manager`) — Ilya-gated, separate.
- 🚫 No edits to `Docs/holocron-reference/**` (read-only reference subtree).
- 🚫 No `subtree-add`. No push (Ilya pushes). No touching `feat/scribe-widget` / `feat/file-explorer-enhanced`.
- 🚫 `Scripts/autorun/HALT` left untouched.

---

## 13. Sources read (Cycle 2)

Holocron: `editor/src/main/{workspace.ts, projectFs.ts(surface+L17-231), domaineFs.ts(surface)}`, `editor/src/renderer/src/{store/domainesStore.ts, hooks/useDomaineForProject.ts, utils/threadActions.ts}`, `editor/scripts/migrations/004_domaines.sql`.
Dwellium: `qualia-shell/src/components/{FileExplorer/fileExplorerApi.ts, FileExplorer/fileExplorerStore.ts, Scribe/scribeStore.ts}`, `qualia-shell/src/utils/{createLocalStorageStore.ts, integrationsStore.ts}`, `qualia-shell/src/{registry/widgetRegistry.ts(scribe/file-explorer entries), data/hierarchy.ts(Filing Cabinet)}`, `Docs/backend-file-explorer-routes.ts`.
