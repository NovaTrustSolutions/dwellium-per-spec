/**
 * CodeMirror plugin that watches text selections and publishes floating-
 * toolbar state to scribeStore. The React SelectionToolbar reads this
 * state and renders at the computed viewport coords.
 *
 * Ported from Holocron's selectionObserver.ts (Cycle 6). Removed:
 * debug console.logs, getActivePath closure (uses store directly).
 */
import { EditorView, ViewPlugin, type ViewUpdate, type PluginValue } from '@codemirror/view';
import { useScribeStore } from './scribeStore';

export function selectionObserver(): ViewPlugin<PluginValue> {
    return ViewPlugin.fromClass(
        class {
            view: EditorView;
            mouseUpHandler: () => void;

            constructor(view: EditorView) {
                this.view = view;
                this.mouseUpHandler = () => this.publishIfSelected();
                view.dom.addEventListener('mouseup', this.mouseUpHandler);
            }

            update(u: ViewUpdate): void {
                if (u.selectionSet) {
                    const sel = u.state.selection.main;
                    if (sel.from === sel.to) {
                        if (useScribeStore.getState().selectionToolbar) {
                            useScribeStore.getState().setSelectionToolbar(null);
                        }
                    }
                }
                if (u.docChanged) {
                    if (useScribeStore.getState().selectionToolbar) {
                        useScribeStore.getState().setSelectionToolbar(null);
                    }
                }
            }

            publishIfSelected(): void {
                const view = this.view;
                const sel = view.state.selection.main;
                if (sel.from === sel.to) {
                    useScribeStore.getState().setSelectionToolbar(null);
                    return;
                }
                const filepath = useScribeStore.getState().activeFilepath;
                if (!filepath) return;

                const text = view.state.doc.sliceString(sel.from, sel.to);

                let left: number;
                let anchorTop: number;
                const domSel = window.getSelection();
                if (domSel && domSel.rangeCount > 0 && !domSel.isCollapsed) {
                    const range = domSel.getRangeAt(0);
                    const rects = range.getClientRects();
                    if (rects.length === 0) return;
                    const firstRect = rects[0];
                    left = firstRect.left + firstRect.width / 2;
                    anchorTop = firstRect.top;
                } else {
                    const c = view.coordsAtPos(sel.from);
                    if (!c) return;
                    left = c.left;
                    anchorTop = c.top;
                }

                useScribeStore.getState().setSelectionToolbar({
                    filepath,
                    x: left,
                    y: anchorTop,
                    from: sel.from,
                    to: sel.to,
                    text,
                });
            }

            destroy(): void {
                this.view.dom.removeEventListener('mouseup', this.mouseUpHandler);
            }
        },
    );
}
