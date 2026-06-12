/**
 * P12-5/6 — dream expansion + morning brief (gap items 3+4, 2026-06-12).
 * "Overnight it re-reads everything" — wide corpus + nightly brief.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildDreamCorpus, parseDeepDream, dayKey } from '../lib/dailySynthesis';
import {
    morningBriefStore,
    morningBriefUserIdHolder,
    upsertBrief,
    todaysBrief,
    markBriefSeen,
    formatBrief,
    requestBriefInAra,
    consumePendingBrief,
    resetMorningBriefs,
} from '../lib/morningBriefStore';
import { memoryStore, memoryUserIdHolder } from '../components/HonchoHermesPanel/honchoMemoryStore';
import { hermesLearningStore, hermesLearningUserIdHolder, recordRun } from '../components/HonchoHermesPanel/hermesLearningStore';
import { goalsStore, goalsUserIdHolder, createGoal } from '../lib/goalsStore';
import { artifactStore, recordArtifact } from '../lib/artifactStore';

beforeEach(() => {
    try { localStorage.clear(); } catch { /* */ }
    morningBriefUserIdHolder.current = 'test-user';
    memoryUserIdHolder.current = 'test-user';
    hermesLearningUserIdHolder.current = 'test-user';
    goalsUserIdHolder.current = 'test-user';
    memoryStore.reset();
    hermesLearningStore.reset();
    goalsStore.reset();
    artifactStore.reset();
    resetMorningBriefs();
});

describe('buildDreamCorpus — the "re-reads everything" widening', () => {
    it('empty stores → zero sections (dreamer skips the cycle)', () => {
        const c = buildDreamCorpus();
        expect(c.sections).toBe(0);
        expect(c.text).toBe('');
    });

    it('gathers agent exchanges + goals + artifacts into capped sections', () => {
        recordRun({ prompt: 'find roofing vendors near the Maple property', outcome: 'success', summary: 'Found 3 vendors' });
        createGoal('Grow tenant satisfaction', { brief: 'b', agentActions: [{ text: 'survey tenants', done: false }], userActions: [{ text: 'call Lisa', done: false }], clarifyingQuestions: ['Which building?'] });
        recordArtifact({ content: '# Invoice\nFifty thousand dollars for being super duper cool.', source: 'ara' });
        const c = buildDreamCorpus();
        expect(c.sections).toBeGreaterThanOrEqual(3);
        expect(c.text).toContain('Recent agent exchanges');
        expect(c.text).toContain('roofing vendors');
        expect(c.text).toContain('Active goals');
        expect(c.text).toContain('Grow tenant satisfaction');
        expect(c.text).toContain('1 open question');
        expect(c.text).toContain('Documents produced');
    });
});

describe('parseDeepDream', () => {
    it('sanitizes a valid reply', () => {
        const deep = parseDeepDream('{"insights":[{"title":"Stalled roof goal","text":"No progress in a week."}],"suggestions":["Ask the graph what connects vendors to the roof estimate."]}');
        expect(deep?.insights).toHaveLength(1);
        expect(deep?.suggestions[0]).toContain('graph');
    });

    it('garbage → null', () => {
        expect(parseDeepDream('not json')).toBeNull();
        expect(parseDeepDream('{"insights":[],"suggestions":[]}')).toBeNull();
        expect(parseDeepDream(null)).toBeNull();
    });
});

describe('morning brief lifecycle', () => {
    it('upsert → todaysBrief → seen; one brief per day (replaced, not duplicated)', () => {
        upsertBrief({ date: dayKey(), insights: [], suggestions: [], dataLines: ['AI usage 7d: 12 calls'] });
        upsertBrief({ date: dayKey(), insights: [{ title: 'T', text: 'X' }], suggestions: ['Do Y'], dataLines: ['line'] });
        const briefs = morningBriefStore.getSnapshot();
        expect(briefs.filter(b => b.date === dayKey())).toHaveLength(1);
        const today = todaysBrief();
        expect(today?.insights).toHaveLength(1);
        expect(today?.seen).toBe(false);
        markBriefSeen(dayKey());
        expect(todaysBrief()?.seen).toBe(true);
    });

    it('formatBrief renders insights + suggestions + data lines', () => {
        const b = upsertBrief({ date: dayKey(), insights: [{ title: 'Stalled goal', text: 'Roof goal untouched.' }], suggestions: ['Refine the roof goal'], dataLines: ['Goals: Roof 40%'] });
        const md = formatBrief(b);
        expect(md).toContain('Morning brief');
        expect(md).toContain('**Stalled goal**');
        expect(md).toContain('- Refine the roof goal');
        expect(md).toContain('- Goals: Roof 40%');
    });

    it('banner → ARA pending-slot hand-off (consume once)', () => {
        upsertBrief({ date: dayKey(), insights: [], suggestions: [], dataLines: ['x'] });
        requestBriefInAra(dayKey());
        const got = consumePendingBrief();
        expect(got?.date).toBe(dayKey());
        expect(consumePendingBrief()).toBeNull(); // slot consumed
    });
});
