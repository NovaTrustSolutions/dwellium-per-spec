import { mkdir, writeFile, copyFile, stat } from 'fs/promises'
import path from 'path'
import { ragQuery, withRagClient } from './ragDb'
import { chat } from './llmClient'
import { loadConfig, getWikiCacheDir } from './config'
import { processIngest, type SourceType } from './ragIngest'
import { writeReportFromContent } from './report'

// ── Three-tier wiki overview ──────────────────────────────────────────────
//
// Replaces the old tag-anchored model. Every wiki page belongs to exactly
// one of:
//
//   tier 'thread'   — one per (Domaine, Project, Thread).
//                     Sources: raw rag_documents in that thread folder.
//   tier 'project'  — one per (Domaine, Project).
//                     Sources: the thread wikis under that project (tier-1
//                     rag_wiki_pages rows). Meta-synthesis.
//   tier 'domaine'  — one per Domaine.
//                     Sources: the project wikis in that Domaine (tier-2
//                     rag_wiki_pages rows). High-level overview.
//
// Bootstrap order is strict: tier-1 pages compile first (from raw docs),
// then tier-2 (from tier-1 content), then tier-3 (from tier-2 content).
// Each tier reads its sources from the DB, so the chain works without
// waiting on wiki disk re-ingestion.
//
// Slugs encode the hierarchy with `/` separators, matching the folder
// structure on disk:
//   thread:  `<dn>/<pn>/<tn>`           (3 segments)
//   project: `<dn>/<pn>`                (2 segments — was `<dn>/<pn>/_project` pre-v15)
//   domaine: `<dn>`                     (1 segment  — was `<dn>/_domaine`    pre-v15)
// (`<dn>`, `<pn>`, `<tn>` are slug-cased Domaine / Project / Thread names.)
//
// Segment count is the tier discriminator — tier-1 has 3 segments, tier-2
// has 2, tier-3 has 1. This holds even when names coincide across levels
// (e.g. a thread named after its project: tier-1 = `<dn>/<pn>/<pn>` (3),
// tier-2 = `<dn>/<pn>` (2) — distinct slugs). Disk paths under
// `_Codex/Wiki/`: the tier-2 file `<dn>/<pn>.md` and the tier-1 directory
// `<dn>/<pn>/` legitimately co-exist on macOS/Linux filesystems.
//
// Pre-v15 used `_project` / `_domaine` sentinel segments as the leaf to
// avoid this coincident-naming problem, but they polluted titles + the
// graph node labels (rag_documents.title for the loop-back wiki rows came
// from the file basename = "_project" / "_domaine"). The v15 rename is
// the matching cleanup; legacy sentinel rows are purged by
// `purgeLegacySentinelWikiPages` on boot — see cleanupOps.ts.
//
// DB uniqueness sits on (slug, namespace, domaine_id) with NULLS NOT
// DISTINCT. For tier-1 + tier-2, namespace = project_name. For tier-3,
// namespace = NULL. domaine_id is always populated (the wiki's home
// Domaine). Bridge namespaces (`__library__`, `__inbox__`) never get a
// wiki page — they're not domain-anchored content.

// ── Constants ─────────────────────────────────────────────────────────────

const COMPILE_PROVIDER = 'gemini' as const
const COMPILE_MODEL = 'gemini-2.5-flash'
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'

// Auto-compile fires on EVERY non-wiki ingest (no threshold). While a
// compile is in flight, concurrent ingests batch into recentIngestIds and
// the runner drains them — see notifyIngestForWikiCompile.
const PER_SOURCE_CHAR_CAP = 2000
const TOTAL_PROMPT_CHAR_CAP = 22000
const COMPILE_MAX_TOKENS = 4096
// Cold-start bootstrap: compile a thread wiki for any thread folder with
// at least this many active source docs. 1 = compile even for a single-
// doc thread; Andy opted in to that.
const COLD_START_MIN_DOCS = 1
const SOURCE_FETCH_LIMIT = 12

// Shared trailing instructions for all three tiers. The per-tier prompts
// prepend their tier-specific framing onto these structural requirements
// so the renderer + citation logic keep working.
const STRUCTURE_INSTRUCTIONS = `

Output Markdown only — no preamble, no commentary, no code fences. Required sections in this exact order:

# {Title}

## Overview
2-3 sentences synthesizing the topic. Where sources broadly agree, summarize. Where they fundamentally disagree, do not paper over the disagreement — defer to "Open questions / tensions".

## Key concepts
- bullet: one-line concept with brief explanation
(3-7 bullets total)

## Open questions / tensions
- bullet: question raised across sources but not answered
- bullet: place where sources disagree — list BOTH views with citations, do not resolve. Example: "Source [2] says timeline is 12 weeks; source [4] says 8 weeks — gap unresolved."
(omit this section entirely ONLY if there are zero open questions AND zero contradictions)

## Sources
[1] {title} ({source_type})
[2] {title} ({source_type})

Use [N] citation markers in-line in the Overview and Key concepts sections, referencing the Source list. Do not invent facts not present in the sources. Do not resolve contradictions across sources — surface them in the "Open questions / tensions" section so the user can see the disagreement and decide.`

const THREAD_SYSTEM_PROMPT =
  `Synthesize all documents in this thread into a coherent wiki article. Find connections, identify key concepts, flag open questions and tensions. Do not just summarize each document individually — write a synthesis that treats the documents as evidence for a single shared topic.`
  + STRUCTURE_INSTRUCTIONS

const PROJECT_SYSTEM_PROMPT =
  `Given these thread-level wiki articles from the same project, synthesize a higher-level overview. What are the major themes? How do the threads relate to each other? What emerges from looking at them together? Do not just concatenate the thread wikis — extract patterns across them.`
  + STRUCTURE_INSTRUCTIONS

