import { Card, SectionLabel } from './StatusStrip'

export function RecentInsight(): JSX.Element {
  return (
    <Card>
      <SectionLabel>Recent Insight</SectionLabel>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: 1.5 }}>
        Honcho cross-thread dream surfacing arrives in Phase 3c. This card will show
        the most recent overnight synthesis, with capture-to-Library and pull-into-thread
        actions.
      </div>
    </Card>
  )
}
