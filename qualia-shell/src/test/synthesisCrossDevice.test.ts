/**
 * Plan 070 phase 4 W2: end-to-end cross-device sync for Synthesis Lab —
 * synthesisStore + synthesisTombstoneStore talking to a fake in-memory One
 * Save server, with two "devices" simulated in one jsdom by swapping
 * localStorage contents and resetting each store's in-memory cache
 * (sister-shape to synthesisStoreMerge.test.ts / twImportedStoreMerge.test.ts,
 * but exercising the real hydrate()/write-through path instead of calling
 * mergeSyntheses directly).
 *
 * Read first: git show 3dc0f8c 12c6e56; synthesisStore.ts; synthesisTombstones.ts;
 * lib/oneSaveStore.ts; lib/oneSaveClient.ts.
 *
 * This file owns no source changes — only tests. A scenario that surfaces a
 * real bug is kept as `it.fails(...)` with a repro comment rather than
 * "fixed" by loosening the assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { oneSaveClient, type DwelliumObject } from '../lib/oneSaveClient';
import {
    synthesisStore, synthesisUserIdHolder, captureSynthesis, removeSynthesis, clearSyntheses,
    type Synthesis,
} from '../components/Synthesis/synthesisStore';
import { synthesisTombstoneStore } from '../components/Synthesis/synthesisTombstones';
import { setPerUserIdentity } from '../lib/perUserIdentity';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        // 'unsupported' latches oneSaveStore's batchUnsupported flag on the
        // first flush attempt, falling back to per-id put() — same pattern as
        // every other oneSaveStore-adjacent test in this repo.
        putBatch: vi.fn().mockResolvedValue('unsupported'),
    },
}));

/* ---------- fake in-memory One Save server ---------- */
const server = new Map<string, DwelliumObject>();

function serverPut(obj: { id: string; type: string; ownerId: string; payload: unknown }): DwelliumObject {
    const stored: DwelliumObject = {
        id: obj.id, type: obj.type, ownerId: obj.ownerId, schema: 1,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null, payload: obj.payload,
    };
    server.set(obj.id, stored);
    return stored;
}

function capturesOf(owner: string): Synthesis[] {
    return (server.get(`synthesis_${owner}`)?.payload as Synthesis[] | undefined) ?? [];
}

/** Flush the debounced write-through (800ms default) + its promise chain. */
async function flush(): Promise<void> {
    await vi.advanceTimersByTimeAsync(1000);
}

/* ---------- two-device simulation ---------- */
const deviceLocalStorage = new Map<string, Record<string, string>>();
let currentDevice: string | null = null;

function snapshotLocalStorage(): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        out[k] = localStorage.getItem(k)!;
    }
    return out;
}

function restoreLocalStorage(snap: Record<string, string>): void {
    localStorage.clear();
    for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
}

/** Run `fn` "on" `device`: swap in that device's localStorage, drop both
 *  stores' in-memory caches so the next getSnapshot() re-reads localStorage,
 *  run fn, then snapshot whatever fn wrote back into that device's slot. */
async function asDevice<T>(device: string, fn: () => T | Promise<T>): Promise<T> {
    if (currentDevice) deviceLocalStorage.set(currentDevice, snapshotLocalStorage());
    currentDevice = device;
    restoreLocalStorage(deviceLocalStorage.get(device) ?? {});
    synthesisStore.reset();
    synthesisTombstoneStore.reset();
    const result = await fn();
    deviceLocalStorage.set(device, snapshotLocalStorage());
    return result;
}

const OWNER = 'andy';

