/**
 * Plan 075 Phase 2 (goalsStore data-safety): D4 deserialize/merge repair,
 * D5 tombstones + One Save merge, D2 keepDone + answers, D12 note cap.
 * Pure-function unit tests for `mergeGoals`/`sanitizeGoal`, plus ONE
 * integration test driving the real One Save `hydrate()` (mirrors
 * oneSaveDirtyMarker.test.ts / oneSaveOwnerRace.test.ts's mock shape).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Goal, GoalPlan } from '../lib/goalsStore';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        putBatch: vi.fn().mockResolvedValue('unsupported'),
        remove: vi.fn(),
    },
}));

import { oneSaveClient } from '../lib/oneSaveClient';
import {
    goalsStore,
    goalsUserIdHolder,
    createGoal,
    updateGoalPlan,
    setGoalStatus,
    toggleGoalAction,
    addGoalNote,
    deleteGoal,
    findGoalByTitle,
    liveGoals,
    mergeGoals,
    sanitizeGoal,
    goalProgress,
    resetGoals,
} from '../lib/goalsStore';

function plan(overrides: Partial<GoalPlan> = {}): GoalPlan {
    return { brief: 'b', agentActions: [], userActions: [], clarifyingQuestions: [], ...overrides };
}

function goal(overrides: Partial<Goal> = {}): Goal {
    return {
        id: 'g1',
        title: 'Goal',
        status: 'active',
        notes: [],
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    };
}

beforeEach(() => {
    goalsUserIdHolder.current = 'sync-test-user';
    try { localStorage.clear(); } catch { /* */ }
    vi.mocked(oneSaveClient.get).mockReset();
    vi.mocked(oneSaveClient.put).mockReset();
    vi.mocked(oneSaveClient.putBatch).mockReset().mockResolvedValue('unsupported');
    resetGoals();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('sanitizeGoal (D4 repair)', () => {
    it('drops a payload with no id or non-string title', () => {
        expect(sanitizeGoal({ title: 'x' })).toBeNull();
        expect(sanitizeGoal({ id: '', title: 'x' })).toBeNull();
        expect(sanitizeGoal({ id: 'g1', title: 5 })).toBeNull();
        expect(sanitizeGoal(null)).toBeNull();
    });

    it('repairs a malformed plan/notes/status instead of throwing', () => {
        const repaired = sanitizeGoal({
            id: 'g1',
            title: 'Grow',
            status: 'weird',
            notes: ['x', { ts: 1, text: 'ok' }, { text: 5 }],
            plan: { brief: 1, agentActions: null, userActions: [{ text: 'a', done: 'yes' }, { text: 2 }], clarifyingQuestions: 'nope' },
            createdAt: 'nope',
            updatedAt: NaN,
        });
        expect(repaired).not.toBeNull();
        expect(repaired!.status).toBe('active');
        expect(repaired!.notes).toEqual([{ ts: 1, text: 'ok' }]);
        expect(repaired!.plan!.brief).toBe('');
        expect(repaired!.plan!.agentActions).toEqual([]);
        expect(repaired!.plan!.userActions).toEqual([{ text: 'a', done: true }]);
        expect(repaired!.plan!.clarifyingQuestions).toEqual([]);
        expect(repaired!.createdAt).toBe(0);
        expect(repaired!.updatedAt).toBe(0);
        // goalProgress must not throw on the repaired goal.
        expect(() => goalProgress(repaired!)).not.toThrow();
        expect(goalProgress(repaired!)).toBe(1);
    });

    it('a non-array payload merges to [] rather than throwing (mergeGoals guards both sides)', () => {
        expect(mergeGoals({ not: 'an array' } as unknown as Goal[], [])).toEqual([]);
        expect(mergeGoals([], { not: 'an array' } as unknown as Goal[])).toEqual([]);
    });
});

