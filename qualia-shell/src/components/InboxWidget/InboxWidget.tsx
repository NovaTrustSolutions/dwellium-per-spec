import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, BarChart3, Bot, Check, Circle, Download, Inbox, Link, Pause, RefreshCw, Settings, Timer, Trash2, TrendingUp, TriangleAlert } from 'lucide-react';
import './InboxWidget.css';

interface InboxItem {
    id: string;
    source: string;
    subject: string;
    sender: string;
    snippet: string;
    summary?: string;
    /** Optional rendered HTML body — populated only for sources that supply it (e.g. Gmail full-fetch). */
    body?: string;
    signalClass: 'signal' | 'noise' | 'low_priority';
    urgency: 'high' | 'medium' | 'low';
    status: string;
    routedToProject?: string;
    routingConfidence?: number;
    routingReasoning?: string;
    hasAttachments: boolean;
    createdAt: string;
    auditLog?: any[];
    links?: any[];
}

interface InboxMetrics {
    throughputToday: number;
    throughputWeek: number;
    avgResponseMinutes: number;
    backlogByAge: { fresh: number; aging: number; stale: number };
    approvalQueueDepth: number;
    totalProcessed: number;
}

// Project ID → display name mapping
const PROJECT_NAMES: Record<string, string> = {
    'proj-invoicing': 'Invoicing',
    'proj-msa': 'MSA Management',
    'proj-onboarding': 'Onboarding',
    'proj-gdpr': 'GDPR / Privacy',
    'proj-inventory': 'Inventory',
    'proj-brand-guidelines': 'Brand Guidelines',
    'proj-reports': 'Financial Reports',
    'proj-hive': 'The Hive',
    'proj-dashboard': 'AI-Dashboard369',
    'unrouted': 'Unrouted',
};

const SIGNAL_BADGES: Record<string, { label: string; color: string }> = {
    signal: { label: 'Signal', color: '#22c55e' },
    noise: { label: 'Noise', color: 'var(--text-tertiary)' },
    low_priority: { label: 'Low Priority', color: '#eab308' },
};

const URGENCY_COLORS: Record<string, string> = {
    high: '#ef4444',
    medium: '#eab308',
    low: '#22c55e',
};

