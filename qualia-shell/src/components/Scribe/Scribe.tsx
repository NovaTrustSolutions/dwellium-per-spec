/**
 * Scribe — CodeMirror 6 markdown editor widget with multi-tab support,
 * AI redlines, inline comments, versioning, and table of contents.
 */

import { useEffect, useRef, useCallback, useState, type ChangeEvent } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { search } from '@codemirror/search';
import { getMarkdownExtensions, registerEditorView } from './markdownConfig';
import { FindReplace } from './FindReplace';
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
import { SearchPanel } from './SearchPanel';
import { docxToMarkdown } from './docxConvert';
import DumpMode from './DumpMode';
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
    const tocVisibleRaw = useScribeStore((s) => s.tocVisible);
    const minimapVisibleRaw = useScribeStore((s) => s.minimapVisible);
    const editorMode = useScribeStore((s) => s.editorMode);
    const focusMode = useScribeStore((s) => s.focusMode);
    // In focus mode all side chrome collapses to leave only the editor column.
    const tocVisible = tocVisibleRaw && !focusMode;
    const minimapVisible = minimapVisibleRaw && !focusMode;
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
                    // Find & Replace (spec §5.11): provide the search state, then
                    // intercept ⌘F (higher precedence than basicSetup's native
                    // search panel) to open our fey-styled FindReplace panel.
                    search({ top: true }),
                    Prec.high(keymap.of([
                        { key: 'Mod-f', preventDefault: true, run: () => { useScribeStore.getState().setFindReplaceOpen(true); return true; } },
                        { key: 'Mod-Alt-f', preventDefault: true, run: () => { useScribeStore.getState().setFindReplaceOpen(true); return true; } },
                        // Focus mode (spec §5.11): ⌘⇧F toggles distraction-free writing.
                        { key: 'Mod-Shift-f', preventDefault: true, run: () => { const s = useScribeStore.getState(); s.setFocusMode(!s.focusMode); return true; } },
                        // Esc exits focus mode (only when it's on, so it doesn't swallow other Esc uses).
                        { key: 'Escape', run: () => { const s = useScribeStore.getState(); if (s.focusMode) { s.setFocusMode(false); return true; } return false; } },
                    ])),
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
        // editorMode is a dep so returning from Dump → Doc re-initializes the
        // CodeMirror view into the freshly-remounted editor div (otherwise the
        // editor would render blank after a mode round-trip).
    }, [activeFilepath, editorMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Brain Dump intake (spec §5.2) — the sticky "Dump" tab toggles this. It
    // doesn't require an open document, so it short-circuits before the
    // empty-state / editor branches. All hooks above run unconditionally so
    // hook order is preserved across mode switches.
    if (editorMode === 'dump') {
        return (
            <div className="scribe">
                <TabBar />
                <DumpMode />
            </div>
        );
    }

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
            {/* Focus mode (spec §5.11) collapses the tab bar + toolbar so only the
                editor column remains; a small floating chip restores it. */}
            {!focusMode && (
                <>
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
                </>
            )}
            {loading && <div className="scribe__status">Loading...</div>}
            {error && <div className="scribe__status scribe__status--error">{error}</div>}
            {redlineLoading && <div className="scribe__status">AI is thinking...</div>}
            <div className="scribe__editor-area" style={{ position: 'relative' }}>
                <FindReplace getView={() => viewRef.current} />
                {focusMode && <FocusExitChip />}
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

/** Small floating affordance shown in focus mode to restore the chrome. */
function FocusExitChip() {
    const setFocusMode = useScribeStore((s) => s.setFocusMode);
    const [hovered, setHovered] = useState(false);
    return (
        <button
            onClick={() => setFocusMode(false)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title="Exit focus mode (Esc or ⌘⇧F)"
            style={{
                position: 'absolute', top: 10, left: 16, zIndex: 50,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999,
                background: hovered ? 'rgba(214,254,81,0.12)' : 'rgba(0,0,0,0.6)',
                border: `1px solid ${hovered ? '#D6FE51' : '#333'}`,
                color: hovered ? '#D6FE51' : '#888',
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                backdropFilter: 'blur(4px)', transition: 'color 120ms, border-color 120ms, background 120ms',
            }}
        >
            ⛶ Focus · Esc to exit
        </button>
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

    // Import a .docx → Markdown (via mammoth) and open it as a new Scribe file.
    const handleDocxFile = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const md = await docxToMarkdown(await file.arrayBuffer());
            const base = file.name.replace(/\.docx$/i, '').trim() || 'imported';
            const path = `${base}.md`;
            await useScribeStore.getState().createFile(path, md);
            await useScribeStore.getState().openFile(path);
        } catch (err) {
            console.error('[Scribe] .docx import failed', err);
            alert('Could not import that .docx file.');
        }
    };

    return (
        <div className="scribe__empty">
            <h2>Scribe</h2>
            <p>Markdown editor with AI redlines, inline comments, versioning, smart paste.</p>

            <SearchPanel files={files} />

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

            <label className="scribe__new-btn" style={{ cursor: 'pointer', display: 'inline-block' }} title="Import a Word .docx file as Markdown">
                ⬆ Import .docx
                <input type="file" accept=".docx" onChange={(e) => void handleDocxFile(e)} style={{ display: 'none' }} />
            </label>

            {fetched && files.length === 0 && !creating && (
                <p className="scribe__muted">No files yet. Create one to get started.</p>
            )}

            <IngestionPanel onConvert={convert} converting={converting} convertError={convertError} />
        </div>
    );
}
