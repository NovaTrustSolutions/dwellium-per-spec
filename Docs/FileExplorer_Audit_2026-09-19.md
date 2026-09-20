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

## 5. Recommended next (NOT done — each needs your go)

Backend (I did not edit it: the checkout is served live by launchd with hot reload):
- **A. `/move` and `/rename` should return 409 when the destination exists.** The UI guard in fix 5 works
  off the last loaded tree; only the server can make overwrite impossible. ~6 lines.
- **B. Soft delete:** move to `<userRoot>/.trash/<timestamp>-<name>` instead of `fs.rm`. `walkTree` already
  hides dot entries, so no UI work is needed to hide it, and a wrong delete becomes recoverable. ~5 lines.
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

- `npx vitest run src/test/fileExplorerAudit.test.tsx src/test/moveTargets.test.ts` → 11 passed, exit 0.
- Same UI tests against the pre-fix `FileExplorer.tsx` → 2 failed (proves they test the bug).
- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx eslint src/components/FileExplorer` → 7 errors / 12 warnings, identical to unmodified `main`.

NOT verified: no live-browser pass (another session's dev server holds this folder's port; per
FUCKUPS 2026-09-17 I did not test against a server I didn't start), full vitest suite and
`react-router build` not run, nothing pushed, no CI.
