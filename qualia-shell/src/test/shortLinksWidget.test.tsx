/**
 * ShortLinks ("Links & QR") widget + shortLinksApi client
 * (plan 047 phase 2, extended for plan 053; plan 077 phase 1).
 *
 * Backend 503 with `needsSetup:true` (OLD backend) → typed needs-setup result
 * and a card whose button opens the Tools hub; any other 503 → ordinary error.
 * 200 → link table with click counts, tags, clicks sparkline (/analytics
 * timeseries), QR toggle, inline edit (PATCH, changed fields only),
 * confirm-gated archive, tag filter; link presets POST tagged links to the
 * per-property destinations the user entered (disabled until set; plan 077
 * phase 2); the QR door sheet mints short links first, then renders one cell
 * per unit encoding the short link (destination fallback with a notice when the
 * mint fails); Download SVG on the QR row; network failure → error state with
 * Retry. `mode:'builtin'` (default backend) folds UTM params into the
 * destination URL and never shows the domain picker, key edit or "Open in Dub".
 *
 * Plan 077 phase 3: expiry, tags (picker, filter, column) and the sparkline are
 * gated on the list response's `features` — not the mode — so an OLDER built-in
 * backend (no `features`) still hides them; client-side search; focus
 * management and live-region a11y; a failed background refresh keeps the list;
 * a 409 on a preset says the key may be archived.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patchWidgetMemory, readWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ShortLinks, { isoToLocalInput } from '../components/ShortLinks/ShortLinks';
import { doorSheetHtml, printDoorSheet, unitUrl } from '../components/ShortLinks/QrDoorSheet';
import { qrSvg } from '../components/Scribe/idocs/blocks/qr';
import { ANDY_PROPERTIES, presetKey, unitKey, ANDY_LINK_PRESETS, type DestinationsMemory } from '../components/ShortLinks/andyLinkPresets';
import {
    archiveShortLink,
    bulkCreateShortLinks,
    createShortLink,
    getClicksTimeseries,
    listLinkDomains,
    listLinkTags,
    listShortLinks,
    updateShortLink,
    type LinkFeature,
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
const ALL = new Set<LinkFeature>(['expiry', 'tags', 'timeseries']);

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
    /** 'builtin' = the default SQLite shortener: `mode` on every body, no tags; /bulk answers 200 with rows echoing {url,key}. */
    mode?: 'builtin';
    /** Built-in only: what the list response's `features` advertises. Default: all three (omit = an OLD backend: pass []). */
    features?: LinkFeature[];
    /** Status for POST /api/links (create); default 201. */
    postStatus?: number;
    /** Error text for a refused POST /api/links (default 'Create refused'). */
    postError?: string;
    /** Status for POST /api/links/bulk; >= 400 answers {error:'Bulk exploded'}. */
    bulkStatus?: number;
}

/** Where the minted short link of a key lives in the built-in stub. */
const SHORT_BASE = 'https://dwellium.example/l/';
/** Destinations a user would have entered: every preset on both properties. */
const DESTS: DestinationsMemory = Object.fromEntries(ANDY_PROPERTIES.map(p => [p.id, {
    'resident-portal': `https://portal.example.org/${p.id}`,
    maintenance: `https://forms.example.org/${p.id}/maint?unit={unit}`,
    'rent-payment': `https://pay.example.org/${p.id}`,
    'current-notice': `https://notice.example.org/${p.id}`,
}]));
const seedDestinations = (d: DestinationsMemory = DESTS): void => patchWidgetMemory('short-links', { destinations: d });

const isListGet = (c: Recorded): boolean => c.method === 'GET' && /\/api\/links(\?|$)/.test(c.url);

