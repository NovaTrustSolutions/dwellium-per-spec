import { useState, useEffect, useCallback } from 'react';
import { Truck, Search, RefreshCw, Plus, X, Shield, AlertTriangle, CheckCircle, Mail, Phone, DollarSign, FileText, Link2, Trash2, Tag, Filter, Building2, Unlink, Upload, Award, BarChart3, UserCheck, UserX, Clock, Settings2, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';
import { strataGet, strataPost, strataPut, strataDelete } from '../strataApi';
import type { EntityProfile, Workitem, VendorFederalTax, VendorAccountingInfo, VendorCompliance } from '../strataTypes';
import { useUser } from '../../../context/UserContext';
import ProfileSpaces from './ProfileSpaces';
import { useToast } from '../useToast';
import { useStrataNav } from '../StrataNavContext';
import { LoadingState, ErrorState } from '../StateView';
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';
import ComplianceTab from './__vendors/ComplianceTab';
import AccountingTab from './__vendors/AccountingTab';

const VENDOR_TYPES = [
    'Plumber', 'Electrician', 'HVAC', 'Landscaping', 'General Contractor',
    'Roofing', 'Pest Control', 'Cleaning', 'Security', 'Other',
] as const;

const VENDOR_TYPE_COLORS: Record<string, string> = {
    Plumber: '#3b82f6', Electrician: '#f59e0b', HVAC: '#06b6d4', Landscaping: '#22c55e',
    'General Contractor': '#D6FE51', Roofing: '#f97316', 'Pest Control': '#ef4444',
    Cleaning: '#14b8a6', Security: '#64748b', Other: '#a855f7',
};

function getCoiStatus(vendor: EntityProfile): { status: string; color: string; expiry: string } {
    const expiry = vendor.metadata?.coiExpiry || '';
    const coiStatus = vendor.metadata?.coiStatus || 'unknown';
    const colors: Record<string, string> = { valid: 'var(--s-success)', expiring: 'var(--s-warning)', expired: 'var(--s-danger)', unknown: 'var(--s-text-tertiary)' };
    return { status: coiStatus, color: colors[coiStatus] || colors.unknown, expiry };
}

// ─── Task 3.2: Vendor detail 10-block layout (parallel-batch #2) ───
//
// Renders the 10 AppFolio-parity blocks per v1 plan L166 as the content
// of the existing overview tab. Additive render-layer extension; tab bar
// preserved. Drift #10 — Blocks 1/2/3 read metadata fields (vendorType /
// contactName / address / vendorPortalActivated) since EntityProfile core
// has only single-string email/phone/address. Drift #11 — only 1/3,218
// vendor entities have typed Task-1.2 blocks; Blocks 4/5/6/7 implement
// metadata fallback chains for the 3,217 remaining vendors per the
// deprecation comment at packages/types/index.ts L237-241.

/** Parse a legacy MM/DD/YYYY string OR an ISO YYYY-MM-DD date into Date. */
function parseLegacyDate(s: string | undefined | null): Date | null {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
        return isNaN(d.getTime()) ? null : d;
    }
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    return isNaN(d.getTime()) ? null : d;
}

function fmtIsoDate(d: Date | null): string {
    if (!d) return '—';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Module-local label/value row helper for Block content. NOT exported. */
function BlockRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
            <span style={{ color: '#64748b', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', fontSize: 10 }}>{label}</span>
            <span style={{ color: '#cbd5e1', textAlign: 'right', wordBreak: 'break-word', fontSize: 12 }}>{value}</span>
        </div>
    );
}

/** Module-local collapsible wrapper. NOT exported — Blocks render standalone in tests. */
function BlockSection({
    title, slug, expanded, onToggle, children,
}: {
    title: string;
    slug: string;
    expanded: boolean;
    onToggle: (next: boolean) => void;
    children: React.ReactNode;
}) {
    return (
        <div className="s-glass-card" style={{ marginBottom: 8, padding: '10px 14px' }}>
            <button
                type="button"
                onClick={() => onToggle(!expanded)}
                aria-expanded={expanded}
                aria-controls={`vendor-block-${slug}`}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: 0, border: 'none', background: 'none',
                    color: '#e2e8f0', fontSize: 13, fontWeight: 700, letterSpacing: 0.4,
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}
            >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span style={{ flex: 1 }}>{title}</span>
            </button>
            {expanded && <div id={`vendor-block-${slug}`} style={{ marginTop: 8 }}>{children}</div>}
        </div>
    );
}

const xLinkBtnStyle: React.CSSProperties = {
    marginTop: 8, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: 'rgba(214,254,81,0.1)', border: '1px solid rgba(214,254,81,0.25)',
    color: '#D6FE51', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', gap: 4,
};

// ── Block 1: Identity ──
export function BlockIdentity({ vendor }: { vendor: EntityProfile }) {
    return (
        <div data-testid="vendor-block-identity">
            <BlockRow label="Name" value={vendor.name} />
            <BlockRow label="Vendor Type" value={vendor.metadata?.vendorType ?? '—'} />
            <BlockRow label="Contact Name" value={vendor.metadata?.contactName ?? '—'} />
            <BlockRow label="Website" value="—" />
        </div>
    );
}

// ── Block 2: Contact ──
export function BlockContact({ vendor }: { vendor: EntityProfile }) {
    const address = vendor.address ?? vendor.metadata?.address ?? '—';
    return (
        <div data-testid="vendor-block-contact">
            <BlockRow label="Email" value={vendor.email ?? '—'} />
            <BlockRow label="Phone" value={vendor.phone ?? '—'} />
            <BlockRow label="Address" value={address} />
        </div>
    );
}

// ── Block 3: Portal (tri-state per Drift #10) ──
export function BlockPortal({ vendor }: { vendor: EntityProfile }) {
    const raw = vendor.metadata?.vendorPortalActivated;
    const status = (raw === 'Yes' || raw === true)
        ? 'Activated'
        : (raw === 'No' || raw === false)
            ? 'Not activated'
            : 'Not configured';
    return (
        <div data-testid="vendor-block-portal">
            <BlockRow label="Portal Status" value={status} />
        </div>
    );
}

// ── Block 4: Federal Tax (typed root ?? metadata fallback per Drift #11) ──
export function BlockFederalTax({ vendor }: { vendor: EntityProfile }) {
    const ft: VendorFederalTax | undefined = vendor.vendorFederalTax;
    const taxpayerName = ft?.taxpayerName ?? vendor.name;
    const send1099 = ft?.send1099 ?? (vendor.metadata?.send1099 === 'Yes');
    const w9Requested = ft?.w9Requested;
    return (
        <div data-testid="vendor-block-federal-tax">
            <BlockRow label="Taxpayer Name" value={taxpayerName} />
            <BlockRow label="W-9 Requested" value={w9Requested === undefined ? '—' : (w9Requested ? 'Yes' : 'No')} />
            <BlockRow label="Tax ID" value={ft?.taxIdMasked ?? '—'} />
            <BlockRow label="Tax Form Account #" value={ft?.taxFormAccountNumber ?? '—'} />
            <BlockRow label="Send 1099" value={send1099 ? 'Yes' : 'No'} />
        </div>
    );
}

// ── Block 5: Accounting (compressed 3-KPI summary + cross-link) ──
export function BlockAccounting({ vendor, onCrossLink }: { vendor: EntityProfile; onCrossLink?: () => void }) {
    const ai: VendorAccountingInfo | undefined = vendor.vendorAccountingInfo;
    const paymentType = ai?.paymentType ?? vendor.metadata?.paymentType ?? '—';
    const paymentTerms = ai?.paymentTerms ?? '—';
    const onlinePayables = ai?.onlinePayablesEnabled === true ? 'Enabled' : 'Disabled';
    return (
        <div data-testid="vendor-block-accounting">
            <BlockRow label="Payment Type" value={paymentType} />
            <BlockRow label="Payment Terms" value={paymentTerms} />
            <BlockRow label="Online Payables" value={onlinePayables} />
            <button
                type="button"
                onClick={onCrossLink}
                disabled={!onCrossLink}
                style={{ ...xLinkBtnStyle, cursor: onCrossLink ? 'pointer' : 'default' }}
            >
                View detailed Accounting <ExternalLink size={11} />
            </button>
        </div>
    );
}

