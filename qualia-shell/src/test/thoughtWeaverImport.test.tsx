/**
 * Plan 067 Phase 1, wave 2 — ThoughtWeaver's one-time Supabase import.
 *
 * Covers:
 *  (a) `importCaptures` (thoughtWeaverStore.ts): dedupe / ordering / count / no-op.
 *  (b) the widget end-to-end: pulled Supabase rows land as local (deletable)
 *      rows exactly once, and a delete never comes back on the next pull.
 *  (c) React.StrictMode double-mount does not duplicate imported rows.
 *  (d) capture never POSTs to Supabase (pushCapture is retired — G2).
 *
 * Fetch is mocked BY URL, never by call order (docs/code.md 2026-09-05 —
 * multiple fetches fire on mount: the backend `/captures` + `/stats` calls
 * AND the Supabase pull race in flight).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { UserContext, type DwelliumUser } from '../context/UserContext';
import ThoughtWeaver from '../components/ThoughtWeaver/ThoughtWeaver';
import {
    thoughtWeaverStore,
    thoughtWeaverUserIdHolder,
    importCaptures,
    appendLocalCapture,
} from '../components/ThoughtWeaver/thoughtWeaverStore';
import { twImportedStore, twImportedUserIdHolder } from '../components/ThoughtWeaver/twImportedStore';

// ── useIntegrations mock — mutable so each test controls supabase config ──
let mockIntegrations: Record<string, unknown> = { llm: { active: null } };
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: mockIntegrations }),
}));

const SUPABASE_CFG = { url: 'https://tw-test.supabase.co', anonKey: 'anon-test-key', enabled: true };

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

const ROW_A = { id: 'sb-a', text: 'Call the plumber', filed_to: 'admin', confidence: 0.8, destination_name: null, created_at: '2026-06-12T01:00:00.000Z' };
const ROW_B = { id: 'sb-b', text: 'Idea: skylight in the lobby', filed_to: 'ideas', confidence: 0.6, destination_name: null, created_at: '2026-06-12T02:00:00.000Z' };

/** Fetch mock, routed BY URL. Records every call so tests can assert on method/URL. */
function makeFetchMock(pulled: Array<Record<string, unknown>>) {
    const calls: Array<{ url: string; method: string }> = [];
    const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        calls.push({ url, method });
        if (url.includes('/rest/v1/thought_weaver_captures')) {
            if (method === 'GET') {
                return Promise.resolve({ ok: true, json: async () => pulled } as Response);
            }
            // Any write to Supabase from the desktop is exactly what G2 retires.
            return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
        }
        // Backend `/api/thought-weaver/*` — offline in these tests; the widget
        // degrades gracefully (backendOffline banner), local/import paths unaffected.
        return Promise.reject(new Error('ECONNREFUSED'));
    });
    return { fn, calls };
}

