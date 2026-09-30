/**
 * Plan 076 Phase 1 — FileExplorer.tsx findings D1 (account switch), D6 (stale
 * response guard on refresh/doMove), D13 (root multi-drop failure summary).
 * Mocking style copied from src/test/fileExplorerAudit.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FileExplorer from '../components/FileExplorer/FileExplorer';
import { fileExplorerStore } from '../components/FileExplorer/fileExplorerStore';
import { UserContext } from '../context/UserContext';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

const fetchTree = vi.fn();
const apiMove = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', () => ({
    fetchTree: (...args: unknown[]) => fetchTree(...args),
    mkdir: vi.fn(),
    touch: vi.fn(),
    move: (...args: unknown[]) => apiMove(...args),
    rename: vi.fn(),
    deleteEntry: vi.fn(),
}));

/** A promise plus its resolve/reject, so a test can control ordering of async work. */
function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function userValue(id: string | null): any {
    return {
        user: id ? { id, email: `${id}@x.com`, name: id, role: 'admin', assignedProperties: [], active: true, createdAt: '' } : null,
        token: null, role: null, permissions: {}, isAuthenticated: !!id, sessionExpired: false, isLoading: false,
        login: vi.fn(), loginWithGoogle: vi.fn(), loginLocal: vi.fn(), logout: vi.fn(), authFetch: vi.fn(),
        hasMinRole: () => true, hasPermission: () => true,
    };
}

function Wrapper({ userId }: { userId: string | null }) {
    return (
        <UserContext.Provider value={userValue(userId)}>
            <FileExplorer />
        </UserContext.Provider>
    );
}

describe('FileExplorer P1 — account switch, stale responses, multi-drop summary', () => {
    beforeEach(() => {
        fileExplorerStore.reset();
        localStorage.clear();
        fetchTree.mockReset();
        apiMove.mockReset();
    });

    it('D1/D6: drops a stale fetch from the old account after switching users, even if it resolves last', async () => {
        const dA = deferred<FileEntry[]>();
        const dB = deferred<FileEntry[]>();
        fetchTree.mockImplementationOnce(() => dA.promise).mockImplementationOnce(() => dB.promise);

        const { rerender } = render(<Wrapper userId="userA" />);
        await waitFor(() => expect(fetchTree).toHaveBeenCalledTimes(1));

        rerender(<Wrapper userId="userB" />);
        await waitFor(() => expect(fetchTree).toHaveBeenCalledTimes(2));

        // B's (newer) fetch resolves first.
        dB.resolve([{ name: 'bravo.md', path: 'bravo.md', tier: 'file' }]);
        await screen.findByText('bravo.md');

        // A's (older, now-stale) fetch resolves late — must never clobber B's tree.
        dA.resolve([{ name: 'alpha.md', path: 'alpha.md', tier: 'file' }]);
        await new Promise((r) => setTimeout(r, 0));

        expect(screen.queryByText('alpha.md')).toBeNull();
        expect(screen.getByText('bravo.md')).toBeTruthy();
    });

    it('D6: an older overlapping refresh() does not win over a newer one', async () => {
        const d1 = deferred<FileEntry[]>();
        const d2 = deferred<FileEntry[]>();
        fetchTree.mockImplementationOnce(() => d1.promise);

        render(<Wrapper userId="userA" />);
        await waitFor(() => expect(fetchTree).toHaveBeenCalledTimes(1));

        fetchTree.mockImplementationOnce(() => d2.promise);
        // Trigger a second, overlapping refresh() via the "New Folder" flow — unlike
        // the Refresh button (disabled while loading), this isn't gated on `loading`,
        // so it can fire while d1 is still pending.
        fireEvent.click(screen.getByTitle('New domain (folder at root)'));
        fireEvent.change(screen.getByPlaceholderText('Domain name'), { target: { value: 'NewDomain' } });
        fireEvent.keyDown(screen.getByPlaceholderText('Domain name'), { key: 'Enter' });
        await waitFor(() => expect(fetchTree).toHaveBeenCalledTimes(2));

        // Newer call (d2) resolves first.
        d2.resolve([{ name: 'new.md', path: 'new.md', tier: 'file' }]);
        await screen.findByText('new.md');

        // Older call (d1) resolves late — must not overwrite the newer result.
        d1.resolve([{ name: 'old.md', path: 'old.md', tier: 'file' }]);
        await new Promise((r) => setTimeout(r, 0));

        expect(screen.queryByText('old.md')).toBeNull();
        expect(screen.getByText('new.md')).toBeTruthy();
    });

    it('D13: root multi-drop reports both a name clash and a thrown error by name', async () => {
        fetchTree.mockResolvedValueOnce([{ name: 'exists.md', path: 'exists.md', tier: 'file' }]);
        render(<Wrapper userId="userA" />);
        await screen.findByText('exists.md');

        apiMove.mockRejectedValueOnce(new Error('boom'));
        fetchTree.mockResolvedValueOnce([{ name: 'exists.md', path: 'exists.md', tier: 'file' }]);

        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const payloads = [
            { name: 'exists.md', path: 'folder/exists.md' },
            { name: 'fails.md', path: 'folder/fails.md' },
        ];
        const dataTransfer = {
            getData: (type: string) => (type === 'application/x-dwellium-paths' ? JSON.stringify(payloads) : ''),
        };

        fireEvent.drop(screen.getByRole('tree'), { dataTransfer, altKey: false });

        await waitFor(() => expect(alertSpy).toHaveBeenCalled());
        const message = alertSpy.mock.calls[0][0] as string;
        expect(message).toMatch(/exists\.md/);
        expect(message).toMatch(/already exists at root/);
        expect(message).toMatch(/fails\.md/);
        expect(message).toMatch(/boom/);
        expect(message).toMatch(/Moved 0 of 2/);

        alertSpy.mockRestore();
    });
});
