/**
 * AstraDashboard — Executive-tier dashboard with Portfolio Heatmap,
 * Watchdog List, Financial Quick-viz, Compliance Calendar, AI Agent Log.
 * Houses 5 tabs: Dashboard, Workspace, Channels, Intelligence, Observability.
 */
import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../config';
import {
    LayoutDashboard, Wrench, MessageSquare,
    Building2, AlertTriangle, DollarSign,
    CalendarCheck, Bot, ChevronRight, Clock,
    TrendingUp, TrendingDown, Activity, Brain, Eye,
    ClipboardList, ArrowUpRight, Globe, Layers
} from 'lucide-react';
import AstraWorkspace from './AstraWorkspace';
import ThreadChannels from './ThreadChannels';
import IntelligenceDashboard from './IntelligenceDashboard';
import ObservabilityPanel from './ObservabilityPanel';
import './AstraDashboard.css';
import './IntelligenceDashboard.css';

type AstraTab = 'dashboard' | 'workspace' | 'channels' | 'intelligence' | 'observability';

/* ═══════════════════════════  MOCK DATA  ═══════════════════════════ */

const HEATMAP_PROPERTIES: { name: string; occupancy: number; delinquency: number; maintenance: number }[] = [];

const WATCHDOG_ITEMS: { id: string; title: string; priority: string; due: string; status: string; property: string }[] = [];

const FINANCIAL_CARDS: { label: string; value: string; change: string; trend: 'up' | 'down' }[] = [];

const CALENDAR_EVENTS: { day: number; type: string; label: string }[] = [];

const AGENT_LOG: { time: string; agent: string; action: string; type: string }[] = [];

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

