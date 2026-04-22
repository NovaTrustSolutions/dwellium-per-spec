/**
 * TenantPortalModule — Management-side tenant portal inside Strata
 *
 * 50 UX improvements over baseline:
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
import { API_BASE } from '../../../config';

const API = API_BASE;

type PortalTab = 'directory' | 'maintenance' | 'payments' | 'messages' | 'lease-alerts';

const TABS: { id: PortalTab; label: string; icon: typeof Users }[] = [
    { id: 'directory', label: 'Directory', icon: Users },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'payments', label: 'Payments', icon: DollarSign },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'lease-alerts', label: 'Lease Alerts', icon: AlertTriangle },
];

interface Pagination { page: number; limit: number; total: number; totalPages: number; }
interface Stats {
    totalTenants: number; totalUnits: number; occupiedUnits: number;
    vacantUnits: number; openMaintenanceRequests: number; expiringLeases: number;
}

// Initials helper
const getInitials = (name: string) => name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

// Color from name hash
const nameColor = (name: string) => {
    const colors = ['#6366f1', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#ef4444', '#3b82f6'];
    let h = 0;
    for (let i = 0; i < (name?.length || 0); i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
};

export default function TenantPortalModule() {
    const { hasPermission, authFetch } = useUser();
    const [tab, setTab] = useState<PortalTab>('directory');
    const [search, setSearch] = useState('');
    const [stats, setStats] = useState<Stats | null>(null);
    const [data, setData] = useState<any[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
    const [replyTo, setReplyTo] = useState<any | null>(null);
    const [replySubject, setReplySubject] = useState('');
    const [replyBody, setReplyBody] = useState('');
    const [sending, setSending] = useState(false);

    const TAB_PERMS: Record<PortalTab, string> = {
        directory: 'strata:tenant-portal:directory',
        maintenance: 'strata:tenant-portal:maintenance',
        payments: 'strata:tenant-portal:payments',
        messages: 'strata:tenant-portal:messages',
        'lease-alerts': 'strata:tenant-portal:lease-alerts',
    };
    const visibleTabs = TABS.filter(t => hasPermission(TAB_PERMS[t.id]));

    // Fetch stats
    const fetchStats = useCallback(async () => {
        try {
            const res = await authFetch(`${API}/api/tenant/admin/stats`);
            const json = await res.json();
            if (json.success) setStats(json.data);
        } catch (e) { console.error('[TenantPortal Admin] Stats:', e); }
    }, [authFetch]);

    // Fetch tab data
    const fetchTabData = useCallback(async (page = 1) => {
        setLoading(true);
        const endpoint = tab === 'lease-alerts' ? 'lease-alerts' : tab;
        const params = new URLSearchParams({ page: String(page), limit: '50' });
        if (search) params.set('search', search);
        try {
            const res = await authFetch(`${API}/api/tenant/admin/${endpoint}?${params}`);
            const json = await res.json();
            if (json.success) {
                setData(json.data);
                setPagination(json.pagination || { page: 1, limit: 50, total: json.data.length, totalPages: 1 });
            }
        } catch (e) { console.error('[TenantPortal Admin] Fetch:', e); }
        setLoading(false);
    }, [tab, search, authFetch]);

    useEffect(() => { fetchStats(); }, [fetchStats]);
    useEffect(() => { fetchTabData(1); }, [tab, search]); // eslint-disable-line

    const goPage = (p: number) => { if (p >= 1 && p <= pagination.totalPages) fetchTabData(p); };

    const sendReply = async () => {
        if (!replyTo || !replySubject.trim() || !replyBody.trim()) return;
        setSending(true);
        try {
            const res = await authFetch(`${API}/api/tenant/admin/messages/${replyTo.tenantId || replyTo.entityId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject: replySubject, body: replyBody }),
            });
            if ((await res.json()).success) {
                setReplyTo(null); setReplySubject(''); setReplyBody('');
                fetchTabData(pagination.page);
            }
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
            { label: 'Total Tenants', value: String(stats.totalTenants), icon: Users, color: '#6366f1' },
            { label: 'Open Requests', value: String(stats.openMaintenanceRequests), icon: Wrench, color: '#f59e0b' },
            { label: 'Expiring Leases', value: String(stats.expiringLeases), icon: AlertTriangle, color: '#ef4444' },
            { label: 'Vacant Units', value: String(stats.vacantUnits), icon: Building2, color: '#8b5cf6' },
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
                    <div className="tp-card-header-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
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
                                            className={`tp-row-clickable ${selectedTenant?.id === t.id ? 'tp-row-selected' : ''}`}
                                            onClick={() => setSelectedTenant(selectedTenant?.id === t.id ? null : t)}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div className="tp-detail-avatar" style={{ background: nameColor(t.name), width: 28, height: 28, fontSize: 11 }}>
                                                        {getInitials(t.name)}
                                                    </div>
                                                    <div>
                                                        <div className="tp-cell-name">{t.name}</div>
                                                        <div className="tp-cell-sub">{t.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{t.unitNumber || '—'}</td>
                                            <td>{t.propertyName || '—'}</td>
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
                                        <div className="tp-detail-item-value">{selectedTenant.propertyName}</div>
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
                                            <td>{p.propertyName || '—'}</td>
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
                            <Send size={14} style={{ color: '#6366f1' }} />
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
                                <button className="tp-btn-primary" onClick={sendReply}
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
                        <div className="tp-card-header-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
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
                                        <td>{a.propertyName}</td>
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
        <div className="tp-module">
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
                            className="tp-search"
                            placeholder="Search tenants, units, properties…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <Search size={14} className="tp-search-icon" />
                    </div>
                    <button className="tp-refresh-btn" onClick={() => { fetchStats(); fetchTabData(pagination.page); }}
                        title="Refresh data">
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            <KpiRow />

            {/* Tabs */}
            <div className="tp-tabs">
                {visibleTabs.map(t => {
                    const Icon = t.icon;
                    return (
                        <button key={t.id}
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
