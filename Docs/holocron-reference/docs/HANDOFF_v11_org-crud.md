# Handoff v11 — Org CRUD + tsc verification trap + folder restructure pending

**To:** the next Claude session
**From:** prior session 2026-05-12 — shipped the full Domaines/Projects/Threads CRUD layer (kebab affordances + 5 new modals + 8 new backend IPCs + ~1.5K LOC across 3 commits), then hit a regression caused by a Partial→Full saveConfig clobber that broke the Scribe file explorer. Fixed in a follow-up commit. Discovered mid-investigation that `npx tsc --noEmit` had been a no-op all session — every prior "tsc clean" claim was a false positive. Documented prominently below.
**You are starting:** Phase 1 of the **Domaine folder restructure** (move flat projects under `_Domaines/` into nested `_Domaines/<Domaine>/<Project>/` layout). This is the IMMEDIATE next priority — NOT the Phase 1 ingestion validation, which remains paused.

---

## 🛑 READ THIS FIRST — tsc verification trap

`npx tsc --noEmit` from the editor directory is a **no-op**. Root `tsconfig.json` has `"files": []` and only declares project references to `tsconfig.node.json` + `tsconfig.web.json`. Without `--build` (or `-b`), tsc does not traverse references — it checks the empty file list and exits clean. Total false sense of safety.

**Every "tsc clean" claim from the prior session was a false positive.** Two real bugs slipped through unnoticed:
- `src/main/orgOps.ts:153` — `Partial<HolocronConfig>` passed to `saveConfig` (which is full-replace via `JSON.stringify`). Clobbered the on-disk config to ~80 bytes on first boot. Caused the Scribe file explorer regression. Fixed in `773c6b9`.
- `src/renderer/src/components/layout/Domaines.tsx:1342` — undefined guard missing in MoveThreadModal grouping. Fixed in `773c6b9`.

`package.json`'s `typecheck` script is now `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json` — checks each subproject directly with `--noEmit`. **Use `npm run typecheck`.** Do NOT use `tsc -b` — build mode EMITS `.d.ts` + `.js` files alongside the source (the web tsconfig has no `outDir` or `noEmit`), polluting the working tree with ~140 stray files. The per-project `--noEmit` invocation avoids this. Plain `tsc --noEmit` from the editor root is still a no-op (project-references trap).

### Pre-existing tsc errors uncovered by the proper check

These pre-date this session; they were always there but `tsc --noEmit` never surfaced them. **Do NOT fix them in feature commits — they need a separate triage pass.**

| File | Line | Code | Summary |
|---|---|---|---|
| `src/main/cleanupOps.ts` | 174 | TS2322 | `number \| null` → `number` |
| `src/main/convert.ts` | 20, 29 | TS2339 | mammoth + pdf-parse import shapes |
| `src/main/dashboard.ts` | 54 | TS18047 | `res.rowCount` possibly null |
| `src/main/ipc.ts` | 303 | TS2345 | `path.basename` signature mismatch in `.map(path.basename)` |
| `src/main/ragIngest.ts` | 153 | TS2339 | `config.gemini` doesn't exist on `HolocronConfig` type (extra runtime fields not declared) |
| `src/renderer/src/components/chat/ChatMessage.tsx` | 67 | TS2353 + TS7031 | `p_last` not in react-markdown component type, `children` implicit any |
| `src/renderer/src/components/codex/CodexPreview.tsx` | 997, 1078 | TS2345 + TS2352 | ScribeColorTheme tokens shape, ReactPortal cast |
| `src/renderer/src/components/codex/Graph.tsx` | 2 | TS2724 | cytoscape `Stylesheet` import (renamed to `StylesheetCSS`) |
| `src/renderer/src/components/hud/HUD.tsx` | 50 | TS2367 | `'dashboard'` literal compared to AppTab union (renamed to `'hud'`) |

These are real correctness issues that need fixing eventually. They DO NOT block feature work, but every PR that runs `tsc -b` will show them. Filter the output for your own changes — don't be alarmed by these.

---

## Read order (~15 min)

