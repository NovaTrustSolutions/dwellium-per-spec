// Plan 078 Phase 1 done-criterion: the audit probe, ported to the one-call board load.
// Each "BUG" test asserts the CORRECT behaviour; on origin/main (fe281de) they fail and the two controls pass.
// Constraints these tests impose on the component are listed in plans/078-trello-board-widget.md, Phase 1.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrelloBoard from '../components/TrelloBoard/TrelloBoard';
import { TRELLO_A11Y } from '../components/TrelloBoard/a11yContract';

type Override = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

function res(data: unknown, status = 200): Response {
    return { ok: status < 400, status, json: async () => data, headers: new Headers() } as Response;
}
const fail = (code: string, error: string, status: number) => res({ success: false, code, error }, status);

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

const BOARDS = [
    { id: 'board-1', name: 'Ops', url: 'https://trello.test/b/1' },
    { id: 'board-2', name: 'Other', url: 'https://trello.test/b/2' },
];
const FULL: Record<string, unknown> = {
    'board-1': {
        board: BOARDS[0],
        lists: [
            { id: 'list-1', idBoard: 'board-1', name: 'Incoming' },
            { id: 'list-2', idBoard: 'board-1', name: 'Done' },
        ],
        cards: [
            { id: 'card-1', idList: 'list-1', name: 'Fix sink', url: 'u', pos: 1 },
            { id: 'card-2', idList: 'list-1', name: 'Call vendor', url: 'u', pos: 2 },
        ],
        truncated: false,
    },
    'board-2': {
        board: BOARDS[1],
        lists: [{ id: 'list-9', idBoard: 'board-2', name: 'Other list' }],
        cards: [],
        truncated: false,
    },
};

function mockFetch(override?: Override) {
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const o = await override?.(url, init);
        if (o !== undefined) return o;
        const method = init?.method ?? 'GET';
        let m: RegExpMatchArray | null;
        if (url.endsWith('/api/trello/boards')) return res({ success: true, data: BOARDS });
        if ((m = url.match(/\/boards\/([^/]+)\/full$/))) {
            return FULL[m[1]] ? res({ success: true, data: FULL[m[1]] }) : fail('NOT_FOUND', 'That board was not found.', 404);
        }
        if ((m = url.match(/\/cards\/([^/]+)\/move$/)) && method === 'PUT') return res({ success: true, data: { id: m[1] } });
        if (url.match(/\/cards\/([^/]+)\/activity$/)) return res({ success: true, data: [] });
        if ((m = url.match(/\/cards\/([^/]+)$/)) && method === 'GET') {
            return res({ success: true, data: { id: m[1], idList: 'list-1', name: `Detail of ${m[1]}`, desc: '', url: 'u', pos: 1 } });
        }
        if (url.endsWith('/api/trello/cards') && method === 'POST') {
            const body = JSON.parse(String(init?.body));
            return res({ success: true, data: { id: 'card-new', idList: body.listId, name: body.name, desc: body.desc, url: 'u', pos: 99 } }, 201);
        }
        // Anything else — including the old per-list /lists/:id/cards fan-out — is a failure.
        return fail('UPSTREAM', `Unhandled ${method} ${url}`, 500);
    });
    globalThis.fetch = fn as typeof fetch;
    return fn;
}

const dt = { dropEffect: '', effectAllowed: '', setData: () => undefined, getData: () => '' };
const columnOf = (listName: string) => screen.getByText(listName).closest(`.${TRELLO_A11Y.columnClass}`) as HTMLElement;
const cardEl = (title: string) => screen.getByText(title).closest(`.${TRELLO_A11Y.cardClass}`) as HTMLElement;

function drag(title: string, toList: string) {
    const card = cardEl(title);
    const col = columnOf(toList);
    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.dragEnter(col, { dataTransfer: dt });
    fireEvent.dragOver(col, { dataTransfer: dt });
    fireEvent.drop(col, { dataTransfer: dt });
    fireEvent.dragEnd(card, { dataTransfer: dt });
}

async function renderBoard() {
    render(<TrelloBoard />);
    await screen.findByText('Incoming');
    await screen.findByText('Fix sink');
}

const calls = (fn: ReturnType<typeof mockFetch>, test: (url: string, init?: RequestInit) => boolean) =>
    fn.mock.calls.filter(([u, init]) => test(String(u), init)).length;

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });

describe('Trello Board — plan 078 audit (ported to /full)', () => {
    beforeEach(() => {
        const w = window as unknown as Record<string, unknown>;
        delete w.__DWELLIUM_C9_SUGGEST_ENABLED__;
        delete w.__DWELLIUM_C9_BLAST_ENABLED__;
    });

    it('control: a successful drag sends PUT /move with the target list and shows the card there', async () => {
        const fetchMock = mockFetch();
        await renderBoard();
        drag('Fix sink', 'Done');
        await waitFor(() => expect(within(columnOf('Done')).queryByText('Fix sink')).not.toBeNull());
        const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
        expect(String(put![0])).toMatch(/\/cards\/card-1\/move$/);
        expect(JSON.parse(String(put![1]?.body))).toEqual({ listId: 'list-2' });
    });

    it('control: clicking a card (no drag before) opens its detail', async () => {
        mockFetch();
        await renderBoard();
        fireEvent.click(cardEl('Call vendor'));
        expect(await screen.findByText('Detail of card-2')).toBeInTheDocument();
    });

    it('FE12: a board loads with one /full call and no per-list fan-out', async () => {
        const fetchMock = mockFetch();
        await renderBoard();
        expect(calls(fetchMock, u => /\/boards\/board-1\/full$/.test(u))).toBe(1);
        expect(calls(fetchMock, u => /\/lists\//.test(u))).toBe(0);
    });

    it('FE1: a move the backend rejects (HTTP 500) is rolled back and reported', async () => {
        const fetchMock = mockFetch((_u, init) => init?.method === 'PUT' ? fail('RATE_LIMITED', 'Trello is rate-limiting requests — try again in a few seconds.', 429) : undefined);
        await renderBoard();
        drag('Fix sink', 'Done');
        await waitFor(() => expect(calls(fetchMock, (_u, i) => i?.method === 'PUT')).toBe(1));
        await waitFor(() => expect(within(columnOf('Incoming')).queryByText('Fix sink')).not.toBeNull());
        expect((await screen.findAllByText(/rate-limiting/i)).length).toBeGreaterThan(0);
    });

    it('FE4: the first card click after a drag still opens the detail', async () => {
        const fetchMock = mockFetch();
        await renderBoard();
        drag('Fix sink', 'Done');
        await waitFor(() => expect(calls(fetchMock, (_u, i) => i?.method === 'PUT')).toBe(1));
        fireEvent.click(cardEl('Call vendor'));
        await waitFor(() => expect(calls(fetchMock, u => u.endsWith('/cards/card-2'))).toBe(1));
    });

    it('FE6: closing the detail while it loads keeps it closed when the response arrives', async () => {
        const d = deferred<Response>();
        mockFetch((url, init) => (url.endsWith('/cards/card-2') && (init?.method ?? 'GET') === 'GET' ? d.promise : undefined));
        await renderBoard();
        fireEvent.click(cardEl('Call vendor'));
        await screen.findByText(TRELLO_A11Y.loadingCard);
        fireEvent.click(document.querySelector(`.${TRELLO_A11Y.detailOverlayClass}`) as HTMLElement);
        await act(async () => {
            d.resolve(res({ success: true, data: { id: 'card-2', idList: 'list-1', name: 'Detail of card-2', desc: '', url: 'u', pos: 1 } }));
            await new Promise(r => setTimeout(r, 30));
        });
        expect(screen.queryByText('Detail of card-2')).toBeNull();
        expect(screen.queryByText(TRELLO_A11Y.loadingCard)).toBeNull();
    });

    it('FE5: a slow response for the previous board does not overwrite the board now selected', async () => {
        const d = deferred<Response>();
        mockFetch(url => (url.endsWith('/boards/board-1/full') ? d.promise : undefined));
        render(<TrelloBoard />);
        const select = await screen.findByRole('combobox');
        fireEvent.change(select, { target: { value: 'board-2' } });
        await screen.findByText('Other list');
        await act(async () => {
            d.resolve(res({ success: true, data: FULL['board-1'] }));
            await new Promise(r => setTimeout(r, 30));
        });
        expect(screen.queryByText('Other list')).not.toBeNull();
        expect(screen.queryByText('Incoming')).toBeNull();
    });

    it('FE7/FE13: a failed board load shows the error and Retry refetches instead of reloading the page', async () => {
        let failures = 1;
        const fetchMock = mockFetch(url => {
            if (url.endsWith('/boards/board-1/full') && failures-- > 0) return fail('TIMEOUT', 'Trello took too long to answer — try again.', 504);
            return undefined;
        });
        render(<TrelloBoard />);
        expect((await screen.findAllByText(/took too long/i)).length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: TRELLO_A11Y.retry }));
        await screen.findByText('Incoming');
        expect(calls(fetchMock, u => /\/boards\/board-1\/full$/.test(u))).toBe(2);
    });

    it('FE8: a rejected card creation shows an error and keeps the typed title', async () => {
        mockFetch((_u, init) => (init?.method === 'POST' ? fail('UPSTREAM', 'Trello could not create the card.', 502) : undefined));
        await renderBoard();
        fireEvent.click(within(columnOf('Incoming')).getByText(TRELLO_A11Y.addCardOpen));
        const input = screen.getByPlaceholderText('Enter card title…');
        fireEvent.change(input, { target: { value: 'New card' } });
        fireEvent.click(screen.getByRole('button', { name: TRELLO_A11Y.addCard }));
        expect((await screen.findAllByText(/could not create/i)).length).toBeGreaterThan(0);
        expect((screen.getByPlaceholderText('Enter card title…') as HTMLInputElement).value).toBe('New card');
    });

    it('FE9: pressing Enter twice creates one card, not two', async () => {
        const d = deferred<Response>();
        const fetchMock = mockFetch((_u, init) => (init?.method === 'POST' ? d.promise : undefined));
        await renderBoard();
        fireEvent.click(within(columnOf('Incoming')).getByText(TRELLO_A11Y.addCardOpen));
        const input = screen.getByPlaceholderText('Enter card title…');
        fireEvent.change(input, { target: { value: 'New card' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.keyDown(input, { key: 'Enter' });
        await settle();
        expect(calls(fetchMock, (_u, i) => i?.method === 'POST')).toBe(1);
    });

    it('FE2: a card is a button named after its title', async () => {
        mockFetch();
        await renderBoard();
        const card = cardEl('Fix sink');
        expect(card.tagName).toBe('BUTTON');
        expect(within(columnOf('Incoming')).getByRole('button', { name: /Fix sink/ })).toBe(card);
    });

    it('FE3: the card detail is a dialog with a named close button; Escape closes it', async () => {
        mockFetch();
        await renderBoard();
        fireEvent.click(cardEl('Call vendor'));
        await screen.findByText('Detail of card-2');
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: TRELLO_A11Y.closeDetail })).toBeInTheDocument();
        expect(dialog.contains(document.activeElement)).toBe(true);
        fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByText('Detail of card-2')).toBeNull());
    });

    it('FE2: the detail dialog offers a keyboard way to move the card', async () => {
        const fetchMock = mockFetch();
        await renderBoard();
        fireEvent.click(cardEl('Call vendor'));
        await screen.findByText('Detail of card-2');
        const move = within(screen.getByRole('dialog')).getByRole('combobox', { name: TRELLO_A11Y.moveTo });
        fireEvent.change(move, { target: { value: 'list-2' } });
        await waitFor(() => expect(calls(fetchMock, (u, i) => i?.method === 'PUT' && u.endsWith('/cards/card-2/move'))).toBe(1));
    });

    it('FE3: the board select has a name', async () => {
        mockFetch();
        await renderBoard();
        expect(screen.getByRole('combobox', { name: TRELLO_A11Y.boardSelect })).toBeInTheDocument();
    });

    it('FE16/BE2: the permission gate\'s 403 renders a no-access state, not a raw error', async () => {
        mockFetch(url => (url.endsWith('/api/trello/boards') ? res({ error: 'Insufficient permissions', requiredPermissions: ['widget:trello-board'] }, 403) : undefined));
        render(<TrelloBoard />);
        expect((await screen.findAllByText(/don't have access/i)).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Insufficient permissions/)).toBeNull();
    });

    it('BE3: NOT_CONFIGURED tells a non-admin to ask an administrator', async () => {
        mockFetch(url => (url.endsWith('/api/trello/boards') ? fail('NOT_CONFIGURED', 'Trello not configured — set TRELLO_API_KEY and TRELLO_TOKEN on the backend.', 503) : undefined));
        render(<TrelloBoard />);
        expect((await screen.findAllByText(/ask an administrator/i)).length).toBeGreaterThan(0);
    });
});
