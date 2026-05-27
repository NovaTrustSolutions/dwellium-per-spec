import { Queue, Worker, type Job } from 'bullmq'
import { readFile, writeFile, stat } from 'fs/promises'
import path from 'path'
import { ragQuery, withRagClient } from './ragDb'
import { chat } from './llmClient'
import { loadConfig } from './config'
import { subscribeWorkspaceFileChange, type FileChangeType } from './workspace'
// Circular import with ragWiki: both modules only use each other's exports
// inside function bodies (never at module top-level), so the binding is
// resolved by the time these are called.
import { notifyIngestForWikiCompile } from './ragWiki'
import { deleteDocument } from './cleanupOps'

// ── Constants ─────────────────────────────────────────────────────────────

const REDIS_HOST = '127.0.0.1'
const REDIS_PORT = 6379
const QUEUE_NAME = 'holocron-ingest'
const DEBOUNCE_MS = 2000
const WORKER_CONCURRENCY = 2

// Tag-extract is a background automated task — always uses the cheapest
// capable model regardless of the user's chat-header dropdown selection.
const TAG_EXTRACT_PROVIDER = 'gemini' as const
const TAG_EXTRACT_MODEL = 'gemini-2.5-flash'
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'

// Cap content sent to Gemini for tag extraction. Long files don't extract
// better tags from the tail; head + reasonable chunk is fine.
const TAG_EXTRACT_CONTENT_CAP = 24000

// ── Types ─────────────────────────────────────────────────────────────────

export type SourceType = 'inbox' | 'brain_dump' | 'note' | 'report' | 'reference' | 'wiki' | 'synthesis'
export type SourceRoot = 'inbox' | 'projects' | 'library'

export interface IngestJobData {
  filePath: string
  sourceType: SourceType
  sourceRoot: SourceRoot
  projectName: string | null
  threadName: string | null
  /** v12+ nested layout: <projectsRoot>/<DomaineName>/<ProjectName>/<ThreadName>/
   *  Top-level segment under the workspace root. ensureNamespaceRow resolves
   *  this to a domaine_id via rag_domaines lookup. NULL when the file lives
   *  under a legacy flat layout, the bridge sources (_Inbox / _Codex), or
   *  when the segment doesn't match any known Domaine. */
  domaineName: string | null
}

interface IngestResult {
  ok: boolean
  ingested: boolean      // false when skipped (hash-dedup)
  documentId?: string
  tagCount?: number
  relationshipCount?: number
  error?: string
}

// ── Module state ──────────────────────────────────────────────────────────

let queue: Queue<IngestJobData> | null = null
let worker: Worker<IngestJobData> | null = null
let unsubscribe: (() => void) | null = null
const debounceTimers = new Map<string, NodeJS.Timeout>()

// ── Source-type detection ─────────────────────────────────────────────────

// Bridges live as SIBLINGS of projectsRoot under the workspace root:
//   <workspaceRoot>/_Inbox/Inbox.md                      (telegram inbox)
//   <workspaceRoot>/_Codex/Wiki/<dn>[/<pn>][/<tn>].md    (three-tier wiki, migration 007)
//   <workspaceRoot>/_Codex/<anything-else>.md            (library references / future syntheses)
// These are the only regex matches that still gate ingestion. Everything
// under projectsRoot is admitted; the source_type is derived from path
// position (see detectSourceType below). The `_Library` variants are
// transitional v14→v15 fallbacks — kept for any pre-rename paths that
// might linger in edge cases. Safe to drop once we're confident no
// `_Library`-prefixed paths exist anywhere.
const RE_INBOX        = /^_Inbox\/Inbox\.md$/
const RE_WIKI         = /^_Codex\/Wiki\/.+\.md$/
const RE_SYNTHESIS    = /^_Codex\/Syntheses\/.+\.md$/
const RE_LIBRARY      = /^_Codex\/.*\.md$/
// Transitional v14→v15 fallbacks:
const RE_WIKI_LEGACY      = /^_Library\/Wiki\/.+\.md$/
const RE_SYNTHESIS_LEGACY = /^_Library\/Syntheses\/.+\.md$/
const RE_LIBRARY_LEGACY   = /^_Library\/.*\.md$/

/** Infer source_type as a HINT from the folder/filename of a path under a
 *  thread. The hint set is auto-generated-file prefixes (`BD_*` / `Notes_*`)
 *  and the canonical Holocron folder names (`Reports`, `References`, `Notes`,
 *  `Transcripts`). **Anything that doesn't match falls through to 'reference'
 *  — never rejected.** This means Andy can create any subfolder structure
 *  inside a thread (`Drafts/`, `Meetings/`, `Recordings/`, …) and the files
 *  ingest cleanly; the source_type column is a best-effort classification, not
 *  a gate. */
