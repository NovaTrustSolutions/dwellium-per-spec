import { useEffect, useRef, useCallback, useState, JSX } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { useScribeStore } from '../../store/scribeStore'
import { useSettingsStore } from '../../store/settingsStore'
import { DomaineBadge } from '../DomaineBadge'
import { IconPanelLeft, IconPanelRight, IconEdit } from '../Icons'
import { RenameOrgModal } from '../layout/Domaines'
import { useAutoSave } from './useAutoSave'
import { DumpMode } from './DumpMode'
import { TabBar } from './TabBar'
import { PDFViewer } from './PDFViewer'
import { getMarkdownExtensions, registerEditorView, smartPaste, rawPaste } from './markdownConfig'
import { redlinePlugin } from './redlinePlugin'
import { RedlineNavigator } from './RedlineNavigator'
import { commentPlugin, commentRefreshField } from './commentPlugin'
import { selectionObserver } from './selectionObserver'
import { SelectionToolbar } from './SelectionToolbar'
import { CommentEditor } from './CommentEditor'
import { DocumentToolbar } from './DocumentToolbar'
import { Minimap, MINIMAP_WIDTH } from './Minimap'
import type { DocComment } from '../../store/scribeStore'

// ── Code block auto-close keymap ──────────────────────────────────────────────
// When Enter is pressed at end of an opening ``` fence, inserts a closing fence
// two lines below and places the cursor on the empty middle line.

const codeBlockKeymap = keymap.of([
  {
    key: 'Enter',
    run(view: EditorView): boolean {
      const { state } = view
      const { from, to } = state.selection.main
      if (from !== to) return false
      const line = state.doc.lineAt(from)
      if (from !== line.to) return false
      if (!line.text.trimStart().startsWith('```')) return false

      // Count fences above to determine if this is an opening or closing fence
      let fenceCount = 0
      for (let ln = 1; ln < line.number; ln++) {
        if (state.doc.line(ln).text.trimStart().startsWith('```')) fenceCount++
      }
      if (fenceCount % 2 !== 0) return false  // this is a closing fence

      view.dispatch(state.update({
        changes: { from, insert: '\n\n```' },
        selection: { anchor: from + 1 },
        scrollIntoView: true,
      }))
      return true
    }
  }
])

// ── Cmd+L keymap ─────────────────────────────────────────────────────────────

