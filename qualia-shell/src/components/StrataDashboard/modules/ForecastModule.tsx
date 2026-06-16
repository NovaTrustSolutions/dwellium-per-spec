import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, DollarSign, Building, AlertCircle, RefreshCw } from 'lucide-react';
import { strataGet } from '../strataApi';
import type { ForecastResult } from '@qualia/types';
import { useStrataNav } from '../StrataNavContext';
// Task 2.4 — GR-13 observability wiring + ErrorBoundary, mirrors the
// 2.1 / 2.2 / 2.10 retrofit pattern. Sentry breadcrumbs are
// try/catch-wrapped so missing DSN is silent in test/local builds.
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';

const fmt = (n: number) => `$${n.toLocaleString()}`;
const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;

function ForecastModuleInner() {
    const { navigateToProperty } = useStrataNav();
    const [forecast, setForecast] = useState<ForecastResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
    const [selectedProperty, setSelectedProperty] = useState('');
    const [months, setMonths] = useState(12);
    const [occupancy, setOccupancy] = useState(85);
    const [useOccupancyOverride, setUseOccupancyOverride] = useState(false);
    const [rentChange, setRentChange] = useState(0);

    useEffect(() => {
        // Route the property picker through strataApi (static/backend both work).
        strataGet<any>('/properties', { limit: '50' })
            .then((d: any) => {
                const rows = Array.isArray(d) ? d : (d?.data ?? []);
                setProperties(rows.map((p: any) => ({ id: p.id, name: p.name })));
            })
            .catch(() => { });
        runForecast();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runForecast = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Task 2.4 — rewired off raw localhost:3000/api/forecast to
            // strataGet so static mode is functional. Mirrors the Task 2.7
            // AuditModule rewire precedent (was hitting localhost directly,
            // bypassing the strataApi.ts router; same fix here).
            const params: Record<string, string> = {
                months: String(months),
                rentChange: String(rentChange),
            };
            if (selectedProperty) params.propertyId = selectedProperty;
            if (useOccupancyOverride) params.occupancy = String(occupancy);
            const data = await strataGet<ForecastResult>('/forecast', params);
            setForecast(data);
            // Task 2.4 — GR-13 breadcrumb on successful run.
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.run',
                    message: 'forecast.run',
                    level: 'info',
                    data: {
                        propertyId: selectedProperty || null,
                        months,
                        rentChange,
                        occupancyOverride: useOccupancyOverride ? occupancy : null,
                        totalRevenue: data?.summary?.totalRevenue ?? 0,
                    },
                });
            } catch { /* Sentry no-op when DSN unset */ }
        } catch (e: any) {
            setError(e?.message || 'Failed to load forecast');
        } finally {
            setLoading(false);
        }
    }, [months, rentChange, selectedProperty, occupancy, useOccupancyOverride]);

    // Task 2.4 — GR-13 breadcrumb on initial module load.
    useEffect(() => {
        try {
            Sentry.addBreadcrumb({
                category: 'ui.load',
                message: 'forecast.module.loaded',
                level: 'info',
                data: { propertyCount: properties.length },
            });
        } catch { /* Sentry no-op when DSN unset */ }
    }, [properties.length]);

    const netColor = (n: number) => n >= 0 ? '#22c55e' : '#ef4444';

    return (
        <div className="forecast-module" data-testid="forecast-module" style={{ padding: '20px', fontFamily: 'Inter, sans-serif', color: 'var(--text-primary)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, color: 'var(--text-primary)', fontWeight: 700 }}>
                        Cash Flow Forecast
                    </h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                        12-month rolling projection with scenario modeling
                    </p>
                </div>
                <button
                    onClick={runForecast}
                    disabled={loading}
                    data-testid="forecast-run-button"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                    <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    {loading ? 'Running...' : 'Run Forecast'}
                </button>
            </div>

            {/* Controls */}
            <div style={{ background: '#1e2537', borderRadius: 12, padding: 16, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Property</label>
                    <select
                        value={selectedProperty}
                        onChange={e => setSelectedProperty(e.target.value)}
                        data-testid="forecast-property-select"
                        style={{ width: '100%', padding: '8px 10px', background: '#0f1624', border: '1px solid #334155', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13 }}
                    >
                        <option value="">All Properties</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Months: {months}</label>
                    <input type="range" min="3" max="36" value={months} onChange={e => setMonths(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#D6FE51' }} />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        <input type="checkbox" checked={useOccupancyOverride} onChange={e => setUseOccupancyOverride(e.target.checked)} style={{ marginRight: 6 }} />
                        Override Occupancy: {occupancy}%
                    </label>
                    <input type="range" min="40" max="100" value={occupancy} onChange={e => setOccupancy(Number(e.target.value))}
                        disabled={!useOccupancyOverride} style={{ width: '100%', accentColor: '#D6FE51' }} />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        Rent Change: {rentChange > 0 ? `+${rentChange}` : rentChange}%
                    </label>
                    <input type="range" min="-10" max="20" value={rentChange} onChange={e => setRentChange(Number(e.target.value))}
                        style={{ width: '100%', accentColor: rentChange >= 0 ? '#22c55e' : '#ef4444' }} />
                </div>
            </div>

            {error && (
                <div style={{ background: '#450a0a', border: '1px solid #ef4444', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444' }}>
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {forecast && (
                <>
                    {/* Summary Cards */}
                    <div data-testid="forecast-summary-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                        {[
                            { id: 'revenue', testid: 'forecast-summary-revenue', icon: <DollarSign size={16} />, label: 'Projected Revenue', value: fmt(forecast.summary.totalRevenue), color: '#22c55e' },
                            { id: 'expenses', testid: 'forecast-summary-expenses', icon: <DollarSign size={16} />, label: 'Projected Expenses', value: fmt(forecast.summary.totalExpenses), color: '#f97316' },
                            { id: 'net', testid: 'forecast-summary-net', icon: <TrendingUp size={16} />, label: 'Net Cash Flow', value: fmt(forecast.summary.totalNet), color: netColor(forecast.summary.totalNet) },
                            { id: 'occupancy', testid: 'forecast-summary-occupancy', icon: <Building size={16} />, label: 'Avg Occupancy', value: `${forecast.summary.avgOccupancy}%`, color: 'var(--accent)' },
                        ].map(card => (
                            <div key={card.id} data-testid={card.testid} style={{ background: '#1e2537', borderRadius: 10, padding: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6 }}>
                                    {card.icon} {card.label}
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{card.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Break-even note */}
                    <div style={{ background: '#1e2537', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                        Break-even occupancy: <strong style={{ color: 'var(--text-primary)' }}>{forecast.summary.breakEvenOccupancy}%</strong> &nbsp;·&nbsp;
                        Expense rate: <strong style={{ color: 'var(--text-primary)' }}>{forecast.assumptions.baseMonthlyExpenseRate}%</strong> of revenue &nbsp;·&nbsp;
                        Rent adjustment: <strong style={{ color: rentChange !== 0 ? '#f97316' : '#f1f5f9' }}>{rentChange > 0 ? '+' : ''}{rentChange}%</strong>
                    </div>

                    {/* Bar Chart */}
                    <div style={{ background: '#1e2537', borderRadius: 12, padding: 20 }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>Monthly Projection — {forecast.propertyId ? (
                            <button className="s-property-link" style={{ fontSize: 14, fontWeight: 600 }} onClick={() => navigateToProperty(forecast.propertyId!)}>{forecast.propertyName}</button>
                        ) : forecast.propertyName}</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={forecast.months} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                                <Tooltip
                                    formatter={((val: number | undefined, name: string | undefined) => [fmt(val ?? 0), name ?? '']) as any}
                                    contentStyle={{ background: '#0f1624', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                                <Bar dataKey="projectedRevenue" fill="#6366f1" name="Revenue" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="projectedExpenses" fill="#f97316" name="Expenses" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="netCashFlow" fill="#22c55e" name="Net" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Monthly Table */}
                    <div style={{ background: '#1e2537', borderRadius: 12, padding: 20, marginTop: 16, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                                    {['Month', 'Revenue', 'Expenses', 'Net', 'Occupancy'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', borderBottom: '1px solid #334155' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {forecast.months.map(m => (
                                    <tr key={m.month} data-testid="forecast-monthly-row" style={{ borderBottom: '1px solid #1a2233' }}>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{m.label}</td>
                                        <td style={{ padding: '10px 12px', color: '#22c55e' }}>{fmt(m.projectedRevenue)}</td>
                                        <td style={{ padding: '10px 12px', color: '#f97316' }}>{fmt(m.projectedExpenses)}</td>
                                        <td style={{ padding: '10px 12px', color: netColor(m.netCashFlow), fontWeight: 600 }}>{fmt(m.netCashFlow)}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--accent)' }}>{m.occupancyRate}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

// Task 2.4 — ErrorBoundary wrap mirrors the 2.1 / 2.2 / 2.10 retrofit
// pattern. Inner module body holds the hooks; this exported wrapper
// owns the boundary so a render fault in any sub-section degrades
// gracefully instead of taking the whole shell down.
export default function ForecastModule() {
    return (
        <ErrorBoundary fallback={<div className="s-glass-card" style={{ padding: 14, color: '#ef4444', fontSize: 12 }}>Forecast module unavailable.</div>}>
            <ForecastModuleInner />
        </ErrorBoundary>
    );
}
