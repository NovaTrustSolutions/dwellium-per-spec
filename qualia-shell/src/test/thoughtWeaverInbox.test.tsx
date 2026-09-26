/**
 * Plan 067 Phase 2 — ThoughtWeaver's per-user backend inbox import + the
 * retirement of the shared-Map backend read paths (D3/D5) and the backend
 * `/resolve` categorize picker (superseded by local re-file, D3).
 *
 * Covers:
 *  (a) an inbox item lands as a local (deletable) row exactly once; deleting
 *      it and remounting does not bring it back (mirrors the Phase 1
 *      Supabase-import contract in thoughtWeaverImport.test.tsx).
 *  (b) NO request to any removed backend route
 *      (/captures, /stats, /timeline, /people, /projects, /ideas, /admin,
 *      /seed, /resolve) is ever made on mount — asserted by URL, not by call
 *      order or count, per docs/code.md 2026-09-05 (multiple things can fire
 *      fetch on mount).
 *  (c) header/Dashboard stat counts equal what's in the local store (D5 —
 *      they used to freeze at whatever the backend `/stats` snapshot said).
 *  (d) a needs_review capture can be categorized locally (the backend
 *      `/resolve/:id` picker is gone; local re-file is the only path now).
 *
 * `oneSaveClient` is mocked BY OBJECT ID (not call order) — same discipline
 * as the URL-keyed fetch mock below.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { UserContext, type DwelliumUser } from '../context/UserContext';
import ThoughtWeaver from '../components/ThoughtWeaver/ThoughtWeaver';
import {
    thoughtWeaverStore,
    thoughtWeaverUserIdHolder,
    appendLocalCapture,
} from '../components/ThoughtWeaver/thoughtWeaverStore';
import { twImportedStore, twImportedUserIdHolder } from '../components/ThoughtWeaver/twImportedStore';

// ── useIntegrations mock — no Supabase configured, so only the inbox path runs ──
let mockIntegrations: Record<string, unknown> = { llm: { active: null } };
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: mockIntegrations }),
}));

// ── oneSaveClient mock, keyed BY OBJECT ID ─────────────────────────────────
let oneSaveObjects: Record<string, unknown> = {};
vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn((id: string) => Promise.resolve(oneSaveObjects[id] ?? null)),
        put: vi.fn().mockResolvedValue(null),
        remove: vi.fn().mockResolvedValue(false),
        putBatch: vi.fn().mockResolvedValue('unsupported'),
    },
}));
// eslint-disable-next-line import/first
import { oneSaveClient } from '../lib/oneSaveClient';

function makeUser(id: string): DwelliumUser {
    return {
        id, email: `${id}@example.com`, name: id, role: 'god',
        assignedProperties: [], active: true,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as DwelliumUser;
}

function withUser(id: string, children: React.ReactNode) {
    const value = { user: makeUser(id) } as unknown as React.ContextType<typeof UserContext>;
    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

function inboxObject(uid: string, items: unknown[]) {
    return {
        id: `thought-weaver-inbox_${uid}`, type: 'thought-weaver-inbox', ownerId: uid, schema: 1,
        createdAt: '2026-09-25T00:00:00.000Z', updatedAt: '2026-09-25T00:00:00.000Z', deletedAt: null,
        payload: { items },
    };
}

const ITEM_A = { id: 'inbox-a', text: 'Call the plumber', filed_to: 'admin', confidence: 0.8, destination_name: null, createdAt: '2026-06-12T01:00:00.000Z' };
const ITEM_B = { id: 'inbox-b', text: 'Idea: skylight in the lobby', filed_to: 'ideas', confidence: 0.6, destination_name: null, createdAt: '2026-06-12T02:00:00.000Z' };

/** Fetch mock, routed by URL. Records every call so tests can assert on it. */
function makeFetchMock() {
    const calls: Array<{ url: string; method: string }> = [];
    const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: (init?.method ?? 'GET').toUpperCase() });
        return Promise.reject(new Error('ECONNREFUSED'));
    });
    return { fn, calls };
}

