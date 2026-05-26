/**
 * TrelloCardModal — Full-screen expandable view for a Trello-linked workitem/card
 *
 * Shows: full description, images/attachments, labels, due date, checklists, activity.
 * Fetches live data from Trello API when a card ID is provided.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../../../context/UserContext';
import { X, ExternalLink, Paperclip, Calendar, Tag, CheckSquare, Square, Loader, Clock, MessageSquare, Image as ImageIcon } from 'lucide-react';

import type { Workitem } from '../strataTypes';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

interface TrelloAttachment {
    id: string;
    name: string;
    url: string;
    previews?: { url: string; width: number; height: number }[];
    mimeType?: string;
    isUpload?: boolean;
}

interface TrelloChecklist {
    id: string;
    name: string;
    checkItems: { id: string; name: string; state: 'complete' | 'incomplete' }[];
}

interface Props {
    workitem: Workitem;
    onClose: () => void;
}

export default function TrelloCardModal({ workitem, onClose }: Props) {
    const [trelloCard, setTrelloCard] = useState<any>(null);
    const [activity, setActivity] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [imgError, setImgError] = useState<Set<string>>(new Set());
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const cardId = (workitem.metadata as any)?.trelloCardId;
    const trelloUrl = (workitem.metadata as any)?.trelloUrl;

    const fetchCard = useCallback(async () => {
        if (!cardId) { setLoading(false); return; }
        const token = getAuthToken();
        const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
        try {
            const [cardRes, actRes] = await Promise.all([
                fetch(`${API_BASE}/api/trello/cards/${cardId}`, { headers }),
                fetch(`${API_BASE}/api/trello/cards/${cardId}/activity`, { headers }).catch(() => null),
            ]);
            if (cardRes.ok) {
                const cardData = await cardRes.json();
                setTrelloCard(cardData.data || cardData);
            }
            if (actRes?.ok) {
                const actData = await actRes.json();
                setActivity((actData.data || actData || []).slice(0, 10));
            }
        } catch (err) {
            console.error('[TrelloCardModal]', err);
        }
        setLoading(false);
    }, [cardId]);

    useEffect(() => { fetchCard(); }, [fetchCard]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { selectedImage ? setSelectedImage(null) : onClose(); } };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, selectedImage]);

    const meta = (workitem.metadata || {}) as Record<string, any>;
    const attachments: TrelloAttachment[] = trelloCard?.attachments || [];
    const checklists: TrelloChecklist[] = trelloCard?.checklists || [];
    const cardDesc = trelloCard?.desc || workitem.description || '';
    const labels: any[] = trelloCard?.labels || meta.trelloLabels || [];
    const due = trelloCard?.due || meta.trelloDue;
    const boardName = meta.trelloBoardName || '';
    const listName = meta.trelloListName || '';

    const images = attachments.filter(a =>
        a.url && (a.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.url))
    );
    const otherAttachments = attachments.filter(a => !images.includes(a));

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={() => selectedImage ? setSelectedImage(null) : onClose()}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9998,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                }}
            />

            {/* Image lightbox */}
            {selectedImage && (
                <div
                    onClick={() => setSelectedImage(null)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 10000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.9)', cursor: 'zoom-out',
                    }}
                >
                    <img src={selectedImage} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
                </div>
            )}

            {/* Modal */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24,
            }}>
                <div style={{
                    width: '100%', maxWidth: 700, maxHeight: '85vh',
                    background: 'rgba(20,24,40,0.98)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 16, overflow: 'auto',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '18px 24px', display: 'flex', alignItems: 'start', justifyContent: 'space-between',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        position: 'sticky', top: 0, background: 'rgba(20,24,40,0.98)', zIndex: 1,
                    }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.3 }}>
                                {workitem.title}
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                <span className={`s-badge ${workitem.status}`} style={{ fontSize: 11 }}>{workitem.status}</span>
                                {workitem.priority && (
                                    <span style={{
                                        fontSize: 10, padding: '2px 8px', borderRadius: 6,
                                        background: workitem.priority === 'high' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                                        color: workitem.priority === 'high' ? '#ef4444' : '#94a3b8',
                                        fontWeight: 600, textTransform: 'uppercase',
                                    }}>{workitem.priority}</span>
                                )}
                                {boardName && (
                                    <span style={{ fontSize: 11, color: '#64748b' }}>
                                        {boardName} {listName ? `› ${listName}` : ''}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                            {trelloUrl && (
                                <a href={trelloUrl} target="_blank" rel="noopener noreferrer"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        padding: '6px 12px', borderRadius: 6,
                                        background: 'rgba(214,254,81,0.12)', color: '#D6FE51',
                                        fontSize: 11, fontWeight: 600, textDecoration: 'none',
                                    }}
                                >
                                    <ExternalLink size={12} /> Trello
                                </a>
                            )}
                            <button
                                onClick={onClose}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    width: 32, height: 32, borderRadius: 8,
                                    background: 'rgba(255,255,255,0.06)', border: 'none',
                                    color: '#94a3b8', cursor: 'pointer',
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '18px 24px' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                <Loader size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                                <p style={{ margin: 0, fontSize: 13 }}>Loading card details…</p>
                            </div>
                        ) : (
                            <>
                                {/* Labels */}
                                {labels.length > 0 && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                                        {labels.map((label: any, i: number) => (
                                            <span key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                background: label.color ? `${label.color === 'green' ? '#22c55e' : label.color === 'red' ? '#ef4444' : label.color === 'blue' ? '#3b82f6' : label.color === 'yellow' ? '#f59e0b' : label.color === 'orange' ? '#f97316' : label.color === 'purple' ? '#D6FE51' : '#6b7280'}20` : 'rgba(255,255,255,0.06)',
                                                color: label.color === 'green' ? '#22c55e' : label.color === 'red' ? '#ef4444' : label.color === 'blue' ? '#3b82f6' : label.color === 'yellow' ? '#f59e0b' : label.color === 'orange' ? '#f97316' : label.color === 'purple' ? '#D6FE51' : '#94a3b8',
                                            }}>
                                                <Tag size={10} />
                                                {label.name || label}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Due Date */}
                                {due && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        marginBottom: 16, fontSize: 12, color: '#94a3b8',
                                    }}>
                                        <Calendar size={13} />
                                        Due: {new Date(due).toLocaleDateString()}
                                    </div>
                                )}

                                {/* Description */}
                                {cardDesc && (
                                    <div style={{ marginBottom: 20 }}>
                                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</h4>
                                        <div style={{
                                            padding: '12px 16px', borderRadius: 10,
                                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                            fontSize: 13, lineHeight: 1.7, color: '#cbd5e1',
                                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                        }}>
                                            {cardDesc}
                                        </div>
                                    </div>
                                )}

                                {/* Images */}
                                {images.length > 0 && (
                                    <div style={{ marginBottom: 20 }}>
                                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <ImageIcon size={14} /> Images ({images.length})
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                                            {images.map(img => {
                                                const previewUrl = img.previews?.find(p => p.width >= 200)?.url || img.url;
                                                if (imgError.has(img.id)) return null;
                                                return (
                                                    <div
                                                        key={img.id}
                                                        onClick={() => setSelectedImage(img.url)}
                                                        style={{
                                                            borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in',
                                                            border: '1px solid rgba(255,255,255,0.06)',
                                                            aspectRatio: '4/3', background: 'rgba(0,0,0,0.2)',
                                                        }}
                                                    >
                                                        <img
                                                            src={previewUrl}
                                                            alt={img.name}
                                                            onError={() => setImgError(prev => new Set(prev).add(img.id))}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Other attachments */}
                                {otherAttachments.length > 0 && (
                                    <div style={{ marginBottom: 20 }}>
                                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Paperclip size={14} /> Attachments ({otherAttachments.length})
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {otherAttachments.map(a => (
                                                <a
                                                    key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '8px 12px', borderRadius: 8,
                                                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                                        color: '#D6FE51', fontSize: 12, textDecoration: 'none',
                                                    }}
                                                >
                                                    <Paperclip size={12} />
                                                    {a.name}
                                                    <ExternalLink size={10} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Checklists */}
                                {checklists.length > 0 && (
                                    <div style={{ marginBottom: 20 }}>
                                        {checklists.map(cl => {
                                            const done = cl.checkItems.filter(i => i.state === 'complete').length;
                                            const total = cl.checkItems.length;
                                            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                            return (
                                                <div key={cl.id} style={{ marginBottom: 12 }}>
                                                    <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <CheckSquare size={14} /> {cl.name}
                                                        <span style={{ fontSize: 11, opacity: 0.6 }}>({done}/{total} · {pct}%)</span>
                                                    </h4>
                                                    <div style={{
                                                        height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
                                                        marginBottom: 8, overflow: 'hidden',
                                                    }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#D6FE51', borderRadius: 2, transition: 'width 0.3s' }} />
                                                    </div>
                                                    {cl.checkItems.map(item => (
                                                        <div key={item.id} style={{
                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                            padding: '4px 0', fontSize: 12,
                                                            color: item.state === 'complete' ? '#64748b' : '#cbd5e1',
                                                            textDecoration: item.state === 'complete' ? 'line-through' : 'none',
                                                        }}>
                                                            {item.state === 'complete'
                                                                ? <CheckSquare size={13} style={{ color: '#22c55e' }} />
                                                                : <Square size={13} style={{ color: '#475569' }} />
                                                            }
                                                            {item.name}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Tags */}
                                {(workitem.tags || []).length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Tags</h4>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {workitem.tags.map((tag, i) => (
                                                <span key={i} style={{
                                                    padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                                    background: 'rgba(214,254,81,0.12)', color: '#D6FE51', fontWeight: 500,
                                                }}>{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Activity */}
                                {activity.length > 0 && (
                                    <div>
                                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <MessageSquare size={14} /> Recent Activity
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {activity.map((act: any, i: number) => (
                                                <div key={i} style={{
                                                    padding: '8px 12px', borderRadius: 8,
                                                    background: 'rgba(255,255,255,0.02)',
                                                    fontSize: 12, color: '#94a3b8', lineHeight: 1.5,
                                                }}>
                                                    <span style={{ fontWeight: 500, color: '#cbd5e1' }}>
                                                        {act.memberCreator?.fullName || 'Unknown'}
                                                    </span>
                                                    {' '}{act.data?.text || act.type?.replace(/([A-Z])/g, ' $1').toLowerCase()}
                                                    <div style={{ marginTop: 2, fontSize: 10, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <Clock size={9} />
                                                        {new Date(act.date).toLocaleString()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Footer info */}
                                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: '#475569' }}>
                                    {workitem.domain} • {workitem.type}
                                    {cardId && ` • Card: ${cardId.slice(0, 12)}…`}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
