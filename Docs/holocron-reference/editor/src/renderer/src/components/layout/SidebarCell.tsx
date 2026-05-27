import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { DragEvent } from 'react'
import { useSidebarStore } from '../../store/sidebarStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useScribeStore } from '../../store/scribeStore'
import { useDomainesStore, type SortMode } from '../../store/domainesStore'
import { subscribeSidebarRefresh, triggerSidebarRefresh } from '../../utils/sidebarEvents'
import {
  IconFile, IconFolder, IconFolderOpen,
  IconBack, IconHome, IconCollapse, IconExpand,
  IconNewFile, IconNewFolder, IconClose,
} from '../Icons'

// ── Inline chevron — rotates on expand, never renders as ✕ ──────────────────
function ChevronIcon({ expanded }: { expanded: boolean }): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      style={{
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
        flexShrink: 0,
      }}
    >
      <path
        d="M4 2.5L7.5 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
import type { FsEntry } from '../../types/ipc'

// ─── pure helpers ────────────────────────────────────────────────────────────

interface FlatEntry { entry: FsEntry; depth: number }

function flattenEntries(
  entries: FsEntry[],
  expandedPaths: string[],
  dirContents: Record<string, FsEntry[]>,
  depth = 0,
): FlatEntry[] {
  const result: FlatEntry[] = []
  for (const entry of entries) {
    result.push({ entry, depth })
    if (entry.type === 'dir' && expandedPaths.includes(entry.path)) {
      const children = dirContents[entry.path]
      if (children) {
        for (const n of flattenEntries(children, expandedPaths, dirContents, depth + 1)) {
          result.push(n)
        }
      }
    }
  }
  return result
}

/** Folders-first ordering, then by user preference. Used both at fetch time
 *  (loadDir) and at render time (so toggling sort doesn't require a refetch
 *  of every expanded subdirectory). */
function sortFsEntries(arr: FsEntry[], mode: SortMode): FsEntry[] {
  return [...arr].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    if (mode === 'name') return a.name.localeCompare(b.name)
    return b.mtime - a.mtime  // newest first
  })
}

function getFileBadge(name: string): { label: string; color: string; bg: string; border: string } | null {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    '.md':       { label: 'MD',   color: '#00ff88', bg: '#001a0d', border: '#00ff8840' },
    '.markdown': { label: 'MD',   color: '#00ff88', bg: '#001a0d', border: '#00ff8840' },
    '.pdf':      { label: 'PDF',  color: '#ff2d78', bg: '#1a0000', border: '#ff2d7840' },
    '.txt':      { label: 'TXT',  color: '#8a8a9a', bg: '#1a1a1a', border: '#2a2a2a' },
    '.json':     { label: 'JSON', color: '#ffd60a', bg: '#1a1500', border: '#ffd60a40' },
    '.docx':     { label: 'DOCX', color: '#00d4ff', bg: '#001020', border: '#00d4ff40' },
  }
  return map[ext] ?? null
}

interface ContextMenuState { x: number; y: number; entry: FsEntry }
interface RenamingState { path: string; name: string; isNew?: boolean }

// ─── component ───────────────────────────────────────────────────────────────

