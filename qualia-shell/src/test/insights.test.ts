/**
 * Cycle 12 — ThoughtWeaver insights helpers (categorize / daily report /
 * weekly summary / to-do seeds / non-obvious insights).
 *
 * Pure functions with an injectable LLM dependency — tested with a stub LlmFn,
 * no React render, no real network. Covers both the LLM-happy path and the
 * graceful no-LLM / failure fallbacks. Real clock (date context passed in).
 */
import { describe, it, expect } from 'vitest';
import type { LlmFn, InsightCapture } from '../components/ThoughtWeaver/insights';
import {
    dayKey,
    weekStartOf,
    capturesForDay,
    capturesForWeek,
    categorizeCapture,
    heuristicDailySummary,
    draftDailyReport,
    draftWeeklySummary,
    heuristicTodoSeeds,
    generateTodoSeeds,
    surfaceInsights,
} from '../components/ThoughtWeaver/insights';

/** A stub LLM that returns a fixed text (or null / throws to exercise fallbacks). */
function stubLlm(text: string): LlmFn {
    return async () => ({ text, provider: 'anthropic', model: 'stub' });
}
const nullLlm: LlmFn = async () => null;
const throwingLlm: LlmFn = async () => { throw new Error('network'); };

function cap(id: string, text: string, filed_to: string, createdAt: string): InsightCapture {
    return { id, text, filed_to, createdAt, destination_name: null };
}

const DAY1 = '2026-05-28T09:00:00.000Z';
const DAY1b = '2026-05-28T18:00:00.000Z';
const DAY2 = '2026-05-29T09:00:00.000Z';

describe('insights — date helpers', () => {
    it('dayKey slices YYYY-MM-DD', () => {
        expect(dayKey('2026-05-28T18:00:00.000Z')).toBe('2026-05-28');
        expect(dayKey('')).toBe('');
    });

    it('weekStartOf returns the Monday anchor', () => {
        // 2026-05-28 is a Thursday → Monday is 2026-05-25.
        expect(weekStartOf('2026-05-28')).toBe('2026-05-25');
        // 2026-05-25 is itself a Monday.
        expect(weekStartOf('2026-05-25')).toBe('2026-05-25');
        // 2026-05-24 is a Sunday → previous Monday 2026-05-18.
        expect(weekStartOf('2026-05-24')).toBe('2026-05-18');
    });

    it('capturesForDay / capturesForWeek partition by date', () => {
        const list = [cap('1', 'a', 'admin', DAY1), cap('2', 'b', 'ideas', DAY1b), cap('3', 'c', 'admin', DAY2)];
        expect(capturesForDay(list, '2026-05-28').map(c => c.id)).toEqual(['1', '2']);
        // All three fall in the same Mon-anchored week (2026-05-25).
        expect(capturesForWeek(list, '2026-05-25').map(c => c.id)).toEqual(['1', '2', '3']);
    });
});

describe('insights — categorizeCapture', () => {
    it('parses a clean JSON response', async () => {
        const llm = stubLlm('{"filed_to":"projects","confidence":0.9,"destination_name":"Launch plan"}');
        const r = await categorizeCapture('Ship the launch', llm);
        expect(r).toEqual({ filed_to: 'projects', confidence: 0.9, destination_name: 'Launch plan' });
    });

    it('extracts JSON wrapped in prose', async () => {
        const llm = stubLlm('Here you go: {"filed_to":"admin","confidence":0.7,"destination_name":"Pay rent"} done');
        const r = await categorizeCapture('pay rent', llm);
        expect(r?.filed_to).toBe('admin');
    });

    it('clamps confidence and falls back to needs_review on a bad bucket', async () => {
        const llm = stubLlm('{"filed_to":"garbage","confidence":5,"destination_name":""}');
        const r = await categorizeCapture('???', llm);
        expect(r?.filed_to).toBe('needs_review');
        expect(r?.confidence).toBe(1);
        expect(r?.destination_name).toBeNull();
    });

    it('returns null with no LLM or on failure', async () => {
        expect(await categorizeCapture('x', nullLlm)).toBeNull();
        expect(await categorizeCapture('x', throwingLlm)).toBeNull();
        expect(await categorizeCapture('x', stubLlm('not json'))).toBeNull();
    });
});

