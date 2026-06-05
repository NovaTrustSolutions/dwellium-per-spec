import { describe, it, expect, beforeEach } from 'vitest';
import {
    createInitialBoard, makeCard, applyAction, undo, undoLastAi, generateReport,
    cardsInColumn, type ActionContext, type BoardState,
} from '../components/TaskBoard/taskBoardModel';
import {
    taskBoardStore, taskBoardUserIdHolder, resetTaskBoard,
    addCard, moveCard, aiFileBacklog, undoLastAi as storeUndoLastAi,
} from '../components/TaskBoard/taskBoardStore';

// Deterministic context: monotonic clock + ids so assertions are stable.
function det(): ActionContext {
    let c = 0, i = 0;
    return { now: () => `t${++c}`, id: () => `id${++i}` };
}
const USER = { kind: 'user' } as const;
const ARA = { kind: 'ai', agent: 'ara' } as const;

function seed(ctx: ActionContext, columnId = 'backlog', title = 'Card'): BoardState {
    const board = createInitialBoard();
    const card = makeCard(ctx, { title, columnId }, 0);
    return applyAction(board, { type: 'ADD_CARD', card }, USER, ctx);
}

describe('taskBoardModel — timestamps', () => {
    it('ADD_CARD stamps createdAt == enteredColumnAt and logs a reversible audit entry', () => {
        const ctx = det();
        const board = seed(ctx);
        const card = board.cards[0];
        expect(card.createdAt).toBe('t1');
        expect(card.enteredColumnAt).toBe('t1');
        expect(board.audit).toHaveLength(1);
        expect(board.audit[0].actor).toEqual(USER);
        expect(board.audit[0].inverse).toEqual({ type: 'REMOVE_CARD', cardId: card.id });
    });

    it('MOVE_CARD to a NEW column re-stamps enteredColumnAt; createdAt never changes', () => {
        const ctx = det();
        const b1 = seed(ctx);
        const id = b1.cards[0].id;
        const created = b1.cards[0].createdAt;
        const enteredBefore = b1.cards[0].enteredColumnAt;
        const b2 = applyAction(b1, { type: 'MOVE_CARD', cardId: id, toColumnId: 'done' }, USER, ctx);
        const moved = b2.cards.find(c => c.id === id)!;
        expect(moved.columnId).toBe('done');
        expect(moved.createdAt).toBe(created);                 // unchanged
        expect(moved.enteredColumnAt).not.toBe(enteredBefore); // re-stamped
    });

    it('MOVE_CARD within the SAME column does NOT re-stamp enteredColumnAt', () => {
        const ctx = det();
        const b1 = seed(ctx);
        const id = b1.cards[0].id;
        const enteredBefore = b1.cards[0].enteredColumnAt;
        const b2 = applyAction(b1, { type: 'MOVE_CARD', cardId: id, toColumnId: 'backlog', toOrder: 5 }, USER, ctx);
        expect(b2.cards.find(c => c.id === id)!.enteredColumnAt).toBe(enteredBefore);
    });
});

describe('taskBoardModel — moves + inverses', () => {
    it('MOVE_CARD inverse restores the exact prior position', () => {
        const ctx = det();
        const b1 = seed(ctx, 'todo');
        const id = b1.cards[0].id;
        const prior = { columnId: b1.cards[0].columnId, order: b1.cards[0].order, enteredColumnAt: b1.cards[0].enteredColumnAt };
        const b2 = applyAction(b1, { type: 'MOVE_CARD', cardId: id, toColumnId: 'done' }, USER, ctx);
        const entry = b2.audit[b2.audit.length - 1];
        expect(entry.type).toBe('MOVE_CARD');
        expect(entry.inverse).toEqual({ type: 'RESTORE_POSITIONS', positions: [{ cardId: id, ...prior }] });
    });

    it('MOVE_CARDS (bulk) moves every card and logs ONE entry whose inverse restores all priors', () => {
        const ctx = det();
        let b = createInitialBoard();
        const c1 = makeCard(ctx, { title: 'A', columnId: 'backlog' }, 0);
        const c2 = makeCard(ctx, { title: 'B', columnId: 'backlog' }, 1);
        b = applyAction(b, { type: 'ADD_CARD', card: c1 }, USER, ctx);
        b = applyAction(b, { type: 'ADD_CARD', card: c2 }, USER, ctx);
        const auditLenBefore = b.audit.length;
        b = applyAction(b, { type: 'MOVE_CARDS', cardIds: [c1.id, c2.id], toColumnId: 'in-progress' }, USER, ctx);
        expect(cardsInColumn(b.cards, 'in-progress').map(c => c.id).sort()).toEqual([c1.id, c2.id].sort());
        expect(b.audit.length).toBe(auditLenBefore + 1); // single bulk entry
        const entry = b.audit[b.audit.length - 1];
        expect(entry.type).toBe('MOVE_CARDS');
        expect(entry.inverse?.type).toBe('RESTORE_POSITIONS');
        expect((entry.inverse as any).positions).toHaveLength(2);
    });
});

