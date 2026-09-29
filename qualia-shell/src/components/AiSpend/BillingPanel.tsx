/**
 * BillingPanel — plan 068 Phase 3 (F1). God-only: reconciles the real
 * provider invoice against this app's own token-based estimate, per month,
 * per provider. Renders nothing for a non-god viewer (the panel never
 * fetches billing data in that case either — see `useBilling`).
 *
 * "Estimated" reads the SAME merged ledger every other AI-spend view reads
 * (`useLlmUsage()`), which already includes server + system devices (plan
 * 068 phase 3 `setExternalDevices`) — so the estimate a god user sees here
 * is the organization's whole estimated spend, not just their own browser.
 */
import { useState } from 'react';
import { useLlmUsage } from '../../lib/llmUsageStore';
import { useBilling, type BillingProviderResult } from '../../lib/serverSpend';
import type { LlmProvider } from '../../types/integrations';
import './BillingPanel.css';

/** Current month first, then the two before it — e.g. ['2026-09', '2026-08', '2026-07']. */
export function lastNMonths(n: number, now: Date = new Date()): string[] {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
}

function monthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return month;
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Sums the merged ledger's per-day `byProvider.estCost` for every day inside `month` ('YYYY-MM'). */
export function estimatedForMonth(
    ledger: ReturnType<typeof useLlmUsage>,
    month: string,
): Partial<Record<LlmProvider, number>> {
    const out: Partial<Record<LlmProvider, number>> = {};
    for (const [date, roll] of Object.entries(ledger.days)) {
        if (!date.startsWith(month)) continue;
        for (const [prov, stat] of Object.entries(roll.byProvider)) {
            const key = prov as LlmProvider;
            out[key] = (out[key] ?? 0) + stat.estCost;
        }
    }
    return out;
}

function statusText(p: BillingProviderResult): string {
    if (p.status === 'no-key') return 'Add an admin key to compare';
    if (p.status === 'unavailable') return p.message ?? 'Not available for this provider';
    if (p.status === 'error') return p.message ?? 'Could not fetch the bill';
    return '—';
}

export default function BillingPanel({ isGod }: { isGod: boolean }) {
    const months = lastNMonths(3);
    const [month, setMonth] = useState(months[0]);
    const ledger = useLlmUsage();
    const { data, loading, error } = useBilling(isGod, month);

    if (!isGod) return null;

    const estimated = estimatedForMonth(ledger, month);
    const providers = data?.providers ?? [];

    return (
        <div className="billing">
            <div className="billing__head">
                <h3>Billing vs. estimate</h3>
                <select
                    className="billing__month"
                    aria-label="Billing month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                >
                    {months.map((m) => (
                        <option key={m} value={m}>{monthLabel(m)}</option>
                    ))}
                </select>
            </div>

            {loading && <p className="billing__status">Loading billed amounts…</p>}
            {error && <p className="billing__status billing__status--error" role="alert">{error}</p>}
            {!loading && !error && providers.length === 0 && (
                <p className="billing__status">No billing data for this month yet.</p>
            )}

            {!loading && providers.length > 0 && (
                <table className="billing__table">
                    <caption className="billing__caption">
                        Billed amounts come from the provider; estimates from this app's ledger.
                        Providers bill by UTC day; this app's ledger uses your local day, so the first and last hours of a month can differ.
                    </caption>
                    <thead>
                        <tr>
                            <th scope="col">Provider</th>
                            <th scope="col">Billed</th>
                            <th scope="col">Estimated</th>
                            <th scope="col">Difference</th>
                        </tr>
                    </thead>
                    <tbody>
                        {providers.map((p) => {
                            const est = estimated[p.provider as LlmProvider] ?? 0;
                            const billed = p.billedUsd;
                            const diff = billed != null ? billed - est : null;
                            return (
                                <tr key={p.provider}>
                                    <th scope="row">{p.provider}</th>
                                    <td>{billed != null ? `$${billed.toFixed(2)}` : statusText(p)}</td>
                                    <td>${est.toFixed(2)}</td>
                                    <td>{diff != null ? `${diff >= 0 ? '+' : ''}$${diff.toFixed(2)}` : '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}
