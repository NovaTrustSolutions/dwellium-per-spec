/**
 * Plan 076 P4 W2 — FileExplorer integration: in-widget dialogs, roving-tabindex keyboard nav, filter,
 * breadcrumbs, upload (button / Finder drop / pasted screenshot), download, drag-out payloads and the
 * file-tree-changed refetch. Mock style: async-orig (real module + the calls each test needs replaced).
 */
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import FileExplorer from '../components/FileExplorer/FileExplorer';
import { fileExplorerStore, saveFileExplorer, fileExplorerUserIdHolder } from '../components/FileExplorer/fileExplorerStore';
import * as api from '../components/FileExplorer/fileExplorerApi';
import { UserContext } from '../context/UserContext';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

vi.mock('../components/FileExplorer/fileExplorerApi', async (orig) => ({
    ...(await orig<typeof api>()),
    fetchTree: vi.fn(),
    deleteEntry: vi.fn(),
    touch: vi.fn(),
    mkdir: vi.fn(),
    uploadFiles: vi.fn(),
    downloadFile: vi.fn(),
    listTrash: vi.fn(),
    emptyTrash: vi.fn(),
    restoreFromTrash: vi.fn(),
    deleteFromTrash: vi.fn(),
    readFile: vi.fn(),
    rename: vi.fn(),
}));
const m = vi.mocked(api);

const f = (name: string, path = name): FileEntry => ({ name, path, tier: 'file' });
const TREE: FileEntry[] = [
    { name: 'A', path: 'A', tier: 'folder', children: [
        f('x.md', 'A/x.md'),
        { name: 'B', path: 'A/B', tier: 'folder', children: [f('deep.md', 'A/B/deep.md')] },
    ] },
    f('b.md'),
    f('c.png'),
];

let confirmSpy: ReturnType<typeof vi.spyOn>, alertSpy: ReturnType<typeof vi.spyOn>, promptSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    fileExplorerStore.reset();
    localStorage.clear();
    vi.clearAllMocks();
    m.fetchTree.mockResolvedValue(TREE);
    m.listTrash.mockResolvedValue([]);
    m.deleteEntry.mockResolvedValue({});
    m.touch.mockResolvedValue();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('nope');
});
afterEach(() => {
    // The whole point of P4: nothing in this widget reaches the native dialogs.
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(promptSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
});

async function mount(strict = false) {
    const ui = <FileExplorer />;
    const r = render(strict ? <StrictMode>{ui}</StrictMode> : ui);
    await screen.findByRole('treeitem', { name: /b\.md/ });
    return r;
}
const row = (path: string): HTMLElement => {
    const el = Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).find((n) => n.dataset.path === path);
    if (!el) throw new Error(`no row ${path}`);
    return el;
};
const rowPaths = () => Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).map((n) => n.dataset.path);
const key = (path: string, k: string) => fireEvent.keyDown(row(path), { key: k });
const focused = () => (document.activeElement as HTMLElement | null)?.dataset.path;
const dialog = () => screen.findByRole('dialog');
const file = (name: string, bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0, 1, 2]) =>
    new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' });
const userValue = (id: string): any => ({
    user: { id, email: `${id}@x.com`, name: id, role: 'admin', assignedProperties: [], active: true, createdAt: '' },
    token: null, role: null, permissions: {}, isAuthenticated: true, sessionExpired: false, isLoading: false,
    login: vi.fn(), loginWithGoogle: vi.fn(), loginLocal: vi.fn(), logout: vi.fn(), authFetch: vi.fn(),
    hasMinRole: () => true, hasPermission: () => true,
});
const ui = (id: string) => <UserContext.Provider value={userValue(id)}><FileExplorer /></UserContext.Provider>;
const okResult = (name: string, dir = '') => ({ name, path: dir ? `${dir}/${name}` : name, status: 'ok' as const });

