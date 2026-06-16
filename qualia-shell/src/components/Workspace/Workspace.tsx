/**
 * Workspace — Holocron-style Domaine → Project → Thread browser (Dwellium port).
 *
 * Cycle 5: the DOMAINES INDEX view (fetch + card grid + loading/empty/error + sort).
 * Cycle 6: the DOMAINE view — drill into a domaine to see its PROJECTS, derived from the
 *   SHARED file-explorer tree (decision D3) via the pure projectsForDomaine() selector.
 * Cycle 7: the PROJECT view — drill into a project to see its THREADS, again
 *   derived from the cached tree (threadsForProject() selector), each ENRICHED with its
 *   `.thread.json` sidecar metadata (status / stage badges) fetched best-effort via
 *   loadThreadMetas(). Metadata is purely additive: the thread list always renders from the
 *   tree, and a missing/erroring sidecar (e.g. the sibling backend route not yet implemented)
 *   simply yields a thread card with no badges.
 * Cycle 8 (this edit): MUTATIONS. A toolbar "+ New" reveals an inline create row that adds a
 *   domaine / project / thread at the current altitude (createEntry → mkdir over the shared
 *   file-explorer route, then refetch). Each domaine/project/thread card grows an inline
 *   rename (Pencil → input) and a two-step delete (Trash → confirm) plus, for threads, a
 *   mark-complete / reopen toggle (setThreadStatus → putThreadMeta). Mutation errors surface
 *   in a dismissible banner separate from the load/empty/error states. Cards became
 *   `role="listitem"` wrappers around a `role="button"` open-target so the action buttons can
 *   nest validly (no button-in-button). Move + domaine-metadata editing ship as tested store
 *   thunks; their UI is deferred (DECISIONS C8-D2/C8-D3).
 *
 * Patterns mirror FileExplorer: inline styles (fey.com black + acid-lime #D6FE51),
 * useContext(UserContext)-based per-user state via useWorkspaceUi, RefreshCw refresh
 * convention with aria-label, SSR-safe stores. See WORKSPACE_PORTING_PLAN.md §11.
 */
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { UserContext } from '../../context/UserContext';
import {
    RefreshCw, ChevronLeft, FolderOpen, Folder, MessageSquare, FileText,
    Plus, Pencil, Trash2, Check, X, CheckCircle2, RotateCcw, ExternalLink,
} from 'lucide-react';
import { useWorkspaceStore } from './workspaceStore';
import { useWorkspaceUi } from './useWorkspaceUi';
import { useScribeStore } from '../Scribe/scribeStore';
import { DomaineBadge } from './DomaineBadge';
import { openThreadInScribe, threadHasFiles, dispatchOpenWidget } from './workspaceScribe';
import type { DomaineMeta } from './workspaceApi';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';
import type { WorkspaceSort } from './workspaceUiStore';

const ACCENT = '#D6FE51';
const DANGER = '#ff4d6d';

/** Shared inline style for the small icon-only action buttons on cards + editor rows. */
const iconBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', color: 'var(--text-tertiary)',
    cursor: 'pointer', padding: 3, borderRadius: 4, flexShrink: 0,
};

/** Shared inline style for the create + rename text inputs. */
const editInput: React.CSSProperties = {
    flex: 1, minWidth: 0, background: 'var(--bg-desktop)', color: '#f0f0f0',
    border: '1px solid #333', borderRadius: 4, padding: '4px 8px',
    fontSize: 12, fontFamily: 'inherit', outline: 'none',
};

function sortDomaines(list: DomaineMeta[], sort: WorkspaceSort): DomaineMeta[] {
    const copy = list.slice();
    if (sort === 'name-asc') copy.sort((a, b) => a.name.localeCompare(b.name));
    // 'modified-desc' has no domaine-level timestamp yet → falls through to position
    else copy.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    return copy;
}

/**
 * Decide which domaine (if any) to restore on first mount from the persisted
 * `lastActiveDomainePath` (Cycle 10 decision C10-D1). Returns the path to re-open
 * only when it still exists in the freshly-loaded domaine list — a stale path (the
 * domaine was renamed/deleted while the widget was closed) restores to the index.
 * Pure so it can be unit-tested without rendering the widget.
 */
