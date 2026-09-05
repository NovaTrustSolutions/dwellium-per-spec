/**
 * ManagerHome — Strata home screen with operational widgets
 * Move-Ins/Move-Outs, Outstanding Work Orders, Lease Expirations,
 * Tasks Targeted to Me, AP Calendar, Portfolio Occupancy
 *
 * Every widget here reads real data from the existing backend calls
 * (strataGet('/stats'), '/units', '/properties', '/occupancies', '/invoices')
 * and shows an honest empty state when a source is empty or unavailable —
 * no placeholder people/properties/dollar figures.
 */
import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../../config';
import { strataGet } from '../strataApi';
import {
    ArrowRightLeft, Wrench, Calendar, ClipboardList,
    CreditCard, TrendingUp, AlertTriangle, CheckCircle
} from 'lucide-react';

const API = `${API_BASE}/api`;
const DAY_MS = 86400000;

/** Backend routes disagree on returning a bare array vs { data: [] } —
 * accept both (same fix as StrataDashboard.tsx's calendar/properties/comms reads). */
function asArray<T>(v: T[] | { data: T[] } | null | undefined): T[] {
    if (Array.isArray(v)) return v;
    if (v && Array.isArray((v as { data: T[] }).data)) return (v as { data: T[] }).data;
    return [];
}

const daysUntil = (iso: string): number => Math.floor((new Date(iso).getTime() - Date.now()) / DAY_MS);
const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtMoney = (n: number): string => `$${Number(n || 0).toLocaleString()}`;

interface WorkOrder { id: string; title: string; status: string; priority: string; }
interface TaskItem { id: string; title: string; status: string; dueDate: string | null; }
interface MoveEvent { type: 'Move-In' | 'Move-Out'; unit: string; property: string; date: string; }
interface LeaseExpiry { unit: string; property: string; expiresAt: string; daysLeft: number; }
interface Payable { date: string; vendor: string; amount: string; status: string; }
interface PropertyOccupancy { property: string; totalUnits: number; occupiedUnits: number; occupancyRate: number; }

// Loose real-shape rows — only the fields this screen actually reads.
interface UnitRow { id: string; propertyId: string; unitNumber: string; leaseEnd: string | null; }
interface PropertyRow { id: string; name: string; }
interface OccupancyRow { unitId: string | null; moveInDate: string | null; moveOutDate: string | null; }
interface InvoiceRow { type: string; vendorOrTenant: string; amount: number; dueDate: string; status: string; }
interface StatsByPropertyRow { name: string; totalUnits: number; occupiedUnits: number; occupancyRate: number; }

function deriveLeaseExpirations(units: UnitRow[], propName: (id: string) => string): LeaseExpiry[] {
    return units
        .filter(u => u.leaseEnd && daysUntil(u.leaseEnd) >= 0 && daysUntil(u.leaseEnd) <= 60)
        .map(u => ({ unit: `Unit ${u.unitNumber}`, property: propName(u.propertyId), expiresAt: u.leaseEnd as string, daysLeft: daysUntil(u.leaseEnd as string) }))
        .sort((a, b) => a.daysLeft - b.daysLeft);
}

function deriveMoveEvents(occupancies: OccupancyRow[], unitById: Map<string, UnitRow>, propName: (id: string) => string): MoveEvent[] {
    const events: MoveEvent[] = [];
    for (const o of occupancies) {
        const unit = o.unitId ? unitById.get(o.unitId) : undefined;
        const label = unit ? `Unit ${unit.unitNumber}` : 'Unit —';
        const property = unit ? propName(unit.propertyId) : '—';
        if (o.moveInDate && daysUntil(o.moveInDate) >= 0 && daysUntil(o.moveInDate) <= 30) {
            events.push({ type: 'Move-In', unit: label, property, date: fmtDate(o.moveInDate) });
        }
        if (o.moveOutDate && daysUntil(o.moveOutDate) >= 0 && daysUntil(o.moveOutDate) <= 30) {
            events.push({ type: 'Move-Out', unit: label, property, date: fmtDate(o.moveOutDate) });
        }
    }
    return events;
}

function derivePayables(invoices: InvoiceRow[]): Payable[] {
    return invoices
        .filter(i => i.type === 'payable' && i.dueDate)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 6)
        .map(i => ({ date: fmtDate(i.dueDate), vendor: i.vendorOrTenant, amount: fmtMoney(i.amount), status: i.status }));
}

function derivePortfolio(byProperty: StatsByPropertyRow[]): PropertyOccupancy[] {
    return byProperty.map(p => ({ property: p.name, totalUnits: p.totalUnits, occupiedUnits: p.occupiedUnits, occupancyRate: p.occupancyRate }));
}

/** Parse the two shapes ManagerHome's legacy endpoints return: a bare array, or { items|tasks: [...] }. */
async function parseJsonList(res: Response, key: string): Promise<any[]> {
    const data = await res.json();
    return (data[key] || data || []).slice(0, 6);
}

