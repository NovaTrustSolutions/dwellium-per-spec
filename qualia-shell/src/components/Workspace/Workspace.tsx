/**
 * Workspace — Holocron-style Domaine → Project → Thread browser (Dwellium port).
 *
 * Cycle 5: the DOMAINES INDEX view (fetch + card grid + loading/empty/error + sort).
 * Cycle 6: the DOMAINE view — drill into a domaine to see its PROJECTS, derived from the
 *   SHARED file-explorer tree (decision D3) via the pure projectsForDomaine() selector.
 * Cycle 7 (this edit): the PROJECT view — drill into a project to see its THREADS, again
 *   derived from the cached tree (threadsForProject() selector), each ENRICHED with its
 *   `.thread.json` sidecar metadata (status / stage badges) fetched best-effort via
 *   loadThreadMetas(). Metadata is purely additive: the thread list always renders from the
 *   tree, and a missing/erroring sidecar (e.g. the sibling backend route not yet implemented)
 *   simply yields a thread card with no badges. The toolbar's sort `<select>` + RefreshCw
 *   gain a third (thread) target. The drill chain index → domaine → project is now fully
 *   navigable end-to-end.
 *
 * Patterns mirror FileExplorer: inline styles (fey.com black + acid-lime #D6FE51),
 * useContext(UserContext)-based per-user state via useWorkspaceUi, RefreshCw refresh
 * convention with aria-label, SSR-safe stores. See WORKSPACE_PORTING_PLAN.md §11.
 */
import { useEffect, useMemo } from 'react';
import { RefreshCw, ChevronLeft, FolderOpen, Folder, MessageSquare, FileText } from 'lucide-react';
import { useWorkspaceStore } from './workspaceStore';
import { useWorkspaceUi } from './useWorkspaceUi';
import type { DomaineMeta } from './workspaceApi';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';
import type { WorkspaceSort } from './workspaceUiStore';

const ACCENT = '#D6FE51';

function sortDomaines(list: DomaineMeta[], sort: WorkspaceSort): DomaineMeta[] {
    const copy = list.slice();
    if (sort === 'name-asc') copy.sort((a, b) => a.name.localeCompare(b.name));
    // 'modified-desc' has no domaine-level timestamp yet → falls through to position
    else copy.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    return copy;
}

/** Shared tree-node sort for the project + thread lists (tree nodes carry no position). */
function sortEntries(list: FileEntry[], sort: WorkspaceSort): FileEntry[] {
    const copy = list.slice();
    if (sort === 'modified-desc') {
        copy.sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? '') || a.name.localeCompare(b.name));
    } else {
        // 'name-asc' (default) and 'position-asc' (no position on a tree node) → name
        copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    return copy;
}

/** Count of thread-tier children — shown as a hint on each project card. */
function threadCount(project: FileEntry): number {
    return (project.children ?? []).filter((c) => c.tier === 'thread').length;
}

/** Count of leaf files within a thread — shown as a hint on each thread card. */
function fileCount(thread: FileEntry): number {
    return (thread.children ?? []).filter((c) => c.tier === 'file').length;
}

