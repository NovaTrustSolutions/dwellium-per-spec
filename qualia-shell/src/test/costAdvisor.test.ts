/**
 * costAdvisor + costKpiStore — "is this worth your time?" engine.
 *
 * The KPI is the user's $/hour. A task is flagged when AI automation or online
 * outsourcing would cost less than doing it yourself at that rate.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    categorizeTask,
    evaluateTask,
    evaluateTasks,
    costAdvisoryLines,
    totalSavings,
    CATEGORY_BENCHMARKS,
    liveRateRequestItems,
    buildLiveRatePrompt,
    parseLiveRates,
} from '../lib/costAdvisor';
import type { PersonaWorkState, PersonaTask } from '../lib/agents/personaWorkStore';
import {
    costKpiStore,
    costKpiUserIdHolder,
    clampKpi,
    setCostKpi,
    getCostKpi,
    resetCostKpi,
    DEFAULT_HOURLY_KPI,
    MIN_HOURLY_KPI,
    MAX_HOURLY_KPI,
} from '../lib/costKpiStore';

function task(id: string, title: string, status: PersonaTask['status'] = 'todo'): PersonaTask {
    return { id, title, status, assignedBy: 'user', createdAt: Number(id.replace(/\D/g, '')) || 1 };
}

describe('categorizeTask', () => {
    it('maps task titles to categories by keyword', () => {
        expect(categorizeTask('Transcribe the Tuesday meeting')).toBe('transcription');
        expect(categorizeTask('Reconcile June invoices')).toBe('bookkeeping');
        expect(categorizeTask('Enter data into the spreadsheet')).toBe('data-entry');
        expect(categorizeTask('Design a new logo')).toBe('design');
        expect(categorizeTask('Fix the login bug')).toBe('dev');
        expect(categorizeTask('Schedule a dentist appointment')).toBe('scheduling');
        expect(categorizeTask('Write a blog post')).toBe('writing');
        expect(categorizeTask('Research competitor pricing')).toBe('research');
        expect(categorizeTask('Reply to the support ticket')).toBe('support');
        expect(categorizeTask('xyzzy frobnicate')).toBe('general');
        expect(categorizeTask('')).toBe('general');
    });
});

describe('evaluateTask', () => {
    it('flags AI automation as cheapest for an automatable task at a high KPI', () => {
        const r = evaluateTask(task('t1', 'Write a blog post'), 100);
        expect(r).not.toBeNull();
        expect(r!.category).toBe('writing');
        expect(r!.cheapest).toBe('ai');
        // 60 min @ $100/hr = $100 of your time
        expect(r!.manualCostUsd).toBe(100);
        expect(r!.savingsUsd).toBeGreaterThan(90);
        expect(r!.message).toContain('Write a blog post');
    });

    it('uses outsourcing (not AI) for non-automatable categories like design', () => {
        const r = evaluateTask(task('t1', 'Design a marketing banner'), 100);
        expect(r).not.toBeNull();
        expect(r!.category).toBe('design');
        expect(r!.aiCostUsd).toBeNull();
        expect(r!.cheapest).toBe('outsource');
        // 90 min @ $45/hr online = $67.50
        expect(r!.outsourceCostUsd).toBe(67.5);
    });

    it('returns null when your time is already the cheapest option', () => {
        // Design has no AI path; at $20/hr your time ($30) beats the $67.50 outsource.
        const r = evaluateTask(task('t1', 'Design a marketing banner'), 20);
        expect(r).toBeNull();
    });

    it('respects the minimum-savings threshold', () => {
        // Writing at $5/hr → manual $5, AI ~$0.20, savings ~$4.80.
        expect(evaluateTask(task('t1', 'Write a note'), 5, { minSavingsUsd: 1 })).not.toBeNull();
        expect(evaluateTask(task('t1', 'Write a note'), 5, { minSavingsUsd: 5 })).toBeNull();
    });
});

describe('evaluateTasks', () => {
    const state: PersonaWorkState = {
        scribe: {
            memory: [], audit: [], usageCount: 0,
            tasks: [
                task('t1', 'Write a blog post', 'todo'),
                task('t2', 'Design a new logo', 'running'),
                task('t3', 'Write the release notes', 'done'), // excluded: not active
            ],
        },
        mercury: {
            memory: [], audit: [], usageCount: 0,
            tasks: [task('t4', 'Schedule the client call', 'todo')],
        },
    };

    it('evaluates only active (todo/running) tasks, sorted by savings desc', () => {
        const recs = evaluateTasks(state, 100);
        const ids = recs.map(r => r.taskId);
        expect(ids).toContain('t1');
        expect(ids).toContain('t2');
        expect(ids).toContain('t4');
        expect(ids).not.toContain('t3'); // done task excluded
        // sorted by savings descending
        for (let i = 1; i < recs.length; i++) {
            expect(recs[i - 1].savingsUsd).toBeGreaterThanOrEqual(recs[i].savingsUsd);
        }
    });

    it('honors the max cap', () => {
        expect(evaluateTasks(state, 100, { max: 1 })).toHaveLength(1);
    });

    it('handles empty / null state', () => {
        expect(evaluateTasks(null, 100)).toEqual([]);
        expect(evaluateTasks({}, 100)).toEqual([]);
    });

    it('costAdvisoryLines returns the top messages; totalSavings sums them', () => {
        const lines = costAdvisoryLines(state, 100, 3);
        expect(lines.length).toBeGreaterThan(0);
        expect(lines[0]).toMatch(/saving/i);
        const total = totalSavings(evaluateTasks(state, 100));
        expect(total).toBeGreaterThan(0);
    });
});

describe('benchmark table integrity', () => {
    it('every category has sane, positive benchmarks', () => {
        for (const b of Object.values(CATEGORY_BENCHMARKS)) {
            expect(b.humanMinutes).toBeGreaterThan(0);
            expect(b.onlineRatePerHour).toBeGreaterThan(0);
            if (b.aiCapable) expect(b.aiCostUsd).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('live online rates (morning brief LLM path)', () => {
    const designState: PersonaWorkState = {
        p: { memory: [], audit: [], usageCount: 0, tasks: [task('t1', 'Design a marketing banner', 'todo')] },
    };

    it('buildLiveRatePrompt lists each flagged task and asks for JSON', () => {
        const items = liveRateRequestItems(evaluateTasks(designState, 100));
        expect(items).toHaveLength(1);
        const prompt = buildLiveRatePrompt(items);
        expect(prompt).toContain('Design a marketing banner');
        expect(prompt).toContain('t1');
        expect(prompt).toMatch(/JSON/i);
    });

    it('parseLiveRates keeps known ids, clamps to [1,500], drops junk', () => {
        const raw = 'sure! {"rates":[{"id":"t1","usdPerHour":42},{"id":"t2","usdPerHour":9999},{"id":"nope","usdPerHour":50},{"id":"t3","usdPerHour":"x"}]}';
        expect(parseLiveRates(raw, new Set(['t1', 't2', 't3']))).toEqual({ t1: 42, t2: 500 });
    });

    it('parseLiveRates returns {} on garbage', () => {
        expect(parseLiveRates('not json', new Set(['t1']))).toEqual({});
        expect(parseLiveRates(null, new Set(['t1']))).toEqual({});
        expect(parseLiveRates('{"rates":[]}', new Set(['t1']))).toEqual({});
    });

    it('a live rate override recomputes outsourcing cost and marks the source live', () => {
        const recs = evaluateTasks(designState, 100, { rateOverrides: { t1: 80 } });
        expect(recs).toHaveLength(1);
        expect(recs[0].rateSource).toBe('live');
        expect(recs[0].onlineRatePerHour).toBe(80);
        expect(recs[0].outsourceCostUsd).toBe(120); // 1.5h × $80
        expect(recs[0].message).toContain('current');
    });

    it('without an override the rate source is benchmark (no "current")', () => {
        const recs = evaluateTasks(designState, 100);
        expect(recs[0].rateSource).toBe('benchmark');
        expect(recs[0].message).not.toContain('current');
    });
});

describe('costKpiStore', () => {
    beforeEach(() => {
        costKpiUserIdHolder.current = 'test-user';
        try { localStorage.clear(); } catch { /* sandboxed */ }
        (costKpiStore as unknown as { reset?: () => void }).reset?.();
    });

    it('clamps to the [MIN, MAX] band and snaps to whole dollars', () => {
        expect(clampKpi(3)).toBe(MIN_HOURLY_KPI);
        expect(clampKpi(99999)).toBe(MAX_HOURLY_KPI);
        expect(clampKpi(50.4)).toBe(50);
        expect(clampKpi(NaN)).toBe(DEFAULT_HOURLY_KPI);
    });

    it('set/get round-trips through the store with clamping', () => {
        setCostKpi(75);
        expect(getCostKpi()).toBe(75);
        setCostKpi(1); // below min
        expect(getCostKpi()).toBe(MIN_HOURLY_KPI);
    });

    it('reset returns the default', () => {
        setCostKpi(120);
        resetCostKpi();
        expect(getCostKpi()).toBe(DEFAULT_HOURLY_KPI);
    });
});