// ── Block 6: Payment Type ──
export function BlockPaymentType({ vendor }: { vendor: EntityProfile }) {
    const paymentMethod = vendor.paymentMethod ?? vendor.metadata?.paymentType ?? '—';
    const send1099 = vendor.send1099 ?? (vendor.metadata?.send1099 === 'Yes');
    return (
        <div data-testid="vendor-block-payment-type">
            <BlockRow label="Payment Method" value={paymentMethod} />
            <BlockRow label="Send 1099" value={send1099 ? 'Yes' : 'No'} />
        </div>
    );
}

// ── Block 7: Compliance (compressed 3-KPI summary + cross-link; today injectable for tests) ──
export function BlockCompliance({
    vendor, today = new Date(), onCrossLink,
}: {
    vendor: EntityProfile;
    today?: Date;
    onCrossLink?: () => void;
}) {
    const tc: VendorCompliance | undefined = vendor.vendorCompliance;
    const md: Record<string, any> = vendor.metadata ?? {};
    const fields: { label: string; date: Date | null }[] = [
        { label: 'Workers Comp', date: parseLegacyDate(tc?.workersCompExpiration) ?? parseLegacyDate(md.workersCompExpiration) },
        { label: 'GL', date: parseLegacyDate(tc?.generalLiabilityExpiration) ?? parseLegacyDate(md.liabilityInsuranceExpiration) },
        { label: 'EPA', date: parseLegacyDate(tc?.epaCertificationExpiration) ?? parseLegacyDate(md.epaCertificationExpiration) },
        { label: 'Auto', date: parseLegacyDate(tc?.autoInsuranceExpiration) ?? parseLegacyDate(md.autoInsuranceExpiration) },
        { label: 'State License', date: parseLegacyDate(tc?.stateLicenseExpiration) ?? parseLegacyDate(md.stateLicenseExpiration) },
        { label: 'Contract', date: parseLegacyDate(tc?.contractExpiration) ?? parseLegacyDate(md.contractExpiration) },
    ];
    const t = today.getTime();
    const active = fields.filter(f => f.date && f.date.getTime() >= t);
    const expired = fields.filter(f => f.date && f.date.getTime() < t);
    const nearest = active.slice().sort((a, b) => a.date!.getTime() - b.date!.getTime())[0];
    const nearestDisplay = nearest ? `${nearest.label}: ${fmtIsoDate(nearest.date)}` : '—';
    return (
        <div data-testid="vendor-block-compliance">
            <BlockRow label="Active" value={`${active.length} / 6 docs on file`} />
            <BlockRow label="Nearest Expiry" value={nearestDisplay} />
            <BlockRow
                label="Expired"
                value={
                    <span style={expired.length > 0 ? { color: '#f87171', fontWeight: 700 } : undefined}>
                        {expired.length} expired
                    </span>
                }
            />
            <button
                type="button"
                onClick={onCrossLink}
                disabled={!onCrossLink}
                style={{ ...xLinkBtnStyle, cursor: onCrossLink ? 'pointer' : 'default' }}
            >
                View detailed Compliance <ExternalLink size={11} />
            </button>
        </div>
    );
}

// ── Block 8: Survey (stub per v1 L168 — no schema fields) ──
export function BlockSurvey(_props: { vendor: EntityProfile }) {
    return (
        <div data-testid="vendor-block-survey" style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
            Survey responses not yet captured. Coming soon — Phase-5 wires vendor satisfaction survey responses (NPS, response rate, last-completed timestamp) once the survey-collection pipeline lands.
        </div>
    );
}

// ── Block 9: Notes (semi-typed — reads vendor.metadata?.notes; null-safe stub per Q3 Option A) ──
export function BlockNotes({ vendor }: { vendor: EntityProfile }) {
    const raw = vendor.metadata?.notes;
    if (Array.isArray(raw) && raw.length > 0) {
        return (
            <div data-testid="vendor-block-notes" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {raw.map((n: any, i: number) => {
                    const body = (n && typeof n === 'object' && (n.body ?? n.content)) || (typeof n === 'string' ? n : String(n));
                    const meta = n && typeof n === 'object' ? [n.posted_by, n.ts].filter(Boolean).join(' · ') : '';
                    return (
                        <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '6px 0', borderBottom: i < raw.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <div>{body}</div>
                            {meta && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{meta}</div>}
                        </div>
                    );
                })}
            </div>
        );
    }
    if (typeof raw === 'string' && raw.trim().length > 0) {
        return (
            <div data-testid="vendor-block-notes" style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'pre-line' }}>
                {raw}
            </div>
        );
    }
    return (
        <div data-testid="vendor-block-notes" style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
            No notes recorded.
        </div>
    );
}

// ── Block 10: Activity (stub per v1 L168 — no schema fields) ──
export function BlockActivity(_props: { vendor: EntityProfile }) {
    return (
        <div data-testid="vendor-block-activity" style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
            Activity log not yet captured. Coming soon — Phase-5 wires per-vendor audit log (timestamp + actor + event + detail) once the audit-pipeline lands.
        </div>
    );
}

interface VendorsModuleProps {
    searchNavTarget?: { type: string; id: string } | null;
    onNavComplete?: () => void;
}

