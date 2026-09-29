/**
 * Plan 067 Phase 3 — Safety UX (D6, D9).
 *
 * Covers:
 *  (a) D6 — deleting a local capture from the Recent list confirms first;
 *      Cancel keeps it, OK removes it, and the confirm text names the
 *      thought (verbatim preview).
 *  (b) D6 — same confirm-gated delete from the Dashboard tab's item card.
 *  (c) D9 — the capture-result live region exists (role="status"
 *      aria-live="polite") BEFORE a capture is made, so a screen reader has
 *      already registered it when the result lands inside.
 *  (d) D9 — the Capture button carries aria-busy while classification is
 *      still in flight.
 *  (e) D9 — "Sync from captures" reports a visible, live-announced count
 *      instead of only logging to the console.
 *
 * Mirrors the render-with-a-user + URL-keyed fetch mock setup used in
 * thoughtWeaverInbox.test.tsx / thoughtWeaverImport.test.tsx.
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
import { todoStore, todoUserIdHolder } from '../components/ThoughtWeaver/todoStore';
import { reportStore, reportUserIdHolder } from '../components/ThoughtWeaver/reportStore';

// ── useIntegrations mock — mutable so the aria-busy test can turn on an LLM ──
let mockIntegrations: Record<string, unknown> = { llm: { active: null } };
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: mockIntegrations }),
}));

// ── llmClient mock — deferred so the test controls when classification resolves ──
let resolveLlm: ((v: unknown) => void) | null = null;
vi.mock('../lib/llmClient', () => ({
    hasActiveLlm: (llm: Record<string, unknown> | undefined) => !!llm?.active,
    callLlm: () => new Promise((resolve) => { resolveLlm = resolve; }),
}));

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

/** Fetch mock — always rejects, so no backend/Supabase source ever contributes. */
function makeFetchMock() {
    const fn = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    return fn;
}

