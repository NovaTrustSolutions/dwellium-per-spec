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
import { Settings, Scale, FolderKanban, Shield, Activity, Pencil, HardHat, Plus, X } from 'lucide-react';
import { strataPost, strataGet } from './strataApi';
import { StrataNavProvider, type SearchNavTarget } from './StrataNavContext';
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
            <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 700, marginBottom: '4px' }}>{data.payload.name}</p>
            <p style={{ color: '#D6FE51', fontSize: '0.8125rem', fontWeight: 600 }}>{data.value}% occupied</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>{data.payload.units} total units</p>
        </div>
    );
}

const getBarColor = (occupancy: number) => {
    if (occupancy >= 95) return '#10b981';
    if (occupancy >= 90) return '#D6FE51';
    return '#f59e0b';
};

interface OccupancyRow { name: string; occupancy: number; units: number }

function OccupancyChart({ data }: { data: OccupancyRow[] }) {
    if (data.length === 0) {
        return (
            <div className="s-glass-card s-chart-card s-animate-fade-in s-delay-4">
                <div className="s-chart-card-header"><h3>Occupancy by Property</h3></div>
                <div style={{ padding: 24, color: 'var(--text-tertiary)', textAlign: 'center' }}>No properties found.</div>
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
                            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false}
                            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} width={140} />
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
    email: { icon: Mail, color: '#D6FE51', bg: 'rgba(214, 254, 81, 0.12)' },
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
                    <p style={{ color: 'var(--text-tertiary)', padding: '16px', textAlign: 'center', fontSize: 13 }}>No recent activity.</p>
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
                    <p style={{ color: 'var(--text-tertiary)', padding: '16px', textAlign: 'center', fontSize: 13 }}>No upcoming events.</p>
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
    { id: 1, label: 'New Lease', sublabel: 'Start application', icon: FileKey2, color: '#D6FE51', bg: 'rgba(214, 254, 81, 0.12)' },
    { id: 2, label: 'Work Order', sublabel: 'Create request', icon: Wrench, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
    { id: 3, label: 'Record Payment', sublabel: 'Manual entry', icon: DollarSign, color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
    { id: 4, label: 'Send Notice', sublabel: 'Broadcast', icon: Bell, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' },
    { id: 5, label: 'Run Report', sublabel: 'Financials', icon: BarChart3, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
    { id: 6, label: 'Ask Aria', sublabel: 'AI assistant', icon: Sparkles, color: '#D6FE51', bg: 'rgba(214, 254, 81, 0.12)' },
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
    { id: 'forecast', label: 'Forecast', icon: <TrendingUp size={18} />, permKey: 'strata:module:forecast' },
    { id: 'sentiment', label: 'Sentiment', icon: <BarChart3 size={18} />, permKey: 'strata:module:sentiment' },
    { id: 'legal', label: 'Legal', icon: <Scale size={18} />, permKey: 'strata:module:legal' },
    { id: 'projects', label: 'Projects', icon: <FolderKanban size={18} />, permKey: 'strata:module:projects' },
    { id: 'audit', label: 'Audit Log', icon: <Shield size={18} />, permKey: 'strata:module:audit' },
    { id: 'status-check', label: 'Status Check', icon: <Activity size={18} />, permKey: 'strata:module:status-check' },
    { id: 'compliance', label: 'Compliance', icon: <Shield size={18} />, permKey: 'strata:module:compliance' },
    { id: 'design-studio', label: 'Design Studio', icon: <Pencil size={18} />, permKey: 'strata:module:design-studio' },
    { id: 'civil-engineering', label: 'Civil Engineering', icon: <HardHat size={18} />, permKey: 'strata:module:civil-engineering' },
    { id: 'incidents', label: 'Incidents', icon: <AlertTriangle size={18} />, permKey: 'strata:module:incidents' },
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
            // Route dwellium reads through strataApi so static/backend modes both work.
            // Calendar stays as a raw fetch — it's a separate service, not dwellium.
            const [statsRes, propsRes, commsRes, calRes] = await Promise.allSettled([
                strataGet<{ totalProperties: number; totalUnits: number; occupiedUnits: number; occupancyRate: string; openWorkOrders: number }>('/stats'),
                strataGet<Array<{ id: string; name: string; unitCount: number; status: string }> | { data: Array<{ id: string; name: string; unitCount: number; status: string }> }>('/properties'),
                strataGet<Array<any> | { data: Array<any> }>('/comms', { limit: '10' }),
                authFetch(`${API}/api/calendar/events?maxResults=6`),
            ]);

            // Stats
            if (statsRes.status === 'fulfilled' && statsRes.value) {
                setStats(statsRes.value);
            }

            // Properties → per-property occupancy (parallel fan-out)
            if (propsRes.status === 'fulfilled' && propsRes.value) {
                const raw: any = propsRes.value;
                const properties: Array<{ id: string; name: string; unitCount: number; status: string }> =
                    Array.isArray(raw) ? raw : (raw?.data ?? []);
                const activeProps = properties.filter(p => p.status === 'active');

                const rows = await Promise.all(activeProps.map(async (prop) => {
                    try {
                        const u = await strataGet<Array<{ status: string }> | { data: Array<{ status: string }> }>('/units', { property_id: prop.id });
                        const units: Array<{ status: string }> = Array.isArray(u) ? u : ((u as any)?.data ?? []);
                        const total = units.length;
                        const occupied = units.filter(x => x.status === 'occupied').length;
                        const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
                        return { name: prop.name, occupancy: rate, units: total } as OccupancyRow;
                    } catch { return null; }
                }));
                const occupancy = rows.filter((r): r is OccupancyRow => r !== null).sort((a, b) => b.occupancy - a.occupancy);
                setOccupancyData(occupancy);
            }

            // Comms
            if (commsRes.status === 'fulfilled' && commsRes.value) {
                const raw: any = commsRes.value;
                const commsData = Array.isArray(raw) ? raw : (raw?.data ?? []);
                setComms(commsData.slice(0, 10));
            }

            // Calendar (non-dwellium service)
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
                    { label: 'Portal Adoption', value: '51%', sub: '139 of 272 tenants', color: '#D6FE51', icon: <Globe size={16} /> },
                    { label: 'Leases Expiring', value: '7', sub: 'Next 90 days', color: '#D6FE51', icon: <FileKey2 size={16} /> },
                    { label: 'Delinquency Rate', value: '4.2%', sub: '12 tenants', color: '#ef4444', icon: <AlertTriangle size={16} /> },
                ].map(m => (
                    <div key={m.label} className="s-glass-card" style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span style={{ color: m.color }}>{m.icon}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>{m.label}</span>
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{m.value}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{m.sub}</div>
                    </div>
                ))}
            </div>

            {/* ══════════ Move-In / Move-Out Tables ══════════ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '8px 0' }}>
                <div className="s-glass-card">
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, color: '#10b981', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowUpRight size={14} />Upcoming Move-Ins
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead><tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            {['Tenant', 'Unit', 'Date'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {[
                                { tenant: 'Marcus Johnson', unit: 'Woodland 2826-4', date: '2026-03-15' },
                                { tenant: 'Sarah Chen', unit: 'Riverwood D11', date: '2026-03-20' },
                                { tenant: 'James Williams', unit: 'Ski Country B3', date: '2026-04-01' },
                            ].map((r, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{r.tenant}</td>
                                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.unit}</td>
                                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.date}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="s-glass-card">
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, color: '#ef4444', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowDownRight size={14} />Upcoming Move-Outs
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead><tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            {['Tenant', 'Unit', 'Date'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {[
                                { tenant: 'Fletcher A. Glass', unit: 'Riverwood D09', date: '2026-03-31' },
                                { tenant: 'Eumeko K. Fuller-Barrow', unit: 'Woodland 2782-6', date: '2026-04-15' },
                            ].map((r, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{r.tenant}</td>
                                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.unit}</td>
                                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.date}</td>
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
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>Financial Health Alert</span>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>🔴 <strong style={{ color: '#ef4444' }}>12 delinquent</strong> accounts ($19,050)</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>🟡 <strong style={{ color: '#f59e0b' }}>7 leases</strong> expiring in 90 days</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>🟢 <strong style={{ color: '#10b981' }}>87%</strong> rent collected this month</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>🔵 <strong style={{ color: '#0ea5e9' }}>3 new move-ins</strong> scheduled</span>
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

interface IntegrationCard {
    id: string;
    name: string;
    icon: ReactNode;
    color: string;
    description: string;
    features: string[];
    endpoint: string;
    envVars: string[];
}

interface IntegrationStatusState {
    connected: boolean;
    lastSync?: string;
    loading: boolean;
    error?: string;
}

interface NotebookLMSettingsState {
    enabled: boolean;
    projectNumber: string;
    location: string;
    endpointLocation: string;
    defaultNotebookId: string;
    recentNotebookLimit: number;
}

interface NotebookLMNotebookState {
    id: string;
    name: string;
    title: string;
    description: string;
    state: string;
    sourceCount: number;
    updateTime: string | null;
    createTime: string | null;
}

interface NotebookLMStatusState extends NotebookLMSettingsState {
    connected: boolean;
    configured: boolean;
    authStrategy: string;
    checkedAt: string;
    lastError?: string;
    recentNotebookCount?: number;
    defaultNotebook?: NotebookLMNotebookState | null;
}

interface NotebookLMMcpConfigState {
    serverName: string;
    command: string;
    args: string[];
    cwd: string;
    claudeDesktopConfig: Record<string, unknown>;
}

const INTEGRATION_CARDS: IntegrationCard[] = [
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
        color: '#D6FE51',
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
    {
        id: 'notebooklm',
        name: 'NotebookLM',
        icon: <BookOpen size={24} />,
        color: '#f59e0b',
        description: 'Google NotebookLM Enterprise integration with source publishing and Claude/Desktop MCP access.',
        features: ['Recent Notebooks', 'Create Notebooks', 'Push Sources', 'Claude MCP'],
        endpoint: '/api/integrations/notebooklm',
        envVars: ['NOTEBOOKLM_PROJECT_NUMBER', 'NOTEBOOKLM_LOCATION'],
    },
];

function IntegrationsModule() {
    const API = API_BASE;
    const { authFetch } = useUser();
    const [statuses, setStatuses] = useState<Record<string, IntegrationStatusState>>({});
    const [trelloSync, setTrelloSync] = useState<{ syncing: boolean; result: any | null }>({ syncing: false, result: null });
    const [notebookStatus, setNotebookStatus] = useState<NotebookLMStatusState | null>(null);
    const [notebookSettings, setNotebookSettings] = useState<NotebookLMSettingsState>({
        enabled: false,
        projectNumber: '',
        location: 'global',
        endpointLocation: 'global',
        defaultNotebookId: '',
        recentNotebookLimit: 20,
    });
    const [recentNotebooks, setRecentNotebooks] = useState<NotebookLMNotebookState[]>([]);
    const [selectedNotebookId, setSelectedNotebookId] = useState('');
    const [selectedNotebook, setSelectedNotebook] = useState<NotebookLMNotebookState | null>(null);
    const [notebookMessage, setNotebookMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [notebookPanelLoading, setNotebookPanelLoading] = useState(true);
    const [notebookDetailLoading, setNotebookDetailLoading] = useState(false);
    const [notebookSaving, setNotebookSaving] = useState(false);
    const [notebookCreating, setNotebookCreating] = useState(false);
    const [textSubmitting, setTextSubmitting] = useState(false);
    const [webSubmitting, setWebSubmitting] = useState(false);
    const [fileSubmitting, setFileSubmitting] = useState(false);
    const [shareSubmitting, setShareSubmitting] = useState(false);
    const [mcpConfig, setMcpConfig] = useState<NotebookLMMcpConfigState | null>(null);
    const [newNotebook, setNewNotebook] = useState({ title: '', description: '' });
    const [textSource, setTextSource] = useState({ sourceName: '', content: '' });
    const [webSource, setWebSource] = useState({ sourceName: '', url: '' });
    const [shareForm, setShareForm] = useState({ email: '', role: 'EDITOR' });
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const cardButtonStyle = {
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface-elevated)',
        color: 'var(--text-secondary)',
        borderRadius: '8px',
        padding: '9px 12px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
    } as const;

    const fieldStyle = {
        width: '100%',
        background: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        color: 'var(--text-primary)',
        padding: '10px 12px',
        fontSize: '12px',
    } as const;

    const sectionCardStyle = {
        background: 'rgba(30,33,48,0.9)',
        border: '1px solid rgba(214,254,81,0.12)',
        borderRadius: '12px',
        padding: '18px 20px',
    } as const;

    const parseJson = async (response: Response) => {
        const data = await response.json();
        if (!response.ok || data?.success === false) {
            throw new Error(data?.error || `Request failed (${response.status})`);
        }
        return data;
    };

    const parseStatusJson = async (response: Response) => {
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.error || `Request failed (${response.status})`);
        }
        return data;
    };

    const setNotebookNotice = (type: 'success' | 'error', text: string) => {
        setNotebookMessage({ type, text });
    };

    const loadNotebookDetail = useCallback(async (notebookId: string) => {
        if (!notebookId) {
            setSelectedNotebook(null);
            return;
        }
        setNotebookDetailLoading(true);
        try {
            const res = await authFetch(`${API}/api/integrations/notebooklm/notebooks/${encodeURIComponent(notebookId)}`);
            const data = await parseJson(res);
            setSelectedNotebook(data.data);
        } catch (error) {
            setNotebookNotice('error', error instanceof Error ? error.message : 'Failed to load notebook');
            setSelectedNotebook(null);
        } finally {
            setNotebookDetailLoading(false);
        }
    }, [API, authFetch]);

    const refreshNotebookStatus = useCallback(async () => {
        const res = await authFetch(`${API}/api/integrations/notebooklm/status`);
        const data = await parseStatusJson(res);
        setNotebookStatus(data.data);
        setStatuses((current) => ({
            ...current,
            notebooklm: {
                connected: Boolean(data.data?.connected),
                lastSync: data.data?.checkedAt,
                loading: false,
                error: data.data?.lastError,
            },
        }));
        return data.data as NotebookLMStatusState;
    }, [API, authFetch]);

    const refreshRecentNotebooks = useCallback(async () => {
        if (!notebookSettings.enabled || !notebookSettings.projectNumber) {
            setRecentNotebooks([]);
            return [];
        }
        const res = await authFetch(`${API}/api/integrations/notebooklm/notebooks/recent?limit=${notebookSettings.recentNotebookLimit || 20}`);
        const data = await parseJson(res);
        setRecentNotebooks(data.data?.notebooks || []);
        return (data.data?.notebooks || []) as NotebookLMNotebookState[];
    }, [API, authFetch, notebookSettings.enabled, notebookSettings.projectNumber, notebookSettings.recentNotebookLimit]);

    const loadNotebookPanel = useCallback(async () => {
        setNotebookPanelLoading(true);
        try {
            const [settingsRes, mcpRes] = await Promise.all([
                authFetch(`${API}/api/integrations/notebooklm/settings`),
                authFetch(`${API}/api/integrations/notebooklm/mcp-config`),
            ]);
            const settingsJson = await parseJson(settingsRes);
            const mcpJson = await parseJson(mcpRes);

            setNotebookSettings(settingsJson.data);
            setMcpConfig({
                serverName: mcpJson.data.serverName,
                command: mcpJson.data.command,
                args: mcpJson.data.args,
                cwd: mcpJson.data.cwd,
                claudeDesktopConfig: mcpJson.data.claudeDesktopConfig,
            });

            if (!settingsJson.data.enabled || !settingsJson.data.projectNumber) {
                setNotebookStatus(null);
                setRecentNotebooks([]);
                setSelectedNotebookId('');
                setSelectedNotebook(null);
                return;
            }

            let connectedStatus: NotebookLMStatusState | null = null;
            try {
                connectedStatus = await refreshNotebookStatus();
            } catch (error) {
                setNotebookNotice('error', error instanceof Error ? error.message : 'NotebookLM status check failed');
            }

            let notebookList: NotebookLMNotebookState[] = [];
            if (connectedStatus?.connected) {
                try {
                    const recentJson = await authFetch(`${API}/api/integrations/notebooklm/notebooks/recent?limit=${settingsJson.data.recentNotebookLimit || 20}`).then(parseJson);
                    notebookList = recentJson.data?.notebooks || [];
                    setRecentNotebooks(notebookList);
                } catch (error) {
                    setNotebookNotice('error', error instanceof Error ? error.message : 'Failed to load recent notebooks');
                }
            } else {
                setRecentNotebooks([]);
            }

            const initialNotebookId =
                connectedStatus?.defaultNotebookId ||
                settingsJson.data.defaultNotebookId ||
                notebookList[0]?.id ||
                '';

            setSelectedNotebookId(initialNotebookId);
            if (initialNotebookId) {
                await loadNotebookDetail(initialNotebookId);
            }
        } catch (error) {
            setNotebookNotice('error', error instanceof Error ? error.message : 'Failed to load NotebookLM integration');
        } finally {
            setNotebookPanelLoading(false);
        }
    }, [API, authFetch, loadNotebookDetail, refreshNotebookStatus]);

    const runTrelloSync = async () => {
        setTrelloSync({ syncing: true, result: null });
        try {
            // Route through strataApi (static mode returns a stubbed success shape).
            const data = await strataPost<any>('/trello-sync', {});
            setTrelloSync({ syncing: false, result: data });
        } catch (err) {
            setTrelloSync({ syncing: false, result: { error: 'Sync failed — check backend logs' } });
        }
    };

    const checkStatus = async (id: string, endpoint: string) => {
        setStatuses((s) => ({ ...s, [id]: { ...s[id], loading: true, connected: false, error: undefined } }));
        try {
            const res = await authFetch(`${API}${endpoint}/status`);
            const data = await parseStatusJson(res);
            setStatuses((s) => ({
                ...s,
                [id]: {
                    connected: Boolean(data.data?.connected),
                    lastSync: data.data?.lastSync || data.data?.checkedAt,
                    loading: false,
                    error: data.data?.lastError,
                },
            }));
        } catch (error) {
            setStatuses((s) => ({
                ...s,
                [id]: {
                    connected: false,
                    loading: false,
                    error: error instanceof Error ? error.message : 'Connection test failed',
                },
            }));
        }
    };

    const saveNotebookSettings = async () => {
        setNotebookSaving(true);
        try {
            const res = await authFetch(`${API}/api/integrations/notebooklm/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notebookSettings),
            });
            const data = await parseJson(res);
            setNotebookSettings(data.data);
            setNotebookNotice('success', 'NotebookLM settings saved');
            const status = await refreshNotebookStatus().catch(() => null);
            if (status?.connected) {
                await refreshRecentNotebooks().catch(() => undefined);
            } else {
                setRecentNotebooks([]);
            }
        } catch (error) {
            setNotebookNotice('error', error instanceof Error ? error.message : 'Failed to save NotebookLM settings');
        } finally {
            setNotebookSaving(false);
        }
    };

    const createNotebookFromUi = async () => {
        if (!newNotebook.title.trim()) {
            setNotebookNotice('error', 'Notebook title is required');
            return;
        }

        setNotebookCreating(true);
        try {
            const res = await authFetch(`${API}/api/integrations/notebooklm/notebooks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newNotebook.title.trim(),
                    description: newNotebook.description.trim(),
                }),
            });
            const data = await parseJson(res);
            const created = data.data as NotebookLMNotebookState;
            setSelectedNotebookId(created.id);
            setSelectedNotebook(created);
            setNewNotebook({ title: '', description: '' });
            await refreshRecentNotebooks();
            setNotebookNotice('success', `Created notebook "${created.title}"`);
        } catch (error) {
            setNotebookNotice('error', error instanceof Error ? error.message : 'Failed to create notebook');
        } finally {
            setNotebookCreating(false);
        }
    };

    const submitTextSource = async () => {
        if (!selectedNotebookId) {
            setNotebookNotice('error', 'Choose a notebook first');
            return;
        }
        if (!textSource.sourceName.trim() || !textSource.content.trim()) {
            setNotebookNotice('error', 'Text source name and content are required');
            return;
        }

        setTextSubmitting(true);
        try {
            const res = await authFetch(`${API}/api/integrations/notebooklm/notebooks/${encodeURIComponent(selectedNotebookId)}/sources/text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceName: textSource.sourceName.trim(),
                    content: textSource.content.trim(),
                }),
            });
            await parseJson(res);
            setTextSource({ sourceName: '', content: '' });
            await loadNotebookDetail(selectedNotebookId);
            setNotebookNotice('success', 'Text source added to NotebookLM');
        } catch (error) {
            setNotebookNotice('error', error instanceof Error ? error.message : 'Failed to add text source');
        } finally {
            setTextSubmitting(false);
        }
    };

    const submitWebSource = async () => {
        if (!selectedNotebookId) {
            setNotebookNotice('error', 'Choose a notebook first');
            return;
        }
        if (!webSource.sourceName.trim() || !webSource.url.trim()) {
            setNotebookNotice('error', 'Web source name and URL are required');
            return;
        }

        setWebSubmitting(true);
        try {
            const res = await authFetch(`${API}/api/integrations/notebooklm/notebooks/${encodeURIComponent(selectedNotebookId)}/sources/web`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceName: webSource.sourceName.trim(),
                    url: webSource.url.trim(),
                }),
            });
            await parseJson(res);
            setWebSource({ sourceName: '', url: '' });
            await loadNotebookDetail(selectedNotebookId);
            setNotebookNotice('success', 'Web source added to NotebookLM');
        } catch (error) {
            setNotebookNotice('error', error instanceof Error ? error.message : 'Failed to add web source');
        } finally {
            setWebSubmitting(false);
        }
    };

    const submitFileSource = async () => {
        if (!selectedNotebookId) {
            setNotebookNotice('error', 'Choose a notebook first');
            return;
        }
        if (!selectedFile) {
            setNotebookNotice('error', 'Choose a file to upload');
            return;
        }

        setFileSubmitting(true);
        try {
            const form = new FormData();
            form.append('file', selectedFile);
            const res = await authFetch(`${API}/api/integrations/notebooklm/notebooks/${encodeURIComponent(selectedNotebookId)}/sources/file`, {
                method: 'POST',
                body: form,
            });
            await parseJson(res);
            setSelectedFile(null);
            await loadNotebookDetail(selectedNotebookId);
            setNotebookNotice('success', `Uploaded ${selectedFile.name} to NotebookLM`);
        } catch (error) {
            setNotebookNotice('error', error instanceof Error ? error.message : 'Failed to upload file source');
        } finally {
            setFileSubmitting(false);
        }
    };

    const submitShare = async () => {
        if (!selectedNotebookId) {
            setNotebookNotice('error', 'Choose a notebook first');
            return;
        }
        if (!shareForm.email.trim()) {
            setNotebookNotice('error', 'Share email is required');
            return;
        }

        setShareSubmitting(true);
        try {
            const res = await authFetch(`${API}/api/integrations/notebooklm/notebooks/${encodeURIComponent(selectedNotebookId)}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: shareForm.email.trim(),
                    role: shareForm.role,
                }),
            });
            await parseJson(res);
            setShareForm({ email: '', role: 'EDITOR' });
            setNotebookNotice('success', 'Notebook access updated');
        } catch (error) {
            setNotebookNotice('error', error instanceof Error ? error.message : 'Failed to share notebook');
        } finally {
            setShareSubmitting(false);
        }
    };

    const copyMcpConfig = async () => {
        if (!mcpConfig) return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(mcpConfig.claudeDesktopConfig, null, 2));
            setNotebookNotice('success', 'Claude/Desktop MCP config copied');
        } catch {
            setNotebookNotice('error', 'Clipboard copy failed on this browser');
        }
    };

    useEffect(() => {
        void loadNotebookPanel();
    }, [loadNotebookPanel]);

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
                                    <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '15px', fontWeight: 600 }}>{card.name}</h3>
                                    <p style={{ color: 'var(--text-tertiary)', margin: 0, fontSize: '12px' }}>{card.description}</p>
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
                                        background: 'rgba(214,254,81,0.12)',
                                        color: '#D6FE51',
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
                                        border: '1px solid rgba(214,254,81,0.3)',
                                        background: 'rgba(214,254,81,0.1)',
                                        color: '#D6FE51', cursor: 'pointer',
                                        fontSize: '12px', fontWeight: 600,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    }}
                                >
                                    <RefreshCw size={13} className={status?.loading ? 'spinning' : ''} />
                                    {status?.loading ? 'Checking…' : 'Test Connection'}
                                </button>
                                <button
                                    onClick={() => {
                                        if (card.id === 'notebooklm') {
                                            document.getElementById('notebooklm-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }
                                    }}
                                    style={{
                                        padding: '8px 12px', borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'rgba(255,255,255,0.04)',
                                        color: 'var(--text-secondary)', cursor: 'pointer',
                                        fontSize: '12px', fontWeight: 600,
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                    }}
                                >
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
                            {status?.error && (
                                <div style={{ color: '#ef4444', fontSize: '11px' }}>{status.error}</div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div id="notebooklm-panel" style={{ ...sectionCardStyle, marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div>
                        <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '15px', fontWeight: 700 }}>NotebookLM + Claude MCP</h3>
                        <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0', fontSize: '12px' }}>
                            Configure Google NotebookLM Enterprise, publish notebook sources, and expose the same tools through a Claude/Desktop MCP server.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button onClick={() => void refreshNotebookStatus()} style={cardButtonStyle}>
                            <RefreshCw size={13} style={{ marginRight: 6 }} />
                            Test NotebookLM
                        </button>
                        <button onClick={() => void refreshRecentNotebooks()} style={cardButtonStyle}>
                            <BookOpen size={13} style={{ marginRight: 6 }} />
                            Refresh Recent
                        </button>
                        <button onClick={() => void copyMcpConfig()} style={cardButtonStyle}>
                            <ClipboardCheck size={13} style={{ marginRight: 6 }} />
                            Copy Claude MCP
                        </button>
                    </div>
                </div>

                {notebookMessage && (
                    <div style={{
                        marginBottom: '14px',
                        background: notebookMessage.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
                        border: `1px solid ${notebookMessage.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                        borderRadius: '10px',
                        padding: '12px 14px',
                        color: notebookMessage.type === 'success' ? '#86efac' : '#fca5a5',
                        fontSize: '12px',
                    }}>
                        {notebookMessage.text}
                    </div>
                )}

                {notebookPanelLoading ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Loading NotebookLM configuration…</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                        <div style={{ display: 'grid', gap: '16px' }}>
                            <div style={{ ...sectionCardStyle, padding: '16px', background: 'rgba(15,23,42,0.45)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                                    <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        Enabled
                                        <select
                                            value={notebookSettings.enabled ? 'true' : 'false'}
                                            onChange={(e) => setNotebookSettings((current) => ({ ...current, enabled: e.target.value === 'true' }))}
                                            style={fieldStyle}
                                        >
                                            <option value="true">Enabled</option>
                                            <option value="false">Disabled</option>
                                        </select>
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        Project Number
                                        <input
                                            value={notebookSettings.projectNumber}
                                            onChange={(e) => setNotebookSettings((current) => ({ ...current, projectNumber: e.target.value }))}
                                            style={fieldStyle}
                                            placeholder="Google Cloud project number"
                                        />
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        API Location
                                        <input
                                            value={notebookSettings.location}
                                            onChange={(e) => setNotebookSettings((current) => ({ ...current, location: e.target.value }))}
                                            style={fieldStyle}
                                            placeholder="global"
                                        />
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        Endpoint Region
                                        <input
                                            value={notebookSettings.endpointLocation}
                                            onChange={(e) => setNotebookSettings((current) => ({ ...current, endpointLocation: e.target.value }))}
                                            style={fieldStyle}
                                            placeholder="global"
                                        />
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        Default Notebook ID
                                        <input
                                            value={notebookSettings.defaultNotebookId}
                                            onChange={(e) => setNotebookSettings((current) => ({ ...current, defaultNotebookId: e.target.value }))}
                                            style={fieldStyle}
                                            placeholder="Notebook ID"
                                        />
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        Recent Notebook Limit
                                        <input
                                            type="number"
                                            min={1}
                                            max={100}
                                            value={notebookSettings.recentNotebookLimit}
                                            onChange={(e) => setNotebookSettings((current) => ({ ...current, recentNotebookLimit: Number(e.target.value) || 20 }))}
                                            style={fieldStyle}
                                        />
                                    </label>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', gap: '10px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: notebookStatus?.connected ? '#10b981' : '#f59e0b', fontSize: '12px', fontWeight: 600 }}>
                                        {notebookStatus?.connected ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                                        {notebookStatus?.connected ? 'NotebookLM connected' : (notebookStatus?.lastError || 'NotebookLM not connected')}
                                    </div>
                                    <button onClick={() => void saveNotebookSettings()} disabled={notebookSaving} style={cardButtonStyle}>
                                        <ClipboardCheck size={13} style={{ marginRight: 6 }} />
                                        {notebookSaving ? 'Saving…' : 'Save Settings'}
                                    </button>
                                </div>

                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                    <span>Auth: {notebookStatus?.authStrategy || 'unknown'}</span>
                                    <span>Checked: {notebookStatus?.checkedAt ? new Date(notebookStatus.checkedAt).toLocaleString() : 'not yet'}</span>
                                    <span>Recent notebooks: {notebookStatus?.recentNotebookCount ?? recentNotebooks.length}</span>
                                </div>
                            </div>

                            <div style={{ ...sectionCardStyle, padding: '16px', background: 'rgba(15,23,42,0.45)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'end', marginBottom: '12px' }}>
                                    <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        Recent Notebooks
                                        <select
                                            value={selectedNotebookId}
                                            onChange={(e) => {
                                                setSelectedNotebookId(e.target.value);
                                                void loadNotebookDetail(e.target.value);
                                            }}
                                            style={fieldStyle}
                                        >
                                            <option value="">Select a recent notebook</option>
                                            {recentNotebooks.map((notebook) => (
                                                <option key={notebook.id} value={notebook.id}>
                                                    {notebook.title || notebook.id}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <button onClick={() => selectedNotebookId && void loadNotebookDetail(selectedNotebookId)} style={cardButtonStyle}>
                                        Refresh Detail
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                                    <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        New Notebook Title
                                        <input
                                            value={newNotebook.title}
                                            onChange={(e) => setNewNotebook((current) => ({ ...current, title: e.target.value }))}
                                            style={fieldStyle}
                                            placeholder="Riverwood utility review"
                                        />
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        Description
                                        <input
                                            value={newNotebook.description}
                                            onChange={(e) => setNewNotebook((current) => ({ ...current, description: e.target.value }))}
                                            style={fieldStyle}
                                            placeholder="Optional description"
                                        />
                                    </label>
                                </div>

                                <button onClick={() => void createNotebookFromUi()} disabled={notebookCreating} style={{ ...cardButtonStyle, marginTop: '12px' }}>
                                    <Plus size={13} style={{ marginRight: 6 }} />
                                    {notebookCreating ? 'Creating…' : 'Create Notebook'}
                                </button>

                                <div style={{ marginTop: '14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                    NotebookLM only exposes recently viewed notebooks via the API. If a notebook is missing here, open it once in NotebookLM and refresh.
                                </div>
                            </div>

                            <div style={{ ...sectionCardStyle, padding: '16px', background: 'rgba(15,23,42,0.45)' }}>
                                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 12px', fontSize: '13px' }}>Publish Sources</h4>
                                <div style={{ display: 'grid', gap: '12px' }}>
                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        <input
                                            value={textSource.sourceName}
                                            onChange={(e) => setTextSource((current) => ({ ...current, sourceName: e.target.value }))}
                                            style={fieldStyle}
                                            placeholder="Text source label"
                                        />
                                        <textarea
                                            value={textSource.content}
                                            onChange={(e) => setTextSource((current) => ({ ...current, content: e.target.value }))}
                                            style={{ ...fieldStyle, minHeight: '120px', resize: 'vertical' as const }}
                                            placeholder="Paste meeting notes, summaries, or property context here"
                                        />
                                        <button onClick={() => void submitTextSource()} disabled={textSubmitting} style={cardButtonStyle}>
                                            <ClipboardCheck size={13} style={{ marginRight: 6 }} />
                                            {textSubmitting ? 'Pushing text…' : 'Add Text Source'}
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        <input
                                            value={webSource.sourceName}
                                            onChange={(e) => setWebSource((current) => ({ ...current, sourceName: e.target.value }))}
                                            style={fieldStyle}
                                            placeholder="Web source label"
                                        />
                                        <input
                                            value={webSource.url}
                                            onChange={(e) => setWebSource((current) => ({ ...current, url: e.target.value }))}
                                            style={fieldStyle}
                                            placeholder="https://..."
                                        />
                                        <button onClick={() => void submitWebSource()} disabled={webSubmitting} style={cardButtonStyle}>
                                            <Globe size={13} style={{ marginRight: 6 }} />
                                            {webSubmitting ? 'Pushing URL…' : 'Add Web Source'}
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        <input
                                            type="file"
                                            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                            style={fieldStyle}
                                        />
                                        <button onClick={() => void submitFileSource()} disabled={fileSubmitting} style={cardButtonStyle}>
                                            <FolderKanban size={13} style={{ marginRight: 6 }} />
                                            {fileSubmitting ? 'Uploading…' : 'Upload File Source'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            <div style={{ ...sectionCardStyle, padding: '16px', background: 'rgba(15,23,42,0.45)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <h4 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '13px' }}>Selected Notebook</h4>
                                    {notebookDetailLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Loading…</span>}
                                </div>
                                {selectedNotebook ? (
                                    <div style={{ display: 'grid', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        <div>
                                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>{selectedNotebook.title || selectedNotebook.id}</div>
                                            <div style={{ color: 'var(--text-tertiary)', marginTop: '4px' }}>{selectedNotebook.description || 'No description yet'}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: 'var(--text-secondary)', fontSize: '11px' }}>
                                            <span>State: {selectedNotebook.state}</span>
                                            <span>Sources: {selectedNotebook.sourceCount}</span>
                                            <span>Updated: {selectedNotebook.updateTime ? new Date(selectedNotebook.updateTime).toLocaleString() : 'n/a'}</span>
                                        </div>
                                        <div style={{ color: 'var(--text-tertiary)', fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
                                            {selectedNotebook.name}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Select a notebook to inspect it here.</div>
                                )}
                            </div>

                            <div style={{ ...sectionCardStyle, padding: '16px', background: 'rgba(15,23,42,0.45)' }}>
                                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 12px', fontSize: '13px' }}>Share Access</h4>
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    <input
                                        value={shareForm.email}
                                        onChange={(e) => setShareForm((current) => ({ ...current, email: e.target.value }))}
                                        style={fieldStyle}
                                        placeholder="user@example.com"
                                    />
                                    <select
                                        value={shareForm.role}
                                        onChange={(e) => setShareForm((current) => ({ ...current, role: e.target.value }))}
                                        style={fieldStyle}
                                    >
                                        <option value="EDITOR">Editor</option>
                                        <option value="VIEWER">Viewer</option>
                                    </select>
                                    <button onClick={() => void submitShare()} disabled={shareSubmitting} style={cardButtonStyle}>
                                        <Users size={13} style={{ marginRight: 6 }} />
                                        {shareSubmitting ? 'Sharing…' : 'Share Notebook'}
                                    </button>
                                </div>
                            </div>

                            <div style={{ ...sectionCardStyle, padding: '16px', background: 'rgba(15,23,42,0.45)' }}>
                                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 12px', fontSize: '13px' }}>Claude/Desktop MCP</h4>
                                {mcpConfig ? (
                                    <>
                                        <div style={{ display: 'grid', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            <div><strong>Server</strong>: {mcpConfig.serverName}</div>
                                            <div><strong>Command</strong>: <span style={{ fontFamily: 'monospace' }}>{mcpConfig.command} {mcpConfig.args.join(' ')}</span></div>
                                            <div><strong>CWD</strong>: <span style={{ fontFamily: 'monospace' }}>{mcpConfig.cwd}</span></div>
                                        </div>
                                        <pre style={{
                                            marginTop: '12px',
                                            padding: '12px',
                                            borderRadius: '10px',
                                            background: 'rgba(2,6,23,0.8)',
                                            border: '1px solid rgba(148,163,184,0.16)',
                                            color: 'var(--text-secondary)',
                                            fontSize: '11px',
                                            overflowX: 'auto',
                                        }}>
                                            {JSON.stringify(mcpConfig.claudeDesktopConfig, null, 2)}
                                        </pre>
                                    </>
                                ) : (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>MCP config unavailable.</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Trello → Strata Sync ── */}
            <div style={{
                background: 'rgba(30,33,48,0.9)',
                border: '1px solid rgba(214,254,81,0.2)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '16px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: '10px',
                            background: 'rgba(214,254,81,0.15)', color: '#D6FE51',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <RefreshCw size={20} />
                        </div>
                        <div>
                            <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '15px', fontWeight: 700 }}>Trello → Strata Sync</h3>
                            <p style={{ color: 'var(--text-tertiary)', margin: 0, fontSize: '12px' }}>Sync Trello boards into Strata workitems & vendor profiles</p>
                        </div>
                    </div>
                    <button
                        onClick={runTrelloSync}
                        disabled={trelloSync.syncing}
                        style={{
                            padding: '10px 20px', borderRadius: '8px',
                            border: 'none',
                            background: trelloSync.syncing ? 'rgba(214,254,81,0.2)' : 'rgba(214,254,81,0.8)',
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
                                    { label: 'Boards Synced', value: trelloSync.result.boardsSynced, color: '#D6FE51' },
                                    { label: 'Workitems Created', value: trelloSync.result.workitemsCreated, color: '#10b981' },
                                    { label: 'Workitems Updated', value: trelloSync.result.workitemsUpdated, color: '#3b82f6' },
                                    { label: 'Vendors Created', value: trelloSync.result.vendorsCreated, color: '#f59e0b' },
                                    { label: 'Vendors Updated', value: trelloSync.result.vendorsUpdated, color: '#f59e0b' },
                                    { label: 'Duration', value: `${(trelloSync.result.duration / 1000).toFixed(1)}s`, color: 'var(--text-secondary)' },
                                ].map(stat => (
                                    <div key={stat.label}>
                                        <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>{stat.label}</div>
                                    </div>
                                ))}
                                {trelloSync.result.errors?.length > 0 && (
                                    <div style={{ gridColumn: '1 / -1', marginTop: 6 }}>
                                        <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{trelloSync.result.errors.length} errors</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', maxHeight: 80, overflow: 'auto' }}>
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
                <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>
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
                        { method: 'GET', path: '/api/integrations/notebooklm/status', label: 'NotebookLM Status' },
                        { method: 'PUT', path: '/api/integrations/notebooklm/settings', label: 'Save NotebookLM Settings' },
                        { method: 'GET', path: '/api/integrations/notebooklm/notebooks/recent', label: 'Recent NotebookLM Notebooks' },
                        { method: 'POST', path: '/api/integrations/notebooklm/notebooks', label: 'Create NotebookLM Notebook' },
                        { method: 'POST', path: '/api/integrations/notebooklm/notebooks/:id/sources/text', label: 'Add NotebookLM Text Source' },
                        { method: 'POST', path: '/api/integrations/notebooklm/notebooks/:id/sources/web', label: 'Add NotebookLM Web Source' },
                        { method: 'POST', path: '/api/integrations/notebooklm/notebooks/:id/sources/file', label: 'Upload NotebookLM File' },
                        { method: 'GET', path: '/api/integrations/notebooklm/mcp-config', label: 'Claude MCP Config' },
                        { method: 'GET', path: '/api/features/time-clock/entries', label: 'Time Clock Entries' },
                        { method: 'GET', path: '/api/features/lessons', label: 'Lessons Learned' },
                        { method: 'POST', path: '/api/dwellium/trello-sync', label: 'Trello → Strata Sync' },
                        { method: 'GET', path: '/api/dwellium/trello-sync/status', label: 'Sync Status' },
                    ].map(ep => (
                        <div key={ep.path} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
                            <span style={{
                                background: ep.method === 'GET' ? 'rgba(16,185,129,0.15)' : 'rgba(214,254,81,0.15)',
                                color: ep.method === 'GET' ? '#10b981' : '#D6FE51',
                                padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace',
                                fontWeight: 700, fontSize: '10px', minWidth: '36px', textAlign: 'center' as const,
                            }}>{ep.method}</span>
                            <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '11px' }}>{ep.path}</span>
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
    const [searchNavTarget, setSearchNavTarget] = useState<SearchNavTarget | null>(null);

    const renderModule = () => {
        switch (activeModule) {
            case 'overview': return hasPermission('strata:module:overview') ? <OverviewContent /> : null;
            case 'manager-home': return hasPermission('strata:module:manager-home') ? <ManagerHome /> : null;
            case 'calendar': return hasPermission('strata:module:calendar') ? <CalendarModule /> : null;
            case 'properties': return hasPermission('strata:module:properties') ? <PropertiesModule searchNavTarget={searchNavTarget} onNavComplete={() => setSearchNavTarget(null)} /> : null;
            case 'work-orders': return hasPermission('strata:module:maintenance') ? <WorkOrdersModule /> : null;
            case 'leasing': return hasPermission('strata:module:leasing') ? <LeasingModule /> : null;
            case 'residents': return hasPermission('strata:module:residents') ? <ResidentsModule searchNavTarget={searchNavTarget} onNavComplete={() => setSearchNavTarget(null)} /> : null;
            case 'vendors': return hasPermission('strata:module:vendors') ? <VendorsModule searchNavTarget={searchNavTarget} onNavComplete={() => setSearchNavTarget(null)} /> : null;
            case 'owners': return hasPermission('strata:module:owners') ? <OwnersModule searchNavTarget={searchNavTarget} onNavComplete={() => setSearchNavTarget(null)} /> : null;
            case 'accounting': return hasPermission('strata:module:accounting') ? <AccountingModule /> : null;
            case 'maintenance': return hasPermission('strata:module:maintenance') ? <MaintenanceModule /> : null;
            case 'reporting': return hasPermission('strata:module:reporting') ? <ReportingModule /> : null;
            case 'communication': return hasPermission('strata:module:communication') ? <CommunicationModule /> : null;
            case 'profiles': return hasPermission('strata:module:profiles') ? <ProfilesModule /> : null;
            case 'corporate-review': return hasPermission('strata:module:corporate-review') ? <CorporateReview /> : null;
            case 'integrations': return hasPermission('strata:module:integrations') ? <IntegrationsModule /> : null;
            case 'tenant-portal': return hasPermission('strata:module:tenant-portal') ? <TenantPortalModule /> : null;
            case 'forecast': return hasPermission('strata:module:forecast') ? <ForecastModule /> : null;
            case 'sentiment': return hasPermission('strata:module:sentiment') ? <SentimentModule /> : null;
            case 'legal': return hasPermission('strata:module:legal') ? <LegalModule /> : null;
            case 'projects': return hasPermission('strata:module:projects') ? <ProjectsModule /> : null;
            case 'audit': return hasPermission('strata:module:audit') ? <AuditModule /> : null;
            case 'status-check': return hasPermission('strata:module:status-check') ? <StatusCheckModule /> : null;
            case 'visualization': return hasPermission('strata:module:visualization') ? <VisualizationModule /> : null;
            case 'incidents': return hasPermission('strata:module:incidents') ? <IncidentModule /> : null;
            case 'compliance': return hasPermission('strata:module:compliance') ? <ComplianceEngine /> : null;
            case 'design-studio': return hasPermission('strata:module:design-studio') ? <DesignStudio /> : null;
            case 'civil-engineering': return hasPermission('strata:module:civil-engineering') ? <CivilEngineeringStudio /> : null;
            case 'settings': return <StrataAdminSettings />;
        }
    };

    return (
        <StrataNavProvider setActiveModule={setActiveModule} setSearchNavTarget={setSearchNavTarget}>
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
                                insurance: 'properties',
                                email: 'communication',
                            };
                            const mod = typeToModule[r.type] as StrataModule;
                            if (mod) {
                                setSearchNavTarget({ type: r.type, id: r.id });
                                setActiveModule(mod);
                            }
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

                        {hasPermission('section:strata-settings') && (
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
        </StrataNavProvider>
    );
}
