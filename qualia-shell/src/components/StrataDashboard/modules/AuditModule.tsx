/**
 * AuditModule — Strata Audit Log Viewer + Archive Search + Historical Data Entry
 *
 * Shows a chronological log of all user actions across the platform.
 * Features: search, pagination, user filter, entity type filter, expandable details,
 *           archive search (via RuVector), and historical event logging.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { strataGet } from '../strataApi';
import { Search, RefreshCw, ChevronDown, ChevronRight, User, Clock, Shield, Filter, ChevronLeft, Plus, Archive, X, ShieldCheck, Zap, AlertTriangle, Activity } from 'lucide-react';
import { strataPost } from '../strataApi';
// Task 2.7 — unified-timeline types (canonical from packages/types).
// The pre-existing local `interface AuditEntry` below is a distinct
// shape (numeric id, audit_log.json row) and is NOT replaced.
import type { AuditEvent, UnifiedTimelineView } from '../strataTypes';
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';

interface AuditEntry {
    id: number;
    userId: string;
    userName: string;
    userRole: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details: Record<string, any>;
    ipAddress?: string;
    createdAt: string;
}

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
    create: '#22c55e',
    update: '#3b82f6',
    delete: '#ef4444',
    login: '#a855f7',
    logout: '#6b7280',
    historical: '#f59e0b',
};

const ROLE_COLORS: Record<string, string> = {
    god: '#f59e0b',
    corporate: '#D6FE51',
    management: '#3b82f6',
    advisor: '#06b6d4',
    maintenance: '#22c55e',
    agent: '#ec4899',
    tenant: '#6b7280',
};

function getActionColor(action: string): string {
    const prefix = action.split('_')[0];
    return ACTION_COLORS[prefix] || '#94a3b8';
}

function formatTimestamp(ts: string): string {
    try {
        const d = new Date(ts);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        const diffDays = Math.floor(diffHr / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
}

function formatAction(action: string): string {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function AuditModule() {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [userFilter, setUserFilter] = useState('');
    const [uniqueUsers, setUniqueUsers] = useState<{ id: string; name: string; role: string }[]>([]);
    const [viewTab, setViewTab] = useState<'audit' | 'archive' | 'compliance' | 'unified'>('audit');
    // Task 2.7 — unified-timeline state. Fail-soft: empty arrays on error,
    // no toast; the 'audit-unified-empty' testid paints so CDP / Playwright
    // can distinguish "render succeeded, no data" from "render crashed".
    const [unifiedEvents, setUnifiedEvents] = useState<AuditEvent[]>([]);
    const [unifiedBreakdown, setUnifiedBreakdown] = useState<UnifiedTimelineView['sourceBreakdown'] | null>(null);
    const [unifiedLoading, setUnifiedLoading] = useState(false);
    const [complianceFindings, setComplianceFindings] = useState<any[]>([]);
    const [complianceSummary, setComplianceSummary] = useState<any>(null);
    const [complianceLoading, setComplianceLoading] = useState(false);
    const [complianceRunId, setComplianceRunId] = useState<string | null>(null);
    const [showHistForm, setShowHistForm] = useState(false);
    const [archiveSearch, setArchiveSearch] = useState('');
    const [archiveResults, setArchiveResults] = useState<any[]>([]);
    const [archiveLoading, setArchiveLoading] = useState(false);

    const fetchAudit = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {
                limit: String(PAGE_SIZE),
                offset: String(page * PAGE_SIZE),
            };
            if (search) params.q = search;
            if (userFilter) params.user_id = userFilter;

            const data = await strataGet<{ entries: AuditEntry[]; total: number }>('/audit', params);
            setEntries(data.entries || []);
            setTotal(data.total ?? 0);

            // Collect unique users for filter dropdown
            if (!userFilter && !search && page === 0) {
                const seen = new Map<string, { id: string; name: string; role: string }>();
                for (const e of data.entries || []) {
                    if (!seen.has(e.userId)) {
                        seen.set(e.userId, { id: e.userId, name: e.userName, role: e.userRole });
                    }
                }
                setUniqueUsers(Array.from(seen.values()));
            }
        } catch (e) {
            console.error('[AuditModule]', e);
        }
        setLoading(false);
    }, [search, page, userFilter]);

    useEffect(() => { fetchAudit(); }, [fetchAudit]);

    // Task 2.7 — Unified timeline fetcher. Runs when the 'unified' sub-tab
    // is active. Fail-soft: any error → empty state with empty testid.
    // Sentry breadcrumb on successful load (no-op without DSN).
    useEffect(() => {
        if (viewTab !== 'unified') return;
        let cancelled = false;
        (async () => {
            setUnifiedLoading(true);
            try {
                const data = await strataGet<UnifiedTimelineView>('/audit/unified-timeline');
                if (cancelled) return;
                setUnifiedEvents(Array.isArray(data?.events) ? data.events : []);
                setUnifiedBreakdown(data?.sourceBreakdown ?? null);
                try {
                    Sentry.addBreadcrumb({
                        category: 'ui.load',
                        message: 'audit.unified.loaded',
                        level: 'info',
                        data: { total: data?.total ?? 0, sourceBreakdown: data?.sourceBreakdown ?? null },
                    });
                } catch { /* Sentry no-op when DSN unset */ }
            } catch {
                if (!cancelled) {
                    setUnifiedEvents([]);
                    setUnifiedBreakdown(null);
                }
            } finally {
                if (!cancelled) setUnifiedLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [viewTab]);

    const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 1;

    const searchArchive = useCallback(async (q: string) => {
        if (!q.trim()) { setArchiveResults([]); return; }
        setArchiveLoading(true);
        try {
            // Task 2.7 — rewired off direct localhost:3000 fetch onto the
            // strataGet router so static (Netlify) + backend modes both
            // serve the archive-search tab. Fixes scheduling-pass §6 item #9.
            // Defensive shape: backend mode returns {success, data}; static
            // /search returns {results, total}; accept either.
            const data = await strataGet<any>('/search', { q });
            const list = data?.results ?? data?.data ?? [];
            setArchiveResults(Array.isArray(list) ? list : []);
        } catch (e) { console.error(e); }
        setArchiveLoading(false);
    }, []);

    const handleLogHistorical = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            // Route through strataApi so static/backend modes both work.
            await strataPost('/audit', {
                action: 'historical_entry',
                entityType: fd.get('entityType'),
                details: {
                    date: fd.get('date'),
                    eventType: fd.get('eventType'),
                    description: fd.get('description'),
                    entity: fd.get('entity'),
                },
            });
            setShowHistForm(false);
            fetchAudit();
        } catch (err) { console.error(err); }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Shield size={22} style={{ color: '#D6FE51' }} />
                        Audit &amp; Archive
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                        {total > 0 ? `${total.toLocaleString()} actions recorded` : 'No actions recorded yet'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={() => setShowHistForm(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8,
                            background: 'rgba(214,254,81,0.12)', border: '1px solid rgba(214,254,81,0.3)',
                            color: '#D6FE51', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        }}
                    >
                        <Plus size={14} /> Log Historical Event
                    </button>
                    <button
                        onClick={() => { setPage(0); fetchAudit(); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#e2e8f0', cursor: 'pointer', fontSize: 13,
                        }}
                    >
                        <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                {([{ id: 'audit' as const, label: 'Audit Log', Icon: Shield }, { id: 'archive' as const, label: 'Archive Search', Icon: Archive }, { id: 'compliance' as const, label: 'Compliance Audit', Icon: ShieldCheck }, { id: 'unified' as const, label: 'Unified Timeline', Icon: Activity }]).map(t => (
                    <button
                        key={t.id}
                        data-testid={t.id === 'unified' ? 'audit-unified-tab' : undefined}
                        onClick={() => {
                            setViewTab(t.id);
                            if (t.id === 'unified') {
                                try { Sentry.addBreadcrumb({ category: 'ui.click', message: 'audit.unified.tab.click', level: 'info' }); } catch { /* no-op */ }
                            }
                        }}
                        style={{
                            padding: '6px 14px', border: 'none', borderRadius: 6,
                            background: viewTab === t.id ? 'rgba(214,254,81,0.2)' : 'rgba(255,255,255,0.04)',
                            color: viewTab === t.id ? '#D6FE51' : '#94a3b8',
                            cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                        <t.Icon size={13} /> {t.label}
                    </button>
                ))}
            </div>

            {/* ═══ AUDIT LOG TAB ═══ */}
            {viewTab === 'audit' && (
                <>
                    {/* Search & Filters */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                            <input
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(0); }}
                                placeholder="Search actions, users, entities..."
                                style={{
                                    width: '100%', padding: '10px 10px 10px 36px', borderRadius: 8,
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                    color: '#e2e8f0', fontSize: 13, outline: 'none',
                                }}
                            />
                        </div>
                        {uniqueUsers.length > 0 && (
                            <div style={{ position: 'relative' }}>
                                <Filter size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                <select
                                    value={userFilter}
                                    onChange={e => { setUserFilter(e.target.value); setPage(0); }}
                                    style={{
                                        padding: '10px 14px 10px 32px', borderRadius: 8,
                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                        color: '#e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer',
                                        appearance: 'none' as const, minWidth: 160,
                                    }}
                                >
                                    <option value="">All Users</option>
                                    {uniqueUsers.map(u => (
                                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Audit Entries */}
                    <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                    }}>
                        {loading && entries.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                                Loading audit log...
                            </div>
                        ) : entries.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                                <Shield size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                                <p style={{ margin: 0, fontSize: 14 }}>No audit entries found</p>
                                <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6 }}>
                                    Actions will appear here as users interact with the system
                                </p>
                            </div>
                        ) : (
                            entries.map((entry, i) => {
                                const isExpanded = expanded === entry.id;
                                const actionColor = getActionColor(entry.action);
                                const roleColor = ROLE_COLORS[entry.userRole] || '#94a3b8';

                                return (
                                    <div
                                        key={entry.id}
                                        style={{
                                            padding: '12px 18px',
                                            borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                            cursor: 'pointer',
                                            background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                                            transition: 'background 0.15s',
                                        }}
                                        onClick={() => setExpanded(isExpanded ? null : entry.id)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            {isExpanded ? <ChevronDown size={14} style={{ color: '#64748b', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: '#475569', flexShrink: 0 }} />}

                                            <span style={{
                                                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                                padding: '2px 8px', borderRadius: 4,
                                                background: `${actionColor}18`, color: actionColor,
                                                letterSpacing: '0.03em', flexShrink: 0,
                                            }}>
                                                {formatAction(entry.action)}
                                            </span>

                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>
                                                <User size={12} style={{ color: roleColor }} />
                                                {entry.userName}
                                            </span>

                                            <span style={{
                                                fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                                background: `${roleColor}18`, color: roleColor,
                                                fontWeight: 600, textTransform: 'uppercase',
                                            }}>
                                                {entry.userRole}
                                            </span>

                                            {entry.entityType && (
                                                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                                    on <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{entry.entityType}</span>
                                                    {entry.entityId && <span style={{ opacity: 0.6 }}> #{entry.entityId.slice(0, 8)}</span>}
                                                </span>
                                            )}

                                            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b', flexShrink: 0 }}>
                                                <Clock size={11} />
                                                {formatTimestamp(entry.createdAt)}
                                            </span>
                                        </div>

                                        {isExpanded && (
                                            <div style={{
                                                marginTop: 10, marginLeft: 24, padding: '10px 14px',
                                                background: 'rgba(0,0,0,0.2)', borderRadius: 8,
                                                fontSize: 12, lineHeight: 1.6,
                                            }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px', color: '#94a3b8' }}>
                                                    <span style={{ fontWeight: 600, color: '#64748b' }}>Full Timestamp</span>
                                                    <span>{new Date(entry.createdAt).toLocaleString()}</span>

                                                    <span style={{ fontWeight: 600, color: '#64748b' }}>User ID</span>
                                                    <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.userId}</span>

                                                    {entry.entityType && <>
                                                        <span style={{ fontWeight: 600, color: '#64748b' }}>Entity Type</span>
                                                        <span>{entry.entityType}</span>
                                                    </>}

                                                    {entry.entityId && <>
                                                        <span style={{ fontWeight: 600, color: '#64748b' }}>Entity ID</span>
                                                        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.entityId}</span>
                                                    </>}

                                                    {entry.ipAddress && <>
                                                        <span style={{ fontWeight: 600, color: '#64748b' }}>IP Address</span>
                                                        <span>{entry.ipAddress}</span>
                                                    </>}
                                                </div>

                                                {Object.keys(entry.details).length > 0 && (
                                                    <div style={{ marginTop: 10 }}>
                                                        <span style={{ fontWeight: 600, color: '#64748b', fontSize: 11 }}>Details</span>
                                                        <pre style={{
                                                            margin: '4px 0 0', padding: 10, borderRadius: 6,
                                                            background: 'rgba(0,0,0,0.3)', color: '#D6FE51',
                                                            fontSize: 11, overflow: 'auto', maxHeight: 200,
                                                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                                        }}>
                                                            {JSON.stringify(entry.details, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Pagination */}
                    {total > PAGE_SIZE && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 16, marginTop: '1rem', fontSize: 13, color: '#94a3b8',
                        }}>
                            <button
                                disabled={page === 0}
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '6px 14px', borderRadius: 6,
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                    color: page === 0 ? '#475569' : '#e2e8f0', cursor: page === 0 ? 'default' : 'pointer',
                                }}
                            >
                                <ChevronLeft size={14} /> Prev
                            </button>
                            <span>Page {page + 1} of {totalPages}</span>
                            <button
                                disabled={page >= totalPages - 1}
                                onClick={() => setPage(p => p + 1)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '6px 14px', borderRadius: 6,
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                    color: page >= totalPages - 1 ? '#475569' : '#e2e8f0',
                                    cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                                }}
                            >
                                Next <ChevronRight size={14} />
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* ═══ ARCHIVE SEARCH TAB ═══ */}
            {viewTab === 'archive' && (
                <>
                    <div style={{ position: 'relative', marginBottom: 16 }}>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                            value={archiveSearch}
                            onChange={e => {
                                setArchiveSearch(e.target.value);
                                if (e.target.value.length >= 2) searchArchive(e.target.value);
                                else setArchiveResults([]);
                            }}
                            placeholder="Search across all archived properties, completed workitems, resolved cases..."
                            style={{
                                width: '100%', padding: '12px 12px 12px 36px', borderRadius: 10,
                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                color: '#e2e8f0', fontSize: 13, outline: 'none',
                            }}
                        />
                    </div>
                    {archiveLoading && <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Searching…</div>}
                    {archiveResults.length > 0 && (
                        <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            {archiveResults.map((r: any, i: number) => (
                                <div key={r.id || i} style={{
                                    padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
                                    borderBottom: i < archiveResults.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                    background: 'rgba(255,255,255,0.02)',
                                }}>
                                    <span style={{
                                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                        padding: '2px 6px', borderRadius: 10,
                                        background: 'rgba(214,254,81,0.12)', color: '#D6FE51',
                                        flexShrink: 0, marginTop: 2,
                                    }}>{r.type}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{r.title}</div>
                                        {r.snippet && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{r.snippet}</div>}
                                    </div>
                                    <span style={{ fontSize: 11, color: '#475569' }}>{(r.score * 100).toFixed(0)}%</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {archiveSearch.length >= 2 && !archiveLoading && archiveResults.length === 0 && (
                        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                            <Archive size={40} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 12 }} />
                            <p style={{ fontSize: 13 }}>No archived results for &quot;<strong>{archiveSearch}</strong>&quot;</p>
                        </div>
                    )}
                </>
            )}

            {/* ═══ LOG HISTORICAL EVENT MODAL ═══ */}
            {showHistForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setShowHistForm(false)}
                >
                    <div style={{ background: '#111827', borderRadius: 16, border: '1px solid rgba(214,254,81,0.25)', width: 480, maxWidth: '90vw', overflow: 'hidden' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e2a3d' }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Log Historical Event</h3>
                            <button onClick={() => setShowHistForm(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleLogHistorical} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Date</label>
                                    <input name="date" type="date" required style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 13, outline: 'none' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Entity Type</label>
                                    <select name="entityType" required style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 13, outline: 'none' }}>
                                        <option value="property">Property</option>
                                        <option value="tenant">Tenant</option>
                                        <option value="vendor">Vendor</option>
                                        <option value="owner">Owner</option>
                                        <option value="legal">Legal</option>
                                        <option value="financial">Financial</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Entity Name</label>
                                <input name="entity" required placeholder="e.g. 128 Buena Vista Dr" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 13, outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Event Type</label>
                                <select name="eventType" required style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 13, outline: 'none' }}>
                                    <option value="financial">Financial</option>
                                    <option value="legal">Legal</option>
                                    <option value="maintenance">Maintenance</option>
                                    <option value="lease">Lease</option>
                                    <option value="acquisition">Acquisition/Sale</option>
                                    <option value="insurance">Insurance</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
                                <textarea name="description" required rows={3} placeholder="Describe the historical event..." style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 13, outline: 'none', resize: 'vertical' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                                <button type="button" onClick={() => setShowHistForm(false)} style={{ padding: '8px 16px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                                <button type="submit" style={{ padding: '8px 20px', borderRadius: 6, background: '#D6FE51', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Log Event</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═══ COMPLIANCE AUDIT TAB ═══ */}
            {viewTab === 'compliance' && (
                <div>
                    {/* Scan trigger */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 16, padding: '12px 16px', borderRadius: 10,
                        background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.12)',
                    }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Zap size={14} style={{ color: '#10b981' }} /> Proactive Compliance Auditor
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                Scans compliance docs for expirations, missing documents, COI gaps, and W-9 tax year issues.
                                {complianceRunId && <span style={{ color: '#10b981' }}> · Last run: {complianceRunId.slice(0, 8)}…</span>}
                            </div>
                        </div>
                        <button
                            disabled={complianceLoading}
                            onClick={async () => {
                                setComplianceLoading(true);
                                try {
                                    const result = await strataPost<any>('/compliance/audit', {});
                                    setComplianceFindings(result.findings || []);
                                    setComplianceSummary(result.summary || null);
                                    setComplianceRunId(result.runId || null);
                                } catch (err) { console.error(err); }
                                setComplianceLoading(false);
                            }}
                            style={{
                                padding: '8px 18px', borderRadius: 8,
                                background: complianceLoading ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.15)',
                                border: '1px solid rgba(16,185,129,0.3)',
                                color: '#10b981', cursor: complianceLoading ? 'wait' : 'pointer',
                                fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            {complianceLoading ? <><RefreshCw size={12} className="spin" /> Scanning…</> : <><ShieldCheck size={12} /> Run Compliance Scan</>}
                        </button>
                    </div>

                    {/* Summary cards */}
                    {complianceSummary && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
                            {[{ label: 'Total', value: complianceSummary.total, color: '#e2e8f0', bg: 'rgba(255,255,255,0.04)' },
                            { label: 'Critical', value: complianceSummary.critical, color: '#ef4444', bg: 'rgba(239,68,68,0.06)' },
                            { label: 'High', value: complianceSummary.high, color: '#f59e0b', bg: 'rgba(245,158,11,0.06)' },
                            { label: 'Medium', value: complianceSummary.medium, color: '#3b82f6', bg: 'rgba(59,130,246,0.06)' },
                            { label: 'Low', value: complianceSummary.low, color: '#10b981', bg: 'rgba(16,185,129,0.06)' },
                            ].map(c => (
                                <div key={c.label} style={{
                                    padding: '10px 12px', borderRadius: 8, textAlign: 'center',
                                    background: c.bg, border: `1px solid ${c.color}15`,
                                }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{c.label}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Category breakdown */}
                    {complianceSummary?.byCategory && Object.keys(complianceSummary.byCategory).length > 0 && (
                        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>By Category</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {Object.entries(complianceSummary.byCategory as Record<string, number>).map(([cat, count]) => (
                                    <span key={cat} style={{
                                        padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                                        background: 'rgba(214,254,81,0.08)', border: '1px solid rgba(214,254,81,0.15)', color: '#D6FE51',
                                    }}>
                                        {cat.replace(/_/g, ' ')}: {count}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Findings list */}
                    {complianceFindings.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {complianceFindings.map((f: any, i: number) => {
                                const sevColors: Record<string, string> = {
                                    critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#10b981',
                                };
                                const col = sevColors[f.severity] || '#64748b';
                                return (
                                    <div key={i} style={{
                                        padding: '10px 14px', borderRadius: 8,
                                        background: `${col}08`, border: `1px solid ${col}15`,
                                        display: 'flex', gap: 10, alignItems: 'flex-start',
                                    }}>
                                        <AlertTriangle size={14} style={{ color: col, flexShrink: 0, marginTop: 2 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{f.title}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{f.description}</div>
                                            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                                <span style={{
                                                    padding: '1px 8px', borderRadius: 20, fontSize: 9, fontWeight: 700,
                                                    background: `${col}15`, color: col, textTransform: 'uppercase',
                                                }}>{f.severity}</span>
                                                <span style={{ fontSize: 9, color: '#475569' }}>{f.type?.replace(/_/g, ' ')}</span>
                                                {f.details?.entityName && (
                                                    <span style={{ fontSize: 9, color: '#64748b' }}>Entity: {f.details.entityName}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : !complianceLoading && (
                        <div style={{
                            padding: '40px 20px', textAlign: 'center', borderRadius: 10,
                            background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)',
                        }}>
                            <ShieldCheck size={36} strokeWidth={1} style={{ color: '#475569', marginBottom: 8 }} />
                            <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Run a compliance scan to check for expirations, missing documents, and coverage gaps.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ UNIFIED TIMELINE TAB (Task 2.7 — B3 closure) ═══
                Joins 5 source tables (compliance + insurance + workitem
                actionsLog + audit_log + communication) into a chronological
                AuditEvent list with explicit per-event `source` provenance.
                ErrorBoundary wraps the surface per GR-13. */}
            {viewTab === 'unified' && (
                <ErrorBoundary fallback={<div className="s-glass-card" style={{ padding: 14, color: '#f87171', fontSize: 12 }}>Unified timeline unavailable.</div>}>
                    <div data-testid="audit-unified-timeline" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Source breakdown header */}
                        {unifiedBreakdown && (
                            <div data-testid="audit-unified-source-breakdown" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 8 }}>Sources</span>
                                {(['compliance', 'insurance', 'workitem', 'audit_log', 'communication'] as const).map(src => (
                                    <span key={src} style={{
                                        fontSize: 11, fontWeight: 600,
                                        padding: '2px 8px', borderRadius: 5,
                                        background: 'rgba(214,254,81,0.1)', color: '#D6FE51',
                                    }}>
                                        {src.replace('_', ' ')}: {unifiedBreakdown[src] ?? 0}
                                    </span>
                                ))}
                            </div>
                        )}

                        {unifiedLoading && (
                            <div style={{ padding: '24px 14px', color: '#64748b', fontSize: 12, textAlign: 'center' }}>
                                <RefreshCw size={14} className="spin" /> Loading unified timeline…
                            </div>
                        )}

                        {!unifiedLoading && unifiedEvents.length === 0 && (
                            <div
                                data-testid="audit-unified-empty"
                                style={{ padding: '40px 20px', textAlign: 'center', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)' }}
                            >
                                <Activity size={36} strokeWidth={1} style={{ color: '#475569', marginBottom: 8 }} />
                                <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>No unified-timeline events yet. Events appear as compliance, insurance, work-orders, and system actions accumulate across the portfolio.</p>
                            </div>
                        )}

                        {!unifiedLoading && unifiedEvents.map(ev => {
                            const sourceColor = SOURCE_COLORS[ev.source] ?? '#64748b';
                            const sev = ev.severity;
                            return (
                                <div
                                    key={ev.id}
                                    data-testid="audit-unified-event-row"
                                    data-source={ev.source}
                                    onClick={() => {
                                        try { Sentry.addBreadcrumb({ category: 'ui.click', message: 'audit.unified.event.click', level: 'info', data: { source: ev.source, sourceId: ev.sourceId } }); } catch { /* no-op */ }
                                    }}
                                    style={{
                                        display: 'flex', gap: 12, alignItems: 'flex-start',
                                        padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                                        background: 'rgba(255,255,255,0.02)',
                                        borderLeft: `3px solid ${sourceColor}`,
                                        border: '1px solid rgba(255,255,255,0.04)',
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                                            <span
                                                data-testid="audit-unified-source-badge"
                                                style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 6px', borderRadius: 4, background: `${sourceColor}22`, color: sourceColor }}
                                            >
                                                {ev.source.replace('_', ' ')}
                                            </span>
                                            <span
                                                data-testid="audit-unified-severity-badge"
                                                style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 6px', borderRadius: 4, background: SEVERITY_BG[sev], color: SEVERITY_FG[sev] }}
                                            >
                                                {sev}
                                            </span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{ev.title}</span>
                                        </div>
                                        {ev.description && (
                                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{ev.description}</div>
                                        )}
                                        <div style={{ fontSize: 10, color: '#64748b', display: 'flex', gap: 10 }}>
                                            {ev.actor && <span>{ev.actor}</span>}
                                            <span>{formatTimestamp(ev.timestamp)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </ErrorBoundary>
            )}
        </div>
    );
}

// Task 2.7 — source/severity color maps. Kept module-scoped (not inline)
// so tests can import them if needed and so the render block stays clean.
const SOURCE_COLORS: Record<string, string> = {
    compliance: '#D6FE51',
    insurance: '#3b82f6',
    workitem: '#f59e0b',
    audit_log: '#94a3b8',
    communication: '#22c55e',
};
const SEVERITY_BG: Record<string, string> = {
    info: 'rgba(148,163,184,0.15)',
    warning: 'rgba(245,158,11,0.15)',
    critical: 'rgba(239,68,68,0.15)',
};
const SEVERITY_FG: Record<string, string> = {
    info: '#94a3b8',
    warning: '#f59e0b',
    critical: '#ef4444',
};