/** Route the widget's fetches by path; records every write for assertion. */
function stubBackend(links: JsonObject[], overrides: JsonObject = {}, opts: StubOpts = {}) {
    const builtin = opts.mode === 'builtin';
    const modeTag = builtin ? { mode: 'builtin' } : {};
    const features = opts.features ?? ['expiry', 'tags', 'timeseries'];
    const calls: Recorded[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url: u, method, body });
        if (u.includes('/api/links/tags')) {
            if (builtin) {
                // Built-in: distinct names in use; POST echoes (nothing is stored until a link carries the tag).
                if (method === 'POST') return jsonResponse({ success: true, ...modeTag, data: { id: body?.name, name: body?.name, color: '' } }, 201);
                const names = [...new Set(links.flatMap(l => ((l.tags ?? []) as Array<{ name: string }>).map(t => t.name)))];
                return jsonResponse({ success: true, ...modeTag, data: names.map(n => ({ id: n, name: n, color: '' })) });
            }
            return method === 'POST'
                ? jsonResponse({ success: true, data: { id: 'tag_new', name: body?.name, color: '' } }, 201)
                : jsonResponse({ success: true, data: TAGS });
        }
        if (u.includes('/api/links/domains')) return jsonResponse({ success: true, data: DOMAINS, defaultDomain: 'go.dwellium.com' });
        if (u.includes('/api/links/analytics')) return jsonResponse({ success: true, groupBy: 'timeseries', data: TIMESERIES });
        if (u.includes('/api/links/bulk')) {
            if (opts.bulkStatus && opts.bulkStatus >= 400) return jsonResponse({ success: false, error: 'Bulk exploded' }, opts.bulkStatus);
            const sent = (body?.links ?? []) as JsonObject[];
            if (builtin) {
                const data = sent.map((l, i) => ({ ...BUILTIN_LINK, id: `blk_${i}`, url: l.url, key: l.key, shortLink: SHORT_BASE + String(l.key) }));
                return jsonResponse({ success: true, ...modeTag, data });
            }
            return jsonResponse({ success: true, data: sent.map((l, i) => ({ ...LINK, id: `blk_${i}`, url: l.url, key: l.key })) }, 201);
        }
        if (method === 'PATCH') return jsonResponse({ success: true, data: { ...LINK, ...overrides, ...body } });
        if (method === 'POST') {
            if (opts.postStatus && opts.postStatus >= 400) return jsonResponse({ success: false, error: opts.postError ?? 'Create refused' }, opts.postStatus);
            return jsonResponse({ success: true, ...modeTag, data: { ...LINK, id: 'link_new', ...body } }, 201);
        }
        return jsonResponse({ success: true, ...modeTag, ...(builtin ? { features } : {}), data: links });
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
        expect(await listShortLinks()).toEqual({ kind: 'ok', data: { links: [BUILTIN_LINK], mode: 'builtin', features: new Set() } }); // an old backend lists none
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [LINK] })));
        expect(await listShortLinks()).toEqual({ kind: 'ok', data: { links: [LINK], mode: 'dub', features: ALL } });
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, mode: 'something-else', data: [] })));
        expect(await listShortLinks()).toEqual({ kind: 'ok', data: { links: [], mode: 'dub', features: ALL } });
    });

    it('200 → data; non-ok surfaces the backend error; network failure → Backend unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [LINK] })));
        expect(await listShortLinks()).toEqual({ kind: 'ok', data: { links: [LINK], mode: 'dub', features: ALL } });
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
    const PRESET_LABELS = ANDY_LINK_PRESETS.map(p => `+ ${p.label}`);
    const openLinks = async (opts: StubOpts = {}) => {
        const calls = stubBackend([], {}, opts);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByLabelText('Preset property')).toBeInTheDocument());
        return calls;
    };

    it('are disabled, with a title saying why, until the destination is entered', async () => {
        const calls = await openLinks();
        for (const name of PRESET_LABELS) {
            const btn = screen.getByRole('button', { name });
            expect(btn).toBeDisabled();
            expect(btn.className).toContain('short-links__btn--disabled-hint');
            expect(btn).toHaveAttribute('title', `Set the ${name.slice(2)} destination for this property first`);
        }
        fireEvent.click(screen.getByRole('button', { name: '+ Maintenance request' }));
        expect(calls.some(c => c.method === 'POST')).toBe(false);
    });

    it('typing a destination enables that preset, persists in widget memory, and one click POSTs that exact URL with the derived key + tags', async () => {
        const calls = await openLinks();
        fireEvent.change(screen.getByLabelText('Preset property'), { target: { value: 'riverwood-club' } });
        fireEvent.change(screen.getByLabelText('Maintenance request destination'), { target: { value: ' https://forms.example.org/riverwood?x=1 ' } });

        const btn = screen.getByRole('button', { name: '+ Maintenance request' });
        expect(btn).toBeEnabled();
        expect(btn).not.toHaveAttribute('title');
        expect(screen.getByRole('button', { name: '+ Rent payment' })).toBeDisabled(); // only the entered one
        expect(readWidgetMemory('short-links', { mode: 'links', destinations: {} }).destinations)
            .toEqual({ 'riverwood-club': { maintenance: ' https://forms.example.org/riverwood?x=1 ' } });

        fireEvent.click(btn);
        await waitFor(() => expect(calls.some(c => c.method === 'POST')).toBe(true));
        const property = ANDY_PROPERTIES.find(p => p.id === 'riverwood-club')!;
        const preset = ANDY_LINK_PRESETS.find(p => p.id === 'maintenance')!;
        expect(calls.find(c => c.method === 'POST')!.body).toEqual({
            url: 'https://forms.example.org/riverwood?x=1', // trimmed, otherwise exactly what was typed
            key: presetKey(property, preset),
            tagNames: [property.tag, preset.kindTag],
        });
    });

    it('destinations are per property: entering one for A leaves B disabled and keeps A when B is edited', async () => {
        await openLinks();
        fireEvent.change(screen.getByLabelText('Resident portal destination'), { target: { value: 'https://portal.example.org/a' } });
        expect(screen.getByRole('button', { name: '+ Resident portal' })).toBeEnabled();

        fireEvent.change(screen.getByLabelText('Preset property'), { target: { value: 'riverwood-club' } });
        expect(screen.getByRole('button', { name: '+ Resident portal' })).toBeDisabled();
        expect((screen.getByLabelText('Resident portal destination') as HTMLInputElement).value).toBe('');
        fireEvent.change(screen.getByLabelText('Rent payment destination'), { target: { value: 'https://pay.example.org/b' } });

        expect(readWidgetMemory('short-links', { mode: 'links', destinations: {} }).destinations).toEqual({
            'woodland-parc': { 'resident-portal': 'https://portal.example.org/a' },
            'riverwood-club': { 'rent-payment': 'https://pay.example.org/b' },
        });
        fireEvent.change(screen.getByLabelText('Preset property'), { target: { value: 'woodland-parc' } });
        expect(screen.getByRole('button', { name: '+ Resident portal' })).toBeEnabled();
    });

    it('a non-http value shows the hint and keeps the preset disabled', async () => {
        await openLinks();
        const input = screen.getByLabelText('Rent payment destination');
        expect(screen.queryByText('must start with http:// or https://')).not.toBeInTheDocument();
        fireEvent.change(input, { target: { value: 'ftp://pay.example.org' } });
        expect(screen.getByText('must start with http:// or https://')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '+ Rent payment' })).toBeDisabled();
        fireEvent.change(input, { target: { value: 'https://pay.example.org' } });
        expect(screen.queryByText('must start with http:// or https://')).not.toBeInTheDocument();
    });

    it('survives a corrupt (non-object) destinations slice: nothing entered, nothing thrown', async () => {
        patchWidgetMemory('short-links', { destinations: 'garbage' });
        await openLinks();
        expect(screen.getByRole('button', { name: '+ Maintenance request' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Maintenance request destination'), { target: { value: 'https://forms.example.org/x' } });
        expect(screen.getByRole('button', { name: '+ Maintenance request' })).toBeEnabled();
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
    const WP = ANDY_PROPERTIES[0];
    const RW = ANDY_PROPERTIES.find(p => p.id === 'riverwood-club')!;
    const wpPattern = DESTS['woodland-parc'].maintenance!;
    /** Innerhtml-normalised markup, so a rendered cell compares equal to qrSvg() regardless of serializer quirks. */
    const markup = (svg: string | null): string => { const d = document.createElement('div'); d.innerHTML = svg ?? ''; return d.innerHTML; };
    const cellQr = (cell: HTMLElement): string => cell.querySelector('svg')!.parentElement!.innerHTML;
    const open = async (opts: StubOpts & { links?: JsonObject[] } = {}) => {
        const { links, ...stub } = opts;
        const calls = stubBackend(links ?? [BUILTIN_LINK], {}, stub);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByRole('button', { name: /Door sheet/i })).toBeInTheDocument());
        await waitFor(() => expect(screen.queryByText('Loading links…')).not.toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Door sheet/i }));
        return calls;
    };
    const generate = async () => {
        fireEvent.click(screen.getByRole('button', { name: /Generate sheet/i }));
        return await screen.findByTestId('qr-door-sheet-print');
    };
    const bulks = (calls: Recorded[]) => calls.filter(c => c.url.includes('/api/links/bulk'));
    const unitKeys = (units: string[]) => units.map(u => `woodland-parc-unit-${u}`);

    it('substitutes {unit} (URL-encoded) into the destination pattern', () => {
        expect(unitUrl('https://x.test/?unit={unit}', 'B03')).toBe('https://x.test/?unit=B03');
        expect(unitUrl('https://x.test/?unit={unit}&u={unit}', '2794-5')).toBe('https://x.test/?unit=2794-5&u=2794-5');
        expect(unitUrl('https://x.test/?unit={unit}', 'A 1')).toBe('https://x.test/?unit=A%201');
        expect(unitUrl('https://x.test/maint', 'B03')).toBe('https://x.test/maint'); // {unit} is optional
    });

    it('prefills the pattern from the property\'s maintenance destination and re-prefills on property change', async () => {
        seedDestinations();
        await open();
        expect((screen.getByLabelText('Destination pattern') as HTMLInputElement).value).toBe(wpPattern);
        fireEvent.change(screen.getByLabelText('Destination pattern'), { target: { value: 'https://typed.example/x' } });
        fireEvent.change(screen.getByLabelText('Property'), { target: { value: 'riverwood-club' } });
        expect((screen.getByLabelText('Destination pattern') as HTMLInputElement).value).toBe(DESTS['riverwood-club'].maintenance);
    });

    it('with no maintenance destination Generate is disabled and the hint says where to set one', async () => {
        await open();
        expect((screen.getByLabelText('Destination pattern') as HTMLInputElement).value).toBe('');
        expect(screen.getByRole('button', { name: /Generate sheet/i })).toBeDisabled();
        expect(screen.getByText('Set a maintenance destination for this property (Destinations, in the links view) or type one here')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Destination pattern'), { target: { value: 'https://typed.example/maint' } });
        expect(screen.getByRole('button', { name: /Generate sheet/i })).toBeEnabled();
        fireEvent.change(screen.getByLabelText('Destination pattern'), { target: { value: 'not a url' } });
        expect(screen.getByRole('button', { name: /Generate sheet/i })).toBeDisabled();
    });

    it('mints first (builtin: {url,key,title}, no tagNames), then each cell encodes the SHORT link and prints short URL + destination', async () => {
        seedDestinations();
        const calls = await open({ mode: 'builtin' });
        fireEvent.change(screen.getByLabelText('Units'), { target: { value: '101\n102\n103' } });
        const sheet = await generate();

        expect(bulks(calls)).toHaveLength(1);
        const sent = bulks(calls)[0].body?.links as JsonObject[];
        expect(sent).toEqual(['101', '102', '103'].map(u => ({
            url: unitUrl(wpPattern, u),
            key: `woodland-parc-unit-${u}`,
            title: `Woodland Parc Townhomes unit ${u}`,
        })));
        for (const l of sent) expect(l).not.toHaveProperty('tagNames');

        const cells = within(sheet).getAllByTestId('qr-door-sheet-cell');
        expect(cells).toHaveLength(3);
        ['101', '102', '103'].forEach((u, i) => {
            const short = `${SHORT_BASE}woodland-parc-unit-${u}`;
            const dest = unitUrl(wpPattern, u);
            const title = `QR code for unit ${u}`;
            expect(cellQr(cells[i])).toBe(markup(qrSvg(short, { size: 160, title })));
            expect(cellQr(cells[i])).not.toBe(markup(qrSvg(dest, { size: 160, title }))); // not the destination
            expect(within(cells[i]).getByText(`Unit ${u}`)).toBeInTheDocument();
            expect(cells[i].querySelector('.qr-door-sheet__short')!.textContent).toBe(short);
            expect(cells[i].querySelector('.qr-door-sheet__url')!.textContent).toBe(dest);
        });
        expect(within(sheet).queryByText(/Short links unavailable/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Mint short links/i })).not.toBeInTheDocument();
    });

    it('in Dub mode the bulk request also carries the property + door-qr tags', async () => {
        seedDestinations();
        const calls = await open({ links: [LINK] });
        fireEvent.change(screen.getByLabelText('Units'), { target: { value: '101' } });
        await generate();
        expect(bulks(calls)[0].body?.links).toEqual([{
            url: unitUrl(wpPattern, '101'),
            key: 'woodland-parc-unit-101',
            title: 'Woodland Parc Townhomes unit 101',
            tagNames: [WP.tag, 'door-qr'],
        }]);
    });

    it('{unit} is optional: a pattern without it still generates — same destination everywhere, distinct keys', async () => {
        const calls = await open({ mode: 'builtin' });
        fireEvent.change(screen.getByLabelText('Destination pattern'), { target: { value: 'https://forms.example.org/maint' } });
        fireEvent.change(screen.getByLabelText('Units'), { target: { value: 'A1\nA2' } });
        const sheet = await generate();
        const sent = bulks(calls)[0].body?.links as JsonObject[];
        expect(sent.map(l => l.url)).toEqual(['https://forms.example.org/maint', 'https://forms.example.org/maint']);
        expect(sent.map(l => l.key)).toEqual(['woodland-parc-unit-a1', 'woodland-parc-unit-a2']);
        const dests = within(sheet).getAllByTestId('qr-door-sheet-cell').map(c => c.querySelector('.qr-door-sheet__url')!.textContent);
        expect(dests).toEqual(['https://forms.example.org/maint', 'https://forms.example.org/maint']);
    });

    it('renders the sheet for the property picked (Riverwood roster, Riverwood keys)', async () => {
        seedDestinations();
        const calls = await open({ mode: 'builtin' });
        fireEvent.change(screen.getByLabelText('Property'), { target: { value: 'riverwood-club' } });
        const sheet = await generate();
        expect(within(sheet).getAllByTestId('qr-door-sheet-cell')).toHaveLength(RW.units.length);
        expect((bulks(calls)[0].body?.links as JsonObject[]).map(l => l.key)).toEqual(RW.units.map(u => `riverwood-club-unit-${u.toLowerCase()}`));
        expect(within(sheet).getByText(/Riverwood Club Apartments — unit QR codes/)).toBeInTheDocument();
    });

    it('the sheet is a snapshot: editing the pattern or roster afterwards changes nothing until Generate again', async () => {
        seedDestinations();
        const calls = await open({ mode: 'builtin' });
        fireEvent.change(screen.getByLabelText('Units'), { target: { value: '101\n102' } });
        const sheet = await generate();
        const before = sheet.innerHTML;

        fireEvent.change(screen.getByLabelText('Destination pattern'), { target: { value: 'https://changed.example/z?u={unit}' } });
        fireEvent.change(screen.getByLabelText('Units'), { target: { value: '201\n202\n203' } });
        expect(screen.getByTestId('qr-door-sheet-print').innerHTML).toBe(before);
        expect(bulks(calls)).toHaveLength(1); // no re-mint either

        await generate();
        expect(within(screen.getByTestId('qr-door-sheet-print')).getAllByTestId('qr-door-sheet-cell')).toHaveLength(3);
        expect(bulks(calls)).toHaveLength(2);
        expect(String((bulks(calls)[1].body?.links as JsonObject[])[0].url)).toContain('changed.example');
    });

    it('a failed bulk mint: cells encode the destination, and the fallback notice is inside the printed area', async () => {
        seedDestinations();
        await open({ mode: 'builtin', bulkStatus: 500 });
        fireEvent.change(screen.getByLabelText('Units'), { target: { value: '101\n102' } });
        const sheet = await generate();

        const notice = within(sheet).getByText('Short links unavailable (Bulk exploded) — these codes point straight at the destination');
        expect(notice.className).toContain('qr-door-sheet__fallback');
        const cells = within(sheet).getAllByTestId('qr-door-sheet-cell');
        expect(cells).toHaveLength(2);
        for (const [i, u] of ['101', '102'].entries()) {
            const dest = unitUrl(wpPattern, u);
            expect(cellQr(cells[i])).toBe(markup(qrSvg(dest, { size: 160, title: `QR code for unit ${u}` })));
            expect(cells[i].querySelector('.qr-door-sheet__short')!.textContent).toBe(dest);
            expect(cells[i].querySelector('.qr-door-sheet__url')).toBeNull(); // no second line when there is no short link
        }
    });

    it('with the backend unreachable (error state) the door sheet still prints destination codes — and sends no bulk request', async () => {
        seedDestinations();
        const calls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => { calls.push(String(url)); throw new Error('offline'); }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Door sheet/i }));
        fireEvent.change(screen.getByLabelText('Units'), { target: { value: '101' } });
        const sheet = await generate();

        expect(within(sheet).getByText(/Short links unavailable \(the backend is not reachable\)/)).toBeInTheDocument();
        const dest = unitUrl(wpPattern, '101');
        expect(cellQr(within(sheet).getByTestId('qr-door-sheet-cell'))).toBe(markup(qrSvg(dest, { size: 160, title: 'QR code for unit 101' })));
        expect(calls.some(u => u.includes('/api/links/bulk'))).toBe(false);
    });

    it('seeded roster renders one cell per unit with a client-side svg each', async () => {
        seedDestinations();
        await open({ mode: 'builtin' });
        fireEvent.change(screen.getByLabelText('Property'), { target: { value: 'riverwood-club' } });
        const sheet = await generate();
        const cells = within(sheet).getAllByTestId('qr-door-sheet-cell');
        expect(cells).toHaveLength(RW.units.length);
        for (const unit of RW.units) expect(within(sheet).getByText(`Unit ${unit}`)).toBeInTheDocument();
        expect(sheet.querySelectorAll('svg')).toHaveLength(cells.length);
    });

    it('shows a Generating… state while the mint is in flight and disables the button', async () => {
        seedDestinations();
        let release: (r: Response) => void = () => {};
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
            if (String(url).includes('/api/links/bulk')) return new Promise<Response>(res => { release = res; });
            return jsonResponse({ success: true, mode: 'builtin', data: [] });
        }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByRole('button', { name: /Door sheet/i })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Door sheet/i }));
        fireEvent.click(screen.getByRole('button', { name: /Generate sheet/i }));
        const busy = await screen.findByRole('button', { name: /Generating…/ });
        expect(busy).toBeDisabled();
        expect(screen.queryByTestId('qr-door-sheet-print')).not.toBeInTheDocument(); // nothing renders before the mint lands
        release(jsonResponse({ success: true, mode: 'builtin', data: [] }));
        await screen.findByTestId('qr-door-sheet-print');
    });
});

