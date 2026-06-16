/**
 * ResidentsModule — Full tenant lifecycle management for Strata
 *
 * Features: status workflow, history timeline, communication templates,
 * bulk operations, linkage validation, enhanced search & filters.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Users, Search, RefreshCw, Mail, Phone, MapPin, CreditCard,
    Home, Building2, Calendar, Shield, Car, Dog, FileText,
    Globe, DollarSign, Clock, AlertTriangle, ChevronDown, ChevronUp,
    Plus, Trash2, X, CheckSquare, Square, Send, MessageSquare,
    ArrowRight, History, Link2, Check, AlertCircle, XCircle, Settings2, Tag,
} from 'lucide-react';
import { useUser } from '../../../context/UserContext';
import { API_BASE } from '../../../config';
import { strataGet, strataPost, strataPut, strataDelete } from '../strataApi';
import ProfileSpaces from './ProfileSpaces';
import { LoadingState, ErrorState } from '../StateView';
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';
import { useStrataNav } from '../StrataNavContext';
import type { ResidentHistoryEvent, ResidentLinkage, CommunicationTemplate, Occupancy, EntityProfile, EmergencyContact, Animal, Vehicle } from '../strataTypes';

const API = API_BASE;

interface Tenant {
    id: string; entityType: string; name: string; email: string | null;
    phone: string | null; address: string | null; metadata: Record<string, any>;
    propertyIds: string[]; status: string; createdAt: string;
}

const RESIDENT_STATUSES = ['onboarding', 'active', 'notice', 'renewal', 'former'] as const;
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
    onboarding: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
    active: { bg: 'rgba(16,185,129,0.12)', color: '#22c55e' },
    notice: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
    renewal: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7' },
    former: { bg: 'rgba(100,116,139,0.12)', color: 'var(--text-tertiary)' },
    inactive: { bg: 'rgba(100,116,139,0.12)', color: 'var(--text-tertiary)' },
    pending: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
    archived: { bg: 'rgba(100,116,139,0.12)', color: 'var(--text-tertiary)' },
};
const TRANSITIONS: Record<string, string[]> = {
    onboarding: ['active'], active: ['notice', 'renewal', 'former'],
    notice: ['former', 'active'], renewal: ['active', 'former'],
    former: ['onboarding', 'active'], inactive: ['onboarding', 'active'],
    pending: ['onboarding', 'active'], archived: ['onboarding', 'active'],
};
const TEMPLATES: { key: CommunicationTemplate; label: string; icon: string }[] = [
    { key: 'welcome', label: 'Welcome', icon: '' },
    { key: 'lease_renewal', label: 'Lease Renewal', icon: '' },
    { key: 'rent_reminder', label: 'Rent Reminder', icon: '' },
    { key: 'notice_to_vacate', label: 'Notice to Vacate', icon: '' },
    { key: 'maintenance_scheduled', label: 'Maintenance Scheduled', icon: '' },
    { key: 'general', label: 'General Notice', icon: '' },
];

// ─── Task 3.1: Tenant detail v1 L164 expansion (parallel-batch FINAL survivor) ───
//
// Adds 5 NEW exported Block components (FolioGuard upsell / Emergency Contact /
// Upcoming Activities / Animals / Vehicles) + 1 NEW exported InsuranceStatusBadge
// (partial-upgrade for the existing Insurance DetailSection).
//
// Per v1 plan L164: "Add collapsible sections for: FolioGuard-equivalent upsell card,
// Emergency Contact, Upcoming Activities, Insurance Coverage, Animals, Vehicles.
// Existing sections keep their current appearance." Scope intentionally narrow — the
// other ~17 AppFolio sections from gap analysis L173 (Screening / Texts / Audit Log
// / Attachments / Monthly Charges typed render / etc.) are gap-analysis-aspirational
// and DEFERRED to v2.18+ §7 candidates.
//
// Encrypted-blob defensive guard pattern (Drift #B-i from Task 3.4 — STRING-typed
// `enc:v1:astra:*` metadata blobs) is NOT applicable to tenants: 0/322 tenant
// entities carry STRING-typed metadata or the encrypted prefix (PRE1-(c) verified).
// Plain `Array.isArray()` guards suffice on the typed Task-1.1 paths (animals /
// vehicles / emergencyContacts).
//
// Helpers (parseLegacyDate / fmtIsoDate / daysUntil) are LOCALLY DUPLICATED from
// VendorsModule.tsx Task 3.2 (where parseLegacyDate / fmtIsoDate are module-private,
// not exported). §7 follow-up: extract to shared `utils/legacyDate.ts` and rewire
// both consumers. Local duplication preserves single-file additive scope and isolation.

/** Parse a legacy MM/DD/YYYY string OR an ISO YYYY-MM-DD date into Date.
 *  Locally duplicated from VendorsModule.tsx:44 (Task 3.2). */
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

/** Locally duplicated from VendorsModule.tsx:56 (Task 3.2). */
function fmtIsoDate(d: Date | null): string {
    if (!d) return '—';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days between today and target (positive = future, negative = past). */
function daysUntil(target: Date, today: Date): number {
    const ms = target.getTime() - today.getTime();
    return Math.round(ms / 86400000);
}

/** Module-local label/value row helper for Block content. NOT exported. */
function BlockRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', fontSize: 10 }}>{label}</span>
            <span style={{ color: 'var(--text-secondary)', textAlign: 'right', wordBreak: 'break-word', fontSize: 12 }}>{value}</span>
        </div>
    );
}

/** Module-local collapsible wrapper for the 5 NEW Task 3.1 blocks. NOT exported. */
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
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 10 }}>
            <button
                type="button"
                onClick={() => onToggle(!expanded)}
                aria-expanded={expanded}
                aria-controls={`tenant-block-${slug}`}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', border: 'none', background: 'none',
                    color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                    textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
                }}
            >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <span style={{ flex: 1, textAlign: 'left' }}>{title}</span>
            </button>
            {expanded && <div id={`tenant-block-${slug}`} style={{ padding: '0 14px 12px' }}>{children}</div>}
        </div>
    );
}

