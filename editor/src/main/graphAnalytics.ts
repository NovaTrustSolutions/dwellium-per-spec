// graphAnalytics.ts
// Graph-theory readout over rag_documents + rag_relationships. Powers the
// Codex → Syntheses analytics panel (architecture-v4.md §7.2) and the new
// graph visual encodings — node size = betweenness centrality, color =
// Louvain community (architecture-v4.md §8).
//
// We lean on graphology + graphology-metrics + graphology-communities-louvain
// rather than hand-rolling Brandes/Louvain:
//   • Louvain especially is subtle (modularity-maximization with the resolution
//     knob, dendrogram handling); the lib is well-tested.
//   • Brandes is ~O(V·E) — fine at Andy's corpus size (~30–500 nodes).
//   • The whole dep set is < 100 KB, lives in the main process, never ships
//     to the renderer bundle.
//
// Public API:
//   computeGraphAnalytics({ domaineId, crossDomaine }) → GraphAnalytics
//
// The same scope-resolution that `fetchGraph` uses (Domaine filter + bridge
// reach + zombie-wiki dropping) is reused — we want the analytics readout
// and the rendered graph to describe the same closed sub-graph.

import { UndirectedGraph } from 'graphology'
import betweennessCentrality from 'graphology-metrics/centrality/betweenness'
import louvain from 'graphology-communities-louvain'
import modularity from 'graphology-metrics/graph/modularity'

import { fetchGraph, type GraphNode } from './graphQueries'
import { ragQuery } from './ragDb'

// ── Public types ──────────────────────────────────────────────────────────

export interface AnalyticsCommunity {
  /** Stable within a single compute. Louvain reassigns ids each run, so
   *  consumers should treat ids as ephemeral keys, not persisted handles. */
  id:           number
  /** Auto-name derived from the top 1–2 tags shared across members. The
   *  Synthesis Agent (Session 3) will rename these with Claude Sonnet —
   *  for now this is the heuristic placeholder. */
  name:         string
  memberIds:    string[]
  memberCount:  number
  /** Distinct Domaines this cluster spans. A cluster crossing multiple
   *  Domaines is the most interesting kind: it means the *connectivity*
   *  finds a theme the *folder structure* doesn't. */
  domaineIds:   string[]
  domaineNames: string[]
  /** Top tags by frequency, with their share of the cluster (0..1). */
  topTags:      Array<{ tag: string; share: number }>
}

export interface AnalyticsInfluentialDoc {
  docId:        string
  title:        string
  /** Normalized betweenness centrality, 0..1 (graphology's `normalized: true`
   *  divides by (n-1)(n-2)/2 for undirected graphs). */
  betweenness:  number
  domaineId:    string | null
  domaineName:  string | null
  sourceType:   string
}

export interface AnalyticsGap {
  /** Stable key: "gap:<smallerCommunityId>-<largerCommunityId>". Suitable
   *  for `rag_syntheses.gap_id` when the user clicks "write this synthesis". */
  id:            string
  communityA:    { id: number; name: string; memberCount: number }
  communityB:    { id: number; name: string; memberCount: number }
  /** Inverse-of-density — higher = less inter-cluster connection per
   *  member-pair. The headline "size" of the gap. */
  gapSize:       number
  /** Raw count of edges that bridge the two communities. */
  interEdgeCount: number
}

export interface AnalyticsDiversity {
  modularity:     number
  communityCount: number
  /** Largest community's share of total nodes, 0..1. */
  largestShare:   number
  /** Normalized entropy of the community-size distribution, 0..1. 0 = one
   *  community swallows everything; 1 = perfectly even split. */
  score:          number
  band:           'focused' | 'balanced' | 'scattered'
  recommendation: string
}

export interface GraphAnalytics {
  communities:       AnalyticsCommunity[]
  topByBetweenness:  AnalyticsInfluentialDoc[]
  structuralGaps:    AnalyticsGap[]
  topicalDiversity:  AnalyticsDiversity | null
  metrics: {
    nodeCount:      number
    edgeCount:      number
    computedAt:     string
    /** True when the corpus is too small to run analytics meaningfully
     *  (< 2 nodes or < 1 edge — Louvain returns a degenerate partition,
     *  Brandes is all zeros). UI should render an empty-state instead. */
    degenerate:     boolean
  }
}