function inferSourceType(midSegs: string[], fileName: string): SourceType {
  // Filename prefixes (auto-generated files).
  if (fileName.startsWith('BD_')) return 'brain_dump'
  if (fileName.startsWith('Notes_')) return 'note'
  // Folder-name hints (canonical Holocron buckets — case-sensitive to match
  // how Holocron creates them). `System/` is just a container for BD_/Notes_
  // files; its classification falls through to the filename hints above.
  for (const seg of midSegs) {
    if (seg === 'Reports')     return 'report'
    if (seg === 'References')  return 'reference'
    if (seg === 'Notes')       return 'note'
    if (seg === 'Transcripts') return 'reference'
  }
  return 'reference'
}

/** Classify a workspace file for ingestion. Returns null only for paths that
 *  genuinely don't belong (non-`.md`, outside the workspace, or in a
 *  workspace-root sibling that isn't a recognized bridge).
 *
 *  Layout (post v12, single source of truth):
 *    <workspaceRoot>/_Inbox/Inbox.md                              → inbox bridge
 *    <workspaceRoot>/_Codex/Wiki/…                                → wiki bridge
 *    <workspaceRoot>/_Codex/…                                     → library bridge
 *    <projectsRoot>/<Dn>/<file>.md                                → loose at Domaine
 *    <projectsRoot>/<Dn>/<Pn>/<file>.md                           → loose at Project
 *    <projectsRoot>/<Dn>/<Pn>/<Tn>/<…any depth…>/<file>.md        → under a Thread
 *
 *  For anything under a Thread, Domaine / Project / Thread come from path
 *  segments 0/1/2 — the FOLDER NAME does not gate ingestion. source_type is
 *  inferred from folder/filename hints with 'reference' as the safe default.
 *  This means user-created subfolders (`Drafts/`, `Meetings/`, anything) just
 *  work; the previous regex-per-known-folder approach silently rejected them
 *  and is gone. */
export function detectSourceType(absPath: string, holocronRoot: string): IngestJobData | null {
  if (!holocronRoot) return null
  let rel = path.relative(holocronRoot, absPath).split(path.sep).join('/')
  let outsideProjectsRoot = false
  if (rel.startsWith('..')) {
    // Bridges (_Codex, _Inbox) sit as siblings of projectsRoot — retry from
    // one dir up so a wiki / library / inbox file is still reachable.
    const parent = path.dirname(holocronRoot)
    rel = path.relative(parent, absPath).split(path.sep).join('/')
    if (rel.startsWith('..')) return null
    outsideProjectsRoot = true
  }

  // ── Bridges ─────────────────────────────────────────────────────────────
  if (RE_INBOX.test(rel)) {
    return { filePath: absPath, sourceType: 'inbox', sourceRoot: 'inbox', projectName: null, threadName: null, domaineName: null }
  }
  // Wiki + Synthesis precede the broader Library check so they get the right
  // source_type tag, not the 'reference' default that the Library catch-all
  // assigns. RE_*_LEGACY are transitional v14→v15 fallbacks so any pre-rename
  // `_Library`-prefixed paths still classify correctly.
  if (RE_WIKI.test(rel) || RE_WIKI_LEGACY.test(rel)) {
    return { filePath: absPath, sourceType: 'wiki', sourceRoot: 'library', projectName: null, threadName: null, domaineName: null }
  }
  if (RE_SYNTHESIS.test(rel) || RE_SYNTHESIS_LEGACY.test(rel)) {
    return { filePath: absPath, sourceType: 'synthesis', sourceRoot: 'library', projectName: null, threadName: null, domaineName: null }
  }
  if (RE_LIBRARY.test(rel) || RE_LIBRARY_LEGACY.test(rel)) {
    return { filePath: absPath, sourceType: 'reference', sourceRoot: 'library', projectName: null, threadName: null, domaineName: null }
  }

  // A file in a workspace-root sibling that didn't match a bridge is rejected
  // — we don't ingest arbitrary content from the workspace root.
  if (outsideProjectsRoot) return null

  // Non-`.md` files (and directory events) don't ingest. Manual conversion
  // (PDF / DOCX / etc.) writes a `.md` sibling that re-enters this path.
  if (!rel.endsWith('.md')) return null

  // ── Inside projectsRoot — derive Domaine/Project/Thread by path position ─
  const segs = rel.split('/')
  if (segs.length < 2) return null  // a bare file at projectsRoot root has no Domaine to attach to
  const fileName = segs[segs.length - 1]
  const domaineName = segs[0]

  if (segs.length === 2) {
    // <Domaine>/<file>.md — loose at Domaine root, no project. Synthetic
    // project_name = domaineName so the namespace attaches via (name,
    // domaine_id) without a separate code path.
    return { filePath: absPath, sourceType: 'reference', sourceRoot: 'projects', domaineName, projectName: domaineName, threadName: null }
  }
  if (segs.length === 3) {
    // <Domaine>/<Project>/<file>.md — loose at project root, no thread.
    return { filePath: absPath, sourceType: 'reference', sourceRoot: 'projects', domaineName, projectName: segs[1], threadName: null }
  }

  // 4+ segments — file lives under a thread folder. Any depth, any folder
  // name. source_type is a hint inferred from folder/filename, with
  // 'reference' as the safe default. Never rejected at this level.
  const projectName = segs[1]
  const threadName  = segs[2]
  const midSegs     = segs.slice(3, -1)
  const sourceType  = inferSourceType(midSegs, fileName)
  return { filePath: absPath, sourceType, sourceRoot: 'projects', domaineName, projectName, threadName }
}

