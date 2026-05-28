/**
 * Hive aggregator — collects per-agent stats for the Hive dashboard.
 *
 * The Hive tab (architecture-v4 Part 5) is the agent control room. Each card
 * needs a small bundle of stats; rather than spamming the renderer with one
 * IPC per metric, we collect everything in one main-process helper and ship
 * a structured response.
 *
 * Cards covered here:
 *   - Honcho: session count, synthesisReady-thread count, dreams across all
 *     threads (the Dreams panel data source), conclusions count (best-effort
 *     from Honcho — endpoint may not expose this).
 *   - Validation: last-sweep timestamp + orphan / zombie / dead-link counts
 *     (already exposed by `cleanupOps` helpers).
 *   - Ingestion: handled in the renderer via the existing `ingest:counts`
 *     and `ingest:list-activity` IPCs — no helper here.
 *   - Synthesis: per-card stats handled in the renderer via the existing
 *     graph analytics IPC + a new `synthesis:list-recent` for draft history.
 */
import fs from 'fs'
import path from 'path'
import { listProjects, listThreads, readFullMemoryFile, readThreadMeta } from './projectFs'
import { ragQuery } from './ragDb'

const HONCHO_WORKSPACE_ID = 'holocron'
const HONCHO_PEER_USER    = 'andy'

export interface HiveDream {
  /** Synthetic id: `${threadPath}::${queriedAt}` — stable across refreshes. */
  id: string
  threadPath: string
  threadName: string
  projectName: string
  queriedAt: string
  trigger: string
  insight: string
}

export interface HiveHonchoStats {
  activeSessionsCount: number       // threads with non-empty honchoSessionId
  totalThreadCount: number
  synthesisReadyCount: number
  conclusionsCount: number | null   // null when endpoint is unsupported
  dreams: HiveDream[]               // flat list across all threads, newest first
}

/**
 * Walk every thread under projectsRoot, read each thread's meta + Memory file,
 * aggregate counts + dreams. N = thread count (typically 20-50 for Andy);
 * acceptable for a Hive refresh. The renderer caches the result via store
 * state — we don't recompute on every render.
 */
export async function gatherHiveHonchoStats(
  projectsRoot: string,
  honchoBaseUrl: string,
): Promise<HiveHonchoStats> {
  let activeSessionsCount = 0
  let totalThreadCount = 0
  let synthesisReadyCount = 0
  const dreams: HiveDream[] = []

  if (projectsRoot) {
    const projects = await listProjects(projectsRoot)
    for (const p of projects) {
      const threads = await listThreads(p.path)
      for (const t of threads) {
        totalThreadCount++
        const meta = await readThreadMeta(t.path).catch(() => null)
        if (meta?.honchoSessionId) activeSessionsCount++
        const mem = await readFullMemoryFile(t.path, p.name, t.name).catch(() => null)
        if (mem?.synthesisReady) synthesisReadyCount++
        if (mem?.dreamInsights?.length) {
          for (const d of mem.dreamInsights) {
            dreams.push({
              id: `${t.path}::${d.queriedAt}`,
              threadPath: t.path,
              threadName: t.name,
              projectName: p.name,
              queriedAt: d.queriedAt,
              trigger: d.trigger,
              insight: d.insight,
            })
          }
        }
      }
    }
  }

  // Sort dreams newest-first by queriedAt.
  dreams.sort((a, b) => (a.queriedAt < b.queriedAt ? 1 : a.queriedAt > b.queriedAt ? -1 : 0))

  // Conclusions count — best-effort. Honcho v3 may expose this as a list
  // endpoint; if not (404/anything weird), we return null and the card hides
  // the row honestly.
  let conclusionsCount: number | null = null
  try {
    const res = await fetch(`${honchoBaseUrl}/v3/workspaces/${HONCHO_WORKSPACE_ID}/conclusions/count?observer_id=${HONCHO_PEER_USER}`).catch(() => null)
    if (res && res.ok) {
      const body = await res.json().catch(() => null) as { count?: number } | null
      if (body && typeof body.count === 'number') conclusionsCount = body.count
    }
  } catch { /* endpoint unsupported — leave as null */ }

  return {
    activeSessionsCount,
    totalThreadCount,
    synthesisReadyCount,
    conclusionsCount,
    dreams,
  }
}

// ── Validation card stats ──────────────────────────────────────────────────

