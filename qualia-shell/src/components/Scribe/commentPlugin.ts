/**
 * Comment rendering for CodeMirror.
 *
 * Pulls open comments from scribeStore and renders:
 *   - An amber underline mark over the commented range
 *   - A 💬 widget at end-of-range; clicking opens CommentEditor
 *
 * Anchor remapping: when the doc changes, comment from/to are mapped
 * through the transaction's ChangeDesc via the updateListener.
 *
 * Ported from Holocron's commentPlugin.ts (Cycle 7).
 */
import { EditorView, ViewPlugin, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { useScribeStore, type DocComment } from './scribeStore';

export const commentRefreshEffect = StateEffect.define<number>();

class CommentIndicatorWidget extends WidgetType {
    constructor(private readonly comment: DocComment) { super(); }
    eq(other: CommentIndicatorWidget): boolean {
        return other.comment.id === this.comment.id && other.comment.status === this.comment.status;
    }
    toDOM(): HTMLElement {
        const span = document.createElement('span');
        span.className = this.comment.status === 'resolved'
            ? 'cm-comment-indicator cm-comment-resolved'
            : 'cm-comment-indicator';
        span.title = this.comment.body || 'Open comment';
        span.textContent = '';
        span.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            useScribeStore.getState().setEditingCommentId(this.comment.id);
        };
        return span;
    }
    ignoreEvent(): boolean { return false; }
}

function buildDecorations(state: EditorState): DecorationSet {
    const { comments, activeFilepath } = useScribeStore.getState();
    if (!activeFilepath) return Decoration.none;
    const fileComments = comments.filter((c) => c.filepath === activeFilepath && c.status === 'open');
    if (fileComments.length === 0) return Decoration.none;

    const docLen = state.doc.length;
    type Item = { from: number; to: number; dec: Decoration; isWidget: boolean };
    const items: Item[] = [];

    for (const c of fileComments) {
        const from = Math.max(0, Math.min(c.from, docLen));
        const to = Math.max(from, Math.min(c.to, docLen));
        if (from >= to) continue;

        items.push({
            from, to,
            dec: Decoration.mark({ class: 'cm-comment-marked', attributes: { 'data-comment-id': c.id } }),
            isWidget: false,
        });
        items.push({
            from: to, to,
            dec: Decoration.widget({ widget: new CommentIndicatorWidget(c), side: 1 }),
            isWidget: true,
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

const commentDecorationsField: Extension = StateField.define<DecorationSet>({
    create(state) { return buildDecorations(state); },
    update(deco, tr) {
        if (tr.docChanged) {
            const filepath = useScribeStore.getState().activeFilepath;
            if (filepath) {
                useScribeStore.getState().remapCommentAnchors(filepath, (pos, assoc) =>
                    tr.changes.mapPos(pos, assoc)
                );
            }
            return buildDecorations(tr.state);
        }
        for (const e of tr.effects) {
            if (e.is(commentRefreshEffect)) return buildDecorations(tr.state);
        }
        return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
});

let persistTimer: ReturnType<typeof setTimeout> | null = null;

const commentStoreSubscriber = ViewPlugin.fromClass(
    class {
        unsub: () => void;
        view: EditorView;

        constructor(view: EditorView) {
            this.view = view;
            this.unsub = useScribeStore.subscribe((state, prev) => {
                if (state.comments !== prev.comments || state.activeFilepath !== prev.activeFilepath) {
                    view.dispatch({ effects: commentRefreshEffect.of(Date.now()) });

                    if (persistTimer) clearTimeout(persistTimer);
                    const fp = state.activeFilepath;
                    if (fp) {
                        persistTimer = setTimeout(() => {
                            void useScribeStore.getState().persistComments(fp);
                        }, 1000);
                    }
                }
            });

            view.dom.addEventListener('mousedown', this.handleClick);
        }

        handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            const marked = target.closest('[data-comment-id]') as HTMLElement | null;
            if (!marked) return;
            const id = marked.getAttribute('data-comment-id');
            if (id) {
                e.preventDefault();
                useScribeStore.getState().setEditingCommentId(id);
            }
        };

        destroy(): void {
            this.unsub();
            this.view.dom.removeEventListener('mousedown', this.handleClick);
            if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
        }
    },
);

export function commentPlugin(): Extension {
    return [commentDecorationsField, commentStoreSubscriber];
}
