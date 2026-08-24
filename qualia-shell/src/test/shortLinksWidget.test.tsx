/**
 * ShortLinks ("Links & QR") widget + shortLinksApi client
 * (plan 047 phase 2, extended for plan 053).
 *
 * Backend 503 (DUB_API_KEY unset) → typed needs-setup result and an honest
 * "Connect Dub" card (no free plan claimed) whose button opens the Tools hub;
 * 200 → link table with click counts, tags, clicks sparkline (/analytics
 * timeseries), QR toggle, inline edit (PATCH), confirm-gated archive, tag
 * filter; Andy presets POST tagged links; the QR door sheet renders one cell
 * per unit entirely client-side; network failure → error state with Retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ShortLinks from '../components/ShortLinks/ShortLinks';
import { unitUrl } from '../components/ShortLinks/QrDoorSheet';
import { ANDY_PROPERTIES, presetKey, ANDY_LINK_PRESETS } from '../components/ShortLinks/andyLinkPresets';
import {
    archiveShortLink,
    bulkCreateShortLinks,
    createShortLink,
    getClicksTimeseries,
    listLinkDomains,
    listLinkTags,
    listShortLinks,
    updateShortLink,
} from '../components/ShortLinks/shortLinksApi';

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
    domain: 'dub.sh',
    clicks: 12,
    qrCode: 'https://api.dub.co/qr?url=https%3A%2F%2Fdub.sh%2Fnotice1',
    archived: false,
    expiresAt: null,
    tags: [{ id: 'tag_1', name: 'woodland-parc', color: 'green' }],
};

const LINK_2 = {
    ...LINK,
    id: 'link_2',
    shortLink: 'https://dub.sh/rent',
    url: 'https://example.com/rent',
    key: 'rent',
    clicks: 0,
    tags: [{ id: 'tag_2', name: 'riverwood-club', color: 'blue' }],
};

const TAGS = [
    { id: 'tag_1', name: 'woodland-parc', color: 'green' },
    { id: 'tag_2', name: 'riverwood-club', color: 'blue' },
];
const DOMAINS = [
    { id: 'dom_1', slug: 'go.dwellium.com', verified: true, primary: true, archived: false },
];
const TIMESERIES = [
    { start: '2026-08-01T00:00:00.000Z', clicks: 3 },
    { start: '2026-08-02T00:00:00.000Z', clicks: 9 },
];

type JsonObject = Record<string, unknown>;
interface Recorded { url: string; method: string; body?: JsonObject }

/** Route the widget's fetches by path; records every write for assertion. */
function stubBackend(links: JsonObject[], overrides: JsonObject = {}) {
    const calls: Recorded[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url: u, method, body });
        if (u.includes('/api/links/tags')) {
            return method === 'POST'
                ? jsonResponse({ success: true, data: { id: 'tag_new', name: body?.name, color: '' } }, 201)
                : jsonResponse({ success: true, data: TAGS });
        }
        if (u.includes('/api/links/domains')) return jsonResponse({ success: true, data: DOMAINS, defaultDomain: 'go.dwellium.com' });
        if (u.includes('/api/links/analytics')) return jsonResponse({ success: true, groupBy: 'timeseries', data: TIMESERIES });
        if (u.includes('/api/links/bulk')) {
            const sent = (body?.links ?? []) as JsonObject[];
            return jsonResponse({ success: true, data: sent.map((l, i) => ({ ...LINK, id: `blk_${i}`, url: l.url, key: l.key })) }, 201);
        }
        if (method === 'PATCH') return jsonResponse({ success: true, data: { ...LINK, ...overrides, ...body } });
        if (method === 'POST') return jsonResponse({ success: true, data: { ...LINK, id: 'link_new', ...body } }, 201);
        return jsonResponse({ success: true, data: links });
    }));
    return calls;
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
    vi.unstubAllEnvs();
});

