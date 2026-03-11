/**
 * ReportingModule — Reports, Scheduled Reports, Metrics, Surveys (mirrors AppFolio Reporting)
 */
import { useState, useEffect, useCallback } from 'react';
import {
    BarChart3, RefreshCw, FileText, Clock, PieChart, Clipboard,
    Download, Calendar, TrendingUp, Building2, DollarSign, Users
} from 'lucide-react';
import { strataGet } from '../strataApi';
import type { Report } from '../strataTypes';
import { useUser } from '../../../context/UserContext';

type ReportTab = 'reports' | 'scheduled' | 'metrics' | 'surveys' | 'custom-query';

const TABS: { id: ReportTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'scheduled', label: 'Scheduled Reports', icon: Clock },
    { id: 'metrics', label: 'Metrics', icon: PieChart },
    { id: 'custom-query', label: 'Custom Query', icon: BarChart3 },
    { id: 'surveys', label: 'Surveys', icon: Clipboard },
];

const REPORT_TEMPLATES = [
    { id: 'delinquency', name: 'Delinquency', icon: <DollarSign size={16} />, color: '#ef4444', description: 'Outstanding tenant balances and aging' },
    { id: 'tenant-ledger', name: 'Tenant Ledger', icon: <Users size={16} />, color: '#6366f1', description: 'Individual tenant transaction history' },
    { id: 'income-statement', name: 'Income Statement', icon: <TrendingUp size={16} />, color: '#10b981', description: 'Revenue and expense summary by period' },
    { id: 'vacancy-detail', name: 'Unit Vacancy Detail', icon: <Building2 size={16} />, color: '#f59e0b', description: 'Vacant units with days vacant and market rent' },
    { id: 'rent-roll', name: 'Rent Roll', icon: <FileText size={16} />, color: '#0ea5e9', description: 'Current rent amounts for all occupied units' },
    { id: 'cash-flow', name: 'Cash Flow', icon: <DollarSign size={16} />, color: '#a78bfa', description: 'Cash inflows and outflows by period' },
    { id: 'lease-expiration', name: 'Lease Expiration Detail By Month', icon: <Calendar size={16} />, color: '#818cf8', description: 'Leases expiring grouped by month' },
    { id: 'balance-sheet', name: 'Balance Sheet', icon: <BarChart3 size={16} />, color: '#10b981', description: 'Assets, liabilities, and equity summary' },
    { id: 't12', name: 'T12 (Trailing Twelve Months)', icon: <TrendingUp size={16} />, color: '#8b5cf6', description: 'Rolling 12-month income & expense breakdown by property' },
    { id: 'bill-detail', name: 'Bill Detail', icon: <FileText size={16} />, color: '#ec4899', description: 'Detailed vendor bills, payment status, and aging' },
    { id: 'business-metrics', name: 'Business Metrics', icon: <PieChart size={16} />, color: '#f59e0b', description: 'KPIs and operational performance metrics' },
];

const SCHEDULED_REPORTS = [
    { id: 1, name: 'Monthly Delinquency', frequency: 'Monthly', nextRun: '2026-03-01', recipients: 'andy@dwellium.com, lisa@dwellium.com' },
    { id: 2, name: 'Weekly Vacancy Summary', frequency: 'Weekly', nextRun: '2026-02-24', recipients: 'andy@dwellium.com' },
    { id: 3, name: 'Quarterly Income Statement', frequency: 'Quarterly', nextRun: '2026-04-01', recipients: 'andy@dwellium.com, lisa@dwellium.com, nasser@dwellium.com' },
];

const METRICS_DATA = [
    { label: 'Occupancy Rate', value: '94.2%', trend: '+1.3%', color: '#10b981' },
    { label: 'Avg. Days to Lease', value: '23', trend: '-4 days', color: '#6366f1' },
    { label: 'Rent Collection Rate', value: '97.8%', trend: '+0.5%', color: '#0ea5e9' },
    { label: 'Maintenance Response', value: '1.2 days', trend: '-0.3 days', color: '#f59e0b' },
    { label: 'Net Operating Income', value: '$142,500', trend: '+6.2%', color: '#a78bfa' },
    { label: 'Delinquency Rate', value: '2.1%', trend: '-0.4%', color: '#ef4444' },
];

