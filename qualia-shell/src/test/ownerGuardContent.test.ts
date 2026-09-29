/**
 * Owner-race guard — content-level check on a real async write site
 * (ThoughtWeaver's reportEngine.generateReports), not just the captureOwner
 * primitive itself (see ownerGuard.test.ts). Mocks the LLM with a deferred
 * promise so the account can switch mid-await, then asserts the store write
 * (the injected ReportSink) is dropped rather than landing under the new
 * account.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { generateReports } from '../components/ThoughtWeaver/reportEngine';
import type { ReportSink, GenerateContext } from '../components/ThoughtWeaver/reportEngine';
import type { LlmFn } from '../components/ThoughtWeaver/insights';

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

function makeSink() {
    const daily: unknown[] = [];
    const sink: ReportSink = {
        addDailyReport: (...args) => { daily.push(args); },
        addWeeklySummary: () => {},
        setInsights: () => {},
        syncTodos: () => 0,
    };
    return { sink, daily };
}

function ctx(llm: LlmFn): GenerateContext {
    return {
        captures: [{ id: 'c1', text: 'met with sam', filed_to: 'people', createdAt: '2026-05-28T10:00:00.000Z', destination_name: null }],
        today: '2026-05-28',
        nowIso: '2026-05-28T20:00:00.000Z',
        llm,
    };
}

describe('owner-race guard — reportEngine.generateReports', () => {
    beforeEach(() => setPerUserIdentity(null));

    it('control: no account switch → the daily report write happens', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<{ text: string; provider: string; model: string } | null>();
        const { sink, daily } = makeSink();
        const p = generateReports(ctx(async () => d.promise as unknown as Awaited<ReturnType<LlmFn>>), sink, { daily: true });
        d.resolve({ text: 'a daily summary', provider: 'anthropic', model: 'stub' });
        await p;
        expect(daily.length).toBe(1);
    });

    it('account switches mid-await (A → null → B) → the write is dropped, B\'s sink stays untouched', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<{ text: string; provider: string; model: string } | null>();
        const { sink, daily } = makeSink();
        const p = generateReports(ctx(async () => d.promise as unknown as Awaited<ReturnType<LlmFn>>), sink, { daily: true });
        setPerUserIdentity(null);      // logout render mid-await
        setPerUserIdentity('user-b');  // login render mid-await
        d.resolve({ text: 'a daily summary', provider: 'anthropic', model: 'stub' });
        const result = await p;
        expect(daily.length).toBe(0);
        expect(result.ranDaily).toBe(false);
    });
});
