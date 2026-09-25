/**
 * GlobalAuditTab — cross-item audit log, plan 066 §5b.
 * GET `${apiBase}/audit/global?limit&offset`; View merges GET `/:id` + `/:id/body`;
 * Recover (only for archive|bulk_archive|delete|snooze) → PUT `/:id/status`.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { ClipboardList, Eye, RefreshCw, Undo2 } from 'lucide-react';
import { sanitizeHtml } from '../../utils/safeMarkdown';

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
    // Preview dialog: focus the close button on open; Escape closes it.
    useEffect(() => {
        if (!viewItem) return;
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewItem(null); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
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
                                color: ACTION_COLORS[entry.action] || 'var(--text-secondary)',
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
                                            background: 'transparent', color: 'var(--danger)', fontSize: '10px', cursor: 'pointer',
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
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999
                }} onClick={() => setViewItem(null)}>
                    <div role="dialog" aria-modal="true" aria-label={viewItem.subject || 'Email preview'} style={{
                        width: '800px', maxWidth: '90vw', height: '80vh', background: 'var(--bg-surface-elevated)',
                        borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '16px', background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{viewItem.subject}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>From: {viewItem.sender}</div>
                            </div>
                            <button ref={closeRef} aria-label="Close preview" onClick={() => setViewItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '20px', cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ flex: 1, position: 'relative', background: 'var(--bg-surface)' }}>
                            <iframe
                                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:28px 32px;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.75;color:#1e293b;background:#fff;word-wrap:break-word;overflow-wrap:break-word}img{max-width:100%;height:auto;border-radius:6px;display:block;margin:12px 0}a{color:#2563eb;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{padding:10px 14px;border:1px solid #e2e8f0;text-align:left;font-size:14px}th{background:#f8fafc;font-weight:600;color:#334155}blockquote{margin:16px 0;padding:14px 24px;border-left:4px solid #6366f1;background:#f8fafc;color:#64748b;border-radius:0 8px 8px 0;font-style:italic}pre,code{font-family:'SF Mono',Monaco,Consolas,monospace;font-size:13px;background:#f1f5f9;border-radius:4px;padding:2px 6px}pre{padding:16px 20px;overflow-x:auto;border:1px solid #e2e8f0}hr{border:none;border-top:1px solid #e2e8f0;margin:20px 0}h1{font-size:22px;color:#0f172a;margin:20px 0 10px}h2{font-size:18px;color:#0f172a}h3{font-size:16px;color:#1e293b}ul,ol{padding-left:28px}li{margin:6px 0}p{margin:10px 0}.email-footer,.unsubscribe{font-size:11px;color:#64748b;margin-top:28px;padding-top:18px;border-top:1px solid #e2e8f0}</style></head><body>${sanitizeHtml(viewItem.body || '') || `<div style="padding:40px;text-align:center;color:#64748b;font-style:italic"><p>No rich content available.</p><div style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:8px;text-align:left;color:#475569;font-style:normal">${sanitizeHtml(viewItem.snippet || '')}</div></div>`}</body></html>`}
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
