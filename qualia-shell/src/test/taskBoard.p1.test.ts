/**
 * Task Board phase 1 (plan 079 section 7) — written FROM THE CONTRACT.
 * Contract items are tagged [C1]..[C10]; tests marked "guard:" also pass on the
 * pre-phase-1 code (regression guards).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    createInitialBoard, makeCard, applyAction, undo, undoLastAi, cardTimeline, cardsInColumn,
    repairBoard, defaultColumns, DEFAULT_COLUMN_WIDTH,
    type ActionContext, type BoardState, type BoardColumn, type TaskCard, type AuditEntry,
} from '../components/TaskBoard/taskBoardModel';
import {
    taskBoardStore, taskBoardUserIdHolder, taskBoardProjectIdHolder,
    addCard, aiFileBacklog, removeColumn, undoLastAi as storeUndoLastAi, undo as storeUndo,
} from '../components/TaskBoard/taskBoardStore';

function det(): ActionContext {
    let c = 0, i = 0;
    return { now: () => `t${++c}`, id: () => `id${++i}` };
}
const USER = { kind: 'user' } as const;
const ARA = { kind: 'ai', agent: 'ara' } as const;

const visibleCount = (b: Pick<BoardState, 'columns' | 'cards'>): number =>
    b.columns.reduce((n, col) => n + cardsInColumn(b.cards, col.id).length, 0);

function expectCards(b: Pick<BoardState, 'columns' | 'cards'>, n: number): void {
    expect(b.cards.length).toBe(n);   // stored
    expect(visibleCount(b)).toBe(n);  // visible
}

function addTo(b: BoardState, ctx: ActionContext, columnId: string, title: string, actor = USER as any): BoardState {
    const order = b.cards.filter(c => c.columnId === columnId).length;
    return applyAction(b, { type: 'ADD_CARD', card: makeCard(ctx, { title, columnId }, order) }, actor, ctx);
}

/** Board with two Backlog cards "A" and "B". */
function twoBacklog(ctx: ActionContext): { b: BoardState; a: TaskCard; c: TaskCard } {
    let b = createInitialBoard();
    b = addTo(b, ctx, 'backlog', 'A');
    b = addTo(b, ctx, 'backlog', 'B');
    return { b, a: b.cards[0], c: b.cards[1] };
}

const col = (id: string, order: number, extra: Partial<BoardColumn> = {}): BoardColumn =>
    ({ id, title: id.toUpperCase(), width: 288, order, ...extra });

const last = (b: BoardState): AuditEntry => b.audit[b.audit.length - 1];

// ───────────────────────── [C3][C8] H1 end to end, pure model ─────────────────────────
describe('[H1] pure model: AI file Backlog -> remove Backlog -> Undo last AI -> Undo', () => {
    it('keeps 2 cards stored AND visible after every step', () => {
        const ctx = det();
        let { b } = twoBacklog(ctx);
        expectCards(b, 2);

        b = applyAction(b, { type: 'MOVE_CARDS', cardIds: b.cards.map(c => c.id), toColumnId: 'todo' }, ARA, ctx);
        expectCards(b, 2);

        b = applyAction(b, { type: 'REMOVE_COLUMN', columnId: 'backlog' }, USER, ctx);
        expect(b.columns.some(c => c.id === 'backlog')).toBe(false);
        expectCards(b, 2);

        const u1 = undoLastAi(b, ctx, USER);
        expect(u1.undone?.actor).toEqual(ARA);
        b = u1.state;
        expectCards(b, 2);

        const u2 = undo(b, ctx, USER);
        b = u2.state;
        expect(b.columns.some(c => c.id === 'backlog')).toBe(true);
        expectCards(b, 2);
    });

    it('[C3] RESTORE_POSITIONS into a removed column lands cards in the FIRST column, order = next, enteredColumnAt = now', () => {
        const ctx = { now: () => 'NOW', id: det().id };
        let b: BoardState = { columns: [col('b', 5), col('a', 1)], cards: [], audit: [] };
        b = addTo(b, ctx, 'a', 'resident');                       // a: order 0
        const mover = makeCard(ctx, { title: 'mover', columnId: 'b' }, 0);
        b = applyAction(b, { type: 'ADD_CARD', card: mover }, USER, ctx);
        const out = applyAction(b, {
            type: 'RESTORE_POSITIONS',
            positions: [{ cardId: mover.id, columnId: 'ghost', order: 99, enteredColumnAt: 'old' }],
        }, USER, ctx);
        const moved = out.cards.find(c => c.id === mover.id)!;
        expect(moved.columnId).toBe('a');           // lowest `order`, not first in array
        expect(moved.order).toBe(1);                // next after the resident (order 0)
        expect(moved.enteredColumnAt).toBe('NOW');
        expectCards(out, 2);
    });

    it('[C3] RESTORE_CARD whose column no longer exists goes to the first column', () => {
        const ctx = { now: () => 'NOW', id: det().id };
        let b: BoardState = { columns: [col('a', 0), col('z', 1)], cards: [], audit: [] };
        b = addTo(b, ctx, 'a', 'resident');
        const ghost = makeCard(ctx, { title: 'ghost', columnId: 'gone' }, 7);
        const out = applyAction(b, { type: 'RESTORE_CARD', card: ghost }, USER, ctx);
        const restored = out.cards.find(c => c.id === ghost.id)!;
        expect(restored.columnId).toBe('a');
        expect(restored.order).toBe(1);
        expect(restored.enteredColumnAt).toBe('NOW');
        expectCards(out, 2);
    });

    it('[C3] RESTORE_POSITIONS whose cards all no longer exist is "no change" (same object, no audit entry)', () => {
        const ctx = det();
        const { b } = twoBacklog(ctx);
        const out = applyAction(b, {
            type: 'RESTORE_POSITIONS',
            positions: [{ cardId: 'nope', columnId: 'todo', order: 0, enteredColumnAt: 'x' }],
        }, USER, ctx);
        expect(out).toBe(b);
        expect(out.audit.length).toBe(b.audit.length);
    });
});

