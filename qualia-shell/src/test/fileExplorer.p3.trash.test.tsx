import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { TrashPanel } from '../components/FileExplorer/TrashPanel';
import { useFileDialogs } from '../components/FileExplorer/FileDialogs';
import * as api from '../components/FileExplorer/fileExplorerApi';

vi.mock('../components/FileExplorer/fileExplorerApi', async (orig) => ({
    ...(await orig<typeof api>()),
    listTrash: vi.fn(),
    restoreFromTrash: vi.fn(),
    deleteFromTrash: vi.fn(),
    emptyTrash: vi.fn(),
}));

const m = vi.mocked(api);
const item = (o: Partial<api.TrashItem> = {}): api.TrashItem =>
    ({ id: 'i1', path: 'docs/notes.md', name: 'notes.md', isDir: false, deletedAt: '2026-01-02T03:04:05Z', ...o });

/** P4: TrashPanel gets the widget's in-app dialogs; the host sits in a relative box like FileExplorer's root. */
function Harness({ onClose = vi.fn(), onRestored = vi.fn() }: { onClose?: () => void; onRestored?: (p: string) => void }) {
    const d = useFileDialogs();
    return <div style={{ position: 'relative' }}><TrashPanel onClose={onClose} onRestored={onRestored} dialogs={d} />{d.host}</div>;
}
const dialog = () => screen.findByRole('dialog');

const setup = async (items = [item()]) => {
    m.listTrash.mockResolvedValue(items);
    const onRestored = vi.fn(); const onClose = vi.fn();
    render(<Harness onClose={onClose} onRestored={onRestored} />);
    if (items.length) await screen.findByText(items[0].name); else await screen.findByText('Trash is empty');
    return { onRestored, onClose };
};

let prompt: ReturnType<typeof vi.spyOn>, confirm: ReturnType<typeof vi.spyOn>, alertSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    vi.clearAllMocks();
    prompt = vi.spyOn(window, 'prompt'); confirm = vi.spyOn(window, 'confirm'); alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
    // P4: the panel must never reach the native dialogs.
    expect(prompt).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled(); expect(alertSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
});

