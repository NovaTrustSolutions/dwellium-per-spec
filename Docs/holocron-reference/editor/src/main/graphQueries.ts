import { ragQuery } from './ragDb'
import { loadConfig, getWikiCacheDir } from './config'

// ── Types ─────────────────────────────────────────────────────────────────

export interface GraphNode {
  id:           string
  title:        string
  source_path:  string
  source_root:  string
  source_type:  string
  project_name: string | null
  /** Real owning Domaine. For wiki rows this comes from rag_wiki_pages
   *  (the compile provenance), NOT the __library__ bridge namespace they
   *  ingest into. Null only for genuine cross-Domaine bridge content
   *  (library references, inbox items). */
  domaine_id:   string | null
  domaine_name: string | null
  /** Namespace name — the project namespace for raw docs, the wiki page's
   *  namespace for wiki rows, '__library__' / '__inbox__' for bridges. */
  namespace:    string | null
  /** Wiki tier: 'thread' | 'project' | 'domaine'. Null for non-wiki docs. */
  tier:         string | null
  /** Edges to other in-scope nodes. Edges to docs outside the current
   *  Domaine filter are not counted — degree always reflects what the user
   *  actually sees. */
  degree:       number
}

export interface GraphEdge {
  id:           string
  /** Cytoscape convention: `source`/`target` instead of `document_a/b_id`. */
  source:       string
  target:       string
  relationship: string
  strength:     number
}

export interface FetchGraphArgs {
  /** DEPRECATED — kept for backwards compatibility with callers that
   *  haven't migrated to the multi-select shape. Use `domaineIds` instead.
   *  When both are provided, `domaineIds` wins. */
  domaineId?:    string | null
  /** Session 7 second-pass — multi-Domaine filter. `null` or empty array
   *  means "no filter, show all (with bridges per the existing logic)".
   *  Non-empty array filters to those Domaines via an `= ANY(...)` clause. */
  domaineIds?:   string[] | null
  crossDomaine?: boolean
}

// ── Query ─────────────────────────────────────────────────────────────────

/**
 * Returns the relationship graph for the Codex/Graph sub-tab. Two passes:
 * first nodes (scoped by Domaine same way Ingest/Search are), then edges
 * filtered to pairs where both endpoints are in the scoped node set. This
 * guarantees no dangling edges to off-screen nodes — what the user sees is
 * a closed sub-graph.
 *
 * Wiki rows are joined back to `rag_wiki_pages` by source_path (= the wiki
 * cache dir + `<slug>.md`) so they carry their real `tier` / `namespace` /
 * `domaine_id` instead of resolving through the `__library__` bridge
 * namespace (which has a NULL domaine_id). A wiki row with no live
 * `rag_wiki_pages` match is a migration-007 zombie and is dropped.
 *
 * Default scope is the active Domaine; non-wiki bridge namespaces (library
 * references, inbox) always reachable. `crossDomaine=true` bypasses the
 * filter and returns the full graph.
 */
