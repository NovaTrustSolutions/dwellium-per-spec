import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TrashPanel } from '../components/FileExplorer/TrashPanel';
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

const setup = async (items = [item()]) => {
    m.listTrash.mockResolvedValue(items);
    const onRestored = vi.fn(); const onClose = vi.fn();
    render(<TrashPanel onClose={onClose} onRestored={onRestored} />);
    if (items.length) await screen.findByText(items[0].name); else await screen.findByText('Trash is empty');
    return { onRestored, onClose };
};

let prompt: ReturnType<typeof vi.spyOn>, confirm: ReturnType<typeof vi.spyOn>, alertSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    vi.clearAllMocks();
    prompt = vi.spyOn(window, 'prompt'); confirm = vi.spyOn(window, 'confirm'); alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

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
        render(<TrashPanel onClose={vi.fn()} onRestored={vi.fn()} />);
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

    it('restore 409 prompts and retries with "as", keeping the extension', async () => {
        const { onRestored } = await setup();
        m.restoreFromTrash.mockRejectedValueOnce(new api.ApiError('x', 409, 'DEST_EXISTS')).mockResolvedValueOnce({ path: 'docs/notes (restored).md' });
        prompt.mockReturnValue('docs/notes (restored).md');
        fireEvent.click(screen.getByLabelText('Restore notes.md'));
        await waitFor(() => expect(m.restoreFromTrash).toHaveBeenLastCalledWith('i1', 'docs/notes (restored).md'));
        expect(prompt).toHaveBeenCalledWith('"docs/notes.md" already exists. Restore as:', 'docs/notes (restored).md');
        await waitFor(() => expect(onRestored).toHaveBeenCalledWith('docs/notes (restored).md'));
    });

    it('cancelling the prompt makes no second call', async () => {
        await setup();
        m.restoreFromTrash.mockRejectedValue(new api.ApiError('x', 409));
        prompt.mockReturnValue(null);
        fireEvent.click(screen.getByLabelText('Restore notes.md'));
        await waitFor(() => expect(prompt).toHaveBeenCalled());
        await waitFor(() => expect((screen.getByLabelText('Restore notes.md') as HTMLButtonElement).disabled).toBe(false));
        expect(m.restoreFromTrash).toHaveBeenCalledTimes(1);
    });

    it('a second 409 alerts and stops', async () => {
        const { onRestored } = await setup();
        m.restoreFromTrash.mockRejectedValue(new api.ApiError('x', 409));
        prompt.mockReturnValue('other.md');
        fireEvent.click(screen.getByLabelText('Restore notes.md'));
        await waitFor(() => expect(alertSpy).toHaveBeenCalled());
        expect(m.restoreFromTrash).toHaveBeenCalledTimes(2);
        expect(prompt).toHaveBeenCalledTimes(1);
        expect(onRestored).not.toHaveBeenCalled();
    });

    it('non-409 restore error alerts its message', async () => {
        await setup();
        m.restoreFromTrash.mockRejectedValue(new Error('disk full'));
        fireEvent.click(screen.getByLabelText('Restore notes.md'));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('disk full'));
        expect(prompt).not.toHaveBeenCalled();
    });

    it('delete forever: confirm yes deletes and reloads', async () => {
        await setup();
        confirm.mockReturnValue(true); m.deleteFromTrash.mockResolvedValue();
        fireEvent.click(screen.getByLabelText('Delete notes.md forever'));
        await waitFor(() => expect(m.deleteFromTrash).toHaveBeenCalledWith('i1'));
        expect(confirm).toHaveBeenCalledWith('Permanently delete "notes.md"? This cannot be undone.');
        await waitFor(() => expect(m.listTrash).toHaveBeenCalledTimes(2));
    });

    it('delete forever: confirm no does nothing', async () => {
        await setup();
        confirm.mockReturnValue(false);
        fireEvent.click(screen.getByLabelText('Delete notes.md forever'));
        await waitFor(() => expect(confirm).toHaveBeenCalled());
        expect(m.deleteFromTrash).not.toHaveBeenCalled();
    });

    it('empty trash requires exact EMPTY', async () => {
        await setup();
        m.emptyTrash.mockResolvedValue({ removed: 1 });
        prompt.mockReturnValueOnce('empty');
        fireEvent.click(screen.getByText('Empty trash'));
        await waitFor(() => expect(prompt).toHaveBeenCalledWith('Type EMPTY to permanently delete 1 item(s). This cannot be undone.'));
        await waitFor(() => expect((screen.getByText('Empty trash') as HTMLButtonElement).disabled).toBe(false));
        expect(m.emptyTrash).not.toHaveBeenCalled();
        prompt.mockReturnValueOnce(' EMPTY ');
        fireEvent.click(screen.getByText('Empty trash'));
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
        render(<StrictMode><TrashPanel onClose={vi.fn()} onRestored={vi.fn()} /></StrictMode>);
        await screen.findByText('new.md');
        first([item({ name: 'old.md', path: 'old.md' })]);
        await new Promise((r) => setTimeout(r, 10));
        expect(screen.queryByText('old.md')).toBeNull();
        expect(screen.getByText('new.md')).toBeTruthy();
    });
});
