# Handoff v12 — Clean slate after the architectural reset

**To:** the next Claude session
**From:** prior session 2026-05-12 — completed PR 1 of the architectural reset (General Domaine removed entirely, schema migration 006 lands, b9921aa partial revert), then Andy stress-tested the new flow and surfaced six critical bugs in the Domaines/Projects/Threads CRUD layer. Rather than fix them piecemeal, Andy chose to wipe back to true zero (DB cleared, `_Domaines/` emptied) and start the next session with a clean slate + a tight bug list to work through first.
**You are starting:** fixing the six bugs documented below before doing anything else. Then end-to-end testing the create/rename/delete Domaine flow. Then building the Nuclear Reset in Settings (new feature, see below).

---

## 🛑 READ FIRST — verification rules carried over from v11

`npx tsc --noEmit` from the editor root is a **no-op** (root tsconfig has `"files": []` and only project references). And `npx tsc -b` (build mode) emits `.d.ts` + `.js` files into the renderer source tree (the web tsconfig has no `noEmit` or `outDir`), polluting ~140 stray files.

**Use `npm run typecheck`** — script is now `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`. Per-project, no-emit, no traps.

Pre-existing tsc errors (NOT introduced this session, NOT yet fixed — separate triage pass):
- `src/main/cleanupOps.ts:174` — TS2322
- `src/main/convert.ts:20, 29` — TS2339 (mammoth + pdf-parse)
- `src/main/dashboard.ts:54` — TS18047
- `src/main/ipc.ts:303` — TS2345 (`path.basename` in `.map(...)`)
- `src/main/ragIngest.ts:153` — TS2339 (`config.gemini` not in `HolocronConfig` type)
- `src/renderer/src/components/chat/ChatMessage.tsx:67` — TS2353 + TS7031
- `src/renderer/src/components/codex/CodexPreview.tsx:997, 1078` — TS2345 + TS2352
- `src/renderer/src/components/codex/Graph.tsx:2` — TS2724 (`Stylesheet` → `StylesheetCSS`)
- `src/renderer/src/components/hud/HUD.tsx:50` — TS2367 (`'dashboard'` literal vs AppTab)

Filter your typecheck output for files YOU touch. Don't fix the above unless explicitly tasked.

---

## Read order (~15 min)

1. **`docs/STATUS.md`** — refreshed in this session
2. **This file** (HANDOFF_v12)
3. **`docs/HANDOFF_v11_org-crud.md`** — prior chapter (Org CRUD layer + tsc trap + the orgOps Partial→Full clobber fix). v12 follows on directly.
4. **`docs/architecture-v3.md`** Part 4.1 — Domaines vision
5. **`docs/PHASE_1_VALIDATION.md`** — paused validation pass; still on hold

---

## Commits since v11 (ae27a19)

### `b9921aa` feat(domaines): Phase 1 — folder restructure foundation + hide-General-when-empty

The FIRST attempt at the Domaine folder restructure. Bundled:
- `runDomaineFolderMigration` — boot + on-demand migration that moved flat projects into `<root>/<DomaineName>/<Project>/` (defaulting to `General/`)
- Boot wire in `index.ts`
- `domaines:migrate-folders` IPC + preload + types
- Renderer trigger in `handleProjectsRootChange`
- `listProjects` updated to handle BOTH flat and nested layouts (transition mode)
- `createProject` updated to use nested path (defaulted to General if no domaineId)
- UI: hide General Domaine card when empty (with carve-out for first-time setup)

**Most of this was partially reverted in c4f7e32** when Andy chose the clean architectural reset (General removed entirely, no auto-migrate). The commit is preserved in history for archaeology, but the migration runner, the boot wire, the migrate-folders IPC, the renderer trigger, and the hide-General filter are all GONE. What survived: the nested-layout path resolution conventions in `listProjects` + `createProject` (now tightened in c4f7e32 to nested-only).

### `c4f7e32` feat(domaines): PR 1 — remove General + restructure rag_namespaces for nested layout

The architectural reset. Three concerns wired together — schema migration + backend rewrite + b9921aa partial revert.

