import { useState, useEffect, useCallback } from 'react';
import './InboxWidget.css';

interface InboxItem {
    id: string;
    source: string;
    subject: string;
    sender: string;
    snippet: string;
    summary?: string;
    signalClass: 'signal' | 'noise' | 'low_priority';
    urgency: 'high' | 'medium' | 'low';
    status: string;
    routedToProject?: string;
    routingConfidence?: number;
    routingReasoning?: string;
    hasAttachments: boolean;
    createdAt: string;
}

// Project ID → display name mapping
const PROJECT_NAMES: Record<string, string> = {
    'proj-invoicing': '💰 Invoicing',
    'proj-msa': '📜 MSA Management',
    'proj-onboarding': '👋 Onboarding',
    'proj-gdpr': '🔒 GDPR / Privacy',
    'proj-inventory': '📦 Inventory',
    'proj-brand-guidelines': '🎨 Brand Guidelines',
    'proj-reports': '📊 Financial Reports',
    'proj-hive': '🐝 The Hive',
    'proj-dashboard': '⚙️ AI-Dashboard369',
    'unrouted': '📥 Unrouted',
};

const SIGNAL_BADGES: Record<string, { label: string; color: string }> = {
    signal: { label: 'Signal', color: '#22c55e' },
    noise: { label: 'Noise', color: '#6b7280' },
    low_priority: { label: 'Low Priority', color: '#eab308' },
};

const URGENCY_ICONS: Record<string, string> = {
    high: '🔴',
    medium: '🟡',
    low: '🟢',
};

export default function InboxWidget() {
    const [items, setItems] = useState<InboxItem[]>([]);
    const [filter, setFilter] = useState<string>('all');
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<string | null>(null);
    const [routePickerFor, setRoutePickerFor] = useState<string | null>(null);

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
            const res = await fetch('/api/inbox/stats');
            const data = await res.json();
            if (data.success) setStats(data.data);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    }, []);

    useEffect(() => {
        fetchInbox();
        fetchStats();
    }, [fetchInbox, fetchStats]);

    const handleApprove = async (id: string, projectId?: string) => {
        try {
            const res = await fetch(`/api/inbox/${id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId })
            });
            if (res.ok) {
                setRoutePickerFor(null);
                fetchInbox();
                fetchStats();
            }
        } catch (err) {
            console.error('Approve failed:', err);
        }
    };

    const handleArchive = async (id: string) => {
        try {
            const res = await fetch(`/api/inbox/${id}/archive`, { method: 'POST' });
            if (res.ok) {
                fetchInbox();
                fetchStats();
            }
        } catch (err) {
            console.error('Archive failed:', err);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/inbox/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchInbox();
                fetchStats();
            }
        } catch (err) {
            console.error('Delete failed:', err);
        }
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
                        {f === 'all' ? '📥 All' : f === 'signal' ? '✅ Signal' : f === 'noise' ? '🗑️ Noise' : '⏸️ Low Priority'}
                    </button>
                ))}
            </div>

            {/* Loading state */}
            {loading && <div className="inbox-loading">Loading inbox...</div>}

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
                                <span className="urgency-icon">{URGENCY_ICONS[item.urgency]}</span>
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
                            <div className="card-routing">
                                ➜ {PROJECT_NAMES[item.routedToProject] || item.routedToProject}
                                {item.routingConfidence && (
                                    <span className="confidence">
                                        {Math.round(item.routingConfidence * 100)}% confident
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Expanded detail + actions */}
                        {selectedItem === item.id && (
                            <div className="card-actions" onClick={e => e.stopPropagation()}>
                                {item.routingReasoning && (
                                    <p className="routing-reason">🤖 {item.routingReasoning}</p>
                                )}

                                <div className="action-buttons">
                                    <button
                                        className="action-btn approve"
                                        onClick={() => {
                                            if (item.routedToProject) {
                                                handleApprove(item.id, item.routedToProject);
                                            } else {
                                                setRoutePickerFor(item.id);
                                            }
                                        }}
                                    >
                                        ✅ {item.routedToProject ? 'Approve & Route' : 'Approve'}
                                    </button>
                                    <button className="action-btn archive" onClick={() => handleArchive(item.id)}>
                                        📥 Archive
                                    </button>
                                    <button className="action-btn delete" onClick={() => handleDelete(item.id)}>
                                        🗑️ Delete
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
                                                    onClick={() => handleApprove(item.id, id)}
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
                        <span className="empty-icon">📭</span>
                        <p>Inbox clear — all caught up!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