export default function InboxWidget() {
    const [items, setItems] = useState<InboxItem[]>([]);
    const [filter, setFilter] = useState<string>('all');
    const [stats, setStats] = useState<any>(null);
    const [metrics, setMetrics] = useState<InboxMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<string | null>(null);
    const [routePickerFor, setRoutePickerFor] = useState<string | null>(null);
    const [error, setError] = useState<{ message: string; itemId: string; retryable: boolean } | null>(null);
    const [approvalDialog, setApprovalDialog] = useState<{ id: string; projectId?: string } | null>(null);
    const [approvalReason, setApprovalReason] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<Record<string, string>>({});

    const fetchInbox = useCallback(async () => {
        try {
            const params = filter !== 'all' ? `?signalClass=${filter}` : '';
            const res = await fetch(`/api/inbox${params}`);
            const data = await res.json();
            if (data.success) setItems(data.data);
        } catch (err) {
            console.error('Failed to fetch inbox:', err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    const fetchStats = useCallback(async () => {
        try {
            const [statsRes, metricsRes] = await Promise.all([
                fetch('/api/inbox/stats'),
                fetch('/api/inbox/metrics'),
            ]);
            const statsData = await statsRes.json();
            const metricsData = await metricsRes.json();
            if (statsData.success) setStats(statsData.data);
            if (metricsData.success) setMetrics(metricsData.data);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    }, []);

    useEffect(() => {
        fetchInbox();
        fetchStats();
    }, [fetchInbox, fetchStats]);

    const handleApprove = async (id: string, projectId?: string, reason?: string) => {
        setError(null);
        try {
            const res = await fetch(`/api/inbox/${id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, reason: reason || approvalReason })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setRoutePickerFor(null);
                setApprovalDialog(null);
                setApprovalReason('');
                fetchInbox();
                fetchStats();
            } else {
                setError({ message: data.error || 'Approve failed', itemId: id, retryable: data.retryable || false });
            }
        } catch (err: any) {
            setError({ message: `Network error: ${err.message}`, itemId: id, retryable: true });
        }
    };

    const handleArchive = async (id: string) => {
        setError(null);
        try {
            const res = await fetch(`/api/inbox/${id}/archive`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                if (data.gmailError) {
                    setError({ message: data.message, itemId: id, retryable: true });
                }
                fetchInbox();
                fetchStats();
            } else {
                setError({ message: data.error || 'Archive failed', itemId: id, retryable: data.retryable || false });
            }
        } catch (err: any) {
            setError({ message: `Network error: ${err.message}`, itemId: id, retryable: true });
        }
    };

    const handleDelete = async (id: string) => {
        setError(null);
        try {
            const res = await fetch(`/api/inbox/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                if (data.gmailError) {
                    setError({ message: data.message, itemId: id, retryable: true });
                }
                fetchInbox();
                fetchStats();
            } else {
                setError({ message: data.error || 'Delete failed', itemId: id, retryable: data.retryable || false });
            }
        } catch (err: any) {
            setError({ message: `Network error: ${err.message}`, itemId: id, retryable: true });
        }
    };

    const handleRetry = async (itemId: string) => {
        setError(null);
        try {
            const res = await fetch(`/api/inbox/${itemId}/retry`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                fetchInbox();
                fetchStats();
            } else {
                setError({ message: data.error || 'Retry failed', itemId, retryable: data.retryable || false });
            }
        } catch (err: any) {
            setError({ message: `Retry network error: ${err.message}`, itemId, retryable: true });
        }
    };

    const loadSettings = async () => {
        try {
            const res = await fetch('/api/inbox/settings');
            const data = await res.json();
            if (data.success) setSettings(data.data);
        } catch {}
    };

    const saveSettings = async () => {
        try {
            await fetch('/api/inbox/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
        } catch {}
    };

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        return d.toLocaleDateString();
    };

    return (
        <div className="inbox-widget">
            {/* Error/Retry Banner */}
            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', marginBottom: 8, fontSize: 12 }}>
                    <span style={{ color: '#ef4444', flex: 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}><TriangleAlert size={13} aria-hidden /> {error.message}</span>
                    {error.retryable && (
                        <button onClick={() => handleRetry(error.itemId)} style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #f59e0b', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><RefreshCw size={12} aria-hidden /> Retry</button>
                    )}
                    <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
            )}

            {/* Metrics Strip */}
            {metrics && (
                <div style={{ display: 'flex', gap: 12, padding: '6px 0', marginBottom: 6, fontSize: 10, color: 'var(--text-secondary)', overflowX: 'auto', flexWrap: 'wrap' }}>
                    <span>Today: <b style={{ color: '#22c55e' }}>{metrics.throughputToday}</b><BarChart3 size={14} /></span>
                    <span>Week: <b style={{ color: '#3b82f6' }}>{metrics.throughputWeek}</b><TrendingUp size={14} /></span>
                    <span>Avg: <b style={{ color: '#f59e0b' }}>{metrics.avgResponseMinutes}m</b><Timer size={14} /></span>
                    <span>Queue: <b style={{ color: metrics.approvalQueueDepth > 10 ? '#ef4444' : '#22c55e' }}>{metrics.approvalQueueDepth}</b><Inbox size={14} /></span>
                    <span style={{ color: 'var(--text-tertiary)' }}>Fresh: {metrics.backlogByAge.fresh} | Aging: {metrics.backlogByAge.aging} | Stale: <span style={{ color: metrics.backlogByAge.stale > 0 ? '#ef4444' : '#475569' }}>{metrics.backlogByAge.stale}</span></span>
                </div>
            )}

            {/* Stats bar */}
            {stats && (
                <div className="inbox-stats">
                    <span className="stat">
                        <span className="stat-num">{stats.pending}</span> pending
                    </span>
                    <span className="stat">
                        <span className="stat-num">{stats.signal || 0}</span> signal
                    </span>
                    <span className="stat noise">
                        <span className="stat-num">{stats.noise || 0}</span> noise
                    </span>
                    <span className="stat">
                        <span className="stat-num">{stats.approved || 0}</span> approved
                    </span>
                    <button onClick={() => { setShowSettings(!showSettings); if (!showSettings) loadSettings(); }}
                        style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}><Settings size={16} /></button>
                </div>
            )}

            {/* Settings Panel */}
            {showSettings && (
                <div style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 8, fontSize: 11 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}><Settings size={13} aria-hidden /> Inbox Settings</div>
                    {Object.entries(settings).map(([key, value]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ color: 'var(--text-tertiary)', flex: 1, fontSize: 10 }}>{key}:</span>
                            <input value={value} onChange={e => setSettings({ ...settings, [key]: e.target.value })}
                                style={{ width: 80, padding: '2px 6px', borderRadius: 3, border: '1px solid #334155', background: '#0f172a', color: 'var(--text-primary)', fontSize: 10 }} />
                        </div>
                    ))}
                    <button onClick={saveSettings} style={{ marginTop: 4, padding: '3px 10px', borderRadius: 4, border: '1px solid #3b82f6', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>Save Settings</button>
                </div>
            )}

            {/* Filter tabs */}
            <div className="inbox-filters">
                {['all', 'signal', 'noise', 'low_priority'].map(f => (
                    <button
                        key={f}
                        className={`filter-btn ${filter === f ? 'active' : ''}`}
                        onClick={() => setFilter(f)}
                    >
                        {f === 'all' ? <><Download size={12} aria-hidden /> All</> : f === 'signal' ? <><Check size={12} aria-hidden /> Signal</> : f === 'noise' ? <><Trash2 size={12} aria-hidden /> Noise</> : <><Pause size={12} aria-hidden /> Low Priority</>}
                    </button>
                ))}
            </div>

            {/* Loading state */}
            {loading && <div className="inbox-loading">Loading inbox...</div>}

            {/* Approval Confirmation Dialog */}
            {approvalDialog && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setApprovalDialog(null)}>
                    <div style={{ background: '#1e1e2e', border: '1px solid #334155', borderRadius: 8, padding: 20, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <h4 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Check size={15} aria-hidden /> Approve & Route</h4>
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>Provide a reason for this approval (required per B.L.A.S.T. Rule 1):</p>
                        <textarea
                            value={approvalReason}
                            onChange={e => setApprovalReason(e.target.value)}
                            placeholder="Approval reasoning..."
                            style={{ width: '100%', height: 60, padding: 8, borderRadius: 4, border: '1px solid #334155', background: '#0f172a', color: 'var(--text-primary)', fontSize: 11, resize: 'none', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                            <button onClick={() => { setApprovalDialog(null); setApprovalReason(''); }} style={{ padding: '5px 12px', borderRadius: 4, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                            <button onClick={() => handleApprove(approvalDialog.id, approvalDialog.projectId, approvalReason)} disabled={!approvalReason.trim()}
                                style={{ padding: '5px 12px', borderRadius: 4, border: 'none', background: approvalReason.trim() ? '#22c55e' : '#334155', color: 'var(--text-primary)', cursor: approvalReason.trim() ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 600 }}>Confirm Approval</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Items list */}
            <div className="inbox-items">
                {items.filter(i => i.status === 'pending').map(item => (
                    <div
                        key={item.id}
                        className={`inbox-card ${selectedItem === item.id ? 'expanded' : ''} signal-${item.signalClass}`}
                        onClick={() => setSelectedItem(selectedItem === item.id ? null : item.id)}
                    >
                        <div className="card-header">
                            <div className="card-left">
                                <span className="urgency-icon"><Circle size={10} aria-hidden fill={URGENCY_COLORS[item.urgency] || '#9ca3af'} color={URGENCY_COLORS[item.urgency] || '#9ca3af'} /></span>
                                <div className="card-title-block">
                                    <span className="card-subject">{item.subject}</span>
                                    <span className="card-sender">{item.sender}</span>
                                </div>
                            </div>
                            <div className="card-right">
                                <span
                                    className="signal-badge"
                                    style={{ background: SIGNAL_BADGES[item.signalClass]?.color }}
                                >
                                    {SIGNAL_BADGES[item.signalClass]?.label}
                                </span>
                                <span className="card-time">{formatTime(item.createdAt)}</span>
                            </div>
                        </div>

                        <p className="card-summary">{item.summary || item.snippet}</p>

                        {item.routedToProject && (
                            <div className="card-routing" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <ArrowRight size={13} aria-hidden /> {PROJECT_NAMES[item.routedToProject] || item.routedToProject}
                                {item.routingConfidence && (
                                    <span className="confidence">
                                        {Math.round(item.routingConfidence * 100)}% confident
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Thread Links */}
                        {item.links && item.links.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, padding: '4px 0', flexWrap: 'wrap' }}>
                                {item.links.map((link: any) => (
                                    <span key={link.id} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <Link size={10} aria-hidden /> {link.target_type}: {link.target_name || link.target_id.slice(0, 8)}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Expanded detail + actions */}
                        {selectedItem === item.id && (
                            <div className="card-actions" onClick={e => e.stopPropagation()}>
                                {/* Email Body (Iframe) */}
                                {item.body ? (
                                    <iframe 
                                        title="Email Content"
                                        srcDoc={`
                                            <html>
                                                <head>
                                                    <style>
                                                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 12px; margin: 0; background: var(--bg-surface); color: #111; word-wrap: break-word; }
                                                        img { max-width: 100%; height: auto; }
                                                        a { color: #2563eb; }
                                                    </style>
                                                </head>
                                                <body>${item.body}</body>
                                            </html>
                                        `}
                                        style={{
                                            width: '100%',
                                            height: '400px',
                                            border: 'none',
                                            borderRadius: '8px',
                                            background: 'var(--bg-surface)',
                                            marginBottom: '16px',
                                            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                                        }}
                                        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                                    />
                                ) : (
                                    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 16, color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: 13 }}>
                                        No rich content available. Viewing summary only.
                                    </div>
                                )}

                                {item.routingReasoning && (
                                    <p className="routing-reason"><Bot size={13} aria-hidden /> {item.routingReasoning}</p>
                                )}

                                {/* Audit Trail (if loaded) */}
                                {item.auditLog && item.auditLog.length > 0 && (
                                    <div style={{ marginBottom: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
                                        <span style={{ fontWeight: 600 }}>Audit:</span>
                                        {item.auditLog.slice(0, 3).map((log: any, i: number) => (
                                            <span key={i} style={{ marginLeft: 4 }}>{log.action} by {log.actor || 'system'} · </span>
                                        ))}
                                    </div>
                                )}

                                <div className="action-buttons">
                                    <button
                                        className="action-btn approve"
                                        onClick={() => {
                                            if (item.routedToProject) {
                                                setApprovalDialog({ id: item.id, projectId: item.routedToProject });
                                            } else {
                                                setRoutePickerFor(item.id);
                                            }
                                        }}
                                    >
                                        <Check size={13} aria-hidden /> {item.routedToProject ? 'Approve & Route' : 'Approve'}
                                    </button>
                                    <button className="action-btn archive" onClick={() => handleArchive(item.id)}>
                                        <Download size={13} aria-hidden /> Archive
                                    </button>
                                    <button className="action-btn delete" onClick={() => handleDelete(item.id)}>
                                        <Trash2 size={13} aria-hidden /> Delete
                                    </button>
                                </div>

                                {/* Route Picker */}
                                {routePickerFor === item.id && (
                                    <div className="route-picker">
                                        <p className="picker-label">Route to project:</p>
                                        <div className="picker-grid">
                                            {Object.entries(PROJECT_NAMES).filter(([k]) => k !== 'unrouted').map(([id, name]) => (
                                                <button
                                                    key={id}
                                                    className="picker-option"
                                                    onClick={() => setApprovalDialog({ id: item.id, projectId: id })}
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {!loading && items.filter(i => i.status === 'pending').length === 0 && (
                    <div className="inbox-empty">
                        <span className="empty-icon"><Inbox size={14} /></span>
                        <p>Inbox clear — all caught up!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