// ── Tag extraction ────────────────────────────────────────────────────────

const TAG_PROMPT_SYSTEM = 'You extract concise tags from documents. Return ONLY a JSON array of 3-7 strings, no preamble, no explanation, no code fences.'

function tagPromptUser(content: string): string {
  const truncated = content.length > TAG_EXTRACT_CONTENT_CAP
    ? content.slice(0, TAG_EXTRACT_CONTENT_CAP) + '\n[…truncated]'
    : content
  return `Extract 3-7 single-word or short-phrase tags. Lowercase, hyphen-separated where multi-word (e.g. "case-management"). Return JSON array only.\n\nDocument:\n${truncated}`
}

/** Tolerant JSON-array-of-strings parser. Handles bare arrays, fenced blocks, leading prose. */
export function parseTagsFromResponse(s: string): string[] {
  if (!s) return []
  let t = s.trim()
  // strip code fences if present
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  // grab the first [...] block if there's prose around it
  const m = t.match(/\[[\s\S]*\]/)
  if (!m) return []
  let parsed: unknown
  try { parsed = JSON.parse(m[0]) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of parsed) {
    if (typeof item !== 'string') continue
    const norm = item.trim().toLowerCase()
    if (!norm || seen.has(norm)) continue
    if (norm.length > 60) continue // sanity cap
    seen.add(norm)
    out.push(norm)
  }
  return out.slice(0, 7)
}

async function extractTags(content: string, title: string): Promise<{ tags: string[]; error?: string }> {
  const cfg = loadConfig()
  const apiKey = cfg.gemini.apiKey
  if (!apiKey.trim()) {
    return { tags: [], error: 'Gemini API key not configured — skipping tag extraction' }
  }
  const res = await chat({
    provider: TAG_EXTRACT_PROVIDER,
    model: TAG_EXTRACT_MODEL,
    apiKey,
    baseUrl: GEMINI_BASE_URL,
    messages: [
      { role: 'system', content: TAG_PROMPT_SYSTEM },
      { role: 'user', content: `Title: ${title}\n\n${tagPromptUser(content)}` },
    ],
    temperature: 0.2,
    // Gemini 2.5 Flash thinking-mode tokens count against max_tokens, so a
    // tight cap truncates the visible JSON. 1024 leaves headroom for thinking
    // plus a 7-tag array; observed truncation at 200 cut off after one tag.
    maxTokens: 1024,
    stream: false,
    task: 'tag-extract',
  })
  if (res.error) return { tags: [], error: res.error }
  const parsed = parseTagsFromResponse(res.content)
  if (parsed.length === 0) {
    // Gemini returned a response but parseTagsFromResponse couldn't extract
    // any tags. Common causes: refusal ("I can't tag this…"), non-JSON
    // markdown list, empty content, or 1024-token truncation cutting off
    // before the closing `]`. Log the raw response so we can see which.
    const preview = (res.content ?? '').slice(0, 500)
    console.warn(`[ragIngest] extractTags returned 0 tags for "${title}" — raw Gemini response (first 500 chars): ${JSON.stringify(preview)}`)
  }
  return { tags: parsed }
}

// ── DB ops ────────────────────────────────────────────────────────────────

async function upsertDocumentRow(args: {
  data: IngestJobData
  title: string
  content: string
}): Promise<{ documentId: string | null; skipped: boolean; error?: string }> {
  return await withRagClient(async (client) => {
    const existing = await client.query<{ id: string; content: string }>(
      'SELECT id, content FROM rag_documents WHERE source_path = $1 AND is_active = TRUE LIMIT 1',
      [args.data.filePath]
    )
    if (existing.rowCount && existing.rows[0].content === args.content) {
      return { documentId: existing.rows[0].id, skipped: true }
    }
    if (existing.rowCount) {
      await client.query(
        'UPDATE rag_documents SET is_active = FALSE WHERE id = $1',
        [existing.rows[0].id]
      )
    }
    const wordCount = args.content.split(/\s+/).filter(Boolean).length
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO rag_documents
         (source_path, source_root, source_type, project_name, thread_name, title, content, word_count, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
       RETURNING id`,
      [
        args.data.filePath,
        args.data.sourceRoot,
        args.data.sourceType,
        args.data.projectName,
        args.data.threadName,
        args.title,
        args.content,
        wordCount,
      ]
    )
    return { documentId: inserted.rows[0].id, skipped: false }
  }) ?? { documentId: null, skipped: false, error: 'RAG DB unavailable' }
}

async function attachTags(documentId: string, tags: string[]): Promise<number> {
  if (tags.length === 0) return 0
  const written = await withRagClient(async (client) => {
    let count = 0
    for (const name of tags) {
      // UPSERT tag, get id.
      const tagRes = await client.query<{ id: string }>(
        `INSERT INTO rag_tags (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [name]
      )
      const tagId = tagRes.rows[0].id
      // Link doc → tag (idempotent — composite PK).
      await client.query(
        `INSERT INTO rag_document_tags (document_id, tag_id) VALUES ($1, $2)
         ON CONFLICT (document_id, tag_id) DO NOTHING`,
        [documentId, tagId]
      )
      count++
    }
    return count
  })
  return written ?? 0
}

