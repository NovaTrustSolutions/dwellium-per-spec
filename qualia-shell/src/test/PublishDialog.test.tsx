/**
 * Interactive Docs wave 3B — PublishDialog: slug validation, publish → URL +
 * embed code + copy buttons + LinkedIn link, re-publish/unpublish. Real timers.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import PublishDialog from '../components/Scribe/idocs/PublishDialog';
import { bulkCreateShortLinks } from '../components/ShortLinks/shortLinksApi';
import { idocsStore, idocsUserIdHolder, replaceDoc } from '../components/Scribe/idocs/idocsStore';
import { createEmptyDoc } from '../components/Scribe/idocs/idocTypes';

vi.mock('../components/ShortLinks/shortLinksApi', () => ({ bulkCreateShortLinks: vi.fn() }));
const bulk = vi.mocked(bulkCreateShortLinks);

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); idocsStore.reset(); idocsUserIdHolder.current = 'me'; });

function api(status = 200, data: unknown = { slug: 'q3-owner-update', url: '/p/q3-owner-update', publishedAt: '2026-08-19T00:00:00Z' }) {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: 'boom' }), { status });
    }) as unknown as typeof fetch;
    return { deps: { fetchFn, base: '' }, calls };
}

describe('PublishDialog', () => {
    it('derives the slug from the title, validates [a-z0-9-]{3,64}, and disables Publish while invalid', () => {
        const doc = createEmptyDoc({ id: 'd1', title: 'Q3 Owner Update' });
        replaceDoc(doc);
        render(<PublishDialog doc={doc} onClose={() => {}} api={api().deps} />);
        const slug = screen.getByLabelText('Slug') as HTMLInputElement;
        expect(slug.value).toBe('q3-owner-update');
        fireEvent.change(slug, { target: { value: 'ab' } });
        expect(screen.getByRole('alert')).toHaveTextContent('3–64 chars');
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
        fireEvent.change(slug, { target: { value: 'Bad Slug!' } }); // lowercased, still invalid (space, !)
        expect(slug.value).toBe('bad slug!');
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
        fireEvent.change(slug, { target: { value: 'good-slug-2' } });
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
    });

    it('Publish → POST /api/idocs/publish with html + settings; shows URL, embed code, copy buttons, LinkedIn, Re-publish + Unpublish; persists doc.publication', async () => {
        const doc = createEmptyDoc({ id: 'd1', title: 'Q3 Owner Update', description: 'Quarterly recap' });
        replaceDoc(doc);
        const a = api();
        const toast = vi.fn();
        // Re-render from the store so `doc.publication` flows back in (the editor passes the live doc).
        function Host() { const d = idocsStore.getSnapshot().docs[0]; return <PublishDialog doc={d} onClose={() => {}} api={a.deps} onToast={toast} />; }
        const { rerender } = render(<Host />);
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
        fireEvent.click(screen.getByLabelText('Hide from search engines'));
        fireEvent.click(screen.getByLabelText('Allow embedding (iframe)')); // off
        fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
        await waitFor(() => expect(idocsStore.getSnapshot().docs[0].publication?.slug).toBe('q3-owner-update'));
        expect(a.calls[0].url).toBe('/api/idocs/publish');
        expect(a.calls[0].method).toBe('POST');
        expect(a.calls[0].body).toMatchObject({ docId: 'd1', title: 'Q3 Owner Update', slug: 'q3-owner-update', password: 'secret', embedAllowed: false, seo: { title: 'Q3 Owner Update', description: 'Quarterly recap', noindex: true } });
        expect(String((a.calls[0].body as { html: string }).html)).toContain('<!doctype html');
        expect(toast).toHaveBeenCalledWith('Published');
        rerender(<Host />);
        const url = `${window.location.origin}/p/q3-owner-update`;
        expect(screen.getByTestId('idoc-public-url')).toHaveTextContent(url);
        expect(screen.getByTestId('idoc-embed-code')).toHaveTextContent(`<iframe src="${url}" width="100%" height="700" style="border:0" allowfullscreen></iframe>`);
        expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Copy embed code' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', url);
        expect(screen.getByRole('link', { name: 'Share on LinkedIn' })).toHaveAttribute('href', `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`);
        expect(screen.getByRole('button', { name: 'Re-publish' })).toBeInTheDocument();
        // Unpublish → DELETE + publication cleared
        fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
        await waitFor(() => expect(idocsStore.getSnapshot().docs[0].publication).toBeUndefined());
        expect(a.calls[1]).toMatchObject({ url: '/api/idocs/publications/q3-owner-update', method: 'DELETE' });
    });

    it('server error → inline alert, nothing persisted', async () => {
        const doc = createEmptyDoc({ id: 'd1', title: 'Broken' });
        replaceDoc(doc);
        render(<PublishDialog doc={doc} onClose={() => {}} api={api(500).deps} />);
        fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Publish failed');
        expect(idocsStore.getSnapshot().docs[0].publication).toBeUndefined();
    });

    describe('Short link + QR', () => {
        const SHORT = 'https://dwl.im/abc123';
        const published = (slug = 'q3-owner-update') => createEmptyDoc({ id: 'd1', title: 'Q3 Owner Update', publication: { slug, url: `/p/${slug}`, publishedAt: '2026-08-19T00:00:00Z' } });
        const open = (slug?: string) => render(<PublishDialog doc={published(slug)} onClose={() => {}} api={api().deps} onToast={toast} />);
        const toast = vi.fn();
        const writeText = vi.fn(async () => {});
        beforeEach(() => {
            bulk.mockReset(); toast.mockReset(); writeText.mockClear();
            Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        });

        it('is not offered before publishing', () => {
            render(<PublishDialog doc={createEmptyDoc({ id: 'd1', title: 'Q3 Owner Update' })} onClose={() => {}} api={api().deps} />);
            expect(screen.queryByRole('button', { name: 'Make short link' })).toBeNull();
        });

        it('upserts doc-<slug> for the public URL, then shows the short URL, copy, QR and SVG download', async () => {
            let release!: () => void;
            bulk.mockImplementation(() => new Promise((res) => { release = () => res({ kind: 'ok', data: [{ shortLink: SHORT }] } as never); }));
            open();
            fireEvent.click(screen.getByRole('button', { name: 'Make short link' }));
            expect(bulk).toHaveBeenCalledWith([{ url: `${window.location.origin}/p/q3-owner-update`, key: 'doc-q3-owner-update', title: 'Q3 Owner Update' }]);
            expect(bulk.mock.calls[0][0]).toHaveLength(1);
            expect(screen.getByRole('button', { name: 'Make short link' })).toHaveTextContent('Making…');
            release();
            expect(await screen.findByTestId('idoc-short-url')).toHaveTextContent(SHORT);
            expect(screen.queryByRole('button', { name: 'Make short link' })).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Copy short link' }));
            await waitFor(() => expect(writeText).toHaveBeenCalledWith(SHORT));
            expect(toast).toHaveBeenCalledWith('Short link copied');
            expect(screen.getByAltText(`QR code for ${SHORT}`).getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
            expect(screen.getByRole('link', { name: 'Download SVG' })).toHaveAttribute('download', 'doc-q3-owner-update.svg');
        });

        it('needs-setup → explains the backend lacks short links, button stays', async () => {
            bulk.mockResolvedValue({ kind: 'needs-setup' });
            open();
            fireEvent.click(screen.getByRole('button', { name: 'Make short link' }));
            expect(await screen.findByText('Short links are not available on this backend yet')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Make short link' })).toBeEnabled();
        });

        it('error → shows the backend message', async () => {
            bulk.mockResolvedValue({ kind: 'error', message: 'Key already taken' });
            open();
            fireEvent.click(screen.getByRole('button', { name: 'Make short link' }));
            expect(await screen.findByText('Key already taken')).toBeInTheDocument();
        });

        it('a different slug (re-publish) resets the short-link state', async () => {
            bulk.mockResolvedValue({ kind: 'ok', data: [{ shortLink: SHORT }] } as never);
            const { rerender } = open();
            fireEvent.click(screen.getByRole('button', { name: 'Make short link' }));
            await screen.findByTestId('idoc-short-url');
            rerender(<PublishDialog doc={published('new-slug')} onClose={() => {}} api={api().deps} />);
            expect(screen.queryByTestId('idoc-short-url')).toBeNull();
            expect(screen.getByRole('button', { name: 'Make short link' })).toBeInTheDocument();
        });
    });
});

describe('PublishDialog short-link key', () => {
    it('a 64-char slug gets a hashed key that fits the 64-char limit and differs per slug (no silent re-aim)', async () => {
        const { bulkCreateShortLinks } = await import('../components/ShortLinks/shortLinksApi');
        const bulk = bulkCreateShortLinks as unknown as ReturnType<typeof vi.fn>;
        bulk.mockResolvedValue({ kind: 'ok', data: [{ shortLink: 'https://x/l/k', key: 'k' }] });
        const keys: string[] = [];
        for (const slug of ['a'.repeat(64), 'a'.repeat(63) + 'b']) {
            cleanup();
            const doc = createEmptyDoc({ id: 'd-' + slug.length + slug.slice(-1), title: 'Long', publication: { slug, url: `/p/${slug}`, publishedAt: '2026-08-19T00:00:00Z' } });
            replaceDoc(doc);
            render(<PublishDialog doc={doc} onClose={() => {}} api={api().deps} />);
            fireEvent.click(await screen.findByRole('button', { name: 'Make short link' }));
            await waitFor(() => expect(bulk).toHaveBeenCalled());
            keys.push((bulk.mock.calls[bulk.mock.calls.length - 1][0] as Array<{ key: string }>)[0].key);
            bulk.mockClear();
        }
        expect(keys[0]).toMatch(/^doc-a{51}-[0-9a-f]{8}$/);
        expect(keys[0].length).toBeLessThanOrEqual(64);
        expect(keys[1]).not.toBe(keys[0]);
    });
});
