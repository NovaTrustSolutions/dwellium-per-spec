/**
 * Plan 079 phase 5 review fix — sendToTaskBoard must never push a stale board over the server's.
 * Reviewer probe: the server holds task-board_u1 with 3 cards; bootstrap('u1') is still waiting on listAll;
 * a send lands in that gap. Before the fix the local write (empty board + 1 card) made the later hydrate
 * re-queue it and the 3 server cards were gone. Uses the same in-memory fake One Save server as taskBoard.p2.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultColumns, type BoardState, type TaskCard } from '../components/TaskBoard/taskBoardModel';

const srv = vi.hoisted(() => ({
    objects: new Map<string, any>(),          // eslint-disable-line @typescript-eslint/no-explicit-any
    listGate: null as null | Promise<void>,   // bootstrap's bulk listAll waits on this
    getGate: null as null | Promise<void>,    // single-object get waits on this
}));

vi.mock('../lib/oneSaveClient', () => {
    const store = (o: { id: string; type: string; ownerId: string; payload: unknown }) => {
        const now = '2026-01-01T00:00:00.000Z';
        srv.objects.set(o.id, { id: o.id, type: o.type, ownerId: o.ownerId, schema: 1, createdAt: now, updatedAt: now, deletedAt: null, payload: JSON.parse(JSON.stringify(o.payload)) });
    };
    return {
        ONE_SAVE_ENABLED: true,
        oneSaveClient: {
            get: async (id: string) => { await srv.getGate; return srv.objects.get(id) ?? null; },
            put: async (o: { id: string; type: string; ownerId: string; payload: unknown }) => { store(o); return srv.objects.get(o.id); },
            putBatch: async (objs: Array<{ id: string; type: string; ownerId: string; payload: unknown }>) => { objs.forEach(store); return { saved: objs.map(o => o.id), failed: [] }; },
            listAll: async (uid: string) => { await srv.listGate; return [...srv.objects.values()].filter(o => o.ownerId === uid); },
            remove: async () => true,
        },
    };
});
vi.mock('../components/StrataDashboard/strataApi', () => ({ strataGet: async () => { throw new Error('offline'); } }));

const ISO = '2026-01-01T00:00:00.000Z';
const mkCard = (id: string, order: number): TaskCard => ({ id, title: id, description: '', columnId: 'todo', order, createdAt: ISO, enteredColumnAt: ISO });
const serverBoard = (id: string): BoardState => srv.objects.get(id).payload as BoardState;
const titles = (b: { cards: Array<{ title: string }> }): string[] => b.cards.map(c => c.title).sort();
const gate = (): { p: Promise<void>; open: () => void } => { let open!: () => void; const p = new Promise<void>(r => { open = r; }); return { p, open }; };

async function boot(): Promise<{ tb: typeof import('../components/TaskBoard/taskBoardStore'); sync: typeof import('../lib/oneSaveStore') }> {
    vi.resetModules();
    const tb = await import('../components/TaskBoard/taskBoardStore');
    const sync = await import('../lib/oneSaveStore');
    return { tb, sync };
}
const seedServer = (id: string, ...cards: TaskCard[]): void => {
    srv.objects.set(id, { id, type: 'task-board', ownerId: 'u1', schema: 1, createdAt: ISO, updatedAt: ISO, deletedAt: null, payload: { columns: defaultColumns(), cards, audit: [] } });
};

beforeEach(() => {
    vi.useFakeTimers();
    srv.objects.clear(); srv.listGate = null; srv.getGate = null;
    localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); });

describe('sendToTaskBoard vs an in-flight bootstrap', () => {
    it.each([[null, 'task-board_u1', 'taskboard:u1'], ['p1', 'task-board_u1__p1', 'taskboard:u1:p1']])(
        'keeps every server card when a send lands while bootstrap is still listing (project %s)', async (pid, objectId, lsKey) => {
            seedServer(objectId, mkCard('s1', 0), mkCard('s2', 1), mkCard('s3', 2));
            const { tb, sync } = await boot();
            tb.taskBoardUserIdHolder.current = 'u1';
            tb.taskBoardProjectIdHolder.current = pid;
            const g = gate();
            srv.listGate = g.p;
            const bootstrap = sync.oneSaveSync.bootstrap('u1');
            const sent = tb.sendToTaskBoard('u1', { title: 'quick add' });
            g.open();
            expect((await sent).board).toBe(pid ?? 'Global');
            await bootstrap;
            await vi.advanceTimersByTimeAsync(3000);

            const want = ['quick add', 's1', 's2', 's3'];
            expect(titles(serverBoard(objectId))).toEqual(want);
            expect(titles(tb.taskBoardStore.getSnapshot())).toEqual(want);
            expect(titles(JSON.parse(localStorage.getItem(lsKey) as string))).toEqual(want);
        });

    it('the second send to the same board does not hydrate again', async () => {
        seedServer('task-board_u1', mkCard('s1', 0));
        const { tb } = await boot();
        const hydrate = vi.spyOn(tb.taskBoardStore, 'hydrate');
        await tb.sendToTaskBoard('u1', { title: 'one' });
        await tb.sendToTaskBoard('u1', { title: 'two' });
        expect(hydrate).toHaveBeenCalledTimes(1);
        expect(titles(tb.taskBoardStore.getSnapshot())).toEqual(['one', 's1', 'two']);
    });

    it('writes nothing when the user switches board while the server copy is being fetched', async () => {
        seedServer('task-board_u1', mkCard('s1', 0));
        const { tb } = await boot();
        tb.taskBoardUserIdHolder.current = 'u1';
        const g = gate();
        srv.getGate = g.p;
        const sent = tb.sendToTaskBoard('u1', { title: 'lost?' });
        tb.taskBoardProjectIdHolder.current = 'p2';
        g.open();
        expect(await sent).toEqual({ board: '' });
        await vi.advanceTimersByTimeAsync(3000);
        expect(localStorage.getItem('taskboard:u1')).toBeNull();
        expect(localStorage.getItem('taskboard:u1:p2')).toBeNull();
        expect(titles(serverBoard('task-board_u1'))).toEqual(['s1']);
    });

    it('a rejected hydrate still adds the card (and retries the hydrate on the next send)', async () => {
        const { tb } = await boot();
        const hydrate = vi.spyOn(tb.taskBoardStore, 'hydrate').mockRejectedValueOnce(new Error('boom'));
        expect((await tb.sendToTaskBoard('u1', { title: 'kept' })).board).toBe('Global');
        await tb.sendToTaskBoard('u1', { title: 'again' });
        expect(hydrate).toHaveBeenCalledTimes(2);
        expect(titles(tb.taskBoardStore.getSnapshot())).toEqual(['again', 'kept']);
    });
});
