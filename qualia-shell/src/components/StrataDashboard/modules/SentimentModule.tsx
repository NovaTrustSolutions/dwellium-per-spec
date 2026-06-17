import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, TrendingDown, TrendingUp, Minus, Plus, CheckCircle, Newspaper } from 'lucide-react';
import { strataGet, isStaticMode } from '../strataApi';
import type { SentimentScore, SentimentScoreView } from '@qualia/types';
import { useStrataNav } from '../StrataNavContext';
// Task 2.8 — GR-13 observability wiring + ErrorBoundary, mirrors the
// 2.1 / 2.2 / 2.4 / 2.10 retrofit pattern. Sentry breadcrumbs are
// try/catch-wrapped so missing DSN is silent in test/local builds.
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';

const API = 'http://localhost:3000';

const SCORE_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];
const SCORE_LABELS = ['', 'Very Unsatisfied', 'Unsatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'];

function ScoreBadge({ score }: { score: number }) {
    return (
        <span style={{ background: SCORE_COLORS[score] + '20', color: SCORE_COLORS[score], border: `1px solid ${SCORE_COLORS[score]}40`, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
            {score}/5
        </span>
    );
}

function TrendIcon({ trend }: { trend: string }) {
    if (trend === 'improving') return <TrendingUp size={14} color="#22c55e" />;
    if (trend === 'declining') return <TrendingDown size={14} color="#ef4444" />;
    return <Minus size={14} color="#94a3b8" />;
}

function SentimentModuleInner() {
    const { navigateToProperty } = useStrataNav();
    const [trends, setTrends] = useState<SentimentScore[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState<'all' | 'atRisk' | 'add'>('all');
    const [selected, setSelected] = useState<SentimentScore | null>(null);
    const [newSurvey, setNewSurvey] = useState({ tenantId: '', score: 3, comments: '', channel: 'manual' });
    const [submitMsg, setSubmitMsg] = useState('');
    const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);

    const token = localStorage.getItem('dwellium_token');
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    useEffect(() => {
        setLoading(true);
        // Task 2.8 — rewired off raw localhost:3000/api/sentiment/trends
        // to strataGet so static mode is functional. Mirrors Task 2.4
        // ForecastModule + Task 2.7 AuditModule rewire precedents.
        strataGet<SentimentScoreView>('/sentiment/scores')
            .then(view => {
                setTrends(view.trends);
            })
            .catch(() => {
                try {
                    Sentry.addBreadcrumb({
                        category: 'ui.fetch',
                        message: 'sentiment.fetch.error',
                        level: 'warning',
                    });
                } catch { /* Sentry no-op when DSN unset */ }
            })
            .finally(() => setLoading(false));

        // Route tenant list through strataApi so static/backend modes both work.
        strataGet<any>('/entities', { type: 'tenant', limit: '300' })
            .then((d: any) => {
                const rows = Array.isArray(d) ? d : (d?.data ?? []);
                setTenants(rows.map((t: any) => ({ id: t.id, name: t.name })));
            })
            .catch(() => setTenants([]));

        // Task 2.8 — GR-13 breadcrumb on initial module load.
        try {
            Sentry.addBreadcrumb({
                category: 'ui.load',
                message: 'sentiment.module.loaded',
                level: 'info',
                data: { staticMode: isStaticMode },
            });
        } catch { /* Sentry no-op when DSN unset */ }
    }, []);

    const submitSurvey = async () => {
        if (!newSurvey.tenantId) return setSubmitMsg('Please select a tenant');
        // Task 2.8 — static-mode guard. Static deck is read-only;
        // backend mode keeps the original POST + refresh path. Uses
        // the canonical isStaticMode export (3-form-aware) rather than
        // an inline import.meta.env check to avoid divergence with the
        // router's routing decision.
        if (isStaticMode) {
            setSubmitMsg('Survey submission requires backend mode (static deck is read-only).');
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.submit',
                    message: 'sentiment.survey.submit.skipped',
                    level: 'info',
                    data: { tenantId: newSurvey.tenantId, channel: newSurvey.channel },
                });
            } catch { /* Sentry no-op when DSN unset */ }
            return;
        }
        const res = await fetch(`${API}/api/sentiment/response`, {
            method: 'POST', headers, body: JSON.stringify(newSurvey),
        });
        const d = await res.json();
        if (d.success) {
            setSubmitMsg('Response recorded');
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.submit',
                    message: 'sentiment.survey.submit',
                    level: 'info',
                    data: { tenantId: newSurvey.tenantId, score: newSurvey.score, channel: newSurvey.channel },
                });
            } catch { /* Sentry no-op when DSN unset */ }
            // Refresh trends via the static-aware route.
            try {
                const view = await strataGet<SentimentScoreView>('/sentiment/scores');
                setTrends(view.trends);
            } catch { /* leave existing trends in place on refresh failure */ }
        } else {
            setSubmitMsg(`${d.error}`);
        }
    };

    const atRisk = trends.filter(t => t.atRisk);
    const displayTrends = activeView === 'atRisk' ? atRisk : trends;

    return (
        <div data-testid="sentiment-module" style={{ padding: 20, fontFamily: 'Inter, sans-serif', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, color: 'var(--text-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Newspaper size={20} aria-hidden />Tenant Sentiment</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Pulse surveys &amp; satisfaction trends across the portfolio</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {atRisk.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#450a0a', border: '1px solid #ef4444', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#ef4444' }}>
                            <AlertTriangle size={12} /> {atRisk.length} at-risk tenant{atRisk.length > 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            </div>

            {/* Stats bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                    { label: 'Total Tracked', value: trends.length, color: 'var(--accent)' },
                    { label: 'At Risk', value: atRisk.length, color: '#ef4444' },
                    { label: 'Improving', value: trends.filter(t => t.trend === 'improving').length, color: '#22c55e' },
                    { label: 'Avg Score', value: trends.length ? (trends.reduce((s, t) => s + t.avgScore, 0) / trends.length).toFixed(1) + '/5' : 'N/A', color: '#eab308' },
                ].map(s => (
                    <div key={s.label} data-testid="sentiment-stats-card" style={{ background: '#1e2537', borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Tab nav */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #334155', paddingBottom: 0 }}>
                {([['all', 'All Tenants'], ['atRisk', `At Risk (${atRisk.length})`], ['add', '+ Record Survey']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setActiveView(key)}
                        data-testid={`sentiment-tab-${key === 'atRisk' ? 'atrisk' : key}`}
                        style={{ padding: '8px 16px', background: activeView === key ? '#D6FE51' : 'transparent', border: 'none', borderRadius: '6px 6px 0 0', color: activeView === key ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Add survey form */}
            {activeView === 'add' && (
                <div style={{ background: '#1e2537', borderRadius: 12, padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 15, color: 'var(--text-primary)' }}>Record New Survey Response</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Tenant</label>
                            <select value={newSurvey.tenantId} onChange={e => setNewSurvey(s => ({ ...s, tenantId: e.target.value }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#0f1624', border: '1px solid #334155', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13 }}>
                                <option value="">Select tenant...</option>
                                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Channel</label>
                            <select value={newSurvey.channel} onChange={e => setNewSurvey(s => ({ ...s, channel: e.target.value }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#0f1624', border: '1px solid #334155', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13 }}>
                                <option value="manual">Manual (phone/in-person)</option>
                                <option value="email">Email</option>
                                <option value="sms">SMS</option>
                            </select>
                        </div>
                        <div style={{ gridColumn: '1/-1' }}>
                            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Satisfaction Score: {SCORE_LABELS[newSurvey.score]}</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[1, 2, 3, 4, 5].map(n => (
                                    <button key={n} onClick={() => setNewSurvey(s => ({ ...s, score: n }))}
                                        style={{ flex: 1, padding: '12px 0', background: newSurvey.score === n ? SCORE_COLORS[n] : '#0f1624', border: `2px solid ${newSurvey.score === n ? SCORE_COLORS[n] : '#334155'}`, borderRadius: 8, color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div style={{ gridColumn: '1/-1' }}>
                            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Comments (optional)</label>
                            <textarea value={newSurvey.comments} onChange={e => setNewSurvey(s => ({ ...s, comments: e.target.value }))} rows={3}
                                placeholder="Any notes from the conversation..."
                                style={{ width: '100%', padding: '8px 10px', background: '#0f1624', border: '1px solid #334155', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
                        <button onClick={submitSurvey}
                            style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                            <CheckCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Save Response
                        </button>
                        {submitMsg && <span style={{ fontSize: 13, color: !/error|please|requires|fail|invalid|not /i.test(submitMsg) ? '#22c55e' : '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 5 }}>{!/error|please|requires|fail|invalid|not /i.test(submitMsg) ? <CheckCircle size={13} aria-hidden /> : <AlertTriangle size={13} aria-hidden />}{submitMsg}</span>}
                    </div>
                </div>
            )}

            {/* Trends list */}
            {activeView !== 'add' && (
                <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 16 }}>
                    <div style={{ background: '#1e2537', borderRadius: 12, overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading sentiment data...</div>
                        ) : displayTrends.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                                No sentiment data yet. Click "+ Record Survey" to add the first response.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                                        {['Tenant', 'Unit', 'Property', 'Score', 'Trend', 'Avg', ''].map(h => (
                                            <th key={h} style={{ padding: '10px 14px', borderBottom: '1px solid #334155', fontWeight: 500 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayTrends.map(t => (
                                        <tr key={t.tenantId} onClick={() => setSelected(s => s?.tenantId === t.tenantId ? null : t)}
                                            data-testid="sentiment-tenant-row"
                                            {...(t.atRisk ? { 'data-atrisk': 'true' } : {})}
                                            style={{ borderBottom: '1px solid #1a2233', cursor: 'pointer', background: selected?.tenantId === t.tenantId ? '#293244' : 'transparent', transition: 'background 0.15s' }}>
                                            <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                {t.atRisk && <AlertTriangle size={12} color="#ef4444" style={{ marginRight: 6, verticalAlign: 'middle' }} />}
                                                {t.tenantName}
                                            </td>
                                            <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{t.unit}</td>
                                            <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {t.propertyId ? (
                                                    <button className="s-property-link" style={{ fontSize: 'inherit' }} onClick={(e) => { e.stopPropagation(); navigateToProperty(t.propertyId); }}>{t.propertyName}</button>
                                                ) : t.propertyName}
                                            </td>
                                            <td style={{ padding: '10px 14px' }}><ScoreBadge score={t.latestScore} /></td>
                                            <td style={{ padding: '10px 14px' }}><TrendIcon trend={t.trend} /></td>
                                            <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{t.avgScore}</td>
                                            <td style={{ padding: '10px 14px', color: 'var(--accent)', fontSize: 12 }}>View ›</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Detail panel */}
                    {selected && (
                        <div data-testid="sentiment-detail-panel" style={{ background: '#1e2537', borderRadius: 12, padding: 18 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{selected.tenantName}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                        {selected.unit} · {selected.propertyId ? (
                                            <button className="s-property-link" style={{ fontSize: 12 }} onClick={() => navigateToProperty(selected.propertyId)}>{selected.propertyName}</button>
                                        ) : selected.propertyName}
                                    </div>
                                </div>
                                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>×</button>
                            </div>

                            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                                <ScoreBadge score={selected.latestScore} />
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: selected.trend === 'declining' ? '#ef4444' : selected.trend === 'improving' ? '#22c55e' : '#94a3b8' }}>
                                    <TrendIcon trend={selected.trend} /> {selected.trend}
                                </span>
                                {selected.atRisk && <span data-testid="sentiment-detail-atrisk-badge" style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} aria-hidden />At Risk</span>}
                            </div>

                            {selected.responses.length > 1 && (
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Score History</div>
                                    <ResponsiveContainer width="100%" height={100}>
                                        <LineChart data={[...selected.responses].reverse().map(r => ({ date: r.surveyDate.slice(0, 10), score: r.score }))}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} />
                                            <YAxis domain={[1, 5]} tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} />
                                            <Tooltip contentStyle={{ background: '#0f1624', border: '1px solid #334155', fontSize: 11 }} />
                                            <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#D6FE51' }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Response History</div>
                                {selected.responses.slice(0, 5).map(r => (
                                    <div key={r.id} style={{ padding: '10px 12px', background: '#0f1624', borderRadius: 8, marginBottom: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <ScoreBadge score={r.score} />
                                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.surveyDate.slice(0, 10)} · {r.channel}</span>
                                        </div>
                                        {r.comments && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>"{r.comments}"</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Task 2.8 — ErrorBoundary wrap mirrors the 2.1 / 2.2 / 2.4 / 2.10
// retrofit pattern. Inner module body holds the hooks; this exported
// wrapper owns the boundary so a render fault in any sub-section
// degrades gracefully instead of taking the whole shell down.
export default function SentimentModule() {
    return (
        <ErrorBoundary fallback={<div className="s-glass-card" style={{ padding: 14, color: '#ef4444', fontSize: 12 }}>Sentiment module unavailable.</div>}>
            <SentimentModuleInner />
        </ErrorBoundary>
    );
}
