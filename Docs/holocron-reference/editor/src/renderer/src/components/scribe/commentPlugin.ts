import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { useScribeStore, type DocComment } from '../../store/scribeStore'

/**
 * Comment rendering for CodeMirror (Fix 4).
 *
 * Pulls the active file's comments from the editor store and renders, per
 * comment:
 *   - An amber underline mark over the commented range (lines fromLine..toLine)
 *   - A 💬 widget at end-of-last-commented-line; clicking it opens the comment
 *
 * Decoration set is rebuilt whenever the store's commentsByFile or
 * activeFilePath changes (subscribe + dispatched StateEffect).
 */

export const commentRefreshEffect = StateEffect.define<number>()

export const commentRefreshField = StateField.define<number>({
  create: () => 0,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(commentRefreshEffect)) return e.value
    }
    return value
  },
})

// ── Indicator widget: a small 💬 at end of the comment's last line ──────

class CommentIndicatorWidget extends WidgetType {
  constructor(private readonly comment: DocComment, private readonly onClick: () => void) { super() }
  eq(other: CommentIndicatorWidget): boolean {
    return other.comment.id === this.comment.id && other.comment.resolved === this.comment.resolved
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = `cm-comment-indicator${this.comment.resolved ? ' cm-comment-resolved' : ''}`
    span.title = this.comment.resolved ? 'Resolved comment — click to view' : 'Open comment'
    span.textContent = '💬'
    span.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); this.onClick() }
    return span
  }
  ignoreEvent(): boolean { return false }
}

// ── Decoration builder ──────────────────────────────────────────────────

function buildDecorations(view: EditorView, filePath: string | null): DecorationSet {
  if (!filePath) return Decoration.none
  const { commentsByFile, setOpenCommentId } = useScribeStore.getState()
  const comments = commentsByFile[filePath] ?? []
  if (comments.length === 0) return Decoration.none
  const visible = comments.filter((c) => !c.resolved)
  console.log(`[commentPlugin] buildDecorations — total=${comments.length} visible=${visible.length} resolved=${comments.length - visible.length}`)

  const totalLines = view.state.doc.lines
  type Item = { from: number; to: number; dec: Decoration; isWidget: boolean }
  const items: Item[] = []

  for (const c of comments) {
    if (c.resolved) continue   // keep only active comments visible (resolved hidden)
    const fromLine = Math.max(1, Math.min(c.fromLine, totalLines))
    const toLine = Math.max(fromLine, Math.min(c.toLine, totalLines))
    const fromPos = view.state.doc.line(fromLine).from
    const toPos = view.state.doc.line(toLine).to
    if (fromPos >= toPos) continue
    const markClass = c.resolved ? 'cm-comment-marked-resolved' : 'cm-comment-marked'
    items.push({
      from: fromPos,
      to: toPos,
      dec: Decoration.mark({ class: markClass, attributes: { 'data-comment-id': c.id } }),
      isWidget: false,
    })
    items.push({
      from: toPos,
      to: toPos,
      dec: Decoration.widget({
        widget: new CommentIndicatorWidget(c, () => setOpenCommentId(c.id)),
        side: 1,
      }),
      isWidget: true,
    })
  }

  items.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from
    if (!a.isWidget && b.isWidget) return -1
    if (a.isWidget && !b.isWidget) return 1
    return 0
  })

  const builder = new RangeSetBuilder<Decoration>()
  for (const it of items) builder.add(it.from, it.to, it.dec)
  return builder.finish()
}

// ── Plugin factory ──────────────────────────────────────────────────────

export function commentPlugin(getActivePath: () => string | null): ViewPlugin<{ decorations: DecorationSet }> {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      unsub: () => void
      view: EditorView
      domClickHandler: (e: MouseEvent) => void

      constructor(view: EditorView) {
        this.view = view
        this.decorations = buildDecorations(view, getActivePath())

        // Subscribe to store changes that affect comment rendering.
        this.unsub = useScribeStore.subscribe((state, prev) => {
          const path = getActivePath()
          if (!path) return
          const commentsChanged = state.commentsByFile[path] !== prev.commentsByFile[path]
          const fileChanged = state.activeFilePath !== prev.activeFilePath
          if (commentsChanged || fileChanged) {
            const list = state.commentsByFile[path] ?? []
            console.log(`[commentPlugin] refreshing — file=${path.split('/').pop()} commentsChanged=${commentsChanged} total=${list.length} unresolved=${list.filter((c) => !c.resolved).length}`)
            this.view.dispatch({ effects: commentRefreshEffect.of(Date.now()) })
          }
        })

        // Click on the underline to re-open the comment for editing.
        this.domClickHandler = (e: MouseEvent): void => {
          const target = e.target as HTMLElement | null
          if (!target) return
          const marked = target.closest('[data-comment-id]') as HTMLElement | null
          if (!marked) return
          const id = marked.getAttribute('data-comment-id')
          if (id) {
            e.preventDefault()
            useScribeStore.getState().setOpenCommentId(id)
          }
        }
        view.dom.addEventListener('mousedown', this.domClickHandler)
      }

      update(u: ViewUpdate): void {
        const refreshed = u.transactions.some((t) => t.effects.some((e) => e.is(commentRefreshEffect)))
        if (refreshed || u.docChanged || u.viewportChanged) {
          this.decorations = buildDecorations(u.view, getActivePath())
        }
      }

      destroy(): void {
        this.unsub()
        this.view.dom.removeEventListener('mousedown', this.domClickHandler)
      }
    },
    { decorations: (v) => v.decorations },
  )
}
