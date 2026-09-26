/**
 * Plan 070 — notes belong to their creator; god-only "Show other users' notes"
 * toggle. Covers the pure param helper, the Settings toggle's god-only gate,
 * and Notepad's list request carrying `scope=all` only for god + toggle-on.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { UserContext, type DwelliumUser } from '../context/UserContext';
import { notesScopeParam, notesScopeStore } from '../lib/notesScopeStore';
import { notesScopeUserIdHolder } from '../lib/perUserIdentity';
import NotesScopeSection from '../components/ControlPanel/NotesScopeSection';
import Notepad from '../components/Notepad/Notepad';

vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({ hierarchy: [] }),
}));

function makeUser(overrides: Partial<DwelliumUser>): DwelliumUser {
    return {
        id: 'u1',
        email: 'u1@dwellium.com',
        name: 'User One',
        role: 'management',
        assignedProperties: [],
        active: true,
        createdAt: '',
        updatedAt: '',
        ...overrides,
    };
}

function contextValue(user: DwelliumUser | null) {
    return {
        user,
        token: null,
        role: user?.role ?? null,
        permissions: {},
        isAuthenticated: !!user,
        sessionExpired: false,
        isLoading: false,
        login: vi.fn(),
        loginWithGoogle: vi.fn(),
        loginLocal: vi.fn(),
        logout: vi.fn(),
        authFetch: vi.fn(),
        hasMinRole: vi.fn(() => false),
        hasPermission: vi.fn(() => false),
    } as never;
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); });
beforeEach(() => { notesScopeStore.reset(); });

describe('notesScopeParam — helper truth table', () => {
    it('god + on -> scope=all', () => {
        expect(notesScopeParam('god', true)).toBe('scope=all');
    });
    it('god + off -> empty', () => {
        expect(notesScopeParam('god', false)).toBe('');
    });
    it('non-god + on -> empty (never honoured for anyone else)', () => {
        expect(notesScopeParam('management', true)).toBe('');
    });
    it('non-god + off -> empty', () => {
        expect(notesScopeParam('management', false)).toBe('');
    });
    it('null/undefined role -> empty', () => {
        expect(notesScopeParam(null, true)).toBe('');
        expect(notesScopeParam(undefined, true)).toBe('');
    });
});

describe('NotesScopeSection — god-only gate', () => {
    it('renders nothing for a non-god user', () => {
        const { container } = render(
            <UserContext.Provider value={contextValue(makeUser({ role: 'management' }))}>
                <NotesScopeSection />
            </UserContext.Provider>,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders the toggle for a god user', () => {
        render(
            <UserContext.Provider value={contextValue(makeUser({ id: 'andy', role: 'god' }))}>
                <NotesScopeSection />
            </UserContext.Provider>,
        );
        expect(screen.getByText("Show other users' notes")).toBeInTheDocument();
        expect(screen.getByText(/Notepad, ⌘K and Search will include every user's notes/)).toBeInTheDocument();
    });
});

describe('Notepad notes list request — scope=all only for god + toggle on', () => {
    it('non-god user, toggle stored on (ignored): no scope param', async () => {
        notesScopeUserIdHolder.current = 'lisa';
        notesScopeStore.setReadOthers(true);
        const fetchMock = vi.fn(async (..._args: unknown[]) => json({ success: true, data: [] }));
        vi.stubGlobal('fetch', fetchMock);

        render(
            <UserContext.Provider value={contextValue(makeUser({ id: 'lisa', role: 'management' }))}>
                <Notepad />
            </UserContext.Provider>,
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const urls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes('/api/files/notes'))).toBe(true);
        expect(urls.some((u) => u.includes('scope=all'))).toBe(false);
    });

    it('god user, toggle off: no scope param', async () => {
        notesScopeUserIdHolder.current = 'andy';
        notesScopeStore.setReadOthers(false);
        const fetchMock = vi.fn(async (..._args: unknown[]) => json({ success: true, data: [] }));
        vi.stubGlobal('fetch', fetchMock);

        render(
            <UserContext.Provider value={contextValue(makeUser({ id: 'andy', role: 'god' }))}>
                <Notepad />
            </UserContext.Provider>,
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const urls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes('scope=all'))).toBe(false);
    });

    it('god user, toggle on: list request carries scope=all', async () => {
        notesScopeUserIdHolder.current = 'andy';
        notesScopeStore.setReadOthers(true);
        const fetchMock = vi.fn(async (..._args: unknown[]) => json({ success: true, data: [] }));
        vi.stubGlobal('fetch', fetchMock);

        render(
            <UserContext.Provider value={contextValue(makeUser({ id: 'andy', role: 'god' }))}>
                <Notepad />
            </UserContext.Provider>,
        );

        await waitFor(() => {
            const urls = fetchMock.mock.calls.map((c) => String(c[0]));
            expect(urls.some((u) => u.includes('/api/files/notes') && u.includes('scope=all'))).toBe(true);
        });
    });
});
