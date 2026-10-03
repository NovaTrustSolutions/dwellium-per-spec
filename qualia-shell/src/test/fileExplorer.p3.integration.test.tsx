/** Plan 076 P3 W2 — FileExplorer wiring of FilePreview + TrashPanel + open gestures. */
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import FileExplorer from '../components/FileExplorer/FileExplorer';
import { fileExplorerStore } from '../components/FileExplorer/fileExplorerStore';
import { UserContext } from '../context/UserContext';
import * as api from '../components/FileExplorer/fileExplorerApi';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

vi.mock('../components/FileExplorer/fileExplorerApi', async (orig) => ({
    ...(await orig<typeof api>()),
    fetchTree: vi.fn(),
    readFile: vi.fn(),
    listTrash: vi.fn(),
    restoreFromTrash: vi.fn(),
}));
const m = vi.mocked(api);

const file = (name: string, path = name): FileEntry => ({ name, path, tier: 'file' });
const TREE: FileEntry[] = [
    file('a.txt'),
    { name: 'dir', path: 'dir', tier: 'folder', children: [file('in.txt', 'dir/in.txt')] },
];

function userValue(id: string): any {
    return {
        user: { id, email: `${id}@x.com`, name: id, role: 'admin', assignedProperties: [], active: true, createdAt: '' },
        token: null, role: null, permissions: {}, isAuthenticated: true, sessionExpired: false, isLoading: false,
        login: vi.fn(), loginWithGoogle: vi.fn(), loginLocal: vi.fn(), logout: vi.fn(), authFetch: vi.fn(),
        hasMinRole: () => true, hasPermission: () => true,
    };
}
const Wrapper = ({ userId = 'u1' }: { userId?: string }) => (
    <UserContext.Provider value={userValue(userId)}><FileExplorer /></UserContext.Provider>
);

async function setup(strict = false) {
    const ui = <Wrapper />;
    const r = render(strict ? <StrictMode>{ui}</StrictMode> : ui);
    await screen.findByText('a.txt');
    return r;
}
const openA = async () => {
    fireEvent.doubleClick(screen.getByText('a.txt'));
    await screen.findByText('hello world');
};

beforeEach(() => {
    fileExplorerStore.reset();
    localStorage.clear();
    vi.clearAllMocks();
    m.fetchTree.mockResolvedValue(TREE);
    m.readFile.mockResolvedValue({ content: 'hello world', size: 11, modified: '' });
    m.listTrash.mockResolvedValue([]);
});