**Migration `006_remove_general.sql`** (NEW)
- Drops NOT NULL on `rag_namespaces.domaine_id` (bridges live without one).
- NULLs out bridge namespaces (`__library__`, `__inbox__`) — they had been pointing at General.
- DELETEs all user namespace rows (clean slate).
- DELETEs the General row in `rag_domaines` (no fallback exists anymore).
- Replaces `(name)` PK with synthetic UUID `id` PK so we can have composite uniqueness with nullable `domaine_id`.
- Adds `UNIQUE NULLS NOT DISTINCT (name, domaine_id)` — same project name CAN now exist in two different Domaines (e.g. `AstraStrata/Chalet` AND `Personal/Chalet` on disk), but bridge names with NULL `domaine_id` can't duplicate. Postgres 15+ behavior.
- Idempotent.

**`domaineFs.ts`** (rewrite ~80%)
- Removed: `ensureGeneralDomaine`, `GENERAL_DOMAINE_NAME`, `getGeneralDomaineId`. No more boot guard, no fallback.
- `createDomaine` now takes `projectsRoot`, validates name (no path separators, no "General" reserved name), creates the folder + DB row. Atomic-ish — folder first, DB second, rollback rmdir on DB failure.
- `updateDomaine` handles rename as a full filesystem rename + cascade: `source_path REPLACE` for every doc under the Domaine, `continuedFrom.threadPath` cascade, active-config rewrite. Wrapped in `withRenameLock`.
- `deleteDomaine` has a NEW signature: discriminated union
  ```ts
  | { mode: 'reassign'; targetDomaineId: string }
  | { mode: 'purge';    confirmName:     string }
  ```
- New `getRenameSummary` for the PR 3 modal pre-fetch.

**`projectFs.ts`**
- Removed `runDomaineFolderMigration` entirely (no auto-migrate per spec).
- `listProjects` tightened to nested-only — top-level subdirs whose name doesn't match a Domaine in `rag_domaines` are silently ignored.
- `createProject` requires `domaineId` (was optional with General fallback).

**`ragIngest.ts`** `ensureNamespaceRow`
- Removed General fallback. Seeds with NULL `domaine_id`. **TODO: PR 2 will derive Domaine from the document's path.**

**`index.ts`** boot
- Removed `runDomaineFolderMigration` import + boot wire.

**`ipc.ts`**
- Removed `ensureGeneralDomaine` boot guard call.
- Removed `domaines:migrate-folders` handler.
- `domaines:create/update/delete` now read `projectsRoot` from config.
- New `domaines:rename-summary` handler.
- `domaines:delete` signature updated to discriminated union.
- `projects:create` requires `domaineId`.

**`preload/index.ts`** + **`types/ipc.ts`**
- `domainesDelete` signature → discriminated union.
- `domainesRenameSummary` added.
- `domainesMigrateFolders` removed.

**Renderer cleanup (`Domaines.tsx`)**
- Removed migration trigger from `handleProjectsRootChange`.
- Removed hide-General filter.
- Removed `handleDelete` in DomainesIndex (called stale `'move-to-general'` mode).
- Removed `handleDeleteDomaine` in DomaineView (same).
- Delete option removed from kebab menus (DomaineCard + DomaineView header). PR 3 was supposed to bring it back with the reassign/purge modal — never shipped, see Bug #3.

---

## Current system state (verified 2026-05-12, end of session)

### Database — true zero

```sql
TRUNCATE TABLE rag_documents, rag_tags, rag_wiki_pages, rag_syntheses, rag_operations_log RESTART IDENTITY CASCADE;
DELETE FROM rag_domaines;
DELETE FROM rag_namespaces WHERE name NOT IN ('__library__', '__inbox__');
```

| Table | Rows |
|---|---|
| rag_documents | 0 |
| rag_tags | 0 |
| rag_relationships | 0 |
| rag_wiki_pages | 0 |
| rag_wiki_page_sources | 0 |
| rag_syntheses | 0 |
| rag_operations_log | 0 |
| rag_document_tags | 0 |
| rag_domaines | **0** (no Domaines exist; first-launch state) |
| rag_namespaces | 2 (`__library__` + `__inbox__`, both `domaine_id = NULL`) |
| rag_config | 2 (preserved: budget settings) |
| rag_schema_migrations | 6 (001→006) |

### Filesystem — true zero

`_Domaines/` directory preserved, contents wiped:
```
drwxr-xr-x   3 anzo  staff     96 May 12 00:29 .
drwxr-xr-x  18 anzo  staff    576 May 12 00:42 ..
-rw-r--r--@  1 anzo  staff  10244 May 12 00:44 .DS_Store
```

`_Library/Wiki/` — empty (cleared earlier in v11 session).

