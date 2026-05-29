/**
 * Cycle 12 — ThoughtWeaver reportStore (daily reports + weekly summaries +
 * insights), per-user local persistence.
 *
 * Tests the store directly (no React render — the panel needs a UserProvider).
 * Per the v2.72.1 standing convention the factory-produced store is .reset() in
 * beforeEach. Real clock — no fake timers (Phase-7 Finding (B)); generation
 * timestamps are passed in explicitly so assertions stay deterministic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    reportStore,
    reportUserIdHolder,
    addDailyReport,
    addWeeklySummary,
    setInsights,
    clearReports,
} from '../components/ThoughtWeaver/reportStore';

const TS = '2026-05-29T10:00:00.000Z';

beforeEach(() => {
    localStorage.clear();
    reportStore.reset();
    reportUserIdHolder.current = null;
});

describe('reportStore', () => {
    it('starts empty', () => {
        const snap = reportStore.getSnapshot();
        expect(snap.dailyReports).toEqual([]);
        expect(snap.weeklySummaries).toEqual([]);
        expect(snap.insights).toEqual([]);
        expect(snap.lastDailyReportDate).toBeNull();
        expect(snap.lastWeeklyReportWeek).toBeNull();
    });

    it('getServerSnapshot is the empty default (SSR-safe)', () => {
        const s = reportStore.getServerSnapshot();
        expect(s.dailyReports).toEqual([]);
        expect(s.lastDailyReportDate).toBeNull();
    });

    it('addDailyReport prepends, stamps id, and tracks lastDailyReportDate', () => {
        const r = addDailyReport('2026-05-28', 'Quiet day.', 2, TS);
        expect(r.id).toMatch(/^dr-/);
        const snap = reportStore.getSnapshot();
        expect(snap.dailyReports).toHaveLength(1);
        expect(snap.dailyReports[0].summary).toBe('Quiet day.');
        expect(snap.lastDailyReportDate).toBe('2026-05-28');
    });

    it('re-generating a daily report for the same date supersedes (dedup by date)', () => {
        addDailyReport('2026-05-28', 'first', 1, TS);
        addDailyReport('2026-05-28', 'second', 3, TS);
        const snap = reportStore.getSnapshot();
        expect(snap.dailyReports).toHaveLength(1);
        expect(snap.dailyReports[0].summary).toBe('second');
        expect(snap.dailyReports[0].captureCount).toBe(3);
    });

    it('lastDailyReportDate is the max date even if added out of order', () => {
        addDailyReport('2026-05-28', 'a', 1, TS);
        addDailyReport('2026-05-26', 'b', 1, TS);
        addDailyReport('2026-05-27', 'c', 1, TS);
        expect(reportStore.getSnapshot().lastDailyReportDate).toBe('2026-05-28');
    });

    it('addWeeklySummary dedups by weekStart and tracks lastWeeklyReportWeek', () => {
        addWeeklySummary('2026-05-25', 'week one', 5, TS);
        addWeeklySummary('2026-05-25', 'week one v2', 7, TS);
        const snap = reportStore.getSnapshot();
        expect(snap.weeklySummaries).toHaveLength(1);
        expect(snap.weeklySummaries[0].summary).toBe('week one v2');
        expect(snap.lastWeeklyReportWeek).toBe('2026-05-25');
    });

    it('setInsights replaces wholesale and stamps unique ids', () => {
        setInsights([{ text: 'old', kind: 'pattern' }], TS);
        const entries = setInsights([
            { text: 'You capture more ideas on Mondays', kind: 'pattern' },
            { text: 'Project X keeps recurring without progress', kind: 'connection' },
        ], TS);
        expect(entries).toHaveLength(2);
        const snap = reportStore.getSnapshot();
        expect(snap.insights).toHaveLength(2);
        expect(snap.insights[0].text).toMatch(/Mondays/);
        const ids = new Set(snap.insights.map(i => i.id));
        expect(ids.size).toBe(2);
    });

    it('persists to localStorage under the per-user key and survives a reset+reread', () => {
        reportUserIdHolder.current = 'andy';
        addDailyReport('2026-05-28', 'andy day', 1, TS);
        expect(localStorage.getItem('thought-weaver:reports:andy')).toBeTruthy();
        // Simulate a fresh mount: drop the in-memory cache, re-read from storage.
        reportStore.reset();
        expect(reportStore.getSnapshot().dailyReports[0].summary).toBe('andy day');
    });

    it('isolates data per user', () => {
        reportUserIdHolder.current = 'andy';
        addDailyReport('2026-05-28', 'andy', 1, TS);
        reportUserIdHolder.current = 'lisa';
        reportStore.reset();
        expect(reportStore.getSnapshot().dailyReports).toEqual([]);
        addDailyReport('2026-05-28', 'lisa', 1, TS);
        expect(reportStore.getSnapshot().dailyReports[0].summary).toBe('lisa');
        reportUserIdHolder.current = 'andy';
        reportStore.reset();
        expect(reportStore.getSnapshot().dailyReports[0].summary).toBe('andy');
    });

    it('clearReports wipes everything for the current user', () => {
        addDailyReport('2026-05-28', 'x', 1, TS);
        setInsights([{ text: 'y', kind: 'pattern' }], TS);
        clearReports();
        const snap = reportStore.getSnapshot();
        expect(snap.dailyReports).toEqual([]);
        expect(snap.insights).toEqual([]);
    });
});
