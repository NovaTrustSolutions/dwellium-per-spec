/**
 * Plan 079 phase 2 — Task Board sync that cannot eat a board. Written from the
 * contract (plans/079-task-board-widget.md section 8), not from the code.
 *
 *   H2   headline: two boards, two server objects, survive a reload
 *   B1   boardObjectSuffix        B2  acceptRemote (via real hydrate)
 *   B4   bounded audit log        B5  attachment size guard
 *   B6   captureBoard / routeCard B7  localStorage quota error
 *   B8   daily glance counts every local board
 * (B3 + the toolbar alert are in taskBoard.p2.ui.test.tsx.)
 *
 * The One Save server is an in-memory fake keyed by object id that records every PUT.
 * A "page reload" = vi.resetModules() + fresh imports (new store cache AND new
 * oneSaveStore module state) while localStorage and the fake server are kept.
 * Tests named `guard:` pin behaviour that must NOT change.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createInitialBoard, defaultColumns, makeCard, applyAction, undo,
    type ActionContext, type BoardState, type AuditEntry, type TaskCard, type Attachment,
} from '../components/TaskBoard/taskBoardModel';

// ── fake One Save server (plain functions: survive vi.restoreAllMocks / resetModules) ──
const srv = vi.hoisted(() => ({
    objects: new Map<string, any>(),          // eslint-disable-line @typescript-eslint/no-explicit-any
    puts: [] as string[],                     // every object id written, in order
    getHook: null as null | ((id: string) => Promise<unknown>),
}));

vi.mock('../lib/oneSaveClient', () => {
    const store = (o: { id: string; type: string; ownerId: string; payload: unknown }) => {
        const now = '2026-01-01T00:00:00.000Z';
        srv.objects.set(o.id, {
            id: o.id, type: o.type, ownerId: o.ownerId, schema: 1, createdAt: now, updatedAt: now, deletedAt: null,
            payload: JSON.parse(JSON.stringify(o.payload)),
        });
        srv.puts.push(o.id);
    };
    return {
        ONE_SAVE_ENABLED: true,
        oneSaveClient: {
            get: async (id: string) => (srv.getHook ? srv.getHook(id) : (srv.objects.get(id) ?? null)),
            put: async (o: { id: string; type: string; ownerId: string; payload: unknown }) => { store(o); return srv.objects.get(o.id); },
            putBatch: async (objs: Array<{ id: string; type: string; ownerId: string; payload: unknown }>) => {
                objs.forEach(store);
                return { saved: objs.map(o => o.id), failed: [] };
            },
            listAll: async (uid: string) => [...srv.objects.values()].filter(o => o.ownerId === uid),
            remove: async () => true,
        },
    };
});

vi.mock('../components/StrataDashboard/strataApi', () => ({
    strataGet: async () => { throw new Error('offline'); },
}));

import * as TB from '../components/TaskBoard/taskBoardStore';
import { syncStatusStore } from '../lib/oneSaveStore';
import { araGlanceStore, araGlanceUserIdHolder, runDailyGlance } from '../lib/araDailyGlance';

/** Phase-2 exports, looked up dynamically so a missing one is an assertion failure, not a compile/runtime crash. */
interface P2Api {
    boardObjectSuffix?: (projectId: string | null) => string;
    captureBoard?: () => () => boolean;
    taskBoardSaveError?: { subscribe(l: () => void): () => void; getSnapshot(): string | null };
}
const p2 = (m: unknown): P2Api => m as P2Api;

