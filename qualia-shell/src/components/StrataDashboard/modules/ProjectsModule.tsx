/**
 * ProjectsModule — Universal Node
 *
 * Projects roll up from entity profiles. Instead of a flat Trello bucket,
 * workitems are grouped by their property/entity context.
 *
 * Views:
 *   • "By Entity" — projects grouped under their parent entity (property, vendor, etc.)
 *   • "All"      — flat board/list of all projects (original behavior)
 *   • "Kanban"   — status-column board
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FolderKanban, RefreshCw, ChevronDown, ChevronUp, Clock, Tag,
    CheckCircle2, XCircle, ArrowRightLeft, Search, LayoutGrid, List,
    Building2, Truck, Users, GitBranch, Layers, Plus,
} from 'lucide-react';
import { strataGet, strataPost, strataPut, isStaticMode } from '../strataApi';
import type { Workitem, Property } from '../strataTypes';
import { LoadingState, ErrorState } from '../StateView';
// Task 3.7 — GR-13 observability wiring + ErrorBoundary, mirrors the
// Task 2.4 / 2.8 SentimentModule retrofit pattern. Sentry breadcrumbs
// are try/catch-wrapped so missing DSN is silent in test/local builds.
// isStaticMode short-circuits the strataPut write path with an inline
// feedback banner — the canonical 3-form-aware export from strataApi.ts
// avoids divergence with the router's routing decision.
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';

type ViewMode = 'by-entity' | 'all' | 'kanban';
type StatusGroup = 'active' | 'inactive';

const STATUS_COLUMNS = ['open', 'in_progress', 'review', 'completed', 'cancelled'] as const;

const ENTITY_ICON: Record<string, React.ReactNode> = {
    property: <Building2 size={14} />,
    vendor: <Truck size={14} />,
    tenant: <Users size={14} />,
};

function ProjectsModuleInner() {
    const [items, setItems] = useState<Workitem[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('by-entity');
    const [statusFeedback, setStatusFeedback] = useState('');

    const fetchProjects = useCallback(async () => {
        setLoading(true);
        try {
            const [wiData, propData] = await Promise.all([
                strataGet<Workitem[]>('/workitems', { limit: '2000' }),
                strataGet<Property[]>('/properties'),
            ]);
            setItems(wiData);
            setProperties(propData);
        } catch (e) {
            console.error(e);
            setError('Failed to load projects');
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.fetch',
                    message: 'projects.fetch.error',
                    level: 'warning',
                });
            } catch { /* Sentry no-op when DSN unset */ }
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchProjects();
        // Task 3.7 — GR-13 breadcrumb on initial module load.
        try {
            Sentry.addBreadcrumb({
                category: 'ui.load',
                message: 'projects.module.loaded',
                level: 'info',
                data: { staticMode: isStaticMode },
            });
        } catch { /* Sentry no-op when DSN unset */ }
    }, [fetchProjects]);

    const toggleStatus = async (id: string, currentStatus: string) => {
        const newStatus = ['open', 'in_progress'].includes(currentStatus) ? 'completed' : 'open';
        // Task 3.7 — static-mode guard. Static deck is read-only;
        // backend mode keeps the original strataPut + refresh path. Uses
        // the canonical isStaticMode export (3-form-aware) rather than
        // an inline import.meta.env check to avoid divergence with the
        // router's routing decision. Mirrors SentimentModule.tsx:89-100.
        if (isStaticMode) {
            setStatusFeedback('🗒️ Status updates require backend mode (static deck is read-only).');
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.submit',
                    message: 'projects.status.toggle.skipped',
                    level: 'info',
                    data: { workitemId: id, attemptedStatus: newStatus },
                });
            } catch { /* Sentry no-op when DSN unset */ }
            return;
        }
        try {
            Sentry.addBreadcrumb({
                category: 'ui.submit',
                message: 'projects.status.toggle.sent',
                level: 'info',
                data: { workitemId: id, attemptedStatus: newStatus },
            });
            await strataPut(`/workitems/${id}`, { status: newStatus });
            fetchProjects();
        } catch (e) { console.error(e); }
    };

    const filtered = useMemo(() => {
        if (!searchQuery) return items;
        const q = searchQuery.toLowerCase();
        return items.filter(w =>
            w.title.toLowerCase().includes(q) ||
            (w.description || '').toLowerCase().includes(q) ||
            w.tags.some(t => t.toLowerCase().includes(q)) ||
            (w.domain || '').toLowerCase().includes(q)
        );
    }, [items, searchQuery]);

    // ── Group by entity ──
    const propMap = useMemo(() => {
        const m = new Map<string, Property>();
        properties.forEach(p => m.set(p.id, p));
        return m;
    }, [properties]);

    const entityGroups = useMemo(() => {
        const groups = new Map<string, { label: string; icon: React.ReactNode; items: Workitem[] }>();

        filtered.forEach(w => {
            let key = 'unassigned';
            let label = 'Unassigned / General';
            let icon: React.ReactNode = <Layers size={14} />;

            if (w.propertyId) {
                key = `property:${w.propertyId}`;
                const prop = propMap.get(w.propertyId);
                label = prop ? prop.name : `Property ${w.propertyId.slice(0, 8)}…`;
                icon = <Building2 size={14} />;
            } else if (w.metadata?.vendorId) {
                key = `vendor:${w.metadata.vendorId}`;
                label = w.metadata.vendorName || `Vendor ${w.metadata.vendorId.slice(0, 8)}…`;
                icon = <Truck size={14} />;
            }

            if (!groups.has(key)) groups.set(key, { label, icon, items: [] });
            groups.get(key)!.items.push(w);
        });

        // Sort by item count descending
        return Array.from(groups.entries()).sort((a, b) => b[1].items.length - a[1].items.length);
    }, [filtered, propMap]);

    const activeItems = filtered.filter(w => ['open', 'in_progress', 'review'].includes(w.status));
    const inactiveItems = filtered.filter(w => ['completed', 'cancelled'].includes(w.status));

    // ── Kanban columns ──
    const kanbanColumns = useMemo(() => {
        return STATUS_COLUMNS.map(status => ({
            status,
            items: filtered.filter(w => w.status === status),
        }));
    }, [filtered]);

    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'high': return '#ef4444';
            case 'medium': return '#f59e0b';
            case 'low': return '#10b981';
            default: return '#64748b';
        }
    };

    const getStatusColor = (s: string) => {
        switch (s) {
            case 'open': return '#3b82f6';
            case 'in_progress': return '#f59e0b';
            case 'review': return '#a78bfa';
            case 'completed': return '#10b981';
            case 'cancelled': return '#ef4444';
            default: return '#64748b';
        }
    };

    // ── Small project card ──
    const ProjectCard = ({ wi }: { wi: Workitem }) => {
        const [expanded, setExpanded] = useState(false);
        const isActive = ['open', 'in_progress', 'review'].includes(wi.status);
        const md = wi.metadata || {};

        return (
            <div data-testid={`projects-card-${wi.id}`} style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 10, overflow: 'hidden',
                borderLeft: `3px solid ${getStatusColor(wi.status)}`,
                transition: 'all 0.15s ease',
            }}>
                <div
                    onClick={() => setExpanded(!expanded)}
                    style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 14px', cursor: 'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: isActive ? '#e2e8f0' : '#64748b' }}>
                                {wi.title}
                            </span>
                        </div>
                        {wi.description && !expanded && (
                            <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.5, maxHeight: 32, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {wi.description.slice(0, 120)}{wi.description.length > 120 ? '…' : ''}
                            </p>
                        )}
                        {wi.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                                {wi.tags.slice(0, 3).map((tag, i) => (
                                    <span key={i} style={{
                                        fontSize: 9, padding: '1px 5px', borderRadius: 4,
                                        background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', fontWeight: 600,
                                    }}>{tag}</span>
                                ))}
                                {wi.tags.length > 3 && <span style={{ fontSize: 9, color: '#475569' }}>+{wi.tags.length - 3}</span>}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span className={`s-badge ${wi.status}`} style={{ fontSize: '0.55rem' }}>{wi.status.replace('_', ' ')}</span>
                        {wi.priority && (
                            <span style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: getPriorityColor(wi.priority), flexShrink: 0,
                            }} title={wi.priority} />
                        )}
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </div>
                </div>

                {expanded && (
                    <div style={{
                        padding: '10px 14px',
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                        background: 'rgba(255,255,255,0.01)',
                    }}>
                        {wi.description && (
                            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                {wi.description}
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10, color: '#475569', marginBottom: 10 }}>
                            <span><Clock size={10} style={{ verticalAlign: -1 }} /> {new Date(wi.createdAt).toLocaleDateString()}</span>
                            {wi.domain && <span>Domain: {wi.domain}</span>}
                            {wi.type && <span>Type: {wi.type}</span>}
                            {md.boardName && <span>Board: {md.boardName}</span>}
                            {md.listName && <span>List: {md.listName}</span>}
                            {wi.propertyId && <span>🏠 {propMap.get(wi.propertyId)?.name || wi.propertyId.slice(0, 8)}</span>}
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleStatus(wi.id, wi.status); }}
                            style={{
                                padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                border: `1px solid ${isActive ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}`,
                                background: isActive ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                                color: isActive ? '#10b981' : '#a5b4fc',
                                cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                            }}
                        >
                            <ArrowRightLeft size={11} />
                            {isActive ? 'Mark Inactive' : 'Reactivate'}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    // ── Entity group section ──
    const EntityGroup = ({ groupKey, group }: { groupKey: string; group: { label: string; icon: React.ReactNode; items: Workitem[] } }) => {
        const [collapsed, setCollapsed] = useState(false);
        const active = group.items.filter(w => ['open', 'in_progress', 'review'].includes(w.status));
        const inactive = group.items.filter(w => ['completed', 'cancelled'].includes(w.status));

        return (
            <div data-testid={`projects-entity-group-${groupKey}`} className="s-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div
                    onClick={() => setCollapsed(!collapsed)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px', cursor: 'pointer',
                        borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(255,255,255,0.01)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'}
                >
                    <span style={{ color: '#818cf8' }}>{group.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', flex: 1 }}>{group.label}</span>
                    <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: active.length > 0 ? 'rgba(99,102,241,0.15)' : 'rgba(100,116,139,0.1)',
                        color: active.length > 0 ? '#a5b4fc' : '#64748b',
                    }}>{active.length} active</span>
                    <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10,
                        background: 'rgba(100,116,139,0.08)', color: '#475569',
                    }}>{inactive.length} done</span>
                    {collapsed ? <ChevronDown size={14} style={{ color: '#475569' }} /> : <ChevronUp size={14} style={{ color: '#475569' }} />}
                </div>
                {!collapsed && (
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {group.items.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', color: '#475569', fontSize: 12 }}>No projects</div>
                        ) : (
                            group.items
                                .sort((a, b) => {
                                    const aActive = ['open', 'in_progress', 'review'].includes(a.status) ? 0 : 1;
                                    const bActive = ['open', 'in_progress', 'review'].includes(b.status) ? 0 : 1;
                                    if (aActive !== bActive) return aActive - bActive;
                                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                                })
                                .map(wi => <ProjectCard key={wi.id} wi={wi} />)
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div data-testid="projects-module" className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">
                        <FolderKanban size={22} style={{ verticalAlign: -4, marginRight: 8, color: '#818cf8' }} />
                        Projects — Universal Node
                    </h2>
                    <p className="s-module-subtitle">
                        {activeItems.length} active, {inactiveItems.length} inactive — {items.length} total
                        {entityGroups.length > 1 && ` across ${entityGroups.length} entities`}
                    </p>
                </div>
                <div className="s-module-actions">
                    <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {([
                            ['by-entity', GitBranch, 'By Entity'] as const,
                            ['all', List, 'All'] as const,
                            ['kanban', LayoutGrid, 'Kanban'] as const,
                        ]).map(([mode, Icon, label]) => (
                            <button
                                key={mode}
                                data-testid={`projects-view-mode-${mode}`}
                                className="s-btn s-btn-ghost"
                                style={{
                                    padding: '5px 10px', borderRadius: 0, margin: 0, gap: 4,
                                    background: viewMode === mode ? 'rgba(99,102,241,0.2)' : 'transparent',
                                    color: viewMode === mode ? '#6366f1' : '#64748b', fontSize: 11,
                                }}
                                onClick={() => setViewMode(mode)}
                            >
                                <Icon size={13} /> {label}
                            </button>
                        ))}
                    </div>
                    <button data-testid="projects-refresh-btn" className="s-btn s-btn-ghost" onClick={fetchProjects}><RefreshCw size={14} /></button>
                </div>
            </div>

            {/* Task 3.7 — isStaticMode write-guard feedback banner.
                Sticky until the next toggle action overwrites it (mirrors
                SentimentModule.tsx submitMsg semantics). Asserted in
                projects.module.test.tsx via getByText. */}
            {statusFeedback && (
                <div style={{
                    padding: '8px 14px',
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: 12,
                    color: '#fca5a5',
                }}>{statusFeedback}</div>
            )}

            {/* Search */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', background: 'rgba(255,255,255,0.04)',
                borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                marginBottom: 16, maxWidth: 400,
            }}>
                <Search size={14} style={{ color: '#64748b' }} />
                <input
                    data-testid="projects-search-input"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search projects…"
                    style={{ flex: 1, background: 'none', border: 'none', color: '#e2e8f0', fontSize: 12, outline: 'none' }}
                />
            </div>

            {loading ? (
                <LoadingState message="Loading projects…" />
            ) : error ? (
                <ErrorState message={error} onRetry={fetchProjects} />
            ) : items.length === 0 ? (
                <div className="s-glass-card" style={{ padding: 40, textAlign: 'center', color: '#475569' }}>
                    <FolderKanban size={40} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>No projects found. Run the Trello sync or create workitems.</p>
                </div>
            ) : viewMode === 'by-entity' ? (
                /* ── By Entity View ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {entityGroups.map(([key, group]) => (
                        <EntityGroup key={key} groupKey={key} group={group} />
                    ))}
                </div>
            ) : viewMode === 'kanban' ? (
                /* ── Kanban View ── */
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${STATUS_COLUMNS.length}, 1fr)`,
                    gap: 12, alignItems: 'start',
                }}>
                    {kanbanColumns.map(col => (
                        <div key={col.status} data-testid={`projects-kanban-column-${col.status}`}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                                padding: '8px 12px', borderRadius: 8,
                                background: `${getStatusColor(col.status)}12`,
                                border: `1px solid ${getStatusColor(col.status)}25`,
                            }}>
                                <span style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: getStatusColor(col.status),
                                }} />
                                <span style={{ fontWeight: 700, fontSize: 12, color: '#e2e8f0', textTransform: 'capitalize' }}>
                                    {col.status.replace('_', ' ')}
                                </span>
                                <span style={{
                                    marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                                    padding: '1px 6px', borderRadius: 8,
                                    background: `${getStatusColor(col.status)}20`,
                                    color: getStatusColor(col.status),
                                }}>{col.items.length}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {col.items.length === 0 ? (
                                    <div style={{ padding: 20, textAlign: 'center', color: '#3f4f5f', fontSize: 11 }}>Empty</div>
                                ) : (
                                    col.items.map(wi => <ProjectCard key={wi.id} wi={wi} />)
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* ── All / List View ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <h3 style={{ margin: '8px 0', fontSize: 14, color: '#e2e8f0' }}>
                        <CheckCircle2 size={14} style={{ verticalAlign: -2, marginRight: 6, color: '#6366f1' }} />
                        Active ({activeItems.length})
                    </h3>
                    {activeItems.map(wi => <ProjectCard key={wi.id} wi={wi} />)}
                    <h3 style={{ margin: '16px 0 8px', fontSize: 14, color: '#94a3b8' }}>
                        <XCircle size={14} style={{ verticalAlign: -2, marginRight: 6, color: '#64748b' }} />
                        Inactive ({inactiveItems.length})
                    </h3>
                    {inactiveItems.map(wi => <ProjectCard key={wi.id} wi={wi} />)}
                </div>
            )}
        </div>
    );
}

// Task 3.7 — ErrorBoundary wrap mirrors the Task 2.1 / 2.2 / 2.4 / 2.10 / 2.8
// SentimentModule retrofit pattern. Inner module body holds the hooks; this
// exported wrapper owns the boundary so a render fault in any sub-section
// degrades gracefully instead of taking the whole shell down.
export default function ProjectsModule() {
    return (
        <ErrorBoundary fallback={<div className="s-glass-card" style={{ padding: 14, color: '#f87171', fontSize: 12 }}>Projects module unavailable.</div>}>
            <ProjectsModuleInner />
        </ErrorBoundary>
    );
}
