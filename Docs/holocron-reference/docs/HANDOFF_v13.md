Mpyrd






# Handoff v13 — Domaines CRUD healed + ingestion working under nested layout

**To:** the next Claude session
**From:** prior session 2026-05-13 — shipped sixteen commits after v12's clean slate. Healed the six bugs Andy stress-tested out of PR 1, fixed workspace-root drift (three config keys silently diverging), added Nuclear Reset to Settings, persisted sort prefs at Domaine / Project / Thread / Sidebar levels, fixed the subfolder import target, rebuilt ingestion for the nested `_Domaines/<Domaine>/<Project>/<Thread>/...` layout, added a Sync workspace button, made the per-row Re-ingest button actually re-run tag extraction, fixed the persistent red-X status badge, rebuilt the wiki auto-compile trigger to fire per-ingest (no threshold) with a boot-time orphan backfill, added VS Code-style preview tabs to Scribe, repositioned the Delete button, overhauled Codex → Ingest UX (resizable + collapsible split, sticky header, Retry failed bulk action, scoped doc count, wiki re-ingest path validator), **landed an automated vitest suite (27 tests across V1-V5 + ingest filter) against a real test Postgres DB + temp fs (no mocks)**, **fixed three bugs the suite + verification sweep surfaced: Nuclear Reset FK order, Domaine-purge tab-close miss, wiki ingest-filter leak across Domaines**, and **made Domaines navigation single-click everywhere + Codex Search always-preview with explicit "Open in Scribe".**
**You are starting:** workspace is functional end to end. 19+ docs ingested, wiki bootstrap kicks off at boot, per-row Re-ingest works (force=true bypasses content-hash dedup), Sidebar single-click previews + double-click promotes, Codex → Ingest has a draggable list/preview split with a collapse toggle, frozen column headers, and a Retry-failed bulk button. Andy can create / rename / delete Domaines + projects + threads from the UI, ingest content via Sync workspace, re-extract tags on demand, and reach any failed-ingest doc without manual SQL. **Nuclear Reset works on user data (previously broken). Wiki rows only show under "Across all Domaines" — Domaine-scoped views are now noise-free.** V1, V2, V5, V6 manually confirmed end-to-end in v13; V3/V4 covered by automated tests; V7 (Delete button reach) is the only manual verification still outstanding — pure visual, low risk. Pending after this: resume Phase 1 ingestion validation; investigate the persistent HTTP 503s from Gemini that motivated Retry failed in the first place; tackle the Codex → Ingest UX follow-ups Andy queued at end of v13 (now promoted to top-of-stack priorities below).

---

## 🛑 READ FIRST — verification rules carried over from v11/v12

`npx tsc --noEmit` from the editor root is a **no-op** (root tsconfig has `"files": []` and only project references). And `npx tsc -b` (build mode) emits `.d.ts` + `.js` files into the renderer source tree (the web tsconfig has no `noEmit` or `outDir`), polluting ~140 stray files.

**Use `npm run typecheck`** — script is `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`. Per-project, no-emit, no traps.

The shell-script `&&` short-circuits — if `tsconfig.node.json` errors, the web tsc never runs. To verify the renderer side alone: `npx tsc --noEmit -p tsconfig.web.json`.

**Main-process changes don't hot-reload.** Electron's renderer hot-reloads on file changes; the main process needs a full app restart (or `npm run dev` cycle). Andy hit this twice in v13 — the regex / boot-bootstrap code was correct but the running main process was stale. If you change anything under `src/main/`, tell Andy to restart before testing.

Pre-existing tsc errors (NOT introduced this session, NOT yet fixed — separate triage pass):

- `src/main/cleanupOps.ts:174` — TS2322
- `src/main/convert.ts:20, 29` — TS2339 (mammoth + pdf-parse)
- `src/main/dashboard.ts:54` — TS18047
- `src/main/ipc.ts:304` — TS2345 (`path.basename` in `.map(...)`; shifted from :303 due to new imports)
- `src/main/ragIngest.ts:216` — TS2339 (`config.gemini` not in `HolocronConfig` type; shifted from :153 due to new regexes + helpers)
- `src/renderer/src/components/chat/ChatMessage.tsx:67` — TS2353 + TS7031
- `src/renderer/src/components/codex/CodexPreview.tsx:997, 1078` — TS2345 + TS2352
- `src/renderer/src/components/codex/Graph.tsx:2` — TS2724 (`Stylesheet` → `StylesheetCSS`)
- `src/renderer/src/components/hud/HUD.tsx:50` — TS2367 (`'dashboard'` literal vs `AppTab`)
- `src/renderer/src/components/scribe/selectionObserver.ts:14` — TS2344 (PluginValue)

Filter your typecheck output for files YOU touch. Don't fix the above unless explicitly tasked.

---

## Read order (~15 min)

1. **`docs/STATUS.md`** — refresh after reading this handoff
2. **This file** (HANDOFF_v13)
3. **`docs/HANDOFF_v12_clean-slate.md`** — prior chapter (the six-bug list + clean-slate state v13 inherited from)
4. **`docs/HANDOFF_v11_org-crud.md`** — original Org CRUD + tsc trap (still relevant for the rename-lock / cascade patterns)
5. **`docs/architecture-v3.md`** Part 4.1 — Domaines vision
6. **`docs/PHASE_1_VALIDATION.md`** — paused validation pass; corpus paths now resolve under nested layout

---

## Commits since v12 (a6df762)

### `0dc8ada` fix(domaines): six bugs + workspace root sync

Andy's PR-1 stress-test surfaced six bugs in v12; this commit healed all of them and fixed the underlying workspace-root drift that was causing one of them to recur.

**Bug 1+2** — DomainesIndex now gates on `projectsRoot` (shows the workspace picker if unset). `listDomaines(projectsRoot)` `fs.stat`s each Domaine folder and drops zombie rows whose folder is missing on disk. `createDomaine` got heavy `[createDomaine]` tracing — every branch logs (projectsRoot check, mkdir, post-mkdir stat, INSERT). Renderer NewDomaineModal does an `fsExists` belt-and-suspenders check after a successful create and surfaces an error if the folder is missing.