const DOMAINE_SYSTEM_PROMPT =
  `Given these project-level overviews, produce a high-level Domaine summary. What is this Domaine about at the highest level? What are the key initiatives and how do they connect? Pull out the largest themes and the relationships between projects.`
  + STRUCTURE_INSTRUCTIONS

function stricterRetryPrompt(base: string): string {
  return base + '\n\nIMPORTANT: your previous output failed validation. Output ONLY the Markdown. Begin with `# ` then the title. Include `## Overview` and `## Sources` headings exactly as written.'
}

type Tier = 'thread' | 'project' | 'domaine'

function systemPromptForTier(tier: Tier): string {
  switch (tier) {
    case 'thread':  return THREAD_SYSTEM_PROMPT
    case 'project': return PROJECT_SYSTEM_PROMPT
    case 'domaine': return DOMAINE_SYSTEM_PROMPT
  }
}

// ── Module state ──────────────────────────────────────────────────────────

let recentIngestIds: string[] = []
let isCompiling = false

// ── Types ─────────────────────────────────────────────────────────────────

export interface WikiPageRow {
  id: string
  slug: string
  title: string
  content: string
  source_count: number
  updated_at: string
}

export interface WikiPageListItem {
  slug: string
  title: string
  source_count: number
  created_at: string
  updated_at: string
  content_head: string
  domaine_id: string | null
  domaine_overflow_count: number
  /** New in migration 007: which tier the page belongs to. */
  tier: Tier | null
  /** New in migration 007: project_name for tier-1 + tier-2, NULL for tier-3. */
  namespace: string | null
}

interface SourceDoc {
  id: string
  title: string
  source_type: string
  content: string
}

// ── Slug / title helpers ──────────────────────────────────────────────────

export function slugComponent(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function titleCase(s: string): string {
  return s
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function threadSlugFor(domaineName: string, projectName: string, threadName: string): string | null {
  const dn = slugComponent(domaineName)
  const pn = slugComponent(projectName)
  const tn = slugComponent(threadName)
  if (!dn || !pn || !tn) return null
  return `${dn}/${pn}/${tn}`
}

function projectSlugFor(domaineName: string, projectName: string): string | null {
  const dn = slugComponent(domaineName)
  const pn = slugComponent(projectName)
  if (!dn || !pn) return null
  // v15: dropped the `_project` sentinel suffix — slug is now the natural
  // `<dn>/<pn>` path. Tier-1 (thread) slugs always carry a third segment
  // (`<dn>/<pn>/<tn>`), so segment-count differentiation prevents collision
  // between tier-1 and tier-2 even when names coincide. Disk layout: the
  // tier-2 file `<dn>/<pn>.md` and the tier-1 directory `<dn>/<pn>/`
  // legitimately co-exist on macOS/Linux filesystems.
  return `${dn}/${pn}`
}

function domaineSlugFor(domaineName: string): string | null {
  const dn = slugComponent(domaineName)
  if (!dn) return null
  // v15: dropped the `_domaine` sentinel suffix. Tier-3 slug is now the
  // single domaine segment; tier-2 = 2 segments, tier-1 = 3 segments —
  // segment count is the tier discriminator.
  return dn
}

// ── Disk path ─────────────────────────────────────────────────────────────

function wikiDirPath(): string {
  const cfg = loadConfig()
  const dir = getWikiCacheDir(cfg)
  if (!dir) throw new Error('holocronRoot not configured')
  // Wiki pages live at `<libraryPath>/Wiki/`. libraryPath defaults to
  // `<dirname(holocronRoot)>/_Codex/` (was `_Library/` pre-v15); v14 lets
  // the user point libraryPath at an iCloud Drive folder for cross-device
  // sync — see HolocronConfig.libraryPath + getWikiCacheDir in config.ts.
  return dir
}

/** Resolve the disk path for a slug. Slugs use `/` separators that map
 *  directly to subdirectories — `astra/proj-a/thr-1` becomes
 *  `_Codex/Wiki/astra/proj-a/thr-1.md`. */
export function wikiDiskPath(slug: string): string {
  return path.join(wikiDirPath(), `${slug}.md`)
}

// ── Source gathering ──────────────────────────────────────────────────────

/** Sources for a tier-1 (thread) wiki: every active non-wiki doc whose
 *  source_path starts with the thread folder. */
async function fetchThreadSources(threadPath: string): Promise<SourceDoc[]> {
  const prefix = threadPath.endsWith('/') ? threadPath : threadPath + '/'
  const res = await ragQuery<SourceDoc>(`
    SELECT d.id::text, d.title, d.source_type, d.content
    FROM rag_documents d
    WHERE d.is_active
      AND d.source_type <> 'wiki'
      AND (d.source_path = $1 OR d.source_path LIKE $2)
    ORDER BY d.ingested_at ASC
    LIMIT ${SOURCE_FETCH_LIMIT}
  `, [threadPath, prefix + '%'])
  return res?.rows ?? []
}

/** Sources for a tier-2 (project) wiki: the tier-1 thread wikis that live
 *  in this (namespace, domaine). The thread wiki's content becomes the
 *  "document" presented to Gemini. */
async function fetchProjectChildren(projectName: string, domaineId: string): Promise<SourceDoc[]> {
  const res = await ragQuery<SourceDoc>(`
    SELECT id::text, title, 'wiki:thread' AS source_type, content
    FROM rag_wiki_pages
    WHERE tier = 'thread'
      AND namespace = $1
      AND domaine_id = $2::uuid
    ORDER BY updated_at ASC
    LIMIT ${SOURCE_FETCH_LIMIT}
  `, [projectName, domaineId])
  return res?.rows ?? []
}

/** Sources for a tier-3 (Domaine) wiki: the tier-2 project wikis in this
 *  Domaine. */
async function fetchDomaineChildren(domaineId: string): Promise<SourceDoc[]> {
  const res = await ragQuery<SourceDoc>(`
    SELECT id::text, title, 'wiki:project' AS source_type, content
    FROM rag_wiki_pages
    WHERE tier = 'project'
      AND domaine_id = $1::uuid
    ORDER BY updated_at ASC
    LIMIT ${SOURCE_FETCH_LIMIT}
  `, [domaineId])
  return res?.rows ?? []
}

/** For recompile-by-slug: the page row already exists, so we can re-derive
 *  sources from its tier + namespace + domaine_id. */
async function fetchSourcesForExistingPage(row: WikiPageMetaRow): Promise<SourceDoc[]> {
  switch (row.tier) {
    case 'thread': {
      // Reconstruct the thread folder path from the slug. Slug shape:
      // `<dn>/<pn>/<tn>` → threadPath under projectsRoot. We don't store
      // the source_path on the wiki page row, so we walk the wiki_page_sources
      // table to find the docs that backed the page (which IS persisted).
      const res = await ragQuery<SourceDoc>(`
        SELECT d.id::text, d.title, d.source_type, d.content
        FROM rag_wiki_page_sources wps
        JOIN rag_documents d ON d.id = wps.document_id
        WHERE wps.wiki_page_id = $1::uuid AND d.is_active
        ORDER BY d.ingested_at ASC
        LIMIT ${SOURCE_FETCH_LIMIT}
      `, [row.id])
      return res?.rows ?? []
    }
    case 'project':
      if (!row.namespace || !row.domaine_id) return []
      return fetchProjectChildren(row.namespace, row.domaine_id)
    case 'domaine':
      if (!row.domaine_id) return []
      return fetchDomaineChildren(row.domaine_id)
    default:
      return []
  }
}

// ── Gemini compile call ───────────────────────────────────────────────────

function buildUserPrompt(topic: string, sources: SourceDoc[]): string {
  const lines: string[] = [`Topic: ${topic}`, '', 'Source documents:', '']
  let total = lines.join('\n').length
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]
    const cap = s.content.length > PER_SOURCE_CHAR_CAP
      ? s.content.slice(0, PER_SOURCE_CHAR_CAP) + '\n[…truncated]'
      : s.content
    const block = `[${i + 1}] ${s.title} (${s.source_type})\n${cap}\n`
    if (total + block.length > TOTAL_PROMPT_CHAR_CAP) break
    lines.push(block)
    total += block.length
  }
  lines.push('')
  lines.push('Compile the wiki page now.')
  return lines.join('\n')
}

