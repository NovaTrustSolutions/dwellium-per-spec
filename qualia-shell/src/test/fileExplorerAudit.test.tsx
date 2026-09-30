import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { refusalFor, MAX_UPLOAD_BYTES } from '../components/FileExplorer/dropUpload';
import { childNames } from '../components/FileExplorer/moveTargets';
import { fileExplorerStore } from '../components/FileExplorer/fileExplorerStore';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

const tree: FileEntry[] = [
    { name: 'Home', path: 'Home', tier: 'domain', children: [
        { name: 'Roof', path: 'Home/Roof', tier: 'project', children: [
            { name: 'quote.md', path: 'Home/Roof/quote.md', tier: 'file' },
        ] },
    ] },
    { name: 'todo.md', path: 'todo.md', tier: 'file' },
];

const fetchTree = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', () => ({
    fetchTree: () => fetchTree(), mkdir: vi.fn(), touch: vi.fn(), move: vi.fn(), rename: vi.fn(), deleteEntry: vi.fn(),
}));

describe('File Explorer audit fixes', () => {
    beforeEach(() => { fileExplorerStore.reset(); localStorage.clear(); fetchTree.mockReset(); });

    it('refuses drops that would be corrupted, rejected or silently dropped', () => {
        const binaryDecode = '%PDF' + String.fromCharCode(0xfffd) + String.fromCharCode(0);
        expect(refusalFor({ name: 'a.md', size: 10 }, 'hello', [])).toBeNull();
        expect(refusalFor({ name: 'a.md', size: 10 }, 'hello', ['a.md'])).toMatch(/already exists/);
        expect(refusalFor({ name: 'big.txt', size: MAX_UPLOAD_BYTES + 1 }, null, [])).toMatch(/too large/);
        expect(refusalFor({ name: 'p.pdf', size: 10 }, binaryDecode, [])).toMatch(/not a text file/);
    });

    it('lists the names inside a folder at any depth', () => {
        expect(childNames(tree, '')).toEqual(['Home', 'todo.md']);
        expect(childNames(tree, 'Home/Roof')).toEqual(['quote.md']);
        expect(childNames(tree, 'Nope')).toEqual([]);
    });

    it('shows the new-entry input on an EMPTY tree', async () => {
        fetchTree.mockResolvedValue([]);
        const { default: FileExplorer } = await import('../components/FileExplorer/FileExplorer');
        render(<FileExplorer />);
        await screen.findByText('No files yet');
        fireEvent.click(screen.getByTitle('New domain (folder at root)'));
        expect(screen.getByPlaceholderText('Domain name')).toBeTruthy();
    });

    it('shows the new-entry input for a NESTED folder (context menu, New File)', async () => {
        fetchTree.mockResolvedValue(tree);
        const { default: FileExplorer } = await import('../components/FileExplorer/FileExplorer');
        render(<FileExplorer />);
        fireEvent.contextMenu(await screen.findByText('Home'));
        fireEvent.click(screen.getByText('New File'));
        await waitFor(() => expect(screen.getByPlaceholderText('filename.md in Home')).toBeTruthy());
    });
});