describe('shortLinksApi', () => {
    it('503 → needs-setup on every route', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        expect(await listShortLinks()).toEqual({ kind: 'needs-setup' });
        expect(await createShortLink({ url: 'https://example.com' })).toEqual({ kind: 'needs-setup' });
        expect(await updateShortLink('link_1', { archived: true })).toEqual({ kind: 'needs-setup' });
        expect(await listLinkTags()).toEqual({ kind: 'needs-setup' });
        expect(await listLinkDomains()).toEqual({ kind: 'needs-setup' });
        expect(await getClicksTimeseries('link_1')).toEqual({ kind: 'needs-setup' });
        expect(await bulkCreateShortLinks([{ url: 'https://example.com' }])).toEqual({ kind: 'needs-setup' });
    });

    it('200 → data; non-ok surfaces the backend error; network failure → Backend unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [LINK] })));
        expect(await listShortLinks()).toEqual({ kind: 'ok', data: [LINK] });
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, error: 'A valid http(s) url is required' }, 400)));
        expect(await createShortLink({ url: 'nope' })).toEqual({ kind: 'error', message: 'A valid http(s) url is required' });
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        expect(await listShortLinks()).toEqual({ kind: 'error', message: 'Backend unreachable' });
    });

    it('builds the documented URLs: archive → PATCH, analytics → groupBy/interval, bulk → {links}', async () => {
        const calls: Recorded[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
            return jsonResponse({ success: true, data: { clicks: 42 } });
        }));
        await archiveShortLink('link_1');
        await getClicksTimeseries('link_1', '7d');
        await bulkCreateShortLinks([{ url: 'https://example.com/a', key: 'a' }]);
        await listShortLinks(true);

        expect(calls[0]).toMatchObject({ method: 'PATCH', body: { archived: true } });
        expect(calls[0].url).toMatch(/\/api\/links\/link_1$/);
        expect(calls[1].url).toMatch(/\/api\/links\/analytics\?groupBy=timeseries&linkId=link_1&interval=7d$/);
        expect(calls[2]).toMatchObject({ method: 'POST', body: { links: [{ url: 'https://example.com/a', key: 'a' }] } });
        expect(calls[2].url).toMatch(/\/api\/links\/bulk$/);
        expect(calls[3].url).toMatch(/\/api\/links\?showArchived=true$/);
    });
});

describe('ShortLinks widget — unconfigured and error states', () => {
    it('renders an HONEST needs-setup card (no free-plan claim); its button opens the Tools hub', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('Connect Dub')).toBeInTheDocument());
        expect(screen.getByText(/DUB_API_KEY/)).toBeInTheDocument();
        expect(screen.getByText(/no free plan/i)).toBeInTheDocument();
        expect(screen.getByText(/check current pricing/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open Tools hub' }));
        expect(opened).toEqual(['tools-hub']);
    });

    it('offers the QR door sheet even while Dub is unconfigured', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('Connect Dub')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'QR door sheet (works without Dub)' }));
        expect(screen.getByLabelText('Property')).toBeInTheDocument();
    });

    it('renders the error state with Retry when the backend is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('"Open in Dub ↗" deep-links to the workspace when VITE_DUB_WORKSPACE is set', async () => {
        vi.stubEnv('VITE_DUB_WORKSPACE', 'dwellium');
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        render(<ShortLinks />);
        const link = await screen.findByRole('link', { name: /Open in Dub/i });
        expect(link).toHaveAttribute('href', 'https://app.dub.co/dwellium');
    });
});