### Config (on disk at `~/Library/Application Support/holocron-editor/holocron-config.json`)

⚠ **Andy must re-enter API keys in Settings before any LLM work:**
- **Gemini API key** — empty
- **Anthropic API key** — empty

These were lost during the v11 orgOps Partial→Full clobber and not restored. The renderer's settingsStore re-saved most of the config, but the API keys (which require typing in Settings → Connections) were not re-entered.

Other config:
- `holocronRoot`: `/Users/anzo/_AI/Projects/Holocron/_Domaines` ✓
- `workspace.path`: same ✓
- `projectsRoot`: empty ⚠ — must Pick Workspace Folder via Domaines tab
- `activeProject*` / `activeThread*`: all empty (first-time-launch state)
- `appearance.theme`: `holocron-dark` ✓
- LM Studio config: `lmstudio` provider, `gemma-4-31b-it` model ✓

### Running infrastructure (still verified)

```
Postgres   localhost:5432   pgvector/pgvector:pg15      container holocron_link-database-1
Redis      localhost:6379   redis:8.2                   container holocron_link-redis-1
Honcho     localhost:8000   custom build                containers holocron_link-api-1 + deriver-1
```

`HOLOCRON_DB_URI` in `editor/.env`. `npm run db:setup` is idempotent and applies migrations 001→006.

---

## 🐛 SIX BUGS — fix these first, in priority order

Andy stress-tested PR 1 and surfaced the following. **All are blocking** — Domaines layer is unusable until they're fixed. He explicitly said: "Fix only these specific bugs. Do not add features."

### Bug 1 — Creating a Domaine does not create a folder on disk

**Symptom:** User clicks "+ New Domaine" in DomainesIndex, types a name, clicks Create. Modal closes, Domaine appears in DB and in the UI, but `<projectsRoot>/<DomaineName>/` is never created on disk.

