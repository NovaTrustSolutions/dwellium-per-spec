/**
 * Plan 075 Phase 3 W1: editing mutators on goalsStore — renameGoal,
 * setGoalTargetDate, addGoalAction, editGoalAction, removeGoalAction,
 * setGoalActionResult — plus the sanitize/keepDone extensions that back them
 * (targetDate + result round-trip, keepDone carrying result forward).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Goal, GoalPlan } from '../lib/goalsStore';
import {
    goalsUserIdHolder,
    createGoal,
    updateGoalPlan,
    deleteGoal,
    renameGoal,
    setGoalTargetDate,
    addGoalAction,
    editGoalAction,
    removeGoalAction,
    setGoalActionResult,
    sanitizeGoal,
    mergeGoals,
    goalsStore,
    resetGoals,
} from '../lib/goalsStore';

function plan(overrides: Partial<GoalPlan> = {}): GoalPlan {
    return { brief: 'b', agentActions: [], userActions: [], clarifyingQuestions: [], ...overrides };
}

function byId(id: string): Goal {
    const g = goalsStore.getSnapshot().find(x => x.id === id);
    if (!g) throw new Error(`goal ${id} not found`);
    return g;
}

beforeEach(() => {
    goalsUserIdHolder.current = 'edit-test-user';
    try { localStorage.clear(); } catch { /* */ }
    resetGoals();
});

describe('renameGoal', () => {
    it('trims and caps at 160 chars', () => {
        const g = createGoal('  Old  ');
        renameGoal(g.id, `  ${'x'.repeat(200)}  `);
        expect(byId(g.id).title).toBe('x'.repeat(160));
    });

    it('empty (or whitespace-only) title is a no-op', () => {
        const g = createGoal('Old');
        renameGoal(g.id, '   ');
        expect(byId(g.id).title).toBe('Old');
    });

    it('no-ops on a tombstoned goal', () => {
        const g = createGoal('Old');
        deleteGoal(g.id);
        renameGoal(g.id, 'New');
        expect(goalsStore.getSnapshot().find(x => x.id === g.id)!.title).toBe('');
    });

    it('no-ops on a missing id', () => {
        expect(() => renameGoal('nope', 'New')).not.toThrow();
    });
});

describe('setGoalTargetDate', () => {
    it('accepts a real calendar date', () => {
        const g = createGoal('Goal');
        setGoalTargetDate(g.id, '2026-03-15');
        expect(byId(g.id).targetDate).toBe('2026-03-15');
    });

    it('rejects an impossible calendar date (2026-02-31)', () => {
        const g = createGoal('Goal');
        setGoalTargetDate(g.id, '2026-02-31');
        expect(byId(g.id).targetDate).toBeUndefined();
    });

    it.each(['2026-9-1', 'x', '2026/09/01', '26-09-01', ''])('rejects malformed date %s', (bad) => {
        const g = createGoal('Goal');
        setGoalTargetDate(g.id, '2026-01-01');
        setGoalTargetDate(g.id, bad);
        expect(byId(g.id).targetDate).toBe('2026-01-01');
    });

    it('null clears the target date', () => {
        const g = createGoal('Goal');
        setGoalTargetDate(g.id, '2026-01-01');
        setGoalTargetDate(g.id, null);
        expect(byId(g.id).targetDate).toBeUndefined();
    });

    it('no-ops on a tombstoned goal', () => {
        const g = createGoal('Goal');
        deleteGoal(g.id);
        setGoalTargetDate(g.id, '2026-01-01');
        expect(goalsStore.getSnapshot().find(x => x.id === g.id)!.targetDate).toBeUndefined();
    });
});

