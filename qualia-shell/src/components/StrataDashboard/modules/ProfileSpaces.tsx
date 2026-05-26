/**
 * ProfileSpaces — Dynamic Spaces (custom tabs) + Entity Links for any entity profile.
 *
 * Phase 7 Enhancement: Each space now contains real content panels:
 *   1. Workitems — linked work items with status badges
 *   2. Notes — inline notes with add/delete
 *   3. Attachments — linked file references
 *
 * Props:
 *   entityType: 'property' | 'unit' | 'tenant' | 'vendor' | 'owner'
 *   entityId:   the entity's ID
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Link2, FolderOpen, ChevronRight, Tag, Send, FileText, ClipboardList, Paperclip, Trash2, StickyNote } from 'lucide-react';
import { strataGet, strataPost, strataPut, strataDelete } from '../strataApi';
import { useToast } from '../useToast';

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

interface SpaceItem {
    id: string;
    spaceId: string;
    itemType: string;
    itemId: string | null;
    title: string;
    content: string;
    fileUrl: string;
    sortOrder: number;
    createdAt: string;
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

const STATUS_COLORS: Record<string, string> = {
    open: '#3b82f6', in_progress: '#f59e0b', completed: '#22c55e', closed: '#64748b', pending: '#D6FE51',
};

export default function ProfileSpaces({ entityType, entityId }: Props) {
    const { showToast, ToastContainer } = useToast();
    const [spaces, setSpaces] = useState<ProfileSpace[]>([]);
    const [activeSpace, setActiveSpace] = useState<string | null>(null);
    const [links, setLinks] = useState<EntityLink[]>([]);
    const [spaceItems, setSpaceItems] = useState<SpaceItem[]>([]);
    const [showAddSpace, setShowAddSpace] = useState(false);
    const [showAddLink, setShowAddLink] = useState(false);
    const [newSpaceName, setNewSpaceName] = useState('');
    const [linkForm, setLinkForm] = useState({ targetType: 'property', targetId: '', linkType: 'related', note: '' });
    const [mergeMode, setMergeMode] = useState(false);
    const [mergeTarget, setMergeTarget] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Space item forms
    const [newNoteText, setNewNoteText] = useState('');
    const [newItemId, setNewItemId] = useState('');
    const [newAttachTitle, setNewAttachTitle] = useState('');
    const [newAttachUrl, setNewAttachUrl] = useState('');
    const [newTagText, setNewTagText] = useState('');

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

    const fetchSpaceItems = useCallback(async () => {
        if (!activeSpace) { setSpaceItems([]); return; }
        try {
            const data = await strataGet<SpaceItem[]>('/space-items', { space_id: activeSpace });
            setSpaceItems(data);
        } catch (e) { console.error(e); setSpaceItems([]); }
    }, [activeSpace]);

    useEffect(() => { fetchSpaces(); fetchLinks(); }, [fetchSpaces, fetchLinks]);
    useEffect(() => { fetchSpaceItems(); }, [fetchSpaceItems]);

    // Listen for external refresh signals (from global Add Space button)
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail || detail.entityType === entityType && detail.entityId === entityId) {
                fetchSpaces();
            }
        };
        window.addEventListener('spaces-refresh', handler);
        return () => window.removeEventListener('spaces-refresh', handler);
    }, [entityType, entityId, fetchSpaces]);

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
        if (confirmDeleteId !== id) {
            setConfirmDeleteId(id);
            return;
        }
        try {
            await strataDelete(`/spaces/${id}`);
            if (activeSpace === id) setActiveSpace(null);
            setConfirmDeleteId(null);
            fetchSpaces();
        } catch (e) {
            console.error('Delete space failed:', e);
            showToast('Failed to delete space', 'error');
        }
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
        try { await strataDelete(`/links/${id}`); fetchLinks(); } catch (e) { console.error(e); }
    };

    const handleMergeSpaces = async (keepId: string, mergeId: string) => {
        if (!confirm(`Merge into "${spaces.find(s => s.id === keepId)?.name}"? The other space will be deleted.`)) return;
        try {
            const mergeLinks = links.filter(l => l.sourceId === mergeId);
            await Promise.all(mergeLinks.map(l => strataPut(`/links/${l.id}`, { sourceId: keepId })));
            await strataDelete(`/spaces/${mergeId}`);
            setMergeMode(false);
            setMergeTarget(null);
            if (activeSpace === mergeId) setActiveSpace(keepId);
            fetchSpaces(); fetchLinks();
        } catch (e) { console.error(e); }
    };

    // Space item handlers
    const handleAddNote = async () => {
        if (!newNoteText.trim() || !activeSpace) return;
        await strataPost('/space-items', { spaceId: activeSpace, itemType: 'note', title: 'Note', content: newNoteText.trim() });
        setNewNoteText('');
        fetchSpaceItems();
    };

    const handleLinkWorkitem = async () => {
        if (!newItemId.trim() || !activeSpace) return;
        await strataPost('/space-items', { spaceId: activeSpace, itemType: 'workitem', itemId: newItemId.trim(), title: 'Linked Workitem' });
        setNewItemId('');
        fetchSpaceItems();
    };

    const handleAddAttachment = async () => {
        if (!newAttachTitle.trim() || !activeSpace) return;
        await strataPost('/space-items', { spaceId: activeSpace, itemType: 'attachment', title: newAttachTitle.trim(), fileUrl: newAttachUrl.trim() });
        setNewAttachTitle('');
        setNewAttachUrl('');
        fetchSpaceItems();
    };

    const handleDeleteItem = async (id: string) => {
        await strataDelete(`/space-items/${id}`);
        fetchSpaceItems();
    };

    const handleAddTag = async () => {
        if (!newTagText.trim() || !activeSpace) return;
        await strataPost('/space-items', { spaceId: activeSpace, itemType: 'tag', title: newTagText.trim(), content: newTagText.trim() });
        setNewTagText('');
        fetchSpaceItems();
    };

    const TAG_COLORS: Record<string, { bg: string; border: string; text: string }> = {
        property: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.2)', text: '#93c5fd' },
        tenant: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.2)', text: '#86efac' },
        vendor: { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.2)', text: '#E8FF7A' },
        owner: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.2)', text: '#fcd34d' },
        default: { bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.2)', text: '#94a3b8' },
    };

    const notes = spaceItems.filter(i => i.itemType === 'note');
    const workitems = spaceItems.filter(i => i.itemType === 'workitem');
    const attachments = spaceItems.filter(i => i.itemType === 'attachment');
    const tags = spaceItems.filter(i => i.itemType === 'tag');

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
                                style={{
                                    background: confirmDeleteId === s.id ? 'rgba(239,68,68,0.2)' : 'none',
                                    border: confirmDeleteId === s.id ? '1px solid rgba(239,68,68,0.4)' : 'none',
                                    color: confirmDeleteId === s.id ? '#f87171' : '#475569',
                                    cursor: 'pointer', padding: confirmDeleteId === s.id ? '0 4px' : 0,
                                    lineHeight: 1, borderRadius: 4, fontSize: 9, fontWeight: 600,
                                }}
                                title={confirmDeleteId === s.id ? 'Click again to confirm delete' : 'Delete space'}
                            >
                                {confirmDeleteId === s.id ? '✕ Delete?' : <X size={10} />}
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
                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(214,254,81,0.3)',
                                    color: '#e2e8f0', outline: 'none',
                                }}
                            />
                            <button onClick={handleAddSpace} style={{ background: '#D6FE51', border: 'none', borderRadius: 4, color: '#fff', padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>Add</button>
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

                {/* ── Space Content Area (Phase 7 Enhanced) ── */}
                <div style={{ padding: 16, minHeight: 80 }}>
                    {activeSpace ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {/* ─── Workitems Panel ─── */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                    <ClipboardList size={12} color="#818cf8" />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Linked Workitems</span>
                                    <span style={{ fontSize: 10, color: '#475569' }}>({workitems.length})</span>
                                </div>
                                {workitems.map(wi => (
                                    <div key={wi.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                        borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', marginBottom: 4,
                                    }}>
                                        <ClipboardList size={11} style={{ color: '#D6FE51', flexShrink: 0 }} />
                                        <span style={{ fontSize: 11, color: '#cbd5e1', flex: 1, fontFamily: 'monospace' }}>{wi.itemId?.slice(0, 16)}…</span>
                                        <button onClick={() => handleDeleteItem(wi.id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2 }}><Trash2 size={10} /></button>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                    <input value={newItemId} onChange={e => setNewItemId(e.target.value)}
                                        placeholder="Workitem ID to link…"
                                        onKeyDown={e => { if (e.key === 'Enter') handleLinkWorkitem(); }}
                                        style={{ flex: 1, padding: '4px 8px', borderRadius: 4, fontSize: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', outline: 'none' }}
                                    />
                                    <button onClick={handleLinkWorkitem} disabled={!newItemId.trim()}
                                        style={{ padding: '4px 10px', borderRadius: 4, background: newItemId.trim() ? '#D6FE51' : 'rgba(100,116,139,0.2)', border: 'none', color: '#fff', fontSize: 10, fontWeight: 600, cursor: newItemId.trim() ? 'pointer' : 'not-allowed' }}>Link</button>
                                </div>
                            </div>

                            {/* ─── Notes Panel ─── */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                    <StickyNote size={12} color="#f59e0b" />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</span>
                                    <span style={{ fontSize: 10, color: '#475569' }}>({notes.length})</span>
                                </div>
                                {notes.map(n => (
                                    <div key={n.id} style={{
                                        padding: '8px 10px', borderRadius: 6, marginBottom: 4,
                                        background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)',
                                        display: 'flex', alignItems: 'flex-start', gap: 8,
                                    }}>
                                        <StickyNote size={11} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                                        <span style={{ fontSize: 11, color: '#e2e8f0', flex: 1, lineHeight: 1.4 }}>{n.content}</span>
                                        <span style={{ fontSize: 9, color: '#475569', whiteSpace: 'nowrap' }}>{new Date(n.createdAt).toLocaleDateString()}</span>
                                        <button onClick={() => handleDeleteItem(n.id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2, flexShrink: 0 }}><Trash2 size={10} /></button>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                    <input value={newNoteText} onChange={e => setNewNoteText(e.target.value)}
                                        placeholder="Add a note…"
                                        onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); }}
                                        style={{ flex: 1, padding: '4px 8px', borderRadius: 4, fontSize: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', outline: 'none' }}
                                    />
                                    <button onClick={handleAddNote} disabled={!newNoteText.trim()} aria-label="Add note"
                                        style={{ padding: '4px 10px', borderRadius: 4, background: newNoteText.trim() ? '#f59e0b' : 'rgba(100,116,139,0.2)', border: 'none', color: '#fff', fontSize: 10, fontWeight: 600, cursor: newNoteText.trim() ? 'pointer' : 'not-allowed' }}>
                                        <Send size={10} />
                                    </button>
                                </div>
                            </div>

                            {/* ─── Tags Panel ─── */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                    <Tag size={12} color="#a78bfa" />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Entity Tags</span>
                                    <span style={{ fontSize: 10, color: '#475569' }}>({tags.length})</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                                    {tags.map(t => {
                                        const c = TAG_COLORS.default;
                                        return (
                                            <span key={t.id} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                fontSize: 11, padding: '3px 10px', borderRadius: 12,
                                                background: c.bg, color: c.text, fontWeight: 600,
                                                border: `1px solid ${c.border}`,
                                            }}>
                                                <Tag size={10} /> {t.content || t.title}
                                                <button onClick={() => handleDeleteItem(t.id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, display: 'flex' }}>
                                                    <X size={10} />
                                                </button>
                                            </span>
                                        );
                                    })}
                                    {tags.length === 0 && (
                                        <span style={{ fontSize: 11, color: '#475569' }}>No tags — link to properties, owners, tenants, vendors</span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                    <input value={newTagText} onChange={e => setNewTagText(e.target.value)}
                                        placeholder="Tag name (property, owner, vendor, tenant)…"
                                        onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); }}
                                        style={{ flex: 1, padding: '4px 8px', borderRadius: 4, fontSize: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', outline: 'none' }}
                                    />
                                    <button onClick={handleAddTag} disabled={!newTagText.trim()}
                                        style={{ padding: '4px 10px', borderRadius: 4, background: newTagText.trim() ? '#D6FE51' : 'rgba(100,116,139,0.2)', border: 'none', color: '#fff', fontSize: 10, fontWeight: 600, cursor: newTagText.trim() ? 'pointer' : 'not-allowed' }}>Tag</button>
                                </div>
                            </div>

                            {/* ─── Attachments Panel ─── */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                    <Paperclip size={12} color="#06b6d4" />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Attachments</span>
                                    <span style={{ fontSize: 10, color: '#475569' }}>({attachments.length})</span>
                                </div>
                                {attachments.map(att => (
                                    <div key={att.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                        borderRadius: 6, background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.1)', marginBottom: 4,
                                    }}>
                                        <FileText size={11} style={{ color: '#06b6d4', flexShrink: 0 }} />
                                        <span style={{ fontSize: 11, color: '#e2e8f0', flex: 1 }}>{att.title}</span>
                                        {att.fileUrl && <a href={att.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#06b6d4' }}>Open</a>}
                                        <button onClick={() => handleDeleteItem(att.id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2 }}><Trash2 size={10} /></button>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                    <input value={newAttachTitle} onChange={e => setNewAttachTitle(e.target.value)} placeholder="File name…"
                                        style={{ flex: 1, padding: '4px 8px', borderRadius: 4, fontSize: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', outline: 'none' }}
                                    />
                                    <input value={newAttachUrl} onChange={e => setNewAttachUrl(e.target.value)} placeholder="URL (optional)…"
                                        style={{ flex: 1, padding: '4px 8px', borderRadius: 4, fontSize: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', outline: 'none' }}
                                    />
                                    <button onClick={handleAddAttachment} disabled={!newAttachTitle.trim()}
                                        style={{ padding: '4px 10px', borderRadius: 4, background: newAttachTitle.trim() ? '#06b6d4' : 'rgba(100,116,139,0.2)', border: 'none', color: '#fff', fontSize: 10, fontWeight: 600, cursor: newAttachTitle.trim() ? 'pointer' : 'not-allowed' }}>Attach</button>
                                </div>
                            </div>
                        </div>
                    ) : spaces.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#475569', fontSize: 12 }}>
                            <FolderOpen size={24} strokeWidth={1} style={{ marginBottom: 8, opacity: 0.5 }} />
                            <p style={{ margin: 0 }}>No spaces created yet. Click "<strong>+ New Space</strong>" to add one.</p>
                            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#3f4f5f' }}>
                                Spaces are custom tabs for organizing workitems, notes, and attachments
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
                            background: 'rgba(214,254,81,0.08)', border: '1px solid rgba(214,254,81,0.2)',
                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                            color: '#D6FE51', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                        }}
                    >
                        <Plus size={11} /> Link Entity
                    </button>
                </div>

                {/* Add link form */}
                {showAddLink && (
                    <div style={{
                        padding: 12, borderRadius: 8, marginBottom: 10,
                        background: 'rgba(214,254,81,0.04)', border: '1px solid rgba(214,254,81,0.15)',
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
                            <button onClick={handleAddLink} style={{ background: '#D6FE51', border: 'none', borderRadius: 4, color: '#fff', padding: '4px 14px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Link</button>
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
                                        background: 'rgba(214,254,81,0.12)', color: '#D6FE51',
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
            <ToastContainer />
        </div>
    );
}
