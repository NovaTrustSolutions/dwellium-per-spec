import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { oneSaveSync, withSync } from '../lib/oneSaveStore';
import { oneSaveClient } from '../lib/oneSaveClient';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
    },
}));

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
