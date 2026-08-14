/**
 * StatusCheckModule — System Health Dashboard
 *
 * Shows green/red/yellow status indicators for all Dwellium services.
 * Auto-refreshes every 30 seconds.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../../../context/UserContext';
import { RefreshCw, Wifi, WifiOff, AlertTriangle, Clock, Server, Database, Brain, MessageSquare, Mail, Calendar, HardDrive, FileSearch, Mic, Shield } from 'lucide-react';
import { API_BASE } from '../../../config';

interface ServiceStatus {
    name: string;
    status: 'online' | 'offline' | 'degraded';
    details?: string;
    latencyMs?: number;
}

interface StatusData {
    timestamp: string;
    summary: { total: number; online: number; offline: number; degraded: number };
    services: ServiceStatus[];
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
    'Backend Server': <Server size={20} />,
    'SQLite Database': <Database size={20} />,
    'OpenAI / ARA': <Brain size={20} />,
    'Trello': <MessageSquare size={20} />,
    'ruVector': <FileSearch size={20} />,
    'Transcription': <Mic size={20} />,
    'Gmail': <Mail size={20} />,
    'Google Calendar': <Calendar size={20} />,
    'Google Drive': <HardDrive size={20} />,
    'Georgia Code (LanceDB)': <Shield size={20} />,
};

const STATUS_CONFIG = {
    online: { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', label: 'Online', icon: <Wifi size={14} /> },
    offline: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', label: 'Offline', icon: <WifiOff size={14} /> },
    degraded: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', label: 'Degraded', icon: <AlertTriangle size={14} /> },
};

/**
 * Repair action per service — a status page that can't fix anything is a
 * dead end. Only services with a REAL repair endpoint get a button; env-only
 * config (Trello, OpenAI) keeps its honest detail text instead.
 * Returns a user-facing progress/result message.
 */
const authHeaders = (): Record<string, string> => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const reconnectGoogle = async (): Promise<string> => {
    const res = await fetch(`${API_BASE}/api/google/oauth/start?mode=json`, { headers: authHeaders() });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success || !json?.data?.url) {
        throw new Error(json?.error || `OAuth start failed (HTTP ${res.status})`);
    }
    window.open(json.data.url, '_blank', 'noopener');
    return 'Google consent opened in a new tab — statuses refresh automatically after you approve.';
};

const FIX_ACTIONS: Record<string, { label: string; run: () => Promise<string> }> = {
    'Gmail': { label: 'Reconnect Google', run: reconnectGoogle },
    'Google Calendar': { label: 'Reconnect Google', run: reconnectGoogle },
    'Google Drive': { label: 'Reconnect Google', run: reconnectGoogle },
    'ruVector': {
        label: 'Re-index',
        run: async () => {
            const res = await fetch(`${API_BASE}/api/search/index`, { method: 'POST', headers: authHeaders() });
            const json = await res.json().catch(() => null);
            if (res.status === 409) return 'Indexing already in progress — check back shortly.';
            if (!res.ok) throw new Error(json?.error || `Re-index failed (HTTP ${res.status})`);
            return 'Re-index started — the card goes green when documents land.';
        },
    },
};

