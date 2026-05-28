import { create } from 'zustand'
import type { PreviewDoc } from '../components/codex/CodexPreview'

/** Codex sub-tab identity. Kept in the store so distant surfaces (e.g. the
 *  Hive SynthesisCard's "→ Codex → Syntheses" deep-link) can drive it
 *  without lifting state into CodexTab's parent. */
export type CodexSubTab = 'search' | 'wiki' | 'graph' | 'ingest' | 'syntheses'

export type SourceRootFilter = 'projects' | 'library' | 'inbox' | 'all'

export interface SearchResult {
  id: string
  title: string
  source_path: string
  source_type: string
  source_root: string
  project_name: string | null
  rank: number
  snippet: string
  tags: string[]
}

interface LibraryStore {
  /** Active sub-tab within the Codex top-level tab. Lifted into the store
   *  in Session 3+ so the Hive can deep-link to "Codex → Syntheses". */
  activeSubTab: CodexSubTab
  setActiveSubTab: (tab: CodexSubTab) => void

  // Filters
  query: string
  sourceRoot: SourceRootFilter
  sourceType: string
  crossDomaine: boolean

  // Results
  results: SearchResult[]
  hasSearched: boolean
  error: string | null

  // Markers used by Search.tsx to skip re-executing on tab return:
  // when the current (query + filters) match what was last searched,
  // we already have the right cached results.
  lastSearchedQuery: string
  lastSearchedFilters: string

  // Preview surface state — when set, Search.tsx shows CodexPreview
  // instead of the result list. Cleared on Back / new query / new tab.
  previewDoc: PreviewDoc | null
  previewMode: 'wiki' | 'cross-thread' | 'synthesis' | 'inbox' | 'active-thread' | null
  setPreviewDoc: (doc: PreviewDoc | null, mode: LibraryStore['previewMode']) => void

  setQuery: (q: string) => void
  setSourceRoot: (v: SourceRootFilter) => void
  setSourceType: (v: string) => void
  setCrossDomaine: (v: boolean) => void

  /** Atomically set results + clear error + record what was searched. */
  recordSearchSuccess: (results: SearchResult[], query: string, filters: string) => void
  /** Atomically set error + clear results + record what was searched. */
  recordSearchError: (error: string, query: string, filters: string) => void
  /** Clear results and reset hasSearched (used when the query is emptied). */
  clearSearch: (filters: string) => void
}

export const useCodexStore = create<LibraryStore>((set) => ({
  activeSubTab: 'search',
  setActiveSubTab: (activeSubTab) => set({ activeSubTab }),

  query: '',
  sourceRoot: 'all',
  sourceType: 'all',
  crossDomaine: false,
  results: [],
  hasSearched: false,
  error: null,
  lastSearchedQuery: '',
  lastSearchedFilters: '',
  previewDoc: null,
  previewMode: null,

  setPreviewDoc: (previewDoc, previewMode) => set({ previewDoc, previewMode }),

  setQuery: (query) => set({ query }),
  setSourceRoot: (sourceRoot) => set({ sourceRoot }),
  setSourceType: (sourceType) => set({ sourceType }),
  setCrossDomaine: (crossDomaine) => set({ crossDomaine }),

  recordSearchSuccess: (results, query, filters) =>
    set({
      results,
      hasSearched: true,
      error: null,
      lastSearchedQuery: query,
      lastSearchedFilters: filters,
    }),

  recordSearchError: (error, query, filters) =>
    set({
      error,
      results: [],
      hasSearched: true,
      lastSearchedQuery: query,
      lastSearchedFilters: filters,
    }),

  clearSearch: (filters) =>
    set({
      results: [],
      hasSearched: false,
      error: null,
      lastSearchedQuery: '',
      lastSearchedFilters: filters,
    }),
}))
