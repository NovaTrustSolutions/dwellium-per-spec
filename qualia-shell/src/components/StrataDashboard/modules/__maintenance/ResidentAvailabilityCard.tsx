/**
 * ResidentAvailabilityCard — Task 1.4
 *
 * Renders a Workitem's `residentAvailability` block — the 3 preferred
 * time windows a resident submitted when opening a service request.
 *
 * Source of truth: AppFolio_Screenshots/data/08_work_order_detail_19511.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.4.
 */
import { Calendar, Clock } from 'lucide-react';
import type { ResidentAvailability } from '../../strataTypes';

interface Props {
    availability: ResidentAvailability;
}

export default function ResidentAvailabilityCard({ availability }: Props) {
    const { date, dayOfWeek, timeWindows, timezone } = availability;
    return (
        <div
            className="s-glass-card"
            data-testid="resident-availability-card"
            style={{ padding: '14px 16px', marginBottom: 10 }}
        >
            <h4 style={{ fontSize: 12, color: '#94a3b8', margin: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                <Calendar size={12} color="#818cf8" /> Resident Availability
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, auto) 1fr', columnGap: 16, rowGap: 6, fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>Preferred Date</span>
                <span style={{ color: '#e2e8f0' }}>
                    {date ?? '—'}{dayOfWeek ? ` (${dayOfWeek})` : ''}
                </span>
                <span style={{ color: '#64748b' }}>Timezone</span>
                <span style={{ color: '#e2e8f0' }}>{timezone ?? '—'}</span>
                <span style={{ color: '#64748b', alignSelf: 'start' }}>Time Windows</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="resident-availability-windows">
                    {timeWindows.length === 0 ? (
                        <span style={{ color: '#64748b' }}>—</span>
                    ) : (
                        timeWindows.map((w, i) => (
                            <span
                                key={i}
                                data-testid={`resident-availability-window-${i}`}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '3px 10px', borderRadius: 10, fontSize: 11,
                                    background: 'rgba(214,254,81,0.12)', border: '1px solid rgba(214,254,81,0.25)',
                                    color: '#c7d2fe', width: 'fit-content',
                                }}
                            >
                                <Clock size={10} /> {w}
                            </span>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
