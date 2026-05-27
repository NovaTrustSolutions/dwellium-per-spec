import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { useSettingsStore } from '../../store/settingsStore'
import { useSessionStore } from '../../store/sessionStore'
import { useScribeStore } from '../../store/scribeStore'
import { useDomainesStore } from '../../store/domainesStore'
import { useGraphStore, type GraphNode, type GraphEdge, type GraphTheme } from '../../store/graphStore'
import type { AnalyticsGap } from '../../store/synthesesStore'
import { classifyFileRelationship } from '../../hooks/useFileRelationship'
import { loadThreadForPath } from '../../utils/threadActions'
import { DomaineBadge } from '../DomaineBadge'
import { IconHome } from '../Icons'
import { AnchoredMultiSelect, type AnchoredDropdownOption } from '../AnchoredDropdown'
import { CodexPreview, type PreviewMode } from './CodexPreview'

// ── Renderer: d3-force "living cell" ──────────────────────────────────────
// Continuous physics — the simulation never fully settles (alphaTarget stays
// just above 0), so nodes perpetually micro-drift. Domaine clustering is soft:
// each Domaine has an anchor point laid out on a ring; nodes are pulled toward
// their Domaine's anchor (forceX/forceY) while a global charge repels everyone
// and relationship links pull connected docs together. No bounding boxes.

const NEUTRAL_COLOR = '#5b6472'
const BRIDGE_KEY    = '__bridge__'
const BG_COLOR      = '#0a0a0f'

// Continuous-sim params.
const ALPHA_TARGET  = 0.012   // never decays below this → perpetual gentle motion
const ALPHA_DECAY   = 0.015
const VELOCITY_DECAY = 0.42

// Raw-document label visibility tiers — labels fade in progressively as
// the user zooms past each threshold, with the most-connected docs
// appearing first. Wiki-tier nodes (domaine / project / thread) bypass
// these gates entirely and are always labeled (structural anchors).
// Hovered + selected nodes also always show (explicit user intent).
// See labelOpacityFor for the full ladder.
//
//   k <  2.0          : no raw-doc labels
//   k >= 2.0, < 3.5   : raw docs with degree > 6 only
//   k >= 3.5, < 5.0   : raw docs with degree > 3 only
//   k >= 5.0          : every raw-doc label
//
// Transitions are short (~150ms) so each threshold crossing reads as a
// smooth fade rather than a snap.
const RAW_LABEL_ZOOM_TIER_1 = 2.0   // begin showing high-degree docs (> 6)
const RAW_LABEL_ZOOM_TIER_2 = 3.5   // expand to mid-degree docs (> 3)
const RAW_LABEL_ZOOM_TIER_3 = 5.0   // show everything
const RAW_LABEL_DEGREE_TIER_1 = 6
const RAW_LABEL_DEGREE_TIER_2 = 3
const LABEL_FADE_MS = 150

// Fallback Domaine palette (used when a Domaine has no colour set in the store).
const PALETTE = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#60a5fa', '#fb923c', '#4ade80']

// ── Node visual hierarchy ─────────────────────────────────────────────────

type NodeClass = 'wiki-domaine' | 'wiki-project' | 'wiki-thread' | 'raw'

function nodeClassFor(n: GraphNode): NodeClass {
  if (n.source_type === 'wiki') {
    if (n.tier === 'domaine') return 'wiki-domaine'
    if (n.tier === 'project') return 'wiki-project'
    if (n.tier === 'thread')  return 'wiki-thread'
  }
  return 'raw'
}

/** Radius (px) per tier, scaled by a normalized 0..1 metric (originally
 *  degree/maxDegree under Cell theme; betweenness-centrality/maxBC under
 *  Constellation theme — same band, different signal). */
function nodeRadiusForMetric(cls: NodeClass, metric: number): number {
  const t = Math.min(Math.max(metric, 0), 1)
  switch (cls) {
    case 'wiki-domaine': return 40 + 20 * t
    case 'wiki-project': return 28 + 12 * t
    case 'wiki-thread':  return 18 + 10 * t
    default:             return 8  + 8  * t
  }
}

/** Halo (glow) size + intensity per tier. */
function haloFor(cls: NodeClass): { mult: number; opacity: number } {
  switch (cls) {
    case 'wiki-domaine': return { mult: 2.5, opacity: 0.95 }
    case 'wiki-project': return { mult: 2.3, opacity: 0.8 }
    case 'wiki-thread':  return { mult: 2.1, opacity: 0.65 }
    default:             return { mult: 1.7, opacity: 0.4 }
  }
}

/** HSL nudge — sat/light multipliers, clamped. Used to brighten wiki cores and
 *  mute raw cores relative to the base Domaine colour. */
function adjustColor(base: string, sat: number, light: number): string {
  const c = d3.hsl(base)
  if (Number.isNaN(c.h)) c.h = 0
  if (Number.isNaN(c.s)) c.s = 0
  c.s = Math.max(0, Math.min(1, c.s * sat))
  c.l = Math.max(0, Math.min(1, c.l * light))
  return c.formatHex()
}

function coreColorFor(cls: NodeClass, base: string): string {
  switch (cls) {
    case 'wiki-domaine': return adjustColor(base, 1.3, 1.25)
    case 'wiki-project': return adjustColor(base, 1.2, 1.12)
    case 'wiki-thread':  return adjustColor(base, 1.1, 1.05)
    default:             return adjustColor(base, 0.7, 0.85)
  }
}

// ── d3 data shapes ────────────────────────────────────────────────────────

interface D3Node extends d3.SimulationNodeDatum {
  id:           string
  title:        string
  source_path:  string
  source_root:  string
  source_type:  string
  project_name: string | null
  domaine_id:   string | null
  domaine_name: string | null
  tier:         string | null
  degree:       number
  cls:          NodeClass
  r:            number
  base:         string   // Domaine colour
  core:         string   // brightened/muted core fill
  haloMult:     number
  haloOpacity:  number
  anchorKey:    string    // domaine_id or BRIDGE_KEY
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  id:           string
  relationship: string
  strength:     number
}

type NodeSel = d3.Selection<SVGGElement, D3Node, SVGGElement, unknown>
type LinkSel = d3.Selection<SVGLineElement, D3Link, SVGGElement, unknown>

function linkEndId(end: D3Link['source']): string {
  return typeof end === 'object' && end !== null ? (end as D3Node).id : String(end)
}

/** Tier-aware label opacity. Hover + selection are explicit "show me this"
 *  signals and always win over the zoom threshold. Wiki-tier nodes
 *  (domaine / project / thread) are structural anchors and always show
 *  their label regardless of zoom OR degree — they have degree 0 in
 *  rag_relationships (edges live between rag_documents, not wiki pages),
 *  so any degree-based gate would never fire for them anyway. Raw
 *  documents have NO persistent-label path: regardless of how many edges
 *  or how large the node is, raw-doc labels only appear once the user
 *  zooms in. The progressive zoom ladder reveals the highest-connectivity
 *  docs first (k ≥ 2.0, degree > 6), then mid-connectivity (k ≥ 3.5,
 *  degree > 3), then everything (k ≥ 5.0). Transitions between the two
 *  values are driven by d3.transition() at the call site, not by this
 *  function.
 *
 *  TODO: expose the zoom-tier thresholds in the graph settings panel
 *        (Session 5). */
function labelOpacityFor(
  d: D3Node,
  k: number,
  hoverId: string | null,
  selectedId: string | null,
): number {
  if (d.id === hoverId || d.id === selectedId) return 1
  // Wiki-tier nodes always readable — structural anchors, no zoom gate.
  if (d.cls !== 'raw') return 1
  // Raw docs: progressive zoom ladder, no persistent path. Higher-degree
  // docs surface first; the floor degree drops as the user zooms in;
  // past TIER_3, every raw-doc label shows.
  if (k >= RAW_LABEL_ZOOM_TIER_3) return 1
  if (k >= RAW_LABEL_ZOOM_TIER_2) return d.degree > RAW_LABEL_DEGREE_TIER_2 ? 1 : 0
  if (k >= RAW_LABEL_ZOOM_TIER_1) return d.degree > RAW_LABEL_DEGREE_TIER_1 ? 1 : 0
  return 0
}

/** Per-tier base font size for node labels — used both in the initial
 *  text-element render and in applyNodeScale to counter-scale font-size
 *  against zoom (rendered size = base / k × k = base, constant). */
