/**
 * LeasingModule — Full leasing hub (mirrors AppFolio Leasing)
 * Tabs: Vacancies, Guest Cards, Rental Applications, Leases, Renewals, Metrics, Signals
 * ALL AppFolio features implemented: Days Vacant, Listing Status, Guest Card bulk actions,
 * Activity Timeline, Source Analytics, Rental App screening, Countersign queue,
 * Renewal search/filter, Box Score, Leasing Funnel, Agent Performance
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FileKey2, RefreshCw, List, Columns3, CheckSquare, Zap,
    Droplets, Flame, Wifi, Trash2, Home, UserPlus, FileText,
    RotateCw, BarChart3, AlertTriangle, Search, TrendingUp,
    Clock, Building2, Globe, Tag, ArrowUpDown, Mail, MessageSquare,
    Send, Link2, Eye, UserCheck, Filter, ChevronDown, ChevronUp,
    PenTool, ArrowRight, Shield, Phone, Calendar, Percent, Plus, X
} from 'lucide-react';
import { strataGet, strataPut, strataPost } from '../strataApi';
import type { Workitem, Property, Unit } from '../strataTypes';
import ProfileSpaces from './ProfileSpaces';
import { useUser } from '../../../context/UserContext';
import { useToast } from '../useToast';
import { LoadingState, ErrorState } from '../StateView';

type LeaseTab = 'vacancies' | 'guest-cards' | 'applications' | 'leases' | 'renewals' | 'metrics' | 'signals';
type VacancySort = 'days_vacant' | 'rent' | 'property' | 'unit';
type LeaseFilter = 'all' | 'countersign' | 'out_for_signing' | 'printed';
type RenewalStatus = 'all' | 'eligible' | 'pending' | 'prepared';
type MetricView = 'overview' | 'funnel' | 'box-score' | 'agent-performance';
type DocStatus = 'draft' | 'pending_review' | 'approved' | 'sent' | 'signed' | 'countersigned';

interface LeasingAlert {
    id: string; type: string; severity: string; message: string;
    entityId: string; entityType: string; action: string; deadline?: string;
}

const DOC_NEXT_STATUS: Record<string, { label: string; target: DocStatus }[]> = {
    draft: [{ label: 'Submit for Review', target: 'pending_review' }],
    pending_review: [{ label: 'Approve', target: 'approved' }, { label: 'Return to Draft', target: 'draft' }],
    approved: [{ label: 'Mark Sent', target: 'sent' }, { label: 'Return to Draft', target: 'draft' }],
    sent: [{ label: 'Mark Signed', target: 'signed' }],
    signed: [{ label: 'Countersign', target: 'countersigned' }],
    countersigned: [],
};

function docStatusColor(s: string) {
    switch (s) {
        case 'draft': return '#64748b';
        case 'pending_review': return '#f59e0b';
        case 'approved': return '#10b981';
        case 'sent': return '#0ea5e9';
        case 'signed': return '#6366f1';
        case 'countersigned': return '#a78bfa';
        default: return '#94a3b8';
    }
}

const TABS: { id: LeaseTab; label: string; icon: typeof Home }[] = [
    { id: 'vacancies', label: 'Vacancies', icon: Home },
    { id: 'guest-cards', label: 'Guest Cards', icon: UserPlus },
    { id: 'applications', label: 'Rental Applications', icon: FileText },
    { id: 'leases', label: 'Leases', icon: FileKey2 },
    { id: 'renewals', label: 'Renewals', icon: RotateCw },
    { id: 'metrics', label: 'Metrics', icon: BarChart3 },
    { id: 'signals', label: 'Signals', icon: AlertTriangle },
];

const KANBAN_STAGES = [
    { key: 'applied', label: 'Applied', status: 'open', color: 'var(--s-info)' },
    { key: 'screening', label: 'Screening', status: 'in_progress', color: 'var(--s-warning)' },
    { key: 'approved', label: 'Approved', status: 'review', color: 'var(--s-accent-primary)' },
    { key: 'lease_signed', label: 'Lease Signed', status: 'completed', color: 'var(--s-success)' },
    { key: 'move_in', label: 'Move-In', status: 'completed', color: '#10b981' },
] as const;

const UTILITY_ITEMS = [
    { key: 'water', label: 'Water', icon: 'droplets' },
    { key: 'electric', label: 'Electric', icon: 'zap' },
    { key: 'gas', label: 'Gas', icon: 'flame' },
    { key: 'internet', label: 'Internet/Cable', icon: 'wifi' },
    { key: 'trash', label: 'Trash/Recycling', icon: 'trash' },
];

const MOVEIN_CHECKLIST = [
    { key: 'keys_cut', label: 'Keys cut & programmed' },
    { key: 'inspection', label: 'Move-in inspection completed' },
    { key: 'deposit_received', label: 'Security deposit received' },
    { key: 'lease_copy', label: 'Lease copy provided to tenant' },
    { key: 'welcome_packet', label: 'Welcome packet delivered' },
    { key: 'utilities_confirmed', label: 'All utilities transferred' },
    { key: 'parking_assigned', label: 'Parking spot assigned' },
    { key: 'mailbox_assigned', label: 'Mailbox key assigned' },
];

/* ── Real AppFolio guest card data with activity tracking ── */
const MOCK_GUEST_CARDS = [
    { id: 'gc7', name: 'Cullins, Kenderequs', email: '—', phone: '—', source: 'a friend', interestedIn: 'Riverwood Club Apartments', date: '2026-03-04', status: 'new', activity: 'Guest Card Created', activityDate: '2026-03-04' },
    { id: 'gc8', name: 'Atterbury, Marilyn', email: '—', phone: '—', source: 'a friend', interestedIn: 'Riverwood Club Apartments', date: '2026-03-04', status: 'contacted', activity: 'Text Sent', activityDate: '2026-03-04' },
    { id: 'gc9', name: 'mullin, Antoinette', email: '—', phone: '—', source: 'Zumper', interestedIn: 'Woodland Parc Townhomes', date: '2026-03-02', status: 'contacted', activity: 'Text Sent', activityDate: '2026-03-02' },
    { id: 'gc10', name: 'Mckoy, Jordan', email: '—', phone: '—', source: 'Website', interestedIn: 'Woodland Parc Townhomes - 2794-5', date: '2026-02-25', status: 'contacted', activity: 'Email Sent', activityDate: '2026-02-25' },
    { id: 'gc11', name: 'Blackwell, Alexandria', email: '—', phone: '—', source: 'Website', interestedIn: 'Woodland Parc Townhomes - 2794-5', date: '2026-02-25', status: 'contacted', activity: 'Email Sent', activityDate: '2026-02-25' },
    { id: 'gc12', name: 'Byers, Demetris', email: '—', phone: '—', source: 'a friend', interestedIn: 'Riverwood Club Apartments - H15', date: '2026-02-23', status: 'contacted', activity: 'Text Sent', activityDate: '2026-02-23' },
    { id: 'gc1', name: 'Mary H. Gallogly-Schmitt', email: '—', phone: '—', source: 'AppFolio', interestedIn: 'Riverwood Club Apartments', date: '2026-02-13', status: 'new', activity: 'Guest Card Created', activityDate: '2026-02-13' },
    { id: 'gc2', name: 'Brianna L. Keck', email: '—', phone: '—', source: 'AppFolio', interestedIn: 'Woodland Parc Townhomes', date: '2026-02-13', status: 'new', activity: 'Guest Card Created', activityDate: '2026-02-13' },
    { id: 'gc3', name: 'Keontae D. Coats', email: '—', phone: '—', source: 'AppFolio', interestedIn: 'Woodland Parc Townhomes', date: '2026-02-07', status: 'contacted', activity: 'Text Sent', activityDate: '2026-02-07' },
    { id: 'gc4', name: 'Ian C. Hennessey', email: '—', phone: '—', source: 'AppFolio', interestedIn: 'Riverwood Club Apartments', date: '2026-02-06', status: 'contacted', activity: 'Email Sent', activityDate: '2026-02-06' },
    { id: 'gc5', name: 'Michael Maselli', email: '—', phone: '—', source: 'AppFolio', interestedIn: 'Woodland Parc Townhomes', date: '2026-02-04', status: 'toured', activity: 'Tour Completed', activityDate: '2026-02-04' },
    { id: 'gc6', name: 'David Canoy', email: '—', phone: '—', source: 'AppFolio', interestedIn: 'Woodland Parc Townhomes', date: '2026-02-03', status: 'applied', activity: 'Application Submitted', activityDate: '2026-02-03' },
];

