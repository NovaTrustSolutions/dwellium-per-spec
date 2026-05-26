/**
 * ReportingModule — Reports, Scheduled Reports, Metrics, Surveys, Rollups, Intake Queue (Phase 10)
 */
import { useState, useEffect, useCallback } from 'react';
import {
    BarChart3, RefreshCw, FileText, Clock, PieChart, Clipboard,
    Download, Calendar, TrendingUp, Building2, DollarSign, Users,
    Shield, AlertTriangle, CheckCircle2, XCircle, Truck, Inbox, ThumbsUp, ThumbsDown, FileSearch
} from 'lucide-react';
import { strataGet, strataPost } from '../strataApi';
import type { Report } from '../strataTypes';
import { useUser } from '../../../context/UserContext';
import { useStrataNav } from '../StrataNavContext';

type ReportTab = 'reports' | 'scheduled' | 'metrics' | 'surveys' | 'custom-query' | 'rollups' | 'intake';
type RollupView = 'insurance' | 'vendor-compliance' | 'vendor-by-property';

const TABS: { id: ReportTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'rollups', label: 'Rollups', icon: BarChart3 },
    { id: 'intake', label: 'Intake Queue', icon: Inbox },
    { id: 'scheduled', label: 'Scheduled Reports', icon: Clock },
    { id: 'metrics', label: 'Metrics', icon: PieChart },
    { id: 'custom-query', label: 'Custom Query', icon: BarChart3 },
    { id: 'surveys', label: 'Surveys', icon: Clipboard },
];