export interface ValidationStats {
  lastSweepAt: string | null
  orphanTagCount: number | null
  zombieWikiDocCount: number | null
  deadLinkCount: number | null
  /** Last 5 sweep events from rag_operations_log (newest first), if the
   *  table records them. May be empty if no sweep has been logged yet. */
  recentSweeps: Array<{ at: string; kind: string; payload: string | null }>
}

export async function gatherValidationStats(): Promise<ValidationStats> {
  // Last sweep timestamp + recent sweeps from rag_operations_log.
  let lastSweepAt: string | null = null
  let recentSweeps: ValidationStats['recentSweeps'] = []
  try {
    // Schema reality (migration 001): the column is `operation`, not `kind`,
    // and the JSONB payload column is `details`, not `payload`. The original
    // SELECT used the wrong names and crashed every Validation-card load
    // with `column "kind" does not exist`. Aliasing back to the legacy
    // names keeps the ValidationStats.recentSweeps shape stable so
    // downstream consumers (the kind === 'validation_sweep' check below
    // and the Hive Validation card) don't need to change.
    const res = await ragQuery<{ created_at: string; kind: string; payload: string | null }>(
      `SELECT created_at::text AS created_at,
              operation         AS kind,
              details::text     AS payload
         FROM rag_operations_log
        WHERE operation IN ('orphan_sweep', 'deadlink_purge', 'zombie_sweep', 'health_scan', 'validation_sweep')
        ORDER BY created_at DESC
        LIMIT 5`,
    )
    recentSweeps = (res?.rows ?? []).map((r) => ({ at: r.created_at, kind: r.kind, payload: r.payload }))
    if (recentSweeps.length > 0) lastSweepAt = recentSweeps[0].at
  } catch (err) {
    console.warn('[Hive] validation log query failed:', (err as Error).message)
  }

  // Current counts — orphan tags, zombie wiki doc rows (`rag_documents`
  // marked source_type='wiki' with no live rag_wiki_pages row), and dead
  // links (rag_documents pointing at files that no longer exist on disk).
  // Each query is bounded + cheap.
  let orphanTagCount: number | null = null
  let zombieWikiDocCount: number | null = null
  let deadLinkCount: number | null = null
  try {
    const ot = await ragQuery<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM rag_tags
        WHERE id NOT IN (SELECT DISTINCT tag_id FROM rag_document_tags WHERE tag_id IS NOT NULL)`,
    )
    orphanTagCount = Number(ot?.rows[0]?.cnt ?? '0')
  } catch { /* leave null on failure */ }
  try {
    const zw = await ragQuery<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM rag_documents d
        WHERE d.source_type = 'wiki'
          AND NOT EXISTS (
            SELECT 1 FROM rag_wiki_pages w WHERE w.slug = REGEXP_REPLACE(d.source_path, '^.*/_Codex/Wiki/(.+)\\.md$', '\\1')
          )`,
    )
    zombieWikiDocCount = Number(zw?.rows[0]?.cnt ?? '0')
  } catch { /* leave null */ }
  try {
    // Dead-link count requires fs.stat per doc — expensive. Instead, surface
    // the count from the last recorded sweep if available; otherwise null.
    // Look at both legacy `deadlink_purge` rows and the new `validation_sweep`
    // bundle that includes deadLinksFound.
    const dl = recentSweeps.find((r) => r.kind === 'validation_sweep' || r.kind === 'deadlink_purge')
    if (dl?.payload) {
      const parsed = JSON.parse(dl.payload) as { deadLinksFound?: number; found?: number; purged?: number }
      deadLinkCount = parsed.deadLinksFound ?? parsed.found ?? parsed.purged ?? null
    }
  } catch { /* leave null */ }

  return { lastSweepAt, orphanTagCount, zombieWikiDocCount, deadLinkCount, recentSweeps }
}

// ── Foundry card stats ─────────────────────────────────────────────────────
//
// Surface counts split by lifecycle stage so the Hive card can render
// status accurately (pending > 0 = warning; otherwise idle/healthy).
// One query against foundry_items grouped by triage_status is enough.

export interface FoundryStats {
  pendingCount: number              // triage_status IN ('pending', 'triaged') awaiting Andy's review
  admittedCount: number             // historical total
  rejectedCount: number             // historical total
  totalCount: number                // every status, ever
  lastCapturedAt: string | null     // newest created_at across all rows
}