// ───────────────────────── [C4] RESTORE_COLUMN ─────────────────────────
describe('[C4] RESTORE_COLUMN', () => {
    it('re-adds the column, adds only snapshot cards not already on the board, keeps current cards', () => {
        const ctx = det();
        let b = createInitialBoard();
        b = addTo(b, ctx, 'todo', 'in todo');                      // c1 (lives in todo now)
        b = addTo(b, ctx, 'backlog', 'in backlog');                // c2 (columnId === restored column)
        const [c1, c2] = b.cards;
        const stale = { ...c1, columnId: 'backlog' };              // snapshot copy of a card that has since moved
        const c3 = makeCard(ctx, { title: 'only in snapshot', columnId: 'backlog' }, 5);
        const backlogCol = b.columns.find(c => c.id === 'backlog')!;
        const withoutCol: BoardState = { ...b, columns: b.columns.filter(c => c.id !== 'backlog') };

        const out = applyAction(withoutCol, { type: 'RESTORE_COLUMN', column: backlogCol, cards: [stale, c3] }, USER, ctx);

        expect(out.columns.some(c => c.id === 'backlog')).toBe(true);
        expect(out.cards.map(c => c.id).sort()).toEqual([c1.id, c2.id, c3.id].sort()); // no dupes, none dropped
        expect(out.cards.find(c => c.id === c1.id)!.columnId).toBe('todo');             // not dragged back
        expect(out.cards.find(c => c.id === c2.id)!.columnId).toBe('backlog');          // kept
        expectCards(out, 3);
    });

    it('guard: remove a column with cards, Undo restores the column AND its cards', () => {
        const ctx = det();
        let b = createInitialBoard();
        b = addTo(b, ctx, 'todo', 'X');
        b = addTo(b, ctx, 'todo', 'Y');
        b = applyAction(b, { type: 'REMOVE_COLUMN', columnId: 'todo' }, USER, ctx);
        expect(b.cards.length).toBe(0);
        const { state } = undo(b, ctx, USER);
        expect(state.columns.some(c => c.id === 'todo')).toBe(true);
        expectCards(state, 2);
    });
});

// ───────────────────────── [C1][C2][C5] column guards ─────────────────────────
describe('[C1][C2][C5] missing / last column guards', () => {
    it('[C1] ADD_CARD to a column that does not exist lands in the first column (lowest order), order = next', () => {
        const ctx = det();
        let b: BoardState = { columns: [col('b', 5), col('a', 1)], cards: [], audit: [] };
        b = addTo(b, ctx, 'a', 'first');
        const ghost = makeCard(ctx, { title: 'ghost', columnId: 'nowhere' }, 0);
        const out = applyAction(b, { type: 'ADD_CARD', card: ghost }, USER, ctx);
        const added = out.cards.find(c => c.id === ghost.id)!;
        expect(added.columnId).toBe('a');
        expect(added.order).toBe(1);
        expectCards(out, 2);
    });

    it('[C2] MOVE_CARD to a missing column: no change, same state object, no audit entry', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: a.id, toColumnId: 'nowhere' }, USER, ctx);
        expect(out).toBe(b);
        expect(out.audit.length).toBe(b.audit.length);
    });

    it('[C2] MOVE_CARDS to a missing column: no change, same state object, no audit entry', () => {
        const ctx = det();
        const { b } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'MOVE_CARDS', cardIds: b.cards.map(c => c.id), toColumnId: 'nowhere' }, ARA, ctx);
        expect(out).toBe(b);
        expect(out.audit.length).toBe(b.audit.length);
    });

    it('[C5] REMOVE_COLUMN of the only remaining column: no change, same object, no audit entry', () => {
        const ctx = det();
        let b: BoardState = { columns: [col('only', 0)], cards: [], audit: [] };
        b = addTo(b, ctx, 'only', 'keep me');
        const out = applyAction(b, { type: 'REMOVE_COLUMN', columnId: 'only' }, USER, ctx);
        expect(out).toBe(b);
        expectCards(out, 1);
    });

    it('[C5] removing columns down to one, the last REMOVE_COLUMN is refused', () => {
        const ctx = det();
        let b = createInitialBoard();
        for (const id of ['backlog', 'todo', 'in-progress']) b = applyAction(b, { type: 'REMOVE_COLUMN', columnId: id }, USER, ctx);
        expect(b.columns.map(c => c.id)).toEqual(['done']);
        const out = applyAction(b, { type: 'REMOVE_COLUMN', columnId: 'done' }, USER, ctx);
        expect(out).toBe(b);
    });
});

