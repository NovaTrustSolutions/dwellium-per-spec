/**
 * reportStore — per-user local persistence for ThoughtWeaver's generated
 * daily reports, weekly summaries, and non-obvious insight entries.
 *
 * Block B Cycle 12. All ThoughtWeaver data is local-first (per Ilya's arc
 * spec: "All TW data stays in local per-user createLocalStorageStore").
 * This store holds the *derived* artifacts (reports/insights) alongside the
 * raw captures (thoughtWeaverStore) and the to-do list (todoStore). Backend
 * is optional sync only — nothing here requires a server.
 *
 * Single storage key holds one container object so daily reports, weekly
 * summaries, and insights persist + restore atomically:
 *
 *   thought-weaver:reports:<userId>      (anon → ...:_anonymous)
 *
 * `lastDailyReportDate` / `lastWeeklyReportWeek` drive the Cycle-13 on-open
 * catch-up: the UI compares them against "today"/"this week" to decide what's
 * due. They are date strings, never live handles.
 *
 * SSR-safe by construction: all browser-global access is guarded by
 * `typeof window` in the mutators (mirrors thoughtWeaverStore / todoStore);
 * the factory's getServerSnapshot returns the documented default.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

/** One generated daily report (free-text summary of a day's captures). */
export interface DailyReport {
    id: string;
    date: string;            // YYYY-MM-DD the report covers
    summary: string;         // narrative text (LLM or heuristic)
    captureCount: number;    // how many captures fed it
    generatedAt: string;     // ISO timestamp of generation
}

/** One generated weekly summary (rollup of a Mon-anchored week). */
export interface WeeklySummary {
    id: string;
    weekStart: string;       // YYYY-MM-DD of the Monday that anchors the week
    summary: string;
    captureCount: number;
    generatedAt: string;
}

/** One non-obvious insight surfaced from cross-capture analysis. */
export interface InsightEntry {
    id: string;
    text: string;
    kind: 'pattern' | 'connection' | 'suggestion';
    generatedAt: string;
}

/** The full container persisted under the single per-user key. */
export interface ReportData {
    dailyReports: DailyReport[];     // newest-first
    weeklySummaries: WeeklySummary[]; // newest-first
    insights: InsightEntry[];        // newest-first
    lastDailyReportDate: string | null;  // YYYY-MM-DD of latest daily gen
    lastWeeklyReportWeek: string | null; // YYYY-MM-DD week-start of latest weekly gen
}

const EMPTY: ReportData = {
    dailyReports: [],
    weeklySummaries: [],
    insights: [],
    lastDailyReportDate: null,
    lastWeeklyReportWeek: null,
};

/** Holder updated by the ThoughtWeaver render path BEFORE useSyncExternalStore reads. */
export const reportUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = reportUserIdHolder.current;
    return uid ? `thought-weaver:reports:${uid}` : 'thought-weaver:reports:_anonymous';
}

function isStringArrayOf<T>(v: unknown, guard: (x: any) => boolean): v is T[] {
    return Array.isArray(v) && v.every(guard);
}

function deserialize(raw: string | null): ReportData {
    if (!raw) return EMPTY;
    try {
        const p = JSON.parse(raw);
        if (!p || typeof p !== 'object') return EMPTY;
        const daily = isStringArrayOf<DailyReport>(p.dailyReports, (x) =>
            x && typeof x.id === 'string' && typeof x.summary === 'string' && typeof x.date === 'string')
            ? p.dailyReports : [];
        const weekly = isStringArrayOf<WeeklySummary>(p.weeklySummaries, (x) =>
            x && typeof x.id === 'string' && typeof x.summary === 'string' && typeof x.weekStart === 'string')
            ? p.weeklySummaries : [];
        const insights = isStringArrayOf<InsightEntry>(p.insights, (x) =>
            x && typeof x.id === 'string' && typeof x.text === 'string')
            ? p.insights : [];
        return {
            dailyReports: daily,
            weeklySummaries: weekly,
            insights,
            lastDailyReportDate: typeof p.lastDailyReportDate === 'string' ? p.lastDailyReportDate : null,
            lastWeeklyReportWeek: typeof p.lastWeeklyReportWeek === 'string' ? p.lastWeeklyReportWeek : null,
        };
    } catch {
        return EMPTY;
    }
}

export const reportStore = withSync(
    createLocalStorageStore<ReportData>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: EMPTY,
    }),
    { objectType: 'tw-report', holder: reportUserIdHolder, resolveKey },
);

function persist(next: ReportData) {
    reportStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

function newId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Add (or replace) a daily report for a date. A second generation for the same
 * date supersedes the first (deduped by `date`) so the catch-up "generate now"
 * button never piles up duplicates. Updates `lastDailyReportDate`.
 */
export function addDailyReport(date: string, summary: string, captureCount: number, generatedAt: string): DailyReport {
    const report: DailyReport = { id: newId('dr'), date, summary, captureCount, generatedAt };
    if (typeof window === 'undefined') return report;
    const cur = reportStore.getSnapshot();
    const deduped = cur.dailyReports.filter(r => r.date !== date);
    const dailyReports = [report, ...deduped];
    const lastDailyReportDate = dailyReports
        .map(r => r.date)
        .reduce((a, b) => (a && a > b ? a : b), null as string | null);
    persist({ ...cur, dailyReports, lastDailyReportDate });
    return report;
}

/** Add (or replace) a weekly summary for a Monday-anchored week. Dedup by `weekStart`. */
export function addWeeklySummary(weekStart: string, summary: string, captureCount: number, generatedAt: string): WeeklySummary {
    const entry: WeeklySummary = { id: newId('ws'), weekStart, summary, captureCount, generatedAt };
    if (typeof window === 'undefined') return entry;
    const cur = reportStore.getSnapshot();
    const deduped = cur.weeklySummaries.filter(w => w.weekStart !== weekStart);
    const weeklySummaries = [entry, ...deduped];
    const lastWeeklyReportWeek = weeklySummaries
        .map(w => w.weekStart)
        .reduce((a, b) => (a && a > b ? a : b), null as string | null);
    persist({ ...cur, weeklySummaries, lastWeeklyReportWeek });
    return entry;
}

/**
 * Replace the insight list wholesale (insights are a fresh cross-capture
 * analysis each generation, not an append log). Generation stamps each entry.
 */
export function setInsights(entries: Array<Omit<InsightEntry, 'id' | 'generatedAt'>>, generatedAt: string): InsightEntry[] {
    const stamped: InsightEntry[] = entries.map((e, i) => ({
        id: `${newId('ins')}-${i}`,
        text: e.text,
        kind: e.kind,
        generatedAt,
    }));
    if (typeof window === 'undefined') return stamped;
    const cur = reportStore.getSnapshot();
    persist({ ...cur, insights: stamped });
    return stamped;
}

/** Wipe all generated reports/insights for the current user (destructive — wire to a confirm). */
export function clearReports(): void {
    if (typeof window === 'undefined') return;
    reportStore.set(EMPTY, () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}