describe('ThoughtWeaver Phase 3 safety UX (D6, D9)', () => {
    let confirmSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        thoughtWeaverStore.reset();
        twImportedStore.reset();
        todoStore.reset();
        reportStore.reset();
        thoughtWeaverUserIdHolder.current = null;
        twImportedUserIdHolder.current = null;
        todoUserIdHolder.current = null;
        reportUserIdHolder.current = null;
        try { localStorage.clear(); } catch { /* jsdom */ }
        mockIntegrations = { llm: { active: null } };
        resolveLlm = null;
        vi.stubGlobal('fetch', makeFetchMock());
        confirmSpy = vi.spyOn(window, 'confirm');
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // ── (a) Recent-list delete: Cancel keeps, OK removes, text names the thought ──
    it('confirms before deleting a Recent-list capture; Cancel keeps it, OK removes it', async () => {
        thoughtWeaverUserIdHolder.current = 'user-p3-1';
        appendLocalCapture({
            id: 'cap-1', text: 'Call the plumber about the leak', filed_to: 'admin',
            confidence: 0.8, destination_name: null, createdAt: '2026-06-12T00:00:00.000Z',
        });

        render(withUser('user-p3-1', <ThoughtWeaver />));
        await waitFor(() => expect(screen.getByText('Call the plumber about the leak')).toBeInTheDocument());

        const card = screen.getByText('Call the plumber about the leak').closest('.tw-capture-card') as HTMLElement;
        const deleteBtn = card.querySelector('.tw-delete-btn') as HTMLButtonElement;
        expect(deleteBtn).toBeTruthy();

        // Cancel: nothing happens.
        confirmSpy.mockReturnValueOnce(false);
        await act(async () => { deleteBtn.click(); });
        expect(screen.getByText('Call the plumber about the leak')).toBeInTheDocument();
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy.mock.calls[0][0]).toContain('Call the plumber about the leak');

        // OK: it's gone.
        confirmSpy.mockReturnValueOnce(true);
        await act(async () => { deleteBtn.click(); });
        await waitFor(() => expect(screen.queryByText('Call the plumber about the leak')).not.toBeInTheDocument());
    });

    // ── (b) Dashboard delete: same confirm-gated handler ────────────────
    it('confirms before deleting a Dashboard item; Cancel keeps it, OK removes it', async () => {
        thoughtWeaverUserIdHolder.current = 'user-p3-2';
        appendLocalCapture({
            id: 'cap-2', text: 'Idea: skylight in the lobby', filed_to: 'ideas',
            confidence: 0.7, destination_name: null, createdAt: '2026-06-12T00:00:00.000Z',
        });

        render(withUser('user-p3-2', <ThoughtWeaver />));
        await waitFor(() => expect(screen.getByText('Idea: skylight in the lobby')).toBeInTheDocument());

        const dashboardTab = screen.getByRole('button', { name: /Dashboard/i });
        await act(async () => { dashboardTab.click(); });

        const itemCard = screen.getAllByText('Idea: skylight in the lobby')[0].closest('.tw-item-card') as HTMLElement;
        const deleteBtn = itemCard.querySelector('.tw-delete-btn') as HTMLButtonElement;
        expect(deleteBtn).toBeTruthy();
        // aria-label names the thought, matching the Recent-list pattern.
        expect(deleteBtn.getAttribute('aria-label')).toContain('Idea: skylight in the lobby');

        confirmSpy.mockReturnValueOnce(false);
        await act(async () => { deleteBtn.click(); });
        expect(screen.getAllByText('Idea: skylight in the lobby').length).toBeGreaterThan(0);

        confirmSpy.mockReturnValueOnce(true);
        await act(async () => { deleteBtn.click(); });
        await waitFor(() => expect(screen.queryAllByText('Idea: skylight in the lobby').length).toBe(0));
    });

    // MUTATION CHECK: removing the `if (ok) deleteLocalCapture(id);` guard in
    // `handleDeleteCapture` (deleting unconditionally, ignoring `confirm()`)
    // was manually verified to fail both "Cancel keeps it" assertions above
    // (2/5 tests red) before the guard was restored.

    // ── (c) result live region exists before any capture is made ────────
    it('renders the capture-result live region before a capture is made', async () => {
        thoughtWeaverUserIdHolder.current = 'user-p3-3';
        render(withUser('user-p3-3', <ThoughtWeaver />));
        await waitFor(() => expect(screen.getByPlaceholderText(/Drop a thought/i)).toBeInTheDocument());

        const statusRegions = screen.getAllByRole('status');
        expect(statusRegions.length).toBeGreaterThan(0);
        // The result region is empty (no result yet) but already mounted.
        const resultRegion = statusRegions.find(r => r.querySelector('.tw-result') === null);
        expect(resultRegion).toBeTruthy();

        // Capture (no LLM, no backend — falls through to local categorize).
        const textarea = screen.getByPlaceholderText(/Drop a thought/i);
        fireInput(textarea, 'Met Sam at the coffee shop');
        const captureBtn = document.querySelector('.tw-capture__btn') as HTMLButtonElement;
        await act(async () => { captureBtn.click(); });

        // The result now lands INSIDE a role=status region — same node the
        // screen reader already knew about, not a freshly-mounted one.
        await waitFor(() => {
            const region = screen.getAllByRole('status').find(r => r.querySelector('.tw-result'));
            expect(region).toBeTruthy();
        });
        const closeBtn = screen.getByRole('button', { name: 'Dismiss result' });
        expect(closeBtn).toBeTruthy();
    });

    // ── (d) Capture button carries aria-busy while classifying ──────────
    it('sets aria-busy on the Capture button while classification is in flight', async () => {
        mockIntegrations = { llm: { active: 'anthropic' } };
        thoughtWeaverUserIdHolder.current = 'user-p3-4';
        render(withUser('user-p3-4', <ThoughtWeaver />));

        const textarea = screen.getByPlaceholderText(/Drop a thought/i);
        fireInput(textarea, 'Need to file the permit');
        const captureBtn = document.querySelector('.tw-capture__btn') as HTMLButtonElement;
        expect(captureBtn.getAttribute('aria-busy')).toBe('false');

        await act(async () => { captureBtn.click(); });
        // The LLM promise is deliberately unresolved (deferred mock) — still busy.
        expect(captureBtn.getAttribute('aria-busy')).toBe('true');

        // Resolve so the test doesn't leak a pending state update.
        await act(async () => { resolveLlm?.({ text: JSON.stringify({ filed_to: 'admin', confidence: 0.9, destination_name: 'Permit' }) }); });
    });

    // ── (e) "Sync from captures" reports a visible, live count ──────────
    it('shows a visible sync-result message instead of only logging', async () => {
        thoughtWeaverUserIdHolder.current = 'user-p3-5';
        appendLocalCapture({
            id: 'cap-5', text: 'Call the plumber about the leak', filed_to: 'admin',
            confidence: 0.8, destination_name: null, createdAt: '2026-06-12T00:00:00.000Z',
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        render(withUser('user-p3-5', <ThoughtWeaver />));
        await waitFor(() => expect(screen.getByText('Call the plumber about the leak')).toBeInTheDocument());

        const todayTab = screen.getByRole('button', { name: /Today/i });
        await act(async () => { todayTab.click(); });

        const syncBtn = screen.getByTitle('Pull actionable items from your captures');
        await act(async () => { syncBtn.click(); });

        await waitFor(() => expect(screen.getByText(/to-do.*from captures/i)).toBeInTheDocument());
        expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('[ThoughtWeaver] Synced'));

        // Second click: nothing new to add.
        await act(async () => { syncBtn.click(); });
        await waitFor(() => expect(screen.getByText(/No new to-dos/i)).toBeInTheDocument());
    });
});

/** Fire a React-controlled textarea change (value setter + native event). */
function fireInput(el: HTMLElement, value: string) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
}
