/**
 * IncidentModule — Dedicated Incident Reporting for Property Profiles
 *
 * Features:
 *   • Incident list with severity/status badges and property context
 *   • "Log Incident" form (category, severity, witnesses, police report #)
 *   • Detail panel with timeline + resolution workflow
 *   • "Generate Formal Report" button (copy-to-clipboard formatted text)
 *   • Property filter dropdown
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    AlertTriangle, Plus, X, RefreshCw, Search, Building2,
    Shield, Clock, FileText, ChevronDown, ChevronUp, Users,
    Camera, ClipboardCopy, CheckCircle2, AlertOctagon,
    Flame, Droplets, ShieldAlert, Car, User, Ban,
} from 'lucide-react';
import { strataGet, strataPost, strataPut, strataDelete } from '../strataApi';
import type { Property } from '../strataTypes';
import { useStrataNav } from '../StrataNavContext';
import { useToast } from '../useToast';

interface IncidentLog {
    id: string; propertyId: string; unitId: string | null;
    category: string; severity: string; title: string;
    description: string; reportedBy: string | null;
    reportedAt: string | null; witnesses: string[];
    policeReportNumber: string | null; insuranceClaimId: string | null;
    attachments: string[]; status: string; resolution: string | null;
    createdBy: string | null; createdAt: string; updatedAt: string;
}

const CATEGORIES = [
    { id: 'vehicle', label: 'Vehicle Incident', icon: <Car size={12} /> },
    { id: 'fire', label: 'Fire', icon: <Flame size={12} /> },
    { id: 'flood', label: 'Flood / Water Damage', icon: <Droplets size={12} /> },
    { id: 'theft', label: 'Theft / Burglary', icon: <ShieldAlert size={12} /> },
    { id: 'injury', label: 'Injury', icon: <User size={12} /> },
    { id: 'vandalism', label: 'Vandalism', icon: <Ban size={12} /> },
    { id: 'trespass', label: 'Trespassing', icon: <AlertOctagon size={12} /> },
    { id: 'other', label: 'Other', icon: <AlertTriangle size={12} /> },
];

const SEVERITY_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const STATUS_COLORS: Record<string, string> = {
    open: '#3b82f6', investigating: '#f59e0b', resolved: '#22c55e', closed: '#64748b',
};

export default function IncidentModule() {
    const { navigateToProperty, navigateToUnit } = useStrataNav();
    const { showToast, ToastContainer } = useToast();
    const [incidents, setIncidents] = useState<IncidentLog[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [selected, setSelected] = useState<IncidentLog | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterProperty, setFilterProperty] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [incData, propData] = await Promise.all([
                strataGet<IncidentLog[]>('/incidents'),
                strataGet<Property[]>('/properties'),
            ]);
            setIncidents(incData);
            setProperties(propData);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const propMap = useMemo(() => {
        const m = new Map<string, Property>();
        properties.forEach(p => m.set(p.id, p));
        return m;
    }, [properties]);

    const filtered = useMemo(() => {
        return incidents.filter(inc => {
            if (filterProperty !== 'all' && inc.propertyId !== filterProperty) return false;
            if (filterStatus !== 'all' && inc.status !== filterStatus) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return inc.title.toLowerCase().includes(q) ||
                    inc.description.toLowerCase().includes(q) ||
                    (inc.reportedBy || '').toLowerCase().includes(q);
            }
            return true;
        });
    }, [incidents, filterProperty, filterStatus, searchQuery]);

    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const witnesses = (fd.get('witnesses') as string || '').split(',').map(s => s.trim()).filter(Boolean);
        try {
            await strataPost('/incidents', {
                propertyId: fd.get('propertyId'),
                unitId: fd.get('unitId') || null,
                category: fd.get('category'),
                severity: fd.get('severity'),
                title: fd.get('title'),
                description: fd.get('description'),
                reportedBy: fd.get('reportedBy'),
                reportedAt: fd.get('reportedAt'),
                witnesses,
                policeReportNumber: fd.get('policeReportNumber') || null,
            });
            setShowForm(false);
            fetchData();
        } catch (err) { console.error(err); }
    };

    const updateStatus = async (id: string, status: string, resolution?: string) => {
        try {
            const updated = await strataPut<IncidentLog>(`/incidents/${id}`, { status, resolution });
            setSelected(updated);
            fetchData();
        } catch (err) { console.error(err); }
    };

    const generateReport = (inc: IncidentLog) => {
        const prop = propMap.get(inc.propertyId);
        const report = `
═══════════════════════════════════════════
       INCIDENT REPORT — FORMAL RECORD
═══════════════════════════════════════════

Report ID:     ${inc.id}
Date Filed:    ${new Date(inc.createdAt).toLocaleString()}
Status:        ${inc.status.toUpperCase()}

PROPERTY:      ${prop?.name || 'Unknown'}
ADDRESS:       ${prop?.address || 'N/A'}
UNIT:          ${inc.unitId || 'N/A'}

CATEGORY:      ${inc.category.toUpperCase()}
SEVERITY:      ${inc.severity.toUpperCase()}

TITLE:         ${inc.title}

DESCRIPTION:
${inc.description || 'No description provided.'}

REPORTED BY:   ${inc.reportedBy || 'Unknown'}
INCIDENT DATE: ${inc.reportedAt ? new Date(inc.reportedAt).toLocaleString() : 'N/A'}

WITNESSES:     ${inc.witnesses.length > 0 ? inc.witnesses.join(', ') : 'None recorded'}
POLICE REPORT: ${inc.policeReportNumber || 'N/A'}
INSURANCE:     ${inc.insuranceClaimId || 'N/A'}

RESOLUTION:
${inc.resolution || 'Pending resolution.'}

═══════════════════════════════════════════
Generated: ${new Date().toLocaleString()}
        `.trim();
        navigator.clipboard.writeText(report);
        showToast('Formal incident report copied to clipboard', 'success');
    };

    const getCategoryIcon = (cat: string) => CATEGORIES.find(c => c.id === cat)?.icon || <AlertTriangle size={12} />;

    // Stats
    const stats = useMemo(() => ({
        open: incidents.filter(i => i.status === 'open').length,
        investigating: incidents.filter(i => i.status === 'investigating').length,
        resolved: incidents.filter(i => i.status === 'resolved').length,
        total: incidents.length,
        highSeverity: incidents.filter(i => i.severity === 'high' && i.status !== 'closed').length,
    }), [incidents]);

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">
                        <AlertOctagon size={22} style={{ verticalAlign: -4, marginRight: 8, color: '#ef4444' }} />
                        Incident Reporting
                    </h2>
                    <p className="s-module-subtitle">
                        {stats.open} open, {stats.investigating} investigating, {stats.resolved} resolved — {stats.total} total
                        {stats.highSeverity > 0 && <span style={{ color: '#ef4444', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4 }}><AlertTriangle size={12} aria-hidden /> {stats.highSeverity} high severity</span>}
                    </p>
                </div>
                <div className="s-module-actions">
                    <button className="s-btn s-btn-ghost" onClick={fetchData}><RefreshCw size={14} /></button>
                    <button className="s-btn s-btn-primary" onClick={() => setShowForm(true)}>
                        <Plus size={14} /> Log Incident
                    </button>
                </div>
            </div>

            {/* Stats bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                    { label: 'Open', count: stats.open, color: '#3b82f6' },
                    { label: 'Investigating', count: stats.investigating, color: '#f59e0b' },
                    { label: 'Resolved', count: stats.resolved, color: '#22c55e' },
                    { label: 'High Severity', count: stats.highSeverity, color: '#ef4444' },
                ].map(s => (
                    <div key={s.label} style={{
                        padding: '8px 16px', borderRadius: 8,
                        background: `${s.color}08`, border: `1px solid ${s.color}20`,
                        textAlign: 'center', minWidth: 90,
                    }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.count}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                    background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)', flex: 1, maxWidth: 280,
                }}>
                    <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search incidents…"
                        style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 11, outline: 'none' }} />
                </div>
                <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', outline: 'none' }}>
                    <option value="all">All Properties</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', outline: 'none' }}>
                    <option value="all">All Status</option>
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                </select>
            </div>

            {/* Main content: list + detail */}
            <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 16 }}>
                {/* Incident list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {loading ? <div className="s-loading">Loading incidents…</div> :
                        filtered.length === 0 ? (
                            <div className="s-glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                <AlertTriangle size={40} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 12 }} />
                                <p style={{ margin: 0, fontSize: 14 }}>No incidents recorded</p>
                            </div>
                        ) : filtered.map(inc => {
                            const prop = propMap.get(inc.propertyId);
                            return (
                                <div key={inc.id}
                                    onClick={() => setSelected(inc)}
                                    style={{
                                        padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                                        background: selected?.id === inc.id ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${selected?.id === inc.id ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(255,255,255,0.04)'}`,
                                        borderLeft: `3px solid ${SEVERITY_COLORS[inc.severity] || '#64748b'}`,
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { if (selected?.id !== inc.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                    onMouseLeave={e => { if (selected?.id !== inc.id) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <span style={{ color: SEVERITY_COLORS[inc.severity] }}>{getCategoryIcon(inc.category)}</span>
                                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{inc.title}</span>
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                            background: `${STATUS_COLORS[inc.status]}15`,
                                            color: STATUS_COLORS[inc.status], textTransform: 'uppercase',
                                        }}>{inc.status}</span>
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                            background: `${SEVERITY_COLORS[inc.severity]}15`,
                                            color: SEVERITY_COLORS[inc.severity], textTransform: 'uppercase',
                                        }}>{inc.severity}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
                                        {prop && <span><Building2 size={9} style={{ verticalAlign: -1 }} /> <button className="s-property-link" style={{ fontSize: 10 }} onClick={(e) => { e.stopPropagation(); navigateToProperty(inc.propertyId); }}>{prop.name}</button></span>}
                                        <span><Clock size={9} style={{ verticalAlign: -1 }} /> {new Date(inc.createdAt).toLocaleDateString()}</span>
                                        {inc.reportedBy && <span><User size={9} style={{ verticalAlign: -1 }} /> {inc.reportedBy}</span>}
                                    </div>
                                </div>
                            );
                        })}
                </div>

                {/* Detail panel */}
                {selected && (
                    <div className="s-glass-card" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: 0 }}>
                        {/* Header */}
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                            background: `${SEVERITY_COLORS[selected.severity]}08`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ color: SEVERITY_COLORS[selected.severity] }}>{getCategoryIcon(selected.category)}</span>
                                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)', flex: 1 }}>{selected.title}</h3>
                                <button className="s-btn s-btn-ghost" onClick={() => setSelected(null)}><X size={14} /></button>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${STATUS_COLORS[selected.status]}15`, color: STATUS_COLORS[selected.status], fontWeight: 700, textTransform: 'uppercase' }}>{selected.status}</span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${SEVERITY_COLORS[selected.severity]}15`, color: SEVERITY_COLORS[selected.severity], fontWeight: 700, textTransform: 'uppercase' }}>{selected.severity} severity</span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>{selected.category}</span>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '16px 20px', maxHeight: 500, overflowY: 'auto' }}>
                            {/* Property */}
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Property</label>
                                <button className="s-property-link" style={{ fontSize: 13 }} onClick={() => navigateToProperty(selected.propertyId)}>{propMap.get(selected.propertyId)?.name || selected.propertyId}</button>
                                {selected.unitId && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>Unit: <button className="s-unit-link" style={{ fontSize: 11 }} onClick={() => navigateToUnit(selected.unitId!, selected.propertyId)}>{selected.unitId}</button></span>}
                            </div>

                            {/* Description */}
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Description</label>
                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                    {selected.description || 'No description provided.'}
                                </p>
                            </div>

                            {/* Details grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                <div>
                                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Reported By</label>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selected.reportedBy || '—'}</span>
                                </div>
                                <div>
                                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Incident Date</label>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selected.reportedAt ? new Date(selected.reportedAt).toLocaleString() : '—'}</span>
                                </div>
                                <div>
                                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Police Report #</label>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selected.policeReportNumber || '—'}</span>
                                </div>
                                <div>
                                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Insurance Claim</label>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selected.insuranceClaimId || '—'}</span>
                                </div>
                            </div>

                            {/* Witnesses */}
                            {selected.witnesses.length > 0 && (
                                <div style={{ marginBottom: 14 }}>
                                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                                        <Users size={10} style={{ verticalAlign: -1, marginRight: 4 }} /> Witnesses
                                    </label>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {selected.witnesses.map((w, i) => (
                                            <span key={i} style={{
                                                padding: '2px 8px', borderRadius: 4, fontSize: 11,
                                                background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                            }}>{w}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Resolution */}
                            {selected.resolution && (
                                <div style={{ marginBottom: 14 }}>
                                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Resolution</label>
                                    <p style={{ margin: 0, fontSize: 12, color: '#22c55e', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                        {selected.resolution}
                                    </p>
                                </div>
                            )}

                            {/* Timestamps */}
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', gap: 12, marginBottom: 16, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10 }}>
                                <span>Created: {new Date(selected.createdAt).toLocaleString()}</span>
                                <span>Updated: {new Date(selected.updatedAt).toLocaleString()}</span>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {selected.status === 'open' && (
                                    <button className="s-btn s-btn-ghost" onClick={() => updateStatus(selected.id, 'investigating')}
                                        style={{ borderColor: 'rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                                        <Search size={11} /> Begin Investigation
                                    </button>
                                )}
                                {['open', 'investigating'].includes(selected.status) && (
                                    <button className="s-btn s-btn-ghost" onClick={() => {
                                        const res = prompt('Enter resolution notes:');
                                        if (res) updateStatus(selected.id, 'resolved', res);
                                    }} style={{ borderColor: 'rgba(16,185,129,0.3)', color: '#22c55e' }}>
                                        <CheckCircle2 size={11} /> Resolve
                                    </button>
                                )}
                                {selected.status === 'resolved' && (
                                    <button className="s-btn s-btn-ghost" onClick={() => updateStatus(selected.id, 'closed')}
                                        style={{ borderColor: 'rgba(100,116,139,0.3)', color: 'var(--text-tertiary)' }}>
                                        <X size={11} /> Close
                                    </button>
                                )}
                                <button className="s-btn s-btn-ghost" onClick={() => generateReport(selected)}
                                    style={{ borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)', color: 'var(--accent)' }}>
                                    <ClipboardCopy size={11} /> Copy Formal Report
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ LOG INCIDENT MODAL ═══ */}
            {showForm && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }} onClick={() => setShowForm(false)}>
                    <form onSubmit={handleCreate} onClick={e => e.stopPropagation()} style={{
                        background: '#0f172a', borderRadius: 12, padding: 24,
                        border: '1px solid rgba(255,255,255,0.1)',
                        width: 480, maxHeight: '85vh', overflowY: 'auto',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                                <AlertOctagon size={18} style={{ verticalAlign: -3, marginRight: 8, color: '#ef4444' }} />
                                Log Incident
                            </h3>
                            <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowForm(false)}><X size={14} /></button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label className="s-label">Property *</label>
                                <select name="propertyId" required className="s-input">
                                    <option value="">Select property…</option>
                                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="s-label">Category *</label>
                                <select name="category" required className="s-input">
                                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="s-label">Severity *</label>
                                <select name="severity" required className="s-input">
                                    <option value="high">High</option>
                                    <option value="medium" selected>Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label className="s-label">Title *</label>
                                <input name="title" required className="s-input" placeholder="Brief incident title…" />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label className="s-label">Description</label>
                                <textarea name="description" className="s-input" rows={4} placeholder="Detailed description of the incident…"
                                    style={{ resize: 'vertical' }} />
                            </div>
                            <div>
                                <label className="s-label">Reported By</label>
                                <input name="reportedBy" className="s-input" placeholder="Name" />
                            </div>
                            <div>
                                <label className="s-label">Incident Date/Time</label>
                                <input name="reportedAt" type="datetime-local" className="s-input" />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label className="s-label">Witnesses (comma-separated)</label>
                                <input name="witnesses" className="s-input" placeholder="John Smith, Jane Doe" />
                            </div>
                            <div>
                                <label className="s-label">Police Report #</label>
                                <input name="policeReportNumber" className="s-input" placeholder="Optional" />
                            </div>
                            <div>
                                <label className="s-label">Unit # (if applicable)</label>
                                <input name="unitId" className="s-input" placeholder="Optional" />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                            <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                            <button type="submit" className="s-btn s-btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444' }}>
                                <AlertOctagon size={13} /> Log Incident
                            </button>
                        </div>
                    </form>
                </div>
            )}
            <ToastContainer />
        </div>
    );
}
