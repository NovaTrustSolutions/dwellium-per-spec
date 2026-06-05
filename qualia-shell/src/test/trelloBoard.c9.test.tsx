import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrelloBoard from '../components/TrelloBoard/TrelloBoard';

function jsonResponse(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => data,
        headers: new Headers(),
    } as Response;
}

function mockTrelloFetch() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/trello/boards')) {
            return jsonResponse({ success: true, data: [{ id: 'board-1', name: 'Ops Board', url: 'https://trello.test/b/1' }] });
        }
        if (url.endsWith('/api/trello/boards/board-1/lists')) {
            return jsonResponse({ success: true, data: [{ id: 'list-1', idBoard: 'board-1', name: 'Incoming' }] });
        }
        if (url.endsWith('/api/trello/lists/list-1/cards')) {
            return jsonResponse({ success: true, data: [] });
        }
        if (url.endsWith('/api/trello/cards') && init?.method === 'POST') {
            const body = JSON.parse(String(init.body));
            return jsonResponse({
                success: true,
                data: { id: 'card-1', idList: body.listId, name: body.name, desc: body.desc, url: 'https://trello.test/c/1', pos: 1 },
            });
        }
        return jsonResponse({ success: false, error: `Unhandled ${url}` });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    return fetchMock;
}

function setC9Flags({ suggest, blast }: { suggest: boolean; blast: boolean }) {
    const w = window as unknown as {
        __DWELLIUM_C9_SUGGEST_ENABLED__?: boolean;
        __DWELLIUM_C9_BLAST_ENABLED__?: boolean;
    };
    w.__DWELLIUM_C9_SUGGEST_ENABLED__ = suggest;
    w.__DWELLIUM_C9_BLAST_ENABLED__ = blast;
}

async function openAddForm() {
    render(<TrelloBoard />);
    await screen.findByText('Incoming');
    fireEvent.click(screen.getByText('+ Add a card'));
}

describe('TrelloBoard C-9 card creation', () => {
    beforeEach(() => {
        mockTrelloFetch();
        setC9Flags({ suggest: false, blast: false });
    });

    it('accepts a suggested card draft and persists B.L.A.S.T. details in the Trello payload', async () => {
        const fetchMock = mockTrelloFetch();
        setC9Flags({ suggest: true, blast: true });

        await openAddForm();

        fireEvent.change(screen.getByPlaceholderText('Enter card title…'), {
            target: { value: 'Ask vendor to send certificate so that insurance records stay current' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Suggest with AI' }));

        await waitFor(() => {
            expect(screen.getByLabelText('B.L.A.S.T. Benefit')).toHaveValue('insurance records stay current');
        });

        fireEvent.change(screen.getByLabelText('B.L.A.S.T. Assignee'), { target: { value: 'Lisa' } });
        fireEvent.change(screen.getByLabelText('B.L.A.S.T. Time'), { target: { value: '2026-06-15' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        await waitFor(() => {
            expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
        });

        const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
        expect(createCall).toBeTruthy();
        const payload = JSON.parse(String(createCall![1]?.body));
        expect(payload.name).toBe('Ask vendor to send certificate so that insurance records stay current');
        expect(payload.desc).toContain('B.L.A.S.T.');
        expect(payload.desc).toContain('Benefit: insurance records stay current');
        expect(payload.desc).toContain('Assignee: Lisa');
        expect(payload.desc).toContain('Time: 2026-06-15');
    });

    it('blocks title-only card creation when the B.L.A.S.T. gate is enabled', async () => {
        const fetchMock = mockTrelloFetch();
        setC9Flags({ suggest: false, blast: true });

        await openAddForm();

        fireEvent.change(screen.getByPlaceholderText('Enter card title…'), { target: { value: 'Too vague' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        expect(await screen.findByText('Benefit is required.')).toBeInTheDocument();
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    });
});
