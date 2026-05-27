/**
 * Foundry queue card — compact metadata + triage summary + three actions.
 *
 * Session 4 UX redesign: the card no longer renders an inline content
 * preview or an inline edit textarea. Both moved to the full-width
 * ReviewPanel (triggered by the [Review] button). The card keeps:
 *   • Source chip + title/URL
 *   • Triage chip (CLEANED BY TRIAGE / PENDING / TRIAGED)
 *   • Quality bar + signal sentence + proposed tags
 *   • Three buttons: [Review] [Quick Approve] [Reject]
 *
 * Quick Approve expands an inline ApproveForm below the action row so
 * Andy gets the filename + thread choice prompt even from the queue
 * (Part 3 of the redesign — "always prompt for filename + thread").
 *
 * Admitted/rejected cards skip the action buttons entirely (the queue
 * splits items into sections; this component still renders something
 * useful for the admitted/rejected lists with a Restore option for
 * rejected items per Part 5).
 */
import { useState } from 'react'
import { useFoundryStore, type FoundryItem } from '../../store/foundryStore'
import { ApproveForm } from './ApproveForm'

interface FoundryItemCardProps {
  item: FoundryItem
  // Suppresses the action buttons when the parent section is admitted/
  // rejected (those cards are read-only summaries).
  variant?: 'pending' | 'admitted' | 'rejected'
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: 8,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const SOURCE_CHIP: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  background: 'var(--bg-base)',
  border: '1px solid var(--border-1)',
  color: 'var(--text-3)',
}

const TAG_CHIP: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  background: 'var(--bg-base)',
  border: '1px solid var(--border-1)',
  color: 'var(--text-2)',
}

const BTN_BASE: React.CSSProperties = {
  border: '1px solid var(--border-1)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  padding: '5px 12px',
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const BTN_REVIEW: React.CSSProperties = {
  ...BTN_BASE,
  background: 'var(--accent-cyan)',
  borderColor: 'var(--accent-cyan)',
  color: 'var(--bg-base)',
}

const BTN_APPROVE: React.CSSProperties = {
  ...BTN_BASE,
  background: 'var(--accent-green)',
  borderColor: 'var(--accent-green)',
  color: 'var(--bg-base)',
}

const BTN_REJECT: React.CSSProperties = {
  ...BTN_BASE,
  background: 'transparent',
  borderColor: '#ff2d78',
  color: '#ff2d78',
}

function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function deriveFilename(item: FoundryItem): string {
  const raw = item.sourceFilename ?? item.sourceUrl ?? item.id
  const slug = raw
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9 \-_.]/gi, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '')
  return slug || 'untitled'
}

