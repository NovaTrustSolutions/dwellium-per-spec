import { useEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'

interface Heading {
  level: number   // 1..6, derived from leading # count
  text: string
  line: number    // 1-indexed CodeMirror line number
}

interface Props {
  open: boolean
  onClose: () => void
  getView: () => EditorView | null
}

/**
 * Floating overlay listing all markdown headings in the active document.
 * Click a heading → editor scrolls to that line and overlay closes.
 *
 * Implementation notes:
 *   - Headings parsed via line-by-line regex from view.state.doc. Reads doc
 *     text directly so we stay in sync with whatever CodeMirror currently has,
 *     including any in-flight redline acceptance.
 *   - Live update: subscribes to view updates while open and re-parses on
 *     docChanged. Cheap because parsing is O(N lines) and the overlay only
 *     exists while open.
 *   - Dismissal: click-outside or Escape. Backdrop captures clicks outside
 *     the card.
 */
export function TableOfContents({ open, onClose, getView }: Props): JSX.Element | null {
  const [headings, setHeadings] = useState<Heading[]>([])
  const cardRef = useRef<HTMLDivElement>(null)

  // Parse + subscribe while open. Parsing happens synchronously on each
  // doc change; cheap for typical doc sizes.
  useEffect(() => {
    if (!open) return
    const view = getView()
    if (!view) return

    const parse = (): Heading[] => {
      const out: Heading[] = []
      const doc = view.state.doc
      const lineCount = doc.lines
      // Track fenced-code state so we don't pick up `#` inside ``` blocks.
      let inFence = false
      for (let i = 1; i <= lineCount; i++) {
        const text = doc.line(i).text
        const trimmed = text.trimStart()
        if (trimmed.startsWith('```')) {
          inFence = !inFence
          continue
        }
        if (inFence) continue
        const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(trimmed)
        if (m) out.push({ level: m[1].length, text: m[2], line: i })
      }
      return out
    }

    setHeadings(parse())

    // Re-parse on doc changes via a one-shot listener. We can't use a
    // ViewPlugin/StateField here because TOC is a React component; instead
    // we attach a DOM-level mutation observer via CodeMirror's event hooks.
    // Simplest reliable hook: poll on a microtask after each render. But
    // a cleaner approach is to attach via the view's update listener
    // through a transaction filter — overkill. Instead we listen for the
    // built-in 'change' event on view.dom by registering an updateListener
    // on the spot. Since updateListener is a facet, the cleanest way is to
    // dispatch a tiny extension. For a v1 scoped to "while overlay is open",
    // a 250ms poll is adequate and trivially correct.
    let last = view.state.doc.toString()
    const interval = window.setInterval(() => {
      const v = getView()
      if (!v) return
      const cur = v.state.doc.toString()
      if (cur !== last) {
        last = cur
        setHeadings(parse())
      }
    }, 250)
    return () => window.clearInterval(interval)
  }, [open, getView])

  // Esc to close.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const jumpTo = (h: Heading): void => {
    const view = getView()
    if (!view) return
    const pos = view.state.doc.line(Math.min(h.line, view.state.doc.lines)).from
    view.dispatch({
      effects: EditorView.scrollIntoView(pos, { y: 'start' }),
      selection: { anchor: pos },
    })
    onClose()
    // Restore focus to the editor so arrow keys / typing work immediately.
    requestAnimationFrame(() => view.focus())
  }

  return (
    <div
      onMouseDown={(e) => {
        if (cardRef.current && cardRef.current.contains(e.target as Node)) return
        onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
      }}
    >
      <div
        ref={cardRef}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 360,
          maxHeight: '60vh',
          overflowY: 'auto',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
          padding: 12,
          fontFamily: 'inherit',
          color: 'var(--text-primary)',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingBottom: 8, marginBottom: 8,
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Contents
          </span>
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', fontSize: 16, lineHeight: 1, padding: 0,
            }}
          >×</button>
        </div>

        {headings.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', padding: '8px 4px' }}>
            No headings in this document.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {headings.map((h, i) => (
              <HeadingRow key={i} heading={h} onClick={() => jumpTo(h)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function HeadingRow({ heading, onClick }: { heading: Heading; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        padding: '5px 8px',
        paddingLeft: 8 + (heading.level - 1) * 16,
        borderRadius: 'var(--radius-sm)',
        color: heading.level === 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: heading.level === 1 ? 13 : 12,
        fontWeight: heading.level === 1 ? 600 : 400,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 100ms, color 100ms',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-card-hover)'
        e.currentTarget.style.color = 'var(--neon-blue)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = heading.level === 1 ? 'var(--text-primary)' : 'var(--text-secondary)'
      }}
      title={heading.text}
    >
      {heading.text}
    </button>
  )
}
