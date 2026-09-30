/**
 * BillingPanel — plan 068 Phase 3 (F1). god-only billed-vs-estimated table.
 * `useLlmUsage()` is real (seeded via `recordLlmUsage`); `useBilling` is
 * mocked so each test controls the billed side independently of the ledger.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import BillingPanel, { lastNMonths, estimatedForMonth } from '../components/AiSpend/BillingPanel';
import { llmUsageUserIdHolder, recordLlmUsage, resetLlmUsage, llmUsageStore } from '../lib/llmUsageStore';
import type { UseBillingResult } from '../lib/serverSpend';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

let mockBilling: UseBillingResult = { data: null, loading: false, error: null };
const useBillingSpy = vi.fn((..._args: unknown[]) => mockBilling);

vi.mock('../lib/serverSpend', () => ({
    useBilling: (...args: unknown[]) => useBillingSpy(...args),
}));

beforeEach(() => {
    vi.setSystemTime(new Date(2026, 8, 15, 12)); // 2026-09-15
    llmUsageUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    resetLlmUsage();
    llmUsageStore.reset();
    mockBilling = { data: null, loading: false, error: null };
    useBillingSpy.mockClear();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('lastNMonths', () => {
    it('current month first, then the two before it', () => {
        expect(lastNMonths(3, new Date(2026, 8, 15))).toEqual(['2026-09', '2026-08', '2026-07']);
        expect(lastNMonths(3, new Date(2026, 0, 15))).toEqual(['2026-01', '2025-12', '2025-11']); // year rollover
    });
});

describe('estimatedForMonth', () => {
    it('sums byProvider.estCost across days in the given month only', () => {
        const ledger = {
            entries: [],
            days: {
                '2026-09-01': { date: '2026-09-01', calls: 1, estIn: 0, estOut: 0, estCost: 1, byProvider: { openai: { calls: 1, estCost: 1 } } },
                '2026-09-15': { date: '2026-09-15', calls: 1, estIn: 0, estOut: 0, estCost: 2, byProvider: { openai: { calls: 1, estCost: 2 }, anthropic: { calls: 1, estCost: 3 } } },
                '2026-08-30': { date: '2026-08-30', calls: 1, estIn: 0, estOut: 0, estCost: 99, byProvider: { openai: { calls: 1, estCost: 99 } } },
            },
        };
        expect(estimatedForMonth(ledger, '2026-09')).toEqual({ openai: 3, anthropic: 3 });
    });
});

describe('BillingPanel', () => {
    it('renders nothing for a non-god viewer, and never calls useBilling with isGod=true', () => {
        const { container } = render(<BillingPanel isGod={false} />);
        expect(container.firstChild).toBeNull();
        expect(useBillingSpy).toHaveBeenCalledWith(false, '2026-09');
    });

    it('god: loading state', () => {
        mockBilling = { data: null, loading: true, error: null };
        render(<BillingPanel isGod={true} />);
        expect(screen.getByText(/Loading billed amounts/)).toBeTruthy();
    });

    it('god: error state renders an alert, not a table', () => {
        mockBilling = { data: null, loading: false, error: 'Could not reach the billing service' };
        render(<BillingPanel isGod={true} />);
        expect(screen.getByRole('alert').textContent).toMatch(/Could not reach/);
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('god: renders billed vs estimated per provider, the difference, and status text for no-key/unavailable/error', () => {
        recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-5', promptChars: 4_000_000, responseChars: 0, userId: 'test-user' }); // lands in Sept via the fixed system time
        mockBilling = {
            data: {
                month: '2026-09',
                fetchedAt: new Date().toISOString(),
                providers: [
                    { provider: 'anthropic', status: 'ok', billedUsd: 10 },
                    { provider: 'openai', status: 'no-key', billedUsd: null },
                    { provider: 'gemini', status: 'unavailable', billedUsd: null, message: 'No per-key cost API' },
                    { provider: 'custom', status: 'error', billedUsd: null, message: 'Upstream 500' },
                ],
            },
            loading: false,
            error: null,
        };
        render(<BillingPanel isGod={true} />);
        expect(screen.getByText(/Billed amounts come from the provider/)).toBeTruthy();
        expect(screen.getByText('$10.00')).toBeTruthy(); // billed
        expect(screen.getByText('Add an admin key to compare')).toBeTruthy();
        expect(screen.getByText('No per-key cost API')).toBeTruthy();
        expect(screen.getByText('Upstream 500')).toBeTruthy();
        // billed(10) - estimated(anthropic's estCost from the recorded call) -> a +$ difference cell exists
        expect(screen.getAllByText(/^\+\$/).length).toBeGreaterThan(0);
    });

    it('god: passes the selected month through to useBilling (defaults to the current month)', () => {
        render(<BillingPanel isGod={true} />);
        expect(useBillingSpy).toHaveBeenCalledWith(true, '2026-09');
    });
});
