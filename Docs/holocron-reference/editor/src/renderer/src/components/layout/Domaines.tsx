import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '../../store/settingsStore'
import { useSessionStore } from '../../store/sessionStore'
import { useDomainesStore, type SortMode } from '../../store/domainesStore'
import { useScribeStore } from '../../store/scribeStore'
import { loadThread } from '../../utils/threadActions'
import { sortByName } from '../../utils/sortByName'
import type { DomaineInfo, ProjectInfo, ThreadInfo } from '../../types/ipc'
import { IconEdit, IconKebab, IconTrash } from '../Icons'

/** Close any open Scribe file tabs whose path lives inside `purgedPath`.
 *  Called after a successful Domaine / Project / Thread purge so the user
 *  doesn't see ghost tabs pointing at deleted files. Tolerates trailing
 *  slashes / double slashes in the input — Domaine purge constructs the
 *  path via string concat (`${projectsRoot}/${name}`) and projectsRoot is
 *  not guaranteed to be normalized. */
function closeScribeTabsUnder(purgedPath: string): void {
  const normalized = purgedPath.replace(/\/+$/, '')
  if (!normalized) return
  const state = useScribeStore.getState()
  const prefix = normalized + '/'
  for (const f of state.openFiles) {
    const filePath = f.path.replace(/\/+$/, '')
    if (filePath === normalized || filePath.startsWith(prefix)) {
      state.closeFile(f.path)
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

const tildify = (p: string): string => {
  const home = '/Users/' + (p.split('/Users/')[1]?.split('/')[0] ?? '')
  return p.startsWith(home + '/') ? '~' + p.slice(home.length) : p
}

function formatStamp(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

function formatCreated(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return formatStamp(t)
}

// ── Top-level dispatcher ──────────────────────────────────────────────────

export function Domaines(): JSX.Element {
  const { config, saveConfig } = useSettingsStore()
  const view              = useDomainesStore((s) => s.view)
  const activeDomaineId   = useDomainesStore((s) => s.activeDomaineId)
  const loadedOnce        = useDomainesStore((s) => s.loadedOnce)
  const domaines          = useDomainesStore((s) => s.domaines)
  const loadIfNeeded      = useDomainesStore((s) => s.loadIfNeeded)
  const openDomaine       = useDomainesStore((s) => s.openDomaine)

  // First-mount load. Lives at the dispatcher level (not inside any single
  // view) so the list is ready when the user lands directly in DomaineView
  // via restore-on-launch below.
  useEffect(() => { void loadIfNeeded() }, [loadIfNeeded])

  // Restore last-viewed Domaine on launch. Runs once, after the list has
  // loaded so we can verify the saved id still exists (user may have
  // deleted the Domaine from a different machine via shared DB).
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!loadedOnce || restoredRef.current) return
    restoredRef.current = true
    const savedId = config.activeDomaineId
    if (savedId && activeDomaineId === null && domaines.some((d) => d.id === savedId)) {
      openDomaine(savedId)
    }
  }, [loadedOnce, config.activeDomaineId, activeDomaineId, domaines, openDomaine])

  // Sync the live activeDomaineId → config so the next launch restores.
  // Cheap: saveConfig is debounced inside settingsStore.
  useEffect(() => {
    if (!restoredRef.current) return  // don't write before restore tries to read
    const target = activeDomaineId ?? ''
    if (config.activeDomaineId !== target) {
      saveConfig({ activeDomaineId: target })
    }
  }, [activeDomaineId, config.activeDomaineId, saveConfig])

  if (view === 'index')   return <DomainesIndex />
  if (view === 'domaine') return <DomaineView />
  return <ProjectView />
}

// ── View 1: Domaines index ────────────────────────────────────────────────

function DomainesIndex(): JSX.Element {
  const { config, saveConfig } = useSettingsStore()
  const domaines       = useDomainesStore((s) => s.domaines)
  const loadedOnce     = useDomainesStore((s) => s.loadedOnce)
  const refreshStore   = useDomainesStore((s) => s.refresh)
  const openDomaine    = useDomainesStore((s) => s.openDomaine)
  const sortMode       = useDomainesStore((s) => s.sortDomaine)
  const setSortMode    = useDomainesStore((s) => s.setSortDomaine)

  const [refreshing, setRefreshing]           = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [showNewModal, setShowNewModal]       = useState(false)
  const [renamingDomaine, setRenamingDomaine] = useState<DomaineInfo | null>(null)
  const [purgingDomaine, setPurgingDomaine]   = useState<{ domaine: DomaineInfo; summary: { documentCount: number; projectCount: number } } | null>(null)

  const projectsRoot = config.projectsRoot

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true); setError(null)
    try {
      await refreshStore()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRefreshing(false)
    }
  }, [refreshStore])

  const handleProjectsRootChange = async (): Promise<void> => {
    const folder = await window.electronAPI.workspaceBrowse()
    if (!folder) return
    // Keep all three workspace-root keys in lockstep — picking here updates
    // the same thing Settings → Connections updates. See syncWorkspaceRoots
    // in main/config.ts for why this matters.
    saveConfig({
      holocronRoot: folder,
      projectsRoot: folder,
      workspace:    { ...config.workspace, path: folder },
    })
    await refresh()  // disk-existence filter on listDomaines depends on projectsRoot
  }

  const loading = !loadedOnce || refreshing

  // Workspace folder must be set before any Domaine can be created
  // (createDomaine refuses without projectsRoot — surfacing that as a card
  // gate avoids the silent failure path from Bug 1).
  if (!projectsRoot) {
    return (
      <div style={pageStyle}>
        <Header title="Domains" />
        <NoProjectsRoot onPick={() => void handleProjectsRootChange()} />
      </div>
    )
  }

  // Sort Domaines by the persisted preference. Domaines don't have a
  // separate "last modified" timestamp — created_at is the best signal
  // available, newest first.
  const sortedDomaines = [...domaines].sort((a, b) =>
    sortMode === 'name'
      ? a.name.localeCompare(b.name)
      : Date.parse(b.created_at || '') - Date.parse(a.created_at || ''),
  )

  return (
    <div style={pageStyle}>
      <Header
        title="Domains"
        right={
          <>
            <SortSelect mode={sortMode} onChange={setSortMode} />
            <button
              onClick={() => setShowNewModal(true)}
              style={pillButtonStyle(true)}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3a84ff'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              + New Domaine
            </button>
          </>
        }
      />

      {error && <Banner kind="error">{error}</Banner>}

      {loading ? (
        <LoadingCentered />
      ) : domaines.length === 0 ? (
        <EmptyCentered>
          no Domaines yet — click + New Domaine to create one
        </EmptyCentered>
      ) : (
        <div style={listScrollStyle}>
          {sortedDomaines.map((d) => (
            <DomaineCard
              key={d.id}
              domaine={d}
              onOpen={() => openDomaine(d.id)}
              onRename={() => setRenamingDomaine(d)}
              onDelete={async () => {
                try {
                  const summary = await window.electronAPI.domainesRenameSummary(d.id)
                  setPurgingDomaine({ domaine: d, summary })
                } catch (err) {
                  setError((err as Error).message)
                }
              }}
            />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewDomaineModal
          onClose={() => setShowNewModal(false)}
          onCreated={async () => { setShowNewModal(false); await refresh() }}
        />
      )}

      {renamingDomaine && (
        <EditDomaineModal
          domaine={renamingDomaine}
          onClose={() => setRenamingDomaine(null)}
          onSaved={async () => { await refresh() }}
        />
      )}

      {purgingDomaine && (
        <PurgeOrgModal
          title={`Purge Domain "${purgingDomaine.domaine.name}"`}
          itemName={purgingDomaine.domaine.name}
          summary={
            `${purgingDomaine.summary.projectCount} project${purgingDomaine.summary.projectCount === 1 ? '' : 's'}` +
            ` and ${purgingDomaine.summary.documentCount} document${purgingDomaine.summary.documentCount === 1 ? '' : 's'}` +
            ' will be permanently deleted from disk and the database.'
          }
          onClose={() => setPurgingDomaine(null)}
          onConfirm={async () => {
            console.log('[DomainesIndex] domainesDelete purge →', { id: purgingDomaine.domaine.id })
            const r = await window.electronAPI.domainesDelete(purgingDomaine.domaine.id, {
              mode: 'purge',
              confirmName: purgingDomaine.domaine.name,
            })
            console.log('[DomainesIndex] domainesDelete result', r)
            if (r.ok) {
              const dPath = projectsRoot ? `${projectsRoot}/${purgingDomaine.domaine.name}` : ''
              if (dPath) closeScribeTabsUnder(dPath)
              await refresh()
            }
            return r
          }}
        />
      )}
    </div>
  )
}

// ── View 2: single Domaine (Projects list) ────────────────────────────────

function DomaineView(): JSX.Element {
  const { config, saveConfig } = useSettingsStore()
  const activeDomaineId = useDomainesStore((s) => s.activeDomaineId)
  const domaines        = useDomainesStore((s) => s.domaines)
  const refreshStore    = useDomainesStore((s) => s.refresh)
  const openProject     = useDomainesStore((s) => s.openProject)
  const backToIndex     = useDomainesStore((s) => s.backToIndex)
  const sortMode        = useDomainesStore((s) => s.sortProject)
  const setSortMode     = useDomainesStore((s) => s.setSortProject)

  const activeDomaine = activeDomaineId ? domaines.find((d) => d.id === activeDomaineId) : null

  const [projects, setProjects]             = useState<ProjectInfo[]>([])
  const [loading, setLoading]               = useState(false)
  const [rootMissing, setRootMissing]       = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [renamingDomaine, setRenamingDomaine] = useState<DomaineInfo | null>(null)
  const [headerError, setHeaderError]         = useState<string | null>(null)
  const [renamingProject, setRenamingProject] = useState<ProjectInfo | null>(null)
  const [movingProject, setMovingProject]     = useState<ProjectInfo | null>(null)
  const [purgingProject, setPurgingProject]   = useState<{ project: ProjectInfo; summary: { threadCount: number; documentCount: number } } | null>(null)
  const [purgingDomaine, setPurgingDomaine]   = useState<{ domaine: DomaineInfo; summary: { documentCount: number; projectCount: number } } | null>(null)

  const projectsRoot = config.projectsRoot

  const loadProjects = useCallback(async (): Promise<void> => {
    if (!projectsRoot || !activeDomaineId) { setProjects([]); setRootMissing(false); return }
    setLoading(true)
    try {
      const exists = await window.electronAPI.fsExists(projectsRoot)
      if (!exists.exists || !exists.isDirectory) { setRootMissing(true); setProjects([]); return }
      setRootMissing(false)
      const list = await window.electronAPI.projectsList(projectsRoot, activeDomaineId)
      setProjects(list)
    } finally { setLoading(false) }
  }, [projectsRoot, activeDomaineId])

  useEffect(() => { void loadProjects() }, [loadProjects])

  const sorted = [...projects].sort((a, b) =>
    sortMode === 'name' ? a.name.localeCompare(b.name) : b.lastModified - a.lastModified,
  )

  const handleProjectsRootChange = async (): Promise<void> => {
    const folder = await window.electronAPI.workspaceBrowse()
    if (!folder) return
    // Keep all three workspace-root keys in lockstep (see syncWorkspaceRoots
    // in main/config.ts). Same value lands in holocronRoot / projectsRoot /
    // workspace.path so the backend never reads a stale projectsRoot.
    saveConfig({
      holocronRoot: folder,
      projectsRoot: folder,
      workspace:    { ...config.workspace, path: folder },
    })
    // (v11 reset removed the auto-migration trigger; user creates Domaines
    //  fresh — leftover folders are silently ignored by listProjects.)
  }

  // PR 1 reset: handleDeleteDomaine removed — the new reassign/purge UX
  // lands in PR 3 (DeleteDomaineModal in the header kebab).

  return (
    <div style={pageStyle}>
      <Header
        breadcrumb={[
          { label: 'Domains', onClick: backToIndex },
          { label: activeDomaine?.name ?? '…', current: true },
        ]}
        right={
          <>
            <SortSelect mode={sortMode} onChange={setSortMode} />
            {activeDomaine && (
              <>
                <button
                  onClick={() => {
                    console.log('[DomaineView] Rename Domaine clicked', { id: activeDomaine.id, name: activeDomaine.name })
                    setRenamingDomaine(activeDomaine)
                  }}
                  title="Rename Domain"
                  style={pillButtonStyle(true)}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3a84ff'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  Rename
                </button>
                <button
                  onClick={async () => {
                    console.log('[DomaineView] Delete Domaine clicked', { id: activeDomaine.id })
                    try {
                      const summary = await window.electronAPI.domainesRenameSummary(activeDomaine.id)
                      setPurgingDomaine({ domaine: activeDomaine, summary })
                    } catch (err) {
                      setHeaderError((err as Error).message)
                    }
                  }}
                  title="Delete Domain"
                  style={{ ...pillButtonStyle(true), color: 'var(--neon-pink)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--neon-pink)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
                >
                  Delete
                </button>
              </>
            )}
            <button
              onClick={() => setShowNewProject(true)}
              disabled={!projectsRoot}
              style={pillButtonStyle(!!projectsRoot)}
              onMouseEnter={(e) => { if (projectsRoot) { e.currentTarget.style.borderColor = '#3a84ff'; e.currentTarget.style.color = 'var(--text-primary)' } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              + New Project
            </button>
          </>
        }
      />

      {headerError && <Banner kind="error">{headerError}</Banner>}

      {projectsRoot && rootMissing && (
        <Banner kind="error">
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            ⚠ Projects folder not found: <span style={{ fontFamily: 'monospace' }}>{projectsRoot}</span>
          </span>
          <button
            onClick={() => void handleProjectsRootChange()}
            style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            Change Folder
          </button>
        </Banner>
      )}

      {!projectsRoot ? (
        <NoProjectsRoot onPick={() => void handleProjectsRootChange()} />
      ) : loading ? (
        <LoadingCentered />
      ) : sorted.length === 0 ? (
        <EmptyCentered>
          no projects in this Domaine yet — create one to get started
        </EmptyCentered>
      ) : (
        <div style={listScrollStyle}>
          {sorted.map((p) => (
            <Card
              key={p.path}
              name={p.name}
              stamp={formatStamp(p.lastModified)}
              metaText={`${p.threadCount} thread${p.threadCount !== 1 ? 's' : ''}`}
              isActive={config.activeProjectPath === p.path}
              onOpen={() => openProject(p)}
              activeLabel="ACTIVE PROJECT"
              affordances={{
                moveLabel: 'Move to Domain…',
                onRename: () => setRenamingProject(p),
                onMove:   () => setMovingProject(p),
                onPurge:  async () => {
                  try {
                    const summary = await window.electronAPI.projectsPurgeSummary(p.path)
                    setPurgingProject({ project: p, summary })
                  } catch (err) {
                    setHeaderError((err as Error).message)
                  }
                },
              }}
            />
          ))}
        </div>
      )}

      {showNewProject && (
        <NewProjectModal
          projectsRoot={projectsRoot}
          domaineId={activeDomaineId ?? undefined}
          onClose={() => setShowNewProject(false)}
          onCreated={async () => { setShowNewProject(false); await loadProjects() }}
          onChangeRoot={handleProjectsRootChange}
        />
      )}

      {renamingDomaine && (
        <EditDomaineModal
          domaine={renamingDomaine}
          onClose={() => setRenamingDomaine(null)}
          onSaved={async () => { await refreshStore() }}
        />
      )}

      {renamingProject && (
        <RenameOrgModal
          title={`Rename project "${renamingProject.name}"`}
          currentName={renamingProject.name}
          placeholder="e.g. The Chalet"
          onClose={() => setRenamingProject(null)}
          onConfirm={async (newName) => {
            const r = await window.electronAPI.projectsRename(renamingProject.path, newName)
            if (r.ok) await loadProjects()
            return r
          }}
        />
      )}

      {movingProject && (
        <MoveProjectModal
          projectName={movingProject.name}
          currentDomaineId={activeDomaineId}
          domaines={domaines}
          onClose={() => setMovingProject(null)}
          onConfirm={async (targetDomaineId) => {
            const r = await window.electronAPI.projectsMove(movingProject.name, targetDomaineId)
            if (r.ok) {
              await loadProjects()
              await refreshStore()  // project counts in other domaines change
            }
            return r
          }}
        />
      )}

      {purgingProject && (
        <PurgeOrgModal
          title={`Purge project "${purgingProject.project.name}"`}
          itemName={purgingProject.project.name}
          summary={
            `${purgingProject.summary.threadCount} thread${purgingProject.summary.threadCount === 1 ? '' : 's'}` +
            ` and ${purgingProject.summary.documentCount} document${purgingProject.summary.documentCount === 1 ? '' : 's'}` +
            ' will be permanently deleted from disk and the database.'
          }
          onClose={() => setPurgingProject(null)}
          onConfirm={async () => {
            const r = await window.electronAPI.projectsPurge(purgingProject.project.path, purgingProject.project.name)
            if (r.ok) {
              closeScribeTabsUnder(purgingProject.project.path)
              await loadProjects()
              await refreshStore()
            }
            return r
          }}
        />
      )}

      {purgingDomaine && (
        <PurgeOrgModal
          title={`Purge Domain "${purgingDomaine.domaine.name}"`}
          itemName={purgingDomaine.domaine.name}
          summary={
            `${purgingDomaine.summary.projectCount} project${purgingDomaine.summary.projectCount === 1 ? '' : 's'}` +
            ` and ${purgingDomaine.summary.documentCount} document${purgingDomaine.summary.documentCount === 1 ? '' : 's'}` +
            ' will be permanently deleted from disk and the database.'
          }
          onClose={() => setPurgingDomaine(null)}
          onConfirm={async () => {
            const r = await window.electronAPI.domainesDelete(purgingDomaine.domaine.id, {
              mode: 'purge',
              confirmName: purgingDomaine.domaine.name,
            })
            if (r.ok) {
              const dPath = projectsRoot ? `${projectsRoot}/${purgingDomaine.domaine.name}` : ''
              if (dPath) closeScribeTabsUnder(dPath)
              await refreshStore()
              backToIndex()  // Domaine no longer exists; bounce to the grid
            }
            return r
          }}
        />
      )}
    </div>
  )
}

// ── View 3: single Project (Threads list) ─────────────────────────────────

function ProjectView(): JSX.Element {
  const { config }      = useSettingsStore()
  const setActiveTab    = useSessionStore((s) => s.setActiveTab)
  const activeProject   = useDomainesStore((s) => s.activeProject)
  const activeDomaineId = useDomainesStore((s) => s.activeDomaineId)
  const domaines        = useDomainesStore((s) => s.domaines)
  const projectDomaineMap = useDomainesStore((s) => s.projectDomaineMap)
  const refreshStore    = useDomainesStore((s) => s.refresh)
  const backToDomaine   = useDomainesStore((s) => s.backToDomaine)
  const backToIndex     = useDomainesStore((s) => s.backToIndex)
  const sortMode        = useDomainesStore((s) => s.sortThread)
  const setSortMode     = useDomainesStore((s) => s.setSortThread)

  const activeDomaine = activeDomaineId ? domaines.find((d) => d.id === activeDomaineId) : null

  const [threads, setThreads]               = useState<ThreadInfo[]>([])
  const [loading, setLoading]               = useState(false)
  const [showNewThread, setShowNewThread]   = useState(false)
  const [query, setQuery]                   = useState('')
  const [headerError, setHeaderError]       = useState<string | null>(null)
  const [renamingThread, setRenamingThread] = useState<ThreadInfo | null>(null)
  const [movingThread, setMovingThread]     = useState<ThreadInfo | null>(null)
  const [purgingThread, setPurgingThread]   = useState<{ thread: ThreadInfo; summary: { documentCount: number } } | null>(null)

  const loadThreads = useCallback(async (): Promise<void> => {
    if (!activeProject) return
    setLoading(true)
    try {
      const list = await window.electronAPI.threadsList(activeProject.path)
      setThreads(list)
    } finally { setLoading(false) }
  }, [activeProject])

  useEffect(() => { void loadThreads() }, [loadThreads])

  const sorted = [...threads].sort((a, b) =>
    sortMode === 'name' ? a.name.localeCompare(b.name) : b.lastModified - a.lastModified,
  )
  const q = query.trim().toLowerCase()
  const filtered = q ? sorted.filter((t) => t.name.toLowerCase().includes(q)) : sorted

  const handleThreadLoad = async (t: ThreadInfo): Promise<void> => {
    if (!activeProject) return
    await loadThread(activeProject.name, activeProject.path, t.name, t.path)
    setActiveTab('scribe')
  }

  if (!activeProject) {
    // Shouldn't happen — backToIndex if so.
    return <DomainesIndex />
  }

  return (
    <div style={pageStyle}>
      <Header
        breadcrumb={[
          { label: 'Domains', onClick: backToIndex },
          { label: activeDomaine?.name ?? '…', onClick: backToDomaine },
          { label: activeProject.name, current: true },
        ]}
        right={
          <>
            <SortSelect mode={sortMode} onChange={setSortMode} />
            <button
              onClick={() => setShowNewThread(true)}
              style={pillButtonStyle(true)}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3a84ff'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              + New Thread
            </button>
          </>
        }
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search threads…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg-card)', border: '1px solid var(--border-default)',
              borderRadius: 6, padding: '6px 10px', fontSize: 12,
              color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>

        {loading ? (
          <LoadingCentered />
        ) : threads.length === 0 ? (
          <EmptyCentered>no threads yet — create one to get started</EmptyCentered>
        ) : filtered.length === 0 ? (
          <EmptyCentered>No threads match &ldquo;{query}&rdquo;</EmptyCentered>
        ) : (
          <div style={listScrollStyle}>
            {filtered.map((t) => (
              <Card
                key={t.path}
                name={t.name}
                stamp={formatStamp(t.lastModified)}
                metaText={`${t.fileCount} file${t.fileCount !== 1 ? 's' : ''}${t.isComplete ? ' · DONE' : ''}`}
                isActive={t.isActive}
                onOpen={() => void handleThreadLoad(t)}
                activeLabel="ACTIVE"
                affordances={{
                  moveLabel: 'Move to Project…',
                  onRename: () => setRenamingThread(t),
                  onMove:   () => setMovingThread(t),
                  onPurge:  async () => {
                    try {
                      const summary = await window.electronAPI.threadsPurgeSummary(t.path)
                      setPurgingThread({ thread: t, summary })
                    } catch (err) {
                      setHeaderError((err as Error).message)
                    }
                  },
                }}
              />
            ))}
          </div>
        )}
      </div>

      {headerError && (
        <div style={{ position: 'absolute', top: 60, left: 16, right: 16, zIndex: 50 }}>
          <Banner kind="error">
            <span style={{ flex: 1 }}>{headerError}</span>
            <button
              onClick={() => setHeaderError(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, padding: '2px 6px' }}
            >
              ✕
            </button>
          </Banner>
        </div>
      )}

      {showNewThread && (
        <NewThreadModal
          project={activeProject}
          onClose={() => setShowNewThread(false)}
          onCreated={async () => { setShowNewThread(false); await loadThreads() }}
        />
      )}

      {renamingThread && (
        <RenameOrgModal
          title={`Rename thread "${renamingThread.name}"`}
          currentName={renamingThread.name}
          placeholder="e.g. Permit research"
          onClose={() => setRenamingThread(null)}
          onConfirm={async (newName) => {
            const oldThreadPath = `${activeProject.path}/${renamingThread.name}`
            const r = await window.electronAPI.threadsRename(activeProject.path, renamingThread.name, newName)
            if (r.ok) {
              // Session 10 — if the renamed thread was the active one,
              // remap any open editor tabs (path-prefix rewrite) and pull
              // the freshly-saved config from main. Main already wrote
              // activeThreadPath/Name inside the rename lock; loadConfig()
              // re-hydrates the renderer's mirror.
              if (r.wasActive && r.newPath) {
                useScribeStore.getState().remapPathsByPrefix(oldThreadPath, r.newPath)
                await useSettingsStore.getState().loadConfig()
              }
              await loadThreads()
            }
            // RenameOrgModal expects `{ ok, error? }`; the widened return
            // shape is a strict superset, so this narrowing is safe.
            return { ok: r.ok, error: r.error }
          }}
        />
      )}

      {movingThread && (
        <MoveThreadModal
          threadName={movingThread.name}
          currentProjectPath={activeProject.path}
          projectsRoot={config.projectsRoot}
          domaines={domaines}
          projectDomaineMap={projectDomaineMap}
          onClose={() => setMovingThread(null)}
          onConfirm={async (targetProjectPath) => {
            const r = await window.electronAPI.threadsMove(activeProject.path, movingThread.name, targetProjectPath)
            if (r.ok) {
              await loadThreads()
              await refreshStore()
            }
            return r
          }}
        />
      )}

      {purgingThread && (
        <PurgeOrgModal
          title={`Purge thread "${purgingThread.thread.name}"`}
          itemName={purgingThread.thread.name}
          summary={
            `${purgingThread.summary.documentCount} document${purgingThread.summary.documentCount === 1 ? '' : 's'}` +
            ' will be permanently deleted from disk and the database.'
          }
          onClose={() => setPurgingThread(null)}
          onConfirm={async () => {
            const r = await window.electronAPI.threadsPurge(purgingThread.thread.path, purgingThread.thread.name)
            if (r.ok) {
              closeScribeTabsUnder(purgingThread.thread.path)
              await loadThreads()
            }
            return r
          }}
        />
      )}
    </div>
  )
}

// ── Header + breadcrumb ───────────────────────────────────────────────────

interface BreadcrumbStep { label: string; onClick?: () => void; current?: boolean }

function Header({
  title,
  breadcrumb,
  right,
}: {
  title?: string
  breadcrumb?: BreadcrumbStep[]
  right?: React.ReactNode
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
      {title && !breadcrumb ? (
        <span style={crumbTitleStyle}>{title}</span>
      ) : breadcrumb ? (
        <Breadcrumb steps={breadcrumb} />
      ) : <span />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {right}
      </div>
    </div>
  )
}

function Breadcrumb({ steps }: { steps: BreadcrumbStep[] }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'monospace', minWidth: 0, overflow: 'hidden' }}>
      {steps.map((s, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
          {i > 0 && <span style={{ color: 'var(--text-dim)' }}>/</span>}
          {s.current ? (
            <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
              {s.label.toUpperCase()}
            </span>
          ) : (
            <button
              onClick={s.onClick}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'inherit', fontWeight: 700, letterSpacing: '0.12em', padding: 0 }}
            >
              {s.label}
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

const crumbTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', fontFamily: 'monospace',
}

function SortSelect({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }): JSX.Element {
  return (
    <select
      value={mode}
      onChange={(e) => onChange(e.target.value as SortMode)}
      style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
    >
      <option value="mtime">Last modified</option>
      <option value="name">Name</option>
    </select>
  )
}

// ── Domaine card ──────────────────────────────────────────────────────────

function DomaineCard({
  domaine,
  onOpen,
  onRename,
  onDelete,
}: {
  domaine: DomaineInfo
  onOpen: () => void
  onRename?: () => void
  onDelete?: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const accent = domaine.color || 'var(--neon-blue)'
  const hasAffordances = !!(onRename || onDelete)
  // Reserve right-margin for the inline action button cluster so the date
  // stamp doesn't collide with it.
  const actionClusterWidth = (onRename ? 32 : 0) + (onDelete ? 32 : 0)

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: 'var(--bg-card)',
        border: hovered ? `1px solid ${accent}` : '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 150ms var(--ease-out), border-color 150ms var(--ease-out), box-shadow 150ms var(--ease-out)',
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-xs)',
        userSelect: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Color stripe (Fey-style accent) — visible only when the Domaine has
          a custom color set, otherwise a neutral hairline rule. */}
      {domaine.color && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: accent,
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8, paddingLeft: domaine.color ? 8 : 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
          {domaine.name}
        </span>
        {domaine.created_at && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap', marginRight: hasAffordances ? actionClusterWidth + 4 : 0 }}>
            {formatCreated(domaine.created_at)}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)', paddingLeft: domaine.color ? 8 : 0 }}>
        <span>{domaine.projectCount} project{domaine.projectCount !== 1 ? 's' : ''}</span>
        {domaine.description && (
          <>
            <span>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {domaine.description}
            </span>
          </>
        )}
      </div>
      {/* Bug 3 fix (third attempt): replaced the kebab popover with three
          always-visible inline icon-buttons. The kebab wasn't firing reliably
          and Andy got zero handler logs in the last pass. Inline buttons
          eliminate the popover indirection — each click goes directly to a
          dedicated handler. */}
      {hasAffordances && (
        <div
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 4 }}
          onClick={(e) => e.stopPropagation()}
        >
          {onRename && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                console.log('[DomaineCard] Rename clicked', { id: domaine.id, name: domaine.name })
                onRename()
              }}
              title="Rename"
              aria-label={`Rename ${domaine.name}`}
              style={domaineActionBtnStyle}
            >
              <IconEdit size={14} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                console.log('[DomaineCard] Delete clicked', { id: domaine.id })
                onDelete()
              }}
              title="Delete"
              aria-label={`Delete ${domaine.name}`}
              style={{ ...domaineActionBtnStyle, color: 'var(--neon-pink)' }}
            >
              <IconTrash size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const domaineActionBtnStyle: React.CSSProperties = {
  width: 28, height: 28,
  borderRadius: 6,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border-default)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-secondary)',
  padding: 0,
  fontFamily: 'inherit',
}

// ── Kebab menu (hover-reveal on cards, always-visible in headers) ─────────

interface KebabMenuItem {
  label:    string
  icon?:    React.ReactNode
  onClick:  () => void
  danger?:  boolean
}

function KebabMenu({
  visible,
  open,
  onOpenChange,
  items,
}: {
  visible:      boolean
  open:         boolean
  onOpenChange: (open: boolean) => void
  items:        KebabMenuItem[]
}): JSX.Element {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null)

  // Position the popover via fixed coords from the button's bounding rect.
  // The popover is rendered via a portal (see below) — required because
  // the parent Card has `transform: translateY(...)` on hover, which makes
  // it the containing block for any `position: fixed` descendant
  // (CSS-spec edge case: transform creates a new containing block for
  // fixed-positioned elements). Without the portal the popover appears
  // far below the trigger because viewport coords from getBoundingClientRect
  // get interpreted relative to the transformed Card rather than the
  // viewport itself.
  //
  // Vertical flip: if the popover would extend below the viewport
  // (estimated ≤ 150px tall for 3 items), anchor it above the trigger
  // instead so it never gets clipped at the bottom edge.
  useEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const POPOVER_H_EST = 150
    const wouldOverflowBottom = rect.bottom + POPOVER_H_EST + 8 > window.innerHeight
    setPopoverPos({
      top:   wouldOverflowBottom
        ? Math.max(8, rect.top - POPOVER_H_EST - 4)
        : rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); onOpenChange(!open) }}
        title="More actions"
        aria-label="More actions"
        style={{
          width: 24, height: 24, borderRadius: 4,
          background: open ? 'rgba(255,255,255,0.06)' : 'transparent',
          border: 'none', padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-secondary)',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity 120ms var(--ease-out), background 120ms',
        }}
      >
        <IconKebab size={14} />
      </button>
      {open && popoverPos && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={(e) => { e.stopPropagation(); onOpenChange(false) }}
          />
          <div
            style={{
              position:   'fixed',
              top:        popoverPos.top,
              right:      popoverPos.right,
              minWidth:   160,
              padding:    4,
              background: 'var(--bg-panel)',
              border:     '1px solid var(--border-default)',
              borderRadius: 6,
              boxShadow:  'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.4))',
              zIndex:     9999,
              display:    'flex',
              flexDirection: 'column',
              gap: 2,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); item.onClick(); onOpenChange(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'none', border: 'none', textAlign: 'left',
                  padding: '7px 10px', borderRadius: 4, cursor: 'pointer',
                  fontSize: 12, fontFamily: 'inherit',
                  color: item.danger ? 'var(--neon-pink)' : 'var(--text-primary)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
              >
                {item.icon && <span style={{ display: 'flex' }}>{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

// ── Project / Thread card (unchanged from pre-refactor) ───────────────────

interface CardAffordances {
  onRename?: () => void
  onMove?:   () => void
  onPurge?:  () => void
  moveLabel: string  // "Move to Domaine…" or "Move to Project…"
}

function Card({
  name,
  stamp,
  metaText,
  isActive,
  onOpen,
  activeLabel,
  affordances,
}: {
  name: string
  stamp: string
  metaText: string
  isActive: boolean
  onOpen: () => void
  activeLabel: string
  affordances?: CardAffordances
}): JSX.Element {
  const [hovered, setHovered]   = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const hasAffordances = !!(affordances && (affordances.onRename || affordances.onMove || affordances.onPurge))
  const showKebab = hasAffordances && (hovered || menuOpen)

  const cardBorder = isActive
    ? '1px solid #00ff88'
    : hovered
    ? '1px solid #1e4aff'
    : '1px solid var(--border-default)'
  const cardShadow = isActive
    ? hovered ? '0 0 16px #00ff8850' : '0 0 12px #00ff8830'
    : hovered
    ? '0 0 12px #1e4aff30'
    : 'none'

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: 'var(--bg-card)',
        border: cardBorder,
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 150ms var(--ease-out), border-color 150ms var(--ease-out), box-shadow 150ms var(--ease-out)',
        boxShadow: cardShadow !== 'none' ? cardShadow : (hovered ? 'var(--shadow-md)' : 'var(--shadow-xs)'),
        userSelect: 'none',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
          {name}
        </span>
        {stamp && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap', marginRight: hasAffordances ? 28 : 0 }}>{stamp}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
        <span>{metaText}</span>
        {isActive && (
          <>
            <span>·</span>
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: '#00ff88', background: '#001a0d', border: '1px solid #00ff8840', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#00ff88', display: 'inline-block', animation: 'neon-pulse 2s ease-in-out infinite' }} />
              {activeLabel}
            </span>
          </>
        )}
      </div>
      {hasAffordances && affordances && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
          <KebabMenu
            visible={showKebab}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            items={[
              ...(affordances.onRename ? [{ label: 'Rename…',          icon: <IconEdit  size={12} />, onClick: affordances.onRename }]                : []),
              ...(affordances.onMove   ? [{ label: affordances.moveLabel, onClick: affordances.onMove }]                                              : []),
              ...(affordances.onPurge  ? [{ label: 'Purge…',           icon: <IconTrash size={12} />, onClick: affordances.onPurge, danger: true as const }] : []),
            ]}
          />
        </div>
      )}
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────

function NewDomaineModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => Promise<void>
}): JSX.Element {
  const { config } = useSettingsStore()
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor]             = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  const handleCreate = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || loading) return
    setLoading(true); setError('')
    try {
      console.log('[NewDomaineModal] domainesCreate →', { name: trimmed, projectsRoot: config.projectsRoot })
      const result = await window.electronAPI.domainesCreate({
        name: trimmed,
        description: description.trim() || undefined,
        color: color ?? undefined,
      })
      console.log('[NewDomaineModal] domainesCreate ←', result)
      if (!result.ok) { setError(result.error ?? 'Failed to create Domain'); setLoading(false); return }

      // Bug 1 belt-and-suspenders: verify the folder actually landed on disk
      // before reporting success. If the backend lied or something raced, the
      // user sees an actionable error instead of a silent "created in DB only"
      // zombie row.
      if (config.projectsRoot) {
        const folderPath = `${config.projectsRoot}/${trimmed}`
        const check = await window.electronAPI.fsExists(folderPath)
        console.log('[NewDomaineModal] post-create fsExists', { folderPath, check })
        if (!check.exists || !check.isDirectory) {
          setError(`Domain row created but folder missing on disk: ${folderPath}. Check console for [createDomaine] logs.`)
          setLoading(false)
          return
        }
      }

      await onCreated()
    } catch (err) {
      console.error('[NewDomaineModal] threw:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <ModalShell title="New Domain" onClose={onClose}>
      <FieldLabel>Name</FieldLabel>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setError('') }}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') onClose() }}
        placeholder="e.g. Personal, Work, Research"
        style={inputStyle}
      />

      <FieldLabel>Description <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></FieldLabel>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What this Domain is for"
        style={inputStyle}
      />

      <FieldLabel>Color <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional accent)</span></FieldLabel>
      <ColorPicker value={color} onChange={setColor} />

      {error && <ErrorBox>{error}</ErrorBox>}

      <ModalButtons
        onCancel={onClose}
        onConfirm={() => void handleCreate()}
        confirmDisabled={!name.trim() || loading}
        confirmLabel={loading ? 'Creating…' : 'Create'}
      />
    </ModalShell>
  )
}

/** Default seed for the native color wheel when no color has been picked
 *  yet. Matches the prior PALETTE[0] (neon-blue) so the swatch looks
 *  familiar on first open even though the user is now free to pick
 *  anything from the OS picker. */
const COLOR_PICKER_SEED = '#00d4ff'

/** Domain color picker — native `<input type="color">` color wheel plus a
 *  "no color" toggle that round-trips `null` for "use default accent."
 *  Replaces the prior six-button fixed PALETTE (Session 10) so Andy can
 *  pick any color without us choosing for him. Shared by both
 *  `NewDomaineModal` (creation flow) and `EditDomaineModal` (edit-pencil
 *  flow); keep the `{ value, onChange }` signature stable. */
function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }): JSX.Element {
  // The <input type="color"> element requires a non-empty string value; we
  // map `null` (no color) to the seed so the swatch stays renderable. The
  // "no color" toggle below routes back to `null` explicitly.
  const inputValue = value ?? COLOR_PICKER_SEED
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => onChange(null)}
        title="No color (use default accent)"
        aria-pressed={value === null}
        style={{
          width: 28, height: 28, borderRadius: 14,
          background: 'transparent',
          // Use the same diagonal-stroke convention as macOS for "no color"
          // so the null state reads at a glance against any theme.
          backgroundImage: 'linear-gradient(135deg, transparent calc(50% - 1px), var(--text-dim) calc(50% - 1px), var(--text-dim) calc(50% + 1px), transparent calc(50% + 1px))',
          border: value === null ? '2px solid var(--text-primary)' : '1px solid var(--border-default)',
          cursor: 'pointer', padding: 0,
        }}
      />
      <input
        type="color"
        value={inputValue}
        onChange={(e) => onChange(e.target.value)}
        title={value ?? 'Pick a color'}
        // The OS native picker draws its own swatch; we wrap with a thin
        // ring matching the "no color" button's selected style so the two
        // affordances feel like a single picker rather than disjoint
        // controls. webkit-appearance:none drops Chrome's default chrome
        // around the input so our outer ring is the only border.
        style={{
          width: 32, height: 32, padding: 0,
          border: value === null ? '1px solid var(--border-default)' : '2px solid var(--text-primary)',
          borderRadius: 16,
          background: 'transparent',
          cursor: 'pointer',
          WebkitAppearance: 'none' as React.CSSProperties['WebkitAppearance'],
          appearance: 'none',
        }}
      />
      {value && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
          {value}
        </span>
      )}
    </div>
  )
}

