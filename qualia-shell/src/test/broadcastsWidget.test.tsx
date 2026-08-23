/**
 * Broadcasts widget + broadcastsApi client (plan 047 phase 2 → plan 053).
 *
 * Backend 503 (LISTMONK_* env unset) → typed needs-setup result and a
 * "Connect listmonk" card whose button opens the Tools hub; 200 → the four
 * tabs (Campaigns / Audiences / Templates / Admin). Campaigns: composer with
 * a body editor POSTs drafts, per-row stats, test-send, and Send/Schedule
 * behind a type-SEND confirm dialog (the PUT carries confirm:true). Audiences:
 * create list, browse subscribers, Import-from-Strata with per-row consent
 * checkboxes + unconfirmed-by-default. Templates: rendered preview iframe.
 * Admin: VITE_LISTMONK_URL embed behind the reachability pattern. Network
 * failure → error state with Retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Broadcasts from '../components/Broadcasts/Broadcasts';
import {
    createCampaignDraft,
    getTemplatePreview,
    importSubscribers,
    listBroadcastLists,
    setCampaignStatus,
} from '../components/Broadcasts/broadcastsApi';

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

function htmlResponse(html: string): Response {
    return {
        ok: true,
        status: 200,
        json: async () => { throw new Error('not json'); },
        text: async () => html,
    } as unknown as Response;
}

const LISTS = { success: true, data: [{ id: 1, name: 'Woodland Parc Townhomes', subscriber_count: 24 }, { id: 2, name: 'Owners', subscriber_count: 9 }] };
const CAMPAIGNS = { success: true, data: [{ id: 7, name: 'August notice', subject: 'Pool closed Friday', status: 'draft', created_at: '2026-08-20T00:00:00.000Z' }] };
const TEMPLATES = { success: true, data: [{ id: 2, name: 'Rent reminder' }] };
const RESIDENTS = [
    { id: 'ten-1', name: 'Rita Resident', email: 'rita@example.com', propertyIds: ['prop-woodland'] },
    { id: 'ten-2', name: 'No-Mail Ned', email: null, propertyIds: [] },
];

interface Recorded { url: string; method: string; body: unknown }

/** Route every request the tabbed widget makes by URL + method. */
function tabbedFetch(recorded: Recorded[]) {
    return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || 'GET';
        if (method !== 'GET') recorded.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (u.startsWith('https://lists.example')) return jsonResponse({}); // admin reachability ping
        if (u.includes('/api/dwellium/entities')) return jsonResponse(RESIDENTS);
        if (u.includes('/api/broadcasts/subscribers/import')) return jsonResponse({ success: true, data: { created: 1, updated: 0, failed: [] } });
        if (u.includes('/api/broadcasts/subscribers')) return jsonResponse({ success: true, data: [{ id: 5, email: 'rita@example.com', name: 'Rita Resident' }], total: 1 });
        if (u.match(/\/api\/broadcasts\/campaigns\/\d+\/stats$/)) {
            return jsonResponse({ success: true, data: { id: 7, name: 'August notice', status: 'finished', sent: 120, to_send: 120, views: 48, clicks: 9, bounces: 2 } });
        }
        if (u.match(/\/api\/broadcasts\/campaigns\/\d+\/test$/)) return jsonResponse({ success: true, data: { sent: ['andy@example.com'] } });
        if (u.match(/\/api\/broadcasts\/campaigns\/\d+\/status$/)) return jsonResponse({ success: true, data: { id: 7, status: 'running' } });
        if (u.match(/\/api\/broadcasts\/campaigns\/\d+$/)) return jsonResponse({ success: true, data: { id: 7 } });
        if (u.match(/\/api\/broadcasts\/templates\/\d+\/preview$/)) return htmlResponse('<html><body>Dear {{ .Subscriber.Name }}</body></html>');
        if (u.endsWith('/api/broadcasts/lists')) {
            return method === 'POST' ? jsonResponse({ success: true, data: { id: 9 } }, 201) : jsonResponse(LISTS);
        }
        if (u.endsWith('/api/broadcasts/templates')) return jsonResponse(TEMPLATES);
        if (u.endsWith('/api/broadcasts/campaigns')) {
            return method === 'POST' ? jsonResponse({ success: true, data: { id: 42, status: 'draft' } }, 201) : jsonResponse(CAMPAIGNS);
        }
        return jsonResponse({ success: false, error: `unexpected ${method} ${u}` }, 500);
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

async function renderOk(recorded: Recorded[] = [], env?: Record<string, string | undefined>) {
    vi.stubGlobal('fetch', tabbedFetch(recorded));
    render(<Broadcasts env={env ?? {}} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Campaigns' })).toBeInTheDocument());
}

describe('broadcastsApi', () => {
    it('503 → needs-setup (list, create, import, status, preview)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        expect(await listBroadcastLists()).toEqual({ kind: 'needs-setup' });
        expect(await createCampaignDraft({ subject: 'Hi', lists: [1] })).toEqual({ kind: 'needs-setup' });
        expect(await importSubscribers({ subscribers: [{ email: 'a@b.co' }], lists: [1], preconfirm: false })).toEqual({ kind: 'needs-setup' });
        expect(await setCampaignStatus(7, 'running', true)).toEqual({ kind: 'needs-setup' });
        expect(await getTemplatePreview(2)).toEqual({ kind: 'needs-setup' });
    });

    it('200 → data; non-ok surfaces the backend error; network failure → Backend unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(LISTS)));
        expect(await listBroadcastLists()).toEqual({ kind: 'ok', data: LISTS.data });
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, error: 'subject and at least one list id are required' }, 400)));
        expect(await createCampaignDraft({ subject: '', lists: [] })).toEqual({ kind: 'error', message: 'subject and at least one list id are required' });
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        expect(await listBroadcastLists()).toEqual({ kind: 'error', message: 'Backend unreachable' });
    });

    it('setCampaignStatus PUTs {status, confirm:true} — the backend refuses sends without it', async () => {
        const recorded: Recorded[] = [];
        vi.stubGlobal('fetch', tabbedFetch(recorded));
        await setCampaignStatus(7, 'running', true);
        await setCampaignStatus(7, 'paused');
        expect(recorded).toEqual([
            { url: expect.stringMatching(/\/api\/broadcasts\/campaigns\/7\/status$/), method: 'PUT', body: { status: 'running', confirm: true } },
            { url: expect.stringMatching(/\/api\/broadcasts\/campaigns\/7\/status$/), method: 'PUT', body: { status: 'paused' } },
        ]);
    });
});

