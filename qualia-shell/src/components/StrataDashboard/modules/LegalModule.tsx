import { getAuthToken } from '../../../context/UserContext';
import { useState, useEffect, useCallback } from 'react';
import {
    Scale, Plus, X, ChevronDown, ChevronUp, RefreshCw, AlertTriangle,
    Building2, Users, Tag, FileText, Clock, Search, Lock, Shield,
    MessageSquare, Paperclip, History, Link2, Send, ArrowUpCircle, XCircle, Download, Globe,
} from 'lucide-react';
import { strataGet, strataPost, strataPut } from '../strataApi';
import type { Workitem, Property, EntityProfile } from '../strataTypes';
import { LoadingState, ErrorState } from '../StateView';

interface DwelliumUser {
    id: string;
    name: string;
    email: string;
    role: string;
}

/* ── Tag Autocomplete ── */
function TagInput({ suggestions, selected, onAdd, onRemove, placeholder }: {
    suggestions: string[]; selected: string[]; onAdd: (tag: string) => void;
    onRemove: (tag: string) => void; placeholder: string;
}) {
    const [query, setQuery] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const filtered = suggestions.filter(s =>
        s.toLowerCase().includes(query.toLowerCase()) && !selected.includes(s)
    ).slice(0, 8);

    return (
        <div style={{ position: 'relative' }}>
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 10px',
                background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)', minHeight: 36,
                alignItems: 'center',
            }}>
                {selected.map(tag => (
                    <span key={tag} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)',
                    }}>
                        {tag}
                        <span onClick={() => onRemove(tag)} style={{ cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</span>
                    </span>
                ))}
                <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder={selected.length === 0 ? placeholder : ''}
                    style={{
                        flex: 1, minWidth: 80, background: 'none', border: 'none',
                        color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                    }}
                />
            </div>
            {showDropdown && filtered.length > 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: 'rgba(20,22,36,0.98)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, marginTop: 4, maxHeight: 180, overflow: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                    {filtered.map(s => (
                        <div
                            key={s}
                            onMouseDown={() => { onAdd(s); setQuery(''); }}
                            style={{
                                padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)',
                                cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 10%, transparent)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}
                        >{s}</div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function LegalModule() {
    const [items, setItems] = useState<Workitem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [activeTab, setActiveTab] = useState<string>('details');
    const [comments, setComments] = useState<any[]>([]);
    const [matterLinks, setMatterLinks] = useState<any>(null);
    const [commentText, setCommentText] = useState('');
    const [isPrivileged, setIsPrivileged] = useState(false);

    // Tag autocomplete data
    const [properties, setProperties] = useState<Property[]>([]);
    const [tenants, setTenants] = useState<EntityProfile[]>([]);
    const propertyNames = properties.map(p => `Property: ${p.name}`);
    const tenantNames = tenants.slice(0, 200).map(t => `Tenant: ${t.name}`);
    const allTagSuggestions = [...propertyNames, ...tenantNames];

    // New issue form state
    const [formTags, setFormTags] = useState<string[]>([]);

    // Access control state
    const [users, setUsers] = useState<DwelliumUser[]>([]);
    const [formAccessList, setFormAccessList] = useState<string[]>([]); // user IDs
    const [currentUserId, setCurrentUserId] = useState<string>('');
    const userSuggestions = users.map(u => `${u.name} (${u.email})`);
    const userNameToId = new Map(users.map(u => [`${u.name} (${u.email})`, u.id]));
    const userIdToLabel = new Map(users.map(u => [u.id, `${u.name} (${u.email})`]));

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [wi, props, ents] = await Promise.all([
                strataGet<Workitem[]>('/workitems', { domain: 'legal', limit: '500' }),
                strataGet<Property[]>('/properties'),
                strataGet<EntityProfile[]>('/entities', { type: 'tenant', limit: '300' }),
            ]);
            setItems(wi);
            setProperties(props);
            setTenants(ents);
        } catch (e) { console.error(e); setError('Failed to load legal issues'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Fetch users for access control picker + current user
    useEffect(() => {
        const token = getAuthToken();
        if (!token) return;
        // Get current user
        fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => { if (data.user?.id) setCurrentUserId(data.user.id); })
            .catch(() => { });
        // Get all users
        fetch('/api/auth/users?limit=100', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setUsers(data); })
            .catch(() => { });
    }, []);

    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // Build access list — always include the current user
        const accessList = [...new Set([...formAccessList, currentUserId].filter(Boolean))];
        try {
            await strataPost('/workitems', {
                type: 'task',
                title: fd.get('title'),
                description: fd.get('description'),
                priority: fd.get('priority'),
                domain: 'legal',
                status: 'open',
                tags: formTags,
                metadata: {
                    legalType: fd.get('legalType'),
                    accessList: accessList.length > 0 ? accessList : undefined,
                },
            });
            setShowForm(false);
            setFormTags([]);
            setFormAccessList([]);
            fetchAll();
        } catch (err) { console.error(err); }
    };

    const loadMatterData = async (id: string) => {
        try {
            const [c, l] = await Promise.all([
                strataGet<any[]>(`/legal/${id}/comments`),
                strataGet<any>(`/legal/${id}/links`),
            ]);
            setComments(c); setMatterLinks(l);
        } catch { setComments([]); setMatterLinks(null); }
    };

    const handleAddComment = async (matterId: string) => {
        if (!commentText.trim()) return;
        try {
            await strataPost(`/legal/${matterId}/comments`, { body: commentText, isPrivileged });
            setCommentText(''); setIsPrivileged(false);
            const c = await strataGet<any[]>(`/legal/${matterId}/comments`);
            setComments(c);
        } catch (err) { console.error(err); }
    };

    const handleEscalate = async (matterId: string) => {
        const reason = prompt('Escalation reason:');
        if (!reason) return;
        try {
            await strataPost(`/legal/${matterId}/comments`, { body: `[ESCALATION] ${reason}`, isPrivileged: true });
            fetchAll();
        } catch (err) { console.error(err); }
    };

    const handleClose = async (matterId: string) => {
        const resolution = prompt('Resolution summary:');
        if (!resolution) return;
        try {
            await strataPut(`/workitems/${matterId}`, { status: 'completed' });
            await strataPost(`/legal/${matterId}/comments`, { body: `[CLOSED] ${resolution}` });
            fetchAll();
        } catch (err) { console.error(err); }
    };

    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            await strataPut(`/workitems/${id}`, { status: newStatus });
            fetchAll();
        } catch (e) { console.error(e); }
    };

    const filtered = items.filter(wi => {
        if (statusFilter !== 'all' && wi.status !== statusFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                wi.title.toLowerCase().includes(q) ||
                (wi.description || '').toLowerCase().includes(q) ||
                wi.tags.some(t => t.toLowerCase().includes(q))
            );
        }
        return true;
    });

    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'high': return '#ef4444';
            case 'medium': return '#f59e0b';
            case 'low': return '#22c55e';
            default: return '#64748b';
        }
    };

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">
                        <Scale size={22} style={{ verticalAlign: -4, marginRight: 8, color: '#f59e0b' }} />
                        Legal Issues
                    </h2>
                    <p className="s-module-subtitle">{filtered.length} issue{filtered.length !== 1 ? 's' : ''} tracked</p>
                </div>
                <div className="s-module-actions">
                    <button className="s-btn s-btn-ghost" onClick={fetchAll}><RefreshCw size={14} /></button>
                    <button className="s-btn s-btn-primary" onClick={() => setShowForm(true)}>
                        <Plus size={14} /> New Legal Issue
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', background: 'rgba(255,255,255,0.04)',
                    borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                    flex: 1, maxWidth: 300,
                }}>
                    <Search size={14} style={{ color: 'var(--text-tertiary)' }} />
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search issues or tags…"
                        style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                    />
                </div>
                {['all', 'open', 'in_progress', 'review', 'completed'].map(s => (
                    <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        style={{
                            padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                            border: statusFilter === s ? '1px solid color-mix(in srgb, var(--accent) 50%, transparent)' : '1px solid rgba(255,255,255,0.08)',
                            background: statusFilter === s ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'rgba(255,255,255,0.03)',
                            color: statusFilter === s ? '#D6FE51' : '#64748b',
                            cursor: 'pointer', textTransform: 'capitalize',
                        }}
                    >{s.replace('_', ' ')}</button>
                ))}
            </div>

            {/* Legal Issues List */}
            {loading ? (
                <LoadingState message="Loading legal issues…" />
            ) : error ? (
                <ErrorState message={error} onRetry={fetchAll} />
            ) : filtered.length === 0 ? (
                <div className="s-glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    <Scale size={40} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>
                        {items.length === 0 ? 'No legal issues tracked yet. Create your first one!' : 'No issues match your search.'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filtered.map(wi => {
                        const expanded = expandedId === wi.id;
                        return (
                            <div
                                key={wi.id}
                                className="s-glass-card"
                                style={{
                                    padding: 0, overflow: 'hidden',
                                    borderLeft: `3px solid ${getPriorityColor(wi.priority)}`,
                                }}
                            >
                                <div
                                    onClick={() => setExpandedId(expanded ? null : wi.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '12px 16px', cursor: 'pointer',
                                    }}
                                >
                                    <AlertTriangle size={16} style={{ color: getPriorityColor(wi.priority), flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{wi.title}</span>
                                            {(wi.metadata as any)?.accessList?.length > 0 && (
                                                <span title="Restricted access"><Lock size={12} style={{ color: '#f59e0b', flexShrink: 0 }} /></span>
                                            )}
                                        </div>
                                        {wi.tags.length > 0 && (
                                            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                                {wi.tags.map((tag, i) => (
                                                    <span key={i} style={{
                                                        fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                        background: tag.startsWith('Property:') ? 'rgba(59,130,246,0.12)' :
                                                            tag.startsWith('Tenant:') ? 'rgba(16,185,129,0.12)' :
                                                                'color-mix(in srgb, var(--accent) 12%, transparent)',
                                                        color: tag.startsWith('Property:') ? '#60a5fa' :
                                                            tag.startsWith('Tenant:') ? '#22c55e' :
                                                                '#D6FE51',
                                                    }}>
                                                        {tag.startsWith('Property:') ? <Building2 size={9} style={{ verticalAlign: -1, marginRight: 3 }} /> :
                                                            tag.startsWith('Tenant:') ? <Users size={9} style={{ verticalAlign: -1, marginRight: 3 }} /> :
                                                                <Tag size={9} style={{ verticalAlign: -1, marginRight: 3 }} />}
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <span className={`s-badge ${wi.status}`} style={{ fontSize: '0.65rem', flexShrink: 0 }}>{wi.status.replace('_', ' ')}</span>
                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                        {new Date(wi.createdAt).toLocaleDateString()}
                                    </span>
                                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </div>

                                {expanded && (
                                    <div style={{ padding: '0 16px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                                        {/* Tab bar */}
                                        <div style={{ display: 'flex', gap: 2, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 10 }}>
                                            {[
                                                { key: 'details', icon: <FileText size={11} />, label: 'Details' },
                                                { key: 'comments', icon: <MessageSquare size={11} />, label: 'Comments' },
                                                { key: 'evidence', icon: <Paperclip size={11} />, label: 'Evidence' },
                                                { key: 'history', icon: <History size={11} />, label: 'History' },
                                                { key: 'links', icon: <Link2 size={11} />, label: 'Links' },
                                            ].map(t => (
                                                <button key={t.key} onClick={() => { setActiveTab(t.key); if (t.key !== 'details') loadMatterData(wi.id); }}
                                                    style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, border: 'none', background: activeTab === t.key ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', color: activeTab === t.key ? '#D6FE51' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    {t.icon} {t.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Details Tab */}
                                        {activeTab === 'details' && (<>
                                            {wi.description && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{wi.description}</p>}
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                <span><Clock size={11} style={{ verticalAlign: -2 }} /> Created: {new Date(wi.createdAt).toLocaleString()}</span>
                                                {wi.dueDate && <span>Due: {wi.dueDate}</span>}
                                                {(wi.metadata as any)?.legalType && <span>Type: {(wi.metadata as any).legalType}</span>}
                                            </div>
                                            {(wi.metadata as any)?.accessList?.length > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', marginBottom: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, flexWrap: 'wrap' }}>
                                                    <Shield size={13} style={{ color: '#f59e0b' }} />
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b' }}>Restricted:</span>
                                                    {((wi.metadata as any).accessList as string[]).map((uid: string) => (
                                                        <span key={uid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>{userIdToLabel.get(uid) || uid.slice(0, 8) + '…'}</span>
                                                    ))}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: '24px' }}>Status:</span>
                                                {['open', 'in_progress', 'review', 'completed'].map(s => (
                                                    <button key={s} onClick={() => handleStatusChange(wi.id, s)} disabled={wi.status === s}
                                                        style={{ padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: wi.status === s ? '#D6FE51' : '#94a3b8', cursor: wi.status === s ? 'default' : 'pointer', textTransform: 'capitalize', opacity: wi.status === s ? 0.6 : 1 }}
                                                    >{s.replace('_', ' ')}</button>
                                                ))}
                                            </div>
                                            {/* Action buttons */}
                                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                                <button onClick={() => handleEscalate(wi.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><ArrowUpCircle size={11} /> Escalate</button>
                                                <button onClick={() => handleClose(wi.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.08)', color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={11} /> Close</button>
                                            </div>
                                        </>)}

                                        {/* Comments Tab */}
                                        {activeTab === 'comments' && (
                                            <div>
                                                {comments.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No comments yet</p> : comments.map(c => (
                                                    <div key={c.id} style={{ padding: '8px 10px', borderRadius: 6, marginBottom: 4, background: c.isPrivileged ? 'rgba(245,158,11,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${c.isPrivileged ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)'}` }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                                                            <span style={{ fontWeight: 600 }}>{c.author}</span>
                                                            <span>{new Date(c.createdAt).toLocaleString()}</span>
                                                        </div>
                                                        {c.isPrivileged && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700, marginBottom: 4, display: 'inline-block' }}>PRIVILEGED</span>}
                                                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{c.body}</p>
                                                    </div>
                                                ))}
                                                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                                                    <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add comment…" style={{ flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', outline: 'none' }} />
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#f59e0b', cursor: 'pointer' }}>
                                                        <input type="checkbox" checked={isPrivileged} onChange={e => setIsPrivileged(e.target.checked)} style={{ width: 12, height: 12 }} /> Privileged
                                                    </label>
                                                    <button onClick={() => handleAddComment(wi.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><Send size={10} /> Send</button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Evidence Tab */}
                                        {activeTab === 'evidence' && (
                                            <div>
                                                {(matterLinks?.evidence || []).length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No evidence attached</p> : (matterLinks.evidence as any[]).map((ev: any) => (
                                                    <div key={ev.id} style={{ padding: '6px 10px', borderRadius: 6, marginBottom: 3, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                                                        <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, fontWeight: 700, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', textTransform: 'uppercase' }}>{ev.type}</span>
                                                        <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{ev.description}</span>
                                                        <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{new Date(ev.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* History Tab */}
                                        {activeTab === 'history' && (
                                            <div>
                                                {(matterLinks?.decisions || []).length > 0 && (<>
                                                    <h5 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 6px' }}>Decisions</h5>
                                                    {(matterLinks.decisions as any[]).map((d: any) => (
                                                        <div key={d.id} style={{ padding: '6px 10px', borderRadius: 6, marginBottom: 3, background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.1)', fontSize: 11 }}>
                                                            <span style={{ fontWeight: 600, color: '#22c55e' }}>{d.decision_type}</span> — <span style={{ color: 'var(--text-secondary)' }}>{d.rationale}</span>
                                                            <span style={{ float: 'right', fontSize: 10, color: 'var(--text-tertiary)' }}>{d.decided_by} · {new Date(d.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                    ))}
                                                </>)}
                                                <h5 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', margin: '8px 0 6px' }}>Audit Trail</h5>
                                                {(matterLinks?.auditTrail || []).length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No audit entries</p> : (matterLinks.auditTrail as any[]).map((a: any, i: number) => (
                                                    <div key={i} style={{ padding: '4px 10px', borderRadius: 4, marginBottom: 2, background: 'rgba(255,255,255,0.02)', fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                                                        <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{a.action}</span>
                                                        <span style={{ flex: 1 }}>{a.userId}</span>
                                                        <span style={{ color: 'var(--text-tertiary)' }}>{new Date(a.createdAt).toLocaleString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Links Tab */}
                                        {activeTab === 'links' && (
                                            <div>
                                                {[
                                                    { key: 'incidents', label: 'Incidents', items: matterLinks?.incidents, render: (i: any) => `${i.title} (${i.severity} · ${i.status})` },
                                                    { key: 'policies', label: 'Insurance Policies', items: matterLinks?.policies, render: (p: any) => `${p.policyType} — ${p.carrier || 'N/A'} (exp: ${p.expirationDate || 'N/A'})` },
                                                    { key: 'complianceItems', label: 'Compliance', items: matterLinks?.complianceItems, render: (c: any) => `${c.label} (${c.status})` },
                                                    { key: 'relatedMatters', label: 'Related Matters', items: matterLinks?.relatedMatters, render: (m: any) => `${m.title} (${m.status})` },
                                                ].map(section => (
                                                    <div key={section.key} style={{ marginBottom: 10 }}>
                                                        <h5 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 4px' }}>{section.label} ({(section.items || []).length})</h5>
                                                        {(section.items || []).length === 0 ? <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: 0 }}>None linked</p> : (section.items as any[]).map((item: any) => (
                                                            <div key={item.id} style={{ padding: '4px 10px', borderRadius: 4, marginBottom: 2, background: 'rgba(255,255,255,0.02)', fontSize: 10, color: 'var(--text-secondary)' }}>{section.render(item)}</div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create Legal Issue Modal */}
            {showForm && (
                <div className="s-modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="s-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="s-modal-header">
                            <h3><Scale size={18} style={{ verticalAlign: -3, marginRight: 8 }} /> New Legal Issue</h3>
                            <button className="s-btn-icon" onClick={() => { setShowForm(false); setFormTags([]); }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div className="s-form-group">
                                <label>Issue Title</label>
                                <input name="title" required placeholder="e.g. Eviction proceedings — Unit B3" className="s-input" />
                            </div>
                            <div className="s-form-group">
                                <label>Description</label>
                                <textarea name="description" rows={4} placeholder="Describe the legal issue…" className="s-input" style={{ resize: 'vertical' }} />
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Priority</label>
                                    <select name="priority" className="s-input">
                                        <option value="high">High</option>
                                        <option value="medium" selected>Medium</option>
                                        <option value="low">Low</option>
                                    </select>
                                </div>
                                <div className="s-form-group">
                                    <label>Legal Type</label>
                                    <select name="legalType" className="s-input">
                                        <option value="eviction">Eviction</option>
                                        <option value="lease_dispute">Lease Dispute</option>
                                        <option value="property_damage">Property Damage</option>
                                        <option value="insurance_claim">Insurance Claim</option>
                                        <option value="compliance">Compliance</option>
                                        <option value="tenant_complaint">Tenant Complaint</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>
                            <div className="s-form-group">
                                <label>Tags (Properties & Tenants)</label>
                                <TagInput
                                    suggestions={allTagSuggestions}
                                    selected={formTags}
                                    onAdd={tag => setFormTags(prev => [...prev, tag])}
                                    onRemove={tag => setFormTags(prev => prev.filter(t => t !== tag))}
                                    placeholder="Type to search properties or tenants…"
                                />
                            </div>
                            {/* Access Control */}
                            <div className="s-form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Lock size={14} style={{ color: '#f59e0b' }} />
                                    Access Control
                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>(only selected users can view this issue)</span>
                                </label>
                                <TagInput
                                    suggestions={userSuggestions}
                                    selected={formAccessList.map(id => userIdToLabel.get(id) || id)}
                                    onAdd={label => {
                                        const uid = userNameToId.get(label);
                                        if (uid && !formAccessList.includes(uid)) {
                                            setFormAccessList(prev => [...prev, uid]);
                                        }
                                    }}
                                    onRemove={label => {
                                        const uid = userNameToId.get(label);
                                        if (uid) setFormAccessList(prev => prev.filter(id => id !== uid));
                                    }}
                                    placeholder="Type to search users…"
                                />
                                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {formAccessList.length === 0
                                        ? <><Globe size={11} aria-hidden /> No restrictions — all users can view this issue</>
                                        : <><Lock size={11} aria-hidden /> {`${formAccessList.length + 1} user(s) will have access (you are always included)`}</>}
                                </p>
                            </div>
                            <div className="s-modal-footer">
                                <button type="button" className="s-btn s-btn-ghost" onClick={() => { setShowForm(false); setFormTags([]); setFormAccessList([]); }}>Cancel</button>
                                <button type="submit" className="s-btn s-btn-primary">Create Issue</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
