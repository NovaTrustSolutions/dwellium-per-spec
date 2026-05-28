/**
 * Shared CodeMirror 6 markdown configuration.
 *
 * Single source of truth for the Holocron markdown rendering — theme,
 * highlight style, and decoration plugins. Imported by both the main
 * document editor (ScribePane) and the Brain Dump compose surface (DumpMode)
 * so both surfaces highlight identically.
 *
 * Heading colors, accent colors, and code block styling are referenced in
 * MVP P2 and the user spec. Do not change colors here without updating the
 * spec — this module is the visual contract.
 */
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType, keymap, type Command } from '@codemirror/view'
import { RangeSetBuilder, Compartment } from '@codemirror/state'
import { syntaxHighlighting, syntaxTree } from '@codemirror/language'
// Session 9 audit: `resolveTheme` is re-exported on its own at line 274 (no
// local use); `HighlightStyle` (from @codemirror/language) and `tags`
// (@lezer/highlight) were leftovers from the in-file highlight table that
// moved into scribeThemes.ts. All three import-level entries were unused.
import { buildHighlightStyle, HOLOCRON_DEFAULT, type ScribeColorTheme } from './scribeThemes'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { mdTableField } from './tablePlugin'
import { basicSetup } from 'codemirror'
import { closeBrackets } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'

// ── Theme ────────────────────────────────────────────────────────────────────

