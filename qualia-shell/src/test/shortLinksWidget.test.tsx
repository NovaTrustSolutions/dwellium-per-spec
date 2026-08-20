/**
 * ShortLinks ("Links & QR") widget + shortLinksApi client (plan 047 phase 2).
 *
 * Backend 503 (DUB_API_KEY unset) → typed needs-setup result and a "Connect
 * Dub" card whose button opens the Tools hub; 200 → link table with click
 * counts + QR toggle (Dub-served PNG url); create form POSTs url + key;
 * network failure → error state with Retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShortLinks from '../components/ShortLinks/ShortLinks';
import { createShortLink, listShortLinks } from '../components/ShortLinks/shortLinksApi';

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

const LINK = {
    id: 'link_1',
    shortLink: 'https://dub.sh/notice1',
    url: 'https://example.com/notice',
    key: 'notice1',
    clicks: 12,
    qrCode: 'https://api.dub.co/qr?url=https%3A%2F%2Fdub.sh%2Fnotice1',
};

const opened: string[] = [];
const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));

beforeEach(() => {
    localStorage.clear();
    opened.length = 0;
    window.addEventListener('dwellium:open-widget', onOpen);
});
afterEach(() => {
    window.removeEventListener('dwellium:open-widget', onOpen);
    vi.unstubAllGlobals();
});

describe('shortLinksApi', () => {
    it('503 → needs-setup (list and create)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        expect(await listShortLinks()).toEqual({ kind: 'needs-setup' });
        expect(await createShortLink({ url: 'https://example.com' })).toEqual({ kind: 'needs-setup' });
    });

    it('200 → data; non-ok surfaces the backend error; network failure → Backend unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [LINK] })));
        expect(await listShortLinks()).toEqual({ kind: 'ok', data: [LINK] });
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, error: 'A valid http(s) url is required' }, 400)));
        expect(await createShortLink({ url: 'nope' })).toEqual({ kind: 'error', message: 'A valid http(s) url is required' });
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        expect(await listShortLinks()).toEqual({ kind: 'error', message: 'Backend unreachable' });
    });
});

describe('ShortLinks widget', () => {
    it('renders the needs-setup card on 503; its button opens the Tools hub', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('Connect Dub')).toBeInTheDocument());
        expect(screen.getByText(/DUB_API_KEY/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open Tools hub' }));
        expect(opened).toEqual(['tools-hub']);
    });

    it('renders links with click counts; QR toggle shows the Dub-served PNG', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [LINK] })));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('https://dub.sh/notice1')).toBeInTheDocument());
        expect(screen.getByText('12')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: `Show QR for ${LINK.shortLink}` }));
        const qr = screen.getByAltText(`QR code for ${LINK.shortLink}`) as HTMLImageElement;
        expect(qr.src).toBe(LINK.qrCode);
    });

    it('create form POSTs url + custom key, then refreshes the list', async () => {
        const posts: Array<{ url: string; body: unknown }> = [];
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            if (init?.method === 'POST') {
                posts.push({ url: String(url), body: JSON.parse(String(init.body)) });
                return jsonResponse({ success: true, data: LINK }, 201);
            }
            return jsonResponse({ success: true, data: posts.length ? [LINK] : [] });
        }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('No links yet')).toBeInTheDocument());

        const createBtn = screen.getByRole('button', { name: 'Create link' });
        expect(createBtn).toBeDisabled(); // no valid URL yet
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/notice' } });
        fireEvent.change(screen.getByLabelText('Custom key'), { target: { value: 'notice1' } });
        expect(createBtn).toBeEnabled();
        fireEvent.click(createBtn);
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0].url).toMatch(/\/api\/links$/);
        expect(posts[0].body).toEqual({ url: 'https://example.com/notice', key: 'notice1' });
        await waitFor(() => expect(screen.getByText('https://dub.sh/notice1')).toBeInTheDocument());
    });

    it('renders the error state with Retry when the backend is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
});
