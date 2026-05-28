/**
 * Inline Approve form — filename + optional thread dropdown + confirm/cancel.
 *
 * Extracted from FoundryItemCard so it can be reused from:
 *   • Quick Approve on a queue card (form expands below the buttons)
 *   • The Review panel's "Approve this version" action
 *   • The Edit-then-Approve flow after the textarea edits land
 *
 * Filename input enforces a 60-char visible cap (matches sanitizeFilename
 * server-side) and shows a remaining-chars hint when over 45.
 */
import { useMemo } from 'react'

export interface ApproveFormProps {
  filename: string
  setFilename: (v: string) => void
  targetThread: string                     // '' = no thread (write to _Codex/References)
  setTargetThread: (v: string) => void
  threads: Array<{ projectName: string; threadName: string; threadPath: string }>
  busy: boolean
  submitLabel: string
  onSubmit: () => void | Promise<void>
  onCancel: () => void
  // When the form is the *primary* surface (no Cancel makes sense), pass
  // false. Default true.
  showCancel?: boolean
}

const FORM_CONTAINER: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  background: 'var(--bg-base)',
  border: '1px solid var(--accent-cyan)',
  borderRadius: 6,
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-3)',
  minWidth: 110,
  fontWeight: 600,
}

const FIELD_STYLE: React.CSSProperties = {
  flex: '1 1 200px',
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: 5,
  padding: '6px 10px',
  color: 'var(--text-1)',
  fontSize: 12,
  fontFamily: 'inherit',
}

const APPROVE_BUTTON: React.CSSProperties = {
  background: 'var(--accent-green)',
  borderColor: 'var(--accent-green)',
  color: 'var(--bg-base)',
  border: 'none',
  padding: '7px 16px',
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const CANCEL_BUTTON: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-1)',
  color: 'var(--text-2)',
  padding: '7px 14px',
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

export function ApproveForm({
  filename, setFilename,
  targetThread, setTargetThread,
  threads, busy, submitLabel,
  onSubmit, onCancel,
  showCancel = true,
}: ApproveFormProps): JSX.Element {
  const canSubmit = !busy && filename.trim().length > 0
  // Enforce the 60-char cap as the user types — paste of a longer string
  // is silently truncated so the displayed value matches what'll hit disk.
  const onFilenameChange = (v: string): void => setFilename(v.slice(0, 60))
  const remainingHint = useMemo(() => {
    const remaining = 60 - filename.length
    return remaining <= 15 ? `${remaining} chars left` : null
  }, [filename])

  return (
    <div style={FORM_CONTAINER}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={LABEL_STYLE}>Assign to thread</label>
        <select
          value={targetThread}
          onChange={(e) => setTargetThread(e.target.value)}
          disabled={busy}
          style={FIELD_STYLE}
        >
          <option value="">(None — write to _Codex/References/)</option>
          {threads.map((t) => (
            <option key={t.threadPath} value={t.threadPath}>
              {t.projectName} / {t.threadName}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={LABEL_STYLE}>Filename</label>
        <input
          type="text"
          value={filename}
          onChange={(e) => onFilenameChange(e.target.value)}
          disabled={busy}
          placeholder="my-note (.md added on save)"
          maxLength={60}
          style={FIELD_STYLE}
        />
        {remainingHint && (
          <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{remainingHint}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <button
          onClick={() => void onSubmit()}
          disabled={!canSubmit}
          style={canSubmit ? APPROVE_BUTTON : { ...APPROVE_BUTTON, opacity: 0.5, cursor: 'not-allowed' }}
        >
          {busy ? 'Approving…' : submitLabel}
        </button>
        {showCancel && (
          <button onClick={onCancel} disabled={busy} style={CANCEL_BUTTON}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
