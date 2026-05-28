import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useDomainesStore } from '../../store/domainesStore'
import { loadThread } from '../../utils/threadActions'
import { sortByName } from '../../utils/sortByName'
import { IconExpand, IconCollapse } from '../Icons'
import type { ProjectInfo, ThreadInfo } from '../../types/ipc'

/**
 * Vertical accordion thread picker. Replaces the static "Files" label at
 * the top of the Scribe sidebar. The popover drops straight down from the
 * trigger, full sidebar width, and shows Domaines as a vertical list that
 * accordion-expand to Projects, which accordion-expand to Threads.
 *
 * Why accordion (not horizontal columns) — the sidebar is narrow; a
 * three-column cascading menu either escapes via a portal (overlay-style)
 * or gets clipped. A vertical tree contained within the sidebar width
 * keeps the picker visually anchored to the surface the user is steering.
 *
 * Behavior:
 *  • Trigger: current activeThreadName (or "Select thread") + ▾ chevron.
 *  • Click trigger → popover opens directly below, sized to the sidebar
 *    width. Internal `max-height` with vertical scroll keeps it bounded.
 *  • Click a Domaine row → expand its children (auto-fetches Projects if
 *    not cached) and collapse on second click. Same for Project rows.
 *  • Click a Thread row → commit + close.
 *  • Keyboard: ↑/↓ moves through the FLATTENED list of visible rows; →
 *    expands a collapsed Domaine/Project; ← collapses an expanded one (or
 *    jumps to parent when already collapsed); Enter expands or commits.
 *  • Esc or click-outside closes.
 *  • On open, the current active Domaine + Project are pre-expanded so
 *    the active Thread is visible immediately. If no active thread, the
 *    picker opens with everything collapsed and focus on the first
 *    Domaine.
 *
 * Data caching: per-popover-session only. Cleared on close so reopening
 * picks up any creates/renames/deletes that landed elsewhere.
 */

type ListState<T> = 'loading' | 'error' | T[]

type RowKind = 'domaine' | 'project' | 'thread' | 'loading' | 'error'

interface FlatRow {
  /** Unique stable key for keyboard nav + render. */
  key: string
  kind: RowKind
  /** 0 = Domaine row, 1 = Project row or loading-under-Domaine,
   *  2 = Thread row or loading-under-Project. */
  depth: 0 | 1 | 2
  /** Label rendered on the row. */
  label: string
  /** Color dot (Domaine rows only). */
  color?: string
  /** True when this row matches the currently-active context. */
  active?: boolean
  /** Click action — populated for domaine / project / thread rows only. */
  action?: () => void
  /** Identity payload used by keyboard handlers to expand / collapse /
   *  commit. Indirection lets the keyboard logic stay generic. */
  payload?: {
    kind: 'domaine' | 'project' | 'thread'
    domaineId: string
    projectPath?: string
    project?: ProjectInfo
    thread?: ThreadInfo
  }
}

