# File Manager / File Explorer widget — audit (2026-09-19)

Scope: read every line of `qualia-shell/src/components/FileExplorer/*` (frontend, `main` @ `e0cf535`)
and `src/routes/fileExplorerRoutes.ts` + `src/services/userDataDir.ts` (backend @ `4330898`).
Every claim below cites the file it came from. Things I did NOT do are listed at the end.

## 1. What the widget is

- "File Manager" (`file-manager`) and "File Explorer" (`file-explorer`) are the SAME component:
  both registry entries lazy-load `FileExplorer/FileExplorer` (`src/registry/widgetRegistry.ts:552-560, :708`).
- The legacy `src/components/FileManager/FileManager.tsx` (372 lines) + `FileManager.css` (640 lines)
  has zero importers (`grep -rn "FileManager/FileManager" src` → no hits). It is dead code.

## 2. Capabilities (what a user can do)

| Capability | How | Source |
|---|---|---|
| Browse a 3-tier tree: domain → project → thread → folder → file | tier inferred by depth on the backend | `fileExplorerRoutes.ts` `tierForDepth` |
| Tree view / flat view (all files) with sort by modified, name, size | toolbar toggle, ⌘/ or ⌘\ | `FileExplorer.tsx` |
| Create file (defaults to `.md`) or folder | toolbar (root) or right-click a folder | `commitNewEntry` |
| Rename | double-click, F2, or context menu | `FileExplorerCell.tsx` `commitRename` |
| Delete (folder = recursive, permanent) | context menu, after a `confirm()` | `handleDelete` → `DELETE /entry` → `fs.rm recursive force` |
| Move / copy | drag onto a folder or the root area (Alt = copy); "Move to…" picker with filter | `handleDrop`, `MoveToModal.tsx` |
| Multi-select | ⌘/Ctrl-click toggle, Shift-click range; multi-drag with "N items" ghost | `useFileExplorer.ts` |
| Upload from Finder | drop files on a folder or the root area | `dropUpload.ts` (new) |
| Paste a screenshot (⌘V) | image → `/api/scribe/images`, plus a `.md` file that links it | `handlePaste` |
| Drag OUT to other widgets | sets `application/x-dwellium-path(s)`, `text/uri-list`, `text/plain` | `handleDragStart`; consumed by `Scribe/dropHandler.ts` |
| Hierarchy lock | blocks create/rename/move/delete/paste/drag in the UI | `locked` flag |
| Show in Finder | Electron build only (`window.electronAPI`) | `FileExplorerCell.tsx` |
| Workspace root path always visible | header strip | `workspaceRoot.ts` |

It can NOT open or preview a file: clicking a file only selects it. `readFile()` exists in
`fileExplorerApi.ts` but this widget never calls it — opening happens by dragging into Scribe.

## 3. What it has access to