describe('taskBoardModel — resizable columns', () => {
    it('RESIZE_COLUMN updates width and its inverse restores the old width', () => {
        const ctx = det();
        const b1 = createInitialBoard();
        const oldWidth = b1.columns.find(c => c.id === 'todo')!.width;
        const b2 = applyAction(b1, { type: 'RESIZE_COLUMN', columnId: 'todo', width: 420 }, USER, ctx);
        expect(b2.columns.find(c => c.id === 'todo')!.width).toBe(420);
        expect(b2.audit[b2.audit.length - 1].inverse).toEqual({ type: 'RESIZE_COLUMN', columnId: 'todo', width: oldWidth });
    });
});

describe('taskBoardModel — audit actor + report', () => {
    it('an AI action records actor {kind:ai, agent} and appears in the AI-only report', () => {
        const ctx = det();
        const b1 = seed(ctx);
        const id = b1.cards[0].id;
        const b2 = applyAction(b1, { type: 'MOVE_CARD', cardId: id, toColumnId: 'done' }, ARA, ctx);
        const entry = b2.audit[b2.audit.length - 1];
        expect(entry.actor).toEqual(ARA);
        const report = generateReport(b2.audit, { onlyAi: true });
        expect(report).toContain('AI · ara');
        expect(report).not.toContain('You:'); // user ADD_CARD excluded from AI-only report
    });
});

describe('taskBoardModel — reversibility (the AI-undo requirement)', () => {
    it('undoLastAi reverses ONLY the AI action and restores exact prior card positions', () => {
        const ctx = det();
        // user adds two backlog cards
        let b = createInitialBoard();
        const c1 = makeCard(ctx, { title: 'A', columnId: 'backlog' }, 0);
        const c2 = makeCard(ctx, { title: 'B', columnId: 'backlog' }, 1);
        b = applyAction(b, { type: 'ADD_CARD', card: c1 }, USER, ctx);
        b = applyAction(b, { type: 'ADD_CARD', card: c2 }, USER, ctx);
        const before = b.cards.map(c => ({ id: c.id, columnId: c.columnId, order: c.order, enteredColumnAt: c.enteredColumnAt }));

        // AI files them into To Do
        b = applyAction(b, { type: 'MOVE_CARDS', cardIds: [c1.id, c2.id], toColumnId: 'todo' }, ARA, ctx);
        expect(cardsInColumn(b.cards, 'todo')).toHaveLength(2);

        // user undoes the AI action
        const { state: after, undone } = undoLastAi(b, ctx, USER);
        expect(undone?.actor).toEqual(ARA);
        const restored = after.cards.map(c => ({ id: c.id, columnId: c.columnId, order: c.order, enteredColumnAt: c.enteredColumnAt }));
        expect(restored.sort((a, z) => a.id < z.id ? -1 : 1)).toEqual(before.sort((a, z) => a.id < z.id ? -1 : 1));
        // original AI entry marked reversed + a truthful UNDO entry appended
        expect(after.audit.find(e => e.type === 'MOVE_CARDS')!.reversed).toBe(true);
        expect(after.audit[after.audit.length - 1].type).toBe('UNDO');
    });

    it('undo() with nothing reversible is a no-op', () => {
        const ctx = det();
        const empty = createInitialBoard();
        const { state, undone } = undo(empty, ctx, USER);
        expect(undone).toBeNull();
        expect(state).toEqual(empty);
    });
});

describe('taskBoardStore — per-user persistence', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
        taskBoardUserIdHolder.current = null;
        taskBoardStore.reset();
    });

    it('boards are isolated per user id', () => {
        taskBoardUserIdHolder.current = 'user-andy';
        taskBoardStore.reset();
        addCard({ title: 'Andy task', columnId: 'todo' });
        expect(taskBoardStore.getSnapshot().cards.some(c => c.title === 'Andy task')).toBe(true);

        // switch to Lisa → her board is independent + empty of Andy's card
        taskBoardUserIdHolder.current = 'user-lisa';
        expect(taskBoardStore.getSnapshot().cards.some(c => c.title === 'Andy task')).toBe(false);

        // back to Andy → his card persisted
        taskBoardUserIdHolder.current = 'user-andy';
        expect(taskBoardStore.getSnapshot().cards.some(c => c.title === 'Andy task')).toBe(true);
    });

    it('aiFileBacklog moves Backlog→To Do as AI and is reversible via undoLastAi', () => {
        taskBoardUserIdHolder.current = 'user-andy';
        taskBoardStore.reset();
        addCard({ title: 'Untriaged', columnId: 'backlog' });
        aiFileBacklog('ara');
        expect(cardsInColumn(taskBoardStore.getSnapshot().cards, 'todo').some(c => c.title === 'Untriaged')).toBe(true);

        storeUndoLastAi();
        expect(cardsInColumn(taskBoardStore.getSnapshot().cards, 'backlog').some(c => c.title === 'Untriaged')).toBe(true);
    });

    it('moveCard through the store writes an audit entry', () => {
        taskBoardUserIdHolder.current = 'user-andy';
        taskBoardStore.reset();
        addCard({ title: 'X', columnId: 'todo' });
        const id = taskBoardStore.getSnapshot().cards[0].id;
        const auditBefore = taskBoardStore.getSnapshot().audit.length;
        moveCard(id, 'done');
        const snap = taskBoardStore.getSnapshot();
        expect(snap.cards.find(c => c.id === id)!.columnId).toBe('done');
        expect(snap.audit.length).toBe(auditBefore + 1);
    });
});
