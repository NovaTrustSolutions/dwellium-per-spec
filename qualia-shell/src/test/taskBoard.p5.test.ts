/**
 * Plan 079 phase 5 (model / store / glance / commands) — written FROM THE CONTRACT
 * (plans/079-task-board-widget.md section 11, parts A + C, Acceptance).
 * Contract items: [A1] dueAt, [A2] isOverdue / lastColumnId / wipCount, [A3] MOVE_CARD toOrder,
 * [A4] sendToTaskBoard, [A5] findCardBoard / openTaskBoardCard, [A6] findCardsByTitle,
 * [A7] currentOwner, [A8] glance overdue, [C1] assistant commands.
 * New exports are looked up dynamically so a missing one is an assertion failure, not a crash.
 * Tests named `guard:` pin behaviour that already works and must not regress.
 * Overdue/not-overdue use far-past / far-future dates so the real clock never matters.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as M from '../components/TaskBoard/taskBoardModel';
import {
    applyAction, makeCard, undo, repairBoard, defaultColumns, cardsInColumn,
    type ActionContext, type BoardState, type BoardColumn, type TaskCard,
} from '../components/TaskBoard/taskBoardModel';
import * as TB from '../components/TaskBoard/taskBoardStore';
import * as ID from '../lib/perUserIdentity';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { parseCommand } from '../lib/dwelliumCommands';
import { assembleGlance, araGlanceStore, araGlanceUserIdHolder } from '../lib/araDailyGlance';
import { readWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';

vi.mock('../components/StrataDashboard/strataApi', () => ({
    strataGet: async () => { throw new Error('offline'); },
}));

// ── dynamic lookups of the phase-5 additions ──────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function fn<T extends (...a: any[]) => any>(ns: unknown, name: string): T {
    const f = (ns as Record<string, unknown>)[name];
    expect(typeof f, `export "${name}" is missing`).toBe('function');
    return f as T;
}
const isOverdue = (c: TaskCard, cols: BoardColumn[], today: string): boolean => fn<any>(M, 'isOverdue')(c, cols, today);
const lastColumnId = (cols: BoardColumn[]): string | undefined => fn<any>(M, 'lastColumnId')(cols);
const wipCount = (cards: TaskCard[], id: string): number => fn<any>(M, 'wipCount')(cards, id);
const sendToTaskBoard = (uid: string, f: { title: string; description?: string; urgency?: 'high' | 'medium' | 'low' }): Promise<{ board: string }> =>
    fn<any>(TB, 'sendToTaskBoard')(uid, f);
const findCardBoard = (uid: string, id: string): { projectId: string | null } | null => fn<any>(TB, 'findCardBoard')(uid, id);
const openTaskBoardCard = (uid: string, id: string): boolean => fn<any>(TB, 'openTaskBoardCard')(uid, id);
const findCardsByTitle = (q: string): TaskCard[] => fn<any>(TB, 'findCardsByTitle')(q);
const currentOwner = (): string | null => fn<any>(ID, 'currentOwner')();

// ── fixtures ───────────────────────────────────────────────────────────
const USER = { kind: 'user' } as const;
const PAST = '2000-01-01';
const FUTURE = '2999-06-15';
function det(): ActionContext {
    let c = 0, i = 0;
    return { now: () => `t${++c}`, id: () => `id${++i}` };
}
const ISO = '2026-01-01T00:00:00.000Z';
const mkCard = (id: string, title = id, columnId = 'todo', extra: Partial<TaskCard> = {}): TaskCard =>
    ({ id, title, description: '', columnId, order: 0, createdAt: ISO, enteredColumnAt: ISO, ...extra });
const mkBoard = (...cards: TaskCard[]): BoardState => ({ columns: defaultColumns(), cards, audit: [] });
const seedLocal = (key: string, board: unknown): void => localStorage.setItem(key, JSON.stringify(board));
const lsBoard = (key: string): BoardState => repairBoard(JSON.parse(localStorage.getItem(key) ?? 'null'));
const col = (id: string, order: number): BoardColumn => ({ id, title: id.toUpperCase(), width: 288, order });

/** Board with todo = [A,B,C] (orders 0..2) and backlog = [X]; returns ids by title. */
function seeded(ctx: ActionContext): { b: BoardState; id: Record<string, string> } {
    let b: BoardState = { columns: defaultColumns(), cards: [], audit: [] };
    const add = (title: string, columnId: string, order: number): void => {
        b = applyAction(b, { type: 'ADD_CARD', card: makeCard(ctx, { title, columnId }, order) }, USER, ctx);
    };
    add('A', 'todo', 0); add('B', 'todo', 1); add('C', 'todo', 2); add('X', 'backlog', 0);
    return { b, id: Object.fromEntries(b.cards.map(c => [c.title, c.id])) };
}
const order = (b: BoardState, colId: string): string[] => cardsInColumn(b.cards, colId).map(c => c.title);
const orders = (b: BoardState, colId: string): number[] => cardsInColumn(b.cards, colId).map(c => c.order);
const snapshotPositions = (b: BoardState): Array<[string, string, number]> =>
    b.cards.map(c => [c.id, c.columnId, c.order] as [string, string, number]).sort();