export default function ManagerHome() {
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [moveEvents, setMoveEvents] = useState<MoveEvent[]>([]);
    const [leases, setLeases] = useState<LeaseExpiry[]>([]);
    const [payables, setPayables] = useState<Payable[]>([]);
    const [portfolio, setPortfolio] = useState<PropertyOccupancy[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const [woRes, taskRes, statsRes, unitsRes, propsRes, occRes, invRes] = await Promise.allSettled([
            fetch(`${API}/dwellium/workitems?type=work_order&status=open&limit=10`),
            fetch(`${API}/tasks?limit=10`),
            strataGet<{ byProperty?: StatsByPropertyRow[] }>('/stats'),
            strataGet<UnitRow[] | { data: UnitRow[] }>('/units'),
            strataGet<PropertyRow[] | { data: PropertyRow[] }>('/properties'),
            strataGet<OccupancyRow[] | { data: OccupancyRow[] }>('/occupancies'),
            strataGet<InvoiceRow[] | { data: InvoiceRow[] }>('/invoices'),
        ]);

        if (woRes.status === 'fulfilled' && woRes.value.ok) setWorkOrders(await parseJsonList(woRes.value, 'items'));
        if (taskRes.status === 'fulfilled' && taskRes.value.ok) setTasks(await parseJsonList(taskRes.value, 'tasks'));

        const properties = propsRes.status === 'fulfilled' ? asArray(propsRes.value) : [];
        const propName = (id: string) => properties.find(p => p.id === id)?.name || id;
        const units = unitsRes.status === 'fulfilled' ? asArray(unitsRes.value) : [];
        const unitById = new Map(units.map(u => [u.id, u]));

        if (statsRes.status === 'fulfilled') setPortfolio(derivePortfolio(statsRes.value?.byProperty || []));
        setLeases(deriveLeaseExpirations(units, propName));
        setMoveEvents(occRes.status === 'fulfilled' ? deriveMoveEvents(asArray(occRes.value), unitById, propName) : []);
        setPayables(invRes.status === 'fulfilled' ? derivePayables(asArray(invRes.value)) : []);

        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const cardStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.02)', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
    };
    const headerStyle: React.CSSProperties = {
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: 'var(--text-primary)',
    };
    const rowStyle: React.CSSProperties = {
        padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13,
    };
    const emptyStyle: React.CSSProperties = { padding: '18px 16px', fontSize: 12, color: 'var(--text-tertiary)' };

    return (
        <div className="strata-module" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* ── Move-Ins / Move-Outs ── */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <ArrowRightLeft size={16} color="#6366f1" /> Move-Ins / Move-Outs (30 Days)
                </div>
                {moveEvents.length === 0 ? (
                    <div style={emptyStyle}>No move-ins in the next 30 days</div>
                ) : moveEvents.map((m, i) => (
                    <div key={i} style={rowStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                                fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                                background: m.type === 'Move-In' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                                color: m.type === 'Move-In' ? '#22c55e' : '#ef4444',
                            }}>{m.type}</span>
                            <span style={{ color: 'var(--text-primary)' }}>{m.unit}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, color: 'var(--text-tertiary)', fontSize: 12 }}>
                            <span>{m.property}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{m.date}</span>
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
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        <CheckCircle size={20} style={{ marginBottom: 6 }} /><br />All clear!
                    </div>
                ) : workOrders.map(wo => (
                    <div key={wo.id} style={rowStyle}>
                        <span style={{ color: 'var(--text-primary)' }}>{wo.title}</span>
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
                {leases.length === 0 ? (
                    <div style={emptyStyle}>No leases expiring in the next 60 days</div>
                ) : leases.map((l, i) => (
                    <div key={i} style={rowStyle}>
                        <div>
                            <div style={{ color: 'var(--text-primary)' }}>{l.unit}</div>
                            <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{l.property}</div>
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
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{tasks.length}</span>
                </div>
                {tasks.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        <CheckCircle size={20} style={{ marginBottom: 6 }} /><br />No pending tasks
                    </div>
                ) : tasks.map(t => (
                    <div key={t.id} style={rowStyle}>
                        <span style={{ color: 'var(--text-primary)' }}>{t.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</span>
                    </div>
                ))}
            </div>

            {/* ── AP Calendar ── */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <CreditCard size={16} color="#0ea5e9" /> AP Calendar
                </div>
                {payables.length === 0 ? (
                    <div style={emptyStyle}>No payables due</div>
                ) : payables.map((ap, i) => (
                    <div key={i} style={rowStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: 12, minWidth: 50 }}>{ap.date}</span>
                            <span style={{ color: 'var(--text-primary)' }}>{ap.vendor}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{ap.amount}</span>
                            <span style={{
                                fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                                background: ap.status === 'due' || ap.status === 'overdue' ? 'rgba(239,68,68,0.12)' : ap.status === 'pending' ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                                color: ap.status === 'due' || ap.status === 'overdue' ? '#ef4444' : ap.status === 'pending' ? '#f59e0b' : '#64748b',
                            }}>{ap.status}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Portfolio Occupancy ── */}
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <TrendingUp size={16} color="#22c55e" /> Portfolio Occupancy
                </div>
                {portfolio.length === 0 ? (
                    <div style={emptyStyle}>No properties imported yet</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['Property', 'Units', 'Occupied', 'Rate'].map(h => (
                                    <th key={h} style={{ padding: '6px 16px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {portfolio.map((p, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '8px 16px', color: 'var(--text-primary)' }}>{p.property}</td>
                                    <td style={{ padding: '8px 16px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{p.totalUnits}</td>
                                    <td style={{ padding: '8px 16px', color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.occupiedUnits}</td>
                                    <td style={{ padding: '8px 16px' }}>
                                        <span style={{ color: p.occupancyRate >= 95 ? '#22c55e' : p.occupancyRate >= 90 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                                            {p.occupancyRate}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