export function ThreadPickerHeader(): JSX.Element {
  const config       = useSettingsStore((s) => s.config)
  const domaines     = useDomainesStore((s) => s.domaines)
  const loadIfNeeded = useDomainesStore((s) => s.loadIfNeeded)

  const [open, setOpen] = useState(false)
  const triggerRef  = useRef<HTMLButtonElement>(null)
  const popoverRef  = useRef<HTMLDivElement>(null)

  // Lazy per-Domaine / per-Project lists. Cleared on close.
  const [projectsByDomaine, setProjectsByDomaine] = useState<Record<string, ListState<ProjectInfo>>>({})
  const [threadsByProject,  setThreadsByProject]  = useState<Record<string, ListState<ThreadInfo>>>({})

  // Accordion state. Sets keep "is X expanded?" cheap and immutable updates
  // straightforward (new Set on each change so React notices).
  const [expandedDomaines, setExpandedDomaines] = useState<Set<string>>(() => new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set())

  // Keyboard focus tracked as a single string key — easier to keep in sync
  // with the flattened row list than three separate "which row in which
  // column" variables would be.
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  const triggerLabel = config.activeThreadName || 'Select thread'

  // ── Fetchers ─────────────────────────────────────────────────────────────

  const ensureProjects = useCallback(async (domaineId: string): Promise<ProjectInfo[]> => {
    const cached = projectsByDomaine[domaineId]
    if (Array.isArray(cached)) return cached
    setProjectsByDomaine((p) => ({ ...p, [domaineId]: 'loading' }))
    try {
      const list = sortByName(await window.electronAPI.projectsList(config.projectsRoot, domaineId))
      setProjectsByDomaine((p) => ({ ...p, [domaineId]: list }))
      return list
    } catch (err) {
      console.error('[ThreadPicker] projectsList failed:', err)
      setProjectsByDomaine((p) => ({ ...p, [domaineId]: 'error' }))
      return []
    }
  }, [config.projectsRoot, projectsByDomaine])

  const ensureThreads = useCallback(async (projectPath: string): Promise<ThreadInfo[]> => {
    const cached = threadsByProject[projectPath]
    if (Array.isArray(cached)) return cached
    setThreadsByProject((p) => ({ ...p, [projectPath]: 'loading' }))
    try {
      const list = sortByName(await window.electronAPI.threadsList(projectPath))
      setThreadsByProject((p) => ({ ...p, [projectPath]: list }))
      return list
    } catch (err) {
      console.error('[ThreadPicker] threadsList failed:', err)
      setThreadsByProject((p) => ({ ...p, [projectPath]: 'error' }))
      return []
    }
  }, [threadsByProject])

  // ── Expansion helpers ───────────────────────────────────────────────────

  const expandDomaine = useCallback((id: string): void => {
    setExpandedDomaines((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev); next.add(id); return next
    })
    void ensureProjects(id)
  }, [ensureProjects])

  const collapseDomaine = useCallback((id: string): void => {
    setExpandedDomaines((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev); next.delete(id); return next
    })
  }, [])

  const toggleDomaine = useCallback((id: string): void => {
    setExpandedDomaines((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else { next.add(id); void ensureProjects(id) }
      return next
    })
  }, [ensureProjects])

  const expandProject = useCallback((path: string): void => {
    setExpandedProjects((prev) => {
      if (prev.has(path)) return prev
      const next = new Set(prev); next.add(path); return next
    })
    void ensureThreads(path)
  }, [ensureThreads])

  const collapseProject = useCallback((path: string): void => {
    setExpandedProjects((prev) => {
      if (!prev.has(path)) return prev
      const next = new Set(prev); next.delete(path); return next
    })
  }, [])

  const toggleProject = useCallback((path: string): void => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else { next.add(path); void ensureThreads(path) }
      return next
    })
  }, [ensureThreads])

  // ── Expand-all / collapse-all ────────────────────────────────────────────
  // Session 11 — one-shot bulk toggle in the popover header. Matches the
  // Scribe sidebar SidebarCell pattern (IconExpand / IconCollapse, single
  // toggle button that flips icon + handler based on current state).
  // Session-scoped: the underlying expandedDomaines / expandedProjects
  // state is already wiped on closePicker, so no persistence work is
  // needed.
  //
  // Session 11 fix — the trigger for collapse-mode is "is EVERYTHING
  // fully expanded?", not "is ANYTHING expanded?". Expand-all is the
  // primary action; collapse-all only fires when the user has already
  // expanded everything and wants to wipe. Concretely: with the popover
  // auto-expanding the active Domain + Project on open (so the active
  // Thread is visible — see openPicker), a "hasAnyExpanded" trigger
  // would mean the first press collapses the active context. The
  // "isFullyExpanded" trigger preserves the natural progression:
  //   nothing open      → expand all
  //   some open         → expand all (the partial state was wrong; fill it)
  //   everything open   → collapse all
  // Matches Andy's spec verbatim: "If everything is already fully
  // expanded → collapse all. In any other state (nothing open, some
  // open, some closed) → expand all."

  // Truthy iff every Domain is expanded AND its Projects are loaded AND
  // every one of those Projects is expanded. Threads are leaves (no
  // separate expansion level — clicking a thread commits) so they don't
  // factor in. A Domain without its projectsByDomaine list loaded yet
  // (still 'loading' / 'error' / absent) counts as not-fully-expanded
  // because we genuinely don't know whether all its Projects are open.
  const isFullyExpanded = domaines.length > 0 && domaines.every((d) => {
    if (!expandedDomaines.has(d.id)) return false
    const projects = projectsByDomaine[d.id]
    if (!Array.isArray(projects)) return false
    return projects.every((p) => expandedProjects.has(p.path))
  })

  const handleExpandAll = useCallback(async (): Promise<void> => {
    const domIds = domaines.map((d) => d.id)
    if (domIds.length === 0) return
    // Mark every Domain expanded immediately so the user sees the
    // loading-row placeholders flash into place under each row — same
    // visual feedback the manual click path produces. Projects + Threads
    // are then fetched in parallel.
    setExpandedDomaines(new Set(domIds))
    const projectLists = await Promise.all(domIds.map((id) => ensureProjects(id)))
    const allProjectPaths = projectLists.flat().map((p) => p.path)
    setExpandedProjects(new Set(allProjectPaths))
    // Thread fetches are fire-and-forget at this point — the rows render
    // their own loading placeholders. We still await so an immediate
    // collapse-then-expand sequence doesn't kick off a duplicate fetch.
    if (allProjectPaths.length > 0) {
      await Promise.all(allProjectPaths.map((p) => ensureThreads(p)))
    }
  }, [domaines, ensureProjects, ensureThreads])

  const handleCollapseAll = useCallback((): void => {
    setExpandedDomaines(new Set())
    setExpandedProjects(new Set())
    // Cached project / thread lists are left in place on purpose — a
    // subsequent expand-all reuses them rather than re-fetching. The
    // popover-close path is what clears them entirely.
  }, [])

  // ── Open / close ─────────────────────────────────────────────────────────

  const closePicker = useCallback((restoreFocus: boolean = true): void => {
    setOpen(false)
    setProjectsByDomaine({})
    setThreadsByProject({})
    setExpandedDomaines(new Set())
    setExpandedProjects(new Set())
    setFocusedKey(null)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const openPicker = useCallback(async (): Promise<void> => {
    setOpen(true)
    await loadIfNeeded()

    const dom = useDomainesStore.getState().domaines.find((d) => d.id === config.activeDomaineId)
    if (dom) {
      // Auto-expand the active Domaine (always) and the active Project (if
      // any) so the active Thread is visible without a manual drill-down.
      setExpandedDomaines(new Set([dom.id]))
      const projects = await ensureProjects(dom.id)
      const proj = config.activeProjectPath
        ? projects.find((p) => p.path === config.activeProjectPath)
        : null
      if (proj) {
        setExpandedProjects(new Set([proj.path]))
        await ensureThreads(proj.path)
        if (config.activeThreadPath) {
          setFocusedKey('t:' + config.activeThreadPath)
          return
        }
        setFocusedKey('p:' + proj.path)
        return
      }
      setFocusedKey('d:' + dom.id)
      return
    }
    // No active context — focus the first Domaine if any.
    const first = useDomainesStore.getState().domaines[0]
    if (first) setFocusedKey('d:' + first.id)
  }, [
    config.activeDomaineId,
    config.activeProjectPath,
    config.activeThreadPath,
    loadIfNeeded,
    ensureProjects,
    ensureThreads,
  ])

  // Click outside closes.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node | null
      if (!t) return
      if (popoverRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      closePicker(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, closePicker])

  // Focus the popover on open so keyboard nav works without a click.
  useEffect(() => {
    if (open) popoverRef.current?.focus()
  }, [open])

  // ── Commit ──────────────────────────────────────────────────────────────

  const commitThread = useCallback(async (
    domaineId: string,
    project: ProjectInfo,
    thread: ThreadInfo,
  ): Promise<void> => {
    try {
      await loadThread(project.name, project.path, thread.name, thread.path, domaineId)
    } catch (err) {
      console.error('[ThreadPicker] loadThread failed:', err)
    }
    closePicker()
  }, [closePicker])

  // ── Flatten the tree into the visible row sequence ──────────────────────
  // Re-derived every render so adds/removes/toggles stay in sync. Each row
  // carries its own click action, so render is a flat map.

  const flatRows: FlatRow[] = useMemo(() => {
    const rows: FlatRow[] = []
    for (const dom of domaines) {
      const isDomActive = dom.id === config.activeDomaineId
      const isExpanded = expandedDomaines.has(dom.id)
      rows.push({
        key: 'd:' + dom.id,
        kind: 'domaine',
        depth: 0,
        label: dom.name,
        color: dom.color ?? undefined,
        active: isDomActive,
        action: () => toggleDomaine(dom.id),
        payload: { kind: 'domaine', domaineId: dom.id },
      })
      if (!isExpanded) continue
      const projects = projectsByDomaine[dom.id]
      if (projects === 'loading') {
        rows.push({ key: 'pl:' + dom.id, kind: 'loading', depth: 1, label: 'Loading…' })
        continue
      }
      if (projects === 'error') {
        rows.push({ key: 'pe:' + dom.id, kind: 'error', depth: 1, label: 'Failed to load projects' })
        continue
      }
      if (!projects || projects.length === 0) {
        rows.push({ key: 'pn:' + dom.id, kind: 'loading', depth: 1, label: 'No projects yet.' })
        continue
      }
      for (const proj of projects) {
        const isProjActive   = proj.path === config.activeProjectPath
        const isProjExpanded = expandedProjects.has(proj.path)
        rows.push({
          key: 'p:' + proj.path,
          kind: 'project',
          depth: 1,
          label: proj.name,
          active: isProjActive,
          action: () => toggleProject(proj.path),
          payload: { kind: 'project', domaineId: dom.id, projectPath: proj.path, project: proj },
        })
        if (!isProjExpanded) continue
        const threads = threadsByProject[proj.path]
        if (threads === 'loading') {
          rows.push({ key: 'tl:' + proj.path, kind: 'loading', depth: 2, label: 'Loading…' })
          continue
        }
        if (threads === 'error') {
          rows.push({ key: 'te:' + proj.path, kind: 'error', depth: 2, label: 'Failed to load threads' })
          continue
        }
        if (!threads || threads.length === 0) {
          rows.push({ key: 'tn:' + proj.path, kind: 'loading', depth: 2, label: 'No threads yet.' })
          continue
        }
        for (const t of threads) {
          rows.push({
            key: 't:' + t.path,
            kind: 'thread',
            depth: 2,
            label: t.name,
            active: t.path === config.activeThreadPath,
            action: () => void commitThread(dom.id, proj, t),
            payload: { kind: 'thread', domaineId: dom.id, projectPath: proj.path, project: proj, thread: t },
          })
        }
      }
    }
    return rows
  }, [
    domaines,
    expandedDomaines, expandedProjects,
    projectsByDomaine, threadsByProject,
    config.activeDomaineId, config.activeProjectPath, config.activeThreadPath,
    toggleDomaine, toggleProject, commitThread,
  ])

  // ── Keyboard ─────────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); closePicker(); return }

    // Only consider rows the user can actually act on (skip loading/error
    // placeholders) for ↑/↓ traversal.
    const navigable = flatRows.filter((r) => r.payload)
    if (navigable.length === 0) return

    const currentIdx = focusedKey
      ? navigable.findIndex((r) => r.key === focusedKey)
      : -1

    const focusAt = (idx: number): void => {
      const clamped = (idx + navigable.length) % navigable.length
      setFocusedKey(navigable[clamped].key)
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusAt(currentIdx < 0 ? 0 : currentIdx + 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusAt(currentIdx < 0 ? navigable.length - 1 : currentIdx - 1)
      return
    }

    if (currentIdx < 0) return
    const row = navigable[currentIdx]
    const p = row.payload!  // guaranteed by the filter above

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (p.kind === 'domaine') {
        if (!expandedDomaines.has(p.domaineId)) {
          expandDomaine(p.domaineId)
        } else {
          // Already expanded — step into first child if there is one.
          const next = navigable[currentIdx + 1]
          if (next && next.depth > row.depth) setFocusedKey(next.key)
        }
      } else if (p.kind === 'project' && p.projectPath) {
        if (!expandedProjects.has(p.projectPath)) {
          expandProject(p.projectPath)
        } else {
          const next = navigable[currentIdx + 1]
          if (next && next.depth > row.depth) setFocusedKey(next.key)
        }
      }
      return
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (p.kind === 'thread' && p.projectPath) {
        // Move focus to the parent project and leave its expansion intact;
        // a second ← from the project row will collapse it. Standard tree
        // behavior.
        setFocusedKey('p:' + p.projectPath)
      } else if (p.kind === 'project' && p.projectPath) {
        if (expandedProjects.has(p.projectPath)) collapseProject(p.projectPath)
        else setFocusedKey('d:' + p.domaineId)
      } else if (p.kind === 'domaine') {
        if (expandedDomaines.has(p.domaineId)) collapseDomaine(p.domaineId)
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (row.action) row.action()
      return
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => { if (open) closePicker(); else void openPicker() }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={config.activeThreadPath || 'No thread loaded — click to pick one'}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '2px 4px', borderRadius: 3,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--neon-blue)',
          fontFamily: 'monospace',
          maxWidth: 220, overflow: 'hidden',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {triggerLabel}
        </span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          tabIndex={-1}
          role="menu"
          onKeyDown={onKeyDown}
          style={{
            // Anchors below the sidebar header (height: 36) and stretches
            // to fill the sidebar width. The sidebar's outer wrapper is
            // position: relative, so left/right anchor to it. max-height
            // is capped to a fraction of the viewport with overflow-y
            // auto so a workspace with many Domaines/Projects/Threads
            // doesn't push subsequent content off-screen.
            position: 'absolute',
            top: 36, left: 0, right: 0,
            zIndex: 50,
            maxHeight: 'calc(100vh - 180px)',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-panel)',
            borderBottom: '1px solid var(--border-default)',
            boxShadow: '0 8px 16px rgba(0,0,0,0.35)',
            outline: 'none',
          }}
        >
          {flatRows.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              No Domaines yet.
            </div>
          ) : (
            <>
              {/* Session 11 — expand-all / collapse-all toggle. Lives in a
                  thin header strip above the row list so it's reachable
                  from the same viewport as the rows it acts on (matches
                  the SidebarCell pattern visually, just without the rest
                  of that bar's controls — sort + close don't apply here).
                  Suppressed entirely when no Domaines exist (above branch).
                  The button uses the same IconExpand / IconCollapse pair
                  that Scribe's file-tree sidebar uses for consistency. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  height: 26,
                  padding: '0 6px',
                  borderBottom: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-card)',
                }}
              >
                <button
                  type="button"
                  onClick={() => { if (isFullyExpanded) handleCollapseAll(); else void handleExpandAll() }}
                  title={isFullyExpanded ? 'Collapse all' : 'Expand all'}
                  aria-label={isFullyExpanded ? 'Collapse all' : 'Expand all'}
                  style={{
                    width: 22, height: 22,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none', borderRadius: 4,
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: 0,
                    transition: 'background 100ms, color 100ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent';        e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  {isFullyExpanded ? <IconCollapse size={14} /> : <IconExpand size={14} />}
                </button>
              </div>

              {flatRows.map((row) => (
                <Row
                  key={row.key}
                  row={row}
                  focused={row.key === focusedKey}
                  expanded={
                    row.kind === 'domaine' && row.payload
                      ? expandedDomaines.has(row.payload.domaineId)
                      : row.kind === 'project' && row.payload?.projectPath
                      ? expandedProjects.has(row.payload.projectPath)
                      : false
                  }
                  onHover={() => setFocusedKey(row.key)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </>
  )
}

// ── Row ─────────────────────────────────────────────────────────────────────

function Row({ row, focused, expanded, onHover }: {
  row: FlatRow
  focused: boolean
  expanded: boolean
  onHover: () => void
}): JSX.Element {
  // Placeholder rows (loading/error/empty) — non-interactive, dimmer text.
  if (!row.payload) {
    return (
      <div style={{
        paddingLeft: 14 + row.depth * 16, paddingRight: 14,
        height: 24, display: 'flex', alignItems: 'center',
        fontSize: 11, fontStyle: 'italic',
        color: row.kind === 'error' ? 'var(--neon-red, #f55)' : 'var(--text-dim)',
      }}>
        {row.label}
      </div>
    )
  }

  const isActive = !!row.active
  const showChevron = row.kind === 'domaine' || row.kind === 'project'

  return (
    <div
      role="menuitem"
      onMouseEnter={onHover}
      onClick={() => row.action?.()}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        paddingLeft: 6 + row.depth * 16, paddingRight: 10,
        height: 26,
        fontSize: row.kind === 'domaine' ? 12 : 12,
        fontWeight: row.kind === 'domaine' ? 600 : 400,
        color: isActive ? '#00ff88' : 'var(--text-primary)',
        backgroundColor: focused ? 'var(--bg-card-hover)' : 'transparent',
        borderLeft: isActive
          ? '2px solid #00ff88'
          : focused
          ? '2px solid var(--neon-blue)'
          : '2px solid transparent',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {showChevron ? (
        <span style={{ width: 12, fontSize: 9, color: 'var(--text-dim)', flexShrink: 0, textAlign: 'center' }}>
          {expanded ? '▼' : '▶'}
        </span>
      ) : (
        <span style={{ width: 12, flexShrink: 0 }} />
      )}
      {row.color && row.kind === 'domaine' && (
        <span style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: row.color, flexShrink: 0 }} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
        {row.label}
      </span>
    </div>
  )
}
