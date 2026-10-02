/**
 * ShortLinks ("Links & QR") widget + shortLinksApi client
 * (plan 047 phase 2, extended for plan 053; plan 077 phase 1).
 *
 * Backend 503 with `needsSetup:true` (OLD backend) → typed needs-setup result
 * and a card whose button opens the Tools hub; any other 503 → ordinary error.
 * 200 → link table with click counts, tags, clicks sparkline (/analytics
 * timeseries), QR toggle, inline edit (PATCH, changed fields only),
 * confirm-gated archive, tag filter; link presets POST tagged links; the QR
 * door sheet renders one cell per unit entirely client-side; network failure →
 * error state with Retry. `mode:'builtin'` (default backend) hides every
 * Dub-only control and folds UTM params into the destination URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWidgetMemory } from '../lib/widgetMemory';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ShortLinks, { isoToLocalInput } from '../components/ShortLinks/ShortLinks';
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

/** A built-in-mode row: no hosted QR, no tags, no expiry. */
const BUILTIN_LINK = {
    id: 'b_1',
    shortLink: 'https://go.dwellium.test/abc',
    url: 'https://example.com/a',
    key: 'abc',
    clicks: 0,
    qrCode: '',
    archived: false,
    expiresAt: null,
    tags: [],
};
const EXPIRY_ISO = '2026-08-15T14:30:00.000Z';

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

interface StubOpts {
    /** 'builtin' = the default SQLite shortener: `mode` on every body, no tags, /bulk 501. */
    mode?: 'builtin';
    /** Status for POST /api/links (create); default 201. */
    postStatus?: number;
}

const isListGet = (c: Recorded): boolean => c.method === 'GET' && /\/api\/links(\?|$)/.test(c.url);

/** Route the widget's fetches by path; records every write for assertion. */
function stubBackend(links: JsonObject[], overrides: JsonObject = {}, opts: StubOpts = {}) {
    const builtin = opts.mode === 'builtin';
    const modeTag = builtin ? { mode: 'builtin' } : {};
    const calls: Recorded[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url: u, method, body });
        if (u.includes('/api/links/tags')) {
            if (builtin) return jsonResponse({ success: true, ...modeTag, data: [] });
            return method === 'POST'
                ? jsonResponse({ success: true, data: { id: 'tag_new', name: body?.name, color: '' } }, 201)
                : jsonResponse({ success: true, data: TAGS });
        }
        if (u.includes('/api/links/domains')) return jsonResponse({ success: true, data: DOMAINS, defaultDomain: 'go.dwellium.com' });
        if (u.includes('/api/links/analytics')) return jsonResponse({ success: true, groupBy: 'timeseries', data: TIMESERIES });
        if (u.includes('/api/links/bulk')) {
            if (builtin) return jsonResponse({ success: false, ...modeTag, error: 'Bulk create needs Dub' }, 501);
            const sent = (body?.links ?? []) as JsonObject[];
            return jsonResponse({ success: true, data: sent.map((l, i) => ({ ...LINK, id: `blk_${i}`, url: l.url, key: l.key })) }, 201);
        }
        if (method === 'PATCH') return jsonResponse({ success: true, data: { ...LINK, ...overrides, ...body } });
        if (method === 'POST') {
            if (opts.postStatus && opts.postStatus >= 400) return jsonResponse({ success: false, error: 'Create refused' }, opts.postStatus);
            return jsonResponse({ success: true, ...modeTag, data: { ...LINK, id: 'link_new', ...body } }, 201);
        }
        return jsonResponse({ success: true, ...modeTag, data: links });
    }));
    return calls;
}

const opened: string[] = [];
const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));

