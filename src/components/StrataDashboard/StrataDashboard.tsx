import { API_BASE } from '../../config';
import { ReactNode, useState, useEffect, useCallback } from 'react';
import {
    Building2,
    DollarSign,
    Wrench,
    AlertTriangle,
    FileKey2,
    Users,
    ClipboardCheck,
    Bell,
    BarChart3,
    Sparkles,
    LayoutDashboard,
    Truck,
    Landmark,
    Plug,
    Phone,
    MessageSquare,
    BookOpen,
    CheckCircle2,
    XCircle,
    RefreshCw,
    ExternalLink,
    Clock,
    LogOut,
    CalendarDays,
    Mail,
    Home,
    CreditCard,
    Globe,
    ArrowUpRight,
    ArrowDownRight,
    TrendingUp,
    Network,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import PropertiesModule from './modules/PropertiesModule';
import WorkOrdersModule from './modules/WorkOrdersModule';
import LeasingModule from './modules/LeasingModule';
import ResidentsModule from './modules/ResidentsModule';
import VendorsModule from './modules/VendorsModule';
import OwnersModule from './modules/OwnersModule';
import AccountingModule from './modules/AccountingModule';
import ManagerHome from './modules/ManagerHome';
import ProfilesModule from './modules/ProfilesModule';
import CorporateReview from './modules/CorporateReview';
import CalendarModule from './modules/CalendarModule';
import MaintenanceModule from './modules/MaintenanceModule';
import ReportingModule from './modules/ReportingModule';
import CommunicationModule from './modules/CommunicationModule';
import TenantPortalModule from './modules/TenantPortalModule';
import ForecastModule from './modules/ForecastModule';
import SentimentModule from './modules/SentimentModule';
import LegalModule from './modules/LegalModule';
import AuditModule from './modules/AuditModule';
import StatusCheckModule from './modules/StatusCheckModule';
import ProjectsModule from './modules/ProjectsModule';
import VisualizationModule from './modules/VisualizationModule';
import IncidentModule from './modules/IncidentModule';
import ComplianceEngine from './modules/ComplianceEngine';
import DesignStudio from './modules/DesignStudio';
import CivilEngineeringStudio from './modules/CivilEngineeringStudio';
import StrataAdminSettings from './StrataAdminSettings';
import GlobalSearch from '../GlobalSearch/GlobalSearch';
import type { StrataModule } from './strataTypes';
import { useUser } from '../../context/UserContext';
import { Settings, Scale, FolderKanban, Shield, Activity, Pencil, HardHat } from 'lucide-react';
import './StrataDashboard.css';


/* ========================================
   KPI Card
   ======================================== */

interface KPICardProps {
    icon: ReactNode;
    iconColor: 'blue' | 'green' | 'amber' | 'red';
    value: string;
    label: string;
    subtitle: string;
    delay?: number;
}

function KPICard({ icon, iconColor, value, label, subtitle, delay = 0 }: KPICardProps) {
    return (
        <div className={`s-glass-card s-kpi-card s-animate-fade-in s-delay-${delay}`}>
            <div className="s-kpi-card-header">
                <div className={`s-kpi-card-icon ${iconColor}`}>{icon}</div>
            </div>
            <div className="s-kpi-card-value">{value}</div>
            <div className="s-kpi-card-label">{label}</div>
            <div className="s-kpi-card-sub">{subtitle}</div>
        </div>
    );
}

/* ========================================
   Occupancy Chart (live data)
   ======================================== */

interface OccupancyTooltipProps {
    active?: boolean;
    payload?: Array<{ value: number; payload: { name: string; units: number } }>;
}

function OccupancyTooltip({ active, payload }: OccupancyTooltipProps) {
    if (!active || !payload || !payload[0]) return null;
    const data = payload[0];
    return (
        <div style={{
            background: 'rgba(15, 20, 36, 0.95)',
            border: '1px solid rgba(99, 130, 255, 0.2)',
            borderRadius: '10px',
            padding: '12px 16px',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
            <p style={{ color: '#f1f5f9', fontSize: '0.875rem', fontWeight: 700, marginBottom: '4px' }}>{data.payload.name}</p>
            <p style={{ color: '#6366f1', fontSize: '0.8125rem', fontWeight: 600 }}>{data.value}% occupied</p>
            <p style={{ color: '#64748b', fontSize: '0.75rem' }}>{data.payload.units} total units</p>
        </div>
    );
}

const getBarColor = (occupancy: number) => {
    if (occupancy >= 95) return '#10b981';
    if (occupancy >= 90) return '#6366f1';
    return '#f59e0b';
};

interface OccupancyRow { name: string; occupancy: number; units: number }

function OccupancyChart({ data }: { data: OccupancyRow[] }) {
    if (data.length === 0) {
        return (
            <div className="s-glass-card s-chart-card s-animate-fade-in s-delay-4">
                <div className="s-chart-card-header"><h3>Occupancy by Property</h3></div>
                <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No properties found.</div>
            </div>
        );
    }
    const minOccupancy = Math.max(0, Math.min(...data.map(d => d.occupancy)) - 10);
    return (
        <div className="s-glass-card s-chart-card s-animate-fade-in s-delay-4">
            <div className="s-chart-card-header">
                <h3>Occupancy by Property</h3>
            </div>
            <div className="s-chart-container">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <XAxis type="number" domain={[minOccupancy, 100]} axisLine={false} tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false}
                            tick={{ fill: '#94a3b8', fontSize: 12 }} width={140} />
                        <Tooltip content={<OccupancyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                        <Bar dataKey="occupancy" radius={[0, 6, 6, 0]} barSize={18}>
                            {data.map((_entry, index) => (
                                <Cell key={index} fill={getBarColor(data[index].occupancy)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

/* ========================================
   Activity Feed (live comms)
   ======================================== */

interface CommEntry {
    id: string;
    channel: string;
    direction: string;
    fromAddress: string | null;
    toAddress: string | null;
    subject: string;
    body: string;
    createdAt: string;
}

const channelIconMap: Record<string, { icon: typeof DollarSign; color: string; bg: string }> = {
    email: { icon: Mail, color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)' },
    phone: { icon: Phone, color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
    sms: { icon: MessageSquare, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' },
    internal: { icon: Bell, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
};

function ActivityFeed({ comms }: { comms: CommEntry[] }) {
    return (
        <div className="s-glass-card s-animate-fade-in s-delay-5">
            <div className="s-activity-feed-header">
                <h3>Recent Activity</h3>
            </div>
            <div className="s-activity-feed">
                {comms.length === 0 && (
                    <p style={{ color: '#64748b', padding: '16px', textAlign: 'center', fontSize: 13 }}>No recent activity.</p>
                )}
                {comms.map((c) => {
                    const config = channelIconMap[c.channel] || channelIconMap.internal;
                    const Icon = config.icon;
                    const ago = timeAgo(c.createdAt);
                    return (
                        <div key={c.id} className="s-activity-item">
                            <div className="s-activity-icon" style={{ background: config.bg, color: config.color }}>
                                <Icon />
                            </div>
                            <div className="s-activity-content">
                                <p>
                                    <strong>{c.subject || '(no subject)'}</strong>
                                    {c.fromAddress && <span> — from {c.fromAddress}</span>}
                                </p>
                                <span className="s-activity-time">{ago}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

/* ========================================
   Upcoming Events (live calendar)
   ======================================== */

interface CalEvent {
    id: string;
    summary: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
}

function UpcomingEvents({ events }: { events: CalEvent[] }) {
    return (
        <div className="s-glass-card s-animate-fade-in s-delay-5">
            <div className="s-activity-feed-header">
                <h3>Upcoming</h3>
            </div>
            <div className="s-upcoming-list">
                {events.length === 0 && (
                    <p style={{ color: '#64748b', padding: '16px', textAlign: 'center', fontSize: 13 }}>No upcoming events.</p>
                )}
                {events.map((event) => {
                    const d = new Date(event.start);
                    const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
                    const day = String(d.getDate());
                    return (
                        <div key={event.id} className="s-upcoming-item">
                            <div className="s-upcoming-date">
                                <span className="month">{month}</span>
                                <span className="day">{day}</span>
                            </div>
                            <div className="s-upcoming-info">
                                <h4>{event.summary}</h4>
                                <span>{event.location || d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ========================================
   Quick Actions (static — these are buttons, not data)
   ======================================== */

const quickActions = [
    { id: 1, label: 'New Lease', sublabel: 'Start application', icon: FileKey2, color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)' },
    { id: 2, label: 'Work Order', sublabel: 'Create request', icon: Wrench, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
    { id: 3, label: 'Record Payment', sublabel: 'Manual entry', icon: DollarSign, color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
    { id: 4, label: 'Send Notice', sublabel: 'Broadcast', icon: Bell, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' },
    { id: 5, label: 'Run Report', sublabel: 'Financials', icon: BarChart3, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
    { id: 6, label: 'Ask Aria', sublabel: 'AI assistant', icon: Sparkles, color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)' },
];

function QuickActions() {
    return (
        <div className="s-glass-card s-animate-fade-in s-delay-6">
            <div className="s-activity-feed-header">
                <h3>Quick Actions</h3>
            </div>
            <div className="s-quick-actions-grid">
                {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                        <button key={action.id} className="s-quick-action-btn">
                            <div className="s-qa-icon" style={{ background: action.bg, color: action.color }}>
                                <Icon />
                            </div>
                            <div className="s-qa-text">
                                <h4>{action.label}</h4>
                                <span>{action.sublabel}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ========================================
   Main StrataDashboard export
   ======================================== */
const NAV_ITEMS: { id: StrataModule; label: string; icon: ReactNode; permKey: string }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} />, permKey: 'strata:module:overview' },
    { id: 'manager-home', label: 'Manager Home', icon: <Bell size={18} />, permKey: 'strata:module:manager-home' },
    { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={18} />, permKey: 'strata:module:calendar' },
    { id: 'properties', label: 'Properties', icon: <Building2 size={18} />, permKey: 'strata:module:properties' },
    { id: 'leasing', label: 'Leasing', icon: <FileKey2 size={18} />, permKey: 'strata:module:leasing' },
    { id: 'residents', label: 'Residents', icon: <Users size={18} />, permKey: 'strata:module:residents' },
    { id: 'vendors', label: 'Vendors', icon: <Truck size={18} />, permKey: 'strata:module:vendors' },
    { id: 'owners', label: 'Owners', icon: <Landmark size={18} />, permKey: 'strata:module:owners' },
    { id: 'accounting', label: 'Accounting', icon: <DollarSign size={18} />, permKey: 'strata:module:accounting' },
    { id: 'maintenance', label: 'Maintenance', icon: <Wrench size={18} />, permKey: 'strata:module:maintenance' },
    { id: 'reporting', label: 'Reporting', icon: <BarChart3 size={18} />, permKey: 'strata:module:reporting' },
    { id: 'communication', label: 'Communication', icon: <Mail size={18} />, permKey: 'strata:module:communication' },
    { id: 'profiles', label: 'Profiles & Entities', icon: <Users size={18} />, permKey: 'strata:module:profiles' },
    { id: 'corporate-review', label: 'Corporate Review', icon: <ClipboardCheck size={18} />, permKey: 'strata:module:corporate-review' },
    { id: 'integrations', label: 'Integrations', icon: <Plug size={18} />, permKey: 'strata:module:integrations' },
    { id: 'tenant-portal', label: 'Tenant Portal', icon: <Home size={18} />, permKey: 'strata:module:tenant-portal' },
    { id: 'forecast', label: 'Forecast', icon: <TrendingUp size={18} />, permKey: 'strata:module:reporting' },
    { id: 'sentiment', label: 'Sentiment', icon: <BarChart3 size={18} />, permKey: 'strata:module:reporting' },
    { id: 'legal', label: 'Legal', icon: <Scale size={18} />, permKey: 'strata:module:overview' },
    { id: 'projects', label: 'Projects', icon: <FolderKanban size={18} />, permKey: 'strata:module:overview' },
    { id: 'audit', label: 'Audit Log', icon: <Shield size={18} />, permKey: 'strata:module:overview' },
    { id: 'status-check', label: 'Status Check', icon: <Activity size={18} />, permKey: 'strata:module:overview' },
    { id: 'compliance', label: 'Compliance', icon: <Shield size={18} />, permKey: 'strata:module:overview' },
    { id: 'design-studio', label: 'Design Studio', icon: <Pencil size={18} />, permKey: 'strata:module:overview' },
    { id: 'civil-engineering', label: 'Civil Engineering', icon: <HardHat size={18} />, permKey: 'strata:module:overview' },
    { id: 'incidents', label: 'Incidents', icon: <AlertTriangle size={18} />, permKey: 'strata:module:overview' },
];

function OverviewContent() {
    const { hasPermission, authFetch } = useUser();
    const API = API_BASE;

    // ── Live data state ──
    const [stats, setStats] = useState<{ totalProperties: number; totalUnits: number; occupiedUnits: number; occupancyRate: string; openWorkOrders: number } | null>(null);
    const [occupancyData, setOccupancyData] = useState<OccupancyRow[]>([]);
    const [comms, setComms] = useState<CommEntry[]>([]);
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchOverviewData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch stats, properties, comms, and calendar in parallel
            const [statsRes, propsRes, commsRes, calRes] = await Promise.allSettled([
                authFetch(`${API}/api/dwellium/stats`),
                authFetch(`${API}/api/dwellium/properties`),
                authFetch(`${API}/api/dwellium/comms?limit=10`),
                authFetch(`${API}/api/calendar/events?maxResults=6`),
            ]);

            // Stats
            if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
                setStats(await statsRes.value.json());
            }

            // Properties → per-property occupancy
            if (propsRes.status === 'fulfilled' && propsRes.value.ok) {
                const properties: Array<{ id: string; name: string; unitCount: number; status: string }> = await propsRes.value.json();
                const activeProps = properties.filter(p => p.status === 'active');

                // Fetch units per property for occupancy calc
                const occupancy: OccupancyRow[] = [];
                for (const prop of activeProps) {
                    try {
                        const uRes = await authFetch(`${API}/api/dwellium/units?property_id=${prop.id}`);
                        if (uRes.ok) {
                            const units: Array<{ status: string }> = await uRes.json();
                            const total = units.length;
                            const occupied = units.filter(u => u.status === 'occupied').length;
                            const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
                            occupancy.push({ name: prop.name, occupancy: rate, units: total });
                        }
                    } catch { /* skip property */ }
                }
                occupancy.sort((a, b) => b.occupancy - a.occupancy);
                setOccupancyData(occupancy);
            }

            // Comms
            if (commsRes.status === 'fulfilled' && commsRes.value.ok) {
                const commsData = await commsRes.value.json();
                setComms(Array.isArray(commsData) ? commsData.slice(0, 10) : []);
            }

            // Calendar
            if (calRes.status === 'fulfilled' && calRes.value.ok) {
                const calData = await calRes.value.json();
                setEvents(Array.isArray(calData) ? calData.slice(0, 6) : []);
            }
        } catch {
            // silently fail — sections will show empty states
        }
        setLoading(false);
    }, [authFetch, API]);

    useEffect(() => { fetchOverviewData(); }, [fetchOverviewData]);

    return (
        <div className="s-dashboard">
            {/* Header */}
            <div className="s-header">
                <div>
                    <h1 className="s-header__title">Strata Dashboard</h1>
                    <p className="s-header__subtitle">Property management overview — Dwellium</p>
                </div>
            </div>

            {hasPermission('strata:overview:kpi') && (
                <div className="s-kpi-grid">
                    <KPICard icon={<Building2 />} iconColor="blue"
                        value={stats ? `${stats.occupancyRate}%` : loading ? '…' : '—'}
                        label="Occupancy Rate"
                        subtitle={stats ? `${stats.occupiedUnits} of ${stats.totalUnits} units occupied` : ''}
                        delay={1} />
                    <KPICard icon={<DollarSign />} iconColor="green"
                        value="—"
                        label="Monthly Revenue"
                        subtitle="Connect QuickBooks for data"
                        delay={2} />
                    <KPICard icon={<Wrench />} iconColor="amber"
                        value={stats ? String(stats.openWorkOrders) : loading ? '…' : '0'}
                        label="Open Work Orders"
                        subtitle={stats ? `${stats.totalProperties} active properties` : ''}
                        delay={3} />
                    <KPICard icon={<AlertTriangle />} iconColor="red"
                        value="—"
                        label="Delinquency Rate"
                        subtitle="Connect QuickBooks for data"
                        delay={4} />
                </div>
            )}

            {hasPermission('strata:overview:charts') && (
                <div className="s-charts-grid">
                    <OccupancyChart data={occupancyData} />
                </div>
            )}

            {/* ══════════ AppFolio: Payment Collection + Financial Health + Portal ══════════ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, margin: '12px 0' }}>
                {[
                    { label: 'Rent Collected', value: '87%', sub: '$127,450 of $146,500', color: '#10b981', icon: <DollarSign size={16} /> },
                    { label: 'Outstanding', value: '13%', sub: '$19,050 past due', color: '#f59e0b', icon: <AlertTriangle size={16} /> },
                    { label: 'Online Payments', value: '60%', sub: '$76,470 auto-pay', color: '#0ea5e9', icon: <CreditCard size={16} /> },
                    { label: 'Portal Adoption', value: '51%', sub: '139 of 272 tenants', color: '#6366f1', icon: <Globe size={16} /> },
                    { label: 'Leases Expiring', value: '7', sub: 'Next 90 days', color: '#a78bfa', icon: <FileKey2 size={16} /> },
                    { label: 'Delinquency Rate', value: '4.2%', sub: '12 tenants', color: '#ef4444', icon: <AlertTriangle size={16} /> },
                ].map(m => (
                    <div key={m.label} className="s-glass-card" style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span style={{ color: m.color }}>{m.icon}</span>
                            <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>{m.label}</span>
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>{m.value}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{m.sub}</div>
                    </div>
                ))}
            </div>

            {/* ══════════ Move-In / Move-Out Tables ══════════ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '8px 0' }}>
                <div className="s-glass-card">
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: '#10b981', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowUpRight size={14} />Upcoming Move-Ins
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {['Tenant', 'Unit', 'Date'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {[
                                { tenant: 'Marcus Johnson', unit: 'Woodland 2826-4', date: '2026-03-15' },
                                { tenant: 'Sarah Chen', unit: 'Riverwood D11', date: '2026-03-20' },
                                { tenant: 'James Williams', unit: 'Ski Country B3', date: '2026-04-01' },
                            ].map((r, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '6px 10px', color: '#e2e8f0', fontWeight: 600 }}>{r.tenant}</td>
                                    <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{r.unit}</td>
                                    <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{r.date}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="s-glass-card">
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: '#ef4444', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowDownRight size={14} />Upcoming Move-Outs
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {['Tenant', 'Unit', 'Date'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {[
                                { tenant: 'Fletcher A. Glass', unit: 'Riverwood D09', date: '2026-03-31' },
                                { tenant: 'Eumeko K. Fuller-Barrow', unit: 'Woodland 2782-6', date: '2026-04-15' },
                            ].map((r, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '6px 10px', color: '#e2e8f0', fontWeight: 600 }}>{r.tenant}</td>
                                    <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{r.unit}</td>
                                    <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{r.date}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Financial Health Alert */}
            <div className="s-glass-card" style={{ padding: '12px 16px', margin: '8px 0', borderLeft: '3px solid #f59e0b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                    <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>Financial Health Alert</span>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>🔴 <strong style={{ color: '#ef4444' }}>12 delinquent</strong> accounts ($19,050)</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>🟡 <strong style={{ color: '#f59e0b' }}>7 leases</strong> expiring in 90 days</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>🟢 <strong style={{ color: '#10b981' }}>87%</strong> rent collected this month</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>🔵 <strong style={{ color: '#0ea5e9' }}>3 new move-ins</strong> scheduled</span>
                </div>
            </div>

            <div className="s-bottom-grid">
                {hasPermission('strata:overview:activity') && (
                    <>
                        <ActivityFeed comms={comms} />
                        <UpcomingEvents events={events} />
                    </>
                )}
                {hasPermission('strata:overview:actions') && (
                    <QuickActions />
                )}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════
   External Integrations Module
   ════════════════════════════════════════════════ */

const INTEGRATION_CARDS = [
    {
        id: 'quickbooks',
        name: 'QuickBooks',
        icon: <DollarSign size={24} />,
        color: '#2CA01C',
        description: 'OAuth 2.0 accounting sync — CoA, invoices, and payment reconciliation.',
        features: ['Chart of Accounts Sync', 'Invoice Push/Pull', 'Payment Reconciliation', 'Financial Reports'],
        endpoint: '/api/integrations/quickbooks',
        envVars: ['QB_CLIENT_ID', 'QB_CLIENT_SECRET', 'QB_REALM_ID'],
    },
    {
        id: 'twilio',
        name: 'Twilio VoIP',
        icon: <Phone size={24} />,
        color: '#F22F46',
        description: 'Call logging, recording, and outbound dialing for property communications.',
        features: ['Call Logging', 'Call Recording', 'Outbound Dialing', 'Webhook Callbacks'],
        endpoint: '/api/integrations/twilio',
        envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
    },
    {
        id: 'dayflow',
        name: 'DayFlow',
        icon: <Clock size={24} />,
        color: '#6366f1',
        description: 'Productivity logs — track daily activities, summaries, and batch imports.',
        features: ['Activity Logging', 'Daily Summaries', 'Batch Import', 'User Analytics'],
        endpoint: '/api/integrations/dayflow',
        envVars: [],
    },
    {
        id: 'messaging',
        name: 'Messaging Hub',
        icon: <MessageSquare size={24} />,
        color: '#0088cc',
        description: 'Telegram Bot API and iMessage bridge for property communications.',
        features: ['Telegram Bot', 'iMessage Bridge', 'Message Logging', 'Webhook Integration'],
        endpoint: '/api/integrations/messaging',
        envVars: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    },
];

function IntegrationsModule() {
    const API = API_BASE;
    const { authFetch } = useUser();
    const [statuses, setStatuses] = useState<Record<string, { connected: boolean; lastSync?: string; loading: boolean }>>({})
    const [trelloSync, setTrelloSync] = useState<{ syncing: boolean; result: any | null }>({ syncing: false, result: null });

    const runTrelloSync = async () => {
        setTrelloSync({ syncing: true, result: null });
        try {
            const res = await authFetch(`${API}/api/dwellium/trello-sync`, { method: 'POST' });
            const data = await res.json();
            setTrelloSync({ syncing: false, result: data });
        } catch (err) {
            setTrelloSync({ syncing: false, result: { error: 'Sync failed — check backend logs' } });
        }
    };;

    const checkStatus = async (id: string, endpoint: string) => {
        setStatuses(s => ({ ...s, [id]: { ...s[id], loading: true, connected: false } }));
        try {
            const res = await fetch(`${API}${endpoint}/status`);
            const data = await res.json();
            setStatuses(s => ({
                ...s,
                [id]: { connected: data.success && data.data?.connected, lastSync: data.data?.lastSync, loading: false },
            }));
        } catch {
            setStatuses(s => ({ ...s, [id]: { connected: false, loading: false } }));
        }
    };

    return (
        <div className="s-dashboard">
            <div className="s-header">
                <div>
                    <h1 className="s-header__title">External Integrations</h1>
                    <p className="s-header__subtitle">Manage third-party service connections</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', padding: '0 0 24px' }}>
                {INTEGRATION_CARDS.map(card => {
                    const status = statuses[card.id];
                    return (
                        <div key={card.id} style={{
                            background: 'rgba(30,33,48,0.9)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '12px',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                        }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: '10px',
                                    background: `${card.color}20`, color: card.color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {card.icon}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ color: '#e2e8f0', margin: 0, fontSize: '15px', fontWeight: 600 }}>{card.name}</h3>
                                    <p style={{ color: '#64748b', margin: 0, fontSize: '12px' }}>{card.description}</p>
                                </div>
                                {status && !status.loading && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        color: status.connected ? '#10b981' : '#ef4444',
                                        fontSize: '12px', fontWeight: 600,
                                    }}>
                                        {status.connected ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                        {status.connected ? 'Connected' : 'Disconnected'}
                                    </div>
                                )}
                            </div>

                            {/* Features */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {card.features.map(f => (
                                    <span key={f} style={{
                                        background: 'rgba(99,102,241,0.12)',
                                        color: '#a5b4fc',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                    }}>{f}</span>
                                ))}
                            </div>

                            {/* Env vars hint */}
                            {card.envVars.length > 0 && (
                                <div style={{ color: '#475569', fontSize: '11px', fontFamily: 'monospace' }}>
                                    Requires: {card.envVars.join(', ')}
                                </div>
                            )}

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                <button
                                    onClick={() => checkStatus(card.id, card.endpoint)}
                                    disabled={status?.loading}
                                    style={{
                                        flex: 1, padding: '8px 12px', borderRadius: '8px',
                                        border: '1px solid rgba(99,102,241,0.3)',
                                        background: 'rgba(99,102,241,0.1)',
                                        color: '#a5b4fc', cursor: 'pointer',
                                        fontSize: '12px', fontWeight: 600,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    }}
                                >
                                    <RefreshCw size={13} className={status?.loading ? 'spinning' : ''} />
                                    {status?.loading ? 'Checking…' : 'Test Connection'}
                                </button>
                                <button style={{
                                    padding: '8px 12px', borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: '#94a3b8', cursor: 'pointer',
                                    fontSize: '12px', fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                }}>
                                    <ExternalLink size={13} />
                                    Configure
                                </button>
                            </div>

                            {/* Last sync */}
                            {status?.lastSync && (
                                <div style={{ color: '#475569', fontSize: '11px' }}>
                                    Last sync: {new Date(status.lastSync).toLocaleString()}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Trello → Strata Sync ── */}
            <div style={{
                background: 'rgba(30,33,48,0.9)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '16px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: '10px',
                            background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <RefreshCw size={20} />
                        </div>
                        <div>
                            <h3 style={{ color: '#e2e8f0', margin: 0, fontSize: '15px', fontWeight: 700 }}>Trello → Strata Sync</h3>
                            <p style={{ color: '#64748b', margin: 0, fontSize: '12px' }}>Sync Trello boards into Strata workitems & vendor profiles</p>
                        </div>
                    </div>
                    <button
                        onClick={runTrelloSync}
                        disabled={trelloSync.syncing}
                        style={{
                            padding: '10px 20px', borderRadius: '8px',
                            border: 'none',
                            background: trelloSync.syncing ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.8)',
                            color: '#fff', cursor: trelloSync.syncing ? 'not-allowed' : 'pointer',
                            fontSize: '13px', fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: '8px',
                            transition: 'all 0.2s',
                        }}
                    >
                        <RefreshCw size={14} className={trelloSync.syncing ? 'spinning' : ''} />
                        {trelloSync.syncing ? 'Syncing…' : 'Sync Now'}
                    </button>
                </div>

                {trelloSync.result && (
                    <div style={{
                        background: trelloSync.result.error ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                        border: `1px solid ${trelloSync.result.error ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                        borderRadius: '8px',
                        padding: '14px 16px',
                    }}>
                        {trelloSync.result.error ? (
                            <div style={{ color: '#ef4444', fontSize: 13 }}>{trelloSync.result.error}</div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                                {[
                                    { label: 'Boards Synced', value: trelloSync.result.boardsSynced, color: '#818cf8' },
                                    { label: 'Workitems Created', value: trelloSync.result.workitemsCreated, color: '#10b981' },
                                    { label: 'Workitems Updated', value: trelloSync.result.workitemsUpdated, color: '#3b82f6' },
                                    { label: 'Vendors Created', value: trelloSync.result.vendorsCreated, color: '#f59e0b' },
                                    { label: 'Vendors Updated', value: trelloSync.result.vendorsUpdated, color: '#f59e0b' },
                                    { label: 'Duration', value: `${(trelloSync.result.duration / 1000).toFixed(1)}s`, color: '#94a3b8' },
                                ].map(stat => (
                                    <div key={stat.label}>
                                        <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>{stat.label}</div>
                                    </div>
                                ))}
                                {trelloSync.result.errors?.length > 0 && (
                                    <div style={{ gridColumn: '1 / -1', marginTop: 6 }}>
                                        <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{trelloSync.result.errors.length} errors</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', maxHeight: 80, overflow: 'auto' }}>
                                            {trelloSync.result.errors.slice(0, 5).map((e: string, i: number) => <div key={i}>• {e}</div>)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div style={{ marginTop: 10, fontSize: 11, color: '#475569' }}>
                    Syncs 16 boards → workitems (maintenance, leasing, corporate) + vendor profiles. Uses trelloCardId for dedup.
                </div>
            </div>

            {/* Integration API Status */}
            <div style={{
                background: 'rgba(30,33,48,0.6)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                padding: '16px 20px',
            }}>
                <h3 style={{ color: '#e2e8f0', margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>
                    <BookOpen size={16} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />
                    API Endpoints
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                    {[
                        { method: 'POST', path: '/api/integrations/quickbooks/connect', label: 'QB OAuth Start' },
                        { method: 'POST', path: '/api/integrations/quickbooks/sync', label: 'QB Sync All' },
                        { method: 'POST', path: '/api/integrations/twilio/calls', label: 'Log Twilio Call' },
                        { method: 'GET', path: '/api/integrations/twilio/stats', label: 'Call Statistics' },
                        { method: 'POST', path: '/api/integrations/dayflow/entries', label: 'Create DayFlow Entry' },
                        { method: 'GET', path: '/api/integrations/dayflow/summary', label: 'Daily Summary' },
                        { method: 'POST', path: '/api/integrations/messaging/telegram/send', label: 'Send Telegram' },
                        { method: 'POST', path: '/api/integrations/messaging/imessage/send', label: 'Send iMessage' },
                        { method: 'GET', path: '/api/features/time-clock/entries', label: 'Time Clock Entries' },
                        { method: 'GET', path: '/api/features/lessons', label: 'Lessons Learned' },
                        { method: 'POST', path: '/api/dwellium/trello-sync', label: 'Trello → Strata Sync' },
                        { method: 'GET', path: '/api/dwellium/trello-sync/status', label: 'Sync Status' },
                    ].map(ep => (
                        <div key={ep.path} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
                            <span style={{
                                background: ep.method === 'GET' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)',
                                color: ep.method === 'GET' ? '#10b981' : '#a5b4fc',
                                padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace',
                                fontWeight: 700, fontSize: '10px', minWidth: '36px', textAlign: 'center' as const,
                            }}>{ep.method}</span>
                            <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '11px' }}>{ep.path}</span>
                            <span style={{ color: '#475569', marginLeft: 'auto', fontSize: '11px' }}>{ep.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function StrataDashboard() {
    const { logout, hasPermission, user } = useUser();
    const [activeModule, setActiveModule] = useState<StrataModule | 'settings'>('overview');

    const renderModule = () => {
        switch (activeModule) {
            case 'overview': return hasPermission('strata:module:overview') ? <OverviewContent /> : null;
            case 'manager-home': return hasPermission('strata:module:manager-home') ? <ManagerHome /> : null;
            case 'calendar': return hasPermission('strata:module:calendar') ? <CalendarModule /> : null;
            case 'properties': return hasPermission('strata:module:properties') ? <PropertiesModule /> : null;
            case 'work-orders': return hasPermission('strata:module:maintenance') ? <WorkOrdersModule /> : null;
            case 'leasing': return hasPermission('strata:module:leasing') ? <LeasingModule /> : null;
            case 'residents': return hasPermission('strata:module:residents') ? <ResidentsModule /> : null;
            case 'vendors': return hasPermission('strata:module:vendors') ? <VendorsModule /> : null;
            case 'owners': return hasPermission('strata:module:owners') ? <OwnersModule /> : null;
            case 'accounting': return hasPermission('strata:module:accounting') ? <AccountingModule /> : null;
            case 'maintenance': return hasPermission('strata:module:maintenance') ? <MaintenanceModule /> : null;
            case 'reporting': return hasPermission('strata:module:reporting') ? <ReportingModule /> : null;
            case 'communication': return hasPermission('strata:module:communication') ? <CommunicationModule /> : null;
            case 'profiles': return hasPermission('strata:module:profiles') ? <ProfilesModule /> : null;
            case 'corporate-review': return hasPermission('strata:module:corporate-review') ? <CorporateReview /> : null;
            case 'integrations': return hasPermission('strata:module:integrations') ? <IntegrationsModule /> : null;
            case 'tenant-portal': return hasPermission('strata:module:tenant-portal') ? <TenantPortalModule /> : null;
            case 'forecast': return hasPermission('strata:module:reporting') ? <ForecastModule /> : null;
            case 'sentiment': return hasPermission('strata:module:reporting') ? <SentimentModule /> : null;
            case 'legal': return hasPermission('strata:module:overview') ? <LegalModule /> : null;
            case 'projects': return hasPermission('strata:module:overview') ? <ProjectsModule /> : null;
            case 'audit': return hasPermission('strata:module:overview') ? <AuditModule /> : null;
            case 'status-check': return hasPermission('strata:module:overview') ? <StatusCheckModule /> : null;
            case 'visualization': return hasPermission('strata:module:overview') ? <VisualizationModule /> : null;
            case 'incidents': return hasPermission('strata:module:overview') ? <IncidentModule /> : null;
            case 'compliance': return hasPermission('strata:module:overview') ? <ComplianceEngine /> : null;
            case 'design-studio': return hasPermission('strata:module:overview') ? <DesignStudio /> : null;
            case 'civil-engineering': return hasPermission('strata:module:overview') ? <CivilEngineeringStudio /> : null;
            case 'settings': return <StrataAdminSettings />;
        }
    };

    return (
        <div className="strata-dashboard strata-shell">
            {/* Sidebar Navigation */}
            <nav className="s-sidebar">
                <div className="s-sidebar-brand">
                    <Sparkles size={20} />
                    <span>Strata</span>
                </div>

                {/* ── Global Search (top of sidebar) ── */}
                <div style={{ padding: '4px 6px', marginBottom: 4 }}>
                    <GlobalSearch onNavigate={(r) => {
                        const typeToModule: Record<string, StrataModule> = {
                            property: 'properties',
                            tenant: 'residents',
                            unit: 'properties',
                            workitem: 'work-orders',
                            vendor: 'vendors',
                            owner: 'owners',
                            email: 'communication',
                        };
                        const mod = typeToModule[r.type] as StrataModule;
                        if (mod) setActiveModule(mod);
                    }} />
                </div>

                <div className="s-sidebar-nav">
                    {NAV_ITEMS.map((item) => {
                        if (!hasPermission(item.permKey as string)) return null;
                        return (
                            <button
                                key={item.id}
                                className={`s-nav-item ${activeModule === item.id ? 'active' : ''}`}
                                onClick={() => setActiveModule(item.id)}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </button>
                        );
                    })}

                    <div style={{ height: '1px', background: 'var(--s-glass-border)', margin: '8px 0' }} />

                    {user?.name === 'Andy' && (
                        <button
                            className={`s-nav-item ${activeModule === 'settings' ? 'active' : ''}`}
                            onClick={() => setActiveModule('settings')}
                        >
                            <Settings size={18} />
                            <span>Settings</span>
                        </button>
                    )}

                    <button className="s-nav-item" onClick={logout}>
                        <LogOut size={18} />
                        <span>Sign Out</span>
                    </button>
                </div>
            </nav>

            {/* Module Content */}
            <main className="s-main-content">
                {renderModule()}
            </main>
        </div>
    );
}

