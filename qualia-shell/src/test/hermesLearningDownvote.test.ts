/**
 * D13 — rankPastRuns must exclude downvoted runs (rating < 0), exactly like
 * araChatRuns() does for ARA quick chat. A downvoted run is the strongest
 * "don't do that again" signal available and must never re-surface as a
 * few-shot example, even when it is the most similar run in the log.
 */
import { describe, it, expect } from 'vitest';
import { rankPastRuns, type HermesRunRecord } from '../components/HonchoHermesPanel/hermesLearningStore';

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
        unchecked: partial.unchecked,
        createdAt: partial.createdAt ?? '2026-05-29T10:00:00.000Z',
    };
}

describe('rankPastRuns — downvote exclusion', () => {
    it('excludes a downvoted, highly-similar success run; keeps unrated/upvoted ones', () => {
        const runs = [
            run({ id: 'down', prompt: 'convert markdown files to backup', rating: -1 }),
            run({ id: 'unrated', prompt: 'convert markdown files to backup' }),
            run({ id: 'up', prompt: 'convert markdown files to backup', rating: 1 }),
        ];
        const top = rankPastRuns(runs, 'convert markdown files to backup', 5);
        expect(top.find(r => r.id === 'down')).toBeUndefined();
        expect(top.find(r => r.id === 'unrated')).toBeDefined();
        expect(top.find(r => r.id === 'up')).toBeDefined();
    });

    it('a small negative rating (e.g. -0.5) is also excluded, not just -1', () => {
        const runs = [run({ id: 'down-half', prompt: 'draft an email reply', rating: -0.5 })];
        expect(rankPastRuns(runs, 'draft an email reply', 5)).toHaveLength(0);
    });
});

describe('rankPastRuns — a 👍 promotes an answer that was never fact-checked', () => {
    const P = 'draft a renewal notice for the tenant';
    it('an unchecked fail is reused only after a thumbs-up', () => {
        expect(rankPastRuns([run({ id: 'u', prompt: P, outcome: 'fail', unchecked: true })], P, 5)).toHaveLength(0);
        expect(rankPastRuns([run({ id: 'u', prompt: P, outcome: 'fail', unchecked: true, rating: 0 })], P, 5)).toHaveLength(0);
        expect(rankPastRuns([run({ id: 'u', prompt: P, outcome: 'fail', unchecked: true, rating: 1 })], P, 5).map(r => r.id)).toEqual(['u']);
    });
    it('a thumbs-up never promotes a fail the fact-check disputed or that errored (not unchecked)', () => {
        expect(rankPastRuns([run({ id: 'f', prompt: P, outcome: 'fail', rating: 1 })], P, 5)).toHaveLength(0);
    });
    it('a later thumbs-down demotes it again', () => {
        expect(rankPastRuns([run({ id: 'u', prompt: P, outcome: 'fail', unchecked: true, rating: -1 })], P, 5)).toHaveLength(0);
    });
});
