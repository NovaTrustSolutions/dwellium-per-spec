/**
 * IntelligenceDashboard — 4-panel view for the Intelligence Layer.
 *
 * Panels: James Agent, Anomalies, ROI Engine, Institutional Memory.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../config';
import {
    Shield, AlertTriangle, DollarSign, BookOpen, RefreshCw,
    CheckCircle, XCircle, TrendingUp, Search, Clock, Zap, ChevronRight,
} from 'lucide-react';

const API = API_BASE;

interface Anomaly {
    id: string;
    type: string;
    severity: string;
    title: string;
    description: string;
    property_id: string | null;
    detected_by: string;
    acknowledged_at: string | null;
    created_at: string;
}

interface AgentRun {
    id: string;
    agent_id: string;
    agent_name: string;
    status: string;
    duration_ms: number;
    findings_count: number;
    result_summary: string;
    created_at: string;
}

interface Lesson {
    id: string;
    category: string;
    domain: string;
    title: string;
    body: string;
    impactScore: number;
    tags: string[];
    createdAt: string;
}

interface ROIResult {
    workitemId: string;
    estimatedCost: number;
    projectedSavings: number;
    roiPercent: number;
    paybackMonths: number;
    riskLevel: string;
    recommendation: string;
    rationale: string;
}

// ── James Panel ──────────────────────────────────────────────────

function JamesPanel() {
    const [runs, setRuns] = useState<AgentRun[]>([]);
    const [running, setRunning] = useState(false);
    const [lastResult, setLastResult] = useState<any>(null);

    const fetchRuns = useCallback(() => {
        fetch(`${API}/api/intelligence/observability`)
            .then(r => r.json())
            .then(d => { if (d.success) setRuns(d.data.recentRuns || []); })
            .catch(() => { });
    }, []);

    useEffect(() => { fetchRuns(); }, [fetchRuns]);

    const triggerSweep = async () => {
        setRunning(true);
        try {
            const res = await fetch(`${API}/api/intelligence/james/run`, { method: 'POST' });
            const data = await res.json();
            if (data.success) setLastResult(data.data);
            fetchRuns();
        } catch { /* noop */ }
        setRunning(false);
    };

    return (
        <div className="intel-panel spotlight-card intel-james">
            <div className="intel-panel-header">
                <Shield size={18} />
                <h3>James Agent</h3>
                <button className="intel-btn intel-btn-primary" onClick={triggerSweep} disabled={running}>
                    {running ? <RefreshCw size={14} className="intel-spin" /> : <Zap size={14} />}
                    {running ? 'Sweeping…' : 'Run Audit'}
                </button>
            </div>

            {lastResult && (
                <div className={`intel-result-banner ${lastResult.findings.length > 0 ? 'intel-result-warn' : 'intel-result-ok'}`}>
                    <span>{lastResult.summary}</span>
                    <span className="intel-duration">{lastResult.durationMs}ms</span>
                </div>
            )}

            <div className="intel-runs-list">
                {runs.filter(r => r.agent_id === 'james-audit').slice(0, 5).map(run => (
                    <div key={run.id} className="intel-run-item">
                        <span className={`intel-status intel-status-${run.status}`}>
                            {run.status === 'completed' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        </span>
                        <span className="intel-run-summary">{run.result_summary || 'Running…'}</span>
                        <span className="intel-run-meta">{run.duration_ms}ms • {new Date(run.created_at).toLocaleTimeString()}</span>
                    </div>
                ))}
                {runs.filter(r => r.agent_id === 'james-audit').length === 0 && (
                    <p className="intel-empty">No audit runs yet. Click "Run Audit" to begin.</p>
                )}
            </div>
        </div>
    );
}

// ── Anomalies Panel ──────────────────────────────────────────────