export default function Workspace() {
    const view = useWorkspaceStore((s) => s.view);
    const activeDomainePath = useWorkspaceStore((s) => s.activeDomainePath);
    const activeProjectPath = useWorkspaceStore((s) => s.activeProjectPath);
    const domaines = useWorkspaceStore((s) => s.domaines);
    const loading = useWorkspaceStore((s) => s.loading);
    const error = useWorkspaceStore((s) => s.error);
    const tree = useWorkspaceStore((s) => s.tree);
    const treeLoading = useWorkspaceStore((s) => s.treeLoading);
    const treeError = useWorkspaceStore((s) => s.treeError);
    const threadMetas = useWorkspaceStore((s) => s.threadMetas);
    const loadDomaines = useWorkspaceStore((s) => s.loadDomaines);
    const loadTree = useWorkspaceStore((s) => s.loadTree);
    const loadThreadMetas = useWorkspaceStore((s) => s.loadThreadMetas);
    const projectsForDomaine = useWorkspaceStore((s) => s.projectsForDomaine);
    const threadsForProject = useWorkspaceStore((s) => s.threadsForProject);
    const openDomaine = useWorkspaceStore((s) => s.openDomaine);
    const openProject = useWorkspaceStore((s) => s.openProject);
    const goBack = useWorkspaceStore((s) => s.goBack);

    const {
        sortDomaine, setSortDomaine,
        sortProject, setSortProject,
        sortThread, setSortThread,
        setLastActiveDomainePath,
    } = useWorkspaceUi();

    // Fetch the domaines list once on mount (effect-time = SSR-safe).
    useEffect(() => {
        void loadDomaines();
    }, [loadDomaines]);

    // Lazily fetch the shared tree the first time we drill below the index (per D3 the tree
    // is the source of project + thread structure). Cheap to re-run; loadTree is idempotent.
    useEffect(() => {
        if (view !== 'index' && tree.length === 0 && !treeLoading && !treeError) {
            void loadTree();
        }
    }, [view, tree.length, treeLoading, treeError, loadTree]);

    const sortedDomaines = useMemo(
        () => sortDomaines(domaines, sortDomaine),
        [domaines, sortDomaine],
    );

    const projects = useMemo(
        () => (activeDomainePath ? projectsForDomaine(activeDomainePath) : []),
        [activeDomainePath, projectsForDomaine, tree],
    );
    const sortedProjects = useMemo(() => sortEntries(projects, sortProject), [projects, sortProject]);

    const threads = useMemo(
        () => (activeProjectPath ? threadsForProject(activeProjectPath) : []),
        [activeProjectPath, threadsForProject, tree],
    );
    const sortedThreads = useMemo(() => sortEntries(threads, sortThread), [threads, sortThread]);

    // Best-effort enrich the active project's threads with their sidecar metadata once we
    // can see them. Keyed on the joined path set (stable string) so it fires when the thread
    // list changes, not on every render; loadThreadMetas merges + swallows per-thread errors.
    const threadPathsKey = threads.map((t) => t.path).join('|');
    useEffect(() => {
        if (view === 'project' && threads.length > 0) {
            void loadThreadMetas(threads.map((t) => t.path));
        }
        // threadPathsKey captures the thread set; `threads` itself is derived from it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, threadPathsKey, loadThreadMetas]);

    const handleOpenDomaine = (d: DomaineMeta) => {
        setLastActiveDomainePath(d.path);
        openDomaine(d.path);
    };

    // Display labels for the toolbar/back-nav (resolve domaine display name from metadata).
    const domaineName = activeDomainePath
        ? domaines.find((d) => d.path === activeDomainePath)?.name ?? activeDomainePath
        : '';
    const projectName = activeProjectPath?.split('/').filter(Boolean).pop() ?? '';
    const title = view === 'index' ? 'Domaines' : view === 'domaine' ? domaineName : projectName;
    const backLabel = view === 'project' ? domaineName : 'Domaines';

    const refresh = () => { if (view === 'index') void loadDomaines(); else void loadTree(); };
    const refreshBusy = view === 'index' ? loading : treeLoading;
    const refreshLabel = view === 'index'
        ? 'Refresh domaines'
        : view === 'domaine' ? 'Refresh projects' : 'Refresh threads';

    return (
        <div
            style={{
                display: 'flex', flexDirection: 'column', height: '100%',
                background: '#0a0a0a', color: '#e8e8e8',
                fontFamily: 'inherit', overflow: 'hidden',
            }}
        >
            {/* Toolbar */}
            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', flexShrink: 0,
                    borderBottom: '1px solid #1a1a1a',
                }}
            >
                {view !== 'index' && (
                    <button
                        onClick={() => goBack()}
                        title={`Back to ${backLabel}`}
                        aria-label={`Back to ${backLabel}`}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 2,
                            background: 'transparent', border: 'none',
                            color: '#888', cursor: 'pointer', padding: 2,
                            fontFamily: 'inherit', fontSize: 11, maxWidth: '40%',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
                    >
                        <ChevronLeft size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {backLabel}
                        </span>
                    </button>
                )}

                <span style={{
                    flex: 1, fontSize: 12, fontWeight: 600,
                    letterSpacing: '0.02em', color: '#ccc',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {title}
                </span>

                {view === 'index' && (
                    <select
                        value={sortDomaine}
                        onChange={(e) => setSortDomaine(e.target.value as WorkspaceSort)}
                        title="Sort domaines"
                        aria-label="Sort domaines"
                        style={{
                            background: '#0a0a0a', color: '#ccc',
                            border: '1px solid #222', borderRadius: 4,
                            padding: '2px 4px', fontSize: 10,
                            fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                        }}
                    >
                        <option value="position-asc">↕ Position</option>
                        <option value="name-asc">↑ Name</option>
                    </select>
                )}

                {view === 'domaine' && (
                    <select
                        value={sortProject}
                        onChange={(e) => setSortProject(e.target.value as WorkspaceSort)}
                        title="Sort projects"
                        aria-label="Sort projects"
                        style={{
                            background: '#0a0a0a', color: '#ccc',
                            border: '1px solid #222', borderRadius: 4,
                            padding: '2px 4px', fontSize: 10,
                            fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                        }}
                    >
                        <option value="name-asc">↑ Name</option>
                        <option value="modified-desc">↓ Modified</option>
                    </select>
                )}

                {view === 'project' && (
                    <select
                        value={sortThread}
                        onChange={(e) => setSortThread(e.target.value as WorkspaceSort)}
                        title="Sort threads"
                        aria-label="Sort threads"
                        style={{
                            background: '#0a0a0a', color: '#ccc',
                            border: '1px solid #222', borderRadius: 4,
                            padding: '2px 4px', fontSize: 10,
                            fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                        }}
                    >
                        <option value="modified-desc">↓ Modified</option>
                        <option value="name-asc">↑ Name</option>
                    </select>
                )}

                <button
                    onClick={refresh}
                    title={refreshLabel}
                    aria-label={refreshLabel}
                    disabled={refreshBusy}
                    style={{
                        display: 'flex', alignItems: 'center',
                        background: 'transparent', border: 'none',
                        color: '#666', cursor: refreshBusy ? 'default' : 'pointer', padding: 2,
                    }}
                    onMouseEnter={(e) => { if (!refreshBusy) e.currentTarget.style.color = ACCENT; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                >
                    <RefreshCw size={14} strokeWidth={1.75} style={{
                        animation: refreshBusy ? 'spin 0.9s linear infinite' : undefined,
                    }} />
                </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 12 }}>
                {view === 'project' ? (
                    treeError ? (
                        <div
                            role="alert"
                            style={{
                                padding: 16, color: '#ff4d6d', fontSize: 11, lineHeight: 1.6,
                                background: 'rgba(255,77,109,0.05)', borderRadius: 4,
                                border: '1px solid rgba(255,77,109,0.2)',
                            }}
                        >
                            <strong>Failed to load threads</strong>
                            <div style={{ marginTop: 4, color: '#bbb' }}>{treeError}</div>
                            <button
                                onClick={() => void loadTree()}
                                style={{
                                    marginTop: 8, padding: '4px 10px', fontSize: 11,
                                    background: 'transparent', color: ACCENT,
                                    border: `1px solid ${ACCENT}`, borderRadius: 4, cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >Retry</button>
                        </div>
                    ) : treeLoading && tree.length === 0 ? (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#555', fontSize: 11 }}>
                            Loading threads…
                        </div>
                    ) : sortedThreads.length === 0 ? (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#555', fontSize: 11, lineHeight: 1.6 }}>
                            <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>💬</div>
                            <div style={{ color: '#888', marginBottom: 4 }}>No threads in this project</div>
                            <div style={{ fontSize: 10 }}>
                                Threads are folders inside a project — each one a workstream of notes and reports.
                            </div>
                        </div>
                    ) : (
                        <div
                            role="list"
                            aria-label={`Threads in ${projectName}`}
                            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                        >
                            {sortedThreads.map((t) => {
                                const meta = threadMetas[t.path];
                                const files = fileCount(t);
                                const isComplete = meta?.status === 'complete';
                                return (
                                    <div
                                        key={t.path}
                                        role="listitem"
                                        title={t.path}
                                        style={{
                                            display: 'flex', flexDirection: 'column', gap: 6,
                                            padding: '10px 12px', borderRadius: 8,
                                            background: '#101010',
                                            border: '1px solid #1e1e1e',
                                            borderLeft: `3px solid ${isComplete ? '#3a7a4a' : ACCENT}`,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <MessageSquare size={14} strokeWidth={1.75} style={{ color: '#9a9a9a', flexShrink: 0 }} />
                                            <span style={{
                                                flex: 1, fontSize: 12, fontWeight: 600, color: '#f0f0f0',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>{t.name}</span>
                                            {meta && (
                                                <span style={{
                                                    flexShrink: 0,
                                                    fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                                                    textTransform: 'uppercase',
                                                    padding: '2px 6px', borderRadius: 999,
                                                    color: isComplete ? '#8fbf9a' : '#0a0a0a',
                                                    background: isComplete ? 'rgba(58,122,74,0.18)' : ACCENT,
                                                }}>
                                                    {isComplete ? '✓ complete' : 'active'}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            {meta?.stage && (
                                                <span style={{
                                                    fontSize: 9, color: '#bbb',
                                                    padding: '1px 6px', borderRadius: 4,
                                                    background: '#1c1c1c', border: '1px solid #2a2a2a',
                                                }}>{meta.stage}</span>
                                            )}
                                            {files > 0 && (
                                                <span style={{
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                    fontSize: 10, color: '#777',
                                                }}>
                                                    <FileText size={11} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                                                    {files === 1 ? '1 file' : `${files} files`}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : view === 'domaine' ? (
                    treeError ? (
                        <div
                            role="alert"
                            style={{
                                padding: 16, color: '#ff4d6d', fontSize: 11, lineHeight: 1.6,
                                background: 'rgba(255,77,109,0.05)', borderRadius: 4,
                                border: '1px solid rgba(255,77,109,0.2)',
                            }}
                        >
                            <strong>Failed to load projects</strong>
                            <div style={{ marginTop: 4, color: '#bbb' }}>{treeError}</div>
                            <button
                                onClick={() => void loadTree()}
                                style={{
                                    marginTop: 8, padding: '4px 10px', fontSize: 11,
                                    background: 'transparent', color: ACCENT,
                                    border: `1px solid ${ACCENT}`, borderRadius: 4, cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >Retry</button>
                        </div>
                    ) : treeLoading && tree.length === 0 ? (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#555', fontSize: 11 }}>
                            Loading projects…
                        </div>
                    ) : sortedProjects.length === 0 ? (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#555', fontSize: 11, lineHeight: 1.6 }}>
                            <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>📂</div>
                            <div style={{ color: '#888', marginBottom: 4 }}>No projects in this domaine</div>
                            <div style={{ fontSize: 10 }}>
                                Projects are folders inside a domaine. Add one to start a thread.
                            </div>
                        </div>
                    ) : (
                        <div
                            role="list"
                            aria-label={`Projects in ${domaineName}`}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                gap: 10,
                            }}
                        >
                            {sortedProjects.map((p) => {
                                const threads = threadCount(p);
                                return (
                                    <button
                                        key={p.path}
                                        role="listitem"
                                        onClick={() => openProject(p.path)}
                                        title={p.path}
                                        style={{
                                            display: 'flex', flexDirection: 'column', gap: 6,
                                            textAlign: 'left', cursor: 'pointer',
                                            padding: 12, borderRadius: 8,
                                            background: '#101010',
                                            border: '1px solid #1e1e1e',
                                            borderLeft: '3px solid #2a2a2a',
                                            color: '#e8e8e8', fontFamily: 'inherit',
                                            transition: 'border-color 100ms, background 100ms',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#161616';
                                            e.currentTarget.style.borderColor = '#333';
                                            e.currentTarget.style.borderLeftColor = ACCENT;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#101010';
                                            e.currentTarget.style.borderColor = '#1e1e1e';
                                            e.currentTarget.style.borderLeftColor = '#2a2a2a';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Folder size={14} strokeWidth={1.75} style={{ color: '#9a9a9a', flexShrink: 0 }} />
                                            <span style={{
                                                fontSize: 12, fontWeight: 600, color: '#f0f0f0',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>{p.name}</span>
                                        </div>
                                        <span style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            fontSize: 10, color: '#777',
                                        }}>
                                            <MessageSquare size={11} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                                            {threads === 1 ? '1 thread' : `${threads} threads`}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )
                ) : error ? (
                    <div
                        role="alert"
                        style={{
                            padding: 16, color: '#ff4d6d', fontSize: 11, lineHeight: 1.6,
                            background: 'rgba(255,77,109,0.05)', borderRadius: 4,
                            border: '1px solid rgba(255,77,109,0.2)',
                        }}
                    >
                        <strong>Failed to load domaines</strong>
                        <div style={{ marginTop: 4, color: '#bbb' }}>{error}</div>
                        <button
                            onClick={() => void loadDomaines()}
                            style={{
                                marginTop: 8, padding: '4px 10px', fontSize: 11,
                                background: 'transparent', color: ACCENT,
                                border: `1px solid ${ACCENT}`, borderRadius: 4, cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >Retry</button>
                    </div>
                ) : loading && domaines.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#555', fontSize: 11 }}>
                        Loading domaines…
                    </div>
                ) : sortedDomaines.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#555', fontSize: 11, lineHeight: 1.6 }}>
                        <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>🗂️</div>
                        <div style={{ color: '#888', marginBottom: 4 }}>No domaines yet</div>
                        <div style={{ fontSize: 10 }}>
                            Domaines are top-level folders in your workspace. Create one to get started.
                        </div>
                    </div>
                ) : (
                    <div
                        role="list"
                        aria-label="Domaines"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                            gap: 10,
                        }}
                    >
                        {sortedDomaines.map((d) => (
                            <button
                                key={d.path}
                                role="listitem"
                                onClick={() => handleOpenDomaine(d)}
                                title={d.description || d.name}
                                style={{
                                    display: 'flex', flexDirection: 'column', gap: 6,
                                    textAlign: 'left', cursor: 'pointer',
                                    padding: 12, borderRadius: 8,
                                    background: '#101010',
                                    border: '1px solid #1e1e1e',
                                    borderLeft: `3px solid ${d.color || ACCENT}`,
                                    color: '#e8e8e8', fontFamily: 'inherit',
                                    transition: 'border-color 100ms, background 100ms',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#161616';
                                    e.currentTarget.style.borderColor = '#333';
                                    e.currentTarget.style.borderLeftColor = d.color || ACCENT;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#101010';
                                    e.currentTarget.style.borderColor = '#1e1e1e';
                                    e.currentTarget.style.borderLeftColor = d.color || ACCENT;
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <FolderOpen size={14} strokeWidth={1.75} style={{ color: d.color || ACCENT, flexShrink: 0 }} />
                                    <span style={{
                                        fontSize: 12, fontWeight: 600, color: '#f0f0f0',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>{d.name}</span>
                                </div>
                                {d.description && (
                                    <span style={{
                                        fontSize: 10, color: '#888', lineHeight: 1.5,
                                        display: '-webkit-box', WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                    }}>{d.description}</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
