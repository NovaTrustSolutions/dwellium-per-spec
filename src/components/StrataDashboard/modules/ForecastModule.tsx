import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, DollarSign, Building, AlertCircle, RefreshCw } from 'lucide-react';
import { strataGet } from '../strataApi';

// Forecast engine lives outside the dwellium CRUD API, so it stays as a raw fetch.
const API = 'http://localhost:3000';

interface MonthlyForecast {
    month: string;
    label: string;
    projectedRevenue: number;
    projectedExpenses: number;
    netCashFlow: number;
    occupancyRate: number;
    occupiedUnits: number;
    totalUnits: number;
}

interface ForecastResult {
    propertyId: string | null;
    propertyName: string;
    months: MonthlyForecast[];
    summary: {
        totalRevenue: number;
        totalExpenses: number;
        totalNet: number;
        avgOccupancy: number;
        breakEvenOccupancy: number;
    };
    assumptions: {
        occupancyRateOverride: number | null;
        rentChangePercent: number;
        baseMonthlyExpenseRate: number;
    };
}

const fmt = (n: number) => `$${n.toLocaleString()}`;
const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;

export default function ForecastModule() {
    const [forecast, setForecast] = useState<ForecastResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
    const [selectedProperty, setSelectedProperty] = useState('');
    const [months, setMonths] = useState(12);
    const [occupancy, setOccupancy] = useState(85);
    const [useOccupancyOverride, setUseOccupancyOverride] = useState(false);
    const [rentChange, setRentChange] = useState(0);

    const token = localStorage.getItem('dwellium_token');
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

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
            const params = new URLSearchParams({
                months: String(months),
                rentChange: String(rentChange),
                ...(selectedProperty && { propertyId: selectedProperty }),
                ...(useOccupancyOverride && { occupancy: String(occupancy) }),
            });
            const res = await fetch(`${API}/api/forecast?${params}`, { headers });
            const data = await res.json();
            if (data.success) setForecast(data.data);
            else setError(data.error || 'Failed to load forecast');
        } catch {
            setError('Could not connect to backend');
        } finally {
            setLoading(false);
        }
    }, [months, rentChange, selectedProperty, occupancy, useOccupancyOverride]);

    const netColor = (n: number) => n >= 0 ? '#22c55e' : '#ef4444';

    return (
        <div className="forecast-module" style={{ padding: '20px', fontFamily: 'Inter, sans-serif', color: '#e2e8f0' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, color: '#f1f5f9', fontWeight: 700 }}>
                        🔮 Cash Flow Forecast
                    </h2>
                    <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
                        12-month rolling projection with scenario modeling
                    </p>
                </div>
                <button
                    onClick={runForecast}
                    disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                    <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    {loading ? 'Running...' : 'Run Forecast'}
                </button>
            </div>

            {/* Controls */}
            <div style={{ background: '#1e2537', borderRadius: 12, padding: 16, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Property</label>
                    <select
                        value={selectedProperty}
                        onChange={e => setSelectedProperty(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', background: '#0f1624', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 13 }}
                    >
                        <option value="">All Properties</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Months: {months}</label>
                    <input type="range" min="3" max="36" value={months} onChange={e => setMonths(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#6366f1' }} />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                        <input type="checkbox" checked={useOccupancyOverride} onChange={e => setUseOccupancyOverride(e.target.checked)} style={{ marginRight: 6 }} />
                        Override Occupancy: {occupancy}%
                    </label>
                    <input type="range" min="40" max="100" value={occupancy} onChange={e => setOccupancy(Number(e.target.value))}
                        disabled={!useOccupancyOverride} style={{ width: '100%', accentColor: '#6366f1' }} />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                        Rent Change: {rentChange > 0 ? `+${rentChange}` : rentChange}%
                    </label>
                    <input type="range" min="-10" max="20" value={rentChange} onChange={e => setRentChange(Number(e.target.value))}
                        style={{ width: '100%', accentColor: rentChange >= 0 ? '#22c55e' : '#ef4444' }} />
                </div>
            </div>

            {error && (
                <div style={{ background: '#450a0a', border: '1px solid #ef4444', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#fca5a5' }}>
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {forecast && (
                <>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                        {[
                            { icon: <DollarSign size={16} />, label: 'Projected Revenue', value: fmt(forecast.summary.totalRevenue), color: '#22c55e' },
                            { icon: <DollarSign size={16} />, label: 'Projected Expenses', value: fmt(forecast.summary.totalExpenses), color: '#f97316' },
                            { icon: <TrendingUp size={16} />, label: 'Net Cash Flow', value: fmt(forecast.summary.totalNet), color: netColor(forecast.summary.totalNet) },
                            { icon: <Building size={16} />, label: 'Avg Occupancy', value: `${forecast.summary.avgOccupancy}%`, color: '#6366f1' },
                        ].map(card => (
                            <div key={card.label} style={{ background: '#1e2537', borderRadius: 10, padding: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>
                                    {card.icon} {card.label}
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{card.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Break-even note */}
                    <div style={{ background: '#1e2537', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#94a3b8' }}>
                        Break-even occupancy: <strong style={{ color: '#f1f5f9' }}>{forecast.summary.breakEvenOccupancy}%</strong> &nbsp;·&nbsp;
                        Expense rate: <strong style={{ color: '#f1f5f9' }}>{forecast.assumptions.baseMonthlyExpenseRate}%</strong> of revenue &nbsp;·&nbsp;
                        Rent adjustment: <strong style={{ color: rentChange !== 0 ? '#f97316' : '#f1f5f9' }}>{rentChange > 0 ? '+' : ''}{rentChange}%</strong>
                    </div>

                    {/* Bar Chart */}
                    <div style={{ background: '#1e2537', borderRadius: 12, padding: 20 }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 14, color: '#f1f5f9', fontWeight: 600 }}>Monthly Projection — {forecast.propertyName}</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={forecast.months} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <Tooltip
                                    formatter={((val: number | undefined, name: string | undefined) => [fmt(val ?? 0), name ?? '']) as any}
                                    contentStyle={{ background: '#0f1624', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
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
                                <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                                    {['Month', 'Revenue', 'Expenses', 'Net', 'Occupancy'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', borderBottom: '1px solid #334155' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {forecast.months.map(m => (
                                    <tr key={m.month} style={{ borderBottom: '1px solid #1a2233' }}>
                                        <td style={{ padding: '10px 12px', color: '#f1f5f9', fontWeight: 500 }}>{m.label}</td>
                                        <td style={{ padding: '10px 12px', color: '#22c55e' }}>{fmt(m.projectedRevenue)}</td>
                                        <td style={{ padding: '10px 12px', color: '#f97316' }}>{fmt(m.projectedExpenses)}</td>
                                        <td style={{ padding: '10px 12px', color: netColor(m.netCashFlow), fontWeight: 600 }}>{fmt(m.netCashFlow)}</td>
                                        <td style={{ padding: '10px 12px', color: '#6366f1' }}>{m.occupancyRate}%</td>
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
