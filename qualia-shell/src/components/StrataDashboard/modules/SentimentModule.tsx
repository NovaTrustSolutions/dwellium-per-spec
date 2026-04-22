import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, TrendingDown, TrendingUp, Minus, Plus, CheckCircle } from 'lucide-react';
import { strataGet } from '../strataApi';

const API = 'http://localhost:3000';

interface SentimentTrend {
    tenantId: string;
    tenantName: string;
    unit: string;
    propertyName: string;
    latestScore: number;
    avgScore: number;
    trend: 'improving' | 'stable' | 'declining';
    consecutiveDeclines: number;
    atRisk: boolean;
    responses: { id: string; score: number; comments: string; surveyDate: string; channel: string }[];
}

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

export default function SentimentModule() {
    const [trends, setTrends] = useState<SentimentTrend[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState<'all' | 'atRisk' | 'add'>('all');
    const [selected, setSelected] = useState<SentimentTrend | null>(null);
    const [newSurvey, setNewSurvey] = useState({ tenantId: '', score: 3, comments: '', channel: 'manual' });
    const [submitMsg, setSubmitMsg] = useState('');
    const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);

    const token = localStorage.getItem('dwellium_token');
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    useEffect(() => {
        setLoading(true);
        fetch(`${API}/api/sentiment/trends`, { headers })
            .then(r => r.json())
            .then(d => {
                if (d.success) setTrends(d.data);
            })
            .finally(() => setLoading(false));

        // Route tenant list through strataApi so static/backend modes both work.
        strataGet<any>('/entities', { type: 'tenant', limit: '300' })
            .then((d: any) => {
                const rows = Array.isArray(d) ? d : (d?.data ?? []);
                setTenants(rows.map((t: any) => ({ id: t.id, name: t.name })));
            })
            .catch(() => setTenants([]));
    }, []);

    const submitSurvey = async () => {
        if (!newSurvey.tenantId) return setSubmitMsg('Please select a tenant');
        const res = await fetch(`${API}/api/sentiment/response`, {
            method: 'POST', headers, body: JSON.stringify(newSurvey),
        });
        const d = await res.json();
        if (d.success) {
            setSubmitMsg('✅ Response recorded');
            // Refresh trends
            const r2 = await fetch(`${API}/api/sentiment/trends`, { headers });
            const d2 = await r2.json();
            if (d2.success) setTrends(d2.data);
        } else {
            setSubmitMsg(`❌ ${d.error}`);
        }
    };

    const atRisk = trends.filter(t => t.atRisk);
    const displayTrends = activeView === 'atRisk' ? atRisk : trends;

    return (
        <div style={{ padding: 20, fontFamily: 'Inter, sans-serif', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, color: '#f1f5f9', fontWeight: 700 }}>🗞️ Tenant Sentiment</h2>
                    <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>Pulse surveys &amp; satisfaction trends across the portfolio</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {atRisk.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#450a0a', border: '1px solid #ef4444', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#fca5a5' }}>
                            <AlertTriangle size={12} /> {atRisk.length} at-risk tenant{atRisk.length > 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            </div>

            {/* Stats bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                    { label: 'Total Tracked', value: trends.length, color: '#6366f1' },
                    { label: 'At Risk', value: atRisk.length, color: '#ef4444' },
                    { label: 'Improving', value: trends.filter(t => t.trend === 'improving').length, color: '#22c55e' },
                    { label: 'Avg Score', value: trends.length ? (trends.reduce((s, t) => s + t.avgScore, 0) / trends.length).toFixed(1) + '/5' : 'N/A', color: '#eab308' },
                ].map(s => (
                    <div key={s.label} style={{ background: '#1e2537', borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Tab nav */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #334155', paddingBottom: 0 }}>
                {([['all', 'All Tenants'], ['atRisk', `At Risk (${atRisk.length})`], ['add', '+ Record Survey']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setActiveView(key)}
                        style={{ padding: '8px 16px', background: activeView === key ? '#6366f1' : 'transparent', border: 'none', borderRadius: '6px 6px 0 0', color: activeView === key ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Add survey form */}
            {activeView === 'add' && (
                <div style={{ background: '#1e2537', borderRadius: 12, padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#f1f5f9' }}>Record New Survey Response</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Tenant</label>
                            <select value={newSurvey.tenantId} onChange={e => setNewSurvey(s => ({ ...s, tenantId: e.target.value }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#0f1624', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 13 }}>
                                <option value="">Select tenant...</option>
                                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Channel</label>
                            <select value={newSurvey.channel} onChange={e => setNewSurvey(s => ({ ...s, channel: e.target.value }))}
                                style={{ width: '100%', padding: '8px 10px', background: '#0f1624', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 13 }}>
                                <option value="manual">Manual (phone/in-person)</option>
                                <option value="email">Email</option>
                                <option value="sms">SMS</option>
                            </select>
                        </div>
                        <div style={{ gridColumn: '1/-1' }}>
                            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Satisfaction Score: {SCORE_LABELS[newSurvey.score]}</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[1, 2, 3, 4, 5].map(n => (
                                    <button key={n} onClick={() => setNewSurvey(s => ({ ...s, score: n }))}
                                        style={{ flex: 1, padding: '12px 0', background: newSurvey.score === n ? SCORE_COLORS[n] : '#0f1624', border: `2px solid ${newSurvey.score === n ? SCORE_COLORS[n] : '#334155'}`, borderRadius: 8, color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div style={{ gridColumn: '1/-1' }}>
                            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Comments (optional)</label>
                            <textarea value={newSurvey.comments} onChange={e => setNewSurvey(s => ({ ...s, comments: e.target.value }))} rows={3}
                                placeholder="Any notes from the conversation..."
                                style={{ width: '100%', padding: '8px 10px', background: '#0f1624', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
                        <button onClick={submitSurvey}
                            style={{ padding: '10px 20px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                            <CheckCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Save Response
                        </button>
                        {submitMsg && <span style={{ fontSize: 13, color: submitMsg.startsWith('✅') ? '#22c55e' : '#ef4444' }}>{submitMsg}</span>}
                    </div>
                </div>
            )}

            {/* Trends list */}
            {activeView !== 'add' && (
                <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 16 }}>
                    <div style={{ background: '#1e2537', borderRadius: 12, overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading sentiment data...</div>
                        ) : displayTrends.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                No sentiment data yet. Click "+ Record Survey" to add the first response.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                                        {['Tenant', 'Unit', 'Property', 'Score', 'Trend', 'Avg', ''].map(h => (
                                            <th key={h} style={{ padding: '10px 14px', borderBottom: '1px solid #334155', fontWeight: 500 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayTrends.map(t => (
                                        <tr key={t.tenantId} onClick={() => setSelected(s => s?.tenantId === t.tenantId ? null : t)}
                                            style={{ borderBottom: '1px solid #1a2233', cursor: 'pointer', background: selected?.tenantId === t.tenantId ? '#293244' : 'transparent', transition: 'background 0.15s' }}>
                                            <td style={{ padding: '10px 14px', color: '#f1f5f9', fontWeight: 500 }}>
                                                {t.atRisk && <AlertTriangle size={12} color="#ef4444" style={{ marginRight: 6, verticalAlign: 'middle' }} />}
                                                {t.tenantName}
                                            </td>
                                            <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{t.unit}</td>
                                            <td style={{ padding: '10px 14px', color: '#94a3b8', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.propertyName}</td>
                                            <td style={{ padding: '10px 14px' }}><ScoreBadge score={t.latestScore} /></td>
                                            <td style={{ padding: '10px 14px' }}><TrendIcon trend={t.trend} /></td>
                                            <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{t.avgScore}</td>
                                            <td style={{ padding: '10px 14px', color: '#6366f1', fontSize: 12 }}>View ›</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Detail panel */}
                    {selected && (
                        <div style={{ background: '#1e2537', borderRadius: 12, padding: 18 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{selected.tenantName}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{selected.unit} · {selected.propertyName}</div>
                                </div>
                                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>×</button>
                            </div>

                            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                                <ScoreBadge score={selected.latestScore} />
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: selected.trend === 'declining' ? '#ef4444' : selected.trend === 'improving' ? '#22c55e' : '#94a3b8' }}>
                                    <TrendIcon trend={selected.trend} /> {selected.trend}
                                </span>
                                {selected.atRisk && <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>⚠ At Risk</span>}
                            </div>

                            {selected.responses.length > 1 && (
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Score History</div>
                                    <ResponsiveContainer width="100%" height={100}>
                                        <LineChart data={[...selected.responses].reverse().map(r => ({ date: r.surveyDate.slice(0, 10), score: r.score }))}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                            <YAxis domain={[1, 5]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                            <Tooltip contentStyle={{ background: '#0f1624', border: '1px solid #334155', fontSize: 11 }} />
                                            <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            <div>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Response History</div>
                                {selected.responses.slice(0, 5).map(r => (
                                    <div key={r.id} style={{ padding: '10px 12px', background: '#0f1624', borderRadius: 8, marginBottom: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <ScoreBadge score={r.score} />
                                            <span style={{ fontSize: 11, color: '#64748b' }}>{r.surveyDate.slice(0, 10)} · {r.channel}</span>
                                        </div>
                                        {r.comments && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>"{r.comments}"</div>}
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
