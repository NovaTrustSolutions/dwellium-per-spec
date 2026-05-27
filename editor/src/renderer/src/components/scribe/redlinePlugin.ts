import { EditorView, ViewPlugin, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { RangeSetBuilder, StateEffect, StateField, EditorState, Extension } from '@codemirror/state'
import { useScribeStore, type Redline } from '../../store/scribeStore'
import { commentRefreshEffect } from './commentPlugin'

/**
 * Redline rendering for CodeMirror (P5).
 *
 * Pulls the current file's redlines from the editor store and renders:
 *   - A red mark over the original range (DATA_MODEL §6 visual rules)
 *   - A yellow BLOCK widget below the original line containing the proposed
 *     replacement text and Accept (✓) / Reject (✗) buttons.
 *
 * Block widgets must be provided through a StateField (via
 * `EditorView.decorations.from`), not a ViewPlugin's decorations spec —
 * CodeMirror needs to know their height at layout time. A small companion
 * ViewPlugin subscribes to the Zustand store and dispatches a refresh
 * effect whenever the redline list changes.
 */

// ── External signal: bumped whenever the redline list changes ────────────

export const redlineRefreshEffect = StateEffect.define<number>()

// ── Widget rendering the proposed text + Accept/Reject buttons ───────────

class RedlineWidget extends WidgetType {
  constructor(private readonly redline: Redline) { super() }

  eq(other: RedlineWidget): boolean {
    return other.redline.id === this.redline.id
      && other.redline.proposedText === this.redline.proposedText
  }

  toDOM(view: EditorView): HTMLElement {
    // Outer block element — what CodeMirror measures. MUST have no vertical
    // margin (margins on block widgets cause measure-loop bail-outs).
    const block = document.createElement('div')
    block.className = 'cm-redline-block'

    // Inner card — visible yellow box.
    const wrap = document.createElement('div')
    wrap.className = 'cm-redline-proposed-wrap'

    const body = document.createElement('div')
    body.className = 'cm-redline-proposed-body'
    body.textContent = this.redline.proposedText

    const actions = document.createElement('div')
    actions.className = 'cm-redline-actions'

    const accept = document.createElement('button')
    accept.className = 'cm-redline-btn cm-redline-accept'
    accept.title = 'Accept replacement'
    accept.innerHTML = '<span class="cm-redline-glyph">✓</span><span class="cm-redline-label">Accept</span>'
    accept.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); acceptRedline(view, this.redline) }

    const reject = document.createElement('button')
    reject.className = 'cm-redline-btn cm-redline-reject'
    reject.title = 'Reject replacement'
    reject.innerHTML = '<span class="cm-redline-glyph">✗</span><span class="cm-redline-label">Reject</span>'
    reject.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); rejectRedline(this.redline) }

    actions.appendChild(accept)
    actions.appendChild(reject)
    wrap.appendChild(body)
    wrap.appendChild(actions)
    block.appendChild(wrap)
    return block
  }

  ignoreEvent(): boolean { return false }
}

// ── Decoration builder ───────────────────────────────────────────────────

const originalMark = Decoration.mark({ class: 'cm-redline-original' })

function buildDecorations(state: EditorState): DecorationSet {
  const { redlines, activeFilePath } = useScribeStore.getState()
  if (!activeFilePath) return Decoration.none

  const lines = redlines.filter((r) => r.filePath === activeFilePath && r.state === 'pending')
  if (lines.length === 0) return Decoration.none

  const docLen = state.doc.length

  // Build a flat list of decorations: one mark per UNIQUE original range +
  // one block widget per redline (at line-end of `to`). RangeSetBuilder
  // requires monotonic `from`, so we collect everything and sort once.
  type Item = { from: number; to: number; dec: Decoration; isWidget: boolean }
  const items: Item[] = []
  const markedRanges = new Set<string>()
  const stale: string[] = []

  for (const r of lines) {
    if (r.from < 0 || r.to > docLen || r.from >= r.to) {
      stale.push(r.id)
      continue
    }
    const key = `${r.from}:${r.to}`
    if (!markedRanges.has(key)) {
      items.push({ from: r.from, to: r.to, dec: originalMark, isWidget: false })
      markedRanges.add(key)
    }
    const lineEnd = state.doc.lineAt(r.to).to
    const widget = Decoration.widget({
      widget: new RedlineWidget(r),
      side: 1,
      block: true,
    })
    items.push({ from: lineEnd, to: lineEnd, dec: widget, isWidget: true })
  }

  // Drop stale redlines from the store after this build cycle. Mutating the
  // store inside a StateField update would be a side-effect on a pure
  // function, so defer to the next microtask.
  if (stale.length > 0) {
    queueMicrotask(() => {
      const { removeRedline } = useScribeStore.getState()
      for (const id of stale) removeRedline(id)
    })
  }

  // Sort by `from`; at equal `from` mark-ranges come first so the builder
  // sees strictly non-decreasing positions even when a widget shares the
  // mark's start (rare but possible at line boundaries).
  items.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from
    if (!a.isWidget && b.isWidget) return -1
    if (a.isWidget && !b.isWidget) return 1
    return 0
  })

  const builder = new RangeSetBuilder<Decoration>()
  for (const it of items) builder.add(it.from, it.to, it.dec)
  console.log(`[Redline] HOP 4 buildDecorations: lines=${lines.length} items=${items.length} stale=${stale.length} docLen=${docLen} activeFilePath=${activeFilePath}`)
  return builder.finish()
}

