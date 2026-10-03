/**
 * Owner-race guard coverage for Interactive Docs (src/components/Scribe/idocs). Each site starts
 * async work as user A on a deferred await, the account switches (A → logout → B) mid-await, the
 * await resolves, and the late result must be DROPPED: no localStorage key (A's store, B's store,
 * anything) carries it, and the busy UI still clears. Every site has a no-switch CONTROL proving
 * the write normally lands in A. See ownerGuard.test.ts for the captureOwner primitive.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createElement as h, type ReactElement } from 'react';
import { render, renderHook, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ generateDocFromPrompt: vi.fn(), rewriteBlockMd: vi.fn(), importFromUrl: vi.fn(), docAiRun: vi.fn() }));
vi.mock('../lib/llmClient', async (orig) => ({ ...(await orig<object>()), hasActiveLlm: () => true }));
vi.mock('../components/Scribe/idocs/idocsAi', async (orig) => ({ ...(await orig<object>()), generateDocFromPrompt: mocks.generateDocFromPrompt, rewriteBlockMd: mocks.rewriteBlockMd }));
vi.mock('../components/Scribe/idocs/idocsImport', async (orig) => ({ ...(await orig<object>()), importFromUrl: mocks.importFromUrl }));
vi.mock('../components/Scribe/idocs/idocsDocAi', async (orig) => ({ ...(await orig<object>()), DOC_AI_ACTIONS: [{ id: 'late', label: 'Late action', run: mocks.docAiRun }] }));

import { UserContext } from '../context/UserContext';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { WIDGET_ACTION_EVENT, consumePendingWidgetAction } from '../lib/widgetActions';
import InteractiveDocs from '../components/Scribe/idocs/InteractiveDocs';
import IDocLibrary from '../components/Scribe/idocs/IDocLibrary';
import IDocEditor from '../components/Scribe/idocs/IDocEditor';
import PublishDialog from '../components/Scribe/idocs/PublishDialog';
import ShareDialog from '../components/Scribe/idocs/ShareDialog';
import SharedDocViewer from '../components/Scribe/idocs/SharedDocViewer';
import { useSharedDocSync } from '../components/Scribe/idocs/useSharedDocSync';
import { idocsStore, idocsUserIdHolder, replaceDoc, updateDoc } from '../components/Scribe/idocs/idocsStore';
import { createEmptyCard, createEmptyDoc, type IDoc } from '../components/Scribe/idocs/idocTypes';

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}
const LATE = 'late-result-q7'; // slug-safe marker carried by every late result
const lateDoc = (id = 'late-doc'): IDoc => createEmptyDoc({ id, title: LATE });
/** A doc with fixed card/block ids — what two members of one shared doc both hold. */
const fixedDoc = (id: string): IDoc => createEmptyDoc({ id, title: 'Shared', cards: [{ id: 'c1', title: 'Intro', layout: 'default', blocks: [{ id: 'b1', type: 'text', md: 'hello' }] }] });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
/** Every localStorage key whose payload carries the late result. */
const carriers = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '')
    .filter((k) => (localStorage.getItem(k) ?? '').includes(LATE)).sort();
const asUser = (id: string | null) => { setPerUserIdentity(id); idocsUserIdHolder.current = id; };
const switchAccount = () => { asUser(null); asUser('user-b'); };
/** B holds the same doc id (collaborator on a shared doc / same server id). */
const seedB = (doc: IDoc) => { asUser('user-b'); replaceDoc(doc); asUser('user-a'); };

/**
 * Render under a signed-in user. Components here call useIntegrations → usePerUserIdentity during
 * render, so the switch must re-render the tree under each account (A → logout → B), as the app does.
 */
function mount(el: () => ReactElement): () => void {
    let user: string | null = 'user-a';
    const tree = () => h(UserContext.Provider, { value: (user ? { user: { id: user } } : null) as never }, el());
    const r = render(tree());
    return () => {
        asUser(null); user = null; r.rerender(tree());
        asUser('user-b'); user = 'user-b'; r.rerender(tree());
    };
}

