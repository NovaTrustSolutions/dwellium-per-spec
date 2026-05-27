import { useEffect, useRef, useState, useCallback } from 'react'
import { useSidebarStore } from '../../store/sidebarStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useScribeStore } from '../../store/scribeStore'
import { useDomainesStore } from '../../store/domainesStore'
import { triggerSidebarRefresh } from '../../utils/sidebarEvents'
import { loadThread } from '../../utils/threadActions'
import { SidebarCell } from './SidebarCell'
import { ThreadPickerHeader } from './ThreadPickerHeader'
import { IconNewFile, IconClose, IconFile, IconImport, IconSplit } from '../Icons'
import { DomaineBadge } from '../DomaineBadge'
import { BranchModal } from '../chat/BranchModal'
import type { ThreadInfo } from '../../types/ipc'

const MIN_CELL_HEIGHT = 120

export function Sidebar(): JSX.Element {
  const { cells, activeCellId, addCell, initWithPath } = useSidebarStore()
  const { config, loaded, saveConfig } = useSettingsStore()
  const { openFiles, activeFilePath, setActiveFile, closeFile, closeAllFiles } = useScribeStore()

  const [heights, setHeights] = useState<number[] | null>(null)
  const [rootMissing, setRootMissing] = useState(false)
  const cellsContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const remove = window.electronAPI.onWorkspaceFileChange(() => {
      triggerSidebarRefresh()
    })
    return remove
  }, [])

  // Cmd+Shift+W — close all open files. Leaves Cmd+W for closing the active tab
  // (handled elsewhere or by the OS), this only fires with Shift.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey && e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        closeAllFiles()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [closeAllFiles])

  // Initialize the first cell at the most-specific known root: thread → project → projectsRoot.
  useEffect(() => {
    if (!loaded) return
    const startPath = config.activeThreadPath || config.activeProjectPath || config.projectsRoot
    if (!startPath) { setRootMissing(false); return }
    void window.electronAPI.fsExists(startPath).then((r) => {
      const missing = !r.exists || !r.isDirectory
      setRootMissing(missing)
      if (!missing && cells.length === 0) initWithPath(startPath)
    })
  }, [loaded, config.activeThreadPath, config.activeProjectPath, config.projectsRoot]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const container = cellsContainerRef.current
      if (!container || cells.length === 0) { setHeights(null); return }
      const totalHeight = container.getBoundingClientRect().height
      const dividerSpace = (cells.length - 1) * 6
      const cellH = Math.max(MIN_CELL_HEIGHT, Math.floor((totalHeight - dividerSpace) / cells.length))
      setHeights(Array(cells.length).fill(cellH))
    })
    return () => cancelAnimationFrame(raf)
  }, [cells.length])

  const getEqualHeights = useCallback((): number[] => {
    const total = cellsContainerRef.current?.getBoundingClientRect().height ?? 0
    const count = cells.length
    if (count === 0 || total === 0) return []
    return Array(count).fill(Math.floor(total / count))
  }, [cells.length])

  const handleAddCell = (): void => {
    if (cells.length >= 3) return
    // Hard-stop chain — must match SidebarCell's `root` derivation so the new
    // cell starts at activeThreadPath (or the next-most-specific scope) and
    // can never display content above it. (ARCHITECTURE.md §8, DATA_MODEL.md §4)
    addCell(config.activeThreadPath || config.activeProjectPath || config.projectsRoot || '')
  }

  const handleImportFiles = async (): Promise<void> => {
    const threadRoot = config.activeThreadPath
    if (!threadRoot) return

    // Write into whichever subfolder the user is currently browsing (e.g.
    // Thread/References/), not blindly at thread root. The active cell's
    // currentPath is the source of truth for "where the user is" — it's
    // updated by navigateToFolder in SidebarCell. Fall back to threadRoot
    // if the candidate isn't inside the thread (cell state stale, etc.) so
    // we never write outside the thread boundary.
    const activeCell = cells.find((c) => c.id === activeCellId) ?? cells[0]
    const candidate = activeCell?.currentPath ?? ''
    const destDir = candidate === threadRoot || candidate.startsWith(threadRoot + '/')
      ? candidate
      : threadRoot

    const result = await window.electronAPI.filesImport(destDir).catch(() => null)
    if (!result || result.canceled) return
    if (result.imported.length > 0) triggerSidebarRefresh()
  }

  const handleOpenFolder = async (): Promise<void> => {
    const folderPath = await window.electronAPI.workspaceBrowse()
    if (!folderPath) return
    initWithPath(folderPath)
  }

  const handleReplaceMissingRoot = async (): Promise<void> => {
    const folderPath = await window.electronAPI.workspaceBrowse()
    if (!folderPath) return
    saveConfig({ holocronRoot: folderPath })
    initWithPath(folderPath)
  }

  const startVerticalResize = (e: React.MouseEvent, dividerIndex: number): void => {
    e.preventDefault()
    const startY = e.clientY
    const baseHeights = heights ?? getEqualHeights()

    const onMove = (moveEvent: MouseEvent): void => {
      moveEvent.preventDefault()
      const delta = moveEvent.clientY - startY
      setHeights((prev) => {
        const current = prev ?? baseHeights
        const next = [...current]
        const above = Math.max(MIN_CELL_HEIGHT, (baseHeights[dividerIndex] ?? MIN_CELL_HEIGHT) + delta)
        const below = Math.max(MIN_CELL_HEIGHT, (baseHeights[dividerIndex + 1] ?? MIN_CELL_HEIGHT) - delta)
        next[dividerIndex] = above
        next[dividerIndex + 1] = below
        return next
      })
    }

    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-panel)', overflow: 'hidden', position: 'relative' }}>
      {/* Global Header — thread picker (left) + icon cluster (right). The
          picker's accordion popover anchors below this row via
          position:absolute against the sidebar's outer position:relative
          wrapper, so left/right pin it to the sidebar's full width. */}
      <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <ThreadPickerHeader />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <HeaderIconButton
            onClick={() => void handleImportFiles()}
            disabled={!config.activeThreadPath}
            title={config.activeThreadPath ? 'Import files into thread' : 'Load a thread to import files'}
          >
            <IconImport size={14} />
          </HeaderIconButton>
          <HeaderIconButton
            onClick={handleAddCell}
            disabled={cells.length >= 3}
            title="Add file panel"
          >
            <IconSplit size={14} />
          </HeaderIconButton>
        </div>
      </div>

      {/* Open Files section */}
      {openFiles.length > 0 && (
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '5px 6px 3px 10px' }}>
            <span style={{ flex: 1, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
              Open Files
            </span>
            <button
              onClick={() => closeAllFiles()}
              title={`Close all open files (⌘⇧W)`}
              style={{
                width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', borderRadius: 3, cursor: 'pointer',
                color: 'var(--text-dim)', padding: 0, lineHeight: 1, fontSize: 14,
                transition: 'color 100ms, background 100ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-card-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'none' }}
            >
              ×
            </button>
          </div>
          {openFiles.map((file) => {
            const isActive = file.path === activeFilePath
            return (
              <div
                key={file.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 6px 0 8px', height: 26, cursor: 'pointer',
                  backgroundColor: isActive ? 'var(--bg-selected)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--neon-blue)' : '2px solid transparent',
                  transition: 'background 100ms',
                }}
                onClick={() => setActiveFile(file.path)}
                onMouseOver={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-card)' }}
                onMouseOut={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <IconFile size={12} style={{ flexShrink: 0, color: isActive ? 'var(--neon-blue)' : 'var(--text-secondary)' }} />
                <span style={{ flex: 1, fontSize: 11, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {file.name}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeFile(file.path) }}
                  title="Close"
                  style={{ flexShrink: 0, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', borderRadius: 3, padding: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'none' }}
                >
                  <IconClose size={10} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Cells area */}
      <div ref={cellsContainerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {cells.length === 0 ? (
          rootMissing ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, textAlign: 'center' }}>
              <span style={{ fontSize: 22, color: '#ff2d78', lineHeight: 1 }}>⚠</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Root folder missing.
                <br />
                Set a new one in Settings → Connections.
              </span>
              <button
                onClick={() => void handleReplaceMissingRoot()}
                style={{ background: 'var(--neon-blue)', color: '#000', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Pick Folder
              </button>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
              <IconNewFile size={28} style={{ color: 'var(--text-dim)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>No folder open</span>
              <button
                onClick={() => void handleOpenFolder()}
                style={{ background: 'var(--neon-blue)', color: '#000', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' }}
              >
                Open Folder
              </button>
            </div>
          )
        ) : (
          cells.map((cell, idx) => {
            const cellHeight = heights ? heights[idx] : undefined
            return (
              <div key={cell.id} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {idx > 0 && (
                  <CellDivider onMouseDown={(e) => startVerticalResize(e, idx - 1)} />
                )}
                <div
                  style={{
                    ...(cellHeight !== undefined
                      ? { height: cellHeight, flexShrink: 0 }
                      : { flex: 1, minHeight: MIN_CELL_HEIGHT }),
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <SidebarCell cellId={cell.id} canClose={cells.length > 1} />
                </div>
              </div>
            )
          })
        )}
      </div>

      {config.activeProjectPath && config.activeThreadName && (
        <ThreadSwitcherFooter
          projectName={config.activeProjectName}
          projectPath={config.activeProjectPath}
          activeThreadName={config.activeThreadName}
          activeThreadPath={config.activeThreadPath}
        />
      )}
    </div>
  )
}

function HeaderIconButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  disabled: boolean
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 22, height: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--text-dim)' : 'var(--text-secondary)',
        opacity: disabled ? 0.3 : 1,
        transition: 'color 100ms, background 100ms',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = 'var(--neon-blue)'; e.currentTarget.style.background = 'var(--bg-card)' } }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'none' }}
    >
      {children}
    </button>
  )
}

function CellDivider({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 6, flexShrink: 0, cursor: 'ns-resize',
        backgroundColor: hovered ? 'var(--bg-card)' : 'var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 100ms', userSelect: 'none',
      }}
    >
      {hovered && (
        <div style={{ width: 28, height: 2, backgroundColor: 'var(--neon-blue)', borderRadius: 1, opacity: 0.5 }} />
      )}
    </div>
  )
}

// ── Thread Switcher Footer ────────────────────────────────────────────────

const FOOTER_HEIGHT = 32

function formatStamp(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ThreadSwitcherFooter({
  projectName,
  projectPath,
  activeThreadName,
  activeThreadPath,
}: {
  projectName: string
  projectPath: string
  activeThreadName: string
  activeThreadPath: string
}): JSX.Element {
  const { setPendingChatPill } = useScribeStore()
  // Shared with the Domaines tab's ProjectView — one "thread sort" pref
  // across the app. Persisted in domainesStore so it survives navigation.
  const sortMode    = useDomainesStore((s) => s.sortThread)
  const setSortMode = useDomainesStore((s) => s.setSortThread)
  const [open, setOpen] = useState(false)
  const [threads, setThreads] = useState<ThreadInfo[]>([])
  // P7-C: each row also needs to know its predecessor so the footer can
  // indent branched threads under their parent. Stored separately from the
  // base list so a single threadsList() doesn't have to fetch every meta.
  const [continuedFromMap, setContinuedFromMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [branchModalOpen, setBranchModalOpen] = useState(false)
  const [branchBusy, setBranchBusy] = useState(false)
  const [compressionCount, setCompressionCount] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // P7-A advisory data: how many times the active thread has been compressed.
  // Drives the "Nx compressed" badge shown next to the Branch button.
  useEffect(() => {
    if (!activeThreadPath) { setCompressionCount(0); return }
    let cancelled = false
    void window.electronAPI.threadReadMeta(activeThreadPath)
      .then((meta) => { if (!cancelled) setCompressionCount(meta?.compressionCount ?? 0) })
      .catch(() => { if (!cancelled) setCompressionCount(0) })
    return () => { cancelled = true }
  }, [activeThreadPath])

  // Suggest "[ThreadName]-2" for a fresh branch. If the current name already
  // ends with "-N", increment so chained branches stay numerically ordered.
  const suggestedBranchName = (() => {
    if (!activeThreadName) return ''
    const m = /^(.*?)-(\d+)$/.exec(activeThreadName)
    if (m) return `${m[1]}-${parseInt(m[2], 10) + 1}`
    return `${activeThreadName}-2`
  })()

  const handleBranchConfirm = async (newName: string, _description: string): Promise<void> => {
    if (!projectPath || !activeThreadPath) return
    setBranchBusy(true)
    try {
      const result = await window.electronAPI.threadBranch(projectPath, newName, activeThreadPath)
      if (!result.ok) return
      await loadThread(projectName, projectPath, newName, result.path)
      setBranchModalOpen(false)
    } finally {
      setBranchBusy(false)
    }
  }

  const refresh = useCallback(async (): Promise<void> => {
    if (!projectPath) return
    setLoading(true)
    try {
      const list = await window.electronAPI.threadsList(projectPath)
      setThreads(list)
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh, activeThreadPath])

  // P7-C: when threads change, fetch each thread.json so we know its
  // continuedFrom predecessor. Fetched lazily (only when the switcher is
  // expanded) and cached in continuedFromMap.
  useEffect(() => {
    if (threads.length === 0) { setContinuedFromMap({}); return }
    let cancelled = false
    void Promise.all(threads.map(async (t) => {
      const meta = await window.electronAPI.threadReadMeta(t.path).catch(() => null)
      return [t.path, meta?.continuedFrom?.threadName ?? null] as const
    })).then((entries) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [pathKey, name] of entries) {
        if (name) next[pathKey] = name
      }
      setContinuedFromMap(next)
    })
    return () => { cancelled = true }
  }, [threads])

  // Cmd+Shift+T toggles
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Click outside closes
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // P7-C: order threads as a tree — each branched thread appears immediately
  // under its predecessor, indented. The branch-parent relationship is
  // preserved regardless of sort mode; the chosen mode only controls how
  // siblings (roots, or kids of the same parent) are ordered.
  const ordered = (() => {
    const byName = new Map<string, ThreadInfo>()
    for (const t of threads) byName.set(t.name, t)
    const childrenByParent = new Map<string, ThreadInfo[]>()
    const roots: ThreadInfo[] = []
    for (const t of threads) {
      const parentName = continuedFromMap[t.path]
      if (parentName && byName.has(parentName)) {
        const list = childrenByParent.get(parentName) ?? []
        list.push(t)
        childrenByParent.set(parentName, list)
      } else {
        roots.push(t)
      }
    }
    const sortByMode = (arr: ThreadInfo[]): ThreadInfo[] =>
      sortMode === 'name'
        ? [...arr].sort((a, b) => a.name.localeCompare(b.name))
        : [...arr].sort((a, b) => b.lastModified - a.lastModified)
    const out: Array<{ thread: ThreadInfo; depth: number }> = []
    const visit = (t: ThreadInfo, depth: number): void => {
      out.push({ thread: t, depth })
      const kids = sortByMode(childrenByParent.get(t.name) ?? [])
      for (const k of kids) visit(k, depth + 1)
    }
    for (const r of sortByMode(roots)) visit(r, 0)
    return out
  })()

  const handleSwitch = async (t: ThreadInfo): Promise<void> => {
    if (t.path === activeThreadPath) { setOpen(false); return }
    await loadThread(projectName, projectPath, t.name, t.path)
    setOpen(false)
  }

  const handleReference = (t: ThreadInfo): void => {
    // Phase A: append a placeholder pill. Phase B will fetch the thread's
    // Honcho summary + last 5 messages and inject them as agentText.
    setPendingChatPill({
      id: crypto.randomUUID(),
      displayLabel: `⊞ ${t.name}`,
      agentText: `[Reference to thread: ${t.name} at ${t.path}]`,
    })
    setOpen(false)
  }

  return (
    <div ref={containerRef}>
      {/* Drawer */}
      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0, right: 0, bottom: FOOTER_HEIGHT,
            maxHeight: '60%',
            background: 'var(--bg-panel)',
            borderTop: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 30, display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
              Threads in {projectName}
            </span>
            <button
              onClick={() => setSortMode(sortMode === 'name' ? 'mtime' : 'name')}
              title={sortMode === 'name'
                ? 'Sort: Name A→Z (click to switch to Last modified)'
                : 'Sort: Last modified (click to switch to Name A→Z)'}
              style={{
                flexShrink: 0,
                height: 20, minWidth: 24,
                padding: '0 6px',
                background: 'transparent',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                letterSpacing: '0.04em',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--neon-blue)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              {sortMode === 'name' ? 'A↓' : '⏱'}
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
            {loading ? (
              <div style={{ padding: 14, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'monospace' }}>Loading…</div>
            ) : ordered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'monospace' }}>no threads</div>
            ) : (
              ordered.map(({ thread: t, depth }) => (
                <ThreadFooterRow
                  key={t.path}
                  thread={t}
                  depth={depth}
                  isActive={t.path === activeThreadPath}
                  onSwitch={() => void handleSwitch(t)}
                  onReference={() => handleReference(t)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Footer strip */}
      <div
        style={{
          height: FOOTER_HEIGHT, flexShrink: 0,
          display: 'flex', alignItems: 'stretch',
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border-default)',
          color: 'var(--text-secondary)',
        }}
      >
        {/* Active thread label — clicking opens the switcher drawer.
            Leading Domaine dot makes the active thread's organizational
            home visible at a glance from anywhere in the app. */}
        <div
          onClick={() => setOpen((v) => !v)}
          title={`${projectName} · Switch thread (⌘⇧T)`}
          style={{
            flex: 1, minWidth: 0,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 10px',
            cursor: 'pointer', userSelect: 'none',
            transition: 'background 100ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <DomaineBadge projectName={projectName} variant="dot" />
          <span style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>⊞</span>
          <span style={{ flex: 1, fontSize: 11, color: 'var(--text-primary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {activeThreadName}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
            ∨
          </span>
        </div>

        {/* P7-A advisory — "Nx compressed" pill, only after threshold. Hint
         *  that the active thread has been compressed enough times that
         *  branching would help keep context fresh. */}
        {compressionCount >= 3 && (
          <div
            title={`This thread has been compressed ${compressionCount} times — consider Branching to keep context fresh.`}
            style={{
              display: 'flex', alignItems: 'center',
              padding: '0 8px',
              fontSize: 9, fontWeight: 700,
              color: 'var(--accent-orange)',
              whiteSpace: 'nowrap',
            }}
          >
            ⚑ {compressionCount}×
          </div>
        )}

        {/* Branch button — thread-level command, lives next to the thread
         *  identity it acts on. Opens BranchModal. */}
        <button
          onClick={(e) => { e.stopPropagation(); setBranchModalOpen(true) }}
          title="Branch this thread — creates a new thread with current Honcho summary inherited as opening context"
          style={{
            flexShrink: 0,
            padding: '0 12px',
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid var(--border-default)',
            color: '#4ea8ff',
            fontSize: 10, fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 120ms, color 120ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(10,132,255,0.10)'
            e.currentTarget.style.color = '#7ec0ff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#4ea8ff'
          }}
        >
          ⌥ Branch
        </button>
      </div>

      <BranchModal
        open={branchModalOpen}
        defaultName={suggestedBranchName}
        busy={branchBusy}
        onConfirm={(name, description) => void handleBranchConfirm(name, description)}
        onCancel={() => setBranchModalOpen(false)}
      />
    </div>
  )
}

function ThreadFooterRow({
  thread,
  depth,
  isActive,
  onSwitch,
  onReference,
}: {
  thread: ThreadInfo
  depth: number
  isActive: boolean
  onSwitch: () => void
  onReference: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  // P7-C: branched threads (depth > 0) get an indent + a `└─` prefix so the
  // chain reads top-to-bottom like a tree.
  const indentPx = depth * 18
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={isActive ? undefined : onSwitch}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px',
        paddingLeft: 8 + indentPx,
        borderRadius: 6,
        background: isActive
          ? 'rgba(0,255,136,0.08)'
          : hovered ? 'var(--bg-card-hover)' : 'transparent',
        border: isActive ? '1px solid #00ff8840' : '1px solid transparent',
        cursor: isActive ? 'default' : 'pointer',
        marginBottom: 2,
      }}
    >
      {depth > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'monospace', lineHeight: 1 }}>
          └─
        </span>
      )}
      <span style={{
        flex: 1, minWidth: 0, fontSize: 12,
        color: isActive ? '#00ff88' : 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {thread.name}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'monospace' }}>
        {formatStamp(thread.lastModified)}
      </span>
      {!isActive && hovered && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onSwitch() }}
            title="Switch to this thread"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 4px', fontSize: 13, lineHeight: 1 }}
          >
            →
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onReference() }}
            title="Reference this thread in chat"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 4px', fontSize: 12, lineHeight: 1 }}
          >
            ⊞
          </button>
        </>
      )}
    </div>
  )
}