// ───────────────────────── [C7] no-op actions ─────────────────────────
describe('[C7] no-op actions add no audit entry and return the same state object', () => {
    it('REMOVE_CARD with a missing id', () => {
        const ctx = det();
        const { b } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'REMOVE_CARD', cardId: 'missing' }, USER, ctx);
        expect(out).toBe(b);
        expect(out.audit.length).toBe(b.audit.length);
    });

    it('MOVE_CARDS where every id is missing', () => {
        const ctx = det();
        const { b } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'MOVE_CARDS', cardIds: ['x', 'y'], toColumnId: 'todo' }, ARA, ctx);
        expect(out).toBe(b);
        expect(out.audit.length).toBe(b.audit.length);
    });

    it('EDIT_CARD with the values the card already has', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'EDIT_CARD', cardId: a.id, patch: { title: a.title, description: a.description, tags: [...(a.tags ?? [])] } }, USER, ctx);
        expect(out).toBe(b);
        expect(out.audit.length).toBe(b.audit.length);
    });

    it('guard: LOG_EVENT still logs its entry (board data unchanged)', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'LOG_EVENT', summary: 'Sent it', cardId: a.id }, USER, ctx);
        expect(out.audit.length).toBe(b.audit.length + 1);
        expect(last(out).type).toBe('LOG_EVENT');
        expect(last(out).summary).toBe('Sent it');
        expect(out.cards).toEqual(b.cards);
    });
});

// ───────────────────────── [C2][C7] MOVE_CARDS details ─────────────────────────
describe('[C2][C7] MOVE_CARDS bookkeeping', () => {
    it('summary counts the cards actually moved ("Moved 1 card -> To Do") when others are missing', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'MOVE_CARDS', cardIds: [a.id, 'ghost1', 'ghost2'], toColumnId: 'todo' }, ARA, ctx);
        expect(last(out).summary).toBe('Moved 1 card → To Do');
    });

    it('duplicate ids are deduped: summary counts real moves, cardIds deduped, `to` set', () => {
        const ctx = det();
        const { b, a, c } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'MOVE_CARDS', cardIds: [a.id, a.id, c.id, a.id], toColumnId: 'todo' }, ARA, ctx);
        const e = last(out);
        expect(e.summary).toBe('Moved 2 cards → To Do');
        expect(e.cardIds).toEqual([a.id, c.id]);
        expect(e.to).toBe('todo');
    });

    it('duplicate ids: applying the inverse restores the ORIGINAL column and order', () => {
        const ctx = det();
        const { b, a, c } = twoBacklog(ctx);
        const moved = applyAction(b, { type: 'MOVE_CARDS', cardIds: [a.id, a.id, c.id], toColumnId: 'todo' }, ARA, ctx);
        const { state } = undoLastAi(moved, ctx, USER);
        for (const orig of [a, c]) {
            const now = state.cards.find(x => x.id === orig.id)!;
            expect(now.columnId).toBe('backlog');
            expect(now.order).toBe(orig.order);
            expect(now.enteredColumnAt).toBe(orig.enteredColumnAt);
        }
    });

    it('MOVE_CARD entry carries `to` and cardIds [id]', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: a.id, toColumnId: 'done' }, USER, ctx);
        expect(last(out).to).toBe('done');
        expect(last(out).cardIds).toEqual([a.id]);
    });
});

