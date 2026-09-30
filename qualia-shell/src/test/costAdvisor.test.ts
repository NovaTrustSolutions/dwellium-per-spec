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
    advisorCandidates,
    measuredHermesTaskCost,
    pickHermesPersona,
    type AdvisorTask,
} from '../lib/costAdvisor';
import { HERMES_PERSONA_IDS } from '../lib/agents/personas';
import type { PersonaWorkState, PersonaTask } from '../lib/agents/personaWorkStore';
import type { UsageLedger, UsageEntry } from '../lib/llmUsageStore';
import type { TodoItem } from '../components/ThoughtWeaver/todoStore';
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

function task(id: string, title: string): AdvisorTask {
    return { id, title };
}

function todo(id: string, text: string, overrides: Partial<TodoItem> = {}): TodoItem {
    return {
        id,
        text,
        sourceCaptureId: null,
        priority: 'medium',
        done: false,
        createdAt: new Date(0).toISOString(),
        completedAt: null,
        ...overrides,
    };
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

    it('defaults aiCostSource to "benchmark" with the benchmark aiCostUsd', () => {
        const r = evaluateTask(task('t1', 'Write a blog post'), 100);
        expect(r!.aiCostSource).toBe('benchmark');
        expect(r!.aiCostUsd).toBe(CATEGORY_BENCHMARKS.writing.aiCostUsd);
        expect(r!.message).toContain('(benchmark)');
    });

    it('aiCostOverrideUsd replaces the benchmark AI cost and marks the source "measured"', () => {
        // Benchmark AI cost for writing is $0.20; override to something that
        // still beats manual cost but differs from the benchmark and can flip
        // which option is cheapest vs. outsourcing.
        const r = evaluateTask(task('t1', 'Write a blog post'), 100, { aiCostOverrideUsd: 5 });
        expect(r).not.toBeNull();
        expect(r!.aiCostSource).toBe('measured');
        expect(r!.aiCostUsd).toBe(5);
        expect(r!.cheapest).toBe('ai'); // still cheaper than the $35/hr outsource (60min => $35)
        expect(r!.message).toContain('measured per Hermes task');
        expect(r!.message).not.toContain('(benchmark)');
    });

    it('aiCostOverrideUsd can change the cheapest option when it is pricier than outsourcing', () => {
        // Outsource cost for writing at 60min/$35/hr = $35. Override AI above that.
        const r = evaluateTask(task('t1', 'Write a blog post'), 100, { aiCostOverrideUsd: 50 });
        expect(r).not.toBeNull();
        expect(r!.cheapest).toBe('outsource');
        expect(r!.aiCostSource).toBe('measured'); // still reports measured even though outsource won
    });

    it('aiCostOverrideUsd is ignored for non-AI-capable categories (aiCostUsd stays null)', () => {
        const r = evaluateTask(task('t1', 'Design a marketing banner'), 100, { aiCostOverrideUsd: 1 });
        expect(r!.aiCostUsd).toBeNull();
        expect(r!.cheapest).toBe('outsource');
    });
});

