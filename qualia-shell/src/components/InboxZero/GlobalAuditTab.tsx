/**
 * GAP-08: GlobalAuditTab — shows cross-item audit log from /api/inbox/audit/global
 */
import React, { useEffect, useState, useCallback } from 'react';

interface AuditEntry {
    id?: string;
    inbox_item_id: string;
    action: string;
    actor: string;
    reason?: string;
    details?: string;
    created_at: string;
}

interface GlobalAuditTabProps {
    apiBase: string;
    authFetch?: (url: string, opts?: RequestInit) => Promise<Response>;
}

export function GlobalAuditTab({ apiBase, authFetch }: GlobalAuditTabProps) {
    const apiFetch = authFetch || fetch;
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [limit, setLimit] = useState(-1);
    const [viewItem, setViewItem] = useState<any | null>(null);

    const fetchAudit = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`${apiBase}/audit/global?limit=${limit}`);
            const data = await res.json();
            if (data.success) setEntries(data.data || []);
        } catch { /* offline */ } finally {
            setLoading(false);
        }
    }, [apiBase, limit]);

    useEffect(() => {
        fetchAudit();
    }, [fetchAudit]);

    const handleView = async (id: string) => {
        try {
            const res = await apiFetch(`${apiBase}/${id}`);
            const data = await res.json();
            if (data.success && data.data) {
                setViewItem(data.data);
            } else {
                window.dispatchEvent(new CustomEvent('qualia-toast', { detail: '⚠️ Could not load item details' }));
            }
        } catch {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: '❌ Network error loading item' }));
        }
    };

    const handleRecover = async (id: string) => {
        try {
            const res = await apiFetch(`${apiBase}/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'pending', reason: 'Recovered from Audit Log' }),
            });
            if (res.ok) {
                window.dispatchEvent(new CustomEvent('qualia-toast', { detail: '✅ Item recovered successfully' }));
                fetchAudit();
            } else {
                const errData = await res.json().catch(() => ({}));
                window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `❌ Failed to recover item: ${errData.error || res.status}` }));
            }
        } catch {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: '❌ Network error' }));
        }
    };

    const ACTION_COLORS: Record<string, string> = {
        approved: '#22c55e',
        archived: '#f59e0b',
        deleted: '#ef4444',
        snoozed: '#f59e0b',
        read: '#60a5fa',
        linked: '#D6FE51',
        unsubscribed: '#ec4899',
        retry: '#f97316',
    };

    return (
        <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, opacity: 0.9 }}>
                    📋 Global Audit Log
                </h3>
                <span style={{ fontSize: '11px', opacity: 0.4 }}>{entries.length} entries</span>
                <button
                    onClick={fetchAudit}
                    style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
                >
                    ↻ Refresh
                </button>
            </div>

            {loading && <div style={{ opacity: 0.4, fontSize: '13px' }}>Loading audit log…</div>}

            {!loading && entries.length === 0 && (
                <div style={{ opacity: 0.4, fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
                    No audit entries yet.
                </div>
            )}

            {!loading && entries.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {entries.map((entry, idx) => (
                        <div
                            key={entry.id || idx}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '80px 90px 70px 1fr auto',
                                gap: '8px',
                                alignItems: 'center',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                fontSize: '12px',
                            }}
                        >
                            <span style={{ opacity: 0.4, fontSize: '11px' }}>
                                {new Date(entry.created_at).toLocaleString('en-US', {
                                    month: 'short', day: 'numeric',
                                    hour: '2-digit', minute: '2-digit',
                                })}
                            </span>
                            <span style={{
                                fontWeight: 600,
                                color: ACTION_COLORS[entry.action] || '#cbd5e1',
                                fontSize: '11px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.4px',
                            }}>
                                {entry.action}
                            </span>
                            <span style={{ opacity: 0.5, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.actor}
                            </span>
                            <span style={{ opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.reason || '—'}
                            </span>
                            <span style={{ opacity: 0.3, fontSize: '11px', fontFamily: 'monospace' }}>
                                {entry.inbox_item_id?.slice(0, 8)}
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    onClick={() => handleView(entry.inbox_item_id)}
                                    style={{
                                        padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)',
                                        background: 'transparent', color: 'inherit', fontSize: '10px', cursor: 'pointer'
                                    }}
                                >
                                    👁️ View
                                </button>
                                <button
                                    onClick={() => handleRecover(entry.inbox_item_id)}
                                    style={{
                                        padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.4)',
                                        background: 'transparent', color: '#ef4444', fontSize: '10px', cursor: 'pointer'
                                    }}
                                >
                                    ↩️ Recover
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Email Viewer Modal */}
            {viewItem && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999
                }} onClick={() => setViewItem(null)}>
                    <div style={{
                        width: '800px', maxWidth: '90vw', height: '80vh', background: '#1e293b',
                        borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{viewItem.subject}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>From: {viewItem.sender}</div>
                            </div>
                            <button aria-label="Close preview" onClick={() => setViewItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '20px', cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ flex: 1, position: 'relative', background: 'var(--bg-surface)' }}>
                            <iframe 
                                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:28px 32px;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.75;color:#1e293b;background:var(--bg-surface);word-wrap:break-word;overflow-wrap:break-word}img{max-width:100%;height:auto;border-radius:6px;display:block;margin:12px 0}a{color:#2563eb;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{padding:10px 14px;border:1px solid var(--border-default);text-align:left;font-size:14px}th{background:#f8fafc;font-weight:600;color:#334155}blockquote{margin:16px 0;padding:14px 24px;border-left:4px solid #6366f1;background:#f8fafc;color:var(--text-tertiary);border-radius:0 8px 8px 0;font-style:italic}pre,code{font-family:'SF Mono',Monaco,Consolas,monospace;font-size:13px;background:var(--bg-surface-elevated);border-radius:4px;padding:2px 6px}pre{padding:16px 20px;overflow-x:auto;border:1px solid var(--border-default)}hr{border:none;border-top:1px solid var(--border-default);margin:20px 0}h1{font-size:22px;color:#0f172a;margin:20px 0 10px}h2{font-size:18px;color:#0f172a}h3{font-size:16px;color:#1e293b}ul,ol{padding-left:28px}li{margin:6px 0}p{margin:10px 0}.email-footer,.unsubscribe{font-size:11px;color:var(--text-secondary);margin-top:28px;padding-top:18px;border-top:1px solid var(--border-default)}</style></head><body>${viewItem.body || `<div style="padding:40px;text-align:center;color:var(--text-secondary);font-style:italic"><p style="font-size:24px">📧</p><p>No rich content available.</p><div style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:8px;text-align:left;color:var(--text-tertiary);font-style:normal">${viewItem.snippet || ''}</div></div>`}</body></html>`}
                                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                                title="audit-email-body"
                                sandbox="allow-same-origin"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
