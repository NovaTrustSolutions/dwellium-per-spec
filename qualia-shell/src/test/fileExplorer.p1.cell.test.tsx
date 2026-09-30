/**
 * Plan 076 Phase 1 — FileExplorerCell delete/keyboard coverage (D2, D3, D13).
 * Mocking style copied from fileExplorerAudit.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fileExplorerStore, saveFileExplorer } from '../components/FileExplorer/fileExplorerStore';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

const tree: FileEntry[] = [
    { name: 'a.md', path: 'a.md', tier: 'file' },
    { name: 'b.md', path: 'b.md', tier: 'file' },
    { name: 'c.md', path: 'c.md', tier: 'file' },
    { name: 'd.md', path: 'd.md', tier: 'file' },
];

const fetchTree = vi.fn();
const deleteEntry = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', () => ({
    fetchTree: () => fetchTree(),
    mkdir: vi.fn(),
    touch: vi.fn(),
    move: vi.fn(),
    rename: vi.fn(),
    deleteEntry: (path: string) => deleteEntry(path),
}));

async function renderTree() {
    fetchTree.mockResolvedValue(tree);
    const { default: FileExplorer } = await import('../components/FileExplorer/FileExplorer');
    render(<FileExplorer />);
    await screen.findByText('a.md');
}

function cmdClick(name: string) {
    fireEvent.click(screen.getByText(name), { metaKey: true });
}

describe('FileExplorerCell delete (Plan 076 P1)', () => {
    beforeEach(() => {
        fileExplorerStore.reset();
        localStorage.clear();
        fetchTree.mockReset();
        deleteEntry.mockReset();
        deleteEntry.mockResolvedValue({ trashedTo: '.trash/x' });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        vi.spyOn(window, 'alert').mockImplementation(() => {});
    });

    it('deletes the whole multi-selection when Delete is chosen from a selected row\'s context menu', async () => {
        await renderTree();
        cmdClick('a.md');
        cmdClick('b.md');
        cmdClick('c.md');

        fireEvent.contextMenu(screen.getByText('b.md'));
        fireEvent.click(screen.getByText('Delete'));

        await waitFor(() => expect(deleteEntry).toHaveBeenCalledTimes(3));
        expect(deleteEntry).toHaveBeenCalledWith('a.md');
        expect(deleteEntry).toHaveBeenCalledWith('b.md');
        expect(deleteEntry).toHaveBeenCalledWith('c.md');

        const confirmMsg = (window.confirm as any).mock.calls[0][0] as string;
        expect(confirmMsg).toMatch(/3 items/);
        expect(confirmMsg).toMatch(/Trash/);
    });

    it('right-clicking a row OUTSIDE the selection deletes only that row', async () => {
        await renderTree();
        cmdClick('a.md');
        cmdClick('b.md');
        cmdClick('c.md');

        fireEvent.contextMenu(screen.getByText('d.md'));
        fireEvent.click(screen.getByText('Delete'));

        await waitFor(() => expect(deleteEntry).toHaveBeenCalledTimes(1));
        expect(deleteEntry).toHaveBeenCalledWith('d.md');
    });

    it('names the one failure out of three in the summary alert', async () => {
        await renderTree();
        cmdClick('a.md');
        cmdClick('b.md');
        cmdClick('c.md');
        deleteEntry.mockImplementation((path: string) =>
            path === 'b.md' ? Promise.reject(new Error('locked')) : Promise.resolve({}));

        fireEvent.contextMenu(screen.getByText('a.md'));
        fireEvent.click(screen.getByText('Delete'));

        await waitFor(() => expect(deleteEntry).toHaveBeenCalledTimes(3));
        await waitFor(() => expect(window.alert).toHaveBeenCalled());
        const alertMsg = (window.alert as any).mock.calls[0][0] as string;
        expect(alertMsg).toMatch(/"b.md"/);
        expect(alertMsg).toMatch(/locked/);
    });

    it('Delete key on a selected row triggers delete; Backspace while renaming does not', async () => {
        await renderTree();
        fireEvent.click(screen.getByText('a.md'));
        fireEvent.keyDown(screen.getByText('a.md').closest('[role="treeitem"]')!, { key: 'Delete' });

        await waitFor(() => expect(deleteEntry).toHaveBeenCalledTimes(1));
        expect(deleteEntry).toHaveBeenCalledWith('a.md');

        deleteEntry.mockClear();
        fireEvent.doubleClick(screen.getByText('c.md'));
        const input = screen.getByDisplayValue('c.md');
        fireEvent.keyDown(input, { key: 'Backspace' });

        expect(deleteEntry).not.toHaveBeenCalled();
    });

    it('never says the delete cannot be undone', async () => {
        await renderTree();
        cmdClick('a.md');
        cmdClick('b.md');
        fireEvent.contextMenu(screen.getByText('a.md'));
        fireEvent.click(screen.getByText('Delete'));
        await waitFor(() => expect(deleteEntry).toHaveBeenCalled());

        for (const call of (window.confirm as any).mock.calls) {
            expect(call[0]).not.toMatch(/cannot be undone/i);
        }
    });

    it('names the folder, not the clicked child, when the selected parent folder is what gets trashed', async () => {
        fetchTree.mockResolvedValue([
            { name: 'A', path: 'A', tier: 'domain', children: [{ name: 'x.md', path: 'A/x.md', tier: 'file' }] },
        ]);
        saveFileExplorer({ expanded: { A: true }, selectedPaths: ['A', 'A/x.md'], selectedPath: 'A/x.md' });
        const { default: FileExplorer } = await import('../components/FileExplorer/FileExplorer');
        render(<FileExplorer />);
        await screen.findByText('x.md');

        fireEvent.contextMenu(screen.getByText('x.md'));
        fireEvent.click(screen.getByText('Delete'));

        await waitFor(() => expect(deleteEntry).toHaveBeenCalledTimes(1));
        expect(deleteEntry).toHaveBeenCalledWith('A');
        const confirmMsg = (window.confirm as any).mock.calls[0][0] as string;
        expect(confirmMsg).not.toMatch(/Move "x\.md"/);
        expect(confirmMsg).toMatch(/\nA$/);
        // The child went with its folder — nothing stays selected.
        await waitFor(() => expect(fileExplorerStore.getSnapshot().selectedPaths).toEqual([]));
    });

    it('review #2: menu actions other than Delete collapse a multi-selection to the clicked row', async () => {
        await renderTree();
        cmdClick('a.md');
        cmdClick('b.md');
        fireEvent.contextMenu(screen.getByText('b.md'));
        fireEvent.click(screen.getByText('Rename'));
        await waitFor(() => expect(fileExplorerStore.getSnapshot().selectedPaths).toEqual(['b.md']));
    });
});
