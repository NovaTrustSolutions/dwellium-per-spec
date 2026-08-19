/**
 * Interactive Docs wave 3B — "Shared with me" in the library + role gating:
 * opening a `view`-role doc renders the SharedDocViewer (no editor toolbar);
 * `edit` role gets the full editor; comment role posts via POST …/comments.
 * Real timers only.
 */
import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import InteractiveDocs from '../components/Scribe/idocs/InteractiveDocs';
import IDocLibrary from '../components/Scribe/idocs/IDocLibrary';
import { idocsStore, idocsUserIdHolder, replaceDoc, setActive, setView } from '../components/Scribe/idocs/idocsStore';
import { createEmptyDoc, type IDoc } from '../components/Scribe/idocs/idocTypes';
import { consumePendingWidgetAction } from '../lib/widgetActions';

class MockResizeObserver { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
beforeAll(() => { vi.stubGlobal('ResizeObserver', MockResizeObserver); });
afterEach(cleanup);
// InteractiveDocs sets the holder from UserContext (null in tests) → keep the store anonymous so seeded docs are visible.
beforeEach(() => { localStorage.clear(); idocsStore.reset(); idocsUserIdHolder.current = null; consumePendingWidgetAction('scribe'); });

const remoteDoc = (): IDoc => createEmptyDoc({ id: 'doc-shared-1', title: 'Board Deck', cards: [{ id: 'c1', title: 'Intro', layout: 'default', blocks: [{ id: 'b1', type: 'text', md: 'Hello board' }] }] });

function fakeApi(role: 'view' | 'comment' | 'edit') {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input); const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
        if (method === 'GET' && /\/api\/idocs\/shared$/.test(url)) return ok({ items: [
            { docId: 'doc-shared-1', title: 'Board Deck', owner: { id: 'own', name: 'Olive Owner' }, role, version: 3, updatedAt: '2026-08-19T10:00:00Z', memberCount: 2 },
            { docId: 'doc-mine', title: 'Mine', owner: { id: 'me', name: 'Me' }, role: 'owner', version: 1, updatedAt: '2026-08-19T10:00:00Z', memberCount: 1 },
        ] });
        if (method === 'GET' && /\/api\/idocs\/shared\/doc-shared-1$/.test(url)) return ok({ doc: remoteDoc(), version: 3, updatedAt: '2026-08-19T10:00:00Z', updatedBy: { id: 'own', name: 'Olive Owner' }, role, owner: { id: 'own', name: 'Olive Owner' }, members: [] });
        if (method === 'POST' && /\/presence$/.test(url)) return ok({ others: [{ userId: 'own', name: 'Olive Owner', cardId: 'c1', at: 't' }] });
        if (method === 'POST' && /\/comments$/.test(url)) return ok({ comment: { id: 'cm1', author: 'Me', text: 'nice', at: 't' }, version: 4 });
        return new Response(JSON.stringify({ success: false, error: 'no-route' }), { status: 404 });
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
}

describe('Shared with me (library)', () => {
    it('lists items shared with me (owner rows excluded) and opens one as a remote doc with shared metadata', async () => {
        const api = fakeApi('view');
        render(<IDocLibrary state={idocsStore.getSnapshot()} api={{ fetchFn: api.fetchFn, base: '' }} />);
        const section = await screen.findByTestId('idoc-shared-with-me');
        expect(within(section).getByText('Board Deck')).toBeInTheDocument();
        expect(within(section).queryByText('Mine')).toBeNull();
        expect(within(section).getByText(/Olive Owner · view · v3/)).toBeInTheDocument();
        fireEvent.click(within(section).getByRole('button', { name: /Board Deck/ }));
        await waitFor(() => expect(idocsStore.getSnapshot().activeId).toBe('doc-shared-1'));
        const s = idocsStore.getSnapshot();
        expect(s.view).toBe('edit');
        expect(s.docs.find((d) => d.id === 'doc-shared-1')?.shared).toEqual({ version: 3, updatedAt: '2026-08-19T10:00:00Z', role: 'view', ownerId: 'own', ownerName: 'Olive Owner' });
    });

    it('backend down → no section, library still works', async () => {
        const down = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
        render(<IDocLibrary state={idocsStore.getSnapshot()} api={{ fetchFn: down, base: '' }} />);
        expect(screen.getByRole('heading', { name: 'Interactive Docs' })).toBeInTheDocument();
        await new Promise((r) => setTimeout(r, 30));
        expect(screen.queryByTestId('idoc-shared-with-me')).toBeNull();
    });
});

describe('Role gating', () => {
    it('view role → SharedDocViewer (renderer, no editor toolbar / no Comments button)', async () => {
        vi.stubGlobal('fetch', fakeApi('view').fetchFn);
        replaceDoc({ ...remoteDoc(), shared: { version: 3, role: 'view', ownerId: 'own', ownerName: 'Olive Owner' } });
        setActive('doc-shared-1'); setView('edit');
        render(<InteractiveDocs />);
        expect(await screen.findByTestId('idoc-shared-viewer')).toBeInTheDocument();
        expect(screen.queryByTestId('idoc-editor')).toBeNull();
        expect(screen.queryByLabelText('Document title')).toBeNull(); // no editable title
        expect(screen.queryByRole('button', { name: 'Publish ▾' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Comments' })).toBeNull();
        expect(screen.getByText('Hello board')).toBeInTheDocument();
        expect(screen.getByText(/Shared by Olive Owner · view/)).toBeInTheDocument();
        // presence chips
        expect(await screen.findByTestId('idoc-presence')).toHaveTextContent('OO');
        vi.unstubAllGlobals();
    });

    it('comment role → viewer + Comments drawer; new comment goes to POST /shared/:docId/comments (not the local store)', async () => {
        const api = fakeApi('comment');
        vi.stubGlobal('fetch', api.fetchFn);
        replaceDoc({ ...remoteDoc(), shared: { version: 3, role: 'comment', ownerId: 'own', ownerName: 'Olive Owner' } });
        setActive('doc-shared-1'); setView('edit');
        render(<InteractiveDocs />);
        await screen.findByTestId('idoc-shared-viewer');
        fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
        const panel = await screen.findByTestId('idoc-comments');
        fireEvent.change(within(panel).getByLabelText('New comment'), { target: { value: 'nice' } });
        fireEvent.click(within(panel).getByRole('button', { name: 'Comment' }));
        await waitFor(() => expect(api.calls.some((c) => c.method === 'POST' && /\/comments$/.test(c.url))).toBe(true));
        expect(api.calls.find((c) => /\/comments$/.test(c.url))?.body).toEqual({ cardId: 'c1', text: 'nice' });
        vi.unstubAllGlobals();
    });

    it('edit role → full editor with the shared badge', async () => {
        vi.stubGlobal('fetch', fakeApi('edit').fetchFn);
        replaceDoc({ ...remoteDoc(), shared: { version: 3, role: 'edit', ownerId: 'own', ownerName: 'Olive Owner' } });
        setActive('doc-shared-1'); setView('edit');
        render(<InteractiveDocs />);
        expect(await screen.findByTestId('idoc-editor')).toBeInTheDocument();
        expect(screen.getByLabelText('Document title')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Publish ▾' })).toBeInTheDocument();
        expect(screen.getByText(/Shared · edit/)).toBeInTheDocument();
        vi.unstubAllGlobals();
    });
});
