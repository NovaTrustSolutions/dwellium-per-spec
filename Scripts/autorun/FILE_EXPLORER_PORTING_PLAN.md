# File Explorer Enhancement Porting Plan — Holocron → Dwellium

**Branch:** `feat/file-explorer-enhanced`
**Created:** 2026-05-28
**Branched from:** main at `d5fbc2f` (post-Scribe-merge)
**Author:** Claude (Cycle 1 — discovery + plan)
**Status:** Awaiting Ilya review before Cycle 2 begins

---

## 1. What's being ported

Holocron's file-explorer is the **left sidebar tree** that manages domains → projects → threads (3-tier hierarchy). It's NOT a popup widget — it lives permanently in the left rail. In Dwellium today, the closest equivalent is a mix of:

- The **DOMAINS sidebar section** in `Sidebar.tsx` (currently just lists user-created domains)
- The **FileManager widget** (`qualia-shell/src/components/FileManager/FileManager.tsx`) — a popup window with file upload, search, and tagging

Neither matches Holocron's behavior. The port needs to bring Holocron's powerful file-tree UX into Dwellium without breaking the existing widget-window architecture.

## 2. Holocron features to port (from the reference)

| Feature | Holocron file | Dwellium-side target |
|---|---|---|
| Multi-select drag with ghost element | `SidebarCell.tsx:644-664` | New `FileExplorer/DragLogic.ts` |
| Drag-to-move/copy between folders (Alt = copy, default = move) | `SidebarCell.tsx:669-740` | Same |
| Sets `application/x-dwellium-path` MIME + `text/plain` paths | `SidebarCell.tsx:651-656` | Use namespace `application/x-dwellium-path` |
| Drag entries onto themselves rejected (path-traversal guard) | `SidebarCell.tsx:674-690` | Same logic |
| Inline rename via double-click | `SidebarCell.tsx:858+` | Same UX |
| Tree expansion state persisted per-user | `sidebarStore.ts` | Use `createLocalStorageStore` factory (sister to scribeLayoutStore) |
| Drag-to-pop-out (windowed mode) | `SidebarCell.tsx` | Skip — Dwellium's window manager already covers this |
| Domain/project/thread hierarchy with badges | `DomaineBadge.tsx` | Decide: keep Dwellium's DOMAINS or full 3-tier import |
| Sidebar resize | `PanelDivider.tsx`, `ResizeHandle.tsx` | Already partially present in qualia-shell/Sidebar.tsx (left edge drag) — extend if needed |
| Cross-widget drag (file → Scribe/ARA) | n/a — Holocron has only one editor | NEW Dwellium feature: wire to scribeDropHandler |
| Screenshot-paste support | n/a in Holocron's file explorer | NEW Dwellium feature: Cmd+V image → upload + add to current folder |
| Hierarchy lock (Holocron-specific) | `SidebarCell.tsx` — lock icon prevents tree restructuring | NEW Dwellium feature, user-requested |
| Dual-mode view (tree ↔ flat) | `Sidebar.tsx` — toggle button | NEW Dwellium feature, user-requested |

## 3. Architecture diff

**Holocron (Electron + main+renderer split):**
- Main process: `projectFs.ts` (1526L) handles all FS ops via `fs.promises`
- IPC bridge: `window.electronAPI.readDir`, `.threadCreate`, `.moveEntry`, etc.
- Renderer reads from IPC; state in Zustand store (`sidebarStore.ts`)

**Dwellium (web + Express backend):**
- Backend: `~/dwellium-backend/.../routes/fileRoutes.ts` (already shipping; serves `/api/files/*`)
- Frontend: calls `fetch('/api/files/tree')` etc.; state via React context (`HierarchyContext.tsx`) + per-user localStorage stores

