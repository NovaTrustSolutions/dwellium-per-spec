import { ragQuery } from './ragDb'
import { checkBudget } from './llmClient'
import { pingRedis } from './ragIngest'
import { loadConfig } from './config'

// ── Types ─────────────────────────────────────────────────────────────────

export interface DashboardStatus {
  postgres: boolean
  honcho: boolean
  redis: boolean
  geminiKey: boolean
  anthropicKey: boolean
  spendToday: number
  dailyBudget: number
  hardStop: boolean
}

export interface DashboardStats {
  documents: number
  tags: number
  relationships: number
  wikiPages: number
  syntheses: number
  notesThisWeek: number
}

export interface DashboardActivityRow {
  id: string
  operation: string
  target_type: string | null
  source_path: string | null
  source_type: string | null
  tag_count: number | null
  skipped: boolean | null
  cost_usd: number | null
  provider: string | null
  model: string | null
  duration_ms: number | null
  created_at: string
}

// ── 5s status cache ───────────────────────────────────────────────────────

let cachedStatus: DashboardStatus | null = null
let cachedStatusExpires = 0
const STATUS_TTL_MS = 5_000

// ── Probes ────────────────────────────────────────────────────────────────

async function probePostgres(): Promise<boolean> {
  try {
    const res = await ragQuery<{ ok: number }>('SELECT 1 AS ok')
    return !!res && (res.rowCount ?? 0) > 0
  } catch {
    return false
  }
}

async function probeHoncho(url: string): Promise<boolean> {
  if (!url) return false
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    // Any HTTP response (even 404 on root) means the server is reachable.
    return !!res
  } catch {
    return false
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function getDashboardStatus(): Promise<DashboardStatus> {
  const now = Date.now()
  if (cachedStatus && now < cachedStatusExpires) return cachedStatus

  const cfg = loadConfig()
  const honchoUrl = cfg.honcho?.url ?? ''

  const [postgres, honcho, redis, budget] = await Promise.all([
    probePostgres(),
    probeHoncho(honchoUrl),
    pingRedis(),
    checkBudget().catch(() => null),
  ])

  const status: DashboardStatus = {
    postgres,
    honcho,
    redis,
    geminiKey: !!cfg.gemini.apiKey.trim(),
    anthropicKey: !!cfg.anthropic.apiKey.trim(),
    spendToday: budget?.spentToday ?? 0,
    dailyBudget: budget?.limit ?? 0,
    hardStop: budget?.hardStop ?? false,
  }

  cachedStatus = status
  cachedStatusExpires = now + STATUS_TTL_MS
  return status
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await ragQuery<{
    documents: string; tags: string; relationships: string
    wiki_pages: string; syntheses: string; notes_this_week: string
  }>(`
    SELECT
      (SELECT COUNT(*) FROM rag_documents WHERE is_active)::text AS documents,
      (SELECT COUNT(*) FROM rag_tags)::text AS tags,
      (SELECT COUNT(*) FROM rag_relationships)::text AS relationships,
      (SELECT COUNT(*) FROM rag_wiki_pages)::text AS wiki_pages,
      (SELECT COUNT(*) FROM rag_syntheses)::text AS syntheses,
      (SELECT COUNT(*) FROM rag_documents
         WHERE source_type = 'note' AND ingested_at >= NOW() - INTERVAL '7 days')::text AS notes_this_week
  `)
  const row = res?.rows[0]
  return {
    documents:     Number(row?.documents     ?? 0),
    tags:          Number(row?.tags          ?? 0),
    relationships: Number(row?.relationships ?? 0),
    wikiPages:     Number(row?.wiki_pages    ?? 0),
    syntheses:     Number(row?.syntheses     ?? 0),
    notesThisWeek: Number(row?.notes_this_week ?? 0),
  }
}

export async function getRecentActivity(limit = 10): Promise<DashboardActivityRow[]> {
  const cap = Math.max(1, Math.min(limit, 100))
  const res = await ragQuery<DashboardActivityRow>(`
    SELECT
      id::text,
      operation,
      target_type,
      details->>'source_path' AS source_path,
      details->>'source_type' AS source_type,
      (details->>'tag_count')::int AS tag_count,
      (details->>'skipped')::bool AS skipped,
      cost_usd,
      provider,
      details->>'model' AS model,
      duration_ms,
      created_at::text
    FROM rag_operations_log
    ORDER BY created_at DESC
    LIMIT ${cap}
  `)
  return res?.rows ?? []
}
