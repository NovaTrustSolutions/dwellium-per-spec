/**
 * PhotoVault native tabs (plan 053) — Albums / Upload / Share against the
 * /api/photos backend proxy, with honest separated states:
 *   backend 503 → needs-setup card naming IMMICH_URL + IMMICH_API_KEY;
 *   backend/network down → unreachable card with Retry;
 *   ready → albums grouped by property ("<Property> — <Unit>"), upload flow
 *   (ensure album → per-file progress), share flow (link + expiry + copy +
 *   the Funnel honesty note), search with the metadata-fallback label.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PhotoVault from '../components/PhotoVault/PhotoVault';
import { photoVaultPresetBus } from '../components/PhotoVault/photoVaultBridge';
import { resetThumbnailCache } from '../components/PhotoVault/photoVaultApi';

function jsonRes(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        blob: async () => new Blob(['x']),
    } as unknown as Response;
}

const ALBUMS = [
    { id: 'al-w12b', albumName: 'Woodland Parc Townhomes — 12B', assetCount: 2, albumThumbnailAssetId: 'as-1' },
    { id: 'al-w3c', albumName: 'Woodland Parc Townhomes — 3C', assetCount: 0, albumThumbnailAssetId: null },
    { id: 'al-r7a', albumName: 'Riverwood Club Apartments — 7A', assetCount: 5, albumThumbnailAssetId: 'as-9' },
];

/** Routing fetch stub for the happy path; per-test overrides via `routes`. */
function stubBackend(routes: Record<string, (url: string, init?: RequestInit) => Response | Promise<Response>> = {}) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        for (const [needle, handler] of Object.entries(routes)) {
            if (url.includes(needle)) return handler(url, init);
        }
        if (url.includes('/api/photos/status')) return jsonRes({ success: true, data: { reachable: true } });
        if (url.includes('/api/photos/albums/ensure')) return jsonRes({ success: true, data: { id: 'al-ensured', albumName: 'X' } }, 201);
        if (url.match(/\/api\/photos\/albums\/[^/]+$/)) {
            return jsonRes({
                success: true,
                data: { id: 'al-w12b', albumName: 'Woodland Parc Townhomes — 12B', assets: [{ id: 'as-1', originalFileName: 'before-leak.jpg' }, { id: 'as-2', originalFileName: 'after-leak.jpg' }] },
            });
        }
        if (url.includes('/api/photos/albums')) return jsonRes({ success: true, data: ALBUMS });
        if (url.includes('/api/photos/assets') && url.includes('thumbnail')) return jsonRes({}, 404);
        if (url.includes('/api/photos/assets')) return jsonRes({ success: true, data: { id: 'as-new' } }, 201);
        if (url.includes('/api/photos/search')) return jsonRes({ success: true, mode: 'metadata', data: [{ id: 'as-7', originalFileName: 'leak.jpg' }] });
        if (url.includes('/api/photos/shared-links')) {
            return (init?.method === 'POST')
                ? jsonRes({ success: true, data: { id: 'sl-new', key: 'k-new', shareUrl: 'https://office-mac.ts.net/share/k-new' } }, 201)
                : jsonRes({ success: true, data: [{ id: 'sl-1', key: 'k1', shareUrl: 'https://office-mac.ts.net/share/k1', album: { id: 'al-r7a', albumName: 'Riverwood Club Apartments — 7A' }, expiresAt: null }] });
        }
        return jsonRes({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, calls };
}

beforeEach(() => {
    photoVaultPresetBus.clear();
    resetThumbnailCache();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const clickTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));

