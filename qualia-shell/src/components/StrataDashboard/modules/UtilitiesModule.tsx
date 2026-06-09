/**
 * UtilitiesModule — Tracks utility accounts for a property.
 * Optional module that can be enabled/disabled per property.
 */

import { useState, useEffect, useCallback } from 'react';
import { Zap, Flame, Droplets, Wifi, Trash2, Plus, X, Edit2 } from 'lucide-react';
import { strataGet, strataPost, strataPut, strataDelete } from '../strataApi';

const UTILITY_TYPES = [
    { key: 'electric', label: 'Electric', icon: Zap, color: '#f59e0b' },
    { key: 'gas', label: 'Gas', icon: Flame, color: '#ef4444' },
    { key: 'water', label: 'Water', icon: Droplets, color: '#3b82f6' },
    { key: 'internet', label: 'Internet', icon: Wifi, color: 'var(--accent)' },
    { key: 'trash', label: 'Trash', icon: Trash2, color: '#22c55e' },
] as const;

interface UtilityRecord {
    id: string;
    propertyId: string;
    utilityType: string;
    provider: string;
    accountNumber: string;
    monthlyCost: number | null;
    notes: string;
    status: string;
}

interface Props {
    propertyId: string;
}

export default function UtilitiesModule({ propertyId }: Props) {
    const [utilities, setUtilities] = useState<UtilityRecord[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<UtilityRecord | null>(null);

    const fetchUtilities = useCallback(async () => {
        try {
            // Utility records stored via generic workitems with type 'utility'
            const data = await strataGet<any[]>('/workitems', { type: 'utility', property_id: propertyId });
            const mapped: UtilityRecord[] = data.map(w => ({
                id: w.id,
                propertyId: w.propertyId,
                utilityType: w.metadata?.utilityType || 'electric',
                provider: w.metadata?.provider || '',
                accountNumber: w.metadata?.accountNumber || '',
                monthlyCost: w.metadata?.monthlyCost || null,
                notes: w.metadata?.notes || '',
                status: w.status || 'active',
            }));
            setUtilities(mapped);
        } catch (e) { console.error(e); setUtilities([]); }
    }, [propertyId]);

    useEffect(() => { fetchUtilities(); }, [fetchUtilities]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const payload = {
            type: 'utility',
            title: `${fd.get('utilityType')} — ${fd.get('provider')}`,
            status: 'active',
            propertyId,
            metadata: {
                utilityType: fd.get('utilityType'),
                provider: fd.get('provider'),
                accountNumber: fd.get('accountNumber'),
                monthlyCost: parseFloat(fd.get('monthlyCost') as string) || null,
                notes: fd.get('notes'),
            },
        };
        try {
            if (editing) {
                await strataPut(`/workitems/${editing.id}`, payload);
            } else {
                await strataPost('/workitems', payload);
            }
            setShowForm(false);
            setEditing(null);
            fetchUtilities();
        } catch (err) { console.error(err); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this utility record?')) return;
        await strataDelete(`/workitems/${id}`);
        fetchUtilities();
    };

    const getTypeInfo = (key: string) => UTILITY_TYPES.find(t => t.key === key) || UTILITY_TYPES[0];

    return (
        <div className="s-glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={14} color="#f59e0b" /> Utilities
                    {utilities.length > 0 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>({utilities.length})</span>}
                </h3>
                <button className="s-btn s-btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}
                    onClick={() => { setEditing(null); setShowForm(!showForm); }}>
                    <Plus size={12} /> Add Utility
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} style={{
                    padding: 12, borderRadius: 8, marginBottom: 12,
                    background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)',
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <select name="utilityType" defaultValue={editing?.utilityType || 'electric'} className="s-input" style={{ fontSize: 11 }}>
                            {UTILITY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                        <input name="provider" placeholder="Provider name" defaultValue={editing?.provider || ''} required className="s-input" style={{ fontSize: 11 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8, marginBottom: 8 }}>
                        <input name="accountNumber" placeholder="Account #" defaultValue={editing?.accountNumber || ''} className="s-input" style={{ fontSize: 11 }} />
                        <input name="monthlyCost" type="number" step="0.01" placeholder="Monthly $" defaultValue={editing?.monthlyCost || ''} className="s-input" style={{ fontSize: 11 }} />
                        <input name="notes" placeholder="Notes" defaultValue={editing?.notes || ''} className="s-input" style={{ fontSize: 11 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" className="s-btn s-btn-ghost" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
                        <button type="submit" className="s-btn s-btn-primary">{editing ? 'Update' : 'Add'}</button>
                    </div>
                </form>
            )}

            {utilities.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {utilities.map(u => {
                        const info = getTypeInfo(u.utilityType);
                        const Icon = info.icon;
                        return (
                            <div key={u.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                            }}>
                                <Icon size={16} style={{ color: info.color, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {u.provider}
                                        <span style={{
                                            fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase',
                                            background: `${info.color}15`, border: `1px solid ${info.color}40`, color: info.color,
                                        }}>{info.label}</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 12, marginTop: 2 }}>
                                        {u.accountNumber && <span>Acct: <strong style={{ color: 'var(--text-secondary)' }}>{u.accountNumber}</strong></span>}
                                        {u.monthlyCost && <span>${u.monthlyCost.toFixed(2)}/mo</span>}
                                        {u.notes && <span>{u.notes}</span>}
                                    </div>
                                </div>
                                <button onClick={() => { setEditing(u); setShowForm(true); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }} title="Edit">
                                    <Edit2 size={12} />
                                </button>
                                <button onClick={() => handleDelete(u.id)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }} title="Delete">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-tertiary)', fontSize: 12 }}>
                    <Zap size={20} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 6 }} />
                    <p style={{ margin: 0 }}>No utility accounts tracked</p>
                </div>
            )}
        </div>
    );
}