export async function gatherFoundryStats(): Promise<FoundryStats> {
  try {
    const counts = await ragQuery<{ triage_status: string; cnt: string }>(
      `SELECT triage_status, COUNT(*)::text AS cnt
         FROM foundry_items
        GROUP BY triage_status`,
    )
    let pendingCount = 0
    let admittedCount = 0
    let rejectedCount = 0
    let totalCount = 0
    for (const row of counts?.rows ?? []) {
      const n = Number(row.cnt)
      totalCount += n
      // "Pending review" combines pending + triaged — the user has to act
      // on both. The two statuses only differ in whether triage has
      // populated the suggestion fields yet; from the Hive's perspective
      // they're equally "waiting on Andy."
      if (row.triage_status === 'pending' || row.triage_status === 'triaged') pendingCount += n
      else if (row.triage_status === 'approved') admittedCount += n
      else if (row.triage_status === 'rejected') rejectedCount += n
    }

    const last = await ragQuery<{ created_at: string }>(
      `SELECT created_at::text AS created_at
         FROM foundry_items
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    const lastCapturedAt = last?.rows[0]?.created_at ?? null

    return { pendingCount, admittedCount, rejectedCount, totalCount, lastCapturedAt }
  } catch (err) {
    console.warn('[Hive] gatherFoundryStats failed:', (err as Error).message)
    return { pendingCount: 0, admittedCount: 0, rejectedCount: 0, totalCount: 0, lastCapturedAt: null }
  }
}

// ── Synthesis: recent drafts ───────────────────────────────────────────────

export interface SynthesisDraft {
  id: string
  title: string
  synthesisType: string | null
  diskPath: string | null
  createdAt: string
  gapId: string | null
  dreamId: string | null
}

export async function listRecentSyntheses(limit = 10): Promise<SynthesisDraft[]> {
  try {
    const res = await ragQuery<{
      id: string; title: string; synthesis_type: string | null;
      disk_path: string | null; created_at: string;
      gap_id: string | null; dream_id: string | null;
    }>(
      `SELECT id::text AS id, title, synthesis_type, disk_path, created_at::text AS created_at,
              gap_id, dream_id
         FROM rag_syntheses
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    )
    return (res?.rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      synthesisType: r.synthesis_type,
      diskPath: r.disk_path,
      createdAt: r.created_at,
      gapId: r.gap_id,
      dreamId: r.dream_id,
    }))
  } catch (err) {
    console.warn('[Hive] listRecentSyntheses failed:', (err as Error).message)
    return []
  }
}

// ── Synthesis generator (Sonnet bridge-document) ───────────────────────────

/** synthesis_type tag written into the frontmatter + rag_syntheses row.
 *  'gap-bridge' is the default — analytics-driven structural-gap bridging.
 *  'honcho-dream' is set by the Dreams panel Approve flow so dream-derived
 *  syntheses are semantically distinguishable in downstream queries (per
 *  architecture-v4 §7.5). The prompt + writer pipeline is identical; only
 *  the tag differs. */
export type SynthesisType = 'gap-bridge' | 'honcho-dream'

export interface GenerateGapBridgeArgs {
  gapId: string                           // stable id from analytics, e.g. "gap:5-12"
  clusterA: { id: number; name: string; topTags: string[] }
  clusterB: { id: number; name: string; topTags: string[] }
  topDocs: Array<{ title: string; sourcePath: string }>
  domaineId?: string | null
  libraryPath: string                     // _Codex root from config
  lm: { provider: 'anthropic'; model: string; apiKey: string; baseUrl: string }
  synthesisType?: SynthesisType           // defaults to 'gap-bridge'
}

export interface GenerateGapBridgeResult {
  ok: boolean
  filePath?: string
  synthesisId?: string
  error?: string
}

/**
 * Generate a gap-bridge synthesis document. Writes:
 *   1. A markdown file at `<libraryPath>/Syntheses/<gap-slug>.md`
 *   2. A `rag_syntheses` row (synthesis_type='gap-bridge', gap_id, disk_path)
 *
 * Does NOT trigger re-ingest here — the chokidar watcher on the workspace
 * root will pick up the new file automatically (per the existing add-event
 * pipeline in `workspace.ts` / `ragIngest.ts`). If the watcher isn't watching
 * `_Codex/Syntheses/`, the caller can fire a manual re-ingest via
 * `rag:ingest-manual` after this returns.
 */
type ChatRole = 'system' | 'user' | 'assistant'