describe('evaluateTasks', () => {
    const tasks: AdvisorTask[] = [
        task('t1', 'Write a blog post'),
        task('t2', 'Design a new logo'),
        task('t4', 'Schedule the client call'),
    ];

    it('evaluates all given tasks, sorted by savings desc', () => {
        const recs = evaluateTasks(tasks, 100);
        const ids = recs.map(r => r.taskId);
        expect(ids).toContain('t1');
        expect(ids).toContain('t2');
        expect(ids).toContain('t4');
        for (let i = 1; i < recs.length; i++) {
            expect(recs[i - 1].savingsUsd).toBeGreaterThanOrEqual(recs[i].savingsUsd);
        }
    });

    it('honors the max cap', () => {
        expect(evaluateTasks(tasks, 100, { max: 1 })).toHaveLength(1);
    });

    it('handles an empty array', () => {
        expect(evaluateTasks([], 100)).toEqual([]);
    });

    it('costAdvisoryLines returns the top messages; totalSavings sums them', () => {
        const lines = costAdvisoryLines(tasks, 100, 3);
        expect(lines.length).toBeGreaterThan(0);
        expect(lines[0]).toMatch(/saving/i);
        const total = totalSavings(evaluateTasks(tasks, 100));
        expect(total).toBeGreaterThan(0);
    });

    it('applies aiCostOverrideUsd across every task', () => {
        const recs = evaluateTasks(tasks, 100, { aiCostOverrideUsd: 5 });
        const writing = recs.find(r => r.taskId === 't1');
        expect(writing?.aiCostSource).toBe('measured');
        expect(writing?.aiCostUsd).toBe(5);
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
    const designTasks: AdvisorTask[] = [task('t1', 'Design a marketing banner')];

    it('buildLiveRatePrompt lists each flagged task by id/category/role and asks for JSON — never the verbatim title (E6 privacy)', () => {
        const items = liveRateRequestItems(evaluateTasks(designTasks, 100));
        expect(items).toHaveLength(1);
        expect(items[0]).not.toHaveProperty('title');
        const prompt = buildLiveRatePrompt(items);
        expect(prompt).not.toContain('Design a marketing banner');
        expect(prompt).toContain('t1');
        expect(prompt).toContain(items[0].category);
        expect(prompt).toContain(items[0].role);
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
        const recs = evaluateTasks(designTasks, 100, { rateOverrides: { t1: 80 } });
        expect(recs).toHaveLength(1);
        expect(recs[0].rateSource).toBe('live');
        expect(recs[0].onlineRatePerHour).toBe(80);
        expect(recs[0].outsourceCostUsd).toBe(120); // 1.5h × $80
        expect(recs[0].message).toContain('current');
    });

    it('without an override the rate source is benchmark (no "current")', () => {
        const recs = evaluateTasks(designTasks, 100);
        expect(recs[0].rateSource).toBe('benchmark');
        expect(recs[0].message).not.toContain('current');
    });
});

describe('advisorCandidates', () => {
    const now = 1_700_000_000_000;

    it('excludes done, dismissed, currently-snoozed and delegated to-dos', () => {
        const todos: TodoItem[] = [
            todo('a', 'Write the newsletter'),
            todo('b', 'Done already', { done: true }),
            todo('c', 'Dismissed', { advisor: { dismissed: true } }),
            todo('d', 'Snoozed into the future', { advisor: { snoozedUntil: now + 1000 } }),
            todo('e', 'Delegated', { advisor: { delegatedTo: { personaId: 'hermes-mercury', taskId: 'x', at: new Date(now).toISOString() } } }),
        ];
        const ids = advisorCandidates(todos, now).map(t => t.id);
        expect(ids).toEqual(['a']);
    });

    it('includes a to-do whose snooze already expired', () => {
        const todos: TodoItem[] = [todo('a', 'Snoozed into the past', { advisor: { snoozedUntil: now - 1000 } })];
        expect(advisorCandidates(todos, now).map(t => t.id)).toEqual(['a']);
    });

    it('maps text to title', () => {
        const todos: TodoItem[] = [todo('a', 'Call the electrician')];
        expect(advisorCandidates(todos, now)).toEqual([{ id: 'a', title: 'Call the electrician' }]);
    });

    it('mutation check: dropping the dismissed filter would let dismissed to-dos through', () => {
        const todos: TodoItem[] = [todo('c', 'Dismissed', { advisor: { dismissed: true } })];
        // sanity: with the real filter it's excluded (this is the behavior under test)
        expect(advisorCandidates(todos, now)).toEqual([]);
    });
});

describe('pickHermesPersona', () => {
    const categories = Object.keys(CATEGORY_BENCHMARKS) as Array<keyof typeof CATEGORY_BENCHMARKS>;

    it('always returns a HERMES_PERSONA_IDS member for every known category', () => {
        for (const c of categories) {
            expect(HERMES_PERSONA_IDS).toContain(pickHermesPersona(c));
        }
    });

    it('falls back to a Hermes persona even for an unmodeled category value', () => {
        expect(HERMES_PERSONA_IDS).toContain(pickHermesPersona('not-a-real-category' as any));
    });
});

describe('measuredHermesTaskCost', () => {
    const now = 1_700_000_000_000;
    const DAY = 86_400_000;

    function ledgerWithHermesSpend(entries: Array<Partial<UsageEntry>>): UsageLedger {
        return {
            entries: entries.map((e, i) => ({
                ts: now,
                provider: 'anthropic',
                model: 'x',
                estIn: 0,
                estOut: 0,
                estCost: 0.5,
                measured: true,
                source: 'hermes',
                ...e,
            })) as UsageEntry[],
            days: {},
        };
    }

    function workWithCompleted(count: number, completedAt: number = now): PersonaWorkState {
        const personaId = HERMES_PERSONA_IDS[0];
        const tasks: PersonaTask[] = Array.from({ length: count }, (_, i) => ({
            id: `t${i}`,
            title: `task ${i}`,
            status: 'done',
            assignedBy: 'user',
            createdAt: completedAt - 1000,
            completedAt,
        }));
        return { [personaId]: { memory: [], audit: [], usageCount: 0, tasks } };
    }

    it('returns null when fewer than 5 Hermes tasks completed in the window', () => {
        const ledger = ledgerWithHermesSpend([{ estCost: 1 }, { estCost: 1 }]);
        expect(measuredHermesTaskCost(ledger, workWithCompleted(4), now)).toBeNull();
    });

    it('returns a per-task average at exactly 5 completed tasks', () => {
        const ledger = ledgerWithHermesSpend([{ estCost: 5 }]);
        const result = measuredHermesTaskCost(ledger, workWithCompleted(5), now);
        expect(result).toEqual({ perTaskUsd: 1, samples: 5 });
    });

    it('excludes completions and spend outside the 30-day window', () => {
        const ledger = ledgerWithHermesSpend([
            { estCost: 5, ts: now },
            { estCost: 999, ts: now - 31 * DAY }, // outside window — excluded
        ]);
        const work = workWithCompleted(5, now);
        // add a 6th completed task just outside the window — must not count
        work[HERMES_PERSONA_IDS[0]].tasks.push({
            id: 'old', title: 'old', status: 'done', assignedBy: 'user',
            createdAt: now - 32 * DAY, completedAt: now - 31 * DAY,
        });
        const result = measuredHermesTaskCost(ledger, work, now);
        expect(result).toEqual({ perTaskUsd: 1, samples: 5 });
    });

    it('a completion exactly at the 30-day boundary still counts', () => {
        const ledger = ledgerWithHermesSpend([{ estCost: 5, ts: now - 30 * DAY }]);
        const result = measuredHermesTaskCost(ledger, workWithCompleted(5, now - 30 * DAY), now);
        expect(result).toEqual({ perTaskUsd: 1, samples: 5 });
    });

    it('excludes non-hermes sources and null-cost entries from spend', () => {
        const ledger = ledgerWithHermesSpend([
            { estCost: 5 },
            { estCost: 999, source: 'ara' }, // wrong source — excluded
            { estCost: null }, // unpriced — excluded
        ]);
        const result = measuredHermesTaskCost(ledger, workWithCompleted(5), now);
        expect(result).toEqual({ perTaskUsd: 1, samples: 5 });
    });

    it('handles null/undefined ledger and work', () => {
        expect(measuredHermesTaskCost(null, null, now)).toBeNull();
        expect(measuredHermesTaskCost(undefined, undefined, now)).toBeNull();
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
