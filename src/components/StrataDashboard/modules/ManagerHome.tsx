/**
 * ManagerHome — Strata home screen with operational widgets
 * Move-Ins/Move-Outs, Outstanding Work Orders, Lease Expirations,
 * Tasks Targeted to Me, AP Calendar, Portfolio Income
 */
import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../../config';
import {
    ArrowRightLeft, Wrench, Calendar, ClipboardList,
    CreditCard, TrendingUp, RefreshCw, Home, AlertTriangle, CheckCircle
} from 'lucide-react';

const API = `${API_BASE}/api`;

interface WorkOrder { id: string; title: string; status: string; priority: string; }
interface LeaseExpiry { unit: string; property: string; tenant: string; expiresAt: string; daysLeft: number; }
interface TaskItem { id: string; title: string; status: string; dueDate: string | null; }

export default function ManagerHome() {
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [leases, setLeases] = useState<LeaseExpiry[]>([]);
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Move-in / Move-out demo data (calculated from units with lease dates)
    const moveInsOuts = [
        { type: 'Move-In', tenant: 'Sarah Chen', unit: 'Unit 4B', property: 'Richwood', date: 'Feb 18' },
        { type: 'Move-Out', tenant: 'Marcus White', unit: 'Unit 2A', property: 'Woodland Falls', date: 'Feb 22' },
        { type: 'Move-In', tenant: 'Priya Patel', unit: 'Unit C3', property: 'Richwood', date: 'Mar 1' },
        { type: 'Move-Out', tenant: 'James Rivera', unit: 'Unit 12', property: 'City Heights', date: 'Mar 5' },
    ];

    // AP Calendar entries
    const apCalendar = [
        { date: 'Feb 15', vendor: 'Apex Plumbing', amount: '$2,400', status: 'due' },
        { date: 'Feb 20', vendor: 'GreenScape Lawn', amount: '$800', status: 'pending' },
        { date: 'Feb 28', vendor: 'SafeGuard Insurance', amount: '$4,200', status: 'upcoming' },
        { date: 'Mar 1', vendor: 'City Water Utility', amount: '$1,100', status: 'upcoming' },
        { date: 'Mar 5', vendor: 'Midwest Electric', amount: '$3,600', status: 'upcoming' },
    ];

    // Portfolio expected income
    const portfolioIncome = [
        { property: 'Richwood', expected: '$28,400', collected: '$26,100', rate: '91.9%' },
        { property: 'Woodland Falls', expected: '$34,200', collected: '$33,800', rate: '98.8%' },
        { property: 'Metro Lofts', expected: '$42,000', collected: '$38,640', rate: '92.0%' },
        { property: 'Harbor View', expected: '$18,600', collected: '$18,600', rate: '100%' },
    ];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [woRes, taskRes] = await Promise.all([
                fetch(`${API}/dwellium/workitems?type=work_order&status=open&limit=10`),
                fetch(`${API}/tasks?limit=10`),
            ]);
            if (woRes.ok) {
                const data = await woRes.json();
                setWorkOrders((data.items || data || []).slice(0, 6));
            }
            if (taskRes.ok) {
                const data = await taskRes.json();
                setTasks((data.tasks || data || []).slice(0, 6));
            }
        } catch { /* offline */ }

        // Simulated lease expiration data
        setLeases([
            { unit: 'Unit 6', property: 'Richwood', tenant: 'D. Thompson', expiresAt: '2026-02-28', daysLeft: 13 },
            { unit: 'Unit C12', property: 'Woodland Falls', tenant: 'K. Martinez', expiresAt: '2026-03-15', daysLeft: 28 },
            { unit: 'Unit 8A', property: 'Metro Lofts', tenant: 'R. Johnson', expiresAt: '2026-03-20', daysLeft: 33 },
            { unit: 'Unit 3', property: 'Harbor View', tenant: 'L. Park', expiresAt: '2026-04-01', daysLeft: 45 },
        ]);
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const cardStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.02)', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
    };
    const headerStyle: React.CSSProperties = {
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: '#e2e8f0',
    };
    const rowStyle: React.CSSProperties = {
        padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13,
    };

    return (
        <div className="strata-module" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* ── Move-Ins / Move-Outs ── */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <ArrowRightLeft size={16} color="#6366f1" /> Move-Ins / Move-Outs (30 Days)
                </div>
                {moveInsOuts.map((m, i) => (
                    <div key={i} style={rowStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                                fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                                background: m.type === 'Move-In' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                                color: m.type === 'Move-In' ? '#10b981' : '#ef4444',
                            }}>{m.type}</span>
                            <span style={{ color: '#e2e8f0' }}>{m.tenant}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, color: '#64748b', fontSize: 12 }}>
                            <span>{m.unit} · {m.property}</span>
                            <span style={{ color: '#94a3b8' }}>{m.date}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Outstanding Work Orders ── */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <Wrench size={16} color="#f59e0b" /> Outstanding Work Orders
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>{workOrders.length}</span>
                </div>
                {workOrders.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                        <CheckCircle size={20} style={{ marginBottom: 6 }} /><br />All clear!
                    </div>
                ) : workOrders.map(wo => (
                    <div key={wo.id} style={rowStyle}>
                        <span style={{ color: '#e2e8f0' }}>{wo.title}</span>
                        <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                            background: wo.priority === 'critical' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                            color: wo.priority === 'critical' ? '#ef4444' : '#f59e0b',
                        }}>{wo.priority}</span>
                    </div>
                ))}
            </div>

            {/* ── Lease Expirations ── */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <Calendar size={16} color="#ef4444" /> Lease Expirations
                </div>
                {leases.map((l, i) => (
                    <div key={i} style={rowStyle}>
                        <div>
                            <div style={{ color: '#e2e8f0' }}>{l.tenant}</div>
                            <div style={{ color: '#64748b', fontSize: 11 }}>{l.unit} · {l.property}</div>
                        </div>
                        <span style={{
                            fontSize: 12, fontWeight: 600,
                            color: l.daysLeft <= 14 ? '#ef4444' : l.daysLeft <= 30 ? '#f59e0b' : '#94a3b8',
                        }}>
                            {l.daysLeft <= 14 && <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />}
                            {l.daysLeft}d
                        </span>
                    </div>
                ))}
            </div>

            {/* ── Tasks Targeted to Me ── */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <ClipboardList size={16} color="#818cf8" /> My Tasks
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#818cf8', fontWeight: 700 }}>{tasks.length}</span>
                </div>
                {tasks.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                        <CheckCircle size={20} style={{ marginBottom: 6 }} /><br />No pending tasks
                    </div>
                ) : tasks.map(t => (
                    <div key={t.id} style={rowStyle}>
                        <span style={{ color: '#e2e8f0' }}>{t.title}</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</span>
                    </div>
                ))}
            </div>

            {/* ── AP Calendar ── */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <CreditCard size={16} color="#0ea5e9" /> AP Calendar
                </div>
                {apCalendar.map((ap, i) => (
                    <div key={i} style={rowStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 50 }}>{ap.date}</span>
                            <span style={{ color: '#e2e8f0' }}>{ap.vendor}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#e2e8f0', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{ap.amount}</span>
                            <span style={{
                                fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                                background: ap.status === 'due' ? 'rgba(239,68,68,0.12)' : ap.status === 'pending' ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                                color: ap.status === 'due' ? '#ef4444' : ap.status === 'pending' ? '#f59e0b' : '#64748b',
                            }}>{ap.status}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Portfolio Expected Income ── */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <TrendingUp size={16} color="#10b981" /> Portfolio Yearning
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {['Property', 'Expected', 'Collected', 'Rate'].map(h => (
                                <th key={h} style={{ padding: '6px 16px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {portfolioIncome.map((p, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                <td style={{ padding: '8px 16px', color: '#e2e8f0' }}>{p.property}</td>
                                <td style={{ padding: '8px 16px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{p.expected}</td>
                                <td style={{ padding: '8px 16px', color: '#e2e8f0', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.collected}</td>
                                <td style={{ padding: '8px 16px' }}>
                                    <span style={{ color: parseFloat(p.rate) >= 95 ? '#10b981' : parseFloat(p.rate) >= 90 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                                        {p.rate}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
