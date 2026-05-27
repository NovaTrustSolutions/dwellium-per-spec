/**
 * Scribe — CodeMirror 6 markdown editor widget.
 *
 * Cycle 4: basic editor with syntax highlighting, all ViewPlugins,
 * smart paste, and theme support. Loads a hardcoded sample document;
 * file CRUD lands in Cycle 5.
 */

import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { getMarkdownExtensions, registerEditorView } from './markdownConfig';
import { useScribeStore } from './scribeStore';
import './Scribe.css';

export default function Scribe() {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const contentRef = useRef(useScribeStore.getState().activeContent);

    useEffect(() => {
        if (!containerRef.current) return;

        const view = new EditorView({
            state: EditorState.create({
                doc: contentRef.current,
                extensions: [
                    ...getMarkdownExtensions(),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            const text = update.state.doc.toString();
                            contentRef.current = text;
                            useScribeStore.getState().setActiveContent(text);
                        }
                    }),
                ],
            }),
            parent: containerRef.current,
        });

        viewRef.current = view;
        const unregister = registerEditorView(view);

        return () => {
            unregister();
            view.destroy();
            viewRef.current = null;
        };
    }, []);

    return (
        <div className="scribe">
            <div className="scribe__editor" ref={containerRef} />
        </div>
    );
}