describe('Download SVG', () => {
    it('the QR row offers <a download="<key>.svg"> with a client-side data:image/svg+xml href (builtin and Dub)', async () => {
        stubBackend([BUILTIN_LINK], {}, { mode: 'builtin' });
        const { unmount } = render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        expect(screen.queryByRole('link', { name: 'Download SVG' })).not.toBeInTheDocument(); // only with the QR open
        fireEvent.click(screen.getByRole('button', { name: `Show QR for ${BUILTIN_LINK.shortLink}` }));
        const a = screen.getByRole('link', { name: 'Download SVG' });
        expect(a).toHaveAttribute('download', 'abc.svg');
        expect(a.getAttribute('href')!.startsWith('data:image/svg+xml')).toBe(true);
        expect(decodeURIComponent(a.getAttribute('href')!)).toContain('<svg');
        unmount();

        stubBackend([LINK]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Show QR for ${LINK.shortLink}` }));
        const dub = screen.getByRole('link', { name: 'Download SVG' });
        expect(dub).toHaveAttribute('download', 'notice1.svg');
        expect(dub.getAttribute('href')!.startsWith('data:image/svg+xml')).toBe(true); // still client-side, though Dub hosts a PNG
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
    it('older built-in backend hides expiry, tags and the tag filter, and never fetches tags, domains or analytics', async () => {
        vi.stubEnv('VITE_DUB_WORKSPACE', 'dwellium');
        const calls = stubBackend([{ ...BUILTIN_LINK, clicks: 5 }], {}, { mode: 'builtin', features: [] });
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
        expect(calls.some(c => /\/api\/links\/(tags|domains|analytics)/.test(c.url))).toBe(false);
    });

    it('older built-in backend shows no Tags column, asks for no sparkline, and presets send no tagNames', async () => {
        seedDestinations();
        const calls = stubBackend([{ ...BUILTIN_LINK, clicks: 7 }], {}, { mode: 'builtin', features: [] });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        expect(screen.queryByRole('columnheader', { name: 'Tags' })).not.toBeInTheDocument();
        expect(screen.getAllByRole('row')[1].querySelectorAll('td')).toHaveLength(4);

        fireEvent.click(screen.getByRole('button', { name: '+ Rent payment' }));
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
            url: 'https://example.com/notice?ref=door&utm_source=door-qr&utm_campaign=spring%20sale',
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

    it('older built-in backend: edit offers the destination URL only and saves {url}', async () => {
        const calls = stubBackend([BUILTIN_LINK], {}, { mode: 'builtin', features: [] });
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
        // Forced non-UTC zone: under UTC a UTC-digits baseline would pass this by accident.
        await withTz('America/New_York', async () => {
            const calls = await openEdit();
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
            await waitFor(() => expect(screen.queryByLabelText('Edit destination URL')).not.toBeInTheDocument());
            expect(patches(calls)).toHaveLength(0);
        });
    });
});

describe('ShortLinks widget — refresh never throws away work in progress', () => {
    /** Wait until `n` list GETs have happened and the render settled after the last one. */
    const listGets = (calls: Recorded[]) => calls.filter(isListGet).length;

    it('an open inline edit with typed text survives a preset click (create + refresh)', async () => {
        seedDestinations();
        const calls = stubBackend([LINK]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Edit ${LINK.shortLink}` }));
        fireEvent.change(screen.getByLabelText('Edit destination URL'), { target: { value: 'https://example.com/typing' } });

        fireEvent.click(screen.getByRole('button', { name: '+ Rent payment' }));
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
        seedDestinations();
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

describe('ShortLinks widget — adversarial-review regressions (plan 077 p1)', () => {
    const openBuiltin = async () => {
        const calls = stubBackend([BUILTIN_LINK], {}, { mode: 'builtin', features: [] });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        return calls;
    };

    it('an untouched edit saved after a refresh changed the row sends nothing (no silent revert of someone else\'s change)', async () => {
        let rows: JsonObject[] = [BUILTIN_LINK];
        const calls: Recorded[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
            return jsonResponse({ success: true, mode: 'builtin', data: rows });
        }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Edit ${BUILTIN_LINK.shortLink}` }));

        rows = [{ ...BUILTIN_LINK, url: 'https://example.com/changed-by-someone-else' }];
        fireEvent.click(screen.getByRole('button', { name: 'Refresh short links' }));
        await waitFor(() => expect(screen.getByText('https://example.com/changed-by-someone-else')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(screen.queryByLabelText('Edit destination URL')).not.toBeInTheDocument());
        expect(calls.filter(c => c.method === 'PATCH')).toHaveLength(0);
    });

    it('"Show archived" stays in charge when a create resolves after it was ticked', async () => {
        let releasePost: ((r: Response) => void) | null = null;
        const gets: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            if ((init?.method ?? 'GET') === 'POST') return new Promise<Response>(res => { releasePost = res; });
            gets.push(String(url));
            return jsonResponse({ success: true, mode: 'builtin', data: [BUILTIN_LINK] });
        }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/new' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
        await waitFor(() => expect(releasePost).not.toBeNull());

        fireEvent.click(screen.getByLabelText('Show archived'));
        await waitFor(() => expect(gets[gets.length - 1]).toContain('showArchived=true'));
        const before = gets.length;
        releasePost!(jsonResponse({ success: true, mode: 'builtin', data: { ...BUILTIN_LINK, id: 'n1', key: 'n1' } }));
        await waitFor(() => expect(gets.length).toBe(before + 1)); // the refresh fired by the create
        expect(gets[gets.length - 1]).toContain('showArchived=true');
    });

    it('a 200 that is not a JSON envelope (a host serving index.html) is an error — never an empty "Dub" workspace', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })));
        expect(await listShortLinks()).toEqual({ kind: 'error', message: 'Backend sent an unexpected response' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        expect(screen.queryByLabelText('Expires at')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Open in Dub/i })).not.toBeInTheDocument();
    });

    it('UTM is appended as text: the typed query and fragment survive byte-for-byte', async () => {
        const calls = await openBuiltin();
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/p?q=a%20b&flag&t=~#frag' } });
        fireEvent.change(screen.getByLabelText('utm_source'), { target: { value: 'door' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
        await waitFor(() => expect(calls.some(c => c.method === 'POST')).toBe(true));
        expect(calls.find(c => c.method === 'POST')!.body).toEqual({ url: 'https://example.com/p?q=a%20b&flag&t=~&utm_source=door#frag' });
    });

    it('QR and the edit form get their own full-width row under the link, outside the actions cell', async () => {
        await openBuiltin();
        fireEvent.click(screen.getByRole('button', { name: `Show QR for ${BUILTIN_LINK.shortLink}` }));
        fireEvent.click(screen.getByRole('button', { name: `Edit ${BUILTIN_LINK.shortLink}` }));
        const cell = screen.getByAltText(`QR code for ${BUILTIN_LINK.shortLink}`).closest('td')!;
        expect(cell.colSpan).toBe(4);
        expect(cell.contains(screen.getByLabelText('Edit destination URL'))).toBe(true);
        expect(cell.className).not.toContain('short-links__actions');
        expect(cell.closest('tr')!.previousElementSibling!.textContent).toContain(BUILTIN_LINK.shortLink);
    });
});

describe('door sheet print document (plan 077 p2.7)', () => {
    const gen = {
        propertyName: 'Woodland <Parc>',
        pattern: 'https://m.example/?u={unit}',
        cells: [
            { unit: 'A01', url: 'https://m.example/?u=A01', short: 'https://go.dwellium.test/l/woodland-parc-a01' },
            { unit: '<img src=x onerror=alert(1)>', url: 'https://m.example/?u=x"', short: null },
        ],
        fallback: 'Short links unavailable (boom) — these codes point straight at the destination',
    };

    it('is a self-contained document: one cell per unit, the SHORT link encoded, user text escaped', () => {
        const html = doorSheetHtml(gen);
        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html.match(/<figure class="cell">/g)).toHaveLength(2);
        expect(html).toContain(qrSvg('https://go.dwellium.test/l/woodland-parc-a01', { size: 160, title: 'QR code for unit A01' }));
        expect(html).toContain('Woodland &lt;Parc&gt;');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('<img');
        expect(html).toContain('u=x&quot;');
        expect(html).toContain('class="fallback"');
        expect(html).toContain('@page');
    });

    it('prints from a hidden iframe holding that document and calls print() on it once', async () => {
        const printed: string[] = [];
        printDoorSheet(gen);
        const frame = document.querySelector('iframe[aria-hidden="true"]') as HTMLIFrameElement;
        expect(frame).not.toBeNull();
        expect(frame.srcdoc).toBe(doorSheetHtml(gen));
        // jsdom never loads srcdoc; stand in for the loaded window and fire onload ourselves.
        Object.defineProperty(frame, 'contentWindow', { value: { addEventListener: () => undefined, focus: () => undefined, print: () => printed.push('print') } });
        frame.onload!(new Event('load'));
        expect(printed).toEqual(['print']);
        frame.remove();
    });
});

describe('door sheet + presets — phase 2 review regressions', () => {
    it('refuses a roster where two labels collapse to one key, naming both, and mints nothing', async () => {
        seedDestinations();
        const calls = stubBackend([], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'QR door sheet' }));
        fireEvent.change(screen.getByLabelText('Units'), { target: { value: 'A 1\nA-1\nB03' } });
        fireEvent.click(screen.getByRole('button', { name: /Generate sheet/i }));
        expect(await screen.findByRole('status')).toHaveTextContent('Units "A 1" and "A-1" would share one code (woodland-parc-unit-a-1)');
        expect(screen.queryByTestId('qr-door-sheet-print')).not.toBeInTheDocument();
        expect(calls.some(c => c.url.includes('/api/links/bulk'))).toBe(false);
    });

    it('refuses a label that cannot become a key (too long), naming the unit', async () => {
        seedDestinations();
        stubBackend([], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'QR door sheet' }));
        fireEvent.change(screen.getByLabelText('Units'), { target: { value: 'x'.repeat(80) } });
        fireEvent.click(screen.getByRole('button', { name: /Generate sheet/i }));
        expect(await screen.findByRole('status')).toHaveTextContent(/cannot become a short-link key/);
    });

    it('door keys live in their own namespace: a unit labelled "rent" never gets the rent preset\'s key', () => {
        const p = ANDY_PROPERTIES[0];
        expect(unitKey(p.tag, 'rent')).toBe('woodland-parc-unit-rent');
        expect(unitKey(p.tag, 'rent')).not.toBe(presetKey(p, ANDY_LINK_PRESETS.find(x => x.id === 'rent-payment')!));
    });

    it('a corrupt destination value (number / object) reads as unset instead of crashing the widget', async () => {
        patchWidgetMemory('short-links', { destinations: { 'woodland-parc': { maintenance: 5, 'rent-payment': { a: 1 } } } });
        stubBackend([], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());
        expect(screen.getByRole('button', { name: '+ Maintenance request' })).toBeDisabled();
        expect((screen.getByLabelText('Maintenance request destination') as HTMLInputElement).value).toBe('');
        fireEvent.click(screen.getByRole('button', { name: 'QR door sheet' }));
        expect(screen.getByRole('button', { name: /Generate sheet/i })).toBeDisabled();
    });

    it('a per-unit destination ({unit}) disables the preset with a door-sheet hint but still feeds the door sheet', async () => {
        patchWidgetMemory('short-links', { destinations: { 'woodland-parc': { maintenance: 'https://m.example/?u={unit}' } } });
        stubBackend([], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());
        const btn = screen.getByRole('button', { name: '+ Maintenance request' });
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('title', expect.stringMatching(/per unit/));
        fireEvent.click(screen.getByRole('button', { name: 'QR door sheet' }));
        expect((screen.getByLabelText('Destination pattern') as HTMLInputElement).value).toBe('https://m.example/?u={unit}');
    });

    it('an open door sheet picks up a maintenance destination entered after it mounted', async () => {
        patchWidgetMemory('short-links', { mode: 'sheet' });
        stubBackend([], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await screen.findByLabelText('Destination pattern');
        expect((screen.getByLabelText('Destination pattern') as HTMLInputElement).value).toBe('');
        act(() => { patchWidgetMemory('short-links', { destinations: { 'woodland-parc': { maintenance: 'https://late.example/m' } } }); });
        await waitFor(() => expect((screen.getByLabelText('Destination pattern') as HTMLInputElement).value).toBe('https://late.example/m'));
        expect(screen.getByRole('button', { name: /Generate sheet/i })).toBeEnabled();
    });

    it('a mint that resolves after the property was switched never renders (stale guard), and Generate is usable again', async () => {
        seedDestinations();
        let release: ((r: Response) => void) | null = null;
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            if (String(url).includes('/api/links/bulk')) return new Promise<Response>(res => { release = res; });
            return jsonResponse({ success: true, mode: 'builtin', data: [] });
        }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'QR door sheet' }));
        fireEvent.click(screen.getByRole('button', { name: /Generate sheet/i }));
        await waitFor(() => expect(release).not.toBeNull());
        fireEvent.change(screen.getByLabelText('Property'), { target: { value: ANDY_PROPERTIES[1].id } });
        release!(jsonResponse({ success: true, mode: 'builtin', data: [{ ...BUILTIN_LINK, key: 'woodland-parc-unit-2794-5', shortLink: 'https://x/l/woodland-parc-unit-2794-5' }] }));
        await new Promise(r => setTimeout(r, 30));
        expect(screen.queryByTestId('qr-door-sheet-print')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Generate sheet/i })).toBeEnabled();
    });

    it('the Print button prints the generated sheet (short links) from a hidden iframe', async () => {
        seedDestinations();
        stubBackend([], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(/No links/)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'QR door sheet' }));
        fireEvent.click(screen.getByRole('button', { name: /Generate sheet/i }));
        await screen.findByTestId('qr-door-sheet-print');
        fireEvent.click(screen.getByRole('button', { name: 'Print sheet' }));
        const frame = document.querySelector('iframe[aria-hidden="true"]') as HTMLIFrameElement;
        expect(frame).not.toBeNull();
        expect(frame.srcdoc).toContain('/l/woodland-parc-unit-2794-5');
        expect(frame.srcdoc).toContain(qrSvg('https://dwellium.example/l/woodland-parc-unit-2794-5', { size: 160, title: 'QR code for unit 2794-5' }));
        frame.remove();
    });
});

/** Plan 077 phase 3 — features, search, a11y, refresh failure, 409 hint. */
describe('ShortLinks widget — feature gating (plan 077 p3)', () => {
    const TAGGED = {
        ...BUILTIN_LINK,
        clicks: 7,
        expiresAt: EXPIRY_ISO,
        tags: [{ id: 'woodland-parc', name: 'woodland-parc', color: '' }],
    };
    const open = async (opts: StubOpts, rows: JsonObject[] = [TAGGED]) => {
        const calls = stubBackend(rows, {}, opts);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        return calls;
    };
    const used = (calls: Recorded[], what: RegExp) => calls.some(c => what.test(c.url));

    it('built-in with all three features shows expiry, Tags, the tag filter, the Tags column and the sparkline — and still no Dub-only controls', async () => {
        vi.stubEnv('VITE_DUB_WORKSPACE', 'dwellium');
        const calls = await open({ mode: 'builtin' });
        expect(screen.getByLabelText('Expires at')).toBeInTheDocument();
        expect(screen.getByText(/^Tags/, { selector: 'summary' })).toBeInTheDocument();
        expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Tags' })).not.toBeInTheDocument(); // tags are chips under the short link (no fifth column at 520px)
        expect(screen.getAllByRole('row')[1].querySelector('.short-links__chip')).not.toBeNull();
        expect(screen.getAllByText('woodland-parc').length).toBeGreaterThan(0); // chip in the row
        await waitFor(() => expect(screen.getByLabelText('Clicks sparkline: 3, 9')).toBeInTheDocument());
        expect(used(calls, /\/api\/links\/tags/)).toBe(true);
        expect(used(calls, /\/api\/links\/analytics/)).toBe(true);
        // Dub-only stays Dub-only
        expect(used(calls, /\/api\/links\/domains/)).toBe(false);
        expect(screen.queryByLabelText('Domain')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Open in Dub/i })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: `Edit ${BUILTIN_LINK.shortLink}` }));
        expect(screen.getByLabelText('Edit expiry')).toBeInTheDocument();
        expect(screen.queryByLabelText('Edit key')).not.toBeInTheDocument();
    });

    it('built-in with features: [] (an older backend) hides all of it and makes no /tags or /analytics call', async () => {
        const calls = await open({ mode: 'builtin', features: [] });
        expect(screen.queryByLabelText('Expires at')).not.toBeInTheDocument();
        expect(screen.queryByText(/^Tags/, { selector: 'summary' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Filter by tag')).not.toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Tags' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: `Edit ${BUILTIN_LINK.shortLink}` }));
        expect(screen.queryByLabelText('Edit expiry')).not.toBeInTheDocument();
        await new Promise(r => setTimeout(r, 30));
        expect(used(calls, /\/api\/links\/(tags|analytics|domains)/)).toBe(false);
    });

    it('each feature gates only its own controls', async () => {
        const calls = await open({ mode: 'builtin', features: ['tags'] });
        expect(screen.getByText(/^Tags/, { selector: 'summary' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Expires at')).not.toBeInTheDocument();
        await new Promise(r => setTimeout(r, 30));
        expect(used(calls, /\/api\/links\/analytics/)).toBe(false); // no timeseries feature, no sparkline
        cleanup();

        const calls2 = await open({ mode: 'builtin', features: ['expiry'] });
        expect(screen.getByLabelText('Expires at')).toBeInTheDocument();
        expect(screen.queryByText(/^Tags/, { selector: 'summary' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Filter by tag')).not.toBeInTheDocument();
        await new Promise(r => setTimeout(r, 30));
        expect(used(calls2, /\/api\/links\/(tags|analytics)/)).toBe(false);
    });

    it('Dub mode is unchanged: domain, expiry, tags, filter, sparkline and "Open in Dub" all show', async () => {
        stubBackend([LINK]);
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(LINK.shortLink)).toBeInTheDocument());
        expect(screen.getByLabelText('Domain')).toBeInTheDocument();
        expect(screen.getByLabelText('Expires at')).toBeInTheDocument();
        expect(screen.getByText(/^Tags/, { selector: 'summary' })).toBeInTheDocument();
        expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Open in Dub/i })).toBeInTheDocument();
        await waitFor(() => expect(screen.getByLabelText('Clicks sparkline: 3, 9')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Edit ${LINK.shortLink}` }));
        expect(screen.getByLabelText('Edit key')).toBeInTheDocument();
    });

    it('built-in composer sends expiresAt and tagNames; a preset carries its tag pair; Add tag echoes into the picker', async () => {
        seedDestinations();
        const calls = await open({ mode: 'builtin' });
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/new' } });
        fireEvent.change(screen.getByLabelText('Expires at'), { target: { value: '2026-09-01T09:15' } });
        fireEvent.click(screen.getByText(/^Tags/, { selector: 'summary' }));
        fireEvent.click(await screen.findByLabelText('woodland-parc', { selector: 'input[type=checkbox]' }));
        fireEvent.change(screen.getByLabelText('New tag name'), { target: { value: 'fresh' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
        expect(await screen.findByLabelText('fresh', { selector: 'input[type=checkbox]' })).toBeChecked(); // echoed tag is pickable at once
        expect(calls.find(c => c.method === 'POST' && c.url.includes('/tags'))!.body).toEqual({ name: 'fresh' });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
        await waitFor(() => expect(calls.some(c => c.method === 'POST' && /\/api\/links$/.test(c.url))).toBe(true));
        const body = calls.find(c => c.method === 'POST' && /\/api\/links$/.test(c.url))!.body!;
        expect(body).toEqual({ url: 'https://example.com/new', expiresAt: new Date('2026-09-01T09:15').toISOString(), tagNames: ['woodland-parc', 'fresh'] });

        fireEvent.click(screen.getByRole('button', { name: '+ Rent payment' }));
        await waitFor(() => expect(calls.filter(c => c.method === 'POST' && /\/api\/links$/.test(c.url))).toHaveLength(2));
        const property = ANDY_PROPERTIES[0];
        const preset = ANDY_LINK_PRESETS.find(p => p.id === 'rent-payment')!;
        expect(calls.filter(c => c.method === 'POST' && /\/api\/links$/.test(c.url))[1].body)
            .toMatchObject({ key: presetKey(property, preset), tagNames: [property.tag, preset.kindTag] });
    });
});

describe('ShortLinks widget — built-in edit with features (plan 077 p3)', () => {
    const ROWS = [
        { ...BUILTIN_LINK, expiresAt: EXPIRY_ISO, tags: [{ id: 'woodland-parc', name: 'woodland-parc', color: '' }] },
        { ...BUILTIN_LINK, id: 'b_2', shortLink: 'https://go.dwellium.test/two', key: 'two', tags: [{ id: 'riverwood-club', name: 'riverwood-club', color: '' }] },
    ];
    const openEdit = async () => {
        const calls = stubBackend(ROWS, {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Edit ${BUILTIN_LINK.shortLink}` }));
        return calls;
    };
    const patches = (calls: Recorded[]) => calls.filter(c => c.method === 'PATCH');
    const form = () => screen.getByRole('group', { name: `Edit form for ${BUILTIN_LINK.shortLink}` });

    it('adding a tag sends the full tagNames set and nothing else', async () => {
        const calls = await openEdit();
        fireEvent.click(await within(form()).findByLabelText('riverwood-club')); // names come from GET /tags
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(patches(calls)).toHaveLength(1));
        expect(patches(calls)[0].body).toEqual({ tagNames: ['woodland-parc', 'riverwood-club'] });
    });

    it('clearing every tag sends tagNames: []', async () => {
        const calls = await openEdit();
        fireEvent.click(await within(form()).findByLabelText('woodland-parc'));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(patches(calls)).toHaveLength(1));
        expect(patches(calls)[0].body).toEqual({ tagNames: [] });
    });

    it('clearing the expiry sends expiresAt: null and nothing else', async () => {
        const calls = await openEdit();
        fireEvent.change(screen.getByLabelText('Edit expiry'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(patches(calls)).toHaveLength(1));
        expect(patches(calls)[0].body).toEqual({ expiresAt: null });
    });
});

describe('ShortLinks widget — search (plan 077 p3.4)', () => {
    const R1 = { ...BUILTIN_LINK, id: 'r1', shortLink: 'https://go.t/alpha', key: 'alpha', url: 'https://site.test/one', comments: 'First Floor', tags: [{ id: 'w', name: 'woodland-parc', color: '' }] };
    const R2 = { ...BUILTIN_LINK, id: 'r2', shortLink: 'https://go.t/beta', key: 'beta', url: 'https://other.test/two', comments: 'Lobby sign', tags: [{ id: 'r', name: 'riverwood-club', color: '' }] };
    const open = async () => {
        stubBackend([R1, R2], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(R1.shortLink)).toBeInTheDocument());
    };
    const search = (v: string) => fireEvent.change(screen.getByLabelText('Search links'), { target: { value: v } });
    const shown = () => [R1, R2].filter(r => screen.queryByText(r.shortLink)).map(r => r.key);

    it('has the documented label and placeholder and sits above the filters', async () => {
        await open();
        const box = screen.getByLabelText('Search links');
        expect(box).toHaveAttribute('placeholder', 'Search short link, destination, tag…');
        expect(box.compareDocumentPosition(screen.getByLabelText('Show archived')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('matches the short link, destination, title and tag name — case-insensitively', async () => {
        await open();
        search('ALPHA'); expect(shown()).toEqual(['alpha']); // short link
        search('Other.Test'); expect(shown()).toEqual(['beta']); // destination
        search('lobby'); expect(shown()).toEqual(['beta']); // title (comments)
        search('WOODLAND'); expect(shown()).toEqual(['alpha']); // tag
        search('  '); expect(shown()).toEqual(['alpha', 'beta']); // blank = no search
    });

    it('combines with the tag filter', async () => {
        await open();
        search('test'); // both destinations contain it
        expect(shown()).toEqual(['alpha', 'beta']);
        fireEvent.change(screen.getByLabelText('Filter by tag'), { target: { value: 'riverwood-club' } });
        expect(shown()).toEqual(['beta']);
        search('alpha'); // beta is filtered by tag, alpha by the tag filter
        expect(shown()).toEqual([]);
    });

    it('says "No links match" when a search finds nothing, and the list returns when cleared', async () => {
        await open();
        search('zzz');
        expect(screen.getByText('No links match')).toBeInTheDocument();
        expect(screen.queryByText('No links yet')).not.toBeInTheDocument();
        search('');
        expect(screen.queryByText('No links match')).not.toBeInTheDocument();
        expect(shown()).toEqual(['alpha', 'beta']);
    });
});

describe('ShortLinks widget — accessibility and focus (plan 077 p3.5)', () => {
    const open = async (rows: JsonObject[] = [BUILTIN_LINK]) => {
        const calls = stubBackend(rows, {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        return calls;
    };
    const copyBtn = () => screen.getByRole('button', { name: `Copy ${BUILTIN_LINK.shortLink}` });

    it('the notice is a status live region that exists, empty, before any message arrives', async () => {
        await open();
        const region = screen.getByRole('status');
        expect(region).toHaveClass('short-links__notice');
        expect(region).toHaveTextContent('');
        fireEvent.click(copyBtn());
        expect(screen.getByRole('status')).toBe(region); // same node: it was announced, not newly inserted
        expect(region).toHaveTextContent(`Copied ${BUILTIN_LINK.shortLink}`);
    });

    it('Archive moves focus to Confirm archive', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: `Archive ${BUILTIN_LINK.shortLink}` }));
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirm archive' })));
    });

    it('Cancel hands focus back to that row\'s Copy button', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: `Archive ${BUILTIN_LINK.shortLink}` }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel archive' }));
        await waitFor(() => expect(document.activeElement).toBe(copyBtn()));
    });

    it('Confirm: focus goes to the row\'s Copy button when the row survives the refresh, to the search box when it is gone', async () => {
        const rows: JsonObject[] = [BUILTIN_LINK];
        await open(rows); // rows stay put -> the refreshed list still has the row
        fireEvent.click(screen.getByRole('button', { name: `Archive ${BUILTIN_LINK.shortLink}` }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' }));
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Archived /));
        await waitFor(() => expect(document.activeElement).toBe(copyBtn()));
        cleanup();

        // Row gone after the refresh. The refresh is held open so the test sees focus wait for it, not jump to the doomed row.
        let release: (r: Response) => void = () => {};
        let lists = 0;
        vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            if ((init?.method ?? 'GET') === 'PATCH') return jsonResponse({ success: true, mode: 'builtin', data: { ...BUILTIN_LINK, archived: true } });
            lists += 1;
            return lists === 1
                ? jsonResponse({ success: true, mode: 'builtin', features: [], data: [BUILTIN_LINK] })
                : new Promise<Response>(res => { release = res; });
        }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Archive ${BUILTIN_LINK.shortLink}` }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' }));
        await waitFor(() => expect(lists).toBe(2)); // refresh in flight, old row still on screen
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm archive' })).not.toBeInTheDocument());
        expect(document.activeElement).not.toBe(copyBtn()); // not handed to a row that is about to vanish
        release(jsonResponse({ success: true, mode: 'builtin', features: [], data: [] }));
        await waitFor(() => expect(screen.queryByText(BUILTIN_LINK.shortLink)).not.toBeInTheDocument());
        await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Search links')));
    });

    it('opening the edit form focuses its URL input, and the form is a labelled group', async () => {
        await open();
        fireEvent.click(screen.getByRole('button', { name: `Edit ${BUILTIN_LINK.shortLink}` }));
        await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Edit destination URL')));
        expect(screen.getByRole('group', { name: `Edit form for ${BUILTIN_LINK.shortLink}` })).toBeInTheDocument();
    });
});

describe('ShortLinks widget — failures that must not cost the user their screen (plan 077 p3.6)', () => {
    it('a failed BACKGROUND refresh keeps the list, the composer and the open edit, and says so', async () => {
        let listCalls = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            const rec = { url: String(url), method: init?.method ?? 'GET' };
            if (!isListGet(rec)) return jsonResponse({ success: true, mode: 'builtin', data: [] });
            listCalls += 1;
            if (listCalls === 1) return jsonResponse({ success: true, mode: 'builtin', features: [], data: [BUILTIN_LINK] });
            throw new Error('offline');
        }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/half' } });
        fireEvent.click(screen.getByRole('button', { name: `Edit ${BUILTIN_LINK.shortLink}` }));
        fireEvent.change(screen.getByLabelText('Edit destination URL'), { target: { value: 'https://example.com/typing' } });

        fireEvent.click(screen.getByRole('button', { name: 'Refresh short links' }));
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not refresh — Backend unreachable'));
        expect(listCalls).toBe(2);
        expect(screen.queryByText('Backend unavailable')).not.toBeInTheDocument();
        expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument();
        expect((screen.getByLabelText('Destination URL') as HTMLInputElement).value).toBe('https://example.com/half');
        expect((screen.getByLabelText('Edit destination URL') as HTMLInputElement).value).toBe('https://example.com/typing');
    });

    it('the INITIAL load failing still shows the error card; Retry restores the list', async () => {
        let ok = false;
        vi.stubGlobal('fetch', vi.fn(async () => (ok
            ? jsonResponse({ success: true, mode: 'builtin', features: [], data: [BUILTIN_LINK] })
            : jsonResponse({ success: false, error: 'Boom' }, 500))));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        expect(screen.getByText('Boom')).toBeInTheDocument();
        ok = true;
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
    });

    it('a preset whose key is taken says it may be archived and where to find it; a composer refusal keeps the raw message', async () => {
        seedDestinations();
        const property = ANDY_PROPERTIES[0];
        const preset = ANDY_LINK_PRESETS.find(p => p.id === 'rent-payment')!;
        const key = presetKey(property, preset);
        stubBackend([], {}, { mode: 'builtin', postStatus: 409, postError: `Key ${key} is taken` });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByLabelText('Preset property')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: '+ Rent payment' }));
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`Key ${key} already exists — it may be archived; tick Show archived to find it`));

        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/x' } });
        fireEvent.change(screen.getByLabelText('Custom key'), { target: { value: 'mine' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`Key ${key} is taken`));
    });
});

