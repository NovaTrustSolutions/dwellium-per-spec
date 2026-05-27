import { create } from 'zustand'

// Mirrors the shape returned by window.electronAPI.graphAnalytics — the
// renderer-side analytics view of the corpus (Louvain communities,
// betweenness centrality, structural gaps, topical diversity). Cached
// in the store so reopening the Syntheses tab is instant; refresh button
// re-runs the compute.

export interface AnalyticsCommunity {
  id:           number
  name:         string
  memberIds:    string[]
  memberCount:  number
  domaineIds:   string[]
  domaineNames: string[]
  topTags:      Array<{ tag: string; share: number }>
}

export interface AnalyticsInfluentialDoc {
  docId:       string
  title:       string
  betweenness: number
  domaineId:   string | null
  domaineName: string | null
  sourceType:  string
}

export interface AnalyticsGap {
  id:             string
  communityA:     { id: number; name: string; memberCount: number }
  communityB:     { id: number; name: string; memberCount: number }
  gapSize:        number
  interEdgeCount: number
}

export interface AnalyticsDiversity {
  modularity:     number
  communityCount: number
  largestShare:   number
  score:          number
  band:           'focused' | 'balanced' | 'scattered'
  recommendation: string
}

export interface SynthesesAnalytics {
  communities:       AnalyticsCommunity[]
  topByBetweenness:  AnalyticsInfluentialDoc[]
  structuralGaps:    AnalyticsGap[]
  topicalDiversity:  AnalyticsDiversity | null
  metrics: {
    nodeCount:  number
    edgeCount:  number
    computedAt: string
    degenerate: boolean
  }
}

/**
 * A single synthesis draft as surfaced by `hive:list-syntheses`. Shared
 * between the Hive's SynthesisCard (status-only summary) and the new
 * Recent Drafts section inside Codex → Syntheses (full list + actions).
 */
export interface SynthesisDraft {
  id:             string
  title:          string
  synthesisType:  string | null
  diskPath:       string | null
  createdAt:      string
  gapId:          string | null
  dreamId:        string | null
}

interface SynthesesStore {
  analytics:    SynthesesAnalytics | null
  loadedOnce:   boolean
  loading:      boolean
  error:        string | null

  /** Domaine filter. '' = "(All Domaines)" — the default. Same pattern as
   *  ingestStore / codexWikiStore / graphStore selectorDomaineId, so the
   *  Syntheses analytics readout scopes to the same Domaine the user
   *  picked elsewhere if they want it to. Persists across tab switches. */
  selectorDomaineId: string

  /** Recent synthesis drafts from rag_syntheses (newest first). Loaded
   *  on tab mount + after every successful "Write synthesis" generation.
   *  Shared cache so the Hive Synthesis card and the Codex → Syntheses
   *  Recent Drafts section read the same source. */
  drafts:         SynthesisDraft[]
  draftsLoaded:   boolean

  /** Collapsed-by-default visibility for the two "informational, not
   *  actionable" sections in Codex → Syntheses. Diversity + Gaps stay
   *  always visible (they're the high-value summary + action items).
   *  Session-scoped — fine to lose on app restart. */
  communitiesCollapsed: boolean
  influentialCollapsed: boolean

  setAnalytics:        (a: SynthesesAnalytics | null) => void
  setLoadedOnce:       (v: boolean) => void
  setLoading:          (v: boolean) => void
  setError:            (e: string | null) => void
  setSelectorDomaineId: (id: string) => void
  setDrafts:           (drafts: SynthesisDraft[]) => void
  setDraftsLoaded:     (v: boolean) => void
  toggleCommunities:   () => void
  toggleInfluential:   () => void
}

export const useSynthesesStore = create<SynthesesStore>((set) => ({
  analytics:            null,
  loadedOnce:           false,
  loading:              false,
  error:                null,
  selectorDomaineId:    '',
  drafts:               [],
  draftsLoaded:         false,
  communitiesCollapsed: true,
  influentialCollapsed: true,
  setAnalytics:         (analytics) => set({ analytics }),
  setLoadedOnce:        (loadedOnce) => set({ loadedOnce }),
  setLoading:           (loading) => set({ loading }),
  setError:             (error) => set({ error }),
  setSelectorDomaineId: (selectorDomaineId) => set({ selectorDomaineId }),
  setDrafts:            (drafts) => set({ drafts }),
  setDraftsLoaded:      (draftsLoaded) => set({ draftsLoaded }),
  toggleCommunities:    () => set((s) => ({ communitiesCollapsed: !s.communitiesCollapsed })),
  toggleInfluential:    () => set((s) => ({ influentialCollapsed: !s.influentialCollapsed })),
}))
