import { create } from 'zustand'
import type { DomaineInfo, ProjectInfo } from '../types/ipc'

/** Drill-down state for the Domaines tab.
 *  index  → list of Domaine cards
 *  domaine → list of Projects in a single Domaine
 *  project → list of Threads in a single Project
 *  Persisted across tab switches via zustand; commit 4 will also persist
 *  the activeDomaineId across app launches via settingsStore. */
export type DomainesView = 'index' | 'domaine' | 'project'

export type SortMode = 'mtime' | 'name'

interface DomainesStore {
  view: DomainesView
  activeDomaineId: string | null     // the Domaine the user has drilled into
  activeProject:   ProjectInfo | null  // the Project the user has drilled into

  // Cached lists — refreshed lazily, reset on relevant store mutations.
  domaines:  DomaineInfo[]
  /** project-name → domaine_id mapping. Lookup helper for the DomaineBadge
   *  component: given a document's project_name, find its Domaine without
   *  per-doc IPC. Keyed by raw namespace name (includes __library__ /
   *  __inbox__ alongside real project names). */
  projectDomaineMap: Record<string, string>
  loadedOnce: boolean

  // Sort preferences per drill-down level. Stored here (not in local
  // component state) so they survive navigation away and back. The
  // `sortSidebar` field also lives here even though the Scribe file
  // navigator isn't a Domaines view — keeping all sort prefs together
  // mirrors Andy's request to persist them alongside one another.
  sortDomaine: SortMode
  sortProject: SortMode
  sortThread:  SortMode
  sortSidebar: SortMode

  // ── Actions ──
  setDomaines: (list: DomaineInfo[]) => void
  setProjectDomaineMap: (m: Record<string, string>) => void
  setLoadedOnce: (v: boolean) => void

  setSortDomaine: (m: SortMode) => void
  setSortProject: (m: SortMode) => void
  setSortThread:  (m: SortMode) => void
  setSortSidebar: (m: SortMode) => void

  /** Idempotent first-mount fetch. Safe to call from multiple components
   *  on the same render cycle — only the first call performs the IPC. */
  loadIfNeeded: () => Promise<void>

  /** Force-refresh both the Domaine list and the project→domaine map.
   *  Call after any mutation that may have reassigned namespaces (e.g. a
   *  delete with move-to-general). Bypasses the loadedOnce guard. */
  refresh: () => Promise<void>

  openDomaine: (id: string) => void
  openProject: (project: ProjectInfo) => void
  backToDomaine: () => void   // from Project view → its parent Domaine
  backToIndex:   () => void   // from anywhere → the Domaines grid
}

export const useDomainesStore = create<DomainesStore>((set, get) => ({
  view: 'index',
  activeDomaineId: null,
  activeProject:   null,
  domaines:        [],
  projectDomaineMap: {},
  loadedOnce:      false,
  sortDomaine: 'mtime',
  sortProject: 'mtime',
  sortThread:  'mtime',
  sortSidebar: 'name',  // file trees default to alphabetic (matches prior behavior)

  setDomaines:          (domaines) => set({ domaines }),
  setProjectDomaineMap: (projectDomaineMap) => set({ projectDomaineMap }),
  setLoadedOnce:        (loadedOnce) => set({ loadedOnce }),

  setSortDomaine: (sortDomaine) => set({ sortDomaine }),
  setSortProject: (sortProject) => set({ sortProject }),
  setSortThread:  (sortThread)  => set({ sortThread  }),
  setSortSidebar: (sortSidebar) => set({ sortSidebar }),

  loadIfNeeded: async () => {
    if (get().loadedOnce) return
    // Mark loadedOnce up-front so a second concurrent call doesn't fire a
    // duplicate IPC. If the call fails we still leave it marked — the
    // refresh button in the UI handles retries.
    set({ loadedOnce: true })
    await get().refresh()
  },

  refresh: async () => {
    try {
      const [listRes, mapRes] = await Promise.all([
        window.electronAPI.domainesList(),
        window.electronAPI.domainesProjectMap(),
      ])
      if (listRes.ok && listRes.data) set({ domaines: listRes.data })
      if (mapRes.ok && mapRes.data) {
        const m: Record<string, string> = {}
        for (const row of mapRes.data) m[row.name] = row.domaine_id
        set({ projectDomaineMap: m })
      }
    } catch (err) {
      console.warn('[Domaines] refresh failed:', (err as Error).message)
    }
  },

  openDomaine: (id) =>
    set({ view: 'domaine', activeDomaineId: id, activeProject: null }),

  openProject: (project) =>
    set({ view: 'project', activeProject: project }),

  backToDomaine: () =>
    set((s) => (s.activeDomaineId ? { view: 'domaine', activeProject: null } : { view: 'index' })),

  backToIndex: () =>
    set({ view: 'index', activeDomaineId: null, activeProject: null }),
}))
