/**
 * Scribe — CodeMirror 6 markdown editor widget with multi-tab support
 * and AI redlines.
 *
 * Cycle 6: AI redlines via per-user llmClient. Select text → floating
 * toolbar → "Redline" button → LLM returns proposed edits → inline
 * accept/reject. Self-contained per architecture decision §8.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { getMarkdownExtensions, registerEditorView } from './markdownConfig';
import { useScribeStore, type FileEntry } from './scribeStore';
import { useAutoSave } from './useAutoSave';
import { TabBar } from './TabBar';
import { SelectionToolbar } from './SelectionToolbar';
import { RedlineNavigator } from './RedlineNavigator';
import './Scribe.css';

export default function Scribe() {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const openFiles = useScribeStore((s) => s.openFiles);
    const loading = useScribeStore((s) => s.loading);
    const error = useScribeStore((s) => s.error);
    const redlineLoading = useScribeStore((s) => s.redlineLoading);
    const activeFile = openFiles.find((f) => f.filepath === activeFilepath);

    useAutoSave(activeFilepath);

    const onDocChange = useCallback((filepath: string, content: string) => {
        useScribeStore.getState().updateContent(filepath, content);
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        const doc = activeFile?.content ?? '';
        const filepath = activeFilepath;

        const view = new EditorView({
            state: EditorState.create({
                doc,
                extensions: [
                    ...getMarkdownExtensions(),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged && filepath) {
                            onDocChange(filepath, update.state.doc.toString());
                        }
                    }),
                ],
            }),
            parent: containerRef.current,
        });

        viewRef.current = view;
        const unregister = registerEditorView(view);

        if (activeFile?.scrollTop) {
            requestAnimationFrame(() => {
                if (viewRef.current) viewRef.current.scrollDOM.scrollTop = activeFile.scrollTop;
            });
        }

        return () => {
            if (viewRef.current && filepath) {
                useScribeStore.getState().setScrollTop(filepath, viewRef.current.scrollDOM.scrollTop);
            }
            unregister();
            view.destroy();
            viewRef.current = null;
        };
    }, [activeFilepath]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!activeFile) {
        return (
            <div className="scribe">
                <TabBar />
                <EmptyState />
            </div>
        );
    }

    return (
        <div className="scribe">
            <TabBar />
            {loading && <div className="scribe__status">Loading...</div>}
            {error && <div className="scribe__status scribe__status--error">{error}</div>}
            {redlineLoading && <div className="scribe__status">AI is thinking...</div>}
            <div className="scribe__editor-area">
                <div className="scribe__editor" ref={containerRef} />
                <RedlineNavigator getView={() => viewRef.current} />
            </div>
            <SelectionToolbar />
        </div>
    );
}

function EmptyState() {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [fetched, setFetched] = useState(false);
    const openFile = useScribeStore((s) => s.openFile);
    const createFile = useScribeStore((s) => s.createFile);

    useEffect(() => {
        void useScribeStore.getState().listFiles().then((f) => {
            setFiles(f);
            setFetched(true);
        }).catch(() => setFetched(true));
    }, []);

    const handleNew = () => {
        const name = prompt('New file name (e.g. notes.md):');
        if (!name?.trim()) return;
        const filepath = name.trim().endsWith('.md') ? name.trim() : `${name.trim()}.md`;
        void createFile(filepath);
    };

    return (
        <div className="scribe__empty">
            <h2>Scribe</h2>
            <p>Markdown editor with AI redlines, inline comments, versioning, smart paste.</p>

            {fetched && files.length > 0 && (
                <div className="scribe__file-list">
                    <div className="scribe__file-list-header">Your files</div>
                    {files.map((f) => (
                        <button
                            key={f.filepath}
                            className="scribe__file-item"
                            onClick={() => void openFile(f.filepath)}
                        >
                            <span className="scribe__file-name">{f.filepath}</span>
                            <span className="scribe__file-meta">{(f.size / 1024).toFixed(1)} KB</span>
                        </button>
                    ))}
                </div>
            )}

            <button className="scribe__new-btn" onClick={handleNew}>
                + New File
            </button>

            {fetched && files.length === 0 && (
                <p className="scribe__muted">No files yet. Create one to get started.</p>
            )}
        </div>
    );
}