// ───────────────────────── [C8] undo semantics ─────────────────────────
describe('[C8] undo / undoLastAi', () => {
    it('nothing reversible -> { state (same object), undone: null, changed: false }', () => {
        const ctx = det();
        const empty = createInitialBoard();
        const r = undo(empty, ctx, USER);
        expect(r.undone).toBeNull();
        expect(r.changed).toBe(false);
        expect(r.state).toBe(empty);
        const r2 = undoLastAi(empty, ctx, USER);
        expect(r2.state).toBe(empty);
        expect(r2.changed).toBe(false);
    });

    it('a normal undo reports changed === true and "Reverted: <summary>"', () => {
        const ctx = det();
        const { b } = twoBacklog(ctx);
        const moved = applyAction(b, { type: 'MOVE_CARDS', cardIds: b.cards.map(c => c.id), toColumnId: 'todo' }, ARA, ctx);
        const r = undoLastAi(moved, ctx, USER);
        expect(r.changed).toBe(true);
        expect(last(r.state).type).toBe('UNDO');
        expect(last(r.state).summary).toBe(`Reverted: ${r.undone!.summary}`);
    });

    it('M1: user moved one card after the AI bulk move -> that card stays put, the other goes back', () => {
        const ctx = det();
        const { b, a, c } = twoBacklog(ctx);
        let s = applyAction(b, { type: 'MOVE_CARDS', cardIds: [a.id, c.id], toColumnId: 'todo' }, ARA, ctx);
        s = applyAction(s, { type: 'MOVE_CARD', cardId: c.id, toColumnId: 'done' }, USER, ctx);

        const r = undoLastAi(s, ctx, USER);
        expect(r.changed).toBe(true);
        expect(r.state.cards.find(x => x.id === c.id)!.columnId).toBe('done');      // user's decision survives
        const back = r.state.cards.find(x => x.id === a.id)!;
        expect(back.columnId).toBe('backlog');
        expect(back.order).toBe(a.order);
        expect(back.enteredColumnAt).toBe(a.enteredColumnAt);
        expect(last(r.state).type).toBe('UNDO');
        expect(last(r.state).summary).toBe(`Reverted: ${r.undone!.summary} (skipped 1 card(s) moved since)`);
        expectCards(r.state, 2);
    });

    it('M1: every card moved since -> "Nothing to revert:", changed false, target still marked reversed', () => {
        const ctx = det();
        const { b, a, c } = twoBacklog(ctx);
        let s = applyAction(b, { type: 'MOVE_CARDS', cardIds: [a.id, c.id], toColumnId: 'todo' }, ARA, ctx);
        s = applyAction(s, { type: 'MOVE_CARD', cardId: a.id, toColumnId: 'done' }, USER, ctx);
        s = applyAction(s, { type: 'MOVE_CARD', cardId: c.id, toColumnId: 'in-progress' }, USER, ctx);
        const cardsBefore = s.cards;

        const r = undoLastAi(s, ctx, USER);
        expect(r.changed).toBe(false);
        expect(r.state.cards).toEqual(cardsBefore);
        expect(r.state.audit.find(e => e.id === r.undone!.id)!.reversed).toBe(true);
        expect(last(r.state).type).toBe('UNDO');
        expect(last(r.state).summary).toBe(`Nothing to revert: ${r.undone!.summary}`);
    });

    it('M1: after a "Nothing to revert" the NEXT undo moves on to the previous entry', () => {
        const ctx = det();
        const { b, a, c } = twoBacklog(ctx);
        let s = applyAction(b, { type: 'MOVE_CARDS', cardIds: [a.id], toColumnId: 'todo' }, ARA, ctx);        // AI #1
        s = applyAction(s, { type: 'MOVE_CARDS', cardIds: [c.id], toColumnId: 'in-progress' }, ARA, ctx);      // AI #2
        s = applyAction(s, { type: 'MOVE_CARD', cardId: c.id, toColumnId: 'done' }, USER, ctx);                 // user overrides #2

        const first = undoLastAi(s, ctx, USER);
        expect(first.changed).toBe(false);                       // #2: nothing to revert
        const second = undoLastAi(first.state, ctx, USER);
        expect(second.undone?.id).not.toBe(first.undone?.id);    // moved on, not stuck on #2
        expect(second.changed).toBe(true);
        expect(second.state.cards.find(x => x.id === a.id)!.columnId).toBe('backlog');   // #1 reverted
        expect(second.state.cards.find(x => x.id === c.id)!.columnId).toBe('done');      // user's move untouched
    });

    it('guard: M1 a card the user DELETED after the AI move is not resurrected by undoLastAi', () => {
        const ctx = det();
        const { b, a, c } = twoBacklog(ctx);
        let s = applyAction(b, { type: 'MOVE_CARDS', cardIds: [a.id, c.id], toColumnId: 'todo' }, ARA, ctx);
        s = applyAction(s, { type: 'REMOVE_CARD', cardId: a.id }, USER, ctx);
        const r = undoLastAi(s, ctx, USER);
        expect(r.state.cards.map(x => x.id)).toEqual([c.id]);
        expect(r.state.cards[0].columnId).toBe('backlog');
        expectCards(r.state, 1);
    });

    it('entries WITHOUT `to` (written before this change) apply all positions', () => {
        const ctx = det();
        const { b, a, c } = twoBacklog(ctx);
        let s = applyAction(b, { type: 'MOVE_CARDS', cardIds: [a.id, c.id], toColumnId: 'todo' }, ARA, ctx);
        s = { ...s, audit: s.audit.map(e => { const { to, cardIds, ...legacy } = e; return legacy as AuditEntry; }) };
        s = applyAction(s, { type: 'MOVE_CARD', cardId: c.id, toColumnId: 'done' }, USER, ctx);
        const r = undoLastAi(s, ctx, USER);
        expect(r.state.cards.find(x => x.id === a.id)!.columnId).toBe('backlog');
        expect(r.state.cards.find(x => x.id === c.id)!.columnId).toBe('backlog');   // legacy behaviour: no "moved since" check
        expect(r.changed).toBe(true);
    });

    it('the UNDO entry copies the target cardId (single move) and cardIds (bulk move)', () => {
        const ctx = det();
        const { b, a, c } = twoBacklog(ctx);
        const single = applyAction(b, { type: 'MOVE_CARD', cardId: a.id, toColumnId: 'done' }, USER, ctx);
        expect(last(undo(single, ctx, USER).state).cardId).toBe(a.id);
        const bulk = applyAction(b, { type: 'MOVE_CARDS', cardIds: [a.id, c.id], toColumnId: 'todo' }, ARA, ctx);
        expect(last(undoLastAi(bulk, ctx, USER).state).cardIds).toEqual([a.id, c.id]);
    });
});

