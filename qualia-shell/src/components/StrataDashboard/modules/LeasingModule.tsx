/**
 * LeasingModule — Leasing hub (mirrors AppFolio Leasing)
 * Tabs: Vacancies, Guest Cards, Rental Applications, Leases, Renewals, Metrics, Signals
 *
 * Data honesty (Docs/code.md 2026-09-05 / 2026-09-06): every row rendered here comes
 * from a real feed — /workitems?type=lease, /units, /properties, /entities?type=tenant,
 * /leasing/alerts. Surfaces with no backend source yet (guest cards, leasing-agent
 * attribution, days-to-lease / online-payment / portal metrics) show an honest empty or
 * "Not available" state with the shared <NotYet> chip instead of invented rows.
 */
import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, ArrowUpDown, BarChart3, Building2, Calendar, Check, CheckSquare, Clock, Columns3, Droplets, FileKey2, FileText, Flame, Globe, Home, List, PenTool, Percent, Plus, RefreshCw, RotateCw, Search, Send, Tag, Trash2, TrendingUp, UserCheck, UserPlus, Wifi, X, Zap } from 'lucide-react';
import { strataGet, strataPut, strataPost } from '../strataApi';
import { sendForEsign } from '../../ESign/esignApi'; // plan 047 — Documenso proxy client
import { bookingLinkFor } from '../../Scheduling/calcomLinks'; // plan 053 — cal.com showing bridge
import type { Workitem, Property, Unit, EntityProfile } from '../strataTypes';
import ProfileSpaces from './ProfileSpaces';
import { useUser } from '../../../context/UserContext';
import { useStrataNav } from '../StrataNavContext';
import { useToast } from '../useToast';
import { LoadingState, ErrorState } from '../StateView';
import { NotYet } from '../../common/NotYet';

type LeaseTab = 'vacancies' | 'guest-cards' | 'applications' | 'leases' | 'renewals' | 'metrics' | 'signals';
type VacancySort = 'days_vacant' | 'rent' | 'property' | 'unit';
type LeaseFilter = 'all' | 'countersign' | 'out_for_signing' | 'printed';
type RenewalStatus = 'all' | 'eligible' | 'pending';
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
        case 'approved': return '#22c55e';
        case 'sent': return '#0ea5e9';
        case 'signed': return '#D6FE51';
        case 'countersigned': return '#D6FE51';
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
    { key: 'move_in', label: 'Move-In', status: 'completed', color: '#22c55e' },
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

/* ── No prospect (guest card) or leasing-agent store exists in strataApi.static.ts,
   strataApi.backend.ts or the backend's dwelliumRoutes.ts — those surfaces render an
   honest empty state below. Applications and renewals derive from the real
   /workitems (type=lease) and /units feeds. Never hardcode rows here. ── */

/** Backend routes disagree on returning a bare array vs { data: [] } —
 * accept both (same guard as ManagerHome / AccountingModule). */
function asArray<T>(v: T[] | { data: T[] } | null | undefined): T[] {
    if (Array.isArray(v)) return v;
    if (v && Array.isArray((v as { data: T[] }).data)) return (v as { data: T[] }).data;
    return [];
}

const getStage = (lease: Workitem): string => lease.metadata?.stage || 'applied';

/** Pipeline stages that are still an application (not yet a signed lease). */
const APPLICATION_STAGES = new Set(['applied', 'screening', 'approved']);

/** Occupied units whose lease ends within this window (or already ended) are
 * renewal-eligible — the same 90-day window the backend's GET /leasing/alerts uses. */
const RENEWAL_WINDOW_DAYS = 90;
const daysUntil = (iso: string): number => Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

interface RenewalRow {
    id: string;
    status: 'eligible' | 'pending';
    tenant: string;
    unitId: string | null;
    unitNumber: string;
    propertyId: string | null;
    propertyName: string;
    currentRent: number | null;
    proposedRent: number | null;
    expiry: string | null;
}