// ════════════════════════════════════════════════════════════════════
describe('[A1] dueAt in the model', () => {
    const edit = (b: BoardState, cardId: string, dueAt: unknown): BoardState =>
        applyAction(b, { type: 'EDIT_CARD', cardId, patch: { dueAt } as any }, USER, det());

    it('sets a valid YYYY-MM-DD date', () => {
        const b = edit(mkBoard(mkCard('c')), 'c', '2026-09-05');
        expect((b.cards[0] as any).dueAt).toBe('2026-09-05');
    });

    it.each([['free text', 'tomorrow'], ['impossible date 2026-02-31', '2026-02-31'], ['month 13', '2026-13-01'], ['wrong shape', '2026-9-5'], ['empty string', ''], ['a number', 20260905]])(
        'ignores an invalid dueAt (%s): same object, no audit entry', (_label, bad) => {
            const b0 = mkBoard(mkCard('c'));
            const b1 = edit(b0, 'c', bad);
            expect(b1).toBe(b0);
            expect(b1.audit.length).toBe(0);
        });

    it('accepts a leap day and rejects a non-leap one', () => {
        expect((edit(mkBoard(mkCard('c')), 'c', '2028-02-29').cards[0] as any).dueAt).toBe('2028-02-29');
        const b0 = mkBoard(mkCard('c'));
        expect(edit(b0, 'c', '2027-02-29')).toBe(b0);
    });

    it('dueAt: null unsets an existing date', () => {
        const b = edit(mkBoard(mkCard('c', 'c', 'todo', { dueAt: '2026-09-05' } as any)), 'c', null);
        expect((b.cards[0] as any).dueAt ?? undefined).toBeUndefined();
    });

    it('dueAt: null on a card with no date is a no-op (same object)', () => {
        const b0 = mkBoard(mkCard('c'));
        expect(edit(b0, 'c', null)).toBe(b0);
    });

    it('undo restores the previous date, and unsets a date that was newly set', () => {
        const ctx = det();
        const b0 = mkBoard(mkCard('c', 'c', 'todo', { dueAt: '2026-09-05' } as any));
        const b1 = applyAction(b0, { type: 'EDIT_CARD', cardId: 'c', patch: { dueAt: '2026-10-10' } as any }, USER, ctx);
        expect((undo(b1, ctx, USER).state.cards[0] as any).dueAt).toBe('2026-09-05');

        const n0 = mkBoard(mkCard('n'));
        const n1 = applyAction(n0, { type: 'EDIT_CARD', cardId: 'n', patch: { dueAt: '2026-10-10' } as any }, USER, ctx);
        expect((undo(n1, ctx, USER).state.cards[0] as any).dueAt ?? undefined).toBeUndefined();
    });

    it('editing only dueAt leaves the other fields untouched', () => {
        const b = edit(mkBoard(mkCard('c', 'Title', 'todo', { urgency: 'high' })), 'c', '2026-09-05');
        expect(b.cards[0]).toMatchObject({ title: 'Title', columnId: 'todo', urgency: 'high' });
    });

    it('repairBoard keeps a valid dueAt', () => {
        const r = repairBoard({ cards: [{ id: 'a', title: 'a', columnId: 'todo', dueAt: '2026-09-05' }] });
        expect((r.cards[0] as any).dueAt).toBe('2026-09-05');
    });

    it.each([['garbage', 'soon'], ['impossible date', '2026-02-31'], ['non-string', 12345], ['null', null]])(
        'repairBoard drops an invalid dueAt (%s)', (_l, bad) => {
            const r = repairBoard({ cards: [{ id: 'a', title: 'a', columnId: 'todo', dueAt: bad }] });
            expect(r.cards.length).toBe(1);
            expect((r.cards[0] as any).dueAt ?? undefined).toBeUndefined();
        });
});

// ════════════════════════════════════════════════════════════════════
describe('[A2] isOverdue / lastColumnId / wipCount', () => {
    const cols = defaultColumns();

    it('lastColumnId is the column with the highest order (not the last in the array)', () => {
        expect(lastColumnId(cols)).toBe('done');
        expect(lastColumnId([col('z', 9), col('a', 0), col('m', 4)])).toBe('z');
    });

    it('lastColumnId is undefined for no columns', () => {
        expect(lastColumnId([])).toBeUndefined();
    });

    it('a card due before today is overdue', () => {
        expect(isOverdue(mkCard('c', 'c', 'todo', { dueAt: '2026-09-04' } as any), cols, '2026-09-05')).toBe(true);
    });

    it('a card due today is not overdue', () => {
        expect(isOverdue(mkCard('c', 'c', 'todo', { dueAt: '2026-09-05' } as any), cols, '2026-09-05')).toBe(false);
    });

    it('a card due after today is not overdue', () => {
        expect(isOverdue(mkCard('c', 'c', 'todo', { dueAt: '2026-09-06' } as any), cols, '2026-09-05')).toBe(false);
    });

    it('a card with no dueAt is not overdue', () => {
        expect(isOverdue(mkCard('c'), cols, '2026-09-05')).toBe(false);
    });

    it('a past-due card in the LAST column is not overdue (it is done)', () => {
        expect(isOverdue(mkCard('c', 'c', 'done', { dueAt: PAST } as any), cols, '2026-09-05')).toBe(false);
    });

    it('"last column" follows order, so a renamed/reordered last column counts as done', () => {
        const custom = [col('first', 0), col('shipped', 7), col('mid', 3)];
        expect(isOverdue(mkCard('c', 'c', 'shipped', { dueAt: PAST } as any), custom, '2026-09-05')).toBe(false);
        expect(isOverdue(mkCard('d', 'd', 'mid', { dueAt: PAST } as any), custom, '2026-09-05')).toBe(true);
    });

    it('wipCount counts top-level cards of a column only', () => {
        const cards = [mkCard('a', 'a', 'todo'), mkCard('b', 'b', 'todo'), mkCard('c', 'c', 'backlog')];
        expect(wipCount(cards, 'todo')).toBe(2);
        expect(wipCount(cards, 'backlog')).toBe(1);
        expect(wipCount(cards, 'done')).toBe(0);
    });

    it('wipCount excludes sub-tasks (parentId set) but counts parentId null/undefined', () => {
        const cards = [
            mkCard('p', 'p', 'todo'),
            mkCard('q', 'q', 'todo', { parentId: null }),
            mkCard('s1', 's1', 'todo', { parentId: 'p' }),
            mkCard('s2', 's2', 'todo', { parentId: 'p' }),
        ];
        expect(wipCount(cards, 'todo')).toBe(2);
    });
});

