/**
 * Scribe — CodeMirror 6 markdown editor widget with multi-tab support,
 * AI redlines, inline comments, versioning, and table of contents.
 */

import { useEffect, useRef, useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { Check, Eye, Maximize, Upload } from 'lucide-react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { search } from '@codemirror/search';
import { getMarkdownExtensions, registerEditorView } from './markdownConfig';
import { FindReplace } from './FindReplace';
import { useScribeStore, type FileEntry } from './scribeStore';
import { useAutoSave } from './useAutoSave';
import { TabBar } from './TabBar';
import { DocumentToolbar } from './DocumentToolbar';
import { TagInput } from '../Tags/TagInput';
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
import MarkdownPreview from './MarkdownPreview';
import { TOC_MIN, TOC_MAX, MINIMAP_MIN, MINIMAP_MAX, TREE_MIN, TREE_MAX, TREE_DEFAULT, ARA_MIN, ARA_MAX, ARA_DEFAULT, PREVIEW_MIN, PREVIEW_MAX, PREVIEW_DEFAULT } from './scribeLayoutStore';
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

    // ── Live preview (MacDown parity) ──
    const [previewVisible, setPreviewVisible] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);

    // Scroll-sync: editor scroll position drives the preview proportionally.
    useEffect(() => {
        if (!previewVisible) return;
        const sd = viewRef.current?.scrollDOM;
        const pv = previewRef.current;
        if (!sd || !pv) return;
        const onScroll = () => {
            const denom = Math.max(1, sd.scrollHeight - sd.clientHeight);
            const ratio = sd.scrollTop / denom;
            pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
        };
        sd.addEventListener('scroll', onScroll, { passive: true });
        return () => sd.removeEventListener('scroll', onScroll);
    }, [previewVisible, activeFilepath]);

    const exportHtml = useCallback(() => {
        const inner = previewRef.current?.querySelector('.scribe-preview__md')?.innerHTML ?? '';
        const name = (activeFilepath?.split('/').pop() || 'document').replace(/\.md$/, '');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title>`
            + `<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;line-height:1.65;color:#1a1a1a}`
            + `pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,monospace}`
            + `table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:7px 10px}blockquote{border-left:3px solid #4d8aff;margin:0;padding-left:14px;color:#555}</style>`
            + `</head><body>${inner}</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${name}.html`; a.click();
        URL.revokeObjectURL(url);
    }, [activeFilepath]);

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
        <div
            className="scribe"
            onMouseMove={(e) => {
                const el = e.currentTarget;
                const r = el.getBoundingClientRect();
                el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
                el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
            }}
        >
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
                    {activeFilepath && (
                        <div className="scribe-doc-tags" style={{ padding: '4px 10px', borderBottom: '1px solid var(--border, #222)' }}>
                            <TagInput source="scribe" sourceId={activeFilepath} title={activeFilepath.split('/').pop() || 'Document'} />
                        </div>
                    )}
                </>
            )}
            {loading && <div className="scribe__status">Loading...</div>}
            {error && <div className="scribe__status scribe__status--error">{error}</div>}
            {redlineLoading && <div className="scribe__status">AI is thinking...</div>}
            <div className="scribe__cols">
                {!focusMode && (
                    <>
                        <aside className="scribe__tree-col" style={{ width: layout.treeWidth ?? TREE_DEFAULT, flexShrink: 0 }}>
                            <ScribeTreeColumn />
                        </aside>
                        <Splitter
                            orientation="vertical"
                            direction="positive"
                            onResize={(delta) => layout.setTreeWidth(Math.max(TREE_MIN, Math.min(TREE_MAX, (layout.treeWidth ?? TREE_DEFAULT) + delta)))}
                        />
                    </>
                )}
                <div className="scribe__editor-area" style={{ position: 'relative' }}>
                <FindReplace getView={() => viewRef.current} />
                {focusMode && <FocusExitChip />}
                <div className="scribe__editor" ref={containerRef} />
                <button
                    type="button"
                    className={`scribe__preview-toggle ${previewVisible ? 'on' : ''}`}
                    onClick={() => setPreviewVisible((v) => !v)}
                    title="Toggle live preview"
                ><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{previewVisible ? <Check size={14} aria-hidden /> : <Eye size={14} aria-hidden />} Preview</span></button>
                {previewVisible && (
                    <>
                        <Splitter
                            orientation="vertical"
                            direction="negative"
                            onResize={(delta) => layout.setPreviewWidth(Math.max(PREVIEW_MIN, Math.min(PREVIEW_MAX, (layout.previewWidth ?? PREVIEW_DEFAULT) + delta)))}
                        />
                        <div className="scribe__preview-wrap" style={{ width: layout.previewWidth ?? PREVIEW_DEFAULT, flexShrink: 0 }}>
                            <div className="scribe-preview__bar">
                                <span>PREVIEW</span>
                                <button onClick={exportHtml} title="Export rendered HTML">Export HTML</button>
                            </div>
                            <MarkdownPreview ref={previewRef} text={activeFile?.content ?? ''} />
                        </div>
                    </>
                )}
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
                {!focusMode && (
                    <>
                        <Splitter
                            orientation="vertical"
                            direction="negative"
                            onResize={(delta) => layout.setAraWidth(Math.max(ARA_MIN, Math.min(ARA_MAX, (layout.araWidth ?? ARA_DEFAULT) + delta)))}
                        />
                        <div className="scribe__ara-col" style={{ width: layout.araWidth ?? ARA_DEFAULT, flexShrink: 0, display: 'flex', minHeight: 0 }}>
                            <AraMiniPanel />
                        </div>
                    </>
                )}
            </div>
            <SelectionToolbar />
            <CommentEditor getView={() => viewRef.current} />
            <ContextMenu getView={() => viewRef.current} />
        </div>
    );
}

