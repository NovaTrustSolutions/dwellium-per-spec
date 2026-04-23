/**
 * ActionsLogList — Task 1.4
 *
 * Renders a Workitem's `actionsLog[]` as a chronological list.
 * Each entry: timestamp, actor (system or user), event, optional detail.
 *
 * Source of truth: AppFolio_Screenshots/data/08_work_order_detail_19511.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.4.
 */
import { Activity, Cpu, User } from 'lucide-react';
import type { ActionLogEntry } from '../../strataTypes';

interface Props {
    entries: ActionLogEntry[];
}

export default function ActionsLogList({ entries }: Props) {
    if (entries.length === 0) {
        return (
            <div
                className="s-glass-card"
                data-testid="actions-log-list"
                style={{ padding: 14, textAlign: 'center', color: '#64748b', fontSize: 12 }}
            >
                No actions recorded yet.
            </div>
        );
    }
    return (
        <div className="s-glass-card" data-testid="actions-log-list" style={{ padding: '12px 14px', marginBottom: 10 }}>
            <h4 style={{ fontSize: 12, color: '#94a3b8', margin: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                <Activity size={12} color="#818cf8" /> Actions Log
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {entries.map((e, i) => (
                    <div
                        key={i}
                        data-testid={`actions-log-entry-${i}`}
                        style={{
                            padding: '8px 10px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                            display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 2, fontSize: 11.5,
                        }}
                    >
                        <span style={{ color: '#818cf8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {e.actor === 'System' ? <Cpu size={11} /> : <User size={11} />}
                            <span style={{ fontWeight: 600 }}>{e.actor}</span>
                        </span>
                        <span style={{ color: '#e2e8f0' }}>{e.event}</span>
                        <span style={{ color: '#64748b', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>{e.ts}</span>
                        {e.detail && (
                            <span style={{ color: '#94a3b8', fontSize: 11 }}>{e.detail}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
