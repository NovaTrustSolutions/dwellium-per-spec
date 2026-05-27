import { Card, SectionLabel } from './StatusStrip'

type ActivityRow = {
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

export function RecentActivity({ rows, loading }: { rows: ActivityRow[] | null; loading: boolean }): JSX.Element {
  return (
    <Card>
      <SectionLabel>Recent Activity</SectionLabel>
      {loading && !rows && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No activity yet. Drop a markdown file into a watched folder to see ingest entries appear here.</div>
      )}
      {rows && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'monospace', fontSize: 12 }}>
          {rows.map((r) => <Row key={r.id} row={r} />)}
        </div>
      )}
    </Card>
  )
}

function Row({ row }: { row: ActivityRow }): JSX.Element {
  const time = formatTime(row.created_at)
  const desc = describe(row)
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '4px 0',
        borderBottom: '1px solid var(--border-subtle)',
        alignItems: 'baseline',
      }}
    >
      <span style={{ color: 'var(--text-dim)', fontSize: 11, flexShrink: 0, width: 50 }}>{time}</span>
      <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {desc}
      </span>
    </div>
  )
}

function formatTime(iso: string): string {
  // iso is text from Postgres — parse defensively.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

function basename(path: string | null): string {
  if (!path) return ''
  return path.split('/').pop() ?? path
}

function describe(r: ActivityRow): string {
  if (r.operation === 'ingest') {
    if (r.skipped) {
      return `Skipped (no change) ${basename(r.source_path)}`
    }
    const parts = [`Ingested ${basename(r.source_path)}`]
    if (r.tag_count != null) parts.push(`${r.tag_count} tags`)
    if (r.duration_ms != null) parts.push(`${r.duration_ms}ms`)
    return parts.join(' · ')
  }
  if (r.operation === 'chat') {
    const parts = ['chat']
    if (r.model)        parts.push(`via ${r.model}`)
    if (r.cost_usd != null) parts.push(`$${r.cost_usd.toFixed(6)}`)
    if (r.duration_ms != null) parts.push(`${r.duration_ms}ms`)
    return parts.join(' · ')
  }
  // Generic fallback for future op types (compile, query, synthesize, capture, etc.)
  const parts = [r.operation]
  if (r.target_type) parts.push(r.target_type)
  if (r.duration_ms != null) parts.push(`${r.duration_ms}ms`)
  return parts.join(' · ')
}