/**
 * Edit-pencil modal for a single Domain — combines name + color edits in
 * one save (Session 10). Domain-specific by design: Projects and Threads
 * use `RenameOrgModal` because they don't carry a color today. If a
 * future surface adds Project/Thread colors, extend the generic modal
 * rather than introducing a sibling here.
 *
 * Notes on the deletion-then-resurrection history: Session 9 deleted the
 * prior `EditDomaineModal` for being dead code (rename modal was the only
 * Domain-edit affordance and didn't carry a color field). Session 10 adds
 * back name + color editing on the pencil, so this is the same shape
 * minus the prior fixed-palette UX — the picker is now a native color
 * wheel via `ColorPicker`.
 */
function EditDomaineModal({
  domaine,
  onClose,
  onSaved,
}: {
  domaine: DomaineInfo
  onClose: () => void
  onSaved: () => Promise<void>
}): JSX.Element {
  const [name, setName]           = useState(domaine.name)
  const [color, setColor]         = useState<string | null>(domaine.color ?? null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  // Save dispatches only the fields that changed — preserves the
  // domainesUpdate IPC's "undefined = no change, null = clear" contract
  // (see ipc.ts:739 → domaineFs.updateDomaine:273). Sending `name: name`
  // unchanged would still pass through the folder-rename path on main,
  // so we omit it when there's no diff.
  const handleSave = async (): Promise<void> => {
    const trimmedName = name.trim()
    if (!trimmedName || loading) return
    const nameChanged  = trimmedName !== domaine.name
    const colorChanged = color !== (domaine.color ?? null)
    if (!nameChanged && !colorChanged) { onClose(); return }

    setLoading(true); setError('')
    try {
      const r = await window.electronAPI.domainesUpdate({
        id: domaine.id,
        ...(nameChanged  ? { name:  trimmedName } : {}),
        ...(colorChanged ? { color: color }      : {}),
      })
      if (!r.ok) { setError(r.error ?? 'Failed to save Domain'); setLoading(false); return }
      await onSaved()
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <ModalShell title={`Edit Domain "${domaine.name}"`} onClose={onClose}>
      <FieldLabel>Name</FieldLabel>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setError('') }}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); if (e.key === 'Escape') onClose() }}
        placeholder="e.g. Personal, Work, Research"
        style={inputStyle}
      />

      <FieldLabel>Color <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional accent)</span></FieldLabel>
      <ColorPicker value={color} onChange={setColor} />

      {error && <ErrorBox>{error}</ErrorBox>}

      <ModalButtons
        onCancel={onClose}
        onConfirm={() => void handleSave()}
        confirmDisabled={
          !name.trim() ||
          loading ||
          (name.trim() === domaine.name && color === (domaine.color ?? null))
        }
        confirmLabel={loading ? 'Saving…' : 'Save'}
      />
    </ModalShell>
  )
}