describe('ThoughtWeaver inbox import (plan 067 Phase 2)', () => {
    beforeEach(() => {
        thoughtWeaverStore.reset();
        twImportedStore.reset();
        thoughtWeaverUserIdHolder.current = null;
        twImportedUserIdHolder.current = null;
        try { localStorage.clear(); } catch { /* jsdom */ }
        mockIntegrations = { llm: { active: null } };
        oneSaveObjects = {};
        vi.mocked(oneSaveClient.get).mockClear();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // ── (a) import once; delete stays deleted across a remount ─────────
    it('imports an inbox item as a local (deletable) row exactly once; deleting it stays deleted on remount', async () => {
        oneSaveObjects['thought-weaver-inbox_user-inbox-1'] = inboxObject('user-inbox-1', [ITEM_A, ITEM_B]);
        const { fn: fetchMock } = makeFetchMock();
        vi.stubGlobal('fetch', fetchMock);

        const { unmount } = render(withUser('user-inbox-1', <ThoughtWeaver />));

        await waitFor(() => {
            expect(screen.getByText(ITEM_A.text)).toBeInTheDocument();
            expect(screen.getByText(ITEM_B.text)).toBeInTheDocument();
        });

        const cardA = screen.getByText(ITEM_A.text).closest('.tw-capture-card') as HTMLElement;
        const deleteBtnA = cardA.querySelector('.tw-delete-btn') as HTMLButtonElement;
        expect(deleteBtnA).toBeTruthy();

        // Plan 067 Phase 3 (D6): delete now confirms first.
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await act(async () => { deleteBtnA.click(); });
        await waitFor(() => expect(screen.queryByText(ITEM_A.text)).not.toBeInTheDocument());

        // Both pulled ids were recorded seen, not just the surviving one.
        expect(Object.keys(twImportedStore.getSnapshot()).sort()).toEqual(['inbox-a', 'inbox-b']);

        unmount();

        // "Reload": remount fresh — the same inbox object comes back on the pull.
        render(withUser('user-inbox-1', <ThoughtWeaver />));
        await waitFor(() => expect(screen.getByText(ITEM_B.text)).toBeInTheDocument());
        // MUTATION CHECK: dropping the `hasOwnProperty(imported, row.id)` skip in
        // `planImport` (thoughtWeaverSync.ts), or always defaulting `filed_to`/
        // `createdAt` instead of validating each inbox row in `pullInbox`
        // (twInbox.ts), makes this assertion fail — item A would reappear.
        expect(screen.queryByText(ITEM_A.text)).not.toBeInTheDocument();
    });

    // ── (b) no request to any removed backend route, ever, on mount ────
    it('never requests a removed backend route on mount', async () => {
        oneSaveObjects['thought-weaver-inbox_user-inbox-2'] = inboxObject('user-inbox-2', [ITEM_A]);
        const { fn: fetchMock, calls } = makeFetchMock();
        vi.stubGlobal('fetch', fetchMock);

        render(withUser('user-inbox-2', <ThoughtWeaver />));
        await waitFor(() => expect(screen.getByText(ITEM_A.text)).toBeInTheDocument());

        const removedPaths = ['/captures', '/stats', '/timeline', '/people', '/projects', '/ideas', '/admin', '/seed', '/resolve'];
        const hits = calls.filter(c => removedPaths.some(p => c.url.includes(`/api/thought-weaver${p}`)));
        expect(hits).toEqual([]);
        // Nothing at all was fetched on mount — the widget's only reads are
        // the One Save inbox/Supabase pulls (mocked above, not via `fetch`).
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // ── (c) header/Dashboard counts equal what's in the local store (D5) ──
    it('Dashboard capture count reflects the local store, not a frozen backend snapshot', async () => {
        oneSaveObjects['thought-weaver-inbox_user-inbox-3'] = inboxObject('user-inbox-3', [ITEM_A, ITEM_B]);
        vi.stubGlobal('fetch', makeFetchMock().fn);

        render(withUser('user-inbox-3', <ThoughtWeaver />));
        await waitFor(() => expect(screen.getByText(ITEM_A.text)).toBeInTheDocument());

        const dashboardTab = screen.getByRole('button', { name: /Dashboard/i });
        await act(async () => { dashboardTab.click(); });

        const captureStat = screen.getByText('Captures').closest('.tw-stat-card') as HTMLElement;
        expect(captureStat.querySelector('.tw-stat-card__value')?.textContent).toBe('2');
    });

    // ── (d) a needs_review capture can be categorized locally (D3) ─────
    it('categorizes a needs_review capture locally — no backend /resolve picker left', async () => {
        thoughtWeaverUserIdHolder.current = 'user-inbox-4';
        appendLocalCapture({
            id: 'needs-review-1', text: 'Something ambiguous', filed_to: 'needs_review',
            confidence: 0.3, destination_name: null, createdAt: '2026-06-12T00:00:00.000Z',
        });
        vi.stubGlobal('fetch', makeFetchMock().fn);

        render(withUser('user-inbox-4', <ThoughtWeaver />));
        await waitFor(() => expect(screen.getByText('Something ambiguous')).toBeInTheDocument());

        const card = screen.getByText('Something ambiguous').closest('.tw-capture-card') as HTMLElement;
        const categorizeBtn = Array.from(card.querySelectorAll('.tw-categorize-btn'))
            .find(b => /Categorize/i.test(b.textContent ?? '')) as HTMLButtonElement;
        expect(categorizeBtn).toBeTruthy();

        await act(async () => { categorizeBtn.click(); });
        const peopleBtn = card.querySelector('.tw-resolve-btn') as HTMLButtonElement;
        expect(peopleBtn).toBeTruthy();
        await act(async () => { peopleBtn.click(); });

        const stored = thoughtWeaverStore.getSnapshot().find(c => c.id === 'needs-review-1');
        expect(stored).toMatchObject({ filed_to: 'people', confidence: 1, text: 'Something ambiguous' });
    });
});