function gatedApi(gate: { method: string; path: RegExp }, reply: (method: string, url: string) => unknown) {
    const open = deferred<void>(); const calls: string[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input); const method = init?.method ?? 'GET';
        calls.push(`${method} ${url}`);
        if (method === gate.method && gate.path.test(url)) await open.promise;
        return new Response(JSON.stringify({ success: true, data: reply(method, url) }), { status: 200 });
    }) as unknown as typeof fetch;
    return { deps: { fetchFn, base: '' }, calls, release: () => open.resolve() };
}
const noShared = gatedApi({ method: 'NONE', path: /$^/ }, () => ({ items: [] })).deps;

interface Site { name: string; run: (switchMid: boolean) => Promise<void>; dropped?: () => void; landed?: () => void }

const SITES: Site[] = [
    {
        name: 'InteractiveDocs widget-action apply (generateDocFromPrompt)',
        async run(sw) {
            const d = deferred<IDoc | null>(); mocks.generateDocFromPrompt.mockReturnValue(d.promise);
            const doSwitch = mount(() => h(InteractiveDocs));
            act(() => { window.dispatchEvent(new CustomEvent(WIDGET_ACTION_EVENT, { detail: { widget: 'scribe', verb: 'create-interactive-doc', payload: { text: 'make a doc' } } })); });
            expect(screen.getByText(/Generating your Interactive Doc/)).toBeInTheDocument();
            if (sw) doSwitch();
            await act(async () => { d.resolve(lateDoc()); });
            await settle();
            expect(screen.queryByText(/Generating your Interactive Doc/)).toBeNull();
        },
    },
    {
        name: 'IDocLibrary import from URL → open',
        async run(sw) {
            const d = deferred<unknown>(); mocks.importFromUrl.mockReturnValue(d.promise);
            const doSwitch = mount(() => h(IDocLibrary, { state: idocsStore.getSnapshot(), api: noShared }));
            fireEvent.click(screen.getByRole('button', { name: 'From URL' }));
            fireEvent.change(screen.getByLabelText('Page URL'), { target: { value: 'https://example.test/a' } });
            fireEvent.click(screen.getByRole('button', { name: 'Import with AI' }));
            expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled();
            if (sw) doSwitch();
            await act(async () => { d.resolve({ doc: lateDoc() }); });
            await settle();
            expect(screen.getByRole('button', { name: 'Import with AI' })).toBeEnabled();
        },
    },
    {
        name: 'IDocLibrary open a doc shared with me (getSharedDoc)',
        async run(sw) {
            const api = gatedApi({ method: 'GET', path: /\/shared\/doc-shared-1$/ }, (_m, url) => (/\/shared$/.test(url)
                ? { items: [{ docId: 'doc-shared-1', title: 'Board Deck', owner: { id: 'own', name: 'Olive' }, role: 'edit', version: 3, updatedAt: 't', memberCount: 2 }] }
                : { doc: lateDoc('doc-shared-1'), version: 3, updatedAt: 't', role: 'edit', owner: { id: 'own', name: 'Olive' }, members: [] }));
            const doSwitch = mount(() => h(IDocLibrary, { state: idocsStore.getSnapshot(), api: api.deps }));
            fireEvent.click(await screen.findByRole('button', { name: /Board Deck/ }));
            await waitFor(() => expect(api.calls).toContain('GET /api/idocs/shared/doc-shared-1'));
            expect(screen.getByRole('button', { name: /^Import \(/ })).toBeDisabled();
            if (sw) doSwitch();
            await act(async () => { api.release(); });
            await settle();
            expect(screen.getByRole('button', { name: /^Import \(/ })).toBeEnabled();
        },
    },
    {
        name: 'IDocLibrary import a .json doc (file read)',
        async run(sw) {
            const d = deferred<string>();
            const doSwitch = mount(() => h(IDocLibrary, { state: idocsStore.getSnapshot(), api: noShared }));
            fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [{ name: 'late.json', text: () => d.promise }] } });
            expect(screen.getByRole('button', { name: /^Import \(/ })).toBeDisabled();
            if (sw) doSwitch();
            await act(async () => { d.resolve(JSON.stringify(lateDoc())); });
            await settle();
            expect(screen.getByRole('button', { name: /^Import \(/ })).toBeEnabled();
        },
    },
    {
        name: 'IDocEditor paste cards (clipboard read → save)',
        async run(sw) {
            const doc = createEmptyDoc({ id: 'doc-a', title: 'A doc' }); replaceDoc(doc);
            const d = deferred<string>();
            Object.defineProperty(navigator, 'clipboard', { value: { readText: () => d.promise, writeText: async () => {} }, configurable: true });
            const doSwitch = mount(() => h(IDocEditor, { doc }));
            fireEvent.click(screen.getByRole('button', { name: 'Paste card' }));
            if (sw) doSwitch();
            await act(async () => { d.resolve(JSON.stringify([createEmptyCard({ title: LATE })])); });
            await settle();
        },
    },
    {
        name: 'IDocEditor doc-level AI action (runDocAi)',
        async run(sw) {
            const doc = createEmptyDoc({ id: 'doc-a', title: 'A doc' }); replaceDoc(doc);
            const d = deferred<IDoc | null>(); mocks.docAiRun.mockReturnValue(d.promise);
            const doSwitch = mount(() => h(IDocEditor, { doc }));
            fireEvent.click(await screen.findByTitle('Doc-level AI actions'));
            fireEvent.click(screen.getByRole('menuitem', { name: 'Late action' }));
            expect(screen.getByTitle('Doc-level AI actions')).toHaveTextContent('AI… ▾');
            if (sw) doSwitch();
            await act(async () => { d.resolve({ ...doc, title: LATE }); });
            await settle();
            expect(screen.getByTitle('Doc-level AI actions')).toHaveTextContent(/^AI ▾$/);
        },
    },
    {
        name: 'IDocEditor block AI rewrite → updateCard (B holds the same shared doc)',
        async run(sw) {
            const doc = fixedDoc('doc-s'); replaceDoc(doc); seedB(doc);
            const d = deferred<string | null>(); mocks.rewriteBlockMd.mockReturnValue(d.promise);
            const doSwitch = mount(() => h(IDocEditor, { doc }));
            const blockAi = () => screen.getAllByRole('button', { name: /^AI(…)? ▾$/ }).find((b) => b.title !== 'Doc-level AI actions')!;
            fireEvent.click(blockAi());
            fireEvent.click(screen.getByRole('menuitem', { name: 'rewrite' }));
            expect(blockAi()).toHaveTextContent('AI… ▾');
            if (sw) doSwitch();
            await act(async () => { d.resolve(LATE); });
            await settle();
            expect(blockAi()).toHaveTextContent(/^AI ▾$/);
        },
    },
    {
        name: 'SharedDocViewer post comment → refresh (poll starts after the await)',
        async run(sw) {
            const doc: IDoc = { ...fixedDoc('doc-c'), shared: { version: 1, updatedAt: 't1', role: 'comment', ownerId: 'own' } };
            replaceDoc(doc);
            const api = gatedApi({ method: 'POST', path: /\/comments$/ }, (_m, url) => (/presence$/.test(url) ? { others: [] }
                : /comments$/.test(url) ? { comment: { id: 'cm1', author: 'A', text: 'hi', at: 't' }, version: 2 }
                    : { doc: lateDoc('doc-c'), version: 2, updatedAt: 't2', role: 'comment', owner: { id: 'own', name: 'O' }, members: [] }));
            const doSwitch = mount(() => h(SharedDocViewer, { doc, api: api.deps }));
            fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
            const panel = await screen.findByTestId('idoc-comments');
            fireEvent.change(within(panel).getByLabelText('New comment'), { target: { value: 'hi' } });
            fireEvent.click(within(panel).getByRole('button', { name: 'Comment' }));
            await waitFor(() => expect(api.calls.some((c) => c.endsWith('/comments'))).toBe(true));
            if (sw) doSwitch();
            await act(async () => { api.release(); });
            await settle();
        },
    },
    {
        name: 'useSharedDocSync poll → applyRemote',
        async run(sw) {
            const doc: IDoc = { ...createEmptyDoc({ id: 'doc-s', title: 'Shared' }), shared: { version: 1, updatedAt: 't1', role: 'view', ownerId: 'own' } };
            replaceDoc(doc);
            const api = gatedApi({ method: 'GET', path: /\/shared\/doc-s$/ }, (_m, url) => (/presence$/.test(url)
                ? { others: [] }
                : { doc: lateDoc('doc-s'), version: 2, updatedAt: 't2', role: 'view', owner: { id: 'own', name: 'O' }, members: [] }));
            const { result } = renderHook(() => useSharedDocSync(doc, { api: api.deps, pollMs: 1e6, hiddenPollMs: 1e6, presenceMs: 1e6 }));
            let p!: Promise<void>;
            act(() => { p = result.current.refresh(); });
            if (sw) switchAccount();
            await act(async () => { api.release(); await p; });
        },
    },
    {
        name: 'useSharedDocSync save → version bump (B holds the same shared doc)',
        async run(sw) {
            const doc: IDoc = { ...createEmptyDoc({ id: 'doc-s', title: 'Shared' }), shared: { version: 1, updatedAt: 't1', role: 'owner' } };
            replaceDoc(doc); seedB({ ...doc, shared: { version: 1, updatedAt: 't1', role: 'edit', ownerId: 'user-a' } });
            const api = gatedApi({ method: 'PUT', path: /\/shared\/doc-s$/ }, (_m, url) => (/presence$/.test(url) ? { others: [] } : { version: 2, updatedAt: LATE }));
            const { result } = renderHook(() => useSharedDocSync(doc, { api: api.deps, pollMs: 1e6, hiddenPollMs: 1e6, presenceMs: 1e6 }));
            act(() => result.current.keepMine());
            await waitFor(() => expect(result.current.saving).toBe(true));
            if (sw) switchAccount();
            await act(async () => { api.release(); });
            await settle();
            expect(result.current.saving).toBe(false);
        },
    },
    {
        name: 'PublishDialog publish (B holds the same doc id)',
        async run(sw) {
            const doc = createEmptyDoc({ id: 'doc-x', title: 'Deck' }); replaceDoc(doc); seedB(doc);
            const api = gatedApi({ method: 'POST', path: /\/publish$/ }, () => ({ slug: LATE, url: `/p/${LATE}`, publishedAt: 't' }));
            render(h(PublishDialog, { doc, onClose: () => {}, api: api.deps }));
            fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
            expect(screen.getByRole('button', { name: 'Publishing…' })).toBeDisabled();
            if (sw) switchAccount();
            await act(async () => { api.release(); });
            await settle();
            expect(screen.getByRole('button', { name: /Publish$/ })).toBeEnabled();
        },
    },
    {
        name: 'PublishDialog unpublish (B holds the same doc id)',
        async run(sw) {
            const doc: IDoc = { ...createEmptyDoc({ id: 'doc-x', title: 'Deck' }), publication: { slug: 'deck', url: '/p/deck', publishedAt: LATE } };
            replaceDoc(doc); seedB(doc);
            const api = gatedApi({ method: 'DELETE', path: /\/publications\/deck$/ }, () => ({ ok: true }));
            render(h(PublishDialog, { doc, onClose: () => {}, api: api.deps }));
            fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
            expect(screen.getByRole('button', { name: 'Unpublishing…' })).toBeDisabled();
            if (sw) switchAccount();
            await act(async () => { api.release(); });
            await settle();
            expect(screen.getByRole('button', { name: 'Unpublish' })).toBeEnabled();
        },
        // Removal write: B's copy must keep its publication; A's copy is untouched too.
        dropped: () => expect(carriers()).toEqual(['scribe-idocs:user-a', 'scribe-idocs:user-b']),
        landed: () => expect(carriers()).toEqual(['scribe-idocs:user-b']),
    },
    {
        name: 'ShareDialog first share (putSharedDoc → updateDoc → setMembers)',
        async run(sw) {
            const doc = createEmptyDoc({ id: 'doc-x', title: 'Deck' }); replaceDoc(doc);
            const api = gatedApi({ method: 'PUT', path: /\/shared\/doc-x$/ }, (_m, url) => (/members$/.test(url) ? { members: [] } : { version: 1, updatedAt: LATE }));
            render(h(ShareDialog, { doc, onClose: () => {}, api: api.deps }));
            fireEvent.click(screen.getByRole('button', { name: 'Share' }));
            expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
            if (sw) switchAccount();
            await act(async () => { api.release(); });
            await settle();
            expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled();
            shareCalls = api.calls;
        },
        // No store write AND no member-list PUT sent on the new account's session.
        dropped: () => { expect(carriers()).toEqual([]); expect(shareCalls.some((c) => c.endsWith('/members'))).toBe(false); },
        landed: () => { expect(carriers()).toContain('scribe-idocs:user-a'); expect(shareCalls.some((c) => c.endsWith('/members'))).toBe(true); },
    },
    {
        name: 'ShareDialog stop sharing (B holds the same shared doc)',
        async run(sw) {
            const doc: IDoc = { ...createEmptyDoc({ id: 'doc-x', title: 'Deck' }), shared: { version: 1, updatedAt: LATE, role: 'owner' } };
            replaceDoc(doc); seedB({ ...doc, shared: { version: 1, updatedAt: LATE, role: 'edit' } });
            const api = gatedApi({ method: 'DELETE', path: /\/shared\/doc-x$/ }, () => ({ ok: true, members: [] }));
            render(h(ShareDialog, { doc, onClose: () => {}, api: api.deps }));
            fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
            expect(screen.getByRole('button', { name: 'Stopping…' })).toBeDisabled();
            if (sw) switchAccount();
            await act(async () => { api.release(); });
            await settle();
            expect(screen.getByRole('button', { name: 'Stop sharing' })).toBeEnabled();
        },
        // Removal write: B's copy must stay shared; A's copy is untouched too.
        dropped: () => expect(carriers()).toEqual(['scribe-idocs:user-a', 'scribe-idocs:user-b']),
        landed: () => expect(carriers()).toEqual(['scribe-idocs:user-b']),
    },
];
let shareCalls: string[] = [];

class MockResizeObserver { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
beforeAll(() => { vi.stubGlobal('ResizeObserver', MockResizeObserver); });
beforeEach(() => { localStorage.clear(); idocsStore.reset(); asUser('user-a'); consumePendingWidgetAction('scribe'); shareCalls = []; });
afterEach(() => {
    cleanup();
    delete (navigator as { clipboard?: unknown }).clipboard;
    asUser(null);
});

describe.each(SITES)('owner-race guard — $name', (site) => {
    it('account switches mid-await → the late result is dropped (neither A nor B) and busy clears', async () => {
        await site.run(true);
        (site.dropped ?? (() => expect(carriers()).toEqual([])))();
    });
    it('control: no switch → the write lands in A', async () => {
        await site.run(false);
        (site.landed ?? (() => expect(carriers()).toContain('scribe-idocs:user-a')))();
    });
});

describe('idocsStore.updateDoc — id this account does not hold', () => {
    it('is a no-op: no set(), so no One Save write-through / dirty marker for B', () => {
        const set = vi.spyOn(idocsStore, 'set');
        updateDoc('not-here', { title: 'x' });
        expect(set).not.toHaveBeenCalled();
        set.mockRestore();
    });
    it('control: a held id is written', () => {
        replaceDoc(createEmptyDoc({ id: 'here', title: 'old' }));
        const set = vi.spyOn(idocsStore, 'set');
        updateDoc('here', { title: 'new' });
        expect(set).toHaveBeenCalledTimes(1);
        expect(idocsStore.getSnapshot().docs[0].title).toBe('new');
        set.mockRestore();
    });
});
