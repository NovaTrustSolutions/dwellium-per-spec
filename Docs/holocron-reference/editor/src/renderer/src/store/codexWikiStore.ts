import { create } from 'zustand'
import type { PreviewDoc, PreviewMode } from '../components/codex/CodexPreview'

export type WikiTier = 'thread' | 'project' | 'domaine'

export interface WikiPageListItem {
  slug: string
  title: string
  source_count: number
  created_at: string
  updated_at: string
  content_head: string
  /** Dominant Domaine for this wiki page; null pre-assignment. */
  domaine_id: string | null
  /** Count of other Domaines whose docs contributed sources. */
  domaine_overflow_count: number
  /** Three-tier classification (migration 007). null for legacy rows. */
  tier: WikiTier | null
  /** project_name for tier-1 + tier-2; null for tier-3. */
  namespace: string | null
}

export type WikiSortKey = 'updated' | 'created' | 'title' | 'sources' | 'tier'
export type WikiSortDir = 'asc' | 'desc'
export type WikiTierFilter = WikiTier | 'all'

/** A single entry in the navigation history stack. Stores the minimum
 *  needed for CodexPreview to fetch + render — full content is loaded
 *  there, not cached here. */
export interface WikiNavEntry {
  doc: PreviewDoc
  mode: PreviewMode
}

interface LibraryWikiStore {
  // Grid state
  pages: WikiPageListItem[]
  loadedOnce: boolean
  loading: boolean
  error: string | null

  // Index controls — persisted across tab switches like Search's filters.
  filter: string
  sortKey: WikiSortKey
  sortDir: WikiSortDir
  tierFilter: WikiTierFilter
  /** Domaine filter. '' = "(All Domaines)" — the default. Lives in the store
   *  (not Wiki.tsx local state) so it persists across tab switches and
   *  doesn't reset to the active Domaine on every mount — same pattern as
   *  ingestStore.selectorDomaineId. */
  selectorDomaineId: string

  // Navigation history. When historyStack is empty we're at the grid view.
  // Otherwise we render historyStack[historyCursor]. Cursor advances on
  // navigateTo (forward truncates), retreats on goBack, advances on goForward.
  // resetTo (used when a grid card is clicked) clears prior history.
  historyStack: WikiNavEntry[]
  historyCursor: number

  setPages: (pages: WikiPageListItem[]) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  setLoadedOnce: (v: boolean) => void
  setFilter: (s: string) => void
  setSortKey: (k: WikiSortKey) => void
  setSortDir: (d: WikiSortDir) => void
  setTierFilter: (t: WikiTierFilter) => void
  setSelectorDomaineId: (id: string) => void

  /** Push a new entry onto history, advancing the cursor. Any forward
   *  history (entries past the current cursor) is truncated — standard
   *  browser-history semantics. */
  navigateTo: (entry: WikiNavEntry) => void

  /** Clear history entirely and start with this entry as the only one.
   *  Used when the user clicks a card from the grid — they're starting
   *  a fresh navigation session, not continuing a prior one. */
  resetTo: (entry: WikiNavEntry) => void

  goBack: () => void
  goForward: () => void

  /** Drop history and return to grid view. Used by the Index toolbar
   *  button and by the explicit "back to grid" affordance. */
  backToGrid: () => void
}

export const useCodexWikiStore = create<LibraryWikiStore>((set) => ({
  pages: [],
  loadedOnce: false,
  loading: false,
  error: null,
  filter: '',
  sortKey: 'updated',
  sortDir: 'desc',
  tierFilter: 'all',
  selectorDomaineId: '',
  historyStack: [],
  historyCursor: -1,

  setPages: (pages) => set({ pages }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLoadedOnce: (loadedOnce) => set({ loadedOnce }),
  setFilter: (filter) => set({ filter }),
  setSortKey: (sortKey) => set({ sortKey }),
  setSortDir: (sortDir) => set({ sortDir }),
  setTierFilter: (tierFilter) => set({ tierFilter }),
  setSelectorDomaineId: (selectorDomaineId) => set({ selectorDomaineId }),

  navigateTo: (entry) =>
    set((s) => {
      const trimmed = s.historyStack.slice(0, s.historyCursor + 1)
      return {
        historyStack: [...trimmed, entry],
        historyCursor: trimmed.length,
      }
    }),

  resetTo: (entry) => set({ historyStack: [entry], historyCursor: 0 }),

  goBack: () =>
    set((s) => (s.historyCursor > 0 ? { historyCursor: s.historyCursor - 1 } : {})),

  goForward: () =>
    set((s) =>
      s.historyCursor < s.historyStack.length - 1 ? { historyCursor: s.historyCursor + 1 } : {},
    ),

  backToGrid: () => set({ historyStack: [], historyCursor: -1, error: null }),
}))