// ───────────────────────── [C6] EDIT_CARD ─────────────────────────
describe('[C6] EDIT_CARD', () => {
    it('ignores non-whitelisted keys (id, columnId) but applies the whitelisted ones', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'EDIT_CARD', cardId: a.id, patch: { id: 'hacked', columnId: 'done', order: 99, title: 'New' } as any }, USER, ctx);
        const card = out.cards.find(c => c.title === 'New')!;
        expect(card.id).toBe(a.id);
        expect(card.columnId).toBe('backlog');
        expect(card.order).toBe(a.order);
        expect(out.cards.some(c => c.id === 'hacked')).toBe(false);
    });

    it('a patch with ONLY non-whitelisted keys is "no change"', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'EDIT_CARD', cardId: a.id, patch: { columnId: 'done' } as any }, USER, ctx);
        expect(out).toBe(b);
    });

    it('trims the title; a blank title is ignored (other keys still apply)', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        const trimmed = applyAction(b, { type: 'EDIT_CARD', cardId: a.id, patch: { title: '  Hello  ' } }, USER, ctx);
        expect(trimmed.cards.find(c => c.id === a.id)!.title).toBe('Hello');

        const blankOnly = applyAction(b, { type: 'EDIT_CARD', cardId: a.id, patch: { title: '   ' } }, USER, ctx);
        expect(blankOnly).toBe(b);

        const mixed = applyAction(b, { type: 'EDIT_CARD', cardId: a.id, patch: { title: '   ', description: 'desc' } }, USER, ctx);
        const card = mixed.cards.find(c => c.id === a.id)!;
        expect(card.title).toBe(a.title);
        expect(card.description).toBe('desc');
    });

    it('urgency: null unsets the urgency', () => {
        const ctx = det();
        let b = createInitialBoard();
        b = applyAction(b, { type: 'ADD_CARD', card: makeCard(ctx, { title: 'U', columnId: 'todo', urgency: 'high' }, 0) }, USER, ctx);
        const id = b.cards[0].id;
        const out = applyAction(b, { type: 'EDIT_CARD', cardId: id, patch: { urgency: null } }, USER, ctx);
        expect(out.cards[0].urgency).toBeUndefined();
        expect(out).not.toBe(b);
    });

    it('keys equal to the current values are dropped from the inverse (only changed keys recorded)', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        const out = applyAction(b, { type: 'EDIT_CARD', cardId: a.id, patch: { title: a.title, description: 'changed' } }, USER, ctx);
        expect((last(out).inverse as any).patch).toEqual({ description: a.description });
    });

    it('JSON-equal arrays/objects count as equal (tags, assignee)', () => {
        const ctx = det();
        let b = createInitialBoard();
        const assignee = { kind: 'ai' as const, id: 'ara', label: 'ARA' };
        b = applyAction(b, { type: 'ADD_CARD', card: makeCard(ctx, { title: 'T', columnId: 'todo', tags: ['x', 'y'], assignee }, 0) }, USER, ctx);
        const id = b.cards[0].id;
        const out = applyAction(b, { type: 'EDIT_CARD', cardId: id, patch: { tags: ['x', 'y'], assignee: { ...assignee } } }, USER, ctx);
        expect(out).toBe(b);
    });

    it('undo of a FIRST urgency edit still works after a JSON round-trip of the whole board', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        expect(a.urgency).toBeUndefined();
        let s = applyAction(b, { type: 'EDIT_CARD', cardId: a.id, patch: { urgency: 'high' } }, USER, ctx);
        expect(s.cards.find(c => c.id === a.id)!.urgency).toBe('high');
        s = JSON.parse(JSON.stringify(s)) as BoardState;
        const r = undo(s, ctx, USER);
        expect(r.changed).toBe(true);
        expect(r.state.cards.find(c => c.id === a.id)!.urgency).toBeUndefined();
    });

    it('inverse writes `urgency: null` for a previously unset urgency and `tags: []` for previously undefined tags', () => {
        const ctx = det();
        let b = createInitialBoard();
        const bare = makeCard(ctx, { title: 'Bare', columnId: 'todo' }, 0);
        delete (bare as any).tags;
        delete (bare as any).urgency;
        b = applyAction(b, { type: 'ADD_CARD', card: bare }, USER, ctx);
        const out = applyAction(b, { type: 'EDIT_CARD', cardId: bare.id, patch: { urgency: 'low', tags: ['a'] } }, USER, ctx);
        const patch = (last(out).inverse as any).patch;
        expect(patch.urgency).toBeNull();
        expect(patch.tags).toEqual([]);
        // and it survives serialisation
        const rt = JSON.parse(JSON.stringify(last(out).inverse));
        expect(rt.patch.urgency).toBeNull();
        expect(rt.patch.tags).toEqual([]);
    });
});

// ───────────────────────── [C7] cardTimeline ─────────────────────────
describe('[C7] cardTimeline covers bulk moves and their undo', () => {
    it('includes MOVE_CARDS and the UNDO of it for EACH affected card, and nothing for unaffected cards', () => {
        const ctx = det();
        let { b, a, c } = twoBacklog(ctx);
        b = addTo(b, ctx, 'backlog', 'untouched');
        const other = b.cards[2];
        b = applyAction(b, { type: 'MOVE_CARDS', cardIds: [a.id, c.id], toColumnId: 'todo' }, ARA, ctx);
        b = undoLastAi(b, ctx, USER).state;

        for (const card of [a, c]) {
            const types = cardTimeline(b, card.id).map(e => e.type);
            expect(types).toContain('MOVE_CARDS');
            expect(types).toContain('UNDO');
        }
        expect(cardTimeline(b, other.id).map(e => e.type)).toEqual(['ADD_CARD']);
    });

    it('guard: single-card entries (ADD, MOVE_CARD) are still on the timeline, oldest first', () => {
        const ctx = det();
        const { b, a } = twoBacklog(ctx);
        const s = applyAction(b, { type: 'MOVE_CARD', cardId: a.id, toColumnId: 'done' }, USER, ctx);
        expect(cardTimeline(s, a.id).map(e => e.type)).toEqual(['ADD_CARD', 'MOVE_CARD']);
    });
});

