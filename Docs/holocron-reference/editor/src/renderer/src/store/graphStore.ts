import { create } from 'zustand'
import type { PreviewDoc, PreviewMode } from '../components/codex/CodexPreview'
import type { AnalyticsGap } from './synthesesStore'

/** Visual theme for the d3-force renderer. v4 §8.2.
 *
 *  - 'cell'          — Domaine-colored, node size by degree. The original
 *                      "living cell" look. Default for users who haven't
 *                      run analytics yet (no community/BC data available).
 *  - 'constellation' — Louvain-colored, node size by betweenness centrality.
 *                      Encodes connectivity-derived themes + structural
 *                      bridges, per the architecture-v4 §8 overhaul.
 */
export type GraphTheme = 'cell' | 'constellation'

/** Per-node analytics output stored in parallel to nodes/edges. Indexed by
 *  document id. Populated by graphAnalytics → IPC; null until first compute
 *  or while the corpus is too small for meaningful analytics. */
export interface PerNodeAnalytics {
  /** Louvain community id (stable within a single compute). */
  community: number
  /** Normalized betweenness centrality, 0..1. */
  betweenness: number
}

export interface GraphNode {
  id:           string
  title:        string
  source_path:  string
  source_root:  string
  source_type:  string
  project_name: string | null
  domaine_id:   string | null
  domaine_name: string | null
  namespace:    string | null
  /** Wiki tier: 'thread' | 'project' | 'domaine'. Null for non-wiki docs. */
  tier:         string | null
  degree:       number
}

export interface GraphEdge {
  id:           string
  source:       string
  target:       string
  relationship: string
  strength:     number
}

interface GraphStore {
  // Data — refreshed lazily, kept across tab switches.
  nodes:        GraphNode[]
  edges:        GraphEdge[]
  loadedOnce:   boolean
  loading:      boolean
  error:        string | null

  // Filters — persisted across tab switches.
  /** Multi-Domaine filter (Session 7 second-pass Item 3). Empty array =
   *  "(All Domaines)" — the default. Lives in the store (not Graph.tsx
   *  local state) so it persists across tab switches instead of resetting
   *  on every mount. Other Codex tabs (Ingest/Wiki/Search) still use a
   *  single-select `selectorDomaineId` in their own stores; the Graph is
   *  the first multi-select callsite. */
  selectorDomaineIds: string[]
  crossDomaine:   boolean
  showOrphans:    boolean
  highlightQuery: string

  // Selection / preview state.
  selectedNodeId: string | null
  previewDoc:     PreviewDoc | null
  previewMode:    PreviewMode | null

  // Graph theme — Cell (current) vs Constellation (analytics-driven).
  // Defaults to 'constellation' once we have analytics available; falls
  // back to 'cell' rendering when perNodeAnalytics is missing.
  graphTheme: GraphTheme
  /** Louvain community + BC per node id. Empty Map until graphAnalytics
   *  has been called for the current scope. */
  perNodeAnalytics: Map<string, PerNodeAnalytics>
  /** Highest community id in the current analytics result — used to size
   *  the community color palette. -1 when no analytics. */
  maxCommunityId: number
  /** Structural-gap pairs surfaced by graphAnalytics (Session 6 Part C).
   *  Rendered as faint dashed lines between cluster centroids in the
   *  Constellation theme — the "these two clusters should talk" insight
   *  visible on the graph itself, not just the Syntheses panel. Empty
   *  array until analytics has run. */
  structuralGaps: AnalyticsGap[]

  setData:           (nodes: GraphNode[], edges: GraphEdge[]) => void
  setLoadedOnce:     (v: boolean) => void
  setLoading:        (v: boolean) => void
  setError:          (e: string | null) => void
  setSelectorDomaineIds: (ids: string[]) => void
  setCrossDomaine:   (v: boolean) => void
  setShowOrphans:    (v: boolean) => void
  setHighlightQuery: (s: string) => void
  setSelectedNodeId: (id: string | null) => void
  setPreviewDoc:     (doc: PreviewDoc | null, mode: PreviewMode | null) => void
  setGraphTheme:     (t: GraphTheme) => void
  setPerNodeAnalytics: (m: Map<string, PerNodeAnalytics>, maxCommunityId: number) => void
  setStructuralGaps:   (g: AnalyticsGap[]) => void
}

export const useGraphStore = create<GraphStore>((set) => ({
  nodes:          [],
  edges:          [],
  loadedOnce:     false,
  loading:        false,
  error:          null,
  selectorDomaineIds: [],
  crossDomaine:   false,
  showOrphans:    false,
  highlightQuery: '',
  selectedNodeId: null,
  previewDoc:     null,
  previewMode:    null,

  graphTheme:       'constellation',
  perNodeAnalytics: new Map(),
  maxCommunityId:   -1,
  structuralGaps:   [],

  setData:           (nodes, edges) => set({ nodes, edges }),
  setLoadedOnce:     (loadedOnce) => set({ loadedOnce }),
  setLoading:        (loading) => set({ loading }),
  setError:          (error) => set({ error }),
  setSelectorDomaineIds: (selectorDomaineIds) => set({ selectorDomaineIds }),
  setCrossDomaine:   (crossDomaine) => set({ crossDomaine }),
  setShowOrphans:    (showOrphans) => set({ showOrphans }),
  setHighlightQuery: (highlightQuery) => set({ highlightQuery }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setPreviewDoc:     (previewDoc, previewMode) => set({ previewDoc, previewMode }),
  setGraphTheme:     (graphTheme) => set({ graphTheme }),
  setPerNodeAnalytics: (perNodeAnalytics, maxCommunityId) => set({ perNodeAnalytics, maxCommunityId }),
  setStructuralGaps:   (structuralGaps) => set({ structuralGaps }),
}))