**Network (all with the user's session token via `getAuthHeaders()`):**
`GET /api/file-explorer/tree`, `GET /read`, `POST /mkdir`, `POST /touch`, `POST /rename`,
`POST /move`, `DELETE /entry` (`fileExplorerApi.ts`), and `POST /api/scribe/images` (paste).

**Disk (backend):** only `<base>/files/<userId>/`, where base is `DWELLIUM_DURABLE_DIR` →
`DWELLIUM_DATA_DIR` → `QUALIA_DATA_DIR` → `~/.dwellium` (`userDataDir.ts`). Every route is behind
`authenticate` and takes the user id from the session, never from the request. Every path goes through
`resolveAndGuard`: rejects `..`, absolute paths, and anything resolving outside the user root.
Hidden (dot) entries are never listed. One user cannot reach another user's files through this API.

**Browser:** `localStorage` key `file-explorer:<userId>` (expanded folders, selection, lock, view mode,
sort), synced to the account through One Save (`withSync`, object type `file-explorer`). Clipboard
(read on paste only). Drag-and-drop data. `window.electronAPI.showItemInFolder` in Electron.

**It does not touch:** Supabase, any LLM, other widgets' stores, or any file outside the user root.

## 4. Bugs found

Fixed on branch `fix/file-explorer-audit` (frontend only, not pushed):

1. **"New File / New Folder" inside a folder did nothing.** The inline name input only rendered when
   `parentPath === ''`; a comment said nested cases were "handled inside FileExplorerCell", but the cell
   never received that state (0 references). Same root cause: on an EMPTY tree the input sat in the
   non-empty branch, so a new user could not create their first folder from the toolbar.
   Proof: the two new UI tests fail on the old code (2 failed / 2 passed) and pass on the fix.
2. **Dropping a binary file (PDF, image, docx) silently corrupted it.** Drops were read with
   `readAsText` and written as UTF-8. Now refused with a message.
3. **The "5 MB cap, upload anyway?" was fiction.** The backend JSON body limit is 1 MB
   (`app.ts:344`), so anything larger failed with HTTP 413. Root-area drops had no cap and swallowed
   every error. Both paths now share one helper with an honest 0.9 MB limit and a summary of what was skipped.
4. **Dropping a file whose name already exists reported success but saved nothing** (`/touch` never
   overwrites). Now reported as skipped.
5. **Move/drag onto a folder that already has that name silently REPLACED the existing file**
   (`fs.rename` / `fs.cp` overwrite). The UI now refuses in all four move paths (drop on folder, drop on
   root, multi-drop, Move-to picker).

## 5. Recommended next (A and B done on a backend branch; the rest need your go)

Backend (I did not edit it: the checkout is served live by launchd with hot reload):
- **A. DONE 2026-09-21 (backend branch `fix/file-explorer-no-overwrite-soft-delete`, `ba7edc5`, not pushed, not deployed):**
  `/move` and `/rename` answer 409 `{code: "DEST_EXISTS"}` when the destination exists and move nothing;
  copy uses `errorOnExist`; a missing source is 404. Same-inode (case-only) renames still work.
- **B. DONE, same commit:** `DELETE /entry` moves the entry to
  `<userRoot>/.trash/<timestamp>-<rand>/<original path>` instead of `fs.rm`. `/tree` never lists it.
  Found while testing: `DELETE {path: "."}` passed the traversal guard and wiped the user's whole file root —
  now 400. Rename falls back to copy-then-remove (the source is kept if the copy fails); that fallback is
  there for the Cloud Run bucket mount, where I have NOT verified how directory renames behave.
  Verified: `tests/fileExplorerRoutes.test.ts` 15/15 (10 of the first 14 fail on the old code), full backend
  `npm test` 62 suites / 580 tests exit 0, `tsc --noEmit` exit 0 — all against a temp dir, never real user files.
  Open: nothing empties `.trash` and there is no restore UI; the frontend confirm still says "This cannot be
  undone" (left as is until the backend is deployed, so the UI never promises a trash that is not there).
- **C. Multipart `/upload` route** so binary and large files work (there is a comment promising a `/bytes`
  endpoint that was never built).
- **D. `validateRelPath` rejects any name containing `..`** (e.g. `notes..md`); compare path segments instead.
- **E. `walkTree` has no depth or entry cap** and re-reads the whole tree on every refresh.

Frontend:
- **F. Delete only removes the right-clicked entry** even when several are selected.
- **G. Open/preview a file on double-click** (today double-click = rename; there is no open at all).
- **H. The dragged `text/uri-list` URL uses `window.location.origin` and needs an auth header,** so an
  external app that receives the drag gets a 401.
- **I. Remove dead `components/FileManager/`** (1,012 lines, zero importers).
- **J. Accessibility:** 7 pre-existing `jsx-a11y` lint errors in this folder (same count on `main`);
  no arrow-key navigation in the tree; `alert()`/`confirm()` instead of in-app dialogs.
- **K. The lock is UI-only** — the backend does not enforce it (documented as intentional in
  `fileExplorerStore.ts`).

## 6. Verification actually run

Full strict gate, run in the fix worktree, judged by exit codes:
- `npx tsc -b` → exit 0.
- `npx vitest run` (whole suite) → 350 files / 3066 tests passed, exit 0.
- `npx react-router build` → exit 0; `VITE_APPFOLIO_SEEDS=false npx react-router build` → exit 0.
- `node Scripts/verify_no_pii_leak.mjs` → exit 0.
- `SMOKE_TEST_PORT=3210 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs` → PASS, 0 console warnings, 0 page errors.
- The two new UI tests run against the pre-fix `FileExplorer.tsx` → 2 failed (proves they test the bug).
- `npx eslint src/components/FileExplorer` → 7 errors / 12 warnings, identical to unmodified `main`.

Real-browser pass — **standalone render (no shell, no login)**: the real component from this branch,
mounted under `StrictMode` in a scratchpad Vite harness on :5189, against an in-memory FAKE of
`/api/file-explorer` that copies the backend semantics on trial (`/touch` never overwrites, `/move` does):
- Right-click `Home` → New File → input "filename.md in Home" appeared, typed `notes`, Enter →
  `POST /touch {path: "Home/notes.md"}`, file listed.
- Move root `quote.md` into `Home/Roof` (already has `quote.md`) via the Move-to picker → refused with
  "already exists" message, zero `/move` calls, existing content unchanged.
- Dropped 4 files on the root area → `Uploaded 1 of 4`; the PDF (binary), the duplicate name and the
  950 KB file were each skipped with a reason; only `ok.txt` was written, content intact.
- 0 console errors.
The browser pass also caught two things the tests did not: a nonsense "0.9 MB, limit 0.9 MB" message
(now KB), and a raw NUL byte in `dropUpload.ts` that made git treat the file as binary (now char codes).

NOT verified: inside the real shell with a real login against the real backend (only Ilya can log in);
real OS drag-and-drop from Finder (the drop was a synthetic `DragEvent`); nothing pushed, no CI run.
