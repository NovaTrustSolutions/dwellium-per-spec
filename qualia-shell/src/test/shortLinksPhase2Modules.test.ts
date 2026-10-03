/** Plan 077 phase 2 pure modules: presetUrl, bulkCreateShortLinks chunking, removed exports. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as presets from '../components/ShortLinks/andyLinkPresets';
import { presetUrl, type DestinationsMemory } from '../components/ShortLinks/andyLinkPresets';
import { bulkCreateShortLinks, listShortLinks, type CreateShortLinkInput } from '../components/ShortLinks/shortLinksApi';

describe('presetUrl', () => {
    const mem = (v: string): DestinationsMemory => ({ 'woodland-parc': { maintenance: v } });
    it('is null when unset (no memory, no property, no preset)', () => {
        expect(presetUrl(undefined, 'woodland-parc', 'maintenance')).toBeNull();
        expect(presetUrl({}, 'woodland-parc', 'maintenance')).toBeNull();
        expect(presetUrl(mem('https://a.test'), 'woodland-parc', 'rent-payment')).toBeNull();
    });
    it('is null for blank, whitespace-only and non-http(s) values', () => {
        expect(presetUrl(mem(''), 'woodland-parc', 'maintenance')).toBeNull();
        expect(presetUrl(mem('   '), 'woodland-parc', 'maintenance')).toBeNull();
        expect(presetUrl(mem('ftp://x.test/a'), 'woodland-parc', 'maintenance')).toBeNull();
        expect(presetUrl(mem('https://a b.test'), 'woodland-parc', 'maintenance')).toBeNull();
    });
    it('returns the trimmed URL when valid', () => {
        expect(presetUrl(mem('  https://pay.example.test/x?a=1  '), 'woodland-parc', 'maintenance')).toBe('https://pay.example.test/x?a=1');
        expect(presetUrl(mem('HTTP://a.test'), 'woodland-parc', 'maintenance')).toBe('HTTP://a.test');
    });
});

describe('andyLinkPresets exports', () => {
    it('no longer exports APP_BASE / DOOR_SHEET_DEFAULT_PATTERN, and presets carry no url', () => {
        expect(Object.keys(presets)).not.toContain('APP_BASE');
        expect(Object.keys(presets)).not.toContain('DOOR_SHEET_DEFAULT_PATTERN');
        for (const p of presets.ANDY_LINK_PRESETS) expect(p).not.toHaveProperty('url');
        expect(presets.ANDY_LINK_PRESETS.map(p => p.id)).toEqual(['resident-portal', 'maintenance', 'rent-payment', 'current-notice']);
    });
});

describe('bulkCreateShortLinks chunking', () => {
    const items = (n: number): CreateShortLinkInput[] => Array.from({ length: n }, (_, i) => ({ url: `https://a.test/${i}`, key: `k${i}` }));
    afterEach(() => vi.unstubAllGlobals());

    /** Echoes each posted link back as a row; fails the (1-based) call `failOn` with a 500. */
    function stubFetch(failOn = 0) {
        const fn = vi.fn(async (_url: string, init?: RequestInit) => {
            const n = fn.mock.calls.length;
            if (n === failOn) return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
            const { links } = JSON.parse(String(init?.body)) as { links: CreateShortLinkInput[] };
            return new Response(JSON.stringify({ data: links.map(l => ({ key: l.key })) }), { status: 200 });
        });
        vi.stubGlobal('fetch', fn);
        return fn;
    }
    const sizes = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls.map(c => JSON.parse(String(c[1]?.body)).links.length);

    it('250 entries -> 3 sequential POSTs of 100/100/50, data concatenated in order', async () => {
        const fn = stubFetch();
        const res = await bulkCreateShortLinks(items(250));
        expect(sizes(fn)).toEqual([100, 100, 50]);
        expect(res.kind).toBe('ok');
        if (res.kind === 'ok') expect(res.data.map(r => r.key)).toEqual(items(250).map(l => l.key));
    });
    it('exactly 100 entries -> one POST', async () => {
        const fn = stubFetch();
        await bulkCreateShortLinks(items(100));
        expect(sizes(fn)).toEqual([100]);
    });
    it('a failure in chunk 2 stops before chunk 3 and returns that error', async () => {
        const fn = stubFetch(2);
        const res = await bulkCreateShortLinks(items(250));
        expect(fn).toHaveBeenCalledTimes(2);
        expect(res).toEqual({ kind: 'error', message: 'boom' });
    });
    it('0 entries -> ok with no data and no request', async () => {
        const fn = stubFetch();
        expect(await bulkCreateShortLinks([])).toEqual({ kind: 'ok', data: [] });
        expect(fn).not.toHaveBeenCalled();
    });
});

describe('listShortLinks features (capability flag)', () => {
    afterEach(() => vi.unstubAllGlobals());
    const listWith = async (body: unknown) => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
        const res = await listShortLinks();
        if (res.kind !== 'ok') throw new Error('expected ok');
        return res.data;
    };
    it('dub mode (no mode key) -> all three features', async () => {
        const d = await listWith({ data: [] });
        expect(d.mode).toBe('dub');
        expect([...d.features].sort()).toEqual(['expiry', 'tags', 'timeseries']);
    });
    it('dub mode ignores a stray features array', async () => {
        expect((await listWith({ data: [], features: [] })).features.size).toBe(3);
    });
    it('builtin with features -> exactly those', async () => {
        const d = await listWith({ mode: 'builtin', data: [], features: ['expiry', 'tags'] });
        expect(d.mode).toBe('builtin');
        expect([...d.features].sort()).toEqual(['expiry', 'tags']);
    });
    it('builtin without features (older backend) -> empty set', async () => {
        expect((await listWith({ mode: 'builtin', data: [] })).features.size).toBe(0);
        expect((await listWith({ mode: 'builtin', data: [], features: 'expiry' })).features.size).toBe(0);
    });
    it('builtin with junk entries -> filtered to the known strings', async () => {
        const d = await listWith({ mode: 'builtin', data: [], features: ['timeseries', 'bogus', 7, null, 'TAGS'] });
        expect([...d.features]).toEqual(['timeseries']);
    });
});
