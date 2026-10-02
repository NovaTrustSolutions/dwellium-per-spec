import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import TrelloCardModal from '../components/StrataDashboard/modules/TrelloCardModal';
import { TRELLO_A11Y } from '../components/TrelloBoard/a11yContract';

const CARD_ID = 'a1b2c3d4e5f60718293a4b5c';

function json(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function workitem(over: Record<string, unknown> = {}, metadata: Record<string, unknown> = { trelloCardId: CARD_ID }) {
    return {
        id: 'w1', title: 'Fix the boiler', description: 'Work item description', status: 'open',
        priority: 'high', domain: 'maintenance', type: 'task', tags: [], metadata, ...over,
    } as any;
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(card: () => Response, activity: () => Response = () => json({ success: true, data: [] })) {
    fetchMock = vi.fn(async (url: string) => (String(url).endsWith('/activity') ? activity() : card()));
    vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => stubFetch(() => json({ success: true, data: { id: CARD_ID, name: 'x', desc: 'Trello description' } })));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('TrelloCardModal', () => {
    it('is a named modal dialog with focus inside it', async () => {
        render(<TrelloCardModal workitem={workitem()} onClose={() => {}} />);
        const dialog = await screen.findByRole('dialog', { name: 'Fix the boiler' });
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.contains(document.activeElement)).toBe(true);
        expect(screen.getByRole('button', { name: TRELLO_A11Y.closeDetail })).toBeTruthy();
        await screen.findByText('Trello description');
    });

    it('closes on Escape', async () => {
        const onClose = vi.fn();
        render(<TrelloCardModal workitem={workitem()} onClose={onClose} />);
        await screen.findByText('Trello description');
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on a click outside the panel, not inside it', async () => {
        const onClose = vi.fn();
        render(<TrelloCardModal workitem={workitem()} onClose={onClose} />);
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(dialog);
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(dialog.parentElement as HTMLElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('wraps Tab from the last control back to the first', async () => {
        render(<TrelloCardModal workitem={workitem({}, { trelloCardId: CARD_ID, trelloUrl: 'https://trello.com/c/x' })} onClose={() => {}} />);
        await screen.findByText('Trello description');
        const link = screen.getByRole('link', { name: /Trello/ });
        const close = screen.getByRole('button', { name: TRELLO_A11Y.closeDetail });
        close.focus();
        fireEvent.keyDown(window, { key: 'Tab' });
        expect(document.activeElement).toBe(link);
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(close);
    });

    it('shows an alert and keeps the work item description when the card fails to load', async () => {
        stubFetch(() => json({ success: false, code: 'TIMEOUT', error: 'Trello timed out' }, 504));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        render(<TrelloCardModal workitem={workitem()} onClose={() => {}} />);
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain("Couldn't load this card from Trello");
        expect(screen.getByText('Work item description')).toBeTruthy();
    });

    it('renders a hostile description as text, not markup', async () => {
        stubFetch(() => json({ success: true, data: { id: CARD_ID, name: 'x', desc: '<script>alert(1)</script>' } }));
        const { container } = render(<TrelloCardModal workitem={workitem()} onClose={() => {}} />);
        await screen.findByText('<script>alert(1)</script>');
        expect(container.querySelector('script')).toBeNull();
        expect(document.querySelector('script')).toBeNull();
    });

    it('makes no request for an invalid card id', async () => {
        render(<TrelloCardModal workitem={workitem({}, { trelloCardId: '../members/me' })} onClose={() => {}} />);
        await screen.findByText('Work item description');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('lists the card members', async () => {
        stubFetch(() => json({ success: true, data: { id: CARD_ID, name: 'x', members: [{ id: '1', fullName: 'Ada Lovelace' }, { id: '2', fullName: 'Alan Turing' }] } }));
        render(<TrelloCardModal workitem={workitem()} onClose={() => {}} />);
        await waitFor(() => expect(screen.getByText('Members: Ada Lovelace, Alan Turing')).toBeTruthy());
    });
});
