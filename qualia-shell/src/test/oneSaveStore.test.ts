import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { oneSaveSync, withSync } from '../lib/oneSaveStore';
import { oneSaveClient } from '../lib/oneSaveClient';
import { backendStatusStore } from '../lib/backendStatusStore';
import type { DwelliumObject } from '../lib/oneSaveClient';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
    },
}));

/** A minimal "persisted" object so a `put` success resolves to a truthy value. */
function savedObject(id: string, ownerId: string, payload: unknown): DwelliumObject {
    return {
        id,
        type: 'race-test',
        ownerId,
        schema: 1,
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
        deletedAt: null,
        payload,
    };
}

describe('oneSaveStore account isolation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.get).mockReset();
    });

    it('drops a pending write when the authenticated account changes', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;
        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('private account A value', () => localStorage.setItem(resolveKey(), 'private account A value'));
        holder.current = 'account-b';
        await vi.advanceTimersByTimeAsync(10);

        expect(oneSaveClient.put).not.toHaveBeenCalled();
    });

    it('clears dynamic store owners when the active account logs out', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `logout-test:${holder.current ?? '_anonymous'}`;
        withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'logout-test', holder, resolveKey, debounceMs: 10 },
        );

        await oneSaveSync.bootstrap(null);

        expect(holder.current).toBeNull();
    });
});

describe('oneSaveStore write-through retry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.get).mockReset();
        backendStatusStore.reset();
    });

    afterEach(() => {
        backendStatusStore.reset();
        vi.useRealTimers();
    });

    it('retries a failed write and succeeds on a later attempt (no banner)', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;
        const markOffline = vi.spyOn(backendStatusStore, 'markOffline');

        // Fail once (null), then succeed (truthy saved object).
        vi.mocked(oneSaveClient.put)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(savedObject('race-test_account-a', 'account-a', 'v'));

        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('v', () => localStorage.setItem(resolveKey(), 'v'));
        // debounce (10) + first backoff (500) covers the single retry.
        await vi.advanceTimersByTimeAsync(10 + 500);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(2);
        expect(markOffline).not.toHaveBeenCalled();
    });

    it('retries up to the cap then surfaces persistent failure (value not dropped)', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;
        const markOffline = vi.spyOn(backendStatusStore, 'markOffline');

        // Always fail → all attempts exhausted.
        vi.mocked(oneSaveClient.put).mockResolvedValue(null);

        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('v', () => localStorage.setItem(resolveKey(), 'v'));
        // debounce (10) + backoff 500 + backoff 1000 covers all 3 attempts.
        await vi.advanceTimersByTimeAsync(10 + 500 + 1000);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(3);
        expect(markOffline).toHaveBeenCalledTimes(1);
        expect(backendStatusStore.getSnapshot().state).toBe('offline');
    });

    it('never writes into the next user namespace when the account switches mid-retry', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-test:${holder.current ?? '_anonymous'}`;

        // First attempt fails; before the retry fires, the account switches.
        vi.mocked(oneSaveClient.put).mockResolvedValue(null);

        const store = withSync(
            createLocalStorageStore<string>({
                key: resolveKey,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'race-test', holder, resolveKey, debounceMs: 10 },
        );

        store.set('private account A value', () => localStorage.setItem(resolveKey(), 'private account A value'));
        // Let the debounce fire and the first (failing) put run.
        await vi.advanceTimersByTimeAsync(10);
        // Switch account during the backoff window before the retry.
        holder.current = 'account-b';
        await vi.advanceTimersByTimeAsync(500 + 1000);

        // Exactly one put happened (for account-a); the guard dropped the retry.
        expect(oneSaveClient.put).toHaveBeenCalledTimes(1);
        // No put ever targeted account-b's namespace.
        const targetedB = vi
            .mocked(oneSaveClient.put)
            .mock.calls.some(([obj]) => obj.ownerId === 'account-b' || obj.id.includes('account-b'));
        expect(targetedB).toBe(false);
    });
});

describe('oneSaveStore bootstrap isolation', () => {
    beforeEach(async () => {
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.get).mockReset();
        // Reset the shared currentUserId to null so stores registered below do
        // NOT auto-hydrate at registration time (the late-registration catch-up
        // only fires when a user is already active). Keeps each store's first
        // get() deterministically driven by the explicit bootstrap() below.
        await oneSaveSync.bootstrap(null);
    });

    it('still hydrates later stores when an earlier store hydrate rejects', async () => {
        const baselineCount = oneSaveSync.registeredCount;

        // First store: its hydrate rejects (simulates a corrupt remote payload).
        const holderA: { current: string | null } = { current: null };
        const resolveKeyA = () => `boot-a:${holderA.current ?? '_anonymous'}`;
        withSync(
            createLocalStorageStore<string>({
                key: resolveKeyA,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            {
                objectType: 'boot-a',
                holder: holderA,
                resolveKey: resolveKeyA,
                debounceMs: 10,
            },
        );

        // Second store: its hydrate should still run even though the first rejected.
        const holderB: { current: string | null } = { current: null };
        const resolveKeyB = () => `boot-b:${holderB.current ?? '_anonymous'}`;
        withSync(
            createLocalStorageStore<string>({
                key: resolveKeyB,
                deserializer: (raw) => raw ?? '',
                defaultValue: '',
            }),
            { objectType: 'boot-b', holder: holderB, resolveKey: resolveKeyB, debounceMs: 10 },
        );

        expect(oneSaveSync.registeredCount).toBe(baselineCount + 2);

        // get() is called once per store during hydrate. Make the FIRST registered
        // store's hydrate reject, everything else resolve to null (no remote value).
        // Stores hydrate via Promise.allSettled(registry.map(e => e.hydrate())), so
        // a single rejection must not prevent the others from calling get().
        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => {
            if (id.startsWith('boot-a_')) throw new Error('corrupt remote payload');
            return null;
        });

        await oneSaveSync.bootstrap('user-1');

        // boot-b's hydrate ran despite boot-a rejecting (proven by its get() call).
        const calledIds = vi.mocked(oneSaveClient.get).mock.calls.map(([id]) => id);
        expect(calledIds).toContain('boot-a_user-1'); // the rejecting store was attempted
        expect(calledIds).toContain('boot-b_user-1'); // the later store STILL hydrated
    });
});