describe('dialogs replace the native alert / confirm / prompt', () => {
    it('Delete asks in-widget: Cancel keeps the file, confirm trashes it', async () => {
        await mount();
        fireEvent.contextMenu(row('b.md'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        let d = await dialog();
        expect(d).toHaveAccessibleDescription('Move "b.md" to Trash?');
        expect(d.getAttribute('data-danger')).toBe('true');
        fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(m.deleteEntry).not.toHaveBeenCalled();

        fireEvent.contextMenu(row('b.md'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        d = await dialog();
        fireEvent.click(within(d).getByRole('button', { name: 'Move to Trash' }));
        await waitFor(() => expect(m.deleteEntry).toHaveBeenCalledWith('b.md'));
    });

    it('a delete confirmed after an account switch does not touch the new account', async () => {
        const { rerender } = render(ui('u1'));
        await screen.findByRole('treeitem', { name: /b\.md/ });
        fireEvent.contextMenu(row('b.md'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        const d = await dialog();
        rerender(ui('u2')); // re-auth as someone else while the question is open
        await screen.findByRole('treeitem', { name: /b\.md/ });
        fireEvent.click(within(d).getByRole('button', { name: 'Move to Trash' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await new Promise((r) => setTimeout(r, 20));
        expect(m.deleteEntry).not.toHaveBeenCalled();
    });

    it('a restore whose tree reload is still running when the account switches does not toast on the new account', async () => {
        m.listTrash.mockResolvedValue([{ id: 'i1', path: 'gone.md', name: 'gone.md', isDir: false, deletedAt: null }]);
        m.restoreFromTrash.mockResolvedValue({ path: 'gone.md' });
        const { rerender } = render(ui('u1'));
        await screen.findByRole('treeitem', { name: /b\.md/ });
        fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
        let release!: (t: FileEntry[]) => void;
        m.fetchTree.mockReturnValueOnce(new Promise<FileEntry[]>((r) => { release = r; })); // the reload after the restore
        fireEvent.click(await screen.findByLabelText('Restore gone.md'));
        await waitFor(() => expect(m.fetchTree).toHaveBeenCalledTimes(2));
        rerender(ui('u2'));
        release(TREE);
        await new Promise((r) => setTimeout(r, 30));
        expect(screen.queryByText('Restored "gone.md"')).toBeNull();
    });

    it('a Trash delete-forever confirmed after an account switch does not touch the new account', async () => {
        m.listTrash.mockResolvedValue([{ id: 'i1', path: 'gone.md', name: 'gone.md', isDir: false, deletedAt: null }]);
        const { rerender } = render(ui('u1'));
        await screen.findByRole('treeitem', { name: /b\.md/ });
        fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
        fireEvent.click(await screen.findByLabelText('Delete gone.md forever'));
        const d = await dialog();
        rerender(ui('u2')); // closes the Trash panel; the question is still on screen
        await waitFor(() => expect(screen.queryByLabelText('Delete gone.md forever')).toBeNull());
        fireEvent.click(within(d).getByRole('button', { name: 'Delete forever' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await new Promise((r) => setTimeout(r, 20));
        expect(api.deleteFromTrash).not.toHaveBeenCalled();
    });

    it('Delete from the keyboard returns focus to the row once the dialog closes', async () => {
        await mount();
        row('b.md').focus();
        fireEvent.click(row('b.md'));
        key('b.md', 'Delete');
        fireEvent.click(within(await dialog()).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(document.activeElement).toBe(row('b.md')));
    });

    it('Empty trash is gated on typing EMPTY, through the widget', async () => {
        m.listTrash.mockResolvedValue([{ id: 'i1', path: 'gone.md', name: 'gone.md', isDir: false, deletedAt: null }]);
        m.emptyTrash.mockResolvedValue({ removed: 1 });
        await mount();
        fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Empty trash' }));
        const d = await dialog();
        const go = within(d).getByRole('button', { name: 'Empty trash' }) as HTMLButtonElement;
        expect(go.disabled).toBe(true);
        fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'EMPT' } });
        expect(go.disabled).toBe(true);
        expect(m.emptyTrash).not.toHaveBeenCalled();
        fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'EMPTY' } });
        fireEvent.click(go);
        await waitFor(() => expect(m.emptyTrash).toHaveBeenCalledTimes(1));
    });

    it('a failed rename is an error toast', async () => {
        m.rename.mockRejectedValueOnce(new Error('nope!'));
        await mount();
        fireEvent.click(row('b.md'));
        key('b.md', 'F2');
        const input = screen.getByDisplayValue('b.md');
        fireEvent.change(input, { target: { value: 'z.md' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect((await screen.findByRole('alert')).textContent).toContain('Rename failed: nope!');
    });
});

describe('keyboard navigation (roving tabindex)', () => {
    const tabStops = () => Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).filter((n) => n.tabIndex === 0);

    it('arrows move focus across rows, into an expanded folder and back to its parent (StrictMode)', async () => {
        saveFileExplorer({ expanded: { A: true } });
        await mount(true);
        expect(rowPaths()).toEqual(['A', 'A/x.md', 'A/B', 'b.md', 'c.png']);
        row('A').focus();
        key('A', 'ArrowDown');
        expect(focused()).toBe('A/x.md');
        key('A/x.md', 'ArrowDown'); expect(focused()).toBe('A/B');
        key('A/B', 'ArrowDown'); expect(focused()).toBe('b.md');
        key('b.md', 'ArrowUp'); expect(focused()).toBe('A/B');
        key('A/B', 'ArrowLeft'); expect(focused()).toBe('A'); // collapsed child folder -> parent
        key('A', 'ArrowDown'); key('A/x.md', 'ArrowLeft');
        expect(focused()).toBe('A'); // file -> its parent
        key('A', 'End'); expect(focused()).toBe('c.png');
        key('c.png', 'Home'); expect(focused()).toBe('A');
        key('A', 'ArrowRight'); expect(focused()).toBe('A/x.md'); // open folder -> first child
        expect(fileExplorerStore.getSnapshot().selectedPath).toBe('A/x.md'); // selection follows focus
    });

    it('Left collapses / Right expands a folder; Enter toggles a folder and opens a file', async () => {
        m.readFile.mockResolvedValue({ content: 'hello body', size: 10, modified: '' });
        await mount();
        row('A').focus();
        key('A', 'ArrowRight');
        await waitFor(() => expect(rowPaths()).toContain('A/x.md'));
        key('A', 'ArrowLeft');
        await waitFor(() => expect(rowPaths()).not.toContain('A/x.md'));
        key('A', 'Enter');
        await waitFor(() => expect(rowPaths()).toContain('A/x.md'));
        row('b.md').focus();
        key('b.md', 'Enter');
        await screen.findByText('hello body');
        expect(m.readFile).toHaveBeenCalledWith('b.md');
    });

    it('exactly one row is tabbable: first row by default, then the focused / selected one', async () => {
        saveFileExplorer({ expanded: { A: true } });
        await mount();
        expect(tabStops().map((n) => n.dataset.path)).toEqual(['A']);
        row('b.md').focus();
        await waitFor(() => expect(tabStops().map((n) => n.dataset.path)).toEqual(['b.md']));
        key('b.md', 'ArrowDown');
        await waitFor(() => expect(tabStops().map((n) => n.dataset.path)).toEqual(['c.png']));
        // a multi-selection does not add tab stops
        fireEvent.click(row('A/x.md'), { metaKey: true });
        fireEvent.click(row('b.md'), { metaKey: true });
        expect(tabStops()).toHaveLength(1);
    });

    it('modified arrows are left alone (no focus move)', async () => {
        await mount();
        row('A').focus();
        fireEvent.keyDown(row('A'), { key: 'ArrowDown', metaKey: true });
        expect(focused()).toBe('A');
    });
});

describe('filter', () => {
    it('shows matches with their ancestors, never touches the saved expanded map, Esc restores', async () => {
        saveFileExplorer({ expanded: { A: true } });
        await mount();
        const before = JSON.stringify(fileExplorerStore.getSnapshot().expanded);
        expect(rowPaths()).toEqual(['A', 'A/x.md', 'A/B', 'b.md', 'c.png']);
        const box = screen.getByRole('searchbox', { name: 'Filter files' });
        fireEvent.change(box, { target: { value: 'DEEP' } });
        expect(rowPaths()).toEqual(['A', 'A/B', 'A/B/deep.md']); // A/B forced open for display only
        expect(JSON.stringify(fileExplorerStore.getSnapshot().expanded)).toBe(before);
        expect(JSON.parse(localStorage.getItem('file-explorer:_anonymous') ?? '{}').expanded).toEqual({ A: true }); // what is on disk
        fireEvent.keyDown(box, { key: 'Escape' });
        expect((box as HTMLInputElement).value).toBe('');
        expect(rowPaths()).toEqual(['A', 'A/x.md', 'A/B', 'b.md', 'c.png']); // A/B is collapsed again
        expect(JSON.stringify(fileExplorerStore.getSnapshot().expanded)).toBe(before);
    });

    it('a click cannot collapse a folder the filter is holding open, and does not save anything', async () => {
        await mount();
        fireEvent.change(screen.getByRole('searchbox', { name: 'Filter files' }), { target: { value: 'deep' } });
        expect(rowPaths()).toContain('A/B/deep.md');
        fireEvent.click(row('A'));
        expect(rowPaths()).toContain('A/B/deep.md');
        expect(fileExplorerStore.getSnapshot().expanded).toEqual({});
    });

    it('says so when nothing matches', async () => {
        await mount();
        fireEvent.change(screen.getByRole('searchbox', { name: 'Filter files' }), { target: { value: 'zzz' } });
        expect(screen.getByRole('status').textContent).toContain('No files match');
        expect(rowPaths()).toEqual([]);
    });
});

describe('breadcrumbs', () => {
    it('are hidden with no selection; a crumb selects that folder, opens its ancestors and focuses its row', async () => {
        await mount();
        expect(screen.queryByRole('navigation', { name: 'Location' })).toBeNull();
        saveFileExplorer({ selectedPath: 'A/B/deep.md', selectedPaths: ['A/B/deep.md'] });
        const nav = await screen.findByRole('navigation', { name: 'Location' });
        expect(rowPaths()).toEqual(['A', 'b.md', 'c.png']); // deep.md itself is not visible
        fireEvent.click(within(nav).getByRole('button', { name: 'B' }));
        await waitFor(() => expect(rowPaths()).toContain('A/B'));
        expect(fileExplorerStore.getSnapshot().selectedPath).toBe('A/B');
        expect(fileExplorerStore.getSnapshot().expanded.A).toBe(true);
        expect(fileExplorerStore.getSnapshot().expanded['A/B']).toBeUndefined(); // ancestors only
        await waitFor(() => expect(focused()).toBe('A/B'));
    });

    it('the root crumb clears the selection and hides the breadcrumbs', async () => {
        saveFileExplorer({ selectedPath: 'A/x.md', selectedPaths: ['A/x.md'], expanded: { A: true } });
        await mount();
        fireEvent.click(within(await screen.findByRole('navigation', { name: 'Location' })).getByRole('button', { name: 'root' }));
        await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Location' })).toBeNull());
        expect(fileExplorerStore.getSnapshot().selectedPath).toBeNull();
    });
});

describe('upload', () => {
    const pick = (files: File[]) => fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files } });

    it('the toolbar button opens the picker; picked files go to the selected folder, a selected file\'s folder, or root', async () => {
        m.uploadFiles.mockImplementation(async (fs: File[]) => fs.map((x) => okResult(x.name)));
        saveFileExplorer({ expanded: { A: true } });
        await mount();
        const click = vi.spyOn(screen.getByTestId('file-upload-input'), 'click');
        fireEvent.click(screen.getByRole('button', { name: 'Upload files' }));
        expect(click).toHaveBeenCalledTimes(1);

        const one = file('one.png');
        act(() => saveFileExplorer({ selectedPath: 'A', selectedPaths: ['A'] }));
        pick([one]);
        await waitFor(() => expect(m.uploadFiles).toHaveBeenLastCalledWith([one], 'A'));

        const two = file('two.png');
        act(() => saveFileExplorer({ selectedPath: 'A/x.md', selectedPaths: ['A/x.md'] }));
        pick([two]);
        await waitFor(() => expect(m.uploadFiles).toHaveBeenLastCalledWith([two], 'A'));

        const three = file('three.png');
        act(() => saveFileExplorer({ selectedPath: null, selectedPaths: [] }));
        pick([three]);
        await waitFor(() => expect(m.uploadFiles).toHaveBeenLastCalledWith([three], ''));
    });

    it('summarises "Uploaded N of M" and names every skipped file with why', async () => {
        m.uploadFiles.mockResolvedValue([
            okResult('a.png'),
            { name: 'b.txt', path: 'b.txt', status: 'exists' },
            { name: 'c.exe', path: 'c.exe', status: 'invalid' },
            { name: 'd.pdf', path: 'd.pdf', status: 'error', error: 'disk full' },
        ]);
        await mount();
        pick([file('a.png'), file('b.txt'), file('c.exe'), file('d.pdf')]);
        const toast = await screen.findByRole('alert'); // partial success is an error-tone toast
        expect(toast.textContent).toContain('Uploaded 1 of 4');
        expect(toast.textContent).toContain('"b.txt": already exists here');
        expect(toast.textContent).toContain('"c.exe": not an accepted name or file');
        expect(toast.textContent).toContain('"d.pdf": disk full');
        await waitFor(() => expect(m.fetchTree.mock.calls.length).toBeGreaterThan(1)); // something was stored -> refetch
    });

    it('a rejected request is reported, not thrown', async () => {
        m.uploadFiles.mockRejectedValue(new Error('network down'));
        await mount();
        pick([file('a.png')]);
        expect((await screen.findByRole('alert')).textContent).toContain('Upload failed: network down');
    });

    it('a binary Finder drop on the tree area and on a folder row goes through uploadFiles', async () => {
        m.uploadFiles.mockImplementation(async (fs: File[], dest: string) => fs.map((x) => okResult(x.name, dest)));
        await mount();
        const png = file('photo.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0xff]);
        const dt = (files: File[]) => ({ files, types: ['Files'], getData: () => '' });
        fireEvent.drop(screen.getByRole('tree'), { dataTransfer: dt([png]) });
        await waitFor(() => expect(m.uploadFiles).toHaveBeenLastCalledWith([png], ''));
        const pdf = file('scan.pdf', [0x25, 0x50, 0x44, 0x46, 0, 0xfd]);
        fireEvent.drop(row('A'), { dataTransfer: dt([pdf]) });
        await waitFor(() => expect(m.uploadFiles).toHaveBeenLastCalledWith([pdf], 'A'));
        expect(m.touch).not.toHaveBeenCalled(); // the old text-only /touch path is gone
        await screen.findAllByText(/Uploaded 1 of 1/);
    });
});

describe('download and drag-out', () => {
    it('context-menu Download saves a file; folders have no Download; errors are toasts', async () => {
        await mount();
        fireEvent.contextMenu(row('A'));
        expect(screen.queryByRole('menuitem', { name: 'Download' })).toBeNull();
        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.contextMenu(row('c.png'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Download' }));
        await waitFor(() => expect(m.downloadFile).toHaveBeenCalledWith('c.png'));

        m.downloadFile.mockRejectedValueOnce(new Error('gone'));
        fireEvent.contextMenu(row('b.md'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Download' }));
        expect((await screen.findByRole('alert')).textContent).toContain('Download failed: gone');
    });

    it('dragstart keeps the in-app payload and never sets text/uri-list', async () => {
        await mount();
        const setData = vi.fn();
        fireEvent.dragStart(row('b.md'), { dataTransfer: { setData, setDragImage: vi.fn(), effectAllowed: '' } });
        const types = setData.mock.calls.map((c) => c[0]);
        expect(types).toContain('application/x-dwellium-path');
        expect(types).not.toContain('text/uri-list');
    });
});

describe('screenshot paste', () => {
    it('uploads the image into the target folder and writes a .md that links it by a relative name', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        m.uploadFiles.mockImplementation(async (fs: File[], dest: string) => fs.map((x) => okResult(x.name, dest)));
        saveFileExplorer({ expanded: { A: true }, selectedPath: 'A', selectedPaths: ['A'] });
        await mount();
        const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
        fireEvent.paste(screen.getByRole('tree'), { clipboardData: { items: [{ type: 'image/png', getAsFile: () => blob }] } });

        await waitFor(() => expect(m.touch).toHaveBeenCalledTimes(1));
        const [sent, dest] = m.uploadFiles.mock.calls[0] as [File[], string];
        expect(dest).toBe('A');
        expect(sent[0].name).toMatch(/^screenshot-.+\.png$/);
        const [mdPath, content] = m.touch.mock.calls[0] as [string, string];
        expect(mdPath).toBe(`A/${sent[0].name.replace(/\.png$/, '.md')}`);
        expect(content).toContain(`![screenshot](${sent[0].name})`); // relative: just the file name
        expect(content).not.toMatch(/\]\((https?:|\/)/);
        expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes('/api/scribe/images'))).toBe(false);
        await screen.findByText(/1 screenshot pasted to A/);
    });

    it('does nothing for a non-image paste, and a failed image upload writes no .md', async () => {
        m.uploadFiles.mockResolvedValue([{ name: 'x', path: 'x', status: 'invalid' }]);
        await mount();
        fireEvent.paste(screen.getByRole('tree'), { clipboardData: { items: [{ type: 'text/plain', getAsFile: () => null }] } });
        expect(m.uploadFiles).not.toHaveBeenCalled();
        const blob = new Blob(['x'], { type: 'image/png' });
        fireEvent.paste(screen.getByRole('tree'), { clipboardData: { items: [{ type: 'image/png', getAsFile: () => blob }] } });
        expect((await screen.findByRole('alert')).textContent).toContain('Could not paste 1 screenshot');
        expect(m.touch).not.toHaveBeenCalled();
    });
});

describe('file-tree-changed', () => {
    it('refetches (debounced to one fetch for a burst) and stops listening after unmount', async () => {
        const { unmount } = await mount();
        const base = m.fetchTree.mock.calls.length;
        m.fetchTree.mockResolvedValue([f('fresh.md')]);
        for (let i = 0; i < 3; i++) window.dispatchEvent(new Event(api.FILE_TREE_CHANGED));
        await screen.findByRole('treeitem', { name: /fresh\.md/ });
        await new Promise((r) => setTimeout(r, 450));
        expect(m.fetchTree.mock.calls.length).toBe(base + 1);

        unmount();
        window.dispatchEvent(new Event(api.FILE_TREE_CHANGED));
        await new Promise((r) => setTimeout(r, 450));
        expect(m.fetchTree.mock.calls.length).toBe(base + 1);
    });
});

describe('P4 review follow-ups (orchestrator)', () => {
    it('an account switch closes an open dialog so the previous account\'s file names disappear', async () => {
        const { rerender } = render(ui('u1'));
        await screen.findByRole('treeitem', { name: /b\.md/ });
        fireEvent.contextMenu(row('b.md'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        await dialog();
        rerender(ui('u2'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(m.deleteEntry).not.toHaveBeenCalled();
    });

    it('Delete says how many selected items the filter is hiding', async () => {
        fileExplorerUserIdHolder.current = null; // an earlier test left it on 'u2'; mount() has no user
        saveFileExplorer({ selectedPaths: ['b.md', 'c.png'], selectedPath: 'c.png' });
        await mount();
        expect(fileExplorerStore.getSnapshot().selectedPaths).toEqual(['b.md', 'c.png']);
        fireEvent.change(screen.getByRole('searchbox', { name: 'Filter files' }), { target: { value: 'b.md' } });
        expect(rowPaths()).toEqual(['b.md']);
        expect(fileExplorerStore.getSnapshot().selectedPaths).toEqual(['b.md', 'c.png']);
        fireEvent.contextMenu(row('b.md'));
        expect(fileExplorerStore.getSnapshot().selectedPaths).toEqual(['b.md', 'c.png']);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        const d = await dialog();
        expect(d.textContent).toMatch(/1 of these is not shown right now/);
        fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    });

    it('ArrowLeft on a folder the filter holds open moves to its parent', async () => {
        await mount();
        fireEvent.change(screen.getByRole('searchbox', { name: 'Filter files' }), { target: { value: 'deep' } });
        row('A/B').focus();
        key('A/B', 'ArrowLeft');
        await waitFor(() => expect(focused()).toBe('A'));
    });
});
