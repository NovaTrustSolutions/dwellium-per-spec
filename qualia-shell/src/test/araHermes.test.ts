/**
 * araHermes — Phase-10 Task 10.3 (A2): ARA quick-chat Hermes hints. Verifies
 * tag separation from Agent Lab runs, thumbs-down exclusion / thumbs-up boost semantics, the
 * few-shot formatter, and the record-then-vote flow against the real store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    ARA_CHAT_TOOL,
    ARA_FEWSHOT_K,
    araChatRuns,
    relevantAraRuns,
    formatAraFewShot,
    araFewShot,
    recordAraChat,
} from '../components/ARAConsole/araHermes';
import {
    hermesLearningStore,
    hermesLearningUserIdHolder,
    recordRun,
    rateRun,
    type HermesRunRecord,
} from '../components/HonchoHermesPanel/hermesLearningStore';

beforeEach(() => {
    hermesLearningUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    (hermesLearningStore as unknown as { reset?: () => void }).reset?.();
});

describe('recordAraChat + tag separation', () => {
    it('tags ARA chat runs with ara-chat and stores a success', () => {
        const rec = recordAraChat('what is my vacancy rate', 'Your vacancy rate is 4%.');
        expect(rec.toolsUsed).toContain(ARA_CHAT_TOOL);
        expect(rec.outcome).toBe('success');
        expect(hermesLearningStore.getSnapshot().find(r => r.id === rec.id)).toBeTruthy();
    });

    it('araChatRuns excludes Agent Lab (non-ara-chat) runs', () => {
        recordAraChat('vacancy rate question', 'answer A');
        recordRun({ prompt: 'team batch on vacancy', outcome: 'success', toolsUsed: ['research-squad'] });
        const runs = araChatRuns();
        expect(runs).toHaveLength(1);
        expect(runs[0].toolsUsed).toContain(ARA_CHAT_TOOL);
    });
});

describe('voting semantics', () => {
    it('thumbs-down (−1) excludes a run from ARA hints entirely', () => {
        const rec = recordAraChat('lease renewal rules in georgia', 'Here are the rules…');
        expect(relevantAraRuns('georgia lease renewal').map(r => r.id)).toContain(rec.id);
        rateRun(rec.id, -1);
        expect(relevantAraRuns('georgia lease renewal').map(r => r.id)).not.toContain(rec.id);
        expect(araChatRuns().map(r => r.id)).not.toContain(rec.id);
    });

    it('thumbs-up (+1) boosts an OLDER run above an unrated newer equal-similarity sibling', () => {
        const older = recordAraChat('rent comps midtown atlanta', 'Comps set A');
        const newer = recordAraChat('rent comps midtown atlanta', 'Comps set B');
        // Unrated: recency tiebreak would put `newer` first. The thumbs-up boost on
        // `older` must overcome that (score beats tiebreak).
        rateRun(older.id, 1);
        const ranked = relevantAraRuns('rent comps midtown atlanta', 2);
        expect(ranked[0].id).toBe(older.id);
        expect(ranked[1].id).toBe(newer.id);
    });
});

describe('few-shot formatting + cap', () => {
    it('formats Q/A pairs and returns empty string for no runs', () => {
        expect(formatAraFewShot([])).toBe('');
        const runs: HermesRunRecord[] = [{
            id: 'x', prompt: 'q1', taskType: 'general', toolsUsed: [ARA_CHAT_TOOL],
            steps: 0, outcome: 'success', summary: 'a1', createdAt: '2026-06-11T00:00:00Z',
        }];
        const block = formatAraFewShot(runs);
        expect(block).toContain('- Q: q1');
        expect(block).toContain('A: a1');
    });

    it('araFewShot caps at ARA_FEWSHOT_K runs', () => {
        for (let i = 0; i < 6; i++) recordAraChat(`vacancy rate question ${i}`, `answer ${i}`);
        const block = araFewShot('vacancy rate question');
        const qLines = block.split('\n').filter(l => l.startsWith('- Q:'));
        expect(qLines.length).toBeLessThanOrEqual(ARA_FEWSHOT_K);
        expect(qLines.length).toBeGreaterThan(0);
    });

    it('araFewShot is empty when nothing similar exists', () => {
        recordAraChat('lease renewal in georgia', 'rules…');
        expect(araFewShot('zzqx unrelated nonsense tokens')).toBe('');
    });
});
