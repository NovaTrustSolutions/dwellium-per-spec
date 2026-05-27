/**
 * The full-width Review panel — replaces the queue area while open.
 *
 * Layout:
 *   Header bar: title + URL + "← Back to queue"
 *   Two-column grid:
 *     LEFT (1fr)  — content rendered as MARKDOWN (cleaned by default,
 *                   toggle to original)
 *     RIGHT (260px) — triage sidebar: quality bar, signal assessment,
 *                   proposed Domain, tag chips
 *   Footer actions row:
 *     [Approve this version] [Edit before approving] [Reject]
 *
 * State machine inside the panel:
 *   - 'read'        → markdown rendered; three actions visible
 *   - 'approve'     → ApproveForm visible (above actions); reading layout dimmed
 *   - 'edit'        → full-height textarea visible instead of markdown;
 *                     then ApproveForm appears below textarea
 *
 * Approve always goes through the ApproveForm — no more "approve as-is"
 * skip-the-form path. This makes the filename + thread choice explicit
 * for URL captures too.
 */
import { useState, useEffect } from 'react'
import { useFoundryStore, type FoundryItem } from '../../store/foundryStore'
import { MarkdownView } from './MarkdownView'
import { ApproveForm } from './ApproveForm'

interface ReviewPanelProps {
  item: FoundryItem
}

const HEADER_BAR: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '12px 16px',
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: '8px 8px 0 0',
  borderBottom: 'none',
}

const BODY_CONTAINER: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 260px',
  gap: 0,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: '0',
}

const SIDEBAR_STYLE: React.CSSProperties = {
  padding: 16,
  borderLeft: '1px solid var(--border-1)',
  background: 'var(--bg-base)',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  fontSize: 12,
  color: 'var(--text-2)',
}

const FOOTER_BAR: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  padding: 14,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderTop: 'none',
  borderRadius: '0 0 8px 8px',
  flexWrap: 'wrap',
}