function baseFontSizeFor(d: D3Node): number {
  if (d.cls === 'wiki-domaine') return 13
  if (d.cls === 'wiki-project') return 12
  if (d.cls === 'wiki-thread')  return 11
  return 9
}

/** Per-edge base stroke width — wikilinks slightly bolder than tag-overlap
 *  edges; tag-overlap scales with strength but clamps so the thinnest
 *  edge is still hover-targetable. Synthetic 'hierarchy' edges (the
 *  Domain→Project→Thread→source structural skeleton, see graphQueries.ts)
 *  use a thin constant width and are styled separately by applyStyles
 *  (dashed + lower opacity). Reused by the initial render and the
 *  per-zoom counter-scale. */
function baseStrokeWidthFor(l: D3Link): number {
  if (l.relationship === 'hierarchy') return 0.8
  if (l.relationship === 'wikilink')  return 1.6
  return Math.max(0.5, l.strength * 3)
}

const EMPTY_SET: ReadonlySet<string> = new Set()

export function Graph(): JSX.Element {
  const { config } = useSettingsStore()
  const setActiveTab      = useSessionStore((s) => s.setActiveTab)
  const activeProjectName = config.activeProjectName
  const activeThreadPath  = config.activeThreadPath

  const domaines     = useDomainesStore((s) => s.domaines)
  const loadDomaines = useDomainesStore((s) => s.loadIfNeeded)
  useEffect(() => { void loadDomaines() }, [loadDomaines])

  // Right-side detail rail — resizable + collapsible. Local state (width is
  // coupled to the current viewport, so it doesn't belong in graphStore).
  const [railWidth, setRailWidth]         = useState<number>(300)
  const [railCollapsed, setRailCollapsed] = useState<boolean>(false)

  const nodes          = useGraphStore((s) => s.nodes)
  const edges          = useGraphStore((s) => s.edges)
  const loadedOnce     = useGraphStore((s) => s.loadedOnce)
  const loading        = useGraphStore((s) => s.loading)
  const error          = useGraphStore((s) => s.error)
  const selectorDomaineIds = useGraphStore((s) => s.selectorDomaineIds)
  const crossDomaine   = useGraphStore((s) => s.crossDomaine)
  const showOrphans    = useGraphStore((s) => s.showOrphans)
  const highlightQuery = useGraphStore((s) => s.highlightQuery)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const previewDoc     = useGraphStore((s) => s.previewDoc)
  const previewMode    = useGraphStore((s) => s.previewMode)
  const setData            = useGraphStore((s) => s.setData)
  const setLoadedOnce      = useGraphStore((s) => s.setLoadedOnce)
  const setLoading         = useGraphStore((s) => s.setLoading)
  const setError           = useGraphStore((s) => s.setError)
  const setSelectorDomaineIds = useGraphStore((s) => s.setSelectorDomaineIds)
  const setCrossDomaine    = useGraphStore((s) => s.setCrossDomaine)
  const setShowOrphans     = useGraphStore((s) => s.setShowOrphans)
  const setHighlightQuery  = useGraphStore((s) => s.setHighlightQuery)
  const setSelectedNodeId  = useGraphStore((s) => s.setSelectedNodeId)
  const setPreviewDoc      = useGraphStore((s) => s.setPreviewDoc)
  const graphTheme         = useGraphStore((s) => s.graphTheme)
  const setGraphTheme      = useGraphStore((s) => s.setGraphTheme)
  const perNodeAnalytics   = useGraphStore((s) => s.perNodeAnalytics)
  const maxCommunityId     = useGraphStore((s) => s.maxCommunityId)
  const setPerNodeAnalytics = useGraphStore((s) => s.setPerNodeAnalytics)
  const structuralGaps     = useGraphStore((s) => s.structuralGaps)
  const setStructuralGaps  = useGraphStore((s) => s.setStructuralGaps)

  // Domaine colour lookup — store colour if present, else palette by order.
  const domaineColor = useMemo(() => {
    const map = new Map<string, string>()
    let i = 0
    for (const d of domaines) { map.set(d.id, d.color || PALETTE[i % PALETTE.length]); i++ }
    return map
  }, [domaines])

  // Session 7 second-pass Item 3 — option list + trigger-label generator for
  // the multi-select Domain filter. Empty selection renders as "All Domains"
  // (the "no filter" sentinel); 1 selected shows the name; 2–3 selected
  // comma-joined; 4+ collapsed to "N Domains" to keep the trigger from
  // overflowing. Memoized so the popover bind is stable.
  const domaineOptions = useMemo<AnchoredDropdownOption[]>(() =>
    domaines.map((d) => ({ value: d.id, label: d.name })),
  [domaines])
  const selectorTriggerLabel = useMemo<string>(() => {
    if (selectorDomaineIds.length === 0) return 'All Domains'
    const names = selectorDomaineIds
      .map((id) => domaines.find((d) => d.id === id)?.name)
      .filter((n): n is string => !!n)
    if (names.length === 0) return 'All Domains'  // ids reference Domaines that no longer exist
    if (names.length === 1) return names[0]
    if (names.length <= 3) return names.join(', ')
    return `${names.length} Domains`
  }, [selectorDomaineIds, domaines])

  // ── Data fetch ──────────────────────────────────────────────────────────
  // Two-call fetch: the topology (nodes + edges, fast SQL) and the analytics
  // (Louvain + Brandes over the same scope, slower but still on-disk-only).
  // Constellation theme uses both; Cell theme works fine off the topology
  // alone, so analytics is best-effort there — we still fire it so a theme
  // switch is instant, but a failed analytics call doesn't break the graph.
  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true); setError(null)
    // Session 7 second-pass Item 3 — multi-select Domaine filter. Empty
    // array = "All Domaines" (no filter), forwarded as null so the IPC
    // handler hits the "no filter" branch. crossDomaine still bypasses
    // the filter entirely (independent control kept for now).
    const scope = {
      domaineIds:   crossDomaine ? null : (selectorDomaineIds.length > 0 ? selectorDomaineIds : null),
      crossDomaine,
    }
    try {
      const res = await window.electronAPI.graphFetch(scope)
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Failed to load graph')
        setData([], [])
      } else {
        setData(res.data.nodes, res.data.edges)
        if (selectedNodeId && !res.data.nodes.some((n) => n.id === selectedNodeId)) {
          setSelectedNodeId(null)
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false); setLoadedOnce(true)
    }

    // Fire analytics in parallel — best-effort. The Constellation theme uses
    // it; the Cell theme reads degree from the node row directly. Failures
    // are swallowed (the UI just falls back to Cell-style visuals). We ask
    // for `topInfluential: 1000` so the response carries BC for every node
    // (Andy's corpus is < 500 — generous cap, never truncates in practice).
    // `topGaps: 10` (Session 6 Part C) — surface the top 10 structural gaps
    // as dashed lines between cluster centroids in Constellation mode.
    try {
      const a = await window.electronAPI.graphAnalytics({ ...scope, topInfluential: 1000, topGaps: 10 })
      if (a.ok && a.data) {
        const m = new Map<string, { community: number; betweenness: number }>()
        let maxC = -1
        for (const c of a.data.communities) {
          for (const id of c.memberIds) {
            m.set(id, { community: c.id, betweenness: 0 })
          }
          if (c.id > maxC) maxC = c.id
        }
        for (const d of a.data.topByBetweenness) {
          const prev = m.get(d.docId)
          m.set(d.docId, { community: prev?.community ?? 0, betweenness: d.betweenness })
        }
        setPerNodeAnalytics(m, maxC)
        setStructuralGaps(a.data.structuralGaps ?? [])
      }
    } catch (err) {
      console.warn('[Graph] analytics fetch failed (continuing in Cell mode):', (err as Error).message)
    }
  }, [crossDomaine, selectorDomaineIds, selectedNodeId, setData, setLoadedOnce, setLoading, setError, setSelectedNodeId, setPerNodeAnalytics, setStructuralGaps])

  useEffect(() => { void refresh() }, [refresh])

  // ── Processed graph data (cloned — d3 mutates node objects) ─────────────
  const maxDegree = useMemo(() => nodes.reduce((m, n) => (n.degree > m ? n.degree : m), 1), [nodes])

  // Constellation theme is opt-in but the default — fall back to Cell when
  // analytics haven't been computed yet (e.g. on first paint before the
  // async analytics IPC returns).
  const useConstellation = graphTheme === 'constellation' && perNodeAnalytics.size > 0

  /** Soft community palette — HSL stepped around the wheel with constant
   *  saturation/lightness so no community visually dominates by hue. */
  const communityColor = useMemo((): ((cid: number) => string) => {
    if (!useConstellation || maxCommunityId < 0) return () => NEUTRAL_COLOR
    const n = Math.max(1, maxCommunityId + 1)
    return (cid: number) => {
      const h = ((cid % n) / n) * 360
      // Muted Fey-adjacent palette: medium sat, mid-light.
      return d3.hsl(h, 0.45, 0.62).formatHex()
    }
  }, [useConstellation, maxCommunityId])

  const maxBC = useMemo(() => {
    if (!useConstellation) return 0
    let m = 0
    for (const v of perNodeAnalytics.values()) if (v.betweenness > m) m = v.betweenness
    return m
  }, [useConstellation, perNodeAnalytics])

  const graphData = useMemo(() => {
    const visibleNodes = showOrphans ? nodes : nodes.filter((n) => n.degree > 0)
    const visibleIds = new Set(visibleNodes.map((n) => n.id))
    const d3nodes: D3Node[] = visibleNodes.map((n) => {
      const cls = nodeClassFor(n)
      // Color choice: Constellation theme uses Louvain community color (so
      // the visual encodes connectivity-derived themes, not folder structure);
      // Cell theme stays on Domaine color, the original "living cell" look.
      const ana = perNodeAnalytics.get(n.id)
      const base = useConstellation && ana
        ? communityColor(ana.community)
        : (n.domaine_id && domaineColor.get(n.domaine_id)) || NEUTRAL_COLOR
      // Size choice: Constellation theme maps node radius to BC — the bridges
      // become the big ones. Cell theme stays on the original degree-scaled
      // radius. When BC is zero (an isolated cluster member), we still want
      // a visible node — clamp to a small floor.
      const sizeMetric = useConstellation && ana && maxBC > 0
        ? Math.max(ana.betweenness / maxBC, 0.06)
        : (maxDegree > 0 ? Math.min(n.degree / maxDegree, 1) : 0)
      const r = nodeRadiusForMetric(cls, sizeMetric)
      const halo = haloFor(cls)
      // Session 6 Part D — BC-driven brightness mapping. In Constellation
      // theme, raw nodes' core color lightness/saturation scale with their
      // betweenness centrality so brightness reads as influence: high-BC
      // bridges trend near-white (lightness → 1.0, saturation → low) while
      // low-BC satellites stay saturated color at a darker lightness.
      // Formula per Andy's Session 6 Part D spec:
      //   lightness  = 0.4 + normalizedBC * 0.6    → [0.4 .. 1.0]
      //   saturation = 0.65 - normalizedBC * 0.35  → [0.65 .. 0.30]
      // Wiki-tier nodes keep their tier-specific `coreColorFor` treatment
      // (always-bright structural anchors, BC is meaningless for them — wiki
      // edges aren't in rag_relationships so they'd always read BC=0).
      let core: string
      if (useConstellation && ana && maxBC > 0 && cls === 'raw') {
        const nBC = Math.min(Math.max(ana.betweenness / maxBC, 0), 1)
        const c = d3.hsl(base)
        if (Number.isNaN(c.h)) c.h = 0
        if (Number.isNaN(c.s)) c.s = 0
        c.l = 0.4 + nBC * 0.6
        c.s = 0.65 - nBC * 0.35
        core = c.formatHex()
      } else {
        core = coreColorFor(cls, base)
      }
      return {
        id: n.id, title: n.title, source_path: n.source_path, source_root: n.source_root,
        source_type: n.source_type, project_name: n.project_name, domaine_id: n.domaine_id,
        domaine_name: n.domaine_name, tier: n.tier, degree: n.degree,
        cls, r,
        base, core, haloMult: halo.mult, haloOpacity: halo.opacity,
        anchorKey: n.domaine_id ?? BRIDGE_KEY,
      }
    })
    const d3links: D3Link[] = []
    for (const e of edges) {
      if (visibleIds.has(e.source) && visibleIds.has(e.target)) {
        d3links.push({ id: e.id, source: e.source, target: e.target, relationship: e.relationship, strength: e.strength })
      }
    }
    // Distinct base colours → gradient ids; Domaine anchor keys present.
    const colours = Array.from(new Set(d3nodes.map((n) => n.base)))
    const anchorKeys = Array.from(new Set(d3nodes.map((n) => n.anchorKey)))
    return { d3nodes, d3links, colours, anchorKeys }
  }, [nodes, edges, showOrphans, domaineColor, maxDegree, useConstellation, perNodeAnalytics, communityColor, maxBC])

  // ── Refs ────────────────────────────────────────────────────────────────
  const containerRef      = useRef<HTMLDivElement | null>(null)
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const svgRef            = useRef<SVGSVGElement | null>(null)
  const simRef       = useRef<d3.Simulation<D3Node, D3Link> | null>(null)
  const zoomRef      = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const zoomGRef     = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const nodeSelRef   = useRef<NodeSel | null>(null)
  const linkSelRef   = useRef<LinkSel | null>(null)
  // Session 6 Part C — structural-gap dashed lines (Constellation theme only).
  // gapLinesGRef holds the parent <g class="graph-gap-lines"> created in the
  // build effect; gapLineSelRef is the per-gap <line> selection re-bound by
  // the gap-data effect. Positions update each tick from community centroids.
  const gapLinesGRef  = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const gapLineSelRef = useRef<d3.Selection<SVGLineElement, AnalyticsGap, SVGGElement, unknown> | null>(null)
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map())
  const dimsRef      = useRef<{ w: number; h: number }>({ w: 800, h: 600 })
  const anchorsRef   = useRef<Map<string, { x: number; y: number }>>(new Map())
  const posCacheRef  = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(new Map())
  const fitDoneRef   = useRef(false)
  /** Snapshot of the fit-to-content transform applied on first render —
   *  the "default view" the user sees when the graph first opens. The
   *  Reset View button animates back to this exact zoom/pan state. Set
   *  once when the initial fit completes; remains stable across data
   *  refreshes so Reset is predictable. */
  const initialTransformRef = useRef<d3.ZoomTransform | null>(null)
  /** Tracks the current d3 zoom k so applyStyles + applyLabelOpacity can
   *  read it without rebinding to zoom events. Updated only from the zoom
   *  handler. */
  const currentZoomRef  = useRef<number>(1)
  const selectedIdRef   = useRef<string | null>(selectedNodeId)
  const highlightRef    = useRef<string>(highlightQuery)
  const openNodeRef     = useRef<(id: string) => void>(() => {})
  const [hoveredEdge, setHoveredEdge] = useState<{ relationship: string; strength: number; x: number; y: number } | null>(null)
  /** Node hover tooltip. Anchored at the cursor position at the moment the
   *  delay fires; doesn't track the cursor afterwards (less visual noise
   *  than a follow-tooltip during rapid scanning). The delay debounces
   *  flash-on-flyover. */
  // Note: a floating hover tooltip was previously surfaced near each
  // node on mouseover. Removed (v15-Session 2 Fix 3) — the selected-node
  // detail rail on the right shows the same information (and more) when
  // the user clicks, and the tooltip added visual noise during rapid
  // scanning. The hover-highlight behavior (focused node brighter,
  // neighbors visible, everything else dimmed) stays via applyStyles.

  // Compute Domaine anchor points on a ring sized to the viewport.
  const computeAnchors = useCallback((keys: string[]): Map<string, { x: number; y: number }> => {
    const { w, h } = dimsRef.current
    const cx = w / 2, cy = h / 2
    const m = new Map<string, { x: number; y: number }>()
    if (keys.length <= 1) {
      for (const k of keys) m.set(k, { x: cx, y: cy })
      return m
    }
    const radius = Math.min(w, h) * 0.30
    keys.forEach((k, i) => {
      const a = (i / keys.length) * 2 * Math.PI - Math.PI / 2
      m.set(k, { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) })
    })
    return m
  }, [])

  // Re-apply node/edge styling from current selection + hover-overlay state.
  // `hoverId`/`hoverNbrs` non-null only while a node is hovered.
  //
  // Session 6 Part B: aggressive "selected node spotlight" — when a node is
  // explicitly SELECTED (click-locked into the rail, not just hovered), dim
  // non-neighbors to 0.15 (core + text), edges between non-neighbors to 0.05,
  // halo to 0.12× — so the local subgraph is the only thing visually present.
  // Hover-only (sel null) keeps the gentler legacy dim so rapid mouseover
  // scanning doesn't feel jarring.
  const applyStyles = useCallback((hoverId: string | null, hoverNbrs: ReadonlySet<string>) => {
    const nodeSel = nodeSelRef.current, linkSel = linkSelRef.current
    if (!nodeSel || !linkSel) return
    const sel = selectedIdRef.current
    const focus = hoverId ?? sel
    const nbrs = hoverId ? hoverNbrs : (sel ? (adjacencyRef.current.get(sel) ?? EMPTY_SET) : EMPTY_SET)
    const q = highlightRef.current.trim().toLowerCase()
    const aggressive = !!sel  // Session 6 Part B — sel-only spotlight

    // Counter-scale link stroke-width here too — applyStyles fires on
    // hover/select which can interleave with zoom events, and without the
    // counter-scale this would reset edges back to base width and undo
    // applyNodeScale at high zoom (thick lines between tiny counter-
    // scaled nodes — the symptom Fix 2b targets).
    //
    // Hierarchy edges (the synthetic Domain→Project→Thread→source
    // skeleton from graphQueries.buildHierarchyEdges) get a visually
    // distinct treatment from the semantic relationship edges:
    //   • dashed stroke (4-on / 4-off, scaled by zoom so the dash
    //     spacing stays visually constant)
    //   • lower base opacity (0.2 vs 0.15–0.6 for semantic edges) so
    //     they read as structure rather than connection
    //   • slightly muted color so the wikilink + tag-shared layer
    //     reads on top
    const zoomInv = 1 / currentZoomRef.current
    linkSel
      .attr('stroke', (l) =>
        l.relationship === 'hierarchy' ? '#3d4452'
        : l.relationship === 'wikilink' ? '#6b7fb0'
        : '#3a4150')
      .attr('stroke-width', (l) => baseStrokeWidthFor(l) * zoomInv)
      .attr('stroke-dasharray', (l) =>
        l.relationship === 'hierarchy' ? `${4 * zoomInv} ${4 * zoomInv}` : null)
      .attr('stroke-opacity', (l) => {
        const incident = !!focus && (linkEndId(l.source) === focus || linkEndId(l.target) === focus)
        const baseO = l.relationship === 'hierarchy'
          ? 0.2
          : l.relationship === 'wikilink'
            ? 0.6 + 0.2 * Math.min(l.strength, 1)
            : 0.15 + 0.15 * Math.min(l.strength, 1)
        if (incident) return Math.min(1, baseO + 0.5)
        // Session 6 Part B — aggressive 0.05 for non-incident edges when a
        // node is selected; gentler legacy `baseO * 0.22` for hover-only.
        if (focus) return aggressive ? 0.05 : baseO * 0.22
        return baseO
      })

    nodeSel.each(function (d) {
      const g = d3.select<SVGGElement, D3Node>(this)
      const isFocus = d.id === focus
      const isHover = !!hoverId && d.id === hoverId
      const isSel = !!sel && d.id === sel
      const isNbr = nbrs.has(d.id)
      const searchMiss = !!q && !d.title.toLowerCase().includes(q)
      const focusDimmed = !!focus && !isFocus && !isNbr
      const dimmed = focusDimmed || searchMiss
      // Halo opacity — multi-state priority (largest multiplier wins so
      // selected nodes stay prominent even when the user hovers another):
      //   hover    1.9× (brief flash on mouseover)
      //   selected 1.6× (persistent — replaces the old white ring)
      //   neighbor 1.3× (visible alongside the focused node)
      //   dimmed   0.35× (out-of-focus / no search match) — 0.12× when sel
      //                  (Session 6 Part B aggressive spotlight)
      //   default  1×
      let haloMul = 1
      if (dimmed)  haloMul = aggressive ? 0.12 : 0.35
      if (isNbr)   haloMul = Math.max(haloMul, 1.3)
      if (isSel)   haloMul = Math.max(haloMul, 1.6)
      if (isHover) haloMul = Math.max(haloMul, 1.9)
      g.select('.glow').attr('opacity', Math.min(1, d.haloOpacity * haloMul))
      // core fill — focus brightens to near-white; neighbors slightly bumped
      // so they read as connected without competing with the focused node.
      let coreFill = d.core
      if (isFocus) coreFill = d3.hsl(d.core).brighter(0.7).formatHex()
      else if (isNbr) coreFill = d3.hsl(d.core).brighter(0.3).formatHex()
      // Session 6 Part B — opacity ladder by selection state. When sel is
      // set: focus stays at 1.0, neighbors drop to 0.8 (visible context,
      // doesn't compete), everything else collapses to 0.15 so the local
      // subgraph reads alone. Hover-only path keeps the legacy 0.4 dim so
      // rapid scanning doesn't feel like the graph is going dark.
      let coreOpacity: number
      let textOpacity: number
      if (aggressive) {
        if (isFocus)    { coreOpacity = 1;    textOpacity = 1    }
        else if (isNbr) { coreOpacity = 0.8;  textOpacity = 0.8  }
        else            { coreOpacity = 0.15; textOpacity = 0.15 }
      } else if (focusDimmed) {
        coreOpacity = 0.4; textOpacity = 0.3
      } else {
        coreOpacity = 1; textOpacity = 1
      }
      // Search filter overlays — clamp both to the dim floor when the title
      // doesn't include the query (independent of focus state).
      if (searchMiss) {
        const floor = aggressive ? 0.15 : 0.3
        coreOpacity = Math.min(coreOpacity, floor)
        textOpacity = Math.min(textOpacity, floor)
      }
      g.select('.core').attr('fill', coreFill).attr('fill-opacity', coreOpacity)
      // Label visibility — wiki-tier nodes always show; raw docs follow
      // the progressive zoom-tier ladder defined by labelOpacityFor
      // (RAW_LABEL_ZOOM_TIER_{1,2,3} × RAW_LABEL_DEGREE_TIER_{1,2}).
      // Hover + selection override every gate so the user can always
      // read what they're explicitly inspecting. The transition is named
      // so it doesn't fight with zoom-handler-driven fades.
      const opacity = labelOpacityFor(d, currentZoomRef.current, hoverId, sel)
      g.select('text')
        .transition('label-opacity').duration(LABEL_FADE_MS)
        .attr('opacity', opacity)
      g.select('text')
        .attr('fill-opacity', textOpacity)
        .attr('fill', isFocus ? '#ffffff' : '#cfd5e0')
    })
  }, [])

  /** Cheap label-only restyler — called from the zoom handler. Doesn't
   *  re-evaluate dim / halo / core fill (zoom doesn't affect them), just
   *  fades labels in/out as the zoom crosses the per-tier thresholds. */
  const applyLabelOpacity = useCallback(() => {
    const nodeSel = nodeSelRef.current
    if (!nodeSel) return
    const k = currentZoomRef.current
    const sel = selectedIdRef.current
    nodeSel.select<SVGTextElement>('text')
      .transition('label-opacity').duration(LABEL_FADE_MS)
      .attr('opacity', function (d) {
        return labelOpacityFor(d as D3Node, k, null, sel)
      })
  }, [])

  /** Counter-scale every zoom-sensitive attribute so apparent on-screen
   *  size stays constant as the user zooms in. Without this, the scaled
   *  SVG transform makes nodes grow into huge blobs at deep zoom and
   *  labels become unreadable lighthouses next to tiny circles. The
   *  Obsidian-style behavior: zoom in → graph spreads out → nodes /
   *  labels / edges all stay pixel-constant → text becomes readable in
   *  context, not because it was scaled with the canvas.
   *
   *  Counter-scaled attributes:
   *    • node radii (core / glow — glow gets a 1.4× selection bump) — base / k
   *    • node core outline stroke — base / k
   *    • label font-size (per-tier base) — base / k
   *    • label y-offset (keeps label anchored just below the visible node
   *      edge as the node shrinks) — base / k
   *    • label halo stroke (BG_COLOR outline behind text) — base / k
   *    • edge stroke-width (per-edge base) — base / k
   *
   *  Called from the zoom handler — no d3 transition; the wheel-scrolled
   *  feel is smoother with snap-to-target than an interpolated tween. */
  const applyNodeScale = useCallback(() => {
    const nodeSel = nodeSelRef.current
    const linkSel = linkSelRef.current
    if (!nodeSel) return
    const k = currentZoomRef.current
    const inv = 1 / k

    // Nodes — radii + strokes. The selected node's halo gets a 1.4×
    // radius bump (replacing the old white selection ring) so it
    // visually pops without needing a hard outline. Read selectedIdRef
    // here so the radius updates on every zoom; applyStyles separately
    // refreshes when selection changes via the selectedNodeId useEffect.
    const sel = selectedIdRef.current
    nodeSel.select<SVGCircleElement>('circle.core')
      .attr('r',            function (d) { return (d as D3Node).r * inv })
      .attr('stroke-width', function (d) { return ((d as D3Node).cls === 'raw' ? 0.5 : 1) * inv })
    nodeSel.select<SVGCircleElement>('circle.glow')
      .attr('r', function (d) {
        const n = d as D3Node
        const selMul = n.id === sel ? 1.4 : 1
        return n.r * n.haloMult * selMul * inv
      })

    // Labels — font size + y-offset + halo stroke (BG_COLOR outline behind
    // text for readability over node bodies). All three counter-scaled so
    // the text reads at constant size with constant halo thickness.
    nodeSel.select<SVGTextElement>('text')
      .attr('y',            function (d) {
        const n = d as D3Node
        return n.r * inv + (n.cls === 'raw' ? 11 : 14) * inv
      })
      .attr('font-size',    function (d) { return baseFontSizeFor(d as D3Node) * inv })
      .attr('stroke-width', 3 * inv)

    // Edges — stroke-width
    if (linkSel) {
      linkSel.attr('stroke-width', function (l) { return baseStrokeWidthFor(l) * inv })
    }

    // Session 6 Part C — counter-scale the gap-line dash pattern so the
    // dash-on / dash-off stay pixel-constant on zoom (matches the hierarchy
    // edge dash treatment in applyStyles).
    const gapSel = gapLineSelRef.current
    if (gapSel) gapSel.attr('stroke-dasharray', `${8 * inv} ${4 * inv}`)
  }, [])

  // ── Build (rebuilt whenever the graph data changes) ─────────────────────
  useEffect(() => {
    const svgEl = svgRef.current
    const containerEl = containerRef.current
    if (!svgEl || !containerEl) return

    dimsRef.current = {
      w: containerEl.clientWidth || 800,
      h: containerEl.clientHeight || 600,
    }
    const { w, h } = dimsRef.current
    anchorsRef.current = computeAnchors(graphData.anchorKeys)

    // Seed positions from the prior layout so a refresh doesn't teleport nodes.
    const nodeData: D3Node[] = graphData.d3nodes.map((n) => {
      const prev = posCacheRef.current.get(n.id)
      return prev
        ? { ...n, x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy }
        : { ...n, x: w / 2 + (Math.random() - 0.5) * 80, y: h / 2 + (Math.random() - 0.5) * 80 }
    })
    const linkData: D3Link[] = graphData.d3links.map((l) => ({ ...l }))

    // Adjacency map (string ids).
    const adj = new Map<string, Set<string>>()
    for (const l of linkData) {
      const s = linkEndId(l.source), t = linkEndId(l.target)
      if (!adj.has(s)) adj.set(s, new Set()); adj.get(s)!.add(t)
      if (!adj.has(t)) adj.set(t, new Set()); adj.get(t)!.add(s)
    }
    adjacencyRef.current = adj

    const svg = d3.select<SVGSVGElement, unknown>(svgEl)
    svg.selectAll('*').remove()

    // defs: one radial-gradient per distinct Domaine colour for the glow halo.
    const colourGrad = new Map<string, string>()
    const defs = svg.append('defs')
    graphData.colours.forEach((col, i) => {
      const id = `glow-${i}`
      colourGrad.set(col, id)
      const grad = defs.append('radialGradient').attr('id', id)
      grad.append('stop').attr('offset', '0%').attr('stop-color', col).attr('stop-opacity', 0.55)
      grad.append('stop').attr('offset', '40%').attr('stop-color', col).attr('stop-opacity', 0.22)
      grad.append('stop').attr('offset', '100%').attr('stop-color', col).attr('stop-opacity', 0)
    })

    const zoomG = svg.append('g')
    zoomGRef.current = zoomG
    // Session 6 Part C — gap lines sit BEHIND edges + nodes so they read as
    // a structural background, not as overlaid emphasis. Empty until the
    // gap-data effect binds them.
    const gapLinesG = zoomG.append('g').attr('class', 'graph-gap-lines')
    gapLinesGRef.current = gapLinesG
    const edgesG = zoomG.append('g').attr('class', 'graph-edges')
    const nodesG = zoomG.append('g').attr('class', 'graph-nodes')

    // ── Forces ──
    const sim = d3.forceSimulation<D3Node, D3Link>(nodeData)
      .alphaDecay(ALPHA_DECAY)
      .velocityDecay(VELOCITY_DECAY)
      .alphaMin(0)
      .alphaTarget(ALPHA_TARGET)
      .force('charge', d3.forceManyBody<D3Node>().strength((d) => -(d.r * d.r) * 0.55).distanceMax(420))
      .force('link', d3.forceLink<D3Node, D3Link>(linkData)
        .id((d) => d.id)
        // Hierarchy edges use a longer preferred distance and a weaker
        // pull so they form a loose scaffolding without yanking source
        // documents tightly onto their parent wiki nodes (the semantic
        // wikilink + tag-shared edges should still drive the layout's
        // clustering, with hierarchy just hinting at the tree shape).
        .distance((l) =>
          l.relationship === 'hierarchy' ? 140
          : l.relationship === 'wikilink' ? 45
          : 95)
        .strength((l) =>
          l.relationship === 'hierarchy' ? 0.04
          : l.relationship === 'wikilink' ? 0.32
          : 0.12 * Math.min(l.strength, 1)))
      .force('x', d3.forceX<D3Node>((d) => anchorsRef.current.get(d.anchorKey)?.x ?? w / 2).strength(0.085))
      .force('y', d3.forceY<D3Node>((d) => anchorsRef.current.get(d.anchorKey)?.y ?? h / 2).strength(0.085))
      .force('collide', d3.forceCollide<D3Node>().radius((d) => d.r * 1.25 + 4).strength(0.75))
      .force('center', d3.forceCenter<D3Node>(w / 2, h / 2).strength(0.04))
    simRef.current = sim

    // ── Edges ──
    const linkSel: LinkSel = edgesG.selectAll<SVGLineElement, D3Link>('line')
      .data(linkData, (l) => l.id)
      .join('line')
      .attr('stroke-linecap', 'round')
      .on('mouseover', (event, l) => {
        const sx = (l.source as D3Node).x ?? 0, sy = (l.source as D3Node).y ?? 0
        const tx = (l.target as D3Node).x ?? 0, ty = (l.target as D3Node).y ?? 0
        const tr = d3.zoomTransform(svgEl)
        setHoveredEdge({
          relationship: l.relationship, strength: l.strength,
          x: ((sx + tx) / 2) * tr.k + tr.x,
          y: ((sy + ty) / 2) * tr.k + tr.y,
        })
      })
      .on('mouseout', () => setHoveredEdge(null))
    linkSelRef.current = linkSel

    // ── Nodes ──
    const nodeSel: NodeSel = nodesG.selectAll<SVGGElement, D3Node>('g.node')
      .data(nodeData, (d) => d.id)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'node').style('cursor', 'pointer')
        g.append('circle').attr('class', 'glow')
          .attr('r', (d) => d.r * d.haloMult)
          .attr('fill', (d) => `url(#${colourGrad.get(d.base) ?? colourGrad.values().next().value})`)
          .attr('opacity', (d) => d.haloOpacity)
          .style('pointer-events', 'none')
        // The selection ring (hard white stroke) was removed v15-Session 3:
        // it read as harsh next to the otherwise-soft cell aesthetic. The
        // halo IS the selection indicator now — applyStyles pumps the
        // selected node's halo to 1.4× radius + 1.6× opacity (vs 1.9×
        // opacity for hover, which stays radius-neutral).
        g.append('circle').attr('class', 'core')
          .attr('r', (d) => d.r)
          .attr('fill', (d) => d.core)
          .attr('stroke', (d) => d3.hsl(d.core).brighter(0.9).formatHex())
          .attr('stroke-width', (d) => (d.cls === 'raw' ? 0.5 : 1))
          .attr('stroke-opacity', 0.6)
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', (d) => d.r + (d.cls === 'raw' ? 11 : 14))
          .attr('font-size', (d) => baseFontSizeFor(d))
          .attr('font-weight', (d) => (d.cls === 'wiki-domaine' || d.cls === 'wiki-project' ? 600 : 400))
          .attr('fill', '#cfd5e0')
          .attr('paint-order', 'stroke')
          .attr('stroke', BG_COLOR).attr('stroke-width', 3).attr('stroke-linejoin', 'round')
          .style('pointer-events', 'none')
          .text((d) => d.title)
        return g
      })
    nodeSelRef.current = nodeSel

    nodeSel
      // Click = select + pan-center. Opens the detail rail and pans
      // the view so the clicked node sits at the center of the visible
      // graph area, WITHOUT changing zoom. User zooms further manually
      // with scroll/wheel. stopPropagation prevents the bubble from
      // reaching the svg-level click handler (line ~800) that
      // deselects on background-click.
      //
      // No sim cooling and no d.fx/d.fy pinning — for a 200ms pan
      // (no scale change), the simulation's gentle drift is invisible
      // and the prior cooling dance was a source of bugs.
      .on('click', (event, d) => {
        event.stopPropagation()
        setSelectedNodeId(d.id)
        const svgEl = svgRef.current
        const container = containerRef.current
        if (!svgEl || !container) return
        const { width: w, height: h } = container.getBoundingClientRect()
        const currentTransform = d3.zoomTransform(svgEl)
        const k = currentTransform.k
        const tx = w / 2 - k * (d.x ?? 0)
        const ty = h / 2 - k * (d.y ?? 0)
        d3.select(svgEl)
          .transition('node-center')
          .duration(200)
          .ease(d3.easeCubicOut)
          .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k))
      })
      .on('dblclick', (event, d) => { event.stopPropagation(); openNodeRef.current(d.id) })
      .on('mouseenter', (_event, d) => {
        applyStyles(d.id, adjacencyRef.current.get(d.id) ?? EMPTY_SET)
      })
      .on('mouseleave', () => {
        applyStyles(null, EMPTY_SET)
      })
      .call(d3.drag<SVGGElement, D3Node>()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(ALPHA_TARGET)
          d.fx = null; d.fy = null
        }))

    // ── Tick: positions + cache ──
    sim.on('tick', () => {
      linkSel
        .attr('x1', (l) => (l.source as D3Node).x ?? 0)
        .attr('y1', (l) => (l.source as D3Node).y ?? 0)
        .attr('x2', (l) => (l.target as D3Node).x ?? 0)
        .attr('y2', (l) => (l.target as D3Node).y ?? 0)
      nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
      for (const d of nodeData) posCacheRef.current.set(d.id, { x: d.x ?? 0, y: d.y ?? 0, vx: d.vx ?? 0, vy: d.vy ?? 0 })

      // Session 6 Part C — update structural-gap dashed lines from current
      // community centroids. Only runs when gap lines exist (Constellation
      // theme + at least one gap from analytics); otherwise short-circuit.
      const gapSel = gapLineSelRef.current
      if (gapSel && !gapSel.empty()) {
        const sums = new Map<number, { sx: number; sy: number; n: number }>()
        for (const n of nodeData) {
          const ana = perNodeAnalytics.get(n.id)
          if (!ana) continue
          const x = n.x ?? 0, y = n.y ?? 0
          const s = sums.get(ana.community)
          if (s) { s.sx += x; s.sy += y; s.n += 1 }
          else   { sums.set(ana.community, { sx: x, sy: y, n: 1 }) }
        }
        const centroids = new Map<number, { x: number; y: number }>()
        for (const [cid, s] of sums) centroids.set(cid, { x: s.sx / s.n, y: s.sy / s.n })
        gapSel
          .attr('x1', (gap) => centroids.get(gap.communityA.id)?.x ?? 0)
          .attr('y1', (gap) => centroids.get(gap.communityA.id)?.y ?? 0)
          .attr('x2', (gap) => centroids.get(gap.communityB.id)?.x ?? 0)
          .attr('y2', (gap) => centroids.get(gap.communityB.id)?.y ?? 0)
      }
    })

    // ── Zoom / pan ──
    // scaleExtent caps zoom: lower 0.3 lets the full constellation fit in
    // viewport without disappearing into a dot; upper 8 lets the user
    // zoom deep enough that counter-scaled nodes (which stay roughly
    // pixel-constant via applyNodeScale) spread out so labels become
    // readable in context — Obsidian-style. Past v15 the SVG-level
    // overflow:visible + per-zoom counter-scale eliminated the
    // clip/flash symptom that previously capped the max at 4.
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (event) => {
        zoomG.attr('transform', event.transform.toString())
        // Drive label fades + node counter-scaling from the zoom k. Both
        // restylers are lightweight (labels: opacity only, nodes: r +
        // text y only) so they handle the continuous-fire wheel/drag
        // event stream without jank.
        if (event.transform.k !== currentZoomRef.current) {
          currentZoomRef.current = event.transform.k
          applyLabelOpacity()
          applyNodeScale()
        }
      })
    zoomRef.current = zoom
    svg.call(zoom).on('dblclick.zoom', null)
    // Restore prior transform (across rebuilds) — d3.zoom stores it on the node.
    const restoredTr = d3.zoomTransform(svgEl)
    zoomG.attr('transform', restoredTr.toString())
    // Sync currentZoomRef to the restored k so the first applyNodeScale
    // counter-scales correctly (otherwise the first paint at a non-1
    // zoom would render nodes at base size and snap on first wheel).
    currentZoomRef.current = restoredTr.k
    svg.on('click', () => setSelectedNodeId(null))

    // Initial styling. applyNodeScale must run AFTER the .join enter()
    // wired the initial r attributes — counter-scales them for the
    // restored zoom k. applyStyles handles the label opacity / dim /
    // halo state for the current selection.
    applyNodeScale()
    applyStyles(null, EMPTY_SET)

    // Fit-to-content once, after the sim has had a moment to spread out.
    if (!fitDoneRef.current && nodeData.length > 0) {
      const tFit = window.setTimeout(() => {
        if (nodeData.length === 0) return
        fitDoneRef.current = true
        const xs = d3.extent(nodeData, (d) => d.x ?? 0) as [number, number]
        const ys = d3.extent(nodeData, (d) => d.y ?? 0) as [number, number]
        const gw = Math.max(1, xs[1] - xs[0]), gh = Math.max(1, ys[1] - ys[0])
        const { w: vw, h: vh } = dimsRef.current
        const k = Math.max(0.1, Math.min(2, 0.85 * Math.min(vw / (gw + 120), vh / (gh + 120))))
        const cx = (xs[0] + xs[1]) / 2, cy = (ys[0] + ys[1]) / 2
        const initialTr = d3.zoomIdentity.translate(vw / 2, vh / 2).scale(k).translate(-cx, -cy)
        // Snapshot for the Reset View button — the "default view" is
        // always this fit transform. Stored once on first fit so reset
        // is deterministic across data refreshes / re-layouts.
        initialTransformRef.current = initialTr
        svg.transition().duration(450).call(zoom.transform, initialTr)
      }, 850)
      // store on the sim object so cleanup can clear it
      ;(sim as unknown as { _fitTimer?: number })._fitTimer = tFit
    }

    return () => {
      const t = (sim as unknown as { _fitTimer?: number })._fitTimer
      if (t) window.clearTimeout(t)
      sim.stop()
      simRef.current = null
      nodeSelRef.current = null
      linkSelRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData])

  // Keep refs in sync + restyle when selection / highlight changes.
  // Selection change → resync the ref + restyle halo opacity (applyStyles)
  // AND glow radius (applyNodeScale, which reads selectedIdRef for the
  // 1.4× halo bump on the selected node). Without the applyNodeScale
  // call, the radius bump would only apply on the next zoom event.
  useEffect(() => {
    selectedIdRef.current = selectedNodeId
    applyStyles(null, EMPTY_SET)
    applyNodeScale()
  }, [selectedNodeId, applyStyles, applyNodeScale])

  // Session 6 Part C — bind / unbind structural-gap dashed lines on the
  // dedicated <g class="graph-gap-lines"> created by the build effect.
  // Visible only in Constellation theme; positions are updated on every
  // tick from community centroids; dash pattern is counter-scaled by
  // applyNodeScale + the initial-paint snapshot below. Re-runs whenever
  // gaps, theme, or the underlying graphData change (the build effect
  // creates a new gapLinesGRef on each rebuild).
  useEffect(() => {
    const parent = gapLinesGRef.current
    if (!parent) return
    const visible = useConstellation ? structuralGaps : []
    const sel = parent.selectAll<SVGLineElement, AnalyticsGap>('line')
      .data(visible, (gap) => gap.id)
      .join(
        (enter) => enter.append('line')
          .attr('stroke', 'var(--text-dim)')
          .attr('stroke-opacity', 0.15)
          .attr('stroke-linecap', 'round')
          .style('pointer-events', 'none'),
        (update) => update,
        (exit)   => exit.remove(),
      )
    gapLineSelRef.current = sel
    // Snap initial dash + width to the current zoom so the first paint after
    // a theme switch doesn't flash at unscaled size. applyNodeScale also
    // refreshes the dash on every zoom event.
    const inv = 1 / currentZoomRef.current
    sel.attr('stroke-dasharray', `${8 * inv} ${4 * inv}`).attr('stroke-width', 1 * inv)
    // Kick the sim so centroids recompute and the new lines land at real
    // positions immediately (otherwise they sit at 0,0 until the next tick
    // happens to fire from the perpetual alphaTarget drift).
    const s = simRef.current
    if (s) s.alpha(Math.max(s.alpha(), 0.05)).restart()
  }, [structuralGaps, useConstellation, graphData])
  useEffect(() => { highlightRef.current = highlightQuery; applyStyles(null, EMPTY_SET) }, [highlightQuery, applyStyles])

  // Resize: patch the live simulation rather than rebuild it.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || 800, h = el.clientHeight || 600
      dimsRef.current = { w, h }
      const sim = simRef.current
      if (!sim) return
      anchorsRef.current = computeAnchors(graphData.anchorKeys)
      const fc = sim.force('center') as d3.ForceCenter<D3Node> | undefined
      fc?.x(w / 2).y(h / 2)
      sim.alpha(Math.max(sim.alpha(), 0.2)).restart()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [computeAnchors, graphData.anchorKeys])

  // ── Re-layout — reheat the simulation from scratch ──────────────────────
  const reLayout = useCallback(() => {
    const sim = simRef.current
    if (!sim) return
    sim.alpha(1).alphaTarget(ALPHA_TARGET).restart()
  }, [])

  // ── Reset view — animate back to the initial fit transform ──────────────
  // Restores the centered, zoomed-out-to-fit-all-nodes state the graph
  // opened in. initialTransformRef captures the transform from the first
  // fit-to-content pass (after the sim spread out and the 850ms fit timer
  // fired). If the user clicks Reset before the initial fit lands (rare —
  // <1s window on first paint), the button is a no-op rather than a snap
  // to a half-settled position.
  const resetView = useCallback(() => {
    const svgEl = svgRef.current
    const zoom  = zoomRef.current
    const initialTr = initialTransformRef.current
    if (!svgEl || !zoom || !initialTr) return
    d3.select(svgEl).transition('reset-view').duration(400).call(zoom.transform, initialTr)
  }, [])

  // ── Open node — double-click routes into the Codex preview pane. ─────────
  const openNode = useCallback((nodeId: string): void => {
    const n = nodes.find((x) => x.id === nodeId)
    if (!n) return
    const rel = classifyFileRelationship({
      source_path:  n.source_path,
      source_type:  n.source_type,
      source_root:  n.source_root,
      project_name: n.project_name,
    }, activeProjectName, activeThreadPath)
    const mode: PreviewMode = rel === 'active' ? 'active-thread' : rel
    setPreviewDoc({
      title:        n.title,
      source_path:  n.source_path,
      source_type:  n.source_type,
      project_name: n.project_name,
    }, mode)
  }, [nodes, activeProjectName, activeThreadPath, setPreviewDoc])
  useEffect(() => { openNodeRef.current = openNode }, [openNode])

  // Escalation — open in Scribe for editing + move active context to its thread.
  const editInScribe = useCallback((n: GraphNode): void => {
    const scribeState = useScribeStore.getState()
    if (scribeState.openFiles.some((f) => f.path === n.source_path)) {
      scribeState.setActiveFile(n.source_path)
      void loadThreadForPath(n.source_path)
      setActiveTab('scribe')
      return
    }
    void window.electronAPI.readFile(n.source_path).then((result) => {
      const name = n.source_path.split('/').pop() ?? n.title
      scribeState.openFileWithContent({ path: n.source_path, name }, result.content)
      void loadThreadForPath(n.source_path)
      setActiveTab('scribe')
    }).catch((err) => console.error('[Graph] edit-in-scribe open failed:', err))
  }, [setActiveTab])

  // Drag the rail's left spine to resize it. Mirrors Ingest's split divider —
  // the rail is anchored to the right edge, so dragging left widens it.
  // Clamped so ≥280px always stays for the graph.
  const startRailDrag = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = railWidth
    const containerW = splitContainerRef.current?.getBoundingClientRect().width ?? 1200
    const minW = 220
    const maxW = Math.max(minW + 1, containerW - 280)
    const onMove = (ev: MouseEvent): void => {
      ev.preventDefault()
      setRailWidth(Math.min(maxW, Math.max(minW, startWidth - (ev.clientX - startX))))
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [railWidth])

  // Preview overlay short-circuits the canvas (and unmounts the simulation).
  if (previewDoc && previewMode) {
    return (
      <CodexPreview
        document={previewDoc}
        mode={previewMode}
        onClose={() => setPreviewDoc(null, null)}
        nav={{
          canBack: false,
          canForward: false,
          onBack: () => setPreviewDoc(null, null),
          onForward: () => {},
          onNavigate: (target, mode) => setPreviewDoc(target, mode),
        }}
      />
    )
  }

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null
  const visibleCount = showOrphans ? nodes.length : nodes.filter((n) => n.degree > 0).length

  return (
    // flex:1 (not height:100%) so the graph fills the Codex content area in
    // both axes regardless of how the parent resolves its size.
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      <style>{`@keyframes graphEdgePulse{0%,100%{opacity:.72}50%{opacity:1}} .graph-edges{animation:graphEdgePulse 6s ease-in-out infinite}`}</style>

      {/* Filter row */}
      <div
        style={{
          padding: '10px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={highlightQuery}
          onChange={(e) => setHighlightQuery(e.target.value)}
          placeholder="Highlight nodes by title…"
          style={{
            flex: '1 1 220px', minWidth: 0, height: 28, padding: '0 10px',
            background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 4,
            color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <AnchoredMultiSelect
          values={selectorDomaineIds}
          options={domaineOptions}
          onChange={setSelectorDomaineIds}
          triggerLabel={selectorTriggerLabel}
          allLabel="All Domains"
          disabled={crossDomaine}
          title={crossDomaine ? 'Disabled while "Across all Domains" is checked' : 'Filter by one or more Domains'}
          minWidth={140}
        />
        <label style={checkboxLabel}>
          <input type="checkbox" checked={crossDomaine} onChange={(e) => setCrossDomaine(e.target.checked)} />
          Across all
        </label>
        <label style={checkboxLabel}>
          <input type="checkbox" checked={showOrphans} onChange={(e) => setShowOrphans(e.target.checked)} />
          Show orphans
        </label>
        {/* Visual theme — Cell (Domaine color, degree size) vs Constellation
            (Louvain color, BC size). v4 §8.2. */}
        <select
          value={graphTheme}
          onChange={(e) => setGraphTheme(e.target.value as GraphTheme)}
          title={
            perNodeAnalytics.size === 0
              ? 'Constellation falls back to Cell visuals until analytics finish computing'
              : 'Visual theme — Cell = Domain/degree · Constellation = Louvain/betweenness'
          }
          style={selectStyle}
        >
          <option value="cell">Theme · Cell</option>
          <option value="constellation">Theme · Constellation</option>
        </select>
        <div style={{ flex: '0 0 auto', fontSize: 11, color: 'var(--text-dim)' }}>
          {loading
            ? 'Loading…'
            : `${visibleCount} of ${nodes.length} node${nodes.length === 1 ? '' : 's'} · ${edges.length} edge${edges.length === 1 ? '' : 's'}`}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button
            onClick={resetView}
            disabled={loading || nodes.length === 0}
            style={{ ...pillButton, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Animate the zoom/pan back to the initial fit-to-screen view"
          >
            <IconHome size={13} />
            Reset view
          </button>
          <button onClick={reLayout} disabled={loading || nodes.length === 0} style={pillButton} title="Reheat the physics simulation">
            Re-layout
          </button>
          <button onClick={() => void refresh()} disabled={loading} style={pillButton}>
            Refresh
          </button>
        </div>
      </div>

      {/* Canvas + resizable detail rail */}
      <div ref={splitContainerRef} style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', position: 'relative' }}>
        <div
          ref={containerRef}
          style={{ flex: 1, minWidth: 0, minHeight: 0, height: '100%', position: 'relative', overflow: 'hidden', background: BG_COLOR }}
        >
          {/* `overflow: visible` on the SVG, `overflow: hidden` on the
              outer container — the SVG lets enlarged glow halos paint
              past its bounding box (avoiding the per-frame clip recalc
              that produced the "nodes flash at max zoom" symptom), then
              the container handles the actual viewport clip cleanly.
              `shape-rendering: geometricPrecision` reduces subpixel
              jitter on transformed circles at high zoom. */}
          <svg
            ref={svgRef}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              display: 'block', overflow: 'visible',
              shapeRendering: 'geometricPrecision',
            }}
          />
        </div>

        {hoveredEdge && (
          <div
            style={{
              position: 'absolute', left: hoveredEdge.x + 8, top: hoveredEdge.y + 8,
              pointerEvents: 'none', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)',
              borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)',
              whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,0.3)', zIndex: 2,
            }}
          >
            {hoveredEdge.relationship}
            <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>{hoveredEdge.strength.toFixed(2)}</span>
          </div>
        )}

        {/* Node hover tooltip removed (v15-Session 2 Fix 3). The detail
            rail on the right shows the same information when the user
            clicks; the floating tooltip added noise during rapid scanning
            of the constellation. Hover still highlights the focused node
            and dims non-neighbors via applyStyles. */}

        {error && (
          <div style={{
            position: 'absolute', left: 24, top: 12, color: '#ff2d78', fontSize: 12,
            background: 'var(--bg-subtle)', padding: '4px 8px', border: '1px solid #ff2d78', borderRadius: 4,
          }}>
            {error}
          </div>
        )}
        {!loading && loadedOnce && nodes.length === 0 && !error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', fontSize: 13, pointerEvents: 'none',
          }}>
            No documents in scope. Ingest some, or widen the Domaine filter.
          </div>
        )}

        {/* Detail-rail spine — drag to resize, click the chevron to collapse.
            Present only while a node is selected; when collapsed a thin strip
            with the expand chevron stays so the panel can be restored. */}
        {selectedNode && (
          <>
            <div
              style={{
                flex: `0 0 ${railCollapsed ? 14 : 6}px`,
                position: 'relative',
                background: 'var(--border-subtle)',
                cursor: railCollapsed ? 'default' : 'col-resize',
                userSelect: 'none',
              }}
              onMouseDown={(e) => { if (!railCollapsed) startRailDrag(e) }}
              title={railCollapsed ? 'Details hidden — click the chevron to restore' : 'Drag to resize · click the chevron to hide the details panel'}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setRailCollapsed((v) => !v) }}
                title={railCollapsed ? 'Show details panel' : 'Hide details panel (full-width graph)'}
                style={{
                  // Centered vertically on the divider rather than pinned
                  // to the top — the chevron now floats at the natural
                  // eye-line for grab-and-drag instead of forcing a
                  // glance up to the corner.
                  position: 'absolute', top: '50%', left: -10,
                  transform: 'translateY(-50%)',
                  width: 26, height: 26, borderRadius: 13,
                  border: '1px solid var(--border-default)', background: 'var(--bg-card)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontFamily: 'monospace', zIndex: 4, padding: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--neon-blue)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                {railCollapsed ? '◀' : '▶'}
              </button>
            </div>
            {!railCollapsed && (
              <NodeDetailRail
                node={selectedNode}
                width={railWidth}
                edges={edges}
                allNodes={nodes}
                onOpen={() => openNode(selectedNode.id)}
                onEdit={() => editInScribe(selectedNode)}
                onClose={() => setSelectedNodeId(null)}
                onPickConnected={(id) => setSelectedNodeId(id)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Node detail rail ──────────────────────────────────────────────────────

function NodeDetailRail({
  node, width, edges, allNodes, onOpen, onEdit, onClose, onPickConnected,
}: {
  node:            GraphNode
  width:           number
  edges:           GraphEdge[]
  allNodes:        GraphNode[]
  onOpen:          () => void
  onEdit:          () => void
  onClose:         () => void
  onPickConnected: (id: string) => void
}): JSX.Element {
  const incident = useMemo(() => {
    const byId = new Map(allNodes.map((n) => [n.id, n]))
    const out: Array<{ id: string; title: string; relationship: string; strength: number }> = []
    for (const e of edges) {
      if (e.source === node.id) {
        const other = byId.get(e.target)
        if (other) out.push({ id: other.id, title: other.title, relationship: e.relationship, strength: e.strength })
      } else if (e.target === node.id) {
        const other = byId.get(e.source)
        if (other) out.push({ id: other.id, title: other.title, relationship: e.relationship, strength: e.strength })
      }
    }
    out.sort((a, b) => b.strength - a.strength)
    return out
  }, [edges, allNodes, node.id])

  const tierLabel =
    node.source_type === 'wiki'
      ? (node.tier === 'domaine' ? 'Domain wiki'
        : node.tier === 'project' ? 'Project wiki'
        : node.tier === 'thread'  ? 'Thread wiki'
        : 'Wiki')
      : node.source_type

  return (
    <div
      style={{
        width, flexShrink: 0, minWidth: 0, borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--bg-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Selected</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1,
        }}>×</button>
      </div>

      <div style={{ padding: '12px 14px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{node.title}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{node.source_path}</div>
        </div>

        <MetaGrid>
          <Meta label="Kind"    value={tierLabel} />
          <Meta label="Project" value={node.project_name ?? '—'} />
          <Meta label="Degree"  value={String(node.degree)} />
          <MetaCustom label="Domain">
            <DomaineBadge domaineId={node.domaine_id} variant="chip" projectName={node.project_name} />
          </MetaCustom>
        </MetaGrid>

        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onOpen} style={primaryPill}>Open in Codex</button>
          <button onClick={onEdit} style={secondaryPill} title="Open this file in Scribe for editing">Edit in Scribe</button>
        </div>

        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
            Connections ({incident.length})
          </div>
          {incident.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No relationships in scope.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {incident.map((c, i) => (
                // `c.id` is the neighbor's id — repeats when the current
                // node has multiple edges to the same neighbor (e.g.
                // wikilink + tag-shared between the same pair, or any
                // semantic edge alongside the synthetic hierarchy edge
                // from the parent wiki). Index tiebreaks so React's key
                // is unique per row.
                <button key={`${c.id}-${i}`} onClick={() => onPickConnected(c.id)} style={connectionRow} title={`${c.relationship} · strength ${c.strength.toFixed(2)}`}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{c.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 6, flexShrink: 0 }}>{c.relationship}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetaGrid({ children }: { children: React.ReactNode }): JSX.Element {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{children}</div>
}
function Meta({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
function MetaCustom({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  height: 28, padding: '0 8px', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)',
  borderRadius: 4, color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
}
const checkboxLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer',
}
const pillButton: React.CSSProperties = {
  height: 28, padding: '0 12px', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)',
  borderRadius: 4, color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
}
const primaryPill: React.CSSProperties = {
  flex: 1, height: 30, padding: '0 10px', background: 'var(--neon-blue)', border: '1px solid var(--neon-blue)',
  borderRadius: 4, color: 'var(--bg-base)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
}
const secondaryPill: React.CSSProperties = {
  flex: 1, height: 30, padding: '0 10px', background: 'transparent', border: '1px solid var(--border-subtle)',
  borderRadius: 4, color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
}
const connectionRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', background: 'transparent', border: '1px solid var(--border-subtle)',
  borderRadius: 4, padding: '5px 8px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'inherit', cursor: 'pointer', width: '100%',
}
