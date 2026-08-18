/** Axis-tick truncation for Recharts category labels (plan 045 F/Occupancy chart).
 *  Full text stays available in the tooltip; only the tick is shortened. */
export function truncateLabel(label: unknown, max = 18): string {
    const s = String(label ?? '');
    return s.length > max ? `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…` : s;
}