const BTN_PRIMARY: React.CSSProperties = {
  background: 'var(--accent-green)',
  border: 'none',
  color: 'var(--bg-base)',
  padding: '8px 16px',
  borderRadius: 5,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const BTN_SECONDARY: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-1)',
  color: 'var(--text-1)',
  padding: '8px 14px',
  borderRadius: 5,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const BTN_REJECT: React.CSSProperties = {
  ...BTN_SECONDARY,
  borderColor: '#ff2d78',
  color: '#ff2d78',
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

export function ReviewPanel({ item }: ReviewPanelProps): JSX.Element {
  const {
    threads, approvingIds, rejectingIds,
    approve, reject, setReviewingId,
  } = useFoundryStore()

  const isApproving = approvingIds.has(item.id)
  const isRejecting = rejectingIds.has(item.id)
  const isBusy = isApproving || isRejecting

  // Reading state — which version is displayed in the markdown pane.
  // Convert-mode rows are preserved as-captured, so the cleaned/original
  // toggle is irrelevant (cleanedContent will be null by design).
  const hasCleaned = item.triageMode === 'extract'
    && !!(item.cleanedContent && item.cleanedContent.trim().length > 0)
  const [showOriginal, setShowOriginal] = useState(false)
  const displayContent = hasCleaned && !showOriginal
    ? (item.cleanedContent as string)
    : item.rawContent
  // Adopt content = what Approve will write by default.
  const adoptContent = hasCleaned ? (item.cleanedContent as string) : item.rawContent

  // Panel state machine.
  const [mode, setMode] = useState<'read' | 'approve' | 'edit'>('read')
  const [filename, setFilename] = useState(() => deriveFilename(item))
  const [targetThread, setTargetThread] = useState<string>('')
  const [editedContent, setEditedContent] = useState(adoptContent)

  // If triage completes while panel is open, reseed the edit textarea
  // (unless the user has already typed). Same pattern as the previous
  // card — see the touched-ref trick.
  useEffect(() => {
    if (mode === 'read' && hasCleaned) {
      // Only refresh editedContent while in read mode (user hasn't opened
      // the editor yet). Switching into 'edit' freezes the seed.
      setEditedContent(adoptContent)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.cleanedContent])

  // Resolve the targetThread display name (for the success-card snapshot).
  const targetThreadName = targetThread
    ? threads.find((t) => t.threadPath === targetThread)
      ? `${threads.find((t) => t.threadPath === targetThread)?.projectName} / ${threads.find((t) => t.threadPath === targetThread)?.threadName}`
      : null
    : null

  const handleApprove = async (): Promise<void> => {
    // The adopted content is whichever version Approve will write — the
    // edited version when we got here via Edit mode, otherwise the
    // adoptContent (cleaned or raw).
    const content = mode === 'edit' ? editedContent : adoptContent
    await approve({
      id: item.id,
      content,
      filename,
      targetThreadPath: targetThread || null,
      targetThreadName,
    })
    // Store auto-clears reviewingId on success; panel unmounts.
  }

  const handleReject = async (): Promise<void> => {
    await reject(item.id)
    // Store auto-clears reviewingId on success.
  }

  const title = item.sourceFilename ?? item.sourceUrl ?? '(untitled)'

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: 18,
      }}
    >
      {/* Header */}
      <div style={HEADER_BAR}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div
            style={{
              fontSize: 14, fontWeight: 700, color: 'var(--text-1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={title}
          >
            {title}
          </div>
          {item.sourceUrl && item.sourceUrl !== title && (
            <a
              href={item.sourceUrl}
              onClick={(e) => { e.preventDefault(); window.open(item.sourceUrl ?? '', '_blank', 'noopener,noreferrer') }}
              style={{
                fontSize: 11,
                color: 'var(--accent-cyan)',
                textDecoration: 'underline',
                display: 'inline-block',
                marginTop: 2,
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={item.sourceUrl}
            >
              {item.sourceUrl}
            </a>
          )}
        </div>
        <button onClick={() => setReviewingId(null)} disabled={isBusy} style={BTN_SECONDARY}>
          ← Back to queue
        </button>
      </div>

      {/* Body: markdown + triage sidebar */}
      <div style={BODY_CONTAINER}>
        <div
          style={{
            padding: 20,
            minHeight: 400,
            maxHeight: 'calc(100vh - 360px)',
            overflowY: 'auto',
            background: 'var(--bg-2)',
          }}
        >
          {/* Reading-mode toggle when both versions exist */}
          {hasCleaned && mode === 'read' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: showOriginal ? 'rgba(255, 165, 0, 0.10)' : 'rgba(0, 200, 80, 0.10)',
                  color: showOriginal ? 'var(--accent-orange)' : 'var(--accent-green)',
                  fontWeight: 700,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {showOriginal ? 'original' : 'cleaned by triage'}
              </span>
              <button
                onClick={() => setShowOriginal((v) => !v)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  fontSize: 11,
                  padding: 0,
                  fontFamily: 'inherit',
                  textDecoration: 'underline dotted',
                }}
                title={showOriginal
                  ? 'Switch back to the triage-cleaned version (what Approve will write)'
                  : 'Switch to the raw scrape to compare'}
              >
                {showOriginal ? 'show cleaned' : 'show original'}
              </button>
              <span style={{ fontSize: 10, color: 'var(--text-4)' }}>
                ({displayContent.length.toLocaleString()} chars)
              </span>
            </div>
          )}

          {/* Markdown rendering OR edit textarea */}
          {mode === 'edit' ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              disabled={isBusy}
              style={{
                width: '100%',
                minHeight: 480,
                padding: 12,
                background: 'var(--bg-base)',
                border: '1px solid var(--border-1)',
                borderRadius: 6,
                color: 'var(--text-1)',
                fontSize: 13,
                lineHeight: 1.55,
                fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace',
                resize: 'vertical',
              }}
            />
          ) : (
            <MarkdownView content={displayContent} />
          )}
        </div>

        {/* Triage sidebar */}
        <aside style={SIDEBAR_STYLE}>
          <TriageSidebar item={item} />
        </aside>
      </div>

      {/* Footer */}
      <div style={FOOTER_BAR}>
        {mode === 'read' && (
          <>
            <button onClick={() => setMode('approve')} disabled={isBusy} style={BTN_PRIMARY}>
              Approve this version
            </button>
            <button onClick={() => setMode('edit')} disabled={isBusy} style={BTN_SECONDARY}>
              Edit before approving
            </button>
            <button onClick={() => void handleReject()} disabled={isBusy} style={BTN_REJECT}>
              {isRejecting ? 'Rejecting…' : 'Reject'}
            </button>
          </>
        )}
        {mode === 'edit' && (
          <>
            <button onClick={() => setMode('approve')} disabled={isBusy} style={BTN_PRIMARY}>
              Approve edited version
            </button>
            <button onClick={() => setMode('read')} disabled={isBusy} style={BTN_SECONDARY}>
              Cancel edit
            </button>
          </>
        )}
        {mode === 'approve' && (
          <div style={{ flex: '1 1 100%' }}>
            <ApproveForm
              filename={filename}
              setFilename={setFilename}
              targetThread={targetThread}
              setTargetThread={setTargetThread}
              threads={threads}
              busy={isApproving}
              onSubmit={handleApprove}
              onCancel={() => setMode('read')}
              submitLabel="Confirm Approve"
            />
          </div>
        )}
      </div>
    </section>
  )
}

// ── Triage sidebar — same content as the queue-card triage block, repositioned ──

function TriageSidebar({ item }: { item: FoundryItem }): JSX.Element {
  if (item.triageStatus === 'pending') {
    return (
      <div style={{ fontStyle: 'italic', color: 'var(--text-4)' }}>
        Triage running… (Gemini Flash)
      </div>
    )
  }

  const q = item.qualityScore ?? 0
  const qPct = Math.round(q * 100)
  const qColor = q > 0.65 ? 'var(--accent-green)' : q >= 0.35 ? 'var(--accent-orange)' : '#ff2d78'

  return (
    <>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Quality</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              flex: 1, height: 6, borderRadius: 3,
              background: 'var(--bg-2)', border: '1px solid var(--border-1)', overflow: 'hidden',
            }}
          >
            <div style={{ width: `${qPct}%`, height: '100%', background: qColor }} />
          </div>
          <span style={{ fontSize: 11, color: qColor, fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' }}>
            {qPct}%
          </span>
        </div>
      </div>

      {item.signalAssessment && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Signal</div>
          <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.45 }}>{item.signalAssessment}</div>
        </div>
      )}

      {item.proposedDomain && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Proposed Domain</div>
          <div style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}>{item.proposedDomain}</div>
        </div>
      )}

      {item.proposedTags && item.proposedTags.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Tags</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {item.proposedTags.map((t) => (
              <span
                key={t}
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-1)',
                  color: 'var(--text-2)',
                }}
              >
                #{t}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