export default function VendorsModule({ searchNavTarget, onNavComplete }: VendorsModuleProps) {
    const { hasPermission } = useUser();
    const { navigateToProperty } = useStrataNav();
    const { showToast, ToastContainer } = useToast();
    const [vendors, setVendors] = useState<EntityProfile[]>([]);
    const [workOrders, setWorkOrders] = useState<Workitem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<EntityProfile | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [detailTab, setDetailTab] = useState<'overview' | 'ledger' | 'documents' | 'performance' | 'spaces' | 'compliance' | 'accounting'>('overview');
    // Task 3.2: 10-block collapse state on the overview tab. Default-EXPANDED per Q2 ack
    // (AppFolio parity per v1 plan L166 "matching AppFolio's visual grouping").
    const [blockExpanded, setBlockExpanded] = useState<Record<string, boolean>>({
        identity: true, contact: true, portal: true, 'federal-tax': true,
        accounting: true, 'payment-type': true, compliance: true,
        survey: true, notes: true, activity: true,
    });
    const toggleBlock = useCallback((slug: string, next: boolean) => {
        setBlockExpanded(prev => ({ ...prev, [slug]: next }));
        try {
            Sentry.addBreadcrumb({
                category: 'ui.block-toggle',
                message: 'vendors.detail.block.toggled',
                level: 'info',
                data: { block: slug, expanded: next, vendorId: selected?.id },
            });
        } catch { /* Sentry no-op when DSN unset */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.id]);
    const [ledger, setLedger] = useState<any[]>([]);
    const [vendorBalance, setVendorBalance] = useState(0);
    const [showLedgerForm, setShowLedgerForm] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    // Documents & Performance (10/10)
    const [vendorDocs, setVendorDocs] = useState<any[]>([]);
    const [performance, setPerformance] = useState<any | null>(null);
    const [showDocForm, setShowDocForm] = useState(false);

    // Compliance + Property filters
    const [complianceFilter, setComplianceFilter] = useState<'all' | 'compliant' | 'expiring' | 'non-compliant'>('all');
    const [propertyFilter, setPropertyFilter] = useState<string>('');
    const [showEditForm, setShowEditForm] = useState(false);
    const [editFormData, setEditFormData] = useState<any>({});
    const [editVendorTagInput, setEditVendorTagInput] = useState('');

    // Phase 8: Auto-select vendor from search navigation
    useEffect(() => {
        if (searchNavTarget && searchNavTarget.type === 'vendor' && vendors.length > 0) {
            const target = vendors.find(v => v.id === searchNavTarget.id);
            if (target) { setSelected(target); onNavComplete?.(); }
        }
    }, [searchNavTarget, vendors, onNavComplete]);

    // Phase 3: Taxonomy & Tagging
    const [vendorTypeFilter, setVendorTypeFilter] = useState<string>('all');
    const [tagInput, setTagInput] = useState('');

    // Phase 4: Property-Vendor Associations
    const [associations, setAssociations] = useState<any[]>([]);
    const [allProperties, setAllProperties] = useState<any[]>([]);
    const [showLinkForm, setShowLinkForm] = useState(false);
    const [linkPropertyId, setLinkPropertyId] = useState('');
    const [linkAccountNumber, setLinkAccountNumber] = useState('');

    const fetchLedger = useCallback(async (vendorId: string) => {
        try {
            const data = await strataGet<any[]>(`/vendors/${vendorId}/ledger`);
            setLedger(data);
            const bal = await strataGet<{ balance: number }>(`/vendors/${vendorId}/balance`);
            setVendorBalance(bal.balance);
        } catch (e) { console.error(e); }
    }, []);

    const fetchDocs = useCallback(async (vendorId: string) => {
        try {
            const data = await strataGet<any[]>(`/vendors/${vendorId}/documents`);
            setVendorDocs(data);
        } catch (e) { console.error(e); setVendorDocs([]); }
    }, []);

    const fetchPerformance = useCallback(async (vendorId: string) => {
        try {
            const data = await strataGet<any>(`/vendors/${vendorId}/performance`);
            setPerformance(data);
        } catch (e) { console.error(e); setPerformance(null); }
    }, []);

    useEffect(() => {
        if (selected) {
            fetchLedger(selected.id);
            fetchDocs(selected.id);
            fetchPerformance(selected.id);
            setDetailTab('overview');
        }
    }, [selected, fetchLedger, fetchDocs, fetchPerformance]);

    const fetchVendors = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await strataGet<EntityProfile[]>('/entities', { type: 'vendor' });
            setVendors(data);
        } catch (e) { console.error(e); setError('Failed to load vendors'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchVendors(); }, [fetchVendors]);
    useEffect(() => {
        strataGet<Workitem[]>('/workitems', { type: 'work_order', status: 'open' }).then(setWorkOrders).catch(console.error);
        // Load properties list for association dropdown
        strataGet<any[]>('/properties').then(setAllProperties).catch(console.error);
    }, []);

    // Phase 4: fetch associations when vendor is selected
    const fetchAssociations = useCallback(async (vendorId: string) => {
        try {
            const data = await strataGet<any[]>('/vendor-associations', { vendor_id: vendorId });
            setAssociations(data);
        } catch (e) { console.error(e); setAssociations([]); }
    }, []);

    useEffect(() => {
        if (selected) { fetchAssociations(selected.id); }
    }, [selected, fetchAssociations]);

    const handleLinkProperty = async (vendorId: string) => {
        if (!linkPropertyId) return;
        try {
            await strataPost('/vendor-associations', {
                propertyId: linkPropertyId,
                vendorId,
                accountNumber: linkAccountNumber || undefined,
            });
            setShowLinkForm(false);
            setLinkPropertyId('');
            setLinkAccountNumber('');
            fetchAssociations(vendorId);
        } catch (err: any) {
            showToast(err?.message || 'Failed to link property', 'error');
        }
    };

    const handleUnlinkAssoc = async (assocId: string, vendorId: string) => {
        try {
            await strataDelete(`/vendor-associations/${assocId}`);
            fetchAssociations(vendorId);
        } catch (err) { console.error(err); }
    };

    const handleToggleAssocStatus = async (assoc: any, vendorId: string) => {
        const nextStatus = assoc.status === 'active' ? 'suspended' : assoc.status === 'suspended' ? 'terminated' : 'active';
        try {
            await strataPut(`/vendor-associations/${assoc.id}`, { status: nextStatus });
            fetchAssociations(vendorId);
        } catch (err) { console.error(err); }
    };

    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const tagsRaw = (fd.get('serviceTags') as string) || '';
        const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
        try {
            await strataPost('/entities', {
                entityType: 'vendor',
                name: fd.get('name'),
                email: fd.get('email'),
                phone: fd.get('phone'),
                metadata: {
                    specialty: fd.get('specialty'),
                    vendorType: fd.get('vendorType') || 'Other',
                    serviceTags: tags,
                    rating: 0,
                    coiExpiry: fd.get('coiExpiry'),
                    coiStatus: fd.get('coiExpiry') ? 'valid' : 'unknown',
                },
            });
            setShowForm(false);
            fetchVendors();
        } catch (err) { console.error(err); }
    };

    const handleAddTag = async (vendor: EntityProfile) => {
        if (!tagInput.trim()) return;
        const existing = vendor.metadata?.serviceTags || [];
        if (existing.includes(tagInput.trim())) { setTagInput(''); return; }
        const updated = [...existing, tagInput.trim()];
        try {
            await strataPut(`/entities/${vendor.id}`, { metadata: { ...vendor.metadata, serviceTags: updated } });
            setTagInput('');
            fetchVendors();
            setSelected({ ...vendor, metadata: { ...vendor.metadata, serviceTags: updated } });
        } catch (err) { console.error(err); }
    };

    const handleRemoveTag = async (vendor: EntityProfile, tag: string) => {
        const updated = (vendor.metadata?.serviceTags || []).filter((t: string) => t !== tag);
        try {
            await strataPut(`/entities/${vendor.id}`, { metadata: { ...vendor.metadata, serviceTags: updated } });
            fetchVendors();
            setSelected({ ...vendor, metadata: { ...vendor.metadata, serviceTags: updated } });
        } catch (err) { console.error(err); }
    };

    const handleDelete = async (id: string) => {
        try {
            await strataDelete(`/entities/${id}`);
            if (selected?.id === id) setSelected(null);
            setConfirmDelete(null);
            fetchVendors();
        } catch (err) { console.error(err); }
    };

    const openEditVendor = (vendor: EntityProfile) => {
        const m = vendor.metadata || {};
        setEditFormData({
            name: vendor.name || '', email: vendor.email || '', phone: vendor.phone || '',
            specialty: m.specialty || '', vendorType: m.vendorType || 'Other',
            coiExpiry: m.coiExpiry || '', rating: m.rating || 0,
            entityTags: Array.isArray(m.entityTags) ? m.entityTags : [],
            notes: typeof m.notes === 'string' ? m.notes : '',
        });
        setEditVendorTagInput('');
        setShowEditForm(true);
    };

    const handleEditVendorSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selected) return;
        try {
            await strataPut(`/entities/${selected.id}`, {
                name: editFormData.name,
                email: editFormData.email || null,
                phone: editFormData.phone || null,
                metadata: {
                    ...selected.metadata,
                    specialty: editFormData.specialty,
                    vendorType: editFormData.vendorType,
                    coiExpiry: editFormData.coiExpiry,
                    coiStatus: editFormData.coiExpiry ? (selected.metadata?.coiStatus || 'valid') : 'unknown',
                    rating: Number(editFormData.rating) || 0,
                    entityTags: editFormData.entityTags,
                    notes: editFormData.notes,
                },
            });
            setShowEditForm(false);
            const updated = { ...selected, name: editFormData.name, email: editFormData.email, phone: editFormData.phone, metadata: { ...selected.metadata, ...editFormData } };
            setSelected(updated);
            fetchVendors();
        } catch (err) { console.error('Failed to update vendor', err); }
    };

    const handleAddVendorEditTag = () => {
        if (!editVendorTagInput.trim()) return;
        const existing = editFormData.entityTags || [];
        if (!existing.includes(editVendorTagInput.trim())) {
            setEditFormData({ ...editFormData, entityTags: [...existing, editVendorTagInput.trim()] });
        }
        setEditVendorTagInput('');
    };

    const handleRemoveVendorEditTag = (tag: string) => {
        setEditFormData({ ...editFormData, entityTags: (editFormData.entityTags || []).filter((t: string) => t !== tag) });
    };

    const handleAddDocument = async (vendorId: string, e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            await strataPost(`/vendors/${vendorId}/documents`, {
                type: fd.get('docType'), description: fd.get('description'),
                expirationDate: fd.get('expirationDate') || undefined,
            });
            setShowDocForm(false);
            fetchDocs(vendorId);
            fetchVendors();
            showToast('Document added', 'success');
        } catch (err: any) { showToast(err?.message || 'Failed to add document', 'error'); }
    };

    const handleOnboard = async (vendorId: string) => {
        try {
            const res = await strataPost<any>(`/vendors/${vendorId}/onboard`, {});
            showToast(res.message || 'Onboarding queued', 'success');
            if (res.warnings?.length) showToast(`⚠ ${res.warnings.join(', ')}`, 'error');
            fetchVendors();
        } catch (err: any) { showToast(err?.message || 'Failed to start onboarding', 'error'); }
    };

    const handleDeactivate = async (vendorId: string) => {
        const reason = prompt('Deactivation reason:');
        if (!reason) return;
        try {
            const res = await strataPost<any>(`/vendors/${vendorId}/deactivate`, { reason });
            showToast(res.message || 'Deactivation queued', 'success');
            fetchVendors();
        } catch (err: any) { showToast(err?.message || 'Failed to deactivate', 'error'); }
    };

    const handleApprove = async (vendorId: string) => {
        try {
            const res = await strataPost<any>(`/vendors/${vendorId}/approve`, {});
            showToast(res.message || 'Approved', 'success');
            fetchVendors();
        } catch (err: any) { showToast(err?.message || 'Failed to approve', 'error'); }
    };

    const filtered = vendors.filter(v => {
        // Text search
        if (search) {
            const q = search.toLowerCase();
            const nameMatch = v.name.toLowerCase().includes(q);
            const specMatch = (v.metadata?.specialty || '').toLowerCase().includes(q);
            const tagMatch = (v.metadata?.serviceTags || []).some((t: string) => t.toLowerCase().includes(q));
            const typeMatch = (v.metadata?.vendorType || '').toLowerCase().includes(q);
            if (!nameMatch && !specMatch && !tagMatch && !typeMatch) return false;
        }
        // Type filter
        if (vendorTypeFilter !== 'all' && (v.metadata?.vendorType || 'Other') !== vendorTypeFilter) return false;
        // Compliance filter
        if (complianceFilter !== 'all') {
            const coi = getCoiStatus(v);
            if (complianceFilter === 'compliant' && coi.status !== 'valid') return false;
            if (complianceFilter === 'expiring' && coi.status !== 'expiring') return false;
            if (complianceFilter === 'non-compliant' && coi.status !== 'expired' && coi.status !== 'unknown') return false;
        }
        // Property filter
        if (propertyFilter) {
            const vendorAssocs = associations;
            // Only filter if this vendor is the selected one with loaded associations, or skip
            // For list-level filtering we check metadata or property_ids
            const propIds = v.metadata?.propertyIds || v.propertyIds || [];
            if (Array.isArray(propIds) && propIds.length > 0) {
                if (!propIds.includes(propertyFilter)) return false;
            }
        }
        return true;
    });

    const coiIcon = (status: string) => {
        switch (status) {
            case 'valid': return <CheckCircle size={14} />;
            case 'expiring': return <AlertTriangle size={14} />;
            case 'expired': return <AlertTriangle size={14} />;
            default: return <Shield size={14} />;
        }
    };

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">Vendors</h2>
                    <p className="s-module-subtitle">{vendors.length} vendors</p>
                </div>
                <div className="s-module-actions">
                    {hasPermission('strata:vendors:search') && (
                        <div className="s-search-box">
                            <Search size={14} />
                            <input placeholder="Search vendors, tags…" value={search} onChange={e => setSearch(e.target.value)} className="s-input s-input-sm" />
                        </div>
                    )}
                    <button className="s-btn s-btn-ghost" onClick={fetchVendors} aria-label="Refresh vendors"><RefreshCw size={14} /></button>
                    {hasPermission('strata:vendors:create') && (
                        <button className="s-btn s-btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Add Vendor</button>
                    )}
                </div>
            </div>

            {/* ── Phase 3: Vendor Type Filter Bar ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, padding: '0 4px' }}>
                <button
                    onClick={() => setVendorTypeFilter('all')}
                    style={{
                        padding: '4px 12px', borderRadius: 14, border: '1px solid',
                        borderColor: vendorTypeFilter === 'all' ? 'rgba(214,254,81,0.4)' : 'rgba(255,255,255,0.08)',
                        background: vendorTypeFilter === 'all' ? 'rgba(214,254,81,0.15)' : 'transparent',
                        color: vendorTypeFilter === 'all' ? '#D6FE51' : '#64748b',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                ><Filter size={10} style={{ marginRight: 4, verticalAlign: -1 }} />All Types</button>
                {VENDOR_TYPES.map(vt => {
                    const c = VENDOR_TYPE_COLORS[vt] || '#94a3b8';
                    return (
                        <button key={vt}
                            onClick={() => setVendorTypeFilter(vt)}
                            style={{
                                padding: '4px 12px', borderRadius: 14, border: '1px solid',
                                borderColor: vendorTypeFilter === vt ? `${c}66` : 'rgba(255,255,255,0.08)',
                                background: vendorTypeFilter === vt ? `${c}20` : 'transparent',
                                color: vendorTypeFilter === vt ? c : '#64748b',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >{vt}</button>
                    );
                })
            }
            </div>

            {/* Compliance + Property Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, padding: '0 4px' }}>
                <select aria-label="Filter vendors by compliance status" value={complianceFilter} onChange={e => setComplianceFilter(e.target.value as any)} style={{
                    padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                    color: '#e2e8f0', fontFamily: 'inherit',
                }}>
                    <option value="all">All Compliance</option>
                    <option value="compliant">✅ Compliant</option>
                    <option value="expiring">⚠ Expiring</option>
                    <option value="non-compliant">❌ Non-Compliant</option>
                </select>
                <select aria-label="Filter vendors by property" value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} style={{
                    padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                    color: '#e2e8f0', fontFamily: 'inherit',
                }}>
                    <option value="">All Properties</option>
                    {allProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </div>

            <div className="s-split-view">
                {/* Vendor List */}
                <div className="s-list-panel" tabIndex={0} role="region" aria-label="Vendor list">
                    {loading ? (
                        <LoadingState message="Loading vendors…" />
                    ) : error ? (
                        <ErrorState message={error} onRetry={fetchVendors} />
                    ) : filtered.length === 0 ? (
                        <div className="s-empty">No vendors found</div>
                    ) : (
                        filtered.map(v => {
                            const coi = getCoiStatus(v);
                            const vType = v.metadata?.vendorType || '';
                            const vTags: string[] = v.metadata?.serviceTags || [];
                            const typeColor = VENDOR_TYPE_COLORS[vType] || '#94a3b8';
                            return (
                                <div
                                    key={v.id}
                                    className={`s-list-item ${selected?.id === v.id ? 'active' : ''}`}
                                    onClick={() => setSelected(v)}
                                >
                                    <div className="s-list-item-top">
                                        <div className="s-avatar vendor"><Truck size={14} /></div>
                                        <div className="s-list-item-info">
                                            <span className="s-list-item-title">{v.name}</span>
                                            <span className="s-list-item-sub">{v.metadata?.specialty || 'General'}</span>
                                        </div>
                                    </div>
                                    {/* Vendor type badge + tag chips */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, alignItems: 'center' }}>
                                        {vType && (
                                            <span style={{
                                                fontSize: 9, padding: '2px 7px', borderRadius: 6, fontWeight: 700,
                                                background: `${typeColor}18`, color: typeColor, textTransform: 'uppercase',
                                            }}>{vType}</span>
                                        )}
                                        {vTags.slice(0, 3).map(t => (
                                            <span key={t} style={{
                                                fontSize: 9, padding: '1px 6px', borderRadius: 6, fontWeight: 600,
                                                background: 'rgba(214,254,81,0.1)', color: '#D6FE51',
                                            }}>{t}</span>
                                        ))}
                                        {vTags.length > 3 && (
                                            <span style={{ fontSize: 9, color: '#475569' }}>+{vTags.length - 3}</span>
                                        )}
                                    </div>
                                    {hasPermission('strata:vendors:coi-status') && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: coi.color, fontSize: '0.75rem', marginTop: 4 }}>
                                            {coiIcon(coi.status)} COI
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Vendor Detail */}
                <div className="s-detail-panel">
                    {selected ? (() => {
                        return (
                            <>
                                <div className="s-glass-card">
                                    <div className="s-vendor-profile">
                                        <div className="s-avatar-lg vendor"><Truck size={24} /></div>
                                        <div>
                                            <h3>{selected.name}</h3>
                                            <span className="s-text-muted">{selected.metadata?.specialty || 'General'}</span>
                                        </div>
                                    </div>
                                    {hasPermission('strata:vendors:contact-info') && (
                                        <div className="s-tenant-contact">
                                            {selected.email && <div><Mail size={14} /> {selected.email}</div>}
                                            {selected.phone && <div><Phone size={14} /> {selected.phone}</div>}
                                        </div>
                                    )}
                                    {selected.metadata?.rating > 0 && (
                                        <div className="s-vendor-rating">
                                            <span>Rating:</span>
                                            <span className="s-rating-stars">{'★'.repeat(Math.round(selected.metadata.rating))}{'☆'.repeat(5 - Math.round(selected.metadata.rating))}</span>
                                            <span className='s-text-muted'>({selected.metadata.rating})</span>
                                        </div>
                                    )}
                                    {/* Delete vendor */}
                                    {/* Workflow Action Buttons */}
                                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                                        {selected.status !== 'active' && selected.metadata?.pendingAction !== 'onboarding' && (
                                            <button onClick={() => handleOnboard(selected.id)} style={{
                                                flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                                                color: '#86efac', cursor: 'pointer', fontFamily: 'inherit',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                            }}><UserCheck size={12} />Onboard</button>
                                        )}
                                        {selected.status === 'active' && (
                                            <button onClick={() => handleDeactivate(selected.id)} style={{
                                                flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                                                color: '#fbbf24', cursor: 'pointer', fontFamily: 'inherit',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                            }}><UserX size={12} />Deactivate</button>
                                        )}
                                        {selected.metadata?.pendingAction && (
                                            <button onClick={() => handleApprove(selected.id)} style={{
                                                flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                background: 'rgba(214,254,81,0.1)', border: '1px solid rgba(214,254,81,0.25)',
                                                color: '#D6FE51', cursor: 'pointer', fontFamily: 'inherit',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                            }}><CheckCircle size={12} />Approve {selected.metadata.pendingAction}</button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                        <button onClick={() => openEditVendor(selected)} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            flex: 1, padding: '7px 12px', borderRadius: 8,
                                            fontSize: 11, fontWeight: 600,
                                            background: 'rgba(214,254,81,0.08)', border: '1px solid rgba(214,254,81,0.2)',
                                            color: '#D6FE51', cursor: 'pointer', fontFamily: 'inherit',
                                        }}>
                                            <Settings2 size={12} /> Edit Vendor
                                        </button>
                                        <button onClick={() => setConfirmDelete(selected.id)} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            flex: 1, padding: '7px 12px', borderRadius: 8,
                                            fontSize: 11, fontWeight: 600,
                                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                            color: '#fca5a5', cursor: 'pointer', fontFamily: 'inherit',
                                        }}>
                                            <Trash2 size={12} /> Delete Vendor
                                        </button>
                                    </div>
                                </div>

                                {/* ── Phase 3: Service Tags Editor ── */}
                                <div className="s-glass-card">
                                    <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                                        <Tag size={14} color="#818cf8" /> Service Tags
                                        {selected.metadata?.vendorType && (
                                            <span style={{
                                                fontSize: 10, padding: '2px 8px', borderRadius: 8, marginLeft: 'auto',
                                                background: `${VENDOR_TYPE_COLORS[selected.metadata.vendorType] || '#94a3b8'}18`,
                                                color: VENDOR_TYPE_COLORS[selected.metadata.vendorType] || '#94a3b8', fontWeight: 700,
                                            }}>{selected.metadata.vendorType}</span>
                                        )}
                                    </h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                        {(selected.metadata?.serviceTags || []).map((t: string) => (
                                            <span key={t} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                fontSize: 11, padding: '3px 10px', borderRadius: 12,
                                                background: 'rgba(214,254,81,0.12)', color: '#D6FE51', fontWeight: 600,
                                                border: '1px solid rgba(214,254,81,0.2)',
                                            }}>
                                                {t}
                                                <button onClick={() => handleRemoveTag(selected, t)} style={{
                                                    background: 'none', border: 'none', color: '#64748b',
                                                    cursor: 'pointer', padding: 0, display: 'flex', fontSize: 12,
                                                }}><X size={10} /></button>
                                            </span>
                                        ))}
                                        {(selected.metadata?.serviceTags || []).length === 0 && (
                                            <span style={{ fontSize: 11, color: '#475569' }}>No tags yet</span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input
                                            type="text"
                                            placeholder="Add tag…"
                                            value={tagInput}
                                            onChange={e => setTagInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(selected); } }}
                                            style={{
                                                flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 12,
                                                border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
                                                color: '#e2e8f0', fontFamily: 'inherit', outline: 'none',
                                            }}
                                        />
                                        <button onClick={() => handleAddTag(selected)} style={{
                                            padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                            background: 'rgba(214,254,81,0.15)', border: '1px solid rgba(214,254,81,0.3)',
                                            color: '#D6FE51', cursor: 'pointer', fontFamily: 'inherit',
                                        }}>Add</button>
                                    </div>
                                </div>

                                {/* Detail Tab Bar */}
                                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 12, flexWrap: 'wrap' }}>
                                    {(['overview', 'ledger', 'documents', 'performance', 'compliance', 'accounting', 'spaces'] as const).map(tab => (
                                        <button key={tab} onClick={() => setDetailTab(tab)} style={{
                                            padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                            background: 'none', border: 'none',
                                            borderBottom: detailTab === tab ? '2px solid #818cf8' : '2px solid transparent',
                                            color: detailTab === tab ? '#e2e8f0' : '#64748b',
                                            textTransform: 'capitalize',
                                        }}>
                                            {tab === 'spaces' ? 'Spaces & Links' : tab === 'documents' ? `Docs (${vendorDocs.length})` : tab}
                                        </button>
                                    ))}
                                </div>

                                {detailTab === 'overview' ? (
                                    <>

                                        {/* ── Task 3.2: 10-Block AppFolio Parity Layout (per v1 plan L166) ── */}
                                        <ErrorBoundary fallback={<div className="s-glass-card" style={{ color: '#f87171' }}>Vendor detail unavailable.</div>}>
                                            <BlockSection title="Identity" slug="identity" expanded={blockExpanded.identity} onToggle={(n) => toggleBlock('identity', n)}>
                                                <BlockIdentity vendor={selected} />
                                            </BlockSection>
                                            <BlockSection title="Contact" slug="contact" expanded={blockExpanded.contact} onToggle={(n) => toggleBlock('contact', n)}>
                                                <BlockContact vendor={selected} />
                                            </BlockSection>
                                            <BlockSection title="Portal" slug="portal" expanded={blockExpanded.portal} onToggle={(n) => toggleBlock('portal', n)}>
                                                <BlockPortal vendor={selected} />
                                            </BlockSection>
                                            <BlockSection title="Federal Tax" slug="federal-tax" expanded={blockExpanded['federal-tax']} onToggle={(n) => toggleBlock('federal-tax', n)}>
                                                <BlockFederalTax vendor={selected} />
                                            </BlockSection>
                                            <BlockSection title="Accounting" slug="accounting" expanded={blockExpanded.accounting} onToggle={(n) => toggleBlock('accounting', n)}>
                                                <BlockAccounting vendor={selected} onCrossLink={() => setDetailTab('accounting')} />
                                            </BlockSection>
                                            <BlockSection title="Payment Type" slug="payment-type" expanded={blockExpanded['payment-type']} onToggle={(n) => toggleBlock('payment-type', n)}>
                                                <BlockPaymentType vendor={selected} />
                                            </BlockSection>
                                            <BlockSection title="Compliance" slug="compliance" expanded={blockExpanded.compliance} onToggle={(n) => toggleBlock('compliance', n)}>
                                                <BlockCompliance vendor={selected} onCrossLink={() => setDetailTab('compliance')} />
                                            </BlockSection>
                                            <BlockSection title="Survey" slug="survey" expanded={blockExpanded.survey} onToggle={(n) => toggleBlock('survey', n)}>
                                                <BlockSurvey vendor={selected} />
                                            </BlockSection>
                                            <BlockSection title="Notes" slug="notes" expanded={blockExpanded.notes} onToggle={(n) => toggleBlock('notes', n)}>
                                                <BlockNotes vendor={selected} />
                                            </BlockSection>
                                            <BlockSection title="Activity" slug="activity" expanded={blockExpanded.activity} onToggle={(n) => toggleBlock('activity', n)}>
                                                <BlockActivity vendor={selected} />
                                            </BlockSection>
                                        </ErrorBoundary>

                                        {/* Quick Dispatch */}
                                        {hasPermission('strata:vendors:work-orders') && (
                                            <div className="s-glass-card">
                                                <h3 style={{ marginBottom: '1rem' }}>Quick Dispatch</h3>
                                                <p className="s-text-muted" style={{ marginBottom: '0.75rem' }}>Assign this vendor to an open work order:</p>
                                                {workOrders.length > 0 ? (
                                                    <div className="s-dispatch-list">
                                                        {workOrders.slice(0, 5).map(wo => (
                                                            <div key={wo.id} className="s-dispatch-item">
                                                                <span>{wo.title}</span>
                                                                <button className="s-btn s-btn-xs s-btn-primary" onClick={async () => {
                                                                try {
                                                                    await strataPut(`/workitems/${wo.id}`, { metadata: { ...wo.metadata, assignedVendorId: selected.id, assignedVendorName: selected.name } });
                                                                    showToast(`Dispatched ${selected.name} to: ${wo.title}`, 'success');
                                                                } catch { showToast('Failed to dispatch vendor', 'error'); }
                                                            }}>
                                                                Dispatch
                                                            </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="s-text-muted">No open work orders</p>
                                                )}
                                            </div>
                                        )}

                                        {/* ── Property Associations (Phase 4) ── */}
                                        <div className="s-glass-card">
                                            <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                                                <Building2 size={14} color="#3b82f6" /> Property Associations
                                                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>({associations.length})</span>
                                                <button onClick={() => setShowLinkForm(!showLinkForm)} style={{
                                                    marginLeft: 'auto', padding: '3px 10px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                                                    background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
                                                    color: '#60a5fa', cursor: 'pointer', fontFamily: 'inherit',
                                                }}><Plus size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Link Property</button>
                                            </h3>

                                            {/* Link Property Form */}
                                            {showLinkForm && (
                                                <div style={{
                                                    padding: 10, borderRadius: 8, marginBottom: 10,
                                                    background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)',
                                                }}>
                                                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                                        <select value={linkPropertyId} onChange={e => setLinkPropertyId(e.target.value)} style={{
                                                            flex: 2, padding: '6px 8px', borderRadius: 6, fontSize: 11,
                                                            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                                                            color: '#e2e8f0', fontFamily: 'inherit',
                                                        }}>
                                                            <option value="">Select property…</option>
                                                            {allProperties
                                                                .filter(p => !associations.some(a => a.propertyId === p.id))
                                                                .map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                                                            }
                                                        </select>
                                                        <input
                                                            placeholder="Account #"
                                                            value={linkAccountNumber}
                                                            onChange={e => setLinkAccountNumber(e.target.value)}
                                                            style={{
                                                                flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 11,
                                                                border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                                                                color: '#e2e8f0', fontFamily: 'inherit',
                                                            }}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                        <button onClick={() => setShowLinkForm(false)} style={{
                                                            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                            background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                                                            color: '#64748b', cursor: 'pointer', fontFamily: 'inherit',
                                                        }}>Cancel</button>
                                                        <button onClick={() => handleLinkProperty(selected.id)} style={{
                                                            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                            background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                                                            color: '#60a5fa', cursor: 'pointer', fontFamily: 'inherit',
                                                        }}>Link</button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Association Cards */}
                                            {associations.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {associations.map(assoc => {
                                                        const prop = allProperties.find(p => p.id === assoc.propertyId);
                                                        const statusColors: Record<string, string> = { active: '#22c55e', suspended: '#f59e0b', terminated: '#ef4444' };
                                                        const sc = statusColors[assoc.status] || '#64748b';
                                                        return (
                                                            <div key={assoc.id} style={{
                                                                padding: '8px 10px', borderRadius: 8, fontSize: 12,
                                                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                                                                display: 'flex', flexDirection: 'column', gap: 4,
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                    <Building2 size={12} color="#3b82f6" />
                                                                    <span style={{ flex: 1, fontWeight: 600, color: '#e2e8f0' }}>
                                                                        <button className="s-property-link" style={{ fontSize: 12, fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); navigateToProperty(assoc.propertyId); }}>{prop?.name || assoc.propertyId}</button>
                                                                    </span>
                                                                    <button onClick={() => handleToggleAssocStatus(assoc, selected.id)} style={{
                                                                        padding: '1px 7px', borderRadius: 6, fontSize: 9, fontWeight: 700,
                                                                        background: `${sc}15`, border: `1px solid ${sc}40`, color: sc,
                                                                        cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
                                                                    }}>{assoc.status}</button>
                                                                    <button onClick={() => handleUnlinkAssoc(assoc.id, selected.id)} style={{
                                                                        background: 'none', border: 'none', color: '#475569',
                                                                        cursor: 'pointer', padding: '2px', display: 'flex',
                                                                    }}><Unlink size={11} /></button>
                                                                </div>
                                                                {(assoc.accountNumber || assoc.contractStart || assoc.contractEnd) && (
                                                                    <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#64748b' }}>
                                                                        {assoc.accountNumber && <span>Acct: {assoc.accountNumber}</span>}
                                                                        {assoc.contractStart && <span>Start: {assoc.contractStart?.slice(0, 10)}</span>}
                                                                        {assoc.contractEnd && <span>End: {assoc.contractEnd?.slice(0, 10)}</span>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>No property associations</p>
                                            )}
                                        </div>

                                        {/* ── Linked Work Orders ── */}
                                        <div className="s-glass-card">
                                            <h3 style={{ marginBottom: '0.75rem', fontSize: 14 }}>Linked Work Orders</h3>
                                            {(() => {
                                                const vendorWOs = workOrders.filter(wo =>
                                                    wo.title?.toLowerCase().includes(selected.name.toLowerCase()) ||
                                                    wo.metadata?.vendor?.toLowerCase() === selected.name.toLowerCase() ||
                                                    (wo.tags || []).some((t: string) => t.toLowerCase() === selected.name.toLowerCase())
                                                );
                                                return vendorWOs.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        {vendorWOs.map(wo => (
                                                            <div key={wo.id} style={{
                                                                padding: '8px 10px', borderRadius: 6, fontSize: 12,
                                                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                            }}>
                                                                <span style={{ color: '#e2e8f0' }}>{wo.title}</span>
                                                                <span style={{
                                                                    fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                                    background: wo.status === 'open' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                                                                    color: wo.status === 'open' ? '#f59e0b' : '#10b981',
                                                                }}>{wo.status}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="s-text-muted" style={{ fontSize: 12 }}>No linked work orders</p>
                                                );
                                            })()}
                                        </div>

                                        {/* (Vendor Notes inline block removed by Task 3.2 — subsumed by BlockNotes in the 10-block layout above.) */}
                                    </>
                                ) : detailTab === 'ledger' ? (
                                    <>
                                        <div className="s-glass-card">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <DollarSign size={14} /> Vendor Ledger
                                                    <span style={{ fontSize: 11, color: vendorBalance >= 0 ? '#10b981' : '#f97316', fontWeight: 600 }}>
                                                        {'Balance: $' + Math.abs(vendorBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                        {vendorBalance < 0 ? ' (owed)' : ''}
                                                    </span>
                                                </h3>
                                                <button className="s-btn s-btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}
                                                    onClick={() => setShowLedgerForm(!showLedgerForm)}>
                                                    <Plus size={12} /> Add Entry
                                                </button>
                                            </div>

                                            {/* W9 Soft-Block Banner */}
                                            {(() => {
                                                const comp = selected.metadata?.compliance || {};
                                                const w9Year = comp.w9Year || comp.w9_year;
                                                const currentYear = new Date().getFullYear().toString();
                                                if (w9Year !== currentYear) return (
                                                    <div style={{
                                                        padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                                                        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                                                        display: 'flex', alignItems: 'center', gap: 10,
                                                    }}>
                                                        <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
                                                        <div style={{ flex: 1, fontSize: 12, color: '#fbbf24' }}>
                                                            <strong>W9 not received for {currentYear}.</strong> Recommend withholding payment until submitted.
                                                        </div>
                                                        <button className="s-btn s-btn-ghost" style={{ fontSize: 10, padding: '3px 10px', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' }}>
                                                            Request W9
                                                        </button>
                                                    </div>
                                                );
                                                return null;
                                            })()}

                                            {showLedgerForm && (
                                                <form onSubmit={async (e) => {
                                                    e.preventDefault();
                                                    const fd = new FormData(e.currentTarget);
                                                    await strataPost(`/vendors/${selected.id}/ledger`, {
                                                        date: fd.get('date'), description: fd.get('description'),
                                                        amount: parseFloat(fd.get('amount') as string),
                                                        type: fd.get('type'), category: fd.get('category'),
                                                        reference: fd.get('reference'),
                                                    });
                                                    setShowLedgerForm(false);
                                                    fetchLedger(selected.id);
                                                }} style={{ padding: 12, borderRadius: 8, marginBottom: 12, background: 'rgba(214,254,81,0.04)', border: '1px solid rgba(214,254,81,0.15)' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                                                        <input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="s-input" style={{ fontSize: 11 }} />
                                                        <input name="amount" type="number" step="0.01" placeholder="Amount" required className="s-input" style={{ fontSize: 11 }} />
                                                        <select name="type" className="s-input" style={{ fontSize: 11 }}>
                                                            <option value="debit">Debit (Payment out)</option>
                                                            <option value="credit">Credit (Payment in)</option>
                                                        </select>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                                                        <input name="description" placeholder="Description" required className="s-input" style={{ fontSize: 11 }} />
                                                        <input name="category" placeholder="Category" className="s-input" style={{ fontSize: 11 }} />
                                                        <input name="reference" placeholder="Ref #" className="s-input" style={{ fontSize: 11 }} />
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                                                        <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowLedgerForm(false)}>Cancel</button>
                                                        <button type="submit" className="s-btn s-btn-primary">Save</button>
                                                    </div>
                                                </form>
                                            )}

                                            {ledger.length > 0 ? (
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Date</th>
                                                                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Description</th>
                                                                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Category</th>
                                                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>Debit</th>
                                                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>Credit</th>
                                                                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Ref</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {ledger.map((entry: any) => (
                                                                <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                                    <td style={{ padding: '8px', color: '#94a3b8' }}>{entry.date}</td>
                                                                    <td style={{ padding: '8px', color: '#e2e8f0' }}>{entry.description}</td>
                                                                    <td style={{ padding: '8px', color: '#64748b' }}>{entry.category}</td>
                                                                    <td style={{ padding: '8px', textAlign: 'right', color: '#f97316' }}>
                                                                        {entry.type === 'debit' ? '$' + entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}
                                                                    </td>
                                                                    <td style={{ padding: '8px', textAlign: 'right', color: '#10b981' }}>
                                                                        {entry.type === 'credit' ? '$' + entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}
                                                                    </td>
                                                                    <td style={{ padding: '8px', color: '#475569', fontSize: 10 }}>{entry.reference}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: 20, color: '#475569', fontSize: 12 }}>
                                                    <DollarSign size={24} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 8 }} />
                                                    <p style={{ margin: 0 }}>No ledger entries yet</p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : detailTab === 'documents' ? (
                                    <>
                                        <div className="s-glass-card">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <FileText size={14} color="#818cf8" /> Documents
                                                </h3>
                                                <button onClick={() => setShowDocForm(!showDocForm)} className="s-btn s-btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}>
                                                    <Upload size={12} /> Add Document
                                                </button>
                                            </div>

                                            {showDocForm && (
                                                <form onSubmit={(e) => handleAddDocument(selected.id, e)} style={{
                                                    padding: 12, borderRadius: 8, marginBottom: 12,
                                                    background: 'rgba(214,254,81,0.04)', border: '1px solid rgba(214,254,81,0.15)',
                                                }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                                                        <select name="docType" required style={{
                                                            padding: '6px 8px', borderRadius: 6, fontSize: 11,
                                                            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                                                            color: '#e2e8f0', fontFamily: 'inherit',
                                                        }}>
                                                            <option value="w9">W-9</option>
                                                            <option value="coi">COI</option>
                                                            <option value="agreement">Agreement</option>
                                                            <option value="certification">Certification</option>
                                                            <option value="license">License</option>
                                                            <option value="other">Other</option>
                                                        </select>
                                                        <input name="expirationDate" type="date" placeholder="Expiration" className="s-input" style={{ fontSize: 11 }} />
                                                        <input name="description" placeholder="Description" className="s-input" style={{ fontSize: 11 }} />
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                                        <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowDocForm(false)}>Cancel</button>
                                                        <button type="submit" className="s-btn s-btn-primary">Save</button>
                                                    </div>
                                                </form>
                                            )}

                                            {vendorDocs.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {vendorDocs.map(doc => {
                                                        const typeColors: Record<string, string> = {
                                                            w9: '#f59e0b', coi: '#3b82f6', agreement: '#D6FE51',
                                                            certification: '#10b981', license: '#06b6d4', other: '#64748b',
                                                        };
                                                        const tc = typeColors[doc.type] || '#64748b';
                                                        const isExpired = doc.expirationDate && new Date(doc.expirationDate) < new Date();
                                                        return (
                                                            <div key={doc.id} style={{
                                                                padding: '8px 12px', borderRadius: 8,
                                                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                                                                display: 'flex', alignItems: 'center', gap: 10,
                                                            }}>
                                                                <span style={{
                                                                    fontSize: 9, padding: '2px 7px', borderRadius: 6, fontWeight: 700,
                                                                    background: `${tc}18`, color: tc, textTransform: 'uppercase',
                                                                }}>{doc.type}</span>
                                                                <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>{doc.description}</span>
                                                                {doc.expirationDate && (
                                                                    <span style={{ fontSize: 10, color: isExpired ? '#ef4444' : '#64748b' }}>
                                                                        {isExpired ? '⚠ Expired' : 'Exp'}: {doc.expirationDate.slice(0, 10)}
                                                                    </span>
                                                                )}
                                                                <span style={{ fontSize: 10, color: '#475569' }}>{new Date(doc.createdAt).toLocaleDateString()}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: 20, color: '#475569', fontSize: 12 }}>
                                                    <FileText size={24} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 8 }} />
                                                    <p style={{ margin: 0 }}>No documents on file</p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : detailTab === 'performance' ? (
                                    <>
                                        <div className="s-glass-card">
                                            <h3 style={{ marginBottom: 12, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <BarChart3 size={14} color="#818cf8" /> Performance Summary
                                            </h3>
                                            {performance ? (
                                                <>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                                                        {[
                                                            { label: 'Work Orders', value: performance.totalWorkOrders, color: '#D6FE51', icon: <Truck size={14} /> },
                                                            { label: 'Completed', value: performance.completedWorkOrders, color: '#10b981', icon: <CheckCircle size={14} /> },
                                                            { label: 'Avg Resolution', value: performance.avgResolutionHours ? `${performance.avgResolutionHours}h` : 'N/A', color: '#f59e0b', icon: <Clock size={14} /> },
                                                            { label: 'Satisfaction', value: performance.avgSatisfaction ? `${performance.avgSatisfaction}/5` : 'N/A', color: '#D6FE51', icon: <Award size={14} /> },
                                                            { label: 'Total Spend', value: `$${performance.totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: '#f97316', icon: <DollarSign size={14} /> },
                                                            { label: 'Properties', value: performance.propertiesServed, color: '#3b82f6', icon: <Building2 size={14} /> },
                                                        ].map(k => (
                                                            <div key={k.label} style={{
                                                                background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px',
                                                                border: '1px solid rgba(255,255,255,0.06)',
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                                    <span style={{ color: k.color }}>{k.icon}</span>
                                                                    <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{k.label}</span>
                                                                </div>
                                                                <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>{k.value}</div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {performance.recentActivity?.length > 0 && (
                                                        <>
                                                            <h4 style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 8, marginTop: 0 }}>Recent Activity</h4>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                {performance.recentActivity.map((a: any) => (
                                                                    <div key={a.id} style={{
                                                                        padding: '6px 10px', borderRadius: 6,
                                                                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                                                                        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                                                                    }}>
                                                                        <span style={{ color: '#e2e8f0', flex: 1 }}>{a.title}</span>
                                                                        <span style={{
                                                                            fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                                            background: a.status === 'resolved' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                                                            color: a.status === 'resolved' ? '#10b981' : '#f59e0b',
                                                                        }}>{a.status}</span>
                                                                        <span style={{ fontSize: 10, color: '#475569' }}>{new Date(a.createdAt).toLocaleDateString()}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: 20, color: '#475569', fontSize: 12 }}>
                                                    <BarChart3 size={24} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 8 }} />
                                                    <p style={{ margin: 0 }}>No performance data available</p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : detailTab === 'compliance' ? (
                                    <ErrorBoundary fallback={<div className="s-glass-card" style={{ color: '#f87171' }}>Tab unavailable.</div>}>
                                        <ComplianceTab vendor={selected} />
                                    </ErrorBoundary>
                                ) : detailTab === 'accounting' ? (
                                    <ErrorBoundary fallback={<div className="s-glass-card" style={{ color: '#f87171' }}>Tab unavailable.</div>}>
                                        <AccountingTab vendor={selected} />
                                    </ErrorBoundary>
                                ) : detailTab === 'spaces' ? (
                                    <ProfileSpaces entityType="vendor" entityId={selected.id} />
                                ) : null}
                            </>
                        );
                    })() : (
                        <div className="s-empty-detail">
                            <Truck size={40} strokeWidth={1} />
                            <p>Select a vendor to view details</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Vendor Modal */}
            {showForm && (
                <div className="s-modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="s-modal" onClick={e => e.stopPropagation()}>
                        <div className="s-modal-header">
                            <h3>Add Vendor</h3>
                            <button className="s-btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div className="s-form-group">
                                <label>Company Name</label>
                                <input name="name" required placeholder="Vendor company name" className="s-input" />
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Email</label>
                                    <input name="email" type="email" placeholder="contact@vendor.com" className="s-input" />
                                </div>
                                <div className="s-form-group">
                                    <label>Phone</label>
                                    <input name="phone" placeholder="555-000-0000" className="s-input" />
                                </div>
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Specialty</label>
                                    <select name="specialty" className="s-input">
                                        <option value="plumbing">Plumbing</option>
                                        <option value="hvac">HVAC</option>
                                        <option value="electrical">Electrical</option>
                                        <option value="painting">Painting</option>
                                        <option value="landscaping">Landscaping</option>
                                        <option value="locksmith">Locksmith</option>
                                        <option value="janitorial">Janitorial</option>
                                        <option value="roofing">Roofing</option>
                                        <option value="general">General</option>
                                    </select>
                                </div>
                                <div className="s-form-group">
                                    <label>Vendor Type</label>
                                    <select name="vendorType" className="s-input">
                                        {VENDOR_TYPES.map(vt => <option key={vt} value={vt}>{vt}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Service Tags <span style={{ fontSize: 10, color: '#64748b' }}>(comma-separated)</span></label>
                                    <input name="serviceTags" placeholder="e.g. emergency, 24hr, licensed" className="s-input" />
                                </div>
                                <div className="s-form-group">
                                    <label>COI Expiry Date</label>
                                    <input name="coiExpiry" type="date" className="s-input" />
                                </div>
                            </div>
                            <div className="s-modal-footer">
                                <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="s-btn s-btn-primary">Add Vendor</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Vendor Modal */}
            {showEditForm && selected && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowEditForm(false)}>
                    <div style={{ width: 560, maxWidth: '90vw', maxHeight: '85vh', background: '#1e293b', borderRadius: 16, padding: 0, border: '1px solid rgba(214,254,81,0.2)', boxShadow: '0 24px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Edit Vendor</h3>
                            <button onClick={() => setShowEditForm(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleEditVendorSave} style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
                            <div style={{ padding: '10px 14px', background: 'rgba(214,254,81,0.08)', borderRadius: 8, border: '1px solid rgba(214,254,81,0.2)', marginBottom: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>Editing: {selected.name}</div>
                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Update vendor details, compliance info, and entity tags.</div>
                            </div>

                            <h4 style={{ fontSize: 11, color: '#D6FE51', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Contact Info</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                                <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vendor Name</label><input className="s-input" value={editFormData.name || ''} onChange={e => setEditFormData({...editFormData, name: e.target.value})} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</label><input className="s-input" type="email" value={editFormData.email || ''} onChange={e => setEditFormData({...editFormData, email: e.target.value})} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</label><input className="s-input" value={editFormData.phone || ''} onChange={e => setEditFormData({...editFormData, phone: e.target.value})} /></div>
                            </div>

                            <h4 style={{ fontSize: 11, color: '#10b981', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Service Details</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Specialty</label><input className="s-input" value={editFormData.specialty || ''} onChange={e => setEditFormData({...editFormData, specialty: e.target.value})} placeholder="e.g. Plumbing & HVAC" /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vendor Type</label><select className="s-input" value={editFormData.vendorType || 'Other'} onChange={e => setEditFormData({...editFormData, vendorType: e.target.value})}>{VENDOR_TYPES.map(vt => <option key={vt} value={vt}>{vt}</option>)}</select></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>COI Expiry</label><input className="s-input" type="date" value={editFormData.coiExpiry || ''} onChange={e => setEditFormData({...editFormData, coiExpiry: e.target.value})} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rating (0-5)</label><input className="s-input" type="number" min="0" max="5" step="0.5" value={editFormData.rating || 0} onChange={e => setEditFormData({...editFormData, rating: e.target.value})} /></div>
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</label>
                                <textarea className="s-input" style={{ minHeight: 50, resize: 'vertical' }} value={editFormData.notes || ''} onChange={e => setEditFormData({...editFormData, notes: e.target.value})} placeholder="Internal notes about this vendor…" />
                            </div>

                            <h4 style={{ fontSize: 11, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Entity Tags</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {(editFormData.entityTags || []).map((tag: string) => (
                                    <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(168,85,247,0.12)', color: '#E8FF7A', fontWeight: 600, border: '1px solid rgba(168,85,247,0.2)' }}>
                                        <Tag size={10} /> {tag}
                                        <button onClick={() => handleRemoveVendorEditTag(tag)} type="button" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={10} /></button>
                                    </span>
                                ))}
                                {(editFormData.entityTags || []).length === 0 && <span style={{ fontSize: 11, color: '#475569' }}>No tags — link to properties, owners, tenants</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                                <input value={editVendorTagInput} onChange={e => setEditVendorTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddVendorEditTag(); } }} placeholder="Add tag (property, owner, tenant name)…" style={{ flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 11, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', fontFamily: 'inherit', outline: 'none' }} />
                                <button type="button" onClick={handleAddVendorEditTag} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#E8FF7A', cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                                <button type="button" onClick={() => setShowEditForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm Dialog */}
            {confirmDelete && (
                <div className="s-modal-overlay" onClick={() => setConfirmDelete(null)}>
                    <div className="s-modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: 380 }}>
                        <Trash2 size={32} style={{ color: '#f87171', marginBottom: 12 }} />
                        <h3 style={{ margin: '0 0 8px' }}>Delete Vendor?</h3>
                        <p className="s-text-muted" style={{ marginBottom: 20 }}>This action cannot be undone. The vendor record will be permanently removed.</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                            <button className="s-btn s-btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                            <button className="s-btn" style={{ background: 'linear-gradient(135deg, #ef4444, #f87171)', color: '#fff', border: 'none' }}
                                onClick={() => handleDelete(confirmDelete)}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
                <ToastContainer />
        </div>
    );
}

