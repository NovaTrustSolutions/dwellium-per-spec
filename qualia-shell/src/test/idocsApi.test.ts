/**
 * Interactive Docs wave 3B — idocsApi client: every function hits the right
 * method / path / body (contract §1–§3), envelope unwrapping, error → IdocsApiError,
 * 409 → `.current`, 400 unknown-users → `.emails`, network → status 0.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    IdocsApiError, embedCodeFor, generateDoc, generateSchema, getSharedDoc, isValidSlug, linkedInShareUrl, listPublications, listShared,
    postComment, postPresence, publicUrlFor, publicationAnalytics, publishDoc, putSharedDoc, setMembers, slugify, unpublish, unshare,
} from '../components/Scribe/idocs/idocsApi';
import { createEmptyDoc } from '../components/Scribe/idocs/idocTypes';

type Call = { url: string; init: RequestInit };
function mockFetch(status: number, body: unknown): { fetchFn: typeof fetch; calls: Call[] } {
    const calls: Call[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
}
const ok = (data: unknown) => ({ success: true, data });
const deps = (m: ReturnType<typeof mockFetch>) => ({ fetchFn: m.fetchFn, base: 'http://api' });
const bodyOf = (c: Call) => JSON.parse(String(c.init.body));
const caught = async (p: Promise<unknown>): Promise<IdocsApiError> => { try { await p; } catch (e) { return e as IdocsApiError; } throw new Error('expected rejection'); };

describe('idocsApi — routes', () => {
    it('publishDoc → POST /api/idocs/publish with the input body; unwraps data', async () => {
        const m = mockFetch(200, ok({ slug: 'hello', url: '/p/hello', publishedAt: 't' }));
        const r = await publishDoc({ docId: 'd1', title: 'Hello', html: '<p>x</p>', slug: 'hello', seo: { noindex: true }, embedAllowed: false }, deps(m));
        expect(r).toEqual({ slug: 'hello', url: '/p/hello', publishedAt: 't' });
        expect(m.calls[0].url).toBe('http://api/api/idocs/publish');
        expect(m.calls[0].init.method).toBe('POST');
        expect(bodyOf(m.calls[0])).toMatchObject({ docId: 'd1', title: 'Hello', html: '<p>x</p>', slug: 'hello', seo: { noindex: true }, embedAllowed: false });
        const h = new Headers(m.calls[0].init.headers);
        expect(h.get('X-Qualia-API')).toBe('v2');
        expect(h.get('Content-Type')).toBe('application/json');
    });

    it('listPublications → GET /publications (items[]); unpublish → DELETE /publications/:slug; analytics → GET …/analytics', async () => {
        const m1 = mockFetch(200, ok({ items: [{ slug: 'a' }] }));
        expect(await listPublications(deps(m1))).toEqual([{ slug: 'a' }]);
        expect(m1.calls[0].url).toBe('http://api/api/idocs/publications');
        expect(m1.calls[0].init.method).toBe('GET');
        expect(m1.calls[0].init.body).toBeUndefined();

        const m2 = mockFetch(200, ok({ ok: true }));
        await unpublish('my slug', deps(m2));
        expect(m2.calls[0].url).toBe('http://api/api/idocs/publications/my%20slug');
        expect(m2.calls[0].init.method).toBe('DELETE');

        const m3 = mockFetch(200, ok({ views: 3, uniqueViewers30d: 2, lastViewedAt: null, perCard: [] }));
        const a = await publicationAnalytics('s', deps(m3));
        expect(a.views).toBe(3);
        expect(m3.calls[0].url).toBe('http://api/api/idocs/publications/s/analytics');
    });

    it('putSharedDoc → PUT /shared/:docId { doc, version }; getSharedDoc → GET; listShared → GET /shared', async () => {
        const doc = createEmptyDoc({ id: 'doc-1', title: 'T' });
        const m = mockFetch(200, ok({ version: 2, updatedAt: 'u' }));
        expect(await putSharedDoc('doc-1', { doc, version: 1 }, deps(m))).toEqual({ version: 2, updatedAt: 'u' });
        expect(m.calls[0].url).toBe('http://api/api/idocs/shared/doc-1');
        expect(m.calls[0].init.method).toBe('PUT');
        expect(bodyOf(m.calls[0])).toMatchObject({ version: 1, doc: { id: 'doc-1', title: 'T' } });

        const m2 = mockFetch(200, ok({ doc, version: 2, updatedAt: 'u', updatedBy: { id: 'x', name: 'X' }, role: 'edit', owner: { id: 'o', name: 'O' }, members: [] }));
        const g = await getSharedDoc('doc-1', deps(m2));
        expect(g.role).toBe('edit');
        expect(m2.calls[0].init.method).toBe('GET');

        const m3 = mockFetch(200, ok({ items: [{ docId: 'doc-1', role: 'view' }] }));
        expect(await listShared(deps(m3))).toEqual([{ docId: 'doc-1', role: 'view' }]);
        expect(m3.calls[0].url).toBe('http://api/api/idocs/shared');
    });

    it('setMembers → PUT /shared/:docId/members { members }; unshare → DELETE; postComment → POST …/comments; postPresence → POST …/presence', async () => {
        const m = mockFetch(200, ok({ members: [{ userId: 'u', name: 'U', email: 'u@x.io', role: 'view' }] }));
        const members = await setMembers('d', [{ email: 'u@x.io', role: 'view' }], deps(m));
        expect(members[0].userId).toBe('u');
        expect(m.calls[0].url).toBe('http://api/api/idocs/shared/d/members');
        expect(m.calls[0].init.method).toBe('PUT');
        expect(bodyOf(m.calls[0])).toEqual({ members: [{ email: 'u@x.io', role: 'view' }] });

        const m2 = mockFetch(200, ok({ ok: true }));
        await unshare('d', deps(m2));
        expect(m2.calls[0].url).toBe('http://api/api/idocs/shared/d');
        expect(m2.calls[0].init.method).toBe('DELETE');

        const m3 = mockFetch(200, ok({ comment: { id: 'c', author: 'A', text: 'hi', at: 't' }, version: 3 }));
        const c = await postComment('d', { cardId: 'c1', blockId: 'b1', text: 'hi' }, deps(m3));
        expect(c.version).toBe(3);
        expect(m3.calls[0].url).toBe('http://api/api/idocs/shared/d/comments');
        expect(bodyOf(m3.calls[0])).toEqual({ cardId: 'c1', blockId: 'b1', text: 'hi' });

        const m4 = mockFetch(200, ok({ others: [{ userId: 'z', name: 'Zed', cardId: 'c1', at: 't' }] }));
        const others = await postPresence('d', { cardId: 'c1' }, deps(m4));
        expect(others[0].name).toBe('Zed');
        expect(m4.calls[0].url).toBe('http://api/api/idocs/shared/d/presence');
        expect(m4.calls[0].init.method).toBe('POST');
        expect(bodyOf(m4.calls[0])).toEqual({ cardId: 'c1' });
    });

    it('generateDoc → POST /generate → doc; generateSchema → GET /generate/schema', async () => {
        const m = mockFetch(200, ok({ doc: { id: 'g', title: 'G', cards: [] } }));
        const d = await generateDoc({ prompt: 'p', kind: 'deck' }, deps(m));
        expect(d.title).toBe('G');
        expect(m.calls[0].url).toBe('http://api/api/idocs/generate');
        expect(bodyOf(m.calls[0])).toEqual({ prompt: 'p', kind: 'deck' });
        const m2 = mockFetch(200, ok({ blockTypes: ['text'], example: { id: 'e', title: 'E', cards: [] } }));
        expect((await generateSchema(deps(m2))).blockTypes).toEqual(['text']);
        expect(m2.calls[0].url).toBe('http://api/api/idocs/generate/schema');
    });
});

describe('idocsApi — errors', () => {
    it('409 version-conflict → IdocsApiError with status 409, code and current', async () => {
        const doc = createEmptyDoc({ id: 'd' });
        const current = { doc, version: 5, updatedAt: 'u', updatedBy: { id: 'b', name: 'Bea' } };
        const m = mockFetch(409, { success: false, error: 'version-conflict', current });
        const err = await caught(putSharedDoc('d', { doc, version: 4 }, deps(m)));
        expect(err).toBeInstanceOf(IdocsApiError);
        expect(err.status).toBe(409);
        expect(err.code).toBe('version-conflict');
        expect(err.current?.version).toBe(5);
        expect(err.current?.updatedBy?.name).toBe('Bea');
    });

    it('409 with `current` nested under data is also surfaced', async () => {
        const doc = createEmptyDoc({ id: 'd' });
        const m = mockFetch(409, { success: false, error: 'version-conflict', data: { current: { doc, version: 9, updatedAt: 'u' } } });
        const err = await caught(putSharedDoc('d', { doc, version: 1 }, deps(m)));
        expect(err.current?.version).toBe(9);
    });

    it('400 unknown-users → emails; non-JSON 500 → http-500; network failure → status 0 / code network', async () => {
        const m = mockFetch(400, { success: false, error: 'unknown-users', emails: ['nobody@x.io'] });
        const err = await caught(setMembers('d', [{ email: 'nobody@x.io', role: 'view' }], deps(m)));
        expect(err.code).toBe('unknown-users');
        expect(err.emails).toEqual(['nobody@x.io']);

        const fetch500 = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
        const e2 = await caught(listShared({ fetchFn: fetch500, base: '' }));
        expect(e2.status).toBe(500);
        expect(e2.code).toBe('http-500');

        const fetchDown = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
        const e3 = await caught(listShared({ fetchFn: fetchDown, base: '' }));
        expect(e3.status).toBe(0);
        expect(e3.code).toBe('network');
    });

    it('success:false with 200 also throws (envelope error wins)', async () => {
        const m = mockFetch(200, { success: false, error: 'nope' });
        await expect(unshare('d', deps(m))).rejects.toMatchObject({ code: 'nope', status: 200 });
    });
});

describe('idocsApi — helpers', () => {
    it('slug validation + slugify', () => {
        expect(isValidSlug('abc')).toBe(true);
        expect(isValidSlug('ab')).toBe(false);
        expect(isValidSlug('Has Caps')).toBe(false);
        expect(isValidSlug('a'.repeat(65))).toBe(false);
        expect(slugify('Q3 Owner Update — Maple Court!')).toBe('q3-owner-update-maple-court');
        expect(isValidSlug(slugify('Hi'))).toBe(true);
        expect(isValidSlug(slugify(''))).toBe(true);
    });
    it('publicUrlFor / embedCodeFor / linkedInShareUrl', () => {
        const url = publicUrlFor('my-doc');
        expect(url).toBe(`${window.location.origin}/p/my-doc`);
        expect(embedCodeFor('my-doc')).toBe(`<iframe src="${url}" width="100%" height="700" style="border:0" allowfullscreen></iframe>`);
        expect(linkedInShareUrl(url)).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`);
    });
});
