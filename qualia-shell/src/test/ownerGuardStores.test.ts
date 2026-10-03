/**
 * Owner-race guard coverage for the per-user store writers: the Workspace cache thunks,
 * Task Board AI routing, Foundry triage, Wiki compile, ARA daily glance and the morning-brief
 * notification click. Each starts work as user-a, switches the account mid-await
 * (perUserIdentity's `setPerUserIdentity`), resolves, and asserts the late write is DROPPED —
 * neither account's store gets it — with a no-switch control proving the write still happens.
 * See ownerGuard.test.ts for the base primitive.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn(), history: vi.fn() },
}));

const mockFetchDomaines = vi.fn();
const mockFetchThreadMeta = vi.fn();
const mockPutThreadMeta = vi.fn();
vi.mock('../components/Workspace/workspaceApi', async (orig) => ({
    ...(await orig<object>()),
    fetchDomaines: () => mockFetchDomaines(),
    fetchThreadMeta: (p: string) => mockFetchThreadMeta(p),
    putThreadMeta: (p: string, patch: unknown) => mockPutThreadMeta(p, patch),
}));

const mockFetchTree = vi.fn();
const mockReadFile = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', async (orig) => ({
    ...(await orig<object>()),
    fetchTree: (...args: unknown[]) => mockFetchTree(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
}));

let mockLlmBundle: any = { active: null };
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: mockLlmBundle } }),
}));
const mockCallLlm = vi.fn();
vi.mock('../lib/llmClient', async (orig) => ({
    ...(await orig<object>()),
    callLlm: (...args: unknown[]) => mockCallLlm(...args),
}));

import { setPerUserIdentity, ACCOUNT_CHANGED } from '../lib/perUserIdentity';
import { UserContext } from '../context/UserContext';
import { useWorkspaceStore, workspaceUserIdHolder } from '../components/Workspace/workspaceStore';
import { taskBoardStore, taskBoardUserIdHolder, addCard, routeCard } from '../components/TaskBoard/taskBoardStore';
import Foundry from '../components/Foundry/Foundry';
import { foundryStore, foundryUserIdHolder } from '../components/Foundry/foundryStore';
import Wiki from '../components/Wiki/Wiki';
import { wikiStore } from '../components/Wiki/wikiStore';
import { runDailyGlance, araGlanceStore } from '../lib/araDailyGlance';
import { notifyNewBrief } from '../lib/briefNotifier';
import { activationStore, saveActivation, emptyActivation } from '../lib/activationStore';
import { morningBriefStore, upsertBrief, todaysBrief, consumePendingBrief } from '../lib/morningBriefStore';
import { dayKey } from '../lib/dailySynthesis';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}
const switchAccount = () => { setPerUserIdentity(null); setPerUserIdentity('user-b'); };
const asUser = (id: string, child: React.ReactElement) =>
    React.createElement(UserContext.Provider, { value: { user: { id } } as any }, child);

const ACTIVE_LLM = { active: 'anthropic', anthropic: { enabled: true, apiKey: 'sk-test' } };
const A_TREE: FileEntry[] = [
    { name: 'A-Private', path: 'A-Private', tier: 'domain', children: [
        { name: 'notes.md', path: 'A-Private/notes.md', tier: 'file', modified: '2026-01-01T00:00:00.000Z' },
    ] },
];
const wsCache = (uid: string) => localStorage.getItem(`dwellium:workspace:cache:${uid}`);

beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity(null);
    mockLlmBundle = { active: null };
    [mockFetchDomaines, mockFetchThreadMeta, mockPutThreadMeta, mockFetchTree, mockReadFile, mockCallLlm].forEach(m => m.mockReset());
    mockFetchTree.mockResolvedValue(A_TREE);
    mockReadFile.mockImplementation(async (p: string) => ({ content: `content of ${p}`, size: 10, modified: '2026-01-01T00:00:00.000Z' }));
    useWorkspaceStore.getState().reset();
    workspaceUserIdHolder.current = null;
    taskBoardUserIdHolder.current = null;
    foundryUserIdHolder.current = null;
    [taskBoardStore, foundryStore, wikiStore, araGlanceStore, morningBriefStore, activationStore].forEach(s => s.reset());
});

afterEach(() => {
    setPerUserIdentity(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('owner-race guard — workspaceStore thunks', () => {
    it('loadDomaines: account switches mid-fetch → A\'s domaines dropped, loading cleared, no cache write', async () => {
        setPerUserIdentity('user-a');
        useWorkspaceStore.getState().hydrate('user-a');
        const d = deferred<unknown>();
        mockFetchDomaines.mockReturnValue(d.promise);
        const p = useWorkspaceStore.getState().loadDomaines();
        switchAccount();
        d.resolve([{ name: 'A-Private', path: 'A-Private', description: '', color: '#000', position: 0 }]);
        await p;
        const s = useWorkspaceStore.getState();
        expect(s.domaines).toEqual([]);
        expect(s.loading).toBe(false);
        expect(wsCache('user-a')).toBeNull();
        expect(wsCache('user-b')).toBeNull();
    });

    it('loadTree: account switches mid-fetch → A\'s tree dropped, treeLoading cleared, no cache write', async () => {
        setPerUserIdentity('user-a');
        useWorkspaceStore.getState().hydrate('user-a');
        const d = deferred<FileEntry[]>();
        mockFetchTree.mockReturnValue(d.promise);
        const p = useWorkspaceStore.getState().loadTree();
        switchAccount();
        d.resolve(A_TREE);
        await p;
        const s = useWorkspaceStore.getState();
        expect(s.tree).toEqual([]);
        expect(s.treeLoading).toBe(false);
        expect(wsCache('user-a')).toBeNull();
        expect(wsCache('user-b')).toBeNull();
    });

    it('loadThreadMetas: account switches mid-fetch → A\'s metas not merged into B', async () => {
        setPerUserIdentity('user-a');
        useWorkspaceStore.getState().hydrate('user-a');
        const d = deferred<unknown>();
        mockFetchThreadMeta.mockReturnValue(d.promise);
        const p = useWorkspaceStore.getState().loadThreadMetas(['A-Private/P/t1']);
        switchAccount();
        useWorkspaceStore.getState().hydrate('user-b');
        d.resolve({ status: 'active' });
        await p;
        const s = useWorkspaceStore.getState();
        expect(s.threadMetas).toEqual({});
        expect(s.threadMetaLoading).toBe(false);
        expect(wsCache('user-a')).toBeNull();
        expect(wsCache('user-b')).toBeNull();
    });

    it('setThreadStatus: account switches mid-PUT → no local merge into B, mutating cleared', async () => {
        setPerUserIdentity('user-a');
        useWorkspaceStore.getState().hydrate('user-a');
        const d = deferred<unknown>();
        mockPutThreadMeta.mockReturnValue(d.promise);
        const p = useWorkspaceStore.getState().setThreadStatus('A-Private/P/t1', 'complete');
        switchAccount();
        useWorkspaceStore.getState().hydrate('user-b');
        d.resolve({ status: 'complete' });
        expect(await p).toBe(true); // the server write did succeed for A
        const s = useWorkspaceStore.getState();
        expect(s.threadMetas).toEqual({});
        expect(s.mutating).toBe(false);
        expect(wsCache('user-b')).toBeNull();
    });

    it('hydrate for a different user clears the previous user\'s in-memory structure', async () => {
        setPerUserIdentity('user-a');
        useWorkspaceStore.getState().hydrate('user-a');
        await useWorkspaceStore.getState().loadTree();
        expect(useWorkspaceStore.getState().tree).toEqual(A_TREE);
        switchAccount();
        useWorkspaceStore.getState().hydrate('user-b');
        expect(useWorkspaceStore.getState().tree).toEqual([]);
    });

    it('control: loadTree with no switch sets the tree and caches it for the owner', async () => {
        setPerUserIdentity('user-a');
        useWorkspaceStore.getState().hydrate('user-a');
        await useWorkspaceStore.getState().loadTree();
        expect(useWorkspaceStore.getState().tree).toEqual(A_TREE);
        expect(JSON.parse(wsCache('user-a')!).tree).toEqual(A_TREE);
    });
});

describe('owner-race guard — taskBoardStore.routeCard', () => {
    const AI = { kind: 'ai' as const, id: 'stella', label: 'Stella' };
    const auditOf = (uid: string) => {
        taskBoardUserIdHolder.current = uid;
        return taskBoardStore.getSnapshot().audit.map(e => e.summary);
    };
    function startRoute(fetchResult: Promise<unknown>) {
        setPerUserIdentity('user-a');
        taskBoardUserIdHolder.current = 'user-a';
        const cardId = addCard({ title: 'A secret card', assignee: AI }).cards[0].id;
        vi.stubGlobal('fetch', vi.fn(() => fetchResult));
        return routeCard(cardId);
    }

    it('account switches mid-send → no "Sent" audit lands in either board', async () => {
        const d = deferred<unknown>();
        const p = startRoute(d.promise);
        switchAccount();
        taskBoardUserIdHolder.current = 'user-b';
        d.resolve({ ok: true, status: 200 });
        const r = await p;
        expect(r).toEqual({ status: 'none', detail: ACCOUNT_CHANGED });
        expect(auditOf('user-b')).toEqual([]);
        expect(auditOf('user-a').some(s => s.includes('to AI'))).toBe(false);
    });

    it('account switches, then the send fails → no "Queued" audit lands either', async () => {
        const d = deferred<unknown>();
        const p = startRoute(d.promise);
        switchAccount();
        taskBoardUserIdHolder.current = 'user-b';
        d.reject(new TypeError('offline'));
        const r = await p;
        expect(r.detail).toBe(ACCOUNT_CHANGED);
        expect(auditOf('user-b')).toEqual([]);
        expect(auditOf('user-a').some(s => s.includes('for AI'))).toBe(false);
    });

    it('control: no switch → routed and audited on the owner\'s board', async () => {
        const r = await startRoute(Promise.resolve({ ok: true, status: 200 }));
        expect(r.status).toBe('sent');
        expect(auditOf('user-a')).toContain('Sent "A secret card" to AI · Stella');
    });
});

describe('owner-race guard — Foundry capture → triage', () => {
    async function captureAsA() {
        mockLlmBundle = ACTIVE_LLM;
        setPerUserIdentity('user-a');
        const view = render(asUser('user-a', React.createElement(Foundry)));
        fireEvent.change(screen.getByPlaceholderText(/Paste content/), { target: { value: 'A private memo about leases' } });
        fireEvent.click(screen.getByRole('button', { name: /Capture & Triage/ }));
        await waitFor(() => expect(mockCallLlm).toHaveBeenCalled());
        return view;
    }
    const TRIAGE = { text: JSON.stringify({ tags: ['lease'], target: null, qualityScore: 70, assessment: 'ok' }) };
    const foundryOf = (uid: string) => JSON.parse(localStorage.getItem(`dwellium:foundry:${uid}`) ?? '[]');

    it('account switches mid-triage → B\'s list is not rewritten, A\'s item stays untriaged', async () => {
        const d = deferred<unknown>();
        mockCallLlm.mockReturnValue(d.promise);
        const view = await captureAsA();
        switchAccount();
        view.rerender(asUser('user-b', React.createElement(Foundry)));
        d.resolve(TRIAGE);
        await waitFor(() => expect(screen.queryByText(/Triaging/)).toBeNull());
        expect(localStorage.getItem('dwellium:foundry:user-b')).toBeNull();
        expect(foundryStore.getSnapshot()).toEqual([]);
        expect(foundryOf('user-a').map((i: any) => i.status)).toEqual(['captured']);
    });

    it('control: no switch → the item is triaged', async () => {
        mockCallLlm.mockResolvedValue(TRIAGE);
        await captureAsA();
        await waitFor(() => expect(foundryOf('user-a')[0]?.status).toBe('triaged'));
    });
});

describe('owner-race guard — Wiki compile', () => {
    const PAGE = { text: JSON.stringify({ overview: 'A private overview', concepts: [], openQuestions: [], sources: ['A-Private/notes.md'] }) };
    async function compileAsA() {
        mockLlmBundle = ACTIVE_LLM;
        setPerUserIdentity('user-a');
        const view = render(asUser('user-a', React.createElement(Wiki)));
        fireEvent.click(await screen.findByRole('button', { name: 'A-Private, domain' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Compile' }));
        await waitFor(() => expect(mockCallLlm).toHaveBeenCalled());
        return view;
    }

    it('account switches mid-LLM-call → the page lands in neither wiki, compiling clears', async () => {
        const d = deferred<unknown>();
        mockCallLlm.mockReturnValue(d.promise);
        const view = await compileAsA();
        switchAccount();
        view.rerender(asUser('user-b', React.createElement(Wiki)));
        d.resolve(PAGE);
        await waitFor(() => expect(screen.queryByText('Compiling…')).toBeNull());
        expect(wikiStore.getSnapshot()['A-Private']).toBeUndefined();
        expect(localStorage.getItem('dwellium:wiki:user-b')).toBeNull();
        expect(localStorage.getItem('dwellium:wiki:user-a')).toBeNull();
        expect(screen.queryByText('A private overview')).toBeNull();
    });

    it('control: no switch → the compiled page is saved for the owner', async () => {
        mockCallLlm.mockResolvedValue(PAGE);
        await compileAsA();
        await screen.findByText('A private overview');
        expect(localStorage.getItem('dwellium:wiki:user-a')).toContain('A private overview');
    });
});

describe('owner-race guard — ARA daily glance', () => {
    it('account switches mid-assemble → nothing posted, B\'s throttle untouched', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<string | null>();
        const post = vi.fn();
        const p = runDailyGlance('user-a', post, () => d.promise);
        switchAccount();
        d.resolve('**Today at a glance** A\'s goal');
        expect(await p).toBe(false);
        expect(post).not.toHaveBeenCalled();
        expect(araGlanceStore.getSnapshot().lastShownDay).toBeNull();
        expect(localStorage.getItem('araglance:user-b')).toBeNull();
        expect(localStorage.getItem('araglance:user-a')).toBeNull();
    });

    it('control: no switch → posted and throttled for today', async () => {
        setPerUserIdentity('user-a');
        const post = vi.fn();
        expect(await runDailyGlance('user-a', post, async () => 'glance')).toBe(true);
        expect(post).toHaveBeenCalledWith('glance');
        expect(araGlanceStore.getSnapshot().lastShownDay).toBe(dayKey());
    });
});

describe('owner-race guard — morning-brief notification click', () => {
    const created: Array<{ onclick: (() => void) | null }> = [];
    const BRIEF = { date: dayKey(), insights: [{ title: 'Stalled goal', text: 't' }], suggestions: [], dataLines: ['x'] };
    function notifyAsA() {
        created.length = 0;
        vi.stubGlobal('Notification', class {
            static permission = 'granted';
            onclick: (() => void) | null = null;
            constructor() { created.push(this); }
        });
        setPerUserIdentity('user-a');
        saveActivation({ ...emptyActivation(), notifications: { enabled: true, morningBrief: true } });
        notifyNewBrief(upsertBrief(BRIEF));
        expect(created).toHaveLength(1);
    }

    it('click after the account switched → B\'s brief is not marked seen or opened', () => {
        notifyAsA();
        switchAccount();
        upsertBrief(BRIEF); // B has its own brief for the same date
        created[0].onclick!();
        expect(todaysBrief()?.seen).toBe(false);
        expect(consumePendingBrief()).toBeNull();
    });

    it('control: click with no switch → brief opened in ARA and marked seen', () => {
        notifyAsA();
        created[0].onclick!();
        expect(consumePendingBrief()?.date).toBe(BRIEF.date);
        expect(todaysBrief()?.seen).toBe(true);
    });
});