// ════════════════════════════════════════════════════════════════════
describe('[A3] MOVE_CARD with toOrder', () => {
    it('inserts at the index and renumbers the destination column 0..n-1', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.X, toColumnId: 'todo', toOrder: 1 }, USER, ctx);
        expect(order(out, 'todo')).toEqual(['A', 'X', 'B', 'C']);
        expect(orders(out, 'todo')).toEqual([0, 1, 2, 3]);
    });

    it('inserting at 0 puts the card first', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.X, toColumnId: 'todo', toOrder: 0 }, USER, ctx);
        expect(order(out, 'todo')).toEqual(['X', 'A', 'B', 'C']);
        expect(orders(out, 'todo')).toEqual([0, 1, 2, 3]);
    });

    it('moving into an empty column at index 0 works', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.X, toColumnId: 'done', toOrder: 0 }, USER, ctx);
        expect(order(out, 'done')).toEqual(['X']);
        expect(orders(out, 'done')).toEqual([0]);
    });

    it('a cross-column move re-stamps enteredColumnAt', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const before = b.cards.find(c => c.id === id.X)!.enteredColumnAt;
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.X, toColumnId: 'todo', toOrder: 1 }, USER, ctx);
        expect(out.cards.find(c => c.id === id.X)!.enteredColumnAt).not.toBe(before);
    });

    it('reorders inside one column: move C to the top', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.C, toColumnId: 'todo', toOrder: 0 }, USER, ctx);
        expect(order(out, 'todo')).toEqual(['C', 'A', 'B']);
        expect(orders(out, 'todo')).toEqual([0, 1, 2]);
    });

    it('reorders inside one column: move A down one place', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.A, toColumnId: 'todo', toOrder: 1 }, USER, ctx);
        expect(order(out, 'todo')).toEqual(['B', 'A', 'C']);
        expect(orders(out, 'todo')).toEqual([0, 1, 2]);
    });

    it('a same-column reorder keeps enteredColumnAt (the card did not change column)', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const before = b.cards.find(c => c.id === id.C)!.enteredColumnAt;
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.C, toColumnId: 'todo', toOrder: 0 }, USER, ctx);
        expect(out.cards.find(c => c.id === id.C)!.enteredColumnAt).toBe(before);
    });

    it('the inverse restores the prior position of EVERY card whose order changed (cross-column)', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.X, toColumnId: 'todo', toOrder: 0 }, USER, ctx);
        const inv: any = out.audit[out.audit.length - 1].inverse;
        expect(inv?.type).toBe('RESTORE_POSITIONS');
        const restored = applyAction(out, inv, USER, ctx);
        expect(snapshotPositions(restored)).toEqual(snapshotPositions(b));
        expect(order(restored, 'todo')).toEqual(['A', 'B', 'C']);
        expect(orders(restored, 'todo')).toEqual([0, 1, 2]);
    });

    it('undo() of a cross-column insert restores the original board positions', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.X, toColumnId: 'todo', toOrder: 1 }, USER, ctx);
        const back = undo(out, ctx, USER).state;
        expect(snapshotPositions(back)).toEqual(snapshotPositions(b));
        expect(back.cards.find(c => c.id === id.X)!.columnId).toBe('backlog');
    });

    it('undo() of a same-column reorder restores the original order numbers', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.C, toColumnId: 'todo', toOrder: 0 }, USER, ctx);
        expect(order(out, 'todo')).toEqual(['C', 'A', 'B']);
        const back = undo(out, ctx, USER).state;
        expect(order(back, 'todo')).toEqual(['A', 'B', 'C']);
        expect(orders(back, 'todo')).toEqual([0, 1, 2]);
    });

    it('moving to the index the card already holds is a no-op: same object, no audit entry', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.B, toColumnId: 'todo', toOrder: 1 }, USER, ctx);
        expect(out).toBe(b);
        expect(out.audit.length).toBe(b.audit.length);
    });

    it('guard: a move without toOrder still appends at the end of the destination', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        const out = applyAction(b, { type: 'MOVE_CARD', cardId: id.X, toColumnId: 'todo' }, USER, ctx);
        expect(order(out, 'todo')).toEqual(['A', 'B', 'C', 'X']);
    });

    it('guard: moving to an unknown column is a no-op', () => {
        const ctx = det();
        const { b, id } = seeded(ctx);
        expect(applyAction(b, { type: 'MOVE_CARD', cardId: id.X, toColumnId: 'ghost', toOrder: 0 }, USER, ctx)).toBe(b);
    });
});