const cmdLKeymap = keymap.of([
  {
    key: 'Mod-l',
    run(view: EditorView): boolean {
      const { from, to } = view.state.selection.main
      if (from === to) return false
      const selected = view.state.doc.sliceString(from, to)
      const startLine = view.state.doc.lineAt(from).number
      const endLine = view.state.doc.lineAt(to).number
      const lineRange = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`
      const quotedLines = selected.split('\n').map((line) => `> ${line}`).join('\n')

      const store = useScribeStore.getState()
      const filename = store.activeFilePath?.split('/').pop() ?? 'document'

      // Insert as a citation pill in the chat input — same shape as the
      // right-click "Send to Chat" flow. The pill displays in the bubble;
      // the agent receives the full quoted text via agentText.
      store.setPendingChatPill({
        id: crypto.randomUUID(),
        displayLabel: `✦ citation: ${lineRange}`,
        agentText: `Citation from ${filename}, ${lineRange}:\n${quotedLines}`,
      })

      // P5-A: remember this selection so any REDLINE blocks the agent returns
      // next can be anchored back to it.
      if (store.activeFilePath) {
        store.setLastRedlineSource({
          filePath: store.activeFilePath,
          from, to, text: selected,
        })
      }
      return true
    }
  }
])

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Session 8 Part B — `sidebarCollapsed` + `onToggleSidebar` are passed from
 * Shell.tsx so the new Scribe sub-header (top of the pane, hosting the file-
 * explorer collapse toggle + Project/Thread breadcrumb) can drive it.
 * Lifted from prior Shell-local state via prop rather than store because the
 * lifecycle stays bound to Shell.
 */
interface ScribePaneProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export function ScribePane({ sidebarCollapsed, onToggleSidebar }: ScribePaneProps): JSX.Element {
  const { activeFilePath, fileContents, setFileContent, setScrollPosition, scrollPositions, editorMode, pendingScrollTarget, setPendingScrollTarget } =
    useScribeStore()
  const { config } = useSettingsStore()

  const isPdf = !!activeFilePath && activeFilePath.toLowerCase().endsWith('.pdf')
  const isMarkdown = !!activeFilePath && /\.md$/i.test(activeFilePath) && editorMode === 'document'

  const content = activeFilePath != null ? (fileContents[activeFilePath] ?? '') : ''
  const contentRef = useRef(content)
  contentRef.current = content

  useAutoSave(activeFilePath, content)

  // Fix 4: load comment sidecar when the active file changes.
  useEffect(() => {
    if (!activeFilePath) return
    void window.electronAPI.commentsRead(activeFilePath).then((comments) => {
      useScribeStore.getState().setCommentsForFile(activeFilePath, comments as DocComment[])
    }).catch(() => {})
  }, [activeFilePath])

  // Fix 4: handlers for SelectionToolbar buttons.
  const handleAddComment = useCallback((args: { from: number; to: number; fromLine: number; toLine: number; text: string; filePath: string }) => {
    const id = crypto.randomUUID()
    const newComment: DocComment = {
      id,
      fromLine: args.fromLine,
      toLine: args.toLine,
      originalText: args.text,
      comment: '',
      createdAt: new Date().toISOString(),
      resolved: false,
    }
    useScribeStore.getState().upsertComment(args.filePath, newComment)
    useScribeStore.getState().setOpenCommentId(id)
    // Persist immediately — empty comment is fine, user will fill it in.
    const list = useScribeStore.getState().commentsByFile[args.filePath] ?? []
    void window.electronAPI.commentsWrite(args.filePath, [...list]).catch(() => {})
  }, [])

  const handleSendSelectionToAgent = useCallback((args: { from: number; to: number; fromLine: number; toLine: number; text: string; filePath: string }) => {
    const lineRange = args.fromLine === args.toLine ? `line ${args.fromLine}` : `lines ${args.fromLine}-${args.toLine}`
    const filename = args.filePath.split('/').pop() ?? 'document'
    const quotedLines = args.text.split('\n').map((line) => `> ${line}`).join('\n')
    useScribeStore.getState().setLastRedlineSource({
      filePath: args.filePath, from: args.from, to: args.to, text: args.text,
    })
    useScribeStore.getState().setPendingChatPill({
      id: crypto.randomUUID(),
      displayLabel: `✦ citation: ${lineRange}`,
      agentText: `Citation from ${filename}, ${lineRange}:\n${quotedLines}`,
    })
  }, [])

  const handleCommentSubmitToAgent = useCallback((comment: DocComment, originalText: string): void => {
    if (!activeFilePath) return
    const view = viewRef.current
    if (!view) return
    // Compute current doc positions from the comment's stored line numbers
    // so the redline anchors at the right text even if the doc was edited.
    const totalLines = view.state.doc.lines
    const fromLine = Math.max(1, Math.min(comment.fromLine, totalLines))
    const toLine = Math.max(fromLine, Math.min(comment.toLine, totalLines))
    const from = view.state.doc.line(fromLine).from
    const to = view.state.doc.line(toLine).to

    useScribeStore.getState().setLastRedlineSource({ filePath: activeFilePath, from, to, text: originalText, commentId: comment.id })
    const lineRange = fromLine === toLine ? `line ${fromLine}` : `lines ${fromLine}-${toLine}`
    const filename = activeFilePath.split('/').pop() ?? 'document'
    const quotedLines = originalText.split('\n').map((line) => `> ${line}`).join('\n')
    useScribeStore.getState().setPendingChatPill({
      id: crypto.randomUUID(),
      displayLabel: `💬 feedback on ${lineRange}`,
      agentText: `Apply this feedback to the passage:\n\nFEEDBACK: ${comment.comment}\n\nOriginal text from ${filename}, ${lineRange}:\n${quotedLines}`,
    })
  }, [activeFilePath])

  const persistCommentsForActive = useCallback((comments: DocComment[]): void => {
    if (!activeFilePath) return
    void window.electronAPI.commentsWrite(activeFilePath, comments).catch(() => {})
  }, [activeFilePath])

  const editorContainerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const prevPathRef = useRef<string | null>(null)
  // The redline plugin is constructed once at editor mount; this ref lets
  // its closure read the current active file without re-mounting the editor.
  const activePathRef = useRef<string | null>(activeFilePath)
  activePathRef.current = activeFilePath

  // ── Context menu ────────────────────────────────────────────────────────────
  // Paste + Markdown actions show unconditionally; Cut/Copy hide when no
  // selection. Send-to-Chat is the pill's job (see SelectionToolbar).
  interface CtxMenuSelection {
    text: string
    from: number
    to: number
  }
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    selection: CtxMenuSelection | null
  } | null>(null)

  // Submenu (Markdown ▶) — owned by the parent menu, single source of truth.
  // Hover-leave delay coordinates the cursor traversal across the gap between
  // the trigger row and the floating submenu.
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const submenuTriggerRef = useRef<HTMLDivElement | null>(null)
  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openSubmenu = (): void => {
    if (submenuCloseTimer.current) { clearTimeout(submenuCloseTimer.current); submenuCloseTimer.current = null }
    setSubmenuOpen(true)
  }
  const scheduleSubmenuClose = (): void => {
    if (submenuCloseTimer.current) clearTimeout(submenuCloseTimer.current)
    submenuCloseTimer.current = setTimeout(() => setSubmenuOpen(false), 150)
  }

  useEffect(() => {
    if (!ctxMenu) {
      // Menu closed — collapse submenu state too.
      setSubmenuOpen(false)
      if (submenuCloseTimer.current) { clearTimeout(submenuCloseTimer.current); submenuCloseTimer.current = null }
      return
    }
    const onMouseDown = (): void => setCtxMenu(null)
    const onKeyDown = (e: KeyboardEvent): void => { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [ctxMenu])

  const handleContextMenu = (e: React.MouseEvent): void => {
    const view = viewRef.current
    if (!view) return
    e.preventDefault()
    const { from, to } = view.state.selection.main
    let selection: CtxMenuSelection | null = null
    if (from !== to) {
      const text = view.state.doc.sliceString(from, to)
      if (text.trim()) {
        selection = { text, from, to }
      }
    }
    // Viewport clamp: keep menu fully visible. Heights are estimated from
    // item count (~32px each) + 4px outer padding × 2 + dividers (~9px).
    // With selection: Cut/Copy/Paste×3 + div + Markdown + div + Clear ≈ 260.
    // Without:        Paste×3 + div + Markdown                       ≈ 160.
    const MARGIN = 8
    const MENU_W = 220
    const MENU_H = selection ? 260 : 160
    const cx = e.clientX
    const cy = e.clientY
    let x = cx
    let y = cy
    if (cx + MENU_W > window.innerWidth - MARGIN) {
      x = Math.max(MARGIN, cx - MENU_W)
    }
    if (cy + MENU_H > window.innerHeight - MARGIN) {
      y = Math.max(MARGIN, cy - MENU_H)
    }
    setCtxMenu({ x, y, selection })
  }

  // ── Cut / Copy ─────────────────────────────────────────────────────────────
  const handleCut = (): void => {
    const view = viewRef.current
    if (!view || !ctxMenu?.selection) return
    const { text, from, to } = ctxMenu.selection
    void navigator.clipboard.writeText(text)
    view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } })
    setCtxMenu(null)
  }
  const handleCopy = (): void => {
    if (!ctxMenu?.selection) return
    void navigator.clipboard.writeText(ctxMenu.selection.text)
    setCtxMenu(null)
  }

  // ── Paste handlers ─────────────────────────────────────────────────────────
  // Paste = verbatim. Paste+ = smart (preserve paragraphs, strip soft-wraps).
  // Paste++ = raw (collapse all whitespace). Paste+/Paste++ delegate to the
  // exported Commands in markdownConfig so keymap and menu share one impl.
  const handlePasteVerbatim = (): void => {
    const view = viewRef.current
    if (!view) return
    setCtxMenu(null)
    void navigator.clipboard.readText().then((text) => {
      if (!text) return
      view.dispatch(view.state.replaceSelection(text))
    }).catch((err) => console.warn('[Paste] clipboard read failed:', err))
  }
  const handlePasteSmart = (): void => {
    const view = viewRef.current
    if (!view) return
    setCtxMenu(null)
    smartPaste(view)
  }
  const handlePasteRaw = (): void => {
    const view = viewRef.current
    if (!view) return
    setCtxMenu(null)
    rawPaste(view)
  }

  // ── Markdown formatting actions ────────────────────────────────────────────
  // wrapInline: wrap selection with `marker` on each side. With no selection,
  // insert two markers and place the caret between them.
  const wrapInline = (marker: string): void => {
    const view = viewRef.current
    if (!view) return
    setCtxMenu(null)
    const { from, to } = view.state.selection.main
    if (from === to) {
      view.dispatch({
        changes: { from, insert: marker + marker },
        selection: { anchor: from + marker.length },
      })
    } else {
      const text = view.state.doc.sliceString(from, to)
      view.dispatch({
        changes: { from, to, insert: marker + text + marker },
        selection: { anchor: from, head: from + text.length + marker.length * 2 },
      })
    }
    view.focus()
  }

  // prefixLines: prepend `prefix` to every line in the selection (or to the
  // cursor's current line if there's no selection). For numbered lists,
  // pass a function that takes the 0-indexed offset and returns the prefix.
  // Selection is mapped with assoc=1 so a cursor sitting at a line.from
  // (e.g. on an empty line) ends up AFTER the inserted prefix, ready for
  // the user to type. Default mapping (assoc=-1) leaves the cursor BEFORE
  // the prefix, so typing lands ahead of the marker.
  const prefixLines = (prefix: string | ((idx: number) => string)): void => {
    const view = viewRef.current
    if (!view) return
    setCtxMenu(null)
    const { from, to } = view.state.selection.main
    const startLineNum = view.state.doc.lineAt(from).number
    const endLineNum   = view.state.doc.lineAt(to).number
    const changeSpec: Array<{ from: number; insert: string }> = []
    let counter = 0
    for (let n = startLineNum; n <= endLineNum; n++) {
      const line = view.state.doc.line(n)
      const insert = typeof prefix === 'function' ? prefix(counter) : prefix
      changeSpec.push({ from: line.from, insert })
      counter++
    }
    const changes = view.state.changes(changeSpec)
    view.dispatch({
      changes,
      selection: view.state.selection.map(changes, 1),
    })
    view.focus()
  }

  // clearMarkdownFormatting: strip common markdown markers from the selected
  // range. With no selection, no-op for v1.
  const clearMarkdownFormatting = (): void => {
    const view = viewRef.current
    if (!view) return
    setCtxMenu(null)
    const { from, to } = view.state.selection.main
    if (from === to) return
    let text = view.state.doc.sliceString(from, to)
    text = text
      .replace(/\*\*([^*]+)\*\*/g, '$1')   // bold
      .replace(/__([^_]+)__/g, '$1')       // bold (alt)
      .replace(/\*([^*]+)\*/g, '$1')       // italic
      .replace(/_([^_]+)_/g, '$1')         // italic (alt)
      .replace(/~~([^~]+)~~/g, '$1')       // strikethrough
      .replace(/`([^`]+)`/g, '$1')         // inline code
      .replace(/^#{1,6}\s+/gm, '')         // headings
      .replace(/^\s*[-*+]\s+/gm, '')       // bullet
      .replace(/^\s*\d+\.\s+/gm, '')       // numbered
      .replace(/^\s*>\s?/gm, '')           // blockquote
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from, head: from + text.length },
    })
    view.focus()
  }

  const handleBold          = (): void => wrapInline('**')
  const handleItalic        = (): void => wrapInline('*')
  const handleStrikethrough = (): void => wrapInline('~~')
  const handleH1            = (): void => prefixLines('# ')
  const handleH2            = (): void => prefixLines('## ')
  const handleH3            = (): void => prefixLines('### ')
  const handleBulletList    = (): void => prefixLines('- ')
  const handleNumberedList  = (): void => prefixLines((i) => `${i + 1}. `)
  const handleBlockquote    = (): void => prefixLines('> ')

  const onDocChange = useCallback(
    (newContent: string) => {
      const { activeFilePath: path } = useScribeStore.getState()
      if (path) setFileContent(path, newContent)
    },
    [setFileContent]
  )

  // Listen for insert-at-cursor events from ChatPane via IPC round-trip.
  useEffect(() => {
    const remove = window.electronAPI.onScribeInsert((content) => {
      const view = viewRef.current
      if (!view) return
      view.dispatch(view.state.replaceSelection(content))
    })
    return remove
  }, [])

  // Create the editor once on mount.
  useEffect(() => {
    if (!editorContainerRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: contentRef.current,
        extensions: [
          codeBlockKeymap,
          cmdLKeymap,
          ...getMarkdownExtensions(),
          redlinePlugin(),
          commentRefreshField,
          commentPlugin(() => activePathRef.current),
          selectionObserver(() => activePathRef.current),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            onDocChange(update.state.doc.toString())

            // Map redline + comment positions through this change so they stay
            // aligned after edits (especially accepting a redline that adds or
            // removes lines, which would otherwise shift every redline/comment
            // below it). Runs synchronously inside the dispatch so by the time
            // any subsequent code (like acceptRedline's upsertComment) reads
            // the store, positions are already fresh.
            const path = activePathRef.current
            if (!path) return
            const changes = update.changes
            const oldDoc = update.startState.doc
            const newDoc = update.state.doc
            const store = useScribeStore.getState()

            // — Redlines: simple from/to mapping. mapPos picks the side based
            // on the assoc arg; we use 1 for `from` (stick to right of insert)
            // and -1 for `to` (stick to left of insert) so a redline range
            // never collapses to zero across an edit.
            const fileRedlines = store.redlines.filter((r) => r.filePath === path)
            if (fileRedlines.length > 0) {
              let changedAny = false
              const remapped = fileRedlines.map((r) => {
                const newFrom = changes.mapPos(r.from, 1)
                const newTo = changes.mapPos(r.to, -1)
                if (newFrom === r.from && newTo === r.to) return r
                changedAny = true
                return { ...r, from: newFrom, to: newTo }
              }).filter((r) => r.from < r.to) // drop collapsed
              if (changedAny || remapped.length !== fileRedlines.length) {
                store.setRedlinesForFile(path, remapped)
              }
            }

            // — Comments: line numbers. Convert each end of the range to a
            // doc position in the OLD doc, map through changes, then read the
            // new line number in the NEW doc.
            const fileComments = store.commentsByFile[path] ?? []
            if (fileComments.length > 0) {
              const oldLines = oldDoc.lines
              let changedAny = false
              const remapped = fileComments.map((c) => {
                const fromLineSafe = Math.max(1, Math.min(c.fromLine, oldLines))
                const toLineSafe = Math.max(fromLineSafe, Math.min(c.toLine, oldLines))
                const oldFromPos = oldDoc.line(fromLineSafe).from
                const oldToPos = oldDoc.line(toLineSafe).to
                const newFromPos = changes.mapPos(oldFromPos, 1)
                const newToPos = changes.mapPos(oldToPos, -1)
                const newFromLine = newDoc.lineAt(Math.min(newFromPos, newDoc.length)).number
                const newToLine = newDoc.lineAt(Math.min(Math.max(newToPos, newFromPos), newDoc.length)).number
                if (newFromLine === c.fromLine && newToLine === c.toLine) return c
                changedAny = true
                return { ...c, fromLine: newFromLine, toLine: newToLine }
              })
              if (changedAny) {
                store.setCommentsForFile(path, remapped)
              }
            }
          })
        ]
      }),
      parent: editorContainerRef.current
    })

    viewRef.current = view
    const unregister = registerEditorView(view)
    return () => {
      unregister()
      view.destroy()
      viewRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When active file changes: save scroll pos, swap content, restore scroll pos
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    if (prevPathRef.current) {
      setScrollPosition(prevPathRef.current, view.scrollDOM.scrollTop)
    }
    prevPathRef.current = activeFilePath

    const incoming = contentRef.current
    const current = view.state.doc.toString()
    if (current !== incoming) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: incoming }
      })
    }

    const savedScroll = scrollPositions[activeFilePath ?? ''] ?? 0
    requestAnimationFrame(() => {
      if (viewRef.current) viewRef.current.scrollDOM.scrollTop = savedScroll
    })
  }, [activeFilePath]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to a specific heading (e.g. `# Prompt 7`) when chat link is clicked.
  useEffect(() => {
    if (!pendingScrollTarget) return
    if (pendingScrollTarget.filePath !== activeFilePath) return
    const view = viewRef.current
    if (!view) return
    const doc = view.state.doc
    const needle = pendingScrollTarget.headingText
    let foundLineFrom: number | null = null
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i)
      if (line.text.trim() === needle) { foundLineFrom = line.from; break }
    }
    if (foundLineFrom != null) {
      view.dispatch({
        effects: EditorView.scrollIntoView(foundLineFrom, { y: 'start' }),
        selection: { anchor: foundLineFrom },
      })
    }
    setPendingScrollTarget(null)
  }, [pendingScrollTarget, activeFilePath, setPendingScrollTarget])

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-w-0" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ScribeSubHeader
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        projectName={config.activeProjectName}
        threadName={config.activeThreadName}
        projectPath={config.activeProjectPath}
        threadPath={config.activeThreadPath}
      />
      <TabBar />
      <DocumentToolbar getView={() => viewRef.current} />

      <div className="relative flex-1 overflow-hidden">
        {/* PDF viewer — shown when active file is a PDF */}
        {isPdf && activeFilePath && (
          <div className="absolute inset-0 z-10">
            <PDFViewer filePath={activeFilePath} />
          </div>
        )}

        {/* CodeMirror — always mounted, hidden when viewing PDF.
         *  When the active file is markdown, reserve `MINIMAP_WIDTH` on the
         *  right so text doesn't render under the minimap strip. */}
        <div
          ref={editorContainerRef}
          className="absolute overflow-hidden"
          style={{
            top: 0,
            left: 0,
            bottom: 0,
            right: isMarkdown ? MINIMAP_WIDTH : 0,
            visibility: isPdf ? 'hidden' : 'visible',
          }}
          onContextMenu={handleContextMenu}
        />

        {/* Right-edge minimap — only for markdown active files. */}
        {isMarkdown && <Minimap getView={() => viewRef.current} />}

        {!activeFilePath && editorMode === 'document' && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none" style={{ backgroundColor: 'var(--bg-base)' }}>
            <div className="text-center select-none">
              <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No file open</p>
              <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4, opacity: 0.7 }}>Open a file or drop one into the sidebar</p>
            </div>
          </div>
        )}

        {/* Dump Mode overlay — covers the document area while preserving CodeMirror state underneath */}
        {editorMode === 'dump' && (
          <div className="absolute inset-0 z-20 flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
            <DumpMode />
          </div>
        )}

        {/* P5-C: Redline navigator (only visible when redlines exist on active file) */}
        <RedlineNavigator getView={() => viewRef.current} />
      </div>

      {/* Fix 4: floating selection toolbar + inline comment editor.
          `hidden` suppresses the pill while the right-click menu is open
          without clearing its store state, so the pill reappears on close
          if the selection still exists. */}
      <SelectionToolbar
        onComment={handleAddComment}
        onSendToAgent={handleSendSelectionToAgent}
        hidden={ctxMenu !== null}
      />
      <CommentEditor
        getView={() => viewRef.current}
        onSubmitToAgent={handleCommentSubmitToAgent}
        onPersist={persistCommentsForActive}
      />

      {/* Context menu — fixed position so it escapes overflow:hidden containers */}
      {ctxMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            background: 'var(--bg-card-hover)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            padding: 4,
            boxShadow: 'var(--shadow-md)',
            zIndex: 1000,
            minWidth: 200,
          }}
        >
          {ctxMenu.selection && (
            <>
              <CtxMenuItem label="Cut"  shortcut="⌘X" onClick={handleCut} />
              <CtxMenuItem label="Copy" shortcut="⌘C" onClick={handleCopy} />
            </>
          )}
          <CtxMenuItem label="Paste"    shortcut="⌘V"   onClick={handlePasteVerbatim} />
          <CtxMenuItem label="Paste+"   shortcut="⌘⇧V"  onClick={handlePasteSmart} />
          <CtxMenuItem label="Paste++"  shortcut="⌘⇧⌥V" onClick={handlePasteRaw} />
          <CtxMenuDivider />
          {/* Clear Formatting sits directly above Markdown ▶. Gated on
              selection — the action is a no-op without one. */}
          {ctxMenu.selection && (
            <CtxMenuItem label="Clear Formatting" onClick={clearMarkdownFormatting} />
          )}
          <div
            ref={submenuTriggerRef}
            onMouseEnter={openSubmenu}
            onMouseLeave={scheduleSubmenuClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 24,
              padding: '8px 16px',
              fontSize: 13,
              color: 'var(--text-primary)',
              borderRadius: 4,
              cursor: 'default',
              background: submenuOpen ? 'var(--border-default)' : 'transparent',
              userSelect: 'none',
            }}
          >
            <span>Markdown</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>▶</span>
          </div>
        </div>
      )}

      {/* Markdown submenu — sibling popover so positioning is independent
          of parent menu. Opens on hover of the trigger row above; closes
          on a 150ms timer when the cursor leaves both nodes. */}
      {ctxMenu && submenuOpen && submenuTriggerRef.current && (
        <MarkdownSubmenu
          triggerRect={submenuTriggerRef.current.getBoundingClientRect()}
          onMouseEnter={openSubmenu}
          onMouseLeave={scheduleSubmenuClose}
          onBold={handleBold}
          onItalic={handleItalic}
          onStrikethrough={handleStrikethrough}
          onH1={handleH1}
          onH2={handleH2}
          onH3={handleH3}
          onBulletList={handleBulletList}
          onNumberedList={handleNumberedList}
          onBlockquote={handleBlockquote}
        />
      )}
    </div>
  )
}