1. **`docs/STATUS.md`** — refreshed in this session; current as of 2026-05-12
2. **`docs/architecture-v3.md`** — canonical vision; Part 4.1 (Domaines hierarchy) is the spec for the upcoming folder restructure
3. **`docs/HANDOFF_v10_codex-ux.md`** — prior chapter (Codex/Graph + Ingest UX)
4. **`docs/PHASE_1_VALIDATION.md`** — paused validation pass with Andy's expectations baseline. Resume after the folder restructure ships.
5. **`docs/gotcha.md`** — debugging discipline + accumulated priors. Three new lessons worth absorbing from this session:
   - **`tsc --noEmit` from a project-references root is a no-op.** Always `tsc -b`. (Top of this handoff.)
   - **`saveConfig` is full-replace, not merge.** Mutate the loaded full config in place; never pass a Partial. Mirrors every other caller in `ipc.ts`.
   - **Project references hide errors.** When a tsconfig.json has only `references` and empty `files`, plain `tsc` is silent. Always use `-b`.

---

## Commits shipped this session (chronological)

### `a4dd981` feat(org): rename lock + active-state guards + boot config validation

Foundation for the two-operation hierarchy CRUD model.
- **`workspace.ts`** — `withRenameLock` counter-based gate. `notifyAll` early-returns when `renameLockCount > 0`. Drops chokidar's unlink+add storm during fs.rename windows.
- **`orgOps.ts`** (NEW module) — `assertNotActiveProject` / `assertNotActiveThread` (refuse mutations on the live thread, surfaced as banner errors per Andy's spec); `cascadeUpdateContinuedFrom` (walks every `thread.json` under `projectsRoot` to rewrite descendants' branch metadata when an ancestor's path changes); `validateActiveConfigPaths` (boot-time stale-path cleaner — was BUGGY, fixed in 773c6b9); `ActiveStateError` tagged class for IPC error mapping.
- **`index.ts`** — hooked `validateActiveConfigPaths` into boot sequence after the existing Sessions→Projects migration.

### `9501459` feat(org): project + thread CRUD backend (rename/move/purge IPCs)

Two-operation model. **REORGANIZE** = rename + move. **PURGE** = irreversible deletion with typed confirmation.

- **`projectFs.ts`** (~460 LOC added):
  - `renameProject` — atomic `fs.rename` + thread.json rewrites + memory file renames (`Memory_<P>_<T>.json` filename embeds project name) + branch-chain cascade + transactional DB updates (rag_namespaces.name + rag_documents.project_name + source_path REPLACE)
  - `moveProject` — `domaine_id` reassignment ONLY (no fs change in current flat layout — this changes after the restructure)
  - `purgeProject` — server-side `confirmName === itemName` check + `fs.rm -rf` + DELETE rag_documents (cascades tags/relationships/wiki_sources via FK) + DELETE rag_namespaces + orphan sweep
  - `renameThread` / `moveThread` / `purgeThread` — same pattern at thread level
  - `getProjectPurgeSummary` / `getThreadPurgeSummary` — cheap pre-fetch for the modal so destruction count is shown before typing
  - All fs ops wrapped in `withRenameLock`. SQL wrapped in transactions for rename ops.
  - `isValidOrgName` — guards path separators, reserved names, leading dots, length, whitespace
- **`ipc.ts`** — 8 new handlers: `projects:rename/move/purge/purge-summary` and `thread:rename/move/purge/purge-summary`
- **`preload/index.ts`** + **`types/ipc.ts`** — bindings + signatures
- **Honcho session cleanup deferred** — `// TODO` markers in `purgeProject` and `purgeThread`. Sessions remain orphaned on Honcho server after deletion. Defer until storage starts to matter or Honcho exposes a delete API.

### `ced79fc` feat(org): hierarchy CRUD UI — kebab affordances + edit/rename/move/purge modals

UI for Domaines + Projects + Threads in one PR (they share kebab pattern + modal building blocks + store refresh path).

- **`Icons.tsx`** — `IconEdit` (pencil) + `IconKebab` (3 vertical dots)
- **`KebabMenu`** component (in `Domaines.tsx`) — fixed-positioned popover anchored via `getBoundingClientRect`. Required because cards have `overflow:hidden` for the color-stripe clip — an absolute popover would be truncated. Click-outside backdrop, escape close.
- **5 new modals:**
  - `EditDomaineModal` — name + description + preset color palette (reuses existing `ColorPalette`)
  - `RenameOrgModal` — generic single-field rename for Projects + Threads
  - `MoveProjectModal` — radio list of Domaines, current shown as CURRENT and disabled
  - `MoveThreadModal` — tree view grouped by Domaine → Projects (uses `projectsList` + `projectDomaineMap`)
  - `PurgeOrgModal` — generic typed-confirmation pattern (user types exact item name), neon-pink danger header showing destruction summary, Purge button disabled until match
- **`Card`** extended with optional `affordances` prop (`onRename` + `onMove` + `onPurge` + `moveLabel`)
- **`DomainesIndex`** + **`DomaineView`** — wire Domaine + Project ops
- **`ProjectView`** — wires Thread ops
- **`domainesStore.refresh()`** — required because delete-with-move-to-General reassigns namespaces; existing `loadIfNeeded` is gated by `loadedOnce`
- **General Domaine excluded from edit/delete affordances** on every surface (matches backend protection at `domaineFs.ts:169`)

### `773c6b9` fix(org): orgOps clobbered config + MoveThreadModal undefined guard + tsc verification

Three connected fixes for the regression that broke the Scribe file explorer.

- **`orgOps.ts:153`** — `validateActiveConfigPaths` rewritten to mutate-the-loaded-full-config-in-place and `saveConfig(cfg)` instead of building a Partial and calling `saveConfig(updates)`. Comment in place to prevent regression.
- **`Domaines.tsx:1342`** — `generalDomaine ?? null` so the `bucket` type narrows correctly. One-character fix for TS2322/TS2345/TS18048.
- **`package.json`** — `typecheck` script changed from `tsc --noEmit` (no-op) to `tsc -b` (proper).

---

## Current system state (verified 2026-05-12)

### Database (post-wipe + post-cleanup baseline)

All 8 content tables emptied earlier in this session via:
```sql
TRUNCATE TABLE rag_documents, rag_tags, rag_wiki_pages, rag_syntheses, rag_operations_log
RESTART IDENTITY CASCADE;
```
CASCADE handled `rag_document_tags` + `rag_relationships` + `rag_wiki_page_sources`.

| Table | Rows |
|---|---|
| rag_documents | 0 |
| rag_tags | 0 |
| rag_relationships | 0 |
| rag_wiki_pages | 0 |
| rag_syntheses | 0 |
| rag_operations_log | 0 |
| rag_namespaces | 5 (preserved: AstraStrata_PRDs, Agenteryx, Test_Isolation, __library__, __inbox__) |
| rag_domaines | 1 (preserved: General) |
| rag_config | 2 (preserved: budget settings) |
| rag_schema_migrations | 5 (preserved: 001→005) |

### Filesystem

- `_Library/Wiki/` — empty
- `_Domaines/` (Andy's reorganization location, NOT the original `_Projects/`) currently has all projects FLAT (no Domaine folders yet):
  - `Agenteryx/Dev/References/...` (7 dev docs on disk)
  - `AstraStrata_PRDs/PRD-02-Astra/References/...` (4 PRDs: A0, A1, A2 current, A3)
  - `AstraStrata_PRDs/PRD-01-Global/References/...` (3 PRDs: G1, G2, G3 + a Master Index)
  - `AstraStrata_PRDs/Holocron Build/...` (build docs)
  - `Test_Isolation/...` (test namespace)

### Config (after the clobber + recovery)

On disk at `~/Library/Application Support/holocron-editor/holocron-config.json`:

| Field | Status |
|---|---|
| `holocronRoot` | ✓ `/Users/anzo/_AI/Projects/Holocron/_Domaines` (Andy restored manually) |
| `workspace.path` | ✓ same |
| `ai.*` / `gemini.*` / `anthropic.*` / `honcho.*` / `agent.*` / `appearance.theme` / `editorTheme.*` | ✓ survived/restored |
| `projectsRoot` | ⚠ EMPTY — Andy must set via Domaines tab "Pick Projects Folder" → `_Domaines/` |
| `activeProjectName` / `activeProjectPath` / `activeThreadName` / `activeThreadPath` | ⚠ EMPTY — Andy must drill into a Project + load a Thread to repopulate |

### Running infrastructure (verified)

```
Postgres   localhost:5432   pgvector/pgvector:pg15      container holocron_link-database-1
Redis      localhost:6379   redis:8.2                   container holocron_link-redis-1
Honcho     localhost:8000   custom build                containers holocron_link-api-1 + deriver-1
```

`HOLOCRON_DB_URI` in `editor/.env`. `npm run db:setup` is idempotent.

---

## IMMEDIATE NEXT PRIORITY — Domaine folder restructure

Plan finalized this session, NOT yet started. Goal: change filesystem layout from flat
```
_Domaines/<Project>/<Thread>/...
```
to nested
```
_Domaines/<Domaine>/<Project>/<Thread>/...
```

Filesystem becomes the source of truth for Domaine assignment. Database `rag_namespaces.domaine_id` continues as a soft index, kept in sync.

### Decisions confirmed by Andy this session

1. **Project-name uniqueness:** keep GLOBAL — no schema change. Trade-off: same-named projects in different Domaines are forbidden. Acceptable for v1.
2. **Domaine-rename confirmation:** typed confirmation if `>10 projects` or `>100 docs` would be affected; otherwise simple confirm.
3. **`projectsRoot` UI copy:** TBD — keep "Projects Folder" for now until Andy decides.
4. **Migration auto-runs on boot**, no prompt (matches existing Sessions→Projects pattern).
5. **Ship in 3 phases** — see below.
6. **HANDOFF written first** — this doc.

### Phase split

- **Phase 1 (next):** Issue 1 (hide General Domaine card when `projectCount === 0`) + Issue 2 backend foundation (path resolvers, `runDomaineFolderMigration`, Domaine folder ops in `domaineFs.ts`). One commit. Migration runs on next boot — Andy's 3 flat projects move into `_Domaines/General/`.
- **Phase 2:** Project create/list/move/rename/purge IPC rewrites for nested layout. Path parser update in `ragIngest.ts` (currently `relativePath.split('/')[0]` is project; will become index `[1]` after Domaine segment is inserted).
- **Phase 3:** End-to-end test via the paused Phase 1 ingestion validation.

### Files Phase 1 will touch

- `src/main/projectFs.ts` — add path resolvers, `runDomaineFolderMigration`
- `src/main/domaineFs.ts` — extend create/rename/delete IPCs with folder ops
- `src/main/index.ts` — wire `runDomaineFolderMigration` after Sessions→Projects migration, BEFORE `validateActiveConfigPaths`
- `src/renderer/src/components/layout/Domaines.tsx` — hide General Domaine card when empty

### Migration algorithm (Phase 1)

```ts
async function runDomaineFolderMigration(projectsRoot: string): Promise<MigrationResult>
```

Inside `withRenameLock`:
1. List all subdirs of `projectsRoot`.
2. Fetch all Domaine names from `rag_domaines`.
3. For each subdir:
   - If name matches a Domaine → leave (already in new layout).
   - If name matches a Domaine name AND looks like a project → conflict, log + skip.
   - Otherwise → flat project. Resolve its current Domaine via `rag_namespaces` (default `General`). Move folder to `<projectsRoot>/<itsDomaineName>/<itsName>/`.
4. For each moved project, walk threads and:
   - Update `thread.json.projectName` (no-op unless project renamed)
   - Cascade `continuedFrom.threadPath` for any descendant referencing the old path
5. SQL: `UPDATE rag_documents SET source_path = REPLACE(source_path, oldProjectPath + '/', newProjectPath + '/') WHERE project_name = ?`
6. Update config: if `activeProjectPath` / `activeThreadPath` start with an old path, rewrite. Use the safe full-config save pattern.
7. Idempotent — re-running finds nothing to move.

### Open question for Phase 1

Should the migration be reversible? **Recommend: NO.** One-way migration. If user wants to undo, manual fs moves + UPDATE source_paths.

---

## Paused: Phase 1 ingestion validation

Set up earlier in this session, expectations doc written, NOT executed. State frozen at:

- DB at true zero (TRUNCATE landed)
- Andy's expectations captured in `docs/PHASE_1_VALIDATION.md` (Q1-Q4: tags / relationships / wiki pages / namespace policy)
- Validation corpus identified: 8 PRDs (4 PRD-02-Astra including the previously-unindexed A0 + 3 PRD-01-Global)
- Stage A walkthrough was about to start when Andy pivoted to CRUD priority

**Resume after the Domaine folder restructure ships.** The Ingest tab file picker paths will then use the nested folder structure — re-read `PHASE_1_VALIDATION.md` before resuming so the corpus paths are correct.

---

## Open TODOs (consolidated)

### High priority (blocks production use)

- **Domaine folder restructure** (Phases 1-3 above)
- **Honcho session cleanup on purge** — `purgeProject` and `purgeThread` have TODO markers. Sessions remain orphaned on Honcho server. Defer until storage matters OR Honcho exposes a delete API.

### Medium priority

- **Pre-existing tsc errors** (table at top of doc) — separate triage pass needed. Don't ship features on top of these long-term.
- **Watcher pause shim is fragile** — counter-based global flag in `workspace.ts`. Out-of-app fs activity during a rename window is silently dropped. Acceptable for single-user desktop. Revisit if multi-user / sync layer ever lands.
- **`config.gemini` / `config.anthropic` not in HolocronConfig type** — runtime fields exist (visible on disk, used by ragIngest.ts:153) but the TypeScript interface doesn't declare them. Either add to interface or refactor. One of the pre-existing tsc errors.

### Low priority / cosmetic

- **`tsconfig.web.tsbuildinfo`** — autogenerated, currently in working tree as deletion. Harmless.
- **Fey theme work** — `themes.ts` + `docs/Fey design.md` uncommitted. Per Andy: do not commit, do not modify, do not pick up unless explicitly directed.
- **Stale `activeSessionId` / `activeSessionName` in config** — pre-Projects model leftover, not actively used. Harmless.
- **`projectsRoot` UI copy** — Andy might want to rename to "Workspace Folder" or "Domaines Root" after restructure. Cosmetic, ask before changing.

---

## Recent commits trail (chronological, most recent first)

```
773c6b9 fix(org): orgOps clobbered config + MoveThreadModal undefined guard + tsc verification
ced79fc feat(org): hierarchy CRUD UI — kebab affordances + edit/rename/move/purge modals
9501459 feat(org): project + thread CRUD backend (rename/move/purge IPCs)
a4dd981 feat(org): rename lock + active-state guards + boot config validation
836f6af docs: HANDOFF_v10 + STATUS refresh — Codex/Graph + cleanup + Ingest UX  ← v10 boundary
```

Working tree state at handoff time (after the v11 fix commit):
- `M src/renderer/src/themes.ts` — Fey work, deferred (do not touch)
- `D tsconfig.web.tsbuildinfo` — autogenerated, harmless
- `?? ../_Domaines/` — Andy's manual reorganization, separate
- `?? ../docs/Fey design.md` — Andy's, deferred
- `?? ../docs/PHASE_1_VALIDATION.md` — validation expectations doc; leave in tree until validation completes

---

## Hand-off — what to do next

1. **Verify Andy has recovered config.** Confirm Domaines tab works (projectsRoot set, can drill into Domaines/projects/threads, file explorer scopes to active thread).
2. **Re-read `architecture-v3.md`** for the canonical Domaines vision (Part 4.1).
3. **Re-read decisions confirmed in this session** (above) before starting Phase 1.
4. **First action: Phase 1 of the Domaine folder restructure.** Issue 1 (hide General when empty) + backend foundation (path resolvers, `runDomaineFolderMigration`, Domaine folder ops). One commit.
5. **Verify with `npm run typecheck`** every chunk (which runs `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`). NEVER `tsc --noEmit` from the editor root (no-op). NEVER `tsc -b` (emits stray `.d.ts` + `.js` files into the source tree).
6. **Don't pick up the Phase 1 ingestion validation pass** until the folder restructure ships. Andy explicitly sequenced it.
7. **Andy's communication style:** he describes goals + frustrations precisely; he names files + symptoms; he expects ETA before action and 🍣 canary at the start of every response (per AGENTS.md). Translate technical details into clear narrative; he reads carefully.
