import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runHermesGraphNightly, type RunNightlyDeps } from '../services/hermesGraphNightly';

function makeStorage() {
    const map = new Map<string, string>();
    return {
        getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
        setItem: (k: string, v: string) => { map.set(k, v); },
        _map: map,
    };
}

function baseDeps(overrides: Partial<RunNightlyDeps> = {}): RunNightlyDeps & { storage: ReturnType<typeof makeStorage> } {
    const storage = makeStorage();
    return {
        uid: 'user-1',
        storage,
        now: () => new Date('2026-09-30T03:00:00').getTime(),
        fetchStatus: vi.fn(async () => ({ built: true, building: false, builtAt: null, lastError: null, nodes: 42 })),
        rebuild: vi.fn(async () => ({ ok: true, status: 200 })),
        wait: vi.fn(async () => {}),
        recordRun: vi.fn(),
        captureOwnerFn: () => () => true,
        ...overrides,
    } as any;
}

describe('runHermesGraphNightly', () => {
    afterEach(() => vi.restoreAllMocks());

    it('before 02:00 local: does not call rebuild', async () => {
        const deps = baseDeps({ now: () => new Date('2026-09-30T01:59:00').getTime() });
        await runHermesGraphNightly(deps);
        expect(deps.rebuild).not.toHaveBeenCalled();
        expect(deps.fetchStatus).not.toHaveBeenCalled();
    });

    it('after 02:00, first run: rebuilds and records success with node count', async () => {
        const fetchStatus = vi.fn()
            .mockResolvedValueOnce({ built: false, building: false, builtAt: null, lastError: null, nodes: 0 }) // pre-rebuild check
            .mockResolvedValueOnce({ built: true, building: false, builtAt: '2026-09-30T02:05:00', lastError: null, nodes: 77 }); // poll result
        const deps = baseDeps({ fetchStatus });
        await runHermesGraphNightly(deps);
        expect(deps.rebuild).toHaveBeenCalledTimes(1);
        expect(deps.recordRun).toHaveBeenCalledWith('hermes-labyrinth', expect.stringContaining('77 nodes'), expect.any(Number), 'success');
    });

    it('same day again: does not call rebuild a second time', async () => {
        const storage = makeStorage();
        const fetchStatus = vi.fn()
            .mockResolvedValueOnce({ built: false, building: false, builtAt: null, lastError: null, nodes: 0 })
            .mockResolvedValueOnce({ built: true, building: false, builtAt: '2026-09-30T02:05:00', lastError: null, nodes: 10 });
        const deps = baseDeps({ storage, fetchStatus });
        await runHermesGraphNightly(deps);
        expect(deps.rebuild).toHaveBeenCalledTimes(1);

        const deps2 = baseDeps({ storage, fetchStatus: vi.fn(), rebuild: vi.fn() });
        await runHermesGraphNightly(deps2);
        expect(deps2.rebuild).not.toHaveBeenCalled();
        expect(deps2.fetchStatus).not.toHaveBeenCalled();
    });

    it('builtAt today: skips without POSTing rebuild', async () => {
        const fetchStatus = vi.fn(async () => ({ built: true, building: false, builtAt: '2026-09-30T02:05:00', lastError: null, nodes: 5 }));
        const deps = baseDeps({ fetchStatus });
        await runHermesGraphNightly(deps);
        expect(deps.rebuild).not.toHaveBeenCalled();
        expect(deps.recordRun).not.toHaveBeenCalled();
    });

    it('building: skips', async () => {
        const fetchStatus = vi.fn(async () => ({ built: false, building: true, builtAt: null, lastError: null, nodes: 0 }));
        const deps = baseDeps({ fetchStatus });
        await runHermesGraphNightly(deps);
        expect(deps.rebuild).not.toHaveBeenCalled();
        expect(deps.recordRun).not.toHaveBeenCalled();
    });

    it('409 on rebuild: no recordRun fail, and the day is claimed (no retry same day)', async () => {
        const storage = makeStorage();
        const fetchStatus = vi.fn(async () => ({ built: false, building: false, builtAt: null, lastError: null, nodes: 0 }));
        const rebuild = vi.fn(async () => ({ ok: false, status: 409 }));
        const deps = baseDeps({ storage, fetchStatus, rebuild });
        await runHermesGraphNightly(deps);
        expect(deps.recordRun).not.toHaveBeenCalled();

        const deps2 = baseDeps({ storage, fetchStatus: vi.fn(), rebuild: vi.fn() });
        await runHermesGraphNightly(deps2);
        expect(deps2.rebuild).not.toHaveBeenCalled(); // claimed — no retry
    });

    it('network error on rebuild: claim released, retried next tick, stops after 3 attempts', async () => {
        const storage = makeStorage();
        const fetchStatus = vi.fn(async () => ({ built: false, building: false, builtAt: null, lastError: null, nodes: 0 }));
        const rebuild = vi.fn(async () => ({ ok: false }));

        for (let i = 1; i <= 3; i++) {
            await runHermesGraphNightly(baseDeps({ storage, fetchStatus, rebuild }));
        }
        expect(rebuild).toHaveBeenCalledTimes(3);

        // 4th tick: attempts exhausted for today — no further calls.
        await runHermesGraphNightly(baseDeps({ storage, fetchStatus, rebuild }));
        expect(rebuild).toHaveBeenCalledTimes(3);
    });

    it('account switch mid-poll: no recordRun', async () => {
        let owner = true;
        const fetchStatus = vi.fn()
            .mockResolvedValueOnce({ built: false, building: false, builtAt: null, lastError: null, nodes: 0 })
            .mockResolvedValueOnce({ built: true, building: false, builtAt: '2026-09-30T02:05:00', lastError: null, nodes: 99 });
        const rebuild = vi.fn(async () => {
            owner = false; // account switches during the rebuild request itself
            return { ok: true, status: 200 };
        });
        const deps = baseDeps({ fetchStatus, rebuild, captureOwnerFn: () => () => owner });
        await runHermesGraphNightly(deps);
        expect(deps.recordRun).not.toHaveBeenCalled();
    });

    it('StrictMode double-mount: only one rebuild fires', async () => {
        const storage = makeStorage();
        const fetchStatus = vi.fn(async () => ({ built: false, building: false, builtAt: null, lastError: null, nodes: 3 }));
        const rebuild = vi.fn(async () => ({ ok: true, status: 200 }));
        const deps = baseDeps({ storage, fetchStatus, rebuild, wait: vi.fn(async () => {}) });
        const deps2 = baseDeps({ storage, fetchStatus, rebuild, wait: vi.fn(async () => {}) });

        const p1 = runHermesGraphNightly(deps);
        const p2 = runHermesGraphNightly(deps2);
        await Promise.all([p1, p2]);

        expect(rebuild).toHaveBeenCalledTimes(1);
    });
});
