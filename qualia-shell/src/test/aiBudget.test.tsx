/**
 * aiBudgetStore + BudgetBar — plan 068 Phase 2. Each test targets one piece
 * of production logic (mutation-check discipline): pace math on a fixed
 * date, warn boundary, no-budget/ok → null brief line, over → line text,
 * set/clear/clamp/persist per user, and BudgetBar's two render modes.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
    aiBudgetStore,
    aiBudgetUserIdHolder,
    setAiBudget,
    getAiBudget,
    resetAiBudget,
    clampBudget,
    budgetPace,
    budgetBriefLine,
} from '../lib/aiBudgetStore';
import { subscriptionsStore, saveSubscriptions } from '../lib/subscriptionsStore';
import { llmUsageStore, llmUsageUserIdHolder, resetLlmUsage, recordLlmUsage, _resetDeviceIdForTests } from '../lib/llmUsageStore';
import type { UsageLedger, DailyRollup } from '../lib/llmUsageStore';
import BudgetBar from '../components/AiSpend/BudgetBar';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

function day(date: string, estCost: number): DailyRollup {
    return { date, calls: 1, estIn: 100, estOut: 100, estCost, byProvider: {} };
}

beforeEach(() => {
    aiBudgetUserIdHolder.current = 'test-user';
    llmUsageUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    resetAiBudget();
    aiBudgetStore.reset();
    resetLlmUsage();
    llmUsageStore.reset();
    saveSubscriptions([]);
    subscriptionsStore.reset();
    _resetDeviceIdForTests();
});

afterEach(() => cleanup());

describe('budgetPace', () => {
    it('projects the month from month-to-date spend on a fixed date (2026-09-10)', () => {
        const now = new Date('2026-09-10T12:00:00').getTime();
        const ledger: UsageLedger = { entries: [], days: { '2026-09-01': day('2026-09-01', 30) } };
        const pace = budgetPace(ledger, 100, 20, now);
        // elapsed = 10, daysInMonth(Sep) = 30 → projected = 20 + 30/10*30 = 110
        expect(pace.projected).toBeCloseTo(110, 5);
        expect(pace.spentToDate).toBeCloseTo(50, 5); // 20 subs + 30 tokens
        expect(pace.ratio).toBeCloseTo(1.1, 5);
        expect(pace.status).toBe('over');
    });

    it('ratio just under 0.9 is ok, just at 0.9 is warn', () => {
        const now = new Date('2026-09-10T12:00:00').getTime();
        const ledgerOk: UsageLedger = { entries: [], days: {} };
        const okPace = budgetPace(ledgerOk, 100, 89, now); // projected = 89 -> ratio 0.89 -> ok
        expect(okPace.status).toBe('ok');
        const warnPace = budgetPace(ledgerOk, 100, 90, now); // projected = 90 -> ratio 0.90 -> warn
        expect(warnPace.status).toBe('warn');
    });
});

describe('budgetBriefLine', () => {
    it('null when no budget is set', () => {
        expect(getAiBudget()).toBeNull();
        expect(budgetBriefLine()).toBeNull();
    });

    it('null when a budget is set but pace is ok', () => {
        setAiBudget(10000); // huge budget, tiny/no spend -> ok
        expect(budgetBriefLine()).toBeNull();
    });

    it('returns text mentioning over budget when projected exceeds budget', () => {
        setAiBudget(1); // smallest allowed budget
        // Large enough token volume that even a partial month blows past a $1 budget.
        recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-5', promptChars: 4_000_000, responseChars: 4_000_000, userId: 'test-user' });
        const line = budgetBriefLine();
        expect(line).not.toBeNull();
        expect(line).toContain('over budget');
        expect(line).toMatch(/^AI budget: projected \$/);
    });
});

describe('set/clear/clamp/persist', () => {
    it('clamps to [1, 100000] and rounds to cents', () => {
        expect(clampBudget(0)).toBe(1);
        expect(clampBudget(999999)).toBe(100000);
        expect(clampBudget(12.3456)).toBe(12.35);
        expect(clampBudget(null)).toBeNull();
    });

    it('set then clear round-trips through the store', () => {
        setAiBudget(250);
        expect(getAiBudget()).toBe(250);
        setAiBudget(null);
        expect(getAiBudget()).toBeNull();
    });

    it('is namespaced per user (holder switch changes the value)', () => {
        setAiBudget(50);
        aiBudgetUserIdHolder.current = 'other-user';
        aiBudgetStore.reset();
        expect(getAiBudget()).toBeNull();
        setAiBudget(75);
        expect(getAiBudget()).toBe(75);
        aiBudgetUserIdHolder.current = 'test-user';
        aiBudgetStore.reset();
        expect(getAiBudget()).toBe(50);
    });
});

describe('budgetBriefLine — early month', () => {
    afterEach(() => vi.useRealTimers());
    // 14M prompt chars ≈ 3.5M tokens × $2/MTok (claude-sonnet-5) ≈ $7 spent.
    const spendAbout7 = () => recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-5', promptChars: 14_000_000, responseChars: 0, userId: 'test-user' });

    it('stays quiet on the 2nd when the projection is over but actual spend is not', () => {
        vi.setSystemTime(new Date(2026, 8, 2, 12));
        setAiBudget(100);
        spendAbout7(); // projected ≈ 7/2×30 = 105 > 100, spent ≈ 7 ≤ 100
        expect(budgetBriefLine()).toBeNull();
    });

    it('speaks from the 3rd on for the same pace', () => {
        vi.setSystemTime(new Date(2026, 8, 3, 12));
        setAiBudget(60);
        spendAbout7(); // projected ≈ 7/3×30 = 70 > 60
        expect(budgetBriefLine()).toContain('over budget');
    });
});

describe('BudgetBar', () => {
    it('Edit opens an inline form prefilled with the budget (no window.prompt); Save updates, Cancel keeps', () => {
        setAiBudget(100);
        const promptSpy = vi.spyOn(window, 'prompt');
        render(<BudgetBar ledger={{ entries: [], days: {} }} />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        const input = screen.getByLabelText('Monthly AI budget') as HTMLInputElement;
        expect(input.value).toBe('100');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(getAiBudget()).toBe(100);
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.change(screen.getByLabelText('Monthly AI budget'), { target: { value: '250' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(getAiBudget()).toBe(250);
        expect(screen.getByRole('meter')).toBeTruthy();
        expect(promptSpy).not.toHaveBeenCalled();
    });

    it('renders the set-budget form when no budget is set', () => {
        render(<BudgetBar ledger={{ entries: [], days: {} }} />);
        expect(screen.getByLabelText('Set a monthly AI budget')).toBeTruthy();
        expect(screen.queryByRole('meter')).toBeNull();
    });

    it('renders the meter + status text when a budget is set', () => {
        setAiBudget(100);
        render(<BudgetBar ledger={{ entries: [], days: {} }} />);
        expect(screen.getByRole('meter')).toBeTruthy();
        expect(screen.getByText(/Projected \$/)).toBeTruthy();
        expect(screen.getByText('On track')).toBeTruthy();
    });
});

describe('BudgetBar — invalid input', () => {
    // 0 / negatives are blocked by the input's native min=1 validation (browser message);
    // an EMPTY submit passes native validation, so the component must explain it.
    it('an empty Save explains instead of silently doing nothing; typing clears the message', () => {
        render(<BudgetBar ledger={{ entries: [], days: {} }} />);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(getAiBudget()).toBeNull();
        expect(screen.getByRole('alert').textContent).toMatch(/greater than \$0/);
        expect(screen.getByLabelText('Set a monthly AI budget').getAttribute('aria-invalid')).toBe('true');
        fireEvent.change(screen.getByLabelText('Set a monthly AI budget'), { target: { value: '40' } });
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