export const holocronTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: '#141414',
      color: '#ffffff',
      fontSize: '13px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    },
    '.cm-content': {
      padding: '28px 40px',
      caretColor: '#ffffff',
      lineHeight: '1.75',
      maxWidth: '780px',
      margin: '0 auto'
    },
    '.cm-focused': { outline: 'none' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor': { borderLeftColor: '#ffffff', borderLeftWidth: '2px' },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(10,132,255,0.3) !important'
    },
    '.cm-gutters': {
      backgroundColor: '#141414',
      borderRight: '1px solid #2c2c2e',
      minWidth: '44px'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      color: '#8a8a9a',
      fontSize: '12px',
      paddingRight: '12px'
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#636366' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-scroller': { overflow: 'auto', height: '100%' },
    '.cm-inline-code': {
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderRadius: '3px',
      padding: '0 3px',
      fontFamily: 'inherit'
    },
    '.cm-md-mark-dim':    { opacity: '0', fontSize: '0' },
    '.cm-list-bullet':    { color: '#ff6b6b' },
    '.cm-list-ordered':   { color: '#ff6b6b' },
    '.cm-blockquote-mark': { color: '#ff2d78' },
    '.cm-hr': {
      display: 'block',
      border: 'none',
      borderTop: '1px solid #48484a',
      margin: '12px 0',
      height: '0',
      width: '100%',
    },
    '.cm-highlight': {
      background: 'rgba(255,214,10,0.25)',
      color: '#ffd60a',
      borderRadius: '3px',
      padding: '0 2px',
    },
    '.cm-fenced-code': {
      backgroundColor: '#1a1a2e',
      borderLeft: '3px solid #0a84ff',
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    },

    // ── Redline (P5) — DATA_MODEL §6 visual rules ────────────────────────
    // Red tint on the original sentence; OVERRIDES syntax highlighting.
    '.cm-redline-original': {
      backgroundColor: 'rgba(255,45,120,0.15) !important',
      color: '#ff8db5 !important',
      // Strip syntax-color spans inside this mark so the red wins everywhere.
      textShadow: 'none !important',
    },
    '.cm-redline-original *': {
      color: '#ff8db5 !important',
      backgroundColor: 'transparent !important',
    },
    // Outer block-widget container. CodeMirror measures THIS element — it
    // must have no vertical margin (margins on block widgets cause measure-
    // loop bail-outs). Spacing around the yellow card lives here as padding.
    '.cm-redline-block': {
      padding: '6px 0 10px',
    },
    // Inner card holding the proposed text + actions. Claude-Code-style:
    // yellow text on a green-tinted background to signal "additive change".
    '.cm-redline-proposed-wrap': {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      padding: '8px 10px 8px 14px',
      backgroundColor: 'rgba(48,209,88,0.14)',
      borderLeft: '3px solid #30d158',
      borderRadius: '4px',
    },
    '.cm-redline-proposed-body': {
      flex: '1',
      color: '#ffe680',
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word',
      fontFamily: 'inherit',
      lineHeight: '1.6',
    },
    '.cm-redline-actions': {
      display: 'flex',
      gap: '6px',
      flexShrink: '0',
      alignItems: 'center',
    },
    '.cm-redline-btn': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      height: '30px',
      padding: '0 14px',
      borderRadius: '999px',
      border: '1px solid transparent',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: '600',
      fontFamily: 'inherit',
      lineHeight: '1',
      letterSpacing: '0.01em',
      transition: 'background 120ms, color 120ms, border-color 120ms, transform 80ms',
    },
    '.cm-redline-btn:active': { transform: 'scale(0.97)' },
    '.cm-redline-glyph': { fontSize: '13px', lineHeight: '1', display: 'inline-block', transform: 'translateY(-0.5px)' },
    '.cm-redline-label': { fontSize: '12px', lineHeight: '1' },
    '.cm-redline-accept': {
      background: '#30d158',
      color: '#0b1f10',
      borderColor: 'rgba(48,209,88,0.5)',
    },
    '.cm-redline-accept:hover': { background: '#3ddf66', borderColor: '#30d158' },
    '.cm-redline-reject': {
      background: 'rgba(255,45,120,0.14)',
      color: '#ff85ab',
      borderColor: 'rgba(255,45,120,0.45)',
    },
    '.cm-redline-reject:hover': { background: 'rgba(255,45,120,0.24)', borderColor: '#ff2d78', color: '#ff9fbb' },

    // ── Markdown table live-preview (tablePlugin.ts) ─────────────────────
    // The whole table block is replaced with a real <table> when the cursor
    // is elsewhere; cursor-on-table reveals the source.
    '.cm-md-table-wrap': {
      margin: '12px 0',
      overflow: 'auto',
    },
    '.cm-md-table': {
      borderCollapse: 'collapse',
      fontSize: '13px',
      fontFamily: 'inherit',
      background: 'transparent',
      width: 'fit-content',
      maxWidth: '100%',
    },
    '.cm-md-table th, .cm-md-table td': {
      border: '1px solid var(--border-default)',
      padding: '7px 12px',
      textAlign: 'left',
      verticalAlign: 'top',
      color: 'var(--text-primary)',
      lineHeight: '1.5',
    },
    '.cm-md-table th': {
      background: 'rgba(255,255,255,0.05)',
      fontWeight: 700,
      fontSize: '11px',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: 'var(--accent)',
    },
    '.cm-md-table tr:nth-child(even) td': {
      background: 'rgba(255,255,255,0.02)',
    },

    // ── Inline comments (Fix 4) — distinct amber/yellow underline ────────
    '.cm-comment-marked': {
      borderBottom: '2px solid rgba(255,214,10,0.65)',
      cursor: 'pointer',
    },
    '.cm-comment-marked:hover': {
      borderBottom: '2px solid #ffd60a',
      backgroundColor: 'rgba(255,214,10,0.08)',
    },
    '.cm-comment-marked-resolved': {
      borderBottom: '2px dotted rgba(138,138,154,0.5)',
      cursor: 'pointer',
    },
    '.cm-comment-indicator': {
      display: 'inline-block',
      marginLeft: '6px',
      fontSize: '11px',
      cursor: 'pointer',
      opacity: '0.7',
      transition: 'opacity 100ms',
      verticalAlign: 'middle',
    },
    '.cm-comment-indicator:hover': { opacity: '1' },
    '.cm-comment-resolved': { opacity: '0.4' },
  },
  { dark: true }
)

// ── Syntax highlight style ────────────────────────────────────────────────────
// Driven by an ScribeColorTheme (see scribeThemes.ts). The default preset
// "Holocron Default" captures the previous hardcoded colors verbatim — zero
// visual regression for users who never touch the new Editor settings tab.

/** @deprecated since 2026-05-08 — kept for back-compat with anything that
 *  imports the old constant. New code should use `buildHighlightStyle(theme)`
 *  with the active theme from `useSettingsStore().config.editorTheme`. */
export const markdownHighlightStyle = buildHighlightStyle(HOLOCRON_DEFAULT)

// Compartment that wraps the syntax highlighting so it can be live-swapped
// when the user changes the editor color theme. The view registry below
// tracks every active CodeMirror view so theme changes broadcast to all of
// them (ScribePane, DumpMode, future surfaces) without per-component
// subscription wiring.
const themeCompartment = new Compartment()
const activeViews = new Set<EditorView>()

