/**
 * NifIntelligence — Phase 2 Frontend Component
 *
 * Provides:
 * - Feedback Interface: correct NIF classifications
 * - Sender Reputation Browser: domain reputation cards
 * - Performance Report: accuracy, top mistakes, adaptive thresholds
 * - Adaptive Config Viewer: current threshold values + recalibrate button
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, Circle, Mail, RefreshCw, Settings, TriangleAlert, Users, VolumeX, Zap } from 'lucide-react';

const API = 'http://localhost:3000/api/v1/inbox/nif';

interface FeedbackEntry {
    id: string;
    inbox_item_id: string;
    original_class: string;
    corrected_class: string;
    original_confidence: number;
    feedback_source: string;
    created_at: string;
    subject?: string;
    sender?: string;
}

interface SenderRep {
    domain: string;
    total_received: number;
    signal_count: number;
    noise_count: number;
    low_priority_count: number;
    reputation_score: number;
    manually_classified: number;
    last_seen: string;
}

interface PerformanceReport {
    period: string;
    totalClassified: number;
    breakdown: { class: string; count: number; avgConfidence: number }[];
    feedbackStats: {
        totalCorrections: number;
        accuracy: number;
        topMistakes: { from: string; to: string; count: number }[];
    };
    senderInsights: {
        topSignalDomains: { domain: string; count: number; score: number }[];
        topNoiseDomains: { domain: string; count: number; score: number }[];
    };
    adaptiveConfig: Record<string, number>;
}

type SubView = 'report' | 'senders' | 'feedback' | 'config';

// ============================================
// MAIN COMPONENT
// ============================================

export default function NifIntelligence() {
    const [subView, setSubView] = useState<SubView>('report');

    const tabs: { key: SubView; label: string; icon: LucideIcon }[] = [
        { key: 'report', label: 'Report', icon: BarChart3 },
        { key: 'senders', label: 'Senders', icon: Users },
        { key: 'feedback', label: 'Feedback', icon: RefreshCw },
        { key: 'config', label: 'Config', icon: Settings },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Sub-tab bar */}
            <div style={{
                display: 'flex',
                gap: '2px',
                padding: '8px 12px 0',
                borderBottom: '1px solid var(--border-color, #333)',
            }}>
                {tabs.map(t => {
                    const TabIcon = t.icon;
                    return (
                    <button
                        key={t.key}
                        onClick={() => setSubView(t.key)}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '6px 6px 0 0',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: subView === t.key ? 700 : 400,
                            background: subView === t.key ? 'var(--accent-color, #6366f1)' : 'transparent',
                            color: subView === t.key ? '#fff' : 'var(--text-secondary, #999)',
                            transition: 'all 0.15s ease',
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}
                    >
                        <TabIcon size={13} aria-hidden /> {t.label}
                    </button>
                    );
                })}
            </div>

            {/* Sub-view content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
                {subView === 'report' && <ReportView />}
                {subView === 'senders' && <SendersView />}
                {subView === 'feedback' && <FeedbackView />}
                {subView === 'config' && <ConfigView />}
            </div>
        </div>
    );
}

// ============================================
// REPORT VIEW
// ============================================

function ReportView() {
    const [report, setReport] = useState<PerformanceReport | null>(null);
    const [days, setDays] = useState(7);
    const [loading, setLoading] = useState(false);

    const loadReport = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/report?days=${days}`);
            const data = await res.json();
            if (data.success) setReport(data);
        } catch (err) {
            console.error('Failed to load report:', err);
        }
        setLoading(false);
    }, [days]);

    useEffect(() => { loadReport(); }, [loadReport]);

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary, #999)' }}>Loading report...</div>;
    if (!report) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary, #999)' }}>No data</div>;

    const accuracyPct = Math.round(report.feedbackStats.accuracy * 100);
    const accuracyColor = accuracyPct >= 90 ? '#22c55e' : accuracyPct >= 70 ? '#f59e0b' : '#ef4444';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Period selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary, #999)' }}>Period:</span>
                {[7, 14, 30].map(d => (
                    <button
                        key={d}
                        onClick={() => setDays(d)}
                        style={{
                            padding: '3px 10px', borderRadius: '4px', fontSize: '11px',
                            border: days === d ? '1px solid var(--accent-color, #6366f1)' : '1px solid var(--border-color, #333)',
                            background: days === d ? 'var(--accent-color, #6366f1)' : 'transparent',
                            color: days === d ? '#fff' : 'var(--text-secondary, #999)',
                            cursor: 'pointer',
                        }}
                    >
                        {d}d
                    </button>
                ))}
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <MetricCard label="Total Classified" value={report.totalClassified} />
                <MetricCard label="Accuracy" value={`${accuracyPct}%`} color={accuracyColor} />
                <MetricCard label="Corrections" value={report.feedbackStats.totalCorrections} color={report.feedbackStats.totalCorrections > 0 ? '#f59e0b' : '#22c55e'} />
            </div>

            {/* Routing method breakdown */}
            <div style={{ background: 'var(--card-bg, #1a1a2e)', borderRadius: '8px', padding: '12px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-primary, #e0e0e0)' }}>Routing Method Breakdown</h4>
                {report.breakdown.map((b, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', color: 'var(--text-secondary, #999)' }}>
                        <span style={{ textTransform: 'capitalize' }}>{b.class}</span>
                        <span><strong style={{ color: 'var(--text-primary, #e0e0e0)' }}>{b.count}</strong> · avg conf: {(b.avgConfidence * 100).toFixed(0)}%</span>
                    </div>
                ))}
            </div>

            {/* Top mistakes */}
            {report.feedbackStats.topMistakes.length > 0 && (
                <div style={{ background: 'var(--card-bg, #1a1a2e)', borderRadius: '8px', padding: '12px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 5 }}><TriangleAlert size={13} aria-hidden /> Top Misclassifications</h4>
                    {report.feedbackStats.topMistakes.map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', color: 'var(--text-secondary, #999)' }}>
                            <span>{m.from} → {m.to}</span>
                            <strong style={{ color: '#f59e0b' }}>{m.count}x</strong>
                        </div>
                    ))}
                </div>
            )}

            {/* Sender insights */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: 'var(--card-bg, #1a1a2e)', borderRadius: '8px', padding: '12px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: 5 }}><Circle size={11} aria-hidden fill="#22c55e" color="#22c55e" /> Top Signal Domains</h4>
                    {report.senderInsights.topSignalDomains.slice(0, 5).map((d, i) => (
                        <div key={i} style={{ fontSize: '11px', color: 'var(--text-secondary, #999)', padding: '2px 0' }}>
                            {d.domain} <span style={{ color: '#22c55e' }}>({d.count})</span>
                        </div>
                    ))}
                    {report.senderInsights.topSignalDomains.length === 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary, #666)' }}>No data yet</div>
                    )}
                </div>
                <div style={{ background: 'var(--card-bg, #1a1a2e)', borderRadius: '8px', padding: '12px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 5 }}><Circle size={11} aria-hidden fill="#ef4444" color="#ef4444" /> Top Noise Domains</h4>
                    {report.senderInsights.topNoiseDomains.slice(0, 5).map((d, i) => (
                        <div key={i} style={{ fontSize: '11px', color: 'var(--text-secondary, #999)', padding: '2px 0' }}>
                            {d.domain} <span style={{ color: '#ef4444' }}>({d.count})</span>
                        </div>
                    ))}
                    {report.senderInsights.topNoiseDomains.length === 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary, #666)' }}>No data yet</div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================
// SENDERS VIEW
// ============================================

function SendersView() {
    const [senders, setSenders] = useState<SenderRep[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        fetch(`${API}/senders?limit=50`)
            .then(r => r.json())
            .then(d => { if (d.success) setSenders(d.senders); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary, #999)' }}>Loading...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-primary, #e0e0e0)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Users size={13} aria-hidden /> Sender Domain Reputations ({senders.length})
            </h4>
            {senders.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary, #666)', fontSize: '12px' }}>
                    No sender data yet — process some emails first
                </div>
            )}
            {senders.map((s, i) => {
                const repColor = s.reputation_score >= 0.7 ? '#22c55e' : s.reputation_score >= 0.3 ? '#f59e0b' : '#ef4444';
                const barWidth = Math.round(s.reputation_score * 100);
                return (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 10px', borderRadius: '6px',
                        background: 'var(--card-bg, #1a1a2e)',
                        fontSize: '12px',
                    }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary, #e0e0e0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {s.domain}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary, #999)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                <Mail size={11} aria-hidden /> {s.total_received} · <Zap size={11} aria-hidden /> {s.signal_count} signal · <VolumeX size={11} aria-hidden /> {s.noise_count} noise
                            </div>
                        </div>
                        <div style={{ width: '80px' }}>
                            <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-color, #333)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${barWidth}%`, background: repColor, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '10px', color: repColor, marginTop: '2px' }}>
                                {(s.reputation_score * 100).toFixed(0)}%
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ============================================
// FEEDBACK VIEW
// ============================================

function FeedbackView() {
    const [entries, setEntries] = useState<FeedbackEntry[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        fetch(`${API}/feedback?limit=50`)
            .then(r => r.json())
            .then(d => { if (d.success) setEntries(d.entries); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary, #999)' }}>Loading...</div>;

    const classColor = (c: string) => c === 'signal' ? '#22c55e' : c === 'noise' ? '#ef4444' : '#f59e0b';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-primary, #e0e0e0)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <RefreshCw size={13} aria-hidden /> Classification Corrections ({entries.length})
            </h4>
            {entries.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary, #666)', fontSize: '12px' }}>
                    No feedback yet — correct classifications from email cards
                </div>
            )}
            {entries.map((e, i) => (
                <div key={i} style={{
                    padding: '8px 10px', borderRadius: '6px',
                    background: 'var(--card-bg, #1a1a2e)',
                    fontSize: '12px',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span style={{ color: classColor(e.original_class), fontWeight: 600 }}>
                                {e.original_class}
                            </span>
                            <span style={{ color: 'var(--text-secondary, #999)', margin: '0 6px' }}>→</span>
                            <span style={{ color: classColor(e.corrected_class), fontWeight: 600 }}>
                                {e.corrected_class}
                            </span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary, #666)' }}>
                            {new Date(e.created_at).toLocaleDateString()}
                        </span>
                    </div>
                    {e.subject && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary, #999)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {e.subject}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ============================================
// CONFIG VIEW
// ============================================

function ConfigView() {
    const [config, setConfig] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [recalibrating, setRecalibrating] = useState(false);

    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/config`);
            const data = await res.json();
            if (data.success) setConfig(data.config);
        } catch (err) {
            console.error('Failed to load config:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    const handleRecalibrate = async () => {
        setRecalibrating(true);
        try {
            const res = await fetch(`${API}/recalibrate`, { method: 'POST' });
            const data = await res.json();
            if (data.success) setConfig(data.config);
        } catch (err) {
            console.error('Recalibration failed:', err);
        }
        setRecalibrating(false);
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary, #999)' }}>Loading...</div>;

    const labels: Record<string, string> = {
        noise_threshold: 'Noise Threshold',
        signal_boost_reply: 'Reply Signal Boost',
        signal_boost_forward: 'Forward Signal Boost',
        low_priority_threshold: 'Low Priority Threshold',
        confidence_floor: 'Confidence Floor',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary, #e0e0e0)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Settings size={13} aria-hidden /> Adaptive NIF Thresholds
                </h4>
                <button
                    onClick={handleRecalibrate}
                    disabled={recalibrating}
                    style={{
                        padding: '4px 12px', borderRadius: '4px', fontSize: '11px',
                        border: '1px solid var(--accent-color, #6366f1)',
                        background: 'transparent',
                        color: 'var(--accent-color, #6366f1)',
                        cursor: recalibrating ? 'wait' : 'pointer',
                        opacity: recalibrating ? 0.5 : 1,
                    }}
                >
                    {recalibrating ? 'Recalibrating...' : <><RefreshCw size={12} aria-hidden /> Recalibrate</>}
                </button>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                These thresholds auto-adjust based on user feedback corrections.
                Higher noise threshold = less aggressive noise filtering.
            </div>

            {Object.entries(config).map(([key, value]) => (
                <div key={key} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', borderRadius: '6px',
                    background: 'var(--card-bg, #1a1a2e)',
                }}>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #e0e0e0)' }}>
                            {labels[key] || key}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary, #666)', marginTop: '2px' }}>
                            {key}
                        </div>
                    </div>
                    <div style={{
                        fontSize: '16px', fontWeight: 700,
                        color: 'var(--accent-color, #6366f1)',
                        fontFamily: 'var(--font-mono, monospace)',
                    }}>
                        {typeof value === 'number' && value < 1 ? value.toFixed(2) : value}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ============================================
// SHARED COMPONENTS
// ============================================

function MetricCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
    return (
        <div style={{
            background: 'var(--card-bg, #1a1a2e)',
            borderRadius: '8px',
            padding: '12px',
            textAlign: 'center',
        }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: color || 'var(--accent-color, #6366f1)', fontFamily: 'var(--font-mono, monospace)' }}>
                {value}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary, #999)', marginTop: '4px' }}>
                {label}
            </div>
        </div>
    );
}
