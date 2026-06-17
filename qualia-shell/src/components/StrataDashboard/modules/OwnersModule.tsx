import { getAuthToken } from '../../../context/UserContext';
import { useState, useEffect, useCallback } from 'react';
import { Landmark, RefreshCw, Building2, DollarSign, Mail, Phone, FileText, Car, Plus, X, MapPin } from 'lucide-react';
import { strataGet, strataPost } from '../strataApi';
import type { EntityProfile, Property, Report } from '../strataTypes';
import { useUser } from '../../../context/UserContext';
import { useStrataNav } from '../StrataNavContext';
import ProfileSpaces from './ProfileSpaces';

interface OwnersModuleProps {
    searchNavTarget?: { type: string; id: string } | null;
    onNavComplete?: () => void;
}

export default function OwnersModule({ searchNavTarget, onNavComplete }: OwnersModuleProps) {
    const { hasPermission } = useUser();
    const { navigateToProperty } = useStrataNav();
    const [owners, setOwners] = useState<EntityProfile[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [reports, setReports] = useState<Report[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<EntityProfile | null>(null);
    const [detailTab, setDetailTab] = useState<'overview' | 'properties' | 'financials' | 'spaces'>('overview');
    const [showAddForm, setShowAddForm] = useState(false);

    // Phase 8: Auto-select owner from search navigation
    useEffect(() => {
        if (searchNavTarget && searchNavTarget.type === 'owner' && owners.length > 0) {
            const target = owners.find(o => o.id === searchNavTarget.id);
            if (target) { setSelected(target); onNavComplete?.(); }
        }
    }, [searchNavTarget, owners, onNavComplete]);

    const fetchOwners = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch all owner-related entity types: individuals, LLCs, trusts, corporates
            const [owners_, trusts, llcs, corps] = await Promise.all([
                strataGet<EntityProfile[]>('/entities', { type: 'owner' }),
                strataGet<EntityProfile[]>('/entities', { type: 'trust' }),
                strataGet<EntityProfile[]>('/entities', { type: 'llc' }),
                strataGet<EntityProfile[]>('/entities', { type: 'corporate' }),
            ]);
            setOwners([...owners_, ...trusts, ...llcs, ...corps].sort((a, b) => a.name.localeCompare(b.name)));
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchOwners(); }, [fetchOwners]);
    useEffect(() => {
        strataGet<Property[]>('/properties').then(setProperties).catch(console.error);
    }, []);

    const selectOwner = async (owner: EntityProfile) => {
        setSelected(owner);
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const [r, vRes] = await Promise.all([
                strataGet<Report[]>('/reports'),
                fetch(`/api/assets/assets?assigned_to=${owner.id}`, { headers }),
            ]);
            setReports(r);
            if (vRes.ok) {
                const v = await vRes.json();
                setVehicles(v.filter((a: any) => a.category === 'vehicle'));
            } else {
                setVehicles([]);
            }
        } catch {
            setReports([]);
            setVehicles([]);
        }
    };

    const getOwnerProperties = (owner: EntityProfile): Property[] => {
        return properties.filter(p => (owner.propertyIds || []).includes(p.id));
    };

    const distributions: { id: number; period: string; amount: number; status: string; date: string }[] = [];

    const handleAddOwner = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            await strataPost('/entities', {
                entityType: fd.get('entityType') || 'owner',
                name: fd.get('name'),
                email: fd.get('email') || undefined,
                phone: fd.get('phone') || undefined,
                status: 'active',
            });
            setShowAddForm(false);
            fetchOwners();
        } catch (err) { console.error(err); }
    };

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">Owners</h2>
                    <p className="s-module-subtitle">{owners.length} property owners</p>
                </div>
                <div className="s-module-actions">
                    <button className="s-btn s-btn-ghost" onClick={fetchOwners} aria-label="Refresh owners"><RefreshCw size={14} /></button>
                    {hasPermission('strata:owners:create') && (
                        <button className="s-btn s-btn-primary" onClick={() => setShowAddForm(true)}><Plus size={14} /> Add Owner</button>
                    )}
                </div>
            </div>

            <div className="s-split-view">
                {/* Owner List */}
                <div className="s-list-panel">
                    {loading ? (
                        <div className="s-loading">Loading…</div>
                    ) : owners.length === 0 ? (
                        <div className="s-empty">No owners found</div>
                    ) : (
                        owners.map(o => (
                            <div
                                key={o.id}
                                className={`s-list-item ${selected?.id === o.id ? 'active' : ''}`}
                                onClick={() => selectOwner(o)}
                            >
                                <div className="s-list-item-top">
                                    <div className="s-avatar owner"><Landmark size={14} /></div>
                                    <div className="s-list-item-info">
                                        <span className="s-list-item-title">{o.name}</span>
                                        <span className="s-list-item-sub">
                                            <span className={`s-badge s-badge-sm ${o.entityType}`} style={{ marginRight: '0.4rem', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                                                {o.entityType === 'llc' ? 'LLC' : o.entityType === 'corporate' ? 'Corp' : o.entityType === 'trust' ? 'Trust' : 'Individual'}
                                            </span>
                                            {(o.propertyIds || []).length} properties
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Owner Detail */}
                <div className="s-detail-panel">
                    {selected ? (
                        <>
                            {/* Profile Header */}
                            <div className="s-glass-card">
                                <div className="s-vendor-profile">
                                    <div className="s-avatar-lg owner"><Landmark size={24} /></div>
                                    <div>
                                        <h3>{selected.name}</h3>
                                        <span className={`s-badge ${selected.status}`}>{selected.status}</span>
                                    </div>
                                </div>
                                {hasPermission('strata:owners:contact-info') && (
                                    <div className="s-tenant-contact">
                                        {selected.email && <div><Mail size={14} /> {selected.email}</div>}
                                        {selected.phone && <div><Phone size={14} /> {selected.phone}</div>}
                                    </div>
                                )}
                            </div>

                            {/* ── Detail Tab Bar ── */}
                            <div className="s-workspace-tabs" style={{ marginBottom: 12 }}>
                                {(['overview', 'properties', 'financials', 'spaces'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        className={`s-workspace-tab${detailTab === tab ? ' active' : ''}`}
                                        onClick={() => setDetailTab(tab)}
                                    >
                                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    </button>
                                ))}
                            </div>

                            {/* ── TAB: Overview ── */}
                            {detailTab === 'overview' && (
                                <div className="s-glass-card">
                                    <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Building2 size={16} /> Owner Overview
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                                        <div>Entity Type: <strong style={{ color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                                            {selected.entityType === 'llc' ? 'LLC' : selected.entityType === 'corporate' ? 'Corp' : selected.entityType === 'trust' ? 'Trust' : 'Individual'}
                                        </strong></div>
                                        <div>Status: <strong style={{ color: 'var(--text-primary)' }}>{selected.status}</strong></div>
                                        <div>Properties: <strong style={{ color: 'var(--text-primary)' }}>{(selected.propertyIds || []).length}</strong></div>
                                        <div>Vehicles: <strong style={{ color: 'var(--text-primary)' }}>{vehicles.length}</strong></div>
                                    </div>
                                </div>
                            )}

                            {/* ── TAB: Properties ── */}
                            {detailTab === 'properties' && (
                                <>
                                    {hasPermission('strata:owners:properties') && (
                                        <div className="s-glass-card" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                            <h3 style={{ marginBottom: '1rem' }}><Building2 size={16} /> Properties</h3>
                                            <div className="s-owner-props">
                                                {getOwnerProperties(selected).map(p => {
                                                    const ownerDetails = selected.metadata?.ownershipDetails || {};
                                                    const propDetail = Object.values(ownerDetails).find((d: any) => d.propertyName === p.name) as any;
                                                    const breakdown = propDetail?.breakdown || {};
                                                    return (
                                                        <div key={p.id} className="s-owner-prop-card">
                                                            <div className="s-owner-prop-name"><button className="s-property-link" style={{ fontSize: 'inherit', fontWeight: 'inherit' }} onClick={() => navigateToProperty(p.id)}>{p.name}</button></div>
                                                            <div className="s-owner-prop-meta">{p.address}</div>
                                                            {Object.keys(breakdown).length > 0 && (
                                                                <div className="s-owner-prop-meta" style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
                                                                    {Object.entries(breakdown).map(([person, pct]) => (
                                                                        <span key={person} style={{ marginRight: '0.75rem' }}>{person}: <strong>{pct as string}</strong></span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="s-owner-prop-stats">
                                                                <span>{p.unitCount} units</span>
                                                                <span className={`s-badge s-badge-sm ${p.status}`}>{p.status}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {getOwnerProperties(selected).length === 0 && (
                                                    <p className="s-text-muted">No properties linked</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="s-glass-card" style={{ maxHeight: '300px', overflowY: 'auto', marginTop: 12 }}>
                                        <h3 style={{ marginBottom: '1rem' }}><Car size={16} /> Vehicles</h3>
                                        {vehicles.length > 0 ? (
                                            <div className="s-owner-props">
                                                {vehicles.map((v: any) => {
                                                    const meta = v.metadata || {};
                                                    return (
                                                        <div key={v.id} className="s-owner-prop-card">
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                                                <Car size={14} style={{ opacity: 0.6 }} />
                                                                <div className="s-owner-prop-name" style={{ margin: 0 }}>{v.name}</div>
                                                            </div>
                                                            <div className="s-owner-prop-meta">
                                                                <span className="s-badge s-badge-sm" style={{ fontSize: '0.65rem', textTransform: 'uppercase', marginRight: '0.4rem' }}>
                                                                    {meta.vehicleType || v.category}
                                                                </span>
                                                                Purchased {v.purchaseDate || 'N/A'}
                                                            </div>
                                                            {meta.registrationOwnership && (
                                                                <div className="s-owner-prop-meta" style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.2rem' }}>
                                                                    {meta.registrationOwnership}
                                                                </div>
                                                            )}
                                                            {v.location && (
                                                                <div className="s-owner-prop-meta" style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                    <MapPin size={11} aria-hidden /> {v.location}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="s-text-muted">No vehicles registered</p>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* ── TAB: Financials ── */}
                            {detailTab === 'financials' && (
                                <>
                                    {hasPermission('strata:owners:distributions') && (
                                        <div className="s-glass-card" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                            <h3 style={{ marginBottom: '1rem' }}><DollarSign size={16} /> Distributions</h3>
                                            <div className="s-table-wrap">
                                                <table className="s-table">
                                                    <thead>
                                                        <tr><th>Period</th><th>Amount</th><th>Status</th><th>Date</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        {distributions.map(d => (
                                                            <tr key={d.id}>
                                                                <td className="s-td-bold">{d.period}</td>
                                                                <td className="s-text-success">${d.amount.toLocaleString()}</td>
                                                                <td><span className={`s-badge s-badge-sm ${d.status}`}>{d.status}</span></td>
                                                                <td>{d.date}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {distributions.length === 0 && <p className="s-text-muted">No distributions recorded</p>}
                                        </div>
                                    )}
                                    {hasPermission('strata:owners:statements') && (
                                        <div className="s-glass-card" style={{ marginTop: 12 }}>
                                            <h3 style={{ marginBottom: '1rem' }}><FileText size={16} /> Financial Statements</h3>
                                            {reports.length > 0 ? (
                                                reports.slice(0, 5).map(r => (
                                                    <div key={r.id} className="s-dispatch-item">
                                                        <div>
                                                            <div className="s-td-bold">{r.reportType} Report</div>
                                                            <div className="s-text-muted">{r.period}</div>
                                                        </div>
                                                        <button className="s-btn s-btn-xs s-btn-ghost">View</button>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="s-text-muted">No statements generated yet</p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── TAB: Spaces ── */}
                            {detailTab === 'spaces' && (
                                <div className="s-glass-card">
                                    <h3 style={{ marginBottom: '1rem' }}>Spaces &amp; Projects</h3>
                                    <ProfileSpaces entityType="owner" entityId={selected.id} />
                                </div>
                            )}

                        </>
                    ) : (
                        <div className="s-empty-detail">
                            <Landmark size={40} strokeWidth={1} />
                            <p>Select an owner to view details</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Module-level Spaces (Trello-style containers) */}
            <div style={{ marginTop: 16 }}>
                <ProfileSpaces entityType="module" entityId="owners" />
            </div>

            {/* Add Owner Modal */}
            {showAddForm && (
                <div className="s-modal-overlay" onClick={() => setShowAddForm(false)}>
                    <div className="s-modal" onClick={e => e.stopPropagation()}>
                        <div className="s-modal-header">
                            <h3>Add Owner</h3>
                            <button className="s-btn-icon" onClick={() => setShowAddForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleAddOwner}>
                            <div className="s-form-group">
                                <label>Owner/Entity Name</label>
                                <input name="name" required placeholder="e.g. ZP Group LLC" className="s-input" />
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Entity Type</label>
                                    <select name="entityType" className="s-input">
                                        <option value="owner">Individual</option>
                                        <option value="llc">LLC</option>
                                        <option value="trust">Trust</option>
                                        <option value="corporate">Corporate</option>
                                    </select>
                                </div>
                                <div className="s-form-group">
                                    <label>Phone</label>
                                    <input name="phone" type="tel" placeholder="(555) 000-0000" className="s-input" />
                                </div>
                            </div>
                            <div className="s-form-group">
                                <label>Email</label>
                                <input name="email" type="email" placeholder="owner@example.com" className="s-input" />
                            </div>
                            <div className="s-modal-footer">
                                <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
                                <button type="submit" className="s-btn s-btn-primary">Create Owner</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