**Where to look:** `domaineFs.ts:createDomaine`. The function as written in c4f7e32 SHOULD create the folder (`fs.mkdir(folderPath, { recursive: false })` after the existence check). Something between the IPC handler and the function is going wrong. Possible causes:
- `projectsRoot` from `loadConfig()` is empty → function returns `{ ok: false, error: 'Workspace folder not set' }` BUT the renderer might be ignoring the error and still showing the Domaine
- The renderer's `domainesCreate` IPC call doesn't pass `projectsRoot` (it's read server-side from config now in c4f7e32)
- The `fs.mkdir` is silently failing somewhere

**Likely root cause:** `projectsRoot` in config is empty when the IPC fires. The handler returns an error, but the renderer's NewDomaineModal doesn't surface it correctly OR the rendererStore inserted the Domaine optimistically without waiting for confirmation.

**Fix direction:** verify projectsRoot is set before showing the create modal; surface the error properly; ensure DB insert and fs mkdir are truly atomic (rollback DB if mkdir fails — already in c4f7e32 but verify).

### Bug 2 — Domaines exist in DB with no corresponding folder on disk

**Symptom:** Related to Bug 1. Domaines that were created (or migrated, or imported) without a corresponding fs folder still appear in `domaines:list`. The UI shows them but they're zombie rows.

**Fix:** Add a disk-existence check to `domaineFs.ts:listDomaines`. For each row, `await fs.access(<projectsRoot>/<name>)` — only include if the folder exists. Alternatively: surface them with a "missing folder" badge so the user can repair. Recommend the strict filter for v1 — zombie rows shouldn't show up at all.

### Bug 3 — No way to delete a Domaine

**Symptom:** Delete option was removed from the kebab menu in c4f7e32 with the comment "PR 3 will bring it back with the reassign/purge modal." PR 3 was never shipped — the user has no way to delete a Domaine via the UI.

**Per Andy's spec:** "Add a simple delete back immediately — just the purge path with typed confirmation. No reassign option needed yet."

**Fix direction:**
- DomaineCard kebab gets a "Purge…" item (red, danger)
- Clicking opens a `PurgeDomaineModal` (reuse the existing `PurgeOrgModal` pattern)
- Typed confirmation field: user types Domaine name
- On confirm: `domainesDelete(id, { mode: 'purge', confirmName: name })`
- Backend already supports this (c4f7e32 wired the discriminated union)
- The reassign option is deferred — no UI yet.

### Bug 4 — Purge project does not work

**Symptom:** Andy didn't expand on what "doesn't work" means. Could be: the kebab Purge option doesn't open the modal, OR the modal opens but the operation fails, OR the operation succeeds but DB/fs aren't cleaned up.

**Where to look:** `Domaines.tsx` PurgeOrgModal flow → `window.electronAPI.projectsPurge(projectsRoot, projectName, confirmName)` → `ipc.ts:projects:purge` handler → `projectFs.ts:purgeProject`.

**Likely culprits:**
- `projectName` arg might be wrong (the renderer passes the ProjectInfo's `.name`, but with nested layout the project's full path is `<root>/<domaine>/<name>/` — does `purgeProject` reconstruct correctly?)
- The SQL DELETE in `purgeProject` filters by `WHERE project_name = $name` — with the new schema (`UNIQUE(name, domaine_id)`), two projects can have the same name across Domaines, so this DELETE could affect the wrong row
- `assertNotActiveProject` might be incorrectly tripping (overlaps with Bug 5)

**Fix direction:** investigate first, propose fix to Andy. Likely needs to use `(project_name, domaine_id)` or the absolute project path to disambiguate.

### Bug 5 — Cannot delete an active thread

**Symptom:** Active-state guard refuses deletion of the currently-active thread with no escape hatch. User has to manually navigate away first, which is awkward.

**Per Andy's spec:** "Change the behavior: if the user tries to delete the active thread, first close it (set activeThreadPath to empty), then delete it."

**Fix:** `purgeThread` (and possibly `renameThread` / `moveThread`) — instead of throwing `ActiveStateError`, detect the active case and clear the active config keys (`activeThreadName` / `activeThreadPath` → empty) BEFORE proceeding with the deletion. Same for the project containing the active thread (purgeProject + assertNotActiveProject).

Renderer-side: after the IPC succeeds, the scribe store should also close any open file tabs pointing into the deleted thread (`useScribeStore.closeFile(...)` for every matching path). Verify this happens.

### Bug 6 — Rename project says "project not found on disk" with valid name

**Symptom:** User clicks Rename… on a project, types a new valid name, clicks Save. Backend returns `"Project \"<oldName>\" not found on disk"` even though the project clearly exists.

**Where to look:** `projectFs.ts:renameProject`. It does:
```ts
const oldPath = path.join(projectsRoot, oldName)
try { await fs.promises.stat(oldPath) } catch { return { ok: false, error: `Project "${oldName}" not found on disk` } }
```

**Likely root cause:** With nested layout, `oldPath` should be `path.join(projectsRoot, domaineName, oldName)`, not `path.join(projectsRoot, oldName)`. The function was written for flat layout in `9501459` and never updated for nested. Same likely affects `purgeProject` (Bug 4) and `moveProject`.

**Fix:** the IPC needs to receive `domaineName` (or `projectPath`, the absolute path) to construct the correct old/new paths. Either:
- (a) Pass the full project path from the renderer (already known via `ProjectInfo.path`)
- (b) Look up Domaine name from the project's namespace row

Recommend (a) — renderer has the path, just pass it. Smaller diff.

This same bug almost certainly affects `purgeProject` (Bug 4), `moveProject`, `renameThread`, `moveThread`, `purgeThread` — anywhere that constructs paths from `(projectsRoot, projectName)` assuming flat layout.

**This is the biggest category of bugs.** The audit Andy mentioned for PR 2 ("nested-path source_path REPLACE patterns") is now urgent.

---

## Next session priorities (in order)

1. **Fix the six bugs above.** Plan first, confirm with Andy, then ship in one or two commits.
2. **End-to-end test** the Domaine flow: create → rename → create project inside → rename project → create thread → rename thread → purge thread → purge project → purge Domaine. Each step verified on disk + in DB.
3. **Build "Nuclear Reset" in Settings.** A new Settings panel button that reproduces the SQL + filesystem cleanup from this session in one click. Prevents the manual SQL/rm dance Andy did twice. Spec to confirm with Andy:
   - Button in Settings (probably under General or a new Maintenance tab)
   - Triple-confirm flow (typed "RESET" or similar)
   - Wipes content tables + Domaines + user namespaces (preserves bridges, config, migrations)
   - Wipes `<projectsRoot>/*/` subdirs but keeps `<projectsRoot>/` and `_Library/Wiki/`
   - Reports row counts + folder count after
4. **Resume Phase 1 ingestion validation** — the corpus paths will need to be re-derived under the nested layout.

---

## Recovery checklist for Andy on next launch

After restarting Holocron:

1. **Settings → Connections** — re-enter Gemini API key and Anthropic API key. They were lost during the v11 orgOps clobber.
2. **Domaines tab** — should be empty (zero Domaines). The "Pick Projects Folder" prompt should appear since `projectsRoot` is empty in config.
3. **Pick Projects Folder** → select `/Users/anzo/_AI/Projects/Holocron/_Domaines/`. After this, `projectsRoot` is set in config.
4. ⚠ **Do NOT try to create a Domaine yet** — Bug 1 will create a DB row without a folder on disk, leaving zombie state. Wait for the next session to fix.
5. ⚠ **Do NOT try to ingest anything** — `ensureNamespaceRow` writes NULL `domaine_id` (PR 2 fix needed) and the path parser still assumes flat layout.

---

## Open TODOs (carried over from v11)

### High priority
- **Six bugs above** — blocking
- **PR 2 of the architectural reset** — `ragIngest` path parser update + audit of `renameProject` / `moveProject` / `purgeProject` / `renameThread` / `moveThread` / `purgeThread` source_path REPLACE patterns. Bug 6 makes this urgent.
- **PR 3 of the architectural reset** — DeleteDomaineModal with reassign + purge UX (Bug 3 partially addresses purge), Sidebar strict-scoping to activeThreadPath, thread switcher footer audit.
- **Honcho session cleanup on purge** — TODO markers in `purgeProject` and `purgeThread`. Sessions remain orphaned.

### Medium priority
- **Pre-existing tsc errors** (table at top) — separate triage pass.
- **Watcher pause shim is fragile** — counter-based global flag in `workspace.ts`. Out-of-app fs activity during a rename window is dropped. Acceptable for single-user desktop.
- **`config.gemini` / `config.anthropic` not in `HolocronConfig` type** — runtime fields exist but the TS interface doesn't declare them. One of the pre-existing tsc errors.

### Low priority / cosmetic
- **Fey theme work** — `themes.ts` + `docs/Fey design.md` uncommitted. Per Andy: do not commit, do not modify.
- **`projectsRoot` UI copy** — Andy considered renaming to "Workspace Folder". Cosmetic, ask before changing.
- **Stale `activeSessionId` / `activeSessionName` in config** — pre-Projects model leftover, not actively used.

---

## Recent commits trail (chronological, most recent first)

```
c4f7e32 feat(domaines): PR 1 — remove General + restructure rag_namespaces for nested layout
b9921aa feat(domaines): Phase 1 — folder restructure foundation + hide-General-when-empty   ← partially reverted by c4f7e32
ae27a19 docs: HANDOFF_v11 + STATUS refresh — Org CRUD layer + tsc verification trap   ← v11 boundary
773c6b9 fix(org): orgOps clobbered config + MoveThreadModal undefined guard + tsc verification
ced79fc feat(org): hierarchy CRUD UI — kebab affordances + edit/rename/move/purge modals
9501459 feat(org): project + thread CRUD backend (rename/move/purge IPCs)
a4dd981 feat(org): rename lock + active-state guards + boot config validation
```

Working tree state at handoff time:
- `M src/renderer/src/themes.ts` — Fey work, deferred (do not touch)
- `D tsconfig.web.tsbuildinfo` — autogenerated
- `?? ../docs/Fey design.md` — Andy's, deferred
- `?? ../docs/PHASE_1_VALIDATION.md` — leave in tree until validation completes

---

## Hand-off — what to do next

1. **Read this file fully.** Then `HANDOFF_v11_org-crud.md` for the prior chapter.
2. **Verify Andy has re-entered API keys + picked the workspace folder** before any code work that touches them.
3. **Fix the six bugs in order.** Plan first, confirm with Andy, ship in 1-2 commits.
4. **End-to-end test** the create → rename → purge flow at all three levels (Domaine, Project, Thread).
5. **Verify with `npm run typecheck`** every chunk. NEVER `tsc --noEmit` from root (no-op). NEVER `tsc -b` (emits).
6. **Then build Nuclear Reset** in Settings per the spec above.
7. **Don't resume Phase 1 ingestion validation** until the layer is stable.
8. **Andy's communication style:** describes goals + frustrations precisely; names files + symptoms; expects 🍣 canary at the start of every response (per AGENTS.md) and ETA before action. Read carefully — instructions are exact.