async function ensureNamespaceRow(
  projectName: string | null,
  sourceRoot: SourceRoot,
  domaineName: string | null,
): Promise<void> {
  const name = projectName ?? `__${sourceRoot}__`

  // Bridge sources (Library / Inbox) carry no Domaine — their namespace rows
  // have domaine_id = NULL by convention.
  if (!projectName) {
    await ragQuery(
      `INSERT INTO rag_namespaces (name, domaine_id) VALUES ($1, NULL)
       ON CONFLICT ON CONSTRAINT rag_namespaces_name_domaine_unique DO NOTHING`,
      [name]
    ).catch((err) => {
      console.warn('[ragIngest] ensureNamespaceRow failed (bridge):', (err as Error).message)
    })
    return
  }

  // v12+ nested layout: <projectsRoot>/<DomaineName>/<ProjectName>/...
  // Resolve domaineName → domaine_id via rag_domaines. Falls back to NULL
  // when domaineName is absent (legacy flat layout) or doesn't match a real
  // Domaine row (orphan/stray folder at the workspace root).
  let domaineId: string | null = null
  if (domaineName) {
    try {
      const res = await ragQuery<{ id: string }>(
        `SELECT id::text FROM rag_domaines WHERE name = $1 LIMIT 1`,
        [domaineName],
      )
      domaineId = res?.rows[0]?.id ?? null
      if (!domaineId) {
        console.warn(`[ragIngest] ensureNamespaceRow: no Domaine row for "${domaineName}" — seeding namespace with NULL domaine_id`)
      }
    } catch (err) {
      console.warn('[ragIngest] ensureNamespaceRow Domaine lookup failed:', (err as Error).message)
    }
  }

  await ragQuery(
    `INSERT INTO rag_namespaces (name, domaine_id) VALUES ($1, $2)
     ON CONFLICT ON CONSTRAINT rag_namespaces_name_domaine_unique DO NOTHING`,
    [name, domaineId]
  ).catch((err) => {
    console.warn('[ragIngest] ensureNamespaceRow failed:', (err as Error).message)
  })
}

async function recomputeTagOverlap(documentId: string): Promise<number> {
  const written = await withRagClient(async (client) => {
    // Tags for the new/updated doc.
    const ownTagsRes = await client.query<{ tag_ids: string[] | null }>(
      'SELECT array_agg(tag_id) AS tag_ids FROM rag_document_tags WHERE document_id = $1',
      [documentId]
    )
    const ownTags = ownTagsRes.rows[0]?.tag_ids ?? []
    if (!ownTags || ownTags.length === 0) return 0
    const ownTagCount = ownTags.length

    // Self namespace info — used to gate cross-namespace overlaps.
    // ns_key falls back to '__<source_root>__' for library/inbox docs.
    const selfRes = await client.query<{ ns_key: string; is_bridge: boolean }>(
      `SELECT COALESCE(d.project_name, '__' || d.source_root || '__') AS ns_key,
              COALESCE(n.is_bridge_namespace, FALSE) AS is_bridge
       FROM rag_documents d
       LEFT JOIN rag_namespaces n
         ON n.name = COALESCE(d.project_name, '__' || d.source_root || '__')
       WHERE d.id = $1`,
      [documentId]
    )
    const self = selfRes.rows[0]
    if (!self) return 0

    // Other docs sharing any of these tags, gated by namespace rule:
    // same namespace OR self is bridge OR other is bridge.
    const overlapRes = await client.query<{ other_id: string; shared_count: string; other_tag_count: string }>(
      `SELECT dt.document_id AS other_id,
              COUNT(*)::text AS shared_count,
              (SELECT COUNT(*) FROM rag_document_tags WHERE document_id = dt.document_id)::text AS other_tag_count
       FROM rag_document_tags dt
       JOIN rag_documents other_doc ON other_doc.id = dt.document_id
       LEFT JOIN rag_namespaces other_ns
         ON other_ns.name = COALESCE(other_doc.project_name, '__' || other_doc.source_root || '__')
       WHERE dt.tag_id = ANY($1::uuid[])
         AND dt.document_id <> $2
         AND (
           COALESCE(other_doc.project_name, '__' || other_doc.source_root || '__') = $3
           OR $4
           OR COALESCE(other_ns.is_bridge_namespace, FALSE)
         )
       GROUP BY dt.document_id`,
      [ownTags, documentId, self.ns_key, self.is_bridge]
    )

    let count = 0
    for (const row of overlapRes.rows) {
      const sharedCount = Number(row.shared_count)
      const otherTagCount = Number(row.other_tag_count)
      const denom = Math.max(ownTagCount, otherTagCount)
      const strength = denom > 0 ? sharedCount / denom : 0

      // Idempotent: drop any existing tag-shared row in either direction, insert one canonical row.
      await client.query(
        `DELETE FROM rag_relationships
         WHERE relationship = 'tag-shared'
           AND ((document_a_id = $1 AND document_b_id = $2) OR (document_a_id = $2 AND document_b_id = $1))`,
        [documentId, row.other_id]
      )
      await client.query(
        `INSERT INTO rag_relationships
           (document_a_id, document_b_id, relationship, strength, discovered_by)
         VALUES ($1, $2, 'tag-shared', $3, 'tag-overlap')`,
        [documentId, row.other_id, strength]
      )
      count++
    }
    return count
  })
  return written ?? 0
}

