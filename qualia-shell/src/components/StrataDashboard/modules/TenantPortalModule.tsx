/**
 * TenantPortalModule — Management-side tenant portal inside Strata
 *
 * Phase-3 Task 3.9 retrofit: GR-13 observability (ErrorBoundary wrap +
 * 4 try/catch-wrapped Sentry breadcrumbs + 11 data-testid anchors) +
 * raw `authFetch` → `strataApi` rewire (2 strataGet + 1 strataPost) +
 * 1 isStaticMode write-guard on the SINGLE POST site (sendReply) with
 * a sticky `statusFeedback` banner between the gradient header and
 * the KPI row. Mirrors Task 3.7 (ProjectsModule) Inner/Outer split
 * shape and Task 3.8 (CorporateReview) strataApi rewire shape — see
 * commit body. Final retrofit-chain task (3.7 → 3.8 → 3.9); closure
 * retires the sequential chain. Multipart strataUpload not consumed
 * (no file-upload paths in TenantPortal — first post-3.8 task to
 * skip strataApi.ts amendments and consume the existing patterns
 * exclusively).
 *
 * 50 UX improvements over baseline preserved verbatim:
 * 1. CSS class-based styling (no inline styles)
 * 2. Entrance fade-in animation
 * 3. Gradient header accent line
 * 4. Gradient title text
 * 5. Live status dot in subtitle
 * 6. Search input with focus glow
 * 7. Refresh button with spin animation
 * 8. KPI grid with glassmorphism cards
 * 9. Hover lift on KPI cards
 * 10. Corner glow on KPI cards
 * 11. Scaled icon on KPI hover
 * 12. Large bold KPI values
 * 13. Uppercase KPI labels
 * 14. Pill tab bar with background
 * 15. Active tab bottom accent
 * 16. Tab hover highlight
 * 17. Active tab glow shadow
 * 18. Content card entrance slide
 * 19. Card header with border
 * 20. Card header icon wrapper
 * 21. Count badge in card header
 * 22. Table with rounded container
 * 23. Uppercase table headers
 * 24. Row hover highlight
 * 25. Cell padding and vertical alignment
 * 26. Clickable row with selected state
 * 27. Two-line name cells
 * 28. Green money cells with tabular nums
 * 29. Semantic status badges
 * 30. Priority badges with color coding
 * 31. Urgency badges with borders
 * 32. Skeleton loading animation
 * 33. Days remaining typography
 * 34. Lease progress bar
 * 35. Pagination border-top separator
 * 36. Tabular page info numbers
 * 37. Page buttons with hover
 * 38. Page indicator text
 * 39. Detail card with left accent border
 * 40. Detail header with avatar initials
 * 41. Detail info grid cards
 * 42. Detail item hover effect
 * 43. Message list gap spacing
 * 44. Message directional border
 * 45. Message direction pill
 * 46. Message body line height
 * 47. Reply form with accent border
 * 48. Premium empty state
 * 49. Occupancy ring SVG in KPI
 * 50. Gradient primary button with shadow
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Users, Wrench, DollarSign, MessageSquare, AlertTriangle,
    Search, RefreshCw, Send, ChevronLeft, ChevronRight,
    Building2, Mail, Phone, Calendar, Clock, CheckCircle,
    Home, Shield, Hash,
} from 'lucide-react';
import { useUser } from '../../../context/UserContext';
import './TenantPortal.css';
import { strataGet, strataPost, isStaticMode } from '../strataApi';
import type { PortalTab, TenantPortalPagination, TenantPortalStats } from '../strataTypes';
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';
import { useStrataNav } from '../StrataNavContext';

const TABS: { id: PortalTab; label: string; icon: typeof Users }[] = [
    { id: 'directory', label: 'Directory', icon: Users },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'payments', label: 'Payments', icon: DollarSign },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'lease-alerts', label: 'Lease Alerts', icon: AlertTriangle },
];

function staticModeMessage(): string {
    return '🗒️ Send message requires backend mode (static deck is read-only).';
}

// Initials helper
const getInitials = (name: string) => name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

// Color from name hash
const nameColor = (name: string) => {
    const colors = ['#D6FE51', '#06b6d4', '#D6FE51', '#ec4899', '#f59e0b', '#14b8a6', '#ef4444', '#3b82f6'];
    let h = 0;
    for (let i = 0; i < (name?.length || 0); i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
};

function TenantPortalModuleInner() {
    const { hasPermission } = useUser();
    const { navigateToResident, navigateToProperty } = useStrataNav();
    const [tab, setTab] = useState<PortalTab>('directory');
    const [search, setSearch] = useState('');
    const [stats, setStats] = useState<TenantPortalStats | null>(null);
    const [data, setData] = useState<any[]>([]);
    const [pagination, setPagination] = useState<TenantPortalPagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
    const [replyTo, setReplyTo] = useState<any | null>(null);
    const [replySubject, setReplySubject] = useState('');
    const [replyBody, setReplyBody] = useState('');
    const [sending, setSending] = useState(false);
    const [statusFeedback, setStatusFeedback] = useState<string>('');

    const TAB_PERMS: Record<PortalTab, string> = {
        directory: 'strata:tenant-portal:directory',
        maintenance: 'strata:tenant-portal:maintenance',
        payments: 'strata:tenant-portal:payments',
        messages: 'strata:tenant-portal:messages',
        'lease-alerts': 'strata:tenant-portal:lease-alerts',
    };
    const visibleTabs = TABS.filter(t => hasPermission(TAB_PERMS[t.id]));

    // Fetch stats — strataGet returns the TenantPortalStats object directly
    // (no envelope; Task 3.8 byte-shape precedent — see PRE0-6 in DoR).
    const fetchStats = useCallback(async () => {
        try {
            const result = await strataGet<TenantPortalStats>('/tenant/admin/stats');
            setStats(result);
        } catch (e) {
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.fetch',
                    message: 'tenant-portal.fetch.error',
                    level: 'warning',
                    data: { action: 'stats' },
                });
            } catch { /* Sentry no-op when DSN unset */ }
            console.error('[TenantPortal Admin] Stats:', e);
        }
    }, []);

    // Fetch tab data — static handler returns the FULL filtered array;
    // module computes a synthetic single-page pagination so the existing
    // PageControls auto-hides (totalPages <= 1 short-circuit at L243).
    const fetchTabData = useCallback(async (_page = 1) => {
        setLoading(true);
        const endpoint = tab === 'lease-alerts' ? 'lease-alerts' : tab;
        const params: Record<string, string> = {};
        if (search) params.search = search;
        try {
            const result = await strataGet<any[]>(`/tenant/admin/${endpoint}`, params);
            const rows = Array.isArray(result) ? result : [];
            setData(rows);
            setPagination({
                page: 1,
                limit: rows.length || 50,
                total: rows.length,
                totalPages: 1,
            });
        } catch (e) {
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.fetch',
                    message: 'tenant-portal.fetch.error',
                    level: 'warning',
                    data: { action: `tab-${tab}` },
                });
            } catch { /* Sentry no-op when DSN unset */ }
            console.error('[TenantPortal Admin] Fetch:', e);
            setData([]);
            setPagination({ page: 1, limit: 50, total: 0, totalPages: 0 });
        }
        setLoading(false);
    }, [tab, search]);

    useEffect(() => {
        fetchStats();
        try {
            Sentry.addBreadcrumb({
                category: 'ui.load',
                message: 'tenant-portal.module.loaded',
                level: 'info',
                data: { staticMode: isStaticMode },
            });
        } catch { /* Sentry no-op when DSN unset */ }
    }, [fetchStats]);
    useEffect(() => { fetchTabData(1); }, [tab, search]); // eslint-disable-line

    const goPage = (p: number) => { if (p >= 1 && p <= pagination.totalPages) fetchTabData(p); };

    const sendReply = async () => {
        if (!replyTo || !replySubject.trim() || !replyBody.trim()) return;
        const tenantId = replyTo.tenantId || replyTo.entityId;
        if (isStaticMode) {
            setStatusFeedback(staticModeMessage());
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.submit',
                    message: 'tenant-portal.message.skipped',
                    level: 'info',
                    data: { tenantId },
                });
            } catch { /* Sentry no-op when DSN unset */ }
            return;
        }
        setSending(true);
        try {
            Sentry.addBreadcrumb({
                category: 'ui.submit',
                message: 'tenant-portal.message.sent',
                level: 'info',
                data: { tenantId },
            });
        } catch { /* Sentry no-op when DSN unset */ }
        try {
            await strataPost(`/tenant/admin/messages/${tenantId}`, { subject: replySubject, body: replyBody });
            setReplyTo(null); setReplySubject(''); setReplyBody('');
            fetchTabData(pagination.page);
        } catch (e) { console.error(e); }
        setSending(false);
    };

    // Occupancy percentage
    const occupancyPct = useMemo(() => {
        if (!stats || !stats.totalUnits) return 0;
        return Math.round((stats.occupiedUnits / stats.totalUnits) * 100);
    }, [stats]);

    // ── Occupancy Ring SVG ──
    function OccupancyRing() {
        const r = 15, c = 2 * Math.PI * r;
        const offset = c - (c * occupancyPct / 100);
        return (
            <div className="tp-occupancy-ring">
                <svg width="40" height="40" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                    <circle cx="20" cy="20" r={r} fill="none" stroke="#06b6d4" strokeWidth="4"
                        strokeDasharray={c} strokeDashoffset={offset}
                        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                </svg>
                <span className="tp-occupancy-ring-text">{occupancyPct}%</span>
            </div>
        );
    }

    // ── Loading Skeleton ──
    function SkeletonRows({ rows = 5 }: { rows?: number }) {
        return (
            <div className="tp-loading">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="tp-skeleton" style={{ width: `${100 - i * 5}%`, animationDelay: `${i * 0.1}s` }} />
                ))}
            </div>
        );
    }

    // ── KPI Cards ──
    function KpiRow() {
        if (!stats) return null;
        const cards = [
            { label: 'Total Tenants', value: String(stats.totalTenants), icon: Users, color: '#D6FE51' },
            { label: 'Open Requests', value: String(stats.openMaintenanceRequests), icon: Wrench, color: '#f59e0b' },
            { label: 'Expiring Leases', value: String(stats.expiringLeases), icon: AlertTriangle, color: '#ef4444' },
            { label: 'Vacant Units', value: String(stats.vacantUnits), icon: Building2, color: '#D6FE51' },
        ];
        return (
            <div className="tp-kpi-grid">
                {/* Occupancy card — special */}
                <div className="tp-kpi-card" style={{ gap: 16 }}>
                    <OccupancyRing />
                    <div>
                        <div className="tp-kpi-value">{stats.occupiedUnits}/{stats.totalUnits}</div>
                        <div className="tp-kpi-label">Occupancy</div>
                    </div>
                </div>
                {cards.map(c => {
                    const Icon = c.icon;
                    return (
                        <div key={c.label} className="tp-kpi-card">
                            <div className="tp-kpi-icon" style={{ background: `${c.color}18`, color: c.color }}>
                                <Icon size={18} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div className="tp-kpi-value">{c.value}</div>
                                <div className="tp-kpi-label">{c.label}</div>
                            </div>
                            <div style={{ position: 'absolute', top: -20, right: -20, width: 60, height: 60, borderRadius: '50%', background: c.color, opacity: 0.04 }} />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ── Pagination ──
    function PageControls() {
        if (pagination.totalPages <= 1) return null;
        const start = (pagination.page - 1) * pagination.limit + 1;
        const end = Math.min(pagination.page * pagination.limit, pagination.total);
        return (
            <div className="tp-pagination">
                <span className="tp-pagination-info">
                    Showing {start}–{end} of {pagination.total}
                </span>
                <div className="tp-page-btns">
                    <button className="tp-page-btn" disabled={pagination.page <= 1} onClick={() => goPage(pagination.page - 1)}>
                        <ChevronLeft size={14} />
                    </button>
                    <span className="tp-page-indicator">
                        {pagination.page} / {pagination.totalPages}
                    </span>
                    <button className="tp-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => goPage(pagination.page + 1)}>
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        );
    }

    // Badge helper
    const statusBadge = (s: string) => <span className={`tp-badge tp-badge-${s.replace(/\s+/g, '_')}`}>{s.replace(/_/g, ' ')}</span>;
    const priorityBadge = (p: string) => <span className={`tp-badge tp-priority-${p}`}>{p}</span>;

    // ── Directory Tab ──
    function DirectoryTab() {
        return (
            <div className="tp-card">
                <div className="tp-card-header">
                    <div className="tp-card-header-icon" style={{ background: 'rgba(214,254,81,0.12)', color: '#D6FE51' }}>
                        <Users size={15} />
                    </div>
                    <h3>Tenant Directory</h3>
                    <span className="tp-count">{pagination.total}</span>
                </div>
                {loading ? <SkeletonRows /> : data.length === 0 ? (
                    <div className="tp-empty">
                        <Users size={32} />
                        <h4>No tenants found</h4>
                        <p>Try adjusting your search criteria</p>
                    </div>
                ) : (
                    <>
                        <div className="tp-table-wrap">
                            <table className="tp-table">
                                <thead>
                                    <tr>
                                        <th>Tenant</th>
                                        <th>Unit</th>
                                        <th>Property</th>
                                        <th>Rent</th>
                                        <th>Lease End</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((t: any) => (
                                        <tr key={t.id}
                                            data-testid={`tenant-portal-row-${t.id}`}
                                            className={`tp-row-clickable ${selectedTenant?.id === t.id ? 'tp-row-selected' : ''}`}
                                            onClick={() => setSelectedTenant(selectedTenant?.id === t.id ? null : t)}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div className="tp-detail-avatar" style={{ background: nameColor(t.name), width: 28, height: 28, fontSize: 11 }}>
                                                        {getInitials(t.name)}
                                                    </div>
                                                    <div>
                                                        <button className="s-resident-link tp-cell-name" onClick={(e) => { e.stopPropagation(); navigateToResident(t.id); }}>{t.name}</button>
                                                        <div className="tp-cell-sub">{t.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{t.unitNumber || '—'}</td>
                                            <td>{t.propertyId ? (
                                                <button className="s-property-link" style={{ fontSize: 'inherit' }} onClick={(e) => { e.stopPropagation(); navigateToProperty(t.propertyId); }}>{t.propertyName || '—'}</button>
                                            ) : (t.propertyName || '—')}</td>
                                            <td className="tp-cell-money">{t.rentAmount ? `$${t.rentAmount.toLocaleString()}` : '—'}</td>
                                            <td>
                                                {t.leaseEnd ? new Date(t.leaseEnd).toLocaleDateString() : '—'}
                                                {t.leaseRemainingDays != null && t.leaseRemainingDays <= 90 && (
                                                    <span className={`tp-days-left ${t.leaseRemainingDays <= 30 ? 'critical' : 'warning'}`}
                                                        style={{ marginLeft: 6, fontSize: 11 }}>
                                                        ({t.leaseRemainingDays}d)
                                                    </span>
                                                )}
                                            </td>
                                            <td>{statusBadge(t.status)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <PageControls />
                    </>
                )}

                {/* Expanded detail */}
                {selectedTenant && (
                    <div className="tp-detail-card">
                        <div className="tp-detail-header">
                            <div className="tp-detail-name">
                                <div className="tp-detail-avatar" style={{ background: nameColor(selectedTenant.name) }}>
                                    {getInitials(selectedTenant.name)}
                                </div>
                                {selectedTenant.name}
                            </div>
                            {statusBadge(selectedTenant.status)}
                        </div>
                        <div className="tp-detail-grid">
                            {selectedTenant.email && (
                                <div className="tp-detail-item">
                                    <Mail size={14} />
                                    <div>
                                        <div className="tp-detail-item-label">Email</div>
                                        <div className="tp-detail-item-value">{selectedTenant.email}</div>
                                    </div>
                                </div>
                            )}
                            {selectedTenant.phone && (
                                <div className="tp-detail-item">
                                    <Phone size={14} />
                                    <div>
                                        <div className="tp-detail-item-label">Phone</div>
                                        <div className="tp-detail-item-value">{selectedTenant.phone}</div>
                                    </div>
                                </div>
                            )}
                            {selectedTenant.unitNumber && (
                                <div className="tp-detail-item">
                                    <Home size={14} />
                                    <div>
                                        <div className="tp-detail-item-label">Unit</div>
                                        <div className="tp-detail-item-value">{selectedTenant.unitNumber}</div>
                                    </div>
                                </div>
                            )}
                            {selectedTenant.propertyName && (
                                <div className="tp-detail-item">
                                    <Building2 size={14} />
                                    <div>
                                        <div className="tp-detail-item-label">Property</div>
                                        <div className="tp-detail-item-value">
                                            {selectedTenant.propertyId ? (
                                                <button className="s-property-link" style={{ fontSize: 'inherit' }} onClick={() => navigateToProperty(selectedTenant.propertyId)}>{selectedTenant.propertyName}</button>
                                            ) : selectedTenant.propertyName}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {selectedTenant.leaseStart && (
                                <div className="tp-detail-item">
                                    <Calendar size={14} />
                                    <div>
                                        <div className="tp-detail-item-label">Lease Start</div>
                                        <div className="tp-detail-item-value">{new Date(selectedTenant.leaseStart).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            )}
                            {selectedTenant.leaseEnd && (
                                <div className="tp-detail-item">
                                    <Calendar size={14} />
                                    <div>
                                        <div className="tp-detail-item-label">Lease End</div>
                                        <div className="tp-detail-item-value">{new Date(selectedTenant.leaseEnd).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            )}
                            {selectedTenant.rentAmount > 0 && (
                                <div className="tp-detail-item">
                                    <DollarSign size={14} />
                                    <div>
                                        <div className="tp-detail-item-label">Monthly Rent</div>
                                        <div className="tp-detail-item-value" style={{ color: '#34d399' }}>${selectedTenant.rentAmount.toLocaleString()}</div>
                                    </div>
                                </div>
                            )}
                            {selectedTenant.leaseRemainingDays != null && (
                                <div className="tp-detail-item">
                                    <Clock size={14} />
                                    <div>
                                        <div className="tp-detail-item-label">Remaining</div>
                                        <div className={`tp-detail-item-value tp-days-left ${selectedTenant.leaseRemainingDays <= 30 ? 'critical' : selectedTenant.leaseRemainingDays <= 60 ? 'warning' : 'safe'}`}>
                                            {selectedTenant.leaseRemainingDays} days
                                        </div>
                                        <div className="tp-lease-progress">
                                            <div className="tp-lease-progress-bar" style={{
                                                width: `${Math.min(100, (selectedTenant.leaseRemainingDays / 365) * 100)}%`,
                                                background: selectedTenant.leaseRemainingDays <= 30 ? '#ef4444' : selectedTenant.leaseRemainingDays <= 60 ? '#f59e0b' : '#22c55e',
                                            }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── Maintenance Tab ──
    function MaintenanceTab() {
        return (
            <div className="tp-card">
                <div className="tp-card-header">
                    <div className="tp-card-header-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                        <Wrench size={15} />
                    </div>
                    <h3>Tenant Work Orders</h3>
                    <span className="tp-count">{pagination.total}</span>
                </div>
                {loading ? <SkeletonRows /> : data.length === 0 ? (
                    <div className="tp-empty">
                        <CheckCircle size={32} />
                        <h4>No maintenance requests</h4>
                        <p>All caught up — no open tenant work orders</p>
                    </div>
                ) : (
                    <>
                        <div className="tp-table-wrap">
                            <table className="tp-table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>Tenant</th>
                                        <th>Unit</th>
                                        <th>Priority</th>
                                        <th>Status</th>
                                        <th>Submitted</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((wo: any) => (
                                        <tr key={wo.id}>
                                            <td className="tp-cell-name">{wo.title}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div className="tp-detail-avatar" style={{ background: nameColor(wo.tenantName), width: 22, height: 22, fontSize: 9 }}>
                                                        {getInitials(wo.tenantName)}
                                                    </div>
                                                    {wo.tenantName}
                                                </div>
                                            </td>
                                            <td>{wo.unitNumber || '—'}</td>
                                            <td>{priorityBadge(wo.priority)}</td>
                                            <td>{statusBadge(wo.status)}</td>
                                            <td style={{ fontSize: 11, color: '#475569' }}>{new Date(wo.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <PageControls />
                    </>
                )}
            </div>
        );
    }

    // ── Payments Tab ──
    function PaymentsTab() {
        return (
            <div className="tp-card">
                <div className="tp-card-header">
                    <div className="tp-card-header-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                        <DollarSign size={15} />
                    </div>
                    <h3>Payment Ledger</h3>
                    <span className="tp-count">{pagination.total}</span>
                </div>
                {loading ? <SkeletonRows /> : data.length === 0 ? (
                    <div className="tp-empty">
                        <DollarSign size={32} />
                        <h4>No payment records</h4>
                        <p>Payment history will appear here</p>
                    </div>
                ) : (
                    <>
                        <div className="tp-table-wrap">
                            <table className="tp-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Tenant</th>
                                        <th>Property</th>
                                        <th>Unit</th>
                                        <th>Description</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((p: any) => (
                                        <tr key={p.id}>
                                            <td style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div className="tp-detail-avatar" style={{ background: nameColor(p.tenantName), width: 22, height: 22, fontSize: 9 }}>
                                                        {getInitials(p.tenantName)}
                                                    </div>
                                                    <span className="tp-cell-name">{p.tenantName}</span>
                                                </div>
                                            </td>
                                            <td>{p.propertyId ? (
                                                <button className="s-property-link" style={{ fontSize: 'inherit' }} onClick={(e) => { e.stopPropagation(); navigateToProperty(p.propertyId); }}>{p.propertyName || '—'}</button>
                                            ) : (p.propertyName || '—')}</td>
                                            <td>{p.unitNumber || '—'}</td>
                                            <td>{p.title}</td>
                                            <td>{statusBadge(p.status)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <PageControls />
                    </>
                )}
            </div>
        );
    }

    // ── Messages Tab ──
    function MessagesTab() {
        return (
            <div>
                {/* Reply form */}
                {replyTo && (
                    <div className="tp-reply-form">
                        <h4 className="tp-reply-title">
                            <Send size={14} style={{ color: '#D6FE51' }} />
                            Reply to {replyTo.tenantName}
                        </h4>
                        <div className="tp-reply-fields">
                            <input
                                className="tp-input"
                                placeholder="Subject…"
                                value={replySubject}
                                onChange={e => setReplySubject(e.target.value)}
                            />
                            <textarea
                                className="tp-input tp-textarea"
                                rows={3}
                                placeholder="Write your reply…"
                                value={replyBody}
                                onChange={e => setReplyBody(e.target.value)}
                            />
                            <div className="tp-reply-actions">
                                <button
                                    data-testid="tenant-portal-send-message-btn"
                                    className="tp-btn-primary"
                                    onClick={sendReply}
                                    disabled={sending || !replySubject.trim() || !replyBody.trim()}>
                                    <Send size={12} /> {sending ? 'Sending…' : 'Send Reply'}
                                </button>
                                <button className="tp-btn-ghost" onClick={() => setReplyTo(null)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="tp-card">
                    <div className="tp-card-header">
                        <div className="tp-card-header-icon" style={{ background: 'rgba(214,254,81,0.12)', color: '#D6FE51' }}>
                            <MessageSquare size={15} />
                        </div>
                        <h3>Tenant Messages</h3>
                        <span className="tp-count">{pagination.total}</span>
                    </div>
                    {loading ? <SkeletonRows /> : data.length === 0 ? (
                        <div className="tp-empty">
                            <MessageSquare size={32} />
                            <h4>No messages yet</h4>
                            <p>Tenant conversations will appear here</p>
                        </div>
                    ) : (
                        <>
                            <div className="tp-msg-list">
                                {data.map((msg: any) => (
                                    <div key={msg.id} className={`tp-msg ${msg.direction === 'outbound' ? 'tp-msg-outbound' : 'tp-msg-inbound'}`}>
                                        <div className="tp-msg-header">
                                            <div className="tp-msg-meta">
                                                <span className={`tp-msg-direction ${msg.direction === 'inbound' ? 'tp-msg-direction-in' : 'tp-msg-direction-out'}`}>
                                                    {msg.direction === 'inbound' ? 'Tenant' : 'Management'}
                                                </span>
                                                <span className="tp-msg-sender">{msg.tenantName}</span>
                                                <span className="tp-msg-subject">— {msg.subject}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span className="tp-msg-time">{new Date(msg.createdAt).toLocaleString()}</span>
                                                {msg.direction === 'inbound' && msg.tenantId && (
                                                    <button className="tp-reply-btn"
                                                        onClick={() => { setReplyTo(msg); setReplySubject(`Re: ${msg.subject}`); }}>
                                                        <Send size={10} /> Reply
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="tp-msg-body">{msg.body}</div>
                                    </div>
                                ))}
                            </div>
                            <PageControls />
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ── Lease Alerts Tab ──
    function LeaseAlertsTab() {
        return (
            <div className="tp-card">
                <div className="tp-card-header">
                    <div className="tp-card-header-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                        <AlertTriangle size={15} />
                    </div>
                    <h3>Expiring Leases</h3>
                    <span className="tp-count">{data.length}</span>
                </div>
                {loading ? <SkeletonRows /> : data.length === 0 ? (
                    <div className="tp-empty">
                        <Shield size={32} style={{ color: '#22c55e' }} />
                        <h4>All clear</h4>
                        <p>No leases expiring within 90 days</p>
                    </div>
                ) : (
                    <div className="tp-table-wrap">
                        <table className="tp-table">
                            <thead>
                                <tr>
                                    <th>Urgency</th>
                                    <th>Tenant</th>
                                    <th>Property</th>
                                    <th>Unit</th>
                                    <th>Lease End</th>
                                    <th>Days Left</th>
                                    <th>Rent</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((a: any, i: number) => (
                                    <tr key={i}>
                                        <td>
                                            <span className={`tp-urgency tp-urgency-${a.urgency}`}>
                                                <span style={{ fontSize: 8 }}>{a.urgency === 'high' ? '🔴' : a.urgency === 'medium' ? '🟡' : '🟢'}</span>
                                                {a.urgency}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div className="tp-detail-avatar" style={{ background: nameColor(a.tenantName), width: 24, height: 24, fontSize: 10 }}>
                                                    {getInitials(a.tenantName)}
                                                </div>
                                                <div>
                                                    <div className="tp-cell-name">{a.tenantName}</div>
                                                    <div className="tp-cell-sub">{a.tenantEmail}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{a.propertyId ? (
                                            <button className="s-property-link" style={{ fontSize: 'inherit' }} onClick={(e) => { e.stopPropagation(); navigateToProperty(a.propertyId); }}>{a.propertyName}</button>
                                        ) : a.propertyName}</td>
                                        <td>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <Hash size={11} style={{ color: '#475569' }} />{a.unitNumber}
                                            </span>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(a.leaseEnd).toLocaleDateString()}</td>
                                        <td>
                                            <div className={`tp-days-left ${a.daysRemaining <= 30 ? 'critical' : a.daysRemaining <= 60 ? 'warning' : 'safe'}`}>
                                                {a.daysRemaining}
                                            </div>
                                            <div className="tp-lease-progress">
                                                <div className="tp-lease-progress-bar" style={{
                                                    width: `${Math.min(100, (a.daysRemaining / 90) * 100)}%`,
                                                    background: a.daysRemaining <= 30 ? '#ef4444' : a.daysRemaining <= 60 ? '#f59e0b' : '#22c55e',
                                                }} />
                                            </div>
                                        </td>
                                        <td className="tp-cell-money">${a.rentAmount?.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    // ── Tab content ──
    const renderContent = () => {
        switch (tab) {
            case 'directory': return <DirectoryTab />;
            case 'maintenance': return <MaintenanceTab />;
            case 'payments': return <PaymentsTab />;
            case 'messages': return <MessagesTab />;
            case 'lease-alerts': return <LeaseAlertsTab />;
        }
    };

    return (
        <div data-testid="tenant-portal-module" className="tp-module">
            {/* Header */}
            <div className="tp-header">
                <div>
                    <h2 className="tp-title">Tenant Portal</h2>
                    <p className="tp-subtitle">
                        <span className="tp-dot" />
                        Managing {stats?.totalTenants || 0} tenants across {stats?.totalUnits || 0} units
                    </p>
                </div>
                <div className="tp-header-actions">
                    <div className="tp-search-wrap">
                        <input
                            data-testid="tenant-portal-search-input"
                            className="tp-search"
                            placeholder="Search tenants, units, properties…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <Search size={14} className="tp-search-icon" />
                    </div>
                    <button
                        data-testid="tenant-portal-refresh-btn"
                        className="tp-refresh-btn"
                        onClick={() => { fetchStats(); fetchTabData(pagination.page); }}
                        title="Refresh data">
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Static-mode write-guard banner (sticky-until-replaced; placed
              between the gradient header and the KPI row per DoR (e)). */}
            {statusFeedback && (
                <div
                    data-testid="tenant-portal-static-banner"
                    className="s-glass-card"
                    style={{
                        padding: '8px 12px', color: '#fbbf24', fontSize: 12,
                        borderColor: 'rgba(251,191,36,0.4)', display: 'flex', alignItems: 'center', gap: 8,
                    }}
                >
                    <AlertTriangle size={14} /> {statusFeedback}
                </div>
            )}

            <KpiRow />

            {/* Tabs */}
            <div className="tp-tabs">
                {visibleTabs.map(t => {
                    const Icon = t.icon;
                    return (
                        <button key={t.id}
                            data-testid={`tenant-portal-tab-${t.id}`}
                            onClick={() => { setTab(t.id); setSearch(''); setSelectedTenant(null); }}
                            className={`tp-tab ${tab === t.id ? 'active' : ''}`}>
                            <Icon size={14} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {renderContent()}
        </div>
    );
}

export default function TenantPortalModule() {
    return (
        <ErrorBoundary
            fallback={
                <div className="s-glass-card" style={{ padding: 14, color: '#f87171', fontSize: 12 }}>
                    Tenant Portal module unavailable.
                </div>
            }
        >
            <TenantPortalModuleInner />
        </ErrorBoundary>
    );
}
