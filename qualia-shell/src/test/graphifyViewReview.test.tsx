import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import GraphifyView from '../components/KnowledgeGraph/GraphifyView';

/**
 * Plan 072 P1 review — GraphifyView must not start its Rebuild status poll after it
 * unmounted (account switch remounts it by user id) nor print an invalid build date.
 * Fake timers are needed here: the component's own setInterval must be advanced.
 */
describe('GraphifyView rebuild poll vs unmount', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('leaves no interval running (and issues no further /status polls) after unmount during the in-flight POST /rebuild', async () => {
        let resolveRebuildFetch: (v: Response) => void = () => {};
        const statusCalls: string[] = [];

        const fetchMock = vi.fn((url: string, init?: RequestInit) => {
            const u = String(url);
            if (u.includes('/status')) {
                statusCalls.push(u);
                return Promise.resolve(new Response(JSON.stringify({ success: true, data: { built: false, building: false, nodes: 0, edges: 0, corpusFiles: 0, builtAt: null, lastError: null } })));
            }
            if (u.includes('/rebuild') && init?.method === 'POST') {
                return new Promise((resolve) => { resolveRebuildFetch = resolve; });
            }
            if (u.includes('/view')) {
                return Promise.resolve(new Response('', { status: 404 }));
            }
            return Promise.resolve(new Response('{}'));
        });
        vi.stubGlobal('fetch', fetchMock);

        const { getByTitle, unmount } = render(<GraphifyView />);
        // flush the initial loadStatus() call from mount
        await vi.runOnlyPendingTimersAsync();

        const rebuildBtn = getByTitle(/Re-export your memories/i);
        fireEvent.click(rebuildBtn);
        // rebuild() is now awaiting the POST /rebuild promise — unmount BEFORE it resolves,
        // exactly like an account switch (key={uid} remount) or navigating away mid-click.
        unmount();

        const statusCallsBeforeResolve = statusCalls.length;

        // Now let the POST /rebuild resolve AFTER unmount — if pollRef.current was
        // assigned after the unmount-cleanup already ran, this setInterval is never
        // cleared: it silently calls setState on an unmounted component forever and
        // keeps hitting the backend every 2s.
        resolveRebuildFetch(new Response(JSON.stringify({ success: true })));
        await vi.advanceTimersByTimeAsync(2100);
        await vi.advanceTimersByTimeAsync(2100);
        await vi.advanceTimersByTimeAsync(2100);

        const statusCallsAfterResolve = statusCalls.length;

        expect(
            statusCallsAfterResolve,
            `expected no further /status polls after unmount (leak: interval fired ${statusCallsAfterResolve - statusCallsBeforeResolve} more times)`
        ).toBe(statusCallsBeforeResolve);
    });
});

describe('GraphifyView rebuild still polls under StrictMode (mount/unmount/mount)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('the alive guard is true again after the dev double-mount', async () => {
        let statusCalls = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            const u = String(url);
            if (u.includes('/status')) { statusCalls++; return new Response(JSON.stringify({ success: true, data: { built: false, building: true, nodes: 0, edges: 0, corpusFiles: 0, builtAt: null, lastError: null } })); }
            if (u.includes('/rebuild') && init?.method === 'POST') return new Response(JSON.stringify({ success: true }));
            return new Response('', { status: 404 });
        }));
        const { getByTitle } = render(<StrictMode><GraphifyView /></StrictMode>);
        await vi.runOnlyPendingTimersAsync();
        fireEvent.click(getByTitle(/Re-export your memories/i));
        await vi.advanceTimersByTimeAsync(0);
        const before = statusCalls;
        await vi.advanceTimersByTimeAsync(4200);
        expect(statusCalls - before).toBeGreaterThanOrEqual(2);
    });
});

describe('GraphifyView build date edge', () => {
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

    it('an unparsable builtAt shows no "Invalid Date"/"NaN" and no stale notice', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(String(url).includes('/status')
            ? JSON.stringify({ success: true, data: { built: true, building: false, nodes: 3, edges: 1, corpusFiles: 1, builtAt: 'not-a-date', lastError: null } })
            : '', { status: String(url).includes('/status') ? 200 : 404 })));
        const { findByText, container } = render(<GraphifyView />);
        await findByText(/3 nodes/);
        expect(container.textContent).not.toMatch(/Invalid Date|NaN/);
        expect(container.textContent).not.toMatch(/days old/);
    });
});