export function pickRestoreDomaine(
    domaines: DomaineMeta[],
    lastActiveDomainePath: string | null,
): string | null {
    if (!lastActiveDomainePath) return null;
    return domaines.some((d) => d.path === lastActiveDomainePath) ? lastActiveDomainePath : null;
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
    const offline = useWorkspaceStore((s) => s.offline);
    const loadDomaines = useWorkspaceStore((s) => s.loadDomaines);
    const loadTree = useWorkspaceStore((s) => s.loadTree);
    const useLocalWorkspace = useWorkspaceStore((s) => s.useLocalWorkspace);
    const loadThreadMetas = useWorkspaceStore((s) => s.loadThreadMetas);
    const projectsForDomaine = useWorkspaceStore((s) => s.projectsForDomaine);
    const threadsForProject = useWorkspaceStore((s) => s.threadsForProject);
    const openDomaine = useWorkspaceStore((s) => s.openDomaine);
    const openProject = useWorkspaceStore((s) => s.openProject);
    const goBack = useWorkspaceStore((s) => s.goBack);
    const mutating = useWorkspaceStore((s) => s.mutating);
    const mutationError = useWorkspaceStore((s) => s.mutationError);
    const clearMutationError = useWorkspaceStore((s) => s.clearMutationError);
    const createEntry = useWorkspaceStore((s) => s.createEntry);
    const renameEntry = useWorkspaceStore((s) => s.renameEntry);
    const removeEntry = useWorkspaceStore((s) => s.removeEntry);
    const setThreadStatus = useWorkspaceStore((s) => s.setThreadStatus);
    const hydrate = useWorkspaceStore((s) => s.hydrate);

    const {
        sortDomaine, setSortDomaine,
        sortProject, setSortProject,
        sortThread, setSortThread,
        lastActiveDomainePath, setLastActiveDomainePath,
    } = useWorkspaceUi();

    // Transient inline-editor state for mutations (client-only — never persisted).
    const [creating, setCreating] = useState(false);
    const [createName, setCreateName] = useState('');
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const [renameName, setRenameName] = useState('');
    const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);

    // Hydrate the last-known structure from localStorage BEFORE the backend fetch, so the
    // File Explorer shows your folders instantly on reload and stays populated offline.
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    useEffect(() => { hydrate(uid); }, [hydrate, uid]);

    // Fetch the domaines list once on mount (effect-time = SSR-safe). If the backend route
    // is unreachable (no backend / 404), fall back to the local sample workspace so the
    // Domaine→Project→Thread drill-down stays reachable offline (Cycle 9).
    useEffect(() => {
        void (async () => {
            await loadDomaines();
            const s = useWorkspaceStore.getState();
            if (s.error && s.domaines.length === 0) s.useLocalWorkspace();
        })();
    }, [loadDomaines]);

    // Restore the last-active domaine once the list has loaded (per-user persistence
    // polish, decision C10-D1). Fires at most once per widget instance and never
    // overrides an in-progress navigation; a stale persisted path falls back to index.
    const restoredRef = useRef(false);
    useEffect(() => {
        if (restoredRef.current) return;
        if (loading || domaines.length === 0) return; // wait for the fetch to settle
        if (view !== 'index' || activeDomainePath) return; // user already navigated
        restoredRef.current = true;
        const restore = pickRestoreDomaine(domaines, lastActiveDomainePath);
        if (restore) openDomaine(restore);
    }, [loading, domaines, view, activeDomainePath, lastActiveDomainePath, openDomaine]);

    // Lazily fetch the shared tree the first time we drill below the index (per D3 the tree
    // is the source of project + thread structure). Cheap to re-run; loadTree is idempotent.
    useEffect(() => {
        if (view !== 'index' && tree.length === 0 && !treeLoading && !treeError) {
            void (async () => {
                await loadTree();
                const s = useWorkspaceStore.getState();
                if (s.treeError && s.tree.length === 0) s.useLocalWorkspace();
            })();
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

    // Close any open inline editor whenever we change altitude (navigation resets transient UI).
    useEffect(() => {
        setCreating(false); setCreateName('');
        setRenamingPath(null); setRenameName('');
        setConfirmDeletePath(null);
    }, [view, activeDomainePath, activeProjectPath]);

    const handleOpenDomaine = (d: DomaineMeta) => {
        setLastActiveDomainePath(d.path);
        openDomaine(d.path);
    };

    // Open every file in a thread as a Scribe tab, then surface the Scribe widget
    // (decision C9-D1). openFile/dispatchOpenWidget are the injected side effects.
    const handleOpenInScribe = (thread: FileEntry) => {
        openThreadInScribe(thread, {
            openFile: (fp) => useScribeStore.getState().openFile(fp),
            openWidget: dispatchOpenWidget,
        });
    };

    // The tier + parent path a "+ New" create targets at the current altitude.
    const childTier = view === 'index' ? 'domaine' : view === 'domaine' ? 'project' : 'thread';
    const createParent = view === 'index' ? null : view === 'domaine' ? activeDomainePath : activeProjectPath;

    const handleCreate = async () => {
        if (createParent === undefined) return; // active path not resolved yet
        const ok = await createEntry(createParent ?? null, createName);
        if (ok) { setCreating(false); setCreateName(''); }
    };
    const startRename = (path: string, currentName: string) => {
        setRenamingPath(path); setRenameName(currentName); setConfirmDeletePath(null);
    };
    const submitRename = async (path: string) => {
        const ok = await renameEntry(path, renameName);
        if (ok) { setRenamingPath(null); setRenameName(''); }
    };
    const submitDelete = async (path: string) => {
        const ok = await removeEntry(path);
        if (ok) setConfirmDeletePath(null);
    };

    /** Per-card action cluster: rename (Pencil) + two-step delete (Trash → confirm). */
    const cardActions = (path: string, name: string) => (
        <div style={{ display: 'flex', gap: 1, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <button
                type="button" aria-label={`Rename ${name}`} title="Rename"
                onClick={(e) => { e.stopPropagation(); startRename(path, name); }}
                style={iconBtn}
                onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
            ><Pencil size={12} strokeWidth={1.75} /></button>
            {confirmDeletePath === path ? (
                <>
                    <button
                        type="button" aria-label={`Confirm delete ${name}`} title="Confirm delete"
                        onClick={(e) => { e.stopPropagation(); void submitDelete(path); }}
                        disabled={mutating} style={{ ...iconBtn, color: DANGER }}
                    ><Check size={12} strokeWidth={2} /></button>
                    <button
                        type="button" aria-label="Cancel delete" title="Cancel"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeletePath(null); }}
                        style={iconBtn}
                    ><X size={12} strokeWidth={2} /></button>
                </>
            ) : (
                <button
                    type="button" aria-label={`Delete ${name}`} title="Delete"
                    onClick={(e) => { e.stopPropagation(); setConfirmDeletePath(path); setRenamingPath(null); }}
                    style={iconBtn}
                    onMouseEnter={(e) => { e.currentTarget.style.color = DANGER; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
                ><Trash2 size={12} strokeWidth={1.75} /></button>
            )}
        </div>
    );

    /** Inline rename editor row, shown in place of a card while renamingPath === path. */
    const renameRow = (path: string) => (
        <div
            key={path} role="listitem"
            style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: 8,
                borderRadius: 8, background: '#101010', border: `1px solid ${ACCENT}`,
            }}
        >
            <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus value={renameName} aria-label="New name"
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitRename(path);
                    if (e.key === 'Escape') { setRenamingPath(null); setRenameName(''); }
                }}
                style={editInput}
            />
            <button type="button" aria-label="Confirm rename" title="Save" disabled={mutating}
                onClick={() => void submitRename(path)} style={{ ...iconBtn, color: ACCENT }}>
                <Check size={14} strokeWidth={2} />
            </button>
            <button type="button" aria-label="Cancel rename" title="Cancel"
                onClick={() => { setRenamingPath(null); setRenameName(''); }} style={iconBtn}>
                <X size={14} strokeWidth={2} />
            </button>
        </div>
    );

    // Display labels for the toolbar/back-nav (resolve domaine display name from metadata).
    const activeDomaine = activeDomainePath
        ? domaines.find((d) => d.path === activeDomainePath) ?? null
        : null;
    const domaineName = activeDomaine?.name ?? activeDomainePath ?? '';
    const projectName = activeProjectPath?.split('/').filter(Boolean).pop() ?? '';
    const title = view === 'index' ? 'Domaines' : view === 'domaine' ? domaineName : projectName;
    const backLabel = view === 'project' ? domaineName : 'Domaines';

    const refresh = () => {
        void (async () => {
            if (view === 'index') {
                await loadDomaines();
                const s = useWorkspaceStore.getState();
                if (s.error && s.domaines.length === 0) useLocalWorkspace();
            } else {
                await loadTree();
                const s = useWorkspaceStore.getState();
                if (s.treeError && s.tree.length === 0) useLocalWorkspace();
            }
        })();
    };
    const refreshBusy = view === 'index' ? loading : treeLoading;
    const refreshLabel = view === 'index'
        ? 'Refresh domaines'
        : view === 'domaine' ? 'Refresh projects' : 'Refresh threads';

    return (
        <div
            style={{
                display: 'flex', flexDirection: 'column', height: '100%',
                background: 'var(--bg-desktop)', color: '#e8e8e8',
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
                            color: 'var(--text-tertiary)', cursor: 'pointer', padding: 2,
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
                    letterSpacing: '0.02em', color: 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {title}
                </span>

                {view !== 'index' && activeDomaine && (
                    <DomaineBadge domaine={activeDomaine} variant="chip" />
                )}

                {view === 'index' && (
                    <select
                        value={sortDomaine}
                        onChange={(e) => setSortDomaine(e.target.value as WorkspaceSort)}
                        title="Sort domaines"
                        aria-label="Sort domaines"
                        style={{
                            background: 'var(--bg-desktop)', color: 'var(--text-secondary)',
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
                            background: 'var(--bg-desktop)', color: 'var(--text-secondary)',
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
                            background: 'var(--bg-desktop)', color: 'var(--text-secondary)',
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
                    type="button"
                    onClick={() => { setCreating((c) => !c); setCreateName(''); clearMutationError(); }}
                    title={`New ${childTier}`}
                    aria-label={`New ${childTier}`}
                    aria-pressed={creating}
                    style={{
                        display: 'flex', alignItems: 'center',
                        background: 'transparent', border: 'none',
                        color: creating ? ACCENT : '#666', cursor: 'pointer', padding: 2,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = creating ? ACCENT : '#666'; }}
                >
                    <Plus size={15} strokeWidth={2} />
                </button>

                <button
                    type="button"
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
                {offline && (
                    <div
                        role="status"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                            padding: '8px 12px', fontSize: 11, color: '#d6b25a',
                            background: 'rgba(245,158,11,0.06)', borderRadius: 6,
                            border: '1px solid rgba(245,158,11,0.25)', lineHeight: 1.5,
                        }}
                    >
                        <span style={{ flex: 1 }}>
                            Backend unavailable — showing a local sample workspace. Drill-down
                            works; creating/renaming folders needs the backend.
                        </span>
                    </div>
                )}

                {mutationError && (
                    <div
                        role="alert"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                            padding: '8px 12px', fontSize: 11, color: DANGER,
                            background: 'rgba(255,77,109,0.06)', borderRadius: 6,
                            border: '1px solid rgba(255,77,109,0.25)',
                        }}
                    >
                        <span style={{ flex: 1 }}>{mutationError}</span>
                        <button
                            type="button" aria-label="Dismiss error" title="Dismiss"
                            onClick={clearMutationError} style={{ ...iconBtn, color: DANGER }}
                        ><X size={13} strokeWidth={2} /></button>
                    </div>
                )}

                {creating && (
                    <div
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                            padding: 8, borderRadius: 8, background: '#101010',
                            border: `1px solid ${ACCENT}`,
                        }}
                    >
                        <input
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus value={createName}
                            placeholder={`New ${childTier} name`}
                            aria-label={`New ${childTier} name`}
                            onChange={(e) => setCreateName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleCreate();
                                if (e.key === 'Escape') { setCreating(false); setCreateName(''); }
                            }}
                            style={editInput}
                        />
                        <button type="button" aria-label={`Create ${childTier}`} title="Create"
                            disabled={mutating} onClick={() => void handleCreate()}
                            style={{ ...iconBtn, color: ACCENT }}>
                            <Check size={14} strokeWidth={2} />
                        </button>
                        <button type="button" aria-label="Cancel create" title="Cancel"
                            onClick={() => { setCreating(false); setCreateName(''); }} style={iconBtn}>
                            <X size={14} strokeWidth={2} />
                        </button>
                    </div>
                )}

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
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#808080', fontSize: 11 }}>
                            Loading threads…
                        </div>
                    ) : sortedThreads.length === 0 ? (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#808080', fontSize: 11, lineHeight: 1.6 }}>
                            <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}></div>
                            <div style={{ color: 'var(--text-tertiary)', marginBottom: 4 }}>No threads in this project</div>
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
                                if (renamingPath === t.path) return renameRow(t.path);
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
                                                    {isComplete ? 'complete' : 'active'}
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
                                                    fontSize: 10, color: '#808080',
                                                }}>
                                                    <FileText size={11} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                                                    {files === 1 ? '1 file' : `${files} files`}
                                                </span>
                                            )}
                                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                {threadHasFiles(t) && (
                                                    <button
                                                        type="button"
                                                        aria-label={`Open ${t.name} in Scribe`}
                                                        title="Open in Scribe"
                                                        onClick={() => handleOpenInScribe(t)}
                                                        style={iconBtn}
                                                        onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
                                                    ><ExternalLink size={12} strokeWidth={1.75} /></button>
                                                )}
                                                <button
                                                    type="button"
                                                    aria-label={isComplete ? `Reopen ${t.name}` : `Mark ${t.name} complete`}
                                                    title={isComplete ? 'Reopen thread' : 'Mark complete'}
                                                    disabled={mutating}
                                                    onClick={() => void setThreadStatus(t.path, isComplete ? 'active' : 'complete')}
                                                    style={{ ...iconBtn, color: isComplete ? '#8fbf9a' : '#888' }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT; }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.color = isComplete ? '#8fbf9a' : '#888'; }}
                                                >
                                                    {isComplete
                                                        ? <RotateCcw size={12} strokeWidth={1.75} />
                                                        : <CheckCircle2 size={12} strokeWidth={1.75} />}
                                                </button>
                                                {cardActions(t.path, t.name)}
                                            </div>
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
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#808080', fontSize: 11 }}>
                            Loading projects…
                        </div>
                    ) : sortedProjects.length === 0 ? (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#808080', fontSize: 11, lineHeight: 1.6 }}>
                            <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}></div>
                            <div style={{ color: 'var(--text-tertiary)', marginBottom: 4 }}>No projects in this domaine</div>
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
                                if (renamingPath === p.path) return renameRow(p.path);
                                const threads = threadCount(p);
                                return (
                                    <div key={p.path} role="listitem" style={{ position: 'relative' }}>
                                        <div
                                            role="button" tabIndex={0}
                                            onClick={() => openProject(p.path)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(p.path); }
                                            }}
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 30 }}>
                                                <Folder size={14} strokeWidth={1.75} style={{ color: '#9a9a9a', flexShrink: 0 }} />
                                                <span style={{
                                                    flex: 1, minWidth: 0,
                                                    fontSize: 12, fontWeight: 600, color: '#f0f0f0',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>{p.name}</span>
                                            </div>
                                            <span style={{
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                fontSize: 10, color: '#808080',
                                            }}>
                                                <MessageSquare size={11} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                                                {threads === 1 ? '1 thread' : `${threads} threads`}
                                            </span>
                                        </div>
                                        <div style={{ position: 'absolute', top: 8, right: 8 }}>
                                            {cardActions(p.path, p.name)}
                                        </div>
                                    </div>
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
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#808080', fontSize: 11 }}>
                        Loading domaines…
                    </div>
                ) : sortedDomaines.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#808080', fontSize: 11, lineHeight: 1.6 }}>
                        <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}></div>
                        <div style={{ color: 'var(--text-tertiary)', marginBottom: 4 }}>No domaines yet</div>
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
                        {sortedDomaines.map((d) => {
                            if (renamingPath === d.path) return renameRow(d.path);
                            return (
                                <div key={d.path} role="listitem" style={{ position: 'relative' }}>
                                    <div
                                        role="button" tabIndex={0}
                                        onClick={() => handleOpenDomaine(d)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDomaine(d); }
                                        }}
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 30 }}>
                                            <FolderOpen size={14} strokeWidth={1.75} style={{ color: d.color || ACCENT, flexShrink: 0 }} />
                                            <span style={{
                                                flex: 1, minWidth: 0,
                                                fontSize: 12, fontWeight: 600, color: '#f0f0f0',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>{d.name}</span>
                                        </div>
                                        {d.description && (
                                            <span style={{
                                                fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5,
                                                display: '-webkit-box', WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                            }}>{d.description}</span>
                                        )}
                                    </div>
                                    <div style={{ position: 'absolute', top: 8, right: 8 }}>
                                        {cardActions(d.path, d.name)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
