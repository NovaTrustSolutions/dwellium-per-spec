/**
 * TranscriptionHub banner vs System Health row — single shared probe (item 6 fix).
 *
 * Old behavior: TranscriptionHub decided `backendOffline` from
 * `fetch(`${API_TRANSCRIBE}/logs?limit=200`)`'s res.ok, while System Health's
 * "Transcription Hub" row (systemHealth.ts, via useSystemHealth's single
 * shared probeBackend(API_BASE) call hitting `${API_BASE}/health`) decided
 * its status from an entirely different endpoint. The two could — and did —
 * disagree for the same backend (e.g. /health up but /logs erroring, or
 * vice versa), so the app told the user two different things about the same
 * backend at the same time.
 *
 * Fix: TranscriptionHub now calls the exact same `probeBackend` from
 * systemHealth.ts (same endpoint, same res.ok success rule) that
 * useSystemHealth uses for every 'backend'-requiring row. This test drives
 * both consumers off one mocked fetch and asserts they always agree.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { probeBackend, resolveStatus, HEALTH_ITEMS } from '../lib/systemHealth';
import { API_BASE } from '../config';
import TranscriptionHub from '../components/TranscriptionHub/TranscriptionHub';

const OFFLINE_BANNER = /Backend transcription is offline/;
const transcriptionItem = HEALTH_ITEMS.find(i => i.id === 'transcription')!;

// jsdom doesn't implement scrollIntoView; TranscriptionHub's auto-scroll
// effect calls it unconditionally on mount. Test-environment polyfill only —
// no production code touched.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => { /* jsdom polyfill */ };
}

function stubFetch(healthOk: boolean) {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/health')) {
            return { ok: healthOk, json: async () => ({}) } as Response;
        }
        // Every other endpoint (logs, speakers, ...) — keep it a clean, inert
        // failure so this file stays focused on the /health parity question.
        return { ok: false, json: async () => ({}) } as Response;
    }));
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

describe('TranscriptionHub banner agrees with System Health for the same backend response', () => {
    it('backend healthy: System Health says "ok" and TranscriptionHub shows no offline banner', async () => {
        stubFetch(true);

        const backendOk = await probeBackend(API_BASE);
        const systemHealthStatus = resolveStatus(transcriptionItem, { backendOk, llmOk: false, externalOk: {} });
        expect(systemHealthStatus).toBe('ok');

        render(<TranscriptionHub />);
        // `waitFor` around a *negative* assertion (toBeNull()) is unsafe here:
        // backendOffline starts false, so "banner absent" is trivially true
        // before the async probe even resolves — it would pass even if the
        // banner popped in a tick later. Wait for a positive, unambiguous
        // signal that the probe settled first (fetch('/health') was called),
        // flush the resulting state update, then assert.
        await waitFor(() => {
            expect(vi.mocked(fetch).mock.calls.some(c => String(c[0]).includes('/health'))).toBe(true);
        });
        await act(async () => { await Promise.resolve(); });
        expect(screen.queryByText(OFFLINE_BANNER)).toBeNull();
    });

    it('backend down: System Health says "down" and TranscriptionHub shows the offline banner', async () => {
        stubFetch(false);

        const backendOk = await probeBackend(API_BASE);
        const systemHealthStatus = resolveStatus(transcriptionItem, { backendOk, llmOk: false, externalOk: {} });
        expect(systemHealthStatus).toBe('down');

        render(<TranscriptionHub />);
        expect(await screen.findByText(OFFLINE_BANNER)).toBeTruthy();
    });
});
