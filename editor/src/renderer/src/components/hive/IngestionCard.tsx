import { useEffect, useState } from 'react'
import { CardShell } from './CardShell'

/**
 * INGESTION card — read-only status. Reuses the existing ingest:counts +
 * ingest:health-scan IPCs (already shipped). No new actions in Session 3 —
 * the Ingest sub-tab in Codex still owns Sync/Pick/Re-ingest.
 */
interface IngestCounts {
  documents:     number
  tags:          number
  relationships: number
  lastIngestAt:  string | null
}

function fmtTs(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso }
}

export function IngestionCard(): JSX.Element {
  const [counts, setCounts] = useState<IngestCounts | null>(null)
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<{ orphanTags: number; deadLinks: number; sourcelessWikiPages: number } | null>(null)

  const refresh = async (): Promise<void> => {
    setLoading(true)
    try {
      const [cntsRes, hlt] = await Promise.all([
        window.electronAPI.ingestCounts().catch(() => null),
        window.electronAPI.ingestHealthScan().catch(() => null),
      ])
      if (cntsRes?.ok && cntsRes.data) setCounts(cntsRes.data)
      if (hlt && typeof hlt === 'object' && 'orphanTags' in hlt) {
        setHealth(hlt as { orphanTags: number; deadLinks: number; sourcelessWikiPages: number })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const healthStatus: 'healthy' | 'warning' | 'idle' = health
    ? (health.orphanTags + health.deadLinks + health.sourcelessWikiPages === 0 ? 'healthy' : 'warning')
    : 'idle'

  return (
    <CardShell
      title="Ingestion"
      accentColor="var(--accent-orange)"
      status={healthStatus}
      statusMessage={health
        ? (healthStatus === 'healthy' ? 'Clean' : `${health.orphanTags + health.deadLinks + health.sourcelessWikiPages} issue${health.orphanTags + health.deadLinks + health.sourcelessWikiPages === 1 ? '' : 's'}`)
        : undefined}
      rightSlot={
        <button
          onClick={() => void refresh()}
          disabled={loading}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 11, padding: 0 }}
          title="Refresh ingestion stats"
        >
          {loading ? '…' : '⟳'}
        </button>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4, fontSize: 11 }}>
        <span style={{ color: 'var(--text-4)' }}>Documents:</span>
        <span>{counts?.documents ?? '—'}</span>
        <span style={{ color: 'var(--text-4)' }}>Tags:</span>
        <span>{counts?.tags ?? '—'}</span>
        <span style={{ color: 'var(--text-4)' }}>Relationships:</span>
        <span>{counts?.relationships ?? '—'}</span>
        <span style={{ color: 'var(--text-4)' }}>Last ingest:</span>
        <span>{fmtTs(counts?.lastIngestAt ?? null)}</span>
      </div>

      <p style={{ fontSize: 10, color: 'var(--text-5)', margin: 0, fontStyle: 'italic' }}>
        Read-only. Use Codex → Ingest for Sync workspace / Pick & Ingest / Re-ingest controls.
      </p>
    </CardShell>
  )
}
