import { useState, useEffect, useRef, useCallback } from 'react'
import { EditorView } from '@codemirror/view'
import { useScribeStore, type DocComment } from '../../store/scribeStore'

interface Props {
  getView: () => EditorView | null
  onSubmitToAgent: (comment: DocComment, originalText: string) => void
  onPersist: (comments: DocComment[]) => void  // called whenever comments change for current file
}

/**
 * Inline comment editor (Fix 4) — React-rendered overlay positioned above
 * the comment's first line via `view.coordsAtPos`. Shown when
 * `openCommentId` matches a comment in the active file.
 *
 * Supports view, edit, delete, and "Submit to Agent" (which re-uses the
 * redline pipeline by setting lastRedlineSource + a chat pill).
 */
export function CommentEditor({ getView, onSubmitToAgent, onPersist }: Props): JSX.Element | null {
  const activeFilePath = useScribeStore((s) => s.activeFilePath)
  const openCommentId = useScribeStore((s) => s.openCommentId)
  const commentsByFile = useScribeStore((s) => s.commentsByFile)
  const setOpenCommentId = useScribeStore((s) => s.setOpenCommentId)
  const upsertComment = useScribeStore((s) => s.upsertComment)
  const removeComment = useScribeStore((s) => s.removeComment)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Repositioning: track scroll/resize to update coords. We re-render on
  // these events by bumping a counter.
  const [posBump, setPosBump] = useState(0)
  useEffect(() => {
    if (!openCommentId) return
    const view = getView()
    if (!view) return
    const onScroll = (): void => setPosBump((n) => n + 1)
    view.scrollDOM.addEventListener('scroll', onScroll)
    window.addEventListener('resize', onScroll)
    return () => {
      view.scrollDOM.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [openCommentId, getView])

  // Discard a fresh empty comment when the editor is dismissed without text.
  // Lifecycle: handleAddComment in ScribePane creates the comment with
  // comment:'' and immediately persists it; if the user dismisses without
  // saving any text (X / Cancel / click-outside / Escape), the empty
  // comment.comment is the discriminator — remove it entirely so no
  // highlight/marker remains. Existing comments with non-empty text are
  // left alone (only the textarea draft is in flight, not the saved value).
  // Reads store via getState so the closure stays stable for click-outside.
  const discardIfEmpty = useCallback((): boolean => {
    const state = useScribeStore.getState()
    const fp = state.activeFilePath
    const oid = state.openCommentId
    if (!fp || !oid) return false
    const c = (state.commentsByFile[fp] ?? []).find((x) => x.id === oid)
    if (!c || c.comment !== '') return false
    state.removeComment(fp, c.id)
    const remaining = (state.commentsByFile[fp] ?? []).filter((x) => x.id !== c.id)
    onPersist(remaining)
    return true
  }, [onPersist])

  // Click-outside dismissal — popup behaves like any flyout/menu.
  useEffect(() => {
    if (!openCommentId) return
    const onMouseDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (!target) return
      // Click inside the popup itself: don't dismiss.
      if (wrapperRef.current && wrapperRef.current.contains(target)) return
      // Click on a comment indicator (💬) or on underlined comment text:
      // commentPlugin's own handler is about to set openCommentId to that
      // comment. If we close here, we'd race against it. Let it through.
      if (target.closest('.cm-comment-indicator, [data-comment-id]')) return
      discardIfEmpty()
      setOpenCommentId(null)
    }
    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [openCommentId, setOpenCommentId, discardIfEmpty])

  // When a NEW (empty) comment is opened, jump straight into edit mode.
  // Focus is handled by the separate effect below so it runs AFTER the
  // textarea has actually been committed to the DOM.
  useEffect(() => {
    if (!openCommentId || !activeFilePath) return
    const c = (commentsByFile[activeFilePath] ?? []).find((x) => x.id === openCommentId)
    if (!c) return
    if (!c.comment) {
      setDraft('')
      setEditing(true)
    } else {
      setEditing(false)
    }
  }, [openCommentId, activeFilePath]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the textarea whenever we enter edit mode. Runs after the DOM has
  // been updated, so inputRef.current is guaranteed to be the textarea.
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (!activeFilePath || !openCommentId) return null
  const comment = (commentsByFile[activeFilePath] ?? []).find((c) => c.id === openCommentId)
  if (!comment) return null

  const view = getView()
  if (!view) return null

  // Compute viewport position from the comment's first line.
  const totalLines = view.state.doc.lines
  const fromLine = Math.max(1, Math.min(comment.fromLine, totalLines))
  const toLine = Math.max(fromLine, Math.min(comment.toLine, totalLines))
  const linePos = view.state.doc.line(fromLine).from
  const coords = view.coordsAtPos(linePos)
  if (!coords) return null

  // Place the editor just below the line containing the start of the comment.
  const lineEndCoords = view.coordsAtPos(view.state.doc.line(fromLine).to) ?? coords
  const top = lineEndCoords.bottom + 4
  const left = coords.left

  void posBump  // referenced so React knows to re-run on scroll bumps

  const beginEdit = (): void => {
    setDraft(comment.comment)
    setEditing(true)
    // Focus is handled by the editing-effect above.
  }

  const saveEdit = (): void => {
    const text = draft.trim()
    if (!text) return
    const updated: DocComment = { ...comment, comment: text }
    upsertComment(activeFilePath, updated)
    setEditing(false)
    onPersist([...((commentsByFile[activeFilePath] ?? [])
      .filter((c) => c.id !== updated.id)), updated])
  }

  const cancelEdit = (): void => {
    // Fresh empty comment → treat Cancel as "never created"; remove fully.
    // Existing comment with saved text → just abandon the textarea draft.
    if (discardIfEmpty()) {
      setOpenCommentId(null)
      setEditing(false)
      setDraft('')
      return
    }
    setEditing(false)
    setDraft('')
  }

  const handleDelete = (): void => {
    removeComment(activeFilePath, comment.id)
    setOpenCommentId(null)
    onPersist((commentsByFile[activeFilePath] ?? []).filter((c) => c.id !== comment.id))
  }

  const handleSubmitToAgent = (): void => {
    const updated: DocComment = { ...comment, resolved: true }
    upsertComment(activeFilePath, updated)
    onPersist([...((commentsByFile[activeFilePath] ?? [])
      .filter((c) => c.id !== updated.id)), updated])
    onSubmitToAgent(updated, comment.originalText)
    setOpenCommentId(null)
  }

  const closeNoChange = (): void => {
    discardIfEmpty()
    setOpenCommentId(null)
    setEditing(false)
  }

  const lineRange = fromLine === toLine ? `Line ${fromLine}` : `Lines ${fromLine}-${toLine}`

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'fixed',
        top, left,
        zIndex: 25,
        width: 360,
        background: 'var(--bg-card)',
        border: '1px solid #ffd60a55',
        borderLeft: '3px solid #ffd60a',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: 'var(--space-3)',
        fontSize: 12,
        fontFamily: 'inherit',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: '#ffd60a' }}>💬</span>
        <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {lineRange}{comment.resolved ? ' · resolved' : ''}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={closeNoChange}
          title="Close"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, lineHeight: 1, padding: 0 }}
        >×</button>
      </div>

      {editing ? (
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit() }
            if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
          }}
          rows={3}
          placeholder="Add a comment…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--bg-base)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)', padding: '6px 8px',
            color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
            outline: 'none', resize: 'vertical',
          }}
        />
      ) : (
        <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 8 }}>
          {comment.comment || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>(empty)</span>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        {editing ? (
          <>
            <button onClick={saveEdit} disabled={!draft.trim()} style={btnStylePrimary(!!draft.trim())}>
              Save
            </button>
            <button onClick={cancelEdit} style={btnStyleSecondary}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={beginEdit} style={btnStyleSecondary}>Edit</button>
            <button onClick={handleDelete} style={btnStyleDanger}>Delete</button>
            <span style={{ flex: 1 }} />
            {!comment.resolved && (
              <button onClick={handleSubmitToAgent} style={btnStylePrimary(true)}>
                Submit to Agent
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const btnStyleSecondary: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-default)',
  color: 'var(--text-secondary)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 10px',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const btnStyleDanger: React.CSSProperties = {
  ...btnStyleSecondary,
  color: '#ff2d78',
}

function btnStylePrimary(enabled: boolean): React.CSSProperties {
  return {
    background: enabled ? '#ffd60a' : 'var(--bg-card-hover)',
    color: enabled ? '#000' : 'var(--text-dim)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 700,
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
  }
}
