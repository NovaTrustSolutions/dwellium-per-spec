/**
 * ProfileSpaces — Dynamic Spaces (custom tabs) + Entity Links for any entity profile.
 *
 * Renders:
 *  1. A horizontal tab bar of user-created spaces with a "+" button to add new ones.
 *  2. Within each space, the workitems/tasks associated with that space.
 *  3. A "Linked Entities" section showing cross-referenced entities.
 *
 * Props:
 *   entityType: 'property' | 'unit' | 'tenant' | 'vendor' | 'owner'
 *   entityId:   the entity's ID
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Link2, FolderOpen, ChevronRight, Tag, AlertCircle } from 'lucide-react';
import { strataGet, strataPost, strataPut, strataDelete } from '../strataApi';

interface ProfileSpace {
    id: string;
    entityType: string;
    entityId: string;
    name: string;
    icon: string;
    sortOrder: number;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
}

interface EntityLink {
    id: string;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    linkType: string;
    note: string;
    createdBy: string | null;
    createdAt: string;
}

interface Props {
    entityType: string;
    entityId: string;
}

export default function ProfileSpaces({ entityType, entityId }: Props) {
    const [spaces, setSpaces] = useState<ProfileSpace[]>([]);
    const [activeSpace, setActiveSpace] = useState<string | null>(null);
    const [links, setLinks] = useState<EntityLink[]>([]);
    const [showAddSpace, setShowAddSpace] = useState(false);
    const [showAddLink, setShowAddLink] = useState(false);
    const [newSpaceName, setNewSpaceName] = useState('');
    const [linkForm, setLinkForm] = useState({ targetType: 'property', targetId: '', linkType: 'related', note: '' });
    const [mergeMode, setMergeMode] = useState(false);
    const [mergeTarget, setMergeTarget] = useState<string | null>(null);

    const fetchSpaces = useCallback(async () => {
        try {
            const data = await strataGet<ProfileSpace[]>('/spaces', { entityType, entityId });
            setSpaces(data);
            if (data.length > 0 && !activeSpace) setActiveSpace(data[0].id);
        } catch (e) { console.error(e); }
    }, [entityType, entityId, activeSpace]);

    const fetchLinks = useCallback(async () => {
        try {
            const data = await strataGet<EntityLink[]>('/links', { entityType, entityId });
            setLinks(data);
        } catch (e) { console.error(e); }
    }, [entityType, entityId]);

    useEffect(() => { fetchSpaces(); fetchLinks(); }, [fetchSpaces, fetchLinks]);

    const handleAddSpace = async () => {
        if (!newSpaceName.trim()) return;
        try {
            await strataPost('/spaces', { entityType, entityId, name: newSpaceName.trim(), sortOrder: spaces.length });
            setNewSpaceName('');
            setShowAddSpace(false);
            fetchSpaces();
        } catch (e) { console.error(e); }
    };

    const handleDeleteSpace = async (id: string) => {
        if (!confirm('Delete this space? Tasks within will be unlinked.')) return;
        try {
            await strataDelete(`/spaces/${id}`);
            if (activeSpace === id) setActiveSpace(null);
            fetchSpaces();
        } catch (e) { console.error(e); }
    };

    const handleAddLink = async () => {
        if (!linkForm.targetId.trim()) return;
        try {
            await strataPost('/links', {
                sourceType: entityType, sourceId: entityId,
                targetType: linkForm.targetType, targetId: linkForm.targetId,
                linkType: linkForm.linkType, note: linkForm.note,
            });
            setLinkForm({ targetType: 'property', targetId: '', linkType: 'related', note: '' });
            setShowAddLink(false);
            fetchLinks();
        } catch (e) { console.error(e); }
    };

    const handleDeleteLink = async (id: string) => {
        try {
            await strataDelete(`/links/${id}`);
            fetchLinks();
        } catch (e) { console.error(e); }
    };

    const handleMergeSpaces = async (keepId: string, mergeId: string) => {
        if (!confirm(`Merge into "${spaces.find(s => s.id === keepId)?.name}"? The other space will be deleted.`)) return;
        try {
            // Move all links from mergeId space to keepId space (reassign sourceId)
            const mergeLinks = links.filter(l => l.sourceId === mergeId);
            await Promise.all(mergeLinks.map(l =>
                strataPut(`/links/${l.id}`, { sourceId: keepId })
            ));
            await strataDelete(`/spaces/${mergeId}`);
            setMergeMode(false);
            setMergeTarget(null);
            if (activeSpace === mergeId) setActiveSpace(keepId);
            fetchSpaces();
            fetchLinks();
        } catch (e) { console.error(e); }
    };

    return (
        <div style={{ marginTop: 16 }}>
            {/* ── Dynamic Spaces Tabs ── */}
            <div className="s-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 0,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    overflowX: 'auto', padding: '0 8px',
                }}>
                    {spaces.map(s => (
                        <div
                            key={s.id}
                            onClick={() => setActiveSpace(s.id)}
                            style={{
                                padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                borderBottom: activeSpace === s.id ? '2px solid #818cf8' : '2px solid transparent',
                                color: activeSpace === s.id ? '#e2e8f0' : '#64748b',
                                display: 'flex', alignItems: 'center', gap: 6,
                                whiteSpace: 'nowrap', transition: 'all 0.15s',
                            }}
                        >
                            <FolderOpen size={12} />
                            {s.name}
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteSpace(s.id); }}
                                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                                title="Delete space"
                            >
                                <X size={10} />
                            </button>
                        </div>
                    ))}

                    {spaces.length >= 2 && !mergeMode && (
                        <>
                            <button
                                onClick={() => handleDeleteSpace(activeSpace!)}
                                disabled={!activeSpace}
                                style={{
                                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                    borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                                    color: '#f87171', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
                                }}
                            >
                                <X size={10} /> Remove
                            </button>
                            <button
                                onClick={() => { setMergeMode(true); setMergeTarget(activeSpace); }}
                                style={{
                                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                                    borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                                    color: '#fbbf24', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
                                }}
                            >
                                Merge
                            </button>
                        </>
                    )}
                    {mergeMode && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: '#fbbf24' }}>Merge into:</span>
                            <select
                                value={mergeTarget || ''}
                                onChange={e => setMergeTarget(e.target.value)}
                                style={{ padding: '4px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(245,158,11,0.3)', color: '#e2e8f0', fontSize: 10, outline: 'none' }}
                            >
                                {spaces.filter(s => s.id !== activeSpace).map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <button onClick={() => mergeTarget && activeSpace && handleMergeSpaces(mergeTarget, activeSpace)}
                                style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                Confirm
                            </button>
                            <button onClick={() => { setMergeMode(false); setMergeTarget(null); }}
                                style={{ padding: '4px 8px', borderRadius: 4, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 10, cursor: 'pointer' }}>
                                Cancel
                            </button>
                        </div>
                    )}

                    {/* Add space button */}
                    {showAddSpace ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px' }}>
                            <input
                                autoFocus
                                value={newSpaceName}
                                onChange={e => setNewSpaceName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddSpace(); if (e.key === 'Escape') setShowAddSpace(false); }}
                                placeholder="Space name…"
                                style={{
                                    width: 120, padding: '4px 8px', borderRadius: 4, fontSize: 11,
                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,102,241,0.3)',
                                    color: '#e2e8f0', outline: 'none',
                                }}
                            />
                            <button onClick={handleAddSpace} style={{ background: '#6366f1', border: 'none', borderRadius: 4, color: '#fff', padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>Add</button>
                            <button onClick={() => setShowAddSpace(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={12} /></button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowAddSpace(true)}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#64748b', padding: '8px 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                            }}
                            title="Add new space"
                        >
                            <Plus size={12} /> New Space
                        </button>
                    )}
                </div>

                {/* Space content area */}
                <div style={{ padding: 16, minHeight: 80 }}>
                    {activeSpace ? (
                        <div style={{ color: '#94a3b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FolderOpen size={16} strokeWidth={1} />
                            <span>Space "<strong style={{ color: '#e2e8f0' }}>{spaces.find(s => s.id === activeSpace)?.name}</strong>" —
                                Drop workitems or projects here to organize them.</span>
                        </div>
                    ) : spaces.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#475569', fontSize: 12 }}>
                            <FolderOpen size={24} strokeWidth={1} style={{ marginBottom: 8, opacity: 0.5 }} />
                            <p style={{ margin: 0 }}>No spaces created yet. Click "<strong>+ New Space</strong>" to add one.</p>
                            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#3f4f5f' }}>
                                Spaces are custom tabs like "Legal Issues", "Renovation", "Admin"
                            </p>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* ── Entity Links (Cross-referencing) ── */}
            <div className="s-glass-card" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, margin: 0 }}>
                        <Link2 size={14} /> Linked Entities
                        {links.length > 0 && <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>({links.length})</span>}
                    </h3>
                    <button
                        onClick={() => setShowAddLink(!showAddLink)}
                        style={{
                            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                            color: '#a5b4fc', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                        }}
                    >
                        <Plus size={11} /> Link Entity
                    </button>
                </div>

                {/* Add link form */}
                {showAddLink && (
                    <div style={{
                        padding: 12, borderRadius: 8, marginBottom: 10,
                        background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)',
                    }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <select value={linkForm.targetType} onChange={e => setLinkForm(p => ({ ...p, targetType: e.target.value }))}
                                style={{ padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 11, outline: 'none' }}>
                                <option value="property">Property</option>
                                <option value="tenant">Tenant</option>
                                <option value="vendor">Vendor</option>
                                <option value="owner">Owner</option>
                                <option value="workitem">Workitem</option>
                                <option value="legal">Legal Issue</option>
                            </select>
                            <input value={linkForm.targetId} onChange={e => setLinkForm(p => ({ ...p, targetId: e.target.value }))}
                                placeholder="Target entity ID" style={{ padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 11, outline: 'none' }} />
                            <select value={linkForm.linkType} onChange={e => setLinkForm(p => ({ ...p, linkType: e.target.value }))}
                                style={{ padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 11, outline: 'none' }}>
                                <option value="related">Related</option>
                                <option value="depends_on">Depends On</option>
                                <option value="blocks">Blocks</option>
                                <option value="parent_of">Parent Of</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input value={linkForm.note} onChange={e => setLinkForm(p => ({ ...p, note: e.target.value }))}
                                placeholder="Optional note…" style={{ flex: 1, padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 11, outline: 'none' }} />
                            <button onClick={handleAddLink} style={{ background: '#6366f1', border: 'none', borderRadius: 4, color: '#fff', padding: '4px 14px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Link</button>
                        </div>
                    </div>
                )}

                {/* Links list */}
                {links.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {links.map(link => {
                            const isSource = link.sourceType === entityType && link.sourceId === entityId;
                            const otherType = isSource ? link.targetType : link.sourceType;
                            const otherId = isSource ? link.targetId : link.sourceId;
                            return (
                                <div key={link.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                    borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                                }}>
                                    <ChevronRight size={10} style={{ color: '#475569' }} />
                                    <span style={{
                                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                        padding: '1px 6px', borderRadius: 10,
                                        background: 'rgba(99,102,241,0.12)', color: '#a5b4fc',
                                    }}>{otherType}</span>
                                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>{otherId.slice(0, 12)}…</span>
                                    <Tag size={10} style={{ color: '#475569' }} />
                                    <span style={{ fontSize: 10, color: '#64748b' }}>{link.linkType}</span>
                                    {link.note && (
                                        <span style={{ fontSize: 10, color: '#475569', fontStyle: 'italic', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {link.note}
                                        </span>
                                    )}
                                    <button onClick={() => handleDeleteLink(link.id)}
                                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2 }}
                                        title="Remove link"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: 12, color: '#475569', fontSize: 11 }}>
                        <Link2 size={18} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 4 }} />
                        <p style={{ margin: 0 }}>No linked entities yet</p>
                    </div>
                )}
            </div>
        </div>
    );
}