export function SidebarCell({ cellId, canClose }: { cellId: string; canClose: boolean }): JSX.Element {
  const { cells, setCellPath, toggleExpand, clearExpanded, setExpandedPaths, removeCell, addCell } = useSidebarStore()
  const { config } = useSettingsStore()
  // Active-in-Scribe path drives the yellow accent on the file-tree row.
  // Different signal from `isSelected` (keyboard nav) — when both apply on
  // the same row, the yellow active-in-Scribe accent wins.
  const activeFilePath = useScribeStore((s) => s.activeFilePath)

  // Persisted sort preference for the file/folder navigation tree. Shared
  // across all cells (it's a UI pref, not per-cell). Toggling re-sorts the
  // already-loaded entries in render-time memos so we don't refetch from
  // disk just to switch sort order.
  const sortMode    = useDomainesStore((s) => s.sortSidebar)
  const setSortMode = useDomainesStore((s) => s.setSortSidebar)

  const cell = cells.find((c) => c.id === cellId)
  const currentPath = cell?.currentPath ?? ''
  const expandedPaths = cell?.expandedPaths ?? []
  // Hard-stop chain: thread → project → projectsRoot. The cell can never
  // navigate above whichever of these is the most-specific path that's set.
  const root = config.activeThreadPath || config.activeProjectPath || config.projectsRoot || ''

  const [entries, setEntries] = useState<FsEntry[]>([])
  const [dirContents, setDirContents] = useState<Record<string, FsEntry[]>>({})
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [emptyCtxMenu, setEmptyCtxMenu] = useState<{ x: number; y: number } | null>(null)
  // P3-B: per-file convertibility check, refreshed when context menu opens.
  const [ctxConvert, setCtxConvert] = useState<{ convertible: boolean; isImage: boolean }>({ convertible: false, isImage: false })
  const [renaming, setRenaming] = useState<RenamingState | null>(null)
  // Session 6 warmup — Move-to-thread picker + transient toast. The toast is
  // local (no global toast system yet — see Re-ingest's `window.alert(msg)`
  // path which we explicitly do better than here); auto-clears after 3s.
  const [movingFile, setMovingFile] = useState<{ path: string; name: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [showPlusFor, setShowPlusFor] = useState<string | null>(null)
  const [externalRefreshKey, setExternalRefreshKey] = useState(0)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null)

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  // Keydown handlers below need access to flatEntries, but flatEntries is
  // computed later in the function body — using it directly creates a TDZ
  // on the dep array. Ref-bridge keeps the effect's closure stable AND lets
  // it read the current value at event time.
  const flatEntriesRef = useRef<FlatEntry[]>([])

  // ── data loading ──────────────────────────────────────────────────────────

  const loadDir = useCallback(async (dirPath: string): Promise<FsEntry[]> => {
    try {
      const result = await window.electronAPI.fsReaddir(dirPath)
      return sortFsEntries(result, sortMode)
    } catch {
      return []
    }
  }, [sortMode])

  const refreshCurrent = useCallback(async (): Promise<void> => {
    if (!currentPath) return
    const loaded = await loadDir(currentPath)
    setEntries(loaded)
  }, [currentPath, loadDir])

  const navigate = useCallback(async (toPath: string): Promise<void> => {
    // Containment guard: refuse anything above the hard stop.
    if (root && toPath !== root && !toPath.startsWith(root + '/')) return
    setCellPath(cellId, toPath)
    setDirContents({})
    setSelectedPaths([])
    setLastSelectedPath(null)
    const loaded = await loadDir(toPath)
    setEntries(loaded)
  }, [cellId, loadDir, setCellPath, root])

  useEffect(() => { void refreshCurrent() }, [refreshCurrent])

  useEffect(() => subscribeSidebarRefresh(() => setExternalRefreshKey((k) => k + 1)), [])

  useEffect(() => {
    if (externalRefreshKey === 0) return
    void refreshCurrent()
    setDirContents((prev) => {
      const paths = Object.keys(prev)
      if (paths.length === 0) return prev
      void Promise.all(paths.map(async (p) => ({ p, loaded: await loadDir(p) }))).then((results) => {
        setDirContents((cur) => {
          const next = { ...cur }
          for (const { p, loaded } of results) next[p] = loaded
          return next
        })
      })
      return prev
    })
  }, [externalRefreshKey, refreshCurrent, loadDir])

  useEffect(() => {
    const missing = expandedPaths.filter((p) => !(p in dirContents))
    if (missing.length === 0) return
    void Promise.all(missing.map(async (p) => ({ path: p, loaded: await loadDir(p) }))).then((results) => {
      setDirContents((prev) => {
        const next = { ...prev }
        for (const { path, loaded } of results) next[path] = loaded
        return next
      })
    })
  }, [expandedPaths, dirContents, loadDir])

  // ── cleanup click timer on unmount ────────────────────────────────────────

  useEffect(() => {
    return () => { if (clickTimerRef.current) clearTimeout(clickTimerRef.current) }
  }, [])

  // ── keyboard handlers ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Don't intercept while user is typing in any input/textarea (incl. inline rename).
      const target = e.target as HTMLElement | null
      const inEditableField =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if (e.key === 'Escape') {
        setSelectedPaths([]); setLastSelectedPath(null)
        return
      }

      if (inEditableField || renaming) return

      // Mass delete (Fix 1): Delete OR Cmd+Backspace OR plain Backspace
      // when ≥1 file is selected. Single-select uses the same flow with
      // its own confirmation copy; multi-select shows the bulk dialog.
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPaths.length > 0) {
        e.preventDefault()
        if (selectedPaths.length === 1) {
          // Reuse the single-file path so the existing per-item confirm fires.
          const path = selectedPaths[0]
          const flat = flatEntriesRef.current.find((fe) => fe.entry.path === path)
          if (flat) void handleDelete(flat.entry)
        } else {
          void handleMassDelete(selectedPaths)
        }
        return
      }

      // Rename on Return (Fix 3): single selection enters inline rename.
      if (e.key === 'Enter' && selectedPaths.length === 1) {
        e.preventDefault()
        const path = selectedPaths[0]
        const flat = flatEntriesRef.current.find((fe) => fe.entry.path === path)
        if (flat) setRenaming({ path: flat.entry.path, name: flat.entry.name })
        return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedPaths, renaming]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent): void => {
      const menu = document.getElementById('scm')
      if (menu && !menu.contains(e.target as Node)) setContextMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  useEffect(() => {
    if (!emptyCtxMenu) return
    const handler = (e: MouseEvent): void => {
      const menu = document.getElementById('scm-empty')
      if (menu && !menu.contains(e.target as Node)) setEmptyCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [emptyCtxMenu])

  // P3-B: refresh convertibility info when context menu opens on a file.
  useEffect(() => {
    if (!contextMenu || contextMenu.entry.type !== 'file') {
      setCtxConvert({ convertible: false, isImage: false })
      return
    }
    let cancelled = false
    void window.electronAPI.convertCheck(contextMenu.entry.path).then((r) => {
      if (!cancelled) setCtxConvert(r)
    }).catch(() => { if (!cancelled) setCtxConvert({ convertible: false, isImage: false }) })
    return () => { cancelled = true }
  }, [contextMenu])

  // Cmd+V → paste clipboard image into the cell's directory. Only fires when
  // focus is somewhere within this cell's wrapper (so multi-cell sidebars
  // route the paste to the cell the user last interacted with, and so we
  // don't intercept pastes meant for the editor or chat). If the active
  // element is an editable input/textarea/contenteditable, the default paste
  // is allowed through untouched.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const isPaste = (e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V') && !e.shiftKey
      if (!isPaste) return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
      if (!wrapperRef.current || !wrapperRef.current.contains(ae)) return
      e.preventDefault()
      void handlePasteImage()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [currentPath]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!renaming) return
    setTimeout(() => {
      const el = renameInputRef.current
      if (!el) return
      el.focus()
      if (renaming.isNew) {
        el.setSelectionRange(0, 0)
        return
      }
      // Pre-select the basename without extension (Finder-style):
      // `foo.md` → selects `foo`. Folders (no dot) → selects everything.
      const dotIdx = renaming.name.lastIndexOf('.')
      if (dotIdx > 0) el.setSelectionRange(0, dotIdx)
      else el.select()
    }, 0)
  }, [renaming?.path]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── derived values ────────────────────────────────────────────────────────

  const isAtRoot = !currentPath || currentPath === root
  const currentFolderName = currentPath ? (currentPath.split('/').pop() ?? currentPath) : ''
  // Re-sort at render time whenever sortMode changes — avoids a disk refetch
  // for every expanded subdir when the user toggles the sort.
  const sortedEntries = useMemo(() => sortFsEntries(entries, sortMode), [entries, sortMode])
  const sortedDirContents = useMemo(() => {
    const out: Record<string, FsEntry[]> = {}
    for (const k of Object.keys(dirContents)) {
      out[k] = sortFsEntries(dirContents[k] ?? [], sortMode)
    }
    return out
  }, [dirContents, sortMode])
  const flatEntries = flattenEntries(sortedEntries, expandedPaths, sortedDirContents, 0)
  // Sync the ref so the keydown effect (declared above flatEntries) reads
  // the latest list at event-handler time.
  flatEntriesRef.current = flatEntries

  // ── safe wrappers — catch all async errors so void is safe ──────────────────

  const navigateToFolder = async (path: string): Promise<void> => {
    try {
      await navigate(path)
    } catch (err) {
      console.error('[SidebarCell] navigation error:', err)
    }
  }

  const openFileInScribe = async (entry: FsEntry): Promise<void> => {
    try {
      const result = await window.electronAPI.readFile(entry.path)
      useScribeStore.getState().openFileWithContent({ path: entry.path, name: entry.name }, result.content)
    } catch (err) {
      console.error('[SidebarCell] open file error:', err)
    }
  }

  /** VS Code-style single-click open: opens the file into the preview slot,
   *  replacing whatever was previewing. Fast path when the file is already
   *  open — skip the disk read; openInPreview just activates the tab without
   *  touching its existing preview/permanent state. */
  const openFileInScribePreview = async (entry: FsEntry): Promise<void> => {
    const store = useScribeStore.getState()
    if (store.openFiles.some((f) => f.path === entry.path)) {
      store.openInPreview({ path: entry.path, name: entry.name }, '')
      return
    }
    try {
      const result = await window.electronAPI.readFile(entry.path)
      useScribeStore.getState().openInPreview({ path: entry.path, name: entry.name }, result.content)
    } catch (err) {
      console.error('[SidebarCell] open preview error:', err)
    }
  }

  // ── navigation ────────────────────────────────────────────────────────────

  const goBack = (): void => {
    if (isAtRoot) return
    const parent = currentPath.split('/').slice(0, -1).join('/')
    if (parent) void navigateToFolder(parent)
  }

  // ── click handler — second click within 250ms is a double-click ─────────────

  const handleClick = (e: React.MouseEvent, entry: FsEntry, flatIdx: number): void => {
    e.stopPropagation()

    if (entry.type === 'file') {
      // Files: bare single click opens in preview (VS Code-style). Modifier
      // clicks are pure multi-select (no scribe-open) so the user can build
      // a selection without flooding scribe with previews.
      if (e.metaKey) {
        setSelectedPaths((prev) =>
          prev.includes(entry.path) ? prev.filter((p) => p !== entry.path) : [...prev, entry.path]
        )
        setLastSelectedPath(entry.path)
      } else if (e.shiftKey && lastSelectedPath !== null) {
        const lastIdx = flatEntries.findIndex((fe) => fe.entry.path === lastSelectedPath)
        const [from, to] = lastIdx <= flatIdx ? [lastIdx, flatIdx] : [flatIdx, lastIdx]
        const range = flatEntries.slice(from, to + 1).map((fe) => fe.entry.path)
        setSelectedPaths((prev) => Array.from(new Set([...prev, ...range])))
      } else {
        setSelectedPaths([entry.path])
        setLastSelectedPath(entry.path)
        // The browser fires onClick twice during a double-click before
        // onDoubleClick. openInPreview is idempotent for an already-open
        // tab so the second click is a no-op; then onDoubleClick promotes.
        void openFileInScribePreview(entry)
      }
      return
    }

    // Folders: 250ms timer to distinguish single click (select) from double click (navigate)
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      void navigateToFolder(entry.path)
      return
    }

    const isMeta = e.metaKey
    const isShift = e.shiftKey
    const capturedFlat = flatEntries
    const capturedLast = lastSelectedPath

    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      if (isMeta) {
        setSelectedPaths((prev) =>
          prev.includes(entry.path) ? prev.filter((p) => p !== entry.path) : [...prev, entry.path]
        )
        setLastSelectedPath(entry.path)
      } else if (isShift && capturedLast !== null) {
        const lastIdx = capturedFlat.findIndex((fe) => fe.entry.path === capturedLast)
        const [from, to] = lastIdx <= flatIdx ? [lastIdx, flatIdx] : [flatIdx, lastIdx]
        const range = capturedFlat.slice(from, to + 1).map((fe) => fe.entry.path)
        setSelectedPaths((prev) => Array.from(new Set([...prev, ...range])))
      } else {
        setSelectedPaths([entry.path])
        setLastSelectedPath(entry.path)
      }
    }, 250)
  }

  // ── open entry (context menu) ─────────────────────────────────────────────

  const openEntry = async (entry: FsEntry): Promise<void> => {
    if (entry.type === 'dir') {
      await navigateToFolder(entry.path)
    } else {
      await openFileInScribe(entry)
    }
  }

  // ── expand / collapse ─────────────────────────────────────────────────────

  const handleToggleExpand = async (entry: FsEntry): Promise<void> => {
    toggleExpand(cellId, entry.path)
    if (!expandedPaths.includes(entry.path) && !(entry.path in dirContents)) {
      const loaded = await loadDir(entry.path)
      setDirContents((prev) => ({ ...prev, [entry.path]: loaded }))
    }
  }

  const collapseAll = (): void => {
    clearExpanded(cellId)
    setDirContents({})
  }

  // CHANGE 1: Smart ↕ — home / collapse-all / expand-all based on state.
  //
  // Session 7 fix #3 — Expand-all now recurses through every subfolder,
  // not just the top-level entries. BFS over the directory tree with a
  // bounded-concurrency batch (16 loadDir calls in flight at once) and a
  // visited set to short-circuit symlink cycles. The 5000-dir cap mirrors
  // the ingest:sync-workspace runaway guard.
  const handleToggleAction = async (): Promise<void> => {
    if (!isAtRoot) {
      await navigateToFolder(root)
    } else if (expandedPaths.length > 0) {
      collapseAll()
    } else {
      const topDirs = entries.filter((e) => e.type === 'dir')
      if (topDirs.length === 0) return

      const MAX_DIRS = 5000
      const BATCH    = 16
      const allDirPaths: string[] = []
      const newContents: Record<string, FsEntry[]> = {}
      const queue: string[] = topDirs.map((d) => d.path)
      const visited = new Set<string>(queue)

      while (queue.length > 0 && allDirPaths.length < MAX_DIRS) {
        const batch = queue.splice(0, BATCH)
        const results = await Promise.all(
          batch.map(async (p) => ({ path: p, loaded: await loadDir(p) }))
        )
        for (const { path, loaded } of results) {
          allDirPaths.push(path)
          newContents[path] = loaded
          for (const e of loaded) {
            if (e.type === 'dir' && !visited.has(e.path)) {
              visited.add(e.path)
              queue.push(e.path)
            }
          }
        }
      }
      setDirContents((prev) => ({ ...prev, ...newContents }))
      setExpandedPaths(cellId, allDirPaths)
    }
  }

  const toggleActionTitle = !isAtRoot
    ? 'Go to root'
    : expandedPaths.length > 0
    ? 'Collapse all'
    : 'Expand all'

  // ── file creation ─────────────────────────────────────────────────────────

  const refreshDirContents = async (dirPath: string): Promise<void> => {
    const loaded = await loadDir(dirPath)
    setDirContents((prev) => ({ ...prev, [dirPath]: loaded }))
  }

  const handleNewFile = async (): Promise<void> => {
    const r = await window.electronAPI.fsCreateFile(currentPath, 'untitled.md')
    if (r.ok) {
      await refreshCurrent()
      setRenaming({ path: r.filePath, name: '', isNew: true })
    }
  }

  // Paste clipboard image into the cell's currentPath as a PNG. Triggered by
  // Cmd+V (when sidebar has focus) or right-click → Paste image. Drops the
  // user straight into rename mode so they can name it on the spot, like
  // pasting an image into Obsidian.
  const handlePasteImage = async (): Promise<void> => {
    if (!currentPath) return
    const r = await window.electronAPI.fsPasteClipboardImage(currentPath)
    if (r.ok && r.filePath && r.name) {
      await refreshCurrent()
      setRenaming({ path: r.filePath, name: r.name })
    }
  }

  const handleNewFolder = async (): Promise<void> => {
    const r = await window.electronAPI.fsCreateDir(currentPath, 'New Folder')
    if (r.ok) {
      await refreshCurrent()
      setRenaming({ path: r.dirPath, name: 'New Folder' })
    }
  }

  const handleNewFileInside = async (dirPath: string): Promise<void> => {
    const r = await window.electronAPI.fsCreateFile(dirPath, 'untitled.md')
    if (r.ok) {
      if (!expandedPaths.includes(dirPath)) toggleExpand(cellId, dirPath)
      await refreshDirContents(dirPath)
      setRenaming({ path: r.filePath, name: '', isNew: true })
    }
    setContextMenu(null)
  }

  const handleNewFolderInside = async (dirPath: string): Promise<void> => {
    const r = await window.electronAPI.fsCreateDir(dirPath, 'New Folder')
    if (r.ok) {
      if (!expandedPaths.includes(dirPath)) toggleExpand(cellId, dirPath)
      await refreshDirContents(dirPath)
      setRenaming({ path: r.dirPath, name: 'New Folder' })
    }
    setContextMenu(null)
  }

  // ── rename / delete ───────────────────────────────────────────────────────

  const applyDefaultExtension = (name: string): string => {
    if (!name) return 'untitled.md'
    if (name.lastIndexOf('.') > 0) return name
    return name + '.md'
  }

  const handleRenameSubmit = async (): Promise<void> => {
    if (!renaming) return
    let newName = renaming.name.trim()
    if (renaming.isNew) newName = applyDefaultExtension(newName)
    if (!newName) { setRenaming(null); return }
    const dir = renaming.path.split('/').slice(0, -1).join('/')
    const newPath = dir + '/' + newName
    if (newPath !== renaming.path) {
      await window.electronAPI.fsRename(renaming.path, newPath)
      const es = useScribeStore.getState()
      if (es.openFiles.some((f) => f.path === renaming.path)) es.renameOpenFile(renaming.path, newPath)
      setDirContents({})
      await refreshCurrent()
      triggerSidebarRefresh()
    }
    setRenaming(null)
  }

  const handleDelete = async (entry: FsEntry): Promise<void> => {
    setContextMenu(null)
    if (!window.confirm(`Delete "${entry.name}"?`)) return
    await window.electronAPI.fsDelete(entry.path)
    console.log(`[Files] Deleted: ${entry.name}`)
    setDirContents((prev) => { const n = { ...prev }; delete n[entry.path]; return n })
    await refreshCurrent()
    triggerSidebarRefresh()
  }

  const handleMassDelete = async (paths: string[]): Promise<void> => {
    setContextMenu(null)
    if (paths.length === 0) return
    const noun = paths.length === 1 ? 'item' : 'items'
    if (!window.confirm(`Delete ${paths.length} ${noun}? This cannot be undone.`)) return
    for (const p of paths) {
      try {
        await window.electronAPI.fsDelete(p)
        console.log(`[Files] Deleted: ${p.split('/').pop() ?? p}`)
      } catch (err) {
        console.error(`[Files] Delete failed for ${p}:`, (err as Error).message)
      }
    }
    setDirContents((prev) => {
      const n = { ...prev }
      for (const p of paths) delete n[p]
      return n
    })
    setSelectedPaths([])
    setLastSelectedPath(null)
    await refreshCurrent()
    triggerSidebarRefresh()
  }

  // ── drag-and-drop ─────────────────────────────────────────────────────────

  const handleDragStart = (e: DragEvent<HTMLDivElement>, entry: FsEntry): void => {
    const paths = selectedPaths.includes(entry.path) && selectedPaths.length > 1
      ? selectedPaths : [entry.path]
    e.dataTransfer.setData('text/plain', paths.join('\n'))
    e.dataTransfer.setData('application/x-holocron-path', JSON.stringify({
      name: entry.name,
      path: entry.path,
      isDirectory: entry.type === 'dir',
    }))
    e.dataTransfer.effectAllowed = 'copyMove'
    if (paths.length > 1) {
      const ghost = document.createElement('div')
      ghost.style.cssText = 'position:fixed;top:-100px;background:#111111;color:#00d4ff;border-radius:6px;padding:4px 10px;font-size:12px;font-family:monospace;pointer-events:none;border:1px solid #00d4ff40;'
      ghost.textContent = `${paths.length} items`
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, -10, -10)
      requestAnimationFrame(() => { if (document.body.contains(ghost)) document.body.removeChild(ghost) })
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>, targetPath: string): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
    setDragOver(targetPath)
  }

  const execDrop = async (e: DragEvent<HTMLDivElement>, destDir: string): Promise<void> => {
    const raw = e.dataTransfer.getData('text/plain')
    if (!raw) return
    const srcPaths = raw.split('\n').filter(Boolean)
    const isCopy = e.altKey
    for (const src of srcPaths) {
      if (isCopy) await window.electronAPI.fsCopy(src, destDir)
      else await window.electronAPI.fsMove(src, destDir)
    }
    setSelectedPaths([])
    setDirContents({})
    await refreshCurrent()
    triggerSidebarRefresh()
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>, targetEntry: FsEntry | null): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(null)
    let destDir: string
    if (targetEntry?.type === 'dir') destDir = targetEntry.path
    else if (targetEntry) destDir = targetEntry.path.split('/').slice(0, -1).join('/')
    else destDir = currentPath
    await execDrop(e, destDir)
  }

  const handleContainerDrop = async (e: DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault()
    setDragOver(null)
    await execDrop(e, currentPath)
  }

  // ── hover [+] button ──────────────────────────────────────────────────────

  const handleMouseEnter = (entryPath: string): void => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => setShowPlusFor(entryPath), 600)
  }

  const handleMouseLeave = (): void => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setShowPlusFor(null)
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      tabIndex={-1}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
        backgroundColor: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-subtle)',
        borderLeft: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        borderRadius: '8px 0 0 8px',
        margin: '4px 0 4px 4px',
        outline: 'none',
      }}
      // Take focus on click so Cmd+V paste targets THIS cell. Skip inputs so
      // we don't fight the rename field for focus.
      onMouseDown={(e) => {
        const t = e.target as HTMLElement
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
        wrapperRef.current?.focus()
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move' }}
      onDrop={(e) => void handleContainerDrop(e)}
    >
      {/* Header */}
      <div style={{
        height: 36, display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px',
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        {/* ‹ back */}
        <HBtn
          title={isAtRoot ? 'At root' : 'Go up one level'}
          onClick={goBack}
          disabled={isAtRoot}
        >
          <IconBack size={14} />
        </HBtn>

        {/* current folder name */}
        <span
          title={currentPath}
          style={{
            flex: 1, fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
            color: isAtRoot ? 'var(--text-secondary)' : 'var(--neon-blue)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            minWidth: 0, padding: '0 4px',
          }}
        >
          {currentFolderName}
        </span>

        <HBtn title="New File" onClick={() => void handleNewFile()}><IconNewFile size={14} /></HBtn>
        <HBtn title="New Folder" onClick={() => void handleNewFolder()}><IconNewFolder size={14} /></HBtn>
        <HBtn
          title={sortMode === 'name'
            ? 'Sort: Name A→Z (click to switch to Last modified)'
            : 'Sort: Last modified (click to switch to Name A→Z)'}
          onClick={() => setSortMode(sortMode === 'name' ? 'mtime' : 'name')}
        >
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
            letterSpacing: '0.04em',
          }}>
            {sortMode === 'name' ? 'A↓' : '⏱'}
          </span>
        </HBtn>
        <HBtn title={toggleActionTitle} onClick={() => void handleToggleAction()}>
          {!isAtRoot
            ? <IconHome size={14} />
            : expandedPaths.length > 0
            ? <IconCollapse size={14} />
            : <IconExpand size={14} />
          }
        </HBtn>

        {canClose && (
          <button
            onClick={() => removeCell(cellId)}
            title="Close panel"
            style={{ flexShrink: 0, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4, color: 'var(--text-dim)', marginLeft: 1 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--neon-pink)'; e.currentTarget.style.background = 'var(--bg-card-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'none' }}
          >
            <IconClose size={10} />
          </button>
        )}
      </div>

      {/* Entry list */}
      <div
        style={{ flex: 1, overflowY: 'auto' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) { setSelectedPaths([]); setLastSelectedPath(null) }
        }}
        onContextMenu={(e) => {
          // Only show the empty-area menu when right-clicking on truly-empty
          // space — not when an entry's onContextMenu fires and bubbles up.
          if (e.target !== e.currentTarget) return
          e.preventDefault()
          setEmptyCtxMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        {flatEntries.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'monospace' }}>
            empty
          </div>
        )}

        {flatEntries.map(({ entry, depth }, flatIdx) => {
          const isExpanded = expandedPaths.includes(entry.path)
          const isDragTarget = dragOver === entry.path
          const isRenaming = renaming?.path === entry.path
          const isSelected = selectedPaths.includes(entry.path)
          const isActiveInScribe = entry.type === 'file' && entry.path === activeFilePath
          const badge = entry.type === 'file' ? getFileBadge(entry.name) : null

          // Yellow active-in-Scribe accent wins over keyboard selection + drag
          // target. Background and border-left are computed off this priority.
          const bgColor = isActiveInScribe
            ? 'rgba(255,214,10,0.10)'
            : isDragTarget
            ? 'rgba(0,212,255,0.08)'
            : isSelected
            ? 'var(--bg-selected)'
            : 'transparent'
          const borderLeftStyle = isActiveInScribe
            ? '2px solid var(--neon-yellow)'
            : isSelected
            ? '2px solid var(--neon-blue)'
            : isDragTarget
            ? '2px solid rgba(0,212,255,0.4)'
            : '2px solid transparent'
          const lockBg = isActiveInScribe || isDragTarget || isSelected

          return (
            <div
              key={entry.path}
              draggable={!isRenaming}
              onClick={(e) => handleClick(e, entry, flatIdx)}
              onDoubleClick={(e) => {
                if (entry.type !== 'file' || isRenaming) return
                e.stopPropagation()
                void openFileInScribe(entry)
              }}
              onDragStart={(e) => handleDragStart(e, entry)}
              onDragOver={(e) => handleDragOver(e, entry.path)}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => void handleDrop(e, entry)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, entry }) }}
              onMouseEnter={() => handleMouseEnter(entry.path)}
              onMouseLeave={handleMouseLeave}
              style={{
                height: 28, display: 'flex', alignItems: 'center',
                paddingLeft: 6 + depth * 16, paddingRight: 6, gap: 4,
                cursor: 'default',
                backgroundColor: bgColor,
                borderLeft: borderLeftStyle,
                borderTop: isDragTarget ? '1px solid rgba(0,212,255,0.25)' : '1px solid transparent',
                transition: 'background 80ms',
                userSelect: 'none',
              }}
              onMouseOver={(e) => { if (!lockBg) e.currentTarget.style.backgroundColor = 'var(--bg-card)' }}
              onMouseOut={(e) => { if (!lockBg) e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {/* expand arrow — single rotating chevron */}
              {entry.type === 'dir' ? (
                <button
                  onClick={(e) => { e.stopPropagation(); void handleToggleExpand(entry) }}
                  style={{ flexShrink: 0, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
                >
                  <ChevronIcon expanded={isExpanded} />
                </button>
              ) : (
                <span style={{ flexShrink: 0, width: 16 }} />
              )}

              {/* file/folder icon */}
              <span style={{
                flexShrink: 0,
                color: isActiveInScribe
                  ? 'var(--neon-yellow)'
                  : entry.type === 'dir'
                  ? (isExpanded ? '#7dd3fc' : 'var(--text-primary)')
                  : 'var(--text-primary)',
                display: 'flex', alignItems: 'center',
              }}>
                {entry.type === 'dir'
                  ? isExpanded ? <IconFolderOpen size={14} /> : <IconFolder size={14} />
                  : <IconFile size={14} />}
              </span>

              {/* Inline rename input */}
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renaming.name}
                  placeholder={renaming.isNew ? entry.name : undefined}
                  onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void handleRenameSubmit() }
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  onBlur={() => void handleRenameSubmit()}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-base)', border: '1px solid var(--neon-blue)', borderRadius: 3, padding: '1px 5px', outline: 'none', fontFamily: 'monospace', minWidth: 0, boxShadow: '0 0 0 2px rgba(0,212,255,0.12)' }}
                />
              ) : (
                <span style={{
                  flex: 1, fontSize: 12,
                  color: isActiveInScribe
                    ? 'var(--neon-yellow)'
                    : isSelected
                    ? 'var(--text-primary)'
                    : entry.type === 'dir'
                    ? isExpanded ? '#7dd3fc' : 'var(--text-secondary)'
                    : 'var(--text-primary)',
                  fontWeight: isActiveInScribe ? 600 : 'normal',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                }}>
                  {entry.name}
                </span>
              )}

              {badge && !isRenaming && (
                <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, fontFamily: 'monospace', color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 4, padding: '1px 4px', letterSpacing: '0.04em' }}>
                  {badge.label}
                </span>
              )}

              {entry.type === 'dir' && showPlusFor === entry.path && !isRenaming && (
                <button
                  onClick={(e) => { e.stopPropagation(); addCell(entry.type === 'dir' ? entry.path : entry.path.split('/').slice(0, -1).join('/')) }}
                  title="Open in new panel"
                  style={{ flexShrink: 0, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card-hover)', border: '1px solid var(--border-default)', borderRadius: 3, cursor: 'pointer', fontSize: 11, color: 'var(--neon-blue)', padding: 0 }}
                >
                  +
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Context menu portal */}
      {contextMenu && createPortal(
        <div
          id="scm"
          style={{
            position: 'fixed',
            left: Math.min(contextMenu.x, window.innerWidth - 190),
            top: Math.min(contextMenu.y, window.innerHeight - 240),
            zIndex: 99999,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 8, padding: '4px 0', minWidth: 175,
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
          }}
        >
          {contextMenu.entry.type === 'dir' ? (
            <>
              <CMI label="Open in Split" onClick={() => { addCell(contextMenu.entry.path); setContextMenu(null) }} />
              <CMI label="New File Inside" onClick={() => void handleNewFileInside(contextMenu.entry.path)} />
              <CMI label="New Folder Inside" onClick={() => void handleNewFolderInside(contextMenu.entry.path)} />
              <CMDiv />
              <CMI label="Copy Path" onClick={() => { void navigator.clipboard.writeText(contextMenu.entry.path); setContextMenu(null) }} />
              <CMI label="Rename" onClick={() => { setRenaming({ path: contextMenu.entry.path, name: contextMenu.entry.name }); setContextMenu(null) }} />
              <CMDiv />
              {selectedPaths.length > 1 && selectedPaths.includes(contextMenu.entry.path) ? (
                <CMI label={`Delete ${selectedPaths.length} items`} danger onClick={() => void handleMassDelete(selectedPaths)} />
              ) : (
                <CMI label="Delete" danger onClick={() => void handleDelete(contextMenu.entry)} />
              )}
            </>
          ) : (
            <>
              <CMI label="Open" onClick={() => { void openEntry(contextMenu.entry); setContextMenu(null) }} />
              <CMI label="Copy Path" onClick={() => { void navigator.clipboard.writeText(contextMenu.entry.path); setContextMenu(null) }} />
              <CMI label="Rename" onClick={() => { setRenaming({ path: contextMenu.entry.path, name: contextMenu.entry.name }); setContextMenu(null) }} />
              <CMI
                label="Move to thread…"
                onClick={() => {
                  setMovingFile({ path: contextMenu.entry.path, name: contextMenu.entry.name })
                  setContextMenu(null)
                }}
              />
              <CMDiv />
              <CMI
                label="Re-ingest"
                onClick={async () => {
                  const target = contextMenu.entry.path
                  setContextMenu(null)
                  let res: { ok: boolean; ingested: boolean; tagCount?: number; relationshipCount?: number; error?: string }
                  try {
                    res = await window.electronAPI.ragIngestManual(target)
                  } catch (err) {
                    res = { ok: false, ingested: false, error: (err as Error).message }
                  }
                  let msg: string
                  if (!res.ok) {
                    msg = `Re-ingest skipped: ${res.error ?? 'unknown error'}`
                  } else if (!res.ingested) {
                    msg = 'No change — content matches the existing ingest (skipped).'
                  } else {
                    msg = `Re-ingested. Tags: ${res.tagCount ?? 0}. Relationships: ${res.relationshipCount ?? 0}.`
                  }
                  // v1 feedback via alert(). The editorStore has a workspaceNotifications
                  // array but no renderer for it; replacing alert() with a real toast
                  // component is a future cleanup.
                  // eslint-disable-next-line no-alert
                  window.alert(msg)
                }}
              />
              {/* P3-B: Convert to Markdown — single file, only if convertible */}
              {ctxConvert.convertible && !ctxConvert.isImage && (
                <>
                  <CMDiv />
                  <CMI
                    label="Convert to Markdown"
                    onClick={async () => {
                      const target = contextMenu.entry.path
                      setContextMenu(null)
                      await window.electronAPI.convertToMarkdown(target).catch(() => null)
                      triggerSidebarRefresh()
                    }}
                  />
                </>
              )}
              {ctxConvert.isImage && (
                <>
                  <CMDiv />
                  <CMI
                    label="Convert to Markdown (OCR)"
                    onClick={async () => {
                      const target = contextMenu.entry.path
                      setContextMenu(null)
                      // eslint-disable-next-line no-alert
                      if (!window.confirm('Image conversion is token-heavy. Proceed?')) return
                      await window.electronAPI.convertToMarkdown(target).catch(() => null)
                      triggerSidebarRefresh()
                    }}
                  />
                </>
              )}
              {/* P3-B: Convert All — when more than one file is selected */}
              {selectedPaths.length > 1 && (
                <CMI
                  label={`Convert All to Markdown (${selectedPaths.length})`}
                  onClick={async () => {
                    const targets = selectedPaths
                    setContextMenu(null)
                    await window.electronAPI.convertToMarkdownBatch(targets).catch(() => null)
                    triggerSidebarRefresh()
                  }}
                />
              )}
              <CMDiv />
              {selectedPaths.length > 1 && selectedPaths.includes(contextMenu.entry.path) ? (
                <CMI label={`Delete ${selectedPaths.length} items`} danger onClick={() => void handleMassDelete(selectedPaths)} />
              ) : (
                <CMI label="Delete" danger onClick={() => void handleDelete(contextMenu.entry)} />
              )}
            </>
          )}
        </div>,
        document.body,
      )}

      {/* Empty-area context menu — right-click on blank space in the entry
       *  list. Currently just hosts "Paste image"; can grow as needed. */}
      {emptyCtxMenu && createPortal(
        <div
          id="scm-empty"
          style={{
            position: 'fixed',
            left: Math.min(emptyCtxMenu.x, window.innerWidth - 190),
            top: Math.min(emptyCtxMenu.y, window.innerHeight - 80),
            zIndex: 99999,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 8, padding: '4px 0', minWidth: 175,
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
          }}
        >
          <CMI label="Paste image" onClick={() => { setEmptyCtxMenu(null); void handlePasteImage() }} />
        </div>,
        document.body,
      )}

      {/* Session 6 warmup — Move-to-thread picker. Modal lives at document.body
       *  via portal so it sits above every sidebar/editor layer regardless of
       *  the cell's stacking context. Confirm = call IPC + toast + close. The
       *  open file (if any) is closed in scribeStore after the move so the
       *  editor doesn't hold a stale path. */}
      {movingFile && createPortal(
        <MoveDocModal
          filePath={movingFile.path}
          fileName={movingFile.name}
          activeThreadPath={config.activeThreadPath ?? ''}
          onClose={() => setMovingFile(null)}
          onMoved={(threadName) => {
            // Close the file in Scribe if it was open — its path just changed.
            // Chokidar's unlink+add will repopulate the rag_documents row;
            // the user re-opens from the new location via the file tree or
            // Codex search.
            useScribeStore.getState().closeFile(movingFile.path)
            setMovingFile(null)
            setToast(`Moved to ${threadName}`)
            triggerSidebarRefresh()
            window.setTimeout(() => setToast(null), 3000)
          }}
        />,
        document.body,
      )}

      {/* Transient toast — bottom-center, 3s auto-dismiss. Mounted near the
       *  modal so a successful move flashes feedback even if the modal already
       *  closed. v1 — replace with a real toast system when one exists. */}
      {toast && createPortal(
        <div
          style={{
            position: 'fixed',
            left: '50%', bottom: 32, transform: 'translateX(-50%)',
            zIndex: 100000,
            background: 'var(--bg-card)',
            border: '1px solid var(--neon-blue)',
            borderRadius: 6, padding: '10px 18px',
            fontSize: 12, color: 'var(--text-primary)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}
        >
          {toast}
        </div>,
        document.body,
      )}
    </div>
  )
}

// ─── small sub-components ─────────────────────────────────────────────────────

function HBtn({
  title, onClick, disabled = false, children,
}: {
  title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        flexShrink: 0, width: 26, height: 26,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', borderRadius: 6,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text-dim)' : 'var(--text-secondary)',
        opacity: disabled ? 0.3 : 1,
        transition: 'color 100ms, background 100ms',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = disabled ? 'var(--text-dim)' : 'var(--text-secondary)' }}
    >
      {children}
    </button>
  )
}

