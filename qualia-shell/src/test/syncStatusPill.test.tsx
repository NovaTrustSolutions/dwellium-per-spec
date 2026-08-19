/**
 * SyncStatusPill — plan 046 S1e. Drives syncStatusStore through a real
 * withSync store (mocked oneSaveClient) and asserts the pill text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync, syncStatusStore } from '../lib/oneSaveStore';
import { oneSaveClient } from '../lib/oneSaveClient';
import { backendStatusStore } from '../lib/backendStatusStore';
import SyncStatusPill from '../components/Shell/SyncStatusPill';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
}));

const SAVED = {
    id: 'pill_account-a', type: 'pill', ownerId: 'account-a', schema: 1,
    createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z',
    deletedAt: null, payload: 'v',
};

describe('SyncStatusPill', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(oneSaveClient.put).mockReset();
        backendStatusStore.reset();
        syncStatusStore.reset();
    });
    afterEach(() => {
        syncStatusStore.reset();
        backendStatusStore.reset();
        vi.useRealTimers();
    });

    it('renders nothing before any save, then Saving… → Saved ✓', async () => {
        vi.mocked(oneSaveClient.put).mockResolvedValue(SAVED);
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `pill:${holder.current}`;
        const store = withSync(
            createLocalStorageStore<string>({ key: resolveKey, deserializer: (r) => r ?? '', defaultValue: '' }),
            { objectType: 'pill', holder, resolveKey, debounceMs: 10 },
        );

        const { container } = render(<SyncStatusPill />);
        expect(container.querySelector('.sync-pill')).toBeNull();

        act(() => { store.set('v', () => localStorage.setItem(resolveKey(), 'v')); });
        expect(screen.getByRole('status').textContent).toBe('Saving…');

        await act(async () => { await vi.advanceTimersByTimeAsync(10); });
        const pill = screen.getByRole('status');
        expect(pill.textContent).toBe('Saved ✓');
        expect(pill.getAttribute('title')).toBeTruthy();
    });

    it('backend offline → "Offline — will retry" with the offline modifier', () => {
        render(<SyncStatusPill />);
        act(() => { backendStatusStore.markOffline('One Save write failed'); });
        const pill = screen.getByRole('status');
        expect(pill.textContent).toBe('Offline — will retry');
        expect(pill.className).toContain('sync-pill--offline');
    });
});