describe('PhotoVault native tabs — proxy states', () => {
    it('backend 503 → needs-setup card naming IMMICH_URL + IMMICH_API_KEY (iframe card untouched)', async () => {
        stubBackend({ '/api/photos/status': () => jsonRes({ success: false, needsSetup: true }, 503) });
        render(<PhotoVault env={{}} />);
        // iframe tab (default) keeps its own needs-setup card
        expect(screen.getByText('Connect Immich')).toBeInTheDocument();
        clickTab('Albums');
        await waitFor(() => expect(screen.getByText('Connect the Photo Vault backend')).toBeInTheDocument());
        expect(screen.getByText(/IMMICH_URL/)).toBeInTheDocument();
        expect(screen.getByText(/IMMICH_API_KEY/)).toBeInTheDocument();
        expect(document.querySelector('[data-state="proxy-needs-setup"]')).not.toBeNull();
    });

    it('backend down → unreachable card; Retry recovers to the album list', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<PhotoVault env={{}} />);
        clickTab('Albums');
        await waitFor(() => expect(screen.getByText('Photo Vault isn’t reachable')).toBeInTheDocument());
        stubBackend();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.getByText('Woodland Parc Townhomes')).toBeInTheDocument());
    });
});

describe('PhotoVault Albums tab', () => {
    it('groups albums by property per the "<Property> — <Unit>" convention', async () => {
        stubBackend();
        render(<PhotoVault env={{}} />);
        clickTab('Albums');
        await waitFor(() => expect(screen.getByText('Woodland Parc Townhomes')).toBeInTheDocument());
        expect(screen.getByText('Riverwood Club Apartments')).toBeInTheDocument();
        const woodland = document.querySelector('[data-property="Woodland Parc Townhomes"]')!;
        expect(within(woodland as HTMLElement).getByText('12B')).toBeInTheDocument();
        expect(within(woodland as HTMLElement).getByText('3C')).toBeInTheDocument();
        const riverwood = document.querySelector('[data-property="Riverwood Club Apartments"]')!;
        expect(within(riverwood as HTMLElement).getByText('7A')).toBeInTheDocument();
    });

    it('opens an album into a thumbnail grid with filenames', async () => {
        stubBackend();
        render(<PhotoVault env={{}} />);
        clickTab('Albums');
        await waitFor(() => expect(screen.getByText('12B')).toBeInTheDocument());
        fireEvent.click(screen.getByText('12B'));
        await waitFor(() => expect(screen.getByText('before-leak.jpg')).toBeInTheDocument());
        expect(screen.getByText('after-leak.jpg')).toBeInTheDocument();
        // back to the list
        fireEvent.click(screen.getByRole('button', { name: '← Albums' }));
        await waitFor(() => expect(screen.getByText('Riverwood Club Apartments')).toBeInTheDocument());
    });

    it('search shows results and labels the metadata fallback honestly (ML off)', async () => {
        stubBackend();
        render(<PhotoVault env={{}} />);
        clickTab('Albums');
        await waitFor(() => expect(screen.getByLabelText('Search photos')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Search photos'), { target: { value: 'leak' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        await waitFor(() => expect(screen.getByText('leak.jpg')).toBeInTheDocument());
        expect(screen.getByText(/filename search \(enable ML for smart search/)).toBeInTheDocument();
    });
});

describe('PhotoVault Upload tab', () => {
    it('creates/reuses the unit album then uploads with per-file progress', async () => {
        const { calls } = stubBackend();
        render(<PhotoVault env={{}} />);
        clickTab('Upload');
        await waitFor(() => expect(screen.getByLabelText('Property')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Property'), { target: { value: 'Woodland Parc Townhomes' } });
        fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '12B' } });
        expect(screen.getByText('Woodland Parc Townhomes — 12B')).toBeInTheDocument(); // album hint
        const file = new File(['jpegbytes'], 'hallway.jpg', { type: 'image/jpeg' });
        fireEvent.change(screen.getByLabelText('Choose photos'), { target: { files: [file] } });
        await waitFor(() => expect(screen.getByText('hallway.jpg')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }));
        await waitFor(() => expect(screen.getByTestId('pv-upload-progress')).toHaveTextContent('1/1 uploaded'));
        expect(screen.getByText('✓ Uploaded')).toBeInTheDocument();
        const ensureCall = calls.find(c => c.url.includes('/albums/ensure'))!;
        expect(JSON.parse(String(ensureCall.init?.body))).toMatchObject({ property: 'Woodland Parc Townhomes', unit: '12B' });
        const uploadCall = calls.find(c => c.url.includes('/api/photos/assets'))!;
        expect(uploadCall.url).toContain('albumId=al-ensured');
        expect(uploadCall.init?.body).toBeInstanceOf(FormData);
        expect((uploadCall.init?.body as FormData).get('assetData')).toBeInstanceOf(File);
    });

    it('surfaces a per-file error without losing the rest of the queue', async () => {
        stubBackend({ '/api/photos/assets': () => jsonRes({ success: false, error: 'disk full on the office Mac' }, 500) });
        render(<PhotoVault env={{}} />);
        clickTab('Upload');
        await waitFor(() => expect(screen.getByLabelText('Property')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Property'), { target: { value: 'Riverwood Club Apartments' } });
        const file = new File(['x'], 'roof.jpg', { type: 'image/jpeg' });
        fireEvent.change(screen.getByLabelText('Choose photos'), { target: { files: [file] } });
        await waitFor(() => expect(screen.getByText('roof.jpg')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }));
        await waitFor(() => expect(screen.getByText(/Failed — disk full on the office Mac/)).toBeInTheDocument());
        expect(screen.getByTestId('pv-upload-progress')).toHaveTextContent('0/1 uploaded');
    });

    it('offers Andy’s properties in the picker datalist before any album exists', async () => {
        stubBackend({ '/api/photos/albums': url => (url.includes('ensure') ? jsonRes({}, 404) : jsonRes({ success: true, data: [] })) });
        render(<PhotoVault env={{}} />);
        clickTab('Upload');
        await waitFor(() => expect(screen.getByLabelText('Property')).toBeInTheDocument());
        const options = [...document.querySelectorAll('#pv-properties option')].map(o => o.getAttribute('value'));
        expect(options).toContain('Woodland Parc Townhomes');
        expect(options).toContain('Riverwood Club Apartments');
    });
});

describe('PhotoVault Share tab', () => {
    it('creates an album link with expiry, shows it with Copy, and keeps the Funnel note honest', async () => {
        const writeText = vi.fn();
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        const { calls } = stubBackend();
        render(<PhotoVault env={{}} />);
        clickTab('Share');
        await waitFor(() => expect(screen.getByLabelText('Album to share')).toBeInTheDocument());
        // existing links listed ("never expires" is unique to the link list; the
        // album name also appears in the share <option>, so count both spots)
        await waitFor(() => expect(screen.getByText('never expires')).toBeInTheDocument());
        expect(screen.getAllByText('Riverwood Club Apartments — 7A').length).toBeGreaterThanOrEqual(2);
        // honest off-tailnet note
        expect(screen.getByText(/Tailscale Funnel/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Album to share'), { target: { value: 'al-w12b' } });
        fireEvent.change(screen.getByLabelText('Link expiry'), { target: { value: '7' } });
        fireEvent.click(screen.getByRole('button', { name: /Create link/ }));
        await waitFor(() => expect(screen.getByTestId('pv-share-created')).toBeInTheDocument());
        expect(screen.getByText('https://office-mac.ts.net/share/k-new')).toBeInTheDocument();
        const createCall = calls.find(c => c.url.includes('shared-links') && c.init?.method === 'POST')!;
        const body = JSON.parse(String(createCall.init?.body));
        expect(body.albumId).toBe('al-w12b');
        expect(typeof body.expiresAt).toBe('string'); // 7-day expiry serialized
        fireEvent.click(screen.getByRole('button', { name: 'Copy shared link' }));
        expect(writeText).toHaveBeenCalledWith('https://office-mac.ts.net/share/k-new');
    });
});
