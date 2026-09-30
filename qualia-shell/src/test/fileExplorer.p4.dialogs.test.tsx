import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFileDialogs, type ConfirmOptions, type PromptOptions } from '../components/FileExplorer/FileDialogs';

type Api = ReturnType<typeof useFileDialogs>;
let api: Api;
const Harness = () => {
    api = useFileDialogs();
    return <div style={{ position: 'relative' }}><button>opener</button>{api.host}</div>;
};
const C: ConfirmOptions = { title: 'Delete it', message: 'Sure?', confirmLabel: 'Delete' };
const P: PromptOptions = { title: 'Rename', defaultValue: 'old.md', confirmLabel: 'Save' };
const open = <T,>(f: () => Promise<T>) => { let r!: ReturnType<typeof result<T>>; act(() => { r = result(f()); }); return r; };
const user = () => userEvent.setup();
const result = <T,>(p: Promise<T>) => { const box: { v?: T; done: boolean } = { done: false }; void p.then((v) => { box.v = v; box.done = true; }); return box; };

describe('useFileDialogs', () => {
    let unmount: () => void;
    beforeEach(() => { ({ unmount } = render(<Harness />)); });

    it('confirm resolves true via button, false via Cancel', async () => {
        const u = user();
        let r = open(() => api.confirm(C)); await screen.findByRole('dialog');
        await u.click(screen.getByRole('button', { name: 'Delete' }));
        await vi.waitFor(() => expect(r.v).toBe(true));
        r = open(() => api.confirm(C)); await screen.findByRole('dialog');
        await u.click(screen.getByRole('button', { name: 'Cancel' }));
        await vi.waitFor(() => expect(r.v).toBe(false));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('confirm: Esc cancels, Enter on the focused primary confirms, Enter on Cancel cancels', async () => {
        const u = user();
        let r = open(() => api.confirm(C)); await screen.findByRole('dialog');
        await u.keyboard('{Escape}'); await vi.waitFor(() => expect(r.v).toBe(false));
        r = open(() => api.confirm(C)); await screen.findByRole('dialog');
        await u.keyboard('{Enter}'); await vi.waitFor(() => expect(r.v).toBe(true));
        r = open(() => api.confirm(C)); await screen.findByRole('dialog');
        screen.getByRole('button', { name: 'Cancel' }).focus();
        await u.keyboard('{Enter}'); await vi.waitFor(() => expect(r.v).toBe(false));
    });

    it('dialog is modal, labelled and described; danger flag is exposed', async () => {
        open(() => api.confirm({ ...C, danger: true }));
        const d = await screen.findByRole('dialog', { name: 'Delete it' });
        expect(d).toHaveAttribute('aria-modal', 'true');
        expect(d).toHaveAccessibleDescription('Sure?');
        expect(d).toHaveAttribute('data-danger', 'true');
        await user().keyboard('{Escape}');
        open(() => api.confirm(C));
        expect(await screen.findByRole('dialog')).toHaveAttribute('data-danger', 'false');
    });

    it('prompt returns trimmed value, null on cancel, Enter in input submits', async () => {
        const u = user();
        let r = open(() => api.prompt(P)); const input = await screen.findByRole('textbox');
        expect(input).toHaveFocus(); expect(input).toHaveValue('old.md');
        await u.clear(input); await u.type(input, '  new.md  ');
        await u.click(screen.getByRole('button', { name: 'Save' }));
        await vi.waitFor(() => expect(r.v).toBe('new.md'));
        r = open(() => api.prompt(P)); await screen.findByRole('textbox');
        await u.keyboard('{Enter}'); await vi.waitFor(() => expect(r.v).toBe('old.md'));
        r = open(() => api.prompt(P)); await screen.findByRole('textbox');
        await u.click(screen.getByRole('button', { name: 'Cancel' }));
        await vi.waitFor(() => expect(r.v).toBeNull());
    });

    it('requireText shows the text and gates Confirm (trimmed, exact)', async () => {
        const u = user();
        const r = open(() => api.confirm({ ...C, confirmLabel: 'Empty', requireText: 'EMPTY' }));
        const input = await screen.findByRole('textbox');
        expect(screen.getByText('EMPTY')).toBeInTheDocument();
        const go = screen.getByRole('button', { name: 'Empty' });
        expect(go).toBeDisabled();
        await u.type(input, 'EMPT'); expect(go).toBeDisabled();
        await u.keyboard('{Enter}'); expect(r.done).toBe(false);
        await u.type(input, 'y'); expect(go).toBeDisabled(); // "EMPTy" is case-sensitive
        await u.clear(input); await u.type(input, ' EMPTY ');
        expect(go).toBeEnabled();
        await u.keyboard('{Enter}'); await vi.waitFor(() => expect(r.v).toBe(true));
    });

    it('focus moves into the dialog and returns to the opener', async () => {
        const u = user();
        const opener = screen.getByRole('button', { name: 'opener' }); opener.focus();
        const r = open(() => api.confirm(C)); await screen.findByRole('dialog');
        expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
        await u.keyboard('{Escape}'); await vi.waitFor(() => expect(r.done).toBe(true));
        expect(opener).toHaveFocus();
    });

    it('Tab and Shift+Tab cycle inside the dialog', async () => {
        const u = user();
        screen.getByRole('button', { name: 'opener' }).focus();
        open(() => api.prompt(P)); const input = await screen.findByRole('textbox');
        const cancel = screen.getByRole('button', { name: 'Cancel' }); const save = screen.getByRole('button', { name: 'Save' });
        await u.tab(); expect(cancel).toHaveFocus();
        await u.tab(); expect(save).toHaveFocus();
        await u.tab(); expect(input).toHaveFocus();
        await u.tab({ shift: true }); expect(save).toHaveFocus();
    });

    it('a second dialog queues until the first closes', async () => {
        const u = user();
        const a = open(() => api.confirm({ ...C, title: 'First' })); const b = open(() => api.prompt({ ...P, title: 'Second' }));
        await screen.findByRole('dialog', { name: 'First' });
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(b.done).toBe(false);
        await u.click(screen.getByRole('button', { name: 'Cancel' }));
        await vi.waitFor(() => expect(a.v).toBe(false));
        await screen.findByRole('dialog', { name: 'Second' });
        expect(screen.getByRole('textbox')).toHaveFocus();
        await u.keyboard('{Escape}'); await vi.waitFor(() => expect(b.v).toBeNull());
    });

    it('unmount resolves pending and queued dialogs as cancel without warnings', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const a = open(() => api.confirm(C)); const b = open(() => api.prompt(P));
        await screen.findByRole('dialog');
        unmount();
        await vi.waitFor(() => { expect(a.v).toBe(false); expect(b.v).toBeNull(); });
        expect(err).not.toHaveBeenCalled();
        err.mockRestore();
    });
});

describe('notify', () => {
    beforeEach(() => { vi.useFakeTimers(); render(<Harness />); });
    afterEach(() => { vi.useRealTimers(); });

    it('uses status/alert roles, stacks max 3 newest last, dismisses, auto-hides at 4s', () => {
        act(() => { api.notify('one'); api.notify('two', 'error'); });
        expect(screen.getByRole('status')).toHaveTextContent('one');
        expect(screen.getByRole('alert')).toHaveTextContent('two');
        act(() => { api.notify('three'); api.notify('four'); });
        const texts = screen.getAllByText(/one|two|three|four/).map((n) => n.textContent);
        expect(texts).toEqual(['two', 'three', 'four']);
        fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);
        expect(screen.queryByText('two')).toBeNull();
        act(() => { vi.advanceTimersByTime(3900); });
        expect(screen.getByText('three')).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(200); });
        expect(screen.queryByText('three')).toBeNull();
        expect(screen.queryByText('four')).toBeNull();
    });
});
