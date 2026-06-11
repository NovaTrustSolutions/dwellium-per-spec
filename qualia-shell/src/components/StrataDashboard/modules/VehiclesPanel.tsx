/**
 * VehiclesPanel — Displays and manages vehicles associated with a tenant or property.
 *
 * Props:
 *   tenantId?: string  — filter vehicles by tenant
 *   propertyId?: string — filter vehicles by property
 */

import { useState, useEffect, useCallback } from 'react';
import { Car, Plus, X, Edit2, Trash2 } from 'lucide-react';
import { strataGet, strataPost, strataPut, strataDelete } from '../strataApi';

interface Vehicle {
    id: string;
    tenantId: string | null;
    propertyId: string | null;
    make: string;
    model: string;
    year: number | null;
    color: string;
    licensePlate: string;
    state: string;
    parkingSpot: string;
    stickerNumber: string;
    notes: string;
    status: string;
}

interface Props {
    tenantId?: string;
    propertyId?: string;
}

export default function VehiclesPanel({ tenantId, propertyId }: Props) {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Vehicle | null>(null);

    const fetch = useCallback(async () => {
        try {
            const params: Record<string, string> = {};
            if (tenantId) params.tenantId = tenantId;
            else if (propertyId) params.propertyId = propertyId;
            const data = await strataGet<Vehicle[]>('/vehicles', params);
            setVehicles(data);
        } catch (e) { console.error(e); }
    }, [tenantId, propertyId]);

    useEffect(() => { fetch(); }, [fetch]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const payload: any = {
            make: fd.get('make'), model: fd.get('model'), year: parseInt(fd.get('year') as string) || null,
            color: fd.get('color'), licensePlate: fd.get('licensePlate'), state: fd.get('state'),
            parkingSpot: fd.get('parkingSpot'), stickerNumber: fd.get('stickerNumber'), notes: fd.get('notes'),
            tenantId: tenantId || null, propertyId: propertyId || null,
        };
        try {
            if (editing) {
                await strataPut('/vehicles/' + editing.id, payload);
            } else {
                await strataPost('/vehicles', payload);
            }
            setShowForm(false);
            setEditing(null);
            fetch();
        } catch (err) { console.error(err); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this vehicle?')) return;
        await strataDelete('/vehicles/' + id);
        fetch();
    };

    return (
        <div className="s-glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Car size={14} /> Vehicles
                    {vehicles.length > 0 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>({vehicles.length})</span>}
                </h3>
                <button className="s-btn s-btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}
                    onClick={() => { setEditing(null); setShowForm(!showForm); }}>
                    <Plus size={12} /> Add Vehicle
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} style={{
                    padding: 12, borderRadius: 8, marginBottom: 12,
                    background: 'color-mix(in srgb, var(--accent) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)',
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8, marginBottom: 8 }}>
                        <input name="make" placeholder="Make" defaultValue={editing?.make || ''} required className="s-input" style={{ fontSize: 11 }} />
                        <input name="model" placeholder="Model" defaultValue={editing?.model || ''} required className="s-input" style={{ fontSize: 11 }} />
                        <input name="year" type="number" placeholder="Year" defaultValue={editing?.year || ''} className="s-input" style={{ fontSize: 11 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8, marginBottom: 8 }}>
                        <input name="color" placeholder="Color" defaultValue={editing?.color || ''} className="s-input" style={{ fontSize: 11 }} />
                        <input name="licensePlate" placeholder="License Plate" defaultValue={editing?.licensePlate || ''} className="s-input" style={{ fontSize: 11 }} />
                        <input name="state" placeholder="State" defaultValue={editing?.state || ''} className="s-input" style={{ fontSize: 11 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8, marginBottom: 8 }}>
                        <input name="parkingSpot" placeholder="Parking Spot" defaultValue={editing?.parkingSpot || ''} className="s-input" style={{ fontSize: 11 }} />
                        <input name="stickerNumber" placeholder="Sticker #" defaultValue={editing?.stickerNumber || ''} className="s-input" style={{ fontSize: 11 }} />
                        <input name="notes" placeholder="Notes" defaultValue={editing?.notes || ''} className="s-input" style={{ fontSize: 11 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" className="s-btn s-btn-ghost" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
                        <button type="submit" className="s-btn s-btn-primary">{editing ? 'Update' : 'Add'}</button>
                    </div>
                </form>
            )}

            {vehicles.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {vehicles.map(v => (
                        <div key={v.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                            borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                        }}>
                            <Car size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {v.year ? v.year + ' ' : ''}{v.make} {v.model}
                                    {v.color && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> — {v.color}</span>}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 12, marginTop: 2 }}>
                                    {v.licensePlate && <span>Plate: <strong style={{ color: 'var(--text-secondary)' }}>{v.licensePlate}</strong>{v.state ? ` (${v.state})` : ''}</span>}
                                    {v.parkingSpot && <span>Spot: {v.parkingSpot}</span>}
                                    {v.stickerNumber && <span>Sticker: {v.stickerNumber}</span>}
                                </div>
                            </div>
                            <button onClick={() => { setEditing(v); setShowForm(true); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }} title="Edit">
                                <Edit2 size={12} />
                            </button>
                            <button onClick={() => handleDelete(v.id)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }} title="Delete">
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-tertiary)', fontSize: 12 }}>
                    <Car size={20} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 6 }} />
                    <p style={{ margin: 0 }}>No vehicles registered</p>
                </div>
            )}
        </div>
    );
}
