/**
 * serverSpend — plan 068 Phase 3 (F1). Each test breaks the corresponding
 * piece of production logic when read against the comment above it
 * (mutation-check discipline per the plan).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
    useServerUsage,
    useSystemUsage,
    useBilling,
    _resetServerUsageForTests,
} from '../lib/serverSpend';
import { llmUsageUserIdHolder, useLlmUsage, lastNDays, _resetExternalDevicesForTests, resetLlmUsage, llmUsageStore } from '../lib/llmUsageStore';
import type { StoredLedgerV2 } from '../lib/llmUsageStore';

const getMock = vi.fn();

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: (...args: unknown[]) => getMock(...args),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

/** Local (not UTC) YYYY-MM-DD "today" — matches llmUsageStore's own `localDate()`. */
function localToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function serverPayload(estCost = 0.5): StoredLedgerV2 {
    const date = localToday();
    return {
        v: 2,
        clearedAt: 0,
        devices: {
            server: {
                entries: [{ ts: Date.now(), provider: 'openai', model: 'gpt-4o-mini', estIn: 100, estOut: 100, estCost, measured: true, source: 'brief' }],
                days: { [date]: { date, calls: 1, estIn: 100, estOut: 100, estCost, byProvider: { openai: { calls: 1, estCost } }, bySource: { brief: { calls: 1, estCost } } } },
            },
        },
    };
}

beforeEach(() => {
    getMock.mockReset();
    llmUsageUserIdHolder.current = 'user-a';
    try { localStorage.clear(); } catch { /* */ }
    resetLlmUsage();
    llmUsageStore.reset();
    _resetExternalDevicesForTests();
    _resetServerUsageForTests();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('should not be called by this test'))));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('useServerUsage', () => {
    it('404 / no object → null, never throws, never blocks the widget', async () => {
        getMock.mockResolvedValue(null);
        const { result } = renderHook(() => useServerUsage());
        await waitFor(() => expect(getMock).toHaveBeenCalledWith('llm-usage-server_user-a'));
        expect(result.current).toBeNull();
    });

    it('feeds a successful payload into llmUsageStore so useLlmUsage() totals include it', async () => {
        getMock.mockResolvedValue({ payload: serverPayload(0.75) });
        renderHook(() => useServerUsage());
        await waitFor(() => expect(lastNDays(1)[0].calls).toBe(1));
        expect(lastNDays(1)[0].estCost).toBeCloseTo(0.75, 5);
    });

    it('drops the response if the signed-in user changed while the fetch was in flight (never lets A render under B)', async () => {
        let resolveGet!: (v: unknown) => void;
        getMock.mockReturnValue(new Promise((res) => { resolveGet = res; }));
        renderHook(() => useServerUsage());
        await waitFor(() => expect(getMock).toHaveBeenCalled());

        llmUsageUserIdHolder.current = 'user-b'; // account switched mid-fetch
        await act(async () => {
            resolveGet({ payload: serverPayload(9) });
            await Promise.resolve();
        });

        expect(lastNDays(1)[0].calls).toBe(0); // A's response never landed
    });

    it('several mounted consumers share ONE underlying fetch', async () => {
        getMock.mockResolvedValue({ payload: serverPayload() });
        renderHook(() => useServerUsage());
        renderHook(() => useServerUsage());
        renderHook(() => useServerUsage());
        await waitFor(() => expect(lastNDays(1)[0].calls).toBe(1));
        expect(getMock).toHaveBeenCalledTimes(1);
    });
});

describe('useSystemUsage', () => {
    it('never fetches when not god', () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        renderHook(() => useSystemUsage(false));
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('fetches /api/ai-spend/system and parses the result when god', async () => {
        const fetchSpy = vi.fn((_url: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: serverPayload(1.2) }) }));
        vi.stubGlobal('fetch', fetchSpy);
        const { result } = renderHook(() => useSystemUsage(true));
        await waitFor(() => expect(result.current).not.toBeNull());
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/ai-spend/system');
        expect(result.current?.devices.server.entries).toHaveLength(1);
    });

    it('a non-OK response resolves to null, not a thrown error', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) })));
        const { result } = renderHook(() => useSystemUsage(true));
        await waitFor(() => expect(result.current).toBeNull());
    });
});

describe('useBilling', () => {
    it('non-god: renders empty state and never fetches', () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const { result } = renderHook(() => useBilling(false, '2026-09'));
        expect(result.current).toEqual({ data: null, loading: false, error: null });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('god: fetches the month and returns providers with billed/status', async () => {
        const body = { month: '2026-09', fetchedAt: new Date().toISOString(), providers: [
            { provider: 'anthropic', status: 'ok', billedUsd: 12.34 },
            { provider: 'openai', status: 'no-key', billedUsd: null },
        ] };
        vi.stubGlobal('fetch', vi.fn((url: string) => {
            expect(String(url)).toContain('month=2026-09');
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: body }) });
        }));
        const { result } = renderHook(() => useBilling(true, '2026-09'));
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBeNull();
        expect(result.current.data?.providers).toHaveLength(2);
        expect(result.current.data?.providers[1].status).toBe('no-key');
    });

    it('a 403 (individual/non-org account, no admin key) is treated as silent — data null, NO error banner', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) })));
        const { result } = renderHook(() => useBilling(true, '2026-09'));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it('a network failure surfaces a message (not a silent-forever loading state)', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
        const { result } = renderHook(() => useBilling(true, '2026-09'));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).not.toBeNull();
        expect(result.current.data).toBeNull();
    });
});