// ── Rename / Move / Purge modals (Projects + Threads) ────────────────────

// Exported so the in-Scribe rename pencil (ScribePane.tsx, Session 10)
// can reuse the same modal shell. The Domain pencil now uses
// `EditDomaineModal` instead, but Projects/Threads still flow through
// this generic rename.
export function RenameOrgModal({
  title,
  currentName,
  placeholder,
  onClose,
  onConfirm,
}: {
  title:       string
  currentName: string
  placeholder: string
  onClose:     () => void
  onConfirm:   (newName: string) => Promise<{ ok: boolean; error?: string }>
}): JSX.Element {
  const [name, setName]       = useState(currentName)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSave = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || loading) return
    if (trimmed === currentName) { onClose(); return }
    setLoading(true); setError('')
    const result = await onConfirm(trimmed)
    if (!result.ok) { setError(result.error ?? 'Rename failed'); setLoading(false); return }
    onClose()
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <FieldLabel>Name</FieldLabel>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setError('') }}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); if (e.key === 'Escape') onClose() }}
        placeholder={placeholder}
        style={inputStyle}
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      <ModalButtons
        onCancel={onClose}
        onConfirm={() => void handleSave()}
        confirmDisabled={!name.trim() || name.trim() === currentName || loading}
        confirmLabel={loading ? 'Renaming…' : 'Rename'}
      />
    </ModalShell>
  )
}