describe('mergeGoals', () => {
    it('a stale remote copy of a goal deleted locally does not resurrect it', () => {
        const now = Date.now();
        const tombstone = goal({ id: 'a', title: '', status: 'done', deletedAt: now, updatedAt: now, createdAt: now - 1000 });
        const staleRemoteA = goal({ id: 'a', title: 'A', status: 'active', updatedAt: now - 500, createdAt: now - 1000 });
        const merged = mergeGoals([tombstone], [staleRemoteA]);
        expect(liveGoals(merged)).toEqual([]);
        expect(merged.find(g => g.id === 'a')?.deletedAt).toBe(now);
    });

    it('an edit newer than a remote delete wins (tombstone loses if older)', () => {
        const now = Date.now();
        const localEdit = goal({ id: 'a', title: 'A edited', updatedAt: now, createdAt: now - 1000 });
        const remoteTombstone = goal({ id: 'a', title: '', status: 'done', deletedAt: now - 500, updatedAt: now - 500, createdAt: now - 1000 });
        const merged = mergeGoals([localEdit], [remoteTombstone]);
        expect(merged.find(g => g.id === 'a')?.title).toBe('A edited');
    });

    it('a goal created locally and missing remotely survives', () => {
        const localOnly = goal({ id: 'local-only', createdAt: 5, updatedAt: 5 });
        const merged = mergeGoals([localOnly], []);
        expect(merged).toHaveLength(1);
        expect(merged[0].id).toBe('local-only');
    });

    it('a goal only on remote appears', () => {
        const remoteOnly = goal({ id: 'remote-only', createdAt: 5, updatedAt: 5 });
        const merged = mergeGoals([], [remoteOnly]);
        expect(merged).toHaveLength(1);
        expect(merged[0].id).toBe('remote-only');
    });

    it('per-goal newer-wins in both directions; a tie favors local', () => {
        const l = goal({ id: 'a', title: 'local newer', updatedAt: 10, createdAt: 1 });
        const r = goal({ id: 'a', title: 'remote newer', updatedAt: 20, createdAt: 1 });
        expect(mergeGoals([l], [r])[0].title).toBe('remote newer');
        expect(mergeGoals([r], [l])[0].title).toBe('remote newer');

        const tieLocal = goal({ id: 'b', title: 'local tie', updatedAt: 10, createdAt: 1 });
        const tieRemote = goal({ id: 'b', title: 'remote tie', updatedAt: 10, createdAt: 1 });
        expect(mergeGoals([tieLocal], [tieRemote])[0].title).toBe('local tie');
    });

    it('prunes a tombstone older than 90 days', () => {
        vi.setSystemTime(new Date('2026-09-30T00:00:00.000Z'));
        const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
        const oldTombstone = goal({ id: 'old', deletedAt: ninetyOneDaysAgo, updatedAt: ninetyOneDaysAgo, createdAt: 1 });
        const recentTombstone = goal({ id: 'recent', deletedAt: Date.now() - 1000, updatedAt: Date.now() - 1000, createdAt: 1 });
        const merged = mergeGoals([oldTombstone, recentTombstone], []);
        expect(merged.map(g => g.id)).toEqual(['recent']);
    });

    it('repairs malformed remote entries and goalProgress never throws on the result', () => {
        const local: unknown[] = [];
        const remote = [
            { id: 'x', title: 'Bad plan', plan: { agentActions: null, userActions: undefined }, notes: 'x', status: 'weird', createdAt: 1, updatedAt: 1 },
        ];
        const merged = mergeGoals(local as Goal[], remote as unknown as Goal[]);
        expect(merged).toHaveLength(1);
        expect(() => goalProgress(merged[0])).not.toThrow();
        expect(merged[0].status).toBe('active');
        expect(merged[0].notes).toEqual([]);
    });

    it('output order is stable by createdAt then id', () => {
        const a = goal({ id: 'z', createdAt: 5, updatedAt: 5 });
        const b = goal({ id: 'a', createdAt: 5, updatedAt: 5 });
        const c = goal({ id: 'm', createdAt: 1, updatedAt: 1 });
        expect(mergeGoals([a, b, c], []).map(g => g.id)).toEqual(['m', 'a', 'z']);
    });
});

