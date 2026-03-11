import { useState, useEffect, useCallback } from 'react';
import { Landmark, RefreshCw, Building2, DollarSign, Mail, Phone, FileText, Car } from 'lucide-react';
import { strataGet } from '../strataApi';
import type { EntityProfile, Property, Report } from '../strataTypes';
import { useUser } from '../../../context/UserContext';
import ProfileSpaces from './ProfileSpaces';

export default function OwnersModule() {
    const { hasPermission } = useUser();
    const [owners, setOwners] = useState<EntityProfile[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [reports, setReports] = useState<Report[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<EntityProfile | null>(null);

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
            const token = localStorage.getItem('dwellium-auth-token');
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

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">Owners</h2>
                    <p className="s-module-subtitle">{owners.length} property owners</p>
                </div>
                <div className="s-module-actions">
                    <button className="s-btn s-btn-ghost" onClick={fetchOwners}><RefreshCw size={14} /></button>
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
                            {/* Profile */}
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

                            {/* Properties Owned */}
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
                                                    <div className="s-owner-prop-name">{p.name}</div>
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

                            {/* Vehicles */}
                            <div className="s-glass-card" style={{ maxHeight: '300px', overflowY: 'auto' }}>
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
                                                        <div className="s-owner-prop-meta" style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: '0.15rem' }}>
                                                            📍 {v.location}
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

                            {/* Distributions */}
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
                                </div>
                            )}

                            {/* Statements (from reports) */}
                            {hasPermission('strata:owners:statements') && (
                                <div className="s-glass-card">
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

                            {/* Spaces & Projects (Profile-centric workflow) */}
                            <div className="s-glass-card">
                                <h3 style={{ marginBottom: '1rem' }}>Spaces &amp; Projects</h3>
                                <ProfileSpaces entityType="owner" entityId={selected.id} />
                            </div>

                        </>
                    ) : (
                        <div className="s-empty-detail">
                            <Landmark size={40} strokeWidth={1} />
                            <p>Select an owner to view details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
