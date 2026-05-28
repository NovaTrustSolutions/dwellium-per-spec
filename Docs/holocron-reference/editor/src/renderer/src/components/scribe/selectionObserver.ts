import { EditorView, ViewPlugin, type ViewUpdate, type PluginValue } from '@codemirror/view'
import { useScribeStore } from '../../store/scribeStore'

/**
 * CodeMirror plugin that watches text selections in the editor and
 * publishes the floating-toolbar state to the editor store. The React
 * <SelectionToolbar /> reads this state and renders the toolbar at the
 * computed viewport coords.
 *
 * Toolbar appears on `mouseup` after a non-empty selection settles.
 * Disappears on click-elsewhere (handled by the toolbar component) and
 * on selection becoming empty.
 */
export function selectionObserver(getActivePath: () => string | null): ViewPlugin<PluginValue> {
  return ViewPlugin.fromClass(
    class {
      view: EditorView
      pending = false
      mouseUpHandler: () => void

      constructor(view: EditorView) {
        this.view = view
        // mouseup signals "user finished dragging" — only then do we publish
        // the toolbar so it doesn't flicker during selection drag.
        this.mouseUpHandler = (): void => { this.publishIfSelected() }
        view.dom.addEventListener('mouseup', this.mouseUpHandler)
      }

      update(u: ViewUpdate): void {
        // Selection cleared (e.g. by typing) → hide toolbar immediately.
        if (u.selectionSet) {
          const sel = u.state.selection.main
          if (sel.from === sel.to) {
            const cur = useScribeStore.getState().selectionToolbar
            if (cur) useScribeStore.getState().setSelectionToolbar(null)
          }
        }
        if (u.docChanged) {
          // Edits invalidate any toolbar state.
          const cur = useScribeStore.getState().selectionToolbar
          if (cur) useScribeStore.getState().setSelectionToolbar(null)
        }
      }

      publishIfSelected(): void {
        const view = this.view
        const sel = view.state.selection.main
        if (sel.from === sel.to) {
          useScribeStore.getState().setSelectionToolbar(null)
          return
        }
        const filePath = getActivePath()
        if (!filePath) return

        const text = view.state.doc.sliceString(sel.from, sel.to)
        const fromLine = view.state.doc.lineAt(sel.from).number
        const toLine = view.state.doc.lineAt(sel.to).number

        // Position toolbar centered above the first line of the selection.
        // Use the actual DOM selection's getClientRects() — it returns one
        // rect per visual line of the selection, so rects[0] is the first
        // line's bounding box. Centering on that rect's midpoint is what the
        // user perceives as "centered over the first line of the selection".
        // CodeMirror's coordsAtPos returns cursor-placement coords (zero-
        // width), which weren't aligning with the visual selection bounds.
        let left: number
        let anchorTop: number
        const domSel = window.getSelection()
        if (domSel && domSel.rangeCount > 0 && !domSel.isCollapsed) {
          const range = domSel.getRangeAt(0)
          const rects = range.getClientRects()
          if (rects.length === 0) return
          const firstRect = rects[0]
          left = firstRect.left + firstRect.width / 2
          anchorTop = firstRect.top
        } else {
          // Fallback path — no DOM selection (e.g. programmatic selection
          // before DOM has caught up). Use coordsAtPos so we still publish
          // SOMETHING rather than dropping the pill entirely.
          const c = view.coordsAtPos(sel.from)
          if (!c) return
          left = c.left
          anchorTop = c.top
        }

        // Diagnostic — paste back if pill still looks off.
        console.log('[PillCenter]', {
          selFrom: sel.from,
          selTo: sel.to,
          multiLine: fromLine !== toLine,
          method: domSel && !domSel.isCollapsed ? 'getClientRects' : 'fallback',
          calculatedLeft: left,
          anchorTop,
          windowInnerWidth: window.innerWidth,
        })

        useScribeStore.getState().setSelectionToolbar({
          filePath,
          x: left,
          y: anchorTop,
          from: sel.from,
          to: sel.to,
          fromLine,
          toLine,
          text,
        })
      }

      destroy(): void {
        this.view.dom.removeEventListener('mouseup', this.mouseUpHandler)
      }
    },
  )
}