describe('insights — daily / weekly report', () => {
    const captures = [cap('1', 'Met Sarah', 'people', DAY1), cap('2', 'Fix the build', 'admin', DAY1)];

    it('heuristicDailySummary describes counts + buckets', () => {
        expect(heuristicDailySummary([])).toBe('No thoughts captured.');
        const s = heuristicDailySummary(captures);
        expect(s).toContain('2 thoughts captured');
        expect(s).toMatch(/people|admin/);
    });

    it('draftDailyReport uses the LLM text when available', async () => {
        const s = await draftDailyReport(captures, 'May 28', stubLlm('A focused day on the build and people.'));
        expect(s).toBe('A focused day on the build and people.');
    });

    it('draftDailyReport falls back to heuristic on null/throw', async () => {
        expect(await draftDailyReport(captures, 'May 28', nullLlm)).toContain('2 thoughts captured');
        expect(await draftDailyReport(captures, 'May 28', throwingLlm)).toContain('2 thoughts captured');
    });

    it('draftDailyReport short-circuits on empty captures', async () => {
        expect(await draftDailyReport([], 'May 28', stubLlm('ignored'))).toBe('No thoughts captured on this day.');
    });

    it('draftWeeklySummary uses LLM text / falls back', async () => {
        expect(await draftWeeklySummary(captures, 'week of May 25', stubLlm('Solid week.'))).toBe('Solid week.');
        expect(await draftWeeklySummary([], 'week', stubLlm('x'))).toBe('No thoughts captured this week.');
    });
});

describe('insights — to-do seeds', () => {
    const captures = [
        cap('1', 'Random musing about clouds', 'ideas', DAY1),
        cap('2', 'Email the accountant', 'admin', DAY1),
        cap('3', 'Call mom this weekend', 'people', DAY1),
    ];

    it('heuristicTodoSeeds picks admin + action-verb captures', () => {
        const seeds = heuristicTodoSeeds(captures);
        const texts = seeds.map(s => s.text);
        expect(texts).toContain('Email the accountant');   // admin
        expect(texts).toContain('Call mom this weekend');  // action verb "call"
        expect(texts).not.toContain('Random musing about clouds');
        const admin = seeds.find(s => s.text === 'Email the accountant');
        expect(admin?.priority).toBe('medium');
        expect(admin?.sourceCaptureId).toBe('2');
    });

    it('generateTodoSeeds parses an LLM array and validates sourceId', async () => {
        const llm = stubLlm(JSON.stringify([
            { text: 'Email the accountant about Q2', sourceId: '2', priority: 'high' },
            { text: 'Orphan task', sourceId: 'nonexistent', priority: 'weird' },
        ]));
        const seeds = await generateTodoSeeds(captures, llm);
        expect(seeds).toHaveLength(2);
        expect(seeds[0]).toEqual({ text: 'Email the accountant about Q2', sourceCaptureId: '2', priority: 'high' });
        // bad sourceId → null; bad priority → medium
        expect(seeds[1].sourceCaptureId).toBeNull();
        expect(seeds[1].priority).toBe('medium');
    });

    it('generateTodoSeeds falls back to heuristic on null/throw/non-array', async () => {
        const h = heuristicTodoSeeds(captures).map(s => s.text).sort();
        expect((await generateTodoSeeds(captures, nullLlm)).map(s => s.text).sort()).toEqual(h);
        expect((await generateTodoSeeds(captures, throwingLlm)).map(s => s.text).sort()).toEqual(h);
        expect((await generateTodoSeeds(captures, stubLlm('{"not":"array"}'))).map(s => s.text).sort()).toEqual(h);
    });

    it('generateTodoSeeds returns [] for no captures', async () => {
        expect(await generateTodoSeeds([], stubLlm('[]'))).toEqual([]);
    });
});

describe('insights — surfaceInsights', () => {
    const captures = [
        cap('1', 'Worried about the launch', 'projects', DAY1),
        cap('2', 'Launch keeps slipping', 'projects', DAY1b),
        cap('3', 'Skipped the gym again', 'admin', DAY2),
    ];

    it('returns [] without an LLM (no honest heuristic for non-obvious)', async () => {
        expect(await surfaceInsights(captures, nullLlm)).toEqual([]);
        expect(await surfaceInsights(captures, throwingLlm)).toEqual([]);
    });

    it('returns [] with fewer than 3 captures', async () => {
        expect(await surfaceInsights(captures.slice(0, 2), stubLlm('[]'))).toEqual([]);
    });

    it('parses an LLM insight array and normalizes kind', async () => {
        const llm = stubLlm(JSON.stringify([
            { text: 'The launch anxiety correlates with skipped self-care', kind: 'connection' },
            { text: 'Consider a fixed launch date', kind: 'suggestion' },
            { text: 'You mention the launch most mornings', kind: 'weird-kind' },
        ]));
        const out = await surfaceInsights(captures, llm);
        expect(out).toHaveLength(3);
        expect(out[0].kind).toBe('connection');
        expect(out[1].kind).toBe('suggestion');
        expect(out[2].kind).toBe('pattern');  // normalized fallback
    });

    it('returns [] when the LLM finds nothing or returns junk', async () => {
        expect(await surfaceInsights(captures, stubLlm('[]'))).toEqual([]);
        expect(await surfaceInsights(captures, stubLlm('no json here'))).toEqual([]);
    });
});
