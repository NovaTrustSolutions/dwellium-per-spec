/**
 * AiSpend — P12-1 (gap item 6): live AI usage + estimated cost dashboard.
 * Today's calls/cost, a 14-day bar chart, by-provider breakdown, and the
 * plan-advice line ("you're paying for more than you use"). All figures are
 * ESTIMATES (chars/4 tokens × rough $/MTok table) and labeled as such.
 */
import { useMemo, useState } from 'react';
import { Coins, Trash2 } from 'lucide-react';
import { useLlmUsage, lastNDays, planAdvice, clearLlmUsage } from '../../lib/llmUsageStore';
import './AiSpend.css';

const fmt$ = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`);
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export default function AiSpend() {
    const ledger = useLlmUsage();
    const [confirmClear, setConfirmClear] = useState(false);

    const days = useMemo(() => lastNDays(14, ledger), [ledger]);
    const today = days[days.length - 1];
    const week = days.slice(-7);
    const weekCost = week.reduce((s, d) => s + d.estCost, 0);
    const weekCalls = week.reduce((s, d) => s + d.calls, 0);
    const maxCost = Math.max(0.0001, ...days.map(d => d.estCost));

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

    return (
        <div className="spend">
            <header className="spend__head">
                <div className="spend__title"><Coins size={15} aria-hidden /> AI Spend <span className="spend__est">all figures estimated</span></div>
                <button
                    className="spend__clear"
                    onClick={() => { if (confirmClear) { clearLlmUsage(); setConfirmClear(false); } else setConfirmClear(true); }}
                    title="Clear the usage ledger"
                >
                    <Trash2 size={12} aria-hidden /> {confirmClear ? 'Really clear?' : 'Clear'}
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

            <section className="spend__chart" aria-label="Estimated cost per day, last 14 days">
                {days.map(d => (
                    <div key={d.date} className="spend__bar-col" title={`${d.date}: ${fmt$(d.estCost)} · ${d.calls} calls`}>
                        <div className="spend__bar" style={{ height: `${Math.max(2, (d.estCost / maxCost) * 100)}%` }} />
                        <span className="spend__bar-label">{d.date.slice(8)}</span>
                    </div>
                ))}
            </section>

            <section className="spend__providers" aria-label="Spend by provider (7 days)">
                <h3>By provider (7 days)</h3>
                {providers.length === 0 && <p className="spend__empty">No usage recorded yet — every ARA/skill/agent LLM call lands here automatically.</p>}
                {providers.map(([prov, v]) => (
                    <div key={prov} className="spend__prov-row">
                        <span className="spend__prov-name">{prov}</span>
                        <span className="spend__prov-calls">{v.calls} calls</span>
                        <span className="spend__prov-cost">{fmt$(v.estCost)}</span>
                    </div>
                ))}
            </section>

            <footer className="spend__foot">
                Recorded at the callLlm chokepoint (browser-direct keys) · tokens ≈ chars/4 · prices ≈ public $/MTok tables · local models = $0
            </footer>
        </div>
    );
}