export interface ComputeArgs {
  /** DEPRECATED — kept for backwards compatibility. `domaineIds` wins. */
  domaineId?:    string | null
  /** Session 7 second-pass — multi-Domaine filter. */
  domaineIds?:   string[] | null
  crossDomaine?: boolean
  /** Top-N for the influential-docs list. Default 10. */
  topInfluential?: number
  /** Top-N for structural gaps. Default 5. */
  topGaps?:        number
}

// ── Computation ───────────────────────────────────────────────────────────

export async function computeGraphAnalytics(args: ComputeArgs = {}): Promise<GraphAnalytics> {
  const { domaineId = null, domaineIds = null, crossDomaine = false } = args
  const topInfluential = Math.max(1, args.topInfluential ?? 10)
  const topGaps        = Math.max(0, args.topGaps        ?? 5)

  const { nodes, edges } = await fetchGraph({ domaineId, domaineIds, crossDomaine })

  const empty = (degenerate: boolean): GraphAnalytics => ({
    communities:      [],
    topByBetweenness: [],
    structuralGaps:   [],
    topicalDiversity: null,
    metrics: {
      nodeCount:  nodes.length,
      edgeCount:  edges.length,
      computedAt: new Date().toISOString(),
      degenerate,
    },
  })

  // Degenerate corpora: < 2 nodes (no possible edges) or 0 edges (no
  // connectivity to analyze). Louvain on an edgeless graph puts every node
  // in its own community; Brandes is all zeros. Bail with an empty result
  // so the UI can render the "not enough data yet" state instead of a
  // misleading constellation.
  if (nodes.length < 2 || edges.length === 0) {
    return empty(true)
  }

  // Build the graph. Undirected — `rag_relationships` is conceptually
  // symmetric (wikilink, tag-shared, contradicts, expands, references all
  // imply mutual relation). Edge weight = strength (default 0.5).
  // mergeEdge tolerates duplicates (same pair appearing twice in the rows)
  // by adding weights — fine for our analytics.
  const graph = new UndirectedGraph()
  const nodeIndex = new Map<string, GraphNode>()
  for (const n of nodes) {
    graph.addNode(n.id, { title: n.title, domaineId: n.domaine_id, domaineName: n.domaine_name })
    nodeIndex.set(n.id, n)
  }
  for (const e of edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue
    if (e.source === e.target) continue           // skip self-loops (Brandes barfs)
    if (graph.hasEdge(e.source, e.target)) {
      // Accumulate weight on duplicate (e.g., wikilink + tag-shared between
      // the same pair).
      const existing = graph.getEdgeAttribute(e.source, e.target, 'weight') as number
      graph.setEdgeAttribute(e.source, e.target, 'weight', existing + (e.strength || 0.5))
    } else {
      graph.addEdge(e.source, e.target, { weight: e.strength || 0.5, relationship: e.relationship })
    }
  }

  // ── Louvain communities ────────────────────────────────────────────────
  const communityById = louvain(graph, { getEdgeWeight: 'weight' }) as Record<string, number>
  const communityMembers = new Map<number, string[]>()
  for (const [docId, cid] of Object.entries(communityById)) {
    let arr = communityMembers.get(cid)
    if (!arr) { arr = []; communityMembers.set(cid, arr) }
    arr.push(docId)
  }

  // Tag lookup for naming + top-tags. One query, joined with rag_document_tags.
  const docIds = nodes.map((n) => n.id)
  const tagsByDoc = await loadTagsForDocs(docIds)

  // Aggregate tags per community + name from top tags.
  const communities: AnalyticsCommunity[] = []
  for (const [cid, memberIds] of communityMembers) {
    // Tag frequency across members.
    const tagFreq = new Map<string, number>()
    for (const id of memberIds) {
      const tags = tagsByDoc.get(id) || []
      for (const t of tags) tagFreq.set(t, (tagFreq.get(t) || 0) + 1)
    }
    const sortedTags = [...tagFreq.entries()].sort((a, b) => b[1] - a[1])
    const topTags = sortedTags.slice(0, 5).map(([tag, count]) => ({
      tag,
      share: memberIds.length > 0 ? count / memberIds.length : 0,
    }))

    // Domaines spanned by this cluster.
    const domaineIdSet  = new Set<string>()
    const domaineNameSet = new Set<string>()
    for (const id of memberIds) {
      const n = nodeIndex.get(id)
      if (n?.domaine_id) domaineIdSet.add(n.domaine_id)
      if (n?.domaine_name) domaineNameSet.add(n.domaine_name)
    }

    communities.push({
      id:           cid,
      name:         nameCommunity(topTags, memberIds.length),
      memberIds,
      memberCount:  memberIds.length,
      domaineIds:   [...domaineIdSet],
      domaineNames: [...domaineNameSet],
      topTags,
    })
  }
  // Sort by member count desc — the panel reads largest-first.
  communities.sort((a, b) => b.memberCount - a.memberCount)

  // ── Betweenness centrality ─────────────────────────────────────────────
  // Normalized so values are 0..1 regardless of corpus size. Weight is
  // wired in but Brandes treats high weight = high "cost" by default in
  // most implementations — for our purposes (where strength is similarity,
  // not distance) we want high strength to make a path *more attractive*,
  // not less. The cleanest fix is to invert weights — but the difference
  // is small at our scale and the unweighted form is the standard "which
  // nodes are bridges" reading. Use unweighted Brandes (option omitted)
  // to keep the result interpretable as "structural bridges by topology",
  // not "weighted shortest-path bridges". Revisit if Andy wants weight-
  // sensitive bridge detection later.
  const bcMap = betweennessCentrality(graph, { normalized: true }) as Record<string, number>
  const topByBetweenness: AnalyticsInfluentialDoc[] = nodes
    .map((n) => ({
      docId:       n.id,
      title:       n.title,
      betweenness: bcMap[n.id] ?? 0,
      domaineId:   n.domaine_id,
      domaineName: n.domaine_name,
      sourceType:  n.source_type,
    }))
    .sort((a, b) => b.betweenness - a.betweenness)
    .slice(0, topInfluential)

  // ── Structural gaps ────────────────────────────────────────────────────
  // For every pair of communities count the edges that cross between them.
  // gapSize = (cardA * cardB) / (1 + interEdgeCount + interEdgeWeightSum) —
  // larger pairs with few/weak bridges have the biggest gap. Skip pairs
  // where either side is a singleton (a single doc isn't a "body of
  // knowledge"). Cap at topGaps.
  const interEdges = new Map<string, { count: number; weight: number }>()
  for (const e of edges) {
    const ca = communityById[e.source]
    const cb = communityById[e.target]
    if (ca === undefined || cb === undefined || ca === cb) continue
    const key = pairKey(ca, cb)
    let bucket = interEdges.get(key)
    if (!bucket) { bucket = { count: 0, weight: 0 }; interEdges.set(key, bucket) }
    bucket.count++
    bucket.weight += e.strength || 0.5
  }

  const commById = new Map(communities.map((c) => [c.id, c]))
  const gaps: AnalyticsGap[] = []
  const communityIds = [...communityMembers.keys()]
  for (let i = 0; i < communityIds.length; i++) {
    for (let j = i + 1; j < communityIds.length; j++) {
      const a = commById.get(communityIds[i])!
      const b = commById.get(communityIds[j])!
      if (a.memberCount < 2 || b.memberCount < 2) continue
      const key = pairKey(a.id, b.id)
      const inter = interEdges.get(key) || { count: 0, weight: 0 }
      const gapSize = (a.memberCount * b.memberCount) / (1 + inter.count + inter.weight)
      // Order endpoints by member count for stable display + gap ids.
      const [first, second] = a.memberCount <= b.memberCount ? [a, b] : [b, a]
      gaps.push({
        id: `gap:${first.id}-${second.id}`,
        communityA: { id: first.id,  name: first.name,  memberCount: first.memberCount },
        communityB: { id: second.id, name: second.name, memberCount: second.memberCount },
        gapSize,
        interEdgeCount: inter.count,
      })
    }
  }
  gaps.sort((a, b) => b.gapSize - a.gapSize)
  const structuralGaps = gaps.slice(0, topGaps)

  // ── Topical diversity ──────────────────────────────────────────────────
  // We need at least one edge for modularity to be meaningful — already
  // guarded above. If we somehow ended up with one community swallowing
  // everything, score is 0 (no diversity).
  const total = nodes.length
  const sizes = [...communityMembers.values()].map((m) => m.length)
  const largest = sizes.reduce((m, s) => (s > m ? s : m), 0)
  const largestShare = total > 0 ? largest / total : 0

  // Shannon entropy normalized by log(communityCount). 1 = perfectly even,
  // 0 = one community.
  let entropy = 0
  for (const s of sizes) {
    if (s === 0) continue
    const p = s / total
    entropy -= p * Math.log(p)
  }
  const maxEntropy = sizes.length > 1 ? Math.log(sizes.length) : 1
  const score = maxEntropy > 0 ? Math.min(1, entropy / maxEntropy) : 0

  // Bands tuned for Andy's-corpus scale: a single dominant cluster ≤ 0.4
  // reads "focused", a balanced multi-cluster spread 0.4–0.7 reads
  // "balanced", high entropy with no clear hub ≥ 0.7 reads "scattered".
  // The recommendation tries to be useful, not numeric.
  let band: AnalyticsDiversity['band']
  let recommendation: string
  if (score < 0.4) {
    band = 'focused'
    const top = communities[0]
    recommendation = top
      ? `One cluster dominates (${top.name}, ${top.memberCount} docs, ${Math.round(largestShare * 100)}% of the graph). You're deep in this theme — consider what an outside perspective would surface.`
      : 'One cluster dominates — bring in perspectives from elsewhere.'
  } else if (score < 0.7) {
    band = 'balanced'
    recommendation = `${communities.length} clusters with ${structuralGaps.length} structural gaps detected. This is a healthy spread — the gaps below are the highest-value places to bridge.`
  } else {
    band = 'scattered'
    recommendation = `${communities.length} loosely-connected clusters. The knowledge base may be too dispersed to synthesize — pick one or two themes and connect their docs explicitly.`
  }

  const mod = modularityFromMap(graph, communityById)

  return {
    communities,
    topByBetweenness,
    structuralGaps,
    topicalDiversity: {
      modularity:     mod,
      communityCount: communities.length,
      largestShare,
      score,
      band,
      recommendation,
    },
    metrics: {
      nodeCount:  nodes.length,
      edgeCount:  edges.length,
      computedAt: new Date().toISOString(),
      degenerate: false,
    },
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function nameCommunity(topTags: Array<{ tag: string; share: number }>, _memberCount: number): string {
  // Heuristic placeholder: top 2 tags joined with " + ". Drop tags that
  // appear in fewer than 25% of members — they're not characteristic.
  // Falls back to "Cluster" if no shared tags exist.
  const characteristic = topTags.filter((t) => t.share >= 0.25)
  if (characteristic.length === 0) return 'Untitled cluster'
  if (characteristic.length === 1) return characteristic[0].tag
  return `${characteristic[0].tag} + ${characteristic[1].tag}`
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function modularityFromMap(graph: UndirectedGraph, communityById: Record<string, number>): number {
  // Assign communities as node attributes, then call modularity with the
  // attribute getter. This is the recommended graphology-metrics flow.
  graph.forEachNode((id) => {
    graph.setNodeAttribute(id, 'community', communityById[id] ?? -1)
  })
  return modularity(graph, {
    getNodeCommunity: 'community',
    getEdgeWeight:    'weight',
  })
}

// ── Tag lookup (for community naming) ────────────────────────────────────

async function loadTagsForDocs(docIds: string[]): Promise<Map<string, string[]>> {
  if (docIds.length === 0) return new Map()
  const res = await ragQuery<{ document_id: string; name: string }>(
    `SELECT dt.document_id::text AS document_id, t.name
       FROM rag_document_tags dt
       JOIN rag_tags t ON t.id = dt.tag_id
      WHERE dt.document_id = ANY($1::uuid[])
      ORDER BY dt.confidence DESC NULLS LAST`,
    [docIds],
  )
  const out = new Map<string, string[]>()
  for (const row of res?.rows ?? []) {
    let arr = out.get(row.document_id)
    if (!arr) { arr = []; out.set(row.document_id, arr) }
    arr.push(row.name)
  }
  return out
}