export default function StatusCheckModule() {
    const [data, setData] = useState<StatusData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lastChecked, setLastChecked] = useState<Date | null>(null);
    /** Service name whose fix action is running, and the last action's outcome. */
    const [fixing, setFixing] = useState<string | null>(null);
    const [fixMsg, setFixMsg] = useState('');

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const token = getAuthToken();
            const res = await fetch(`${API_BASE}/api/status`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setData(json);
                setLastChecked(new Date());
            } else {
                setError(json.error || 'Unknown error');
            }
        } catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const summary = data?.summary;
    const overallColor = !summary ? '#64748b'
        : summary.offline > 0 ? '#ef4444'
            : summary.degraded > 0 ? '#f59e0b'
                : '#22c55e';

    return (
        <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 12, height: 12, borderRadius: '50%',
                            background: overallColor,
                            boxShadow: `0 0 8px ${overallColor}60`,
                            animation: loading ? 'pulse 1.5s infinite' : 'none',
                        }} />
                        Status Check
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {summary
                            ? `${summary.online} online · ${summary.degraded} degraded · ${summary.offline} offline`
                            : 'Checking services...'
                        }
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {lastChecked && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={11} />
                            {lastChecked.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        onClick={fetchStatus}
                        disabled={loading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-primary)', cursor: loading ? 'wait' : 'pointer', fontSize: 13,
                        }}
                    >
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        {loading ? 'Checking...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
                    {[
                        { label: 'Online', count: summary.online, color: '#22c55e' },
                        { label: 'Degraded', count: summary.degraded, color: '#f59e0b' },
                        { label: 'Offline', count: summary.offline, color: '#ef4444' },
                    ].map(card => (
                        <div key={card.label} style={{
                            padding: '16px 20px', borderRadius: 12,
                            background: `${card.color}08`, border: `1px solid ${card.color}20`,
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 28, fontWeight: 800, color: card.color }}>{card.count}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{
                    padding: '12px 16px', borderRadius: 10, marginBottom: '1rem',
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    color: '#ef4444', fontSize: 13,
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <AlertTriangle size={14} aria-hidden /> Failed to check status: {error}
                </div>
            )}

            {/* Fix-action outcome */}
            {fixMsg && (
                <div role="status" style={{
                    padding: '12px 16px', borderRadius: 10, marginBottom: '1rem',
                    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                    color: 'var(--text-secondary)', fontSize: 13,
                }}>
                    {fixMsg}
                </div>
            )}

            {/* Service Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {(data?.services || []).map(svc => {
                    const config = STATUS_CONFIG[svc.status];
                    const icon = SERVICE_ICONS[svc.name] || <Server size={20} />;

                    return (
                        <div key={svc.name} style={{
                            padding: '16px 18px', borderRadius: 12,
                            background: config.bg, border: `1px solid ${config.border}`,
                            transition: 'all 0.2s',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ color: config.color, opacity: 0.8 }}>
                                        {icon}
                                    </div>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{svc.name}</span>
                                </div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '3px 8px', borderRadius: 6,
                                    background: `${config.color}15`, color: config.color,
                                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                }}>
                                    <div style={{
                                        width: 7, height: 7, borderRadius: '50%',
                                        background: config.color,
                                        boxShadow: `0 0 6px ${config.color}80`,
                                    }} />
                                    {config.label}
                                </div>
                            </div>

                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                {svc.details || '—'}
                            </div>

                            {svc.status !== 'online' && FIX_ACTIONS[svc.name] && (
                                <button
                                    type="button"
                                    disabled={fixing !== null}
                                    onClick={async () => {
                                        setFixing(svc.name);
                                        setFixMsg('');
                                        try {
                                            setFixMsg(await FIX_ACTIONS[svc.name].run());
                                        } catch (e: any) {
                                            setFixMsg(`${svc.name}: ${e.message}`);
                                        }
                                        setFixing(null);
                                    }}
                                    style={{
                                        marginTop: 10, padding: '5px 12px', borderRadius: 6,
                                        border: `1px solid ${config.color}55`, background: 'transparent',
                                        color: config.color, fontSize: 12, fontWeight: 600,
                                        cursor: fixing ? 'wait' : 'pointer',
                                    }}
                                >
                                    {fixing === svc.name ? 'Working…' : FIX_ACTIONS[svc.name].label}
                                </button>
                            )}

                            {svc.latencyMs !== undefined && (
                                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Clock size={10} />
                                    {svc.latencyMs}ms
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Auto-refresh note */}
            <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>
                Auto-refreshes every 30 seconds
            </p>
        </div>
    );
}
