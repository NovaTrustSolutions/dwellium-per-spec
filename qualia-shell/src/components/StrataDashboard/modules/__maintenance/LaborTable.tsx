/**
 * LaborTable — Task 1.4
 *
 * Renders a Workitem's `laborEntries[]`. DoR WO 19511-1 has no labor
 * yet (empty section visible); this table also handles empty-state.
 *
 * Source of truth: AppFolio_Screenshots/data/08_work_order_detail_19511.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.4.
 */
import { Hammer } from 'lucide-react';
import type { LaborEntry } from '../../strataTypes';

interface Props {
    entries: LaborEntry[];
}

function fmtMoney(n: number | null): string {
    if (n === null || n === undefined) return '—';
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function LaborTable({ entries }: Props) {
    return (
        <div className="s-glass-card" data-testid="labor-table" style={{ padding: '12px 14px', marginBottom: 10 }}>
            <h4 style={{ fontSize: 12, color: '#94a3b8', margin: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                <Hammer size={12} color="#818cf8" /> Labor
            </h4>
            {entries.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: 12, padding: 8 }}>
                    No labor logged.
                </div>
            ) : (
                <div className="s-table-wrap">
                    <table className="s-table" style={{ fontSize: 11 }}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Technician</th>
                                <th>Hours</th>
                                <th>Rate</th>
                                <th>Total</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((e) => (
                                <tr key={e.id} data-testid={`labor-row-${e.id}`}>
                                    <td>{e.date ?? '—'}</td>
                                    <td className="s-td-bold">{e.technician}</td>
                                    <td>{e.hours ?? '—'}</td>
                                    <td>{fmtMoney(e.rate)}</td>
                                    <td>{fmtMoney(e.totalCost)}</td>
                                    <td style={{ color: '#94a3b8' }}>{e.description ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
