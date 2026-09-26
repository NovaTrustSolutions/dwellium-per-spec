/**
 * SpendBreakdown — plan 068 Phase 2 (F2). By-model / by-feature spend tables
 * over a 7/30-day range, plus a raw-entries CSV export. Reuses the rollups
 * `lastNDays` already builds (byModel / bySource) rather than re-deriving them.
 */
import { useId, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { lastNDays, type UsageLedger } from '../../lib/llmUsageStore';
import { entriesToCsv, downloadCsv } from '../../lib/spendExport';
import './SpendBreakdown.css';

const fmt$ = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`);

const SOURCE_LABELS: Record<string, string> = {
    ara: 'ARA',
    persona: 'Persona Studio',
    research: 'Research Lab',
    honcho: 'Honcho',
    test: 'Provider test',
    'skill:web_search': 'Web search',
    'skill:image': 'Image generation',
    other: 'Other',
};

type Tab = 'model' | 'feature';
type Range = 7 | 30;

interface Row {
    key: string;
    label: string;
    calls: number;
    cost: number;
    unpriced: number;
}

function buildRows(ledger: UsageLedger, tab: Tab, range: Range): Row[] {
    const days = lastNDays(range, ledger);
    const agg: Record<string, { calls: number; cost: number }> = {};
    for (const day of days) {
        const bucket = tab === 'model' ? day.byModel : day.bySource;
        for (const [key, v] of Object.entries(bucket ?? {})) {
            const a = agg[key] ?? { calls: 0, cost: 0 };
            agg[key] = { calls: a.calls + v.calls, cost: a.cost + v.estCost };
        }
    }
    const since = days.length > 0 ? new Date(`${days[0].date}T00:00:00`).getTime() : 0;
    const unpriced: Record<string, number> = {};
    for (const e of ledger.entries) {
        if (e.ts < since || e.estCost !== null) continue;
        const key = tab === 'model' ? e.model : (e.source ?? 'other');
        unpriced[key] = (unpriced[key] ?? 0) + 1;
    }
    return Object.entries(agg)
        .map(([key, v]) => ({
            key,
            label: tab === 'feature' ? (SOURCE_LABELS[key] ?? key) : key,
            calls: v.calls,
            cost: v.cost,
            unpriced: unpriced[key] ?? 0,
        }))
        .sort((a, b) => b.cost - a.cost || b.calls - a.calls);
}

function costLabel(row: Row): string {
    if (row.unpriced === 0) return fmt$(row.cost);
    if (row.unpriced === row.calls) return 'unpriced';
    return `${fmt$(row.cost)} + ${row.unpriced} unpriced`;
}

const TABS: { id: Tab; label: string }[] = [
    { id: 'model', label: 'By model' },
    { id: 'feature', label: 'By feature' },
];

export default function SpendBreakdown({ ledger }: { ledger: UsageLedger }) {
    const [tab, setTab] = useState<Tab>('model');
    const [range, setRange] = useState<Range>(7);
    const idBase = useId();
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const rows = buildRows(ledger, tab, range);

    const onTabKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const idx = TABS.findIndex(t => t.id === tab);
        const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
        setTab(TABS[next].id);
        tabRefs.current[next]?.focus();
    };

    return (
        <section className="sbd" aria-label="Spend breakdown">
            <div className="sbd__head">
                <h3>Breakdown</h3>
                <div className="sbd__range" role="group" aria-label="Date range">
                    {([7, 30] as Range[]).map(r => (
                        <button
                            key={r}
                            type="button"
                            className="sbd__range-btn"
                            aria-pressed={range === r}
                            onClick={() => setRange(r)}
                        >
                            {r} days
                        </button>
                    ))}
                </div>
            </div>

            <div className="sbd__tabs" role="tablist" aria-label="Breakdown view">
                {TABS.map((t, i) => (
                    <button
                        key={t.id}
                        ref={el => { tabRefs.current[i] = el; }}
                        type="button"
                        role="tab"
                        id={`${idBase}-tab-${t.id}`}
                        aria-selected={tab === t.id}
                        aria-controls={`${idBase}-panel-${t.id}`}
                        tabIndex={tab === t.id ? 0 : -1}
                        className="sbd__tab"
                        onClick={() => setTab(t.id)}
                        onKeyDown={onTabKeyDown}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div
                role="tabpanel"
                id={`${idBase}-panel-${tab}`}
                aria-labelledby={`${idBase}-tab-${tab}`}
            >
                {rows.length === 0 ? (
                    <p className="sbd__empty">No calls in this range.</p>
                ) : (
                    <table className="sbd__table">
                        <thead>
                            <tr>
                                <th scope="col">{tab === 'model' ? 'Model' : 'Feature'}</th>
                                <th scope="col">Calls</th>
                                <th scope="col">Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.key}>
                                    <td>{row.label}</td>
                                    <td>{row.calls}</td>
                                    <td>{costLabel(row)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="sbd__foot">
                <button
                    type="button"
                    className="sbd__export"
                    onClick={() => {
                        const today = new Date().toISOString().slice(0, 10);
                        downloadCsv(`ai-spend-${today}.csv`, entriesToCsv(ledger.entries));
                    }}
                >
                    <Download size={12} aria-hidden /> Export CSV
                </button>
                <span className="sbd__caption">last 1,000 calls</span>
            </div>
        </section>
    );
}