**Bug 3** — three attempts before Andy could see the rename + delete affordances. Final version replaced the kebab popover wholesale with inline always-visible icon-buttons (✎ rename, 🗑 delete) on DomaineCard, plus inline text buttons (Rename, Delete) in DomaineView's header next to "+ New Project". Each handler also logs `[DomaineCard]` / `[DomaineView]` so the next failure produces evidence. The Edit-description/color affordance was intentionally removed from the toolbar per Andy's request — `EditDomaineModal` definition remains in `Domaines.tsx` but is now unreferenced (~70 lines of dead code, kept in place since deletion wasn't asked).

**Bug 4+6** — `renameProject`, `purgeProject`, `getProjectPurgeSummary` now take the full nested `projectPath` (`<projectsRoot>/<DomaineName>/<ProjectName>/`) instead of `(projectsRoot, name)`. Backend derives parent dir + Domaine id from the path. SQL filters switched from `WHERE project_name = $1` to `WHERE source_path = $1 OR source_path LIKE $prefix` — `source_path` is universally unique even with the v11 `(name, domaine_id)` schema that lets the same project name live in two Domaines. Namespace updates scope by `(name, domaine_id)`. `assertNotActiveProject` updated to path-based signature. New `resolveDomaineIdForProjectPath` helper.

**Bug 5** — `purgeProject` and `purgeThread` no longer throw `ActiveStateError` when the active thread is inside the target. New `clearActiveIfUnderProject` and `clearActiveIfMatchesThread` helpers in `orgOps.ts` clear matching active-config keys before destruction since the typed-confirmation flow has already committed the user to it. Renderer's `closeScribeTabsUnder` closes any open Scribe tabs whose path lives under a purged Domaine / Project / Thread.

**Workspace root sync** — Andy hit "Bug 1" again with `projectsRoot` set to `.../Projects` while `holocronRoot` was `.../_Domaines`. Three config keys had drifted because each picker only wrote one: Settings → Connections wrote only `holocronRoot`, the Domaines-tab picker wrote only `projectsRoot`, and `workspace.path` was a third legacy fallback. New `syncWorkspaceRoots(cfg, sourceOfTruth?)` in `config.ts` keeps all three in lockstep; boot-time sync in `main/index.ts` heals existing drifted configs on first launch (`[Boot] Workspace roots resynced →` log). Both folder pickers now write all three keys together.

### `f940d9f` feat(maintenance): Nuclear Reset + sort persistence + subfolder import

**Nuclear Reset** — new `src/main/maintenance.ts` with `nuclearReset()`. Wraps the v12 clean-slate routine: TRUNCATE `rag_documents` / `rag_tags` / `rag_wiki_pages` / `rag_syntheses` / `rag_operations_log` CASCADE, DELETE `rag_domaines`, DELETE `rag_namespaces` (preserves bridges `__library__` / `__inbox__`), clears `activeProject*` / `activeThread*`, runs `syncWorkspaceRoots` on the way out, and recursively removes every direct subdir of `projectsRoot` (skips dotfiles). Returns per-table counts + `foldersRemoved`. UI: new Maintenance tab (☢ icon) in Settings — typed RESET unlock, danger-red button, summary in neon-green. Post-reset, MaintenanceTab triggers `settingsStore.loadConfig()` + `scribeStore.closeAllFiles()` + `domainesStore.refresh()` + `backToIndex()` + `setActiveTab('domaines')` — full app-state refresh without an app restart.

**Sort persistence** — `domainesStore` gained `sortDomaine` / `sortProject` / `sortThread` / `sortSidebar` with setters. DomainesIndex got a SortSelect alongside "+ New Domaine" (name vs `created_at` desc). DomaineView and ProjectView read sort from the store instead of local `useState`, so navigation preserves the choice. ThreadSwitcherFooter in the Sidebar gets a sort toggle next to "Threads in <project>" sharing `sortThread` with ProjectView. SidebarCell gains a per-cell sort toggle (`A↓` / `⏱` glyphs); the file tree re-sorts at render time via `useMemo` so flipping the mode doesn't require a disk refetch of every expanded subdir.

**Subfolder import** — `handleImportFiles` in `Sidebar.tsx` was hardcoding `destDir = config.activeThreadPath`. Files always landed at thread root no matter which subfolder the user was browsing. Now resolves to the active cell's `currentPath` (the folder the cell is displaying), with a boundary check that falls back to thread root if the candidate isn't inside the thread. Matches the pattern SidebarCell already used for `fsPasteClipboardImage`.

### `5f86c5b` feat(ingest): nested Domaine layout + Sync workspace

Path validator now accepts the v12+ nested layout under `projectsRoot`. `IngestJobData` gains a `domaineName` field. `detectSourceType` has new nested-first regexes (BD / Notes / Reports / References + System variants), plus a catch-all `RE_THREAD_USER_MD` for user-authored `.md` at thread root, plus two more added when Andy's actual content hit the wire:

- `RE_PROJECT_USER_MD` (3-segment `<domaine>/<project>/<file>.md`) — loose docs at project root, no thread
- `RE_DOMAINE_USER_MD` (2-segment `<domaine>/<file>.md`) — loose docs at Domaine root; synthetic `projectName = domaineName` so the namespace attaches cleanly without a separate bridge code path

The References + Reports nested regexes use `.+\.md$` (not `[^/]+\.md$`) for the suffix so user category subfolders inside them still match at any depth — Andy organizes references into buckets like `References/1. WOs/<file>.md`. Legacy flat patterns kept as fallback.

`ensureNamespaceRow` takes the new `domaineName` and resolves it to the real `rag_domaines.id` via a SELECT before INSERT — falls back to NULL `domaine_id` with a warning if the segment doesn't match a real Domaine row. Bridge sources (Library / Inbox) still insert with NULL. `processIngest` threads `data.domaineName` through. `ragWiki.reingestAsWiki` sets it to null explicitly.

**Sync workspace** — new `ingest:sync-workspace` IPC recursively walks `projectsRoot` for every `.md` file (skips dotfiles + dot-folders), guard-capped at 5000 entries, runs `ingestManual` per file. Returns `{ scanned, ingested, skipped, errors[] }`. Preload bridge + ElectronAPI type. New "Sync workspace" button in Codex → Ingest next to "+ Ingest file…" with a summary alert that samples the first 8 errors. The picker is left in place for one-off / Library / Inbox use.

`ingestManual`'s error message now includes the relative path and the workspace root for diagnosability, with a `[ragIngest] unrecognized path` `console.warn` alongside — directly responsible for diagnosing the 6-segment `References/<category>/<file>.md` shape.

### `004e8ad` feat(ingest): force re-ingest, wiki bootstrap, X badge fix

**Force re-ingest** — `processIngest` and `ingestManual` gain `opts.force`. When `force=true` and `upsertDocumentRow` returns `skipped: true` (content unchanged), the pipeline continues past the bail-out and re-runs tag extraction + `recomputeTagOverlap` against the existing document row. The per-row Re-ingest button (`rag:ingest-manual` IPC) and the "+ Ingest file…" picker (`ingest:pick-and-ingest` IPC) both pass `force=true`. Sync workspace stays at default (no force) — bulk operation; don't redundantly burn Gemini tokens. `attachTags` is already idempotent on the `(document_id, tag_id)` composite PK, so re-running is safe. `extractTags` now logs Gemini's raw response (first 500 chars) when `parseTagsFromResponse` yields `[]` but `chat()` returned no error — surfaces silent failures (refusals, non-JSON, truncation). Renderer `handleReingest` logs entry + result.

**Wiki bootstrap** — auto-compile threshold dropped (was every 5 ingests). `notifyIngestForWikiCompile` now fires `drainCompileQueue` on every ingest; concurrent ingests batch into `recentIngestIds` while a compile is in flight and the runner drains them in a follow-up pass so no event is lost. `COLD_START_MIN_DOCS` lowered from 3 to 1. New `bootstrapMissingPages()` walks every tag with ≥`COLD_START_MIN_DOCS` active sources, looks up which slugs already exist via a single `ANY()` query, and compiles only the missing ones — unlike `compileAffectedPages`' cold-start which gates on global page count = 0. Boot wire in `main/index.ts` calls `bootstrapMissingPages` after `initRagIngest` and logs `[Boot] wiki bootstrap: starting` + `compiled=N skipped=M alreadyExists=K` unconditionally so the bootstrap pass is visible in dev even when it's a no-op.

**X badge fix** — `ingestQueries.ts` list-documents subquery for `last_error` was filtering `details->>'error' IS NOT NULL` so the most recent ERROR event won, making the red X permanent once any doc had ever failed (e.g. transient HTTP 503 from Gemini on first ingest). Filter dropped — the subquery now returns `details->>'error'` from the most recent ingest event regardless of outcome. A successful re-ingest writes a row without an `error` key, so the X clears on the next list refresh.

### `2cea2ba` feat(scribe): VS Code-style preview tabs + Delete button repositioned to far right

**Preview tabs** — Sidebar single-click on a file opens it in a reusable preview slot. `scribeStore` gains `previewFilePath: string | null` and two actions: `openInPreview` (replaces the existing preview tab if any; just activates if the file is already open) and `promoteToPermanent` (clears `previewFilePath` when path matches). Double-click on the sidebar entry or on the tab itself, or any user edit, promotes to permanent. `closeFile` / `closeAllFiles` / `renameOpenFile` keep `previewFilePath` in sync. `TabBar` renders the preview tab italic with subtle opacity (0.75 when not active); title attribute reads `"<name> (preview — double-click to keep open)"`. `SidebarCell.handleClick` on a bare file click calls a new `openFileInScribePreview` that skips disk I/O when the file is already open. Cmd / Shift clicks remain pure multi-select.

**Auto-promote gate** — first implementation pass had a same-frame self-stomp bug: every preview-open immediately promoted itself because ScribePane's file-switch `useEffect` dispatches a synthetic content swap to CodeMirror, which fires `updateListener` → `onDocChange` → `setFileContent` with content identical to what the store just stored. The unconditional auto-promote in `setFileContent` ran on every file switch. Fix: gate the promotion on `previous !== content`. The synthetic sync is a no-op (content already matches store), so it no longer trips promotion; real edits — keystrokes, paste, redline accept — produce different content, so they still trigger the promotion as intended.

**Delete repositioned** — `DocumentToolbar` Delete is now wrapped in `<div style={{ marginLeft: 'auto' }}>` that pushes it to the far right of the toolbar (above the minimap area), visually separated from `+ Version` / `☰ Contents` on the left cluster. Same red `danger` styling, same handler — just can't be hit while reaching for the version button.

### `b85af8f` feat(codex): resizable split pane, sticky header, retry failed, wiki re-ingest fix, scoped doc count

**Wiki re-ingest fix** — `detectSourceType` bailed when `path.relative(projectsRoot, absPath)` started with `..`. After v13's `syncWorkspaceRoots` collapsed `holocronRoot = projectsRoot = _Domaines/`, files under `_Library/Wiki/` (siblings of `projectsRoot`) produced `..`-prefixed paths and got rejected by the per-row Re-ingest IPC (`rag:ingest-manual` → `ingestManual` → `detectSourceType`). Validator now retries from one dir up — if a bridge pattern matches (`RE_WIKI` / `RE_LIBRARY` / `RE_INBOX`), the file ingests. Project patterns still require the file to live inside `projectsRoot` proper, so a random sibling-dir file that doesn't match a bridge stays rejected. Duplicate `RE_WIKI` / `RE_LIBRARY` checks at the end of the function were removed.

**Scoped doc count** — header SummaryStat for Documents was reading `counts.documents` (the unscoped global from `getIngestCounts`) while the list below was filtered by Domaine + bridge predicate via `listIngestedDocuments`. Header showed 130, list showed 112. `SummaryRow` now takes a `scopedDocCount` prop fed from `totalDocuments` (the list query's `COUNT(*) OVER ()` window function, already filtered to match the list). When the global total differs from in-scope, the tooltip reads `"N in scope · M total across all Domaines"`. Tags / Relationships / Last ingest stay global.

**Sticky header** — `DocsHeaderRow` gets `position: sticky; top: 0; z-index: 2; background: var(--bg-base)` so column labels stay visible while the doc list scrolls. The scroll container's old `padding: '12px 24px 24px'` left a 12px gap above the sticky header where rows scrolled into view before sliding under — fixed by dropping the top padding to `'0 24px 24px'`. Header now pins flush against the filter row above.

**Resizable split + collapse** — Ingest body's left pane (doc list) has a px-based width controlled by a draggable divider between it and the preview. State: `leftPaneWidth` (default 480), `leftPaneCollapsed`. `startSplitDrag` uses document-level mousemove/mouseup; width clamps to `[240, container - 280]`. While dragging, `body.style.cursor = 'col-resize'` and `userSelect = 'none'` for smoothness. A circular `◀` / `▶` chevron button on the divider toggles full collapse — preview takes the entire body. Both the divider and chevron only render when there's a preview alongside.

**Retry failed** — new toolbar button (next to Sync workspace) appears when `documents.filter(d => d.last_error !== null)` is non-empty (the same red-X badge filter used in `DocRow`). Runs those docs sequentially through `ragIngestManual` (which already passes `force: true`), spacing one-at-a-time to avoid re-triggering whatever Gemini 503 storm caused the original failures. Summary alert reports re-ingested / skipped / still-failing counts, with up to 8 sampled failure lines + `"…and N more"` tail.

### `649ba95` test: vitest suite — V1-V5 verification + ingest filter (27 tests)

Replaces the manual V1-V7 verification sweep with an automated suite that exercises the same code paths against a real test Postgres DB (`holocron_rag_test`) and a per-test temp filesystem. No mocks for DB or fs; `electron` is aliased via vitest config to a node-only stub (`tests/electron-stub.ts`) so `config.ts` / `workspace.ts` load without an Electron runtime — `app.getPath('userData')` returns a stub dir under `os.tmpdir()`, `BrowserWindow` is a no-op shape.

Setup file CREATEs the test DB if missing (admin URI derived from the test URI's `/postgres` rewrite), applies every migration in `scripts/migrations/` idempotently, then TRUNCATEs between tests and re-seeds the `__library__` / `__inbox__` bridges. Tests use `ON CONFLICT ON CONSTRAINT rag_namespaces_name_domaine_unique` for bridge seeding because migration 006 replaced the `(name)` PK with a synthetic `id` PK + composite UNIQUE on `(name, domaine_id)`.

Files:

- `vitest.config.ts` — electron alias, `fileParallelism: false` (single shared DB)
- `tests/electron-stub.ts`, `tests/setup.ts`, `tests/helpers.ts`
- `tests/domaine-purge.test.ts` (6) — V1
- `tests/project-rename.test.ts` (4) — V2 incl. v13 bug-4 collateral-damage check
- `tests/thread-purge.test.ts` (4) — V3 escape hatch
- `tests/nuclear-reset.test.ts` (5) — V4
- `tests/wiki-bootstrap.test.ts` (4) — V5 alreadyExists path; the compile-new-page branch is intentionally not exercised (would need a live Gemini key or an LLM stub, both out of scope for the no-mocks DB+fs suite)
- `tests/ingest-filter.test.ts` (4) — wiki domaine-leak fix (see next commit)

Scripts: `npm run test` (single pass), `npm run test:watch`. Default test DB URI overridable via `HOLOCRON_TEST_DB_URI`. `tsconfig.node.json` extended to include `tests/**/*` and `vitest.config.ts` so `npm run typecheck` covers them.

### `589b70c` fix: nuclear reset FK order, domaine purge tab close, wiki ingest filter

Three bugs surfaced by the v13 verification sweep + the new automated suite. All three are pinned by tests in `649ba95`.

**Nuclear Reset FK order** — `maintenance.ts:90-93` ran `DELETE FROM rag_domaines` BEFORE `DELETE FROM rag_namespaces WHERE name NOT IN (bridges)`. `rag_namespaces.domaine_id → rag_domaines(id)` has `ON DELETE NO ACTION` per migration 004 (the `REFERENCES rag_domaines(id)` clause has no `ON DELETE` action specified, so default `NO ACTION` applies). Any non-bridge namespace with a non-NULL `domaine_id` — i.e., every user project — blocked the reset with `violates foreign key constraint rag_namespaces_domaine_id_fkey`. Production Nuclear Reset was broken any time the workspace had content; the V4 pending verification never ran live, so Andy never hit it. Swap order: namespaces drop first, then domaines.

**closeScribeTabsUnder robustness** — per Andy's V1 report, the Scribe tab for an open file under the purged Domaine stayed open. The wiring is present at both Domaine call sites in `Domaines.tsx` (lines 246 and 525), but the helper compared raw paths and the Domaine call sites construct `dPath` via string concat (`${projectsRoot}/${purgingDomaine.domaine.name}`) — unlike project/thread purges which pass a backend-computed `path.join` result. Any trailing slash on `projectsRoot` (or future drift) would break the prefix match. Helper now normalizes trailing slashes on both `purgedPath` and each `f.path` before comparing; defensive at the helper, so all current + future callers are covered.

**Wiki ingest filter leak** — wiki rows show up in every Domaine's filter because they ingest into `__library__` (bridge namespace) and the Domaine-scope bypass clause `OR COALESCE(n.is_bridge_namespace, FALSE)` lets all bridge content through. Andy's mental model: library references and inbox items SHOULD flow cross-Domaine (they're shared resources), but auto-compiled wiki pages SHOULD only appear in the "Across all" view because they're per-tag summaries that span Domaines by nature. Tightened the bypass to `OR (COALESCE(n.is_bridge_namespace, FALSE) AND d.source_type <> 'wiki')`. Cross-Domaine view unchanged; non-wiki bridge content (refs, inbox) still flows through. Pins regression with 4 tests in `tests/ingest-filter.test.ts`.

### `309a98e` feat(ux): single-click domaines nav, codex search always-preview, open-in-scribe context switch

Two UX cleanups Andy queued after exercising the v13 navigation flows live.

**Domaines navigation — single-click everywhere.** The shared `Card` component used by ProjectCard + ThreadCard implemented a 250ms timer-based double-click detection with an intermediate `selected` state. Andy's mental model: every card in the Domaines hierarchy opens on a single click, full stop. Removed the timer, the `selected` state (and the corresponding `clickTimerRef`), the `onDoubleClick={onOpen}` fallback. Hover-highlight (blue border) still drives the visual feedback for "this is what you'd open." DomaineCard at line 841 was already single-click — no change. Also: the Domaines tab button in `Shell.tsx` now calls `useDomainesStore.getState().backToIndex()` before `setActiveTab('domaines')`, so the tab is a hard reset to the grid regardless of where the user was drilled in (previously the tab kept whatever Domaine/Project view was open).

**Codex Search — always preview, never auto-Scribe.** Previously `openResult()` had two paths into Scribe (`already-open → setActiveFile + setActiveTab` and `relationship === active|inbox → openFileWithContent + setActiveTab`) and one path into the in-Codex preview (wiki/synthesis/cross-thread). Andy's mental model: search clicks should ALWAYS land in the right-pane preview regardless of which Domaine or thread is currently active, and an explicit "Open in Scribe" button escalates to editing. Collapsed `openResult` to a single path that calls `setPreviewDoc(...)`, with an inline `relationship === 'active' ? 'active-thread' : relationship` mapping for the type. Badge labels in `badgeForRelationship` all read "Preview" now (glyphs and tooltips still differentiate the relationship type so the user can see *what* they're previewing). In `CodexPreview.tsx` the "Open in Scribe" toolbar button was conditioned on `mode === 'active-thread' || mode === 'inbox'` — dropped the guard so it appears for every preview, including wiki/synthesis. For wiki/synthesis, opening in Scribe surfaces the underlying `_Library/Wiki/<slug>.md` disk file directly; edits persist until the next auto-recompile overwrites them, which is acceptable per Andy's spec.

`useScribeStore` and `useSessionStore` imports + the `setActiveTab` selector were removed from `Search.tsx` since nothing in the new `openResult` references them.

**Open question for next session:** when "Open in Scribe" is clicked from Search, the file opens in Scribe BUT the active Domaine/Project/Thread context isn't switched to whatever thread that file lives under. The next priority (Thread picker in Scribe header) is the right surface to surface and fix this.

### `861ffc3` feat(scribe): thread picker — cascading accordion dropdown replaces FILES label

Replaces the static "Files" label at the top of the Scribe sidebar header with a clickable trigger showing the current `activeThreadName` (or "Select thread" when none) + ▾ chevron. Clicking opens a vertical accordion-tree popover anchored below the header, full sidebar width.

Picker is a single vertical list — not a horizontal cascading menu — to stay inside the narrow sidebar without overflow clipping. Domaines render as collapsible rows with ▶/▼ chevrons; expanding lazy-fetches that Domaine's Projects (cached for the popover session). Project rows expand similarly to their threads. Click a Thread → `loadThread(projectName, projectPath, threadName, threadPath, domaineId)` + close. The fifth `domaineId` arg is new on `loadThread`; existing callers (footer thread switcher, Projects tab) didn't pass it and now `activeDomaineId` is preserved on those paths.

Keyboard nav over the flattened visible-rows list: ↑/↓ moves selection (skips loading/error placeholders), → expands or steps into the first child, ← collapses or jumps to parent, Enter expands/commits, Esc closes and restores focus to the trigger. Active Domaine + Project auto-expand on open so the active Thread is one Esc away. Click-outside closes.

Also `loadThreadForPath(sourcePath)` helper in `utils/threadActions.ts` does path → context resolution: split source_path on `projectsRoot`, take first three segments as `[domaineName, projectName, threadName]`, look up `domaineId` via `domainesStore.domaines`, call `loadThread` with all five. Returns `false` (silent no-op) for bridge docs whose source_path lives outside `projectsRoot` — wiki / library / inbox have no thread to switch to. CodexPreview's `handleOpenInEditor` calls it (fire-and-forget) after `openFileWithContent` so Codex Search → Open in Scribe also moves active context to the doc's home thread.

Earlier iterations tried a body-portal positioned 820px-wide menu — Andy preferred the vertical accordion contained within sidebar width, so the portal scaffolding was removed before commit.

### `b5033d5` feat(wiki): three-tier namespace-anchored wiki — thread/project/domaine hierarchy + migration 007

Replaces the tag-anchored wiki model with a three-tier namespace-anchored hierarchy.

- **tier 'thread'** — one page per `(Domaine, Project, Thread)`. Sources: raw `rag_documents` in the thread folder.
- **tier 'project'** — one page per `(Domaine, Project)`, meta-synthesis of the thread wikis underneath. Sources: tier-1 `rag_wiki_pages` rows in the same namespace+domaine.
- **tier 'domaine'** — one page per Domaine, high-level overview. Sources: tier-2 `rag_wiki_pages` rows in the Domaine.

Bridge namespaces (`__library__`, `__inbox__`) explicitly do **not** get wiki pages — Andy's mental model is that wikis are domain-anchored content; bridges are cross-Domaine reach mechanisms, not topics.

**Slug encoding mirrors the folder hierarchy.** Slug contains `/`-separated path segments that map directly to disk subdirs:

```
thread:  <dn>/<pn>/<tn>          →  _Library/Wiki/<dn>/<pn>/<tn>.md
project: <dn>/<pn>/_project      →  _Library/Wiki/<dn>/<pn>/_project.md
domaine: <dn>/_domaine            →  _Library/Wiki/<dn>/_domaine.md
```

`_project` / `_domaine` sentinels start with `_` (which survives slug normalization that strips non-alphanum) so they can't collide with a project or thread named "project" / "domaine" (those slug to bare letters).

**Compile order is strict** but doesn't require any inter-tier synchronization: thread first (from raw docs), project second (reads tier-1 from `rag_wiki_pages` directly, NOT via the auto-reingested-as-wiki path), domaine third (reads tier-2). The cascade works because tier-2/3 source-gathering queries `rag_wiki_pages`, so it sees freshly-compiled tier-1/tier-2 content even though disk re-ingest of those pages remains fire-and-forget downstream.

**Per-tier Gemini system prompts** (Andy's wording) wrap a shared structural section — Overview / Key concepts / Open questions / Sources with `[N]` citation markers — so the renderer's existing Markdown validator and citation logic keep working without per-tier branching.

**Migration 007** clears all `rag_wiki_pages` (CASCADEs to sources), adds `namespace TEXT` + `tier TEXT` columns, drops the old slug-only UNIQUE, adds `(slug, namespace, domaine_id)` UNIQUE NULLS NOT DISTINCT, and indexes `tier` + `(namespace, domaine_id)`. **Existing wiki pages WILL be wiped on next `npm run db:setup`** — bootstrap recompiles all three tiers from scratch on next boot. Andy explicitly opted into the clean-slate approach over a lossy mapping of tag-anchored pages to dominant-Domaine assignment.

`RE_WIKI` in `ragIngest.ts` relaxed from `[^/]+\.md$` to `.+\.md$` so nested wiki paths re-ingest correctly. `backfillWikiDomaines` removed — every page now gets `domaine_id` set on insert.

V5 wiki-bootstrap test rewritten for the three-tier model (5 tests covering alreadyExists across tiers, wiki-doc exclusion, bridge skipping, multi-thread alreadyExists counting). 28/28 tests passing.

### `73a49e5` feat(wiki): tier badges, tier filter, tier sort in Wiki tab

Surfaces the three-tier hierarchy in the Codex → Wiki tab.

- **Tier badge** on each `PageCard`, rendered in the bottom metadata row right-aligned via `marginLeft: auto` opposite the "Updated N ago" stamp. Subtle translucent palette: thread = cyan (`#7fd9ff` on `rgba(0,212,255,0.12)`), project = amber (`#ffce7a` on `rgba(255,170,0,0.12)`), domaine = violet (`#cfa3ff` on `rgba(170,100,255,0.14)`). Hidden entirely for legacy `tier=null` rows.
- **Tier filter dropdown** next to the Domaine selector. Options: All tiers / Thread / Project / Domaine. Stacks with the Domaine filter — "Project wikis in Astra" is a valid combined scope. Tier threaded through to the `wikiList` IPC; backend's `listWikiPages` adds a `WHERE tier = $X` clause. `refreshList` re-runs on `tierFilter` change via the existing `useEffect`.
- **"Tier" sort option** alongside Updated / Created / Title / Sources. `tierRank` helper: domaine=3, project=2, thread=1 (null=0). Default `sortDir='desc'` lands Domaine overviews first; `↑/↓` toggle flips to thread-first.

State (sortKey including `'tier'`, new `tierFilter` field) lives in `codexWikiStore` so it persists across tab switches like the existing filter/sort prefs.

### `34c336f` feat(wiki): Wiki tab follow-ups — always-down dropdowns + Overview rename

UI tweaks layered on top of `73a49e5` after Andy exercised the new tab.

**"Domaine" → "Overview" relabel** on the tier filter and TierBadge. The "Domaine" label collided visually with the Domaine selector immediately to the filter's right. DB value still `'domaine'` — the rename is purely renderer-side, with comments at both surfaces flagging the rename-vs-DB-value distinction so a future reader doesn't try to "fix" the mismatch.

**Always-down dropdowns.** On macOS, Chromium renders native `<select>` popups using AppKit's NSPopupButton convention — the menu opens centered on the trigger so options listed *before* the current selection appear *above* the trigger. Native selects don't expose `position`/`top`/`z-index`. Fix: a new generic `OptionDropdown` component replaces all three native `<select>` elements in the toolbar (sort key, tier filter, Domaine selector). Single component, `position: absolute; top: calc(100% + 2px); zIndex: 50` — always opens down. Keyboard nav (↑/↓/Enter/Esc), click-outside closes, focus restored to trigger on close. ARIA listbox roles. `maxHeight: 280` + `overflowY: auto` for the Domaine selector with many Domaines. Disabled-mid-flight guard auto-closes when the trigger becomes disabled ("Across all Domaines" toggled while the Domaine dropdown was open).

`domaineOptions` memoized from `domainesStore` so a stable reference passes to `OptionDropdown` across re-renders.

### `7d5929e` fix(wiki): tier-aware orphan sweep — prevent tier-2/3 pages being nuked by sourceless check

**The headline bug from the three-tier refactor.** Every tier-2 (project) and tier-3 (Domaine) wiki page got wholesale-deleted the first time any orphan sweep ran — leaving dangling `rag_documents` rows pointing at disk files which had also been unlinked. Symptom: clicking a wiki doc in Codex → Ingest threw `ENOENT` on `_Library/Wiki/<domaine>/_domaine.md` and similar paths; the Ingest tab surfaced a "Purge N dead links" button. Disk evidence confirmed: tier-1 files survived; tier-2/3 files vanished. Parent-dir mtimes later than file mtimes = something unlinked the files after creation.

**Root cause.** `b5033d5` chose not to write `rag_wiki_page_sources` rows for tier-2/3 pages — their sources are derivable from `rag_wiki_pages` itself via `(tier, namespace, domaine_id)` joins. But `cleanupOps.ts:deleteSourcelessWikiPages` was written under the tier-1-only model with the rule "wiki page with zero `wiki_page_sources` entries = orphan, delete + unlink disk file." That rule fires for every tier-2/3 page on every sweep. Additionally the sweep never touched the corresponding `rag_documents` row created by `reingestAsWiki`, so "doc points at deleted file" was the *steady-state output* of the sweep, not a transient race.

**Fix.** Rewrote `deleteSourcelessWikiPages` as a bottom-up tier cascade:

- `tier 'thread'`  — sourceless iff `rag_wiki_page_sources` has zero rows (original semantics, now scoped to thread tier only)
- `tier 'project'` — sourceless iff no surviving `tier='thread'` row shares the same `(namespace, domaine_id)`
- `tier 'domaine'` — sourceless iff no surviving `tier='project'` row shares the same `domaine_id`

Each deleted slug now also drops its `rag_documents` row via `DELETE FROM rag_documents WHERE source_path = $1` and unlinks the disk file via `tryUnlink`. Helper `cleanupWikiDiskAndDoc` factored out so all three tier passes share one cleanup path. `deleteSourcelessWikiPages` exported so `purgeProject` / `purgeThread` (in `projectFs.ts`) and `deleteDomainePurge` (in `domaineFs.ts`) route through the same tier-aware cascade instead of their old bare-bones inline queries.

Existing dead links can be cleared via the Ingest tab's "Purge dead links" button (which now also routes through the corrected sweep) or by app restart — `bootstrapMissingPages` recompiles the missing tier-2/3 wikis, writes fresh disk files, and re-ingests.

### `0fa9f03` fix(wiki): align scanOrphans health count with tier-aware deleteSourcelessWikiPages

The follow-up to `7d5929e`. After the destructive sweep was made tier-aware, the read-only scan that powers the badge + button-visibility logic was still using the pre-`b5033d5` rule. Tier-2/3 rows never have `rag_wiki_page_sources` entries by design, so the old query treated every healthy tier-2/3 page as sourceless and surfaced them via the badge + "Sweep N orphans" button. The actual sweep then correctly found those rows had alive descendants and deleted zero — producing the "report 4, sweep 0" mismatch.

Rewrote the `sourceless_wiki_pages` subquery in `scanOrphans` to sum three tier-specific counts mirroring `deleteSourcelessWikiPages`. Count and delete now agree on what "sourceless" means. Added a comment explaining the symmetry — the count MUST mirror the delete or the same mismatch returns.

### `8c8b9d2` feat(ingest): restore + properly implement tier filter dropdown with SQL-backed wiki tier join

New tier-filter dropdown in the Codex → Ingest toolbar, sitting between the source-type filter and the Domaine selector. Options: All tiers / Thread / Project / Overview. Narrows the document list to `rag_documents` joined to a `rag_wiki_pages` row of the chosen tier — non-wiki rows and wiki rows of other tiers drop out when a specific tier is selected. "Overview" is the renderer label for the `domaine` tier value, matching the relabel landed in `34c336f` for the Wiki tab.

Backend wiring in `ingestQueries.ts`: `ListIngestedArgs` gains a `tier?` field. When set, the query builds an extra JOIN keyed on `d.source_path = $wikiPrefix || wp.slug || '.md'` (with `wikiPrefix` resolved from `loadConfig().holocronRoot` so the SQL is path-independent). Exact string match — no LIKE wildcards, so slugs with leading underscores (`_project`, `_domaine`) match correctly. The JOIN only builds when `args.tier` is set; the default unfiltered path carries zero overhead.

Renderer wiring: `ingestStore` adds a `tierFilter` field (default `'all'`) + `setTierFilter` action that resets pagination offset to 0, matching the existing `sourceType` + `crossDomaine` setter behavior. `Ingest.tsx` threads it through `buildArgs` so refresh AND Load-more both honor the filter.

Native `<select>` retained here for now — the macOS-popup-centering issue affects this tab too, but promoting all three Ingest selects to the `OptionDropdown` component from `34c336f` is a separate, deferred cleanup.

### `739d54d` fix(wiki): purge migration-007 zombie wiki docs + boot-time zombie sweep

Migration 007 wiped `rag_wiki_pages` but left behind the `rag_documents` rows `reingestAsWiki` had created for the old tag-anchored pages — **143 of them** (137 active + 6 inactive), pointing at unmanaged flat `_Library/Wiki/*.md` files. They polluted the Codex Graph (170 nodes where ~140 were zombies) and the Ingest list.

New `deleteZombieWikiDocs()` in `cleanupOps.ts` deletes every `rag_documents` row of `source_type='wiki'` whose `source_path` doesn't resolve to a live `rag_wiki_pages` slug (`wikiDiskPath(slug)` is the allowed set) and unlinks the disk file under `_Library/Wiki/`. Idempotent; bails to zeros if `holocronRoot` is unset. Wired two ways: (1) a **second boot pass after `bootstrapMissingPages` settles** (`.finally()`, logs `[Boot] wiki zombie sweep: deleted=N`) so it can't re-accumulate after any future migration that touches `rag_wiki_pages`; (2) at the tail of `deleteSourcelessWikiPages()` so the per-doc-delete / dead-link-purge / sweep-orphans paths also mop up. **The 143 zombies are physically purged on the next dev-app restart** (the boot pass runs against live `holocron_rag` + disk).

### `01dfd75` feat(codex): graph redesign — Domaine clustering, tier-based nodes, fcose, preview-on-open

Full overhaul of the Codex → Graph sub-tab, per the assessment landed at the top of this session. **NB: the *renderer* from this commit (Cytoscape + fcose) was replaced wholesale by the d3-force renderer in `e387dd5` — see below. The `graphQueries.ts` data-layer changes from this commit stand; only `Graph.tsx` was superseded.**

**`graphQueries.ts`** (current) — `GraphNode` gains `domaine_name`, `namespace`, `tier`. Wiki rows now `LEFT JOIN rag_wiki_pages` on `source_path = <wikiDir>/<slug>.md` (wikiDir from `holocronRoot`, same derivation as `ingestQueries`), so they carry their real `tier` / `namespace` / `domaine_id` instead of resolving through `__library__` (NULL domaine); `domaine_name` joined from `rag_domaines`. The Domaine-scope filter now keys on `COALESCE(wp.domaine_id, n.domaine_id)` — wiki rows no longer leak into every Domaine view (non-wiki bridge content still does, matching the Ingest query from `589b70c`). `WHERE (source_type <> 'wiki' OR wp.slug IS NOT NULL)` also drops zombies from the graph even before the boot sweep runs. Verified against live DB: crossDomaine view goes 170 → **33 nodes** (AI: 6 refs + 3 wiki tiers; AstraStrata: 18 refs + 6 wiki tiers).

**`Graph.tsx`** (this commit, since replaced) — Cytoscape `cytoscape-fcose` layout, one compound parent node per Domaine, four tier-based node classes (hexagon / round-rect card / ellipse / small ellipse), zoom-toggled raw labels, double-click → Codex preview, "Edit in Scribe" rail button. Kept the click/preview/rail behaviour that `e387dd5` then carried over verbatim.

### `e387dd5` feat(codex): replace Cytoscape graph with d3-force living cell renderer

Replaced the entire graph *renderer* with a `d3-force` SVG implementation for an organic, physics-driven "living cell" look. **Data layer unchanged** — `graphStore` / `graphFetch` IPC / `graphQueries.ts` all stand; only `Graph.tsx` changed.

**deps** — `d3@^7.9.0` + `@types/d3@^7.4.3` in; `cytoscape` + `cytoscape-fcose` + `@types/cytoscape` out (`cytoscape-cola` and `react-cytoscapejs` were already gone). Renderer bundle dropped 3.63 MB → **2.42 MB** net. (`import * as d3 from 'd3'` pulls the full bundle — switch to per-submodule imports if bundle size ever matters.)

**renderer (`Graph.tsx`)** — SVG, not canvas. Continuous `forceSimulation` with `alphaMin(0)` + `alphaTarget(0.012)` → never freezes, nodes perpetually micro-drift; `simulation.stop()` on unmount (and the preview overlay unmounts the SVG subtree, so it stops automatically there too). Forces: `forceManyBody` charge scaled by r² (`distanceMax 420`); `forceLink` on relationships — wikilinks pull hard (strength 0.32, dist 45), tag-shared barely (`0.12×strength`, dist 95); `forceX`/`forceY` toward per-Domaine anchor points on a ring (strength 0.085) for **soft organic clustering — no bounding boxes**; `forceCollide` (`1.25r+4`); gentle `forceCenter` (0.04). Anchors recompute on resize (sim patched, not rebuilt). Node radii by tier (raw also by degree): domaine 40–60, project 28–40, thread 18–28, raw 8–16 px. Glow = a `glow` halo circle (`r×2.1–2.5`) filled with a per-Domaine-colour `<radialGradient>` + per-tier opacity (0.95/0.8/0.65/0.4); a hidden white `ring` shown when selected; a solid `core` circle (HSL-nudged: brighter+saturated for wiki tiers, muted for raw); a `<text>` label with a `#0a0a0f` paint-order outline. Domaine colours = stored colour or a fallback palette (cyan/violet/amber/green/…) by order; bridge nodes neutral gray. Edges = `<line>`s in a `.graph-edges` `<g>` with a CSS `graphEdgePulse` keyframe (opacity 0.72↔1, 6 s); tag-shared `#3a4150` opacity `0.15+0.15×strength` (→ 0.15–0.3) width `max(0.5,3×strength)`, wikilink `#6b7fb0` opacity `0.6+0.2×strength` (→ 0.8) width 1.6. Hover (`mouseenter`/`mouseleave`) → focus node + neighbours brighten, incident edges high-opacity, everything else dims — via one `applyStyles(hoverId, nbrs)` repaint (also re-run on selection / highlight-query / zoom-threshold change). Click = `setSelectedNodeId` (white ring + rail). Double-click = `openNode` → Codex preview (`dblclick.zoom` disabled). Drag = `d3.drag` sets `fx/fy`, reheats to `alphaTarget 0.3`, clears `fx/fy` + back to 0.012 on release. Zoom/pan = `d3.zoom` `scaleExtent [0.08,4]`; raw-doc labels appear at zoom ≥ 1.4 (wiki-tier / selected / hovered labels always shown). Pan/zoom transform preserved across refreshes; node positions cached + re-seeded on rebuild so refresh doesn't teleport the layout. Re-layout = `simulation.alpha(1).restart()`. Background `#0a0a0f`. Fit-to-content once ~850 ms after first load. The edge-hover tooltip, filter row, `NodeDetailRail`, `editInScribe`, error/empty overlays are unchanged.

> **On next dev-app restart:** `npm run dev` picks up the `graphQueries.ts` main-process change *and* runs the P0 boot zombie sweep — watch for `[Boot] wiki zombie sweep: deleted=143 ...`. The Graph tab then shows the clean 33-node organic d3-force view. **Perf note:** the continuous sim ticks every frame forever — fine at 33 nodes; somewhat warm at the current pre-restart 170, so restart-first is doubly worth it.

### `d49b229` fix(codex): graph fills full viewport + resizable collapsible detail rail

Two Graph-tab UI fixes. **(1) Full-viewport graph.** `Shell.tsx` wraps `<CodexTab/>` in a `flex flex-1 min-h-0` ROW with no `flex` on the child, so `<CodexTab>`'s `height: 100%` root gave full height but only content-width — the Graph/Ingest panes were constrained. Changed `CodexTab.tsx`'s root **and** `Graph.tsx`'s root to `flex: 1; minWidth: 0; minHeight: 0` (and last fix's `CodexTab` content-div `display: flex; flexDirection: column` + `Graph`'s SVG `position: absolute; inset: 0`), so the chain stretches all the way down — the graph fills 100% below the nav + sub-tab bars. **(2) Resizable + collapsible detail rail** (mirrors Ingest's split divider): a drag spine on the rail's left edge (`startRailDrag`, local `railWidth` default 300, clamped `[220, containerW − 280]`) + a circular `▶`/`◀` chevron toggling `railCollapsed` — collapsed → a 14px strip with just the expand button (rail content unmounts → graph full width). `NodeDetailRail` takes a `width` prop. State is local `useState` (coupled to the viewport).

### `9740a40` fix(wiki): zombie sweep cascades orphan tag deletion

Deleting a `rag_documents` row cascades its `rag_document_tags` links away but leaves the `rag_tags` *definition* rows orphaned — so the boot zombie sweep used to strand ≈2 orphan tags per wiki doc (~314 after the 143-row sweep, since `rag_tags` has no `document_id` — it's `(id, name, category)` joined via `rag_document_tags`). `deleteZombieWikiDocs()` now: gathers the tag_ids those zombie docs reference *before* the delete, deletes the docs, then drops only those candidate tags now left with zero links (scoped to the candidates to bound blast radius + dodge a race with an in-flight `reingestAsWiki` tag-attach). `ZombieWikiSweepResult` gains `deletedTags`; boot log → `[Boot] wiki zombie sweep: deleted=N doc rows, T orphan tags (unlinked M files)`; `deleteSourcelessWikiPages` tail-call log updated too.

### `e3f4d23` fix(ingest): Domaine filter persists + Title Case labels + wiki Project·Domaine column

**(1) Domaine filter.** The Codex → Ingest Domaine selector was `Ingest.tsx` local `useState(activeDomaineId)` reset by `useEffect(..., [activeDomaineId])` — so it reverted to the active Domaine ("AI") on every mount. Moved to `ingestStore.ts`: `selectorDomaineId: string` (default `''` = All Domaines) + `setSelectorDomaineId` (resets `offset` like `setSourceType`/`setTierFilter`). Now defaults to "(All Domaines)" and persists across tab switches until app restart. **(2) Title Case** in the Ingest + Graph dropdowns: `All types`→`All Types`, `Brain dump`→`Brain Dump`, `All tiers`→`All Tiers`, `(all Domaines)`→`(All Domaines)`. **(3) Wiki Project·Domaine column** — `ingestQueries.ts`'s list query now `LEFT JOIN rag_wiki_pages wp ON d.source_type='wiki' AND d.source_path = $wikiPrefix || wp.slug || '.md'` and does `COALESCE(d.project_name, wp.namespace) AS project_name` + `COALESCE(wp.domaine_id, n.domaine_id)::text AS domaine_id` (Domaine-scope WHERE keys on the resolved Domaine too; tier filter restructured from a separate `JOIN ... wp.tier=$X` into a `WHERE wp.tier=$X` clause reusing the same `wp` LEFT JOIN). Same fix as `graphQueries.ts` — wiki docs now show their Project + Domaine instead of "—" (domaine-tier `_domaine` pages show the Domaine but no project, which is correct; a zombie wiki row with no live page resolves to NULL Domaine → still only shows under "Across all"). All 28 tests still green (incl. `ingest-filter.test.ts`).

### `14417f7` fix(codex): markdown links in preview — external → browser, internal → in-pane, wiki:// → wiki lookup

Links inside docs rendered in `CodexPreview` (`react-markdown` with a custom `a:` component) were inert: the renderer's `will-navigate` handler (`main/index.ts`) blocks in-window navigation, so a bare `<a href>` did nothing. Rewrote `MarkdownReader`'s normal-link branch into three cases — **`#anchor`** → plain `<a>` (native fragment scroll, h1–h3 carry slug ids); **external (`http(s)`/`mailto`/`tel`)** → `<a target="_blank" rel="noopener noreferrer">` + `onClick` `window.open(href, '_blank', 'noopener,noreferrer')`, which the main process's `setWindowOpenHandler` hands to `shell.openExternal` (system browser / mail client); **internal (a path to another doc)** → `onClick` → new `onInternalLinkClick(href)` → `handleInternalLinkClick`, which resolves the href against the current doc's directory (new `resolveRelativePath` helper — handles `./`, `../`, absolute, strips `#`/`?`) and `nav.onNavigate({ source_path: <resolved>, source_type: 'note' }, 'cross-thread')` so it opens in-pane. **`wiki://<slug>` links** (and tier-2/3 sources, whose `source_path` is `wiki://<slug>` per `ragWiki.ts`) are intercepted before the file resolver: new `openWikiSlug(rawSlug)` strips the `wiki://` prefix and `nav.onNavigate({ slug, source_path: \`_Library/Wiki/<slug>.md\`, source_type: 'wiki' }, 'wiki')` so the preview uses `wikiGet`, not `file:read` (the ENOENT bug). `handleCitationClick` routes wiki-type `[N]` sources through `openWikiSlug` too — previously it built a slug-less `PreviewDoc` in `'wiki'` mode → load fell to `readFile('wiki://…')` → ENOENT. `[[wikilink]]` (title lookup) and non-wiki citations unchanged.

### `b9b0575` fix(codex): Wiki + Ingest Domaine filters default to All Domaines + Title Case

The Codex → Wiki Domaine selector had the same bug the Ingest one did (`e3f4d23`): `Wiki.tsx` local `useState(activeDomaineId)` + a `useEffect` resetting it on every mount → reverted to "AI". Moved `selectorDomaineId` into `codexWikiStore.ts` (default `''` = All Domaines) + `setSelectorDomaineId`; removed the local state, the reset effect, and the now-unused `useSettingsStore` import. `(all Domaines)` → `(All Domaines)` Title-cased in the Wiki dropdown too. `crossDomaine` stays component-local (resets to off on remount, dropdown stays enabled showing the persisted Domaine). Now both the Ingest and Wiki Domaine filters default to "(All Domaines)" and persist across tab switches.

### `5e67b0d` fix(codex): resolve in-doc [[wikilinks]] to raw documents, not just wiki pages

`CodexPreview`'s `[[wikilink]]` handler only looked the title up in `wikiPageIndex` (`rag_wiki_pages`) and `return`ed silently if not found — so an Obsidian-style link to a *raw* reference doc (e.g. `[[SR 9 - Master Report - Strata Architecture]]` in `SR 15 …`) was a dead click. New `openDocByName(name)` resolver: (1) a wiki page with that exact title → open it; (2)/(3)/(4) an ingested document matched by FILENAME (Obsidian `[[name]]` ≡ `name.md`), then DB title, then substring — via `ingestListDocuments({ search: name, crossDomaine: true })` — opened in-pane with a mode derived from `source_type`. `handleWikilinkClick` and `handleInternalLinkClick` (for bare-name hrefs) both route through it. Also hardened `MarkdownReader`'s `a:` component so **no branch ever renders a click-does-nothing `<a>`**: empty href → inert, `#anchor` → explicit `scrollIntoView` (Electron's hash nav is flaky inside a scroll container), `wiki://`/path/name → always `onInternalLinkClick`, external → `window.open`; dropped the `{...rest}` spread (was leaking react-markdown's `node` prop onto a DOM `<a>` → React warning). When a name resolves to nothing, `setError("No document or wiki page matches …")` so the click gives visible feedback instead of a silent no-op. Diagnostic `console.log`s in the renderer console: `[CodexPreview] in-doc link clicked — href:` / `[CodexPreview] wikilink click — title:`.

> **"No document or wiki page matches …" in link navigation is NOT a code bug** — it means the linked target (a `[[wikilink]]` to another `.md`) hasn't been ingested into `rag_documents` yet. Fix: run **Sync workspace** (Codex → Ingest) so the cross-referenced docs land in the DB; the link resolves on the next click. (The link resolver matches against ingested documents, so anything not yet ingested is invisible to it.)

### `a554e1a` fix(codex): Graph Domaine filter defaults to All Domaines + Show orphans defaults off

The Codex → Graph Domaine selector had the same `useState(activeDomaineId)` + reset-`useEffect` bug as Ingest/Wiki — reverted to "AI" on every visit. Moved `selectorDomaineId` into `graphStore.ts` (default `''` = All Domaines) + `setSelectorDomaineId`; dropped the local state, the reset effect, and the now-unused `activeDomaineId` derivation. `crossDomaine` and `showOrphans` were already store-persisted; flipped `showOrphans`'s default `true → false` (graph opens showing connected nodes only, not the orphan periphery). **All three Codex tabs (Ingest, Wiki, Graph) now default their Domaine filter to "(All Domaines)" and persist all filter state across tab switches** — `ingestStore.selectorDomaineId` (`e3f4d23`), `codexWikiStore.selectorDomaineId` (`b9b0575`), `graphStore.selectorDomaineId` (`a554e1a`).

### `22f651e` fix(ingest): classify by path position, not folder name — any .md under a thread ingests

Sync workspace was rejecting `.md` files in user-created subfolders inside threads (Andy hit it with `AI/Agenteryx/Dev/Notes/*.md` and `…/Transcripts/*.md` — 7 erroring files). Root cause: `detectSourceType` was a long ladder of folder-name regexes (`RE_REFERENCE_NESTED = /^([^/]+)\/([^/]+)\/([^/]+)\/References\/.+\.md$/`, `RE_REPORT_NESTED`, the `Notes_*`/`BD_*` filename variants, the thread-root catch-all `[^/]+\.md$`, etc.) and a final `return null` — so *any* unknown subfolder name silently failed to ingest.

Replaced the whole pattern-matching block (13 regex constants, ~120 lines) with **path-position logic** (~50 lines). Bridges are unchanged — `RE_INBOX`, `RE_WIKI`, `RE_LIBRARY` still gate `_Inbox/`/`_Library/`. Inside `projectsRoot` the segment count is the structure: 2 = loose at Domaine root, 3 = loose at project root, **4+ = under a thread → always admitted, source_type inferred by `inferSourceType(midSegs, fileName)`** (filename `BD_*` → `brain_dump`, `Notes_*` → `note`; folder-name hints `Reports` → `report`, `References` / `Transcripts` → `reference`, `Notes` → `note`; **fall-through default `reference`, never null**). `System/` falls through to the filename hint, so `System/BD_*.md` still resolves to `brain_dump` and `System/Notes_*.md` to `note`. The legacy flat-layout (pre-v12) regex variants are dropped — a 3-segment path is now unambiguously `<Domaine>/<Project>/<file>.md` (loose at project root), the correct reading for current content.

Net effect: **any `.md` anywhere under `<projectsRoot>/<Domaine>/<Project>/<Thread>/<any folder structure>/<file>.md` ingests successfully.** Andy can create `Drafts/`, `Meetings/`, `Recordings/<date>/<topic>.md`, anything — Sync workspace just works. The folder name is a *hint*, not a gate.

> **Main-process change — restart `npm run dev`.** All 28 tests still passing (they seed `rag_documents` directly via `seedDocument`, so they bypass `detectSourceType` — but they confirm the surrounding code is intact). The pre-existing `cfg.gemini` tsc error in `ragIngest.ts` migrated from line 242 → 221 because more lines were deleted than added; same pre-existing error, not introduced here.

### `ce78730` feat(ingest): sortable column headers (client-side sort over the fetched page, persisted in store)

Codex → Ingest's doc list now has sortable column headers for **Title, Type, Project · Domaine, Tags, Edges, Ingested**. Click cycles **asc → desc → back-to-default** (`ingested` desc, matching the DB query's `ORDER BY`). Sort state persists in `ingestStore` alongside the existing filters (new `sortKey: IngestSortKey` / `sortDir: IngestSortDir` + a `setSort(key)` cycle setter — different col → asc; same+asc → desc; same+desc → reset to default). Arrows: `↕` (faint, opacity 0.45) when inactive, `↑` / `↓` when active; right-aligned on Tags / Edges to match the numeric columns; brightens from `text-dim` to `text-secondary` on activation.

Client-side over the already-fetched page (no refetch on sort change): new `sortIngestedDocs(docs, key, dir)` pure helper uses `localeCompare(..., { sensitivity: 'base' })` for strings (case-insensitive) and numeric subtraction for `tag_count` / `relationship_count`; `ingested_at` is an ISO string so lexicographic compare gives correct chronological order. The `#` column on the far left already used `idx + 1` in the existing `docs.map`, so row numbers automatically reflect the current sorted/filtered view — no code change needed there. Filter changes refetch and replace `documents`, then re-sort under the active sort — sort persists across filter changes (desirable).

---

## Current system state (verified 2026-05-13)

### Database

| Table | Rows (approximate, as of session end) |
|---|---|
| rag_documents | ~19 active (Andy's AstraStrata PRDs corpus, ingested via Sync workspace) |
| rag_namespaces | ≥2 bridges + N project namespaces (one per project_name × domaine_id, with proper `domaine_id` resolved via `ensureNamespaceRow`) |
| rag_domaines | ≥1 (AstraStrata, probably more) |
| rag_tags | populated (re-ingested docs landed 5-7 tags each after the force fix) |
| rag_wiki_pages | bootstrap pass should populate one per tag with ≥1 active source — check `[Boot] wiki bootstrap:` log line at startup for actual count |
| rag_schema_migrations | 6 (001→006) |

### Filesystem

`_Domaines/` populated with Andy's real content:

- `AstraStrata/PRDs/01-Global/References/` (4-segment thread references + custom 5-segment under category subfolders)
- `AstraStrata/PRDs/03-S1 - Leasing Module/References/`
- `AstraStrata/PRDs/03-S2 - Maintenance Module/References/1. WOs/` (6-segment paths — the case that drove the `.+\.md$` regex relaxation)
- `AstraStrata/PRDs/03-S2 - Maintenance Module/References/2. Inventory/`
- `AstraStrata/PRDs/03-S2 - Maintenance Module/References/3. Inspections/`

`_Library/Wiki/` — will populate at boot via `bootstrapMissingPages`.

### Config (on disk at `~/Library/Application Support/holocron-editor/holocron-config.json`)

Should be healed by v13's `syncWorkspaceRoots` boot pass:

- `holocronRoot` = `projectsRoot` = `workspace.path` = `/Users/anzo/_AI/Projects/Holocron/_Domaines`
- API keys: Gemini key in use (tag extraction working); Anthropic key status unknown — verify before any synthesis work
- `activeDomaineId`: set to AstraStrata (or whatever Andy was last on)

### Running infrastructure

```
Postgres   localhost:5432   pgvector/pgvector:pg15      container holocron_link-database-1
Redis      localhost:6379   redis:8.2                   container holocron_link-redis-1
Honcho     localhost:8000   custom build                containers holocron_link-api-1 + deriver-1
```

`HOLOCRON_DB_URI` in `editor/.env`. `npm run db:setup` is idempotent and applies migrations 001→006.

---

## ⚠ Known unresolved issues

### HTTP 503 from Gemini on first ingest

The original two zero-tag docs Andy hit were caused by transient `HTTP 503` from the Gemini API on first ingest. The doc landed in the DB with no tags and an error event in `rag_operations_log`. The force-re-ingest path fixes the symptom (Andy can retry per-row), but the root cause — Gemini intermittently 503-ing during a workspace sync — isn't addressed. Sync workspace processes files sequentially with no retry; a single 503 spike skips that doc's tags until manually re-ingested.

**Possible follow-ups** (none implemented):

- Retry-with-backoff on 503/429 inside `chat()` for the tag-extract task
- Surface failed-tag-count separately in the Sync workspace summary alert so Andy knows to re-run on the failures
- Cron-style background re-tag of any doc with `tag_count = 0 AND last_error LIKE '%503%'`

### EditDomaineModal is dead code in `Domaines.tsx`

The function (~70 lines) is defined but never referenced — Andy removed the Edit toolbar buttons in v13. Not deleted because the user only asked to remove the surfaces. Safe to drop on the next pass if anyone touches Domaines.tsx.

### Bootstrap cost estimate is unverified

With `COLD_START_MIN_DOCS = 1`, `bootstrapMissingPages` will compile a page per unique tag in the workspace. For Andy's 19 docs with ~3-5 tags each that's a rough estimate of 30-80 Gemini calls on first boot — sequential through the `isCompiling` mutex, ~2-5 seconds each. Could be several minutes. If it's a problem in practice, raise `COLD_START_MIN_DOCS` back to 2 or add a per-boot cap. Otherwise leave it — happens once.

### `cfg.gemini` type doesn't exist on `HolocronConfig`

Pre-existing tsc error from v11. Runtime works (gemini config IS persisted), but the type definition is missing. Should add `gemini: { apiKey: string; baseUrl?: string; model?: string }` to the `HolocronConfig` interface in `src/main/config.ts` and `src/renderer/src/store/settingsStore.ts`. Five-line fix; deferred because it was never in scope.

---

## 🔬 Verification status (history)

The v13 pending-verification list was completed across a manual sweep + an automated test suite. The bugs surfaced are all fixed and pinned.

| Item | How verified | Outcome |
|---|---|---|
| V1 Domaine purge | Manual (Andy) + 6 automated tests | PASS. closeScribeTabsUnder miss → fixed in `589b70c` |
| V2 Project rename | Manual (Andy) + 4 automated tests incl. bug-4 collateral check | PASS |
| V3 Active-thread purge escape hatch | 4 automated tests | PASS |
| V4 Nuclear Reset | 5 automated tests | Surfaced FK-order bug → fixed in `589b70c`; suite now green |
| V5 Wiki bootstrap | Manual (boot log) + 4 automated tests on the alreadyExists path | PASS (`compiled=0 skipped=0 alreadyExists=137`) |
| V6 Preview tabs | Manual (Andy) | PASS |
| V7 Delete-button reach | **Not verified** — pure visual layout | Outstanding, low risk |

The "wiki rows leak into every Domaine filter" finding from V2's UI inspection became a third fix in `589b70c` with its own 4-test file (`tests/ingest-filter.test.ts`).

Run `npm run test` against `holocron_rag_test` (separate DB from dev `holocron_rag`; auto-CREATEd on first run) to re-exercise the whole suite — 28 tests, ~2.2s.

---

## Next session priorities (in order)

### ✅ DONE this session

- **Thread picker in Scribe sidebar header** — landed in `861ffc3` (vertical accordion popover anchored under the header, full sidebar width, Domaine → Project → Thread cascade, keyboard nav, `loadThreadForPath` helper for Codex Search → Open in Scribe context cascade).
- **Domaine-scoped wiki pages** — landed in `b5033d5` (three-tier namespace-anchored hierarchy: thread / project / domaine, migration 007, ragWiki.ts rewrite). UI in `73a49e5` (tier badges + tier filter + tier sort in the Codex → Wiki tab). Iterative polish in `34c336f` (always-down dropdowns replacing native `<select>` for the macOS popup-centering quirk, plus "Domaine" → "Overview" relabel for the tier value). Post-ship bug fix in `7d5929e` (tier-aware orphan sweep — without this every tier-2/3 page was getting nuked the first time the sourceless check ran). Health-count alignment in `0fa9f03` (scanOrphans was still using the old sourceless rule, surfacing tier-2/3 pages as "4 orphans" that Sweep then deleted 0 of). Ingest-tab tier filter in `8c8b9d2` (SQL-backed JOIN on `rag_wiki_pages` keyed by source_path → wp.slug derivation).
- **Wiki sub-tab UI** — the v08 spec (page grid + readable view + regenerate + Import-to-Thread + Use-as-Report-Draft) was already built before this session; the six wiki commits above extended it with tier surfaces, always-down dropdowns, the orphan-sweep fix, the health-count alignment, and the Ingest-tab tier filter. Removing the "still needs to be built" item carried over from the v13 handoff — it isn't accurate anymore.
- **Graph visualization overhaul** — `graphQueries.ts` returns tier/namespace/real domaine for wiki rows (`01dfd75`); the renderer is now a **`d3-force` SVG "living cell"** (`e387dd5`) — continuous physics, soft per-Domaine clustering via charge anchors (no bounding boxes), glow-haloed nodes sized by tier, pulsing edges, drag/hover/zoom, double-click→Codex preview, "Edit in Scribe" rail button. (An interim Cytoscape+fcose renderer landed in `01dfd75` and was replaced by d3-force in `e387dd5`; the `graphQueries` data layer from `01dfd75` stands.) Prereq data hygiene in `739d54d` (purged 143 migration-007 zombie wiki docs + boot-time + per-delete zombie sweep). **Restart `npm run dev` to pick up the main-process changes and trigger the boot zombie sweep.**
- **Graph-tab UI polish + Ingest fixes** — graph now fills the full Codex viewport + got a resizable/collapsible detail rail (`d49b229`); the boot zombie sweep cascade-deletes orphan tags (`9740a40`); the Ingest Domaine filter persists across tab switches and defaults to "(All Domaines)", all Ingest/Graph dropdown labels are Title Case, and **the wiki Project·Domaine column in the Ingest list is fixed** — resolves via `rag_wiki_pages` like the graph (`e3f4d23`).
- **Codex preview link fixes + all-three-tabs Domaine filter** — markdown links in the CodexPreview pane now work: external → system browser (via `window.open` → `setWindowOpenHandler` → `shell.openExternal`), internal doc paths → in-pane navigation, `wiki://<slug>` links + wiki-type `[N]` citations → wiki-page lookup (`wikiGet`) instead of the `file:read` ENOENT (`14417f7`); `[[wikilinks]]` and bare-name links now also resolve to **raw documents** (matched by filename via `ingestListDocuments`), not just wiki pages, and `MarkdownReader`'s `a:` component is hardened so no branch ever renders a dead `<a>` (`5e67b0d`). **All three Codex tabs (Ingest, Wiki, Graph) now default the Domaine filter to "(All Domaines)" and persist filter state across tab switches** (`e3f4d23` / `b9b0575` / `a554e1a`); Graph "Show orphans" also now defaults off (`a554e1a`). **NB:** "No document or wiki page matches …" on a link click = the target `.md` isn't ingested yet → run Sync workspace, not a code fix.

### 1. Multi-select + mass delete in Ingest

Replace per-row delete-only flows in Codex → Ingest with a checkbox column (or shift-click range selection mirroring SidebarCell's pattern) + a toolbar "Delete N selected" action. Reuses `ingestDeleteDocument` per row; show a typed-confirmation modal for >5 selected. Pairs well with the Retry failed button shipped in `b85af8f` — both are bulk operations on the same row set.

### 2. Syntheses tab (next major architectural layer)

The `rag_syntheses` table has existed since migration 001 (`title`, `query`, `content`, `source_doc_ids`, `captured_back`, `captured_at`, `created_at`) but no UI surfaces it. Conceptually it's the working-memory layer **between** chat-context Q&A and persistent wiki compilation: when the agent answers a cross-doc query during chat, the answer can be **captured back** into `rag_syntheses` as a durable artifact — citing the source docs that backed it, surfacing in Codex alongside Wiki pages, and eventually feeding subsequent searches.

Open scope to nail down before the next session writes code:

- **Trigger surface.** Capture button on a chat message? Right-click on a selection in Scribe? Implicit on every long agent response over a threshold?
- **Storage shape.** The schema is there but no callers have been audited — `captured_back BOOLEAN` suggests a two-stage flow (compose → review → capture) but the controls don't exist yet.
- **Codex → Syntheses sub-tab.** Mirror the Wiki tab UX (grid → preview) or something different? Syntheses are query-anchored, not topic-anchored — the listing primitive is probably "all syntheses citing source doc X" or "all syntheses in this Domaine in date range".
- **Relationship to wiki tiers.** Should a captured synthesis automatically become a source for the relevant thread wiki's next recompile? Or stay strictly user-curated?

This is a real architectural layer addition, not a tweak. Worth its own design pass before implementation.

### 3. Graph analytics — centrality + community detection (InfraNodus-style) + themes

Now that the graph renders cleanly (d3-force, per-Domaine clustering), layer analytics on top:

- **Betweenness centrality** — rank nodes by how often they sit on shortest paths between other nodes; the high-betweenness docs are the "bridge ideas" / structural gaps. Surface as node sizing or a sorted side-list ("most connective documents"). `d3` has no centrality module — either bring in a small graph lib (`graphology` + `graphology-metrics`) or compute Brandes' algorithm directly (it's ~40 lines; fine at <500 nodes).
- **Louvain community detection** — partition the graph into topic clusters from edge structure (not just Domaine membership). Color/group nodes by detected community; show the community labels. `graphology-communities-louvain` is the obvious dep, or a hand-rolled modularity-optimisation pass.
- **Multiple graph themes** — the current "living cell" (dark `#0a0a0f`, glow halos) is one look; add a small theme selector (e.g. "Cell" / "Blueprint" / "Minimal" / light mode) toggling the palette + glow intensity + edge style. Persist the choice in `graphStore`.

This is the InfraNodus playbook — structural-gap analysis, community clusters, betweenness "influencers". Scope it as its own pass; decide the `graphology` vs hand-rolled trade-off up front (`graphology` is ~50 KB and gives centrality + Louvain + more for free, but it's another dep on top of `d3`).

### 4. Cross-domain bridge configuration UI

The `rag_namespaces.is_bridge_namespace` column already exists and gates cross-Domaine reach in Search + Ingest queries. No UI to flip it — currently the only way is psql. Add a per-namespace toggle in Codex → Ingest's row affordances or a dedicated Settings → Workspace tab so Andy can promote a project to bridge status without leaving the app. With `589b70c` already making the wiki-row filter Domaine-aware, the next-natural step is letting Andy control which other namespaces also bridge.

### 5. Wiki article link navigation in Ingest preview pane

Clicking a `[[wikilink]]` or `[N]` citation inside a CodexPreview-rendered wiki page doesn't navigate to the target inside the same preview. Wire the preview's link handlers to swap `previewDoc` to the linked wiki page (or source doc for citation markers) so the reading flow stays inside the Ingest tab. Today the link is dead text.

### 6. Resume Phase 1 ingestion validation

`docs/PHASE_1_VALIDATION.md` was paused mid-pivot in v11. With ingestion now working under the nested layout, the corpus paths resolve correctly and the 8-PRD validation can resume. The four open questions in that doc (tags / relationships / wiki pages / namespace policy) are now answerable against real ingested content. Andy's expectations are captured in the doc — re-read before starting.

### 7. Honcho session cleanup on purge

TODO markers in `purgeProject` and `purgeThread` (`projectFs.ts`). Sessions remain on Honcho server after a thread is destroyed — no disk impact, no chat impact, but they accumulate. Defer to a separate cleanup pass; not urgent.

### 8. Retry / backoff for Gemini 503

See §"Known unresolved issues" above. Without it, every Sync workspace pass risks dropping tags on whichever docs hit the 503 window. Probably belongs in `chat()` itself so all task types benefit (synthesis, tag extract, wiki compile). The Retry failed button papers over the symptom in the Ingest tab; this would prevent it.

### Minor / cosmetic

- **Collapse-toggle repositioning** in the Ingest split divider. Move the `◀` / `▶` chevron from the top to vertical center. Less likely to be hidden under the scroll bar or covered by the sticky header at small heights.
- **V7 Delete-button reach** — confirm visually that `+ Version` and `☰ Contents` stay left-aligned and Delete floats to the far right of the toolbar across viewport widths. No automated coverage; eyeball at narrow widths to confirm no overlap with the minimap.

---

## Open TODOs (carried over)

### High priority

- **Multi-select + mass delete in Ingest** — see §"Next session priorities" #1
- **Syntheses tab (next major architectural layer)** — see §"Next session priorities" #2
- **Graph analytics — centrality + Louvain communities + themes** — see §"Next session priorities" #3
- **Phase 1 ingestion validation resume** — see §"Next session priorities" #6
- **Pre-existing tsc errors** — table at top; separate triage pass

### Medium priority

- **Cross-domain bridge configuration UI** — see §"Next session priorities" #4
- **Wiki link navigation in Ingest preview pane** — see §"Next session priorities" #5
- **Honcho session cleanup** — see §"Next session priorities" #7
- **Watcher pause shim is fragile** — counter-based global flag in `workspace.ts`. Out-of-app fs activity during a rename window is dropped. Acceptable for single-user desktop.
- **`config.gemini` / `config.anthropic` not in `HolocronConfig` type** — runtime fields exist but the TS interface doesn't declare them.

### Low priority / cosmetic

- **Fey theme work** — `themes.ts` + `docs/Fey design.md` uncommitted. Per Andy: do not commit, do not modify.
- **`projectsRoot` UI copy** — Andy considered renaming to "Workspace Folder". Cosmetic, ask before changing.
- **EditDomaineModal dead code** — see §"Known unresolved issues"
- **Stale `activeSessionId` / `activeSessionName` in config** — pre-Projects model leftover, not actively used.

---

## Recent commits trail (chronological, most recent first)

```
ce78730 feat(ingest): sortable column headers (client-side sort over the fetched page, persisted in store)
22f651e fix(ingest): classify by path position, not folder name — any .md under a thread ingests
a554e1a fix(codex): Graph Domaine filter defaults to All Domaines + Show orphans defaults off
5e67b0d fix(codex): resolve in-doc [[wikilinks]] to raw documents, not just wiki pages
b9b0575 fix(codex): Wiki + Ingest Domaine filters default to All Domaines + Title Case
14417f7 fix(codex): markdown links in preview — external → browser, internal → in-pane, wiki:// → wiki lookup
ade466a docs: HANDOFF_v13 — graph fills viewport / resizable rail, zombie orphan tags, Ingest fixes; +graph-analytics priority
e3f4d23 fix(ingest): Domaine filter persists + Title Case labels + wiki Project·Domaine column
9740a40 fix(wiki): zombie sweep cascades orphan tag deletion
d49b229 fix(codex): graph fills full viewport + resizable collapsible detail rail
861c60e docs: HANDOFF_v13 — graph renderer is now d3-force (Cytoscape removed)
e387dd5 feat(codex): replace Cytoscape graph with d3-force living cell renderer
09537da docs: HANDOFF_v13 — graph viz overhaul + zombie purge done; multi-select Ingest is next #1
01dfd75 feat(codex): graph redesign — Domaine clustering, tier-based nodes, fcose, preview-on-open
739d54d fix(wiki): purge migration-007 zombie wiki docs + boot-time zombie sweep
8db9e5e docs: HANDOFF_v13 — Graph viz priority #1 gets an assessment-first instruction
5b4fbce docs: HANDOFF_v13 — health-count alignment + Ingest tier filter; graph viz next
8c8b9d2 feat(ingest): restore + properly implement tier filter dropdown with SQL-backed wiki tier join
0fa9f03 fix(wiki): align scanOrphans health count with tier-aware deleteSourcelessWikiPages
7d5929e fix(wiki): tier-aware orphan sweep — prevent tier-2/3 pages being nuked by sourceless check
34c336f feat(wiki): Wiki tab follow-ups — always-down dropdowns + Overview rename
73a49e5 feat(wiki): tier badges, tier filter, tier sort in Wiki tab
b5033d5 feat(wiki): three-tier namespace-anchored wiki — thread/project/domaine hierarchy + migration 007
861ffc3 feat(scribe): thread picker — cascading accordion dropdown replaces FILES label
309a98e feat(ux): single-click domaines nav, codex search always-preview, open-in-scribe context switch
589b70c fix: nuclear reset FK order, domaine purge tab close, wiki ingest filter
649ba95 test: vitest suite — V1-V5 verification + ingest filter (27 tests)
b85af8f feat(codex): resizable split pane, sticky header, retry failed, wiki re-ingest fix, scoped doc count
2cea2ba feat(scribe): VS Code-style preview tabs + Delete button repositioned to far right
9661abe docs: HANDOFF_v13 — Domaines CRUD healed + ingestion working under nested layout
004e8ad feat(ingest): force re-ingest, wiki bootstrap, X badge fix
5f86c5b feat(ingest): nested Domaine layout + Sync workspace
f940d9f feat(maintenance): Nuclear Reset + sort persistence + subfolder import
0dc8ada fix(domaines): six bugs + workspace root sync
a6df762 docs: HANDOFF_v12 + STATUS refresh — clean slate after architectural reset   ← v12 boundary
c4f7e32 feat(domaines): PR 1 — remove General + restructure rag_namespaces for nested layout
b9921aa feat(domaines): Phase 1 — folder restructure foundation
ae27a19 docs: HANDOFF_v11 + STATUS refresh — Org CRUD layer + tsc verification trap
```

Working tree state at handoff time:

- `M src/renderer/src/themes.ts` — Fey work, deferred (do not touch)
- `M tsconfig.web.tsbuildinfo` — autogenerated, do not commit
- `?? ../_Domaines/` — workspace folder; not a source tree
- `?? ../_Library/` — wiki cache + future bridge content; not a source tree
- `?? ../docs/Fey design.md` — Andy's, deferred
- `?? ../docs/PHASE_1_VALIDATION.md` — leave in tree until validation completes

---

## Hand-off — what to do next

1. **Read this file fully.** Then `HANDOFF_v12_clean-slate.md` for the architectural-reset chapter that v13 was reacting to.
2. **Restart the app first** — main-process changes don't hot-reload, and stale state has burned turns before. The graph-viz session (`739d54d`, `01dfd75`, `e387dd5`, `9740a40`, `e3f4d23`) added main-process edits to `cleanupOps.ts`, `index.ts` (boot zombie sweep), `graphQueries.ts`, and `ingestQueries.ts` (wiki Project·Domaine join), so the running dev instance needs a full quit + `npm run dev` to pick them up. First boot after the restart also physically purges the 143 zombie wiki rows + their disk files (+ their orphan tags now, per `9740a40`) — watch for `[Boot] wiki zombie sweep: deleted=143 doc rows, … orphan tags …`. (`e387dd5` also swapped deps — `cytoscape*` out, `d3` + `@types/d3` in — so a fresh clone needs `npm install`; this machine's `node_modules` is already updated.)
3. **Run `npm run test` before touching anything.** 28 tests against `holocron_rag_test` (separate from dev `holocron_rag`; CREATEd on first run, migrations applied idempotently). Catches regression early — much cheaper than learning a refactor broke Domaine CRUD the hard way.
4. **Verify with `npm run typecheck` every chunk.** NEVER `tsc --noEmit` from root (no-op). NEVER `tsc -b` (emits). The `&&` in the typecheck script short-circuits — if `tsconfig.node.json` errors, the web tsc never runs; check the renderer side alone with `npx tsc --noEmit -p tsconfig.web.json`. Test files are included in `tsconfig.node.json` so the typecheck script covers them too.
5. **Andy's communication style:** describes goals + frustrations precisely; names files + symptoms; expects 🍣 canary at the start of every response (per AGENTS.md) and ETA before action. Read carefully — instructions are exact.
6. **If you encounter the same bug Andy reported twice, suspect the main process is stale.** Tell him to fully quit the Electron app and re-run `npm run dev`. The boot logs (`[Boot] Workspace roots resynced`, `[Boot] wiki bootstrap: starting`, `[Boot] wiki zombie sweep: deleted=N`) confirm fresh code.
