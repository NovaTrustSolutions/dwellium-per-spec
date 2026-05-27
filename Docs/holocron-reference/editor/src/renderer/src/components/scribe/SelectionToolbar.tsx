import { useEffect, useLayoutEffect, useRef } from 'react'
import { useScribeStore } from '../../store/scribeStore'

const TOOLBAR_HEIGHT = 32
const GAP_ABOVE_SELECTION = 8

interface Props {
  onComment: (args: { from: number; to: number; fromLine: number; toLine: number; text: string; filePath: string }) => void
  onSendToAgent: (args: { from: number; to: number; fromLine: number; toLine: number; text: string; filePath: string }) => void
  /** When true, suppress rendering without clearing store state — used while
   *  the right-click context menu is open so the pill reappears on close
   *  if the selection still exists. */
  hidden?: boolean
}

/**
 * Floating toolbar (Fix 4) — appears above text selections in the editor.
 * Position is published by selectionObserver in viewport coords; we render
 * with `position: fixed` so we don't need to know any DOM ancestor's offset.
 */
export function SelectionToolbar({ onComment, onSendToAgent, hidden }: Props): JSX.Element | null {
  const selectionToolbar = useScribeStore((s) => s.selectionToolbar)
  const ref = useRef<HTMLDivElement>(null)

  // Hide on click outside the toolbar (anywhere not in the toolbar dismisses).
  useEffect(() => {
    if (!selectionToolbar) return
    const onMouseDown = (e: MouseEvent): void => {
      if (ref.current && ref.current.contains(e.target as Node)) return
      // Skip right-click: it opens the editor context menu, which will hide
      // this pill via the `hidden` prop while open. Clearing store state on
      // right-click would prevent the pill from reappearing after the menu
      // closes.
      if (e.button === 2) return
      // Don't dismiss if user clicked inside the editor — the editor's own
      // mouseup will republish based on the new selection. Only dismiss if
      // they clicked outside the editor entirely.
      // (Pragmatically: any non-toolbar mousedown clears; the editor's
      // mouseup will repopulate if there's still a selection.)
      useScribeStore.getState().setSelectionToolbar(null)
    }
    // Capture-phase so we run before the editor's own handlers might re-set.
    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [selectionToolbar])

  // Diagnostic — measure the rendered pill rect after layout to see whether
  // its actual center matches selectionToolbar.x. Hook MUST live above any
  // early return so the call order stays stable across renders (Rules of
  // Hooks). Internal guards skip the work when there's nothing to measure.
  useLayoutEffect(() => {
    if (!ref.current || !selectionToolbar || hidden) return
    const r = ref.current.getBoundingClientRect()
    const actualCenter = r.left + r.width / 2
    console.log('[PillRender]', {
      expectedCenter: selectionToolbar.x,
      actualLeft: r.left,
      actualWidth: r.width,
      actualCenter,
      delta: actualCenter - selectionToolbar.x,
    })
  })

  if (!selectionToolbar || hidden) return null
  const { x, y, from, to, fromLine, toLine, text, filePath } = selectionToolbar

  // Position above the selection's first line, centered on `x`. Clamp to viewport.
  const top = Math.max(8, y - TOOLBAR_HEIGHT - GAP_ABOVE_SELECTION)
  const left = Math.max(8, Math.min(window.innerWidth - 8, x))

  const args = { from, to, fromLine, toLine, text, filePath }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top,
        left,
        transform: 'translateX(-50%)',
        zIndex: 30,
        height: TOOLBAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 6px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-pill)',
        boxShadow: 'var(--shadow-md)',
        userSelect: 'none',
        fontSize: 12,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ToolbarButton title="Add comment" onClick={() => { onComment(args); useScribeStore.getState().setSelectionToolbar(null) }}>
        💬 Comment
      </ToolbarButton>
      <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
      <ToolbarButton title="Send to agent (⌘L)" onClick={() => { onSendToAgent(args); useScribeStore.getState().setSelectionToolbar(null) }}>
        ↗ Send to Agent
        <span style={{ marginLeft: 8, opacity: 0.7, fontWeight: 500, letterSpacing: 0.3 }}>⌘L</span>
      </ToolbarButton>
    </div>
  )
}

function ToolbarButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: '#0a84ff',
        border: 'none',
        color: '#ffffff',
        cursor: 'pointer',
        padding: '5px 12px',
        borderRadius: 'var(--radius-md)',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        transition: 'background 100ms, transform 80ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#3399ff' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#0a84ff' }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)' }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      {children}
    </button>
  )
}
