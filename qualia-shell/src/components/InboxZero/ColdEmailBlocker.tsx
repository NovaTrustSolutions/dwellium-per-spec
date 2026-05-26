/**
 * ColdEmailBlocker.tsx — Phase 5.1
 *
 * Frontend UI for the Cold Email Blocker system.
 * Displays:
 *   - Stats overview (total scanned, blocked, block rate)
 *   - Config controls (enable/disable, threshold slider, whitelist)
 *   - Blocked emails log with score + signals breakdown
 *   - Top cold-sending domains table
 */

import React, { useState, useEffect, useCallback } from 'react';

interface ColdEmailConfig {
    enabled: boolean;
    threshold: number;
    autoArchive: boolean;
    whitelistDomains: string[];
}

interface ColdEmailStats {
    totalScanned: number;
    totalBlocked: number;
    blockRate: number;
    last24h: { scanned: number; blocked: number };
    topDomains: { domain: string; count: number; avgScore: number }[];
    recentBlocked: { id: string; sender: string; subject: string; score: number; created_at: string }[];
}

type SubView = 'overview' | 'log' | 'config';

const BASE = () => (window as any).__QUALIA_API__ || 'http://localhost:3000';

export default function ColdEmailBlocker() {
    const [view, setView] = useState<SubView>('overview');
    const [stats, setStats] = useState<ColdEmailStats | null>(null);
    const [config, setConfig] = useState<ColdEmailConfig | null>(null);
    const [log, setLogEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [whitelistInput, setWhitelistInput] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${BASE()}/api/v1/inbox/cold-email`);
            if (res.ok) {
                const data = await res.json();
                setStats(data.stats);
                setConfig(data.config);
                setWhitelistInput(data.config?.whitelistDomains?.join(', ') || '');
            }
        } catch { /* silent */ }
        setLoading(false);
    }, []);

    const fetchLog = useCallback(async () => {
        try {
            const res = await fetch(`${BASE()}/api/v1/inbox/cold-email/log?limit=50`);
            if (res.ok) {
                const data = await res.json();
                setLogEntries(data.entries || []);
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchData();
        fetchLog();
    }, [fetchData, fetchLog]);

    const updateConfig = async (updates: Partial<ColdEmailConfig>) => {
        setSaving(true);
        try {
            const res = await fetch(`${BASE()}/api/v1/inbox/cold-email/config`, {
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

    const clearColdFlag = async (itemId: string) => {
        try {
            await fetch(`${BASE()}/api/v1/inbox/cold-email/${itemId}/clear`, { method: 'POST' });
            fetchLog();
            fetchData();
        } catch { /* silent */ }
    };

    // Styles
    const s = {
        container: { padding: '24px', maxWidth: '900px' } as React.CSSProperties,
        header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } as React.CSSProperties,
        title: { fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' } as React.CSSProperties,
        tabs: { display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '3px' } as React.CSSProperties,
        tab: (active: boolean) => ({
            padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
            background: active ? 'rgba(214,254,81,0.2)' : 'transparent', color: active ? '#D6FE51' : 'rgba(255,255,255,0.5)',
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
        scoreBadge: (score: number) => ({
            display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
            background: score >= 0.8 ? 'rgba(239,68,68,0.15)' : score >= 0.6 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
            color: score >= 0.8 ? '#ef4444' : score >= 0.6 ? '#f59e0b' : '#22c55e',
        }) as React.CSSProperties,
        toggle: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '12px' } as React.CSSProperties,
        slider: { marginTop: '8px', width: '100%', accentColor: '#D6FE51' } as React.CSSProperties,
        input: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 12px', color: 'inherit', fontSize: '12px', width: '100%' } as React.CSSProperties,
        btn: (variant: 'primary' | 'ghost') => ({
            padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            border: variant === 'ghost' ? '1px solid rgba(255,255,255,0.1)' : 'none',
            background: variant === 'primary' ? 'rgba(214,254,81,0.2)' : 'transparent',
            color: variant === 'primary' ? '#D6FE51' : 'rgba(255,255,255,0.6)',
        }) as React.CSSProperties,
        empty: { textAlign: 'center' as const, padding: '40px', opacity: 0.4, fontSize: '13px' } as React.CSSProperties,
    };

    if (loading && !stats) return <div style={s.empty}>Loading cold email data...</div>;

    return (
        <div style={s.container}>
            <div style={s.header}>
                <div style={s.title}>🛡️ Cold Email Blocker</div>
                <div style={s.tabs}>
                    <button style={s.tab(view === 'overview')} onClick={() => setView('overview')}>Overview</button>
                    <button style={s.tab(view === 'log')} onClick={() => { setView('log'); fetchLog(); }}>Blocked Log</button>
                    <button style={s.tab(view === 'config')} onClick={() => setView('config')}>Config</button>
                </div>
            </div>

            {/* ====== OVERVIEW ====== */}
            {view === 'overview' && stats && (
                <>
                    <div style={s.statGrid}>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, color: '#D6FE51' }}>{stats.totalScanned}</div>
                            <div style={s.statLabel}>EMAILS SCANNED</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, color: '#ef4444' }}>{stats.totalBlocked}</div>
                            <div style={s.statLabel}>COLD BLOCKED</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, color: '#f59e0b' }}>{stats.blockRate}%</div>
                            <div style={s.statLabel}>BLOCK RATE</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={{ ...s.statValue, color: '#22c55e' }}>{stats.last24h.blocked}</div>
                            <div style={s.statLabel}>BLOCKED (24H)</div>
                        </div>
                    </div>

                    {/* Top cold-sending domains */}
                    {stats.topDomains.length > 0 && (
                        <div style={s.section}>
                            <div style={s.sectionTitle}>🏢 TOP COLD-SENDING DOMAINS</div>
                            <table style={s.table}>
                                <thead>
                                    <tr>
                                        <th style={s.th}>DOMAIN</th>
                                        <th style={s.th}>COUNT</th>
                                        <th style={s.th}>AVG SCORE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.topDomains.map((d, i) => (
                                        <tr key={i}>
                                            <td style={s.td}>{d.domain}</td>
                                            <td style={s.td}>{d.count}</td>
                                            <td style={s.td}><span style={s.scoreBadge(d.avgScore)}>{d.avgScore.toFixed(2)}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Recent blocked */}
                    {stats.recentBlocked.length > 0 && (
                        <div style={s.section}>
                            <div style={s.sectionTitle}>🚫 RECENTLY BLOCKED</div>
                            <table style={s.table}>
                                <thead>
                                    <tr>
                                        <th style={s.th}>SENDER</th>
                                        <th style={s.th}>SUBJECT</th>
                                        <th style={s.th}>SCORE</th>
                                        <th style={s.th}>WHEN</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.recentBlocked.map((item, i) => (
                                        <tr key={i}>
                                            <td style={{ ...s.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sender}</td>
                                            <td style={{ ...s.td, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</td>
                                            <td style={s.td}><span style={s.scoreBadge(item.score)}>{item.score.toFixed(2)}</span></td>
                                            <td style={{ ...s.td, whiteSpace: 'nowrap', opacity: 0.5 }}>{new Date(item.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {stats.totalScanned === 0 && (
                        <div style={s.empty}>No cold emails scanned yet. The blocker will analyze new incoming emails.</div>
                    )}
                </>
            )}

            {/* ====== BLOCKED LOG ====== */}
            {view === 'log' && (
                <div style={s.section}>
                    {log.length === 0 ? (
                        <div style={s.empty}>No cold emails blocked yet.</div>
                    ) : (
                        <table style={s.table}>
                            <thead>
                                <tr>
                                    <th style={s.th}>SENDER</th>
                                    <th style={s.th}>SUBJECT</th>
                                    <th style={s.th}>SCORE</th>
                                    <th style={s.th}>SIGNALS</th>
                                    <th style={s.th}>DATE</th>
                                    <th style={s.th}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {log.map((entry, i) => {
                                    let signals: any[] = [];
                                    try { signals = JSON.parse(entry.signals || '[]'); } catch { /* */ }
                                    return (
                                        <tr key={i}>
                                            <td style={{ ...s.td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.sender}</td>
                                            <td style={{ ...s.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.subject || '—'}</td>
                                            <td style={s.td}><span style={s.scoreBadge(entry.score)}>{entry.score.toFixed(2)}</span></td>
                                            <td style={s.td}>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {signals.slice(0, 3).map((sig: any, si: number) => (
                                                        <span key={si} style={{ padding: '1px 6px', borderRadius: '3px', background: 'rgba(214,254,81,0.1)', color: '#D6FE51', fontSize: '10px' }}>
                                                            {sig.signal}
                                                        </span>
                                                    ))}
                                                    {signals.length > 3 && <span style={{ fontSize: '10px', opacity: 0.4 }}>+{signals.length - 3}</span>}
                                                </div>
                                            </td>
                                            <td style={{ ...s.td, whiteSpace: 'nowrap', opacity: 0.5 }}>{new Date(entry.created_at).toLocaleDateString()}</td>
                                            <td style={s.td}>
                                                <button style={s.btn('ghost')} onClick={() => clearColdFlag(entry.inbox_item_id)} title="Not cold — false positive">✓ Clear</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ====== CONFIG ====== */}
            {view === 'config' && config && (
                <div>
                    {/* Enable/Disable toggle */}
                    <div style={s.toggle}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '13px' }}>🛡️ Cold Email Detection</div>
                            <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '2px' }}>Automatically detect and flag unsolicited cold outreach</div>
                        </div>
                        <button
                            style={{
                                ...s.btn(config.enabled ? 'primary' : 'ghost'),
                                minWidth: '80px',
                            }}
                            onClick={() => updateConfig({ enabled: !config.enabled })}
                            disabled={saving}
                        >
                            {config.enabled ? '🟢 ON' : '⚪ OFF'}
                        </button>
                    </div>

                    {/* Auto-archive toggle */}
                    <div style={s.toggle}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '13px' }}>📦 Auto-Archive Cold Emails</div>
                            <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '2px' }}>Automatically archive emails flagged as cold (instead of just tagging)</div>
                        </div>
                        <button
                            style={{
                                ...s.btn(config.autoArchive ? 'primary' : 'ghost'),
                                minWidth: '80px',
                            }}
                            onClick={() => updateConfig({ autoArchive: !config.autoArchive })}
                            disabled={saving}
                        >
                            {config.autoArchive ? '🟢 ON' : '⚪ OFF'}
                        </button>
                    </div>

                    {/* Threshold slider */}
                    <div style={{ ...s.toggle, flexDirection: 'column', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '13px' }}>🎯 Detection Threshold</div>
                                <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '2px' }}>Higher = fewer false positives, lower = catch more cold emails</div>
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#D6FE51' }}>{config.threshold.toFixed(2)}</div>
                        </div>
                        <input
                            type="range"
                            min="0.3"
                            max="0.9"
                            step="0.05"
                            value={config.threshold}
                            onChange={(e) => {
                                const t = parseFloat(e.target.value);
                                setConfig({ ...config, threshold: t });
                            }}
                            onMouseUp={(e) => updateConfig({ threshold: parseFloat((e.target as HTMLInputElement).value) })}
                            style={s.slider}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.3 }}>
                            <span>Aggressive (0.30)</span>
                            <span>Balanced (0.60)</span>
                            <span>Conservative (0.90)</span>
                        </div>
                    </div>

                    {/* Whitelist domains */}
                    <div style={{ ...s.toggle, flexDirection: 'column', alignItems: 'stretch' }}>
                        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>✅ Whitelisted Domains</div>
                        <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '8px' }}>
                            Emails from these domains will never be flagged as cold. Comma-separated.
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                style={{ ...s.input, flex: 1 }}
                                value={whitelistInput}
                                onChange={(e) => setWhitelistInput(e.target.value)}
                                placeholder="zpgroup.io, hearthbeacon.com, partner.com"
                            />
                            <button
                                style={s.btn('primary')}
                                onClick={() => {
                                    const domains = whitelistInput.split(',').map(d => d.trim()).filter(Boolean);
                                    updateConfig({ whitelistDomains: domains });
                                }}
                                disabled={saving}
                            >
                                Save
                            </button>
                        </div>
                        {config.whitelistDomains.length > 0 && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                                {config.whitelistDomains.map((d, i) => (
                                    <span key={i} style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: '11px' }}>
                                        {d}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
