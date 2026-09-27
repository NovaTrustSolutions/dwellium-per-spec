/**
 * advisorActions — plan 068 phase 4 mutation-check suite. Real todoStore
 * (reset in beforeEach) + real personaWorkStore; oneSaveClient mocked like
 * src/test/llmUsage.test.ts so withSync's background sync never fires.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dismissAdvice, snoozeAdvice, undoAdvice, delegateTodo, reclaimTodo } from '../lib/advisorActions';
import { advisorCandidates } from '../lib/costAdvisor';
import { todoStore, todoUserIdHolder, addTodo, type TodoItem } from '../components/ThoughtWeaver/todoStore';
import { personaWorkStore, personaWorkUserIdHolder } from '../lib/agents/personaWorkStore';
import { HERMES_PERSONA_IDS } from '../lib/agents/personas';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

const HERMES_ID = HERMES_PERSONA_IDS[0];

function addOne(text = 'Call the vendor'): string {
    addTodo({ text, sourceCaptureId: null, priority: 'medium' });
    return todoStore.getSnapshot()[0].id;
}

function findTodo(id: string): TodoItem | undefined {
    return todoStore.getSnapshot().find(t => t.id === id);
}

beforeEach(() => {
    todoUserIdHolder.current = 'test-user';
    personaWorkUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    todoStore.reset();
    personaWorkStore.reset();
});

describe('dismissAdvice / snoozeAdvice / undoAdvice', () => {
    it('dismisses a to-do and undo clears it', () => {
        const id = addOne();
        expect(dismissAdvice(id)).toBe(true);
        expect(findTodo(id)?.advisor?.dismissed).toBe(true);

        expect(undoAdvice(id)).toBe(true);
        expect(findTodo(id)?.advisor?.dismissed).toBeUndefined();
    });

    it('snoozes a to-do and undo clears it', () => {
        const id = addOne();
        expect(snoozeAdvice(id, 12345)).toBe(true);
        expect(findTodo(id)?.advisor?.snoozedUntil).toBe(12345);

        expect(undoAdvice(id)).toBe(true);
        expect(findTodo(id)?.advisor?.snoozedUntil).toBeUndefined();
    });

    it('undo never clears an existing delegation', () => {
        const id = addOne();
        delegateTodo(id, HERMES_ID);
        dismissAdvice(id);

        expect(undoAdvice(id)).toBe(true);
        expect(findTodo(id)?.advisor?.dismissed).toBeUndefined();
        expect(findTodo(id)?.advisor?.delegatedTo?.personaId).toBe(HERMES_ID);
    });

    it('returns false and changes nothing for an unknown id', () => {
        const before = todoStore.getSnapshot();
        expect(dismissAdvice('nope')).toBe(false);
        expect(snoozeAdvice('nope', 1)).toBe(false);
        expect(undoAdvice('nope')).toBe(false);
        expect(todoStore.getSnapshot()).toEqual(before);
    });
});

describe('delegateTodo', () => {
    it('creates exactly one persona task, records delegatedTo, and leaves done=false', () => {
        const id = addOne('Draft the lease renewal');
        const taskId = delegateTodo(id, HERMES_ID);

        expect(taskId).toBeTruthy();
        const todo = findTodo(id)!;
        expect(todo.advisor?.delegatedTo).toMatchObject({ personaId: HERMES_ID, taskId });
        expect(todo.done).toBe(false);

        const work = personaWorkStore.getSnapshot()[HERMES_ID];
        expect(work?.tasks).toHaveLength(1);
        expect(work?.tasks[0]).toMatchObject({ id: taskId, title: 'Draft the lease renewal', assignedBy: 'user' });
    });

    it('is idempotent — a second call returns the same taskId without queuing a duplicate', () => {
        const id = addOne();
        const first = delegateTodo(id, HERMES_ID);
        const second = delegateTodo(id, HERMES_ID);

        expect(second).toBe(first);
        expect(personaWorkStore.getSnapshot()[HERMES_ID]?.tasks).toHaveLength(1);
    });

    it('rejects a non-Hermes persona id and queues nothing', () => {
        const id = addOne();
        expect(delegateTodo(id, 'not-a-hermes-persona')).toBeNull();
        expect(findTodo(id)?.advisor?.delegatedTo).toBeUndefined();
    });

    it('returns null for an unknown to-do id', () => {
        expect(delegateTodo('nope', HERMES_ID)).toBeNull();
    });
});

describe('reclaimTodo', () => {
    it('clears only the delegation, so the to-do is advised again and can be re-delegated', () => {
        addTodo({ text: 'Research tax deadlines', sourceCaptureId: null, priority: 'high' });
        const id = todoStore.getSnapshot()[0].id;
        const first = delegateTodo(id, HERMES_PERSONA_IDS[0]);
        expect(advisorCandidates(todoStore.getSnapshot())).toHaveLength(0);
        expect(reclaimTodo(id)).toBe(true);
        expect(todoStore.getSnapshot()[0].advisor?.delegatedTo).toBeUndefined();
        expect(advisorCandidates(todoStore.getSnapshot()).map(t => t.id)).toEqual([id]);
        const second = delegateTodo(id, HERMES_PERSONA_IDS[0]);
        expect(second).not.toBeNull();
        expect(second).not.toBe(first);
    });
    it('unknown id → false, nothing changes', () => {
        const before = todoStore.getSnapshot();
        expect(reclaimTodo('nope')).toBe(false);
        expect(todoStore.getSnapshot()).toBe(before);
    });
});
