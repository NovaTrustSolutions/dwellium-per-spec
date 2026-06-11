/**
 * AstraDashboard — Executive-tier dashboard with Portfolio Heatmap,
 * Watchdog List, Financial Quick-viz, Compliance Calendar, AI Agent Log.
 * Houses 5 tabs: Dashboard, Workspace, Channels, Intelligence, Observability.
 */
import { useRef, useState } from 'react';
import { API_BASE } from '../../config';
import {
    LayoutDashboard, Wrench, MessageSquare,
    Building2, AlertTriangle, DollarSign,
    CalendarCheck, Bot, ChevronRight, Clock,
    TrendingUp, TrendingDown, Activity, Brain, Eye,
    ClipboardList, ArrowUpRight, Globe, RefreshCw,
    ChevronUp, ChevronDown, ChevronLeft, X, Plus, Settings2,
    Shield, Scale, ExternalLink, Truck, KeyRound,
    Landmark, ShieldAlert, Users, Sparkles, Search, Settings,
} from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { openStrataModule } from '../StrataDashboard/strataDeepLink';
import AstraWorkspace from './AstraWorkspace';
import ThreadChannels from './ThreadChannels';
import IntelligenceDashboard from './IntelligenceDashboard';
import ObservabilityPanel from './ObservabilityPanel';
import { useDashboardData } from './useDashboardData';
import { useDashboardLayout } from './useDashboardLayout';
import { friendlyLoadError } from '../../lib/backendStatus';
import {
    fetchFinanceSnapshot,
    buildResearchPrompt, RESEARCH_TOPICS, RESEARCH_SYSTEM_PROMPT,
} from './dashboardData';
import {
    DASHBOARD_COLUMNS,
    type DashboardColumn, type DashboardLayout, type MoveDirection,
} from './dashboardLayoutStore';
import {
    applyGlobalFilters, filtersActive, visibleRowCount,
    EMPTY_FILTERS, type GlobalFilters,
} from './dashboardFilters';
import type {
    HeatmapProperty, WatchdogItem, FinancialCard,
    DashCalendarEvent, AgentLogEntry, ActiveWorkitem, DomainSnapshot,
    ComplianceSummaryItem, LegalMatter,
    MaintenanceWorkOrder, LeaseExpiration, VendorStatus,
    FinanceSnapshot, RiskRegisterItem, HrSnapshot,
} from './dashboardData';
import './AstraDashboard.css';
import './IntelligenceDashboard.css';

type AstraTab = 'dashboard' | 'workspace' | 'channels' | 'intelligence' | 'observability';

/* ═══════════════════════════  PANEL STATE  ═══════════════════════════ */

/**
 * Shared loading / error / empty placeholder for a panel body. Returns
 * `null` once real rows are ready so the panel renders its own content.
 * (Cycle 9 will unify this styling across every panel; Cycle 3 wires the
 * three states consistently for the seven real-data panels.)
 */
function PanelStatus({ loading, error, empty, emptyLabel }: {
    loading: boolean;
    error: string | null;
    empty: boolean;
    emptyLabel?: string;
}) {
    if (loading) {
        return (
            <div className="a-panel-state" role="status">
                <RefreshCw size={13} className="a-panel-state-spin" /> Loading…
            </div>
        );
    }
    if (error) {
        return (
            <div className="a-panel-state a-panel-state--error" role="alert">
                Couldn’t load data — {friendlyLoadError(error)}
            </div>
        );
    }
    if (empty) {
        return <div className="a-panel-state a-panel-state--empty">{emptyLabel ?? 'No data yet'}</div>;
    }
    return null;
}

/** Small badge marking a panel whose data is sample/not-yet-wired (DASH-D5). */
function MockBadge() {
    return <span className="a-badge a-badge-mock" title="Sample data — not yet wired to a live source">Sample</span>;
}

interface PanelProps {
    loading: boolean;
    error: string | null;
}

/* ═══════════════════════════  HELPERS  ═══════════════════════════ */

function heatColor(value: number, metric: 'occupancy' | 'delinquency' | 'maintenance'): string {
    if (metric === 'occupancy') {
        if (value >= 95) return 'var(--a-heat-good)';
        if (value >= 85) return 'var(--a-heat-ok)';
        return 'var(--a-heat-bad)';
    }
    if (metric === 'delinquency') {
        if (value <= 2) return 'var(--a-heat-good)';
        if (value <= 5) return 'var(--a-heat-ok)';
        return 'var(--a-heat-bad)';
    }
    // maintenance
    if (value <= 5) return 'var(--a-heat-good)';
    if (value <= 10) return 'var(--a-heat-ok)';
    return 'var(--a-heat-bad)';
}

/* ═══════════════════════════  PANELS  ═══════════════════════════ */

