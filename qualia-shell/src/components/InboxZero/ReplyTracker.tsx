/**
 * ReplyTracker.tsx — Phase 5.2
 *
 * Frontend UI for the Reply Tracking system.
 * Displays:
 *   - Stats overview (awaiting, overdue, received, response rate)
 *   - Awaiting tab with overdue highlighting
 *   - Manual track form for new outbound emails
 *   - Config controls (deadlines, auto-expire, notifications)
 */

import React, { useState, useEffect, useCallback } from 'react';

interface TrackedReply {
    id: string;
    inbox_item_id: string | null;
    sender: string;
    recipient: string;
    subject: string;
    sent_at: string;
    expected_reply_by: string | null;
    actual_reply_at: string | null;
    status: 'awaiting' | 'received' | 'snoozed' | 'closed' | 'expired';
    snooze_until: string | null;
    snooze_reason: string | null;
    priority: 'high' | 'medium' | 'low';
    notes: string;
    is_overdue?: boolean;
    days_waiting?: number;
}

interface ReplyTrackingConfig {
    enabled: boolean;
    defaultDeadlineDays: number;
    highPriorityDeadlineDays: number;
    autoExpireDays: number;
    notifyOnOverdue: boolean;
}

interface Stats {
    totalTracked: number;
    awaiting: number;
    overdue: number;
    snoozed: number;
    received: number;
    expired: number;
    avgResponseDays: number;
    responseRate: number;
}

type SubView = 'overview' | 'awaiting' | 'track' | 'config';

const BASE = () => (window as any).__QUALIA_API__ || 'http://localhost:3000';