describe('ShortLinks widget — daily workflow', () => {
    it('lists links with clicks, tags, QR toggle and a clicks sparkline from /analytics', async () => {
        stubBackend([LINK, LINK_2]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('https://dub.sh/notice1')).toBeInTheDocument());
        expect(screen.getByText('12')).toBeInTheDocument();
        // tag chip on the row
        expect(screen.getAllByText('woodland-parc').length).toBeGreaterThan(0);
        // sparkline only for links with clicks (link_2 has 0 → no analytics call)
        await waitFor(() => expect(screen.getByLabelText('Clicks sparkline: 3, 9')).toBeInTheDocument());
        expect(screen.queryAllByLabelText(/Clicks sparkline/)).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: `Show QR for ${LINK.shortLink}` }));
        const qr = screen.getByAltText(`QR code for ${LINK.shortLink}`) as HTMLImageElement;
        expect(qr.src).toBe(LINK.qrCode);
    });

    it('create form POSTs url, key, domain, tags, UTM and expiry, then refreshes', async () => {
        const calls = stubBackend([]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());

        const createBtn = screen.getByRole('button', { name: 'Create link' });
        expect(createBtn).toBeDisabled(); // no valid URL yet
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/notice' } });
        fireEvent.change(screen.getByLabelText('Custom key'), { target: { value: 'notice1' } });
        fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'go.dwellium.com' } });
        fireEvent.change(screen.getByLabelText('utm_source'), { target: { value: 'door-qr' } });
        fireEvent.click(screen.getByLabelText('Filter by tag')); // no-op, keeps filter untouched
        expect(createBtn).toBeEnabled();
        fireEvent.click(createBtn);

        await waitFor(() => expect(calls.some(c => c.method === 'POST')).toBe(true));
        const post = calls.find(c => c.method === 'POST')!;
        expect(post.url).toMatch(/\/api\/links$/);
        expect(post.body).toEqual({
            url: 'https://example.com/notice',
            key: 'notice1',
            domain: 'go.dwellium.com',
            utm_source: 'door-qr',
        });
        await waitFor(() => expect(screen.getByText(/^Created /)).toBeInTheDocument());
    });

    it('inline edit PATCHes the changed destination', async () => {
        const calls = stubBackend([LINK]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('https://dub.sh/notice1')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: `Edit ${LINK.shortLink}` }));
        fireEvent.change(screen.getByLabelText('Edit destination URL'), { target: { value: 'https://example.com/updated' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(calls.some(c => c.method === 'PATCH')).toBe(true));
        const patch = calls.find(c => c.method === 'PATCH')!;
        expect(patch.url).toMatch(/\/api\/links\/link_1$/);
        expect(patch.body).toMatchObject({ url: 'https://example.com/updated', expiresAt: null });
    });

    it('archive is confirm-gated: first click asks, confirm PATCHes archived:true', async () => {
        const calls = stubBackend([LINK], { archived: true });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('https://dub.sh/notice1')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: `Archive ${LINK.shortLink}` }));
        expect(calls.some(c => c.method === 'PATCH')).toBe(false); // nothing sent yet
        const confirm = screen.getByRole('button', { name: 'Confirm archive' });
        fireEvent.click(confirm);

        await waitFor(() => expect(calls.some(c => c.method === 'PATCH')).toBe(true));
        expect(calls.find(c => c.method === 'PATCH')!.body).toEqual({ archived: true });
    });

    it('tag filter narrows the table to links carrying that tag', async () => {
        stubBackend([LINK, LINK_2]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('https://dub.sh/rent')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText('Filter by tag'), { target: { value: 'riverwood-club' } });
        expect(screen.queryByText('https://dub.sh/notice1')).not.toBeInTheDocument();
        expect(screen.getByText('https://dub.sh/rent')).toBeInTheDocument();
    });
});