function exportToCsv(headers: string[], rows: string[][], filename: string) {
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

const STATUS_BADGE = (status: string) => {
    const colors: Record<string, { bg: string; fg: string }> = {
        active: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' },
        valid: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' },
        expiring: { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b' },
        expired: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444' },
        missing: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444' },
    };
    const c = colors[status] || colors.active;
    return (
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: c.bg, color: c.fg, textTransform: 'uppercase' }}>
            {status}
        </span>
    );
};

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
    const { navigateToProperty } = useStrataNav();
    const [tab, setTab] = useState<ReportTab>('reports');
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [queryField, setQueryField] = useState('coi');
    const [queryResults, setQueryResults] = useState<any[]>([]);
    const [queryLoading, setQueryLoading] = useState(false);

    // Phase 9: Rollup state
    const [rollupView, setRollupView] = useState<RollupView>('insurance');
    const [insuranceRollup, setInsuranceRollup] = useState<any[]>([]);
    const [vendorCompliance, setVendorCompliance] = useState<any[]>([]);
    const [vendorByProperty, setVendorByProperty] = useState<any[]>([]);
    const [rollupLoading, setRollupLoading] = useState(false);

    // Phase 10: Intake Queue state
    const [intakeItems, setIntakeItems] = useState<any[]>([]);
    const [intakeLoading, setIntakeLoading] = useState(false);
    const [intakePendingCount, setIntakePendingCount] = useState(0);

    const TAB_PERMS: Record<ReportTab, string> = {
        reports: 'strata:reporting:reports',
        scheduled: 'strata:reporting:scheduled',
        metrics: 'strata:reporting:metrics',
        'custom-query': 'strata:reporting:reports',
        surveys: 'strata:reporting:surveys',
        rollups: 'strata:reporting:reports',
        intake: 'strata:reporting:reports',
    };
    const visibleTabs = TABS.filter(t => hasPermission(TAB_PERMS[t.id]));

    // Phase 9: Fetch rollup data
    const fetchRollup = useCallback(async (view: RollupView) => {
        setRollupLoading(true);
        try {
            if (view === 'insurance') {
                const data = await strataGet<any>('/reporting/insurance-rollup');
                setInsuranceRollup(data.policies || []);
            } else if (view === 'vendor-compliance') {
                const data = await strataGet<any>('/reporting/vendor-compliance-rollup');
                setVendorCompliance(data.vendors || []);
            } else {
                const data = await strataGet<any>('/reporting/vendor-by-property');
                setVendorByProperty(data.properties || []);
            }
        } catch (e) { console.error(e); }
        setRollupLoading(false);
    }, []);

    useEffect(() => {
        if (tab === 'rollups') fetchRollup(rollupView);
    }, [tab, rollupView, fetchRollup]);

    // Phase 10: Fetch intake queue
    const fetchIntake = useCallback(async () => {
        setIntakeLoading(true);
        try {
            const data = await strataGet<any>('/intake/queue', { status: 'pending' });
            setIntakeItems(data.items || []);
        } catch (e) { console.error(e); }
        setIntakeLoading(false);
    }, []);

    const fetchIntakeStats = useCallback(async () => {
        try {
            const stats = await strataGet<any>('/intake/stats');
            setIntakePendingCount(stats.pending || 0);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchIntakeStats();
    }, [fetchIntakeStats]);

    useEffect(() => {
        if (tab === 'intake') fetchIntake();
    }, [tab, fetchIntake]);

    const handleIntakeAction = async (id: string, action: 'approve' | 'dismiss') => {
        try {
            await strataPost(`/intake/${id}/${action}`, action === 'dismiss' ? { reason: 'Not relevant' } : {});
            setIntakeItems(prev => prev.filter(i => i.id !== id));
            setIntakePendingCount(prev => Math.max(0, prev - 1));
        } catch (e) { console.error(e); }
    };

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
                            {t.id === 'intake' && intakePendingCount > 0 && (
                                <span style={{
                                    background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
                                    borderRadius: 8, padding: '1px 6px', marginLeft: 2, lineHeight: '14px',
                                }}>{intakePendingCount}</span>
                            )}
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

            {/* Phase 9: Rollups Tab */}
            {tab === 'rollups' && (
                <>
                    {/* Rollup Sub-Nav */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                        {[
                            { id: 'insurance' as RollupView, label: 'Insurance Rollup', icon: <Shield size={13} /> },
                            { id: 'vendor-compliance' as RollupView, label: 'Vendor Compliance', icon: <AlertTriangle size={13} /> },
                            { id: 'vendor-by-property' as RollupView, label: 'Vendors by Property', icon: <Building2 size={13} /> },
                        ].map(rv => (
                            <button key={rv.id} onClick={() => setRollupView(rv.id)} style={{
                                padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                background: rollupView === rv.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                color: rollupView === rv.id ? '#818cf8' : '#94a3b8',
                                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                            }}>
                                {rv.icon} {rv.label}
                            </button>
                        ))}
                    </div>

                    {rollupLoading && <div className="s-loading">Loading rollup data…</div>}

                    {/* Insurance Rollup */}
                    {!rollupLoading && rollupView === 'insurance' && (
                        <div className="s-glass-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Shield size={14} style={{ color: '#22c55e' }} /> Insurance Policies — All Properties
                                </h3>
                                <button onClick={() => exportToCsv(
                                    ['Property', 'Carrier', 'Policy #', 'Type', 'Coverage', 'Premium', 'Effective', 'Expiry', 'Status'],
                                    insuranceRollup.map((p: any) => [p.propertyName, p.carrier, p.policyNumber, p.policyType, p.coverageAmount || '', p.premiumAnnual || '', p.effectiveDate, p.expirationDate, p.statusLabel]),
                                    'insurance-rollup.csv'
                                )} style={{
                                    padding: '5px 12px', border: 'none', borderRadius: 6, background: 'rgba(99,102,241,0.12)',
                                    color: '#a5b4fc', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                    <Download size={12} /> Export CSV
                                </button>
                            </div>
                            {insuranceRollup.length === 0 ? (
                                <p style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 30 }}>No insurance policies found across any property.</p>
                            ) : (
                                <div style={{ overflow: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                {['Property', 'Carrier', 'Policy #', 'Type', 'Coverage', 'Premium', 'Effective', 'Expiry', 'Status'].map(h => (
                                                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: '#94a3b8', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {insuranceRollup.map((p: any) => (
                                                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <td style={{ padding: '8px 10px', color: '#e2e8f0', fontWeight: 500 }}>
                                                        {p.propertyId ? (
                                                            <button className="s-property-link" style={{ fontSize: 12, fontWeight: 500 }} onClick={() => navigateToProperty(p.propertyId)}>{p.propertyName}</button>
                                                        ) : p.propertyName}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', color: '#cbd5e1' }}>{p.carrier || '—'}</td>
                                                    <td style={{ padding: '8px 10px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>{p.policyNumber || '—'}</td>
                                                    <td style={{ padding: '8px 10px', color: '#cbd5e1' }}>{p.policyType}</td>
                                                    <td style={{ padding: '8px 10px', color: '#cbd5e1' }}>{p.coverageAmount ? `$${Number(p.coverageAmount).toLocaleString()}` : '—'}</td>
                                                    <td style={{ padding: '8px 10px', color: '#cbd5e1' }}>{p.premiumAnnual ? `$${Number(p.premiumAnnual).toLocaleString()}` : '—'}</td>
                                                    <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: 11 }}>{p.effectiveDate || '—'}</td>
                                                    <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: 11 }}>{p.expirationDate || '—'}</td>
                                                    <td style={{ padding: '8px 10px' }}>{STATUS_BADGE(p.statusLabel)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <div style={{ marginTop: 8, fontSize: 11, color: '#475569', textAlign: 'right' }}>{insuranceRollup.length} policies</div>
                        </div>
                    )}

                    {/* Vendor Compliance Rollup */}
                    {!rollupLoading && rollupView === 'vendor-compliance' && (
                        <div className="s-glass-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertTriangle size={14} style={{ color: '#f59e0b' }} /> Vendor Compliance — COI & W-9
                                </h3>
                                <button onClick={() => exportToCsv(
                                    ['Vendor', 'Email', 'COI Status', 'COI Expiry', 'W-9 Status', 'W-9 Expiry', 'Properties Served', 'Missing Docs'],
                                    vendorCompliance.map((v: any) => [v.name, v.email, v.coiStatus, v.coiExpiry || '', v.w9Status, v.w9Expiry || '', (v.propertiesServed || []).join('; '), v.missingDocs]),
                                    'vendor-compliance-rollup.csv'
                                )} style={{
                                    padding: '5px 12px', border: 'none', borderRadius: 6, background: 'rgba(99,102,241,0.12)',
                                    color: '#a5b4fc', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                    <Download size={12} /> Export CSV
                                </button>
                            </div>
                            {vendorCompliance.length === 0 ? (
                                <p style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 30 }}>No vendors found.</p>
                            ) : (
                                <div style={{ overflow: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                {['Vendor', 'COI', 'COI Expiry', 'W-9', 'W-9 Expiry', 'Properties', 'Gaps'].map(h => (
                                                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: '#94a3b8', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {vendorCompliance.map((v: any) => (
                                                <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: v.missingDocs > 0 ? 'rgba(239,68,68,0.03)' : 'transparent' }}>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <div style={{ color: '#e2e8f0', fontWeight: 500, fontSize: 13 }}>{v.name}</div>
                                                        <div style={{ fontSize: 10, color: '#64748b' }}>{v.email}</div>
                                                    </td>
                                                    <td style={{ padding: '8px 10px' }}>{STATUS_BADGE(v.coiStatus)}</td>
                                                    <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: 11 }}>{v.coiExpiry || '—'}</td>
                                                    <td style={{ padding: '8px 10px' }}>{STATUS_BADGE(v.w9Status)}</td>
                                                    <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: 11 }}>{v.w9Expiry || '—'}</td>
                                                    <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{(v.propertiesServed || []).join(', ') || '—'}</td>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        {v.missingDocs > 0 ? (
                                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                <XCircle size={12} /> {v.missingDocs}
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                <CheckCircle2 size={12} /> 0
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <div style={{ marginTop: 8, fontSize: 11, color: '#475569', textAlign: 'right' }}>
                                {vendorCompliance.length} vendors · {vendorCompliance.filter((v: any) => v.missingDocs > 0).length} with gaps
                            </div>
                        </div>
                    )}

                    {/* Vendors by Property */}
                    {!rollupLoading && rollupView === 'vendor-by-property' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {vendorByProperty.length === 0 ? (
                                <div className="s-glass-card" style={{ textAlign: 'center', padding: 30 }}>
                                    <Truck size={32} strokeWidth={1} style={{ color: '#475569', marginBottom: 8 }} />
                                    <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>No vendor-property associations found.</p>
                                </div>
                            ) : (
                                vendorByProperty.map((prop: any) => (
                                    <div key={prop.propertyId} className="s-glass-card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <div>
                                                <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <Building2 size={14} style={{ color: '#3b82f6' }} />
                                                    {prop.propertyId ? (
                                                        <button className="s-property-link" style={{ fontSize: 14, fontWeight: 600 }} onClick={() => navigateToProperty(prop.propertyId)}>{prop.propertyName}</button>
                                                    ) : prop.propertyName}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#64748b' }}>{prop.propertyAddress}</div>
                                            </div>
                                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', fontWeight: 600 }}>
                                                {prop.vendors.length} vendor{prop.vendors.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {prop.vendors.map((v: any, i: number) => (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                                                    background: 'rgba(255,255,255,0.02)', borderRadius: 6,
                                                    border: '1px solid rgba(255,255,255,0.04)',
                                                }}>
                                                    <Truck size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{v.vendorName}</div>
                                                        <div style={{ fontSize: 10, color: '#64748b' }}>
                                                            {v.serviceType && <span>{v.serviceType} · </span>}
                                                            {v.accountNumber && <span>Acct: {v.accountNumber} · </span>}
                                                            {STATUS_BADGE(v.status || 'active')}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                            <button onClick={() => exportToCsv(
                                ['Property', 'Vendor', 'Service Type', 'Account #', 'Status'],
                                vendorByProperty.flatMap((p: any) => p.vendors.map((v: any) => [p.propertyName, v.vendorName, v.serviceType || '', v.accountNumber || '', v.status || 'active'])),
                                'vendor-by-property.csv'
                            )} style={{
                                padding: '8px 16px', border: 'none', borderRadius: 6, background: 'rgba(99,102,241,0.12)',
                                color: '#a5b4fc', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-end',
                            }}>
                                <Download size={13} /> Export All Associations CSV
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Intake Queue Tab (Phase 10) */}
            {tab === 'intake' && (
                <div className="s-glass-card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: 15, color: '#e2e8f0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FileSearch size={16} style={{ color: '#818cf8' }} />
                            AI Document Intake — Pending Review
                        </h3>
                        <button onClick={fetchIntake} style={{
                            padding: '6px 12px', border: 'none', borderRadius: 6, background: 'rgba(99,102,241,0.12)',
                            color: '#a5b4fc', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            <RefreshCw size={12} /> Refresh
                        </button>
                    </div>
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
                        Documents classified by AI from uploaded files. Review each suggestion and approve to apply, or dismiss.
                        <strong> All actions require human approval</strong> (B.L.A.S.T. Rule 1).
                    </p>

                    {intakeLoading && <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Loading intake queue…</div>}

                    {!intakeLoading && intakeItems.length === 0 && (
                        <div style={{
                            textAlign: 'center', padding: 50, color: '#475569',
                            background: 'rgba(255,255,255,0.02)', borderRadius: 8,
                            border: '1px dashed rgba(255,255,255,0.06)',
                        }}>
                            <Inbox size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                            <div style={{ fontSize: 13, fontWeight: 500 }}>No pending intake items</div>
                            <div style={{ fontSize: 11, marginTop: 4 }}>Upload vendor/compliance documents to see AI suggestions here</div>
                        </div>
                    )}

                    {!intakeLoading && intakeItems.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {intakeItems.map((item: any) => {
                                const confPct = Math.round((item.confidence || 0) * 100);
                                const confColor = confPct >= 70 ? '#22c55e' : confPct >= 40 ? '#f59e0b' : '#ef4444';
                                return (
                                    <div key={item.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                        background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.15s',
                                    }}>
                                        <div style={{
                                            width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: 'rgba(99,102,241,0.12)', flexShrink: 0,
                                        }}>
                                            <FileText size={18} style={{ color: '#818cf8' }} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.filename}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                                Detected: <strong style={{ color: '#c4b5fd' }}>{item.doc_label}</strong>
                                                <span style={{ margin: '0 6px', opacity: 0.3 }}>|</span>
                                                Confidence: <span style={{ color: confColor, fontWeight: 600 }}>{confPct}%</span>
                                            </div>
                                            {item.suggested_entity_name && (
                                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                                    → Suggested: <strong style={{ color: '#a5b4fc' }}>{item.suggested_entity_name}</strong>
                                                    <span style={{ opacity: 0.5 }}> ({item.suggested_entity_type})</span>
                                                </div>
                                            )}
                                            <div style={{ fontSize: 10, color: '#475569', marginTop: 3, fontStyle: 'italic' }}>
                                                {item.suggested_action}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <button
                                                onClick={() => handleIntakeAction(item.id, 'approve')}
                                                title="Approve suggestion"
                                                style={{
                                                    padding: '6px 12px', border: 'none', borderRadius: 6,
                                                    background: 'rgba(34,197,94,0.15)', color: '#4ade80',
                                                    cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                }}
                                            >
                                                <ThumbsUp size={12} /> Approve
                                            </button>
                                            <button
                                                onClick={() => handleIntakeAction(item.id, 'dismiss')}
                                                title="Dismiss suggestion"
                                                style={{
                                                    padding: '6px 12px', border: 'none', borderRadius: 6,
                                                    background: 'rgba(239,68,68,0.1)', color: '#f87171',
                                                    cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                }}
                                            >
                                                <ThumbsDown size={12} /> Dismiss
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
