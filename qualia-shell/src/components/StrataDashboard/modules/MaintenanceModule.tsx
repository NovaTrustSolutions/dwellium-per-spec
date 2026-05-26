/**
 * MaintenanceModule — Enhanced maintenance hub with 4 view modes
 * Views: By Property, By Status (Kanban), By Priority, Timeline
 * Plus rich detail panel with Trello metadata, structured sections
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Wrench, RefreshCw, ClipboardCheck, RotateCw, Home, FolderKanban,
    ShoppingCart, Package, Landmark, AlertTriangle, CheckCircle, Clock,
    Building2, BarChart3, CalendarDays, Layers, ChevronDown, ChevronUp,
    ExternalLink, MapPin, User, Tag, Send, Camera, FileText, Shield,
    Plus, X, History, PenTool, Upload
} from 'lucide-react';
import { strataGet, strataPost, strataPut } from '../strataApi';
import type { Workitem } from '../strataTypes';
import { LoadingState, EmptyState, ErrorState } from '../StateView';
import TrelloCardModal from './TrelloCardModal';
import { useUser } from '../../../context/UserContext';
import { useStrataNav } from '../StrataNavContext';
import ProfileSpaces from './ProfileSpaces';
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';
import ResidentAvailabilityCard from './__maintenance/ResidentAvailabilityCard';
import ActionsLogList from './__maintenance/ActionsLogList';
import LaborTable from './__maintenance/LaborTable';
import PurchaseOrderLinks from './__maintenance/PurchaseOrderLinks';

/* ── Sub-tab types ── */
type MaintTab = 'work-orders' | 'recurring' | 'inspections' | 'unit-turns' | 'projects' | 'purchase-orders' | 'inventory' | 'fixed-assets' | 'history';
type ViewMode = 'property' | 'status' | 'priority' | 'timeline';

const TABS: { id: MaintTab; label: string; icon: typeof Wrench }[] = [
    { id: 'work-orders', label: 'Work Orders', icon: Wrench },
    { id: 'recurring', label: 'Recurring', icon: RotateCw },
    { id: 'inspections', label: 'Inspections', icon: ClipboardCheck },
    { id: 'unit-turns', label: 'Unit Turns', icon: Home },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'fixed-assets', label: 'Fixed Assets', icon: Landmark },
    { id: 'history', label: 'History', icon: History },
];

interface SLAMetrics { overdueCount: number; atRiskCount: number; onTrackCount: number; avgResolutionHours: number; slaCompliance: number; totalActive: number; }
interface HistoryEntry { id: string; title: string; status: string; priority: string; propertyId?: string; assignedTo?: string; createdAt: string; resolvedAt?: string; resolutionHours?: number; technicianName?: string; signedOffBy?: string; completionNotes?: string; }

function showToast(msg: string, type: 'success' | 'error' = 'success') {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
        position: 'fixed', bottom: '20px', right: '20px', padding: '10px 18px',
        background: type === 'success' ? '#10b981' : '#ef4444', color: '#fff',
        borderRadius: '8px', zIndex: '9999', fontSize: '13px', fontWeight: '600',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

const VIEW_MODES: { id: ViewMode; label: string; icon: typeof Building2 }[] = [
    { id: 'property', label: 'By Property', icon: Building2 },
    { id: 'status', label: 'By Status', icon: Layers },
    { id: 'priority', label: 'By Priority', icon: BarChart3 },
    { id: 'timeline', label: 'Timeline', icon: CalendarDays },
];

/* ── Color helpers ── */
function statusColor(s: string): string {
    switch (s) {
        case 'completed': case 'resolved': return '#10b981';
        case 'in_progress': return '#D6FE51';
        case 'open': return '#f59e0b';
        case 'pending': return '#f97316';
        case 'cancelled': return '#6b7280';
        default: return '#94a3b8';
    }
}

function statusLabel(s: string): string {
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function priorityColor(p: string): string {
    switch (p) {
        case 'critical': return '#ef4444';
        case 'high': return '#f59e0b';
        case 'medium': return '#D6FE51';
        case 'low': return '#10b981';
        default: return '#94a3b8';
    }
}

function priorityIcon(p: string) {
    const color = priorityColor(p);
    switch (p) {
        case 'critical': case 'high': return <AlertTriangle size={13} color={color} />;
        case 'medium': return <Clock size={13} color={color} />;
        case 'low': return <CheckCircle size={13} color={color} />;
        default: return <Wrench size={13} color={color} />;
    }
}

/* ── Collapsible section ── */
function Section({ title, icon, children, defaultOpen = true, onToggle }: {
    title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
    /** Called after the open-state flips. Used by Task 1.4 sections to emit Sentry breadcrumbs (GR-13). */
    onToggle?: (next: boolean) => void;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10, overflow: 'hidden', marginBottom: 8,
        }}>
            <button onClick={() => setOpen(o => { const next = !o; onToggle?.(next); return next; })} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', border: 'none', background: 'none',
                color: '#D6FE51', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
                {icon} {title}
                <span style={{ marginLeft: 'auto' }}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
            </button>
            {open && <div style={{ padding: '0 14px 12px' }}>{children}</div>}
        </div>
    );
}

/* ── Detail field ── */
function Field({ label, value, dynamic }: { label: string; value?: string | number | null; dynamic?: boolean }) {
    if (!value && value !== 0) return null;
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ color: '#64748b', fontSize: 12, fontWeight: 500 }}>{label}</span>
            <span data-dynamic={dynamic ? 'timestamp' : undefined} style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span>
        </div>
    );
}

/* ── Group header ── */
function GroupHeader({ label, count, color, icon }: { label: string; count: number; color: string; icon: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
            borderBottom: `2px solid ${color}`, marginBottom: 6, marginTop: 12,
        }}>
            <span style={{ color }}>{icon}</span>
            <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>{label}</span>
            <span style={{
                marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                background: `${color}20`, color, padding: '2px 8px', borderRadius: 10,
            }}>{count}</span>
        </div>
    );
}