function CMI({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '7px 14px', fontSize: 12, fontFamily: 'inherit',
        background: hovered ? 'var(--bg-card-hover)' : 'none', border: 'none',
        color: danger ? 'var(--neon-pink)' : hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function CMDiv(): JSX.Element {
  return <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '3px 0' }} />
}

// ─── Move-to-thread picker (Session 6 warmup) ─────────────────────────────
// Flat alphabetical list of every thread across every Domaine + Project,
// fetched on mount. Confirm = IPC move into <destThread>/References/ +
// callback. Chokidar handles the SQL reconciliation (unlink + add events)
// per the projectFs.moveDocumentToThread docstring.

interface ThreadPickRow {
  threadPath:  string
  threadName:  string
  projectName: string
  domaineName: string
}

function MoveDocModal({
  filePath, fileName, activeThreadPath, onClose, onMoved,
}: {
  filePath:          string
  fileName:          string
  activeThreadPath:  string
  onClose:           () => void
  onMoved:           (threadName: string, newPath: string) => void
}): JSX.Element {
  const [threads, setThreads] = useState<ThreadPickRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [query, setQuery]     = useState('')
  const [busy, setBusy]       = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void (async () => {
      setLoading(true); setError(null)
      try {
        const res = await window.electronAPI.docListThreadsFlat(activeThreadPath)
        if (!res.ok) setError(res.error ?? 'Failed to load thread list')
        setThreads(res.threads ?? [])
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [activeThreadPath])

  // Autofocus the search box on mount + close on Escape.
  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Filter — match against the breadcrumb so users can type any segment.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return threads
    return threads.filter((t) => {
      const crumb = `${t.domaineName} ${t.projectName} ${t.threadName}`.toLowerCase()
      return crumb.includes(q)
    })
  }, [threads, query])

  const handlePick = async (t: ThreadPickRow): Promise<void> => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await window.electronAPI.docMoveToThread(filePath, t.threadPath)
      if (!res.ok || !res.newPath) {
        setError(res.error ?? 'Move failed')
        setBusy(false)
        return
      }
      onMoved(t.threadName, res.newPath)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(540px, 90vw)', maxHeight: '70vh',
          background: 'var(--bg-card)', border: '1px solid var(--border-default)',
          borderRadius: 8, boxShadow: '0 18px 60px rgba(0,0,0,0.65)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Move to thread
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-dim)', wordBreak: 'break-all' }}>
            {fileName} <span style={{ color: 'var(--text-dim)' }}>→ thread root</span>
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by Domain · Project · Thread…"
            style={{
              width: '100%', height: 30, padding: '0 10px',
              background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)',
              borderRadius: 4, color: 'var(--text-primary)', fontSize: 12,
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '6px 0' }}>
          {loading && (
            <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-dim)' }}>Loading threads…</div>
          )}
          {!loading && error && (
            <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--neon-pink)' }}>{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-dim)' }}>
              {threads.length === 0
                ? 'No other threads found in the workspace.'
                : 'No threads match the filter.'}
            </div>
          )}
          {!loading && !error && filtered.map((t) => (
            <button
              key={t.threadPath}
              onClick={() => void handlePick(t)}
              disabled={busy}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', textAlign: 'left',
                padding: '8px 16px', background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer',
                fontFamily: 'inherit', fontSize: 12, color: 'var(--text-secondary)',
                opacity: busy ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{t.threadName}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-dim)' }}>
                  {t.domaineName} <span style={{ opacity: 0.6 }}>›</span> {t.projectName}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div style={{
          padding: '10px 16px', borderTop: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {loading ? '' : `${filtered.length} of ${threads.length} thread${threads.length === 1 ? '' : 's'}`}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              height: 28, padding: '0 14px', background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)', borderRadius: 4,
              color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'inherit',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
