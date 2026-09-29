/**
 * AiSpend — Plan 068 Phase 1 (W1 F4). Renders against a MOCKED
 * llmUsageStore + a stubbed CostAdvisorPanel, per the plan's frozen
 * contract (commit 9d4123f): useLlmUsage() -> { entries, days }; DailyRollup
 * gains optional unpriced / measuredCalls / byModel / bySource. This test
 * intentionally does not depend on F1's real store implementation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import AiSpend from '../components/AiSpend/AiSpend';

vi.mock('../components/AiSpend/CostAdvisorPanel', () => ({
    default: () => <div data-testid="cost-advisor-stub" />,
}));

// Plan 068 Phase 2: stub the new layout children so this stays a pure
// layout test — their own behavior is covered by aiBudget/spendBreakdown/
// subscriptionsEditor test files.
vi.mock('../components/AiSpend/BudgetBar', () => ({
    default: () => <div data-testid="budget-bar-stub" />,
}));
vi.mock('../components/AiSpend/SpendBreakdown', () => ({
    default: () => <div data-testid="spend-breakdown-stub" />,
}));
vi.mock('../components/AiSpend/SubscriptionsEditor', () => ({
    default: () => <div data-testid="subscriptions-editor-stub" />,
}));

let mockSubscriptions: { id: string; name: string; vendor: string; monthly: number }[] = [];

vi.mock('../lib/subscriptionsStore', () => ({
    useSubscriptions: () => mockSubscriptions,
    monthlyTotal: (list: { monthly: number }[]) => list.reduce((s, x) => s + x.monthly, 0),
}));

type DailyRollup = {
    date: string;
    calls: number;
    estIn: number;
    estOut: number;
    estCost: number;
    byProvider: Record<string, { calls: number; estCost: number }>;
    unpriced?: number;
    measuredCalls?: number;
};

function makeDay(i: number, overrides: Partial<DailyRollup> = {}): DailyRollup {
    const date = `2026-09-${String(11 + i).padStart(2, '0')}`;
    return {
        date,
        calls: 0,
        estIn: 0,
        estOut: 0,
        estCost: 0,
        byProvider: {},
        ...overrides,
    };
}

// 14 days, all zero, except the last (today) which callers override per-test.
function makeDays(overrides: Partial<DailyRollup> = {}): DailyRollup[] {
    const days = Array.from({ length: 14 }, (_, i) => makeDay(i));
    days[13] = { ...days[13], ...overrides };
    return days;
}

let mockDays: DailyRollup[] = makeDays();
let mockEntries: Array<{ ts: number; provider: string; model: string; estCost: number | null }> = [];
let clearLlmUsageMock = vi.fn();

vi.mock('../lib/llmUsageStore', () => ({
    useLlmUsage: () => ({ entries: mockEntries, days: {} }),
    lastNDays: () => mockDays,
    planAdvice: () => 'Pace ≈ $1.00/mo (est.) — test advice line.',
    clearLlmUsage: (...args: unknown[]) => clearLlmUsageMock(...args),
}));

afterEach(() => {
    vi.useRealTimers();
    mockDays = makeDays();
    mockEntries = [];
    mockSubscriptions = [];
    clearLlmUsageMock = vi.fn();
    vi.clearAllMocks();
});

describe('AiSpend — Phase 2 layout', () => {
    it('renders the budget bar, spend breakdown, and a collapsible subscriptions section', () => {
        mockSubscriptions = [
            { id: 'a', name: 'Claude Max', vendor: 'Anthropic', monthly: 100 },
            { id: 'b', name: 'ChatGPT Plus', vendor: 'OpenAI', monthly: 20 },
        ];
        render(<AiSpend />);

        expect(screen.getByTestId('budget-bar-stub')).toBeInTheDocument();
        expect(screen.getByTestId('spend-breakdown-stub')).toBeInTheDocument();
        expect(screen.getByText('Subscriptions (2 · $120.00/mo)')).toBeInTheDocument();
        // Collapsed by default; content still mounted inside <details>.
        expect(screen.getByTestId('subscriptions-editor-stub')).toBeInTheDocument();
    });

    it('shows a zero count/total when there are no subscriptions', () => {
        mockSubscriptions = [];
        render(<AiSpend />);
        expect(screen.getByText('Subscriptions (0 · $0.00/mo)')).toBeInTheDocument();
    });
});

describe('AiSpend — confirm-clear', () => {
    it('arms on first click, then disarms after 4s without clearing', async () => {
        vi.useFakeTimers();
        render(<AiSpend />);

        fireEvent.click(screen.getByTitle('Clear the usage ledger'));
        expect(screen.getByText('Click again to clear all devices')).toBeInTheDocument();
        expect(clearLlmUsageMock).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(4000);
        });

        expect(screen.getByText('Clear')).toBeInTheDocument();
        expect(clearLlmUsageMock).not.toHaveBeenCalled();
    });

    it('clears on a second click within the 4s window', () => {
        render(<AiSpend />);
        const btn = screen.getByTitle('Clear the usage ledger');
        fireEvent.click(btn);
        fireEvent.click(btn);
        expect(clearLlmUsageMock).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Clear')).toBeInTheDocument();
    });
});

describe('AiSpend — honest empty state', () => {
    it('does not claim every call lands here automatically', () => {
        render(<AiSpend />);
        expect(screen.queryByText(/lands here automatically/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Not tracked yet: server-side calls, voice \(TTS\/STT\), avatar\./)).toBeInTheDocument();
    });
});

describe('AiSpend — quality chips', () => {
    it('renders measured % and unpriced count from mocked rollups', () => {
        mockDays = makeDays({ calls: 10, measuredCalls: 7, unpriced: 3, estCost: 1.23 });
        render(<AiSpend />);
        expect(screen.getByText('70% measured')).toBeInTheDocument();
        expect(screen.getByText('3 unpriced')).toBeInTheDocument();
    });

    it('hides both chips when there is no usage this week', () => {
        mockDays = makeDays({ calls: 0, measuredCalls: 0, unpriced: 0 });
        render(<AiSpend />);
        expect(screen.queryByText(/measured$/)).not.toBeInTheDocument();
        expect(screen.queryByText(/unpriced$/)).not.toBeInTheDocument();
    });
});

describe('AiSpend — accessible chart', () => {
    it('exposes a hidden table with 14 rows', () => {
        render(<AiSpend />);
        const table = document.querySelector('table.spend__sr-only');
        expect(table).not.toBeNull();
        const rows = table!.querySelectorAll('tbody tr');
        expect(rows).toHaveLength(14);
    });

    it('gives the chart section role=img with a summarizing aria-label', () => {
        render(<AiSpend />);
        const chart = screen.getByRole('img', { name: /Estimated cost per day, last 14 days, total/ });
        expect(chart).toBeInTheDocument();
    });
});

describe('AiSpend — unpriced provider rows', () => {
    it('a provider whose calls are all unpriced reads "unpriced", not "$0.0000"; a mixed one says so', () => {
        const today = new Date(`${mockDays[13].date}T12:00:00`).getTime();
        mockDays = makeDays({ calls: 3, estCost: 0.5, unpriced: 2, byProvider: { custom: { calls: 1, estCost: 0 }, openai: { calls: 2, estCost: 0.5 } } });
        mockEntries = [
            { ts: today, provider: 'custom', model: 'mystery', estCost: null },
            { ts: today, provider: 'openai', model: 'gpt-4o', estCost: 0.5 },
            { ts: today, provider: 'openai', model: 'mystery-2', estCost: null },
        ];
        render(<AiSpend />);
        expect(screen.getByText('unpriced')).toBeInTheDocument();
        expect(screen.getByText('$0.5000 + 1 unpriced')).toBeInTheDocument();
        expect(screen.queryByText('$0.0000', { selector: '.spend__prov-cost' })).not.toBeInTheDocument();
    });
});