function PortfolioHeatmap() {
    return (
        <div className="a-panel a-heatmap">
            <div className="a-panel-header">
                <Building2 size={16} />
                <span>Portfolio Heatmap</span>
            </div>
            <div className="a-heatmap-grid">
                <div className="a-heatmap-header">
                    <span className="a-heatmap-label">Property</span>
                    <span className="a-heatmap-metric">Occupancy</span>
                    <span className="a-heatmap-metric">Delinq.</span>
                    <span className="a-heatmap-metric">Maint.</span>
                </div>
                {HEATMAP_PROPERTIES.map(p => (
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
        </div>
    );
}

function WatchdogList() {
    return (
        <div className="a-panel a-watchdog">
            <div className="a-panel-header">
                <AlertTriangle size={16} />
                <span>Watchdog List</span>
                <span className="a-badge a-badge-critical">{WATCHDOG_ITEMS.filter(w => w.priority === 'critical').length} Critical</span>
            </div>
            <div className="a-watchdog-list">
                {WATCHDOG_ITEMS.map(item => (
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
        </div>
    );
}

function FinancialQuickViz() {
    return (
        <div className="a-panel a-finance">
            <div className="a-panel-header">
                <DollarSign size={16} />
                <span>Financial Quick-viz</span>
            </div>
            <div className="a-finance-cards">
                {FINANCIAL_CARDS.map(card => (
                    <div key={card.label} className="a-finance-card">
                        <span className="a-finance-label">{card.label}</span>
                        <span className="a-finance-value">{card.value}</span>
                        <span className={`a-finance-change a-trend-${card.trend}`}>
                            {card.trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {card.change}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ComplianceCalendar() {
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
            <div className="a-calendar-grid">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={i} className="a-cal-day-label">{d}</span>
                ))}
                {cells.map((day, i) => {
                    const evts = day ? CALENDAR_EVENTS.filter(e => e.day === day) : [];
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
        </div>
    );
}

function AIAgentLog() {
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
            <div className="a-agent-feed">
                {AGENT_LOG.map((entry, i) => (
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
        </div>
    );
}

/* ═══════════════════════════  ACTIVE WORKITEMS  ═══════════════════ */

const ACTIVE_WORKITEMS: { id: string; title: string; priority: string; domain: string; age: string }[] = [];

function ActiveWorkitems() {
    const [promoting, setPromoting] = useState<string | null>(null);

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
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#818cf8', fontWeight: 700 }}>{ACTIVE_WORKITEMS.length}</span>
            </div>
            <div className="a-card-body" style={{ padding: 0 }}>
                {ACTIVE_WORKITEMS.map(wi => (
                    <div key={wi.id} style={{
                        padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                    }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                            background: wi.priority === 'critical' ? '#ef4444' : wi.priority === 'high' ? '#f59e0b' : '#94a3b8',
                        }} />
                        <span style={{ flex: 1, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {wi.title}
                        </span>
                        <span style={{
                            fontSize: 10, padding: '1px 5px', borderRadius: 3,
                            background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                        }}>{wi.domain}</span>
                        <span style={{ color: '#64748b', fontSize: 11, minWidth: 22 }}>{wi.age}</span>
                        <button
                            onClick={() => handlePromote(wi.id)}
                            title="Promote to Strata"
                            style={{
                                background: promoting === wi.id ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
                                border: 'none', borderRadius: 4, padding: '2px 6px',
                                color: promoting === wi.id ? '#10b981' : '#64748b',
                                cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 2,
                                transition: 'all 0.2s',
                            }}
                        >
                            <ArrowUpRight size={10} /> {promoting === wi.id ? 'Promoted' : 'Promote'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ═══════════════════════════  CROSS DOMAIN SNAPSHOTS  ═══════════════════ */

const DOMAIN_SNAPSHOTS: { domain: string; count: number; critical: number; color: string }[] = [];

function CrossDomainSnapshots() {
    const maxCount = DOMAIN_SNAPSHOTS.length > 0 ? Math.max(...DOMAIN_SNAPSHOTS.map(d => d.count)) : 1;
    return (
        <div className="a-card">
            <div className="a-card-header">
                <Globe size={16} /> Cross-Domain Snapshots
            </div>
            <div className="a-card-body" style={{ padding: '8px 14px' }}>
                {DOMAIN_SNAPSHOTS.map(d => (
                    <div key={d.domain} style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12,
                    }}>
                        <span style={{ minWidth: 80, color: '#94a3b8' }}>{d.domain}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                            <div style={{
                                width: `${(d.count / maxCount) * 100}%`, height: '100%',
                                borderRadius: 3, background: d.color, transition: 'width 0.5s',
                            }} />
                        </div>
                        <span style={{ minWidth: 20, color: '#e2e8f0', fontWeight: 600, textAlign: 'right' }}>{d.count}</span>
                        {d.critical > 0 && (
                            <span style={{
                                fontSize: 10, padding: '1px 4px', borderRadius: 3,
                                background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600,
                            }}>{d.critical} crit</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ═══════════════════════════  QUICK ARBITRAGE (90-DAY)  ═══════════════════ */

const ARBITRAGE_OPPORTUNITIES: { id: string; title: string; roi: string; confidence: number; window: string; type: 'lease' | 'maintenance' | 'finance' | 'revenue' }[] = [];

const ARB_COLORS: Record<string, string> = {
    lease: '#3b82f6', maintenance: '#f97316', finance: '#10b981', revenue: '#8b5cf6',
};

function QuickArbitrage() {
    return (
        <div className="a-panel a-panel--glass">
            <h3 className="a-panel__title">⚡ 90-Day Quick Arbitrage</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ARBITRAGE_OPPORTUNITIES.map(opp => (
                    <div key={opp.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                        borderLeft: `3px solid ${ARB_COLORS[opp.type]}`,
                    }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>{opp.title}</div>
                            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
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
                <div style={{ marginTop: 10, fontSize: 11, color: '#555', textAlign: 'center' }}>
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
            <h3 className="a-panel__title">🔍 Saved Domain Views</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {DOMAIN_VIEWS.map(view => (
                    <div key={view.id} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: `${view.color}11`, border: `1px solid ${view.color}33`,
                        cursor: 'pointer', transition: 'all 0.2s',
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: view.color }}>{view.name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: '#888' }}>{view.module}</span>
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

/* ═══════════════════════════  MAIN COMPONENT  ═══════════════════ */

function DashboardContent() {
    return (
        <div className="a-dashboard-grid">
            <div className="a-grid-left">
                <PortfolioHeatmap />
                <FinancialQuickViz />
                <CrossDomainSnapshots />
            </div>
            <div className="a-grid-center">
                <WatchdogList />
                <ActiveWorkitems />
                <DomainViews />
            </div>
            <div className="a-grid-right">
                <ComplianceCalendar />
                <AIAgentLog />
                <QuickArbitrage />
            </div>
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

    const renderTab = () => {
        switch (activeTab) {
            case 'dashboard': return <DashboardContent />;
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
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`a-tab ${activeTab === tab.id ? 'a-tab-active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="a-content">
                {renderTab()}
            </div>
        </div>
    );
}
