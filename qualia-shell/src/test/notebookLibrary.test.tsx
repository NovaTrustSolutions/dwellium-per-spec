/**
 * NotebookLM widget — Library section (plan 052: NotebookLM → ARA Library).
 *
 * GET /api/library/status + /api/library/sources → three sync states
 * (never / stale > 8 days / fresh), collections grouped with counts, the
 * embeddings-not-configured warning, explicit error + Retry, the three sync
 * commands, and the per-source Remove flow (confirm → DELETE → reload).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import LibrarySection, { STALE_AFTER_MS, SYNC_COMMANDS, syncState } from '../components/NotebookLMContext/LibrarySection';

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => body,
    } as unknown as Response;
}

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const fresh = new Date(now - DAY).toISOString();
const stale = new Date(now - 10 * DAY).toISOString();

const SOURCES = [
    { id: 'library:andy/Housing Law:s1', collection: 'andy/Housing Law', sourceId: 's1', notebookId: 'nb1', notebookTitle: 'Housing Law', title: 'OCGA § 44-7', url: 'https://law.example/44-7', chars: 12000, chunks: 9, contentHash: 'h1', updatedAt: fresh },
    { id: 'library:andy/Housing Law:s2', collection: 'andy/Housing Law', sourceId: 's2', notebookId: 'nb1', notebookTitle: 'Housing Law', title: 'Security deposits', url: null, chars: 800, chunks: 1, contentHash: 'h2', updatedAt: fresh },
    { id: 'library:ilya/Contracts:s3', collection: 'ilya/Contracts', sourceId: 's3', notebookId: 'nb2', notebookTitle: 'Contracts', title: 'Woodland Parc lease', url: null, chars: 5000, chunks: 4, contentHash: 'h3', updatedAt: fresh },
];

function statusBody(overrides: Partial<{ embeddingsConfigured: boolean; sources: number; collections: unknown[]; lastSyncedAt: string | null }> = {}) {
    return {
        success: true,
        embeddingsConfigured: true,
        sources: 3,
        collections: [
            { name: 'andy/Housing Law', sources: 2, lastSyncedAt: fresh },
            { name: 'ilya/Contracts', sources: 1, lastSyncedAt: fresh },
        ],
        lastSyncedAt: fresh,
        ...overrides,
    };
}

/** Route GET status / GET sources / DELETE by URL + method. */
function routeFetch(opts: { status?: unknown; sources?: typeof SOURCES; deletes?: string[] } = {}) {
    const sources = [...(opts.sources ?? SOURCES)];
    return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === 'DELETE') {
            opts.deletes?.push(u);
            const id = decodeURIComponent(u.split('/api/library/sources/')[1]);
            const i = sources.findIndex(s => s.id === id);
            if (i >= 0) sources.splice(i, 1);
            return jsonResponse({ success: true });
        }
        if (u.endsWith('/api/library/status')) return jsonResponse(opts.status ?? statusBody());
        if (u.endsWith('/api/library/sources')) return jsonResponse({ success: true, sources });
        return jsonResponse({ success: false, error: `unexpected ${u}` }, 404);
    });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('syncState', () => {
    it('never / stale (> 8 days) / fresh', () => {
        expect(syncState(null)).toBe('never');
        expect(syncState('not-a-date')).toBe('never');
        expect(syncState(new Date(now - STALE_AFTER_MS - 1000).toISOString(), now)).toBe('stale');
        expect(syncState(new Date(now - STALE_AFTER_MS + 1000).toISOString(), now)).toBe('fresh');
    });
});

