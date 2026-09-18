/**
 * Plan 058 Phase 4 — Universal Shell persistence.
 *
 * Covers the six cases from plans/058-universal-shell-persistence.md:
 *  1. active container survives unmount/remount
 *  2. scratch pad text survives unmount/remount
 *  3. per-user isolation (Andy's scratch is not visible to Lisa)
 *  4. legacy device-global scratch key is adopted once, left intact
 *  5. a stored id no longer visible to the role falls back to the first adapter
 *  6. Astra is absent from the switcher; header carries no raw "ANY" badge
 *
 * No network side effects: One Save is on by default in this env (.env
 * VITE_ONE_SAVE=true), so oneSaveClient is mocked exactly like
 * settingsFollowLogin.test.ts — assertions live entirely on localStorage +
 * rendered DOM, never on the mocked network calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), history: vi.fn() },
}));

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserContext } from '../context/UserContext';
import { WindowProvider } from '../context/WindowContext';
import UniversalShell from '../components/UniversalShell/UniversalShell';
import {
    LEGACY_SCRATCH_KEY,
    UNIVERSAL_SHELL_KEY,
    setUniversalShellState,
    universalShellStore,
} from '../utils/universalShellStore';
import { universalShellUserIdHolder } from '../lib/perUserIdentity';

/** Minimal UserContext value — only what UniversalShell/WindowProvider read. */
function userValue(uid: string | null) {
    return { user: uid ? { id: uid } : null, hasPermission: () => true } as unknown as never;
}

function renderShell(opts: { surface?: 'any' | 'strata' | 'astra'; initialContainerId?: string; uid?: string | null } = {}) {
    const { surface = 'any', initialContainerId, uid = 'u-andy' } = opts;
    return render(
        <UserContext.Provider value={userValue(uid)}>
            <WindowProvider>
                <UniversalShell surface={surface} initialContainerId={initialContainerId} />
            </WindowProvider>
        </UserContext.Provider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    universalShellStore.reset();
    universalShellUserIdHolder.current = null;
});

afterEach(() => {
    cleanup();
});

describe('UniversalShell persistence', () => {
    it('keeps the selected container active across unmount/remount', async () => {
        const user = userEvent.setup();
        const { unmount } = renderShell({ surface: 'strata' });

        const maintenanceBtn = await screen.findByRole('button', { name: /maintenance/i });
        await user.click(maintenanceBtn);
        expect(maintenanceBtn).toHaveAttribute('aria-pressed', 'true');

        unmount();
        // Drop the in-memory cache so the remount can only see what reached localStorage.
        universalShellStore.reset();
        renderShell({ surface: 'strata' });

        const restored = await screen.findByRole('button', { name: /maintenance/i });
        expect(restored).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps scratch pad text across unmount/remount', async () => {
        const user = userEvent.setup();
        const { unmount } = renderShell();

        const textarea = await screen.findByPlaceholderText(/quick notes/i);
        await user.type(textarea, 'buy milk');
        await waitFor(() => expect(textarea).toHaveValue('buy milk'));

        unmount();
        // Drop the in-memory cache so the remount can only see what reached localStorage.
        universalShellStore.reset();
        renderShell();

        const restored = await screen.findByPlaceholderText(/quick notes/i);
        expect(restored).toHaveValue('buy milk');
    });

    it("isolates one user's scratch from another", () => {
        universalShellUserIdHolder.current = 'u-andy';
        setUniversalShellState({ scratch: "andy's note" });
        expect(localStorage.getItem(`${UNIVERSAL_SHELL_KEY}:u-andy`)).toContain("andy's note");

        universalShellUserIdHolder.current = 'u-lisa';
        expect(universalShellStore.getSnapshot().scratch).toBe('');
    });

    it('adopts the legacy device-global scratch once, and leaves the legacy key intact after a write', () => {
        localStorage.setItem(LEGACY_SCRATCH_KEY, 'legacy note from before accounts');
        universalShellUserIdHolder.current = 'u-andy';

        // Per-user key is empty → adopt legacy value.
        expect(universalShellStore.getSnapshot().scratch).toBe('legacy note from before accounts');
        expect(localStorage.getItem(LEGACY_SCRATCH_KEY)).toBe('legacy note from before accounts');

        // A subsequent write must not touch the legacy key.
        setUniversalShellState({ scratch: 'andy overwrites it' });
        expect(localStorage.getItem(LEGACY_SCRATCH_KEY)).toBe('legacy note from before accounts');
        expect(universalShellStore.getSnapshot().scratch).toBe('andy overwrites it');
    });

    it('falls back to the first adapter when the stored container id is no longer visible', async () => {
        universalShellUserIdHolder.current = 'u-andy';
        setUniversalShellState({ activeContainerId: 'does-not-exist' });

        renderShell({ surface: 'strata' });

        const overviewBtn = await screen.findByRole('button', { name: /overview/i });
        expect(overviewBtn).toHaveAttribute('aria-pressed', 'true');
        // No crash / empty-state render — the maintenance button is present too.
        expect(screen.getByRole('button', { name: /maintenance/i })).toBeInTheDocument();
    });

    it('applies initialContainerId on mount but still lets the switcher change container', async () => {
        const user = userEvent.setup();
        renderShell({ surface: 'strata', initialContainerId: 'strata-maintenance' });

        const maintenanceBtn = await screen.findByRole('button', { name: /maintenance/i });
        await waitFor(() => expect(maintenanceBtn).toHaveAttribute('aria-pressed', 'true'));

        const overviewBtn = screen.getByRole('button', { name: /overview/i });
        await user.click(overviewBtn);
        await waitFor(() => expect(overviewBtn).toHaveAttribute('aria-pressed', 'true'));
        expect(maintenanceBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('has no Astra container in the switcher and no raw "ANY" surface badge in the header', async () => {
        renderShell();

        expect(screen.queryByRole('button', { name: /astra/i })).not.toBeInTheDocument();
        const header = screen.getByText('Universal Shell').closest('.us-header') as HTMLElement;
        expect(header.textContent).not.toMatch(/\bANY\b/);
    });
});
