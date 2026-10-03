import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthToken = vi.fn<() => string | null>();
vi.mock('../context/UserContext', () => ({ getAuthToken: () => getAuthToken() }));

import { TrelloApiError, describeTrelloError, trelloApi, trelloFetch } from '../components/TrelloBoard/trelloApi';

const fetchMock = vi.fn();

function reply(body: unknown, status = 200): Response {
    return { ok: status < 400, status, json: async () => body } as Response;
}
const unreadable = (status = 200): Response =>
    ({ ok: status < 400, status, json: async () => { throw new SyntaxError('Unexpected token <'); } }) as unknown as Response;

async function caught(p: Promise<unknown>): Promise<unknown> {
    try { await p; } catch (e) { return e; }
    throw new Error('expected rejection');
}

beforeEach(() => {
    fetchMock.mockReset();
    getAuthToken.mockReset().mockReturnValue(null);
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('trelloFetch success', () => {
    it('returns data and sends no Authorization header without a token', async () => {
        fetchMock.mockResolvedValue(reply({ success: true, data: [1, 2] }));
        await expect(trelloFetch('/boards')).resolves.toEqual([1, 2]);
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/trello\/boards$/);
        expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });

    it('sends Bearer token when getAuthToken returns one', async () => {
        getAuthToken.mockReturnValue('tok123');
        fetchMock.mockResolvedValue(reply({ success: true, data: {} }));
        await trelloFetch('/boards');
        expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer tok123');
    });
});

describe('trelloFetch errors', () => {
    it('503 NOT_CONFIGURED body -> TrelloApiError with code/status/message', async () => {
        fetchMock.mockResolvedValue(reply({ success: false, code: 'NOT_CONFIGURED', error: 'Trello is not set up.' }, 503));
        const err = await caught(trelloFetch('/boards'));
        expect(err).toBeInstanceOf(TrelloApiError);
        expect(err).toMatchObject({ code: 'NOT_CONFIGURED', status: 503, message: 'Trello is not set up.' });
    });

    it('403 permission-gate body -> FORBIDDEN', async () => {
        fetchMock.mockResolvedValue(reply({ error: 'Insufficient permissions', requiredPermissions: ['trello:read'] }, 403));
        expect(await caught(trelloFetch('/boards'))).toMatchObject({ code: 'FORBIDDEN', status: 403 });
    });

    it('401 without a code -> UNAUTHENTICATED', async () => {
        fetchMock.mockResolvedValue(reply({ error: 'nope' }, 401));
        expect(await caught(trelloFetch('/boards'))).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    });

    it('other non-OK without a code -> HTTP', async () => {
        fetchMock.mockResolvedValue(reply({}, 500));
        expect(await caught(trelloFetch('/boards'))).toMatchObject({ code: 'HTTP', status: 500 });
    });

    it('200 with non-JSON -> BAD_RESPONSE', async () => {
        fetchMock.mockResolvedValue(unreadable(200));
        expect(await caught(trelloFetch('/boards'))).toMatchObject({ code: 'BAD_RESPONSE', status: 200 });
    });

    it('200 with { ok: true } (no success flag) -> BAD_RESPONSE', async () => {
        fetchMock.mockResolvedValue(reply({ ok: true }));
        expect(await caught(trelloFetch('/boards'))).toMatchObject({ code: 'BAD_RESPONSE' });
    });

    it('fetch rejecting with TypeError -> NETWORK', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        expect(await caught(trelloFetch('/boards'))).toMatchObject({ code: 'NETWORK', status: 0 });
    });

    it('AbortError is rethrown unchanged, not wrapped', async () => {
        const abort = new DOMException('aborted', 'AbortError');
        fetchMock.mockRejectedValue(abort);
        const err = await caught(trelloFetch('/boards'));
        expect(err).toBe(abort);
        expect(err).not.toBeInstanceOf(TrelloApiError);
    });
});

describe('trelloApi typed calls', () => {
    it('moveCard sends PUT with JSON body { listId } and Content-Type', async () => {
        fetchMock.mockResolvedValue(reply({ success: true, data: { id: 'c1' } }));
        await trelloApi.moveCard('c1', 'L2');
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toMatch(/\/api\/trello\/cards\/c1\/move$/);
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body as string)).toEqual({ listId: 'L2' });
        expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    });

    it('boardFull encodes the id in the URL', async () => {
        fetchMock.mockResolvedValue(reply({ success: true, data: {} }));
        await trelloApi.boardFull('a b');
        expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/trello\/boards\/a%20b\/full$/);
    });
});

describe('describeTrelloError', () => {
    const notConfigured = new TrelloApiError('NOT_CONFIGURED', 503, 'x');

    it('NOT_CONFIGURED: admin text names TRELLO_API_KEY', () => {
        expect(describeTrelloError(notConfigured, { isAdmin: true })).toContain('TRELLO_API_KEY');
    });

    it('NOT_CONFIGURED: non-admin is told to ask an administrator', () => {
        const msg = describeTrelloError(notConfigured);
        expect(msg).toMatch(/ask an administrator/i);
        expect(msg).not.toContain('TRELLO_API_KEY');
    });

    it('non-TrelloApiError returns its message', () => {
        expect(describeTrelloError(new Error('boom'))).toBe('boom');
    });
});