// ── Apply / dismiss helpers ──────────────────────────────────────────────

function acceptRedline(view: EditorView, r: Redline): void {
  console.log('[acceptRedline] called', { id: r.id, commentId: r.commentId, filePath: r.filePath, from: r.from, to: r.to })
  const docLen = view.state.doc.length
  if (r.from < 0 || r.to > docLen || r.from >= r.to) {
    console.warn('[acceptRedline] stale range, dropping', r.id)
    useScribeStore.getState().removeRedline(r.id)
    return
  }
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: r.proposedText },
  })
  // Once the doc changes, any sibling redlines at the same range are stale
  // (their from/to no longer matches the original text). Remove them all.
  const { redlines, removeRedline } = useScribeStore.getState()
  for (const sib of redlines) {
    if (sib.filePath === r.filePath && sib.from === r.from && sib.to === r.to) {
      removeRedline(sib.id)
    }
  }
  // If this redline was created from an inline comment, mark that comment
  // resolved and persist the sidecar so the resolution survives reload.
  if (!r.commentId) {
    console.log('[acceptRedline] no commentId on redline — nothing to resolve')
    return
  }
  const { commentsByFile, upsertComment } = useScribeStore.getState()
  const list = commentsByFile[r.filePath] ?? []
  const c = list.find((x) => x.id === r.commentId)
  console.log('[acceptRedline] looking up comment', r.commentId, 'in', r.filePath, '→ found:', !!c, 'resolved:', c?.resolved)
  if (!c) {
    console.warn('[acceptRedline] comment not found in store — possibly deleted')
    return
  }
  if (c.resolved) {
    console.log('[acceptRedline] comment already resolved')
    return
  }
  const updated = { ...c, resolved: true }
  upsertComment(r.filePath, updated)
  const next = useScribeStore.getState().commentsByFile[r.filePath] ?? []
  console.log('[acceptRedline] resolved comment', r.commentId, '— total comments:', next.length, 'unresolved:', next.filter((x) => !x.resolved).length)
  // Belt-and-suspenders: also dispatch the comment refresh effect directly so
  // the comment plugin definitely rebuilds its decorations on this same tick,
  // independent of the Zustand subscriber. This nukes any timing edge case
  // where the subscriber dispatch might run after a competing update.
  view.dispatch({ effects: commentRefreshEffect.of(Date.now()) })
  void window.electronAPI.commentsWrite(r.filePath, next).catch((err) => {
    console.error('[acceptRedline] commentsWrite failed:', err)
  })
}

function rejectRedline(r: Redline): void {
  useScribeStore.getState().removeRedline(r.id)
}

// ── State field providing the decoration set ─────────────────────────────

const redlineDecorationsField = StateField.define<DecorationSet>({
  create(state) { return buildDecorations(state) },
  update(deco, tr) {
    if (tr.docChanged) return buildDecorations(tr.state)
    for (const e of tr.effects) {
      if (e.is(redlineRefreshEffect)) {
        console.log('[Redline] HOP 3 field rebuilding from refresh effect')
        return buildDecorations(tr.state)
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

// ── Companion view plugin: subscribe to Zustand → dispatch refresh ───────

const redlineStoreSubscriber = ViewPlugin.fromClass(
  class {
    unsub: () => void

    constructor(view: EditorView) {
      this.unsub = useScribeStore.subscribe((state, prev) => {
        const changed = state.redlines !== prev.redlines || state.activeFilePath !== prev.activeFilePath
        console.log(`[Redline] HOP 1 subscribe fired: redlines ${prev.redlines.length}→${state.redlines.length}, path=${state.activeFilePath}, changed=${changed}`)
        if (changed) {
          console.log('[Redline] HOP 2 dispatching refresh effect')
          view.dispatch({ effects: redlineRefreshEffect.of(Date.now()) })
        }
      })
    }

    destroy(): void { this.unsub() }
  }
)

// ── Public API ───────────────────────────────────────────────────────────

export function redlinePlugin(): Extension {
  return [redlineDecorationsField, redlineStoreSubscriber]
}
