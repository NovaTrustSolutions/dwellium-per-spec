/**
 * PurchaseOrderLinks — Task 1.4
 *
 * Renders a Workitem's `purchaseOrders[]`. DoR WO 19511-1 has no POs
 * yet (empty section visible); this component also handles empty-state.
 *
 * Source of truth: AppFolio_Screenshots/data/08_work_order_detail_19511.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.4.
 */
import { FileSpreadsheet } from 'lucide-react';
import type { PurchaseOrderLink } from '../../strataTypes';

interface Props {
    purchaseOrders: PurchaseOrderLink[];
}

function fmtMoney(n: number | null): string {
    if (n === null || n === undefined) return '—';
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PurchaseOrderLinks({ purchaseOrders }: Props) {
    return (
        <div className="s-glass-card" data-testid="purchase-orders-list" style={{ padding: '12px 14px', marginBottom: 10 }}>
            <h4 style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                <FileSpreadsheet size={12} color="#818cf8" /> Purchase Orders
            </h4>
            {purchaseOrders.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, padding: 8 }}>
                    No purchase orders linked.
                </div>
            ) : (
                <div className="s-table-wrap">
                    <table className="s-table" style={{ fontSize: 11 }}>
                        <thead>
                            <tr>
                                <th>PO #</th>
                                <th>Vendor</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {purchaseOrders.map((p) => (
                                <tr key={p.id} data-testid={`po-row-${p.id}`}>
                                    <td style={{ color: 'var(--s-accent, #6366f1)' }}>{p.poNumber}</td>
                                    <td className="s-td-bold">{p.vendor ?? '—'}</td>
                                    <td>{fmtMoney(p.amount)}</td>
                                    <td><span className="s-badge">{p.status}</span></td>
                                    <td>{p.createdAt ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
