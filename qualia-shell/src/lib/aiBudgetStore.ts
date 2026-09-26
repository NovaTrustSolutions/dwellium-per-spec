/**
 * aiBudgetStore — the user's optional monthly AI budget (plan 068 Phase 2).
 *
 * Per-user, One Save 'ai-budget', sister shape to costKpiStore. Default is
 * `null` (no budget) — never a sample figure (owner rule: no seeded data).
 *
 * budgetPace() compares month-to-date spend (subscriptions + token ledger)
 * against the budget and projects the full month at the current daily rate.
 * budgetBriefLine() feeds the Morning Brief / Honcho deep-cycle data lines —
 * silent unless a budget is set AND the pace isn't 'ok'.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { aiBudgetUserIdHolder } from './perUserIdentity';
import { lastNDays, type UsageLedger } from './llmUsageStore';
import { subscriptionsStore, withoutUnconfirmedDefaults, monthlyTotal } from './subscriptionsStore';

export const MIN_BUDGET_USD = 1;
export const MAX_BUDGET_USD = 100_000;

export interface BudgetPace {
    spentToDate: number;
    projected: number;
    budget: number;
    ratio: number;
    status: 'ok' | 'warn' | 'over';
}

export { aiBudgetUserIdHolder };

function resolveKey(): string {
    const uid = aiBudgetUserIdHolder.current;
    return uid ? `aibudget:${uid}` : 'aibudget:_anonymous';
}

/** Clamp to [MIN, MAX] and round to cents. `null` clears the budget. */
export function clampBudget(n: number | null): number | null {
    if (n == null || !Number.isFinite(n)) return null;
    return Math.round(Math.min(MAX_BUDGET_USD, Math.max(MIN_BUDGET_USD, n)) * 100) / 100;
}

function deserialize(raw: string | null): number | null {
    if (raw == null) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed == null ? null : clampBudget(Number(parsed));
    } catch {
        return null;
    }
}

export const aiBudgetStore = withSync(
    createLocalStorageStore<number | null>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: null,
    }),
    { objectType: 'ai-budget', holder: aiBudgetUserIdHolder, resolveKey },
);

export function setAiBudget(monthlyUsd: number | null): void {
    const v = clampBudget(monthlyUsd);
    aiBudgetStore.set(v, () => {
        try {
            if (v == null) localStorage.removeItem(resolveKey());
            else localStorage.setItem(resolveKey(), JSON.stringify(v));
        } catch { /* sandboxed */ }
    });
}

export function getAiBudget(): number | null {
    return aiBudgetStore.getSnapshot();
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetAiBudget(): void {
    aiBudgetStore.set(null, () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

export function useAiBudget(): number | null {
    return useSyncExternalStore(
        aiBudgetStore.subscribe,
        aiBudgetStore.getSnapshot,
        aiBudgetStore.getServerSnapshot,
    );
}

function monthPrefix(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * spentToDate = subscriptions monthly total + month-to-date token spend.
 * projected = subscriptions + (month-to-date tokens / elapsed days) × days in month.
 * ratio = projected / budget; warn at ratio ≥ 0.9, over at ratio > 1.
 */
export function budgetPace(ledger: UsageLedger, budget: number, subscriptionsMonthly: number, now: number = Date.now()): BudgetPace {
    const nowDate = new Date(now);
    const prefix = monthPrefix(nowDate);
    let tokensSpend = 0;
    for (const [date, roll] of Object.entries(ledger.days)) {
        if (date.startsWith(prefix)) tokensSpend += roll.estCost;
    }
    const elapsedDays = Math.max(1, nowDate.getDate());
    const projectedTokens = (tokensSpend / elapsedDays) * daysInMonth(nowDate);
    const spentToDate = subscriptionsMonthly + tokensSpend;
    const projected = subscriptionsMonthly + projectedTokens;
    const ratio = budget > 0 ? projected / budget : 0;
    const status: BudgetPace['status'] = ratio > 1 ? 'over' : ratio >= 0.9 ? 'warn' : 'ok';
    return { spentToDate, projected, budget, ratio, status };
}

/** Builds the {entries:[], days} ledger shape from lastNDays(31), for non-hook callers. */
function currentLedger(): UsageLedger {
    const days: UsageLedger['days'] = {};
    for (const roll of lastNDays(31)) days[roll.date] = roll;
    return { entries: [], days };
}

function currentSubscriptionsMonthly(): number {
    return monthlyTotal(withoutUnconfirmedDefaults(subscriptionsStore.getSnapshot()));
}

/** null unless a budget is set AND the pace isn't 'ok'. Feeds the Morning Brief / Honcho deep-cycle lines. */
export function budgetBriefLine(): string | null {
    const budget = getAiBudget();
    if (budget == null) return null;
    const pace = budgetPace(currentLedger(), budget, currentSubscriptionsMonthly());
    if (pace.status === 'ok') return null;
    // A projection from 1–2 days of data is mostly noise (one big call ×30) — keep the
    // Morning Brief quiet early in the month unless the budget is actually exceeded.
    if (new Date().getDate() < 3 && pace.spentToDate <= budget) return null;
    const word = pace.status === 'over' ? 'over budget' : 'close to budget';
    return `AI budget: projected $${pace.projected.toFixed(2)} of $${budget.toFixed(2)} this month — ${word}`;
}
