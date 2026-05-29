/**
 * Cycle 16 — Hermes self-improvement learning store (local, per-user).
 *
 * Covers both mechanisms: (a) run-memory few-shot (recordRun /
 * relevantPastRuns / rankPastRuns / formatFewShot) and (b) tool
 * success-weighting (toolWeights / computeToolWeights / rankToolsByWeight),
 * plus the coarse task classifier and the per-user store wiring.
 *
 * Pure helpers are tested directly on supplied arrays (no store). Store-reading
 * functions are exercised via recordRun. Per v2.72.1, the factory store is
 * .reset() in beforeEach. Real clock — no fake timers (Phase-7 Finding (B)).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    hermesLearningStore,
    hermesLearningUserIdHolder,
    recordRun,
    rateRun,
    clearLearning,
    relevantPastRuns,
    toolWeights,
    classifyTaskType,
    similarity,
    rankPastRuns,
    computeToolWeights,
    rankToolsByWeight,
    formatFewShot,
    type HermesRunRecord,
} from '../components/HonchoHermesPanel/hermesLearningStore';

beforeEach(() => {
    localStorage.clear();
    hermesLearningStore.reset();
    hermesLearningUserIdHolder.current = null;
});

function run(partial: Partial<HermesRunRecord> & { prompt: string }): HermesRunRecord {
    return {
        id: partial.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
        prompt: partial.prompt,
        taskType: partial.taskType ?? 'general',
        toolsUsed: partial.toolsUsed ?? [],
        steps: partial.steps ?? 0,
        outcome: partial.outcome ?? 'success',
        rating: partial.rating,
        summary: partial.summary,
        createdAt: partial.createdAt ?? '2026-05-29T10:00:00.000Z',
    };
}

/* ─── classifyTaskType ─── */
describe('classifyTaskType', () => {
    it('detects code / file / communication / planning', () => {
        expect(classifyTaskType('fix the bug in this typescript function')).toBe('code');
        expect(classifyTaskType('convert the folder of pdf files to markdown')).toBe('file');
        expect(classifyTaskType('draft an email reply to send')).toBe('communication');
        expect(classifyTaskType('plan my schedule and remind me')).toBe('planning');
    });
    it('falls back to general when nothing matches', () => {
        expect(classifyTaskType('xyzzy frobnicate')).toBe('general');
        expect(classifyTaskType('')).toBe('general');
    });
});

/* ─── similarity ─── */
describe('similarity', () => {
    it('is 1 for identical content tokens and 0 for disjoint', () => {
        expect(similarity('convert markdown files', 'convert markdown files')).toBeCloseTo(1, 5);
        expect(similarity('convert markdown files', 'launch rocket telescope')).toBe(0);
    });
    it('is between 0 and 1 for partial overlap, ignoring stop words', () => {
        const s = similarity('convert the markdown files', 'convert the pdf files');
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
    });
    it('returns 0 when a side is empty', () => {
        expect(similarity('', 'convert files')).toBe(0);
    });
});

/* ─── rankPastRuns ─── */
describe('rankPastRuns', () => {
    it('returns only successes, ranked by similarity, capped at k', () => {
        const runs = [
            run({ prompt: 'convert markdown files to backup', outcome: 'success' }),
            run({ prompt: 'convert pdf files to backup', outcome: 'success' }),
            run({ prompt: 'totally unrelated rocket science', outcome: 'success' }),
            run({ prompt: 'convert markdown files exactly', outcome: 'fail' }),
        ];
        const top = rankPastRuns(runs, 'convert markdown files', 2);
        expect(top).toHaveLength(2);
        expect(top[0].prompt).toContain('markdown');
        expect(top.every(r => r.outcome === 'success')).toBe(true);
        // the failed run (even though most similar) is excluded
        expect(top.find(r => r.outcome === 'fail')).toBeUndefined();
    });
    it('filters out zero-similarity runs', () => {
        const runs = [run({ prompt: 'rocket telescope orbit', outcome: 'success' })];
        expect(rankPastRuns(runs, 'convert markdown files', 3)).toHaveLength(0);
    });
    it('breaks ties by recency', () => {
        const runs = [
            run({ prompt: 'convert files', createdAt: '2026-05-01T00:00:00.000Z' }),
            run({ prompt: 'convert files', createdAt: '2026-05-20T00:00:00.000Z' }),
        ];
        const top = rankPastRuns(runs, 'convert files', 1);
        expect(top[0].createdAt).toBe('2026-05-20T00:00:00.000Z');
    });
});

