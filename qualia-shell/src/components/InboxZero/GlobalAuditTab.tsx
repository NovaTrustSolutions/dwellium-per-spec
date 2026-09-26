/**
 * GlobalAuditTab — cross-item audit log, plan 066 §5b.
 * GET `${apiBase}/audit/global?limit&offset`; View merges GET `/:id` + `/:id/body`;
 * Recover (only for archive|bulk_archive|delete|snooze) → PUT `/:id/status`.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { ClipboardList, Eye, RefreshCw, Undo2 } from 'lucide-react';
import { sanitizeHtml } from '../../utils/safeMarkdown';
import { buildEmailSrcDoc, themePalette } from './emailFrame';

type AuthFetch = (url: string, opts?: RequestInit) => Promise<Response>;

interface AuditEntry {
    id: string;
    inbox_item_id: string;
    action: string;
    actor: string | null;
    reason: string | null;
    details: string;
    created_at: string;
    subject: string | null;
}

interface ViewedItem {
    subject?: string;
    sender?: string;
    snippet?: string;
    body?: string;
}

interface GlobalAuditTabProps {
    apiBase: string;
    authFetch?: AuthFetch;
}

const LIMIT = 50;
// PUT /:id/status only makes sense for actions that moved the item out of 'pending'.
const RECOVERABLE_ACTIONS = new Set(['archive', 'bulk_archive', 'delete', 'snooze']);

/** SQLite datetime('now') is UTC without a zone ("2026-09-24 21:30:00"); `new Date()` would read it as local time. */
export function parseSqliteUtc(value: string): Date {
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? new Date(value.replace(' ', 'T') + 'Z') : new Date(value);
}

function toast(detail: string) {
    window.dispatchEvent(new CustomEvent('qualia-toast', { detail }));
}

const ACTION_COLORS: Record<string, string> = {
    approved: 'var(--success)',
    archive: 'var(--warning)',
    archived: 'var(--warning)',
    bulk_archive: 'var(--warning)',
    delete: 'var(--danger)',
    deleted: 'var(--danger)',
    snooze: 'var(--warning)',
    snoozed: 'var(--warning)',
    restore: 'var(--success)',
    read: 'var(--text-secondary)',
    linked: 'var(--accent)',
    unsubscribe: 'var(--accent)',
    unsubscribed: 'var(--accent)',
    retry: 'var(--warning)',
    draft: 'var(--accent)',
};

