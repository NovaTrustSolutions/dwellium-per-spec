import { Card, SectionLabel } from './StatusStrip'

export function PendingActions(): JSX.Element {
  return (
    <Card>
      <SectionLabel>Pending Actions</SectionLabel>
      <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
        Nothing pending. Re-ingest queue and wiki recompile counts populate here in
        Phase 3b.
      </div>
    </Card>
  )
}