// ── Block 1 (Task 3.1): FolioGuard Smart Ensure upsell — stub per v1 L168 ──
export function BlockFolioGuardUpsell(_props: { tenant: EntityProfile }) {
    return (
        <div data-testid="tenant-block-folioguard" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            FolioGuard Smart Ensure — automated insurance requirement tracking. Coming soon — Phase-5 wires the Compliance-module Insurance tab as the Strata equivalent of AppFolio's tenant-side upsell card.
        </div>
    );
}

// ── Block 2 (Task 3.1): Emergency Contact — typed Task-1.1 path ──
export function BlockEmergencyContact({ tenant }: { tenant: EntityProfile }) {
    const contacts: EmergencyContact[] = Array.isArray(tenant.emergencyContacts) ? tenant.emergencyContacts : [];
    if (contacts.length === 0) {
        return (
            <div data-testid="tenant-block-emergency-contact" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                No emergency contact on file.
            </div>
        );
    }
    return (
        <div data-testid="tenant-block-emergency-contact" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contacts.map((c, i) => (
                <div key={i} style={{ paddingBottom: i < contacts.length - 1 ? 6 : 0, borderBottom: i < contacts.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <BlockRow label="Name" value={c.name || '—'} />
                    <BlockRow label="Relationship" value={c.relationship || '—'} />
                    <BlockRow label="Phone" value={c.phone || '—'} />
                    <BlockRow label="Email" value={c.email ?? '—'} />
                </div>
            ))}
        </div>
    );
}

// ── Block 3 (Task 3.1): Upcoming Activities — stub per v1 L168 ──
export function BlockUpcomingActivities(_props: { tenant: EntityProfile }) {
    return (
        <div data-testid="tenant-block-upcoming-activities" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            Upcoming activities not yet captured. Coming soon — Phase-5 wires per-tenant scheduled events (lease renewal, inspection, rent increase) once the activity-feed pipeline lands.
        </div>
    );
}

// ── Block 4 (Task 3.1): Animals — typed Task-1.1 path ──
export function BlockAnimals({ tenant }: { tenant: EntityProfile }) {
    const animals: Animal[] = Array.isArray(tenant.animals) ? tenant.animals : [];
    if (animals.length === 0) {
        return (
            <div data-testid="tenant-block-animals" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                No animals on file.
            </div>
        );
    }
    return (
        <div data-testid="tenant-block-animals" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {animals.map((a, i) => (
                <div key={a.id || i} style={{ paddingBottom: i < animals.length - 1 ? 6 : 0, borderBottom: i < animals.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <BlockRow label="Name" value={a.name || '—'} />
                    <BlockRow label="Species" value={a.species || '—'} />
                    <BlockRow label="Breed" value={a.breed ?? '—'} />
                    <BlockRow label="Weight" value={a.weight != null ? `${a.weight} lb` : '—'} />
                    <BlockRow
                        label="Service Animal"
                        value={a.isServiceAnimal
                            ? <span style={{ color: '#22c55e', fontWeight: 700 }}>Yes</span>
                            : 'No'}
                    />
                </div>
            ))}
        </div>
    );
}

// ── Block 5 (Task 3.1): Vehicles — typed Task-1.1 path ──
export function BlockVehicles({ tenant }: { tenant: EntityProfile }) {
    const vehicles: Vehicle[] = Array.isArray(tenant.vehicles) ? tenant.vehicles : [];
    if (vehicles.length === 0) {
        return (
            <div data-testid="tenant-block-vehicles" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                No vehicles on file.
            </div>
        );
    }
    return (
        <div data-testid="tenant-block-vehicles" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {vehicles.map((v, i) => (
                <div key={v.id || i} style={{ paddingBottom: i < vehicles.length - 1 ? 6 : 0, borderBottom: i < vehicles.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <BlockRow label="Year" value={v.year != null ? String(v.year) : '—'} />
                    <BlockRow label="Make" value={v.make || '—'} />
                    <BlockRow label="Model" value={v.model || '—'} />
                    <BlockRow label="Color" value={v.color ?? '—'} />
                    <BlockRow label="License Plate" value={v.licensePlate ?? '—'} />
                    <BlockRow label="State" value={v.state ?? '—'} />
                </div>
            ))}
        </div>
    );
}

// ── Insurance status badge (Task 3.1 partial-upgrade for existing Insurance DetailSection) ──
//
// Reads the metadata-string `insuranceExpiration` (legacy MM/DD/YYYY) and renders a
// tri-state pill: Active (>30d) / Expiring soon (≤30d) / Expired (past). `today` is
// injectable for deterministic tests. Returns null when expiration absent/unparseable.
export function InsuranceStatusBadge({
    tenant, today = new Date(),
}: {
    tenant: EntityProfile;
    today?: Date;
}) {
    const raw = tenant.metadata?.insuranceExpiration;
    const exp = parseLegacyDate(raw);
    if (!exp) return null;
    const diff = daysUntil(exp, today);
    let label: string;
    let bg: string;
    let color: string;
    if (diff < 0) {
        label = `Expired ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} ago`;
        bg = 'rgba(239,68,68,0.12)';
        color = '#ef4444';
    } else if (diff <= 30) {
        label = `Expiring soon (${diff} day${diff === 1 ? '' : 's'} remaining)`;
        bg = 'rgba(245,158,11,0.12)';
        color = '#f59e0b';
    } else {
        label = `Active (${diff} days remaining)`;
        bg = 'rgba(16,185,129,0.12)';
        color = '#22c55e';
    }
    return (
        <span
            data-testid="tenant-insurance-status-badge"
            title={`Expires ${fmtIsoDate(exp)}`}
            style={{
                gridColumn: '1 / -1',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 12,
                background: bg,
                color,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.3,
                width: 'fit-content',
                marginTop: 4,
            }}
        >
            {label}
        </span>
    );
}

function DetailSection({ title, icon, children, defaultOpen = true, onEdit }: {
    title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; onEdit?: () => void;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 10 }}>
            <button onClick={() => setOpen(o => !o)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', border: 'none', background: 'none',
                color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
            }}>
                {icon} {title}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {onEdit && (
                        <span
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)', cursor: 'pointer', transition: 'all 0.15s' }}
                            title={`Edit ${title}`}
                        >
                            <Settings2 size={11} />
                        </span>
                    )}
                    {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </span>
            </button>
            {open && <div style={{ padding: '0 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>{children}</div>}
        </div>
    );
}

function Field({ label, value, full }: { label: string; value?: string; full?: boolean }) {
    if (!value && value !== '0') return null;
    return (
        <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 1, wordBreak: 'break-word' }}>{value || '—'}</div>
        </div>
    );
}

function LinkageIndicator({ tenantId }: { tenantId: string }) {
    const [linkage, setLinkage] = useState<ResidentLinkage | null>(null);
    useEffect(() => {
        strataGet<ResidentLinkage>(`/resident-linkage/${tenantId}`).then(setLinkage).catch(() => {});
    }, [tenantId]);
    // Defensive guards (Task 3.1): static-handler at strataApi.static.ts:950-959 returns
    // {units, properties, workitems} for /resident-linkage/:tenantId, but ResidentLinkage
    // type at packages/types/index.ts:945-948 specifies {tenantId, tenantName, health,
    // issues, ...}. Without these guards the component crashes on .issues.length in
    // static mode, taking out the entire ResidentsModule render. Root-cause static-handler
    // shape drift captured §7 v2.18+ candidate.
    if (!linkage || !linkage.health) return null;
    const Icon = linkage.health === 'valid' ? Check : linkage.health === 'warning' ? AlertCircle : XCircle;
    const color = linkage.health === 'valid' ? '#22c55e' : linkage.health === 'warning' ? '#f59e0b' : '#ef4444';
    const issues = Array.isArray(linkage.issues) ? linkage.issues : [];
    return (
        <span title={issues.length > 0 ? issues.join('\n') : 'Fully linked'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'help' }}>
            <Icon size={12} color={color} />
            <span style={{ fontSize: 9, color, fontWeight: 600 }}>{linkage.health}</span>
        </span>
    );
}

function HistoryTab({ tenantId }: { tenantId: string }) {
    const [events, setEvents] = useState<ResidentHistoryEvent[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        setLoading(true);
        strataGet<{ events: ResidentHistoryEvent[] }>(`/resident-history/${tenantId}`).then(d => setEvents(d.events || [])).catch(() => {}).finally(() => setLoading(false));
    }, [tenantId]);
    const typeIcon = (t: string) => {
        switch (t) { case 'communication': return <Mail size={12} />; case 'workitem': return <FileText size={12} />; case 'lease': return <Calendar size={12} />; default: return <Clock size={12} />; }
    };
    const typeColor = (t: string) => {
        switch (t) { case 'communication': return '#06b6d4'; case 'workitem': return '#D6FE51'; case 'lease': return '#22c55e'; default: return '#64748b'; }
    };
    if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>Loading history…</div>;
    if (events.length === 0) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>No history recorded yet.</div>;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
            {events.map((ev, i) => (
                <div key={ev.id + i} style={{ display: 'flex', gap: 8, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ color: typeColor(ev.type), flexShrink: 0, marginTop: 2 }}>{typeIcon(ev.type)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>{ev.type} · {ev.action} · {ev.timestamp ? new Date(ev.timestamp).toLocaleDateString() : '—'}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function CommTab({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
    const [selectedTemplate, setSelectedTemplate] = useState<CommunicationTemplate>('general');
    const [channel, setChannel] = useState<'email' | 'sms' | 'portal'>('email');
    const [customMsg, setCustomMsg] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState<string | null>(null);
    const [sentOk, setSentOk] = useState(false);
    const handleSend = async () => {
        setSending(true); setSent(null); setSentOk(false);
        try {
            await strataPost(`/resident-communication/${tenantId}`, { template: selectedTemplate, channel, customMessage: customMsg });
            setSent(`${selectedTemplate.replace('_', ' ')} sent via ${channel}`); setSentOk(true);
            setCustomMsg('');
        } catch { setSent('Failed to send'); }
        setSending(false);
    };
    return (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Send Communication</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEMPLATES.map(t => (
                    <button key={t.key} onClick={() => setSelectedTemplate(t.key)} style={{
                        padding: '4px 10px', borderRadius: 8, border: '1px solid',
                        borderColor: selectedTemplate === t.key ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'rgba(255,255,255,0.08)',
                        background: selectedTemplate === t.key ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                        color: selectedTemplate === t.key ? '#D6FE51' : '#64748b',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>{t.icon} {t.label}</button>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                {(['email', 'sms', 'portal'] as const).map(c => (
                    <button key={c} onClick={() => setChannel(c)} style={{
                        padding: '4px 10px', borderRadius: 8, border: '1px solid',
                        borderColor: channel === c ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)',
                        background: channel === c ? 'rgba(6,182,212,0.15)' : 'transparent',
                        color: channel === c ? '#67e8f9' : '#64748b',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
                    }}>{c}</button>
                ))}
            </div>
            {selectedTemplate === 'general' && (
                <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} placeholder="Type your message…"
                    style={{ width: '100%', minHeight: 60, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            )}
            <button onClick={handleSend} disabled={sending} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: 'var(--text-primary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: sending ? 0.6 : 1,
            }}><Send size={12} /> {sending ? 'Sending…' : `Send to ${tenantName}`}</button>
            {sent && <div style={{ fontSize: 11, color: sentOk ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{sent}</div>}
        </div>
    );
}

/**
 * OtherOccupantsSection — Task 1.1
 *
 * Renders a collapsible panel listing the non-primary occupants who share
 * the primary tenant's unit. Fetches `/occupancies` filtered by the primary
 * tenant id, then resolves `otherOccupantIds` against the already-loaded
 * tenant list. Emits a Sentry breadcrumb on expand/collapse for GR-13.
 */
function OtherOccupantsSection({ tenant, allTenants }: { tenant: Tenant; allTenants: Tenant[] }) {
    const [open, setOpen] = useState(true);
    const [occupancy, setOccupancy] = useState<Occupancy | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        strataGet<Occupancy[]>('/occupancies', { primaryTenantId: tenant.id })
            .then((rows) => {
                if (cancelled) return;
                const occ = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
                setOccupancy(occ);
            })
            .catch(() => { if (!cancelled) setOccupancy(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [tenant.id]);

    const others = (occupancy?.otherOccupantIds ?? [])
        .map((id) => allTenants.find((t) => t.id === id))
        .filter((t): t is Tenant => Boolean(t));

    if (!loading && (!occupancy || others.length === 0)) return null;

    const toggle = () => {
        const next = !open;
        setOpen(next);
        try {
            Sentry.addBreadcrumb({
                category: 'ui.click',
                message: `residents.otherOccupants.${next ? 'expand' : 'collapse'}`,
                level: 'info',
                data: { tenantId: tenant.id, occupancyId: occupancy?.id ?? null, count: others.length },
            });
        } catch {
            // addBreadcrumb is a no-op when Sentry isn't initialized.
        }
    };

    return (
        <div
            data-testid="other-occupants-section"
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 10 }}
        >
            <button
                onClick={toggle}
                aria-expanded={open}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', border: 'none', background: 'none',
                    color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                    textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
                }}
            >
                <Users size={12} /> Other Occupants
                <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', fontSize: 10, fontWeight: 700 }}>
                    {loading ? '…' : others.length}
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                    {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </span>
            </button>
            {open && (
                <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {loading && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Loading occupants…</div>}
                    {!loading && others.map((o) => (
                        <div
                            key={o.id}
                            data-testid="other-occupant-row"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}
                        >
                            <Users size={12} color="#64748b" />
                            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{o.name}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)' }}>
                                {o.metadata?.tenantType || 'Other Occupant'}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface ResidentsModuleProps {
    searchNavTarget?: { type: string; id: string } | null;
    onNavComplete?: () => void;
}

export default function ResidentsModule({ searchNavTarget, onNavComplete }: ResidentsModuleProps) {
    const { hasPermission, authFetch } = useUser();
    const { navigateToProperty } = useStrataNav();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Tenant | null>(null);
    const [propertyFilter, setPropertyFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [leaseFilter, setLeaseFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);
    const [showEditForm, setShowEditForm] = useState(false);
    const [editFormData, setEditFormData] = useState<any>({});
    const [editTagInput, setEditTagInput] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [detailTab, setDetailTab] = useState<'details' | 'history' | 'comm'>('details');
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
    const [showBulkStatus, setShowBulkStatus] = useState(false);
    const [bulkTargetStatus, setBulkTargetStatus] = useState('');

    // Task 3.1: 5-block collapse state for the v1-L164 expansion blocks. Default-EXPANDED
    // mirrors 3.2 BlockSection precedent (AppFolio parity per v1 plan L164 "matching
    // AppFolio's visual grouping"). Existing 8 DetailSections retain their own internal
    // open-state — these slugs are namespaced to the NEW blocks only.
    const [tenantBlockExpanded, setTenantBlockExpanded] = useState<Record<string, boolean>>({
        'folioguard': true,
        'emergency-contact': true,
        'upcoming-activities': true,
        'animals': true,
        'vehicles': true,
    });
    const toggleTenantBlock = useCallback((slug: string, next: boolean) => {
        setTenantBlockExpanded(prev => ({ ...prev, [slug]: next }));
        try {
            Sentry.addBreadcrumb({
                category: 'ui.block-toggle',
                message: 'residents.detail.block.toggled',
                level: 'info',
                data: { block: slug, expanded: next, tenantId: selected?.id },
            });
        } catch { /* Sentry no-op when DSN unset */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.id]);

    useEffect(() => {
        if (searchNavTarget && searchNavTarget.type === 'tenant' && tenants.length > 0) {
            const target = tenants.find(t => t.id === searchNavTarget.id);
            if (target) { setSelected(target); onNavComplete?.(); }
        }
    }, [searchNavTarget, tenants, onNavComplete]);

    const fetchTenants = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const data = await strataGet<Tenant[]>('/entities', { type: 'tenant' });
            setTenants(Array.isArray(data) ? data : []);
        } catch (e) { console.error(e); setError('Failed to load residents'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchTenants(); }, [fetchTenants]);

    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            await strataPost('/entities', {
                entityType: 'tenant', name: fd.get('name'),
                email: fd.get('email') || null, phone: fd.get('phone') || null,
                status: 'onboarding',
                metadata: { propertyName: fd.get('propertyName') || '', unit: fd.get('unit') || '', rent: fd.get('rent') || '', leaseFrom: fd.get('leaseFrom') || '', leaseTo: fd.get('leaseTo') || '', tenantType: fd.get('tenantType') || 'Residential' },
            });
            setShowForm(false); fetchTenants();
        } catch (err) { console.error(err); }
    };

    const handleDelete = async (id: string) => {
        try { await strataDelete(`/entities/${id}`); if (selected?.id === id) setSelected(null); setConfirmDelete(null); fetchTenants(); } catch (err) { console.error(err); }
    };

    const openEditForm = (tenant: Tenant) => {
        const m = tenant.metadata || {};
        setEditFormData({
            name: tenant.name || '', email: tenant.email || '', phone: tenant.phone || '',
            propertyName: m.propertyName || '', unit: m.unit || '', rent: m.rent || '',
            leaseFrom: m.leaseFrom || '', leaseTo: m.leaseTo || '', tenantType: m.tenantType || 'Residential',
            tags: Array.isArray(m.tags) ? m.tags : (m.tags ? [m.tags] : []),
            birthdate: m.birthdate || '', pets: m.pets || '', licensePlates: m.licensePlates || '',
            tenantNotes: m.tenantNotes || '', primaryTenant: m.primaryTenant || '',
        });
        setEditTagInput('');
        setShowEditForm(true);
    };

    const handleEditSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selected) return;
        try {
            await strataPut(`/entities/${selected.id}`, {
                name: editFormData.name,
                email: editFormData.email || null,
                phone: editFormData.phone || null,
                metadata: {
                    ...selected.metadata,
                    propertyName: editFormData.propertyName,
                    unit: editFormData.unit,
                    rent: editFormData.rent,
                    leaseFrom: editFormData.leaseFrom,
                    leaseTo: editFormData.leaseTo,
                    tenantType: editFormData.tenantType,
                    tags: editFormData.tags,
                    birthdate: editFormData.birthdate,
                    pets: editFormData.pets,
                    licensePlates: editFormData.licensePlates,
                    tenantNotes: editFormData.tenantNotes,
                    primaryTenant: editFormData.primaryTenant,
                },
            });
            setShowEditForm(false);
            setSelected({ ...selected, name: editFormData.name, email: editFormData.email, phone: editFormData.phone, metadata: { ...selected.metadata, ...editFormData } });
            fetchTenants();
        } catch (err) { console.error('Failed to update tenant', err); }
    };

    const handleAddEditTag = () => {
        if (!editTagInput.trim()) return;
        const existing = editFormData.tags || [];
        if (!existing.includes(editTagInput.trim())) {
            setEditFormData({ ...editFormData, tags: [...existing, editTagInput.trim()] });
        }
        setEditTagInput('');
    };

    const handleRemoveEditTag = (tag: string) => {
        setEditFormData({ ...editFormData, tags: (editFormData.tags || []).filter((t: string) => t !== tag) });
    };

    const handleStatusChange = async (tenantId: string, newStatus: string) => {
        try {
            await strataPut(`/entities/${tenantId}/status`, { newStatus });
            fetchTenants();
            if (selected?.id === tenantId) setSelected({ ...selected!, status: newStatus });
        } catch (err) { console.error(err); }
    };

    const handleBulkStatus = async () => {
        if (!bulkTargetStatus || bulkSelected.size === 0) return;
        try {
            await strataPost('/entities/bulk-status', { entityIds: Array.from(bulkSelected), newStatus: bulkTargetStatus });
            setBulkSelected(new Set()); setShowBulkStatus(false); setBulkTargetStatus(''); fetchTenants();
        } catch (err) { console.error(err); }
    };

    const toggleBulk = (id: string) => {
        setBulkSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    };

    const uniqueProperties = Array.from(new Set(tenants.map(t => t.metadata?.propertyName).filter(Boolean))).sort() as string[];

    // Filtering chain
    let filtered = tenants;
    if (propertyFilter !== 'all') filtered = filtered.filter(t => (t.metadata?.propertyName || '') === propertyFilter);
    if (statusFilter !== 'all') filtered = filtered.filter(t => t.status === statusFilter);
    if (leaseFilter !== 'all') {
        const now = new Date().toISOString().slice(0, 10);
        const d30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const d60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
        if (leaseFilter === 'expired') filtered = filtered.filter(t => t.metadata?.leaseTo && t.metadata.leaseTo < now);
        else if (leaseFilter === '30d') filtered = filtered.filter(t => t.metadata?.leaseTo && t.metadata.leaseTo >= now && t.metadata.leaseTo <= d30);
        else if (leaseFilter === '60d') filtered = filtered.filter(t => t.metadata?.leaseTo && t.metadata.leaseTo >= now && t.metadata.leaseTo <= d60);
    }
    if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(t => t.name.toLowerCase().includes(q) || (t.email || '').toLowerCase().includes(q) || (t.metadata?.unit || '').toLowerCase().includes(q) || (t.metadata?.propertyName || '').toLowerCase().includes(q) || t.status.toLowerCase().includes(q));
    }

    const md = selected?.metadata || {};
    const sc = (s: string) => STATUS_COLORS[s] || STATUS_COLORS.inactive;

    return (
        <div className="s-module" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Residents & Tenants</h2>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>{filtered.length}{filtered.length !== tenants.length ? ` of ${tenants.length}` : ''} tenants</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select aria-label="Filter residents by property" value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: propertyFilter === 'all' ? '#64748b' : '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', maxWidth: 180 }}>
                        <option value="all" style={{ background: '#1e293b', color: 'var(--text-secondary)' }}>All Properties</option>
                        {uniqueProperties.map(p => <option key={p} value={p} style={{ background: '#1e293b', color: 'var(--text-primary)' }}>{p}</option>)}
                    </select>
                    <select aria-label="Filter residents by lease expiration" value={leaseFilter} onChange={e => setLeaseFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: leaseFilter === 'all' ? '#64748b' : '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                        <option value="all" style={{ background: '#1e293b' }}>All Leases</option>
                        <option value="30d" style={{ background: '#1e293b' }}>Expiring ≤30d</option>
                        <option value="60d" style={{ background: '#1e293b' }}>Expiring ≤60d</option>
                        <option value="expired" style={{ background: '#1e293b' }}>Expired</option>
                    </select>
                    {hasPermission('strata:residents:search') && (
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input placeholder="Search name, unit, status…" value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '7px 12px 7px 30px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 180 }} />
                        </div>
                    )}
                    <button onClick={fetchTenants} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
                    </button>
                    <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                        <Plus size={12} /> New Tenant
                    </button>
                </div>
            </div>

            {/* Status filter pills */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
                <button onClick={() => setStatusFilter('all')} style={{ padding: '3px 10px', borderRadius: 12, border: '1px solid', borderColor: statusFilter === 'all' ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'rgba(255,255,255,0.08)', background: statusFilter === 'all' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', color: statusFilter === 'all' ? '#D6FE51' : '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>All ({tenants.length})</button>
                {RESIDENT_STATUSES.map(s => {
                    const count = tenants.filter(t => t.status === s).length;
                    return (
                        <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '3px 10px', borderRadius: 12, border: '1px solid', borderColor: statusFilter === s ? `${sc(s).color}66` : 'rgba(255,255,255,0.08)', background: statusFilter === s ? sc(s).bg : 'transparent', color: statusFilter === s ? sc(s).color : 'var(--text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                            {s} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Bulk action bar */}
            {bulkSelected.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', marginBottom: 8, borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{bulkSelected.size} selected</span>
                    <button onClick={() => setShowBulkStatus(true)} style={{ padding: '4px 12px', borderRadius: 8, border: 'none', background: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Change Status</button>
                    <button onClick={() => setBulkSelected(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
                </div>
            )}

            {/* Bulk status modal */}
            {showBulkStatus && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowBulkStatus(false)}>
                    <div style={{ width: 380, background: '#1e293b', borderRadius: 16, padding: 24, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Bulk Status Change</h3>
                        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>Change status for {bulkSelected.size} selected tenants:</p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                            {RESIDENT_STATUSES.map(s => (
                                <button key={s} onClick={() => setBulkTargetStatus(s)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid', borderColor: bulkTargetStatus === s ? `${sc(s).color}66` : 'rgba(255,255,255,0.08)', background: bulkTargetStatus === s ? sc(s).bg : 'transparent', color: bulkTargetStatus === s ? sc(s).color : 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>{s}</button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setShowBulkStatus(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                            <button onClick={handleBulkStatus} disabled={!bulkTargetStatus} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: bulkTargetStatus ? 1 : 0.5 }}>Apply</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Split view */}
            <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
                {/* Table */}
                <div style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                            <th style={{ width: 32, padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: 'rgba(15,20,36,0.95)', backdropFilter: 'blur(8px)', zIndex: 1 }}></th>
                            {['Name', 'Property', 'Unit', 'Status', 'Type', 'Rent', 'Lease To'].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: 'rgba(15,20,36,0.95)', backdropFilter: 'blur(8px)', zIndex: 1 }}>{h}</th>
                            ))}
                        </tr></thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8}><LoadingState message="Loading residents…" /></td></tr>
                            ) : error ? (
                                <tr><td colSpan={8}><ErrorState message={error} onRetry={fetchTenants} /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No tenants found</td></tr>
                            ) : filtered.map(t => {
                                const m = t.metadata || {};
                                const isActive = selected?.id === t.id;
                                const isBulk = bulkSelected.has(t.id);
                                return (
                                    <tr key={t.id} onClick={() => setSelected(t)} style={{ cursor: 'pointer', background: isActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined, borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent' }}
                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = ''; }}>
                                        <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <button
                                                onClick={e => { e.stopPropagation(); toggleBulk(t.id); }}
                                                aria-label={isBulk ? `Deselect tenant${t.name ? ` ${t.name}` : ''}` : `Select tenant${t.name ? ` ${t.name}` : ''}`}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: isBulk ? '#D6FE51' : '#475569', padding: 0 }}>
                                                {isBulk ? <CheckSquare size={14} /> : <Square size={14} />}
                                            </button>
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{t.name} <LinkageIndicator tenantId={t.id} /></div>
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            {m.propertyName && t.propertyIds?.[0] ? (
                                                <button className="s-property-link" onClick={(e) => { e.stopPropagation(); navigateToProperty(t.propertyIds[0]); }}>{m.propertyName}</button>
                                            ) : (m.propertyName || '—')}
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{m.unit || '—'}</td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: sc(t.status).bg, color: sc(t.status).color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.status}</span>
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{m.tenantType || '—'}</td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#22c55e', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{m.rent ? `$${m.rent}` : '—'}</td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{m.leaseTo || '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Detail panel */}
                {selected && (
                    <div style={{ width: 400, minWidth: 370, flexShrink: 0, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                        {/* Header */}
                        <div style={{ padding: '16px 16px 0', flexShrink: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{selected.name}</h3>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: sc(selected.status).bg, color: sc(selected.status).color, textTransform: 'uppercase' }}>{selected.status}</span>
                                        {md.tenantType && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>{md.tenantType}</span>}
                                        {md.primaryTenant === 'Yes' && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>PRIMARY</span>}
                                        <LinkageIndicator tenantId={selected.id} />
                                    </div>
                                </div>
                                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                            </div>

                            {/* Status workflow transitions */}
                            {TRANSITIONS[selected.status] && TRANSITIONS[selected.status].length > 0 && (
                                <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center', marginRight: 4 }}>→</span>
                                    {TRANSITIONS[selected.status].map(ns => (
                                        <button key={ns} onClick={() => handleStatusChange(selected.id, ns)} style={{
                                            padding: '3px 10px', borderRadius: 8, border: '1px solid', fontSize: 10, fontWeight: 600,
                                            borderColor: `${sc(ns).color}44`, background: sc(ns).bg, color: sc(ns).color,
                                            cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                                        }}>{ns}</button>
                                    ))}
                                </div>
                            )}

                            {/* Contact + actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                                {selected.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={13} color="#64748b" /> {selected.email}</div>}
                                {selected.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={13} color="#64748b" /> {selected.phone}</div>}
                            </div>

                            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                <button onClick={() => openEditForm(selected)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <Settings2 size={12} /> Edit Tenant
                                </button>
                                <button onClick={() => setConfirmDelete(selected.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <Trash2 size={12} /> Delete Tenant
                                </button>
                            </div>

                            {/* Tab bar */}
                            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {([['details', 'Details', <FileText size={12} key="d" />], ['history', 'History', <History size={12} key="h" />], ['comm', 'Communication', <MessageSquare size={12} key="c" />]] as const).map(([key, label, icon]) => (
                                    <button key={key} onClick={() => setDetailTab(key as any)} style={{
                                        flex: 1, padding: '8px 0', border: 'none', borderBottom: `2px solid ${detailTab === key ? '#D6FE51' : 'transparent'}`,
                                        background: 'none', color: detailTab === key ? '#D6FE51' : '#64748b',
                                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                    }}>{icon} {label}</button>
                                ))}
                            </div>
                        </div>

                        {/* Tab content */}
                        <div style={{ flex: 1, overflow: 'auto', padding: detailTab === 'details' ? 16 : 0 }}>
                            {detailTab === 'details' && (<>
                                <DetailSection title="Lease & Property" icon={<Home size={12} />} onEdit={() => openEditForm(selected)}>
                                    <Field label="Property" value={md.propertyName} full /><Field label="Unit" value={md.unit} full />
                                    <Field label="Move-in" value={md.moveIn} /><Field label="Lease From" value={md.leaseFrom} />
                                    <Field label="Lease To" value={md.leaseTo} /><Field label="Last Lease Renewal" value={md.lastLeaseRenewal} />
                                    <Field label="Rent" value={md.rent ? `$${md.rent}` : undefined} /><Field label="Deposit" value={md.deposit ? `$${md.deposit}` : undefined} />
                                    <Field label="Unit Type" value={md.unitType} /><Field label="Unit Tags" value={md.unitTags} />
                                    <Field label="Tenant Tags" value={md.tags} /><Field label="Birthdate" value={md.birthdate} />
                                </DetailSection>
                                <DetailSection title="Rent Increases" icon={<DollarSign size={12} />} defaultOpen={false}>
                                    <Field label="Eligible for Rent Increase" value={md.eligibleForRentIncrease} /><Field label="Last Rent Increase" value={md.lastRentIncrease} /><Field label="Next Rent Increase Date" value={md.nextRentIncreaseDate} />
                                </DetailSection>
                                <DetailSection title="Online Portal" icon={<Globe size={12} />} defaultOpen={false}>
                                    <Field label="Portal Activated" value={md.onlinePortalActivated} /><Field label="Portal Login" value={md.onlinePortalLogin} full />
                                    <Field label="Recurring Payments Total" value={md.onlinePaymentsRecurringTotal} /><Field label="Recurring Payments Count" value={md.onlinePaymentsRecurringCount} /><Field label="Send Rent Reminders" value={md.sendRentReminders} />
                                </DetailSection>
                                <DetailSection title="Late Fees & Charges" icon={<AlertTriangle size={12} />} defaultOpen={false}>
                                    <Field label="Late Fee Type" value={md.lateFeeType} /><Field label="Late Fee Base Amount" value={md.lateFeeBaseAmount ? `$${md.lateFeeBaseAmount}` : undefined} />
                                    <Field label="Grace Period" value={md.gracePeriod ? `${md.gracePeriod} days` : undefined} /><Field label="NSF Fee Amount" value={md.nsfFeeAmount ? `$${md.nsfFeeAmount}` : undefined} />
                                    <Field label="Require Online Payments In Full" value={md.requireOnlinePaymentsInFull} /><Field label="Security Deposit Return" value={md.securityDepositReturnPayment} />
                                </DetailSection>
                                <DetailSection title="Insurance" icon={<Shield size={12} />} defaultOpen={false}>
                                    <Field label="Provider" value={md.insuranceProvider} full /><Field label="Expiration" value={md.insuranceExpiration} /><Field label="Policy Number" value={md.insurancePolicyNumber} />
                                    <InsuranceStatusBadge tenant={selected as unknown as EntityProfile} />
                                </DetailSection>
                                <DetailSection title="Other" icon={<FileText size={12} />} defaultOpen={false}>
                                    <Field label="Primary Tenant" value={md.primaryTenant} /><Field label="License Plates" value={md.licensePlates} /><Field label="Pets" value={md.pets} /><Field label="Tenant Notes" value={md.tenantNotes} full />
                                </DetailSection>
                                {md.primaryTenant === 'Yes' && (
                                    <ErrorBoundary fallback={
                                        <div style={{ padding: '8px 14px', fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 10 }}>
                                            Other Occupants unavailable.
                                        </div>
                                    }>
                                        <OtherOccupantsSection tenant={selected} allTenants={tenants} />
                                    </ErrorBoundary>
                                )}
                                <DetailSection title="Spaces & Projects" icon={<Users size={12} />} defaultOpen={false}>
                                    <ProfileSpaces entityType="tenant" entityId={selected.id} />
                                </DetailSection>
                                {/* ─── Task 3.1: v1-L164 expansion — 5 NEW blocks scoped under one ErrorBoundary ─── */}
                                <ErrorBoundary fallback={
                                    <div style={{ padding: '8px 14px', fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 10 }}>
                                        Tenant detail blocks unavailable.
                                    </div>
                                }>
                                    <BlockSection title="FolioGuard Smart Ensure" slug="folioguard" expanded={tenantBlockExpanded['folioguard']} onToggle={(n) => toggleTenantBlock('folioguard', n)}>
                                        <BlockFolioGuardUpsell tenant={selected as unknown as EntityProfile} />
                                    </BlockSection>
                                    <BlockSection title="Emergency Contact" slug="emergency-contact" expanded={tenantBlockExpanded['emergency-contact']} onToggle={(n) => toggleTenantBlock('emergency-contact', n)}>
                                        <BlockEmergencyContact tenant={selected as unknown as EntityProfile} />
                                    </BlockSection>
                                    <BlockSection title="Upcoming Activities" slug="upcoming-activities" expanded={tenantBlockExpanded['upcoming-activities']} onToggle={(n) => toggleTenantBlock('upcoming-activities', n)}>
                                        <BlockUpcomingActivities tenant={selected as unknown as EntityProfile} />
                                    </BlockSection>
                                    <BlockSection title="Animals" slug="animals" expanded={tenantBlockExpanded['animals']} onToggle={(n) => toggleTenantBlock('animals', n)}>
                                        <BlockAnimals tenant={selected as unknown as EntityProfile} />
                                    </BlockSection>
                                    <BlockSection title="Vehicles" slug="vehicles" expanded={tenantBlockExpanded['vehicles']} onToggle={(n) => toggleTenantBlock('vehicles', n)}>
                                        <BlockVehicles tenant={selected as unknown as EntityProfile} />
                                    </BlockSection>
                                </ErrorBoundary>
                            </>)}
                            {detailTab === 'history' && <HistoryTab tenantId={selected.id} />}
                            {detailTab === 'comm' && <CommTab tenantId={selected.id} tenantName={selected.name} />}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {!selected && (
                    <div style={{ width: 320, minWidth: 280, flexShrink: 0, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', gap: 8 }}>
                        <Users size={40} strokeWidth={1} /><p style={{ margin: 0, fontSize: 13 }}>Select a tenant to view details</p>
                    </div>
                )}
            </div>

            {/* Create Tenant Modal */}
            {showForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowForm(false)}>
                    <div style={{ width: 480, background: '#1e293b', borderRadius: 16, padding: 24, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Add New Tenant</h3>
                            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div style={{ display: 'grid', gap: 12 }}>
                                <div><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Full Name *</label><input name="name" required placeholder="John Doe" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} /></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</label><input name="email" type="email" placeholder="tenant@email.com" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} /></div>
                                    <div><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</label><input name="phone" placeholder="555-000-0000" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} /></div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                                    <div><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Property</label><select name="propertyName" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}><option value="">Select property…</option>{uniqueProperties.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    <div><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Unit</label><input name="unit" placeholder="101" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} /></div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                    <div><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Monthly Rent</label><input name="rent" type="number" step="0.01" placeholder="1500" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} /></div>
                                    <div><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lease From</label><input name="leaseFrom" type="date" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} /></div>
                                    <div><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lease To</label><input name="leaseTo" type="date" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} /></div>
                                </div>
                                <div><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tenant Type</label><select name="tenantType" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}><option value="Residential">Residential</option><option value="Commercial">Commercial</option><option value="Section 8">Section 8</option></select></div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Add Tenant</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Tenant Modal */}
            {showEditForm && selected && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowEditForm(false)}>
                    <div style={{ width: 560, maxWidth: '90vw', maxHeight: '85vh', background: '#1e293b', borderRadius: 16, padding: 0, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', boxShadow: '0 24px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Edit Tenant</h3>
                            <button onClick={() => setShowEditForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleEditSave} style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
                            <div style={{ padding: '10px 14px', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', marginBottom: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Editing: {selected.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>Update tenant details, lease info, and entity tags.</div>
                            </div>

                            <h4 style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Contact Info</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                                <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Full Name</label><input className="s-input" value={editFormData.name || ''} onChange={e => setEditFormData({...editFormData, name: e.target.value})} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</label><input className="s-input" type="email" value={editFormData.email || ''} onChange={e => setEditFormData({...editFormData, email: e.target.value})} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</label><input className="s-input" value={editFormData.phone || ''} onChange={e => setEditFormData({...editFormData, phone: e.target.value})} /></div>
                            </div>

                            <h4 style={{ fontSize: 11, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Lease & Property</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Property</label><input className="s-input" value={editFormData.propertyName || ''} onChange={e => setEditFormData({...editFormData, propertyName: e.target.value})} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Unit</label><input className="s-input" value={editFormData.unit || ''} onChange={e => setEditFormData({...editFormData, unit: e.target.value})} /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Monthly Rent</label><input className="s-input" type="number" step="0.01" value={editFormData.rent || ''} onChange={e => setEditFormData({...editFormData, rent: e.target.value})} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lease From</label><input className="s-input" type="date" value={editFormData.leaseFrom || ''} onChange={e => setEditFormData({...editFormData, leaseFrom: e.target.value})} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lease To</label><input className="s-input" type="date" value={editFormData.leaseTo || ''} onChange={e => setEditFormData({...editFormData, leaseTo: e.target.value})} /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tenant Type</label><select className="s-input" value={editFormData.tenantType || 'Residential'} onChange={e => setEditFormData({...editFormData, tenantType: e.target.value})}><option value="Residential">Residential</option><option value="Commercial">Commercial</option><option value="Section 8">Section 8</option></select></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Primary Tenant</label><select className="s-input" value={editFormData.primaryTenant || ''} onChange={e => setEditFormData({...editFormData, primaryTenant: e.target.value})}><option value="">—</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
                            </div>

                            <h4 style={{ fontSize: 11, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Additional Info</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Birthdate</label><input className="s-input" type="date" value={editFormData.birthdate || ''} onChange={e => setEditFormData({...editFormData, birthdate: e.target.value})} /></div>
                                <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>License Plates</label><input className="s-input" value={editFormData.licensePlates || ''} onChange={e => setEditFormData({...editFormData, licensePlates: e.target.value})} /></div>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pets</label>
                                <input className="s-input" value={editFormData.pets || ''} onChange={e => setEditFormData({...editFormData, pets: e.target.value})} placeholder="e.g. 1 dog (Labrador), 1 cat" />
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</label>
                                <textarea className="s-input" style={{ minHeight: 50, resize: 'vertical' }} value={editFormData.tenantNotes || ''} onChange={e => setEditFormData({...editFormData, tenantNotes: e.target.value})} />
                            </div>

                            <h4 style={{ fontSize: 11, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Entity Tags</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {(editFormData.tags || []).map((tag: string) => (
                                    <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(6,182,212,0.12)', color: '#67e8f9', fontWeight: 600, border: '1px solid rgba(6,182,212,0.2)' }}>
                                        <Tag size={10} /> {tag}
                                        <button onClick={() => handleRemoveEditTag(tag)} type="button" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={10} /></button>
                                    </span>
                                ))}
                                {(editFormData.tags || []).length === 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No tags — link to properties, owners, vendors</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                                <input value={editTagInput} onChange={e => setEditTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEditTag(); } }} placeholder="Add tag (property, owner, vendor name)…" style={{ flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 11, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }} />
                                <button type="button" onClick={handleAddEditTag} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', color: '#67e8f9', cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                                <button type="button" onClick={() => setShowEditForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm Dialog */}
            {confirmDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfirmDelete(null)}>
                    <div style={{ width: 380, background: '#1e293b', borderRadius: 16, padding: 24, border: '1px solid rgba(239,68,68,0.2)', boxShadow: '0 24px 48px rgba(0,0,0,0.5)', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <Trash2 size={32} style={{ color: '#ef4444', marginBottom: 12 }} />
                        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Delete Tenant?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)' }}>This action cannot be undone. The tenant record will be permanently removed.</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                            <button onClick={() => setConfirmDelete(null)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                            <button onClick={() => handleDelete(confirmDelete)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #ef4444, #ef4444)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
