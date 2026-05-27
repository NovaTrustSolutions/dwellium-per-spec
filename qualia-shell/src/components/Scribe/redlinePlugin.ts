/**
 * Redline rendering for CodeMirror.
 *
 * Pulls pending redlines from scribeStore and renders:
 *   - A red mark over the original range
 *   - A block widget below the original line with proposed text + Accept/Reject
 *
 * Ported from Holocron's redlinePlugin.ts (Cycle 6). Removed: debug
 * console.logs, commentPlugin cross-ref (Cycle 7), Electron IPC.
 */
import { EditorView, ViewPlugin, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { useScribeStore, type Redline } from './scribeStore';

export const redlineRefreshEffect = StateEffect.define<number>();

class RedlineWidget extends WidgetType {
    constructor(private readonly redline: Redline) { super(); }

    eq(other: RedlineWidget): boolean {
        return other.redline.id === this.redline.id
            && other.redline.proposedText === this.redline.proposedText;
    }

    toDOM(view: EditorView): HTMLElement {
        const block = document.createElement('div');
        block.className = 'cm-redline-block';

        const wrap = document.createElement('div');
        wrap.className = 'cm-redline-proposed-wrap';

        const body = document.createElement('div');
        body.className = 'cm-redline-proposed-body';
        body.textContent = this.redline.proposedText;

        if (this.redline.rationale) {
            const rationale = document.createElement('div');
            rationale.style.cssText = 'font-size:11px;color:#808080;font-style:italic;margin-top:4px;';
            rationale.textContent = this.redline.rationale;
            body.appendChild(rationale);
        }

        const actions = document.createElement('div');
        actions.className = 'cm-redline-actions';

        const accept = document.createElement('button');
        accept.className = 'cm-redline-btn cm-redline-accept';
        accept.title = 'Accept replacement';
        accept.innerHTML = '<span class="cm-redline-glyph">✓</span><span class="cm-redline-label">Accept</span>';
        accept.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); acceptRedline(view, this.redline); };

        const reject = document.createElement('button');
        reject.className = 'cm-redline-btn cm-redline-reject';
        reject.title = 'Reject replacement';
        reject.innerHTML = '<span class="cm-redline-glyph">✗</span><span class="cm-redline-label">Reject</span>';
        reject.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); rejectRedline(this.redline); };

        actions.appendChild(accept);
        actions.appendChild(reject);
        wrap.appendChild(body);
        wrap.appendChild(actions);
        block.appendChild(wrap);
        return block;
    }

    ignoreEvent(): boolean { return false; }
}

const originalMark = Decoration.mark({ class: 'cm-redline-original' });

function buildDecorations(state: EditorState): DecorationSet {
    const { redlines, activeFilepath } = useScribeStore.getState();
    if (!activeFilepath) return Decoration.none;

    const pending = redlines.filter((r) => r.filepath === activeFilepath && r.state === 'pending');
    if (pending.length === 0) return Decoration.none;

    const docLen = state.doc.length;
    type Item = { from: number; to: number; dec: Decoration; isWidget: boolean };
    const items: Item[] = [];
    const markedRanges = new Set<string>();
    const stale: string[] = [];

    for (const r of pending) {
        if (r.from < 0 || r.to > docLen || r.from >= r.to) {
            stale.push(r.id);
            continue;
        }
        const key = `${r.from}:${r.to}`;
        if (!markedRanges.has(key)) {
            items.push({ from: r.from, to: r.to, dec: originalMark, isWidget: false });
            markedRanges.add(key);
        }
        const lineEnd = state.doc.lineAt(r.to).to;
        const widget = Decoration.widget({
            widget: new RedlineWidget(r),
            side: 1,
            block: true,
        });
        items.push({ from: lineEnd, to: lineEnd, dec: widget, isWidget: true });
    }

    if (stale.length > 0) {
        queueMicrotask(() => {
            for (const id of stale) useScribeStore.getState().removeRedline(id);
        });
    }

    items.sort((a, b) => {
        if (a.from !== b.from) return a.from - b.from;
        if (!a.isWidget && b.isWidget) return -1;
        if (a.isWidget && !b.isWidget) return 1;
        return 0;
    });

    const builder = new RangeSetBuilder<Decoration>();
    for (const it of items) builder.add(it.from, it.to, it.dec);
    return builder.finish();
}

function acceptRedline(view: EditorView, r: Redline): void {
    const docLen = view.state.doc.length;
    if (r.from < 0 || r.to > docLen || r.from >= r.to) {
        useScribeStore.getState().removeRedline(r.id);
        return;
    }
    view.dispatch({ changes: { from: r.from, to: r.to, insert: r.proposedText } });
    const { redlines, removeRedline } = useScribeStore.getState();
    for (const sib of redlines) {
        if (sib.filepath === r.filepath && sib.from === r.from && sib.to === r.to) {
            removeRedline(sib.id);
        }
    }
}

function rejectRedline(r: Redline): void {
    useScribeStore.getState().removeRedline(r.id);
}

const redlineDecorationsField = StateField.define<DecorationSet>({
    create(state) { return buildDecorations(state); },
    update(deco, tr) {
        if (tr.docChanged) return buildDecorations(tr.state);
        for (const e of tr.effects) {
            if (e.is(redlineRefreshEffect)) return buildDecorations(tr.state);
        }
        return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
});

const redlineStoreSubscriber = ViewPlugin.fromClass(
    class {
        unsub: () => void;
        constructor(view: EditorView) {
            this.unsub = useScribeStore.subscribe((state, prev) => {
                if (state.redlines !== prev.redlines || state.activeFilepath !== prev.activeFilepath) {
                    view.dispatch({ effects: redlineRefreshEffect.of(Date.now()) });
                }
            });
        }
        destroy(): void { this.unsub(); }
    },
);

export function redlinePlugin(): Extension {
    return [redlineDecorationsField, redlineStoreSubscriber];
}