export function GlobalAuditTab({ apiBase, authFetch }: GlobalAuditTabProps) {
    const apiFetch = authFetch || fetch;
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [viewItem, setViewItem] = useState<ViewedItem | null>(null);

    const closeRef = useRef<HTMLButtonElement | null>(null);
    const backdropRef = useRef<HTMLDivElement | null>(null);
    // Preview dialog: focus the close button on open; Escape closes it, and so
    // does a click on the backdrop itself (checked via e.target === the
    // backdrop node, not a bubbled click from inside the panel). Wired
    // imperatively rather than JSX onClick (plan 066 §6b) — a static element
    // needs an interactive role to carry a click handler past jsx-a11y, and
    // there is no honest role for "backdrop that dismisses a dialog".
    useEffect(() => {
        if (!viewItem) return;
        closeRef.current?.focus();
        const backdrop = backdropRef.current;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewItem(null); };
        const onBackdropClick = (e: MouseEvent) => { if (e.target === backdrop) setViewItem(null); };
        document.addEventListener('keydown', onKey);
        backdrop?.addEventListener('click', onBackdropClick);
        return () => {
            document.removeEventListener('keydown', onKey);
            backdrop?.removeEventListener('click', onBackdropClick);
        };
    }, [viewItem]);

    const fetchPage = useCallback(async (offset: number, append: boolean) => {
        setLoading(true);
        try {
            const res = await apiFetch(`${apiBase}/audit/global?limit=${LIMIT}&offset=${offset}`);
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                // Offset paging over a feed that grows at the top can hand back a row already shown — keep the first copy.
                setEntries(prev => {
                    if (!append) return data.data || [];
                    const seen = new Set(prev.map(e => e.id));
                    return [...prev, ...((data.data || []) as AuditEntry[]).filter(e => !seen.has(e.id))];
                });
                setHasMore(!!data.pagination?.hasMore);
            } else {
                toast(data.error || `Could not load the audit log (${res.status})`);
            }
        } catch {
            toast('Network error loading audit log');
        } finally {
            setLoading(false);
        }
    }, [apiBase, apiFetch]);

    useEffect(() => {
        fetchPage(0, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    const handleView = async (id: string) => {
        try {
            const [itemRes, bodyRes] = await Promise.all([
                apiFetch(`${apiBase}/${id}`),
                apiFetch(`${apiBase}/${id}/body`),
            ]);
            const itemData = await itemRes.json().catch(() => ({}));
            if (!itemRes.ok || itemData.success === false || !itemData.data) {
                toast(itemData.error || 'Could not load item details');
                return;
            }
            const bodyData = await bodyRes.json().catch(() => ({}));
            const body = bodyRes.ok && bodyData.success !== false ? bodyData.data?.body : undefined;
            setViewItem({ ...itemData.data, body });
        } catch {
            toast('Network error loading item');
        }
    };

    const handleRecover = async (id: string) => {
        try {
            const res = await apiFetch(`${apiBase}/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'pending', reason: 'Recovered from audit log' }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                toast('Item recovered');
                fetchPage(0, false);
            } else {
                toast(data.error || `Failed to recover item (${res.status})`);
            }
        } catch {
            toast('Network error');
        }
    };

    return (
        <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
                    <ClipboardList size={16} aria-hidden /> Global Audit Log
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{entries.length} entries</span>
                <button
                    onClick={() => fetchPage(0, false)}
                    style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                    <RefreshCw size={13} aria-hidden /> Refresh
                </button>
            </div>

            {loading && entries.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading audit log…</div>}

            {!loading && entries.length === 0 && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
                    No audit entries yet.
                </div>
            )}

            {entries.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {entries.map((entry) => (
                        <div
                            key={entry.id}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '92px 90px 90px 1fr 1fr auto',
                                gap: '8px',
                                alignItems: 'center',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                                fontSize: '12px',
                            }}
                        >
                            <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                                {parseSqliteUtc(entry.created_at).toLocaleString('en-US', {
                                    month: 'short', day: 'numeric',
                                    hour: '2-digit', minute: '2-digit',
                                })}
                            </span>
                            <span style={{
                                fontWeight: 600,
                                // status hues mixed toward --text-primary so they clear 4.5:1 on light AND dark themes
                                color: ACTION_COLORS[entry.action] ? `color-mix(in srgb, ${ACTION_COLORS[entry.action]} 50%, var(--text-primary))` : 'var(--text-secondary)',
                                fontSize: '11px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.4px',
                            }}>
                                {entry.action}
                            </span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.actor || '—'}
                            </span>
                            <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.subject || '—'}
                            </span>
                            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.reason || '—'}
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {/* subject is null when the row is not an inbox item (rule_* rows use the rule id) — nothing to view or recover. */}
                                {entry.subject !== null && (
                                <button
                                    onClick={() => handleView(entry.inbox_item_id)}
                                    style={{
                                        padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-default)',
                                        background: 'transparent', color: 'var(--text-primary)', fontSize: '10px', cursor: 'pointer',
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                    }}
                                >
                                    <Eye size={12} aria-hidden /> View
                                </button>
                                )}
                                {entry.subject !== null && RECOVERABLE_ACTIONS.has(entry.action) && (
                                    <button
                                        onClick={() => handleRecover(entry.inbox_item_id)}
                                        style={{
                                            padding: '4px 8px', borderRadius: '4px', border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
                                            background: 'transparent', color: 'color-mix(in srgb, var(--danger) 60%, var(--text-primary))', fontSize: '10px', cursor: 'pointer',
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <Undo2 size={12} aria-hidden /> Recover
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {hasMore && (
                        <button
                            onClick={() => fetchPage(entries.length, true)}
                            disabled={loading}
                            style={{ alignSelf: 'center', marginTop: '8px', padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px' }}
                        >
                            {loading ? 'Loading…' : 'Load more'}
                        </button>
                    )}
                </div>
            )}

            {/* Email Viewer Modal */}
            {viewItem && (
                <div ref={backdropRef} style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999
                }}>
                    <div role="dialog" aria-modal="true" aria-label={viewItem.subject || 'Email preview'} style={{
                        width: '800px', maxWidth: '90vw', height: '80vh', background: 'var(--bg-surface-elevated)',
                        borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        <div style={{ padding: '16px', background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{viewItem.subject}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>From: {viewItem.sender}</div>
                            </div>
                            <button ref={closeRef} aria-label="Close preview" onClick={() => setViewItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '20px', cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ flex: 1, position: 'relative', background: 'var(--bg-surface)' }}>
                            <iframe
                                // Same builder as InboxZero's viewers: literal theme colors (var(--…) can't cross into
                                // an srcdoc iframe), so the body follows the dialog's theme instead of a white slab.
                                srcDoc={buildEmailSrcDoc(
                                    sanitizeHtml(viewItem.body || '') || `<div class="empty"><p>No rich content available.</p><blockquote style="text-align:left;font-style:normal">${sanitizeHtml(viewItem.snippet || '')}</blockquote></div>`,
                                    themePalette(),
                                    'comfortable',
                                )}
                                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                                title="audit-email-body"
                                sandbox=""
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
