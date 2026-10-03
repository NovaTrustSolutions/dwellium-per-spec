/**
 * GraphifyView — plan 072 Phase 1 (2026-09-28).
 *
 * Covers: honest status line (date + whole-day age, not a bare time),
 * the >7-day staleness notice, a status-fetch-failure line (instead of
 * silently claiming "Not built yet"), and the Rebuild POST. Render needs
 * no UserContext provider — the component does a raw useContext read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GraphifyView from '../components/KnowledgeGraph/GraphifyView';

vi.mock('../config', () => ({
    API_BASE: 'http://api.test',
}));

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function expectedDateLabel(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBody(data: Record<string, unknown>) {
    return {
        success: true,
        data: {
            built: false, building: false, nodes: 0, edges: 0, corpusFiles: 0,
            builtAt: null, lastError: null, ...data,
        },
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('GraphifyView — status line', () => {
    it('shows "Not built yet" when the graph has never been built', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, statusBody({}))));

        render(<GraphifyView />);

        await waitFor(() => expect(screen.getByText('Not built yet')).toBeInTheDocument());
    });

    it('shows node/edge/source counts + built date, no stale notice, when fresh (<7 days)', async () => {
        vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
        const builtAt = new Date('2026-09-25T12:00:00Z').toISOString(); // 3 days old
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (String(url).includes('/status')) {
                return jsonResponse(200, statusBody({ built: true, nodes: 72, edges: 38, corpusFiles: 34, builtAt }));
            }
            return jsonResponse(200, {}); // /view
        }));

        render(<GraphifyView />);

        await waitFor(() => expect(screen.getByText(/72 nodes/)).toBeInTheDocument());
        expect(screen.getByText(/38 edges/)).toBeInTheDocument();
        expect(screen.getByText(/34 sources/)).toBeInTheDocument();
        const dateLabel = expectedDateLabel(builtAt);
        expect(screen.getByText(new RegExp(`built ${dateLabel} \\(3 days ago\\)`))).toBeInTheDocument();
        expect(screen.queryByText(/days old — Rebuild/)).not.toBeInTheDocument();
    });

    it('shows the stale notice with the correct day count when built > 7 days ago', async () => {
        vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
        const builtAt = new Date('2026-06-12T12:00:00Z').toISOString(); // 108 days old
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (String(url).includes('/status')) {
                return jsonResponse(200, statusBody({ built: true, nodes: 72, edges: 38, corpusFiles: 34, builtAt }));
            }
            return jsonResponse(200, {}); // /view
        }));

        render(<GraphifyView />);

        await waitFor(() => expect(screen.getByText(/108 days old — Rebuild to include/)).toBeInTheDocument());
        const dateLabel = expectedDateLabel(builtAt);
        expect(screen.getByText(new RegExp(`built ${dateLabel} \\(108 days ago\\)`))).toBeInTheDocument();
    });

    it('shows a local error line (not "Not built yet") when /status fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

        render(<GraphifyView />);

        await waitFor(() => expect(screen.getByText("Couldn't reach the knowledge-graph service.")).toBeInTheDocument());
        expect(screen.queryByText('Not built yet')).not.toBeInTheDocument();
    });
});

describe('GraphifyView — Rebuild', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('POSTs /rebuild when the Rebuild button is clicked', async () => {
        const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
            const u = String(url);
            if (u.includes('/rebuild')) {
                return jsonResponse(200, { success: true, data: {} });
            }
            if (u.includes('/status')) {
                return jsonResponse(200, statusBody({}));
            }
            return jsonResponse(200, {});
        });
        vi.stubGlobal('fetch', fetchSpy);

        const { unmount } = render(<GraphifyView />);

        await waitFor(() => expect(screen.getByText('Not built yet')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /rebuild/i }));

        await waitFor(() => {
            const rebuildCall = fetchSpy.mock.calls.find(([url, init]) =>
                String(url).includes('/rebuild') && (init as RequestInit | undefined)?.method === 'POST');
            expect(rebuildCall).toBeTruthy();
        });

        unmount(); // clears the status-poll interval started by rebuild()
    });
});
