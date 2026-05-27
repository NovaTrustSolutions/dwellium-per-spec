import { ragQuery } from './ragDb'
import { loadConfig, getWikiCacheDir } from './config'

// ── Types ─────────────────────────────────────────────────────────────────

export interface IngestedDocument {
  id: string
  source_path: string
  source_root: 'projects' | 'library' | 'inbox' | string
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
  /** Most-recent error from rag_operations_log for this source_path, or
   *  null. Used to render a red ✗ status on the row even when the doc
   *  itself is_active = TRUE (last successful ingest still on disk, but
   *  the most recent re-ingest attempt failed). */
  last_error: string | null
}

export interface ListIngestedArgs {
  domaineId?: string | null
  crossDomaine?: boolean
  sourceType?: string | null
  /** Three-tier wiki filter (`b5033d5`). When set, the result is scoped
   *  to rag_documents that correspond to a rag_wiki_pages row of the
   *  given tier. Non-wiki docs and wiki docs of other tiers drop out.
   *  Mapping is by source_path → wp.slug (slug + ".md" suffix against
   *  the wiki disk dir resolved from holocronRoot). */
  tier?: 'thread' | 'project' | 'domaine' | null
  search?: string | null
  limit?: number
  offset?: number
}

export interface IngestActivityEvent {
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

// ── Queries ───────────────────────────────────────────────────────────────

/**
 * Paginated list of currently-active ingested documents with tag and
 * relationship counts, the row's Domaine + Project, and the most-recent
 * ingest error if any. Default scope is the active Domaine; non-wiki bridge
 * namespaces are always included (matches Codex/Search semantics).
 *
 * Wiki rows resolve their Domaine/Project from `rag_wiki_pages` (the compile
 * provenance) rather than the `__library__` bridge namespace they ingest
 * into — which has `domaine_id = NULL` and would otherwise render the
 * Project · Domaine column blank. Same join as `graphQueries.ts`.
 */
export async function listIngestedDocuments(args: ListIngestedArgs = {}): Promise<{
  rows: IngestedDocument[]
  totalCount: number
}> {
  const limit  = Math.max(1, Math.min(args.limit  ?? 200, 1000))
  const offset = Math.max(0, args.offset ?? 0)

  const params: unknown[] = [limit, offset]
  let p = params.length

  // Wiki provenance — resolve a wiki rag_documents row back to its
  // rag_wiki_pages row by source_path (= wikiDir/<slug>.md). Built when
  // the wiki cache dir is resolvable (workspace root + libraryPath);
  // without it, wiki rows fall back to the namespace-only resolution
  // (Project/Domaine show blank, as before) and the tier filter is a
  // no-op. The wikiPrefix flows through getWikiCacheDir so a user-
  // configured libraryPath (e.g. iCloud) is honored.
  let wikiPrefixIdx = 0
  {
    const wikiDir = getWikiCacheDir(loadConfig())
    if (wikiDir) {
      params.push(wikiDir + '/')
      wikiPrefixIdx = params.length
    }
  }
  const wikiJoin = wikiPrefixIdx
    ? `LEFT JOIN rag_wiki_pages wp
        ON d.source_type = 'wiki' AND d.source_path = $${wikiPrefixIdx}::text || wp.slug || '.md'`
    : ''
  // Wiki rows: real Domaine/Project from rag_wiki_pages; everything else
  // (and any wiki row with no live page) falls back to the namespace.
  const domaineIdExpr   = wikiPrefixIdx ? 'COALESCE(wp.domaine_id, n.domaine_id)' : 'n.domaine_id'
  const projectNameExpr = wikiPrefixIdx ? 'COALESCE(d.project_name, wp.namespace)' : 'd.project_name'

  const where: string[] = ['d.is_active = TRUE']

  // Domaine scope: crossDomaine bypasses; otherwise filter on the resolved
  // Domaine (the real one for wiki rows). Non-wiki bridge content (library
  // refs, inbox) still reaches every Domaine view; wiki rows don't leak
  // across Domaines — they're per-Domaine by construction (b5033d5) — and a
  // wiki row with no live page (a zombie) has a NULL resolved Domaine, so it
  // drops out of every scoped view but still shows under "Across all".
  if (!args.crossDomaine && args.domaineId) {
    params.push(args.domaineId)
    p = params.length
    where.push(
      `(${domaineIdExpr} = $${p}::uuid
        OR (COALESCE(n.is_bridge_namespace, FALSE) AND d.source_type <> 'wiki'))`,
    )
  }

  if (args.sourceType) {
    params.push(args.sourceType)
    p = params.length
    where.push(`d.source_type = $${p}`)
  }

  if (args.search && args.search.trim()) {
    params.push(`%${args.search.trim()}%`)
    p = params.length
    where.push(`(d.title ILIKE $${p} OR d.source_path ILIKE $${p})`)
  }

  // Tier filter — only meaningful when the wiki join is present. `wp` is
  // LEFT-joined, so a non-wiki row (or a wiki row of another tier) has
  // wp.tier = NULL → `wp.tier = $X` is false → it drops out.
  if (args.tier && wikiPrefixIdx) {
    params.push(args.tier)
    p = params.length
    where.push(`wp.tier = $${p}`)
  }

  const sql = `
    SELECT
      d.id::text,
      d.source_path,
      d.source_root,
      d.source_type,
      ${projectNameExpr} AS project_name,
      d.title,
      d.word_count,
      d.ingested_at::text,
      d.last_modified::text,
      d.is_active,
      COALESCE((SELECT COUNT(*)::int FROM rag_document_tags WHERE document_id = d.id), 0) AS tag_count,
      COALESCE(
        (SELECT COUNT(*)::int FROM rag_relationships
         WHERE document_a_id = d.id OR document_b_id = d.id),
        0
      ) AS relationship_count,
      ${domaineIdExpr}::text AS domaine_id,
      -- Read the error from the MOST RECENT ingest event (not the most
      -- recent error). A successful re-ingest writes a row without an
      -- 'error' key in details, so details->>'error' is NULL on the latest
      -- row — and the red-X badge clears. Previously this filtered to
      -- error-only rows, making the X permanent once a doc had ever failed
      -- (e.g. a transient HTTP 503 from Gemini on first ingest stayed
      -- visible even after a clean re-ingest).
      (
        SELECT details->>'error' FROM rag_operations_log ol
        WHERE ol.operation = 'ingest'
          AND ol.details->>'source_path' = d.source_path
        ORDER BY ol.created_at DESC
        LIMIT 1
      ) AS last_error,
      COUNT(*) OVER () AS total_count
    FROM rag_documents d
    LEFT JOIN rag_namespaces n
      ON n.name = COALESCE(d.project_name, '__' || d.source_root || '__')
    ${wikiJoin}
    WHERE ${where.join(' AND ')}
    ORDER BY d.ingested_at DESC
    LIMIT $1::int OFFSET $2::int
  `

  const res = await ragQuery<IngestedDocument & { total_count: string }>(sql, params)
  const rows = res?.rows ?? []
  const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0
  // Strip the window-fn helper column from the wire payload.
  return {
    rows: rows.map(({ total_count: _t, ...rest }) => rest),
    totalCount,
  }
}

/**
 * Chronological log of ingest events (success and failure). Pulled from
 * rag_operations_log filtered to operation='ingest'. The same data the HUD
 * RecentActivity widget surfaces, but unfiltered and at higher limits so
 * the Ingest tab can show a deeper history.
 */
export async function listIngestActivity(limit = 100): Promise<IngestActivityEvent[]> {
  const cap = Math.max(1, Math.min(limit, 500))
  const res = await ragQuery<IngestActivityEvent>(`
    SELECT
      id::text,
      operation,
      details->>'source_path' AS source_path,
      details->>'source_type' AS source_type,
      (details->>'tag_count')::int AS tag_count,
      (details->>'skipped')::bool AS skipped,
      details->>'error' AS error,
      duration_ms,
      cost_usd,
      provider,
      details->>'model' AS model,
      created_at::text
    FROM rag_operations_log
    WHERE operation = 'ingest'
    ORDER BY created_at DESC
    LIMIT ${cap}
  `)
  return res?.rows ?? []
}

/**
 * Summary counts for the top of the Ingest tab — same flavor as
 * getDashboardStats but trimmed to the ingest-relevant fields plus the
 * timestamp of the most recent successful ingest.
 */
export async function getIngestCounts(): Promise<IngestCounts> {
  const res = await ragQuery<{
    documents: string
    tags: string
    relationships: string
    last_ingest_at: string | null
  }>(`
    SELECT
      (SELECT COUNT(*) FROM rag_documents WHERE is_active)::text AS documents,
      (SELECT COUNT(*) FROM rag_tags)::text AS tags,
      (SELECT COUNT(*) FROM rag_relationships)::text AS relationships,
      (SELECT MAX(created_at)::text FROM rag_operations_log
        WHERE operation = 'ingest'
          AND (details->>'error') IS NULL) AS last_ingest_at
  `)
  const row = res?.rows[0]
  return {
    documents:     Number(row?.documents     ?? 0),
    tags:          Number(row?.tags          ?? 0),
    relationships: Number(row?.relationships ?? 0),
    lastIngestAt:  row?.last_ingest_at ?? null,
  }
}