describe('addGoalAction', () => {
    it('appends a trimmed, capped action; creates an empty plan when missing', () => {
        const g = createGoal('Goal');
        addGoalAction(g.id, 'agentActions', `  ${'y'.repeat(250)}  `);
        expect(byId(g.id).plan!.agentActions).toEqual([{ text: 'y'.repeat(200), done: false }]);
        expect(byId(g.id).plan!.brief).toBe('');
    });

    it('empty text is a no-op', () => {
        const g = createGoal('Goal', plan());
        addGoalAction(g.id, 'userActions', '   ');
        expect(byId(g.id).plan!.userActions).toEqual([]);
    });

    it('appends onto an existing plan without touching the other side', () => {
        const g = createGoal('Goal', plan({ agentActions: [{ text: 'a1', done: true }] }));
        addGoalAction(g.id, 'agentActions', 'a2');
        expect(byId(g.id).plan!.agentActions).toEqual([{ text: 'a1', done: true }, { text: 'a2', done: false }]);
    });

    it('no-ops on a tombstoned goal', () => {
        const g = createGoal('Goal');
        deleteGoal(g.id);
        addGoalAction(g.id, 'agentActions', 'a1');
        expect(goalsStore.getSnapshot().find(x => x.id === g.id)!.plan).toBeUndefined();
    });
});

describe('editGoalAction', () => {
    it('replaces text (trimmed, capped) and drops a stale result', () => {
        const g = createGoal('Goal', plan({
            agentActions: [{ text: 'old', done: false, result: { ts: 1, text: 'stale output' } }],
        }));
        editGoalAction(g.id, 'agentActions', 0, `  ${'z'.repeat(210)}  `);
        expect(byId(g.id).plan!.agentActions[0]).toEqual({ text: 'z'.repeat(200), done: false });
    });

    it('out-of-range index is a no-op', () => {
        const g = createGoal('Goal', plan({ agentActions: [{ text: 'a', done: false }] }));
        editGoalAction(g.id, 'agentActions', 5, 'new');
        editGoalAction(g.id, 'agentActions', -1, 'new');
        expect(byId(g.id).plan!.agentActions).toEqual([{ text: 'a', done: false }]);
    });

    it('empty text is a no-op', () => {
        const g = createGoal('Goal', plan({ agentActions: [{ text: 'a', done: false }] }));
        editGoalAction(g.id, 'agentActions', 0, '   ');
        expect(byId(g.id).plan!.agentActions).toEqual([{ text: 'a', done: false }]);
    });

    it('same (exact) text is a no-op — does not clear an existing result', () => {
        const g = createGoal('Goal', plan({
            agentActions: [{ text: 'a', done: false, result: { ts: 1, text: 'kept' } }],
        }));
        editGoalAction(g.id, 'agentActions', 0, 'a');
        expect(byId(g.id).plan!.agentActions[0].result).toEqual({ ts: 1, text: 'kept' });
    });
});

describe('removeGoalAction', () => {
    it('removes the action at index', () => {
        const g = createGoal('Goal', plan({ agentActions: [{ text: 'a', done: false }, { text: 'b', done: false }] }));
        removeGoalAction(g.id, 'agentActions', 0);
        expect(byId(g.id).plan!.agentActions).toEqual([{ text: 'b', done: false }]);
    });

    it('out-of-range index is a no-op', () => {
        const g = createGoal('Goal', plan({ agentActions: [{ text: 'a', done: false }] }));
        removeGoalAction(g.id, 'agentActions', 9);
        expect(byId(g.id).plan!.agentActions).toEqual([{ text: 'a', done: false }]);
    });
});