function PortfolioHeatmap({ properties, loading, error }: PanelProps & { properties: HeatmapProperty[] }) {
    const ready = !loading && !error && properties.length > 0;
    return (
        <div className="a-panel a-heatmap">
            <div className="a-panel-header">
                <Building2 size={16} />
                <span>Portfolio Heatmap</span>
            </div>
            <PanelStatus loading={loading} error={error} empty={properties.length === 0} emptyLabel="No properties to show" />
            {ready && (
                <div className="a-heatmap-grid">
                    <div className="a-heatmap-header">
                        <span className="a-heatmap-label">Property</span>
                        <span className="a-heatmap-metric">Occupancy</span>
                        <span className="a-heatmap-metric">Delinq.</span>
                        <span className="a-heatmap-metric">Maint.</span>
                    </div>
                    {properties.map(p => (
                        <div key={p.name} className="a-heatmap-row">
                            <span className="a-heatmap-name">{p.name}</span>
                            <span className="a-heatmap-cell" style={{ background: heatColor(p.occupancy, 'occupancy') }}>
                                {p.occupancy}%
                            </span>
                            <span className="a-heatmap-cell" style={{ background: heatColor(p.delinquency, 'delinquency') }}>
                                {p.delinquency}%
                            </span>
                            <span className="a-heatmap-cell" style={{ background: heatColor(p.maintenance, 'maintenance') }}>
                                {p.maintenance}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function WatchdogList({ items, loading, error }: PanelProps & { items: WatchdogItem[] }) {
    const ready = !loading && !error && items.length > 0;
    const criticalCount = items.filter(w => w.priority === 'critical').length;
    return (
        <div className="a-panel a-watchdog">
            <div className="a-panel-header">
                <AlertTriangle size={16} />
                <span>Watchdog List</span>
                {ready && <span className="a-badge a-badge-critical">{criticalCount} Critical</span>}
            </div>
            <PanelStatus loading={loading} error={error} empty={items.length === 0} emptyLabel="No high-priority items" />
            {ready && (
                <div className="a-watchdog-list">
                    {items.map(item => (
                        <div key={item.id} className={`a-watchdog-item a-priority-${item.priority}`}>
                            <div className="a-watchdog-main">
                                <span className={`a-priority-dot a-dot-${item.priority}`} />
                                <span className="a-watchdog-title">{item.title}</span>
                            </div>
                            <div className="a-watchdog-meta">
                                <span className={`a-watchdog-due ${item.due.includes('overdue') ? 'a-overdue' : ''}`}>
                                    <Clock size={12} /> {item.due}
                                </span>
                                <span className="a-watchdog-property">{item.property}</span>
                                <ChevronRight size={14} className="a-watchdog-arrow" />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function FinancialQuickViz({ cards, loading, error }: PanelProps & { cards: FinancialCard[] }) {
    const ready = !loading && !error && cards.length > 0;
    return (
        <div className="a-panel a-finance">
            <div className="a-panel-header">
                <DollarSign size={16} />
                <span>Financial Quick-viz</span>
            </div>
            <PanelStatus loading={loading} error={error} empty={cards.length === 0} emptyLabel="No financial projection yet" />
            {ready && (
                <div className="a-finance-cards">
                    {cards.map(card => (
                        <div key={card.label} className="a-finance-card">
                            <span className="a-finance-label">{card.label}</span>
                            <span className="a-finance-value">{card.value}</span>
                            {card.change && (
                                <span className={`a-finance-change a-trend-${card.trend}`}>
                                    {card.trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                    {card.change}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ComplianceCalendar({ events, loading, error }: PanelProps & { events: DashCalendarEvent[] }) {
    const ready = !loading && !error;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const typeColors: Record<string, string> = {
        inspection: 'var(--a-cal-inspect)',
        compliance: 'var(--a-cal-comply)',
        deadline: 'var(--a-cal-deadline)',
        corporate: 'var(--a-cal-corporate)',
    };

    return (
        <div className="a-panel a-calendar">
            <div className="a-panel-header">
                <CalendarCheck size={16} />
                <span>Compliance Calendar</span>
                <span className="a-calendar-month">{monthName}</span>
            </div>
            <PanelStatus loading={loading} error={error} empty={false} />
            {ready && (
            <>
            <div className="a-calendar-grid">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={i} className="a-cal-day-label">{d}</span>
                ))}
                {cells.map((day, i) => {
                    const evts = day ? events.filter(e => e.day === day) : [];
                    return (
                        <span
                            key={i}
                            className={`a-cal-cell ${day === now.getDate() ? 'a-cal-today' : ''} ${!day ? 'a-cal-empty' : ''}`}
                            title={evts.map(e => e.label).join('\n') || undefined}
                        >
                            {day || ''}
                            {evts.length > 0 && (
                                <span className="a-cal-dots">
                                    {evts.map((e, j) => (
                                        <span key={j} className="a-cal-dot" style={{ background: typeColors[e.type] }} />
                                    ))}
                                </span>
                            )}
                        </span>
                    );
                })}
            </div>
            <div className="a-cal-legend">
                {Object.entries(typeColors).map(([type, color]) => (
                    <span key={type} className="a-cal-legend-item">
                        <span className="a-cal-dot" style={{ background: color }} />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                    </span>
                ))}
            </div>
            </>
            )}
        </div>
    );
}

function AIAgentLog({ entries, loading, error }: PanelProps & { entries: AgentLogEntry[] }) {
    const ready = !loading && !error && entries.length > 0;
    const typeIcons: Record<string, string> = {
        alert: '🚨', route: '📨', create: '📄', filter: '🗑️', check: '✅',
    };
    return (
        <div className="a-panel a-agent-log">
            <div className="a-panel-header">
                <Bot size={16} />
                <span>AI Agent Activity</span>
                <span className="a-agent-live"><Activity size={12} /> Live</span>
            </div>
            <PanelStatus loading={loading} error={error} empty={entries.length === 0} emptyLabel="No recent agent activity" />
            {ready && (
                <div className="a-agent-feed">
                    {entries.map((entry, i) => (
                        <div key={i} className="a-agent-entry">
                            <span className="a-agent-icon">{typeIcons[entry.type] || '•'}</span>
                            <div className="a-agent-body">
                                <span className="a-agent-action">{entry.action}</span>
                                <span className="a-agent-meta">
                                    <span className="a-agent-name">{entry.agent}</span>
                                    <span className="a-agent-time">{entry.time}</span>
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════  COMPLIANCE TRACKER  ═══════════════════ */

/** Small "Open in Strata" drill-down button reused by the Cycle-5/6 panels. */
type DrillModule = 'compliance' | 'legal' | 'maintenance' | 'leasing' | 'vendors' | 'forecast' | 'incidents';
function DrillToStrata({ module, label }: { module: DrillModule; label: string }) {
    return (
        <button
            className="a-drill-btn"
            onClick={() => openStrataModule(module)}
            aria-label={`Open ${label} in Strata Dashboard`}
            title={`Open ${label} in Strata Dashboard`}
        >
            <ExternalLink size={12} /> Open
        </button>
    );
}

/** Due-date label + tone: overdue / due-soon / future, from a daysUntil value. */
function dueLabel(daysUntil: number | null): { text: string; cls: string } {
    if (daysUntil === null) return { text: 'No date', cls: '' };
    if (daysUntil < 0) return { text: `${Math.abs(daysUntil)}d overdue`, cls: 'a-due-overdue' };
    if (daysUntil === 0) return { text: 'Due today', cls: 'a-due-soon' };
    if (daysUntil <= 30) return { text: `${daysUntil}d`, cls: 'a-due-soon' };
    return { text: `${daysUntil}d`, cls: '' };
}

function ComplianceTracker({ items, loading, error }: PanelProps & { items: ComplianceSummaryItem[] }) {
    const ready = !loading && !error && items.length > 0;
    const atRisk = items.filter(i => i.status === 'expired' || i.status === 'missing' || i.status === 'warning').length;
    return (
        <div className="a-panel a-compliance">
            <div className="a-panel-header">
                <Shield size={16} />
                <span>Compliance Tracker</span>
                {ready && atRisk > 0 && <span className="a-badge a-badge-critical">{atRisk} at risk</span>}
                <DrillToStrata module="compliance" label="Compliance" />
            </div>
            <PanelStatus loading={loading} error={error} empty={items.length === 0} emptyLabel="No compliance items tracked" />
            {ready && (
                <div className="a-compliance-list">
                    {items.map(item => {
                        const due = dueLabel(item.daysUntil);
                        return (
                            <button
                                key={item.id}
                                className="a-compliance-row"
                                onClick={() => openStrataModule('compliance')}
                                title={`${item.label} — ${item.status}`}
                            >
                                <span className={`a-comply-status a-comply-${item.status}`}>{item.status}</span>
                                <span className="a-comply-label">{item.label}</span>
                                {item.entity && <span className="a-comply-entity">{item.entity}</span>}
                                <span className={`a-comply-due ${due.cls}`}>{due.text}</span>
                                <ChevronRight size={13} className="a-comply-arrow" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════  LITIGATION TRACKER  ═══════════════════ */

function LitigationTracker({ matters, loading, error }: PanelProps & { matters: LegalMatter[] }) {
    const ready = !loading && !error && matters.length > 0;
    return (
        <div className="a-panel a-litigation">
            <div className="a-panel-header">
                <Scale size={16} />
                <span>Litigation &amp; Matters</span>
                {ready && <span className="a-badge a-badge-count">{matters.length}</span>}
                <DrillToStrata module="legal" label="Legal" />
            </div>
            <PanelStatus loading={loading} error={error} empty={matters.length === 0} emptyLabel="No open legal matters" />
            {ready && (
                <div className="a-litigation-list">
                    {matters.map(m => {
                        const due = m.deadline ? dueLabel(Math.round((Date.parse(m.deadline) - Date.now()) / 86_400_000)) : { text: 'No deadline', cls: '' };
                        return (
                            <button
                                key={m.id}
                                className="a-litigation-row"
                                onClick={() => openStrataModule('legal')}
                                title={`${m.title} — ${m.status}`}
                            >
                                <span className={`a-priority-dot a-dot-${m.priority}`} />
                                <span className="a-litigation-title">{m.title}</span>
                                <span className="a-litigation-counsel" title="Assigned counsel">{m.counsel}</span>
                                <span className={`a-litigation-status a-status-${m.status}`}>{m.status.replace('_', ' ')}</span>
                                <span className={`a-litigation-due ${due.cls}`}>{due.text}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════  OPERATIONS PANELS (Cycle 6)  ═══════════════════ */

/** Maintenance work-order queue — open maintenance items, priority filterable. */
function MaintenanceQueue({ items, loading, error }: PanelProps & { items: MaintenanceWorkOrder[] }) {
    const [onlyUrgent, setOnlyUrgent] = useState(false);
    const shown = onlyUrgent
        ? items.filter(w => w.priority === 'critical' || w.priority === 'high' || w.priority === 'urgent')
        : items;
    const ready = !loading && !error && items.length > 0;
    const criticalCount = items.filter(w => w.priority === 'critical').length;
    return (
        <div className="a-panel a-maintenance">
            <div className="a-panel-header">
                <Wrench size={16} />
                <span>Maintenance Queue</span>
                {ready && criticalCount > 0 && <span className="a-badge a-badge-critical">{criticalCount} crit</span>}
                {ready && (
                    <button
                        className={`a-panel-filter ${onlyUrgent ? 'a-panel-filter--on' : ''}`}
                        onClick={() => setOnlyUrgent(v => !v)}
                        aria-pressed={onlyUrgent}
                        title="Show only critical/high/urgent work orders"
                    >
                        {onlyUrgent ? 'Urgent only' : 'All priorities'}
                    </button>
                )}
                <DrillToStrata module="maintenance" label="Maintenance" />
            </div>
            <PanelStatus loading={loading} error={error} empty={items.length === 0} emptyLabel="No open work orders" />
            {ready && (
                <div className="a-ops-list">
                    {shown.length === 0 && <div className="a-panel-state a-panel-state--empty">No urgent work orders</div>}
                    {shown.map(w => {
                        const due = dueLabel(w.daysUntil);
                        return (
                            <button
                                key={w.id}
                                className="a-ops-row"
                                onClick={() => openStrataModule('maintenance')}
                                title={`${w.title} — ${w.priority}`}
                            >
                                <span className={`a-priority-dot a-dot-${w.priority}`} />
                                <span className="a-ops-title">{w.title}</span>
                                <span className="a-ops-age">{w.age}</span>
                                <span className={`a-ops-due ${due.cls}`}>{due.text}</span>
                                <ChevronRight size={13} className="a-ops-arrow" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const LEASE_WINDOWS: { label: string; days: number }[] = [
    { label: '30d', days: 30 },
    { label: '60d', days: 60 },
    { label: '90d', days: 90 },
    { label: 'All', days: 0 },
];

/** Lease-expirations — units by lease end date, windowed (30/60/90/all). */
function LeaseExpirations({ items, loading, error }: PanelProps & { items: LeaseExpiration[] }) {
    const [windowDays, setWindowDays] = useState(90);
    const shown = windowDays === 0
        ? items
        : items.filter(l => l.daysUntil !== null && l.daysUntil <= windowDays);
    const ready = !loading && !error && items.length > 0;
    return (
        <div className="a-panel a-leases">
            <div className="a-panel-header">
                <KeyRound size={16} />
                <span>Lease Expirations</span>
                {ready && <span className="a-badge a-badge-count">{shown.length}</span>}
                {ready && (
                    <div className="a-panel-segctl" role="group" aria-label="Lease expiry window">
                        {LEASE_WINDOWS.map(w => (
                            <button
                                key={w.days}
                                className={`a-panel-seg ${windowDays === w.days ? 'a-panel-seg--on' : ''}`}
                                onClick={() => setWindowDays(w.days)}
                                aria-pressed={windowDays === w.days}
                                title={w.days === 0 ? 'All upcoming + expired leases' : `Leases ending within ${w.days} days`}
                            >
                                {w.label}
                            </button>
                        ))}
                    </div>
                )}
                <DrillToStrata module="leasing" label="Leasing" />
            </div>
            <PanelStatus loading={loading} error={error} empty={items.length === 0} emptyLabel="No leases with an end date" />
            {ready && (
                <div className="a-ops-list">
                    {shown.length === 0 && <div className="a-panel-state a-panel-state--empty">No leases in this window</div>}
                    {shown.map(l => {
                        const due = dueLabel(l.daysUntil);
                        return (
                            <button
                                key={l.id}
                                className="a-ops-row"
                                onClick={() => openStrataModule('leasing')}
                                title={`Unit ${l.unit} — ${l.tenant}`}
                            >
                                <span className="a-lease-unit">{l.unit}</span>
                                <span className="a-ops-title">{l.tenant}</span>
                                <span className={`a-ops-due ${due.cls}`}>{due.text}</span>
                                <ChevronRight size={13} className="a-ops-arrow" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/** Vendor / contract status — associations by status, attention-filterable. */
function VendorStatusPanel({ items, loading, error }: PanelProps & { items: VendorStatus[] }) {
    const [onlyAttention, setOnlyAttention] = useState(false);
    const needsAttention = (s: string) => s === 'suspended' || s === 'expired' || s === 'terminated' || s === 'pending';
    const shown = onlyAttention ? items.filter(v => needsAttention(v.status)) : items;
    const ready = !loading && !error && items.length > 0;
    const flagged = items.filter(v => needsAttention(v.status)).length;
    return (
        <div className="a-panel a-vendors">
            <div className="a-panel-header">
                <Truck size={16} />
                <span>Vendor &amp; Contract Status</span>
                {ready && flagged > 0 && <span className="a-badge a-badge-critical">{flagged} flagged</span>}
                {ready && (
                    <button
                        className={`a-panel-filter ${onlyAttention ? 'a-panel-filter--on' : ''}`}
                        onClick={() => setOnlyAttention(v => !v)}
                        aria-pressed={onlyAttention}
                        title="Show only vendors needing attention"
                    >
                        {onlyAttention ? 'Needs attention' : 'All vendors'}
                    </button>
                )}
                <DrillToStrata module="vendors" label="Vendors" />
            </div>
            <PanelStatus loading={loading} error={error} empty={items.length === 0} emptyLabel="No vendor associations" />
            {ready && (
                <div className="a-ops-list">
                    {shown.length === 0 && <div className="a-panel-state a-panel-state--empty">No flagged vendors</div>}
                    {shown.map(v => {
                        const due = v.contractEnd ? dueLabel(v.daysUntil) : { text: 'No term', cls: '' };
                        return (
                            <button
                                key={v.id}
                                className="a-ops-row"
                                onClick={() => openStrataModule('vendors')}
                                title={`${v.vendor} — ${v.status}`}
                            >
                                <span className={`a-vendor-status a-vstatus-${v.status}`}>{v.status}</span>
                                <span className="a-ops-title">{v.vendor}</span>
                                <span className={`a-ops-due ${due.cls}`}>{due.text}</span>
                                <ChevronRight size={13} className="a-ops-arrow" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════  FINANCE + RISK PANELS (Cycle 7)  ═══════ */

/** Compact USD formatter for the finance snapshot (K / M abbreviation). */
function fmtMoney(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
    return `${sign}$${abs.toFixed(0)}`;
}

const FINANCE_WINDOWS: { label: string; months: number }[] = [
    { label: '3mo', months: 3 },
    { label: '6mo', months: 6 },
    { label: '12mo', months: 12 },
    { label: '24mo', months: 24 },
];

/**
 * Financial Snapshot — NOI / revenue / expenses / occupancy over a horizon,
 * plus budget-vs-actual and AR delinquency. The date-range segmented control
 * re-fetches `fetchFinanceSnapshot` with the selected month window (forecast
 * figures scale with it); the 12-month view reuses the aggregate snapshot so
 * no extra fetch fires on first paint. `fetchSnapshot` is injectable for tests.
 */
function FinancialSnapshotPanel({
    snapshot, loading, error,
    fetchSnapshot = (m: number) => fetchFinanceSnapshot(undefined, m),
}: PanelProps & {
    snapshot: FinanceSnapshot | null;
    fetchSnapshot?: (months: number) => Promise<FinanceSnapshot>;
}) {
    const [months, setMonths] = useState(12);
    const [override, setOverride] = useState<FinanceSnapshot | null>(null);
    const [busy, setBusy] = useState(false);
    const view = override ?? snapshot;
    const ready = !loading && !error && view !== null;

    const selectWindow = (m: number) => {
        setMonths(m);
        if (m === 12) { setOverride(null); return; } // aggregate already = 12mo
        setBusy(true);
        fetchSnapshot(m)
            .then((s) => setOverride(s))
            .catch(() => { /* keep prior view on error */ })
            .finally(() => setBusy(false));
    };

    const variancePositive = (view?.budgetVariance ?? 0) >= 0;
    return (
        <div className="a-panel a-financials">
            <div className="a-panel-header">
                <Landmark size={16} />
                <span>Financial Snapshot</span>
                {ready && view!.delinquentCount > 0 && (
                    <span className="a-badge a-badge-critical">{view!.delinquentCount} delinquent</span>
                )}
                {ready && (
                    <div className="a-panel-segctl" role="group" aria-label="Finance horizon">
                        {FINANCE_WINDOWS.map(w => (
                            <button
                                key={w.months}
                                className={`a-panel-seg ${months === w.months ? 'a-panel-seg--on' : ''}`}
                                onClick={() => selectWindow(w.months)}
                                aria-pressed={months === w.months}
                                disabled={busy}
                                title={`Forecast over the next ${w.months} months`}
                            >
                                {w.label}
                            </button>
                        ))}
                    </div>
                )}
                <DrillToStrata module="forecast" label="Forecast" />
            </div>
            <PanelStatus loading={loading} error={error} empty={view === null} emptyLabel="No financial projection yet" />
            {ready && (
                <div className="a-finance-cards">
                    <div className="a-finance-card">
                        <span className="a-finance-label">NOI ({view!.months}mo)</span>
                        <span className="a-finance-value">{fmtMoney(view!.noi)}</span>
                        <span className={`a-finance-change a-trend-${view!.noi >= 0 ? 'up' : 'down'}`}>
                            {view!.noi >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            net
                        </span>
                    </div>
                    <div className="a-finance-card">
                        <span className="a-finance-label">Revenue</span>
                        <span className="a-finance-value">{fmtMoney(view!.revenue)}</span>
                        <span className="a-finance-change">{view!.occupancy}% occ</span>
                    </div>
                    <div className="a-finance-card">
                        <span className="a-finance-label">Expenses</span>
                        <span className="a-finance-value">{fmtMoney(view!.expenses)}</span>
                    </div>
                    <div className="a-finance-card">
                        <span className="a-finance-label">Budget vs Actual /mo</span>
                        <span className="a-finance-value">{fmtMoney(view!.bookedMonthlyRent)}</span>
                        <span className={`a-finance-change a-trend-${variancePositive ? 'up' : 'down'}`}>
                            {variancePositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {fmtMoney(view!.budgetVariance)} vs plan
                        </span>
                    </div>
                    <div className="a-finance-card">
                        <span className="a-finance-label">Delinquency</span>
                        <span className="a-finance-value">{fmtMoney(view!.delinquentAmount)}</span>
                        <span className="a-finance-change">{view!.delinquentCount} charge{view!.delinquentCount === 1 ? '' : 's'}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Risk Register — insurance lapses/expirations + incidents, severity-filterable. */
function RiskRegisterPanel({ items, loading, error }: PanelProps & { items: RiskRegisterItem[] }) {
    const [onlyHigh, setOnlyHigh] = useState(false);
    const shown = onlyHigh ? items.filter(r => r.severity === 'high') : items;
    const ready = !loading && !error && items.length > 0;
    const highCount = items.filter(r => r.severity === 'high').length;
    return (
        <div className="a-panel a-risk">
            <div className="a-panel-header">
                <ShieldAlert size={16} />
                <span>Risk Register</span>
                {ready && highCount > 0 && <span className="a-badge a-badge-critical">{highCount} high</span>}
                {ready && (
                    <button
                        className={`a-panel-filter ${onlyHigh ? 'a-panel-filter--on' : ''}`}
                        onClick={() => setOnlyHigh(v => !v)}
                        aria-pressed={onlyHigh}
                        title="Show only high-severity risks"
                    >
                        {onlyHigh ? 'High only' : 'All risks'}
                    </button>
                )}
                <DrillToStrata module="incidents" label="Incidents" />
            </div>
            <PanelStatus loading={loading} error={error} empty={items.length === 0} emptyLabel="No active risks" />
            {ready && (
                <div className="a-ops-list">
                    {shown.length === 0 && <div className="a-panel-state a-panel-state--empty">No high-severity risks</div>}
                    {shown.map(r => {
                        const due = r.date ? dueLabel(r.daysUntil) : { text: '', cls: '' };
                        return (
                            <button
                                key={r.id}
                                className="a-ops-row"
                                onClick={() => openStrataModule(r.category === 'incident' ? 'incidents' : 'compliance')}
                                title={`${r.title} — ${r.severity} (${r.status})`}
                            >
                                <span className={`a-risk-sev a-sev-${r.severity}`}>{r.severity}</span>
                                <span className="a-ops-title">{r.title}</span>
                                <span className="a-risk-status">{r.status}</span>
                                {due.text && <span className={`a-ops-due ${due.cls}`}>{due.text}</span>}
                                <ChevronRight size={13} className="a-ops-arrow" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════  HR SNAPSHOT  ═══════════════════════ */

/** HR snapshot — headcount / open roles / incidents + per-department roll-up.
 *  Clearly MOCK-labeled: no HR endpoint exists in the app today (Cycle-1 audit). */
function HrSnapshotPanel({ snapshot }: { snapshot: HrSnapshot | null }) {
    const hr = snapshot;
    return (
        <div className="a-panel a-hr">
            <div className="a-panel-header">
                <Users size={16} />
                <span>HR Snapshot</span>
                <MockBadge />
            </div>
            {hr === null ? (
                <div className="a-panel-state a-panel-state--empty">No HR data</div>
            ) : (
                <>
                    <div className="a-finance-cards a-hr-cards">
                        <div className="a-finance-card">
                            <span className="a-finance-label">Headcount</span>
                            <span className="a-finance-value">{hr.headcount}</span>
                        </div>
                        <div className="a-finance-card">
                            <span className="a-finance-label">Open Roles</span>
                            <span className="a-finance-value">{hr.openRoles}</span>
                        </div>
                        <div className="a-finance-card">
                            <span className="a-finance-label">Incidents</span>
                            <span className="a-finance-value">{hr.incidents}</span>
                        </div>
                        <div className="a-finance-card">
                            <span className="a-finance-label">Turnover (12mo)</span>
                            <span className="a-finance-value">{hr.turnoverRate}%</span>
                        </div>
                    </div>
                    <ul className="a-hr-depts">
                        {hr.departments.map(d => (
                            <li key={d.name} className="a-hr-dept">
                                <span className="a-hr-dept-name">{d.name}</span>
                                <span className="a-hr-dept-count">{d.headcount}</span>
                                {d.open > 0 && (
                                    <span className="a-hr-dept-open" title={`${d.open} open role${d.open === 1 ? '' : 's'}`}>
                                        +{d.open} open
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}

/* ═══════════════════════════  RESEARCH FEED (LLM)  ════════════════ */

/** Research feed — runs a market/regulatory briefing through the user's own
 *  LLM (per-user integrations). Graceful no-LLM state points to Settings.
 *  `runLlm` is injectable for tests (defaults to the real callLlm router). */
function ResearchFeedPanel({
    runLlm,
}: {
    runLlm?: (prompt: string, llm: ReturnType<typeof useIntegrations>['integrations']['llm']) => Promise<string | null>;
}) {
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);
    const [topic, setTopic] = useState('');
    const [result, setResult] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const invoke = runLlm ?? (async (prompt, llm) => {
        const res = await callLlm(
            { prompt, systemPrompt: RESEARCH_SYSTEM_PROMPT, maxTokens: 700, temperature: 0.4 },
            llm,
        );
        return res?.text ?? null;
    });

    const run = (rawTopic: string) => {
        const t = rawTopic.trim();
        if (!t || busy || !llmReady) return;
        setTopic(t);
        setBusy(true);
        setError(null);
        setResult(null);
        invoke(buildResearchPrompt(t), integrations.llm)
            .then((text) => {
                if (text && text.trim()) setResult(text.trim());
                else setError('The LLM returned no content. Try a different topic.');
            })
            .catch(() => setError('Research request failed. Check your LLM key in Settings → API Keys.'))
            .finally(() => setBusy(false));
    };

    return (
        <div className="a-panel a-research">
            <div className="a-panel-header">
                <Sparkles size={16} />
                <span>Research Feed</span>
                {llmReady
                    ? <span className="a-badge a-badge-ok">{integrations.llm.active}</span>
                    : <span className="a-badge a-badge-mock">No LLM</span>}
            </div>

            {!llmReady ? (
                <div className="a-research-nokey">
                    <Settings size={20} />
                    <p>Connect your own AI provider to run market &amp; regulatory research.</p>
                    <p className="a-research-hint">Open <strong>Settings → API Keys</strong> and enable a provider (Anthropic, OpenAI, Gemini, or a local model).</p>
                </div>
            ) : (
                <>
                    <form
                        className="a-research-form"
                        onSubmit={(e) => { e.preventDefault(); run(topic); }}
                    >
                        <label htmlFor="a-research-input" className="a-sr-only">Research topic</label>
                        <input
                            id="a-research-input"
                            className="a-research-input"
                            type="text"
                            value={topic}
                            placeholder="Ask about a market, regulation, or trend…"
                            onChange={(e) => setTopic(e.target.value)}
                            disabled={busy}
                        />
                        <button
                            type="submit"
                            className="a-research-go"
                            disabled={busy || !topic.trim()}
                            aria-label="Run research"
                        >
                            {busy ? <Clock size={14} /> : <Search size={14} />}
                        </button>
                    </form>

                    <div className="a-research-topics" role="group" aria-label="Suggested research topics">
                        {RESEARCH_TOPICS.map((qt) => (
                            <button
                                key={qt}
                                className="a-research-chip"
                                onClick={() => run(qt)}
                                disabled={busy}
                                title={qt}
                            >
                                {qt.length > 38 ? `${qt.slice(0, 38)}…` : qt}
                            </button>
                        ))}
                    </div>

                    {busy && <div className="a-panel-state a-panel-state--loading">Researching…</div>}
                    {error && <div className="a-panel-state a-panel-state--error">{error}</div>}
                    {result && !busy && (
                        <div className="a-research-result">
                            <div className="a-research-result-topic">{topic}</div>
                            <p className="a-research-result-body">{result}</p>
                            <span className="a-research-disclaimer">AI-generated via your {integrations.llm.active} key — verify before acting.</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/* ═══════════════════════════  ACTIVE WORKITEMS  ═══════════════════ */

function ActiveWorkitems({ items, loading, error }: PanelProps & { items: ActiveWorkitem[] }) {
    const [promoting, setPromoting] = useState<string | null>(null);
    const ready = !loading && !error && items.length > 0;

    const handlePromote = async (id: string) => {
        setPromoting(id);
        try {
            await fetch(`${API_BASE}/api/dwellium/workitems/${id}/promote`, { method: 'POST' });
        } catch { /* offline fallback */ }
        setTimeout(() => setPromoting(null), 1200);
    };

    return (
        <div className="a-card">
            <div className="a-card-header">
                <ClipboardList size={16} /> Active Workitems
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{items.length}</span>
            </div>
            <PanelStatus loading={loading} error={error} empty={items.length === 0} emptyLabel="No open workitems" />
            {ready && (
            <div className="a-card-body" style={{ padding: 0 }}>
                {items.map(wi => (
                    <div key={wi.id} style={{
                        padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                    }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                            background: wi.priority === 'critical' ? '#ef4444' : wi.priority === 'high' ? '#f59e0b' : '#94a3b8',
                        }} />
                        <span style={{ flex: 1, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {wi.title}
                        </span>
                        <span style={{
                            fontSize: 10, padding: '1px 5px', borderRadius: 3,
                            background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)',
                        }}>{wi.domain}</span>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 11, minWidth: 22 }}>{wi.age}</span>
                        <button
                            onClick={() => handlePromote(wi.id)}
                            title="Promote to Strata"
                            style={{
                                background: promoting === wi.id ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
                                border: 'none', borderRadius: 4, padding: '2px 6px',
                                color: promoting === wi.id ? '#22c55e' : '#64748b',
                                cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 2,
                                transition: 'all 0.2s',
                            }}
                        >
                            <ArrowUpRight size={10} /> {promoting === wi.id ? 'Promoted' : 'Promote'}
                        </button>
                    </div>
                ))}
            </div>
            )}
        </div>
    );
}

/* ═══════════════════════════  CROSS DOMAIN SNAPSHOTS  ═══════════════════ */

function CrossDomainSnapshots({ snapshots, loading, error }: PanelProps & { snapshots: DomainSnapshot[] }) {
    const ready = !loading && !error && snapshots.length > 0;
    const maxCount = snapshots.length > 0 ? Math.max(...snapshots.map(d => d.count)) : 1;
    return (
        <div className="a-card">
            <div className="a-card-header">
                <Globe size={16} /> Cross-Domain Snapshots
            </div>
            <PanelStatus loading={loading} error={error} empty={snapshots.length === 0} emptyLabel="No open items by domain" />
            {ready && (
            <div className="a-card-body" style={{ padding: '8px 14px' }}>
                {snapshots.map(d => (
                    <div key={d.domain} style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12,
                    }}>
                        <span style={{ minWidth: 80, color: 'var(--text-secondary)' }}>{d.domain}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                            <div style={{
                                width: `${(d.count / maxCount) * 100}%`, height: '100%',
                                borderRadius: 3, background: d.color, transition: 'width 0.5s',
                            }} />
                        </div>
                        <span style={{ minWidth: 20, color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{d.count}</span>
                        {d.critical > 0 && (
                            <span style={{
                                fontSize: 10, padding: '1px 4px', borderRadius: 3,
                                background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600,
                            }}>{d.critical} crit</span>
                        )}
                    </div>
                ))}
            </div>
            )}
        </div>
    );
}

/* ═══════════════════════════  QUICK ARBITRAGE (90-DAY)  ═══════════════════ */

const ARBITRAGE_OPPORTUNITIES: { id: string; title: string; roi: string; confidence: number; window: string; type: 'lease' | 'maintenance' | 'finance' | 'revenue' }[] = [];

const ARB_COLORS: Record<string, string> = {
    lease: '#3b82f6', maintenance: '#f97316', finance: '#22c55e', revenue: '#D6FE51',
};

function QuickArbitrage() {
    return (
        <div className="a-panel a-panel--glass">
            <h3 className="a-panel__title">⚡ 90-Day Quick Arbitrage <MockBadge /></h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ARBITRAGE_OPPORTUNITIES.map(opp => (
                    <div key={opp.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                        borderLeft: `3px solid ${ARB_COLORS[opp.type]}`,
                    }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>{opp.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                Window: {opp.window} • Confidence: {opp.confidence}%
                            </div>
                        </div>
                        <div style={{
                            background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                            padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                        }}>
                            {opp.roi}
                        </div>
                    </div>
                ))}
            </div>
            {ARBITRAGE_OPPORTUNITIES.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total potential: calculated</span>
                    <span>{ARBITRAGE_OPPORTUNITIES.length} opportunities identified</span>
                </div>
            )}
            {ARBITRAGE_OPPORTUNITIES.length === 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                    No opportunities identified yet.
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════  DOMAIN VIEWS  ═══════════════════ */

const DOMAIN_VIEWS: { id: string; name: string; module: string; filters: Record<string, any>; count: number; color: string }[] = [];

function DomainViews() {
    return (
        <div className="a-panel a-panel--glass">
            <h3 className="a-panel__title">🔍 Saved Domain Views <MockBadge /></h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {DOMAIN_VIEWS.map(view => (
                    <div key={view.id} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: `${view.color}11`, border: `1px solid ${view.color}33`,
                        cursor: 'pointer', transition: 'all 0.2s',
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: view.color }}>{view.name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{view.module}</span>
                            <span style={{
                                background: `${view.color}22`, color: view.color,
                                padding: '1px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                            }}>
                                {view.count}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ═══════════════════════════  PANEL REGISTRY  ═══════════════════ */

/** Human-readable title per panel id (controls + add-bar labels). */
const PANEL_META: Record<string, string> = {
    heatmap: 'Portfolio Heatmap',
    finance: 'Financial Quick-viz',
    domains: 'Cross-Domain Snapshots',
    watchdog: 'Watchdog List',
    workitems: 'Active Workitems',
    domainviews: 'Saved Domain Views',
    litigation: 'Litigation & Matters',
    maintenance: 'Maintenance Queue',
    leases: 'Lease Expirations',
    vendors: 'Vendor & Contract Status',
    calendar: 'Compliance Calendar',
    compliance: 'Compliance Tracker',
    financials: 'Financial Snapshot',
    risk: 'Risk Register',
    hr: 'HR Snapshot',
    research: 'Research Feed',
    agentlog: 'AI Agent Activity',
    arbitrage: '90-Day Quick Arbitrage',
};

type DashData = ReturnType<typeof useDashboardData>['data'];

/** Render a panel by its registry id, threading data + loading/error. */
function renderPanel(id: string, data: DashData, loading: boolean, error: string | null): React.ReactNode {
    switch (id) {
        case 'heatmap': return <PortfolioHeatmap properties={data?.heatmap ?? []} loading={loading} error={error} />;
        case 'finance': return <FinancialQuickViz cards={data?.financialCards ?? []} loading={loading} error={error} />;
        case 'domains': return <CrossDomainSnapshots snapshots={data?.domainSnapshots ?? []} loading={loading} error={error} />;
        case 'watchdog': return <WatchdogList items={data?.watchdog ?? []} loading={loading} error={error} />;
        case 'workitems': return <ActiveWorkitems items={data?.activeWorkitems ?? []} loading={loading} error={error} />;
        case 'domainviews': return <DomainViews />;
        case 'litigation': return <LitigationTracker matters={data?.legalMatters ?? []} loading={loading} error={error} />;
        case 'maintenance': return <MaintenanceQueue items={data?.maintenanceQueue ?? []} loading={loading} error={error} />;
        case 'leases': return <LeaseExpirations items={data?.leaseExpirations ?? []} loading={loading} error={error} />;
        case 'vendors': return <VendorStatusPanel items={data?.vendorStatus ?? []} loading={loading} error={error} />;
        case 'compliance': return <ComplianceTracker items={data?.complianceItems ?? []} loading={loading} error={error} />;
        case 'financials': return <FinancialSnapshotPanel snapshot={data?.financeSnapshot ?? null} loading={loading} error={error} />;
        case 'risk': return <RiskRegisterPanel items={data?.riskRegister ?? []} loading={loading} error={error} />;
        case 'hr': return <HrSnapshotPanel snapshot={data?.hr ?? null} />;
        case 'research': return <ResearchFeedPanel />;
        case 'calendar': return <ComplianceCalendar events={data?.calendarEvents ?? []} loading={loading} error={error} />;
        case 'agentlog': return <AIAgentLog entries={data?.agentLog ?? []} loading={loading} error={error} />;
        case 'arbitrage': return <QuickArbitrage />;
        default: return null;
    }
}

/* ═══════════════════════════  COMPOSABILITY  ═══════════════════ */

/**
 * Wraps a panel; in edit mode overlays move (←↑↓→) + hide controls. In normal
 * mode renders the panel bare (default UX is byte-unchanged from Cycle 3).
 * Buttons (not drag-drop) keep the feature keyboard-accessible + dependency-
 * free (Cycle 9 a11y groundwork).
 */
function PanelFrame({ id, column, editing, layout, onMove, onHide, children }: {
    id: string;
    column: DashboardColumn;
    editing: boolean;
    layout: DashboardLayout;
    onMove: (id: string, dir: MoveDirection) => void;
    onHide: (id: string) => void;
    children: React.ReactNode;
}) {
    if (!editing) return <>{children}</>;
    const col = layout.columns[column];
    const idx = col.indexOf(id);
    const title = PANEL_META[id] ?? id;
    return (
        <div className="a-panel-frame">
            <div className="a-panel-controls" role="group" aria-label={`Layout controls for ${title}`}>
                <button className="a-panel-ctrl" disabled={column === 'left'} aria-label={`Move ${title} to previous column`} title="Move left" onClick={() => onMove(id, 'left')}><ChevronLeft size={13} /></button>
                <button className="a-panel-ctrl" disabled={idx <= 0} aria-label={`Move ${title} up`} title="Move up" onClick={() => onMove(id, 'up')}><ChevronUp size={13} /></button>
                <button className="a-panel-ctrl" disabled={idx >= col.length - 1} aria-label={`Move ${title} down`} title="Move down" onClick={() => onMove(id, 'down')}><ChevronDown size={13} /></button>
                <button className="a-panel-ctrl" disabled={column === 'right'} aria-label={`Move ${title} to next column`} title="Move right" onClick={() => onMove(id, 'right')}><ChevronRight size={13} /></button>
                <button className="a-panel-ctrl a-panel-ctrl--hide" aria-label={`Hide ${title}`} title="Hide panel" onClick={() => onHide(id)}><X size={13} /></button>
            </div>
            {children}
        </div>
    );
}

/* ═══════════════════════════  MAIN COMPONENT  ═══════════════════ */

function DashboardContent({ data, loading, error, layout, editing, onMove, onHide, onShow }: {
    data: DashData;
    loading: boolean;
    error: string | null;
    layout: DashboardLayout;
    editing: boolean;
    onMove: (id: string, dir: MoveDirection) => void;
    onHide: (id: string) => void;
    onShow: (id: string) => void;
}) {
    return (
        <>
            {editing && (
                <div className="a-layout-addbar" role="group" aria-label="Hidden panels">
                    <span className="a-layout-addbar-label">Hidden panels:</span>
                    {layout.hidden.length === 0 && <span className="a-layout-addbar-empty">none</span>}
                    {layout.hidden.map(id => (
                        <button key={id} className="a-layout-addbtn" onClick={() => onShow(id)} aria-label={`Add ${PANEL_META[id] ?? id} to dashboard`}>
                            <Plus size={12} /> {PANEL_META[id] ?? id}
                        </button>
                    ))}
                </div>
            )}
            <div className="a-dashboard-grid">
                {DASHBOARD_COLUMNS.map(col => (
                    <div key={col} className={`a-grid-${col}`}>
                        {layout.columns[col].map(id => (
                            <PanelFrame key={id} id={id} column={col} editing={editing} layout={layout} onMove={onMove} onHide={onHide}>
                                {renderPanel(id, data, loading, error)}
                            </PanelFrame>
                        ))}
                        {editing && layout.columns[col].length === 0 && (
                            <div className="a-grid-empty">Empty — move a panel here</div>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}

/* ═══════════════════════════  GLOBAL FILTER BAR (Cycle 9)  ═══════════ */

/**
 * Dashboard-wide filter bar: a text quick-filter + an "Attention only" toggle
 * that narrow EVERY list panel at once (applied centrally via
 * `applyGlobalFilters` in the parent). Both default to a no-op so the bar is
 * fully reversible. A live match count + Clear affordance keep the active
 * filter state legible. All controls carry discernible text / aria-labels for
 * WCAG 2.0 AA 4.1.2 (axe `button-name` / labelled input).
 */
function GlobalFilterBar({ filters, onChange, matchCount, totalCount }: {
    filters: GlobalFilters;
    onChange: (next: GlobalFilters) => void;
    matchCount: number;
    totalCount: number;
}) {
    const active = filtersActive(filters);
    return (
        <div className="a-filterbar" role="search" aria-label="Filter dashboard panels">
            <div className="a-filterbar-field">
                <Search size={14} className="a-filterbar-icon" aria-hidden="true" />
                <label htmlFor="a-global-filter" className="a-sr-only">Filter panels by keyword</label>
                <input
                    id="a-global-filter"
                    className="a-filterbar-input"
                    type="text"
                    value={filters.query}
                    placeholder="Filter all panels — property, tenant, vendor, matter…"
                    onChange={(e) => onChange({ ...filters, query: e.target.value })}
                />
                {filters.query && (
                    <button
                        type="button"
                        className="a-filterbar-clearq"
                        onClick={() => onChange({ ...filters, query: '' })}
                        aria-label="Clear keyword filter"
                        title="Clear keyword"
                    >
                        <X size={13} />
                    </button>
                )}
            </div>
            <button
                type="button"
                className={`a-filterbar-toggle ${filters.attentionOnly ? 'a-filterbar-toggle--on' : ''}`}
                onClick={() => onChange({ ...filters, attentionOnly: !filters.attentionOnly })}
                aria-pressed={filters.attentionOnly}
                title="Show only items needing attention (high priority, at-risk, overdue)"
            >
                <AlertTriangle size={13} /> Attention only
            </button>
            {active && (
                <>
                    <span className="a-filterbar-count" role="status" aria-live="polite">
                        {matchCount} of {totalCount} items
                    </span>
                    <button
                        type="button"
                        className="a-filterbar-clear"
                        onClick={() => onChange(EMPTY_FILTERS)}
                        aria-label="Clear all dashboard filters"
                    >
                        Clear
                    </button>
                </>
            )}
        </div>
    );
}

const TABS: { id: AstraTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { id: 'workspace', label: 'Workspace', icon: <Wrench size={16} /> },
    { id: 'channels', label: 'Channels', icon: <MessageSquare size={16} /> },
    { id: 'intelligence', label: 'Intelligence', icon: <Brain size={16} /> },
    { id: 'observability', label: 'Observability', icon: <Eye size={16} /> },
];

export default function AstraDashboard() {
    const [activeTab, setActiveTab] = useState<AstraTab>('dashboard');
    const [editing, setEditing] = useState(false);
    const [filters, setFilters] = useState<GlobalFilters>(EMPTY_FILTERS);
    const { data, loading, error, reload } = useDashboardData();
    const { layout, hidePanel, showPanel, movePanel } = useDashboardLayout();

    // Centrally narrow the data for every panel; a no-op (same reference) when
    // no filter is active, so the unfiltered dashboard is byte-identical.
    const filteredData = applyGlobalFilters(data, filters);

    // Roving-focus refs for the WAI-ARIA tablist keyboard pattern.
    const tabRefs = useRef<Partial<Record<AstraTab, HTMLButtonElement | null>>>({});
    const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
        let next = index;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % TABS.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + TABS.length) % TABS.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = TABS.length - 1;
        else return;
        e.preventDefault();
        const nextId = TABS[next].id;
        setActiveTab(nextId);
        tabRefs.current[nextId]?.focus();
    };

    const renderTab = () => {
        switch (activeTab) {
            case 'dashboard': return (
                <DashboardContent
                    data={filteredData} loading={loading} error={error}
                    layout={layout} editing={editing}
                    onMove={movePanel} onHide={hidePanel} onShow={showPanel}
                />
            );
            case 'workspace': return <AstraWorkspace />;
            case 'channels': return <ThreadChannels />;
            case 'intelligence': return <IntelligenceDashboard />;
            case 'observability': return <ObservabilityPanel />;
        }
    };

    return (
        <div className="astra-dashboard">
            <div className="a-topbar">
                <div className="a-topbar-brand">
                    <span className="a-brand-icon">◈</span>
                    <span className="a-brand-name">Astra</span>
                    <span className="a-brand-tag">Executive Layer</span>
                </div>
                <div className="a-topbar-tabs">
                    <div className="a-tablist" role="tablist" aria-label="Astra dashboard views">
                        {TABS.map((tab, i) => (
                            <button
                                key={tab.id}
                                ref={(el) => { tabRefs.current[tab.id] = el; }}
                                id={`a-tab-${tab.id}`}
                                role="tab"
                                aria-selected={activeTab === tab.id}
                                aria-controls="a-tabpanel"
                                tabIndex={activeTab === tab.id ? 0 : -1}
                                className={`a-tab ${activeTab === tab.id ? 'a-tab-active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                                onKeyDown={(e) => onTabKeyDown(e, i)}
                            >
                                {tab.icon}
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                    {activeTab === 'dashboard' && (
                        <button
                            className={`a-tab a-tab-edit ${editing ? 'a-tab-active' : ''}`}
                            onClick={() => setEditing(e => !e)}
                            aria-pressed={editing}
                            aria-label={editing ? 'Finish editing dashboard layout' : 'Edit dashboard layout'}
                            title="Add, remove or rearrange panels"
                        >
                            <Settings2 size={16} />
                            <span>{editing ? 'Done' : 'Edit'}</span>
                        </button>
                    )}
                    {activeTab === 'dashboard' && (
                        <button
                            className="a-tab a-tab-refresh"
                            onClick={reload}
                            disabled={loading}
                            aria-label="Refresh dashboard data"
                            title="Refresh dashboard data"
                        >
                            <RefreshCw size={16} className={loading ? 'a-panel-state-spin' : undefined} />
                        </button>
                    )}
                </div>
            </div>
            {activeTab === 'dashboard' && (
                <GlobalFilterBar
                    filters={filters}
                    onChange={setFilters}
                    matchCount={visibleRowCount(filteredData)}
                    totalCount={visibleRowCount(data)}
                />
            )}
            <div className="a-content" id="a-tabpanel" role="tabpanel" aria-labelledby={`a-tab-${activeTab}`}>
                {renderTab()}
            </div>
        </div>
    );
}
