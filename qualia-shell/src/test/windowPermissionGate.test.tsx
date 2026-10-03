/**
 * Plan 078 FE16 — openWindow enforces `widget:<id>` for every caller
 * (sidebar, ⌘K, bus). Only ids with a key in the loaded permission map are
 * gated, so keyless widgets (wiki) stay open for everyone; god always passes.
 */
import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserContext } from '../context/UserContext';
import { PermissionsProvider } from '../context/PermissionsContext';
import { LayoutProvider } from '../context/LayoutContext';
import { WindowProvider, useWindows, dockItemsStore, savedLayoutsStore } from '../context/WindowContext';
import { sessionRestoreStore } from '../lib/sessionRestoreStore';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(null),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

type Open = (c: string, t: string, i: string) => string | null;
let open: Open;

function Probe() {
    const { openWindow, windows } = useWindows();
    open = openWindow;
    return <div data-testid="windows">{windows.map(w => w.component).join(',')}</div>;
}

async function mount(role: 'management' | 'god') {
    const user = { id: 'u-test', role };
    const value = { user, token: 't', role, isAuthenticated: true, hasPermission: () => true } as unknown as never;
    render(
        <UserContext.Provider value={value}>
            <PermissionsProvider>
                <LayoutProvider><WindowProvider><Probe /></WindowProvider></LayoutProvider>
            </PermissionsProvider>
        </UserContext.Provider>,
    );
    // let the permissions fetch settle (loading → false)
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const opened = () => screen.getByTestId('windows').textContent;

beforeEach(() => {
    localStorage.clear();
    sessionRestoreStore.reset();
    dockItemsStore.reset();
    savedLayoutsStore.reset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ permissions: { 'widget:trello-board': false, 'widget:terminal': true } }),
    }));
    vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('openWindow permission gate', () => {
    it('blocks a denied widget, opens an allowed one and a keyless one', async () => {
        await mount('management');
        await waitFor(() => expect(fetch).toHaveBeenCalled());
        let id: string | null = 'unset';
        act(() => { id = open('trello-board', 'Trello Board', 'trello'); });
        expect(id).toBeNull();
        expect(opened()).toBe('');
        expect(console.info).toHaveBeenCalledWith("You don't have access to Trello Board.");
        act(() => { open('terminal', 'Terminal', 'terminal'); });
        act(() => { open('wiki', 'Wiki', 'book'); });
        expect(opened()).toBe('terminal,wiki');
    });

    it('god opens everything', async () => {
        await mount('god');
        act(() => { open('trello-board', 'Trello Board', 'trello'); });
        act(() => { open('terminal', 'Terminal', 'terminal'); });
        expect(opened()).toBe('trello-board,terminal');
    });
});
