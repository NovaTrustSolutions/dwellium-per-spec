/**
 * Foundry card — architecture-v4 Part 6 surface inside the Hive (Session 4).
 *
 * Surfaces:
 *   • Pending review count    — triage_status IN ('pending', 'triaged') awaiting Andy's decision
 *   • Last captured timestamp — newest foundry_items.created_at
 *   • Historical counts       — admitted + rejected (sub-line, lighter)
 *   • → Foundry deep link     — switches activeTab to 'foundry'
 *
 * Status logic:
 *   • pending > 0           → warning (you have items waiting)
 *   • pending == 0 && total → idle    (everything reviewed)
 *   • total == 0            → idle    (no captures yet)
 */
import { useHiveStore } from '../../store/hiveStore'
import { useSessionStore } from '../../store/sessionStore'
import { CardShell } from './CardShell'

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diff = Math.max(0, now - then)
    const min = Math.floor(diff / 60_000)
    if (min < 1)  return 'just now'
    if (min < 60) return `${min} min ago`
    const hr = Math.floor(min / 60)
    if (hr < 24)  return `${hr}h ago`
    const days = Math.floor(hr / 24)
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return iso
  }
}

export function FoundryCard(): JSX.Element {
  const { foundry, foundryLoading, refreshFoundry } = useHiveStore()
  const setActiveTab = useSessionStore((s) => s.setActiveTab)

  const pending = foundry?.pendingCount ?? 0
  const total   = foundry?.totalCount   ?? 0
  const status: 'healthy' | 'warning' | 'idle' =
    pending > 0 ? 'warning' :
    total === 0 ? 'idle' :
    'healthy'

  const statusMessage = foundry
    ? (pending > 0
        ? `${pending} pending review`
        : total > 0
          ? 'all reviewed'
          : 'nothing captured yet')
    : undefined

  return (
    <CardShell
      title="Foundry"
      accentColor="var(--accent-orange)"
      status={status}
      statusMessage={statusMessage}
      rightSlot={
        <button
          onClick={() => void refreshFoundry()}
          disabled={foundryLoading}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text-4)',
            cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', padding: 0,
          }}
          title="Refresh Foundry stats"
        >
          {foundryLoading ? '↻ …' : '↻'}
        </button>
      }
    >
      {/* Pending count — the primary metric, biggest text in the card. */}
      <div>
        <div style={{ fontSize: 32, fontWeight: 700, color: pending > 0 ? 'var(--accent-orange)' : 'var(--text-2)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {foundry === null ? '–' : pending}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          pending review
        </div>
      </div>

      {/* Secondary metadata — last capture + historical totals */}
      <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div>
          Last captured: <span style={{ color: 'var(--text-2)' }}>{fmtRelative(foundry?.lastCapturedAt ?? null)}</span>
        </div>
        {foundry && (
          <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
            {foundry.admittedCount} admitted · {foundry.rejectedCount} rejected · {foundry.totalCount} total
          </div>
        )}
      </div>

      {/* Deep link — bottom of card, pushed down by margin-top: auto */}
      <div style={{ marginTop: 'auto' }}>
        <button
          onClick={() => setActiveTab('foundry')}
          style={{
            width: '100%',
            background: 'transparent',
            border: '1px solid var(--border-1)',
            borderRadius: 6,
            padding: '6px 10px',
            color: 'var(--accent-orange)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          → Foundry
        </button>
      </div>
    </CardShell>
  )
}