// ── fixtures ───────────────────────────────────────────────────────
const ISO = '2026-01-01T00:00:00.000Z';
const mkCard = (id: string, title = id, columnId = 'todo', urgency?: 'high' | 'medium' | 'low'): TaskCard => ({
    id, title, description: '', columnId, order: 0, createdAt: ISO, enteredColumnAt: ISO, ...(urgency ? { urgency } : {}),
});
const mkBoard = (...cards: TaskCard[]): BoardState => ({ columns: defaultColumns(), cards, audit: [] });
const titles = (b: { cards: Array<{ title: string }> }): string[] => b.cards.map(c => c.title).sort();
const ids = (b: { cards: Array<{ id: string }> }): string[] => b.cards.map(c => c.id).sort();
const lsBoard = (key: string): BoardState => JSON.parse(localStorage.getItem(key) as string) as BoardState;
const seedLocal = (key: string, board: unknown): void => localStorage.setItem(key, JSON.stringify(board));
const putServer = (id: string, payload: unknown, ownerId = 'u1'): void => {
    srv.objects.set(id, { id, type: 'task-board', ownerId, schema: 1, createdAt: ISO, updatedAt: ISO, deletedAt: null, payload });
};
const serverBoard = (id: string): BoardState => srv.objects.get(id).payload as BoardState;
const flush = async (): Promise<void> => { await vi.advanceTimersByTimeAsync(3000); };

// A fresh "page load": new module instances for the store and the sync layer.
type TBModule = typeof import('../components/TaskBoard/taskBoardStore');
type SyncModule = typeof import('../lib/oneSaveStore');
interface App { tb: TBModule; sync: SyncModule; client: { get: (id: string) => Promise<unknown> } }
let live: SyncModule | null = null;
async function boot(uid: string | null, pid: string | null): Promise<App> {
    live?.syncStatusStore.reset();
    vi.resetModules();
    const tb = await import('../components/TaskBoard/taskBoardStore');
    const sync = await import('../lib/oneSaveStore');
    const { oneSaveClient } = await import('../lib/oneSaveClient');
    live = sync;
    tb.taskBoardUserIdHolder.current = uid;
    tb.taskBoardProjectIdHolder.current = pid;
    return { tb, sync, client: oneSaveClient as unknown as App['client'] };
}

beforeEach(() => {
    vi.useFakeTimers();
    srv.objects.clear();
    srv.puts.length = 0;
    srv.getHook = null;
    localStorage.clear();
    TB.taskBoardUserIdHolder.current = null;
    TB.taskBoardProjectIdHolder.current = null;
    TB.taskBoardStore.reset();
    syncStatusStore.reset();
});

