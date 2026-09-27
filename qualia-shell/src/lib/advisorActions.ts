/**
 * advisorActions — plan 068 phase 4: per-to-do actions for the AI Spend advisor
 * card (dismiss/snooze/undo/delegate). Operates on ThoughtWeaver's own todoStore
 * (the user's "Today" list), not the persona work queue.
 *
 * ponytail: no captureOwner guard here — every function below reads the
 * snapshot and writes synchronously (no await between read and persist), so
 * there is no window for a cross-account write to land in the wrong user's
 * store (see Docs/code.md "Per-user stores: async writes landed in the next
 * account", which is specifically about *async* gaps).
 */
import { todoStore, updateTodo } from '../components/ThoughtWeaver/todoStore';
import { addTask } from './agents/personaWorkStore';
import { HERMES_PERSONA_IDS } from './agents/personas';

/** Hide this to-do from the advisor until the user un-dismisses it. */
export function dismissAdvice(todoId: string): boolean {
    return updateTodo(todoId, t => ({ ...t, advisor: { ...t.advisor, dismissed: true } }));
}

/** Hide this to-do from the advisor until `untilMs`. */
export function snoozeAdvice(todoId: string, untilMs: number): boolean {
    return updateTodo(todoId, t => ({ ...t, advisor: { ...t.advisor, snoozedUntil: untilMs } }));
}

/** Clear dismissed + snoozedUntil. Never clears delegatedTo — delegation isn't "advice", it's a fact. */
export function undoAdvice(todoId: string): boolean {
    return updateTodo(todoId, t => {
        const { dismissed, snoozedUntil, ...rest } = t.advisor ?? {};
        return { ...t, advisor: rest };
    });
}

/**
 * Hand this to-do to a Hermes persona: enqueues a task on that persona's
 * queue (personaWorkStore) and records the link on the to-do. Idempotent —
 * a second call on an already-delegated to-do returns the existing taskId
 * instead of queuing a duplicate. Does NOT mark the to-do done; the user
 * checks it off themselves once they see it's handled.
 */
export function delegateTodo(todoId: string, personaId: string): string | null {
    const todo = todoStore.getSnapshot().find(t => t.id === todoId);
    if (!todo) return null;
    if (todo.advisor?.delegatedTo) return todo.advisor.delegatedTo.taskId;
    if (!(HERMES_PERSONA_IDS as readonly string[]).includes(personaId)) return null;

    const taskId = addTask(personaId, todo.text, 'user');
    updateTodo(todoId, t => ({
        ...t,
        advisor: { ...t.advisor, delegatedTo: { personaId, taskId, at: new Date().toISOString() } },
    }));
    return taskId;
}