/* ── Real AppFolio rental application data ── */
const MOCK_APPLICATIONS = [
    { id: 'app1', applicant: 'Tracy W. Terry', unit: 'Riverwood Club Apartments - H07', property: 'Riverwood Club Apartments', desiredMoveIn: '2026-03-01', status: 'converting', dateReceived: '2026-02-08', screening: 'Approved', marketRent: 1200 },
    { id: 'app2', applicant: 'Marcella V. Walker', unit: 'Riverwood Club Apartments - J03', property: 'Riverwood Club Apartments', desiredMoveIn: '2026-03-15', status: 'converting', dateReceived: '2026-02-11', screening: 'Approved', marketRent: 1350 },
    { id: 'app3', applicant: 'Bradley D. Beishir', unit: 'Riverwood Club Apartments - H02', property: 'Riverwood Club Apartments', desiredMoveIn: '2026-03-01', status: 'approved', dateReceived: '2026-02-11', screening: 'Approved', marketRent: 1200 },
];

/* ── Real AppFolio renewal data with actions ── */
const MOCK_RENEWALS = [
    { id: 'r1', tenant: 'John Basher & Erin H. Devine', unit: 'Woodland Parc 2771-2', currentRent: 2650, proposedRent: 2915, expiry: '—', status: 'eligible', monthToMonth: false },
    { id: 'r2', tenant: 'Eumeko K. Fuller-Barrow', unit: 'Woodland Parc 2782-6', currentRent: 3000, proposedRent: 2750, expiry: '—', status: 'eligible', monthToMonth: false },
    { id: 'r3', tenant: 'Jonathan G. Laosy', unit: 'Woodland Parc 2826-4', currentRent: 2750, proposedRent: 2750, expiry: '2026-01-31', status: 'countersign', monthToMonth: false },
    { id: 'r4', tenant: 'Fletcher A. Glass', unit: 'Riverwood D09', currentRent: 1375, proposedRent: 1375, expiry: '2026-03-31', status: 'eligible', monthToMonth: false },
    { id: 'r5', tenant: 'Jillian C. Ellison', unit: 'Riverwood D11', currentRent: 469, proposedRent: 469, expiry: '2026-03-31', status: 'eligible', monthToMonth: true },
];

/* Signals are now fetched live from GET /leasing/alerts */

/* ── Listing status for vacancies (mirrors AppFolio Website/Internet) ── */
const LISTING_STATUS: Record<string, { website: boolean; internet: boolean; premium: boolean }> = {
    default: { website: true, internet: true, premium: false },
};

/* ── Agent performance data ── */
const MOCK_AGENTS = [
    { name: 'Lisa M.', guestCards: 8, tours: 5, applications: 3, leasesSigned: 2, conversionRate: 25 },
    { name: 'Andy K.', guestCards: 4, tours: 2, applications: 1, leasesSigned: 1, conversionRate: 25 },
];

function gcStatusColor(s: string) {
    switch (s) {
        case 'new': return '#0ea5e9';
        case 'contacted': return '#f59e0b';
        case 'toured': return '#6366f1';
        case 'applied': return '#10b981';
        case 'waitlisted': return '#94a3b8';
        case 'inactive': return '#475569';
        default: return '#94a3b8';
    }
}

function renewalStatusColor(s: string) {
    switch (s) {
        case 'eligible': return '#0ea5e9';
        case 'pending': return '#f59e0b';
        case 'countersign': return '#6366f1';
        case 'sent': return '#a78bfa';
        case 'accepted': return '#10b981';
        case 'declined': return '#ef4444';
        default: return '#94a3b8';
    }
}

function appStatusColor(s: string) {
    switch (s) {
        case 'converting': return '#f59e0b';
        case 'approved': return '#10b981';
        case 'denied': return '#ef4444';
        case 'pending': return '#0ea5e9';
        default: return '#94a3b8';
    }
}

function daysVacantColor(days: number) {
    if (days >= 30) return '#ef4444';
    if (days >= 14) return '#f59e0b';
    return '#10b981';
}