describe('phase 3 review regressions', () => {
    const TAGGED = { ...BUILTIN_LINK, tags: [{ id: 'x', name: 'x', color: '' }] };

    it('a tag filter whose tag vanished from the list resets to All tags instead of stranding an empty list', async () => {
        let rows: JsonObject[] = [TAGGED];
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
            const u = String(url);
            if (u.includes('/api/links/tags')) return jsonResponse({ success: true, mode: 'builtin', data: [...new Set(rows.flatMap(r => (r.tags as Array<{ name: string }>).map(t => t.name)))].map(n => ({ id: n, name: n, color: '' })) });
            if (u.includes('/api/links/analytics')) return jsonResponse({ success: true, mode: 'builtin', data: [] });
            return jsonResponse({ success: true, mode: 'builtin', features: ['tags'], data: rows });
        }));
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Filter by tag'), { target: { value: 'x' } });
        expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument();
        rows = [{ ...BUILTIN_LINK, tags: [] }]; // the only x-tagged link lost its tag elsewhere
        fireEvent.click(screen.getByRole('button', { name: 'Refresh short links' }));
        await waitFor(() => expect((screen.getByLabelText('Filter by tag') as HTMLSelectElement).value).toBe(''));
        expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument();
        expect(screen.queryByText(/No links tagged/)).not.toBeInTheDocument();
    });

    it('a tag added with "Add tag" keeps its (ticked) checkbox across a refresh and is cleared after the link is created', async () => {
        const calls = stubBackend([BUILTIN_LINK], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('New tag name'), { target: { value: 'promo' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
        await waitFor(() => expect(screen.getByLabelText('promo')).toBeChecked());
        fireEvent.click(screen.getByRole('button', { name: 'Refresh short links' }));
        await waitFor(() => expect(calls.filter(c => c.method === 'GET' && /\/api\/links(\?|$)/.test(c.url)).length).toBeGreaterThanOrEqual(2));
        expect(screen.getByLabelText('promo')).toBeChecked(); // still offered, still ticked
        fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://e.test/new' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
        await waitFor(() => expect(calls.some(c => c.method === 'POST' && c.url.endsWith('/api/links'))).toBe(true));
        expect(calls.find(c => c.method === 'POST' && c.url.endsWith('/api/links'))!.body).toMatchObject({ tagNames: ['promo'] });
        await waitFor(() => expect(screen.queryByLabelText('promo')).not.toBeInTheDocument()); // picked set cleared, tag unused → gone
    });

    it('the sparkline cap is a real cap: 30 clicked links → at most 8 analytics calls', async () => {
        const many = Array.from({ length: 30 }, (_, i) => ({ ...BUILTIN_LINK, id: `m${i}`, key: `m${i}`, shortLink: `${SHORT_BASE}m${i}`, clicks: 1 + i }));
        const calls = stubBackend(many, {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(`${SHORT_BASE}m29`)).toBeInTheDocument());
        await waitFor(() => expect(calls.filter(c => c.url.includes('/api/links/analytics')).length).toBe(8));
        await new Promise(r => setTimeout(r, 60));
        expect(calls.filter(c => c.url.includes('/api/links/analytics')).length).toBe(8);
    });

    it('an expired link says so under its short link; a live expiry shows the date', async () => {
        stubBackend([{ ...BUILTIN_LINK, expiresAt: '2020-01-01T00:00:00.000Z' }, { ...LINK_2, id: 'live', key: 'live', shortLink: `${SHORT_BASE}live`, qrCode: '', expiresAt: '2999-01-01T00:00:00.000Z' }], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        expect(screen.getByText(/^expired /)).toBeInTheDocument();
        expect(screen.getByText(/^expires /)).toBeInTheDocument();
    });

    it('focus handed back after an archive is not pulled back again by later state changes', async () => {
        const calls = stubBackend([BUILTIN_LINK, { ...LINK_2, qrCode: '' }], {}, { mode: 'builtin' });
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByText(BUILTIN_LINK.shortLink)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: `Archive ${BUILTIN_LINK.shortLink}` }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel archive' }));
        expect(document.activeElement).toBe(screen.getByRole('button', { name: `Copy ${BUILTIN_LINK.shortLink}` }));
        // The user moves on to the composer; a later refresh must not yank focus back to the row (or the search box).
        const dest = screen.getByLabelText('Destination URL');
        dest.focus();
        fireEvent.click(screen.getByRole('button', { name: 'Refresh short links' }));
        await waitFor(() => expect(calls.filter(c => c.method === 'GET' && /\/api\/links(\?|$)/.test(c.url)).length).toBeGreaterThanOrEqual(2));
        await new Promise(r => setTimeout(r, 30));
        expect(document.activeElement).toBe(dest);
    });
});