export async function fetchGraph(args: FetchGraphArgs = {}): Promise<{
  nodes: GraphNode[]
  edges: GraphEdge[]
}> {
  // Resolve the wiki cache dir via getWikiCacheDir — reads cfg.libraryPath
  // when set, falls back to the sibling-of-Domaines derivation otherwise.
  // When unresolvable the wiki join can't run — wiki rows fall back to
  // namespace-derived (NULL) domaine, and the zombie filter is skipped.
  const wikiDir = getWikiCacheDir(loadConfig())
  const wikiPrefix = wikiDir ? wikiDir + '/' : null

  const params: unknown[] = []
  params.push(wikiPrefix)
  const PFX = `$${params.length}::text`

  const where: string[] = ['d.is_active = TRUE']
  // Drop migration-007 zombie wiki rows (wiki-typed rag_documents with no
  // live rag_wiki_pages row). Only enforceable when we have a wikiPrefix.
  if (wikiPrefix) where.push(`(d.source_type <> 'wiki' OR wp.slug IS NOT NULL)`)

  // Resolve the filter Domaine list. `domaineIds` wins when provided
  // non-empty; otherwise fall back to the legacy single-Domaine `domaineId`.
  // `crossDomaine=true` bypasses the filter entirely (full graph + bridges).
  const filterIds: string[] = args.domaineIds && args.domaineIds.length > 0
    ? args.domaineIds
    : (args.domaineId ? [args.domaineId] : [])
  if (!args.crossDomaine && filterIds.length > 0) {
    params.push(filterIds)
    // Real Domaine match: wp.domaine_id for wiki rows, n.domaine_id otherwise.
    // Non-wiki bridge content still reaches every Domaine view; wiki rows
    // do not (they're per-Domaine by construction). `= ANY(...)` handles
    // both the single-Domaine legacy case (one-element array) and the
    // multi-Domaine Session 7 case with the same query shape.
    where.push(
      `(COALESCE(wp.domaine_id, n.domaine_id) = ANY($${params.length}::uuid[])` +
      ` OR (COALESCE(n.is_bridge_namespace, FALSE) AND d.source_type <> 'wiki'))`,
    )
  }

  const nodesSql = `
    WITH scoped AS (
      SELECT d.id, d.title, d.source_path, d.source_root, d.source_type, d.project_name,
             COALESCE(wp.domaine_id, n.domaine_id) AS domaine_id,
             COALESCE(wp.namespace, n.name)        AS namespace,
             wp.tier                               AS tier
      FROM rag_documents d
      LEFT JOIN rag_namespaces n
        ON n.name = COALESCE(d.project_name, '__' || d.source_root || '__')
      LEFT JOIN rag_wiki_pages wp
        ON d.source_type = 'wiki'
       AND ${PFX} IS NOT NULL
       AND d.source_path = ${PFX} || wp.slug || '.md'
      WHERE ${where.join(' AND ')}
    )
    SELECT
      s.id::text,
      s.title,
      s.source_path,
      s.source_root,
      s.source_type,
      s.project_name,
      s.domaine_id::text AS domaine_id,
      dm.name            AS domaine_name,
      s.namespace,
      s.tier,
      COALESCE((
        SELECT COUNT(*)::int FROM rag_relationships r
        WHERE (r.document_a_id = s.id AND r.document_b_id IN (SELECT id FROM scoped))
           OR (r.document_b_id = s.id AND r.document_a_id IN (SELECT id FROM scoped))
      ), 0) AS degree
    FROM scoped s
    LEFT JOIN rag_domaines dm ON dm.id = s.domaine_id
    ORDER BY s.title
  `

  const nodesRes = await ragQuery<GraphNode>(nodesSql, params)
  const nodes = nodesRes?.rows ?? []

  if (nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const nodeIds = nodes.map((n) => n.id)
  const edgesRes = await ragQuery<{
    id:            string
    document_a_id: string
    document_b_id: string
    relationship:  string
    strength:      number
  }>(
    `SELECT id::text, document_a_id::text, document_b_id::text, relationship, strength
     FROM rag_relationships
     WHERE document_a_id = ANY($1::uuid[]) AND document_b_id = ANY($1::uuid[])`,
    [nodeIds],
  )

  const edges: GraphEdge[] = (edgesRes?.rows ?? []).map((r) => ({
    id:           r.id,
    source:       r.document_a_id,
    target:       r.document_b_id,
    relationship: r.relationship,
    strength:     r.strength,
  }))

  // Synthetic hierarchy edges — the structural skeleton connecting wiki
  // tiers to each other and to the documents they cover. These are NOT
  // stored in rag_relationships (which is the agent-discovered semantic
  // layer); they're derived on the fly from the namespace + wiki-page
  // hierarchy so the graph shows the org-chart shape that the Domaines
  // tab exposes natively. Renderer styles them thin / dashed / low-opacity
  // and DOES NOT count them toward node degree (degree above is computed
  // from rag_relationships only; these edges don't inflate node size).
  const hierarchyEdges = await buildHierarchyEdges(nodes, wikiPrefix, new Set(nodeIds))
  edges.push(...hierarchyEdges)

  return { nodes, edges }
}

/** Build Domain→Project + Project→Thread + Thread→source edges from the
 *  scoped node set. Wiki-tier nodes are matched by (namespace,
 *  domaine_id) — Domain (tier-3) sits at the top with namespace=NULL,
 *  Project (tier-2) inherits namespace=project_name, Thread (tier-1)
 *  carries the same namespace. The Thread→source mapping requires one
 *  extra DB roundtrip against rag_wiki_page_sources keyed by wiki page
 *  ID (resolved from the thread wiki doc's source_path).
 *
 *  All synthetic edges use relationship='hierarchy' and strength=0 so
 *  the renderer can style them distinctly and so the analytics layer
 *  (graphAnalytics.ts) can filter them out of Louvain / BC computations
 *  when desired (those should run over the semantic relationship layer,
 *  not the structural skeleton). */
async function buildHierarchyEdges(
  nodes: GraphNode[],
  wikiPrefix: string | null,
  scopedIds: Set<string>,
): Promise<GraphEdge[]> {
  const out: GraphEdge[] = []
  // Wiki-tier indexes for JS-side joins. Domain by domaine_id; Project
  // by (namespace, domaine_id); Thread keyed the same way as Project so
  // a project finds its threads with one lookup.
  const domainByDomaineId   = new Map<string, GraphNode>()
  const projectByNs         = new Map<string, GraphNode>()
  const threadsByProjectNs  = new Map<string, GraphNode[]>()
  const threadWikiNodes: GraphNode[] = []
  for (const n of nodes) {
    if (n.source_type !== 'wiki' || !n.domaine_id) continue
    if (n.tier === 'domaine') {
      domainByDomaineId.set(n.domaine_id, n)
    } else if (n.tier === 'project' && n.namespace) {
      projectByNs.set(`${n.namespace}|${n.domaine_id}`, n)
    } else if (n.tier === 'thread' && n.namespace) {
      const key = `${n.namespace}|${n.domaine_id}`
      let arr = threadsByProjectNs.get(key)
      if (!arr) { arr = []; threadsByProjectNs.set(key, arr) }
      arr.push(n)
      threadWikiNodes.push(n)
    }
  }

  // Domain → Project
  for (const [key, project] of projectByNs) {
    const domaineId = key.split('|')[1]
    const domain = domainByDomaineId.get(domaineId)
    if (domain && scopedIds.has(domain.id) && scopedIds.has(project.id)) {
      out.push({
        id:           `hier:${domain.id}:${project.id}`,
        source:       domain.id,
        target:       project.id,
        relationship: 'hierarchy',
        strength:     0,
      })
    }
  }
  // Project → Thread
  for (const [key, threads] of threadsByProjectNs) {
    const project = projectByNs.get(key)
    if (!project || !scopedIds.has(project.id)) continue
    for (const thread of threads) {
      if (!scopedIds.has(thread.id)) continue
      out.push({
        id:           `hier:${project.id}:${thread.id}`,
        source:       project.id,
        target:       thread.id,
        relationship: 'hierarchy',
        strength:     0,
      })
    }
  }

  // Thread → source documents — needs the wiki_page_sources join. Skip
  // if wikiPrefix is unresolvable (no workspace root) — the JS-side
  // hierarchy above still works without it.
  if (wikiPrefix && threadWikiNodes.length > 0) {
    // Session 9 audit: `threadIds` is computed but never bound — the query
    // below uses `[...scopedIds]` for both placeholders. This is likely a
    // latent intent gap (the inner-join branch should probably bind thread
    // doc IDs separately) — flagged for a future query-correctness pass
    // rather than deleted, since removing it risks masking the bug.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const threadIds = threadWikiNodes.map((n) => n.id) // noqa: latent-bug
    void threadIds
    const srcRes = await ragQuery<{ thread_doc_id: string; source_doc_id: string }>(
      `SELECT thr_doc.id::text AS thread_doc_id, src.document_id::text AS source_doc_id
         FROM rag_wiki_page_sources src
         JOIN rag_wiki_pages wp ON wp.id = src.wiki_page_id AND wp.tier = 'thread'
         JOIN rag_documents thr_doc
           ON thr_doc.source_type = 'wiki'
          AND thr_doc.source_path = $1::text || wp.slug || '.md'
        WHERE thr_doc.id = ANY($2::uuid[])
          AND src.document_id = ANY($2::uuid[])`,
      [wikiPrefix, [...scopedIds]],
    )
    for (const row of srcRes?.rows ?? []) {
      out.push({
        id:           `hier:${row.thread_doc_id}:${row.source_doc_id}`,
        source:       row.thread_doc_id,
        target:       row.source_doc_id,
        relationship: 'hierarchy',
        strength:     0,
      })
    }
  }

  return out
}
