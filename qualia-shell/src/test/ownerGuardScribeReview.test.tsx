/**
 * Owner-race guard — review round on the per-user-writes fix (Scribe + Workspace). Each case: work
 * starts as user-a, the account switches mid-await (setPerUserIdentity), and the late result must
 * not reach the next account: not its screen, its widget memory, its server copy (via its token)
 * or its caches.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { EditorView, runScopeHandlers } from '@codemirror/view';

// jsdom has no Range layout; CodeMirror's coordsAtPos (CommentEditor positioning) needs these.
const R = Range.prototype as unknown as Record<string, unknown>;
const RECT = { x: 0, y: 0, width: 1, height: 10, top: 0, left: 0, right: 1, bottom: 10 };
R.getClientRects ??= () => Object.assign([RECT], { item: () => RECT });
R.getBoundingClientRect ??= () => RECT;

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}
let llm = deferred<{ text: string } | null>();
vi.mock('../lib/llmClient', async (orig) => ({
    ...(await orig<typeof import('../lib/llmClient')>()),
    hasActiveLlm: () => true,
    callLlm: vi.fn(() => llm.promise),
}));
vi.mock('../hooks/useIntegrations', () => ({ useIntegrations: () => ({ integrations: { llm: { active: 'custom' } } }) }));
vi.mock('../components/Scribe/scribeUtils', async (orig) => ({
    ...(await orig<typeof import('../components/Scribe/scribeUtils')>()),
    getIntegrationsSnapshot: () => ({ active: 'custom' }),
}));
const mkdirMock = vi.fn();
const fetchTreeMock = vi.fn(async () => []);
vi.mock('../components/FileExplorer/fileExplorerApi', async (orig) => ({
    ...(await orig<typeof import('../components/FileExplorer/fileExplorerApi')>()),
    mkdir: (p: string) => mkdirMock(p),
    fetchTree: () => fetchTreeMock(),
}));
const fetchDomainesMock = vi.fn(async () => []);
vi.mock('../components/Workspace/workspaceApi', async (orig) => ({
    ...(await orig<typeof import('../components/Workspace/workspaceApi')>()),
    fetchDomaines: () => fetchDomainesMock(),
}));

import { useScribeStore, dropTabsFromAnotherAccount } from '../components/Scribe/scribeStore';
import { restoreScribeSession, trackScribeSession } from '../components/Scribe/scribeMemory';
import { CommentEditor } from '../components/Scribe/CommentEditor';
import { SelectionToolbar } from '../components/Scribe/SelectionToolbar';
import { scribeKeymap } from '../components/Scribe/scribeKeymap';
import { getActiveScribeDoc } from '../lib/openDocContext';
import { patchWidgetMemory, readWidgetMemory, flushWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';
import { useWorkspaceStore } from '../components/Workspace/workspaceStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';

const st = () => useScribeStore.getState();
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const signIn = (id: string | null) => setPerUserIdentity(id);
const switchToB = () => { signIn(null); signIn('user-b'); };
const empty = { openFiles: [], activeFilepath: null, comments: [], editingCommentId: null, redlines: [], selectionToolbar: null, loading: false, error: null, redlineLoading: false };
const REDLINE_JSON = JSON.stringify({ redlines: [{ originalText: 'hello', proposedText: 'HELLO', rationale: 'r' }] });

let fetchCalls: Array<{ method: string; url: string }> = [];
function stubFetch(handler: (url: string, init?: RequestInit) => Promise<unknown> | unknown) {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        fetchCalls.push({ method: init?.method ?? 'GET', url: String(url) });
        return handler(String(url), init);
    }));
}
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body });

describe('owner-race guard — Scribe review round', () => {
    beforeEach(() => {
        signIn(null); useScribeStore.setState(empty); resetWidgetMemory();
        fetchCalls = []; llm = deferred();
        signIn('user-a');
    });
    afterEach(() => { cleanup(); signIn(null); vi.unstubAllGlobals(); });

    it("A's tabs leave the store as soon as A signs out — no Scribe mount needed (bridge / ARA 'open doc' readers)", async () => {
        st().openInMemoryFile('a-private.md', 'A SECRET');
        signIn(null);
        await settle();
        expect(st().openFiles).toEqual([]);
        expect(getActiveScribeDoc()).toBeNull();
    });

    it('a tab B opens right after signing in is B\'s, and Scribe\'s mount keeps it', async () => {
        st().openInMemoryFile('a-private.md', 'A SECRET');
        switchToB();
        await settle();
        st().openInMemoryFile('b-report.md', 'B text');
        expect(dropTabsFromAnotherAccount()).toBe(false);
        expect(st().openFiles.map((f) => f.filepath)).toEqual(['b-report.md']);
    });

    it('tabs opened before anyone signed in (boot, tests) are adopted by the first user, not dropped', async () => {
        signIn(null);
        await settle();
        st().openInMemoryFile('boot.md', 'opened before identity');
        signIn('user-a');
        await settle();
        expect(st().openFiles.map((f) => f.filepath)).toEqual(['boot.md']);
        expect(dropTabsFromAnotherAccount()).toBe(false);
    });

    it("A's pending redline outlives A's last tab → still dropped at sign-out (never shown or accepted on B's same-path file)", async () => {
        st().openInMemoryFile('notes.md', 'hello world');
        st().addRedline({ id: 'r1', filepath: 'notes.md', from: 0, to: 5, originalText: 'hello', proposedText: 'A-PRIVATE-TEXT', rationale: 'r', state: 'pending' });
        st().closeFile('notes.md');
        expect(st().openFiles).toEqual([]);
        signIn(null);
        await settle();
        expect(st().redlines).toEqual([]);
    });

    it("A's comments that land after A's last tab closed → dropped at sign-out", async () => {
        st().openInMemoryFile('x.md', 'x');
        st().closeFile('x.md');
        useScribeStore.setState({ comments: [{ id: 'cA', filepath: 'x.md', from: 0, to: 1, body: 'A private', status: 'open', createdAt: '', updatedAt: '' }] });
        signIn(null);
        await settle();
        expect(st().comments).toEqual([]);
    });

    it("same person, new id (session modal's offline path swaps the backend id for the roster id) → their tabs are kept", async () => {
        localStorage.setItem('dwellium-user', JSON.stringify({ id: 'backend-id', email: 'Andy@example.com' }));
        signIn('backend-id');
        await settle();
        st().openInMemoryFile('draft.md', 'unsaved work');
        st().updateContent('draft.md', 'unsaved work, more');
        localStorage.setItem('dwellium-user', JSON.stringify({ id: 'roster-id', email: 'andy@example.com' }));
        signIn('roster-id');
        await settle();
        expect(st().openFiles.map((f) => f.filepath)).toEqual(['draft.md']);
        expect(dropTabsFromAnotherAccount()).toBe(false);
        localStorage.removeItem('dwellium-user');
    });

    it('control: a different person (different email) in place → the tabs are dropped', async () => {
        localStorage.setItem('dwellium-user', JSON.stringify({ id: 'a-id', email: 'a@example.com' }));
        signIn('a-id');
        await settle();
        st().openInMemoryFile('a.md', 'A text');
        localStorage.setItem('dwellium-user', JSON.stringify({ id: 'b-id', email: 'b@example.com' }));
        signIn('b-id');
        await settle();
        expect(st().openFiles).toEqual([]);
        localStorage.removeItem('dwellium-user');
    });

    it("A's redline still thinking at the switch: B's Redline isn't stuck, and A's late finish doesn't clear B's spinner", async () => {
        useScribeStore.setState({ selectionToolbar: { filepath: 'notes.md', x: 100, y: 100, from: 0, to: 5, text: 'hello' }, openFiles: [{ filepath: 'notes.md', content: 'hello', dirty: false, scrollTop: 0 }], activeFilepath: 'notes.md' });
        render(<SelectionToolbar />);
        fireEvent.click(screen.getByTitle('Send selection to AI for editing suggestions'));
        expect(st().redlineLoading).toBe(true);
        switchToB();
        await settle();
        expect(st().redlineLoading).toBe(false); // the drop clears A's spinner for B
        st().setRedlineLoading(true); // B starts its own redline
        await act(async () => { llm.resolve({ text: REDLINE_JSON }); await new Promise((r) => setTimeout(r, 0)); });
        expect(st().redlineLoading).toBe(true); // A's finally must not clear B's
        expect(st().redlines).toEqual([]);
    });

    it("in-place switch (session re-auth as B): dropping A's tabs never overwrites B's remembered session", async () => {
        signIn('user-b');
        patchWidgetMemory('scribe', { openFilepaths: ['b-notes.md'], activeFilepath: 'b-notes.md' });
        flushWidgetMemory();
        signIn('user-a');
        await settle();
        st().openInMemoryFile('a-private.md', 'A SECRET');
        const untrack = trackScribeSession();
        signIn('user-b'); // in place — no sign-out in between
        await settle();
        dropTabsFromAnotherAccount();
        flushWidgetMemory();
        untrack();
        expect(st().openFiles).toEqual([]);
        expect(readWidgetMemory('scribe', { openFilepaths: [] as string[] }).openFilepaths).toEqual(['b-notes.md']);
    });

    it('loadComments: the GET resolves after the switch → A\'s comments are not attached to B\'s same-path file', async () => {
        const g = deferred<unknown>();
        stubFetch(() => g.promise);
        const run = st().loadComments('notes.md');
        switchToB();
        g.resolve(json({ success: true, comments: [{ id: 'cA', from: 0, to: 1, body: 'A private note', status: 'open', createdAt: '', updatedAt: '' }] }));
        await run;
        expect(st().comments).toEqual([]);
    });

    it("createVersion: the POST resolves after the switch → A's new version is not fetched with B's session", async () => {
        const p = deferred<unknown>();
        stubFetch((url, init) => (init?.method === 'POST' ? p.promise : json({ success: true, content: 'x' })));
        const run = st().createVersion('a-plan.md');
        switchToB();
        p.resolve(json({ success: true, newFilepath: 'a-plan-v2.md' }));
        await run; await settle();
        expect(fetchCalls.filter((c) => c.method === 'GET')).toEqual([]);
        expect(st().error).toBeNull();
    });

    it("restoreScribeSession: a switch mid-restore stops it — A's remaining tabs are never opened under B", async () => {
        patchWidgetMemory('scribe', { openFilepaths: ['x.md', 'y.md'], activeFilepath: 'y.md' });
        flushWidgetMemory();
        const g = deferred<unknown>();
        stubFetch((url) => (url.includes('/files/x.md') ? g.promise : json({ success: true, content: 'y' })));
        const run = restoreScribeSession();
        switchToB();
        g.resolve(json({ success: true, content: 'x' }));
        await run; await settle();
        expect(fetchCalls.some((c) => c.url.includes('/files/y.md'))).toBe(false);
        expect(st().openFiles).toEqual([]);
    });

    it("comment 'Submit to agent': the LLM answers after the switch → nothing is PUT with B's token, no redline, comment untouched", async () => {
        stubFetch(() => json({ success: true }));
        const view = new EditorView({ doc: 'hello world' });
        useScribeStore.setState({
            activeFilepath: 'notes.md',
            openFiles: [{ filepath: 'notes.md', content: 'hello world', dirty: false, scrollTop: 0 }],
            comments: [{ id: 'c1', filepath: 'notes.md', from: 0, to: 5, body: 'A private remark', status: 'open', createdAt: '', updatedAt: '' }],
            editingCommentId: 'c1',
        });
        try {
            render(<CommentEditor getView={() => view} />);
            fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
            switchToB();
            await act(async () => { llm.resolve({ text: REDLINE_JSON }); await new Promise((r) => setTimeout(r, 0)); });
            expect(fetchCalls.filter((c) => c.method === 'PUT')).toEqual([]);
            expect(st().redlines).toEqual([]);
            expect(st().comments.find((c) => c.id === 'c1')?.status).not.toBe('resolved');
        } finally { view.destroy(); }
    });

    it('selection toolbar AI redline: the answer arrives after the switch → no redline lands on B\'s same-path file', async () => {
        useScribeStore.setState({ selectionToolbar: { filepath: 'notes.md', x: 100, y: 100, from: 0, to: 5, text: 'hello' } });
        render(<SelectionToolbar />);
        fireEvent.click(screen.getByTitle('Send selection to AI for editing suggestions'));
        switchToB();
        await act(async () => { llm.resolve({ text: REDLINE_JSON }); await new Promise((r) => setTimeout(r, 0)); });
        expect(st().redlines).toEqual([]);
        expect(st().redlineLoading).toBe(false);
    });

    it('⌘L redline: the answer arrives after the switch → no redline', async () => {
        useScribeStore.setState({ activeFilepath: 'notes.md' });
        const view = new EditorView({ doc: 'hello world', extensions: [scribeKeymap] });
        try {
            view.dispatch({ selection: { anchor: 0, head: 5 } });
            runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'l', ctrlKey: true }), 'editor');
            switchToB();
            await act(async () => { llm.resolve({ text: REDLINE_JSON }); await new Promise((r) => setTimeout(r, 0)); });
            expect(st().redlines).toEqual([]);
        } finally { view.destroy(); }
    });

    it('control: no switch → the ⌘L redline lands', async () => {
        useScribeStore.setState({ activeFilepath: 'notes.md' });
        const view = new EditorView({ doc: 'hello world', extensions: [scribeKeymap] });
        try {
            view.dispatch({ selection: { anchor: 0, head: 5 } });
            runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'l', ctrlKey: true }), 'editor');
            await act(async () => { llm.resolve({ text: REDLINE_JSON }); await new Promise((r) => setTimeout(r, 0)); });
            expect(st().redlines).toHaveLength(1);
        } finally { view.destroy(); }
    });
});

describe('owner-race guard — Workspace mutations reload for the account that made them', () => {
    beforeEach(() => {
        signIn(null); useWorkspaceStore.getState().reset();
        mkdirMock.mockReset(); fetchTreeMock.mockClear(); fetchDomainesMock.mockClear();
        signIn('user-a');
    });
    afterEach(() => signIn(null));

    it("createEntry: the account switches during mkdir → no reload runs (B's tree is never cached under A)", async () => {
        const m = deferred<void>();
        mkdirMock.mockReturnValue(m.promise);
        const run = useWorkspaceStore.getState().createEntry(null, 'Alpha');
        switchToB();
        m.resolve();
        await run;
        expect(fetchTreeMock).not.toHaveBeenCalled();
        expect(fetchDomainesMock).not.toHaveBeenCalled();
        expect(useWorkspaceStore.getState().mutating).toBe(false);
    });

    it('createEntry: the account switches during the tree reload → the domaines reload does not run as B', async () => {
        mkdirMock.mockResolvedValue(undefined);
        const t = deferred<never[]>();
        fetchTreeMock.mockReturnValueOnce(t.promise);
        const run = useWorkspaceStore.getState().createEntry(null, 'Alpha');
        await Promise.resolve(); await Promise.resolve();
        switchToB();
        t.resolve([]);
        await run;
        expect(fetchDomainesMock).not.toHaveBeenCalled();
    });

    it('control: no switch → createEntry reloads the tree and domaines', async () => {
        mkdirMock.mockResolvedValue(undefined);
        await useWorkspaceStore.getState().createEntry(null, 'Alpha');
        expect(fetchTreeMock).toHaveBeenCalledTimes(1);
        expect(fetchDomainesMock).toHaveBeenCalledTimes(1);
    });
});
