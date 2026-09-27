/**
 * SpendBreakdown — plan 068 Phase 2 (F2). Ledger fixture is built directly
 * (no store needed) and passed as the `ledger` prop per the frozen contract:
 * `export default function SpendBreakdown(props: { ledger: UsageLedger })`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import SpendBreakdown from '../components/AiSpend/SpendBreakdown';
import type { UsageEntry, DailyRollup, UsageLedger } from '../lib/llmUsageStore';

vi.mock('../lib/spendExport', async () => {
    const actual = await vi.importActual<typeof import('../lib/spendExport')>('../lib/spendExport');
    return { ...actual, downloadCsv: vi.fn() };
});
import { downloadCsv } from '../lib/spendExport';

function dateNDaysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tsAt(dateStr: string): number {
    return new Date(`${dateStr}T12:00:00`).getTime();
}

/** Builds a ledger with one priced + one unpriced call on `date`, for model+source. */
function dayEntries(date: string, model: string, source: string): UsageEntry[] {
    return [
        { ts: tsAt(date), provider: 'anthropic' as UsageEntry['provider'], model, estIn: 100, estOut: 50, estCost: 0.01, measured: true, source },
        { ts: tsAt(date), provider: 'anthropic' as UsageEntry['provider'], model, estIn: 100, estOut: 50, estCost: null, measured: false, source },
    ];
}

function rollupFor(date: string, model: string, source: string): DailyRollup {
    return {
        date,
        calls: 2,
        estIn: 200,
        estOut: 100,
        estCost: 0.01,
        byProvider: { anthropic: { calls: 2, estCost: 0.01 } },
        unpriced: 1,
        measuredCalls: 1,
        byModel: { [model]: { calls: 2, estCost: 0.01 } },
        bySource: { [source]: { calls: 2, estCost: 0.01 } },
    };
}

/** In-range (last 3 days) + out-of-range (35 days ago) so 7-day and 30-day totals differ. */
function buildLedger(): UsageLedger {
    const recentDate = dateNDaysAgo(1);
    const oldDate = dateNDaysAgo(20);
    return {
        entries: [...dayEntries(recentDate, 'claude-sonnet-5', 'ara'), ...dayEntries(oldDate, 'gpt-4.1-mini', 'research')],
        days: {
            [recentDate]: rollupFor(recentDate, 'claude-sonnet-5', 'ara'),
            [oldDate]: rollupFor(oldDate, 'gpt-4.1-mini', 'research'),
        },
    };
}

describe('SpendBreakdown', () => {
    it('renders the By-model table by default with the unpriced row text', () => {
        render(<SpendBreakdown ledger={buildLedger()} />);
        expect(screen.getByRole('tab', { name: 'By model' })).toHaveAttribute('aria-selected', 'true');
        const row = screen.getByText('claude-sonnet-5').closest('tr')!;
        expect(within(row).getByText('$0.0100 + 1 unpriced')).toBeInTheDocument();
    });

    it('switches to By feature on click and shows friendly source labels', () => {
        render(<SpendBreakdown ledger={buildLedger()} />);
        fireEvent.click(screen.getByRole('tab', { name: 'By feature' }));
        expect(screen.getByRole('tab', { name: 'By feature' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('ARA')).toBeInTheDocument();
    });

    it('switches tabs with ArrowRight and roves tabindex', () => {
        render(<SpendBreakdown ledger={buildLedger()} />);
        const modelTab = screen.getByRole('tab', { name: 'By model' });
        const featureTab = screen.getByRole('tab', { name: 'By feature' });
        expect(modelTab).toHaveAttribute('tabindex', '0');
        expect(featureTab).toHaveAttribute('tabindex', '-1');
        fireEvent.keyDown(modelTab, { key: 'ArrowRight' });
        expect(featureTab).toHaveAttribute('aria-selected', 'true');
        expect(featureTab).toHaveAttribute('tabindex', '0');
        expect(modelTab).toHaveAttribute('tabindex', '-1');
    });

    it('changes totals when toggling between 7 and 30 days', () => {
        render(<SpendBreakdown ledger={buildLedger()} />);
        // 7 days (default): only the recent entry's model is in range.
        expect(screen.getByText('claude-sonnet-5')).toBeInTheDocument();
        expect(screen.queryByText('gpt-4.1-mini')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '30 days' }));
        expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('gpt-4.1-mini')).toBeInTheDocument();
    });

    it('shows the empty state when there are no calls in range', () => {
        render(<SpendBreakdown ledger={{ entries: [], days: {} }} />);
        expect(screen.getByText('No calls in this range.')).toBeInTheDocument();
    });

    it('calls downloadCsv with entriesToCsv output when Export CSV is clicked', () => {
        const ledger = buildLedger();
        render(<SpendBreakdown ledger={ledger} />);
        fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
        expect(downloadCsv).toHaveBeenCalledTimes(1);
        const [filename, csv] = (downloadCsv as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(filename).toMatch(/^ai-spend-\d{4}-\d{2}-\d{2}\.csv$/);
        expect(csv.split('\r\n')[0]).toBe('timestamp,date,provider,model,source,input_tokens,output_tokens,measured,cost_usd');
    });

    it('shows the "last 1,000 calls" export caption', () => {
        render(<SpendBreakdown ledger={buildLedger()} />);
        expect(screen.getByText('last 1,000 calls')).toBeInTheDocument();
    });
});
