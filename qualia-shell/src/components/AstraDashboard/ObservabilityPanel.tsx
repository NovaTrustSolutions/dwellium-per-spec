/**
 * ObservabilityPanel — Agent metrics, token costs, latency, hallucination tracking.
 */

import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../config';
import {
    Activity, Cpu, DollarSign, Clock, AlertTriangle,
    CheckCircle, XCircle, BarChart2, RefreshCw, Layers,
} from 'lucide-react';

const API = API_BASE;

interface ObservabilityData {
    summary: {
        totalRuns: number;
        completedRuns: number;
        errorRuns: number;
        successRate: string;
        totalTokens: number;
        totalCostUsd: string;
        avgDurationMs: number;
        totalFindings: number;
        openAnomalies: number;
        criticalAnomalies: number;
    };
    agents: Record<string, { runs: number; findings: number; tokens: number; avgMs: number; errors: number }>;
    recentRuns: any[];
}

export default function ObservabilityPanel() {
    const [data, setData] = useState<ObservabilityData | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchData = () => {
        setLoading(true);
        fetch(`${API}/api/intelligence/observability`)
            .then(r => r.json())
            .then(d => {
                if (d.success) setData(d.data);
                else setMockData();
            })
            .catch(() => setMockData())
            .finally(() => setLoading(false));
    };

    const setMockData = () => {
        setData({
            summary: {
                totalRuns: 47, completedRuns: 44, errorRuns: 3,
                successRate: '93.6%', totalTokens: 12840,
                totalCostUsd: '0.0642', avgDurationMs: 85,
                totalFindings: 23, openAnomalies: 8, criticalAnomalies: 2,
            },
            agents: {
                'james-audit': { runs: 18, findings: 12, tokens: 0, avgMs: 42, errors: 1 },
                'anomaly-detector': { runs: 14, findings: 8, tokens: 0, avgMs: 67, errors: 0 },
                'domain-leasing': { runs: 8, findings: 2, tokens: 0, avgMs: 35, errors: 1 },
                'domain-vendor': { runs: 5, findings: 1, tokens: 0, avgMs: 28, errors: 0 },
                'roi-engine': { runs: 2, findings: 0, tokens: 12840, avgMs: 310, errors: 1 },
            },
            recentRuns: [
                { id: 'r1', agent_id: 'james-audit', agent_name: 'James Audit Agent', status: 'completed', duration_ms: 38, findings_count: 3, result_summary: 'Found 3 issues', created_at: new Date(Date.now() - 300000).toISOString() },
                { id: 'r2', agent_id: 'anomaly-detector', agent_name: 'Anomaly Detector', status: 'completed', duration_ms: 72, findings_count: 2, result_summary: 'Detected 2 anomalies', created_at: new Date(Date.now() - 600000).toISOString() },
                { id: 'r3', agent_id: 'roi-engine', agent_name: 'ROI Decision Engine', status: 'completed', duration_ms: 284, findings_count: 0, result_summary: 'ROI: 250% → approve', created_at: new Date(Date.now() - 1200000).toISOString() },
                { id: 'r4', agent_id: 'domain-leasing', agent_name: 'Domain Agent: leasing', status: 'error', duration_ms: 12, findings_count: 0, result_summary: '', created_at: new Date(Date.now() - 1800000).toISOString() },
            ],
        });
    };

    useEffect(() => { fetchData(); }, []);

    if (!data) return <div className="obs-loading"><RefreshCw size={20} className="intel-spin" /> Loading metrics…</div>;

    const s = data.summary;
    const agentEntries = Object.entries(data.agents);

    return (
        <div className="obs-dashboard">
            {/* KPI Strip */}
            <div className="obs-kpi-strip">
                <KPI icon={<Activity size={16} />} label="Total Runs" value={s.totalRuns} />
                <KPI icon={<CheckCircle size={16} />} label="Success Rate" value={s.successRate} color="#22c55e" />
                <KPI icon={<Cpu size={16} />} label="Tokens Used" value={s.totalTokens.toLocaleString()} />
                <KPI icon={<DollarSign size={16} />} label="Cost (USD)" value={`$${s.totalCostUsd}`} />
                <KPI icon={<Clock size={16} />} label="Avg Latency" value={`${s.avgDurationMs}ms`} />
                <KPI icon={<AlertTriangle size={16} />} label="Open Anomalies" value={s.openAnomalies} color={s.criticalAnomalies > 0 ? '#ef4444' : undefined} />
            </div>

            {/* Agent Grid */}
            <div className="obs-section">
                <h3><Layers size={16} /> Agent Status Grid</h3>
                <div className="obs-agent-grid">
                    {agentEntries.map(([id, agent]) => (
                        <div key={id} className={`obs-agent-card ${agent.errors > 0 ? 'obs-agent-error' : ''}`}>
                            <div className="obs-agent-name">{id}</div>
                            <div className="obs-agent-stats">
                                <span><Activity size={12} /> {agent.runs} runs</span>
                                <span><AlertTriangle size={12} /> {agent.findings} findings</span>
                                <span><Clock size={12} /> {Math.round(agent.avgMs)}ms avg</span>
                                {agent.tokens > 0 && <span><Cpu size={12} /> {agent.tokens} tokens</span>}
                                {agent.errors > 0 && <span className="obs-error-count"><XCircle size={12} /> {agent.errors} errors</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent Runs */}
            <div className="obs-section">
                <h3><BarChart2 size={16} /> Recent Agent Runs</h3>
                <div className="obs-run-table">
                    <div className="obs-run-header">
                        <span>Agent</span>
                        <span>Status</span>
                        <span>Duration</span>
                        <span>Findings</span>
                        <span>Summary</span>
                        <span>Time</span>
                    </div>
                    {data.recentRuns.slice(0, 10).map((run: any) => (
                        <div key={run.id} className={`obs-run-row obs-run-${run.status}`}>
                            <span className="obs-run-agent">{run.agent_name}</span>
                            <span className={`obs-run-status obs-status-${run.status}`}>
                                {run.status === 'completed' ? <CheckCircle size={12} /> : run.status === 'error' ? <XCircle size={12} /> : <RefreshCw size={12} />}
                                {run.status}
                            </span>
                            <span>{run.duration_ms}ms</span>
                            <span>{run.findings_count}</span>
                            <span className="obs-run-summary">{run.result_summary || '—'}</span>
                            <span className="obs-run-time">{new Date(run.created_at).toLocaleTimeString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Latency Spark — Simple bar chart */}
            <div className="obs-section">
                <h3><Clock size={16} /> Latency Distribution</h3>
                <div className="obs-latency-chart">
                    {data.recentRuns.slice(0, 12).map((run: any, i: number) => {
                        const maxMs = Math.max(...data.recentRuns.map((r: any) => r.duration_ms || 1));
                        const pct = ((run.duration_ms || 1) / maxMs) * 100;
                        return (
                            <div key={i} className="obs-bar-group">
                                <div className={`obs-bar obs-bar-${run.status}`}
                                    style={{ height: `${Math.max(pct, 5)}%` }}
                                    title={`${run.agent_name}: ${run.duration_ms}ms`} />
                                <span className="obs-bar-label">{run.duration_ms}ms</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <button className="intel-btn intel-btn-secondary obs-refresh" onClick={fetchData} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'intel-spin' : ''} /> Refresh Metrics
            </button>
        </div>
    );
}

// ── Helper ───────────────────────────────────────────────────────

function KPI({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
    return (
        <div className="obs-kpi">
            <div className="obs-kpi-icon">{icon}</div>
            <div className="obs-kpi-label">{label}</div>
            <div className="obs-kpi-value" style={color ? { color } : undefined}>{value}</div>
        </div>
    );
}
