/**
 * Interactive Docs wave 3B — useSharedDocSync (live-lite). Real timers only
 * (React 19 + fake timers = stranded commits, see root CLAUDE.md); polling /
 * debounce intervals are injected (~20 ms) and asserted with `waitFor`.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { idocsStore, idocsUserIdHolder, replaceDoc, updateDoc } from '../components/Scribe/idocs/idocsStore';
import { createEmptyDoc, type IDoc } from '../components/Scribe/idocs/idocTypes';
import { useSharedDocSync } from '../components/Scribe/idocs/useSharedDocSync';
import { SyncBanner } from '../components/Scribe/idocs/SharedDocViewer';
import { useIdocs } from '../components/Scribe/idocs/idocsStore';

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); idocsStore.reset(); idocsUserIdHolder.current = 'me'; });

type Route = { method: string; path: RegExp; reply: (body: unknown) => { status: number; body: unknown } };
function fakeApi(routes: Route[]) {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input); const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method, url, body });
        const r = routes.find((x) => x.method === method && x.path.test(url));
        if (!r) return new Response(JSON.stringify({ success: false, error: 'no-route' }), { status: 404 });
        const out = r.reply(body);
        return new Response(JSON.stringify(out.body), { status: out.status });
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
}
const okEnv = (data: unknown) => ({ status: 200, body: { success: true, data } });

function Harness({ docId, api }: { docId: string; api: { fetchFn: typeof fetch } }) {
    const { docs } = useIdocs();
    const doc = docs.find((d) => d.id === docId) ?? null;
    const sync = useSharedDocSync(doc, { api: { ...api, base: '' }, pollMs: 20, hiddenPollMs: 20, presenceMs: 30, saveDebounceMs: 20, activeCardId: doc?.cards[0]?.id });
    return (
        <div>
            <SyncBanner sync={sync} />
            <span data-testid="title">{doc?.title}</span>
            <span data-testid="version">{doc?.shared?.version}</span>
            <span data-testid="others">{sync.others.map((o) => o.name).join(',')}</span>
        </div>
    );
}

const remote = (patch: Partial<IDoc>): IDoc => ({ ...createEmptyDoc({ id: 'doc-s', title: 'Remote title' }), ...patch });
const seed = (role: 'owner' | 'edit' | 'view' = 'owner') => replaceDoc({ ...createEmptyDoc({ id: 'doc-s', title: 'Local title' }), shared: { version: 1, updatedAt: 't1', role, ownerId: 'me' } });

describe('useSharedDocSync', () => {
    it('newer server version + no local edits → applied silently (store updated, version bumped)', async () => {
        seed('owner');
        const api = fakeApi([
            { method: 'GET', path: /\/shared\/doc-s$/, reply: () => okEnv({ doc: remote({ title: 'Remote title' }), version: 2, updatedAt: 't2', updatedBy: { id: 'b', name: 'Bea' }, role: 'owner', owner: { id: 'me', name: 'Me' }, members: [] }) },
            { method: 'POST', path: /\/presence$/, reply: () => okEnv({ others: [{ userId: 'b', name: 'Bea', cardId: 'c', at: 't' }] }) },
        ]);
        render(<Harness docId="doc-s" api={api} />);
        await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Remote title'));
        expect(screen.getByTestId('version')).toHaveTextContent('2');
        expect(screen.queryByTestId('idoc-sync-conflict')).toBeNull();
        expect(idocsStore.getSnapshot().docs[0].shared).toMatchObject({ version: 2, role: 'owner', ownerName: 'Me' });
        // presence chips fed from POST presence
        await waitFor(() => expect(screen.getByTestId('others')).toHaveTextContent('Bea'));
        // presence body carries the active card (the remote doc replaced the cards, so just check the shape)
        expect(api.calls.find((c) => c.method === 'POST' && /presence/.test(c.url))?.body).toEqual({ cardId: expect.stringMatching(/^c-/) });
    });

    it('newer server version + pending local edits → banner; "Load theirs" applies the server doc', async () => {
        seed('edit');
        let serverVersion = 1;
        const api = fakeApi([
            { method: 'GET', path: /\/shared\/doc-s$/, reply: () => okEnv({ doc: remote({ title: 'Theirs' }), version: serverVersion, updatedAt: 't2', updatedBy: { id: 'b', name: 'Bea' }, role: 'edit', owner: { id: 'o', name: 'Own' }, members: [] }) },
            // saves fail with 409 so the local edit stays "pending"
            { method: 'PUT', path: /\/shared\/doc-s$/, reply: () => ({ status: 409, body: { success: false, error: 'version-conflict', current: { doc: remote({ title: 'Theirs' }), version: 2, updatedAt: 't2', updatedBy: { id: 'b', name: 'Bea' } } } }) },
            { method: 'POST', path: /\/presence$/, reply: () => okEnv({ others: [] }) },
        ]);
        render(<Harness docId="doc-s" api={api} />);
        // local edit → dirty
        updateDoc('doc-s', { title: 'Mine (edited)' });
        serverVersion = 2;
        expect(await screen.findByTestId('idoc-sync-conflict')).toHaveTextContent('Newer version from Bea');
        expect(screen.getByTestId('title')).toHaveTextContent('Mine (edited)'); // NOT overwritten silently
        fireEvent.click(screen.getByRole('button', { name: 'Load theirs' }));
        await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Theirs'));
        expect(screen.getByTestId('version')).toHaveTextContent('2');
        await waitFor(() => expect(screen.queryByTestId('idoc-sync-conflict')).toBeNull());
    });

    it('local edit → debounced PUT with last-seen version; 409 → banner; "Keep mine" force-saves without version', async () => {
        seed('owner');
        const puts: unknown[] = [];
        let conflictOnce = true;
        const api = fakeApi([
            { method: 'GET', path: /\/shared\/doc-s$/, reply: () => okEnv({ doc: remote({ title: 'Local title' }), version: 1, updatedAt: 't1', updatedBy: { id: 'me', name: 'Me' }, role: 'owner', owner: { id: 'me', name: 'Me' }, members: [] }) },
            { method: 'PUT', path: /\/shared\/doc-s$/, reply: (body) => {
                puts.push(body);
                if (conflictOnce) { conflictOnce = false; return { status: 409, body: { success: false, error: 'version-conflict', current: { doc: remote({ title: 'Server side' }), version: 3, updatedAt: 't3', updatedBy: { id: 'b', name: 'Bea' } } } }; }
                return okEnv({ version: 4, updatedAt: 't4' });
            } },
            { method: 'POST', path: /\/presence$/, reply: () => okEnv({ others: [] }) },
        ]);
        render(<Harness docId="doc-s" api={api} />);
        updateDoc('doc-s', { title: 'Mine v2' });
        expect(await screen.findByTestId('idoc-sync-conflict')).toHaveTextContent('Bea');
        expect(puts).toHaveLength(1);
        expect(puts[0]).toMatchObject({ version: 1, doc: { title: 'Mine v2' } });
        expect((puts[0] as { doc: IDoc }).doc.shared).toBeUndefined(); // client-local metadata stripped
        fireEvent.click(screen.getByRole('button', { name: 'Keep mine (overwrites)' }));
        await waitFor(() => expect(puts).toHaveLength(2));
        expect((puts[1] as { version?: number }).version).toBeUndefined();
        await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('4'));
        expect(screen.queryByTestId('idoc-sync-conflict')).toBeNull();
        expect(screen.getByTestId('title')).toHaveTextContent('Mine v2');
    });

    it('view role never PUTs, and does nothing when doc.shared is absent', async () => {
        seed('view');
        const api = fakeApi([
            { method: 'GET', path: /\/shared\/doc-s$/, reply: () => okEnv({ doc: remote({ title: 'Local title' }), version: 1, updatedAt: 't1', updatedBy: { id: 'o', name: 'O' }, role: 'view', owner: { id: 'o', name: 'O' }, members: [] }) },
            { method: 'POST', path: /\/presence$/, reply: () => okEnv({ others: [] }) },
        ]);
        render(<Harness docId="doc-s" api={api} />);
        updateDoc('doc-s', { title: 'Local tweak' });
        await waitFor(() => expect(api.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(1));
        expect(api.calls.some((c) => c.method === 'PUT')).toBe(false);
        cleanup();
        // Unshared doc → no traffic at all
        const api2 = fakeApi([]);
        replaceDoc(createEmptyDoc({ id: 'doc-plain', title: 'Plain' }));
        render(<Harness docId="doc-plain" api={api2} />);
        await new Promise((r) => setTimeout(r, 80));
        expect(api2.calls).toHaveLength(0);
    });
});