function CtxMenuItem({
  label,
  shortcut,
  onClick,
}: {
  label: string
  shortcut?: string
  onClick: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        padding: '8px 16px',
        fontSize: 13,
        color: 'var(--text-primary)',
        borderRadius: 4,
        cursor: 'pointer',
        background: hovered ? 'var(--border-default)' : 'transparent',
        userSelect: 'none',
      }}
    >
      <span>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'inherit', letterSpacing: 0.3 }}>
          {shortcut}
        </span>
      )}
    </div>
  )
}

function CtxMenuDivider(): JSX.Element {
  return (
    <div
      style={{
        height: 1,
        margin: '4px 8px',
        background: 'var(--border-default)',
        opacity: 0.5,
      }}
    />
  )
}

interface MarkdownSubmenuProps {
  triggerRect: DOMRect
  onMouseEnter: () => void
  onMouseLeave: () => void
  onBold: () => void
  onItalic: () => void
  onStrikethrough: () => void
  onH1: () => void
  onH2: () => void
  onH3: () => void
  onBulletList: () => void
  onNumberedList: () => void
  onBlockquote: () => void
}

function MarkdownSubmenu(props: MarkdownSubmenuProps): JSX.Element {
  const { triggerRect, onMouseEnter, onMouseLeave } = props
  // Submenu height estimate: 8 items (~32px) + 2 dividers (~9px) + 8px padding ≈ 282px.
  // (Clear Formatting moved to the main menu; 9 items → 8.)
  const SUBMENU_W = 220
  const SUBMENU_H = 290
  const MARGIN = 8

  // Horizontal: prefer right of trigger; flip to left if overflow; final
  // clamp keeps it on-screen if neither side has room.
  let left: number
  if (triggerRect.right + SUBMENU_W > window.innerWidth - MARGIN) {
    left = triggerRect.left - SUBMENU_W
    if (left < MARGIN) left = Math.max(MARGIN, window.innerWidth - SUBMENU_W - MARGIN)
  } else {
    left = triggerRect.right
  }

  // Vertical: anchor at trigger top; shift up if bottom would overflow,
  // floor at MARGIN so we never render off the top of the viewport.
  let top = triggerRect.top
  if (top + SUBMENU_H > window.innerHeight - MARGIN) {
    top = Math.max(MARGIN, window.innerHeight - SUBMENU_H - MARGIN)
  }

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        top,
        left,
        background: 'var(--bg-card-hover)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 4,
        boxShadow: 'var(--shadow-md)',
        zIndex: 1001,
        minWidth: SUBMENU_W,
      }}
    >
      <CtxMenuItem label="Bold"           shortcut="⌘B"  onClick={props.onBold} />
      <CtxMenuItem label="Italic"         shortcut="⌘I"  onClick={props.onItalic} />
      <CtxMenuItem label="Strikethrough"                 onClick={props.onStrikethrough} />
      <CtxMenuDivider />
      <CtxMenuItem label="Heading 1"      shortcut="#"   onClick={props.onH1} />
      <CtxMenuItem label="Heading 2"      shortcut="##"  onClick={props.onH2} />
      <CtxMenuItem label="Heading 3"      shortcut="###" onClick={props.onH3} />
      <CtxMenuDivider />
      <CtxMenuItem label="Bullet List"                   onClick={props.onBulletList} />
      <CtxMenuItem label="Numbered List"                 onClick={props.onNumberedList} />
      <CtxMenuItem label="Blockquote"                    onClick={props.onBlockquote} />
    </div>
  )
}