// ───────────────────────── [C9] repairBoard ─────────────────────────
describe('[C9] repairBoard', () => {
    const goodCard = (over: Record<string, unknown> = {}) => ({
        id: 'k1', title: 'T', description: '', columnId: 'a', order: 0,
        createdAt: '2026-01-01T00:00:00.000Z', enteredColumnAt: '2026-01-01T00:00:00.000Z', ...over,
    });

    it('is exported and returns a valid board for a clean board (ids/titles/columns/cards preserved)', () => {
        const raw = { columns: [col('a', 0), col('b', 1)], cards: [goodCard(), goodCard({ id: 'k2', columnId: 'b', order: 1 })], audit: [] };
        const out = repairBoard(raw);
        expect(out.columns.map(c => c.id)).toEqual(['a', 'b']);
        expect(out.cards.map(c => [c.id, c.columnId, c.order, c.createdAt])).toEqual([
            ['k1', 'a', 0, '2026-01-01T00:00:00.000Z'], ['k2', 'b', 1, '2026-01-01T00:00:00.000Z'],
        ]);
    });

    it('one malformed column (no width) keeps the OTHER columns and repairs it; its cards stay', () => {
        const raw = {
            columns: [col('a', 0, { width: 300 }), { id: 'b', title: 'B', order: 1 }, col('c', 2, { width: 250 })],
            cards: [goodCard({ id: 'in-b', columnId: 'b' }), goodCard({ id: 'in-c', columnId: 'c' })],
            audit: [],
        };
        const out = repairBoard(raw);
        expect(out.columns.map(c => c.id)).toEqual(['a', 'b', 'c']);
        expect(out.columns.find(c => c.id === 'a')!.width).toBe(300);
        expect(out.columns.find(c => c.id === 'b')!.width).toBe(DEFAULT_COLUMN_WIDTH);
        expect(out.columns.find(c => c.id === 'c')!.width).toBe(250);
        expect(out.cards.find(c => c.id === 'in-b')!.columnId).toBe('b');
        expect(out.cards.find(c => c.id === 'in-c')!.columnId).toBe('c');
    });

    it('columns: width clamped to 200..640, non-string title -> "Untitled column", bad order -> index, duplicate id first wins', () => {
        const out = repairBoard({
            columns: [
                { id: 'a', title: 'A', width: 50, order: 0 },
                { id: 'b', title: 42, width: 9000, order: 'x' },
                { id: 'a', title: 'dupe', width: 288, order: 5 },
                { id: 'c', title: 'C', width: Number.POSITIVE_INFINITY, order: 3 },
            ],
            cards: [], audit: [],
        });
        expect(out.columns.map(c => c.id)).toEqual(['a', 'b', 'c']);
        expect(out.columns[0].width).toBe(200);
        expect(out.columns[0].title).toBe('A');            // first "a" won
        expect(out.columns[1].width).toBe(640);
        expect(out.columns[1].title).toBe('Untitled column');
        expect(out.columns[1].order).toBe(1);               // its index
        expect(out.columns[2].width).toBe(DEFAULT_COLUMN_WIDTH);
    });

    it('columns: entries without a string id are dropped; known optional fields kept when well-typed', () => {
        const out = repairBoard({
            columns: [null, 7, { title: 'no id', width: 300, order: 0 }, col('a', 1, { minWip: 1, maxWip: 5, policies: ['p1', 'p2'] })],
            cards: [], audit: [],
        });
        expect(out.columns.map(c => c.id)).toEqual(['a']);
        expect(out.columns[0].minWip).toBe(1);
        expect(out.columns[0].maxWip).toBe(5);
        expect(out.columns[0].policies).toEqual(['p1', 'p2']);
    });

    it.each([
        ['not an array', 'no'],
        ['empty array', []],
        ['nothing usable', [null, 3, { title: 'x' }]],
    ])('columns %s -> defaultColumns()', (_n, columns) => {
        const out = repairBoard({ columns, cards: [], audit: [] });
        expect(out.columns.map(c => c.id)).toEqual(defaultColumns().map(c => c.id));
    });

    it('a card with NO timestamps is kept, with valid ISO timestamps filled in', () => {
        const out = repairBoard({ columns: [col('a', 0)], cards: [{ id: 'k', title: 'T', columnId: 'a' }], audit: [] });
        expect(out.cards.length).toBe(1);
        expect(Number.isNaN(Date.parse(out.cards[0].createdAt))).toBe(false);
        expect(Number.isNaN(Date.parse(out.cards[0].enteredColumnAt))).toBe(false);
    });

    it('a missing timestamp copies the other one', () => {
        const ts = '2025-05-05T05:05:05.000Z';
        const out = repairBoard({
            columns: [col('a', 0)],
            cards: [{ id: 'x', title: 'T', columnId: 'a', createdAt: ts }, { id: 'y', title: 'T', columnId: 'a', enteredColumnAt: ts }, { id: 'z', title: 'T', columnId: 'a', createdAt: 12, enteredColumnAt: ts }],
            audit: [],
        });
        const by = (id: string) => out.cards.find(c => c.id === id)!;
        expect(by('x').enteredColumnAt).toBe(ts);
        expect(by('y').createdAt).toBe(ts);
        expect(by('z').createdAt).toBe(ts);
    });

    it('a card in an unknown column moves to the FIRST column (lowest order)', () => {
        const out = repairBoard({ columns: [col('b', 5), col('a', 1)], cards: [goodCard({ id: 'lost', columnId: 'vanished' })], audit: [] });
        expect(out.cards[0].columnId).toBe('a');
    });

    it('a card is NEVER dropped for a bad field: title, description, order repaired', () => {
        const out = repairBoard({
            columns: [col('a', 0)],
            cards: [
                goodCard({ id: 'blank', title: '   ' }),
                goodCard({ id: 'num', title: 5 }),
                goodCard({ id: 'desc', description: { x: 1 } }),
                goodCard({ id: 'ord', order: 'high' }),
            ],
            audit: [],
        });
        expect(out.cards.length).toBe(4);
        const by = (id: string) => out.cards.find(c => c.id === id)!;
        expect(by('blank').title).toBe('Untitled task');
        expect(by('num').title).toBe('Untitled task');
        expect(by('desc').description).toBe('');
        expect(by('ord').order).toBe(0);
    });

    it('cards without a string id are dropped; duplicate ids: first wins', () => {
        const out = repairBoard({
            columns: [col('a', 0)],
            cards: [null, 9, { title: 'no id', columnId: 'a' }, goodCard({ id: 'd', title: 'first' }), goodCard({ id: 'd', title: 'second' })],
            audit: [],
        });
        expect(out.cards.map(c => [c.id, c.title])).toEqual([['d', 'first']]);
    });

    it('audit: keeps objects with string id/type/summary, drops the rest', () => {
        const ok = { id: 'e1', ts: 't', actor: { kind: 'user' }, type: 'ADD_CARD', summary: 'Added', inverse: null };
        const out = repairBoard({
            columns: [col('a', 0)], cards: [],
            audit: [ok, null, 'junk', 7, { id: 1, type: 'x', summary: 's' }, { id: 'e2', type: 'x' }, { id: 'e3', summary: 's' }, { type: 'x', summary: 's' }],
        });
        expect(out.audit.map(e => e.id)).toEqual(['e1']);
    });

    it.each([[null], [undefined], [42], ['x'], [true], [[]], [{}], [{ columns: 'no' }], [{ columns: null, cards: 'no', audit: 5 }]])(
        'garbage input %j returns a valid board without throwing', (raw) => {
            let out!: BoardState;
            expect(() => { out = repairBoard(raw); }).not.toThrow();
            expect(Array.isArray(out.columns) && out.columns.length > 0).toBe(true);
            expect(Array.isArray(out.cards)).toBe(true);
            expect(Array.isArray(out.audit)).toBe(true);
            for (const c of out.columns) {
                expect(typeof c.id).toBe('string');
                expect(Number.isFinite(c.width)).toBe(true);
            }
        });

    it('does not mutate its input and is idempotent', () => {
        const raw = {
            columns: [{ id: 'a', title: 5, width: 9999 }, { id: 'b', title: 'B', width: 300, order: 1 }],
            cards: [{ id: 'k', title: '', columnId: 'zzz' }],
            audit: [{ id: 'e', type: 't', summary: 's' }, null],
        };
        const snapshot = JSON.parse(JSON.stringify(raw));
        const once = repairBoard(raw);
        expect(raw).toEqual(snapshot);
        expect(repairBoard(once)).toEqual(once);
    });
});