function AnomaliesPanel() {
    const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
    const [filter, setFilter] = useState<string>('all');

    const fetchAnomalies = useCallback(() => {
        const params = filter === 'unacked' ? '?acknowledged=false' : filter !== 'all' ? `?severity=${filter}` : '';
        fetch(`${API}/api/intelligence/anomalies${params}`)
            .then(r => r.json())
            .then(d => { if (d.success) setAnomalies(d.data || []); })
            .catch(() => {
                // Backend unavailable — show empty
                setAnomalies([]);
            });
    }, [filter]);

    useEffect(() => { fetchAnomalies(); }, [fetchAnomalies]);

    const acknowledge = async (id: string) => {
        await fetch(`${API}/api/intelligence/anomalies/${id}/ack`, { method: 'POST' }).catch(() => { });
        setAnomalies(prev => prev.map(a => a.id === id ? { ...a, acknowledged_at: new Date().toISOString() } : a));
    };

    const severityColor: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };

    return (
        <div className="intel-panel spotlight-card intel-anomalies">
            <div className="intel-panel-header">
                <AlertTriangle size={18} />
                <h3>Anomalies</h3>
                <span className="intel-badge">{anomalies.filter(a => !a.acknowledged_at).length}</span>
            </div>

            <div className="intel-filter-bar">
                {['all', 'critical', 'high', 'medium', 'unacked'].map(f => (
                    <button key={f} className={`intel-filter-btn ${filter === f ? 'active' : ''}`}
                        onClick={() => setFilter(f)}>{f}</button>
                ))}
            </div>

            <div className="intel-anomaly-list">
                {anomalies.slice(0, 8).map(a => (
                    <div key={a.id} className={`intel-anomaly-item ${a.acknowledged_at ? 'intel-acked' : ''}`}>
                        <span className="intel-severity-dot" style={{ background: severityColor[a.severity] }} />
                        <div className="intel-anomaly-content">
                            <strong>{a.title}</strong>
                            <span className="intel-anomaly-desc">{a.description}</span>
                            <span className="intel-anomaly-meta">{a.detected_by} • {a.type}</span>
                        </div>
                        {!a.acknowledged_at && (
                            <button className="intel-btn-small" onClick={() => acknowledge(a.id)} title="Acknowledge">
                                <CheckCircle size={14} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── ROI Panel ────────────────────────────────────────────────────

function ROIPanel() {
    const [result, setResult] = useState<ROIResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [workitemId, setWorkitemId] = useState('');

    // No pre-loaded mock result — starts empty until user runs analysis

    const runAnalysis = async () => {
        if (!workitemId) return;
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/intelligence/roi/${workitemId}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) setResult(data.data);
        } catch { /* noop */ }
        setLoading(false);
    };

    const recColor: Record<string, string> = { approve: '#22c55e', defer: '#eab308', reject: '#ef4444' };

    return (
        <div className="intel-panel spotlight-card intel-roi">
            <div className="intel-panel-header">
                <DollarSign size={18} />
                <h3>ROI Engine</h3>
            </div>

            <div className="intel-roi-input">
                <input
                    placeholder="Enter workitem ID…"
                    value={workitemId}
                    onChange={e => setWorkitemId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runAnalysis()}
                />
                <button className="intel-btn intel-btn-primary" onClick={runAnalysis} disabled={loading}>
                    {loading ? <RefreshCw size={14} className="intel-spin" /> : <TrendingUp size={14} />}
                    Analyze
                </button>
            </div>

            {result && (
                <div className="intel-roi-card">
                    <div className="intel-roi-grid">
                        <div className="intel-roi-metric">
                            <span className="intel-metric-label">Est. Cost</span>
                            <span className="intel-metric-value intel-red">${result.estimatedCost.toLocaleString()}</span>
                        </div>
                        <div className="intel-roi-metric">
                            <span className="intel-metric-label">Proj. Savings</span>
                            <span className="intel-metric-value intel-green">${result.projectedSavings.toLocaleString()}</span>
                        </div>
                        <div className="intel-roi-metric">
                            <span className="intel-metric-label">ROI</span>
                            <span className="intel-metric-value">{result.roiPercent}%</span>
                        </div>
                        <div className="intel-roi-metric">
                            <span className="intel-metric-label">Payback</span>
                            <span className="intel-metric-value">{result.paybackMonths} mo</span>
                        </div>
                    </div>
                    <div className="intel-roi-recommendation" style={{ borderColor: recColor[result.recommendation] }}>
                        <span className="intel-rec-label" style={{ color: recColor[result.recommendation] }}>
                            {result.recommendation.toUpperCase()}
                        </span>
                        <span className="intel-rec-risk">Risk: {result.riskLevel}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Memory Panel ─────────────────────────────────────────────────

function MemoryPanel() {
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [query, setQuery] = useState('');
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        fetch(`${API}/api/intelligence/memory/stats`)
            .then(r => r.json())
            .then(d => { if (d.success) setStats(d.data); })
            .catch(() => { });

        fetch(`${API}/api/intelligence/memory/lessons?limit=10`)
            .then(r => r.json())
            .then(d => { if (d.success) setLessons(d.data || []); })
            .catch(() => {
                // Backend unavailable — show empty
                setLessons([]);
            });
    }, []);

    const search = async () => {
        if (!query) return;
        try {
            const res = await fetch(`${API}/api/intelligence/memory/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.success) setLessons(data.data || []);
        } catch { /* noop */ }
    };

    return (
        <div className="intel-panel spotlight-card intel-memory">
            <div className="intel-panel-header">
                <BookOpen size={18} />
                <h3>Institutional Memory</h3>
                {stats && <span className="intel-badge">{stats.totalLessons} lessons</span>}
            </div>

            <div className="intel-search-bar">
                <Search size={14} />
                <input placeholder="Search precedents…" value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && search()} />
            </div>

            <div className="intel-lessons-list">
                {lessons.map(l => (
                    <div key={l.id} className="intel-lesson-item">
                        <div className="intel-lesson-header">
                            <span className="intel-lesson-category">{l.category}</span>
                            <span className="intel-lesson-score">Impact: {l.impactScore}/10</span>
                        </div>
                        <strong>{l.title}</strong>
                        <p className="intel-lesson-body">{l.body.slice(0, 120)}…</p>
                        <div className="intel-lesson-tags">
                            {l.tags.slice(0, 3).map(t => <span key={t} className="intel-tag">{t}</span>)}
                        </div>
                    </div>
                ))}
                {lessons.length === 0 && (
                    <p className="intel-empty">No lessons found. Ingest resolved workitems to build memory.</p>
                )}
            </div>
        </div>
    );
}

// ── Main Export ───────────────────────────────────────────────────

export default function IntelligenceDashboard() {
    return (
        <div className="intel-dashboard">
            <div className="intel-grid">
                <JamesPanel />
                <AnomaliesPanel />
                <ROIPanel />
                <MemoryPanel />
            </div>
        </div>
    );
}