// ════════════════════════════════════════════════════════════════════
describe('store: phase-5 helpers', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
        localStorage.clear();
        setPerUserIdentity(null);
        TB.taskBoardUserIdHolder.current = null;
        TB.taskBoardProjectIdHolder.current = null;
        TB.taskBoardStore.reset();
        resetWidgetMemory();
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setPerUserIdentity(null); });

    describe('[A7] currentOwner', () => {
        it('reflects the id setPerUserIdentity last set', () => {
            setPerUserIdentity('owner-1');
            expect(currentOwner()).toBe('owner-1');
            setPerUserIdentity('owner-2');
            expect(currentOwner()).toBe('owner-2');
        });
        it('is null when signed out', () => {
            setPerUserIdentity('owner-1');
            setPerUserIdentity(null);
            expect(currentOwner()).toBeNull();
        });
    });

    describe('[A4] sendToTaskBoard', () => {
        it('adds to the board the holders already point at when they belong to that user (Global)', async () => {
            TB.taskBoardUserIdHolder.current = 'u1';
            const r = await sendToTaskBoard('u1', { title: 'Buy filters' });
            expect(r.board).toBe('Global');
            expect(lsBoard('taskboard:u1').cards.map(c => c.title)).toEqual(['Buy filters']);
        });

        it('adds to the currently selected PROJECT board when the holders belong to that user', async () => {
            TB.taskBoardUserIdHolder.current = 'u1';
            TB.taskBoardProjectIdHolder.current = 'p1';
            const r = await sendToTaskBoard('u1', { title: 'Project job' });
            expect(r.board).toBe('p1');
            expect(lsBoard('taskboard:u1:p1').cards.map(c => c.title)).toEqual(['Project job']);
            expect(lsBoard('taskboard:u1').cards).toHaveLength(0);
            expect(TB.taskBoardProjectIdHolder.current).toBe('p1');
        });

        it('points the user holder at a DIFFERENT user and falls back to that user\'s Global board', async () => {
            TB.taskBoardUserIdHolder.current = 'u1';
            TB.taskBoardProjectIdHolder.current = 'p1';
            const r = await sendToTaskBoard('u2', { title: 'For u2' });
            expect(r.board).toBe('Global');
            expect(TB.taskBoardUserIdHolder.current).toBe('u2');
            expect(TB.taskBoardProjectIdHolder.current).toBeNull();
            expect(lsBoard('taskboard:u2').cards.map(c => c.title)).toEqual(['For u2']);
            expect(lsBoard('taskboard:u1:p1').cards).toHaveLength(0);
        });

        it('works when no user is selected yet (holders null)', async () => {
            const r = await sendToTaskBoard('u3', { title: 'First' });
            expect(r.board).toBe('Global');
            expect(TB.taskBoardUserIdHolder.current).toBe('u3');
            expect(lsBoard('taskboard:u3').cards.map(c => c.title)).toEqual(['First']);
        });

        it('trims the title and passes description and urgency through', async () => {
            await sendToTaskBoard('u1', { title: '  Fix boiler  ', description: 'Basement unit', urgency: 'high' });
            const card = lsBoard('taskboard:u1').cards[0];
            expect(card.title).toBe('Fix boiler');
            expect(card.description).toBe('Basement unit');
            expect(card.urgency).toBe('high');
        });

        it('a blank title creates no card and returns { board: "" }', async () => {
            const r = await sendToTaskBoard('u1', { title: '   ' });
            expect(r).toEqual({ board: '' });
            expect(lsBoard('taskboard:u1').cards).toHaveLength(0);
            expect(TB.taskBoardStore.getSnapshot().cards).toHaveLength(0);
        });

        it('goes through addCard: audited as a user ADD_CARD and undoable', async () => {
            await sendToTaskBoard('u1', { title: 'Audited' });
            const snap = TB.taskBoardStore.getSnapshot();
            expect(snap.audit[snap.audit.length - 1]).toMatchObject({ type: 'ADD_CARD', actor: { kind: 'user' } });
            TB.undo();
            expect(TB.taskBoardStore.getSnapshot().cards).toHaveLength(0);
        });
    });

    describe('[A5] findCardBoard / openTaskBoardCard', () => {
        beforeEach(() => {
            seedLocal('taskboard:u1', mkBoard(mkCard('c-global', 'Global job')));
            seedLocal('taskboard:u1:projA', mkBoard(mkCard('c-proj', 'Project job')));
            // look-alike users must never be scanned for u1
            seedLocal('taskboard:u10', mkBoard(mkCard('c-u10', 'u10 job')));
            seedLocal('taskboard:u10:projZ', mkBoard(mkCard('c-u10-proj', 'u10 project job')));
        });

        it('finds a card on the Global board (projectId null)', () => {
            expect(findCardBoard('u1', 'c-global')).toEqual({ projectId: null });
        });

        it('finds a card on a project board and reports its project id', () => {
            expect(findCardBoard('u1', 'c-proj')).toEqual({ projectId: 'projA' });
        });

        it('returns null for an unknown card', () => {
            expect(findCardBoard('u1', 'nope')).toBeNull();
        });

        it('ignores look-alike user ids: "u1" does not scan "u10" boards (and vice versa)', () => {
            expect(findCardBoard('u1', 'c-u10')).toBeNull();
            expect(findCardBoard('u1', 'c-u10-proj')).toBeNull();
            expect(findCardBoard('u10', 'c-u10-proj')).toEqual({ projectId: 'projZ' });
            expect(findCardBoard('u10', 'c-proj')).toBeNull();
        });

        it('reads a thin/old-shaped stored board through repairBoard', () => {
            seedLocal('taskboard:u1:thin', { cards: [{ id: 'thin-card', title: 't', columnId: 'todo' }] });
            expect(findCardBoard('u1', 'thin-card')).toEqual({ projectId: 'thin' });
        });

        it('openTaskBoardCard patches widget memory (project + open card) and opens the widget', () => {
            setPerUserIdentity('u1');
            const seen: Array<{ type: string; detail: any }> = [];
            const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation((e: Event) => { seen.push({ type: e.type, detail: (e as CustomEvent).detail }); return true; });
            expect(openTaskBoardCard('u1', 'c-proj')).toBe(true);
            const mem = readWidgetMemory<Record<string, unknown>>('task-board', {});
            expect(mem.activeProjectId).toBe('projA');
            expect(mem.openCardId).toBe('c-proj');
            const opened = seen.filter(e => e.type === 'dwellium:open-widget');
            expect(opened).toHaveLength(1);
            expect(opened[0].detail.widgetId).toBe('task-board');
            spy.mockRestore();
        });

        it('openTaskBoardCard for a Global card sets activeProjectId to "global"', () => {
            setPerUserIdentity('u1');
            expect(openTaskBoardCard('u1', 'c-global')).toBe(true);
            const mem = readWidgetMemory<Record<string, unknown>>('task-board', {});
            expect(mem.activeProjectId).toBe('global');
            expect(mem.openCardId).toBe('c-global');
        });

        it('openTaskBoardCard returns false and opens nothing when the card is not found', () => {
            setPerUserIdentity('u1');
            const seen: string[] = [];
            const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation((e: Event) => { seen.push(e.type); return true; });
            expect(openTaskBoardCard('u1', 'nope')).toBe(false);
            expect(seen).not.toContain('dwellium:open-widget');
            expect(readWidgetMemory<Record<string, unknown>>('task-board', {}).openCardId).toBeUndefined();
            spy.mockRestore();
        });
    });

    describe('[A6] findCardsByTitle', () => {
        beforeEach(() => {
            TB.taskBoardUserIdHolder.current = 'u1';
            TB.addCard({ title: 'Buy filters' });
            TB.addCard({ title: 'Buy filters now' });
            TB.addCard({ title: 'Pay rent' });
        });
        const titles = (q: string): string[] => findCardsByTitle(q).map(c => c.title).sort();

        it('an exact (case-insensitive) match wins over substring matches', () => {
            expect(titles('buy FILTERS')).toEqual(['Buy filters']);
        });

        it('falls back to substring matches when nothing is exact', () => {
            expect(titles('buy')).toEqual(['Buy filters', 'Buy filters now']);
            expect(titles('RENT')).toEqual(['Pay rent']);
        });

        it('returns [] when nothing matches', () => {
            expect(findCardsByTitle('zzz-nothing')).toEqual([]);
        });
    });
});

