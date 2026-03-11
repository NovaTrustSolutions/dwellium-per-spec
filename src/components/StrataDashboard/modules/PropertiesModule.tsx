import { useState, useEffect, useCallback } from 'react';
import {
    Building2, MapPin, Home, Plus, X, ChevronRight, ChevronDown,
    RefreshCw, Wrench, LayoutGrid, List, Table2, User, Mail, Phone,
    DollarSign, Shield, Globe, Calendar, FileText, AlertTriangle,
    Clock, Dog, Car, ChevronUp, Landmark, CreditCard, StickyNote,
    History, Paperclip, TrendingUp, Settings2, Megaphone, PieChart,
    Scale, BookOpen, Camera, Upload, Image as ImageIcon, Send, Trash2,
} from 'lucide-react';
import { useUser } from '../../../context/UserContext';
import { strataGet, strataPost, strataPut, strataDelete } from '../strataApi';
import type { Property, Unit, EntityProfile, Workitem } from '../strataTypes';
import TrelloCardModal from './TrelloCardModal';
import ProfileSpaces from './ProfileSpaces';

type View = 'list' | 'detail';
type CardView = 'grid' | 'rows' | 'table';
type StatusFilter = 'all' | 'active' | 'inactive' | 'archived';

const fmtType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/* ── Collapsible Detail Section (reused from ResidentsModule pattern) ── */
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