**Key rewrite:** every `window.electronAPI.*` in Holocron's file-explorer code becomes a `fetch('/api/files/*')` in Dwellium. The shape of the data stays the same (entries with `name`, `path`, `type`, `children`).

## 4. Cycle breakdown — proposed

Mirrors how Scribe was structured (12 cycles total). File-explorer scope is comparable — estimate 8-10 cycles.

| Cycle | Subject | Files touched (estimate) | LOC delta (estimate) |
|---|---|---|---|
| 1 | This plan (Discovery + Cycle 2 prep) | `Scripts/autorun/FILE_EXPLORER_PORTING_PLAN.md` | +200 |
| 2 | Scaffold `FileExplorer/` directory + register as left-rail panel | `FileExplorer/FileExplorer.tsx`, `FileExplorerCell.tsx`, `fileExplorerStore.ts`, `data/hierarchy.ts` | +400 |
| 3 | Tree rendering from `/api/files/tree` + expansion state per-user | `FileExplorerCell.tsx`, `fileExplorerStore.ts` | +300 |
| 4 | Inline rename + create-file/folder inline form | `FileExplorerCell.tsx` | +200 |
| 5 | Drag-from-FileExplorer (sets `application/x-dwellium-path` + `text/uri-list`) | `FileExplorerCell.tsx`, `dragLogic.ts` | +250 |
| 6 | Drag-into-FileExplorer (file move/copy between folders, alt-drag = copy) | `FileExplorerCell.tsx`, backend `/api/files/move` route | +300 |
| 7 | Cross-widget DnD wiring — drag file from explorer INTO Scribe inserts content via existing `scribeDropHandler` | `Scribe/dropHandler.ts` (add `application/x-dwellium-path` branch) | +50 |
| 8 | Screenshot-paste (Cmd+V image → upload to current folder) | `FileExplorer.tsx` + backend image upload extension | +150 |
| 9 | Hierarchy lock toggle | `FileExplorer.tsx`, persisted per-user | +100 |
| 10 | Dual-mode view (tree ↔ flat) | `FileExplorer.tsx` | +150 |
| 11 | Multi-select + ghost element drag | `FileExplorerCell.tsx`, `dragLogic.ts` | +200 |
| 12 | Closure + acceptance walk + PR | `Docs/feat-file-explorer-closure.md` | +200 |

**Total estimate:** ~2500 LOC across ~12 commits.

## 5. Risks / open questions for Ilya

1. **Hierarchy decision:** Holocron has domains → projects → threads. Dwellium has DOMAINS as a flat list. Do we keep Dwellium's flat domain model, or import the full 3-tier hierarchy? (Sub-decision: if 3-tier, do projects/threads get their own backend storage?)
2. **Replace or augment FileManager widget?** Should the new FileExplorer fully replace the existing `FileManager.tsx` popup widget, or live alongside it (left-rail = navigation, FileManager popup = bulk operations)?
3. **What does "lock the hierarchy" mean operationally?** Two interpretations: (a) UI-only — disable drag/rename when locked but allow new files; (b) Backend-enforced — read-only mode on the entire `/api/files/*` namespace.
4. **Screenshot-paste backend:** Reuse `/api/scribe/images` (already exists from Scribe DnD Phase B) or add a separate `/api/files/upload-screenshot`?
5. **Domain vs project paths:** Holocron uses absolute disk paths. Dwellium's `/api/files/*` namespace is server-relative. We'll use `~/.dwellium/files/<userId>/...` as the user's root and represent all paths as relative-to-root strings.

## 6. Acceptance criteria (Cycle 12)

Manual walk-through items to verify before merging to main:

1. FileExplorer panel renders in left rail, tree expansion state persists across reload
2. Drag a file from Finder onto an explorer folder → file appears in that folder
3. Drag a file FROM the explorer into a Scribe document → file content (or markdown link) inserts at drop point
4. Drag a file from one explorer folder to another → moves (default) or copies (alt-drag)
5. Multi-select via Cmd+click → drag → all selected files move together; ghost element shows count
6. Double-click filename → inline rename → server-side rename succeeds + UI updates
7. Right-click file → context menu with Rename / Move / Delete / Duplicate
8. Cmd+V with an image in clipboard → uploaded + appears in current folder
9. Lock hierarchy → drag/rename disabled (visual indicator), unlocked → restored
10. Dual-mode toggle → tree view vs flat view (sorted by date) switches without losing selection
11. WCAG AA accessibility audit passes (axe-core); keyboard navigation works (Tab/Arrow/Enter)

## 7. Next step (Cycle 2)

Scaffold the `FileExplorer/` component directory + register the panel + wire empty store. No data fetching yet — just verify the panel mounts in the left rail and the per-user expansion state persists. Smallest possible first commit so we can verify before deeper changes.
