import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { StateField, EditorState, RangeSetBuilder, type Extension } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

interface TableData {
    headers: string[];
    alignments: Array<'left' | 'center' | 'right' | null>;
    rows: string[][];
}

class TableWidget extends WidgetType {
    constructor(private readonly data: TableData) { super(); }

    eq(other: TableWidget): boolean {
        return JSON.stringify(other.data) === JSON.stringify(this.data);
    }

    toDOM(): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'cm-md-table-wrap';
        const table = document.createElement('table');
        table.className = 'cm-md-table';
        const thead = document.createElement('thead');
        const headerTr = document.createElement('tr');
        for (let i = 0; i < this.data.headers.length; i++) {
            const th = document.createElement('th');
            th.textContent = this.data.headers[i];
            const align = this.data.alignments[i];
            if (align) th.style.textAlign = align;
            headerTr.appendChild(th);
        }
        thead.appendChild(headerTr);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const row of this.data.rows) {
            const tr = document.createElement('tr');
            for (let i = 0; i < this.data.headers.length; i++) {
                const td = document.createElement('td');
                td.textContent = row[i] ?? '';
                const align = this.data.alignments[i];
                if (align) td.style.textAlign = align;
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        wrap.appendChild(table);
        return wrap;
    }

    ignoreEvent(): boolean { return false; }
}

function splitRow(line: string): string[] {
    const stripped = line.trim().replace(/^\||\|$/g, '');
    return stripped.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

function parseTable(state: EditorState, from: number, to: number): TableData | null {
    const text = state.doc.sliceString(from, to);
    const lines = text.split('\n').filter((l) => l.trim().length > 0 && l.includes('|'));
    if (lines.length < 2) return null;
    const headers = splitRow(lines[0]);
    if (headers.length === 0) return null;
    const alignParts = splitRow(lines[1]);
    if (!alignParts.every((p) => /^:?-+:?$/.test(p.trim()))) return null;
    const alignments: Array<'left' | 'center' | 'right' | null> = alignParts.map((p) => {
        const t = p.trim();
        if (t.startsWith(':') && t.endsWith(':')) return 'center';
        if (t.endsWith(':')) return 'right';
        if (t.startsWith(':')) return 'left';
        return null;
    });
    const rows: string[][] = [];
    for (let i = 2; i < lines.length; i++) {
        rows.push(splitRow(lines[i]));
    }
    return { headers, alignments, rows };
}

function buildTableDecorations(state: EditorState): DecorationSet {
    const cursorPos = state.selection.main.head;
    type Item = { from: number; to: number; dec: Decoration };
    const items: Item[] = [];
    syntaxTree(state).iterate({
        enter(node) {
            if (node.name !== 'Table') return undefined;
            const fromLine = state.doc.lineAt(node.from);
            const toLine = state.doc.lineAt(node.to);
            const from = fromLine.from;
            const to = toLine.to;
            if (cursorPos >= from && cursorPos <= to) return false;
            const data = parseTable(state, from, to);
            if (!data) return false;
            const widget = new TableWidget(data);
            items.push({ from, to, dec: Decoration.replace({ widget, block: true }) });
            return false;
        },
    });
    items.sort((a, b) => a.from - b.from);
    const builder = new RangeSetBuilder<Decoration>();
    for (const it of items) builder.add(it.from, it.to, it.dec);
    return builder.finish();
}

export const mdTableField: Extension = StateField.define<DecorationSet>({
    create(state) { return buildTableDecorations(state); },
    update(deco, tr) {
        if (tr.docChanged || tr.selection) return buildTableDecorations(tr.state);
        return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
});