// ── Wikilink-as-edge insertion (Step 12) ─────────────────────────────────
// Scan ingested doc content against rag_wiki_pages.title; insert [[Title]]
// at the FIRST occurrence per page (not every match — avoids link spam in
// long docs). Skip wiki source_type (don't link wikis in wikis), code
// fences, inline code, and existing [[…]] brackets. After modification,
// rewrite the file to disk + update rag_documents.content + log relationship
// rows. Once-per-file at ingestion time only — see architecture-v2.md
// §"The wikilink-as-edge pipeline".

const MIN_WIKILINK_TITLE_LEN = 3  // skip ultra-short titles ("AI") that match too aggressively

function regexEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectExcludedRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  // Fenced code blocks: ```…```
  for (const m of content.matchAll(/```[\s\S]*?```/g)) {
    if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length])
  }
  // Inline code: `…`
  for (const m of content.matchAll(/`[^`\n]*`/g)) {
    if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length])
  }
  // Already-existing wikilinks: [[…]]
  for (const m of content.matchAll(/\[\[[^\]]*\]\]/g)) {
    if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length])
  }
  return ranges
}

function rangeOverlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && a[1] > b[0]
}

interface WikilinkEdit {
  start: number
  end: number
  replacement: string
  wikiPageId: string
}

async function insertWikilinks(args: {
  content: string
  sourceType: SourceType
}): Promise<{ modifiedContent: string; linkedPageIds: string[] }> {
  if (args.sourceType === 'wiki') {
    return { modifiedContent: args.content, linkedPageIds: [] }
  }

  // Longest title first so titles that are prefixes of other titles get the
  // shorter version's match consumed by the longer (e.g. "Strata" doesn't
  // claim a match inside "AstraStrata"). With per-page first-match-only,
  // collisions are still possible if both titles match at non-overlapping
  // sites; the overlap guard below handles the rest.
  const pagesRes = await ragQuery<{ id: string; title: string }>(`
    SELECT id::text, title FROM rag_wiki_pages
    ORDER BY length(title) DESC, title ASC
  `)
  const pages = (pagesRes?.rows ?? []).filter((p) => p.title.length >= MIN_WIKILINK_TITLE_LEN)
  if (pages.length === 0) {
    return { modifiedContent: args.content, linkedPageIds: [] }
  }

  const exclude = collectExcludedRanges(args.content)
  const inExclude = (start: number, end: number): boolean =>
    exclude.some((r) => rangeOverlaps(r, [start, end]))

  const edits: WikilinkEdit[] = []
  const linkedPageIds: string[] = []

  for (const page of pages) {
    const pattern = new RegExp(`\\b${regexEscape(page.title)}\\b`, 'gi')
    let m: RegExpExecArray | null
    while ((m = pattern.exec(args.content)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (inExclude(start, end)) continue
      if (edits.some((e) => start < e.end && end > e.start)) continue
      // Use the canonical Title casing from the wiki page (not the matched
      // casing in source content) so the wikilink is unambiguous.
      edits.push({ start, end, replacement: `[[${page.title}]]`, wikiPageId: page.id })
      linkedPageIds.push(page.id)
      break  // FIRST match only per page (per Andy's instruction — too many
             // links in one doc becomes noise)
    }
  }

  if (edits.length === 0) {
    return { modifiedContent: args.content, linkedPageIds: [] }
  }

  // Apply edits right-to-left so earlier edit positions stay valid.
  edits.sort((a, b) => b.start - a.start)
  let modified = args.content
  for (const e of edits) {
    modified = modified.slice(0, e.start) + e.replacement + modified.slice(e.end)
  }

  return { modifiedContent: modified, linkedPageIds }
}

async function logWikilinkRelationships(
  documentId: string,
  linkedWikiPageIds: string[],
): Promise<number> {
  if (linkedWikiPageIds.length === 0) return 0
  const written = await withRagClient(async (client) => {
    // rag_relationships references rag_documents on both sides. Wiki pages
    // are also re-ingested as documents (see ragWiki.reingestAsWiki), so
    // we resolve the wiki_page_id → rag_documents.id by joining on the
    // disk path that ragWiki writes (_Codex/Wiki/<slug>.md). The
    // '%_Library/Wiki/' branch is a transitional v14→v15 fallback for any
    // rows still carrying pre-rename paths.
    const docMap = await client.query<{ wiki_page_id: string; doc_id: string }>(
      `SELECT w.id::text AS wiki_page_id, d.id::text AS doc_id
       FROM rag_wiki_pages w
       JOIN rag_documents d
         ON d.source_path LIKE '%_Codex/Wiki/'   || w.slug || '.md'
         OR d.source_path LIKE '%_Library/Wiki/' || w.slug || '.md'
        AND d.source_type = 'wiki'
        AND d.is_active = TRUE
       WHERE w.id = ANY($1::uuid[])`,
      [linkedWikiPageIds]
    )
    let count = 0
    for (const row of docMap.rows) {
      // Idempotent: replace any prior wikilink edge between these two docs.
      await client.query(
        `DELETE FROM rag_relationships
         WHERE relationship = 'wikilink'
           AND document_a_id = $1 AND document_b_id = $2`,
        [documentId, row.doc_id]
      )
      await client.query(
        `INSERT INTO rag_relationships
           (document_a_id, document_b_id, relationship, strength, discovered_by)
         VALUES ($1, $2, 'wikilink', 1.0, 'agent')`,
        [documentId, row.doc_id]
      )
      count++
    }
    return count
  })
  return written ?? 0
}

async function logIngestEvent(args: {
  documentId: string | null
  filePath: string
  sourceType: SourceType
  durationMs: number
  skipped: boolean
  error?: string
  tagCount?: number
  relationshipCount?: number
}): Promise<void> {
  await ragQuery(
    `INSERT INTO rag_operations_log
       (operation, target_id, target_type, details, duration_ms)
     VALUES ('ingest', $1, $2, $3::jsonb, $4)`,
    [
      args.documentId,
      args.documentId ? 'document' : null,
      JSON.stringify({
        source_path: args.filePath,
        source_type: args.sourceType,
        skipped: args.skipped,
        ...(args.tagCount !== undefined ? { tag_count: args.tagCount } : {}),
        ...(args.relationshipCount !== undefined ? { relationship_count: args.relationshipCount } : {}),
        ...(args.error ? { error: args.error } : {}),
      }),
      args.durationMs,
    ]
  ).catch((err) => {
    console.warn('[ragIngest] log insert failed:', (err as Error).message)
  })
}

// ── Job processor ─────────────────────────────────────────────────────────

/**
 * Run the ingestion pipeline on one file.
 *
 * `opts.force` (default false): when true and `upsertDocumentRow` would have
 * skipped via content-hash dedup, the pipeline continues anyway and re-runs
 * tag extraction + recomputeTagOverlap against the existing document row.
 * Used by the per-row Re-ingest button and the "+ Ingest file…" picker —
 * explicit user intent should always re-process. Sync workspace and the
 * watcher path leave this false so we don't burn Gemini tokens re-tagging
 * already-tagged docs on every workspace scan.
 */
export async function processIngest(
  data: IngestJobData,
  opts: { force?: boolean } = {},
): Promise<IngestResult> {
  const start = Date.now()
  let content: string
  try {
    content = await readFile(data.filePath, 'utf8')
  } catch (err) {
    const error = `Failed to read file: ${(err as Error).message}`
    await logIngestEvent({ documentId: null, filePath: data.filePath, sourceType: data.sourceType, durationMs: Date.now() - start, skipped: false, error })
    return { ok: false, ingested: false, error }
  }

  const title = path.basename(data.filePath).replace(/\.md$/i, '')

  // 1. Insert / dedup document row.
  const upsert = await upsertDocumentRow({ data, title, content })
  if (upsert.error || !upsert.documentId) {
    const error = upsert.error ?? 'Unknown DB error'
    await logIngestEvent({ documentId: null, filePath: data.filePath, sourceType: data.sourceType, durationMs: Date.now() - start, skipped: false, error })
    return { ok: false, ingested: false, error }
  }
  if (upsert.skipped && !opts.force) {
    await logIngestEvent({ documentId: upsert.documentId, filePath: data.filePath, sourceType: data.sourceType, durationMs: Date.now() - start, skipped: true })
    return { ok: true, ingested: false, documentId: upsert.documentId }
  }
  if (upsert.skipped && opts.force) {
    console.log(`[ragIngest] force re-extract — content unchanged for ${path.basename(data.filePath)}; re-running tag extraction`)
  }

  // Register the namespace if first sight. Default isolated; the user flips
  // is_bridge_namespace via Settings (or psql) when cross-domain bridging is wanted.
  await ensureNamespaceRow(data.projectName, data.sourceRoot, data.domaineName)

  // 2. Tag extraction (best-effort — failure does not roll back the document).
  let tagCount = 0
  let relationshipCount = 0
  let tagError: string | undefined
  const tagRes = await extractTags(content, title)
  if (tagRes.error) {
    tagError = tagRes.error
    console.warn(`[ragIngest] tag-extract failed for ${data.filePath}:`, tagError)
  } else if (tagRes.tags.length > 0) {
    tagCount = await attachTags(upsert.documentId, tagRes.tags)
    relationshipCount = await recomputeTagOverlap(upsert.documentId)
  }

  // 3. Wikilink-as-edge insertion. Sits after tag work so it doesn't gate
  //    the tag pipeline if it fails. Skipped for source_type='wiki' inside
  //    insertWikilinks itself. If any links were inserted, write the
  //    modified content back to disk + update rag_documents.content + log
  //    relationship rows. Disk write is FIRST so when chokidar's
  //    awaitWriteFinish fires the next event (debounced 2s in onFileEvent),
  //    the DB row already reflects the same content and the upsert
  //    short-circuits via its content-equality dedup.
  try {
    const wikiLink = await insertWikilinks({ content, sourceType: data.sourceType })
    if (wikiLink.linkedPageIds.length > 0) {
      // Session 7 fix #2 — guard against the resurrect-on-writeback race.
      // The ingest job is enqueued from a chokidar `add` event (~2s after
      // the original write) and processes asynchronously (Gemini extract
      // + wikilink injection takes 5–10s typically). If the user deletes
      // or moves the file in that window, an unguarded writeFile here
      // recreates the file at data.filePath. Two independent checks
      // (OR logic — either alone is sufficient to skip):
      //   (a) fs.stat — does the file still exist on disk?
      //   (b) rag_documents — does an `is_active=true` row at this
      //       source_path still exist? (`unlink` events soft-delete via
      //       deleteDocument, so a deleted file's row flips inactive
      //       before this code runs.)
      // Short-circuit: if (a) fails, skip the DB query — the result is
      // already "skip writeback." Both checks are cheap on the happy path.
      let stillOnDisk = true
      try {
        await stat(data.filePath)
      } catch {
        stillOnDisk = false
      }
      let stillActive = stillOnDisk
      if (stillOnDisk) {
        const active = await ragQuery<{ id: string }>(
          `SELECT id::text FROM rag_documents WHERE source_path = $1 AND is_active = true LIMIT 1`,
          [data.filePath],
        )
        stillActive = (active?.rowCount ?? 0) > 0
      }
      if (!stillOnDisk || !stillActive) {
        console.log(`[ragIngest] wikilink writeback skipped — file no longer at ${data.filePath} (deleted or moved)`)
      } else {
        // Diagnostic kept from the Session 7 fix #2 investigation pass —
        // pairs with the `[Foundry] writing file to:` log at admit-time
        // and now bookends the skip-log above with the happy-path write.
        console.log(`[ragIngest] wikilink writeback to: ${data.filePath} (${wikiLink.modifiedContent.length} chars, ${wikiLink.linkedPageIds.length} links)`)
        await writeFile(data.filePath, wikiLink.modifiedContent, 'utf8')
        await ragQuery(
          `UPDATE rag_documents SET content = $1 WHERE id = $2`,
          [wikiLink.modifiedContent, upsert.documentId]
        )
        const wlCount = await logWikilinkRelationships(upsert.documentId, wikiLink.linkedPageIds)
        relationshipCount += wlCount
        content = wikiLink.modifiedContent
        console.log(`[ragIngest] wikilinks: inserted ${wikiLink.linkedPageIds.length}, logged ${wlCount} edge${wlCount === 1 ? '' : 's'} (${path.basename(data.filePath)})`)
      }
    }
  } catch (err) {
    console.warn(`[ragIngest] wikilink insertion failed for ${data.filePath}:`, (err as Error).message)
  }

  await logIngestEvent({
    documentId: upsert.documentId,
    filePath: data.filePath,
    sourceType: data.sourceType,
    durationMs: Date.now() - start,
    skipped: false,
    tagCount,
    relationshipCount,
    error: tagError,
  })

  console.log(`[ragIngest] ingested ${path.basename(data.filePath)} (${tagCount} tags, ${relationshipCount} relationships, ${Date.now() - start}ms)`)

  // Notify the wiki compiler. The function early-exits for source_type='wiki'
  // so wiki re-ingestion does NOT count toward the trigger threshold — that
  // would self-perpetuate on every compile.
  notifyIngestForWikiCompile(upsert.documentId, data.sourceType)

  return { ok: true, ingested: true, documentId: upsert.documentId, tagCount, relationshipCount }
}

// ── File-event subscriber + debounce ──────────────────────────────────────

function onFileEvent(filePath: string, type: FileChangeType): void {
  if (!queue) return

  // Unlink path: file is already gone, route to cleanupOps so the rag_documents
  // row + cascades + orphan sweep happen automatically. The in-app delete
  // button calls deleteDocument directly; this handles out-of-band deletes
  // (Finder, `rm`, `mv` out of the workspace) and is idempotent — calling
  // deleteDocument again on an already-deleted source_path is a cheap no-op.
  if (type === 'unlink') {
    // Wiki disk artifacts are managed by sweepOrphans / explicit page deletion;
    // when ragWiki writes a new revision it unlinks the old one and we don't
    // want that to cascade-delete the page row. `_Library/Wiki/` retained
    // as a transitional v14→v15 fallback.
    if (/(^|\/)_Codex\/Wiki\//.test(filePath))   return
    if (/(^|\/)_Library\/Wiki\//.test(filePath)) return
    // Cancel any pending debounce — no point ingesting a file that just vanished.
    const pending = debounceTimers.get(filePath)
    if (pending) { clearTimeout(pending); debounceTimers.delete(filePath) }
    void deleteDocument(filePath).then((r) => {
      if (r.ok && r.deletedDocId) {
        console.log('[ragIngest] unlink cleanup:', filePath, '— swept', r.sweptTags, 'tags,', r.sweptWikiPages, 'wiki pages')
      }
    })
    return
  }

  const cfg = loadConfig()
  const root = cfg.holocronRoot || cfg.workspace?.path || ''
  // Wiki page disk artifacts are written by ragWiki itself and re-ingested
  // explicitly by that pipeline. Skip them here so chokidar doesn't loop us
  // back through processIngest a second time on the post-write fs event.
  // `_Library/Wiki/` retained as a transitional v14→v15 fallback.
  if (/(^|\/)_Codex\/Wiki\//.test(filePath))   return
  if (/(^|\/)_Library\/Wiki\//.test(filePath)) return
  const detected = detectSourceType(filePath, root)
  if (!detected) return

  // 2-second idle gate: bounce until quiet.
  const existing = debounceTimers.get(filePath)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    debounceTimers.delete(filePath)
    queue?.add('ingest', detected, {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 100 },
    }).catch((err) => console.warn('[ragIngest] queue.add failed:', (err as Error).message))
  }, DEBOUNCE_MS)
  debounceTimers.set(filePath, timer)
}

// ── Public lifecycle + manual API ─────────────────────────────────────────

export function initRagIngest(): void {
  if (queue) return
  const connection = { host: REDIS_HOST, port: REDIS_PORT }
  try {
    queue = new Queue<IngestJobData>(QUEUE_NAME, { connection })
    worker = new Worker<IngestJobData>(
      QUEUE_NAME,
      async (job: Job<IngestJobData>) => processIngest(job.data),
      { connection, concurrency: WORKER_CONCURRENCY }
    )
    worker.on('failed', (job, err) => {
      console.warn(`[ragIngest] job ${job?.id} failed:`, err.message)
    })
    unsubscribe = subscribeWorkspaceFileChange(onFileEvent)
    console.log('[ragIngest] initialized — queue + worker ready, file-change subscription active')
  } catch (err) {
    console.error('[ragIngest] init failed (Redis unavailable?):', (err as Error).message)
  }
}

/** Ping Redis via the ingest queue's existing connection. Returns false if
 *  the queue isn't initialized or the ping doesn't return PONG within 1s. */
export async function pingRedis(): Promise<boolean> {
  if (!queue) return false
  try {
    const client = await queue.client
    const pong = await Promise.race([
      client.ping(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 1000)),
    ])
    return pong === 'PONG'
  } catch {
    return false
  }
}

export async function shutdownRagIngest(): Promise<void> {
  for (const t of debounceTimers.values()) clearTimeout(t)
  debounceTimers.clear()
  if (unsubscribe) { unsubscribe(); unsubscribe = null }
  if (worker) { await worker.close().catch(() => {}); worker = null }
  if (queue) { await queue.close().catch(() => {}); queue = null }
}

/**
 * Run the ingestion pipeline synchronously for one file path. Used by the
 * manual "Re-ingest" path (Library → Ingest tab in step 7). Bypasses the
 * debounce + queue and runs in-process.
 */
export async function ingestManual(
  filePath: string,
  opts: { force?: boolean } = {},
): Promise<IngestResult> {
  const cfg = loadConfig()
  const root = cfg.holocronRoot || cfg.workspace?.path || ''
  const detected = detectSourceType(filePath, root)
  if (!detected) {
    // Include the relative path in the error so the user can see exactly
    // which shape failed (number of segments, whether it slipped under a
    // dot-folder, etc.). The basename alone isn't enough to diagnose.
    const rel = root ? path.relative(root, filePath).split(path.sep).join('/') : filePath
    console.warn(`[ragIngest] unrecognized path → rel=${JSON.stringify(rel)} root=${JSON.stringify(root)}`)
    return { ok: false, ingested: false, error: `Path not under a recognized source root. rel=${rel || '(empty)'} (workspace root: ${root || '(empty)'})` }
  }
  return processIngest(detected, opts)
}