describe('TrashPanel', () => {
    it('renders rows with folder, time and count; root fallback; unknown time', async () => {
        await setup([item(), item({ id: 'i2', path: 'top.txt', name: 'top.txt', deletedAt: null })]);
        expect(screen.getByText('2 items')).toBeTruthy();
        expect(screen.getByText(new RegExp(`^docs · ${new Date('2026-01-02T03:04:05Z').toLocaleString()}`))).toBeTruthy();
        expect(screen.getByText('root · unknown')).toBeTruthy();
    });

    it('shows empty state and disables Empty trash', async () => {
        await setup([]);
        expect((screen.getByText('Empty trash') as HTMLButtonElement).disabled).toBe(true);
    });

    it('shows an error when the list fails', async () => {
        m.listTrash.mockRejectedValue(new Error('boom'));
        render(<Harness />);
        expect((await screen.findByRole('alert')).textContent).toContain('boom');
    });

    it('close button calls onClose', async () => {
        const { onClose } = await setup();
        fireEvent.click(screen.getByLabelText('Close trash'));
        expect(onClose).toHaveBeenCalled();
    });

    it('restore success calls onRestored and reloads', async () => {
        const { onRestored } = await setup();
        m.restoreFromTrash.mockResolvedValue({ path: 'docs/notes.md' });
        fireEvent.click(screen.getByLabelText('Restore notes.md'));
        await waitFor(() => expect(onRestored).toHaveBeenCalledWith('docs/notes.md'));
        expect(m.restoreFromTrash).toHaveBeenCalledWith('i1', undefined);
        await waitFor(() => expect(m.listTrash).toHaveBeenCalledTimes(2));
    });

    it('restore 409 prompts (in-widget) and retries with "as", keeping the extension', async () => {
        const { onRestored } = await setup();
        m.restoreFromTrash.mockRejectedValueOnce(new api.ApiError('x', 409, 'DEST_EXISTS')).mockResolvedValueOnce({ path: 'docs/notes (restored).md' });
        fireEvent.click(screen.getByLabelText('Restore notes.md'));
        const d = await dialog();
        expect(d).toHaveAccessibleDescription('"docs/notes.md" already exists. Restore as:');
        expect((within(d).getByRole('textbox') as HTMLInputElement).value).toBe('docs/notes (restored).md');
        fireEvent.click(within(d).getByRole('button', { name: 'Restore' }));
        await waitFor(() => expect(m.restoreFromTrash).toHaveBeenLastCalledWith('i1', 'docs/notes (restored).md'));
        await waitFor(() => expect(onRestored).toHaveBeenCalledWith('docs/notes (restored).md'));
    });

    it('cancelling the prompt makes no second call', async () => {
        await setup();
        m.restoreFromTrash.mockRejectedValue(new api.ApiError('x', 409));
        fireEvent.click(screen.getByLabelText('Restore notes.md'));
        fireEvent.click(within(await dialog()).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect((screen.getByLabelText('Restore notes.md') as HTMLButtonElement).disabled).toBe(false));
        expect(m.restoreFromTrash).toHaveBeenCalledTimes(1);
    });

    it('a second 409 shows an error toast and stops', async () => {
        const { onRestored } = await setup();
        m.restoreFromTrash.mockRejectedValue(new api.ApiError('x', 409));
        fireEvent.click(screen.getByLabelText('Restore notes.md'));
        const d = await dialog();
        fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'other.md' } });
        fireEvent.click(within(d).getByRole('button', { name: 'Restore' }));
        expect((await screen.findByRole('alert')).textContent).toContain('"other.md" already exists too');
        expect(m.restoreFromTrash).toHaveBeenCalledTimes(2);
        expect(onRestored).not.toHaveBeenCalled();
    });

    it('non-409 restore error shows its message as an error toast and opens no prompt', async () => {
        await setup();
        m.restoreFromTrash.mockRejectedValue(new Error('disk full'));
        fireEvent.click(screen.getByLabelText('Restore notes.md'));
        expect((await screen.findByRole('alert')).textContent).toContain('disk full');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('delete forever: confirm yes deletes and reloads', async () => {
        await setup();
        m.deleteFromTrash.mockResolvedValue();
        fireEvent.click(screen.getByLabelText('Delete notes.md forever'));
        const d = await dialog();
        expect(d).toHaveAccessibleDescription('Permanently delete "notes.md"? This cannot be undone.');
        expect(d.getAttribute('data-danger')).toBe('true');
        fireEvent.click(within(d).getByRole('button', { name: 'Delete forever' }));
        await waitFor(() => expect(m.deleteFromTrash).toHaveBeenCalledWith('i1'));
        await waitFor(() => expect(m.listTrash).toHaveBeenCalledTimes(2));
    });

    it('delete forever: Cancel does nothing', async () => {
        await setup();
        fireEvent.click(screen.getByLabelText('Delete notes.md forever'));
        fireEvent.click(within(await dialog()).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(m.deleteFromTrash).not.toHaveBeenCalled();
    });

    it('empty trash is gated on typing exactly EMPTY (trimmed, case-sensitive)', async () => {
        await setup();
        m.emptyTrash.mockResolvedValue({ removed: 1 });
        fireEvent.click(screen.getByText('Empty trash'));
        const d = await dialog();
        expect(d).toHaveAccessibleDescription('Permanently delete 1 item(s). This cannot be undone.');
        const go = within(d).getByRole('button', { name: 'Empty trash' }) as HTMLButtonElement;
        expect(go.disabled).toBe(true);
        fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'empty' } });
        expect(go.disabled).toBe(true);
        fireEvent.click(go);
        expect(m.emptyTrash).not.toHaveBeenCalled();
        fireEvent.change(within(d).getByRole('textbox'), { target: { value: ' EMPTY ' } });
        expect(go.disabled).toBe(false);
        fireEvent.click(go);
        await waitFor(() => expect(m.emptyTrash).toHaveBeenCalledTimes(1));
    });

    it('ignores a second click while an action is in flight and disables buttons', async () => {
        await setup();
        let done!: (v: { path: string }) => void;
        m.restoreFromTrash.mockReturnValue(new Promise((r) => { done = r; }));
        const b = screen.getByLabelText('Restore notes.md') as HTMLButtonElement;
        fireEvent.click(b); fireEvent.click(b);
        await waitFor(() => expect(b.disabled).toBe(true));
        expect((screen.getByLabelText('Delete notes.md forever') as HTMLButtonElement).disabled).toBe(true);
        expect(m.restoreFromTrash).toHaveBeenCalledTimes(1);
        done({ path: 'docs/notes.md' });
        await waitFor(() => expect(b.disabled).toBe(false));
    });

    it('drops a stale list response (StrictMode double load; slow first resolves last)', async () => {
        let first!: (v: api.TrashItem[]) => void;
        m.listTrash.mockReturnValueOnce(new Promise((r) => { first = r; }));
        m.listTrash.mockResolvedValueOnce([item({ id: 'n', name: 'new.md', path: 'new.md' })]);
        render(<StrictMode><Harness /></StrictMode>);
        await screen.findByText('new.md');
        first([item({ name: 'old.md', path: 'old.md' })]);
        await new Promise((r) => setTimeout(r, 10));
        expect(screen.queryByText('old.md')).toBeNull();
        expect(screen.getByText('new.md')).toBeTruthy();
    });
});
