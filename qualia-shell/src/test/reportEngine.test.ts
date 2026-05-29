/**
 * Cycle 13 — ThoughtWeaver reportEngine (pure orchestration that turns captures
 * into persisted daily reports, weekly summaries, to-do seeds, and insights).
 *
 * The engine is pure + injectable: an `LlmFn` stub stands in for the per-user
 * LLM, a capturing `ReportSink` stub stands in for the reportStore/todoStore
 * mutators, and date context ("today"/"nowIso") is passed in — so there is no
 * React render, no localStorage, no real clock, and no fake timers (per the
 * Phase-7 React-19 scheduler anti-pattern). Assertions are fully deterministic.
 */
import { describe, it, expect } from 'vitest';
import type { LlmFn, InsightCapture } from '../components/ThoughtWeaver/insights';
import {
    isDailyReportDue,
    isWeeklyReportDue,
    generateReports,
} from '../components/ThoughtWeaver/reportEngine';
import type { ReportSink } from '../components/ThoughtWeaver/reportEngine';

/** An LLM stub returning fixed text (or null to exercise heuristic fallbacks). */
function stubLlm(text: string): LlmFn {
    return async () => ({ text, provider: 'anthropic', model: 'stub' });
}
const nullLlm: LlmFn = async () => null;

function cap(id: string, text: string, filed_to: string, createdAt: string): InsightCapture {
    return { id, text, filed_to, createdAt, destination_name: null };
}

/** A capturing sink that records every call so assertions can inspect them. */
function makeSink() {
    const calls = {
        daily: [] as Array<{ date: string; summary: string; count: number; at: string }>,
        weekly: [] as Array<{ weekStart: string; summary: string; count: number; at: string }>,
        insights: [] as Array<{ entries: Array<{ text: string; kind: string }>; at: string }>,
        todoSeeds: [] as unknown[][],
    };
    const sink: ReportSink = {
        addDailyReport: (date, summary, count, at) => { calls.daily.push({ date, summary, count, at }); },
        addWeeklySummary: (weekStart, summary, count, at) => { calls.weekly.push({ weekStart, summary, count, at }); },
        setInsights: (entries, at) => { calls.insights.push({ entries, at }); },
        // Pretend every distinct seed is newly added.
        syncTodos: (seeds) => { calls.todoSeeds.push(seeds); return seeds.length; },
    };
    return { sink, calls };
}

// 2026-05-28 is a Thursday → Monday-anchored week starts 2026-05-25.
const TODAY = '2026-05-28';
const WEEK_START = '2026-05-25';
const NOW_ISO = '2026-05-28T20:00:00.000Z';

function ctx(captures: InsightCapture[], llm: LlmFn) {
    return { captures, today: TODAY, nowIso: NOW_ISO, llm };
}

describe('reportEngine — due predicates', () => {
    it('daily report is due when never generated', () => {
        expect(isDailyReportDue(null, TODAY)).toBe(true);
    });
    it('daily report is due when last generated on a prior day', () => {
        expect(isDailyReportDue('2026-05-27', TODAY)).toBe(true);
    });
    it('daily report is NOT due when already generated for today', () => {
        expect(isDailyReportDue(TODAY, TODAY)).toBe(false);
    });
    it('weekly report is due when never generated', () => {
        expect(isWeeklyReportDue(null, WEEK_START)).toBe(true);
    });
    it('weekly report is due when last generated for a prior week', () => {
        expect(isWeeklyReportDue('2026-05-18', WEEK_START)).toBe(true);
    });
    it('weekly report is NOT due when already generated for this week', () => {
        expect(isWeeklyReportDue(WEEK_START, WEEK_START)).toBe(false);
    });
});

describe('reportEngine — generateReports (full run)', () => {
    it('runs all four artifacts and stamps nowIso on persisted ones', async () => {
        const caps = [
            cap('a', 'Call the plumber about the leak', 'admin', '2026-05-28T09:00:00.000Z'),
            cap('b', 'Idea: a calmer onboarding flow', 'ideas', '2026-05-28T10:00:00.000Z'),
            cap('c', 'Sync with Dana on the Q3 plan', 'people', '2026-05-28T11:00:00.000Z'),
        ];
        const { sink, calls } = makeSink();
        const res = await generateReports(ctx(caps, stubLlm('A clear summary of the day.')), sink);

        expect(res.ranDaily).toBe(true);
        expect(res.ranWeekly).toBe(true);
        expect(res.dailyCaptureCount).toBe(3);
        expect(res.weeklyCaptureCount).toBe(3);

        expect(calls.daily).toHaveLength(1);
        expect(calls.daily[0]).toMatchObject({ date: TODAY, count: 3, at: NOW_ISO });
        expect(calls.weekly).toHaveLength(1);
        expect(calls.weekly[0]).toMatchObject({ weekStart: WEEK_START, count: 3, at: NOW_ISO });
        expect(calls.insights).toHaveLength(1);
        expect(calls.insights[0].at).toBe(NOW_ISO);
        expect(calls.todoSeeds).toHaveLength(1);
    });

    it('still drafts daily + weekly reports without an LLM (heuristic fallback, never null)', async () => {
        const caps = [
            cap('a', 'File the insurance paperwork', 'admin', '2026-05-28T09:00:00.000Z'),
            cap('b', 'Follow up with the vendor', 'admin', '2026-05-28T10:00:00.000Z'),
        ];
        const { sink, calls } = makeSink();
        const res = await generateReports(ctx(caps, nullLlm), sink);

        expect(res.ranDaily).toBe(true);
        expect(res.ranWeekly).toBe(true);
        expect(calls.daily[0].summary.length).toBeGreaterThan(0);
        expect(calls.weekly[0].summary.length).toBeGreaterThan(0);
        // Insights are LLM-only → empty without an LLM (UI prompts for a key).
        expect(res.insightCount).toBe(0);
        expect(calls.insights[0].entries).toHaveLength(0);
    });
});

describe('reportEngine — generateReports (scoped opts)', () => {
    it('on-open catch-up scope (daily + todos, no weekly/insights) only touches the requested sinks', async () => {
        const caps = [
            cap('a', 'Schedule the dentist', 'admin', '2026-05-28T09:00:00.000Z'),
            cap('b', 'Buy paint for the office', 'admin', '2026-05-28T10:00:00.000Z'),
        ];
        const { sink, calls } = makeSink();
        const res = await generateReports(
            ctx(caps, nullLlm),
            sink,
            { daily: true, todos: true, weekly: false, insights: false },
        );

        expect(res.ranDaily).toBe(true);
        expect(res.ranWeekly).toBe(false);
        expect(calls.daily).toHaveLength(1);
        expect(calls.weekly).toHaveLength(0);
        expect(calls.insights).toHaveLength(0);
        expect(calls.todoSeeds).toHaveLength(1);
    });

    it('counts only the days/weeks captures regardless of total capture volume', async () => {
        const caps = [
            cap('today1', 'today task', 'admin', '2026-05-28T09:00:00.000Z'),
            cap('prevWeek', 'old task', 'admin', '2026-05-18T09:00:00.000Z'),
        ];
        const { sink } = makeSink();
        const res = await generateReports(ctx(caps, nullLlm), sink, { daily: true, weekly: true });
        expect(res.dailyCaptureCount).toBe(1);   // only the 28th
        expect(res.weeklyCaptureCount).toBe(1);  // 18th is the prior week
    });
});
