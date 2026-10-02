/**
 * TrelloCardModal — Full-screen expandable view for a Trello-linked workitem/card
 *
 * Shows: full description, images/attachments, labels, due date, checklists, activity.
 * Fetches live data from Trello API when a card ID is provided.
 */

import React, { useState, useEffect, useRef, useId } from 'react';
import { activateOnEnterOrSpace } from '../../common/keyboardActivate';
import { X, ExternalLink, Paperclip, Calendar, Tag, CheckSquare, Square, Loader, Clock, MessageSquare, Image as ImageIcon } from 'lucide-react';

import type { Workitem } from '../strataTypes';
import { trelloApi, describeTrelloError, TrelloApiError } from '../../TrelloBoard/trelloApi';
import type { CardDetail, Activity } from '../../TrelloBoard/trelloApi';
import { TRELLO_A11Y } from '../../TrelloBoard/a11yContract';
import { labelStyle, labelDisplayName } from '../../TrelloBoard/trelloLabelColors';

interface TrelloAttachment {
    id: string;
    name: string;
    url: string;
    previews?: { url: string; width: number; height: number }[];
    mimeType?: string;
}

type RawLabel = string | { name?: string | null; color?: string | null };

interface Props {
    workitem: Workitem;
    onClose: () => void;
}

// metadata is arbitrary JSON: only a Trello card id (24-hex id or 8-char shortLink) may reach a URL path.
const CARD_ID_RE = /^(?:[0-9a-fA-F]{24}|[A-Za-z0-9]{8})$/;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Wrap Tab / Shift+Tab inside `root` so keyboard focus cannot leave the dialog. */
function trapTab(e: KeyboardEvent, root: HTMLElement | null): void {
    if (e.key !== 'Tab' || !root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) { e.preventDefault(); root.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !root.contains(active) || active === root;
    if (e.shiftKey && (active === first || outside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus(); }
}

export default function TrelloCardModal({ workitem, onClose }: Props) {
    const [trelloCard, setTrelloCard] = useState<CardDetail | null>(null);
    const [activity, setActivity] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [imgError, setImgError] = useState<Set<string>>(new Set());
    const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const lightboxRef = useRef<HTMLDivElement>(null);
    const lightboxCloseRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();

    const rawCardId = (workitem.metadata as any)?.trelloCardId;
    const cardId: string | undefined = typeof rawCardId === 'string' && CARD_ID_RE.test(rawCardId) ? rawCardId : undefined;
    const trelloUrl = (workitem.metadata as any)?.trelloUrl;

    useEffect(() => {
        if (!cardId) { setLoading(false); return; }
        const ctrl = new AbortController();
        setLoading(true);
        setLoadError(null);
        trelloApi.card(cardId, ctrl.signal)
            .then(card => { if (!ctrl.signal.aborted) setTrelloCard(card); })
            .catch(err => {
                if (ctrl.signal.aborted || (err as Error)?.name === 'AbortError') return;
                console.warn('[TrelloCardModal] card load failed:', err instanceof TrelloApiError ? err.code : 'UNKNOWN');
                setLoadError(describeTrelloError(err));
            })
            .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
        // Activity is secondary: a failure just leaves the section out.
        trelloApi.activity(cardId, ctrl.signal)
            .then(acts => { if (!ctrl.signal.aborted) setActivity((acts || []).slice(0, 10)); })
            .catch(() => { /* optional section */ });
        return () => ctrl.abort();
    }, [cardId]);

    // On open: remember the opener, focus the dialog; on close: hand focus back.
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        return () => { opener?.focus?.(); };
    }, []);

    // Lightbox: focus its close button; restore focus to the thumbnail on close.
    useEffect(() => {
        if (!selectedImage) return;
        const opener = document.activeElement as HTMLElement | null;
        lightboxCloseRef.current?.focus();
        return () => { opener?.focus?.(); };
    }, [selectedImage]);

    // Escape (lightbox first, then modal) and Tab trap
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (selectedImage) setSelectedImage(null);
                else onClose();
                return;
            }
            trapTab(e, selectedImage ? lightboxRef.current : panelRef.current);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, selectedImage]);

    const meta = (workitem.metadata || {}) as Record<string, any>;
    const attachments = (trelloCard?.attachments || []) as TrelloAttachment[];
    const checklists = trelloCard?.checklists || [];
    const cardDesc = trelloCard?.desc || workitem.description || '';
    const labels: RawLabel[] = trelloCard?.labels || meta.trelloLabels || [];
    const members = (trelloCard?.members || []).map(m => m.fullName).filter(Boolean);
    const due = trelloCard?.due || meta.trelloDue;
    const boardName = meta.trelloBoardName || '';
    const listName = meta.trelloListName || '';

    const images = attachments.filter(a =>
        a.url && (a.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.url))
    );
    const otherAttachments = attachments.filter(a => !images.includes(a));

    return (
        <>
            {/* Backdrop: purely visual; the wrapper below handles click-outside */}
            <div aria-hidden="true"
                style={{
                    position: 'fixed', inset: 0, zIndex: 9998,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                }}
            />

            {/* Image lightbox */}
            {selectedImage && (
                <div ref={lightboxRef} role="presentation"
                    onClick={() => setSelectedImage(null)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 10000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.9)', cursor: 'zoom-out',
                    }}
                >
                    <button ref={lightboxCloseRef} type="button" aria-label="Close image"
                        onClick={() => setSelectedImage(null)}
                        style={{
                            position: 'absolute', top: 16, right: 16,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 36, height: 36, borderRadius: 8,
                            background: 'rgba(255,255,255,0.12)', border: 'none',
                            color: '#fff', cursor: 'pointer',
                        }}
                    >
                        <X size={20} />
                    </button>
                    <img src={selectedImage.url} alt={selectedImage.name} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
                </div>
            )}

            {/* Modal wrapper: clicking the empty area around the panel closes */}
            <div role="presentation"
                onClick={e => { if (e.target === e.currentTarget) onClose(); }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 24,
                }}>
                <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
                    style={{
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
                            <h2 id={titleId} style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
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
                                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
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
                                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)',
                                        fontSize: 11, fontWeight: 600, textDecoration: 'none',
                                    }}
                                >
                                    <ExternalLink size={12} /> Trello
                                </a>
                            )}
                            <button ref={closeRef} type="button"
                                aria-label={TRELLO_A11Y.closeDetail}
                                onClick={onClose}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    width: 32, height: 32, borderRadius: 8,
                                    background: 'rgba(255,255,255,0.06)', border: 'none',
                                    color: 'var(--text-secondary)', cursor: 'pointer',
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '18px 24px' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>
                                <Loader size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                                <p style={{ margin: 0, fontSize: 13 }}>Loading card details…</p>
                            </div>
                        ) : (
                            <>
                                {loadError && (
                                    <div role="alert" style={{
                                        marginBottom: 16, padding: '8px 12px', borderRadius: 8, fontSize: 12,
                                        background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
                                    }}>
                                        Couldn't load this card from Trello: {loadError}
                                    </div>
                                )}

                                {/* Labels */}
                                {labels.length > 0 && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                                        {labels.map((raw, i) => {
                                            const label = typeof raw === 'string' ? { name: raw, color: null } : raw;
                                            return (
                                                <span key={i} style={{
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                    ...labelStyle(label?.color),
                                                }}>
                                                    <Tag size={10} />
                                                    {labelDisplayName(label || {})}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Due Date */}
                                {due && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)',
                                    }}>
                                        <Calendar size={13} />
                                        Due: {new Date(due).toLocaleDateString()}
                                    </div>
                                )}

                                {/* Members */}
                                {members.length > 0 && (
                                    <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                                        Members: {members.join(', ')}
                                    </div>
                                )}

                                {/* Description */}
                                {cardDesc && (
                                    <div style={{ marginBottom: 20 }}>
                                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</h4>
                                        <div style={{
                                            padding: '12px 16px', borderRadius: 10,
                                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                            fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)',
                                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                        }}>
                                            {cardDesc}
                                        </div>
                                    </div>
                                )}

                                {/* Images */}
                                {images.length > 0 && (
                                    <div style={{ marginBottom: 20 }}>
                                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <ImageIcon size={14} /> Images ({images.length})
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                                            {images.map(img => {
                                                const previewUrl = img.previews?.find(p => p.width >= 200)?.url || img.url;
                                                if (imgError.has(img.id)) return null;
                                                return (
                                                    <div role="button" tabIndex={0} onKeyDown={activateOnEnterOrSpace}
                                                        key={img.id}
                                                        onClick={() => setSelectedImage({ url: img.url, name: img.name })}
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
                                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
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
                                                        color: 'var(--accent)', fontSize: 12, textDecoration: 'none',
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
                                                    <h4 style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                                                                : <Square size={13} style={{ color: 'var(--text-tertiary)' }} />
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
                                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Tags</h4>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {workitem.tags.map((tag, i) => (
                                                <span key={i} style={{
                                                    padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', fontWeight: 500,
                                                }}>{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Activity */}
                                {activity.length > 0 && (
                                    <div>
                                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <MessageSquare size={14} /> Recent Activity
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {activity.map((act, i) => (
                                                <div key={i} style={{
                                                    padding: '8px 12px', borderRadius: 8,
                                                    background: 'rgba(255,255,255,0.02)',
                                                    fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
                                                }}>
                                                    <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                                                        {act.memberCreator?.fullName || 'Unknown'}
                                                    </span>
                                                    {' '}{act.data?.text || act.type?.replace(/([A-Z])/g, ' $1').toLowerCase()}
                                                    <div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <Clock size={9} />
                                                        {new Date(act.date).toLocaleString()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Footer info */}
                                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: 'var(--text-tertiary)' }}>
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
