import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { StateField, EditorState, RangeSetBuilder, Extension } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

/**
 * Live-preview rendering for GFM markdown tables — Obsidian-style.
 *
 * When the cursor is NOT inside a table, the table source lines are replaced
 * with a rendered HTML <table>. When the cursor enters any line of the table,
 * the widget vanishes and the source is editable. Clicking on the rendered
 * widget moves the caret into the source range, which automatically reveals it.
 *
 * Block-replace decorations must be provided through a StateField via
 * `EditorView.decorations.from(field)` (see docs/gotcha.md). A ViewPlugin
 * would silently drop them at layout time.
 *
 * Requires GFM Table extension to be enabled on the markdown parser
 * (markdownConfig.ts passes it through `markdown({ extensions: GFM })`).
 */

interface TableData {
  headers: string[]
  alignments: Array<'left' | 'center' | 'right' | null>
  rows: string[][]
}

class TableWidget extends WidgetType {
  constructor(private readonly data: TableData) { super() }

  eq(other: TableWidget): boolean {
    // Cheap structural equality so the editor can skip rebuilds when the
    // table source hasn't changed in any visible way.
    return JSON.stringify(other.data) === JSON.stringify(this.data)
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-md-table-wrap'

    const table = document.createElement('table')
    table.className = 'cm-md-table'

    const thead = document.createElement('thead')
    const headerTr = document.createElement('tr')
    for (let i = 0; i < this.data.headers.length; i++) {
      const th = document.createElement('th')
      th.textContent = this.data.headers[i]
      const align = this.data.alignments[i]
      if (align) th.style.textAlign = align
      headerTr.appendChild(th)
    }
    thead.appendChild(headerTr)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    for (const row of this.data.rows) {
      const tr = document.createElement('tr')
      for (let i = 0; i < this.data.headers.length; i++) {
        const td = document.createElement('td')
        td.textContent = row[i] ?? ''
        const align = this.data.alignments[i]
        if (align) td.style.textAlign = align
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)

    wrap.appendChild(table)
    return wrap
  }

  // ignoreEvent: false → clicks on the widget propagate to the editor, which
  // moves the caret into the source range. The very next selection-change
  // transaction will see cursor-in-table and unhide the source.
  ignoreEvent(): boolean { return false }
}

// ── Source parsing ──────────────────────────────────────────────────────

function splitRow(line: string): string[] {
  // Strip leading/trailing pipes if present, then split on unescaped pipes.
  // The negative lookbehind ((?<!\\)) preserves \| as a literal pipe inside
  // a cell (rare but valid in GFM tables).
  const stripped = line.trim().replace(/^\||\|$/g, '')
  return stripped.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
}

function parseTable(state: EditorState, from: number, to: number): TableData | null {
  const text = state.doc.sliceString(from, to)
  // Filter to non-empty lines that contain at least one pipe — the syntax
  // tree's Table node may include a trailing blank line.
  const lines = text.split('\n').filter((l) => l.trim().length > 0 && l.includes('|'))
  if (lines.length < 2) return null

  const headers = splitRow(lines[0])
  if (headers.length === 0) return null

  const alignParts = splitRow(lines[1])
  // Validate alignment row — every cell must look like ---, :---, ---:, or :---:
  if (!alignParts.every((p) => /^:?-+:?$/.test(p.trim()))) return null

  const alignments: Array<'left' | 'center' | 'right' | null> = alignParts.map((p) => {
    const t = p.trim()
    if (t.startsWith(':') && t.endsWith(':')) return 'center'
    if (t.endsWith(':')) return 'right'
    if (t.startsWith(':')) return 'left'
    return null
  })

  const rows: string[][] = []
  for (let i = 2; i < lines.length; i++) {
    rows.push(splitRow(lines[i]))
  }

  return { headers, alignments, rows }
}

// ── Decoration builder ─────────────────────────────────────────────────

function buildTableDecorations(state: EditorState): DecorationSet {
  const cursorPos = state.selection.main.head
  type Item = { from: number; to: number; dec: Decoration }
  const items: Item[] = []

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Table') return undefined

      // Snap to line boundaries — Decoration.replace with block: true requires
      // the range to start at a line start and end at a line end. The Table
      // node usually does this already; defensive snap is cheap.
      const fromLine = state.doc.lineAt(node.from)
      const toLine = state.doc.lineAt(node.to)
      const from = fromLine.from
      const to = toLine.to

      // Cursor anywhere inside the table block → show source, skip widget.
      if (cursorPos >= from && cursorPos <= to) return false

      const data = parseTable(state, from, to)
      if (!data) return false

      const widget = new TableWidget(data)
      items.push({
        from,
        to,
        dec: Decoration.replace({ widget, block: true }),
      })

      // Don't recurse into Table children (TableHeader, TableRow, etc.) —
      // we've handled the whole block.
      return false
    },
  })

  items.sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const it of items) builder.add(it.from, it.to, it.dec)
  return builder.finish()
}

// ── State field providing the decoration set ──────────────────────────

export const mdTableField: Extension = StateField.define<DecorationSet>({
  create(state) { return buildTableDecorations(state) },
  update(deco, tr) {
    // Rebuild when the doc changes (table content changed) OR when the
    // selection moves (cursor may have entered/left a table). Both are
    // cheap — the syntax tree walk is O(table-count).
    if (tr.docChanged || tr.selection) return buildTableDecorations(tr.state)
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})