// ───────────────────────── store: [C9] deserializer path, [C10], H1 ─────────────────────────
describe('taskBoardStore (phase 1)', () => {
    const KEY = 'taskboard:user-p1';
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
        taskBoardUserIdHolder.current = 'user-p1';
        taskBoardProjectIdHolder.current = null;
        taskBoardStore.reset();
    });

    const snap = () => taskBoardStore.getSnapshot();

    it('[H1] store: addCard x2 -> aiFileBacklog -> removeColumn -> undoLastAi -> undo keeps 2 stored AND 2 visible at every step', () => {
        addCard({ title: 'A', columnId: 'backlog' });
        addCard({ title: 'B', columnId: 'backlog' });
        expectCards(snap(), 2);

        aiFileBacklog('ara');
        expectCards(snap(), 2);

        removeColumn('backlog');
        expect(snap().columns.some(c => c.id === 'backlog')).toBe(false);
        expectCards(snap(), 2);

        storeUndoLastAi();
        expectCards(snap(), 2);

        storeUndo();
        expect(snap().columns.some(c => c.id === 'backlog')).toBe(true);
        expectCards(snap(), 2);
    });

    it('guard: [C10] store undo() / undoLastAi() keep returning a BoardState (not { state })', () => {
        addCard({ title: 'A', columnId: 'backlog' });
        aiFileBacklog('ara');
        const r1 = storeUndoLastAi();
        expect(Array.isArray(r1.cards) && Array.isArray(r1.columns) && Array.isArray(r1.audit)).toBe(true);
        expect('state' in r1).toBe(false);
        const r2 = storeUndo();
        expect(Array.isArray(r2.cards) && Array.isArray(r2.columns) && Array.isArray(r2.audit)).toBe(true);
        expect('state' in r2).toBe(false);
    });

    it('[C10] addCard does not reorder the live snapshot\'s columns array in place', () => {
        const cols = [col('b', 5), col('a', 1), col('c', 3)];             // deliberately NOT sorted by `order`
        taskBoardStore.set({ columns: cols, cards: [], audit: [] }, () => { /* in-memory only */ });
        const before = snap().columns;
        const orderBefore = before.map(c => c.id);
        expect(orderBefore).toEqual(['b', 'a', 'c']);

        addCard({ title: 'no column given' });

        expect(before.map(c => c.id)).toEqual(orderBefore);               // same array reference, untouched
        expect(snap().columns.map(c => c.id)).toEqual(orderBefore);
        expect(snap().cards[0].columnId).toBe('a');                       // still lands in the lowest-order column
    });

    it('[C9] the store deserializer uses repairBoard: one malformed column keeps the others and the cards', () => {
        localStorage.setItem(KEY, JSON.stringify({
            columns: [col('a', 0), { id: 'b', title: 'B', order: 1 }, col('c', 2)],
            cards: [
                { id: 'k1', title: 'in b', columnId: 'b', description: '', order: 0, createdAt: 't', enteredColumnAt: 't' },
                { id: 'k2', title: 'no timestamps', columnId: 'c' },
                { id: 'k3', title: 'lost', columnId: 'gone', description: '', order: 0, createdAt: 't', enteredColumnAt: 't' },
            ],
            audit: [{ id: 'e1', type: 'ADD_CARD', summary: 's' }, 'junk'],
        }));
        taskBoardStore.reset();
        const s = snap();
        expect(s.columns.map(c => c.id)).toEqual(['a', 'b', 'c']);
        expect(s.columns.find(c => c.id === 'b')!.width).toBe(DEFAULT_COLUMN_WIDTH);
        expect(s.cards.map(c => c.id).sort()).toEqual(['k1', 'k2', 'k3']);
        expect(s.cards.find(c => c.id === 'k3')!.columnId).toBe('a');
        expect(s.audit.map(e => e.id)).toEqual(['e1']);
        expectCards(s, 3);
    });

    it('guard: unparseable JSON in storage falls back to the initial board', () => {
        localStorage.setItem(KEY, '{not json');
        taskBoardStore.reset();
        expect(snap().columns.map(c => c.id)).toEqual(['backlog', 'todo', 'in-progress', 'done']);
        expect(snap().cards).toEqual([]);
    });

    it('guard: [C9] a JSON-valid but non-object payload (42) falls back to a valid board', () => {
        localStorage.setItem(KEY, '42');
        taskBoardStore.reset();
        expect(snap().columns.length).toBeGreaterThan(0);
        expect(Array.isArray(snap().cards)).toBe(true);
    });
});