describe('Broadcasts widget — top-level states', () => {
    it('renders the needs-setup card on 503 (free e2-micro pointer); its button opens the Tools hub', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        render(<Broadcasts env={{}} />);
        await waitFor(() => expect(screen.getByText('Connect listmonk')).toBeInTheDocument());
        expect(screen.getByText(/free e2-micro — see tools\/listmonk\/README/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open Tools hub' }));
        expect(opened).toEqual(['tools-hub']);
    });

    it('renders the error state with Retry when the backend is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<Broadcasts env={{}} />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
});

describe('Broadcasts widget — Campaigns tab', () => {
    it('renders campaigns; composer posts a draft with audience + template + BODY (content_type html)', async () => {
        const recorded: Recorded[] = [];
        await renderOk(recorded);
        expect(screen.getByText('August notice')).toBeInTheDocument();
        expect(screen.getByText('Pool closed Friday')).toBeInTheDocument();
        expect(screen.getByText('draft')).toBeInTheDocument();

        const createBtn = screen.getByRole('button', { name: 'Create draft' });
        expect(createBtn).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Notice subject'), { target: { value: 'Elevator maintenance' } });
        fireEvent.change(screen.getByLabelText('Audience'), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('Template'), { target: { value: '2' } });
        fireEvent.change(screen.getByLabelText('Notice body'), { target: { value: '<p>Elevator down 9–12 on Friday.</p>' } });
        expect(createBtn).toBeEnabled();
        fireEvent.click(createBtn);
        await waitFor(() => expect(recorded).toHaveLength(1));
        expect(recorded[0].url).toMatch(/\/api\/broadcasts\/campaigns$/);
        expect(recorded[0].body).toEqual({
            subject: 'Elevator maintenance',
            lists: [1],
            template_id: 2,
            body: '<p>Elevator down 9–12 on Friday.</p>',
            content_type: 'html',
        });
        await waitFor(() => expect(screen.getByText(/Draft created/)).toBeInTheDocument());
    });

    it('Stats button fetches and renders sent/views/clicks/bounces', async () => {
        await renderOk();
        fireEvent.click(screen.getByRole('button', { name: 'Stats for August notice' }));
        await waitFor(() => expect(screen.getByText(/sent 120\/120 · views 48 · clicks 9 · bounces 2/)).toBeInTheDocument());
    });

    it('Test-send flow POSTs the address to /campaigns/:id/test', async () => {
        const recorded: Recorded[] = [];
        await renderOk(recorded);
        fireEvent.click(screen.getByRole('button', { name: 'Test-send August notice' }));
        const input = screen.getByLabelText('Test e-mail address');
        const sendTest = screen.getByRole('button', { name: 'Send test' });
        expect(sendTest).toBeDisabled();
        fireEvent.change(input, { target: { value: 'andy@example.com' } });
        expect(sendTest).toBeEnabled();
        fireEvent.click(sendTest);
        await waitFor(() => expect(recorded).toHaveLength(1));
        expect(recorded[0]).toMatchObject({ method: 'POST', body: { subscribers: ['andy@example.com'] } });
        expect(recorded[0].url).toMatch(/\/api\/broadcasts\/campaigns\/7\/test$/);
        await waitFor(() => expect(screen.getByText(/Test sent to andy@example.com/)).toBeInTheDocument());
    });

    it('Send opens the confirm dialog; confirming requires typing SEND; the PUT carries confirm:true', async () => {
        const recorded: Recorded[] = [];
        await renderOk(recorded);
        fireEvent.click(screen.getByRole('button', { name: 'Send August notice' }));
        const dialog = screen.getByRole('dialog', { name: 'Confirm send' });
        expect(within(dialog).getByText(/e-mailed to the whole audience now/)).toBeInTheDocument();
        const confirmBtn = within(dialog).getByRole('button', { name: 'Confirm send' });
        expect(confirmBtn).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText('Type SEND to confirm'), { target: { value: 'send' } });
        expect(confirmBtn).toBeDisabled(); // exact word, case-sensitive
        fireEvent.change(within(dialog).getByLabelText('Type SEND to confirm'), { target: { value: 'SEND' } });
        expect(confirmBtn).toBeEnabled();
        fireEvent.click(confirmBtn);
        await waitFor(() => expect(recorded.length).toBeGreaterThanOrEqual(1));
        expect(recorded[0]).toMatchObject({ method: 'PUT', body: { status: 'running', confirm: true } });
        expect(recorded[0].url).toMatch(/\/api\/broadcasts\/campaigns\/7\/status$/);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('Cancel closes the dialog without any PUT', async () => {
        const recorded: Recorded[] = [];
        await renderOk(recorded);
        fireEvent.click(screen.getByRole('button', { name: 'Send August notice' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(recorded).toHaveLength(0);
    });

    it('Schedule flow: datetime + confirm dialog → PUT send_at then PUT status scheduled with confirm:true', async () => {
        const recorded: Recorded[] = [];
        await renderOk(recorded);
        fireEvent.click(screen.getByRole('button', { name: 'Schedule August notice' }));
        fireEvent.change(screen.getByLabelText('Schedule date and time'), { target: { value: '2026-09-01T09:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Schedule send' }));
        const dialog = screen.getByRole('dialog', { name: 'Confirm send' });
        fireEvent.change(within(dialog).getByLabelText('Type SEND to confirm'), { target: { value: 'SEND' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm schedule' }));
        await waitFor(() => expect(recorded).toHaveLength(2));
        expect(recorded[0].url).toMatch(/\/api\/broadcasts\/campaigns\/7$/);
        expect(recorded[0].method).toBe('PUT');
        expect((recorded[0].body as { send_at: string }).send_at).toBe(new Date('2026-09-01T09:00').toISOString());
        expect(recorded[1]).toMatchObject({ method: 'PUT', body: { status: 'scheduled', confirm: true } });
    });
});

describe('Broadcasts widget — Audiences tab', () => {
    it('lists audiences with counts; create audience POSTs /lists; Browse fetches subscribers', async () => {
        const recorded: Recorded[] = [];
        await renderOk(recorded);
        fireEvent.click(screen.getByRole('tab', { name: 'Audiences' }));
        expect(screen.getByRole('button', { name: 'Browse Woodland Parc Townhomes' })).toBeInTheDocument();
        expect(screen.getByText('24')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Audience name'), { target: { value: 'Riverwood Club Apartments — residents' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create audience' }));
        await waitFor(() => expect(recorded).toHaveLength(1));
        expect(recorded[0]).toMatchObject({ method: 'POST', body: { name: 'Riverwood Club Apartments — residents', optin: 'single' } });
        expect(recorded[0].url).toMatch(/\/api\/broadcasts\/lists$/);

        fireEvent.click(screen.getByRole('button', { name: 'Browse Owners' }));
        await waitFor(() => expect(screen.getByText(/1 subscriber/)).toBeInTheDocument());
        expect(screen.getByText('rita@example.com')).toBeInTheDocument();
    });

    it('Import from Strata: per-row consent checkboxes, no-email rows disabled, unconfirmed-by-default POST', async () => {
        const recorded: Recorded[] = [];
        await renderOk(recorded);
        fireEvent.click(screen.getByRole('tab', { name: 'Audiences' }));
        expect(screen.getByText(/not marketing consent/)).toBeInTheDocument(); // honesty note
        expect(screen.getByLabelText('Add as unconfirmed')).toBeChecked(); // unsubscribed-by-default toggle

        fireEvent.change(screen.getByLabelText('Target audience'), { target: { value: '1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Load contacts' }));
        await waitFor(() => expect(screen.getByLabelText('Include Rita Resident')).toBeInTheDocument());
        expect(screen.getByLabelText('Include Rita Resident')).toBeChecked();
        expect(screen.getByLabelText('Include No-Mail Ned')).toBeDisabled(); // no e-mail on file

        fireEvent.click(screen.getByRole('button', { name: 'Import 1 selected' }));
        await waitFor(() => expect(recorded.some(r => r.url.includes('/subscribers/import'))).toBe(true));
        const imp = recorded.find(r => r.url.includes('/subscribers/import'));
        expect(imp?.body).toEqual({
            subscribers: [{
                email: 'rita@example.com',
                name: 'Rita Resident',
                attribs: { source: 'strata:residents', strata_id: 'ten-1', strata_property_ids: ['prop-woodland'] },
            }],
            lists: [1],
            preconfirm: false, // unconfirmed by default — consent stays with the subscriber
        });
        await waitFor(() => expect(screen.getByText(/1 added, 0 updated/)).toBeInTheDocument());
        expect(screen.getByText(/Nothing was deleted/)).toBeInTheDocument();
    });

    it('unchecking the consent box excludes the row and disables import when none left', async () => {
        await renderOk();
        fireEvent.click(screen.getByRole('tab', { name: 'Audiences' }));
        fireEvent.change(screen.getByLabelText('Target audience'), { target: { value: '1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Load contacts' }));
        await waitFor(() => expect(screen.getByLabelText('Include Rita Resident')).toBeInTheDocument());
        fireEvent.click(screen.getByLabelText('Include Rita Resident'));
        expect(screen.getByRole('button', { name: 'Import 0 selected' })).toBeDisabled();
    });
});

describe('Broadcasts widget — Templates tab', () => {
    it('lists templates; Preview fetches the rendered HTML into a sandboxed iframe', async () => {
        await renderOk();
        fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));
        expect(screen.getByText('Rent reminder')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Preview Rent reminder' }));
        await waitFor(() => expect(screen.getByTitle('Template preview')).toBeInTheDocument());
        const frame = screen.getByTitle('Template preview');
        expect(frame.getAttribute('srcdoc')).toContain('Dear {{ .Subscriber.Name }}');
        expect(frame.getAttribute('sandbox')).toBe('');
    });
});

describe('Broadcasts widget — Admin tab', () => {
    it('without VITE_LISTMONK_URL → honest "not configured" card naming the env var', async () => {
        await renderOk();
        fireEvent.click(screen.getByRole('tab', { name: 'Admin' }));
        expect(screen.getByText('Admin embed not configured')).toBeInTheDocument();
        expect(screen.getByText('VITE_LISTMONK_URL')).toBeInTheDocument();
    });

    it('with VITE_LISTMONK_URL and the server answering → embeds the admin iframe', async () => {
        await renderOk([], { VITE_LISTMONK_URL: 'https://lists.example' });
        fireEvent.click(screen.getByRole('tab', { name: 'Admin' }));
        await waitFor(() => expect(screen.getByTitle('listmonk admin')).toBeInTheDocument());
        expect(screen.getByTitle('listmonk admin').getAttribute('src')).toBe('https://lists.example');
    });

    it('with VITE_LISTMONK_URL but the server unreachable → offline card with Re-check and Open ↗', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
            const u = String(url);
            if (u.startsWith('https://lists.example')) throw new Error('down');
            if (u.endsWith('/lists')) return jsonResponse(LISTS);
            if (u.endsWith('/templates')) return jsonResponse(TEMPLATES);
            return jsonResponse(CAMPAIGNS);
        }));
        render(<Broadcasts env={{ VITE_LISTMONK_URL: 'https://lists.example' }} />);
        await waitFor(() => expect(screen.getByRole('tab', { name: 'Admin' })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('tab', { name: 'Admin' }));
        await waitFor(() => expect(screen.getByText(/listmonk isn’t reachable/)).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Re-check' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Open ↗/ })).toBeInTheDocument();
    });
});