// ════════════════════════════════════════════════════════════════════
describe('[A8] daily glance: "— K overdue"', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
        localStorage.clear();
        araGlanceStore.reset();
        araGlanceUserIdHolder.current = 'g1';
        TB.taskBoardUserIdHolder.current = null;
        TB.taskBoardProjectIdHolder.current = null;
        TB.taskBoardStore.reset();
    });
    afterEach(() => { vi.unstubAllGlobals(); araGlanceUserIdHolder.current = null; });

    it('appends the overdue count across Global and project boards (done cards never count)', async () => {
        seedLocal('taskboard:g1', mkBoard(
            mkCard('A', 'A', 'todo', { dueAt: PAST } as any),
            mkCard('B', 'B', 'backlog', { dueAt: FUTURE } as any),
            mkCard('C', 'C', 'done', { dueAt: PAST } as any),
        ));
        seedLocal('taskboard:g1:p1', mkBoard(
            mkCard('D', 'D', 'in-progress', { dueAt: '2000-01-02' } as any),
            mkCard('E', 'E', 'backlog'),
        ));
        const text = await assembleGlance('g1');
        expect(text).toContain('4 tasks not done — 0 high urgency — 2 overdue');
    });

    it('keeps the high-urgency count in the line', async () => {
        seedLocal('taskboard:g1', mkBoard(mkCard('A', 'A', 'todo', { dueAt: PAST, urgency: 'high' } as any)));
        expect(await assembleGlance('g1')).toContain('1 task not done — 1 high urgency — 1 overdue');
    });

    it('guard: no "overdue" text when K is 0 (future dates, no dates)', async () => {
        seedLocal('taskboard:g1', mkBoard(mkCard('A', 'A', 'todo', { dueAt: FUTURE } as any), mkCard('B', 'B', 'todo')));
        const text = (await assembleGlance('g1')) ?? '';
        expect(text).toContain('2 tasks not done — 0 high urgency');
        expect(text).not.toMatch(/overdue/i);
    });

    it('guard: an overdue card that is Done does not make the line say overdue', async () => {
        seedLocal('taskboard:g1', mkBoard(mkCard('A', 'A', 'todo'), mkCard('B', 'B', 'done', { dueAt: PAST } as any)));
        expect((await assembleGlance('g1')) ?? '').not.toMatch(/overdue/i);
    });
});

