/**
 * CostAdvisorPanel — the "is this worth your time?" surface.
 *
 * A sliding $/hour KPI (what your time is worth) drives a live list of active
 * Hermes/Honcho tasks that AI automation or online outsourcing could do for
 * LESS than doing them yourself. Same component in two places:
 *   - variant="full"    → slider + recommendations (AI Spend widget)
 *   - variant="compact" → recommendations only, read-only (Honcho/Hermes panel)
 */
import { useContext, useMemo, useSyncExternalStore } from 'react';
import { Gauge, Sparkles, Users, TrendingDown } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { personaWorkStore, personaWorkUserIdHolder } from '../../lib/agents/personaWorkStore';
import { useCostKpi, setCostKpi, MIN_HOURLY_KPI, MAX_HOURLY_KPI } from '../../lib/costKpiStore';
import { evaluateTasks, totalSavings, type Recommendation } from '../../lib/costAdvisor';
import './CostAdvisorPanel.css';

/** Recommendations over the current user's active persona tasks + KPI. */
function useCostRecommendations(kpi: number): Recommendation[] {
    const userCtx = useContext(UserContext);
    personaWorkUserIdHolder.current = userCtx?.user?.id ?? personaWorkUserIdHolder.current ?? null;
    const state = useSyncExternalStore(
        personaWorkStore.subscribe,
        personaWorkStore.getSnapshot,
        personaWorkStore.getServerSnapshot,
    );
    return useMemo(() => evaluateTasks(state, kpi), [state, kpi]);
}

const money = (n: number): string => `$${n.toFixed(2)}`;

export default function CostAdvisorPanel({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
    const kpi = useCostKpi();
    const recs = useCostRecommendations(kpi);
    const reclaimable = totalSavings(recs);

    return (
        <section className="cadv" aria-label="Time-value advisor">
            {variant === 'full' && (
                <div className="cadv__kpi">
                    <label className="cadv__kpi-label" htmlFor="cadv-kpi">
                        <Gauge size={14} aria-hidden /> My time is worth
                        <strong className="cadv__kpi-value">${kpi}/hr</strong>
                    </label>
                    <input
                        id="cadv-kpi"
                        className="cadv__slider"
                        type="range"
                        min={MIN_HOURLY_KPI}
                        max={MAX_HOURLY_KPI}
                        step={5}
                        value={kpi}
                        onChange={(e) => setCostKpi(Number(e.target.value))}
                        aria-label="Value of your time in dollars per hour"
                    />
                    <div className="cadv__kpi-scale"><span>${MIN_HOURLY_KPI}/hr</span><span>${MAX_HOURLY_KPI}/hr</span></div>
                </div>
            )}

            <div className="cadv__head">
                <span className="cadv__title"><TrendingDown size={14} aria-hidden /> Do it cheaper</span>
                {recs.length > 0 && <span className="cadv__total" title="Estimated time-value reclaimable if delegated">≈ {money(reclaimable)} reclaimable</span>}
            </div>

            {recs.length === 0 ? (
                <p className="cadv__empty">
                    Nothing flagged — your active Hermes/Honcho tasks cost about ${kpi}/hr or less to do yourself.
                </p>
            ) : (
                <ul className="cadv__list">
                    {recs.map((r) => (
                        <li key={r.taskId} className="cadv__item">
                            <div className="cadv__item-top">
                                <span className="cadv__item-title" title={r.title}>{r.title}</span>
                                <span className="cadv__save">save ≈ {money(r.savingsUsd)}</span>
                            </div>
                            <div className="cadv__item-meta">
                                <span className="cadv__badge">
                                    {r.cheapest === 'ai'
                                        ? <><Sparkles size={11} aria-hidden /> AI automation</>
                                        : <><Users size={11} aria-hidden /> {r.role}</>}
                                </span>
                                <span className="cadv__cost">
                                    you {money(r.manualCostUsd)} → {r.cheapest === 'ai' ? 'AI' : 'outsource'} {money(r.cheapestCostUsd)}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <footer className="cadv__foot">
                Estimates · your rate × typical task time vs. AI automation / public online outsourcing rates
            </footer>
        </section>
    );
}