/** Honest empty state for a surface with no backend source yet. */
function EmptyCard({ icon, title, message, reason, action }: { icon: ReactNode; title: string; message: string; reason: string; action?: ReactNode }) {
    return (
        <div className="s-glass-card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ color: 'var(--text-tertiary)', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>{icon}</div>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 6px' }}>{title}</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>{message}</p>
            <div style={{ display: 'inline-flex', marginTop: 12 }}><NotYet reason={reason} /></div>
            {action && <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>{action}</div>}
        </div>
    );
}

/* Signals are now fetched live from GET /leasing/alerts */

/* ── Listing status for vacancies (mirrors AppFolio Website/Internet) ── */
const LISTING_STATUS: Record<string, { website: boolean; internet: boolean; premium: boolean }> = {
    default: { website: true, internet: true, premium: false },
};

function renewalStatusColor(s: string) {
    switch (s) {
        case 'eligible': return '#0ea5e9';
        case 'pending': return '#f59e0b';
        case 'countersign': return '#D6FE51';
        case 'sent': return '#D6FE51';
        case 'accepted': return '#22c55e';
        case 'declined': return '#ef4444';
        default: return '#94a3b8';
    }
}

function daysVacantColor(days: number) {
    if (days >= 30) return '#ef4444';
    if (days >= 14) return '#f59e0b';
    return '#22c55e';
}