beforeEach(() => {
    vi.useFakeTimers();
    server.clear();
    deviceLocalStorage.clear();
    currentDevice = null;
    localStorage.clear();
    synthesisStore.reset();
    synthesisTombstoneStore.reset();
    setPerUserIdentity(OWNER);
    vi.mocked(oneSaveClient.get).mockReset();
    vi.mocked(oneSaveClient.put).mockReset();
    vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => server.get(id) ?? null);
    vi.mocked(oneSaveClient.put).mockImplementation(async (obj) => serverPut(obj as { id: string; type: string; ownerId: string; payload: unknown }));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('Synthesis Lab cross-device sync', () => {
    it('1. a capture on device A reaches device B via hydrate', async () => {
        await asDevice('A', () => {
            captureSynthesis({ id: 'x', query: 'q', result: 'rx', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
            captureSynthesis({ id: 'y', query: 'q', result: 'ry', layer: 1, parentId: null }, new Date('2026-01-02T00:00:00.000Z'));
        });
        await flush();
        await asDevice('B', async () => {
            await synthesisStore.hydrate();
            await synthesisTombstoneStore.hydrate();
        });
        expect(synthesisStore.getSnapshot().map((s) => s.id).sort()).toEqual(['x', 'y']);
    });

    it('2. a delete propagates to B and B\'s next capture does not resurrect the deleted item on the server', async () => {
        await asDevice('A', () => {
            captureSynthesis({ id: 'x', query: 'q', result: 'rx', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
            captureSynthesis({ id: 'y', query: 'q', result: 'ry', layer: 1, parentId: null }, new Date('2026-01-02T00:00:00.000Z'));
        });
        await flush();
        // B goes stale: hydrates once while it still has both x and y.
        await asDevice('B', async () => {
            await synthesisStore.hydrate();
            await synthesisTombstoneStore.hydrate();
        });
        expect(synthesisStore.getSnapshot().map((s) => s.id).sort()).toEqual(['x', 'y']);

        await asDevice('A', () => { removeSynthesis('x'); });
        await flush();

        await asDevice('B', async () => {
            await synthesisTombstoneStore.hydrate();
            await synthesisStore.hydrate();
            captureSynthesis({ id: 'z', query: 'q', result: 'rz', layer: 1, parentId: null }, new Date('2026-01-03T00:00:00.000Z'));
        });
        await flush();

        const localIds = synthesisStore.getSnapshot().map((s) => s.id).sort();
        expect(localIds).toEqual(['y', 'z']);

        const serverIds = capturesOf(OWNER).map((s) => s.id).sort();
        expect(serverIds).toEqual(['y', 'z']);
        expect(serverIds).not.toContain('x');

        // Mutation check: confirm this assertion actually distinguishes
        // resurrection from correct behaviour (would fail if 'x' leaked back).
        expect(serverIds.includes('x')).toBe(false);
    });

    it('3. clear-all on A empties B, then B\'s capture leaves only the new item on the server', async () => {
        await asDevice('A', () => {
            captureSynthesis({ id: 'x', query: 'q', result: 'rx', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
            captureSynthesis({ id: 'y', query: 'q', result: 'ry', layer: 1, parentId: null }, new Date('2026-01-02T00:00:00.000Z'));
        });
        await flush();
        await asDevice('B', async () => {
            await synthesisStore.hydrate();
            await synthesisTombstoneStore.hydrate();
        });
        expect(synthesisStore.getSnapshot().length).toBe(2);

        await asDevice('A', () => { clearSyntheses(); });
        await flush();

        await asDevice('B', async () => {
            await synthesisTombstoneStore.hydrate();
            await synthesisStore.hydrate();
        });
        expect(synthesisStore.getSnapshot()).toEqual([]);

        await asDevice('B', () => {
            captureSynthesis({ id: 'w', query: 'q', result: 'rw', layer: 1, parentId: null }, new Date('2026-01-05T00:00:00.000Z'));
        });
        await flush();

        expect(capturesOf(OWNER).map((s) => s.id)).toEqual(['w']);
    });

    it('4. hydrating captures BEFORE tombstones still prunes locally and the resulting write-through drops the item from the server', async () => {
        await asDevice('A', () => {
            captureSynthesis({ id: 'x', query: 'q', result: 'rx', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
        });
        await flush();
        await asDevice('B', async () => { await synthesisStore.hydrate(); });
        expect(synthesisStore.getSnapshot().map((s) => s.id)).toEqual(['x']);

        await asDevice('A', () => { removeSynthesis('x'); });
        await flush();

        await asDevice('B', async () => {
            // Deliberate order: captures first (merge sees no tombstone yet,
            // so the union keeps x), tombstones second (the module-level
            // synthesisTombstoneStore.subscribe in synthesisStore.ts must
            // prune it after the fact).
            await synthesisStore.hydrate();
            expect(synthesisStore.getSnapshot().map((s) => s.id)).toEqual(['x']); // still there mid-sequence
            await synthesisTombstoneStore.hydrate();
        });
        expect(synthesisStore.getSnapshot()).toEqual([]);

        await flush(); // the prune's own synthesisStore.set() schedules a write-through
        expect(capturesOf(OWNER).map((s) => s.id)).not.toContain('x');

        // Mutation check: prove the server assertion is load-bearing.
        expect(capturesOf(OWNER).some((s) => s.id === 'x')).toBe(false);
    });

    it('5. re-capturing the same id after a delete survives on the other device', async () => {
        await asDevice('A', () => {
            captureSynthesis({ id: 'x', query: 'q', result: 'rx-1', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
        });
        await flush();
        await asDevice('B', async () => { await synthesisStore.hydrate(); });
        expect(synthesisStore.getSnapshot().map((s) => s.id)).toEqual(['x']);

        await asDevice('A', () => {
            // Pin Date.now() (removeSynthesis's implicit delete-stamp clock) to
            // a point BEFORE the explicit recapture date below — otherwise the
            // fake clock's real wall-time default would stamp the delete far
            // later than any hand-picked 2026 date and the recapture would
            // look like it predates its own delete.
            vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
            removeSynthesis('x');
            captureSynthesis({ id: 'x', query: 'q', result: 'rx-2', layer: 1, parentId: null }, new Date('2026-01-03T00:00:00.000Z'));
        });
        await flush();

        await asDevice('B', async () => {
            await synthesisStore.hydrate();
            await synthesisTombstoneStore.hydrate();
        });
        const snap = synthesisStore.getSnapshot();
        expect(snap.map((s) => s.id)).toEqual(['x']);
        expect(snap[0].result).toBe('rx-2');
    });

    it('6. clock skew: a future-dated capture on B is still removed by a delete on A', async () => {
        const future = new Date(Date.now() + 10 * 60_000).toISOString(); // B's clock runs 10 min ahead
        await asDevice('B', () => {
            captureSynthesis({ id: 'x', query: 'q', result: 'rx', layer: 1, parentId: null }, new Date(future));
        });
        await flush();

        await asDevice('A', async () => {
            await synthesisStore.hydrate();
            expect(synthesisStore.getSnapshot().map((s) => s.id)).toEqual(['x']);
            removeSynthesis('x'); // stamped after the skewed future capturedAt (Math.max rule)
        });
        await flush();

        await asDevice('B', async () => {
            await synthesisTombstoneStore.hydrate();
            await synthesisStore.hydrate();
        });
        expect(synthesisStore.getSnapshot()).toEqual([]);
    });

    it('7. documented behaviour: a clear made before tombstones existed is resurrected once by a stale device', async () => {
        // Simulate a pre-Phase-4 clear: the captures object was wiped to []
        // directly, with no 'synthesis-tombstones' object ever created.
        serverPut({ id: `synthesis_${OWNER}`, type: 'synthesis', ownerId: OWNER, payload: [] });

        await asDevice('B', async () => {
            captureSynthesis({ id: 'x', query: 'q', result: 'rx', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
        });
        // B's own write-through would otherwise clobber the server payload we
        // just seeded — don't flush B's capture before hydrating.
        await asDevice('B', async () => {
            await synthesisStore.hydrate();
            await synthesisTombstoneStore.hydrate(); // no tombstone object on server (get -> null): no-op
        });

        // Union of local [x] with remote [] resurrects x — expected, not a bug,
        // because no tombstone was ever recorded for a pre-upgrade clear.
        expect(synthesisStore.getSnapshot().map((s) => s.id)).toEqual(['x']);
    });

    it('8. account isolation: andy\'s captures/tombstones never leak into lisa\'s', async () => {
        setPerUserIdentity('andy');
        synthesisStore.reset();
        synthesisTombstoneStore.reset();
        captureSynthesis({ id: 'a-1', query: 'q', result: 'r', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
        await flush();

        setPerUserIdentity('lisa');
        synthesisStore.reset();
        synthesisTombstoneStore.reset();
        expect(synthesisStore.getSnapshot()).toEqual([]); // fresh namespace, nothing local yet

        await synthesisStore.hydrate(); // lisa's own hydrate must not see andy's object
        expect(synthesisStore.getSnapshot()).toEqual([]);

        captureSynthesis({ id: 'l-1', query: 'q', result: 'r', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
        removeSynthesis('l-1');
        await flush();

        expect(capturesOf('andy').map((s) => s.id)).toEqual(['a-1']);
        expect(capturesOf('lisa').map((s) => s.id)).toEqual([]);
        expect(server.get(`synthesis-tombstones_andy`)).toBeUndefined();
        const lisaTomb = server.get(`synthesis-tombstones_lisa`)?.payload as { deleted: Record<string, number> } | undefined;
        expect(lisaTomb?.deleted).toHaveProperty('l-1');
    });
    it('9. a device that already knows a delete keeps it deleted when an out-of-date client pushes the item back to the server', async () => {
        await asDevice('A', () => {
            captureSynthesis({ id: 'x', query: 'q', result: 'rx', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
            captureSynthesis({ id: 'y', query: 'q', result: 'ry', layer: 1, parentId: null }, new Date('2026-01-02T00:00:00.000Z'));
        });
        await flush();
        await asDevice('A', () => { removeSynthesis('x'); });
        await flush();
        // B learns the delete (tombstones hydrated, then captures).
        await asDevice('B', async () => {
            await synthesisTombstoneStore.hydrate();
            await synthesisStore.hydrate();
        });
        await flush();
        // An old client (pre-tombstone code) overwrites the captures object with x back in it.
        const full = [
            { id: 'x', query: 'q', result: 'rx', layer: 1, parentId: null, capturedAt: '2026-01-01T00:00:00.000Z' },
            { id: 'y', query: 'q', result: 'ry', layer: 1, parentId: null, capturedAt: '2026-01-02T00:00:00.000Z' },
        ];
        serverPut({ id: `synthesis_${OWNER}`, type: 'synthesis', ownerId: OWNER, payload: full });
        // B re-hydrates only the captures; its tombstone store does not change, so only the merge can drop x.
        await asDevice('B', async () => { await synthesisStore.hydrate(); });
        await flush();
        expect(synthesisStore.getSnapshot().map((s) => s.id)).toEqual(['y']);
        expect(capturesOf(OWNER).map((s) => s.id)).toEqual(['y']);
    });
    it('10. real bootstrap hydrates both stores CONCURRENTLY — a pruned stale local never overwrites the server', async () => {
        await asDevice('B', () => {
            captureSynthesis({ id: 'ghost', query: 'q', result: 'rg', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
        });
        await flush();
        await asDevice('A', async () => {
            await synthesisTombstoneStore.hydrate();
            await synthesisStore.hydrate();
            removeSynthesis('ghost');
            captureSynthesis({ id: 'a', query: 'q', result: 'ra', layer: 1, parentId: null }, new Date('2026-01-02T00:00:00.000Z'));
        });
        await flush();
        expect(capturesOf(OWNER).map((s) => s.id)).toEqual(['a']);
        // B still has only its stale local ['ghost']; bootstrap hands both stores
        // their prefetched objects and hydrates them without awaiting in between.
        await asDevice('B', async () => {
            const tomb = server.get(`synthesis-tombstones_${OWNER}`) ?? null;
            const caps = server.get(`synthesis_${OWNER}`) ?? null;
            await Promise.all([synthesisTombstoneStore.hydrate(tomb), synthesisStore.hydrate(caps)]);
        });
        await flush();
        expect(capturesOf(OWNER).map((s) => s.id)).toEqual(['a']);
        await asDevice('B', () => { expect(synthesisStore.getSnapshot().map((s) => s.id)).toEqual(['a']); });
    });

    it('11. a capture made while the hydrate GET is in flight is merged with remote, not uploaded alone over it', async () => {
        await asDevice('A', () => {
            captureSynthesis({ id: 'remote-1', query: 'q', result: 'r1', layer: 1, parentId: null }, new Date('2026-01-01T00:00:00.000Z'));
        });
        await flush();
        await asDevice('B', async () => {
            let release!: () => void;
            const gate = new Promise<void>((r) => { release = r; });
            const realGet = vi.mocked(oneSaveClient.get).getMockImplementation()!;
            vi.mocked(oneSaveClient.get).mockImplementationOnce(async (id: string) => { await gate; return realGet(id); });
            const h = synthesisStore.hydrate();
            captureSynthesis({ id: 'local-1', query: 'q', result: 'l1', layer: 1, parentId: null }, new Date('2026-01-02T00:00:00.000Z'));
            release();
            await h;
        });
        await flush();
        expect(capturesOf(OWNER).map((s) => s.id).sort()).toEqual(['local-1', 'remote-1']);
    });
});