/**
 * ScribeTreeColumn — persistent left "Explorer" pane (the 3-pane layout's
 * left column). Loads the file list and renders the FileTree; the open file
 * is highlighted. Re-loads when the open-file set or active file changes so
 * newly-created/ingested files appear.
 */
function ScribeTreeColumn() {
    const openFile = useScribeStore((s) => s.openFile);
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const openFiles = useScribeStore((s) => s.openFiles);
    const setActiveFile = useScribeStore((s) => s.setActiveFile);
    const closeFile = useScribeStore((s) => s.closeFile);
    const [files, setFiles] = useState<FileEntry[]>([]);
    // Workspace/project layer: a "project" is a top-level folder in the file store.
    // The switcher scopes the Explorer tree to one project (functional Agenteryx parity).
    const [activeWs, setActiveWs] = useState<string | null>(null);
    const [wsMenuOpen, setWsMenuOpen] = useState(false);
    const [creatingWs, setCreatingWs] = useState(false);
    const [wsDraft, setWsDraft] = useState('');
    useEffect(() => {
        try { const v = localStorage.getItem('scribe-active-workspace'); if (v) setActiveWs(v); } catch { /* sandboxed */ }
    }, []);
    useEffect(() => {
        let alive = true;
        void useScribeStore.getState().listFiles().then((f) => { if (alive) setFiles(f); }).catch(() => { /* offline */ });
        return () => { alive = false; };
    }, [openFiles.length, activeFilepath]);
    const baseName = (p: string) => p.split('/').pop() || p;
    const workspaces = useMemo(() => {
        const set = new Set<string>();
        for (const f of files) { const i = f.filepath.indexOf('/'); if (i > 0) set.add(f.filepath.slice(0, i)); }
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [files]);
    const displayFiles = useMemo(
        () => (activeWs ? files.filter((f) => f.filepath.startsWith(`${activeWs}/`)) : files),
        [files, activeWs],
    );
    const selectWs = (ws: string | null) => {
        setActiveWs(ws);
        setWsMenuOpen(false);
        try { if (ws) localStorage.setItem('scribe-active-workspace', ws); else localStorage.removeItem('scribe-active-workspace'); } catch { /* sandboxed */ }
    };
    const confirmNewWs = () => {
        const name = wsDraft.trim().replace(/[\\/]+/g, '-');
        setCreatingWs(false);
        setWsDraft('');
        if (!name) return;
        const path = `${name}/Untitled.md`;
        void useScribeStore.getState().createFile(path).then(() => useScribeStore.getState().openFile(path)).catch(() => { /* ignore */ });
        selectWs(name);
    };
    return (
        <div className="scribe__tree">
            {/* Workspace switcher — functional: scopes the tree to a project folder (Agenteryx parity) */}
            <div className="scribe__ws">
                <button className="scribe__ws-chip" onClick={() => setWsMenuOpen((o) => !o)} title="Switch project">
                    <span className="scribe__ws-icon" aria-hidden>▦</span>
                    <span className="scribe__ws-name">{activeWs || 'All Files'}</span>
                    <span className="scribe__ws-caret" aria-hidden>▾</span>
                </button>
                {wsMenuOpen && (
                    <div className="scribe__ws-menu" role="menu">
                        <button className={`scribe__ws-item ${!activeWs ? 'scribe__ws-item--active' : ''}`} onClick={() => selectWs(null)}>All Files</button>
                        {workspaces.map((ws) => (
                            <button key={ws} className={`scribe__ws-item ${activeWs === ws ? 'scribe__ws-item--active' : ''}`} onClick={() => selectWs(ws)}>{ws}</button>
                        ))}
                        <div className="scribe__ws-sep" />
                        <button className="scribe__ws-item scribe__ws-new" onClick={() => { setWsMenuOpen(false); setCreatingWs(true); }}>+ New project…</button>
                    </div>
                )}
                {creatingWs && (
                    <input
                        autoFocus
                        className="scribe__ws-input"
                        placeholder="Project name…"
                        value={wsDraft}
                        onChange={(e) => setWsDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmNewWs(); else if (e.key === 'Escape') { setCreatingWs(false); setWsDraft(''); } }}
                        onBlur={confirmNewWs}
                    />
                )}
            </div>
            {/* OPEN FILES — functional: click switches the active tab, × closes it (Agenteryx parity) */}
            {openFiles.length > 0 && (
                <div className="scribe__open">
                    <div className="scribe__section-label">Open Files</div>
                    <div className="scribe__open-list">
                        {openFiles.map((f) => (
                            <div
                                key={f.filepath}
                                className={`scribe__open-row ${f.filepath === activeFilepath ? 'scribe__open-row--active' : ''}`}
                                onClick={() => setActiveFile(f.filepath)}
                                title={f.filepath}
                            >
                                <span className="scribe__open-name">{baseName(f.filepath)}</span>
                                {f.dirty && <span className="scribe__open-dirty" title="Unsaved changes">●</span>}
                                <button
                                    className="scribe__open-close"
                                    onClick={(e) => { e.stopPropagation(); closeFile(f.filepath); }}
                                    aria-label={`Close ${baseName(f.filepath)}`}
                                >×</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="scribe__tree-header">
                <span className="scribe__tree-header-label">Explorer</span>
                <span className="scribe__tree-header-count">{displayFiles.length}</span>
            </div>
            <div className="scribe__tree-scroll">
                <FileTree files={displayFiles} onOpen={(p) => void openFile(p)} activePath={activeFilepath || undefined} />
            </div>
            {/* Branch/version bar — functional: "+ Version" calls the store's createVersion (Agenteryx parity) */}
            <div className="scribe__branch-bar" title={activeFilepath || 'No file open'}>
                <span className="scribe__branch-icon" aria-hidden>⎇</span>
                <span className="scribe__branch-name">{activeFilepath ? baseName(activeFilepath).replace(/\.md$/i, '') : 'main'}</span>
                <button
                    className="scribe__branch-version"
                    disabled={!activeFilepath}
                    onClick={() => { if (activeFilepath) void useScribeStore.getState().createVersion(activeFilepath); }}
                    title="Save a new version of this document"
                >+ Version</button>
            </div>
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
                background: hovered ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'rgba(0,0,0,0.6)',
                border: `1px solid ${hovered ? '#D6FE51' : '#333'}`,
                color: hovered ? '#D6FE51' : '#888',
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                backdropFilter: 'blur(4px)', transition: 'color 120ms, border-color 120ms, background 120ms',
            }}
        >
            <Maximize size={13} aria-hidden /> Focus · Esc to exit
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

            <label className="scribe__new-btn" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Import a Word .docx file as Markdown">
                <Upload size={14} aria-hidden /> Import .docx
                <input type="file" accept=".docx" onChange={(e) => void handleDocxFile(e)} style={{ display: 'none' }} />
            </label>

            {fetched && files.length === 0 && !creating && (
                <p className="scribe__muted">No files yet. Create one to get started.</p>
            )}

            <IngestionPanel onConvert={convert} converting={converting} convertError={convertError} />
        </div>
    );
}