describe('FileExplorer P3 integration', () => {
    it('double-click a file opens its preview (StrictMode) and moves focus into it', async () => {
        await setup(true);
        await openA();
        expect(screen.getByRole('region', { name: 'Preview of a.txt' })).toBeTruthy();
        expect(document.activeElement).toBe(screen.getByLabelText('Close preview'));
        expect(screen.queryByRole('textbox')).toBeNull(); // not renaming
    });

    it('opening another file swaps the preview; Esc closes it', async () => {
        await setup();
        await openA();
        m.readFile.mockResolvedValue({ content: 'second', size: 6, modified: '' });
        fireEvent.click(screen.getByText('dir'));
        fireEvent.doubleClick(await screen.findByText('in.txt'));
        await screen.findByText('second');
        expect(screen.queryByRole('region', { name: 'Preview of a.txt' })).toBeNull();
        fireEvent.keyDown(screen.getByLabelText('Close preview'), { key: 'Escape' });
        expect(screen.queryByRole('region')).toBeNull();
    });

    it('double-click a folder expands it and neither opens nor renames', async () => {
        await setup();
        fireEvent.doubleClick(screen.getByText('dir'));
        await screen.findByText('in.txt');
        expect(screen.queryByRole('region')).toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(m.readFile).not.toHaveBeenCalled();
    });

    it('Enter on a selected file opens it', async () => {
        await setup();
        const row = screen.getByText('a.txt');
        fireEvent.click(row);
        fireEvent.keyDown(screen.getByRole('treeitem', { name: /a\.txt/ }), { key: 'Enter' });
        await screen.findByText('hello world');
    });

    it('context menu Open opens the file', async () => {
        await setup();
        fireEvent.contextMenu(screen.getByText('a.txt'));
        fireEvent.click(screen.getByText('Open'));
        await screen.findByText('hello world');
    });

    it('closes the preview when a refresh no longer lists the file', async () => {
        await setup();
        await openA();
        m.fetchTree.mockResolvedValue([TREE[1]]);
        fireEvent.click(screen.getByTitle('Refresh tree'));
        await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    });

    it('Trash button shows the TrashPanel in place of the tree; closing returns to the tree', async () => {
        await setup();
        const btn = screen.getByRole('button', { name: 'Trash' });
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(btn);
        await screen.findByText('Trash is empty');
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        expect(screen.queryByText('a.txt')).toBeNull();
        fireEvent.click(screen.getByLabelText('Close trash'));
        await screen.findByText('a.txt');
        expect(screen.queryByText('Trash is empty')).toBeNull();
    });

    it('restoring from the TrashPanel refreshes the tree and toasts', async () => {
        m.listTrash.mockResolvedValue([{ id: 'i1', path: 'gone.md', name: 'gone.md', isDir: false, deletedAt: null }]);
        m.restoreFromTrash.mockResolvedValue({ path: 'gone.md' });
        await setup();
        fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
        await screen.findByText('gone.md');
        const before = m.fetchTree.mock.calls.length;
        fireEvent.click(screen.getByLabelText('Restore gone.md'));
        await waitFor(() => expect(m.fetchTree.mock.calls.length).toBeGreaterThan(before));
        await screen.findByText('Restored "gone.md"');
    });

    it('account switch closes the preview and the trash', async () => {
        const { rerender } = await setup();
        await openA();
        rerender(<Wrapper userId="u2" />);
        await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
        fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
        await screen.findByText('Trash is empty');
        rerender(<Wrapper userId="u3" />);
        await waitFor(() => expect(screen.queryByText('Trash is empty')).toBeNull());
        expect(screen.getByRole('button', { name: 'Trash' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('review: a restore that finishes after an account switch does not toast on the new account', async () => {
        m.listTrash.mockResolvedValue([{ id: 'i1', path: 'gone.md', name: 'gone.md', isDir: false, deletedAt: null }]);
        let resolveRestore!: (v: { path: string }) => void;
        m.restoreFromTrash.mockReturnValue(new Promise((r) => { resolveRestore = r; }));
        const { rerender } = await setup();
        fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
        fireEvent.click(await screen.findByLabelText('Restore gone.md'));
        await waitFor(() => expect(m.restoreFromTrash).toHaveBeenCalled());
        rerender(<Wrapper userId="u2" />);
        await screen.findByText('a.txt');
        resolveRestore({ path: 'gone.md' });
        await new Promise((r) => setTimeout(r, 30));
        expect(screen.queryByText('Restored "gone.md"')).toBeNull();
    });

    it('review: opening Trash closes the preview, so it does not reappear after', async () => {
        await setup();
        await openA();
        fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
        fireEvent.click(await screen.findByLabelText('Close trash'));
        await screen.findByText('a.txt');
        expect(screen.queryByRole('region', { name: /Preview of/ })).toBeNull();
        expect(m.readFile).toHaveBeenCalledTimes(1);
    });

    it('review: closing the preview returns focus to the row that opened it', async () => {
        await setup();
        fireEvent.click(screen.getByText('a.txt'));
        const rowEl = screen.getByRole('treeitem', { name: /a\.txt/ });
        rowEl.focus();
        fireEvent.keyDown(rowEl, { key: 'Enter' });
        await screen.findByText('hello world');
        fireEvent.click(screen.getByLabelText('Close preview'));
        await waitFor(() => expect(document.activeElement).toBe(rowEl));
    });

    it('review: restore-as suggestion for a dotted FOLDER name keeps the whole name (in-widget prompt)', async () => {
        m.listTrash.mockResolvedValue([{ id: 'i1', path: 'docs/v1.2', name: 'v1.2', isDir: true, deletedAt: null }]);
        m.restoreFromTrash.mockRejectedValueOnce(new api.ApiError('x', 409, 'DEST_EXISTS'));
        const prompt = vi.spyOn(window, 'prompt');
        await setup();
        fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
        fireEvent.click(await screen.findByLabelText('Restore v1.2'));
        const dialog = await screen.findByRole('dialog', { name: 'Restore as' });
        expect(dialog).toHaveAccessibleDescription('"docs/v1.2" already exists. Restore as:');
        expect((within(dialog).getByRole('textbox') as HTMLInputElement).value).toBe('docs/v1.2 (restored)');
        expect(prompt).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        prompt.mockRestore();
    });
});
