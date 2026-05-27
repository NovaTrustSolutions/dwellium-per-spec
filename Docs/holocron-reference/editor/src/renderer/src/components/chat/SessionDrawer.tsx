import { useEffect, JSX } from 'react'
import { MemoryPanel } from './MemoryPanel'
import { IconClose } from '../Icons'

/**
 * Session-scoped slide-out drawer — opens from the right edge of the chat
 * sub-header behind a single ⚙ icon. Consolidates the chat-pane's prior
 * scattered Memory ▸ toggle + ⟲ Reset button + inline Working Memory panel
 * into two labeled sections.
 *
 * Sections, top to bottom:
 *   1. **Session** — Working Memory readout (Active session / Memory active /
 *      Coherence) + the ⟲ Reset Context button.
 *   2. **Memory**  — mounts the existing `MemoryPanel.tsx` (408 LOC) as a
 *      section (reuse, do NOT rewrite per HANDOFF_v20 §3.2).
 *
 * The drawer USED to host a third **Agent** section (provider / model
 * picker). That section was removed in Part C rev 4 — `ModelSelector` is
 * now mounted permanently in the chat sub-header so model switching is
 * one-tap without a drawer round-trip.
 *
 * Rendered as a fixed-width right-edge panel that slides in over the chat;
 * dismiss on outside click (overlay) or the ✕ button. Does not push content.
 *
 * Working Memory derived values come in as props rather than recomputed here
 * because ChatPane already owns the source state (chatHistory, sessionStartTs,
 * memoryHasSummaries, honchoCtx) and re-deriving in two places would drift.
 */

export interface SessionDrawerProps {
  open: boolean
  onClose: () => void
  /** Working Memory display values, hoisted from ChatPane. */
  sessionDurationLabel: string
  exchangeCount: number
  coherenceLabel: 'Fresh' | 'Extended' | 'Long session'
  coherenceFull: string
  memoryActiveLabel: string
  /** Reset Context handler — ChatPane owns the side-effects + confirm dialog. */
  onResetContext: () => void
  /** Disable Reset (sandbox / honcho disabled / no thread) — drawer just dims it. */
  resetEnabled: boolean
}

export function SessionDrawer(props: SessionDrawerProps): JSX.Element | null {
  const {
    open, onClose,
    sessionDurationLabel, exchangeCount, coherenceLabel, coherenceFull,
    memoryActiveLabel, onResetContext, resetEnabled,
  } = props

  // Escape-to-close. Bound to document so the keystroke works even when focus
  // is inside the Memory section's nested controls.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const coherenceColor =
    coherenceLabel === 'Long session' ? 'var(--accent-orange)' :
    coherenceLabel === 'Extended'     ? 'var(--text-2)' :
                                        'var(--accent-green)'

  return (
    <>
      {/* Dismiss overlay — captures click-outside without blocking interaction
          with the drawer itself. Transparent (the drawer's panel provides the
          visual surface); positioned to cover the chat pane area only.
          Z-order: overlay below drawer; both above chat content. */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'transparent',
          zIndex: 30,
        }}
      />

      {/* Drawer panel — slides from the right. Width chosen to comfortably
          host MemoryPanel's content (it has its own internal layout that
          breathes around ~320–360 px). */}
      <div
        style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0,
          width: 340,
          maxWidth: '100%',
          background: 'var(--bg-1)',
          borderLeft: '1px solid var(--border-1)',
          boxShadow: '-6px 0 16px rgba(0,0,0,0.25)',
          zIndex: 31,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header bar — title + close. Mirrors the parent chat sub-header's
            height so the drawer reads as "the inside of the same surface." */}
        <div
          style={{
            flexShrink: 0,
            height: 40,
            display: 'flex', alignItems: 'center',
            padding: '0 10px 0 14px',
            borderBottom: '1px solid var(--border-1)',
          }}
        >
          <span
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
              color: 'var(--text-2)', textTransform: 'uppercase',
              fontFamily: 'monospace',
            }}
          >
            Session
          </span>
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              marginLeft: 'auto',
              width: 26, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: 5,
              cursor: 'pointer', color: 'var(--text-3)',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Scrollable body — sections stack vertically. Each section has its
            own labeled header + content block. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

          {/* Session 8 Part C revision 4 — drawer now hosts ONLY Session +
           *  Memory. The Agent section was removed: ModelSelector now lives
           *  inline in the chat sub-header (permanent one-tap switching,
           *  no drawer round-trip). Andy's spec: "Agent selector — the
           *  read-only pill + drawer pattern is NOT what was requested." */}

          {/* ── Section 1: Session ───────────────────────────────────────── */}
          <DrawerSection title="Session">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-2)' }}>
              <DrawerRow label="Active session">
                <span>{sessionDurationLabel} · {exchangeCount} exchange{exchangeCount === 1 ? '' : 's'}</span>
              </DrawerRow>
              <DrawerRow label="Memory active">
                <span>{memoryActiveLabel}</span>
              </DrawerRow>
              <DrawerRow label="Coherence">
                <span style={{ color: coherenceColor }}>{coherenceFull}</span>
              </DrawerRow>
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                onClick={onResetContext}
                disabled={!resetEnabled}
                title={
                  resetEnabled
                    ? 'Reset context — summarize chat into thread memory and start a fresh session. Survives restart.'
                    : 'Reset unavailable in sandbox mode or when Honcho is disabled.'
                }
                style={{
                  width: '100%',
                  fontSize: 11, fontWeight: 700,
                  color: resetEnabled ? 'var(--accent-orange)' : 'var(--text-5)',
                  background: 'transparent',
                  border: `1px solid ${resetEnabled ? 'rgba(255,159,10,0.45)' : 'var(--border-1)'}`,
                  borderRadius: 6,
                  padding: '6px 10px',
                  cursor: resetEnabled ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  transition: 'background 120ms',
                }}
                onMouseEnter={(e) => { if (resetEnabled) e.currentTarget.style.background = 'rgba(255,159,10,0.10)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                ⟲ Reset Context
              </button>
            </div>
          </DrawerSection>

          {/* ── Section 2: Memory ────────────────────────────────────────── */}
          {/* MemoryPanel.tsx is mounted verbatim per HANDOFF_v20 §3.2 (reuse,
              don't rewrite). It reads from the scribe/settings stores
              directly and renders Honcho session id + dream insights +
              memory file + Dream-now + the deep-link to Settings → Maintenance. */}
          <DrawerSection title="Memory" noPadding>
            <MemoryPanel />
          </DrawerSection>

        </div>
      </div>
    </>
  )
}

function DrawerSection({
  title, children, noPadding = false,
}: {
  title: string
  children: React.ReactNode
  noPadding?: boolean
}): JSX.Element {
  return (
    <div style={{ borderBottom: '1px solid var(--border-1)' }}>
      <div
        style={{
          padding: '8px 14px 6px',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
          color: 'var(--text-4)', textTransform: 'uppercase',
          fontFamily: 'monospace',
          background: 'var(--bg-2)',
        }}
      >
        {title}
      </div>
      <div style={{ padding: noPadding ? 0 : '10px 14px 14px' }}>
        {children}
      </div>
    </div>
  )
}

function DrawerRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: 'var(--text-4)', textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.4 }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{children}</span>
    </div>
  )
}
