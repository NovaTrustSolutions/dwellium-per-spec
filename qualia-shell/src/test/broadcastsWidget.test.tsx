/**
 * Broadcasts widget + broadcastsApi client (plan 047 phase 2).
 *
 * Backend 503 (LISTMONK_* env unset) → typed needs-setup result and a
 * "Connect listmonk" card (free e2-micro — tools/listmonk/README) whose button
 * opens the Tools hub; 200 → lists + campaigns and a "New notice" composer
 * that POSTs a draft; network failure → error state with Retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Broadcasts from '../components/Broadcasts/Broadcasts';
import { createCampaignDraft, listBroadcastLists } from '../components/Broadcasts/broadcastsApi';

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

const LISTS = { success: true, data: [{ id: 1, name: 'Oakridge residents', subscriber_count: 24 }] };
const CAMPAIGNS = { success: true, data: [{ id: 7, name: 'August notice', subject: 'Pool closed Friday', status: 'draft', created_at: '2026-08-20T00:00:00.000Z' }] };
const TEMPLATES = { success: true, data: [{ id: 2, name: 'Resident notice' }] };

/** Route the widget's three GETs + composer POST by URL. */
function happyFetch(posts: Array<{ url: string; body: unknown }>) {
    return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === 'POST') {
            posts.push({ url: u, body: JSON.parse(String(init.body)) });
            return jsonResponse({ success: true, data: { id: 42, status: 'draft' } }, 201);
        }
        if (u.endsWith('/lists')) return jsonResponse(LISTS);
        if (u.endsWith('/templates')) return jsonResponse(TEMPLATES);
        return jsonResponse(CAMPAIGNS);
    });
}

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

describe('broadcastsApi', () => {
    it('503 → needs-setup (list and create)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        expect(await listBroadcastLists()).toEqual({ kind: 'needs-setup' });
        expect(await createCampaignDraft({ subject: 'Hi', lists: [1] })).toEqual({ kind: 'needs-setup' });
    });

    it('200 → data; non-ok surfaces the backend error; network failure → Backend unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(LISTS)));
        expect(await listBroadcastLists()).toEqual({ kind: 'ok', data: LISTS.data });
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, error: 'subject and at least one list id are required' }, 400)));
        expect(await createCampaignDraft({ subject: '', lists: [] })).toEqual({ kind: 'error', message: 'subject and at least one list id are required' });
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        expect(await listBroadcastLists()).toEqual({ kind: 'error', message: 'Backend unreachable' });
    });
});

describe('Broadcasts widget', () => {
    it('renders the needs-setup card on 503 (free e2-micro pointer); its button opens the Tools hub', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        render(<Broadcasts />);
        await waitFor(() => expect(screen.getByText('Connect listmonk')).toBeInTheDocument());
        expect(screen.getByText(/free e2-micro — see tools\/listmonk\/README/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open Tools hub' }));
        expect(opened).toEqual(['tools-hub']);
    });

    it('renders lists + campaigns; composer posts a draft with audience + template', async () => {
        const posts: Array<{ url: string; body: unknown }> = [];
        vi.stubGlobal('fetch', happyFetch(posts));
        render(<Broadcasts />);
        await waitFor(() => expect(screen.getByText('August notice')).toBeInTheDocument());
        expect(screen.getByText('Pool closed Friday')).toBeInTheDocument();
        expect(screen.getByText('draft')).toBeInTheDocument();

        const createBtn = screen.getByRole('button', { name: 'Create draft' });
        expect(createBtn).toBeDisabled(); // no subject / audience yet
        fireEvent.change(screen.getByLabelText('Notice subject'), { target: { value: 'Elevator maintenance' } });
        fireEvent.change(screen.getByLabelText('Audience'), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('Template'), { target: { value: '2' } });
        expect(createBtn).toBeEnabled();
        fireEvent.click(createBtn);
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0].url).toMatch(/\/api\/broadcasts\/campaigns$/);
        expect(posts[0].body).toEqual({ subject: 'Elevator maintenance', lists: [1], template_id: 2 });
        await waitFor(() => expect(screen.getByText(/Draft created/)).toBeInTheDocument());
    });

    it('renders the error state with Retry when the backend is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<Broadcasts />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
});
