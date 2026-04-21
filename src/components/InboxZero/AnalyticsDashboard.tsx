/**
 * AnalyticsDashboard — Phase 4: Dashboard & Analytics
 *
 * 6 sub-views:
 *   📊 Overview  — Live routing stats, inbox status, action counts
 *   🎯 Confidence — Histogram of routing confidence distribution
 *   🔥 Heatmap   — Hourly volume pattern (day-of-week × hour grid)
 *   📈 Trends    — Per-rule hit-rate sparklines (30-day)
 *   ⚖️ Methods   — LLM vs Rule comparison (speed, accuracy, share)
 *   🔄 Fallback  — Fallback rate over time, trend analysis
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/v1/inbox/analytics';

// ============================================
// TYPES
// ============================================

interface OverviewData {
    inbox: { total: number; pending: number; approved: number; archived: number; signal: number; noise: number; lowPriority: number };
    routing: { totalExecutions: number; byMethod: { method: string; count: number; avgConfidence: number; avgTimeMs: number }[]; byProject: { project: string; count: number }[]; last24h: number; last7d: number };
    actions: { totalActions: number; byType: { type: string; count: number }[]; last24h: number };
}

interface ConfidenceData {
    histogram: { bin: string; count: number; method: string }[];
    overall: { avgConfidence: number; medianConfidence: number; p90: number };
}

interface HeatmapData {
    grid: { dayOfWeek: number; hour: number; count: number }[];
    peakHour: number;
    peakDay: number;
    totalVolume: number;
}

interface RuleTrend {
    ruleId: string;
    ruleName: string;
    daily: { day: string; count: number }[];
    totalHits: number;
    avgConfidence: number;
    avgTimeMs: number;
}

interface MethodData {
    rule: { count: number; avgConfidence: number; avgTimeMs: number };
    llm: { count: number; avgConfidence: number; avgTimeMs: number };
    ruleShare: number;
    llmShare: number;
    recommendation: string;
}

interface FallbackData {
    dailyFallback: { day: string; ruleCount: number; llmCount: number; fallbackRate: number }[];
    overallFallbackRate: number;
    trend: 'improving' | 'stable' | 'worsening' | 'unknown';
    topFallbackPatterns: { field: string; pattern: string; count: number }[];
}

type SubView = 'overview' | 'confidence' | 'heatmap' | 'trends' | 'methods' | 'fallback';

// ============================================
// STYLES
// ============================================

const styles: Record<string, React.CSSProperties> = {
    container: { padding: '20px', fontFamily: 'Inter, system-ui, sans-serif', color: '#e1e1e6', maxHeight: '100%', overflowY: 'auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    title: { fontSize: '20px', fontWeight: 700, color: '#f0f0f5' },
    refreshBtn: { padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s' },
    tabs: { display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' as const },
    tab: { padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#8b8b9e', cursor: 'pointer', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s' },
    tabActive: { background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa' },
    gridRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' },
    card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' },
    cardTitle: { fontSize: '11px', fontWeight: 600, color: '#6b6b80', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px' },
    cardValue: { fontSize: '28px', fontWeight: 700, color: '#f0f0f5' },
    cardSub: { fontSize: '12px', color: '#6b6b80', marginTop: '4px' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
    th: { textAlign: 'left' as const, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#6b6b80', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' as const },
    td: { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' },
    barContainer: { width: '100%', height: '20px', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', overflow: 'hidden', display: 'flex' },
    sectionTitle: { fontSize: '15px', fontWeight: 600, color: '#d0d0da', marginBottom: '12px', marginTop: '16px' },
    pill: { display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 },
    emptyState: { textAlign: 'center' as const, padding: '40px', color: '#6b6b80', fontSize: '14px' },
    heatCell: { width: '32px', height: '24px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600, margin: '1px' },
    sparkline: { display: 'flex', alignItems: 'flex-end', gap: '1px', height: '32px' },
    sparkBar: { width: '4px', borderRadius: '2px 2px 0 0', minHeight: '2px' },
};

// ============================================
// HELPERS
// ============================================

function trendPill(trend: string): React.CSSProperties {
    if (trend === 'improving') return { ...styles.pill, background: 'rgba(34,197,94,0.15)', color: '#4ade80' };
    if (trend === 'worsening') return { ...styles.pill, background: 'rgba(239,68,68,0.15)', color: '#f87171' };
    if (trend === 'stable') return { ...styles.pill, background: 'rgba(234,179,8,0.15)', color: '#facc15' };
    return { ...styles.pill, background: 'rgba(255,255,255,0.08)', color: '#8b8b9e' };
}

function methodColor(method: string): string {
    if (method === 'rule') return '#8b5cf6';
    if (method === 'llm' || method === 'ai') return '#06b6d4';
    return '#6b6b80';
}

function heatColor(count: number, max: number): string {
    if (count === 0) return 'rgba(255,255,255,0.03)';
    const intensity = Math.min(count / Math.max(max, 1), 1);
    if (intensity > 0.7) return 'rgba(139,92,246,0.7)';
    if (intensity > 0.4) return 'rgba(139,92,246,0.4)';
    if (intensity > 0.15) return 'rgba(139,92,246,0.2)';
    return 'rgba(139,92,246,0.08)';
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================
// COMPONENT
// ============================================

const AnalyticsDashboard: React.FC = () => {
    const [view, setView] = useState<SubView>('overview');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Data states
    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [confidence, setConfidence] = useState<ConfidenceData | null>(null);
    const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
    const [trends, setTrends] = useState<RuleTrend[]>([]);
    const [methods, setMethods] = useState<MethodData | null>(null);
    const [fallback, setFallback] = useState<FallbackData | null>(null);

    const fetchData = useCallback(async (subView: SubView) => {
        setLoading(true);
        setError(null);
        try {
            const endpoint = subView === 'overview' ? '/overview'
                : subView === 'confidence' ? '/confidence'
                : subView === 'heatmap' ? '/heatmap'
                : subView === 'trends' ? '/rule-trends'
                : subView === 'methods' ? '/methods'
                : '/fallback';

            const res = await fetch(`${API_BASE}${endpoint}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Unknown error');

            switch (subView) {
                case 'overview': setOverview(json); break;
                case 'confidence': setConfidence(json); break;
                case 'heatmap': setHeatmap(json); break;
                case 'trends': setTrends(json.trends || []); break;
                case 'methods': setMethods(json); break;
                case 'fallback': setFallback(json); break;
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(view); }, [view, fetchData]);

    const switchView = (v: SubView) => { setView(v); };

    const tabs: { key: SubView; label: string }[] = [
        { key: 'overview', label: '📊 Overview' },
        { key: 'confidence', label: '🎯 Confidence' },
        { key: 'heatmap', label: '🔥 Heatmap' },
        { key: 'trends', label: '📈 Trends' },
        { key: 'methods', label: '⚖️ Methods' },
        { key: 'fallback', label: '🔄 Fallback' },
    ];

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <span style={styles.title}>📊 Analytics Dashboard</span>
                <button style={styles.refreshBtn} onClick={() => fetchData(view)}>
                    {loading ? '⏳ Loading...' : '🔄 Refresh'}
                </button>
            </div>

            <div style={styles.tabs}>
                {tabs.map(t => (
                    <button
                        key={t.key}
                        style={{ ...styles.tab, ...(view === t.key ? styles.tabActive : {}) }}
                        onClick={() => switchView(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {error && (
                <div style={{ ...styles.card, borderColor: 'rgba(239,68,68,0.3)', marginBottom: '16px' }}>
                    <span style={{ color: '#f87171' }}>⚠️ {error}</span>
                </div>
            )}

            {view === 'overview' && overview && <OverviewView data={overview} />}
            {view === 'confidence' && confidence && <ConfidenceView data={confidence} />}
            {view === 'heatmap' && heatmap && <HeatmapView data={heatmap} />}
            {view === 'trends' && <TrendsView data={trends} />}
            {view === 'methods' && methods && <MethodsView data={methods} />}
            {view === 'fallback' && fallback && <FallbackView data={fallback} />}

            {loading && !error && <div style={styles.emptyState}>⏳ Loading analytics data...</div>}
        </div>
    );
};

// ============================================
// SUB-VIEWS
// ============================================

const OverviewView: React.FC<{ data: OverviewData }> = ({ data }) => {
    const { inbox, routing, actions } = data;

    return (
        <>
            <div style={styles.sectionTitle}>Inbox Status</div>
            <div style={styles.gridRow}>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Total Items</div>
                    <div style={styles.cardValue}>{inbox.total}</div>
                </div>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Pending</div>
                    <div style={{ ...styles.cardValue, color: '#facc15' }}>{inbox.pending}</div>
                </div>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Signals</div>
                    <div style={{ ...styles.cardValue, color: '#4ade80' }}>{inbox.signal}</div>
                </div>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Noise</div>
                    <div style={{ ...styles.cardValue, color: '#f87171' }}>{inbox.noise}</div>
                </div>
            </div>

            <div style={styles.sectionTitle}>Routing Performance</div>
            <div style={styles.gridRow}>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Total Routings</div>
                    <div style={styles.cardValue}>{routing.totalExecutions}</div>
                </div>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Last 24h</div>
                    <div style={styles.cardValue}>{routing.last24h}</div>
                </div>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Last 7 Days</div>
                    <div style={styles.cardValue}>{routing.last7d}</div>
                </div>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Actions Taken</div>
                    <div style={{ ...styles.cardValue, color: '#a78bfa' }}>{actions.totalActions}</div>
                    <div style={styles.cardSub}>{actions.last24h} today</div>
                </div>
            </div>

            {routing.byMethod.length > 0 && (
                <>
                    <div style={styles.sectionTitle}>Routing Method Breakdown</div>
                    <div style={styles.card}>
                        <div style={styles.barContainer}>
                            {routing.byMethod.map((m, i) => {
                                const share = routing.totalExecutions > 0 ? (m.count / routing.totalExecutions) * 100 : 0;
                                return (
                                    <div key={i} style={{
                                        width: `${share}%`,
                                        background: methodColor(m.method),
                                        height: '100%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '10px', fontWeight: 700, color: '#fff',
                                        minWidth: share > 5 ? '40px' : '0',
                                    }}>
                                        {share > 10 ? `${m.method} ${share.toFixed(0)}%` : ''}
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px' }}>
                            {routing.byMethod.map((m, i) => (
                                <span key={i} style={{ color: methodColor(m.method) }}>
                                    ● {m.method}: {m.count} ({m.avgConfidence.toFixed(2)} conf, {m.avgTimeMs}ms)
                                </span>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {routing.byProject.length > 0 && (
                <>
                    <div style={styles.sectionTitle}>Top Routed Projects</div>
                    <div style={styles.card}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Project</th>
                                    <th style={{ ...styles.th, textAlign: 'right' }}>Count</th>
                                    <th style={styles.th}>Share</th>
                                </tr>
                            </thead>
                            <tbody>
                                {routing.byProject.map((p, i) => {
                                    const share = routing.totalExecutions > 0 ? (p.count / routing.totalExecutions) * 100 : 0;
                                    return (
                                        <tr key={i}>
                                            <td style={styles.td}>{p.project || '(unrouted)'}</td>
                                            <td style={{ ...styles.td, textAlign: 'right' }}>{p.count}</td>
                                            <td style={styles.td}>
                                                <div style={{ ...styles.barContainer, height: '10px', width: '120px', display: 'inline-flex' }}>
                                                    <div style={{ width: `${share}%`, background: '#8b5cf6', height: '100%', borderRadius: '10px' }} />
                                                </div>
                                                <span style={{ marginLeft: '8px', fontSize: '11px', color: '#8b8b9e' }}>{share.toFixed(1)}%</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {actions.byType.length > 0 && (
                <>
                    <div style={styles.sectionTitle}>Smart Actions Usage</div>
                    <div style={styles.gridRow}>
                        {actions.byType.map((a, i) => (
                            <div key={i} style={styles.card}>
                                <div style={styles.cardTitle}>{a.type.replace(/_/g, ' ')}</div>
                                <div style={styles.cardValue}>{a.count}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </>
    );
};

const ConfidenceView: React.FC<{ data: ConfidenceData }> = ({ data }) => {
    const { histogram, overall } = data;
    const maxCount = Math.max(...histogram.map(h => h.count), 1);

    // Group by bin
    const binGroups = new Map<string, { bin: string; methods: { method: string; count: number }[] }>();
    for (const h of histogram) {
        if (!binGroups.has(h.bin)) binGroups.set(h.bin, { bin: h.bin, methods: [] });
        binGroups.get(h.bin)!.methods.push({ method: h.method, count: h.count });
    }

    return (
        <>
            <div style={styles.sectionTitle}>Overall Confidence</div>
            <div style={styles.gridRow}>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Average</div>
                    <div style={styles.cardValue}>{(overall.avgConfidence * 100).toFixed(1)}%</div>
                </div>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Median</div>
                    <div style={styles.cardValue}>{(overall.medianConfidence * 100).toFixed(1)}%</div>
                </div>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>P90</div>
                    <div style={styles.cardValue}>{(overall.p90 * 100).toFixed(1)}%</div>
                </div>
            </div>

            <div style={styles.sectionTitle}>Distribution Histogram</div>
            <div style={styles.card}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '160px', padding: '0 8px' }}>
                    {Array.from(binGroups.values()).map((group, i) => {
                        const total = group.methods.reduce((s, m) => s + m.count, 0);
                        const height = Math.max((total / maxCount) * 140, 4);
                        return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#d0d0da', marginBottom: '4px' }}>{total}</div>
                                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                    {group.methods.filter(m => m.count > 0).map((m, j) => {
                                        const mh = Math.max((m.count / total) * height, 2);
                                        return <div key={j} style={{ width: '100%', height: `${mh}px`, background: methodColor(m.method), borderRadius: '4px' }} />;
                                    })}
                                </div>
                                <div style={{ fontSize: '10px', color: '#6b6b80', marginTop: '6px' }}>{group.bin}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
};

const HeatmapView: React.FC<{ data: HeatmapData }> = ({ data }) => {
    const { grid, peakHour, peakDay, totalVolume } = data;
    const maxCount = Math.max(...grid.map(g => g.count), 1);

    // Build 7×24 matrix
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const cell of grid) {
        matrix[cell.dayOfWeek][cell.hour] = cell.count;
    }

    return (
        <>
            <div style={styles.gridRow}>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Total Volume</div>
                    <div style={styles.cardValue}>{totalVolume}</div>
                </div>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Peak Hour</div>
                    <div style={styles.cardValue}>{peakHour}:00</div>
                    <div style={styles.cardSub}>{DAY_LABELS[peakDay]}</div>
                </div>
            </div>

            <div style={styles.sectionTitle}>Activity Heatmap (7-Day)</div>
            <div style={{ ...styles.card, overflowX: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '800px' }}>
                    {/* Hour headers */}
                    <div style={{ display: 'flex', gap: '2px', paddingLeft: '50px' }}>
                        {Array.from({ length: 24 }, (_, h) => (
                            <div key={h} style={{ ...styles.heatCell, background: 'none', color: '#6b6b80', fontSize: '9px' }}>
                                {h % 3 === 0 ? `${h}` : ''}
                            </div>
                        ))}
                    </div>
                    {/* Day rows */}
                    {matrix.map((hours, day) => (
                        <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <span style={{ width: '44px', fontSize: '11px', color: '#8b8b9e', fontWeight: 500, textAlign: 'right', paddingRight: '6px' }}>
                                {DAY_LABELS[day]}
                            </span>
                            {hours.map((count, hour) => (
                                <div
                                    key={hour}
                                    style={{ ...styles.heatCell, background: heatColor(count, maxCount), color: count > 0 ? '#e1e1e6' : 'transparent' }}
                                    title={`${DAY_LABELS[day]} ${hour}:00 — ${count} items`}
                                >
                                    {count > 0 ? count : ''}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', fontSize: '11px', color: '#6b6b80' }}>
                    <span>Less</span>
                    {[0.08, 0.2, 0.4, 0.7].map((v, i) => (
                        <div key={i} style={{ ...styles.heatCell, background: `rgba(139,92,246,${v})`, width: '18px', height: '14px' }} />
                    ))}
                    <span>More</span>
                </div>
            </div>
        </>
    );
};

const TrendsView: React.FC<{ data: RuleTrend[] }> = ({ data }) => {
    if (data.length === 0) return <div style={styles.emptyState}>No rule execution data yet. Rules will appear here once emails are processed.</div>;

    return (
        <>
            <div style={styles.sectionTitle}>Per-Rule Hit-Rate Trends (30 days)</div>
            <div style={styles.card}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Rule</th>
                            <th style={{ ...styles.th, textAlign: 'right' }}>Hits</th>
                            <th style={{ ...styles.th, textAlign: 'right' }}>Avg Conf</th>
                            <th style={{ ...styles.th, textAlign: 'right' }}>Avg Time</th>
                            <th style={styles.th}>Sparkline</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(rule => {
                            const maxDaily = Math.max(...rule.daily.map(d => d.count), 1);
                            return (
                                <tr key={rule.ruleId}>
                                    <td style={styles.td}>
                                        <div style={{ fontWeight: 600, color: '#e1e1e6' }}>{rule.ruleName}</div>
                                        <div style={{ fontSize: '10px', color: '#6b6b80' }}>{rule.ruleId.slice(0, 8)}…</div>
                                    </td>
                                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, fontSize: '15px' }}>
                                        {rule.totalHits}
                                    </td>
                                    <td style={{ ...styles.td, textAlign: 'right' }}>
                                        <span style={{ color: rule.avgConfidence >= 0.7 ? '#4ade80' : rule.avgConfidence >= 0.4 ? '#facc15' : '#f87171' }}>
                                            {(rule.avgConfidence * 100).toFixed(0)}%
                                        </span>
                                    </td>
                                    <td style={{ ...styles.td, textAlign: 'right', color: '#8b8b9e' }}>
                                        {rule.avgTimeMs}ms
                                    </td>
                                    <td style={styles.td}>
                                        <div style={styles.sparkline}>
                                            {rule.daily.slice(-14).map((d, i) => (
                                                <div
                                                    key={i}
                                                    style={{ ...styles.sparkBar, height: `${Math.max((d.count / maxDaily) * 28, 2)}px`, background: '#8b5cf6' }}
                                                    title={`${d.day}: ${d.count}`}
                                                />
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
};

const MethodsView: React.FC<{ data: MethodData }> = ({ data }) => {
    const { rule, llm, ruleShare, llmShare, recommendation } = data;
    const total = rule.count + llm.count;

    return (
        <>
            <div style={styles.sectionTitle}>LLM vs Rule Comparison</div>
            <div style={styles.gridRow}>
                <div style={{ ...styles.card, borderLeft: '3px solid #8b5cf6' }}>
                    <div style={styles.cardTitle}>Rule-Based</div>
                    <div style={styles.cardValue}>{rule.count}</div>
                    <div style={styles.cardSub}>{ruleShare}% of total</div>
                </div>
                <div style={{ ...styles.card, borderLeft: '3px solid #06b6d4' }}>
                    <div style={styles.cardTitle}>LLM / AI</div>
                    <div style={styles.cardValue}>{llm.count}</div>
                    <div style={styles.cardSub}>{llmShare}% of total</div>
                </div>
            </div>

            {total > 0 && (
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Method Share</div>
                    <div style={{ ...styles.barContainer, height: '28px', marginTop: '8px' }}>
                        <div style={{ width: `${ruleShare}%`, background: '#8b5cf6', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff' }}>
                            {ruleShare > 15 ? `Rule ${ruleShare}%` : ''}
                        </div>
                        <div style={{ width: `${llmShare}%`, background: '#06b6d4', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff' }}>
                            {llmShare > 15 ? `LLM ${llmShare}%` : ''}
                        </div>
                    </div>
                </div>
            )}

            <div style={styles.sectionTitle}>Performance Comparison</div>
            <div style={styles.card}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Metric</th>
                            <th style={{ ...styles.th, textAlign: 'right', color: '#8b5cf6' }}>Rule</th>
                            <th style={{ ...styles.th, textAlign: 'right', color: '#06b6d4' }}>LLM</th>
                            <th style={styles.th}>Winner</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={styles.td}>Avg Confidence</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{(rule.avgConfidence * 100).toFixed(1)}%</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{(llm.avgConfidence * 100).toFixed(1)}%</td>
                            <td style={styles.td}>
                                <span style={{ ...styles.pill, background: rule.avgConfidence >= llm.avgConfidence ? 'rgba(139,92,246,0.2)' : 'rgba(6,182,212,0.2)', color: rule.avgConfidence >= llm.avgConfidence ? '#a78bfa' : '#22d3ee' }}>
                                    {rule.avgConfidence >= llm.avgConfidence ? '📐 Rule' : '🤖 LLM'}
                                </span>
                            </td>
                        </tr>
                        <tr>
                            <td style={styles.td}>Avg Speed</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{rule.avgTimeMs}ms</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{llm.avgTimeMs}ms</td>
                            <td style={styles.td}>
                                <span style={{ ...styles.pill, background: rule.avgTimeMs <= llm.avgTimeMs ? 'rgba(139,92,246,0.2)' : 'rgba(6,182,212,0.2)', color: rule.avgTimeMs <= llm.avgTimeMs ? '#a78bfa' : '#22d3ee' }}>
                                    {rule.avgTimeMs <= llm.avgTimeMs ? '📐 Rule' : '🤖 LLM'}
                                </span>
                            </td>
                        </tr>
                        <tr>
                            <td style={styles.td}>Volume</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{rule.count}</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{llm.count}</td>
                            <td style={styles.td}>
                                <span style={{ ...styles.pill, background: 'rgba(255,255,255,0.06)', color: '#8b8b9e' }}>—</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style={{ ...styles.card, marginTop: '12px', border: '1px solid rgba(139,92,246,0.2)' }}>
                <div style={styles.cardTitle}>💡 Recommendation</div>
                <div style={{ fontSize: '14px', color: '#d0d0da', lineHeight: 1.6 }}>{recommendation}</div>
            </div>
        </>
    );
};

const FallbackView: React.FC<{ data: FallbackData }> = ({ data }) => {
    const { dailyFallback, overallFallbackRate, trend, topFallbackPatterns } = data;

    return (
        <>
            <div style={styles.gridRow}>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Overall Fallback Rate</div>
                    <div style={{ ...styles.cardValue, color: overallFallbackRate > 40 ? '#f87171' : overallFallbackRate > 20 ? '#facc15' : '#4ade80' }}>
                        {overallFallbackRate}%
                    </div>
                </div>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>Trend</div>
                    <div style={{ marginTop: '6px' }}>
                        <span style={trendPill(trend)}>
                            {trend === 'improving' ? '📈 Improving' : trend === 'worsening' ? '📉 Worsening' : trend === 'stable' ? '➡️ Stable' : '❓ Unknown'}
                        </span>
                    </div>
                </div>
            </div>

            {dailyFallback.length > 0 && (
                <>
                    <div style={styles.sectionTitle}>Daily Fallback Rate (14 days)</div>
                    <div style={styles.card}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100px' }}>
                            {dailyFallback.map((d, i) => {
                                const total = d.ruleCount + d.llmCount;
                                const barH = Math.max((total / Math.max(...dailyFallback.map(x => x.ruleCount + x.llmCount), 1)) * 80, 4);
                                const llmPct = total > 0 ? (d.llmCount / total) : 0;
                                return (
                                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                                        <div style={{ fontSize: '9px', color: '#8b8b9e', marginBottom: '2px' }}>{d.fallbackRate}%</div>
                                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                            <div style={{ width: '100%', height: `${barH * llmPct}px`, background: '#06b6d4', borderRadius: '3px 3px 0 0' }} />
                                            <div style={{ width: '100%', height: `${barH * (1 - llmPct)}px`, background: '#8b5cf6', borderRadius: '0 0 3px 3px' }} />
                                        </div>
                                        <div style={{ fontSize: '8px', color: '#6b6b80', marginTop: '4px', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                                            {d.day.slice(5)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '11px' }}>
                            <span style={{ color: '#8b5cf6' }}>● Rule</span>
                            <span style={{ color: '#06b6d4' }}>● LLM/AI Fallback</span>
                        </div>
                    </div>
                </>
            )}

            {topFallbackPatterns.length > 0 && (
                <>
                    <div style={styles.sectionTitle}>Top Fallback Patterns (rule candidates)</div>
                    <div style={styles.card}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Field</th>
                                    <th style={styles.th}>Target</th>
                                    <th style={{ ...styles.th, textAlign: 'right' }}>Count</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topFallbackPatterns.map((p, i) => (
                                    <tr key={i}>
                                        <td style={styles.td}>{p.field}</td>
                                        <td style={styles.td}>{p.pattern}</td>
                                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{p.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </>
    );
};

export default AnalyticsDashboard;
