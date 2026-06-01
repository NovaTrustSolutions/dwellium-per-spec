import { describe, it, expect } from 'vitest';
import { deriveStats, deriveBuckets, deriveTimeline } from '../components/ThoughtWeaver/localViews';
import type { LocalCapture } from '../components/ThoughtWeaver/thoughtWeaverStore';

/**
 * The glanceable views (header counts, Dashboard, Timeline) must reflect the
 * LOCAL trusted store — so they work with no backend. These assert the
 * derivation is correct AND that the user's raw text is preserved verbatim
 * (the "never misinterpreted / never lost" guarantee).
 */
const cap = (over: Partial<LocalCapture>): LocalCapture => ({
    id: Math.random().toString(36).slice(2),
    text: 'a thought',
    filed_to: 'ideas',
    confidence: 0.7,
    destination_name: null,
    source: 'local',
    createdAt: '2026-05-30T10:00:00.000Z',
    ...over,
});

const fixture: LocalCapture[] = [
    cap({ text: 'Call the plumber', filed_to: 'admin', createdAt: '2026-05-30T12:00:00Z' }),
    cap({ text: 'Met Sarah', filed_to: 'people', destination_name: 'Sarah', createdAt: '2026-05-30T13:00:00Z' }),
    cap({ text: 'Project Atlas behind', filed_to: 'projects', createdAt: '2026-05-30T09:00:00Z' }),
    cap({ text: 'what if crypto rent', filed_to: 'ideas', createdAt: '2026-05-30T08:00:00Z' }),
    cap({ text: 'zxcv', filed_to: 'needs_review', createdAt: '2026-05-30T07:00:00Z' }),
];

describe('localViews — glanceable views from the local store', () => {
    it('deriveStats counts each bucket (including needs_review as pendingReviews)', () => {
        const s = deriveStats(fixture);
        expect(s.totalCaptures).toBe(5);
        expect(s.activePeople).toBe(1);
        expect(s.activeProjects).toBe(1);
        expect(s.totalIdeas).toBe(1);
        expect(s.tasksDue).toBe(1);
        expect(s.pendingReviews).toBe(1);
    });

    it('empty store yields all-zero stats (no crash, glance shows zeros)', () => {
        expect(deriveStats([])).toEqual({
            totalCaptures: 0, pendingReviews: 0, activePeople: 0, activeProjects: 0, totalIdeas: 0, tasksDue: 0,
        });
    });

    it('deriveBuckets groups into the 4 buckets, excludes needs_review', () => {
        const b = deriveBuckets(fixture);
        expect(b.admin.map(i => i.notes)).toEqual(['Call the plumber']);
        expect(b.people[0].name).toBe('Sarah');          // uses destination_name as label
        expect(b.projects).toHaveLength(1);
        expect(b.ideas).toHaveLength(1);
        // needs_review is NOT a dashboard bucket
        expect(Object.keys(b)).toEqual(['people', 'projects', 'ideas', 'admin']);
    });

    it('preserves the raw text verbatim in notes (never re-interpreted)', () => {
        const b = deriveBuckets(fixture);
        expect(b.admin[0].notes).toBe('Call the plumber');
        expect(b.admin[0].source).toBe('local');
    });

    it('deriveTimeline includes everything (incl. needs_review), most-recent first', () => {
        const t = deriveTimeline(fixture);
        expect(t).toHaveLength(5);
        // sorted desc by createdAt → 13:00 first, 07:00 last
        expect(t[0].notes).toBe('Met Sarah');
        expect(t[t.length - 1].notes).toBe('zxcv');
    });
});