beforeEach(() => {
    resetWidgetMemory(); // plan 055 phase 2 — v2.72.1 standing convention
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

    it('503 is needs-setup ONLY with the old backend\'s needsSetup marker; any other 503 is a plain error', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(null, 503)));
        expect(await listShortLinks()).toEqual({ kind: 'error', message: 'Backend answered 503' });
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, error: 'Service overloaded' }, 503)));
        expect(await createShortLink({ url: 'https://example.com' })).toEqual({ kind: 'error', message: 'Service overloaded' });
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: false }, 503)));
        expect(await listShortLinks()).toMatchObject({ kind: 'error' });
    });

    it('listShortLinks reports mode: builtin only when the body says so, else dub', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, mode: 'builtin', data: [BUILTIN_LINK] })));
        expect(await listShortLinks()).toEqual({ kind: 'ok', data: { links: [BUILTIN_LINK], mode: 'builtin' } });
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [LINK] })));
        expect(await listShortLinks()).toEqual({ kind: 'ok', data: { links: [LINK], mode: 'dub' } });
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, mode: 'something-else', data: [] })));
        expect(await listShortLinks()).toEqual({ kind: 'ok', data: { links: [], mode: 'dub' } });
    });

    it('200 → data; non-ok surfaces the backend error; network failure → Backend unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [LINK] })));
        expect(await listShortLinks()).toEqual({ kind: 'ok', data: { links: [LINK], mode: 'dub' } });
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
    it('renders an honest needs-setup card (backend update needed, door sheet works now); its button opens the Tools hub', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('QR codes work now — no account needed')).toBeInTheDocument());
        expect(screen.getByText(/need a backend update/i)).toBeInTheDocument();
        expect(screen.queryByText(/DUB_API_KEY|free plan|next backend deploy/i)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Tools hub' }));
        expect(opened).toEqual(['tools-hub']);
    });

    it('offers the QR door sheet even while Dub is unconfigured', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('QR codes work now — no account needed')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Open the QR door sheet' }));
        expect(screen.getByLabelText('Property')).toBeInTheDocument();
    });

    it('renders the error state with Retry when the backend is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('a bare 503 (cold start, no needsSetup marker) shows the retryable error card, not the setup card', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(null, 503)));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        expect(screen.queryByText('QR codes work now — no account needed')).not.toBeInTheDocument();
    });

    it('"Open in Dub ↗" deep-links to the workspace when VITE_DUB_WORKSPACE is set (Dub mode)', async () => {
        vi.stubEnv('VITE_DUB_WORKSPACE', 'dwellium');
        stubBackend([LINK]);
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
        expect(patch.body).toEqual({ url: 'https://example.com/updated' }); // changed fields only
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

/** Run `fn` with the process timezone forced (restores it after) — makes TZ-dependent bugs bite on any machine. */
async function withTz(zone: string, fn: () => void | Promise<void>): Promise<void> {
    const prev = process.env.TZ;
    process.env.TZ = zone;
    try { await fn(); } finally {
        if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
    }
}

describe('isoToLocalInput', () => {
    it('round-trips to the same instant (to the minute) in every timezone', async () => {
        const instants = ['2026-08-15T14:30:00.000Z', '2026-01-10T03:05:00.000Z', '2026-12-31T23:59:00.000Z'];
        for (const zone of ['UTC', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland']) {
            await withTz(zone, () => {
                for (const iso of instants) {
                    expect(new Date(isoToLocalInput(iso)).toISOString()).toBe(`${iso.slice(0, 16)}:00.000Z`);
                }
            });
        }
    });

    it('formats local wall-clock time (not the UTC digits) and tolerates junk', async () => {
        await withTz('America/New_York', () => {
            expect(isoToLocalInput('2026-08-15T14:30:00.000Z')).toBe('2026-08-15T10:30'); // EDT = UTC-4
        });
        expect(isoToLocalInput('not-a-date')).toBe('');
    });
});

describe('ShortLinks widget — built-in mode (default backend)', () => {
    it('hides every Dub-only control and never fetches tags or domains', async () => {
        vi.stubEnv('VITE_DUB_WORKSPACE', 'dwellium');
        const calls = stubBackend([BUILTIN_LINK], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());

        expect(screen.queryByLabelText('Domain')).not.toBeInTheDocument();
        expect(screen.queryByText(/^Tags/, { selector: 'summary' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('New tag name')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Filter by tag')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Expires at')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Open in Dub/i })).not.toBeInTheDocument();
        expect(screen.getByText('UTM builder')).toBeInTheDocument(); // stays — folded into the URL
        expect(screen.getByLabelText('Link presets')).toBeInTheDocument();
        expect(calls.some(c => /\/api\/links\/(tags|domains)/.test(c.url))).toBe(false);
    });

    it('shows no Tags column, asks for no sparkline, and presets send no tagNames', async () => {
        const calls = stubBackend([{ ...BUILTIN_LINK, clicks: 7 }], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        expect(screen.queryByRole('columnheader', { name: 'Tags' })).not.toBeInTheDocument();
        expect(screen.getAllByRole('row')[1].querySelectorAll('td')).toHaveLength(4);

        fireEvent.click(screen.getByRole('button', { name: '+ Maintenance request' }));
        await waitFor(() => expect(calls.some(c => c.method === 'POST')).toBe(true));
        expect(calls.find(c => c.method === 'POST')?.body).not.toHaveProperty('tagNames');
        expect(calls.some(c => c.url.includes('/api/links/analytics'))).toBe(false);
    });

    it('QR for a row with no hosted qrCode is a client-side data: URI image', async () => {
        stubBackend([BUILTIN_LINK], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Show QR for ${BUILTIN_LINK.shortLink}` }));
        const qr = screen.getByAltText(`QR code for ${BUILTIN_LINK.shortLink}`) as HTMLImageElement;
        expect(qr.src.startsWith('data:image/svg+xml')).toBe(true);
    });

    it('create folds UTM params into the destination URL and sends only {url, key?}', async () => {
        const calls = stubBackend([], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/notice?ref=door' } });
        fireEvent.change(screen.getByLabelText('Custom key'), { target: { value: 'notice1' } });
        fireEvent.change(screen.getByLabelText('utm_source'), { target: { value: 'door-qr' } });
        fireEvent.change(screen.getByLabelText('utm_campaign'), { target: { value: 'spring sale' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

        await waitFor(() => expect(calls.some(c => c.method === 'POST')).toBe(true));
        const body = calls.find(c => c.method === 'POST')!.body!;
        expect(body).toEqual({
            url: 'https://example.com/notice?ref=door&utm_source=door-qr&utm_campaign=spring+sale',
            key: 'notice1',
        });
        for (const k of ['utm_source', 'tagNames', 'expiresAt', 'domain']) expect(body).not.toHaveProperty(k);
    });

    it('create without UTM leaves the destination untouched (no URL normalisation)', async () => {
        const calls = stubBackend([], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
        await waitFor(() => expect(calls.some(c => c.method === 'POST')).toBe(true));
        expect(calls.find(c => c.method === 'POST')!.body).toEqual({ url: 'https://example.com' });
    });

    it('the door sheet offers no "Mint short links" (bulk answers 501 in this mode)', async () => {
        stubBackend([BUILTIN_LINK], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Door sheet/i }));
        fireEvent.click(screen.getByRole('button', { name: /Generate sheet/i }));
        expect(screen.getByTestId('qr-door-sheet-print')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Mint short links/i })).not.toBeInTheDocument();
    });

    it('edit offers the destination URL only and saves {url}', async () => {
        const calls = stubBackend([BUILTIN_LINK], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Edit ${BUILTIN_LINK.shortLink}` }));
        expect(screen.queryByLabelText('Edit key')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Edit expiry')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Edit destination URL'), { target: { value: 'https://example.com/b' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(calls.some(c => c.method === 'PATCH')).toBe(true));
        expect(calls.find(c => c.method === 'PATCH')!.body).toEqual({ url: 'https://example.com/b' });
    });
});

describe('ShortLinks widget — Dub-mode edit sends only what changed', () => {
    const WITH_EXPIRY = { ...LINK, expiresAt: EXPIRY_ISO };
    const openEdit = async () => {
        const calls = stubBackend([WITH_EXPIRY]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Edit ${LINK.shortLink}` }));
        return calls;
    };
    const patches = (calls: Recorded[]) => calls.filter(c => c.method === 'PATCH');

    it('the expiry field opens on the local wall-clock time of the stored instant', async () => {
        await withTz('America/New_York', async () => {
            await openEdit();
            expect((screen.getByLabelText('Edit expiry') as HTMLInputElement).value).toBe('2026-08-15T10:30');
        });
    });

    it('editing only the URL leaves expiresAt and tagNames out of the PATCH', async () => {
        const calls = await openEdit();
        fireEvent.change(screen.getByLabelText('Edit destination URL'), { target: { value: 'https://example.com/moved' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(patches(calls)).toHaveLength(1));
        expect(patches(calls)[0].body).toEqual({ url: 'https://example.com/moved' });
    });

    it('changing the expiry sends that local time as the right ISO instant', async () => {
        await withTz('America/New_York', async () => {
            const calls = await openEdit();
            fireEvent.change(screen.getByLabelText('Edit expiry'), { target: { value: '2026-09-01T09:15' } });
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
            await waitFor(() => expect(patches(calls)).toHaveLength(1));
            expect(patches(calls)[0].body).toEqual({ expiresAt: '2026-09-01T13:15:00.000Z' }); // EDT = UTC-4
        });
    });

    it('clearing the expiry sends expiresAt: null and nothing else', async () => {
        const calls = await openEdit();
        fireEvent.change(screen.getByLabelText('Edit expiry'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(patches(calls)).toHaveLength(1));
        expect(patches(calls)[0].body).toEqual({ expiresAt: null });
    });

    it('changing the tag set sends tagNames; the URL and expiry stay out', async () => {
        const calls = await openEdit();
        const editForm = screen.getByLabelText(`Edit form for ${LINK.shortLink}`);
        fireEvent.click(within(editForm).getByLabelText('riverwood-club'));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(patches(calls)).toHaveLength(1));
        expect(patches(calls)[0].body).toEqual({ tagNames: ['woodland-parc', 'riverwood-club'] });
    });

    it('saving with nothing changed sends no request and closes the editor', async () => {
        const calls = await openEdit();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(screen.queryByLabelText('Edit destination URL')).not.toBeInTheDocument());
        expect(patches(calls)).toHaveLength(0);
    });
});

describe('ShortLinks widget — refresh never throws away work in progress', () => {
    /** Wait until `n` list GETs have happened and the render settled after the last one. */
    const listGets = (calls: Recorded[]) => calls.filter(isListGet).length;

    it('an open inline edit with typed text survives a preset click (create + refresh)', async () => {
        const calls = stubBackend([LINK]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Edit ${LINK.shortLink}` }));
        fireEvent.change(screen.getByLabelText('Edit destination URL'), { target: { value: 'https://example.com/typing' } });

        fireEvent.click(screen.getByRole('button', { name: '+ Maintenance request' }));
        await waitFor(() => expect(screen.getByText(/^Created /)).toBeInTheDocument());
        await waitFor(() => expect(listGets(calls)).toBeGreaterThanOrEqual(2));
        await waitFor(() => expect(screen.getByText(LINK.shortLink)).toBeInTheDocument());

        expect((screen.getByLabelText('Edit destination URL') as HTMLInputElement).value).toBe('https://example.com/typing');
    });

    it('the list stays on screen while "Show archived" re-fetches', async () => {
        let release: (r: Response) => void = () => {};
        const calls: Recorded[] = [];
        let listCount = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            const rec = { url: String(url), method: init?.method ?? 'GET' };
            calls.push(rec);
            if (isListGet(rec)) {
                listCount += 1;
                if (listCount === 2) return new Promise<Response>(res => { release = res; });
                return jsonResponse({ success: true, data: [LINK] });
            }
            if (rec.url.includes('/api/links/tags')) return jsonResponse({ success: true, data: TAGS });
            if (rec.url.includes('/api/links/domains')) return jsonResponse({ success: true, data: DOMAINS, defaultDomain: null });
            return jsonResponse({ success: true, data: TIMESERIES });
        }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(LINK.shortLink)).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/draft' } });

        fireEvent.click(screen.getByLabelText('Show archived'));
        await waitFor(() => expect(listCount).toBe(2));
        expect(screen.getByText(LINK.shortLink)).toBeInTheDocument(); // old rows still shown
        expect(screen.queryByText('Loading links…')).not.toBeInTheDocument();
        expect((screen.getByLabelText('Destination URL') as HTMLInputElement).value).toBe('https://example.com/draft');
        release(jsonResponse({ success: true, data: [LINK] }));
        await waitFor(() => expect(screen.getByText(LINK.shortLink)).toBeInTheDocument());
    });

    it('a successful preset click leaves text typed in the composer untouched', async () => {
        const calls = stubBackend([]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByLabelText('Preset property')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/half-typed' } });
        fireEvent.change(screen.getByLabelText('Custom key'), { target: { value: 'half' } });
        fireEvent.change(screen.getByLabelText('utm_source'), { target: { value: 'flyer' } });

        fireEvent.click(screen.getByRole('button', { name: '+ Resident portal' }));
        await waitFor(() => expect(screen.getByText(/^Created /)).toBeInTheDocument());
        await waitFor(() => expect(listGets(calls)).toBeGreaterThanOrEqual(2));

        expect((screen.getByLabelText('Destination URL') as HTMLInputElement).value).toBe('https://example.com/half-typed');
        expect((screen.getByLabelText('Custom key') as HTMLInputElement).value).toBe('half');
        expect((screen.getByLabelText('utm_source') as HTMLInputElement).value).toBe('flyer');
    });

    it('a successful composer submit clears the composer; a refused one keeps it', async () => {
        const calls = stubBackend([]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/ok' } });
        fireEvent.change(screen.getByLabelText('Custom key'), { target: { value: 'ok' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
        await waitFor(() => expect(screen.getByText(/^Created /)).toBeInTheDocument());
        expect((screen.getByLabelText('Destination URL') as HTMLInputElement).value).toBe('');
        expect((screen.getByLabelText('Custom key') as HTMLInputElement).value).toBe('');
        expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
    });

    it('a refused composer submit keeps what was typed', async () => {
        stubBackend([], {}, { postStatus: 400 });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/nope' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
        await waitFor(() => expect(screen.getByText('Create refused')).toBeInTheDocument());
        expect((screen.getByLabelText('Destination URL') as HTMLInputElement).value).toBe('https://example.com/nope');
    });

    it('overlapping list responses resolved out of order leave the NEWER one on screen', async () => {
        const pending: Array<(r: Response) => void> = [];
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            const rec = { url: String(url), method: init?.method ?? 'GET' };
            if (isListGet(rec)) return new Promise<Response>(res => { pending.push(res); });
            if (rec.url.includes('/api/links/tags')) return jsonResponse({ success: true, data: TAGS });
            if (rec.url.includes('/api/links/domains')) return jsonResponse({ success: true, data: DOMAINS, defaultDomain: null });
            return jsonResponse({ success: true, data: [] });
        }));
        render(<ShortLinks />);
        await waitFor(() => expect(pending).toHaveLength(1)); // mount refresh (older)
        fireEvent.click(screen.getByRole('button', { name: 'Refresh short links' }));
        await waitFor(() => expect(pending).toHaveLength(2)); // manual refresh (newer)

        pending[1](jsonResponse({ success: true, data: [LINK_2] })); // newer lands first
        await waitFor(() => expect(screen.getByText(LINK_2.shortLink)).toBeInTheDocument());
        pending[0](jsonResponse({ success: true, data: [LINK] })); // stale one lands late
        await new Promise(r => setTimeout(r, 30));
        expect(screen.getByText(LINK_2.shortLink)).toBeInTheDocument();
        expect(screen.queryByText(LINK.shortLink)).not.toBeInTheDocument();
    });
});