// ───────────────────────── orchestrator review pins ─────────────────────────
describe('[review] no fake revert, safe repaired audit, urgency whitelist', () => {
    it('Undo last AI after its column was removed leaves cards already in the fallback column untouched', () => {
        const ctx = det();
        let { b } = twoBacklog(ctx);
        b = applyAction(b, { type: 'MOVE_CARDS', cardIds: b.cards.map(c => c.id), toColumnId: 'todo' }, ARA, ctx);
        b = applyAction(b, { type: 'REMOVE_COLUMN', columnId: 'backlog' }, USER, ctx);
        const before = b.cards.map(c => ({ ...c }));
        const r = undoLastAi(b, ctx, USER);
        expect(r.changed).toBe(false);
        expect(last(r.state).summary).toMatch(/^Nothing to revert: /);
        expect(r.state.cards).toEqual(before); // order + enteredColumnAt (time-in-column) kept
        expectCards(r.state, 2);
    });

    it('repairBoard gives every audit entry a usable actor/ts and only a string-array cardIds', () => {
        const b = repairBoard({ audit: [{ id: 'x', type: 'MOVE_CARD', summary: 's', cardIds: 'abc', actor: 7 }] });
        expect(b.audit[0].actor).toEqual({ kind: 'user' });
        expect(typeof b.audit[0].ts).toBe('string');
        expect(b.audit[0].cardIds).toBeUndefined();
        expect(cardTimeline(b, 'b')).toHaveLength(0); // no substring match on a junk string
    });

    it('EDIT_CARD ignores an urgency value outside high/medium/low', () => {
        const ctx = det();
        const { b } = twoBacklog(ctx);
        const id = b.cards[0].id;
        const next = applyAction(b, { type: 'EDIT_CARD', cardId: id, patch: { urgency: 'urgent' as any } }, ARA, ctx);
        expect(next).toBe(b);
    });
});
