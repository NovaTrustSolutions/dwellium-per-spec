import { useState, useMemo } from 'react'
import { EditorView } from '@codemirror/view'
import { useScribeStore, type Redline } from '../../store/scribeStore'

/**
 * P5-C: Floating navigator above the editor when ≥1 pending redline exists
 * for the active file. Shows "Redline N of M", ▲/▼ to scroll the editor to
 * each redline in sequence, and Accept All / Reject All bulk actions.
 * Disappears when no pending redlines remain.
 */
export function RedlineNavigator({ getView }: { getView: () => EditorView | null }): JSX.Element | null {
  const activeFilePath = useScribeStore((s) => s.activeFilePath)
  const editorMode = useScribeStore((s) => s.editorMode)
  const redlines = useScribeStore((s) => s.redlines)

  const fileRedlines = useMemo(() => {
    if (!activeFilePath) return []
    return redlines
      .filter((r) => r.filePath === activeFilePath && r.state === 'pending')
      .sort((a, b) => a.from - b.from)
  }, [redlines, activeFilePath])

  const [cursor, setCursor] = useState(0)

  if (editorMode !== 'document' || fileRedlines.length === 0) return null

  const safeCursor = Math.min(cursor, fileRedlines.length - 1)

  const scrollTo = (idx: number): void => {
    const view = getView()
    const r = fileRedlines[idx]
    if (!view || !r) return
    view.dispatch({
      effects: EditorView.scrollIntoView(r.from, { y: 'center' }),
    })
  }

  const goPrev = (): void => {
    const next = (safeCursor - 1 + fileRedlines.length) % fileRedlines.length
    setCursor(next); scrollTo(next)
  }
  const goNext = (): void => {
    const next = (safeCursor + 1) % fileRedlines.length
    setCursor(next); scrollTo(next)
  }

  const acceptAll = (): void => {
    const view = getView()
    if (!view) return
    // Process top-to-bottom but apply changes in REVERSE so earlier ranges'
    // positions stay valid while later ones are still being applied.
    const sorted = [...fileRedlines].sort((a, b) => b.from - a.from)
    const docLen = view.state.doc.length
    const valid = sorted.filter((r) => r.from >= 0 && r.to <= docLen && r.from < r.to)
    if (valid.length === 0) return
    // Group by unique range so multi-alternative stacks pick the FIRST (top-to-bottom
    // in document order) — alternatives below a winning Accept become moot.
    const seen = new Set<string>()
    const winners: Redline[] = []
    for (const r of [...valid].sort((a, b) => a.from - b.from)) {
      const key = `${r.from}:${r.to}`
      if (seen.has(key)) continue
      seen.add(key)
      winners.push(r)
    }
    // Apply in reverse-document-order so positions don't shift under us.
    view.dispatch({
      changes: winners
        .sort((a, b) => b.from - a.from)
        .map((r) => ({ from: r.from, to: r.to, insert: r.proposedText })),
    })
    // Resolve every winner's source comment (auto-resolve on accept). This
    // mirrors the per-redline acceptRedline path; without it, "Accept All"
    // applies the text edits but leaves the comment underlines hanging.
    const { removeRedline, commentsByFile, upsertComment } = useScribeStore.getState()
    const filesToPersist = new Set<string>()
    for (const r of winners) {
      if (!r.commentId) continue
      const list = commentsByFile[r.filePath] ?? []
      const c = list.find((x) => x.id === r.commentId)
      if (c && !c.resolved) {
        upsertComment(r.filePath, { ...c, resolved: true })
        filesToPersist.add(r.filePath)
      }
    }
    for (const filePath of filesToPersist) {
      const list = useScribeStore.getState().commentsByFile[filePath] ?? []
      void window.electronAPI.commentsWrite(filePath, list).catch((err) => {
        console.error('[acceptAll] commentsWrite failed:', err)
      })
    }
    console.log(`[acceptAll] applied ${winners.length} redline(s), resolved ${filesToPersist.size > 0 ? 'comments across ' + filesToPersist.size + ' file(s)' : 'no comments (no commentIds set)'}`)
    // Clear every pending redline for this file (winners + any losers in stacks).
    for (const r of fileRedlines) removeRedline(r.id)
    setCursor(0)
  }

  const rejectAll = (): void => {
    const { removeRedline } = useScribeStore.getState()
    for (const r of fileRedlines) removeRedline(r.id)
    setCursor(0)
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '8px 18px',
        background: '#0a84ff',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 999,
        boxShadow: '0 6px 20px rgba(10,132,255,0.35), 0 2px 6px rgba(0,0,0,0.25)',
        fontSize: 13,
        fontFamily: 'inherit',
        color: '#ffffff',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        minWidth: 360,
        justifyContent: 'center',
      }}
    >
      <span style={{ fontWeight: 500 }}>
        Redline <span style={{ fontWeight: 700 }}>{safeCursor + 1}</span> of <span style={{ fontWeight: 700 }}>{fileRedlines.length}</span>
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <NavBtn label="▲" title="Previous redline" onClick={goPrev} disabled={fileRedlines.length < 2} />
        <NavBtn label="▼" title="Next redline" onClick={goNext} disabled={fileRedlines.length < 2} />
      </div>
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>│</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <NavBtn label="✓ Accept All" title="Accept all pending redlines top-to-bottom" onClick={acceptAll} accept />
        <NavBtn label="✗ Reject All" title="Discard all pending redlines" onClick={rejectAll} reject />
      </div>
    </div>
  )
}

function NavBtn({
  label, title, onClick, disabled, accept, reject,
}: {
  label: string; title: string; onClick: () => void
  disabled?: boolean; accept?: boolean; reject?: boolean
}): JSX.Element {
  // On the blue pill: white text by default; Accept slot has a solid
  // green chip backdrop, Reject has a solid pink chip backdrop. Both
  // contrast hard against the blue pill so neither blends in. Navigation
  // arrows stay transparent (they're secondary).
  const isChip = accept || reject
  const baseBg = accept ? '#30d158' : reject ? '#ff4d6d' : 'transparent'
  const baseColor = accept ? '#0b1f10' : reject ? '#ffffff' : '#ffffff'
  const hoverBg = accept ? '#3ddf66' : reject ? '#ff6b85' : 'rgba(255,255,255,0.18)'
  const hoverColor = baseColor
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: baseBg,
        border: 'none',
        color: baseColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        padding: isChip ? '4px 12px' : '4px 8px',
        fontSize: 12,
        fontWeight: isChip ? 700 : 600,
        fontFamily: 'inherit',
        borderRadius: 999,
        transition: 'background 120ms, color 120ms, transform 80ms',
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = hoverBg
        e.currentTarget.style.color = hoverColor
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = baseBg
        e.currentTarget.style.color = baseColor
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)' }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      {label}
    </button>
  )
}