// ════════════════════════════════════════════════════════════════════
describe('[C1] assistant commands (parseCommand)', () => {
    const toasts: string[] = [];
    const opened: Array<{ widgetId: string }> = [];
    const placed: Array<{ widgetId: string; regionId: string }> = [];
    const onToast = (e: Event): void => { toasts.push(String((e as CustomEvent).detail)); };
    const onOpen = (e: Event): void => { opened.push((e as CustomEvent).detail); };
    const onPlace = (e: Event): void => { placed.push((e as CustomEvent).detail); };

    // async so the add-task tests can await the hydrate-first send; every other command still runs synchronously inside the call.
    const run = async (said: string): Promise<boolean> => {
        const cmd = parseCommand(said);
        if (!cmd) return false;
        await cmd.run();
        return true;
    };
    const boardCards = (key = 'taskboard:u1'): TaskCard[] => lsBoard(key).cards;
    const byTitle = (t: string): TaskCard => TB.taskBoardStore.getSnapshot().cards.find(c => c.title === t)!;

    beforeEach(() => {
        vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
        localStorage.clear();
        toasts.length = 0; opened.length = 0; placed.length = 0;
        window.addEventListener('qualia-toast', onToast);
        window.addEventListener('dwellium:open-widget', onOpen);
        window.addEventListener('dwellium:place-widget', onPlace);
        setPerUserIdentity('u1');
        TB.taskBoardUserIdHolder.current = 'u1';
        TB.taskBoardProjectIdHolder.current = null;
        TB.taskBoardStore.reset();
        resetWidgetMemory();
    });
    afterEach(() => {
        window.removeEventListener('qualia-toast', onToast);
        window.removeEventListener('dwellium:open-widget', onOpen);
        window.removeEventListener('dwellium:place-widget', onPlace);
        vi.unstubAllGlobals();
        setPerUserIdentity(null);
    });

    describe('add task / add card / new task', () => {
        it.each(['add task Buy filters', 'add card Buy filters', 'new task Buy filters'])('"%s" parses and adds the card with its original casing', async (said) => {
            expect(parseCommand(said), said).not.toBeNull();
            await run(said);
            expect(boardCards().map(c => c.title)).toEqual(['Buy filters']);
        });

        it('toasts "Added to Task Board (Global board)"', async () => {
            await run('add task Buy filters');
            expect(toasts).toContain('Added to Task Board (Global board)');
        });

        it('says "a project board" (never the raw project id) when one is selected', async () => {
            TB.taskBoardProjectIdHolder.current = 'proj-9';
            await run('add task Paint hallway');
            expect(toasts).toContain('Added to Task Board (a project board)');
            expect(toasts.some(t => t.includes('proj-9'))).toBe(false);
            expect(boardCards('taskboard:u1:proj-9').map(c => c.title)).toEqual(['Paint hallway']);
        });

        it('politeness wrappers still work ("Hey ARA, please add task Buy filters")', () => {
            expect(parseCommand('Hey ARA, please add task Buy filters')).not.toBeNull();
        });

        it.each([
            ['please add task buy milk and eggs', 'buy milk and eggs'],
            ['Hey ARA, please add task Buy milk and eggs', 'Buy milk and eggs'],
            ['could you add task call Bob, then Sue', 'call Bob, then Sue'],
            ['can you please add card fix door; paint wall', 'fix door; paint wall'],
        ])('polite "%s" keeps the whole title (never split on and / , / then)', async (said, title) => {
            await run(said);
            expect(boardCards().map(c => c.title)).toEqual([title]);
        });

        it('with no signed-in owner nothing is written and the user is told to sign in', async () => {
            setPerUserIdentity(null);
            TB.taskBoardUserIdHolder.current = null;
            expect(parseCommand('add task Buy filters')).not.toBeNull();
            await run('add task Buy filters');
            expect(toasts).toContain('Sign in to use the Task Board');
            const written = Object.keys(localStorage).filter(k => k.startsWith('taskboard:')).flatMap(k => boardCards(k));
            expect(written).toHaveLength(0);
            expect(TB.taskBoardStore.getSnapshot().cards).toHaveLength(0);
        });

        it('guard: "add a note about x" is not captured as a task', () => {
            run('add a note about x');
            expect(boardCards()).toHaveLength(0);
            expect(toasts.some(t => /Task Board/.test(t))).toBe(false);
        });

        it('guard: a question mentioning tasks still falls through to chat', () => {
            expect(parseCommand('what tasks are due this week')).toBeNull();
        });
    });

    describe('open task <query>', () => {
        beforeEach(() => {
            TB.addCard({ title: 'Buy filters' });
            TB.addCard({ title: 'Fix boiler' });
            TB.addCard({ title: 'Fix door' });
        });

        it('one match opens that card on the Task Board', () => {
            expect(parseCommand('open task boiler')).not.toBeNull();
            run('open task boiler');
            expect(opened.map(o => o.widgetId)).toEqual(['task-board']);
            expect(readWidgetMemory<Record<string, unknown>>('task-board', {}).openCardId).toBe(byTitle('Fix boiler').id);
        });

        it('no match toasts and opens nothing', () => {
            expect(parseCommand('open task zzz-nothing')).not.toBeNull();
            run('open task zzz-nothing');
            expect(toasts.length).toBeGreaterThan(0);
            expect(opened).toHaveLength(0);
            expect(readWidgetMemory<Record<string, unknown>>('task-board', {}).openCardId).toBeUndefined();
        });

        it('several matches toast and open nothing', () => {
            expect(parseCommand('open task fix')).not.toBeNull();
            run('open task fix');
            expect(toasts.length).toBeGreaterThan(0);
            expect(opened).toHaveLength(0);
            expect(readWidgetMemory<Record<string, unknown>>('task-board', {}).openCardId).toBeUndefined();
        });

        it('"open task buy milk and eggs" looks up the whole phrase (not split on "and")', async () => {
            TB.addCard({ title: 'Buy milk and eggs' });
            TB.addCard({ title: 'Buy milk' }); // a split on "and" would open this exact match instead
            await run('open task buy milk and eggs');
            expect(readWidgetMemory<Record<string, unknown>>('task-board', {}).openCardId).toBe(byTitle('Buy milk and eggs').id);
            expect(toasts.some(t => /No Task Board card/.test(t))).toBe(false);
        });

        it('guard: "open task board and open inbox" is still chained as two widget opens', async () => {
            await run('open task board and open inbox');
            expect(opened.map(o => o.widgetId)).toEqual(['task-board', 'inbox']);
        });

        it('an exact title wins over substring matches', () => {
            TB.addCard({ title: 'Fix' });
            run('open task fix');
            expect(readWidgetMemory<Record<string, unknown>>('task-board', {}).openCardId).toBe(byTitle('Fix').id);
        });
    });

    describe('move task <query> to <column>', () => {
        beforeEach(() => {
            TB.addCard({ title: 'Buy filters', columnId: 'todo' });
            TB.addCard({ title: 'Fix boiler', columnId: 'todo' });
            TB.addCard({ title: 'Fix door', columnId: 'todo' });
        });

        it('moves the one matching card into the column whose title matches (case-insensitive)', () => {
            expect(parseCommand('move task buy filters to Done')).not.toBeNull();
            run('move task buy filters to Done');
            expect(byTitle('Buy filters').columnId).toBe('done');
            expect(byTitle('Fix boiler').columnId).toBe('todo');
        });

        it('matches a multi-word column title ("in progress")', () => {
            run('move task boiler to in progress');
            expect(byTitle('Fix boiler').columnId).toBe('in-progress');
        });

        it('is a user action in the audit log, and toasts', () => {
            run('move task boiler to done');
            const snap = TB.taskBoardStore.getSnapshot();
            expect(snap.audit[snap.audit.length - 1]).toMatchObject({ type: 'MOVE_CARD', actor: { kind: 'user' } });
            expect(toasts.length).toBeGreaterThan(0);
        });

        it('an unknown column moves nothing and explains with a toast', () => {
            run('move task boiler to nowhere-land');
            expect(byTitle('Fix boiler').columnId).toBe('todo');
            expect(toasts.length).toBeGreaterThan(0);
        });

        it('several matching cards move nothing and explain with a toast', () => {
            run('move task fix to done');
            expect(byTitle('Fix boiler').columnId).toBe('todo');
            expect(byTitle('Fix door').columnId).toBe('todo');
            expect(toasts.length).toBeGreaterThan(0);
        });

        it('no matching card moves nothing and explains with a toast', () => {
            run('move task zzz-nothing to done');
            expect(TB.taskBoardStore.getSnapshot().cards.every(c => c.columnId === 'todo')).toBe(true);
            expect(toasts.length).toBeGreaterThan(0);
        });

        it('a column query matching several columns toasts the count and moves nothing', () => {
            run('move task boiler to o'); // "o" is in Backlog, To Do, In Progress and Done
            const n = TB.taskBoardStore.getSnapshot().columns.filter(c => c.title.toLowerCase().includes('o')).length;
            expect(n).toBeGreaterThan(1);
            expect(toasts).toContain(`${n} columns match "o"`);
            expect(byTitle('Fix boiler').columnId).toBe('todo');
        });

        describe('limits the board UI enforces', () => {
            it('refuses when the target column is at its WIP max (no move, toast says why)', () => {
                TB.updateColumnLimits('in-progress', undefined, 1);
                TB.moveCard(byTitle('Fix door').id, 'in-progress');
                toasts.length = 0;
                run('move task boiler to in progress');
                expect(byTitle('Fix boiler').columnId).toBe('todo');
                expect(toasts).toEqual([expect.stringMatching(/In Progress.*limit/i)]);
            });

            it('refuses when the target column is over its WIP max', () => {
                TB.moveCard(byTitle('Fix door').id, 'in-progress');
                TB.moveCard(byTitle('Buy filters').id, 'in-progress');
                TB.updateColumnLimits('in-progress', undefined, 1);
                run('move task boiler to in progress');
                expect(byTitle('Fix boiler').columnId).toBe('todo');
            });

            it('moves when the target column still has room', () => {
                TB.updateColumnLimits('in-progress', undefined, 2);
                TB.moveCard(byTitle('Fix door').id, 'in-progress');
                run('move task boiler to in progress');
                expect(byTitle('Fix boiler').columnId).toBe('in-progress');
            });

            it('sub-tasks do not count against, and are not blocked by, the limit', () => {
                TB.updateColumnLimits('in-progress', undefined, 1);
                TB.moveCard(byTitle('Fix door').id, 'in-progress');
                TB.addSubtask(byTitle('Buy filters').id, 'sub of filters'); // lands in To Do under its parent
                run('move task sub of filters to in progress');            // In Progress is full for top-level cards only
                expect(byTitle('sub of filters').columnId).toBe('in-progress');
            });

            it('refuses when the SOURCE column has exit criteria, naming the board as the place to confirm them', () => {
                TB.updateColumnPolicies('todo', ['Reviewed by Andy']);
                run('move task boiler to done');
                expect(byTitle('Fix boiler').columnId).toBe('todo');
                expect(toasts).toEqual([expect.stringMatching(/To Do has exit criteria — move it on the board so you can confirm them/)]);
            });

            it('exit criteria on the TARGET column do not block the move', () => {
                TB.updateColumnPolicies('done', ['Signed off']);
                run('move task boiler to done');
                expect(byTitle('Fix boiler').columnId).toBe('done');
            });
        });
    });

    describe('guards: existing commands are not captured', () => {
        it('guard: "move strata to the left" still parses as a placement', () => {
            expect(parseCommand('move strata to the left')).not.toBeNull();
            run('move strata to the left');
            expect(placed).toEqual([expect.objectContaining({ widgetId: 'strata-dashboard', regionId: 'left' })]);
        });

        it('guard: "put scribe on the right" still places the widget', () => {
            run('put scribe on the right');
            expect(placed).toEqual([expect.objectContaining({ widgetId: 'scribe', regionId: 'right' })]);
        });

        it('guard: "open strata" still opens the widget', () => {
            run('open strata');
            expect(opened).toEqual([expect.objectContaining({ widgetId: 'strata-dashboard' })]);
        });

        it('guard: "open task board" still opens the Task Board widget (not a card search)', () => {
            run('open task board');
            expect(opened).toEqual([expect.objectContaining({ widgetId: 'task-board' })]);
            expect(readWidgetMemory<Record<string, unknown>>('task-board', {}).openCardId).toBeUndefined();
        });

        it('guard: "tasks" bare name still opens the Task Board', () => {
            run('tasks');
            expect(opened).toEqual([expect.objectContaining({ widgetId: 'task-board' })]);
        });
    });
});

