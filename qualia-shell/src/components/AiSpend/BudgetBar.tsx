/**
 * BudgetBar — optional monthly AI budget + pace-vs-budget meter (plan 068 Phase 2).
 *
 * No budget: a compact "set a budget" form. Budget set: a native <meter> plus
 * a plain-text pace line and a status WORD (not colour alone) so it reads
 * fine for colour-blind users and screen readers.
 */
import { useState } from 'react';
import type { UsageLedger } from '../../lib/llmUsageStore';
import { useAiBudget, setAiBudget, budgetPace } from '../../lib/aiBudgetStore';
import { useSubscriptions, monthlyTotal } from '../../lib/subscriptionsStore';
import './BudgetBar.css';

const STATUS_WORD: Record<'ok' | 'warn' | 'over', string> = {
    ok: 'On track',
    warn: 'Close to budget',
    over: 'Over budget',
};

export default function BudgetBar({ ledger }: { ledger: UsageLedger }) {
    const budget = useAiBudget();
    const subscriptions = monthlyTotal(useSubscriptions());
    const [draft, setDraft] = useState('');
    const [editing, setEditing] = useState(false);

    if (budget == null || editing) {
        return (
            <form
                className="budget budget--set"
                onSubmit={(e) => {
                    e.preventDefault();
                    const n = Number(draft);
                    if (Number.isFinite(n) && n > 0) setAiBudget(n);
                    setDraft('');
                    setEditing(false);
                }}
            >
                <label htmlFor="budget-input" className="budget__label">{editing ? 'Monthly AI budget' : 'Set a monthly AI budget'}</label>
                <div className="budget__row">
                    <span className="budget__prefix">$</span>
                    <input
                        id="budget-input"
                        className="budget__input"
                        type="number"
                        min={1}
                        step="1"
                        inputMode="decimal"
                        placeholder="100"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                    <button type="submit" className="budget__save">Save</button>
                    {editing && <button type="button" className="budget__link" onClick={() => { setEditing(false); setDraft(''); }}>Cancel</button>}
                </div>
            </form>
        );
    }

    const pace = budgetPace(ledger, budget, subscriptions, Date.now());
    const meterValue = Math.min(pace.projected, pace.budget);

    return (
        <div className="budget budget--active">
            <div className="budget__head">
                <span className={`budget__status budget__status--${pace.status}`}>{STATUS_WORD[pace.status]}</span>
                <div className="budget__actions">
                    <button
                        type="button"
                        className="budget__link"
                        onClick={() => { setDraft(String(budget)); setEditing(true); }}
                    >
                        Edit
                    </button>
                    <button type="button" className="budget__link" onClick={() => setAiBudget(null)}>Clear</button>
                </div>
            </div>
            <meter
                className="budget__meter"
                aria-label={`Projected spend $${pace.projected.toFixed(2)} of $${pace.budget.toFixed(2)} budget this month`}
                min={0}
                max={pace.budget}
                low={pace.budget * 0.9}
                high={pace.budget}
                optimum={0}
                value={meterValue}
            />
            <p className="budget__line">
                Projected ${pace.projected.toFixed(2)} of ${pace.budget.toFixed(2)} this month · ${pace.spentToDate.toFixed(2)} so far
                {subscriptions > 0 ? ` (includes $${subscriptions.toFixed(2)}/mo subscriptions)` : ''}
            </p>
        </div>
    );
}