/** Register a CodeMirror view to receive live theme updates. Returns an
 *  unregister function the caller invokes on view destroy. */
export function registerEditorView(view: EditorView): () => void {
  activeViews.add(view)
  return () => { activeViews.delete(view) }
}

/** Apply a new editor color theme to all registered views. Called by the
 *  editor-theme store whenever the active theme or its tokens change. */
export function applyEditorThemeToAllViews(theme: ScribeColorTheme): void {
  const newStyle = buildHighlightStyle(theme)
  const newExtension = syntaxHighlighting(newStyle)
  for (const view of activeViews) {
    view.dispatch({ effects: themeCompartment.reconfigure(newExtension) })
  }
}

/** Build the syntax-highlighting extension for an initial editor mount.
 *  Wraps the active theme's HighlightStyle in the Compartment so future
 *  reconfigure calls work on this view too. */
export function makeEditorThemeExtension(theme: ScribeColorTheme = HOLOCRON_DEFAULT) {
  return themeCompartment.of(syntaxHighlighting(buildHighlightStyle(theme)))
}

// Re-export the resolver so callers can pull a theme by name from config.
export { resolveTheme } from './scribeThemes'
export type { ScribeColorTheme, ScribeTokenKey, ScribeTokens } from './scribeThemes'

// ── Mark-hiding ViewPlugin ────────────────────────────────────────────────────
// Hides *, **, #, ` markup characters on lines where the cursor is absent.

const hiddenMark = Decoration.mark({ class: 'cm-md-mark-dim' })
const hiddenRange = Decoration.replace({})

const MARK_NODES = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'LinkMark',
])

function buildMarkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number
  const pending: Array<{ from: number; to: number; replace: boolean }> = []

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (MARK_NODES.has(node.name)) {
          const markLine = view.state.doc.lineAt(node.from).number
          if (markLine !== cursorLine) {
            if (node.name === 'HeaderMark') {
              const lineEnd = view.state.doc.lineAt(node.from).to
              pending.push({ from: node.from, to: Math.min(node.to + 1, lineEnd), replace: true })
            } else {
              pending.push({ from: node.from, to: node.to, replace: false })
            }
          }
        }
      }
    })
  }

  pending.sort((a, b) => a.from - b.from || a.to - b.to)
  let lastTo = -1
  for (const { from, to, replace } of pending) {
    if (from >= lastTo) {
      builder.add(from, to, replace ? hiddenRange : hiddenMark)
      lastTo = to
    }
  }

  return builder.finish()
}

export const markHidingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildMarkDecorations(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildMarkDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

// ── List marker ViewPlugin ────────────────────────────────────────────────────

const bulletDecoration   = Decoration.mark({ class: 'cm-list-bullet' })
const orderedDecoration  = Decoration.mark({ class: 'cm-list-ordered' })

function buildListDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const pending: Array<{ from: number; to: number; ordered: boolean }> = []

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'ListMark') {
          const marker = view.state.doc.sliceString(node.from, node.to)
          pending.push({ from: node.from, to: node.to, ordered: /^\d/.test(marker) })
        }
      }
    })
  }

  pending.sort((a, b) => a.from - b.from)
  let lastTo = -1
  for (const { from, to, ordered } of pending) {
    if (from >= lastTo) {
      builder.add(from, to, ordered ? orderedDecoration : bulletDecoration)
      lastTo = to
    }
  }
  return builder.finish()
}

export const listMarkerPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildListDecorations(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildListDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

// ── Blockquote mark ViewPlugin ────────────────────────────────────────────────

const quoteMarkDecoration = Decoration.mark({ class: 'cm-blockquote-mark' })

function buildQuoteDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const pending: Array<{ from: number; to: number }> = []

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'QuoteMark') {
          pending.push({ from: node.from, to: node.to })
        }
      }
    })
  }

  pending.sort((a, b) => a.from - b.from)
  let lastTo = -1
  for (const { from, to } of pending) {
    if (from >= lastTo) {
      builder.add(from, to, quoteMarkDecoration)
      lastTo = to
    }
  }
  return builder.finish()
}

