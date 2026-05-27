/**
 * The Foundry Review queue — three sections + the swappable Review panel.
 *
 *   • Pending Review (expanded by default) — items awaiting decision.
 *     Cards in this section may be replaced by an AdmittedConfirmation
 *     for ~10s after a successful Approve (Part 4 of the redesign).
 *   • Admitted (collapsed) — approved items kept for audit.
 *   • Rejected (collapsed) — rejected items, with a "Clear all" button
 *     (Part 5 of the redesign) and per-item Restore/Delete in the card.
 *
 * When `reviewingId` is set, the queue area is replaced entirely by the
 * full-width ReviewPanel. The Review panel's "← Back to queue" button
 * clears reviewingId and we render the queue again.
 *
 * Auto-poll: 3s tick while any item is at `pending` so triage completion
 * surfaces without a manual refresh. Auto-hide for AdmittedConfirmation
 * snapshots after 10s, via a separate tick that's quiet when the Map is
 * empty.
 */
import { useState, useEffect, useMemo } from 'react'
import { useFoundryStore } from '../../store/foundryStore'
import { FoundryItemCard } from './FoundryItemCard'
import { AdmittedConfirmation } from './AdmittedConfirmation'
import { ReviewPanel } from './ReviewPanel'

const POLL_INTERVAL_MS    = 3000
const ADMISSION_TIMEOUT_MS = 10000

interface ReviewQueueProps {
  // Bumped by IntakePanel when a capture lands so the queue refreshes.
  captureNonce: number
}