export function FoundryItemCard({ item, variant = 'pending' }: FoundryItemCardProps): JSX.Element {
  const {
    threads, approvingIds, rejectingIds, restoringIds, deletingIds,
    approve, reject, restore, deleteRejected, setReviewingId,
  } = useFoundryStore()

  const [showApprove, setShowApprove] = useState(false)
  const [filename, setFilename] = useState(() => deriveFilename(item))
  const [targetThread, setTargetThread] = useState<string>('')

  const isApproving = approvingIds.has(item.id)
  const isRejecting = rejectingIds.has(item.id)
  const isRestoring = restoringIds.has(item.id)
  const isDeleting  = deletingIds.has(item.id)
  const isBusy = isApproving || isRejecting || isRestoring || isDeleting

  const handleApprove = async (): Promise<void> => {
    const adoptContent = item.cleanedContent && item.cleanedContent.trim().length > 0
      ? item.cleanedContent
      : item.rawContent
    const t = threads.find((x) => x.threadPath === targetThread)
    await approve({
      id: item.id,
      content: adoptContent,
      filename,
      targetThreadPath: targetThread || null,
      targetThreadName: t ? `${t.projectName} / ${t.threadName}` : null,
    })
  }

  const triageChip = (() => {
    if (item.triageStatus === 'pending') return { label: 'TRIAGE PENDING', bg: 'rgba(255, 165, 0, 0.10)', fg: 'var(--accent-orange)' }
    if (item.triageMode === 'convert') {
      // Convert-mode rows skip cleaning by design — chip honestly says
      // the content is preserved as-captured.
      return { label: 'PRESERVED', bg: 'rgba(120, 200, 255, 0.10)', fg: 'var(--accent-cyan)' }
    }
    if (item.cleanedContent && item.cleanedContent.trim().length > 0) {
      return { label: 'CLEANED BY TRIAGE', bg: 'rgba(0, 200, 80, 0.10)', fg: 'var(--accent-green)' }
    }
    return { label: 'TRIAGED', bg: 'rgba(120, 200, 255, 0.10)', fg: 'var(--accent-cyan)' }
  })()

  const q = item.qualityScore ?? 0
  const qPct = Math.round(q * 100)
  const qColor = q > 0.65 ? 'var(--accent-green)' : q >= 0.35 ? 'var(--accent-orange)' : '#ff2d78'

  return (
    <article style={CARD_STYLE}>
      {/* Header: source chip + title + triage chip + timestamp */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={SOURCE_CHIP}>{item.sourceType}</span>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div
            style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text-1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={item.sourceUrl ?? item.sourceFilename ?? '(untitled)'}
          >
            {item.sourceFilename ?? item.sourceUrl ?? '(untitled)'}
          </div>
          {item.sourceUrl && item.sourceFilename && (
            <div
              style={{
                fontSize: 11, color: 'var(--text-4)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              title={item.sourceUrl}
            >
              {item.sourceUrl}
            </div>
          )}
        </div>
        {variant === 'pending' && (
          <span
            style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              background: triageChip.bg, color: triageChip.fg,
            }}
          >
            {triageChip.label}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-4)' }} title={`captured ${fmtTs(item.createdAt)}`}>
          {fmtTs(item.createdAt)}
        </span>
      </header>

      {/* Triage summary row — quality bar + signal one-liner */}
      {variant === 'pending' && item.triageStatus !== 'pending' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 180 }}>
            <span style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quality</span>
            <div
              style={{
                width: 100, height: 6, borderRadius: 3,
                background: 'var(--bg-base)', border: '1px solid var(--border-1)', overflow: 'hidden',
              }}
            >
              <div style={{ width: `${qPct}%`, height: '100%', background: qColor }} />
            </div>
            <span style={{ fontSize: 11, color: qColor, fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>
              {qPct}%
            </span>
          </div>
          {item.signalAssessment && (
            <div
              style={{ fontSize: 12, color: 'var(--text-2)', flex: '1 1 240px', minWidth: 0 }}
              title={item.signalAssessment}
            >
              {item.signalAssessment}
            </div>
          )}
        </div>
      )}

      {/* Tag chips + proposed domain */}
      {variant === 'pending' && item.proposedTags && item.proposedTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.proposedTags.map((t) => (
            <span key={t} style={TAG_CHIP}>#{t}</span>
          ))}
          {item.proposedDomain && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>
              → <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{item.proposedDomain}</span>
            </span>
          )}
        </div>
      )}

      {/* Session 7 — large-doc hint for URL captures that came in via extract.
          Mirrors the IntakePanel hint but lives here because the size check
          for URL content happens after Firecrawl returns (the intake panel
          doesn't see the scraped body). Threshold uses raw_content.length —
          slightly overstates post-cookie-strip length, which biases toward
          warning rather than silent failure. Static per card (the triage_mode
          is locked into the row at capture time, so there's nothing to flip). */}
      {variant === 'pending'
        && item.sourceType === 'url'
        && item.triageMode === 'extract'
        && item.rawContent.length > 20_000 && (
        <div style={{ fontSize: 11, color: 'var(--accent-orange)', lineHeight: 1.4 }}>
          ⚠ Large document — Convert only is recommended. Extract mode may time out on documents this size.
        </div>
      )}

      {/* Pending-mode actions */}
      {variant === 'pending' && !showApprove && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setReviewingId(item.id)}
            disabled={isBusy}
            style={isBusy ? { ...BTN_REVIEW, opacity: 0.5, cursor: 'not-allowed' } : BTN_REVIEW}
          >
            Review
          </button>
          <button
            onClick={() => setShowApprove(true)}
            disabled={isBusy}
            style={isBusy ? { ...BTN_APPROVE, opacity: 0.5, cursor: 'not-allowed' } : BTN_APPROVE}
          >
            {isApproving ? 'Approving…' : 'Quick Approve'}
          </button>
          <button
            onClick={() => void reject(item.id)}
            disabled={isBusy}
            style={isBusy ? { ...BTN_REJECT, opacity: 0.5, cursor: 'not-allowed' } : BTN_REJECT}
          >
            {isRejecting ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      )}

      {/* Quick-Approve form */}
      {variant === 'pending' && showApprove && (
        <ApproveForm
          filename={filename}
          setFilename={setFilename}
          targetThread={targetThread}
          setTargetThread={setTargetThread}
          threads={threads}
          busy={isApproving}
          onSubmit={handleApprove}
          onCancel={() => setShowApprove(false)}
          submitLabel="Confirm Approve"
        />
      )}

      {/* Admitted metadata (read-only) */}
      {variant === 'admitted' && item.admittedAt && (
        <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
          Admitted {fmtTs(item.admittedAt)}{item.targetThread ? ` → thread: ${item.targetThread}` : ' → _Codex/References/'}
        </div>
      )}

      {/* Rejected metadata + Restore / Delete actions */}
      {variant === 'rejected' && (
        <>
          {item.reviewedAt && (
            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
              Rejected {fmtTs(item.reviewedAt)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => void restore(item.id)}
              disabled={isBusy}
              style={isBusy ? { ...BTN_BASE, opacity: 0.5, cursor: 'not-allowed' } : BTN_BASE}
              title="Restore to pending review"
            >
              {isRestoring ? 'Restoring…' : 'Restore to pending'}
            </button>
            <button
              onClick={() => void deleteRejected(item.id)}
              disabled={isBusy}
              style={isBusy ? { ...BTN_REJECT, opacity: 0.5, cursor: 'not-allowed' } : BTN_REJECT}
              title="Delete this rejected item permanently"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </>
      )}
    </article>
  )
}
