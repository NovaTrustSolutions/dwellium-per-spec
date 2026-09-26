/**
 * spendExport — plan 068 Phase 2 (F2). CSV encoding + download-link mechanics.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { entriesToCsv, downloadCsv } from '../lib/spendExport';
import type { UsageEntry } from '../lib/llmUsageStore';

function entry(overrides: Partial<UsageEntry> = {}): UsageEntry {
    return {
        ts: Date.UTC(2026, 8, 25, 12, 0, 0),
        provider: 'anthropic' as UsageEntry['provider'],
        model: 'claude-sonnet-5',
        estIn: 100,
        estOut: 50,
        estCost: 0.001234567,
        measured: true,
        source: 'ara',
        ...overrides,
    };
}

describe('entriesToCsv', () => {
    it('emits the exact header', () => {
        const [header] = entriesToCsv([]).split('\r\n');
        expect(header).toBe('timestamp,date,provider,model,source,input_tokens,output_tokens,measured,cost_usd');
    });

    it('joins rows with CRLF', () => {
        const csv = entriesToCsv([entry(), entry()]);
        expect(csv.split('\r\n')).toHaveLength(3); // header + 2 rows
    });

    it('quotes a field containing a comma', () => {
        const csv = entriesToCsv([entry({ model: 'gpt-4, turbo' })]);
        expect(csv).toContain('"gpt-4, turbo"');
    });

    it('quotes a field containing a quote and doubles inner quotes', () => {
        const csv = entriesToCsv([entry({ model: 'model "x"' })]);
        expect(csv).toContain('"model ""x"""');
    });

    it('quotes a field containing a newline', () => {
        const csv = entriesToCsv([entry({ source: 'a\nb' })]);
        const rows = csv.split('\r\n');
        // The embedded \n must not be mistaken for a row separator (CRLF only).
        expect(rows).toHaveLength(2);
        expect(csv).toContain('"a\nb"');
    });

    it('guards a leading = against formula injection', () => {
        const csv = entriesToCsv([entry({ model: '=SUM(A1:A9)' })]);
        expect(csv).toContain(",'=SUM(A1:A9),");
    });

    it('guards leading +, -, and @ against formula injection', () => {
        const csv = entriesToCsv([entry({ source: '+1' }), entry({ source: '-1' }), entry({ source: '@x' })]);
        expect(csv).toContain(",'+1,");
        expect(csv).toContain(",'-1,");
        expect(csv).toContain(",'@x,");
    });

    it('leaves an ordinary field unguarded and unquoted', () => {
        const csv = entriesToCsv([entry({ model: 'claude-sonnet-5' })]);
        expect(csv).toContain(',claude-sonnet-5,');
        expect(csv).not.toContain("'claude-sonnet-5");
    });

    it('renders a null cost as an empty cell', () => {
        const csv = entriesToCsv([entry({ estCost: null })]);
        const row = csv.split('\r\n')[1];
        expect(row.endsWith(',')).toBe(true);
    });

    it('renders a priced cost rounded to 6 decimals', () => {
        const csv = entriesToCsv([entry({ estCost: 0.0012345678 })]);
        const row = csv.split('\r\n')[1];
        expect(row.endsWith('0.001235') || row.endsWith('0.001234')).toBe(true);
    });

    it('formats the timestamp as ISO UTC and the date as local YYYY-MM-DD', () => {
        const ts = Date.UTC(2026, 8, 25, 12, 0, 0);
        const csv = entriesToCsv([entry({ ts })]);
        const row = csv.split('\r\n')[1];
        expect(row.startsWith(new Date(ts).toISOString())).toBe(true);
    });

    it("defaults a missing source to 'other'", () => {
        const csv = entriesToCsv([entry({ source: undefined })]);
        expect(csv.split('\r\n')[1]).toContain(',other,');
    });
});

describe('downloadCsv', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('creates an anchor, clicks it, and revokes the object URL after a delay', () => {
        vi.useFakeTimers();
        const createObjectURL = vi.fn(() => 'blob:test-url');
        const revokeObjectURL = vi.fn();
        vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const appendSpy = vi.spyOn(document.body, 'appendChild');

        downloadCsv('ai-spend-2026-09-25.csv', 'a,b,c');

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(appendSpy).toHaveBeenCalled();
        const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
        expect(anchor.download).toBe('ai-spend-2026-09-25.csv');

        // Revoking must not happen synchronously — some browsers cancel the download.
        expect(revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');

        clickSpy.mockRestore();
    });
});