export default function ReportingModule() {
    const { hasPermission } = useUser();
    const [tab, setTab] = useState<ReportTab>('reports');
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [queryField, setQueryField] = useState('coi');
    const [queryResults, setQueryResults] = useState<any[]>([]);
    const [queryLoading, setQueryLoading] = useState(false);

    const TAB_PERMS: Record<ReportTab, string> = {
        reports: 'strata:reporting:reports',
        scheduled: 'strata:reporting:scheduled',
        metrics: 'strata:reporting:metrics',
        'custom-query': 'strata:reporting:reports',
        surveys: 'strata:reporting:surveys',
    };
    const visibleTabs = TABS.filter(t => hasPermission(TAB_PERMS[t.id]));

    const fetchReports = useCallback(async () => {
        setLoading(true);
        try {
            const data = await strataGet<Report[]>('/reports');
            setReports(data);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchReports(); }, [fetchReports]);

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">Reporting</h2>
                    <p className="s-module-subtitle">Reports, schedules, metrics & surveys</p>
                </div>
                <div className="s-module-actions">
                    <button className="s-btn s-btn-ghost" onClick={fetchReports}><RefreshCw size={14} /></button>
                </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {visibleTabs.map(t => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            style={{
                                padding: '6px 12px', border: 'none', borderRadius: 6,
                                background: tab === t.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                color: tab === t.id ? '#818cf8' : '#94a3b8',
                                cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <Icon size={13} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {loading && <div className="s-loading">Loading…</div>}

            {/* Reports Tab */}
            {tab === 'reports' && !loading && (
                <>
                    {/* Report Templates */}
                    <div className="s-glass-card" style={{ marginBottom: 16 }}>
                        <h3 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>Run a Report</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                            {REPORT_TEMPLATES.map(rt => (
                                <button
                                    key={rt.id}
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
                                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                                    }}
                                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.3)'; }}
                                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; }}
                                >
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${rt.color}15`, color: rt.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {rt.icon}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>{rt.name}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{rt.description}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Generated Reports */}
                    <div className="s-glass-card">
                        <h3 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>
                            <FileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                            Generated Reports
                        </h3>
                        {reports.length === 0 ? (
                            <p style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 20 }}>No reports generated yet. Select a template above to run your first report.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {reports.map(r => (
                                    <div key={r.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                        background: 'rgba(255,255,255,0.02)', borderRadius: 6,
                                        border: '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        <FileText size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{r.reportType} Report</div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>{r.period} · Generated {new Date(r.createdAt).toLocaleDateString()}</div>
                                        </div>
                                        <button style={{
                                            padding: '4px 8px', border: 'none', borderRadius: 4,
                                            background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', cursor: 'pointer',
                                            fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3,
                                        }}>
                                            <Download size={11} /> Export
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Scheduled Reports Tab */}
            {tab === 'scheduled' && !loading && (
                <div className="s-glass-card">
                    <h3 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>
                        <Clock size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                        Scheduled Reports
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {SCHEDULED_REPORTS.map(sr => (
                            <div key={sr.id} style={{
                                padding: '12px 16px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>{sr.name}</span>
                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', fontWeight: 600 }}>{sr.frequency}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                    <span>Next run: {sr.nextRun}</span>
                                    <span style={{ margin: '0 8px' }}>·</span>
                                    <span>Recipients: {sr.recipients}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Metrics Tab */}
            {tab === 'metrics' && !loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {METRICS_DATA.map(m => (
                        <div key={m.label} className="s-glass-card" style={{ padding: '16px 20px' }}>
                            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>{m.label}</div>
                            <div style={{ fontSize: 28, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{m.value}</div>
                            <div style={{ fontSize: 12, color: m.color, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <TrendingUp size={12} /> {m.trend}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Custom Query Tab */}
            {tab === 'custom-query' && !loading && (
                <div className="s-glass-card">
                    <h3 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>
                        <BarChart3 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                        Dynamic Report Query
                    </h3>
                    <p style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
                        Select a compliance or data field to run a live query across all entities.
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        {[
                            { id: 'coi', label: 'COI Status' },
                            { id: 'w9', label: 'W-9 Status' },
                            { id: 'insurance', label: 'Insurance' },
                            { id: 'leases', label: 'Expiring Leases' },
                            { id: 'work_orders', label: 'Open Work Orders' },
                        ].map(f => (
                            <button key={f.id} onClick={() => setQueryField(f.id)}
                                style={{
                                    padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                    background: queryField === f.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                    color: queryField === f.id ? '#818cf8' : '#94a3b8',
                                }}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <button onClick={async () => {
                        setQueryLoading(true);
                        try {
                            if (['coi', 'w9', 'insurance'].includes(queryField)) {
                                const data = await strataGet<any>('/compliance/gaps');
                                setQueryResults((data.gaps || []).filter((g: any) => g.gapType === queryField));
                            } else if (queryField === 'leases') {
                                const data = await strataGet<any[]>('/workitems', { type: 'lease' });
                                const expiring = (data || []).filter((w: any) => {
                                    const end = w.metadata?.leaseEnd;
                                    if (!end) return false;
                                    const daysLeft = Math.floor((new Date(end).getTime() - Date.now()) / 86400000);
                                    return daysLeft >= 0 && daysLeft <= 90;
                                });
                                setQueryResults(expiring.map((w: any) => ({ entityName: w.title, gapType: 'lease', severity: 'warning', message: `Lease ends ${w.metadata?.leaseEnd}`, recommendation: 'Initiate renewal' })));
                            } else {
                                const data = await strataGet<any[]>('/workitems', { type: 'work_order', status: 'open' });
                                setQueryResults((data || []).map((w: any) => ({ entityName: w.title, gapType: 'work_order', severity: w.priority === 'high' ? 'critical' : 'warning', message: `${w.status} — ${w.priority}`, recommendation: 'Review and assign' })));
                            }
                        } catch { setQueryResults([]); }
                        setQueryLoading(false);
                    }} style={{
                        padding: '8px 20px', border: 'none', borderRadius: 6, background: '#6366f1', color: '#fff',
                        fontWeight: 700, cursor: 'pointer', fontSize: 13, marginBottom: 16,
                    }}>
                        {queryLoading ? 'Running…' : 'Run Query'}
                    </button>

                    {queryResults.length > 0 && (
                        <div style={{ overflow: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 10px', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>Entity</th>
                                        <th style={{ textAlign: 'left', padding: '8px 10px', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>Type</th>
                                        <th style={{ textAlign: 'left', padding: '8px 10px', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>Severity</th>
                                        <th style={{ textAlign: 'left', padding: '8px 10px', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>Message</th>
                                        <th style={{ textAlign: 'left', padding: '8px 10px', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queryResults.map((r: any, i: number) => (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={{ padding: '8px 10px', color: '#e2e8f0', fontWeight: 500 }}>{r.entityName}</td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', fontWeight: 600, textTransform: 'uppercase' }}>{r.gapType}</span>
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: r.severity === 'critical' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', color: r.severity === 'critical' ? '#ef4444' : '#f59e0b' }}>{r.severity}</span>
                                            </td>
                                            <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{r.message}</td>
                                            <td style={{ padding: '8px 10px', color: '#6366f1', fontSize: 11 }}>{r.recommendation}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {queryResults.length === 0 && !queryLoading && <p style={{ color: '#475569', fontSize: 12 }}>Select a field and run a query to see results.</p>}
                </div>
            )}

            {/* Surveys Tab */}
            {tab === 'surveys' && !loading && (
                <div className="s-glass-card" style={{ textAlign: 'center', padding: 40 }}>
                    <Clipboard size={40} strokeWidth={1} style={{ color: '#475569', marginBottom: 12 }} />
                    <h3 style={{ color: '#e2e8f0', margin: '0 0 6px' }}>Tenant Surveys</h3>
                    <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Create and distribute satisfaction surveys to tenants</p>
                    <span style={{ display: 'inline-block', marginTop: 12, padding: '4px 12px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', fontSize: 12, fontWeight: 600 }}>Coming Soon</span>
                </div>
            )}
        </div>
    );
}
