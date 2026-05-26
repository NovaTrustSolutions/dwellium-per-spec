/**
 * OpenTracker.tsx — Email Open Pixel Tracker Tab
 * Create tracking pixels, embed in outbound emails, see who opened.
 */
import { useState, useEffect, useCallback } from 'react';

interface Tracker {
    id: string;
    subject: string;
    recipient: string;
    createdAt: string;
    opens: { timestamp: string; ip: string; ua: string }[];
    openCount: number;
    lastOpened: string | null;
    pixelUrl?: string;
    htmlSnippet?: string;
}

export default function OpenTracker() {
    const [trackers, setTrackers] = useState<Tracker[]>([]);
    const [loading, setLoading] = useState(true);
    const [subject, setSubject] = useState('');
    const [recipient, setRecipient] = useState('');
    const [creating, setCreating] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const authFetch = useCallback(async (url: string, opts?: RequestInit) => {
        const token = localStorage.getItem('auth_token');
        return fetch(url, {
            ...opts,
            headers: { ...(opts?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    }, []);

    const fetchTrackers = useCallback(async () => {
        try {
            const res = await authFetch('/api/inbox/tracker/list');
            const data = await res.json();
            if (data.success) setTrackers(data.data);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [authFetch]);

    useEffect(() => { fetchTrackers(); }, [fetchTrackers]);

    const createTracker = async () => {
        if (!subject.trim() || !recipient.trim()) return;
        setCreating(true);
        try {
            const res = await authFetch('/api/inbox/tracker', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject: subject.trim(), recipient: recipient.trim() }),
            });
            const data = await res.json();
            if (data.success) {
                setTrackers(prev => [data.data, ...prev]);
                setSubject('');
                setRecipient('');
            }
        } catch { /* ignore */ }
        finally { setCreating(false); }
    };

    const copyToClipboard = async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch { /* ignore */ }
    };

    const deleteTracker = async (id: string) => {
        await authFetch(`/api/inbox/tracker/${id}`, { method: 'DELETE' });
        setTrackers(prev => prev.filter(t => t.id !== id));
    };

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return d.toLocaleDateString();
    };

    const s = {
        wrap: { padding: 16, color: '#e2e8f0', fontFamily: 'inherit' } as React.CSSProperties,
        title: { fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
        form: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const } as React.CSSProperties,
        input: { flex: '1 1 200px', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit' } as React.CSSProperties,
        btn: { padding: '8px 16px', borderRadius: 6, border: 'none', background: '#D6FE51', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
        card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, marginBottom: 8 } as React.CSSProperties,
        badge: (count: number) => ({
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
            background: count > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
            color: count > 0 ? '#22c55e' : '#64748b',
            border: `1px solid ${count > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.2)'}`,
        }) as React.CSSProperties,
        snippet: { background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: '#94a3b8', position: 'relative' as const, marginTop: 8 } as React.CSSProperties,
        copyBtn: { position: 'absolute' as const, top: 6, right: 6, padding: '3px 8px', borderRadius: 4, border: '1px solid #475569', background: '#1e293b', color: '#94a3b8', fontSize: 10, cursor: 'pointer' } as React.CSSProperties,
    };

    return (
        <div style={s.wrap}>
            <div style={s.title}>
                👁️ Email Open Tracker
                <span style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>
                    Track if recipients opened your emails
                </span>
            </div>

            {/* Create new tracker */}
            <div style={s.form}>
                <input
                    style={s.input}
                    placeholder="Email subject line…"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                />
                <input
                    style={s.input}
                    placeholder="Recipient email…"
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                />
                <button
                    style={{ ...s.btn, opacity: (!subject.trim() || !recipient.trim()) ? 0.5 : 1 }}
                    disabled={creating || !subject.trim() || !recipient.trim()}
                    onClick={createTracker}
                >
                    {creating ? '⏳ Creating…' : '➕ Create Tracker'}
                </button>
            </div>

            {/* Trackers list */}
            {loading && <div style={{ color: '#64748b', fontSize: 12 }}>Loading trackers…</div>}

            {!loading && trackers.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: '#475569' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📧</div>
                    <div style={{ fontSize: 13 }}>No trackers yet. Create one above to start tracking email opens.</div>
                </div>
            )}

            {trackers.map(t => (
                <div key={t.id} style={s.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t.subject}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>To: {t.recipient} · {formatTime(t.createdAt)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={s.badge(t.openCount)}>
                                {t.openCount > 0 ? '👁️' : '⏳'} {t.openCount} open{t.openCount !== 1 ? 's' : ''}
                            </span>
                            <button
                                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}
                            >
                                {expandedId === t.id ? '▼' : '▶'}
                            </button>
                            <button
                                onClick={() => deleteTracker(t.id)}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                                title="Delete tracker"
                            >
                                🗑️
                            </button>
                        </div>
                    </div>

                    {t.lastOpened && (
                        <div style={{ fontSize: 10, color: '#22c55e', marginTop: 4 }}>
                            Last opened: {formatTime(t.lastOpened)}
                        </div>
                    )}

                    {expandedId === t.id && (
                        <div style={{ marginTop: 10 }}>
                            {/* Pixel HTML snippet */}
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>📋 Pixel HTML (paste in email body):</div>
                            <div style={s.snippet}>
                                <code>{`<img src="${window.location.origin}/api/inbox/tracker/${t.id}/pixel.gif" width="1" height="1" style="display:none" />`}</code>
                                <button
                                    style={s.copyBtn}
                                    onClick={() => copyToClipboard(
                                        `<img src="${window.location.origin}/api/inbox/tracker/${t.id}/pixel.gif" width="1" height="1" style="display:none" />`,
                                        t.id
                                    )}
                                >
                                    {copiedId === t.id ? '✅ Copied!' : '📋 Copy'}
                                </button>
                            </div>

                            {/* Opens log */}
                            {t.opens && t.opens.length > 0 && (
                                <div style={{ marginTop: 10 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>📊 Open History:</div>
                                    <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                                        {t.opens.map((open, i) => (
                                            <div key={i} style={{ display: 'flex', gap: 12, fontSize: 10, color: '#64748b', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <span>📅 {new Date(open.timestamp).toLocaleString()}</span>
                                                <span>🌐 {open.ip}</span>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                                    🖥️ {open.ua}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
