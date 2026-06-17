/**
 * StatsTab — Visual statistics view for InboxZero
 * 
 * Donut chart, inbox zero progress bar, signal ratio, and operator metrics.
 * Extracted from InboxZero.tsx monolith (Phase 2.1).
 */

import { BarChart3 } from 'lucide-react';
import type { InboxStats } from './InboxZeroTypes';

interface OperatorMetrics {
    throughputToday: number;
    throughputWeek: number;
    avgResponseMinutes: number;
    approvalQueueDepth: number;
    totalProcessed: number;
    backlogByAge: { fresh: number; aging: number; stale: number };
}

interface Props {
    stats: InboxStats | null;
    metrics: OperatorMetrics | null;
    zeroProgress: number;
}

export default function StatsTab({ stats, metrics, zeroProgress }: Props) {
    return (
        <div className="iz-stats-tab">
            {/* Donut chart */}
            <div className="iz-donut-section">
                <svg className="iz-donut" viewBox="0 0 120 120">
                    <circle className="iz-donut__bg" cx="60" cy="60" r="50" />
                    {stats && (() => {
                        const total = stats.total || 1;
                        const r = 50;
                        const C = 2 * Math.PI * r;
                        const segments = [
                            { name: 'Signal', value: stats.signal, color: '#22c55e' },
                            { name: 'Noise', value: stats.noise, color: 'var(--text-tertiary)' },
                            { name: 'Low', value: stats.lowPriority || 0, color: '#eab308' },
                        ];
                        let offset = 0;
                        return segments.map(seg => {
                            const pct = seg.value / total;
                            const dash = pct * C;
                            const el = (
                                <circle
                                    key={seg.name}
                                    cx="60" cy="60" r={r}
                                    fill="none"
                                    stroke={seg.color}
                                    strokeWidth="10"
                                    strokeDasharray={`${dash} ${C - dash}`}
                                    strokeDashoffset={-offset}
                                    strokeLinecap="round"
                                    className="iz-donut__seg"
                                />
                            );
                            offset += dash;
                            return el;
                        });
                    })()}
                    <text x="60" y="55" textAnchor="middle" className="iz-donut__num">{stats?.total || 0}</text>
                    <text x="60" y="72" textAnchor="middle" className="iz-donut__label">total</text>
                </svg>

                <div className="iz-legend">
                    {[
                        { name: 'Pending', value: stats?.pending || 0, color: 'var(--accent)' },
                        { name: 'Signal', value: stats?.signal || 0, color: '#22c55e' },
                        { name: 'Noise', value: stats?.noise || 0, color: 'var(--text-tertiary)' },
                        { name: 'Approved', value: stats?.approved || 0, color: '#60a5fa' },
                        { name: 'Archived', value: stats?.archived || 0, color: '#374151' },
                    ].map(item => (
                        <div key={item.name} className="iz-legend__item">
                            <span className="iz-legend__dot" style={{ background: item.color }} />
                            <span className="iz-legend__name">{item.name}</span>
                            <span className="iz-legend__value">{item.value}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Progress metrics */}
            <div className="iz-metrics">
                <div className="iz-metric">
                    <div className="iz-metric__value" style={{ color: '#22c55e' }}>{zeroProgress}%</div>
                    <div className="iz-metric__label">Inbox Zero Progress</div>
                    <div className="iz-metric__bar">
                        <div className="iz-metric__bar-fill" style={{ width: `${zeroProgress}%`, background: '#22c55e' }} />
                    </div>
                </div>
                <div className="iz-metric">
                    <div className="iz-metric__value" style={{ color: 'var(--accent)' }}>{stats?.pending || 0}</div>
                    <div className="iz-metric__label">Remaining</div>
                </div>
                <div className="iz-metric">
                    <div className="iz-metric__value" style={{ color: '#60a5fa' }}>{stats?.approved || 0}</div>
                    <div className="iz-metric__label">Processed Today</div>
                </div>
                <div className="iz-metric">
                    <div className="iz-metric__value" style={{ color: '#22c55e' }}>
                        {stats && stats.total > 0 ? Math.round((stats.signal / stats.total) * 100) : 0}%
                    </div>
                    <div className="iz-metric__label">Signal Ratio</div>
                </div>
            </div>

            {/* GAP-21: Operator Metrics */}
            {metrics && (
                <div style={{ marginTop: '16px', padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.5, marginBottom: '12px', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 5 }}><BarChart3 size={12} aria-hidden /> OPERATOR METRICS</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        {[
                            { label: 'Throughput Today', value: metrics.throughputToday },
                            { label: 'Throughput This Week', value: metrics.throughputWeek },
                            { label: 'Avg Response (min)', value: metrics.avgResponseMinutes },
                            { label: 'Total Processed', value: metrics.totalProcessed },
                            { label: 'Queue Depth', value: metrics.approvalQueueDepth },
                            { label: 'Stale Items (3d+)', value: metrics.backlogByAge.stale },
                        ].map(m => (
                            <div key={m.label} className="iz-metric">
                                <div className="iz-metric__value" style={{ color: '#60a5fa' }}>{m.value}</div>
                                <div className="iz-metric__label">{m.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