// ── Scribe sub-header ─────────────────────────────────────────────────────────
// Session 8 Part B — new 28 px row at the top of ScribePane. Hosts the
// file-explorer collapse toggle (relocated from the deleted Shell tab bar)
// and the Project / Thread breadcrumb (relocated per architecture-v4 Part 14
// §2.1: "the breadcrumb moves into the Scribe sub-header row"). Visible only
// when the Scribe tab is active — other tabs (HUD, Codex, Foundry, Hive,
// Domains) lose the breadcrumb display naturally because they don't render
// ScribePane. That's intentional: those tabs aren't thread-scoped surfaces.

function ScribeSubHeader({
  sidebarCollapsed, onToggleSidebar, projectName, threadName, projectPath, threadPath,
}: {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  projectName: string
  threadName: string
  /** Active-project folder path. Required by `threadsRename` (Session 10
   *  in-Scribe rename pencil). Empty when no project context, in which
   *  case the pencil isn't rendered. */
  projectPath: string
  /** Active-thread folder path. Used as the `oldPrefix` for the scribe-
   *  store path remap on a successful rename. */
  threadPath: string
}): JSX.Element {
  const ToggleIcon = sidebarCollapsed ? IconPanelRight : IconPanelLeft
  const [renamingActive, setRenamingActive] = useState(false)
  const [hoveringThread, setHoveringThread] = useState(false)

  // Same truncation rule as the old Shell.tsx Breadcrumb component — preserve
  // thread name, truncate project name first if the combined display would
  // exceed 60 chars. Verbatim port so the visual reading matches what Andy is
  // used to from v13–v20.
  const truncate = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1) + '…' : s)
  const max = 60
  const sep = ' / '
  const combined = threadName ? projectName + sep + threadName : projectName
  let displayProject = projectName
  if (combined.length > max && threadName) {
    const room = Math.max(8, max - threadName.length - sep.length)
    displayProject = truncate(projectName, room)
  } else if (combined.length > max) {
    displayProject = truncate(projectName, max)
  }

  return (
    <div
      style={{
        height: 28,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 10px 0 4px',
        backgroundColor: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* File-explorer collapse toggle */}
      <button
        onClick={onToggleSidebar}
        title={sidebarCollapsed ? 'Expand file explorer' : 'Collapse file explorer'}
        style={{
          width: 24, height: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', borderRadius: 5,
          cursor: 'pointer',
          color: sidebarCollapsed ? 'var(--text-dim)' : 'var(--text-secondary)',
          transition: 'background 100ms, color 100ms',
          padding: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = sidebarCollapsed ? 'var(--text-dim)' : 'var(--text-secondary)' }}
      >
        <ToggleIcon size={14} />
      </button>

      {/* Project / Thread breadcrumb. Hidden cleanly when no project context
          (e.g. before a Domaine/Project is opened) so the row is just the
          toggle in that state. */}
      {(projectName || threadName) && (
        <div
          style={{
            display: 'flex', alignItems: 'center',
            gap: 7,
            fontSize: 11, fontFamily: 'monospace',
            overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0,
          }}
          title={threadName ? `${projectName} / ${threadName}` : projectName}
          onMouseEnter={() => setHoveringThread(true)}
          onMouseLeave={() => setHoveringThread(false)}
        >
          <DomaineBadge projectName={projectName} variant="dot" />
          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayProject}
          </span>
          {threadName && (
            <>
              <span style={{ color: 'var(--text-dim)' }}>/</span>
              <span style={{ color: 'var(--neon-blue)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {threadName}
              </span>
              {/* Session 10 — in-Scribe rename affordance. Hover-revealed
                  pencil next to the thread name; opens a rename modal
                  that wires through threadsRename IPC. Only enabled when
                  we have a projectPath (i.e., a real thread is loaded).
                  Visibility is opacity-only so layout doesn't shift. */}
              {projectPath && threadName && (
                <button
                  onClick={() => setRenamingActive(true)}
                  title="Rename thread"
                  aria-label="Rename thread"
                  style={{
                    width: 18, height: 18, marginLeft: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none', borderRadius: 4,
                    cursor: 'pointer',
                    color: 'var(--text-dim)',
                    opacity: hoveringThread ? 1 : 0,
                    transition: 'opacity 100ms, background 100ms, color 100ms',
                    padding: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' }}
                >
                  <IconEdit size={11} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Rename modal for the active thread — Session 10. Reuses the
          generic `RenameOrgModal` exported from Domaines.tsx so the
          input + validation + button behavior matches what Andy gets
          from the Domaines context menu rename. The renderer state sync
          (scribeStore.remapPathsByPrefix + settingsStore.loadConfig) is
          the same pattern as the Domaines callsite — kept inline here
          rather than extracted because there are only two call sites. */}
      {renamingActive && projectPath && threadName && (
        <RenameOrgModal
          title={`Rename thread "${threadName}"`}
          currentName={threadName}
          placeholder="e.g. Permit research"
          onClose={() => setRenamingActive(false)}
          onConfirm={async (newName) => {
            const r = await window.electronAPI.threadsRename(projectPath, threadName, newName)
            if (r.ok && r.wasActive && r.newPath) {
              useScribeStore.getState().remapPathsByPrefix(threadPath, r.newPath)
              await useSettingsStore.getState().loadConfig()
            }
            return { ok: r.ok, error: r.error }
          }}
        />
      )}
    </div>
  )
}