describe('updateGoalPlan keepDone + answers (D2)', () => {
    it('carries done forward by normalized action text', () => {
        const g = createGoal('Grow');
        updateGoalPlan(g.id, plan({ agentActions: [{ text: 'Post video.', done: false }] }));
        toggleGoalAction(g.id, 'agentActions', 0);
        expect(goalsStore.getSnapshot()[0].plan?.agentActions[0].done).toBe(true);

        // A refine cycle produces a new plan with differently-punctuated/cased text.
        updateGoalPlan(g.id, plan({ agentActions: [{ text: '  post VIDEO  ', done: false }] }), { keepDone: true });
        expect(goalsStore.getSnapshot()[0].plan?.agentActions[0].done).toBe(true);
    });

    it('respects a toggle made after the plan was generated but before updateGoalPlan is called', () => {
        const g = createGoal('Grow');
        updateGoalPlan(g.id, plan({ agentActions: [{ text: 'Draft copy', done: false }] }));
        // Simulate: caller kicked off an LLM call with the OLD plan captured, user
        // toggles the checkbox while it's in flight, THEN updateGoalPlan lands.
        toggleGoalAction(g.id, 'agentActions', 0);
        const newPlanFromLlm = plan({ agentActions: [{ text: 'Draft copy', done: false }, { text: 'New step', done: false }] });
        updateGoalPlan(g.id, newPlanFromLlm, { keepDone: true });
        const after = goalsStore.getSnapshot()[0].plan!;
        expect(after.agentActions[0].done).toBe(true);
        expect(after.agentActions[1].done).toBe(false);
    });

    it('appends a trimmed, capped answer and keeps only the newest 20', () => {
        const g = createGoal('Grow');
        updateGoalPlan(g.id, plan(), { answer: '  first answer  ' });
        expect(goalsStore.getSnapshot()[0].answers).toEqual([{ ts: expect.any(Number), text: 'first answer' }]);

        updateGoalPlan(g.id, plan(), { answer: '' }); // empty ignored
        expect(goalsStore.getSnapshot()[0].answers).toHaveLength(1);

        for (let i = 0; i < 25; i++) updateGoalPlan(g.id, plan(), { answer: `answer ${i}` });
        const answers = goalsStore.getSnapshot()[0].answers!;
        expect(answers).toHaveLength(20);
        expect(answers[answers.length - 1].text).toBe('answer 24');
    });

    it('a long answer is sliced to 1000 chars', () => {
        const g = createGoal('Grow');
        updateGoalPlan(g.id, plan(), { answer: 'x'.repeat(2000) });
        expect(goalsStore.getSnapshot()[0].answers![0].text).toHaveLength(1000);
    });
});

describe('addGoalNote cap (D12)', () => {
    it('keeps only the newest 200 notes', () => {
        const g = createGoal('Grow');
        for (let i = 0; i < 205; i++) addGoalNote(g.id, `note ${i}`);
        const notes = goalsStore.getSnapshot()[0].notes;
        expect(notes).toHaveLength(200);
        expect(notes[notes.length - 1].text).toBe('note 204');
        expect(notes[0].text).toBe('note 5');
    });
});

describe('deleteGoal tombstone visibility (D5)', () => {
    it('leaves a tombstone invisible to useGoals/findGoalByTitle', () => {
        const g = createGoal('Vanish me');
        deleteGoal(g.id);
        expect(findGoalByTitle('Vanish me')).toBeNull();
        expect(liveGoals(goalsStore.getSnapshot())).toHaveLength(0);
        expect(goalsStore.getSnapshot()).toHaveLength(1); // tombstone still in the synced array
    });

    it('every mutator no-ops on a tombstone', () => {
        const g = createGoal('Frozen', plan({ agentActions: [{ text: 'a', done: false }] }));
        deleteGoal(g.id);
        const before = goalsStore.getSnapshot()[0];

        setGoalStatus(g.id, 'active');
        toggleGoalAction(g.id, 'agentActions', 0);
        addGoalNote(g.id, 'should not stick');
        updateGoalPlan(g.id, plan({ brief: 'new brief' }));

        const after = goalsStore.getSnapshot()[0];
        expect(after).toEqual(before);
    });
});

describe('One Save hydrate integration (real goalsStore, mocked oneSaveClient)', () => {
    it('local tombstone for A + new local B; remote has stale-live A + new C → live goals are B and C', async () => {
        vi.setSystemTime(new Date('2026-09-30T00:00:00.000Z'));
        const t0 = Date.now();

        const a = createGoal('Goal A'); // createdAt = updatedAt = t0
        vi.setSystemTime(new Date(t0 + 1000));
        deleteGoal(a.id); // tombstone: updatedAt = t0+1000, deletedAt = t0+1000
        vi.setSystemTime(new Date(t0 + 2000));
        createGoal('Goal B'); // createdAt = updatedAt = t0+2000

        const remotePayload: Goal[] = [
            goal({ id: a.id, title: 'Goal A', status: 'active', createdAt: t0, updatedAt: t0 }), // stale: older than the local tombstone
            goal({ id: 'goal-c', title: 'Goal C', createdAt: t0 + 500, updatedAt: t0 + 500 }),
        ];
        vi.mocked(oneSaveClient.get).mockResolvedValue({
            id: `goals_${goalsUserIdHolder.current}`,
            type: 'goals',
            ownerId: goalsUserIdHolder.current!,
            schema: 1,
            createdAt: '2026-09-30T00:00:00.000Z',
            updatedAt: '2026-09-30T00:00:00.000Z',
            deletedAt: null,
            payload: remotePayload,
        });

        await goalsStore.hydrate();

        const live = liveGoals(goalsStore.getSnapshot());
        expect(live.map(g => g.title).sort()).toEqual(['Goal B', 'Goal C']);
        // A's tombstone must still be present (not resurrected, not dropped).
        expect(goalsStore.getSnapshot().find(g => g.id === a.id)?.deletedAt).toBeDefined();
    });
});
