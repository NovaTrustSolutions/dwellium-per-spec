/**
 * AiSpend — P12-1 (gap item 6): live AI usage + estimated cost dashboard.
 * Today's calls/cost, a 14-day bar chart, by-provider breakdown, and the
 * plan-advice line ("you're paying for more than you use"). All figures are
 * ESTIMATES (chars/4 tokens × rough $/MTok table) and labeled as such.
 */
import { useEffect, useMemo, useState } from 'react';
import { Coins, Trash2 } from 'lucide-react';
import { useLlmUsage, lastNDays, planAdvice, clearLlmUsage } from '../../lib/llmUsageStore';
import { useSubscriptions, monthlyTotal } from '../../lib/subscriptionsStore';
import CostAdvisorPanel from './CostAdvisorPanel';
import BudgetBar from './BudgetBar';
import SpendBreakdown from './SpendBreakdown';
import SubscriptionsEditor from './SubscriptionsEditor';
import './AiSpend.css';

const fmt$ = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`);
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const CONFIRM_CLEAR_MS = 4000;

export default function AiSpend() {
    const ledger = useLlmUsage();
    const subscriptions = useSubscriptions();
    const subsTotal = monthlyTotal(subscriptions);
    const [confirmClear, setConfirmClear] = useState(false);

    // Plan 068 E1: a stray click minutes later must not wipe the ledger.
    useEffect(() => {
        if (!confirmClear) return;
        const t = setTimeout(() => setConfirmClear(false), CONFIRM_CLEAR_MS);
        return () => clearTimeout(t);
    }, [confirmClear]);

    const days = useMemo(() => lastNDays(14, ledger), [ledger]);
    const today = days[days.length - 1];
    // Plan 068 E3: memoize so `providers` doesn't rebuild off a fresh array every render.
    const week = useMemo(() => days.slice(-7), [days]);
    const weekCost = week.reduce((s, d) => s + d.estCost, 0);
    const weekCalls = week.reduce((s, d) => s + d.calls, 0);
    const weekMeasured = week.reduce((s, d) => s + (d.measuredCalls ?? 0), 0);
    const weekUnpriced = week.reduce((s, d) => s + (d.unpriced ?? 0), 0);
    const measuredPct = weekCalls > 0 ? Math.round((weekMeasured / weekCalls) * 100) : null;
    const maxCost = Math.max(0.0001, ...days.map(d => d.estCost));
    const chartTotal = days.reduce((s, d) => s + d.estCost, 0);
    const peakDay = days.reduce((best, d) => (d.estCost > best.estCost ? d : best), days[0]);

    const providers = useMemo(() => {
        const agg: Record<string, { calls: number; estCost: number }> = {};
        for (const d of week) {
            for (const [prov, v] of Object.entries(d.byProvider)) {
                const a = agg[prov] ?? { calls: 0, estCost: 0 };
                agg[prov] = { calls: a.calls + (v?.calls ?? 0), estCost: a.estCost + (v?.estCost ?? 0) };
            }
        }
        return Object.entries(agg).sort((a, b) => b[1].estCost - a[1].estCost);
    }, [week]);
    // Unpriced calls per provider (7 days): their cost isn't in estCost, so a row must not read "$0".
    const unpricedByProvider = useMemo(() => {
        const since = new Date(`${week[0].date}T00:00:00`).getTime();
        const out: Record<string, number> = {};
        for (const e of ledger.entries) if (e.ts >= since && e.estCost == null) out[e.provider] = (out[e.provider] ?? 0) + 1;
        return out;
    }, [ledger, week]);

    const handleClear = () => {
        if (confirmClear) {
            clearLlmUsage();
            setConfirmClear(false);
        } else {
            setConfirmClear(true);
        }
    };

    return (
        <div className="spend">
            <header className="spend__head">
                <div className="spend__title"><Coins size={15} aria-hidden /> AI Spend <span className="spend__est">all figures estimated</span></div>
                <div className="spend__quality">
                    {measuredPct !== null && (
                        <span className="spend__chip" title="Share of the last 7 days' calls priced from real provider-reported tokens rather than the chars/4 estimate">
                            {measuredPct}% measured
                        </span>
                    )}
                    {weekUnpriced > 0 && (
                        <span className="spend__chip spend__chip--warn" title="These calls used a model with no known price, so their cost is not included in the totals above">
                            {weekUnpriced} unpriced
                        </span>
                    )}
                </div>
                <button
                    className="spend__clear"
                    onClick={handleClear}
                    title="Clear the usage ledger"
                >
                    <Trash2 size={12} aria-hidden /> {confirmClear ? 'Click again to clear all devices' : 'Clear'}
                </button>
            </header>

            <div className="spend__cards">
                <div className="spend__card">
                    <span className="spend__card-label">Today</span>
                    <strong>{fmt$(today.estCost)}</strong>
                    <small>{today.calls} call{today.calls === 1 ? '' : 's'} · {fmtK(today.estIn + today.estOut)} est. tokens</small>
                </div>
                <div className="spend__card">
                    <span className="spend__card-label">Last 7 days</span>
                    <strong>{fmt$(weekCost)}</strong>
                    <small>{weekCalls} call{weekCalls === 1 ? '' : 's'}</small>
                </div>
                <div className="spend__card spend__card--advice">
                    <span className="spend__card-label">Plan check</span>
                    <small>{planAdvice(ledger)}</small>
                </div>
            </div>

            <BudgetBar ledger={ledger} />

            <p className="spend__coverage-note">
                Not tracked yet: server-side calls, voice (TTS/STT), avatar.
            </p>

            <section
                className="spend__chart"
                role="img"
                aria-label={`Estimated cost per day, last 14 days, total ${fmt$(chartTotal)}, peak ${fmt$(peakDay.estCost)} on ${peakDay.date}`}
            >
                {days.map(d => (
                    <div key={d.date} className="spend__bar-col" title={`${d.date}: ${fmt$(d.estCost)} · ${d.calls} calls`}>
                        <div className="spend__bar" style={{ height: `${Math.max(2, (d.estCost / maxCost) * 100)}%` }} />
                        <span className="spend__bar-label">{d.date.slice(8)}</span>
                    </div>
                ))}
            </section>
            <table className="spend__sr-only">
                <caption>Estimated cost per day, last 14 days</caption>
                <thead>
                    <tr><th scope="col">Date</th><th scope="col">Calls</th><th scope="col">Cost</th></tr>
                </thead>
                <tbody>
                    {days.map(d => (
                        <tr key={d.date}>
                            <td>{d.date}</td>
                            <td>{d.calls}</td>
                            <td>{fmt$(d.estCost)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <section className="spend__providers" aria-label="Spend by provider (7 days)">
                <h3>By provider (7 days)</h3>
                {providers.length === 0 && <p className="spend__empty">No usage recorded yet — AI calls made in this browser will show up here.</p>}
                {providers.map(([prov, v]) => (
                    <div key={prov} className="spend__prov-row">
                        <span className="spend__prov-name">{prov}</span>
                        <span className="spend__prov-calls">{v.calls} calls</span>
                        <span className="spend__prov-cost">
                            {unpricedByProvider[prov] === v.calls ? 'unpriced'
                                : unpricedByProvider[prov] ? `${fmt$(v.estCost)} + ${unpricedByProvider[prov]} unpriced`
                                : fmt$(v.estCost)}
                        </span>
                    </div>
                ))}
            </section>

            <SpendBreakdown ledger={ledger} />

            <details className="spend__subs">
                <summary>{`Subscriptions (${subscriptions.length} · $${subsTotal.toFixed(2)}/mo)`}</summary>
                <SubscriptionsEditor showHeading={false} />
            </details>

            <section className="spend__advisor" aria-label="Time-value advisor">
                <CostAdvisorPanel variant="full" />
            </section>

            <footer className="spend__foot">
                Recorded in the browser · measured tokens when the provider reports them, otherwise ≈ chars/4 · prices from public price tables · local models = $0
            </footer>
        </div>
    );
}
