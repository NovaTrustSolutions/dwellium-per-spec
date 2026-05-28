import { useEffect, useRef, useState } from 'react'

interface Props {
  open: boolean
  defaultName: string
  busy: boolean
  onConfirm: (name: string, description: string) => void
  onCancel: () => void
}

/**
 * P7-B: Branch confirmation modal. Pre-fills the new thread name (caller
 * computes "[ThreadName]-2" or next-N suffix) and shows an optional
 * description field. The actual thread-branching IPC call is owned by the
 * parent (ChatPane) — this component only collects input.
 */
export function BranchModal({ open, defaultName, busy, onConfirm, onCancel }: Props): JSX.Element | null {
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset whenever the modal opens with a new default. Focus + select-all so
  // the user can immediately edit the suggested name.
  useEffect(() => {
    if (!open) return
    setName(defaultName)
    setDescription('')
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open, defaultName])

  // Esc closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const trimmedName = name.trim()
  const canConfirm = !!trimmedName && !busy

  const submit = (): void => {
    if (!canConfirm) return
    onConfirm(trimmedName, description.trim())
  }

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 440,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
          padding: 18,
          fontFamily: 'inherit',
          color: 'var(--text-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0a84ff' }}>
            ⌥ Branch Thread
          </span>
          <button
            onClick={onCancel}
            title="Close (Esc)"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 16, lineHeight: 1, padding: 0 }}
          >×</button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 14px' }}>
          Creates a new thread with the current thread's Honcho summary and last few messages
          inherited as opening context. The original thread stays untouched.
        </p>

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          New thread name
        </label>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canConfirm) { e.preventDefault(); submit() }
          }}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--bg-3)', border: '1px solid var(--border-1)',
            borderRadius: 6, padding: '8px 10px',
            color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
            marginBottom: 12,
          }}
          onFocus={(e) => { e.target.style.borderColor = '#0a84ff' }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--border-1)' }}
        />

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Description <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-dim)' }}>(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What's this branch for?"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--bg-3)', border: '1px solid var(--border-1)',
            borderRadius: 6, padding: '8px 10px',
            color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
            resize: 'vertical', marginBottom: 16,
          }}
          onFocus={(e) => { e.target.style.borderColor = '#0a84ff' }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--border-1)' }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
              borderRadius: 6, padding: '7px 14px',
              fontSize: 12, fontFamily: 'inherit',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canConfirm}
            style={{
              background: canConfirm ? '#0a84ff' : 'var(--bg-3)',
              border: 'none',
              color: canConfirm ? '#ffffff' : 'var(--text-dim)',
              borderRadius: 6, padding: '7px 18px',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              boxShadow: canConfirm ? '0 0 12px rgba(10,132,255,0.45)' : 'none',
              transition: 'background 120ms, box-shadow 120ms',
            }}
          >
            {busy ? 'Branching…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