export const quoteMarkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildQuoteDecorations(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildQuoteDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

// ── Horizontal rule ViewPlugin ────────────────────────────────────────────────

class HrWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('hr')
    el.className = 'cm-hr'
    el.style.cssText = 'display:block;border:none;border-top:1px solid #48484a;margin:12px 0;height:0;width:100%;'
    return el
  }
  eq(): boolean { return true }
  ignoreEvent(): boolean { return false }
}

const hrWidgetDec = Decoration.replace({ widget: new HrWidget() })

function buildHrDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number
  const pending: Array<{ from: number; to: number }> = []
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter(node) {
        if (node.name === 'HorizontalRule') {
          const hrLine = view.state.doc.lineAt(node.from).number
          if (hrLine !== cursorLine) {
            pending.push({ from: node.from, to: node.to })
          }
        }
      }
    })
  }
  pending.sort((a, b) => a.from - b.from)
  let lastTo = -1
  for (const { from, to } of pending) {
    if (from >= lastTo) {
      builder.add(from, to, hrWidgetDec)
      lastTo = to
    }
  }
  return builder.finish()
}

export const hrPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildHrDecorations(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildHrDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

// ── ==highlight== ViewPlugin ──────────────────────────────────────────────────

const highlightDec = Decoration.mark({ class: 'cm-highlight' })

function buildHighlightDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const re = /==([^=\n]+)==/g
  const pending: Array<{ from: number; to: number }> = []
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text)) !== null) {
      pending.push({ from: from + m.index, to: from + m.index + m[0].length })
    }
  }
  pending.sort((a, b) => a.from - b.from)
  for (const { from, to } of pending) {
    builder.add(from, to, highlightDec)
  }
  return builder.finish()
}

export const highlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildHighlightDecorations(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildHighlightDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

// ── Fenced code block ViewPlugin ──────────────────────────────────────────────

const codeBlockLineDec = Decoration.line({ class: 'cm-fenced-code' })

function buildFencedCodeDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const positions = new Set<number>()
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter(node) {
        if (node.name === 'FencedCode') {
          const clampedFrom = Math.max(node.from, from)
          const clampedTo = Math.min(node.to, to)
          if (clampedFrom >= clampedTo) return
          const startLine = view.state.doc.lineAt(clampedFrom).number
          const endLine = view.state.doc.lineAt(clampedTo - 1).number
          for (let ln = startLine; ln <= endLine; ln++) {
            positions.add(view.state.doc.line(ln).from)
          }
        }
      }
    })
  }
  for (const pos of [...positions].sort((a, b) => a - b)) {
    builder.add(pos, pos, codeBlockLineDec)
  }
  return builder.finish()
}

export const fencedCodePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildFencedCodeDecorations(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildFencedCodeDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

// ── Double-space → period (iOS-style) ────────────────────────────────────────
// Typing two spaces in a row mid-sentence becomes ". ". An updateListener
// (post-change) is more reliable than inputHandler (pre-change): rapid space
// inputs in CM6 can fire with the same `from` value before the prior space
// is applied to the doc, so an inputHandler never sees the trailing space.
// Watching the doc *after* it updates avoids that timing problem entirely.

const DSP_USER_EVENT = 'input.dsp.replace'

function isSentenceTerminator(ch: string): boolean {
  return ch === '.' || ch === '!' || ch === '?' || ch === ':' || ch === ';' || ch === ','
}

function isInsideCode(view: EditorView, pos: number): boolean {
  const tree = syntaxTree(view.state)
  let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, -1)
  while (node) {
    const n = node.name
    if (n === 'FencedCode' || n === 'CodeBlock' || n === 'InlineCode') return true
    node = node.parent
  }
  return false
}

export const doubleSpacePeriod = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return
  if (update.transactions.some((tr) => tr.isUserEvent(DSP_USER_EVENT))) return

  const sel = update.state.selection.main
  if (!sel.empty) return
  const cursor = sel.head
  if (cursor < 3) return

  const tail = update.state.doc.sliceString(cursor - 3, cursor)
  if (tail[1] !== ' ' || tail[2] !== ' ') return
  const c = tail[0]
  if (c === ' ' || c === '\n' || c === '\t' || isSentenceTerminator(c)) return

  // Confirm at least one of the two trailing spaces came from this update —
  // avoids firing on cursor movement into pre-existing "  ".
  let recentSpace = false
  update.changes.iterChanges((_fA, _tA, _fB, toB, inserted) => {
    if (inserted.toString().includes(' ') && toB <= cursor && toB >= cursor - 2) recentSpace = true
  })
  if (!recentSpace) return

  if (isInsideCode(update.view, cursor)) return

  const view = update.view
  Promise.resolve().then(() => {
    view.dispatch({
      changes: { from: cursor - 2, to: cursor, insert: '. ' },
      selection: { anchor: cursor },
      userEvent: DSP_USER_EVENT,
    })
  })
})