function MoveProjectModal({
  projectName,
  currentDomaineId,
  domaines,
  onClose,
  onConfirm,
}: {
  projectName:      string
  currentDomaineId: string | null
  domaines:         DomaineInfo[]
  onClose:          () => void
  onConfirm:        (targetDomaineId: string) => Promise<{ ok: boolean; error?: string }>
}): JSX.Element {
  const [target, setTarget]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleMove = async (): Promise<void> => {
    if (!target || loading) return
    setLoading(true); setError('')
    const result = await onConfirm(target)
    if (!result.ok) { setError(result.error ?? 'Move failed'); setLoading(false); return }
    onClose()
  }

  return (
    <ModalShell title={`Move "${projectName}"`} onClose={onClose}>
      <FieldLabel>Target Domaine</FieldLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16, maxHeight: 240, overflowY: 'auto' }}>
        {domaines.map((d) => {
          const isCurrent = d.id === currentDomaineId
          const isSelected = d.id === target
          return (
            <button
              key={d.id}
              onClick={() => !isCurrent && setTarget(d.id)}
              disabled={isCurrent}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px',
                background: isSelected ? 'var(--bg-card)' : 'transparent',
                border: isSelected ? '1px solid var(--neon-blue)' : '1px solid var(--border-subtle)',
                borderRadius: 6,
                cursor: isCurrent ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                color: isCurrent ? 'var(--text-dim)' : 'var(--text-primary)',
                opacity: isCurrent ? 0.5 : 1,
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 5, background: d.color || 'var(--neon-blue)', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{d.name}</span>
              {isCurrent && <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace' }}>CURRENT</span>}
            </button>
          )
        })}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <ModalButtons
        onCancel={onClose}
        onConfirm={() => void handleMove()}
        confirmDisabled={!target || loading}
        confirmLabel={loading ? 'Moving…' : 'Move'}
      />
    </ModalShell>
  )
}