/* ── Card item in list ── */
function ItemCard({ item, selected, onClick }: { item: Workitem; selected: boolean; onClick: () => void }) {
    const meta = item.metadata || {};
    return (
        <div
            onClick={onClick}
            style={{
                padding: '10px 12px', cursor: 'pointer', borderRadius: 8,
                background: selected ? 'rgba(214,254,81,0.12)' : 'rgba(255,255,255,0.02)',
                border: selected ? '1px solid rgba(214,254,81,0.3)' : '1px solid rgba(255,255,255,0.04)',
                marginBottom: 4, transition: 'all 0.15s',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ marginTop: 2 }}>{priorityIcon(item.priority)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                        {item.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: statusColor(item.status), fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: `${statusColor(item.status)}15` }}>
                            {statusLabel(item.status)}
                        </span>
                        {meta.trelloBoardName && (
                            <span style={{ fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 2 }}>
                                <MapPin size={9} /> {meta.trelloBoardName}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════
   TASK 3.4 — WO detail 15-section additive Blocks
   ════════════════════════════════════════════
   6 NEW exported Block components (parallel-batch #3 / final batch survivor).
   Path B isolation tested in src/test/appfolioParity/maintenance.module.test.tsx.

   Order matches v1 L170 sub-order (Service Request / Property-Unit-Owner-Resident /
   Work Order / Job / Scheduling / Actions Log / View-as-Maintenance-Tech /
   Labor / Purchase Orders / Withheld Amount / Invoices / Texts / Emails /
   Attachments / Notes — in AppFolio's order). Sections 1/2/4 inline-upgraded
   inside DetailPanel; Sections 3/6/8/9/14 already shipped at Task 1.4
   (untouched here); Section 5 Scheduling consolidation deferred to v2.18+ §7.

   These render content only — caller wraps in <Section> for title/collapse/
   onToggle (mirrors 3.2 VendorsModule.tsx Block export pattern). Metadata
   reads use a `typeof === 'object'` defensive guard per Drift #B-i ack —
   ~370/371 work_orders in the dev fixture carry STRING-typed metadata
   (encrypted blob "enc:v1:astra:...") while Workitem.metadata is typed
   Record<string, any>. Runtime is safe (string property access on missing
   key returns undefined); the guard explicitly documents the data-shape
   concern in code. */

// ── Block 7: View as Maintenance Tech (stub per v1 L168) ──
export function BlockViewAsTech(_props: { item: Workitem }) {
    return (
        <div data-testid="wo-block-view-as-tech" style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
            Coming soon — Phase-N wires RBAC tech-portal perspective filter.
        </div>
    );
}

// ── Block 10: Withheld Amount (null-safe metadata fallback per Drift #B-i guard) ──
export function BlockWithheldAmount({ item }: { item: Workitem }) {
    const meta = (typeof item.metadata === 'object' && item.metadata) ? (item.metadata as Record<string, any>) : null;
    const raw = meta?.withheldFromOwner;
    const display = (typeof raw === 'number' && Number.isFinite(raw))
        ? raw.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        : '—';
    return (
        <div data-testid="wo-block-withheld-amount" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
            <span style={{ color: '#64748b', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', fontSize: 10 }}>Owner Withholding</span>
            <span style={{ color: '#cbd5e1', textAlign: 'right' }}>{display}</span>
        </div>
    );
}

// ── Block 11: Invoices (stub per v1 L168) ──
export function BlockInvoices(_props: { item: Workitem }) {
    return (
        <div data-testid="wo-block-invoices" style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
            Coming soon — Phase-N wires invoice ledger surface.
        </div>
    );
}

// ── Block 12: Texts (stub per v1 L168) ──
export function BlockTexts(_props: { item: Workitem }) {
    return (
        <div data-testid="wo-block-texts" style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
            Coming soon — Phase-N wires SMS thread surface.
        </div>
    );
}

// ── Block 13: Emails (stub per v1 L168) ──
export function BlockEmails(_props: { item: Workitem }) {
    return (
        <div data-testid="wo-block-emails" style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
            Coming soon — Phase-N wires email thread surface.
        </div>
    );
}

// ── Block 15: Notes (3-case rendering — array / string / absent — mirrors 3.2 BlockNotes) ──
export function BlockNotes({ item }: { item: Workitem }) {
    const meta = (typeof item.metadata === 'object' && item.metadata) ? (item.metadata as Record<string, any>) : null;
    const raw = meta?.notes;
    if (Array.isArray(raw) && raw.length > 0) {
        return (
            <div data-testid="wo-block-notes" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {raw.map((n: any, i: number) => {
                    const body = (n && typeof n === 'object' && (n.body ?? n.content)) || (typeof n === 'string' ? n : String(n));
                    const metaLine = n && typeof n === 'object' ? [n.posted_by, n.ts].filter(Boolean).join(' · ') : '';
                    return (
                        <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '6px 0', borderBottom: i < raw.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <div>{body}</div>
                            {metaLine && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{metaLine}</div>}
                        </div>
                    );
                })}
            </div>
        );
    }
    if (typeof raw === 'string' && raw.trim().length > 0) {
        return (
            <div data-testid="wo-block-notes" style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'pre-line' }}>
                {raw}
            </div>
        );
    }
    return (
        <div data-testid="wo-block-notes" style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
            No notes recorded.
        </div>
    );
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */

export default function MaintenanceModule() {
    const { hasPermission, authFetch } = useUser();
    const { navigateToProperty } = useStrataNav();
    const [tab, setTab] = useState<MaintTab>('work-orders');
    const [viewMode, setViewMode] = useState<ViewMode>('status');
    const [items, setItems] = useState<Workitem[]>([]);
    const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Workitem | null>(null);
    const [expandedWorkitem, setExpandedWorkitem] = useState<Workitem | null>(null);
    const [slaMetrics, setSlaMetrics] = useState<SLAMetrics | null>(null);
    const [showDispatchModal, setShowDispatchModal] = useState(false);
    const [showRecurringForm, setShowRecurringForm] = useState(false);
    const [historyItems, setHistoryItems] = useState<HistoryEntry[]>([]);
    const [historyFilter, setHistoryFilter] = useState<{ propertyId?: string }>({});
    const [attachments, setAttachments] = useState<any[]>([]);

    const TAB_PERMS: Record<MaintTab, string> = {
        'work-orders': 'strata:maintenance:work-orders',
        recurring: 'strata:maintenance:recurring',
        inspections: 'strata:maintenance:inspections',
        'unit-turns': 'strata:maintenance:unit-turns',
        projects: 'strata:maintenance:projects',
        'purchase-orders': 'strata:maintenance:purchase-orders',
        inventory: 'strata:maintenance:inventory',
        'fixed-assets': 'strata:maintenance:fixed-assets',
        history: 'strata:maintenance:work-orders',
    };
    const visibleTabs = TABS.filter(t => hasPermission(TAB_PERMS[t.id]));

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [workitems, props] = await Promise.all([
                strataGet<Workitem[]>('/workitems', { type: 'work_order' }),
                strataGet<any[]>('/properties'),
            ]);
            // Also fetch maintenance-domain tasks
            const tasks = await strataGet<Workitem[]>('/workitems', { domain: 'maintenance' });
            // Merge, dedup by id
            const all = [...workitems];
            tasks.forEach(t => { if (!all.find(w => w.id === t.id)) all.push(t); });
            setItems(all);
            setProperties(props.map(p => ({ id: p.id, name: p.name })));
        } catch (e) { console.error(e); setError('Failed to load maintenance data'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchItems(); }, [fetchItems]);

    // Fetch SLA metrics
    useEffect(() => {
        strataGet<{ metrics: SLAMetrics }>('/maintenance/sla-report').then(r => setSlaMetrics(r.metrics)).catch(() => {});
    }, [items]);

    // Fetch attachments for selected item
    useEffect(() => {
        if (selected) {
            strataGet<{ attachments: any[] }>(`/maintenance/attachments/${selected.id}`).then(r => setAttachments(r.attachments || [])).catch(() => setAttachments([]));
        } else { setAttachments([]); }
    }, [selected]);

    // Fetch history when on history tab
    useEffect(() => {
        if (tab === 'history') {
            const params: any = { limit: 100 };
            if (historyFilter.propertyId) params.propertyId = historyFilter.propertyId;
            strataGet<{ history: HistoryEntry[] }>('/maintenance/history', params).then(r => setHistoryItems(r.history || [])).catch(() => setHistoryItems([]));
        }
    }, [tab, historyFilter]);

    // Dispatch handler
    const handleDispatch = async (data: { technicianName: string; technicianPhone?: string; scheduledDate?: string; scheduledTime?: string; notes?: string }) => {
        if (!selected) return;
        try {
            await strataPost(`/maintenance/dispatch/${selected.id}`, data);
            showToast(`Dispatched to ${data.technicianName}`, 'success');
            setShowDispatchModal(false);
            fetchItems();
        } catch (err: any) { showToast(err?.message || 'Dispatch failed', 'error'); }
    };

    // Sign-off handler
    const handleSignOff = async (notes?: string) => {
        if (!selected) return;
        try {
            await strataPost(`/maintenance/sign-off/${selected.id}`, { completionNotes: notes });
            showToast('Work order signed off', 'success');
            fetchItems();
        } catch (err: any) { showToast(err?.message || 'Sign-off failed', 'error'); }
    };

    // Add attachment handler
    const handleAddAttachment = async (type: string, description: string) => {
        if (!selected) return;
        try {
            await strataPost(`/maintenance/attachments/${selected.id}`, { type, description });
            showToast('Attachment added', 'success');
            const r = await strataGet<{ attachments: any[] }>(`/maintenance/attachments/${selected.id}`);
            setAttachments(r.attachments || []);
        } catch (err: any) { showToast(err?.message || 'Failed to add attachment', 'error'); }
    };

    // Recurring template handler
    const handleCreateRecurring = async (data: { title: string; description?: string; propertyId?: string; priority?: string; frequencyLabel?: string }) => {
        try {
            await strataPost('/maintenance/recurring-templates', data);
            showToast('Recurring template created', 'success');
            setShowRecurringForm(false);
            fetchItems();
        } catch (err: any) { showToast(err?.message || 'Failed to create template', 'error'); }
    };

    /* ── Filter by sub-tab ── */
    const filteredItems = useMemo(() => items.filter(item => {
        switch (tab) {
            case 'work-orders': return !item.metadata?.recurring;
            case 'recurring': return item.metadata?.recurring === true;
            case 'inspections': return item.tags?.includes('inspection');
            case 'unit-turns': return item.tags?.includes('unit-turn');
            case 'projects': return item.tags?.includes('project');
            case 'purchase-orders': return item.tags?.includes('purchase-order');
            case 'inventory': return item.tags?.includes('inventory');
            case 'fixed-assets': return item.tags?.includes('fixed-asset');
            default: return true;
        }
    }), [items, tab]);

    /* ── Group items by current view mode ── */
    const grouped = useMemo(() => {
        const map = new Map<string, { label: string; items: Workitem[]; color: string; sortKey: number }>();

        filteredItems.forEach(item => {
            let key: string, label: string, color: string, sortKey: number;
            const meta = item.metadata || {};

            switch (viewMode) {
                case 'property': {
                    const propName = meta.trelloBoardName || properties.find(p => p.id === item.propertyId)?.name || 'Unassigned';
                    key = propName;
                    label = propName;
                    color = '#D6FE51';
                    sortKey = 0;
                    break;
                }
                case 'status': {
                    key = item.status;
                    label = statusLabel(item.status);
                    color = statusColor(item.status);
                    sortKey = item.status === 'open' ? 0 : item.status === 'in_progress' ? 1 : item.status === 'pending' ? 2 : 3;
                    break;
                }
                case 'priority': {
                    key = item.priority;
                    label = item.priority.charAt(0).toUpperCase() + item.priority.slice(1);
                    color = priorityColor(item.priority);
                    sortKey = item.priority === 'critical' ? 0 : item.priority === 'high' ? 1 : item.priority === 'medium' ? 2 : 3;
                    break;
                }
                case 'timeline': {
                    // Use due date first, then Trello last activity, then createdAt
                    const date = item.dueDate || meta.trelloLastActivity || meta.trelloDue || item.createdAt;
                    if (!date) { key = 'No Date'; label = 'No Date'; color = '#6b7280'; sortKey = 999; break; }
                    const d = new Date(date);
                    const now = new Date();
                    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    const pastDays = Math.ceil((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

                    if (item.dueDate && diffDays < 0) { key = 'Overdue'; label = `⚠️ Overdue`; color = '#ef4444'; sortKey = 0; }
                    else if (item.dueDate && diffDays <= 7) { key = 'Due This Week'; label = 'Due This Week'; color = '#f59e0b'; sortKey = 1; }
                    else if (item.dueDate && diffDays <= 30) { key = 'Due This Month'; label = 'Due This Month'; color = '#D6FE51'; sortKey = 2; }
                    else if (item.dueDate) { key = 'Due Later'; label = 'Due Later'; color = '#10b981'; sortKey = 3; }
                    // For items without due date, group by last activity
                    else if (pastDays <= 7) { key = 'Active This Week'; label = 'Active This Week'; color = '#10b981'; sortKey = 4; }
                    else if (pastDays <= 30) { key = 'Active This Month'; label = 'Active This Month'; color = '#3b82f6'; sortKey = 5; }
                    else if (pastDays <= 90) { key = 'Active Last 3 Months'; label = 'Active Last 3 Months'; color = '#D6FE51'; sortKey = 6; }
                    else { key = 'Older'; label = 'Older'; color = '#475569'; sortKey = 7; }
                    break;
                }
            }

            if (!map.has(key)) map.set(key, { label, items: [], color, sortKey });
            map.get(key)!.items.push(item);
        });

        return [...map.entries()].sort((a, b) => a[1].sortKey - b[1].sortKey);
    }, [filteredItems, viewMode, properties]);

    const summary = {
        total: items.length,
        open: items.filter(i => i.status === 'open').length,
        inProgress: items.filter(i => i.status === 'in_progress').length,
        completed: items.filter(i => i.status === 'completed' || i.status === 'resolved').length,
    };

    const viewIcon = (mode: ViewMode) => {
        const Icon = VIEW_MODES.find(v => v.id === mode)!.icon;
        return <Icon size={14} />;
    };

    return (
        <>
            <div className="s-module">
                <div className="s-module-header">
                    <div>
                        <h2 className="s-module-title">Maintenance</h2>
                        <p className="s-module-subtitle">{summary.total} total · {summary.open} open · {summary.inProgress} in progress</p>
                    </div>
                    <div className="s-module-actions">
                        <button className="s-btn s-btn-ghost" onClick={fetchItems} aria-label="Refresh maintenance items"><RefreshCw size={14} /></button>
                    </div>
                </div>

                {/* Sub-tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                    {visibleTabs.map(t => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.id}
                                onClick={() => { setTab(t.id); setSelected(null); }}
                                style={{
                                    padding: '6px 12px', border: 'none', borderRadius: 6,
                                    background: tab === t.id ? 'rgba(214,254,81,0.2)' : 'rgba(255,255,255,0.04)',
                                    color: tab === t.id ? '#D6FE51' : '#94a3b8',
                                    cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                }}
                            >
                                <Icon size={13} /> {t.label}
                            </button>
                        );
                    })}
                </div>

                {/* View Mode Switcher */}
                <div style={{
                    display: 'flex', gap: 2, marginBottom: 16, padding: 3, borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)', width: 'fit-content',
                }}>
                    {VIEW_MODES.map(v => {
                        const Icon = v.icon;
                        return (
                            <button
                                key={v.id}
                                onClick={() => setViewMode(v.id)}
                                style={{
                                    padding: '5px 10px', border: 'none', borderRadius: 6,
                                    background: viewMode === v.id ? 'rgba(214,254,81,0.25)' : 'transparent',
                                    color: viewMode === v.id ? '#D6FE51' : '#64748b',
                                    cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                }}
                            >
                                <Icon size={12} /> {v.label}
                            </button>
                        );
                    })}
                </div>

                {/* KPI Strip */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${slaMetrics ? 7 : 4}, 1fr)`, gap: 10, marginBottom: 16 }}>
                    {[
                        { label: 'Open', value: summary.open, color: '#f59e0b', icon: <AlertTriangle size={16} /> },
                        { label: 'In Progress', value: summary.inProgress, color: '#D6FE51', icon: <Clock size={16} /> },
                        { label: 'Completed', value: summary.completed, color: '#10b981', icon: <CheckCircle size={16} /> },
                        { label: 'Total', value: summary.total, color: '#94a3b8', icon: <Wrench size={16} /> },
                        ...(slaMetrics ? [
                            { label: 'Overdue', value: slaMetrics.overdueCount, color: '#ef4444', icon: <AlertTriangle size={16} /> },
                            { label: 'SLA %', value: `${slaMetrics.slaCompliance}%`, color: slaMetrics.slaCompliance >= 80 ? '#10b981' : '#ef4444', icon: <Shield size={16} /> },
                            { label: 'Avg Resolve', value: `${slaMetrics.avgResolutionHours}h`, color: '#D6FE51', icon: <Clock size={16} /> },
                        ] : []),
                    ].map(k => (
                        <div key={k.label} style={{
                            background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px',
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <span style={{ color: k.color }}>{k.icon}</span>
                                <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{k.label}</span>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>{k.value}</div>
                        </div>
                    ))}
                </div>

                {loading ? (
                    <LoadingState message="Loading maintenance data…" />
                ) : error ? (
                    <ErrorState message={error} onRetry={fetchItems} />
                ) : (
                    <div className="s-split-view">
                        {/* ── List Panel with Groups ── */}
                        <div className="s-list-panel" tabIndex={0} role="region" aria-label="Maintenance work-order list" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                            {filteredItems.length === 0 ? (
                                <div className="s-empty">No {TABS.find(t => t.id === tab)?.label.toLowerCase() || 'items'} found</div>
                            ) : (
                                grouped.map(([key, group]) => (
                                    <div key={key}>
                                        <GroupHeader
                                            label={group.label}
                                            count={group.items.length}
                                            color={group.color}
                                            icon={viewIcon(viewMode)}
                                        />
                                        {group.items.map(item => (
                                            <ItemCard
                                                key={item.id}
                                                item={item}
                                                selected={selected?.id === item.id}
                                                onClick={() => setSelected(item)}
                                            />
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* ── Detail Panel ── */}
                        <div className="s-detail-panel" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                            {selected ? <DetailPanel item={selected} properties={properties} onExpand={() => setExpandedWorkitem(selected)} attachments={attachments} onDispatch={() => setShowDispatchModal(true)} onSignOff={handleSignOff} onAddAttachment={handleAddAttachment} /> : (
                                <div className="s-empty-detail">
                                    <Wrench size={40} strokeWidth={1} />
                                    <p>Select an item to view details</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Recurring Tab — show create button + templates */}
                {tab === 'recurring' && (
                    <div style={{ marginBottom: 12 }}>
                        <button onClick={() => setShowRecurringForm(!showRecurringForm)} className="s-btn s-btn-primary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Plus size={14} /> Create Template
                        </button>
                        {showRecurringForm && <RecurringForm properties={properties} onSubmit={handleCreateRecurring} onCancel={() => setShowRecurringForm(false)} />}
                    </div>
                )}

                {/* History Tab */}
                {tab === 'history' ? (
                    <div className="s-glass-card" style={{ padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <History size={16} color="#818cf8" />
                            <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>Maintenance History</span>
                            <select value={historyFilter.propertyId || ''} onChange={e => setHistoryFilter({ propertyId: e.target.value || undefined })}
                                style={{ marginLeft: 'auto', padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 11 }}>
                                <option value="">All Properties</option>
                                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        {historyItems.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>No history found</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {historyItems.map(h => (
                                    <div key={h.id} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${statusColor(h.status)}15`, color: statusColor(h.status), fontWeight: 700 }}>{statusLabel(h.status)}</span>
                                        <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>{h.title}</span>
                                        {h.technicianName && <span style={{ fontSize: 10, color: '#94a3b8' }}><User size={9} style={{ verticalAlign: -1, marginRight: 2 }} />{h.technicianName}</span>}
                                        {h.resolutionHours !== null && h.resolutionHours !== undefined && <span style={{ fontSize: 10, color: '#D6FE51' }}>{h.resolutionHours}h</span>}
                                        <span data-dynamic="timestamp" style={{ fontSize: 10, color: '#475569' }}>{new Date(h.createdAt).toLocaleDateString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Module-level Spaces (Trello-style containers) */}
            <div style={{ marginTop: 16 }}>
                <ProfileSpaces entityType="module" entityId="maintenance" />
            </div>

            {/* Dispatch Modal */}
            {showDispatchModal && selected && (
                <DispatchModal onSubmit={handleDispatch} onClose={() => setShowDispatchModal(false)} />
            )}

            {/* Trello Card Modal */}
            {expandedWorkitem && (
                <TrelloCardModal workitem={expandedWorkitem} onClose={() => setExpandedWorkitem(null)} />
            )}
        </>
    );
}

/* ════════════════════════════════════════════
   DETAIL PANEL
   ════════════════════════════════════════════ */

function DetailPanel({ item, properties, onExpand, attachments, onDispatch, onSignOff, onAddAttachment }: {
    item: Workitem; properties: { id: string; name: string }[]; onExpand: () => void;
    attachments: any[]; onDispatch: () => void; onSignOff: (notes?: string) => void;
    onAddAttachment: (type: string, description: string) => void;
}) {
    const { navigateToProperty } = useStrataNav();
    // Task 3.4: defensive metadata guard per Drift #B-i ack — ~370/371 work_orders
    // in dev fixture carry STRING-typed metadata blobs ("enc:v1:astra:...") while
    // Workitem.metadata is typed Record<string, any>. Guard isolates the runtime
    // safety claim explicitly. Existing `meta.trelloBoardName` reads stay correct
    // because `({}).trelloBoardName === undefined`.
    const meta: Record<string, any> = (typeof item.metadata === 'object' && item.metadata) ? (item.metadata as Record<string, any>) : {};
    const propName = properties.find(p => p.id === item.propertyId)?.name || meta.trelloBoardName || '—';
    // Task 3.4: consolidated Sentry breadcrumb for the 6 NEW Block toggles below.
    // Existing 5 Task-1.4 per-section breadcrumbs (L780/L799/L813/L827/L841 in
    // post-edit numbering) keep their `category: 'ui.click'` shape. The new
    // breadcrumb diverges to `'ui.block-toggle'` to mirror 3.2's precedent.
    const blockBreadcrumb = (block: string, expanded: boolean) => {
        try {
            Sentry.addBreadcrumb({
                category: 'ui.block-toggle',
                message: 'maintenance.wo.detail.block.toggled',
                level: 'info',
                data: { block, expanded, workitemId: item.id },
            });
        } catch { /* Sentry no-op when DSN unset */ }
    };

    return (
        <>
            {/* ── Header ── */}
            <div style={{
                background: 'rgba(30,33,48,0.9)', borderRadius: 12,
                padding: '16px', marginBottom: 8,
                border: '1px solid rgba(255,255,255,0.08)',
            }}>
                <h3 style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
                    {item.title}
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                        color: statusColor(item.status),
                        background: `${statusColor(item.status)}18`,
                        border: `1px solid ${statusColor(item.status)}30`,
                    }}>
                        {statusLabel(item.status)}
                    </span>
                    <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                        color: priorityColor(item.priority),
                        background: `${priorityColor(item.priority)}18`,
                        border: `1px solid ${priorityColor(item.priority)}30`,
                    }}>
                        {item.priority}
                    </span>
                    {item.domain && (
                        <span style={{
                            fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                            color: '#94a3b8', background: 'rgba(255,255,255,0.06)',
                        }}>
                            {item.domain}
                        </span>
                    )}
                </div>

                {/* Section 1 inline upgrade (Task 3.4) — Service Request # / Work Order ID / Received From.
                    Field helper auto-hides empty rows; canonical 19511 surfaces metadata.appfolioServiceRequestId 19511
                    + appfolioWorkOrderId 19523; non-canonical encrypted-blob records render absent (acceptable per L168). */}
                <Field label="Service Request #" value={meta.appfolioServiceRequestId ?? undefined} />
                <Field label="Work Order ID" value={meta.appfolioWorkOrderId ?? undefined} />
                <Field label="Received From" value={meta.receivedFrom ?? item.createdBy ?? undefined} />

                {/* Section 2 inline upgrade (Task 3.4) — Property / Unit / Owner / Resident / Assignment.
                    Property + Assignment kept in their original grid positions (Task-1.4 byte-shape preserved).
                    Unit parsed from item.tags ("Unit: ..." entry); Owner / Resident from metadata fallback.
                    Empty values render as '—' to keep the grid balanced (Field helper auto-hides; we want fixed-shape grid). */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={13} color="#64748b" />
                        {item.propertyId ? (
                            <button className="s-property-link" style={{ fontSize: 12, fontWeight: 600 }} onClick={() => navigateToProperty(item.propertyId!)}>{propName}</button>
                        ) : (
                            <span style={{ fontSize: 12, color: '#D6FE51', fontWeight: 600 }}>{propName}</span>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <User size={13} color="#64748b" />
                        <span style={{ fontSize: 12, color: '#e2e8f0' }}>{item.assignedTo || 'Unassigned'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Wrench size={13} color="#64748b" />
                        <span style={{ fontSize: 12, color: '#cbd5e1' }}>{item.tags.find(t => t.toLowerCase().startsWith('unit:'))?.split(':').slice(1).join(':').trim() || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Landmark size={13} color="#64748b" />
                        <span style={{ fontSize: 12, color: '#cbd5e1' }}>{meta.owner || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Home size={13} color="#64748b" />
                        <span style={{ fontSize: 12, color: '#cbd5e1' }}>{meta.resident || item.tags.find(t => t.toLowerCase().startsWith('resident:'))?.split(':').slice(1).join(':').trim() || '—'}</span>
                    </div>
                </div>
            </div>

            {/* ── Description ── */}
            {item.description && (
                <Section title="Description" icon={<ClipboardCheck size={13} />}>
                    <p style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                        {item.description}
                    </p>
                </Section>
            )}

            {/* Section 4 inline upgrade (Task 3.4) — Job Status / Job ID / Vendor Job Link.
                Field helper auto-hides empty rows. Job ID falls back to workOrderNumber when
                metadata.jobId is absent (canonical 19511 surfaces "19511-1"). */}
            <Field label="Job Status" value={meta.jobStatus ?? undefined} />
            <Field label="Job ID" value={meta.jobId ?? item.workOrderNumber ?? undefined} />
            <Field label="Vendor Job Link" value={meta.vendorJobLink ?? undefined} />

            {/* ── Dates & Details ── */}
            <Section title="Details" icon={<CalendarDays size={13} />}>
                <Field label="Created" value={item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : undefined} dynamic />
                <Field label="Due Date" value={item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : undefined} dynamic />
                <Field label="Last Updated" value={item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined} dynamic />
                <Field label="Resolved" value={item.resolvedAt ? new Date(item.resolvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined} dynamic />
            </Section>

            {/* ════════ Task 1.4 — Work Order detail-panel extensions ════════ */}
            {/* Each section is additive: renders only when the typed field is present.
                ErrorBoundary isolates rendering faults so one bad section doesn't kill
                the whole panel. Sentry breadcrumbs emit on expand/collapse (GR-13). */}

            {/* ── Work Order Info (6 primitives: WO #, permission, owner approval, trade, instructions, next follow-up) ── */}
            {(item.workOrderNumber || item.permissionToEnter !== undefined || item.ownerApproved !== undefined || item.trade || item.vendorInstructions || item.nextFollowUpDate) && (
                <ErrorBoundary fallback={<div style={{ padding: '8px 14px', fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 8 }}>Work Order Info unavailable.</div>}>
                    <Section
                        title="Work Order Info"
                        icon={<Wrench size={13} />}
                        defaultOpen={false}
                        onToggle={(next) => { try { Sentry.addBreadcrumb({ category: 'ui.click', message: `maintenance.workOrderInfo.${next ? 'expand' : 'collapse'}`, level: 'info', data: { itemId: item.id } }); } catch { /* no-op */ } }}
                    >
                        <Field label="Work Order #" value={item.workOrderNumber} />
                        <Field label="Permission to Enter" value={item.permissionToEnter === undefined ? undefined : (item.permissionToEnter ? 'Yes' : 'No')} />
                        <Field label="Owner Approved" value={item.ownerApproved === undefined ? undefined : (item.ownerApproved ? 'Yes' : 'No')} />
                        <Field label="Trade" value={item.trade ?? undefined} />
                        <Field label="Vendor Instructions" value={item.vendorInstructions ?? undefined} />
                        <Field label="Next Follow-up" value={item.nextFollowUpDate ?? undefined} />
                    </Section>
                </ErrorBoundary>
            )}

            {/* ── Resident Availability ── */}
            {item.residentAvailability && (
                <ErrorBoundary fallback={<div style={{ padding: '8px 14px', fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 8 }}>Resident Availability unavailable.</div>}>
                    <Section
                        title="Resident Availability"
                        icon={<CalendarDays size={13} />}
                        defaultOpen={false}
                        onToggle={(next) => { try { Sentry.addBreadcrumb({ category: 'ui.click', message: `maintenance.residentAvailability.${next ? 'expand' : 'collapse'}`, level: 'info', data: { itemId: item.id, windows: item.residentAvailability?.timeWindows.length ?? 0 } }); } catch { /* no-op */ } }}
                    >
                        <ResidentAvailabilityCard availability={item.residentAvailability} />
                    </Section>
                </ErrorBoundary>
            )}

            {/* ── Actions Log ── */}
            {item.actionsLog && item.actionsLog.length > 0 && (
                <ErrorBoundary fallback={<div style={{ padding: '8px 14px', fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 8 }}>Actions Log unavailable.</div>}>
                    <Section
                        title={`Actions Log (${item.actionsLog.length})`}
                        icon={<ClipboardCheck size={13} />}
                        defaultOpen={false}
                        onToggle={(next) => { try { Sentry.addBreadcrumb({ category: 'ui.click', message: `maintenance.actionsLog.${next ? 'expand' : 'collapse'}`, level: 'info', data: { itemId: item.id, entries: item.actionsLog?.length ?? 0 } }); } catch { /* no-op */ } }}
                    >
                        <ActionsLogList entries={item.actionsLog} />
                    </Section>
                </ErrorBoundary>
            )}

            {/* ── Labor ── */}
            {item.laborEntries && (
                <ErrorBoundary fallback={<div style={{ padding: '8px 14px', fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 8 }}>Labor table unavailable.</div>}>
                    <Section
                        title={`Labor (${item.laborEntries.length})`}
                        icon={<PenTool size={13} />}
                        defaultOpen={false}
                        onToggle={(next) => { try { Sentry.addBreadcrumb({ category: 'ui.click', message: `maintenance.labor.${next ? 'expand' : 'collapse'}`, level: 'info', data: { itemId: item.id, entries: item.laborEntries?.length ?? 0 } }); } catch { /* no-op */ } }}
                    >
                        <LaborTable entries={item.laborEntries} />
                    </Section>
                </ErrorBoundary>
            )}

            {/* ── Purchase Orders ── */}
            {item.purchaseOrders && (
                <ErrorBoundary fallback={<div style={{ padding: '8px 14px', fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 8 }}>Purchase Orders unavailable.</div>}>
                    <Section
                        title={`Purchase Orders (${item.purchaseOrders.length})`}
                        icon={<ExternalLink size={13} />}
                        defaultOpen={false}
                        onToggle={(next) => { try { Sentry.addBreadcrumb({ category: 'ui.click', message: `maintenance.purchaseOrders.${next ? 'expand' : 'collapse'}`, level: 'info', data: { itemId: item.id, pos: item.purchaseOrders?.length ?? 0 } }); } catch { /* no-op */ } }}
                    >
                        <PurchaseOrderLinks purchaseOrders={item.purchaseOrders} />
                    </Section>
                </ErrorBoundary>
            )}
            {/* ════════ end Task 1.4 ════════ */}

            {/* ── Dual Status (Manager + Tenant) ── */}
            {meta.tenantStatus && (
                <Section title="Status Tracking" icon={<Shield size={13} />}>
                    <Field label="Manager Status" value={statusLabel(item.status)} />
                    <Field label="Tenant-Visible Status" value={meta.tenantStatus} />
                    {meta.techStatus && <Field label="Technician Status" value={meta.techStatus} />}
                    {meta.scheduledDate && <Field label="Scheduled" value={`${meta.scheduledDate}${meta.scheduledTime ? ' at ' + meta.scheduledTime : ''}`} />}
                    {meta.dispatchedAt && <Field label="Dispatched" value={new Date(meta.dispatchedAt).toLocaleString()} dynamic />}
                    {meta.signedOffAt && <Field label="Signed Off" value={`${new Date(meta.signedOffAt).toLocaleString()} by ${meta.signedOffBy}`} dynamic />}
                </Section>
            )}

            {/* ── Attachments ── */}
            <Section title={`Attachments (${attachments.length})`} icon={<Camera size={13} />} defaultOpen={attachments.length > 0}>
                {attachments.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: 12, padding: '4px 0' }}>No attachments</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {attachments.map((a: any) => (
                            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(214,254,81,0.12)', color: '#D6FE51', fontWeight: 600 }}>{a.type?.replace(/_/g, ' ')}</span>
                                <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>{a.description || a.metadata?.fileName || 'Unnamed'}</span>
                                <span data-dynamic="timestamp" style={{ fontSize: 10, color: '#475569' }}>{a.metadata?.uploadedAt ? new Date(a.metadata.uploadedAt).toLocaleDateString() : ''}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                    {['before_photo', 'after_photo', 'vendor_quote', 'receipt'].map(type => (
                        <button key={type} onClick={() => onAddAttachment(type, '')} style={{
                            padding: '3px 8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
                            background: 'rgba(255,255,255,0.04)', color: '#D6FE51', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                        }}>
                            <Upload size={9} style={{ verticalAlign: -1, marginRight: 2 }} />{type.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>
            </Section>

            {/* ════════ Task 3.4 — WO detail 15-section additive Blocks (parallel-batch #3) ════════
                6 NEW Blocks consolidated under a single ErrorBoundary scoped wrap (mirrors 3.2
                VendorsModule.tsx L931 pattern). Order within wrap matches v1 L170 sub-order:
                7 View-as-Tech / 10 Withheld Amount / 11 Invoices / 12 Texts / 13 Emails / 15 Notes.

                Inserted between existing Section 14 Attachments and the Action Buttons cluster.
                Trade-off (acked at PRE0 #8 / Drift #B-i): blocks 7/10/11/12/13 visually appear
                AFTER Section 14 Attachments (slight v1 order divergence) so all 6 NEW Blocks
                stay contiguous under one wrap. Module ErrorBoundary count: 5 → 6.
                Module Sentry breadcrumb count: 5 → 6 (new consolidated `ui.block-toggle`). */}
            <ErrorBoundary fallback={<div style={{ padding: '8px 14px', fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 8 }}>WO detail blocks unavailable.</div>}>
                <Section
                    title="View as Maintenance Tech"
                    icon={<User size={13} />}
                    defaultOpen={false}
                    onToggle={(next) => blockBreadcrumb('view-as-tech', next)}
                >
                    <BlockViewAsTech item={item} />
                </Section>
                <Section
                    title="Withheld Amount"
                    icon={<Landmark size={13} />}
                    defaultOpen={false}
                    onToggle={(next) => blockBreadcrumb('withheld-amount', next)}
                >
                    <BlockWithheldAmount item={item} />
                </Section>
                <Section
                    title="Invoices"
                    icon={<FileText size={13} />}
                    defaultOpen={false}
                    onToggle={(next) => blockBreadcrumb('invoices', next)}
                >
                    <BlockInvoices item={item} />
                </Section>
                <Section
                    title="Texts"
                    icon={<Send size={13} />}
                    defaultOpen={false}
                    onToggle={(next) => blockBreadcrumb('texts', next)}
                >
                    <BlockTexts item={item} />
                </Section>
                <Section
                    title="Emails"
                    icon={<Send size={13} />}
                    defaultOpen={false}
                    onToggle={(next) => blockBreadcrumb('emails', next)}
                >
                    <BlockEmails item={item} />
                </Section>
                <Section
                    title="Notes"
                    icon={<ClipboardCheck size={13} />}
                    defaultOpen={false}
                    onToggle={(next) => blockBreadcrumb('notes', next)}
                >
                    <BlockNotes item={item} />
                </Section>
            </ErrorBoundary>
            {/* ════════ end Task 3.4 ════════ */}

            {/* ── Action Buttons ── */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {(item.status === 'open' || item.status === 'pending') && (
                    <button onClick={onDispatch} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: 'rgba(214,254,81,0.2)', color: '#D6FE51', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Send size={12} /> Dispatch
                    </button>
                )}
                {(item.status === 'in_progress' || item.status === 'pending') && (
                    <button onClick={() => {
                        const notes = window.prompt('Completion notes (optional):');
                        onSignOff(notes || undefined);
                    }} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: 'rgba(16,185,129,0.2)', color: '#10b981', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <PenTool size={12} /> Sign Off
                    </button>
                )}
            </div>

            {/* ── Tags ── */}
            {item.tags && item.tags.length > 0 && (
                <Section title="Tags" icon={<Tag size={13} />} defaultOpen={true}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {item.tags.map(tag => (
                            <span key={tag} style={{
                                fontSize: 11, padding: '3px 10px', borderRadius: 6,
                                background: 'rgba(214,254,81,0.12)', color: '#D6FE51', fontWeight: 500,
                            }}>{tag}</span>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Trello Source ── */}
            {meta.trelloCardId && (
                <Section title="Trello Source" icon={<ExternalLink size={13} />} defaultOpen={false}>
                    <Field label="Board" value={meta.trelloBoardName} />
                    <Field label="List" value={meta.trelloListName} />
                    <Field label="Last Activity" value={meta.trelloLastActivity ? new Date(meta.trelloLastActivity).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined} dynamic />
                    {meta.trelloUrl && (
                        <div style={{ marginTop: 8 }}>
                            <a
                                href={meta.trelloUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    fontSize: 12, color: '#D6FE51', textDecoration: 'none',
                                    padding: '4px 10px', borderRadius: 6,
                                    background: 'rgba(214,254,81,0.1)',
                                    border: '1px solid rgba(214,254,81,0.2)',
                                }}
                            >
                                <ExternalLink size={11} /> Open in Trello
                            </a>
                        </div>
                    )}
                    <button
                        onClick={onExpand}
                        style={{
                            width: '100%', marginTop: 8, padding: '8px 12px',
                            borderRadius: 6, border: '1px solid rgba(214,254,81,0.2)',
                            background: 'rgba(214,254,81,0.08)', color: '#D6FE51',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                    >
                        <ExternalLink size={12} /> View Full Card (Images & Attachments)
                    </button>
                    {meta.trelloLabels && meta.trelloLabels.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                            {meta.trelloLabels.map((l: any, i: number) => (
                                <span key={i} style={{
                                    fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                    background: l.color ? `${l.color}30` : 'rgba(255,255,255,0.08)',
                                    color: l.color || '#94a3b8', fontWeight: 600,
                                }}>{l.name || l.color}</span>
                            ))}
                        </div>
                    )}
                </Section>
            )}

            {/* ── Checklists (from Trello) ── */}
            {meta.checklists && meta.checklists.length > 0 && (
                <Section title="Checklists" icon={<ClipboardCheck size={13} />} defaultOpen={false}>
                    {meta.checklists.map((cl: any, i: number) => (
                        <div key={i} style={{ marginBottom: 10 }}>
                            <div style={{ color: '#D6FE51', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{cl.name}</div>
                            {cl.checkItems?.map((ci: any, j: number) => (
                                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                                    <span style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${ci.state === 'complete' ? '#10b981' : '#475569'}`, background: ci.state === 'complete' ? '#10b98120' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {ci.state === 'complete' && <CheckCircle size={10} color="#10b981" />}
                                    </span>
                                    <span style={{ color: ci.state === 'complete' ? '#64748b' : '#e2e8f0', fontSize: 12, textDecoration: ci.state === 'complete' ? 'line-through' : 'none' }}>{ci.name}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </Section>
            )}
        </>
    );
}

/* ════════════════════════════════════════════
   DISPATCH MODAL
   ════════════════════════════════════════════ */

function DispatchModal({ onSubmit, onClose }: {
    onSubmit: (data: { technicianName: string; technicianPhone?: string; scheduledDate?: string; scheduledTime?: string; notes?: string }) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [notes, setNotes] = useState('');

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#1e2130', borderRadius: 12, padding: 24, width: 400, maxWidth: '90%', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 16, fontWeight: 700 }}>Dispatch Work Order</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Technician Name *" style={inputStyle} />
                    <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" style={inputStyle} />
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                        <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    </div>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Dispatch notes (optional)" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                    <button onClick={() => { if (name) onSubmit({ technicianName: name, technicianPhone: phone, scheduledDate: date || undefined, scheduledTime: time || undefined, notes }); }}
                        disabled={!name}
                        style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: name ? '#D6FE51' : '#334155', color: '#fff', cursor: name ? 'pointer' : 'default', fontWeight: 600 }}>
                        <Send size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Dispatch
                    </button>
                </div>
            </div>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13,
};

/* ════════════════════════════════════════════
   RECURRING TEMPLATE FORM
   ════════════════════════════════════════════ */

function RecurringForm({ properties, onSubmit, onCancel }: {
    properties: { id: string; name: string }[];
    onSubmit: (data: { title: string; description?: string; propertyId?: string; priority?: string; frequencyLabel?: string }) => void;
    onCancel: () => void;
}) {
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [prop, setProp] = useState('');
    const [freq, setFreq] = useState('Monthly');
    const [pri, setPri] = useState('medium');

    return (
        <div style={{ marginTop: 10, padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Template title *" style={{ ...inputStyle, flex: 1 }} />
                <select value={freq} onChange={e => setFreq(e.target.value)} style={{ ...inputStyle, width: 120 }}>
                    <option>Weekly</option><option>Monthly</option><option>Quarterly</option><option>Semi-Annual</option><option>Annual</option>
                </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select value={prop} onChange={e => setProp(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                    <option value="">All Properties</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={pri} onChange={e => setPri(e.target.value)} style={{ ...inputStyle, width: 100 }}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
            </div>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" rows={2} style={{ ...inputStyle, width: '100%', marginBottom: 8, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { if (title) onSubmit({ title, description: desc, propertyId: prop || undefined, priority: pri, frequencyLabel: freq }); }}
                    disabled={!title} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: title ? '#D6FE51' : '#334155', color: '#fff', cursor: title ? 'pointer' : 'default', fontWeight: 600, fontSize: 12 }}>
                    <Plus size={12} style={{ verticalAlign: -2, marginRight: 3 }} /> Create
                </button>
                <button onClick={onCancel} style={{ padding: '6px 14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
            </div>
        </div>
    );
}
