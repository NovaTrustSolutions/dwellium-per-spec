# 076 — File Explorer widget: audit + improvement plan

Status: BUILT, NOT MERGED (2026-09-30) — all 4 phases committed and reviewed. Frontend `feat/076-file-explorer-p4` @ 099589d (stacked p1 → p3 → p4); backend `fix/076-p4-upload` @ 4b7d956 (stacked on `fix/076-file-explorer-safety` → `fix/076-p3-trash`, target `backend/ship`). Deploy the backend first.
Audited read-only 2026-09-30 against frontend `main` @ `4360f3a`, backend `backend/ship` @ `5b602cd` (the backend's real trunk; `origin/main` is stale).
Swarm: ruflo `swarm-1790743460231-s4461y` (hierarchical). ruflo only *registered* the agents
(`fe-ui-mapper`, `fe-data-mapper`, `be-routes-mapper`, `refute-reviewer`); the work ran as Claude Code
subagents: 3 mappers by file ownership, then 1 refute-first reviewer given 18 claims. Result: 17
confirmed, 1 refuted by the reviewer (C17). The orchestrator reinstated C17 because the reviewer
searched `qualia-shell/` only, and the stale file is at the repo-root `Docs/`. The reviewer added 3
new items.
Predecessor: `Docs/FileExplorer_Audit_2026-09-19.md` (PR #133, merged 2026-09-29) + backend PR #6
(409 `DEST_EXISTS`, soft delete to `.trash`, `DELETE "."` → 400; merged into `backend/ship`).

## 1. What File Explorer is today

Registry: `file-explorer` (`widgetRegistry.ts:~684`) and alias `file-manager` (`~534`), same component.
Frontend `qualia-shell/src/components/FileExplorer/` (1,474 lines): `FileExplorer.tsx` 591,
`FileExplorerCell.tsx` 463, `MoveToModal.tsx` 92, `dropUpload.ts` 40, `fileExplorerApi.ts` 57,
`fileExplorerStore.ts` 96, `useFileExplorer.ts` 70, `moveTargets.ts` 48, `workspaceRoot.ts` 17.
Backend `ai-dashboard369-file-manager/src/routes/fileExplorerRoutes.ts` (299 lines, `/api/file-explorer`,
all `authenticate`), disk root `<base>/files/<userId>/`, tiers by depth (domain/project/thread/folder).

| Capability | Works? | Evidence |
|---|---|---|
| Tree view / flat view (⌘/ or ⌘\), flat sort modified/name/size | Yes | FileExplorer.tsx:129-138, 361-389 |
| New file (.md) / folder at root; inside a folder via context menu | Yes | FileExplorer.tsx:322-344; Cell:412-413 |
| Rename (double-click, F2, menu); 409 on a name clash | Yes | Cell:313-314; routes:224-245 |
| Move/copy by drag (Alt = copy), "Move to…" picker with filter, multi-select drag | Yes | Cell:193-291; MoveToModal.tsx |
| Delete (context menu) → backend soft-deletes into hidden `.trash/<stamp>/` | Yes, 1 item only | Cell:156-166; routes:275-297 |
| Finder drop upload (text ≤ 900 KB, no binary, no name clash) | Partly | dropUpload.ts |
| ⌘V screenshot paste → image to `/api/scribe/images` + linking `.md` | Partly (see D10) | FileExplorer.tsx:143-188 |
| Drag out to other widgets (`application/x-dwellium-path`) | Yes | Cell:264-301 |
| Hierarchy lock (UI-only), per-user expand/selection/view prefs (One Save synced) | Yes | fileExplorerStore.ts |
| Show in Finder | Electron only | Cell:68-79, 417 |
| **Open / preview a file** | **No** (`readFile()` exists, unused here) | Cell:313; fileExplorerApi.ts:39 |
| Search, download, binary upload, trash/restore, breadcrumbs, keyboard tree nav | **No** | — |

Shared data: Workspace (`workspaceStore.ts`), Wiki (`Wiki.tsx:26` uses `fetchTree`+`readFile`),
ContentSearch, KnowledgeGraph and Scribe ingestion all call `fileExplorerApi.ts` directly, each with its
own tree copy. No cross-widget change signal.

## 2. Findings (verified)

| id | sev | finding | evidence |
|---|---|---|---|
| D1 | **high** | **Account switch shows the previous user's tree.** `refresh` has `[]` deps and runs once on mount; logout doesn't reload and windows are keyed by window id, not user. Any create/move then hits user B's disk while the screen shows A's paths. An in-flight `fetchTree` from A can also land after the switch. | FileExplorer.tsx:88-100, 224-226; UserContext.tsx:436-450; Desktop.tsx:1508 |
| D2 | **high** | **Delete ignores multi-selection.** Select A, B, C, right-click D, Delete → only D goes; the dialog never mentions A–C. No keyboard or toolbar delete. | Cell:156-166 |
| D3 | med | Confirm says "This cannot be undone." but the backend soft-deletes. No restore UI anywhere; `trashedTo` is discarded. `.trash` grows forever. | Cell:158; fileExplorerApi.ts:55-57; routes:286-293 |
| D4 | med | No way to open a file: double-click renames. Doc Viewer can't take this path (it opens `/api/files` ids via `qualia-docviewer-open-file`), so it needs a decision (G1). | Cell:313; DocViewer.tsx:71, 306-310 |
| D5 | med | `/touch` returns `success:true` when the file already exists but writes nothing. A drop or paste against a stale tree reports "uploaded" though nothing was saved. | routes:213-216; dropUpload.ts:32 |
| D6 | med | `refresh()` has no stale-response guard (older response can overwrite newer; feeds D1). The client clash pre-check (`childNames`) uses this possibly stale tree. The `doMove` catch path doesn't refresh. | FileExplorer.tsx:88-122; moveTargets.ts:41-46 |
| D7 | med | Only `/tree` hides `.trash` and dot-names. Every other route accepts them, so a user can move files *into* `.trash`, or `mkdir(".notes")`, and they become permanently invisible. | routes:65, 95-110 |
| D8 | med | TOCTOU on `/move` and `/rename`: check-then-`rename`. For a file, a racing write is silently overwritten. A non-empty directory gives ENOTEMPTY → 500. (`copy` is safe: `errorOnExist`.) | routes:122-130, 239-266 |
| D9 | med | No cross-widget invalidation: a rename here leaves Workspace, Wiki, Search and KG stale. The lock doesn't cover them either. | workspaceStore.ts:31; C11/C12 |
| D10 | low-med | The pasted-screenshot `.md` embeds `/api/scribe/images/<f>`, which needs auth. A plain `<img>` sends no Bearer, so the image 401s wherever it is rendered. | FileExplorer.tsx:176-177; scribeDndRoutes.ts:82 |
| D11 | low | `..` is checked as a substring (in `validateRelPath` **and** again in `/rename`'s `toName`), so `notes..v2.md` is refused with a 400. | routes:97, 229 |
| D12 | low | `/read` has no size cap, reads binary as UTF-8 (garbled text), and leaks raw `err.message` on 500s. The drag-out `text/uri-list` points at `/read`, which returns JSON and needs a Bearer, so external drop targets get a 401. | routes:182-200; Cell:296 |
| D13 | low | Multi-move loops swallow per-item errors (`catch { /* skip */ }`); user never learns what failed. | FileExplorer.tsx:260; Cell:213 |
| D14 | low | Accessibility: no arrow-key tree nav (only the selected row is tabbable); native `alert()`/`confirm()` everywhere; 24 px icon buttons. | Cell:314; FileExplorer.tsx:579-591 |
| D15 | low | Latte theme: hard-coded dark literals (`#222`, `#ccc`, `#1a1a1a`, `#2a2a2a`, `#e5e5e5`, `#808080`, `#666`). | FileExplorer.tsx:314, 318, 401, 586; Cell:326, 341, 405-407, 447 |
| D16 | low | Dead code `components/FileManager/` (0 importers). Stale `Docs/backend-file-explorer-routes.ts` (pre-soft-delete) is still cited by `fileExplorerApi.ts:3`. | reviewer C16; orchestrator diff |
| D17 | low | Backend tests don't cover `/tree`, `/mkdir`, `/read`, `/touch`, dot-paths or 401s. The frontend has no test for delete, D1 or refresh ordering. | tests/fileExplorerRoutes.test.ts |

Downgraded/unverified: "F2 dead after click" (UI mapper, UNVERIFIED focus timing; test in harness,
not planned). Symlink escape in `/read`: real only if a symlink is planted out-of-band (no route
creates one). Harden cheaply in P2 via `realpath` check. `userId` path sanitation: ids come from
`authenticate`, not the client. No action.

## 3. Decision gate (Ilya) — before Phase 3

**Decided 2026-09-30 (Ilya: "go with your recommendations"):** G1 = in-widget read-only preview;
G2 = Trash view with Restore + user-clicked Empty trash (typed confirm), no auto-purge; G3 = yes, P4b
binary upload/download.

**D1 re-scoped at execution:** logout swaps AdminShell for LoginScreen (App.tsx:97-109), which
unmounts the widget. The leak needs the session-expired re-auth modal, which keeps the shell mounted
and whose email field is editable (SessionExpiredModal.tsx:84-115). Severity high → med; same fix.

- **G1 What does "open" do?** Recommendation: **an in-widget read-only preview pane** (text/markdown
  via the existing `readFile`, as Wiki already does). It's small, reuses code and touches no other
  widget. Alternatives: (a) hand text files to Scribe, (b) teach Doc Viewer to open File Explorer
  paths (needs a backend bridge between the two file stores, which is bigger).
- **G2 Trash policy.** Recommendation: a **Trash view with Restore only**. "Empty trash" is a
  permanent delete, so it stays a user-clicked button with a typed confirm, and no automatic purge
  (house rule: only the user deletes). Say if you want an auto-purge after N days.
- **G3 Binary upload/download (P4).** Needs a new multipart backend route. Worth it now, or keep
  text-only?

## 4. Phases

### Phase 1 — Correctness + honesty (frontend only) — ~0.5 day
Files: `FileExplorer.tsx`, `FileExplorerCell.tsx`, `fileExplorerApi.ts`, new `test/fileExplorer.p1.test.tsx`.
- D1: key the tree load on `userCtx.user?.id` (clear `entries` on change) + a request-sequence ref so
  only the latest `refresh()` may `setEntries` (fixes D6's ordering too). Use `captureOwner()`
  (`lib/perUserIdentity.ts:186`) around awaits, as other widgets do.
- D2: Delete acts on `selectedPaths` when the clicked row is in the selection. The confirm lists the
  count and first names. Add the `Delete`/`Backspace` key on a focused row.
- D3 (copy only): "Moves to Trash" wording. Return `trashedTo` from `deleteEntry`.
- D6/D13: refresh on any move/rename failure and report "moved X of Y; failed: …".
- Tests: account-switch StrictMode test, out-of-order refresh test, multi-delete test. Mutation-check
  each against the old source.

### Phase 2 — Backend safety (fileExplorerRoutes.ts + tests) — ~0.5 day
Worktree `~/dwellium-backend/worktrees/076-file-explorer` off `origin/backend/ship`.
- D5: `/touch` → 409 `DEST_EXISTS` when the file exists. The frontend `dropUpload`/paste handle 409 as "skipped".
- D7: reject any path segment starting with `.` on all routes (`.trash` reachable only through the P3 endpoints).
- D8: create-exclusive semantics. For files, `fs.link` + `unlink` (or `copyFile` with `COPYFILE_EXCL`
  + `rm`) instead of `rename`. For directories, map ENOTEMPTY/EEXIST to 409. Keep the ponytail note
  on the per-user lock alternative.
- D11: segment-aware check (`rel.split(/[\\/]/).includes('..')`) in both places.
- D12: `/read` size cap (e.g. 2 MB → 413) and a NUL-byte check → 415. Generic 500 message; the detail goes to the log only.
- Symlink: `fs.realpath` result must stay under the root.
- D17: tests for every route above + 401. Tests must `delete process.env.DWELLIUM_DURABLE_DIR` first (see `Docs/code.md`).

### Phase 3 — Open + Trash (after G1/G2) — ~1 day
- Backend: `GET /trash` (list stamps + original paths), `POST /trash/restore {stamp, path}` (409 if
  the original path is taken; offer "restore as…"), `DELETE /trash/{stamp}` (user-initiated purge only).
- Frontend: preview pane (G1) on double-click/Enter; rename moves to F2/menu only. Trash view (G2)
  from the toolbar.

### Phase 4 — Quality of life — ~1 day (P4b depends on G3)
- P4a: toolbar filter box (lift the filter from `MoveToModal.tsx:24-28`); breadcrumbs in flat view;
  arrow-key tree nav per the WAI-ARIA tree pattern; replace `alert`/`confirm` with the shell's toast
  and dialog; latte tokens (D15); 32 px+ targets.
- P4b: multipart `POST /upload` modelled on `fileRoutes.ts` (multer memoryStorage) + `photoRoutes.ts:226`
  (`fileSize` limit), plus `GET /bytes` for download. Drag-out `uri-list` then points at a signed or
  short-lived URL, or is removed (D12).
- D9: dispatch one `window` event `dwellium-file-tree-changed` after every successful mutation in
  `fileExplorerApi.ts`, the single place all callers route through. Workspace/Wiki/Search/KG
  refetch on it. The lock stays UI-only (documented).
- D10: store pasted images inside the user's file tree (via P4b upload) and link relatively, or keep them in Scribe and render through an authed fetch.
- D16: delete `components/FileManager/` and the stale `Docs/backend-file-explorer-routes.ts`. Fix the comment.

## 5. Execution shape (ruflo swarm, per past runs)
One frontend worktree off `origin/main`, one backend worktree off `origin/backend/ship`. Per phase:
P0 contract commit (response shapes: `trashedTo`, 409 codes on `/touch`, trash endpoint types) →
W1 coders by FILE ownership (backend routes / API+store / components) → orchestrator read + full gates
(`npx vitest run`, `npx tsc --noEmit -p tsconfig.json`, backend `npm test`) → W2 adversarial
reviewer with required probes (account switch mid-refresh, racing moves, dot-path requests, 409
drop) → standalone harness (scratchpad Vite + fake API, latte screenshot) → commit. No push, merge or
deploy without Ilya's explicit say-so. Change the delete copy in production only after the
soft-delete backend is confirmed deployed (verify on the live API, not the branch).

## 6. Phase 3 contract (written 2026-09-30, before W1)

Branches: frontend `feat/076-file-explorer-p3` (stacked on p1), backend `fix/076-p3-trash` (stacked on
`fix/076-file-explorer-safety`). Worktrees `.claude/worktrees/076-fe-p3`, `~/dwellium-backend/worktrees/076-p3-trash`.

### Backend (`src/routes/fileExplorerRoutes.ts`)
Trash layout (unchanged since PR #6): `<userRoot>/.trash/<id>/<original path>`, one `<id>` per delete,
`id` = `YYYY-MM-DDTHH-MM-SS-mmmZ-xxxxxx` (ISO with `:`/`.` → `-`, plus 6 hex). Valid id regex:
`/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{6}$/` → otherwise 400 `invalid trash id`.
Trash routes build paths from the regex-checked id only (never from the shared request-path validator,
which refuses dot-segments by design).

- `GET /trash` → `{ success, data: TrashItem[] }`, newest first.
  `TrashItem = { id, path, name, isDir, deletedAt: string | null, size?: number }`.
  `path` = the deepest single-child DIRECTORY chain under `.trash/<id>` (no manifest exists; for a folder
  that held exactly one subfolder, restoring the longer chain gives the identical disk result —
  `ponytail:` note). Empty id dirs and non-matching names are skipped. `deletedAt` parsed from the id.
- `POST /trash/restore { id, as? }` → target = `as ?? item.path` (`as` goes through the shared validator).
  Exclusive like `/move` (reuse `destinationStatus` + `performMove`): taken → 409 `DEST_EXISTS`. Missing
  parents are created. Then remove `.trash/<id>` only if no files remain in it. → `{ success, path }`.
  404 if the id dir is missing.
- `DELETE /trash/:id` → permanently removes `.trash/<id>` → `{ success }`; 404 if missing.
- `DELETE /trash` with body `{ confirm: 'EMPTY' }` → removes every valid id dir → `{ success, removed }`;
  any other body → 400. (Permanent deletes happen only from a user click; the UI adds a typed confirm.)
- All `authenticate`; 500s sanitized as in P2.

### Frontend API (`fileExplorerApi.ts`, P0 — committed with this section)
`TrashItem`; `listTrash()`, `restoreFromTrash(id, as?)`, `deleteFromTrash(id)`, `emptyTrash()` (sends
`confirm: 'EMPTY'`). Errors thrown by `call()` now carry `status` and `code` (`ApiError`); helper
`isConflict(err)` = status 409.

### Frontend components
- `FilePreview.tsx` (new): `{ path: string; onClose(): void }`. Fetches `readFile(path)`; header with
  name + close (Esc closes); loading / error (413 → "Too large to preview (limit 2 MB)", 415 → "Binary
  file — preview isn't available yet", else the message); `.md`/`.markdown` → `renderSafeMarkdown`,
  anything else → `<pre>` with wrapping. Stale responses dropped when `path` changes (sequence ref).
  `role="region"` `aria-label="Preview of <name>"`. Theme tokens only (no dark literals).
- `TrashPanel.tsx` (new): `{ onClose(): void; onRestored(path: string): void }`. Lists items (name,
  original folder, deleted time), per-row Restore and Delete forever (confirm "Permanently delete
  "<name>"? This cannot be undone."), Empty trash (window.prompt: type EMPTY). Restore 409 →
  `window.prompt('"<path>" already exists. Restore as:', '<name> (restored)')` → restore with `as`.
  Empty / loading / error states. Theme tokens only.
- Integration (W2, `FileExplorer.tsx` + `FileExplorerCell.tsx`): toolbar Trash button toggles the Trash
  panel in place of the tree; `previewPath` state shows `FilePreview` below the tree. Double-click a
  file → open preview, a folder → expand/collapse; Enter on a selected file → open; context menu
  "Open" for files; rename stays on F2/menu. Close the preview when its file leaves the tree on
  refresh; clear preview + close trash on account switch; refresh after restore.

## 7. Phase 4 contract (written 2026-09-30, before W1)

Branches: frontend `feat/076-file-explorer-p4` (stacked on p3), backend `fix/076-p4-upload` (stacked on
`fix/076-p3-trash`). Harness `~/dwellium-harness/076-file-explorer` now points `@after` at the p4 worktree.

### Backend (`fileExplorerRoutes.ts`)
- `POST /upload` multipart (multer memoryStorage): text field `dest` ('' = root, shared validator
  when non-empty), file field `files` (max 20 files, each ≤ 25 MiB). Decode `originalname` from latin1 to
  utf8; use its basename only. Per file: validate `dest/name` with the shared validator, write with
  flag `'wx'` (never overwrite). → 200 `{ success: true, results: [{ name, path, status: 'ok' |
  'exists' | 'invalid' | 'error', error? }] }`. Multer `LIMIT_FILE_SIZE` → 413 `TOO_LARGE`,
  `LIMIT_FILE_COUNT`/`LIMIT_UNEXPECTED_FILE` → 400. Missing dest folder → created (like touch).
- `GET /bytes?path=` → streams the raw file (regular files only, same validator + symlink confinement,
  404/400 as `/read`). Headers: `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Type` from a small extension map
  (png/jpg/jpeg/gif/webp/pdf/txt/md/json/csv, else `application/octet-stream`). `Content-Disposition:
  inline` ONLY for png/jpg/jpeg/gif/webp; everything else (incl. svg/html) `attachment` with
  `filename*=UTF-8''<encoded name>`. `?download=1` forces attachment.

### Frontend API + events (P0, committed with this section)
- `uploadFiles(files, dest)` (FormData, no JSON content-type), `fetchBytes(path): Promise<Blob>`,
  `downloadFile(path)` (authed fetch → object URL → `<a download>`; `<a href>` alone can't send the
  Bearer token).
- `FILE_TREE_CHANGED = 'dwellium:file-tree-changed'` window event, dispatched by the API module after
  every successful mkdir / touch / rename / move / deleteEntry / restoreFromTrash / uploadFiles.
  ponytail: File Explorer refreshes after its own mutations AND on the event (one extra fetch; the
  sequence guard keeps it correct).
- Dead code: `components/FileManager/` removed; `Docs/backend-file-explorer-routes.ts` marked stale.

### Frontend W1 modules (new files, one owner each)
- `FileDialogs.tsx`: `useFileDialogs()` → `{ confirm({title, message, confirmLabel, danger?,
  requireText?}): Promise<boolean>, prompt({title, message?, defaultValue, confirmLabel}):
  Promise<string|null>, notify(message, tone?: 'info'|'error'), host: ReactNode }`. Host renders inside
  the widget (absolute overlay over a `position: relative` root). `role="dialog" aria-modal`,
  labelled/described; focus goes to the input or primary button, Tab cycles inside, Esc cancels, Enter
  confirms, focus returns to the opener. `requireText`: confirm stays disabled until typed exactly.
  notify: `role="status"` (error: `role="alert"`), auto-hides after 4 s. Theme tokens only; danger/muted
  text via `color-mix(in srgb, var(--danger|--text-tertiary) 60%, var(--text-primary))`.
- `treeNav.ts`: pure `navKey(rows, currentPath, key)` over the VISIBLE rows `{ path, isFolder,
  expanded, parent }[]` → `{ focus?: string; toggle?: string; open?: string } | null` for ArrowUp/Down,
  ArrowRight (closed folder → toggle; open folder → first child), ArrowLeft (open folder → toggle;
  else → parent), Home/End (first/last), Enter (file → open; folder → toggle). WAI-ARIA tree pattern.
- `treeFilter.ts` + `Breadcrumbs.tsx`: `filterTree(entries, query)` → `{ entries, expand: Set<string> }`
  (case-insensitive name substring; keeps ancestors of matches, forces them open; '' → unchanged).
  `Breadcrumbs({ path, onNavigate })`: `root › A › B › file`, each crumb a button except the last,
  `nav aria-label="Location"`.
- Consumers (Workspace store, Wiki, ContentSearch, KnowledgeGraph): listen for `FILE_TREE_CHANGED` and
  refetch their tree (debounced ~300 ms, cleaned up on unmount).
- `FilePreview.tsx`: image files (png/jpg/jpeg/gif/webp) render as `<img>` from `fetchBytes`; relative
  `<img src>` inside markdown (resolved against the file's folder) is loaded via `fetchBytes` and swapped
  to an object URL; absolute http(s) images untouched; object URLs revoked on change/unmount.

### Frontend W2 integrator (FileExplorer.tsx, FileExplorerCell.tsx, TrashPanel.tsx, MoveToModal.tsx, dropUpload.ts)
All alert/confirm/prompt → `useFileDialogs` (Empty trash uses `requireText: 'EMPTY'`); roving-tabindex
arrow navigation via `navKey`; toolbar filter box (`filterTree`); Breadcrumbs for the selected entry;
toolbar Upload button (hidden `<input type=file multiple>`) and Finder drops → `uploadFiles` (binary
OK; per-file results summarised); context menu Download for files; drag-out drops `text/uri-list`
(it could never authenticate); ⌘V screenshot → `uploadFiles` into the target folder + an `.md` linking
the image by a RELATIVE path (previewed via the FilePreview image loader).

### W3 theme + targets (same files, after W2)
Every hard-coded dark literal in the File Explorer → theme tokens (axe color-contrast 0 across the
whole widget in cosmos + latte); icon buttons ≥ 32 px hit area.
