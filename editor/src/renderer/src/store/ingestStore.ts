import { create } from 'zustand'
import type { PreviewDoc, PreviewMode } from '../components/codex/CodexPreview'

export interface IngestedDoc {
  id: string
  source_path: string
  source_root: string
  source_type: string
  project_name: string | null
  title: string
  word_count: number
  ingested_at: string
  last_modified: string
  is_active: boolean
  tag_count: number
  relationship_count: number
  domaine_id: string | null
  last_error: string | null
}

export interface ActivityEvent {
  id: string
  operation: string
  source_path: string | null
  source_type: string | null
  tag_count: number | null
  skipped: boolean | null
  error: string | null
  duration_ms: number | null
  cost_usd: number | null
  provider: string | null
  model: string | null
  created_at: string
}

export interface IngestCounts {
  documents: number
  tags: number
  relationships: number
  lastIngestAt: string | null
}

export interface HealthSnapshot {
  orphanTags:           number
  deadLinks:            number
  sourcelessWikiPages:  number
}

/** Columns the Ingest doc list can be sorted by (client-side, on the
 *  already-fetched page). `ingested` is the default and matches the DB
 *  query's `ORDER BY ingested_at DESC`. */
export type IngestSortKey = 'title' | 'type' | 'project_domaine' | 'tags' | 'edges' | 'ingested'
export type IngestSortDir = 'asc' | 'desc'

interface IngestStore {
  // Data — refreshed lazily, kept across tab switches.
  documents: IngestedDoc[]
  totalDocuments: number
  activity: ActivityEvent[]
  counts: IngestCounts | null
  loadedOnce: boolean
  loading: boolean
  error: string | null

  // Filters — persisted across tab switches like the Codex/Search store.
  filter: string
  sourceType: string  // 'all' or one of the SourceType values
  /** Three-tier wiki filter. 'all' = no scope; 'thread'/'project'/'domaine'
   *  narrows the list to rag_documents joined to a rag_wiki_pages row of
   *  that tier — non-wiki docs and other-tier wiki docs drop out. */
  tierFilter: 'all' | 'thread' | 'project' | 'domaine'
  /** Domaine filter. '' = "(All Domaines)" — the default; an id narrows the
   *  list to that Domaine. Lives in the store (not Ingest.tsx local state) so
   *  navigating away and back keeps the user's choice, like sourceType /
   *  tierFilter — instead of resetting to the active Domaine on every mount. */
  selectorDomaineId: string
  crossDomaine: boolean
  /** Client-side sort over the already-fetched documents page. Default
   *  `ingested` / `desc` matches the DB query order, so the initial render
   *  is unchanged. Clicking a header cycles asc → desc → back-to-default
   *  (see `setSort`). Persists across tab switches alongside the filters. */
  sortKey: IngestSortKey
  sortDir: IngestSortDir

  // UI state
  activityExpanded: boolean
  /** Pagination cursor — how many rows we've already requested. The next
   *  "Load more" advances this by PAGE_SIZE. Reset to 0 on any filter change. */
  offset: number

  // Preview overlay — when set, the Ingest tab renders a CodexPreview in
  // place of the table. Mirrors codexStore's pattern (each sub-tab owns
  // its own preview state so they don't bleed across).
  previewDoc: PreviewDoc | null
  previewMode: PreviewMode | null

  // Health snapshot — loaded asynchronously on tab mount + after every
  // destructive op. `null` means we haven't scanned yet; the summary-row
  // badge renders "Scanning…" until the first scan completes.
  health: HealthSnapshot | null
  healthLoading: boolean

  setDocuments:        (docs: IngestedDoc[], total: number) => void
  appendDocuments:     (more: IngestedDoc[], total: number) => void
  setActivity:         (events: ActivityEvent[]) => void
  setCounts:           (counts: IngestCounts) => void
  setLoadedOnce:       (v: boolean) => void
  setLoading:          (v: boolean) => void
  setError:            (e: string | null) => void
  setFilter:           (s: string) => void
  setSourceType:       (s: string) => void
  setTierFilter:       (t: 'all' | 'thread' | 'project' | 'domaine') => void
  setSelectorDomaineId:(id: string) => void
  setCrossDomaine:     (v: boolean) => void
  /** Cycle the sort by a column. Different column → that column asc; same
   *  column asc → same column desc; same column desc → reset to default
   *  (`ingested` desc). */
  setSort:             (key: IngestSortKey) => void
  setActivityExpanded: (v: boolean) => void
  setOffset:           (n: number) => void
  setPreviewDoc:       (doc: PreviewDoc | null, mode: PreviewMode | null) => void
  setHealth:           (h: HealthSnapshot | null) => void
  setHealthLoading:    (v: boolean) => void
}

export const useIngestStore = create<IngestStore>((set) => ({
  documents: [],
  totalDocuments: 0,
  activity: [],
  counts: null,
  loadedOnce: false,
  loading: false,
  error: null,
  filter: '',
  sourceType: 'all',
  tierFilter: 'all',
  selectorDomaineId: '',
  crossDomaine: false,
  sortKey: 'ingested',
  sortDir: 'desc',
  activityExpanded: false,
  offset: 0,
  previewDoc: null,
  previewMode: null,
  health: null,
  healthLoading: false,

  setDocuments:        (docs, total) => set({ documents: docs, totalDocuments: total }),
  appendDocuments:     (more, total) => set((s) => ({ documents: [...s.documents, ...more], totalDocuments: total })),
  setActivity:         (activity) => set({ activity }),
  setCounts:           (counts) => set({ counts }),
  setLoadedOnce:       (loadedOnce) => set({ loadedOnce }),
  setLoading:          (loading) => set({ loading }),
  setError:            (error) => set({ error }),
  setFilter:           (filter) => set({ filter, offset: 0 }),
  setSourceType:       (sourceType) => set({ sourceType, offset: 0 }),
  setTierFilter:       (tierFilter) => set({ tierFilter, offset: 0 }),
  setSelectorDomaineId:(selectorDomaineId) => set({ selectorDomaineId, offset: 0 }),
  setCrossDomaine:     (crossDomaine) => set({ crossDomaine, offset: 0 }),
  setSort:             (key) => set((s) => {
    if (s.sortKey !== key)     return { sortKey: key, sortDir: 'asc' }
    if (s.sortDir === 'asc')   return { sortDir: 'desc' }
    // same column + desc → cycle back to the default sort.
    return { sortKey: 'ingested', sortDir: 'desc' }
  }),
  setActivityExpanded: (activityExpanded) => set({ activityExpanded }),
  setOffset:           (offset) => set({ offset }),
  setPreviewDoc:       (previewDoc, previewMode) => set({ previewDoc, previewMode }),
  setHealth:           (health) => set({ health }),
  setHealthLoading:    (healthLoading) => set({ healthLoading }),
}))