function MoveThreadModal({
  threadName,
  currentProjectPath,
  projectsRoot,
  domaines,
  projectDomaineMap,
  onClose,
  onConfirm,
}: {
  threadName:         string
  currentProjectPath: string
  projectsRoot:       string
  domaines:           DomaineInfo[]
  projectDomaineMap:  Record<string, string>
  onClose:            () => void
  onConfirm:          (targetProjectPath: string) => Promise<{ ok: boolean; error?: string }>
}): JSX.Element {
  const [allProjects, setAllProjects]   = useState<ProjectInfo[]>([])
  const [loadingList, setLoadingList]   = useState(true)
  const [target, setTarget]             = useState<string | null>(null)  // target project path
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // Sort the cross-Domaine project list A→Z for the move-thread
        // target dropdown. (The per-Domaine project + thread grids in
        // Domaines.tsx already sort via the user-controllable SortMode;
        // this picker has no mode toggle, so default to alphabetical.)
        const list = sortByName(await window.electronAPI.projectsList(projectsRoot))
        if (!cancelled) setAllProjects(list)
      } finally {
        if (!cancelled) setLoadingList(false)
      }
    })()
    return () => { cancelled = true }
  }, [projectsRoot])

  const handleMove = async (): Promise<void> => {
    if (!target || loading) return
    setLoading(true); setError('')
    const result = await onConfirm(target)
    if (!result.ok) { setError(result.error ?? 'Move failed'); setLoading(false); return }
    onClose()
  }

  // Group projects by Domaine. The map gives id; resolve to name via list.
  // Projects without a namespace row (never ingested) fall under General.
  const generalDomaine = domaines.find((d) => d.name === 'General')
  const grouped = new Map<string, { domaine: DomaineInfo | null; projects: ProjectInfo[] }>()
  for (const d of domaines) grouped.set(d.id, { domaine: d, projects: [] })
  for (const p of allProjects) {
    if (p.path === currentProjectPath) continue  // exclude current
    const dId = projectDomaineMap[p.name] ?? generalDomaine?.id ?? ''
    let bucket = grouped.get(dId)
    if (!bucket) {
      bucket = { domaine: generalDomaine ?? null, projects: [] }
      grouped.set(dId, bucket)
    }
    bucket.projects.push(p)
  }

  return (
    <ModalShell title={`Move thread "${threadName}"`} onClose={onClose}>
      <FieldLabel>Target Project</FieldLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16, maxHeight: 320, overflowY: 'auto' }}>
        {loadingList ? (
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'monospace', padding: '8px 0' }}>Loading…</span>
        ) : (
          Array.from(grouped.values())
            .filter((g) => g.projects.length > 0)
            .map((g) => (
              <div key={g.domaine?.id ?? 'orphan'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px', fontSize: 10, fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: g.domaine?.color || 'var(--neon-blue)' }} />
                  {g.domaine?.name ?? 'General'}
                </div>
                {g.projects.map((p) => {
                  const isSelected = p.path === target
                  return (
                    <button
                      key={p.path}
                      onClick={() => setTarget(p.path)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px 7px 22px',
                        marginLeft: 0,
                        background: isSelected ? 'var(--bg-card)' : 'transparent',
                        border: isSelected ? '1px solid var(--neon-blue)' : '1px solid transparent',
                        borderRadius: 6,
                        cursor: 'pointer', textAlign: 'left',
                        color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13,
                        width: '100%',
                      }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        {p.threadCount} thread{p.threadCount !== 1 ? 's' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
        )}
        {!loadingList && allProjects.length <= 1 && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'monospace', padding: '8px 0' }}>No other projects to move to.</span>
        )}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <ModalButtons
        onCancel={onClose}
        onConfirm={() => void handleMove()}
        confirmDisabled={!target || loading}
        confirmLabel={loading ? 'Moving…' : 'Move'}
      />
    </ModalShell>
  )
}

function PurgeOrgModal({
  title,
  itemName,
  summary,
  onClose,
  onConfirm,
}: {
  title:    string
  itemName: string  // exact name user must type
  summary:  string  // e.g. "3 threads, 47 documents will be permanently deleted."
  onClose:  () => void
  onConfirm: () => Promise<{ ok: boolean; error?: string }>
}): JSX.Element {
  const [typed, setTyped]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const matches = typed === itemName

  const handlePurge = async (): Promise<void> => {
    if (!matches || loading) return
    setLoading(true); setError('')
    const result = await onConfirm()
    if (!result.ok) { setError(result.error ?? 'Purge failed'); setLoading(false); return }
    onClose()
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <div style={{
        marginBottom: 14, padding: '10px 12px',
        background: 'rgba(255,45,120,0.08)',
        border: '1px solid rgba(255,45,120,0.3)',
        borderRadius: 6,
        fontSize: 12, color: 'var(--neon-pink)', lineHeight: 1.5,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>This cannot be undone.</div>
        {summary}
      </div>
      <FieldLabel>Type <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', textTransform: 'none', letterSpacing: 0 }}>{itemName}</span> to confirm</FieldLabel>
      <input
        autoFocus
        type="text"
        value={typed}
        onChange={(e) => { setTyped(e.target.value); setError('') }}
        onKeyDown={(e) => { if (e.key === 'Enter' && matches) void handlePurge(); if (e.key === 'Escape') onClose() }}
        placeholder={itemName}
        style={inputStyle}
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancel
        </button>
        <button
          onClick={() => void handlePurge()}
          disabled={!matches || loading}
          style={{
            background: matches && !loading ? 'var(--neon-pink)' : 'var(--bg-card)',
            color:      matches && !loading ? '#000'             : 'var(--text-dim)',
            border: 'none', borderRadius: 8, padding: '7px 16px',
            fontSize: 12, fontWeight: 700,
            cursor: matches && !loading ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Purging…' : 'Purge'}
        </button>
      </div>
    </ModalShell>
  )
}

function NewProjectModal({
  projectsRoot,
  domaineId,
  onClose,
  onCreated,
  onChangeRoot,
}: {
  projectsRoot: string
  domaineId?: string
  onClose: () => void
  onCreated: () => Promise<void>
  onChangeRoot: () => Promise<void>
}): JSX.Element {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async (): Promise<void> => {
    if (!name.trim() || loading) return
    setLoading(true); setError('')
    try {
      const result = await window.electronAPI.projectsCreate(projectsRoot, name.trim(), domaineId)
      if (!result.ok) { setError(result.error ?? 'Failed to create project'); setLoading(false); return }
      await onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <ModalShell title="New Project" onClose={onClose}>
      <FieldLabel>Project Name</FieldLabel>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setError('') }}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') onClose() }}
        placeholder="e.g. The Chalet"
        style={inputStyle}
      />

      <FieldLabel>Location</FieldLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div
          style={{
            flex: 1, minWidth: 0,
            fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)',
            background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
            borderRadius: 6, padding: '7px 10px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          title={projectsRoot}
        >
          {projectsRoot ? tildify(projectsRoot) : '(no folder set)'}
        </div>
        <button
          onClick={() => void onChangeRoot()}
          style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
        >
          Change
        </button>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <ModalButtons
        onCancel={onClose}
        onConfirm={() => void handleCreate()}
        confirmDisabled={!name.trim() || loading}
        confirmLabel={loading ? 'Creating…' : 'Create'}
      />
    </ModalShell>
  )
}

function NewThreadModal({
  project,
  onClose,
  onCreated,
}: {
  project: ProjectInfo
  onClose: () => void
  onCreated: () => Promise<void>
}): JSX.Element {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async (): Promise<void> => {
    if (!name.trim() || loading) return
    setLoading(true); setError('')
    try {
      const result = await window.electronAPI.threadsCreate(project.path, name.trim())
      if (!result.ok) { setError(result.error ?? 'Failed to create thread'); setLoading(false); return }
      await onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <ModalShell title="New Thread" onClose={onClose}>
      <FieldLabel>Thread Name</FieldLabel>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setError('') }}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') onClose() }}
        placeholder="e.g. Legal Issue - Tenant"
        style={inputStyle}
      />

      <FieldLabel>Inside</FieldLabel>
      <div
        style={{
          fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)',
          background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
          borderRadius: 6, padding: '7px 10px', marginBottom: 16,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
        title={project.path}
      >
        {project.name}
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <ModalButtons
        onCancel={onClose}
        onConfirm={() => void handleCreate()}
        confirmDisabled={!name.trim() || loading}
        confirmLabel={loading ? 'Creating…' : 'Create'}
      />
    </ModalShell>
  )
}

// ── Modal building blocks ────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{ width: 420, backgroundColor: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-xl)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontFamily: 'monospace', marginBottom: 8 }}>
      {children}
    </label>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ marginBottom: 16, padding: '8px 12px', backgroundColor: 'rgba(255,45,120,0.1)', border: '1px solid rgba(255,45,120,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--neon-pink)' }}>
      {children}
    </div>
  )
}

function ModalButtons({
  onCancel,
  onConfirm,
  confirmDisabled,
  confirmLabel,
}: {
  onCancel: () => void
  onConfirm: () => void
  confirmDisabled: boolean
  confirmLabel: string
}): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <button
        onClick={onCancel}
        style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={confirmDisabled}
        style={{
          background: confirmDisabled ? 'var(--bg-card)' : 'var(--neon-blue)',
          color: confirmDisabled ? 'var(--text-dim)' : '#000',
          border: 'none', borderRadius: 8, padding: '7px 16px',
          fontSize: 12, fontWeight: 700,
          cursor: confirmDisabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {confirmLabel}
      </button>
    </div>
  )
}

// ── Shared atoms ─────────────────────────────────────────────────────────

function Banner({ kind, children }: { kind: 'error'; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, padding: '10px 16px',
      background: kind === 'error' ? 'rgba(255,45,120,0.08)' : 'transparent',
      border: kind === 'error' ? '1px solid rgba(255,45,120,0.25)' : 'none',
      flexShrink: 0,
      color: kind === 'error' ? '#ff2d78' : 'inherit',
      fontSize: 12,
    }}>
      {children}
    </div>
  )
}

