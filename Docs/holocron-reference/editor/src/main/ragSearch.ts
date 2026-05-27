import { ragQuery } from './ragDb'

// ── Types ─────────────────────────────────────────────────────────────────

export type SearchSourceRoot = 'projects' | 'library' | 'inbox'
export type SearchSourceType =
  | 'inbox' | 'brain_dump' | 'note' | 'report' | 'reference' | 'wiki' | 'synthesis'

export interface RagSearchArgs {
  query: string
  /** Scope the search to documents whose namespace belongs to this Domaine.
   *  Null/empty disables Domaine filtering — useful for legacy callers or
   *  when no Domaine context is available (rare). */
  domaineId: string | null
  /** When true, the Domaine filter is bypassed and the search includes
   *  documents from every Domaine. The explicit toggle prevents the user
   *  from accidentally crossing Domaine boundaries — must be opted into. */
  crossDomaine: boolean
  sourceRoot?: SearchSourceRoot | null       // null/undefined = no filter
  sourceType?: SearchSourceType | null
  limit?: number
}

export interface RagSearchResult {
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

// ── Search ────────────────────────────────────────────────────────────────

/**
 * Domaine-aware full-text search over rag_documents.
 *
 * Default behavior scopes to the active Domaine (resolved from
 * args.domaineId). The bridge namespaces (rag_namespaces.is_bridge_namespace
 * = TRUE — typically the synthetic __library__ and __inbox__) are ALWAYS
 * included regardless of Domaine: those are designed as cross-cutting
 * surfaces, so a Library reference is visible from any active Domaine.
 *
 * Setting crossDomaine=true bypasses the Domaine filter entirely so docs
 * from any Domaine match. If domaineId is null/empty, the filter is
 * skipped (legacy callers, or no-Domaine context).
 */
export async function searchDocuments(args: RagSearchArgs): Promise<RagSearchResult[]> {
  const q = args.query.trim()
  if (!q) return []

  const limit = Math.max(1, Math.min(args.limit ?? 50, 200))

  const sql = `
    SELECT
      d.id,
      d.title,
      d.source_path,
      d.source_type,
      d.source_root,
      d.project_name,
      ts_rank(d.content_tsv, plainto_tsquery('english', $1)) AS rank,
      ts_headline(
        'english',
        d.content,
        plainto_tsquery('english', $1),
        'MaxFragments=2,MinWords=10,MaxWords=30,StartSel=<<,StopSel=>>'
      ) AS snippet,
      COALESCE(
        (
          SELECT array_agg(t.name ORDER BY t.name)
          FROM rag_document_tags dt
          JOIN rag_tags t ON t.id = dt.tag_id
          WHERE dt.document_id = d.id
        ),
        ARRAY[]::text[]
      ) AS tags
    FROM rag_documents d
    LEFT JOIN rag_namespaces n
      ON n.name = COALESCE(d.project_name, '__' || d.source_root || '__')
    WHERE d.is_active
      AND d.content_tsv @@ plainto_tsquery('english', $1)
      AND (
        $2                                                  -- crossDomaine: include everything
        OR $3::uuid IS NULL                                 -- no Domaine specified: include all
        OR n.domaine_id = $3::uuid                          -- in the selected Domaine
        OR COALESCE(n.is_bridge_namespace, FALSE)           -- bridge namespaces always reachable
      )
      AND ($4::text IS NULL OR d.source_root = $4)
      AND ($5::text IS NULL OR d.source_type = $5)
    ORDER BY rank DESC
    LIMIT ${limit}
  `

  const res = await ragQuery<RagSearchResult>(sql, [
    q,
    args.crossDomaine,
    args.domaineId || null,
    args.sourceRoot ?? null,
    args.sourceType ?? null,
  ])
  return res?.rows ?? []
}