// ── Smart Paste ─────────────────────────────────────────────────────────────
// Cmd+Shift+V: strip the hard ~80-char line breaks that Claude/Opus introduce
// in their chat output, while preserving markdown structure (headers, lists,
// blockquotes, tables, code fences) and intentional paragraph breaks (double
// newlines).
// Cmd+Shift+Opt+V: collapse all whitespace to single spaces. One wall of text.
// Cmd+V (default) is left untouched — pastes verbatim.
// See architecture-v2.md §"Planned: Editor Enhancements — Feature 2" for spec.

const MD_STRUCTURE_RE = /^(\s*)([#>]|[-*+]\s|\d+\.\s|\|)/

function startsWithStructure(line: string): boolean {
  return MD_STRUCTURE_RE.test(line)
}

function endsWithTerminator(line: string): boolean {
  const last = line.trimEnd().slice(-1)
  return last === '.' || last === '!' || last === '?' || last === ':' || last === ';'
}

function smartMergeProse(lines: string[]): string {
  // Merge adjacent non-empty lines unless line N ends with terminal punctuation
  // OR line N+1 starts with markdown structure. Single space joiner.
  const out: string[] = []
  for (const cur of lines) {
    if (out.length === 0) { out.push(cur); continue }
    const prev = out[out.length - 1]
    if (prev.trim() === '' || cur.trim() === '') { out.push(cur); continue }
    if (endsWithTerminator(prev)) { out.push(cur); continue }
    if (startsWithStructure(cur)) { out.push(cur); continue }
    out[out.length - 1] = prev.trimEnd() + ' ' + cur.trimStart()
  }
  return out.join('\n')
}

function smartPasteTransform(text: string): string {
  // Split into blocks by double newlines (paragraph breaks). Each block is
  // either a code fence (preserve verbatim) or prose (merge soft-wraps).
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = normalized.split(/\n\n+/)
  const processed = blocks.map((block) => {
    const lines = block.split('\n')
    // Code fence detection: any line in the block starts with ```.
    // Conservative — preserve the whole block verbatim if so.
    if (lines.some((l) => /^\s*```/.test(l))) return block
    return smartMergeProse(lines)
  })
  return processed.join('\n\n')
}

function rawPasteTransform(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export const smartPaste: Command = (view) => {
  void (async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return
      view.dispatch(view.state.replaceSelection(smartPasteTransform(text)))
    } catch (err) {
      console.warn('[SmartPaste] clipboard read failed:', err)
    }
  })()
  return true
}

export const rawPaste: Command = (view) => {
  void (async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return
      view.dispatch(view.state.replaceSelection(rawPasteTransform(text)))
    } catch (err) {
      console.warn('[RawPaste] clipboard read failed:', err)
    }
  })()
  return true
}

export const smartPasteKeymap = keymap.of([
  { key: 'Mod-Shift-v', run: smartPaste },
  { key: 'Mod-Shift-Alt-v', run: rawPaste },
])

// ── Bundled extension array ─────────────────────────────────────────────────
// Returns the shared markdown setup for any CodeMirror surface in Holocron.
// Callers compose their own keymaps / update listeners on top.

export function getMarkdownExtensions(): Extension[] {
  return [
    closeBrackets(),
    basicSetup,
    // Pass the GFM Table extension so the lezer parser produces Table nodes
    // for the syntax-tree walker in tablePlugin.ts.
    markdown({ extensions: [Table] }),
    // Wrap the highlight style in a Compartment so it can be live-swapped
    // when the user changes the editor theme. See registerEditorView /
    // applyEditorThemeToAllViews above.
    makeEditorThemeExtension(HOLOCRON_DEFAULT),
    markHidingPlugin,
    listMarkerPlugin,
    quoteMarkPlugin,
    hrPlugin,
    highlightPlugin,
    fencedCodePlugin,
    mdTableField,
    doubleSpacePeriod,
    smartPasteKeymap,
    holocronTheme,
    EditorView.lineWrapping,
  ]
}