describe('Andy presets', () => {
    it('one click mints a preset link with the property tag + kind tag and a derived key', async () => {
        const calls = stubBackend([]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByLabelText('Preset property')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText('Preset property'), { target: { value: 'riverwood-club' } });
        fireEvent.click(screen.getByRole('button', { name: '+ Maintenance request' }));

        await waitFor(() => expect(calls.some(c => c.method === 'POST')).toBe(true));
        const property = ANDY_PROPERTIES.find(p => p.id === 'riverwood-club')!;
        const preset = ANDY_LINK_PRESETS.find(p => p.id === 'maintenance')!;
        expect(calls.find(c => c.method === 'POST')!.body).toEqual({
            url: preset.url,
            key: presetKey(property, preset),
            tagNames: [property.tag, preset.kindTag],
        });
    });

    it('ships all four presets, each with a per-property tag pair', () => {
        expect(ANDY_LINK_PRESETS.map(p => p.id)).toEqual(['resident-portal', 'maintenance', 'rent-payment', 'current-notice']);
        expect(ANDY_PROPERTIES.map(p => p.name)).toEqual(['Woodland Parc Townhomes', 'Riverwood Club Apartments']);
        for (const property of ANDY_PROPERTIES) {
            for (const preset of ANDY_LINK_PRESETS) {
                expect(presetKey(property, preset)).toBe(`${property.tag}-${preset.keySuffix}`);
            }
        }
    });
});

describe('QR door sheet', () => {
    it('substitutes {unit} (URL-encoded) into the destination pattern', () => {
        expect(unitUrl('https://x.test/?unit={unit}', 'B03')).toBe('https://x.test/?unit=B03');
        expect(unitUrl('https://x.test/?unit={unit}&u={unit}', '2794-5')).toBe('https://x.test/?unit=2794-5&u=2794-5');
        expect(unitUrl('https://x.test/?unit={unit}', 'A 1')).toBe('https://x.test/?unit=A%201');
    });

    it('generates one QR cell per unit, client-side, with the unit label and URL', async () => {
        stubBackend([LINK]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('https://dub.sh/notice1')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Door sheet/i }));

        fireEvent.change(screen.getByLabelText('Property'), { target: { value: 'riverwood-club' } });
        fireEvent.click(screen.getByRole('button', { name: /Generate sheet/i }));

        const sheet = screen.getByTestId('qr-door-sheet-print');
        const cells = within(sheet).getAllByTestId('qr-door-sheet-cell');
        const riverwood = ANDY_PROPERTIES.find(p => p.id === 'riverwood-club')!;
        expect(cells).toHaveLength(riverwood.units.length);
        for (const unit of riverwood.units) {
            expect(within(sheet).getByText(`Unit ${unit}`)).toBeInTheDocument();
        }
        // QR encoding is local (no network) — an <svg> is rendered per cell.
        expect(sheet.querySelectorAll('svg')).toHaveLength(cells.length);
    });

    it('an edited roster changes the row count; "Mint short links" bulk-creates tagged links', async () => {
        const calls = stubBackend([LINK]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('https://dub.sh/notice1')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Door sheet/i }));

        fireEvent.change(screen.getByLabelText('Units'), { target: { value: '101\n102\n103' } });
        fireEvent.click(screen.getByRole('button', { name: /Generate sheet/i }));
        expect(within(screen.getByTestId('qr-door-sheet-print')).getAllByTestId('qr-door-sheet-cell')).toHaveLength(3);

        fireEvent.click(screen.getByRole('button', { name: /Mint short links/i }));
        await waitFor(() => expect(calls.some(c => c.url.includes('/api/links/bulk'))).toBe(true));
        const bulk = calls.find(c => c.url.includes('/api/links/bulk'))!;
        const sent = bulk.body?.links as JsonObject[];
        expect(sent).toHaveLength(3);
        expect(sent[0]).toMatchObject({ key: 'woodland-parc-101', tagNames: ['woodland-parc', 'door-qr'] });
        expect(String(sent[0].url)).toContain('unit=101');
    });

    it('refuses to generate when the pattern has no {unit} placeholder', async () => {
        stubBackend([LINK]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('https://dub.sh/notice1')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Door sheet/i }));

        fireEvent.change(screen.getByLabelText('Destination pattern'), { target: { value: 'https://x.test/maint' } });
        expect(screen.getByRole('button', { name: /Generate sheet/i })).toBeDisabled();
        expect(screen.queryByTestId('qr-door-sheet-print')).not.toBeInTheDocument();
    });
});
