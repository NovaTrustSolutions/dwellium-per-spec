/**
 * Scribe — CodeMirror 6 markdown editor widget with multi-tab support,
 * AI redlines, inline comments, versioning, and table of contents.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { getMarkdownExtensions, registerEditorView } from './markdownConfig';
import { useScribeStore, type FileEntry } from './scribeStore';
import { useAutoSave } from './useAutoSave';
import { TabBar } from './TabBar';
import { DocumentToolbar } from './DocumentToolbar';
import { TableOfContents } from './TableOfContents';
import { SelectionToolbar } from './SelectionToolbar';
import { AraMiniPanel } from './AraMiniPanel';
import { RedlineNavigator } from './RedlineNavigator';
import { CommentEditor } from './CommentEditor';
import { Minimap } from './Minimap';
import { ContextMenu } from './ContextMenu';
import { useScribeTheme } from './useScribeTheme';
import { useScribeLayout } from './useScribeLayout';
import { Splitter } from './Splitter';
import { TOC_MIN, TOC_MAX, MINIMAP_MIN, MINIMAP_MAX } from './scribeLayoutStore';
import IngestionPanel from './ingestion/IngestionPanel';
import { useIngestion } from './ingestion/useIngestion';
import { FileTree } from './FileTree';
import './Scribe.css';

export default function Scribe() {
    useScribeTheme();
    const layout = useScribeLayout();
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const openFiles = useScribeStore((s) => s.openFiles);
    const loading = useScribeStore((s) => s.loading);
    const error = useScribeStore((s) => s.error);
    const redlineLoading = useScribeStore((s) => s.redlineLoading);
    const tocVisible = useScribeStore((s) => s.tocVisible);
    const minimapVisible = useScribeStore((s) => s.minimapVisible);
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
            <Splitter
                orientation="horizontal"
                direction="positive"
                onResize={(delta) => {
                    const next = Math.max(28, Math.min(80, layout.tabBarHeight + delta));
                    layout.setTabBarHeight(next);
                }}
            />
            <DocumentToolbar />
            {loading && <div className="scribe__status">Loading...</div>}
            {error && <div className="scribe__status scribe__status--error">{error}</div>}
            {redlineLoading && <div className="scribe__status">AI is thinking...</div>}
            <div className="scribe__editor-area">
                <div className="scribe__editor" ref={containerRef} />
                <RedlineNavigator getView={() => viewRef.current} />
                {minimapVisible && (
                    <>
                        <Splitter
                            orientation="vertical"
                            direction="negative"
                            onResize={(delta) => {
                                const next = Math.max(MINIMAP_MIN, Math.min(MINIMAP_MAX, layout.minimapWidth + delta));
                                layout.setMinimapWidth(next);
                            }}
                        />
                        <div className="scribe__minimap-wrap" style={{ width: layout.minimapWidth, flexShrink: 0 }}>
                            <Minimap getView={() => viewRef.current} />
                        </div>
                    </>
                )}
                {tocVisible && (
                    <>
                        <Splitter
                            orientation="vertical"
                            direction="negative"
                            onResize={(delta) => {
                                const next = Math.max(TOC_MIN, Math.min(TOC_MAX, layout.tocWidth + delta));
                                layout.setTocWidth(next);
                            }}
                        />
                        <div className="scribe__toc-wrap" style={{ width: layout.tocWidth, flexShrink: 0 }}>
                            <TableOfContents getView={() => viewRef.current} />
                        </div>
                    </>
                )}
            </div>
            <SelectionToolbar />
            <CommentEditor getView={() => viewRef.current} />
            <ContextMenu getView={() => viewRef.current} />
            <AraMiniPanel />
        </div>
    );
}

function EmptyState() {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [fetched, setFetched] = useState(false);
    const openFile = useScribeStore((s) => s.openFile);
    const createFile = useScribeStore((s) => s.createFile);
    const { convert, converting, convertError } = useIngestion();

    useEffect(() => {
        void useScribeStore.getState().listFiles().then((f) => {
            setFiles(f);
            setFetched(true);
        }).catch(() => setFetched(true));
    }, []);

    // 2026-05-27 fix: window.prompt() is silently blocked in many browser /
    // Electron contexts. Replace with inline input toggled via local state.
    const [creating, setCreating] = useState(false);
    const [draftName, setDraftName] = useState('');

    const startCreate = () => {
        setDraftName('');
        setCreating(true);
    };

    const confirmCreate = () => {
        const name = draftName.trim();
        if (!name) { setCreating(false); return; }
        const filepath = name.endsWith('.md') ? name : `${name}.md`;
        void createFile(filepath);
        setCreating(false);
        setDraftName('');
    };

    const cancelCreate = () => {
        setCreating(false);
        setDraftName('');
    };

    return (
        <div className="scribe__empty">
            <h2>Scribe</h2>
            <p>Markdown editor with AI redlines, inline comments, versioning, smart paste.</p>

            {fetched && files.length > 0 && (
                <div className="scribe__file-list">
                    <div className="scribe__file-list-header">Your files</div>
                    <FileTree files={files} onOpen={(p) => void openFile(p)} />
                </div>
            )}

            {creating ? (
                <div className="scribe__new-form">
                    <input
                        type="text"
                        autoFocus
                        className="scribe__new-input"
                        placeholder="filename.md"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmCreate();
                            else if (e.key === 'Escape') cancelCreate();
                        }}
                    />
                    <button className="scribe__new-btn" onClick={confirmCreate} disabled={!draftName.trim()}>Create</button>
                    <button className="scribe__new-cancel" onClick={cancelCreate}>Cancel</button>
                </div>
            ) : (
                <button className="scribe__new-btn" onClick={startCreate}>
                    + New File
                </button>
            )}

            {fetched && files.length === 0 && !creating && (
                <p className="scribe__muted">No files yet. Create one to get started.</p>
            )}

            <IngestionPanel onConvert={convert} converting={converting} convertError={convertError} />
        </div>
    );
}