export default function PropertiesModule() {
    const { hasPermission } = useUser();
    const [properties, setProperties] = useState<Property[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [selected, setSelected] = useState<Property | null>(null);
    const [view, setView] = useState<View>('list');
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [expandedDesc, setExpandedDesc] = useState<string | null>(null);
    const [expandedAssets, setExpandedAssets] = useState<string | null>(null);
    const [cardView, setCardView] = useState<CardView>('grid');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [confirmDeleteProp, setConfirmDeleteProp] = useState<string | null>(null);

    // ── Feature 1: Tenant detail for units ──
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
    const [tenants, setTenants] = useState<EntityProfile[]>([]);
    const [matchedTenant, setMatchedTenant] = useState<EntityProfile | null>(null);

    // ── Feature 3: Trello notes for properties ──
    const [propertyWorkitems, setPropertyWorkitems] = useState<Workitem[]>([]);
    const [showTrelloNotes, setShowTrelloNotes] = useState(false);
    const [expandedWorkitem, setExpandedWorkitem] = useState<Workitem | null>(null);

    // ── Feature 4: Add notes + Photo uploads ──
    const [newNoteText, setNewNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [savingPhoto, setSavingPhoto] = useState(false);

    const addNote = async () => {
        if (!newNoteText.trim() || !selected) return;
        setSavingNote(true);
        try {
            const pm = selected.metadata || {};
            const existingNotes = Array.isArray(pm.notes) ? pm.notes : [];
            const note = {
                id: crypto.randomUUID(),
                author: 'User',
                postedAt: new Date().toISOString().split('T')[0],
                content: newNoteText.trim(),
            };
            existingNotes.push(note);
            await strataPut(`/properties/${selected.id}`, {
                metadata: JSON.stringify({ ...pm, notes: existingNotes }),
            });
            setSelected({ ...selected, metadata: { ...pm, notes: existingNotes } });
            setNewNoteText('');
        } catch (e) { console.error('Failed to add note', e); }
        setSavingNote(false);
    };

    const deleteNote = async (noteId: string) => {
        if (!selected) return;
        const pm = selected.metadata || {};
        const notes = Array.isArray(pm.notes) ? pm.notes.filter((n: any) => n.id !== noteId) : [];
        try {
            await strataPut(`/properties/${selected.id}`, {
                metadata: JSON.stringify({ ...pm, notes }),
            });
            setSelected({ ...selected, metadata: { ...pm, notes } });
        } catch (e) { console.error('Failed to delete note', e); }
    };

    const addPhotos = async (files: FileList | null) => {
        if (!files || files.length === 0 || !selected) return;
        setSavingPhoto(true);
        try {
            const pm = selected.metadata || {};
            const photos: any[] = Array.isArray(pm.photos) ? [...pm.photos] : [];
            for (const file of Array.from(files)) {
                // Convert to base64 data URL for storage (small property photos)
                const dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });
                photos.push({
                    id: crypto.randomUUID(),
                    name: file.name,
                    dataUrl,
                    uploadedAt: new Date().toISOString(),
                });
            }
            await strataPut(`/properties/${selected.id}`, {
                metadata: JSON.stringify({ ...pm, photos }),
            });
            setSelected({ ...selected, metadata: { ...pm, photos } });
        } catch (e) { console.error('Failed to upload photos', e); }
        setSavingPhoto(false);
    };

    const deletePhoto = async (photoId: string) => {
        if (!selected) return;
        const pm = selected.metadata || {};
        const photos = Array.isArray(pm.photos) ? pm.photos.filter((p: any) => p.id !== photoId) : [];
        try {
            await strataPut(`/properties/${selected.id}`, {
                metadata: JSON.stringify({ ...pm, photos }),
            });
            setSelected({ ...selected, metadata: { ...pm, photos } });
        } catch (e) { console.error('Failed to delete photo', e); }
    };

    const statusFiltered = statusFilter === 'all'
        ? properties
        : properties.filter(p => p.status === statusFilter);
    const filteredProperties = typeFilter === 'all'
        ? statusFiltered
        : statusFiltered.filter(p => (p.type || '').toLowerCase().replace(/[\s_-]/g, '') === typeFilter);

    const fetchProperties = useCallback(async () => {
        setLoading(true);
        try {
            const data = await strataGet<Property[]>('/properties');
            setProperties(data);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    const fetchUnits = useCallback(async (propertyId: string) => {
        try {
            const data = await strataGet<Unit[]>('/units', { property_id: propertyId });
            setUnits(data);
        } catch (e) { console.error(e); }
    }, []);

    const fetchTenants = useCallback(async (propertyId: string) => {
        try {
            const data = await strataGet<EntityProfile[]>('/entities', { type: 'tenant' });
            // Filter tenants whose propertyIds includes this property
            const filtered = data.filter(t =>
                (t.propertyIds || []).includes(propertyId) ||
                (t.metadata?.propertyName || '').toLowerCase() === (selected?.name || '').toLowerCase()
            );
            setTenants(filtered.length > 0 ? filtered : data);
        } catch (e) { console.error(e); }
    }, [selected]);

    const fetchPropertyWorkitems = useCallback(async (propertyId: string) => {
        try {
            const data = await strataGet<Workitem[]>(`/property-workitems/${propertyId}`);
            setPropertyWorkitems(data);
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => { fetchProperties(); }, [fetchProperties]);

    const openDetail = (p: Property) => {
        setSelected(p);
        setView('detail');
        setSelectedUnit(null);
        setMatchedTenant(null);
        fetchUnits(p.id);
        fetchTenants(p.id);
        fetchPropertyWorkitems(p.id);
    };

    // ── Feature 2: Safe back button ──
    const goBack = () => {
        setView('list');
        setSelected(null);
        setUnits([]);
        setSelectedUnit(null);
        setMatchedTenant(null);
        setTenants([]);
        setPropertyWorkitems([]);
        setShowTrelloNotes(false);
        setExpandedAssets(null);
    };

    // ── Feature 1: Click a unit → find matching tenant ──
    const selectUnit = (unit: Unit) => {
        setSelectedUnit(unit);
        // Match by currentTenantId or by metadata.unit
        const match = tenants.find(t =>
            (unit.currentTenantId && t.id === unit.currentTenantId) ||
            (t.metadata?.unit || '').toLowerCase().trim() === unit.unitNumber.toLowerCase().trim()
        );
        setMatchedTenant(match || null);
    };

    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            await strataPost('/properties', {
                name: fd.get('name'),
                address: fd.get('address'),
                type: fd.get('type'),
                unitCount: Number(fd.get('unitCount')) || 0,
            });
            setShowForm(false);
            fetchProperties();
        } catch (err) { console.error(err); }
    };

    const handleDeleteProp = async (id: string) => {
        try {
            await strataDelete(`/properties/${id}`);
            setConfirmDeleteProp(null);
            goBack();
            fetchProperties();
        } catch (err) { console.error(err); }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'occupied': return 'var(--s-success, #10b981)';
            case 'vacant': return 'var(--s-info, #3b82f6)';
            case 'maintenance': return 'var(--s-warning, #f59e0b)';
            case 'turn': return 'var(--s-danger, #ef4444)';
            default: return 'var(--s-text-tertiary, #64748b)';
        }
    };

    const getOccupiedCount = (propUnits: Unit[]) => propUnits.filter(u => u.status === 'occupied').length;

    // ══════════ PROPERTY LIST VIEW ══════════
    if (view === 'list') {
        return (
            <div className="s-module">
                <div className="s-module-header">
                    <div>
                        <h2 className="s-module-title">Properties</h2>
                        <p className="s-module-subtitle">{filteredProperties.length} of {properties.length} properties</p>
                    </div>
                    <div className="s-module-actions">
                        <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--s-border, rgba(255,255,255,0.1))' }}>
                            {([['grid', LayoutGrid], ['rows', List], ['table', Table2]] as const).map(([mode, Icon]) => (
                                <button
                                    key={mode}
                                    className="s-btn s-btn-ghost"
                                    style={{
                                        padding: '5px 8px', borderRadius: 0, margin: 0,
                                        background: cardView === mode ? 'rgba(99,102,241,0.2)' : 'transparent',
                                        color: cardView === mode ? 'var(--s-accent, #6366f1)' : 'var(--s-text-secondary)',
                                    }}
                                    onClick={() => setCardView(mode)}
                                    title={mode.charAt(0).toUpperCase() + mode.slice(1) + ' view'}
                                >
                                    <Icon size={14} />
                                </button>
                            ))}
                        </div>
                        <button className="s-btn s-btn-ghost" onClick={fetchProperties}><RefreshCw size={14} /></button>
                        {hasPermission('strata:properties:create') && (
                            <button className="s-btn s-btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Add Property</button>
                        )}
                    </div>
                </div>

                {/* Status filter tabs */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {(['all', 'active', 'inactive', 'archived'] as StatusFilter[]).map(filter => {
                        const count = filter === 'all' ? properties.length : properties.filter(p => p.status === filter).length;
                        const isActive = statusFilter === filter;
                        return (
                            <button
                                key={filter}
                                onClick={() => setStatusFilter(filter)}
                                style={{
                                    padding: '5px 14px',
                                    borderRadius: 20,
                                    border: isActive ? '1px solid var(--s-accent, #6366f1)' : '1px solid rgba(255,255,255,0.1)',
                                    background: isActive ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                                    color: isActive ? 'var(--s-accent, #6366f1)' : 'var(--s-text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: 12, fontWeight: 600,
                                    transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}
                            >
                                {filter.charAt(0).toUpperCase() + filter.slice(1)}
                                <span style={{ fontSize: 10, opacity: 0.7 }}>({count})</span>
                            </button>
                        );
                    })}
                </div>

                {/* Type filter tabs */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                    {[
                        { id: 'all', label: 'All Types' },
                        { id: 'multifamily', label: 'Multi-Family' },
                        { id: 'singlefamily', label: 'Single-Family' },
                        { id: 'commercial', label: 'Commercial' },
                        { id: 'land', label: 'Land' },
                        { id: 'mixeduse', label: 'Mixed-Use' },
                    ].map(t => {
                        const isActive = typeFilter === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTypeFilter(t.id)}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: 16,
                                    border: isActive ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.06)',
                                    background: isActive ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.02)',
                                    color: isActive ? '#06b6d4' : '#64748b',
                                    cursor: 'pointer',
                                    fontSize: 11, fontWeight: 500,
                                    transition: 'all 0.15s',
                                }}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                {loading ? (
                    <div className="s-loading">Loading properties…</div>
                ) : cardView === 'grid' ? (
                    <div className="s-card-grid">
                        {filteredProperties.map(p => (
                            <div key={p.id} className="s-glass-card s-clickable" onClick={() => openDetail(p)}>
                                <div className="s-prop-card-header">
                                    <div className="s-prop-icon"><Building2 size={20} /></div>
                                    <span className={`s-badge ${p.status}`}>{p.status}</span>
                                </div>
                                <h3 className="s-prop-name">{p.name}</h3>
                                {hasPermission('strata:properties:address') && (
                                    <div className="s-prop-address"><MapPin size={12} /> {p.address}</div>
                                )}
                                {p.metadata?.owner && (
                                    <div className="s-prop-address" style={{ opacity: 0.7, marginTop: 2 }}>
                                        <Home size={12} /> {p.metadata.owner}
                                    </div>
                                )}
                                {p.metadata?.description && (
                                    <div style={{ marginTop: 6 }}>
                                        <button
                                            className="s-btn-ghost"
                                            style={{ fontSize: '0.78rem', padding: '2px 6px', opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer', color: 'var(--s-text-secondary)', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}
                                            onClick={(e) => { e.stopPropagation(); setExpandedDesc(expandedDesc === p.id ? null : p.id); }}
                                        >
                                            {expandedDesc === p.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                            Description
                                        </button>
                                        {expandedDesc === p.id && (
                                            <div style={{ marginTop: 6, padding: '8px 10px', fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--s-text-secondary)', background: 'rgba(255,255,255,0.03)', borderRadius: 6, whiteSpace: 'pre-line', borderLeft: '2px solid var(--s-accent, #6366f1)' }}>
                                                {p.metadata.description}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="s-prop-stats">
                                    <div className="s-prop-stat">
                                        <span className="s-prop-stat-value">{p.unitCount}</span>
                                        <span className="s-prop-stat-label">Units</span>
                                    </div>
                                    <div className="s-prop-stat">
                                        <span className="s-prop-stat-value">{fmtType(p.type)}</span>
                                        <span className="s-prop-stat-label">Type</span>
                                    </div>
                                </div>
                                <div className="s-prop-footer">
                                    <span>View details</span>
                                    <ChevronRight size={14} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : cardView === 'rows' ? (
                    /* ── LIST / ROW VIEW ── */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {filteredProperties.map(p => (
                            <div
                                key={p.id}
                                className="s-glass-card s-clickable"
                                onClick={() => openDetail(p)}
                                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px' }}
                            >
                                <div className="s-prop-icon" style={{ flexShrink: 0 }}><Building2 size={18} /></div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <strong style={{ fontSize: '0.95rem' }}>{p.name}</strong>
                                        <span className={`s-badge ${p.status}`} style={{ fontSize: '0.65rem' }}>{p.status}</span>
                                    </div>
                                    {hasPermission('strata:properties:address') && (
                                        <div className="s-prop-address" style={{ marginTop: 2 }}><MapPin size={11} /> {p.address}</div>
                                    )}
                                </div>
                                {p.metadata?.owner && (
                                    <div style={{ flexShrink: 0, fontSize: '0.8rem', color: 'var(--s-text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <Home size={11} style={{ verticalAlign: -2, marginRight: 4 }} />{p.metadata.owner}
                                    </div>
                                )}
                                <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 60 }}>
                                    <div style={{ fontWeight: 600 }}>{p.unitCount}</div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Units</div>
                                </div>
                                <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 80 }}>
                                    <div style={{ fontWeight: 600 }}>{fmtType(p.type)}</div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Type</div>
                                </div>
                                <ChevronRight size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
                            </div>
                        ))}
                    </div>
                ) : (
                    /* ── TABLE VIEW ── */
                    <div className="s-glass-card" style={{ padding: 0 }}>
                        <div className="s-table-wrap">
                            <table className="s-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Address</th>
                                        <th>Owner</th>
                                        <th>Type</th>
                                        <th>Units</th>
                                        <th>Status</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProperties.map(p => (
                                        <tr key={p.id} className="s-clickable" onClick={() => openDetail(p)} style={{ cursor: 'pointer' }}>
                                            <td className="s-td-bold">{p.name}</td>
                                            <td>{hasPermission('strata:properties:address') ? p.address : '—'}</td>
                                            <td style={{ color: 'var(--s-text-secondary)' }}>{p.metadata?.owner || '—'}</td>
                                            <td>{fmtType(p.type)}</td>
                                            <td>{p.unitCount}</td>
                                            <td><span className={`s-badge ${p.status}`}>{p.status}</span></td>
                                            <td><ChevronRight size={14} style={{ opacity: 0.4 }} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Add Property Modal */}
                {showForm && (
                    <div className="s-modal-overlay" onClick={() => setShowForm(false)}>
                        <div className="s-modal" onClick={e => e.stopPropagation()}>
                            <div className="s-modal-header">
                                <h3>Add Property</h3>
                                <button className="s-btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
                            </div>
                            <form onSubmit={handleCreate}>
                                <div className="s-form-group">
                                    <label>Property Name</label>
                                    <input name="name" required placeholder="e.g. Skyline Tower" className="s-input" />
                                </div>
                                <div className="s-form-group">
                                    <label>Address</label>
                                    <input name="address" required placeholder="Full address" className="s-input" />
                                </div>
                                <div className="s-form-row">
                                    <div className="s-form-group">
                                        <label>Type</label>
                                        <select name="type" className="s-input">
                                            <option value="residential">Residential</option>
                                            <option value="commercial">Commercial</option>
                                            <option value="mixed_use">Mixed Use</option>
                                        </select>
                                    </div>
                                    <div className="s-form-group">
                                        <label>Unit Count</label>
                                        <input name="unitCount" type="number" min="0" className="s-input" placeholder="0" />
                                    </div>
                                </div>
                                <div className="s-modal-footer">
                                    <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                                    <button type="submit" className="s-btn s-btn-primary">Create Property</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ══════════ PROPERTY DETAIL VIEW ══════════
    const md = matchedTenant?.metadata || {};
    const pm = selected?.metadata || {};

    /* helper: render a note with expandable content */
    const NoteCard = ({ note }: { note: any }) => {
        const [expanded, setExpanded] = useState(false);
        const isLong = (note.content || '').length > 200;
        return (
            <div style={{
                padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
                borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 6,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 10, color: '#64748b' }}>
                    {note.isEdited ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>EDITED</span> : <span style={{ color: '#6366f1', fontWeight: 600 }}>POSTED</span>}
                    <span>Last edited – {note.author} on {note.editedAt || note.postedAt}</span>
                </div>
                <div style={{
                    fontSize: 12, color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-line',
                    maxHeight: expanded ? 'none' : 100, overflow: 'hidden',
                }}>
                    {note.content}
                </div>
                {isLong && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        style={{
                            background: 'none', border: 'none', color: '#6366f1', fontSize: 11,
                            cursor: 'pointer', padding: '4px 0', fontWeight: 600, fontFamily: 'inherit',
                        }}
                    >
                        {expanded ? 'show less' : 'show full note'}
                    </button>
                )}
            </div>
        );
    };

    return (
        <>
            <div className="s-module">
                <div className="s-module-header">
                    <div className="s-breadcrumb">
                        <button className="s-btn s-btn-ghost" onClick={goBack}>← Properties</button>
                        <ChevronRight size={14} />
                        <span>{selected?.name}</span>
                        {selectedUnit && (
                            <>
                                <ChevronRight size={14} />
                                <span style={{ color: 'var(--s-accent, #6366f1)' }}>Unit {selectedUnit.unitNumber}</span>
                            </>
                        )}
                    </div>
                </div>

                {selected && (
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {/* ── Left column: Property info ── */}
                        <div style={{ flex: 1, minWidth: 400 }}>
                            {/* ───── PROPERTY HEADER ───── */}
                            {hasPermission('strata:properties:kpi') && (
                                <div className="s-glass-card s-detail-card">
                                    <div className="s-detail-header">
                                        <div>
                                            <h2>{selected.name}</h2>
                                            <p className="s-detail-address">{hasPermission('strata:properties:address') && <><MapPin size={14} /> {selected.address}</>}</p>
                                            {pm.county && (
                                                <p className="s-detail-address" style={{ marginTop: 2, opacity: 0.7 }}>
                                                    <Globe size={14} /> {pm.county}
                                                </p>
                                            )}
                                            {pm.owner && (
                                                <p className="s-detail-address" style={{ marginTop: 4, opacity: 0.8 }}>
                                                    <Home size={14} /> Owner: {pm.owner}
                                                </p>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                            <span className={`s-badge ${selected.status}`}>{selected.status}</span>
                                            {pm.propertyType && (
                                                <span style={{
                                                    fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                                    background: 'rgba(99,102,241,0.12)', color: '#818cf8', fontWeight: 600,
                                                }}>{pm.propertyType}</span>
                                            )}
                                            <button onClick={() => setConfirmDeleteProp(selected.id)} style={{
                                                display: 'flex', alignItems: 'center', gap: 4, marginTop: 4,
                                                padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                                color: '#fca5a5', cursor: 'pointer', fontFamily: 'inherit',
                                            }}>
                                                <Trash2 size={10} /> Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ───── PROPERTY INFORMATION ───── */}
                            <DetailSection title="Property Information" icon={<Building2 size={12} />}>
                                <Field label="Status" value={pm.status || selected.status} />
                                <Field label="Rent Ready" value={pm.rentReady} />
                                <Field label="Ready For Showing On" value={pm.readyForShowingOn} />
                                <Field label="Lockbox" value={pm.lockbox} />
                                <Field label="Description" value={pm.description} full />
                                <Field label="Portfolio" value={pm.portfolio} />
                                <Field label="Site Manager" value={pm.siteManager} />
                                <Field label="Year Built" value={pm.yearBuilt} />
                                <Field label="Management Start Date" value={pm.managementStartDate} />
                                <Field label="Management End Date" value={pm.managementEndDate} />
                                <Field label="Management End Reason" value={pm.managementEndReason} />
                                <Field label="FolioGuard Policy" value={pm.folioGuardPolicy} />
                                <Field label="Resident eCheck Fee Coverage" value={pm.residentECheckFeeCoverage} />
                                <Field label="FolioGuard Security Deposit" value={pm.folioGuardSecurityDepositAlternative} />
                                <Field label="Parcel" value={pm.parcel} full />
                                <Field label="Tags" value={pm.tags} />
                            </DetailSection>

                            {/* ───── NON-REVENUE STATUS ───── */}
                            {(pm.nonRevenueUnit || pm.nonRevenueType) && (
                                <DetailSection title="Non-Revenue Status" icon={<AlertTriangle size={12} />} defaultOpen={false}>
                                    <Field label="Non-Revenue Unit" value={pm.nonRevenueUnit} />
                                    <Field label="Non-Revenue Type" value={pm.nonRevenueType} />
                                    <Field label="Non-Revenue Start" value={pm.nonRevenueStart} />
                                </DetailSection>
                            )}

                            {/* ───── RENTAL INFORMATION ───── */}
                            <DetailSection title="Rental Information" icon={<Home size={12} />}>
                                <Field label="Bedrooms" value={pm.bedrooms != null ? String(pm.bedrooms) : undefined} />
                                <Field label="Bathrooms" value={pm.bathrooms != null ? String(pm.bathrooms) : undefined} />
                                <Field label="Square Feet" value={pm.sqFt} />
                                <Field label="Market Rent" value={pm.marketRent} />
                                <Field label="Use Market Rent on Ads?" value={pm.useMarketRentOnAds} />
                                <Field label="Application Fee" value={pm.applicationFee ? `$${pm.applicationFee}` : undefined} />
                                <Field label="Security Deposit" value={pm.securityDeposit} />
                                <Field label="NSF Fee" value={pm.nsfFee ? `$${pm.nsfFee}` : undefined} />
                                <Field label="Last Inspection On" value={pm.lastInspection} />
                                <Field label="Rent Status" value={pm.rentStatus} />
                                <Field label="Legal Rent" value={pm.legalRent} />
                                <Field label="Preferential Rent" value={pm.preferentialRent} />
                                <Field label="Utilities Included" value={pm.utilitiesIncluded} />
                                <Field label="Appliances Included" value={pm.appliancesIncluded} />
                                <Field label="Additional Lease Information" value={pm.additionalLeaseInfo} />
                                <Field label="Listing Type" value={pm.listingType} />
                            </DetailSection>

                            {/* ───── AMENITIES ───── */}
                            {(pm.catsAllowed || pm.dogsAllowed || pm.amenities) && (
                                <DetailSection title="Amenities" icon={<Dog size={12} />} defaultOpen={false}>
                                    <Field label="Cats Allowed" value={pm.catsAllowed} />
                                    <Field label="Dogs Allowed" value={pm.dogsAllowed} />
                                    <Field label="Amenities" value={pm.amenities} full />
                                </DetailSection>
                            )}

                            {/* ───── MARKETING INFORMATION ───── */}
                            {(pm.postedToWebsite || pm.postedToInternet || pm.marketingDescription) && (
                                <DetailSection title="Marketing Information" icon={<Megaphone size={12} />} defaultOpen={false}>
                                    <Field label="Posted to Website" value={pm.postedToWebsite} />
                                    <Field label="Posted to Internet" value={pm.postedToInternet} />
                                    <Field label="Premium Listing" value={pm.premiumListing} />
                                    <Field label="Zillow Spotlight" value={pm.zillowSpotlight} />
                                    <Field label="Removed from Vacancies List" value={pm.removedFromVacanciesList} />
                                    <Field label="Available On" value={pm.availableOn} />
                                    <Field label="Marketing Title" value={pm.marketingTitle} />
                                    <Field label="Marketing Description" value={pm.marketingDescription} full />
                                    <Field label="Listing Type" value={pm.listingType} />
                                    <Field label="YouTube Video URL" value={pm.youtubeVideoUrl} />
                                </DetailSection>
                            )}

                            {/* ───── LEASE SETTINGS ───── */}
                            {pm.defaultLeaseGenerationMethod && (
                                <DetailSection title="Lease Settings" icon={<BookOpen size={12} />} defaultOpen={false}>
                                    <Field label="Default Lease Generation Method" value={pm.defaultLeaseGenerationMethod} full />
                                    {pm.leaseTemplates && (
                                        <>
                                            <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Default New Lease Templates</div>
                                                <Field label="Lease Template" value={pm.leaseTemplates.newLease?.leaseTemplate} />
                                                <Field label="Addenda Templates" value={pm.leaseTemplates.newLease?.addendaTemplates} />
                                                <Field label="Lease Attachments" value={pm.leaseTemplates.newLease?.leaseAttachments} />
                                            </div>
                                            <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Default Renewal Templates</div>
                                                <Field label="Lease Template" value={pm.leaseTemplates.renewal?.leaseTemplate} />
                                                <Field label="Addenda Templates" value={pm.leaseTemplates.renewal?.addendaTemplates} />
                                                <Field label="Lease Attachments" value={pm.leaseTemplates.renewal?.leaseAttachments} />
                                            </div>
                                        </>
                                    )}
                                    <Field label="Renewal Letter Template" value={pm.renewalLetterTemplate} full />
                                    {pm.renewalOptions?.length > 0 && (
                                        <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                                            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Renewal Options</div>
                                            <div className="s-table-wrap">
                                                <table className="s-table" style={{ fontSize: 12 }}>
                                                    <thead><tr><th>Term</th><th>Change by $</th><th>Additional Fee</th></tr></thead>
                                                    <tbody>
                                                        {pm.renewalOptions.map((opt: any, i: number) => (
                                                            <tr key={i}>
                                                                <td>{opt.term}</td>
                                                                <td>{opt.changeByDollar}</td>
                                                                <td>{opt.additionalFee}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </DetailSection>
                            )}

                            {/* ───── OWNERS & FINANCIALS ───── */}
                            {(pm.owners?.length > 0 || pm.distributions) && (
                                <DetailSection title="Owners and Financials" icon={<Landmark size={12} />} defaultOpen={false}>
                                    <Field label="Ownership Start Date" value={pm.ownershipStartDate} full />
                                    {pm.owners?.length > 0 && (
                                        <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                                            <div className="s-table-wrap">
                                                <table className="s-table" style={{ fontSize: 12 }}>
                                                    <thead><tr><th>Owner</th><th>% Owned</th><th>% Distributed</th><th>Contract Expiration</th></tr></thead>
                                                    <tbody>
                                                        {pm.owners.map((o: any, i: number) => (
                                                            <tr key={i}>
                                                                <td className="s-td-bold">{o.name}</td>
                                                                <td>{o.percentOwned}</td>
                                                                <td>{o.percentDistributed}</td>
                                                                <td>{o.contractExpiration || '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                    {pm.distributions && (
                                        <>
                                            <Field label="Payment Type" value={pm.distributions.paymentType} />
                                            <Field label="Reserve Funds" value={pm.distributions.reserveFunds} />
                                        </>
                                    )}
                                    <Field label="Vendor 1099 Payer" value={pm.vendor1099Payer} full />
                                    <Field label="Fiscal Year End" value={pm.fiscalYearEnd} />
                                </DetailSection>
                            )}

                            {/* ───── MANAGEMENT FEES ───── */}
                            {(pm.managementFee || pm.leaseFeePercent) && (
                                <DetailSection title="Management Fees" icon={<DollarSign size={12} />} defaultOpen={false}>
                                    <Field label="Management Fee" value={pm.managementFee} />
                                    <Field label="When Vacant" value={pm.managementFeeWhenVacant} />
                                    <Field label="Lease Fee Type" value={pm.leaseFeeType} />
                                    <Field label="Lease Fee Percent" value={pm.leaseFeePercent} />
                                    <Field label="Renewal Fee Type" value={pm.renewalFeeType} />
                                    <Field label="Renewal Fee Percent" value={pm.renewalFeePercent} />
                                </DetailSection>
                            )}

                            {/* ───── LATE FEE POLICY ───── */}
                            {pm.lateFeePolicy && (
                                <DetailSection title="Late Fee Policy" icon={<AlertTriangle size={12} />} defaultOpen={false}>
                                    <Field label="Effective On" value={pm.lateFeePolicy.effectiveOn} />
                                    <Field label="Base Amount" value={pm.lateFeePolicy.baseAmount} />
                                    <Field label="Eligible Charges" value={pm.lateFeePolicy.eligibleCharges} />
                                    <Field label="Daily Amount / Monthly Max" value={pm.lateFeePolicy.dailyAmountMonthlyMax} />
                                    <Field label="Grace Period" value={pm.lateFeePolicy.gracePeriod} />
                                    <Field label="Grace Balance" value={pm.lateFeePolicy.graceBalance} />
                                </DetailSection>
                            )}

                            {/* ───── BUDGETS ───── */}
                            {pm.budgets && (
                                <DetailSection title="Budgets" icon={<PieChart size={12} />} defaultOpen={false}>
                                    <Field label="Variance Threshold Amount ($)" value={pm.budgets.varianceThresholdAmount} />
                                    <Field label="Variance Threshold Percentage (%)" value={pm.budgets.varianceThresholdPercentage} />
                                </DetailSection>
                            )}

                            {/* ───── MAINTENANCE INFORMATION ───── */}
                            {(pm.maintenanceLimit || pm.hasHomeWarranty || pm.maintenanceNotes) && (
                                <DetailSection title="Maintenance Information" icon={<Wrench size={12} />} defaultOpen={false}>
                                    <Field label="Maintenance Limit" value={pm.maintenanceLimit} />
                                    <Field label="Insurance Expiration" value={pm.insuranceExpiration} />
                                    <Field label="Has Home Warranty Coverage" value={pm.hasHomeWarranty} />
                                    <Field label="Unit Entry Pre-authorized" value={pm.unitEntryPreauthorized} />
                                    <Field label="Maintenance Notes" value={pm.maintenanceNotes} full />
                                    <Field label="Online Maintenance Request Instructions" value={pm.onlineMaintenanceRequestInstructions} full />
                                </DetailSection>
                            )}

                            {/* ───── FIXED ASSETS ───── */}
                            {pm.fixedAssets?.length > 0 && (
                                <div className="s-glass-card">
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: expandedAssets === selected.id ? '1rem' : 0 }}
                                        onClick={() => setExpandedAssets(expandedAssets === selected.id ? null : selected.id)}
                                    >
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                                            <Wrench size={16} />
                                            Fixed Assets
                                            <span style={{ fontSize: '0.8rem', opacity: 0.6, fontWeight: 400 }}>({pm.fixedAssets.length})</span>
                                        </h3>
                                        {expandedAssets === selected.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </div>
                                    {expandedAssets === selected.id && (
                                        <div className="s-table-wrap">
                                            <table className="s-table">
                                                <thead>
                                                    <tr>
                                                        <th>Asset ID</th>
                                                        <th>Serial #</th>
                                                        <th>Type</th>
                                                        <th>Status</th>
                                                        <th>Placed in Service</th>
                                                        <th>Warranty Expiration</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pm.fixedAssets.map((a: any, i: number) => (
                                                        <tr key={i}>
                                                            <td style={{ color: 'var(--s-accent, #6366f1)' }}>{a.assetId}</td>
                                                            <td>{a.serialNumber || '—'}</td>
                                                            <td className="s-td-bold">{a.type}</td>
                                                            <td>
                                                                <span className={`s-badge ${a.status === 'Installed' ? 'active' : 'maintenance'}`}>{a.status}</span>
                                                            </td>
                                                            <td>{a.placedInService || '—'}</td>
                                                            <td>{a.warrantyExpiration || '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ───── PROPERTY GROUPS ───── */}
                            {pm.propertyGroups && (
                                <DetailSection title="Property Groups" icon={<Building2 size={12} />} defaultOpen={false}>
                                    <Field label="Property Groups" value={pm.propertyGroups} full />
                                </DetailSection>
                            )}

                            {/* ───── STATEMENT SETTINGS ───── */}
                            {pm.statementSettings && (
                                <DetailSection title="Statement Settings" icon={<Settings2 size={12} />} defaultOpen={false}>
                                    <Field label="Use Enhanced Statement" value={pm.statementSettings.useEnhancedStatement} />
                                    <Field label="Include Current & Upcoming Charges" value={pm.statementSettings.includeCurrentUpcomingCharges} />
                                    <Field label="Include Upcoming in Amount Due" value={pm.statementSettings.includeUpcomingChargesInAmountDue} />
                                    <Field label="Include Custom Message" value={pm.statementSettings.includeCustomMessage} />
                                    <Field label="Include Logo" value={pm.statementSettings.includeLogo} />
                                    <Field label="Charge History Includes" value={pm.statementSettings.chargeHistoryIncludes} />
                                    <Field label="Include Payment Due Date" value={pm.statementSettings.includePaymentDueDate} />
                                    <Field label="Include Payment History" value={pm.statementSettings.includePaymentHistoryAndBalanceForward} />
                                    <Field label="Show Remaining Past Due" value={pm.statementSettings.showRemainingAmountDuePastDue} />
                                    <Field label="Include Subsidized Charges" value={pm.statementSettings.includeSubsidizedCharges} />
                                </DetailSection>
                            )}

                            {/* ───── BANK ACCOUNTS ───── */}
                            {pm.bankAccounts?.length > 0 && (
                                <DetailSection title={`Bank Accounts (${pm.bankAccounts.length})`} icon={<CreditCard size={12} />} defaultOpen={false}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <div className="s-table-wrap">
                                            <table className="s-table" style={{ fontSize: 11 }}>
                                                <thead><tr><th>Cash GL Account</th><th>Bank Account</th><th>Enabled</th></tr></thead>
                                                <tbody>
                                                    {pm.bankAccounts.map((ba: any, i: number) => (
                                                        <tr key={i}>
                                                            <td className="s-td-bold" style={{ whiteSpace: 'nowrap' }}>{ba.glAccount}</td>
                                                            <td style={{ fontSize: 11, color: '#94a3b8' }}>
                                                                {ba.bankAccount}
                                                                {ba.purpose && (
                                                                    <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>({ba.purpose})</div>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <span style={{
                                                                    fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                                    background: ba.paymentsEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                                                                    color: ba.paymentsEnabled ? '#10b981' : '#64748b',
                                                                }}>{ba.paymentsEnabled ? 'Enabled' : 'Not Enabled'}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </DetailSection>
                            )}

                            {/* Turn Board */}
                            {hasPermission('strata:properties:turn-board') && units.length > 0 && (
                                <div className="s-glass-card">
                                    <h3 style={{ marginBottom: '1rem' }}>Turn Board</h3>
                                    <div className="s-turn-board">
                                        {[...units].sort((a, b) => {
                                            const numA = parseInt(String(a.unitNumber).replace(/\D/g, '')) || 0;
                                            const numB = parseInt(String(b.unitNumber).replace(/\D/g, '')) || 0;
                                            return numA - numB || String(a.unitNumber).localeCompare(String(b.unitNumber));
                                        }).map(u => (
                                            <div
                                                key={u.id}
                                                className="s-turn-cell"
                                                style={{
                                                    borderColor: getStatusColor(u.status),
                                                    cursor: 'pointer',
                                                    outline: selectedUnit?.id === u.id ? '2px solid var(--s-accent, #6366f1)' : 'none',
                                                    outlineOffset: -2,
                                                }}
                                                onClick={() => selectUnit(u)}
                                            >
                                                <div className="s-turn-unit">{u.unitNumber}</div>
                                                <div className="s-turn-status" style={{ color: getStatusColor(u.status) }}>{u.status}</div>
                                                {(u.rentAmount ?? 0) > 0 && <div className="s-turn-rent">${(u.rentAmount ?? 0).toLocaleString()}</div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Units Table — CLICKABLE ROWS */}
                            {hasPermission('strata:properties:units-table') && units.length > 0 && (
                                <div className="s-glass-card">
                                    <h3 style={{ marginBottom: '1rem' }}>
                                        Units
                                        <span style={{ fontSize: '0.8rem', opacity: 0.5, fontWeight: 400, marginLeft: 8 }}>
                                            Click a unit to view tenant details
                                        </span>
                                    </h3>
                                    <div className="s-table-wrap">
                                        <table className="s-table">
                                            <thead>
                                                <tr>
                                                    <th>Unit</th>
                                                    <th>Bed/Bath</th>
                                                    <th>Sq Ft</th>
                                                    <th>Rent</th>
                                                    <th>Status</th>
                                                    <th>Lease Dates</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...units].sort((a, b) => {
                                                    const numA = parseInt(String(a.unitNumber).replace(/\D/g, '')) || 0;
                                                    const numB = parseInt(String(b.unitNumber).replace(/\D/g, '')) || 0;
                                                    return numA - numB || String(a.unitNumber).localeCompare(String(b.unitNumber));
                                                }).map(u => (
                                                    <tr
                                                        key={u.id}
                                                        onClick={() => selectUnit(u)}
                                                        style={{
                                                            cursor: 'pointer',
                                                            background: selectedUnit?.id === u.id ? 'rgba(99,102,241,0.08)' : undefined,
                                                            borderLeft: selectedUnit?.id === u.id ? '3px solid #6366f1' : '3px solid transparent',
                                                            transition: 'all 0.15s ease',
                                                        }}
                                                        onMouseEnter={e => { if (selectedUnit?.id !== u.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                                        onMouseLeave={e => { if (selectedUnit?.id !== u.id) e.currentTarget.style.background = ''; }}
                                                    >
                                                        <td className="s-td-bold">{u.unitNumber}</td>
                                                        <td>{u.bedrooms ?? 0}bd / {u.bathrooms ?? 0}ba</td>
                                                        <td>{(u.sqFt ?? 0).toLocaleString()}</td>
                                                        <td>${(u.rentAmount ?? 0).toLocaleString()}</td>
                                                        <td><span className={`s-badge ${u.status}`}>{u.status}</span></td>
                                                        <td>{u.leaseStart && u.leaseEnd ? `${u.leaseStart} — ${u.leaseEnd}` : '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* ───── PHOTOS ───── */}
                            <DetailSection title={`Photos (${(Array.isArray(pm.photos) ? pm.photos : []).length})`} icon={<Camera size={12} />} defaultOpen={false}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    {/* Photo Grid */}
                                    {Array.isArray(pm.photos) && pm.photos.length > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                                            {pm.photos.map((photo: any) => (
                                                <div key={photo.id} style={{
                                                    position: 'relative', borderRadius: 8, overflow: 'hidden',
                                                    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)',
                                                }}>
                                                    <img
                                                        src={photo.dataUrl}
                                                        alt={photo.name}
                                                        style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                                                    />
                                                    <div style={{
                                                        padding: '4px 8px', fontSize: 10, color: '#94a3b8',
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    }}>{photo.name}</div>
                                                    <button
                                                        onClick={() => deletePhoto(photo.id)}
                                                        style={{
                                                            position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)',
                                                            border: 'none', color: '#ef4444', borderRadius: 4, padding: 3, cursor: 'pointer',
                                                        }}
                                                    ><Trash2 size={12} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Upload Area */}
                                    <label style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        padding: '16px 20px', border: '2px dashed rgba(99,102,241,0.25)',
                                        borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                                        color: '#818cf8', fontSize: 12, fontWeight: 600,
                                        background: 'rgba(99,102,241,0.04)',
                                    }}
                                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; }}
                                        onDragLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'; e.currentTarget.style.background = 'rgba(99,102,241,0.04)'; }}
                                        onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'; addPhotos(e.dataTransfer.files); }}
                                    >
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            style={{ display: 'none' }}
                                            onChange={(e) => addPhotos(e.target.files)}
                                        />
                                        {savingPhoto ? (
                                            <><RefreshCw size={14} className="spin" /> Uploading...</>
                                        ) : (
                                            <><Upload size={14} /> Drop photos here or click to upload</>
                                        )}
                                    </label>
                                </div>
                            </DetailSection>

                            {/* ───── NOTES ───── */}
                            <DetailSection title={`Notes (${(Array.isArray(pm.notes) ? pm.notes : []).length})`} icon={<StickyNote size={12} />} defaultOpen={false}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    {/* Add Note Form */}
                                    <div style={{
                                        marginBottom: 12, padding: '10px 14px', background: 'rgba(99,102,241,0.05)',
                                        borderRadius: 10, border: '1px solid rgba(99,102,241,0.15)',
                                    }}>
                                        <textarea
                                            value={newNoteText}
                                            onChange={(e) => setNewNoteText(e.target.value)}
                                            placeholder="Add a note..."
                                            style={{
                                                width: '100%', minHeight: 60, background: 'rgba(0,0,0,0.2)',
                                                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                                                padding: '8px 12px', color: '#e2e8f0', fontSize: 12,
                                                fontFamily: 'inherit', resize: 'vertical',
                                            }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                            <button
                                                onClick={addNote}
                                                disabled={!newNoteText.trim() || savingNote}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    padding: '6px 14px', borderRadius: 6,
                                                    background: newNoteText.trim() ? '#6366f1' : 'rgba(100,116,139,0.2)',
                                                    border: 'none', color: '#fff', fontSize: 11,
                                                    fontWeight: 600, cursor: newNoteText.trim() ? 'pointer' : 'not-allowed',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                {savingNote ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
                                                {savingNote ? 'Saving...' : 'Add Note'}
                                            </button>
                                        </div>
                                    </div>
                                    {/* Existing Notes */}
                                    {Array.isArray(pm.notes) && pm.notes.map((note: any) => (
                                        <div key={note.id} style={{ position: 'relative' }}>
                                            <NoteCard note={note} />
                                            <button
                                                onClick={() => deleteNote(note.id)}
                                                title="Delete note"
                                                style={{
                                                    position: 'absolute', top: 10, right: 10,
                                                    background: 'none', border: 'none', color: '#475569',
                                                    cursor: 'pointer', padding: 2, borderRadius: 4,
                                                    transition: 'color 0.15s',
                                                }}
                                                onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#ef4444'; }}
                                                onMouseLeave={(e) => { (e.target as HTMLElement).style.color = '#475569'; }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    {(!Array.isArray(pm.notes) || pm.notes.length === 0) && (
                                        <div style={{ textAlign: 'center', padding: '12px', color: '#475569', fontSize: 12 }}>
                                            No notes yet. Add one above.
                                        </div>
                                    )}
                                </div>
                            </DetailSection>

                            {/* ───── DYNAMIC SPACES & ENTITY LINKS ───── */}
                            <ProfileSpaces entityType="property" entityId={selected.id} />

                            {/* ───── AUDIT LOG ───── */}
                            {pm.auditLog?.length > 0 && (
                                <DetailSection title={`Audit Log (${pm.auditLog.length})`} icon={<History size={12} />} defaultOpen={false}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        {pm.auditLog.map((entry: any, i: number) => (
                                            <div key={i} style={{
                                                display: 'flex', gap: 10, padding: '6px 0',
                                                borderBottom: i < pm.auditLog.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                                fontSize: 12, alignItems: 'flex-start',
                                            }}>
                                                <div style={{ color: '#475569', fontSize: 11, whiteSpace: 'nowrap', minWidth: 120 }}>
                                                    {entry.date} {entry.time}
                                                </div>
                                                <div style={{ color: '#94a3b8', flex: 1 }}>{entry.action}</div>
                                                <div style={{ color: '#6366f1', fontSize: 11, whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                    {entry.user}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </DetailSection>
                            )}

                            {/* ───── ATTACHMENTS ───── */}
                            {pm.attachments?.length > 0 && (
                                <DetailSection title={`Attachments (${pm.attachments.length})`} icon={<Paperclip size={12} />} defaultOpen={false}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <div className="s-table-wrap">
                                            <table className="s-table" style={{ fontSize: 11 }}>
                                                <thead><tr><th>File</th><th>Uploaded By</th><th>Date</th></tr></thead>
                                                <tbody>
                                                    {pm.attachments.map((att: any, i: number) => (
                                                        <tr key={i}>
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                    <FileText size={13} color="#6366f1" />
                                                                    <span style={{ color: '#cbd5e1' }}>{att.name}</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ color: '#94a3b8' }}>{att.uploadedBy}</td>
                                                            <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{att.date}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </DetailSection>
                            )}

                            {/* ── Feature 3: Trello Notes ── */}
                            {propertyWorkitems.length > 0 && (
                                <div className="s-glass-card">
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: showTrelloNotes ? '1rem' : 0 }}
                                        onClick={() => setShowTrelloNotes(!showTrelloNotes)}
                                    >
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                                            <FileText size={16} />
                                            Trello Notes
                                            <span style={{ fontSize: '0.8rem', opacity: 0.6, fontWeight: 400 }}>({propertyWorkitems.length})</span>
                                        </h3>
                                        {showTrelloNotes ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </div>
                                    {showTrelloNotes && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {propertyWorkitems.map(wi => (
                                                <div
                                                    key={wi.id}
                                                    onClick={() => setExpandedWorkitem(wi)}
                                                    style={{
                                                        padding: '10px 14px',
                                                        background: 'rgba(255,255,255,0.02)',
                                                        borderRadius: 8,
                                                        border: '1px solid rgba(255,255,255,0.05)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s',
                                                    }}
                                                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.3)'; }}
                                                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.05)'; }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                        <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>{wi.title}</span>
                                                        <span className={`s-badge ${wi.status}`} style={{ fontSize: '0.6rem' }}>{wi.status}</span>
                                                        {wi.priority && (
                                                            <span style={{
                                                                fontSize: '0.6rem', padding: '1px 6px', borderRadius: 6,
                                                                background: wi.priority === 'high' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                                                                color: wi.priority === 'high' ? '#ef4444' : '#94a3b8',
                                                                fontWeight: 600, textTransform: 'uppercase',
                                                            }}>{wi.priority}</span>
                                                        )}
                                                    </div>
                                                    {wi.description && (
                                                        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5, maxHeight: 60, overflow: 'hidden' }}>
                                                            {wi.description.slice(0, 200)}{wi.description.length > 200 ? '…' : ''}
                                                        </p>
                                                    )}
                                                    {(wi.tags || []).length > 0 && (
                                                        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                                                            {wi.tags.map((tag, i) => (
                                                                <span key={i} style={{
                                                                    fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                                                    background: 'rgba(99,102,241,0.12)', color: '#a5b4fc',
                                                                }}>{tag}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div style={{ marginTop: 4, fontSize: 10, color: '#475569' }}>
                                                        {wi.domain} • {wi.type}
                                                        {(wi.metadata as any)?.trelloCardId && ' • via Trello'}
                                                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6366f1', fontWeight: 500 }}>Click to expand →</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Right column: Tenant detail panel ── */}
                        {selectedUnit && (
                            <div style={{
                                width: 380, minWidth: 340, flexShrink: 0,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 12, overflow: 'auto', padding: 16,
                                maxHeight: 'calc(100vh - 160px)',
                            }}>
                                {/* Unit header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>
                                            Unit {selectedUnit.unitNumber}
                                        </h3>
                                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                background: selectedUnit.status === 'occupied' ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)',
                                                color: selectedUnit.status === 'occupied' ? '#10b981' : '#3b82f6',
                                                textTransform: 'uppercase',
                                            }}>{selectedUnit.status}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setSelectedUnit(null); setMatchedTenant(null); }}
                                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                                    >×</button>
                                </div>

                                {/* Unit quick stats */}
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14,
                                    padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8,
                                    border: '1px solid rgba(255,255,255,0.04)',
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{selectedUnit.bedrooms ?? 0}/{selectedUnit.bathrooms ?? 0}</div>
                                        <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Bed/Bath</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{(selectedUnit.sqFt ?? 0).toLocaleString()}</div>
                                        <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Sq Ft</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>${(selectedUnit.rentAmount ?? 0).toLocaleString()}</div>
                                        <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Rent</div>
                                    </div>
                                </div>

                                {/* Tenant info */}
                                {matchedTenant ? (
                                    <>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
                                            padding: '10px 14px', background: 'rgba(99,102,241,0.06)', borderRadius: 10,
                                            border: '1px solid rgba(99,102,241,0.15)',
                                        }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: 'rgba(99,102,241,0.2)', color: '#818cf8',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 700, fontSize: 14,
                                            }}>
                                                {matchedTenant.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 15 }}>{matchedTenant.name}</div>
                                                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                                    <span style={{
                                                        padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                                                        background: matchedTenant.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                                                        color: matchedTenant.status === 'active' ? '#10b981' : '#64748b',
                                                        textTransform: 'uppercase',
                                                    }}>{matchedTenant.status}</span>
                                                    {md.tenantType && (
                                                        <span style={{
                                                            padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                                                            background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                                                        }}>{md.tenantType}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Contact */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, fontSize: 13, color: '#94a3b8' }}>
                                            {matchedTenant.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={13} color="#64748b" /> {matchedTenant.email}</div>}
                                            {matchedTenant.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={13} color="#64748b" /> {matchedTenant.phone}</div>}
                                        </div>

                                        {/* Lease & Property */}
                                        <DetailSection title="Lease & Property" icon={<Home size={12} />}>
                                            <Field label="Property" value={md.propertyName} full />
                                            <Field label="Unit" value={md.unit} />
                                            <Field label="Move-in" value={md.moveIn} />
                                            <Field label="Lease From" value={md.leaseFrom} />
                                            <Field label="Lease To" value={md.leaseTo} />
                                            <Field label="Last Lease Renewal" value={md.lastLeaseRenewal} />
                                            <Field label="Rent" value={md.rent ? `$${md.rent}` : undefined} />
                                            <Field label="Deposit" value={md.deposit ? `$${md.deposit}` : undefined} />
                                            <Field label="Unit Type" value={md.unitType} />
                                            <Field label="Birthdate" value={md.birthdate} />
                                        </DetailSection>

                                        {/* Rent Increases */}
                                        <DetailSection title="Rent Increases" icon={<DollarSign size={12} />} defaultOpen={false}>
                                            <Field label="Eligible for Rent Increase" value={md.eligibleForRentIncrease} />
                                            <Field label="Last Rent Increase" value={md.lastRentIncrease} />
                                            <Field label="Next Rent Increase Date" value={md.nextRentIncreaseDate} />
                                        </DetailSection>

                                        {/* Online Portal */}
                                        <DetailSection title="Online Portal" icon={<Globe size={12} />} defaultOpen={false}>
                                            <Field label="Portal Activated" value={md.onlinePortalActivated} />
                                            <Field label="Portal Login" value={md.onlinePortalLogin} full />
                                            <Field label="Recurring Payments Total" value={md.onlinePaymentsRecurringTotal} />
                                            <Field label="Send Rent Reminders" value={md.sendRentReminders} />
                                        </DetailSection>

                                        {/* Late Fees */}
                                        <DetailSection title="Late Fees & Charges" icon={<AlertTriangle size={12} />} defaultOpen={false}>
                                            <Field label="Late Fee Type" value={md.lateFeeType} />
                                            <Field label="Late Fee Base Amount" value={md.lateFeeBaseAmount ? `$${md.lateFeeBaseAmount}` : undefined} />
                                            <Field label="Grace Period" value={md.gracePeriod ? `${md.gracePeriod} days` : undefined} />
                                            <Field label="NSF Fee Amount" value={md.nsfFeeAmount ? `$${md.nsfFeeAmount}` : undefined} />
                                        </DetailSection>

                                        {/* Insurance */}
                                        <DetailSection title="Insurance" icon={<Shield size={12} />} defaultOpen={false}>
                                            <Field label="Provider" value={md.insuranceProvider} full />
                                            <Field label="Expiration" value={md.insuranceExpiration} />
                                            <Field label="Policy Number" value={md.insurancePolicyNumber} />
                                        </DetailSection>

                                        {/* Other */}
                                        <DetailSection title="Other" icon={<FileText size={12} />} defaultOpen={false}>
                                            <Field label="Primary Tenant" value={md.primaryTenant} />
                                            <Field label="License Plates" value={md.licensePlates} />
                                            <Field label="Pets" value={md.pets} />
                                            <Field label="Tenant Notes" value={md.tenantNotes} full />
                                        </DetailSection>
                                    </>
                                ) : (
                                    <div style={{
                                        padding: 24, textAlign: 'center', color: '#475569',
                                        background: 'rgba(255,255,255,0.02)', borderRadius: 10,
                                        border: '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        <User size={32} strokeWidth={1} style={{ marginBottom: 8, opacity: 0.5 }} />
                                        <p style={{ margin: 0, fontSize: 13 }}>
                                            {selectedUnit.status === 'vacant'
                                                ? 'This unit is currently vacant'
                                                : 'No tenant record found for this unit'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Trello Card Modal */}
            {
                expandedWorkitem && (
                    <TrelloCardModal workitem={expandedWorkitem} onClose={() => setExpandedWorkitem(null)} />
                )
            }

            {/* Delete Property Confirm */}
            {confirmDeleteProp && (
                <div className="s-modal-overlay" onClick={() => setConfirmDeleteProp(null)}>
                    <div className="s-modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: 380 }}>
                        <Trash2 size={32} style={{ color: '#f87171', marginBottom: 12 }} />
                        <h3 style={{ margin: '0 0 8px' }}>Delete Property?</h3>
                        <p className="s-text-muted" style={{ marginBottom: 20 }}>This will permanently remove the property and all associated data. This action cannot be undone.</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                            <button className="s-btn s-btn-ghost" onClick={() => setConfirmDeleteProp(null)}>Cancel</button>
                            <button className="s-btn" style={{ background: 'linear-gradient(135deg, #ef4444, #f87171)', color: '#fff', border: 'none' }}
                                onClick={() => handleDeleteProp(confirmDeleteProp)}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