export async function generateGapBridge(
  args: GenerateGapBridgeArgs,
  chat: (opts: {
    provider: 'anthropic'
    model: string
    apiKey: string
    baseUrl: string
    messages: Array<{ role: ChatRole; content: string }>
    temperature?: number
    maxTokens?: number
    stream?: false
    task?: string
  }) => Promise<{ content: string; error?: string }>,
): Promise<GenerateGapBridgeResult> {
  const { gapId, clusterA, clusterB, topDocs, domaineId, libraryPath, lm } = args
  const synthesisType: SynthesisType = args.synthesisType ?? 'gap-bridge'

  // Compose the prompt. Architecture-v4 Part 4.2 calls this out: 400-600
  // words, markdown, clear thesis + 3-4 connecting insights + open questions.
  const docList = topDocs.length > 0
    ? topDocs.map((d) => `- ${d.title}`).join('\n')
    : '(no specific documents — draw on the cluster tags as your anchor)'
  const tagsA = clusterA.topTags.length > 0 ? clusterA.topTags.join(', ') : '(no dominant tags)'
  const tagsB = clusterB.topTags.length > 0 ? clusterB.topTags.join(', ') : '(no dominant tags)'

  const systemPrompt =
    `You are the Synthesis Agent inside Holocron, a personal knowledge base. ` +
    `Your job is to write bridge documents — short essays that connect two knowledge clusters the user works in but rarely connects explicitly. ` +
    `Write in the first person plural ("we") or impersonal ("the research suggests"), not as a chatbot. ` +
    `No preamble, no meta-commentary, no "I'll write…" framing. Output starts immediately with the markdown content.`

  const userPrompt =
    `Write a 400-600 word synthesis document that bridges these two knowledge clusters:\n\n` +
    `**Cluster A: ${clusterA.name}**\nTop topics: ${tagsA}\n\n` +
    `**Cluster B: ${clusterB.name}**\nTop topics: ${tagsB}\n\n` +
    `Reference these documents from the user's corpus:\n${docList}\n\n` +
    `Format requirements:\n` +
    `- Markdown.\n` +
    `- A clear thesis statement in the first paragraph.\n` +
    `- 3-4 specific connecting insights, each one paragraph.\n` +
    `- A closing "Open questions" section with 2-3 questions whose answers would deepen the bridge.\n` +
    `- Tone: analytical, specific, draws concrete connections. Not generic.`

  const r = await chat({
    provider: lm.provider,
    model: lm.model,
    apiKey: lm.apiKey,
    baseUrl: lm.baseUrl,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user'   as const, content: userPrompt },
    ],
    temperature: 0.5,
    maxTokens: 1400,
    stream: false,
    task: 'synthesis-gap-bridge',
  })
  if (r.error || !r.content?.trim()) {
    return { ok: false, error: r.error ?? 'empty content' }
  }

  const content = r.content.trim()
  const title = `Bridge: ${clusterA.name} ↔ ${clusterB.name}`
  const slug = gapId.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  const dir = path.join(libraryPath, 'Syntheses')
  const filePath = path.join(dir, `${slug}.md`)

  // Frontmatter records provenance per architecture-v4 §7.4.
  const fm = [
    '---',
    `synthesis_type: ${synthesisType}`,
    `gap_id: ${gapId}`,
    `cluster_a: "${clusterA.name}"`,
    `cluster_b: "${clusterB.name}"`,
    `generated_at: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${title}`,
    '',
    content,
    '',
  ].join('\n')

  try {
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(filePath, fm, 'utf-8')
  } catch (err) {
    return { ok: false, error: `disk write failed: ${(err as Error).message}` }
  }

  // Insert rag_syntheses row. The table is migration-008 shape; fields:
  // id, title, query, content, source_doc_ids, captured_back, captured_at,
  // created_at, plus synthesis_type, source_clusters, gap_id, dream_id,
  // disk_path, domaine_id (migration 008).
  let synthesisId: string | undefined
  try {
    const insRes = await ragQuery<{ id: string }>(
      `INSERT INTO rag_syntheses
         (title, content, synthesis_type, gap_id, source_clusters, disk_path, domaine_id, captured_back, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, false, NOW())
       RETURNING id::text AS id`,
      [
        title,
        content,
        synthesisType,
        gapId,
        JSON.stringify([clusterA, clusterB]),
        filePath,
        domaineId ?? null,
      ],
    )
    synthesisId = insRes?.rows[0]?.id
  } catch (err) {
    // The disk file is already written — if the row insert fails, the file
    // remains and will get re-ingested by chokidar regardless. Surface the
    // error but don't pretend the call failed entirely.
    console.warn('[Synthesis] rag_syntheses insert failed (file written OK):', (err as Error).message)
  }

  return { ok: true, filePath, synthesisId }
}