describe('setGoalActionResult', () => {
    it('locates the action by text (after an index shift from edit/remove) and returns true', () => {
        const g = createGoal('Goal', plan({
            agentActions: [{ text: 'first', done: false }, { text: 'target', done: false }],
        }));
        // Simulate a run started against 'target' (index 1); before the result
        // lands, another row is removed, shifting 'target' to index 0. Lookup
        // by text must still find it, not index.
        removeGoalAction(g.id, 'agentActions', 0);
        expect(byId(g.id).plan!.agentActions).toEqual([{ text: 'target', done: false }]);

        vi.setSystemTime(5000);
        const ok = setGoalActionResult(g.id, 'agentActions', 'target', 'run output');
        expect(ok).toBe(true);
        expect(byId(g.id).plan!.agentActions[0].result).toEqual({ ts: 5000, text: 'run output' });
        vi.useRealTimers();
    });

    it('returns false and writes nothing when no action matches the text', () => {
        const g = createGoal('Goal', plan({ agentActions: [{ text: 'a', done: false }] }));
        const before = byId(g.id).updatedAt;
        const ok = setGoalActionResult(g.id, 'agentActions', 'missing', 'x');
        expect(ok).toBe(false);
        expect(byId(g.id).updatedAt).toBe(before);
    });

    it('null clears an existing result', () => {
        const g = createGoal('Goal', plan({
            agentActions: [{ text: 'a', done: false, result: { ts: 1, text: 'old' } }],
        }));
        const ok = setGoalActionResult(g.id, 'agentActions', 'a', null);
        expect(ok).toBe(true);
        expect(byId(g.id).plan!.agentActions[0].result).toBeUndefined();
    });

    it('caps result text at 4000 chars', () => {
        const g = createGoal('Goal', plan({ agentActions: [{ text: 'a', done: false }] }));
        setGoalActionResult(g.id, 'agentActions', 'a', 'q'.repeat(5000));
        expect(byId(g.id).plan!.agentActions[0].result!.text).toHaveLength(4000);
    });
});

describe('keepDone carries result forward on unchanged actions', () => {
    it('a refine (keepDone) preserves the run output of a matched action', () => {
        const g = createGoal('Goal', plan({
            agentActions: [{ text: 'Do the thing', done: true, result: { ts: 1, text: 'output from run' } }],
        }));
        updateGoalPlan(g.id, plan({
            agentActions: [{ text: 'do the thing.', done: false }], // normalized-equal, differs by case/punctuation
        }), { keepDone: true });
        const action = byId(g.id).plan!.agentActions[0];
        expect(action.done).toBe(true);
        expect(action.result).toEqual({ ts: 1, text: 'output from run' });
    });

    it('does not carry a result onto a genuinely new (non-matching) action', () => {
        const g = createGoal('Goal', plan({
            agentActions: [{ text: 'Old task', done: true, result: { ts: 1, text: 'out' } }],
        }));
        updateGoalPlan(g.id, plan({ agentActions: [{ text: 'Brand new task', done: false }] }), { keepDone: true });
        expect(byId(g.id).plan!.agentActions[0].result).toBeUndefined();
    });
});

describe('sanitize round-trip of targetDate/result through mergeGoals', () => {
    it('keeps a valid targetDate and result, drops invalid ones', () => {
        const validRaw = {
            id: 'g1', title: 'Goal', status: 'active', notes: [], createdAt: 1, updatedAt: 1,
            targetDate: '2026-03-15',
            plan: { brief: '', agentActions: [{ text: 'a', done: false, result: { ts: 10, text: 'out' } }], userActions: [], clarifyingQuestions: [] },
        };
        const invalidRaw = {
            id: 'g2', title: 'Goal2', status: 'active', notes: [], createdAt: 1, updatedAt: 1,
            targetDate: '2026-02-31',
            plan: { brief: '', agentActions: [{ text: 'a', done: false, result: { ts: 'nope', text: 5 } }], userActions: [], clarifyingQuestions: [] },
        };

        const merged = mergeGoals([validRaw, invalidRaw] as unknown as Goal[], []);
        const g1 = merged.find(g => g.id === 'g1')!;
        const g2 = merged.find(g => g.id === 'g2')!;

        expect(g1.targetDate).toBe('2026-03-15');
        expect(g1.plan!.agentActions[0].result).toEqual({ ts: 10, text: 'out' });

        expect(g2.targetDate).toBeUndefined();
        expect(g2.plan!.agentActions[0].result).toBeUndefined();
    });

    it('sanitizeGoal alone repairs a bad targetDate/result the same way', () => {
        const repaired = sanitizeGoal({
            id: 'g1', title: 'Goal', status: 'active', notes: [], createdAt: 1, updatedAt: 1,
            targetDate: 'not-a-date',
            plan: { brief: '', agentActions: [{ text: 'a', done: false, result: null }], userActions: [], clarifyingQuestions: [] },
        });
        expect(repaired!.targetDate).toBeUndefined();
        expect(repaired!.plan!.agentActions[0].result).toBeUndefined();
    });
});
