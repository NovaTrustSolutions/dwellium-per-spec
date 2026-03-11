/**
 * ResidentsModule — Full tenant detail viewer for Strata
 *
 * Lists all tenants with property, unit, status, rent, lease dates.
 * Detail panel shows every AppFolio metadata field grouped into sections.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Users, Search, RefreshCw, Mail, Phone, MapPin, CreditCard,
    Home, Building2, Calendar, Shield, Car, Dog, FileText,
    Globe, DollarSign, Clock, AlertTriangle, ChevronDown, ChevronUp,
    Plus, Trash2, X,
} from 'lucide-react';
import { useUser } from '../../../context/UserContext';
import { API_BASE } from '../../../config';
import { strataPost, strataDelete } from '../strataApi';
import ProfileSpaces from './ProfileSpaces';

const API = API_BASE;

interface Tenant {
    id: string;
    entityType: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    metadata: Record<string, any>;
    propertyIds: string[];
    status: string;
    createdAt: string;
}

/* ── Detail section component ── */
function DetailSection({ title, icon, children, defaultOpen = true }: {
    title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.05)', marginBottom: 10,
        }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', border: 'none', background: 'none',
                    color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                    textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
                }}
            >
                {icon} {title}
                <span style={{ marginLeft: 'auto' }}>
                    {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </span>
            </button>
            {open && (
                <div style={{ padding: '0 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

function Field({ label, value, full }: { label: string; value?: string; full?: boolean }) {
    if (!value && value !== '0') return null;
    return (
        <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 1, wordBreak: 'break-word' }}>{value || '—'}</div>
        </div>
    );
}

export default function ResidentsModule() {
    const { hasPermission, authFetch } = useUser();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Tenant | null>(null);
    const [propertyFilter, setPropertyFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const fetchTenants = useCallback(async () => {
        setLoading(true);
        try {
            const res = await authFetch(`${API}/api/dwellium/entities?type=tenant`);
            if (res.ok) setTenants(await res.json());
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [authFetch]);

    useEffect(() => { fetchTenants(); }, [fetchTenants]);

    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            await strataPost('/entities', {
                entityType: 'tenant',
                name: fd.get('name'),
                email: fd.get('email') || null,
                phone: fd.get('phone') || null,
                metadata: {
                    propertyName: fd.get('propertyName') || '',
                    unit: fd.get('unit') || '',
                    rent: fd.get('rent') || '',
                    leaseFrom: fd.get('leaseFrom') || '',
                    leaseTo: fd.get('leaseTo') || '',
                    tenantType: fd.get('tenantType') || 'Residential',
                },
            });
            setShowForm(false);
            fetchTenants();
        } catch (err) { console.error(err); }
    };

    const handleDelete = async (id: string) => {
        try {
            await strataDelete(`/entities/${id}`);
            if (selected?.id === id) setSelected(null);
            setConfirmDelete(null);
            fetchTenants();
        } catch (err) { console.error(err); }
    };

    // Unique property names for filter dropdown
    const uniqueProperties = Array.from(new Set(
        tenants.map(t => t.metadata?.propertyName).filter(Boolean)
    )).sort() as string[];

    const propertyFiltered = propertyFilter === 'all'
        ? tenants
        : tenants.filter(t => (t.metadata?.propertyName || '') === propertyFilter);

    const filtered = search
        ? propertyFiltered.filter(t => {
            const q = search.toLowerCase();
            return t.name.toLowerCase().includes(q)
                || (t.email || '').toLowerCase().includes(q)
                || (t.metadata?.unit || '').toLowerCase().includes(q)
                || (t.metadata?.propertyName || '').toLowerCase().includes(q);
        })
        : propertyFiltered;

    const md = selected?.metadata || {};

    return (
        <div className="s-module" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>Residents & Tenants</h2>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                        {filtered.length}{propertyFilter !== 'all' || search ? ` of ${tenants.length}` : ''} tenants
                        {propertyFilter !== 'all' && <span> · {propertyFilter}</span>}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Property filter dropdown */}
                    <select
                        value={propertyFilter}
                        onChange={e => setPropertyFilter(e.target.value)}
                        style={{
                            padding: '7px 10px', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                            color: propertyFilter === 'all' ? '#64748b' : '#e2e8f0',
                            fontSize: 12, fontFamily: 'inherit', outline: 'none',
                            cursor: 'pointer', maxWidth: 200,
                        }}
                    >
                        <option value="all" style={{ background: '#1e293b', color: '#94a3b8' }}>All Properties</option>
                        {uniqueProperties.map(p => (
                            <option key={p} value={p} style={{ background: '#1e293b', color: '#e2e8f0' }}>{p}</option>
                        ))}
                    </select>
                    {hasPermission('strata:residents:search') && (
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                            <input
                                placeholder="Search name, unit…"
                                value={search} onChange={e => setSearch(e.target.value)}
                                style={{
                                    padding: '7px 12px 7px 30px', border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                                    color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 180,
                                }}
                            />
                        </div>
                    )}
                    <button
                        onClick={fetchTenants}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '7px 12px', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                            color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
                    </button>
                    <button
                        onClick={() => setShowForm(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '7px 12px', border: 'none',
                            borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                            color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                        }}
                    >
                        <Plus size={12} /> New Tenant
                    </button>
                </div>
            </div>

            {/* Split view */}
            <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
                {/* ── Tenant table ── */}
                <div style={{
                    flex: selected ? 1 : 1, minWidth: 0,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12, overflow: 'auto',
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {['Name', 'Property', 'Unit', 'Status', 'Type', 'Rent', 'Lease To'].map(h => (
                                    <th key={h} style={{
                                        textAlign: 'left', padding: '10px 12px', fontSize: 10,
                                        fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
                                        color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.06)',
                                        position: 'sticky', top: 0, background: 'rgba(15,20,36,0.95)',
                                        backdropFilter: 'blur(8px)', zIndex: 1,
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No tenants found</td></tr>
                            ) : filtered.map(t => {
                                const m = t.metadata || {};
                                const isActive = selected?.id === t.id;
                                return (
                                    <tr key={t.id}
                                        onClick={() => setSelected(t)}
                                        style={{
                                            cursor: 'pointer',
                                            background: isActive ? 'rgba(99,102,241,0.08)' : undefined,
                                            borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                                        }}
                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = ''; }}
                                    >
                                        <td style={{ padding: '8px 12px', fontSize: 13, color: '#e2e8f0', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            {t.name}
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            {m.propertyName || '—'}
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            {m.unit || '—'}
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                background: t.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                                                color: t.status === 'active' ? '#10b981' : '#64748b',
                                                textTransform: 'uppercase', letterSpacing: 0.5,
                                            }}>{t.status}</span>
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            {m.tenantType || '—'}
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#10b981', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            {m.rent ? `$${m.rent}` : '—'}
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            {m.leaseTo || '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── Detail panel ── */}
                {selected && (
                    <div style={{
                        width: 380, minWidth: 360, flexShrink: 0,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 12, overflow: 'auto', padding: 16,
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>{selected.name}</h3>
                                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                        background: selected.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                                        color: selected.status === 'active' ? '#10b981' : '#64748b',
                                        textTransform: 'uppercase',
                                    }}>{selected.status}</span>
                                    {md.tenantType && (
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                            background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                                        }}>{md.tenantType}</span>
                                    )}
                                    {md.primaryTenant === 'Yes' && (
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                            background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                                        }}>PRIMARY</span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setSelected(null)}
                                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                            >×</button>
                        </div>

                        {/* Delete button */}
                        <button
                            onClick={() => setConfirmDelete(selected.id)}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '7px 12px', marginBottom: 14, borderRadius: 8, fontSize: 11, fontWeight: 600,
                                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                color: '#fca5a5', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            <Trash2 size={12} /> Delete Tenant
                        </button>

                        {/* Contact info */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, fontSize: 13, color: '#94a3b8' }}>
                            {selected.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={13} color="#64748b" /> {selected.email}</div>}
                            {selected.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={13} color="#64748b" /> {selected.phone}</div>}
                        </div>

                        {/* ── Lease & Property ── */}
                        <DetailSection title="Lease & Property" icon={<Home size={12} />}>
                            <Field label="Property" value={md.propertyName} full />
                            <Field label="Unit" value={md.unit} full />
                            <Field label="Move-in" value={md.moveIn} />
                            <Field label="Lease From" value={md.leaseFrom} />
                            <Field label="Lease To" value={md.leaseTo} />
                            <Field label="Last Lease Renewal" value={md.lastLeaseRenewal} />
                            <Field label="Rent" value={md.rent ? `$${md.rent}` : undefined} />
                            <Field label="Deposit" value={md.deposit ? `$${md.deposit}` : undefined} />
                            <Field label="Unit Type" value={md.unitType} />
                            <Field label="Unit Tags" value={md.unitTags} />
                            <Field label="Tenant Tags" value={md.tags} />
                            <Field label="Birthdate" value={md.birthdate} />
                        </DetailSection>

                        {/* ── Rent Increases ── */}
                        <DetailSection title="Rent Increases" icon={<DollarSign size={12} />} defaultOpen={false}>
                            <Field label="Eligible for Rent Increase" value={md.eligibleForRentIncrease} />
                            <Field label="Last Rent Increase" value={md.lastRentIncrease} />
                            <Field label="Next Rent Increase Date" value={md.nextRentIncreaseDate} />
                        </DetailSection>

                        {/* ── Online Portal ── */}
                        <DetailSection title="Online Portal" icon={<Globe size={12} />} defaultOpen={false}>
                            <Field label="Portal Activated" value={md.onlinePortalActivated} />
                            <Field label="Portal Login" value={md.onlinePortalLogin} full />
                            <Field label="Recurring Payments Total" value={md.onlinePaymentsRecurringTotal} />
                            <Field label="Recurring Payments Count" value={md.onlinePaymentsRecurringCount} />
                            <Field label="Send Rent Reminders" value={md.sendRentReminders} />
                        </DetailSection>

                        {/* ── Late Fees & Charges ── */}
                        <DetailSection title="Late Fees & Charges" icon={<AlertTriangle size={12} />} defaultOpen={false}>
                            <Field label="Late Fee Type" value={md.lateFeeType} />
                            <Field label="Late Fee Base Amount" value={md.lateFeeBaseAmount ? `$${md.lateFeeBaseAmount}` : undefined} />
                            <Field label="Grace Period" value={md.gracePeriod ? `${md.gracePeriod} days` : undefined} />
                            <Field label="NSF Fee Amount" value={md.nsfFeeAmount ? `$${md.nsfFeeAmount}` : undefined} />
                            <Field label="Require Online Payments In Full" value={md.requireOnlinePaymentsInFull} />
                            <Field label="Security Deposit Return" value={md.securityDepositReturnPayment} />
                        </DetailSection>

                        {/* ── Insurance ── */}
                        <DetailSection title="Insurance" icon={<Shield size={12} />} defaultOpen={false}>
                            <Field label="Provider" value={md.insuranceProvider} full />
                            <Field label="Expiration" value={md.insuranceExpiration} />
                            <Field label="Policy Number" value={md.insurancePolicyNumber} />
                        </DetailSection>

                        {/* ── Other ── */}
                        <DetailSection title="Other" icon={<FileText size={12} />} defaultOpen={false}>
                            <Field label="Primary Tenant" value={md.primaryTenant} />
                            <Field label="License Plates" value={md.licensePlates} />
                            <Field label="Pets" value={md.pets} />
                            <Field label="Tenant Notes" value={md.tenantNotes} full />
                        </DetailSection>

                        {/* ── Profile Spaces (Trello-like projects/tasks) ── */}
                        <DetailSection title="Spaces & Projects" icon={<Users size={12} />} defaultOpen={false}>
                            <ProfileSpaces entityType="tenant" entityId={selected.id} />
                        </DetailSection>
                    </div>
                )}

                {/* ── Empty state ── */}
                {!selected && (
                    <div style={{
                        width: 320, minWidth: 280, flexShrink: 0,
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                        borderRadius: 12, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', color: '#475569', gap: 8,
                    }}>
                        <Users size={40} strokeWidth={1} />
                        <p style={{ margin: 0, fontSize: 13 }}>Select a tenant to view details</p>
                    </div>
                )}
            </div>

            {/* Create Tenant Modal */}
            {showForm && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }} onClick={() => setShowForm(false)}>
                    <div style={{
                        width: 480, background: '#1e293b', borderRadius: 16, padding: 24,
                        border: '1px solid rgba(99,102,241,0.2)', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Add New Tenant</h3>
                            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div style={{ display: 'grid', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Full Name *</label>
                                    <input name="name" required placeholder="John Doe" style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                    }} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</label>
                                        <input name="email" type="email" placeholder="tenant@email.com" style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                        }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</label>
                                        <input name="phone" placeholder="555-000-0000" style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                        }} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Property</label>
                                        <select name="propertyName" style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                        }}>
                                            <option value="">Select property…</option>
                                            {uniqueProperties.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Unit</label>
                                        <input name="unit" placeholder="101" style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                        }} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Monthly Rent</label>
                                        <input name="rent" type="number" step="0.01" placeholder="1500" style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                        }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lease From</label>
                                        <input name="leaseFrom" type="date" style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                        }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lease To</label>
                                        <input name="leaseTo" type="date" style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                        }} />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tenant Type</label>
                                    <select name="tenantType" style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                    }}>
                                        <option value="Residential">Residential</option>
                                        <option value="Commercial">Commercial</option>
                                        <option value="Section 8">Section 8</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                                <button type="button" onClick={() => setShowForm(false)} style={{
                                    padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                    background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                                }}>Cancel</button>
                                <button type="submit" style={{
                                    padding: '8px 16px', borderRadius: 8, border: 'none',
                                    background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', fontSize: 12,
                                    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                                }}>Add Tenant</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm Dialog */}
            {confirmDelete && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }} onClick={() => setConfirmDelete(null)}>
                    <div style={{
                        width: 380, background: '#1e293b', borderRadius: 16, padding: 24,
                        border: '1px solid rgba(239,68,68,0.2)', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
                        textAlign: 'center',
                    }} onClick={e => e.stopPropagation()}>
                        <Trash2 size={32} style={{ color: '#f87171', marginBottom: 12 }} />
                        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Delete Tenant?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94a3b8' }}>This action cannot be undone. The tenant record will be permanently removed.</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                            <button onClick={() => setConfirmDelete(null)} style={{
                                padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                            }}>Cancel</button>
                            <button onClick={() => handleDelete(confirmDelete)} style={{
                                padding: '8px 20px', borderRadius: 8, border: 'none',
                                background: 'linear-gradient(135deg, #ef4444, #f87171)', color: '#fff', fontSize: 12,
                                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                            }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
