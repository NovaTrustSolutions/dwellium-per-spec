/**
 * reportEngine — pure orchestration that turns a day's/week's captures into
 * persisted daily reports, weekly summaries, to-do seeds, and non-obvious
 * insights (Block B Cycle 13).
 *
 * This is the glue between the pure `insights` helpers (LLM-first drafting with
 * heuristic fallback) and the local-first `reportStore` / `todoStore` sinks.
 * It stays PURE + injectable so it's unit-testable without a React render or
 * localStorage:
 *   - the LLM is the same injectable `LlmFn` the insights helpers take,
 *   - persistence is an injectable `ReportSink` (the component passes the real
 *     reportStore / todoStore mutators; tests pass a capturing stub),
 *   - "now"/date context is passed in (never `new Date()` internally), so the
 *     React-19 fake-timer anti-pattern never applies and assertions stay
 *     deterministic.
 *
 * KEEP DATA LOCAL: this module returns plain results + drives the local sinks;
 * nothing here touches the network or a backend.
 */
import type { LlmFn, InsightCapture, TodoSeed, InsightSeed } from './insights';
import {
    weekStartOf,
    capturesForDay,
    capturesForWeek,
    draftDailyReport,
    draftWeeklySummary,
    generateTodoSeeds,
    surfaceInsights,
} from './insights';

/** Persistence sink — the component wires the real reportStore/todoStore mutators. */
export interface ReportSink {
    addDailyReport: (date: string, summary: string, captureCount: number, generatedAt: string) => void;
    addWeeklySummary: (weekStart: string, summary: string, captureCount: number, generatedAt: string) => void;
    setInsights: (entries: Array<{ text: string; kind: InsightSeed['kind'] }>, generatedAt: string) => void;
    /** De-duping bulk add (todoStore.syncTodosFromCaptures); returns # newly added. */
    syncTodos: (seeds: TodoSeed[]) => number;
}

/** Which artifacts to (re)generate. Omitting the whole object means "everything". */
export interface GenerateOptions {
    daily?: boolean;
    weekly?: boolean;
    todos?: boolean;
    insights?: boolean;
}

/** Inputs for one generation run. Date context is injected — never read here. */
export interface GenerateContext {
    captures: InsightCapture[];
    today: string;    // YYYY-MM-DD the run treats as "today"
    nowIso: string;   // ISO timestamp stamped onto generated artifacts
    llm: LlmFn;
}

export interface GenerateResult {
    ranDaily: boolean;
    ranWeekly: boolean;
    dailyCaptureCount: number;
    weeklyCaptureCount: number;
    todosAdded: number;
    insightCount: number;
}

/**
 * Is a daily report due? A report is due whenever the last one wasn't generated
 * for `today` (covers "never generated" = null and "generated on a prior day").
 */
export function isDailyReportDue(lastDailyReportDate: string | null, today: string): boolean {
    return lastDailyReportDate !== today;
}

/** Is a weekly summary due? Due whenever the last one wasn't this Mon-anchored week. */
export function isWeeklyReportDue(lastWeeklyReportWeek: string | null, thisWeekStart: string): boolean {
    return lastWeeklyReportWeek !== thisWeekStart;
}

const FULL: GenerateOptions = { daily: true, weekly: true, todos: true, insights: true };

/**
 * Generate the requested artifacts and push them into the sink.
 *
 * - Daily report: drafted from today's captures (LLM-first, heuristic fallback).
 * - Weekly summary: drafted from this Mon-anchored week's captures.
 * - To-do seeds: extracted from today's captures, de-duped by the sink.
 * - Insights: cross-capture non-obvious patterns over ALL captures (LLM-only;
 *   yields [] without an LLM — the UI then prompts for a key).
 *
 * Pass `opts` to scope the run (e.g. on-open catch-up does daily+todos and
 * weekly only if due, skipping the LLM-only insights pass). Omitting `opts`
 * runs the full set ("Generate now").
 */
export async function generateReports(
    ctx: GenerateContext,
    sink: ReportSink,
    opts?: GenerateOptions,
): Promise<GenerateResult> {
    const o = opts ?? FULL;
    const { captures, today, nowIso, llm } = ctx;
    const weekStart = weekStartOf(today);
    const dayCaps = capturesForDay(captures, today);
    const weekCaps = capturesForWeek(captures, weekStart);

    const result: GenerateResult = {
        ranDaily: false,
        ranWeekly: false,
        dailyCaptureCount: dayCaps.length,
        weeklyCaptureCount: weekCaps.length,
        todosAdded: 0,
        insightCount: 0,
    };

    if (o.daily) {
        const summary = await draftDailyReport(dayCaps, today, llm);
        sink.addDailyReport(today, summary, dayCaps.length, nowIso);
        result.ranDaily = true;
    }
    if (o.weekly) {
        const summary = await draftWeeklySummary(weekCaps, weekStart, llm);
        sink.addWeeklySummary(weekStart, summary, weekCaps.length, nowIso);
        result.ranWeekly = true;
    }
    if (o.todos) {
        const seeds = await generateTodoSeeds(dayCaps, llm);
        result.todosAdded = sink.syncTodos(seeds);
    }
    if (o.insights) {
        const seeds = await surfaceInsights(captures, llm);
        sink.setInsights(seeds, nowIso);
        result.insightCount = seeds.length;
    }
    return result;
}