/* ─── computeToolWeights ─── */
describe('computeToolWeights', () => {
    it('weights tools by Laplace-smoothed success rate within a task type', () => {
        const runs = [
            run({ prompt: 'a', taskType: 'file', toolsUsed: ['convert'], outcome: 'success' }),
            run({ prompt: 'b', taskType: 'file', toolsUsed: ['convert'], outcome: 'success' }),
            run({ prompt: 'c', taskType: 'file', toolsUsed: ['scrape'], outcome: 'fail' }),
            run({ prompt: 'd', taskType: 'code', toolsUsed: ['convert'], outcome: 'fail' }),
        ];
        const weights = computeToolWeights(runs, 'file');
        const convert = weights.find(w => w.tool === 'convert')!;
        const scrape = weights.find(w => w.tool === 'scrape')!;
        expect(convert.successes).toBe(2);
        expect(convert.attempts).toBe(2);
        expect(convert.weight).toBeCloseTo(3 / 4, 5); // (2+1)/(2+2)
        expect(scrape.weight).toBeCloseTo(1 / 3, 5);   // (0+1)/(1+2)
        expect(convert.weight).toBeGreaterThan(scrape.weight);
        // 'code'-typed run does not leak into 'file' stats
        expect(convert.attempts).toBe(2);
    });
    it('returns empty for an unseen task type', () => {
        expect(computeToolWeights([run({ prompt: 'a', toolsUsed: ['x'] })], 'data')).toHaveLength(0);
    });
});

/* ─── rankToolsByWeight ─── */
describe('rankToolsByWeight', () => {
    it('moves proven tools ahead, keeping unseen tools at the end in order', () => {
        const runs = [
            run({ prompt: 'a', taskType: 'file', toolsUsed: ['proven'], outcome: 'success' }),
            run({ prompt: 'b', taskType: 'file', toolsUsed: ['proven'], outcome: 'success' }),
            run({ prompt: 'c', taskType: 'file', toolsUsed: ['weak'], outcome: 'fail' }),
        ];
        const ranked = rankToolsByWeight(['weak', 'unseenA', 'proven', 'unseenB'], runs, 'file');
        expect(ranked[0]).toBe('proven');
        expect(ranked[1]).toBe('weak');
        // unseen tools keep their relative order after the weighted ones
        expect(ranked.indexOf('unseenA')).toBeLessThan(ranked.indexOf('unseenB'));
    });
});

/* ─── formatFewShot ─── */
describe('formatFewShot', () => {
    it('renders a markdown block with tools and summary, empty input → ""', () => {
        expect(formatFewShot([])).toBe('');
        const md = formatFewShot([
            run({ prompt: 'convert files', toolsUsed: ['convert'], summary: 'done 5 files' }),
        ]);
        expect(md).toContain('Past successful runs');
        expect(md).toContain('convert files');
        expect(md).toContain('tools: convert');
        expect(md).toContain('done 5 files');
    });
});

/* ─── store: recordRun / relevantPastRuns / toolWeights / rateRun / clear ─── */
describe('hermesLearningStore (per-user)', () => {
    it('records runs, auto-classifies, and reads them back via relevantPastRuns', () => {
        recordRun({ prompt: 'convert my markdown files to backup', toolsUsed: ['convert'], outcome: 'success', summary: 'ok' });
        recordRun({ prompt: 'fix the typescript bug', toolsUsed: ['edit'], outcome: 'success' });
        const snap = hermesLearningStore.getSnapshot();
        expect(snap).toHaveLength(2);
        expect(snap[0].taskType).toBe('code'); // most-recent first; auto-classified
        const relevant = relevantPastRuns('convert markdown files', 3);
        expect(relevant).toHaveLength(1);
        expect(relevant[0].prompt).toContain('markdown');
    });

    it('toolWeights reads the store for a task type', () => {
        recordRun({ prompt: 'convert files', taskType: 'file', toolsUsed: ['convert'], outcome: 'success' });
        recordRun({ prompt: 'convert more files', taskType: 'file', toolsUsed: ['convert'], outcome: 'success' });
        const weights = toolWeights('file');
        expect(weights[0].tool).toBe('convert');
        expect(weights[0].weight).toBeCloseTo(3 / 4, 5);
    });

    it('rateRun attaches a rating to a recorded run', () => {
        const rec = recordRun({ prompt: 'do a thing', outcome: 'success' });
        rateRun(rec.id, 1);
        expect(hermesLearningStore.getSnapshot()[0].rating).toBe(1);
    });

    it('isolates runs per user and clears only the active user', () => {
        hermesLearningUserIdHolder.current = 'andy';
        hermesLearningStore.reset();
        recordRun({ prompt: 'andy task', outcome: 'success' });
        expect(hermesLearningStore.getSnapshot()).toHaveLength(1);

        hermesLearningUserIdHolder.current = 'lisa';
        hermesLearningStore.reset();
        expect(hermesLearningStore.getSnapshot()).toHaveLength(0);
        recordRun({ prompt: 'lisa task', outcome: 'success' });
        expect(hermesLearningStore.getSnapshot()).toHaveLength(1);

        clearLearning();
        expect(hermesLearningStore.getSnapshot()).toHaveLength(0);

        // andy's log survives lisa's clear
        hermesLearningUserIdHolder.current = 'andy';
        hermesLearningStore.reset();
        expect(hermesLearningStore.getSnapshot()).toHaveLength(1);
    });
});
