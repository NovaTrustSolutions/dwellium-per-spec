/**
 * araDailyGlance — plan 046 A2 "Today at a glance". Real-data assembler +
 * once-per-day throttle (written AFTER a successful post).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

const strataGetMock = vi.fn();
vi.mock('../components/StrataDashboard/strataApi', () => ({
    strataGet: (...args: any[]) => strataGetMock(...args),
}));

import { assembleGlance, runDailyGlance, araGlanceStore, resetAraGlance } from '../lib/araDailyGlance';
import { addCard, resetTaskBoard } from '../components/TaskBoard/taskBoardStore';
import { createGoal, resetGoals } from '../lib/goalsStore';
import { upsertBrief, resetMorningBriefs } from '../lib/morningBriefStore';
import { dayKey } from '../lib/dailySynthesis';

const fetchMock = vi.fn();

function seedStrata(opts: { alerts?: Array<{ message: string }>; workitems?: Array<{ status: string; priority: string }> } = {}) {
    strataGetMock.mockImplementation(async (path: string) => {
        if (path === '/leasing/alerts') return { alerts: opts.alerts ?? [] };
        if (path === '/workitems') return opts.workitems ?? [];
        throw new Error(`unexpected ${path}`);
    });
}

describe('assembleGlance', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockResolvedValue({ json: async () => ({ success: true, data: { pending: 0 } }) });
        strataGetMock.mockReset();
        seedStrata();
        resetTaskBoard();
        resetGoals();
        resetMorningBriefs();
        localStorage.clear();
    });
    afterEach(() => vi.unstubAllGlobals());

    it('builds the first 3 lines in priority order with the exact heading', async () => {
        seedStrata({
            alerts: [{ message: 'Unit 4B lease expired' }, { message: 'Unit 2A expiring in 30 days' }, { message: 'x' }],
            workitems: [
                { status: 'open', priority: 'high' }, { status: 'pending', priority: 'critical' },
                { status: 'done', priority: 'high' }, { status: 'open', priority: 'low' },
            ],
        });
        fetchMock.mockResolvedValue({ json: async () => ({ success: true, data: { pending: 2 } }) });
        addCard({ title: 'Call vendor', urgency: 'high' });
        createGoal('Raise NOI');
        const text = await assembleGlance();
        expect(text).toBe(
            '**Today at a glance — 3 things worth doing**\n' +
            '1. 3 leases need attention — Unit 4B lease expired; Unit 2A expiring in 30 days\n' +
            '2. 2 high-priority work orders open\n' +
            '3. 2 inbox items waiting for approval\n\n' +
            'Ask me about any of these, or pick a prompt below.',
        );
    });

    it('returns null with no data at all', async () => {
        expect(await assembleGlance()).toBeNull();
    });

    it('one source throwing → the others are still assembled (singular forms)', async () => {
        strataGetMock.mockRejectedValue(new Error('boom'));
        fetchMock.mockRejectedValue(new Error('offline'));
        addCard({ title: 'Only task' });
        createGoal('Only goal');
        upsertBrief({ date: dayKey(), insights: [], suggestions: ['Review the roof bid'], dataLines: [] });
        expect(await assembleGlance()).toBe(
            '**Today at a glance — 3 things worth doing**\n' +
            '1. 1 task not done — 0 high urgency\n' +
            '2. 1 active goal: Only goal\n' +
            '3. Review the roof bid\n\n' +
            'Ask me about any of these, or pick a prompt below.',
        );
    });

    it('a single line uses "1 thing"', async () => {
        createGoal('Solo');
        expect(await assembleGlance()).toMatch(/^\*\*Today at a glance — 1 thing worth doing\*\*\n1\. 1 active goal: Solo\n\n/);
    });
});

describe('runDailyGlance (once per dayKey, throttle written after post)', () => {
    beforeEach(() => {
        resetAraGlance();
        localStorage.clear();
        vi.useRealTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('posts once per day; silent (no post, no throttle) when the assembler returns null', async () => {
        const post = vi.fn();
        expect(await runDailyGlance('u1', post, async () => null)).toBe(false);
        expect(post).not.toHaveBeenCalled();
        expect(araGlanceStore.getSnapshot().lastShownDay).toBeNull();

        expect(await runDailyGlance('u1', post, async () => 'GLANCE')).toBe(true);
        expect(post).toHaveBeenCalledTimes(1);
        expect(post).toHaveBeenCalledWith('GLANCE');
        expect(araGlanceStore.getSnapshot().lastShownDay).toBe(dayKey());

        // Same day → throttled even though the assembler has data.
        expect(await runDailyGlance('u1', post, async () => 'GLANCE AGAIN')).toBe(false);
        expect(post).toHaveBeenCalledTimes(1);
    });

    it('posts again on the next calendar day', async () => {
        const post = vi.fn();
        vi.setSystemTime(new Date('2026-08-19T10:00:00'));
        expect(await runDailyGlance('u1', post, async () => 'A')).toBe(true);
        vi.setSystemTime(new Date('2026-08-20T10:00:00'));
        expect(await runDailyGlance('u1', post, async () => 'B')).toBe(true);
        expect(post.mock.calls.map(c => c[0])).toEqual(['A', 'B']);
    });

    it('a throwing assembler leaves the throttle unset so the next open retries', async () => {
        const post = vi.fn();
        expect(await runDailyGlance('u1', post, async () => { throw new Error('net'); })).toBe(false);
        expect(post).not.toHaveBeenCalled();
        expect(araGlanceStore.getSnapshot().lastShownDay).toBeNull();
    });
});