export function ReviewQueue({ captureNonce }: ReviewQueueProps): JSX.Element {
  const {
    items, loading, error, lastActionNote, clearActionNote,
    reviewingId, recentlyAdmitted, dismissAdmission,
    refresh, refreshThreads, deleteAllRejected, deleteAllAdmitted,
  } = useFoundryStore()

  const [admittedOpen, setAdmittedOpen]                 = useState(false)
  const [rejectedOpen, setRejectedOpen]                 = useState(false)
  const [clearingAllRejected, setClearingAllRejected]   = useState(false)
  const [clearingAllAdmitted, setClearingAllAdmitted]   = useState(false)

  // Mount: load items + thread targets.
  useEffect(() => {
    void refresh()
    void refreshThreads()
  }, [refresh, refreshThreads])

  // Refresh whenever a capture lands.
  useEffect(() => {
    if (captureNonce > 0) void refresh()
  }, [captureNonce, refresh])

  // Poll while any item is pending. setInterval cleared when nothing is pending.
  const hasPending = useMemo(() => items.some((i) => i.triageStatus === 'pending'), [items])
  useEffect(() => {
    if (!hasPending) return
    const tick = setInterval(() => { void refresh() }, POLL_INTERVAL_MS)
    return () => clearInterval(tick)
  }, [hasPending, refresh])

  // Auto-hide AdmittedConfirmation cards after 10s. We schedule one
  // timeout per snapshot id; on dismiss/refresh the Map mutates and any
  // already-fired timer becomes a no-op (dismissAdmission is idempotent).
  useEffect(() => {
    if (recentlyAdmitted.size === 0) return
    const timers: NodeJS.Timeout[] = []
    for (const [id, snap] of recentlyAdmitted) {
      const elapsed = Date.now() - snap.admittedAtMs
      const remaining = Math.max(0, ADMISSION_TIMEOUT_MS - elapsed)
      timers.push(setTimeout(() => dismissAdmission(id), remaining))
    }
    return () => { for (const t of timers) clearTimeout(t) }
  }, [recentlyAdmitted, dismissAdmission])

  // Auto-dismiss success action notes after 6s. Errors persist.
  useEffect(() => {
    if (lastActionNote?.ok) {
      const t = setTimeout(() => clearActionNote(), 6000)
      return () => clearTimeout(t)
    }
  }, [lastActionNote, clearActionNote])

  const { pending, admitted, rejected } = useMemo(() => {
    const p: typeof items = []
    const a: typeof items = []
    const r: typeof items = []
    for (const it of items) {
      if (it.triageStatus === 'approved') a.push(it)
      else if (it.triageStatus === 'rejected') r.push(it)
      else p.push(it)
    }
    return { pending: p, admitted: a, rejected: r }
  }, [items])

  // Resolve the reviewed item from the items list — render the panel
  // only when the id matches a real item (covers the race where a
  // refresh removes the item while the panel was open).
  const reviewingItem = useMemo(
    () => items.find((i) => i.id === reviewingId) ?? null,
    [items, reviewingId],
  )

  const handleClearAllRejected = async (): Promise<void> => {
    if (clearingAllRejected) return
    setClearingAllRejected(true)
    try {
      await deleteAllRejected()
    } finally {
      setClearingAllRejected(false)
    }
  }

  const handleClearAllAdmitted = async (): Promise<void> => {
    if (clearingAllAdmitted) return
    // Confirm because the user is wiping audit history — the disk docs
    // survive but the linkage in the Foundry queue is gone.
    const ok = window.confirm(
      'Clear all admitted items from this list?\n\n' +
      'The documents they created in your Codex are NOT affected — this only removes the queue history.',
    )
    if (!ok) return
    setClearingAllAdmitted(true)
    try {
      await deleteAllAdmitted()
    } finally {
      setClearingAllAdmitted(false)
    }
  }

  // ── ReviewPanel mode — replace the queue entirely while open ────────
  if (reviewingItem) {
    return <ReviewPanel item={reviewingItem} />
  }

  // ── Queue mode ─────────────────────────────────────────────────────
  return (
    <section style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header row: counts + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{
          fontSize: 14, fontWeight: 700, color: 'var(--text-2)', margin: 0,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          Review queue
        </h2>
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
          {pending.length} pending · {admitted.length} admitted · {rejected.length} rejected
        </span>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: '1px solid var(--border-1)',
            color: 'var(--text-3)',
            padding: '3px 10px',
            borderRadius: 5,
            fontSize: 11,
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
          title="Refresh queue"
        >
          {loading ? '↻ …' : '↻ Refresh'}
        </button>
      </div>

      {/* Inline action result note (failures + bulk-clear success) */}
      {lastActionNote && (
        <div
          style={{
            fontSize: 12,
            color: lastActionNote.ok ? 'var(--accent-green)' : '#ff2d78',
            padding: '6px 10px',
            background: lastActionNote.ok ? 'rgba(0, 200, 80, 0.06)' : 'rgba(255, 45, 120, 0.06)',
            border: `1px solid ${lastActionNote.ok ? 'var(--accent-green)' : '#ff2d78'}`,
            borderRadius: 5,
          }}
        >
          {lastActionNote.message}
        </div>
      )}

      {/* Inline load-error */}
      {error && (
        <div
          style={{
            fontSize: 12, color: '#ff2d78',
            padding: '6px 10px',
            background: 'rgba(255, 45, 120, 0.06)',
            border: '1px solid #ff2d78',
            borderRadius: 5,
          }}
        >
          Load failed: {error}
        </div>
      )}

      {/* ── Pending Review ─────────────────────────────────────────────── */}
      <div>
        <h3 style={sectionHeadingStyle}>Pending Review</h3>
        {pending.length === 0 && recentlyAdmitted.size === 0 ? (
          <div style={emptyStyle}>
            Nothing waiting. Capture content from the intake panel above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Just-admitted snapshots (Part 4) — float to the top of the
                pending list briefly so the user sees the confirmation
                where the item used to be. */}
            {Array.from(recentlyAdmitted.entries()).map(([id, snap]) => (
              <AdmittedConfirmation key={`admitted-${id}`} itemId={id} snapshot={snap} />
            ))}
            {pending.map((item) => (
              <FoundryItemCard key={item.id} item={item} variant="pending" />
            ))}
          </div>
        )}
      </div>

      {/* ── Admitted (collapsible + Clear all) ─────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => setAdmittedOpen((o) => !o)}
            style={{
              background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--text-3)', fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {admittedOpen ? '▾' : '▸'} Admitted
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-4)', marginLeft: 8 }}>
              ({admitted.length})
            </span>
          </button>
          {admitted.length > 0 && (
            <button
              onClick={() => void handleClearAllAdmitted()}
              disabled={clearingAllAdmitted}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: '1px solid var(--border-1)',
                color: 'var(--text-3)',
                padding: '3px 10px',
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 600,
                cursor: clearingAllAdmitted ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
              title="Removes admitted items from this list. The documents they created in your Codex are not affected."
            >
              {clearingAllAdmitted ? 'Clearing…' : 'Clear all admitted'}
            </button>
          )}
        </div>
        {admittedOpen && (
          admitted.length === 0
            ? <div style={emptyStyle}>Approved items will land here.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {admitted.map((item) => (
                  <FoundryItemCard key={item.id} item={item} variant="admitted" />
                ))}
              </div>
            )
        )}
      </div>

      {/* ── Rejected (collapsible + Clear all) ─────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => setRejectedOpen((o) => !o)}
            style={{
              background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--text-3)', fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {rejectedOpen ? '▾' : '▸'} Rejected
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-4)', marginLeft: 8 }}>
              ({rejected.length})
            </span>
          </button>
          {rejected.length > 0 && (
            <button
              onClick={() => void handleClearAllRejected()}
              disabled={clearingAllRejected}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: '1px solid #ff2d78',
                color: '#ff2d78',
                padding: '3px 10px',
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 600,
                cursor: clearingAllRejected ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
              title="Delete all rejected items from the database"
            >
              {clearingAllRejected ? 'Clearing…' : 'Clear all rejected'}
            </button>
          )}
        </div>
        {rejectedOpen && (
          rejected.length === 0
            ? <div style={emptyStyle}>Rejected items will land here.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rejected.map((item) => (
                  <FoundryItemCard key={item.id} item={item} variant="rejected" />
                ))}
              </div>
            )
        )}
      </div>
    </section>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-3)',
  margin: '0 0 10px 0',
}

const emptyStyle: React.CSSProperties = {
  padding: 14,
  border: '1px dashed var(--border-subtle)',
  borderRadius: 6,
  textAlign: 'center',
  color: 'var(--text-4)',
  fontSize: 12,
}

// Session 9 audit: `CollapsibleSection` had no JSX callers — removed.
// The Pending / Approved / Rejected sections inline their own headers.
