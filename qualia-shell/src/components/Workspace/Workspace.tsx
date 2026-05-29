/**
 * Workspace — Holocron-style Domaine → Project → Thread browser (Dwellium port).
 *
 * Cycle 5 (this file): the DOMAINES INDEX view. Fetches the domaines list on mount
 *   via workspaceStore.loadDomaines() (→ workspaceApi.fetchDomaines over HTTP) and
 *   renders a card grid with loading / empty / error states + a per-user sort control.
 *   Drill-down to projects/threads lands in Cycle 6+; for now a non-index view shows a
 *   minimal placeholder with a back affordance so the widget is never left in a dead end.
 *
 * Patterns mirror FileExplorer: inline styles (fey.com black + acid-lime #D6FE51),
 * useContext(UserContext)-based per-user state via useWorkspaceUi, RefreshCw refresh
 * convention with aria-label, SSR-safe stores. See WORKSPACE_PORTING_PLAN.md §11.
 */
import { useEffect, useMemo } from 'react';
import { RefreshCw, ChevronLeft, FolderOpen } from 'lucide-react';
import { useWorkspaceStore } from './workspaceStore';
import { useWorkspaceUi } from './useWorkspaceUi';
import type { DomaineMeta } from './workspaceApi';
import type { WorkspaceSort } from './workspaceUiStore';

const ACCENT = '#D6FE51';

function sortDomaines(list: DomaineMeta[], sort: WorkspaceSort): DomaineMeta[] {
    const copy = list.slice();
    if (sort === 'name-asc') copy.sort((a, b) => a.name.localeCompare(b.name));
    // 'modified-desc' has no domaine-level timestamp yet → falls through to position
    else copy.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    return copy;
}

export default function Workspace() {
    const view = useWorkspaceStore((s) => s.view);
    const activeDomainePath = useWorkspaceStore((s) => s.activeDomainePath);
    const domaines = useWorkspaceStore((s) => s.domaines);
    const loading = useWorkspaceStore((s) => s.loading);
    const error = useWorkspaceStore((s) => s.error);
    const loadDomaines = useWorkspaceStore((s) => s.loadDomaines);
    const openDomaine = useWorkspaceStore((s) => s.openDomaine);
    const goBack = useWorkspaceStore((s) => s.goBack);

    const { sortDomaine, setSortDomaine, setLastActiveDomainePath } = useWorkspaceUi();

    // Fetch the domaines list once on mount (effect-time = SSR-safe).
    useEffect(() => {
        void loadDomaines();
    }, [loadDomaines]);

    const sorted = useMemo(() => sortDomaines(domaines, sortDomaine), [domaines, sortDomaine]);

    const handleOpen = (d: DomaineMeta) => {
        setLastActiveDomainePath(d.path);
        openDomaine(d.path);
    };

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
                        title="Back to domaines"
                        aria-label="Back to domaines"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 2,
                            background: 'transparent', border: 'none',
                            color: '#888', cursor: 'pointer', padding: 2,
                            fontFamily: 'inherit', fontSize: 11,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
                    >
                        <ChevronLeft size={14} strokeWidth={1.75} /> Domaines
                    </button>
                )}

                <span style={{
                    flex: 1, fontSize: 12, fontWeight: 600,
                    letterSpacing: '0.02em', color: '#ccc',
                }}>
                    {view === 'index' ? 'Domaines' : activeDomainePath}
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

                <button
                    onClick={() => void loadDomaines()}
                    title="Refresh domaines"
                    aria-label="Refresh domaines"
                    disabled={loading}
                    style={{
                        display: 'flex', alignItems: 'center',
                        background: 'transparent', border: 'none',
                        color: '#666', cursor: loading ? 'default' : 'pointer', padding: 2,
                    }}
                    onMouseEnter={(e) => { if (!loading) e.currentTarget.style.color = ACCENT; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                >
                    <RefreshCw size={14} strokeWidth={1.75} style={{
                        animation: loading ? 'spin 0.9s linear infinite' : undefined,
                    }} />
                </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 12 }}>
                {view !== 'index' ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#555', fontSize: 11, lineHeight: 1.6 }}>
                        <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>📂</div>
                        <div style={{ color: '#888', marginBottom: 4 }}>{activeDomainePath}</div>
                        <div style={{ fontSize: 10 }}>Project &amp; thread views arrive in the next cycle.</div>
                    </div>
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
                ) : sorted.length === 0 ? (
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
                        {sorted.map((d) => (
                            <button
                                key={d.path}
                                role="listitem"
                                onClick={() => handleOpen(d)}
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