afterEach(() => {
    live?.syncStatusStore.reset();
    live = null;
    syncStatusStore.reset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

// ════════════════════════════════════════════════════════════════════
describe('H2 acceptance: one server object per board', () => {
    it.each([false, true])(
        'edit Global, add a card on p1, back to Global, reload: each board keeps only its own cards (hydrate on every switch: %s)',
        async (hydrateOnSwitch) => {
            const a = await boot('u1', null);
            const goTo = async (pid: string | null): Promise<void> => {
                a.tb.taskBoardProjectIdHolder.current = pid;
                if (hydrateOnSwitch) { await a.tb.taskBoardStore.hydrate(); await a.tb.taskBoardStore.migrate(); }
            };

            a.tb.addCard({ title: 'G' });
            await goTo('p1');
            a.tb.addCard({ title: 'P' });
            await goTo('global');
            await flush();

            // the server holds two objects, each with its own board
            expect([...srv.objects.keys()].sort()).toEqual(['task-board_u1', 'task-board_u1__p1']);
            expect(titles(serverBoard('task-board_u1'))).toEqual(['G']);
            expect(titles(serverBoard('task-board_u1__p1'))).toEqual(['P']);

            // reload: new page, same localStorage + same server; login bootstrap hydrates the Global board first
            const b = await boot(null, null);
            await b.sync.oneSaveSync.bootstrap('u1');
            expect(b.tb.taskBoardUserIdHolder.current).toBe('u1');
            expect(titles(b.tb.taskBoardStore.getSnapshot())).toEqual(['G']);

            // then the Task Board mounts on p1 and hydrates that board (contract B3)
            b.tb.taskBoardProjectIdHolder.current = 'p1';
            await b.tb.taskBoardStore.hydrate();
            await b.tb.taskBoardStore.migrate();
            expect(titles(b.tb.taskBoardStore.getSnapshot())).toEqual(['P']);

            // and back to Global: still its own card only; nothing leaked either way, locally or remotely
            b.tb.taskBoardProjectIdHolder.current = 'global';
            await b.tb.taskBoardStore.hydrate();
            expect(titles(b.tb.taskBoardStore.getSnapshot())).toEqual(['G']);
            await flush();
            expect(titles(lsBoard('taskboard:u1'))).toEqual(['G']);
            expect(titles(lsBoard('taskboard:u1:p1'))).toEqual(['P']);
            expect(titles(serverBoard('task-board_u1'))).toEqual(['G']);
            expect(titles(serverBoard('task-board_u1__p1'))).toEqual(['P']);
        },
    );

    it('guard: a user who only ever uses the Global board keeps the legacy object id task-board_<uid>', async () => {
        const a = await boot('u1', null);
        a.tb.addCard({ title: 'only' });
        await flush();
        expect([...srv.objects.keys()]).toEqual(['task-board_u1']);
    });

    it('a GET in flight for Global is not applied after the user switches to p1', async () => {
        seedLocal('taskboard:u1:p1', mkBoard(mkCard('P1')));
        putServer('task-board_u1', mkBoard(mkCard('GS1')));
        const a = await boot('u1', 'global');

        let release!: (v: unknown) => void;
        srv.getHook = () => new Promise(res => { release = res; });
        const inFlight = a.tb.taskBoardStore.hydrate();        // GET for the Global object starts now
        a.tb.taskBoardProjectIdHolder.current = 'p1';          // user switches boards while it is in flight
        release(srv.objects.get('task-board_u1'));
        await inFlight;

        expect(ids(a.tb.taskBoardStore.getSnapshot())).toEqual(['P1']);
        expect(ids(lsBoard('taskboard:u1:p1'))).toEqual(['P1']);
    });
});

// ════════════════════════════════════════════════════════════════════
describe('B1 boardObjectSuffix', () => {
    const suffix = (pid: string | null): string => {
        const fn = p2(TB).boardObjectSuffix;
        expect(typeof fn).toBe('function');
        return (fn as (p: string | null) => string)(pid);
    };
    const UID = '123e4567-e89b-12d3-a456-426614174000'; // 36 chars
    const SAFE = /^[A-Za-z0-9_.-]+$/;

    it('is empty for the Global board (null or "global")', () => {
        expect(suffix(null)).toBe('');
        expect(suffix('global')).toBe('');
    });

    it('is __<slug> for a safe project id', () => {
        expect(suffix('p1')).toBe('__p1');
        expect(suffix('proj-A.2_x')).toBe('__proj-A.2_x');
    });

    it.each([
        ['slashes', 'a/b/../c'],
        ['spaces', 'my project 1'],
        ['unicode', 'проект-№1-日本語-🚀'],
        ['200 chars', 'x'.repeat(200)],
        ['200 unsafe chars', '/'.repeat(200)],
    ])('only yields [A-Za-z0-9_.-] and keeps the whole id within 128 chars (%s)', (_name, pid) => {
        const s = suffix(pid);
        expect(s).toMatch(/^__/);
        expect(s).toMatch(SAFE);
        expect(`task-board_${UID}${s}`.length).toBeLessThanOrEqual(128);
    });

    it('is stable: the same id always gives the same suffix', () => {
        expect(suffix('a b/c')).toBe(suffix('a b/c'));
    });

    it('gives two different ids that sanitize to the same text different suffixes', () => {
        expect(suffix('a b')).not.toBe(suffix('a/b'));
        expect(suffix('a b')).not.toBe(suffix('a_b')); // a safe id vs an unsafe id that sanitizes to it
        expect(suffix('проект-1')).not.toBe(suffix('проект-2'));
    });

    it('keeps two long ids that share the first 60 chars apart', () => {
        expect(suffix('x'.repeat(199) + 'a')).not.toBe(suffix('x'.repeat(199) + 'b'));
    });
});

// ════════════════════════════════════════════════════════════════════
describe('B2 acceptRemote (through the real hydrate)', () => {
    it('keeps a non-empty local board when the remote is empty, and pushes it', async () => {
        seedLocal('taskboard:u1:p1', mkBoard(mkCard('L1')));
        putServer('task-board_u1__p1', mkBoard());
        const a = await boot('u1', 'p1');

        await a.tb.taskBoardStore.hydrate();
        expect(ids(a.tb.taskBoardStore.getSnapshot())).toEqual(['L1']);
        await flush();
        expect(ids(serverBoard('task-board_u1__p1'))).toEqual(['L1']);
    });

    it('legacy check (Global): keeps local when the remote shares no card id, sets the flag, and pushes local', async () => {
        seedLocal('taskboard:u1', mkBoard(mkCard('L1')));
        putServer('task-board_u1', mkBoard(mkCard('R1')));
        const a = await boot('u1', null);

        await a.tb.taskBoardStore.hydrate();
        expect(ids(a.tb.taskBoardStore.getSnapshot())).toEqual(['L1']);
        expect(localStorage.getItem('taskboard:legacy-checked:u1')).not.toBeNull();
        await flush();
        expect(ids(serverBoard('task-board_u1'))).toEqual(['L1']);
    });

    it('legacy check is one-time: a SECOND hydrate with a disjoint remote now applies the remote', async () => {
        seedLocal('taskboard:u1', mkBoard(mkCard('L1')));
        putServer('task-board_u1', mkBoard(mkCard('R1')));
        const a = await boot('u1', null);

        await a.tb.taskBoardStore.hydrate();
        expect(ids(a.tb.taskBoardStore.getSnapshot())).toEqual(['L1']); // first hydrate: local kept
        await flush(); // local pushed, dirty marker cleared
        putServer('task-board_u1', mkBoard(mkCard('R2')));
        await a.tb.taskBoardStore.hydrate();
        expect(ids(a.tb.taskBoardStore.getSnapshot())).toEqual(['R2']);
    });

    it('applies an overlapping remote (shares a card id) and still sets the flag', async () => {
        seedLocal('taskboard:u1', mkBoard(mkCard('L1'), mkCard('L2')));
        putServer('task-board_u1', mkBoard(mkCard('L1', 'L1 edited elsewhere'), mkCard('R1')));
        const a = await boot('u1', null);

        await a.tb.taskBoardStore.hydrate();
        const snap = a.tb.taskBoardStore.getSnapshot();
        expect(ids(snap)).toEqual(['L1', 'R1']);
        expect(snap.cards.find(c => c.id === 'L1')?.title).toBe('L1 edited elsewhere');
        expect(localStorage.getItem('taskboard:legacy-checked:u1')).not.toBeNull();
    });

    it('guard: an empty local Global board takes any non-empty remote', async () => {
        putServer('task-board_u1', mkBoard(mkCard('R1')));
        const a = await boot('u1', null);
        await a.tb.taskBoardStore.hydrate();
        expect(ids(a.tb.taskBoardStore.getSnapshot())).toEqual(['R1']);
    });

    it('guard: the legacy check applies to the Global board only (a project board takes a disjoint remote)', async () => {
        seedLocal('taskboard:u1:p1', mkBoard(mkCard('L1')));
        putServer('task-board_u1__p1', mkBoard(mkCard('R1')));
        const a = await boot('u1', 'p1');
        await a.tb.taskBoardStore.hydrate();
        expect(ids(a.tb.taskBoardStore.getSnapshot())).toEqual(['R1']);
    });

    it.each([
        ['columns is a string', { columns: 'x' }],
        ['payload is a string', 'not a board'],
        ['payload is a number', 42],
        ['cards/columns are objects', { columns: { a: 1 }, cards: { b: 2 }, audit: 7 }],
    ])('repairs a garbage remote and applies it without throwing (%s)', async (_name, garbage) => {
        putServer('task-board_u1', garbage);
        const a = await boot('u1', null);
        await expect(a.tb.taskBoardStore.hydrate()).resolves.toBeUndefined();
        const snap = a.tb.taskBoardStore.getSnapshot();
        expect(Array.isArray(snap.columns)).toBe(true);
        expect(Array.isArray(snap.cards)).toBe(true);
        expect(Array.isArray(snap.audit)).toBe(true);
        expect((snap.columns ?? []).map(c => c.id)).toEqual(defaultColumns().map(c => c.id));
        expect(snap.cards).toEqual([]);
    });

    it('repairs a remote card with a bad column instead of dropping it', async () => {
        putServer('task-board_u1__p1', { columns: 'x', cards: [{ id: 'r1', title: 'Remote', columnId: 'gone' }] });
        const a = await boot('u1', 'p1');
        await a.tb.taskBoardStore.hydrate();
        const card = a.tb.taskBoardStore.getSnapshot().cards.find(c => c.id === 'r1');
        expect(card?.title).toBe('Remote');
        expect(a.tb.taskBoardStore.getSnapshot().columns.some(c => c.id === card?.columnId)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════
describe('B4 bounded audit log', () => {
    function det(): ActionContext { let c = 0, i = 0; return { now: () => `2026-01-01T00:00:${String(++c % 60).padStart(2, '0')}.000Z`, id: () => `id${++i}` }; }
    const USER = { kind: 'user' } as const;
    const att = (id = 'att1'): Attachment => ({ id, name: 'f.txt', size: 4, type: 'text/plain', addedAt: ISO, dataUrl: 'data:text/plain;base64,QUJD' });

    function withCard(ctx: ActionContext, withAttachment = false): { board: BoardState; cardId: string } {
        const card = makeCard(ctx, { title: 'A', columnId: 'todo' }, 0);
        let board = applyAction(createInitialBoard(), { type: 'ADD_CARD', card }, USER, ctx);
        if (withAttachment) board = applyAction(board, { type: 'ADD_ATTACHMENT', cardId: card.id, attachment: att() }, USER, ctx);
        return { board, cardId: card.id };
    }
    const events = (b: BoardState, ctx: ActionContext, n: number, from = 0): BoardState => {
        let cur = b;
        for (let i = 0; i < n; i++) cur = applyAction(cur, { type: 'LOG_EVENT', summary: `e${from + i}` }, USER, ctx);
        return cur;
    };
    const entry = (b: BoardState, type: AuditEntry['type']): AuditEntry => b.audit.find(e => e.type === type) as AuditEntry;

    it('keeps only the newest 500 entries after 600 actions', () => {
        const ctx = det();
        const b = events(createInitialBoard(), ctx, 600);
        expect(b.audit).toHaveLength(500);
        expect(b.audit[0].summary).toBe('e100');
        expect(b.audit[499].summary).toBe('e599');
    });

    it('undo also keeps the log at 500', () => {
        const ctx = det();
        const { board, cardId } = withCard(ctx);
        let b = events(board, ctx, 600);
        b = applyAction(b, { type: 'MOVE_CARD', cardId, toColumnId: 'done' }, USER, ctx);
        expect(b.audit).toHaveLength(500);
        const r = undo(b, ctx, USER);
        expect(r.undone?.type).toBe('MOVE_CARD');
        expect(r.state.audit).toHaveLength(500);
        expect(r.state.audit[499].type).toBe('UNDO');
    });

    it('drops a removed attachment inverse once it is older than the newest 50 entries, and undo skips it', () => {
        const ctx = det();
        const { board, cardId } = withCard(ctx, true);
        let b = applyAction(board, { type: 'REMOVE_ATTACHMENT', cardId, attachmentId: 'att1' }, USER, ctx);
        expect(entry(b, 'REMOVE_ATTACHMENT').inverse).not.toBeNull();
        b = events(b, ctx, 60);
        expect(entry(b, 'REMOVE_ATTACHMENT').inverse).toBeNull();
        const r = undo(b, ctx, USER);
        expect(r.undone?.type).not.toBe('REMOVE_ATTACHMENT');
        expect(r.state.cards[0].attachments ?? []).toEqual([]); // the attachment did not come back
    });

    it('window edge: an entry that is the 50th newest keeps its heavy inverse, the 51st loses it', () => {
        const ctx = det();
        const { board, cardId } = withCard(ctx, true);
        const removed = applyAction(board, { type: 'REMOVE_ATTACHMENT', cardId, attachmentId: 'att1' }, USER, ctx);
        expect(entry(events(removed, ctx, 49), 'REMOVE_ATTACHMENT').inverse).not.toBeNull();
        expect(entry(events(removed, ctx, 50), 'REMOVE_ATTACHMENT').inverse).toBeNull();
    });

    it('guard: a recent attachment removal still undoes, with its dataUrl', () => {
        const ctx = det();
        const { board, cardId } = withCard(ctx, true);
        let b = applyAction(board, { type: 'REMOVE_ATTACHMENT', cardId, attachmentId: 'att1' }, USER, ctx);
        b = events(b, ctx, 10);
        const r = undo(b, ctx, USER);
        expect(r.undone?.type).toBe('REMOVE_ATTACHMENT');
        expect(r.state.cards[0].attachments?.[0]?.dataUrl).toBe(att().dataUrl);
    });

    it('drops the inverse of a removed card that carried a dataUrl once it is older than 50 entries', () => {
        const ctx = det();
        const { board, cardId } = withCard(ctx, true);
        let b = applyAction(board, { type: 'REMOVE_CARD', cardId }, USER, ctx);
        expect(entry(b, 'REMOVE_CARD').inverse).not.toBeNull();
        b = events(b, ctx, 60);
        expect(entry(b, 'REMOVE_CARD').inverse).toBeNull();
    });

    it('drops a REPLACE_BOARD inverse once it is older than 50 entries; a recent one keeps it (guard)', () => {
        const ctx = det();
        const { board } = withCard(ctx);
        const replaced = applyAction(board, { type: 'REPLACE_BOARD', board: mkBoard(mkCard('x1')) }, USER, ctx);
        expect(entry(replaced, 'REPLACE_BOARD').inverse).not.toBeNull();
        expect(entry(events(replaced, ctx, 10), 'REPLACE_BOARD').inverse).not.toBeNull();
        expect(entry(events(replaced, ctx, 60), 'REPLACE_BOARD').inverse).toBeNull();
    });

    it('guard: a light inverse (MOVE_CARD) older than 50 entries still undoes', () => {
        const ctx = det();
        const { board, cardId } = withCard(ctx);
        let b = applyAction(board, { type: 'MOVE_CARD', cardId, toColumnId: 'done' }, USER, ctx);
        b = events(b, ctx, 60);
        expect(entry(b, 'MOVE_CARD').inverse).not.toBeNull();
        const r = undo(b, ctx, USER);
        expect(r.undone?.type).toBe('MOVE_CARD');
        expect(r.state.cards[0].columnId).toBe('todo');
    });
});

// ════════════════════════════════════════════════════════════════════
describe('B5 attachment size guard', () => {
    beforeEach(() => {
        TB.taskBoardUserIdHolder.current = 'u5';
        TB.taskBoardProjectIdHolder.current = null;
        TB.taskBoardStore.reset();
    });

    it('stores metadata only when the dataUrl would push the board past 700_000 chars', () => {
        const cardId = TB.addCard({ title: 'big' }).cards[0].id;
        const state = TB.attachToCard(cardId, { name: 'huge.bin', size: 650_000, type: 'application/octet-stream', dataUrl: 'x'.repeat(699_900) });
        const a = state.cards[0].attachments?.[0];
        expect(a?.name).toBe('huge.bin');
        expect(a?.dataUrl).toBeUndefined();
        expect(JSON.stringify(TB.taskBoardStore.getSnapshot()).length).toBeLessThan(700_000);
    });

    it('guard: a dataUrl that fits stays inline', () => {
        const cardId = TB.addCard({ title: 'small' }).cards[0].id;
        const state = TB.attachToCard(cardId, { name: 'ok.txt', size: 100, type: 'text/plain', dataUrl: 'data:text/plain;base64,QUJD' });
        expect(state.cards[0].attachments?.[0]?.dataUrl).toBe('data:text/plain;base64,QUJD');
    });

    it('counts what is already on the board: a second file that no longer fits goes metadata-only', () => {
        const cardId = TB.addCard({ title: 'two files' }).cards[0].id;
        const first = TB.attachToCard(cardId, { name: 'a.bin', size: 1, type: 'x', dataUrl: 'a'.repeat(400_000) });
        expect(first.cards[0].attachments?.[0]?.dataUrl).toHaveLength(400_000);
        const second = TB.attachToCard(cardId, { name: 'b.bin', size: 1, type: 'x', dataUrl: 'b'.repeat(400_000) });
        const atts = second.cards[0].attachments ?? [];
        expect(atts).toHaveLength(2);
        expect(atts[1].dataUrl).toBeUndefined();
    });
});

// ════════════════════════════════════════════════════════════════════
describe('B6 board-scoped async guard', () => {
    const ARA = { kind: 'ai', id: 'ara', label: 'ARA' } as const;
    const logEvents = (b: BoardState): AuditEntry[] => b.audit.filter(e => e.type === 'LOG_EVENT');

    beforeEach(() => {
        TB.taskBoardUserIdHolder.current = 'u6';
        TB.taskBoardProjectIdHolder.current = 'p1';
        TB.taskBoardStore.reset();
    });

    it('captureBoard() is true until the project holder changes', () => {
        const capture = p2(TB).captureBoard;
        expect(typeof capture).toBe('function');
        const still = (capture as () => () => boolean)();
        expect(still()).toBe(true);
        TB.taskBoardProjectIdHolder.current = 'p2';
        expect(still()).toBe(false);
    });

    it('captureBoard() is false after the user holder changes', () => {
        const capture = p2(TB).captureBoard;
        expect(typeof capture).toBe('function');
        const still = (capture as () => () => boolean)();
        expect(still()).toBe(true);
        TB.taskBoardUserIdHolder.current = 'someone-else';
        expect(still()).toBe(false);
    });

    function slowFetch(): { release: (ok: boolean) => void; fail: () => void } {
        const ctl = { release: (_ok: boolean) => { /* set below */ }, fail: () => { /* set below */ } };
        vi.stubGlobal('fetch', () => new Promise((resolve, reject) => {
            ctl.release = (ok) => resolve({ ok, status: ok ? 200 : 500 });
            ctl.fail = () => reject(new Error('offline'));
        }));
        return ctl;
    }

    it.each([['resolves ok', 'ok'], ['resolves 500', 'http'], ['rejects (offline)', 'offline']])(
        'routeCard whose fetch %s after a project switch writes no audit entry on either board and returns "none"',
        async (_name, mode) => {
            const cardId = TB.addCard({ title: 'Send me' }).cards[0].id;
            TB.assignCard(cardId, ARA);
            const ctl = slowFetch();

            const pending = TB.routeCard(cardId);
            TB.taskBoardProjectIdHolder.current = 'p2';          // user switches board while the request is in flight
            if (mode === 'offline') ctl.fail(); else ctl.release(mode === 'ok');
            const result = await pending;

            expect(result.status).toBe('none');
            expect(logEvents(TB.taskBoardStore.getSnapshot())).toEqual([]);   // p2 (current board)
            TB.taskBoardProjectIdHolder.current = 'p1';
            expect(logEvents(TB.taskBoardStore.getSnapshot())).toEqual([]);   // p1 (the card's board)
        },
    );

    it('guard: routeCard on an unchanged board still logs "sent" on the card', async () => {
        const cardId = TB.addCard({ title: 'Send me' }).cards[0].id;
        TB.assignCard(cardId, ARA);
        const ctl = slowFetch();
        const pending = TB.routeCard(cardId);
        ctl.release(true);
        const result = await pending;
        expect(result.status).toBe('sent');
        expect(logEvents(TB.taskBoardStore.getSnapshot())).toHaveLength(1);
    });
});

// ════════════════════════════════════════════════════════════════════
describe('B7 localStorage quota', () => {
    beforeEach(() => {
        TB.taskBoardUserIdHolder.current = 'u7';
        TB.taskBoardProjectIdHolder.current = null;
        TB.taskBoardStore.reset();
        // module-level error state outlives a test: one good write puts it back to "no error"
        TB.addCard({ title: 'warm-up' });
        localStorage.clear();
        TB.taskBoardStore.reset();
    });

    function failBoardWrites(): { restore: () => void } {
        const real = localStorage.setItem.bind(localStorage);
        const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
            if (k === 'taskboard:u7') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
            real(k, v);
        });
        return { restore: () => spy.mockRestore() };
    }

    it('sets taskBoardSaveError to a message when the board key cannot be written, and keeps the change in memory', () => {
        const err = p2(TB).taskBoardSaveError;
        expect(err).toBeDefined();
        expect(err?.getSnapshot()).toBeNull();
        const fail = failBoardWrites();
        expect(() => TB.addCard({ title: 'lost?' })).not.toThrow();
        fail.restore();
        expect(typeof err?.getSnapshot()).toBe('string');
        expect((err?.getSnapshot() as string).length).toBeGreaterThan(0);
        expect(titles(TB.taskBoardStore.getSnapshot())).toEqual(['lost?']);
    });

    it('clears the message on the next successful write and notifies subscribers both times', () => {
        const err = p2(TB).taskBoardSaveError;
        expect(err).toBeDefined();
        const listener = vi.fn();
        const unsubscribe = err?.subscribe(listener);
        const fail = failBoardWrites();
        TB.addCard({ title: 'one' });
        expect(listener).toHaveBeenCalled();
        const afterFail = listener.mock.calls.length;
        fail.restore();
        TB.addCard({ title: 'two' });
        expect(err?.getSnapshot()).toBeNull();
        expect(listener.mock.calls.length).toBeGreaterThan(afterFail);
        unsubscribe?.();
        expect(titles(lsBoard('taskboard:u7'))).toEqual(['one', 'two']);
    });

    it('guard: no message while writes succeed', () => {
        TB.addCard({ title: 'fine' });
        expect(p2(TB).taskBoardSaveError?.getSnapshot()).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════
describe('B8 daily glance counts every local board', () => {
    const post = vi.fn();
    beforeEach(() => {
        post.mockReset();
        vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
        araGlanceStore.reset();
        araGlanceUserIdHolder.current = 'u8';
        TB.taskBoardUserIdHolder.current = null;
        TB.taskBoardProjectIdHolder.current = null;
        TB.taskBoardStore.reset();
    });

    function seedBoards(): void {
        seedLocal('taskboard:u8', mkBoard(mkCard('A', 'A', 'todo', 'high'), mkCard('B', 'B', 'backlog', 'low'), mkCard('C', 'C', 'done', 'high')));
        // project board stored in a thin / old shape: must go through repairBoard
        seedLocal('taskboard:u8:p1', { cards: [{ id: 'D', title: 'D', columnId: 'in-progress', urgency: 'high' }, { id: 'E', title: 'E', columnId: 'backlog', urgency: 'medium' }] });
        // other users and look-alikes must not count
        seedLocal('taskboard:u80', mkBoard(mkCard('X1', 'X1', 'todo', 'high'), mkCard('X2', 'X2', 'todo', 'high')));
        seedLocal('taskboard:u9:p1', mkBoard(mkCard('Y1', 'Y1', 'todo', 'high')));
    }

    it('counts open and high-urgency cards across Global and the project board', async () => {
        seedBoards();
        expect(await runDailyGlance('u8', post)).toBe(true);
        expect(post).toHaveBeenCalledTimes(1);
        expect(post.mock.calls[0][0]).toContain('4 tasks not done — 2 high urgency');
    });

    it('does not write taskBoardUserIdHolder (same object, same value before and after)', async () => {
        seedBoards();
        TB.taskBoardUserIdHolder.current = 'sentinel';
        const holder = TB.taskBoardUserIdHolder;
        await runDailyGlance('u8', post);
        expect(TB.taskBoardUserIdHolder).toBe(holder);
        expect(TB.taskBoardUserIdHolder.current).toBe('sentinel');
    });

    it('does not write taskBoardUserIdHolder when it starts null', async () => {
        seedBoards();
        await runDailyGlance('u8', post);
        expect(TB.taskBoardUserIdHolder.current).toBeNull();
    });

    it('guard: one Global board keeps the same wording', async () => {
        seedLocal('taskboard:u8', mkBoard(mkCard('A', 'A', 'todo')));
        await runDailyGlance('u8', post);
        expect(post.mock.calls[0][0]).toContain('1 task not done — 0 high urgency');
    });

    it('guard: stays silent when every card is done', async () => {
        seedLocal('taskboard:u8', mkBoard(mkCard('A', 'A', 'done', 'high')));
        expect(await runDailyGlance('u8', post)).toBe(false);
        expect(post).not.toHaveBeenCalled();
    });
});