describe('LibrarySection', () => {
    it('never synced → pill + empty state + the three sync commands', async () => {
        vi.stubGlobal('fetch', routeFetch({ status: statusBody({ sources: 0, collections: [], lastSyncedAt: null }), sources: [] }));
        render(<LibrarySection />);
        await waitFor(() => expect(screen.getByText('Never synced')).toBeInTheDocument());
        expect(screen.getByText(/Nothing synced yet/)).toBeInTheDocument();
        expect(screen.getByText('Library (ARA reads this)')).toBeInTheDocument();
        const pre = document.querySelector('.nlm-library-howto pre');
        expect(pre?.textContent).toBe(SYNC_COMMANDS.join('\n'));
        expect(SYNC_COMMANDS).toEqual(['nlm login -p andy', 'nlm login -p ilya', 'tools/notebooklm/sync.sh']);
        expect(screen.getByText('tools/notebooklm/README.md')).toBeInTheDocument();
        expect(screen.queryByText(/Embeddings not configured/)).toBeNull();
    });

    it('stale (> 8 days) → stale pill', async () => {
        vi.stubGlobal('fetch', routeFetch({ status: statusBody({ lastSyncedAt: stale }) }));
        render(<LibrarySection />);
        await waitFor(() => expect(screen.getByText('Stale — last sync > 8 days')).toBeInTheDocument());
    });

    it('fresh → pill, totals, collections grouped with counts; expanding lists title · chars · chunks', async () => {
        vi.stubGlobal('fetch', routeFetch());
        render(<LibrarySection />);
        await waitFor(() => expect(screen.getByText('Fresh')).toBeInTheDocument());
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('andy/Housing Law')).toBeInTheDocument();
        expect(screen.getByText('ilya/Contracts')).toBeInTheDocument();
        expect(screen.getByText(/2 sources · synced/)).toBeInTheDocument();
        expect(screen.getByText(/1 source · synced/)).toBeInTheDocument();
        // collapsed by default
        expect(screen.queryByText('OCGA § 44-7')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /andy\/Housing Law/ }));
        expect(screen.getByText('OCGA § 44-7')).toBeInTheDocument();
        expect(screen.getByText('12,000 chars · 9 chunks')).toBeInTheDocument();
        expect(screen.getByText('800 chars · 1 chunk')).toBeInTheDocument();
        expect(screen.queryByText('Woodland Parc lease')).toBeNull();
    });

    it('embeddingsConfigured=false → one-line warning', async () => {
        vi.stubGlobal('fetch', routeFetch({ status: statusBody({ embeddingsConfigured: false }) }));
        render(<LibrarySection />);
        await waitFor(() => expect(screen.getByText(/Embeddings not configured on the backend/)).toBeInTheDocument());
    });

    it('backend error → explicit error + Retry reloads', async () => {
        const fetchMock = vi.fn(async () => { throw new Error('offline'); });
        vi.stubGlobal('fetch', fetchMock);
        render(<LibrarySection />);
        await waitFor(() => expect(screen.getByText(/Library unavailable: offline/)).toBeInTheDocument());
        vi.stubGlobal('fetch', routeFetch());
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.getByText('Fresh')).toBeInTheDocument());
    });

    it('non-JSON (routes missing) → explicit error, not a silent empty list', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, headers: { get: () => 'text/html' }, json: async () => ({}) }) as unknown as Response));
        render(<LibrarySection />);
        await waitFor(() => expect(screen.getByText(/Library unavailable: .*HTTP 404/)).toBeInTheDocument());
    });

    it('Remove → confirm → DELETE /api/library/sources/:id (bearer) → list reloads without it; cancel does nothing', async () => {
        const deletes: string[] = [];
        vi.stubGlobal('fetch', routeFetch({ deletes }));
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<LibrarySection />);
        await waitFor(() => expect(screen.getByText('Fresh')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /ilya\/Contracts/ }));
        const row = screen.getByText('Woodland Parc lease').closest('li') as HTMLElement;
        fireEvent.click(within(row).getByRole('button', { name: 'Remove Woodland Parc lease from the Library' }));
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(deletes).toEqual([]);

        confirm.mockReturnValue(true);
        fireEvent.click(within(row).getByRole('button', { name: 'Remove Woodland Parc lease from the Library' }));
        await waitFor(() => expect(deletes).toEqual([expect.stringMatching(/\/api\/library\/sources\/library%3Ailya%2FContracts%3As3$/)]));
        await waitFor(() => expect(screen.queryByText('Woodland Parc lease')).toBeNull());
    });
});