function LoadingCentered(): JSX.Element {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'monospace' }}>Loading…</span>
    </div>
  )
}

function EmptyCentered({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{children}</span>
    </div>
  )
}

function NoProjectsRoot({ onPick }: { onPick: () => void }): JSX.Element {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 32 }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.7 }}>
        No projects folder configured.
        <br />
        Choose a folder where your projects will live.
      </span>
      <button
        onClick={onPick}
        style={{ background: 'var(--neon-blue)', color: '#000', border: 'none', borderRadius: 6, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
      >
        Pick Projects Folder
      </button>
    </div>
  )
}

// ── Inline style constants ───────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  height: '100%', width: '100%',
  backgroundColor: 'var(--bg-base)',
  overflow: 'hidden',
}

const listScrollStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto',
  padding: '12px 16px',
  display: 'flex', flexDirection: 'column', gap: 8,
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)',
  borderRadius: 6, padding: '8px 10px', fontSize: 13,
  color: 'var(--text-primary)', outline: 'none',
  fontFamily: 'inherit', marginBottom: 16,
}

function pillButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 20, padding: '6px 16px',
    fontSize: 13, fontWeight: 400,
    color: 'var(--text-secondary)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'inherit',
    transition: 'border-color 150ms, color 150ms',
    opacity: enabled ? 1 : 0.4,
  }
}