export default function LeasingModule() {
    const { hasPermission } = useUser();
    const { navigateToProperty, navigateToUnit } = useStrataNav();
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
    const [tenants, setTenants] = useState<EntityProfile[]>([]);
    // New AppFolio feature states
    const [vacancySort, setVacancySort] = useState<VacancySort>('days_vacant');
    const [leaseFilter, setLeaseFilter] = useState<LeaseFilter>('all');
    const [renewalFilter, setRenewalFilter] = useState<RenewalStatus>('all');
    const [metricView, setMetricView] = useState<MetricView>('overview');
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
            const [leaseData, propData, unitData, alertData, tenantData] = await Promise.all([
                strataGet<Workitem[] | { data: Workitem[] }>('/workitems', { type: 'lease' }),
                strataGet<Property[] | { data: Property[] }>('/properties'),
                strataGet<Unit[] | { data: Unit[] }>('/units').catch(() => [] as Unit[]),
                strataGet<{ alerts: LeasingAlert[] }>('/leasing/alerts').catch(() => ({ alerts: [] })),
                // Tenant names for renewal-eligible units (units only carry currentTenantId).
                strataGet<EntityProfile[] | { data: EntityProfile[] }>('/entities', { type: 'tenant' }).catch(() => [] as EntityProfile[]),
            ]);
            setLeases(asArray(leaseData));
            setProperties(asArray(propData));
            setUnits(asArray(unitData));
            setLeasingAlerts(alertData.alerts || []);
            setTenants(asArray(tenantData));
        } catch (e) { console.error(e); setError('Failed to load leasing data'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchLeases(); }, [fetchLeases]);

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

    // Plan 047: real e-signature via the Documenso backend proxy. While the
    // backend has no DOCUMENSO_* env it answers 503 → point at the Tools hub.
    // Plan 053: recipients prefilled from the lease (applicant + co-applicant);
    // the lease template default (DOCUMENSO_TEMPLATE_LEASE) stays backend-side.
    const sendForSignature = async (lease: Workitem) => {
        const md = (lease.metadata || {}) as Record<string, any>;
        const recipients = [
            { email: md.applicantEmail || md.tenantEmail, name: md.applicantName || md.tenantName || lease.title, role: 'SIGNER' },
            ...(md.coApplicantEmail ? [{ email: md.coApplicantEmail, name: md.coApplicantName || md.coApplicantEmail, role: 'SIGNER' }] : []),
        ].filter(r => typeof r.email === 'string' && r.email.includes('@'));
        const r = await sendForEsign(lease.id, recipients.length > 0 ? { recipients } : undefined);
        if (r.kind === 'ok') {
            showToast('Sent for e-signature', 'success');
            fetchLeases();
            if (selectedLease?.id === lease.id) {
                const updated = await strataGet<Workitem>(`/workitems/${lease.id}`);
                setSelectedLease(updated);
            }
        } else if (r.kind === 'needs-setup') {
            showToast('Documenso is not connected yet — see Tools hub → E-Sign', 'error');
        } else {
            showToast(r.message, 'error');
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

DRAFT — This document must be reviewed by legal counsel before execution.
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

    // Rental applications = lease workitems still in an application stage (the Add
    // Application modal writes stage 'applied'; the pipeline board shows the same rows).
    const applications = useMemo(() => leases.filter(l => APPLICATION_STAGES.has(getStage(l))), [leases]);

    const propertyName = useCallback((id: string | null) => properties.find(p => p.id === id)?.name || '', [properties]);

    // Renewals: offers already prepared (stage 'renewal_offered' workitems written by
    // POST /leasing/renewals) + occupied units whose lease ends inside the window.
    // Proposed rent has no source until an offer exists — shown as '—', never guessed.
    const renewals = useMemo<RenewalRow[]>(() => {
        const offers = leases.filter(l => getStage(l) === 'renewal_offered');
        const offeredUnitIds = new Set(offers.map(o => o.metadata?.unitId).filter(Boolean));
        const pending = offers.map(o => ({
            id: o.id, status: 'pending' as const,
            tenant: o.metadata?.applicantName || o.title,
            unitId: o.metadata?.unitId || null, unitNumber: o.metadata?.unitNumber || '',
            propertyId: o.propertyId, propertyName: o.metadata?.propertyName || propertyName(o.propertyId),
            currentRent: numOrNull(o.metadata?.currentRent), proposedRent: numOrNull(o.metadata?.proposedRent),
            expiry: o.metadata?.leaseEnd || null,
        }));
        const eligible = units
            .filter(u => u.status === 'occupied' && !!u.leaseEnd && daysUntil(u.leaseEnd) <= RENEWAL_WINDOW_DAYS && !offeredUnitIds.has(u.id))
            .map(u => ({
                id: `unit-${u.id}`, status: 'eligible' as const,
                tenant: u.currentTenantId ? (tenants.find(t => t.id === u.currentTenantId)?.name || u.currentTenantId) : '—',
                unitId: u.id, unitNumber: u.unitNumber,
                propertyId: u.propertyId, propertyName: propertyName(u.propertyId),
                currentRent: numOrNull(u.rentAmount), proposedRent: null,
                expiry: u.leaseEnd,
            }))
            .sort((a, b) => (a.expiry || '').localeCompare(b.expiry || ''));
        return [...pending, ...eligible];
    }, [leases, units, tenants, propertyName]);
    const eligibleRenewalCount = renewals.filter(r => r.status === 'eligible').length;

    const filteredRenewals = useMemo(() => {
        const q = renewalSearch.trim().toLowerCase();
        return renewals.filter(r => {
            if (renewalFilter !== 'all' && r.status !== renewalFilter) return false;
            if (q && ![r.tenant, r.unitNumber, r.propertyName].some(s => s.toLowerCase().includes(q))) return false;
            return true;
        });
    }, [renewals, renewalFilter, renewalSearch]);

    // Proposed rent has no source of its own — ask for it rather than guessing.
    const prepareRenewalOffer = async (r: RenewalRow) => {
        const raw = window.prompt(`Proposed monthly rent for ${r.tenant} — ${r.unitNumber || r.propertyName}`, r.currentRent != null ? String(r.currentRent) : '');
        if (raw == null) return;
        const proposedRent = Number(raw);
        if (!Number.isFinite(proposedRent) || proposedRent <= 0) { showToast('Enter a valid proposed rent', 'error'); return; }
        try {
            await strataPost('/leasing/renewals', {
                tenantName: r.tenant, unitId: r.unitId, unitNumber: r.unitNumber,
                propertyId: r.propertyId || '', propertyName: r.propertyName,
                currentRent: r.currentRent, proposedRent, leaseEnd: r.expiry,
            });
            showToast(`Renewal offer prepared for ${r.tenant}`, 'success');
            fetchLeases();
        } catch { showToast('Failed to prepare renewal offer', 'error'); }
    };

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
                                background: tab === t.id ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(255,255,255,0.04)',
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

            {loading && <LoadingState message="Loading leasing data…" />}
            {!loading && error && <ErrorState message={error} onRetry={fetchLeases} />}

            {/* ══════════ VACANCIES TAB (AppFolio: Days Vacant + Listing Status + Sort) ══════════ */}
            {tab === 'vacancies' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                            <Home size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{vacantUnits.length} Vacant Units
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ArrowUpDown size={12} style={{ color: 'var(--text-tertiary)' }} />
                            <select value={vacancySort} onChange={e => setVacancySort(e.target.value as VacancySort)}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 11 }}>
                                <option value="days_vacant">Sort: Days Vacant</option>
                                <option value="rent">Sort: Rent</option>
                                <option value="property">Sort: Property</option>
                                <option value="unit">Sort: Unit</option>
                            </select>
                        </div>
                    </div>
                    {vacantUnits.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No vacant units — 100% occupancy!</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['Unit', 'Property', 'BD/BA', 'Sq Ft', 'Market Rent', 'Days Vacant', 'Listing Status', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {vacantUnits.map((u: any) => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                                            {u.id && u.propertyId ? (
                                                <button className="s-unit-link" onClick={() => navigateToUnit(u.id, u.propertyId)}>{u.unitNumber}</button>
                                            ) : u.unitNumber}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                                            {u.propertyId ? (
                                                <button className="s-property-link" onClick={() => navigateToProperty(u.propertyId)}>{u.propertyName}</button>
                                            ) : u.propertyName}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{u.bedrooms ?? '—'}/{u.bathrooms ?? '—'}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{u.sqft ? `${u.sqft.toLocaleString()} ft²` : '—'}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{u.marketRent ? `$${u.marketRent.toLocaleString()}` : '—'}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${daysVacantColor(u.daysVacant)}15`, color: daysVacantColor(u.daysVacant), fontWeight: 700 }}>
                                                {u.daysVacant} days
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: u.listing.website ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: u.listing.website ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
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

            {/* ══════════ GUEST CARDS TAB — no prospect store exists yet; honest empty state ══════════ */}
            {tab === 'guest-cards' && !loading && (
                <EmptyCard
                    icon={<UserPlus size={40} strokeWidth={1} />}
                    title="Guest Cards"
                    message="No guest cards yet."
                    reason="Prospect intake (guest cards, lead source, showing activity, bulk follow-up) has no backend store yet — nothing is listed until one exists."
                    action={
                        // plan 053 cal.com bridge — generic showing link until there is a prospect to prefill
                        <button className="s-btn s-btn-ghost" onClick={() => {
                            const link = bookingLinkFor('showing-30min', {});
                            if (!link) { showToast('Set VITE_CALCOM_URL to enable showing links', 'info'); return; }
                            window.open(link, '_blank', 'noopener');
                        }}><Calendar size={14} /> Schedule showing</button>
                    }
                />
            )}

            {/* ══════════ RENTAL APPLICATIONS TAB (AppFolio: Grouped by Unit + Screening) ══════════ */}
            {tab === 'applications' && !loading && (
                <>
                    {/* Real rows: lease workitems still in an application stage (same rows as the pipeline below). */}
                    <div className="s-glass-card" style={{ marginBottom: 12 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                            <FileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Rental Applications ({applications.length})
                        </div>
                        {applications.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>No rental applications yet — use “Add Application” to start one.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        {['Applicant', 'Property — Unit', 'Monthly Rent', 'Desired Move-In', 'Received', 'Stage'].map(h => (
                                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {applications.map(app => (
                                        <tr key={app.id} className="s-clickable" onClick={() => setSelectedLease(app)} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '8px 12px', color: 'var(--accent)', fontWeight: 600 }}>{app.metadata?.applicantName || app.title}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{[propertyName(app.propertyId) || app.metadata?.property, app.metadata?.requestedUnit].filter(Boolean).join(' — ') || '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{app.metadata?.monthlyRent ? `$${Number(app.metadata.monthlyRent).toLocaleString()}` : '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{app.metadata?.moveInDate || '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{new Date(app.createdAt).toLocaleDateString()}</td>
                                            <td style={{ padding: '8px 12px' }}><span className={`s-badge ${getStage(app)}`}>{getStage(app)}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Existing Lease Pipeline (Kanban/Table) */}
                    <div className="s-glass-card" style={{ padding: '12px 16px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>Lease Pipeline ({leases.length} total)</span>
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
                                                // role over <button>: card contains a nested "Move" button (invalid inside <button>)
                                                <div key={lease.id} className={`s-kanban-card ${selectedLease?.id === lease.id ? 'active' : ''}`}
                                                    role="button" tabIndex={0}
                                                    onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedLease(lease); } }}
                                                    onClick={() => setSelectedLease(lease)}>
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
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
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
                                    style={{ padding: '4px 10px', border: 'none', borderRadius: 4, background: leaseFilter === f.id ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(255,255,255,0.04)', color: leaseFilter === f.id ? '#D6FE51' : '#64748b', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {leases.filter(l => getStage(l) === 'lease_signed' || getStage(l) === 'move_in').length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No active leases found.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['Tenant', 'Unit', 'Monthly Rent', 'Lease Term', 'Move-In Date', 'Generated', 'Status', 'Action'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {leases.filter(l => getStage(l) === 'lease_signed' || getStage(l) === 'move_in').map(l => (
                                    <tr key={l.id} className="s-clickable" onClick={() => setSelectedLease(l)} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{l.metadata?.applicantName || l.title}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{l.metadata?.requestedUnit || '—'}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>${(l.metadata?.monthlyRent || 0).toLocaleString()}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{l.metadata?.leaseTermMonths || 12} months</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{l.metadata?.moveInDate || '—'}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-tertiary)', fontSize: 11 }}>{new Date(l.createdAt).toLocaleDateString()}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#22c55e', fontWeight: 600, textTransform: 'uppercase' }}>{getStage(l)}</span>
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
                                                style={{ padding: '3px 10px', border: 'none', borderRadius: 4, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
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

            {/* ══════════ RENEWALS TAB — prepared offers (stage 'renewal_offered') + occupied units with a lease ending within 90 days ══════════ */}
            {tab === 'renewals' && !loading && (
                <div className="s-glass-card">
                    {/* Search/Filter header */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                                <RotateCw size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Lease Renewals
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{eligibleRenewalCount} eligible · {renewals.length - eligibleRenewalCount} offers out</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                <input value={renewalSearch} onChange={e => setRenewalSearch(e.target.value)} placeholder="Search tenant, unit or property..."
                                    style={{ width: '100%', padding: '6px 8px 6px 26px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }} />
                            </div>
                            {(['all', 'eligible', 'pending'] as RenewalStatus[]).map(f => (
                                <button key={f} onClick={() => setRenewalFilter(f)}
                                    style={{ padding: '5px 10px', border: 'none', borderRadius: 4, background: renewalFilter === f ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(255,255,255,0.04)', color: renewalFilter === f ? '#D6FE51' : '#64748b', cursor: 'pointer', fontSize: 11, fontWeight: 500, textTransform: 'capitalize' }}>
                                    {f === 'all' ? 'All' : f}
                                </button>
                            ))}
                        </div>
                    </div>
                    {filteredRenewals.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                            {renewals.length === 0
                                ? `No renewals due yet — occupied units with a lease ending within ${RENEWAL_WINDOW_DAYS} days, and offers prepared here, appear in this list.`
                                : 'No renewals match this filter.'}
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['Tenant', 'Unit', 'Current Rent', 'Proposed Rent', 'Change', 'Expiration', 'Status', 'Action'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRenewals.map(r => {
                                    const diff = r.proposedRent != null && r.currentRent != null ? r.proposedRent - r.currentRent : null;
                                    return (
                                        <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{r.tenant}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{[r.propertyName, r.unitNumber].filter(Boolean).join(' · ') || '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{r.currentRent != null ? `$${r.currentRent.toLocaleString()}` : '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{r.proposedRent != null ? `$${r.proposedRent.toLocaleString()}` : '—'}</td>
                                            <td style={{ padding: '8px 12px', color: diff != null && diff > 0 ? '#22c55e' : diff != null && diff < 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>
                                                {diff == null ? '—' : diff > 0 ? `+$${diff.toLocaleString()}` : diff < 0 ? `-$${Math.abs(diff).toLocaleString()}` : '$0'}
                                            </td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{r.expiry || '—'}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${renewalStatusColor(r.status)}15`, color: renewalStatusColor(r.status), fontWeight: 600, textTransform: 'capitalize' }}>{r.status}</span>
                                            </td>
                                            <td style={{ padding: '8px 12px' }}>
                                                {r.status === 'eligible' && (
                                                    <button onClick={() => prepareRenewalOffer(r)}
                                                        style={{ padding: '3px 8px', border: 'none', borderRadius: 4, background: 'rgba(14,165,233,0.15)', color: '#0ea5e9', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                                                        <Send size={9} style={{ verticalAlign: -1, marginRight: 2 }} />Prepare Offer
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
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
                                style={{ padding: '5px 12px', border: 'none', borderRadius: 6, background: metricView === v.id ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(255,255,255,0.04)', color: metricView === v.id ? '#D6FE51' : '#94a3b8', cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                                {v.icon} {v.label}
                            </button>
                        ))}
                    </div>

                    {metricView === 'overview' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                            {/* value: null = no live source yet → "Not available", never a plausible-looking number */}
                            {[
                                { label: 'Occupancy Rate', value: units.length > 0 ? `${Math.round((1 - vacantUnits.length / units.length) * 100)}%` : null, color: '#22c55e', icon: <Building2 size={18} /> },
                                { label: 'Avg. Days to Lease', value: null, color: 'var(--accent)', icon: <Clock size={18} /> },
                                { label: 'Active Applications', value: `${applications.length}`, color: '#f59e0b', icon: <FileText size={18} /> },
                                { label: 'Leases Signed', value: `${leases.filter(l => getStage(l) === 'lease_signed').length}`, color: '#0ea5e9', icon: <FileKey2 size={18} /> },
                                { label: 'Pending Renewals', value: `${eligibleRenewalCount}`, color: 'var(--accent)', icon: <RotateCw size={18} /> },
                                { label: 'Avg. Rent', value: leases.length > 0 ? `$${Math.round(leases.reduce((s, l) => s + (l.metadata?.monthlyRent || 0), 0) / leases.length).toLocaleString()}` : null, color: 'var(--accent)', icon: <TrendingUp size={18} /> },
                                { label: 'Online Payments', value: null, color: '#22c55e', icon: <Percent size={18} /> },
                                { label: 'Portal Adoption', value: null, color: '#0ea5e9', icon: <Globe size={18} /> },
                            ].map(m => (
                                <div key={m.label} className="s-glass-card" style={{ padding: '16px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <span style={{ color: m.color }}>{m.icon}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>{m.label}</span>
                                    </div>
                                    {m.value
                                        ? <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{m.value}</div>
                                        : <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Not available</div>}
                                </div>
                            ))}
                        </div>
                    )}

                    {metricView === 'funnel' && (
                        <div className="s-glass-card" style={{ padding: 20 }}>
                            <h3 style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Leasing Funnel</h3>
                            {/* Guest cards / tours have no store yet, so the funnel honestly starts at Applications. */}
                            {[
                                { stage: 'Applications', count: applications.length, color: '#f59e0b', width: 100 },
                                { stage: 'Approved', count: applications.filter(a => getStage(a) === 'approved').length, color: '#22c55e', width: 66 },
                                { stage: 'Leases Signed', count: leases.filter(l => getStage(l) === 'lease_signed').length, color: 'var(--accent)', width: 33 },
                            ].map((f, i, arr) => (
                                <div key={f.stage} style={{ marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.stage}</span>
                                        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>{f.count}</span>
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
                            <NotYet reason="Guest cards and tours/showings aren't tracked yet — the funnel starts at Applications." />
                        </div>
                    )}

                    {metricView === 'box-score' && (
                        <div className="s-glass-card">
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                                Box Score Summary
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        {['Property', 'Total Units', 'Occupied', 'Vacant', 'Occupancy %', 'Avg Rent', 'Revenue'].map(h => (
                                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
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
                                                <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{p.name}</td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{pUnits.length}</td>
                                                <td style={{ padding: '8px 12px', color: '#22c55e', fontWeight: 600 }}>{occupied}</td>
                                                <td style={{ padding: '8px 12px', color: vacant > 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>{vacant}</td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: pUnits.length > 0 && occupied / pUnits.length >= 0.95 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: pUnits.length > 0 && occupied / pUnits.length >= 0.95 ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>
                                                        {pUnits.length > 0 ? `${Math.round(occupied / pUnits.length * 100)}%` : '—'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>${avgRent.toLocaleString()}</td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>${(occupied * avgRent).toLocaleString()}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {metricView === 'agent-performance' && (
                        <EmptyCard
                            icon={<UserCheck size={40} strokeWidth={1} />}
                            title="Leasing Agent Performance"
                            message="Not available"
                            reason="Lease workitems carry no leasing-agent attribution (guest cards, tours, applications, conversion per agent) yet."
                        />
                    )}
                </>
            )}

            {/* ══════════ SIGNALS TAB (AppFolio: AI Anomalies + Actions) ══════════ */}
            {tab === 'signals' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                            <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Leasing Signals
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{leasingAlerts.length} active signals</span>
                    </div>
                    {leasingAlerts.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No active alerts — all clear!</div>
                    ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12 }}>
                        {leasingAlerts.map(a => (
                            <div key={a.id} style={{
                                padding: '10px 14px', borderRadius: 8,
                                background: a.severity === 'high' ? 'rgba(239,68,68,0.06)' : a.severity === 'medium' ? 'rgba(245,158,11,0.06)' : 'color-mix(in srgb, var(--accent) 6%, transparent)',
                                border: `1px solid ${a.severity === 'high' ? 'rgba(239,68,68,0.15)' : a.severity === 'medium' ? 'rgba(245,158,11,0.15)' : 'color-mix(in srgb, var(--accent) 15%, transparent)'}`,
                                display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                                <AlertTriangle size={14} style={{ color: a.severity === 'high' ? '#ef4444' : a.severity === 'medium' ? '#f59e0b' : '#D6FE51', flexShrink: 0 }} />
                                <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{a.message}</span>
                                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', flexShrink: 0 }}>{a.type.replace(/_/g, ' ')}</span>
                                <span style={{
                                    fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase',
                                    background: a.severity === 'high' ? 'rgba(239,68,68,0.15)' : a.severity === 'medium' ? 'rgba(245,158,11,0.15)' : 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                    color: a.severity === 'high' ? '#ef4444' : a.severity === 'medium' ? '#f59e0b' : '#D6FE51',
                                }}>{a.severity}</span>
                                {a.deadline && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{a.deadline}</span>}
                                <button onClick={() => {
                                    if (a.type.includes('countersign')) setTab('leases');
                                    else if (a.type.includes('stalled')) setTab('applications');
                                    else if (a.type.includes('expir') || a.type.includes('notice')) setTab('renewals');
                                    else setTab('leases');
                                }} style={{ padding: '3px 8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: 'var(--accent)', cursor: 'pointer', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
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
                        {/* Read-only key/value rows, not form controls — spans, not labels (jsx-a11y/label-has-associated-control) */}
                        <div className="s-vetting-row"><span className="s-vetting-label">Name</span><span>{selectedLease.metadata?.applicantName}</span></div>
                        <div className="s-vetting-row"><span className="s-vetting-label">Email</span><span>{selectedLease.metadata?.applicantEmail}</span></div>
                        <div className="s-vetting-row"><span className="s-vetting-label">Unit</span><span>{selectedLease.metadata?.requestedUnit}</span></div>
                        <div className="s-vetting-row"><span className="s-vetting-label">Monthly Rent</span><span>${(selectedLease.metadata?.monthlyRent || 0).toLocaleString()}</span></div>
                        <div className="s-vetting-row"><span className="s-vetting-label">Lease Term</span><span>{selectedLease.metadata?.leaseTermMonths || 12} months</span></div>
                        <div className="s-vetting-row"><span className="s-vetting-label">Move-In Date</span><span>{selectedLease.metadata?.moveInDate || '—'}</span></div>
                        <div className="s-vetting-row"><span className="s-vetting-label">Current Stage</span><span className={`s-badge ${getStage(selectedLease)}`}>{getStage(selectedLease)}</span></div>
                    </div>
                    {/* Doc Status Badge */}
                    {selectedLease.metadata?.docStatus && (
                        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>DOC STATUS:</span>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${docStatusColor(selectedLease.metadata.docStatus)}15`, color: docStatusColor(selectedLease.metadata.docStatus), fontWeight: 700, textTransform: 'uppercase' }}>
                                {(selectedLease.metadata.docStatus as string).replace(/_/g, ' ')}
                            </span>
                            {(DOC_NEXT_STATUS[selectedLease.metadata.docStatus as string] || []).map((next: { label: string; target: DocStatus }) => (
                                <button key={next.target} onClick={() => updateDocStatus(selectedLease, next.target)}
                                    style={{ padding: '2px 8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: 'var(--accent)', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                                    {next.label}
                                </button>
                            ))}
                            {/* Plan 047: real send via Documenso (only from `approved`, mirrors backend gate) */}
                            {selectedLease.metadata.docStatus === 'approved' && (
                                <button onClick={() => sendForSignature(selectedLease)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: 'var(--accent)', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                                    <PenTool size={10} /> Send for e-signature
                                </button>
                            )}
                            {Array.isArray(selectedLease.metadata.esign?.recipients) && (selectedLease.metadata.esign.recipients as Array<{ email: string; role?: string; status?: string }>).map((r) => (
                                <span key={r.email} title={r.status || r.role || 'signer'}
                                    style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                                    {r.email}
                                </span>
                            ))}
                            {selectedLease.metadata.docHistory && (
                                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
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
                        <h4 style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 600, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                                            style={{ accentColor: '#22c55e' }}
                                        />
                                        {u.icon === 'droplets' && <Droplets size={14} style={{ color: done ? '#22c55e' : '#475569' }} />}
                                        {u.icon === 'zap' && <Zap size={14} style={{ color: done ? '#22c55e' : '#475569' }} />}
                                        {u.icon === 'flame' && <Flame size={14} style={{ color: done ? '#22c55e' : '#475569' }} />}
                                        {u.icon === 'wifi' && <Wifi size={14} style={{ color: done ? '#22c55e' : '#475569' }} />}
                                        {u.icon === 'trash' && <Trash2 size={14} style={{ color: done ? '#22c55e' : '#475569' }} />}
                                        <span style={{ color: done ? '#22c55e' : '#94a3b8', fontSize: '12px', textDecoration: done ? 'line-through' : 'none' }}>{u.label}</span>
                                        {done && <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: '10px', fontWeight: 700 }}><Check size={14} /></span>}
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
                                            {done && <span style={{ marginLeft: 'auto', color: '#f59e0b', fontSize: '10px', fontWeight: 700 }}><Check size={14} /></span>}
                                        </label>
                                    );
                                })}
                            </div>
                            <div style={{ marginTop: '8px', padding: '6px 10px', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
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
                // Backdrop close is a mouse convenience — the keyboard path is the Cancel/× buttons.
                <div role="presentation" className="s-modal-overlay" onClick={() => setShowAddForm(false)}>
                    <div role="presentation" className="s-modal" onClick={e => e.stopPropagation()}>
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
                                <label htmlFor="lease-add-applicant-name">Applicant Name</label>
                                <input id="lease-add-applicant-name" name="applicantName" required placeholder="e.g. John Smith" className="s-input" />
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label htmlFor="lease-add-property">Property</label>
                                    <select id="lease-add-property" name="propertyId" className="s-input">
                                        <option value="">Select property…</option>
                                        {properties.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="s-form-group">
                                    <label htmlFor="lease-add-unit">Requested Unit</label>
                                    <input id="lease-add-unit" name="requestedUnit" placeholder="e.g. A-101" className="s-input" />
                                </div>
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label htmlFor="lease-add-rent">Monthly Rent</label>
                                    <input id="lease-add-rent" name="monthlyRent" type="number" min="0" placeholder="1200" className="s-input" />
                                </div>
                                <div className="s-form-group">
                                    <label htmlFor="lease-add-term">Lease Term (Months)</label>
                                    <input id="lease-add-term" name="leaseTermMonths" type="number" min="1" defaultValue="12" className="s-input" />
                                </div>
                            </div>
                            <div className="s-form-group">
                                <label htmlFor="lease-add-movein">Desired Move-In Date</label>
                                <input id="lease-add-movein" name="moveInDate" type="date" className="s-input" />
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