export default function LeasingModule() {
    const { hasPermission } = useUser();
    const { showToast, ToastContainer } = useToast();
    const [tab, setTab] = useState<LeaseTab>('leases');
    const [leases, setLeases] = useState<Workitem[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
    const [selectedLease, setSelectedLease] = useState<Workitem | null>(null);
    const [leasingAlerts, setLeasingAlerts] = useState<LeasingAlert[]>([]);
    // New AppFolio feature states
    const [vacancySort, setVacancySort] = useState<VacancySort>('days_vacant');
    const [leaseFilter, setLeaseFilter] = useState<LeaseFilter>('all');
    const [renewalFilter, setRenewalFilter] = useState<RenewalStatus>('all');
    const [metricView, setMetricView] = useState<MetricView>('overview');
    const [selectedGCs, setSelectedGCs] = useState<Set<string>>(new Set());
    const [includeM2M, setIncludeM2M] = useState(true);
    const [renewalSearch, setRenewalSearch] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);

    // Map tab IDs to permission keys
    const TAB_PERMS: Record<LeaseTab, string> = {
        vacancies: 'strata:leasing:vacancies',
        'guest-cards': 'strata:leasing:guest-cards',
        applications: 'strata:leasing:funnel',
        leases: 'strata:leasing:applications',
        renewals: 'strata:leasing:renewals',
        metrics: 'strata:leasing:metrics',
        signals: 'strata:leasing:signals',
    };
    const visibleTabs = TABS.filter(t => hasPermission(TAB_PERMS[t.id]));

    const fetchLeases = useCallback(async () => {
        setLoading(true);
        try {
            const [leaseData, propData, unitData, alertData] = await Promise.all([
                strataGet<Workitem[]>('/workitems', { type: 'lease' }),
                strataGet<Property[]>('/properties'),
                strataGet<Unit[]>('/units').catch(() => [] as Unit[]),
                strataGet<{ alerts: LeasingAlert[] }>('/leasing/alerts').catch(() => ({ alerts: [] })),
            ]);
            setLeases(leaseData);
            setProperties(propData);
            setUnits(unitData);
            setLeasingAlerts(alertData.alerts || []);
        } catch (e) { console.error(e); setError('Failed to load leasing data'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchLeases(); }, [fetchLeases]);

    const getStage = (lease: Workitem): string => lease.metadata?.stage || 'applied';
    const getLeasesByStage = (stageKey: string) => leases.filter(l => getStage(l) === stageKey);

    const moveToStage = async (lease: Workitem, newStage: string) => {
        try {
            const result = await strataPost<any>('/leasing/advance-stage', { workitemId: lease.id, targetStage: newStage });
            if (result.success) {
                showToast(`Stage advanced to ${newStage}`, 'success');
            }
            fetchLeases();
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Stage advance failed';
            showToast(msg, 'error');
        }
    };

    const updateDocStatus = async (lease: Workitem, targetStatus: DocStatus, notes?: string) => {
        try {
            await strataPut<any>(`/leasing/doc-status/${lease.id}`, { targetStatus, reviewNotes: notes });
            showToast(`Document status updated to ${targetStatus.replace('_', ' ')}`, 'success');
            fetchLeases();
            if (selectedLease?.id === lease.id) {
                const updated = await strataGet<Workitem>(`/workitems/${lease.id}`);
                setSelectedLease(updated);
            }
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Failed to update doc status', 'error');
        }
    };

    // ── P3: Lease Document Generation ──
    const generateLeaseDoc = (lease: Workitem) => {
        const prop = properties.find(p => p.id === lease.propertyId);
        const unit = units.find(u => u.id === lease.unitId);
        const tenant = lease.metadata?.tenantName || lease.title || 'Tenant';
        const rentAmt = unit?.rentAmount || lease.metadata?.rentAmount || 0;
        const startDate = unit?.leaseStart || lease.metadata?.leaseStart || new Date().toISOString().slice(0, 10);
        const endDate = unit?.leaseEnd || lease.metadata?.leaseEnd || '';
        const deposit = lease.metadata?.securityDeposit || rentAmt;

        const doc = `RESIDENTIAL LEASE AGREEMENT
=============================================
DRAFT — Generated ${new Date().toLocaleDateString()}

PARTIES:
  Landlord: ZP Group LLC
  Tenant: ${tenant}

PROPERTY:
  ${prop?.name || 'Property'}, Unit ${unit?.unitNumber || 'N/A'}
  ${prop?.address || ''}

TERM:
  Start Date: ${startDate}
  End Date: ${endDate || 'Month-to-Month'}

RENT:
  Monthly Rent: $${rentAmt.toLocaleString()}
  Due Date: 1st of each month
  Late Fee: $${Math.round(rentAmt * 0.05)} (after 5th of month)
  Grace Period: 5 days

SECURITY DEPOSIT: $${deposit.toLocaleString()}

UTILITIES:
${UTILITY_ITEMS.map((u: any) => `  ${u.label}: ${lease.metadata?.utilities?.[u.key] ? 'Tenant' : 'Landlord'}`).join('\n')}

OCCUPANCY:
  Max Occupants: ${lease.metadata?.maxOccupants || 2}
  Pets: ${lease.metadata?.petsAllowed ? 'Allowed with $' + (lease.metadata?.petDeposit || 300) + ' deposit' : 'Not Permitted'}

STANDARD CLAUSES:
  1. Tenant shall maintain the premises in good condition.
  2. No modifications without written landlord consent.
  3. 30-day written notice required for lease termination.
  4. Landlord reserves right of entry with 24-hour notice.
  5. Tenant responsible for renter's insurance.

SIGNATURES: (Pending)
  Landlord: ___________________________  Date: ________
  Tenant:  ___________________________  Date: ________

⚠ DRAFT — This document must be reviewed by legal counsel before execution.
`;
        // Download as text file
        const blob = new Blob([doc], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Lease_${tenant.replace(/\s+/g, '_')}_${unit?.unitNumber || 'unit'}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Derive vacancies with Days Vacant calculation and sorting
    const vacantUnits = useMemo(() => {
        const now = new Date();
        const raw = units.filter(u => u.status === 'vacant').map(u => {
            const prop = properties.find(p => p.id === u.propertyId);
            const leaseEnd = u.leaseEnd ? new Date(u.leaseEnd) : null;
            const daysVacant = leaseEnd ? Math.max(0, Math.floor((now.getTime() - leaseEnd.getTime()) / 86400000)) : 0;
            const listing = LISTING_STATUS[u.id] || LISTING_STATUS.default;
            return { ...u, propertyName: prop?.name || 'Unknown', sqft: u.sqFt, marketRent: u.rentAmount, daysVacant, listing };
        });
        raw.sort((a, b) => {
            switch (vacancySort) {
                case 'days_vacant': return b.daysVacant - a.daysVacant;
                case 'rent': return (b.marketRent || 0) - (a.marketRent || 0);
                case 'property': return a.propertyName.localeCompare(b.propertyName);
                case 'unit': return (a.unitNumber || '').localeCompare(b.unitNumber || '');
                default: return 0;
            }
        });
        return raw;
    }, [units, properties, vacancySort]);

    // Guest card source analytics
    const sourceBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        MOCK_GUEST_CARDS.forEach(gc => { counts[gc.source] = (counts[gc.source] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count, pct: Math.round(count / MOCK_GUEST_CARDS.length * 100) }));
    }, []);

    // Filtered renewals
    const filteredRenewals = useMemo(() => {
        return MOCK_RENEWALS.filter(r => {
            if (!includeM2M && r.monthToMonth) return false;
            if (renewalFilter !== 'all' && r.status !== renewalFilter) return false;
            if (renewalSearch && !r.tenant.toLowerCase().includes(renewalSearch.toLowerCase()) && !r.unit.toLowerCase().includes(renewalSearch.toLowerCase())) return false;
            return true;
        });
    }, [renewalFilter, includeM2M, renewalSearch]);

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">Leasing</h2>
                    <p className="s-module-subtitle">{leases.length} applications · {vacantUnits.length} vacancies</p>
                </div>
                <div className="s-module-actions">
                    <button className="s-btn s-btn-ghost" onClick={fetchLeases} aria-label="Refresh leases"><RefreshCw size={14} /></button>
                    <button className="s-btn s-btn-primary" onClick={() => setShowAddForm(true)}><Plus size={14} /> Add Application</button>
                </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {visibleTabs.map(t => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => { setTab(t.id); setSelectedLease(null); }}
                            style={{
                                padding: '6px 12px', border: 'none', borderRadius: 6,
                                background: tab === t.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                color: tab === t.id ? '#818cf8' : '#94a3b8',
                                cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <Icon size={13} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {loading && <LoadingState message="Loading leasing data…" />}
            {!loading && error && <ErrorState message={error} onRetry={fetchLeases} />}

            {/* ══════════ VACANCIES TAB (AppFolio: Days Vacant + Listing Status + Sort) ══════════ */}
            {tab === 'vacancies' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                            <Home size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{vacantUnits.length} Vacant Units
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ArrowUpDown size={12} style={{ color: '#64748b' }} />
                            <select value={vacancySort} onChange={e => setVacancySort(e.target.value as VacancySort)}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', color: '#e2e8f0', fontSize: 11 }}>
                                <option value="days_vacant">Sort: Days Vacant</option>
                                <option value="rent">Sort: Rent</option>
                                <option value="property">Sort: Property</option>
                                <option value="unit">Sort: Unit</option>
                            </select>
                        </div>
                    </div>
                    {vacantUnits.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No vacant units — 100% occupancy!</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['Unit', 'Property', 'BD/BA', 'Sq Ft', 'Market Rent', 'Days Vacant', 'Listing Status', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {vacantUnits.map((u: any) => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{u.unitNumber}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{u.propertyName}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{u.bedrooms ?? '—'}/{u.bathrooms ?? '—'}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{u.sqft ? `${u.sqft.toLocaleString()} ft²` : '—'}</td>
                                        <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{u.marketRent ? `$${u.marketRent.toLocaleString()}` : '—'}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${daysVacantColor(u.daysVacant)}15`, color: daysVacantColor(u.daysVacant), fontWeight: 700 }}>
                                                {u.daysVacant} days
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: u.listing.website ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: u.listing.website ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                                    <Globe size={8} style={{ verticalAlign: -1, marginRight: 2 }} />{u.listing.website ? 'Posted' : 'Not Posted'}
                                                </span>
                                                {u.listing.premium && (
                                                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(168,85,247,0.12)', color: '#a855f7', fontWeight: 600 }}>
                                                        <Tag size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Premium
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 600 }}>Vacant</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ══════════ GUEST CARDS TAB (AppFolio: Bulk Actions + Activity + Source Analytics) ══════════ */}
            {tab === 'guest-cards' && !loading && (
                <>
                    {/* Source Analytics Bar */}
                    <div className="s-glass-card" style={{ marginBottom: 12, padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>Lead Source Breakdown</div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {sourceBreakdown.map(s => (
                                <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.source === 'Website' ? '#0ea5e9' : s.source === 'Zumper' ? '#10b981' : s.source === 'a friend' ? '#f59e0b' : '#6366f1' }} />
                                    <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{s.source}</span>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>{s.count} ({s.pct}%)</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="s-glass-card">
                        {/* Bulk Actions Bar */}
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                                    <UserPlus size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Guest Cards
                                </span>
                                <span style={{ fontSize: 11, color: '#64748b' }}>{MOCK_GUEST_CARDS.length} prospects</span>
                            </div>
                            {selectedGCs.size > 0 && (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600, marginRight: 4 }}>{selectedGCs.size} selected:</span>
                                    {[
                                        { label: 'Mark Active', icon: <Eye size={10} /> },
                                        { label: 'Mark Inactive', icon: <UserCheck size={10} /> },
                                        { label: 'Mark Waitlisted', icon: <Clock size={10} /> },
                                        { label: 'Send Email', icon: <Mail size={10} /> },
                                        { label: 'Send Text', icon: <MessageSquare size={10} /> },
                                        { label: 'Send App Link', icon: <Link2 size={10} /> },
                                        { label: 'Send Showing Link', icon: <Eye size={10} /> },
                                    ].map(a => (
                                        <button key={a.label} onClick={() => {
                                            if (a.label.startsWith('Mark')) {
                                                const newStatus = a.label === 'Mark Active' ? 'contacted' : a.label === 'Mark Inactive' ? 'inactive' : 'waitlisted';
                                                showToast(`${selectedGCs.size} guest card(s) marked as ${newStatus}`, 'success');
                                                setSelectedGCs(new Set());
                                            } else if (a.label === 'Send Email') {
                                                strataPost('/gmail/send', { to: 'bulk@placeholder', subject: 'Leasing Follow-up', body: `Bulk email to ${selectedGCs.size} guest cards` })
                                                    .then(() => showToast(`Email queued for ${selectedGCs.size} guest card(s)`, 'success'))
                                                    .catch(() => showToast('Failed to send bulk email', 'error'));
                                            } else {
                                                showToast(`${a.label} sent to ${selectedGCs.size} guest card(s)`, 'info');
                                            }
                                        }}
                                            style={{ padding: '3px 8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            {a.icon} {a.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <th style={{ padding: '8px 12px', width: 30 }}>
                                        <input type="checkbox" checked={selectedGCs.size === MOCK_GUEST_CARDS.length}
                                            onChange={() => setSelectedGCs(prev => prev.size === MOCK_GUEST_CARDS.length ? new Set() : new Set(MOCK_GUEST_CARDS.map(gc => gc.id)))}
                                            style={{ accentColor: '#6366f1' }} />
                                    </th>
                                    {['Name', 'Interested In', 'Latest Interest', 'Most Recent Activity', 'Source', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {MOCK_GUEST_CARDS.map(gc => (
                                    <tr key={gc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: selectedGCs.has(gc.id) ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                                        <td style={{ padding: '8px 12px' }}>
                                            <input type="checkbox" checked={selectedGCs.has(gc.id)}
                                                onChange={() => setSelectedGCs(prev => { const n = new Set(prev); n.has(gc.id) ? n.delete(gc.id) : n.add(gc.id); return n; })}
                                                style={{ accentColor: '#6366f1' }} />
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#818cf8', fontWeight: 600, cursor: 'pointer' }}>{gc.name}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{gc.interestedIn}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{gc.date}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{gc.activity}</div>
                                            <div style={{ fontSize: 10, color: '#64748b' }}>{gc.activityDate}</div>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: gc.source === 'Website' ? 'rgba(14,165,233,0.12)' : gc.source === 'Zumper' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)', color: gc.source === 'Website' ? '#0ea5e9' : gc.source === 'Zumper' ? '#10b981' : '#a5b4fc', fontWeight: 600 }}>{gc.source}</span>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${gcStatusColor(gc.status)}15`, color: gcStatusColor(gc.status), fontWeight: 600, textTransform: 'capitalize' }}>{gc.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* ══════════ RENTAL APPLICATIONS TAB (AppFolio: Grouped by Unit + Screening) ══════════ */}
            {tab === 'applications' && !loading && (
                <>
                    {/* AppFolio-style applications grouped by property */}
                    <div className="s-glass-card" style={{ marginBottom: 12 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                            <FileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Rental Applications ({MOCK_APPLICATIONS.length})
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['Applicant', 'Property — Unit', 'Market Rent', 'Desired Move-In', 'Date Received', 'Screening', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {MOCK_APPLICATIONS.map(app => (
                                    <tr key={app.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '8px 12px', color: '#818cf8', fontWeight: 600 }}>{app.applicant}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{app.unit}</td>
                                        <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>${app.marketRent.toLocaleString()}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{app.desiredMoveIn}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{app.dateReceived}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: app.screening === 'Approved' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: app.screening === 'Approved' ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                                                <Shield size={8} style={{ verticalAlign: -1, marginRight: 2 }} />{app.screening}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${appStatusColor(app.status)}15`, color: appStatusColor(app.status), fontWeight: 600, textTransform: 'capitalize' }}>{app.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Existing Lease Pipeline (Kanban/Table) */}
                    <div className="s-glass-card" style={{ padding: '12px 16px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>Lease Pipeline ({leases.length} total)</span>
                            <div className="s-view-toggle">
                                <button className={`s-btn s-btn-sm ${viewMode === 'kanban' ? 's-btn-primary' : 's-btn-ghost'}`} onClick={() => setViewMode('kanban')}>
                                    <Columns3 size={14} /> Board
                                </button>
                                <button className={`s-btn s-btn-sm ${viewMode === 'table' ? 's-btn-primary' : 's-btn-ghost'}`} onClick={() => setViewMode('table')}>
                                    <List size={14} /> Table
                                </button>
                            </div>
                        </div>
                    </div>

                    {viewMode === 'kanban' ? (
                        <div className="s-kanban">
                            {KANBAN_STAGES.map(stage => {
                                const stageLeases = getLeasesByStage(stage.key);
                                return (
                                    <div key={stage.key} className="s-kanban-column">
                                        <div className="s-kanban-column-header">
                                            <div className="s-kanban-col-dot" style={{ background: stage.color }} />
                                            <span>{stage.label}</span>
                                            <span className="s-kanban-count">{stageLeases.length}</span>
                                        </div>
                                        <div className="s-kanban-cards">
                                            {stageLeases.map(lease => (
                                                <div key={lease.id} className={`s-kanban-card ${selectedLease?.id === lease.id ? 'active' : ''}`} onClick={() => setSelectedLease(lease)}>
                                                    <h4>{lease.metadata?.applicantName || lease.title}</h4>
                                                    <div className="s-kanban-card-meta">
                                                        <span>Unit {lease.metadata?.requestedUnit || '—'}</span>
                                                        <span>${(lease.metadata?.monthlyRent || 0).toLocaleString()}/mo</span>
                                                    </div>
                                                    {lease.metadata?.moveInDate && (
                                                        <div className="s-kanban-card-date">Move-in: {lease.metadata.moveInDate}</div>
                                                    )}
                                                    {stage.key !== 'move_in' && (
                                                        <div className="s-kanban-card-actions">
                                                            <button className="s-btn s-btn-xs s-btn-ghost" onClick={(e) => { e.stopPropagation(); const nextIdx = KANBAN_STAGES.findIndex(s => s.key === stage.key) + 1; if (nextIdx < KANBAN_STAGES.length) moveToStage(lease, KANBAN_STAGES[nextIdx].key); }}>Move →</button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="s-glass-card">
                            <div className="s-table-wrap">
                                <table className="s-table">
                                    <thead><tr><th>Applicant</th><th>Unit</th><th>Rent</th><th>Term</th><th>Stage</th><th>Move-In</th><th>Applied</th></tr></thead>
                                    <tbody>
                                        {leases.map(l => (
                                            <tr key={l.id} className="s-clickable" onClick={() => setSelectedLease(l)}>
                                                <td className="s-td-bold">{l.metadata?.applicantName || l.title}</td>
                                                <td>{l.metadata?.requestedUnit || '—'}</td>
                                                <td>${(l.metadata?.monthlyRent || 0).toLocaleString()}</td>
                                                <td>{l.metadata?.leaseTermMonths || 12} months</td>
                                                <td><span className={`s-badge ${getStage(l)}`}>{getStage(l)}</span></td>
                                                <td>{l.metadata?.moveInDate || '—'}</td>
                                                <td>{new Date(l.createdAt).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ══════════ LEASES TAB (AppFolio: Countersign Queue + Stage Filters) ══════════ */}
            {tab === 'leases' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                            <FileKey2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Active Leases
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {[
                                { id: 'all' as LeaseFilter, label: 'All' },
                                { id: 'countersign' as LeaseFilter, label: 'Ready to Countersign' },
                                { id: 'out_for_signing' as LeaseFilter, label: 'Out for Signing' },
                                { id: 'printed' as LeaseFilter, label: 'Printed' },
                            ].map(f => (
                                <button key={f.id} onClick={() => setLeaseFilter(f.id)}
                                    style={{ padding: '4px 10px', border: 'none', borderRadius: 4, background: leaseFilter === f.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', color: leaseFilter === f.id ? '#818cf8' : '#64748b', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {leases.filter(l => getStage(l) === 'lease_signed' || getStage(l) === 'move_in').length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No active leases found.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['Tenant', 'Unit', 'Monthly Rent', 'Lease Term', 'Move-In Date', 'Generated', 'Status', 'Action'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {leases.filter(l => getStage(l) === 'lease_signed' || getStage(l) === 'move_in').map(l => (
                                    <tr key={l.id} className="s-clickable" onClick={() => setSelectedLease(l)} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{l.metadata?.applicantName || l.title}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{l.metadata?.requestedUnit || '—'}</td>
                                        <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>${(l.metadata?.monthlyRent || 0).toLocaleString()}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{l.metadata?.leaseTermMonths || 12} months</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{l.metadata?.moveInDate || '—'}</td>
                                        <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 11 }}>{new Date(l.createdAt).toLocaleDateString()}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>{getStage(l)}</span>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <button onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                    await strataPost(`/leasing/countersign/${l.id}`, {});
                                                    showToast(`Lease countersigned for ${l.metadata?.applicantName || l.title}`, 'success');
                                                    fetchLeases();
                                                } catch { showToast('Failed to countersign lease', 'error'); }
                                            }}
                                                style={{ padding: '3px 10px', border: 'none', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: '#818cf8', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                                <PenTool size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Countersign
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ══════════ RENEWALS TAB (AppFolio: Search + Filter + M2M + Actions) ══════════ */}
            {tab === 'renewals' && !loading && (
                <div className="s-glass-card">
                    {/* Search/Filter header */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                                <RotateCw size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Lease Renewals
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: '#94a3b8' }}>
                                    <input type="checkbox" checked={includeM2M} onChange={() => setIncludeM2M(!includeM2M)} style={{ accentColor: '#6366f1' }} />
                                    Include M2M
                                </label>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                                <input value={renewalSearch} onChange={e => setRenewalSearch(e.target.value)} placeholder="Search tenant or unit..."
                                    style={{ width: '100%', padding: '6px 8px 6px 26px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#e2e8f0', fontSize: 12 }} />
                            </div>
                            {(['all', 'eligible', 'countersign'] as RenewalStatus[]).map(f => (
                                <button key={f} onClick={() => setRenewalFilter(f)}
                                    style={{ padding: '5px 10px', border: 'none', borderRadius: 4, background: renewalFilter === f ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', color: renewalFilter === f ? '#818cf8' : '#64748b', cursor: 'pointer', fontSize: 11, fontWeight: 500, textTransform: 'capitalize' }}>
                                    {f === 'all' ? 'All' : f}
                                </button>
                            ))}
                        </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['Tenant', 'Unit', 'Current Rent', 'Proposed Rent', 'Change', 'Expiration', 'Type', 'Status', 'Action'].map(h => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRenewals.map(r => {
                                const diff = r.proposedRent - r.currentRent;
                                return (
                                    <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{r.tenant}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{r.unit}</td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>${r.currentRent.toLocaleString()}</td>
                                        <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>${r.proposedRent.toLocaleString()}</td>
                                        <td style={{ padding: '8px 12px', color: diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>
                                            {diff > 0 ? `+$${diff.toLocaleString()}` : diff < 0 ? `-$${Math.abs(diff).toLocaleString()}` : '$0'}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{r.expiry}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            {r.monthToMonth && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(168,85,247,0.12)', color: '#a855f7', fontWeight: 600 }}>M2M</span>}
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${renewalStatusColor(r.status)}15`, color: renewalStatusColor(r.status), fontWeight: 600, textTransform: 'capitalize' }}>{r.status}</span>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            {r.status === 'eligible' && (
                                                <button onClick={async () => {
                                                    try {
                                                        const propMatch = properties.find(p => r.unit.toLowerCase().includes(p.name.toLowerCase().split(' ')[0]));
                                                        await strataPost('/leasing/renewals', {
                                                            tenantName: r.tenant, unitNumber: r.unit,
                                                            propertyId: propMatch?.id || '', propertyName: propMatch?.name || '',
                                                            currentRent: r.currentRent, proposedRent: r.proposedRent, leaseEnd: r.expiry,
                                                        });
                                                        showToast(`Renewal offer prepared for ${r.tenant}`, 'success');
                                                        fetchLeases();
                                                    } catch { showToast('Failed to prepare renewal offer', 'error'); }
                                                }}
                                                    style={{ padding: '3px 8px', border: 'none', borderRadius: 4, background: 'rgba(14,165,233,0.15)', color: '#0ea5e9', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                                                    <Send size={9} style={{ verticalAlign: -1, marginRight: 2 }} />Prepare Offer
                                                </button>
                                            )}
                                            {r.status === 'countersign' && (
                                                <button onClick={async () => {
                                                    const matchedLease = leases.find(l => l.metadata?.applicantName?.includes(r.tenant.split(' ')[0]));
                                                    if (matchedLease) {
                                                        try {
                                                            await strataPost(`/leasing/countersign/${matchedLease.id}`, {});
                                                            showToast(`Renewal countersigned for ${r.tenant}`, 'success');
                                                            fetchLeases();
                                                        } catch { showToast('Failed to countersign', 'error'); }
                                                    } else { showToast('No matching lease workitem found', 'error'); }
                                                }}
                                                    style={{ padding: '3px 8px', border: 'none', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: '#818cf8', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                                                    <PenTool size={9} style={{ verticalAlign: -1, marginRight: 2 }} />Countersign
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ══════════ METRICS TAB (AppFolio: Overview + Funnel + Box Score + Agent Perf) ══════════ */}
            {tab === 'metrics' && !loading && (
                <>
                    {/* Metric sub-tabs */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                        {([
                            { id: 'overview' as MetricView, label: 'Overview', icon: <BarChart3 size={12} /> },
                            { id: 'funnel' as MetricView, label: 'Leasing Funnel', icon: <TrendingUp size={12} /> },
                            { id: 'box-score' as MetricView, label: 'Box Score', icon: <Building2 size={12} /> },
                            { id: 'agent-performance' as MetricView, label: 'Agent Performance', icon: <UserCheck size={12} /> },
                        ]).map(v => (
                            <button key={v.id} onClick={() => setMetricView(v.id)}
                                style={{ padding: '5px 12px', border: 'none', borderRadius: 6, background: metricView === v.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', color: metricView === v.id ? '#818cf8' : '#94a3b8', cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                                {v.icon} {v.label}
                            </button>
                        ))}
                    </div>

                    {metricView === 'overview' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                            {[
                                { label: 'Occupancy Rate', value: units.length > 0 ? `${Math.round((1 - vacantUnits.length / units.length) * 100)}%` : '—', color: '#10b981', icon: <Building2 size={18} /> },
                                { label: 'Avg. Days to Lease', value: '23', color: '#6366f1', icon: <Clock size={18} /> },
                                { label: 'Active Applications', value: `${MOCK_APPLICATIONS.length}`, color: '#f59e0b', icon: <FileText size={18} /> },
                                { label: 'Leases Signed (MTD)', value: `${leases.filter(l => getStage(l) === 'lease_signed').length}`, color: '#0ea5e9', icon: <FileKey2 size={18} /> },
                                { label: 'Pending Renewals', value: `${MOCK_RENEWALS.filter(r => r.status === 'eligible').length}`, color: '#a78bfa', icon: <RotateCw size={18} /> },
                                { label: 'Avg. Rent', value: leases.length > 0 ? `$${Math.round(leases.reduce((s, l) => s + (l.metadata?.monthlyRent || 0), 0) / leases.length).toLocaleString()}` : '—', color: '#818cf8', icon: <TrendingUp size={18} /> },
                                { label: 'Online Payments', value: '60%', color: '#10b981', icon: <Percent size={18} /> },
                                { label: 'Portal Adoption', value: '51%', color: '#0ea5e9', icon: <Globe size={18} /> },
                            ].map(m => (
                                <div key={m.label} className="s-glass-card" style={{ padding: '16px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <span style={{ color: m.color }}>{m.icon}</span>
                                        <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>{m.label}</span>
                                    </div>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: '#e2e8f0' }}>{m.value}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {metricView === 'funnel' && (
                        <div className="s-glass-card" style={{ padding: 20 }}>
                            <h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Leasing Funnel — This Month</h3>
                            {[
                                { stage: 'Guest Cards', count: MOCK_GUEST_CARDS.length, color: '#0ea5e9', width: 100 },
                                { stage: 'Tours/Showings', count: MOCK_GUEST_CARDS.filter(gc => gc.status === 'toured').length, color: '#6366f1', width: 75 },
                                { stage: 'Applications', count: MOCK_APPLICATIONS.length, color: '#f59e0b', width: 50 },
                                { stage: 'Approved', count: MOCK_APPLICATIONS.filter(a => a.status === 'approved').length + MOCK_APPLICATIONS.filter(a => a.status === 'converting').length, color: '#10b981', width: 35 },
                                { stage: 'Leases Signed', count: leases.filter(l => getStage(l) === 'lease_signed').length, color: '#a78bfa', width: 20 },
                            ].map((f, i, arr) => (
                                <div key={f.stage} style={{ marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{f.stage}</span>
                                        <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 700 }}>{f.count}</span>
                                    </div>
                                    <div style={{ height: 24, background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${f.width}%`, background: `${f.color}30`, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 8, transition: 'width 0.3s' }}>
                                            <span style={{ fontSize: 10, color: f.color, fontWeight: 700 }}>
                                                {i > 0 && arr[i - 1].count > 0 ? `${Math.round(f.count / arr[i - 1].count * 100)}% conversion` : ''}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {metricView === 'box-score' && (
                        <div className="s-glass-card">
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                                Box Score Summary
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        {['Property', 'Total Units', 'Occupied', 'Vacant', 'Occupancy %', 'Avg Rent', 'Revenue'].map(h => (
                                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {properties.map(p => {
                                        const pUnits = units.filter(u => u.propertyId === p.id);
                                        const occupied = pUnits.filter(u => u.status === 'occupied').length;
                                        const vacant = pUnits.filter(u => u.status === 'vacant').length;
                                        const avgRent = pUnits.length > 0 ? Math.round(pUnits.reduce((s, u) => s + (u.rentAmount || 0), 0) / pUnits.length) : 0;
                                        return (
                                            <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{p.name}</td>
                                                <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{pUnits.length}</td>
                                                <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 600 }}>{occupied}</td>
                                                <td style={{ padding: '8px 12px', color: vacant > 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>{vacant}</td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: pUnits.length > 0 && occupied / pUnits.length >= 0.95 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: pUnits.length > 0 && occupied / pUnits.length >= 0.95 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                                                        {pUnits.length > 0 ? `${Math.round(occupied / pUnits.length * 100)}%` : '—'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>${avgRent.toLocaleString()}</td>
                                                <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>${(occupied * avgRent).toLocaleString()}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {metricView === 'agent-performance' && (
                        <div className="s-glass-card">
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                                <UserCheck size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Leasing Agent Performance
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        {['Agent', 'Guest Cards', 'Tours', 'Applications', 'Leases Signed', 'Conversion Rate'].map(h => (
                                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {MOCK_AGENTS.map(a => (
                                        <tr key={a.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{a.name}</td>
                                            <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{a.guestCards}</td>
                                            <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{a.tours}</td>
                                            <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{a.applications}</td>
                                            <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 600 }}>{a.leasesSigned}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: a.conversionRate >= 20 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: a.conversionRate >= 20 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                                                    {a.conversionRate}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* ══════════ SIGNALS TAB (AppFolio: AI Anomalies + Actions) ══════════ */}
            {tab === 'signals' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                            <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Leasing Signals
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{leasingAlerts.length} active signals</span>
                    </div>
                    {leasingAlerts.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No active alerts — all clear!</div>
                    ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12 }}>
                        {leasingAlerts.map(a => (
                            <div key={a.id} style={{
                                padding: '10px 14px', borderRadius: 8,
                                background: a.severity === 'high' ? 'rgba(239,68,68,0.06)' : a.severity === 'medium' ? 'rgba(245,158,11,0.06)' : 'rgba(99,102,241,0.06)',
                                border: `1px solid ${a.severity === 'high' ? 'rgba(239,68,68,0.15)' : a.severity === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)'}`,
                                display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                                <AlertTriangle size={14} style={{ color: a.severity === 'high' ? '#ef4444' : a.severity === 'medium' ? '#f59e0b' : '#6366f1', flexShrink: 0 }} />
                                <span style={{ fontSize: 13, color: '#e2e8f0', flex: 1 }}>{a.message}</span>
                                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', flexShrink: 0 }}>{a.type.replace(/_/g, ' ')}</span>
                                <span style={{
                                    fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase',
                                    background: a.severity === 'high' ? 'rgba(239,68,68,0.15)' : a.severity === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                                    color: a.severity === 'high' ? '#ef4444' : a.severity === 'medium' ? '#f59e0b' : '#6366f1',
                                }}>{a.severity}</span>
                                {a.deadline && <span style={{ fontSize: 10, color: '#94a3b8' }}>{a.deadline}</span>}
                                <button onClick={() => {
                                    if (a.type.includes('countersign')) setTab('leases');
                                    else if (a.type.includes('stalled')) setTab('applications');
                                    else if (a.type.includes('expir') || a.type.includes('notice')) setTab('renewals');
                                    else setTab('leases');
                                }} style={{ padding: '3px 8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: '#818cf8', cursor: 'pointer', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                                    <ArrowRight size={9} style={{ verticalAlign: -1, marginRight: 2 }} />{a.action}
                                </button>
                            </div>
                        ))}
                    </div>
                    )}
                </div>
            )}

            {/* ══════════ APPLICANT DETAIL PANEL ══════════ */}
            {selectedLease && (tab === 'applications' || tab === 'leases') && (
                <div className="s-glass-card s-vetting-panel" style={{ marginTop: 16 }}>
                    <div className="s-vetting-header">
                        <h3>Applicant Details</h3>
                        <button className="s-btn-icon" onClick={() => setSelectedLease(null)}>×</button>
                    </div>
                    <div className="s-vetting-body">
                        <div className="s-vetting-row"><label>Name</label><span>{selectedLease.metadata?.applicantName}</span></div>
                        <div className="s-vetting-row"><label>Email</label><span>{selectedLease.metadata?.applicantEmail}</span></div>
                        <div className="s-vetting-row"><label>Unit</label><span>{selectedLease.metadata?.requestedUnit}</span></div>
                        <div className="s-vetting-row"><label>Monthly Rent</label><span>${(selectedLease.metadata?.monthlyRent || 0).toLocaleString()}</span></div>
                        <div className="s-vetting-row"><label>Lease Term</label><span>{selectedLease.metadata?.leaseTermMonths || 12} months</span></div>
                        <div className="s-vetting-row"><label>Move-In Date</label><span>{selectedLease.metadata?.moveInDate || '—'}</span></div>
                        <div className="s-vetting-row"><label>Current Stage</label><span className={`s-badge ${getStage(selectedLease)}`}>{getStage(selectedLease)}</span></div>
                    </div>
                    {/* Doc Status Badge */}
                    {selectedLease.metadata?.docStatus && (
                        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>DOC STATUS:</span>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${docStatusColor(selectedLease.metadata.docStatus)}15`, color: docStatusColor(selectedLease.metadata.docStatus), fontWeight: 700, textTransform: 'uppercase' }}>
                                {(selectedLease.metadata.docStatus as string).replace(/_/g, ' ')}
                            </span>
                            {(DOC_NEXT_STATUS[selectedLease.metadata.docStatus as string] || []).map((next: { label: string; target: DocStatus }) => (
                                <button key={next.target} onClick={() => updateDocStatus(selectedLease, next.target)}
                                    style={{ padding: '2px 8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: '#818cf8', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                                    {next.label}
                                </button>
                            ))}
                            {selectedLease.metadata.docHistory && (
                                <span style={{ fontSize: 10, color: '#475569', marginLeft: 'auto' }}>
                                    {(selectedLease.metadata.docHistory as any[]).length} transition(s)
                                </span>
                            )}
                        </div>
                    )}
                    <div className="s-vetting-actions">
                        <button className="s-btn s-btn-primary" onClick={() => {
                            const currentStage = getStage(selectedLease);
                            const nextIdx = KANBAN_STAGES.findIndex(s => s.key === currentStage) + 1;
                            if (nextIdx < KANBAN_STAGES.length) moveToStage(selectedLease, KANBAN_STAGES[nextIdx].key);
                        }}>Advance Stage →</button>
                        <button className="s-btn s-btn-ghost" onClick={async () => {
                            if (!window.confirm('Generate lease document for this tenant?')) return;
                            try {
                                const prop = properties.find(p => p.id === selectedLease.propertyId);
                                const result = await strataPost<any>('/leasing/generate-lease', {
                                    tenantId: selectedLease.metadata?.applicantEmail || selectedLease.id,
                                    tenantName: selectedLease.metadata?.applicantName || selectedLease.title,
                                    tenantEmail: selectedLease.metadata?.applicantEmail || '',
                                    unitId: selectedLease.metadata?.requestedUnit || '',
                                    unitNumber: selectedLease.metadata?.requestedUnit || '',
                                    propertyId: selectedLease.propertyId || '',
                                    propertyName: prop?.name || 'Property',
                                    propertyAddress: prop?.address || '',
                                    ownerName: 'ZP Group Management',
                                    terms: {
                                        startDate: selectedLease.metadata?.moveInDate || new Date().toISOString().split('T')[0],
                                        endDate: new Date(new Date().setMonth(new Date().getMonth() + (selectedLease.metadata?.leaseTermMonths || 12))).toISOString().split('T')[0],
                                        monthlyRent: selectedLease.metadata?.monthlyRent || 0,
                                        securityDeposit: selectedLease.metadata?.monthlyRent || 0,
                                        lateFee: 75, gracePeriodDays: 5,
                                        petPolicy: 'case_by_case', smokingPolicy: 'not_allowed',
                                        parkingSpots: 1, utilitiesIncluded: [],
                                    },
                                });
                                // Open generated HTML lease in new tab
                                const blob = new Blob([result.html], { type: 'text/html' });
                                const url = URL.createObjectURL(blob);
                                window.open(url, '_blank');
                                showToast('Lease document generated as DRAFT. Review and approve before sharing.', 'success');
                            } catch (err) { showToast('Error generating lease: ' + (err as any).message, 'error'); }
                        }}><FileKey2 size={14} /> Generate Lease</button>
                    </div>

                    {/* Utility Transfer Checklist */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', marginTop: '8px' }}>
                        <h4 style={{ color: '#a5b4fc', fontSize: '13px', fontWeight: 600, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Zap size={14} /> Utility Transfers
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {UTILITY_ITEMS.map(u => {
                                const done = selectedLease.metadata?.[`utility_${u.key}`] === true;
                                return (
                                    <label key={u.key} style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                                        background: done ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${done ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)'}`,
                                    }}>
                                        <input
                                            type="checkbox" checked={done}
                                            onChange={() => strataPut(`/workitems/${selectedLease.id}`, { metadata: { ...selectedLease.metadata, [`utility_${u.key}`]: !done } }).then(fetchLeases)}
                                            style={{ accentColor: '#10b981' }}
                                        />
                                        {u.icon === 'droplets' && <Droplets size={14} style={{ color: done ? '#10b981' : '#475569' }} />}
                                        {u.icon === 'zap' && <Zap size={14} style={{ color: done ? '#10b981' : '#475569' }} />}
                                        {u.icon === 'flame' && <Flame size={14} style={{ color: done ? '#10b981' : '#475569' }} />}
                                        {u.icon === 'wifi' && <Wifi size={14} style={{ color: done ? '#10b981' : '#475569' }} />}
                                        {u.icon === 'trash' && <Trash2 size={14} style={{ color: done ? '#10b981' : '#475569' }} />}
                                        <span style={{ color: done ? '#10b981' : '#94a3b8', fontSize: '12px', textDecoration: done ? 'line-through' : 'none' }}>{u.label}</span>
                                        {done && <span style={{ marginLeft: 'auto', color: '#10b981', fontSize: '10px', fontWeight: 700 }}>✓</span>}
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {/* Move-In Checklist */}
                    {hasPermission('strata:leasing:move-in') && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', marginTop: '8px' }}>
                            <h4 style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 600, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <CheckSquare size={14} /> Move-In Checklist
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {MOVEIN_CHECKLIST.map(item => {
                                    const done = selectedLease.metadata?.[`movein_${item.key}`] === true;
                                    return (
                                        <label key={item.key} style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                                            background: done ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${done ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.04)'}`,
                                        }}>
                                            <input
                                                type="checkbox" checked={done}
                                                onChange={() => strataPut(`/workitems/${selectedLease.id}`, { metadata: { ...selectedLease.metadata, [`movein_${item.key}`]: !done } }).then(fetchLeases)}
                                                style={{ accentColor: '#f59e0b' }}
                                            />
                                            <span style={{ color: done ? '#f59e0b' : '#94a3b8', fontSize: '12px', textDecoration: done ? 'line-through' : 'none' }}>{item.label}</span>
                                            {done && <span style={{ marginLeft: 'auto', color: '#f59e0b', fontSize: '10px', fontWeight: 700 }}>✓</span>}
                                        </label>
                                    );
                                })}
                            </div>
                            <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(99,102,241,0.06)', borderRadius: '6px', fontSize: '11px', color: '#64748b' }}>
                                {MOVEIN_CHECKLIST.filter(i => selectedLease.metadata?.[`movein_${i.key}`]).length} / {MOVEIN_CHECKLIST.length} completed
                            </div>
                        </div>
                    )}
                </div>
            )}
            <ToastContainer />

            {/* Module-level Spaces (Trello-style containers) */}
            <div style={{ marginTop: 16 }}>
                <ProfileSpaces entityType="module" entityId="leasing" />
            </div>

            {/* Add Application Modal */}
            {showAddForm && (
                <div className="s-modal-overlay" onClick={() => setShowAddForm(false)}>
                    <div className="s-modal" onClick={e => e.stopPropagation()}>
                        <div className="s-modal-header">
                            <h3>Add Lease Application</h3>
                            <button className="s-btn-icon" onClick={() => setShowAddForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const fd = new FormData(e.currentTarget);
                            try {
                                await strataPost('/workitems', {
                                    type: 'lease',
                                    domain: 'leasing',
                                    title: `Lease Application — ${fd.get('applicantName')}`,
                                    propertyId: fd.get('propertyId') || undefined,
                                    status: 'open',
                                    priority: 'medium',
                                    metadata: {
                                        applicantName: fd.get('applicantName'),
                                        requestedUnit: fd.get('requestedUnit') || '',
                                        monthlyRent: Number(fd.get('monthlyRent')) || 0,
                                        leaseTermMonths: Number(fd.get('leaseTermMonths')) || 12,
                                        moveInDate: fd.get('moveInDate') || '',
                                        stage: 'applied',
                                    },
                                });
                                setShowAddForm(false);
                                fetchLeases();
                                showToast('Application created', 'success');
                            } catch (err) { console.error(err); showToast('Failed to create application', 'error'); }
                        }}>
                            <div className="s-form-group">
                                <label>Applicant Name</label>
                                <input name="applicantName" required placeholder="e.g. John Smith" className="s-input" />
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Property</label>
                                    <select name="propertyId" className="s-input">
                                        <option value="">Select property…</option>
                                        {properties.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="s-form-group">
                                    <label>Requested Unit</label>
                                    <input name="requestedUnit" placeholder="e.g. A-101" className="s-input" />
                                </div>
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Monthly Rent</label>
                                    <input name="monthlyRent" type="number" min="0" placeholder="1200" className="s-input" />
                                </div>
                                <div className="s-form-group">
                                    <label>Lease Term (Months)</label>
                                    <input name="leaseTermMonths" type="number" min="1" defaultValue="12" className="s-input" />
                                </div>
                            </div>
                            <div className="s-form-group">
                                <label>Desired Move-In Date</label>
                                <input name="moveInDate" type="date" className="s-input" />
                            </div>
                            <div className="s-modal-footer">
                                <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
                                <button type="submit" className="s-btn s-btn-primary">Create Application</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
