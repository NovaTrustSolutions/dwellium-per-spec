/**
 * Notepad never invents notes: when the notes service fails it shows an honest
 * "Notes unavailable" state (with Retry) instead of the old hard-coded demo notes.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Notepad from '../components/Notepad/Notepad';

vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({ hierarchy: [] }),
}));

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); });

describe('Notepad notes loading', () => {
    it('network failure → "Notes unavailable", and no demo notes', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        render(<Notepad />);
        expect(await screen.findByRole('status')).toHaveTextContent('Notes unavailable');
        expect(screen.queryByText('Meeting Notes — Q1 Review')).toBeNull();
        expect(screen.queryByText('ARA Personality Spec')).toBeNull();
    });

    it('a 500 or success:false response is also "unavailable" (not silently empty)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ success: false, error: 'boom' }, 500)));
        render(<Notepad />);
        expect(await screen.findByRole('status')).toHaveTextContent('Notes unavailable');
    });

    it('Retry after a failure loads the real notes and clears the state', async () => {
        let fail = true;
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (fail) throw new TypeError('Failed to fetch');
            return String(url).includes('/api/files/notes')
                ? json({ success: true, data: [{ id: 'n1', title: 'Real note', content: 'x', created_at: '', updated_at: '' }] })
                : json({ success: true, data: [] });
        }));
        render(<Notepad />);
        const retry = await screen.findByRole('button', { name: 'Retry' });
        fail = false;
        fireEvent.click(retry);
        await waitFor(() => expect(screen.getByText('Real note')).toBeInTheDocument());
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('a save the server refuses shows "Not saved", never "Saved"', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            if (init?.method === 'POST') return json({ success: false, error: 'Note not found' }, 404);
            return String(url).includes('/api/files/notes')
                ? json({ success: true, data: [{ id: 'n1', title: 'Other user note', content: 'x', created_at: '', updated_at: '' }] })
                : json({ success: true, data: [] });
        }));
        render(<Notepad />);
        fireEvent.click(await screen.findByText('Other user note'));
        const title = await screen.findByDisplayValue('Other user note');
        fireEvent.change(title, { target: { value: 'Edited title' } });
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Not saved'), { timeout: 4000 });
        expect(screen.queryByText('Saved')).toBeNull();
    }, 8000);
});
