import { Card, SectionLabel } from './StatusStrip'

type Stats = {
  documents: number
  tags: number
  relationships: number
  wikiPages: number
  syntheses: number
  notesThisWeek: number
}

const CELLS: Array<{ key: keyof Stats; label: string }> = [
  { key: 'documents',     label: 'Documents'   },
  { key: 'wikiPages',     label: 'Wiki Pages'  },
  { key: 'relationships', label: 'Connections' },
  { key: 'notesThisWeek', label: 'Notes (week)' },
  { key: 'tags',          label: 'Tags'        },
]

export function StatsGrid({ stats, loading }: { stats: Stats | null; loading: boolean }): JSX.Element {
  return (
    <Card>
      <SectionLabel>Knowledge Base</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {CELLS.map((c) => (
          <Cell
            key={c.key}
            label={c.label}
            value={stats ? stats[c.key] : null}
            loading={loading && !stats}
          />
        ))}
      </div>
    </Card>
  )
}

function Cell({ label, value, loading }: { label: string; value: number | null; loading: boolean }): JSX.Element {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--bg-base)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)', lineHeight: 1.1 }}>
        {loading ? '—' : (value ?? 0).toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
    </div>
  )
}