// ════════════════════════════════════════════════════════════════════
describe('phase-5 review fixes (model)', () => {
    const cols: BoardColumn[] = [...defaultColumns(), col('archive', 9)];

    it('isOverdue is false for a card in Done even when another column follows Done', () => {
        expect(isOverdue(mkCard('A', 'A', 'done', { dueAt: PAST } as any), cols, '2026-10-01')).toBe(false);
    });
    it('guard: isOverdue still true in an ordinary column, and for the last column unchanged', () => {
        expect(isOverdue(mkCard('A', 'A', 'todo', { dueAt: PAST } as any), cols, '2026-10-01')).toBe(true);
        expect(isOverdue(mkCard('B', 'B', 'archive', { dueAt: PAST } as any), cols, '2026-10-01')).toBe(false);
        expect(isOverdue(mkCard('C', 'C', 'done', { dueAt: PAST } as any), defaultColumns(), '2026-10-01')).toBe(false);
    });
    it('the daily glance and the card face agree: a Done card is not counted when a column follows Done', async () => {
        vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
        localStorage.clear();
        araGlanceStore.reset();
        araGlanceUserIdHolder.current = 'g2';
        TB.taskBoardUserIdHolder.current = null; TB.taskBoardProjectIdHolder.current = null; TB.taskBoardStore.reset();
        seedLocal('taskboard:g2', { columns: cols, cards: [mkCard('A', 'A', 'todo'), mkCard('B', 'B', 'done', { dueAt: PAST } as any)], audit: [] });
        expect((await assembleGlance('g2')) ?? '').not.toMatch(/overdue/i);
        vi.unstubAllGlobals(); araGlanceUserIdHolder.current = null;
    });

    it('makeCard trims, then caps the title at 500 characters', () => {
        const c = makeCard(det(), { title: `  ${'x'.repeat(700)}  `, columnId: 'todo' }, 0);
        expect(c.title).toBe('x'.repeat(500));
    });
    it('guard: a 500-character title and a short title are untouched; blank is still "Untitled task"', () => {
        expect(makeCard(det(), { title: 'y'.repeat(500), columnId: 'todo' }, 0).title).toHaveLength(500);
        expect(makeCard(det(), { title: ' Fix door ', columnId: 'todo' }, 0).title).toBe('Fix door');
        expect(makeCard(det(), { title: '   ', columnId: 'todo' }, 0).title).toBe('Untitled task');
    });
    it('a cap that would split a surrogate pair drops the half pair', () => {
        const t = makeCard(det(), { title: `${'a'.repeat(499)}\u{1F600}tail`, columnId: 'todo' }, 0).title;
        expect(t).toBe('a'.repeat(499));
    });
});
