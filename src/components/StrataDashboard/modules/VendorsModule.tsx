import { useState, useEffect, useCallback } from 'react';
import { Truck, Search, RefreshCw, Plus, X, Shield, AlertTriangle, CheckCircle, Mail, Phone, DollarSign, FileText, Link2, Trash2 } from 'lucide-react';
import { strataGet, strataPost, strataDelete } from '../strataApi';
import type { EntityProfile, Workitem } from '../strataTypes';
import { useUser } from '../../../context/UserContext';
import ProfileSpaces from './ProfileSpaces';

function getCoiStatus(vendor: EntityProfile): { status: string; color: string; expiry: string } {
    const expiry = vendor.metadata?.coiExpiry || '';
    const coiStatus = vendor.metadata?.coiStatus || 'unknown';
    const colors: Record<string, string> = { valid: 'var(--s-success)', expiring: 'var(--s-warning)', expired: 'var(--s-danger)', unknown: 'var(--s-text-tertiary)' };
    return { status: coiStatus, color: colors[coiStatus] || colors.unknown, expiry };
}

export default function VendorsModule() {
    const { hasPermission } = useUser();
    const [vendors, setVendors] = useState<EntityProfile[]>([]);
    const [workOrders, setWorkOrders] = useState<Workitem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<EntityProfile | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [detailTab, setDetailTab] = useState<'overview' | 'ledger' | 'spaces'>('overview');
    const [ledger, setLedger] = useState<any[]>([]);
    const [vendorBalance, setVendorBalance] = useState(0);
    const [showLedgerForm, setShowLedgerForm] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const fetchLedger = useCallback(async (vendorId: string) => {
        try {
            const data = await strataGet<any[]>(`/vendors/${vendorId}/ledger`);
            setLedger(data);
            const bal = await strataGet<{ balance: number }>(`/vendors/${vendorId}/balance`);
            setVendorBalance(bal.balance);
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        if (selected) { fetchLedger(selected.id); setDetailTab('overview'); }
    }, [selected, fetchLedger]);

    const fetchVendors = useCallback(async () => {
        setLoading(true);
        try {
            const data = await strataGet<EntityProfile[]>('/entities', { type: 'vendor' });
            setVendors(data);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchVendors(); }, [fetchVendors]);
    useEffect(() => {
        strataGet<Workitem[]>('/workitems', { type: 'work_order', status: 'open' }).then(setWorkOrders).catch(console.error);
    }, []);

    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            await strataPost('/entities', {
                entityType: 'vendor',
                name: fd.get('name'),
                email: fd.get('email'),
                phone: fd.get('phone'),
                metadata: {
                    specialty: fd.get('specialty'),
                    rating: 0,
                    coiExpiry: fd.get('coiExpiry'),
                    coiStatus: fd.get('coiExpiry') ? 'valid' : 'unknown',
                },
            });
            setShowForm(false);
            fetchVendors();
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

    const filtered = search
        ? vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()) || (v.metadata?.specialty || '').toLowerCase().includes(search.toLowerCase()))
        : vendors;

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
                            <input placeholder="Search vendors…" value={search} onChange={e => setSearch(e.target.value)} className="s-input s-input-sm" />
                        </div>
                    )}
                    <button className="s-btn s-btn-ghost" onClick={fetchVendors}><RefreshCw size={14} /></button>
                    {hasPermission('strata:vendors:create') && (
                        <button className="s-btn s-btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Add Vendor</button>
                    )}
                </div>
            </div>

            <div className="s-split-view">
                {/* Vendor List */}
                <div className="s-list-panel">
                    {loading ? (
                        <div className="s-loading">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="s-empty">No vendors found</div>
                    ) : (
                        filtered.map(v => {
                            const coi = getCoiStatus(v);
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
                                    {hasPermission('strata:vendors:coi-status') && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: coi.color, fontSize: '0.75rem' }}>
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
                        const coi = getCoiStatus(selected);
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
                                    <button onClick={() => setConfirmDelete(selected.id)} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        width: '100%', padding: '7px 12px', marginTop: 10, borderRadius: 8,
                                        fontSize: 11, fontWeight: 600,
                                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                        color: '#fca5a5', cursor: 'pointer', fontFamily: 'inherit',
                                    }}>
                                        <Trash2 size={12} /> Delete Vendor
                                    </button>
                                </div>

                                {/* Detail Tab Bar */}
                                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 12 }}>
                                    {(['overview', 'ledger', 'spaces'] as const).map(tab => (
                                        <button key={tab} onClick={() => setDetailTab(tab)} style={{
                                            padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                            background: 'none', border: 'none',
                                            borderBottom: detailTab === tab ? '2px solid #818cf8' : '2px solid transparent',
                                            color: detailTab === tab ? '#e2e8f0' : '#64748b',
                                            textTransform: 'capitalize',
                                        }}>
                                            {tab === 'spaces' ? 'Spaces & Links' : tab}
                                        </button>
                                    ))}
                                </div>

                                {detailTab === 'overview' ? (
                                    <>

                                        {/* COI Tracking */}
                                        <div className="s-glass-card">
                                            <h3 style={{ marginBottom: '1rem' }}><Shield size={16} /> Certificate of Insurance</h3>
                                            <div className="s-coi-status" style={{ borderColor: coi.color }}>
                                                <div style={{ color: coi.color, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {coiIcon(coi.status)} <strong>{coi.status.toUpperCase()}</strong>
                                                </div>
                                                {coi.expiry && <div className="s-text-muted">Expires: {coi.expiry}</div>}
                                            </div>
                                        </div>

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
                                                                <button className="s-btn s-btn-xs s-btn-primary" onClick={() => alert(`Dispatched ${selected.name} to: ${wo.title}`)}>
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

                                        {/* ── Associated Properties ── */}
                                        {(selected.propertyIds || []).length > 0 && (
                                            <div className="s-glass-card">
                                                <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                                                    Associated Properties
                                                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>({selected.propertyIds.length})</span>
                                                </h3>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {selected.propertyIds.map((pid: string) => (
                                                        <div key={pid} style={{
                                                            padding: '6px 10px', borderRadius: 6, fontSize: 12,
                                                            background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
                                                            color: '#a5b4fc',
                                                        }}>
                                                            {pid}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

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

                                        {/* ── Vendor Notes ── */}
                                        {selected.metadata?.notes && (
                                            <div className="s-glass-card">
                                                <h3 style={{ marginBottom: '0.75rem', fontSize: 14 }}>Notes</h3>
                                                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                                                    {typeof selected.metadata.notes === 'string'
                                                        ? selected.metadata.notes
                                                        : Array.isArray(selected.metadata.notes)
                                                            ? selected.metadata.notes.map((n: any, i: number) => (
                                                                <div key={i} style={{ padding: '6px 0', borderBottom: i < selected.metadata.notes.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                                                    {n.content || n}
                                                                </div>
                                                            ))
                                                            : null
                                                    }
                                                </div>
                                            </div>
                                        )}
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
                                                }} style={{ padding: 12, borderRadius: 8, marginBottom: 12, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)' }}>
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
        </div>
    );
}