describe('ThoughtWeaver import', () => {
    beforeEach(() => {
        thoughtWeaverStore.reset();
        twImportedStore.reset();
        thoughtWeaverUserIdHolder.current = null;
        twImportedUserIdHolder.current = null;
        try { localStorage.clear(); } catch { /* jsdom */ }
        mockIntegrations = { llm: { active: null } };
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // ── (a) importCaptures unit tests ──────────────────────────────────
    describe('importCaptures', () => {
        it('skips ids already present, adds the rest with source:local, returns the added count', () => {
            thoughtWeaverUserIdHolder.current = 'u-import-1';
            appendLocalCapture({ id: 'existing', text: 'already here', filed_to: 'admin', confidence: 1, destination_name: null, createdAt: '2026-06-12T00:00:00.000Z' });

            const added = importCaptures([
                { id: 'existing', text: 'stale duplicate', filed_to: 'admin', confidence: 0.5, destination_name: null, createdAt: '2026-06-11T00:00:00.000Z' },
                { id: 'new-1', text: 'brand new', filed_to: 'ideas', confidence: 0.7, destination_name: null, createdAt: '2026-06-12T03:00:00.000Z' },
            ]);

            expect(added).toBe(1);
            const snap = thoughtWeaverStore.getSnapshot();
            expect(snap).toHaveLength(2);
            expect(snap.find(c => c.id === 'new-1')).toMatchObject({ source: 'local', text: 'brand new' });
            // the pre-existing row's text was NOT overwritten by the stale duplicate
            expect(snap.find(c => c.id === 'existing')).toMatchObject({ text: 'already here' });
        });

        it('orders the result newest-first, stable for equal createdAt', () => {
            thoughtWeaverUserIdHolder.current = 'u-import-2';
            const t = '2026-06-12T05:00:00.000Z';
            importCaptures([
                { id: 'x1', text: 'first-in tie', filed_to: 'admin', confidence: 0.5, destination_name: null, createdAt: t },
                { id: 'older', text: 'older row', filed_to: 'admin', confidence: 0.5, destination_name: null, createdAt: '2026-06-12T04:00:00.000Z' },
                { id: 'x2', text: 'second-in tie', filed_to: 'admin', confidence: 0.5, destination_name: null, createdAt: t },
                { id: 'newest', text: 'newest row', filed_to: 'admin', confidence: 0.5, destination_name: null, createdAt: '2026-06-12T06:00:00.000Z' },
            ]);
            const ids = thoughtWeaverStore.getSnapshot().map(c => c.id);
            // newest first; the two equal-createdAt rows keep their relative (insertion) order
            expect(ids).toEqual(['newest', 'x1', 'x2', 'older']);
        });

        it('is a no-op (no set()) when every row is already present', () => {
            thoughtWeaverUserIdHolder.current = 'u-import-3';
            appendLocalCapture({ id: 'dup', text: 'dup', filed_to: 'admin', confidence: 1, destination_name: null, createdAt: '2026-06-12T00:00:00.000Z' });
            const before = thoughtWeaverStore.getSnapshot();

            const added = importCaptures([
                { id: 'dup', text: 'dup (pulled copy)', filed_to: 'admin', confidence: 0.9, destination_name: null, createdAt: '2026-06-12T00:00:00.000Z' },
            ]);

            expect(added).toBe(0);
            expect(thoughtWeaverStore.getSnapshot()).toBe(before); // same reference: no set() fired
        });

        it('returns 0 and does nothing for an empty input array', () => {
            thoughtWeaverUserIdHolder.current = 'u-import-4';
            const before = thoughtWeaverStore.getSnapshot();
            expect(importCaptures([])).toBe(0);
            expect(thoughtWeaverStore.getSnapshot()).toBe(before);
        });
    });

    // ── (b) widget end-to-end: import once, delete stays deleted ───────
    it('pulled Supabase rows land as local rows exactly once; deleting one keeps it gone on the next pull', async () => {
        mockIntegrations = { llm: { active: null }, supabase: SUPABASE_CFG };
        const { fn: fetchMock } = makeFetchMock([ROW_A, ROW_B]);
        vi.stubGlobal('fetch', fetchMock);

        const { unmount } = render(withUser('user-import-b', <ThoughtWeaver />));

        await waitFor(() => {
            expect(screen.getByText(ROW_A.text)).toBeInTheDocument();
            expect(screen.getByText(ROW_B.text)).toBeInTheDocument();
        });

        // Both imported rows are local (deletable) — the old undeletable
        // "synced" badge/row no longer exists in this model.
        const cardA = screen.getByText(ROW_A.text).closest('.tw-capture-card') as HTMLElement;
        const deleteBtnA = cardA.querySelector('.tw-delete-btn') as HTMLButtonElement;
        expect(deleteBtnA).toBeTruthy();

        // Plan 067 Phase 3 (D6): delete now confirms first.
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await act(async () => { deleteBtnA.click(); });
        await waitFor(() => expect(screen.queryByText(ROW_A.text)).not.toBeInTheDocument());

        // The imported set recorded BOTH pulled ids, not just the surviving one.
        const imported = twImportedStore.getSnapshot();
        expect(Object.keys(imported).sort()).toEqual(['sb-a', 'sb-b']);

        unmount();

        // "Reload": remount fresh, same Supabase rows come back on the pull.
        render(withUser('user-import-b', <ThoughtWeaver />));
        await waitFor(() => {
            expect(screen.getByText(ROW_B.text)).toBeInTheDocument();
        });
        // A stays deleted — it is in the imported set, so planImport skips it.
        expect(screen.queryByText(ROW_A.text)).not.toBeInTheDocument();
    });

    // ── (c) StrictMode double-mount does not duplicate rows ────────────
    it('does not duplicate imported rows under React.StrictMode double-mount', async () => {
        mockIntegrations = { llm: { active: null }, supabase: SUPABASE_CFG };
        const { fn: fetchMock } = makeFetchMock([ROW_A, ROW_B]);
        vi.stubGlobal('fetch', fetchMock);

        render(
            <React.StrictMode>
                {withUser('user-import-c', <ThoughtWeaver />)}
            </React.StrictMode>,
        );

        await waitFor(() => {
            expect(screen.getAllByText(ROW_A.text)).toHaveLength(1);
            expect(screen.getAllByText(ROW_B.text)).toHaveLength(1);
        });
        expect(thoughtWeaverStore.getSnapshot().filter(c => c.id === ROW_A.id)).toHaveLength(1);
    });

    // ── (d) capture never POSTs to Supabase (pushCapture retired) ──────
    it('never sends a POST to /rest/v1/thought_weaver_captures, on capture or on import', async () => {
        mockIntegrations = { llm: { active: null }, supabase: SUPABASE_CFG };
        const { fn: fetchMock, calls } = makeFetchMock([]);
        vi.stubGlobal('fetch', fetchMock);

        render(withUser('user-import-d', <ThoughtWeaver />));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());

        const box = await screen.findByPlaceholderText(/Drop a thought/i);
        const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
        await act(async () => {
            setValue.call(box, 'Follow up with the vendor about unit 4B');
            box.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const captureBtn = document.querySelector('.tw-capture__btn') as HTMLButtonElement;
        await act(async () => { captureBtn.click(); });
        await waitFor(() => expect(screen.getByText(/sorted locally/i)).toBeInTheDocument());

        const supabaseWrites = calls.filter(c => c.url.includes('/rest/v1/thought_weaver_captures') && c.method !== 'GET');
        expect(supabaseWrites).toEqual([]);
    });
});