function isValidWikiMarkdown(content: string): boolean {
  if (!content || content.length < 40) return false
  if (!/^#\s+/m.test(content)) return false
  if (!/^##\s+Overview/m.test(content)) return false
  if (!/^##\s+Sources/m.test(content)) return false
  return true
}

async function runGeminiCompile(tier: Tier, topic: string, sources: SourceDoc[]): Promise<{ content: string; error?: string }> {
  const cfg = loadConfig()
  const apiKey = cfg.gemini.apiKey.trim()
  if (!apiKey) return { content: '', error: 'Gemini API key not configured' }

  const userPrompt = buildUserPrompt(topic, sources)
  const systemPrompt = systemPromptForTier(tier)

  const first = await chat({
    provider: COMPILE_PROVIDER,
    model: COMPILE_MODEL,
    apiKey,
    baseUrl: GEMINI_BASE_URL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: COMPILE_MAX_TOKENS,
    stream: false,
    task: 'wiki-compile',
  })
  if (first.error) return { content: '', error: first.error }
  if (isValidWikiMarkdown(first.content)) return { content: first.content }

  const retry = await chat({
    provider: COMPILE_PROVIDER,
    model: COMPILE_MODEL,
    apiKey,
    baseUrl: GEMINI_BASE_URL,
    messages: [
      { role: 'system', content: stricterRetryPrompt(systemPrompt) },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: COMPILE_MAX_TOKENS,
    stream: false,
    task: 'wiki-compile',
  })
  if (retry.error) return { content: '', error: retry.error }
  if (isValidWikiMarkdown(retry.content)) return { content: retry.content }

  return { content: '', error: 'Gemini output failed validation twice — page skipped' }
}

// ── DB ops ────────────────────────────────────────────────────────────────

interface WikiPageMetaRow {
  id: string
  slug: string
  title: string
  tier: Tier
  namespace: string | null
  domaine_id: string | null
}

async function getWikiPageRowBySlug(slug: string): Promise<WikiPageRow | null> {
  const res = await ragQuery<WikiPageRow>(
    `SELECT id::text, slug, title, content, source_count, updated_at::text
     FROM rag_wiki_pages WHERE slug = $1 LIMIT 1`,
    [slug]
  )
  return res?.rows[0] ?? null
}

async function getWikiPageMetaBySlug(slug: string): Promise<WikiPageMetaRow | null> {
  const res = await ragQuery<WikiPageMetaRow>(
    `SELECT id::text, slug, title, tier, namespace, domaine_id::text
     FROM rag_wiki_pages WHERE slug = $1 LIMIT 1`,
    [slug]
  )
  const row = res?.rows[0]
  if (!row) return null
  return row
}

/** Look up an existing page row by its identity triple (slug, namespace,
 *  domaine_id) — the same triple as the unique constraint. Used by
 *  bootstrapMissingPages to ask "does a wiki for this thread already
 *  exist?" without parsing the slug. */
async function findPageByIdentity(
  slug: string,
  namespace: string | null,
  domaineId: string,
): Promise<{ id: string } | null> {
  const res = await ragQuery<{ id: string }>(`
    SELECT id::text FROM rag_wiki_pages
    WHERE slug = $1
      AND ${namespace === null ? 'namespace IS NULL' : 'namespace = $3'}
      AND domaine_id = $2::uuid
    LIMIT 1
  `, namespace === null ? [slug, domaineId] : [slug, domaineId, namespace])
  return res?.rows[0] ?? null
}

async function upsertWikiPageRow(args: {
  slug: string
  title: string
  content: string
  sourceCount: number
  tier: Tier
  namespace: string | null
  domaineId: string
}): Promise<string | null> {
  // Identity = (slug, namespace, domaine_id). ON CONFLICT targets the
  // composite UNIQUE constraint added by migration 007. Tier is set on
  // insert and on conflict-update both (a page that legitimately changes
  // tier would have a different slug shape anyway, but keeping it in the
  // SET clause defends against migration drift).
  const res = await ragQuery<{ id: string }>(`
    INSERT INTO rag_wiki_pages
      (slug, title, content, source_count, updated_at, tier, namespace, domaine_id, domaine_overflow_count)
    VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7::uuid, 0)
    ON CONFLICT ON CONSTRAINT rag_wiki_pages_slug_namespace_domaine_unique DO UPDATE
      SET title = EXCLUDED.title,
          content = EXCLUDED.content,
          source_count = EXCLUDED.source_count,
          updated_at = NOW(),
          tier = EXCLUDED.tier
    RETURNING id::text
  `, [args.slug, args.title, args.content, args.sourceCount, args.tier, args.namespace, args.domaineId])
  return res?.rows[0]?.id ?? null
}

async function replaceWikiSources(pageId: string, docIds: string[]): Promise<void> {
  await withRagClient(async (client) => {
    await client.query('DELETE FROM rag_wiki_page_sources WHERE wiki_page_id = $1', [pageId])
    for (const docId of docIds) {
      await client.query(
        `INSERT INTO rag_wiki_page_sources (wiki_page_id, document_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [pageId, docId]
      )
    }
  })
}

// ── Disk write ────────────────────────────────────────────────────────────

async function writeWikiToDisk(slug: string, content: string): Promise<string | null> {
  try {
    const root = wikiDirPath()
    const filePath = wikiDiskPath(slug)
    // Defensive: only write inside the configured wiki cache dir. The
    // slug may contain subdirectory segments (the v007 hierarchy), but
    // the resolved path must still be a descendant of wikiDirPath().
    // Previously this substring-matched `/_Library/Wiki/`, which broke
    // immediately after the v14→v15 folder rename — now we anchor on
    // the actual wiki cache root, with the literal `_Codex/Wiki/` and
    // legacy `_Library/Wiki/` substrings as belt-and-suspenders fallbacks.
    const wikiCacheRoot = root.endsWith('/') ? root : root + '/'
    if (!filePath.startsWith(wikiCacheRoot)
      && !filePath.includes('/_Codex/Wiki/')
      && !filePath.includes('/_Library/Wiki/')) {
      console.error(`[ragWiki] REFUSING wiki write — resolved path outside wiki cache dir (${wikiCacheRoot}): ${filePath}`)
      return null
    }
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf8')
    return filePath
  } catch (err) {
    console.warn(`[ragWiki] disk write failed for ${slug}:`, (err as Error).message)
    return null
  }
}

// ── Wiki re-ingest (close the loop) ───────────────────────────────────────

async function reingestAsWiki(diskPath: string, wikiPageTitle: string): Promise<void> {
  // processIngest reads the file fresh from disk, runs tag-extract +
  // tag-overlap. notifyIngestForWikiCompile (called at the end of
  // processIngest) early-exits for source_type='wiki' so this path can't
  // self-perpetuate.
  //
  // processIngest derives `rag_documents.title` from the file basename
  // (filename without `.md`). That's fine for tier-1 (filename = thread
  // slug = readable name) but pre-v15 produced "_project" / "_domaine"
  // titles for tier-2/3 — visible in the Graph (which reads
  // rag_documents.title) and in any list that surfaces wiki rows via the
  // doc table. With v15's sentinel-free slugs the filename IS a real
  // name, so the basename derivation works again — but we still post-
  // patch the row with the explicit wiki page title to handle the
  // edge case where slugify mangles the name (e.g. "AstraStrata" →
  // "astrastrata" on disk, but we want the title cased "AstraStrata").
  try {
    await processIngest({
      filePath: diskPath,
      sourceType: 'wiki',
      sourceRoot: 'library',
      projectName: null,
      threadName: null,
      domaineName: null,
    })
    // Best-effort title sync. The rag_documents row was just upserted by
    // processIngest keyed on source_path = diskPath; UPDATE that exact
    // row's title to the wiki page's user-facing title. Failure is
    // non-fatal — the worst case is a stale lowercase-slug title.
    await ragQuery(
      `UPDATE rag_documents SET title = $1 WHERE source_path = $2 AND source_type = 'wiki'`,
      [wikiPageTitle, diskPath],
    )
  } catch (err) {
    console.warn(`[ragWiki] reingest as wiki failed:`, (err as Error).message)
  }
}

// ── Compile flows ─────────────────────────────────────────────────────────

interface CompileArgs {
  slug: string
  title: string
  tier: Tier
  namespace: string | null
  domaineId: string
  sources: SourceDoc[]
  /** Tier-1 only: doc ids to persist into rag_wiki_page_sources. Tier-2
   *  and tier-3 leave this empty — their sources are recomputable from
   *  rag_wiki_pages itself. */
  sourceDocIds?: string[]
}

interface CompileResult {
  ok: boolean
  slug: string
  content?: string
  error?: string
}

async function compileFromSources(args: CompileArgs): Promise<CompileResult> {
  if (args.sources.length === 0) {
    return { ok: false, slug: args.slug, error: 'no source documents' }
  }
  const compiled = await runGeminiCompile(args.tier, args.title, args.sources)
  if (compiled.error || !compiled.content) {
    return { ok: false, slug: args.slug, error: compiled.error ?? 'compile failed' }
  }
  const pageId = await upsertWikiPageRow({
    slug:        args.slug,
    title:       args.title,
    content:     compiled.content,
    sourceCount: args.sources.length,
    tier:        args.tier,
    namespace:   args.namespace,
    domaineId:   args.domaineId,
  })
  if (!pageId) return { ok: false, slug: args.slug, error: 'wiki page upsert failed' }

  // Only tier-1 pages persist their source ids — tier-2/3 sources are
  // other wiki pages, derivable from (tier, namespace, domaine_id).
  if (args.tier === 'thread' && args.sourceDocIds && args.sourceDocIds.length > 0) {
    await replaceWikiSources(pageId, args.sourceDocIds)
  }

  const diskPath = await writeWikiToDisk(args.slug, compiled.content)
  if (diskPath) {
    // Fire-and-forget loop-back ingest so the wiki page itself becomes
    // searchable in Codex. Wiki-typed ingests early-return from the
    // compile-trigger pipeline so this doesn't recursively re-fire.
    // Pass args.title so the loop-back rag_documents.title matches the
    // wiki page title (instead of the file basename — see reingestAsWiki).
    void reingestAsWiki(diskPath, args.title)
  }
  return { ok: true, slug: args.slug, content: compiled.content }
}

// ── Tier-specific orchestrators ───────────────────────────────────────────

export interface ThreadIdentity {
  domaineId: string
  domaineName: string
  projectName: string
  threadName: string
  threadPath: string
}

export async function compileThreadWiki(t: ThreadIdentity): Promise<CompileResult> {
  const slug = threadSlugFor(t.domaineName, t.projectName, t.threadName)
  if (!slug) return { ok: false, slug: '', error: 'invalid name component (empty after slugify)' }
  const sources = await fetchThreadSources(t.threadPath)
  if (sources.length < COLD_START_MIN_DOCS) {
    return { ok: false, slug, error: `thread has < ${COLD_START_MIN_DOCS} sources` }
  }
  return compileFromSources({
    slug,
    title: titleCase(t.threadName),
    tier: 'thread',
    namespace: t.projectName,
    domaineId: t.domaineId,
    sources,
    sourceDocIds: sources.map((s) => s.id),
  })
}

export interface ProjectIdentity {
  domaineId: string
  domaineName: string
  projectName: string
}

export async function compileProjectWiki(p: ProjectIdentity): Promise<CompileResult> {
  const slug = projectSlugFor(p.domaineName, p.projectName)
  if (!slug) return { ok: false, slug: '', error: 'invalid name component (empty after slugify)' }
  const sources = await fetchProjectChildren(p.projectName, p.domaineId)
  if (sources.length === 0) {
    return { ok: false, slug, error: 'no thread wikis under this project yet' }
  }
  return compileFromSources({
    slug,
    // v15: title is just the project folder name (titleCased) — was
    // "<Project> · Project Overview". The decoration confused the Graph
    // (which reads rag_documents.title) and didn't match tier-1's
    // convention of bare folder name.
    title: titleCase(p.projectName),
    tier: 'project',
    namespace: p.projectName,
    domaineId: p.domaineId,
    sources,
  })
}

export interface DomaineIdentity {
  domaineId: string
  domaineName: string
}

export async function compileDomaineWiki(d: DomaineIdentity): Promise<CompileResult> {
  const slug = domaineSlugFor(d.domaineName)
  if (!slug) return { ok: false, slug: '', error: 'invalid Domaine name (empty after slugify)' }
  const sources = await fetchDomaineChildren(d.domaineId)
  if (sources.length === 0) {
    return { ok: false, slug, error: 'no project wikis in this Domaine yet' }
  }
  return compileFromSources({
    slug,
    // v15: bare titleCase'd Domaine name — was "<Domaine> · Domaine
    // Overview". Matches the tier-1/tier-2 convention.
    title: titleCase(d.domaineName),
    tier: 'domaine',
    namespace: null,
    domaineId: d.domaineId,
    sources,
  })
}

/** Recompile an existing wiki page by slug — dispatches by tier. */
export async function compileWikiPage(slug: string): Promise<CompileResult> {
  const meta = await getWikiPageMetaBySlug(slug)
  if (!meta) return { ok: false, slug, error: `no wiki page with slug '${slug}'` }
  if (!meta.domaine_id) return { ok: false, slug, error: 'wiki page has no Domaine assigned' }

  const sources = await fetchSourcesForExistingPage(meta)
  return compileFromSources({
    slug:      meta.slug,
    title:     meta.title,
    tier:      meta.tier,
    namespace: meta.namespace,
    domaineId: meta.domaine_id,
    sources,
    sourceDocIds: meta.tier === 'thread' ? sources.map((s) => s.id) : undefined,
  })
}

export async function regenerateWikiPage(slug: string): Promise<CompileResult> {
  return compileWikiPage(slug)
}

// ── Doc context resolution (path → Domaine/Project/Thread) ────────────────
//
// A seed document only carries (project_name, thread_name, source_path).
// Resolve the source_path to its parent Domaine by walking projectsRoot/
// <domaineName>/<projectName>/<threadName>/...

interface DocContext {
  docId: string
  domaineId: string
  domaineName: string
  projectName: string
  threadName: string
  threadPath: string
}

async function resolveDocContext(docId: string): Promise<DocContext | null> {
  const cfg = loadConfig()
  const projectsRoot = cfg.projectsRoot
  if (!projectsRoot) return null

  const docRes = await ragQuery<{ project_name: string | null; thread_name: string | null; source_path: string; source_type: string }>(`
    SELECT project_name, thread_name, source_path, source_type
    FROM rag_documents WHERE id = $1::uuid LIMIT 1
  `, [docId])
  const doc = docRes?.rows[0]
  if (!doc) return null
  if (doc.source_type === 'wiki') return null
  if (!doc.project_name || !doc.thread_name) return null

  const rootPrefix = projectsRoot.endsWith('/') ? projectsRoot : projectsRoot + '/'
  if (!doc.source_path.startsWith(rootPrefix)) return null
  const rel = doc.source_path.slice(rootPrefix.length).split('/').filter(Boolean)
  if (rel.length < 3) return null
  const domaineName = rel[0]

  const dom = await ragQuery<{ id: string }>(`
    SELECT id::text FROM rag_domaines WHERE name = $1 LIMIT 1
  `, [domaineName])
  const domaineId = dom?.rows[0]?.id
  if (!domaineId) return null

  return {
    docId,
    domaineId,
    domaineName,
    projectName: doc.project_name,
    threadName: doc.thread_name,
    threadPath: path.join(projectsRoot, domaineName, doc.project_name, doc.thread_name),
  }
}

// ── compileAffectedPages — incremental compile chain ─────────────────────

/**
 * Given a list of seed document ids (just-ingested or recently changed),
 * compile the affected wiki pages in tier order:
 *   1. Thread wikis for each unique thread the seed docs touched.
 *   2. Project wikis for each unique project across those threads.
 *   3. Domaine wikis for each unique Domaine across those projects.
 *
 * Tier-2 and tier-3 read their sources from rag_wiki_pages, so they always
 * see the freshly-compiled tier-1/tier-2 content even though disk re-ingest
 * is fire-and-forget downstream.
 *
 * Returns the slugs that compiled successfully and the slugs that didn't,
 * one slug per tier × scope. No deduplication across tiers — `compiled`
 * may include `astra/proj-a/thr-1`, `astra/proj-a/_project`, and
 * `astra/_domaine` from a single seed doc.
 */
export async function compileAffectedPages(seedDocIds: string[]): Promise<{ compiled: string[]; skipped: string[] }> {
  const compiled: string[] = []
  const skipped:  string[] = []
  if (seedDocIds.length === 0) return { compiled, skipped }

  const threads:  Map<string, ThreadIdentity>  = new Map()
  const projects: Map<string, ProjectIdentity> = new Map()
  const domaines: Map<string, DomaineIdentity> = new Map()

  for (const docId of seedDocIds) {
    const ctx = await resolveDocContext(docId)
    if (!ctx) continue
    const tKey = `${ctx.domaineId}|${ctx.projectName}|${ctx.threadName}`
    threads.set(tKey, {
      domaineId:   ctx.domaineId,
      domaineName: ctx.domaineName,
      projectName: ctx.projectName,
      threadName:  ctx.threadName,
      threadPath:  ctx.threadPath,
    })
    const pKey = `${ctx.domaineId}|${ctx.projectName}`
    projects.set(pKey, {
      domaineId:   ctx.domaineId,
      domaineName: ctx.domaineName,
      projectName: ctx.projectName,
    })
    domaines.set(ctx.domaineId, { domaineId: ctx.domaineId, domaineName: ctx.domaineName })
  }

  for (const t of threads.values()) {
    const r = await compileThreadWiki(t)
    if (r.ok) compiled.push(r.slug)
    else skipped.push(r.slug || `${t.projectName}/${t.threadName}`)
  }
  for (const p of projects.values()) {
    const r = await compileProjectWiki(p)
    if (r.ok) compiled.push(r.slug)
    else skipped.push(r.slug || p.projectName)
  }
  for (const d of domaines.values()) {
    const r = await compileDomaineWiki(d)
    if (r.ok) compiled.push(r.slug)
    else skipped.push(r.slug || d.domaineName)
  }
  return { compiled, skipped }
}

// ── Trigger ───────────────────────────────────────────────────────────────

async function drainCompileQueue(): Promise<void> {
  if (isCompiling) return
  isCompiling = true
  try {
    while (recentIngestIds.length > 0) {
      const batch = [...recentIngestIds]
      recentIngestIds = []
      try {
        const r = await compileAffectedPages(batch)
        if (r.compiled.length || r.skipped.length) {
          console.log(`[ragWiki] auto-compile: compiled=${r.compiled.length} skipped=${r.skipped.length} (batch=${batch.length})`)
        }
      } catch (err) {
        console.warn('[ragWiki] auto-compile failed:', (err as Error).message)
      }
    }
  } finally {
    isCompiling = false
  }
}

export function notifyIngestForWikiCompile(documentId: string | null, sourceType: SourceType): void {
  if (!documentId || sourceType === 'wiki') return
  recentIngestIds.push(documentId)
  void drainCompileQueue()
}

export async function compileNow(seedDocIds: string[] = []): Promise<{ compiled: string[]; skipped: string[] }> {
  if (isCompiling) return { compiled: [], skipped: [] }
  isCompiling = true
  try {
    return await compileAffectedPages(seedDocIds)
  } finally {
    isCompiling = false
  }
}

// ── bootstrapMissingPages ────────────────────────────────────────────────
//
// Three-tier cold-start. Iterates:
//   1. Unique (domaine, project, thread) tuples derived from
//      rag_documents.source_path. If a thread wiki doesn't exist, compile.
//   2. Unique (domaine, project) tuples derived from any tier-1 page that
//      now exists. If a project wiki doesn't exist, compile.
//   3. Unique Domaine ids from any tier-2 page that now exists. If a
//      Domaine wiki doesn't exist, compile.
//
// Returns the per-pass slug lists + alreadyExists count (sum across all
// three tiers) so the boot logger can show one line.

export async function bootstrapMissingPages(): Promise<{ compiled: string[]; skipped: string[]; alreadyExists: number }> {
  const compiled: string[] = []
  const skipped:  string[] = []
  let alreadyExists = 0

  if (isCompiling) {
    console.log('[ragWiki] bootstrapMissingPages: another compile is running; deferring')
    return { compiled, skipped, alreadyExists: 0 }
  }
  isCompiling = true
  try {
    const cfg = loadConfig()
    const projectsRoot = cfg.projectsRoot
    if (!projectsRoot) return { compiled, skipped, alreadyExists: 0 }

    // ── Tier 1 ───────────────────────────────────────────────────────────
    // All distinct (project_name, thread_name) pairs with active non-wiki
    // docs. Use MIN(source_path) as a sample to derive the Domaine name
    // for each pair (every doc in the same thread shares the same
    // <projectsRoot>/<domaine>/<project>/<thread>/... prefix, so any
    // sample works).
    const threadRowsRes = await ragQuery<{ project_name: string; thread_name: string; sample_path: string; cnt: string }>(`
      SELECT
        d.project_name,
        d.thread_name,
        MIN(d.source_path) AS sample_path,
        COUNT(*)::text     AS cnt
      FROM rag_documents d
      WHERE d.is_active
        AND d.source_type <> 'wiki'
        AND d.project_name IS NOT NULL
        AND d.thread_name  IS NOT NULL
      GROUP BY d.project_name, d.thread_name
      HAVING COUNT(*) >= ${COLD_START_MIN_DOCS}
    `)
    const threadRows = threadRowsRes?.rows ?? []

    const rootPrefix = projectsRoot.endsWith('/') ? projectsRoot : projectsRoot + '/'
    const threadIds: ThreadIdentity[] = []
    for (const row of threadRows) {
      if (!row.sample_path.startsWith(rootPrefix)) continue
      const rel = row.sample_path.slice(rootPrefix.length).split('/').filter(Boolean)
      if (rel.length < 3) continue
      const domaineName = rel[0]
      const dom = await ragQuery<{ id: string }>(`
        SELECT id::text FROM rag_domaines WHERE name = $1 LIMIT 1
      `, [domaineName])
      const domaineId = dom?.rows[0]?.id
      if (!domaineId) continue
      threadIds.push({
        domaineId,
        domaineName,
        projectName: row.project_name,
        threadName:  row.thread_name,
        threadPath:  path.join(projectsRoot, domaineName, row.project_name, row.thread_name),
      })
    }

    for (const t of threadIds) {
      const slug = threadSlugFor(t.domaineName, t.projectName, t.threadName)
      if (!slug) { skipped.push(`${t.projectName}/${t.threadName}`); continue }
      const existing = await findPageByIdentity(slug, t.projectName, t.domaineId)
      if (existing) { alreadyExists++; continue }
      const r = await compileThreadWiki(t)
      if (r.ok) compiled.push(r.slug)
      else skipped.push(r.slug || `${t.projectName}/${t.threadName}`)
    }

    // ── Tier 2 ───────────────────────────────────────────────────────────
    // Unique (namespace, domaine_id) tuples where any tier-1 page now
    // exists. Skip those whose project wiki was already compiled.
    const projectRowsRes = await ragQuery<{ namespace: string; domaine_id: string }>(`
      SELECT DISTINCT namespace, domaine_id::text
      FROM rag_wiki_pages
      WHERE tier = 'thread'
        AND namespace   IS NOT NULL
        AND domaine_id  IS NOT NULL
    `)
    const projectRows = projectRowsRes?.rows ?? []

    for (const row of projectRows) {
      const dom = await ragQuery<{ name: string }>(`
        SELECT name FROM rag_domaines WHERE id = $1::uuid LIMIT 1
      `, [row.domaine_id])
      const domaineName = dom?.rows[0]?.name
      if (!domaineName) continue
      const slug = projectSlugFor(domaineName, row.namespace)
      if (!slug) { skipped.push(`${row.namespace}/_project`); continue }
      const existing = await findPageByIdentity(slug, row.namespace, row.domaine_id)
      if (existing) { alreadyExists++; continue }
      const r = await compileProjectWiki({
        domaineId:   row.domaine_id,
        domaineName,
        projectName: row.namespace,
      })
      if (r.ok) compiled.push(r.slug)
      else skipped.push(r.slug || `${row.namespace}/_project`)
    }

    // ── Tier 3 ───────────────────────────────────────────────────────────
    const domaineRowsRes = await ragQuery<{ domaine_id: string }>(`
      SELECT DISTINCT domaine_id::text
      FROM rag_wiki_pages
      WHERE tier = 'project'
        AND domaine_id IS NOT NULL
    `)
    const domaineRows = domaineRowsRes?.rows ?? []

    for (const row of domaineRows) {
      const dom = await ragQuery<{ name: string }>(`
        SELECT name FROM rag_domaines WHERE id = $1::uuid LIMIT 1
      `, [row.domaine_id])
      const domaineName = dom?.rows[0]?.name
      if (!domaineName) continue
      const slug = domaineSlugFor(domaineName)
      if (!slug) { skipped.push('_domaine'); continue }
      const existing = await findPageByIdentity(slug, null, row.domaine_id)
      if (existing) { alreadyExists++; continue }
      const r = await compileDomaineWiki({ domaineId: row.domaine_id, domaineName })
      if (r.ok) compiled.push(r.slug)
      else skipped.push(r.slug || domaineName)
    }

    return { compiled, skipped, alreadyExists }
  } finally {
    isCompiling = false
  }
}

// ── List / get for the Wiki sub-tab ───────────────────────────────────────

export interface ListWikiPagesArgs {
  domaineId?: string | null
  crossDomaine?: boolean
  /** Filter to a single tier. Useful when the Wiki sub-tab UI splits its
   *  view into Thread / Project / Domaine sections. */
  tier?: Tier
}

export async function listWikiPages(args?: ListWikiPagesArgs): Promise<WikiPageListItem[]> {
  const params: unknown[] = []
  const whereParts: string[] = []
  if (!args?.crossDomaine && args?.domaineId) {
    params.push(args.domaineId)
    whereParts.push(`domaine_id = $${params.length}::uuid`)
  }
  if (args?.tier) {
    params.push(args.tier)
    whereParts.push(`tier = $${params.length}`)
  }
  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''
  const res = await ragQuery<WikiPageListItem>(`
    SELECT slug,
           title,
           source_count,
           created_at::text,
           updated_at::text,
           SUBSTRING(content FROM 1 FOR 1000) AS content_head,
           domaine_id::text,
           domaine_overflow_count,
           tier,
           namespace
    FROM rag_wiki_pages
    ${whereClause}
    ORDER BY tier ASC, updated_at DESC
  `, params)
  return res?.rows ?? []
}

export async function getWikiPage(slug: string): Promise<WikiPageRow | null> {
  return getWikiPageRowBySlug(slug)
}

// ── Wiki sources for citation navigation ──────────────────────────────────

export interface WikiSourceListItem {
  id: string
  title: string
  source_path: string
  source_type: string
  source_root: string
  project_name: string | null
}

/** Returns the ordered source list backing a wiki page for [N] citation
 *  navigation. Tier-1 pages return the document rows from
 *  rag_wiki_page_sources. Tier-2/3 pages return synthetic rows shaped
 *  like documents but pointing at the child wiki pages — the renderer
 *  can use the source_path to navigate to the child wiki. */
export async function getWikiPageSources(slug: string): Promise<WikiSourceListItem[]> {
  const meta = await getWikiPageMetaBySlug(slug)
  if (!meta) return []

  if (meta.tier === 'thread') {
    const res = await ragQuery<WikiSourceListItem>(`
      SELECT d.id::text, d.title, d.source_path, d.source_type, d.source_root, d.project_name
      FROM rag_wiki_pages w
      JOIN rag_wiki_page_sources wps ON wps.wiki_page_id = w.id
      JOIN rag_documents d ON d.id = wps.document_id
      WHERE w.slug = $1 AND d.is_active = TRUE
      ORDER BY d.ingested_at ASC
    `, [slug])
    return res?.rows ?? []
  }

  // Tier 2 + 3: children are other wiki pages. Synthesize document-shaped
  // rows so the renderer's [N] citation lookup keeps working — source_path
  // doubles as the navigation target (a wiki slug, prefixed so the
  // renderer can tell it's a wiki link).
  const childTier: Tier = meta.tier === 'project' ? 'thread' : 'project'
  const params: unknown[] = [childTier, meta.domaine_id]
  let whereExtra = ''
  if (childTier === 'thread' && meta.namespace) {
    params.push(meta.namespace)
    whereExtra = ` AND namespace = $${params.length}`
  }
  const res = await ragQuery<{ slug: string; title: string }>(`
    SELECT slug, title
    FROM rag_wiki_pages
    WHERE tier = $1
      AND domaine_id = $2::uuid${whereExtra}
    ORDER BY updated_at ASC
  `, params)
  return (res?.rows ?? []).map((r) => ({
    id:           r.slug,
    title:        r.title,
    source_path:  `wiki://${r.slug}`,
    source_type:  'wiki',
    source_root:  'library',
    project_name: meta.namespace,
  }))
}

// ── Wiki actions: Import to Thread / Use as Report Draft ─────────────────

function resolveThreadPath(projectName: string, threadName: string): string | null {
  const cfg = loadConfig()
  const root = cfg.projectsRoot || ''
  if (!root || !projectName || !threadName) return null
  return path.join(root, projectName, threadName)
}

async function pathExists(p: string): Promise<boolean> {
  try { await stat(p); return true } catch { return false }
}

export interface ImportWikiResult {
  ok: boolean
  destPath?: string
  alreadyExists?: boolean
  error?: string
}

/**
 * Copy a wiki page's disk file into the thread root. Session 7 fix #1
 * dropped the `References/` subfolder — wiki imports land at the thread
 * root alongside notes / brain dumps / reports. The destination filename
 * uses just the last path segment of the slug (the "leaf" name) — the
 * parent hierarchy is dropped because the destination lives under a
 * specific thread, so context is already implicit.
 */
export async function importWikiToThread(args: {
  slug: string
  projectName: string
  threadName: string
  overwrite?: boolean
}): Promise<ImportWikiResult> {
  const { slug, projectName, threadName, overwrite = false } = args
  if (!slug) return { ok: false, error: 'slug required' }

  const threadPath = resolveThreadPath(projectName, threadName)
  if (!threadPath) return { ok: false, error: 'no active thread / projectsRoot not set' }

  const src = wikiDiskPath(slug)
  if (!await pathExists(src)) {
    return { ok: false, error: `wiki page on disk not found: ${src}` }
  }

  const leaf = slug.split('/').pop() ?? slug
  const destPath = path.join(threadPath, `${leaf}.md`)

  if (!overwrite && await pathExists(destPath)) {
    return { ok: false, alreadyExists: true, destPath }
  }
  try {
    await mkdir(threadPath, { recursive: true })
    await copyFile(src, destPath)
    return { ok: true, destPath }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Versioned report draft from a wiki page's DB content. Same shape as
 * before — uses the slug leaf as the report base name.
 */
export async function useWikiAsReportDraft(args: {
  slug: string
  projectName: string
  threadName: string
}): Promise<{ ok: boolean; destPath?: string; versionNumber?: number; error?: string }> {
  const { slug, projectName, threadName } = args
  if (!slug) return { ok: false, error: 'slug required' }

  const threadPath = resolveThreadPath(projectName, threadName)
  if (!threadPath) return { ok: false, error: 'no active thread / projectsRoot not set' }

  const row = await getWikiPageRowBySlug(slug)
  if (!row) return { ok: false, error: `no wiki page with slug '${slug}'` }

  const leaf = slug.split('/').pop() ?? slug
  const res = await writeReportFromContent({
    threadPath,
    baseName: leaf,
    content: row.content,
  })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, destPath: res.filePath, versionNumber: res.versionNumber }
}