export default function ReplyTracker() {
    const [view, setView] = useState<SubView>('overview');
    const [stats, setStats] = useState<Stats | null>(null);
    const [config, setConfig] = useState<ReplyTrackingConfig | null>(null);
    const [awaitingItems, setAwaitingItems] = useState<TrackedReply[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Track form state
    const [trackForm, setTrackForm] = useState({
        sender: '', recipient: '', subject: '', priority: 'medium' as 'high' | 'medium' | 'low', notes: '',
    });

    const fetchOverview = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${BASE()}/api/v1/inbox/replies`);
            if (res.ok) {
                const data = await res.json();
                setStats(data.stats);
                setConfig(data.config);
            }
        } catch { /* silent */ }
        setLoading(false);
    }, []);

    const fetchAwaiting = useCallback(async () => {
        try {
            const res = await fetch(`${BASE()}/api/v1/inbox/replies/awaiting`);
            if (res.ok) {
                const data = await res.json();
                setAwaitingItems(data.items || []);
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchOverview();
        fetchAwaiting();
    }, [fetchOverview, fetchAwaiting]);

    const updateConfig = async (updates: Partial<ReplyTrackingConfig>) => {
        setSaving(true);
        try {
            const res = await fetch(`${BASE()}/api/v1/inbox/replies/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (res.ok) {
                const data = await res.json();
                setConfig(data.config);
            }
        } catch { /* silent */ }
        setSaving(false);
    };

    const markReceived = async (id: string) => {
        try {
            await fetch(`${BASE()}/api/v1/inbox/replies/${id}/received`, { method: 'POST' });
            fetchAwaiting();
            fetchOverview();
        } catch { /* silent */ }
    };

    const closeItem = async (id: string) => {
        try {
            await fetch(`${BASE()}/api/v1/inbox/replies/${id}/close`, { method: 'POST' });
            fetchAwaiting();
            fetchOverview();
        } catch { /* silent */ }
    };

    const snoozeItem = async (id: string, days: number) => {
        const snoozeUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        try {
            await fetch(`${BASE()}/api/v1/inbox/replies/${id}/snooze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ snoozeUntil, reason: `Snoozed for ${days} days` }),
            });
            fetchAwaiting();
            fetchOverview();
        } catch { /* silent */ }
    };

    const runDetection = async () => {
        try {
            await fetch(`${BASE()}/api/v1/inbox/replies/detect`, { method: 'POST' });
            fetchAwaiting();
            fetchOverview();
        } catch { /* silent */ }
    };

    const submitTrack = async () => {
        if (!trackForm.sender || !trackForm.recipient) return;
        setSaving(true);
        try {
            await fetch(`${BASE()}/api/v1/inbox/replies/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trackForm),
            });
            setTrackForm({ sender: '', recipient: '', subject: '', priority: 'medium', notes: '' });
            fetchAwaiting();
            fetchOverview();
            setView('awaiting');
        } catch { /* silent */ }
        setSaving(false);
    };

    // Styles
    const s = {
        container: { padding: '24px', maxWidth: '900px' } as React.CSSProperties,
        header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } as React.CSSProperties,
        title: { fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' } as React.CSSProperties,
        tabs: { display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '3px' } as React.CSSProperties,
        tab: (active: boolean) => ({
            padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
            background: active ? 'rgba(59,130,246,0.2)' : 'transparent', color: active ? '#60a5fa' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.15s',
        }) as React.CSSProperties,
        statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' } as React.CSSProperties,
        statCard: { padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' } as React.CSSProperties,
        statValue: { fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' } as React.CSSProperties,
        statLabel: { fontSize: '11px', opacity: 0.5, fontWeight: 600, letterSpacing: '0.5px', marginTop: '4px' } as React.CSSProperties,
        section: { marginBottom: '20px' } as React.CSSProperties,
        sectionTitle: { fontSize: '13px', fontWeight: 700, opacity: 0.6, letterSpacing: '0.5px', marginBottom: '10px' } as React.CSSProperties,
        table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' } as React.CSSProperties,
        th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', opacity: 0.5, fontWeight: 700, fontSize: '10px', letterSpacing: '0.5px' } as React.CSSProperties,
        td: { padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' } as React.CSSProperties,
        overdueRow: { background: 'rgba(239,68,68,0.05)' } as React.CSSProperties,
        priorityBadge: (p: string) => ({
            display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
            background: p === 'high' ? 'rgba(239,68,68,0.15)' : p === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
            color: p === 'high' ? '#ef4444' : p === 'medium' ? '#f59e0b' : '#22c55e',
        }) as React.CSSProperties,
        statusBadge: (st: string) => ({
            display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
            background: st === 'overdue' ? 'rgba(239,68,68,0.15)' : st === 'awaiting' ? 'rgba(59,130,246,0.15)' : 'rgba(34,197,94,0.15)',
            color: st === 'overdue' ? '#ef4444' : st === 'awaiting' ? '#60a5fa' : '#22c55e',
        }) as React.CSSProperties,
        formGroup: { marginBottom: '14px' } as React.CSSProperties,
        label: { display: 'block', fontSize: '11px', fontWeight: 700, opacity: 0.6, marginBottom: '4px', letterSpacing: '0.5px' } as React.CSSProperties,
        input: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 12px', color: 'inherit', fontSize: '12px', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
        select: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 12px', color: 'inherit', fontSize: '12px' } as React.CSSProperties,
        btn: (variant: 'primary' | 'ghost' | 'danger') => ({
            padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            border: variant === 'ghost' ? '1px solid rgba(255,255,255,0.1)' : 'none',
            background: variant === 'primary' ? 'rgba(59,130,246,0.2)' : variant === 'danger' ? 'rgba(239,68,68,0.15)' : 'transparent',
            color: variant === 'primary' ? '#60a5fa' : variant === 'danger' ? '#ef4444' : 'rgba(255,255,255,0.6)',
        }) as React.CSSProperties,
        toggle: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '12px' } as React.CSSProperties,
        empty: { textAlign: 'center' as const, padding: '40px', opacity: 0.4, fontSize: '13px' } as React.CSSProperties,
    };

    if (loading && !stats) return <div style={s.empty}>Loading reply tracking data...</div>;

    const overdueItems = awaitingItems.filter(i => i.is_overdue);
    const onTrackItems = awaitingItems.filter(i => !i.is_overdue);

    return (
        <div style={s.container}>
            <div style={s.header}>
                <div style={s.title}>📩 Reply Tracker</div>
                <div style={s.tabs}>
                    <button style={s.tab(view === 'overview')} onClick={() => setView('overview')}>Overview</button>
                    <button style={s.tab(view === 'awaiting')} onClick={() => { setView('awaiting'); fetchAwaiting(); }}>
                        Awaiting {stats && stats.overdue > 0 && <span style={{ color: '#ef4444', marginLeft: '4px' }}>({stats.overdue}⚠️)</span>}
                    </button>
                    <button style={s.tab(view === 'track')} onClick={() => setView('track')}>+ Track</button>
                    <button style={s.tab(view === 'config')} onClick={() => setView('config')}>Config</button>
                </div>
            </div>

            {/* ====== OVERVIEW ====== */}
            {view === 'overview' && stats && (
                <>
                    <div style={s.statGrid}>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, color: '#60a5fa' }}>{stats.awaiting}</div>
                            <div style={s.statLabel}>AWAITING REPLY</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, color: '#ef4444' }}>{stats.overdue}</div>
                            <div style={s.statLabel}>OVERDUE</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, color: '#22c55e' }}>{stats.responseRate}%</div>
                            <div style={s.statLabel}>RESPONSE RATE</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, color: '#f59e0b' }}>{stats.avgResponseDays}d</div>
                            <div style={s.statLabel}>AVG RESPONSE</div>
                        </div>
                    </div>

                    {/* Secondary stats */}
                    <div style={{ ...s.statGrid, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, fontSize: '22px', color: '#a78bfa' }}>{stats.totalTracked}</div>
                            <div style={s.statLabel}>TOTAL TRACKED</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, fontSize: '22px', color: '#22c55e' }}>{stats.received}</div>
                            <div style={s.statLabel}>REPLIES RECEIVED</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, fontSize: '22px', opacity: 0.5 }}>{stats.snoozed}</div>
                            <div style={s.statLabel}>SNOOZED</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button style={s.btn('primary')} onClick={runDetection}>🔍 Scan for Replies</button>
                    </div>

                    {stats.totalTracked === 0 && (
                        <div style={s.empty}>No tracked replies yet. Use the "+ Track" tab to start tracking outbound emails.</div>
                    )}
                </>
            )}

            {/* ====== AWAITING ====== */}
            {view === 'awaiting' && (
                <div>
                    {/* Overdue section */}
                    {overdueItems.length > 0 && (
                        <div style={s.section}>
                            <div style={{ ...s.sectionTitle, color: '#ef4444' }}>⚠️ OVERDUE ({overdueItems.length})</div>
                            <table style={s.table}>
                                <thead>
                                    <tr>
                                        <th style={s.th}>RECIPIENT</th>
                                        <th style={s.th}>SUBJECT</th>
                                        <th style={s.th}>PRIORITY</th>
                                        <th style={s.th}>DAYS</th>
                                        <th style={s.th}>DEADLINE</th>
                                        <th style={s.th}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overdueItems.map(item => (
                                        <tr key={item.id} style={s.overdueRow}>
                                            <td style={{ ...s.td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.recipient}</td>
                                            <td style={{ ...s.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject || '—'}</td>
                                            <td style={s.td}><span style={s.priorityBadge(item.priority)}>{item.priority}</span></td>
                                            <td style={{ ...s.td, color: '#ef4444', fontWeight: 700 }}>{item.days_waiting}d</td>
                                            <td style={{ ...s.td, opacity: 0.5, whiteSpace: 'nowrap' }}>{item.expected_reply_by ? new Date(item.expected_reply_by).toLocaleDateString() : '—'}</td>
                                            <td style={s.td}>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button style={s.btn('primary')} onClick={() => markReceived(item.id)} title="Mark as replied">✓</button>
                                                    <button style={s.btn('ghost')} onClick={() => snoozeItem(item.id, 3)} title="Snooze 3 days">💤</button>
                                                    <button style={s.btn('ghost')} onClick={() => closeItem(item.id)} title="Stop tracking">✕</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* On-track section */}
                    <div style={s.section}>
                        <div style={s.sectionTitle}>⏳ ON TRACK ({onTrackItems.length})</div>
                        {onTrackItems.length === 0 && overdueItems.length === 0 ? (
                            <div style={s.empty}>No emails being tracked. Use "+ Track" to start.</div>
                        ) : onTrackItems.length === 0 ? (
                            <div style={{ ...s.empty, padding: '16px' }}>All awaiting items are overdue.</div>
                        ) : (
                            <table style={s.table}>
                                <thead>
                                    <tr>
                                        <th style={s.th}>RECIPIENT</th>
                                        <th style={s.th}>SUBJECT</th>
                                        <th style={s.th}>PRIORITY</th>
                                        <th style={s.th}>DAYS</th>
                                        <th style={s.th}>DUE</th>
                                        <th style={s.th}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {onTrackItems.map(item => (
                                        <tr key={item.id}>
                                            <td style={{ ...s.td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.recipient}</td>
                                            <td style={{ ...s.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject || '—'}</td>
                                            <td style={s.td}><span style={s.priorityBadge(item.priority)}>{item.priority}</span></td>
                                            <td style={s.td}>{item.days_waiting}d</td>
                                            <td style={{ ...s.td, opacity: 0.5, whiteSpace: 'nowrap' }}>{item.expected_reply_by ? new Date(item.expected_reply_by).toLocaleDateString() : '—'}</td>
                                            <td style={s.td}>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button style={s.btn('primary')} onClick={() => markReceived(item.id)} title="Mark as replied">✓</button>
                                                    <button style={s.btn('ghost')} onClick={() => snoozeItem(item.id, 3)} title="Snooze 3 days">💤</button>
                                                    <button style={s.btn('ghost')} onClick={() => closeItem(item.id)} title="Stop tracking">✕</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ====== TRACK FORM ====== */}
            {view === 'track' && (
                <div style={{ maxWidth: '500px' }}>
                    <div style={s.sectionTitle}>📧 TRACK NEW OUTBOUND EMAIL</div>

                    <div style={s.formGroup}>
                        <label style={s.label}>FROM (your email)</label>
                        <input style={s.input} value={trackForm.sender} onChange={e => setTrackForm({ ...trackForm, sender: e.target.value })} placeholder="you@zpgroup.io" />
                    </div>

                    <div style={s.formGroup}>
                        <label style={s.label}>TO (recipient)</label>
                        <input style={s.input} value={trackForm.recipient} onChange={e => setTrackForm({ ...trackForm, recipient: e.target.value })} placeholder="vendor@example.com" />
                    </div>

                    <div style={s.formGroup}>
                        <label style={s.label}>SUBJECT</label>
                        <input style={s.input} value={trackForm.subject} onChange={e => setTrackForm({ ...trackForm, subject: e.target.value })} placeholder="Quote request for unit 204 repairs" />
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={s.label}>PRIORITY</label>
                            <select style={s.select} value={trackForm.priority} onChange={e => setTrackForm({ ...trackForm, priority: e.target.value as any })}>
                                <option value="high">🔴 High</option>
                                <option value="medium">🟡 Medium</option>
                                <option value="low">🟢 Low</option>
                            </select>
                        </div>
                    </div>

                    <div style={s.formGroup}>
                        <label style={s.label}>NOTES (optional)</label>
                        <input style={s.input} value={trackForm.notes} onChange={e => setTrackForm({ ...trackForm, notes: e.target.value })} placeholder="Vendor should reply within 48h per contract terms" />
                    </div>

                    <button style={{ ...s.btn('primary'), padding: '10px 24px', fontSize: '13px' }} onClick={submitTrack} disabled={saving || !trackForm.sender || !trackForm.recipient}>
                        📩 Start Tracking
                    </button>
                </div>
            )}

            {/* ====== CONFIG ====== */}
            {view === 'config' && config && (
                <div>
                    <div style={s.toggle}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '13px' }}>📩 Reply Tracking</div>
                            <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '2px' }}>Track outbound emails and remind you when no reply is received</div>
                        </div>
                        <button
                            style={{ ...s.btn(config.enabled ? 'primary' : 'ghost'), minWidth: '80px' }}
                            onClick={() => updateConfig({ enabled: !config.enabled })}
                            disabled={saving}
                        >
                            {config.enabled ? '🟢 ON' : '⚪ OFF'}
                        </button>
                    </div>

                    <div style={s.toggle}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '13px' }}>🔔 Overdue Notifications</div>
                            <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '2px' }}>Show overdue badge in the Replies tab header</div>
                        </div>
                        <button
                            style={{ ...s.btn(config.notifyOnOverdue ? 'primary' : 'ghost'), minWidth: '80px' }}
                            onClick={() => updateConfig({ notifyOnOverdue: !config.notifyOnOverdue })}
                            disabled={saving}
                        >
                            {config.notifyOnOverdue ? '🟢 ON' : '⚪ OFF'}
                        </button>
                    </div>

                    <div style={{ ...s.toggle, flexDirection: 'column', alignItems: 'stretch' }}>
                        <div style={s.sectionTitle}>⏱️ DEADLINE SETTINGS</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={s.label}>DEFAULT DEADLINE</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input
                                        type="number"
                                        style={{ ...s.input, width: '60px' }}
                                        value={config.defaultDeadlineDays}
                                        min={1}
                                        max={30}
                                        onChange={e => updateConfig({ defaultDeadlineDays: parseInt(e.target.value, 10) || 3 })}
                                    />
                                    <span style={{ fontSize: '11px', opacity: 0.5 }}>days</span>
                                </div>
                            </div>
                            <div>
                                <label style={s.label}>HIGH PRIORITY</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input
                                        type="number"
                                        style={{ ...s.input, width: '60px' }}
                                        value={config.highPriorityDeadlineDays}
                                        min={1}
                                        max={7}
                                        onChange={e => updateConfig({ highPriorityDeadlineDays: parseInt(e.target.value, 10) || 1 })}
                                    />
                                    <span style={{ fontSize: '11px', opacity: 0.5 }}>days</span>
                                </div>
                            </div>
                            <div>
                                <label style={s.label}>AUTO-EXPIRE</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input
                                        type="number"
                                        style={{ ...s.input, width: '60px' }}
                                        value={config.autoExpireDays}
                                        min={7}
                                        max={90}
                                        onChange={e => updateConfig({ autoExpireDays: parseInt(e.target.value, 10) || 14 })}
                                    />
                                    <span style={{ fontSize: '11px', opacity: 0.5 }}>days</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
